// Fotos en los comentarios de NEXUS (Seguimientos de proyecto y Pendientes).
// Se pueden pegar con Ctrl+V (capturas, fotos copiadas de WhatsApp), arrastrar
// o elegir del equipo / cámara del celular. Se comprimen en el navegador y se
// suben al OneDrive de la Coordinación con la función "nexus-fotos"; en el
// comentario solo se guarda el id del archivo.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, X, Loader2, ImageOff } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { VisorFotos } from '@/components/projects/GaleriaEvidencia';

export interface FotoRef { id: string; nombre: string }
export interface Adjunto { file: File; preview: string }
type Destino = { seguimiento_id: string } | { pendiente_id: string };

const MAX_LADO = 1600;
const MAX_FOTOS = 6;

/** Reduce la foto a máx. 1600 px por lado en JPG (≈200–500 KB) */
async function comprimir(file: File): Promise<{ base64: string; tipo: string }> {
  const bmp = await createImageBitmap(file);
  const escala = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob: Blob = await new Promise((ok, mal) => canvas.toBlob(b => (b ? ok(b) : mal(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.82));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(s), tipo: 'image/jpeg' };
}

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('nexus-fotos', { body });
  if (error) {
    let msg = error.message;
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

/** Sube las fotos adjuntas y regresa las referencias para guardarlas en el comentario */
export async function subirFotos(adjuntos: Adjunto[], destino: Destino): Promise<FotoRef[]> {
  const refs: FotoRef[] = [];
  for (const a of adjuntos) {
    const { base64, tipo } = await comprimir(a.file);
    refs.push(await invocar<FotoRef>({ accion: 'subir', ...destino, nombre: a.file.name || 'foto', tipo, base64 }));
  }
  return refs;
}

/** Estado de las fotos por adjuntar (con vista previa) */
export function useAdjuntos() {
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  useEffect(() => () => adjuntos.forEach(a => URL.revokeObjectURL(a.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const agregar = (files: FileList | File[] | null | undefined) => {
    const imgs = Array.from(files ?? []).filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return 0;
    setAdjuntos(prev => [...prev, ...imgs.map(file => ({ file, preview: URL.createObjectURL(file) }))].slice(0, MAX_FOTOS));
    return imgs.length;
  };
  const quitar = (i: number) => setAdjuntos(prev => { URL.revokeObjectURL(prev[i]?.preview); return prev.filter((_, k) => k !== i); });
  const limpiar = () => setAdjuntos(prev => { prev.forEach(a => URL.revokeObjectURL(a.preview)); return []; });
  /** Para el onPaste del textarea: toma las imágenes del portapapeles */
  const alPegar = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); agregar(files); }
  };
  /** Para arrastrar y soltar sobre la caja de comentario */
  const alSoltar = {
    onDragOver: (e: React.DragEvent) => { if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => { if (e.dataTransfer.files?.length) { e.preventDefault(); agregar(e.dataTransfer.files); } },
  };
  return { adjuntos, agregar, quitar, limpiar, alPegar, alSoltar };
}

/** Botón de cámara + vistas previas de lo que se va a adjuntar */
export function SelectorFotos({ adjuntos, agregar, quitar, deshabilitado }: {
  adjuntos: Adjunto[]; agregar: (f: FileList | null) => void; quitar: (i: number) => void; deshabilitado?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { agregar(e.target.files); e.target.value = ''; }} />
      <button type="button" disabled={deshabilitado || adjuntos.length >= MAX_FOTOS} onClick={() => ref.current?.click()}
        title="Agregar fotos (también puedes pegarlas con Ctrl+V o arrastrarlas)"
        className="p-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition shrink-0">
        <Camera className="w-4 h-4" />
      </button>
      {adjuntos.length > 0 && (
        <div className="basis-full flex flex-wrap gap-2 order-first">
          {adjuntos.map((a, i) => (
            <div key={a.preview} className="relative w-14 h-14 rounded-md overflow-hidden border border-slate-200 bg-slate-100">
              <img src={a.preview} alt={a.file.name} className="w-full h-full object-cover" />
              {!deshabilitado && (
                <button type="button" onClick={() => quitar(i)} title="Quitar"
                  className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <p className="basis-full text-[10px] text-slate-400">{adjuntos.length} foto{adjuntos.length !== 1 ? 's' : ''} por enviar</p>
        </div>
      )}
    </>
  );
}

type FotoVista = { id: string; nombre: string; miniatura: string | null; grande: string | null; onedrive: string | null };

/** Links de las fotos de todos los comentarios de un panel (una sola llamada) */
export function useFotosNexus(ids: string[]) {
  const clave = useMemo(() => [...new Set(ids)].sort(), [ids.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data } = useQuery({
    queryKey: ['nexus-fotos', clave],
    enabled: clave.length > 0,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => (await invocar<{ fotos: FotoVista[] }>({ accion: 'ver', ids: clave })).fotos,
  });
  return useMemo(() => new Map((data ?? []).map(f => [f.id, f])), [data]);
}

/** Miniaturas dentro de un comentario; al hacer clic se abren en grande */
export function FotosDeComentario({ fotos, mapa, oscuro }: { fotos?: FotoRef[] | null; mapa: Map<string, FotoVista>; oscuro?: boolean }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  if (!fotos?.length) return null;
  const lista = fotos.map(f => ({ ...(mapa.get(f.id) ?? { id: f.id, nombre: f.nombre, miniatura: null, grande: null, onedrive: null }), seccion: 'Seguimiento' }));
  return (
    <>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {lista.map((f, i) => (
          <button key={f.id} type="button" onClick={() => setAbierta(i)} title={f.nombre}
            className={`w-16 h-16 rounded-md overflow-hidden border ${oscuro ? 'border-white/20 bg-white/10' : 'border-slate-200 bg-slate-100'} flex items-center justify-center hover:ring-2 hover:ring-[#ED7102]`}>
            {f.miniatura ? <img src={f.miniatura} alt={f.nombre} loading="lazy" className="w-full h-full object-cover" />
              : mapa.size ? <ImageOff className="w-4 h-4 text-slate-400" /> : <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
          </button>
        ))}
      </div>
      {abierta !== null && <VisorFotos fotos={lista} indice={abierta} onCerrar={() => setAbierta(null)} onCambiar={setAbierta} />}
    </>
  );
}
