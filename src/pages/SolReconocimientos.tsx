import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, Star, Trophy, FileBarChart, History, Check, X as XIcon, Printer, Loader2, Minus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useDirectorio, getDirectorNacional, type DirectorioColegio } from '@/lib/directorio';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_AREAS, TRIMESTRE_LABEL, campusSOL, nombreCampus, cicloActual, cicloLabel, trimestreDe, hoyISO, fechaCorta,
  rangoCiclo, rangoTrimestre, dictaminarCampus, htmlDiplomas, htmlReporteTrimestral, imprimirHTML, fmtIndice, diasEntre,
  type SolInspeccion, type SolHallazgo, type SolTarjetaRoja, type SolComite, type SolGuardianGrupo, type SolReconocimiento, type FilaReporte,
} from '@/lib/sol';
import { traerTodo } from '@/lib/solData';
import { CicloSelect, CampusSelect, SolChip, inputCls, labelCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

type Tab = 'campus' | 'guardian' | 'grupo' | 'reporte' | 'historial';
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'campus',    label: 'Campus SOL',          icon: Award },
  { key: 'guardian',  label: 'Guardián SOL',        icon: Star },
  { key: 'grupo',     label: 'Grupo Guardián SOL',  icon: Trophy },
  { key: 'reporte',   label: 'Reporte trimestral',  icon: FileBarChart },
  { key: 'historial', label: 'Emitidos',            icon: History },
];

const ciudadDe = (nombre: string) => nombre.replace(/^Mano Amiga\s+/i, '');

export default function SolReconocimientos() {
  const isAdmin = useSolAdmin();
  const qc = useQueryClient();
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => campusSOL(directorio), [directorio]);
  const dirNacional = getDirectorNacional(directorio).nombre;
  const [tab, setTab] = useState<Tab>('campus');
  const [ciclo, setCiclo] = useState(cicloActual());

  const rango = rangoCiclo(ciclo);
  const { data, isLoading } = useQuery({
    queryKey: ['sol_reconocimientos_data', ciclo],
    enabled: isAdmin,
    queryFn: async () => {
      const [insp, hall, tarj, comites, guard, recon] = await Promise.all([
        traerTodo<SolInspeccion>((a, b) => supabase.from('sol_inspecciones').select('*').eq('ciclo', ciclo).order('id').range(a, b)),
        traerTodo<SolHallazgo>((a, b) => supabase.from('sol_hallazgos').select('*').gte('fecha', rango.desde).lte('fecha', rango.hasta).order('id').range(a, b)),
        traerTodo<SolTarjetaRoja>((a, b) => supabase.from('sol_tarjetas_rojas').select('*').neq('estatus', 'resuelto').order('id').range(a, b)),
        traerTodo<SolComite>((a, b) => supabase.from('sol_comites').select('*').eq('ciclo', ciclo).order('id').range(a, b)),
        traerTodo<SolGuardianGrupo>((a, b) => supabase.from('sol_guardianes').select('*').eq('ciclo', ciclo).order('id').range(a, b)),
        traerTodo<SolReconocimiento>((a, b) => supabase.from('sol_reconocimientos').select('*').order('created_at', { ascending: false }).range(a, b)),
      ]);
      return { insp, hall, tarj, comites, guard, recon };
    },
  });

  const registrar = async (fila: Partial<SolReconocimiento>) => {
    const { error } = await supabase.from('sol_reconocimientos').insert(fila);
    if (error) { toast.error(error.message); return false; }
    logAudit({ accion: 'crear', modulo: 'sol', registro_ref: `Reconocimiento ${fila.tipo} ${fila.colegio} ${fila.ciclo}` });
    qc.invalidateQueries({ queryKey: ['sol_reconocimientos_data'] });
    return true;
  };

  const quitar = async (r: SolReconocimiento) => {
    const { error } = await supabase.from('sol_reconocimientos').delete().eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    logAudit({ accion: 'eliminar', modulo: 'sol', registro_id: r.id, registro_ref: `Reconocimiento ${r.tipo} ${r.colegio} ${r.ciclo}` });
    qc.invalidateQueries({ queryKey: ['sol_reconocimientos_data'] });
    toast.success('Reconocimiento eliminado');
  };

  if (!isAdmin) return <AccesoRestringido />;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Reconocimientos y Reportes" subtitle="Distintivo Campus SOL (SOL-F03) · Guardián SOL (SOL-F04) · Grupo Guardián SOL (SOL-F06) · Reporte a la Dirección Nacional" />
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition ${tab === t.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>
        {tab !== 'historial' && <CicloSelect value={ciclo} onChange={setCiclo} className="md:w-56 md:ml-auto" />}
      </div>

      {isLoading || !data ? <p className="text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Cargando…</p> : (
        <>
          {tab === 'campus' && <TabCampus ciclo={ciclo} campus={campus} data={data} dirNacional={dirNacional} registrar={registrar} quitar={quitar} />}
          {tab === 'guardian' && <TabGuardian ciclo={ciclo} campus={campus} data={data} registrar={registrar} />}
          {tab === 'grupo' && <TabGrupo ciclo={ciclo} campus={campus} data={data} dirNacional={dirNacional} registrar={registrar} />}
          {tab === 'reporte' && <TabReporte ciclo={ciclo} campus={campus} data={data} />}
          {tab === 'historial' && <TabHistorial data={data} directorio={directorio} quitar={quitar} />}
        </>
      )}
    </div>
  );
}

