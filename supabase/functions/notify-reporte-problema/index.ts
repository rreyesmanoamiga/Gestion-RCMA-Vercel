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
  const msg = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '.',
  ].join('\r\n');
  await tw(msg); await tr(); await tw('QUIT'); tls.close();
}

function baseHtml(colorBand: string, tituloBand: string, cuerpo: string) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #DC2626;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Reporte de Problema</p>
        </td></tr>
        <tr><td style="background:${colorBand};padding:16px 40px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">${tituloBand}</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">${cuerpo}</td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · Coordinación de Obras</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function filaTabla(label: string, valor: string) {
  return `<tr><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;width:35%;">${label}</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${valor}</td></tr>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const {
      tipo, // 'nuevo' | 'en_revision' | 'resuelto'
      para,
      modulo, tipo_problema, descripcion, reportado_por_nombre,
      siteUrl,
    } = await req.json();

    if (!para || !tipo) {
      return new Response(JSON.stringify({ error: 'Faltan datos (para/tipo)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let subject = '';
    let html = '';

    if (tipo === 'nuevo') {
      subject = `🔧 [RCMA] Nuevo reporte de problema — ${modulo}`;
      const tabla = `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        ${filaTabla('Módulo', modulo)}
        ${filaTabla('Tipo de problema', tipo_problema)}
        ${filaTabla('Reportado por', reportado_por_nombre ?? '—')}
        ${descripcion ? filaTabla('Descripción', descripcion) : ''}
      </table>`;
      const boton = siteUrl ? `<a href="${siteUrl}/reportar-problema" style="display:inline-block;background:#DC2626;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ver Reporte →</a>` : '';
      html = baseHtml('#DC2626', '🔧 Nuevo reporte de problema', `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">Un usuario reportó una falla en el sistema:</p>
        ${tabla}${boton}`);
    } else if (tipo === 'en_revision') {
      subject = `👀 [RCMA] Tu reporte ya está siendo atendido`;
      html = baseHtml('#4F82C2', '👀 Estamos revisando tu reporte', `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
          Hola${reportado_por_nombre ? ' ' + reportado_por_nombre : ''}, tu reporte sobre <strong>${modulo}</strong> (${tipo_problema}) ya está siendo revisado por la Coordinación de Obras. En cuanto se resuelva, te avisamos.
        </p>`);
    } else if (tipo === 'resuelto') {
      subject = `✅ [RCMA] Tu reporte ya fue resuelto`;
      html = baseHtml('#059669', '✅ Problema resuelto', `
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
          Hola${reportado_por_nombre ? ' ' + reportado_por_nombre : ''}, el problema que reportaste sobre <strong>${modulo}</strong> (${tipo_problema}) ya fue corregido. Gracias por avisarnos — así ayudas a mejorar el sistema para todos.
        </p>`);
    } else {
      return new Response(JSON.stringify({ error: 'Tipo inválido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await sendEmail(para, subject, html);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
