import React, { useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClockAlert, ChevronDown, Pencil, Trash2, X, Save, Calendar, Link2, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import PriorityBadge from '@/components/shared/PriorityBadge';
import ColegioSelector from '@/components/shared/ColegioSelector';
import { COLEGIOS, TERRITORIOS } from '@/lib/colegios';

const PAGE_SIZE = 20;

const inputClass  = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const labelClass  = "block text-xs font-bold text-slate-500 uppercase mb-1";
const selectClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700";

const TIPOS_PROYECTO = ['MEJORA', 'CONSTRUCCIÓN', 'REMODELACIÓN', 'ADECUACIÓN', 'MANTENIMIENTO', 'PORTAFOLIO', 'GARANTÍAS', 'REVISIÓN'];
const ASIGNACIONES   = ['MANO AMIGA SERVICIOS', 'MA COLEGIO', 'PROVEEDOR', 'ECO', 'JURÍDICO', 'INMOBILIARIA', 'RECAUDACIÓN'];
const ESTATUSES      = ['pendiente', 'en_progreso', 'completado', 'pausado'];
const PRIORIDADES    = ['baja', 'media', 'alta', 'urgente'];

const ESTATUS_LABEL: Record<string, string> = {
  pendiente:   'Pendiente',
  en_progreso: 'En Progreso',
  completado:  'Completado',
  pausado:     'Pausado',
};

interface Pendiente {
  id:                   string;
  territorio?:          string;
  colegio?:             string;
  nombre_proyecto?:     string;
  tipo_proyecto?:       string;
  prioridad?:           string;
  asignacion?:          string;
  eco?:                 string;
  estatus?:             string;
  fecha_actualizacion?: string;
  notas?:               string;
  created_at?:          string;
  proyecto_id?:         string | null;
}

interface Project {
  id:     string;
  name?:  string;
  folio?: string;
}

interface FormData {
  territorio:      string;
  colegio:         string;
  nombre_proyecto: string;
  tipo_proyecto:   string;
  prioridad:       string;
  asignacion:      string;
  eco:             string;
  estatus:         string;
  notas:           string;
  proyecto_id:     string;
}

const INITIAL_FORM: FormData = {
  territorio:      '',
  colegio:         '',
  nombre_proyecto: '',
  tipo_proyecto:   '',
  prioridad:       'media',
  asignacion:      '',
  eco:             '',
  estatus:         'pendiente',
  notas:           '',
  proyecto_id:     '',
};

// ─── Formulario ───────────────────────────────────────────────────────────────
function PendienteForm({
  open, onClose, onSubmit, pendiente = null, projects = [],
}: {
  open:       boolean;
  onClose:    () => void;
  onSubmit:   (data: Record<string, unknown>) => void;
  pendiente?: Pendiente | null;
  projects?:  Project[];
}) {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);

  React.useEffect(() => {
    if (pendiente) {
      setFormData({
        territorio:      String(pendiente.territorio      ?? ''),
        colegio:         String(pendiente.colegio         ?? ''),
        nombre_proyecto: String(pendiente.nombre_proyecto ?? ''),
        tipo_proyecto:   String(pendiente.tipo_proyecto   ?? ''),
        prioridad:       String(pendiente.prioridad       ?? 'media'),
        asignacion:      String(pendiente.asignacion      ?? ''),
        eco:             String(pendiente.eco             ?? ''),
        estatus:         String(pendiente.estatus         ?? 'pendiente'),
        notas:           String(pendiente.notas           ?? ''),
        proyecto_id:     String(pendiente.proyecto_id     ?? ''),
      });
    } else {
      setFormData(INITIAL_FORM);
    }
  }, [pendiente, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      proyecto_id: formData.proyecto_id || null,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <ClockAlert className="w-4 h-4" />
            {pendiente ? 'Editar Pendiente' : 'Nuevo Pendiente'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-3 flex-1">
          <div>
            <label className={labelClass}>Nombre del Proyecto *</label>
            <input type="text" required className={inputClass} value={formData.nombre_proyecto}
              onChange={e => setFormData(p => ({ ...p, nombre_proyecto: e.target.value }))}
              placeholder="Ej. Remodelación de Aula 3" />
          </div>

          <ColegioSelector
            territorio={formData.territorio}
            colegio={formData.colegio}
            onTerritorioChange={val => setFormData(p => ({ ...p, territorio: val, colegio: '', eco: '' }))}
            onColegioChange={val => {
              const colegioData = COLEGIOS.find(c => c.colegio === val);
              setFormData(p => ({ ...p, colegio: val, eco: colegioData?.eco ?? '' }));
            }}
            required
          />

          <div>
            <label className={labelClass}>ECO (Automático)</label>
            <input type="text" readOnly
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 font-semibold text-slate-600 cursor-default"
              value={formData.eco} placeholder="Se asigna según el colegio" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tipo de Proyecto</label>
              <select className={inputClass} value={formData.tipo_proyecto}
                onChange={e => setFormData(p => ({ ...p, tipo_proyecto: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {TIPOS_PROYECTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Prioridad *</label>
              <select className={inputClass} value={formData.prioridad}
                onChange={e => setFormData(p => ({ ...p, prioridad: e.target.value }))}>
                {PRIORIDADES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Asignación</label>
              <select className={inputClass} value={formData.asignacion}
                onChange={e => setFormData(p => ({ ...p, asignacion: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {ASIGNACIONES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Estatus *</label>
              <select className={inputClass} value={formData.estatus}
                onChange={e => setFormData(p => ({ ...p, estatus: e.target.value }))}>
                {ESTATUSES.map(e => <option key={e} value={e}>{ESTATUS_LABEL[e]}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>
              <span className="flex items-center gap-1.5"><Link2 className="w-3 h-3" /> Vincular con Proyecto (opcional)</span>
            </label>
            <select className={inputClass} value={formData.proyecto_id}
              onChange={e => setFormData(p => ({ ...p, proyecto_id: e.target.value }))}>
              <option value="">Sin vincular</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.folio ? `${p.folio} — ` : ''}{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Notas / Pendiente *</label>
            <textarea required className={`${inputClass} h-32 resize-none`} value={formData.notas}
              onChange={e => setFormData(p => ({ ...p, notas: e.target.value }))}
              placeholder="Describe el pendiente, avances, acuerdos..." />
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2">
              <Save className="w-4 h-4" />
              {pendiente ? 'Actualizar' : 'Guardar Pendiente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color = 'text-slate-900', sub }: {
  label: string; value: string | number; color?: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Pendientes() {
  const [showForm, setShowForm]                 = useState(false);
  const [editingPendiente, setEditingPendiente] = useState<Pendiente | null>(null);
  const [deletingId, setDeletingId]             = useState<string | null>(null);
  const [filterEstatus, setFilterEstatus]       = useState('all');
  const [filterTerritorio, setFilterTerritorio] = useState('all');
  const [filterColegio, setFilterColegio]       = useState('all');
  const [filterPrioridad, setFilterPrioridad]   = useState('all');
  const [visibleCount, setVisibleCount]         = useState(PAGE_SIZE);
  const queryClient = useQueryClient();

  const { data: rawPendientes = [], isLoading } = useQuery({
    queryKey: ['pendientes'],
    queryFn: () => db.Pendiente.list('-fecha_actualizacion', 500),
  });

  const { data: rawProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 500),
  });

  const pendientes = rawPendientes as unknown as Pendiente[];
  const projects   = rawProjects   as unknown as Project[];

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, { name: p.name ?? '', folio: p.folio ?? '' }])),
    [projects]
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total       = pendientes.length;
    const pendiente   = pendientes.filter(p => p.estatus === 'pendiente').length;
    const en_progreso = pendientes.filter(p => p.estatus === 'en_progreso').length;
    const completado  = pendientes.filter(p => p.estatus === 'completado').length;
    const pausado     = pendientes.filter(p => p.estatus === 'pausado').length;
    const urgente     = pendientes.filter(p => p.prioridad === 'urgente').length;
    const alta        = pendientes.filter(p => p.prioridad === 'alta').length;

    // Tipo más frecuente
    const tipoCount = TIPOS_PROYECTO.map(t => ({
      tipo: t,
      count: pendientes.filter(p => p.tipo_proyecto === t).length,
    })).sort((a, b) => b.count - a.count);
    const topTipo = tipoCount[0]?.count > 0 ? tipoCount[0] : null;

    // Territorio con más pendientes
    const terrCount = TERRITORIOS.map(t => ({
      terr: t,
      count: pendientes.filter(p => p.territorio === t).length,
    })).sort((a, b) => b.count - a.count);
    const topTerr = terrCount[0]?.count > 0 ? terrCount[0] : null;

    return { total, pendiente, en_progreso, completado, pausado, urgente, alta, topTipo, topTerr, terrCount };
  }, [pendientes]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => db.Pendiente.create(data),
    onSuccess: (result: any) => {
      if (result?._offline) {
        queryClient.setQueryData(['pendientes'], (old: any) => [result, ...(old ?? [])]);
        toast.warning('📶 Sin conexión — Pendiente guardado localmente');
      } else {
        queryClient.invalidateQueries({ queryKey: ['pendientes'] });
        toast.success('Pendiente creado');
      }
      setShowForm(false);
    },
    onError: () => toast.error('Error al crear el pendiente'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      db.Pendiente.update(id, data),
    onSuccess: (result: any) => {
      if (result?._offline) {
        queryClient.setQueryData(['pendientes'], (old: any) =>
          (old ?? []).map((p: any) => p.id === result.id ? { ...p, ...result } : p)
        );
        toast.warning('📶 Sin conexión — Cambio guardado localmente');
      } else {
        queryClient.invalidateQueries({ queryKey: ['pendientes'] });
        toast.success('Pendiente actualizado');
      }
      setEditingPendiente(null);
    },
    onError: () => toast.error('Error al actualizar el pendiente'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => db.Pendiente.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendientes'] });
      setDeletingId(null);
      toast.success('Pendiente eliminado');
    },
    onError: () => toast.error('Error al eliminar el pendiente'),
  });

  const colegiosFiltrados = useMemo(() =>
    filterTerritorio !== 'all' ? COLEGIOS.filter(c => c.territorio === filterTerritorio) : COLEGIOS,
    [filterTerritorio]
  );

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) =>
    (e: React.ChangeEvent<HTMLSelectElement>) => { setter(e.target.value); setVisibleCount(PAGE_SIZE); };

  const filtered = useMemo(() =>
    pendientes.filter(p => {
      if (filterEstatus    !== 'all' && p.estatus    !== filterEstatus)    return false;
      if (filterTerritorio !== 'all' && p.territorio !== filterTerritorio) return false;
      if (filterColegio    !== 'all' && p.colegio    !== filterColegio)    return false;
      if (filterPrioridad  !== 'all' && p.prioridad  !== filterPrioridad)  return false;
      return true;
    }),
    [pendientes, filterEstatus, filterTerritorio, filterColegio, filterPrioridad]
  );

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pendientes"
        subtitle="Seguimiento de pendientes por proyecto y colegio"
        actionLabel="Nuevo Pendiente"
        onAction={() => setShowForm(true)}
      />

      {/* ── KPIs ── */}
      <div className="space-y-3">
        {/* Fila 1: Estatus */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Total"       value={kpis.total}       color="text-slate-900" />
          <KpiCard label="Pendientes"  value={kpis.pendiente}   color="text-amber-600" />
          <KpiCard label="En Progreso" value={kpis.en_progreso} color="text-blue-600"  />
          <KpiCard label="Completados" value={kpis.completado}  color="text-emerald-600" />
          <KpiCard label="Pausados"    value={kpis.pausado}     color="text-slate-500" />
        </div>

        {/* Fila 2: Prioridades + Tipo top + Territorios */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Prioridad Urgente" value={kpis.urgente} color="text-red-600"
            sub={`+ ${kpis.alta} de alta prioridad`} />
          <KpiCard
            label="Tipo más frecuente"
            value={kpis.topTipo ? kpis.topTipo.tipo : '—'}
            color="text-purple-600"
            sub={kpis.topTipo ? `${kpis.topTipo.count} pendiente${kpis.topTipo.count !== 1 ? 's' : ''}` : undefined}
          />
          {kpis.terrCount.filter(t => t.count > 0).slice(0, 2).map(t => (
            <div key={t.terr} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {t.terr}
              </p>
              <p className="text-xl font-black text-indigo-600">{t.count}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">pendiente{t.count !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select className={selectClass} value={filterTerritorio}
          onChange={e => { handleFilterChange(setFilterTerritorio)(e); setFilterColegio('all'); }}>
          <option value="all">Todos los Territorios</option>
          {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectClass} value={filterColegio}
          onChange={handleFilterChange(setFilterColegio)}>
          <option value="all">Todos los Colegios</option>
          {colegiosFiltrados.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio}</option>)}
        </select>
        <select className={selectClass} value={filterEstatus}
          onChange={handleFilterChange(setFilterEstatus)}>
          <option value="all">Todos los Estatus</option>
          {ESTATUSES.map(e => <option key={e} value={e}>{ESTATUS_LABEL[e]}</option>)}
        </select>
        <select className={selectClass} value={filterPrioridad}
          onChange={handleFilterChange(setFilterPrioridad)}>
          <option value="all">Todas las Prioridades</option>
          {PRIORIDADES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
        {filtered.length > 0 && (
          <span className="h-10 flex items-center text-sm text-slate-500">
            {filtered.length} pendiente{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-20 text-center">
          <ClockAlert className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No hay pendientes registrados.</p>
          <button onClick={() => setShowForm(true)}
            className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
            + Nuevo Pendiente
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <div className="col-span-1">Territorio</div>
            <div className="col-span-1">Colegio</div>
            <div className="col-span-2">Proyecto</div>
            <div className="col-span-1">Tipo</div>
            <div className="col-span-1">Prioridad</div>
            <div className="col-span-1">Asignación</div>
            <div className="col-span-1">Estatus</div>
            <div className="col-span-1">Proyecto</div>
            <div className="col-span-2">Notas</div>
            <div className="col-span-1">Acciones</div>
          </div>

          <div className="divide-y divide-slate-100">
            {visible.map(p => (
              <div key={p.id} className="px-5 py-4 hover:bg-slate-50/50 transition-colors grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                <div className="col-span-1">
                  <span className="text-xs font-bold text-slate-500">{p.territorio || '—'}</span>
                </div>
                <div className="col-span-1">
                  <span className="text-xs font-semibold text-slate-800">{p.colegio || '—'}</span>
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-bold text-slate-900 leading-tight">{p.nombre_proyecto || '—'}</p>
                  {p.fecha_actualizacion && (
                    <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(p.fecha_actualizacion), 'dd MMM yyyy', { locale: es })}
                    </p>
                  )}
                </div>
                <div className="col-span-1">
                  <span className="text-xs text-slate-600">{p.tipo_proyecto || '—'}</span>
                </div>
                <div className="col-span-1">
                  <PriorityBadge priority={p.prioridad} />
                </div>
                <div className="col-span-1">
                  <span className="text-xs text-slate-600">{p.asignacion || '—'}</span>
                </div>
                <div className="col-span-1">
                  <StatusBadge status={p.estatus} />
                </div>
                <div className="col-span-1">
                  {p.proyecto_id && projectMap[p.proyecto_id] ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 flex items-center gap-1 w-fit">
                      <Link2 className="w-3 h-3 flex-shrink-0" />
                      {projectMap[p.proyecto_id].folio || projectMap[p.proyecto_id].name}
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 font-medium">
                      Sin vinculación
                    </span>
                  )}
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{p.notas || '—'}</p>
                </div>
                <div className="col-span-1 flex gap-2">
                  <button onClick={() => setEditingPendiente(p)}
                    className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeletingId(p.id)}
                    className="p-1.5 rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="flex flex-col items-center gap-2 py-6 border-t border-slate-100">
              <button onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm">
                <ChevronDown className="w-4 h-4" />
                Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
              </button>
              <p className="text-xs text-slate-400">
                Mostrando {visible.length} de {filtered.length} pendientes
              </p>
            </div>
          )}
        </div>
      )}

      <PendienteForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={data => createMutation.mutate(data)}
        projects={projects}
      />

      <PendienteForm
        open={!!editingPendiente}
        onClose={() => setEditingPendiente(null)}
        onSubmit={data => updateMutation.mutate({ id: editingPendiente!.id, data })}
        pendiente={editingPendiente}
        projects={projects}
      />

      {deletingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900">¿Eliminar pendiente?</h2>
            <p className="text-sm text-slate-500 mt-2">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">
                Cancelar
              </button>
              <button onClick={() => deleteMutation.mutate(deletingId!)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-md disabled:opacity-50">
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
