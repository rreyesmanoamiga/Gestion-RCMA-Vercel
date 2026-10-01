// Galería de Evidencia Fotográfica (Antes / Durante / Después) de un proyecto.
// Las fotos se leen del Expediente en OneDrive a través de la función
// "proyecto-fotos": no se guarda nada en Supabase; las imágenes se bajan
// directo de Microsoft.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, X, ExternalLink, ImageOff, Loader2, RefreshCw, FolderOpen } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';

export interface FotoEvidencia {
  id: string;
  nombre: string;
  miniatura: string | null;
  grande: string | null;
  onedrive: string | null;
}
interface RespuestaFotos {
  encontrado: boolean;
  carpeta_url?: string;
  antes: FotoEvidencia[];
  durante: FotoEvidencia[];
  despues: FotoEvidencia[];
}

const SECCIONES = [
  { key: 'antes',   label: 'Antes',   color: 'bg-amber-100 text-amber-800' },
  { key: 'durante', label: 'Durante', color: 'bg-sky-100 text-sky-800' },
  { key: 'despues', label: 'Después', color: 'bg-emerald-100 text-emerald-800' },
] as const;

export const queryKeyFotosProyecto = (id: string) => ['proyecto-fotos', id];

export function useFotosProyecto(proyectoId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeyFotosProyecto(proyectoId),
    enabled: enabled && !!proyectoId,
    // Los links de Microsoft duran ~1 hora: se refrescan antes de que caduquen
    staleTime: 30 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<RespuestaFotos> => {
      const { data, error } = await supabase.functions.invoke('proyecto-fotos', { body: { proyecto_id: proyectoId } });
      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* sin cuerpo */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      return data as RespuestaFotos;
    },
  });
}

