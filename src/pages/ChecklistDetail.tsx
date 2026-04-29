import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, Pencil, Trash2, MapPin, User, Calendar, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import ChecklistForm, { type ChecklistItem } from '@/components/checklists/ChecklistForm';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  bueno:   { label: 'Bueno',   color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  regular: { label: 'Regular', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  malo:    { label: 'Malo',    color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  critico: { label: 'Crítico', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
};

const ITEM_ESTADO_COLORS: Record<string, string> = {
  Bueno:   'bg-green-100 text-green-700',
  Regular: 'bg-yellow-100 text-yellow-700',
  Malo:    'bg-orange-100 text-orange-700',
  Crítico: 'bg-red-100 text-red-700',
};

const formatFecha = (fecha?: string) => {
  if (!fecha) return '—';
  try { return format(parseISO(fecha), "d 'de' MMMM 'de' yyyy", { locale: es }); }
  catch { return fecha; }
};

const formatFechaCorta = (fecha?: string) => {
  if (!fecha) return '—';
  try { return format(parseISO(fecha), "d MMM yyyy", { locale: es }); }
  catch { return fecha; }
};

interface ChecklistRecord {
  id: string; titulo?: string; inspector?: string; fecha?: string;
  territorio?: string; colegio?: string; eco?: string;
  material?: string; descripcion?: string;
  overall_status?: string; items?: ChecklistItem[];
  created_at?: string;
}

// ─── Helpers PDF ─────────────────────────────────────────────────────────────
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

// ─── Generador de PDF ─────────────────────────────────────────────────────────
async function generarPDF(c: ChecklistRecord) {
  const JsPDF  = await loadJsPDF();
  const doc    = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W      = 210;
  const mL     = 20;
  const mR     = 20;
  const cW     = W - mL - mR;
  let y        = 0;

  const now = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });

  // ── Encabezado oscuro (igual que Resumen General) ─────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 28, 'F');
  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('Reporte de Inspección — Sistema RCMA', mL, 13);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 180, 200);
  doc.text('Generado el ' + now, mL, 22);

  // Logo
  try {
    const logoImg = await new Promise<string>((res, rej) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        cv.getContext('2d')!.drawImage(img, 0, 0);
        res(cv.toDataURL('image/png'));
      };
      img.onerror = rej; img.src = '/colegio-mano-amiga.png';
    });
    doc.addImage(logoImg, 'PNG', W - 38, 2, 24, 24);
  } catch { /* sin logo */ }

  y = 40;

  // ── Título ────────────────────────────────────────────────────────────────
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  const tituloLines = doc.splitTextToSize(c.titulo ?? 'Sin título', cW);
  doc.text(tituloLines, mL, y);
  y += tituloLines.length * 8 + 2;

  // ── Badges estado + material ──────────────────────────────────────────────
  const statusLabel = STATUS_CONFIG[c.overall_status ?? 'bueno']?.label ?? 'Bueno';
  const badgeRGB: Record<string, [number,number,number]> = {
    bueno: [22,163,74], regular: [202,138,4], malo: [234,88,12], critico: [220,38,38],
  };
  const [br, bg, bb] = badgeRGB[c.overall_status ?? 'bueno'] ?? badgeRGB.bueno;
  doc.setFillColor(br, bg, bb);
  doc.roundedRect(mL, y, 22, 7, 1.5, 1.5, 'F');
  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text(statusLabel.toUpperCase(), mL + 11, y + 4.8, { align: 'center' });

  if (c.material) {
    const mat = c.material.replace(/\(.*\)/, '').trim().toUpperCase();
    doc.setFillColor(71, 85, 105);
    doc.roundedRect(mL + 25, y, 38, 7, 1.5, 1.5, 'F');
    doc.text(mat, mL + 44, y + 4.8, { align: 'center' });
  }
  y += 13;

  // ── Descripción ───────────────────────────────────────────────────────────
  if (c.descripcion) {
    doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 116, 139);
    const dLines = doc.splitTextToSize(c.descripcion, cW);
    doc.text(dLines, mL, y);
    y += dLines.length * 5 + 4;
  }

  // ── Divider ───────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220); doc.line(mL, y, W - mR, y); y += 8;

  // ── Info grid (Colegio / Inspector / Fecha) ───────────────────────────────
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(mL, y - 4, cW, 22, 2, 2, 'F');
  const colW = cW / 3;
  const infoItems = [
    { label: 'COLEGIO',    val: c.colegio ?? '—', sub: c.territorio ?? '' },
    { label: 'INSPECTOR',  val: c.inspector || 'Sin asignar', sub: '' },
    { label: 'FECHA',      val: formatFechaCorta(c.fecha ?? c.created_at), sub: '' },
  ];
  infoItems.forEach((item, i) => {
    const x = mL + i * colW + 4;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
    doc.text(item.label, x, y + 2);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
    doc.text(item.val, x, y + 10);
    if (item.sub) {
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
      doc.text(item.sub, x, y + 16);
    }
  });
  y += 28;

  // ── Resumen de Condiciones ────────────────────────────────────────────────
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Resumen de Condiciones', mL, y); y += 4;
  doc.setDrawColor(220, 220, 220); doc.line(mL, y, W - mR, y); y += 6;

  const items = (c.items ?? []) as ChecklistItem[];
  const counts = {
    Bueno:   items.filter(i => i.estado === 'Bueno').length,
    Regular: items.filter(i => i.estado === 'Regular').length,
    Malo:    items.filter(i => i.estado === 'Malo').length,
    Crítico: items.filter(i => i.estado === 'Crítico').length,
  };

  const kpiRGB: Record<string, { bg:[number,number,number]; text:[number,number,number] }> = {
    Bueno:   { bg:[240,253,244], text:[22,163,74]   },
    Regular: { bg:[254,252,232], text:[202,138,4]   },
    Malo:    { bg:[255,247,237], text:[234,88,12]   },
    Crítico: { bg:[254,242,242], text:[220,38,38]   },
  };
  const kpiW = (cW - 6) / 4;
  Object.entries(counts).forEach(([label, count], i) => {
    const x = mL + i * (kpiW + 2);
    const { bg: kBg, text: kText } = kpiRGB[label] ?? kpiRGB.Bueno;
    doc.setFillColor(...kBg); doc.setDrawColor(220, 220, 220);
    doc.roundedRect(x, y, kpiW, 22, 2, 2, 'FD');
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(...kText);
    doc.text(String(count), x + kpiW / 2, y + 13, { align: 'center' });
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text(label.toUpperCase(), x + kpiW / 2, y + 19, { align: 'center' });
  });
  y += 30;

  // ── Items Inspeccionados ──────────────────────────────────────────────────
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
  doc.text('Items Inspeccionados', mL, y); y += 4;
  doc.setDrawColor(220, 220, 220); doc.line(mL, y, W - mR, y); y += 6;

  if (items.length === 0) {
    doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(148, 163, 184);
    doc.text('No hay ítems registrados en esta inspección.', mL, y);
    y += 8;
  } else {
    // Encabezado tabla
    doc.setFillColor(241, 245, 249);
    doc.rect(mL - 2, y - 4, cW + 4, 8, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 116, 139);
    doc.text('ESTADO', mL, y);
    doc.text('ÍTEM / OBSERVACIÓN', mL + 32, y);
    y += 6;
    doc.setDrawColor(220, 220, 220); doc.line(mL, y, W - mR, y); y += 4;

    items.forEach((item, i) => {
      if (y > 265) { doc.addPage(); y = 20; }
      const rowH = item.observacion ? 13 : 9;
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(mL - 2, y - 3, cW + 4, rowH + 2, 'F');
      }

      // Badge estado
      const { text: [er, eg, eb] } = kpiRGB[item.estado] ?? kpiRGB.Bueno;
      const { bg: [ebr, ebg, ebb] } = kpiRGB[item.estado] ?? kpiRGB.Bueno;
      doc.setFillColor(ebr, ebg, ebb);
      doc.roundedRect(mL, y - 2, 26, 6, 1, 1, 'F');
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(er, eg, eb);
      doc.text(item.estado.toUpperCase(), mL + 13, y + 2.5, { align: 'center' });

      // Nombre ítem
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42);
      doc.text(item.nombre, mL + 32, y + 2);

      // Observación
      if (item.observacion) {
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
        const obsLines = doc.splitTextToSize(item.observacion, cW - 32);
        doc.text(obsLines, mL + 32, y + 8);
      }

      y += rowH + 3;
    });
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(160, 160, 160);
    doc.text('Sistema RCMA — Página ' + i + ' de ' + pages, mL, 290);
    doc.text('Documento confidencial', W - mR, 290, { align: 'right' });
  }

  doc.save(`inspeccion-${(c.titulo ?? 'checklist').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function ChecklistDetail() {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const qc           = useQueryClient();
  const [editOpen,   setEditOpen]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['checklist', id],
    queryFn:  () => db.Checklist.filter({ id }, '-created_at', 1),
    enabled:  !!id,
  });

  const checklist = data && (data as unknown as ChecklistRecord[])[0];

  const updateMutation = useMutation({
    mutationFn: (d: Record<string, unknown>) => db.Checklist.update(id!, d),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['checklist', id] });
      qc.invalidateQueries({ queryKey: ['checklists'] });
      setEditOpen(false);
      toast.success('Inspección actualizada correctamente');
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => db.Checklist.delete(id!),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['checklists'] }); navigate('/checklists'); toast.success('Inspección eliminada'); },
    onError:    () => toast.error('Error al eliminar'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!checklist) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-500">Inspección no encontrada.</p>
        <button onClick={() => navigate('/checklists')} className="mt-4 text-sm text-slate-700 underline">Volver</button>
      </div>
    );
  }

  const items    = (checklist.items ?? []) as ChecklistItem[];
  const statusCfg = STATUS_CONFIG[checklist.overall_status ?? 'bueno'] ?? STATUS_CONFIG.bueno;
  const counts   = {
    Bueno:   items.filter(i => i.estado === 'Bueno').length,
    Regular: items.filter(i => i.estado === 'Regular').length,
    Malo:    items.filter(i => i.estado === 'Malo').length,
    Crítico: items.filter(i => i.estado === 'Crítico').length,
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Nav + Acciones */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button
          onClick={() => navigate('/checklists')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Inspecciones
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => generarPDF(checklist)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Printer className="w-4 h-4" /> Imprimir PDF
          </button>
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Pencil className="w-4 h-4" /> Editar
          </button>
          <button
            onClick={() => setConfirmDel(true)}
            className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Eliminar
          </button>
        </div>
      </div>

      {/* Card principal */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-4">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusCfg.color} ${statusCfg.bg} border ${statusCfg.border}`}>
            {statusCfg.label}
          </span>
          {checklist.material && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {checklist.material.replace(/\(.*\)/, '').trim().toUpperCase()}
            </span>
          )}
        </div>

        {/* Título */}
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{checklist.titulo}</h1>

        {/* Descripción */}
        {checklist.descripcion && (
          <p className="text-sm text-slate-500 italic mb-4">{checklist.descripcion}</p>
        )}

        {/* Info grid */}
        <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Colegio
            </p>
            <p className="font-semibold text-slate-900 text-sm">{checklist.colegio ?? '—'}</p>
            {checklist.territorio && (
              <p className="text-xs text-slate-400">{checklist.territorio}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <User className="w-3 h-3" /> Inspector
            </p>
            <p className="font-semibold text-slate-900 text-sm">
              {checklist.inspector || 'Sin asignar'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Fecha
            </p>
            <p className="font-semibold text-slate-900 text-sm">
              {formatFecha(checklist.fecha ?? checklist.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {Object.entries(counts).map(([label, count]) => {
          const cfg = Object.values(STATUS_CONFIG).find(s => s.label === label) ?? STATUS_CONFIG.bueno;
          return (
            <div key={label} className={`rounded-xl border p-4 text-center ${cfg.bg} ${cfg.border}`}>
              <p className={`text-3xl font-bold ${cfg.color}`}>{count}</p>
              <p className={`text-xs font-bold uppercase tracking-wider mt-1 ${cfg.color}`}>{label}</p>
            </div>
          );
        })}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
          <ClipboardList className="w-4 h-4" />
          Ítems Inspeccionados ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">No hay ítems registrados en esta inspección.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap mt-0.5 ${ITEM_ESTADO_COLORS[item.estado] ?? ITEM_ESTADO_COLORS.Bueno}`}>
                  {item.estado}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{item.nombre}</p>
                  {item.observacion && (
                    <p className="text-xs text-slate-500 mt-0.5">{item.observacion}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal editar */}
      <ChecklistForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={d => updateMutation.mutate(d)}
        checklist={checklist as unknown as Record<string, unknown>}
      />

      {/* Confirmación eliminar */}
      {confirmDel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
            <h3 className="font-bold text-slate-900 mb-2">¿Eliminar inspección?</h3>
            <p className="text-sm text-slate-500 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDel(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancelar</button>
              <button
                onClick={() => deleteMutation.mutate()}
                className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
