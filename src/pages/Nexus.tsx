import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { TERRITORIOS, getColegiosByTerritorio } from '@/lib/colegios';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { logAudit } from '@/lib/audit';
import { notifyByEmail } from '@/lib/notifications';
import {
  Plus, X, Pencil, Trash2, CheckCircle2, Clock, AlertCircle,
  MessageSquare, Send, FileText, Pin, Search, Download,
  BookOpen, ListChecks, Users, MapPin, Building2, Link2,
  ClipboardList, BarChart3,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Nota      { id: string; titulo: string; contenido: string; categoria: string; color: string; fijada: boolean; colegio: string; territorio: string; created_at: string; updated_at: string; }
interface Pendiente { id: string; titulo: string; descripcion: string; tipo: string; asignado_a: string; asignado_nombre: string; asignado_cc: string; asignado_cc_nombre: string; prioridad: string; fecha_limite: string | null; estatus: string; completado_at: string | null; created_by: string; created_at: string;
  proyecto_id?: string; proyecto_nombre?: string; ticket_id?: string; ticket_folio?: string; colegio?: string; territorio?: string; }
interface Comentario { id: string; pendiente_id: string; autor_email: string; autor_nombre: string; contenido: string; leido: boolean; created_at: string; }
interface SysUser   { user_email: string; nombre: string; territorio: string; colegio: string; puesto: string; }

const COLORES    = ['#0f172a','#0d8a7e','#2563eb','#7c3aed','#db2777','#ea580c','#16a34a','#d97706'];
const CATEGORIAS = ['General','Importante','Ideas','Recordatorios','Proyectos','Personal'];
const PRIO_CFG: Record<string,{label:string;cls:string;dot:string;cardLeft:string;selectorBg:string;selectorText:string}> = {
  urgente: { label:'🔴 Urgente', cls:'bg-red-100 text-red-700 border-red-200',        dot:'bg-red-500',    cardLeft:'border-l-red-500',    selectorBg:'bg-red-500',    selectorText:'text-white' },
  alta:    { label:'🟠 Alta',    cls:'bg-orange-100 text-orange-700 border-orange-200', dot:'bg-orange-500', cardLeft:'border-l-orange-400', selectorBg:'bg-orange-400', selectorText:'text-white' },
  normal:  { label:'🔵 Normal',  cls:'bg-blue-100 text-blue-700 border-blue-200',     dot:'bg-blue-500',   cardLeft:'border-l-blue-400',   selectorBg:'bg-blue-500',   selectorText:'text-white' },
  baja:    { label:'⚪ Baja',    cls:'bg-slate-100 text-slate-500 border-slate-200',  dot:'bg-slate-400',  cardLeft:'border-l-slate-300',  selectorBg:'bg-slate-300',  selectorText:'text-slate-700' },
};
const EST_CFG: Record<string,{label:string;icon:React.ReactNode;cls:string;cardBorder:string}> = {
  pendiente:  { label:'Pendiente',  icon:<Clock className="w-3 h-3"/>,        cls:'bg-amber-100 text-amber-700 border-amber-200',    cardBorder:'border-t-amber-400'   },
  en_proceso: { label:'En Proceso', icon:<AlertCircle className="w-3 h-3"/>,  cls:'bg-blue-100 text-blue-700 border-blue-200',       cardBorder:'border-t-blue-400'    },
  completado: { label:'Completado', icon:<CheckCircle2 className="w-3 h-3"/>, cls:'bg-emerald-100 text-emerald-700 border-emerald-200', cardBorder:'border-t-emerald-400' },
};
const fmtDate = (d?: string | null) => d ? format(new Date(d.includes('T') ? d : d + 'T12:00:00'), "d MMM yyyy", { locale: es }) : '—';
const fmtFull = (d?: string | null) => d ? format(new Date(d), "d MMM yyyy HH:mm", { locale: es }) : '—';
const inputCls  = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";
const btnPrimary = "px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 transition";
const btnOutline = "px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition";

// ── PDF ────────────────────────────────────────────────────────────────────────
async function generarPDFPendiente(p: Pendiente, comentarios: Comentario[]) {
  let JsPDF = (window as any).jspdf?.jsPDF;
  if (!JsPDF) { await new Promise<void>((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = () => res(); s.onerror = rej; document.head.appendChild(s); }).catch(()=>null); JsPDF = (window as any).jspdf?.jsPDF; }
  if (!JsPDF) { toast.error('No se pudo cargar jsPDF'); return; }
  const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W = 210; let y = 0;
  const now = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
  doc.setFillColor(15,23,42); doc.rect(0,0,W,32,'F'); doc.setFillColor(13,138,126); doc.rect(0,0,4,32,'F');
  doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255); doc.text('NEXUS — Pendiente',14,13);
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(148,163,184); doc.text('Sistema RCMA  ·  Generado el '+now,14,21); doc.text('Documento confidencial — solo para uso interno',14,27);
  try { const li=await new Promise<string>((res,rej)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{const cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;cv.getContext('2d')!.drawImage(img,0,0);res(cv.toDataURL('image/png'));};img.onerror=rej;img.src='/logo.png';}); doc.addImage(li,'PNG',W-38,4,22,22); } catch {}
  y = 42;
  // Recuadro info del pendiente
  const PRIO_LABEL_PDF: Record<string,string> = { urgente:'URGENTE', alta:'ALTA', normal:'NORMAL', baja:'BAJA' };
  const EST_LABEL_PDF:  Record<string,string> = { pendiente:'Pendiente', en_proceso:'En Proceso', completado:'Completado', cancelado:'Cancelado' };
  const PRIO_RGB: Record<string,[number,number,number]> = { urgente:[220,38,38], alta:[234,88,12], normal:[37,99,235], baja:[100,116,139] };
  const pRGB = PRIO_RGB[p.prioridad] ?? [100,116,139];

  // Barra de color según prioridad
  doc.setFillColor(...pRGB); doc.rect(12, y, 4, 42, 'F');
  doc.setFillColor(248,250,252); doc.rect(16, y, W-28, 42, 'F');
  doc.setDrawColor(220,220,230); doc.setLineWidth(0.3); doc.rect(12, y, W-24, 42, 'D');

  // Título
  doc.setFontSize(13); doc.setFont('helvetica','bold'); doc.setTextColor(15,23,42);
  doc.text(p.titulo, 20, y+8);

  // Badge de prioridad
  doc.setFillColor(...pRGB); doc.roundedRect(W-46, y+3, 30, 7, 1, 1, 'F');
  doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text(PRIO_LABEL_PDF[p.prioridad] ?? p.prioridad, W-31, y+8, { align:'center' });

  // Info línea 1
  doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
  doc.text('Estatus:', 20, y+16);
  doc.setFont('helvetica','normal'); doc.setTextColor(15,23,42);
  doc.text(EST_LABEL_PDF[p.estatus] ?? p.estatus, 40, y+16);
  doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
  doc.text('Tipo:', 80, y+16);
  doc.setFont('helvetica','normal'); doc.setTextColor(15,23,42);
  doc.text(p.tipo==='compartido'?'Compartido':'Personal', 93, y+16);

  // Info línea 2 — colegio/territorio
  if (p.colegio || p.territorio) {
    doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
    doc.text('Territorio / Colegio:', 20, y+23);
    doc.setFont('helvetica','normal'); doc.setTextColor(15,23,42);
    doc.text(`${p.territorio ?? ''}  /  ${p.colegio ?? ''}`, 63, y+23);
  }

  // Info línea 3 — proyecto
  if (p.proyecto_nombre) {
    doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
    doc.text('Proyecto:', 20, y+30);
    doc.setFont('helvetica','normal'); doc.setTextColor(37,99,235);
    const pNom = p.proyecto_nombre.length > 55 ? p.proyecto_nombre.slice(0,53)+'...' : p.proyecto_nombre;
    doc.text(pNom, 40, y+30);
  }

  // Info línea 4 — fechas
  const fechaY = y + (p.proyecto_nombre ? 37 : (p.colegio ? 30 : 23));
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
    comentarios.forEach((c,i)=>{ if(y>260){doc.addPage();y=20;} if(i%2===0){doc.setFillColor(248,250,252);doc.rect(12,y-4,W-24,16,'F');} doc.setFontSize(8);doc.setFont('helvetica','bold');doc.setTextColor(15,23,42);doc.text(c.autor_nombre,16,y);doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(100,116,139);doc.text(fmtFull(c.created_at),W-16,y,{align:'right'});doc.setFontSize(8.5);doc.setFont('helvetica','normal');doc.setTextColor(50,50,50);const lines=doc.splitTextToSize(c.contenido,W-32) as string[];doc.text(lines,16,y+6);y+=8+(lines.length*5); });
  }
  const pages=doc.getNumberOfPages(); for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFillColor(15,23,42);doc.rect(0,286,W,11,'F');doc.setFillColor(13,138,126);doc.rect(0,286,4,11,'F');doc.setFontSize(7);doc.setFont('helvetica','normal');doc.setTextColor(160,160,180);doc.text('Sistema RCMA  ·  NEXUS  ·  Documento confidencial',10,292);doc.text(`Pág. ${i} de ${pages}`,W-14,292,{align:'right'});}
  doc.save(`NEXUS-${p.titulo.replace(/\s+/g,'-').slice(0,30)}.pdf`);
}

