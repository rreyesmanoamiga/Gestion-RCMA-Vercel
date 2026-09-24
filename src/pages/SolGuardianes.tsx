import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Loader2, Trophy, Star, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useDirectorio } from '@/lib/directorio';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_NIVELES, PALOMITAS_SEMANA, SEMANAS_TRIMESTRE, TRIMESTRE_LABEL, campusSOL, cicloActual, trimestreDe, hoyISO,
  type SolGuardianGrupo, type SolSemana,
} from '@/lib/sol';
import { CicloSelect, CampusSelect, inputCls, labelCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

/** Semáforo de la Bitácora del Guardián (SOL-F07): palomitas por semana, de 45. */
function nivelPalomitas(v: number | null | undefined) {
  if (v === null || v === undefined) return { label: '—', cls: 'bg-slate-50 text-slate-400 border-slate-200' };
  if (v >= 38) return { label: 'Verde', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (v >= 32) return { label: 'Amarillo', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'Rojo', cls: 'bg-red-50 text-red-700 border-red-200' };
}
const semanasVacias = (): SolSemana[] => Array.from({ length: SEMANAS_TRIMESTRE }, (_, i) => ({ semana: i + 1, palomitas: null, s: '', o: '', l: '' }));
function promedio(sem: SolSemana[]) {
  const v = sem.map(s => s.palomitas).filter((x): x is number => x !== null && x !== undefined && !Number.isNaN(x));
  if (!v.length) return { promedio: null, porcentaje: null };
  const p = Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
  return { promedio: p, porcentaje: Math.round((p / PALOMITAS_SEMANA) * 1000) / 10 };
}

export default function SolGuardianes() {
  const isAdmin = useSolAdmin();
  const qc = useQueryClient();
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => campusSOL(directorio), [directorio]);
  const [ciclo, setCiclo] = useState(cicloActual());
  const [trimestre, setTrimestre] = useState<number>(trimestreDe(hoyISO()));
  const [colegio, setColegio] = useState('');
  const [editando, setEditando] = useState<SolGuardianGrupo | 'nuevo' | null>(null);

  const { data: grupos = [] } = useQuery({
    queryKey: ['sol_guardianes', ciclo, colegio],
    enabled: isAdmin && !!colegio,
    queryFn: async () => {
      const { data, error } = await supabase.from('sol_guardianes').select('*').eq('ciclo', ciclo).eq('colegio', colegio).order('nivel').order('grupo');
      if (error) throw error;
      return (data ?? []) as SolGuardianGrupo[];
    },
  });

  const delTrimestre = grupos.filter(g => g.trimestre === trimestre);

  // Grupo Guardián SOL (Manual 11.3): promedio de los trimestres ≥ 85 %, sin 0 en Seguridad, con participación.
  const ranking = useMemo(() => {
    const porGrupo = new Map<string, SolGuardianGrupo[]>();
    grupos.forEach(g => { const k = `${g.nivel}|${g.grupo}`; porGrupo.set(k, [...(porGrupo.get(k) ?? []), g]); });
    const filas = Array.from(porGrupo.values()).map(rs => {
      const pcts = rs.map(r => r.porcentaje).filter((x): x is number => x !== null);
      const prom = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null;
      const ultimo = [...rs].sort((a, b) => b.trimestre - a.trimestre)[0];
      const elegible = prom !== null && prom >= 85 && ultimo.sin_seguridad_cero && rs.some(r => r.participo_recorridos);
      return { nivel: rs[0].nivel, grupo: rs[0].grupo, trimestres: rs.length, prom, elegible, sinCero: ultimo.sin_seguridad_cero, participo: rs.some(r => r.participo_recorridos) };
    });
    return SOL_NIVELES.map(n => ({ nivel: n, filas: filas.filter(f => f.nivel === n).sort((a, b) => (b.prom ?? -1) - (a.prom ?? -1)) })).filter(x => x.filas.length);
  }, [grupos]);

  const eliminar = async (g: SolGuardianGrupo) => {
    if (!confirm(`¿Eliminar el concentrado de ${g.grupo} (T${g.trimestre})?`)) return;
    const { error } = await supabase.from('sol_guardianes').delete().eq('id', g.id);
    if (error) { toast.error(error.message); return; }
    logAudit({ accion: 'eliminar', modulo: 'sol', registro_id: g.id, registro_ref: `Guardianes ${g.colegio} ${g.grupo} T${g.trimestre}` });
    qc.invalidateQueries({ queryKey: ['sol_guardianes'] });
  };

  if (!isAdmin) return <AccesoRestringido />;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Guardianes SOL" subtitle="Concentrado trimestral por grupo (SOL-F08) y Guardián del trimestre (SOL-F09) · la bitácora diaria (SOL-F07) se sigue llenando a mano" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <CampusSelect campus={campus} value={colegio} onChange={setColegio} todos={false} />
        <CicloSelect value={ciclo} onChange={setCiclo} />
        <select className={inputCls} value={trimestre} onChange={e => setTrimestre(Number(e.target.value))}>
          {[1, 2, 3].map(t => <option key={t} value={t}>{TRIMESTRE_LABEL[t]}</option>)}
        </select>
      </div>

      {!colegio ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">Elige un campus para ver o capturar sus concentrados.</div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-900">Concentrados del {TRIMESTRE_LABEL[trimestre].toLowerCase()}</h2>
            <button className={btnPrimary} onClick={() => setEditando('nuevo')}><Plus className="w-4 h-4" />Capturar grupo</button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto mb-8">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
                <th className="text-left px-4 py-3">Nivel</th><th className="text-left px-4 py-3">Grupo</th><th className="text-right px-4 py-3">Semanas</th>
                <th className="text-right px-4 py-3">Promedio (de 45)</th><th className="text-left px-4 py-3">Semáforo</th><th className="text-left px-4 py-3">Guardián del trimestre</th><th className="px-4 py-3" />
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {delTrimestre.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Sin grupos capturados en este trimestre.</td></tr>}
                {delTrimestre.map(g => {
                  const n = nivelPalomitas(g.promedio);
                  return (
                    <tr key={g.id}>
                      <td className="px-4 py-3">{g.nivel}</td><td className="px-4 py-3 font-semibold">{g.grupo}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{g.semanas.filter(s => s.palomitas !== null).length}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{g.promedio ?? '—'} <span className="text-slate-400 text-xs">({g.porcentaje ?? '—'}%)</span></td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${n.cls}`}>{n.label}</span></td>
                      <td className="px-4 py-3">{g.guardian_propuesto ? <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 text-[#ED7102]" />{g.guardian_propuesto}</span> : <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button className="p-2 rounded-md hover:bg-slate-100 text-slate-500" title="Editar" onClick={() => setEditando(g)}><Pencil className="w-4 h-4" /></button>
                        <button className="p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600" title="Eliminar" onClick={() => eliminar(g)}><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-1"><Trophy className="w-5 h-5 text-[#ED7102]" />Grupo Guardián SOL del ciclo</h2>
          <p className="text-sm text-slate-500 mb-3">Uno por nivel · promedio de los trimestres de 85% o más, ningún 0 en Seguridad en el último periodo y participación en recorridos. En empate decide el Comité SOL.</p>
          {ranking.length === 0 && <p className="text-sm text-slate-500">Aún no hay concentrados en este ciclo.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ranking.map(r => (
              <div key={r.nivel} className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-4 py-3 border-b border-slate-100 font-bold text-sm text-slate-900">{r.nivel}</div>
                <div className="divide-y divide-slate-100">
                  {r.filas.map((f, i) => (
                    <div key={f.grupo} className={`flex items-center gap-3 px-4 py-2.5 ${i === 0 && f.elegible ? 'bg-orange-50/60' : ''}`}>
                      <span className="w-6 text-sm font-bold text-slate-400 tabular-nums">{i + 1}</span>
                      <span className="flex-1 text-sm font-semibold text-slate-800">{f.grupo}<span className="text-xs font-normal text-slate-400"> · {f.trimestres} trimestre(s)</span></span>
                      <span className="text-sm tabular-nums">{f.prom ?? '—'}%</span>
                      {f.elegible
                        ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700"><ShieldCheck className="w-3.5 h-3.5" />{i === 0 ? 'Ganador' : 'Elegible'}</span>
                        : <span className="text-[11px] text-slate-400" title={!f.sinCero ? 'Tuvo 0 en Seguridad' : !f.participo ? 'Sin participación en recorridos' : 'Promedio menor a 85%'}>No elegible</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-500 mt-4">Los diplomas Guardián SOL y Grupo Guardián SOL se generan en <Link className="text-blue-600 hover:underline" to="/sol/reconocimientos">Reconocimientos y Reportes</Link>.</p>
        </>
      )}

      {editando && colegio && (
        <GrupoModal grupo={editando === 'nuevo' ? null : editando} colegio={colegio} ciclo={ciclo} trimestre={trimestre}
          onClose={() => setEditando(null)} onSaved={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['sol_guardianes'] }); }} />
      )}
    </div>
  );
}

function GrupoModal({ grupo, colegio, ciclo, trimestre, onClose, onSaved }: {
  grupo: SolGuardianGrupo | null; colegio: string; ciclo: string; trimestre: number; onClose: () => void; onSaved: () => void;
}) {
  const [nivel, setNivel] = useState(grupo?.nivel ?? 'Primaria');
  const [nombreGrupo, setNombreGrupo] = useState(grupo?.grupo ?? '');
  const [semanas, setSemanas] = useState<SolSemana[]>(() => {
    const base = semanasVacias();
    (grupo?.semanas ?? []).forEach(s => { if (s.semana >= 1 && s.semana <= SEMANAS_TRIMESTRE) base[s.semana - 1] = { ...base[s.semana - 1], ...s }; });
    return base;
  });
  const [propuesto, setPropuesto] = useState(grupo?.guardian_propuesto ?? '');
  const [sinCero, setSinCero] = useState(grupo?.sin_seguridad_cero ?? true);
  const [participo, setParticipo] = useState(grupo?.participo_recorridos ?? false);
  const [notas, setNotas] = useState(grupo?.notas ?? '');
  const [guardando, setGuardando] = useState(false);
  const calc = promedio(semanas);
  const setS = (k: number, campo: keyof SolSemana, v: string) => setSemanas(p => p.map((s, i) => {
    if (i !== k) return s;
    if (campo === 'palomitas') {
      const n = v === '' ? null : Math.max(0, Math.min(PALOMITAS_SEMANA, Number(v)));
      return { ...s, palomitas: n === null || Number.isNaN(n) ? null : n };
    }
    return { ...s, [campo]: v };
  }));

  const guardar = async () => {
    if (!nombreGrupo.trim()) { toast.error('Escribe el grupo (ej. 3° A)'); return; }
    setGuardando(true);
    try {
      const fila = {
        colegio, ciclo, trimestre: grupo?.trimestre ?? trimestre, nivel, grupo: nombreGrupo.trim(), semanas,
        promedio: calc.promedio, porcentaje: calc.porcentaje, guardian_propuesto: propuesto.trim() || null,
        sin_seguridad_cero: sinCero, participo_recorridos: participo, notas: notas || null,
      };
      const { error } = grupo
        ? await supabase.from('sol_guardianes').update(fila).eq('id', grupo.id)
        : await supabase.from('sol_guardianes').insert(fila);
      if (error) throw error;
      logAudit({ accion: grupo ? 'editar' : 'crear', modulo: 'sol', registro_id: grupo?.id ?? null, registro_ref: `Guardianes ${colegio} ${nombreGrupo} T${fila.trimestre}` });
      toast.success('Concentrado guardado');
      onSaved();
    } catch (e: unknown) {
      const m = (e as { message?: string })?.message ?? '';
      toast.error(m.includes('duplicate') ? 'Ese grupo ya está capturado en este trimestre' : m || 'Error al guardar');
    } finally { setGuardando(false); }
  };

  const n = nivelPalomitas(calc.promedio);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div><h3 className="font-bold text-slate-900">Concentrado trimestral del grupo (SOL-F08)</h3><p className="text-xs text-slate-500">{TRIMESTRE_LABEL[grupo?.trimestre ?? trimestre]}</p></div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Nivel</label><select className={inputCls} value={nivel} onChange={e => setNivel(e.target.value)}>{SOL_NIVELES.map(x => <option key={x}>{x}</option>)}</select></div>
            <div><label className={labelCls}>Grupo</label><input className={inputCls} placeholder="3° A" value={nombreGrupo} onChange={e => setNombreGrupo(e.target.value)} /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-[11px] uppercase text-slate-500"><tr>
                <th className="text-left py-1 w-16">Semana</th><th className="text-left py-1 w-28">Palomitas (de 45)</th><th className="text-left py-1">Guardián S</th><th className="text-left py-1">Guardián O</th><th className="text-left py-1">Guardián L</th>
              </tr></thead>
              <tbody>
                {semanas.map((s, k) => (
                  <tr key={s.semana}>
                    <td className="py-1 text-slate-500 tabular-nums">{s.semana}</td>
                    <td className="py-1 pr-2"><input type="number" min={0} max={PALOMITAS_SEMANA} className={inputCls + ' !py-1'} value={s.palomitas ?? ''} onChange={e => setS(k, 'palomitas', e.target.value)} /></td>
                    <td className="py-1 pr-2"><input className={inputCls + ' !py-1'} value={s.s} onChange={e => setS(k, 's', e.target.value)} /></td>
                    <td className="py-1 pr-2"><input className={inputCls + ' !py-1'} value={s.o} onChange={e => setS(k, 'o', e.target.value)} /></td>
                    <td className="py-1"><input className={inputCls + ' !py-1'} value={s.l} onChange={e => setS(k, 'l', e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm">
            <span>Promedio del trimestre: <b className="tabular-nums">{calc.promedio ?? '—'}</b> de 45 = <b className="tabular-nums">{calc.porcentaje ?? '—'}%</b></span>
            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${n.cls}`}>{n.label}</span>
          </div>
          <div><label className={labelCls}>Guardián SOL del trimestre (SOL-F09, mayor total)</label><input className={inputCls} placeholder="Nombre del alumno(a)" value={propuesto} onChange={e => setPropuesto(e.target.value)} /></div>
          <div className="flex flex-col gap-2 text-sm text-slate-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={sinCero} onChange={e => setSinCero(e.target.checked)} />Ningún criterio de Seguridad calificado con 0 en su aula en este periodo</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={participo} onChange={e => setParticipo(e.target.checked)} />El grupo participó en los recorridos del Comité SOL / Día SOL</label>
          </div>
          <div><label className={labelCls}>Notas</label><textarea className={inputCls} rows={2} value={notas} onChange={e => setNotas(e.target.value)} /></div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={guardando} onClick={guardar}>{guardando && <Loader2 className="w-4 h-4 animate-spin" />}Guardar</button>
        </div>
      </div>
    </div>
  );
}
