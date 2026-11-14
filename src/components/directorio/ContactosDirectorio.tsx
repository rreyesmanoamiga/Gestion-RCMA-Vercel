import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search, X, Pencil, Trash2, Plus, Phone, Mail, Download, Link2, UserX, UserCheck,
  Loader2, Users, Building2, FolderOpen, MapPin, StickyNote, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { logAudit } from '@/lib/audit';

// ─── Directorio · Contactos ──────────────────────────────────────────────────
// Una persona = un registro (directorio_contactos). Sus roles en las Fichas por
// sede viven en directorio_contacto_roles: orden 1 = titular (es el que usan
// fichas, Ticket MAS, Solicitudes y PDFs), 2, 3… quedan en espera. La base de
// datos rellena sola las columnas de la ficha cada vez que algo cambia aquí.

export type RolClave = 'dir' | 'adm' | 'car' | 'geo' | 'leo' | 'gjo' | 'ljo' | 'contador' | 'gerente' | 'director_nacional';

export const ROLES: { k: RolClave; label: string; soloGeneral?: boolean }[] = [
  { k: 'director_nacional', label: 'Director Nacional',        soloGeneral: true },
  { k: 'gerente',           label: 'Gerente (Federación)',     soloGeneral: true },
  { k: 'dir',               label: 'Director' },
  { k: 'adm',               label: 'Administrador' },
  { k: 'car',               label: 'CAR' },
  { k: 'geo',               label: 'Gerente de Op. ECO' },
  { k: 'leo',               label: 'Líder de Proyecto ECO' },
  { k: 'gjo',               label: 'Gerente Jurídico OR-SER' },
  { k: 'ljo',               label: 'Líder Jurídico OR-SER' },
  { k: 'contador',          label: 'Contador' },
];
export const ROL_LABEL: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.k, r.label]));

