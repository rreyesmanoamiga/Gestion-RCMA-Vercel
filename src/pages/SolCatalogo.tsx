import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Save, Loader2, Info, ListChecks, Users, FileStack, Download, UploadCloud, ExternalLink, AlertTriangle, CheckCircle2, X, History,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useDirectorio } from '@/lib/directorio';
import { logAudit } from '@/lib/audit';
import { subirArchivoOneDrive } from '@/hooks/useSharePointUpload';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_AREAS, SOL_COMPONENTES, SOL_TIPOS, campusSOL, fechaCorta, hoyISO,
  type SolCriterio, type SolRenglonGuardian, type SolFormatoVersion, type SolComponente,
} from '@/lib/sol';
import { fetchCriterios, fetchRenglonesGuardianes, fetchVersionesFormatos, versionesVigentes } from '@/lib/solData';
import {
  SOL_FORMATOS, siguienteVersion, compararVersion, nombreArchivoFormato, carpetaFormatos, rangosGuardianes, CONTRASENA_SOL_F01,
  generarSOLF01, generarGuardianes, generarVoluntariado,
  type SolFormato, type CriterioFormato, type RenglonGuardian,
} from '@/lib/solFormatos';
import { inputCls, labelCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

type Tab = 'criterios' | 'guardianes' | 'formatos';
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'criterios',  label: 'Criterios de inspección', icon: ListChecks },
  { key: 'guardianes', label: 'Renglones Guardianes',    icon: Users },
  { key: 'formatos',   label: 'Formatos vigentes',       icon: FileStack },
];
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? 'Error';

// ── Contenido que define cada formato (se guarda como copia en cada versión) ─
const snapCriterios = (cs: SolCriterio[]): CriterioFormato[] =>
  cs.filter(c => c.activo).sort((a, b) => a.numero - b.numero).map(c => ({ numero: c.numero, area: c.area, tipo: c.tipo, texto: c.texto.trim() }));
const snapRenglones = (rs: SolRenglonGuardian[]): RenglonGuardian[] =>
  rs.filter(r => r.activo).sort((a, b) => a.orden - b.orden).map(r => ({ tipo: r.tipo, texto: r.texto.trim() }));
