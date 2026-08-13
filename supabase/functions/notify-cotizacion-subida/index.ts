import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? '*';
const corsHeaders = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

const CAR_CORREOS: Record<string, string> = {
  NORTE:  'jalvarado@manoamiga.edu.mx',
  MEXICO: 'gromero@manoamiga.edu.mx',
  FMA:    'fguerra@manoamiga.edu.mx',
};

async function sendEmail(to: string, cc: string[], subject: string, html: string) {
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
  for (const ccAddr of cc) { if (ccAddr) { await tw('RCPT TO:<' + ccAddr + '>'); await tr(); } }
  await tw('DATA'); await tr();
  const ccHeader = cc.filter(Boolean).join(', ');
  const msg = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to}`,
    ...(ccHeader ? [`Cc: ${ccHeader}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '', html, '.',
  ].join('\r\n');
  await tw(msg); await tr(); await tw('QUIT'); tls.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { proyecto, centro, territorio, archivos, subido_por, siteUrl } = await req.json();
    const smtpUser   = Deno.env.get('SMTP_USER') ?? '';
    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const appUrl     = siteUrl ?? Deno.env.get('SITE_URL') ?? '';
    const carEmail   = CAR_CORREOS[territorio] ?? '';

    const archivosHTML = (archivos as string[] ?? []).map((a: string) =>
      `<li style="padding:6px 0;font-size:13px;color:#0f172a;list-style:none;">📎 ${a}</li>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #ED7102;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Coordinación de Obras — Colegios Mano Amiga</p>
        </td></tr>
        <tr><td style="background:#4F82C2;padding:16px 40px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">📎 Cotizaciones Subidas — ${proyecto ?? '—'}</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
            Se subieron cotizaciones para <strong>${proyecto ?? '—'}</strong> del colegio <strong>${centro ?? '—'}</strong>:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:28px;">
            <tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;width:35%;border-bottom:1px solid #e2e8f0;">Proyecto</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${proyecto ?? '—'}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Colegio</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${centro ?? '—'}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;${archivosHTML ? 'border-bottom:1px solid #e2e8f0;' : ''}">Archivos</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;${archivosHTML ? 'border-bottom:1px solid #e2e8f0;' : ''}"><ul style="margin:0;padding:0;">${archivosHTML}</ul></td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Subido por</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;">${subido_por ?? '—'}</td>
            </tr>
          </table>
          <a href="${appUrl}/solicitudes-recibidas" style="display:inline-block;background:#4F82C2;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ver en el Sistema →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · ${smtpUser}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const ccList = [carEmail, 'arodriguez@manoamiga.edu.mx'].filter(c => c && c !== adminEmail);
    await sendEmail(adminEmail, ccList, `📎 [RCMA] Cotizaciones subidas — ${proyecto ?? '—'} | ${centro ?? '—'}`, html);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
