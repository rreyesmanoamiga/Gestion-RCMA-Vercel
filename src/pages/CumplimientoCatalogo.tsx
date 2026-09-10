import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import { COLEGIOS } from '@/lib/colegios';
import { MATERIAS } from '@/lib/complianceShared';
import { Plus, Pencil, Trash2, X, Save, RefreshCw, ChevronDown, Loader2 } from 'lucide-react';

interface Concepto {
  id: string;
  nombre: string;
  materia: string;
  norma: string | null;
  orden: number;
  activo: boolean;
  periodicidad: string;
}

interface Excepcion {
  id: string;
  colegio: string;
  concepto_id: string;
  motivo: string | null;
}

interface PeriodicidadColegio {
  id: string;
  colegio: string;
  concepto_id: string;
  periodicidad: string;
}

const inputClass = 'w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none';

// Solo colegios reales (excluye oficinas FMA / GENERAL, que no llevan Protección Civil)
const COLEGIOS_PC = COLEGIOS.filter(c => c.territorio !== 'FMA' && !c.colegio.startsWith('CLIN'));

export const PERIODICIDADES = ['Anual', 'Cada 2 años', 'Cada 3 años', 'Cada 4 años', 'Cada 5 años', 'Único trámite'];

const AÑOS_DISPONIBLES = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i); // año actual -1 .. +4

