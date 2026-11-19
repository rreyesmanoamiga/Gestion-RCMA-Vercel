// Capacitación · Subir un video nuevo a OneDrive o editar sus datos.
// El archivo se sube por partes directo del navegador a OneDrive (Sistema RCMA Doc/Capacitación/<año>/<categoría>);
// la función "capacitacion" solo entrega la URL de carga de ese archivo.
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X, UploadCloud, Loader2, Film, ImagePlus, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { logAudit } from '@/lib/audit';
import {
  CATEGORIAS, accionCapacitacion, subirAOneDrive, leerVideo, imagenAMiniatura,
  leerCapitulos, capitulosATexto, mmss, type Video,
} from '@/lib/capacitacion';

const labelCls = 'text-[11px] font-bold text-slate-500 uppercase';
const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white';
const tamano = (b: number) => b > 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`;

export default function VideoFormModal({ video, miniaturaActual, onClose, onGuardado }: {
  video?: Video | null;                 // null = subir nuevo
  miniaturaActual?: string | null;
  onClose: () => void;
  onGuardado: (v: Video, nuevo: boolean) => void;
}) {
  const nuevo = !video;
  const [archivo, setArchivo] = useState<File | null>(null);
  const [duracion, setDuracion] = useState<number>(video?.duracion_seg ?? 0);
  const [mini, setMini] = useState<Blob | null>(null);
  const [miniUrl, setMiniUrl] = useState<string | null>(miniaturaActual ?? null);
  const [titulo, setTitulo] = useState(video?.titulo ?? '');
  const [categoria, setCategoria] = useState(video?.categoria ?? 'General');
  const [descripcion, setDescripcion] = useState(video?.descripcion ?? '');
  const [capTexto, setCapTexto] = useState(capitulosATexto(video?.capitulos));
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<{ etapa: string; pct: number } | null>(null);
  const inVideo = useRef<HTMLInputElement>(null);
  const inMini = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (miniUrl?.startsWith('blob:')) URL.revokeObjectURL(miniUrl); }, [miniUrl]);
  // Evita cerrar la pestaña a media subida
  useEffect(() => {
    if (!progreso) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [progreso]);

  const ponerMini = (b: Blob | null) => {
    setMini(b);
    setMiniUrl(prev => { if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev); return b ? URL.createObjectURL(b) : (miniaturaActual ?? null); });
  };

  const elegirVideo = async (f?: File | null) => {
    if (!f) return;
    if (!/\.(mp4|m4v|webm|mov)$/i.test(f.name)) { toast.error('El video debe ser MP4 (también acepta M4V, WEBM o MOV)'); return; }
    setArchivo(f); setLeyendo(true);
    if (!titulo) setTitulo(f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim());
    const r = await leerVideo(f);
    setDuracion(r.duracion);
    if (r.miniatura && !mini) ponerMini(r.miniatura);
    setLeyendo(false);
  };

  const elegirMini = async (f?: File | null) => {
    if (!f) return;
    const b = await imagenAMiniatura(f);
    if (!b) { toast.error('No se pudo leer la imagen'); return; }
    ponerMini(b);
  };

  const capitulos = leerCapitulos(capTexto);
  const renglonesMalos = capTexto.split('\n').filter(l => l.trim()).length - capitulos.length;

  const guardar = async () => {
    if (!titulo.trim()) { toast.error('Escribe el título del video'); return; }
    if (nuevo && !archivo) { toast.error('Elige el archivo del video'); return; }
    const anio = String(new Date().getFullYear());
    const base = titulo.trim().replace(/["*:<>?/\\|#%]/g, '-').slice(0, 90);
    try {
      let videoItem: { id: string; name: string } | null = null;
      let carpeta = video?.carpeta ?? null;
      if (archivo) {
        setProgreso({ etapa: 'Subiendo video a OneDrive', pct: 0 });
        const ext = archivo.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '.mp4';
        const s = await accionCapacitacion<{ uploadUrl: string; carpeta: string }>('iniciar_subida',
          { tipo: 'video', nombre: base + ext, tamano: archivo.size, categoria, anio });
        carpeta = s.carpeta;
        videoItem = await subirAOneDrive(s.uploadUrl, archivo, f => setProgreso({ etapa: 'Subiendo video a OneDrive', pct: f }));
      }
      let miniId = video?.miniatura_item_id ?? null;
      if (mini) {
        setProgreso({ etapa: 'Subiendo miniatura', pct: 1 });
        const s = await accionCapacitacion<{ uploadUrl: string; carpeta: string }>('iniciar_subida',
          { tipo: 'miniatura', nombre: `${base} - miniatura.jpg`, tamano: mini.size, categoria: video?.categoria ?? categoria, anio: carpeta?.split('/')[1] ?? anio });
        miniId = (await subirAOneDrive(s.uploadUrl, mini)).id;
      }
      setProgreso({ etapa: 'Guardando', pct: 1 });
      const datos = {
        titulo: titulo.trim(), categoria, descripcion: descripcion.trim() || null, capitulos,
        duracion_seg: duracion ? Math.round(duracion) : video?.duracion_seg ?? null,
        miniatura_item_id: miniId,
        ...(videoItem ? { video_item_id: videoItem.id, video_nombre: videoItem.name, video_tamano: archivo!.size, carpeta } : {}),
      };
      const q = nuevo
        ? supabase.from('capacitacion_videos').insert(datos).select('*').single()
        : supabase.from('capacitacion_videos').update(datos).eq('id', video!.id).select('*').single();
      const { data, error } = await q;
      if (error) throw error;
      logAudit({ accion: nuevo ? 'crear' : 'editar', modulo: 'capacitacion', registro_id: data.id, registro_ref: data.titulo,
        detalle: nuevo ? { carpeta, archivo: videoItem?.name, tamano: archivo?.size } : { cambio: 'Datos del video' } });
      toast.success(nuevo ? 'Video guardado en OneDrive' : 'Cambios guardados');
      onGuardado(data as Video, nuevo);
    } catch (e) {
      toast.error((nuevo ? 'No se pudo subir el video: ' : 'No se pudo guardar: ') + (e as Error).message);
    } finally { setProgreso(null); }
  };

  const ocupado = !!progreso;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-6">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-white rounded-t-xl sticky top-0 z-10">
          <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
            {nuevo ? <UploadCloud className="w-4 h-4 text-slate-500" /> : <Pencil className="w-4 h-4 text-slate-500" />}
            {nuevo ? 'Subir video de Capacitación' : 'Editar video'}
          </h2>
          <button onClick={onClose} disabled={ocupado} className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-[1fr_280px] gap-5 max-h-[74vh] overflow-y-auto">
          <div className="space-y-3">
            {nuevo && (
              <div>
                <label className={labelCls}>Archivo del video *</label>
                <input ref={inVideo} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov" className="hidden"
                  onChange={e => elegirVideo(e.target.files?.[0])} />
                <button type="button" disabled={ocupado} onClick={() => inVideo.current?.click()}
                  onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); elegirVideo(e.dataTransfer.files?.[0]); }}
                  className="mt-1 w-full border-2 border-dashed border-slate-300 rounded-lg p-4 text-left hover:border-slate-500 hover:bg-slate-50 flex items-center gap-3">
                  <Film className="w-8 h-8 text-slate-400 shrink-0" />
                  {archivo ? (
                    <span className="text-sm"><b className="text-slate-800 break-all">{archivo.name}</b>
                      <span className="block text-xs text-slate-500">{tamano(archivo.size)}{duracion ? ` · ${mmss(duracion)} min` : leyendo ? ' · leyendo…' : ''}</span></span>
                  ) : (
                    <span className="text-sm text-slate-500"><b className="text-slate-700">Elige o arrastra el video</b><span className="block text-xs">MP4 exportado de Clipchamp, hasta 4 GB</span></span>
                  )}
                </button>
              </div>
            )}
            <div><label className={labelCls}>Título *</label>
              <input className={inputCls} value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={150} disabled={ocupado} /></div>
            <div><label className={labelCls}>Categoría</label>
              <select className={inputCls} value={categoria} onChange={e => setCategoria(e.target.value)} disabled={ocupado}>
                {[...new Set([...CATEGORIAS, categoria])].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {!nuevo && categoria !== video?.categoria && <p className="text-[11px] text-slate-400 mt-1">El archivo se queda en su carpeta de OneDrive; solo cambia la etiqueta.</p>}
            </div>
            <div><label className={labelCls}>Descripción</label>
              <textarea className={inputCls} rows={4} value={descripcion} onChange={e => setDescripcion(e.target.value)} disabled={ocupado}
                placeholder="Qué aprenderán en este video…" /></div>
            <div><label className={labelCls}>Capítulos <span className="normal-case font-medium text-slate-400">— uno por renglón: minuto y título</span></label>
              <textarea className={`${inputCls} font-mono text-xs`} rows={6} value={capTexto} onChange={e => setCapTexto(e.target.value)} disabled={ocupado}
                placeholder={'0:00 Introducción\n0:24 Solicitud de Proyecto\n1:26 Ticket MAS'} />
              {renglonesMalos > 0 && <p className="text-[11px] text-amber-600 font-semibold mt-1">{renglonesMalos} renglón(es) sin minuto válido no se guardarán (formato: 1:26 Título).</p>}
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelCls}>Miniatura</label>
            <div className="aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-[#00295A] to-[#2563eb] relative">
              {miniUrl ? <img src={miniUrl} alt="" className="w-full h-full object-cover" />
                : <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-white text-sm font-black">{titulo || 'Sin miniatura'}</div>}
              {duracion > 0 && <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{mmss(duracion)}</span>}
            </div>
            <input ref={inMini} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => elegirMini(e.target.files?.[0])} />
            <button type="button" disabled={ocupado} onClick={() => inMini.current?.click()}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
              <ImagePlus className="w-3.5 h-3.5" /> {mini || miniaturaActual ? 'Cambiar miniatura' : 'Subir miniatura'}
            </button>
            <p className="text-[11px] text-slate-400">{nuevo ? 'Si no subes una, se toma un cuadro del video.' : 'Se ajusta sola a 16:9 (1280×720).'}</p>
          </div>
        </div>

        {progreso && (
          <div className="px-5 pb-2">
            <div className="flex justify-between text-[11px] font-bold text-slate-500 uppercase mb-1">
              <span>{progreso.etapa}…</span><span>{Math.round(progreso.pct * 100)}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-[#00295A] transition-all" style={{ width: `${progreso.pct * 100}%` }} /></div>
            <p className="text-[11px] text-slate-400 mt-1">No cierres esta ventana hasta que termine.</p>
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <button onClick={onClose} disabled={ocupado} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">Cancelar</button>
          <button onClick={guardar} disabled={ocupado || leyendo || (nuevo && !archivo)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50">
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            {nuevo ? 'Subir y continuar' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
