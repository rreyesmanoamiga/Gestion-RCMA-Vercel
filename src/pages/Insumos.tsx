import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { logAudit } from '@/lib/audit';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Plus, Search, Pencil, Trash2, X, CheckCircle2,
  Package, Truck, ClipboardList, ExternalLink, Download,
  ShieldCheck, Clock, AlertCircle, ChevronDown, ChevronUp, Upload, FileArchive,
} from 'lucide-react';

const REQ_PAGE_SIZE = 20;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Proveedor   { id: string; nombre: string; contacto: string; correo: string; telefono: string; activo: boolean; notas: string; }
interface Producto    { id: string; codigo: string; nombre: string; descripcion: string; unidad: string; categoria: string; precio_referencia: number; activo: boolean; }
interface ReqItem     { id?: string; producto_id?: string; nombre_producto: string; descripcion: string; unidad: string; cantidad: number; precio_referencia?: number; precio_cotizado?: number | null; observaciones?: string; }
interface Requisicion { id: string; folio: string; proveedores_ids: string[]; proveedores_nombres: string[]; estatus: string; link_cotizacion: string; vobo_por: string; vobo_fecha: string | null; notas: string; total_cotizado: number; created_at: string; items?: ReqItem[];
  // Nuevos campos
  fecha_requerida?: string; prioridad?: string; justificacion?: string; departamento?: string;
  iva_porcentaje?: number; total_con_iva?: number;
  fecha_surtido?: string | null;
  cotizacion_sp_url?: string; cotizacion_sp_nombre?: string;
  pdf_sp_url?: string; pdf_sp_nombre?: string; }

