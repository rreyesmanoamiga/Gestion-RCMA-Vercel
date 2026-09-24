import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, BarChart, Bar, LabelList,
} from 'recharts';
import {
  Gauge, ListChecks, Flag, Trophy, TrendingUp, TrendingDown, Minus, Award, Upload, MapPin, CalendarClock,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { usePermissions } from '@/hooks/usePermissions';
import { useScope } from '@/hooks/useScope';
import { useDirectorio } from '@/lib/directorio';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_AREAS, campusSOL, cicloActual, cicloLabel, nivelSOL, NIVEL_META, fmtIndice, fechaCorta, hoyISO, tipoCorto,
  type SolInspeccion, type SolResumenCampus,
} from '@/lib/sol';
import { traerTodo } from '@/lib/solData';
import { SolChip, KpiSOL, CicloSelect, inputCls, btnPrimary, useSolAdmin } from '@/components/sol/SolShared';

const MESES_CICLO = ['Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul'];
const INK = '#1F4E79';
const promedio = (v: (number | null | undefined)[]) => {
  const x = v.filter((n): n is number => n !== null && n !== undefined);
  return x.length ? Math.round((x.reduce((a, b) => a + b, 0) / x.length) * 10) / 10 : null;
};

interface FilaCampus {
  codigo: string; nombre: string; territorio: string;
  promedio: number | null; ultima: SolInspeccion | null; anterior: SolInspeccion | null; inspecciones: number;
  resumen: SolResumenCampus | null;
}

