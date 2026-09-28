// ============================================================================
// cumplimiento-archivos — Expediente digital de Cumplimiento Normativo
//
// Todas las acciones pasan por aquí para que la llave de Microsoft (OneDrive)
// nunca llegue al navegador de un usuario de colegio, y para validar que cada
// quien solo toque lo de SU colegio.
//
// Acciones (body JSON { accion, ... }):
//   iniciar_subida      → crea la sesión de carga en OneDrive (carpeta del documento)
//   registrar_subida    → guarda el archivo ya subido, genera su link y avisa
//   eliminar_archivo    → borra un archivo (colegio: solo los suyos sin verificar)
//   verificar           → (RCMA) marca Verificado y avisa al administrador del colegio
//   rechazar            → (RCMA) borra los archivos, guarda el motivo y avisa
//   solicitar_faltantes → (RCMA) manda al colegio la lista de lo que le falta
//   notificar_verificado→ (RCMA) solo el correo de "verificado" (cuando se marca
//                          Verificado desde el formulario del documento)
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Correo (SMTP Office 365) y plantilla institucional ──────────────────────
// Envío de correo por SMTP de Office 365 (mismo método que el resto de las
// funciones del sistema) + plantilla institucional para los avisos de
// Cumplimiento Normativo.

function conTimeout<T>(promesa: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout (${ms}ms) en: ${etiqueta}`)), ms)),
  ]);
}

async function writeAll(writer: { write(p: Uint8Array): Promise<number> }, data: Uint8Array) {
  let sent = 0;
  while (sent < data.length) {
    const n = await writer.write(data.subarray(sent));
    if (n === 0) throw new Error('writeAll: 0 bytes escritos');
    sent += n;
  }
}

// Asunto en UTF-8 (RFC 2047): se parte en varias "encoded-words" cortas,
// sin cortar ningún carácter a la mitad, para que Outlook lo muestre bien.
function asuntoMime(s: string): string {
  const enc = new TextEncoder();
  const partes: string[] = [];
  let actual = '';
  for (const ch of s) {
    if (enc.encode(actual + ch).length > 45) { partes.push(actual); actual = ''; }
    actual += ch;
  }
  if (actual) partes.push(actual);
  const b64 = (t: string) => { let bin = ''; enc.encode(t).forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin); };
  return partes.map(p => `=?UTF-8?B?${b64(p)}?=`).join('\r\n ');
}

// Cuerpo en base64 con líneas de 76 caracteres (evita líneas demasiado
// largas y problemas con acentos o con líneas que empiezan con punto).
function cuerpoBase64(html: string): string {
  let bin = '';
  new TextEncoder().encode(html).forEach(b => { bin += String.fromCharCode(b); });
  return (btoa(bin).match(/.{1,76}/g) ?? []).join('\r\n');
}

function separarCorreos(v: string | string[]): string[] {
  return (Array.isArray(v) ? v : [v]).flatMap(x => String(x).split(/[;,\s]+/)).map(x => x.trim()).filter(x => x.includes('@'));
}

async function sendEmail(to: string | string[], subject: string, html: string) {
  const destinatarios = separarCorreos(to);
  if (destinatarios.length === 0) throw new Error('Sin destinatario');
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
  if (!smtpUser || !smtpPass) throw new Error('Faltan SMTP_USER o SMTP_PASS');

  const enc = new TextEncoder(); const dec = new TextDecoder();
  const conn = await conTimeout(Deno.connect({ hostname: smtpHost, port: smtpPort }), 10000, 'connect');
  const rd = async (t = 12000) => { const b = new Uint8Array(4096); const n = await conTimeout(conn.read(b), t, 'read'); return dec.decode(b.subarray(0, n ?? 0)); };
  const wr = async (d: string) => { await conTimeout(writeAll(conn, enc.encode(d + '\r\n')), 12000, 'write'); };
  await rd(); await wr('EHLO outlook.com'); await rd(); await wr('STARTTLS'); await rd();
  const tls = await conTimeout(Deno.startTls(conn, { hostname: smtpHost }), 12000, 'startTls');
  const tw = async (d: string) => { await conTimeout(writeAll(tls, enc.encode(d + '\r\n')), 20000, 'tls write'); };
  // Lee la respuesta COMPLETA (las de varias líneas terminan con "250 ..." sin guion)
  const tr = async (t = 12000) => {
    let txt = '';
    for (let i = 0; i < 20; i++) {
      const b = new Uint8Array(4096);
      const n = await conTimeout(tls.read(b), t, 'tls read');
      if (!n) break;
      txt += dec.decode(b.subarray(0, n));
      const lineas = txt.split('\r\n').filter(Boolean);
      if (txt.endsWith('\r\n') && /^\d{3} /.test(lineas[lineas.length - 1] ?? '')) break;
    }
    return txt;
  };
  // Lee la respuesta y valida el código SMTP esperado
  const esperar = async (codigos: string[], paso: string, t = 12000) => {
    const r = await tr(t);
    if (!codigos.some(c => r.startsWith(c))) throw new Error(`SMTP ${paso}: ${r.trim().slice(0, 160)}`);
    return r;
  };

  try {
    await tw('EHLO outlook.com'); await esperar(['250'], 'EHLO');
    await tw('AUTH LOGIN'); await esperar(['334'], 'AUTH');
    await tw(btoa(smtpUser)); await esperar(['334'], 'usuario');
    await tw(btoa(smtpPass)); await esperar(['235'], 'autenticación');
    await tw(`MAIL FROM:<${smtpUser}>`); await esperar(['250'], 'MAIL FROM');
    const aceptados: string[] = [];
    for (const d of destinatarios) {
      await tw(`RCPT TO:<${d}>`);
      const r = await tr();
      if (r.startsWith('250') || r.startsWith('251')) aceptados.push(d);
      else console.log(`[smtp] destinatario rechazado ${d}: ${r.trim()}`);
    }
    if (aceptados.length === 0) throw new Error(`Ningún destinatario fue aceptado (${destinatarios.join(', ')})`);
    await tw('DATA'); await esperar(['354'], 'DATA', 20000);
    const msg = [
      `From: Sistema RCMA <${smtpUser}>`,
      `To: ${aceptados.join(', ')}`,
      `Subject: ${asuntoMime(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      cuerpoBase64(html),
      '.',
    ].join('\r\n');
    await tw(msg); await esperar(['250'], 'envío', 30000);
    await tw('QUIT');
  } finally {
    try { tls.close(); } catch { /* ya cerrada */ }
  }
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Plantilla institucional: franja de color con el titular, cuerpo libre y botón
function plantilla(opts: {
  franja: string; color: string; cuerpo: string; boton?: { texto: string; url: string }; pie?: string;
}): string {
  const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Mexico_City' });
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#00295A;padding:28px 36px;border-bottom:3px solid #ED7102;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Sistema RCMA — Cumplimiento Normativo</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:11px;">Colegios Mano Amiga · ${fecha}</p>
        </td></tr>
        <tr><td style="background:${opts.color};padding:12px 36px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">${opts.franja}</p>
        </td></tr>
        <tr><td style="padding:26px 36px;font-size:14px;color:#1e293b;line-height:1.55;">
          ${opts.cuerpo}
          ${opts.boton ? `<p style="margin:24px 0 0;"><a href="${opts.boton.url}" style="display:inline-block;background:#00295A;color:#fff;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">${esc(opts.boton.texto)} →</a></p>` : ''}
        </td></tr>
        <tr><td style="background:#f8fafc;padding:14px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">${opts.pie ?? 'Coordinación de Obras y Mantenimiento RCMA · Mensaje automático del Sistema RCMA'}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// Tabla sencilla para listar documentos en un correo
function tablaDocs(filas: { documento: string; detalle: string; color?: string }[]): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-top:12px;">
    <tr style="background:#f8fafc;">
      <th style="padding:9px 12px;font-size:11px;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;">Documento</th>
      <th style="padding:9px 12px;font-size:11px;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;">Detalle</th>
    </tr>
    ${filas.map(f => `<tr>
      <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f1f5f9;">${esc(f.documento)}</td>
      <td style="padding:8px 12px;font-size:12px;border-bottom:1px solid #f1f5f9;color:${f.color ?? '#475569'};font-weight:${f.color ? 700 : 400};">${esc(f.detalle)}</td>
    </tr>`).join('')}
  </table>`;
}


const SITE_URL   = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
const ONEDRIVE_USER = 'rreyes@manoamiga.edu.mx';
const RAIZ = 'Sistema RCMA Doc';
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB por archivo

const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class Falla extends Error { constructor(msg: string, public status = 400) { super(msg); } }

async function graphToken(): Promise<string> {
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
  return data.access_token;
}

// OneDrive no acepta  " * : < > ? / \ |  en nombres; también se quitan espacios dobles
const limpiar = (s: string) =>
  s.replace(/["*:<>?/\\|#%]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120).replace(/[\s.]+$/, '') || 'archivo';
// Búsqueda de correo sin distinguir mayúsculas; se escapan % y _ para que no actúen como comodines
const patronCorreo = (e: string) => e.replace(/[\\%_]/g, m => '\\' + m);
const rutaGraph = (carpeta: string, archivo?: string) =>
  [RAIZ, ...carpeta.split('/'), ...(archivo ? [archivo] : [])].map(encodeURIComponent).join('/');

async function graphDelete(token: string, a: { item_id?: string | null; carpeta: string; archivo_nombre: string }) {
  const url = a.item_id
    ? `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/items/${encodeURIComponent(a.item_id)}`
    : `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/root:/${rutaGraph(a.carpeta, a.archivo_nombre)}`;
  const r = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok && r.status !== 404) throw new Falla(`No se pudo borrar en OneDrive (${r.status})`, 502);
}

async function linkAnonimo(token: string, itemId: string): Promise<string | null> {
  for (const espera of [0, 1000, 2500, 4000]) {
    if (espera) await new Promise(r => setTimeout(r, espera));
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/items/${itemId}/createLink`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'view', scope: 'anonymous' }),
    });
    if (r.ok) { const d = await r.json(); if (d.link?.webUrl) return d.link.webUrl; }
    else if (![404, 423, 429].includes(r.status)) return null;
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Quién llama ─────────────────────────────────────────────────────────
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: eu } = await db.auth.getUser(jwt);
    if (eu || !u?.user?.email) throw new Falla('Sesión no válida', 401);
    const email = u.user.email.toLowerCase();
    const nombreUsuario = (u.user.user_metadata?.nombre as string) || email;
    // user_metadata lo puede cambiar el propio usuario: el admin se decide por
    // su correo o por app_metadata (que solo el servidor puede escribir).
    const esAdmin = email === ADMIN_EMAIL || u.user.app_metadata?.role === 'admin';

    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion ?? '');

    // Usuario de colegio: solo su colegio. Excepción: quien edita Cumplimiento
    // (sin ser admin) puede disparar el aviso de "verificado" cuando cambia el
    // estatus desde las tablas.
    let colegioUsuario: string | null = null;
    let editorGeneral = false;
    if (!esAdmin) {
      const { data: perm } = await db.from('user_permissions')
        .select('colegio, subir_cumplimiento, editar_cumplimiento').ilike('user_email', patronCorreo(email)).limit(1).maybeSingle();
      editorGeneral = accion === 'notificar_verificado' && perm?.editar_cumplimiento === true;
      if (!editorGeneral) {
        if (!perm?.subir_cumplimiento || !perm.colegio) throw new Falla('No tienes permiso para subir documentos de Cumplimiento', 403);
        colegioUsuario = perm.colegio;
      }
    }

    const cargarDoc = async (id: string) => {
      const { data, error } = await db.from('compliance_documentos')
        .select('id, colegio, territorio, materia, tipo_documento, estado, "año", activo, revision, vigente, vigente_hasta')
        .eq('id', id).maybeSingle();
      if (error || !data) throw new Falla('Documento no encontrado', 404);
      if (!esAdmin && !editorGeneral && data.colegio !== colegioUsuario) throw new Falla('Ese documento no es de tu colegio', 403);
      return data as any;
    };
    const soloAdmin = () => { if (!esAdmin) throw new Falla('Solo la Coordinación RCMA puede hacer esto', 403); };

    const contactoColegio = async (colegio: string) => {
      const { data } = await db.from('directorio').select('nombre, adm_nombre, adm_correo').eq('codigo', colegio).maybeSingle();
      const correos = String(data?.adm_correo ?? '').split(/[;,\s]+/).map(c => c.trim()).filter(c => c.includes('@'));
      return { nombreColegio: data?.nombre || colegio, admNombre: data?.adm_nombre || '', admCorreo: correos.join(', '), admCorreos: correos };
    };
    // ¿Está encendido este aviso para el colegio? (Expediente por Colegio → Avisos a colegios)
    const avisoActivo = async (colegio: string, campo: 'avisar_verificado' | 'avisar_rechazado') => {
      const { data } = await db.from('compliance_avisos_colegio').select(campo).eq('colegio', colegio).maybeSingle();
      return (data as any)?.[campo] === true;
    };
    const notificarAdmin = async (titulo: string, mensaje: string, link: string, tipo = 'info') => {
      const { data: p } = await db.from('user_permissions').select('user_id').ilike('user_email', patronCorreo(ADMIN_EMAIL)).limit(1).maybeSingle();
      if (p?.user_id) await db.from('notificaciones').insert({ usuario_id: p.user_id, tipo, titulo, mensaje, link, modulo: 'cumplimiento' });
    };
    // El colegio no puede cambiar un documento verificado y en vigor. Si ya
    // venció o está por vencer, sí puede subir la renovación.
    const cerradoParaColegio = (d: any) => {
      const verificado = d.revision === 'verificado' || d.estado === 'Verificado';
      if (!verificado) return false;
      if (!d.vigente_hasta) return true; // trámite único verificado
      const dias = (new Date(String(d.vigente_hasta).slice(0, 10) + 'T00:00:00Z').getTime() - Date.now()) / 86400e3;
      return dias > 90;
    };
    const avisarSubida = async (d: any) => {
      const { nombreColegio } = await contactoColegio(d.colegio);
      const { count } = await db.from('compliance_archivos').select('id', { count: 'exact', head: true }).eq('documento_id', d.id);
      const link = `${SITE_URL}/cumplimiento/documentos?doc=${d.id}`;
      await notificarAdmin(`${d.colegio} subió: ${d.tipo_documento}`, 'Requiere tu verificación.', `/cumplimiento/documentos?doc=${d.id}`, 'alerta');
      try {
        await sendEmail(ADMIN_EMAIL, `📎 [RCMA] ${d.colegio} subió "${d.tipo_documento}" — requiere verificación`, plantilla({
          franja: `📎 ${esc(nombreColegio)} subió un documento para revisión`, color: '#0284c7',
          cuerpo: `<p style="margin:0 0 8px;"><b>${esc(nombreUsuario)}</b> subió archivos al expediente de Cumplimiento:</p>
            ${tablaDocs([
              { documento: d.tipo_documento, detalle: `${d.materia ?? ''} · ${d['año']}` },
              { documento: 'Archivos en el documento', detalle: String(count ?? 1) },
            ])}
            <p style="margin:16px 0 0;">Revísalo y márcalo como <b>Verificado</b> o <b>Rechazado</b>.</p>`,
          boton: { texto: 'Revisar documento', url: link },
        }));
      } catch (e) { console.log('aviso: no se pudo enviar correo al admin', e); }
    };
    const carpetaDe = (d: any) =>
      ['Cumplimiento', limpiar(d.colegio), String(d['año']), limpiar(d.materia || 'Sin materia'), limpiar(d.tipo_documento)].join('/');

    // ── 1. Iniciar subida ──────────────────────────────────────────────────
    if (accion === 'iniciar_subida') {
      const d = await cargarDoc(body.documento_id);
      if (!esAdmin && cerradoParaColegio(d)) throw new Falla('Este documento ya está verificado y vigente; si necesitas cambiarlo, contacta a la Coordinación RCMA');
      const nombreOriginal = String(body.nombre ?? 'archivo');
      const tamano = Number(body.tamano ?? 0);
      if (tamano > MAX_BYTES) throw new Falla('El archivo pesa más de 100 MB');
      const sello = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
      const archivo = `${sello}_${limpiar(nombreOriginal)}`;
      const carpeta = carpetaDe(d);
      const token = await graphToken();
      const r = await fetch(`https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/root:/${rutaGraph(carpeta, archivo)}:/createUploadSession`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: archivo }, ...(tamano > 0 ? { fileSize: tamano } : {}) }),
      });
      if (!r.ok) throw new Falla(`OneDrive no aceptó la carga (${r.status})`, 502);
      const { uploadUrl } = await r.json();
      return json({ uploadUrl, carpeta, archivo });
    }

    // ── 2. Registrar el archivo ya subido ───────────────────────────────────
    if (accion === 'registrar_subida') {
      const d = await cargarDoc(body.documento_id);
      const carpeta = carpetaDe(d);
      const itemId = String(body.item_id ?? '');
      const token = await graphToken();
      // Confirmar que el archivo realmente quedó en la carpeta de ESTE documento
      const ri = await fetch(`https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/items/${encodeURIComponent(itemId)}?$select=id,name,size,webUrl,parentReference`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (!ri.ok) throw new Falla('No se encontró el archivo subido en OneDrive', 404);
      const item = await ri.json();
      let rutaPadre = String(item.parentReference?.path ?? '');
      try { rutaPadre = decodeURIComponent(rutaPadre); } catch { /* ya venía decodificada */ }
      if (!rutaPadre.toLowerCase().endsWith(`/${RAIZ}/${carpeta}`.toLowerCase())) throw new Falla('El archivo no quedó en la carpeta del documento', 400);
      const { count: yaExiste } = await db.from('compliance_archivos').select('id', { count: 'exact', head: true }).eq('item_id', item.id);
      if (yaExiste) throw new Falla('Ese archivo ya estaba registrado', 409);
      if (!esAdmin && cerradoParaColegio(d)) throw new Falla('Este documento ya está verificado y vigente', 403);

      const url = (await linkAnonimo(token, item.id)) ?? item.webUrl;
      const origen = esAdmin ? 'rcma' : 'colegio';
      const { data: arch, error: ea } = await db.from('compliance_archivos').insert({
        documento_id: d.id, colegio: d.colegio, nombre_original: String(body.nombre ?? item.name),
        archivo_nombre: item.name, carpeta, url, tamano: item.size ?? null, origen, item_id: item.id,
        subido_por_email: email, subido_por_nombre: nombreUsuario,
      }).select().single();
      if (ea) throw new Falla(`No se pudo guardar el archivo: ${ea.message}`, 500);

      if (!esAdmin) {
        // Lo subió el colegio → queda por revisar y se avisa a la Coordinación
        await db.from('compliance_documentos').update({
          revision: 'por_revisar', revision_motivo: null, revision_at: new Date().toISOString(), revision_por: email,
          estado: d.estado === 'Verificado' ? d.estado : 'En Trámite',
        }).eq('id', d.id);

      }
      return json({ archivo: arch });
    }

    // ── 2b. Aviso a la Coordinación después de subir (una vez por tanda) ────
    if (accion === 'notificar_subida') {
      if (esAdmin) return json({ ok: true });
      const d = await cargarDoc(body.documento_id);
      if (d.revision !== 'por_revisar') return json({ ok: true });
      await avisarSubida(d);
      return json({ ok: true });
    }

    // ── 3. Eliminar un archivo ──────────────────────────────────────────────
    if (accion === 'eliminar_archivo') {
      const { data: a } = await db.from('compliance_archivos').select('*').eq('id', body.archivo_id).maybeSingle();
      if (!a) throw new Falla('Archivo no encontrado', 404);
      const d = await cargarDoc(a.documento_id);
      if (!esAdmin && a.origen !== 'colegio') throw new Falla('Ese archivo lo subió la Coordinación RCMA; no se puede quitar', 403);
      if (!esAdmin && d.revision !== 'por_revisar') throw new Falla('Solo puedes quitar archivos mientras están en revisión', 403);
      await graphDelete(await graphToken(), a);
      await db.from('compliance_archivos').delete().eq('id', a.id);
      const { count } = await db.from('compliance_archivos').select('id', { count: 'exact', head: true })
        .eq('documento_id', d.id).eq('origen', 'colegio');
      if (!count && d.revision === 'por_revisar') {
        await db.from('compliance_documentos').update({
          revision: null, revision_at: null, revision_por: null,
          ...(d.estado === 'En Trámite' ? { estado: 'Pendiente' } : {}),
        }).eq('id', d.id);
      }
      return json({ ok: true });
    }

    // ── 4. Verificar ────────────────────────────────────────────────────────
    if (accion === 'verificar' || accion === 'notificar_verificado') {
      if (!editorGeneral) soloAdmin();
      const d = await cargarDoc(body.documento_id);
      if (accion === 'notificar_verificado' && d.estado !== 'Verificado') throw new Falla('El documento no está marcado como Verificado');
      if (accion === 'verificar') {
        await db.from('compliance_documentos').update({
          estado: 'Verificado', revision: 'verificado', revision_motivo: null,
          revision_at: new Date().toISOString(), revision_por: email,
        }).eq('id', d.id);
      } else {
        await db.from('compliance_documentos').update({
          revision: 'verificado', revision_motivo: null, revision_at: new Date().toISOString(), revision_por: email,
        }).eq('id', d.id);
      }
      const { nombreColegio, admNombre, admCorreo } = await contactoColegio(d.colegio);
      let correo = false;
      const activoV = await avisoActivo(d.colegio, 'avisar_verificado');
      if (!activoV) return json({ ok: true, correo: false, aviso_desactivado: true, destinatario: null });
      if (admCorreo) {
        try {
          await sendEmail(admCorreo, `✅ [RCMA] Documento verificado: ${d.tipo_documento}`, plantilla({
            franja: '✅ Documento verificado', color: '#059669',
            cuerpo: `<p style="margin:0 0 8px;">Hola${admNombre ? ` <b>${esc(admNombre)}</b>` : ''}:</p>
              <p style="margin:0 0 8px;">La Coordinación RCMA revisó y <b>verificó</b> el siguiente documento de <b>${esc(nombreColegio)}</b>:</p>
              ${tablaDocs([{ documento: d.tipo_documento, detalle: 'Verificado ✔', color: '#059669' }])}
              <p style="margin:16px 0 0;">Gracias por mantener al día el expediente de Cumplimiento.</p>`,
            boton: { texto: 'Ver mis documentos', url: `${SITE_URL}/cumplimiento/mis-documentos` },
          }));
          correo = true;
        } catch (e) { console.log('aviso: correo de verificado no enviado', e); }
      }
      return json({ ok: true, correo, destinatario: admCorreo || null });
    }

    // ── 5. Rechazar (borra los archivos) ────────────────────────────────────
    if (accion === 'rechazar') {
      soloAdmin();
      const motivo = String(body.motivo ?? '').trim();
      if (!motivo) throw new Falla('Escribe el motivo del rechazo');
      const d = await cargarDoc(body.documento_id);
      const { data: archivos } = await db.from('compliance_archivos').select('*').eq('documento_id', d.id);
      const token = (archivos ?? []).length ? await graphToken() : '';
      for (const a of archivos ?? []) {
        try { await graphDelete(token, a); } catch (e) { console.log('aviso borrando', a.archivo_nombre, e); }
      }
      const ids = (archivos ?? []).map((a: any) => a.id);
      if (ids.length) await db.from('compliance_archivos').delete().in('id', ids);
      await db.from('compliance_documentos').update({
        estado: 'Pendiente', revision: 'rechazado', revision_motivo: motivo,
        revision_at: new Date().toISOString(), revision_por: email,
      }).eq('id', d.id);

      const { nombreColegio, admNombre, admCorreo } = await contactoColegio(d.colegio);
      let correo = false;
      const activoR = await avisoActivo(d.colegio, 'avisar_rechazado');
      if (!activoR) return json({ ok: true, correo: false, aviso_desactivado: true, destinatario: null, archivos_borrados: (archivos ?? []).length });
      if (admCorreo) {
        try {
          await sendEmail(admCorreo, `❌ [RCMA] Documento rechazado: ${d.tipo_documento}`, plantilla({
            franja: '❌ Documento rechazado — favor de volver a enviarlo', color: '#DC2626',
            cuerpo: `<p style="margin:0 0 8px;">Hola${admNombre ? ` <b>${esc(admNombre)}</b>` : ''}:</p>
              <p style="margin:0 0 8px;">La Coordinación RCMA revisó el documento de <b>${esc(nombreColegio)}</b> y <b>no fue aceptado</b>:</p>
              ${tablaDocs([{ documento: d.tipo_documento, detalle: 'Rechazado', color: '#DC2626' }])}
              <p style="margin:16px 0 4px;"><b>Motivo:</b></p>
              <p style="margin:0;padding:10px 14px;background:#fef2f2;border-left:4px solid #DC2626;border-radius:4px;">${esc(motivo)}</p>
              <p style="margin:16px 0 0;">Los archivos anteriores se eliminaron. Por favor súbelo de nuevo en el sistema o envíalo a la Coordinación RCMA.</p>`,
            boton: { texto: 'Subir el documento', url: `${SITE_URL}/cumplimiento/mis-documentos` },
          }));
          correo = true;
        } catch (e) { console.log('aviso: correo de rechazo no enviado', e); }
      }
      return json({ ok: true, correo, destinatario: admCorreo || null, archivos_borrados: (archivos ?? []).length });
    }

    // ── 6. Solicitar faltantes ──────────────────────────────────────────────
    if (accion === 'solicitar_faltantes') {
      soloAdmin();
      const colegio = String(body.colegio ?? '');
      const anio = Number(body.anio) || new Date(Date.now() - 6 * 3600e3).getUTCFullYear();
      const { data: docs } = await db.from('compliance_documentos')
        .select('id, tipo_documento, materia, estado, revision, revision_motivo')
        .eq('colegio', colegio).eq('activo', true).eq('año', anio).neq('estado', 'Verificado');
      const { data: conArchivo } = await db.from('compliance_archivos').select('documento_id').eq('colegio', colegio);
      const tieneArchivo = new Set((conArchivo ?? []).map((a: any) => a.documento_id));
      const faltan = (docs ?? []).filter((d: any) => d.revision !== 'por_revisar' && !tieneArchivo.has(d.id))
        .sort((a: any, b: any) => (a.materia ?? '').localeCompare(b.materia ?? '') || a.tipo_documento.localeCompare(b.tipo_documento));
      if (faltan.length === 0) return json({ ok: true, enviados: 0, faltantes: 0, mensaje: 'Este colegio no tiene documentos pendientes de enviar' });

      const { nombreColegio, admNombre, admCorreo } = await contactoColegio(colegio);
      if (!admCorreo) throw new Falla(`No hay correo del administrador de ${colegio} en el Directorio`);
      await sendEmail(admCorreo, `📋 [RCMA] ${nombreColegio}: ${faltan.length} documento${faltan.length !== 1 ? 's' : ''} de Cumplimiento pendiente${faltan.length !== 1 ? 's' : ''}`, plantilla({
        franja: `📋 ${faltan.length} documento${faltan.length !== 1 ? 's' : ''} pendiente${faltan.length !== 1 ? 's' : ''} de enviar`, color: '#ED7102',
        cuerpo: `<p style="margin:0 0 8px;">Hola${admNombre ? ` <b>${esc(admNombre)}</b>` : ''}:</p>
          <p style="margin:0 0 8px;">Para completar el expediente de Cumplimiento ${anio} de <b>${esc(nombreColegio)}</b>, nos hacen falta los siguientes documentos:</p>
          ${tablaDocs(faltan.map((d: any) => ({
            documento: d.tipo_documento,
            detalle: d.revision === 'rechazado' ? `Rechazado: ${d.revision_motivo ?? ''}` : (d.materia ?? ''),
            color: d.revision === 'rechazado' ? '#DC2626' : undefined,
          })))}
          <p style="margin:16px 0 0;">Por favor súbelos en el sistema (sección <b>Mis Documentos de Cumplimiento</b>) o envíalos a la Coordinación RCMA.</p>`,
        boton: { texto: 'Subir documentos', url: `${SITE_URL}/cumplimiento/mis-documentos` },
      }));
      return json({ ok: true, enviados: 1, faltantes: faltan.length, destinatario: admCorreo });
    }

    throw new Falla('Acción no reconocida');
  } catch (err) {
    const status = err instanceof Falla ? err.status : 500;
    console.log('[cumplimiento-archivos] error:', err);
    return json({ error: err instanceof Error ? err.message : 'Error' }, status);
  }
});