const FIRMA_RCMA_B64 = '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';

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
// Placeholder — PDF blob generation for SharePoint upload
async function generarPDFBlob(_req: any, _items: any[]): Promise<Blob | null> {
  return null; // Auto-upload del PDF autorizado — implementar con jsPDF output('blob')
}

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

  // Logo arriba a la derecha
  try {
    const logoImg = await new Promise<string>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d')!.drawImage(img, 0, 0); res(cv.toDataURL('image/png')); };
      img.onerror = rej; img.src = '/logo.png';
    });
    doc.addImage(logoImg, 'PNG', W - 38, 3, 22, 22);
  } catch { /* sin logo */ }

  // Folio badge pequeño — justo abajo del logo
  doc.setFillColor(13, 138, 126); doc.roundedRect(W - 38, 27, 22, 6, 1, 1, 'F');
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(req.folio, W - 27, 31.5, { align: 'center' });
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
    // Línea separadora
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
    doc.line(100, y, W - 12, y); y += 2;

    const ivaPct  = req.iva_porcentaje ?? 0;
    const subtot  = req.total_cotizado ?? totalCalc;
    const ivaAmt  = subtot * (ivaPct / 100);
    const totalCV = req.total_con_iva ?? (subtot + ivaAmt);

    // Subtotal
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80);
    doc.text('Subtotal:', 130, y + 4);
    doc.text(fmtMXN(subtot), W - 16, y + 4, { align: 'right' }); y += 7;

    // IVA
    doc.text(`IVA (${ivaPct}%):`, 130, y + 4);
    doc.text(fmtMXN(ivaAmt), W - 16, y + 4, { align: 'right' }); y += 7;

    // Total con IVA — destacado
    doc.setFillColor(13, 138, 126); doc.rect(115, y - 3, W - 127, 12, 'F');
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text('TOTAL A PAGAR (con IVA)', 119, y + 5);
    doc.text(fmtMXN(totalCV), W - 16, y + 5, { align: 'right' });
    y += 18;
  } else { y += 10; }

  // ── BLOQUE DE FIRMAS — mismo diseño que Ticket MAS, solo cuando autorizado ──
  if (autorizado) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.3);
    doc.line(14, y, W - 14, y); y += 8;

    const boxW  = (W - 28 - 8) / 2;   // ~86mm cada caja
    const boxH  = 38;
    const xL    = 14;
    const xR    = 14 + boxW + 8;

    // ── Caja izquierda: ELABORÓ (Ricardo + firma imagen) ─────────────────
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.4);
    doc.rect(xL, y, boxW, boxH, 'S');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
    doc.text('ELABORÓ Y SOLICITÓ', xL + boxW / 2, y + 5, { align: 'center' });

    // Imagen de firma de Ricardo
    try {
      doc.addImage('data:image/jpeg;base64,' + FIRMA_RCMA_B64, 'JPEG', xL + boxW / 2 - 22, y + 7, 44, 14);
    } catch { /* sin imagen */ }

    // Línea y nombre
    doc.setDrawColor(148, 163, 184); doc.line(xL + 4, y + boxH - 14, xL + boxW - 4, y + boxH - 14);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text('RICARDO JOANATHAN REYES MEDINA', xL + boxW / 2, y + boxH - 9, { align: 'center' });
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text('Coordinador de Obras y Mantenimiento RCMA', xL + boxW / 2, y + boxH - 4, { align: 'center' });

    // ── Caja derecha: AUTORIZÓ (Félix) ────────────────────────────────────
    doc.setDrawColor(22, 163, 74); doc.setLineWidth(0.5);
    doc.rect(xR, y, boxW, boxH, 'S');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(22, 163, 74);
    doc.text('AUTORIZÓ — VoBo', xR + boxW / 2, y + 5, { align: 'center' });

    // Espacio de firma vacío con fecha de autorización
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text('Autorizado el ' + fmtDate(req.vobo_fecha), xR + boxW / 2, y + 16, { align: 'center' });

    // Línea y nombre de Félix
    doc.setDrawColor(22, 163, 74); doc.line(xR + 4, y + boxH - 14, xR + boxW - 4, y + boxH - 14);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text('FÉLIX GUERRA HERRERA', xR + boxW / 2, y + boxH - 9, { align: 'center' });
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text('Autorización de Suministros — FMA Monterrey', xR + boxW / 2, y + boxH - 4, { align: 'center' });

    doc.setLineWidth(0.2);
    y += boxH + 6;
  }

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
  doc.save(req.folio + (autorizado ? '-AUTORIZADO' : '') + '.pdf');
}
// ─── Componente principal ──────────────────────────────────────────────────────
export default function Insumos() {
  const { user } = useAuth();
  const { isAdmin, can } = usePermissions();
  const qc = useQueryClient();

  const puedeVoBo = isAdmin || can('vobo_insumos');

  const [tab, setTab]         = useState<'requisiciones' | 'productos' | 'proveedores'>('requisiciones');
  const [search, setSearch]   = useState('');
  const [reqVisibleCount, setReqVisibleCount] = useState(REQ_PAGE_SIZE);
  const [expanded, setExpanded] = useState<string | null>(null);

  // ── Modals ────────────────────────────────────────────────────────────────
  const [showReqForm,   setShowReqForm]   = useState(false);
  const [showProdForm,  setShowProdForm]  = useState(false);
  const [showProvForm,  setShowProvForm]  = useState(false);
  const [editingReq,    setEditingReq]    = useState<Requisicion | null>(null);
  const [editingProd,   setEditingProd]   = useState<Producto | null>(null);
  const [editingProv,   setEditingProv]   = useState<Proveedor | null>(null);
  const { upload: spUpload, uploading: spUploading } = useSharePointUpload();
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
      logAudit({
        accion:       'crear',
        modulo:       'insumos',
        registro_id:  req.id,
        registro_ref: folio,
        detalle:      { proveedores: provNombres.join(', '), prioridad: reqPrioridad },
      });
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
  const [ivaPercent, setIvaPercent] = useState('16');
  const [cotizacionFile, setCotizacionFile] = useState<File | null>(null);

  const openPricing = async (req: Requisicion) => {
    const items = await getItems(req.id);
    setPricingItems(items);
    setLinkCotizacion(req.link_cotizacion ?? '');
    setIvaPercent('16');
    setPricingModal(req);
  };

  const savePricingMutation = useMutation({
    mutationFn: async ({ req, items, link }: { req: Requisicion; items: ReqItem[]; link: string }) => {
      const subtotal = items.reduce((s, it) => s + ((it.precio_cotizado ?? 0) * it.cantidad), 0);
      const ivaPct   = parseFloat(ivaPercent) || 0;
      const totalIVA = subtotal * (1 + ivaPct / 100);
      let spUrl = req.cotizacion_sp_url ?? '';
      let spNombre = req.cotizacion_sp_nombre ?? '';
      // Subir cotización a SharePoint si se seleccionó archivo
      if (cotizacionFile) {
        const result = await spUpload(cotizacionFile, {
          modulo: 'Insumos',
          referencia: req.folio,
        });
        if (result) { spUrl = result.webUrl; spNombre = result.fileName; }
      }
      await supabase.from('insumos_requisiciones').update({
        estatus: 'cotizacion_recibida',
        link_cotizacion: link || spUrl,
        total_cotizado:  subtotal,
        iva_porcentaje:  ivaPct,
        total_con_iva:   totalIVA,
        cotizacion_sp_url: spUrl,
        cotizacion_sp_nombre: spNombre,
        updated_at: new Date().toISOString(),
      }).eq('id', req.id);
      for (const it of items) {
        if (it.id) await supabase.from('insumos_items').update({ precio_cotizado: it.precio_cotizado }).eq('id', it.id);
      }
      logAudit({
        accion:       'editar',
        modulo:       'insumos',
        registro_id:  req.id,
        registro_ref: req.folio,
        detalle:      { total_con_iva: totalIVA, estatus_nuevo: 'cotizacion_recibida' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      toast.success('Cotización registrada'); setPricingModal(null);
      setCotizacionFile(null);
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
          iva_porcentaje: req.iva_porcentaje ?? 16,
          total_con_iva: req.total_con_iva ?? req.total_cotizado,
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
      // Notificar al admin (Ricardo) que el VoBo fue otorgado
      await supabase.functions.invoke('notify-vobo-insumos', {
        body: {
          tipo: 'autorizado',
          folio: req.folio,
          proveedores: req.proveedores_nombres,
          total: req.total_cotizado,
          iva_porcentaje: req.iva_porcentaje ?? 16,
          total_con_iva: req.total_con_iva ?? req.total_cotizado,
          vobo_por: nombre,
          vobo_fecha: new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' }),
          siteUrl: window.location.origin,
        },
      });
      logAudit({
        accion:       'autorizar',
        modulo:       'insumos',
        registro_id:  req.id,
        registro_ref: req.folio,
        detalle:      { vobo_por: nombre, total_con_iva: req.total_con_iva ?? req.total_cotizado },
      });
    },
    onSuccess: async (_data: void, req: Requisicion) => {
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      toast.success('VoBo registrado correctamente ✓');
      // Auto-subir PDF autorizado a SharePoint (opcional)
      try {
        const fresh = await supabase.from('insumos_requisiciones').select('*').eq('id', req.id).single();
        const freshItems = await supabase.from('insumos_items').select('*').eq('requisicion_id', req.id);
        if (fresh.data) {
          const pdfBlob = await generarPDFBlob(fresh.data as any, (freshItems.data ?? []) as any);
          if (pdfBlob) {
            const pdfFile = new File([pdfBlob], `${req.folio}-AUTORIZADO.pdf`, { type: 'application/pdf' });
            const result = await spUpload(pdfFile, { modulo: 'Insumos', referencia: req.folio });
            if (result) {
              await supabase.from('insumos_requisiciones').update({ pdf_sp_url: result.webUrl, pdf_sp_nombre: result.fileName }).eq('id', req.id);
              toast.success('PDF autorizado subido a SharePoint ✓');
            }
          }
        }
      } catch { /* PDF upload opcional */ }
      setVoboModal(null);
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
      const req = requisiciones.find(r => r.id === id);
      await supabase.from('insumos_items').delete().eq('requisicion_id', id);
      const { error } = await supabase.from('insumos_requisiciones').delete().eq('id', id);
      if (error) throw error;
      logAudit({
        accion:       'eliminar',
        modulo:       'insumos',
        registro_id:  id,
        registro_ref: req?.folio ?? null,
      });
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

  const visibleReq    = useMemo(() => filteredReq.slice(0, reqVisibleCount), [filteredReq, reqVisibleCount]);
  const hasMoreReq     = reqVisibleCount < filteredReq.length;
  const remainingReq   = filteredReq.length - reqVisibleCount;

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
            value={search} onChange={e => { setSearch(e.target.value); setReqVisibleCount(REQ_PAGE_SIZE); }} />
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
          {visibleReq.map(req => {
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
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          {fmtMXN(req.total_cotizado)} s/IVA
                        </span>
                      )}
                      {req.total_con_iva && req.total_con_iva > 0 && (
                        <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                          {fmtMXN(req.total_con_iva)} c/IVA
                        </span>
                      )}
                      {req.estatus === 'surtido' && req.fecha_surtido && (
                        <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          ✅ Surtido el {new Date(req.fecha_surtido).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      {req.cotizacion_sp_url && (
                        <a href={req.cotizacion_sp_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full hover:bg-blue-100 transition">
                          <FileArchive className="w-3 h-3"/> Cotización
                        </a>
                      )}
                      {req.pdf_sp_url && (
                        <a href={req.pdf_sp_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full hover:bg-emerald-100 transition">
                          <FileArchive className="w-3 h-3"/> PDF Autorizado
                        </a>
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
                      <button type="button" onClick={() => openPricing(req)}
                        className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                        + Cotización
                      </button>
                    )}
                    {/* Editar cotización ya registrada */}
                    {isAdmin && (req.estatus === 'cotizacion_recibida' || req.estatus === 'en_autorizacion') && (
                      <button type="button" onClick={() => openPricing(req)}
                        className="px-3 py-1.5 text-xs font-bold bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition flex items-center gap-1">
                        <Pencil className="w-3 h-3" /> Editar cotización
                      </button>
                    )}
                    {/* Solicitar VoBo */}
                    {isAdmin && req.estatus === 'cotizacion_recibida' && (
                      <button type="button" onClick={() => solicitarVoBo.mutate(req)} disabled={solicitarVoBo.isPending}
                        className="px-3 py-1.5 text-xs font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition">
                        Solicitar VoBo
                      </button>
                    )}
                    {/* Reenviar correo VoBo — ya en autorización */}
                    {isAdmin && req.estatus === 'en_autorizacion' && (
                      <button type="button" onClick={() => solicitarVoBo.mutate(req)} disabled={solicitarVoBo.isPending}
                        className="px-3 py-1.5 text-xs font-bold bg-orange-400 text-white rounded-lg hover:bg-orange-500 transition"
                        title="Reenviar correo de VoBo a Félix">
                        ↺ Reenviar VoBo
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
                        await supabase.from('insumos_requisiciones').update({ estatus: 'surtido', fecha_surtido: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', req.id);
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

          {hasMoreReq && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                onClick={() => setReqVisibleCount(v => v + REQ_PAGE_SIZE)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
              >
                <ChevronDown className="w-4 h-4" />
                Cargar más ({remainingReq} restante{remainingReq !== 1 ? 's' : ''})
              </button>
              <p className="text-xs text-slate-400">
                Mostrando {visibleReq.length} de {filteredReq.length} requisiciones
              </p>
            </div>
          )}
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
        <Modal title="Nueva Requisición de Insumos" onClose={() => setShowReqForm(false)} wide xl>
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
                  <div key={i} className="grid grid-cols-12 gap-2 items-start p-3 bg-slate-50 rounded-lg border border-slate-100">
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
                    <div className="col-span-2">
                      <label className="text-[10px] text-slate-400 mb-0.5 block">Cantidad</label>
                      <input type="number" min="1" step="1" className={inputCls + " text-center font-bold"} value={it.cantidad}
                        onChange={e => setReqItem(i, 'cantidad', parseFloat(e.target.value) || 1)} />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[10px] text-slate-400 mb-0.5 block">Observaciones / Especificaciones</label>
                      <input className={inputCls} placeholder="Marca, presentación..."
                        value={it.observaciones ?? ''}
                        onChange={e => setReqItem(i, 'observaciones', e.target.value)} />
                    </div>
                    <div className="col-span-1 flex items-end pb-0.5 justify-center">
                      <button type="button" onClick={() => removeReqItem(i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
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
        <Modal title={`Registrar Cotización — ${pricingModal.folio}`} onClose={() => setPricingModal(null)} wide xl>
          <div className="space-y-4 overflow-y-auto max-h-[65vh] p-1">

            {/* Link OneDrive o subir cotización directo a SharePoint */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cotización del proveedor</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">📎 Subir PDF/Excel a SharePoint</p>
                  <label className={`flex items-center gap-2 cursor-pointer border border-dashed rounded-lg px-3 py-2 transition ${spUploading ? 'opacity-50 pointer-events-none bg-slate-50' : 'border-teal-300 hover:bg-teal-50 bg-white'}`}>
                    <Upload className="w-4 h-4 text-teal-500 shrink-0" />
                    <span className="text-xs text-slate-600 truncate">
                      {cotizacionFile ? cotizacionFile.name : spUploading ? 'Subiendo...' : 'Seleccionar archivo'}
                    </span>
                    <input type="file" accept=".pdf,.xlsx,.xls,.docx" className="hidden"
                      onChange={e => setCotizacionFile(e.target.files?.[0] ?? null)} />
                  </label>
                  {pricingModal?.cotizacion_sp_url && !cotizacionFile && (
                    <a href={pricingModal.cotizacion_sp_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 mt-1 text-[10px] text-blue-600 hover:underline">
                      <FileArchive className="w-3 h-3" /> Ver cotización en SharePoint
                    </a>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">🔗 O pegar link externo</p>
                  <div className="flex gap-2">
                    <input className={inputCls} placeholder="https://..." value={linkCotizacion} onChange={e => setLinkCotizacion(e.target.value)} />
                    {linkCotizacion && <a href={linkCotizacion} target="_blank" rel="noreferrer" className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 transition"><ExternalLink className="w-4 h-4" /></a>}
                  </div>
                </div>
              </div>
            </div>

            {/* IVA configurable */}
            <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3">
              <span className="text-sm font-bold text-teal-800 whitespace-nowrap">¿Qué IVA aplica?</span>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-20 px-3 py-1.5 border border-teal-300 rounded-lg text-sm font-bold text-center focus:ring-2 focus:ring-teal-500 focus:outline-none bg-white"
                  value={ivaPercent}
                  onChange={e => setIvaPercent(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="16"
                />
                <span className="text-sm font-black text-teal-700">%</span>
              </div>
              <span className="text-xs text-teal-600">· Ejemplos: 0% (sin IVA), 8%, 16%</span>
            </div>

            {/* Tabla de precios */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Captura los precios unitarios de la cotización</label>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-12 gap-0 bg-slate-800 text-white text-xs font-bold px-3 py-2">
                  <div className="col-span-5">Producto</div>
                  <div className="col-span-2 text-center">Cant. / Unidad</div>
                  <div className="col-span-3 text-center">Precio Unitario</div>
                  <div className="col-span-2 text-right">Subtotal</div>
                </div>
                {pricingItems.map((it, i) => (
                  <div key={i} className={`grid grid-cols-12 gap-0 items-center px-3 py-2.5 border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                    <div className="col-span-5 text-sm font-semibold text-slate-800 pr-2">{it.nombre_producto}</div>
                    <div className="col-span-2 text-xs text-slate-500 text-center">{it.cantidad} {it.unidad}</div>
                    <div className="col-span-3 px-1">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="w-full pl-7 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm text-right font-mono focus:ring-2 focus:ring-teal-500 focus:outline-none bg-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          placeholder="0.00"
                          value={it.precio_cotizado ?? ''}
                          onChange={e => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            setPricingItems(prev => prev.map((p, idx) => idx === i ? { ...p, precio_cotizado: val === '' ? null : parseFloat(val) || null } : p));
                          }}
                        />
                      </div>
                    </div>
                    <div className="col-span-2 text-sm font-bold text-slate-700 text-right">
                      {it.precio_cotizado ? fmtMXN((it.precio_cotizado as number) * it.cantidad) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resumen financiero */}
            {(() => {
              const subtotal = pricingItems.reduce((s, it) => s + ((it.precio_cotizado ?? 0) * it.cantidad), 0);
              const ivaPct   = parseFloat(ivaPercent) || 0;
              const ivaAmt   = subtotal * (ivaPct / 100);
              const total    = subtotal + ivaAmt;
              return (
                <div className="bg-slate-900 rounded-xl p-4 text-white space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Subtotal:</span>
                    <span className="font-semibold">{fmtMXN(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">IVA ({ivaPct}%):</span>
                    <span className="font-semibold">{fmtMXN(ivaAmt)}</span>
                  </div>
                  <div className="flex justify-between text-base border-t border-slate-700 pt-2 mt-1">
                    <span className="font-black">TOTAL con IVA:</span>
                    <span className="font-black text-teal-400 text-lg">{fmtMXN(total)}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="flex gap-3 mt-4">
            <button type="button" onClick={() => setPricingModal(null)} className={btnOutline + " flex-1"}>Cancelar</button>
            <button type="button" disabled={savePricingMutation.isPending}
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
function Modal({ title, onClose, children, wide, xl }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; xl?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${xl ? 'max-w-4xl' : wide ? 'max-w-2xl' : 'max-w-md'} flex flex-col max-h-[90vh]`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <h3 className="font-black text-slate-900 text-sm">{title}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-200"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
