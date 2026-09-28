// ============================================================================
// cumplimiento-recordatorios — aviso al ADMINISTRADOR de cada colegio cuando un
// documento está por vencer, según su "Vigente hasta" (vigencia + periodicidad):
//     · 3 meses antes (90 días)
//     · 1 mes antes   (30 días)
//     · 1 semana antes (7 días)
// Corre lunes a viernes 8:00 AM (México). Cada aviso se manda una sola vez por
// documento y periodo: si un umbral cae en fin de semana, sale el lunes. Al
// renovar el documento (cambia "Vigente hasta") los avisos vuelven a empezar.
// Un correo por colegio con todos sus documentos del día.
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


const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

type Etapa = 90 | 30 | 7;
const ETIQUETA: Record<Etapa, string> = { 90: '3 meses', 30: '1 mes', 7: '1 semana' };
const COLOR: Record<Etapa, string> = { 90: '#0284c7', 30: '#d97706', 7: '#DC2626' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const body = await req.json().catch(() => ({}));
    const prueba = body?.prueba === true; // solo calcula, no envía ni marca

    // El modo prueba devuelve correos y documentos: solo para el administrador.
    // La corrida normal es segura de repetir (cada aviso se marca y no se duplica)
    // y su respuesta no incluye datos de contacto.
    if (prueba) {
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: u } = await db.auth.getUser(jwt);
      if ((u?.user?.email ?? '').toLowerCase() !== adminEmail.toLowerCase()) {
        return new Response(JSON.stringify({ error: 'Solo el administrador puede usar el modo prueba' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
    }

    const ahoraMX = new Date(Date.now() - 6 * 3600e3);
    const hoy = new Date(Date.UTC(ahoraMX.getUTCFullYear(), ahoraMX.getUTCMonth(), ahoraMX.getUTCDate()));
    const dia = ahoraMX.getUTCDay();
    if (!prueba && (dia === 0 || dia === 6)) return new Response(JSON.stringify({ ok: true, mensaje: 'Fin de semana' }), { headers: cors });

    const hoyISO = hoy.toISOString().slice(0, 10);
    const en90 = new Date(hoy); en90.setUTCDate(en90.getUTCDate() + 90);
    const { data: docs, error } = await db.from('compliance_documentos')
      .select('id, colegio, tipo_documento, materia, estado, vigente_hasta, recordatorio_90_at, recordatorio_30_at, recordatorio_7_at')
      .eq('activo', true)
      .not('vigente_hasta', 'is', null)
      .gte('vigente_hasta', hoyISO)
      .lte('vigente_hasta', en90.toISOString().slice(0, 10));
    if (error) throw error;

    // Qué aviso le toca a cada documento hoy (el más cercano que no se haya mandado)
    const porColegio = new Map<string, { d: any; etapa: Etapa; dias: number }[]>();
    for (const d of docs ?? []) {
      const dias = Math.round((new Date(String(d.vigente_hasta).slice(0, 10) + 'T00:00:00Z').getTime() - hoy.getTime()) / 86400e3);
      let etapa: Etapa | null = null;
      if (dias <= 7 && !d.recordatorio_7_at) etapa = 7;
      else if (dias <= 30 && dias > 7 && !d.recordatorio_30_at) etapa = 30;
      else if (dias <= 90 && dias > 30 && !d.recordatorio_90_at) etapa = 90;
      if (!etapa) continue;
      const lista = porColegio.get(d.colegio) ?? [];
      lista.push({ d, etapa, dias });
      porColegio.set(d.colegio, lista);
    }

    const { data: dir } = await db.from('directorio').select('codigo, nombre, adm_nombre, adm_correo');
    const contacto = new Map((dir ?? []).map((r: any) => [r.codigo, r]));

    const resultado: any[] = [];
    for (const [colegio, items] of porColegio) {
      const c: any = contacto.get(colegio) ?? {};
      const correo = separarCorreos(String(c.adm_correo ?? '')).join(', ');
      const nombreColegio = c.nombre || colegio;
      items.sort((a, b) => a.dias - b.dias);
      if (!correo) { resultado.push({ colegio, documentos: items.length, enviado: false, motivo: 'Sin correo de administrador en Directorio' }); continue; }
      if (prueba) { resultado.push({ colegio, correo, documentos: items.map(i => `${i.d.tipo_documento} (${i.dias} días)`) }); continue; }

      const peor = Math.min(...items.map(i => i.etapa)) as Etapa;
      try {
        await sendEmail(correo, `⏰ [RCMA] ${nombreColegio}: ${items.length} documento${items.length !== 1 ? 's' : ''} por vencer`, plantilla({
          franja: `⏰ ${items.length} documento${items.length !== 1 ? 's' : ''} de Cumplimiento por vencer`, color: COLOR[peor],
          cuerpo: `<p style="margin:0 0 8px;">Hola${c.adm_nombre ? ` <b>${esc(c.adm_nombre)}</b>` : ''}:</p>
            <p style="margin:0 0 8px;">Estos documentos de <b>${esc(nombreColegio)}</b> están próximos a vencer. Por favor inicia su renovación a tiempo y, cuando la tengas, súbela al sistema o envíala a la Coordinación RCMA.</p>
            ${tablaDocs(items.map(i => ({
              documento: i.d.tipo_documento,
              detalle: `Vence ${String(i.d.vigente_hasta).slice(0, 10).split('-').reverse().join('/')} · faltan ${i.dias} día${i.dias !== 1 ? 's' : ''} (aviso de ${ETIQUETA[i.etapa]})`,
              color: COLOR[i.etapa],
            })))}`,
          boton: { texto: 'Ver mis documentos', url: `${siteUrl}/cumplimiento/mis-documentos` },
          pie: 'Coordinación de Obras y Mantenimiento RCMA · Avisos 3 meses, 1 mes y 1 semana antes del vencimiento',
        }));
        // Marca los avisos: al mandar uno más cercano, los anteriores ya no aplican
        const ahora = new Date().toISOString();
        for (const i of items) {
          const upd: Record<string, string> = { recordatorio_90_at: i.d.recordatorio_90_at ?? ahora };
          if (i.etapa <= 30) upd.recordatorio_30_at = i.d.recordatorio_30_at ?? ahora;
          if (i.etapa === 7) upd.recordatorio_7_at = ahora;
          await db.from('compliance_documentos').update(upd).eq('id', i.d.id);
        }
        resultado.push({ colegio, correo, documentos: items.length, enviado: true });
      } catch (e) {
        resultado.push({ colegio, correo, documentos: items.length, enviado: false, motivo: e instanceof Error ? e.message : String(e) });
      }
    }

    // Resumen interno para la Coordinación
    const enviados = resultado.filter(r => r.enviado).length;
    if (!prueba && resultado.length) {
      const { data: p } = await db.from('user_permissions').select('user_id').ilike('user_email', adminEmail.replace(/[\\%_]/g, m => '\\' + m)).limit(1).maybeSingle();
      if (p?.user_id) {
        const sinCorreo = resultado.filter(r => !r.enviado).map(r => r.colegio);
        await db.from('notificaciones').insert({
          usuario_id: p.user_id, tipo: sinCorreo.length ? 'alerta' : 'info',
          titulo: `Recordatorios de vencimiento enviados a ${enviados} colegio(s)`,
          mensaje: sinCorreo.length ? `No se pudo avisar a: ${sinCorreo.join(', ')}` : 'Avisos de 3 meses, 1 mes y 1 semana.',
          link: '/cumplimiento/alertas', modulo: 'cumplimiento',
        });
      }
    }

    const respuesta = prueba ? resultado : resultado.map(r => ({ colegio: r.colegio, documentos: Array.isArray(r.documentos) ? r.documentos.length : r.documentos, enviado: !!r.enviado }));
    return new Response(JSON.stringify({ ok: true, colegios: resultado.length, enviados, resultado: respuesta }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.log('[cumplimiento-recordatorios] error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
