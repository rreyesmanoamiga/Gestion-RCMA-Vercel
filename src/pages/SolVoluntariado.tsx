import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  HeartHandshake, Building2, Trophy, Plus, Pencil, Trash2, X, Loader2, Printer, Users, Clock, Camera,
  Search, ListChecks, Flag, Award, ImagePlus, ExternalLink, Phone, Mail,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useDirectorio, getDirectorNacional, type DirectorioColegio } from '@/lib/directorio';
import { logAudit } from '@/lib/audit';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_AREAS, SOL_COMPONENTES, SOL_TIPOS_ALIADO, tipoAliadoLabel, horasVoluntario,
  campusSOL, nombreCampus, cicloActual, cicloDe, cicloLabel, fechaCorta, hoyISO, codigoCorto, siguienteFolio,
  htmlDiplomas, imprimirHTML,
  type SolAliado, type SolApoyo, type SolFotoApoyo, type SolAliadoReconocimiento, type SolHallazgo, type SolTarjetaRoja, type SolComponente,
} from '@/lib/sol';
import { traerTodo, carpetaSOL } from '@/lib/solData';
import { CicloSelect, CampusSelect, KpiSOL, inputCls, labelCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

type Tab = 'apoyos' | 'aliados' | 'ranking';
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'apoyos',  label: 'Apoyos',             icon: HeartHandshake },
  { key: 'aliados', label: 'Aliados',            icon: Building2 },
  { key: 'ranking', label: 'Ranking del ciclo',  icon: Trophy },
];

const ciudadDe = (nombre: string) => nombre.replace(/^Mano Amiga\s+/i, '');
const fmtHoras = (n: number) => (Math.round(n * 10) / 10).toLocaleString('es-MX');
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? 'Error';
type Campus = DirectorioColegio[];

interface Data { aliados: SolAliado[]; apoyos: SolApoyo[]; recon: SolAliadoReconocimiento[] }

export default function SolVoluntariado() {
  const isAdmin = useSolAdmin();
  const qc = useQueryClient();
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => campusSOL(directorio), [directorio]);
  const [tab, setTab] = useState<Tab>('apoyos');
  const [ciclo, setCiclo] = useState(cicloActual());

  const { data, isLoading } = useQuery({
    queryKey: ['sol_voluntariado'],
    enabled: isAdmin,
    queryFn: async (): Promise<Data> => {
      const [aliados, apoyos, recon] = await Promise.all([
        traerTodo<SolAliado>((a, b) => supabase.from('sol_aliados').select('*').order('nombre').range(a, b)),
        traerTodo<SolApoyo>((a, b) => supabase.from('sol_apoyos').select('*').order('fecha', { ascending: false }).order('id').range(a, b)),
        traerTodo<SolAliadoReconocimiento>((a, b) => supabase.from('sol_aliados_reconocimientos').select('*').order('created_at', { ascending: false }).range(a, b)),
      ]);
      return { aliados, apoyos, recon };
    },
  });
  const refrescar = () => qc.invalidateQueries({ queryKey: ['sol_voluntariado'] });

  if (!isAdmin) return <AccesoRestringido />;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Voluntariado SOL" subtitle="Empresas, universidades y escuelas que nos apoyan · jornadas por campus · reconocimiento en el momento y Aliado SOL del año" />
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition ${tab === t.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
              <t.icon className="w-4 h-4" />{t.label}
            </button>
          ))}
        </div>
        {tab !== 'aliados' && <CicloSelect value={ciclo} onChange={setCiclo} className="md:w-56 md:ml-auto" />}
      </div>

      {isLoading || !data ? <p className="text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Cargando…</p> : (
        <>
          {tab === 'apoyos' && <TabApoyos ciclo={ciclo} campus={campus} directorio={directorio} data={data} refrescar={refrescar} />}
          {tab === 'aliados' && <TabAliados data={data} refrescar={refrescar} />}
          {tab === 'ranking' && <TabRanking ciclo={ciclo} directorio={directorio} data={data} refrescar={refrescar} />}
        </>
      )}
    </div>
  );
}

