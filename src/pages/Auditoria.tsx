import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { usePermissions } from '@/hooks/usePermissions';
import {
  ShieldAlert, Filter, LogIn, LogOut, UserPlus, CheckCircle2, PlusCircle,
  Pencil, Ban, Trash2, Award, ChevronDown, User as UserIcon,
  FileDown, FileSpreadsheet, Calendar,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

type Doc = import('jspdf').jsPDF;

const cardClass   = "bg-white rounded-xl border border-slate-200 shadow-sm p-5";
const selectClass = "px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none";
const btnOutline  = "inline-flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-md text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors";
const PAGE_SIZE   = 30;

// ─── Helpers de exportación — mismo formato institucional que Reportes ────────
async function loadJsPDF(): Promise<typeof import('jspdf').jsPDF> {
  const w = window as Window & { jspdf?: { jsPDF: typeof import('jspdf').jsPDF } };
  if (w.jspdf?.jsPDF) return w.jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve(); s.onerror = () => reject(new Error('jsPDF load error'));
    document.head.appendChild(s);
  });
  return w.jspdf!.jsPDF;
}

async function loadXLSX() {
  type XLSXType = typeof import('xlsx');
  const w = window as Window & { XLSX?: XLSXType; XlsxStyle?: XLSXType };
  if (w.XLSX?.utils) return w.XLSX;
  if (w.XlsxStyle?.utils) return w.XlsxStyle;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
    s.onload = () => resolve(); s.onerror = () => reject(new Error('XLSX load error'));
    document.head.appendChild(s);
  });
  const lib = (w.XLSX?.utils ? w.XLSX : w.XlsxStyle) as XLSXType;
  if (!lib?.utils) throw new Error('xlsx-js-style no cargó correctamente');
  return lib;
}

async function pdfHeader(doc: Doc, W: number, title: string, subtitle: string) {
  doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 28, 'F');
  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(title, 20, 13);
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 200);
  doc.text(subtitle, 20, 21);
  try {
    const logoImg = await new Promise<string>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.drawImage(img, 0, 0); res(c.toDataURL('image/png')); };
      img.onerror = rej; img.src = '/logo.png';
    });
    doc.addImage(logoImg, 'PNG', W - 32, 2, 22, 22);
  } catch { /* sin logo */ }
}

function pdfFooter(doc: Doc, label: string) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const pH = (doc as any).internal.pageSize.getHeight();
    const pW = (doc as any).internal.pageSize.getWidth();
    doc.setFillColor(15, 23, 42); doc.rect(0, pH - 11, pW, 11, 'F');
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 160, 180);
    doc.text(label, 20, pH - 5);
    doc.text('Página ' + i + ' de ' + pages, pW - 20, pH - 5, { align: 'right' });
  }
}

function drawTable(
  doc: Doc, y: number, W: number,
  headers: { label: string; x: number; align?: 'left' | 'right' | 'center' }[],
  rows: string[][],
  maxRows = 40,
  pageH = 297
): number {
  const doc2 = doc as any;
  doc.setFillColor(241, 245, 249); doc.rect(18, y - 4, W - 36, 9, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
  headers.forEach(h => doc.text(h.label, h.x, y, { align: h.align ?? 'left' }));
  y += 7;
  doc.setDrawColor(220, 220, 220); doc.line(20, y, W - 20, y); y += 2;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
  rows.slice(0, maxRows).forEach((row, i) => {
    if (y > pageH - 32) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(18, y - 4, W - 36, 8, 'F'); }
    doc.setFontSize(8);
    row.forEach((cell, ci) => {
      const h = headers[ci];
      const nextX = ci < headers.length - 1 ? headers[ci + 1].x : (W - 18);
      const maxW  = nextX - h.x - 2;
      let txt = String(cell ?? '—');
      if (doc2.getTextWidth && doc2.getTextWidth(txt) > maxW) {
        while (txt.length > 1 && doc2.getTextWidth(txt + '…') > maxW) {
          txt = txt.slice(0, -1);
        }
        txt = txt + '…';
      }
      doc.text(txt, h.x, y, { align: h.align ?? 'left' });
    });
    y += 8;
  });
  if (rows.length > maxRows) {
    y += 2; doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text(`Mostrando ${maxRows} de ${rows.length} registros.`, 20, y); y += 6;
  }
  return y;
}

interface AuditRow {
  id:             string;
  created_at:     string;
  usuario_id:     string | null;
  usuario_nombre: string | null;
  usuario_email:  string | null;
  accion:         string;
  modulo:         string;
  registro_id:    string | null;
  registro_ref:   string | null;
  detalle:        Record<string, unknown> | null;
  en_nombre_de:   string | null;
}

