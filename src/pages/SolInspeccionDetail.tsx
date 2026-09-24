import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, Save, Printer, FileSpreadsheet, FileText, FolderOpen, Upload, Loader2, ListChecks, Flag, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useDirectorio } from '@/lib/directorio';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { logAudit } from '@/lib/audit';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_AREAS, SOL_COMPONENTES, tipoLabel, nombreCampus, calcularIndice, fechaLarga, cicloLabel, imprimirHTML,
  htmlResultadoInspeccion, type SolInspeccion, type SolRespuesta, type SolHallazgo, type SolTarjetaRoja,
} from '@/lib/sol';
import { guardarRespuestas, generarHallazgosFaltantes, carpetaSOL } from '@/lib/solData';
import { SolChip, EstatusPill, inputCls, labelCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

const CAL_OPC: { v: 0 | 1 | 2 | 'NA'; label: string; cls: string }[] = [
  { v: 2, label: '2', cls: 'bg-emerald-600 text-white border-emerald-600' },
  { v: 1, label: '1', cls: 'bg-amber-500 text-white border-amber-500' },
  { v: 0, label: '0', cls: 'bg-red-600 text-white border-red-600' },
  { v: 'NA', label: 'NA', cls: 'bg-slate-500 text-white border-slate-500' },
];

export default function SolInspeccionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = useSolAdmin();
  const { data: directorio = [] } = useDirectorio();
  const { uploadCustom, uploading } = useSharePointUpload();
  const pdfRef = useRef<HTMLInputElement>(null);

  const { data: insp, isLoading } = useQuery({
    queryKey: ['sol_inspeccion', id],
    enabled: !!id && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('sol_inspecciones').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as SolInspeccion;
    },
  });
  const { data: respDB } = useQuery({
    queryKey: ['sol_respuestas', id],
    enabled: !!id && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('sol_respuestas').select('*').eq('inspeccion_id', id!).order('criterio_numero');
      if (error) throw error;
      return (data ?? []) as SolRespuesta[];
    },
  });
  const { data: vinculados } = useQuery({
    queryKey: ['sol_insp_vinculados', id],
    enabled: !!id && isAdmin,
    queryFn: async () => {
      const [h, t] = await Promise.all([
        supabase.from('sol_hallazgos').select('*').eq('inspeccion_id', id!).order('folio'),
        supabase.from('sol_tarjetas_rojas').select('*').eq('inspeccion_id', id!).order('folio'),
      ]);
      return { hallazgos: (h.data ?? []) as SolHallazgo[], tarjetas: (t.data ?? []) as SolTarjetaRoja[] };
    },
  });

  const [resps, setResps] = useState<SolRespuesta[]>([]);
  const [cab, setCab] = useState({ inspectores: '', director: '', evidencia_url: '', pdf_url: '', observaciones: '' });
  const [duenos, setDuenos] = useState<Record<string, string>>({});
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (respDB) setResps(respDB.map(r => ({ ...r }))); }, [respDB]);
  useEffect(() => {
    if (!insp) return;
    setCab({ inspectores: insp.inspectores ?? '', director: insp.director ?? '', evidencia_url: insp.evidencia_url ?? '', pdf_url: insp.pdf_url ?? '', observaciones: insp.observaciones ?? '' });
    setDuenos({ ...(insp.duenos ?? {}) });
    setSucio(false);
  }, [insp]);

  const calc = useMemo(() => calcularIndice(resps), [resps]);
  const porArea = useMemo(() => SOL_AREAS.map(a => ({ area: a, items: resps.filter(r => r.area === a) })).filter(g => g.items.length), [resps]);
  const otras = useMemo(() => resps.filter(r => !(SOL_AREAS as readonly string[]).includes(r.area)), [resps]);

  if (!isAdmin) return <AccesoRestringido />;
  if (isLoading || !insp) return <div className="p-8 text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Cargando inspección…</div>;

  const campusNombre = nombreCampus(directorio, insp.colegio);

  const setResp = (n: number, patch: Partial<SolRespuesta>) => {
    setResps(prev => prev.map(r => r.criterio_numero === n ? { ...r, ...patch } : r));
    setSucio(true);
  };
  const calificar = (r: SolRespuesta, v: 0 | 1 | 2 | 'NA') => {
    if (v === 'NA') setResp(r.criterio_numero, { na: !r.na, calificacion: null });
    else setResp(r.criterio_numero, { na: false, calificacion: r.calificacion === v && !r.na ? null : v });
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await guardarRespuestas(insp, resps, {
        inspectores: cab.inspectores || null, director: cab.director || null, evidencia_url: cab.evidencia_url || null,
        pdf_url: cab.pdf_url || null, observaciones: cab.observaciones || null, duenos,
      });
      logAudit({ accion: 'editar', modulo: 'sol', registro_id: insp.id, registro_ref: `${insp.colegio} ${insp.fecha} ${insp.tipo}` });
      qc.invalidateQueries({ queryKey: ['sol_inspeccion', id] });
      qc.invalidateQueries({ queryKey: ['sol_respuestas', id] });
      qc.invalidateQueries({ queryKey: ['sol_inspecciones'] });
      setSucio(false);
      toast.success('Inspección guardada y Índice recalculado');
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? 'Error al guardar');
    } finally { setGuardando(false); }
  };

  const generarHallazgos = async () => {
    if (sucio) { toast.error('Primero guarda los cambios'); return; }
    try {
      const n = await generarHallazgosFaltantes(insp, resps);
      qc.invalidateQueries({ queryKey: ['sol_insp_vinculados', id] });
      qc.invalidateQueries({ queryKey: ['sol_hallazgos'] });
      toast.success(n ? `${n} hallazgo(s) creado(s)` : 'Todos los criterios con 0 o 1 ya tienen hallazgo');
    } catch (e: unknown) { toast.error((e as { message?: string })?.message ?? 'Error'); }
  };

  const subirPDF = async (f: File) => {
    const url = await uploadCustom(f, carpetaSOL(insp.colegio, insp.ciclo, 'Inspecciones'), `${insp.fecha}_${insp.tipo}_firmado_${f.name.replace(/[/\\:*?"<>|]/g, '_')}`);
    if (!url) return;
    const { error } = await supabase.from('sol_inspecciones').update({ pdf_url: url }).eq('id', insp.id);
    if (error) { toast.error(error.message); return; }
    setCab(c => ({ ...c, pdf_url: url }));
    qc.invalidateQueries({ queryKey: ['sol_inspeccion', id] });
  };

  const imprimir = () => {
    const temp: SolInspeccion = {
      ...insp, ...cab, duenos, indice: calc.indice, indice_s: calc.s, indice_o: calc.o, indice_l: calc.l,
      por_area: calc.porArea, criterios_calificados: calc.calificados, criterios_na: calc.na,
    };
    imprimirHTML(htmlResultadoInspeccion(temp, resps, campusNombre));
  };

  const renderCriterio = (r: SolRespuesta) => {
    const bajo = !r.na && (r.calificacion === 0 || r.calificacion === 1);
    const comp = SOL_COMPONENTES.find(c => c.key === r.tipo);
    return (
      <div key={r.criterio_numero} className={`px-4 py-3 ${bajo ? 'bg-red-50/40' : ''}`}>
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <span className="text-xs font-bold text-slate-400 w-6 shrink-0 tabular-nums pt-0.5">{r.criterio_numero}</span>
            <span className="text-[10px] font-black w-5 h-5 rounded flex items-center justify-center text-white shrink-0 mt-0.5" style={{ background: comp?.color }} title={comp?.label}>{r.tipo}</span>
            <p className="text-sm text-slate-800">{r.texto}</p>
          </div>
          <div className="flex gap-1 shrink-0 pl-8 md:pl-0" role="group" aria-label={`Calificación criterio ${r.criterio_numero}`}>
            {CAL_OPC.map(o => {
              const activo = o.v === 'NA' ? r.na : (!r.na && r.calificacion === o.v);
              return (
                <button key={String(o.v)} onClick={() => calificar(r, o.v)} aria-pressed={activo}
                  className={`w-10 h-9 rounded-md border text-sm font-bold transition ${activo ? o.cls : 'bg-white text-slate-500 border-slate-300 hover:border-slate-500'}`}>
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
        {(bajo || r.observacion) && (
          <div className="pl-8 mt-2 flex gap-2 items-center">
            <input className={inputCls + ' text-xs'} placeholder="Observación / hallazgo" value={r.observacion ?? ''}
              onChange={e => setResp(r.criterio_numero, { observacion: e.target.value || null })} />
            <label className="flex items-center gap-1 text-xs text-slate-600 shrink-0">
              <input type="checkbox" checked={!!r.foto} onChange={e => setResp(r.criterio_numero, { foto: e.target.checked })} />Foto
            </label>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto pb-28">
      <button onClick={() => navigate('/sol/inspecciones')} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4"><ArrowLeft className="w-4 h-4" />Inspecciones</button>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">
          <div className="flex-1">
            <p className="text-[11px] font-bold tracking-widest text-[#ED7102] uppercase">Inspección SOL · {tipoLabel(insp.tipo)}</p>
            <h1 className="text-2xl font-display font-semibold text-slate-900">{campusNombre}</h1>
            <p className="text-sm text-slate-500">{fechaLarga(insp.fecha)} · Ciclo {cicloLabel(insp.ciclo)}{insp.trimestre ? ` · T${insp.trimestre}` : ''} · {insp.origen === 'excel' ? `Importada de Excel${insp.version_formato ? ` (v${insp.version_formato})` : ''}` : 'Captura manual'}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {insp.archivo_url && <a className={btnSecondary} href={insp.archivo_url} target="_blank" rel="noreferrer"><FileSpreadsheet className="w-4 h-4 text-emerald-600" />Excel original</a>}
              {cab.pdf_url && <a className={btnSecondary} href={cab.pdf_url} target="_blank" rel="noreferrer"><FileText className="w-4 h-4 text-red-600" />PDF firmado</a>}
              {cab.evidencia_url && <a className={btnSecondary} href={cab.evidencia_url} target="_blank" rel="noreferrer"><FolderOpen className="w-4 h-4 text-blue-600" />Fotos</a>}
              <button className={btnSecondary} onClick={imprimir}><Printer className="w-4 h-4" />Resultado para firma</button>
              <button className={btnSecondary} disabled={uploading} onClick={() => pdfRef.current?.click()}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Subir PDF firmado
              </button>
              <input ref={pdfRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) subirPDF(f); e.target.value = ''; }} />
            </div>
          </div>
          <div className="lg:w-72 rounded-xl border border-slate-200 p-4">
            <p className={labelCls}>Índice SOL</p>
            <div className="flex items-center gap-3"><span className="text-4xl font-black tabular-nums text-slate-900">{calc.indice ?? '—'}</span><SolChip valor={calc.indice} conTexto /></div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {SOL_COMPONENTES.map(c => (
                <div key={c.key} className="text-center">
                  <p className="text-[10px] font-bold" style={{ color: c.color }}>{c.label}</p>
                  <SolChip valor={c.key === 'S' ? calc.s : c.key === 'O' ? calc.o : calc.l} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">{calc.calificados} calificados · {calc.na} NA · {calc.sinCalificar} sin calificar</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
          <div><label className={labelCls}>Inspector(es)</label><input className={inputCls} value={cab.inspectores} onChange={e => { setCab({ ...cab, inspectores: e.target.value }); setSucio(true); }} /></div>
          <div><label className={labelCls}>Director de campus</label><input className={inputCls} value={cab.director} onChange={e => { setCab({ ...cab, director: e.target.value }); setSucio(true); }} /></div>
          <div><label className={labelCls}>Liga de fotos / evidencia (OneDrive)</label><input className={inputCls} placeholder="https://…" value={cab.evidencia_url} onChange={e => { setCab({ ...cab, evidencia_url: e.target.value }); setSucio(true); }} /></div>
          <div><label className={labelCls}>Liga del PDF firmado</label><input className={inputCls} placeholder="https://…" value={cab.pdf_url} onChange={e => { setCab({ ...cab, pdf_url: e.target.value }); setSucio(true); }} /></div>
          <div className="md:col-span-2"><label className={labelCls}>Observaciones generales</label><textarea className={inputCls} rows={2} value={cab.observaciones} onChange={e => { setCab({ ...cab, observaciones: e.target.value }); setSucio(true); }} /></div>
        </div>
      </div>

      <div className="space-y-4">
        {porArea.map(g => (
          <section key={g.area} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between px-4 py-3 bg-[#00295A] text-white">
              <div className="flex items-center gap-3">
                <h2 className="font-bold uppercase tracking-wide text-sm">{g.area}</h2>
                <SolChip valor={calc.porArea[g.area]} className="bg-white" />
              </div>
              <input className="w-full sm:w-72 px-3 py-1.5 rounded-md text-sm text-slate-900 bg-white" placeholder="Dueño del área"
                value={duenos[g.area] ?? ''} onChange={e => { setDuenos({ ...duenos, [g.area]: e.target.value }); setSucio(true); }} />
            </div>
            <div className="divide-y divide-slate-100">{g.items.map(renderCriterio)}</div>
          </section>
        ))}
        {otras.length > 0 && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-slate-700 text-white font-bold text-sm uppercase">Otros criterios</div>
            <div className="divide-y divide-slate-100">{otras.map(renderCriterio)}</div>
          </section>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2"><ListChecks className="w-4 h-4" />Hallazgos de esta inspección</h3>
            <button className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline" onClick={generarHallazgos}>Generar faltantes (0 y 1)</button>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {(vinculados?.hallazgos ?? []).length === 0 && <p className="px-4 py-6 text-sm text-slate-500 text-center">Sin hallazgos.</p>}
            {(vinculados?.hallazgos ?? []).map(h => (
              <Link key={h.id} to={`/sol/hallazgos?folio=${encodeURIComponent(h.folio ?? '')}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                <span className="text-xs font-bold text-slate-500 w-20 shrink-0">{h.folio}</span>
                <span className="text-sm text-slate-700 flex-1 line-clamp-2">{h.riesgo_grave && <AlertTriangle className="w-3.5 h-3.5 text-red-600 inline mr-1" />}{h.hallazgo}</span>
                <EstatusPill estatus={h.estatus} />
              </Link>
            ))}
          </div>
        </section>
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100"><h3 className="font-bold text-sm text-slate-900 flex items-center gap-2"><Flag className="w-4 h-4 text-red-600" />Tarjetas rojas de esta inspección</h3></div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {(vinculados?.tarjetas ?? []).length === 0 && <p className="px-4 py-6 text-sm text-slate-500 text-center">Sin tarjetas rojas.</p>}
            {(vinculados?.tarjetas ?? []).map(t => (
              <Link key={t.id} to={`/sol/tarjetas-rojas?folio=${encodeURIComponent(t.folio ?? '')}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50">
                <span className="text-xs font-bold text-slate-500 w-24 shrink-0">{t.folio}</span>
                <span className="text-sm text-slate-700 flex-1">{t.articulo}{t.cantidad ? ` (${t.cantidad})` : ''}</span>
                <EstatusPill estatus={t.estatus} />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 flex items-center justify-between gap-3 z-30">
        <p className="text-sm text-slate-600">{sucio ? <span className="text-amber-700 font-semibold">Hay cambios sin guardar</span> : 'Sin cambios pendientes'}</p>
        <button className={btnPrimary} disabled={!sucio || guardando} onClick={guardar}>
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar y recalcular
        </button>
      </div>
    </div>
  );
}
