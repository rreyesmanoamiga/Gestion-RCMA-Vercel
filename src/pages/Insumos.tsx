import { FIRMA_RCMA_SRC, FIRMA_RCMA_PROPORCION } from '@/lib/firmaRcma';
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
import { logoCuadradoDataURL } from '@/lib/logoPdf';

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
  requisicion_sp_url?: string; requisicion_sp_nombre?: string;
  pdf_sp_url?: string; pdf_sp_nombre?: string; }


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
// Arma el documento jsPDF (sin descargarlo todavía) — lo reutilizan tanto
// generarPDFRequisicion() (descarga manual) como generarPDFBlob() (auto-subida
// a OneDrive). Antes eran dos funciones separadas y la de auto-subida nunca
// se terminó de implementar (siempre regresaba null).
async function construirPDFRequisicion(req: Requisicion, items: ReqItem[], autorizado = false): Promise<any | null> {
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
  if (!JsPDF) { return null; }

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
      img.onload = () => res(logoCuadradoDataURL(img));
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
      const fh = 17, fw = fh * FIRMA_RCMA_PROPORCION; // centrada y sin deformar, apoyada en la línea
      doc.addImage(FIRMA_RCMA_SRC, 'PNG', xL + boxW / 2 - fw / 2, y + 6.5, fw, fh);
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
  return doc;
}

// Wrapper para descarga manual (botón "Descargar PDF" en la UI)
async function generarPDFRequisicion(req: Requisicion, items: ReqItem[], autorizado = false) {
  const doc = await construirPDFRequisicion(req, items, autorizado);
  if (!doc) { toast.error('No se pudo generar el PDF'); return; }
  doc.save(req.folio + (autorizado ? '-AUTORIZADO' : '') + '.pdf');
}

