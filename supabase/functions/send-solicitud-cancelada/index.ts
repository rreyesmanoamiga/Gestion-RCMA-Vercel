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

  await tlsWrite(message);
  await tlsRead();
  await tlsWrite('QUIT');
  tlsConn.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { correo, nombre, proyecto, centro, territorio, correoAdmin } = await req.json();

    if (!correo) {
      return new Response(
        JSON.stringify({ error: 'El campo correo es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const CAR_CORREOS: Record<string, string> = {
      NORTE:  'jalvarado@manoamiga.edu.mx',
      MEXICO: 'gromero@manoamiga.edu.mx',
    };
    const adminEmail = correoAdmin || Deno.env.get('ADMIN_EMAIL') || 'rreyes@manoamiga.edu.mx';
    const carEmail    = territorio ? (CAR_CORREOS[territorio] ?? '') : '';
    const ccList      = [adminEmail, carEmail].filter(Boolean).filter((c, i, arr) => arr.indexOf(c) === i && c !== correo);

    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const fecha    = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <!-- Header -->
            <tr>
              <td style="background:#0f172a;padding:32px 40px;">
                <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
                <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Coordinación de Obras — Colegios Mano Amiga</p>
              </td>
            </tr>
            <!-- Alerta roja -->
            <tr>
              <td style="background:#dc2626;padding:16px 40px;">
                <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;">
                  ❌ Solicitud cancelada — ${proyecto ?? 'Proyecto'}
                </p>
              </td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding:40px;">
                <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px;">
                  Hola <strong>${nombre ?? 'solicitante'}</strong>,
                </p>
                <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
                  La Coordinación de Obras de <strong>Colegios Mano Amiga</strong> ha registrado la <strong>cancelación</strong> de la solicitud de proyecto:
                </p>
                <!-- Tabla de datos -->
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:32px;">
                  <tr style="background:#f8fafc;">
                    <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;width:40%;border-bottom:1px solid #e2e8f0;">Proyecto</td>
                    <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${proyecto ?? '—'}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Centro</td>
                    <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${centro ?? '—'}</td>
                  </tr>
                  <tr style="background:#f8fafc;">
                    <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Solicitante</td>
                    <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${nombre ?? '—'}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Estatus</td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
                      <span style="background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;">CANCELADA</span>
                    </td>
                  </tr>
                  <tr style="background:#f8fafc;">
                    <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Fecha de cancelación</td>
                    <td style="padding:12px 16px;font-size:14px;color:#0f172a;">${fecha}</td>
                  </tr>
                </table>
                <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">
                  Si tienes alguna duda sobre esta cancelación, comunícate directamente con la Coordinación de Obras escribiendo a <a href="mailto:rreyes@manoamiga.edu.mx" style="color:#1e40af;">rreyes@manoamiga.edu.mx</a>.
                </p>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                  Este correo fue enviado desde <strong>Sistema RCMA</strong> · ${smtpUser}
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>`;

    await sendEmail(
      correo,
      ccList,
      `❌ Solicitud cancelada: ${proyecto ?? 'Tu proyecto'} — Colegios Mano Amiga`,
      html
    );

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
