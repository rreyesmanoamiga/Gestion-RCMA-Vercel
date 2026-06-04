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
    const appUrl = siteUrl ?? Deno.env.get('SITE_URL') ?? '';
    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#0f172a;padding:20px 28px;">
      <p style="color:#94a3b8;font-size:11px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.08em;">Sistema RCMA — NEXUS</p>
      <h1 style="color:#fff;font-size:17px;font-weight:700;margin:0;">Nuevo comentario en tu pendiente</h1>
    </div>
    <div style="padding:24px 28px;">
      <p style="color:#334155;font-size:14px;margin:0 0 16px;">Hola <strong>${destinatario_nombre}</strong>, <strong>${autor_nombre}</strong> dejó un comentario en:</p>
      <div style="background:#f8fafc;border-left:4px solid #0d8a7e;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:16px;">
        <p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 4px;">📌 ${pendiente_titulo}</p>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
        <p style="font-size:12px;font-weight:700;color:#1e40af;margin:0 0 6px;">${autor_nombre} escribió:</p>
        <p style="font-size:13px;color:#1e3a5f;margin:0;">${comentario}</p>
      </div>
      <div style="text-align:center;margin-top:20px;">
        <a href="${appUrl}/nexus" style="display:inline-block;background:#0f172a;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;">Responder en el sistema →</a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">Sistema RCMA · NEXUS · <a href="mailto:${adminEmail}" style="color:#64748b;">${adminEmail}</a></p>
    </div>
  </div>
</body></html>`;
    await sendEmail(destinatario_email, `💬 Nuevo comentario: ${pendiente_titulo}`, html);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});