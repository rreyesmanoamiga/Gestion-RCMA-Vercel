// ─── Capacitación · Pantalla de un video ─────────────────────────────────────
// Reproductor (el archivo se lee de OneDrive con un link temporal), capítulos,
// me gusta, visitas, comentarios/dudas públicos y, para la Coordinación,
// "Quién lo vio", editar, publicar y eliminar.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, ThumbsUp, Eye, BarChart3, Pencil, Send, Trash2, ExternalLink, Loader2,
  CheckCircle2, RotateCcw, MessageSquareReply, X, Download, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { logAudit } from '@/lib/audit';
import VideoFormModal from '@/components/capacitacion/VideoFormModal';
import PublicarModal from '@/components/capacitacion/PublicarModal';
import { useVideos, useResumen, useMiniaturas } from '@/components/capacitacion/useCapacitacion';
import {
  accionCapacitacion, mmss, partirTiempos, haceCuanto, esNuevo, iniciales, colorAvatar, degradado,
  grupoDe, GRUPOS, type Comentario, type Video, type UsuarioAcceso,
} from '@/lib/capacitacion';

const pill = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition';

// Texto con minutos "1:26" que saltan al punto del video
function TextoConTiempos({ texto, ir }: { texto: string; ir: (s: number) => void }) {
  return <>{partirTiempos(texto).map((p, i) => p.t === 'seg'
    ? <button key={i} type="button" onClick={() => ir(p.seg)} className="font-bold text-blue-600 hover:underline">{p.v}</button>
    : <React.Fragment key={i}>{p.v}</React.Fragment>)}</>;
}

