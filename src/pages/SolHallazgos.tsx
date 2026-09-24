import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Link2, Pencil, Trash2, AlertTriangle, X, Loader2, Upload, Image as ImageIcon, ListChecks, Clock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useDirectorio } from '@/lib/directorio';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_AREAS, campusSOL, nombreCampus, fechaCorta, diasEntre, hoyISO, sumarDias, codigoCorto, siguienteFolio, cicloDe,
  type SolHallazgo,
} from '@/lib/sol';
import { carpetaSOL, traerTodo } from '@/lib/solData';
import {
  CampusSelect, EstatusPill, KpiSOL, TicketMasBadge, TicketMasLinker, useTicketsMasInfo,
  inputCls, labelCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

type Filtro = 'activos' | 'cerrados' | 'todos';

export default function SolHallazgos() {
  const isAdmin = useSolAdmin();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => campusSOL(directorio), [directorio]);

  const [fCampus, setFCampus] = useState('');
  const [fEstatus, setFEstatus] = useState<Filtro>(params.get('folio') ? 'todos' : 'activos');
  const [fArea, setFArea] = useState('');
  const [soloVencidos, setSoloVencidos] = useState(false);
  const [soloGraves, setSoloGraves] = useState(false);
  const [q, setQ] = useState(params.get('folio') ?? '');
  const [editando, setEditando] = useState<SolHallazgo | 'nuevo' | null>(null);
  const [vinculando, setVinculando] = useState<SolHallazgo | null>(null);

  const { data: hallazgos = [], isLoading } = useQuery({
    queryKey: ['sol_hallazgos'],
    enabled: isAdmin,
    queryFn: async () => {
      return traerTodo<SolHallazgo>((a, b) => supabase.from('sol_hallazgos').select('*').order('fecha', { ascending: false }).order('folio').range(a, b));
    },
  });
  const { data: ticketsInfo = {} } = useTicketsMasInfo(hallazgos.map(h => h.ticket_mas_id));

  const base = hallazgos.filter(h => !fCampus || h.colegio === fCampus);
  const filtrados = base.filter(h => {
    if (fEstatus === 'activos' && h.estatus === 'cerrado') return false;
    if (fEstatus === 'cerrados' && h.estatus !== 'cerrado') return false;
    if (fArea && h.area !== fArea) return false;
    if (soloGraves && !h.riesgo_grave) return false;
    if (soloVencidos && (h.estatus === 'cerrado' || diasEntre(h.fecha) <= 30)) return false;
    const n = q.trim().toLowerCase();
    if (n && ![h.folio, h.hallazgo, h.responsable, h.accion, ticketsInfo[h.ticket_mas_id ?? '']?.folio].some(x => String(x ?? '').toLowerCase().includes(n))) return false;
    return true;
  });

  const kpi = useMemo(() => {
    const abiertos = base.filter(h => h.estatus !== 'cerrado');
    const cerrados = base.filter(h => h.estatus === 'cerrado');
    const rapidos = cerrados.filter(h => h.fecha_cierre && diasEntre(h.fecha, h.fecha_cierre) <= 30).length;
    return {
      abiertos: abiertos.length,
      vencidos: abiertos.filter(h => diasEntre(h.fecha) > 30).length,
      graves: abiertos.filter(h => h.riesgo_grave).length,
      pct30: cerrados.length ? Math.round((rapidos / cerrados.length) * 100) : null,
      cerrados: cerrados.length,
    };
  }, [base]);

  const guardarTicket = useMutation({
    mutationFn: async ({ h, ticketId }: { h: SolHallazgo; ticketId: string | null }) => {
      const { error } = await supabase.from('sol_hallazgos').update({ ticket_mas_id: ticketId }).eq('id', h.id);
      if (error) throw error;
      logAudit({ accion: 'editar', modulo: 'sol', registro_id: h.id, registro_ref: h.folio, detalle: { ticket_mas_id: ticketId } });
    },
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['sol_hallazgos'] }); setVinculando(null); toast.success(v.ticketId ? 'Ticket MAS vinculado' : 'Vínculo eliminado'); },
    onError: (e: unknown) => toast.error((e as { message?: string })?.message ?? 'Error'),
  });

  const eliminar = useMutation({
    mutationFn: async (h: SolHallazgo) => {
      const { error } = await supabase.from('sol_hallazgos').delete().eq('id', h.id);
      if (error) throw error;
      logAudit({ accion: 'eliminar', modulo: 'sol', registro_id: h.id, registro_ref: h.folio });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sol_hallazgos'] }); toast.success('Hallazgo eliminado'); },
  });

  if (!isAdmin) return <AccesoRestringido />;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Hallazgos SOL" subtitle="Plan de acción · todo criterio con 0 o 1 se atiende con responsable y fecha · meta: cerrar en menos de 30 días"
        actionLabel="Nuevo hallazgo" onAction={() => setEditando('nuevo')} actionIcon={Plus} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiSOL titulo="Abiertos" valor={kpi.abiertos} icon={ListChecks} tono="naranja" />
        <KpiSOL titulo="Más de 30 días" valor={kpi.vencidos} icon={Clock} tono={kpi.vencidos ? 'rojo' : 'slate'} detalle="Abiertos fuera de meta" />
        <KpiSOL titulo="Riesgo grave abierto" valor={kpi.graves} icon={AlertTriangle} tono={kpi.graves ? 'rojo' : 'slate'} detalle="0 en Seguridad · atender el mismo día" />
        <KpiSOL titulo="Cerrados en <30 días" valor={kpi.pct30 === null ? '—' : `${kpi.pct30}%`} icon={CheckCircle2} tono="verde" detalle={`de ${kpi.cerrados} cerrados · meta 90%`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <CampusSelect campus={campus} value={fCampus} onChange={setFCampus} />
        <select className={inputCls} value={fEstatus} onChange={e => setFEstatus(e.target.value as Filtro)}>
          <option value="activos">Abiertos y en proceso</option><option value="cerrados">Cerrados</option><option value="todos">Todos</option>
        </select>
        <select className={inputCls} value={fArea} onChange={e => setFArea(e.target.value)}>
          <option value="">Todas las áreas</option>{SOL_AREAS.map(a => <option key={a}>{a}</option>)}
        </select>
        <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={inputCls + ' pl-9'} placeholder="Folio, texto, responsable, Ticket…" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap gap-4 mb-4 text-sm text-slate-700">
        <label className="flex items-center gap-2"><input type="checkbox" checked={soloVencidos} onChange={e => setSoloVencidos(e.target.checked)} />Solo con más de 30 días</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={soloGraves} onChange={e => setSoloGraves(e.target.checked)} />Solo riesgo grave</label>
        <span className="text-slate-400">{filtrados.length} resultado(s)</span>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-slate-400 text-sm">Cargando…</p>}
        {!isLoading && filtrados.length === 0 && <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500">Sin hallazgos con estos filtros.</div>}
        {filtrados.map(h => {
          const dias = diasEntre(h.fecha, h.estatus === 'cerrado' ? h.fecha_cierre : null);
          const fuera = h.estatus !== 'cerrado' && dias > 30;
          const info = h.ticket_mas_id ? ticketsInfo[h.ticket_mas_id] : null;
          return (
            <div key={h.id} className={`bg-white rounded-xl border shadow-sm p-4 ${h.riesgo_grave && h.estatus !== 'cerrado' ? 'border-red-300' : 'border-slate-200'}`}>
              <div className="flex flex-col lg:flex-row lg:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-bold text-sm text-slate-900">{h.folio}</span>
                    <EstatusPill estatus={h.estatus} />
                    {h.riesgo_grave && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700"><AlertTriangle className="w-3.5 h-3.5" />Riesgo grave</span>}
                    <span className="text-xs text-slate-500">{nombreCampus(directorio, h.colegio)} · {h.area ?? '—'}{h.tipo ? ` · ${h.tipo}` : ''}</span>
                  </div>
                  <p className="text-sm text-slate-800">{h.hallazgo}</p>
                  {h.accion && <p className="text-xs text-slate-600 mt-1"><b>Acción:</b> {h.accion}</p>}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                    <span>Detectado {fechaCorta(h.fecha)}</span>
                    {h.responsable && <span>Responsable: <b className="text-slate-700">{h.responsable}</b></span>}
                    {h.fecha_compromiso && <span>Compromiso {fechaCorta(h.fecha_compromiso)}</span>}
                    <span className={fuera ? 'text-red-700 font-bold' : ''}>{h.estatus === 'cerrado' ? `Cerrado en ${dias} día(s)` : `${dias} día(s) abierto`}</span>
                    {h.folio_ticket_excel && !info && <span>Folio anotado por el campus: {h.folio_ticket_excel}</span>}
                    {h.foto_cierre_url && <a href={h.foto_cierre_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline"><ImageIcon className="w-3.5 h-3.5" />Foto de cierre</a>}
                    {h.inspeccion_id && <Link to={`/sol/inspecciones/${h.inspeccion_id}`} className="text-blue-600 hover:underline">Ver inspección</Link>}
                  </div>
                  {info && <div className="mt-2"><TicketMasBadge info={info} /></div>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button className={btnSecondary + ' !px-3 !py-1.5 text-xs'} onClick={() => setVinculando(h)}><Link2 className="w-3.5 h-3.5" />{h.ticket_mas_id ? 'Cambiar Ticket' : 'Vincular Ticket MAS'}</button>
                  <button className="p-2 rounded-md hover:bg-slate-100 text-slate-500" title="Editar" onClick={() => setEditando(h)}><Pencil className="w-4 h-4" /></button>
                  <button className="p-2 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600" title="Eliminar" onClick={() => { if (confirm(`¿Eliminar el hallazgo ${h.folio}?`)) eliminar.mutate(h); }}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {vinculando && (
        <TicketMasLinker abierto onClose={() => setVinculando(null)} colegio={vinculando.colegio}
          colegioNombre={nombreCampus(directorio, vinculando.colegio)} actualId={vinculando.ticket_mas_id}
          guardando={guardarTicket.isPending} onSelect={id => guardarTicket.mutate({ h: vinculando, ticketId: id })} />
      )}
      {editando && (
        <HallazgoModal hallazgo={editando === 'nuevo' ? null : editando} campus={campus} existentes={hallazgos}
          onClose={() => setEditando(null)} onSaved={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['sol_hallazgos'] }); }} />
      )}
    </div>
  );
}

function HallazgoModal({ hallazgo, campus, existentes, onClose, onSaved }: {
  hallazgo: SolHallazgo | null; campus: ReturnType<typeof campusSOL>; existentes: SolHallazgo[];
  onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState({
    colegio: hallazgo?.colegio ?? '', fecha: hallazgo?.fecha ?? hoyISO(), area: hallazgo?.area ?? '', tipo: hallazgo?.tipo ?? 'S',
    hallazgo: hallazgo?.hallazgo ?? '', accion: hallazgo?.accion ?? '', responsable: hallazgo?.responsable ?? '',
    fecha_compromiso: hallazgo?.fecha_compromiso ?? sumarDias(hoyISO(), 30), estatus: hallazgo?.estatus ?? 'abierto',
    fecha_cierre: hallazgo?.fecha_cierre ?? '', riesgo_grave: hallazgo?.riesgo_grave ?? false,
    foto_cierre_url: hallazgo?.foto_cierre_url ?? '', notas: hallazgo?.notas ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const { uploadCustom, uploading } = useSharePointUpload();
  const set = (k: keyof typeof f, v: unknown) => setF(p => ({ ...p, [k]: v }));

  const guardar = async () => {
    if (!f.colegio || !f.hallazgo.trim()) { toast.error('Campus y descripción del hallazgo son obligatorios'); return; }
    setGuardando(true);
    try {
      const campos = {
        area: f.area || null, tipo: f.tipo || null, hallazgo: f.hallazgo.trim(), accion: f.accion || null, responsable: f.responsable || null,
        fecha_compromiso: f.fecha_compromiso || null, estatus: f.estatus,
        fecha_cierre: f.estatus === 'cerrado' ? (f.fecha_cierre || hoyISO()) : null,
        riesgo_grave: f.riesgo_grave, foto_cierre_url: f.foto_cierre_url || null, notas: f.notas || null,
      };
      if (hallazgo) {
        const { error } = await supabase.from('sol_hallazgos').update(campos).eq('id', hallazgo.id);
        if (error) throw error;
        logAudit({ accion: f.estatus === 'cerrado' && hallazgo.estatus !== 'cerrado' ? 'completar' : 'editar', modulo: 'sol', registro_id: hallazgo.id, registro_ref: hallazgo.folio });
      } else {
        const folio = siguienteFolio(existentes.filter(x => x.colegio === f.colegio).map(x => x.folio), `${codigoCorto(f.colegio)}-H-`);
        const territorio = campus.find(c => c.codigo === f.colegio)?.territorio ?? null;
        const { data, error } = await supabase.from('sol_hallazgos').insert({ ...campos, folio, colegio: f.colegio, territorio, fecha: f.fecha }).select('id').single();
        if (error) throw error;
        logAudit({ accion: 'crear', modulo: 'sol', registro_id: data.id, registro_ref: folio });
      }
      toast.success('Hallazgo guardado');
      onSaved();
    } catch (e: unknown) { toast.error((e as { message?: string })?.message ?? 'Error al guardar'); }
    finally { setGuardando(false); }
  };

  const subirFoto = async (file: File) => {
    const col = f.colegio || hallazgo?.colegio;
    if (!col) { toast.error('Elige primero el campus'); return; }
    const url = await uploadCustom(file, carpetaSOL(col, cicloDe(f.fecha), 'Hallazgos'), `${hallazgo?.folio ?? 'nuevo'}_cierre_${file.name.replace(/[/\\:*?"<>|]/g, '_')}`);
    if (url) set('foto_cierre_url', url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">{hallazgo ? `Hallazgo ${hallazgo.folio}` : 'Nuevo hallazgo'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={labelCls}>Campus</label>
            {hallazgo ? <p className="text-sm font-medium py-2">{campus.find(c => c.codigo === f.colegio)?.nombre ?? f.colegio}</p>
              : <CampusSelect campus={campus} value={f.colegio} onChange={v => set('colegio', v)} todos={false} />}
          </div>
          <div><label className={labelCls}>Fecha de detección</label><input type="date" className={inputCls} value={f.fecha} disabled={!!hallazgo} onChange={e => set('fecha', e.target.value)} /></div>
          <div><label className={labelCls}>Área</label><select className={inputCls} value={f.area} onChange={e => set('area', e.target.value)}><option value="">—</option>{SOL_AREAS.map(a => <option key={a}>{a}</option>)}</select></div>
          <div><label className={labelCls}>Tipo</label><select className={inputCls} value={f.tipo} onChange={e => set('tipo', e.target.value)}><option value="S">S · Seguridad</option><option value="O">O · Orden</option><option value="L">L · Limpieza</option></select></div>
          <div className="sm:col-span-2"><label className={labelCls}>Hallazgo</label><textarea className={inputCls} rows={2} value={f.hallazgo} onChange={e => set('hallazgo', e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Acción correctiva</label><textarea className={inputCls} rows={2} value={f.accion} onChange={e => set('accion', e.target.value)} /></div>
          <div><label className={labelCls}>Responsable</label><input className={inputCls} value={f.responsable} onChange={e => set('responsable', e.target.value)} /></div>
          <div><label className={labelCls}>Fecha compromiso</label><input type="date" className={inputCls} value={f.fecha_compromiso} onChange={e => set('fecha_compromiso', e.target.value)} /></div>
          <div><label className={labelCls}>Estatus</label>
            <select className={inputCls} value={f.estatus} onChange={e => { set('estatus', e.target.value); if (e.target.value === 'cerrado' && !f.fecha_cierre) set('fecha_cierre', hoyISO()); }}>
              <option value="abierto">Abierto</option><option value="en_proceso">En proceso</option><option value="cerrado">Cerrado</option>
            </select></div>
          <div><label className={labelCls}>Fecha de cierre</label><input type="date" className={inputCls} disabled={f.estatus !== 'cerrado'} value={f.fecha_cierre} onChange={e => set('fecha_cierre', e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Foto del después (cierre)</label>
            <div className="flex gap-2">
              <input className={inputCls} placeholder="Liga de la foto" value={f.foto_cierre_url} onChange={e => set('foto_cierre_url', e.target.value)} />
              <button type="button" className={btnSecondary} disabled={uploading} onClick={() => fotoRef.current?.click()}>{uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Subir</button>
              <input ref={fotoRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => { const x = e.target.files?.[0]; if (x) subirFoto(x); e.target.value = ''; }} />
            </div>
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.riesgo_grave} onChange={e => set('riesgo_grave', e.target.checked)} />Riesgo grave a la seguridad (se atiende el mismo día)</label>
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
