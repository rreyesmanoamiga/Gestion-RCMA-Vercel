// Ticket MAS de FMA: avisos del Vo. Bo. de Gerencia.
//  tipo 'pendiente' → a quienes autorizan tickets de FMA (permiso en Accesos), copia a la Coordinación.
//  tipo 'vobo'      → a la Coordinación (y al solicitante si es otra persona): Gerencia ya autorizó.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmail(to: string, cc: string[], subject: string, html: string) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';

  const conn = await Deno.connect({ hostname: smtpHost, port: smtpPort });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const read = async () => {
    const buf = new Uint8Array(1024);
    const n = await conn.read(buf);
    return decoder.decode(buf.subarray(0, n ?? 0));
  };
  const write = async (data: string) => {
    await conn.write(encoder.encode(data + '\r\n'));
  };

  await read();
  await write('EHLO outlook.com');
  await read();
  await write('STARTTLS');
  await read();

  const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
  const tlsWrite = async (data: string) => {
    await tlsConn.write(encoder.encode(data + '\r\n'));
  };
  const tlsRead = async () => {
    const buf = new Uint8Array(4096);
    const n = await tlsConn.read(buf);
    return decoder.decode(buf.subarray(0, n ?? 0));
  };

  await tlsWrite('EHLO outlook.com');
  await tlsRead();
  await tlsWrite('AUTH LOGIN');
  await tlsRead();
  await tlsWrite(btoa(smtpUser));
  await tlsRead();
  await tlsWrite(btoa(smtpPass));
  await tlsRead();
  await tlsWrite(`MAIL FROM:<${smtpUser}>`);
  await tlsRead();
  await tlsWrite(`RCPT TO:<${to}>`);
  await tlsRead();
  // CC recipients
  for (const ccAddr of cc) {
    if (ccAddr) { await tlsWrite(`RCPT TO:<${ccAddr}>`); await tlsRead(); }
  }
  await tlsWrite('DATA');
  await tlsRead();

  const boundary = 'boundary_' + Date.now();
  const ccHeader = cc.filter(Boolean).join(', ');
  const message = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to}`,
    ...(ccHeader ? [`Cc: ${ccHeader}`] : []),
    `Subject: ${asunto(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '',
    `--${boundary}--`,
    '.',
  ].join('\r\n');

  await tlsWrite(message);
  await tlsRead();
  await tlsWrite('QUIT');
  tlsConn.close();
}

/** Asunto con acentos/emoji codificado (RFC 2047) */
function asunto(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const esCorreo = (s: unknown): s is string => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { tipo, folio, colegio, proyecto, descripcion, solicitante, correo_solicitante, importe, proveedor, forma_financiamiento, vobo_por, comentario } = await req.json();
    if (tipo !== 'pendiente' && tipo !== 'vobo') throw new Error('Tipo de aviso no válido');

    const adminEmail = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const siteUrl = Deno.env.get('SITE_URL') ?? '';

    // Quienes autorizan (permiso en Accesos); respaldo: Gerente del Directorio
    let autorizadores: string[] = [];
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceKey) {
      const sb = createClient(supabaseUrl, serviceKey);
      const { data } = await sb.from('user_permissions').select('user_email').eq('autorizar_ticket_mas_fma', true);
      autorizadores = (data ?? []).map((r: { user_email: string }) => (r.user_email ?? '').toLowerCase()).filter(esCorreo);
      if (!autorizadores.length) {
        const { data: g } = await sb.from('directorio').select('gerente_correo').eq('codigo', 'GENERAL').maybeSingle();
        if (esCorreo(g?.gerente_correo)) autorizadores = [g!.gerente_correo.toLowerCase()];
      }
    }
    const solicitante_ = String(correo_solicitante ?? '').toLowerCase();
    const unicos = (xs: string[]) => xs.filter((x, i, a) => esCorreo(x) && a.indexOf(x) === i);

    let para: string, copias: string[];
    if (tipo === 'pendiente') {
      const lista = unicos(autorizadores.filter(a => a !== solicitante_));
      if (!lista.length) throw new Error('No hay a quién avisar: activa el permiso "Autorizar Ticket MAS de FMA (Gerencia)" en Accesos');
      para = lista[0];
      copias = unicos([...lista.slice(1), adminEmail, solicitante_]).filter(c => c !== para);
    } else {
      para = adminEmail;
      copias = unicos([solicitante_, ...autorizadores]).filter(c => c !== para);
    }

    const fila = (k: string, v: unknown, alt: boolean) => `<tr${alt ? ' style="background:#f8fafc;"' : ''}><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;width:38%;border-bottom:1px solid #e2e8f0;">${k}</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${esc(v) || '—'}</td></tr>`;
    const importeTxt = importe != null && importe !== '' ? Number(importe).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '';
    const banda = tipo === 'pendiente'
      ? { color: '#4F82C2', texto: `🖊️ Ticket MAS ${folio ?? ''} pendiente de tu autorización` }
      : { color: '#059669', texto: `✅ Gerencia autorizó el Ticket MAS ${folio ?? ''}` };
    const intro = tipo === 'pendiente'
      ? 'Se envió un Ticket MAS de Federación Mano Amiga que requiere la autorización (Vo. Bo.) de Gerencia. Entra al Sistema RCMA, revisa el ticket y autorízalo con tu usuario.'
      : `${esc(vobo_por || 'Gerencia')} dio su Vo. Bo. a este Ticket MAS. La Coordinación RCMA ya puede completar la autorización en el sistema (registro del ticket, proyecto y expediente).`;

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #ED7102;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Coordinación de Obras — Federación Mano Amiga</p>
      </td></tr>
      <tr><td style="background:${banda.color};padding:16px 40px;"><p style="margin:0;color:#fff;font-size:14px;font-weight:600;">${esc(banda.texto)}</p></td></tr>
      <tr><td style="padding:32px 36px;">
        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">${intro}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:22px;">
          ${fila('Folio', folio, true)}${fila('Oficina', colegio, false)}${fila('Proyecto', proyecto, true)}${fila('Descripción', descripcion, false)}
          ${fila('Proveedor seleccionado', proveedor, true)}${fila('Importe', importeTxt, false)}${fila('Forma de financiamiento', forma_financiamiento, true)}${fila('Solicitante', solicitante, false)}
        </table>
        ${tipo === 'vobo' && comentario ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:22px;"><tr><td style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:14px 16px;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#065F46;text-transform:uppercase;">Comentario de Gerencia</p><p style="margin:0;font-size:13px;color:#064E3B;">${esc(comentario)}</p></td></tr></table>` : ''}
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="background:#00295A;border-radius:8px;padding:12px 28px;">
          <a href="${siteUrl}/ticket-mas" style="color:#fff;font-size:14px;font-weight:600;text-decoration:none;">${tipo === 'pendiente' ? 'Revisar y autorizar →' : 'Abrir el ticket →'}</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;"><p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Este correo fue enviado automáticamente por <strong>Sistema RCMA</strong> · ${esc(smtpUser)}</p></td></tr>
    </table>
  </td></tr></table>
</body></html>`;

    const subject = tipo === 'pendiente'
      ? `🖊️ Autorizar Ticket MAS ${folio ?? ''} — ${colegio ?? 'FMA'}`
      : `✅ Vo. Bo. de Gerencia: Ticket MAS ${folio ?? ''} — ${colegio ?? 'FMA'}`;
    await sendEmail(para, copias, subject, html);
    return new Response(JSON.stringify({ success: true, para, copias }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