export const ORGS: { k: string; corto: string; chip: string; dot: string }[] = [
  { k: 'ORS-SER',                    corto: 'ORS-SER',               chip: 'bg-amber-50 text-amber-800 border-amber-200',     dot: 'bg-amber-500' },
  { k: 'Federación Mano Amiga',      corto: 'Federación Mano Amiga', chip: 'bg-violet-50 text-violet-700 border-violet-200',  dot: 'bg-violet-500' },
  { k: 'Mano Amiga Servicios (MAS)', corto: 'Mano Amiga Servicios',  chip: 'bg-sky-50 text-sky-700 border-sky-200',           dot: 'bg-sky-500' },
  { k: 'Colegios Mano Amiga',        corto: 'Colegios',              chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  { k: 'Proveedores externos',       corto: 'Proveedores externos',  chip: 'bg-slate-100 text-slate-700 border-slate-300',    dot: 'bg-slate-500' },
];
const ORG = (k: string) => ORGS.find(o => o.k === k) ?? ORGS[0];

export interface ContactoRol { id?: string; contacto_id?: string; codigo: string; rol: RolClave; orden: number; updated_at?: string }
export interface Contacto {
  id: string; organizacion: string; entidad: string | null; area: string | null; sede: string | null;
  nombre: string; puesto: string | null; tel_movil: string | null; tel_oficina: string | null;
  correo: string | null; correo_alterno: string | null; notas: string | null;
  por_confirmar: boolean; activo: boolean; baja_at: string | null; baja_nota: string | null;
  updated_at?: string; roles: ContactoRol[];
}
export interface SedeLite { codigo: string; nombre: string; territorio: string }

/** Lo que pide la Ficha por sede: abrir al titular de un rol o crear uno nuevo con ese rol */
export interface AbrirContacto { codigo: string; rol: RolClave }

interface Grupo { rol: RolClave; orden: number; codigos: string[] }

const labelCls = 'text-[10px] font-bold text-slate-400 uppercase tracking-wider';
const inputCls = 'w-full px-2 py-1.5 border border-slate-300 text-sm rounded-md focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white';
const VACIO: Omit<Contacto, 'id' | 'roles'> = {
  organizacion: 'ORS-SER', entidad: '', area: '', sede: '', nombre: '', puesto: '', tel_movil: '', tel_oficina: '',
  correo: '', correo_alterno: '', notas: '', por_confirmar: false, activo: true, baja_at: null, baja_nota: null,
};

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const subClave = (c: Contacto) => c.organizacion === 'Colegios Mano Amiga'
  ? (c.sede || 'Sin sede')
  : [c.entidad, c.area].filter(Boolean).join(' · ') || 'Sin área';

const agrupar = (roles: ContactoRol[]): Grupo[] => {
  const m = new Map<string, Grupo>();
  roles.forEach(r => {
    const k = `${r.rol}|${r.orden}`;
    if (!m.has(k)) m.set(k, { rol: r.rol, orden: r.orden, codigos: [] });
    m.get(k)!.codigos.push(r.codigo);
  });
  const orden = ROLES.map(r => r.k);
  return [...m.values()].sort((a, b) => orden.indexOf(a.rol) - orden.indexOf(b.rol) || a.orden - b.orden);
};

export default function ContactosDirectorio({ sedes, isAdmin, abrir, onAbierto }: {
  sedes: SedeLite[]; isAdmin: boolean; abrir?: AbrirContacto | null; onAbierto?: () => void;
}) {
  const qc = useQueryClient();
  const [org, setOrg]           = useState('todos');
  const [sub, setSub]           = useState('');
  const [q, setQ]               = useState('');
  const [verBajas, setVerBajas] = useState(false);
  const [ver, setVer]           = useState<Contacto | null>(null);
  const [form, setForm]         = useState<(Omit<Contacto, 'id' | 'roles'> & { id?: string }) | null>(null);
  const [grupos, setGrupos]     = useState<Grupo[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [baja, setBaja]         = useState<{ c: Contacto; nota: string } | null>(null);
  const [borrar, setBorrar]     = useState<Contacto | null>(null);
  const [exportando, setExportando] = useState(false);

  const { data: contactos = [], isLoading, error } = useQuery({
    queryKey: ['directorio_contactos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('directorio_contactos')
        .select('*, roles:directorio_contacto_roles(id, contacto_id, codigo, rol, orden, updated_at)')
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as Contacto[];
    },
  });

  const sedeNombre = (codigo: string) => sedes.find(s => s.codigo === codigo)?.codigo ?? codigo;

  // Quién ocupa cada rol en cada sede (activos, por orden; empate = el más reciente)
  const ocupantes = useMemo(() => {
    const m = new Map<string, { c: Contacto; orden: number; t: string }[]>();
    contactos.filter(c => c.activo).forEach(c => c.roles.forEach(r => {
      const k = `${r.codigo}|${r.rol}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push({ c, orden: r.orden, t: r.updated_at ?? '' });
    }));
    m.forEach(v => v.sort((a, b) => a.orden - b.orden || b.t.localeCompare(a.t)));
    return m;
  }, [contactos]);
  const titular = (codigo: string, rol: string) => ocupantes.get(`${codigo}|${rol}`)?.[0];

  const activos = useMemo(() => contactos.filter(c => verBajas ? true : c.activo), [contactos, verBajas]);
  const cuenta = (k: string) => activos.filter(c => c.organizacion === k).length;

  const subOpciones = useMemo(() => org === 'todos' ? [] :
    [...new Set(activos.filter(c => c.organizacion === org).map(subClave))].sort((a, b) => a.localeCompare(b, 'es')),
  [activos, org]);

  const visibles = useMemo(() => {
    const t = norm(q);
    const ordenOrg = ORGS.map(o => o.k);
    return activos
      .filter(c => org === 'todos' || c.organizacion === org)
      .filter(c => !sub || subClave(c) === sub)
      .filter(c => !t || norm([c.nombre, c.puesto, c.entidad, c.area, c.sede, c.correo, c.correo_alterno, c.notas, c.tel_movil, c.tel_oficina,
        ...c.roles.map(r => `${ROL_LABEL[r.rol]} ${r.codigo}`)].join(' ')).includes(t))
      .sort((a, b) => ordenOrg.indexOf(a.organizacion) - ordenOrg.indexOf(b.organizacion)
        || (a.organizacion === 'Colegios Mano Amiga' ? (a.sede ?? '').localeCompare(b.sede ?? '', 'es') : 0)
        || a.nombre.localeCompare(b.nombre, 'es'));
  }, [activos, org, sub, q]);

  const refrescar = () => qc.invalidateQueries({ predicate: x => String(x.queryKey[0] ?? '').startsWith('directorio') });

  // ── Abrir desde la Ficha por sede ─────────────────────────────────────────
  useEffect(() => {
    if (!abrir || isLoading) return;
    const t = titular(abrir.codigo, abrir.rol);
    if (t) editar(t.c);
    else {
      nuevo();
      setGrupos([{ rol: abrir.rol, orden: 1, codigos: [abrir.codigo] }]);
    }
    onAbierto?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrir, isLoading]);

  // ── Formulario ────────────────────────────────────────────────────────────
  const nuevo = () => {
    setVer(null);
    setForm({ ...VACIO, organizacion: org !== 'todos' ? org : 'ORS-SER' });
    setGrupos([]);
  };
  const editar = (c: Contacto) => {
    setVer(null);
    const { roles, ...resto } = c;
    setForm({ ...resto });
    setGrupos(agrupar(roles));
  };
  const setF = (k: string, v: any) => setForm(p => p ? { ...p, [k]: v } : p);

  const guardar = async () => {
    if (!form) return;
    const nombre = form.nombre.trim();
    if (!nombre) { toast.error('Escribe el nombre'); return; }
    const correo = (form.correo ?? '').trim().toLowerCase();
    if (/[;,\s]/.test(correo)) { toast.error('Pon un solo correo; el otro va en "Correo alterno"'); return; }
    for (const g of grupos) if (g.codigos.length === 0) { toast.error(`Elige la sede del rol ${ROL_LABEL[g.rol]}`); return; }
    const vistos = new Set<string>();
    for (const g of grupos) for (const c of g.codigos) {
      const k = `${g.rol}|${c}`;
      if (vistos.has(k)) { toast.error(`${ROL_LABEL[g.rol]} en ${c} está repetido`); return; }
      vistos.add(k);
    }

    const limpio = (v: any) => (typeof v === 'string' ? (v.trim() || null) : v);
    const payload = {
      organizacion: form.organizacion, entidad: limpio(form.entidad), area: limpio(form.area), sede: limpio(form.sede),
      nombre, puesto: limpio(form.puesto), tel_movil: limpio(form.tel_movil), tel_oficina: limpio(form.tel_oficina),
      correo: correo || null, correo_alterno: limpio(form.correo_alterno)?.toLowerCase() ?? null, notas: limpio(form.notas),
      por_confirmar: form.por_confirmar,
    };

    setGuardando(true);
    try {
      let id = form.id;
      if (id) {
        const { error } = await supabase.from('directorio_contactos').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data: s } = await supabase.auth.getUser();
        const { data, error } = await supabase.from('directorio_contactos')
          .insert({ ...payload, created_by: s.user?.email ?? null }).select('id').single();
        if (error) throw error;
        id = data.id as string;
      }

      // Roles: lo que quedó en pantalla vs lo que había
      const antes = contactos.find(c => c.id === id)?.roles ?? [];
      const despues = grupos.flatMap(g => g.codigos.map(codigo => ({ contacto_id: id!, codigo, rol: g.rol, orden: g.orden })));
      const quitar = antes.filter(a => !despues.some(d => d.codigo === a.codigo && d.rol === a.rol));
      if (quitar.length) {
        const { error } = await supabase.from('directorio_contacto_roles').delete().in('id', quitar.map(r => r.id!));
        if (error) throw error;
      }
      // Si entra como titular (1) donde ya hay otro titular, el otro pasa a 2 (en espera)
      for (const d of despues.filter(x => x.orden === 1)) {
        const otros = (ocupantes.get(`${d.codigo}|${d.rol}`) ?? []).filter(o => o.c.id !== id && o.orden === 1);
        for (const o of otros) {
          await supabase.from('directorio_contacto_roles').update({ orden: 2 })
            .eq('contacto_id', o.c.id).eq('codigo', d.codigo).eq('rol', d.rol);
        }
      }
      const cambia = despues.filter(d => !antes.some(a => a.codigo === d.codigo && a.rol === d.rol && a.orden === d.orden));
      if (cambia.length) {
        const { error } = await supabase.from('directorio_contacto_roles').upsert(cambia, { onConflict: 'contacto_id,codigo,rol' });
        if (error) throw error;
      }

      logAudit({ accion: form.id ? 'editar' : 'crear', modulo: 'directorio', registro_id: id, registro_ref: nombre,
        detalle: { roles: despues.map(d => `${ROL_LABEL[d.rol]} ${d.codigo} (${d.orden})`) } });
      toast.success(despues.length ? 'Contacto guardado y fichas actualizadas' : 'Contacto guardado');
      setForm(null);
      await refrescar();
    } catch (e: any) {
      toast.error('No se pudo guardar: ' + (e?.message ?? 'error'));
    } finally {
      setGuardando(false);
    }
  };

  const darDeBaja = async () => {
    if (!baja) return;
    const { error } = await supabase.from('directorio_contactos')
      .update({ activo: false, baja_at: new Date().toISOString(), baja_nota: baja.nota.trim() || null }).eq('id', baja.c.id);
    if (error) { toast.error('No se pudo dar de baja: ' + error.message); return; }
    logAudit({ accion: 'editar', modulo: 'directorio', registro_id: baja.c.id, registro_ref: baja.c.nombre, detalle: { cambio: 'Baja', nota: baja.nota || null } });
    toast.success(baja.c.roles.length ? 'Dado de baja: en sus fichas entra el siguiente en orden' : 'Dado de baja');
    setBaja(null); setVer(null); setForm(null);
    await refrescar();
  };
  const reactivar = async (c: Contacto) => {
    const { error } = await supabase.from('directorio_contactos').update({ activo: true, baja_at: null, baja_nota: null }).eq('id', c.id);
    if (error) { toast.error('No se pudo reactivar: ' + error.message); return; }
    logAudit({ accion: 'editar', modulo: 'directorio', registro_id: c.id, registro_ref: c.nombre, detalle: { cambio: 'Reactivado' } });
    toast.success('Contacto reactivado');
    setVer(null);
    await refrescar();
  };
  const eliminar = async () => {
    if (!borrar) return;
    const { error } = await supabase.from('directorio_contactos').delete().eq('id', borrar.id);
    if (error) { toast.error('No se pudo eliminar: ' + error.message); return; }
    logAudit({ accion: 'eliminar', modulo: 'directorio', registro_id: borrar.id, registro_ref: borrar.nombre });
    toast.success('Contacto eliminado');
    setBorrar(null); setVer(null); setForm(null);
    await refrescar();
  };

  // ── Excel ─────────────────────────────────────────────────────────────────
  const exportarExcel = async () => {
    setExportando(true);
    try {
      const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod;
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Contactos', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = [
        { header: 'Organización', width: 24 }, { header: 'Entidad', width: 20 }, { header: 'Área', width: 28 }, { header: 'Sede', width: 28 },
        { header: 'Nombre', width: 34 }, { header: 'Puesto', width: 36 }, { header: 'Por confirmar', width: 12 },
        { header: 'Tel. móvil', width: 16 }, { header: 'Tel. oficina / red', width: 16 }, { header: 'Correo', width: 32 },
        { header: 'Correo alterno', width: 30 }, { header: 'En Fichas por sede', width: 44 }, { header: 'Notas', width: 50 }, { header: 'Estatus', width: 12 },
      ];
      visibles.forEach(c => ws.addRow([
        c.organizacion, c.entidad ?? '', c.area ?? '', c.sede ?? '', c.nombre, c.puesto ?? '', c.por_confirmar ? 'Sí' : '',
        c.tel_movil ?? '', c.tel_oficina ?? '', c.correo ?? '', c.correo_alterno ?? '',
        agrupar(c.roles).map(g => `${ROL_LABEL[g.rol]}${g.orden > 1 ? ` (${g.orden})` : ''}: ${g.codigos.join(', ')}`).join(' · '),
        c.notas ?? '', c.activo ? 'Activo' : 'Baja',
      ]));
      ws.getRow(1).eachCell((cell: any) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00295A' } };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
      ws.getRow(1).height = 24;
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 14 } };
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = `Directorio_Contactos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success('Excel generado');
    } catch (e: any) {
      toast.error('No se pudo generar el Excel: ' + (e?.message ?? 'error'));
    } finally {
      setExportando(false);
    }
  };

  if (error) return (
    <div className="text-center py-16 bg-white rounded-xl border border-slate-200 text-sm text-slate-500">
      No se pudieron cargar los contactos: {(error as any).message}
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">
      {/* KPIs por organización */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {ORGS.map(o => {
          const n = cuenta(o.k); const pc = activos.filter(c => c.organizacion === o.k && c.por_confirmar).length;
          return (
            <button key={o.k} onClick={() => { setOrg(org === o.k ? 'todos' : o.k); setSub(''); }}
              className={`text-left bg-white rounded-xl border p-3 shadow-sm transition ${org === o.k ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'}`}>
              <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${o.dot}`} /><span className={labelCls}>{o.corto}</span></div>
              <div className="text-2xl font-black text-slate-900 mt-1">{n}</div>
              <div className={`text-[10px] ${pc ? 'text-red-600' : 'text-slate-400'}`}>{pc ? `${pc} por confirmar` : 'todos confirmados'}</div>
            </button>
          );
        })}
      </div>

      {/* Buscador, filtros y acciones */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white"
            placeholder="Buscar nombre, puesto, área, correo…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {[{ k: 'todos', label: `Todos (${activos.length})` }, ...ORGS.map(o => ({ k: o.k, label: `${o.corto} (${cuenta(o.k)})` }))].map(t => (
            <button key={t.k} onClick={() => { setOrg(t.k); setSub(''); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${org === t.k
                ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 ml-auto">
          {isAdmin && (
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 px-2 cursor-pointer">
              <input type="checkbox" checked={verBajas} onChange={e => setVerBajas(e.target.checked)} className="rounded w-3.5 h-3.5" /> Ver bajas
            </label>
          )}
          <button onClick={exportarExcel} disabled={exportando}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
            {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Excel
          </button>
          {isAdmin && (
            <button onClick={nuevo}
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800">
              <Plus className="w-3.5 h-3.5" /> Nuevo contacto
            </button>
          )}
        </div>
      </div>
      {subOpciones.length > 1 && (
        <div className="flex gap-2 flex-wrap -mt-2">
          {['', ...subOpciones].map(s => (
            <button key={s || 'todas'} onClick={() => setSub(s)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${sub === s ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
              {s || 'Todas'}
            </button>
          ))}
        </div>
      )}

      {/* Tabla */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Cargando contactos…</div>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">No se encontraron resultados</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Nombre / Puesto', 'Entidad · Área', 'Sede / Notas', 'Correo', 'Teléfono'].map(h => (
                  <th key={h} className={`px-4 py-2.5 ${labelCls}`}>{h}</th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((c, i) => {
                const o = ORG(c.organizacion);
                const nuevoGrupo = i === 0 || visibles[i - 1].organizacion !== c.organizacion;
                const tel = [c.tel_movil, c.tel_oficina].filter(Boolean).join(' / ');
                const gs = agrupar(c.roles);
                return (
                  <React.Fragment key={c.id}>
                    {nuevoGrupo && (
                      <tr><td colSpan={6} className={`px-4 py-1.5 border-y ${o.chip}`}>
                        <span className="text-[11px] font-black uppercase tracking-wide">{o.corto}</span>
                        <span className="text-[11px] opacity-70"> · {visibles.filter(x => x.organizacion === c.organizacion).length}</span>
                      </td></tr>
                    )}
                    <tr onClick={() => setVer(c)} className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${c.activo ? '' : 'opacity-50'}`}>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-800 text-[13px]">{c.nombre}
                          {!c.activo && <span className="ml-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 uppercase">Baja</span>}
                        </div>
                        <div className={`text-[11px] ${c.por_confirmar ? 'text-red-600' : 'text-slate-500'}`}>
                          {c.puesto || '—'}
                          {c.por_confirmar && <span className="ml-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 uppercase">Por confirmar</span>}
                        </div>
                        {gs.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {gs.slice(0, 3).map(g => (
                              <span key={`${g.rol}${g.orden}`} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${g.orden === 1 ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                <Link2 className="w-2.5 h-2.5 inline -mt-0.5" /> {ROL_LABEL[g.rol]}{g.orden > 1 ? ` (${g.orden})` : ''} · {g.codigos.length > 2 ? `${g.codigos.length} sedes` : g.codigos.join(', ')}
                              </span>
                            ))}
                            {gs.length > 3 && <span className="text-[9px] text-slate-400">+{gs.length - 3}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] text-slate-600">
                        <div className="font-semibold">{c.entidad || '—'}</div>
                        <div className="text-[11px] text-slate-400">{c.area}</div>
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-500 max-w-[220px]">{c.sede || c.notas || ''}</td>
                      <td className="px-4 py-2.5 text-[11px]">
                        {c.correo ? <a href={`mailto:${c.correo}`} onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline break-all">{c.correo}</a> : <span className="text-slate-300">—</span>}
                        {c.correo_alterno && <div className="text-slate-400 break-all">{c.correo_alterno}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">{tel ? <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{tel}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="px-2">
                        {isAdmin && (
                          <button onClick={e => { e.stopPropagation(); editar(c); }} title="Editar"
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-300 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ Ver contacto ═════════════════════════════════════════════════════ */}
      {ver && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setVer(null); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-10">
            <div className="flex justify-between items-start px-5 py-4 border-b">
              <div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${ORG(ver.organizacion).chip}`}>{ORG(ver.organizacion).corto}</span>
                {!ver.activo && <span className="ml-1.5 text-[10px] font-black px-2 py-0.5 rounded-full border uppercase bg-slate-100 text-slate-500 border-slate-200">Baja</span>}
                <h2 className="text-base font-black text-slate-800 mt-2">{ver.nombre}</h2>
                <p className={`text-xs ${ver.por_confirmar ? 'text-red-600' : 'text-slate-500'}`}>{ver.puesto}{ver.por_confirmar ? ' · por confirmar' : ''}</p>
              </div>
              <button onClick={() => setVer(null)} className="p-1 rounded hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-2">
              {([
                [Building2, 'Entidad', ver.entidad], [FolderOpen, 'Área', ver.area], [MapPin, 'Sede', ver.sede],
                [Mail, 'Correo', ver.correo], [Mail, 'Alterno', ver.correo_alterno],
                [Phone, 'Móvil', ver.tel_movil], [Phone, 'Oficina / Red', ver.tel_oficina], [StickyNote, 'Notas', ver.notas],
                [UserX, 'Baja', ver.baja_at ? `${new Date(ver.baja_at).toLocaleDateString('es-MX')}${ver.baja_nota ? ' · ' + ver.baja_nota : ''}` : null],
              ] as [React.ElementType, string, string | null][]).filter(x => x[2]).map(([Icon, l, v]) => (
                <div key={l} className="flex gap-3">
                  <span className={`w-28 shrink-0 pt-0.5 flex items-center gap-1 ${labelCls}`}><Icon className="w-3 h-3" />{l}</span>
                  {l === 'Correo' || l === 'Alterno'
                    ? <a href={`mailto:${v}`} className="text-[13px] text-blue-600 hover:underline break-all">{v}</a>
                    : <span className="text-[13px] text-slate-700">{v}</span>}
                </div>
              ))}

              {ver.roles.length > 0 && (
                <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                  <p className="text-[11px] font-black text-slate-700 uppercase tracking-wide mb-1.5">🔗 En las Fichas por sede</p>
                  <div className="space-y-1">
                    {[...ver.roles].sort((a, b) => a.rol.localeCompare(b.rol) || a.codigo.localeCompare(b.codigo)).map(r => {
                      const t = titular(r.codigo, r.rol);
                      const esTitular = ver.activo && t?.c.id === ver.id;
                      return (
                        <div key={r.id} className="text-[12px] text-slate-700 flex flex-wrap gap-x-1.5">
                          <b>{ROL_LABEL[r.rol]}</b> · {sedeNombre(r.codigo)} ·
                          {esTitular
                            ? <span className="text-orange-700 font-bold">Titular</span>
                            : <span className="text-slate-500">en espera ({r.orden}){t ? ` — titular: ${t.c.nombre}` : ''}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t bg-slate-50 rounded-b-xl flex justify-end gap-2">
              {isAdmin && (ver.activo
                ? <button onClick={() => editar(ver)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"><Pencil className="w-3.5 h-3.5" /> Editar</button>
                : <button onClick={() => reactivar(ver)} className="px-4 py-2 border border-emerald-300 rounded-lg text-sm font-semibold text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" /> Reactivar</button>)}
              <button onClick={() => setVer(null)} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Nuevo / Editar contacto ══════════════════════════════════════════ */}
      {form && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-6">
            <div className="flex items-center justify-between px-5 py-4 border-b bg-white rounded-t-xl sticky top-0 z-10">
              <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-slate-500" /> {form.id ? 'Editar contacto' : 'Nuevo contacto'}
              </h2>
              <button onClick={() => setForm(null)} className="p-1 rounded hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto max-h-[72vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={labelCls}>Nombre *</label><input className={inputCls} value={form.nombre} onChange={e => setF('nombre', e.target.value)} /></div>
                <div><label className={labelCls}>Puesto</label><input className={inputCls} value={form.puesto ?? ''} onChange={e => setF('puesto', e.target.value)} /></div>
                <div><label className={labelCls}>Organización</label>
                  <select className={inputCls} value={form.organizacion} onChange={e => setF('organizacion', e.target.value)}>
                    {ORGS.map(o => <option key={o.k} value={o.k}>{o.k}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Entidad</label><input className={inputCls} placeholder="ECO, ORS-SER, Sodi Abogados…" value={form.entidad ?? ''} onChange={e => setF('entidad', e.target.value)} /></div>
                <div><label className={labelCls}>Área</label><input className={inputCls} placeholder="Jurídico, Inmobiliario, Proyectos / Obra…" value={form.area ?? ''} onChange={e => setF('area', e.target.value)} /></div>
                <div><label className={labelCls}>Sede</label>
                  <input className={inputCls} list="dir-sedes" value={form.sede ?? ''} onChange={e => setF('sede', e.target.value)} />
                  <datalist id="dir-sedes">{sedes.map(s => <option key={s.codigo} value={s.nombre} />)}</datalist>
                </div>
                <div><label className={labelCls}>Correo (uno solo)</label><input className={inputCls} value={form.correo ?? ''} onChange={e => setF('correo', e.target.value)} /></div>
                <div><label className={labelCls}>Correo alterno</label><input className={inputCls} value={form.correo_alterno ?? ''} onChange={e => setF('correo_alterno', e.target.value)} /></div>
                <div><label className={labelCls}>Tel. móvil</label><input className={inputCls} value={form.tel_movil ?? ''} onChange={e => setF('tel_movil', e.target.value)} /></div>
                <div><label className={labelCls}>Tel. oficina / red</label><input className={inputCls} value={form.tel_oficina ?? ''} onChange={e => setF('tel_oficina', e.target.value)} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Notas</label>
                  <textarea className={inputCls + ' resize-none min-h-[52px]'} value={form.notas ?? ''} onChange={e => setF('notas', e.target.value)} />
                </div>
                <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={form.por_confirmar} onChange={e => setF('por_confirmar', e.target.checked)} className="rounded w-4 h-4" />
                  Puesto por confirmar
                </label>
              </div>

              {/* Roles en las Fichas por sede */}
              <div className="rounded-lg border-2 border-orange-200 bg-orange-50/50 p-3">
                <p className="text-[11px] font-black text-slate-700 uppercase tracking-wide">🔗 Aparece en las Fichas por sede como</p>
                <p className="text-[11px] text-slate-500 mb-2">El <b>1</b> es el titular: es el que usan las fichas, Ticket MAS, Solicitudes y PDFs. El 2 queda en espera: si el 1 se da de baja, el 2 entra solo.</p>
                {grupos.length === 0 && <p className="text-[12px] text-slate-400 italic mb-1">No aparece en ninguna ficha.</p>}
                <div className="space-y-2.5">
                  {grupos.map((g, gi) => {
                    const def = ROLES.find(r => r.k === g.rol)!;
                    const disponibles = def.soloGeneral ? sedes.filter(s => s.codigo === 'GENERAL') : sedes.filter(s => s.codigo !== 'GENERAL');
                    const setG = (p: Partial<Grupo>) => setGrupos(prev => prev.map((x, i) => i === gi ? { ...x, ...p } : x));
                    const avisos = g.codigos.map(codigo => {
                      const t = titular(codigo, g.rol);
                      if (!t || t.c.id === form.id) return null;
                      return g.orden === 1
                        ? `${codigo}: hoy es ${t.c.nombre}; al guardar pasa a 2 (en espera)`
                        : (t.orden <= g.orden ? `${codigo}: titular ${t.c.nombre}` : null);
                    }).filter(Boolean) as string[];
                    return (
                      <div key={gi} className="bg-white rounded-md border border-orange-100 p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <select className="px-2 py-1 border border-slate-300 rounded text-xs bg-white font-semibold" value={g.rol}
                            onChange={e => {
                              const rol = e.target.value as RolClave; const sg = ROLES.find(r => r.k === rol)?.soloGeneral;
                              setG({ rol, codigos: sg ? ['GENERAL'] : g.codigos.filter(c => c !== 'GENERAL') });
                            }}>
                            {ROLES.map(r => <option key={r.k} value={r.k}>{r.label}</option>)}
                          </select>
                          <span className="text-[11px] text-slate-500">Orden</span>
                          <select className="px-2 py-1 border border-slate-300 rounded text-xs bg-white" value={g.orden} onChange={e => setG({ orden: Number(e.target.value) })}>
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}{n === 1 ? ' (titular)' : ''}</option>)}
                          </select>
                          {!def.soloGeneral && (
                            <button type="button" onClick={() => setG({ codigos: g.codigos.length === disponibles.length ? [] : disponibles.map(s => s.codigo) })}
                              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800">
                              {g.codigos.length === disponibles.length ? 'Quitar todas' : 'Todas'}
                            </button>
                          )}
                          <button type="button" onClick={() => setGrupos(prev => prev.filter((_, i) => i !== gi))} title="Quitar rol"
                            className="ml-auto p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {disponibles.map(s => {
                            const on = g.codigos.includes(s.codigo);
                            return (
                              <button type="button" key={s.codigo} title={s.nombre}
                                onClick={() => setG({ codigos: on ? g.codigos.filter(c => c !== s.codigo) : [...g.codigos, s.codigo] })}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border transition ${on ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                                {s.codigo}
                              </button>
                            );
                          })}
                        </div>
                        {avisos.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            {avisos.slice(0, 4).map(a => <p key={a} className="text-[10.5px] text-amber-700">⚠ {a}</p>)}
                            {avisos.length > 4 && <p className="text-[10.5px] text-amber-700">…y {avisos.length - 4} sedes más</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setGrupos(prev => [...prev, { rol: 'dir', orden: 1, codigos: [] }])}
                  className="mt-2 text-[11px] font-bold text-orange-700 hover:underline">+ Agregar rol</button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 px-5 py-4 border-t bg-slate-50 rounded-b-xl">
              {form.id && (
                <>
                  <button onClick={() => { const c = contactos.find(x => x.id === form.id); if (c) setBaja({ c, nota: '' }); }}
                    className="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-xs font-bold hover:bg-red-50 inline-flex items-center gap-1.5">
                    <UserX className="w-3.5 h-3.5" /> Dar de baja
                  </button>
                  <button onClick={() => { const c = contactos.find(x => x.id === form.id); if (c) setBorrar(c); }} title="Eliminar (solo si se capturó por error)"
                    className="px-2 py-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </>
              )}
              <div className="flex gap-2 ml-auto">
                <button onClick={() => setForm(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancelar</button>
                <button onClick={guardar} disabled={guardando}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ Dar de baja ══════════════════════════════════════════════════════ */}
      {baja && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
            <h2 className="text-base font-bold text-slate-900">¿Dar de baja a {baja.c.nombre}?</h2>
            <p className="text-sm text-slate-600 mt-2">
              {baja.c.roles.length
                ? 'Sale de sus fichas y entra el siguiente en orden (si no hay, el rol queda vacío). Queda en el historial y se puede reactivar.'
                : 'Queda en el historial y se puede reactivar.'}
            </p>
            <label className={`${labelCls} block mt-3`}>Motivo (opcional)</label>
            <input className={inputCls} value={baja.nota} onChange={e => setBaja({ ...baja, nota: e.target.value })} placeholder="Ej. dejó la institución" />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setBaja(null)} className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg">Cancelar</button>
              <button onClick={darDeBaja} className="flex-1 px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-lg">Dar de baja</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Eliminar ═════════════════════════════════════════════════════════ */}
      {borrar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <div>
                <h2 className="text-base font-bold text-slate-900">¿Eliminar contacto?</h2>
                <p className="text-xs text-slate-500 mt-0.5">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Úsalo solo si <b>{borrar.nombre}</b> se capturó por error. Si dejó el puesto, mejor dalo de baja para conservar el historial.
              {borrar.roles.length > 0 && ' Sale de sus fichas y entra el siguiente en orden.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setBorrar(null)} className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg">Cancelar</button>
              <button onClick={eliminar} className="flex-1 px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-lg">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
