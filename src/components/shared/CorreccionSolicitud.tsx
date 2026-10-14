// Corrección de solicitudes por la Coordinación RCMA, con motivo obligatorio
// y registro del antes / después en la bitácora de Auditoría.
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PencilLine, X, Loader2, History, AlertTriangle, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { logAudit } from '@/lib/audit';
import {
  CORRECCION_EMAIL, TIPO_CORRECCION, MOTIVO_MIN, esCorregible, fmtMXN,
  type ConfigCorreccion, type CampoCorreccion, type Valores, type CambioCorreccion,
} from '@/lib/correcciones';

/** Solo la cuenta de la Coordinación RCMA puede corregir. */
export function usePuedeCorregir(): boolean {
  const { user } = useAuth();
  return (user?.email ?? '').toLowerCase() === CORRECCION_EMAIL;
}

// ── Conversión entre la fila de la base de datos y el formulario ───────────
const aTexto = (c: CampoCorreccion, v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (c.tipo === 'moneda') return String(Number(v));
  if (c.tipo === 'fecha') return String(v).slice(0, 10);
  return String(v);
};
const aValor = (c: CampoCorreccion, s: string): string | number | null => {
  const t = s.trim();
  if (c.tipo === 'moneda') return t === '' ? null : Number(t);
  return t === '' ? null : t;
};
const mostrar = (c: CampoCorreccion, s: string): string => {
  if (s.trim() === '') return '—';
  if (c.tipo === 'moneda') return fmtMXN(Number(s));
  if (c.tipo === 'fecha') return new Date(s + 'T12:00:00').toLocaleDateString('es-MX');
  return s;
};
const igual = (c: CampoCorreccion, a: string, b: string) => {
  const x = a.trim(), y = b.trim();
  if (c.tipo === 'moneda' && x !== '' && y !== '') return Number(x) === Number(y);
  return x === y;
};
const conComas = (s: string) => {
  if (s === '') return '';
  const [i, d] = s.split('.');
  return '$' + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d !== undefined ? '.' + d.slice(0, 2) : '');
};

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none';
const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase mb-1';

// ── Botón ──────────────────────────────────────────────────────────────────
export function BotonCorregir({ modulo, estatus, onClick, compacto = false }: {
  modulo: string; estatus?: string | null; onClick: () => void; compacto?: boolean;
}) {
  const puede = usePuedeCorregir();
  if (!puede || !esCorregible(modulo, estatus)) return null;
  return compacto ? (
    <button onClick={onClick} title="Corregir solicitud (queda en auditoría)"
      className="p-1.5 rounded hover:bg-amber-50 text-amber-600 transition"><PencilLine className="w-4 h-4" /></button>
  ) : (
    <button onClick={onClick} title="Corregir solicitud (queda en auditoría)"
      className="flex items-center gap-1.5 px-3 py-2 whitespace-nowrap border border-amber-300 text-amber-700 rounded-md text-sm font-medium hover:bg-amber-50 transition-colors">
      <PencilLine className="w-4 h-4" /> Corregir
    </button>
  );
}

