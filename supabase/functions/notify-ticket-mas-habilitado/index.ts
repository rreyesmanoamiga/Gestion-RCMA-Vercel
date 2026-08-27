import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app',
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
  const write = async (data: string) => { await conn.write(encoder.encode(data + '\r\n')); };

  await read();
  await write('EHLO outlook.com');
  await read();
  await write('STARTTLS');
  await read();

  const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
  const tlsWrite = async (data: string) => { await tlsConn.write(encoder.encode(data + '\r\n')); };
  const tlsRead = async () => {
    const buf = new Uint8Array(4096);
    const n = await tlsConn.read(buf);
    return decoder.decode(buf.subarray(0, n ?? 0));
  };

  await tlsWrite('EHLO outlook.com'); await tlsRead();
  await tlsWrite('AUTH LOGIN'); await tlsRead();
  await tlsWrite(btoa(smtpUser)); await tlsRead();
  await tlsWrite(btoa(smtpPass)); await tlsRead();
  await tlsWrite(`MAIL FROM:<${smtpUser}>`); await tlsRead();
  await tlsWrite(`RCPT TO:<${to}>`); await tlsRead();
  for (const ccAddr of cc) {
    if (ccAddr) { await tlsWrite(`RCPT TO:<${ccAddr}>`); await tlsRead(); }
  }
  await tlsWrite('DATA'); await tlsRead();

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { correo, nombre, proyecto, centro } = await req.json();
    if (!correo) {
      return new Response(JSON.stringify({ error: 'El campo correo es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const smtpUser  = Deno.env.get('SMTP_USER') ?? '';
    const siteUrl   = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';

    // CAR del colegio + Gerente + Director Nacional en vivo desde Directorio.
    let carEmail = '';
    let gerenteEmail = '';
    let directorNacionalEmail = '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);
      if (centro) {
        const { data: fila } = await supabase.from('directorio').select('car_correo').eq('nombre', centro).maybeSingle();
        carEmail = fila?.car_correo ?? '';
      }
      const { data: general } = await supabase.from('directorio').select('gerente_correo, director_nacional_correo').eq('codigo', 'GENERAL').maybeSingle();
      gerenteEmail = general?.gerente_correo ?? '';
      directorNacionalEmail = general?.director_nacional_correo ?? '';
    }
    const ccList = [adminEmail, carEmail, gerenteEmail, directorNacionalEmail]
      .filter((addr, i, arr) => addr && arr.indexOf(addr) === i && addr !== correo);

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #ED7102;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Coordinación de Obras — Colegios Mano Amiga</p>
        </td></tr>
        <tr><td style="background:#ED7102;padding:16px 40px;">
          <p style="margin:0;color:#ffffff;font-size:14px;font-weight:700;">
            ✅ Revisión de solicitud elaborada
          </p>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 8px;">
            Hola <strong>${nombre ?? 'solicitante'}</strong>,
          </p>
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
            Ya revisamos tu solicitud de proyecto <strong>${proyecto ?? ''}</strong>${centro ? ` para <strong>${centro}</strong>` : ''}.
            El siguiente paso es que <strong>procedas al llenado del Ticket MAS</strong> — ya tienes acceso habilitado
            en el sistema para hacerlo.
          </p>
          <div style="text-align:center;margin:0 0 24px;">
            <a href="${siteUrl}/ticket-mas" style="display:inline-block;background:#00295A;color:#ffffff;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">
              Llenar Ticket MAS →
            </a>
          </div>
          <p style="color:#94a3b8;font-size:13px;margin:24px 0 0;">
            Si tienes dudas sobre cómo llenarlo, comunícate con el Coordinador de Obras y Mantenimiento —
            Ing. Ricardo Joanathan Reyes Medina.
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
            Este correo fue enviado desde <strong>Sistema RCMA</strong> · ${smtpUser}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    await sendEmail(correo, ccList, `✅ Procede al llenado del Ticket MAS — ${proyecto ?? 'tu proyecto'}`, html);

    return new Response(JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
