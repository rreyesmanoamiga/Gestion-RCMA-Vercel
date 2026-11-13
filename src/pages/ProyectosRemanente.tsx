import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Gift, Download, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import { usePermissions } from '@/hooks/usePermissions';
import { useScope } from '@/hooks/useScope';
import { normalizarColegio } from '@/lib/colegios';
import { textoAnios } from '@/components/shared/RemanenteSorteo';

// ─── Proyectos del Remanente de los Sorteos Mano Amiga ───────────────────────
// Solo consulta. Toma los Ticket MAS marcados como "Remanente" y les pega su
// proyecto (avance, estatus, cierre) y el monto autorizado de Tickets Registrados.

interface TMas {
  id: string; folio: string | null; colegio: string | null; territorio: string | null; nombre_proyecto: string | null;
  estatus: string | null; created_at: string | null; fecha_autorizacion: string | null;
  remanente_anios: number[] | null; cot1_importe: number | null; cot1_proveedor: string | null;
}
interface Ticket { folio: string | null; presupuesto: number | null; proyecto_id: string | null; nombre_proveedor: string | null }
interface Proyecto { id: string; folio: string | null; name: string | null; status: string | null; progress: number | null; budget: number | null; costo_real: number | null; completado_at: string | null }

const ESTATUS: Record<string, { label: string; cls: string }> = {
  por_autorizar: { label: 'Por autorizar', cls: 'bg-slate-100 text-slate-600' },
  en_espera:     { label: 'Por iniciar',   cls: 'bg-amber-50 text-amber-700' },
  en_proceso:    { label: 'En proceso',    cls: 'bg-blue-50 text-blue-700' },
  pausado:       { label: 'Pausado',       cls: 'bg-orange-50 text-orange-700' },
  completado:    { label: 'Concluido',     cls: 'bg-emerald-50 text-emerald-700' },
  cancelado:     { label: 'Cancelado',     cls: 'bg-red-50 text-red-600' },
  sin_proyecto:  { label: 'Autorizado',    cls: 'bg-emerald-50 text-emerald-700' },
};
const fmx = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fecha = (d?: string | null) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const selectClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700";