const ACCION_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  login:               { label: 'Inicio de sesión',       icon: LogIn,        color: 'bg-slate-100 text-slate-600' },
  logout:              { label: 'Cierre de sesión',       icon: LogOut,       color: 'bg-slate-100 text-slate-500' },
  invitacion_enviada:  { label: 'Invitación enviada',      icon: UserPlus,     color: 'bg-blue-50 text-blue-600' },
  invitacion_aceptada: { label: 'Invitación aceptada',     icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
  crear:               { label: 'Creación',                icon: PlusCircle,   color: 'bg-teal-50 text-teal-600' },
  editar:              { label: 'Edición',                 icon: Pencil,       color: 'bg-amber-50 text-amber-600' },
  autorizar:           { label: 'Autorización',             icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
  completar:           { label: 'Completado',              icon: Award,        color: 'bg-emerald-50 text-emerald-600' },
  cancelar:            { label: 'Cancelación',             icon: Ban,          color: 'bg-red-50 text-red-600' },
  eliminar:            { label: 'Eliminación',              icon: Trash2,       color: 'bg-red-50 text-red-600' },
};

const MODULO_LABEL: Record<string, string> = {
  usuarios:      'Usuarios',
  solicitudes:   'Solicitudes',
  tickets_mas:   'Ticket MAS',
  tickets:       'Tickets Registrados',
  proyectos:     'Proyectos',
  presupuestos:  'Presupuestos',
  insumos:       'Insumos',
  checklists:    'Checklists',
  mantenimiento: 'Mantenimiento',
  nexus:         'NEXUS',
  anteproyectos: 'Anteproyectos',
  levantamiento: 'Levantamiento Nacional',
  calendario:    'Calendario de Mantenimiento',
  minutas:       'Minutas y Notas Técnicas',
  reportes_problema: 'Reportar Problema',
};

// ─── Export PDF: Reporte de Auditoría ─────────────────────────────────────────
async function exportAuditoriaPDF(rows: AuditRow[], desde: string, hasta: string): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const rangoLabel = desde && hasta
    ? `Del ${new Date(desde + 'T12:00:00').toLocaleDateString('es-MX')} al ${new Date(hasta + 'T12:00:00').toLocaleDateString('es-MX')}`
    : 'Todos los registros';
  await pdfHeader(doc, W, 'Reporte de Auditoría del Sistema', 'Sistema RCMA  ·  ' + rangoLabel + '  ·  Generado el ' + new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }));
  let y = 38;

  const rowsData = rows.map(r => [
    new Date(r.created_at).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    ACCION_META[r.accion]?.label ?? r.accion,
    MODULO_LABEL[r.modulo] ?? r.modulo,
    r.usuario_nombre ?? r.usuario_email ?? '—',
    r.registro_ref ?? '—',
    r.en_nombre_de ?? '—',
  ]);

  y = drawTable(doc, y, W, [
    { label: 'Fecha y Hora',    x: 20  },
    { label: 'Acción',          x: 62  },
    { label: 'Módulo',          x: 100 },
    { label: 'Usuario',         x: 140 },
    { label: 'Registro',        x: 195 },
    { label: 'A Nombre De',     x: 250 },
  ], rowsData, 300, 210);

  pdfFooter(doc, `Sistema RCMA · Colegios Mano Amiga · Documento confidencial · ${rows.length} registros`);
  doc.save(`auditoria-sistema-${Date.now()}.pdf`);
}

