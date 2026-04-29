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

// ─── Generador de PDF (html2canvas) ──────────────────────────────────────────
async function generarPDF(c: ChecklistRecord) {
  const items = (c.items ?? []) as ChecklistItem[];
  const counts = {
    Bueno:   items.filter(i => i.estado === 'Bueno').length,
    Regular: items.filter(i => i.estado === 'Regular').length,
    Malo:    items.filter(i => i.estado === 'Malo').length,
    Crítico: items.filter(i => i.estado === 'Crítico').length,
  };

  const statusLabel = STATUS_CONFIG[c.overall_status ?? 'bueno']?.label ?? 'Bueno';
  const materialCorto = c.material ? c.material.replace(/\(.*\)/, '').trim().toUpperCase() : '';

  const badgeColors: Record<string, string> = {
    bueno:   '#16a34a', regular: '#ca8a04', malo: '#ea580c', critico: '#dc2626',
  };
  const badgeBg: Record<string, string> = {
    bueno: '#f0fdf4', regular: '#fefce8', malo: '#fff7ed', critico: '#fef2f2',
  };
  const badgeColor = badgeColors[c.overall_status ?? 'bueno'] ?? badgeColors.bueno;

  const itemBadgeStyle = (estado: string) => {
    const colors: Record<string, { bg: string; color: string }> = {
      Bueno:   { bg: '#dcfce7', color: '#15803d' },
      Regular: { bg: '#fef9c3', color: '#a16207' },
      Malo:    { bg: '#ffedd5', color: '#c2410c' },
      Crítico: { bg: '#fee2e2', color: '#b91c1c' },
    };
    return colors[estado] ?? colors.Bueno;
  };

  const kpiStyle = (label: string) => {
    const map: Record<string, { bg: string; border: string; color: string }> = {
      Bueno:   { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a' },
      Regular: { bg: '#fefce8', border: '#fde68a', color: '#ca8a04' },
      Malo:    { bg: '#fff7ed', border: '#fed7aa', color: '#ea580c' },
      Crítico: { bg: '#fef2f2', border: '#fecaca', color: '#dc2626' },
    };
    return map[label] ?? map.Bueno;
  };

  const fechaGenerado = format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es });
  const fechaInspeccion = formatFechaCorta(c.fecha ?? c.created_at);

  const itemsHTML = items.length === 0
    ? `<p style="text-align:center;color:#94a3b8;font-style:italic;padding:24px 0;">No hay ítems registrados en esta inspección.</p>`
    : items.map(item => {
        const { bg, color } = itemBadgeStyle(item.estado);
        return `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;">
            <span style="background:${bg};color:${color};font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap;margin-top:1px;">${item.estado.toUpperCase()}</span>
            <div>
              <p style="margin:0;font-weight:700;font-size:13px;color:#0f172a;">${item.nombre}</p>
              ${item.observacion ? `<p style="margin:3px 0 0;font-size:11px;color:#64748b;">${item.observacion}</p>` : ''}
            </div>
          </div>`;
      }).join('');

  const html = `
    <div id="pdf-content" style="width:794px;background:white;padding:40px;font-family:Arial,sans-serif;box-sizing:border-box;">

      <!-- Header con logo -->
      <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:24px;">
        <img src="/colegio-mano-amiga.png" style="width:72px;height:72px;object-fit:contain;" crossorigin="anonymous" />
        <div style="padding-top:6px;">
          <p style="margin:0;font-weight:700;font-size:13px;color:#374151;">Reporte de Inspección — Sistema RCMA</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Generado el ${fechaGenerado}</p>
        </div>
      </div>

      <!-- Línea divisoria -->
      <hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:24px;" />

      <!-- Título -->
      <h1 style="margin:0 0 12px;font-size:26px;font-weight:800;color:#0f172a;">${c.titulo ?? 'Sin título'}</h1>

      <!-- Badges estado + material -->
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <span style="background:${badgeColor};color:white;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;">${statusLabel}</span>
        ${materialCorto ? `<span style="background:#475569;color:white;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;">${materialCorto}</span>` : ''}
      </div>

      <!-- Descripción -->
      ${c.descripcion ? `<p style="margin:0 0 16px;font-size:12px;color:#64748b;font-style:italic;">${c.descripcion}</p>` : ''}

      <!-- Info grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;padding:16px;margin-bottom:24px;">
        <div>
          <p style="margin:0 0 4px;font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Colegio</p>
          <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a;">${c.colegio ?? '—'}</p>
          <p style="margin:0;font-size:10px;color:#94a3b8;">${c.territorio ?? ''}</p>
        </div>
        <div>
          <p style="margin:0 0 4px;font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Inspector</p>
          <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a;">${c.inspector || 'Sin asignar'}</p>
        </div>
        <div>
          <p style="margin:0 0 4px;font-size:9px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Fecha</p>
          <p style="margin:0;font-size:13px;font-weight:700;color:#0f172a;">${fechaInspeccion}</p>
        </div>
      </div>

      <!-- Resumen de condiciones -->
      <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0f172a;">Resumen de Condiciones</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:24px;">
        ${Object.entries(counts).map(([label, count]) => {
          const { bg, border, color } = kpiStyle(label);
          return `
            <div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:16px;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:800;color:${color};">${count}</p>
              <p style="margin:4px 0 0;font-size:10px;font-weight:700;color:${color};text-transform:uppercase;">${label}</p>
            </div>`;
        }).join('')}
      </div>

      <!-- Items inspeccionados -->
      <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#0f172a;">Items Inspeccionados</h2>
      ${itemsHTML}

      <!-- Footer -->
      <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;">
        <p style="margin:0;font-size:10px;color:#94a3b8;">Sistema RCMA — Página 1 de 1</p>
        <p style="margin:0;font-size:10px;color:#94a3b8;">Documento confidencial</p>
      </div>
    </div>`;

  // Renderizar en DOM oculto y capturar con html2canvas
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(container.querySelector('#pdf-content') as HTMLElement, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pdfW = doc.internal.pageSize.getWidth();
    const pdfH = (canvas.height * pdfW) / canvas.width;
    doc.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
    doc.save(`inspeccion-${(c.titulo ?? 'checklist').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
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
