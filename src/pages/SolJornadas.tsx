// Voluntariado SOL desde el celular: aviso de la jornada (sustituye el SOL-V03),
// llegada con las reglas aceptadas en pantalla, cierre con horas, fotos y hallazgos
// atendidos, informe en PDF y diploma Aliado SOL con la firma del Coordinador.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  HeartHandshake, Plus, ChevronLeft, Loader2, CheckCircle2, Clock, Send, FileText, Award, Share2, AlertTriangle, Minus, Ban,
  PenLine, Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useScope } from '@/hooks/useScope';
import { useDirectorio, type DirectorioColegio } from '@/lib/directorio';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_TIPOS_ALIADO, tipoAliadoLabel, campusSOL, cicloDe, hoyISO, fechaCorta, fechaLarga,
  type SolAliado, type SolApoyo, type SolHallazgo, type DatosDiploma, type SolComponente,
} from '@/lib/sol';
import { traerTodo, carpetaSOL } from '@/lib/solData';
import {
  ACTIVIDADES_VOL, REGLAS_VOL, horaActual, guardarBorrador, leerBorradores, subirFotosPendientes,
  informeJornadaPDF, diplomaPDF, compartirArchivo, notificarSOL, descargarBlob,
  type Foto, type FotoJornada,
} from '@/lib/solCampo';
import { subirArchivoOneDrive } from '@/hooks/useSharePointUpload';
import { inputCls, labelCls, useSolAdmin } from '@/components/sol/SolShared';
import { SelectorFotos, FirmaPad, BarraInferior, btnGrande, btnGrandeNaranja, btnContorno, chip } from '@/components/sol/SolCampo';

type Apoyo = SolApoyo & {
  estatus: 'aviso' | 'autorizada' | 'regresada' | 'cerrada' | 'cancelada';
  hora_inicio: string | null; hora_fin: string | null; voluntarios_esperados: number | null; actividades: string[];
  obs_coordinacion: string | null; creado_por: string | null; creado_nombre: string | null; llegada_at: string | null;
  reglas_acepta: string | null; reglas_firma: string | null; recibe_firma: string | null; informe_url: string | null;
};
interface Firma { id: string; referencia_id: string | null; estatus: 'pendiente' | 'firmada' | 'rechazada'; motivo: string | null; datos: DatosDiploma; created_at: string }
interface Campo {
  id: string; clase: 'jornada'; actualizado: string;
  llegaron: number; antes: Foto[]; despues: Foto[]; acepta: string; reglasFirma?: string;
  voluntarios: string; horas: string; hora_fin: string; hallazgos: string[]; notas: string; recibe: string; recibeFirma?: string;
}
type Vista = { v: 'inicio' } | { v: 'aviso'; editar?: Apoyo } | { v: 'llegada'; a: Apoyo } | { v: 'cierre'; a: Apoyo } | { v: 'detalle'; a: Apoyo };