export default function ProyectosRemanente() {
  const { isAdmin, can } = usePermissions();
  const puedeVer = isAdmin || can('ver_remanente');
  const { filtrarPorAlcance } = useScope();
  const navigate = useNavigate();

  const { data: tmasRaw = [], isLoading: l1 } = useQuery({
    queryKey: ['remanente-tickets-mas'], enabled: puedeVer,
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets_mas')
        .select('id, folio, colegio, territorio, nombre_proyecto, estatus, created_at, fecha_autorizacion, remanente_anios, cot1_importe, cot1_proveedor')
        .eq('remanente_sorteo', true).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TMas[];
    },
  });
  const tmas = useMemo(() => filtrarPorAlcance(tmasRaw, t => t.territorio, t => t.colegio), [tmasRaw, filtrarPorAlcance]);
  const folios = useMemo(() => tmas.map(t => t.folio).filter(Boolean) as string[], [tmas]);

  const { data: tickets = [], isLoading: l2 } = useQuery({
    queryKey: ['remanente-tickets', folios], enabled: puedeVer && folios.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select('folio, presupuesto, proyecto_id, nombre_proveedor').in('folio', folios);
      if (error) throw error;
      return (data ?? []) as Ticket[];
    },
  });
  const proyectoIds = useMemo(() => tickets.map(t => t.proyecto_id).filter(Boolean) as string[], [tickets]);
  const { data: proyectos = [], isLoading: l3 } = useQuery({
    queryKey: ['remanente-proyectos', folios, proyectoIds], enabled: puedeVer && folios.length > 0,
    queryFn: async () => {
      const sel = 'id, folio, name, status, progress, budget, costo_real, completado_at';
      const [a, b] = await Promise.all([
        supabase.from('projects').select(sel).in('folio', folios),
        proyectoIds.length ? supabase.from('projects').select(sel).in('id', proyectoIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      const m = new Map<string, Proyecto>();
      [...(a.data ?? []), ...(b.data ?? [])].forEach((p: any) => m.set(p.id, p));
      return [...m.values()];
    },
  });

  const filas = useMemo(() => tmas.map(t => {
    const tk = tickets.find(x => x.folio === t.folio) ?? null;
    const pr = (tk?.proyecto_id ? proyectos.find(p => p.id === tk.proyecto_id) : null) ?? proyectos.find(p => p.folio === t.folio) ?? null;
    const estado = t.estatus === 'cancelado' ? 'cancelado'
      : (t.estatus === 'pendiente' || t.estatus === 'en_revision') ? 'por_autorizar'
      : pr?.status && ESTATUS[pr.status] ? pr.status : 'sin_proyecto';
    const monto = Number(tk?.presupuesto ?? pr?.budget ?? t.cot1_importe ?? 0);
    return {
      t, pr, estado, monto,
      colegio: normalizarColegio(t.colegio),
      proyecto: pr?.name || t.nombre_proyecto || '—',
      proveedor: tk?.nombre_proveedor || t.cot1_proveedor || '—',
      avance: estado === 'completado' ? 100 : Number(pr?.progress ?? 0),
      anios: [...(t.remanente_anios ?? [])].sort((a, b) => a - b),
    };
  }), [tmas, tickets, proyectos]);

  const [fAnio, setFAnio] = useState('all');
  const [fCol, setFCol] = useState('all');
  const [fEst, setFEst] = useState('all');
  const aniosDisp = useMemo(() => [...new Set(filas.flatMap(f => f.anios))].sort(), [filas]);
  const colegiosDisp = useMemo(() => [...new Set(filas.map(f => f.colegio).filter(Boolean))].sort(), [filas]);

  const visibles = filas.filter(f =>
    (fAnio === 'all' || (fAnio === 'sin' ? f.anios.length === 0 : f.anios.includes(Number(fAnio)))) &&
    (fCol === 'all' || f.colegio === fCol) &&
    (fEst === 'all' || f.estado === fEst));

  const activos = visibles.filter(f => f.estado !== 'cancelado');
  const kpis = {
    proyectos: activos.length,
    enCurso: activos.filter(f => ['en_espera', 'en_proceso', 'pausado', 'sin_proyecto', 'por_autorizar'].includes(f.estado)).length,
    concluidos: activos.filter(f => f.estado === 'completado').length,
    avance: activos.length ? Math.round(activos.reduce((s, f) => s + f.avance, 0) / activos.length) : 0,
    monto: activos.filter(f => f.estado !== 'por_autorizar').reduce((s, f) => s + f.monto, 0),
  };

  const exportarExcel = async () => {
    const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Proyectos del Remanente', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Folio', width: 16 }, { header: 'Proyecto', width: 44 }, { header: 'Colegio', width: 12 }, { header: 'Sorteo(s)', width: 14 },
      { header: 'Proveedor', width: 30 }, { header: 'Monto autorizado', width: 18 }, { header: 'Avance %', width: 10 },
      { header: 'Estatus', width: 14 }, { header: 'Autorización', width: 14 }, { header: 'Cierre', width: 14 },
    ];
    visibles.forEach(f => ws.addRow([f.t.folio ?? '', f.proyecto, f.colegio, textoAnios(f.anios) || 'Por definir', f.proveedor,
      f.monto, f.avance, ESTATUS[f.estado]?.label ?? f.estado, fecha(f.t.fecha_autorizacion), f.pr?.completado_at ? fecha(f.pr.completado_at) : '']));
    ws.getRow(1).eachCell((c: any) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00295A' } }; });
    ws.getColumn(6).numFmt = '"$"#,##0.00';
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = `Proyectos_Remanente_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  if (!puedeVer) return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <PageHeader title="Proyectos del Remanente" subtitle="Proyectos financiados con el Remanente de los Sorteos Mano Amiga" />
      <AccesoRestringido />
    </div>
  );
  if (l1 || l2 || l3) return (
    <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2 border-b border-slate-100 pb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-slate-900 tracking-tight uppercase">Proyectos del Remanente</h1>
          <p className="text-sm text-slate-500 font-medium mt-1 italic">Proyectos financiados con el Remanente de los Sorteos Mano Amiga</p>
        </div>
        <button onClick={exportarExcel} className="inline-flex items-center gap-2 px-4 py-2 border border-emerald-300 text-emerald-700 bg-white rounded-md text-sm font-bold hover:bg-emerald-50 self-start sm:self-auto">
          <Download className="w-4 h-4" /> Excel
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Proyectos',               value: String(kpis.proyectos),  color: 'text-slate-900' },
          { label: 'Por iniciar / en proceso', value: String(kpis.enCurso),    color: 'text-amber-600' },
          { label: 'Concluidos',              value: String(kpis.concluidos), color: 'text-emerald-600' },
          { label: 'Avance promedio',         value: `${kpis.avance}%`,       color: 'text-blue-600' },
          { label: 'Monto autorizado',        value: fmx(kpis.monto),         color: 'text-blue-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
            <p className={`text-xl font-black ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select className={selectClass} value={fAnio} onChange={e => setFAnio(e.target.value)}>
          <option value="all">Todos los sorteos</option>
          {aniosDisp.map(a => <option key={a} value={a}>Sorteo {a}</option>)}
          {filas.some(f => f.anios.length === 0) && <option value="sin">Sorteo por definir</option>}
        </select>
        <select className={selectClass} value={fCol} onChange={e => setFCol(e.target.value)}>
          <option value="all">Todos los colegios</option>
          {colegiosDisp.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selectClass} value={fEst} onChange={e => setFEst(e.target.value)}>
          <option value="all">Todos los estatus</option>
          {['por_autorizar', 'en_espera', 'en_proceso', 'pausado', 'completado', 'sin_proyecto', 'cancelado'].map(k => <option key={k} value={k}>{ESTATUS[k].label}</option>)}
        </select>
        <span className="text-sm text-slate-500">{visibles.length} proyecto{visibles.length !== 1 ? 's' : ''}</span>
      </div>

      {visibles.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-20 text-center">
          <Gift className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No hay proyectos del remanente con esos filtros.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-800 text-white text-[10.5px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Folio</th><th className="text-left px-3">Proyecto</th><th className="text-left px-3">Colegio</th>
                <th className="px-3">Sorteo(s)</th><th className="text-right px-3">Autorizado</th><th className="px-3 w-40">Avance</th>
                <th className="px-3">Estatus</th><th className="px-3">Cierre</th><th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((f, i) => (
                <tr key={f.t.id} onClick={() => f.pr && navigate(`/proyectos/${f.pr.id}`)}
                  className={`border-t border-slate-100 ${f.pr ? 'cursor-pointer hover:bg-purple-50/50' : ''} ${i % 2 ? 'bg-slate-50/50' : ''} ${f.estado === 'cancelado' ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-2.5 font-black text-red-600 whitespace-nowrap">{f.t.folio ?? '—'}</td>
                  <td className="px-3 py-2.5"><p className="font-semibold text-slate-800">{f.proyecto}</p><p className="text-[11px] text-slate-500">{f.proveedor}</p></td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{f.colegio}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${f.anios.length ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                      {f.anios.length ? textoAnios(f.anios) : 'Por definir'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">{f.monto ? fmx(f.monto) : '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-2 rounded-full ${f.avance >= 100 ? 'bg-emerald-500' : 'bg-orange-400'}`} style={{ width: `${Math.max(2, Math.min(100, f.avance))}%` }} /></div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{f.avance}%</p>
                  </td>
                  <td className="px-3 py-2.5 text-center"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${ESTATUS[f.estado]?.cls ?? ''}`}>{ESTATUS[f.estado]?.label ?? f.estado}</span></td>
                  <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{f.pr?.completado_at ? fecha(f.pr.completado_at) : '—'}</td>
                  <td className="pr-3">{f.pr && <ChevronRight className="w-4 h-4 text-slate-300" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400 italic">Al dar clic en un proyecto se abre su detalle: avance, fotos antes/durante/después y expediente.</p>
    </div>
  );
}
