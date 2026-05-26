import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmail(to: string, cc: string[], subject: string, html: string) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';

  const conn    = await Deno.connect({ hostname: smtpHost, port: smtpPort });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const read    = async () => { const b = new Uint8Array(1024); const n = await conn.read(b); return decoder.decode(b.subarray(0, n ?? 0)); };
  const write   = async (d: string) => { await conn.write(encoder.encode(d + '\r\n')); };

  await read(); await write('EHLO outlook.com'); await read(); await write('STARTTLS'); await read();

  const tls      = await Deno.startTls(conn, { hostname: smtpHost });
  const tlsWrite = async (d: string) => { await tls.write(encoder.encode(d + '\r\n')); };
  const tlsRead  = async () => { const b = new Uint8Array(4096); const n = await tls.read(b); return decoder.decode(b.subarray(0, n ?? 0)); };

  await tlsWrite('EHLO outlook.com'); await tlsRead();
  await tlsWrite('AUTH LOGIN');       await tlsRead();
  await tlsWrite(btoa(smtpUser));     await tlsRead();
  await tlsWrite(btoa(smtpPass));     await tlsRead();
  await tlsWrite(`MAIL FROM:<${smtpUser}>`); await tlsRead();
  await tlsWrite(`RCPT TO:<${to}>`);        await tlsRead();

  // CC recipients
  for (const ccAddr of cc) {
    if (ccAddr) { await tlsWrite(`RCPT TO:<${ccAddr}>`); await tlsRead(); }
  }

  await tlsWrite('DATA'); await tlsRead();

  const boundary = 'bnd_' + Date.now();
  const ccHeader = cc.filter(Boolean).join(', ');
  const msg = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to}`,
    ...(ccHeader ? [`Cc: ${ccHeader}`] : []),
    `Subject: ${subject}`,
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

  await tlsWrite(msg); await tlsRead(); await tlsWrite('QUIT'); tls.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { folio, colegio, solicitante, puesto, correo_solicitante, descripcion, clasificacion, territorio, correo_car } = await req.json();

    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const smtpUser   = Deno.env.get('SMTP_USER')   ?? '';
    const siteUrl    = Deno.env.get('SITE_URL')     ?? '';

    // CC: jefe + ambos CARs (o solo el CAR del territorio si se conoce)
    const CAR_CORREOS: Record<string, string> = {
      NORTE:  'jalvarado@manoamiga.edu.mx',
      MEXICO: 'gromero@manoamiga.edu.mx',
    };
    const carTerritorio = correo_car ?? (territorio ? CAR_CORREOS[territorio] ?? '' : '');
    const ccList = [
      'arodriguez@manoamiga.edu.mx',
      'jalvarado@manoamiga.edu.mx',
      'gromero@manoamiga.edu.mx',
    ].filter((addr, i, arr) => addr && arr.indexOf(addr) === i); // deduplicar

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#0f172a;padding:28px 36px;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Coordinación de Obras — Colegios Mano Amiga</p>
        </td></tr>
        <tr><td style="background:#1d4ed8;padding:12px 36px;">
          <p style="margin:0;color:#fff;font-size:13px;font-weight:600;">🎫 Nuevo Ticket MAS Recibido — ${folio}</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="color:#475569;font-size:14px;margin:0 0 20px;">Se registró un nuevo Ticket de Construcciones, Mejoras y Mantenimiento. Aquí el resumen:</p>
          <table width="100%" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;width:38%;border-bottom:1px solid #e2e8f0;">Folio</td><td style="padding:10px 14px;font-size:13px;font-weight:700;color:#1d4ed8;border-bottom:1px solid #e2e8f0;">${folio}</td></tr>
            <tr><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Colegio</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${colegio ?? '—'}</td></tr>
            <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Solicitante</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${solicitante ?? '—'}</td></tr>
            <tr><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Puesto</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${puesto ?? '—'}</td></tr>
            <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Correo</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${correo_solicitante ?? '—'}</td></tr>
            <tr><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Clasificación</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${clasificacion ?? '—'}</td></tr>
            <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Descripción</td><td style="padding:10px 14px;font-size:12px;color:#475569;">${descripcion ?? '—'}</td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background:#0f172a;border-radius:8px;padding:12px 28px;">
              <a href="${siteUrl}/ticket-mas" style="color:#fff;font-size:14px;font-weight:600;text-decoration:none;">Revisar ticket en el sistema →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · Coordinación de Obras © ${new Date().getFullYear()}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await sendEmail(adminEmail, ccList, `🎫 Nuevo Ticket MAS: ${folio} — ${colegio ?? ''}`, html);

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