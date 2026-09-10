import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import { COLEGIOS } from '@/lib/colegios';
import { ChevronDown, Plus, X, Loader2 } from 'lucide-react';

interface Concepto { id: string; nombre: string; materia: string; orden: number; activo: boolean; }
interface CostoConcepto { id: string; colegio: string; concepto_id: string; costo_total: number | null; notas: string | null; }
interface Subconcepto { id: string; nombre: string; activo: boolean; }
interface Desglose { id: string; colegio: string; concepto_id: string; subconcepto_id: string; costo: number | null; }

const COLEGIOS_PC = COLEGIOS.filter(c => c.territorio !== 'FMA' && !c.colegio.startsWith('CLIN'));

const parseMXN = (s: string) => s.replace(/[^0-9.]/g, '');
const formatMXN = (s: string | number | null) => {
  if (s === null || s === '') return '';
  const clean = String(s).replace(/[^0-9.]/g, '');
  if (!clean) return '';
  const [int, dec] = clean.split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return dec !== undefined ? `$${intFmt}.${dec.slice(0, 2)}` : `$${intFmt}`;
};

export default function CostosLista() {
  const { isAdmin, can } = usePermissions();
  const qc = useQueryClient();
  const puedeEditar = isAdmin; // exclusivo del administrador, no otorgable desde Accesos

  const [colegioSel, setColegioSel] = useState(COLEGIOS_PC[0]?.colegio ?? '');
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [nuevoSub, setNuevoSub] = useState<Record<string, string>>({});

  const { data: conceptos = [], isLoading } = useQuery({
    queryKey: ['compliance_conceptos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_conceptos').select('id, nombre, materia, orden, activo').order('orden');
      if (error) throw error;
      return (data ?? []) as Concepto[];
    },
  });

  const { data: costos = [] } = useQuery({
    queryKey: ['costos_conceptos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('costos_conceptos').select('*');
      if (error) throw error;
      return (data ?? []) as CostoConcepto[];
    },
  });

  const { data: subconceptos = [] } = useQuery({
    queryKey: ['costos_subconceptos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('costos_subconceptos').select('*').eq('activo', true).order('nombre');
      if (error) throw error;
      return (data ?? []) as Subconcepto[];
    },
  });

  const { data: desglose = [] } = useQuery({
    queryKey: ['costos_desglose'],
    queryFn: async () => {
      const { data, error } = await supabase.from('costos_desglose').select('*');
      if (error) throw error;
      return (data ?? []) as Desglose[];
    },
  });

  const getCosto = (conceptoId: string) => costos.find(c => c.colegio === colegioSel && c.concepto_id === conceptoId);
  const getDesglose = (conceptoId: string) => desglose.filter(d => d.colegio === colegioSel && d.concepto_id === conceptoId);
  const getSubNombre = (id: string) => subconceptos.find(s => s.id === id)?.nombre ?? '—';

  // ── Guardar el costo total de un concepto para el colegio seleccionado ────
  const saveCostoMutation = useMutation({
    mutationFn: async ({ conceptoId, costo }: { conceptoId: string; costo: number | null }) => {
      const { error } = await supabase.from('costos_conceptos')
        .upsert({ colegio: colegioSel, concepto_id: conceptoId, costo_total: costo, updated_at: new Date().toISOString() }, { onConflict: 'colegio,concepto_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['costos_conceptos'] }),
    onError: (e: any) => toast.error(e.message ?? 'Error al guardar el costo'),
  });

  // ── Agregar un sub-concepto al desglose (crea el sub-concepto si es nuevo) ─
  const addDesgloseMutation = useMutation({
    mutationFn: async ({ conceptoId, nombre }: { conceptoId: string; nombre: string }) => {
      const limpio = nombre.trim();
      if (!limpio) return;
      let subId = subconceptos.find(s => s.nombre.toLowerCase() === limpio.toLowerCase())?.id;
      if (!subId) {
        const { data, error } = await supabase.from('costos_subconceptos').insert({ nombre: limpio }).select('id').single();
        if (error) throw error;
        subId = data.id;
      }
      const { error } = await supabase.from('costos_desglose')
        .upsert({ colegio: colegioSel, concepto_id: conceptoId, subconcepto_id: subId }, { onConflict: 'colegio,concepto_id,subconcepto_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['costos_subconceptos'] });
      qc.invalidateQueries({ queryKey: ['costos_desglose'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al agregar'),
  });

  const saveDesgloseCostoMutation = useMutation({
    mutationFn: async ({ id, costo }: { id: string; costo: number | null }) => {
      const { error } = await supabase.from('costos_desglose').update({ costo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['costos_desglose'] }),
  });

  const quitarDesgloseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('costos_desglose').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['costos_desglose'] }),
  });

  const toggleExpandido = (id: string) => setExpandido(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (!isAdmin) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <PageHeader title="Lista de Costos" subtitle="Costo aproximado de cada concepto de Cumplimiento, por colegio" />
        <AccesoRestringido />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Lista de Costos" subtitle="Costo aproximado de cada concepto de Cumplimiento, por colegio" />
        <select value={colegioSel} onChange={e => setColegioSel(e.target.value)}
          className="text-sm font-bold text-slate-700 border border-slate-300 rounded-lg px-3 py-2 bg-white">
          {COLEGIOS_PC.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio} — {c.territorio}</option>)}
        </select>
      </div>

      <p className="text-xs text-slate-400 -mt-3">
        El costo total de cada concepto lo capturas tú, a partir de las cotizaciones que presenten en <strong>{colegioSel}</strong>.
        El desglose de abajo es solo de referencia — no se suma automático al total.
      </p>

      {isLoading ? (
        <p className="text-sm text-slate-400 text-center py-10">Cargando...</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {conceptos.filter(c => c.activo).map(concepto => {
              const costo = getCosto(concepto.id);
              const items = getDesglose(concepto.id);
              const abierto = expandido.has(concepto.id);
              return (
                <div key={concepto.id}>
                  <div className="flex items-center gap-3 px-5 py-3">
                    <button onClick={() => toggleExpandido(concepto.id)} className="p-1 text-slate-400 hover:text-slate-700 shrink-0">
                      <ChevronDown className={`w-4 h-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                    </button>
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => toggleExpandido(concepto.id)}>
                      <p className="text-sm font-semibold text-slate-800 truncate">{concepto.nombre}</p>
                      <p className="text-[11px] text-slate-400">{concepto.materia}{items.length > 0 ? ` · ${items.length} sub-concepto${items.length !== 1 ? 's' : ''}` : ''}</p>
                    </div>
                    <div className="relative shrink-0">
                      <input
                        type="text" inputMode="decimal" placeholder="$0.00" disabled={!puedeEditar}
                        defaultValue={formatMXN(costo?.costo_total ?? null)}
                        onBlur={e => {
                          const num = parseFloat(parseMXN(e.target.value));
                          saveCostoMutation.mutate({ conceptoId: concepto.id, costo: isNaN(num) ? null : num });
                          e.target.value = formatMXN(isNaN(num) ? null : num);
                        }}
                        className="w-32 text-right px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:ring-2 focus:ring-slate-900 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </div>
                  </div>

                  {abierto && (
                    <div className="bg-slate-50 px-5 py-3 pl-12 space-y-2 border-t border-slate-100">
                      {items.length === 0 && (
                        <p className="text-xs text-slate-400 italic">Sin desglose capturado todavía.</p>
                      )}
                      {items.map(item => (
                        <div key={item.id} className="flex items-center gap-2">
                          <span className="text-sm text-slate-600 flex-1">{getSubNombre(item.subconcepto_id)}</span>
                          <input
                            type="text" inputMode="decimal" placeholder="$0.00" disabled={!puedeEditar}
                            defaultValue={formatMXN(item.costo)}
                            onBlur={e => {
                              const num = parseFloat(parseMXN(e.target.value));
                              saveDesgloseCostoMutation.mutate({ id: item.id, costo: isNaN(num) ? null : num });
                              e.target.value = formatMXN(isNaN(num) ? null : num);
                            }}
                            className="w-28 text-right px-2 py-1 border border-slate-200 rounded-md text-xs text-slate-700 bg-white focus:ring-1 focus:ring-slate-800 focus:outline-none disabled:bg-slate-100"
                          />
                          {puedeEditar && (
                            <button onClick={() => quitarDesgloseMutation.mutate(item.id)} className="p-1 text-slate-300 hover:text-red-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      {puedeEditar && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text" list="subconceptos-catalogo" placeholder="Agregar sub-concepto (ej. Recarga de extintores)..."
                            value={nuevoSub[concepto.id] ?? ''}
                            onChange={e => setNuevoSub(prev => ({ ...prev, [concepto.id]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && nuevoSub[concepto.id]?.trim()) {
                                addDesgloseMutation.mutate({ conceptoId: concepto.id, nombre: nuevoSub[concepto.id] });
                                setNuevoSub(prev => ({ ...prev, [concepto.id]: '' }));
                              }
                            }}
                            className="flex-1 px-2 py-1.5 border border-slate-200 rounded-md text-xs bg-white focus:ring-1 focus:ring-slate-800 focus:outline-none"
                          />
                          <button
                            onClick={() => {
                              if (nuevoSub[concepto.id]?.trim()) {
                                addDesgloseMutation.mutate({ conceptoId: concepto.id, nombre: nuevoSub[concepto.id] });
                                setNuevoSub(prev => ({ ...prev, [concepto.id]: '' }));
                              }
                            }}
                            className="p-1.5 bg-slate-800 text-white rounded-md hover:bg-slate-700 shrink-0"
                          >
                            {addDesgloseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <datalist id="subconceptos-catalogo">
        {subconceptos.map(s => <option key={s.id} value={s.nombre} />)}
      </datalist>
    </div>
  );
}
