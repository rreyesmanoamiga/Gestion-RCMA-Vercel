import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? '*';
const corsHeaders = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

const CAR_CORREOS: Record<string, string> = {
  NORTE:  'jalvarado@manoamiga.edu.mx',
  MEXICO: 'gromero@manoamiga.edu.mx',
  FMA:    'fguerra@manoamiga.edu.mx',
};

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
  await tw('MAIL FROM:<' + smtpUser + '>'); await tr();
  await tw('RCPT TO:<' + to + '>'); await tr();
  await tw('DATA'); await tr();
  const msg = ['From: Sistema RCMA <' + smtpUser + '>', 'To: ' + to, 'Subject: ' + subject, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html, '.'].join('\r\n');
  await tw(msg); await tr(); await tw('QUIT'); tls.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { proyecto, centro, territorio, archivos, subido_por, siteUrl } = await req.json();
    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const appUrl     = siteUrl ?? Deno.env.get('SITE_URL') ?? '';
    const carEmail   = CAR_CORREOS[territorio] ?? '';

    const archivosHTML = (archivos as string[]).map((a: string) =>
      '<li style="padding:4px 0;font-size:13px;color:#0f172a;">📎 ' + a + '</li>'
    ).join('');

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px;"><div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;"><div style="background:#0f172a;padding:20px 28px;"><h1 style="color:#fff;font-size:17px;font-weight:700;margin:0;">📎 Cotizaciones Subidas</h1></div><div style="padding:24px 28px;"><p style="color:#334155;font-size:14px;">Cotizaciones para <strong>' + proyecto + '</strong> del colegio <strong>' + centro + '</strong>.</p><ul style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">' + archivosHTML + '</ul><p style="color:#64748b;font-size:12px;margin-top:12px;">Subido por: <strong>' + subido_por + '</strong></p><div style="text-align:center;margin-top:20px;"><a href="' + appUrl + '/solicitudes-recibidas" style="display:inline-block;background:#0f172a;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;">Ver en el sistema →</a></div></div></div></body></html>';

    await sendEmail(adminEmail, '📎 Cotizaciones subidas — ' + proyecto + ' | ' + centro, html);
    if (carEmail && carEmail !== adminEmail) {
      await sendEmail(carEmail, '📎 Cotizaciones subidas — ' + proyecto + ' | ' + centro, html);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
