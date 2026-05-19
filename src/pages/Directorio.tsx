import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import {
  BookUser, Search, Pencil, X, Phone, Mail,
  MapPin, Building2, User, Users, ChevronDown, ChevronUp,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

interface Colegio {
  id: string;
  codigo: string;
  nombre: string;
  territorio: string;
  nombre_oficial: string;
  rfc: string;
  dir_fiscal: string;
  dir_fisica: string;
  telefonos: string;
  dir_nombre: string;
  dir_correo: string;
  dir_tel_movil: string;
  dir_tel_red: string;
  adm_nombre: string;
  adm_correo: string;
  adm_tel_movil: string;
  adm_tel_red: string;
  car_nombre: string;
  car_correo: string;
  car_tel_movil: string;
  geo_nombre: string;
  geo_correo: string;
  geo_tel_movil: string;
  leo_nombre: string;
  leo_correo: string;
  leo_tel_movil: string;
  updated_at?: string;
}

const TERR_STYLE: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  NORTE:  { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    dot: 'bg-blue-500'   },
  MEXICO: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  FMA:    { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700',  dot: 'bg-violet-500' },
};

const labelCls = 'text-[10px] font-bold text-slate-400 uppercase tracking-wider';
const inputCls = 'w-full px-2 py-1.5 border border-slate-300 text-sm rounded-md focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white';

// ─── Small contact row ───────────────────────────────────────────────────────
function CRow({ icon: Icon, label, value, email, phone }: {
  icon: React.ElementType; label?: string; value?: string; email?: boolean; phone?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-1.5 text-xs">
      <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
      <span>
        {label && <span className="text-slate-400">{label}: </span>}
        {email ? (
          <a href={`mailto:${value}`} className="text-blue-600 hover:underline break-all">{value}</a>
        ) : phone ? (
          <a href={`tel:${value}`} className="text-slate-700">{value}</a>
        ) : (
          <span className="text-slate-700">{value}</span>
        )}
      </span>
    </div>
  );
}

// ─── Section header inside expanded card ────────────────────────────────────
function SectionHeader({ emoji, title }: { emoji: string; title: string }) {
  return (
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
      <span>{emoji}</span> {title}
    </p>
  );
}

// ─── EditSection fuera del componente para evitar re-mounts al escribir ────
interface EditSectionProps {
  title: string;
  fields: { k: keyof Colegio; label: string; full?: boolean; area?: boolean }[];
  editForm: Partial<Colegio>;
  onSet: (k: keyof Colegio, v: string) => void;
}
function EditSection({ title, fields, editForm, onSet }: EditSectionProps) {
  return (
    <section>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 pb-1 border-b">{title}</p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(f => (
          <div key={f.k as string} className={f.full || f.area ? 'col-span-2' : ''}>
            <label className={labelCls}>{f.label}</label>
            {f.area ? (
              <textarea
                className={inputCls + ' resize-none min-h-[52px]'}
                value={(editForm as any)[f.k] ?? ''}
                onChange={e => onSet(f.k, e.target.value)}
              />
            ) : (
              <input
                className={inputCls}
                value={(editForm as any)[f.k] ?? ''}
                onChange={e => onSet(f.k, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Directorio() {
  const { user } = useAuth();
  const isAdmin = user?.user_metadata?.role === 'admin';
  const qc = useQueryClient();

  const [search, setSearch]         = useState('');
  const [territorio, setTerritorio] = useState('todos');
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [editModal, setEditModal]   = useState<Colegio | null>(null);
  const [editForm, setEditForm]     = useState<Partial<Colegio>>({});
  const [saving, setSaving]         = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const { data: colegios = [], isLoading } = useQuery({
    queryKey: ['directorio'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('directorio')
        .select('*')
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as Colegio[];
    },
  });

  const filtered = useMemo(() => {
    return colegios.filter(c => {
      const matchTerr = territorio === 'todos' || c.territorio === territorio;
      const q = search.toLowerCase();
      const matchSearch = !q
        || c.nombre.toLowerCase().includes(q)
        || c.dir_nombre?.toLowerCase().includes(q)
        || c.adm_nombre?.toLowerCase().includes(q)
        || c.rfc?.toLowerCase().includes(q);
      return matchTerr && matchSearch;
    });
  }, [colegios, territorio, search]);

  const counts = useMemo(() => ({
    NORTE:  colegios.filter(c => c.territorio === 'NORTE').length,
    MEXICO: colegios.filter(c => c.territorio === 'MEXICO').length,
    FMA:    colegios.filter(c => c.territorio === 'FMA').length,
  }), [colegios]);

  // ── Edit handlers ────────────────────────────────────────────────────────
  const handleEdit = (c: Colegio) => { setEditModal(c); setEditForm({ ...c }); };
  const set = (k: keyof Colegio, v: string) => setEditForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('directorio')
        .update({ ...editForm, updated_at: new Date().toISOString() })
        .eq('id', editModal.id);
      if (error) throw error;
      // Actualizar cache local inmediatamente para reflejar cambios en las tarjetas
      qc.setQueryData<Colegio[]>(['directorio'], prev =>
        (prev ?? []).map(c => c.id === editModal.id ? { ...c, ...editForm } : c)
      );
      await qc.invalidateQueries({ queryKey: ['directorio'] });
      setEditModal(null);
      toast.success('Directorio actualizado');
    } catch (e: any) {
      toast.error(e.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-7xl mx-auto p-4 space-y-5">
      <PageHeader
        title="Directorio de Colegios"
        subtitle="Contactos institucionales de la Red Mano Amiga"
        icon={<BookUser className="w-5 h-5" />}
      />

      {/* ── Buscador + filtros ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white"
            placeholder="Buscar colegio, director, administrador…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { k: 'todos',  label: `Todos (${colegios.length})` },
            { k: 'NORTE',  label: `Norte (${counts.NORTE})` },
            { k: 'MEXICO', label: `México (${counts.MEXICO})` },
            { k: 'FMA',    label: `FMA (${counts.FMA})` },
          ].map(t => (
            <button key={t.k} onClick={() => setTerritorio(t.k)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition
                ${territorio === t.k
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cards grid ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Cargando directorio…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <BookUser className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">No se encontraron resultados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(c => {
            const ts = TERR_STYLE[c.territorio] ?? TERR_STYLE.FMA;
            const isOpen = expanded === c.id;
            return (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

                {/* Territory bar */}
                <div className={`${ts.bg} px-4 py-2 flex items-center justify-between border-b ${ts.border}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${ts.dot}`} />
                    <span className={`text-xs font-bold ${ts.text} uppercase tracking-wide`}>{c.territorio}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-500 font-mono">{c.codigo}</span>
                  </div>
                  {isAdmin && (
                    <button onClick={() => handleEdit(c)}
                      title="Editar"
                      className="p-1.5 rounded hover:bg-white/70 transition text-slate-400 hover:text-slate-800">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Main content */}
                <div className="p-4">
                  <h3 className="text-base font-black text-slate-900 leading-tight">{c.nombre}</h3>
                  {c.nombre_oficial && (
                    <p className="text-xs text-slate-400 mt-0.5 leading-tight">{c.nombre_oficial}</p>
                  )}
                  {c.rfc && (
                    <p className="text-xs font-mono text-slate-400 mt-0.5">RFC: {c.rfc}</p>
                  )}

                  {/* Director + Admin mini cards */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {c.dir_nombre && (
                      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                        <p className={labelCls}>Director</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5 leading-tight">{c.dir_nombre}</p>
                        {c.dir_correo && (
                          <a href={`mailto:${c.dir_correo}`}
                            className="text-[10px] text-blue-600 hover:underline block truncate mt-0.5">
                            {c.dir_correo}
                          </a>
                        )}
                        {c.dir_tel_movil && (
                          <a href={`tel:${c.dir_tel_movil}`}
                            className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5" />{c.dir_tel_movil}
                          </a>
                        )}
                      </div>
                    )}
                    {c.adm_nombre && (
                      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                        <p className={labelCls}>Administrador</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5 leading-tight">{c.adm_nombre}</p>
                        {c.adm_correo && (
                          <a href={`mailto:${c.adm_correo}`}
                            className="text-[10px] text-blue-600 hover:underline block truncate mt-0.5">
                            {c.adm_correo}
                          </a>
                        )}
                        {c.adm_tel_movil && (
                          <a href={`tel:${c.adm_tel_movil}`}
                            className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5" />{c.adm_tel_movil}
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpanded(prev => prev === c.id ? null : c.id)}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition">
                    {isOpen ? <><ChevronUp className="w-3.5 h-3.5" /> Ocultar contactos</> : <><ChevronDown className="w-3.5 h-3.5" /> Ver todos los contactos</>}
                  </button>

                  {/* ── Expanded details ─────────────────────────────── */}
                  {isOpen && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3.5">

                      {/* Datos del colegio */}
                      {(c.dir_fisica || c.dir_fiscal || c.telefonos) && (
                        <div>
                          <SectionHeader emoji="📍" title="Datos del Colegio" />
                          <div className="space-y-1 pl-1">
                            <CRow icon={MapPin} label="Dir. Física" value={c.dir_fisica} />
                            {c.dir_fiscal && c.dir_fiscal !== c.dir_fisica && (
                              <CRow icon={Building2} label="Dir. Fiscal" value={c.dir_fiscal} />
                            )}
                            <CRow icon={Phone} label="Teléfonos" value={c.telefonos} phone />
                          </div>
                        </div>
                      )}

                      {/* Director */}
                      {c.dir_nombre && (
                        <div>
                          <SectionHeader emoji="👤" title="Director" />
                          <div className="space-y-1 pl-1">
                            <CRow icon={User}  value={c.dir_nombre} />
                            <CRow icon={Mail}  value={c.dir_correo}    email />
                            <CRow icon={Phone} label="Móvil" value={c.dir_tel_movil} phone />
                            <CRow icon={Phone} label="Red"   value={c.dir_tel_red}   phone />
                          </div>
                        </div>
                      )}

                      {/* Administrador */}
                      {c.adm_nombre && (
                        <div>
                          <SectionHeader emoji="👥" title="Administrador" />
                          <div className="space-y-1 pl-1">
                            <CRow icon={Users} value={c.adm_nombre} />
                            <CRow icon={Mail}  value={c.adm_correo}    email />
                            <CRow icon={Phone} label="Móvil" value={c.adm_tel_movil} phone />
                            <CRow icon={Phone} label="Red"   value={c.adm_tel_red}   phone />
                          </div>
                        </div>
                      )}

                      {/* CAR */}
                      {c.car_nombre && (
                        <div>
                          <SectionHeader emoji="🗂️" title="CAR" />
                          <div className="space-y-1 pl-1">
                            <CRow icon={User}  value={c.car_nombre} />
                            <CRow icon={Mail}  value={c.car_correo}    email />
                            <CRow icon={Phone} label="Móvil" value={c.car_tel_movil} phone />
                          </div>
                        </div>
                      )}

                      {/* ECO */}
                      {(c.geo_nombre || c.leo_nombre) && (
                        <div>
                          <SectionHeader emoji="🏗️" title="Equipo ECO" />
                          <div className="space-y-2.5 pl-1">
                            {c.geo_nombre && (
                              <div>
                                <p className="text-[10px] font-semibold text-slate-500 mb-1">Gerente de Operaciones</p>
                                <div className="space-y-1">
                                  <CRow icon={User}  value={c.geo_nombre} />
                                  <CRow icon={Mail}  value={c.geo_correo}    email />
                                  <CRow icon={Phone} label="Móvil" value={c.geo_tel_movil} phone />
                                </div>
                              </div>
                            )}
                            {c.leo_nombre && (
                              <div>
                                <p className="text-[10px] font-semibold text-slate-500 mb-1">Líder de Proyecto</p>
                                <div className="space-y-1">
                                  <CRow icon={User}  value={c.leo_nombre} />
                                  <CRow icon={Mail}  value={c.leo_correo}    email />
                                  <CRow icon={Phone} label="Móvil" value={c.leo_tel_movil} phone />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ Edit Modal ═════════════════════════════════════════════════════ */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-6">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-white rounded-t-xl sticky top-0 z-10">
              <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-slate-500" />
                Editar — {editModal.nombre}
              </h2>
              <button onClick={() => setEditModal(null)} className="p-1 rounded hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-5 overflow-y-auto max-h-[72vh]">
              <EditSection title="📍 Datos del Colegio" editForm={editForm} onSet={set} fields={[
                { k: 'nombre',         label: 'Nombre',           full: true },
                { k: 'nombre_oficial', label: 'Nombre Oficial',   full: true },
                { k: 'rfc',            label: 'RFC' },
                { k: 'telefonos',      label: 'Teléfonos Fijos' },
                { k: 'dir_fisica',     label: 'Dirección Física', full: true, area: true },
                { k: 'dir_fiscal',     label: 'Dirección Fiscal', full: true, area: true },
              ]} />

              <EditSection title="👤 Director" editForm={editForm} onSet={set} fields={[
                { k: 'dir_nombre',    label: 'Nombre',     full: true },
                { k: 'dir_correo',    label: 'Correo',     full: true },
                { k: 'dir_tel_movil', label: 'Tel. Móvil' },
                { k: 'dir_tel_red',   label: 'Tel. Red'   },
              ]} />

              <EditSection title="👥 Administrador" editForm={editForm} onSet={set} fields={[
                { k: 'adm_nombre',    label: 'Nombre',     full: true },
                { k: 'adm_correo',    label: 'Correo',     full: true },
                { k: 'adm_tel_movil', label: 'Tel. Móvil' },
                { k: 'adm_tel_red',   label: 'Tel. Red'   },
              ]} />

              <EditSection title="🗂️ CAR" editForm={editForm} onSet={set} fields={[
                { k: 'car_nombre',    label: 'Nombre', full: true },
                { k: 'car_correo',    label: 'Correo', full: true },
                { k: 'car_tel_movil', label: 'Tel. Móvil' },
              ]} />

              <EditSection title="🏗️ Gerente de Op. ECO" editForm={editForm} onSet={set} fields={[
                { k: 'geo_nombre',    label: 'Nombre', full: true },
                { k: 'geo_correo',    label: 'Correo', full: true },
                { k: 'geo_tel_movil', label: 'Tel. Móvil' },
              ]} />

              <EditSection title="🏗️ Líder de Proyecto ECO" editForm={editForm} onSet={set} fields={[
                { k: 'leo_nombre',    label: 'Nombre', full: true },
                { k: 'leo_correo',    label: 'Correo', full: true },
                { k: 'leo_tel_movil', label: 'Tel. Móvil' },
              ]} />
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-5 py-4 border-t bg-slate-50 rounded-b-xl">
              <button onClick={() => setEditModal(null)}
                className="flex-1 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition">
                {saving ? 'Guardando…' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
