import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmail(to: string, subject: string, html: string) {
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
  await tlsWrite('DATA');
  await tlsRead();

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

  await tlsWrite(message);
  await tlsRead();
  await tlsWrite('QUIT');
  tlsConn.close();
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Verificar que el llamante es admin ────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No autorizado' }, 401);

    const supabaseVerify = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: authError } = await supabaseVerify.auth.getUser();
    if (authError || !caller) return json({ error: 'No autorizado' }, 401);
    if (caller.user_metadata?.role !== 'admin') {
      return json({ error: 'Acceso denegado: se requiere rol de administrador' }, 403);
    }
    // ─────────────────────────────────────────────────────────────────────────

    const body = await req.json();
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!email) return json({ error: 'El campo email es requerido' }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const siteUrl  = Deno.env.get('SITE_URL')  ?? '';
    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const redirectTo = `${siteUrl}/reset-password`;

    // Usar generateLink en vez de inviteUserByEmail: Supabase NO manda su propio
    // correo, solo generamos el enlace y lo enviamos con nuestro formato.
    // 1) Invitación normal (usuario nuevo o invitado que nunca activó su cuenta).
    // 2) Si Supabase responde que el correo ya está registrado, se manda un enlace
    //    de recuperación: lleva a la misma pantalla para crear su contraseña.
    let reenvio = false;
    let { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite', email, options: { redirectTo },
    });
    if (error && /already|registered|exists/i.test(error.message ?? '')) {
      reenvio = true;
      ({ data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery', email, options: { redirectTo },
      }));
    }
    if (error) throw error;
    if (body?.reenviar) reenvio = true;

    // Link real de activación con token correcto
    const actionLink = (data as any)?.properties?.action_link ?? siteUrl;

    // Guardar el user_id real (auth.users.id) en user_permissions,
    // para que las notificaciones internas puedan resolver correo → usuario_id
    const nuevoUserId = (data as any)?.user?.id ?? null;
    if (nuevoUserId) {
      await supabaseAdmin.from('user_permissions')
        .update({ user_id: nuevoUserId })
        .ilike('user_email', email);
    }

    const titulo  = reenvio ? 'Tu nuevo enlace de acceso' : 'Has sido invitado 🎉';
    const parrafo = reenvio
      ? 'Te enviamos un nuevo enlace para que actives tu cuenta en <strong>Sistema RCMA</strong> — la plataforma de gestión de obras de Colegios Mano Amiga. El enlace anterior ya no es válido.'
      : 'El administrador del sistema te ha invitado a acceder a <strong>Sistema RCMA</strong> — la plataforma de gestión de obras de Colegios Mano Amiga.';
    const asunto  = reenvio
      ? '🔐 Nuevo enlace de acceso al Sistema RCMA — Colegios Mano Amiga'
      : '🔐 Invitación al Sistema RCMA — Colegios Mano Amiga';

    const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #ED7102;">
                <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
                <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Coordinación de Obras — Colegios Mano Amiga</p>
              </td>
            </tr>
            <tr>
              <td style="padding:40px;">
                <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">${titulo}</h2>
                <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
                  ${parrafo}
                </p>
                <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 32px;">
                  Haz clic en el botón para activar tu cuenta y crear tu contraseña:
                </p>
                <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                  <tr>
                    <td style="background:#00295A;border-radius:8px;padding:14px 32px;">
                      <a href="${actionLink}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                        Activar mi cuenta →
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="color:#94a3b8;font-size:13px;margin:0;">
                  Si no esperabas este correo puedes ignorarlo.
                  Este enlace expira en 24 horas.
                </p>
              </td>
            </tr>
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

    await sendEmail(email, asunto, html);

    // Registrar en auditoría: quién invitó a quién
    try {
      await supabaseAdmin.from('auditoria_sistema').insert({
        usuario_id:     caller.id,
        usuario_nombre: caller.user_metadata?.full_name ?? caller.email,
        usuario_email:  caller.email,
        accion:         reenvio ? 'invitacion_reenviada' : 'invitacion_enviada',
        modulo:         'usuarios',
        registro_id:    nuevoUserId,
        registro_ref:   email,
      });
    } catch { /* no bloqueante */ }

    return json({ success: true, reenvio });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return json({ error: message }, 500);
  }
});
