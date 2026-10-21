import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { imprimirHTML } from '@/lib/imprimir';
import { documentoInstitucional, tarjeta, grid, esc, val } from '@/lib/formatoInstitucional';
import { FIRMA_RCMA } from '@/lib/firmaRcma';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useScope } from '@/hooks/useScope';
import { useEcoLookup } from '@/hooks/useEcoLookup';
import { useDirectorio, type DirectorioColegio, getGerenteFMA, getDirectorNacional, findColegio } from '@/lib/directorio';
import {
  Send, CheckCircle, Eye, X, Printer, ClipboardList,
  ChevronDown, FileCheck, Clock, Trash2, Ban, RefreshCw, AlertCircle, AlertTriangle, FolderPlus, Loader2
} from 'lucide-react';

const TMAS_PAGE_SIZE = 20;
import PageHeader from '@/components/shared/PageHeader';
import { renameCarpetaSharePoint } from '@/hooks/useSharePointUpload';
import { logAudit } from '@/lib/audit';
import { notifyByEmail } from '@/lib/notifications';
import { BotonCorregir, CorregirModal, MarcaCorregida, HistorialCorrecciones } from '@/components/shared/CorreccionSolicitud';
import { CORRECCION_TICKET_MAS } from '@/lib/correcciones';
import VoBoFMA, { PanelVoBoFMA, EstadoVoBoFMA, avisarVoBoFMA, pendienteVoBo } from '@/components/ticketmas/VoBoFMA';

// ─── Firma del coordinador (base64) ──────────────────────────────────────────

// ─── Estilos base ────────────────────────────────────────────────────────────
const inputClass    = "w-full px-2 py-1.5 border border-slate-400 text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white text-slate-900 rounded";
const readOnlyClass = "w-full px-2 py-1.5 border border-slate-300 text-sm bg-slate-100 text-slate-600 cursor-default rounded";
const labelClass    = "text-[11px] font-bold text-slate-600 uppercase tracking-wide";
const selectClass   = "w-full px-2 py-1.5 border border-slate-400 text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white text-slate-900 rounded";

// Limpia un segmento de nombre de carpeta/archivo para OneDrive: quita caracteres
// inválidos y evita que el truncado a maxLen deje espacios o puntos al final
// (SharePoint/OneDrive rechaza nombres que terminan o empiezan así).
const limpiarSegmento = (s: string, maxLen = 60) => s
  .normalize('NFC')
  .slice(0, maxLen)
  .replace(/[/\\:*?"<>|]/g, '_')
  .trim()
  .replace(/[. ]+$/, '')
  .replace(/^[. ]+/, '');


// Esqueleto fijo (nombre, código interno, territorio) para los 3 renglones de
// oficina/FMA que hoy no están individualizados en Directorio. Los 20 colegios
// reales se generan dinámicamente desde `directorio` en buildColegiosTicket().
const COLEGIOS_TICKET_FMA = [
  { nombre: 'OF. MTY',  codigo: 'MTY-OF',  territorio: 'FMA' },
  { nombre: 'OF. CDMX', codigo: 'CDMX-OF', territorio: 'FMA' },
  { nombre: 'GENERAL',  codigo: 'FMA-GEN', territorio: 'FMA' },
];

/** Arma la lista de colegios que usa este módulo — TODO sale en vivo de
 *  Directorio (fuente única), incluyendo sociedad/centro gestor/contador. */
function buildColegiosTicket(directorioRows: DirectorioColegio[]) {
  const deColegios = directorioRows
    .filter(r => r.territorio === 'NORTE' || r.territorio === 'MEXICO')
    .map(r => ({
      nombre: r.nombre, codigo: r.codigo.replace(/^MA\s+/, ''), razon: r.nombre_oficial,
      territorio: r.territorio, director: r.dir_nombre, admin: r.adm_nombre, car_correo: r.car_correo,
      sociedad: r.sociedad ?? '', centro_gestor: r.centro_gestor ?? '',
      contador: r.contador_nombre ?? '', correo_contador: r.contador_correo ?? '',
    }));
  const deFMA = COLEGIOS_TICKET_FMA.map(f => {
    // OF. MTY y OF. CDMX comparten fiscalía y personal con la fila GENERAL —
    // no tienen fila propia en Directorio, así que siempre se resuelven contra ella.
    const general = findColegio(directorioRows, 'GENERAL');
    const gerente = getGerenteFMA(directorioRows);
    const directorNac = getDirectorNacional(directorioRows);
    return {
      nombre: f.nombre, codigo: f.codigo, razon: general?.nombre_oficial ?? 'Federación Mano Amiga A.C.',
      territorio: f.territorio, director: directorNac.nombre, admin: gerente.nombre,
      car_correo: general?.car_correo ?? '',
      sociedad: general?.sociedad ?? '', centro_gestor: general?.centro_gestor ?? '',
      contador: general?.contador_nombre ?? '', correo_contador: general?.contador_correo ?? '',
    };
  });
  return [...deColegios, ...deFMA];
}


function colegioCodigoCorto(nombreOColegio: string | null | undefined, colegiosTicket: ReturnType<typeof buildColegiosTicket>): string | null {
  if (!nombreOColegio) return null;
  const c = colegiosTicket.find(x => x.nombre === nombreOColegio);
  if (!c) return nombreOColegio; // ya viene en otro formato o no se encontró — se deja igual, no se pierde el dato
  if (c.codigo === 'FMA-GEN') return 'GENERAL';
  if (c.codigo.endsWith('-OF')) return 'OF. ' + c.codigo.replace('-OF', '');
  return 'MA ' + c.codigo;
}

const TERRITORIOS          = ['NORTE', 'MEXICO', 'FMA'];
const CLASIFICACIONES      = ['CONSTRUCCION NUEVA','REMODELACION','AMPLIACION','ADECUACION','MEJORA','MANTENIMIENTO ORDINARIO','MANTENIMIENTO EXTRAORDINARIO','PORTAFOLIO','GARANTIAS','REVISION'];
const CLASES_MANTENIMIENTO = ['MANTENIMIENTO ORDINARIO','MANTENIMIENTO EXTRAORDINARIO'];
const PERIODICIDADES       = ['URGENTE','NORMAL'];
const TIPOS_MANT           = ['PREVENTIVO','CORRECTIVO'];
const SI_NO                = ['SI','NO'];
const ESTATUSES_ADMIN      = ['pendiente','en_revision','autorizado','cancelado'];

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface TicketMAS {
  id:                     string;
  folio?:                 string;
  colegio?:               string;
  razon_social?:          string;
  sociedad?:              string;
  centro_gestor?:         string;
  territorio?:            string;
  director?:              string;
  admin_colegio?:         string;
  contador?:              string;
  nombre_solicitante?:    string;
  puesto_solicitante?:    string;
  correo_solicitante?:    string;
  fecha_elaboracion?:     string;
  clasificacion?:         string;
  periodicidad?:          string;
  tipo_mantenimiento?:    string;
  numero_activo?:         string;
  orden_interna?:         string;
  numero_orden_interna?:  string;
  descripcion?:           string;
  cot1_importe?:          number | null;
  cot1_proveedor?:        string;
  cot2_importe?:          number | null;
  cot2_proveedor?:        string;
  cot3_importe?:          number | null;
  cot3_proveedor?:        string;
  motivo_seleccion?:      string;
  forma_financiamiento?:  string;
  elaborar_suplemento?:   string;
  elaborar_traspaso?:     string;
  estatus?:               string;
  fecha_recepcion?:       string;
  fecha_inicio_estimada?: string;
  fecha_fin_estimada?:    string;
  areas_participantes?:   string;
  fecha_autorizacion?:    string;
  autorizado_por?:        string;
  vobo_por?:              string | null;
  vobo_correo?:           string | null;
  vobo_at?:               string | null;
  vobo_comentario?:       string | null;
  motivo_cancelacion?:    string;
  fecha_cancelacion?:     string;
  expediente_url?:        string;
  nombre_proyecto?:       string;
  created_at?:            string;
}

// ─── Formateo moneda ──────────────────────────────────────────────────────────
const fmx = (n?: number | null) =>
  n != null ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—';

const formatMXN = (v: string) => {
  const clean = v.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  const int   = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec   = parts[1] !== undefined ? '.' + parts[1].slice(0, 2) : '';
  return clean ? '$' + int + dec : '';
};
const parseMXN = (v: string) => v.replace(/[^0-9.]/g, '');

// ─── Badge de estatus ─────────────────────────────────────────────────────────
const ESTATUS_STYLE: Record<string, { bg: string; dot: string; label: string }> = {
  pendiente:    { bg: 'bg-amber-50 border border-amber-200 text-amber-700',      dot: 'bg-amber-400',   label: 'Pendiente' },
  en_revision:  { bg: 'bg-blue-50 border border-blue-200 text-blue-700',         dot: 'bg-blue-500',    label: 'En Revisión' },
  autorizado:   { bg: 'bg-emerald-50 border border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', label: 'Autorizado' },
  rechazado:    { bg: 'bg-red-50 border border-red-200 text-red-700',            dot: 'bg-red-500',     label: 'Rechazado' },
  cancelado:    { bg: 'bg-slate-100 border border-slate-300 text-slate-500',     dot: 'bg-slate-400',   label: 'Cancelado' },
};

const isVencido = (t: TicketMAS) => {
  if (t.estatus !== 'pendiente') return false;
  const created = t.created_at ? new Date(t.created_at) : null;
  if (!created) return false;
  return (Date.now() - created.getTime()) > 12 * 60 * 60 * 1000;
};

function EstatusBadge({ estatus, vencido }: { estatus?: string; vencido?: boolean }) {
  const s = ESTATUS_STYLE[estatus ?? 'pendiente'] ?? ESTATUS_STYLE.pendiente;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
      {vencido && <span className="ml-1 text-[10px] font-bold text-red-600">⚠ +12h</span>}
    </span>
  );
}

// ─── Generador de PDF del ticket ──────────────────────────────────────────────
function generarHTMLTicket(t: TicketMAS, firma: string): string {
  const hoy = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es });
  const fechaAuth = t.fecha_autorizacion
    ? format(new Date(t.fecha_autorizacion), "dd/MM/yyyy", { locale: es })
    : hoy;
  // FMA: firma con el Vo. Bo. de Gerencia (nombre y fecha del Vo. Bo.)
  const fechaVoBo = t.vobo_at ? format(new Date(t.vobo_at), "dd/MM/yyyy HH:mm", { locale: es }) : fechaAuth;
  const enviado = t.created_at ? format(new Date(t.created_at), "dd/MM/yyyy HH:mm", { locale: es }) : '—';
  const cots = [
    { n: 1, prov: t.cot1_proveedor, imp: t.cot1_importe },
    { n: 2, prov: t.cot2_proveedor, imp: t.cot2_importe },
    { n: 3, prov: t.cot3_proveedor, imp: t.cot3_importe },
  ];

  const cuerpo =
    tarjeta('Datos generales', grid([
      ['Colegio', val(t.colegio)], ['Razón social', val(t.razon_social)], ['Territorio', val(t.territorio)],
      ['Centro gestor', val(t.centro_gestor)], ['Sociedad', val(t.sociedad)], ['Contador', val(t.contador)],
      ['Solicitante', val(t.nombre_solicitante)], ['Puesto', val(t.puesto_solicitante)], ['Correo', val(t.correo_solicitante)],
      ['Clasificación', val(t.clasificacion)], ['Periodicidad', val(t.periodicidad)], ['Tipo / Orden interna', `${val(t.tipo_mantenimiento)} · ${val(t.orden_interna)}`],
      ['Fecha de elaboración', val(t.fecha_elaboracion)],
    ])) +
    tarjeta('Descripción del trabajo', `<div class="txt">${val(t.descripcion)}</div>`) +
    tarjeta('Cotizaciones y financiamiento',
      `<table><tr><th style="width:16%">Cotización</th><th>Proveedor</th><th class="num">Importe</th></tr>${
        cots.map(c => `<tr><td>No. ${c.n}</td><td>${val(c.prov)}</td><td class="num">${fmx(c.imp)}</td></tr>`).join('')}</table>` +
      grid([
        ['Motivo de selección', val(t.motivo_seleccion)], ['Financiamiento', val(t.forma_financiamiento)],
        ['Suplemento / Traspaso', `${val(t.elaborar_suplemento)} / ${val(t.elaborar_traspaso)}`],
      ])) +
    tarjeta('Ventanilla única', grid([
      ['Recepción', val(t.fecha_recepcion)], ['Inicio estimado', val(t.fecha_inicio_estimada)], ['Fin estimado', val(t.fecha_fin_estimada)],
      ['Autorización', esc(fechaAuth)],
    ]));

  const firmaDerecha = t.territorio === 'FMA' && t.autorizado_por
    ? { contenido: `<span class="d">${t.vobo_at ? 'Vo. Bo. en el sistema' : 'Autorizado'}<br/>${esc(fechaVoBo)}</span>`,
        nombre: esc(t.autorizado_por), puesto: 'Vo. Bo. Gerencia — Federación Mano Amiga' }
    : { contenido: `<img src="data:image/png;base64,${firma}" alt="Firma RCMA"/>`,
        nombre: 'Ricardo Joanathan Reyes Medina', puesto: 'Coordinador de Obras y Mantenimiento RCMA' };

  return documentoInstitucional({
    tituloPestana: `Ticket MAS — ${t.folio ?? ''}`,
    titulo: 'Ticket MAS',
    subtitulo: 'Construcciones, Mejoras y Mantenimiento',
    kpis: [
      { etiqueta: 'Folio', valor: val(t.folio), folio: true },
      { etiqueta: 'Estatus', valor: esc(ESTATUS_STYLE[t.estatus ?? 'pendiente']?.label ?? 'Pendiente'), pill: true },
      { etiqueta: 'Fecha', valor: esc(hoy) },
      { etiqueta: 'Importe', valor: fmx(t.cot1_importe) },
    ],
    cuerpo,
    firmas: [
      { contenido: `<span class="d">Enviado en el sistema<br/>${esc(enviado)}</span>`, nombre: val(t.nombre_solicitante),
        puesto: `Solicitante${t.puesto_solicitante ? ' · ' + esc(t.puesto_solicitante) : ''}` },
      firmaDerecha,
    ],
    referencia: `Ticket MAS ${t.folio ?? ''}${t.estatus === 'autorizado' ? ` · Autorizado el ${fechaAuth}` : ''}`,
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────
/** ¿El usuario autoriza tickets de FMA? (se lee directo de Accesos, también si es admin) */
function useEsAutorizadorFMA() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['es_autorizador_fma', user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data } = await supabase.from('user_permissions').select('autorizar_ticket_mas_fma').eq('user_email', user!.email!).maybeSingle();
      return !!(data as { autorizar_ticket_mas_fma?: boolean } | null)?.autorizar_ticket_mas_fma;
    },
  });
  return !!data;
}