const mismo = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Resumen de cambios contra la versión anterior (para el aviso y el modal). */
function resumenCambios(antes: { texto: string }[] | null, ahora: { texto: string }[]): string {
  if (!antes) return 'La versión vigente no tiene copia del contenido; se publica con el contenido actual del catálogo.';
  const a = new Set(antes.map(x => x.texto)), b = new Set(ahora.map(x => x.texto));
  const nuevos = ahora.filter(x => !a.has(x.texto)).length;
  const quitados = antes.filter(x => !b.has(x.texto)).length;
  const partes = [`${antes.length} → ${ahora.length} renglones`];
  if (nuevos) partes.push(`${nuevos} nuevo(s) o reescrito(s)`);
  if (quitados) partes.push(`${quitados} que salen o cambiaron de redacción`);
  if (!nuevos && !quitados) partes.push('cambió el orden, el área o el tipo');
  return partes.join(' · ');
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function SolCatalogo() {
  const isAdmin = useSolAdmin();
  const [tab, setTab] = useState<Tab>('criterios');
  const { data: criterios = [], isLoading: cargandoC } = useQuery({ queryKey: ['sol_criterios_todos'], enabled: isAdmin, queryFn: () => fetchCriterios(false) });
  const { data: renglones = [], isLoading: cargandoR } = useQuery({ queryKey: ['sol_guardianes_renglones_todos'], enabled: isAdmin, queryFn: () => fetchRenglonesGuardianes(false) });
  const { data: versiones = [] } = useQuery({ queryKey: ['sol_formatos_versiones'], enabled: isAdmin, queryFn: fetchVersionesFormatos });
  const [publicando, setPublicando] = useState<SolFormato | null>(null);

  const vigentes = useMemo(() => versionesVigentes(versiones), [versiones]);
  const pendientes = useMemo(() => ({
    'SOL-F01': !mismo(vigentes['SOL-F01']?.contenido ?? null, snapCriterios(criterios)),
    'GUARDIANES': !mismo(vigentes['GUARDIANES']?.contenido ?? null, snapRenglones(renglones)),
    'SOL-V03': !vigentes['SOL-V03']?.archivo_url,
  }) as Record<SolFormato, boolean>, [vigentes, criterios, renglones]);

  if (!isAdmin) return <AccesoRestringido />;

  const activosC = criterios.filter(c => c.activo);
  const areasC = new Set(activosC.map(c => c.area)).size;
  const activosR = renglones.filter(r => r.activo).length;
  const subtitulo = tab === 'criterios'
    ? `${activosC.length} criterios activos del formato SOL-F01 en ${areasC} áreas · se usan en la captura manual y en el Excel que se envía a los campus`
    : tab === 'guardianes'
      ? `${activosR} renglones de la Bitácora del Guardián (SOL-F07) · ${activosR * 5} palomitas por semana`
      : 'Versión vigente de cada formato, historial y descarga';

  return (
    <div className="max-w-6xl mx-auto pb-24">
      <PageHeader title="Catálogo SOL" subtitle={subtitulo} />
      <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1 mb-5 w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition ${tab === t.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
            <t.icon className="w-4 h-4" />{t.label}
            {t.key === 'criterios' && pendientes['SOL-F01'] && <span className="w-2 h-2 rounded-full bg-[#ED7102]" />}
            {t.key === 'guardianes' && pendientes['GUARDIANES'] && <span className="w-2 h-2 rounded-full bg-[#ED7102]" />}
          </button>
        ))}
      </div>

      {tab === 'criterios' && (
        <>
          <AvisoPublicar formato="SOL-F01" pendiente={pendientes['SOL-F01']} vigente={vigentes['SOL-F01']} onPublicar={() => setPublicando('SOL-F01')} />
          <TabCriterios criterios={criterios} cargando={cargandoC} />
        </>
      )}
      {tab === 'guardianes' && (
        <>
          <AvisoPublicar formato="GUARDIANES" pendiente={pendientes['GUARDIANES']} vigente={vigentes['GUARDIANES']} onPublicar={() => setPublicando('GUARDIANES')} />
          <TabGuardianes renglones={renglones} cargando={cargandoR} />
        </>
      )}
      {tab === 'formatos' && <TabFormatos versiones={versiones} pendientes={pendientes} onPublicar={setPublicando} />}

      {publicando && (
        <PublicarModal formato={publicando} vigente={vigentes[publicando]} criterios={criterios} renglones={renglones}
          onClose={() => setPublicando(null)} />
      )}
    </div>
  );
}

// ── Aviso de cambios sin publicar ────────────────────────────────────────────
function AvisoPublicar({ formato, pendiente, vigente, onPublicar }: {
  formato: SolFormato; pendiente: boolean; vigente?: SolFormatoVersion; onPublicar: () => void;
}) {
  const meta = SOL_FORMATOS.find(f => f.key === formato)!;
  if (!pendiente) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-center gap-2 mb-5">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <p>El {meta.nombre} vigente (v{vigente?.version}) ya coincide con este catálogo.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900 flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
      <AlertTriangle className="w-4 h-4 shrink-0 text-[#ED7102]" />
      <p className="flex-1">
        <b>Hay cambios sin publicar.</b> El {meta.nombre} vigente es la v{vigente?.version ?? '—'}; publica la
        v{siguienteVersion(vigente?.version)} para que los campus usen el formato con estos cambios.
      </p>
      <button className={btnPrimary} onClick={onPublicar}><UploadCloud className="w-4 h-4" />Publicar v{siguienteVersion(vigente?.version)}</button>
    </div>
  );
}

