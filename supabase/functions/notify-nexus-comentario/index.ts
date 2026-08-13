import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const corsHeaders = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

async function sendEmail(to: string, subject: string, html: string) {
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
  const tw = async (d: string) => { await tls.write(enc.encode(d + '\r\n')); };
  const tr = async () => { const b = new Uint8Array(4096); const n = await tls.read(b); return dec.decode(b.subarray(0, n ?? 0)); };
  await tw('EHLO outlook.com'); await tr(); await tw('AUTH LOGIN'); await tr();
  await tw(btoa(smtpUser)); await tr(); await tw(btoa(smtpPass)); await tr();
  await tw(`MAIL FROM:<${smtpUser}>`); await tr();
  await tw(`RCPT TO:<${to}>`); await tr();
  await tw('DATA'); await tr();
  const msg = [`From: Sistema RCMA <${smtpUser}>`, `To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html, '.'].join('\r\n');
  await tw(msg); await tr(); await tw('QUIT'); tls.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { destinatario_email, destinatario_nombre, autor_nombre, pendiente_titulo, comentario, siteUrl } = await req.json();
    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const appUrl = siteUrl ?? Deno.env.get('SITE_URL') ?? '';

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr><td style="background:#00295A;padding:28px 36px;border-bottom:3px solid #4F82C2;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">NEXUS — Coordinación de Obras</p>
        </td></tr>
        <tr><td style="background:#4F82C2;padding:14px 36px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">💬 Nuevo Comentario en tu Pendiente</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">Hola <strong>${destinatario_nombre}</strong>, <strong>${autor_nombre}</strong> dejó un comentario en:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:16px;">
            <tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;width:35%;">Pendiente</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;">${pendiente_titulo}</td>
            </tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:28px;">
            <tr><td style="padding:14px 16px;">
              <p style="font-size:12px;font-weight:700;color:#00295A;margin:0 0 6px;">${autor_nombre} escribió:</p>
              <p style="font-size:13px;color:#1e3a5f;margin:0;line-height:1.5;">${comentario}</p>
            </td></tr>
          </table>
          <a href="${appUrl}/nexus" style="display:inline-block;background:#4F82C2;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Responder en el Sistema →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · ${smtpUser}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
    await sendEmail(destinatario_email, `💬 Nuevo comentario: ${pendiente_titulo}`, html);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
