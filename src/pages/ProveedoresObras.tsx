import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Factory, Search, X, Download, Pencil, Trash2, Plus, Phone, Mail, FileText, UserRound, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import { usePermissions } from '@/hooks/usePermissions';
import { useScope } from '@/hooks/useScope';
import { COLEGIOS, TERRITORIOS, normalizarColegio } from '@/lib/colegios';
import { logAudit } from '@/lib/audit';

// ─── Padrón de Proveedores (Obras) ───────────────────────────────────────────
// El catálogo (obras_proveedores) guarda nombre, "también escrito como", ámbitos
// y contacto. Trabajos, colegios, tipos y montos se calculan en vivo de
// Tickets Registrados (tickets) y de las cotizaciones del Ticket MAS.

export const AMBITOS = [
  'Obra civil', 'Electricidad', 'Plomería e hidráulica', 'Herrería', 'Climas y aire acondicionado',
  'Cubiertas y estructuras', 'Impermeabilización', 'Pintura y acabados', 'Carpintería y mobiliario',
  'Vidrio y cancelería', 'Jardinería y áreas verdes', 'Canchas y áreas deportivas', 'Proyectos y diseño',
  'Estudios técnicos y topografía', 'Mantenimiento general', 'Limpieza y fumigación', 'Seguridad y CCTV',
];

interface Proveedor {
  id: string; nombre: string; alias: string[]; ambitos: string[];
  rfc: string | null; contacto: string | null; telefono: string | null; correo: string | null;
  notas: string | null; activo: boolean;
}
interface Ticket {
  id: string; folio: string | null; nombre_proveedor: string | null; colegio: string | null; territorio: string | null;
  tipo_proyecto: string | null; presupuesto: number | null; fecha: string | null; estatus: string | null; nombre_proyecto: string | null;
}
interface TicketMas {
  id: string; folio: string | null; colegio: string | null; territorio: string | null; nombre_proyecto: string | null;
  estatus: string | null; created_at: string | null;
  cot1_proveedor: string | null; cot2_proveedor: string | null; cot3_proveedor: string | null;
  cot1_importe: number | null; cot2_importe: number | null; cot3_importe: number | null;
}
interface Fila {
  key: string; prov: Proveedor | null; nombre: string; variantes: string[];
  trabajos: Ticket[]; cancelados: Ticket[]; cotizaciones: { t: TicketMas; importe: number | null; gano: boolean }[];
  tipos: string[]; colegios: string[]; territorios: string[]; monto: number; ultimo: string | null;
}

/** Clave para comparar nombres: sin acentos, mayúsculas, signos ni "S.A. de C.V." */
const clave = (s?: string | null) => (s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(s\.?\s?a\.?\s?p\.?\s?i\.?|s\.?\s?a\.?|s\.?\s?de\s?r\.?\s?l\.?)(\s?de\s?c\.?\s?v\.?)?\.?\s*$/g, '')
  .replace(/[^a-z0-9]/g, '');
const sinAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const NO_PROVEEDOR = new Set(['', 'na', 'n/a', 'ninguno', 'sinproveedor']);
const fmx = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fecha = (d?: string | null) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('es-MX') : '—';
const TERR_LBL: Record<string, string> = { NORTE: 'Norte', MEXICO: 'México', FMA: 'FMA' };
const territorioDeColegio = (c: string) => COLEGIOS.find(x => x.colegio === c)?.territorio ?? '';

const selectClass = "h-10 px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none text-slate-700";
const inputClass  = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const chip = "inline-block text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap";

const VACIO: Omit<Proveedor, 'id'> = { nombre: '', alias: [], ambitos: [], rfc: '', contacto: '', telefono: '', correo: '', notas: '', activo: true };

