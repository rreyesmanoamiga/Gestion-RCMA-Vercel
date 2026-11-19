// ─── Capacitación · "Mano Amiga Tube" ────────────────────────────────────────
// Los videos y miniaturas viven en OneDrive (Sistema RCMA Doc/Capacitación/<año>/<categoría>).
// Todo lo de OneDrive pasa por la función "capacitacion"; aquí van tipos y utilerías.
import { supabase } from '@/lib/supabaseClient';

export const CATEGORIAS = [
  'General',
  'Solicitud de Proyecto',
  'Ticket MAS',
  'Proyectos',
  'Calendario y Mantenimiento',
  'Minutas',
  'Directorio',
  'Cumplimiento Normativo',
  'Programa SOL',
] as const;

export interface Capitulo { seg: number; titulo: string }

export interface Video {
  id: string;
  titulo: string;
  descripcion: string | null;
  categoria: string;
  capitulos: Capitulo[];
  duracion_seg: number | null;
  carpeta: string | null;
  video_item_id: string | null;
  video_nombre: string | null;
  video_tamano: number | null;
  miniatura_item_id: string | null;
  estado: 'borrador' | 'publicado';
  publicado_at: string | null;
  aviso_enviado_at: string | null;
  aviso_total: number | null;
  created_by: string | null;
  created_at: string;
}

export interface Resumen {
  video_id: string; visitas: number; espectadores: number; likes: number;
  comentarios: number; sin_responder: number;
  yo_visto: boolean; yo_completado: boolean; yo_like: boolean;
}

export interface Comentario {
  id: string; video_id: string; parent_id: string | null;
  user_email: string; user_nombre: string | null; user_puesto: string | null; user_colegio: string | null;
  texto: string; es_coordinacion: boolean; resuelta: boolean;
  created_at: string; editado_at: string | null;
}

/** Llama a la función "capacitacion" y devuelve el mensaje de error legible */
export async function accionCapacitacion<T = any>(accion: string, datos: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('capacitacion', { body: { accion, ...datos } });
  if (error) {
    let msg = error.message;
    try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

/** 0:00 · 3:08 · 1:02:15 */
export const mmss = (s?: number | null) => {
  if (s == null || !isFinite(s) || s < 0) return '0:00';
  const t = Math.floor(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};

/** "1:26" → 86 · "1:02:15" → 3735 */
export const aSegundos = (t: string) => {
  const p = t.split(':').map(Number);
  if (p.some(n => isNaN(n))) return null;
  return p.reduce((acc, n) => acc * 60 + n, 0);
};

/** Capítulos escritos uno por renglón: "0:24 Solicitud de Proyecto" */
export const leerCapitulos = (texto: string): Capitulo[] =>
  texto.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = /^(\d{1,2}(?::\d{2}){1,2})\s*[-–—·.]?\s*(.+)$/.exec(l);
    if (!m) return null;
    const seg = aSegundos(m[1]);
    return seg == null ? null : { seg, titulo: m[2].trim() };
  }).filter((c): c is Capitulo => !!c).sort((a, b) => a.seg - b.seg);

export const capitulosATexto = (c: Capitulo[] = []) => c.map(x => `${mmss(x.seg)} ${x.titulo}`).join('\n');

/** Partes de un texto con tiempos "1:26" convertidos en botones para saltar al minuto */
export const partirTiempos = (texto: string) => {
  const out: ({ t: 'txt'; v: string } | { t: 'seg'; v: string; seg: number })[] = [];
  const re = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;
  let i = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    if (m.index > i) out.push({ t: 'txt', v: texto.slice(i, m.index) });
    const seg = aSegundos(m[1]);
    out.push(seg == null ? { t: 'txt', v: m[1] } : { t: 'seg', v: m[1], seg });
    i = m.index + m[0].length;
  }
  if (i < texto.length) out.push({ t: 'txt', v: texto.slice(i) });
  return out;
};

export const haceCuanto = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) { const d = Math.floor(s / 86400); return `hace ${d} día${d > 1 ? 's' : ''}`; }
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const esNuevo = (v: Pick<Video, 'publicado_at'>) =>
  !!v.publicado_at && Date.now() - new Date(v.publicado_at).getTime() < 14 * 86400 * 1000;

