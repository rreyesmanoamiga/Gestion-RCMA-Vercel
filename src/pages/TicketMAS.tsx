import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/lib/AuthContext';
import {
  Send, CheckCircle, Eye, X, Printer, ClipboardList,
  ChevronDown, FileCheck, Clock, Trash2, Ban, RefreshCw, AlertCircle
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

// ─── Firma del coordinador (base64) ──────────────────────────────────────────
const FIRMA_RCMA = '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';

// ─── Estilos base ────────────────────────────────────────────────────────────
const inputClass    = "w-full px-2 py-1.5 border border-slate-400 text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white text-slate-900 rounded";
const readOnlyClass = "w-full px-2 py-1.5 border border-slate-300 text-sm bg-slate-100 text-slate-600 cursor-default rounded";
const labelClass    = "text-[11px] font-bold text-slate-600 uppercase tracking-wide";
const selectClass   = "w-full px-2 py-1.5 border border-slate-400 text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white text-slate-900 rounded";

// ─── Datos completos de colegios ──────────────────────────────────────────────
const COLEGIOS_TICKET = [
  { nombre:'Mano Amiga Acapulco',          codigo:'ACA', razon:'Centro Educativo Cualcan Acapulco, S. C.',                           sociedad:'1214', centro_gestor:'MXI008', territorio:'MEXICO', director:'Guadalupe García Gaspar',         admin:'Noemi Ignacio Garzón',          contador:'FELICITAS TAPIA',   correo_contador:'ftapia@admmx.org'  },
  { nombre:'Mano Amiga Aguascalientes',     codigo:'AGS', razon:'Mano Amiga Aguascalientes S.C.',                                    sociedad:'1250', centro_gestor:'MXI016', territorio:'NORTE',  director:'María del Pilar Gómez Cañizo',    admin:'Gabriela García Pérez',         contador:'JUAN PEDRO DE LUNA',correo_contador:'jdeluna@admmx.org' },
  { nombre:'Mano Amiga Cancún',             codigo:'CAN', razon:'Mano Amiga Cancún, S.C.',                                          sociedad:'1263', centro_gestor:'MXI020', territorio:'MEXICO', director:'Francisco Paul Martínez Contreras',admin:'ÁNGEL MARTÍN KU UUH',           contador:'VALERIA GAMEZ',     correo_contador:'vgamez@admmx.org'  },
  { nombre:'Mano Amiga Chalco',             codigo:'CHA', razon:'Mano Amiga de Chalco, S.C.',                                       sociedad:'1135', centro_gestor:'MXI010', territorio:'MEXICO', director:'José Manuel Fierro Partida',      admin:'Elizabeth Reyes Rivas',         contador:'FELICITAS TAPIA',   correo_contador:'ftapia@admmx.org'  },
  { nombre:'Mano Amiga La Cima',            codigo:'CIM', razon:'Mano Amiga La Cima A.B.P.',                                        sociedad:'1260', centro_gestor:'MXI001', territorio:'NORTE',  director:'Daniel Garcia de la Torre',       admin:'Juan Carlos Cepeda Scott',      contador:'JUAN PEDRO DE LUNA',correo_contador:'jdeluna@admmx.org' },
  { nombre:'Mano Amiga Conkal',             codigo:'CON', razon:'Mano Amiga Yucatán Conkal A.C.',                                   sociedad:'1263', centro_gestor:'MXI014', territorio:'MEXICO', director:'Carolina Rodriguez Galván',      admin:'Margarita Pech Rodriguez',      contador:'VALERIA GAMEZ',     correo_contador:'vgamez@admmx.org'  },
  { nombre:'Mano Amiga Guadalajara',        codigo:'GDL', razon:'Mano Amiga de Guadalajara, S.C.',                                  sociedad:'1077', centro_gestor:'MXI004', territorio:'NORTE',  director:'Lorena López Taymani',            admin:'Jose Ramon Iturbero Apecechea', contador:'EDITH IBARRA',      correo_contador:'edibarra@admmx.org'},
  { nombre:'Mano Amiga León',               codigo:'LEO', razon:'Mano Amiga de León, A.C.',                                         sociedad:'1145', centro_gestor:'MXI003', territorio:'NORTE',  director:'Víctor Hugo Martínez Guerrero',   admin:'José Antonio Ávalos Ortega',    contador:'VALERIA GAMEZ',     correo_contador:'vgamez@admmx.org'  },
  { nombre:'Mano Amiga Lerma',              codigo:'LER', razon:'Centro Escolar Lerma, S.C.',                                       sociedad:'1175', centro_gestor:'MXI009', territorio:'MEXICO', director:'Alejandro de la Garza Ransom',    admin:'María Candelaria Morones',      contador:'JUAN PEDRO DE LUNA',correo_contador:'jdeluna@admmx.org' },
  { nombre:'Mano Amiga Morelia',            codigo:'MOR', razon:'Mano Amiga Tarimbaro. S. C.',                                      sociedad:'1263', centro_gestor:'MXI022', territorio:'MEXICO', director:'César Augusto González Rodríguez',admin:'Rodrigo Vargas Hernández',      contador:'VALERIA GAMEZ',     correo_contador:'vgamez@admmx.org'  },
  { nombre:'Mano Amiga Monterrey',          codigo:'MTY', razon:'Instituto Mano Amiga de Monterrey, S.C.',                          sociedad:'1010', centro_gestor:'MXI006', territorio:'NORTE',  director:'Adriana Gómez Díaz',              admin:'Claudia Nelly Rojas Hernández', contador:'JUAN PEDRO DE LUNA',correo_contador:'jdeluna@admmx.org' },
  { nombre:'Mano Amiga Piedras Negras',     codigo:'PIE', razon:'Mano Amiga Piedras Negras AC',                                     sociedad:'1210', centro_gestor:'MXI007', territorio:'NORTE',  director:'Paolo René Oscos Snowball',       admin:'Ana Gabriela Gauna López',      contador:'FELICITAS TAPIA',   correo_contador:'ftapia@admmx.org'  },
  { nombre:'Mano Amiga Puebla',             codigo:'PUE', razon:'Mano Amiga de Puebla S.C.',                                        sociedad:'1172', centro_gestor:'MXI018', territorio:'MEXICO', director:'Juan Francisco Serrano Garcia',   admin:'Erika Iliana Aguilar Tlapanco', contador:'EDITH IBARRA',      correo_contador:'edibarra@admmx.org'},
  { nombre:'Mano Amiga Querétaro',          codigo:'QRO', razon:'Escuela Mano Amiga del Estado de Querétaro S.C.',                  sociedad:'1170', centro_gestor:'MXI013', territorio:'MEXICO', director:'Justino Gómez Pedraza',           admin:'Claudia Janett Arreola Camacho',contador:'FELICITAS TAPIA',   correo_contador:'ftapia@admmx.org'  },
  { nombre:'Mano Amiga Santa Catarina',     codigo:'SCA', razon:'Centro de Desarrollo y Avance, S.C.',                              sociedad:'1259', centro_gestor:'MXI005', territorio:'NORTE',  director:'Jesús Gerardo Castillo Oliva',    admin:'Alma Nelly Blanco Lopez',       contador:'JUAN PEDRO DE LUNA',correo_contador:'jdeluna@admmx.org' },
  { nombre:'Mano Amiga Tapachula',          codigo:'TAP', razon:'Mano Amiga Chiapas. S.C',                                          sociedad:'1251', centro_gestor:'MXI015', territorio:'MEXICO', director:'José Octavio Ramos Martínez',     admin:'Eliabet Salas Escobar',         contador:'FELICITAS TAPIA',   correo_contador:'ftapia@admmx.org'  },
  { nombre:'Mano Amiga Tijuana',            codigo:'TIJ', razon:'Mano Amiga Baja California S.C.',                                  sociedad:'1256', centro_gestor:'MXI019', territorio:'NORTE',  director:'Francisco Daniel Robles Noriega', admin:'Juana Rosa Cornejo Ledesma',    contador:'EDITH IBARRA',      correo_contador:'edibarra@admmx.org'},
  { nombre:'Mano Amiga Torreón',            codigo:'TOR', razon:'Instituto Mano Amiga de Torreón S.C',                              sociedad:'1134', centro_gestor:'MXI002', territorio:'NORTE',  director:'Ma. Teresa Robles Limones',       admin:'Maria Alicia Vilchis Esquivel', contador:'EDITH IBARRA',      correo_contador:'edibarra@admmx.org'},
  { nombre:'Mano Amiga Villas de San Juan', codigo:'VSJ', razon:'Mano Amiga de León A.C.',                                          sociedad:'1145', centro_gestor:'MXI012', territorio:'NORTE',  director:'Gonzalo Heredia Camacho',         admin:'Ivonne Coss Sanchez',           contador:'VALERIA GAMEZ',     correo_contador:'vgamez@admmx.org'  },
  { nombre:'Mano Amiga ZOM',                codigo:'ZOM', razon:'Mano Amiga S.C.',                                                  sociedad:'1005', centro_gestor:'MXI011', territorio:'MEXICO', director:'Edgar Omar Díaz Marías',          admin:'Ana María Barrón Montaño',      contador:'EDITH IBARRA',      correo_contador:'edibarra@admmx.org'},
  { nombre:'OF. MTY', codigo:'MTY-OF',  razon:'Federación Mano Amiga A.C.',                                          sociedad:'1238', centro_gestor:'MXM010', territorio:'FMA', director:'Ángel Eduardo Rodriguez Martinez', admin:'Félix Guerra Herrera', contador:'YAZMIN CRUZ', correo_contador:'ycruz@admmx.org' },
  { nombre:'OF. CDMX',      codigo:'CDMX-OF', razon:'Federación Mano Amiga A.C.',                                          sociedad:'1238', centro_gestor:'MXM010', territorio:'FMA', director:'Ángel Eduardo Rodriguez Martinez', admin:'Félix Guerra Herrera', contador:'YAZMIN CRUZ', correo_contador:'ycruz@admmx.org' },
  { nombre:'GENERAL (FIA)',            codigo:'FIA',     razon:'Fundación Interamericana Anáhuac para el Desarrollo Social, I.A.P.', sociedad:'1192', centro_gestor:'MXI051', territorio:'FMA', director:'Ángel Eduardo Rodriguez Martinez', admin:'Félix Guerra Herrera', contador:'YAZMIN CRUZ', correo_contador:'ycruz@admmx.org' },
  { nombre:'FMA',            codigo:'FMA',     razon:'Federación Mano Amiga A.C.',                                          sociedad:'1238', centro_gestor:'MXM010', territorio:'FMA', director:'Ángel Eduardo Rodriguez Martinez', admin:'Félix Guerra Herrera', contador:'YAZMIN CRUZ', correo_contador:'ycruz@admmx.org' },
];

const CAR_CORREOS: Record<string, string> = {
  NORTE:  'jalvarado@manoamiga.edu.mx',
  MEXICO: 'gromero@manoamiga.edu.mx',
};

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
  motivo_cancelacion?:    string;
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
  pendiente:    { bg: 'bg-amber-50 border border-amber-200 text-amber-700',   dot: 'bg-amber-400',   label: 'Pendiente' },
  en_revision:  { bg: 'bg-blue-50 border border-blue-200 text-blue-700',      dot: 'bg-blue-500',    label: 'En Revisión' },
  autorizado:   { bg: 'bg-emerald-50 border border-emerald-200 text-emerald-700', dot: 'bg-emerald-500', label: 'Autorizado' },
  rechazado:    { bg: 'bg-red-50 border border-red-200 text-red-700',         dot: 'bg-red-500',     label: 'Rechazado' },
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

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Ticket MAS — ${t.folio ?? ''}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:Arial,sans-serif;font-size:10.5px;color:#1e293b;padding:18px;}
    .header{background:#0f172a;color:white;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-radius:4px 4px 0 0;}
    .header h1{font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;}
    .header h2{font-size:9px;color:#94a3b8;margin-top:2px;text-transform:uppercase;}
    .header img{height:44px;width:auto;object-fit:contain;}
    .sub-header{background:#1e40af;color:white;padding:6px 16px;font-size:11px;font-weight:700;display:flex;justify-content:space-between;margin-bottom:10px;}
    .section{margin-bottom:10px;}
    .section-title{background:#e2e8f0;padding:4px 10px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#475569;border-bottom:1px solid #cbd5e1;border-top:1px solid #cbd5e1;}
    table{width:100%;border-collapse:collapse;}
    td{border:1px solid #cbd5e1;padding:4px 7px;font-size:10.5px;}
    .lbl{background:#f8fafc;font-weight:700;color:#475569;width:140px;text-transform:uppercase;font-size:9.5px;}
    .val{color:#1e293b;}
    .th{background:#1e293b;color:white;font-size:9.5px;font-weight:700;text-transform:uppercase;padding:5px 7px;text-align:center;}
    .num{text-align:right;font-family:monospace;}
    .firma-section{display:flex;gap:20px;margin-top:10px;}
    .firma-box{flex:1;border:1px solid #cbd5e1;padding:10px;text-align:center;min-height:90px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;}
    .firma-box img{height:60px;width:auto;object-fit:contain;}
    .firma-name{font-size:9.5px;font-weight:700;text-transform:uppercase;border-top:1px solid #94a3b8;padding-top:4px;width:100%;text-align:center;margin-top:auto;}
    .firma-title{font-size:8.5px;color:#64748b;}
    .footer{margin-top:14px;border-top:1px solid #e2e8f0;padding-top:8px;text-align:center;font-size:8.5px;color:#94a3b8;}
    @media print{body{padding:8px;}}
  </style>
</head>
<body>
  <div class="header">
    <div><h1>Red de Colegios Mano Amiga</h1><h2>Ticket Construcciones, Mejoras y Mantenimiento</h2></div>
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
      <tr><td class="lbl">Clasificación</td><td class="val">${t.clasificacion ?? '—'}</td><td class="lbl">Periodicidad</td><td class="val">${t.periodicidad ?? '—'}</td></tr>
      <tr><td class="lbl">Tipo Mantenimiento</td><td class="val">${t.tipo_mantenimiento ?? '—'}</td><td class="lbl">Orden Interna</td><td class="val">${t.orden_interna ?? '—'}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">2. Descripción y Cotizaciones</div>
    <table>
      <tr><td class="lbl">Descripción</td><td class="val" colspan="3" style="white-space:pre-wrap;">${t.descripcion ?? '—'}</td></tr>
    </table>
    <table style="margin-top:4px;">
      <tr><td class="th" style="width:20%;">Cotización</td><td class="th">Proveedor</td><td class="th" style="width:15%;">Importe</td></tr>
      <tr><td class="lbl">Cotización No. 1</td><td class="val">${t.cot1_proveedor ?? '—'}</td><td class="num">${fmx(t.cot1_importe)}</td></tr>
      <tr><td class="lbl">Cotización No. 2</td><td class="val">${t.cot2_proveedor ?? '—'}</td><td class="num">${fmx(t.cot2_importe)}</td></tr>
      <tr><td class="lbl">Cotización No. 3</td><td class="val">${t.cot3_proveedor ?? '—'}</td><td class="num">${fmx(t.cot3_importe)}</td></tr>
    </table>
    <table style="margin-top:4px;">
      <tr><td class="lbl">Motivo de Selección</td><td class="val">${t.motivo_seleccion ?? '—'}</td></tr>
      <tr><td class="lbl">Forma de Financiamiento</td><td class="val">${t.forma_financiamiento ?? '—'}</td></tr>
      <tr><td class="lbl">Elaborar Suplemento</td><td class="val">${t.elaborar_suplemento ?? '—'}</td><td class="lbl">Elaborar Traspaso</td><td class="val">${t.elaborar_traspaso ?? '—'}</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">3. Ventanilla Única</div>
    <table>
      <tr><td class="lbl">Fecha Recepción</td><td class="val">${t.fecha_recepcion ?? '—'}</td><td class="lbl">Fecha Inicio Estimada</td><td class="val">${t.fecha_inicio_estimada ?? '—'}</td></tr>
      <tr><td class="lbl">Fecha Fin Estimada</td><td class="val">${t.fecha_fin_estimada ?? '—'}</td><td class="lbl">Fecha Autorización</td><td class="val">${fechaAuth}</td></tr>
    </table>
  </div>

  <div class="firma-section">
    <div class="firma-box">
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px 0;gap:4px;">
        <span style="font-size:10px;font-weight:600;color:#1e293b;">${t.nombre_solicitante ?? '—'}</span>
        <span style="font-size:8.5px;color:#64748b;">Enviado: ${t.created_at ? format(new Date(t.created_at), "dd/MM/yyyy HH:mm", { locale: es }) : '—'}</span>
      </div>
      <div class="firma-name">${t.puesto_solicitante ?? 'Director / Administrador'}<br/><span class="firma-title">${t.colegio ?? ''}</span></div>
    </div>
    <div class="firma-box">
      <img src="data:image/png;base64,${firma}" alt="Firma RCMA" style="max-height:60px;max-width:180px;object-fit:contain;"/>
      <div class="firma-name">Ricardo Joanathan Reyes Medina<br/><span class="firma-title">Coordinador de Obras y Mantenimiento RCMA</span></div>
    </div>
  </div>

  <div class="footer">
    Ticket autorizado el ${fechaAuth} · Sistema RCMA — Coordinación de Obras © ${new Date().getFullYear()}
  </div>
</body>
</html>`;
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TicketMAS() {
  const { user }  = useAuth();
  const isAdmin   = user?.user_metadata?.role === 'admin';
  const qc        = useQueryClient();

  // Vista: 'form' | 'lista' | 'detalle'
  const [vista, setVista]         = useState<'form'|'lista'|'detalle'>(isAdmin ? 'lista' : 'form');
  const [enviado, setEnviado]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [viewing, setViewing]     = useState<TicketMAS | null>(null);
  const [filterStatus, setFilter] = useState('todos');

  // ── Form state (llenado por colegio) ────────────────────────────────────────
  const FORM_INIT = {
    territorio:'', colegio:'', razon_social:'', sociedad:'', centro_gestor:'',
    director:'', admin_colegio:'', contador:'',
    nombre_solicitante:'', puesto_solicitante:'', correo_solicitante:'',
    fecha_elaboracion: format(new Date(), 'yyyy-MM-dd'),
    clasificacion:'', periodicidad:'NORMAL', tipo_mantenimiento:'N/A',
    numero_activo:'', orden_interna:'NO',
    descripcion:'',
    cot1_importe:'', cot1_proveedor:'',
    cot2_importe:'', cot2_proveedor:'',
    cot3_importe:'', cot3_proveedor:'',
    motivo_seleccion:'', forma_financiamiento:'',
    elaborar_suplemento:'NO', elaborar_traspaso:'SI',
  };
  const [form, setForm] = useState({ ...FORM_INIT });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // ── Admin form state (llenado por Ricardo) ───────────────────────────────────
  const ADMIN_INIT = { fecha_recepcion:'', fecha_inicio_estimada:'', fecha_fin_estimada:'', areas_participantes:'' };
  const [adminForm, setAdminForm] = useState({ ...ADMIN_INIT });
  const setA = (k: string, v: string) => setAdminForm(p => ({ ...p, [k]: v }));

  const [showCot2, setShowCot2] = useState(false);
  const [showCot3, setShowCot3] = useState(false);

  // Cancelación modal
  const [cancelModal, setCancelModal]     = useState<TicketMAS | null>(null);
  const [motivoCancel, setMotivoCancel]   = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  const colegiosFiltrados = useMemo(() =>
    form.territorio ? COLEGIOS_TICKET.filter(c => c.territorio === form.territorio) : [],
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
    const c = COLEGIOS_TICKET.find(x => x.nombre === nombre);
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
  const { data: tickets = [], isLoading: loadingTickets } = useQuery({
    queryKey: ['tickets_mas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets_mas')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TicketMAS[];
    },
    enabled: isAdmin,
  });

  const ticketsFiltrados = useMemo(() => {
    if (filterStatus === 'todos') return tickets;
    return tickets.filter(t => t.estatus === filterStatus);
  }, [tickets, filterStatus]);

  // ── Enviar ticket ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.colegio || !form.nombre_solicitante || !form.correo_solicitante || !form.descripcion || !form.clasificacion) {
      toast.error('Completa los campos obligatorios marcados con *');
      return;
    }
    setLoading(true);
    try {
      // Generar folio
      const { count } = await supabase.from('tickets_mas').select('*', { count: 'exact', head: true });
      const num = (count ?? 0) + 1;
      const folio = `TMAS-${new Date().getFullYear()}-${String(num).padStart(3, '0')}`;

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
        descripcion:          form.descripcion,
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

      setEnviado(true);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al enviar el ticket');
    } finally {
      setLoading(false);
    }
  };

  // ── Autorizar ticket ──────────────────────────────────────────────────────────
  const adminFieldsComplete = adminForm.fecha_recepcion && adminForm.fecha_inicio_estimada && adminForm.fecha_fin_estimada;

  const handleAutorizar = async () => {
    if (!viewing || !adminFieldsComplete) return;
    const confirm = window.confirm(`¿Autorizar el ticket ${viewing.folio}?`);
    if (!confirm) return;
    try {
      const now = new Date().toISOString();
      const { error } = await supabase.from('tickets_mas')
        .update({
          estatus:               'autorizado',
          fecha_recepcion:        adminForm.fecha_recepcion,
          fecha_inicio_estimada:  adminForm.fecha_inicio_estimada,
          fecha_fin_estimada:     adminForm.fecha_fin_estimada,
          areas_participantes:    adminForm.areas_participantes,
          fecha_autorizacion:     now,
        })
        .eq('id', viewing.id);
      if (error) throw error;

      // Correo CAR según territorio
      const correoCAR = CAR_CORREOS[viewing.territorio ?? ''] ?? '';

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

      toast.success(`Ticket ${viewing.folio} autorizado y notificación enviada`);
      setViewing(null);
      qc.invalidateQueries({ queryKey: ['tickets_mas'] });
    } catch (e: any) {
      toast.error(e.message ?? 'Error al autorizar');
    }
  };

  // ── Imprimir ticket ────────────────────────────────────────────────────────────
  const handlePrint = (t: TicketMAS) => {
    const html = generarHTMLTicket(t, FIRMA_RCMA);
    const win  = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.onload = () => { win.focus(); win.print(); }; }
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
    if (!cancelModal || !motivoCancel.trim()) { toast.error('Escribe el motivo'); return; }
    setCancelLoading(true);
    try {
      const { error } = await supabase.from('tickets_mas')
        .update({ estatus: 'cancelado', motivo_cancelacion: motivoCancel })
        .eq('id', cancelModal.id);
      if (error) throw error;
      await supabase.functions.invoke('notify-ticket-mas-cancelado', {
        body: {
          folio: cancelModal.folio, colegio: cancelModal.colegio,
          solicitante: cancelModal.nombre_solicitante,
          correo_solicitante: cancelModal.correo_solicitante,
          motivo: motivoCancel,
        },
      });
      toast.success(`Ticket ${cancelModal.folio} cancelado`);
      setCancelModal(null);
      setMotivoCancel('');
      // Actualizar cache local inmediatamente sin esperar refetch
      qc.setQueryData(['tickets_mas'], (old: TicketMAS[] | undefined) =>
        (old ?? []).map(t => t.id === cancelModal.id
          ? { ...t, estatus: 'cancelado', motivo_cancelacion: motivoCancel }
          : t
        )
      );
      qc.invalidateQueries({ queryKey: ['tickets_mas'] });
    } catch (e: any) { toast.error(e.message ?? 'Error'); }
    finally { setCancelLoading(false); }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Formulario (usuarios y admin)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!isAdmin || vista === 'form') {
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
              {isAdmin && (
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
          {isAdmin && (
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
              <label className={labelClass}>Nombre completo *</label>
              <input className={inputClass} value={form.nombre_solicitante} onChange={e => set('nombre_solicitante', e.target.value)} placeholder="Nombre del solicitante" />
            </div>
            <div>
              <label className={labelClass}>Puesto *</label>
              <input className={inputClass} value={form.puesto_solicitante} onChange={e => set('puesto_solicitante', e.target.value)} placeholder="Director / Administrador" />
            </div>
            <div>
              <label className={labelClass}>Correo electrónico *</label>
              <input className={inputClass} type="email" value={form.correo_solicitante} onChange={e => set('correo_solicitante', e.target.value)} placeholder="correo@ejemplo.com" />
            </div>
          </div>
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
                <select className={selectClass} value={form.orden_interna} onChange={e => set('orden_interna', e.target.value)}>
                  {SI_NO.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
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
                  <label className={labelClass}>Importe</label>
                  <input className={inputClass} value={(form as any)[`cot${n}_importe`]}
                    onChange={e => set(`cot${n}_importe`, formatMXN(e.target.value))}
                    placeholder="$0.00" />
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
                <select className={selectClass} value={form.elaborar_suplemento} onChange={e => set('elaborar_suplemento', e.target.value)}>
                  {SI_NO.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Elaborar Traspaso</label>
                <select className={selectClass} value={form.elaborar_traspaso} onChange={e => set('elaborar_traspaso', e.target.value)}>
                  {SI_NO.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
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
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Admin — Lista de tickets
  // ─────────────────────────────────────────────────────────────────────────────
  if (vista === 'lista') {
    return (
      <div className="max-w-6xl mx-auto p-4 space-y-4">
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
            <button key={s} onClick={() => setFilter(s)}
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
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white text-xs uppercase">
                  <th className="px-4 py-3 text-left">Folio</th>
                  <th className="px-4 py-3 text-left">Colegio</th>
                  <th className="px-4 py-3 text-left">Solicitante</th>
                  <th className="px-4 py-3 text-left">Clasificación</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Estatus</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ticketsFiltrados.map((t, i) => {
                  const vencido = isVencido(t);
                  return (
                  <tr key={t.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${vencido ? 'border-l-4 border-l-red-400' : ''}`}>
                    <td className="px-3 py-2.5 font-mono text-xs font-bold text-slate-700">{t.folio}</td>
                    <td className="px-3 py-2.5 text-slate-800 text-xs">{t.colegio}</td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs">{t.nombre_solicitante}</td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs">{t.clasificacion}</td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">
                      {t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm', { locale: es }) : '—'}
                      {vencido && <span className="block text-[10px] text-red-500 font-bold">⚠ +12h sin revisión</span>}
                    </td>
                    <td className="px-3 py-2.5"><EstatusBadge estatus={t.estatus} /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
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

                        {/* Cancelar */}
                        {t.estatus !== 'cancelado' && (
                          <button onClick={() => { setCancelModal(t); setMotivoCancel(''); }} title="Cancelar"
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 transition">
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        {/* Eliminar */}
                        <button onClick={() => handleEliminar(t)} title="Eliminar"
                          className="p-1.5 rounded hover:bg-red-50 text-red-600 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
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
          <div className="ml-auto flex gap-2">
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
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Descripción</p>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{viewing.descripcion ?? '—'}</p>
          </div>
          {/* Cotizaciones */}
          <div className="px-4 pb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Cotizaciones</p>
            <div className="grid grid-cols-3 gap-3">
              {[1,2,3].map(n => (
                <div key={n} className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                  <p className="text-[10px] font-bold text-slate-500">COT. No. {n}</p>
                  <p className="text-xs text-slate-700 mt-1">{(viewing as any)[`cot${n}_proveedor`] ?? '—'}</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{fmx((viewing as any)[`cot${n}_importe`])}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Campos del coordinador */}
        {viewing.estatus !== 'autorizado' && (
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
            </div>

            <div className="px-4 pb-4">
              <button
                onClick={handleAutorizar}
                disabled={!adminFieldsComplete}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-bold text-sm rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <CheckCircle className="w-5 h-5" />
                Autorizar Ticket
              </button>
              {!adminFieldsComplete && (
                <p className="text-xs text-center text-slate-400 mt-2">Llena los 3 campos de fecha para habilitar la autorización</p>
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
          </div>
        )}
      </div>
    );
  }

  return null;
}