// ── Modal de corrección ────────────────────────────────────────────────────
export function CorregirModal<T extends { id: string }>({ config, registro, referencia, onClose, onSaved }: {
  config: ConfigCorreccion;
  registro: T;
  referencia: string;
  onClose: () => void;
  onSaved: (actualizado: T) => void;
}) {
  const qc = useQueryClient();
  const fila = registro as unknown as Record<string, unknown>;
  const original = useMemo(() => {
    const o: Valores = {};
    config.campos.forEach(c => { o[c.key] = aTexto(c, fila[c.key]); });
    return o;
  }, [config, fila]);
  const [v, setV] = useState<Valores>(original);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const set = (key: string, valor: string) => setV(p => (config.derivar ? config.derivar(key, { ...p, [key]: valor }) : { ...p, [key]: valor }));

  const cambios: (CambioCorreccion & { key: string })[] = config.campos
    .filter(c => !igual(c, v[c.key] ?? '', original[c.key] ?? ''))
    .map(c => ({ key: c.key, campo: c.label, antes: mostrar(c, original[c.key] ?? ''), despues: mostrar(c, v[c.key] ?? '') }));
  const error = config.validar?.(v) ?? null;
  const aviso = config.avisar?.(v) ?? null;
  const motivoOk = motivo.trim().length >= MOTIVO_MIN;

  const guardar = async () => {
    if (!cambios.length) { toast.error('No hay cambios que guardar'); return; }
    if (error) { toast.error(error); return; }
    if (!motivoOk) { toast.error(`Escribe el motivo de la corrección (mínimo ${MOTIVO_MIN} caracteres)`); return; }
    setGuardando(true);
    try {
      const upd: Record<string, unknown> = {};
      cambios.forEach(ch => {
        const c = config.campos.find(x => x.key === ch.key)!;
        upd[ch.key] = aValor(c, v[ch.key] ?? '');
      });
      const { data, error: e } = await supabase.from(config.tabla).update(upd).eq('id', registro.id).select().single();
      if (e) throw e;
      if (!data) throw new Error('No se pudo guardar la corrección');
      await logAudit({
        accion: 'editar',
        modulo: config.modulo,
        registro_id: registro.id,
        registro_ref: referencia,
        detalle: {
          tipo: TIPO_CORRECCION,
          motivo: motivo.trim(),
          cambios: cambios.map(({ campo, antes, despues }) => ({ campo, antes, despues })),
        },
      });
      qc.invalidateQueries({ queryKey: ['correcciones', config.modulo] });
      toast.success(`Corrección guardada (${cambios.length} campo${cambios.length === 1 ? '' : 's'}) y registrada en Auditoría`);
      onSaved({ ...registro, ...(data as object) } as T);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? 'Error al guardar la corrección');
    } finally {
      setGuardando(false);
    }
  };

  const grupos = Array.from(new Set(config.campos.map(c => c.grupo)));

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-amber-50/60 rounded-t-xl">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><PencilLine className="w-4 h-4 text-amber-600" />Corregir {config.titulo}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{referencia} · la corrección y su motivo quedan en Auditoría</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {grupos.map(g => (
            <section key={g}>
              <p className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2">{g}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {config.campos.filter(c => c.grupo === g && (!c.visible || c.visible(v))).map(c => {
                  const cambiado = !igual(c, v[c.key] ?? '', original[c.key] ?? '');
                  const cls = inputCls + (cambiado ? ' !border-amber-400 !bg-amber-50' : '');
                  return (
                    <div key={c.key} className={c.ancho === 'completo' || c.tipo === 'textarea' ? 'sm:col-span-2' : ''}>
                      <label className={labelCls}>{c.label}{cambiado && <span className="ml-1 normal-case font-semibold text-amber-600">· antes: {mostrar(c, original[c.key] ?? '')}</span>}</label>
                      {c.tipo === 'textarea' ? (
                        <textarea className={cls} rows={3} value={v[c.key] ?? ''} onChange={e => set(c.key, e.target.value)} />
                      ) : c.tipo === 'select' ? (
                        <select className={cls} value={v[c.key] ?? ''} onChange={e => set(c.key, e.target.value)}>
                          <option value="">—</option>
                          {[...(c.opciones ?? []), ...(v[c.key] && !(c.opciones ?? []).includes(v[c.key]) ? [v[c.key]] : [])].map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : c.tipo === 'moneda' ? (
                        <input className={cls + ' text-right font-mono'} inputMode="decimal" placeholder="$0.00" value={conComas(v[c.key] ?? '')}
                          onChange={e => {
                            const limpio = e.target.value.replace(/[^0-9.]/g, '');
                            const [i, ...d] = limpio.split('.');
                            set(c.key, d.length ? `${i}.${d.join('').slice(0, 2)}` : i);
                          }} />
                      ) : (
                        <input type={c.tipo === 'fecha' ? 'date' : 'text'} className={cls} value={v[c.key] ?? ''} onChange={e => set(c.key, e.target.value)} />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {aviso && <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{aviso}</p>}
          {error && <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</p>}

          <section className="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <p className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2">Cambios ({cambios.length})</p>
            {cambios.length === 0 ? <p className="text-xs text-slate-400">Todavía no hay cambios.</p> : (
              <ul className="space-y-1">
                {cambios.map(ch => (
                  <li key={ch.key} className="text-xs text-slate-700 flex flex-wrap items-center gap-1.5">
                    <span className="font-bold">{ch.campo}:</span>
                    <span className="line-through text-slate-400">{ch.antes}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400" />
                    <span className="font-semibold text-slate-900">{ch.despues}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div>
            <label className={labelCls}>Motivo de la corrección *</label>
            <textarea className={inputCls + (motivo && !motivoOk ? ' !border-red-400' : '')} rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ej. El colegio confirmó por correo que el monto de FBC es de $120,000 y no de $1,200,000." />
            <p className="text-[11px] text-slate-400 mt-1">Obligatorio. Explica qué estaba mal y por qué se corrige (por ejemplo, quién lo confirmó y por qué medio).</p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !cambios.length || !!error || !motivoOk}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-bold hover:bg-amber-700 disabled:opacity-40">
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}Guardar corrección
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Historial y marca de "Corregida" ───────────────────────────────────────
interface RegistroCorreccion {
  id: string; created_at: string; usuario_nombre: string | null; usuario_email: string | null; registro_id: string | null;
  detalle: { motivo?: string; cambios?: CambioCorreccion[] } | null;
}

/** Correcciones de un módulo (solo las ve la Coordinación). */
export function useCorrecciones(modulo: string) {
  const puede = usePuedeCorregir();
  return useQuery({
    queryKey: ['correcciones', modulo],
    enabled: puede,
    queryFn: async () => {
      const { data, error } = await supabase.from('auditoria_sistema')
        .select('id, created_at, usuario_nombre, usuario_email, registro_id, detalle')
        .eq('modulo', modulo).eq('detalle->>tipo', TIPO_CORRECCION)
        .order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as RegistroCorreccion[];
    },
  });
}

export function MarcaCorregida({ modulo, id }: { modulo: string; id: string }) {
  const { data = [] } = useCorrecciones(modulo);
  const n = data.filter(r => r.registro_id === id).length;
  if (!n) return null;
  return (
    <span title="Corregida por la Coordinación RCMA; el detalle está en Auditoría"
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase">
      <PencilLine className="w-3 h-3" />Corregida{n > 1 ? ` ×${n}` : ''}
    </span>
  );
}

export function HistorialCorrecciones({ modulo, id }: { modulo: string; id: string }) {
  const { data = [] } = useCorrecciones(modulo);
  const lista = data.filter(r => r.registro_id === id);
  if (!lista.length) return null;
  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-3">
      <p className="text-[11px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5"><History className="w-3.5 h-3.5" />Correcciones de la Coordinación ({lista.length})</p>
      {lista.map(r => (
        <div key={r.id} className="text-xs text-slate-700">
          <p className="text-slate-500">
            {new Date(r.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {' · '}{r.usuario_nombre ?? r.usuario_email}
          </p>
          <p className="mt-0.5"><span className="font-bold">Motivo:</span> {r.detalle?.motivo ?? '—'}</p>
          <ul className="mt-1 space-y-0.5">
            {(r.detalle?.cambios ?? []).map((c, i) => (
              <li key={i}><span className="font-semibold">{c.campo}:</span> <span className="line-through text-slate-400">{c.antes}</span> → <span className="font-semibold text-slate-900">{c.despues}</span></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