// Wrapper para auto-subida a OneDrive (no descarga nada, solo regresa el Blob)
async function generarPDFBlob(req: Requisicion, items: ReqItem[], autorizado = false): Promise<Blob | null> {
  const doc = await construirPDFRequisicion(req, items, autorizado);
  return doc ? doc.output('blob') : null;
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
    onSuccess: async (req) => {
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      toast.success(`Requisición ${req.folio} creada`);
      setShowReqForm(false); setReqItems([]); setSelProveedores([]); setReqNotas('');
      setReqFechaReq(''); setReqPrioridad('Normal'); setReqJustif('');

      // Auto-subir el PDF de la requisición recién creada a OneDrive (Insumos/Requisiciones)
      try {
        const freshItems = await supabase.from('insumos_items').select('*').eq('requisicion_id', req.id);
        const pdfBlob = await generarPDFBlob(req as Requisicion, (freshItems.data ?? []) as ReqItem[], false);
        if (!pdfBlob) throw new Error('No se pudo generar el PDF (jsPDF no cargó)');
        const pdfFile = new File([pdfBlob], `${req.folio}.pdf`, { type: 'application/pdf' });
        const result = await spUpload(pdfFile, { modulo: 'Insumos', categoria: 'Requisiciones', referencia: req.folio });
        if (!result) throw new Error('spUpload no regresó resultado');
        await supabase.from('insumos_requisiciones').update({ requisicion_sp_url: result.webUrl, requisicion_sp_nombre: result.fileName }).eq('id', req.id);
        qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      } catch (err: any) {
        toast.error('La requisición se creó, pero no se pudo subir su PDF a OneDrive: ' + (err?.message ?? 'error desconocido'));
      }
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al crear'),
  });

  // ── Capturar precios de cotización ────────────────────────────────────────
  const [pricingItems, setPricingItems] = useState<ReqItem[]>([]);
  const [precioTexto, setPrecioTexto]   = useState<Record<number, string>>({});
  const [linkCotizacion, setLinkCotizacion] = useState('');
  const [ivaPercent, setIvaPercent] = useState('16');
  const [cotizacionFile, setCotizacionFile] = useState<File | null>(null);

  const openPricing = async (req: Requisicion) => {
    const items = await getItems(req.id);
    setPricingItems(items);
    setPrecioTexto(Object.fromEntries(items.map((it, i) => [i, it.precio_cotizado != null ? String(it.precio_cotizado) : ''])));
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
          categoria: 'Cotizaciones',
          referencia: req.folio,
        });
        if (result) { spUrl = result.webUrl; spNombre = result.fileName; }
      }
      // No regresamos el estatus si ya iba más adelante (autorizado/surtido) — aquí
      // solo se está rescatando/actualizando el archivo, no reabriendo el flujo.
      const ESTATUS_AVANZADOS = ['autorizado', 'surtido'];
      const nuevoEstatus = ESTATUS_AVANZADOS.includes(req.estatus) ? req.estatus : 'cotizacion_recibida';
      await supabase.from('insumos_requisiciones').update({
        estatus: nuevoEstatus,
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
  // Genera y sube el PDF autorizado a OneDrive — reutilizable desde el VoBo
  // automático y desde el botón de "Reintentar" si la primera vez falló.
  // Genera el PDF de la Requisición (no autorizada) y lo sube a OneDrive —
  // para las requisiciones que se crearon antes de que esto existiera.
  const generarYSubirRequisicion = async (req: Requisicion) => {
    try {
      const items = await getItems(req.id);
      const pdfBlob = await generarPDFBlob(req, items, false);
      if (!pdfBlob) throw new Error('No se pudo generar el PDF (jsPDF no cargó)');
      const pdfFile = new File([pdfBlob], `${req.folio}.pdf`, { type: 'application/pdf' });
      const result = await spUpload(pdfFile, { modulo: 'Insumos', categoria: 'Requisiciones', referencia: req.folio });
      if (!result) throw new Error('spUpload no regresó resultado');
      await supabase.from('insumos_requisiciones').update({ requisicion_sp_url: result.webUrl, requisicion_sp_nombre: result.fileName }).eq('id', req.id);
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      toast.success('Requisición generada y subida a OneDrive ✓');
    } catch (err: any) {
      toast.error('No se pudo generar/subir la requisición: ' + (err?.message ?? 'error desconocido'));
    }
  };

  // Sube manualmente un archivo que el usuario ya elaboró (Word, escaneado, etc.)
  // en vez de generar el PDF automático — útil para requisiciones viejas.
  const subirRequisicionManual = async (req: Requisicion, file: File) => {
    try {
      const result = await spUpload(file, { modulo: 'Insumos', categoria: 'Requisiciones', referencia: req.folio });
      if (!result) throw new Error('spUpload no regresó resultado');
      await supabase.from('insumos_requisiciones').update({ requisicion_sp_url: result.webUrl, requisicion_sp_nombre: result.fileName }).eq('id', req.id);
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      toast.success('Archivo subido a OneDrive ✓');
    } catch (err: any) {
      toast.error('No se pudo subir el archivo: ' + (err?.message ?? 'error desconocido'));
    }
  };

  const subirPdfAutorizado = async (reqId: string, folio: string, mostrarExito = true) => {
    try {
      const fresh = await supabase.from('insumos_requisiciones').select('*').eq('id', reqId).single();
      const freshItems = await supabase.from('insumos_items').select('*').eq('requisicion_id', reqId);
      if (!fresh.data) throw new Error('No se encontró la requisición');
      const pdfBlob = await generarPDFBlob(fresh.data as any, (freshItems.data ?? []) as any, true);
      if (!pdfBlob) throw new Error('No se pudo generar el PDF (jsPDF no cargó)');
      const pdfFile = new File([pdfBlob], `${folio}-AUTORIZADO.pdf`, { type: 'application/pdf' });
      const result = await spUpload(pdfFile, { modulo: 'Insumos', categoria: 'Autorizaciones', referencia: folio });
      if (!result) throw new Error('spUpload no regresó resultado (revisa el toast de error de arriba)');
      await supabase.from('insumos_requisiciones').update({ pdf_sp_url: result.webUrl, pdf_sp_nombre: result.fileName }).eq('id', reqId);
      qc.invalidateQueries({ queryKey: ['insumos_requisiciones'] });
      if (mostrarExito) toast.success('PDF autorizado subido a SharePoint ✓');
    } catch (err: any) {
      toast.error('No se pudo subir el PDF autorizado a OneDrive: ' + (err?.message ?? 'error desconocido'));
    }
  };

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
      // Auto-subir PDF autorizado a SharePoint — ya no se silencia el error
      await subirPdfAutorizado(req.id, req.folio);
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
          <h1 className="text-2xl font-display font-semibold text-slate-900 tracking-tight uppercase">Insumos</h1>
          <p className="text-sm text-slate-500 font-medium mt-1 italic">Gestión de suministros · FMA Oficina Monterrey</p>
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
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit max-w-full overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
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
                      {req.requisicion_sp_url && (
                        <a href={req.requisicion_sp_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full hover:bg-slate-200 transition">
                          <FileArchive className="w-3 h-3"/> Requisición
                        </a>
                      )}
                      {!req.requisicion_sp_url && (
                        <>
                          <button onClick={() => generarYSubirRequisicion(req)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100 transition">
                            <FileArchive className="w-3 h-3"/> Generar Requisición
                          </button>
                          <label className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full hover:bg-slate-50 transition cursor-pointer">
                            <FileArchive className="w-3 h-3"/> O sube la que ya tienes
                            <input type="file" accept=".pdf,.doc,.docx" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) subirRequisicionManual(req, f); }} />
                          </label>
                        </>
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
                      {!!req.vobo_fecha && !req.pdf_sp_url && (
                        <button onClick={() => subirPdfAutorizado(req.id, req.folio)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100 transition">
                          <FileArchive className="w-3 h-3"/> Reintentar subir PDF a OneDrive
                        </button>
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
                    {/* Editar cotización ya registrada — incluye estatus posteriores, para
                        poder rescatar el archivo en requisiciones viejas que ya avanzaron
                        de estatus antes de que existiera esta carpeta en OneDrive. */}
                    {isAdmin && ['cotizacion_recibida', 'en_autorizacion', 'autorizado', 'surtido'].includes(req.estatus) && (
                      <button type="button" onClick={() => openPricing(req)}
                        className="px-3 py-1.5 text-xs font-bold bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition flex items-center gap-1">
                        <Pencil className="w-3 h-3" /> {req.cotizacion_sp_url ? 'Editar cotización' : 'Adjuntar cotización'}
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
          <div className="overflow-x-auto">
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
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-start p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="col-span-2 sm:col-span-4">
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
                    <div className="col-span-1 sm:col-span-2">
                      <label className="text-[10px] text-slate-400 mb-0.5 block">Unidad</label>
                      <select className={inputCls} value={it.unidad} onChange={e => setReqItem(i, 'unidad', e.target.value)}>
                        {UNIDADES.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label className="text-[10px] text-slate-400 mb-0.5 block">Cantidad</label>
                      <input type="number" min="1" step="1" className={inputCls + " text-center font-bold"} value={it.cantidad}
                        onChange={e => setReqItem(i, 'cantidad', parseFloat(e.target.value) || 1)} />
                    </div>
                    <div className="col-span-2 sm:col-span-3">
                      <label className="text-[10px] text-slate-400 mb-0.5 block">Observaciones / Especificaciones</label>
                      <input className={inputCls} placeholder="Marca, presentación..."
                        value={it.observaciones ?? ''}
                        onChange={e => setReqItem(i, 'observaciones', e.target.value)} />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex items-end pb-0.5 justify-end sm:justify-center">
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
              <div className="rounded-xl border border-slate-200 overflow-x-auto">
                <div className="min-w-[500px]">
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
                          value={precioTexto[i] ?? ''}
                          onChange={e => {
                            // Permite dígitos y un solo punto decimal — sin redondear
                            // ni "limpiar" mientras se escribe, para no perder el punto.
                            let val = e.target.value.replace(/[^0-9.]/g, '');
                            const primerPunto = val.indexOf('.');
                            if (primerPunto !== -1) {
                              val = val.slice(0, primerPunto + 1) + val.slice(primerPunto + 1).replace(/\./g, '');
                            }
                            setPrecioTexto(prev => ({ ...prev, [i]: val }));
                            const num = val === '' || val === '.' ? null : parseFloat(val);
                            setPricingItems(prev => prev.map((p, idx) => idx === i ? { ...p, precio_cotizado: (num != null && !isNaN(num)) ? num : null } : p));
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
        <div className="overflow-x-auto">
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
        </div>
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
