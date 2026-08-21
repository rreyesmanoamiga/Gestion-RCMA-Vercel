import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import {
  BookUser, Search, Pencil, Trash2, X, Phone, Mail,
  MapPin, Building2, User, Users, ChevronDown, AlertTriangle,
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
  gjo_nombre: string;
  gjo_correo: string;
  gjo_tel_movil: string;
  ljo_nombre: string;
  ljo_correo: string;
  ljo_tel_movil: string;
  sociedad: string;
  centro_gestor: string;
  contador_nombre: string;
  contador_correo: string;
  gerente_nombre: string;
  gerente_correo: string;
  gerente_tel_movil: string;
  director_nacional_nombre: string;
  director_nacional_correo: string;
  director_nacional_tel_movil: string;
  niveles?: string[]; // Preescolar, Primaria, Secundaria, Preparatoria
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
  const [viewModal, setViewModal]   = useState<Colegio | null>(null);
  const [editModal, setEditModal]   = useState<Colegio | null>(null);
  const [editForm, setEditForm]     = useState<Partial<Colegio>>({});
  const [editNiveles, setEditNiveles] = useState<string[]>([]);
  const [saving, setSaving]         = useState(false);
  const [deleteId, setDeleteId]     = useState<{ id: string; nombre: string } | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const NIVELES_OPCIONES = ['Preescolar', 'Primaria', 'Secundaria', 'Preparatoria'];
  const NIVELES_COLOR: Record<string, string> = {
    Preescolar:   'bg-pink-100 text-pink-700 border-pink-200',
    Primaria:     'bg-blue-100 text-blue-700 border-blue-200',
    Secundaria:   'bg-amber-100 text-amber-700 border-amber-200',
    Preparatoria: 'bg-purple-100 text-purple-700 border-purple-200',
  };
  const esColegio = (c: Colegio) => !['FMA','FIA','AUN'].includes(c.territorio);

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
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('directorio').delete().eq('id', deleteId.id);
      if (error) throw error;
      qc.setQueryData<Colegio[]>(['directorio'], prev =>
        (prev ?? []).filter(c => c.id !== deleteId.id)
      );
      toast.success(`"${deleteId.nombre}" eliminado del directorio`);
      setDeleteId(null);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = (c: Colegio) => {
    setEditModal(c);
    setEditForm({ ...c });
    setEditNiveles(Array.isArray(c.niveles) ? c.niveles : []);
  };
  const set = (k: keyof Colegio, v: string) => setEditForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      const updateData = { ...editForm, niveles: editNiveles, updated_at: new Date().toISOString() };
      const { error } = await supabase
        .from('directorio')
        .update(updateData)
        .eq('id', editModal.id);
      if (error) throw error;
      qc.setQueryData<Colegio[]>(['directorio'], prev =>
        (prev ?? []).map(c => c.id === editModal.id ? { ...c, ...editForm, niveles: editNiveles } : c)
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
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(c)}
                        title="Editar"
                        className="p-1.5 rounded hover:bg-white/70 transition text-slate-400 hover:text-slate-800">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteId({ id: c.id, nombre: c.nombre })}
                        title="Eliminar"
                        className="p-1.5 rounded hover:bg-red-100 transition text-slate-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
                    {c.codigo === 'GENERAL' && c.gerente_nombre && (
                      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                        <p className={labelCls}>Gerente</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5 leading-tight">{c.gerente_nombre}</p>
                        {c.gerente_correo && (
                          <a href={`mailto:${c.gerente_correo}`}
                            className="text-[10px] text-blue-600 hover:underline block truncate mt-0.5">
                            {c.gerente_correo}
                          </a>
                        )}
                        {c.gerente_tel_movil && (
                          <a href={`tel:${c.gerente_tel_movil}`}
                            className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5" />{c.gerente_tel_movil}
                          </a>
                        )}
                      </div>
                    )}
                    {c.codigo === 'GENERAL' && c.director_nacional_nombre && (
                      <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                        <p className={labelCls}>Director Nacional</p>
                        <p className="text-xs font-semibold text-slate-800 mt-0.5 leading-tight">{c.director_nacional_nombre}</p>
                        {c.director_nacional_correo && (
                          <a href={`mailto:${c.director_nacional_correo}`}
                            className="text-[10px] text-blue-600 hover:underline block truncate mt-0.5">
                            {c.director_nacional_correo}
                          </a>
                        )}
                        {c.director_nacional_tel_movil && (
                          <a href={`tel:${c.director_nacional_tel_movil}`}
                            className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5" />{c.director_nacional_tel_movil}
                          </a>
                        )}
                      </div>
                    )}
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
                        {c.dir_tel_red && (
                          <a href={`tel:${c.dir_tel_red}`}
                            className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5" />{c.dir_tel_red}
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
                        {c.adm_tel_red && (
                          <a href={`tel:${c.adm_tel_red}`}
                            className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5" />{c.adm_tel_red}
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Niveles educativos — solo colegios */}
                  {esColegio(c) && Array.isArray(c.niveles) && c.niveles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {c.niveles.map(n => (
                        <span key={n} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${NIVELES_COLOR[n] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {esColegio(c) && (!c.niveles || c.niveles.length === 0) && (
                    <p className="text-[10px] text-slate-400 mt-2 italic">Sin niveles registrados</p>
                  )}

                  {/* View all contacts button */}
                  <button
                    onClick={() => setViewModal(c)}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition">
                    <ChevronDown className="w-3.5 h-3.5" /> Ver todos los contactos
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══ View Modal (todos los contactos) ══════════════════════════════ */}
      {viewModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setViewModal(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-6">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-white rounded-t-xl sticky top-0 z-10">
              <div>
                <h2 className="text-base font-black text-slate-800">{viewModal.nombre}</h2>
                {viewModal.nombre_oficial && (
                  <p className="text-xs text-slate-400 mt-0.5">{viewModal.nombre_oficial}</p>
                )}
              </div>
              <button onClick={() => setViewModal(null)} className="p-1 rounded hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-5">

              {/* Datos del colegio */}
              {(viewModal.dir_fisica || viewModal.dir_fiscal || viewModal.telefonos || viewModal.rfc) && (
                <div>
                  <SectionHeader emoji="📍" title="Datos del Colegio" />
                  <div className="space-y-1 pl-1">
                    {viewModal.rfc && <CRow icon={Building2} label="RFC" value={viewModal.rfc} />}
                    <CRow icon={MapPin}    label="Dir. Física" value={viewModal.dir_fisica} />
                    {viewModal.dir_fiscal && viewModal.dir_fiscal !== viewModal.dir_fisica && (
                      <CRow icon={Building2} label="Dir. Fiscal" value={viewModal.dir_fiscal} />
                    )}
                    <CRow icon={Phone} label="Teléfonos" value={viewModal.telefonos} phone />
                  </div>
                </div>
              )}

              {/* Grid de contactos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Gerente + Director Nacional (solo fila GENERAL) */}
                {viewModal.codigo === 'GENERAL' && viewModal.gerente_nombre && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <SectionHeader emoji="🏛️" title="Gerente" />
                    <div className="space-y-1 pl-1">
                      <CRow icon={User}  value={viewModal.gerente_nombre} />
                      <CRow icon={Mail}  value={viewModal.gerente_correo} email />
                      <CRow icon={Phone} label="Móvil" value={viewModal.gerente_tel_movil} phone />
                    </div>
                  </div>
                )}
                {viewModal.codigo === 'GENERAL' && viewModal.director_nacional_nombre && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <SectionHeader emoji="🏛️" title="Director Nacional" />
                    <div className="space-y-1 pl-1">
                      <CRow icon={User}  value={viewModal.director_nacional_nombre} />
                      <CRow icon={Mail}  value={viewModal.director_nacional_correo} email />
                      <CRow icon={Phone} label="Móvil" value={viewModal.director_nacional_tel_movil} phone />
                    </div>
                  </div>
                )}

                {/* Director */}
                {viewModal.dir_nombre && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <SectionHeader emoji="👤" title="Director" />
                    <div className="space-y-1 pl-1">
                      <CRow icon={User}  value={viewModal.dir_nombre} />
                      <CRow icon={Mail}  value={viewModal.dir_correo}    email />
                      <CRow icon={Phone} label="Móvil" value={viewModal.dir_tel_movil} phone />
                      <CRow icon={Phone} label="Red"   value={viewModal.dir_tel_red}   phone />
                    </div>
                  </div>
                )}

                {/* Administrador */}
                {viewModal.adm_nombre && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <SectionHeader emoji="👥" title="Administrador" />
                    <div className="space-y-1 pl-1">
                      <CRow icon={Users} value={viewModal.adm_nombre} />
                      <CRow icon={Mail}  value={viewModal.adm_correo}    email />
                      <CRow icon={Phone} label="Móvil" value={viewModal.adm_tel_movil} phone />
                      <CRow icon={Phone} label="Red"   value={viewModal.adm_tel_red}   phone />
                    </div>
                  </div>
                )}

                {/* CAR */}
                {viewModal.car_nombre && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <SectionHeader emoji="🗂️" title="CAR" />
                    <div className="space-y-1 pl-1">
                      <CRow icon={User}  value={viewModal.car_nombre} />
                      <CRow icon={Mail}  value={viewModal.car_correo}    email />
                      <CRow icon={Phone} label="Móvil" value={viewModal.car_tel_movil} phone />
                    </div>
                  </div>
                )}

                {/* Gerente de Operaciones ECO */}
                {viewModal.geo_nombre && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <SectionHeader emoji="🏗️" title="Gerente de Op. ECO" />
                    <div className="space-y-1 pl-1">
                      <CRow icon={User}  value={viewModal.geo_nombre} />
                      <CRow icon={Mail}  value={viewModal.geo_correo}    email />
                      <CRow icon={Phone} label="Móvil" value={viewModal.geo_tel_movil} phone />
                    </div>
                  </div>
                )}

                {/* Líder de Proyecto ECO */}
                {viewModal.leo_nombre && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <SectionHeader emoji="🏗️" title="Líder de Proyecto ECO" />
                    <div className="space-y-1 pl-1">
                      <CRow icon={User}  value={viewModal.leo_nombre} />
                      <CRow icon={Mail}  value={viewModal.leo_correo}    email />
                      <CRow icon={Phone} label="Móvil" value={viewModal.leo_tel_movil} phone />
                    </div>
                  </div>
                )}

                {/* Gerente Jurídico OR-SER */}
                {viewModal.gjo_nombre && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <SectionHeader emoji="⚖️" title="Gerente Jurídico OR-SER" />
                    <div className="space-y-1 pl-1">
                      <CRow icon={User}  value={viewModal.gjo_nombre} />
                      <CRow icon={Mail}  value={viewModal.gjo_correo}    email />
                      <CRow icon={Phone} label="Móvil" value={viewModal.gjo_tel_movil} phone />
                    </div>
                  </div>
                )}

                {/* Líder Jurídico OR-SER */}
                {viewModal.ljo_nombre && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <SectionHeader emoji="⚖️" title="Líder Jurídico OR-SER" />
                    <div className="space-y-1 pl-1">
                      <CRow icon={User}  value={viewModal.ljo_nombre} />
                      <CRow icon={Mail}  value={viewModal.ljo_correo}    email />
                      <CRow icon={Phone} label="Móvil" value={viewModal.ljo_tel_movil} phone />
                    </div>
                  </div>
                )}

              </div>

              {/* Niveles educativos en el view modal */}
              {esColegio(viewModal) && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">🎓 Niveles Educativos</p>
                  {Array.isArray(viewModal.niveles) && viewModal.niveles.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {viewModal.niveles.map(n => (
                        <span key={n} className={`text-sm font-semibold px-3 py-1 rounded-full border ${NIVELES_COLOR[n] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {n}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic">Sin niveles registrados</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t bg-slate-50 rounded-b-xl flex justify-end">
              {isAdmin && (
                <button onClick={() => { setViewModal(null); handleEdit(viewModal); }}
                  className="mr-3 px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
              )}
              <button onClick={() => setViewModal(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition">
                Cerrar
              </button>
            </div>
          </div>
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

              <EditSection title="💰 Datos Fiscales / Administrativos" editForm={editForm} onSet={set} fields={[
                { k: 'sociedad',        label: 'Sociedad' },
                { k: 'centro_gestor',   label: 'Centro Gestor' },
                { k: 'contador_nombre', label: 'Contador' },
                { k: 'contador_correo', label: 'Correo del Contador' },
              ]} />

              {editModal.codigo === 'GENERAL' && (
                <EditSection title="🏛️ Roles Federación Mano Amiga" editForm={editForm} onSet={set} fields={[
                  { k: 'gerente_nombre',                label: 'Gerente — Nombre', full: true },
                  { k: 'gerente_correo',                label: 'Gerente — Correo', full: true },
                  { k: 'gerente_tel_movil',              label: 'Gerente — Tel. Móvil' },
                  { k: 'director_nacional_nombre',       label: 'Director Nacional — Nombre', full: true },
                  { k: 'director_nacional_correo',       label: 'Director Nacional — Correo', full: true },
                  { k: 'director_nacional_tel_movil',    label: 'Director Nacional — Tel. Móvil' },
                ]} />
              )}

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

              <EditSection title="⚖️ Gerente Jurídico OR-SER" editForm={editForm} onSet={set} fields={[
                { k: 'gjo_nombre',    label: 'Nombre', full: true },
                { k: 'gjo_correo',    label: 'Correo', full: true },
                { k: 'gjo_tel_movil', label: 'Tel. Móvil' },
              ]} />

              <EditSection title="⚖️ Líder Jurídico OR-SER" editForm={editForm} onSet={set} fields={[
                { k: 'ljo_nombre',    label: 'Nombre', full: true },
                { k: 'ljo_correo',    label: 'Correo', full: true },
                { k: 'ljo_tel_movil', label: 'Tel. Móvil' },
              ]} />

              {/* Niveles educativos — solo colegios */}
              {editModal && esColegio(editModal) && (
                <div className="border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-3">🎓 Niveles Educativos</p>
                  <div className="grid grid-cols-2 gap-2">
                    {NIVELES_OPCIONES.map(nivel => (
                      <label key={nivel}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                          editNiveles.includes(nivel)
                            ? NIVELES_COLOR[nivel] + ' border-current'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}>
                        <input
                          type="checkbox"
                          checked={editNiveles.includes(nivel)}
                          onChange={e => setEditNiveles(prev =>
                            e.target.checked ? [...prev, nivel] : prev.filter(n => n !== nivel)
                          )}
                          className="rounded w-4 h-4 shrink-0"
                        />
                        <span className="text-sm font-semibold">{nivel}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
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

      {/* ── Modal confirmar eliminar ────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">¿Eliminar registro?</h2>
                <p className="text-xs text-slate-500 mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Se eliminará permanentemente el registro de
              <span className="font-bold text-slate-900"> {deleteId.nombre}</span> del directorio.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors">
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
