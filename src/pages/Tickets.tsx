import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { db } from '@/lib/db';
import {
  Ticket, ChevronDown, Pencil, Trash2, X, Save,
  Calendar, Link2, CheckCircle, XCircle, FileCheck, FolderKanban, Sparkles, FolderPlus, Loader2
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

const formatMXN = (value: string): string => {
  const clean = value.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  const integer = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimal = parts[1] !== undefined ? '.' + parts[1].slice(0, 2) : '';
  return clean ? '$' + integer + decimal : '';
};
const parseMXN = (value: string): string => value.replace(/[^0-9.]/g, '');
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
  nombre_proyecto?:    string;
  expediente_url?:     string;
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
  crear_proyecto:      boolean;
  nombre_proyecto:     string;
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
  crear_proyecto:      false,
  nombre_proyecto:     '',
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
      const folioNum = ticket.folio ?? '';
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
        crear_proyecto:      false,
        nombre_proyecto:     '',
      });
    } else {
      setFormData(INITIAL_FORM);
    }
  }, [ticket, open]);

  if (!open) return null;

  const isTMAS = formData.folio_num.startsWith('TMAS-');
  const roClass = "w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 text-slate-600 cursor-default select-none";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const folio = formData.folio_num.trim() || null;
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
      _crear_proyecto:     formData.crear_proyecto,
      _nombre_proyecto:    formData.nombre_proyecto      || null,
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
            <input type="text" className={roClass} readOnly value={formData.folio_num} />
          </div>

          {/* Tipo + Estatus */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tipo de Proyecto *</label>
              {isTMAS ? (
                <select required className={inputClass} value={formData.tipo_proyecto}
                  onChange={e => setFormData(p => ({ ...p, tipo_proyecto: e.target.value }))}>
                  <option value="">Seleccionar...</option>
                  {TIPOS_PROYECTO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <select required className={inputClass} value={formData.tipo_proyecto}
                  onChange={e => setFormData(p => ({ ...p, tipo_proyecto: e.target.value }))}>
                  <option value="">Seleccionar...</option>
                  {TIPOS_PROYECTO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={labelClass}>Estatus *</label>
              {isTMAS ? (
                <input type="text" className={roClass} readOnly value={formData.estatus === 'aprobado' ? 'Aprobado' : formData.estatus === 'cancelado' ? 'Cancelado' : formData.estatus} />
              ) : (
                <select className={inputClass} value={formData.estatus}
                  onChange={e => setFormData(p => ({ ...p, estatus: e.target.value }))}>
                  <option value="aprobado">Aprobado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              )}
            </div>
          </div>

          {/* Territorio + Colegio */}
          {isTMAS ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Territorio</label>
                <input type="text" className={roClass} readOnly value={formData.territorio} />
              </div>
              <div>
                <label className={labelClass}>Colegio</label>
                <input type="text" className={roClass} readOnly value={formData.colegio} />
              </div>
            </div>
          ) : (
            <ColegioSelector
              territorio={formData.territorio}
              colegio={formData.colegio}
              onTerritorioChange={val => setFormData(p => ({ ...p, territorio: val, colegio: '', eco: '' }))}
              onColegioChange={val => {
                const c = COLEGIOS.find(c => c.colegio === val);
                setFormData(p => ({ ...p, colegio: val, eco: c?.eco ?? '' }));
              }}
            />
          )}

          {/* ECO */}
          <div>
            <label className={labelClass}>ECO (Automático)</label>
            <input type="text" readOnly className={roClass} value={formData.eco} placeholder="Se asigna según el colegio" />
          </div>

          {/* Proveedor + Asignación */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Nombre del Proveedor</label>
              {isTMAS ? (
                <input type="text" className={roClass} readOnly value={formData.nombre_proveedor} />
              ) : (
                <input type="text" className={inputClass} value={formData.nombre_proveedor}
                  onChange={e => setFormData(p => ({ ...p, nombre_proveedor: e.target.value }))}
                  placeholder="Proveedor o empresa" />
              )}
            </div>
            <div>
              <label className={labelClass}>Asignación</label>
              {isTMAS ? (
                <input type="text" className={roClass} readOnly value={formData.asignacion || '—'} />
              ) : (
                <select className={inputClass} value={formData.asignacion}
                  onChange={e => setFormData(p => ({ ...p, asignacion: e.target.value }))}>
                  <option value="">Seleccionar...</option>
                  {ASIGNACIONES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Fecha + Presupuesto */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Fecha</label>
              {isTMAS ? (
                <input type="text" className={roClass} readOnly value={formData.fecha} />
              ) : (
                <input type="date" className={inputClass} value={formData.fecha}
                  onChange={e => setFormData(p => ({ ...p, fecha: e.target.value }))} />
              )}
            </div>
            <div>
              <label className={labelClass}>Costo / Presupuesto (MXN)</label>
              {isTMAS ? (
                <input type="text" className={roClass} readOnly value={formatMXN(formData.presupuesto)} />
              ) : (
                <input type="text" className={inputClass}
                  value={formatMXN(formData.presupuesto)}
                  onChange={e => setFormData(p => ({ ...p, presupuesto: parseMXN(e.target.value) }))}
                  placeholder="$0.00" />
              )}
            </div>
          </div>

          {/* Ticket físico + Plan financiamiento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>¿Cuenta con Ticket Físico?</label>
              {isTMAS ? (
                <input type="text" className={roClass} readOnly value="Sí" />
              ) : (
                <select className={inputClass} value={formData.ticket_fisico}
                  onChange={e => setFormData(p => ({ ...p, ticket_fisico: e.target.value }))}>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              )}
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

          {isTMAS && (
            <p className="text-[11px] text-slate-400 italic">
              Los campos en gris se sincronizan automáticamente desde el Ticket MAS. Solo puedes editar Tipo de Proyecto y Plan de Financiamiento.
            </p>
          )}


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
  const [expModal, setExpModal]               = useState<TicketRecord | null>(null);
  const [creandoExp, setCreandoExp]           = useState(false);
  const [expFiles, setExpFiles]               = useState({ solicitud: null as File | null, ticket: null as File | null, cotizaciones: null as File | null, autorizacion: null as File | null });
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
      const tickets = data ?? [];

      // Enriquecer con expediente_url de tickets_mas para folios TMAS-*
      const foliosTMAS = tickets.filter(t => t.folio?.startsWith('TMAS') && !t.expediente_url).map(t => t.folio);
      if (foliosTMAS.length > 0) {
        const { data: tmasData } = await supabase
          .from('tickets_mas')
          .select('folio, expediente_url')
          .in('folio', foliosTMAS)
          .not('expediente_url', 'is', null);
        if (tmasData?.length) {
          const tmasMap = Object.fromEntries(tmasData.map(t => [t.folio, t.expediente_url]));
          return tickets.map(t => t.folio && tmasMap[t.folio] ? { ...t, expediente_url: tmasMap[t.folio] } : t);
        }
      }
      return tickets;
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
      const nombreProyecto = (data.nombre_proyecto || data._nombre_proyecto) as string | null;

      // Limpiar campos internos antes de insertar
      const { _crear_proyecto, _nombre_proyecto, ...ticketData } = data;

      let proyecto_id: string | null = ticketData.proyecto_id as string | null;

      // Crear proyecto automáticamente siempre que haya nombre
      if (nombreProyecto && !proyecto_id) {
        const folio = ticketData.folio as string | null;
        const folioNum = null;

        const { data: proyecto, error: projError } = await supabase
          .from('projects')
          .insert({
            name:          nombreProyecto,
            status:        'en_espera',
            priority:      'media',
            territorio:    ticketData.territorio    ?? null,
            colegio:       ticketData.colegio       ?? null,
            eco:           ticketData.eco           ?? null,
            budget:        ticketData.presupuesto   ?? null,
            tipo_proyecto: ticketData.tipo_proyecto ?? null,
            notes:         ticketData.notas         ?? null,
            folio:         folio,
            ticket_number: folioNum,
            type:          'Mantenimiento',
            progress:      0,
          })
          .select()
          .single();

        if (projError) throw projError;
        proyecto_id = proyecto.id;
      }

      const { data: result, error } = await supabase
        .from('tickets')
        .insert({ ...ticketData, proyecto_id, nombre_proyecto: nombreProyecto ?? null })
        .select()
        .single();
      if (error) throw error;
      return { result, crearProyecto: !!nombreProyecto };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowForm(false);
      if (res.crearProyecto) {
        toast.success('✅ Ticket y Proyecto creados y vinculados correctamente');
      } else {
        toast.success('✅ Ticket y Proyecto creados correctamente');
      }
    },
    onError: () => toast.error('Error al crear el ticket'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const crearProyecto  = data._crear_proyecto  as boolean;
      const nombreProyecto = data._nombre_proyecto as string | null;

      // Limpiar campos internos antes de actualizar (igual que en createMutation)
      const { _crear_proyecto, _nombre_proyecto, ...ticketData } = data;

      let proyecto_id: string | null = ticketData.proyecto_id as string | null;

      // Si se pidió crear proyecto automáticamente desde edición
      if (crearProyecto && nombreProyecto) {
        const { data: proyecto, error: projError } = await supabase
          .from('projects')
          .insert({
            name:          nombreProyecto,
            status:        'en_espera',
            priority:      'media',
            territorio:    ticketData.territorio    ?? null,
            colegio:       ticketData.colegio       ?? null,
            eco:           ticketData.eco           ?? null,
            budget:        ticketData.presupuesto   ?? null,
            tipo_proyecto: ticketData.tipo_proyecto ?? null,
            notes:         ticketData.notas         ?? null,
            folio:         ticketData.folio         ?? null,
            type:          'Mantenimiento',
            progress:      0,
          })
          .select()
          .single();
        if (projError) throw projError;
        proyecto_id = proyecto.id;
      }

      const { data: result, error } = await supabase
        .from('tickets')
        .update({ ...ticketData, proyecto_id })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      // Si se canceló el ticket y tiene proyecto vinculado, cancelar el proyecto también
      if (ticketData.estatus === 'cancelado') {
        const ticket = tickets.find(t => t.id === id);
        const proyectoId = proyecto_id || ticket?.proyecto_id;
        if (proyectoId) {
          await supabase.from('projects').update({ status: 'cancelado' }).eq('id', proyectoId);
        }
      }

      return result;
    },
    onSuccess: (_, { id, data }) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditingTicket(null);
      if (data.estatus === 'cancelado') {
        const ticket = tickets.find(t => t.id === id);
        const proyectoId = (data.proyecto_id as string) || ticket?.proyecto_id;
        toast.success(proyectoId
          ? 'Ticket cancelado — proyecto vinculado cancelado automáticamente'
          : 'Ticket cancelado'
        );
      } else {
        toast.success('Ticket actualizado');
      }
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
    filtered.filter(t => t.estatus !== 'cancelado').reduce((sum, t) => sum + (t.presupuesto ?? 0), 0),
    [filtered]
  );

  const crearExpediente = async (t: TicketRecord) => {
    setCreandoExp(true);
    try {
      // Usar fecha del ticket (fecha de autorización) para el año de la carpeta
      const anio = t.fecha ? new Date(t.fecha + 'T12:00:00').getFullYear()
                 : t.created_at ? new Date(t.created_at).getFullYear()
                 : new Date().getFullYear();
      const colegioCarpeta = (t.colegio ?? 'SIN_COLEGIO').replace(/[/\\:*?"<>|]/g, '_');
      const folioCarpeta   = t.folio ?? 'SIN_FOLIO';
      const nombreCarpeta  = (t.nombre_proyecto ?? 'Sin nombre').slice(0, 60).replace(/[/\\:*?"<>|]/g, '_');
      const raiz = `Expedientes/${anio}/${colegioCarpeta}/${folioCarpeta} - ${nombreCarpeta}`;

      const { data: sessionData } = await supabase.auth.getSession();
      const token    = sessionData?.session?.access_token ?? '';
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const spUp = async (file: File, carpeta: string, fileName: string) => {
        const fd = new FormData();
        fd.append('file', file); fd.append('carpeta', carpeta); fd.append('fileName', fileName);
        const res = await fetch(`${SUPA_URL}/functions/v1/sharepoint-upload`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'apikey': ANON_KEY }, body: fd,
        });
        return res.json();
      };

      const placeholder = new File([''], '.keep', { type: 'text/plain' });
      const subcarpetas = [
        `${raiz}/Coordinación RCMA/01 - Solicitud de Proyecto`,
        `${raiz}/Coordinación RCMA/02 - Cotizaciones`,
        `${raiz}/Coordinación RCMA/03 - Ticket MAS`,
        `${raiz}/Coordinación RCMA/04 - Autorización`,
        `${raiz}/ECO/01 - Proyecto Ejecutivo`,
        `${raiz}/ECO/02 - Acta de Inicio`,
        `${raiz}/ECO/03 - Reportes de Obra`,
        `${raiz}/ECO/04 - Acta de Entrega`,
        `${raiz}/ECO/05 - Cierre de Obra`,
        `${raiz}/ECO/06 - Fotografías/Antes`,
        `${raiz}/ECO/06 - Fotografías/Durante`,
        `${raiz}/ECO/06 - Fotografías/Después`,
      ];
      for (const carpeta of subcarpetas) {
        await spUp(placeholder, carpeta, '.keep');
      }

      let expUrl: string | null = null;
      if (expFiles.solicitud)   { const r = await spUp(expFiles.solicitud,   `${raiz}/Coordinación RCMA/01 - Solicitud de Proyecto`, expFiles.solicitud.name);   expUrl = expUrl ?? r?.webUrl; }
      if (expFiles.cotizaciones){ const r = await spUp(expFiles.cotizaciones, `${raiz}/Coordinación RCMA/02 - Cotizaciones`,           expFiles.cotizaciones.name); expUrl = expUrl ?? r?.webUrl; }
      if (expFiles.ticket)      { const r = await spUp(expFiles.ticket,       `${raiz}/Coordinación RCMA/03 - Ticket MAS`,            expFiles.ticket.name);       expUrl = expUrl ?? r?.webUrl; }
      if (expFiles.autorizacion){ const r = await spUp(expFiles.autorizacion, `${raiz}/Coordinación RCMA/04 - Autorización`,          expFiles.autorizacion.name); expUrl = expUrl ?? r?.webUrl; }

      // Guardar URL base del expediente
      const urlBase = expUrl ? expUrl.split('/Coordinaci')[0] : `https://manoamiga-my.sharepoint.com/personal/rreyes_manoamiga_edu_mx/Documents/Sistema%20RCMA%20Doc/${raiz.split('/').map(encodeURIComponent).join('/')}`;
      await supabase.from('tickets').update({ expediente_url: urlBase }).eq('id', t.id);
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Expediente creado en OneDrive ✓');
      setExpModal(null);
      setExpFiles({ solicitud: null, ticket: null, cotizaciones: null, autorizacion: null });
    } catch (e: any) {
      toast.error('Error creando expediente: ' + e.message);
    } finally {
      setCreandoExp(false);
    }
  };

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
                      {/* Crear/Ver Expediente */}
                      {t.expediente_url ? (
                        <a href={t.expediente_url} target="_blank" rel="noreferrer"
                          className="p-1.5 rounded-md border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors" title="Ver Expediente en OneDrive">
                          <FolderPlus className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <button onClick={() => { setExpModal(t); setExpFiles({ solicitud: null, ticket: null, cotizaciones: null, autorizacion: null }); }}
                          className="p-1.5 rounded-md border border-blue-200 text-blue-500 hover:bg-blue-50 transition-colors" title="Crear Expediente en OneDrive">
                          <FolderPlus className="w-3.5 h-3.5" />
                        </button>
                      )}
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

      {/* ── Modal Crear Expediente ─────────────────────────────────────────── */}
      {expModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Crear Expediente en OneDrive</h3>
                <p className="text-xs text-slate-500 mt-0.5">{expModal.folio} — {expModal.colegio}</p>
              </div>
              <button onClick={() => setExpModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                📁 <strong>Expedientes/{expModal.created_at ? new Date(expModal.created_at).getFullYear() : new Date().getFullYear()}/{expModal.colegio}/{expModal.folio} - {(expModal.nombre_proyecto ?? '').slice(0, 40)}</strong>
              </div>
              {[
                { key: 'solicitud',    label: 'Solicitud de Proyecto',    accept: '.pdf' },
                { key: 'cotizaciones', label: 'Cotizaciones',              accept: '.pdf,.xlsx,.xls,.doc,.docx' },
                { key: 'ticket',       label: 'Ticket MAS / Ticket físico', accept: '.pdf' },
                { key: 'autorizacion', label: 'Autorización',              accept: '.msg,.pdf' },
              ].map(({ key, label, accept }) => (
                <div key={key}>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">{label} — opcional</label>
                  <input type="file" accept={accept} className="w-full text-xs border border-slate-200 rounded-lg p-2"
                    onChange={e => setExpFiles(f => ({ ...f, [key]: e.target.files?.[0] ?? null }))} />
                </div>
              ))}
              <p className="text-xs text-slate-400">Todos los archivos son opcionales. Puedes crear solo las carpetas y subir los archivos después manualmente en OneDrive.</p>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setExpModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200">Cancelar</button>
              <button onClick={() => crearExpediente(expModal)} disabled={creandoExp}
                className="px-4 py-2 bg-[#0C3B6E] text-white rounded-lg text-sm font-medium hover:bg-[#1565C0] flex items-center gap-2 disabled:opacity-50">
                {creandoExp ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
                {creandoExp ? 'Creando...' : 'Crear Expediente'}
              </button>
            </div>
          </div>
        </div>
      )}

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