export default function TicketMAS() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const esAutorizadorFMA = useEsAutorizadorFMA();
  const isAdmin = user?.user_metadata?.role === 'admin';
  // Gerencia sin acceso al listado general: solo ve su bandeja de tickets FMA
  if (esAutorizadorFMA && !isAdmin && !can('ver_ticket_mas')) return <VoBoFMA />;
  return <TicketMASPrincipal esAutorizadorFMA={esAutorizadorFMA} />;
}

function TicketMASPrincipal({ esAutorizadorFMA }: { esAutorizadorFMA: boolean }) {
  const { user }  = useAuth();
  const { getEco } = useEcoLookup();
  const { can }   = usePermissions();

  // Datos de quien está elaborando el ticket — se autocompletan y quedan de
  // solo lectura, así siempre coinciden con quien realmente está logueado.
  const { data: miPerfil } = useQuery({
    queryKey: ['mi_perfil_ticket_mas', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const { data } = await supabase.from('user_permissions').select('nombre, puesto').eq('user_email', user.email).maybeSingle();
      return data;
    },
    enabled: !!user?.email,
  });
  const miNombre = miPerfil?.nombre || user?.user_metadata?.nombre || '';
  const miPuesto = miPerfil?.puesto || '';
  const miCorreo = user?.email || '';
  const { filtrarPorAlcance } = useScope();
  const isAdmin   = user?.user_metadata?.role === 'admin';
  const [corrigiendo, setCorrigiendo] = useState(false);
  const qc        = useQueryClient();

  // Fuente única de verdad: nombre/director/administrador/razón social/correo
  // del CAR en vivo desde Directorio — ya no hay copia hardcodeada aquí.
  const { data: directorioRows = [] } = useDirectorio();
  const colegiosTicket = useMemo(() => buildColegiosTicket(directorioRows), [directorioRows]);

  const canVerLista  = isAdmin || can('ver_ticket_mas');
  const soloFormulario = !isAdmin && !can('ver_ticket_mas') && can('enviar_ticket_mas');
  const puedeCrear     = isAdmin || can('enviar_ticket_mas');
  const puedeAutorizar = isAdmin || can('autorizar_ticket_mas');
  const puedeCancelar  = isAdmin || can('cancelar_ticket_mas');

  // Vista: 'form' | 'lista' | 'detalle'
  const [vista, setVista] = useState<'form'|'lista'|'detalle'>('form');
  const [enviado, setEnviado]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [viewing, setViewing]     = useState<TicketMAS | null>(null);
  const [filterStatus, setFilter] = useState('todos');
  const [tmasVisibleCount, setTmasVisibleCount] = useState(TMAS_PAGE_SIZE);

  useEffect(() => {
    if (canVerLista) setVista('lista');
    // soloFormulario → se queda en 'form' (ya es el default)
  }, [canVerLista]);

  // ── Form state (llenado por colegio) ────────────────────────────────────────
  const FORM_INIT = {
    territorio:'', colegio:'', razon_social:'', sociedad:'', centro_gestor:'',
    director:'', admin_colegio:'', contador:'',
    nombre_solicitante: miNombre, puesto_solicitante: miPuesto, correo_solicitante: miCorreo,
    fecha_elaboracion: format(new Date(), 'yyyy-MM-dd'),
    clasificacion:'', periodicidad:'NORMAL', tipo_mantenimiento:'N/A',
    numero_activo:'', orden_interna:'NO', numero_orden_interna:'N/A',
    descripcion:'',
    cot1_importe:'', cot1_proveedor:'',
    cot2_importe:'', cot2_proveedor:'',
    cot3_importe:'', cot3_proveedor:'',
    motivo_seleccion:'', forma_financiamiento:'',
    elaborar_suplemento:'NO', elaborar_traspaso:'SI',
    nombre_proyecto:'',
  };
  const [form, setForm] = useState({ ...FORM_INIT });

  // Autocompletar Nombre/Puesto/Correo del solicitante con los datos reales
  // de quien está logueado — el usuario ya no los captura a mano.
  useEffect(() => {
    setForm(p => ({ ...p, nombre_solicitante: miNombre, puesto_solicitante: miPuesto, correo_solicitante: miCorreo }));
  }, [miNombre, miPuesto, miCorreo]);

  const DRAFT_KEY = 'tmas_draft_rescate';

  // Si hubo un intento fallido por falta de conexión anteriormente, ofrecer recuperarlo
  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        toast.warning('Se encontró un Ticket MAS sin enviar por falta de conexión.', {
          duration: 15000,
          action: {
            label: 'Recuperar',
            onClick: () => {
              setForm(parsed);
              localStorage.removeItem(DRAFT_KEY);
              toast.success('Borrador recuperado. Verifica los datos y envía de nuevo.');
            },
          },
        });
      } catch { localStorage.removeItem(DRAFT_KEY); }
    }
  }, []);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // ── Admin form state (llenado por Ricardo) ───────────────────────────────────
  const ADMIN_INIT = { fecha_recepcion:'', fecha_inicio_estimada:'', fecha_fin_estimada:'', areas_participantes:'', autorizado_por:'' };
  const [adminForm, setAdminForm] = useState({ ...ADMIN_INIT });
  const setA = (k: string, v: string) => setAdminForm(p => ({ ...p, [k]: v }));

  const [showCot2, setShowCot2] = useState(false);
  const [showCot3, setShowCot3] = useState(false);

  // Cancelación modal
  const [cancelModal, setCancelModal]     = useState<TicketMAS | null>(null);
  const [expedienteModal, setExpedienteModal] = useState<TicketMAS | null>(null);
  const [creandoExpediente, setCreandoExpediente] = useState(false);
  const [expForm, setExpForm] = useState({ solicitud_pdf: null as File | null, ticket_pdf: null as File | null, autorizacion_msg: null as File | null });
  const [motivoCancel, setMotivoCancel]   = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  const colegiosFiltrados = useMemo(() =>
    form.territorio ? colegiosTicket.filter(c => c.territorio === form.territorio) : [],
    [form.territorio]
  );

  const onTerritorioChange = (t: string) => {
    setForm(p => ({ ...p, territorio: t, colegio:'', razon_social:'', sociedad:'', centro_gestor:'', director:'', admin_colegio:'', contador:'' }));
  };

  const esMant = CLASES_MANTENIMIENTO.includes(form.clasificacion);

  const onClasificacionChange = (v: string) => {
    const m = CLASES_MANTENIMIENTO.includes(v);
    setForm(p => ({ ...p, clasificacion: v, tipo_mantenimiento: m ? '' : 'N/A' }));
  };

  // Al seleccionar colegio, auto-rellenar datos
  const onColegioChange = (nombre: string) => {
    const c = colegiosTicket.find(x => x.nombre === nombre);
    if (c) {
      setForm(p => ({
        ...p, colegio: nombre,
        razon_social: c.razon, sociedad: c.sociedad, centro_gestor: c.centro_gestor,
        territorio: c.territorio, director: c.director, admin_colegio: c.admin,
        contador: c.contador,
      }));
    } else {
      setForm(p => ({ ...p, colegio: nombre, razon_social:'', sociedad:'', centro_gestor:'', territorio:'', director:'', admin_colegio:'', contador:'' }));
    }
  };

  // ── Generar folio ─────────────────────────────────────────────────────────────
  const { data: rawTicketsMas = [], isLoading: loadingTickets } = useQuery({
    queryKey: ['tickets_mas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets_mas')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TicketMAS[];
    },
    enabled: canVerLista && !soloFormulario,
  });

  const tickets = useMemo(
    () => filtrarPorAlcance(rawTicketsMas, t => t.territorio, t => t.colegio),
    [rawTicketsMas, filtrarPorAlcance]
  );

  const ticketsFiltrados = useMemo(() => {
    if (filterStatus === 'todos') return tickets;
    return tickets.filter(t => t.estatus === filterStatus);
  }, [tickets, filterStatus]);

  const ticketsVisibles = useMemo(() => ticketsFiltrados.slice(0, tmasVisibleCount), [ticketsFiltrados, tmasVisibleCount]);
  const hasMoreTickets    = tmasVisibleCount < ticketsFiltrados.length;
  const remainingTickets  = ticketsFiltrados.length - tmasVisibleCount;

  // ── Enviar ticket ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!puedeCrear) { toast.error('No tienes permiso para crear Ticket MAS.'); return; }
    if (!form.nombre_solicitante || !form.puesto_solicitante || !form.correo_solicitante) {
      toast.error('Tu perfil no tiene nombre y/o puesto capturados — pide al administrador que los agregue en Accesos antes de continuar.');
      return;
    }
    if (!form.colegio || !form.descripcion || !form.clasificacion || !form.nombre_proyecto) {
      toast.error('Completa los campos obligatorios marcados con *');
      return;
    }
    if (form.orden_interna === 'SI' && (!form.numero_orden_interna || form.numero_orden_interna === 'N/A')) {
      toast.error('Debes ingresar el Número de Orden Interna');
      return;
    }
    if (form.clasificacion !== 'GARANTIAS') {
      const tieneCotizacion = form.cot1_importe && parseFloat(parseMXN(form.cot1_importe)) > 0;
      if (!tieneCotizacion) {
        toast.error('Debes capturar al menos la Cotización No. 1 con importe');
        return;
      }
    }
    // No se envía todavía — se pide confirmación explícita primero,
    // para evitar envíos accidentales antes de terminar de llenar el formulario.
    setShowConfirmSend(true);
  };

  const doSubmit = async () => {
    setShowConfirmSend(false);
    setLoading(true);
    try {
      // Generar folio: tomar el número máximo existente + 1 (evita duplicados por eliminados/cancelados)
      const currentYear = new Date().getFullYear();
      const { data: foliosExistentes } = await supabase.from('tickets_mas')
        .select('folio')
        .like('folio', `TMAS-${currentYear}-%`);
      let maxNum = 0;
      (foliosExistentes ?? []).forEach((row: any) => {
        const match = row.folio?.match(/TMAS-\d{4}-(\d+)$/);
        if (match) { const n = parseInt(match[1], 10); if (n > maxNum) maxNum = n; }
      });
      const num = maxNum + 1;
      const folio = `TMAS-${currentYear}-${String(num).padStart(3, '0')}`;

      const { error } = await supabase.from('tickets_mas').insert([{
        folio,
        colegio:              form.colegio,
        razon_social:         form.razon_social,
        sociedad:             form.sociedad,
        centro_gestor:        form.centro_gestor,
        territorio:           form.territorio,
        director:             form.director,
        admin_colegio:        form.admin_colegio,
        contador:             form.contador,
        nombre_solicitante:   form.nombre_solicitante,
        puesto_solicitante:   form.puesto_solicitante,
        correo_solicitante:   form.correo_solicitante,
        fecha_elaboracion:    form.fecha_elaboracion,
        clasificacion:        form.clasificacion,
        periodicidad:         form.periodicidad,
        tipo_mantenimiento:   form.tipo_mantenimiento,
        numero_activo:        form.numero_activo,
        orden_interna:        form.orden_interna,
        numero_orden_interna: form.numero_orden_interna,
        descripcion:          form.descripcion,
        nombre_proyecto:      form.nombre_proyecto,
        cot1_importe:         form.cot1_importe ? parseFloat(parseMXN(form.cot1_importe)) : null,
        cot1_proveedor:       form.cot1_proveedor,
        cot2_importe:         form.cot2_importe ? parseFloat(parseMXN(form.cot2_importe)) : null,
        cot2_proveedor:       form.cot2_proveedor,
        cot3_importe:         form.cot3_importe ? parseFloat(parseMXN(form.cot3_importe)) : null,
        cot3_proveedor:       form.cot3_proveedor,
        motivo_seleccion:     form.motivo_seleccion,
        forma_financiamiento: form.forma_financiamiento,
        elaborar_suplemento:  form.elaborar_suplemento,
        elaborar_traspaso:    form.elaborar_traspaso,
        estatus:              'pendiente',
      }]);
      if (error) throw error;

      logAudit({
        accion:       'crear',
        modulo:       'tickets_mas',
        registro_ref: folio,
        detalle:      { colegio: form.colegio, solicitante: form.nombre_solicitante, descripcion: form.descripcion },
      });

      // Quitar el acceso al formulario automáticamente tras enviarlo — así el
      // usuario no puede mandar otro ticket hasta que se le vuelva a habilitar
      // para el siguiente proyecto autorizado. No aplica al administrador.
      if (!isAdmin && user?.email) {
        try {
          await supabase.from('user_permissions')
            .update({ enviar_ticket_mas: false })
            .eq('user_email', user.email);
          qc.invalidateQueries({ queryKey: ['userPermissions', user.email] });
        } catch { /* no bloqueante — el ticket ya se creó correctamente */ }
      }

      notifyByEmail('rreyes@manoamiga.edu.mx', {
        tipo:    'info',
        titulo:  `Nuevo Ticket MAS: ${folio}`,
        mensaje: `${form.colegio} — ${form.descripcion?.slice(0, 80) ?? ''}`,
        link:    '/ticket-mas',
        modulo:  'tickets_mas',
      });

      // Notificar al coordinador
      await supabase.functions.invoke('notify-nuevo-ticket-mas', {
        body: {
          folio,
          colegio:            form.colegio,
          solicitante:        form.nombre_solicitante,
          puesto:             form.puesto_solicitante,
          correo_solicitante: form.correo_solicitante,
          descripcion:        form.descripcion,
          clasificacion:      form.clasificacion,
        },
      });

      // FMA: avisar a Gerencia que tiene un ticket pendiente de su Vo. Bo.
      if (form.territorio === 'FMA') {
        try {
          await avisarVoBoFMA('pendiente', {
            id: '', folio, colegio: form.colegio, nombre_proyecto: form.nombre_proyecto, descripcion: form.descripcion,
            nombre_solicitante: form.nombre_solicitante, correo_solicitante: form.correo_solicitante,
            cot1_proveedor: form.cot1_proveedor, cot1_importe: form.cot1_importe ? parseFloat(parseMXN(form.cot1_importe)) : null,
            forma_financiamiento: form.forma_financiamiento,
          });
        } catch {
          toast.warning('Ticket enviado, pero no se pudo avisar a Gerencia por correo. Puedes reenviar el aviso desde el ticket.');
        }
      }

      setEnviado(true);
    } catch (e: any) {
      // Si fue por falta de conexión, guardar el borrador localmente para no perder la captura
      const esErrorDeRed = !navigator.onLine || e?.message?.includes('fetch') || e?.message?.includes('network');
      if (esErrorDeRed) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
        toast.warning('📶 Sin conexión — Tu captura se guardó en este dispositivo. Vuelve a intentar enviar cuando tengas internet.', { duration: 10000 });
      } else {
        toast.error(e.message ?? 'Error al enviar el ticket');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Crear expediente manual (tickets existentes) ─────────────────────────────
  const crearExpedienteManual = async (t: TicketMAS) => {
    setCreandoExpediente(true);
    try {
      const anio = t.created_at ? new Date(t.created_at).getFullYear() : new Date().getFullYear();
      const colegioCarpeta  = limpiarSegmento(t.colegio ?? 'SIN_COLEGIO', 80);
      const folioCarpeta    = t.folio ?? 'SIN_FOLIO';
      const nombreCarpeta   = limpiarSegmento(t.nombre_proyecto ?? t.descripcion ?? 'Sin nombre');
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

      // Crear carpetas con placeholder
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
        const r = await spUp(placeholder, carpeta, '.keep');
        if (r?.error) throw new Error(`No se pudo crear "${carpeta}": ${r.error}`);
      }

      // Subir archivos que el usuario adjuntó
      let expedienteUrl = '';
      if (expForm.solicitud_pdf) {
        await spUp(expForm.solicitud_pdf, `${raiz}/Coordinación RCMA/01 - Solicitud de Proyecto`, expForm.solicitud_pdf.name);
      }
      if (expForm.ticket_pdf) {
        const r = await spUp(expForm.ticket_pdf, `${raiz}/Coordinación RCMA/03 - Ticket MAS`, expForm.ticket_pdf.name);
        expedienteUrl = r?.webUrl ?? '';
      }
      if (expForm.autorizacion_msg) {
        await spUp(expForm.autorizacion_msg, `${raiz}/Coordinación RCMA/04 - Autorización`, expForm.autorizacion_msg.name);
      }

      // Guardar URL en tickets_mas Y en tickets
      const urlBase = expedienteUrl
        ? expedienteUrl.split('/03%20-%20Ticket%20MAS')[0].split('/03 - Ticket MAS')[0]
        : null;
      await supabase.from('tickets_mas').update({ expediente_url: urlBase }).eq('id', t.id);
      if (urlBase && t.folio) {
        await supabase.from('tickets').update({ expediente_url: urlBase }).eq('folio', t.folio);
      }
      await qc.refetchQueries({ queryKey: ['tickets_mas'] });

      toast.success('Expediente creado en OneDrive ✓');
      setExpedienteModal(null);
      setExpForm({ solicitud_pdf: null, ticket_pdf: null, autorizacion_msg: null });
    } catch (e: any) {
      toast.error('Error creando expediente: ' + e.message);
    } finally {
      setCreandoExpediente(false);
    }
  };

  // ── Autorizar ticket ──────────────────────────────────────────────────────────
  const adminFieldsComplete = !!(adminForm.fecha_recepcion && adminForm.fecha_inicio_estimada && adminForm.fecha_fin_estimada
    && (viewing?.territorio !== 'FMA' || !!viewing?.vobo_at));

  // Genera el PDF del ticket como Blob para subir a OneDrive
  const generarPDFBlob = (t: TicketMAS): Blob => {
    const html = generarHTMLTicket(t, FIRMA_RCMA);
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  };

  const handleAutorizar = async () => {
    if (!puedeAutorizar) { toast.error('No tienes permiso para autorizar Ticket MAS.'); return; }
    if (!viewing || !adminFieldsComplete) return;
    const confirm = window.confirm(`¿Autorizar el ticket ${viewing.folio}?`);
    if (!confirm) return;
    try {
      const now = new Date().toISOString();
      const { data: updatedRow, error } = await supabase.from('tickets_mas')
        .update({
          estatus:               'autorizado',
          fecha_recepcion:        adminForm.fecha_recepcion,
          fecha_inicio_estimada:  adminForm.fecha_inicio_estimada,
          fecha_fin_estimada:     adminForm.fecha_fin_estimada,
          areas_participantes:    adminForm.areas_participantes,
          fecha_autorizacion:     now,
          autorizado_por:         viewing.territorio === 'FMA' ? (viewing.vobo_por ?? null) : null,
        })
        .eq('id', viewing.id)
        .select()
        .single();
      if (error) throw error;
      if (!updatedRow || updatedRow.estatus !== 'autorizado') throw new Error('No se pudo actualizar el estatus en la base de datos');

      logAudit({
        accion:       'autorizar',
        modulo:       'tickets_mas',
        registro_id:  updatedRow.id,
        registro_ref: updatedRow.folio,
        detalle:      { colegio: updatedRow.colegio, monto: updatedRow.cot1_importe, proveedor: updatedRow.cot1_proveedor },
      });

      // Correo del CAR — en vivo desde Directorio, del colegio específico del ticket
      const colegioTk = colegiosTicket.find(c => c.nombre === viewing.colegio);
      const correoCAR = colegioTk?.car_correo ?? '';

      if (correoCAR) {
        notifyByEmail(correoCAR, {
          tipo:    'exito',
          titulo:  `Ticket MAS Autorizado: ${updatedRow.folio}`,
          mensaje: `${updatedRow.colegio} — Proveedor: ${updatedRow.cot1_proveedor ?? '—'} — $${(updatedRow.cot1_importe ?? 0).toLocaleString('es-MX')}`,
          link:    '/ticket-mas',
          modulo:  'tickets_mas',
        });
      }

      await supabase.functions.invoke('notify-ticket-mas-autorizado', {
        body: {
          folio:              viewing.folio,
          colegio:            viewing.colegio,
          solicitante:        viewing.nombre_solicitante,
          correo_solicitante: viewing.correo_solicitante,
          territorio:         viewing.territorio,
          correo_car:         correoCAR,
          fecha_recepcion:    adminForm.fecha_recepcion,
          fecha_inicio:       adminForm.fecha_inicio_estimada,
          fecha_fin:          adminForm.fecha_fin_estimada,
          descripcion:        viewing.descripcion,
          clasificacion:      viewing.clasificacion,
        },
      });

      // ── Auto-registrar en Tickets Registrados al autorizar ────────────────────
      const { error: ticketRegError } = await supabase.from('tickets').insert({
        folio:               updatedRow.folio             ?? null,
        territorio:          updatedRow.territorio        ?? null,
        colegio:             colegioCodigoCorto(updatedRow.colegio, colegiosTicket),
        eco:                 getEco(colegioCodigoCorto(updatedRow.colegio, colegiosTicket) ?? '') || null,
        fecha:               adminForm.fecha_recepcion    ?? null,
        estatus:             'aprobado',
        tipo_proyecto:       updatedRow.clasificacion     ?? null,
        notas:               updatedRow.descripcion       ?? null,
        nombre_proyecto:     updatedRow.nombre_proyecto    ?? null,
        plan_financiamiento: updatedRow.forma_financiamiento ?? null,
        presupuesto:         updatedRow.cot1_importe        ?? null,
        nombre_proveedor:    updatedRow.cot1_proveedor      ?? null,
        asignacion:          null,
        ticket_fisico:       true,
        proyecto_id:         null,
      });
      if (ticketRegError) throw new Error(`Ticket autorizado pero no se pudo registrar en Tickets Registrados: ${ticketRegError.message}`);

      // ── Crear proyecto en Projects automáticamente ────────────────────────────
      if (updatedRow.nombre_proyecto) {
        const { data: proyecto, error: projError } = await supabase.from('projects').insert({
          name:          updatedRow.nombre_proyecto,
          status:        'en_espera',
          priority:      'media',
          territorio:    updatedRow.territorio    ?? null,
          colegio:       colegioCodigoCorto(updatedRow.colegio, colegiosTicket),
          eco:           getEco(colegioCodigoCorto(updatedRow.colegio, colegiosTicket) ?? '') || null,
          tipo_proyecto: updatedRow.clasificacion ?? null,
          notes:         updatedRow.descripcion   ?? null,
          folio:         updatedRow.folio         ?? null,
          type:          'Mantenimiento',
          progress:      0,
          budget:        updatedRow.cot1_importe  ?? null,
          start_date:    updatedRow.fecha_inicio_estimada ?? null,
          end_date:      updatedRow.fecha_fin_estimada    ?? null,
          responsible:   updatedRow.cot1_proveedor        ?? null,
        }).select().single();

        if (!projError && proyecto) {
          // Vincular el proyecto creado al ticket registrado
          await supabase.from('tickets').update({ proyecto_id: proyecto.id })
            .eq('folio', updatedRow.folio);
          // Refrescar la lista de proyectos disponibles para vincular en NEXUS
          qc.invalidateQueries({ queryKey: ['proyectos_nexus'] });
        }
      }

      // ── Crear estructura de expediente en OneDrive + subir PDF autorizado ────────
      try {
        const colegioCarpeta = limpiarSegmento(updatedRow.colegio ?? 'SIN_COLEGIO', 80);
        const folioCarpeta   = updatedRow.folio ?? 'SIN_FOLIO';
        const descripCarpeta = limpiarSegmento(updatedRow.nombre_proyecto ?? updatedRow.descripcion ?? 'Sin nombre');
        const anioAuth = new Date().getFullYear();
        const raiz = `Expedientes/${anioAuth}/${colegioCarpeta}/${folioCarpeta} - ${descripCarpeta}`;

        // Subcarpetas a crear (archivos placeholder vacíos para forzar la creación)
        const subcarpetas = [
          `${raiz}/Coordinación RCMA/01 - Solicitud de Proyecto/.keep`,
          `${raiz}/Coordinación RCMA/02 - Cotizaciones/.keep`,
          `${raiz}/Coordinación RCMA/03 - Ticket MAS/.keep`,
          `${raiz}/Coordinación RCMA/04 - Autorización/.keep`,
          `${raiz}/ECO/01 - Proyecto Ejecutivo/.keep`,
          `${raiz}/ECO/02 - Acta de Inicio/.keep`,
          `${raiz}/ECO/03 - Reportes de Obra/.keep`,
          `${raiz}/ECO/04 - Acta de Entrega/.keep`,
          `${raiz}/ECO/05 - Cierre de Obra/.keep`,
          `${raiz}/ECO/06 - Fotografías/Antes/.keep`,
          `${raiz}/ECO/06 - Fotografías/Durante/.keep`,
          `${raiz}/ECO/06 - Fotografías/Después/.keep`,
        ];

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token ?? '';
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
        const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

        const spUpload = async (fileObj: File, carpeta: string, fileName: string) => {
          const fd = new FormData();
          fd.append('file', fileObj); fd.append('carpeta', carpeta); fd.append('fileName', fileName);
          const res = await fetch(`${SUPABASE_URL}/functions/v1/sharepoint-upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'apikey': ANON_KEY },
            body: fd,
          });
          return res.json();
        };

        // Crear carpetas con archivos placeholder y capturar URL real
        const placeholder = new File([''], '.keep', { type: 'text/plain' });
        let expedienteUrl = '';
        for (const ruta of subcarpetas) {
          const partes  = ruta.split('/');
          const archivo = partes.pop()!;
          const carpeta = partes.join('/');
          const r = await spUpload(placeholder, carpeta, archivo);
          if (r?.error) throw new Error(`No se pudo crear "${carpeta}": ${r.error}`);
          // Capturar la primera URL que retorne para derivar la raíz
          if (!expedienteUrl && r?.webUrl) expedienteUrl = r.webUrl;
        }

        // Derivar URL raíz del expediente y guardarla en ambas tablas
        const urlBase = expedienteUrl
          ? expedienteUrl
              .split('/Coordinación%20RCMA')[0]
              .split('/Coordinaci%C3%B3n%20RCMA')[0]
              .split('/Coordinacion%20RCMA')[0]
              .split('/Coordinación RCMA')[0]
          : null;

        if (urlBase) {
          await supabase.from('tickets_mas').update({ expediente_url: urlBase }).eq('id', updatedRow.id);
          if (updatedRow.folio) {
            await supabase.from('tickets').update({ expediente_url: urlBase }).eq('folio', updatedRow.folio);
          }
        } else {
          // Si no se obtuvo URL (primer placeholder sin respuesta), dejar null pero no sobreescribir
          await supabase.from('tickets_mas').update({ expediente_url: null }).eq('id', updatedRow.id);
        }

      } catch (expErr) {
        console.error('Error creando expediente en OneDrive:', expErr);
        // No bloqueamos la autorización si falla el expediente
        const detalle = expErr instanceof Error ? expErr.message : '';
        toast.warning('Ticket autorizado, pero no se pudo crear el expediente en OneDrive.' + (detalle ? ` (${detalle})` : ''));
      }

      // Refetch inmediato desde el servidor
      await qc.refetchQueries({ queryKey: ['tickets_mas'] });
      await qc.refetchQueries({ queryKey: ['tickets'] });
      setViewing(null);
      setVista('lista');
      toast.success(`Ticket ${viewing.folio} autorizado y registrado automáticamente`);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al autorizar');
    }
  };

    // ── Imprimir ticket ────────────────────────────────────────────────────────────
  const handlePrint = (t: TicketMAS) => {
    const html = generarHTMLTicket(t, FIRMA_RCMA);
    imprimirHTML(html);
  };

  // ── Abrir para revisión ───────────────────────────────────────────────────────
  const handleVerTicket = async (t: TicketMAS) => {
    // Auto-cambiar a 'en_revision' al abrir el ticket (solo si está pendiente)
    if (t.estatus === 'pendiente') {
      await supabase.from('tickets_mas').update({ estatus: 'en_revision' }).eq('id', t.id);
      qc.invalidateQueries({ queryKey: ['tickets_mas'] });
      t = { ...t, estatus: 'en_revision' };
    }
    setViewing(t);
    setAdminForm({
      fecha_recepcion:       t.fecha_recepcion ?? '',
      fecha_inicio_estimada: t.fecha_inicio_estimada ?? '',
      fecha_fin_estimada:    t.fecha_fin_estimada ?? '',
      areas_participantes:   t.areas_participantes ?? '',
      autorizado_por:        t.autorizado_por ?? '',
    });
    setVista('detalle');
  };

  // ── Eliminar ─────────────────────────────────────────────────────────────────
  const handleEliminar = async (t: TicketMAS) => {
    if (!window.confirm(`¿Eliminar el ticket ${t.folio}? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabase.from('tickets_mas').delete().eq('id', t.id);
      if (error) throw error;
      toast.success('Ticket eliminado');
      qc.setQueryData(['tickets_mas'], (old: TicketMAS[] | undefined) =>
        (old ?? []).filter(tk => tk.id !== t.id)
      );
      qc.invalidateQueries({ queryKey: ['tickets_mas'] });
    } catch (e: any) { toast.error(e.message ?? 'Error al eliminar'); }
  };

  // ── Cambiar estatus ───────────────────────────────────────────────────────────
  const handleChangeStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('tickets_mas').update({ estatus: newStatus }).eq('id', id);
      if (error) throw error;
      toast.success('Estatus actualizado');
      setChangingStatus(null);
      qc.setQueryData(['tickets_mas'], (old: TicketMAS[] | undefined) =>
        (old ?? []).map(t => t.id === id ? { ...t, estatus: newStatus } : t)
      );
      qc.invalidateQueries({ queryKey: ['tickets_mas'] });
    } catch (e: any) { toast.error(e.message ?? 'Error'); }
  };

  // ── Cancelar con motivo ───────────────────────────────────────────────────────
  const handleCancelar = async () => {
    if (!puedeCancelar) { toast.error('No tienes permiso para cancelar Ticket MAS.'); return; }
    if (!cancelModal || !motivoCancel.trim()) { toast.error('Escribe el motivo'); return; }
    setCancelLoading(true);
    try {
      const fechaCancelacion = new Date().toISOString();
      const { error } = await supabase.from('tickets_mas')
        .update({ estatus: 'cancelado', motivo_cancelacion: motivoCancel, fecha_cancelacion: fechaCancelacion })
        .eq('id', cancelModal.id);
      if (error) throw error;

      logAudit({
        accion:       'cancelar',
        modulo:       'tickets_mas',
        registro_id:  cancelModal.id,
        registro_ref: cancelModal.folio,
        detalle:      { motivo: motivoCancel, cascada_ticket_y_proyecto: cancelModal.estatus === 'autorizado' },
      });

      notifyByEmail('rreyes@manoamiga.edu.mx', {
        tipo:    'alerta',
        titulo:  `Ticket MAS Cancelado: ${cancelModal.folio}`,
        mensaje: `${cancelModal.colegio ?? ''} — Motivo: ${motivoCancel}`,
        link:    '/ticket-mas',
        modulo:  'tickets_mas',
      });

      // Si el ticket ya estaba autorizado y tenía expediente, renombrar carpeta en OneDrive
      if (cancelModal.expediente_url && cancelModal.estatus === 'autorizado') {
        try {
          const anio           = cancelModal.created_at ? new Date(cancelModal.created_at).getFullYear() : new Date().getFullYear();
          const colegioCarpeta = limpiarSegmento(cancelModal.colegio ?? 'SIN_COLEGIO', 80);
          const folioCarpeta   = cancelModal.folio ?? 'SIN_FOLIO';
          const nombreCarpeta  = limpiarSegmento(cancelModal.nombre_proyecto ?? cancelModal.descripcion ?? 'Sin nombre');
          const carpetaActual  = `Expedientes/${anio}/${colegioCarpeta}/${folioCarpeta} - ${nombreCarpeta}`;
          const nuevoNombre    = `${folioCarpeta} - ${nombreCarpeta} — CANCELADO`;
          const renombrado     = await renameCarpetaSharePoint(carpetaActual, nuevoNombre);
          if (!renombrado) toast.warning('Ticket cancelado, pero no se pudo renombrar el expediente en OneDrive.');
        } catch { /* no bloqueante */ }
      }

      // Si el TMAS estaba autorizado: cancelar Ticket Registrado y eliminar Proyecto vinculado
      if (cancelModal.estatus === 'autorizado' && cancelModal.folio) {
        // 1. Obtener el ticket registrado por folio para saber su proyecto_id
        const { data: ticketReg } = await supabase
          .from('tickets')
          .select('id, proyecto_id')
          .eq('folio', cancelModal.folio)
          .maybeSingle();

        if (ticketReg) {
          // 2. Cancelar el ticket registrado
          await supabase.from('tickets')
            .update({ estatus: 'cancelado' })
            .eq('id', ticketReg.id);

            // 3. Cancelar el proyecto vinculado (no eliminar, conservar el registro)
            if (ticketReg.proyecto_id) {
              await supabase.from('projects')
                .update({ status: 'cancelado' })
                .eq('id', ticketReg.proyecto_id);
              // 4. El Seguimiento NEXUS pasa a "Proyectos Cancelados" con la misma
              //    fecha de la cancelación (así sale solo en esa semana de la presentación)
              await supabase.from('nexus_seguimientos')
                .update({ estatus: 'cancelado', cancelado_at: fechaCancelacion })
                .eq('proyecto_id', ticketReg.proyecto_id)
                .eq('estatus', 'activo');
              qc.invalidateQueries({ queryKey: ['nexus_seguimientos'] });
            }
        }

        // Refrescar la lista de tickets registrados
        qc.invalidateQueries({ queryKey: ['tickets'] });
        qc.invalidateQueries({ queryKey: ['projects'] });
      }

      // Actualizar caché inmediatamente para que el badge cambie al instante
      qc.setQueryData(['tickets_mas'], (old: TicketMAS[] | undefined) =>
        (old ?? []).map(t =>
          t.id === cancelModal.id
            ? { ...t, estatus: 'cancelado', motivo_cancelacion: motivoCancel, fecha_cancelacion: fechaCancelacion }
            : t
        )
      );
      // CAR del colegio en vivo desde Directorio (no por territorio — más preciso)
      const colegioCancel = colegiosTicket.find(c => c.nombre === cancelModal.colegio);
      const correoCAR_cancel = colegioCancel?.car_correo ?? '';
      const { error: emailError } = await supabase.functions.invoke('notify-ticket-mas-cancelado', {
        body: {
          folio: cancelModal.folio, colegio: cancelModal.colegio,
          solicitante: cancelModal.nombre_solicitante,
          correo_solicitante: cancelModal.correo_solicitante,
          territorio: cancelModal.territorio,
          correo_car: correoCAR_cancel,
          motivo: motivoCancel,
        },
      });
      if (emailError) toast.error('Ticket cancelado pero falló el correo: ' + emailError.message);
      // Forzar refetch inmediato y esperar datos frescos
      await qc.refetchQueries({ queryKey: ['tickets_mas'] });
      setCancelModal(null);
      setMotivoCancel('');
      toast.success(`Ticket ${cancelModal.folio} cancelado`);
    } catch (e: any) { toast.error(e.message ?? 'Error'); }
    finally { setCancelLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Formulario (usuarios y admin)
  // ─────────────────────────────────────────────────────────────────────────────
  if (soloFormulario || vista === 'form') {
    if (enviado) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-10 max-w-md text-center shadow">
            <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-xl font-black text-slate-800 mb-2">¡Ticket Enviado!</h2>
            <p className="text-sm text-slate-600 mb-6">El ticket ha sido registrado y se envió notificación al Coordinador de Obras.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { setEnviado(false); setForm({ ...FORM_INIT }); }}
                className="px-5 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">
                Nuevo ticket
              </button>
              {canVerLista && (
                <button onClick={() => { setEnviado(false); setForm({ ...FORM_INIT }); setVista('lista'); qc.invalidateQueries({ queryKey: ['tickets_mas'] }); }}
                  className="px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition">
                  Ver lista de tickets
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-3">
          {canVerLista && (
            <button onClick={() => setVista('lista')}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition">
              ← Volver a la lista
            </button>
          )}
          <PageHeader title="Ticket MAS" subtitle="Construcciones, Mejoras y Mantenimiento" icon={<ClipboardList className="w-5 h-5"/>} />
        </div>

        {/* ── Datos del solicitante ── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider">
            Datos del Solicitante
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Nombre completo</label>
              <input className={readOnlyClass} value={form.nombre_solicitante} readOnly placeholder="Sin nombre en tu perfil — pide que lo capturen en Accesos" />
            </div>
            <div>
              <label className={labelClass}>Puesto</label>
              <input className={readOnlyClass} value={form.puesto_solicitante} readOnly placeholder="Sin puesto en tu perfil — pide que lo capturen en Accesos" />
            </div>
            <div>
              <label className={labelClass}>Correo electrónico</label>
              <input className={readOnlyClass} value={form.correo_solicitante} readOnly />
            </div>
          </div>
          <p className="px-4 pb-3 text-[11px] text-slate-400 -mt-2">
            Estos datos se toman automáticamente de tu sesión — si algo está mal o vacío, pide que lo corrijan en Accesos.
          </p>
        </section>

        {/* ── Datos generales ── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider">
            1. Datos Generales
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Territorio *</label>
                <select className={selectClass} value={form.territorio} onChange={e => onTerritorioChange(e.target.value)}>
                  <option value="">— Seleccionar territorio —</option>
                  {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Colegio *</label>
                <select className={selectClass} value={form.colegio} onChange={e => onColegioChange(e.target.value)} disabled={!form.territorio}>
                  <option value="">— Seleccionar colegio —</option>
                  {colegiosFiltrados.map(c => <option key={c.codigo} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Razón Social</label>
                <input className={readOnlyClass} value={form.razon_social} readOnly />
              </div>
              <div>
                <label className={labelClass}>Centro Gestor</label>
                <input className={readOnlyClass} value={form.centro_gestor} readOnly />
              </div>
              <div>
                <label className={labelClass}>Sociedad</label>
                <input className={readOnlyClass} value={form.sociedad} readOnly />
              </div>
              <div>
                <label className={labelClass}>Contador</label>
                <input className={readOnlyClass} value={form.contador} readOnly />
              </div>
              <div>
                <label className={labelClass}>Fecha de Elaboración</label>
                <input className={inputClass} type="date" value={form.fecha_elaboracion} onChange={e => set('fecha_elaboracion', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Clasificación *</label>
                <select className={selectClass} value={form.clasificacion} onChange={e => onClasificacionChange(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {CLASIFICACIONES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Periodicidad</label>
                <select className={selectClass} value={form.periodicidad} onChange={e => set('periodicidad', e.target.value)}>
                  {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Tipo de Mantenimiento {esMant && <span className="text-red-500">*</span>}
                </label>
                {esMant ? (
                  <select className={selectClass} value={form.tipo_mantenimiento} onChange={e => set('tipo_mantenimiento', e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {TIPOS_MANT.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <input className={readOnlyClass} value="N/A" readOnly />
                )}
              </div>
              <div>
                <label className={labelClass}>Número de Activo <span className="text-slate-400 font-normal normal-case">(opcional)</span></label>
                <input className={inputClass} value={form.numero_activo} onChange={e => set('numero_activo', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Orden Interna</label>
                <select className={selectClass} value={form.orden_interna} onChange={e => {
                  const val = e.target.value;
                  setForm(p => ({
                    ...p,
                    orden_interna: val,
                    numero_orden_interna: val === 'NO' ? 'N/A' : '',
                  }));
                }}>
                  {SI_NO.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Número de Orden Interna {form.orden_interna === 'SI' && <span className="text-red-500">*</span>}
                </label>
                {form.orden_interna === 'SI' ? (
                  <input
                    className={inputClass}
                    value={form.numero_orden_interna}
                    onChange={e => set('numero_orden_interna', e.target.value)}
                    placeholder="Ingresa el número"
                  />
                ) : (
                  <input className={readOnlyClass} value="N/A" readOnly />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Descripción y cotizaciones ── */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider">
            2. Descripción y Cotizaciones
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className={labelClass}>Nombre del Proyecto *</label>
              <input className={inputClass} value={form.nombre_proyecto} onChange={e => set('nombre_proyecto', e.target.value)} placeholder="Ej: Mantenimiento de Luminarias Primaria" />
              <p className="text-[10px] text-slate-400 mt-1">Este nombre se usará para identificar el expediente y el proyecto vinculado.</p>
            </div>
            <div>
              <label className={labelClass}>Descripción de la obra *</label>
              <textarea className={inputClass + ' min-h-[80px] resize-none'} value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Describe detalladamente el trabajo requerido..." />
            </div>

            {/* Cotizaciones */}
            {[1, 2, 3].map(n => (
              <div key={n} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <label className={labelClass}>Cotización No. {n} — Proveedor</label>
                  <input className={inputClass} value={(form as any)[`cot${n}_proveedor`]} onChange={e => set(`cot${n}_proveedor`, e.target.value)} placeholder="Nombre del proveedor" />
                </div>
                <div>
                  <label className={labelClass}>Importe{n === 1 && form.clasificacion !== 'GARANTIAS' ? ' *' : ''}</label>
                  <input className={inputClass} value={(form as any)[`cot${n}_importe`]}
                    onChange={e => set(`cot${n}_importe`, formatMXN(e.target.value))}
                    placeholder={form.clasificacion === 'GARANTIAS' ? '$0.00 (no requerido)' : '$0.00'} />
                </div>
              </div>
            ))}

            <div>
              <label className={labelClass}>Motivo de Selección del Proveedor</label>
              <textarea className={inputClass + ' min-h-[60px] resize-none'} value={form.motivo_seleccion} onChange={e => set('motivo_seleccion', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Forma de Financiamiento</label>
                <input className={inputClass} value={form.forma_financiamiento} onChange={e => set('forma_financiamiento', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Elaborar Suplemento</label>
                <select className={selectClass} value={form.elaborar_suplemento} onChange={e => {
                  const val = e.target.value;
                  setForm(p => ({
                    ...p,
                    elaborar_suplemento: val,
                    elaborar_traspaso: val === 'NO' ? 'SI' : 'NO',
                  }));
                }}>
                  {SI_NO.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Elaborar Traspaso</label>
                <input className={readOnlyClass} value={form.elaborar_traspaso} readOnly />
              </div>
            </div>
          </div>
        </section>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-700 disabled:opacity-50 transition"
        >
          <Send className="w-4 h-4" />
          {loading ? 'Enviando...' : 'Enviar Ticket'}
        </button>

        {showConfirmSend && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">¿Enviar el Ticket MAS?</h2>
              </div>
              <p className="text-sm text-slate-600">
                Verifica que el colegio, la descripción y las cotizaciones estén correctas antes de continuar — una vez enviado, el Coordinador será notificado de inmediato.
              </p>
              {!isAdmin && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                  Después de enviarlo, este formulario se cerrará automáticamente hasta que el Coordinador habilite el acceso para tu siguiente ticket.
                </p>
              )}
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowConfirmSend(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                  Revisar de nuevo
                </button>
                <button onClick={doSubmit} disabled={loading}
                  className="px-4 py-2 text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-lg disabled:opacity-50 transition-colors">
                  {loading ? 'Enviando...' : 'Sí, enviar ticket'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Admin — Lista de tickets
  // ─────────────────────────────────────────────────────────────────────────────
  if (vista === 'lista') {
    return (
      <div className="w-full p-4 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <PageHeader title="Ticket MAS" subtitle="Revisión y autorización de tickets" icon={<ClipboardList className="w-5 h-5"/>} />
          <button
            onClick={() => { setForm({ ...FORM_INIT }); setVista('form'); }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition"
          >
            <Send className="w-4 h-4" /> Nuevo Ticket
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {['todos','pendiente','en_revision','autorizado','cancelado'].map(s => (
            <button key={s} onClick={() => { setFilter(s); setTmasVisibleCount(TMAS_PAGE_SIZE); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${filterStatus === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}>
              {s === 'todos' ? 'Todos' : ESTATUS_STYLE[s]?.label}
            </button>
          ))}
        </div>

        {loadingTickets ? (
          <div className="text-center py-12 text-slate-500 text-sm">Cargando tickets...</div>
        ) : ticketsFiltrados.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">No hay tickets en esta categoría</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-slate-800 text-white text-xs uppercase">
                  <th className="px-4 py-3 text-left w-[130px]">Folio</th>
                  <th className="px-4 py-3 text-left">Proyecto</th>
                  <th className="px-4 py-3 text-left w-[190px]">Colegio</th>
                  <th className="px-4 py-3 text-left w-[160px]">Solicitante</th>
                  <th className="px-4 py-3 text-left w-[170px]">Clasificación</th>
                  <th className="px-4 py-3 text-left w-[115px]">Fecha</th>
                  <th className="px-4 py-3 text-left w-[120px]">Estatus</th>
                  <th className="px-4 py-3 text-center w-[130px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ticketsVisibles.map((t, i) => {
                  const vencido = isVencido(t);
                  return (
                  <tr key={t.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${vencido ? 'border-l-4 border-l-red-400' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{t.folio}</td>
                    <td className="px-4 py-3 text-slate-800 text-xs font-medium"><div className="truncate" title={t.nombre_proyecto ?? ''}>{t.nombre_proyecto ?? <span className="text-slate-300 italic">Sin nombre</span>}</div></td>
                    <td className="px-4 py-3 text-slate-800 text-xs">{t.colegio}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{t.nombre_solicitante}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs leading-tight">{t.clasificacion}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm', { locale: es }) : '—'}
                      {vencido && <span className="block text-[10px] text-red-500 font-bold">⚠ +12h sin revisión</span>}
                    </td>
                    <td className="px-4 py-3">
                    <EstatusBadge estatus={t.estatus} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {/* Ver */}
                        <button onClick={() => handleVerTicket(t)} title="Revisar"
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition">
                          <Eye className="w-4 h-4" />
                        </button>
                        {/* Imprimir */}
                        <button onClick={() => handlePrint(t)} title="Imprimir"
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition">
                          <Printer className="w-4 h-4" />
                        </button>

                        {/* Crear Expediente — solo autorizados sin expediente aún */}
                        {isAdmin && t.estatus === 'autorizado' && !t.expediente_url && (
                          <button onClick={() => { setExpedienteModal(t); setExpForm({ solicitud_pdf: null, ticket_pdf: null, autorizacion_msg: null }); }} title="Crear Expediente en OneDrive"
                            className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600 transition">
                            <FolderPlus className="w-4 h-4" />
                          </button>
                        )}
                        {/* Ver Expediente — si ya existe */}
                        {t.expediente_url && (
                          <a href={t.expediente_url} target="_blank" rel="noreferrer" title="Ver Expediente en OneDrive"
                            className="p-1.5 rounded hover:bg-blue-50 text-[#00295A] transition">
                            <FolderPlus className="w-4 h-4" />
                          </a>
                        )}
                        {/* Cancelar */}
                        {puedeCancelar && t.estatus !== 'cancelado' && (
                          <button onClick={() => { setCancelModal(t); setMotivoCancel(''); }} title="Cancelar"
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 transition">
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        {/* Eliminar — solo admin */}
                        {isAdmin && (
                          <button onClick={() => handleEliminar(t)} title="Eliminar"
                            className="p-1.5 rounded hover:bg-red-50 text-red-600 transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {hasMoreTickets && (
              <div className="flex flex-col items-center gap-2 py-4 border-t border-slate-100">
                <button
                  onClick={() => setTmasVisibleCount(v => v + TMAS_PAGE_SIZE)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
                >
                  <ChevronDown className="w-4 h-4" />
                  Cargar más ({remainingTickets} restante{remainingTickets !== 1 ? 's' : ''})
                </button>
                <p className="text-xs text-slate-400">
                  Mostrando {ticketsVisibles.length} de {ticketsFiltrados.length} tickets
                </p>
              </div>
            )}
          </div>
        )}

        {/* Modal: Cambiar estatus */}
        {changingStatus && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xs">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-amber-500"/> Cambiar Estatus
                </h3>
                <button onClick={() => setChangingStatus(null)}><X className="w-5 h-5 text-slate-400"/></button>
              </div>
              <div className="p-3 space-y-2">
                {ESTATUSES_ADMIN.map(s => (
                  <button key={s} onClick={() => handleChangeStatus(changingStatus, s)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-left transition">
                    <span className={`w-2.5 h-2.5 rounded-full ${ESTATUS_STYLE[s]?.dot ?? 'bg-slate-400'}`}/>
                    <span className="text-sm font-medium text-slate-700">{ESTATUS_STYLE[s]?.label ?? s}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Crear Expediente */}
        {expedienteModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900">Crear Expediente en OneDrive</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{expedienteModal.folio} — {expedienteModal.colegio}</p>
                </div>
                <button onClick={() => setExpedienteModal(null)}><X className="w-5 h-5 text-slate-400" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                  📁 Se creará en: <strong>Expedientes/{expedienteModal.created_at ? new Date(expedienteModal.created_at).getFullYear() : new Date().getFullYear()}/{expedienteModal.colegio}/{expedienteModal.folio} - {(expedienteModal.nombre_proyecto ?? expedienteModal.descripcion ?? '').slice(0, 40)}</strong>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Solicitud de Proyecto (PDF) — opcional</label>
                  <input type="file" accept=".pdf" className="w-full text-xs border border-slate-200 rounded-lg p-2"
                    onChange={e => setExpForm(f => ({ ...f, solicitud_pdf: e.target.files?.[0] ?? null }))} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Ticket MAS (PDF) — opcional</label>
                  <input type="file" accept=".pdf" className="w-full text-xs border border-slate-200 rounded-lg p-2"
                    onChange={e => setExpForm(f => ({ ...f, ticket_pdf: e.target.files?.[0] ?? null }))} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Autorización (.msg o PDF) — opcional</label>
                  <input type="file" accept=".msg,.pdf" className="w-full text-xs border border-slate-200 rounded-lg p-2"
                    onChange={e => setExpForm(f => ({ ...f, autorizacion_msg: e.target.files?.[0] ?? null }))} />
                </div>
                <p className="text-xs text-slate-400">Los archivos son opcionales — puedes crear solo las carpetas vacías sin adjuntar nada.</p>
              </div>
              <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
                <button onClick={() => setExpedienteModal(null)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200">Cancelar</button>
                <button onClick={() => crearExpedienteManual(expedienteModal)} disabled={creandoExpediente}
                  className="px-4 py-2 bg-[#00295A] text-white rounded-lg text-sm font-medium hover:bg-[#4F82C2] flex items-center gap-2 disabled:opacity-50">
                  {creandoExpediente ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
                  {creandoExpediente ? 'Creando...' : 'Crear Expediente'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Cancelar con motivo */}
        {cancelModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Ban className="w-4 h-4 text-red-500"/> Cancelar Ticket {cancelModal.folio}
                </h3>
                <button onClick={() => setCancelModal(null)}><X className="w-5 h-5 text-slate-400"/></button>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-slate-600">Se enviará un correo de cancelación al solicitante con el motivo indicado.</p>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Motivo de cancelación *</label>
                  <textarea className="w-full mt-1 px-2 py-1.5 border border-slate-400 text-sm rounded focus:ring-1 focus:ring-slate-700 focus:outline-none min-h-[80px] resize-none"
                    value={motivoCancel} onChange={e => setMotivoCancel(e.target.value)}
                    placeholder="Describe el motivo de la cancelación..."/>
                </div>
              </div>
              <div className="flex gap-3 p-4 border-t">
                <button onClick={() => setCancelModal(null)}
                  className="flex-1 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Volver
                </button>
                <button onClick={handleCancelar} disabled={cancelLoading || !motivoCancel.trim()}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition">
                  {cancelLoading ? 'Cancelando...' : 'Confirmar Cancelación'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Admin — Detalle / Revisión del ticket
  // ─────────────────────────────────────────────────────────────────────────────
  if (vista === 'detalle' && viewing) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => { setVista('lista'); setViewing(null); }}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition">
            ← Volver
          </button>
          <h1 className="text-lg font-black text-slate-800">Ticket {viewing.folio}</h1>
          <EstatusBadge estatus={viewing.estatus} />
          <MarcaCorregida modulo="tickets_mas" id={viewing.id} />
          <div className="ml-auto flex gap-2">
            <BotonCorregir modulo="tickets_mas" estatus={viewing.estatus} onClick={() => setCorrigiendo(true)} />
            <button onClick={() => handlePrint(viewing)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 transition">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
          </div>
        </div>

        {/* Datos del ticket (solo lectura) */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider">Datos del Ticket (enviado por el colegio)</div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {[
              ['Colegio', viewing.colegio],
              ['Territorio', viewing.territorio],
              ['Razón Social', viewing.razon_social],
              ['Centro Gestor', viewing.centro_gestor],
              ['Sociedad', viewing.sociedad],
              ['Contador', viewing.contador],
              ['Solicitante', viewing.nombre_solicitante],
              ['Puesto', viewing.puesto_solicitante],
              ['Correo', viewing.correo_solicitante],
              ['Clasificación', viewing.clasificacion],
              ['Periodicidad', viewing.periodicidad],
              ['Tipo Mant.', viewing.tipo_mantenimiento],
              ['Orden Interna', viewing.orden_interna],
              ['Suplemento', viewing.elaborar_suplemento],
              ['Traspaso', viewing.elaborar_traspaso],
            ].map(([k, v]) => (
              <div key={k} className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase">{k}</p>
                <p className="text-slate-800 font-medium text-xs mt-0.5">{v ?? '—'}</p>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4">
            {viewing.nombre_proyecto && (
              <div className="mb-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre del Proyecto</p>
                <p className="text-sm font-bold text-[#00295A] bg-blue-50 rounded-lg p-3">{viewing.nombre_proyecto}</p>
              </div>
            )}
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Descripción</p>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{viewing.descripcion ?? '—'}</p>
          </div>
          {/* Cotizaciones */}
          <div className="px-4 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Cotizaciones</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[1,2,3].map(n => (
                <div key={n} className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500">COT. No. {n}</p>
                  <p className="text-xs text-slate-700 mt-1">{(viewing as any)[`cot${n}_proveedor`] ?? '—'}</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{fmx((viewing as any)[`cot${n}_importe`])}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Motivo de selección</p>
                <p className="text-slate-800 text-xs mt-0.5 whitespace-pre-wrap">{viewing.motivo_seleccion || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Forma de financiamiento</p>
                <p className="text-slate-800 text-xs mt-0.5">{viewing.forma_financiamiento || '—'}</p>
              </div>
            </div>
          </div>
          <div className="px-4 pb-4 empty:hidden"><HistorialCorrecciones modulo="tickets_mas" id={viewing.id} /></div>
        </section>

        {corrigiendo && (
          <CorregirModal config={CORRECCION_TICKET_MAS} registro={viewing}
            referencia={`${viewing.folio ?? 'Ticket MAS'} — ${viewing.colegio ?? ''}`}
            onClose={() => setCorrigiendo(false)}
            onSaved={act => { setCorrigiendo(false); setViewing(act); qc.invalidateQueries({ queryKey: ['tickets_mas'] }); }} />
        )}

        {/* Vo. Bo. de Gerencia (tickets FMA) para quien tiene el permiso */}
        {esAutorizadorFMA && viewing.territorio === 'FMA' && pendienteVoBo(viewing) && viewing.correo_solicitante?.toLowerCase() !== user?.email?.toLowerCase() && (
          <PanelVoBoFMA ticket={viewing} onHecho={act => { setViewing({ ...viewing, ...act } as TicketMAS); qc.invalidateQueries({ queryKey: ['tickets_mas'] }); }} />
        )}
        {viewing.territorio === 'FMA' && viewing.estatus === 'autorizado' && <EstadoVoBoFMA ticket={viewing} />}

        {/* Campos del coordinador */}
        {viewing.estatus !== 'autorizado' && viewing.estatus !== 'cancelado' && (
          <section className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden">
            <div className="bg-blue-700 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <FileCheck className="w-4 h-4" /> Campos del Coordinador (Ventanilla Única)
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Fecha de Recepción *</label>
                <input className={inputClass} type="date" value={adminForm.fecha_recepcion} onChange={e => setA('fecha_recepcion', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Fecha Estimada de Inicio *</label>
                <input className={inputClass} type="date" value={adminForm.fecha_inicio_estimada} onChange={e => setA('fecha_inicio_estimada', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Fecha Estimada de Conclusión *</label>
                <input className={inputClass} type="date" value={adminForm.fecha_fin_estimada} onChange={e => setA('fecha_fin_estimada', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Áreas Participantes</label>
                <textarea className={inputClass + ' min-h-[60px] resize-none'} value={adminForm.areas_participantes} onChange={e => setA('areas_participantes', e.target.value)} placeholder="Ej: Gerente Administrativo MAS, Coord. Obras RCMA..." />
              </div>
              {viewing.territorio === 'FMA' && (
                <div className="md:col-span-2 space-y-2">
                  <EstadoVoBoFMA ticket={viewing} />
                  {!viewing.vobo_at && (
                    <button type="button" onClick={async () => {
                        try { const r = await avisarVoBoFMA('pendiente', viewing); toast.success(`Aviso enviado a ${r.para}`); }
                        catch (e: any) { toast.error(e.message ?? 'No se pudo enviar el aviso'); }
                      }}
                      className="text-xs font-bold text-blue-700 hover:underline">Reenviar aviso a Gerencia para su Vo. Bo.</button>
                  )}
                </div>
              )}
            </div>

            <div className="px-4 pb-4">
              <button
                onClick={handleAutorizar}
                disabled={!adminFieldsComplete || !puedeAutorizar}
                title={!puedeAutorizar ? 'No tienes permiso para autorizar' : undefined}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-bold text-sm rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <CheckCircle className="w-5 h-5" />
                Autorizar Ticket
              </button>
              {!adminFieldsComplete && (
                <p className="text-xs text-center text-slate-400 mt-2">
                  {viewing.territorio === 'FMA' && !viewing.vobo_at
                    ? 'Ticket de FMA: se habilita cuando Gerencia dé su Vo. Bo. y estén las 3 fechas'
                    : 'Llena los 3 campos de fecha para habilitar la autorización'}
                </p>
              )}
            </div>
          </section>
        )}

        {viewing.estatus === 'autorizado' && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-emerald-700">Este ticket fue autorizado</p>
            <p className="text-xs text-emerald-600 mt-1">
              Recepción: {viewing.fecha_recepcion ?? '—'} · Inicio: {viewing.fecha_inicio_estimada ?? '—'} · Conclusión: {viewing.fecha_fin_estimada ?? '—'}
            </p>
            {viewing.expediente_url && (
              <a href={viewing.expediente_url} target="_blank" rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00295A] text-white text-xs font-bold hover:bg-[#4F82C2] transition-colors">
                📁 Ver Expediente en OneDrive
              </a>
            )}
          </div>
        )}

        {viewing.estatus === 'cancelado' && (
          <div className="space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex items-center gap-3">
              <CheckCircle className="w-4 h-4 text-slate-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-500">Ticket autorizado previamente</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Recepción: {viewing.fecha_recepcion ?? '—'} · Inicio: {viewing.fecha_inicio_estimada ?? '—'} · Conclusión: {viewing.fecha_fin_estimada ?? '—'}
                </p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <Ban className="w-6 h-6 text-red-500 mx-auto mb-1" />
              <p className="text-sm font-bold text-red-700">Este ticket fue cancelado</p>
              {viewing.fecha_cancelacion && (
                <p className="text-xs text-red-500 mt-0.5">
                  {new Date(viewing.fecha_cancelacion).toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' })}
                </p>
              )}
              {viewing.motivo_cancelacion && (
                <p className="text-xs text-red-600 mt-1 bg-red-100 rounded-lg px-3 py-1.5 inline-block">
                  Motivo: {viewing.motivo_cancelacion}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
