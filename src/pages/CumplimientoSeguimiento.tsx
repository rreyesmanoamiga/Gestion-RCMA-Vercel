import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import { Link as RouterLink } from 'react-router-dom';
import {
  Plus, Search, Pin, Pencil, Trash2, X, FileText, ListChecks, Users,
  ClipboardList, Clock, AlertCircle, CheckCircle2, MessageSquare, Loader2,
  Handshake, Wrench, Lock, Presentation, Send, Link2, MapPin, Building2, CalendarPlus, Download,
} from 'lucide-react';
import { descargarICSPendiente } from '@/lib/icsPendiente';
import { fmtHora } from '@/lib/utils';
import { logoCuadradoDataURL } from '@/lib/logoPdf';
import { logAudit } from '@/lib/audit';
import { useAdjuntos, SelectorFotos, subirFotos, useFotosNexus, FotosDeComentario, type FotoRef } from '@/components/nexus/FotosComentario';
import { useComplianceDocs, LoadingBlock, ErrorBlock } from '@/lib/complianceShared';
import { usePermissions } from '@/hooks/usePermissions';
import AccesoRestringido from '@/components/shared/AccesoRestringido';

// ---------------------------------------------------------------------------
// Modelo de datos (mismo patrón que NEXUS, tablas compliance_*)
// ---------------------------------------------------------------------------

interface Nota {
  id: string; titulo: string; contenido: string; categoria: string; color: string;
  fijada: boolean; colegio: string | null; territorio: string | null;
  created_at: string; updated_at: string;
}
interface Pendiente {
  id: string; titulo: string; descripcion: string | null; tipo: 'personal' | 'compartido';
  asignado_a: string | null; asignado_nombre: string | null;
  prioridad: 'urgente' | 'alta' | 'normal' | 'baja';
  fecha_limite: string | null; hora_limite?: string | null; estatus: 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';
  colegio: string | null; territorio: string | null; documento_id: string | null;
  created_by: string | null; created_at: string; updated_at: string;
  // Vínculo con Minutas de Cumplimiento (lo llenan los triggers de la base de datos)
  acuerdo_id?: string | null; minuta_id?: string | null; origen?: 'acuerdo' | 'accion' | null; origen_numero?: number | null;
  origen_asunto?: string | null; origen_fecha?: string | null; origen_responsable?: string | null; origen_url?: string | null;
  presentar_semanal?: boolean | null; completado_at?: string | null;
}
interface Seguimiento {
  id: string; colegio: string; territorio: string | null; resumen: string;
  estatus: 'activo' | 'completado'; completado_at: string | null; created_at: string;
}
interface Comentario {
  id: string; pendiente_id: string | null; seguimiento_id: string | null;
  autor_email: string | null; autor_nombre: string | null; contenido: string; created_at: string;
  fotos?: FotoRef[] | null;
}
interface SysUser { user_email: string; nombre: string | null; territorio: string | null; colegio: string | null; puesto: string | null; }

const CATEGORIAS = ['General', 'Importante', 'Ideas', 'Recordatorios', 'Colegios', 'Personal'];
const COLORES = ['#0f172a', '#0d8a7e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#d97706'];

// Mismos colores, íconos y etiquetas que NEXUS
const PRIO_CFG: Record<string,{label:string;cls:string;dot:string;cardLeft:string}> = {
  urgente: { label:'🔴 Urgente', cls:'bg-red-100 text-red-700 border-red-200',        dot:'bg-red-500',    cardLeft:'border-l-red-500' },
  alta:    { label:'🟠 Alta',    cls:'bg-orange-100 text-orange-700 border-orange-200', dot:'bg-orange-500', cardLeft:'border-l-orange-400' },
  normal:  { label:'🔵 Normal',  cls:'bg-blue-100 text-blue-700 border-blue-200',     dot:'bg-blue-500',   cardLeft:'border-l-blue-400' },
  baja:    { label:'⚪ Baja',    cls:'bg-slate-100 text-slate-500 border-slate-200',  dot:'bg-slate-400',  cardLeft:'border-l-slate-300' },
};
const EST_CFG: Record<string,{label:string;icon:React.ReactNode;cls:string;cardBorder:string}> = {
  pendiente:  { label:'Pendiente',  icon:<Clock className="w-3 h-3"/>,        cls:'bg-amber-100 text-amber-700 border-amber-200',    cardBorder:'border-t-amber-400'   },
  en_proceso: { label:'En Proceso', icon:<AlertCircle className="w-3 h-3"/>,  cls:'bg-blue-100 text-blue-700 border-blue-200',       cardBorder:'border-t-blue-400'    },
  completado: { label:'Completado', icon:<CheckCircle2 className="w-3 h-3"/>, cls:'bg-emerald-100 text-emerald-700 border-emerald-200', cardBorder:'border-t-emerald-400' },
  cancelado:  { label:'Cancelado',  icon:<X className="w-3 h-3"/>,            cls:'bg-slate-100 text-slate-500 border-slate-200',    cardBorder:'border-t-slate-300'   },
};
// Pendientes que vienen de Minutas: cada origen con su propio color e ícono (igual que NEXUS)
const ORIGEN_CFG: Record<'acuerdo'|'accion', { label:string; corto:string; doc:string; Icon:React.ElementType; band:string; soft:string; chip:string; ring:string }> = {
  acuerdo: { label:'Acuerdo de minuta',      corto:'Acuerdo', doc:'Minuta',       Icon:Handshake, band:'bg-indigo-600', soft:'bg-indigo-50 border-indigo-200 text-indigo-900', chip:'bg-indigo-50 text-indigo-700 border-indigo-200', ring:'ring-indigo-200' },
  accion:  { label:'Acción de nota técnica', corto:'Acción',  doc:'Nota técnica', Icon:Wrench,    band:'bg-orange-600', soft:'bg-orange-50 border-orange-200 text-orange-900', chip:'bg-orange-50 text-orange-700 border-orange-200', ring:'ring-orange-200' },
};
const origenDe = (p: { acuerdo_id?: string|null; origen?: string|null }) =>
  p.acuerdo_id && (p.origen === 'acuerdo' || p.origen === 'accion') ? ORIGEN_CFG[p.origen] : null;
const abierto = (p: { estatus: string }) => p.estatus !== 'completado' && p.estatus !== 'cancelado';

const fmtDate = (d?: string | null) => d ? format(new Date(d.includes('T') ? d : d + 'T12:00:00'), "d MMM yyyy", { locale: es }) : '—';
const fmtFull = (d?: string | null) => d ? format(new Date(d), "d MMM yyyy HH:mm", { locale: es }) : '—';
const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";
const btnPrimary = "px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 transition";
const btnOutline = "px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition";

