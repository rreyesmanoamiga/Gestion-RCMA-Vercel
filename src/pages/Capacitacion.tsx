// ─── Capacitación · "Mano Amiga Tube" ────────────────────────────────────────
// Catálogo de videos para aprender a usar el Sistema RCMA. Los archivos viven en
// OneDrive (Sistema RCMA Doc/Capacitación); aquí: tarjetas, visitas, me gusta y dudas.
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Search, UploadCloud, Eye, ThumbsUp, MessageSquare, CheckCircle2, PlayCircle } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import VideoFormModal from '@/components/capacitacion/VideoFormModal';
import PublicarModal from '@/components/capacitacion/PublicarModal';
import { useVideos, useResumen, useMiniaturas } from '@/components/capacitacion/useCapacitacion';
import { mmss, esNuevo, degradado, type Video, type Resumen } from '@/lib/capacitacion';

export function TarjetaVideo({ v, r, mini, onClick }: { v: Video; r?: Resumen; mini?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-300 group flex flex-col">
      <div className={`relative aspect-video bg-gradient-to-br ${degradado(v.categoria)}`}>
        {mini ? <img src={mini} alt="" loading="lazy" className="w-full h-full object-cover" /> : (
          <>
            <p className="absolute top-3 left-3 text-white/90 text-[10px] font-black tracking-widest uppercase">Sistema RCMA</p>
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <p className="text-white text-lg font-black text-center leading-tight drop-shadow">{v.titulo}</p>
            </div>
          </>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20">
          <PlayCircle className="w-14 h-14 text-white drop-shadow-lg" />
        </div>
        {!!v.duracion_seg && <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] font-bold px-1.5 py-0.5 rounded">{mmss(v.duracion_seg)}</span>}
        {r?.yo_completado ? (
          <span className="absolute bottom-2 left-2 bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Visto</span>
        ) : r?.yo_visto ? (
          <span className="absolute bottom-2 left-2 bg-slate-900/80 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">Empezado</span>
        ) : null}
        {v.estado === 'borrador'
          ? <span className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">Borrador</span>
          : esNuevo(v) && !r?.yo_visto && <span className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">Nuevo</span>}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <span className="self-start text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">{v.categoria}</span>
        <h3 className="font-semibold text-slate-900 mt-2 leading-tight group-hover:text-blue-600 transition-colors">{v.titulo}</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400 uppercase font-semibold mt-auto pt-3 border-t border-slate-50">
          <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" />{r?.visitas ?? 0} visitas</span>
          <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{r?.likes ?? 0}</span>
          <span className="inline-flex items-center gap-1"><MessageSquare className="w-3 h-3" />{r?.comentarios ?? 0}</span>
          {!!r?.sin_responder && <span className="text-amber-600 normal-case">{r.sin_responder} sin responder</span>}
        </div>
      </div>
    </button>
  );
}

export default function Capacitacion() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const gestiona = can('gestionar_capacitacion');
  const { data: videos = [], isLoading, error } = useVideos();
  const { data: resumen = {} } = useResumen();
  const { data: minis = {} } = useMiniaturas(videos.map(v => v.id));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Todos');
  const [subiendo, setSubiendo] = useState(false);
  const [publicar, setPublicar] = useState<Video | null>(null);

  const publicados = videos.filter(v => v.estado === 'publicado');
  const borradores = videos.filter(v => v.estado === 'borrador');
  const categorias = useMemo(() => [...new Set(publicados.map(v => v.categoria))].sort(), [publicados]);
  const sum = (k: 'visitas' | 'likes' | 'sin_responder') => publicados.reduce((a, v) => a + (resumen[v.id]?.[k] ?? 0), 0);
  const pendientes = publicados.filter(v => !resumen[v.id]?.yo_completado).length;

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visibles = videos.filter(v =>
    (cat === 'Todos' ? v.estado === 'publicado' : cat === '__borradores' ? v.estado === 'borrador' : v.estado === 'publicado' && v.categoria === cat) &&
    (!q.trim() || norm(`${v.titulo} ${v.descripcion ?? ''} ${v.categoria} ${(v.capitulos ?? []).map(c => c.titulo).join(' ')}`).includes(norm(q.trim()))));

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['capacitacion_videos'] });
    qc.invalidateQueries({ queryKey: ['capacitacion_resumen'] });
    qc.invalidateQueries({ queryKey: ['capacitacion_miniaturas'] });
  };

  const kpis = [
    { label: 'Videos', value: publicados.length, color: 'text-slate-900' },
    { label: 'Visitas totales', value: sum('visitas'), color: 'text-blue-600' },
    { label: 'Me gusta', value: sum('likes'), color: 'text-rose-600' },
    gestiona
      ? { label: 'Dudas sin responder', value: sum('sin_responder'), color: sum('sin_responder') ? 'text-amber-600' : 'text-emerald-600' }
      : { label: 'Te faltan por ver', value: pendientes, color: pendientes ? 'text-amber-600' : 'text-emerald-600' },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader title="Capacitación" subtitle="Videos para aprender a usar el Sistema RCMA · Mano Amiga Tube" />
        {gestiona && (
          <button onClick={() => setSubiendo(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 transition-all shadow-sm active:scale-95 mt-1">
            <UploadCloud className="w-4 h-4" /> Subir video
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
            <p className={`text-xl font-black ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-slate-700 focus:outline-none bg-white"
            placeholder="Buscar video, tema o capítulo…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['Todos', ...categorias].map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${cat === c ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
              {c}
            </button>
          ))}
          {gestiona && borradores.length > 0 && (
            <button onClick={() => setCat('__borradores')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${cat === '__borradores' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400'}`}>
              Borradores ({borradores.length})
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>
      ) : error ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 text-sm text-slate-500">No se pudieron cargar los videos: {(error as Error).message}</div>
      ) : visibles.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <PlayCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">{videos.length ? 'Ningún video coincide con la búsqueda.' : 'Todavía no hay videos de capacitación.'}</p>
          {gestiona && !videos.length && <button onClick={() => setSubiendo(true)} className="mt-3 text-sm font-bold text-blue-600 hover:underline">Subir el primero</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {visibles.map(v => <TarjetaVideo key={v.id} v={v} r={resumen[v.id]} mini={minis[v.id]} onClick={() => navigate(`/capacitacion/${v.id}`)} />)}
        </div>
      )}

      {subiendo && (
        <VideoFormModal onClose={() => setSubiendo(false)}
          onGuardado={v => { setSubiendo(false); refrescar(); setPublicar(v); }} />
      )}
      {publicar && <PublicarModal video={publicar} onClose={() => { setPublicar(null); refrescar(); }} onPublicado={refrescar} />}
    </div>
  );
}