// ════════════════════════════════════════════════════════════════════════════
export default function CapacitacionVideo() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const yo = (user?.email ?? '').toLowerCase();
  const { can } = usePermissions();
  const gestiona = can('gestionar_capacitacion');

  const { data: videos = [], isLoading } = useVideos();
  const { data: resumen = {} } = useResumen();
  const v = videos.find(x => x.id === id) ?? null;
  const r = resumen[id];
  const otros = useMemo(() => {
    const pub = videos.filter(x => x.id !== id && x.estado === 'publicado');
    return [...pub.filter(x => x.categoria === v?.categoria), ...pub.filter(x => x.categoria !== v?.categoria)].slice(0, 8);
  }, [videos, id, v?.categoria]);
  const { data: minis = {} } = useMiniaturas([id, ...otros.map(o => o.id)].filter(Boolean));

  // ── Archivo del video (link temporal de OneDrive) ─────────────────────────
  const { data: fuente, error: errFuente, refetch: refetchFuente } = useQuery({
    queryKey: ['capacitacion_reproducir', id],
    queryFn: () => accionCapacitacion<{ url: string; onedrive: string | null }>('reproducir', { video_id: id }),
    enabled: !!v?.video_item_id,
    staleTime: 40 * 60 * 1000, gcTime: 45 * 60 * 1000, retry: 1,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const ir = useCallback((s: number) => {
    const el = videoRef.current; if (!el) return;
    el.currentTime = s; el.play().catch(() => {});
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // ── Visitas: cuenta a partir de 10 s reproducidos; guarda hasta dónde llegó ──
  const vista = useRef({ acumulado: 0, ultimo: 0, registrada: false, maximo: 0, completado: false });
  const guardarVista = useCallback((nueva = false) => {
    const s = vista.current; const el = videoRef.current;
    if (!s.registrada && !nueva) return;
    const dur = el?.duration && isFinite(el.duration) ? el.duration : v?.duracion_seg ?? 0;
    s.completado = s.completado || (dur > 0 && s.maximo >= dur * 0.9);
    supabase.rpc('capacitacion_registrar_vista', { p_video: id, p_segundos: Math.round(s.maximo), p_nueva: nueva, p_completado: s.completado })
      .then(({ error }) => { if (!error) qc.invalidateQueries({ queryKey: ['capacitacion_resumen'] }); });
  }, [id, v?.duracion_seg, qc]);
  useEffect(() => {
    vista.current = { acumulado: 0, ultimo: 0, registrada: false, maximo: 0, completado: false };
    return () => { guardarVista(false); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const alAvanzar = () => {
    const el = videoRef.current; if (!el) return;
    const s = vista.current;
    const d = el.currentTime - s.ultimo;
    if (d > 0 && d < 2) s.acumulado += d;          // solo lo que de verdad se reprodujo (no saltos)
    s.ultimo = el.currentTime;
    s.maximo = Math.max(s.maximo, el.currentTime);
    if (!s.registrada && s.acumulado >= 10) { s.registrada = true; guardarVista(true); }
  };

  // Si el link temporal venció (pestaña abierta mucho tiempo), se pide otro y se sigue donde iba
  const reintento = useRef(false);
  const alFallar = async () => {
    if (reintento.current) return;
    reintento.current = true;
    const t = videoRef.current?.currentTime ?? 0;
    await refetchFuente();
    setTimeout(() => { const el = videoRef.current; if (el) { el.currentTime = t; } reintento.current = false; }, 400);
  };

  // ── Me gusta ──────────────────────────────────────────────────────────────
  const [likeOcupado, setLikeOcupado] = useState(false);
  const toggleLike = async () => {
    if (likeOcupado || !v) return;
    setLikeOcupado(true);
    const { error } = r?.yo_like
      ? await supabase.from('capacitacion_likes').delete().eq('video_id', id).eq('user_email', yo)
      : await supabase.from('capacitacion_likes').insert({ video_id: id });
    setLikeOcupado(false);
    if (error) { toast.error('No se pudo registrar: ' + error.message); return; }
    qc.invalidateQueries({ queryKey: ['capacitacion_resumen'] });
  };

  // ── Coordinación ──────────────────────────────────────────────────────────
  const [editar, setEditar] = useState(false);
  const [publicar, setPublicar] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [quien, setQuien] = useState(false);
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['capacitacion_videos'] });
    qc.invalidateQueries({ queryKey: ['capacitacion_resumen'] });
    qc.invalidateQueries({ queryKey: ['capacitacion_miniaturas'] });
  };
  const eliminar = async () => {
    if (!v) return;
    setBorrando(true);
    try {
      await accionCapacitacion('eliminar', { video_id: v.id });
      logAudit({ accion: 'eliminar', modulo: 'capacitacion', registro_id: v.id, registro_ref: v.titulo, detalle: { carpeta: v.carpeta, archivo: v.video_nombre } });
      toast.success('Video eliminado');
      refrescar();
      navigate('/capacitacion');
    } catch (e) { toast.error('No se pudo eliminar: ' + (e as Error).message); setBorrando(false); }
  };

  if (isLoading) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;
  if (!v) return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
        <p className="text-sm text-slate-500">Este video no existe o ya no está disponible.</p>
        <Link to="/capacitacion" className="mt-3 inline-block text-sm font-bold text-blue-600 hover:underline">Ir a Capacitación</Link>
      </div>
    </div>
  );

  const poster = minis[id];

  return (
    <div className="max-w-7xl mx-auto p-4">
      <Link to="/capacitacion" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 mb-3"><ArrowLeft className="w-3.5 h-3.5" /> Capacitación</Link>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        <div className="min-w-0">
          {/* Reproductor */}
          <div className={`relative rounded-xl overflow-hidden bg-black aspect-video ${!fuente ? `bg-gradient-to-br ${degradado(v.categoria)}` : ''}`}>
            {fuente?.url ? (
              <video ref={videoRef} src={fuente.url} poster={poster} controls playsInline preload="metadata"
                className="w-full h-full bg-black" controlsList="nodownload" onContextMenu={e => e.preventDefault()}
                onTimeUpdate={alAvanzar} onPause={() => guardarVista(false)} onEnded={() => guardarVista(false)} onError={alFallar} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 p-6 text-center">
                {poster && <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />}
                {errFuente ? (
                  <span className="relative text-sm font-semibold inline-flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> No se pudo cargar el video: {(errFuente as Error).message}</span>
                ) : !v.video_item_id ? (
                  <span className="relative text-sm font-semibold">Este video todavía no tiene archivo.</span>
                ) : (
                  <Loader2 className="relative w-10 h-10 animate-spin" />
                )}
              </div>
            )}
          </div>

          {/* Encabezado */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">{v.categoria}</span>
            {v.estado === 'borrador' && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase">Borrador · solo tú lo ves</span>}
            {v.estado === 'publicado' && esNuevo(v) && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">Nuevo</span>}
            {r?.yo_completado && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white uppercase inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Ya lo viste</span>}
          </div>
          <h1 className="text-xl font-black text-slate-900 mt-2 leading-tight">{v.titulo}</h1>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#00295A] text-white font-black flex items-center justify-center text-sm">RR</div>
              <div>
                <p className="text-sm font-bold text-slate-900">Coordinación de Obras y Mantenimiento</p>
                <p className="text-xs text-slate-500">{v.publicado_at ? `Publicado el ${new Date(v.publicado_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Sin publicar'}{v.duracion_seg ? ` · ${mmss(v.duracion_seg)} min` : ''}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={toggleLike} disabled={likeOcupado}
                className={`${pill} ${r?.yo_like ? 'bg-slate-900 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                <ThumbsUp className={`w-4 h-4 ${r?.yo_like ? 'fill-white' : ''}`} /> Me gusta · {r?.likes ?? 0}
              </button>
              <span className={`${pill} bg-white border border-slate-300 text-slate-700`}><Eye className="w-4 h-4" /> {r?.visitas ?? 0} visitas</span>
              {gestiona && <button onClick={() => setQuien(true)} className={`${pill} bg-white border border-slate-300 text-slate-700 hover:bg-slate-50`}><BarChart3 className="w-4 h-4" /> Quién lo vio</button>}
            </div>
          </div>

          {gestiona && (
            <div className="flex flex-wrap gap-2 mt-3">
              {v.estado === 'borrador' && <button onClick={() => setPublicar(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800"><Send className="w-3.5 h-3.5" /> Publicar y avisar</button>}
              {v.estado === 'publicado' && <button onClick={() => setPublicar(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"><Send className="w-3.5 h-3.5" /> Volver a avisar</button>}
              <button onClick={() => setEditar(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"><Pencil className="w-3.5 h-3.5" /> Editar</button>
              {fuente?.onedrive && <a href={fuente.onedrive} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50"><ExternalLink className="w-3.5 h-3.5" /> Abrir en OneDrive</a>}
              <button onClick={() => setBorrar(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 rounded-lg text-xs font-bold text-red-700 hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" /> Eliminar</button>
              {v.aviso_enviado_at && <span className="text-[11px] text-slate-400 self-center">Aviso enviado {haceCuanto(v.aviso_enviado_at)} a {v.aviso_total ?? 0} personas</span>}
            </div>
          )}

          {/* Descripción y capítulos */}
          {(v.descripcion || (v.capitulos ?? []).length > 0) && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 mt-4 text-sm text-slate-700">
              {v.descripcion && <p className="whitespace-pre-line"><TextoConTiempos texto={v.descripcion} ir={ir} /></p>}
              {(v.capitulos ?? []).length > 0 && (
                <>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-3 mb-1">Capítulos</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                    {v.capitulos.map((c, i) => (
                      <button key={i} type="button" onClick={() => ir(c.seg)} className="text-left hover:bg-slate-50 rounded px-1 -mx-1">
                        <b className="text-blue-600">{mmss(c.seg)}</b> {c.titulo}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <Comentarios videoId={id} titulo={v.titulo} yo={yo} gestiona={gestiona} ir={ir} />
        </div>

        {/* Más videos */}
        <aside>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Más videos</p>
          {otros.length === 0 ? <p className="text-xs text-slate-400">Pronto habrá más videos.</p> : (
            <div className="space-y-3">
              {otros.map(o => (
                <button key={o.id} onClick={() => navigate(`/capacitacion/${o.id}`)} className="flex gap-3 text-left w-full group">
                  <div className={`w-40 aspect-video rounded-lg shrink-0 relative overflow-hidden bg-gradient-to-br ${degradado(o.categoria)}`}>
                    {minis[o.id] && <img src={minis[o.id]} alt="" loading="lazy" className="w-full h-full object-cover" />}
                    {!!o.duracion_seg && <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-bold px-1 rounded">{mmss(o.duracion_seg)}</span>}
                    {resumen[o.id]?.yo_completado && <span className="absolute bottom-1 left-1 bg-emerald-600 text-white rounded p-0.5"><CheckCircle2 className="w-3 h-3" /></span>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-tight group-hover:text-blue-600 line-clamp-3">{o.titulo}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{o.categoria}</p>
                    <p className="text-[11px] text-slate-400">{resumen[o.id]?.visitas ?? 0} visitas</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      {editar && <VideoFormModal video={v} miniaturaActual={poster} onClose={() => setEditar(false)} onGuardado={() => { setEditar(false); refrescar(); }} />}
      {publicar && <PublicarModal video={v} onClose={() => setPublicar(false)} onPublicado={refrescar} />}
      {quien && <QuienLoVio video={v} onClose={() => setQuien(false)} />}
      {borrar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
            <h3 className="text-base font-black text-slate-800 flex items-center gap-2"><Trash2 className="w-4 h-4 text-red-600" /> Eliminar video</h3>
            <p className="text-sm text-slate-600 mt-2">Se borra <b>{v.titulo}</b> de OneDrive (video y miniatura) junto con sus visitas, me gusta y comentarios. No se puede deshacer.</p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setBorrar(false)} disabled={borrando} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={eliminar} disabled={borrando} className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                {borrando && <Loader2 className="w-4 h-4 animate-spin" />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Comentarios y dudas (públicos)
function Comentarios({ videoId, titulo, yo, gestiona, ir }: { videoId: string; titulo: string; yo: string; gestiona: boolean; ir: (s: number) => void }) {
  const qc = useQueryClient();
  const clave = ['capacitacion_comentarios', videoId];
  const { data, isLoading } = useQuery({
    queryKey: clave,
    queryFn: async () => {
      const { data: cs, error } = await supabase.from('capacitacion_comentarios').select('*').eq('video_id', videoId).order('created_at');
      if (error) throw error;
      const ids = (cs ?? []).map(c => c.id);
      const { data: ls } = ids.length
        ? await supabase.from('capacitacion_comentario_likes').select('comentario_id, user_email').in('comentario_id', ids)
        : { data: [] as { comentario_id: string; user_email: string }[] };
      return { comentarios: (cs ?? []) as Comentario[], likes: (ls ?? []) as { comentario_id: string; user_email: string }[] };
    },
  });
  const comentarios = data?.comentarios ?? [];
  const likes = data?.likes ?? [];
  const [filtro, setFiltro] = useState<'todos' | 'pendientes'>('todos');
  const [texto, setTexto] = useState('');
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEdit, setTextoEdit] = useState('');
  const [enviando, setEnviando] = useState(false);

  const principales = comentarios.filter(c => !c.parent_id).reverse();          // los más nuevos arriba
  const respuestasDe = (id: string) => comentarios.filter(c => c.parent_id === id);
  const pendiente = (c: Comentario) => !c.es_coordinacion && !c.resuelta && !respuestasDe(c.id).some(x => x.es_coordinacion);
  const lista = filtro === 'pendientes' ? principales.filter(pendiente) : principales;
  const nPend = principales.filter(pendiente).length;

  // Llegar desde el correo: #c-<id>
  useEffect(() => {
    const h = window.location.hash;
    if (!h.startsWith('#c-') || !comentarios.length) return;
    const el = document.getElementById(h.slice(1));
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('ring-2', 'ring-amber-300'); setTimeout(() => el.classList.remove('ring-2', 'ring-amber-300'), 3000); }
  }, [comentarios.length]);

  const refrescar = () => { qc.invalidateQueries({ queryKey: clave }); qc.invalidateQueries({ queryKey: ['capacitacion_resumen'] }); };

  const enviar = async (t: string, parent: string | null) => {
    const limpio = t.trim();
    if (!limpio) return false;
    setEnviando(true);
    const { data: c, error } = await supabase.from('capacitacion_comentarios').insert({ video_id: videoId, parent_id: parent, texto: limpio.slice(0, 2000) }).select('id').single();
    setEnviando(false);
    if (error) { toast.error('No se pudo publicar el comentario: ' + error.message); return false; }
    accionCapacitacion('comentario', { comentario_id: c.id }).catch(() => { /* el aviso por correo no detiene nada */ });
    logAudit({ accion: 'crear', modulo: 'capacitacion', registro_id: c.id, registro_ref: titulo, detalle: { cambio: parent ? 'Respuesta' : 'Comentario', texto: limpio.slice(0, 200) } });
    refrescar();
    return true;
  };

  const actualizar = async (id: string, cambios: Partial<Comentario>, ok: string) => {
    const { error } = await supabase.from('capacitacion_comentarios').update(cambios).eq('id', id);
    if (error) { toast.error('No se pudo guardar: ' + error.message); return; }
    toast.success(ok); refrescar();
  };
  const borrar = async (c: Comentario) => {
    if (!window.confirm(c.parent_id ? '¿Eliminar esta respuesta?' : '¿Eliminar este comentario y sus respuestas?')) return;
    const { error } = await supabase.from('capacitacion_comentarios').delete().eq('id', c.id);
    if (error) { toast.error('No se pudo eliminar: ' + error.message); return; }
    if (c.user_email !== yo) logAudit({ accion: 'eliminar', modulo: 'capacitacion', registro_id: c.id, registro_ref: titulo, detalle: { cambio: 'Comentario de otro usuario', autor: c.user_email, texto: c.texto.slice(0, 200) } });
    refrescar();
  };
  const toggleLike = async (c: Comentario) => {
    const mio = likes.some(l => l.comentario_id === c.id && l.user_email === yo);
    const { error } = mio
      ? await supabase.from('capacitacion_comentario_likes').delete().eq('comentario_id', c.id).eq('user_email', yo)
      : await supabase.from('capacitacion_comentario_likes').insert({ comentario_id: c.id });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: clave });
  };

  // Se dibuja como función (no como componente) para que los cuadros de texto no pierdan el foco al escribir
  const item = (c: Comentario, esResp = false) => {
    const nLikes = likes.filter(l => l.comentario_id === c.id).length;
    const mio = likes.some(l => l.comentario_id === c.id && l.user_email === yo);
    const resp = respuestasDe(c.id);
    return (
      <div id={`c-${c.id}`} className={`flex gap-3 rounded-lg transition ${esResp ? '' : 'p-1 -m-1'}`}>
        <div className={`${esResp ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'} rounded-full text-white font-black flex items-center justify-center shrink-0 ${c.es_coordinacion ? 'bg-[#00295A]' : colorAvatar(c.user_email)}`}>{iniciales(c.user_nombre)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <b className="text-slate-900">{c.user_nombre ?? c.user_email}</b>
            {c.es_coordinacion
              ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#00295A] text-white uppercase">Respuesta de la Coordinación</span>
              : <span className="text-slate-400">{[c.user_puesto, c.user_colegio].filter(Boolean).join(' · ')}</span>}
            <span className="text-slate-400">· {haceCuanto(c.created_at)}{c.editado_at ? ' (editado)' : ''}</span>
            {!esResp && !c.es_coordinacion && (c.resuelta || resp.some(x => x.es_coordinacion)
              ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">{c.resuelta ? 'Resuelta' : 'Respondida'}</span>
              : <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase">Sin responder</span>)}
          </p>
          {editando === c.id ? (
            <div className="mt-1 space-y-2">
              <textarea className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none" rows={3} value={textoEdit} onChange={e => setTextoEdit(e.target.value)} maxLength={2000} />
              <div className="flex gap-2">
                <button onClick={async () => { if (!textoEdit.trim()) return; await actualizar(c.id, { texto: textoEdit.trim() }, 'Comentario editado'); setEditando(null); }} className="px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-bold">Guardar</button>
                <button onClick={() => setEditando(null)} className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700">Cancelar</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-line break-words"><TextoConTiempos texto={c.texto} ir={ir} /></p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-bold text-slate-500">
            <button onClick={() => toggleLike(c)} className={`inline-flex items-center gap-1 hover:text-slate-800 ${mio ? 'text-slate-900' : ''}`}><ThumbsUp className={`w-3.5 h-3.5 ${mio ? 'fill-slate-900' : ''}`} />{nLikes || ''}</button>
            {!esResp && <button onClick={() => { setRespondiendo(respondiendo === c.id ? null : c.id); setRespuesta(''); }} className="inline-flex items-center gap-1 hover:text-slate-800"><MessageSquareReply className="w-3.5 h-3.5" /> Responder</button>}
            {c.user_email === yo && editando !== c.id && <button onClick={() => { setEditando(c.id); setTextoEdit(c.texto); }} className="hover:text-slate-800">Editar</button>}
            {gestiona && !esResp && !c.es_coordinacion && (c.resuelta
              ? <button onClick={() => actualizar(c.id, { resuelta: false }, 'Duda reabierta')} className="inline-flex items-center gap-1 hover:text-slate-800"><RotateCcw className="w-3 h-3" /> Reabrir</button>
              : <button onClick={() => actualizar(c.id, { resuelta: true }, 'Duda marcada como resuelta')} className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900"><CheckCircle2 className="w-3.5 h-3.5" /> Marcar resuelta</button>)}
            {(c.user_email === yo || gestiona) && <button onClick={() => borrar(c)} className="text-red-500 hover:text-red-700">Eliminar</button>}
          </div>

          {(resp.length > 0 || respondiendo === c.id) && (
            <div className="mt-3 space-y-3">
              {resp.map(x => (
                <div key={x.id} className={x.es_coordinacion ? 'pl-4 border-l-4 border-[#00295A] bg-blue-50/60 rounded-r-lg p-3' : 'pl-4 border-l-2 border-slate-200'}>
                  {item(x, true)}
                </div>
              ))}
              {respondiendo === c.id && (
                <div className="pl-4 border-l-2 border-slate-200 space-y-2">
                  <textarea autoFocus className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none" rows={2}
                    placeholder={gestiona ? 'Responde como Coordinación…' : 'Escribe tu respuesta…'} value={respuesta} onChange={e => setRespuesta(e.target.value)} maxLength={2000} />
                  <div className="flex gap-2">
                    <button disabled={enviando || !respuesta.trim()} onClick={async () => { if (await enviar(respuesta, c.id)) { setRespondiendo(null); setRespuesta(''); } }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-bold disabled:opacity-50">{enviando && <Loader2 className="w-3 h-3 animate-spin" />} Responder</button>
                    <button onClick={() => setRespondiendo(null)} className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700">Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">Comentarios y dudas</h2>
        <span className="text-xs text-slate-400">· {comentarios.length}</span>
        <span className="ml-auto flex gap-1">
          <button onClick={() => setFiltro('todos')} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${filtro === 'todos' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>Todos</button>
          <button onClick={() => setFiltro('pendientes')} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${filtro === 'pendientes' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200'}`}>Sin responder{nPend ? ` (${nPend})` : ''}</button>
        </span>
      </div>

      <div className="flex gap-3 mb-5">
        <div className={`w-9 h-9 rounded-full text-white font-black text-xs flex items-center justify-center shrink-0 ${gestiona ? 'bg-[#00295A]' : colorAvatar(yo)}`}>{iniciales(yo.split('@')[0].replace(/[._]/g, ' '))}</div>
        <div className="flex-1">
          <textarea className="w-full px-0 py-2 border-0 border-b-2 border-slate-300 focus:border-slate-800 text-sm focus:outline-none bg-transparent resize-none" rows={texto ? 3 : 1}
            placeholder="Escribe un comentario o una duda… (puedes citar un minuto, ej. 1:26)" value={texto} onChange={e => setTexto(e.target.value)} maxLength={2000} />
          {texto.trim() && (
            <div className="flex justify-end gap-2 mt-2">
              <button onClick={() => setTexto('')} className="px-3 py-1.5 border border-slate-300 rounded-md text-xs font-medium text-slate-700">Cancelar</button>
              <button disabled={enviando} onClick={async () => { if (await enviar(texto, null)) { setTexto(''); toast.success(gestiona ? 'Comentario publicado' : 'Comentario publicado · la Coordinación recibió el aviso'); } }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-bold disabled:opacity-50">{enviando && <Loader2 className="w-3 h-3 animate-spin" />} Comentar</button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        : lista.length === 0 ? <p className="text-sm text-slate-400 py-4">{filtro === 'pendientes' ? 'No hay dudas sin responder.' : 'Sé el primero en comentar.'}</p>
        : <div className="space-y-5">{lista.map(c => <React.Fragment key={c.id}>{item(c)}</React.Fragment>)}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Quién lo vio (solo Coordinación): usuarios de Accesos con @manoamiga.edu.mx
function QuienLoVio({ video, onClose }: { video: Video; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['capacitacion_quien', video.id],
    queryFn: async () => {
      const [u, x] = await Promise.all([
        supabase.from('user_permissions').select('user_email, nombre, puesto, colegio, area'),
        supabase.from('capacitacion_vistas').select('*').eq('video_id', video.id),
      ]);
      if (u.error) throw u.error;
      if (x.error) throw x.error;
      const vistas = Object.fromEntries((x.data ?? []).map(r => [String(r.user_email).toLowerCase(), r]));
      return ((u.data ?? []) as UsuarioAcceso[])
        .map(p => ({ ...p, user_email: String(p.user_email ?? '').trim().toLowerCase() }))
        .filter(p => p.user_email.endsWith('@manoamiga.edu.mx'))
        .map(p => ({ ...p, vista: vistas[p.user_email] as { reproducciones: number; segundos_max: number; completado: boolean; ultima_at: string } | undefined }));
    },
  });
  const [filtro, setFiltro] = useState<'todos' | 'si' | 'no'>('todos');
  const filas = (data ?? [])
    .filter(p => filtro === 'todos' || (filtro === 'si' ? !!p.vista : !p.vista))
    .sort((a, b) => (a.colegio ?? '').localeCompare(b.colegio ?? '') || (a.nombre ?? '').localeCompare(b.nombre ?? ''));
  const vieron = (data ?? []).filter(p => p.vista).length;
  const completo = (data ?? []).filter(p => p.vista?.completado).length;
  const dur = video.duracion_seg ?? 0;
  const estado = (p: (typeof filas)[number]) => !p.vista ? 'No lo ha visto'
    : p.vista.completado ? 'Completo' : `Lo empezó (${dur ? Math.min(99, Math.round(p.vista.segundos_max / dur * 100)) : 0}%)`;
  const grupo = (p: UsuarioAcceso) => GRUPOS.find(g => g.k === grupoDe(p))?.label ?? '';

  const excel = async () => {
    const mod: any = await import('exceljs'); const ExcelJS = mod.default ?? mod;
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Quién lo vio', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [{ header: 'Nombre', width: 34 }, { header: 'Puesto', width: 32 }, { header: 'Grupo', width: 28 }, { header: 'Colegio', width: 18 },
      { header: 'Correo', width: 34 }, { header: 'Estatus', width: 20 }, { header: 'Reproducciones', width: 14 }, { header: 'Última vez', width: 20 }];
    filas.forEach(p => ws.addRow([p.nombre ?? '', p.puesto ?? '', grupo(p), p.colegio ?? '', p.user_email, estado(p), p.vista?.reproducciones ?? 0,
      p.vista ? new Date(p.vista.ultima_at).toLocaleString('es-MX') : '']));
    ws.getRow(1).eachCell((cell: any) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00295A' } }; });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = `Quien lo vio - ${video.titulo.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-6">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quién lo vio</p>
            <h2 className="text-base font-black text-slate-800">{video.titulo}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[{ l: 'Usuarios', v: data?.length ?? 0, c: 'text-slate-900' }, { l: 'Lo vieron', v: vieron, c: 'text-blue-600' }, { l: 'Completo', v: completo, c: 'text-emerald-600' }].map(k => (
              <div key={k.l} className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{k.l}</p><p className={`text-xl font-black ${k.c}`}>{k.v}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([['todos', 'Todos'], ['si', 'Lo vieron'], ['no', 'No lo han visto']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFiltro(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filtro === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>{l}</button>
            ))}
            <button onClick={excel} disabled={!filas.length} className="ml-auto inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"><Download className="w-3.5 h-3.5" /> Excel</button>
          </div>
          {isLoading ? <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : (
            <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-2">Nombre</th><th className="px-3 py-2">Colegio</th><th className="px-3 py-2">Estatus</th><th className="px-3 py-2 text-right">Reprod.</th><th className="px-3 py-2">Última vez</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filas.map(p => (
                    <tr key={p.user_email}>
                      <td className="px-3 py-2"><p className="font-semibold text-slate-800">{p.nombre || p.user_email}</p><p className="text-[11px] text-slate-400">{p.puesto}</p></td>
                      <td className="px-3 py-2 text-xs text-slate-600">{p.colegio ?? '—'}</td>
                      <td className="px-3 py-2"><span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase border ${!p.vista ? 'bg-slate-50 text-slate-500 border-slate-200' : p.vista.completado ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{estado(p)}</span></td>
                      <td className="px-3 py-2 text-right text-xs text-slate-600">{p.vista?.reproducciones ?? 0}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{p.vista ? haceCuanto(p.vista.ultima_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
