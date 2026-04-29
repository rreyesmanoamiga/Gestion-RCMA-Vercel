import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Printer, Pencil, Trash2, MapPin, User, Calendar, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import ChecklistForm, { type ChecklistItem } from '@/components/checklists/ChecklistForm';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';

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

// ─── Generador de PDF ─────────────────────────────────────────────────────────
async function generarPDF(c: ChecklistRecord) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, marginL = 20, marginR = 20, contentW = W - marginL - marginR;
  let y = 20;

  // Logo
  try {
    const img = new Image();
    img.src = '/colegio-mano-amiga.png';
    await new Promise(res => { img.onload = res; img.onerror = res; });
    if (img.complete && img.naturalWidth > 0) {
      doc.addImage(img, 'PNG', marginL, y, 30, 30);
    }
  } catch { /* sin logo */ }

  // Encabezado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('Reporte de Inspección — Sistema RCMA', marginL + 34, y + 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generado el ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}`, marginL + 34, y + 14);
  y += 36;

  // Línea divisoria
  doc.setDrawColor(220, 220, 220);
  doc.line(marginL, y, W - marginR, y);
  y += 8;

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(c.titulo ?? 'Sin título', marginL, y);
  y += 8;

  // Badges de estado y material
  const statusLabel = STATUS_CONFIG[c.overall_status ?? 'bueno']?.label ?? 'Bueno';
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  // Estado badge
  const colores: Record<string, [number, number, number]> = {
    bueno:   [22, 163, 74], regular: [202, 138, 4],
    malo:    [234, 88, 12], critico: [220, 38, 38],
  };
  const [r, g, b] = colores[c.overall_status ?? 'bueno'] ?? colores.bueno;
  doc.setFillColor(r, g, b);
  doc.roundedRect(marginL, y, 20, 6, 1, 1, 'F');
  doc.text(statusLabel, marginL + 2, y + 4.2);
  if (c.material) {
    doc.setFillColor(71, 85, 105);
    doc.roundedRect(marginL + 23, y, 40, 6, 1, 1, 'F');
    doc.text(c.material.replace(/\(.*\)/, '').trim().toUpperCase(), marginL + 25, y + 4.2);
  }
  y += 12;

  // Descripción
  if (c.descripcion) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const descLines = doc.splitTextToSize(c.descripcion, contentW);
    doc.text(descLines, marginL, y);
    y += descLines.length * 5 + 4;
  }

  // Info grid
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginL, y, contentW, 20, 2, 2, 'FD');
  const colW = contentW / 3;
  const infoItems = [
    { icon: 'Colegio', label: c.colegio ?? '—', sub: c.territorio ?? '' },
    { icon: 'Inspector', label: c.inspector || 'Sin asignar', sub: '' },
    { icon: 'Fecha', label: formatFechaCorta(c.fecha ?? c.created_at), sub: '' },
  ];
  infoItems.forEach((item, i) => {
    const x = marginL + i * colW + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(item.icon.toUpperCase(), x, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(item.label, x, y + 11);
    if (item.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(item.sub, x, y + 16);
    }
  });
  y += 26;

  // Resumen de condiciones
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Resumen de Condiciones', marginL, y);
  y += 6;

  const items = (c.items ?? []) as ChecklistItem[];
  const counts = {
    Bueno:   items.filter(i => i.estado === 'Bueno').length,
    Regular: items.filter(i => i.estado === 'Regular').length,
    Malo:    items.filter(i => i.estado === 'Malo').length,
    Crítico: items.filter(i => i.estado === 'Crítico').length,
  };
  const kpiW = contentW / 4;
  const kpiColors: Record<string, [number, number, number]> = {
    Bueno: [240, 253, 244], Regular: [254, 252, 232], Malo: [255, 247, 237], Crítico: [254, 242, 242],
  };
  const kpiText: Record<string, [number, number, number]> = {
    Bueno: [22, 163, 74], Regular: [202, 138, 4], Malo: [234, 88, 12], Crítico: [220, 38, 38],
  };
  Object.entries(counts).forEach(([label, count], i) => {
    const x = marginL + i * kpiW;
    const [br, bg, bb] = kpiColors[label];
    const [tr, tg, tb] = kpiText[label];
    doc.setFillColor(br, bg, bb);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(x, y, kpiW - 2, 18, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(tr, tg, tb);
    doc.text(String(count), x + kpiW / 2 - 2, y + 11, { align: 'center' });
    doc.setFontSize(7);
    doc.text(label.toUpperCase(), x + kpiW / 2 - 2, y + 16, { align: 'center' });
  });
  y += 24;

  // Items inspeccionados
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Items Inspeccionados', marginL, y);
  y += 6;

  if (items.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text('No hay items registrados en esta inspección.', marginL, y);
    y += 8;
  } else {
    items.forEach(item => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(marginL, y, contentW, item.observacion ? 14 : 10, 1, 1, 'FD');

      // Estado badge
      const [ir, ig, ib] = kpiText[item.estado] ?? kpiText.Bueno;
      doc.setFillColor(...(kpiColors[item.estado] ?? kpiColors.Bueno) as [number, number, number]);
      doc.roundedRect(marginL + 2, y + 2, 18, 6, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(ir, ig, ib);
      doc.text(item.estado.toUpperCase(), marginL + 3, y + 6.2);

      // Nombre
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(item.nombre, marginL + 23, y + 6.2);

      // Observación
      if (item.observacion) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(item.observacion, marginL + 23, y + 11.5);
      }

      y += (item.observacion ? 14 : 10) + 2;
    });
  }

  // Footer
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(`Sistema RCMA — Página 1 de 1`, marginL, 285);
  doc.text('Documento confidencial', W - marginR, 285, { align: 'right' });

  doc.save(`inspeccion-${(c.titulo ?? 'checklist').toLowerCase().replace(/\s+/g, '-')}.pdf`);
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