export default function SolDashboard() {
  const { isAdmin: esAdminGeneral, can } = usePermissions();
  const isAdmin = useSolAdmin();
  const { colegioEspecifico } = useScope();
  const puedeVer = esAdminGeneral || can('ver_sol');
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => campusSOL(directorio), [directorio]);
  const [ciclo, setCiclo] = useState(cicloActual());
  const [territorio, setTerritorio] = useState('');

  const { data: inspecciones = [], isLoading } = useQuery({
    queryKey: ['sol_dash_insp', ciclo],
    enabled: puedeVer,
    queryFn: async () => {
      return traerTodo<SolInspeccion>((a, b) => supabase.from('sol_inspecciones')
        .select('id, colegio, territorio, fecha, tipo, ciclo, indice, indice_s, indice_o, indice_l, por_area')
        .eq('ciclo', ciclo).order('fecha').order('id').range(a, b));
    },
  });
  const { data: resumen = [] } = useQuery({
    queryKey: ['sol_dash_resumen', ciclo],
    enabled: puedeVer,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('sol_resumen_campus', { p_ciclo: ciclo });
      if (error) throw error;
      return (data ?? []) as SolResumenCampus[];
    },
  });

  const filas: FilaCampus[] = useMemo(() => campus
    .filter(c => !territorio || c.territorio === territorio)
    .map(c => {
      const ins = inspecciones.filter(i => i.colegio === c.codigo && i.indice !== null);
      const sinBase = ins.filter(i => i.tipo !== 'linea_base');
      const usar = sinBase.length ? sinBase : ins;
      return {
        codigo: c.codigo, nombre: c.nombre, territorio: c.territorio,
        promedio: promedio(usar.map(i => i.indice)), ultima: ins[ins.length - 1] ?? null, anterior: ins[ins.length - 2] ?? null,
        inspecciones: ins.length, resumen: resumen.find(r => r.colegio === c.codigo) ?? null,
      };
    })
    .sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1) || a.nombre.localeCompare(b.nombre, 'es')), [campus, inspecciones, resumen, territorio]);

  const conIndice = filas.filter(f => f.promedio !== null);
  const nacional = promedio(conIndice.map(f => f.promedio));
  const cuenta = (n: string) => conIndice.filter(f => nivelSOL(f.promedio) === n).length;
  const hAbiertos = filas.reduce((s, f) => s + Number(f.resumen?.hallazgos_abiertos ?? 0), 0);
  const hVencidos = filas.reduce((s, f) => s + Number(f.resumen?.hallazgos_vencidos ?? 0), 0);
  const tPend = filas.reduce((s, f) => s + Number(f.resumen?.tarjetas_pendientes ?? 0), 0);
  const tVenc = filas.reduce((s, f) => s + Number(f.resumen?.tarjetas_vencidas ?? 0), 0);
  const porTerritorio = ['NORTE', 'MEXICO'].map(t => ({ t, v: promedio(filas.filter(f => f.territorio === t).map(f => f.promedio)) }));

  // Evolución mensual del índice (promedio de todas las inspecciones del mes)
  const serie = useMemo(() => {
    const idsCampus = new Set(filas.map(f => f.codigo));
    const año0 = Number(ciclo.split('-')[0]);
    return MESES_CICLO.map((m, k) => {
      const mes = (7 + k) % 12; const año = k < 5 ? año0 : año0 + 1;
      const pref = `${año}-${String(mes + 1).padStart(2, '0')}`;
      const del = inspecciones.filter(i => idsCampus.has(i.colegio) && i.fecha.startsWith(pref));
      return { mes: m, indice: promedio(del.map(i => i.indice)), n: del.length };
    });
  }, [inspecciones, filas, ciclo]);
  const hayserie = serie.some(s => s.indice !== null);

  // Promedio nacional por área (con la última inspección de cada campus)
  const areas = useMemo(() => SOL_AREAS.map(a => ({
    area: a, valor: promedio(filas.map(f => (f.ultima?.por_area?.[a] ?? null) as number | null)),
  })).filter(x => x.valor !== null).sort((a, b) => (a.valor ?? 0) - (b.valor ?? 0)), [filas]);

  // Campus sin inspección registrada en el mes en curso
  const mesActual = hoyISO().slice(0, 7);
  const sinMes = filas.filter(f => !inspecciones.some(i => i.colegio === f.codigo && i.fecha.startsWith(mesActual)));

  if (!puedeVer) return <AccesoRestringido mensaje="No tienes acceso al Tablero SOL. Pídele al administrador que active el permiso en Accesos." />;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Tablero SOL" subtitle={`Seguridad · Orden · Limpieza en los ${campus.length} campus de la red · Ciclo ${cicloLabel(ciclo)}`} />

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <CicloSelect value={ciclo} onChange={setCiclo} className="sm:w-56" />
        <select className={inputCls + ' sm:w-56'} value={territorio} onChange={e => setTerritorio(e.target.value)}>
          <option value="">Toda la red</option><option value="NORTE">Territorio NORTE</option><option value="MEXICO">Territorio MÉXICO</option>
        </select>
        {isAdmin && <Link to="/sol/inspecciones" className={btnPrimary + ' sm:ml-auto'}><Upload className="w-4 h-4" />Importar inspección</Link>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-start justify-between"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Índice SOL {territorio ? (territorio === 'MEXICO' ? 'MÉXICO' : territorio) : 'nacional'}</p><Gauge className="w-5 h-5 text-slate-400" /></div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-3xl font-black tabular-nums" style={{ color: NIVEL_META[nivelSOL(nacional)].hex }}>{fmtIndice(nacional)}</span>
            <span className={`text-xs font-bold ${NIVEL_META[nivelSOL(nacional)].texto}`}>{nivelSOL(nacional) === 'na' ? 'Sin datos' : NIVEL_META[nivelSOL(nacional)].corto}</span>
          </div>
          <p className="text-xs text-slate-500">{conIndice.length} de {filas.length} campus con inspección</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Campus por semáforo</p>
          <div className="flex gap-4 mt-2">
            {(['verde', 'ambar', 'rojo'] as const).map(n => (
              <div key={n}><p className="text-2xl font-black tabular-nums" style={{ color: NIVEL_META[n].hex }}>{cuenta(n)}</p><p className="text-[11px] text-slate-500 flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${NIVEL_META[n].dot}`} />{NIVEL_META[n].corto}</p></div>
            ))}
          </div>
        </div>
        <KpiSOL titulo="Hallazgos abiertos" valor={hAbiertos} icon={ListChecks} tono={hVencidos ? 'rojo' : 'naranja'} detalle={`${hVencidos} con más de 30 días`} />
        <KpiSOL titulo="Tarjetas rojas pendientes" valor={tPend} icon={Flag} tono={tVenc ? 'rojo' : 'slate'} detalle={`${tVenc} vencidas`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:col-span-2">
          <h2 className="text-sm font-bold text-slate-900">Evolución del Índice SOL {territorio ? '' : 'nacional'} por mes</h2>
          <p className="text-xs text-slate-500 mb-2">Promedio de las inspecciones registradas en cada mes · líneas de referencia en 85 (verde) y 70 (ámbar)</p>
          {hayserie ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serie} margin={{ top: 10, right: 16, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#EEF1F5" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#CBD5E1' }} tickLine={false} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 70, 85, 100]} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <ReferenceLine y={85} stroke="#2E7D32" strokeDasharray="4 4" label={{ value: '85', position: 'right', fill: '#2E7D32', fontSize: 10 }} />
                  <ReferenceLine y={70} stroke="#C98A00" strokeDasharray="4 4" label={{ value: '70', position: 'right', fill: '#C98A00', fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [fmtIndice(v), 'Índice SOL']} labelStyle={{ fontWeight: 700 }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }} />
                  <Line type="monotone" dataKey="indice" stroke={INK} strokeWidth={2} connectNulls dot={{ r: 4, fill: INK, stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-slate-400 py-16 text-center">Aún no hay inspecciones en este ciclo.</p>}
        </section>
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h2 className="text-sm font-bold text-slate-900">Por territorio</h2>
          <div className="space-y-3 mt-3">
            {porTerritorio.map(x => (
              <div key={x.t} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5">
                <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400" />{x.t === 'MEXICO' ? 'MÉXICO' : x.t}</span>
                <SolChip valor={x.v} conTexto />
              </div>
            ))}
          </div>
          {sinMes.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />Sin inspección este mes ({sinMes.length})</p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{sinMes.map(f => f.codigo).join(' · ')}</p>
            </div>
          )}
        </section>
      </div>

      {areas.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5">
          <h2 className="text-sm font-bold text-slate-900">Cumplimiento promedio por área</h2>
          <p className="text-xs text-slate-500 mb-2">Con la última inspección de cada campus · de la más débil a la más fuerte</p>
          <div style={{ height: areas.length * 34 + 20 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areas} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }} barSize={16}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="area" width={200} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [`${fmtIndice(v)}%`, 'Cumplimiento']} cursor={{ fill: 'rgba(148,163,184,0.08)' }} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <ReferenceLine x={85} stroke="#2E7D32" strokeDasharray="4 4" />
                <Bar dataKey="valor" fill={INK} radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="valor" position="right" formatter={(v: number) => fmtIndice(v)} style={{ fontSize: 11, fill: '#334155', fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2"><Trophy className="w-5 h-5 text-[#ED7102]" /><h2 className="font-bold text-slate-900">Ranking de campus</h2>
          <span className="text-xs text-slate-500">· promedio del ciclo sin contar la línea base</span></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
              <th className="text-right px-3 py-2.5 w-10">#</th><th className="text-left px-3 py-2.5">Campus</th><th className="text-left px-3 py-2.5">Índice SOL</th>
              <th className="text-left px-3 py-2.5">Última</th><th className="text-right px-2 py-2.5">S</th><th className="text-right px-2 py-2.5">O</th><th className="text-right px-2 py-2.5">L</th>
              <th className="text-right px-3 py-2.5">Hallazgos abiertos</th><th className="text-right px-3 py-2.5">Cerrados &lt;30 d</th>
              <th className="text-right px-3 py-2.5">Tarjetas pend.</th><th className="text-right px-3 py-2.5">Dueños</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">Cargando…</td></tr>}
              {filas.map((f, k) => {
                const r = f.resumen;
                const delta = f.ultima?.indice !== null && f.ultima?.indice !== undefined && f.anterior?.indice !== null && f.anterior?.indice !== undefined
                  ? Math.round((f.ultima.indice - f.anterior.indice) * 10) / 10 : null;
                const mio = colegioEspecifico && colegioEspecifico === f.codigo;
                const pct30 = r && Number(r.hallazgos_cerrados) ? Math.round((Number(r.hallazgos_cerrados_30) / Number(r.hallazgos_cerrados)) * 100) : null;
                const nivel = nivelSOL(f.promedio);
                return (
                  <tr key={f.codigo} className={mio ? 'bg-orange-50/70' : ''}>
                    <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-400">{f.promedio === null ? '—' : k + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{f.nombre}</span>
                        {r?.distintivos && <span title={`Campus SOL ${r.distintivos}`}><Award className="w-4 h-4 text-[#ED7102]" /></span>}
                        {mio && <span className="text-[10px] font-bold text-[#ED7102] bg-white border border-orange-200 rounded-full px-1.5">Tu campus</span>}
                      </div>
                      <p className="text-[11px] text-slate-400">{f.territorio === 'MEXICO' ? 'MÉXICO' : f.territorio} · {f.inspecciones} inspección(es)</p>
                    </td>
                    <td className="px-3 py-2.5 min-w-[160px]">
                      <div className="flex items-center gap-2">
                        <SolChip valor={f.promedio} />
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[50px]" aria-hidden>
                          <div className="h-full rounded-full" style={{ width: `${f.promedio ?? 0}%`, background: NIVEL_META[nivel].hex }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {f.ultima ? (
                        <span className="inline-flex items-center gap-1 text-slate-700 tabular-nums">
                          {fmtIndice(f.ultima.indice)}
                          {delta !== null && (delta > 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-600" aria-label="Sube" /> : delta < 0 ? <TrendingDown className="w-3.5 h-3.5 text-red-600" aria-label="Baja" /> : <Minus className="w-3.5 h-3.5 text-slate-400" />)}
                          {delta !== null && delta !== 0 && <span className={`text-[11px] ${delta > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{delta > 0 ? '+' : ''}{delta}</span>}
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                      {f.ultima && <p className="text-[10px] text-slate-400">{fechaCorta(f.ultima.fecha)} · {tipoCorto(f.ultima.tipo)}</p>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{fmtIndice(f.ultima?.indice_s)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{fmtIndice(f.ultima?.indice_o)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{fmtIndice(f.ultima?.indice_l)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r?.hallazgos_abiertos ?? 0}{Number(r?.hallazgos_vencidos) > 0 && <span className="text-red-700 text-[11px]"> ({r?.hallazgos_vencidos} +30d)</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{pct30 === null ? '—' : `${pct30}%`}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r?.tarjetas_pendientes ?? 0}{Number(r?.tarjetas_vencidas) > 0 && <span className="text-red-700 text-[11px]"> ({r?.tarjetas_vencidas} venc.)</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r?.areas_con_dueno ?? 0}/{SOL_AREAS.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />Verde 85–100 · Campus SOL</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Ámbar 70–84 · En mejora</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Rojo 0–69 · Plan de acción</span>
          <span><Award className="w-3 h-3 inline text-[#ED7102] mr-1" />Distintivo Campus SOL</span>
        </p>
      </section>
    </div>
  );
}
