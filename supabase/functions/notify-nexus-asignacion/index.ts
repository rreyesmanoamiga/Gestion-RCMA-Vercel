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
    const appUrl = siteUrl ?? Deno.env.get('SITE_URL') ?? '';
    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const PRIO_COLOR: Record<string,string> = { urgente:'#dc2626', alta:'#ea580c', normal:'#2563eb', baja:'#64748b' };
    const PRIO_LABEL: Record<string,string> = { urgente:'URGENTE', alta:'Alta', normal:'Normal', baja:'Baja' };
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">
    <div style="background:#0f172a;padding:20px 28px;">
      <p style="color:#94a3b8;font-size:11px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.08em;">Sistema RCMA — NEXUS</p>
      <h1 style="color:#fff;font-size:17px;font-weight:700;margin:0;">Tienes un nuevo pendiente asignado</h1>
    </div>
    <div style="padding:24px 28px;">
      <p style="color:#334155;font-size:14px;margin:0 0 20px;">
        ${es_directo === false
          ? `Hola <strong>${destinatario_nombre}</strong>, <strong>${asignado_por}</strong> asignó el siguiente pendiente a <strong>${responsable_nombre}</strong>. Quedas en copia para tu conocimiento.`
          : `Hola <strong>${destinatario_nombre}</strong>, <strong>${asignado_por}</strong> te ha asignado el siguiente pendiente:`
        }
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <h2 style="font-size:16px;font-weight:700;color:#0f172a;margin:0;">${titulo}</h2>
          <span style="background:${PRIO_COLOR[prioridad] ?? '#64748b'};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">${PRIO_LABEL[prioridad] ?? prioridad}</span>
        </div>
        ${descripcion ? `<p style="color:#475569;font-size:13px;margin:0 0 10px;">${descripcion}</p>` : ''}
        ${fecha_limite ? `<p style="color:#94a3b8;font-size:12px;margin:0;">📅 Fecha límite: <strong style="color:#0f172a;">${fecha_limite}</strong></p>` : ''}
      </div>
      <div style="text-align:center;margin-top:24px;">
        <a href="${appUrl}/nexus" style="display:inline-block;background:#0f172a;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;">Ver pendiente en el sistema →</a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">Sistema RCMA · NEXUS · <a href="mailto:${adminEmail}" style="color:#64748b;">${adminEmail}</a></p>
    </div>
  </div>
</body></html>`;
    await sendEmail(destinatario_email, es_directo === false ? `📋 Para tu conocimiento: ${titulo}` : `📌 Nuevo pendiente asignado: ${titulo}`, html);
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