export const iniciales = (n?: string | null) =>
  (n ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('') || '?';

const COLORES_AVATAR = ['bg-amber-500', 'bg-violet-500', 'bg-teal-600', 'bg-rose-500', 'bg-sky-600', 'bg-emerald-600', 'bg-orange-500', 'bg-indigo-500'];
export const colorAvatar = (s: string) => COLORES_AVATAR[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES_AVATAR.length];

// Degradados para tarjetas sin miniatura, por categoría
const DEGRADADOS: Record<string, string> = {
  'General': 'from-[#00295A] to-[#2563eb]',
  'Solicitud de Proyecto': 'from-teal-700 to-teal-400',
  'Ticket MAS': 'from-red-700 to-orange-500',
  'Proyectos': 'from-blue-700 to-blue-400',
  'Calendario y Mantenimiento': 'from-violet-700 to-purple-400',
  'Minutas': 'from-slate-700 to-slate-500',
  'Directorio': 'from-cyan-700 to-cyan-400',
  'Cumplimiento Normativo': 'from-emerald-700 to-emerald-400',
  'Programa SOL': 'from-amber-700 to-yellow-400',
};
export const degradado = (cat: string) => DEGRADADOS[cat] ?? 'from-slate-700 to-slate-500';

// ─── Subida a OneDrive en partes (múltiplo de 320 KiB, como pide OneDrive) ───
const CHUNK = 16 * 320 * 1024; // 5 MB
export async function subirAOneDrive(uploadUrl: string, archivo: Blob, alAvanzar?: (fraccion: number) => void): Promise<{ id: string; name: string }> {
  let ultimo: any = null;
  for (let inicio = 0; inicio < archivo.size; inicio += CHUNK) {
    const fin = Math.min(inicio + CHUNK, archivo.size);
    let intento = 0;
    for (;;) {
      try {
        const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${inicio}-${fin - 1}/${archivo.size}` }, body: archivo.slice(inicio, fin) });
        if (!res.ok && res.status !== 202) throw new Error(`OneDrive respondió ${res.status}`);
        if (res.status === 200 || res.status === 201) ultimo = await res.json();
        break;
      } catch (e) {
        if (++intento >= 3) throw e;          // reintenta una parte hasta 3 veces (internet inestable)
        await new Promise(r => setTimeout(r, 1500 * intento));
      }
    }
    alAvanzar?.(fin / archivo.size);
  }
  if (!ultimo?.id) throw new Error('OneDrive no confirmó el archivo');
  return { id: ultimo.id, name: ultimo.name };
}

// ─── Video local: duración y un cuadro como miniatura ────────────────────────
export function leerVideo(archivo: File): Promise<{ duracion: number; miniatura: Blob | null }> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(archivo);
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = url;
    let duracion = 0;
    const terminar = (mini: Blob | null) => { URL.revokeObjectURL(url); resolve({ duracion, miniatura: mini }); };
    v.onerror = () => terminar(null);
    v.onloadedmetadata = () => {
      duracion = isFinite(v.duration) ? v.duration : 0;
      v.currentTime = Math.min(3, duracion / 3 || 0);
    };
    v.onseeked = async () => terminar(await cuadroAJpeg(v, v.videoWidth, v.videoHeight));
    setTimeout(() => terminar(null), 15000);
  });
}

/** Ajusta cualquier imagen a 1280×720 (16:9, recortando al centro) en JPEG */
export function imagenAMiniatura(archivo: File): Promise<Blob | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = async () => { const b = await cuadroAJpeg(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); resolve(b); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function cuadroAJpeg(fuente: CanvasImageSource, w: number, h: number): Promise<Blob | null> {
  if (!w || !h) return Promise.resolve(null);
  const W = 1280, H = 720;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); if (!ctx) return Promise.resolve(null);
  const escala = Math.max(W / w, H / h);
  const dw = w * escala, dh = h * escala;
  ctx.fillStyle = '#00295A'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(fuente, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return new Promise(r => c.toBlob(b => r(b), 'image/jpeg', 0.85));
}

// ─── Destinatarios del aviso (usuarios de Accesos con @manoamiga.edu.mx) ─────
export interface UsuarioAcceso { user_email: string; nombre: string | null; puesto: string | null; colegio: string | null; area: string | null }
export type Grupo = 'dn' | 'car' | 'admin' | 'aux' | 'otros';
export const GRUPOS: { k: Grupo; label: string }[] = [
  { k: 'dn',    label: 'Dirección Nacional' },
  { k: 'car',   label: 'Coordinadores Administrativos Regionales (CAR)' },
  { k: 'admin', label: 'Administradores' },
  { k: 'aux',   label: 'Auxiliares Administrativos' },
  { k: 'otros', label: 'Otros' },
];
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const grupoDe = (u: UsuarioAcceso): Grupo => {
  const p = sinAcentos(u.puesto ?? '');
  if (/director(a)? nacional/.test(p)) return 'dn';
  if (/coordinador(a)? administrativ[oa] regional/.test(p) || /^car\b/.test(p) || u.area === 'car') return 'car';
  if (/^aux/.test(p)) return 'aux';
  if (/^adm/.test(p)) return 'admin';
  return 'otros';
};
export const esGerenteFinanzas = (u: UsuarioAcceso) => /gerente.*finanzas/.test(sinAcentos(u.puesto ?? ''));
