import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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
  const read = async () => { const buf = new Uint8Array(1024); const n = await conn.read(buf); return decoder.decode(buf.subarray(0, n ?? 0)); };
  const write = async (data: string) => { await conn.write(encoder.encode(data + '\r\n')); };

  await read();
  await write('EHLO outlook.com'); await read();
  await write('STARTTLS'); await read();

  const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
  const tlsWrite = async (data: string) => { await tlsConn.write(encoder.encode(data + '\r\n')); };
  const tlsRead = async () => { const buf = new Uint8Array(4096); const n = await tlsConn.read(buf); return decoder.decode(buf.subarray(0, n ?? 0)); };

  await tlsWrite('EHLO outlook.com'); await tlsRead();
  await tlsWrite('AUTH LOGIN'); await tlsRead();
  await tlsWrite(btoa(smtpUser)); await tlsRead();
  await tlsWrite(btoa(smtpPass)); await tlsRead();
  await tlsWrite(`MAIL FROM:<${smtpUser}>`); await tlsRead();
  await tlsWrite(`RCPT TO:<${to}>`); await tlsRead();
  for (const ccAddr of cc) { if (ccAddr) { await tlsWrite(`RCPT TO:<${ccAddr}>`); await tlsRead(); } }
  await tlsWrite('DATA'); await tlsRead();

  const boundary = 'boundary_' + Date.now();
  const ccHeader = cc.filter(Boolean).join(', ');
  const message = [
    `From: Sistema RCMA <${smtpUser}>`, `To: ${to}`,
    ...(ccHeader ? [`Cc: ${ccHeader}`] : []),
    `Subject: ${subject}`, 'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', '', html, '', `--${boundary}--`, '.',
  ].join('\r\n');

  await tlsWrite(message); await tlsRead();
  await tlsWrite('QUIT'); tlsConn.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { nombre, puesto, concepto, especificacion, colegio, territorio, correoSolicitante, aprobada, folio } = await req.json();
    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const smtpUser   = Deno.env.get('SMTP_USER')   ?? '';
    const siteUrl    = Deno.env.get('SITE_URL')    ?? '';

    if (aprobada) {
      // Notifica al solicitante que su solicitud CN fue aprobada y ya es un Trámite CN
      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
      <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;"><tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #059669;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Cumplimiento Normativo / Protección Civil</p></td></tr>
        <tr><td style="background:#059669;padding:16px 40px;"><p style="margin:0;color:#fff;font-size:14px;font-weight:600;">✅ Solicitud CN Aprobada — Trámite ${folio ?? ''}</p></td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">Tu solicitud fue aprobada y ahora es un <strong>Trámite CN</strong> en seguimiento activo dentro del sistema.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#64748b;">Folio Trámite</td><td style="padding:10px 16px;font-size:14px;font-weight:700;color:#00295A;">${folio ?? '—'}</td></tr>
            <tr><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#64748b;">Concepto</td><td style="padding:10px 16px;font-size:14px;">${concepto ?? '—'}</td></tr>
            <tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#64748b;">Especificación</td><td style="padding:10px 16px;font-size:14px;">${especificacion ?? '—'}</td></tr>
            <tr><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#64748b;">Colegio</td><td style="padding:10px 16px;font-size:14px;">${colegio ?? '—'}</td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;"><p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">Sistema RCMA · ${smtpUser}</p></td></tr>
      </table></td></tr></table></body></html>`;
      await sendEmail(correoSolicitante ?? adminEmail, [], `Solicitud CN Aprobada: ${folio ?? ''}`, html);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;"><tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #ED7102;">
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Cumplimiento Normativo / Protección Civil</p></td></tr>
      <tr><td style="background:#ED7102;padding:16px 40px;"><p style="margin:0;color:#fff;font-size:14px;font-weight:600;">📋 Nueva Solicitud CN Recibida</p></td></tr>
      <tr><td style="padding:40px;">
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">Se registró una nueva solicitud de trámite de Cumplimiento Normativo / Protección Civil.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:32px;">
          <tr style="background:#f8fafc;"><td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;width:40%;border-bottom:1px solid #e2e8f0;">Solicitante</td><td style="padding:12px 16px;font-size:14px;border-bottom:1px solid #e2e8f0;">${nombre ?? '—'}</td></tr>
          <tr><td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;border-bottom:1px solid #e2e8f0;">Puesto</td><td style="padding:12px 16px;font-size:14px;border-bottom:1px solid #e2e8f0;">${puesto ?? '—'}</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;border-bottom:1px solid #e2e8f0;">Colegio</td><td style="padding:12px 16px;font-size:14px;border-bottom:1px solid #e2e8f0;">${colegio ?? '—'}</td></tr>
          <tr><td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;border-bottom:1px solid #e2e8f0;">Territorio</td><td style="padding:12px 16px;font-size:14px;border-bottom:1px solid #e2e8f0;">${territorio ?? '—'}</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;border-bottom:1px solid #e2e8f0;">Concepto</td><td style="padding:12px 16px;font-size:14px;font-weight:600;color:#00295A;border-bottom:1px solid #e2e8f0;">${concepto ?? '—'}</td></tr>
          <tr><td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;">Especificación</td><td style="padding:12px 16px;font-size:14px;">${especificacion ?? '—'}</td></tr>
        </table>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="background:#00295A;border-radius:8px;padding:14px 32px;">
          <a href="${siteUrl}/cumplimiento/solicitudes-cn" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Ver solicitud en el sistema →</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;"><p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">Sistema RCMA · ${smtpUser}</p></td></tr>
    </table></td></tr></table></body></html>`;

    await sendEmail(adminEmail, [], `Nueva Solicitud CN — ${colegio ?? ''}`, html);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