// ─── Export Excel: Reporte de Auditoría ───────────────────────────────────────
async function exportAuditoriaExcel(rows: AuditRow[], desde: string, hasta: string): Promise<void> {
  const XLSX = await loadXLSX();
  const wb   = XLSX.utils.book_new();
  const now  = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
  const rangoLabel = desde && hasta
    ? `Del ${new Date(desde + 'T12:00:00').toLocaleDateString('es-MX')} al ${new Date(hasta + 'T12:00:00').toLocaleDateString('es-MX')}`
    : 'Todos los registros';

  const bdr = {
    top:    { style: 'thin', color: { rgb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { rgb: 'FFD1D5DB' } },
    left:   { style: 'thin', color: { rgb: 'FFD1D5DB' } },
    right:  { style: 'thin', color: { rgb: 'FFD1D5DB' } },
  };
  const sTitle    = { font: { bold: true, sz: 13, name: 'Calibri', color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } }, alignment: { horizontal: 'left', vertical: 'center' } };
  const sSubtitle = { font: { italic: true, sz: 9, name: 'Calibri', color: { rgb: 'FFD1D5DB' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF0F172A' } }, alignment: { horizontal: 'right', vertical: 'center' } };
  const sHead     = { font: { bold: true, sz: 9, name: 'Calibri', color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF1E293B' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: bdr };
  const sCell     = { font: { sz: 9, name: 'Calibri' }, alignment: { vertical: 'center', wrapText: true }, border: bdr };
  const sCellAlt  = { ...sCell, fill: { patternType: 'solid', fgColor: { rgb: 'FFF8FAFC' } } };

  const headers = ['Fecha y Hora', 'Acción', 'Módulo', 'Usuario', 'Correo', 'Registro Afectado', 'A Nombre De', 'Detalle'];
  const dataRows = rows.map(r => [
    new Date(r.created_at).toLocaleString('es-MX'),
    ACCION_META[r.accion]?.label ?? r.accion,
    MODULO_LABEL[r.modulo] ?? r.modulo,
    r.usuario_nombre ?? '—',
    r.usuario_email ?? '—',
    r.registro_ref ?? '—',
    r.en_nombre_de ?? '—',
    r.detalle ? Object.entries(r.detalle).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' | ') : '—',
  ]);

  const aoa: (string | number)[][] = [
    ['REPORTE DE AUDITORÍA DEL SISTEMA — SISTEMA RCMA', rangoLabel],
    [],
    headers,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 0, c: 4 }, e: { r: 0, c: 7 } }];
  ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 26 }, { wch: 30 }, { wch: 20 }, { wch: 50 }];
  ws['!rows'] = [{ hpt: 22 }, { hpt: 4 }, { hpt: 20 }];

  if (ws['A1']) ws['A1'].s = sTitle;
  if (ws['E1']) ws['E1'].s = sSubtitle;
  headers.forEach((_, i) => {
    const cellRef = XLSX.utils.encode_cell({ r: 2, c: i });
    if (ws[cellRef]) ws[cellRef].s = sHead;
  });
  dataRows.forEach((_, ri) => {
    headers.forEach((__, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: 3 + ri, c: ci });
      if (ws[cellRef]) ws[cellRef].s = ri % 2 === 0 ? sCell : sCellAlt;
    });
  });

  XLSX.utils.book_append_sheet(wb, ws as import('xlsx').WorkSheet, '🛡️ Auditoría');
  XLSX.writeFile(wb, `Auditoria_Sistema_RCMA_${now.replace(/\s/g, '_')}.xlsx`);
}