// ── PDF del pendiente (mismo formato que NEXUS) ────────────────────────────────
async function generarPDFPendiente(p: Pendiente, comentarios: Comentario[]) {
  let JsPDF = (window as any).jspdf?.jsPDF;
  if (!JsPDF) { await new Promise<void>((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = () => res(); s.onerror = rej; document.head.appendChild(s); }).catch(()=>null); JsPDF = (window as any).jspdf?.jsPDF; }
  if (!JsPDF) { toast.error('No se pudo cargar jsPDF'); return; }
  const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W = 210; let y = 0;
  const now = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
  doc.setFillColor(15,23,42); doc.rect(0,0,W,32,'F'); doc.setFillColor(13,138,126); doc.rect(0,0,4,32,'F');
  doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255); doc.text('Seguimiento de Trámites — Pendiente',14,13);
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(148,163,184); doc.text('Sistema RCMA  ·  Cumplimiento Normativo  ·  Generado el '+now,14,21); doc.text('Documento confidencial — solo para uso interno',14,27);
  try { const li=await new Promise<string>((res,rej)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>res(logoCuadradoDataURL(img));img.onerror=rej;img.src='/logo.png';}); doc.addImage(li,'PNG',W-38,4,22,22); } catch { /* sin logo */ }
  y = 42;
  const PRIO_LABEL_PDF: Record<string,string> = { urgente:'URGENTE', alta:'ALTA', normal:'NORMAL', baja:'BAJA' };
  const EST_LABEL_PDF:  Record<string,string> = { pendiente:'Pendiente', en_proceso:'En Proceso', completado:'Completado', cancelado:'Cancelado' };
  const PRIO_RGB: Record<string,[number,number,number]> = { urgente:[220,38,38], alta:[234,88,12], normal:[37,99,235], baja:[100,116,139] };
  const pRGB = PRIO_RGB[p.prioridad] ?? [100,116,139];
  doc.setFillColor(...pRGB); doc.rect(12, y, 4, 42, 'F');
  doc.setFillColor(248,250,252); doc.rect(16, y, W-28, 42, 'F');
  doc.setDrawColor(220,220,230); doc.setLineWidth(0.3); doc.rect(12, y, W-24, 42, 'D');
  doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(15,23,42);
  doc.text(doc.splitTextToSize(p.titulo, W-75)[0], 20, y+8);
  doc.setFillColor(...pRGB); doc.roundedRect(W-46, y+3, 30, 7, 1, 1, 'F');
  doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text(PRIO_LABEL_PDF[p.prioridad] ?? p.prioridad, W-31, y+8, { align:'center' });
  doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
  doc.text('Estatus:', 20, y+16);
  doc.setFont('helvetica','normal'); doc.setTextColor(15,23,42);
  doc.text(EST_LABEL_PDF[p.estatus] ?? p.estatus, 40, y+16);
  doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
  doc.text('Tipo:', 80, y+16);
  doc.setFont('helvetica','normal'); doc.setTextColor(15,23,42);
  doc.text(p.tipo==='compartido'?'Compartido':'Personal', 93, y+16);
  if (p.colegio || p.territorio) {
    doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
    doc.text('Territorio / Colegio:', 20, y+23);
    doc.setFont('helvetica','normal'); doc.setTextColor(15,23,42);
    doc.text(`${p.territorio ?? ''}  /  ${p.colegio ?? ''}`, 63, y+23);
  }
  const org = origenDe(p);
  if (org) {
    doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
    doc.text(`${org.doc}:`, 20, y+30);
    doc.setFont('helvetica','normal'); doc.setTextColor(37,99,235);
    const a = `${org.corto}${p.origen_numero ? ` #${p.origen_numero}` : ''} · ${p.origen_asunto ?? ''}`;
    doc.text(a.length > 70 ? a.slice(0,68)+'...' : a, 44, y+30);
  }
  const fechaY = y + (org ? 37 : (p.colegio ? 30 : 23));
  doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
  if (p.fecha_limite) { doc.text('Fecha limite:', 20, fechaY); doc.setFont('helvetica','normal'); doc.setTextColor(180,90,0); doc.text(fmtDate(p.fecha_limite), 46, fechaY); }
  if (p.completado_at) {
    const cx = p.fecha_limite ? 90 : 20;
    doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
    doc.text('Completado:', cx, fechaY);
    doc.setFont('helvetica','normal'); doc.setTextColor(22,163,74);
    doc.text(fmtDate(p.completado_at), cx+28, fechaY);
  }
  y += 50;
  if (p.descripcion) { doc.setFontSize(8.5); doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50); const lines=doc.splitTextToSize(p.descripcion,W-32) as string[]; doc.text(lines,16,y); y+=lines.length*5+8; }
  if (comentarios.length>0) {
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(15,23,42); doc.text('Historial de comentarios',14,y); y+=5;
    doc.setDrawColor(220,220,220); doc.line(14,y,W-14,y); y+=6;
    comentarios.forEach((c,i)=>{ if(y>260){doc.addPage();y=20;} if(i%2===0){doc.setFillColor(248,250,252);doc.rect(12,y-4,W-24,16,'F');} doc.setFontSize(8);doc.setFont('helvetica','bold');doc.setTextColor(15,23,42);doc.text(c.autor_nombre ?? '',16,y);doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(100,116,139);doc.text(fmtFull(c.created_at),W-16,y,{align:'right'});doc.setFontSize(8.5);doc.setFont('helvetica','normal');doc.setTextColor(50,50,50);const lines=doc.splitTextToSize(c.contenido || (c.fotos?.length ? `(${c.fotos.length} foto(s))` : ''),W-32) as string[];doc.text(lines,16,y+6);y+=8+(lines.length*5); });
  }
  const pages=doc.getNumberOfPages(); for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFillColor(15,23,42);doc.rect(0,286,W,11,'F');doc.setFillColor(13,138,126);doc.rect(0,286,4,11,'F');doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(160,160,180);doc.text('Sistema RCMA  ·  Seguimiento de Trámites  ·  Documento confidencial',10,292);doc.text(`Pág. ${i} de ${pages}`,W-14,292,{align:'right'});}
  doc.save(`Seguimiento-${p.titulo.replace(/\s+/g,'-').slice(0,30)}.pdf`);
}