const ESTATUS: Record<Apoyo['estatus'], { label: string; cls: string }> = {
  aviso:      { label: 'Esperando autorización', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  autorizada: { label: 'Autorizada',             cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  regresada:  { label: 'Regresada',              cls: 'bg-red-50 text-red-700 border-red-200' },
  cerrada:    { label: 'Cerrada',                cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  cancelada:  { label: 'Cancelada',              cls: 'bg-slate-100 text-slate-400 border-slate-200' },
};
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? 'Error';
const componentesDe = (acts: string[]): SolComponente[] => [...new Set(acts.map(a => (a === 'Orden' ? 'O' : 'L') as SolComponente))];
const listaNatural = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
const actividadTexto = (acts: string[]) => `la jornada de ${listaNatural(acts.map(a => a.toLowerCase()))}`;

/** Días hábiles (lunes a viernes) entre hoy y la fecha, sin contar hoy. */
function diasHabilesHasta(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  const fin = new Date(y, m - 1, d); const f = new Date(); f.setHours(0, 0, 0, 0);
  let n = 0;
  while (f < fin) { f.setDate(f.getDate() + 1); const w = f.getDay(); if (w !== 0 && w !== 6 && f < fin) n++; }
  return n;
}

export default function SolJornadas() {
  const esAdmin = useSolAdmin();
  const { can } = usePermissions();
  const puede = esAdmin || can('sol_recorridos');
  const [vista, setVista] = useState<Vista>({ v: 'inicio' });
  if (!puede) return <AccesoRestringido />;
  const inicio = () => setVista({ v: 'inicio' });
  return (
    <div className="max-w-xl mx-auto pb-32">
      {vista.v === 'inicio' && <Inicio ir={setVista} />}
      {vista.v === 'aviso' && <Aviso editar={vista.editar} onSalir={inicio} />}
      {vista.v === 'llegada' && <Llegada a={vista.a} onSalir={inicio} />}
      {vista.v === 'cierre' && <Cierre a={vista.a} onSalir={inicio} onCerrada={a => setVista({ v: 'detalle', a })} />}
      {vista.v === 'detalle' && <Detalle a={vista.a} onSalir={inicio} />}
    </div>
  );
}

function useDatos() {
  const { user } = useAuth();
  const esAdmin = useSolAdmin();
  return useQuery({
    queryKey: ['sol_jornadas_campo', user?.email],
    queryFn: async () => {
      const [apoyos, aliados, firmas] = await Promise.all([
        traerTodo<Apoyo>((a, z) => supabase.from('sol_apoyos').select('*').order('fecha', { ascending: false }).range(a, z)),
        traerTodo<SolAliado>((a, z) => supabase.from('sol_aliados').select('*').order('nombre').range(a, z)),
        traerTodo<Firma>((a, z) => supabase.from('sol_firmas').select('id, referencia_id, estatus, motivo, datos, created_at').order('created_at', { ascending: false }).range(a, z)),
      ]);
      const yo = (user?.email ?? '').toLowerCase();
      return { apoyos: esAdmin ? apoyos.filter(x => x.creado_por) : apoyos.filter(x => (x.creado_por ?? '').toLowerCase() === yo), aliados, firmas };
    },
  });
}

// ── Inicio ───────────────────────────────────────────────────────────────────
function Inicio({ ir }: { ir: (v: Vista) => void }) {
  const { data, isLoading } = useDatos();
  const { data: directorio = [] } = useDirectorio();
  const nombre = (c: string) => directorio.find(d => d.codigo === c)?.nombre ?? c;
  const aliado = (id: string) => data?.aliados.find(a => a.id === id)?.nombre ?? '—';
  const accion = (a: Apoyo) => {
    if (a.estatus === 'regresada') return ir({ v: 'aviso', editar: a });
    if (a.estatus === 'autorizada') return ir(a.llegada_at ? { v: 'cierre', a } : { v: 'llegada', a });
    return ir({ v: 'detalle', a });
  };
  const etiquetaAccion = (a: Apoyo) => a.estatus === 'regresada' ? 'Corregir y reenviar' : a.estatus === 'autorizada' ? (a.llegada_at ? 'Cerrar jornada' : 'Registrar llegada') : 'Ver';

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 text-white rounded-xl px-5 py-5 -mx-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-300">Programa SOL</p>
        <h1 className="text-xl font-black">Voluntariado SOL</h1>
        <p className="text-xs text-slate-300 mt-1">Avisa la jornada con 5 días hábiles, registra la llegada y ciérrala con fotos. El aliado recibe su diploma Aliado SOL.</p>
      </div>
      <button className={btnGrande} onClick={() => ir({ v: 'aviso' })}><Plus className="w-4 h-4" />Avisar nueva jornada</button>
      <section>
        <p className={labelCls}>Mis jornadas</p>
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {isLoading && <p className="px-4 py-4 text-sm text-slate-400">Cargando…</p>}
          {!isLoading && !data?.apoyos.length && <p className="px-4 py-6 text-sm text-slate-500 text-center">Aún no has avisado jornadas.</p>}
          {data?.apoyos.map(a => {
            const e = ESTATUS[a.estatus];
            return (
              <button key={a.id} className="w-full text-left px-4 py-3 flex items-center gap-3" onClick={() => accion(a)}>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-sm">{a.folio ?? '—'} · {aliado(a.aliado_id)}</p>
                  <p className="text-[11px] text-slate-500 truncate">{nombre(a.colegio)} · {fechaCorta(a.fecha)}{a.hora_inicio ? ` · ${a.hora_inicio}` : ''}</p>
                  {a.estatus !== 'cerrada' && a.estatus !== 'aviso' && a.estatus !== 'cancelada' && <p className="text-[11px] font-bold text-[#ED7102] mt-0.5">{etiquetaAccion(a)} →</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${e.cls}`}>{e.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ── Aviso (o corrección) ─────────────────────────────────────────────────────
function Aviso({ editar, onSalir }: { editar?: Apoyo; onSalir: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const esAdmin = useSolAdmin();
  const { permsRecord } = usePermissions();
  const { filtrarPorAlcance } = useScope();
  const { data: directorio = [] } = useDirectorio();
  const { data } = useDatos();
  const campus = useMemo(() => filtrarPorAlcance(campusSOL(directorio), r => r.territorio, r => r.codigo), [directorio, filtrarPorAlcance]);
  const [f, setF] = useState({
    aliado_id: editar?.aliado_id ?? '', colegio: editar?.colegio ?? '', fecha: editar?.fecha ?? '',
    hora_inicio: editar?.hora_inicio ?? '08:00', hora_fin: editar?.hora_fin ?? '12:00',
    voluntarios: editar?.voluntarios_esperados?.toString() ?? '', notas: editar?.notas ?? '',
  });
  const [acts, setActs] = useState<string[]>(editar?.actividades ?? []);
  const [hall, setHall] = useState<string[]>(editar?.hallazgos_ids ?? []);
  const [nuevo, setNuevo] = useState<{ nombre: string; tipo: string; contacto: string; tel: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  const { data: abiertos = [], isFetching } = useQuery({
    queryKey: ['sol_hallazgos_abiertos_campo', f.colegio],
    enabled: !!f.colegio,
    queryFn: async () => {
      const { data: h, error } = await supabase.from('sol_hallazgos').select('id, folio, area, hallazgo, estatus').eq('colegio', f.colegio).neq('estatus', 'cerrado').order('fecha', { ascending: false }).limit(200);
      if (error) throw error;
      return (h ?? []) as Pick<SolHallazgo, 'id' | 'folio' | 'area' | 'hallazgo' | 'estatus'>[];
    },
  });
  const habiles = f.fecha ? diasHabilesHasta(f.fecha) : null;
  const pocaAnticipacion = habiles !== null && habiles < 5 && !esAdmin;

  const enviar = async () => {
    if (!f.colegio || !f.fecha || (!f.aliado_id && !nuevo?.nombre.trim()) || !acts.length) { toast.error('Colegio, aliado, fecha y al menos una actividad son obligatorios'); return; }
    if (pocaAnticipacion) { toast.error('El aviso va con 5 días hábiles de anticipación'); return; }
    setGuardando(true);
    try {
      let aliadoId = f.aliado_id;
      if (!aliadoId && nuevo) {
        const { data: al, error } = await supabase.from('sol_aliados').insert({ nombre: nuevo.nombre.trim(), tipo: nuevo.tipo, contacto_nombre: nuevo.contacto.trim() || null, contacto_telefono: nuevo.tel.trim() || null, activo: true }).select('id').single();
        if (error) throw new Error(error.code === '23505' ? 'Ya existe un aliado con ese nombre; elígelo de la lista' : error.message);
        aliadoId = al.id;
      }
      const c = directorio.find(d => d.codigo === f.colegio);
      const campos = {
        aliado_id: aliadoId, fecha: f.fecha, ciclo: cicloDe(f.fecha), hora_inicio: f.hora_inicio, hora_fin: f.hora_fin,
        voluntarios_esperados: f.voluntarios ? Number(f.voluntarios) : null, actividades: acts, actividad: actividadTexto(acts),
        componentes: componentesDe(acts), hallazgos_ids: hall, notas: f.notas.trim() || null,
      };
      let id = editar?.id;
      if (editar) {
        const { error } = await supabase.from('sol_apoyos').update({ ...campos, estatus: 'aviso' }).eq('id', editar.id);
        if (error) throw error;
      } else {
        const pr = (permsRecord ?? {}) as Record<string, unknown>;
        const { data: ins, error } = await supabase.from('sol_apoyos').insert({
          ...campos, colegio: f.colegio, territorio: c?.territorio ?? null, estatus: 'aviso',
          creado_por: (user?.email ?? '').toLowerCase(), creado_nombre: String(pr.nombre ?? user?.user_metadata?.nombre ?? user?.email ?? ''),
        }).select('id').single();
        if (error) throw error;
        id = ins.id;
      }
      await notificarSOL('jornada_aviso', id!);
      toast.success('Aviso enviado a la Coordinación');
      qc.invalidateQueries({ queryKey: ['sol_jornadas_campo'] });
      onSalir();
    } catch (e) { toast.error(errMsg(e)); }
    finally { setGuardando(false); }
  };

  return (
    <div className="space-y-4">
      <button onClick={onSalir} className="inline-flex items-center gap-1 text-sm text-slate-500"><ChevronLeft className="w-4 h-4" />Voluntariado</button>
      <div>
        <h1 className="text-xl font-black text-slate-900">{editar ? `Corregir aviso ${editar.folio ?? ''}` : 'Aviso de jornada'}</h1>
        <p className="text-xs text-slate-500">Con 5 días hábiles de anticipación. La Coordinación la autoriza o la regresa con observaciones.</p>
      </div>
      {editar?.obs_coordinacion && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800"><b>Observaciones de la Coordinación:</b> {editar.obs_coordinacion}</p>}
      <div><label className={labelCls}>Colegio</label>
        {editar ? <p className="text-sm font-semibold py-2">{directorio.find(d => d.codigo === f.colegio)?.nombre ?? f.colegio}</p> : (
          <select className={inputCls + ' !py-2.5'} value={f.colegio} onChange={e => { set('colegio', e.target.value); setHall([]); }}>
            <option value="">Elige el colegio…</option>{campus.map(c => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
          </select>)}</div>
      <div><label className={labelCls}>Aliado</label>
        {nuevo ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <input className={inputCls} placeholder="Nombre (como saldrá en el diploma)" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
            <div className="flex flex-wrap gap-1.5">{SOL_TIPOS_ALIADO.map(t => <button key={t.key} type="button" className={chip(nuevo.tipo === t.key)} onClick={() => setNuevo({ ...nuevo, tipo: t.key })}>{t.label}</button>)}</div>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="Contacto" value={nuevo.contacto} onChange={e => setNuevo({ ...nuevo, contacto: e.target.value })} />
              <input className={inputCls} placeholder="Teléfono" inputMode="tel" value={nuevo.tel} onChange={e => setNuevo({ ...nuevo, tel: e.target.value })} />
            </div>
            <button className="text-xs text-slate-500 underline" onClick={() => setNuevo(null)}>Elegir de la lista</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select className={inputCls + ' !py-2.5'} value={f.aliado_id} onChange={e => set('aliado_id', e.target.value)}>
              <option value="">Elige el aliado…</option>
              {(data?.aliados ?? []).filter(a => a.activo || a.id === f.aliado_id).map(a => <option key={a.id} value={a.id}>{a.nombre} · {tipoAliadoLabel(a.tipo)}</option>)}
            </select>
            <button className={btnContorno + ' shrink-0'} onClick={() => { setNuevo({ nombre: '', tipo: 'empresa', contacto: '', tel: '' }); set('aliado_id', ''); }}><Plus className="w-4 h-4" />Nuevo</button>
          </div>
        )}</div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-3"><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={f.fecha} min={hoyISO()} onChange={e => set('fecha', e.target.value)} />
          {pocaAnticipacion && <p className="text-[11px] font-bold text-red-700 mt-1">Faltan {habiles} día(s) hábil(es); el aviso va con 5 días hábiles.</p>}</div>
        <div><label className={labelCls}>De</label><input type="time" className={inputCls} value={f.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} /></div>
        <div><label className={labelCls}>A</label><input type="time" className={inputCls} value={f.hora_fin} onChange={e => set('hora_fin', e.target.value)} /></div>
        <div><label className={labelCls}>Voluntarios</label><input type="number" min="1" inputMode="numeric" className={inputCls} value={f.voluntarios} onChange={e => set('voluntarios', e.target.value)} /></div>
      </div>
      <div><label className={labelCls}>Actividades</label>
        <div className="flex flex-wrap gap-1.5">{ACTIVIDADES_VOL.map(a => <button key={a} type="button" className={chip(acts.includes(a))} onClick={() => setActs(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a])}>{a}</button>)}</div>
        <p className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-800 flex gap-2"><Ban className="w-4 h-4 shrink-0" /><span><b>No se permite:</b> trabajos en altura, eléctricos o de gas. Esos van con Ticket MAS.</span></p></div>
      {f.colegio && (
        <div><label className={labelCls}>Hallazgos que van a atender {isFetching && <Loader2 className="w-3 h-3 animate-spin inline" />}</label>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {!abiertos.length && <p className="px-3 py-3 text-xs text-slate-400">Sin hallazgos abiertos en este colegio.</p>}
            {abiertos.map(h => (
              <label key={h.id} className="flex items-start gap-2 px-3 py-2 text-[12px]">
                <input type="checkbox" className="mt-0.5" checked={hall.includes(h.id)} onChange={() => setHall(p => p.includes(h.id) ? p.filter(x => x !== h.id) : [...p, h.id])} />
                <span><b>{h.folio}</b> · {h.area ?? '—'}<br /><span className="text-slate-600">{h.hallazgo}</span></span>
              </label>
            ))}
          </div></div>
      )}
      <div><label className={labelCls}>Notas para la Coordinación</label><textarea className={inputCls} rows={2} value={f.notas} onChange={e => set('notas', e.target.value)} /></div>
      <BarraInferior><button className={btnGrande} disabled={guardando} onClick={enviar}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{editar ? 'Reenviar a la Coordinación' : 'Enviar a la Coordinación'}</button></BarraInferior>
    </div>
  );
}

// ── Borrador de campo de la jornada (fotos y firmas en el celular) ───────────
function useCampo(a: Apoyo) {
  const [c, setC] = useState<Campo | null>(null);
  useEffect(() => {
    leerBorradores<Campo>('jornada').then(xs => setC(xs.find(x => x.id === a.id) ?? {
      id: a.id, clase: 'jornada', actualizado: '', llegaron: a.voluntarios_esperados ?? 0, antes: [], despues: [], acepta: a.reglas_acepta ?? '',
      voluntarios: String(a.voluntarios ?? a.voluntarios_esperados ?? ''), horas: '', hora_fin: a.hora_fin ?? '', hallazgos: a.hallazgos_ids ?? [], notas: '', recibe: '',
    }));
  }, [a.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = useRef<number | null>(null);
  const cambiar = (patch: Partial<Campo>) => setC(p => {
    if (!p) return p;
    const n = { ...p, ...patch };
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => { guardarBorrador(n).catch(() => undefined); }, 400);
    return n;
  });
  return [c, cambiar] as const;
}

function Cabecera({ a, titulo, onSalir }: { a: Apoyo; titulo: string; onSalir: () => void }) {
  const { data } = useDatos();
  const { data: directorio = [] } = useDirectorio();
  return (
    <>
      <button onClick={onSalir} className="inline-flex items-center gap-1 text-sm text-slate-500"><ChevronLeft className="w-4 h-4" />Voluntariado</button>
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#ED7102]">{titulo} · {a.folio}</p>
        <p className="font-black text-slate-900">{data?.aliados.find(x => x.id === a.aliado_id)?.nombre ?? '—'}</p>
        <p className="text-[11px] text-slate-500">{directorio.find(d => d.codigo === a.colegio)?.nombre ?? a.colegio} · {fechaCorta(a.fecha)} · {a.hora_inicio ?? ''}–{a.hora_fin ?? ''}</p>
      </div>
    </>
  );
}

// ── Llegada ──────────────────────────────────────────────────────────────────
function Llegada({ a, onSalir }: { a: Apoyo; onSalir: () => void }) {
  const qc = useQueryClient();
  const [c, cambiar] = useCampo(a);
  const [guardando, setGuardando] = useState(false);
  const [avance, setAvance] = useState('');
  if (!c) return <p className="p-6 text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline" /> Cargando…</p>;

  const iniciar = async () => {
    if (!c.acepta.trim() || !c.reglasFirma) { toast.error('Falta el nombre y la firma del responsable del aliado'); return; }
    setGuardando(true);
    try {
      const copia = { ...c };
      await subirFotosPendientes(copia.antes, carpetaSOL(a.colegio, a.ciclo, `Voluntariado/${a.folio}`), `${a.folio}_antes`, (h, t) => setAvance(t ? `Subiendo fotos ${h} de ${t}` : ''), () => guardarBorrador(copia));
      const fotos: FotoJornada[] = copia.antes.map(f => ({ url: f.url!, nombre: f.nombre, momento: 'antes' as const }));
      const { error } = await supabase.from('sol_apoyos').update({
        llegada_at: new Date().toISOString(), voluntarios: c.llegaron || null, reglas_acepta: c.acepta.trim(), reglas_firma: c.reglasFirma, fotos,
      }).eq('id', a.id);
      if (error) throw error;
      await guardarBorrador({ ...copia, voluntarios: String(c.llegaron || '') });
      toast.success('Jornada iniciada');
      qc.invalidateQueries({ queryKey: ['sol_jornadas_campo'] });
      onSalir();
    } catch (e) { toast.error(`${errMsg(e)}. Lo capturado sigue guardado en el celular.`); }
    finally { setGuardando(false); setAvance(''); }
  };

  return (
    <div className="space-y-4">
      <Cabecera a={a} titulo="Llegada" onSalir={onSalir} />
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <div><p className="text-[10px] font-bold uppercase text-slate-500">Voluntarios que llegaron</p><p className="text-3xl font-black tabular-nums">{c.llegaron}</p></div>
        <div className="flex gap-2">
          <button className="w-11 h-11 rounded-lg border border-slate-300 flex items-center justify-center" onClick={() => cambiar({ llegaron: Math.max(0, c.llegaron - 1) })} aria-label="Menos"><Minus className="w-4 h-4" /></button>
          <button className="w-11 h-11 rounded-lg bg-slate-900 text-white flex items-center justify-center" onClick={() => cambiar({ llegaron: c.llegaron + 1 })} aria-label="Más"><Plus className="w-4 h-4" /></button>
        </div>
      </div>
      <SelectorFotos etiqueta="Fotos del antes" fotos={c.antes} onChange={antes => cambiar({ antes })} max={8} />
      <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
        <p className="text-[11px] font-bold uppercase text-[#ED7102] mb-1.5">Reglas de seguridad y conducta</p>
        <ul className="text-[13px] text-slate-700 space-y-1 list-disc pl-4">{REGLAS_VOL.map(r => <li key={r}>{r}</li>)}</ul>
      </div>
      <div><label className={labelCls}>Responsable del aliado que acepta</label><input className={inputCls} value={c.acepta} onChange={e => cambiar({ acepta: e.target.value })} placeholder="Nombre completo" /></div>
      <FirmaPad etiqueta="Firma de aceptación" nombre={c.acepta} valor={c.reglasFirma} onChange={v => cambiar({ reglasFirma: v })} />
      <BarraInferior>
        <button className={btnGrande} disabled={guardando} onClick={iniciar}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}{avance || 'Iniciar jornada'}</button>
      </BarraInferior>
    </div>
  );
}

// ── Cierre ───────────────────────────────────────────────────────────────────
function Cierre({ a, onSalir, onCerrada }: { a: Apoyo; onSalir: () => void; onCerrada: (a: Apoyo) => void }) {
  const qc = useQueryClient();
  const { data } = useDatos();
  const { data: directorio = [] } = useDirectorio();
  const [c, cambiar] = useCampo(a);
  const [guardando, setGuardando] = useState(false);
  const [etapa, setEtapa] = useState('');
  const { data: hallazgos = [] } = useQuery({
    queryKey: ['sol_hallazgos_jornada', a.id],
    queryFn: async () => {
      const { data: h } = await supabase.from('sol_hallazgos').select('id, folio, area, hallazgo, estatus').eq('colegio', a.colegio).or(`estatus.neq.cerrado,id.in.(${(a.hallazgos_ids ?? []).join(',') || '00000000-0000-0000-0000-000000000000'})`).limit(200);
      return (h ?? []) as Pick<SolHallazgo, 'id' | 'folio' | 'area' | 'hallazgo' | 'estatus'>[];
    },
  });
  if (!c) return <p className="p-6 text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline" /> Cargando…</p>;
  const hv = (Number(c.voluntarios) || 0) * (Number(c.horas) || 0);

  const cerrar = async () => {
    if (!c.voluntarios || !c.horas) { toast.error('Captura voluntarios y horas'); return; }
    if (!c.recibe.trim()) { toast.error('Falta quién recibe por el colegio'); return; }
    setGuardando(true);
    try {
      const copia = { ...c };
      setEtapa('Subiendo fotos');
      await subirFotosPendientes(copia.despues, carpetaSOL(a.colegio, a.ciclo, `Voluntariado/${a.folio}`), `${a.folio}_despues`, (h, t) => setEtapa(t ? `Subiendo fotos ${h} de ${t}` : 'Subiendo fotos'), () => guardarBorrador(copia));
      const fotos: FotoJornada[] = [
        ...(a.fotos ?? []).filter(f => f.momento === 'antes'),
        ...copia.despues.map(f => ({ url: f.url!, nombre: f.nombre, momento: 'despues' as const })),
      ];
      setEtapa('Cerrando la jornada');
      const { error } = await supabase.rpc('sol_cerrar_jornada', { p_id: a.id, p: {
        voluntarios: c.voluntarios, horas: c.horas, hora_fin: c.hora_fin || horaActual(), fotos, hallazgos_ids: c.hallazgos, tarjetas_ids: [],
        notas: c.notas, responsable_campus: c.recibe.trim(), recibe_firma: c.recibeFirma ?? null,
      } });
      if (error) throw error;

      setEtapa('Generando el informe');
      const aliado = data?.aliados.find(x => x.id === a.aliado_id);
      const colegioNombre = directorio.find(d => d.codigo === a.colegio)?.nombre ?? a.colegio;
      const pdf = await informeJornadaPDF({
        folio: a.folio ?? '', colegioNombre, aliado: aliado?.nombre ?? '—', tipoAliado: tipoAliadoLabel(aliado?.tipo), fecha: a.fecha,
        horario: `${a.hora_inicio ?? ''}–${c.hora_fin || a.hora_fin || ''}`, actividades: a.actividades ?? [], voluntarios: Number(c.voluntarios), horas: Number(c.horas),
        responsable: c.recibe, acepta: a.reglas_acepta ?? c.acepta, creado: a.creado_nombre ?? '', notas: c.notas,
        hallazgos: hallazgos.filter(h => c.hallazgos.includes(h.id)).map(h => ({ folio: h.folio, hallazgo: h.hallazgo })),
        fotos: [...c.antes.map(f => ({ thumb: f.thumb, momento: 'antes' as const })), ...c.despues.map(f => ({ thumb: f.thumb, momento: 'despues' as const }))],
        reglasFirma: a.reglas_firma, recibeFirma: c.recibeFirma,
      });
      setEtapa('Guardando el informe');
      try {
        const url = await subirArchivoOneDrive(pdf, carpetaSOL(a.colegio, a.ciclo, `Voluntariado/${a.folio}`), `${a.folio}_Informe_Jornada.pdf`);
        await supabase.rpc('sol_jornada_informe', { p_id: a.id, p_url: url });
      } catch { descargarBlob(pdf, `${a.folio}_Informe_Jornada.pdf`); toast.error('El informe no se pudo subir; se descargó en el celular.'); }
      toast.success('Jornada cerrada');
      qc.invalidateQueries({ queryKey: ['sol_jornadas_campo'] });
      const { data: fresca } = await supabase.from('sol_apoyos').select('*').eq('id', a.id).single();
      onCerrada((fresca ?? a) as Apoyo);
    } catch (e) { toast.error(`${errMsg(e)}. Lo capturado sigue guardado en el celular.`); }
    finally { setGuardando(false); setEtapa(''); }
  };

  return (
    <div className="space-y-4">
      <Cabecera a={a} titulo="Cierre" onSalir={onSalir} />
      <div className="grid grid-cols-3 gap-2">
        <div><label className={labelCls}>Voluntarios</label><input type="number" min="0" inputMode="numeric" className={inputCls} value={c.voluntarios} onChange={e => cambiar({ voluntarios: e.target.value })} /></div>
        <div><label className={labelCls}>Horas</label><input type="number" min="0" step="0.5" inputMode="decimal" className={inputCls} value={c.horas} onChange={e => cambiar({ horas: e.target.value })} /></div>
        <div><label className={labelCls}>Horas-vol.</label><p className="py-2 text-lg font-black text-emerald-700 tabular-nums">{Math.round(hv * 10) / 10 || '—'}</p></div>
      </div>
      <SelectorFotos etiqueta="Fotos del después" fotos={c.despues} onChange={despues => cambiar({ despues })} max={8} />
      <div><label className={labelCls}>Hallazgos atendidos · se cierran al terminar</label>
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {!hallazgos.length && <p className="px-3 py-3 text-xs text-slate-400">Sin hallazgos abiertos en este colegio.</p>}
          {hallazgos.map(h => (
            <label key={h.id} className="flex items-start gap-2 px-3 py-2 text-[12px]">
              <input type="checkbox" className="mt-0.5" checked={c.hallazgos.includes(h.id)} onChange={() => cambiar({ hallazgos: c.hallazgos.includes(h.id) ? c.hallazgos.filter(x => x !== h.id) : [...c.hallazgos, h.id] })} />
              <span><b>{h.folio}</b> · {h.area ?? '—'}<br /><span className="text-slate-600">{h.hallazgo}</span></span>
            </label>
          ))}
        </div></div>
      <div><label className={labelCls}>Observaciones</label><textarea className={inputCls} rows={2} value={c.notas} onChange={e => cambiar({ notas: e.target.value })} placeholder="Ej. Se pintaron 40 m de barda" /></div>
      <div><label className={labelCls}>Recibe por el colegio</label><input className={inputCls} value={c.recibe} onChange={e => cambiar({ recibe: e.target.value })} placeholder="Nombre completo" /></div>
      <FirmaPad etiqueta="Firma de quien recibe" nombre={c.recibe} valor={c.recibeFirma} onChange={v => cambiar({ recibeFirma: v })} />
      <BarraInferior>
        <button className={btnGrandeNaranja} disabled={guardando} onClick={cerrar}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}{etapa || 'Cerrar jornada'}</button>
      </BarraInferior>
    </div>
  );
}

// ── Detalle: estatus, informe y diploma ──────────────────────────────────────
function Detalle({ a, onSalir }: { a: Apoyo; onSalir: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const esAdmin = useSolAdmin();
  const { permsRecord } = usePermissions();
  const { data } = useDatos();
  const { data: directorio = [] } = useDirectorio();
  const [trabajando, setTrabajando] = useState(false);
  const firma = data?.firmas.find(f => f.referencia_id === a.id);
  const aliado = data?.aliados.find(x => x.id === a.aliado_id);
  const colegio: DirectorioColegio | undefined = directorio.find(d => d.codigo === a.colegio);
  const datosDiploma = (): DatosDiploma => ({
    tipo: 'aliado', campusNombre: colegio?.nombre ?? a.colegio, ciclo: a.ciclo, ciudad: (colegio?.nombre ?? '').replace(/^Mano Amiga\s+/i, ''),
    fecha: a.fecha, beneficiarios: [], aliadoNombre: aliado?.nombre ?? '', actividad: a.actividad, fechaApoyo: a.fecha, directorCampus: colegio?.dir_nombre ?? '',
  });

  const solicitar = async () => {
    setTrabajando(true);
    try {
      const pr = (permsRecord ?? {}) as Record<string, unknown>;
      const { data: ins, error } = await supabase.from('sol_firmas').insert({
        tipo: 'aliado', referencia_id: a.id, colegio: a.colegio, titulo: `Aliado SOL · ${aliado?.nombre ?? ''} · ${colegio?.nombre ?? a.colegio}`,
        datos: datosDiploma(), solicitado_por: (user?.email ?? '').toLowerCase(), solicitado_nombre: String(pr.nombre ?? user?.user_metadata?.nombre ?? ''),
      }).select('id').single();
      if (error) throw error;
      await notificarSOL('firma_solicitada', ins.id);
      toast.success('Se pidió la firma al Coordinador; te avisaremos por correo cuando esté firmado');
      qc.invalidateQueries({ queryKey: ['sol_jornadas_campo'] });
    } catch (e) { toast.error(errMsg(e)); }
    finally { setTrabajando(false); }
  };
  const compartir = async () => {
    setTrabajando(true);
    try {
      const pdf = await diplomaPDF(firma?.datos ?? datosDiploma(), { firmaCoordinador: true });
      const r = await compartirArchivo(pdf, `Aliado_SOL_${(aliado?.nombre ?? 'aliado').replace(/[^A-Za-z0-9]+/g, '_')}.pdf`, `Diploma Aliado SOL · ${aliado?.nombre ?? ''}`);
      if (r === 'descargado') toast.success('Diploma descargado');
    } catch (e) { toast.error(errMsg(e)); }
    finally { setTrabajando(false); }
  };

  const e = ESTATUS[a.estatus];
  return (
    <div className="space-y-4">
      <Cabecera a={a} titulo="Jornada" onSalir={onSalir} />
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
        <div className="px-4 py-2.5 flex justify-between items-center"><span>Estatus</span><span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${e.cls}`}>{e.label}</span></div>
        <div className="px-4 py-2.5 flex justify-between"><span>Actividades</span><b className="text-right">{(a.actividades ?? []).join(', ') || a.actividad}</b></div>
        {a.estatus === 'cerrada' && <div className="px-4 py-2.5 flex justify-between"><span>Voluntarios × horas</span><b className="tabular-nums">{a.voluntarios ?? '—'} × {a.horas ?? '—'}</b></div>}
        {a.estatus === 'aviso' && <div className="px-4 py-2.5 text-[12px] text-slate-600 flex gap-2"><Clock className="w-4 h-4 shrink-0" />La Coordinación revisa el aviso; te llegará un correo cuando lo autorice.</div>}
      </div>
      {a.informe_url && <a className={btnContorno + ' w-full !py-3'} href={a.informe_url} target="_blank" rel="noreferrer"><FileText className="w-4 h-4" />Ver informe de la jornada</a>}

      {a.estatus === 'cerrada' && (
        <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <p className="font-bold text-slate-900 flex items-center gap-2"><Award className="w-4 h-4 text-emerald-600" />Diploma Aliado SOL</p>
          {esAdmin || firma?.estatus === 'firmada' ? (
            <>
              <p className="text-[12px] text-emerald-700 flex gap-1.5"><CheckCircle2 className="w-4 h-4 shrink-0" />Firmado por el Coordinador. Listo para enviarse.</p>
              <button className={btnGrandeNaranja} disabled={trabajando} onClick={compartir}>{trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}Compartir o descargar el diploma</button>
            </>
          ) : firma?.estatus === 'pendiente' ? (
            <p className="text-[12px] text-amber-700 flex gap-1.5"><Clock className="w-4 h-4 shrink-0" />Firma solicitada el {fechaCorta(firma.created_at.slice(0, 10))}. Te avisaremos por correo cuando el Coordinador la firme.</p>
          ) : (
            <>
              {firma?.estatus === 'rechazada' && <p className="text-[12px] text-red-700 flex gap-1.5"><AlertTriangle className="w-4 h-4 shrink-0" />La firma se regresó: {firma.motivo || 'sin motivo'}. Revisa y vuelve a solicitarla.</p>}
              <p className="text-[12px] text-slate-600">El diploma lleva la firma del Coordinador de Obras y Mantenimiento. Solicítala y te llegará un correo cuando esté firmado.</p>
              <button className={btnGrande} disabled={trabajando} onClick={solicitar}>{trabajando ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}Solicitar firma del Coordinador</button>
            </>
          )}
          <p className="text-[11px] text-slate-400">Se otorga a {aliado?.nombre ?? '—'} por {a.actividad}, el {fechaLarga(a.fecha)}.</p>
        </section>
      )}
      {a.estatus === 'aviso' && <p className="text-[12px] text-slate-500 text-center">Para cambiar algo, pide a la Coordinación que regrese el aviso con observaciones.</p>}
      <p className="text-[11px] text-slate-400 text-center"><HeartHandshake className="w-3.5 h-3.5 inline" /> Voluntariado SOL · {data?.aliados.find(x => x.id === a.aliado_id)?.nombre}</p>
    </div>
  );
}