export default function CumplimientoCatalogo() {
  const { isAdmin, can } = usePermissions();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Concepto | null>(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [form, setForm] = useState({ nombre: '', materia: 'Protección civil', norma: '', periodicidad: 'Anual' });
  const [colegioSel, setColegioSel] = useState(COLEGIOS_PC[0]?.colegio ?? '');
  const [añoSincronizar, setAñoSincronizar] = useState(new Date().getFullYear());
  const [sincronizando, setSincronizando] = useState(false);

  const { data: conceptos = [], isLoading } = useQuery({
    queryKey: ['compliance_conceptos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_conceptos').select('*').order('orden');
      if (error) throw error;
      return (data ?? []) as Concepto[];
    },
  });

  const { data: excepciones = [] } = useQuery({
    queryKey: ['compliance_excepciones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_excepciones').select('*');
      if (error) throw error;
      return (data ?? []) as Excepcion[];
    },
  });

  const excepcionesColegio = useMemo(
    () => new Set(excepciones.filter(e => e.colegio === colegioSel).map(e => e.concepto_id)),
    [excepciones, colegioSel]
  );

  const { data: periodicidadesColegio = [] } = useQuery({
    queryKey: ['compliance_periodicidad_colegio'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_periodicidad_colegio').select('*');
      if (error) throw error;
      return (data ?? []) as PeriodicidadColegio[];
    },
  });

  const periodicidadPorConcepto = useMemo(() => {
    const map = new Map<string, string>();
    periodicidadesColegio.filter(p => p.colegio === colegioSel).forEach(p => map.set(p.concepto_id, p.periodicidad));
    return map;
  }, [periodicidadesColegio, colegioSel]);

  // ── Guardar concepto (nuevo o edición) ────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.nombre.trim()) throw new Error('El nombre es obligatorio');
      if (editando) {
        const { error } = await supabase.from('compliance_conceptos')
          .update({ nombre: form.nombre.trim(), materia: form.materia, norma: form.norma.trim() || null, periodicidad: form.periodicidad })
          .eq('id', editando.id);
        if (error) throw error;
      } else {
        const maxOrden = conceptos.reduce((m, c) => Math.max(m, c.orden), 0);
        const { error } = await supabase.from('compliance_conceptos')
          .insert({ nombre: form.nombre.trim(), materia: form.materia, norma: form.norma.trim() || null, periodicidad: form.periodicidad, orden: maxOrden + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compliance_conceptos'] });
      toast.success(editando ? 'Concepto actualizado' : 'Concepto agregado al catálogo');
      setShowNuevo(false); setEditando(null); setForm({ nombre: '', materia: 'Protección civil', norma: '', periodicidad: 'Anual' });
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al guardar'),
  });

  // ── Activar / desactivar concepto del catálogo global ─────────────────────
  const toggleActivoMutation = useMutation({
    mutationFn: async (c: Concepto) => {
      const { error } = await supabase.from('compliance_conceptos').update({ activo: !c.activo }).eq('id', c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance_conceptos'] }),
  });

  // ── Marcar / quitar excepción para el colegio seleccionado ────────────────
  const toggleExcepcionMutation = useMutation({
    mutationFn: async (concepto: Concepto) => {
      const yaExcepcion = excepcionesColegio.has(concepto.id);
      if (yaExcepcion) {
        const { error } = await supabase.from('compliance_excepciones')
          .delete().eq('colegio', colegioSel).eq('concepto_id', concepto.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compliance_excepciones')
          .insert({ colegio: colegioSel, concepto_id: concepto.id });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance_excepciones'] }),
  });

  // ── Cambiar la periodicidad SOLO para el colegio seleccionado ─────────────
  const setPeriodicidadColegioMutation = useMutation({
    mutationFn: async ({ concepto, periodicidad }: { concepto: Concepto; periodicidad: string }) => {
      if (periodicidad === concepto.periodicidad) {
        // Coincide con el default del catálogo — no hace falta guardar excepción
        const { error } = await supabase.from('compliance_periodicidad_colegio')
          .delete().eq('colegio', colegioSel).eq('concepto_id', concepto.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('compliance_periodicidad_colegio')
          .upsert({ colegio: colegioSel, concepto_id: concepto.id, periodicidad }, { onConflict: 'colegio,concepto_id' });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance_periodicidad_colegio'] }),
    onError: (e: any) => toast.error(e.message ?? 'Error al guardar la periodicidad'),
  });

  // ── Sincronizar checklist: crea en compliance_documentos lo que falte para
  //    TODOS los colegios, PARA EL AÑO seleccionado, según catálogo activo menos
  //    excepciones. Nunca borra ni pisa un documento que ya tenga estatus
  //    capturado — solo agrega lo que falta ese año y desactiva lo excepcionado.
  const sincronizar = async () => {
    setSincronizando(true);
    try {
      // Misma protección que useComplianceDocs: traer todo por bloques, sin
      // depender del tope de 1000 filas por default de Supabase.
      const bloque = 1000;
      let desde = 0;
      let docsActuales: { id: string; colegio: string; tipo_documento: string; activo: boolean; año: number }[] = [];
      while (true) {
        const { data, error: e1 } = await supabase
          .from('compliance_documentos').select('id, colegio, tipo_documento, activo, año')
          .eq('año', añoSincronizar).range(desde, desde + bloque - 1);
        if (e1) throw e1;
        docsActuales = docsActuales.concat(data ?? []);
        if (!data || data.length < bloque) break;
        desde += bloque;
      }

      const conceptosActivos = conceptos.filter(c => c.activo);
      const excepcionesPorColegio = new Set(excepciones.map(e => `${e.colegio}::${e.concepto_id}`));

      const aInsertar: any[] = [];
      const aDesactivar: string[] = [];
      const aReactivar: string[] = [];

      for (const col of COLEGIOS_PC) {
        for (const concepto of conceptosActivos) {
          const esExcepcion = excepcionesPorColegio.has(`${col.colegio}::${concepto.id}`);
          const existente = (docsActuales ?? []).find(d => d.colegio === col.colegio && d.tipo_documento === concepto.nombre);

          if (esExcepcion) {
            if (existente?.activo) aDesactivar.push(existente.id);
            continue;
          }
          if (!existente) {
            aInsertar.push({
              colegio: col.colegio, territorio: col.territorio, materia: concepto.materia,
              tipo_documento: concepto.nombre, norma: concepto.norma, estado: 'Pendiente',
              vigente: 'No', activo: true, año: añoSincronizar,
            });
          } else if (!existente.activo) {
            aReactivar.push(existente.id);
          }
        }
      }

      if (aInsertar.length) { const { error } = await supabase.from('compliance_documentos').insert(aInsertar); if (error) throw error; }
      if (aDesactivar.length) { const { error } = await supabase.from('compliance_documentos').update({ activo: false }).in('id', aDesactivar); if (error) throw error; }
      if (aReactivar.length) { const { error } = await supabase.from('compliance_documentos').update({ activo: true }).in('id', aReactivar); if (error) throw error; }

      qc.invalidateQueries({ queryKey: ['compliance_documentos'] });
      toast.success(`${añoSincronizar}: ${aInsertar.length} agregados, ${aDesactivar.length} desactivados, ${aReactivar.length} reactivados`);
    } catch (e: any) {
      toast.error('Error al sincronizar: ' + (e.message ?? 'desconocido'));
    } finally {
      setSincronizando(false);
    }
  };

  if (!isAdmin && !can('editar_cumplimiento')) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <PageHeader title="Catálogo de Cumplimiento" subtitle="Conceptos base y excepciones por colegio" />
        <AccesoRestringido />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Catálogo de Cumplimiento" subtitle="La receta base de documentos y las excepciones por colegio" />
        <div className="flex items-center gap-2">
          <select value={añoSincronizar} onChange={e => setAñoSincronizar(Number(e.target.value))}
            className="text-sm font-bold text-slate-700 border border-slate-300 rounded-lg px-3 py-2 bg-white">
            {AÑOS_DISPONIBLES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={sincronizar} disabled={sincronizando}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors">
            {sincronizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sincronizar checklist {añoSincronizar}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 -mt-4">
        Sincronizar genera el checklist del año elegido sin tocar los años anteriores — así cada año queda como historial aparte.
      </p>

      {/* ─── Catálogo de conceptos (la receta) ─────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
            Conceptos base ({conceptos.length})
          </h2>
          <button onClick={() => { setEditando(null); setForm({ nombre: '', materia: 'Protección civil', norma: '', periodicidad: 'Anual' }); setShowNuevo(true); }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline">
            <Plus className="w-3.5 h-3.5" /> Agregar concepto
          </button>
        </div>
        {isLoading ? (
          <p className="p-5 text-sm text-slate-400 text-center">Cargando...</p>
        ) : (
          <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
            {conceptos.map(c => (
              <div key={c.id} className={`flex items-center gap-3 px-5 py-2.5 ${!c.activo ? 'opacity-40' : ''}`}>
                <span className="text-[10px] font-bold text-slate-300 w-6 shrink-0">{c.orden}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{c.nombre}</p>
                  <p className="text-[11px] text-slate-400">{c.materia}{c.norma ? ` · ${c.norma}` : ''}</p>
                </div>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full shrink-0 whitespace-nowrap">
                  {c.periodicidad}
                </span>
                <button onClick={() => { setEditando(c); setForm({ nombre: c.nombre, materia: c.materia, norma: c.norma ?? '', periodicidad: c.periodicidad }); setShowNuevo(true); }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => toggleActivoMutation.mutate(c)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-full border shrink-0 ${c.activo ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>
                  {c.activo ? 'Desactivar' : 'Reactivar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Excepciones por colegio ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
            Excepciones por colegio
          </h2>
          <select value={colegioSel} onChange={e => setColegioSel(e.target.value)}
            className="text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
            {COLEGIOS_PC.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio} — {c.territorio}</option>)}
          </select>
        </div>
        <p className="px-5 pt-3 text-xs text-slate-400">
          Por default, <strong>todos los conceptos aplican</strong> a todos los colegios con la periodicidad del catálogo.
          Desmarca lo que NO le aplique a <strong>{colegioSel}</strong>, o cambia su periodicidad si aquí es distinta (ej. cada 2 años en vez de anual).
        </p>
        <div className="divide-y divide-slate-50">
          {conceptos.filter(c => c.activo).map(c => {
            const excepcion = excepcionesColegio.has(c.id);
            const periodicidadActual = periodicidadPorConcepto.get(c.id) ?? c.periodicidad;
            const esDistinta = periodicidadActual !== c.periodicidad;
            return (
              <div key={c.id} className="flex items-center gap-3 px-5 py-2 flex-wrap">
                <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-[220px]">
                  <input type="checkbox" checked={!excepcion} onChange={() => toggleExcepcionMutation.mutate(c)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-800 shrink-0" />
                  <span className={`text-sm ${excepcion ? 'text-slate-300 line-through' : 'text-slate-700'}`}>
                    {c.nombre}
                  </span>
                </label>
                {!excepcion && (
                  <select
                    value={periodicidadActual}
                    onChange={e => setPeriodicidadColegioMutation.mutate({ concepto: c, periodicidad: e.target.value })}
                    className={`text-xs font-semibold border rounded-lg px-2 py-1 bg-white shrink-0 ${esDistinta ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-slate-200 text-slate-500'}`}
                  >
                    {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Modal Nuevo/Editar concepto ───────────────────────────────────── */}
      {showNuevo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-900 text-sm">{editando ? 'Editar concepto' : 'Nuevo concepto'}</h3>
              <button onClick={() => setShowNuevo(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nombre del documento</label>
                <input className={inputClass} value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Materia</label>
                <select className={inputClass + ' bg-white'} value={form.materia} onChange={e => setForm(p => ({ ...p, materia: e.target.value }))}>
                  {MATERIAS.filter(m => m !== 'Todas').map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Norma (opcional)</label>
                <input className={inputClass} value={form.norma} onChange={e => setForm(p => ({ ...p, norma: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Periodicidad</label>
                <select className={inputClass + ' bg-white'} value={form.periodicidad} onChange={e => setForm(p => ({ ...p, periodicidad: e.target.value }))}>
                  {PERIODICIDADES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Este es el valor por default para todos los colegios — puedes cambiarlo para uno en particular más abajo, en "Excepciones por colegio".
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowNuevo(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md">Cancelar</button>
              <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2">
                <Save className="w-4 h-4" /> {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