// ---------------------------------------------------------------------------
// Modal genérico
// ---------------------------------------------------------------------------
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl sticky top-0 z-10">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comentarios (reusado por Pendientes y Seguimientos)
// ---------------------------------------------------------------------------
function Comentarios({ targetField, targetId }: { targetField: 'pendiente_id' | 'seguimiento_id'; targetId: string }) {
  const { user } = useAuth();
  const autorEmail = user?.email ?? '';
  const autorNombre = (user as any)?.user_metadata?.nombre || user?.email || 'Usuario';
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const fotosAdj = useAdjuntos();
  const queryKey = ['compliance_comentarios', targetField, targetId];

  const { data: comentarios = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_comentarios').select('*').eq(targetField, targetId).order('created_at');
      if (error) throw error;
      return (data ?? []) as Comentario[];
    },
    refetchInterval: 15000,
  });
  const mapaFotos = useFotosNexus(comentarios.flatMap(c => (c.fotos ?? []).map(f => f.id)));
  const puedeEnviar = !!texto.trim() || fotosAdj.adjuntos.length > 0;

  const enviar = useMutation({
    mutationFn: async (contenido: string) => {
      // Las fotos se suben al OneDrive (Cumplimiento Normativo/Seguimiento/…); aquí solo se guarda su id
      const fotos = fotosAdj.adjuntos.length
        ? await subirFotos(fotosAdj.adjuntos, targetField === 'pendiente_id' ? { cn_pendiente_id: targetId } : { cn_seguimiento_id: targetId })
        : null;
      const { error } = await supabase.from('compliance_comentarios').insert({
        [targetField]: targetId, autor_email: autorEmail, autor_nombre: autorNombre, contenido, fotos,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); queryClient.invalidateQueries({ queryKey: ['compliance_comentarios_resumen'] }); setTexto(''); fotosAdj.limpiar(); },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo enviar el comentario'),
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compliance_comentarios').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <div>
      <div className="space-y-2 max-h-72 overflow-y-auto mb-3 pr-1">
        {comentarios.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Sin comentarios aún.</p>}
        {comentarios.map(c => (
          <div key={c.id} className="group relative bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            <p className="text-[10px] font-bold text-slate-500 mb-0.5">{c.autor_nombre}</p>
            {c.contenido && <p className="text-sm text-slate-800 whitespace-pre-wrap">{c.contenido}</p>}
            <FotosDeComentario fotos={c.fotos} mapa={mapaFotos} />
            <p className="text-[10px] text-slate-400 mt-1">{fmtFull(c.created_at)}</p>
            {c.autor_email === autorEmail && (
              <button onClick={() => { if (confirm('¿Eliminar este comentario?')) eliminar.mutate(c.id); }}
                className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white text-red-500 hover:text-red-700 rounded-full p-1 shadow border border-slate-200">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" {...fotosAdj.alSoltar}>
        <SelectorFotos adjuntos={fotosAdj.adjuntos} agregar={fotosAdj.agregar} quitar={fotosAdj.quitar} deshabilitado={enviar.isPending} />
        <textarea
          value={texto} onChange={e => setTexto(e.target.value)} onPaste={fotosAdj.alPegar}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (puedeEnviar && !enviar.isPending) enviar.mutate(texto.trim()); } }}
          placeholder="Escribe una nota o actualización... (puedes pegar fotos con Ctrl+V)" rows={2}
          className="flex-1 min-w-0 text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#00295A]/20"
        />
        <button onClick={() => puedeEnviar && enviar.mutate(texto.trim())} disabled={enviar.isPending || !puedeEnviar}
          className="px-3 rounded-lg bg-[#00295A] text-white text-xs font-bold disabled:opacity-40 hover:bg-[#003a7a] shrink-0">
          {enviar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function CumplimientoSeguimiento() {
  const { isAdmin, can } = usePermissions();
  const { user } = useAuth();
  const autorEmail = user?.email ?? '';
  const autorNombre = (user as any)?.user_metadata?.nombre || user?.email || 'Usuario';
  const queryClient = useQueryClient();
  const { data: docs = [] } = useComplianceDocs();
  const colegios = useMemo(() => Array.from(new Set(docs.map(d => d.colegio))).sort(), [docs]);

  const [tab, setTab] = useState<'notas' | 'personales' | 'compartidos' | 'seguimiento'>('notas');
  const [search, setSearch] = useState('');
  const [filtroOrigen, setFiltroOrigen] = useState<'todos' | 'acuerdo' | 'accion' | 'otros'>('todos');

  // ── Queries ──────────────────────────────────────────────────────────
  const { data: notas = [], isLoading: lNotas, isError: eNotas, refetch: rNotas } = useQuery({
    queryKey: ['compliance_notas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_notas').select('*').order('fijada', { ascending: false }).order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Nota[];
    },
  });

  const { data: pendientes = [], isLoading: lPend, isError: ePend, refetch: rPend } = useQuery({
    queryKey: ['compliance_pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_pendientes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Pendiente[];
    },
  });

  const { data: seguimientos = [], isLoading: lSeg, isError: eSeg, refetch: rSeg } = useQuery({
    queryKey: ['compliance_seguimientos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_seguimientos').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Seguimiento[];
    },
  });

  const filteredNotas = useMemo(() => notas.filter(n => !search || n.titulo.toLowerCase().includes(search.toLowerCase()) || (n.contenido ?? '').toLowerCase().includes(search.toLowerCase())), [notas, search]);
  const pendPersonalesTodos = useMemo(() => pendientes.filter(p => p.tipo === 'personal'), [pendientes]);
  const conteoOrigen = useMemo(() => {
    const act = pendPersonalesTodos.filter(abierto);
    return { todos: act.length, acuerdo: act.filter(p => origenDe(p) && p.origen === 'acuerdo').length,
      accion: act.filter(p => origenDe(p) && p.origen === 'accion').length, otros: act.filter(p => !origenDe(p)).length };
  }, [pendPersonalesTodos]);
  const pendPersonales = useMemo(() => pendPersonalesTodos.filter(p => {
    if (filtroOrigen === 'todos') return true;
    const o = origenDe(p);
    return filtroOrigen === 'otros' ? !o : (!!o && p.origen === filtroOrigen);
  }), [pendPersonalesTodos, filtroOrigen]);
  const pendCompartidos = useMemo(() => pendientes.filter(p => p.tipo === 'compartido'), [pendientes]);

  // Resumen de comentarios por pendiente (count + última fecha), igual que NEXUS
  const { data: rawComentResumen = [] } = useQuery({
    queryKey: ['compliance_comentarios_resumen'],
    queryFn: async () => {
      const { data } = await supabase.from('compliance_comentarios').select('pendiente_id, created_at')
        .not('pendiente_id', 'is', null).order('created_at', { ascending: false });
      return data ?? [];
    },
    refetchInterval: 30000,
  });
  const comentariosMap = useMemo(() => {
    const map: Record<string, { count: number; lastDate: string }> = {};
    for (const c of rawComentResumen as any[]) {
      if (!map[c.pendiente_id]) map[c.pendiente_id] = { count: 1, lastDate: c.created_at };
      else map[c.pendiente_id].count++;
    }
    return map;
  }, [rawComentResumen]);
  const seguimientosActivos = useMemo(() => seguimientos.filter(s => s.estatus === 'activo'), [seguimientos]);

  const kpis = useMemo(() => ({
    total: pendientes.length,
    activos: pendientes.filter(abierto).length,
    personales: pendPersonalesTodos.length,
    compartidos: pendCompartidos.length,
    completados: pendientes.filter(p => p.estatus === 'completado').length,
    urgentes: pendientes.filter(p => p.prioridad === 'urgente' && p.estatus !== 'completado').length,
    enSeguimiento: seguimientosActivos.length,
  }), [pendientes, pendPersonalesTodos, pendCompartidos, seguimientosActivos]);

  // ── Mutaciones: Notas ────────────────────────────────────────────────
  const [showNota, setShowNota] = useState(false);
  const [editNota, setEditNota] = useState<Nota | null>(null);
  const [viewNota, setViewNota] = useState<Nota | null>(null);
  const [notaConColegio, setNotaConColegio] = useState(false);
  const [notaForm, setNotaForm] = useState({ titulo: '', contenido: '', categoria: 'General', color: '#0f172a', fijada: false, territorio: '', colegio: '' });

  const openNota = (n?: Nota) => {
    setEditNota(n ?? null);
    setNotaConColegio(!!n?.colegio);
    setNotaForm(n ? { titulo: n.titulo, contenido: n.contenido ?? '', categoria: n.categoria, color: n.color, fijada: n.fijada, territorio: n.territorio ?? '', colegio: n.colegio ?? '' }
                  : { titulo: '', contenido: '', categoria: 'General', color: '#0f172a', fijada: false, territorio: '', colegio: '' });
    setShowNota(true);
  };

  const guardarNota = useMutation({
    mutationFn: async () => {
      if (!notaForm.titulo.trim()) throw new Error('Escribe un título');
      const payload = {
        titulo: notaForm.titulo.trim(), contenido: notaForm.contenido.trim() || null,
        categoria: notaForm.categoria, color: notaForm.color, fijada: notaForm.fijada,
        colegio: notaConColegio ? (notaForm.colegio || null) : null,
        territorio: notaConColegio ? (notaForm.territorio || null) : null,
      };
      if (editNota) {
        const { error } = await supabase.from('compliance_notas').update(payload).eq('id', editNota.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compliance_notas').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_notas'] }); toast.success(editNota ? 'Nota actualizada' : 'Nota creada'); setShowNota(false); },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo guardar'),
  });

  const eliminarNota = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('compliance_notas').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_notas'] }); toast.success('Nota eliminada'); },
  });

  // ── Mutaciones: Pendientes ───────────────────────────────────────────
  const [showPend, setShowPend] = useState(false);
  const [editPend, setEditPend] = useState<Pendiente | null>(null);
  const [viewPend, setViewPend] = useState<Pendiente | null>(null);
  const [pendForm, setPendForm] = useState({
    titulo: '', descripcion: '', tipo: 'personal' as 'personal' | 'compartido',
    asignado_a: '', asignado_nombre: '', prioridad: 'normal' as Pendiente['prioridad'],
    fecha_limite: '', hora_limite: '', estatus: 'pendiente' as Pendiente['estatus'], colegio: '', territorio: '',
    presentar_semanal: false,
  });

  // Usuarios del sistema (para "Compartidos") — misma fuente que NEXUS.
  // La notificación por correo se activa después; por ahora solo se guarda
  // a quién se asignó.
  const { data: allUsers = [] } = useQuery({
    queryKey: ['sys_users_compliance'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_permissions').select('user_email, nombre, territorio, colegio, puesto').neq('user_email', autorEmail);
      if (error) throw error;
      return (data ?? []) as SysUser[];
    },
  });

  const usuariosPorGrupo = useMemo(() => {
    const codigoColegio = pendForm.colegio || undefined; // colegio ya es el código corto (ej. "MA CON")
    const colegioObj = docs.find(d => d.colegio === pendForm.colegio);
    const territorioSel = colegioObj?.territorio;
    const fmaUsers = allUsers.filter(u => u.territorio === 'FMA');
    const colegioUsers = codigoColegio
      ? allUsers.filter(u => u.colegio === codigoColegio)
      : territorioSel
        ? allUsers.filter(u => u.territorio === territorioSel)
        : [];
    return { colegioUsers, fmaUsers };
  }, [allUsers, pendForm.colegio, docs]);
  const todosUsuarios = [...usuariosPorGrupo.colegioUsers, ...usuariosPorGrupo.fmaUsers];

  const openPend = (p?: Pendiente) => {
    setEditPend(p ?? null);
    setPendForm(p
      ? { titulo: p.titulo, descripcion: p.descripcion ?? '', tipo: p.tipo, asignado_a: p.asignado_a ?? '', asignado_nombre: p.asignado_nombre ?? '', prioridad: p.prioridad, fecha_limite: p.fecha_limite ?? '', hora_limite: p.hora_limite?.slice(0, 5) ?? '', estatus: p.estatus, colegio: p.colegio ?? '', territorio: p.territorio ?? '', presentar_semanal: !!p.presentar_semanal }
      : { titulo: '', descripcion: '', tipo: tab === 'compartidos' ? 'compartido' : 'personal', asignado_a: '', asignado_nombre: '', prioridad: 'normal', fecha_limite: '', hora_limite: '', estatus: 'pendiente', colegio: '', territorio: '', presentar_semanal: false });
    setShowPend(true);
  };

  const guardarPend = useMutation({
    mutationFn: async () => {
      if (!pendForm.titulo.trim()) throw new Error('Escribe un título');
      const colegioObj = docs.find(d => d.colegio === pendForm.colegio);
      const payload = {
        titulo: pendForm.titulo.trim(), descripcion: pendForm.descripcion.trim() || null,
        tipo: pendForm.tipo, asignado_a: pendForm.asignado_a.trim() || null, asignado_nombre: pendForm.asignado_nombre.trim() || null,
        prioridad: pendForm.prioridad, fecha_limite: pendForm.fecha_limite || null,
        // La hora solo tiene sentido con fecha; vacía = 9:00 en el calendario
        hora_limite: pendForm.fecha_limite && pendForm.hora_limite ? pendForm.hora_limite : null, estatus: pendForm.estatus,
        colegio: pendForm.colegio || null, territorio: colegioObj?.territorio ?? (pendForm.territorio || null),
        presentar_semanal: pendForm.presentar_semanal,
      };
      if (editPend) {
        const { error } = await supabase.from('compliance_pendientes').update(payload).eq('id', editPend.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compliance_pendientes').insert({ ...payload, created_by: autorEmail });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_pendientes'] }); toast.success(editPend ? 'Pendiente actualizado' : 'Pendiente creado'); setShowPend(false); },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo guardar'),
  });

  const invalidarMinutas = () => {
    queryClient.invalidateQueries({ queryKey: ['minuta_acuerdos'] });
    queryClient.invalidateQueries({ queryKey: ['acuerdos_seguimiento'] });
  };

  const eliminarPend = useMutation({
    mutationFn: async (p: Pendiente) => {
      // La base de datos: si viene de una minuta y estaba abierto, el acuerdo queda Cancelado
      await supabase.from('compliance_comentarios').delete().eq('pendiente_id', p.id);
      const { error } = await supabase.from('compliance_pendientes').delete().eq('id', p.id);
      if (error) throw error;
      logAudit({ accion: 'eliminar', modulo: 'seguimiento_cn', registro_id: p.id, registro_ref: `Pendiente de Seguimiento: ${p.titulo}` });
    },
    onSuccess: (_d, p) => {
      queryClient.invalidateQueries({ queryKey: ['compliance_pendientes'] });
      queryClient.invalidateQueries({ queryKey: ['compliance_comentarios_resumen'] });
      if (origenDe(p)) invalidarMinutas();
      toast.success('Eliminado');
      setConfirmDel(null); setViewPend(null);
    },
  });
  const [confirmDel, setConfirmDel] = useState<Pendiente | null>(null);
  const confirmarEliminar = (p: Pendiente) => setConfirmDel(p);

  const cambiarEstatusPend = useMutation({
    mutationFn: async ({ p, estatus }: { p: Pendiente; estatus: Pendiente['estatus'] }) => {
      const { error } = await supabase.from('compliance_pendientes').update({
        estatus, completado_at: estatus === 'completado' ? new Date().toISOString() : null,
      }).eq('id', p.id);
      if (error) throw error;
      if (estatus === 'completado') logAudit({ accion: 'completar', modulo: 'seguimiento_cn', registro_id: p.id, registro_ref: `Pendiente de Seguimiento: ${p.titulo}` });
    },
    onSuccess: (_d, { p, estatus }) => {
      queryClient.invalidateQueries({ queryKey: ['compliance_pendientes'] });
      const o = origenDe(p);
      if (o) {
        invalidarMinutas();
        if (estatus === 'completado') toast.success(`${o.corto} completado ✓ — también quedó Cumplido en Minutas`);
        if (estatus === 'cancelado') toast.success(`${o.corto} cancelado — también en Minutas`);
      }
      setViewPend(v => (v && v.id === p.id ? { ...v, estatus } : v));
    },
  });

  // ── Editar un pendiente que viene de una minuta: el texto y la fecha se cambian en el acuerdo ──
  const [editAcuerdo, setEditAcuerdo] = useState<Pendiente | null>(null);
  const [acForm, setAcForm] = useState({ descripcion: '', fecha: '', hora: '', prioridad: 'normal' as Pendiente['prioridad'], presentar_semanal: false });
  const abrirEditarAcuerdo = (p: Pendiente) => {
    setAcForm({ descripcion: p.descripcion || p.titulo, fecha: p.fecha_limite ?? '', hora: p.hora_limite?.slice(0, 5) ?? '', prioridad: p.prioridad || 'normal', presentar_semanal: !!p.presentar_semanal });
    setEditAcuerdo(p);
  };
  const editar = (p: Pendiente) => { if (origenDe(p)) abrirEditarAcuerdo(p); else openPend(p); };
  const saveAcuerdo = useMutation({
    mutationFn: async (p: Pendiente) => {
      if (!acForm.descripcion.trim()) throw new Error('El texto del acuerdo es obligatorio');
      // 1) El acuerdo en Minutas: la base de datos actualiza el pendiente (título, descripción y fecha límite)
      const { error: e1 } = await supabase.from('minuta_acuerdos')
        .update({ descripcion: acForm.descripcion.trim(), fecha_compromiso: acForm.fecha || null, hora_compromiso: acForm.fecha && acForm.hora ? acForm.hora : null })
        .eq('id', p.acuerdo_id!);
      if (e1) throw e1;
      // 2) Lo que solo existe en Seguimiento
      const { error: e2 } = await supabase.from('compliance_pendientes')
        .update({ prioridad: acForm.prioridad, presentar_semanal: acForm.presentar_semanal })
        .eq('id', p.id);
      if (e2) throw e2;
      logAudit({ accion: 'editar', modulo: 'seguimiento_cn', registro_id: p.id, registro_ref: `Acuerdo de minuta: ${p.titulo}` });
    },
    onSuccess: (_d, p) => {
      queryClient.invalidateQueries({ queryKey: ['compliance_pendientes'] });
      invalidarMinutas();
      toast.success(`${origenDe(p)?.corto ?? 'Acuerdo'} actualizado — también en Minutas`);
      setEditAcuerdo(null);
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo actualizar el acuerdo'),
  });

  // ── Mutaciones: Seguimiento ──────────────────────────────────────────
  const [showSeg, setShowSeg] = useState(false);
  const [viewSeg, setViewSeg] = useState<Seguimiento | null>(null);
  const [segForm, setSegForm] = useState({ colegio: '', resumen: '' });

  const crearSeg = useMutation({
    mutationFn: async () => {
      if (!segForm.colegio) throw new Error('Elige un colegio');
      if (!segForm.resumen.trim()) throw new Error('Escribe un resumen del seguimiento');
      const colegioObj = docs.find(d => d.colegio === segForm.colegio);
      const { error } = await supabase.from('compliance_seguimientos').insert({
        colegio: segForm.colegio, territorio: colegioObj?.territorio ?? null, resumen: segForm.resumen.trim(), estatus: 'activo',
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_seguimientos'] }); toast.success('Seguimiento creado'); setShowSeg(false); setSegForm({ colegio: '', resumen: '' }); },
    onError: (err: any) => toast.error(err?.message ?? 'No se pudo crear'),
  });

  const completarSeg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compliance_seguimientos').update({ estatus: 'completado', completado_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_seguimientos'] }); toast.success('Marcado como completado'); setViewSeg(null); },
  });

  const eliminarSeg = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('compliance_seguimientos').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['compliance_seguimientos'] }); toast.success('Seguimiento eliminado'); setViewSeg(null); },
  });

  const isLoading = lNotas || lPend || lSeg;
  const isError = eNotas || ePend || eSeg;
  const refetchAll = () => { rNotas(); rPend(); rSeg(); };

  const descargarPDF = async (p: Pendiente) => {
    const { data } = await supabase.from('compliance_comentarios').select('*').eq('pendiente_id', p.id).order('created_at');
    generarPDFPendiente(p, (data ?? []) as Comentario[]);
  };

  // ── Tarjeta de Pendiente (idéntica a NEXUS) ──────────────────────────────
  const PendCard = ({ p }: { p: Pendiente }) => {
    const pCfg   = PRIO_CFG[p.prioridad];
    const eCfg   = EST_CFG[p.estatus];
    const coment = comentariosMap[p.id];
    const hasComents = coment && coment.count > 0;
    const org = origenDe(p);
    return (
      <div onClick={() => setViewPend(p)}
        className={`bg-white rounded-xl border border-slate-200 border-t-4 border-l-4 ${eCfg?.cardBorder??'border-t-slate-300'} ${pCfg?.cardLeft??'border-l-slate-300'} ${org?`ring-2 ${org.ring}`:''} shadow-sm overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition`}>
        {org && (
          <div className={`${org.band} text-white px-4 py-1.5 flex items-center gap-1.5`}>
            <org.Icon className="w-3.5 h-3.5 shrink-0"/>
            <span className="text-[10px] font-black uppercase tracking-wider truncate">{org.label}{p.origen_numero?` #${p.origen_numero}`:''}</span>
          </div>
        )}
        <div className="p-4 flex-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className={`font-black text-sm text-slate-900 leading-snug ${p.estatus==='completado'?'line-through text-slate-400':''}`}>{p.titulo}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border shrink-0 ${pCfg?.cls}`}>{pCfg?.label}</span>
          </div>

          {/* Descripción */}
          {p.descripcion && !(org && p.descripcion === p.titulo) && (
            <p className="text-xs text-slate-500 line-clamp-2 mb-2">{p.descripcion}</p>
          )}

          {p.presentar_semanal && p.estatus!=='completado' && (
            <span className="inline-flex items-center gap-1 mb-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-orange-100 text-orange-700 border border-orange-200">Presentación semanal</span>
          )}

          {/* Minuta / nota técnica de origen */}
          {org && (
            <div className={`rounded-lg border px-2.5 py-1.5 mb-2 text-[11px] leading-snug ${org.soft}`}>
              <p className="font-bold truncate"><FileText className="w-3 h-3 inline mr-1 -mt-0.5"/>{org.doc}: {p.origen_asunto || 'Sin asunto'}{p.origen_fecha?` · ${fmtDate(p.origen_fecha)}`:''}</p>
              {p.origen_responsable && <p className="opacity-80 truncate">Responsable: <span className="font-semibold">{p.origen_responsable}</span></p>}
            </div>
          )}

          {/* Colegio / Territorio */}
          {(p.colegio||p.territorio) && (
            <div className="flex items-center gap-1.5 mb-2">
              {p.territorio && <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full"><MapPin className="w-2.5 h-2.5 inline mr-0.5"/>{p.territorio}</span>}
              {p.colegio    && <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full"><Building2 className="w-2.5 h-2.5 inline mr-0.5"/>{p.colegio}</span>}
            </div>
          )}

          {/* Asignado / Fecha */}
          <div className="text-xs text-slate-500 space-y-0.5">
            {p.tipo==='compartido'&&p.asignado_nombre && <p className="font-semibold text-teal-600 text-xs">→ <span className="font-black">{p.asignado_nombre}</span></p>}
            {p.fecha_limite && (() => {
              const limite = new Date(p.fecha_limite.includes('T') ? p.fecha_limite : p.fecha_limite + 'T12:00:00'); limite.setHours(23,59,59,0);
              const ahora  = new Date();
              const manana = new Date(ahora); manana.setDate(manana.getDate() + 1); manana.setHours(23,59,59,0);
              const vencido    = abierto(p) && limite < ahora;
              const porVencer  = abierto(p) && !vencido && limite <= manana;
              return (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className={`font-semibold text-sm ${vencido ? 'text-red-600' : 'text-amber-600'}`}>
                    📅 {fmtDate(p.fecha_limite)}{p.hora_limite && ` · ${fmtHora(p.hora_limite)}`}
                  </p>
                  {vencido && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">
                      🔴 VENCIDO
                    </span>
                  )}
                  {porVencer && (
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      🟡 Vence hoy/mañana
                    </span>
                  )}
                </div>
              );
            })()}
            {hasComents && coment.lastDate && (
              <p className="text-slate-400 text-[10px]">Actualizado: {fmtDate(coment.lastDate)}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between" onClick={e => e.stopPropagation()}>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${eCfg?.cls}`}>{eCfg?.icon}{eCfg?.label}</span>
          <div className="flex items-center gap-1">
            {abierto(p) && <button type="button" onClick={e=>{e.stopPropagation();descargarICSPendiente(p);toast.success('Archivo de calendario descargado: ábrelo para agregarlo a Outlook');}} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Agregar a mi calendario (.ics)" aria-label="Agregar a mi calendario"><CalendarPlus className="w-4 h-4"/></button>}
            {abierto(p) && <button type="button" onClick={e=>{e.stopPropagation();cambiarEstatusPend.mutate({ p, estatus: 'completado' });}} className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition" title="Completar"><CheckCircle2 className="w-4 h-4"/></button>}
            {abierto(p) && <button type="button" title={org?'Editar acuerdo (también se actualiza en Minutas)':'Editar'} onClick={e=>{e.stopPropagation();editar(p);}} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"><Pencil className="w-3.5 h-3.5"/></button>}
            {!abierto(p) && <button type="button" onClick={e=>{e.stopPropagation();descargarPDF(p);}} className="p-1.5 text-slate-400 hover:text-teal-600 rounded-lg transition" title="PDF"><Download className="w-4 h-4"/></button>}
            <button type="button" onClick={e=>{e.stopPropagation();confirmarEliminar(p);}} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5"/></button>
            {/* Ícono comentarios — con color e indicador si hay comentarios */}
            <div className="relative p-1.5">
              <MessageSquare className={`w-3.5 h-3.5 ${hasComents ? 'text-teal-500' : 'text-slate-300'}`}/>
              {hasComents && (
                <span className="absolute -top-0.5 -right-0.5 bg-teal-500 text-white text-[9px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {coment.count > 9 ? '9+' : coment.count}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const PendGrid = ({ items }: { items: Pendiente[] }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map(p => <PendCard key={p.id} p={p}/>)}
    </div>
  );

  // Lista compacta para Completados (igual que NEXUS)
  const PendListCompletados = ({ items }: { items: Pendiente[] }) => (
    <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {items.map(p => {
        const pCfg   = PRIO_CFG[p.prioridad];
        const coment = comentariosMap[p.id];
        const hasComents = coment && coment.count > 0;
        const org = origenDe(p);
        return (
          <div key={p.id} onClick={() => setViewPend(p)}
            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition">
            {p.estatus === 'cancelado' ? <X className="w-4 h-4 text-slate-400 shrink-0" /> : <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-sm text-slate-400 line-through truncate">{p.titulo}</p>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${pCfg?.cls}`}>{pCfg?.label}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {org && <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full ${org.chip}`}><org.Icon className="w-3 h-3"/>{org.corto}{p.origen_numero?` #${p.origen_numero}`:''} · {p.origen_asunto || org.doc}</span>}
                {p.colegio && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"><Building2 className="w-2.5 h-2.5 inline mr-0.5"/>{p.colegio}</span>}
                {hasComents && coment.lastDate && <span className="text-[10px] text-slate-400">Actualizado: {fmtDate(coment.lastDate)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
              <button type="button" onClick={e=>{e.stopPropagation();descargarPDF(p);}} className="p-1.5 text-slate-400 hover:text-teal-600 rounded-lg transition" title="PDF"><Download className="w-4 h-4"/></button>
              <button type="button" onClick={e=>{e.stopPropagation();confirmarEliminar(p);}} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5"/></button>
              <div className="relative p-1.5">
                <MessageSquare className={`w-3.5 h-3.5 ${hasComents ? 'text-teal-500' : 'text-slate-300'}`}/>
                {hasComents && (
                  <span className="absolute -top-0.5 -right-0.5 bg-teal-500 text-white text-[9px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                    {coment.count > 9 ? '9+' : coment.count}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (!isAdmin && !can('ver_cumplimiento')) {
    return (
      <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
        <PageHeader title="Seguimiento" subtitle="Notas, pendientes y seguimiento de la documentación de Cumplimiento" />
        <AccesoRestringido />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Seguimiento de Trámites" subtitle="El NEXUS de Cumplimiento: notas, pendientes (incluye los acuerdos de las Minutas de Cumplimiento) y seguimiento por colegio" />
      </div>

      {isError ? <ErrorBlock onRetry={refetchAll} /> : isLoading ? <LoadingBlock /> : (
        <div className="space-y-5">
          {/* Acciones */}
          <div className="flex justify-end -mt-4">
            {tab === 'notas' && <button onClick={() => openNota()} className={btnPrimary + " flex items-center gap-2"}><Plus className="w-4 h-4" />Nueva Nota</button>}
            {(tab === 'personales' || tab === 'compartidos') && <button onClick={() => openPend()} className={btnPrimary + " flex items-center gap-2"}><Plus className="w-4 h-4" />Nuevo Pendiente</button>}
            {tab === 'seguimiento' && <button onClick={() => setShowSeg(true)} className={btnPrimary + " flex items-center gap-2"}><Plus className="w-4 h-4" />Nuevo Seguimiento</button>}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
            {[
              { label: 'Total Pendientes', val: kpis.total, color: 'text-slate-800' },
              { label: 'Activos', val: kpis.activos, color: 'text-blue-600' },
              { label: 'Personales', val: kpis.personales, color: 'text-indigo-600' },
              { label: 'Compartidos', val: kpis.compartidos, color: 'text-teal-600' },
              { label: 'Completados', val: kpis.completados, color: 'text-emerald-600' },
              { label: 'Urgentes', val: kpis.urgentes, color: 'text-red-500' },
              { label: 'En Seguimiento', val: kpis.enSeguimiento, color: 'text-cyan-600' },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
                <p className={`text-2xl font-black ${k.color}`}>{k.val}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
            <button onClick={() => setTab('notas')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'notas' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <FileText className="w-4 h-4" />Notas<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'notas' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{notas.length}</span>
            </button>
            <button onClick={() => setTab('personales')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'personales' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <ListChecks className="w-4 h-4" />Mis Pendientes<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'personales' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{pendPersonalesTodos.filter(abierto).length}</span>
            </button>
            <button onClick={() => setTab('compartidos')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'compartidos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Users className="w-4 h-4" />Compartidos<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'compartidos' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{pendCompartidos.filter(abierto).length}</span>
            </button>
            <button onClick={() => setTab('seguimiento')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab === 'seguimiento' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <ClipboardList className="w-4 h-4" />Seguimiento<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'seguimiento' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{seguimientosActivos.length}</span>
            </button>
          </div>

          {tab === 'notas' && (
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-full focus:ring-2 focus:ring-slate-900 focus:outline-none" placeholder="Buscar notas..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}

          {/* ── Notas ── */}
          {tab === 'notas' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredNotas.length === 0 && <div className="col-span-3 text-center py-12"><FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-500">Sin notas aún</p></div>}
              {filteredNotas.map(n => (
                <div key={n.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition" onClick={() => setViewNota(n)}>
                  <div className="h-2" style={{ background: n.color }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">{n.fijada && <Pin className="w-3 h-3 text-amber-500 shrink-0" />}<h3 className="font-bold text-slate-900 text-sm truncate">{n.titulo}</h3></div>
                        <div className="flex gap-1 flex-wrap">
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{n.categoria}</span>
                          {n.colegio && <span className="text-[10px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{n.colegio.replace('Mano Amiga ', '')}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 ml-2" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openNota(n)} className="p-1 text-slate-400 hover:text-slate-700 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if (confirm('¿Eliminar esta nota?')) eliminarNota.mutate(n.id); }} className="p-1 text-red-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-3">{n.contenido || <span className="italic">Sin contenido</span>}</p>
                    <p className="text-[10px] text-slate-400 mt-3">{fmtDate(n.updated_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Pendientes (igual que NEXUS) ── */}
          {(tab === 'personales' || tab === 'compartidos') && (
            <div className="space-y-6">
              {/* Filtro por origen — solo si hay acuerdos/acciones de Minutas */}
              {tab==='personales' && (conteoOrigen.acuerdo>0 || conteoOrigen.accion>0 || filtroOrigen!=='todos') && (
                <div className="flex items-center gap-2 flex-wrap">
                  {([
                    { k:'todos',   label:'Todos',                cls:'bg-slate-900 text-white border-slate-900', Icon:ListChecks },
                    { k:'acuerdo', label:'Acuerdos de minuta',   cls:'bg-indigo-600 text-white border-indigo-600', Icon:Handshake },
                    { k:'accion',  label:'Acciones de nota técnica', cls:'bg-orange-600 text-white border-orange-600', Icon:Wrench },
                    { k:'otros',   label:'Otros pendientes',     cls:'bg-slate-600 text-white border-slate-600', Icon:ClipboardList },
                  ] as const).map(f => (
                    <button key={f.k} type="button" onClick={()=>setFiltroOrigen(f.k)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition ${filtroOrigen===f.k?f.cls:'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                      <f.Icon className="w-3.5 h-3.5"/>{f.label}
                      <span className={`px-1.5 rounded-full text-[10px] ${filtroOrigen===f.k?'bg-white/25':'bg-slate-100'}`}>{conteoOrigen[f.k]}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* Activos */}
              {(tab==='personales'?pendPersonales:pendCompartidos).filter(abierto).length===0 && <div className="text-center py-12"><CheckCircle2 className="w-10 h-10 text-emerald-200 mx-auto mb-3"/><p className="text-sm font-semibold text-slate-500">¡Todo al día!</p></div>}
              <PendGrid items={(tab==='personales'?pendPersonales:pendCompartidos).filter(abierto)}/>

              {/* Completados */}
              {(tab==='personales'?pendPersonales:pendCompartidos).filter(p=>!abierto(p)).length>0&&(
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5"/>Completados — evidencia</p>
                  <PendListCompletados items={(tab==='personales'?pendPersonales:pendCompartidos).filter(p=>!abierto(p))}/>
                </div>
              )}
            </div>
          )}

          {/* ── Seguimiento por colegio ── */}
          {tab === 'seguimiento' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><Presentation className="w-3.5 h-3.5 text-orange-600" />
                En la Presentación Semanal, el último comentario de la semana de cada seguimiento activo llena "Actualización de esta semana" de su colegio (con su foto, si tiene).</p>
              {seguimientos.length === 0 && <div className="text-center py-12"><ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" /><p className="text-sm font-semibold text-slate-500">Sin seguimientos registrados</p></div>}
              {seguimientos.map(s => (
                <div key={s.id} onClick={() => setViewSeg(s)}
                  className={`bg-white border rounded-lg px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow ${s.estatus === 'activo' ? 'border-cyan-200' : 'border-slate-200 opacity-70'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{s.colegio.replace('Mano Amiga ', '')}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{s.resumen}</p>
                      <p className="text-[10px] text-slate-400 mt-1">Iniciado {fmtDate(s.created_at)}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${s.estatus === 'activo' ? 'bg-cyan-100 text-cyan-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {s.estatus === 'activo' ? 'Activo' : 'Completado'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Ver/editar Nota ── */}
      {viewNota && (
        <Modal title={viewNota.titulo} onClose={() => setViewNota(null)} wide>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-3 h-3 rounded-full" style={{ background: viewNota.color }} />
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{viewNota.categoria}</span>
              {viewNota.fijada && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Pin className="w-3 h-3" />Fijada</span>}
              {viewNota.colegio && <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{viewNota.colegio.replace('Mano Amiga ', '')}</span>}
            </div>
            <div className="bg-slate-50 rounded-lg p-4 min-h-[160px] text-sm text-slate-700 whitespace-pre-wrap">{viewNota.contenido || <span className="text-slate-400 italic">Sin contenido</span>}</div>
            <p className="text-xs text-slate-400">Actualizada: {fmtFull(viewNota.updated_at)}</p>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setViewNota(null)} className={btnOutline + " flex-1"}>Cerrar</button>
            <button onClick={() => { setViewNota(null); openNota(viewNota); }} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}><Pencil className="w-4 h-4" />Editar</button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Crear/editar Nota ── */}
      {showNota && (
        <Modal title={editNota ? 'Editar Nota' : 'Nueva Nota'} onClose={() => setShowNota(false)}>
          <div className="space-y-3">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Título</label><input autoFocus className={inputCls} value={notaForm.titulo} onChange={e => setNotaForm(f => ({ ...f, titulo: e.target.value }))} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contenido</label><textarea rows={4} className={inputCls + ' resize-none'} value={notaForm.contenido} onChange={e => setNotaForm(f => ({ ...f, contenido: e.target.value }))} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoría</label><select className={inputCls} value={notaForm.categoria} onChange={e => setNotaForm(f => ({ ...f, categoria: e.target.value }))}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Color</label><div className="flex gap-2 flex-wrap pt-1">{COLORES.map(c => <button key={c} onClick={() => setNotaForm(f => ({ ...f, color: c }))} className={`w-6 h-6 rounded-full border-2 transition ${notaForm.color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`} style={{ background: c }} />)}</div></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notaConColegio} onChange={e => setNotaConColegio(e.target.checked)} />Asociar a un colegio</label>
            {notaConColegio && (
              <select className={inputCls} value={notaForm.colegio} onChange={e => setNotaForm(f => ({ ...f, colegio: e.target.value }))}>
                <option value="">Elige un colegio</option>
                {colegios.map(c => <option key={c} value={c}>{c.replace('Mano Amiga ', '')}</option>)}
              </select>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notaForm.fijada} onChange={e => setNotaForm(f => ({ ...f, fijada: e.target.checked }))} />Fijar nota arriba</label>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowNota(false)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button onClick={() => guardarNota.mutate()} disabled={guardarNota.isPending} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}>
              {guardarNota.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Guardar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Ver pendiente + comentarios ── */}
      {viewPend && (
        <Modal title={viewPend.titulo} onClose={() => setViewPend(null)} wide>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${PRIO_CFG[viewPend.prioridad]?.cls}`}>{PRIO_CFG[viewPend.prioridad]?.label}</span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${EST_CFG[viewPend.estatus]?.cls}`}>{EST_CFG[viewPend.estatus]?.icon}{EST_CFG[viewPend.estatus]?.label}</span>
              {viewPend.colegio && <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{viewPend.colegio.replace('Mano Amiga ', '')}</span>}
            </div>
            {viewPend.presentar_semanal && viewPend.estatus !== 'completado' && (
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1"><Presentation className="w-3.5 h-3.5" />Se presenta en la semanal (sección Cumplimiento Normativo)</p>
            )}
            {(() => { const org = origenDe(viewPend); if (!org) return null; return (
              <div className={`rounded-xl border overflow-hidden ${org.soft}`}>
                <div className={`${org.band} text-white px-4 py-2 flex items-center gap-2`}>
                  <org.Icon className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-wider">{org.label}{viewPend.origen_numero ? ` #${viewPend.origen_numero}` : ''}</span>
                </div>
                <div className="px-4 py-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="col-span-2"><p className="text-[10px] font-bold uppercase opacity-60 mb-0.5">{org.doc} de Cumplimiento</p><p className="font-bold">{viewPend.origen_asunto || 'Sin asunto'}</p></div>
                  {viewPend.origen_fecha && <div><p className="text-[10px] font-bold uppercase opacity-60 mb-0.5">Fecha de la {org.doc.toLowerCase()}</p><p className="font-semibold">{fmtDate(viewPend.origen_fecha)}</p></div>}
                  <div><p className="text-[10px] font-bold uppercase opacity-60 mb-0.5">Responsable</p><p className="font-semibold">{viewPend.origen_responsable || '—'}</p></div>
                </div>
                <div className="px-4 pb-3 flex flex-wrap gap-2">
                  {viewPend.origen_url && <a href={viewPend.origen_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-current/20 rounded-lg text-xs font-bold hover:shadow-sm transition"><FileText className="w-3.5 h-3.5" />Ver {org.doc.toLowerCase()} (PDF)</a>}
                  <RouterLink to="/cumplimiento/minutas?vista=acuerdos" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-current/20 rounded-lg text-xs font-bold hover:shadow-sm transition"><FileText className="w-3.5 h-3.5" />Ir a Seguimiento de Acuerdos</RouterLink>
                </div>
                <p className="px-4 pb-3 text-[11px] opacity-75 flex items-start gap-1.5"><Lock className="w-3 h-3 mt-0.5 shrink-0" /><span>Sincronizado con Minutas: al completarlo aquí queda <b>Cumplido</b> allá. El texto y la fecha se editan con el lápiz y también cambian en la minuta.</span></p>
              </div>
            ); })()}
            {viewPend.descripcion && !(origenDe(viewPend) && viewPend.descripcion === viewPend.titulo) && <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{viewPend.descripcion}</p>}
            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
              {viewPend.fecha_limite && <span>📅 Fecha límite: {fmtDate(viewPend.fecha_limite)}{viewPend.hora_limite && ` · ${fmtHora(viewPend.hora_limite)}`}</span>}
              {viewPend.tipo === 'compartido' && viewPend.asignado_nombre && <span>→ Asignado a: {viewPend.asignado_nombre}</span>}
            </div>
            <div className="flex gap-1.5 flex-wrap pt-1">
              {(['pendiente', 'en_proceso', 'completado', 'cancelado'] as const).map(est => (
                <button key={est} onClick={() => cambiarEstatusPend.mutate({ p: viewPend, estatus: est })}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${viewPend.estatus === est ? EST_CFG[est].cls : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'}`}>
                  {EST_CFG[est].label}
                </button>
              ))}
            </div>
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Notas y seguimiento</p>
              <Comentarios targetField="pendiente_id" targetId={viewPend.id} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => confirmarEliminar(viewPend)} className="p-2 rounded-lg text-red-500 hover:bg-red-50" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
            <button onClick={() => setViewPend(null)} className={btnOutline + " flex-1"}>Cerrar</button>
            <button onClick={() => { const p = viewPend; setViewPend(null); editar(p); }} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}><Pencil className="w-4 h-4" />Editar</button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Crear/editar Pendiente ── */}
      {showPend && (
        <Modal title={editPend ? 'Editar Pendiente' : 'Nuevo Pendiente'} onClose={() => setShowPend(false)}>
          <div className="space-y-3">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Título</label><input autoFocus className={inputCls} value={pendForm.titulo} onChange={e => setPendForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej. Conseguir Uso de Suelo actualizado" /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción</label><textarea rows={2} className={inputCls + ' resize-none'} value={pendForm.descripcion} onChange={e => setPendForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo</label>
                <select className={inputCls} value={pendForm.tipo} onChange={e => setPendForm(f => ({ ...f, tipo: e.target.value as 'personal' | 'compartido', asignado_a: '', asignado_nombre: '' }))}>
                  <option value="personal">Personal</option>
                  <option value="compartido">Compartido</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prioridad</label>
                <select className={inputCls} value={pendForm.prioridad} onChange={e => setPendForm(f => ({ ...f, prioridad: e.target.value as Pendiente['prioridad'] }))}>
                  <option value="urgente">Urgente</option><option value="alta">Alta</option><option value="normal">Normal</option><option value="baja">Baja</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio</label>
                <select className={inputCls} value={pendForm.colegio} onChange={e => setPendForm(f => ({ ...f, colegio: e.target.value, asignado_a: '', asignado_nombre: '' }))}>
                  <option value="">General (sin colegio)</option>
                  {colegios.map(c => <option key={c} value={c}>{c.replace('Mano Amiga ', '')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha límite</label>
                <input type="date" className={inputCls} value={pendForm.fecha_limite} onChange={e => setPendForm(f => ({ ...f, fecha_limite: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hora <span className="normal-case font-normal text-slate-400">(opcional)</span></label>
                <input type="time" className={inputCls} value={pendForm.hora_limite} disabled={!pendForm.fecha_limite} title={pendForm.fecha_limite ? 'Hora del evento en Outlook; vacía = 9:00' : 'Primero elige la fecha'} onChange={e => setPendForm(f => ({ ...f, hora_limite: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm bg-orange-50 border border-orange-200 rounded-lg p-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={pendForm.presentar_semanal} onChange={e => setPendForm(f => ({ ...f, presentar_semanal: e.target.checked }))} />
              <span><b className="text-orange-800">Presentar en la semanal</b>
                <span className="block text-xs text-orange-700">Sale como diapositiva después de su colegio, en la sección Cumplimiento Normativo de la Presentación Semanal.</span>
                {pendForm.presentar_semanal && !pendForm.colegio && <span className="block text-xs text-red-600 font-semibold mt-0.5">Selecciona un colegio para que pueda aparecer.</span>}
              </span>
            </label>
            {pendForm.tipo === 'compartido' && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-bold text-teal-700 uppercase">Asignar a usuario *</p>
                {!pendForm.colegio ? (
                  <p className="text-xs text-teal-600">Elige un colegio arriba para ver a los usuarios registrados ahí.</p>
                ) : todosUsuarios.length === 0 ? (
                  <p className="text-xs text-teal-600">No hay usuarios registrados para {pendForm.colegio.replace('Mano Amiga ', '')} todavía.</p>
                ) : (
                  <select className={inputCls} value={pendForm.asignado_a} onChange={e => {
                    const u = todosUsuarios.find(u => u.user_email === e.target.value);
                    setPendForm(f => ({ ...f, asignado_a: e.target.value, asignado_nombre: u?.nombre || e.target.value }));
                  }}>
                    <option value="">Selecciona un usuario...</option>
                    {usuariosPorGrupo.colegioUsers.length > 0 && (
                      <optgroup label={`— ${pendForm.colegio.replace('Mano Amiga ', '')} —`}>
                        {usuariosPorGrupo.colegioUsers.map(u => <option key={u.user_email} value={u.user_email}>{u.nombre || u.user_email} — {u.puesto || u.colegio}</option>)}
                      </optgroup>
                    )}
                    {usuariosPorGrupo.fmaUsers.length > 0 && (
                      <optgroup label="— FMA Oficinas —">
                        {usuariosPorGrupo.fmaUsers.map(u => <option key={u.user_email} value={u.user_email}>{u.nombre || u.user_email} — {u.puesto || 'FMA'}</option>)}
                      </optgroup>
                    )}
                  </select>
                )}
                {pendForm.asignado_a && <p className="text-xs text-teal-700 font-semibold">📧 {pendForm.asignado_a}</p>}
                <p className="text-[11px] text-teal-600 italic">La notificación por correo a esta persona se activa más adelante — por ahora solo se guarda la asignación.</p>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowPend(false)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button onClick={() => guardarPend.mutate()} disabled={guardarPend.isPending} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}>
              {guardarPend.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Guardar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Confirmar eliminación (igual que NEXUS) ── */}
      {confirmDel && (
        <Modal title="Confirmar eliminación" onClose={() => setConfirmDel(null)}>
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="font-bold text-red-800 text-sm mb-1">¿Eliminar "{confirmDel.titulo}"?</p><p className="text-xs text-red-700">Esta acción no se puede deshacer.</p></div>
            {origenDe(confirmDel) && (
              <div className={`rounded-lg p-3 border text-xs ${origenDe(confirmDel)!.soft}`}>
                <p className="font-bold mb-0.5">Este pendiente viene de {confirmDel.origen === 'acuerdo' ? 'un acuerdo de minuta' : 'una acción de nota técnica'}.</p>
                <p>{confirmDel.estatus === 'completado' ? 'En Minutas se conserva como Cumplido.' : 'En Minutas quedará como Cancelado.'}</p>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-4">
            <button type="button" onClick={() => setConfirmDel(null)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button type="button" disabled={eliminarPend.isPending} onClick={() => eliminarPend.mutate(confirmDel)} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition">{eliminarPend.isPending ? 'Eliminando...' : 'Sí, eliminar'}</button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Editar pendiente que viene de una minuta ── */}
      {editAcuerdo && (() => { const o = origenDe(editAcuerdo); return (
        <Modal title={`Editar ${o?.corto.toLowerCase() ?? 'acuerdo'}`} onClose={() => setEditAcuerdo(null)}>
          <div className="space-y-3">
            <div className={`rounded-lg border p-3 text-xs ${o?.soft ?? ''}`}>
              <p className="font-bold"><FileText className="w-3 h-3 inline mr-1 -mt-0.5" />{o?.doc ?? 'Minuta'}: {editAcuerdo.origen_asunto || 'Sin asunto'}{editAcuerdo.origen_fecha ? ` · ${fmtDate(editAcuerdo.origen_fecha)}` : ''}</p>
              <p className="opacity-80">El texto y la fecha también se actualizan en Minutas{editAcuerdo.origen_responsable ? ` · Responsable: ${editAcuerdo.origen_responsable}` : ''}.</p>
            </div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">{o?.corto ?? 'Acuerdo'}</label>
              <textarea rows={3} className={inputCls + ' resize-none'} value={acForm.descripcion} onChange={e => setAcForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha compromiso</label>
                <input type="date" className={inputCls} value={acForm.fecha} onChange={e => setAcForm(f => ({ ...f, fecha: e.target.value }))} /></div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hora <span className="normal-case font-normal text-slate-400">(opcional)</span></label>
                <input type="time" className={inputCls} value={acForm.hora} disabled={!acForm.fecha} title={acForm.fecha ? 'Hora del evento en Outlook; vacía = 9:00' : 'Primero elige la fecha'} onChange={e => setAcForm(f => ({ ...f, hora: e.target.value }))} /></div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prioridad</label>
                <select className={inputCls} value={acForm.prioridad} onChange={e => setAcForm(f => ({ ...f, prioridad: e.target.value as Pendiente['prioridad'] }))}>
                  <option value="urgente">Urgente</option><option value="alta">Alta</option><option value="normal">Normal</option><option value="baja">Baja</option>
                </select></div>
            </div>
            <label className="flex items-start gap-2 text-sm bg-orange-50 border border-orange-200 rounded-lg p-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={acForm.presentar_semanal} onChange={e => setAcForm(f => ({ ...f, presentar_semanal: e.target.checked }))} />
              <span><b className="text-orange-800">Presentar en la semanal</b>
                <span className="block text-xs text-orange-700">Sale como diapositiva después de {editAcuerdo.colegio || 'su colegio'}, en la sección Cumplimiento Normativo.</span></span>
            </label>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setEditAcuerdo(null)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button onClick={() => saveAcuerdo.mutate(editAcuerdo)} disabled={saveAcuerdo.isPending} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}>
              {saveAcuerdo.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Guardar
            </button>
          </div>
        </Modal>
      ); })()}

      {/* ── Modal: Nuevo Seguimiento ── */}
      {showSeg && (
        <Modal title="Nuevo Seguimiento" onClose={() => setShowSeg(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio</label>
              <select className={inputCls} value={segForm.colegio} onChange={e => setSegForm(f => ({ ...f, colegio: e.target.value }))}>
                <option value="">Elige un colegio</option>
                {colegios.map(c => <option key={c} value={c}>{c.replace('Mano Amiga ', '')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Resumen</label>
              <textarea rows={3} className={inputCls + ' resize-none'} value={segForm.resumen} onChange={e => setSegForm(f => ({ ...f, resumen: e.target.value }))} placeholder="Qué se está siguiendo con este colegio..." />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={() => setShowSeg(false)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button onClick={() => crearSeg.mutate()} disabled={crearSeg.isPending} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}>
              {crearSeg.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Crear
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Ver Seguimiento + comentarios ── */}
      {viewSeg && (
        <Modal title={viewSeg.colegio.replace('Mano Amiga ', '')} onClose={() => setViewSeg(null)} wide>
          <div className="space-y-3">
            <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${viewSeg.estatus === 'activo' ? 'bg-cyan-100 text-cyan-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {viewSeg.estatus === 'activo' ? 'Activo' : 'Completado'}
            </span>
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{viewSeg.resumen}</p>
            <p className="text-xs text-slate-400">Iniciado: {fmtFull(viewSeg.created_at)}</p>
            <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Bitácora de seguimiento</p>
              <Comentarios targetField="seguimiento_id" targetId={viewSeg.id} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { if (confirm('¿Eliminar este seguimiento y su bitácora?')) eliminarSeg.mutate(viewSeg.id); }} className="p-2 rounded-lg text-red-500 hover:bg-red-50" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
            <button onClick={() => setViewSeg(null)} className={btnOutline + " flex-1"}>Cerrar</button>
            {viewSeg.estatus === 'activo' && (
              <button onClick={() => completarSeg.mutate(viewSeg.id)} disabled={completarSeg.isPending} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}>
                {completarSeg.isPending && <Loader2 className="w-4 h-4 animate-spin" />}Marcar completado
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
