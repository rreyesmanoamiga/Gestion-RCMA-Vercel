import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const corsHeaders = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

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
  const msg = [`From: Sistema RCMA <${smtpUser}>`, `To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', '', html, '.'].join('\r\n');
  await tw(msg); await tr(); await tw('QUIT'); tls.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { destinatario_email, destinatario_nombre, titulo, descripcion, prioridad, fecha_limite, asignado_por, siteUrl, es_directo, responsable_nombre } = await req.json();
    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const appUrl = siteUrl ?? Deno.env.get('SITE_URL') ?? '';
    const PRIO_COLOR: Record<string,string> = { urgente:'#DC2626', alta:'#ea580c', normal:'#4F82C2', baja:'#64748b' };
    const PRIO_LABEL: Record<string,string> = { urgente:'URGENTE', alta:'Alta', normal:'Normal', baja:'Baja' };
    const bandColor = PRIO_COLOR[prioridad] ?? '#4F82C2';

    const introTxt = es_directo === false
      ? `Hola <strong>${destinatario_nombre}</strong>, <strong>${asignado_por}</strong> asignó el siguiente pendiente a <strong>${responsable_nombre}</strong>. Quedas en copia para tu conocimiento.`
      : `Hola <strong>${destinatario_nombre}</strong>, <strong>${asignado_por}</strong> te ha asignado el siguiente pendiente:`;

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr><td style="background:#00295A;padding:28px 36px;border-bottom:3px solid #4F82C2;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">NEXUS — Coordinación de Obras</p>
        </td></tr>
        <tr><td style="background:${bandColor};padding:14px 36px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">📌 ${es_directo === false ? 'Para tu conocimiento' : 'Nuevo Pendiente Asignado'}</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">${introTxt}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:28px;">
            <tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;width:35%;border-bottom:1px solid #e2e8f0;">Pendiente</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${titulo}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;${descripcion || fecha_limite ? 'border-bottom:1px solid #e2e8f0;' : ''}">Prioridad</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;${descripcion || fecha_limite ? 'border-bottom:1px solid #e2e8f0;' : ''}"><span style="background:${bandColor};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">${PRIO_LABEL[prioridad] ?? prioridad}</span></td>
            </tr>
            ${descripcion ? `<tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;${fecha_limite ? 'border-bottom:1px solid #e2e8f0;' : ''}">Descripción</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;${fecha_limite ? 'border-bottom:1px solid #e2e8f0;' : ''}">${descripcion}</td>
            </tr>` : ''}
            ${fecha_limite ? `<tr>
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Fecha Límite</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;">${fecha_limite}</td>
            </tr>` : ''}
          </table>
          <a href="${appUrl}/nexus" style="display:inline-block;background:#00295A;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ver Pendiente en el Sistema →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · ${smtpUser}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
    await sendEmail(destinatario_email, es_directo === false ? `📋 Para tu conocimiento: ${titulo}` : `📌 Nuevo pendiente asignado: ${titulo}`, html);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