// ── Criterios de inspección (SOL-F01) ────────────────────────────────────────
function TabCriterios({ criterios, cargando }: { criterios: SolCriterio[]; cargando: boolean }) {
  const qc = useQueryClient();
  const [cambios, setCambios] = useState<Record<string, Partial<SolCriterio>>>({});
  const [guardando, setGuardando] = useState(false);
  const val = <K extends keyof SolCriterio>(c: SolCriterio, k: K): SolCriterio[K] => (cambios[c.id]?.[k] as SolCriterio[K]) ?? c[k];
  const set = (c: SolCriterio, k: keyof SolCriterio, v: unknown) => setCambios(p => ({ ...p, [c.id]: { ...p[c.id], [k]: v } }));

  const guardar = async () => {
    setGuardando(true);
    try {
      for (const [id, patch] of Object.entries(cambios)) {
        const { error } = await supabase.from('sol_criterios').update(patch).eq('id', id);
        if (error) throw error;
      }
      logAudit({ accion: 'editar', modulo: 'sol', registro_ref: `Catálogo SOL (${Object.keys(cambios).length} criterio(s))` });
      setCambios({});
      qc.invalidateQueries({ queryKey: ['sol_criterios_todos'] });
      qc.invalidateQueries({ queryKey: ['sol_criterios_activos_n'] });
      toast.success('Catálogo actualizado. Publica la nueva versión del SOL-F01 cuando termines.');
    } catch (e: unknown) { toast.error(errMsg(e)); }
    finally { setGuardando(false); }
  };

  const agregar = async () => {
    const numero = (criterios.filter(c => c.numero < 100).reduce((m, c) => Math.max(m, c.numero), 0)) + 1;
    const { error } = await supabase.from('sol_criterios').insert({ numero, area: SOL_AREAS[0], tipo: 'S', texto: 'Nuevo criterio', activo: false });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['sol_criterios_todos'] });
    toast.success(`Criterio ${numero} agregado (inactivo). Edítalo y actívalo.`);
  };

  const inactivosFuera = criterios.filter(c => !SOL_AREAS.includes(val(c, 'area') as typeof SOL_AREAS[number]));
  return (
    <>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex gap-2 mb-5">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>Cada inspección guarda una copia del texto de sus criterios, así que editar aquí no altera el historial. SOL califica hábitos (despejado, ordenado, limpio); el estado del inmueble se atiende con Ticket MAS. Cuando termines de editar, publica la nueva versión del SOL-F01 para que el Excel y la captura manual coincidan.</p>
      </div>
      <div className="flex gap-2 mb-4"><button className={btnSecondary} onClick={agregar}><Plus className="w-4 h-4" />Agregar criterio</button></div>
      {cargando && <p className="text-slate-500">Cargando…</p>}
      <div className="space-y-4">
        {SOL_AREAS.map(area => {
          const lista = criterios.filter(c => val(c, 'area') === area).sort((a, b) => Number(val(b, 'activo')) - Number(val(a, 'activo')) || a.numero - b.numero);
          if (!lista.length) return null;
          return (
            <section key={area} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-[#00295A] text-white font-bold text-sm uppercase flex justify-between">
                <span>{area}</span><span className="font-semibold normal-case text-white/70">{lista.filter(c => val(c, 'activo')).length} activos</span>
              </div>
              <div className="divide-y divide-slate-100">
                {lista.map(c => <FilaCriterio key={c.id} c={c} val={val} set={set} />)}
              </div>
            </section>
          );
        })}
        {inactivosFuera.length > 0 && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-500 text-white font-bold text-sm uppercase">Otras áreas</div>
            <div className="divide-y divide-slate-100">{inactivosFuera.map(c => <FilaCriterio key={c.id} c={c} val={val} set={set} />)}</div>
          </section>
        )}
      </div>
      <BarraGuardar n={Object.keys(cambios).length} etiqueta="criterio(s)" guardando={guardando} onDescartar={() => setCambios({})} onGuardar={guardar} />
    </>
  );
}

function FilaCriterio({ c, val, set }: {
  c: SolCriterio;
  val: <K extends keyof SolCriterio>(c: SolCriterio, k: K) => SolCriterio[K];
  set: (c: SolCriterio, k: keyof SolCriterio, v: unknown) => void;
}) {
  return (
    <div className={`grid grid-cols-12 gap-2 items-center px-4 py-2 ${val(c, 'activo') ? '' : 'opacity-50'}`}>
      <span className="col-span-1 text-sm font-bold text-slate-400 tabular-nums">{c.numero}</span>
      <select className={inputCls + ' col-span-2 !py-1'} value={val(c, 'tipo')} onChange={e => set(c, 'tipo', e.target.value)}>
        {SOL_COMPONENTES.map(x => <option key={x.key} value={x.key}>{x.key} · {x.label}</option>)}
      </select>
      <input className={inputCls + ' col-span-6 !py-1'} value={val(c, 'texto')} onChange={e => set(c, 'texto', e.target.value)} />
      <select className={inputCls + ' col-span-2 !py-1'} value={val(c, 'area')} onChange={e => set(c, 'area', e.target.value)}>
        {SOL_AREAS.map(a => <option key={a}>{a}</option>)}
      </select>
      <label className="col-span-1 flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={val(c, 'activo')} onChange={e => set(c, 'activo', e.target.checked)} />Activo</label>
    </div>
  );
}

