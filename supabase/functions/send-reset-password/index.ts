import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Mismo helper SMTP que usan las demás funciones ─────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';

  const conn    = await Deno.connect({ hostname: smtpHost, port: smtpPort });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const read    = async () => { const b = new Uint8Array(1024); const n = await conn.read(b); return decoder.decode(b.subarray(0, n ?? 0)); };
  const write   = async (d: string) => { await conn.write(encoder.encode(d + '\r\n')); };

  await read(); await write('EHLO outlook.com'); await read();
  await write('STARTTLS'); await read();

  const tls      = await Deno.startTls(conn, { hostname: smtpHost });
  const tlsWrite = async (d: string) => { await tls.write(encoder.encode(d + '\r\n')); };
  const tlsRead  = async () => { const b = new Uint8Array(4096); const n = await tls.read(b); return decoder.decode(b.subarray(0, n ?? 0)); };

  await tlsWrite('EHLO outlook.com'); await tlsRead();
  await tlsWrite('AUTH LOGIN');       await tlsRead();
  await tlsWrite(btoa(smtpUser));     await tlsRead();
  await tlsWrite(btoa(smtpPass));     await tlsRead();
  await tlsWrite(`MAIL FROM:<${smtpUser}>`); await tlsRead();
  await tlsWrite(`RCPT TO:<${to}>`);         await tlsRead();
  await tlsWrite('DATA');                    await tlsRead();

  const boundary = 'boundary_' + Date.now();
  const message = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to}`,
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

  await tlsWrite(message); await tlsRead();
  await tlsWrite('QUIT');
  tls.close();
}

// ── Handler principal (Auth Hook de Supabase — Send Email) ─────────────────────
// Payload que envía Supabase:
// { user: { email }, email_data: { token_hash, redirect_to, email_action_type, site_url } }
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload    = await req.json();
    const email      = payload?.user?.email ?? '';
    const emailData  = payload?.email_data  ?? {};
    const actionType = emailData?.email_action_type ?? '';
    const tokenHash  = emailData?.token_hash ?? '';
    const redirectTo = emailData?.redirect_to
      ?? 'https://gestion-rcma-vercel.vercel.app/reset-password';

    // Solo manejar correos de recuperación de contraseña
    if (actionType !== 'recovery') {
      return new Response('{}', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!email || !tokenHash) {
      return new Response('{}', {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Construir URL de verificación a través del endpoint de Supabase Auth
    const supabaseUrl     = Deno.env.get('SUPABASE_URL') ?? '';
    const confirmationUrl = `${supabaseUrl}/auth/v1/verify?token=${tokenHash}&type=recovery&redirect_to=${encodeURIComponent(redirectTo)}`;

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

            <tr>
              <td style="background:#0f172a;padding:32px 40px;">
                <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
                <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Coordinación de Obras — Colegios Mano Amiga</p>
              </td>
            </tr>

            <tr>
              <td style="background:#1d4ed8;padding:16px 40px;">
                <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;">🔐 Restablecer contraseña</p>
              </td>
            </tr>

            <tr>
              <td style="padding:40px;">
                <p style="color:#475569;font-size:15px;margin:0 0 8px;">Hola,</p>
                <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
                  Recibimos una solicitud para restablecer la contraseña de tu cuenta en el
                  <strong>Sistema RCMA</strong>. Haz clic en el botón para crear una nueva contraseña.
                </p>

                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="padding:24px 0;">
                      <a href="${confirmationUrl}"
                        style="background-color:#0f172a;color:#ffffff;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;display:inline-block;letter-spacing:0.5px;">
                        Restablecer Contraseña
                      </a>
                    </td>
                  </tr>
                </table>

                <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;margin-top:8px;">
                  <tr>
                    <td style="padding:14px 18px;">
                      <p style="margin:0;color:#854d0e;font-size:13px;line-height:1.6;">
                        ⚠️ <strong>Si no solicitaste este cambio</strong>, ignora este correo.
                        Tu contraseña actual seguirá siendo la misma.
                      </p>
                    </td>
                  </tr>
                </table>

                <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;text-align:center;">
                  Este enlace es válido por <strong>24 horas</strong> y solo puede usarse una vez.
                </p>
              </td>
            </tr>

            <tr>
              <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
                  Sistema RCMA &copy; ${new Date().getFullYear()} · Coordinación de Obras · Colegios Mano Amiga
                </p>
              </td>
            </tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>`;

    await sendEmail(email, 'Restablecer contraseña — Sistema RCMA', html);

    // Supabase Auth Hook espera respuesta vacía {} con status 200
    return new Response('{}', {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});