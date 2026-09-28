// Control de avisos por colegio: qué correos le llegan al ADMINISTRADOR de
// cada colegio (verificado, rechazado, recordatorios de vencimiento).
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Bell, BellOff, Loader2, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { COLEGIOS } from '@/lib/colegios';

export type CampoAviso = 'avisar_verificado' | 'avisar_rechazado' | 'avisar_recordatorios';
export interface AvisoColegio { colegio: string; avisar_verificado: boolean; avisar_rechazado: boolean; avisar_recordatorios: boolean; }

const CAMPOS: { k: CampoAviso; label: string; desc: string }[] = [
  { k: 'avisar_verificado',    label: 'Verificado',    desc: 'Correo cuando verificas un documento' },
  { k: 'avisar_rechazado',     label: 'Rechazado',     desc: 'Correo con el motivo cuando rechazas' },
  { k: 'avisar_recordatorios', label: 'Recordatorios', desc: '3 meses, 1 mes y 1 semana antes de vencer' },
];
const COLEGIOS_PC = COLEGIOS.filter(c => c.territorio !== 'FMA' && !c.colegio.startsWith('CLIN'));

export function useAvisosColegios(enabled = true) {
  return useQuery({
    queryKey: ['compliance_avisos_colegio'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_avisos_colegio').select('*');
      if (error) throw error;
      const mapa: Record<string, AvisoColegio> = {};
      (data ?? []).forEach((a: any) => { mapa[a.colegio] = a; });
      return mapa;
    },
  });
}

// Etiqueta corta para el encabezado del Expediente
export function EstadoAvisos({ aviso, onClick }: { aviso?: AvisoColegio; onClick: () => void }) {
  const n = aviso ? CAMPOS.filter(c => aviso[c.k]).length : 0;
  const cls = n === 0 ? 'bg-slate-100 text-slate-600 border-slate-300' : n === CAMPOS.length ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-amber-50 text-amber-700 border-amber-300';
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold hover:shadow-sm transition ${cls}`}
      title="Qué correos le llegan al administrador de este colegio">
      {n === 0 ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
      Avisos: {n === 0 ? 'apagados' : n === CAMPOS.length ? 'todos encendidos' : `${n} de ${CAMPOS.length}`}
    </button>
  );
}

export default function AvisosColegiosModal({ onClose, resaltar }: { onClose: () => void; resaltar?: string }) {
  const qc = useQueryClient();
  const { data: avisos = {}, isLoading } = useAvisosColegios();
  const { data: directorio = [] } = useQuery({
    queryKey: ['directorio_admins_colegio'],
    queryFn: async () => {
      const { data, error } = await supabase.from('directorio').select('codigo, nombre, adm_nombre, adm_correo');
      if (error) throw error;
      return (data ?? []) as { codigo: string; nombre: string; adm_nombre: string | null; adm_correo: string | null }[];
    },
  });
  const contacto = (c: string) => directorio.find(d => d.codigo === c);

  const guardar = useMutation({
    mutationFn: async (filas: AvisoColegio[]) => {
      const { data: s } = await supabase.auth.getSession();
      const quien = s.session?.user?.email ?? null;
      const { error } = await supabase.from('compliance_avisos_colegio')
        .upsert(filas.map(f => ({ ...f, updated_at: new Date().toISOString(), updated_by: quien })), { onConflict: 'colegio' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compliance_avisos_colegio'] }),
    onError: (e: any) => toast.error(`No se guardó: ${e.message}`),
  });

  const fila = (c: string): AvisoColegio => avisos[c] ?? { colegio: c, avisar_verificado: false, avisar_rechazado: false, avisar_recordatorios: false };
  const cambiar = (c: string, k: CampoAviso, v: boolean) => guardar.mutate([{ ...fila(c), [k]: v }]);
  const cambiarFilaCompleta = (c: string, v: boolean) => guardar.mutate([{ colegio: c, avisar_verificado: v, avisar_rechazado: v, avisar_recordatorios: v }]);
  const cambiarColumna = (k: CampoAviso, v: boolean) => guardar.mutate(COLEGIOS_PC.map(c => ({ ...fila(c.colegio), [k]: v })));
  const todos = (v: boolean) => guardar.mutate(COLEGIOS_PC.map(c => ({ colegio: c.colegio, avisar_verificado: v, avisar_rechazado: v, avisar_recordatorios: v })));

  const Switch = ({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => onChange(!on)}
      className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
          <div>
            <h3 className="text-base font-bold text-[#00295A] flex items-center gap-2"><Bell className="w-4 h-4" /> Avisos a colegios</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Qué correos le llegan al <b>administrador</b> de cada colegio (el correo sale del Directorio). Apágalos mientras cargas documentos de años anteriores.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => todos(false)} disabled={guardar.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            <BellOff className="w-3.5 h-3.5" /> Apagar todo
          </button>
          <button type="button" onClick={() => todos(true)} disabled={guardar.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
            <Bell className="w-3.5 h-3.5" /> Encender todo
          </button>
          {guardar.isPending && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          <p className="text-[11px] text-slate-400 ml-auto">"Solicitar faltantes" siempre se envía, porque lo mandas tú a propósito.</p>
        </div>

        <div className="overflow-y-auto">
          {isLoading ? (
            <p className="p-6 text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-slate-200 text-left">
                  <th className="px-5 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Colegio / administrador</th>
                  {CAMPOS.map(c => {
                    const encendidos = COLEGIOS_PC.filter(x => fila(x.colegio)[c.k]).length;
                    return (
                      <th key={c.k} className="px-3 py-2.5 text-center">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{c.label}</p>
                        <p className="text-[10px] text-slate-400 font-normal normal-case">{c.desc}</p>
                        <button type="button" onClick={() => cambiarColumna(c.k, encendidos < COLEGIOS_PC.length)} disabled={guardar.isPending}
                          className="mt-1 text-[10px] font-bold text-sky-600 hover:underline disabled:opacity-50">
                          {encendidos < COLEGIOS_PC.length ? 'encender en todos' : 'apagar en todos'}
                        </button>
                      </th>
                    );
                  })}
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide text-center">Todo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COLEGIOS_PC.map(c => {
                  const f = fila(c.colegio); const d = contacto(c.colegio);
                  const todosOn = CAMPOS.every(x => f[x.k]);
                  return (
                    <tr key={c.colegio} className={resaltar === c.colegio ? 'bg-sky-50' : ''}>
                      <td className="px-5 py-2.5">
                        <p className="font-semibold text-slate-800">{c.colegio} <span className="text-xs font-normal text-slate-400">· {d?.nombre ?? c.territorio}</span></p>
                        <p className={`text-[11px] flex items-center gap-1 ${d?.adm_correo ? 'text-slate-500' : 'text-red-500'}`}>
                          <Mail className="w-3 h-3" /> {d?.adm_correo ? `${d.adm_nombre ?? ''} ${d.adm_correo}`.trim() : 'Sin correo de administrador en el Directorio'}
                        </p>
                      </td>
                      {CAMPOS.map(x => (
                        <td key={x.k} className="px-3 py-2.5 text-center"><div className="inline-flex"><Switch on={f[x.k]} onChange={v => cambiar(c.colegio, x.k, v)} disabled={guardar.isPending} /></div></td>
                      ))}
                      <td className="px-3 py-2.5 text-center">
                        <button type="button" onClick={() => cambiarFilaCompleta(c.colegio, !todosOn)} disabled={guardar.isPending}
                          className="text-[11px] font-bold text-sky-600 hover:underline disabled:opacity-50">{todosOn ? 'apagar' : 'encender'}</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
