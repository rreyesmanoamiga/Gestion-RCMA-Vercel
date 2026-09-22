import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useScope } from '@/hooks/useScope';
import { useDirectorio, type DirectorioColegio, findColegio, getGerenteFMA, getDirectorNacional } from '@/lib/directorio';
import {
  Send, CheckCircle, Eye, X, Printer, ClipboardList,
  ChevronDown, Clock, Trash2, Ban, AlertCircle, AlertTriangle, ShieldCheck,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { logAudit } from '@/lib/audit';
import { notifyByEmail } from '@/lib/notifications';

const TMASCN_PAGE_SIZE = 20;

const FIRMA_ADMIN_EMAIL = 'rreyes@manoamiga.edu.mx';

const inputClass    = "w-full px-2 py-1.5 border border-slate-400 text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white text-slate-900 rounded";
const readOnlyClass = "w-full px-2 py-1.5 border border-slate-300 text-sm bg-slate-100 text-slate-600 cursor-default rounded";
const labelClass    = "text-[11px] font-bold text-slate-600 uppercase tracking-wide";
const selectClass   = "w-full px-2 py-1.5 border border-slate-400 text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white text-slate-900 rounded";

const COLEGIOS_CN_FMA = [
  { nombre: 'OF. MTY',  codigo: 'MTY-OF',  territorio: 'FMA' },
  { nombre: 'OF. CDMX', codigo: 'CDMX-OF', territorio: 'FMA' },
  { nombre: 'GENERAL',  codigo: 'FMA-GEN', territorio: 'FMA' },
];

function buildColegiosTicketCN(directorioRows: DirectorioColegio[]) {
  const deColegios = directorioRows
    .filter(r => r.territorio === 'NORTE' || r.territorio === 'MEXICO')
    .map(r => ({
      nombre: r.nombre, razon: r.nombre_oficial, territorio: r.territorio,
      director: r.dir_nombre, admin: r.adm_nombre, car_correo: r.car_correo,
      sociedad: r.sociedad ?? '', centro_gestor: r.centro_gestor ?? '',
      contador: r.contador_nombre ?? '',
    }));
  const deFMA = COLEGIOS_CN_FMA.map(f => {
    const general = findColegio(directorioRows, 'GENERAL');
    const gerente = getGerenteFMA(directorioRows);
    const directorNac = getDirectorNacional(directorioRows);
    return {
      nombre: f.nombre, razon: general?.nombre_oficial ?? 'Federación Mano Amiga A.C.', territorio: f.territorio,
      director: directorNac.nombre, admin: gerente.nombre, car_correo: general?.car_correo ?? '',
      sociedad: general?.sociedad ?? '', centro_gestor: general?.centro_gestor ?? '',
      contador: general?.contador_nombre ?? '',
    };
  });
  return [...deColegios, ...deFMA];
}

const TERRITORIOS = ['NORTE', 'MEXICO', 'FMA'];

interface TicketMASCN {
  id: string; folio?: string; tramite_id?: string | null;
  colegio?: string; razon_social?: string; sociedad?: string; centro_gestor?: string;
  territorio?: string; director?: string; admin_colegio?: string; contador?: string;
  nombre_solicitante?: string; puesto_solicitante?: string; correo_solicitante?: string;
  fecha_elaboracion?: string;
  concepto_id?: string; concepto_nombre?: string; especificacion?: string;
  descripcion?: string;
  cot1_importe?: number | null; cot1_proveedor?: string;
  cot2_importe?: number | null; cot2_proveedor?: string;
  cot3_importe?: number | null; cot3_proveedor?: string;
  motivo_seleccion?: string; forma_financiamiento?: string;
  estatus?: string;
  fecha_recepcion?: string; fecha_autorizacion?: string;
  motivo_cancelacion?: string; fecha_cancelacion?: string;
  created_at?: string;
}

const fmx = (n?: number | null) =>
  n != null ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—';

const formatMXN = (v: string) => {
  const clean = v.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = parts[1] !== undefined ? '.' + parts[1].slice(0, 2) : '';
  return clean ? '$' + int + dec : '';
};
const parseMXN = (v: string) => v.replace(/[^0-9.]/g, '');

const ESTATUS_STYLE: Record<string, { bg: string; dot: string; label: string }> = {
  pendiente:    { bg: 'bg-amber-50 border border-amber-200 text-amber-700',       dot: 'bg-amber-400',   label: 'Pendiente' },
  en_revision:  { bg: 'bg-blue-50 border border-blue-200 text-blue-700',          dot: 'bg-blue-500',    label: 'En Revisión' },
  autorizado:   { bg: 'bg-emerald-50 border border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', label: 'Autorizado' },
  rechazado:    { bg: 'bg-red-50 border border-red-200 text-red-700',             dot: 'bg-red-500',     label: 'Rechazado' },
  cancelado:    { bg: 'bg-slate-100 border border-slate-300 text-slate-500',      dot: 'bg-slate-400',   label: 'Cancelado' },
};

function EstatusBadge({ estatus }: { estatus?: string }) {
  const s = ESTATUS_STYLE[estatus ?? 'pendiente'] ?? ESTATUS_STYLE.pendiente;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
    </span>
  );
}

