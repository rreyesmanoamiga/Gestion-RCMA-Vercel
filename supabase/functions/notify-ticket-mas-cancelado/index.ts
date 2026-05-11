import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmail(to: string, subject: string, html: string) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const conn  = await Deno.connect({ hostname: smtpHost, port: smtpPort });
  const read  = async () => { const b = new Uint8Array(1024); const n = await conn.read(b); return decoder.decode(b.subarray(0, n ?? 0)); };
  const write = async (d: string) => { await conn.write(encoder.encode(d + '\r\n')); };

  await read();
  await write('EHLO outlook.com'); await read();
  await write('STARTTLS');         await read();

  const tls      = await Deno.startTls(conn, { hostname: smtpHost });
  const tlsWrite = async (d: string) => { await tls.write(encoder.encode(d + '\r\n')); };
  const tlsRead  = async () => { const b = new Uint8Array(4096); const n = await tls.read(b); return decoder.decode(b.subarray(0, n ?? 0)); };

  await tlsWrite('EHLO outlook.com'); await tlsRead();
  await tlsWrite('AUTH LOGIN');       await tlsRead();
  await tlsWrite(btoa(smtpUser));     await tlsRead();
  await tlsWrite(btoa(smtpPass));     await tlsRead();
  await tlsWrite(`MAIL FROM:<${smtpUser}>`); await tlsRead();
  await tlsWrite(`RCPT TO:<${to}>`);        await tlsRead();
  await tlsWrite('DATA');                    await tlsRead();

  const boundary = 'bnd_' + Date.now();

  const msg =
    `From: Sistema RCMA <${smtpUser}>\r\n` +
    `To: ${to}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: multipart/alternative; boundary="${boundary}"\r\n` +
    `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset=UTF-8\r\n` +
    `Content-Transfer-Encoding: quoted-printable\r\n` +
    `\r\n` +
    html + `\r\n` +
    `\r\n--${boundary}--\r\n` +
    `.`;

  await tlsWrite(msg);
  await tlsRead();
  await tlsWrite('QUIT');
  tls.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { folio, colegio, solicitante, correo_solicitante, motivo } = await req.json();

    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const hoy      = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

    const html =
      `<!DOCTYPE html>` +
      `<html lang="es"><head><meta charset="UTF-8"/></head>` +
      `<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">` +
      `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">` +
      `<tr><td align="center">` +
      `<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">` +
      `<tr><td style="background:#0f172a;padding:28px 36px;">` +
      `<h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Sistema RCMA</h1>` +
      `<p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Coordinación de Obras — Colegios Mano Amiga</p>` +
      `</td></tr>` +
      `<tr><td style="background:#dc2626;padding:12px 36px;">` +
      `<p style="margin:0;color:#ffffff;font-size:13px;font-weight:600;">Ticket MAS Cancelado &mdash; ${folio ?? ''}</p>` +
      `</td></tr>` +
      `<tr><td style="padding:32px 36px;">` +
      `<p style="color:#475569;font-size:14px;margin:0 0 8px;">Estimado(a) <strong>${solicitante ?? 'solicitante'}</strong>,</p>` +
      `<p style="color:#475569;font-size:14px;margin:0 0 24px;">Le informamos que el siguiente Ticket MAS ha sido <strong style="color:#dc2626;">cancelado</strong> por la Coordinación de Obras RCMA.</p>` +
      `<table width="100%" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">` +
      `<tr style="background:#fef2f2;"><td style="padding:9px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;width:38%;border-bottom:1px solid #fecaca;">Folio</td>` +
      `<td style="padding:9px 14px;font-size:13px;font-weight:700;color:#dc2626;border-bottom:1px solid #fecaca;">${folio ?? '&mdash;'}</td></tr>` +
      `<tr><td style="padding:9px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Colegio</td>` +
      `<td style="padding:9px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${colegio ?? '&mdash;'}</td></tr>` +
      `<tr style="background:#fef2f2;"><td style="padding:9px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Motivo de Cancelación</td>` +
      `<td style="padding:9px 14px;font-size:13px;color:#dc2626;font-weight:600;">${motivo ?? '&mdash;'}</td></tr>` +
      `</table>` +
      `<p style="color:#64748b;font-size:13px;margin:0;">Si tiene alguna duda, comuníquese con la Coordinación de Obras RCMA.</p>` +
      `</td></tr>` +
      `<tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">` +
      `<p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Ricardo Joanathan Reyes Medina &middot; Coordinador de Obras RCMA &middot; ${hoy}</p>` +
      `</td></tr>` +
      `</table></td></tr></table>` +
      `</body></html>`;

    await sendEmail(
      correo_solicitante,
      `Ticket Cancelado: ${folio ?? ''} - ${colegio ?? ''}`,
      html,
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});