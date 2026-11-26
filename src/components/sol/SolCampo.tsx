// Piezas de pantalla del Programa SOL en campo (pensadas para el celular).
import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, X, Loader2, Eraser } from 'lucide-react';
import { toast } from 'sonner';
import { RESULTADOS, prepararFoto, type Foto, type Resultado } from '@/lib/solCampo';

/** Botones grandes Cumple / Parcial / No / N/A. */
export function BotonesResultado({ valor, onChange, sinNA = false }: { valor: Resultado | null; onChange: (r: Resultado | null) => void; sinNA?: boolean }) {
  return (
    <div className={`grid ${sinNA ? 'grid-cols-3' : 'grid-cols-4'} gap-1.5`} role="group">
      {RESULTADOS.filter(r => !sinNA || r.key !== 'na').map(r => {
        const activo = valor === r.key;
        return (
          <button key={r.key} type="button" aria-pressed={activo} onClick={() => onChange(activo ? null : r.key)}
            className={`py-2.5 rounded-lg border text-[12px] font-bold transition active:scale-95 ${activo ? r.activo : 'bg-white text-slate-600 border-slate-300'}`}>
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

/** Fotos tomadas con la cámara del celular (o de la galería). Se comprimen al momento. */
export function SelectorFotos({ fotos, onChange, max = 6, etiqueta }: { fotos: Foto[]; onChange: (f: Foto[]) => void; max?: number; etiqueta?: string }) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [vista, setVista] = useState<Foto | null>(null);

  const agregar = async (files: FileList | null) => {
    const imgs = Array.from(files ?? []).filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;
    setProcesando(true);
    try {
      const nuevas: Foto[] = [];
      for (const f of imgs.slice(0, Math.max(0, max - fotos.length))) nuevas.push(await prepararFoto(f));
      onChange([...fotos, ...nuevas]);
      if (imgs.length > max - fotos.length) toast.info(`Máximo ${max} fotos por punto`);
    } catch (e) { toast.error((e as Error).message || 'No se pudo leer la foto'); }
    finally { setProcesando(false); }
  };

  return (
    <div>
      {etiqueta && <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">{etiqueta}</p>}
      <div className="flex flex-wrap gap-2 items-center">
        {fotos.map(f => (
          <div key={f.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
            <button type="button" className="w-full h-full" onClick={() => setVista(f)} aria-label="Ver foto">
              <img src={f.thumb} alt="" className="w-full h-full object-cover" />
            </button>
            <button type="button" onClick={() => onChange(fotos.filter(x => x.id !== f.id))} aria-label="Quitar foto"
              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
            {f.url && <span className="absolute bottom-0 inset-x-0 bg-emerald-600/80 text-white text-[8px] font-bold text-center">SUBIDA</span>}
          </div>
        ))}
        {fotos.length < max && (
          <>
            <button type="button" disabled={procesando} onClick={() => camara.current?.click()}
              className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 flex flex-col items-center justify-center text-[10px] font-semibold active:bg-slate-50">
              {procesando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}Cámara
            </button>
            <button type="button" disabled={procesando} onClick={() => galeria.current?.click()}
              className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 text-slate-500 flex flex-col items-center justify-center text-[10px] font-semibold active:bg-slate-50">
              <ImagePlus className="w-5 h-5" />Galería
            </button>
          </>
        )}
      </div>
      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { agregar(e.target.files); e.target.value = ''; }} />
      <input ref={galeria} type="file" accept="image/*" multiple className="hidden" onChange={e => { agregar(e.target.files); e.target.value = ''; }} />
      {vista && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-3" onClick={() => setVista(null)}>
          <img src={URL.createObjectURL(vista.blob)} alt="" className="max-w-full max-h-full rounded-lg" />
          <button type="button" className="absolute top-4 right-4 bg-white/20 text-white rounded-full p-2" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>
      )}
    </div>
  );
}

/** Firma con el dedo. Entrega un PNG con fondo transparente. */
export function FirmaPad({ valor, onChange, etiqueta, nombre }: { valor?: string; onChange: (v: string | undefined) => void; etiqueta: string; nombre?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const trazo = useRef(false);

  useEffect(() => {
    const c = ref.current!;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.round(r.width * 2); c.height = Math.round(r.height * 2);
      const ctx = c.getContext('2d')!;
      ctx.lineWidth = 4.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#11325F';
      if (valor) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height); img.src = valor; }
    };
    ajustar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const punto = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * 2, y: (e.clientY - r.top) * 2 };
  };
  const inicio = (e: React.PointerEvent) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); dibujando.current = true; ultimo.current = punto(e); };
  const mover = (e: React.PointerEvent) => {
    if (!dibujando.current) return;
    const p = punto(e); const ctx = ref.current!.getContext('2d')!;
    ctx.beginPath(); ctx.moveTo(ultimo.current!.x, ultimo.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ultimo.current = p; trazo.current = true;
  };
  const fin = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    if (trazo.current) onChange(ref.current!.toDataURL('image/png'));
  };
  const limpiar = () => {
    const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    trazo.current = false; onChange(undefined);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-bold text-slate-500 uppercase">{etiqueta}</p>
        <button type="button" onClick={limpiar} className="text-[11px] text-slate-500 inline-flex items-center gap-1"><Eraser className="w-3.5 h-3.5" />Borrar</button>
      </div>
      <div className="relative">
        <canvas ref={ref} className="w-full h-28 rounded-lg border border-slate-300 bg-white touch-none"
          onPointerDown={inicio} onPointerMove={mover} onPointerUp={fin} onPointerLeave={fin} onPointerCancel={fin} />
        {!valor && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">Firme aquí con el dedo</p>}
      </div>
      {nombre && <p className="text-[11px] text-slate-500 mt-1 text-center">{nombre}</p>}
    </div>
  );
}

/** Barra fija inferior para el botón principal en el celular. */
export function BarraInferior({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed bottom-0 inset-x-0 lg:left-64 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-4 pt-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="max-w-xl mx-auto">{children}</div>
    </div>
  );
}

export const btnGrande = 'w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-slate-900 text-white text-sm font-bold active:scale-[0.99] disabled:opacity-50';
export const btnGrandeNaranja = 'w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-[#ED7102] text-white text-sm font-bold active:scale-[0.99] disabled:opacity-50';
export const btnContorno = 'inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold active:bg-slate-50 disabled:opacity-50';
export const chip = (activo: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border transition ${activo ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`;