// ── Apoyos ───────────────────────────────────────────────────────────────────
function TabApoyos({ ciclo, campus, directorio, data, refrescar }: { ciclo: string; campus: Campus; directorio: DirectorioColegio[]; data: Data; refrescar: () => void }) {
  const [fCampus, setFCampus] = useState('');
  const [fAliado, setFAliado] = useState('');
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState<SolApoyo | 'nuevo' | null>(null);
  const aliadoDe = (id: string) => data.aliados.find(a => a.id === id);

  const delCiclo = data.apoyos.filter(a => a.ciclo === ciclo && (!fCampus || a.colegio === fCampus));
  const filtrados = delCiclo.filter(a => {
    if (fAliado && a.aliado_id !== fAliado) return false;
    const n = q.trim().toLowerCase();
    if (n && ![a.folio, a.actividad, a.area, a.responsable_campus, aliadoDe(a.aliado_id)?.nombre].some(x => String(x ?? '').toLowerCase().includes(n))) return false;
    return true;
  });
  const kpi = {
    apoyos: delCiclo.length,
    voluntarios: delCiclo.reduce((s, a) => s + (a.voluntarios ?? 0), 0),
    horas: delCiclo.reduce((s, a) => s + horasVoluntario(a), 0),
    aliados: new Set(delCiclo.map(a => a.aliado_id)).size,
    atendidos: delCiclo.reduce((s, a) => s + a.hallazgos_ids.length + a.tarjetas_ids.length, 0),
  };

  const diploma = async (a: SolApoyo) => {
    const al = aliadoDe(a.aliado_id);
    const c = directorio.find(d => d.codigo === a.colegio);
    const nombre = c?.nombre ?? a.colegio;
    imprimirHTML(htmlDiplomas({
      tipo: 'aliado', campusNombre: nombre, ciclo: a.ciclo, ciudad: ciudadDe(nombre), fecha: a.fecha, beneficiarios: [],
      aliadoNombre: al?.nombre ?? '', actividad: a.actividad, fechaApoyo: a.fecha, directorCampus: c?.dir_nombre ?? '',
    }));
    if (!a.constancia_fecha) {
      const { error } = await supabase.from('sol_apoyos').update({ constancia_fecha: hoyISO() }).eq('id', a.id);
      if (!error) refrescar();
    }
  };

  const eliminar = async (a: SolApoyo) => {
    if (!confirm(`¿Eliminar el apoyo ${a.folio ?? ''}? Las fotos se quedan en OneDrive.`)) return;
    const { error } = await supabase.from('sol_apoyos').delete().eq('id', a.id);
    if (error) { toast.error(error.message); return; }
    logAudit({ accion: 'eliminar', modulo: 'sol', registro_id: a.id, registro_ref: `Voluntariado ${a.folio}` });
    toast.success('Apoyo eliminado');
    refrescar();
  };

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiSOL titulo="Jornadas" valor={kpi.apoyos} icon={HeartHandshake} tono="verde" detalle={`${kpi.aliados} aliado(s) participaron`} />
        <KpiSOL titulo="Voluntarios" valor={kpi.voluntarios.toLocaleString('es-MX')} icon={Users} tono="slate" detalle="Suma de todas las jornadas" />
        <KpiSOL titulo="Horas-voluntario" valor={fmtHoras(kpi.horas)} icon={Clock} tono="naranja" detalle="Voluntarios × horas de cada jornada" />
        <KpiSOL titulo="Hallazgos / tarjetas atendidos" valor={kpi.atendidos} icon={ListChecks} tono="ambar" detalle="Vinculados a las jornadas" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <CampusSelect campus={campus} value={fCampus} onChange={setFCampus} className="sm:w-64" />
        <select className={inputCls + ' sm:w-64'} value={fAliado} onChange={e => setFAliado(e.target.value)}>
          <option value="">Todos los aliados</option>{data.aliados.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="Folio, actividad, área, aliado…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <button className={btnPrimary} onClick={() => {
          if (!data.aliados.some(a => a.activo)) { toast.error('Primero da de alta al aliado en la pestaña Aliados'); return; }
          setEditando('nuevo');
        }}><Plus className="w-4 h-4" />Registrar apoyo</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
            <th className="text-left px-4 py-3">Folio / fecha</th><th className="text-left px-4 py-3">Aliado</th><th className="text-left px-4 py-3">Campus / área</th>
            <th className="text-left px-4 py-3">Actividad</th><th className="text-right px-3 py-3">Voluntarios</th>
            <th className="text-left px-3 py-3">Atendido / fotos</th><th className="px-3 py-3" />
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtrados.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Sin apoyos de voluntariado en {cicloLabel(ciclo)} con estos filtros.</td></tr>}
            {filtrados.map(a => {
              const antes = a.fotos.filter(f => f.momento === 'antes').length;
              const despues = a.fotos.length - antes;
              return (
                <tr key={a.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap"><p className="font-bold text-slate-900">{a.folio ?? '—'}</p><p className="text-[11px] text-slate-400">{fechaCorta(a.fecha)}</p></td>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-800">{aliadoDe(a.aliado_id)?.nombre ?? '—'}</p><p className="text-[11px] text-slate-500">{tipoAliadoLabel(aliadoDe(a.aliado_id)?.tipo)}</p></td>
                  <td className="px-4 py-3"><p className="text-slate-800">{ciudadDe(nombreCampus(directorio, a.colegio))}</p>
                    <p className="text-[11px] text-slate-500">{[a.componentes.join(' · '), a.area].filter(Boolean).join(' — ') || '—'}</p></td>
                  <td className="px-4 py-3 max-w-[280px]"><p className="text-slate-700">{a.actividad}</p>{a.responsable_campus && <p className="text-[11px] text-slate-500">Recibió: {a.responsable_campus}</p>}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <p className="tabular-nums text-slate-800">{a.voluntarios ?? '—'}{a.horas ? <span className="text-slate-500"> × {fmtHoras(Number(a.horas))} h</span> : null}</p>
                    {a.voluntarios && a.horas ? <p className="text-[11px] font-bold text-slate-600 tabular-nums">{fmtHoras(horasVoluntario(a))} horas-vol.</p> : null}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">
                    {a.hallazgos_ids.length > 0 && <p><ListChecks className="w-3.5 h-3.5 inline mr-1" />{a.hallazgos_ids.length} hallazgo(s)</p>}
                    {a.tarjetas_ids.length > 0 && <p><Flag className="w-3.5 h-3.5 inline mr-1 text-red-600" />{a.tarjetas_ids.length} tarjeta(s)</p>}
                    <p className={a.fotos.length ? '' : 'text-slate-400'}><Camera className="w-3.5 h-3.5 inline mr-1" />{a.fotos.length ? `${antes} antes · ${despues} después` : 'Sin fotos'}</p>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right">
                    <button className="p-2 rounded-md hover:bg-emerald-50 text-emerald-700" title={a.constancia_fecha ? 'Reimprimir reconocimiento de la jornada' : 'Imprimir reconocimiento de la jornada'} onClick={() => diploma(a)}><Printer className="w-4 h-4" /></button>
                    <button className="p-2 rounded-md hover:bg-slate-100 text-slate-500" title="Editar" onClick={() => setEditando(a)}><Pencil className="w-4 h-4" /></button>
                    <button className="p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600" title="Eliminar" onClick={() => eliminar(a)}><Trash2 className="w-4 h-4" /></button>
                    <p className={`text-[11px] mt-0.5 ${a.constancia_fecha ? 'text-emerald-700' : 'text-amber-700'}`}>{a.constancia_fecha ? `Entregado ${fechaCorta(a.constancia_fecha)}` : 'Sin reconocimiento'}</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editando && (
        <ApoyoModal apoyo={editando === 'nuevo' ? null : editando} campus={campus} data={data}
          onClose={() => setEditando(null)} onSaved={() => { setEditando(null); refrescar(); }} />
      )}
    </div>
  );
}

function ApoyoModal({ apoyo, campus, data, onClose, onSaved }: {
  apoyo: SolApoyo | null; campus: Campus; data: Data; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    aliado_id: apoyo?.aliado_id ?? '', colegio: apoyo?.colegio ?? '', fecha: apoyo?.fecha ?? hoyISO(),
    area: apoyo?.area ?? '', actividad: apoyo?.actividad ?? '', voluntarios: apoyo?.voluntarios?.toString() ?? '',
    horas: apoyo?.horas?.toString() ?? '', responsable_campus: apoyo?.responsable_campus ?? '', notas: apoyo?.notas ?? '',
  });
  const [componentes, setComponentes] = useState<SolComponente[]>(apoyo?.componentes ?? []);
  const [hallSel, setHallSel] = useState<string[]>(apoyo?.hallazgos_ids ?? []);
  const [tarjSel, setTarjSel] = useState<string[]>(apoyo?.tarjetas_ids ?? []);
  const [cerrar, setCerrar] = useState(true);
  const [fotos, setFotos] = useState<SolFotoApoyo[]>(apoyo?.fotos ?? []);
  const [momento, setMomento] = useState<'antes' | 'despues'>('antes');
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadCustom, uploading } = useSharePointUpload();
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));
  const ciclo = f.fecha ? cicloDe(f.fecha) : cicloActual();

  // Hallazgos y tarjetas del campus: los abiertos + los que ya estaban vinculados
  const { data: pend, isFetching } = useQuery({
    queryKey: ['sol_voluntariado_pend', f.colegio],
    enabled: !!f.colegio,
    queryFn: async () => {
      const [h, t] = await Promise.all([
        supabase.from('sol_hallazgos').select('*').eq('colegio', f.colegio).order('fecha', { ascending: false }).limit(500),
        supabase.from('sol_tarjetas_rojas').select('*').eq('colegio', f.colegio).order('fecha', { ascending: false }).limit(500),
      ]);
      if (h.error) throw h.error;
      if (t.error) throw t.error;
      return { hall: (h.data ?? []) as SolHallazgo[], tarj: (t.data ?? []) as SolTarjetaRoja[] };
    },
  });
  const hallazgos = (pend?.hall ?? []).filter(h => h.estatus !== 'cerrado' || hallSel.includes(h.id));
  const tarjetas = (pend?.tarj ?? []).filter(t => t.estatus !== 'resuelto' || tarjSel.includes(t.id));
  const toggle = (xs: string[], id: string) => xs.includes(id) ? xs.filter(x => x !== id) : [...xs, id];

  const subir = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!f.colegio) { toast.error('Elige primero el campus'); return; }
    const al = data.aliados.find(a => a.id === f.aliado_id)?.nombre ?? 'Aliado';
    const limpio = (s: string) => s.replace(/[/\\:*?"<>|]+/g, '_').replace(/\s+/g, '_');
    for (const file of Array.from(files)) {
      const nombre = `${f.fecha}_${limpio(al)}_${momento}_${Date.now()}_${limpio(file.name)}`;
      const url = await uploadCustom(file, carpetaSOL(f.colegio, ciclo, 'Voluntariado'), nombre);
      if (url) setFotos(p => [...p, { url, nombre: file.name, momento }]);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const guardar = async () => {
    if (!f.aliado_id || !f.colegio || !f.fecha || !f.actividad.trim()) { toast.error('Aliado, campus, fecha y actividad son obligatorios'); return; }
    setGuardando(true);
    try {
      const campos = {
        aliado_id: f.aliado_id, fecha: f.fecha, ciclo, componentes, area: f.area || null, actividad: f.actividad.trim(),
        voluntarios: f.voluntarios ? Number(f.voluntarios) : null, horas: f.horas ? Number(f.horas) : null,
        hallazgos_ids: hallSel, tarjetas_ids: tarjSel, fotos,
        responsable_campus: f.responsable_campus.trim() || null, notas: f.notas.trim() || null,
      };
      let folio = apoyo?.folio ?? null;
      if (apoyo) {
        const { error } = await supabase.from('sol_apoyos').update(campos).eq('id', apoyo.id);
        if (error) throw error;
        logAudit({ accion: 'editar', modulo: 'sol', registro_id: apoyo.id, registro_ref: `Voluntariado ${folio}` });
      } else {
        folio = siguienteFolio(data.apoyos.filter(x => x.colegio === f.colegio).map(x => x.folio), `${codigoCorto(f.colegio)}-V-`);
        const territorio = campus.find(c => c.codigo === f.colegio)?.territorio ?? null;
        const { data: ins, error } = await supabase.from('sol_apoyos').insert({ ...campos, folio, colegio: f.colegio, territorio }).select('id').single();
        if (error) throw error;
        logAudit({ accion: 'crear', modulo: 'sol', registro_id: ins.id, registro_ref: `Voluntariado ${folio}` });
      }
      // Lo que atendieron queda cerrado en Hallazgos / Tarjetas Rojas
      if (cerrar) {
        const hAbiertos = hallSel.filter(id => pend?.hall.find(h => h.id === id)?.estatus !== 'cerrado');
        const tAbiertas = tarjSel.filter(id => pend?.tarj.find(t => t.id === id)?.estatus !== 'resuelto');
        const nota = `Atendido por voluntariado (${folio})`;
        for (const id of hAbiertos) {
          const h = pend?.hall.find(x => x.id === id);
          await supabase.from('sol_hallazgos').update({ estatus: 'cerrado', fecha_cierre: f.fecha, notas: [h?.notas, nota].filter(Boolean).join('\n') }).eq('id', id);
        }
        for (const id of tAbiertas) {
          const t = pend?.tarj.find(x => x.id === id);
          await supabase.from('sol_tarjetas_rojas').update({ estatus: 'resuelto', fecha_resolucion: f.fecha, observaciones: [t?.observaciones, nota].filter(Boolean).join('\n') }).eq('id', id);
        }
        if (hAbiertos.length || tAbiertas.length) toast.success(`Se cerraron ${hAbiertos.length} hallazgo(s) y ${tAbiertas.length} tarjeta(s)`);
      }
      toast.success('Apoyo guardado');
      onSaved();
    } catch (e: unknown) { toast.error(errMsg(e)); }
    finally { setGuardando(false); }
  };

  const aliadosOpc = data.aliados.filter(a => a.activo || a.id === f.aliado_id);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><HeartHandshake className="w-4 h-4 text-emerald-600" />{apoyo ? `Apoyo ${apoyo.folio ?? ''}` : 'Registrar apoyo de voluntariado'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1 · Datos de la jornada */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={labelCls}>Aliado</label>
              <select className={inputCls} value={f.aliado_id} onChange={e => set('aliado_id', e.target.value)}>
                <option value="">—</option>{aliadosOpc.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select></div>
            <div><label className={labelCls}>Campus</label>
              {apoyo ? <p className="text-sm font-medium py-2">{campus.find(c => c.codigo === f.colegio)?.nombre ?? f.colegio}</p>
                : <CampusSelect campus={campus} value={f.colegio} onChange={v => { set('colegio', v); setHallSel([]); setTarjSel([]); }} todos={false} />}</div>
            <div><label className={labelCls}>Fecha · ciclo {cicloLabel(ciclo)}</label><input type="date" className={inputCls} value={f.fecha} onChange={e => set('fecha', e.target.value)} /></div>
            <div><label className={labelCls}>Área</label>
              <select className={inputCls} value={f.area} onChange={e => set('area', e.target.value)}><option value="">—</option>{SOL_AREAS.map(a => <option key={a}>{a}</option>)}</select></div>
            <div className="sm:col-span-2"><label className={labelCls}>Componentes SOL</label>
              <div className="flex gap-4 py-1">
                {SOL_COMPONENTES.map(c => (
                  <label key={c.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={componentes.includes(c.key)} onChange={() => setComponentes(p => p.includes(c.key) ? p.filter(x => x !== c.key) : [...p, c.key])} />
                    <span className="font-semibold" style={{ color: c.color }}>{c.label}</span>
                  </label>
                ))}
              </div></div>
            <div className="sm:col-span-2"><label className={labelCls}>Actividad (aparece en el reconocimiento)</label>
              <input className={inputCls} placeholder="Ej. la jornada de pintura y limpieza de patios" value={f.actividad} onChange={e => set('actividad', e.target.value)} /></div>
          </section>

          {/* 2 · Horas y lo que atendieron */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className={labelCls}>Voluntarios</label><input type="number" min="0" className={inputCls} value={f.voluntarios} onChange={e => set('voluntarios', e.target.value)} /></div>
            <div><label className={labelCls}>Horas de la jornada</label><input type="number" min="0" step="0.5" className={inputCls} value={f.horas} onChange={e => set('horas', e.target.value)} /></div>
            <div><label className={labelCls}>Horas-voluntario</label>
              <p className="py-2 text-sm font-bold text-slate-800 tabular-nums">{f.voluntarios && f.horas ? fmtHoras(Number(f.voluntarios) * Number(f.horas)) : '—'}</p></div>
            <div className="sm:col-span-3"><label className={labelCls}>Quién los recibió en el campus</label><input className={inputCls} value={f.responsable_campus} onChange={e => set('responsable_campus', e.target.value)} /></div>
          </section>

          {f.colegio && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <p className={labelCls + ' !mb-0'}>Hallazgos y tarjetas rojas que atendieron {isFetching && <Loader2 className="w-3 h-3 animate-spin inline ml-1" />}</p>
                <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={cerrar} onChange={e => setCerrar(e.target.checked)} />Cerrarlos al guardar</label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {hallazgos.length === 0 && <p className="p-3 text-xs text-slate-400">Sin hallazgos abiertos en este campus.</p>}
                  {hallazgos.map(h => (
                    <label key={h.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                      <input type="checkbox" className="mt-0.5" checked={hallSel.includes(h.id)} onChange={() => setHallSel(p => toggle(p, h.id))} />
                      <span><b>{h.folio ?? 'Hallazgo'}</b> · {h.area ?? '—'}<br /><span className="text-slate-600">{h.hallazgo}</span>{h.estatus === 'cerrado' && <span className="text-emerald-700"> · cerrado</span>}</span>
                    </label>
                  ))}
                </div>
                <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {tarjetas.length === 0 && <p className="p-3 text-xs text-slate-400">Sin tarjetas rojas pendientes en este campus.</p>}
                  {tarjetas.map(t => (
                    <label key={t.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                      <input type="checkbox" className="mt-0.5" checked={tarjSel.includes(t.id)} onChange={() => setTarjSel(p => toggle(p, t.id))} />
                      <span><b>{t.folio ?? 'Tarjeta'}</b> · {t.area ?? '—'}<br /><span className="text-slate-600">{t.articulo}{t.destino ? ` → ${t.destino}` : ''}</span>{t.estatus === 'resuelto' && <span className="text-emerald-700"> · resuelta</span>}</span>
                    </label>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 3 · Fotos antes / después */}
          <section>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <p className={labelCls + ' !mb-0 mr-auto'}>Fotos de la jornada · {fotos.length}</p>
              <select className={inputCls + ' !w-auto !py-1.5'} value={momento} onChange={e => setMomento(e.target.value as 'antes' | 'despues')}>
                <option value="antes">Antes</option><option value="despues">Después</option>
              </select>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => subir(e.target.files)} />
              <button className={btnSecondary + ' !py-1.5'} disabled={uploading || !f.colegio} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}Subir fotos de «{momento === 'antes' ? 'antes' : 'después'}»
              </button>
            </div>
            {fotos.length === 0 ? <p className="text-xs text-slate-400">Se guardan en OneDrive · Programa SOL / campus / ciclo / Voluntariado.</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(['antes', 'despues'] as const).map(m => (
                  <div key={m} className="border border-slate-200 rounded-lg p-2">
                    <p className="text-[11px] font-bold uppercase text-slate-500 mb-1">{m === 'antes' ? 'Antes' : 'Después'}</p>
                    {fotos.filter(x => x.momento === m).map(x => (
                      <div key={x.url} className="flex items-center gap-2 text-xs py-0.5">
                        <a href={x.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-blue-600 hover:underline"><ExternalLink className="w-3 h-3 inline mr-1" />{x.nombre}</a>
                        <button className="text-slate-400 hover:text-red-600" title="Quitar de la lista" onClick={() => setFotos(p => p.filter(y => y.url !== x.url))}><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    {!fotos.some(x => x.momento === m) && <p className="text-xs text-slate-400">—</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div><label className={labelCls}>Notas</label><textarea className={inputCls} rows={2} value={f.notas} onChange={e => set('notas', e.target.value)} /></div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={guardando || uploading} onClick={guardar}>{guardando && <Loader2 className="w-4 h-4 animate-spin" />}Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ── Aliados ──────────────────────────────────────────────────────────────────
function TabAliados({ data, refrescar }: { data: Data; refrescar: () => void }) {
  const [editando, setEditando] = useState<SolAliado | 'nuevo' | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);
  const stats = (id: string) => {
    const xs = data.apoyos.filter(a => a.aliado_id === id);
    return { apoyos: xs.length, horas: xs.reduce((s, a) => s + horasVoluntario(a), 0), ultimo: xs[0]?.fecha ?? null, anuales: data.recon.filter(r => r.aliado_id === id).length };
  };
  const lista = data.aliados.filter(a => verInactivos || a.activo);

  const eliminar = async (a: SolAliado) => {
    if (stats(a.id).apoyos > 0) { toast.error('Tiene apoyos registrados: márcalo como inactivo en lugar de eliminarlo'); return; }
    if (!confirm(`¿Eliminar a ${a.nombre} del catálogo?`)) return;
    const { error } = await supabase.from('sol_aliados').delete().eq('id', a.id);
    if (error) { toast.error(error.message); return; }
    logAudit({ accion: 'eliminar', modulo: 'sol', registro_id: a.id, registro_ref: `Aliado ${a.nombre}` });
    refrescar();
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <p className="text-sm text-slate-600 mr-auto">Catálogo de quienes nos apoyan. El contacto es opcional; convenios y documentación los maneja cada colegio.</p>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} />Ver inactivos</label>
        <button className={btnPrimary} onClick={() => setEditando('nuevo')}><Plus className="w-4 h-4" />Nuevo aliado</button>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
            <th className="text-left px-4 py-3">Aliado</th><th className="text-left px-4 py-3">Contacto</th>
            <th className="text-right px-3 py-3">Apoyos</th><th className="text-right px-3 py-3">Horas-vol.</th><th className="text-left px-3 py-3">Último apoyo</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {lista.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Aún no hay aliados. Da de alta la primera empresa o escuela que nos apoya.</td></tr>}
            {lista.map(a => {
              const s = stats(a.id);
              return (
                <tr key={a.id} className={`align-top ${a.activo ? '' : 'opacity-60'}`}>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-900">{a.nombre}{s.anuales > 0 && <Award className="w-4 h-4 inline ml-1 text-emerald-600" />}</p>
                    <p className="text-[11px] text-slate-500">{tipoAliadoLabel(a.tipo)}{a.activo ? '' : ' · inactivo'}</p></td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {a.contacto_nombre && <p className="font-medium text-slate-800">{a.contacto_nombre}</p>}
                    {a.contacto_telefono && <p><Phone className="w-3 h-3 inline mr-1" />{a.contacto_telefono}</p>}
                    {a.contacto_correo && <p><Mail className="w-3 h-3 inline mr-1" />{a.contacto_correo}</p>}
                    {!a.contacto_nombre && !a.contacto_telefono && !a.contacto_correo && <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold">{s.apoyos}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{s.horas ? fmtHoras(s.horas) : '—'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{fechaCorta(s.ultimo)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <button className="p-2 rounded-md hover:bg-slate-100 text-slate-500" title="Editar" onClick={() => setEditando(a)}><Pencil className="w-4 h-4" /></button>
                    <button className="p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600" title="Eliminar" onClick={() => eliminar(a)}><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editando && <AliadoModal aliado={editando === 'nuevo' ? null : editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); refrescar(); }} />}
    </div>
  );
}

function AliadoModal({ aliado, onClose, onSaved }: { aliado: SolAliado | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    nombre: aliado?.nombre ?? '', tipo: aliado?.tipo ?? 'empresa', contacto_nombre: aliado?.contacto_nombre ?? '',
    contacto_telefono: aliado?.contacto_telefono ?? '', contacto_correo: aliado?.contacto_correo ?? '', notas: aliado?.notas ?? '',
  });
  const [activo, setActivo] = useState(aliado?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!f.nombre.trim()) { toast.error('Escribe el nombre del aliado'); return; }
    setGuardando(true);
    const fila = {
      nombre: f.nombre.trim(), tipo: f.tipo, activo,
      contacto_nombre: f.contacto_nombre.trim() || null, contacto_telefono: f.contacto_telefono.trim() || null,
      contacto_correo: f.contacto_correo.trim() || null, notas: f.notas.trim() || null,
    };
    const { data, error } = aliado
      ? await supabase.from('sol_aliados').update(fila).eq('id', aliado.id).select('id').single()
      : await supabase.from('sol_aliados').insert(fila).select('id').single();
    setGuardando(false);
    if (error) { toast.error(error.code === '23505' ? 'Ya existe un aliado con ese nombre' : error.message); return; }
    logAudit({ accion: aliado ? 'editar' : 'crear', modulo: 'sol', registro_id: data.id, registro_ref: `Aliado ${fila.nombre}` });
    toast.success('Aliado guardado');
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-600" />{aliado ? 'Editar aliado' : 'Nuevo aliado'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className={labelCls}>Nombre (como aparecerá en el reconocimiento)</label><input className={inputCls} value={f.nombre} onChange={e => set('nombre', e.target.value)} /></div>
          <div><label className={labelCls}>Tipo</label><select className={inputCls} value={f.tipo} onChange={e => set('tipo', e.target.value)}>{SOL_TIPOS_ALIADO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
          <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)} />Activo</label></div>
          <p className="sm:col-span-2 text-[11px] font-bold uppercase text-slate-400 pt-1">Contacto (opcional)</p>
          <div className="sm:col-span-2"><label className={labelCls}>Nombre</label><input className={inputCls} value={f.contacto_nombre} onChange={e => set('contacto_nombre', e.target.value)} /></div>
          <div><label className={labelCls}>Teléfono</label><input className={inputCls} value={f.contacto_telefono} onChange={e => set('contacto_telefono', e.target.value)} /></div>
          <div><label className={labelCls}>Correo</label><input type="email" className={inputCls} value={f.contacto_correo} onChange={e => set('contacto_correo', e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Notas</label><textarea className={inputCls} rows={2} value={f.notas} onChange={e => set('notas', e.target.value)} /></div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={guardando} onClick={guardar}>{guardando && <Loader2 className="w-4 h-4 animate-spin" />}Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ── Ranking del ciclo y Aliado SOL del año ──────────────────────────────────
function TabRanking({ ciclo, directorio, data, refrescar }: { ciclo: string; directorio: DirectorioColegio[]; data: Data; refrescar: () => void }) {
  const [ciudad, setCiudad] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const dirNacional = getDirectorNacional(directorio).nombre;

  const filas = useMemo(() => {
    const m = new Map<string, { apoyos: number; voluntarios: number; horas: number; colegios: Set<string> }>();
    data.apoyos.filter(a => a.ciclo === ciclo).forEach(a => {
      const x = m.get(a.aliado_id) ?? { apoyos: 0, voluntarios: 0, horas: 0, colegios: new Set<string>() };
      x.apoyos += 1; x.voluntarios += a.voluntarios ?? 0; x.horas += horasVoluntario(a); x.colegios.add(a.colegio);
      m.set(a.aliado_id, x);
    });
    return Array.from(m.entries())
      .map(([id, v]) => ({ aliado: data.aliados.find(a => a.id === id), id, ...v, colegios: Array.from(v.colegios) }))
      .sort((a, b) => b.apoyos - a.apoyos || b.horas - a.horas);
  }, [data, ciclo]);
  const emitido = data.recon.find(r => r.ciclo === ciclo);

  const emitir = async (f: typeof filas[number]) => {
    if (emitido && emitido.aliado_id !== f.id && !confirm(`Ya se emitió el Aliado SOL ${cicloLabel(ciclo)} a ${data.aliados.find(a => a.id === emitido.aliado_id)?.nombre}. ¿Emitir también a ${f.aliado?.nombre}?`)) return;
    const campusLista = f.colegios.map(c => nombreCampus(directorio, c).replace(/^Mano Amiga\s+/i, ''));
    imprimirHTML(htmlDiplomas({
      tipo: 'aliado_anual', campusNombre: '', ciclo, ciudad, fecha, beneficiarios: [], directorNacional: dirNacional,
      aliadoNombre: f.aliado?.nombre ?? '', apoyos: f.apoyos, horas: f.horas, campusLista,
    }));
    const { error } = await supabase.from('sol_aliados_reconocimientos').upsert(
      { aliado_id: f.id, ciclo, apoyos: f.apoyos, horas: f.horas, colegios: f.colegios, fecha_emision: fecha },
      { onConflict: 'aliado_id,ciclo' },
    );
    if (error) { toast.error(error.message); return; }
    logAudit({ accion: 'crear', modulo: 'sol', registro_ref: `Aliado SOL del año ${ciclo} · ${f.aliado?.nombre}` });
    refrescar();
  };

  const quitar = async (r: SolAliadoReconocimiento) => {
    if (!confirm('¿Quitar el registro del reconocimiento anual?')) return;
    const { error } = await supabase.from('sol_aliados_reconocimientos').delete().eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    refrescar();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Al cierre del ciclo se reconoce como <b>Aliado SOL del año</b> a quien más jornadas realizó (en empate, más horas-voluntario). Firman el Director Nacional y la Coordinación RCMA.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
        <div><label className={labelCls}>Lugar de entrega</label><input className={inputCls} placeholder="Ej. Monterrey, N.L." value={ciudad} onChange={e => setCiudad(e.target.value)} /></div>
        <div><label className={labelCls}>Fecha del diploma</label><input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
        <div className="text-xs text-slate-500 self-end pb-2">Firma: {dirNacional || <i>Director Nacional (Directorio)</i>}</div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
            <th className="text-left px-4 py-3">#</th><th className="text-left px-4 py-3">Aliado</th><th className="text-right px-3 py-3">Jornadas</th>
            <th className="text-right px-3 py-3">Voluntarios</th><th className="text-right px-3 py-3">Horas-vol.</th><th className="text-left px-3 py-3">Campus apoyados</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filas.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Sin apoyos registrados en {cicloLabel(ciclo)}.</td></tr>}
            {filas.map((f, i) => {
              const rec = data.recon.find(r => r.ciclo === ciclo && r.aliado_id === f.id);
              return (
                <tr key={f.id} className={i === 0 ? 'bg-emerald-50/50' : ''}>
                  <td className="px-4 py-3 font-black text-slate-400">{i === 0 ? <Trophy className="w-5 h-5 text-emerald-600" /> : i + 1}</td>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-900">{f.aliado?.nombre ?? '—'}</p><p className="text-[11px] text-slate-500">{tipoAliadoLabel(f.aliado?.tipo)}</p></td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold">{f.apoyos}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{f.voluntarios}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtHoras(f.horas)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{f.colegios.map(c => nombreCampus(directorio, c)).join(', ')}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {rec && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 mr-2"><Award className="w-4 h-4" />Emitido {fechaCorta(rec.fecha_emision)}</span>}
                    {(i === 0 || rec) && <button className={btnSecondary + ' !px-3 !py-1.5 text-xs'} onClick={() => emitir(f)}><Printer className="w-3.5 h-3.5" />{rec ? 'Reimprimir' : 'Emitir Aliado SOL del año'}</button>}
                    {rec && <button className="p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600" title="Quitar registro" onClick={() => quitar(rec)}><Trash2 className="w-4 h-4" /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