function BarraGuardar({ n, etiqueta, guardando, onDescartar, onGuardar }: { n: number; etiqueta: string; guardando: boolean; onDescartar: () => void; onGuardar: () => void }) {
  if (!n) return null;
  return (
    <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white/95 border-t border-slate-200 px-4 py-3 flex items-center justify-between z-30">
      <p className="text-sm text-amber-700 font-semibold">{n} {etiqueta} con cambios</p>
      <div className="flex gap-2">
        <button className={btnSecondary} onClick={onDescartar}>Descartar</button>
        <button className={btnPrimary} disabled={guardando} onClick={onGuardar}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</button>
      </div>
    </div>
  );
}

// ── Renglones Guardianes (SOL-F07) ───────────────────────────────────────────
const COMP_TITULO: Record<SolComponente, string> = { S: 'S · Seguridad — Cuidamos a todos', O: 'O · Orden — Cada cosa en su lugar', L: 'L · Limpieza — Todo limpio, todo el día' };

function TabGuardianes({ renglones, cargando }: { renglones: SolRenglonGuardian[]; cargando: boolean }) {
  const qc = useQueryClient();
  const [cambios, setCambios] = useState<Record<string, Partial<SolRenglonGuardian>>>({});
  const [guardando, setGuardando] = useState(false);
  const val = <K extends keyof SolRenglonGuardian>(r: SolRenglonGuardian, k: K): SolRenglonGuardian[K] => (cambios[r.id]?.[k] as SolRenglonGuardian[K]) ?? r[k];
  const set = (r: SolRenglonGuardian, k: keyof SolRenglonGuardian, v: unknown) => setCambios(p => ({ ...p, [r.id]: { ...p[r.id], [k]: v } }));

  const activos = renglones.filter(r => val(r, 'activo'));
  const { total, verde, amarillo } = rangosGuardianes(activos.length);

  const guardar = async () => {
    setGuardando(true);
    try {
      for (const [id, patch] of Object.entries(cambios)) {
        const { error } = await supabase.from('sol_guardianes_renglones').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
      }
      logAudit({ accion: 'editar', modulo: 'sol', registro_ref: `Renglones Guardianes SOL (${Object.keys(cambios).length})` });
      setCambios({});
      qc.invalidateQueries({ queryKey: ['sol_guardianes_renglones_todos'] });
      qc.invalidateQueries({ queryKey: ['sol_guardianes_renglones_n'] });
      toast.success('Renglones actualizados. Publica la nueva versión de los formatos Guardianes cuando termines.');
    } catch (e: unknown) { toast.error(errMsg(e)); }
    finally { setGuardando(false); }
  };

  const agregar = async (tipo: SolComponente) => {
    const orden = renglones.reduce((m, r) => Math.max(m, r.orden), 0) + 1;
    const { error } = await supabase.from('sol_guardianes_renglones').insert({ orden, tipo, texto: 'Nuevo renglón', activo: false });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['sol_guardianes_renglones_todos'] });
    toast.success('Renglón agregado (inactivo). Edítalo y actívalo.');
  };

  return (
    <>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex gap-2 mb-5">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Son los aspectos que los alumnos Guardianes revisan cada día en su salón (SOL-F07), escritos para que los entiendan. Con {activos.length} renglones activos
          la semana es de <b>{total} palomitas</b>: Verde {verde}–{total} · Amarillo {amarillo}–{verde - 1} · Rojo {amarillo - 1} o menos. El concentrado (SOL-F08) y la pantalla Guardianes SOL usan estos números.
        </p>
      </div>
      {cargando && <p className="text-slate-500">Cargando…</p>}
      <div className="space-y-4">
        {(['S', 'O', 'L'] as SolComponente[]).map(tipo => {
          const lista = renglones.filter(r => val(r, 'tipo') === tipo).sort((a, b) => Number(val(a, 'orden')) - Number(val(b, 'orden')));
          const color = SOL_COMPONENTES.find(x => x.key === tipo)!.color;
          return (
            <section key={tipo} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 text-white font-bold text-sm uppercase flex justify-between items-center" style={{ background: color }}>
                <span>{COMP_TITULO[tipo]}</span>
                <button className="text-xs normal-case font-semibold bg-white/15 hover:bg-white/25 rounded px-2 py-1 inline-flex items-center gap-1" onClick={() => agregar(tipo)}><Plus className="w-3.5 h-3.5" />Agregar</button>
              </div>
              <div className="divide-y divide-slate-100">
                {!lista.length && <p className="px-4 py-3 text-sm text-slate-400">Sin renglones.</p>}
                {lista.map(r => (
                  <div key={r.id} className={`grid grid-cols-12 gap-2 items-center px-4 py-2 ${val(r, 'activo') ? '' : 'opacity-50'}`}>
                    <input type="number" min={1} title="Orden" className={inputCls + ' col-span-1 !py-1 tabular-nums'} value={val(r, 'orden')} onChange={e => set(r, 'orden', Number(e.target.value) || 1)} />
                    <select className={inputCls + ' col-span-2 !py-1'} value={val(r, 'tipo')} onChange={e => set(r, 'tipo', e.target.value)}>
                      {SOL_COMPONENTES.map(x => <option key={x.key} value={x.key}>{x.key} · {x.label}</option>)}
                    </select>
                    <input className={inputCls + ' col-span-8 !py-1'} value={val(r, 'texto')} onChange={e => set(r, 'texto', e.target.value)} />
                    <label className="col-span-1 flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={val(r, 'activo')} onChange={e => set(r, 'activo', e.target.checked)} />Activo</label>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <BarraGuardar n={Object.keys(cambios).length} etiqueta="renglón(es)" guardando={guardando} onDescartar={() => setCambios({})} onGuardar={guardar} />
    </>
  );
}

// ── Formatos vigentes ────────────────────────────────────────────────────────
function useGenerador() {
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => campusSOL(directorio).map(d => [d.nombre, d.territorio === 'MEXICO' ? 'MÉXICO' : (d.territorio ?? '')] as [string, string]), [directorio]);
  return async (formato: SolFormato, version: string, contenido: unknown, vigencia: string): Promise<Blob> => {
    if (formato === 'SOL-F01') {
      if (!campus.length) throw new Error('No se pudo leer el Directorio de campus; intenta de nuevo.');
      return generarSOLF01({ version, vigencia, criterios: contenido as CriterioFormato[], areas: SOL_AREAS, campus, tipos: SOL_TIPOS.map(t => t.excel) });
    }
    if (formato === 'GUARDIANES') return generarGuardianes({ version, renglones: contenido as RenglonGuardian[] });
    return generarVoluntariado({ version });
  };
}

function TabFormatos({ versiones, pendientes, onPublicar }: { versiones: SolFormatoVersion[]; pendientes: Record<SolFormato, boolean>; onPublicar: (f: SolFormato) => void }) {
  const vigentes = versionesVigentes(versiones);
  const generar = useGenerador();
  const [descargando, setDescargando] = useState<string | null>(null);

  const descargarVersion = async (v: SolFormatoVersion) => {
    setDescargando(v.id);
    try {
      const blob = await generar(v.formato, v.version, v.contenido, fechaCorta(v.vigente_desde));
      descargar(blob, nombreArchivoFormato(v.formato, v.version));
    } catch (e: unknown) { toast.error(errMsg(e)); }
    finally { setDescargando(null); }
  };
  const puedeRegenerar = (v: SolFormatoVersion) => v.formato === 'SOL-V03' ? !!v.archivo_url || compararVersion(v.version, '1.0') > 0 : Array.isArray(v.contenido);

  return (
    <>
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {SOL_FORMATOS.map(f => {
          const v = vigentes[f.key];
          return (
            <div key={f.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-3 bg-[#00295A] text-white">
                <p className="text-[10px] font-bold tracking-widest text-white/60 uppercase">{f.clave}</p>
                <p className="font-bold">{f.nombre}</p>
              </div>
              <div className="p-4 flex-1 space-y-2 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-bold uppercase text-slate-500">Versión vigente</span>
                  <span className="text-lg font-black text-red-600 tabular-nums">{v ? `v${v.version}` : '—'}</span>
                </div>
                <p className="text-slate-600">Vigente desde <b>{v ? fechaCorta(v.vigente_desde) : '—'}</b> · {f.ext === 'xlsx' ? 'Excel' : 'Word'}</p>
                <p className="text-xs text-slate-500">Se arma con: {f.fuente}</p>
                {pendientes[f.key] && f.key !== 'SOL-V03' && (
                  <p className="text-xs font-semibold text-[#ED7102] flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Hay cambios sin publicar</p>
                )}
                {f.key === 'SOL-F01' && <p className="text-xs text-slate-500">Hojas protegidas · contraseña: <b>{CONTRASENA_SOL_F01}</b></p>}
              </div>
              <div className="px-4 pb-4 flex flex-wrap gap-2">
                {v?.archivo_url && <a href={v.archivo_url} target="_blank" rel="noreferrer" className={btnSecondary}><ExternalLink className="w-4 h-4" />OneDrive</a>}
                {v && puedeRegenerar(v) && (
                  <button className={btnSecondary} disabled={descargando === v.id} onClick={() => descargarVersion(v)}>
                    {descargando === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Descargar
                  </button>
                )}
                <button className={btnPrimary} onClick={() => onPublicar(f.key)}><UploadCloud className="w-4 h-4" />Publicar v{siguienteVersion(v?.version)}</button>
              </div>
            </div>
          );
        })}
      </div>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 bg-[#00295A] text-white font-bold text-sm uppercase flex items-center gap-2"><History className="w-4 h-4" />Historial de versiones</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-slate-500 bg-slate-50"><tr>
              <th className="text-left px-4 py-2">Formato</th><th className="text-left px-3 py-2">Versión</th><th className="text-left px-3 py-2">Vigente desde</th>
              <th className="text-left px-3 py-2">Contenido</th><th className="text-left px-3 py-2">Notas</th><th className="px-4 py-2" />
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {versiones.map(v => {
                const meta = SOL_FORMATOS.find(f => f.key === v.formato);
                const esVigente = vigentes[v.formato]?.id === v.id;
                const n = Array.isArray(v.contenido) ? v.contenido.length : null;
                return (
                  <tr key={v.id}>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{meta?.nombre ?? v.formato}</td>
                    <td className="px-3 py-2.5 tabular-nums"><span className="font-bold text-red-600">v{v.version}</span>{esVigente && <span className="ml-2 text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">Vigente</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600">{fechaCorta(v.vigente_desde)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{n !== null ? `${n} ${v.formato === 'SOL-F01' ? 'criterios' : 'renglones'}` : '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 max-w-[280px]">{v.notas ?? ''}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      {v.archivo_url && <a href={v.archivo_url} target="_blank" rel="noreferrer" className="text-[#1F4E79] hover:underline inline-flex items-center gap-1 mr-3"><ExternalLink className="w-3.5 h-3.5" />OneDrive</a>}
                      {puedeRegenerar(v) && (
                        <button className="text-[#1F4E79] hover:underline inline-flex items-center gap-1" disabled={descargando === v.id} onClick={() => descargarVersion(v)}>
                          {descargando === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Descargar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!versiones.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin versiones registradas. Corre el SQL del catálogo v1.2.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ── Publicar nueva versión ───────────────────────────────────────────────────
function PublicarModal({ formato, vigente, criterios, renglones, onClose }: {
  formato: SolFormato; vigente?: SolFormatoVersion; criterios: SolCriterio[]; renglones: SolRenglonGuardian[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const generar = useGenerador();
  const meta = SOL_FORMATOS.find(f => f.key === formato)!;
  const [version, setVersion] = useState(siguienteVersion(vigente?.version));
  const [notas, setNotas] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const contenido = formato === 'SOL-F01' ? snapCriterios(criterios) : formato === 'GUARDIANES' ? snapRenglones(renglones) : null;
  const antes = Array.isArray(vigente?.contenido) ? vigente!.contenido as { texto: string }[] : null;
  const versionValida = /^\d+\.\d+$/.test(version) && (!vigente || compararVersion(version, vigente.version) > 0);
  const vacio = Array.isArray(contenido) && contenido.length === 0;

  const publicar = async () => {
    if (!versionValida) { toast.error(`La versión debe ser mayor a la v${vigente?.version}`); return; }
    if (vacio) { toast.error('No hay renglones activos para armar el formato.'); return; }
    const vigencia = fechaCorta(hoyISO());
    const nombre = nombreArchivoFormato(formato, version);
    try {
      setTrabajando('Generando el formato…');
      const blob = await generar(formato, version, contenido, vigencia);
      descargar(blob, nombre);
      setTrabajando('Guardando en OneDrive…');
      let url: string | null = null;
      try { url = await subirArchivoOneDrive(blob, carpetaFormatos(formato, version), nombre); }
      catch { toast.warning('No se pudo guardar en OneDrive; el archivo sí se descargó. La versión se registra sin liga.'); }
      setTrabajando('Registrando la versión…');
      const { data, error } = await supabase.from('sol_formatos_versiones').insert({
        formato, version, vigente_desde: hoyISO(), contenido, archivo_url: url, archivo_nombre: nombre,
        notas: notas.trim() || null, publicado_por: user?.email ?? null,
      }).select('id').single();
      if (error) throw error;
      logAudit({ accion: 'crear', modulo: 'sol', registro_id: data?.id ?? null, registro_ref: `${meta.clave} v${version} publicado`, detalle: { formato, version, archivo_url: url } });
      qc.invalidateQueries({ queryKey: ['sol_formatos_versiones'] });
      toast.success(`${meta.nombre} v${version} publicado${url ? ' y guardado en OneDrive' : ''}`);
      onClose();
    } catch (e: unknown) {
      const m = errMsg(e);
      toast.error(m.includes('duplicate') ? `La v${version} ya existe` : m);
    } finally { setTrabajando(null); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !trabajando && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div><h3 className="font-bold text-slate-900">Publicar {meta.nombre}</h3><p className="text-xs text-slate-500">{meta.clave} · vigente hoy: v{vigente?.version ?? '—'}</p></div>
          <button onClick={onClose} disabled={!!trabajando} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div><label className={labelCls}>Nueva versión</label><input className={inputCls + ' tabular-nums font-bold text-red-600'} value={version} onChange={e => setVersion(e.target.value.trim())} /></div>
            <div className="col-span-2"><label className={labelCls}>Vigente desde</label><input className={inputCls + ' bg-slate-50'} value={fechaCorta(hoyISO())} disabled /></div>
          </div>
          {Array.isArray(contenido) && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-800 mb-1">{contenido.length} {formato === 'SOL-F01' ? `criterios en ${new Set((contenido as CriterioFormato[]).map(c => c.area)).size} áreas` : `renglones · ${contenido.length * 5} palomitas por semana`}</p>
              <p className="text-xs text-slate-500">{resumenCambios(antes, contenido)}</p>
            </div>
          )}
          {formato === 'SOL-V03' && <p className="text-sm text-slate-600">El formato de Voluntariado no depende de un catálogo; se publica con el diseño institucional vigente.</p>}
          <div><label className={labelCls}>Notas de la versión (opcional)</label>
            <textarea className={inputCls} rows={2} placeholder="Ej. Se quitan los criterios de infraestructura" value={notas} onChange={e => setNotas(e.target.value)} /></div>
          <p className="text-xs text-slate-500">Se descarga el archivo y se guarda en OneDrive en <b>{carpetaFormatos(formato, version)}</b>. Envíalo a los campus por correo; a partir de hoy el importador avisa si llega una versión anterior.</p>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          {trabajando && <span className="text-xs text-slate-500 mr-auto flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />{trabajando}</span>}
          <button className={btnSecondary} onClick={onClose} disabled={!!trabajando}>Cancelar</button>
          <button className={btnPrimary} onClick={publicar} disabled={!!trabajando || !versionValida || vacio}><UploadCloud className="w-4 h-4" />Publicar v{version}</button>
        </div>
      </div>
    </div>
  );
}
