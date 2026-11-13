import React, { useState } from 'react';
import { toast } from 'sonner';
import { Gift, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { logAudit } from '@/lib/audit';

// ─── Remanente de los Sorteos Mano Amiga ─────────────────────────────────────
// Se pregunta en la Solicitud de Proyecto y en el Ticket MAS:
//   remanente_sorteo: ¿se paga con el remanente? (true/false; null = sin contestar)
//   remanente_anios:  de qué sorteo(s) sale; puede ser más de uno cuando juntan
//                     el remanente de varios años (p. ej. 2025 y 2026).

/** Años que se ofrecen: dos atrás, el actual y el siguiente (más los que ya traiga el registro) */
export const aniosSorteo = (extra: number[] = []) => {
  const y = new Date().getFullYear();
  return [...new Set([y - 2, y - 1, y, y + 1, ...extra])].sort((a, b) => a - b);
};

export const textoAnios = (anios?: number[] | null) => {
  const a = [...(anios ?? [])].sort((x, y) => x - y);
  return a.length ? a.join(' – ') : '';
};

/** "Remanente Sorteo 2025", "Remanente Sorteos 2025 – 2026" o "Remanente Sorteo (año por definir)" */
export const textoRemanente = (si?: boolean | null, anios?: number[] | null) => {
  if (si === true) {
    const a = textoAnios(anios);
    return a ? `Remanente Sorteo${(anios ?? []).length > 1 ? 's' : ''} ${a}` : 'Remanente Sorteo (año por definir)';
  }
  if (si === false) return 'No';
  return '—';
};

/** Etiqueta morada para listas y detalles; no pinta nada si no es remanente */
export function RemanenteBadge({ si, anios, className = '' }: { si?: boolean | null; anios?: number[] | null; className?: string }) {
  if (si !== true) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 uppercase whitespace-nowrap ${className}`}>
      <Gift className="w-3 h-3" /> {textoRemanente(true, anios)}
    </span>
  );
}

/** Pregunta Sí/No + años (formularios de Solicitud y Ticket MAS, y editor del administrador) */
export function RemanentePregunta({ si, anios, onChange, requerido = true }: {
  si: boolean | null; anios: number[]; onChange: (si: boolean | null, anios: number[]) => void; requerido?: boolean;
}) {
  const sinContestar = requerido && si === null;
  const sinAnio = requerido && si === true && anios.length === 0;
  return (
    <div className={`rounded-lg border-2 p-3 ${sinContestar || sinAnio ? 'border-purple-300 bg-purple-50/70' : 'border-purple-200 bg-purple-50/40'}`}>
      <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">¿Se paga con el Remanente del Sorteo Mano Amiga?{requerido && ' *'}</p>
      <div className="flex flex-wrap gap-3 mt-2 items-start">
        <div className="flex rounded-md border border-slate-300 overflow-hidden text-sm font-bold shrink-0">
          <button type="button" onClick={() => onChange(true, anios)}
            className={`px-5 py-1.5 ${si === true ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>Sí</button>
          <button type="button" onClick={() => onChange(false, [])}
            className={`px-5 py-1.5 border-l border-slate-300 ${si === false ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>No</button>
        </div>
        {si === true && (
          <div>
            <p className="text-[11px] font-bold text-slate-600 uppercase mb-1">Sorteo(s) del que sale{requerido && ' *'} <span className="normal-case font-medium text-slate-400">— marca uno o varios si se junta el remanente de varios años</span></p>
            <div className="flex flex-wrap gap-1.5">
              {aniosSorteo(anios).map(a => {
                const on = anios.includes(a);
                return (
                  <button type="button" key={a} onClick={() => onChange(true, on ? anios.filter(x => x !== a) : [...anios, a].sort((x, y) => x - y))}
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${on ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-300 hover:border-purple-400'}`}>
                    Sorteo {a}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {sinContestar && <p className="text-[11px] text-purple-700 font-semibold mt-2">Contesta Sí o No.</p>}
      {sinAnio && <p className="text-[11px] text-purple-700 font-semibold mt-2">Marca de qué sorteo(s) sale el remanente.</p>}
    </div>
  );
}

/** Validación para enviar un formulario */
export const remanenteValido = (si: boolean | null, anios: number[]) =>
  si === false || (si === true && anios.length > 0);

/** Recuadro de detalle con corrección por el administrador (Ticket MAS y Solicitudes Recibidas) */
export function RemanenteDetalle({ tabla, id, referencia, si, anios, editable, onGuardado }: {
  tabla: 'tickets_mas' | 'solicitudes'; id: string; referencia?: string | null;
  si?: boolean | null; anios?: number[] | null; editable: boolean; onGuardado?: (si: boolean | null, anios: number[]) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [vSi, setVSi] = useState<boolean | null>(si ?? null);
  const [vAnios, setVAnios] = useState<number[]>(anios ?? []);
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    const { error } = await supabase.from(tabla).update({ remanente_sorteo: vSi, remanente_anios: vSi ? vAnios : [] }).eq('id', id);
    setGuardando(false);
    if (error) { toast.error('No se pudo guardar: ' + error.message); return; }
    logAudit({ accion: 'editar', modulo: tabla === 'tickets_mas' ? 'tickets_mas' : 'solicitudes', registro_id: id, registro_ref: referencia ?? null,
      detalle: { cambio: 'Remanente del sorteo', valor: textoRemanente(vSi, vAnios) } });
    toast.success('Remanente actualizado');
    setEditando(false);
    onGuardado?.(vSi, vSi ? vAnios : []);
  };

  return (
    <div className={`rounded-lg border-l-4 p-3 ${si ? 'border-purple-500 bg-purple-50' : 'border-slate-300 bg-slate-50'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase">Remanente del Sorteo Mano Amiga</p>
        {editable && !editando && (
          <button type="button" onClick={() => { setVSi(si ?? null); setVAnios(anios ?? []); setEditando(true); }}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:underline"><Pencil className="w-3 h-3" /> Corregir</button>
        )}
      </div>
      {!editando ? (
        <p className={`text-sm mt-0.5 ${si ? 'font-bold text-purple-800' : 'text-slate-600'}`}>
          {si === null || si === undefined ? <span className="italic text-slate-400">Sin contestar</span> : textoRemanente(si, anios)}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <RemanentePregunta si={vSi} anios={vAnios} onChange={(a, b) => { setVSi(a); setVAnios(b); }} requerido={false} />
          <p className="text-[11px] text-slate-500">Si todavía no sabes el año, puedes dejarlo en "Sí" sin marcar sorteo.</p>
          <div className="flex gap-2">
            <button type="button" onClick={guardar} disabled={guardando}
              className="px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-bold hover:bg-slate-800 disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" onClick={() => setEditando(false)} className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