export default function Auditoria() {
  const { isAdmin } = usePermissions();
  const [filterModulo, setFilterModulo] = useState('all');
  const [filterAccion, setFilterAccion] = useState('all');
  const [filterUsuario, setFilterUsuario] = useState('all');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [exportando, setExportando] = useState(false);

  // México es UTC-6 fijo — convertir cualquier timestamp/fecha a "día calendario México"
  const toFechaMX = (input: string | Date): string =>
    new Date(new Date(input).getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const aplicarPreset = (preset: 'hoy' | 'semana' | 'mes' | 'mesAnterior' | 'todo') => {
    const hoyMX = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (preset === 'todo')  { setFechaDesde(''); setFechaHasta(''); return; }
    if (preset === 'hoy')   { const s = fmt(hoyMX); setFechaDesde(s); setFechaHasta(s); return; }
    if (preset === 'semana') {
      const inicio = new Date(hoyMX); inicio.setUTCDate(hoyMX.getUTCDate() - 7);
      setFechaDesde(fmt(inicio)); setFechaHasta(fmt(hoyMX)); return;
    }
    if (preset === 'mes') {
      const inicio = new Date(Date.UTC(hoyMX.getUTCFullYear(), hoyMX.getUTCMonth(), 1));
      setFechaDesde(fmt(inicio)); setFechaHasta(fmt(hoyMX)); return;
    }
    if (preset === 'mesAnterior') {
      const inicio = new Date(Date.UTC(hoyMX.getUTCFullYear(), hoyMX.getUTCMonth() - 1, 1));
      const fin    = new Date(Date.UTC(hoyMX.getUTCFullYear(), hoyMX.getUTCMonth(), 0));
      setFechaDesde(fmt(inicio)); setFechaHasta(fmt(fin)); return;
    }
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['auditoria_sistema'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auditoria_sistema')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
    enabled: isAdmin,
  });

  const usuarios = useMemo(() =>
    Array.from(new Set(rows.map(r => r.usuario_email).filter(Boolean))).sort() as string[],
    [rows]
  );

  const filtered = useMemo(() => rows.filter(r => {
    const fecha = toFechaMX(r.created_at);
    return (filterModulo === 'all'  || r.modulo === filterModulo) &&
      (filterAccion === 'all'  || r.accion === filterAccion) &&
      (filterUsuario === 'all' || r.usuario_email === filterUsuario) &&
      (!fechaDesde || fecha >= fechaDesde) &&
      (!fechaHasta || fecha <= fechaHasta);
  }), [rows, filterModulo, filterAccion, filterUsuario, fechaDesde, fechaHasta]);

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  const handleExportPDF = async () => {
    setExportando(true);
    try { await exportAuditoriaPDF(filtered, fechaDesde, fechaHasta); }
    catch (e) { console.error(e); alert('Error al generar el PDF de auditoría'); }
    finally { setExportando(false); }
  };
  const handleExportExcel = async () => {
    setExportando(true);
    try { await exportAuditoriaExcel(filtered, fechaDesde, fechaHasta); }
    catch (e) { console.error(e); alert('Error al generar el Excel de auditoría'); }
    finally { setExportando(false); }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <ShieldAlert className="w-12 h-12 text-slate-300 mb-3" />
        <p className="text-slate-500 font-semibold">Esta sección es exclusiva para administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Auditoría del Sistema"
        subtitle="Registro completo de acciones: usuarios, invitaciones, solicitudes, tickets y proyectos"
      />

      {/* Barra de exportación */}
      <div className="flex justify-end gap-2">
        <button onClick={handleExportPDF} disabled={exportando || filtered.length === 0} className={btnOutline + " disabled:opacity-40"}>
          <FileDown className="w-4 h-4 text-red-600" /> {exportando ? 'Generando...' : 'PDF'}
        </button>
        <button onClick={handleExportExcel} disabled={exportando || filtered.length === 0} className={btnOutline + " disabled:opacity-40"}>
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> {exportando ? 'Generando...' : 'Excel'}
        </button>
      </div>

      {/* Rango de fechas */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar className="w-4 h-4 text-slate-400" />
        {[
          { key: 'hoy',         label: 'Hoy' },
          { key: 'semana',      label: 'Últimos 7 días' },
          { key: 'mes',         label: 'Este mes' },
          { key: 'mesAnterior', label: 'Mes anterior' },
          { key: 'todo',        label: 'Todo' },
        ].map(p => (
          <button key={p.key} onClick={() => aplicarPreset(p.key as any)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-300 bg-white text-slate-600 hover:border-slate-500 transition-colors">
            {p.label}
          </button>
        ))}
        <span className="text-slate-300">|</span>
        <input type="date" className={selectClass} value={fechaDesde}
          onChange={e => { setFechaDesde(e.target.value); setVisibleCount(PAGE_SIZE); }} />
        <span className="text-slate-400 text-sm">a</span>
        <input type="date" className={selectClass} value={fechaHasta}
          onChange={e => { setFechaHasta(e.target.value); setVisibleCount(PAGE_SIZE); }} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-slate-400" />
        <select className={selectClass} value={filterModulo}
          onChange={e => { setFilterModulo(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todos los módulos</option>
          {Object.entries(MODULO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={selectClass} value={filterAccion}
          onChange={e => { setFilterAccion(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todas las acciones</option>
          {Object.entries(ACCION_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={selectClass} value={filterUsuario}
          onChange={e => { setFilterUsuario(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todos los usuarios</option>
          {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <span className="text-sm text-slate-400">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Cargando auditoría...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">Sin registros para estos filtros.</div>
      ) : (
        <div className={cardClass + " p-0 overflow-hidden"}>
          <div className="divide-y divide-slate-100">
            {visible.map(r => {
              const meta = ACCION_META[r.accion] ?? { label: r.accion, icon: Pencil, color: 'bg-slate-100 text-slate-600' };
              const Icon = meta.icon;
              return (
                <div key={r.id} className="flex items-start gap-3 p-4 hover:bg-slate-50 transition-colors">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{meta.label}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase">
                        {MODULO_LABEL[r.modulo] ?? r.modulo}
                      </span>
                      {r.en_nombre_de && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 flex items-center gap-1">
                          <UserIcon className="w-3 h-3" /> A nombre de: {r.en_nombre_de}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">
                      <span className="font-semibold">{r.usuario_nombre ?? r.usuario_email ?? 'Desconocido'}</span>
                      {r.registro_ref && <> — <span className="text-slate-500">{r.registro_ref}</span></>}
                    </p>
                    {r.detalle && Object.keys(r.detalle).length > 0 && (
                      <p className="text-xs text-slate-400 mt-1 font-mono truncate">
                        {Object.entries(r.detalle).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join('  ·  ')}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                    {new Date(r.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
          >
            <ChevronDown className="w-4 h-4" />
            Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
          </button>
          <p className="text-xs text-slate-400">
            Mostrando {visible.length} de {filtered.length} registros
          </p>
        </div>
      )}
    </div>
  );
}
