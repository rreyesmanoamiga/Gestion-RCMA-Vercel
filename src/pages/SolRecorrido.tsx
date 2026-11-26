// Recorrido SOL desde el celular: calificar las áreas del colegio con fotos,
// conceptos extra, tarjetas rojas, Infraestructura y el concentrado de Guardianes;
// al terminar se guarda como inspección SOL, se generan hallazgos y tarjetas y
// se arma el informe en PDF (OneDrive + correo al director y al administrador).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ClipboardCheck, Plus, ChevronLeft, ChevronRight, Flag, Trash2, Loader2, CheckCircle2, FileText, Download, ListChecks,
  AlertTriangle, WifiOff, Pencil, X, Star, ExternalLink, RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useScope } from '@/hooks/useScope';
import { useDirectorio, getDirector, getAdministrador } from '@/lib/directorio';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_COMPONENTES, SOL_NIVELES, campusSOL, hoyISO, fechaCorta, fmtIndice, tipoLabel, type SolCriterio,
} from '@/lib/sol';
import { fetchCriterios, traerTodo } from '@/lib/solData';
import {
  AREA_INFRA, AREA_GUARDIANES, MOTIVOS_TR, DESTINOS_TR, RESULTADOS, nuevoId, horaActual, guardarBorrador, leerBorradores, borrarBorrador,
  areasDelRecorrido, faltantes, calculoRecorrido, payloadRecorrido, fotosDeRecorrido, subirFotosPendientes, carpetaRecorrido,
  informeRecorridoPDF, notificarSOL, descargarBlob,
  type BorradorRecorrido, type Evaluacion, type Extra, type TarjetaCampo, type GuardianCampo, type CriterioInfra, type HallazgoPDF, type TarjetaPDF,
} from '@/lib/solCampo';
import { subirArchivoOneDrive } from '@/hooks/useSharePointUpload';
import { SolChip, inputCls, labelCls, useSolAdmin } from '@/components/sol/SolShared';
import { BotonesResultado, SelectorFotos, FirmaPad, BarraInferior, btnGrande, btnGrandeNaranja, btnContorno, chip } from '@/components/sol/SolCampo';

type Vista = 'inicio' | 'nuevo' | 'recorrer' | 'resumen' | 'enviando' | 'listo';
const TIPOS_CAMPO = [
  { key: 'visita_mas', label: 'Visita MAS' },
  { key: 'linea_base', label: 'Línea base' },
  { key: 'trimestral', label: 'Auditoría cruzada' },
];
const evalVacia = (): Evaluacion => ({ resultado: null, observacion: '', fotos: [] });
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? 'Error';

export default function SolRecorrido() {
  const esAdmin = useSolAdmin();
  const { can } = usePermissions();
  const puede = esAdmin || can('sol_recorridos');
  const [vista, setVista] = useState<Vista>('inicio');
  const [b, setB] = useState<BorradorRecorrido | null>(null);
  const pendiente = useRef<number | null>(null);

  // Cada cambio se guarda en el celular (medio segundo después de dejar de escribir)
  const cambiar = (fn: (x: BorradorRecorrido) => void) => setB(prev => {
    if (!prev) return prev;
    const n: BorradorRecorrido = { ...prev };
    fn(n);
    if (pendiente.current) window.clearTimeout(pendiente.current);
    pendiente.current = window.setTimeout(() => { guardarBorrador(n).catch(() => toast.error('No se pudo guardar el borrador en el celular')); }, 500);
    return n;
  });

  if (!puede) return <AccesoRestringido />;

  return (
    <div className="max-w-xl mx-auto pb-32">
      {vista === 'inicio' && <Inicio onNuevo={() => setVista('nuevo')} onAbrir={x => { setB(x); setVista(x.enviado ? 'listo' : 'recorrer'); }} />}
      {vista === 'nuevo' && <Nuevo onCancelar={() => setVista('inicio')} onListo={x => { setB(x); setVista('recorrer'); }} />}
      {vista === 'recorrer' && b && <Recorrer b={b} cambiar={cambiar} onSalir={() => setVista('inicio')} onResumen={() => setVista('resumen')} />}
      {vista === 'resumen' && b && <Resumen b={b} cambiar={cambiar} onVolver={paso => { cambiar(x => { x.paso = paso; }); setVista('recorrer'); }} onEnviar={() => setVista('enviando')} />}
      {vista === 'enviando' && b && <Enviando b={b} setB={setB} onListo={() => setVista('listo')} onError={() => setVista('resumen')} />}
      {vista === 'listo' && b && <Listo b={b} onInicio={() => { setB(null); setVista('inicio'); }} />}
    </div>
  );
}