export default function ProveedoresObras() {
  const { isAdmin, can } = usePermissions();
  const puedeVer = isAdmin || can('ver_proveedores');
  const { filtrarPorAlcance } = useScope();
  const qc = useQueryClient();

  const { data: provs = [], isLoading: l1 } = useQuery({
    queryKey: ['obras_proveedores'], enabled: puedeVer,
    queryFn: async () => { const { data, error } = await supabase.from('obras_proveedores').select('*').order('nombre'); if (error) throw error; return (data ?? []) as Proveedor[]; },
  });
  const { data: ticketsRaw = [], isLoading: l2 } = useQuery({
    queryKey: ['proveedores-tickets'], enabled: puedeVer,
    queryFn: async () => { const { data, error } = await supabase.from('tickets').select('id, folio, nombre_proveedor, colegio, territorio, tipo_proyecto, presupuesto, fecha, estatus, nombre_proyecto').order('fecha', { ascending: false }); if (error) throw error; return (data ?? []) as Ticket[]; },
  });
  const { data: tmasRaw = [], isLoading: l3 } = useQuery({
    queryKey: ['proveedores-tickets-mas'], enabled: puedeVer,
    queryFn: async () => { const { data, error } = await supabase.from('tickets_mas').select('id, folio, colegio, territorio, nombre_proyecto, estatus, created_at, cot1_proveedor, cot2_proveedor, cot3_proveedor, cot1_importe, cot2_importe, cot3_importe').order('created_at', { ascending: false }); if (error) throw error; return (data ?? []) as TicketMas[]; },
  });

  // Cada quien ve los trabajos de su alcance (CAR su territorio, colegio el suyo)
  const tickets = useMemo(() => filtrarPorAlcance(ticketsRaw, t => t.territorio, t => t.colegio), [ticketsRaw, filtrarPorAlcance]);
  const tmas    = useMemo(() => filtrarPorAlcance(tmasRaw, t => t.territorio, t => t.colegio), [tmasRaw, filtrarPorAlcance]);

  // ── Armado del padrón ──────────────────────────────────────────────────────
  const filas = useMemo<Fila[]>(() => {
    const porClave = new Map<string, Fila>();
    const nueva = (key: string, prov: Proveedor | null, nombre: string): Fila =>
      ({ key, prov, nombre, variantes: [], trabajos: [], cancelados: [], cotizaciones: [], tipos: [], colegios: [], territorios: [], monto: 0, ultimo: null });
    const filasCat: Fila[] = provs.map(p => nueva(p.id, p, p.nombre));
    provs.forEach((p, i) => [p.nombre, ...(p.alias ?? [])].forEach(n => { const k = clave(n); if (k && !porClave.has(k)) porClave.set(k, filasCat[i]); }));
    const sueltas = new Map<string, Fila>();
    const ganados = new Set<string>(); // folio|proveedor de los tickets: quién se quedó con el trabajo
    const filaDe = (nombre: string | null) => {
      const k = clave(nombre);
      if (NO_PROVEEDOR.has(k)) return null;
      const f = porClave.get(k) ?? sueltas.get(k) ?? (() => { const n = nueva('nuevo:' + k, null, (nombre ?? '').trim()); sueltas.set(k, n); return n; })();
      const limpio = (nombre ?? '').trim();
      if (limpio && limpio.toLowerCase() !== f.nombre.toLowerCase() && !f.variantes.some(v => v.toLowerCase() === limpio.toLowerCase())) f.variantes.push(limpio);
      return f;
    };
    tickets.forEach(t => {
      const f = filaDe(t.nombre_proveedor); if (!f) return;
      if (t.folio) ganados.add(t.folio + '|' + f.key);
      if (t.estatus === 'cancelado') { f.cancelados.push(t); return; }
      f.trabajos.push(t);
      f.monto += Number(t.presupuesto ?? 0);
      if (t.tipo_proyecto && !f.tipos.some(x => sinAcento(x) === sinAcento(t.tipo_proyecto!))) f.tipos.push(t.tipo_proyecto.toUpperCase());
      const c = normalizarColegio(t.colegio); if (c && !f.colegios.includes(c)) f.colegios.push(c);
      const terr = t.territorio || territorioDeColegio(c); if (terr && !f.territorios.includes(terr)) f.territorios.push(terr);
      if (t.fecha && (!f.ultimo || t.fecha > f.ultimo)) f.ultimo = t.fecha;
    });
    tmas.forEach(t => {
      const vistos = new Set<Fila>();
      ([[t.cot1_proveedor, t.cot1_importe], [t.cot2_proveedor, t.cot2_importe], [t.cot3_proveedor, t.cot3_importe]] as [string | null, number | null][])
        .forEach(([n, imp]) => {
          const f = filaDe(n); if (!f || vistos.has(f)) return; vistos.add(f);
          f.cotizaciones.push({ t, importe: imp, gano: !!t.folio && ganados.has(t.folio + '|' + f.key) });
          const c = normalizarColegio(t.colegio); const terr = t.territorio || territorioDeColegio(c);
          if (terr && !f.territorios.includes(terr)) f.territorios.push(terr);
        });
    });
    return [...filasCat, ...sueltas.values()]
      .filter(f => f.prov ? true : f.trabajos.length + f.cotizaciones.length + f.cancelados.length > 0)
      .sort((a, b) => b.monto - a.monto || b.cotizaciones.length - a.cotizaciones.length || a.nombre.localeCompare(b.nombre, 'es'));
  }, [provs, tickets, tmas]);

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [buscar, setBuscar] = useState('');
  const [fTerr, setFTerr] = useState('all');
  const [fCol, setFCol] = useState('all');
  const [fTipo, setFTipo] = useState('all');
  const [fAmb, setFAmb] = useState('all');
  const [fVista, setFVista] = useState<'todos' | 'trabajos' | 'cotizo'>('todos');
  const tiposDisp = useMemo(() => [...new Set(filas.flatMap(f => f.tipos))].sort(), [filas]);
  const colegiosDisp = useMemo(() => [...new Set(filas.flatMap(f => f.colegios))]
    .filter(c => fTerr === 'all' || territorioDeColegio(c) === fTerr).sort(), [filas, fTerr]);

  const visibles = useMemo(() => {
    const q = clave(buscar);
    return filas.filter(f => {
      if (q && !clave([f.nombre, ...(f.prov?.alias ?? []), ...f.variantes, f.prov?.rfc ?? ''].join(' ')).includes(q)) return false;
      if (fTerr !== 'all' && !f.territorios.includes(fTerr)) return false;
      if (fCol !== 'all' && !f.colegios.includes(fCol) && !f.cotizaciones.some(c => normalizarColegio(c.t.colegio) === fCol)) return false;
      if (fTipo !== 'all' && !f.tipos.includes(fTipo)) return false;
      if (fAmb !== 'all' && !(f.prov?.ambitos ?? []).includes(fAmb)) return false;
      if (fVista === 'trabajos' && f.trabajos.length === 0) return false;
      if (fVista === 'cotizo' && (f.trabajos.length > 0 || f.cotizaciones.length === 0)) return false;
      return true;
    });
  }, [filas, buscar, fTerr, fCol, fTipo, fAmb, fVista]);

  const kpis = useMemo(() => ({
    total: visibles.length,
    trabajos: visibles.filter(f => f.trabajos.length > 0).length,
    cotizo: visibles.filter(f => f.trabajos.length === 0 && f.cotizaciones.length > 0).length,
    colegios: new Set(visibles.flatMap(f => f.colegios)).size,
    monto: visibles.reduce((s, f) => s + f.monto, 0),
  }), [visibles]);

  // ── Ficha y formulario ─────────────────────────────────────────────────────
  const [fichaKey, setFichaKey] = useState<string | null>(null);
  const ficha = filas.find(f => f.key === fichaKey) ?? null;
  const [form, setForm] = useState<(Omit<Proveedor, 'id'> & { id?: string; aliasTxt: string }) | null>(null);
  const [borrando, setBorrando] = useState<Proveedor | null>(null);

  const abrirForm = (f?: Fila) => {
    if (f?.prov) setForm({ ...f.prov, rfc: f.prov.rfc ?? '', contacto: f.prov.contacto ?? '', telefono: f.prov.telefono ?? '', correo: f.prov.correo ?? '', notas: f.prov.notas ?? '', aliasTxt: (f.prov.alias ?? []).join('\n') });
    else setForm({ ...VACIO, nombre: f?.nombre ?? '', aliasTxt: (f?.variantes ?? []).join('\n') });
  };

  const guardar = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const nombre = form.nombre.trim();
      if (!nombre) throw new Error('Escribe el nombre del proveedor');
      const alias = [...new Set(form.aliasTxt.split('\n').map(s => s.trim()).filter(s => s && s.toLowerCase() !== nombre.toLowerCase()))];
      const datos = { nombre, alias, ambitos: form.ambitos, rfc: form.rfc?.trim() || null, contacto: form.contacto?.trim() || null,
        telefono: form.telefono?.trim() || null, correo: form.correo?.trim() || null, notas: form.notas?.trim() || null, activo: form.activo, updated_at: new Date().toISOString() };
      if (form.id) {
        const { error } = await supabase.from('obras_proveedores').update(datos).eq('id', form.id); if (error) throw error;
        logAudit({ accion: 'editar', modulo: 'proveedores', registro_id: form.id, registro_ref: nombre });
      } else {
        const { data, error } = await supabase.from('obras_proveedores').insert(datos).select('id').single(); if (error) throw error;
        logAudit({ accion: 'crear', modulo: 'proveedores', registro_id: data?.id, registro_ref: nombre });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['obras_proveedores'] }); toast.success('Proveedor guardado'); setForm(null); },
    onError: (e: any) => toast.error(/duplicate|unique/i.test(e?.message ?? '') ? 'Ya existe un proveedor con ese nombre' : (e?.message ?? 'No se pudo guardar')),
  });
  const eliminar = useMutation({
    mutationFn: async (p: Proveedor) => {
      const { error } = await supabase.from('obras_proveedores').delete().eq('id', p.id); if (error) throw error;
      logAudit({ accion: 'eliminar', modulo: 'proveedores', registro_id: p.id, registro_ref: p.nombre });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['obras_proveedores'] }); toast.success('Proveedor eliminado del padrón'); setBorrando(null); setFichaKey(null); },
    onError: (e: any) => toast.error(e?.message ?? 'No se pudo eliminar'),
  });

  // ── Excel ──────────────────────────────────────────────────────────────────
  const exportarExcel = async () => {
    const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Padrón de Proveedores', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: 'Proveedor', width: 40 }, { header: 'Ámbitos', width: 34 }, { header: 'Tipos de trabajo', width: 36 },
      { header: 'Colegios', width: 26 }, { header: 'Territorios', width: 16 }, { header: 'Trabajos', width: 10 },
      { header: 'Cotizaciones', width: 12 }, { header: 'Monto contratado', width: 18 }, { header: 'Último trabajo', width: 14 },
      { header: 'RFC', width: 16 }, { header: 'Contacto', width: 22 }, { header: 'Teléfono', width: 16 }, { header: 'Correo', width: 26 },
      { header: 'También escrito como', width: 34 }, { header: 'Notas', width: 40 },
    ];
    visibles.forEach(f => ws.addRow([
      f.nombre, (f.prov?.ambitos ?? []).join(', '), f.tipos.join(', '), f.colegios.join(', '), f.territorios.map(t => TERR_LBL[t] ?? t).join(', '),
      f.trabajos.length, f.cotizaciones.length, f.monto, f.ultimo ? fecha(f.ultimo) : '', f.prov?.rfc ?? '', f.prov?.contacto ?? '',
      f.prov?.telefono ?? '', f.prov?.correo ?? '', [...(f.prov?.alias ?? []), ...f.variantes].filter((v, i, a) => a.indexOf(v) === i).join(', '),
      f.prov ? (f.prov.notas ?? '') : 'Sin registrar en el padrón',
    ]));
    ws.getRow(1).eachCell((c: any) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00295A' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
    ws.getRow(1).height = 24;
    ws.getColumn(8).numFmt = '"$"#,##0.00';
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 15 } };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = `Padron_Proveedores_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  if (!puedeVer) return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <PageHeader title="Padrón de Proveedores" subtitle="Quién ha trabajado o cotizado en obras y mantenimiento" />
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
          <h1 className="text-2xl font-display font-semibold text-slate-900 tracking-tight uppercase">Padrón de Proveedores</h1>
          <p className="text-sm text-slate-500 font-medium mt-1 italic">Quién ha trabajado o cotizado en obras y mantenimiento, qué hizo y dónde</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportarExcel} className="inline-flex items-center gap-2 px-4 py-2 border border-emerald-300 text-emerald-700 bg-white rounded-md text-sm font-bold hover:bg-emerald-50">
            <Download className="w-4 h-4" /> Excel
          </button>
          {isAdmin && (
            <button onClick={() => abrirForm()} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 shadow-sm">
              <Plus className="w-4 h-4" /> Nuevo proveedor
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Proveedores',        value: kpis.total,     color: 'text-slate-900' },
          { label: 'Con trabajos',       value: kpis.trabajos,  color: 'text-emerald-600' },
          { label: 'Solo cotizaron',     value: kpis.cotizo,    color: 'text-amber-600' },
          { label: 'Colegios atendidos', value: kpis.colegios,  color: 'text-blue-600' },
          { label: 'Monto contratado',   value: fmx(kpis.monto), color: 'text-blue-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <p className={`text-xl font-black ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar proveedor o RFC…"
            className="h-10 pl-9 pr-3 w-64 max-w-full bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-400 focus:outline-none" />
        </div>
        <select className={selectClass} value={fTerr} onChange={e => { setFTerr(e.target.value); setFCol('all'); }}>
          <option value="all">Todos los territorios</option>
          {TERRITORIOS.map(t => <option key={t} value={t}>{TERR_LBL[t] ?? t}</option>)}
        </select>
        <select className={selectClass} value={fCol} onChange={e => setFCol(e.target.value)}>
          <option value="all">Todos los colegios</option>
          {colegiosDisp.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selectClass} value={fAmb} onChange={e => setFAmb(e.target.value)}>
          <option value="all">Todos los ámbitos</option>
          {AMBITOS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className={selectClass} value={fTipo} onChange={e => setFTipo(e.target.value)}>
          <option value="all">Todos los tipos de trabajo</option>
          {tiposDisp.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {([['todos', 'Todos'], ['trabajos', 'Con trabajos'], ['cotizo', 'Solo cotizó']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFVista(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${fVista === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}>{l}</button>
        ))}
        <span className="text-sm text-slate-500">{visibles.length} proveedor{visibles.length !== 1 ? 'es' : ''}</span>
      </div>

      {/* Tabla */}
      {visibles.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-20 text-center">
          <Factory className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No hay proveedores con esos filtros.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-800 text-white text-[10.5px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Proveedor</th>
                <th className="text-left px-3">Ámbito</th>
                <th className="text-left px-3">Tipo de trabajos</th>
                <th className="text-left px-3">Dónde</th>
                <th className="px-3 text-center">Trab.</th>
                <th className="px-3 text-center">Cotiz.</th>
                <th className="text-right px-4">Contratado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f, i) => (
                <tr key={f.key} onClick={() => setFichaKey(f.key)}
                  className={`border-t border-slate-100 cursor-pointer hover:bg-orange-50/60 ${i % 2 ? 'bg-slate-50/50' : ''}`}>
                  <td className="px-4 py-2.5 font-bold text-slate-800">
                    {f.nombre}
                    {f.prov && (f.prov.alias.length > 0 || f.variantes.length > 0) && <span className={`${chip} bg-blue-50 text-blue-700 ml-1.5`}>unificado</span>}
                    {f.trabajos.length === 0 && f.cotizaciones.length > 0 && <span className={`${chip} bg-amber-100 text-amber-700 ml-1.5`}>Solo cotizó</span>}
                    {!f.prov && <span className={`${chip} bg-slate-200 text-slate-600 ml-1.5`}>Sin registrar</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">{(f.prov?.ambitos ?? []).length ? f.prov!.ambitos.map(a => <span key={a} className={`${chip} bg-orange-50 text-orange-700 border border-orange-200`}>{a}</span>) : <span className="text-slate-300">—</span>}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">{f.tipos.length ? f.tipos.map(t => <span key={t} className={`${chip} bg-slate-100 text-slate-600`}>{t}</span>) : <span className="text-slate-300">—</span>}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">{f.colegios.length ? f.colegios.map(c => <span key={c} className={`${chip} bg-[#00295A]/10 text-[#00295A]`}>{c}</span>) : <span className="text-slate-300">—</span>}</div>
                  </td>
                  <td className="px-3 text-center font-bold text-emerald-600">{f.trabajos.length || '—'}</td>
                  <td className="px-3 text-center font-bold text-amber-600">{f.cotizaciones.length || '—'}</td>
                  <td className="px-4 text-right font-semibold text-slate-800 whitespace-nowrap">{f.monto ? fmx(f.monto) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ficha del proveedor */}
      {ficha && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setFichaKey(null)}>
          <div className="w-full max-w-md h-full bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-[#00295A] text-white px-5 py-4 relative">
              <button onClick={() => setFichaKey(null)} className="absolute right-3 top-3 p-1 rounded hover:bg-white/10" aria-label="Cerrar"><X className="w-5 h-5" /></button>
              <p className="text-[10px] uppercase tracking-widest text-white/60 font-bold">Ficha del proveedor</p>
              <p className="text-lg font-black pr-8">{ficha.nombre}</p>
              {[...(ficha.prov?.alias ?? []), ...ficha.variantes].filter((v, i, a) => a.indexOf(v) === i).length > 0 && (
                <p className="text-[11px] text-white/70 mt-1">También escrito como: <i>{[...(ficha.prov?.alias ?? []), ...ficha.variantes].filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</i></p>
              )}
            </div>
            <div className="h-1 bg-[#ED7102]" />
            <div className="p-5 space-y-4 text-sm">
              {!ficha.prov && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-xs">
                  Este nombre aparece en tickets o cotizaciones pero aún no está en el padrón.
                  {isAdmin && <button onClick={() => abrirForm(ficha)} className="ml-1 font-bold underline">Registrarlo</button>}
                </div>
              )}
              {ficha.prov && (
                <>
                  <div className="flex flex-wrap gap-1">{ficha.prov.ambitos.map(a => <span key={a} className={`${chip} bg-orange-50 text-orange-700 border border-orange-200`}>{a}</span>)}
                    {ficha.prov.ambitos.length === 0 && <span className="text-xs text-slate-400">Sin ámbito asignado</span>}</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {[[FileText, 'RFC', ficha.prov.rfc], [UserRound, 'Contacto', ficha.prov.contacto], [Phone, 'Teléfono', ficha.prov.telefono], [Mail, 'Correo', ficha.prov.correo]].map(([Ic, l, v]: any) => (
                      <div key={l}><p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Ic className="w-3 h-3" />{l}</p><p className="text-slate-800 break-words">{v || '—'}</p></div>
                    ))}
                  </div>
                </>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-lg p-2 text-center"><p className="text-lg font-black text-emerald-600">{ficha.trabajos.length}</p><p className="text-[10px] text-slate-500">trabajos</p></div>
                <div className="bg-slate-50 rounded-lg p-2 text-center"><p className="text-lg font-black text-amber-600">{ficha.cotizaciones.length}</p><p className="text-[10px] text-slate-500">cotizaciones</p></div>
                <div className="bg-slate-50 rounded-lg p-2 text-center"><p className="text-sm font-black text-blue-600 mt-1">{fmx(ficha.monto)}</p><p className="text-[10px] text-slate-500">contratado</p></div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Trabajos registrados</p>
                {ficha.trabajos.length + ficha.cancelados.length === 0 ? <p className="text-xs text-slate-400">Sin trabajos registrados.</p> : (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {[...ficha.trabajos, ...ficha.cancelados].map(t => (
                      <div key={t.id} className={`px-3 py-2 text-xs ${t.estatus === 'cancelado' ? 'opacity-60' : ''}`}>
                        <div className="flex justify-between gap-2">
                          <span><b className="text-red-600">{t.folio ?? 'Sin folio'}</b> · {normalizarColegio(t.colegio)} · {t.tipo_proyecto ?? '—'}</span>
                          <span className="font-semibold whitespace-nowrap">{t.presupuesto != null ? fmx(Number(t.presupuesto)) : '—'}</span>
                        </div>
                        <div className="flex justify-between gap-2 text-slate-500">
                          <span>{t.nombre_proyecto ?? ''}</span>
                          <span className="whitespace-nowrap">{t.estatus === 'cancelado' ? <span className="text-red-500 font-bold">Cancelado</span> : fecha(t.fecha)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {ficha.cotizaciones.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Cotizaciones en Ticket MAS</p>
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {ficha.cotizaciones.map(({ t, importe, gano }) => (
                      <div key={t.id} className="px-3 py-2 text-xs flex justify-between gap-2">
                        <span><b className="text-red-600">{t.folio ?? '—'}</b> · {normalizarColegio(t.colegio)} · {t.nombre_proyecto ?? ''}</span>
                        <span className="whitespace-nowrap text-right">{importe != null ? fmx(Number(importe)) : '—'}{gano && <span className={`${chip} bg-emerald-50 text-emerald-700 ml-1`}>ganó</span>}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ficha.prov?.notas && (
                <div><p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Notas</p><p className="text-slate-600 bg-slate-50 rounded-lg p-2 text-xs whitespace-pre-line">{ficha.prov.notas}</p></div>
              )}

              {isAdmin && ficha.prov && (
                <div className="flex gap-2 pt-2">
                  <button onClick={() => abrirForm(ficha)} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800"><Pencil className="w-4 h-4" /> Editar</button>
                  <button onClick={() => setBorrando(ficha.prov)} className="px-3 py-2 border border-red-200 text-red-600 rounded-md hover:bg-red-50" aria-label="Eliminar"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Formulario (solo administrador) */}
      {form && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setForm(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">{form.id ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
              <button onClick={() => setForm(null)} className="p-1 rounded hover:bg-slate-100" aria-label="Cerrar"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase">Nombre del proveedor *</label>
                <input className={inputClass} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1"><Tag className="w-3 h-3" /> Ámbitos</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {AMBITOS.map(a => {
                    const on = form.ambitos.includes(a);
                    return <button type="button" key={a} onClick={() => setForm({ ...form, ambitos: on ? form.ambitos.filter(x => x !== a) : [...form.ambitos, a] })}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${on ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}>{a}</button>;
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-600 uppercase">RFC</label><input className={inputClass} value={form.rfc ?? ''} onChange={e => setForm({ ...form, rfc: e.target.value.toUpperCase() })} /></div>
                <div><label className="text-xs font-bold text-slate-600 uppercase">Contacto</label><input className={inputClass} value={form.contacto ?? ''} onChange={e => setForm({ ...form, contacto: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-slate-600 uppercase">Teléfono</label><input className={inputClass} value={form.telefono ?? ''} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
                <div><label className="text-xs font-bold text-slate-600 uppercase">Correo</label><input type="email" className={inputClass} value={form.correo ?? ''} onChange={e => setForm({ ...form, correo: e.target.value })} /></div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase">También escrito como</label>
                <p className="text-[11px] text-slate-400 mb-1">Un nombre por renglón, tal como aparece en los tickets o cotizaciones. Así se suman al mismo proveedor.</p>
                <textarea rows={3} className={inputClass} value={form.aliasTxt} onChange={e => setForm({ ...form, aliasTxt: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase">Notas</label>
                <textarea rows={3} className={inputClass} value={form.notas ?? ''} onChange={e => setForm({ ...form, notas: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setForm(null)} className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 disabled:opacity-50">
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminación */}
      {borrando && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setBorrando(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">¿Quitar a {borrando.nombre} del padrón?</h2>
            <p className="text-sm text-slate-600">Se borran sus datos de contacto, ámbitos y notas. Sus tickets no se tocan: si tiene trabajos, seguirá apareciendo como "Sin registrar".</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBorrando(null)} className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => eliminar.mutate(borrando)} disabled={eliminar.isPending} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-bold hover:bg-red-700 disabled:opacity-50">Quitar del padrón</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
