// src/pages/Cotizaciones.tsx
import React, { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import { extraerTextoDePDF } from '../utils/pdfScanner';
import { analizarCotizacion, getCiudadDeColegio, type ResultadoAnalisis } from '../services/costosIA';
import PageHeader from '@/components/shared/PageHeader';
import ColegioSelector from '@/components/shared/ColegioSelector';
import { toast } from 'sonner';
import {
  Upload, FileText, CheckCircle, AlertTriangle, XCircle,
  Brain, TrendingDown, TrendingUp, RefreshCw, ChevronDown,
  ChevronUp, DollarSign, Building2, Clock, Minus, Eye,
  ClipboardList, Loader2, MapPin, Filter,
} from 'lucide-react';

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface AnalisisCotizacion {
  id: string;
  created_at: string;
  folio: string;
  proveedor: string;
  colegio_ubicacion: string;
  total_proveedor: number;
  ahorro_detectado: number;
  estado_aprobacion: 'Aprobada' | 'Revision' | 'Rechazada';
  notas_ia: string;
  desglose_conceptos: ResultadoAnalisis['conceptos'];
  porcentaje_sobrecosto?: number;
  resumen_ejecutivo?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmtMXN = (n: number) =>
  (n ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

// ─── Badges ────────────────────────────────────────────────────────────────────
const EstadoBadge = ({ estado }: { estado: string }) => {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    'Aprobada':  { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle className="w-3 h-3" />, label: 'Aprobada' },
    'Revision':  { cls: 'bg-amber-100 text-amber-700 border-amber-200',       icon: <AlertTriangle className="w-3 h-3" />, label: 'En Revisión' },
    'Revisión':  { cls: 'bg-amber-100 text-amber-700 border-amber-200',       icon: <AlertTriangle className="w-3 h-3" />, label: 'En Revisión' },
    'Rechazada': { cls: 'bg-red-100 text-red-700 border-red-200',             icon: <XCircle className="w-3 h-3" />,      label: 'Rechazada' },
  };
  const cfg = map[estado] ?? { cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: <Minus className="w-3 h-3" />, label: estado };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
};

const MercadoBadge = ({ estado }: { estado: string }) => {
  const map: Record<string, string> = {
    'Precio normal': 'bg-emerald-50 text-emerald-700',
    'Sobrecosto':    'bg-red-50 text-red-700',
    'Precio bajo':   'bg-blue-50 text-blue-700',
    'No verificado': 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${map[estado] ?? 'bg-slate-100 text-slate-500'}`}>
      {estado}
    </span>
  );
};

// ─── Panel de resultados ────────────────────────────────────────────────────────
const ResultadoPanel = ({ analisis, colegio }: { analisis: ResultadoAnalisis; colegio: string }) => {
  const [expanded, setExpanded] = useState(true);
  const ciudad = getCiudadDeColegio(colegio);

  const decisionConfig = {
    'Aprobada':  { bg: 'bg-emerald-50 border-emerald-200', icon: <CheckCircle className="w-5 h-5 text-emerald-600" />, text: 'text-emerald-700' },
    'Revisión':  { bg: 'bg-amber-50 border-amber-200',     icon: <AlertTriangle className="w-5 h-5 text-amber-600" />, text: 'text-amber-700' },
    'Rechazada': { bg: 'bg-red-50 border-red-200',         icon: <XCircle className="w-5 h-5 text-red-600" />,         text: 'text-red-700' },
  }[analisis.decision] ?? { bg: 'bg-slate-50 border-slate-200', icon: null, text: 'text-slate-700' };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`border ${decisionConfig.bg} px-5 py-4 flex items-start justify-between gap-4`}>
        <div className="flex items-start gap-3">
          {decisionConfig.icon}
          <div>
            <p className={`font-black text-base uppercase tracking-tight ${decisionConfig.text}`}>
              {analisis.decision} — {analisis.proveedor}
            </p>
            <p className="text-sm text-slate-600 mt-0.5">{analisis.resumen_ejecutivo || analisis.notas}</p>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3" />Evaluado contra mercado de: <span className="font-bold text-slate-500">{ciudad}</span>
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-400 uppercase font-bold">Total cotización</p>
          <p className="text-xl font-black text-slate-900">{fmtMXN(analisis.total)}</p>
          {analisis.ahorro > 0 && (
            <p className="text-xs text-emerald-600 font-bold flex items-center gap-1 justify-end">
              <TrendingDown className="w-3 h-3" />Ahorro potencial {fmtMXN(analisis.ahorro)}
            </p>
          )}
        </div>
      </div>

      <div className="px-5 py-3 flex flex-wrap gap-4 border-b border-slate-100 bg-slate-50 text-sm">
        <span><span className="text-slate-400 text-xs font-bold uppercase">Folio </span>{analisis.folio}</span>
        {analisis.porcentaje_sobrecosto > 0 && (
          <span className="text-red-600 font-bold flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />{analisis.porcentaje_sobrecosto}% sobre mercado local
          </span>
        )}
      </div>

      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-3 flex items-center justify-between text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />Desglose de conceptos ({analisis.conceptos?.length ?? 0})
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && analisis.conceptos && analisis.conceptos.length > 0 && (
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Descripción', 'Unidad', 'Cant.', 'P.U.', 'Total', 'Mercado local', 'Var.'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {analisis.conceptos.map((c, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800 max-w-[200px] truncate" title={c.descripcion}>{c.descripcion}</td>
                  <td className="px-3 py-2 text-slate-500">{c.unidad}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.cantidad}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMXN(c.precio_unitario)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtMXN(c.total)}</td>
                  <td className="px-3 py-2"><MercadoBadge estado={c.estado_mercado} /></td>
                  <td className={`px-3 py-2 text-right font-bold tabular-nums ${
                    c.porcentaje_variacion > 0 ? 'text-red-600' : c.porcentaje_variacion < 0 ? 'text-emerald-600' : 'text-slate-400'
                  }`}>
                    {c.porcentaje_variacion > 0 ? '+' : ''}{c.porcentaje_variacion}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Modal detalle historial ────────────────────────────────────────────────────
const DetalleModal = ({ registro, onClose }: { registro: AnalisisCotizacion; onClose: () => void }) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-white rounded-xl border border-slate-200 max-w-3xl w-full max-h-[90vh] overflow-y-auto"
      onClick={e => e.stopPropagation()}>
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
            {fmtDate(registro.created_at)}
            <span className="mx-1">·</span>
            <MapPin className="w-3 h-3" />
            {registro.colegio_ubicacion}
            {registro.colegio_ubicacion && (
              <span className="text-slate-300 mx-1">—</span>
            )}
            <span className="text-slate-400">{getCiudadDeColegio(registro.colegio_ubicacion)}</span>
          </p>
          <h3 className="text-lg font-black text-slate-900 uppercase">{registro.proveedor}</h3>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
          <XCircle className="w-5 h-5 text-slate-400" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total cotización</p>
            <p className="text-xl font-black text-slate-900">{fmtMXN(registro.total_proveedor)}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3">
            <p className="text-xs font-bold text-emerald-500 uppercase mb-1">Ahorro detectado</p>
            <p className="text-xl font-black text-emerald-700">{fmtMXN(registro.ahorro_detectado)}</p>
          </div>
          <div className="rounded-lg p-3 flex flex-col items-start justify-center border border-slate-200">
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Decisión</p>
            <EstadoBadge estado={registro.estado_aprobacion} />
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase mb-1">Notas del análisis</p>
          <p className="text-sm text-slate-700">{registro.notas_ia}</p>
        </div>
        {registro.desglose_conceptos && registro.desglose_conceptos.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <p className="text-xs font-black text-slate-400 uppercase px-4 py-2.5 bg-slate-50 border-b border-slate-200">
              Desglose — {registro.desglose_conceptos.length} conceptos
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Descripción','Und.','Cant.','P.U.','Total','Mercado'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-black text-slate-400 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {registro.desglose_conceptos.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 max-w-[180px] truncate font-medium" title={c.descripcion}>{c.descripcion}</td>
                      <td className="px-3 py-2 text-slate-500">{c.unidad}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.cantidad}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMXN(c.precio_unitario)}</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{fmtMXN(c.total)}</td>
                      <td className="px-3 py-2"><MercadoBadge estado={c.estado_mercado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);

// ─── Componente principal ───────────────────────────────────────────────────────
export const Cotizaciones = () => {
  const [archivo, setArchivo]       = useState<File | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [resultado, setResultado]   = useState<ResultadoAnalisis | null>(null);
  const [detalle, setDetalle]       = useState<AnalisisCotizacion | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  // Selector de colegio
  const [territorio, setTerritorio] = useState('');
  const [colegio, setColegio]       = useState('');

  // Filtro historial
  const [filtroEstado, setFiltroEstado]   = useState('');
  const [filtroColegio, setFiltroColegio] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const ciudadSeleccionada = colegio ? getCiudadDeColegio(colegio) : null;

  // ─── Historial desde Supabase ────────────────────────────────────────────
  const { data: historial = [], isLoading: loadingHistorial, refetch } = useQuery<AnalisisCotizacion[]>({
    queryKey: ['analisis_cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analisis_cotizaciones')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const historialFiltrado = historial.filter(h => {
    if (filtroEstado   && h.estado_aprobacion !== filtroEstado)   return false;
    if (filtroColegio  && h.colegio_ubicacion !== filtroColegio)  return false;
    return true;
  });

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const kpis = {
    total:      historial.length,
    aprobadas:  historial.filter(h => h.estado_aprobacion === 'Aprobada').length,
    revision:   historial.filter(h => h.estado_aprobacion === 'Revisión' || h.estado_aprobacion === 'Revision').length,
    rechazadas: historial.filter(h => h.estado_aprobacion === 'Rechazada').length,
    ahorro:     historial.reduce((s, h) => s + (h.ahorro_detectado ?? 0), 0),
  };

  // ─── Drag & Drop ─────────────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    const f = e.dataTransfer.files?.[0];
    if (f?.type === 'application/pdf') { setArchivo(f); setResultado(null); }
    else toast.error('Solo se aceptan archivos PDF');
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setArchivo(f); setResultado(null); }
  };

  // ─── Proceso principal ────────────────────────────────────────────────────
  const procesarConIA = async () => {
    if (!archivo)  return toast.error('Selecciona un archivo PDF primero');
    if (!colegio)  return toast.error('Selecciona el colegio al que corresponde esta cotización');

    setAnalizando(true);
    setResultado(null);

    try {
      toast.info('Extrayendo texto del PDF…');
      const texto = await extraerTextoDePDF(archivo);

      if (!texto || texto.length < 50) {
        throw new Error('No se pudo extraer texto del PDF. ¿Es un PDF escaneado como imagen? Usa un PDF con texto seleccionable.');
      }

      toast.info(`Analizando precios para ${colegio} (${getCiudadDeColegio(colegio)})…`);
      const analisis = await analizarCotizacion(texto, colegio);
      setResultado(analisis);

      toast.info('Guardando en base de datos…');
      const { error } = await supabase
        .from('analisis_cotizaciones')
        .insert([{
          folio:                 analisis.folio,
          proveedor:             analisis.proveedor,
          estado_aprobacion:     analisis.decision,
          total_proveedor:       analisis.total,
          ahorro_detectado:      analisis.ahorro ?? 0,
          notas_ia:              analisis.notas,
          desglose_conceptos:    analisis.conceptos ?? [],
          porcentaje_sobrecosto: analisis.porcentaje_sobrecosto ?? 0,
          resumen_ejecutivo:     analisis.resumen_ejecutivo ?? '',
          colegio_ubicacion:     colegio,
        }]);

      if (error) throw error;

      toast.success('¡Análisis completado y guardado!');
      queryClient.invalidateQueries({ queryKey: ['analisis_cotizaciones'] });
      setArchivo(null);
      if (inputRef.current) inputRef.current.value = '';

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al procesar el archivo');
    } finally {
      setAnalizando(false);
    }
  };

  // ─── Colegios únicos para filtro del historial ────────────────────────────
  const colegiosEnHistorial = [...new Set(historial.map(h => h.colegio_ubicacion).filter(Boolean))];

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Analizador de Cotizaciones"
        subtitle="La IA revisa precios contra el mercado local de cada plantel y detecta sobrecostos"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total analizadas', value: kpis.total,           color: 'bg-slate-900 text-white',                                  icon: <Brain className="w-4 h-4" /> },
          { label: 'Aprobadas',        value: kpis.aprobadas,       color: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: <CheckCircle className="w-4 h-4" /> },
          { label: 'En revisión',      value: kpis.revision,        color: 'bg-amber-50 text-amber-700 border border-amber-200',       icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Rechazadas',       value: kpis.rechazadas,      color: 'bg-red-50 text-red-700 border border-red-200',             icon: <XCircle className="w-4 h-4" /> },
          { label: 'Ahorro acumulado', value: fmtMXN(kpis.ahorro),  color: 'bg-blue-50 text-blue-700 border border-blue-200',          icon: <TrendingDown className="w-4 h-4" /> },
        ].map(k => (
          <div key={k.label} className={`rounded-xl p-4 ${k.color}`}>
            <div className="flex items-center gap-2 mb-1 opacity-70">
              {k.icon}<span className="text-xs font-bold uppercase tracking-wide">{k.label}</span>
            </div>
            <p className="text-2xl font-black">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Zona de análisis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Panel de carga */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide">Cargar cotización PDF</h2>
          </div>

          {/* ── Selector de colegio ── */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-3">
            <p className="text-xs font-black text-slate-500 uppercase flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />¿Para qué colegio es esta cotización? *
            </p>
            <ColegioSelector
              territorio={territorio}
              colegio={colegio}
              onTerritorioChange={setTerritorio}
              onColegioChange={setColegio}
              required
            />
            {ciudadSeleccionada && (
              <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                La IA comparará precios contra el mercado de: <span className="font-bold">{ciudadSeleccionada}</span>
              </p>
            )}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all ${
              arrastrando  ? 'border-blue-400 bg-blue-50' :
              archivo      ? 'border-emerald-400 bg-emerald-50' :
                             'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
            {archivo ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="w-9 h-9 text-emerald-500" />
                <p className="font-bold text-emerald-700 text-sm">{archivo.name}</p>
                <p className="text-xs text-emerald-600">{(archivo.size / 1024).toFixed(0)} KB — Listo para analizar</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-9 h-9 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">Arrastra el PDF aquí</p>
                <p className="text-xs text-slate-400">o haz clic para seleccionar</p>
              </div>
            )}
          </div>

          <button
            onClick={procesarConIA}
            disabled={analizando || !archivo || !colegio}
            className={`w-full py-3 rounded-lg font-black text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${
              analizando || !archivo || !colegio
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95 shadow-sm'
            }`}
          >
            {analizando ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Analizando con IA…</>
            ) : (
              <><Brain className="w-4 h-4" />Iniciar análisis automático</>
            )}
          </button>

          {!colegio && (
            <p className="text-xs text-amber-600 text-center font-medium flex items-center justify-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />Selecciona el colegio antes de analizar
            </p>
          )}
        </div>

        {/* Panel de resultado */}
        <div>
          {resultado ? (
            <ResultadoPanel analisis={resultado} colegio={colegio} />
          ) : (
            <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">
              <Brain className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-bold">El resultado del análisis aparecerá aquí</p>
              <p className="text-xs mt-1">Selecciona colegio + PDF y presiona "Iniciar análisis"</p>
            </div>
          )}
        </div>
      </div>

      {/* Historial */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide">Historial de análisis</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              className="h-8 px-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none"
            >
              <option value="">Todos los estados</option>
              <option value="Aprobada">Aprobadas</option>
              <option value="Revisión">En revisión</option>
              <option value="Rechazada">Rechazadas</option>
            </select>
            <select
              value={filtroColegio}
              onChange={e => setFiltroColegio(e.target.value)}
              className="h-8 px-2 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none"
            >
              <option value="">Todos los colegios</option>
              {colegiosEnHistorial.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={() => refetch()}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              title="Actualizar"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

        {loadingHistorial ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-7 h-7 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
          </div>
        ) : historialFiltrado.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{historial.length === 0 ? 'Sin análisis registrados aún.' : 'Sin resultados con los filtros actuales.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Fecha', 'Colegio', 'Proveedor', 'Folio', 'Total', 'Ahorro', 'Decisión', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {historialFiltrado.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(h.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {h.colegio_ubicacion || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-800">{h.proveedor}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono">{h.folio}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{fmtMXN(h.total_proveedor)}</td>
                    <td className="px-4 py-3">
                      {h.ahorro_detectado > 0 ? (
                        <span className="text-emerald-600 font-bold flex items-center gap-1 text-xs">
                          <TrendingDown className="w-3.5 h-3.5" />{fmtMXN(h.ahorro_detectado)}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3"><EstadoBadge estado={h.estado_aprobacion} /></td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDetalle(h)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                        title="Ver detalle"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detalle && <DetalleModal registro={detalle} onClose={() => setDetalle(null)} />}
    </div>
  );
};
