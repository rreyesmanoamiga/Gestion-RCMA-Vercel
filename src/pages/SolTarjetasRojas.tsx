import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Link2, Pencil, Trash2, X, Loader2, Flag, Clock, FileSignature, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useDirectorio } from '@/lib/directorio';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_AREAS, campusSOL, nombreCampus, fechaCorta, diasEntre, hoyISO, sumarDias, codigoCorto, siguienteFolio,
  type SolTarjetaRoja,
} from '@/lib/sol';
import { traerTodo } from '@/lib/solData';
import {
  CampusSelect, EstatusPill, KpiSOL, TicketMasBadge, TicketMasLinker, useTicketsMasInfo,
  inputCls, labelCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

const MOTIVOS  = ['Roto', 'Obsoleto', 'Innecesario', 'Duplicado', 'Peligroso'];
const DESTINOS = ['Reparar', 'Reubicar', 'Donar', 'Vender', 'Desechar'];
type Filtro = 'activas' | 'resueltas' | 'todas';

/** Control de ejecución: qué se reportó, qué se está atendiendo y qué no. */
function ejecucion(t: SolTarjetaRoja, ticketEstatus?: string | null): { label: string; cls: string } {
  if (t.estatus === 'resuelto') return { label: 'Ejecutada', cls: 'text-emerald-700' };
  const vencida = !!t.fecha_limite && t.fecha_limite < hoyISO();
  if (t.ticket_mas_id) {
    if (ticketEstatus === 'cancelado' || ticketEstatus === 'rechazado') return { label: 'Ticket cancelado · revisar', cls: 'text-red-700' };
    return { label: vencida ? 'En atención con Ticket · fuera de plazo' : 'En atención con Ticket', cls: vencida ? 'text-amber-700' : 'text-blue-700' };
  }
  if (t.estatus === 'en_proceso') return { label: vencida ? 'En proceso · fuera de plazo' : 'En proceso', cls: vencida ? 'text-amber-700' : 'text-blue-700' };
  return { label: vencida ? 'Sin atender · vencida' : 'Sin atender', cls: vencida ? 'text-red-700 font-bold' : 'text-slate-600' };
}

export default function SolTarjetasRojas() {
  const isAdmin = useSolAdmin();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => campusSOL(directorio), [directorio]);

  const [fCampus, setFCampus] = useState('');
  const [fEstatus, setFEstatus] = useState<Filtro>(params.get('folio') ? 'todas' : 'activas');
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [sinTicket, setSinTicket] = useState(false);
  const [q, setQ] = useState(params.get('folio') ?? '');
  const [editando, setEditando] = useState<SolTarjetaRoja | 'nueva' | null>(null);
  const [vinculando, setVinculando] = useState<SolTarjetaRoja | null>(null);

  const { data: tarjetas = [], isLoading } = useQuery({
    queryKey: ['sol_tarjetas'],
    enabled: isAdmin,
    queryFn: async () => {
      return traerTodo<SolTarjetaRoja>((a, b) => supabase.from('sol_tarjetas_rojas').select('*').order('fecha', { ascending: false }).order('folio').range(a, b));
    },
  });
  const { data: ticketsInfo = {} } = useTicketsMasInfo(tarjetas.map(t => t.ticket_mas_id));

  const base = tarjetas.filter(t => !fCampus || t.colegio === fCampus);
  const filtradas = base.filter(t => {
    if (fEstatus === 'activas' && t.estatus === 'resuelto') return false;
    if (fEstatus === 'resueltas' && t.estatus !== 'resuelto') return false;
    if (soloVencidas && (t.estatus === 'resuelto' || !t.fecha_limite || t.fecha_limite >= hoyISO())) return false;
    if (sinTicket && t.ticket_mas_id) return false;
    const n = q.trim().toLowerCase();
    if (n && ![t.folio, t.folio_excel, t.articulo, t.responsable, t.observaciones, ticketsInfo[t.ticket_mas_id ?? '']?.folio].some(x => String(x ?? '').toLowerCase().includes(n))) return false;
    return true;
  });

  const kpi = useMemo(() => {
    const activas = base.filter(t => t.estatus !== 'resuelto');
    return {
      total: base.length, activas: activas.length,
      vencidas: activas.filter(t => t.fecha_limite && t.fecha_limite < hoyISO()).length,
      conTicket: activas.filter(t => t.ticket_mas_id).length,
      resueltas: base.length - activas.length,
    };
  }, [base]);

  const guardarTicket = useMutation({
    mutationFn: async ({ t, ticketId }: { t: SolTarjetaRoja; ticketId: string | null }) => {
      const upd: Record<string, unknown> = { ticket_mas_id: ticketId };
      if (ticketId && t.estatus === 'pendiente') upd.estatus = 'en_proceso';
      const { error } = await supabase.from('sol_tarjetas_rojas').update(upd).eq('id', t.id);
      if (error) throw error;
      logAudit({ accion: 'editar', modulo: 'sol', registro_id: t.id, registro_ref: t.folio, detalle: { ticket_mas_id: ticketId } });
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['sol_tarjetas'] }); setVinculando(null); toast.success(v.ticketId ? 'Ticket MAS vinculado' : 'Vínculo eliminado'); },
    onError: (e: unknown) => toast.error((e as { message?: string })?.message ?? 'Error'),
  });
  const eliminar = useMutation({
    mutationFn: async (t: SolTarjetaRoja) => {
      const { error } = await supabase.from('sol_tarjetas_rojas').delete().eq('id', t.id);
      if (error) throw error;
      logAudit({ accion: 'eliminar', modulo: 'sol', registro_id: t.id, registro_ref: t.folio });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sol_tarjetas'] }); toast.success('Tarjeta eliminada'); },
  });

  if (!isAdmin) return <AccesoRestringido />;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Tarjetas Rojas" subtitle="Control de lo que reportan los campus y si se está ejecutando · destino en máximo 30 días"
        actionLabel="Nueva tarjeta" onAction={() => setEditando('nueva')} actionIcon={Plus} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiSOL titulo="Reportadas" valor={kpi.total} icon={Flag} tono="rojo" detalle={`${kpi.activas} sin resolver`} />
        <KpiSOL titulo="Vencidas" valor={kpi.vencidas} icon={Clock} tono={kpi.vencidas ? 'rojo' : 'slate'} detalle="Pasaron los 30 días sin resolverse" />
        <KpiSOL titulo="En atención con Ticket" valor={kpi.conTicket} icon={FileSignature} tono="ambar" detalle="Tienen un Ticket MAS vinculado" />
        <KpiSOL titulo="Ejecutadas" valor={kpi.resueltas} icon={CheckCircle2} tono="verde" detalle={kpi.total ? `${Math.round((kpi.resueltas / kpi.total) * 100)}% del total` : undefined} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <CampusSelect campus={campus} value={fCampus} onChange={setFCampus} />
        <select className={inputCls} value={fEstatus} onChange={e => setFEstatus(e.target.value as Filtro)}>
          <option value="activas">Sin resolver</option><option value="resueltas">Resueltas</option><option value="todas">Todas</option>
        </select>
        <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="Folio, artículo, responsable, Ticket…" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap gap-4 mb-4 text-sm text-slate-700">
        <label className="flex items-center gap-2"><input type="checkbox" checked={soloVencidas} onChange={e => setSoloVencidas(e.target.checked)} />Solo vencidas</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={sinTicket} onChange={e => setSinTicket(e.target.checked)} />Sin Ticket MAS vinculado</label>
        <span className="text-slate-400">{filtradas.length} resultado(s)</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Folio</th><th className="text-left px-4 py-3">Campus / área</th>
              <th className="text-left px-4 py-3">Artículo</th><th className="text-left px-4 py-3">Motivo → destino</th>
              <th className="text-left px-4 py-3">Plazo</th><th className="text-left px-4 py-3">Ticket MAS / ejecución</th>
              <th className="text-left px-4 py-3">Estatus</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Cargando…</td></tr>}
            {!isLoading && filtradas.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">Sin tarjetas rojas con estos filtros.</td></tr>}
            {filtradas.map(t => {
              const info = t.ticket_mas_id ? ticketsInfo[t.ticket_mas_id] : null;
              const ej = ejecucion(t, info?.estatus);
              const restantes = t.fecha_limite ? diasEntre(hoyISO(), t.fecha_limite) : null;
              return (
                <tr key={t.id} className="align-top">
                  <td className="px-4 py-3"><p className="font-bold text-slate-900 whitespace-nowrap">{t.folio}</p>{t.folio_excel && <p className="text-[11px] text-slate-400">Excel: {t.folio_excel}</p>}<p className="text-[11px] text-slate-400">{fechaCorta(t.fecha)}</p></td>
                  <td className="px-4 py-3"><p className="text-slate-800">{nombreCampus(directorio, t.colegio)}</p><p className="text-[11px] text-slate-500">{t.area ?? '—'}</p></td>
                  <td className="px-4 py-3"><p className="text-slate-800">{t.articulo}{t.cantidad ? <span className="text-slate-500"> × {t.cantidad}</span> : null}</p>{t.responsable && <p className="text-[11px] text-slate-500">Resp.: {t.responsable}</p>}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">{t.motivo ?? '—'} → <b>{t.destino ?? '—'}</b></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-slate-700">{fechaCorta(t.fecha_limite)}</p>
                    {t.estatus !== 'resuelto' && restantes !== null && <p className={`text-[11px] font-semibold ${restantes < 0 ? 'text-red-700' : restantes <= 7 ? 'text-amber-700' : 'text-slate-500'}`}>{restantes < 0 ? `Vencida hace ${-restantes} d` : `Quedan ${restantes} d`}</p>}
                    {t.estatus === 'resuelto' && t.fecha_resolucion && <p className="text-[11px] text-emerald-700">Resuelta {fechaCorta(t.fecha_resolucion)}</p>}
                  </td>
                  <td className="px-4 py-3 min-w-[220px]">
                    {info ? <TicketMasBadge info={info} /> : <span className="text-[11px] text-slate-400">Sin Ticket vinculado</span>}
                    <p className={`text-[11px] mt-1 ${ej.cls}`}>{ej.label}</p>
                  </td>
                  <td className="px-4 py-3"><EstatusPill estatus={t.estatus} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <button className="p-2 rounded-md hover:bg-slate-100 text-slate-600" title={t.ticket_mas_id ? 'Cambiar Ticket MAS' : 'Vincular Ticket MAS'} onClick={() => setVinculando(t)}><Link2 className="w-4 h-4" /></button>
                    <button className="p-2 rounded-md hover:bg-slate-100 text-slate-500" title="Editar" onClick={() => setEditando(t)}><Pencil className="w-4 h-4" /></button>
                    <button className="p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600" title="Eliminar" onClick={() => { if (confirm(`¿Eliminar la tarjeta ${t.folio}?`)) eliminar.mutate(t); }}><Trash2 className="w-4 h-4" /></button>
                    {t.inspeccion_id && <Link to={`/sol/inspecciones/${t.inspeccion_id}`} className="block text-[11px] text-blue-600 hover:underline mt-1">Ver inspección</Link>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {vinculando && (
        <TicketMasLinker abierto onClose={() => setVinculando(null)} colegio={vinculando.colegio}
          colegioNombre={nombreCampus(directorio, vinculando.colegio)} actualId={vinculando.ticket_mas_id}
          guardando={guardarTicket.isPending} onSelect={id => guardarTicket.mutate({ t: vinculando, ticketId: id })} />
      )}
      {editando && (
        <TarjetaModal tarjeta={editando === 'nueva' ? null : editando} campus={campus} existentes={tarjetas}
          onClose={() => setEditando(null)} onSaved={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['sol_tarjetas'] }); }} />
      )}
    </div>
  );
}

function TarjetaModal({ tarjeta, campus, existentes, onClose, onSaved }: {
  tarjeta: SolTarjetaRoja | null; campus: ReturnType<typeof campusSOL>; existentes: SolTarjetaRoja[];
  onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    colegio: tarjeta?.colegio ?? '', fecha: tarjeta?.fecha ?? hoyISO(), area: tarjeta?.area ?? '', articulo: tarjeta?.articulo ?? '',
    cantidad: tarjeta?.cantidad?.toString() ?? '', motivo: tarjeta?.motivo ?? '', destino: tarjeta?.destino ?? '',
    responsable: tarjeta?.responsable ?? '', fecha_limite: tarjeta?.fecha_limite ?? sumarDias(hoyISO(), 30),
    estatus: tarjeta?.estatus ?? 'pendiente', fecha_resolucion: tarjeta?.fecha_resolucion ?? '', observaciones: tarjeta?.observaciones ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!f.colegio || !f.articulo.trim()) { toast.error('Campus y artículo son obligatorios'); return; }
    setGuardando(true);
    try {
      const campos = {
        area: f.area || null, articulo: f.articulo.trim(), cantidad: f.cantidad ? Number(f.cantidad) : null,
        motivo: f.motivo || null, destino: f.destino || null, responsable: f.responsable || null,
        fecha_limite: f.fecha_limite || null, estatus: f.estatus,
        fecha_resolucion: f.estatus === 'resuelto' ? (f.fecha_resolucion || hoyISO()) : null,
        observaciones: f.observaciones || null,
      };
      if (tarjeta) {
        const { error } = await supabase.from('sol_tarjetas_rojas').update(campos).eq('id', tarjeta.id);
        if (error) throw error;
        logAudit({ accion: f.estatus === 'resuelto' && tarjeta.estatus !== 'resuelto' ? 'completar' : 'editar', modulo: 'sol', registro_id: tarjeta.id, registro_ref: tarjeta.folio });
      } else {
        const folio = siguienteFolio(existentes.filter(x => x.colegio === f.colegio).map(x => x.folio), `${codigoCorto(f.colegio)}-TR-`);
        const territorio = campus.find(c => c.codigo === f.colegio)?.territorio ?? null;
        const { data, error } = await supabase.from('sol_tarjetas_rojas').insert({ ...campos, folio, colegio: f.colegio, territorio, fecha: f.fecha }).select('id').single();
        if (error) throw error;
        logAudit({ accion: 'crear', modulo: 'sol', registro_id: data.id, registro_ref: folio });
      }
      toast.success('Tarjeta guardada');
      onSaved();
    } catch (e: unknown) { toast.error((e as { message?: string })?.message ?? 'Error al guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><Flag className="w-4 h-4 text-red-600" />{tarjeta ? `Tarjeta ${tarjeta.folio}` : 'Nueva tarjeta roja'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>Campus</label>
            {tarjeta ? <p className="text-sm font-medium py-2">{campus.find(c => c.codigo === f.colegio)?.nombre ?? f.colegio}</p>
              : <CampusSelect campus={campus} value={f.colegio} onChange={v => set('colegio', v)} todos={false} />}</div>
          <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={f.fecha} disabled={!!tarjeta} onChange={e => set('fecha', e.target.value)} /></div>
          <div><label className={labelCls}>Área</label><select className={inputCls} value={f.area} onChange={e => set('area', e.target.value)}><option value="">—</option>{SOL_AREAS.map(a => <option key={a}>{a}</option>)}</select></div>
          <div><label className={labelCls}>Responsable</label><input className={inputCls} value={f.responsable} onChange={e => set('responsable', e.target.value)} /></div>
          <div><label className={labelCls}>Artículo / material</label><input className={inputCls} value={f.articulo} onChange={e => set('articulo', e.target.value)} /></div>
          <div><label className={labelCls}>Cantidad</label><input type="number" min="0" className={inputCls} value={f.cantidad} onChange={e => set('cantidad', e.target.value)} /></div>
          <div><label className={labelCls}>Motivo</label><select className={inputCls} value={f.motivo} onChange={e => set('motivo', e.target.value)}><option value="">—</option>{MOTIVOS.map(m => <option key={m}>{m}</option>)}</select></div>
          <div><label className={labelCls}>Destino</label><select className={inputCls} value={f.destino} onChange={e => set('destino', e.target.value)}><option value="">—</option>{DESTINOS.map(m => <option key={m}>{m}</option>)}</select></div>
          <div><label className={labelCls}>Fecha límite</label><input type="date" className={inputCls} value={f.fecha_limite} onChange={e => set('fecha_limite', e.target.value)} /></div>
          <div><label className={labelCls}>Estatus</label>
            <select className={inputCls} value={f.estatus} onChange={e => { set('estatus', e.target.value); if (e.target.value === 'resuelto' && !f.fecha_resolucion) set('fecha_resolucion', hoyISO()); }}>
              <option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="resuelto">Resuelto</option>
            </select></div>
          <div><label className={labelCls}>Fecha de resolución</label><input type="date" className={inputCls} disabled={f.estatus !== 'resuelto'} value={f.fecha_resolucion} onChange={e => set('fecha_resolucion', e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Observaciones</label><textarea className={inputCls} rows={2} value={f.observaciones} onChange={e => set('observaciones', e.target.value)} /></div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={guardando} onClick={guardar}>{guardando && <Loader2 className="w-4 h-4 animate-spin" />}Guardar</button>
        </div>
      </div>
    </div>
  );
}