// ── Inicio: borradores y recorridos enviados ─────────────────────────────────
function Inicio({ onNuevo, onAbrir }: { onNuevo: () => void; onAbrir: (b: BorradorRecorrido) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: borradores = [], refetch } = useQuery({ queryKey: ['sol_borradores_recorrido'], queryFn: () => leerBorradores<BorradorRecorrido>('recorrido') });
  const { data: enviados = [], isLoading } = useQuery({
    queryKey: ['sol_mis_recorridos', user?.email],
    queryFn: async () => traerTodo<{ id: string; folio: string | null; colegio: string; fecha: string; tipo: string; indice: number | null; pdf_url: string | null; created_by: string | null }>(
      (a, z) => supabase.from('sol_inspecciones').select('id, folio, colegio, fecha, tipo, indice, pdf_url, created_by')
        .eq('origen', 'recorrido').ilike('created_by', user?.email ?? '').order('fecha', { ascending: false }).range(a, Math.min(z, a + 29))),
  });
  const { data: directorio = [] } = useDirectorio();
  const nombre = (c: string) => directorio.find(d => d.codigo === c)?.nombre ?? c;
  const pendientes = borradores.filter(x => !x.enviado);

  const descartar = async (x: BorradorRecorrido) => {
    if (!window.confirm(`¿Descartar el borrador de ${x.colegioNombre}? Se borran sus calificaciones y fotos de este celular.`)) return;
    await borrarBorrador(x.id); refetch(); qc.invalidateQueries({ queryKey: ['sol_borradores_recorrido'] });
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 text-white rounded-xl px-5 py-5 -mx-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-300">Programa SOL</p>
        <h1 className="text-xl font-black">Recorrido SOL</h1>
        <p className="text-xs text-slate-300 mt-1">Califica las áreas del colegio con fotos. Al terminar se generan los hallazgos, las tarjetas rojas y el informe en PDF.</p>
      </div>
      <button className={btnGrande} onClick={onNuevo}><Plus className="w-4 h-4" />Nuevo recorrido</button>

      {pendientes.length > 0 && (
        <section>
          <p className={labelCls}>En este celular · sin enviar</p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {pendientes.map(x => {
              const { calc } = calculoRecorrido(x);
              return (
                <div key={x.id} className="px-4 py-3 flex items-center gap-3">
                  <button className="flex-1 text-left min-w-0" onClick={() => onAbrir(x)}>
                    <p className="font-bold text-slate-900 truncate">{x.colegioNombre}</p>
                    <p className="text-[11px] text-slate-500">{fechaCorta(x.fecha)} · {tipoLabel(x.tipo)} · guardado {new Date(x.actualizado).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                  </button>
                  <SolChip valor={calc.indice} />
                  <button className="p-2 text-slate-400 hover:text-red-600" onClick={() => descartar(x)} aria-label="Descartar borrador"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <p className={labelCls}>Mis recorridos enviados</p>
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {isLoading && <p className="px-4 py-4 text-sm text-slate-400">Cargando…</p>}
          {!isLoading && enviados.length === 0 && <p className="px-4 py-6 text-sm text-slate-500 text-center">Aún no has enviado recorridos.</p>}
          {enviados.map(r => (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-sm">{r.folio ?? '—'}</p>
                <p className="text-[11px] text-slate-500 truncate">{nombre(r.colegio)} · {fechaCorta(r.fecha)}</p>
              </div>
              <SolChip valor={r.indice} />
              {r.pdf_url && <a href={r.pdf_url} target="_blank" rel="noreferrer" className="p-2 text-red-600" aria-label="Ver informe"><FileText className="w-4 h-4" /></a>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Nuevo recorrido ──────────────────────────────────────────────────────────
function Nuevo({ onCancelar, onListo }: { onCancelar: () => void; onListo: (b: BorradorRecorrido) => void }) {
  const { user } = useAuth();
  const { permsRecord } = usePermissions();
  const esAdmin = useSolAdmin();
  const { filtrarPorAlcance } = useScope();
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => filtrarPorAlcance(campusSOL(directorio), r => r.territorio, r => r.codigo), [directorio, filtrarPorAlcance]);
  const pr = (permsRecord ?? {}) as Record<string, unknown>;
  const [f, setF] = useState({
    colegio: '', tipo: 'visita_mas', fecha: hoyISO(),
    elaboro_nombre: String(pr.nombre ?? user?.user_metadata?.nombre ?? ''), elaboro_puesto: String(pr.puesto ?? ''),
    acompanante: '', director: '', administrador: '',
  });
  const [cargando, setCargando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  const elegirColegio = (codigo: string) => {
    const dir = getDirector(directorio, codigo).nombre, adm = getAdministrador(directorio, codigo).nombre;
    setF(p => ({ ...p, colegio: codigo, director: dir, administrador: adm, acompanante: p.acompanante || adm }));
  };

  const iniciar = async () => {
    if (!f.colegio) { toast.error('Elige el colegio'); return; }
    if (!f.elaboro_nombre.trim()) { toast.error('Escribe tu nombre'); return; }
    setCargando(true);
    try {
      const [criterios, infraQ] = await Promise.all([
        fetchCriterios(true),
        supabase.from('sol_criterios_infra').select('numero, texto').eq('activo', true).order('numero'),
      ]);
      if (!criterios.length) throw new Error('No se pudo leer el catálogo de criterios. Revisa tu conexión.');
      const c = directorio.find(d => d.codigo === f.colegio);
      const b: BorradorRecorrido = {
        id: nuevoId(), clase: 'recorrido', creado: new Date().toISOString(), actualizado: new Date().toISOString(),
        colegio: f.colegio, colegioNombre: c?.nombre ?? f.colegio, territorio: c?.territorio ?? null,
        tipo: f.tipo, fecha: f.fecha, hora_inicio: horaActual(),
        elaboro_nombre: f.elaboro_nombre.trim(), elaboro_puesto: f.elaboro_puesto.trim(), acompanante: f.acompanante.trim(),
        director: f.director.trim(), administrador: f.administrador.trim(),
        criterios: criterios as SolCriterio[], infra: (infraQ.data ?? []) as CriterioInfra[],
        respuestas: {}, infraestructura: {}, extras: [], tarjetas: [], guardianes: [], omitidas: [], observaciones: '', firmas: {}, paso: 0,
      };
      await guardarBorrador(b);
      onListo(b);
    } catch (e) { toast.error(errMsg(e)); }
    finally { setCargando(false); }
  };

  return (
    <div className="space-y-4">
      <button onClick={onCancelar} className="inline-flex items-center gap-1 text-sm text-slate-500"><ChevronLeft className="w-4 h-4" />Recorridos</button>
      <h1 className="text-xl font-black text-slate-900">Nuevo recorrido</h1>
      <div><label className={labelCls}>Colegio</label>
        <select className={inputCls + ' !py-2.5'} value={f.colegio} onChange={e => elegirColegio(e.target.value)}>
          <option value="">Elige el colegio…</option>
          {campus.map(c => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
        </select>
        <p className="text-[11px] text-slate-400 mt-1">Solo aparecen los colegios que tienes asignados.</p></div>
      <div><label className={labelCls}>Tipo</label>
        <div className="flex flex-wrap gap-2">
          {TIPOS_CAMPO.filter(t => esAdmin || t.key === 'visita_mas').map(t => <button key={t.key} type="button" className={chip(f.tipo === t.key)} onClick={() => set('tipo', t.key)}>{t.label}</button>)}
          <span className={chip(false) + ' opacity-50'}>Comité (más adelante)</span>
        </div></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={f.fecha} max={hoyISO()} onChange={e => set('fecha', e.target.value)} /></div>
        <div><label className={labelCls}>Hora de inicio</label><p className="py-2 text-sm font-semibold tabular-nums">{horaActual()}</p></div>
      </div>
      <div><label className={labelCls}>Elabora</label><input className={inputCls} value={f.elaboro_nombre} onChange={e => set('elaboro_nombre', e.target.value)} placeholder="Tu nombre" /></div>
      <div><label className={labelCls}>Puesto</label><input className={inputCls} value={f.elaboro_puesto} onChange={e => set('elaboro_puesto', e.target.value)} placeholder="Ej. Supervisor de mantenimiento MAS" /></div>
      <div className="grid grid-cols-1 gap-3">
        <div><label className={labelCls}>Director(a)</label><input className={inputCls} value={f.director} onChange={e => set('director', e.target.value)} /></div>
        <div><label className={labelCls}>Administrador(a)</label><input className={inputCls} value={f.administrador} onChange={e => set('administrador', e.target.value)} /></div>
        <div><label className={labelCls}>Acompaña por el colegio</label><input className={inputCls} value={f.acompanante} onChange={e => set('acompanante', e.target.value)} /></div>
      </div>
      <p className="text-[11px] text-slate-400">Director y administrador se toman del Directorio; puedes corregirlos.</p>
      <BarraInferior><button className={btnGrande} disabled={cargando} onClick={iniciar}>{cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}Iniciar recorrido</button></BarraInferior>
    </div>
  );
}

// ── Recorrer área por área ───────────────────────────────────────────────────
function Recorrer({ b, cambiar, onSalir, onResumen }: { b: BorradorRecorrido; cambiar: (fn: (x: BorradorRecorrido) => void) => void; onSalir: () => void; onResumen: () => void }) {
  const pasos = useMemo(() => [...areasDelRecorrido(b), ...(b.infra.length ? [AREA_INFRA] : []), AREA_GUARDIANES], [b.criterios, b.infra]); // eslint-disable-line react-hooks/exhaustive-deps
  const paso = Math.min(b.paso, pasos.length - 1);
  const area = pasos[paso];
  const [extra, setExtra] = useState<Extra | null>(null);
  const [tarjeta, setTarjeta] = useState<TarjetaCampo | null>(null);
  const [menu, setMenu] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const arriba = useRef<HTMLDivElement>(null);
  const omitida = b.omitidas.includes(area);
  const ir = (p: number) => { cambiar(x => { x.paso = p; }); setMenu(false); arriba.current?.scrollIntoView({ behavior: 'smooth' }); };

  const setResp = (n: number, patch: Partial<Evaluacion>) => cambiar(x => { x.respuestas = { ...x.respuestas, [n]: { ...(x.respuestas[n] ?? evalVacia()), ...patch } }; });
  const setInfra = (n: number, patch: Partial<Evaluacion>) => cambiar(x => { x.infraestructura = { ...x.infraestructura, [n]: { ...(x.infraestructura[n] ?? evalVacia()), ...patch } }; });
  const contestados = (a: string) => a === AREA_INFRA ? b.infra.filter(c => b.infraestructura[c.numero]?.resultado).length
    : a === AREA_GUARDIANES ? b.guardianes.length : b.criterios.filter(c => c.area === a && b.respuestas[c.numero]?.resultado).length;
  const totalDe = (a: string) => a === AREA_INFRA ? b.infra.length : a === AREA_GUARDIANES ? 0 : b.criterios.filter(c => c.area === a).length;

  const tarjetaCriterio = (n: number, texto: string, tipo: string | null, e: Evaluacion | undefined, set: (p: Partial<Evaluacion>) => void) => {
    const ev = e ?? evalVacia();
    const bajo = ev.resultado === 'parcial' || ev.resultado === 'no_cumple';
    const comp = SOL_COMPONENTES.find(c => c.key === tipo);
    return (
      <div key={n} className={`bg-white rounded-xl border p-3 ${bajo ? 'border-red-300' : 'border-slate-200'}`}>
        <div className="flex gap-2 mb-2.5">
          {comp ? <span className="text-[10px] font-black w-5 h-5 rounded flex items-center justify-center text-white shrink-0" style={{ background: comp.color }} title={comp.label}>{comp.key}</span>
            : <span className="text-[10px] font-black w-5 h-5 rounded flex items-center justify-center bg-slate-400 text-white shrink-0">I</span>}
          <p className="text-sm text-slate-800 leading-snug">{texto}</p>
        </div>
        <BotonesResultado valor={ev.resultado} onChange={r => set({ resultado: r })} />
        {(bajo || ev.observacion || ev.fotos.length > 0 || abiertos.has(n)) ? (
          <div className="mt-2.5 space-y-2">
            <textarea className={inputCls + ' text-sm'} rows={2} placeholder={bajo ? '¿Qué encontraste? (o toma una foto)' : 'Comentario'} value={ev.observacion} onChange={e => set({ observacion: e.target.value })} />
            <SelectorFotos fotos={ev.fotos} onChange={fotos => set({ fotos })} />
            {bajo && <p className="text-[11px] font-bold text-red-700">Se creará un hallazgo al terminar{tipo === 'S' && ev.resultado === 'no_cumple' ? ' · riesgo grave, se atiende hoy' : ''}</p>}
          </div>
        ) : (
          <button type="button" className="mt-2 text-[11px] font-semibold text-slate-500" onClick={() => setAbiertos(a => new Set(a).add(n))}>+ Comentario o foto</button>
        )}
      </div>
    );
  };

  return (
    <div ref={arriba} className="space-y-3">
      <div className="sticky z-20 bg-[#F6F7F9] -mx-1 px-1 pt-1 pb-2" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="flex items-center justify-between gap-2">
          <button onClick={onSalir} className="inline-flex items-center gap-1 text-sm text-slate-500"><ChevronLeft className="w-4 h-4" />Salir</button>
          <p className="text-[11px] text-slate-400 truncate">{b.colegioNombre} · guardado en el celular</p>
        </div>
        <button className="w-full mt-1 flex items-center justify-between bg-white rounded-xl border border-slate-200 px-4 py-2.5" onClick={() => setMenu(m => !m)}>
          <span className="font-black text-slate-900 text-left">{area}</span>
          <span className="text-[11px] font-bold text-slate-500 tabular-nums">Paso {paso + 1} de {pasos.length} ▾</span>
        </button>
        <div className="h-1.5 rounded-full bg-slate-200 mt-2"><div className="h-1.5 rounded-full bg-[#ED7102] transition-all" style={{ width: `${((paso + 1) / pasos.length) * 100}%` }} /></div>
        {menu && (
          <div className="absolute left-1 right-1 mt-1 bg-white rounded-xl border border-slate-200 shadow-xl divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {pasos.map((a, i) => (
              <button key={a} className={`w-full px-4 py-2.5 flex justify-between text-sm ${i === paso ? 'bg-orange-50 font-bold' : ''}`} onClick={() => ir(i)}>
                <span>{a}{b.omitidas.includes(a) && <span className="text-slate-400"> · no se recorrió</span>}</span>
                <span className="text-[11px] text-slate-500 tabular-nums">{a === AREA_GUARDIANES ? `${contestados(a)} grupo(s)` : `${contestados(a)}/${totalDe(a)}`}</span>
              </button>
            ))}
            <button className="w-full px-4 py-2.5 text-sm font-bold text-[#ED7102] text-left" onClick={() => { setMenu(false); onResumen(); }}>Ir al resumen y terminar →</button>
          </div>
        )}
      </div>

      {area !== AREA_GUARDIANES && (
        <label className="flex items-center gap-2 text-xs text-slate-600 px-1">
          <input type="checkbox" checked={omitida} onChange={e => cambiar(x => { x.omitidas = e.target.checked ? [...x.omitidas, area] : x.omitidas.filter(a => a !== area); })} />
          No se recorrió esta área (no cuenta en el Índice de esta visita)
        </label>
      )}
      {area === AREA_INFRA && !omitida && (
        <p className="text-[11px] text-slate-500 bg-slate-100 rounded-lg px-3 py-2">Infraestructura sale en el informe y genera hallazgos, pero <b>no cuenta en el Índice SOL ni en el ranking</b>.</p>
      )}

      {!omitida && area !== AREA_INFRA && area !== AREA_GUARDIANES &&
        b.criterios.filter(c => c.area === area).map(c => tarjetaCriterio(c.numero, c.texto, c.tipo, b.respuestas[c.numero], p => setResp(c.numero, p)))}
      {!omitida && area === AREA_INFRA &&
        b.infra.map(c => tarjetaCriterio(c.numero, c.texto, null, b.infraestructura[c.numero], p => setInfra(c.numero, p)))}

      {area === AREA_GUARDIANES && <Guardianes b={b} cambiar={cambiar} />}

      {area !== AREA_GUARDIANES && (
        <>
          {b.extras.filter(x => x.area === area).map(x => (
            <div key={x.id} className="bg-blue-50/60 rounded-xl border border-blue-200 p-3 flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase text-blue-700">Concepto extra · no cuenta en el Índice</p>
                <p className="text-sm text-slate-800">{x.texto}</p>
                <p className="text-[11px] text-slate-500">{RESULTADOS.find(r => r.key === x.resultado)?.corto ?? 'Sin calificar'} · {x.fotos.length} foto(s)</p>
              </div>
              <button className="p-2 text-slate-500" onClick={() => setExtra(x)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>
            </div>
          ))}
          {b.tarjetas.filter(t => t.area === area).map(t => (
            <div key={t.id} className="bg-red-50/60 rounded-xl border border-red-200 p-3 flex gap-3 items-start">
              <Flag className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{t.articulo || 'Artículo'}{t.cantidad ? ` × ${t.cantidad}` : ''}</p>
                <p className="text-[11px] text-slate-500">{t.motivo || '—'} → {t.destino || '—'} · 30 días desde hoy</p>
              </div>
              <button className="p-2 text-slate-500" onClick={() => setTarjeta(t)} aria-label="Editar"><Pencil className="w-4 h-4" /></button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button className={btnContorno} onClick={() => setExtra({ id: nuevoId(), area, texto: '', ...evalVacia() })}><Plus className="w-4 h-4" />Concepto extra</button>
            <button className={btnContorno + ' !border-red-300 !bg-red-50 !text-red-700'} onClick={() => setTarjeta({ id: nuevoId(), area, articulo: '', cantidad: '', ubicacion: '', motivo: '', destino: '', observaciones: '', fotos: [] })}><Flag className="w-4 h-4" />Tarjeta roja</button>
          </div>
        </>
      )}

      <BarraInferior>
        <div className="flex gap-2">
          <button className={btnContorno + ' !py-3 w-28'} disabled={paso === 0} onClick={() => ir(paso - 1)}><ChevronLeft className="w-4 h-4" />Anterior</button>
          {paso < pasos.length - 1
            ? <button className={btnGrande + ' flex-1'} onClick={() => ir(paso + 1)}>Siguiente: {pasos[paso + 1]}<ChevronRight className="w-4 h-4" /></button>
            : <button className={btnGrandeNaranja + ' flex-1'} onClick={onResumen}>Revisar y terminar<ChevronRight className="w-4 h-4" /></button>}
        </div>
      </BarraInferior>

      {extra && <HojaExtra extra={extra} onCerrar={() => setExtra(null)}
        onGuardar={x => { cambiar(z => { z.extras = z.extras.some(y => y.id === x.id) ? z.extras.map(y => y.id === x.id ? x : y) : [...z.extras, x]; }); setExtra(null); }}
        onQuitar={id => { cambiar(z => { z.extras = z.extras.filter(y => y.id !== id); }); setExtra(null); }} />}
      {tarjeta && <HojaTarjeta tarjeta={tarjeta} onCerrar={() => setTarjeta(null)}
        onGuardar={t => { cambiar(z => { z.tarjetas = z.tarjetas.some(y => y.id === t.id) ? z.tarjetas.map(y => y.id === t.id ? t : y) : [...z.tarjetas, t]; }); setTarjeta(null); }}
        onQuitar={id => { cambiar(z => { z.tarjetas = z.tarjetas.filter(y => y.id !== id); }); setTarjeta(null); }} />}
    </div>
  );
}

function Hoja({ titulo, icono, onCerrar, children, pie }: { titulo: string; icono?: React.ReactNode; onCerrar: () => void; children: React.ReactNode; pie: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="font-bold text-slate-900 flex items-center gap-2">{icono}{titulo}</p>
          <button onClick={onCerrar} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
        <div className="px-4 pt-3 border-t border-slate-100" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{pie}</div>
      </div>
    </div>
  );
}

function HojaExtra({ extra, onCerrar, onGuardar, onQuitar }: { extra: Extra; onCerrar: () => void; onGuardar: (x: Extra) => void; onQuitar: (id: string) => void }) {
  const [x, setX] = useState(extra);
  return (
    <Hoja titulo={`Concepto extra · ${x.area}`} icono={<Plus className="w-4 h-4 text-blue-600" />} onCerrar={onCerrar}
      pie={<div className="flex gap-2"><button className={btnContorno + ' !py-3'} onClick={() => onQuitar(x.id)}><Trash2 className="w-4 h-4" /></button>
        <button className={btnGrande + ' flex-1'} disabled={!x.texto.trim() || !x.resultado} onClick={() => onGuardar(x)}>Guardar concepto</button></div>}>
      <p className="text-[11px] text-slate-500">Algo que viste y no está en el catálogo. Sale en el informe y, si no cumple, genera hallazgo; no cuenta en el Índice.</p>
      <div><label className={labelCls}>Concepto</label><input className={inputCls} value={x.texto} onChange={e => setX({ ...x, texto: e.target.value })} placeholder="Ej. Gotera en el techo del salón 3° B" /></div>
      <BotonesResultado valor={x.resultado} onChange={r => setX({ ...x, resultado: r })} />
      <textarea className={inputCls} rows={2} placeholder="Comentario" value={x.observacion} onChange={e => setX({ ...x, observacion: e.target.value })} />
      <SelectorFotos fotos={x.fotos} onChange={fotos => setX({ ...x, fotos })} />
    </Hoja>
  );
}

function HojaTarjeta({ tarjeta, onCerrar, onGuardar, onQuitar }: { tarjeta: TarjetaCampo; onCerrar: () => void; onGuardar: (t: TarjetaCampo) => void; onQuitar: (id: string) => void }) {
  const [t, setT] = useState(tarjeta);
  const vence = new Date(); vence.setDate(vence.getDate() + 30);
  return (
    <Hoja titulo={`Tarjeta roja · ${t.area}`} icono={<Flag className="w-4 h-4 text-red-600" />} onCerrar={onCerrar}
      pie={<div className="flex gap-2"><button className={btnContorno + ' !py-3'} onClick={() => onQuitar(t.id)}><Trash2 className="w-4 h-4" /></button>
        <button className={btnGrande + ' flex-1'} disabled={!t.articulo.trim()} onClick={() => onGuardar(t)}>Guardar tarjeta</button></div>}>
      <div><label className={labelCls}>Artículo / mobiliario</label><input className={inputCls} value={t.articulo} onChange={e => setT({ ...t, articulo: e.target.value })} placeholder="Ej. Pupitres rotos" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Cantidad</label><input type="number" min="0" inputMode="numeric" className={inputCls} value={t.cantidad} onChange={e => setT({ ...t, cantidad: e.target.value })} /></div>
        <div><label className={labelCls}>Ubicación</label><input className={inputCls} value={t.ubicacion} onChange={e => setT({ ...t, ubicacion: e.target.value })} placeholder="Ej. 5° A" /></div>
      </div>
      <div><label className={labelCls}>Motivo</label><div className="flex flex-wrap gap-1.5">{MOTIVOS_TR.map(m => <button key={m} type="button" className={chip(t.motivo === m)} onClick={() => setT({ ...t, motivo: m })}>{m}</button>)}</div></div>
      <div><label className={labelCls}>Destino propuesto</label><div className="flex flex-wrap gap-1.5">{DESTINOS_TR.map(m => <button key={m} type="button" className={chip(t.destino === m)} onClick={() => setT({ ...t, destino: m })}>{m}</button>)}</div></div>
      <textarea className={inputCls} rows={2} placeholder="Observaciones" value={t.observaciones} onChange={e => setT({ ...t, observaciones: e.target.value })} />
      <SelectorFotos fotos={t.fotos} onChange={fotos => setT({ ...t, fotos })} />
      <p className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-[12px] text-slate-700"><b className="text-[#ED7102]">Plazo: 30 días</b> desde el registro · vence el <b>{fechaCorta(`${vence.getFullYear()}-${String(vence.getMonth() + 1).padStart(2, '0')}-${String(vence.getDate()).padStart(2, '0')}`)}</b></p>
    </Hoja>
  );
}

function Guardianes({ b, cambiar }: { b: BorradorRecorrido; cambiar: (fn: (x: BorradorRecorrido) => void) => void }) {
  const set = (id: string, patch: Partial<GuardianCampo>) => cambiar(x => { x.guardianes = x.guardianes.map(g => g.id === id ? { ...g, ...patch } : g); });
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-slate-600 bg-white rounded-xl border border-slate-200 px-3 py-2.5 flex gap-2">
        <Star className="w-4 h-4 text-[#ED7102] shrink-0 mt-0.5" />
        <span>Toma foto del <b>concentrado SOL-F08</b> de cada grupo, firmado por el maestro titular, y anota su promedio de palomitas por semana. Basta con una visita por trimestre. Este paso es opcional.</span>
      </p>
      {b.guardianes.map(g => (
        <div key={g.id} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1"><label className={labelCls}>Nivel</label>
              <select className={inputCls} value={g.nivel} onChange={e => set(g.id, { nivel: e.target.value })}><option value="">—</option>{SOL_NIVELES.map(n => <option key={n}>{n}</option>)}</select></div>
            <div><label className={labelCls}>Grupo</label><input className={inputCls} value={g.grupo} onChange={e => set(g.id, { grupo: e.target.value })} placeholder="3° A" /></div>
            <div><label className={labelCls}>Promedio</label><input type="number" min="0" inputMode="decimal" className={inputCls} value={g.promedio} onChange={e => set(g.id, { promedio: e.target.value })} /></div>
          </div>
          <SelectorFotos fotos={g.fotos} onChange={fotos => set(g.id, { fotos })} etiqueta="Foto del SOL-F08" max={3} />
          <button className="text-[11px] text-red-600 font-semibold" onClick={() => cambiar(x => { x.guardianes = x.guardianes.filter(z => z.id !== g.id); })}>Quitar grupo</button>
        </div>
      ))}
      <button className={btnContorno + ' w-full'} onClick={() => cambiar(x => { x.guardianes = [...x.guardianes, { id: nuevoId(), nivel: '', grupo: '', promedio: '', fotos: [] }]; })}><Plus className="w-4 h-4" />Agregar grupo</button>
    </div>
  );
}

// ── Resumen, firmas y terminar ───────────────────────────────────────────────
function Resumen({ b, cambiar, onVolver, onEnviar }: { b: BorradorRecorrido; cambiar: (fn: (x: BorradorRecorrido) => void) => void; onVolver: (paso: number) => void; onEnviar: () => void }) {
  const enLinea = useEnLinea();
  const { calc, infraCumple, infraTotal, hallazgos, fotos } = calculoRecorrido(b);
  const falta = faltantes(b);
  const pasos = [...areasDelRecorrido(b), ...(b.infra.length ? [AREA_INFRA] : []), AREA_GUARDIANES];
  const sinFirma = !b.firmas.elaboro;
  return (
    <div className="space-y-3">
      <button onClick={() => onVolver(b.paso)} className="inline-flex items-center gap-1 text-sm text-slate-500"><ChevronLeft className="w-4 h-4" />Seguir recorriendo</button>
      <div className="bg-slate-900 text-white rounded-xl px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-300">Resumen del recorrido</p>
        <p className="text-lg font-black">{b.colegioNombre}</p>
        <p className="text-xs text-slate-300">{fechaCorta(b.fecha)} · {tipoLabel(b.tipo)} · desde las {b.hora_inicio}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Índice SOL</p>
          <p className="text-2xl font-black tabular-nums">{fmtIndice(calc.indice)}</p><SolChip valor={calc.indice} conTexto /></div>
        <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Infraestructura</p>
          <p className="text-2xl font-black tabular-nums">{infraTotal ? `${infraCumple}/${infraTotal}` : '—'}</p><span className="text-[10px] font-bold text-slate-500">No cuenta en ranking</span></div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
        <div className="px-4 py-2 flex justify-between"><span>Hallazgos que se crearán</span><b className="tabular-nums text-red-700">{hallazgos}</b></div>
        <div className="px-4 py-2 flex justify-between"><span>Tarjetas rojas</span><b className="tabular-nums">{b.tarjetas.length}</b></div>
        <div className="px-4 py-2 flex justify-between"><span>Conceptos extra</span><b className="tabular-nums">{b.extras.length}</b></div>
        <div className="px-4 py-2 flex justify-between"><span>Grupos de Guardianes</span><b className="tabular-nums">{b.guardianes.length}</b></div>
        <div className="px-4 py-2 flex justify-between"><span>Fotos</span><b className="tabular-nums">{fotos}</b></div>
        {b.omitidas.length > 0 && <div className="px-4 py-2 flex justify-between text-amber-700"><span>Áreas sin recorrer</span><b className="text-right">{b.omitidas.join(', ')}</b></div>}
      </div>

      {falta.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Falta completar ({falta.length})</p>
          <ul className="mt-1.5 space-y-1">
            {falta.slice(0, 8).map((x, i) => (
              <li key={i}><button className="text-left text-[12px] text-amber-900 underline" onClick={() => onVolver(Math.max(0, pasos.indexOf(x.area)))}>{x.area}: {x.texto}</button></li>
            ))}
            {falta.length > 8 && <li className="text-[11px] text-amber-800">…y {falta.length - 8} más</li>}
          </ul>
        </div>
      )}

      <div><label className={labelCls}>Observaciones generales</label><textarea className={inputCls} rows={3} value={b.observaciones} onChange={e => cambiar(x => { x.observaciones = e.target.value; })} /></div>
      <FirmaPad etiqueta="Firma de quien elaboró" nombre={b.elaboro_nombre} valor={b.firmas.elaboro} onChange={v => cambiar(x => { x.firmas = { ...x.firmas, elaboro: v }; })} />
      <FirmaPad etiqueta="Firma de quien acompañó por el colegio" nombre={b.acompanante} valor={b.firmas.acompanante} onChange={v => cambiar(x => { x.firmas = { ...x.firmas, acompanante: v }; })} />

      {!enLinea && <p className="text-[12px] text-amber-800 bg-amber-50 rounded-lg px-3 py-2 flex gap-2"><WifiOff className="w-4 h-4 shrink-0" />Sin conexión. Todo está guardado en el celular; termina el recorrido cuando regrese la señal.</p>}
      <BarraInferior>
        <button className={btnGrandeNaranja} disabled={falta.length > 0 || sinFirma || !enLinea} onClick={() => { cambiar(x => { x.hora_fin = x.hora_fin ?? horaActual(); }); onEnviar(); }}>
          <CheckCircle2 className="w-4 h-4" />Terminar y generar informe
        </button>
        {(falta.length > 0 || sinFirma) && <p className="text-[11px] text-slate-500 text-center mt-1.5">{falta.length ? 'Completa lo pendiente para terminar' : 'Falta la firma de quien elaboró'}</p>}
      </BarraInferior>
    </div>
  );
}

// ── Envío: fotos → recorrido → informe → correo ──────────────────────────────
function Enviando({ b, setB, onListo, onError }: { b: BorradorRecorrido; setB: (b: BorradorRecorrido) => void; onListo: () => void; onError: () => void }) {
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState('Preparando…');
  const [avance, setAvance] = useState<{ h: number; t: number } | null>(null);
  const corrio = useRef(false);

  useEffect(() => {
    if (corrio.current) return;
    corrio.current = true;
    (async () => {
      const copia: BorradorRecorrido = { ...b };
      const guardar = () => guardarBorrador(copia);
      try {
        setEtapa('Subiendo fotos a OneDrive');
        const todas = fotosDeRecorrido(copia);
        const pend = todas.filter(x => !x.foto.url);
        let hechas = 0;
        setAvance({ h: 0, t: pend.length });
        for (const x of pend) {
          await subirFotosPendientes([x.foto], carpetaRecorrido(copia), x.prefijo, () => { /* avance por foto abajo */ }, guardar);
          hechas++; setAvance({ h: hechas, t: pend.length });
        }
        setAvance(null);

        setEtapa('Guardando el recorrido');
        const { data, error } = await supabase.rpc('sol_registrar_recorrido', { p: payloadRecorrido(copia) });
        if (error) throw error;
        const r = data as { id: string; folio: string; hallazgos: number | null; tarjetas: number | null };

        setEtapa('Generando el informe en PDF');
        const [h, t] = await Promise.all([
          supabase.from('sol_hallazgos').select('folio, area, hallazgo, fecha_compromiso, riesgo_grave, cuenta_sol').eq('inspeccion_id', r.id).order('folio'),
          supabase.from('sol_tarjetas_rojas').select('folio, area, articulo, cantidad, destino, fecha_limite').eq('inspeccion_id', r.id).order('folio'),
        ]);
        const pdf = await informeRecorridoPDF(copia, r.folio, (h.data ?? []) as HallazgoPDF[], (t.data ?? []) as TarjetaPDF[]);
        pdfLocal.set(copia.id, pdf);

        setEtapa('Guardando el informe en OneDrive');
        let pdfUrl: string | null = null;
        try {
          pdfUrl = await subirArchivoOneDrive(pdf, carpetaRecorrido(copia), `${r.folio}_Informe_Recorrido_SOL.pdf`);
          await supabase.rpc('sol_recorrido_pdf', { p_id: r.id, p_url: pdfUrl });
        } catch (e) { console.warn(e); toast.error('El recorrido quedó guardado, pero el PDF no se pudo subir. Descárgalo desde aquí.'); }

        setEtapa('Avisando por correo');
        if (pdfUrl) await notificarSOL('recorrido_terminado', r.id);

        copia.enviado = { id: r.id, folio: r.folio, pdf_url: pdfUrl, hallazgos: r.hallazgos ?? 0, tarjetas: r.tarjetas ?? 0 };
        await guardar();
        setB(copia);
        qc.invalidateQueries({ queryKey: ['sol_mis_recorridos'] });
        qc.invalidateQueries({ queryKey: ['sol_inspecciones'] });
        onListo();
      } catch (e) {
        await guardar().catch(() => undefined);
        setB(copia);
        toast.error(`No se pudo terminar: ${errMsg(e)}. Todo sigue guardado en el celular; vuelve a intentarlo.`);
        onError();
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-3 px-4">
      <Loader2 className="w-10 h-10 animate-spin text-[#ED7102]" />
      <p className="font-bold text-slate-900">{etapa}</p>
      {avance && avance.t > 0 && (
        <div className="w-full max-w-xs">
          <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-[#ED7102]" style={{ width: `${(avance.h / avance.t) * 100}%` }} /></div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">{avance.h} de {avance.t} fotos</p>
        </div>
      )}
      <p className="text-xs text-slate-500">No cierres esta pantalla. Si se va la señal, todo queda guardado y puedes reintentar.</p>
    </div>
  );
}

const pdfLocal = new Map<string, Blob>();

/** true mientras el celular tiene conexión. */
function useEnLinea() {
  const [en, setEn] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setEn(true), off = () => setEn(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return en;
}

function Listo({ b, onInicio }: { b: BorradorRecorrido; onInicio: () => void }) {
  const e = b.enviado!;
  const [generando, setGenerando] = useState(false);
  const descargar = async () => {
    let pdf = pdfLocal.get(b.id);
    if (!pdf) {
      setGenerando(true);
      try {
        const [h, t] = await Promise.all([
          supabase.from('sol_hallazgos').select('folio, area, hallazgo, fecha_compromiso, riesgo_grave, cuenta_sol').eq('inspeccion_id', e.id).order('folio'),
          supabase.from('sol_tarjetas_rojas').select('folio, area, articulo, cantidad, destino, fecha_limite').eq('inspeccion_id', e.id).order('folio'),
        ]);
        pdf = await informeRecorridoPDF(b, e.folio, (h.data ?? []) as HallazgoPDF[], (t.data ?? []) as TarjetaPDF[]);
      } finally { setGenerando(false); }
    }
    descargarBlob(pdf, `${e.folio}_Informe_Recorrido_SOL.pdf`);
  };
  const terminar = async () => { await borrarBorrador(b.id); onInicio(); };
  return (
    <div className="space-y-4 pt-4">
      <div className="text-center space-y-1">
        <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto" />
        <h1 className="text-xl font-black text-slate-900">Recorrido enviado</h1>
        <p className="text-sm text-slate-600">{b.colegioNombre} · folio <b>{e.folio}</b></p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
        <div className="px-4 py-2.5 flex justify-between"><span className="flex items-center gap-2"><ListChecks className="w-4 h-4" />Hallazgos creados</span><b>{e.hallazgos}</b></div>
        <div className="px-4 py-2.5 flex justify-between"><span className="flex items-center gap-2"><Flag className="w-4 h-4 text-red-600" />Tarjetas rojas</span><b>{e.tarjetas}</b></div>
        <div className="px-4 py-2.5 text-[12px] text-slate-600">{e.pdf_url ? 'El informe se guardó en OneDrive y se envió por correo al director, al administrador y a la Coordinación.' : 'El informe no se pudo subir a OneDrive; descárgalo y compártelo.'}</div>
      </div>
      <button className={btnGrande} disabled={generando} onClick={descargar}>{generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Descargar informe PDF</button>
      {e.pdf_url && <a className={btnContorno + ' w-full !py-3'} href={e.pdf_url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" />Abrir en OneDrive</a>}
      <button className={btnContorno + ' w-full !py-3'} onClick={terminar}><RotateCcw className="w-4 h-4" />Listo, volver a Recorridos</button>
      <p className="text-[11px] text-slate-400 text-center">Al volver se borra la copia de este celular; el recorrido ya está en el sistema.</p>
    </div>
  );
}
