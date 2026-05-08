import React, { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FileText, Plus, X, Save, Trash2, Search, ChevronRight,
  CheckCircle2, AlertTriangle, TrendingDown, HelpCircle,
  BarChart3, Building2, Package, ArrowLeft, Pencil
} from 'lucide-react';

// ─── Estilos reutilizables ────────────────────────────────────────────────────
const inputClass  = 'w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900';
const labelClass  = 'block text-xs font-bold text-slate-500 uppercase mb-1';
const selectClass = 'w-full h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Cotizacion {
  id: string;
  folio: string;
  nombre: string;
  tipo: string;
  proveedor?: string;
  colegio?: string;
  estado: string;
  total_cotizado: number;
  notas?: string;
  created_at: string;
  updated_at: string;
}

interface CotizacionResumen extends Cotizacion {
  total_conceptos: number;
  conceptos_ok: number;
  conceptos_altos: number;
  conceptos_bajos: number;
  conceptos_sin_ref: number;
}

interface Concepto {
  id: string;
  cotizacion_id: string;
  orden: number;
  descripcion: string;
  marca?: string;
  unidad: string;
  cantidad: number;
  precio_unitario: number;
  precio_total: number;
  precio_ref_id?: number;
  ref_total_min?: number;
  ref_total_max?: number;
  ref_promedio?: number;
  resultado: string;
  porcentaje_diff?: number;
  notas_analisis?: string;
}

interface PrecioRef {
  id: number;
  categoria: string;
  subcategoria: string;
  concepto: string;
  marca: string;
  unidad: string;
  total_min: number;
  total_max: number;
  total_promedio: number;
}

// ─── Badge de resultado ───────────────────────────────────────────────────────
function ResultBadge({ resultado, pct }: { resultado: string; pct?: number }) {
  if (resultado === 'Dentro del rango') return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
      <CheckCircle2 className="w-3 h-3" /> Dentro del rango
      {pct !== undefined && <span className="text-emerald-500 font-normal">({pct > 0 ? '+' : ''}{pct}%)</span>}
    </span>
  );
  if (resultado === 'Precio alto') return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
      <AlertTriangle className="w-3 h-3" /> Precio alto
      {pct !== undefined && <span className="text-red-500 font-normal">(+{pct}%)</span>}
    </span>
  );
  if (resultado === 'Precio bajo') return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
      <TrendingDown className="w-3 h-3" /> Precio bajo
      {pct !== undefined && <span className="text-amber-500 font-normal">({pct}%)</span>}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
      <HelpCircle className="w-3 h-3" /> Sin referencia
    </span>
  );
}