function generarHTMLTicketCN(t: TicketMASCN): string {
  const hoy = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: es });
  const fechaAuth = t.fecha_autorizacion ? format(new Date(t.fecha_autorizacion), "dd/MM/yyyy", { locale: es }) : hoy;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><title>Ticket MAS CN — ${t.folio ?? ''}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,sans-serif;font-size:10.5px;color:#3A4450;padding:18px;}
.header{background:#272D35;color:white;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-radius:4px 4px 0 0;}
.header h1{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;}
.header h2{font-size:9px;color:#8F9DAE;margin-top:2px;text-transform:uppercase;}
.header img{height:44px;width:auto;object-fit:contain;}
.sub-header{background:#224167;color:white;padding:6px 16px;font-size:11px;font-weight:700;display:flex;justify-content:space-between;margin-bottom:10px;}
.section{margin-bottom:10px;}
.section-title{background:#D3D8DF;padding:4px 10px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#5E6E82;border-bottom:1px solid #B2BCC7;border-top:1px solid #B2BCC7;}
table{width:100%;border-collapse:collapse;}
td{border:1px solid #B2BCC7;padding:4px 7px;font-size:10.5px;}
.lbl{background:#F6F7F9;font-weight:700;color:#5E6E82;width:140px;text-transform:uppercase;font-size:9.5px;}
.val{color:#3A4450;}
.th{background:#3A4450;color:white;font-size:9.5px;font-weight:700;text-transform:uppercase;padding:5px 7px;text-align:center;}
.num{text-align:right;font-family:monospace;}
.footer{margin-top:14px;border-top:1px solid #D3D8DF;padding-top:8px;text-align:center;font-size:8.5px;color:#8F9DAE;}
@media print{body{padding:8px;}}
</style></head>
<body>
  <div class="header">
    <div><h1>Red de Colegios Mano Amiga</h1><h2>Ticket MAS CN — Cumplimiento Normativo / Protección Civil</h2></div>
    <img src="/colegio-mano-amiga.png" alt="Logo"/>
  </div>
  <div class="sub-header">
    <span>Folio: ${t.folio ?? '—'}</span>
    <span>Estatus: ${ESTATUS_STYLE[t.estatus ?? 'pendiente']?.label ?? 'Pendiente'}</span>
    <span>Fecha: ${hoy}</span>
  </div>
  <div class="section">
    <div class="section-title">1. Datos Generales</div>
    <table>
      <tr><td class="lbl">Colegio</td><td class="val">${t.colegio ?? '—'}</td><td class="lbl">Razón Social</td><td class="val">${t.razon_social ?? '—'}</td></tr>
      <tr><td class="lbl">Centro Gestor</td><td class="val">${t.centro_gestor ?? '—'}</td><td class="lbl">Sociedad</td><td class="val">${t.sociedad ?? '—'}</td></tr>
      <tr><td class="lbl">Territorio</td><td class="val">${t.territorio ?? '—'}</td><td class="lbl">Fecha Elaboración</td><td class="val">${t.fecha_elaboracion ?? '—'}</td></tr>
      <tr><td class="lbl">Solicitante</td><td class="val">${t.nombre_solicitante ?? '—'}</td><td class="lbl">Puesto</td><td class="val">${t.puesto_solicitante ?? '—'}</td></tr>
      <tr><td class="lbl">Correo</td><td class="val">${t.correo_solicitante ?? '—'}</td><td class="lbl">Contador</td><td class="val">${t.contador ?? '—'}</td></tr>
      <tr><td class="lbl">Concepto Base</td><td class="val">${t.concepto_nombre ?? '—'}</td><td class="lbl">Especificación</td><td class="val">${t.especificacion ?? '—'}</td></tr>
    </table>
  </div>
  <div class="section">
    <div class="section-title">2. Descripción y Cotizaciones</div>
    <table><tr><td class="lbl">Descripción</td><td class="val" colspan="3" style="white-space:pre-wrap;">${t.descripcion ?? '—'}</td></tr></table>
    <table style="margin-top:4px;">
      <tr><td class="th" style="width:20%;">Cotización</td><td class="th">Proveedor</td><td class="th" style="width:15%;">Importe</td></tr>
      <tr><td class="lbl">Cotización No. 1</td><td class="val">${t.cot1_proveedor ?? '—'}</td><td class="num">${fmx(t.cot1_importe)}</td></tr>
      <tr><td class="lbl">Cotización No. 2</td><td class="val">${t.cot2_proveedor ?? '—'}</td><td class="num">${fmx(t.cot2_importe)}</td></tr>
      <tr><td class="lbl">Cotización No. 3</td><td class="val">${t.cot3_proveedor ?? '—'}</td><td class="num">${fmx(t.cot3_importe)}</td></tr>
    </table>
    <table style="margin-top:4px;">
      <tr><td class="lbl">Motivo de Selección</td><td class="val">${t.motivo_seleccion ?? '—'}</td></tr>
      <tr><td class="lbl">Forma de Financiamiento</td><td class="val">${t.forma_financiamiento ?? '—'}</td></tr>
    </table>
  </div>
  <div class="section">
    <div class="section-title">3. Autorización</div>
    <table><tr><td class="lbl">Fecha Recepción</td><td class="val">${t.fecha_recepcion ?? '—'}</td><td class="lbl">Fecha Autorización</td><td class="val">${fechaAuth}</td></tr></table>
  </div>
  <div class="footer">Ticket autorizado el ${fechaAuth} · Sistema RCMA — Cumplimiento Normativo © ${new Date().getFullYear()}</div>
</body></html>`;
}

export default function TicketMASCN() {
  const { user } = useAuth();
  const { can, isAdmin } = usePermissions();
  const { filtrarPorAlcance } = useScope();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const tramiteIdParam = searchParams.get('tramite_id');

  const { data: directorioRows = [] } = useDirectorio();
  const colegiosCN = useMemo(() => buildColegiosTicketCN(directorioRows), [directorioRows]);

  const { data: conceptos = [] } = useQuery({
    queryKey: ['compliance_conceptos_activos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_conceptos').select('id, nombre, materia').eq('activo', true).order('orden');
      if (error) throw error;
      return (data ?? []) as { id: string; nombre: string; materia: string }[];
    },
  });

  const canVerLista    = isAdmin || can('ver_ticket_mas_cn');
  const puedeCrear      = isAdmin || can('enviar_ticket_mas_cn');
  const puedeAutorizar  = isAdmin || can('autorizar_ticket_mas_cn');
  const puedeCancelar   = isAdmin || can('cancelar_ticket_mas_cn');

  const [vista, setVista] = useState<'form'|'lista'|'detalle'>('form');
  const [enviado, setEnviado]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);
  const [viewing, setViewing]   = useState<TicketMASCN | null>(null);
  const [filterStatus, setFilter] = useState('todos');
  const [visibleCount, setVisibleCount] = useState(TMASCN_PAGE_SIZE);

  useEffect(() => { if (canVerLista && !tramiteIdParam) setVista('lista'); }, [canVerLista, tramiteIdParam]);

  const FORM_INIT = {
    tramite_id: '', territorio:'', colegio:'', razon_social:'', sociedad:'', centro_gestor:'',
    director:'', admin_colegio:'', contador:'',
    nombre_solicitante:'', puesto_solicitante:'', correo_solicitante:'',
    fecha_elaboracion: format(new Date(), 'yyyy-MM-dd'),
    concepto_id:'', concepto_nombre:'', especificacion:'',
    descripcion:'',
    cot1_importe:'', cot1_proveedor:'', cot2_importe:'', cot2_proveedor:'', cot3_importe:'', cot3_proveedor:'',
    motivo_seleccion:'', forma_financiamiento:'',
  };
  const [form, setForm] = useState({ ...FORM_INIT });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // Autollenado del perfil del usuario con sesión iniciada
  const { data: miPerfil } = useQuery({
    queryKey: ['mi_perfil_ticket_mas_cn', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const { data } = await supabase.from('user_permissions').select('nombre, puesto').eq('user_email', user.email).maybeSingle();
      return data;
    },
    enabled: !!user?.email,
  });
  useEffect(() => {
    setForm(p => ({
      ...p,
      nombre_solicitante: miPerfil?.nombre ?? p.nombre_solicitante,
      puesto_solicitante: miPerfil?.puesto ?? p.puesto_solicitante,
      correo_solicitante: user?.email ?? p.correo_solicitante,
    }));
  }, [miPerfil, user?.email]);

  // Prellenado desde un Trámite CN (?tramite_id=...)
  const { data: tramiteOrigen } = useQuery({
    queryKey: ['tramite_cn_origen', tramiteIdParam],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_tramites_cn').select('*').eq('id', tramiteIdParam!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!tramiteIdParam,
  });
  useEffect(() => {
    if (tramiteOrigen) {
      const c = colegiosCN.find(x => x.nombre === tramiteOrigen.colegio);
      setForm(p => ({
        ...p, tramite_id: tramiteOrigen.id,
        territorio: tramiteOrigen.territorio ?? c?.territorio ?? '',
        colegio: tramiteOrigen.colegio ?? '',
        razon_social: c?.razon ?? '', sociedad: c?.sociedad ?? '', centro_gestor: c?.centro_gestor ?? '',
        director: c?.director ?? '', admin_colegio: c?.admin ?? '', contador: c?.contador ?? '',
        concepto_id: tramiteOrigen.concepto_id ?? '', concepto_nombre: tramiteOrigen.concepto_nombre ?? '',
        especificacion: tramiteOrigen.especificacion ?? '',
        descripcion: tramiteOrigen.descripcion ?? '',
      }));
      setVista('form');
    }
  }, [tramiteOrigen, colegiosCN]);

  const [cancelModal, setCancelModal] = useState<TicketMASCN | null>(null);
  const [motivoCancel, setMotivoCancel] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [adminForm, setAdminForm] = useState({ fecha_recepcion: '', fecha_inicio_estimada: '', fecha_fin_estimada: '' });
  const setA = (k: string, v: string) => setAdminForm(p => ({ ...p, [k]: v }));

  const colegiosFiltrados = useMemo(() => form.territorio ? colegiosCN.filter(c => c.territorio === form.territorio) : [], [form.territorio, colegiosCN]);

  const onTerritorioChange = (t: string) => setForm(p => ({ ...p, territorio: t, colegio:'', razon_social:'', sociedad:'', centro_gestor:'', director:'', admin_colegio:'', contador:'' }));
  const onColegioChange = (nombre: string) => {
    const c = colegiosCN.find(x => x.nombre === nombre);
    setForm(p => ({ ...p, colegio: nombre, razon_social: c?.razon ?? '', sociedad: c?.sociedad ?? '', centro_gestor: c?.centro_gestor ?? '', territorio: c?.territorio ?? p.territorio, director: c?.director ?? '', admin_colegio: c?.admin ?? '', contador: c?.contador ?? '' }));
  };
  const onConcepto = (id: string) => {
    const c = conceptos.find(c => c.id === id);
    setForm(p => ({ ...p, concepto_id: id, concepto_nombre: c?.nombre ?? '' }));
  };

  const { data: rawTickets = [], isLoading: loadingTickets } = useQuery({
    queryKey: ['compliance_tickets_mas_cn'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_tickets_mas_cn').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TicketMASCN[];
    },
    enabled: canVerLista,
  });
  const tickets = useMemo(() => filtrarPorAlcance(rawTickets, t => t.territorio, t => t.colegio), [rawTickets, filtrarPorAlcance]);
  const ticketsFiltrados = useMemo(() => filterStatus === 'todos' ? tickets : tickets.filter(t => t.estatus === filterStatus), [tickets, filterStatus]);
  const ticketsVisibles = ticketsFiltrados.slice(0, visibleCount);
  const hasMore = visibleCount < ticketsFiltrados.length;

  const handleSubmit = () => {
    if (!puedeCrear) { toast.error('No tienes permiso para crear Ticket MAS CN.'); return; }
    if (!form.colegio || !form.nombre_solicitante || !form.correo_solicitante || !form.descripcion || !form.concepto_id) {
      toast.error('Completa los campos obligatorios marcados con *'); return;
    }
    const tieneCotizacion = form.cot1_importe && parseFloat(parseMXN(form.cot1_importe)) > 0;
    if (!tieneCotizacion) { toast.error('Debes capturar al menos la Cotización No. 1 con importe'); return; }
    setShowConfirmSend(true);
  };

  const doSubmit = async () => {
    setShowConfirmSend(false);
    setLoading(true);
    try {
      const currentYear = new Date().getFullYear();
      const { data: existentes } = await supabase.from('compliance_tickets_mas_cn').select('folio').like('folio', `TMASCN-${currentYear}-%`);
      let maxNum = 0;
      (existentes ?? []).forEach((row: any) => { const m = row.folio?.match(/TMASCN-\d{4}-(\d+)$/); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)); });
      const folio = `TMASCN-${currentYear}-${String(maxNum + 1).padStart(3, '0')}`;

      const { error } = await supabase.from('compliance_tickets_mas_cn').insert([{
        folio, tramite_id: form.tramite_id || null,
        colegio: form.colegio, razon_social: form.razon_social, sociedad: form.sociedad, centro_gestor: form.centro_gestor,
        territorio: form.territorio, director: form.director, admin_colegio: form.admin_colegio, contador: form.contador,
        nombre_solicitante: form.nombre_solicitante, puesto_solicitante: form.puesto_solicitante, correo_solicitante: form.correo_solicitante,
        fecha_elaboracion: form.fecha_elaboracion,
        concepto_id: form.concepto_id || null, concepto_nombre: form.concepto_nombre, especificacion: form.especificacion,
        descripcion: form.descripcion,
        cot1_importe: form.cot1_importe ? parseFloat(parseMXN(form.cot1_importe)) : null, cot1_proveedor: form.cot1_proveedor,
        cot2_importe: form.cot2_importe ? parseFloat(parseMXN(form.cot2_importe)) : null, cot2_proveedor: form.cot2_proveedor,
        cot3_importe: form.cot3_importe ? parseFloat(parseMXN(form.cot3_importe)) : null, cot3_proveedor: form.cot3_proveedor,
        motivo_seleccion: form.motivo_seleccion, forma_financiamiento: form.forma_financiamiento,
        estatus: 'pendiente',
      }]);
      if (error) throw error;

      logAudit({ accion: 'crear', modulo: 'tickets_mas_cn', registro_ref: folio, detalle: { colegio: form.colegio, solicitante: form.nombre_solicitante } });

      notifyByEmail(FIRMA_ADMIN_EMAIL, { tipo: 'info', titulo: `Nuevo Ticket MAS CN: ${folio}`, mensaje: `${form.colegio} — ${form.descripcion?.slice(0, 80) ?? ''}`, link: '/cumplimiento/ticket-mas-cn', modulo: 'tickets_mas_cn' });

      await supabase.functions.invoke('notify-ticket-mas-cn-autorizado', {
        body: { evento: 'creado', folio, colegio: form.colegio, solicitante: form.nombre_solicitante, correo_solicitante: form.correo_solicitante, descripcion: form.descripcion, concepto: form.concepto_nombre },
      }).catch(() => {});

      qc.invalidateQueries({ queryKey: ['tickets_mas_cn_por_tramite', form.tramite_id] });
      setEnviado(true);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al enviar el ticket, intenta de nuevo');
    } finally {
      setLoading(false);
    }
  };

  const adminFieldsComplete = adminForm.fecha_recepcion && adminForm.fecha_inicio_estimada && adminForm.fecha_fin_estimada;

  const handleAutorizar = async () => {
    if (!puedeAutorizar || !viewing || !adminFieldsComplete) return;
    if (!window.confirm(`¿Autorizar el ticket ${viewing.folio}?`)) return;
    try {
      const now = new Date().toISOString();
      const { data: updated, error } = await supabase.from('compliance_tickets_mas_cn')
        .update({ estatus: 'autorizado', fecha_recepcion: adminForm.fecha_recepcion, fecha_autorizacion: now })
        .eq('id', viewing.id).select().single();
      if (error) throw error;

      logAudit({ accion: 'autorizar', modulo: 'tickets_mas_cn', registro_id: updated.id, registro_ref: updated.folio, detalle: { colegio: updated.colegio, monto: updated.cot1_importe } });

      // Reflejar el costo real en el Trámite CN vinculado — sin tocar Validación de Vigencias.
      if (updated.tramite_id) {
        await supabase.from('compliance_tramites_cn').update({ costo_real: updated.cot1_importe ?? null, updated_at: now }).eq('id', updated.tramite_id);
        qc.invalidateQueries({ queryKey: ['compliance_tramites_cn', updated.tramite_id] });
        qc.invalidateQueries({ queryKey: ['tickets_mas_cn_por_tramite', updated.tramite_id] });
      }

      const colegioTk = colegiosCN.find(c => c.nombre === viewing.colegio);
      const correoCAR = colegioTk?.car_correo ?? '';
      if (correoCAR) {
        notifyByEmail(correoCAR, { tipo: 'exito', titulo: `Ticket MAS CN Autorizado: ${updated.folio}`, mensaje: `${updated.colegio} — Proveedor: ${updated.cot1_proveedor ?? '—'}`, link: '/cumplimiento/ticket-mas-cn', modulo: 'tickets_mas_cn' });
      }
      await supabase.functions.invoke('notify-ticket-mas-cn-autorizado', {
        body: { evento: 'autorizado', folio: viewing.folio, colegio: viewing.colegio, solicitante: viewing.nombre_solicitante, correo_solicitante: viewing.correo_solicitante, correo_car: correoCAR, descripcion: viewing.descripcion, concepto: viewing.concepto_nombre },
      });

      qc.setQueryData(['compliance_tickets_mas_cn'], (old: TicketMASCN[] | undefined) => (old ?? []).map(t => t.id === updated.id ? updated : t));
      qc.invalidateQueries({ queryKey: ['compliance_tickets_mas_cn'] });
      toast.success(`Ticket ${updated.folio} autorizado`);
      setViewing(updated);
      setAdminForm({ fecha_recepcion: '', fecha_inicio_estimada: '', fecha_fin_estimada: '' });
    } catch (e: any) {
      toast.error(e.message ?? 'Error al autorizar');
    }
  };

  const handleCancelar = async () => {
    if (!puedeCancelar || !cancelModal || !motivoCancel.trim()) { toast.error('Escribe el motivo'); return; }
    setCancelLoading(true);
    try {
      const fechaCancelacion = new Date().toISOString();
      const { error } = await supabase.from('compliance_tickets_mas_cn')
        .update({ estatus: 'cancelado', motivo_cancelacion: motivoCancel, fecha_cancelacion: fechaCancelacion })
        .eq('id', cancelModal.id);
      if (error) throw error;

      logAudit({ accion: 'cancelar', modulo: 'tickets_mas_cn', registro_id: cancelModal.id, registro_ref: cancelModal.folio, detalle: { motivo: motivoCancel } });
      notifyByEmail(FIRMA_ADMIN_EMAIL, { tipo: 'alerta', titulo: `Ticket MAS CN Cancelado: ${cancelModal.folio}`, mensaje: `${cancelModal.colegio ?? ''} — Motivo: ${motivoCancel}`, link: '/cumplimiento/ticket-mas-cn', modulo: 'tickets_mas_cn' });

      await supabase.functions.invoke('notify-ticket-mas-cn-cancelado', {
        body: { folio: cancelModal.folio, colegio: cancelModal.colegio, solicitante: cancelModal.nombre_solicitante, correo_solicitante: cancelModal.correo_solicitante, motivo: motivoCancel },
      }).catch(() => {});

      qc.setQueryData(['compliance_tickets_mas_cn'], (old: TicketMASCN[] | undefined) => (old ?? []).map(t => t.id === cancelModal.id ? { ...t, estatus: 'cancelado', motivo_cancelacion: motivoCancel, fecha_cancelacion: fechaCancelacion } : t));
      await qc.refetchQueries({ queryKey: ['compliance_tickets_mas_cn'] });
      setCancelModal(null); setMotivoCancel('');
      toast.success(`Ticket ${cancelModal.folio} cancelado`);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al cancelar');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleEliminar = async (t: TicketMASCN) => {
    if (!isAdmin) return;
    if (!window.confirm(`¿Eliminar el ticket ${t.folio}? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from('compliance_tickets_mas_cn').delete().eq('id', t.id);
    if (error) { toast.error('Error al eliminar'); return; }
    qc.invalidateQueries({ queryKey: ['compliance_tickets_mas_cn'] });
    toast.success('Ticket eliminado');
  };

  const handlePrint = (t: TicketMASCN) => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Habilita las ventanas emergentes para imprimir'); return; }
    w.document.write(generarHTMLTicketCN(t));
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  // ═════════════════════════ RENDER: FORM ═════════════════════════
  if (vista === 'form') {
    if (enviado) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle className="w-8 h-8 text-emerald-600" /></div>
          <h2 className="text-2xl font-black text-slate-900">¡Ticket MAS CN Enviado!</h2>
          <p className="text-slate-500 text-center max-w-md">Recibirás una confirmación a <strong>{form.correo_solicitante}</strong> cuando sea autorizado.</p>
          <div className="flex gap-3">
            <button onClick={() => { setEnviado(false); setForm({ ...FORM_INIT }); }} className="px-5 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition">Nuevo ticket</button>
            {canVerLista && <button onClick={() => { setEnviado(false); setForm({ ...FORM_INIT }); setVista('lista'); qc.invalidateQueries({ queryKey: ['compliance_tickets_mas_cn'] }); }} className="px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition">Ver lista de tickets</button>}
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-3">
          {canVerLista && <button onClick={() => setVista('lista')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition">← Volver a la lista</button>}
          <PageHeader title="Ticket MAS CN" subtitle="Cumplimiento Normativo / Protección Civil" icon={<ClipboardList className="w-5 h-5"/>} />
        </div>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider">Datos del Solicitante</div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className={labelClass}>Nombre completo</label><input className={readOnlyClass} value={form.nombre_solicitante} readOnly /></div>
            <div><label className={labelClass}>Puesto</label><input className={readOnlyClass} value={form.puesto_solicitante} readOnly /></div>
            <div><label className={labelClass}>Correo electrónico</label><input className={readOnlyClass} value={form.correo_solicitante} readOnly /></div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider">1. Datos Generales</div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className={labelClass}>Territorio *</label>
                <select className={selectClass} value={form.territorio} onChange={e => onTerritorioChange(e.target.value)} disabled={!!form.tramite_id}>
                  <option value="">— Seleccionar territorio —</option>
                  {TERRITORIOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Colegio *</label>
                <select className={selectClass} value={form.colegio} onChange={e => onColegioChange(e.target.value)} disabled={!form.territorio || !!form.tramite_id}>
                  <option value="">— Seleccionar colegio —</option>
                  {colegiosFiltrados.map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Razón Social</label><input className={readOnlyClass} value={form.razon_social} readOnly /></div>
              <div><label className={labelClass}>Centro Gestor</label><input className={readOnlyClass} value={form.centro_gestor} readOnly /></div>
              <div><label className={labelClass}>Sociedad</label><input className={readOnlyClass} value={form.sociedad} readOnly /></div>
              <div><label className={labelClass}>Contador</label><input className={readOnlyClass} value={form.contador} readOnly /></div>
              <div><label className={labelClass}>Fecha de Elaboración</label><input className={inputClass} type="date" value={form.fecha_elaboracion} onChange={e => set('fecha_elaboracion', e.target.value)} /></div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" /> 2. Concepto del Trámite</div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label className={labelClass}>Concepto Base *</label>
              <select className={selectClass} value={form.concepto_id} onChange={e => onConcepto(e.target.value)} disabled={!!form.tramite_id}>
                <option value="">Seleccionar concepto...</option>
                {conceptos.map(c => <option key={c.id} value={c.id}>{c.nombre} — {c.materia}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Especificación</label>
              <input className={form.tramite_id ? readOnlyClass : inputClass} value={form.especificacion} onChange={e => set('especificacion', e.target.value)} readOnly={!!form.tramite_id} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider">3. Descripción y Cotizaciones</div>
          <div className="p-4 space-y-4">
            <div><label className={labelClass}>Descripción del trámite *</label>
              <textarea className={inputClass + ' min-h-[80px] resize-none'} value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Describe detalladamente lo requerido..." />
            </div>
            {[1, 2, 3].map(n => (
              <div key={n} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div><label className={labelClass}>Cotización No. {n} — Proveedor</label>
                  <input className={inputClass} value={(form as any)[`cot${n}_proveedor`]} onChange={e => set(`cot${n}_proveedor`, e.target.value)} placeholder="Nombre del proveedor" />
                </div>
                <div><label className={labelClass}>Importe{n === 1 ? ' *' : ''}</label>
                  <input className={inputClass} value={(form as any)[`cot${n}_importe`]} onChange={e => set(`cot${n}_importe`, formatMXN(e.target.value))} placeholder="$0.00" />
                </div>
              </div>
            ))}
            <div><label className={labelClass}>Motivo de Selección del Proveedor</label>
              <textarea className={inputClass + ' min-h-[60px] resize-none'} value={form.motivo_seleccion} onChange={e => set('motivo_seleccion', e.target.value)} />
            </div>
            <div><label className={labelClass}>Forma de Financiamiento</label>
              <input className={inputClass} value={form.forma_financiamiento} onChange={e => set('forma_financiamiento', e.target.value)} />
            </div>
          </div>
        </section>

        <button onClick={handleSubmit} disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-700 disabled:opacity-50 transition">
          <Send className="w-4 h-4" />{loading ? 'Enviando...' : 'Enviar Ticket MAS CN'}
        </button>

        {showConfirmSend && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
                <h2 className="text-lg font-bold text-slate-900">¿Enviar el Ticket MAS CN?</h2>
              </div>
              <p className="text-sm text-slate-600">Verifica el colegio, la descripción y las cotizaciones antes de continuar — la Coordinación será notificada de inmediato.</p>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowConfirmSend(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Revisar de nuevo</button>
                <button onClick={doSubmit} disabled={loading} className="px-4 py-2 text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-lg disabled:opacity-50 transition-colors">{loading ? 'Enviando...' : 'Sí, enviar ticket'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═════════════════════════ RENDER: LISTA ═════════════════════════
  if (vista === 'lista') {
    return (
      <div className="w-full p-4 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <PageHeader title="Ticket MAS CN" subtitle="Revisión y autorización de trámites de Cumplimiento Normativo" icon={<ClipboardList className="w-5 h-5"/>} />
          <button onClick={() => { setForm({ ...FORM_INIT }); setVista('form'); }} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition">
            <Send className="w-4 h-4" /> Nuevo Ticket
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {['todos','pendiente','en_revision','autorizado','cancelado'].map(s => (
            <button key={s} onClick={() => { setFilter(s); setVisibleCount(TMASCN_PAGE_SIZE); }}
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
                    <th className="px-4 py-3 text-left">Concepto / Especificación</th>
                    <th className="px-4 py-3 text-left w-[190px]">Colegio</th>
                    <th className="px-4 py-3 text-left w-[160px]">Solicitante</th>
                    <th className="px-4 py-3 text-left w-[115px]">Fecha</th>
                    <th className="px-4 py-3 text-left w-[120px]">Estatus</th>
                    <th className="px-4 py-3 text-center w-[130px]">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketsVisibles.map((t, i) => (
                    <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{t.folio}</td>
                      <td className="px-4 py-3 text-slate-800 text-xs font-medium"><div className="truncate max-w-[260px]" title={t.especificacion ?? ''}>{t.concepto_nombre} — {t.especificacion}</div></td>
                      <td className="px-4 py-3 text-slate-800 text-xs">{t.colegio}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{t.nombre_solicitante}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm', { locale: es }) : '—'}</td>
                      <td className="px-4 py-3"><EstatusBadge estatus={t.estatus} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setViewing(t); setVista('detalle'); }} title="Revisar" className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => handlePrint(t)} title="Imprimir" className="p-1.5 rounded hover:bg-slate-100 text-slate-500 transition"><Printer className="w-4 h-4" /></button>
                          {puedeCancelar && t.estatus !== 'cancelado' && <button onClick={() => { setCancelModal(t); setMotivoCancel(''); }} title="Cancelar" className="p-1.5 rounded hover:bg-red-50 text-red-500 transition"><Ban className="w-4 h-4" /></button>}
                          {isAdmin && <button onClick={() => handleEliminar(t)} title="Eliminar" className="p-1.5 rounded hover:bg-red-50 text-red-600 transition"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="flex flex-col items-center gap-2 py-4 border-t border-slate-100">
                <button onClick={() => setVisibleCount(v => v + TMASCN_PAGE_SIZE)} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm">
                  <ChevronDown className="w-4 h-4" /> Cargar más ({ticketsFiltrados.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </div>
        )}

        {cancelModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2"><Ban className="w-4 h-4 text-red-500"/> Cancelar Ticket {cancelModal.folio}</h2>
              <textarea className="w-full border border-slate-300 rounded-md p-2 text-sm h-24 resize-none mt-2" placeholder="Motivo de cancelación *" value={motivoCancel} onChange={e => setMotivoCancel(e.target.value)} />
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setCancelModal(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Volver</button>
                <button onClick={handleCancelar} disabled={cancelLoading} className="px-4 py-2 text-sm font-bold bg-red-600 text-white hover:bg-red-700 rounded-lg disabled:opacity-50">{cancelLoading ? 'Cancelando...' : 'Confirmar Cancelación'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═════════════════════════ RENDER: DETALLE ═════════════════════════
  if (vista === 'detalle' && viewing) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <button onClick={() => { setVista('lista'); setViewing(null); }} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition">← Volver a la lista</button>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-lg font-black text-slate-800">Ticket {viewing.folio}</h1>
              <p className="text-sm text-slate-500">{viewing.colegio} — {viewing.territorio}</p>
            </div>
            <EstatusBadge estatus={viewing.estatus} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm">
            <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Solicitante</span>{viewing.nombre_solicitante} — {viewing.puesto_solicitante}</p>
            <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Correo</span>{viewing.correo_solicitante}</p>
            <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Concepto</span>{viewing.concepto_nombre}</p>
            <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Especificación</span>{viewing.especificacion}</p>
            <p className="sm:col-span-2"><span className="text-slate-400 font-bold uppercase text-[11px] block">Descripción</span>{viewing.descripcion}</p>
            <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Cotización 1</span>{viewing.cot1_proveedor} — {fmx(viewing.cot1_importe)}</p>
            {viewing.cot2_proveedor && <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Cotización 2</span>{viewing.cot2_proveedor} — {fmx(viewing.cot2_importe)}</p>}
            {viewing.cot3_proveedor && <p><span className="text-slate-400 font-bold uppercase text-[11px] block">Cotización 3</span>{viewing.cot3_proveedor} — {fmx(viewing.cot3_importe)}</p>}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => handlePrint(viewing)} className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-md text-sm font-bold text-slate-700 hover:bg-slate-50"><Printer className="w-4 h-4" /> Imprimir</button>
          </div>
        </div>

        {viewing.estatus === 'pendiente' && puedeAutorizar && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><Clock className="w-4 h-4" /> Autorización</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className={labelClass}>Fecha Recepción *</label><input type="date" className={inputClass} value={adminForm.fecha_recepcion} onChange={e => setA('fecha_recepcion', e.target.value)} /></div>
              <div><label className={labelClass}>Fecha Inicio Estimada *</label><input type="date" className={inputClass} value={adminForm.fecha_inicio_estimada} onChange={e => setA('fecha_inicio_estimada', e.target.value)} /></div>
              <div><label className={labelClass}>Fecha Fin Estimada *</label><input type="date" className={inputClass} value={adminForm.fecha_fin_estimada} onChange={e => setA('fecha_fin_estimada', e.target.value)} /></div>
            </div>
            {!adminFieldsComplete && <p className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Completa las 3 fechas para poder autorizar.</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setCancelModal(viewing); setMotivoCancel(''); }} className="px-4 py-2 text-sm font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50">Cancelar Ticket</button>
              <button onClick={handleAutorizar} disabled={!adminFieldsComplete} className="px-4 py-2 text-sm font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">Autorizar Ticket</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
