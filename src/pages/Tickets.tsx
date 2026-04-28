import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { db } from '@/lib/db';
import {
  Ticket, ChevronDown, Pencil, Trash2, X, Save,
  Calendar, Link2, CheckCircle, XCircle, FileCheck
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import ColegioSelector from '@/components/shared/ColegioSelector';
import { COLEGIOS, TERRITORIOS } from '@/lib/colegios';

const PAGE_SIZE = 20;

const inputClass  = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const labelClass  = "block text-xs font-bold text-slate-500 uppercase mb-1 mt-3";
const selectClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700";

const TIPOS_PROYECTO      = ['MEJORA','CONSTRUCCIÓN','REMODELACIÓN','ADECUACIÓN','MANTENIMIENTO','PORTAFOLIO','GARANTÍAS','REVISIÓN'];
const ESTATUSES           = ['aprobado','cancelado'];
const ASIGNACIONES        = ['ASIGNACIÓN DIRECTA','ECO'];
const PLANES_FINANC       = ['OPERACIÓN','FBC','DONATIVOS','SERVICIOS PROFESIONALES','NA'];

const ESTATUS_STYLE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  aprobado:  { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
  cancelado: { bg: 'bg-red-50 border border-red-200',         text: 'text-red-700',     icon: <XCircle    className="w-3 h-3" /> },
};

interface TicketRecord {
  id:                  string;
  folio?:              string;
  tipo_proyecto?:      string;
  presupuesto?:        number | null;
  fecha?:              string;
  estatus?:            string;
  nombre_proveedor?:   string;
  asignacion?:         string;
  territorio?:         string;
  colegio?:            string;
  eco?:                string;
  ticket_fisico?:      boolean;
  plan_financiamiento?: string;
  proyecto_id?:        string | null;
  notas?:              string;
  created_at?:         string;
}

interface Project { id: string; name?: string; folio?: string; }

interface FormData {
  folio_num:           string;
  tipo_proyecto:       string;
  presupuesto:         string;
  fecha:               string;
  estatus:             string;
  nombre_proveedor:    string;
  asignacion:          string;
  territorio:          string;
  colegio:             string;
  eco:                 string;
  ticket_fisico:       string;
  plan_financiamiento: string;
  proyecto_id:         string;
  notas:               string;
}

const INITIAL_FORM: FormData = {
  folio_num:           '',
  tipo_proyecto:       '',
  presupuesto:         '',
  fecha:               '',
  estatus:             'aprobado',
  nombre_proveedor:    '',
  asignacion:          '',
  territorio:          '',
  colegio:             '',
  eco:                 '',
  ticket_fisico:       'no',
  plan_financiamiento: '',
  proyecto_id:         '',
  notas:               '',
};

// ─── Formulario ───────────────────────────────────────────────────────────────
function TicketForm({
  open, onClose, onSubmit, ticket = null, projects = [],
}: {
  open:      boolean;
  onClose:   () => void;
  onSubmit:  (data: Record<string, unknown>) => void;
  ticket?:   TicketRecord | null;
  projects?: Project[];
}) {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);

  React.useEffect(() => {
    if (ticket) {
      const folioNum = ticket.folio?.replace('TCMM', '') ?? '';
      setFormData({
        folio_num:           folioNum,
        tipo_proyecto:       ticket.tipo_proyecto       ?? '',
        presupuesto:         ticket.presupuesto != null ? String(ticket.presupuesto) : '',
        fecha:               ticket.fecha               ?? '',
        estatus:             ticket.estatus             ?? 'aprobado',
        nombre_proveedor:    ticket.nombre_proveedor    ?? '',
        asignacion:          ticket.asignacion          ?? '',
        territorio:          ticket.territorio          ?? '',
        colegio:             ticket.colegio             ?? '',
        eco:                 ticket.eco                 ?? '',
        ticket_fisico:       ticket.ticket_fisico ? 'si' : 'no',
        plan_financiamiento: ticket.plan_financiamiento ?? '',
        proyecto_id:         ticket.proyecto_id         ?? '',
        notas:               ticket.notas               ?? '',
      });
    } else {
      setFormData(INITIAL_FORM);
    }
  }, [ticket, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const folio = formData.folio_num
      ? `TCMM${String(formData.folio_num).padStart(3, '0')}`
      : null;
    onSubmit({
      folio,
      tipo_proyecto:       formData.tipo_proyecto       || null,
      presupuesto:         formData.presupuesto ? parseFloat(formData.presupuesto) : null,
      fecha:               formData.fecha               || null,
      estatus:             formData.estatus,
      nombre_proveedor:    formData.nombre_proveedor    || null,
      asignacion:          formData.asignacion          || null,
      territorio:          formData.territorio          || null,
      colegio:             formData.colegio             || null,
      eco:                 formData.eco                 || null,
      ticket_fisico:       formData.ticket_fisico === 'si',
      plan_financiamiento: formData.plan_financiamiento || null,
      proyecto_id:         formData.proyecto_id         || null,
      notas:               formData.notas               || null,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Ticket className="w-4 h-4 text-slate-600" />
            {ticket ? 'Editar Ticket' : 'Nuevo Ticket'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-2 flex-1">

          {/* Folio */}
          <div>
            <label className={labelClass}>Folio de Ticket</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-red-500 pointer-events-none">TCMM</span>
              <input type="number" min="1" className="w-full pl-14 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900"
                value={formData.folio_num}
                onChange={e => setFormData(p => ({ ...p, folio_num: e.target.value }))}
                placeholder="Ej. 10 → TCMM010" />
            </div>
            {formData.folio_num && (
              <p className="text-xs font-black text-red-500 mt-1">
                Folio: TCMM{String(formData.folio_num).padStart(3, '0')}
              </p>
            )}
          </div>

          {/* Tipo + Estatus */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tipo de Proyecto *</label>
              <select required className={inputClass} value={formData.tipo_proyecto}
                onChange={e => setFormData(p => ({ ...p, tipo_proyecto: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {TIPOS_PROYECTO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Estatus *</label>
              <select className={inputClass} value={formData.estatus}
                onChange={e => setFormData(p => ({ ...p, estatus: e.target.value }))}>
                <option value="aprobado">Aprobado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>

          {/* Territorio + Colegio */}
          <ColegioSelector
            territorio={formData.territorio}
            colegio={formData.colegio}
            onTerritorioChange={val => setFormData(p => ({ ...p, territorio: val, colegio: '', eco: '' }))}
            onColegioChange={val => {
              const c = COLEGIOS.find(c => c.colegio === val);
              setFormData(p => ({ ...p, colegio: val, eco: c?.eco ?? '' }));
            }}
          />

          {/* ECO */}
          <div>
            <label className={labelClass}>ECO (Automático)</label>
            <input type="text" readOnly className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 font-semibold text-slate-600 cursor-default"
              value={formData.eco} placeholder="Se asigna según el colegio" />
          </div>

          {/* Proveedor + Asignación */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nombre del Proveedor</label>
              <input type="text" className={inputClass} value={formData.nombre_proveedor}
                onChange={e => setFormData(p => ({ ...p, nombre_proveedor: e.target.value }))}
                placeholder="Proveedor o empresa" />
            </div>
            <div>
              <label className={labelClass}>Asignación</label>
              <select className={inputClass} value={formData.asignacion}
                onChange={e => setFormData(p => ({ ...p, asignacion: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {ASIGNACIONES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {/* Fecha + Presupuesto */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Fecha</label>
              <input type="date" className={inputClass} value={formData.fecha}
                onChange={e => setFormData(p => ({ ...p, fecha: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Costo / Presupuesto (MXN)</label>
              <input type="number" min="0" step="0.01" className={inputClass} value={formData.presupuesto}
                onChange={e => setFormData(p => ({ ...p, presupuesto: e.target.value }))}
                placeholder="0.00" />
            </div>
          </div>

          {/* Ticket físico + Plan financiamiento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>¿Cuenta con Ticket Físico?</label>
              <select className={inputClass} value={formData.ticket_fisico}
                onChange={e => setFormData(p => ({ ...p, ticket_fisico: e.target.value }))}>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Plan de Financiamiento</label>
              <select className={inputClass} value={formData.plan_financiamiento}
                onChange={e => setFormData(p => ({ ...p, plan_financiamiento: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {PLANES_FINANC.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Vincular proyecto */}
          <div>
            <label className={labelClass}>
              <span className="flex items-center gap-1.5"><Link2 className="w-3 h-3" /> Vincular con Proyecto (opcional)</span>
            </label>
            <select className={inputClass} value={formData.proyecto_id}
              onChange={e => setFormData(p => ({ ...p, proyecto_id: e.target.value }))}>
              <option value="">Sin vincular</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.folio ? `${p.folio} — ` : ''}{p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Notas */}
          <div>
            <label className={labelClass}>Notas</label>
            <textarea className={`${inputClass} h-20 resize-none`} value={formData.notas}
              onChange={e => setFormData(p => ({ ...p, notas: e.target.value }))}
              placeholder="Observaciones adicionales..." />
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2">
              <Save className="w-4 h-4" />
              {ticket ? 'Actualizar Ticket' : 'Guardar Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Tickets() {
  const [showForm, setShowForm]               = useState(false);
  const [editingTicket, setEditingTicket]     = useState<TicketRecord | null>(null);
  const [deletingId, setDeletingId]           = useState<string | null>(null);
  const [filterEstatus, setFilterEstatus]     = useState('all');
  const [filterTerritorio, setFilterTerritorio] = useState('all');
  const [filterColegio, setFilterColegio]     = useState('all');
  const [filterTipo, setFilterTipo]           = useState('all');
  const [visibleCount, setVisibleCount]       = useState(PAGE_SIZE);
  const queryClient = useQueryClient();

  const { data: rawTickets = [], isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rawProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 500),
  });

  const tickets  = rawTickets  as TicketRecord[];
  const projects = rawProjects as unknown as Project[];

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, { name: p.name ?? '', folio: p.folio ?? '' }])),
    [projects]
  );

  // Solo proyectos con folio TCMM y que no estén ya vinculados a otro ticket
  const linkedProjectIds = useMemo(
    () => new Set(tickets.map(t => t.proyecto_id).filter(Boolean)),
    [tickets]
  );

  const projectsVinculables = useMemo(
    () => projects.filter(p => p.folio && p.folio.startsWith('TCMM')),
    [projects]
  );

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { data: result, error } = await supabase.from('tickets').insert(data).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setShowForm(false);
      toast.success('Ticket creado correctamente');
    },
    onError: () => toast.error('Error al crear el ticket'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const { data: result, error } = await supabase.from('tickets').update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setEditingTicket(null);
      toast.success('Ticket actualizado');
    },
    onError: () => toast.error('Error al actualizar el ticket'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tickets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setDeletingId(null);
      toast.success('Ticket eliminado');
    },
    onError: () => toast.error('Error al eliminar el ticket'),
  });

  const colegiosFiltrados = useMemo(() =>
    filterTerritorio !== 'all' ? COLEGIOS.filter(c => c.territorio === filterTerritorio) : COLEGIOS,
    [filterTerritorio]
  );

  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<string>>) =>
    (e: React.ChangeEvent<HTMLSelectElement>) => { setter(e.target.value); setVisibleCount(PAGE_SIZE); };

  const filtered = useMemo(() =>
    tickets.filter(t => {
      if (filterEstatus    !== 'all' && t.estatus    !== filterEstatus)    return false;
      if (filterTerritorio !== 'all' && t.territorio !== filterTerritorio) return false;
      if (filterColegio    !== 'all' && t.colegio    !== filterColegio)    return false;
      if (filterTipo       !== 'all' && t.tipo_proyecto !== filterTipo)    return false;
      return true;
    }),
    [tickets, filterEstatus, filterTerritorio, filterColegio, filterTipo]
  );

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  const totalPresupuesto = useMemo(() =>
    filtered.reduce((sum, t) => sum + (t.presupuesto ?? 0), 0),
    [filtered]
  );

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets Registrados"
        subtitle="Control y seguimiento de tickets de obra y mantenimiento"
        actionLabel="Nuevo Ticket"
        onAction={() => setShowForm(true)}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Tickets',  value: filtered.length,                                                                    color: 'text-slate-900' },
          { label: 'Aprobados',      value: filtered.filter(t => t.estatus === 'aprobado').length,                              color: 'text-emerald-600' },
          { label: 'Cancelados',     value: filtered.filter(t => t.estatus === 'cancelado').length,                             color: 'text-red-500' },
          { label: 'Monto Total',    value: totalPresupuesto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }),   color: 'text-blue-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-xl font-black ${color}`}>{value}</p>
          </div>
        ))}
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
        <select className={selectClass} value={filterTipo}
          onChange={handleFilterChange(setFilterTipo)}>
          <option value="all">Todos los tipos</option>
          {TIPOS_PROYECTO.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectClass} value={filterEstatus}
          onChange={handleFilterChange(setFilterEstatus)}>
          <option value="all">Todos los estatus</option>
          <option value="aprobado">Aprobado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        {filtered.length > 0 && (
          <span className="h-10 flex items-center text-sm text-slate-500">
            {filtered.length} ticket{filtered.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-20 text-center">
          <FileCheck className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No hay tickets registrados.</p>
          <button onClick={() => setShowForm(true)}
            className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
            + Nuevo Ticket
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(t => {
            const estilo = ESTATUS_STYLE[t.estatus ?? ''] ?? { bg: 'bg-slate-50 border border-slate-200', text: 'text-slate-600', icon: null };
            const proyecto = t.proyecto_id ? projectMap[t.proyecto_id] : null;
            return (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 p-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">

                  {/* Izquierda */}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Folio */}
                      {t.folio ? (
                        <span className="text-sm font-black text-red-500 bg-red-50 border border-red-200 px-3 py-0.5 rounded-full">
                          {t.folio}
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-0.5 rounded-full">Sin Folio</span>
                      )}
                      {/* Estatus */}
                      <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${estilo.bg} ${estilo.text}`}>
                        {estilo.icon}
                        {t.estatus === 'aprobado' ? 'Aprobado' : 'Cancelado'}
                      </span>
                      {/* Tipo */}
                      {t.tipo_proyecto && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                          {t.tipo_proyecto}
                        </span>
                      )}
                      {/* Ticket físico */}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.ticket_fisico ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-slate-100 text-slate-400'}`}>
                        {t.ticket_fisico ? '📄 Con Ticket Físico' : 'Sin Ticket Físico'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                      {t.nombre_proveedor && (
                        <span className="font-semibold">{t.nombre_proveedor}</span>
                      )}
                      {t.territorio && t.colegio && (
                        <span className="text-slate-400">{t.territorio} / {t.colegio}</span>
                      )}
                      {t.asignacion && (
                        <span className="text-slate-500">{t.asignacion}</span>
                      )}
                      {t.plan_financiamiento && (
                        <span className="text-indigo-600 font-bold">{t.plan_financiamiento}</span>
                      )}
                    </div>

                    {proyecto && (
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 rounded-md px-2 py-1 w-fit">
                        <Link2 className="w-3 h-3" />
                        {proyecto.folio ? `${proyecto.folio} — ` : ''}{proyecto.name}
                      </div>
                    )}

                    {t.notas && (
                      <p className="text-xs text-slate-500 italic line-clamp-2">{t.notas}</p>
                    )}
                  </div>

                  {/* Derecha */}
                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <div className="text-right">
                      {t.presupuesto != null && (
                        <p className="text-lg font-black text-slate-900">
                          {Number(t.presupuesto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                        </p>
                      )}
                      {t.fecha && (
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 justify-end mt-0.5">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(t.fecha + 'T00:00:00'), 'dd MMM yyyy', { locale: es })}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingTicket(t)}
                        className="p-1.5 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeletingId(t.id)}
                        className="p-1.5 rounded-md border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="flex flex-col items-center gap-2 py-4">
              <button onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                <ChevronDown className="w-4 h-4" />
                Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
              </button>
              <p className="text-xs text-slate-400">Mostrando {visible.length} de {filtered.length} tickets</p>
            </div>
          )}
        </div>
      )}

      <TicketForm open={showForm} onClose={() => setShowForm(false)}
        onSubmit={data => createMutation.mutate(data)}
        projects={projectsVinculables} />

      <TicketForm open={!!editingTicket} onClose={() => setEditingTicket(null)}
        onSubmit={data => updateMutation.mutate({ id: editingTicket!.id, data })}
        ticket={editingTicket}
        projects={projectsVinculables.filter(p =>
          !linkedProjectIds.has(p.id) || p.id === editingTicket?.proyecto_id
        )} />

      {deletingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h2 className="text-lg font-bold text-slate-900">¿Eliminar ticket?</h2>
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