// ── Modal ──────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide, xl }: { title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean;xl?:boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${xl?'max-w-3xl':wide?'max-w-2xl':'max-w-md'} flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <h3 className="font-black text-slate-900 text-sm">{title}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-200"><X className="w-4 h-4 text-slate-400"/></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

// ── Comentarios ────────────────────────────────────────────────────────────────
function ComentariosPanel({ pendiente, userEmail, userName, isAdmin }: { pendiente:Pendiente;userEmail:string;userName:string;isAdmin:boolean }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const { data: comentarios = [] } = useQuery({ queryKey:['nexus_comentarios',pendiente.id], queryFn: async()=>{ const {data}=await supabase.from('nexus_comentarios').select('*').eq('pendiente_id',pendiente.id).order('created_at'); return (data??[]) as Comentario[]; }, refetchInterval:15000 });
  const sendMutation = useMutation({ mutationFn: async(contenido:string)=>{ 
    await supabase.from('nexus_comentarios').insert({pendiente_id:pendiente.id,autor_email:userEmail,autor_nombre:userName,contenido}); 
    // Solo notificar si es compartido y hay alguien asignado
    if (pendiente.tipo === 'compartido') {
      const destEmail=isAdmin?pendiente.asignado_a:(pendiente.created_by||'rreyes@manoamiga.edu.mx'); 
      const destNombre=isAdmin?pendiente.asignado_nombre:'Ricardo Joanathan Reyes Medina'; 
      if(destEmail){ await supabase.functions.invoke('notify-nexus-comentario',{body:{destinatario_email:destEmail,destinatario_nombre:destNombre,autor_nombre:userName,pendiente_titulo:pendiente.titulo,comentario:contenido,siteUrl:window.location.origin}}); }
    }
  }, onSuccess:()=>{ qc.invalidateQueries({queryKey:['nexus_comentarios',pendiente.id]}); setTexto(''); setTimeout(()=>endRef.current?.scrollIntoView({behavior:'smooth'}),100); }, onError:(e:any)=>toast.error(e.message??'Error') });
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 max-h-52">
        {comentarios.length===0&&<p className="text-xs text-slate-400 text-center py-4">Sin comentarios aún.</p>}
        {comentarios.map(c=>{ const esMio=c.autor_email===userEmail; return (<div key={c.id} className={`flex ${esMio?'justify-end':'justify-start'}`}><div className={`max-w-[80%] rounded-xl px-3 py-2 ${esMio?'bg-slate-900 text-white':'bg-slate-100 text-slate-800'}`}><p className={`text-[10px] font-bold mb-1 ${esMio?'text-slate-300':'text-slate-500'}`}>{c.autor_nombre}</p><p className="text-sm">{c.contenido}</p><p className={`text-[10px] mt-1 ${esMio?'text-slate-400':'text-slate-400'}`}>{fmtFull(c.created_at)}</p></div></div>); })}
        <div ref={endRef}/>
      </div>
      <div className="flex gap-2">
        <textarea className={inputCls+" resize-none"} rows={2} placeholder="Escribe un comentario..." value={texto} onChange={e=>setTexto(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(texto.trim())sendMutation.mutate(texto.trim());}}}/>
        <button type="button" disabled={!texto.trim()||sendMutation.isPending} onClick={()=>sendMutation.mutate(texto.trim())} className="p-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40 transition shrink-0"><Send className="w-4 h-4"/></button>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export default function Nexus() {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const qc = useQueryClient();
  const userEmail = user?.email ?? '';
  const userName  = user?.user_metadata?.nombre || user?.email || 'Usuario';

  const [tab, setTab]         = useState<'notas'|'personales'|'compartidos'>(isAdmin?'notas':'compartidos');
  const [search, setSearch]   = useState('');
  const [expandedP, setExpandedP] = useState<string|null>(null);

  // Modals
  const [showNota,  setShowNota]  = useState(false);
  const [showPend,  setShowPend]  = useState(false);
  const [editNota,  setEditNota]  = useState<Nota|null>(null);
  const [editPend,  setEditPend]  = useState<Pendiente|null>(null);
  const [viewNota,  setViewNota]  = useState<Nota|null>(null);
  const [viewPend,  setViewPend]  = useState<Pendiente|null>(null);
  const [confirmDel, setConfirmDel] = useState<{type:'nota'|'pendiente';id:string;titulo:string}|null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: allUsers = [] } = useQuery({ queryKey:['sys_users_nexus'], queryFn: async()=>{ const {data}=await supabase.from('user_permissions').select('user_email, nombre, territorio, colegio, puesto').neq('user_email',userEmail); return (data??[]) as SysUser[]; }, enabled:isAdmin });

  const { data: rawProyectos = [] } = useQuery({ queryKey:['proyectos_nexus'], queryFn: async()=>{ const {data}=await supabase.from('projects').select('id, name, territorio, colegio').order('name'); return data??[]; }, enabled:isAdmin });

  const { data: rawTickets = [] } = useQuery({ queryKey:['tickets_nexus'], queryFn: async()=>{ const {data}=await supabase.from('tickets').select('id, folio, colegio, territorio').order('folio',{ascending:false}); return data??[]; }, enabled:isAdmin });

  const { data: notas = [] } = useQuery({ queryKey:['nexus_notas'], queryFn: async()=>{ const {data}=await supabase.from('nexus_notas').select('*').order('fijada',{ascending:false}).order('updated_at',{ascending:false}); return (data??[]) as Nota[]; }, enabled:isAdmin });

  const { data: pendientes = [] } = useQuery({ queryKey:['nexus_pendientes'], queryFn: async()=>{ let q=supabase.from('nexus_pendientes').select('*').order('created_at',{ascending:false}); if(!isAdmin) q=q.eq('asignado_a',userEmail).neq('estatus','completado'); const {data}=await q; return (data??[]) as Pendiente[]; }, refetchInterval:30000 });

  // Resumen de comentarios por pendiente (count + última fecha)
  const { data: rawComentResumen = [] } = useQuery({
    queryKey: ['nexus_comentarios_resumen'],
    queryFn: async () => {
      const { data } = await supabase.from('nexus_comentarios').select('pendiente_id, created_at').order('created_at', { ascending: false });
      return data ?? [];
    },
    refetchInterval: 30000,
  });
  const comentariosMap = useMemo(() => {
    const map: Record<string, { count: number; lastDate: string }> = {};
    for (const c of rawComentResumen as any[]) {
      if (!map[c.pendiente_id]) { map[c.pendiente_id] = { count: 1, lastDate: c.created_at }; }
      else { map[c.pendiente_id].count++; }
    }
    return map;
  }, [rawComentResumen]);

  // ── Form Nota ─────────────────────────────────────────────────────────────
  const [notaForm, setNotaForm] = useState({ titulo:'',contenido:'',categoria:'General',color:'#0f172a',fijada:false,territorio:'',colegio:'' });
  const [notaConColegio, setNotaConColegio] = useState(false);

  const saveNota = useMutation({
    mutationFn: async()=>{ if(editNota){await supabase.from('nexus_notas').update({...notaForm,updated_at:new Date().toISOString()}).eq('id',editNota.id);} else{await supabase.from('nexus_notas').insert(notaForm);} },
    onSuccess:()=>{
      qc.invalidateQueries({queryKey:['nexus_notas']}); toast.success('Nota guardada'); setShowNota(false);
      logAudit({ accion: editNota ? 'editar' : 'crear', modulo: 'nexus', registro_id: editNota?.id ?? null, registro_ref: notaForm.titulo ?? null });
      setEditNota(null);
    },
    onError:(e:any)=>toast.error(e.message),
  });

  // ── Form Pendiente ────────────────────────────────────────────────────────
  const [pendForm, setPendForm] = useState({ titulo:'',descripcion:'',tipo:'personal',asignado_a:'',asignado_nombre:'',asignado_cc:'',asignado_cc_nombre:'',prioridad:'normal',fecha_limite:'',estatus:'pendiente',proyecto_id:'',proyecto_nombre:'',ticket_id:'',ticket_folio:'',colegio:'',territorio:'' });
  const [sinProyecto, setSinProyecto] = useState(false);

  // Usuarios: colegio seleccionado + FMA siempre disponible
  const usuariosPorGrupo = useMemo(() => {
    const fmaUsers = allUsers.filter(u => u.territorio === 'FMA');
    const isFMA = pendForm.territorio === 'FMA';
    const colegioUsers = !isFMA && pendForm.colegio
      ? allUsers.filter(u => u.colegio === pendForm.colegio)
      : !isFMA && pendForm.territorio
        ? allUsers.filter(u => u.territorio === pendForm.territorio)
        : [];
    return { colegioUsers, fmaUsers: isFMA ? [] : fmaUsers };
  }, [allUsers, pendForm.colegio, pendForm.territorio]);
  const todosUsuarios = [...usuariosPorGrupo.colegioUsers, ...usuariosPorGrupo.fmaUsers];

  const savePend = useMutation({
    mutationFn: async()=>{ 
      if(!pendForm.titulo.trim()) throw new Error('El título es obligatorio'); 
      const data = {
        ...pendForm,
        proyecto_id:  pendForm.proyecto_id  || null,
        ticket_id:    pendForm.ticket_id    || null,
        fecha_limite: pendForm.fecha_limite || null,
        created_by:   userEmail,
        updated_at:   new Date().toISOString(),
      };
      if(editPend){ await supabase.from('nexus_pendientes').update(data).eq('id',editPend.id); }
      else { 
        const {error}=await supabase.from('nexus_pendientes').insert(data); 
        if(error) throw error; 
        if(pendForm.tipo==='compartido'&&pendForm.asignado_a){
          // Correo al responsable directo
          await supabase.functions.invoke('notify-nexus-asignacion',{body:{
            destinatario_email:pendForm.asignado_a,
            destinatario_nombre:pendForm.asignado_nombre||pendForm.asignado_a,
            titulo:pendForm.titulo, descripcion:pendForm.descripcion,
            prioridad:pendForm.prioridad,
            fecha_limite:pendForm.fecha_limite?fmtDate(pendForm.fecha_limite):null,
            asignado_por:userName, siteUrl:window.location.origin,
            es_directo:true,
          }});
          notifyByEmail(pendForm.asignado_a, {
            tipo:    pendForm.prioridad === 'urgente' ? 'urgente' : 'info',
            titulo:  `Nuevo pendiente asignado: ${pendForm.titulo}`,
            mensaje: `${userName} te asignó un pendiente${pendForm.fecha_limite ? ' con fecha límite ' + fmtDate(pendForm.fecha_limite) : ''}.`,
            link:    '/nexus',
            modulo:  'nexus',
          });
          // Correo al CC — con conocimiento de
          if(pendForm.asignado_cc){
            await supabase.functions.invoke('notify-nexus-asignacion',{body:{
              destinatario_email:pendForm.asignado_cc,
              destinatario_nombre:pendForm.asignado_cc_nombre||pendForm.asignado_cc,
              titulo:pendForm.titulo, descripcion:pendForm.descripcion,
              prioridad:pendForm.prioridad,
              fecha_limite:pendForm.fecha_limite?fmtDate(pendForm.fecha_limite):null,
              asignado_por:userName, siteUrl:window.location.origin,
              es_directo:false,
              responsable_nombre:pendForm.asignado_nombre||pendForm.asignado_a,
            }});
            notifyByEmail(pendForm.asignado_cc, {
              tipo:    'info',
              titulo:  `En copia: ${pendForm.titulo}`,
              mensaje: `${userName} te puso en copia de un pendiente asignado a ${pendForm.asignado_nombre || pendForm.asignado_a}.`,
              link:    '/nexus',
              modulo:  'nexus',
            });
          }
        } 
      } 
      logAudit({
        accion:       editPend ? 'editar' : 'crear',
        modulo:       'nexus',
        registro_id:  editPend?.id ?? null,
        registro_ref: pendForm.titulo,
        detalle:      { tipo: pendForm.tipo, asignado_a: pendForm.asignado_nombre || pendForm.asignado_a || null, prioridad: pendForm.prioridad },
      });
    },
    onSuccess:()=>{ qc.invalidateQueries({queryKey:['nexus_pendientes']}); toast.success('Pendiente guardado'); setShowPend(false); setEditPend(null); },
    onError:(e:any)=>toast.error(e.message),
  });

  const completarPend = useMutation({ 
    mutationFn: async(p: Pendiente) => { 
      await supabase.from('nexus_pendientes').update({
        estatus:'completado', completado_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq('id', p.id);
      // Notificar al responsable directo
      if (p.tipo === 'compartido' && p.asignado_a) {
        await supabase.functions.invoke('notify-nexus-comentario', {
          body: { destinatario_email:p.asignado_a, destinatario_nombre:p.asignado_nombre||p.asignado_a, autor_nombre:userName, pendiente_titulo:p.titulo, comentario:'✅ Este pendiente ha sido marcado como COMPLETADO.', siteUrl:window.location.origin },
        });
        // Notificar al CC si existe
        if (p.asignado_cc) {
          await supabase.functions.invoke('notify-nexus-comentario', {
            body: { destinatario_email:p.asignado_cc, destinatario_nombre:p.asignado_cc_nombre||p.asignado_cc, autor_nombre:userName, pendiente_titulo:p.titulo, comentario:`✅ El pendiente asignado a ${p.asignado_nombre} ha sido marcado como COMPLETADO.`, siteUrl:window.location.origin },
          });
        }
      }
      logAudit({ accion: 'completar', modulo: 'nexus', registro_id: p.id, registro_ref: p.titulo });
    },
    onSuccess: () => { qc.invalidateQueries({queryKey:['nexus_pendientes']}); toast.success('Pendiente completado ✓'); }
  });

  const deleteMutation = useMutation({
    mutationFn: async({type,id}:{type:'nota'|'pendiente';id:string})=>{
      if(type==='nota') await supabase.from('nexus_notas').delete().eq('id',id);
      else{ await supabase.from('nexus_comentarios').delete().eq('pendiente_id',id); await supabase.from('nexus_pendientes').delete().eq('id',id); }
      logAudit({ accion: 'eliminar', modulo: 'nexus', registro_id: id, registro_ref: type });
    },
    onSuccess:()=>{ qc.invalidateQueries({queryKey:['nexus_notas']}); qc.invalidateQueries({queryKey:['nexus_pendientes']}); toast.success('Eliminado'); setConfirmDel(null); }
  });

  // Marcar comentarios como leídos cuando se abre el pendiente
  const marcarComentariosLeidos = async (pendienteId: string) => {
    await supabase
      .from('nexus_comentarios')
      .update({ leido: true })
      .eq('pendiente_id', pendienteId)
      .eq('leido', false)
      .neq('autor_email', userEmail);
    qc.invalidateQueries({ queryKey: ['nexus_comentarios_resumen'] });
    qc.invalidateQueries({ queryKey: ['nexus_badge', userEmail] });
  };

  const openNota = (n?:Nota)=>{ setEditNota(n??null); setNotaConColegio(!!(n?.colegio)); setNotaForm(n?{titulo:n.titulo,contenido:n.contenido,categoria:n.categoria,color:n.color,fijada:n.fijada,territorio:n.territorio??'',colegio:n.colegio??''}:{titulo:'',contenido:'',categoria:'General',color:'#0f172a',fijada:false,territorio:'',colegio:''}); setShowNota(true); };

  const openPend = (p?:Pendiente)=>{ setEditPend(p??null); setSinProyecto(!!(p&&!p.proyecto_id&&p.proyecto_nombre)); setPendForm(p?{titulo:p.titulo,descripcion:p.descripcion,tipo:p.tipo,asignado_a:p.asignado_a,asignado_nombre:p.asignado_nombre,asignado_cc:p.asignado_cc??'',asignado_cc_nombre:p.asignado_cc_nombre??'',prioridad:p.prioridad,fecha_limite:p.fecha_limite??'',estatus:p.estatus,proyecto_id:p.proyecto_id??'',proyecto_nombre:p.proyecto_nombre??'',ticket_id:p.ticket_id??'',ticket_folio:p.ticket_folio??'',colegio:p.colegio??'',territorio:p.territorio??''}:{titulo:'',descripcion:'',tipo:tab==='compartidos'?'compartido':'personal',asignado_a:'',asignado_nombre:'',asignado_cc:'',asignado_cc_nombre:'',prioridad:'normal',fecha_limite:'',estatus:'pendiente',proyecto_id:'',proyecto_nombre:'',ticket_id:'',ticket_folio:'',colegio:'',territorio:''}); setShowPend(true); };

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(()=>({ total: pendientes.length, personales: pendientes.filter(p=>p.tipo==='personal').length, compartidos: pendientes.filter(p=>p.tipo==='compartido').length, completados: pendientes.filter(p=>p.estatus==='completado').length, urgentes: pendientes.filter(p=>p.prioridad==='urgente'&&p.estatus!=='completado').length, activos: pendientes.filter(p=>p.estatus!=='completado').length, }),[pendientes]);

  const filteredNotas   = useMemo(()=>notas.filter(n=>!search||n.titulo.toLowerCase().includes(search.toLowerCase())||n.contenido.toLowerCase().includes(search.toLowerCase())),[notas,search]);
  const pendPersonales  = useMemo(()=>pendientes.filter(p=>p.tipo==='personal'),[pendientes]);
  const pendCompartidos = useMemo(()=>isAdmin?pendientes.filter(p=>p.tipo==='compartido'):pendientes,[pendientes,isAdmin]);

  // ── Tarjeta de Pendiente ──────────────────────────────────────────────────
  const PendCard = ({ p }: { p:Pendiente }) => {
    const pCfg   = PRIO_CFG[p.prioridad];
    const eCfg   = EST_CFG[p.estatus];
    const coment = comentariosMap[p.id];
    const hasComents = coment && coment.count > 0;
    return (
      <div onClick={() => { setViewPend(p); marcarComentariosLeidos(p.id); }}
        className={`bg-white rounded-xl border border-slate-200 border-t-4 border-l-4 ${eCfg?.cardBorder??'border-t-slate-300'} ${pCfg?.cardLeft??'border-l-slate-300'} shadow-sm overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition`}>
        <div className="p-4 flex-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className={`font-black text-sm text-slate-900 leading-snug ${p.estatus==='completado'?'line-through text-slate-400':''}`}>{p.titulo}</h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border shrink-0 ${pCfg?.cls}`}>{pCfg?.label}</span>
          </div>

          {/* Descripción */}
          {p.descripcion && (
            <p className="text-xs text-slate-500 line-clamp-2 mb-2">{p.descripcion}</p>
          )}

          {/* Proyecto / Ticket */}
          {(p.proyecto_nombre||p.ticket_folio) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {p.proyecto_nombre && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full"><ClipboardList className="w-3 h-3"/>{p.proyecto_nombre}</span>}
              {p.ticket_folio && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full"><Link2 className="w-3 h-3"/>{p.ticket_folio}</span>}
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
            {p.tipo==='compartido'&&p.asignado_cc_nombre && <p className="text-slate-400 text-[10px]">Con conocimiento de: {p.asignado_cc_nombre}</p>}
            {p.fecha_limite && (() => {
              const limite = new Date(p.fecha_limite); limite.setHours(23,59,59,0);
              const ahora  = new Date();
              const manana = new Date(ahora); manana.setDate(manana.getDate() + 1); manana.setHours(23,59,59,0);
              const vencido    = limite < ahora;
              const porVencer  = !vencido && limite <= manana;
              return (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className={`font-semibold text-sm ${vencido ? 'text-red-600' : porVencer ? 'text-amber-600' : 'text-amber-600'}`}>
                    📅 {fmtDate(p.fecha_limite)}
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
            {isAdmin && p.estatus!=='completado' && <button type="button" onClick={e=>{e.stopPropagation();completarPend.mutate(p);}} className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition" title="Completar"><CheckCircle2 className="w-4 h-4"/></button>}
            {isAdmin&&p.estatus!=='completado' && <button type="button" onClick={e=>{e.stopPropagation();openPend(p);}} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"><Pencil className="w-3.5 h-3.5"/></button>}
            {p.estatus==='completado' && <button type="button" onClick={async e=>{e.stopPropagation();const items=await supabase.from('nexus_comentarios').select('*').eq('pendiente_id',p.id).order('created_at').then(r=>r.data??[]); generarPDFPendiente(p,items as Comentario[]);}} className="p-1.5 text-slate-400 hover:text-teal-600 rounded-lg transition" title="PDF"><Download className="w-4 h-4"/></button>}
            {isAdmin && <button type="button" onClick={e=>{e.stopPropagation();setConfirmDel({type:'pendiente',id:p.id,titulo:p.titulo});}} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5"/></button>}
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

  const PendGrid = ({ items }: { items:Pendiente[] }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map(p=><PendCard key={p.id} p={p}/>)}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2"><BookOpen className="w-6 h-6 text-teal-600"/>NEXUS</h1>
          <p className="text-sm text-slate-500 mt-0.5">Notas, pendientes y colaboración</p>
        </div>
        <div className="flex gap-2">
          {isAdmin&&tab==='notas' && <button type="button" onClick={()=>openNota()} className={btnPrimary+" flex items-center gap-2"}><Plus className="w-4 h-4"/>Nueva Nota</button>}
          {(tab==='personales'||tab==='compartidos')&&isAdmin && <button type="button" onClick={()=>openPend()} className={btnPrimary+" flex items-center gap-2"}><Plus className="w-4 h-4"/>Nuevo Pendiente</button>}
        </div>
      </div>

      {/* KPIs — solo admin */}
      {isAdmin && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {[
            { label:'Total Pendientes', val:kpis.total,       color:'text-slate-800'   },
            { label:'Activos',          val:kpis.activos,     color:'text-blue-600'    },
            { label:'Personales',       val:kpis.personales,  color:'text-indigo-600'  },
            { label:'Compartidos',      val:kpis.compartidos, color:'text-teal-600'    },
            { label:'Completados',      val:kpis.completados, color:'text-emerald-600' },
            { label:'Urgentes',         val:kpis.urgentes,    color:'text-red-500'     },
          ].map(k=>(
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
              <p className={`text-3xl font-black ${k.color}`}>{k.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {isAdmin&&<button type="button" onClick={()=>setTab('notas')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab==='notas'?'bg-white text-slate-900 shadow-sm':'text-slate-500 hover:text-slate-700'}`}><FileText className="w-4 h-4"/>Notas<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab==='notas'?'bg-slate-900 text-white':'bg-slate-200 text-slate-500'}`}>{notas.length}</span></button>}
        {isAdmin&&<button type="button" onClick={()=>setTab('personales')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab==='personales'?'bg-white text-slate-900 shadow-sm':'text-slate-500 hover:text-slate-700'}`}><ListChecks className="w-4 h-4"/>Mis Pendientes<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab==='personales'?'bg-slate-900 text-white':'bg-slate-200 text-slate-500'}`}>{pendPersonales.filter(p=>p.estatus!=='completado').length}</span></button>}
        <button type="button" onClick={()=>setTab('compartidos')} className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition ${tab==='compartidos'?'bg-white text-slate-900 shadow-sm':'text-slate-500 hover:text-slate-700'}`}><Users className="w-4 h-4"/>{isAdmin?'Compartidos':'Mis Pendientes'}<span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab==='compartidos'?'bg-slate-900 text-white':'bg-slate-200 text-slate-500'}`}>{pendCompartidos.filter(p=>p.estatus!=='completado').length}</span></button>
      </div>

      {/* Búsqueda notas */}
      {tab==='notas'&&<div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-full focus:ring-2 focus:ring-slate-900 focus:outline-none" placeholder="Buscar notas..." value={search} onChange={e=>setSearch(e.target.value)}/></div>}

      {/* ── Notas ────────────────────────────────────────────────────────── */}
      {tab==='notas'&&isAdmin&&(
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotas.length===0&&<div className="col-span-3 text-center py-12"><FileText className="w-10 h-10 text-slate-200 mx-auto mb-3"/><p className="text-sm font-semibold text-slate-500">Sin notas aún</p></div>}
          {filteredNotas.map(n=>(
            <div key={n.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition" onClick={()=>setViewNota(n)}>
              <div className="h-2" style={{background:n.color}}/>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">{n.fijada&&<Pin className="w-3 h-3 text-amber-500 shrink-0"/>}<h3 className="font-bold text-slate-900 text-sm truncate">{n.titulo}</h3></div>
                    <div className="flex gap-1 flex-wrap">
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{n.categoria}</span>
                      {n.colegio&&<span className="text-[10px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{n.colegio}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2" onClick={e=>e.stopPropagation()}>
                    <button type="button" onClick={()=>openNota(n)} className="p-1 text-slate-400 hover:text-slate-700 rounded"><Pencil className="w-3.5 h-3.5"/></button>
                    <button type="button" onClick={()=>setConfirmDel({type:'nota',id:n.id,titulo:n.titulo})} className="p-1 text-red-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5"/></button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 line-clamp-3">{n.contenido||<span className="italic">Sin contenido</span>}</p>
                <p className="text-[10px] text-slate-400 mt-3">{fmtDate(n.updated_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pendientes ───────────────────────────────────────────────────── */}
      {(tab==='personales'||tab==='compartidos')&&(
        <div className="space-y-6">
          {/* Activos */}
          {(tab==='personales'?pendPersonales:pendCompartidos).filter(p=>p.estatus!=='completado').length===0 && <div className="text-center py-12"><CheckCircle2 className="w-10 h-10 text-emerald-200 mx-auto mb-3"/><p className="text-sm font-semibold text-slate-500">¡Todo al día!</p></div>}
          <PendGrid items={(tab==='personales'?pendPersonales:pendCompartidos).filter(p=>p.estatus!=='completado')}/>

          {/* Completados — solo admin */}
          {isAdmin&&(tab==='personales'?pendPersonales:pendCompartidos).filter(p=>p.estatus==='completado').length>0&&(
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5"/>Completados — evidencia</p>
              <PendGrid items={(tab==='personales'?pendPersonales:pendCompartidos).filter(p=>p.estatus==='completado')}/>
            </div>
          )}
        </div>
      )}

      {/* ══ MODALES ═══════════════════════════════════════════════════════════ */}

      {/* Ver Pendiente */}
      {viewPend && (
        <Modal title={viewPend.titulo} onClose={() => { setViewPend(null); }} wide>
          <div className="space-y-4">
            {/* Badges prioridad / estatus */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${PRIO_CFG[viewPend.prioridad]?.cls}`}>{PRIO_CFG[viewPend.prioridad]?.label}</span>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${EST_CFG[viewPend.estatus]?.cls}`}>{EST_CFG[viewPend.estatus]?.icon}{EST_CFG[viewPend.estatus]?.label}</span>
              <span className="text-xs text-slate-400 ml-auto">{fmtDate(viewPend.created_at)}</span>
            </div>

            {/* Descripción */}
            {viewPend.descripcion && (
              <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 whitespace-pre-wrap min-h-[60px]">{viewPend.descripcion}</div>
            )}

            {/* Info colegio / proyecto */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {viewPend.territorio && <div><p className="text-xs font-bold text-slate-400 uppercase mb-1">Territorio</p><p className="font-semibold text-teal-700">{viewPend.territorio}</p></div>}
              {viewPend.colegio    && <div><p className="text-xs font-bold text-slate-400 uppercase mb-1">Colegio</p><p className="font-semibold text-slate-700">{viewPend.colegio}</p></div>}
              {viewPend.proyecto_nombre && <div><p className="text-xs font-bold text-slate-400 uppercase mb-1">Proyecto vinculado</p><p className="font-semibold text-blue-700">{viewPend.proyecto_nombre}</p></div>}
              {viewPend.asignado_nombre && viewPend.tipo==='compartido' && <div><p className="text-xs font-bold text-slate-400 uppercase mb-1">Responsable directo</p><p className="font-semibold text-teal-700">{viewPend.asignado_nombre}</p><p className="text-xs text-slate-400">{viewPend.asignado_a}</p></div>}
              {viewPend.asignado_cc_nombre && <div><p className="text-xs font-bold text-slate-400 uppercase mb-1">Con conocimiento de</p><p className="font-semibold text-slate-600">{viewPend.asignado_cc_nombre}</p><p className="text-xs text-slate-400">{viewPend.asignado_cc}</p></div>}
              {viewPend.fecha_limite && <div><p className="text-xs font-bold text-slate-400 uppercase mb-1">Fecha límite</p><p className="font-semibold text-amber-600">{fmtDate(viewPend.fecha_limite)}</p></div>}
              {viewPend.completado_at && <div><p className="text-xs font-bold text-slate-400 uppercase mb-1">Completado el</p><p className="font-semibold text-emerald-600">{fmtFull(viewPend.completado_at)}</p></div>}
            </div>

            {/* Comentarios */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5"/>Comentarios</p>
              <ComentariosPanel pendiente={viewPend} userEmail={userEmail} userName={userName} isAdmin={isAdmin}/>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button type="button" onClick={() => setViewPend(null)} className={btnOutline + " flex-1"}>Cerrar</button>
            {isAdmin && viewPend.estatus !== 'completado' && (
              <button type="button" onClick={() => { setViewPend(null); openPend(viewPend); }} className={btnPrimary + " flex-1 flex items-center justify-center gap-2"}><Pencil className="w-4 h-4"/>Editar</button>
            )}
            {isAdmin && viewPend.estatus !== 'completado' && (
              <button type="button" onClick={() => { completarPend.mutate(viewPend); setViewPend(null); }}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4"/> Completar
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Ver Nota */}
      {viewNota&&(<Modal title={viewNota.titulo} onClose={()=>setViewNota(null)} wide><div className="space-y-3"><div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{background:viewNota.color}}/><span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{viewNota.categoria}</span>{viewNota.fijada&&<span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1"><Pin className="w-3 h-3"/>Fijada</span>}{viewNota.colegio&&<span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{viewNota.territorio} · {viewNota.colegio}</span>}</div><div className="bg-slate-50 rounded-lg p-4 min-h-[200px] text-sm text-slate-700 whitespace-pre-wrap">{viewNota.contenido||<span className="text-slate-400 italic">Sin contenido</span>}</div><p className="text-xs text-slate-400">Actualizada: {fmtFull(viewNota.updated_at)}</p></div><div className="flex gap-3 mt-4"><button type="button" onClick={()=>setViewNota(null)} className={btnOutline+" flex-1"}>Cerrar</button><button type="button" onClick={()=>{setViewNota(null);openNota(viewNota);}} className={btnPrimary+" flex-1 flex items-center justify-center gap-2"}><Pencil className="w-4 h-4"/>Editar</button></div></Modal>)}

      {/* Form Nota */}
      {showNota&&(<Modal title={editNota?'Editar Nota':'Nueva Nota'} onClose={()=>{setShowNota(false);setEditNota(null);}} wide>
        <div className="space-y-3">
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Título *</label><input className={inputCls} value={notaForm.titulo} onChange={e=>setNotaForm(f=>({...f,titulo:e.target.value}))} placeholder="Título de la nota"/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoría</label><select className={inputCls} value={notaForm.categoria} onChange={e=>setNotaForm(f=>({...f,categoria:e.target.value}))}>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Color</label><div className="flex gap-2 flex-wrap pt-1">{COLORES.map(c=><button type="button" key={c} onClick={()=>setNotaForm(f=>({...f,color:c}))} className={`w-6 h-6 rounded-full border-2 transition ${notaForm.color===c?'border-slate-900 scale-110':'border-transparent'}`} style={{background:c}}/>)}</div></div>
          </div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contenido</label><textarea className={inputCls} rows={7} value={notaForm.contenido} onChange={e=>setNotaForm(f=>({...f,contenido:e.target.value}))} placeholder="Escribe aquí tu nota..."/></div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded" checked={notaForm.fijada} onChange={e=>setNotaForm(f=>({...f,fijada:e.target.checked}))}/><span className="text-sm font-semibold text-slate-700">Fijar nota (aparece primero)</span></label>
          {/* Colegio opcional */}
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded" checked={notaConColegio} onChange={e=>{ setNotaConColegio(e.target.checked); if(!e.target.checked) setNotaForm(f=>({...f,territorio:'',colegio:''})); }}/><span className="text-sm font-semibold text-slate-700">¿Relacionada con un colegio?</span></label>
          {notaConColegio&&(<div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Territorio</label><select className={inputCls} value={notaForm.territorio} onChange={e=>setNotaForm(f=>({...f,territorio:e.target.value,colegio:''}))}><option value="">Selecciona...</option>{TERRITORIOS.map(t=><option key={t}>{t}</option>)}</select></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio</label><select className={inputCls} value={notaForm.colegio} onChange={e=>setNotaForm(f=>({...f,colegio:e.target.value}))} disabled={!notaForm.territorio}><option value="">Selecciona...</option>{getColegiosByTerritorio(notaForm.territorio).map(c=><option key={c}>{c}</option>)}</select></div>
          </div>)}
        </div>
        <div className="flex gap-3 mt-4"><button type="button" onClick={()=>{setShowNota(false);setEditNota(null);}} className={btnOutline+" flex-1"}>Cancelar</button><button type="button" disabled={!notaForm.titulo.trim()||saveNota.isPending} onClick={()=>saveNota.mutate()} className={btnPrimary+" flex-1"}>{saveNota.isPending?'Guardando...':'Guardar'}</button></div>
      </Modal>)}

      {/* Form Pendiente */}
      {showPend&&(<Modal title={editPend?'Editar Pendiente':'Nuevo Pendiente'} onClose={()=>{setShowPend(false);setEditPend(null);}} xl>
        <div className="space-y-3 overflow-y-auto max-h-[65vh] pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Título *</label><input className={inputCls} value={pendForm.titulo} onChange={e=>setPendForm(f=>({...f,titulo:e.target.value}))} placeholder="¿Qué hay que hacer?"/></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo</label><select className={inputCls} value={pendForm.tipo} onChange={e=>setPendForm(f=>({...f,tipo:e.target.value,asignado_a:'',asignado_nombre:''}))}><option value="personal">Personal (solo yo)</option><option value="compartido">Compartido (asignar a usuario)</option></select></div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prioridad</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['baja','normal','alta','urgente'] as const).map(p => {
                  const cfg = PRIO_CFG[p];
                  const selected = pendForm.prioridad === p;
                  return (
                    <button key={p} type="button"
                      onClick={() => setPendForm(f => ({...f, prioridad: p}))}
                      className={`py-2 rounded-lg text-xs font-bold transition border-2 ${selected ? `${cfg.selectorBg} ${cfg.selectorText} border-transparent shadow-md scale-105` : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción</label><textarea className={inputCls} rows={2} value={pendForm.descripcion} onChange={e=>setPendForm(f=>({...f,descripcion:e.target.value}))} placeholder="Detalle opcional..."/></div>

          {/* Vinculación Proyecto */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-bold text-blue-700 uppercase">Vinculación con Proyecto</p>
            <div className="grid grid-cols-2 gap-2">
              <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${!sinProyecto?'border-slate-900 bg-white font-semibold':'border-slate-200 bg-white'}`}>
                <input type="radio" checked={!sinProyecto} onChange={()=>{ setSinProyecto(false); setPendForm(f=>({...f,proyecto_nombre:''})); }} className="shrink-0"/> Proyecto registrado
              </label>
              <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${sinProyecto?'border-slate-900 bg-white font-semibold':'border-slate-200 bg-white'}`}>
                <input type="radio" checked={sinProyecto} onChange={()=>{ setSinProyecto(true); setPendForm(f=>({...f,proyecto_id:'',proyecto_nombre:''})); }} className="shrink-0"/> Sin proyecto registrado
              </label>
            </div>
            {!sinProyecto?(
              <select className={inputCls} value={pendForm.proyecto_id} onChange={e=>{
                const p=(rawProyectos as any[]).find(p=>p.id===e.target.value);
                setPendForm(f=>({...f,proyecto_id:e.target.value,proyecto_nombre:p?.name??'',territorio:p?.territorio??f.territorio,colegio:p?.colegio??f.colegio}));
              }}>
                <option value="">Selecciona un proyecto...</option>
                {(rawProyectos as any[]).map((p:any)=><option key={p.id} value={p.id}>{p.name} — {p.colegio}</option>)}
              </select>
            ):(
              <input className={inputCls} placeholder="Nombre del pendiente / proyecto..." value={pendForm.proyecto_nombre} onChange={e=>setPendForm(f=>({...f,proyecto_nombre:e.target.value}))}/>
            )}
          </div>


          {/* Territorio / Colegio */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Territorio</label>
              <select className={inputCls} value={pendForm.territorio} onChange={e=>setPendForm(f=>({...f,territorio:e.target.value,colegio:'',asignado_a:'',asignado_nombre:''}))}>
                <option value="">Selecciona...</option>{TERRITORIOS.map(t=><option key={t}>{t}</option>)}
              </select></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio</label>
              <select className={inputCls} value={pendForm.colegio} onChange={e=>setPendForm(f=>({...f,colegio:e.target.value,asignado_a:'',asignado_nombre:''}))} disabled={!pendForm.territorio}>
                <option value="">Selecciona...</option>{getColegiosByTerritorio(pendForm.territorio).map(c=><option key={c}>{c}</option>)}
              </select></div>
          </div>

          {/* Usuario asignado — filtrado por colegio/territorio */}
          {pendForm.tipo==='compartido'&&(
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-bold text-teal-700 uppercase">Asignar a usuario *</p>
              <select className={inputCls} value={pendForm.asignado_a} onChange={e=>{
                  const u=todosUsuarios.find(u=>u.user_email===e.target.value);
                  setPendForm(f=>({...f,asignado_a:e.target.value,asignado_nombre:u?.nombre||e.target.value}));
                }}>
                <option value="">Selecciona un usuario...</option>
                {usuariosPorGrupo.colegioUsers.length>0&&(
                  <optgroup label={`— ${pendForm.colegio||pendForm.territorio||'Colegio'} —`}>
                    {usuariosPorGrupo.colegioUsers.map(u=><option key={u.user_email} value={u.user_email}>{u.nombre||u.user_email} — {u.colegio}</option>)}
                  </optgroup>
                )}
                {usuariosPorGrupo.fmaUsers.length>0&&(
                  <optgroup label="— FMA Oficinas —">
                    {usuariosPorGrupo.fmaUsers.map(u=><option key={u.user_email} value={u.user_email}>{u.nombre||u.user_email} — {u.colegio||'FMA'}</option>)}
                  </optgroup>
                )}
              </select>
              {pendForm.asignado_a&&<p className="text-xs text-teal-700 font-semibold">📧 {pendForm.asignado_a}</p>}

              {/* Con conocimiento de — segundo usuario */}
              <div className="border-t border-teal-200 pt-2 mt-1">
                <p className="text-xs font-bold text-teal-600 mb-1">Con conocimiento de <span className="font-normal text-teal-500">(opcional)</span></p>
                <select className={inputCls} value={pendForm.asignado_cc}
                  onChange={e=>{
                    const u=todosUsuarios.find(u=>u.user_email===e.target.value);
                    setPendForm(f=>({...f,asignado_cc:e.target.value,asignado_cc_nombre:u?.nombre||e.target.value}));
                  }}>
                  <option value="">Sin copia...</option>
                  {usuariosPorGrupo.colegioUsers.length>0&&(
                    <optgroup label={`— ${pendForm.colegio||pendForm.territorio||'Colegio'} —`}>
                      {usuariosPorGrupo.colegioUsers.filter(u=>u.user_email!==pendForm.asignado_a).map(u=><option key={u.user_email} value={u.user_email}>{u.nombre||u.user_email} — {u.colegio}</option>)}
                    </optgroup>
                  )}
                  {usuariosPorGrupo.fmaUsers.length>0&&(
                    <optgroup label="— FMA Oficinas —">
                      {usuariosPorGrupo.fmaUsers.filter(u=>u.user_email!==pendForm.asignado_a).map(u=><option key={u.user_email} value={u.user_email}>{u.nombre||u.user_email} — {u.colegio||'FMA'}</option>)}
                    </optgroup>
                  )}
                </select>
                {pendForm.asignado_cc&&<p className="text-xs text-teal-600 mt-1">📧 {pendForm.asignado_cc}</p>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha límite</label><input type="date" className={inputCls} value={pendForm.fecha_limite} onChange={e=>setPendForm(f=>({...f,fecha_limite:e.target.value}))}/></div>
            {editPend&&<div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Estatus</label><select className={inputCls} value={pendForm.estatus} onChange={e=>setPendForm(f=>({...f,estatus:e.target.value}))}><option value="pendiente">Pendiente</option><option value="en_proceso">En Proceso</option><option value="completado">Completado</option></select></div>}
          </div>
        </div>
        <div className="flex gap-3 mt-4"><button type="button" onClick={()=>{setShowPend(false);setEditPend(null);}} className={btnOutline+" flex-1"}>Cancelar</button><button type="button" disabled={!pendForm.titulo.trim()||(pendForm.tipo==='compartido'&&!pendForm.asignado_a)||savePend.isPending} onClick={()=>savePend.mutate()} className={btnPrimary+" flex-1"}>{savePend.isPending?'Guardando...':'Guardar'}</button></div>
      </Modal>)}

      {/* Confirmar eliminación */}
      {confirmDel&&(<Modal title="Confirmar eliminación" onClose={()=>setConfirmDel(null)}><div className="space-y-3"><div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="font-bold text-red-800 text-sm mb-1">¿Eliminar "{confirmDel.titulo}"?</p><p className="text-xs text-red-700">Esta acción no se puede deshacer.</p></div></div><div className="flex gap-3 mt-4"><button type="button" onClick={()=>setConfirmDel(null)} className={btnOutline+" flex-1"}>Cancelar</button><button type="button" disabled={deleteMutation.isPending} onClick={()=>deleteMutation.mutate(confirmDel)} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition">{deleteMutation.isPending?'Eliminando...':'Sí, eliminar'}</button></div></Modal>)}
    </div>
  );
}