type Data = { insp: SolInspeccion[]; hall: SolHallazgo[]; tarj: SolTarjetaRoja[]; comites: SolComite[]; guard: SolGuardianGrupo[]; recon: SolReconocimiento[] };
type Registrar = (f: Partial<SolReconocimiento>) => Promise<boolean>;
type Quitar = (r: SolReconocimiento) => Promise<void>;
type Campus = ReturnType<typeof campusSOL>;

const Marca = ({ ok, na }: { ok: boolean; na?: boolean }) => na
  ? <span className="inline-flex items-center gap-1 text-slate-400 text-xs"><Minus className="w-3.5 h-3.5" />Sin datos</span>
  : ok ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold"><Check className="w-3.5 h-3.5" />Cumple</span>
    : <span className="inline-flex items-center gap-1 text-red-700 text-xs font-bold"><XIcon className="w-3.5 h-3.5" />No cumple</span>;

function comiteDe(data: Data, colegio: string) { return data.comites.find(c => c.colegio === colegio) ?? null; }
function firmantes(data: Data, colegio: string) {
  const k = comiteDe(data, colegio);
  return {
    director: k?.integrantes?.find(i => i.rol === 'Presidente')?.nombre ?? '',
    coordinador: k?.integrantes?.find(i => i.rol.startsWith('Coordinador'))?.nombre ?? '',
  };
}

