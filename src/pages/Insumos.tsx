import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, Search, Pencil, Trash2, X, CheckCircle2,
  Package, Truck, ClipboardList, ExternalLink, Download,
  ShieldCheck, Clock, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Proveedor   { id: string; nombre: string; contacto: string; correo: string; telefono: string; activo: boolean; notas: string; }
interface Producto    { id: string; codigo: string; nombre: string; descripcion: string; unidad: string; categoria: string; precio_referencia: number; activo: boolean; }
interface ReqItem     { id?: string; producto_id?: string; nombre_producto: string; descripcion: string; unidad: string; cantidad: number; precio_referencia?: number; precio_cotizado?: number | null; observaciones?: string; }
interface Requisicion { id: string; folio: string; proveedores_ids: string[]; proveedores_nombres: string[]; estatus: string; link_cotizacion: string; vobo_por: string; vobo_fecha: string | null; notas: string; total_cotizado: number; created_at: string; items?: ReqItem[];
  // Nuevos campos
  fecha_requerida?: string; prioridad?: string; justificacion?: string; departamento?: string; }

const UNIDADES = ['pieza', 'litro', 'kg', 'rollo', 'caja', 'bolsa', 'galón', 'frasco', 'paquete', 'par', 'metro', 'juego'];
const CATEGORIAS_PROD = ['Limpieza', 'Sanitario', 'Cocina', 'Papelería', 'Herramienta', 'General'];
const fmtMXN = (n: number | null | undefined) => (n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fmtDate = (d?: string | null) => d ? format(new Date(d), "d MMM yyyy", { locale: es }) : '—';

const ESTATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pendiente_cotizacion: { label: 'Pendiente Cotización', color: 'bg-amber-100 text-amber-700 border-amber-200',   icon: <Clock className="w-3 h-3" /> },
  cotizacion_recibida:  { label: 'Cotización Recibida',  color: 'bg-blue-100 text-blue-700 border-blue-200',      icon: <ClipboardList className="w-3 h-3" /> },
  en_autorizacion:      { label: 'En Autorización',      color: 'bg-orange-100 text-orange-700 border-orange-200',icon: <AlertCircle className="w-3 h-3" /> },
  autorizado:           { label: 'VoBo Autorizado',      color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  surtido:              { label: 'Surtido',              color: 'bg-slate-100 text-slate-600 border-slate-200',   icon: <Package className="w-3 h-3" /> },
  cancelado:            { label: 'Cancelado',            color: 'bg-red-100 text-red-600 border-red-200',         icon: <X className="w-3 h-3" /> },
};

function StatusBadge({ estatus }: { estatus: string }) {
  const cfg = ESTATUS_CFG[estatus] ?? ESTATUS_CFG.pendiente_cotizacion;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

const inputCls = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";
const btnPrimary = "px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 transition";
const btnOutline = "px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition";

// ─── Generar folio ─────────────────────────────────────────────────────────────
async function generarFolio(): Promise<string> {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('insumos_requisiciones')
    .select('folio')
    .like('folio', `REQ-${year}-%`)
    .order('folio', { ascending: false })
    .limit(1);
  const last = data?.[0]?.folio;
  const next = last ? parseInt(last.split('-')[2] ?? '0') + 1 : 1;
  return `REQ-${year}-${String(next).padStart(3, '0')}`;
}

// ─── PDF de requisición — mismo estilo que Reporte General ──────────────────
async function generarPDFRequisicion(req: Requisicion, items: ReqItem[], autorizado = false) {
  let JsPDF = (window as any).jspdf?.jsPDF;
  if (!JsPDF) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = () => res(); s.onerror = () => rej(new Error('No se pudo cargar jsPDF'));
      document.head.appendChild(s);
    }).catch(() => null);
    JsPDF = (window as any).jspdf?.jsPDF;
  }
  if (!JsPDF) { toast.error('No se pudo cargar el generador de PDF'); return; }

  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; let y = 0;
  const now     = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
  const nowFull = format(new Date(), "d 'de' MMMM 'de' yyyy, HH:mm 'hrs'", { locale: es });

  // ── HEADER — mismo estilo que Reporte General ─────────────────────────
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 35, 'F');
  doc.setFillColor(13, 138, 126); doc.rect(0, 0, 4, 35, 'F');
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('Requisición de Insumos', 14, 14);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 200);
  doc.text('Sistema RCMA  ·  FMA Oficina Monterrey  ·  Generado el ' + now, 14, 22);
  doc.setFontSize(8); doc.setTextColor(100, 116, 139);
  doc.text('Documento confidencial — solo para uso interno', 14, 29);

  // Folio badge
  doc.setFillColor(13, 138, 126); doc.roundedRect(W - 52, 6, 38, 10, 2, 2, 'F');
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(req.folio, W - 33, 13, { align: 'center' });
  if (autorizado && req.vobo_por) {
    doc.setFillColor(22, 163, 74); doc.roundedRect(W - 52, 18, 38, 10, 2, 2, 'F');
    doc.setFontSize(7.5); doc.text('AUTORIZADO', W - 33, 25, { align: 'center' });
  }

  // Logo
  try {
    const logoImg = await new Promise<string>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d')!.drawImage(img, 0, 0); res(cv.toDataURL('image/png')); };
      img.onerror = rej; img.src = '/logo.png';
    });
    doc.addImage(logoImg, 'PNG', W - 38, 2, 24, 24);
  } catch { /* sin logo */ }
  y = 44;

  // ── DATOS GENERALES ───────────────────────────────────────────────────
  doc.setFillColor(241, 245, 249); doc.rect(12, y, W - 24, 30, 'F');
  doc.setDrawColor(220, 220, 230); doc.setLineWidth(0.3); doc.rect(12, y, W - 24, 30, 'D');

  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
  doc.text('PROVEEDOR(ES)', 16, y + 5);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text((req.proveedores_nombres ?? []).join(', ') || '—', 16, y + 11);

  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
  doc.text('ESTATUS', 115, y + 5);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text(ESTATUS_CFG[req.estatus]?.label ?? req.estatus, 115, y + 11);

  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
  doc.text('ELABORÓ / SOLICITÓ', 16, y + 18);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Ricardo Joanathan Reyes Medina', 16, y + 24);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
  doc.text('Coordinador de Obras y Mantenimiento RCMA', 16, y + 29);
  doc.setLineWidth(0.2);
  y += 38;

  if (req.notas) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(80, 80, 80);
    doc.text('Notas: ' + req.notas, 14, y); y += 8;
  }

  // ── TABLA DE PRODUCTOS ────────────────────────────────────────────────
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Detalle de Productos', 14, y); y += 4;
  doc.setDrawColor(220, 220, 220); doc.line(14, y, W - 14, y); y += 5;

  const drawTableHeader = () => {
    doc.setFillColor(15, 23, 42); doc.rect(12, y - 4, W - 24, 9, 'F');
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('Producto', 16, y + 1);
    doc.text('Unidad',   102, y + 1);
    doc.text('Cant.',    124, y + 1);
    if (autorizado) {
      doc.text('P. Unit.',  146, y + 1);
      doc.text('Subtotal',  W - 16, y + 1, { align: 'right' });
    }
    y += 10;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  };
  drawTableHeader();

  let totalCalc = 0;
  items.forEach((it, i) => {
    if (y > 252) { doc.addPage(); y = 20; drawTableHeader(); }
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(12, y - 5, W - 24, 9, 'F'); }
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    const nom = String(it.nombre_producto ?? '');
    doc.text(nom.length > 44 ? nom.slice(0, 42) + '…' : nom, 16, y);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
    doc.text(String(it.unidad ?? ''), 102, y);
    doc.text(String(it.cantidad ?? ''), 126, y, { align: 'center' });
    if (autorizado) {
      const precio = it.precio_cotizado ?? 0;
      const sub    = precio * it.cantidad;
      totalCalc   += sub;
      doc.text(precio ? fmtMXN(precio) : '—', 152, y, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(precio ? fmtMXN(sub) : '—', W - 16, y, { align: 'right' });
    }
    y += 8.5;
  });

  if (autorizado) {
    y += 2;
    doc.setFillColor(15, 23, 42); doc.rect(135, y - 3, W - 147, 11, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('TOTAL', 139, y + 4);
    doc.text(fmtMXN(req.total_cotizado || totalCalc), W - 16, y + 4, { align: 'right' });
    y += 18;
  } else { y += 10; }

  // ── BLOQUE DE FIRMAS ──────────────────────────────────────────────────
  if (y > 228) { doc.addPage(); y = 20; }
  doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.4);
  doc.line(14, y, W - 14, y); y += 10;

  const sigW = (W - 28 - 12) / 2;

  // Firma solicitante
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
  doc.text('ELABORÓ Y SOLICITÓ', 14, y);
  y += 14;
  doc.setDrawColor(60, 60, 60); doc.line(14, y, 14 + sigW, y);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Ricardo Joanathan Reyes Medina', 14, y + 5);
  doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
  doc.text('Coordinador de Obras y Mantenimiento', 14, y + 11);
  doc.text('Red de Colegios Mano Amiga', 14, y + 16);
  doc.setFontSize(7); doc.setTextColor(120, 120, 120);
  doc.text('Fecha: ' + nowFull, 14, y + 22);

  // VoBo
  const xR = 14 + sigW + 12;
  doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
  doc.text('AUTORIZÓ — VoBo', xR, y - 14);
  if (autorizado && req.vobo_por) {
    doc.setDrawColor(22, 163, 74); doc.line(xR, y, xR + sigW, y);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 163, 74);
    doc.text(req.vobo_por, xR, y + 5);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('Visto Bueno Otorgado', xR, y + 11);
    doc.setFontSize(7); doc.setTextColor(120, 120, 120);
    doc.text('Fecha VoBo: ' + fmtDate(req.vobo_fecha), xR, y + 17);
    doc.setFillColor(240, 253, 244); doc.setDrawColor(22, 163, 74);
    doc.roundedRect(xR, y + 20, sigW, 9, 2, 2, 'FD');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 163, 74);
    doc.text('VISTO BUENO AUTORIZADO', xR + sigW / 2, y + 26, { align: 'center' });
  } else {
    doc.setDrawColor(180, 180, 180); doc.line(xR, y, xR + sigW, y);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 160, 160);
    doc.text('Pendiente de autorización', xR, y + 6);
  }
  doc.setLineWidth(0.2);

  // ── FOOTER en todas las páginas — mismo estilo que Reporte General ───
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(15, 23, 42); doc.rect(0, 286, W, 11, 'F');
    doc.setFillColor(13, 138, 126); doc.rect(0, 286, 4, 11, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 160, 180);
    doc.text('Sistema RCMA  ·  FMA Oficina Monterrey  ·  Documento confidencial', 10, 292);
    doc.text('Pág. ' + i + ' de ' + pages, W - 14, 292, { align: 'right' });
  }
  doc.save(req.folio + (autorizado ? '-AUTORIZADO' : '-BORRADOR') + '.pdf');
}
// ─── Componente principal ──────────────────────────────────────────────────────
export default function Insumos() {
  const { user } = useAuth();
  const { isAdmin, can } = usePermissions();
  const qc = useQueryClient();

  const puedeVoBo = isAdmin || can('vobo_insumos');

  const [tab, setTab]         = useState<'requisiciones' | 'productos' | 'proveedores'>('requisiciones');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [showReqForm,   setShowReqForm]   = useState(false);
  const [showProdForm,  setShowProdForm]  = useState(false);
  const [showProvForm,  setShowProvForm]  = useState(false);
  const [editingReq,    setEditingReq]    = useState<Requisicion | null>(null);
  const [editingProd,   setEditingProd]   = useState<Producto | null>(null);
  const [editingProv,   setEditingProv]   = useState<Proveedor | null>(null);
  const [voboModal,     setVoboModal]     = useState<Requisicion | null>(null);
  const [pricingModal,  setPricingModal]  = useState<Requisicion | null>(null);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: requisiciones = [], isLoading: loadReq } = useQuery({
    queryKey: ['insumos_requisiciones'],
    queryFn: async () => {
      const { data } = await supabase.from('insumos_requisiciones').select('*').order('created_at', { ascending: false });
      return (data ?? []) as Requisicion[];
    },
  });

  const { data: productos = [] } = useQuery({
    queryKey: ['insumos_productos'],
    queryFn: async () => {
      const { data } = await supabase.from('insumos_productos').select('*').order('nombre');
      return (data ?? []) as Producto[];
    },
  });

  const { data: proveedores = [] } = useQuery({
    queryKey: ['insumos_proveedores'],
    queryFn: async () => {
      const { data } = await supabase.from('insumos_proveedores').select('*').order('nombre');
      return (data ?? []) as Proveedor[];
    },
  });

  const getItems = async (reqId: string) => {
    const { data } = await supabase.from('insumos_items').select('*').eq('requisicion_id', reqId).order('created_at');
    return (data ?? []) as ReqItem[];
  };

  // ── Formulario Requisición ────────────────────────────────────────────────
  const [reqItems, setReqItems]             = useState<ReqItem[]>([]);
  const [selProveedores, setSelProveedores] = useState<string[]>([]);
  const [reqNotas, setReqNotas]             = useState('');
  const [reqFechaReq, setReqFechaReq]       = useState('');
  const [reqPrioridad, setReqPrioridad]     = useState('Normal');
  const [reqJustif, setReqJustif]           = useState('');

  const addReqItem = () => setReqItems(prev => [...prev, { nombre_producto: '', descripcion: '', unidad: 'pieza', cantidad: 1 }]);
  const removeReqItem = (i: number) => setReqItems(prev => prev.filter((_, idx) => idx !== i));
  const setReqItem = (i: number, field: keyof ReqItem, val: any) =>
    setReqItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const fillFromProduct = (i: number, prod: Producto) =>
    setReqItems(prev => prev.map((it, idx) => idx === i ? { ...it, nombre_producto: prod.nombre, unidad: prod.unidad, precio_referencia: prod.precio_referencia, producto_id: prod.id } : it));

  const createReqMutation = useMutation({
    mutationFn: async () => {
      if (!reqJustif.trim())   { toast.error('Ingresa la justificación de la compra'); throw new Error('Falta justificación'); }
      if (!reqFechaReq)        { toast.error('Selecciona la fecha requerida de entrega'); throw new Error('Falta fecha'); }
      if (reqItems.filter(it => it.nombre_producto).length === 0) { toast.error('Agrega al menos un producto'); throw new Error('Sin productos'); }
      const folio = await generarFolio();
      const provNombres = selProveedores.map(id => proveedores.find(p => p.id === id)?.nombre ?? id);
      const { data: req, error } = await supabase.from('insumos_requisiciones').insert({
        folio, proveedores_ids: selProveedores, proveedores_nombres: provNombres,
        estatus: 'pendiente_cotizacion', notas: reqNotas, created_by: user?.email ?? '',
        fecha_requerida: reqFechaReq || null,
        prioridad: reqPrioridad,
        justificacion: reqJustif,
        departamento: 'Coordinación de Obras y Mantenimiento — FMA Oficina Monterrey',
      }).select().single();
      if (error) throw error;
      if (reqItems.length > 0) {
        await supabase.from('insumos_items').insert(
          reqItems.filter(it => it.nombre_producto).map(it => ({ ...it, requisicion_id: req.id }))
        );
      }
      return req;
    },
    onSuccess: (req) => {
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      toast.success(`Requisición ${req.folio} creada`);
      setShowReqForm(false); setReqItems([]); setSelProveedores([]); setReqNotas('');
      setReqFechaReq(''); setReqPrioridad('Normal'); setReqJustif('');
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al crear'),
  });

  // ── Capturar precios de cotización ────────────────────────────────────────
  const [pricingItems, setPricingItems] = useState<ReqItem[]>([]);
  const [linkCotizacion, setLinkCotizacion] = useState('');

  const openPricing = async (req: Requisicion) => {
    const items = await getItems(req.id);
    setPricingItems(items);
    setLinkCotizacion(req.link_cotizacion ?? '');
    setPricingModal(req);
  };

  const savePricingMutation = useMutation({
    mutationFn: async ({ req, items, link }: { req: Requisicion; items: ReqItem[]; link: string }) => {
      const total = items.reduce((s, it) => s + ((it.precio_cotizado ?? 0) * it.cantidad), 0);
      await supabase.from('insumos_requisiciones').update({
        estatus: 'cotizacion_recibida', link_cotizacion: link, total_cotizado: total, updated_at: new Date().toISOString(),
      }).eq('id', req.id);
      for (const it of items) {
        if (it.id) await supabase.from('insumos_items').update({ precio_cotizado: it.precio_cotizado }).eq('id', it.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      toast.success('Cotización registrada'); setPricingModal(null);
    },
    onError: (e: any) => toast.error(e.message ?? 'Error'),
  });

  // ── Solicitar VoBo ────────────────────────────────────────────────────────
  const solicitarVoBo = useMutation({
    mutationFn: async (req: Requisicion) => {
      const items = await getItems(req.id);
      await supabase.from('insumos_requisiciones').update({
        estatus: 'en_autorizacion', updated_at: new Date().toISOString(),
      }).eq('id', req.id);
      await supabase.functions.invoke('notify-vobo-insumos', {
        body: {
          folio: req.folio,
          proveedores: req.proveedores_nombres,
          items, total: req.total_cotizado,
          notas: req.notas,
          link_cotizacion: req.link_cotizacion,
          siteUrl: window.location.origin,
          solicitante: user?.email ?? 'Coordinación de Obras',
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      toast.success('Solicitud de VoBo enviada por correo');
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al enviar'),
  });

  // ── Dar VoBo ──────────────────────────────────────────────────────────────
  const darVoBo = useMutation({
    mutationFn: async (req: Requisicion) => {
      const nombre = user?.user_metadata?.nombre || user?.email || 'Usuario';
      await supabase.from('insumos_requisiciones').update({
        estatus: 'autorizado', vobo_por: nombre,
        vobo_fecha: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', req.id);
      // Notificar al admin
      await supabase.functions.invoke('notify-vobo-insumos', {
        body: { folio: req.folio, proveedores: req.proveedores_nombres, items: [], total: req.total_cotizado, notas: `VoBo otorgado por ${nombre}`, link_cotizacion: '', siteUrl: window.location.origin, solicitante: nombre },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      toast.success('VoBo registrado correctamente'); setVoboModal(null);
    },
    onError: (e: any) => toast.error(e.message ?? 'Error'),
  });

  // ── CRUD Productos ────────────────────────────────────────────────────────
  const [prodForm, setProdForm] = useState({ codigo:'', nombre:'', descripcion:'', unidad:'pieza', categoria:'Limpieza', precio_referencia:'' });
  const saveProd = useMutation({
    mutationFn: async () => {
      const data = { ...prodForm, precio_referencia: parseFloat(prodForm.precio_referencia) || 0, updated_at: new Date().toISOString() };
      if (editingProd) { await supabase.from('insumos_productos').update(data).eq('id', editingProd.id); }
      else             { await supabase.from('insumos_productos').insert(data); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insumos_productos'] }); toast.success('Producto guardado'); setShowProdForm(false); setEditingProd(null); },
    onError: (e: any) => toast.error(e.message ?? 'Error'),
  });

  // ── CRUD Proveedores ──────────────────────────────────────────────────────
  const [provForm, setProvForm] = useState({ nombre:'', contacto:'', correo:'', telefono:'', notas:'' });
  const saveProv = useMutation({
    mutationFn: async () => {
      if (editingProv) { await supabase.from('insumos_proveedores').update(provForm).eq('id', editingProv.id); }
      else             { await supabase.from('insumos_proveedores').insert({ ...provForm, activo: true }); }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['insumos_proveedores'] }); toast.success('Proveedor guardado'); setShowProvForm(false); setEditingProv(null); },
    onError: (e: any) => toast.error(e.message ?? 'Error'),
  });

  const [confirmDel, setConfirmDel] = useState<Requisicion | null>(null);

  const deleteReqMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('insumos_items').delete().eq('requisicion_id', id);
      const { error } = await supabase.from('insumos_requisiciones').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      toast.success('Requisición eliminada');
      setConfirmDel(null);
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al eliminar'),
  });

  const filteredReq = useMemo(() => requisiciones.filter(r =>
    !search || r.folio.toLowerCase().includes(search.toLowerCase()) ||
    (r.proveedores_nombres ?? []).some(p => p.toLowerCase().includes(search.toLowerCase()))
  ), [requisiciones, search]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6" /> Insumos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Gestión de suministros · FMA Oficina Monterrey</p>
        </div>
        {isAdmin && tab === 'requisiciones' && (
          <button onClick={() => { setReqItems([]); setSelProveedores([]); setReqNotas(''); setShowReqForm(true); }}
            className={btnPrimary + " flex items-center gap-2"}>
            <Plus className="w-4 h-4" /> Nueva Requisición
          </button>
        )}
        {isAdmin && tab === 'productos' && (
          <button onClick={() => { setProdForm({ codigo:'', nombre:'', descripcion:'', unidad:'pieza', categoria:'Limpieza', precio_referencia:'' }); setEditingProd(null); setShowProdForm(true); }}
            className={btnPrimary + " flex items-center gap-2"}>
            <Plus className="w-4 h-4" /> Nuevo Producto
          </button>
        )}
        {isAdmin && tab === 'proveedores' && (
          <button onClick={() => { setProvForm({ nombre:'', contacto:'', correo:'', telefono:'', notas:'' }); setEditingProv(null); setShowProvForm(true); }}
            className={btnPrimary + " flex items-center gap-2"}>
            <Plus className="w-4 h-4" /> Nuevo Proveedor
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {[
          { id: 'requisiciones', label: 'Requisiciones', icon: <ClipboardList className="w-4 h-4" /> },
          { id: 'productos',     label: 'Catálogo',      icon: <Package className="w-4 h-4" /> },
          { id: 'proveedores',   label: 'Proveedores',   icon: <Truck className="w-4 h-4" /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-all ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.icon} {t.label}
            {t.id === 'requisiciones' && <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'requisiciones' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>{requisiciones.length}</span>}
          </button>
        ))}
      </div>

      {/* Buscador */}
      {tab === 'requisiciones' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-full max-w-sm focus:ring-2 focus:ring-slate-900 focus:outline-none"
            placeholder="Buscar por folio o proveedor..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {/* ── Tab: Requisiciones ───────────────────────────────────────────── */}
      {tab === 'requisiciones' && (
        <div className="space-y-3">
          {loadReq && <p className="text-sm text-slate-400 text-center py-8">Cargando...</p>}
          {!loadReq && filteredReq.length === 0 && (
            <div className="text-center py-12">
              <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-500">Sin requisiciones aún</p>
            </div>
          )}
          {filteredReq.map(req => {
            const isOpen = expanded === req.id;
            return (
              <div key={req.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-900">{req.folio}</span>
                      <StatusBadge estatus={req.estatus} />
                      {req.prioridad === 'Urgente' && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">🔴 Urgente</span>
                      )}
                      {req.total_cotizado > 0 && (
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{fmtMXN(req.total_cotizado)}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {(req.proveedores_nombres ?? []).join(', ') || 'Sin proveedor'} · {fmtDate(req.created_at)}
                      {req.fecha_requerida && <span className="text-amber-600 font-semibold"> · Entrega: {fmtDate(req.fecha_requerida)}</span>}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Capturar cotización */}
                    {isAdmin && req.estatus === 'pendiente_cotizacion' && (
                      <button onClick={() => openPricing(req)}
                        className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                        + Cotización
                      </button>
                    )}
                    {/* Solicitar VoBo */}
                    {isAdmin && req.estatus === 'cotizacion_recibida' && (
                      <button onClick={() => solicitarVoBo.mutate(req)} disabled={solicitarVoBo.isPending}
                        className="px-3 py-1.5 text-xs font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition">
                        Solicitar VoBo
                      </button>
                    )}
                    {/* Dar VoBo */}
                    {puedeVoBo && req.estatus === 'en_autorizacion' && (
                      <button onClick={() => setVoboModal(req)}
                        className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> VoBo
                      </button>
                    )}
                    {/* Marcar surtido */}
                    {isAdmin && req.estatus === 'autorizado' && (
                      <button onClick={async () => {
                        await supabase.from('insumos_requisiciones').update({ estatus: 'surtido', updated_at: new Date().toISOString() }).eq('id', req.id);
                        qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
                        toast.success('Marcado como surtido');
                      }} className="px-3 py-1.5 text-xs font-bold bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition">
                        Marcar Surtido
                      </button>
                    )}
                    {/* Descargar PDF */}
                    <button type="button" onClick={async () => {
                      const items = await getItems(req.id);
                      generarPDFRequisicion(req, items, req.estatus === 'autorizado' || req.estatus === 'surtido');
                    }} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition" title="Descargar PDF">
                      <Download className="w-4 h-4" />
                    </button>
                    {/* Eliminar — solo admin */}
                    {isAdmin && (
                      <button type="button" onClick={() => setConfirmDel(req)}
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Eliminar requisición">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {/* Expandir */}
                    <button onClick={() => setExpanded(isOpen ? null : req.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Detalle expandido */}
                {isOpen && (
                  <ReqDetail reqId={req.id} req={req} getItems={getItems} openPricing={openPricing} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tab: Catálogo Productos ──────────────────────────────────────── */}
      {tab === 'productos' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Código','Nombre','Unidad','Categoría','Precio Ref.',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productos.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-sm text-slate-400">Sin productos registrados</td></tr>
              )}
              {productos.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-500">{p.codigo || '—'}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800">{p.nombre}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{p.unidad}</td>
                  <td className="px-4 py-3"><span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{p.categoria}</span></td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">{fmtMXN(p.precio_referencia)}</td>
                  <td className="px-4 py-3">
                    {isAdmin && (
                      <button onClick={() => { setProdForm({ codigo:p.codigo, nombre:p.nombre, descripcion:p.descripcion, unidad:p.unidad, categoria:p.categoria, precio_referencia:String(p.precio_referencia) }); setEditingProd(p); setShowProdForm(true); }}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded"><Pencil className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tab: Proveedores ─────────────────────────────────────────────── */}
      {tab === 'proveedores' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {proveedores.length === 0 && (
            <div className="col-span-3 text-center py-10 text-sm text-slate-400">Sin proveedores registrados</div>
          )}
          {proveedores.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-teal-600" />
                  <span className="font-bold text-slate-800 text-sm">{p.nombre}</span>
                </div>
                {isAdmin && (
                  <button onClick={() => { setProvForm({ nombre:p.nombre, contacto:p.contacto, correo:p.correo, telefono:p.telefono, notas:p.notas }); setEditingProv(p); setShowProvForm(true); }}
                    className="p-1 text-slate-400 hover:text-slate-700 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                )}
              </div>
              {p.contacto && <p className="text-xs text-slate-600">{p.contacto}</p>}
              {p.correo   && <p className="text-xs text-slate-500">{p.correo}</p>}
              {p.telefono && <p className="text-xs text-slate-500">{p.telefono}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ════ MODALES ════════════════════════════════════════════════════════ */}

      {/* Modal: Confirmar eliminación */}
      {confirmDel && (
        <Modal title="Eliminar Requisición" onClose={() => setConfirmDel(null)}>
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="font-bold text-red-800 text-sm mb-1">¿Eliminar {confirmDel.folio}?</p>
              <p className="text-xs text-red-700">
                Esta acción no se puede deshacer. Se eliminarán la requisición y todos sus ítems.
              </p>
            </div>
            <p className="text-xs text-slate-500">
              Proveedor: {(confirmDel.proveedores_nombres ?? []).join(', ') || '—'} · Estatus: {ESTATUS_CFG[confirmDel.estatus]?.label}
            </p>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="button" onClick={() => setConfirmDel(null)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button type="button" disabled={deleteReqMutation.isPending}
              onClick={() => deleteReqMutation.mutate(confirmDel.id)}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition">
              {deleteReqMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Nueva Requisición */}
      {showReqForm && (
        <Modal title="Nueva Requisición de Insumos" onClose={() => setShowReqForm(false)} wide>
          <div className="space-y-4 overflow-y-auto max-h-[60vh] p-1">
            {/* Prioridad y Fecha requerida */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prioridad *</label>
                <select className={inputCls} value={reqPrioridad} onChange={e => setReqPrioridad(e.target.value)}>
                  <option value="Normal">Normal</option>
                  <option value="Urgente">🔴 Urgente</option>
                  <option value="Programada">Programada</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha requerida de entrega *</label>
                <input type="date" className={inputCls} value={reqFechaReq} onChange={e => setReqFechaReq(e.target.value)} />
              </div>
            </div>

            {/* Justificación */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Justificación / Motivo de la compra *</label>
              <textarea className={inputCls} rows={2} value={reqJustif}
                onChange={e => setReqJustif(e.target.value)}
                placeholder="Ej: Reposición de stock agotado para limpieza mensual de oficinas..." />
            </div>

            {/* Departamento — fijo, informativo */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Departamento:</span>
              <span className="text-xs text-slate-700">Coordinación de Obras y Mantenimiento — FMA Oficina Monterrey</span>
            </div>

            {/* Proveedores */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Proveedor(es) *</label>
              <div className="flex flex-wrap gap-2">
                {proveedores.map(p => (
                  <label key={p.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition text-sm ${selProveedores.includes(p.id) ? 'border-teal-500 bg-teal-50 text-teal-800 font-semibold' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="checkbox" className="rounded" checked={selProveedores.includes(p.id)}
                      onChange={e => setSelProveedores(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))} />
                    {p.nombre}
                  </label>
                ))}
                {proveedores.length === 0 && <p className="text-xs text-slate-400">Primero agrega proveedores en la pestaña Proveedores</p>}
              </div>
            </div>

            {/* Ítems */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Productos</label>
                <button onClick={addReqItem} className="text-xs font-bold text-teal-600 hover:text-teal-800 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Agregar producto
                </button>
              </div>
              {reqItems.length === 0 && <p className="text-xs text-slate-400 text-center py-3">Da clic en "Agregar producto" para empezar</p>}
              <div className="space-y-2">
                {reqItems.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="col-span-4">
                      <label className="text-[10px] text-slate-400 mb-0.5 block">Producto</label>
                      <input list={`prods-${i}`} className={inputCls} placeholder="Nombre del producto"
                        value={it.nombre_producto}
                        onChange={e => {
                          setReqItem(i, 'nombre_producto', e.target.value);
                          const found = productos.find(p => p.nombre === e.target.value);
                          if (found) fillFromProduct(i, found);
                        }} />
                      <datalist id={`prods-${i}`}>
                        {productos.map(p => <option key={p.id} value={p.nombre} />)}
                      </datalist>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] text-slate-400 mb-0.5 block">Unidad</label>
                      <select className={inputCls} value={it.unidad} onChange={e => setReqItem(i, 'unidad', e.target.value)}>
                        {UNIDADES.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <label className="text-[10px] text-slate-400 mb-0.5 block">Cant.</label>
                      <input type="number" min="1" className={inputCls} value={it.cantidad}
                        onChange={e => setReqItem(i, 'cantidad', parseFloat(e.target.value) || 1)} />
                    </div>
                    <div className="col-span-4">
                      <label className="text-[10px] text-slate-400 mb-0.5 block">Observaciones / Especificaciones</label>
                      <input className={inputCls} placeholder="Marca sugerida, presentación, etc."
                        value={it.observaciones ?? ''}
                        onChange={e => setReqItem(i, 'observaciones', e.target.value)} />
                    </div>
                    <div className="col-span-1 flex items-end pb-0.5">
                      <button type="button" onClick={() => removeReqItem(i)} className="p-1.5 text-red-400 hover:text-red-600 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas</label>
              <textarea className={inputCls} rows={2} value={reqNotas} onChange={e => setReqNotas(e.target.value)} placeholder="Observaciones opcionales..." />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setShowReqForm(false)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button disabled={reqItems.filter(it => it.nombre_producto).length === 0 || createReqMutation.isPending}
              onClick={() => createReqMutation.mutate()} className={btnPrimary + " flex-1"}>
              {createReqMutation.isPending ? 'Creando...' : 'Crear Requisición'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Capturar precios de cotización */}
      {pricingModal && (
        <Modal title={`Registrar Cotización — ${pricingModal.folio}`} onClose={() => setPricingModal(null)} wide>
          <div className="space-y-4 overflow-y-auto max-h-[55vh] p-1">
            {/* Link OneDrive */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Link cotización del proveedor (OneDrive/Drive)</label>
              <div className="flex gap-2">
                <input className={inputCls} placeholder="https://..." value={linkCotizacion} onChange={e => setLinkCotizacion(e.target.value)} />
                {linkCotizacion && <a href={linkCotizacion} target="_blank" rel="noreferrer" className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"><ExternalLink className="w-4 h-4" /></a>}
              </div>
            </div>
            {/* Precios por ítem */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Precios de la cotización</label>
              <div className="space-y-2">
                {pricingItems.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="col-span-5 text-sm font-semibold text-slate-800">{it.nombre_producto}</div>
                    <div className="col-span-2 text-xs text-slate-500">{it.cantidad} {it.unidad}</div>
                    <div className="col-span-4">
                      <input type="number" min="0" step="0.01" className={inputCls} placeholder="Precio unitario"
                        value={it.precio_cotizado ?? ''}
                        onChange={e => setPricingItems(prev => prev.map((p, idx) => idx === i ? { ...p, precio_cotizado: parseFloat(e.target.value) || null } : p))} />
                    </div>
                    <div className="col-span-1 text-xs text-slate-500 text-right">
                      {it.precio_cotizado ? fmtMXN(it.precio_cotizado * it.cantidad) : '—'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subtotal:</span>
                  <span className="font-semibold">{fmtMXN(pricingItems.reduce((s, it) => s + ((it.precio_cotizado ?? 0) * it.cantidad), 0))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">IVA (16%):</span>
                  <span className="font-semibold">{fmtMXN(pricingItems.reduce((s, it) => s + ((it.precio_cotizado ?? 0) * it.cantidad), 0) * 0.16)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-slate-300 pt-1">
                  <span className="font-black text-slate-800">Total con IVA:</span>
                  <span className="font-black text-slate-900">{fmtMXN(pricingItems.reduce((s, it) => s + ((it.precio_cotizado ?? 0) * it.cantidad), 0) * 1.16)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setPricingModal(null)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button disabled={savePricingMutation.isPending}
              onClick={() => savePricingMutation.mutate({ req: pricingModal, items: pricingItems, link: linkCotizacion })}
              className={btnPrimary + " flex-1"}>
              {savePricingMutation.isPending ? 'Guardando...' : 'Guardar Cotización'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: VoBo */}
      {voboModal && (
        <Modal title="Autorizar VoBo" onClose={() => setVoboModal(null)}>
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="font-bold text-emerald-800 text-sm mb-1">¿Confirmas el VoBo para {voboModal.folio}?</p>
              <p className="text-xs text-emerald-700">
                Total: <strong>{fmtMXN(voboModal.total_cotizado)}</strong> · Proveedor: {(voboModal.proveedores_nombres ?? []).join(', ')}
              </p>
            </div>
            {voboModal.link_cotizacion && (
              <a href={voboModal.link_cotizacion} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <ExternalLink className="w-4 h-4" /> Ver cotización del proveedor
              </a>
            )}
            <p className="text-xs text-slate-500">Tu nombre y la fecha/hora quedarán registrados como el autorizador.</p>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setVoboModal(null)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button disabled={darVoBo.isPending} onClick={() => darVoBo.mutate(voboModal)}
              className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40 transition flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              {darVoBo.isPending ? 'Registrando...' : 'Confirmar VoBo'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Nuevo/Editar Producto */}
      {showProdForm && (
        <Modal title={editingProd ? 'Editar Producto' : 'Nuevo Producto'} onClose={() => { setShowProdForm(false); setEditingProd(null); }}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Código</label><input className={inputCls} value={prodForm.codigo} onChange={e => setProdForm(f => ({ ...f, codigo: e.target.value }))} /></div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre *</label><input className={inputCls} value={prodForm.nombre} onChange={e => setProdForm(f => ({ ...f, nombre: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unidad</label>
                <select className={inputCls} value={prodForm.unidad} onChange={e => setProdForm(f => ({ ...f, unidad: e.target.value }))}>
                  {UNIDADES.map(u => <option key={u}>{u}</option>)}</select>
              </div>
              <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoría</label>
                <select className={inputCls} value={prodForm.categoria} onChange={e => setProdForm(f => ({ ...f, categoria: e.target.value }))}>
                  {CATEGORIAS_PROD.map(c => <option key={c}>{c}</option>)}</select>
              </div>
            </div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Precio de Referencia (orientativo)</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={prodForm.precio_referencia} onChange={e => setProdForm(f => ({ ...f, precio_referencia: e.target.value }))} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción</label>
              <textarea className={inputCls} rows={2} value={prodForm.descripcion} onChange={e => setProdForm(f => ({ ...f, descripcion: e.target.value }))} /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setShowProdForm(false); setEditingProd(null); }} className={btnOutline + " flex-1"}>Cancelar</button>
            <button disabled={!prodForm.nombre || saveProd.isPending} onClick={() => saveProd.mutate()} className={btnPrimary + " flex-1"}>
              {saveProd.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Nuevo/Editar Proveedor */}
      {showProvForm && (
        <Modal title={editingProv ? 'Editar Proveedor' : 'Nuevo Proveedor'} onClose={() => { setShowProvForm(false); setEditingProv(null); }}>
          <div className="space-y-3">
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre *</label><input className={inputCls} value={provForm.nombre} onChange={e => setProvForm(f => ({ ...f, nombre: e.target.value }))} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contacto</label><input className={inputCls} value={provForm.contacto} onChange={e => setProvForm(f => ({ ...f, contacto: e.target.value }))} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Correo</label><input type="email" className={inputCls} value={provForm.correo} onChange={e => setProvForm(f => ({ ...f, correo: e.target.value }))} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Teléfono</label><input className={inputCls} value={provForm.telefono} onChange={e => setProvForm(f => ({ ...f, telefono: e.target.value }))} /></div>
            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Notas</label><textarea className={inputCls} rows={2} value={provForm.notas} onChange={e => setProvForm(f => ({ ...f, notas: e.target.value }))} /></div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => { setShowProvForm(false); setEditingProv(null); }} className={btnOutline + " flex-1"}>Cancelar</button>
            <button disabled={!provForm.nombre || saveProv.isPending} onClick={() => saveProv.mutate()} className={btnPrimary + " flex-1"}>
              {saveProv.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Subcomponente detalle expandido ──────────────────────────────────────────
function ReqDetail({ reqId, req, getItems, openPricing }: { reqId: string; req: Requisicion; getItems: Function; openPricing: Function }) {
  const [items, setItems] = React.useState<ReqItem[]>([]);
  React.useEffect(() => { getItems(reqId).then(setItems); }, [reqId]);
  const fmtMXN = (n: number | null | undefined) => (n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  return (
    <div className="border-t border-slate-100 px-5 py-4 space-y-3">
      {req.link_cotizacion && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <ExternalLink className="w-4 h-4 text-blue-600 shrink-0" />
          <a href={req.link_cotizacion} target="_blank" rel="noreferrer" className="text-sm text-blue-700 font-semibold hover:underline">
            Ver cotización del proveedor →
          </a>
        </div>
      )}
      {req.vobo_por && req.vobo_fecha && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-700 font-semibold">VoBo: {req.vobo_por} · {format(new Date(req.vobo_fecha), "d MMM yyyy HH:mm", { locale: es })}</p>
        </div>
      )}
      {items.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 uppercase">Producto</th>
              <th className="text-center px-3 py-2 text-xs font-bold text-slate-500 uppercase">Unidad</th>
              <th className="text-center px-3 py-2 text-xs font-bold text-slate-500 uppercase">Cantidad</th>
              <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Precio Unit.</th>
              <th className="text-right px-3 py-2 text-xs font-bold text-slate-500 uppercase">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((it, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-3 py-2 font-medium">{it.nombre_producto}</td>
                <td className="px-3 py-2 text-center text-slate-500">{it.unidad}</td>
                <td className="px-3 py-2 text-center">{it.cantidad}</td>
                <td className="px-3 py-2 text-right">{it.precio_cotizado != null ? fmtMXN(it.precio_cotizado) : '—'}</td>
                <td className="px-3 py-2 text-right font-semibold">{it.precio_cotizado != null ? fmtMXN(it.precio_cotizado * it.cantidad) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {req.notas && <p className="text-xs text-slate-500 italic">Notas: {req.notas}</p>}
    </div>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <h3 className="font-black text-slate-900 text-sm">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-200"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