// ─── Badge de estado ──────────────────────────────────────────────────────────
function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    Borrador:  'bg-slate-100 text-slate-600',
    Analizada: 'bg-blue-100 text-blue-700',
    Aprobada:  'bg-emerald-100 text-emerald-700',
    Rechazada: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${map[estado] ?? 'bg-slate-100 text-slate-600'}`}>
      {estado}
    </span>
  );
}

// ─── Formateo ─────────────────────────────────────────────────────────────────
const fmtMXN = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: Nueva / Editar Cotización
// ═══════════════════════════════════════════════════════════════════════════════
function CotizacionForm({ onClose, onSave, initial }: {
  onClose: () => void;
  onSave: (data: Partial<Cotizacion>) => void;
  initial?: Partial<Cotizacion>;
}) {
  const [form, setForm] = useState({
    nombre:    initial?.nombre    ?? '',
    tipo:      initial?.tipo      ?? 'Obra',
    proveedor: initial?.proveedor ?? '',
    colegio:   initial?.colegio   ?? '',
    estado:    initial?.estado    ?? 'Borrador',
    notas:     initial?.notas     ?? '',
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">
              {initial ? 'Editar cotización' : 'Nueva cotización'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">El folio se genera automáticamente</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={labelClass}>Nombre del proyecto / obra *</label>
            <input className={inputClass} value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              placeholder="Ej. Remodelación aulas Primaria" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tipo *</label>
              <select className={selectClass} value={form.tipo}
                onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
                <option>Obra</option>
                <option>Mantenimiento</option>
                <option>Mixto</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Estado</label>
              <select className={selectClass} value={form.estado}
                onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>
                <option>Borrador</option>
                <option>Analizada</option>
                <option>Aprobada</option>
                <option>Rechazada</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Proveedor</label>
            <input className={inputClass} value={form.proveedor}
              onChange={e => setForm(p => ({ ...p, proveedor: e.target.value }))}
              placeholder="Nombre del proveedor" />
          </div>
          <div>
            <label className={labelClass}>Colegio MA</label>
            <input className={inputClass} value={form.colegio}
              onChange={e => setForm(p => ({ ...p, colegio: e.target.value }))}
              placeholder="Ej. MA Monterrey" />
          </div>
          <div>
            <label className={labelClass}>Notas generales</label>
            <textarea className={inputClass} rows={2} value={form.notas}
              onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
              placeholder="Observaciones..." />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
            Cancelar
          </button>
          <button onClick={() => { if (!form.nombre) { toast.error('El nombre es requerido'); return; } onSave(form); }}
            className="px-4 py-2 text-sm font-bold bg-slate-900 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2">
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: Agregar Concepto
// ═══════════════════════════════════════════════════════════════════════════════
function ConceptoForm({ cotizacionId, orden, onClose, onSave }: {
  cotizacionId: string;
  orden: number;
  onClose: () => void;
  onSave: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [refSeleccionada, setRefSeleccionada] = useState<PrecioRef | null>(null);
  const [form, setForm] = useState({
    descripcion: '', marca: '', unidad: '', cantidad: '', precio_unitario: '',
  });

  // Buscar en precios_referencia
  const { data: referencias = [] } = useQuery<PrecioRef[]>({
    queryKey: ['precios-ref', busqueda],
    queryFn: async () => {
      if (busqueda.length < 2) return [];
      const { data, error } = await supabase
        .from('v_precios_referencia')
        .select('id,categoria,subcategoria,concepto,marca,unidad,total_min,total_max,total_promedio')
        .ilike('concepto', `%${busqueda}%`)
        .eq('activo', true)
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
    enabled: busqueda.length >= 2,
  });

  const aplicarRef = (ref: PrecioRef) => {
    setRefSeleccionada(ref);
    setForm(p => ({
      ...p,
      descripcion: p.descripcion || ref.concepto,
      marca: ref.marca !== 'Genérico' ? ref.marca : p.marca,
      unidad: ref.unidad,
    }));
    setBusqueda('');
  };

  const handleSave = async () => {
    if (!form.descripcion || !form.unidad || !form.cantidad || !form.precio_unitario) {
      toast.error('Complete todos los campos obligatorios'); return;
    }
    const payload: Record<string, unknown> = {
      cotizacion_id:   cotizacionId,
      orden,
      descripcion:     form.descripcion,
      marca:           form.marca || null,
      unidad:          form.unidad,
      cantidad:        parseFloat(form.cantidad),
      precio_unitario: parseFloat(form.precio_unitario),
      precio_ref_id:   refSeleccionada?.id ?? null,
      ref_total_min:   refSeleccionada?.total_min ?? null,
      ref_total_max:   refSeleccionada?.total_max ?? null,
      ref_promedio:    refSeleccionada?.total_promedio ?? null,
    };

    // Calcular resultado inmediato
    if (refSeleccionada) {
      const pu = parseFloat(form.precio_unitario);
      const diff = ((pu - refSeleccionada.total_promedio) / refSeleccionada.total_promedio) * 100;
      payload.porcentaje_diff = Math.round(diff * 100) / 100;
      if (pu >= refSeleccionada.total_min && pu <= refSeleccionada.total_max) {
        payload.resultado = 'Dentro del rango';
        payload.notas_analisis = `Precio dentro del rango de mercado (${diff > 0 ? '+' : ''}${payload.porcentaje_diff}% vs promedio).`;
      } else if (pu > refSeleccionada.total_max) {
        payload.resultado = 'Precio alto';
        payload.notas_analisis = `Precio ${Math.abs(diff).toFixed(1)}% por encima del promedio. Rango esperado: ${fmtMXN(refSeleccionada.total_min)} – ${fmtMXN(refSeleccionada.total_max)}.`;
      } else {
        payload.resultado = 'Precio bajo';
        payload.notas_analisis = `Precio ${Math.abs(diff).toFixed(1)}% por debajo del promedio. Verificar calidad o alcance.`;
      }
    } else {
      payload.resultado = 'Sin referencia';
      payload.notas_analisis = 'No se encontró precio de referencia para este concepto.';
    }

    const { error } = await supabase.from('cotizacion_conceptos').insert(payload);
    if (error) { toast.error('Error al guardar concepto'); return; }
    toast.success('Concepto agregado');
    onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-base font-black text-slate-900">Agregar concepto #{orden}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Buscador de precios de referencia */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-bold text-blue-700 uppercase mb-2 flex items-center gap-1.5">
              <Search className="w-3 h-3" /> Buscar en precios de referencia (opcional)
            </p>
            <input className={inputClass} value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Ej. impermeabilización, tinaco, tablero..." />
            {referencias.length > 0 && (
              <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {referencias.map(r => (
                  <button key={r.id} onClick={() => aplicarRef(r)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors text-xs">
                    <span className="font-bold text-slate-800">{r.concepto}</span>
                    {r.marca !== 'Genérico' && <span className="text-blue-600 ml-1">· {r.marca}</span>}
                    <span className="text-slate-500 ml-1">· {r.unidad}</span>
                    <span className="float-right text-emerald-700 font-bold">
                      {fmtMXN(r.total_min)} – {fmtMXN(r.total_max)}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {refSeleccionada && (
              <div className="mt-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                <span className="text-xs text-emerald-700 font-bold">
                  ✓ Ref: {refSeleccionada.concepto} — {fmtMXN(refSeleccionada.total_min)} a {fmtMXN(refSeleccionada.total_max)} / {refSeleccionada.unidad}
                </span>
                <button onClick={() => setRefSeleccionada(null)}
                  className="text-emerald-500 hover:text-emerald-700">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Datos del concepto */}
          <div>
            <label className={labelClass}>Descripción del concepto *</label>
            <input className={inputClass} value={form.descripcion}
              onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
              placeholder="Tal como aparece en la cotización del proveedor" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Marca (si aplica)</label>
              <input className={inputClass} value={form.marca}
                onChange={e => setForm(p => ({ ...p, marca: e.target.value }))}
                placeholder="Ej. Rotoplas, Comex..." />
            </div>
            <div>
              <label className={labelClass}>Unidad *</label>
              <input className={inputClass} value={form.unidad}
                onChange={e => setForm(p => ({ ...p, unidad: e.target.value }))}
                placeholder="m², ml, pieza, kg..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Cantidad *</label>
              <input className={inputClass} type="number" min="0" step="0.01"
                value={form.cantidad}
                onChange={e => setForm(p => ({ ...p, cantidad: e.target.value }))}
                placeholder="0.00" />
            </div>
            <div>
              <label className={labelClass}>Precio unitario MXN *</label>
              <input className={inputClass} type="number" min="0" step="0.01"
                value={form.precio_unitario}
                onChange={e => setForm(p => ({ ...p, precio_unitario: e.target.value }))}
                placeholder="0.00" />
            </div>
          </div>

          {/* Preview del análisis */}
          {form.precio_unitario && refSeleccionada && (() => {
            const pu = parseFloat(form.precio_unitario);
            const dentro = pu >= refSeleccionada.total_min && pu <= refSeleccionada.total_max;
            const alto   = pu > refSeleccionada.total_max;
            const diff   = ((pu - refSeleccionada.total_promedio) / refSeleccionada.total_promedio * 100).toFixed(1);
            return (
              <div className={`rounded-xl p-4 border ${dentro ? 'bg-emerald-50 border-emerald-200' : alto ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className={`text-xs font-bold ${dentro ? 'text-emerald-700' : alto ? 'text-red-700' : 'text-amber-700'}`}>
                  {dentro ? '✅ Dentro del rango de mercado' : alto ? '⚠️ Precio por encima del mercado' : '⬇️ Precio por debajo del mercado'}
                </p>
                <p className={`text-xs mt-1 ${dentro ? 'text-emerald-600' : alto ? 'text-red-600' : 'text-amber-600'}`}>
                  Tu precio: {fmtMXN(pu)} · Rango: {fmtMXN(refSeleccionada.total_min)} – {fmtMXN(refSeleccionada.total_max)} · Diferencia: {Number(diff) > 0 ? '+' : ''}{diff}%
                </p>
              </div>
            );
          })()}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
            Cancelar
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 text-sm font-bold bg-slate-900 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISTA DETALLE DE COTIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════════
function DetalleCotizacion({ cotizacion, onBack }: { cotizacion: Cotizacion; onBack: () => void }) {
  const qc = useQueryClient();
  const [showConceptoForm, setShowConceptoForm] = useState(false);

  const { data: conceptos = [], isLoading } = useQuery<Concepto[]>({
    queryKey: ['conceptos', cotizacion.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cotizacion_conceptos')
        .select('*')
        .eq('cotizacion_id', cotizacion.id)
        .order('orden');
      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteConcepto = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cotizacion_conceptos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conceptos', cotizacion.id] });
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      toast.success('Concepto eliminado');
    },
  });

  const stats = useMemo(() => ({
    ok:       conceptos.filter(c => c.resultado === 'Dentro del rango').length,
    altos:    conceptos.filter(c => c.resultado === 'Precio alto').length,
    bajos:    conceptos.filter(c => c.resultado === 'Precio bajo').length,
    sinRef:   conceptos.filter(c => c.resultado === 'Sin referencia').length,
    total:    conceptos.reduce((s, c) => s + (c.precio_total ?? 0), 0),
  }), [conceptos]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={onBack}
          className="mt-1 p-2 hover:bg-slate-100 rounded-lg flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-slate-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{cotizacion.folio}</span>
            <EstadoBadge estado={cotizacion.estado} />
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-0.5">{cotizacion.nombre}</h1>
          <div className="flex gap-3 mt-1 text-xs text-slate-500">
            {cotizacion.proveedor && <span>🏢 {cotizacion.proveedor}</span>}
            {cotizacion.colegio   && <span>🏫 {cotizacion.colegio}</span>}
            <span>📋 {cotizacion.tipo}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 uppercase font-bold">Total cotizado</p>
          <p className="text-2xl font-black text-slate-900">{fmtMXN(stats.total)}</p>
        </div>
      </div>

      {/* KPIs semáforo */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Dentro del rango', value: stats.ok,     color: 'emerald', icon: '✅' },
          { label: 'Precio alto',      value: stats.altos,  color: 'red',     icon: '⚠️' },
          { label: 'Precio bajo',      value: stats.bajos,  color: 'amber',   icon: '⬇️' },
          { label: 'Sin referencia',   value: stats.sinRef, color: 'slate',   icon: '❓' },
        ].map(k => (
          <div key={k.label} className={`bg-white rounded-xl border border-${k.color}-200 px-4 py-3`}>
            <p className="text-xs text-slate-500">{k.icon} {k.label}</p>
            <p className={`text-2xl font-black text-${k.color}-600 mt-1`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabla de conceptos */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-700">
            Conceptos ({conceptos.length})
          </h2>
          <button onClick={() => setShowConceptoForm(true)}
            className="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-700">
            <Plus className="w-3 h-3" /> Agregar concepto
          </button>
        </div>

        {isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Cargando...</div>
        ) : conceptos.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Sin conceptos. Agregue el primero.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {/* Header */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-2 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <div className="col-span-1">#</div>
              <div className="col-span-3">Concepto</div>
              <div className="col-span-1">Marca</div>
              <div className="col-span-1">Unid.</div>
              <div className="col-span-1 text-right">Cant.</div>
              <div className="col-span-1 text-right">P.Unit.</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-2">Resultado</div>
              <div className="col-span-1"></div>
            </div>
            {conceptos.map(c => (
              <div key={c.id} className="px-5 py-3 grid grid-cols-12 gap-2 items-start hover:bg-slate-50/50">
                <div className="col-span-1">
                  <span className="text-xs font-black text-slate-400">{c.orden}</span>
                </div>
                <div className="col-span-3">
                  <p className="text-xs font-bold text-slate-800 leading-tight">{c.descripcion}</p>
                  {c.notas_analisis && (
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{c.notas_analisis}</p>
                  )}
                </div>
                <div className="col-span-1">
                  <span className="text-xs text-slate-500">{c.marca || '—'}</span>
                </div>
                <div className="col-span-1">
                  <span className="text-xs text-slate-600">{c.unidad}</span>
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-xs text-slate-700">{c.cantidad}</span>
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-xs font-bold text-slate-800">{fmtMXN(c.precio_unitario)}</span>
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-xs font-black text-slate-900">{fmtMXN(c.precio_total)}</span>
                </div>
                <div className="col-span-2">
                  <ResultBadge resultado={c.resultado} pct={c.porcentaje_diff ?? undefined} />
                </div>
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => deleteConcepto.mutate(c.id)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            {/* Totales */}
            <div className="px-5 py-3 bg-slate-50 flex justify-end">
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase font-bold">Total general</p>
                <p className="text-lg font-black text-slate-900">{fmtMXN(stats.total)}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {showConceptoForm && (
        <ConceptoForm
          cotizacionId={cotizacion.id}
          orden={conceptos.length + 1}
          onClose={() => setShowConceptoForm(false)}
          onSave={() => {
            qc.invalidateQueries({ queryKey: ['conceptos', cotizacion.id] });
            qc.invalidateQueries({ queryKey: ['cotizaciones'] });
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function Cotizaciones() {
  const qc = useQueryClient();
  const [showForm,    setShowForm]    = useState(false);
  const [editando,    setEditando]    = useState<Cotizacion | null>(null);
  const [detalle,     setDetalle]     = useState<Cotizacion | null>(null);
  const [filtroTipo,  setFiltroTipo]  = useState('');
  const [filtroEst,   setFiltroEst]   = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: cotizaciones = [], isLoading } = useQuery<CotizacionResumen[]>({
    queryKey: ['cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_cotizaciones_resumen')
        .select('*');
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const createCot = useMutation({
    mutationFn: async (data: Partial<Cotizacion>) => {
      const { error } = await supabase.from('cotizaciones').insert({ ...data, folio: '' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cotizaciones'] }); toast.success('Cotización creada'); setShowForm(false); },
    onError:   () => toast.error('Error al crear cotización'),
  });

  const updateCot = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Cotizacion> }) => {
      const { error } = await supabase.from('cotizaciones').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cotizaciones'] }); toast.success('Cotización actualizada'); setEditando(null); },
    onError:   () => toast.error('Error al actualizar'),
  });

  const deleteCot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cotizaciones').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cotizaciones'] }); toast.success('Cotización eliminada'); },
    onError:   () => toast.error('Error al eliminar'),
  });

  // ── Filtros ───────────────────────────────────────────────────────────────────
  const filtradas = useMemo(() => cotizaciones.filter(c =>
    (!filtroTipo || c.tipo    === filtroTipo) &&
    (!filtroEst  || c.estado  === filtroEst)
  ), [cotizaciones, filtroTipo, filtroEst]);

  // ── KPIs globales ─────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    total:     cotizaciones.length,
    borradores:cotizaciones.filter(c => c.estado === 'Borrador').length,
    aprobadas: cotizaciones.filter(c => c.estado === 'Aprobada').length,
    alerta:    cotizaciones.filter(c => c.conceptos_altos > 0).length,
  }), [cotizaciones]);

  // ── Vista detalle ─────────────────────────────────────────────────────────────
  if (detalle) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <DetalleCotizacion
          cotizacion={detalle}
          onBack={() => setDetalle(null)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Analizador de Cotizaciones</h1>
          <p className="text-sm text-slate-500 mt-1">
            Compare precios de proveedores contra el mercado nacional de construcción y mantenimiento
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-700 shadow-sm">
          <Plus className="w-4 h-4" /> Nueva cotización
        </button>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total',      value: kpis.total,      color: 'slate',   icon: FileText   },
          { label: 'Borradores', value: kpis.borradores, color: 'slate',   icon: FileText   },
          { label: 'Aprobadas',  value: kpis.aprobadas,  color: 'emerald', icon: CheckCircle2 },
          { label: 'Con alertas',value: kpis.alerta,     color: 'red',     icon: AlertTriangle },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase mb-2">
              <k.icon className={`w-3.5 h-3.5 text-${k.color}-500`} />
              {k.label}
            </div>
            <p className={`text-3xl font-black text-${k.color}-600`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filtros ── */}
      <div className="flex gap-3 flex-wrap">
        <select className="h-9 px-3 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 focus:ring-2 focus:ring-slate-400 focus:outline-none"
          value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option>Obra</option><option>Mantenimiento</option><option>Mixto</option>
        </select>
        <select className="h-9 px-3 border border-slate-300 rounded-lg text-sm bg-white text-slate-700 focus:ring-2 focus:ring-slate-400 focus:outline-none"
          value={filtroEst} onChange={e => setFiltroEst(e.target.value)}>
          <option value="">Todos los estados</option>
          <option>Borrador</option><option>Analizada</option><option>Aprobada</option><option>Rechazada</option>
        </select>
      </div>

      {/* ── Tabla ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Cargando cotizaciones...</div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center">
            <BarChart3 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">Sin cotizaciones</p>
            <p className="text-slate-400 text-xs mt-1">Cree la primera con el botón de arriba</p>
          </div>
        ) : (
          <>
            {/* Header tabla */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <div className="col-span-2">Folio</div>
              <div className="col-span-3">Nombre</div>
              <div className="col-span-1">Tipo</div>
              <div className="col-span-2">Proveedor</div>
              <div className="col-span-1">Estado</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1">Semáforo</div>
              <div className="col-span-1"></div>
            </div>

            <div className="divide-y divide-slate-100">
              {filtradas.map(c => (
                <div key={c.id}
                  className="px-5 py-4 grid grid-cols-12 gap-2 items-center hover:bg-slate-50/50 transition-colors">
                  <div className="col-span-2">
                    <span className="text-xs font-black text-blue-700">{c.folio}</span>
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm font-bold text-slate-800 leading-tight">{c.nombre}</p>
                    {c.colegio && <p className="text-[10px] text-slate-400 mt-0.5">{c.colegio}</p>}
                  </div>
                  <div className="col-span-1">
                    <span className="text-xs text-slate-500">{c.tipo}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-slate-600 break-words">{c.proveedor || '—'}</span>
                  </div>
                  <div className="col-span-1">
                    <EstadoBadge estado={c.estado} />
                  </div>
                  <div className="col-span-1 text-right">
                    <span className="text-xs font-black text-slate-900">{fmtMXN(c.total_cotizado)}</span>
                  </div>
                  <div className="col-span-1">
                    {c.total_conceptos > 0 ? (
                      <div className="flex gap-0.5 flex-wrap">
                        {c.conceptos_ok    > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">{c.conceptos_ok}✅</span>}
                        {c.conceptos_altos > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">{c.conceptos_altos}⚠️</span>}
                        {c.conceptos_bajos > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">{c.conceptos_bajos}⬇️</span>}
                        {c.conceptos_sin_ref > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold">{c.conceptos_sin_ref}❓</span>}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-300">Sin conceptos</span>
                    )}
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1">
                    <button onClick={() => setDetalle(c)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg" title="Ver detalle">
                      <ChevronRight className="w-4 h-4 text-slate-500" />
                    </button>
                    <button onClick={() => setEditando(c)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg" title="Editar">
                      <Pencil className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <button onClick={() => {
                      if (confirm(`¿Eliminar "${c.nombre}"? También se eliminarán sus conceptos.`))
                        deleteCot.mutate(c.id);
                    }} className="p-1.5 hover:bg-red-50 rounded-lg" title="Eliminar">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Modales ── */}
      {showForm && (
        <CotizacionForm
          onClose={() => setShowForm(false)}
          onSave={data => createCot.mutate(data)}
        />
      )}
      {editando && (
        <CotizacionForm
          initial={editando}
          onClose={() => setEditando(null)}
          onSave={data => updateCot.mutate({ id: editando.id, data })}
        />
      )}
    </div>
  );
}