// ── Campus SOL ───────────────────────────────────────────────────────────────
function TabCampus({ ciclo, campus, data, dirNacional, registrar, quitar }: { ciclo: string; campus: Campus; data: Data; dirNacional: string; registrar: Registrar; quitar: Quitar }) {
  const [ciudad, setCiudad] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const filas = campus.map(c => ({
    c,
    d: dictaminarCampus(data.insp.filter(i => i.colegio === c.codigo), data.hall.filter(h => h.colegio === c.codigo), comiteDe(data, c.codigo)),
    otorgado: data.recon.find(r => r.tipo === 'campus' && r.colegio === c.codigo && r.ciclo === ciclo) ?? null,
  })).sort((a, b) => (b.d.promedioCiclo ?? -1) - (a.d.promedioCiclo ?? -1));

  const otorgar = async (f: typeof filas[number]) => {
    if (!f.d.cumple && !confirm('Este campus no cumple los 4 criterios del Manual. ¿Otorgar el distintivo de todos modos?')) return;
    if (await registrar({ tipo: 'campus', colegio: f.c.codigo, ciclo, beneficiarios: f.c.nombre, detalle: f.d as unknown as Record<string, unknown>, fecha_emision: fecha })) toast.success('Distintivo Campus SOL registrado');
  };
  const diploma = (f: typeof filas[number]) => imprimirHTML(htmlDiplomas({
    tipo: 'campus', campusNombre: f.c.nombre, ciclo, ciudad, fecha, beneficiarios: [], directorNacional: dirNacional,
  }));

  return (
    <div>
      <p className="text-sm text-slate-600 mb-3">Se dictamina al cierre del ciclo con el promedio del año y la última auditoría cruzada; se entrega en la reunión nacional de directores de agosto. Criterios del Manual 11.1:</p>
      <ol className="text-sm text-slate-600 list-decimal pl-5 mb-4 space-y-0.5">
        <li>Índice SOL promedio del ciclo de 85 o más (sin contar la línea base).</li>
        <li>Ninguna área en rojo en las dos últimas auditorías cruzadas.</li>
        <li>Al menos 90% de los hallazgos cerrados en menos de 30 días.</li>
        <li>100% de las áreas con dueño asignado y Comité SOL con acta vigente.</li>
      </ol>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 max-w-2xl">
        <div><label className={labelCls}>Lugar de entrega</label><input className={inputCls} placeholder="Ej. Monterrey, N.L." value={ciudad} onChange={e => setCiudad(e.target.value)} /></div>
        <div><label className={labelCls}>Fecha del diploma</label><input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
            <th className="text-left px-4 py-3">Campus</th><th className="text-left px-3 py-3">1 · Promedio ≥85</th><th className="text-left px-3 py-3">2 · Auditorías sin rojo</th>
            <th className="text-left px-3 py-3">3 · Cerrados &lt;30 d</th><th className="text-left px-3 py-3">4 · Dueños y acta</th><th className="text-left px-3 py-3">Dictamen</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map(f => (
              <tr key={f.c.codigo} className={f.d.cumple ? 'bg-emerald-50/40' : ''}>
                <td className="px-4 py-3"><p className="font-semibold text-slate-900">{f.c.nombre}</p><p className="text-[11px] text-slate-400">{f.d.inspecciones} inspección(es) en el ciclo</p></td>
                <td className="px-3 py-3"><SolChip valor={f.d.promedioCiclo} /><div className="mt-1"><Marca ok={f.d.criterios.c1} na={f.d.promedioCiclo === null} /></div></td>
                <td className="px-3 py-3"><p className="text-xs text-slate-500">{f.d.auditoriasRevisadas} de 2 auditorías</p><Marca ok={f.d.criterios.c2} na={f.d.sinRojoEnAuditorias === null} /></td>
                <td className="px-3 py-3"><p className="text-xs text-slate-500">{f.d.pctCerrados30 === null ? 'Sin hallazgos' : `${f.d.pctCerrados30}% de ${f.d.hallazgosTotal}`}</p><Marca ok={f.d.criterios.c3} /></td>
                <td className="px-3 py-3"><p className="text-xs text-slate-500">{f.d.areasConDueno}/{SOL_AREAS.length} áreas · acta {f.d.comiteConActa ? 'sí' : 'no'}</p><Marca ok={f.d.criterios.c4} /></td>
                <td className="px-3 py-3">{f.otorgado ? <span className="inline-flex items-center gap-1 text-xs font-bold text-[#ED7102]"><Award className="w-4 h-4" />Otorgado</span>
                  : f.d.cumple ? <span className="text-xs font-bold text-emerald-700">Candidato</span> : <span className="text-xs text-slate-400">No cumple</span>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {!f.otorgado
                    ? <button className={btnSecondary + ' !px-3 !py-1.5 text-xs'} onClick={() => otorgar(f)}><Award className="w-3.5 h-3.5" />Otorgar</button>
                    : <button className={btnSecondary + ' !px-3 !py-1.5 text-xs text-red-600'} onClick={() => { if (confirm(`¿Quitar el distintivo Campus SOL ${cicloLabel(ciclo)} a ${f.c.nombre}?`)) quitar(f.otorgado!); }}><Trash2 className="w-3.5 h-3.5" />Quitar</button>}
                  <button className={btnSecondary + ' !px-3 !py-1.5 text-xs ml-1'} onClick={() => diploma(f)}><Printer className="w-3.5 h-3.5" />Diploma</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Guardián SOL (individual, trimestral) ────────────────────────────────────
function TabGuardian({ ciclo, campus, data, registrar }: { ciclo: string; campus: Campus; data: Data; registrar: Registrar }) {
  const [colegio, setColegio] = useState('');
  const [trimestre, setTrimestre] = useState<number>(trimestreDe(hoyISO()));
  const [fecha, setFecha] = useState(hoyISO());
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const grupos = data.guard.filter(g => g.colegio === colegio && g.trimestre === trimestre && g.guardian_propuesto);
  const nombre = campus.find(c => c.codigo === colegio)?.nombre ?? '';
  const [ciudad, setCiudad] = useState('');
  const f = firmantes(data, colegio);

  const generar = async () => {
    const elegidos = grupos.filter(g => sel[g.id] ?? true);
    if (!elegidos.length) { toast.error('No hay guardianes seleccionados'); return; }
    // Un diploma por alumno, cada uno con su grupo
    const paginas = elegidos.map(g => htmlDiplomas({
      tipo: 'guardian', campusNombre: nombre, ciclo, ciudad: ciudad || ciudadDe(nombre), fecha,
      beneficiarios: [g.guardian_propuesto!], grupo: g.grupo, directorCampus: f.director, coordinadorComite: f.coordinador,
    }));
    const cuerpo = paginas.map(p => p.slice(p.indexOf('<body>') + 6, p.lastIndexOf('</body>'))).join('');
    imprimirHTML(paginas[0].replace(/<body>[\s\S]*<\/body>/, `<body>${cuerpo}</body>`));
    await registrar({ tipo: 'guardian', colegio, ciclo, trimestre, beneficiarios: elegidos.map(g => `${g.guardian_propuesto} (${g.grupo})`).join('\n'), fecha_emision: fecha });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-slate-600">Uno por grupo cada trimestre, al alumno con mayor puntaje en la evaluación SOL-F09. Se entrega en honores o acto cívico. Firman el Director(a) del campus y el Coordinador(a) del Comité SOL.</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2"><label className={labelCls}>Campus</label><CampusSelect campus={campus} value={colegio} onChange={setColegio} todos={false} /></div>
        <div><label className={labelCls}>Trimestre</label><select className={inputCls} value={trimestre} onChange={e => setTrimestre(Number(e.target.value))}>{[1, 2, 3].map(t => <option key={t} value={t}>T{t}</option>)}</select></div>
        <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Ciudad</label><input className={inputCls} placeholder={ciudadDe(nombre) || 'Ciudad'} value={ciudad} onChange={e => setCiudad(e.target.value)} /></div>
        <div className="sm:col-span-2 text-xs text-slate-500 self-end pb-2">Firmas: {f.director || <i>Director (captúralo en Comités SOL)</i>} · {f.coordinador || <i>Coordinador SOL</i>}</div>
      </div>
      {colegio && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
          {grupos.length === 0 && <p className="p-6 text-sm text-slate-500 text-center">No hay Guardián del trimestre capturado para este campus. Captúralo en Guardianes SOL.</p>}
          {grupos.map(g => (
            <label key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <input type="checkbox" checked={sel[g.id] ?? true} onChange={e => setSel(s => ({ ...s, [g.id]: e.target.checked }))} />
              <Star className="w-4 h-4 text-[#ED7102]" /><span className="font-semibold">{g.guardian_propuesto}</span><span className="text-slate-500">· {g.nivel} {g.grupo}</span>
            </label>
          ))}
        </div>
      )}
      <button className={btnPrimary} disabled={!grupos.length} onClick={generar}><Printer className="w-4 h-4" />Generar diplomas {TRIMESTRE_LABEL[trimestre].split(' (')[0]}</button>
    </div>
  );
}

// ── Grupo Guardián SOL (fin de curso) ────────────────────────────────────────
function TabGrupo({ ciclo, campus, data, dirNacional, registrar }: { ciclo: string; campus: Campus; data: Data; dirNacional: string; registrar: Registrar }) {
  const [colegio, setColegio] = useState('');
  const [grupoKey, setGrupoKey] = useState('');
  const [alumnos, setAlumnos] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [ciudad, setCiudad] = useState('');
  const nombre = campus.find(c => c.codigo === colegio)?.nombre ?? '';
  const f = firmantes(data, colegio);

  const opciones = useMemo(() => {
    const m = new Map<string, { nivel: string; grupo: string; pcts: number[] }>();
    data.guard.filter(g => g.colegio === colegio).forEach(g => {
      const k = `${g.nivel}|${g.grupo}`;
      const x = m.get(k) ?? { nivel: g.nivel, grupo: g.grupo, pcts: [] };
      if (g.porcentaje !== null) x.pcts.push(g.porcentaje);
      m.set(k, x);
    });
    return Array.from(m.entries()).map(([k, v]) => ({ k, ...v, prom: v.pcts.length ? Math.round((v.pcts.reduce((a, b) => a + b, 0) / v.pcts.length) * 10) / 10 : null }))
      .sort((a, b) => a.nivel.localeCompare(b.nivel) || (b.prom ?? -1) - (a.prom ?? -1));
  }, [data.guard, colegio]);
  const g = opciones.find(o => o.k === grupoKey);
  const lista = alumnos.split('\n').map(s => s.trim()).filter(Boolean);

  const generar = async () => {
    if (!g || !lista.length) { toast.error('Elige el grupo y escribe los alumnos (uno por renglón)'); return; }
    imprimirHTML(htmlDiplomas({
      tipo: 'grupo', campusNombre: nombre, ciclo, ciudad: ciudad || ciudadDe(nombre), fecha, beneficiarios: lista,
      grupo: g.grupo, nivel: g.nivel, directorCampus: f.director, coordinadorComite: f.coordinador, directorNacional: dirNacional,
    }));
    await registrar({ tipo: 'grupo', colegio, ciclo, nivel: g.nivel, grupo: g.grupo, beneficiarios: lista.join('\n'), detalle: { promedio: g.prom }, fecha_emision: fecha });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <p className="text-sm text-slate-600">Máximo reconocimiento para los alumnos: al grupo ganador de cada nivel, en la ceremonia de fin de curso. Un diploma por integrante con cuatro firmas (las dos nacionales pueden ir digitalizadas). El ranking por nivel está en Guardianes SOL.</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2"><label className={labelCls}>Campus</label><CampusSelect campus={campus} value={colegio} onChange={v => { setColegio(v); setGrupoKey(''); }} todos={false} /></div>
        <div className="sm:col-span-2"><label className={labelCls}>Grupo ganador</label>
          <select className={inputCls} value={grupoKey} onChange={e => setGrupoKey(e.target.value)} disabled={!colegio}>
            <option value="">—</option>{opciones.map(o => <option key={o.k} value={o.k}>{o.nivel} · {o.grupo} · {o.prom ?? '—'}%</option>)}
          </select></div>
        <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        <div><label className={labelCls}>Ciudad</label><input className={inputCls} placeholder={ciudadDe(nombre) || 'Ciudad'} value={ciudad} onChange={e => setCiudad(e.target.value)} /></div>
        <div className="sm:col-span-2 text-xs text-slate-500 self-end pb-2">Firmas: {f.director || <i>Director</i>} · {f.coordinador || <i>Coordinador SOL</i>} · {dirNacional || <i>Director Nacional (Directorio)</i>} · Ing. Ricardo Reyes Medina</div>
      </div>
      <div><label className={labelCls}>Integrantes del grupo (uno por renglón) · {lista.length}</label><textarea className={inputCls} rows={10} value={alumnos} onChange={e => setAlumnos(e.target.value)} placeholder={'Nombre Apellido Apellido\nNombre Apellido Apellido'} /></div>
      <button className={btnPrimary} disabled={!g || !lista.length} onClick={generar}><Printer className="w-4 h-4" />Generar {lista.length || ''} diploma(s)</button>
    </div>
  );
}

// ── Reporte trimestral a la Dirección Nacional ──────────────────────────────
function TabReporte({ ciclo, campus, data }: { ciclo: string; campus: Campus; data: Data }) {
  const [trimestre, setTrimestre] = useState<number>(trimestreDe(hoyISO()));
  const [notas, setNotas] = useState('');
  const r = rangoTrimestre(ciclo, trimestre);
  const filas: FilaReporte[] = campus.map(c => {
    const ins = data.insp.filter(i => i.colegio === c.codigo && i.fecha >= r.desde && i.fecha <= r.hasta && i.indice !== null);
    const avg = (k: 'indice' | 'indice_s' | 'indice_o' | 'indice_l') => {
      const v = ins.map(i => i[k]).filter((x): x is number => x !== null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };
    const hall = data.hall.filter(h => h.colegio === c.codigo);
    const abiertos = hall.filter(h => h.estatus !== 'cerrado');
    const cerrados = hall.filter(h => h.estatus === 'cerrado');
    const tarj = data.tarj.filter(t => t.colegio === c.codigo && t.estatus !== 'resuelto');
    return {
      colegio: c.codigo, nombre: c.nombre, territorio: c.territorio, inspecciones: ins.length,
      indice: avg('indice'), s: avg('indice_s'), o: avg('indice_o'), l: avg('indice_l'),
      hallazgosAbiertos: abiertos.length, hallazgosVencidos: abiertos.filter(h => diasEntre(h.fecha) > 30).length,
      cerrados30: cerrados.filter(h => h.fecha_cierre && diasEntre(h.fecha, h.fecha_cierre) <= 30).length, cerradosTotal: cerrados.length,
      tarjetasPendientes: tarj.length, tarjetasVencidas: tarj.filter(t => t.fecha_limite && t.fecha_limite < hoyISO()).length,
      tarjetasConTicket: tarj.filter(t => t.ticket_mas_id).length,
    };
  });
  const con = filas.filter(f => f.indice !== null);
  const prom = con.length ? con.reduce((s, f) => s + (f.indice ?? 0), 0) / con.length : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
        <div><label className={labelCls}>Trimestre</label><select className={inputCls} value={trimestre} onChange={e => setTrimestre(Number(e.target.value))}>{[1, 2, 3].map(t => <option key={t} value={t}>{TRIMESTRE_LABEL[t]}</option>)}</select></div>
        <div className="sm:col-span-2 flex items-end gap-3"><p className="text-sm text-slate-600">Índice nacional del trimestre: </p><SolChip valor={prom} conTexto /></div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
            <th className="text-left px-4 py-2">Campus</th><th className="text-right px-3 py-2">Insp.</th><th className="text-left px-3 py-2">Índice</th>
            <th className="text-right px-3 py-2">Hallazgos abiertos</th><th className="text-right px-3 py-2">Tarjetas pendientes</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {[...filas].sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1)).map(f => (
              <tr key={f.colegio}><td className="px-4 py-2">{f.nombre}</td><td className="px-3 py-2 text-right tabular-nums">{f.inspecciones}</td><td className="px-3 py-2"><SolChip valor={f.indice} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{f.hallazgosAbiertos}{f.hallazgosVencidos ? <span className="text-red-700"> ({f.hallazgosVencidos} +30d)</span> : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.tarjetasPendientes}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div><label className={labelCls}>Observaciones de la Coordinación (aparecen en el reporte)</label><textarea className={inputCls} rows={4} value={notas} onChange={e => setNotas(e.target.value)} /></div>
      <button className={btnPrimary} onClick={() => imprimirHTML(htmlReporteTrimestral(ciclo, trimestre, filas, notas))}><Printer className="w-4 h-4" />Generar reporte trimestral (PDF)</button>
      <p className="text-xs text-slate-500">Periodo: {fechaCorta(r.desde)} al {fechaCorta(r.hasta)} · Índice del campus = promedio de sus inspecciones del trimestre. Hallazgos y tarjetas: situación al día de hoy.</p>
    </div>
  );
}

function TabHistorial({ data, directorio, quitar }: { data: Data; directorio: DirectorioColegio[]; quitar: Quitar }) {
  const etiqueta: Record<string, string> = { campus: 'Campus SOL', guardian: 'Guardián SOL', grupo: 'Grupo Guardián SOL' };
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
          <th className="text-left px-4 py-3">Fecha</th><th className="text-left px-4 py-3">Reconocimiento</th><th className="text-left px-4 py-3">Campus</th>
          <th className="text-left px-4 py-3">Ciclo</th><th className="text-left px-4 py-3">Beneficiario(s)</th><th className="px-4 py-3" />
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {data.recon.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Aún no se han emitido reconocimientos.</td></tr>}
          {data.recon.map(r => (
            <tr key={r.id} className="align-top">
              <td className="px-4 py-3 whitespace-nowrap">{fechaCorta(r.fecha_emision)}</td>
              <td className="px-4 py-3 font-semibold">{etiqueta[r.tipo]}{r.trimestre ? ` · T${r.trimestre}` : ''}{r.grupo ? ` · ${r.nivel} ${r.grupo}` : ''}</td>
              <td className="px-4 py-3">{nombreCampus(directorio, r.colegio)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{cicloLabel(r.ciclo)}</td>
              <td className="px-4 py-3 text-slate-600 whitespace-pre-line">{r.tipo === 'campus' ? `Índice ${fmtIndice((r.detalle as { promedioCiclo?: number }).promedioCiclo ?? null)}` : r.beneficiarios}</td>
              <td className="px-4 py-3 text-right">
                <button className="p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600" title="Eliminar registro"
                  onClick={() => { if (confirm(`¿Eliminar este registro de ${etiqueta[r.tipo]} de ${nombreCampus(directorio, r.colegio)}?`)) quitar(r); }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
