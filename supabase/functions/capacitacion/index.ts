// ============================================================================
// capacitacion — "Mano Amiga Tube": videos de Capacitación del Sistema RCMA
//
// Los videos y sus miniaturas viven en el OneDrive de la Coordinación:
//   Sistema RCMA Doc/Capacitación/<año>/<categoría>/
// El catálogo, visitas, me gusta y comentarios están en Supabase (capacitacion_*).
// La llave de Microsoft nunca sale de aquí: el navegador solo recibe la URL de
// carga de SU archivo o un link temporal (≈1 h) para reproducirlo.
// Todas las acciones exigen sesión.
//
// Acciones (body JSON { accion, ... }):
//   iniciar_subida  { tipo: 'video'|'miniatura', nombre, tamano, categoria, anio }  (gestionar)
//   reproducir      { video_id }                     → { url }            (ver)
//   miniaturas      { ids: string[] }                → { urls: {id:url} } (ver)
//   publicar        { video_id, para[], cc[], avisar } → { enviados }     (gestionar)
//   comentario      { comentario_id }                → aviso por correo de un comentario nuevo
//   eliminar        { video_id }                     → borra video y miniatura de OneDrive y el registro (gestionar)
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { encode as b64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL      = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const ADMIN_EMAIL   = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
const ONEDRIVE_USER = 'rreyes@manoamiga.edu.mx';
const DRIVE         = `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive`;
const RAIZ          = 'Sistema RCMA Doc/Capacitación';
const DOMINIO       = '@manoamiga.edu.mx';
const MAX_VIDEO     = 4 * 1024 * 1024 * 1024;   // 4 GB
const MAX_MINIATURA = 8 * 1024 * 1024;          // 8 MB

const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class Falla extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
// OneDrive no acepta  " * : < > ? / \ |  en nombres
const limpiar = (s: string, def = 'archivo') =>
  s.normalize('NFC').replace(/["*:<>?/\\|#%]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120).replace(/[\s.]+$/, '').replace(/^[\s.]+/, '') || def;
const ruta = (...partes: string[]) => [...RAIZ.split('/'), ...partes].map(encodeURIComponent).join('/');
const mmss = (s?: number | null) => {
  if (!s || s <= 0) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};

// ── Microsoft Graph ──────────────────────────────────────────────────────────
let tokenCache = '';
async function graphToken(): Promise<string> {
  if (tokenCache) return tokenCache;
  const res = await fetch(`https://login.microsoftonline.com/${Deno.env.get('AZURE_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Falla('No se pudo conectar con OneDrive', 502);
  tokenCache = data.access_token;
  return tokenCache;
}

interface ItemGraph {
  id: string; name: string; webUrl?: string; file?: unknown;
  parentReference?: { path?: string };
  '@microsoft.graph.downloadUrl'?: string;
}

async function item(token: string, id: string): Promise<ItemGraph | null> {
  const r = await fetch(`${DRIVE}/items/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { if (r.status !== 404) console.log(`[graph] ${r.status} item ${id}`); return null; }
  return await r.json();
}
const dentroDeCapacitacion = (it: ItemGraph) =>
  decodeURIComponent(it.parentReference?.path ?? '').includes(`/${RAIZ}/`);

async function urlMiniatura(token: string, v: { miniatura_item_id?: string | null; video_item_id?: string | null }): Promise<string | null> {
  if (v.miniatura_item_id) {
    const it = await item(token, v.miniatura_item_id);
    if (it?.['@microsoft.graph.downloadUrl']) return it['@microsoft.graph.downloadUrl'];
  }
  if (v.video_item_id) {
    // Sin miniatura propia: la vista previa que genera OneDrive del video
    const r = await fetch(`${DRIVE}/items/${encodeURIComponent(v.video_item_id)}/thumbnails/0/large`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) { const t = await r.json(); return t.url ?? null; }
  }
  return null;
}

// ── Correo (SMTP Office 365, igual que las demás notificaciones) ─────────────
const b64Texto = (t: string) => b64(new TextEncoder().encode(t));
const enRenglones = (s: string) => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();
const encabezadoUTF8 = (t: string) => `=?UTF-8?B?${b64Texto(t)}?=`;

interface Imagen { cid: string; tipo: string; base64: string }

async function sendEmail(to: string[], cc: string[], subject: string, html: string, imagen: Imagen | null = null) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const conn = await Deno.connect({ hostname: smtpHost, port: smtpPort });
  const rd = async () => { const b = new Uint8Array(4096); const n = await conn.read(b); return dec.decode(b.subarray(0, n ?? 0)); };
  const wr = async (d: string) => { await conn.write(enc.encode(d + '\r\n')); };
  await rd(); await wr('EHLO outlook.com'); await rd(); await wr('STARTTLS'); await rd();
  const tls = await Deno.startTls(conn, { hostname: smtpHost });
  const tw = async (d: string) => {
    const datos = enc.encode(d + '\r\n');
    let enviado = 0;
    while (enviado < datos.length) enviado += await tls.write(datos.subarray(enviado));
  };
  const tr = async () => { const b = new Uint8Array(4096); const n = await tls.read(b); return dec.decode(b.subarray(0, n ?? 0)); };
  await tw('EHLO outlook.com'); await tr(); await tw('AUTH LOGIN'); await tr();
  await tw(btoa(smtpUser)); await tr(); await tw(btoa(smtpPass));
  const auth = await tr();
  if (!auth.startsWith('235')) { tls.close(); throw new Falla('El correo del sistema no pudo iniciar sesión', 502); }
  await tw(`MAIL FROM:<${smtpUser}>`); await tr();
  for (const addr of [...to, ...cc]) { await tw(`RCPT TO:<${addr}>`); await tr(); }
  await tw('DATA'); await tr();
  const cabeceras = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${encabezadoUTF8(subject)}`,
    'MIME-Version: 1.0',
  ];
  let cuerpo: string[];
  if (imagen) {
    // La miniatura va incrustada (cid): se ve aunque el link temporal de OneDrive ya haya vencido
    const limite = `rcma_${crypto.randomUUID().replace(/-/g, '')}`;
    cuerpo = [
      `Content-Type: multipart/related; boundary="${limite}"; type="text/html"`,
      '',
      `--${limite}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      enRenglones(b64Texto(html)),
      `--${limite}`,
      `Content-Type: ${imagen.tipo}; name="miniatura.jpg"`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${imagen.cid}>`,
      'Content-Disposition: inline; filename="miniatura.jpg"',
      '',
      enRenglones(imagen.base64),
      `--${limite}--`,
    ];
  } else {
    cuerpo = ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', enRenglones(b64Texto(html))];
  }
  await tw([...cabeceras, ...cuerpo, '.'].join('\r\n')); await tr(); await tw('QUIT'); tls.close();
}

function marco(franja: string, colorFranja: string, contenido: string) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid ${colorFranja};">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Coordinación de Obras — Colegios Mano Amiga</p>
        </td></tr>
        <tr><td style="background:${colorFranja};padding:16px 40px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">${franja}</p>
        </td></tr>
        <tr><td style="padding:32px 40px;">${contenido}</td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · Coordinación de Obras y Mantenimiento</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
const boton = (href: string, texto: string) =>
  `<a href="${href}" style="display:inline-block;background:#00295A;color:#fff;padding:11px 24px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">${texto}</a>`;

// ── Servidor ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Quién llama y qué puede hacer ───────────────────────────────────────
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: eu } = await db.auth.getUser(jwt);
    if (eu || !u?.user?.email) throw new Falla('Sesión no válida', 401);
    const email = u.user.email.toLowerCase();
    const esAdmin = email === ADMIN_EMAIL || u.user.app_metadata?.role === 'admin';
    let puedeVer = esAdmin, gestiona = esAdmin;
    if (!esAdmin) {
      const { data: p } = await db.from('user_permissions')
        .select('ver_capacitacion, gestionar_capacitacion').ilike('user_email', email.replace(/[\\%_]/g, (m: string) => '\\' + m)).limit(1).maybeSingle();
      puedeVer = !!p?.ver_capacitacion || !!p?.gestionar_capacitacion;
      gestiona = !!p?.gestionar_capacitacion;
    }
    if (!puedeVer) throw new Falla('No tienes acceso a Capacitación', 403);
    const soloGestion = () => { if (!gestiona) throw new Falla('Solo la Coordinación puede hacer esto', 403); };

    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion ?? '');

    // Video visible para quien llama (borradores solo para la Coordinación)
    const videoVisible = async (id: string) => {
      if (!id) throw new Falla('Falta el video');
      const { data: v } = await db.from('capacitacion_videos').select('*').eq('id', id).maybeSingle();
      if (!v || (v.estado !== 'publicado' && !gestiona)) throw new Falla('Video no encontrado', 404);
      return v;
    };

    // ── Subir: URL de carga en Capacitación/<año>/<categoría> ───────────────
    if (accion === 'iniciar_subida') {
      soloGestion();
      const tipo = body.tipo === 'miniatura' ? 'miniatura' : 'video';
      const tamano = Number(body.tamano ?? 0);
      if (!(tamano > 0)) throw new Falla('El archivo está vacío');
      if (tipo === 'video' && tamano > MAX_VIDEO) throw new Falla('El video pesa más de 4 GB');
      if (tipo === 'miniatura' && tamano > MAX_MINIATURA) throw new Falla('La miniatura pesa más de 8 MB');
      let nombre = limpiar(String(body.nombre ?? ''), tipo === 'video' ? 'video.mp4' : 'miniatura.jpg');
      if (tipo === 'video' && !/\.(mp4|m4v|webm|mov)$/i.test(nombre)) throw new Falla('El video debe ser MP4, M4V, WEBM o MOV');
      if (tipo === 'miniatura' && !/\.(jpe?g|png|webp)$/i.test(nombre)) nombre += '.jpg';
      const anio = /^\d{4}$/.test(String(body.anio ?? '')) ? String(body.anio) : String(new Date().getFullYear());
      const categoria = limpiar(String(body.categoria ?? 'General'), 'General');
      const token = await graphToken();
      // OneDrive crea solas las carpetas del año y de la categoría si no existen
      const r = await fetch(`${DRIVE}/root:/${ruta(anio, categoria, nombre)}:/createUploadSession`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: nombre }, fileSize: tamano }),
      });
      if (!r.ok) throw new Falla(`OneDrive no aceptó la carga (${r.status})`, 502);
      const { uploadUrl } = await r.json();
      return json({ uploadUrl, carpeta: `Capacitación/${anio}/${categoria}`, archivo: nombre });
    }

    // ── Reproducir: link temporal del archivo de video ──────────────────────
    if (accion === 'reproducir') {
      const v = await videoVisible(String(body.video_id ?? ''));
      if (!v.video_item_id) throw new Falla('Este video todavía no tiene archivo', 404);
      const it = await item(await graphToken(), v.video_item_id);
      const url = it?.['@microsoft.graph.downloadUrl'];
      if (!url) throw new Falla('No se encontró el video en OneDrive', 404);
      return json({ url, onedrive: gestiona ? it?.webUrl ?? null : null });
    }

    // ── Miniaturas de varias tarjetas ───────────────────────────────────────
    if (accion === 'miniaturas') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean).slice(0, 60);
      if (!ids.length) return json({ urls: {} });
      let q = db.from('capacitacion_videos').select('id, estado, video_item_id, miniatura_item_id').in('id', ids);
      if (!gestiona) q = q.eq('estado', 'publicado');
      const { data: vids } = await q;
      const token = await graphToken();
      const pares = await Promise.all((vids ?? []).map(async (v: { id: string; video_item_id: string | null; miniatura_item_id: string | null }) => [v.id, await urlMiniatura(token, v)] as const));
      return json({ urls: Object.fromEntries(pares.filter(([, u]) => !!u)) });
    }

    // ── Publicar y avisar ───────────────────────────────────────────────────
    if (accion === 'publicar') {
      soloGestion();
      const v = await videoVisible(String(body.video_id ?? ''));
      if (!v.video_item_id) throw new Falla('Primero sube el archivo del video');
      const avisar = body.avisar !== false;
      let enviados = 0;
      if (avisar) {
        // Solo usuarios registrados en Accesos con correo @manoamiga.edu.mx
        const { data: usuarios } = await db.from('user_permissions').select('user_email');
        const validos = new Set((usuarios ?? []).map((x: { user_email: string | null }) => String(x.user_email ?? '').trim().toLowerCase())
          .filter((e: string) => e.endsWith(DOMINIO)));
        validos.add(ADMIN_EMAIL);
        const norm = (l: unknown) => [...new Set((Array.isArray(l) ? l : []).map(x => String(x ?? '').trim().toLowerCase()).filter(e => validos.has(e)))];
        const para = norm(body.para);
        if (!para.length) throw new Falla('Elige al menos un destinatario en Para');
        const cc = norm(body.cc).filter(e => !para.includes(e));
        if (!para.includes(ADMIN_EMAIL) && !cc.includes(ADMIN_EMAIL)) cc.push(ADMIN_EMAIL);

        // Miniatura incrustada en el correo
        let imagen: Imagen | null = null;
        try {
          const url = await urlMiniatura(await graphToken(), v);
          if (url) {
            const r = await fetch(url);
            if (r.ok) {
              const bytes = new Uint8Array(await r.arrayBuffer());
              if (bytes.length <= 3_000_000) imagen = { cid: 'miniatura@rcma', tipo: r.headers.get('content-type')?.split(';')[0] || 'image/jpeg', base64: b64(bytes) };
            }
          }
        } catch (e) { console.log('[capacitacion] miniatura para correo', e); }

        const enlace = `${SITE_URL}/capacitacion/${v.id}`;
        const dur = mmss(v.duracion_seg);
        const capitulos = Array.isArray(v.capitulos) ? v.capitulos as { seg: number; titulo: string }[] : [];
        const html = marco('🎬 Nuevo video de Capacitación', '#2563eb', `
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 18px;">Se publicó un nuevo video en la sección de <b>Capacitación</b> del Sistema RCMA.</p>
          ${imagen ? `<a href="${enlace}"><img src="cid:${imagen.cid}" width="520" alt="${esc(v.titulo)}" style="width:100%;max-width:520px;border-radius:10px;display:block;border:0;"></a>` : ''}
          <p style="font-size:18px;font-weight:700;color:#0f172a;margin:16px 0 6px;">${esc(v.titulo)}</p>
          <p style="font-size:13px;color:#64748b;margin:0 0 14px;">${esc(v.categoria)}${dur ? ` · ${dur} min` : ''}</p>
          ${v.descripcion ? `<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 16px;white-space:pre-line;">${esc(v.descripcion)}</p>` : ''}
          ${capitulos.length ? `<p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 6px;">Contenido</p>
            <p style="font-size:13px;color:#475569;line-height:1.7;margin:0 0 20px;">${capitulos.map(c => `<b style="color:#2563eb;">${mmss(c.seg) || '0:00'}</b> ${esc(c.titulo)}`).join('<br>')}</p>` : ''}
          ${boton(enlace, '▶ Ver en el Sistema RCMA')}
          <p style="font-size:12px;color:#94a3b8;margin:18px 0 0;">¿Tienes dudas? Déjalas en los comentarios del video y la Coordinación te responde ahí mismo.</p>`);
        await sendEmail(para, cc, `Nuevo video de Capacitación: ${v.titulo}`, html, imagen);
        enviados = para.length + cc.length;
      }
      const ahora = new Date().toISOString();
      const cambios: Record<string, unknown> = { estado: 'publicado', publicado_at: v.publicado_at ?? ahora };
      if (avisar) { cambios.aviso_enviado_at = ahora; cambios.aviso_total = enviados; }
      const { error } = await db.from('capacitacion_videos').update(cambios).eq('id', v.id);
      if (error) throw new Falla('No se pudo marcar como publicado: ' + error.message, 500);
      return json({ ok: true, enviados });
    }

    // ── Aviso de un comentario nuevo ────────────────────────────────────────
    //  · Comentario o duda de un usuario  → correo a la Coordinación
    //  · Respuesta de la Coordinación     → correo a quien hizo la pregunta
    if (accion === 'comentario') {
      const { data: c } = await db.from('capacitacion_comentarios').select('*').eq('id', String(body.comentario_id ?? '')).maybeSingle();
      if (!c || c.user_email !== email) throw new Falla('Comentario no encontrado', 404);
      if (Date.now() - new Date(c.created_at).getTime() > 10 * 60 * 1000) return json({ ok: true, enviado: false });
      const v = await videoVisible(c.video_id);
      const enlace = `${SITE_URL}/capacitacion/${v.id}#c-${c.parent_id ?? c.id}`;
      const cita = (t: string) => `<div style="border-left:4px solid #cbd5e1;background:#f8fafc;padding:12px 16px;border-radius:0 8px 8px 0;font-size:14px;color:#334155;line-height:1.6;white-space:pre-line;margin:0 0 18px;">${esc(t)}</div>`;

      if (c.es_coordinacion) {
        if (!c.parent_id) return json({ ok: true, enviado: false });
        const { data: p } = await db.from('capacitacion_comentarios').select('*').eq('id', c.parent_id).maybeSingle();
        if (!p || p.es_coordinacion || !String(p.user_email).endsWith(DOMINIO) || p.user_email === email) return json({ ok: true, enviado: false });
        const html = marco('💬 Tu duda tiene respuesta', '#059669', `
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">Hola ${esc(p.user_nombre ?? '')}, la Coordinación respondió tu comentario en el video <b>${esc(v.titulo)}</b>.</p>
          <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 6px;">Tu comentario</p>${cita(p.texto)}
          <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 6px;">Respuesta de la Coordinación</p>${cita(c.texto)}
          ${boton(enlace, 'Ver en el Sistema RCMA')}`);
        await sendEmail([p.user_email], [], `Respuesta a tu duda: ${v.titulo}`, html);
        return json({ ok: true, enviado: true });
      }

      let previo = '';
      if (c.parent_id) {
        const { data: p } = await db.from('capacitacion_comentarios').select('texto, user_nombre').eq('id', c.parent_id).maybeSingle();
        if (p) previo = `<p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 6px;">En respuesta a ${esc(p.user_nombre ?? '')}</p>${cita(p.texto)}`;
      }
      const quien = [c.user_nombre, c.user_puesto, c.user_colegio].filter(Boolean).map(esc).join(' · ');
      const html = marco('💬 Nuevo comentario en Capacitación', '#ED7102', `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;"><b>${quien}</b> comentó en el video <b>${esc(v.titulo)}</b>.</p>
        ${previo}
        <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin:0 0 6px;">Comentario</p>${cita(c.texto)}
        ${boton(enlace, 'Responder en el Sistema RCMA')}`);
      await sendEmail([ADMIN_EMAIL], [], `Comentario en "${v.titulo}" — ${c.user_nombre ?? email}`, html);
      return json({ ok: true, enviado: true });
    }

    // ── Eliminar un video (archivo, miniatura y registro) ───────────────────
    if (accion === 'eliminar') {
      soloGestion();
      const v = await videoVisible(String(body.video_id ?? ''));
      const token = await graphToken();
      for (const id of [v.video_item_id, v.miniatura_item_id].filter(Boolean) as string[]) {
        const it = await item(token, id);
        if (!it) continue;                                   // ya no estaba
        if (!dentroDeCapacitacion(it)) continue;             // nunca se borra nada fuera de Capacitación
        const d = await fetch(`${DRIVE}/items/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (!d.ok && d.status !== 404) throw new Falla(`No se pudo borrar en OneDrive (${d.status})`, 502);
      }
      const { error } = await db.from('capacitacion_videos').delete().eq('id', v.id);
      if (error) throw new Falla('No se pudo borrar el registro: ' + error.message, 500);
      return json({ ok: true });
    }

    throw new Falla('Acción no válida');
  } catch (e) {
    const status = e instanceof Falla ? e.status : 500;
    console.error('[capacitacion]', e);
    return json({ error: e instanceof Error ? e.message : 'Error' }, status);
  }
});