function Miniatura({ foto, onClick }: { foto: FotoEvidencia; onClick: () => void }) {
  const [falla, setFalla] = useState(false);
  const src = foto.miniatura ?? (/\.(heic|heif|tiff?)$/i.test(foto.nombre) ? null : foto.grande);
  return (
    <button type="button" onClick={onClick} title={foto.nombre}
      className="relative aspect-square rounded-lg overflow-hidden bg-slate-100 border border-slate-200 hover:ring-2 hover:ring-[#ED7102] focus:outline-none focus:ring-2 focus:ring-[#ED7102] transition group">
      {src && !falla ? (
        <img src={src} alt={foto.nombre} loading="lazy" onError={() => setFalla(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-1 p-1">
          <ImageOff className="w-5 h-5" />
          <span className="text-[9px] leading-tight text-center line-clamp-2 break-all">{foto.nombre}</span>
        </span>
      )}
    </button>
  );
}

export function VisorFotos({ fotos, indice, onCerrar, onCambiar }: {
  fotos: (FotoEvidencia & { seccion: string })[];
  indice: number;
  onCerrar: () => void;
  onCambiar: (i: number) => void;
}) {
  const foto = fotos[indice];
  const [cargando, setCargando] = useState(true);
  const [falla, setFalla] = useState(false);
  const anterior = useCallback(() => onCambiar((indice - 1 + fotos.length) % fotos.length), [indice, fotos.length, onCambiar]);
  const siguiente = useCallback(() => onCambiar((indice + 1) % fotos.length), [indice, fotos.length, onCambiar]);

  useEffect(() => { setCargando(true); setFalla(false); }, [indice]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowLeft') anterior();
      else if (e.key === 'ArrowRight') siguiente();
    };
    window.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = overflow; };
  }, [anterior, siguiente, onCerrar]);

  if (!foto) return null;
  const src = foto.grande ?? foto.miniatura;

  // Se monta directo en <body> para que ningún contenedor de la página lo recorte
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col" onClick={onCerrar}>
      <div className="flex items-center gap-3 px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
        <span className="text-xs font-bold uppercase tracking-wide bg-white/15 rounded px-2 py-0.5">{foto.seccion}</span>
        <p className="text-sm truncate flex-1 min-w-0">{foto.nombre}</p>
        <span className="text-xs text-white/60 shrink-0">{indice + 1} / {fotos.length}</span>
        {foto.onedrive && (
          <a href={foto.onedrive} target="_blank" rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 rounded-md px-2.5 py-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> Abrir en OneDrive
          </a>
        )}
        <button type="button" onClick={onCerrar} className="shrink-0 p-1.5 rounded-md hover:bg-white/15" title="Cerrar (Esc)">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 sm:px-16 pb-6">
        {fotos.length > 1 && (
          <button type="button" onClick={e => { e.stopPropagation(); anterior(); }} title="Anterior (←)"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/25 text-white z-10">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {cargando && !falla && src && <Loader2 className="absolute w-8 h-8 text-white/70 animate-spin" />}
        {src && !falla ? (
          <img key={foto.id} src={src} alt={foto.nombre} onClick={e => e.stopPropagation()}
            onLoad={() => setCargando(false)} onError={() => { setCargando(false); setFalla(true); }}
            className={`max-w-full max-h-full object-contain rounded shadow-2xl transition-opacity ${cargando ? 'opacity-0' : 'opacity-100'}`} />
        ) : (
          <div className="text-white/70 text-sm flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
            <ImageOff className="w-8 h-8" />
            No se pudo mostrar esta foto aquí.
          </div>
        )}
        {fotos.length > 1 && (
          <button type="button" onClick={e => { e.stopPropagation(); siguiente(); }} title="Siguiente (→)"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 hover:bg-white/25 text-white z-10">
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default function GaleriaEvidencia({ proyectoId, textoVacio }: { proyectoId: string; textoVacio?: string }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useFotosProyecto(proyectoId);
  const [abierta, setAbierta] = useState<number | null>(null);

  const todas = useMemo(() => SECCIONES.flatMap(s =>
    (data?.[s.key] ?? []).map(f => ({ ...f, seccion: s.label }))), [data]);
  const total = todas.length;

  if (isLoading) {
    return (
      <p className="text-xs text-slate-400 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando fotos en el Expediente…
      </p>
    );
  }
  if (isError) {
    return (
      <div className="flex items-center gap-3 text-xs text-red-600">
        <span>No se pudieron cargar las fotos: {(error as Error)?.message}</span>
        <button type="button" onClick={() => refetch()} className="font-bold text-blue-600 hover:underline">Reintentar</button>
      </div>
    );
  }
  if (total === 0) {
    return (
      <p className="text-xs text-slate-400 italic">
        {data?.encontrado === false
          ? 'No se encontró la carpeta del Expediente de este proyecto en OneDrive.'
          : (textoVacio ?? 'Sin fotos en el Expediente todavía.')}
      </p>
    );
  }

  let offset = 0;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-[11px] text-slate-500">
        <span className="font-semibold">{total} foto{total !== 1 ? 's' : ''}</span>
        <button type="button" onClick={() => refetch()} disabled={isFetching}
          className="inline-flex items-center gap-1 text-blue-600 font-bold hover:underline disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
        </button>
        {data?.carpeta_url && (
          <a href={data.carpeta_url} target="_blank" rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-blue-600 font-bold hover:underline">
            <FolderOpen className="w-3 h-3" /> Abrir carpeta en OneDrive
          </a>
        )}
      </div>

      {SECCIONES.map(s => {
        const fotos = data?.[s.key] ?? [];
        const inicio = offset;
        offset += fotos.length;
        return (
          <div key={s.key}>
            <p className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-bold uppercase tracking-wide rounded px-2 py-0.5 ${s.color}`}>{s.label}</span>
              <span className="text-[11px] text-slate-400">{fotos.length}</span>
            </p>
            {fotos.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">Sin fotos.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {fotos.map((f, i) => <Miniatura key={f.id} foto={f} onClick={() => setAbierta(inicio + i)} />)}
              </div>
            )}
          </div>
        );
      })}

      {abierta !== null && (
        <VisorFotos fotos={todas} indice={abierta} onCerrar={() => setAbierta(null)} onCambiar={setAbierta} />
      )}
    </div>
  );
}
