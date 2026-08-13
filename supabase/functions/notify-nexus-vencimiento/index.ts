import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const siteUrl     = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
    const adminEmail  = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const smtpUser    = Deno.env.get('SMTP_USER') ?? '';
    const supabase    = createClient(supabaseUrl, serviceKey);

    // Tipo de envío: 'vencidos' (8am) o 'por_vencer' (7pm). Sin body = ambos (compatibilidad)
    let tipo = 'todos';
    try {
      const body = await req.json();
      if (body?.tipo === 'vencidos' || body?.tipo === 'por_vencer') tipo = body.tipo;
    } catch { /* sin body */ }

    // Fecha con horario de México (UTC-6), porque el cron corre en UTC
    const ahoraMX = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const hoy     = new Date(ahoraMX); hoy.setUTCHours(0,0,0,0);
    const pasado  = new Date(hoy); pasado.setUTCDate(pasado.getUTCDate() + 2);

    // Pendientes que vencen hoy o mañana (y no completados)
    const { data: porVencer } = tipo !== 'vencidos' ? await supabase
      .from('nexus_pendientes')
      .select('id, titulo, asignado_a, asignado_nombre, fecha_limite, prioridad, colegio, territorio, tipo')
      .neq('estatus', 'completado')
      .gte('fecha_limite', hoy.toISOString().slice(0,10))
      .lt('fecha_limite',  pasado.toISOString().slice(0,10)) : { data: [] };

    // Pendientes ya vencidos
    const { data: vencidos } = tipo !== 'por_vencer' ? await supabase
      .from('nexus_pendientes')
      .select('id, titulo, asignado_a, asignado_nombre, fecha_limite, prioridad, colegio, territorio, tipo')
      .neq('estatus', 'completado')
      .lt('fecha_limite', hoy.toISOString().slice(0,10)) : { data: [] };

    const allPendientes = [...(vencidos ?? []), ...(porVencer ?? [])];
    if (allPendientes.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Sin pendientes vencidos o por vencer' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fila = (p: any) => `
      <tr>
        <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f1f5f9;">${p.titulo ?? '—'}</td>
        <td style="padding:8px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;">${p.asignado_nombre ?? '—'}</td>
        <td style="padding:8px 12px;font-size:12px;border-bottom:1px solid #f1f5f9;">
          <span style="color:${new Date(p.fecha_limite) < hoy ? '#DC2626' : '#d97706'};font-weight:700;">
            ${new Date(p.fecha_limite) < hoy ? '🔴 VENCIDO' : '🟡 Hoy/Mañana'}
          </span><br>
          <span style="color:#64748b;font-size:11px;">${p.fecha_limite}</span>
        </td>
        <td style="padding:8px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;">${p.colegio ?? '—'}</td>
      </tr>`;

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #DC2626;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Sistema RCMA — NEXUS</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:11px;">Recordatorio diario de pendientes · ${new Date().toLocaleDateString('es-MX', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
        </td></tr>
        <tr><td style="background:${vencidos && vencidos.length > 0 ? '#DC2626' : '#d97706'};padding:12px 32px;">
          <p style="margin:0;color:#fff;font-size:13px;font-weight:700;">
            ${vencidos && vencidos.length > 0 ? `⚠️ ${vencidos.length} pendiente${vencidos.length !== 1 ? 's' : ''} vencido${vencidos.length !== 1 ? 's' : ''}` : ''}
            ${porVencer && porVencer.length > 0 ? ` · 🟡 ${porVencer.length} vence${porVencer.length !== 1 ? 'n' : ''} hoy o mañana` : ''}
          </p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f8fafc;">
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;">Pendiente</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;">Asignado a</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;">Estado</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;">Colegio</th>
            </tr>
            ${allPendientes.map(fila).join('')}
          </table>
          <br>
          <a href="${siteUrl}/nexus" style="display:inline-block;background:#00295A;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ver NEXUS →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · ${smtpUser} · Recordatorio automático ${tipo === 'vencidos' ? '8:00 AM — Vencidos' : tipo === 'por_vencer' ? '7:00 PM — Próximos a vencer' : 'diario'}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const asunto = tipo === 'vencidos'
      ? `🔴 [RCMA] NEXUS: ${allPendientes.length} pendiente${allPendientes.length !== 1 ? 's' : ''} VENCIDO${allPendientes.length !== 1 ? 'S' : ''}`
      : tipo === 'por_vencer'
      ? `🟡 [RCMA] NEXUS: ${allPendientes.length} pendiente${allPendientes.length !== 1 ? 's' : ''} por vencer (hoy/mañana)`
      : `⏰ [RCMA] NEXUS: ${allPendientes.length} pendiente${allPendientes.length !== 1 ? 's' : ''} por atender`;
    await sendEmail(adminEmail, asunto, html);

    // Notificación interna en el sistema para el admin
    try {
      const { data: adminPerm } = await supabase.from('user_permissions').select('user_id').eq('user_email', adminEmail).maybeSingle();
      if (adminPerm?.user_id) {
        await supabase.from('notificaciones').insert({
          usuario_id: adminPerm.user_id,
          tipo:       tipo === 'vencidos' ? 'urgente' : 'alerta',
          titulo:     asunto,
          mensaje:    `${allPendientes.length} pendiente(s) en NEXUS requieren atención.`,
          link:       '/nexus',
          modulo:     'nexus',
        });
      }
    } catch { /* no bloqueante */ }

    return new Response(
      JSON.stringify({ success: true, enviados: allPendientes.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
