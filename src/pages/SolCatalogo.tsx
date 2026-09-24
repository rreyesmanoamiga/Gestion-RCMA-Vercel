import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Save, Loader2, Info } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import { SOL_AREAS, SOL_COMPONENTES, type SolCriterio } from '@/lib/sol';
import { fetchCriterios } from '@/lib/solData';
import { inputCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

export default function SolCatalogo() {
  const isAdmin = useSolAdmin();
  const qc = useQueryClient();
  const { data: criterios = [], isLoading } = useQuery({ queryKey: ['sol_criterios_todos'], enabled: isAdmin, queryFn: () => fetchCriterios(false) });
  const [cambios, setCambios] = useState<Record<string, Partial<SolCriterio>>>({});
  const [guardando, setGuardando] = useState(false);

  if (!isAdmin) return <AccesoRestringido />;

  const val = <K extends keyof SolCriterio>(c: SolCriterio, k: K): SolCriterio[K] => (cambios[c.id]?.[k] as SolCriterio[K]) ?? c[k];
  const set = (c: SolCriterio, k: keyof SolCriterio, v: unknown) => setCambios(p => ({ ...p, [c.id]: { ...p[c.id], [k]: v } }));

  const guardar = async () => {
    setGuardando(true);
    try {
      for (const [id, patch] of Object.entries(cambios)) {
        const { error } = await supabase.from('sol_criterios').update(patch).eq('id', id);
        if (error) throw error;
      }
      logAudit({ accion: 'editar', modulo: 'sol', registro_ref: `Catálogo SOL (${Object.keys(cambios).length} criterio(s))` });
      setCambios({});
      qc.invalidateQueries({ queryKey: ['sol_criterios_todos'] });
      toast.success('Catálogo actualizado');
    } catch (e: unknown) { toast.error((e as { message?: string })?.message ?? 'Error'); }
    finally { setGuardando(false); }
  };

  const agregar = async () => {
    const numero = (criterios.reduce((m, c) => Math.max(m, c.numero), 0)) + 1;
    const { error } = await supabase.from('sol_criterios').insert({ numero, area: SOL_AREAS[0], tipo: 'S', texto: 'Nuevo criterio', activo: false });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['sol_criterios_todos'] });
    toast.success(`Criterio ${numero} agregado (inactivo). Edítalo y actívalo.`);
  };

  return (
    <div className="max-w-6xl mx-auto pb-24">
      <PageHeader title="Catálogo de criterios SOL" subtitle="Los 40 criterios del formato SOL-F01 en 8 áreas · se usan en la captura manual" />
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex gap-2 mb-5">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>Cada inspección guarda una copia del texto de sus criterios, así que editar aquí no altera el historial. Si cambias un criterio, actualiza también el Excel SOL-F01 que se envía a los campus para que el importador y la captura manual coincidan.</p>
      </div>
      <div className="flex gap-2 mb-4"><button className={btnSecondary} onClick={agregar}><Plus className="w-4 h-4" />Agregar criterio</button></div>
      {isLoading && <p className="text-slate-500">Cargando…</p>}
      <div className="space-y-4">
        {SOL_AREAS.map(area => {
          const lista = criterios.filter(c => val(c, 'area') === area);
          if (!lista.length) return null;
          return (
            <section key={area} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-[#00295A] text-white font-bold text-sm uppercase">{area}</div>
              <div className="divide-y divide-slate-100">
                {lista.map(c => (
                  <div key={c.id} className={`grid grid-cols-12 gap-2 items-center px-4 py-2 ${val(c, 'activo') ? '' : 'opacity-50'}`}>
                    <span className="col-span-1 text-sm font-bold text-slate-400 tabular-nums">{c.numero}</span>
                    <select className={inputCls + ' col-span-2 !py-1'} value={val(c, 'tipo')} onChange={e => set(c, 'tipo', e.target.value)}>
                      {SOL_COMPONENTES.map(x => <option key={x.key} value={x.key}>{x.key} · {x.label}</option>)}
                    </select>
                    <input className={inputCls + ' col-span-6 !py-1'} value={val(c, 'texto')} onChange={e => set(c, 'texto', e.target.value)} />
                    <select className={inputCls + ' col-span-2 !py-1'} value={val(c, 'area')} onChange={e => set(c, 'area', e.target.value)}>
                      {SOL_AREAS.map(a => <option key={a}>{a}</option>)}
                    </select>
                    <label className="col-span-1 flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={val(c, 'activo')} onChange={e => set(c, 'activo', e.target.checked)} />Activo</label>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {Object.keys(cambios).length > 0 && (
        <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white/95 border-t border-slate-200 px-4 py-3 flex items-center justify-between z-30">
          <p className="text-sm text-amber-700 font-semibold">{Object.keys(cambios).length} criterio(s) con cambios</p>
          <div className="flex gap-2">
            <button className={btnSecondary} onClick={() => setCambios({})}>Descartar</button>
            <button className={btnPrimary} disabled={guardando} onClick={guardar}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}
