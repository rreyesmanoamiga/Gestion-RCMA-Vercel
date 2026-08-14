import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Envuelve cualquier promesa con un límite de tiempo — si no resuelve a
// tiempo, falla con un mensaje claro en vez de dejar la función colgada
// hasta que la plataforma la mate por IDLE_TIMEOUT (150s) sin explicación.
function conTimeout<T>(promesa: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout (${ms}ms) en: ${etiqueta}`)), ms)),
  ]);
}

async function sendEmail(to: string, subject: string, html: string) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
  if (!smtpUser || !smtpPass) throw new Error('Faltan SMTP_USER o SMTP_PASS en los Secrets de la función');

  const enc = new TextEncoder(); const dec = new TextDecoder();
  console.log(`[smtp] conectando a ${smtpHost}:${smtpPort}...`);
  const conn = await conTimeout(Deno.connect({ hostname: smtpHost, port: smtpPort }), 10000, 'Deno.connect');
  console.log('[smtp] conectado, iniciando handshake');

  const rd = async (paso: string, timeoutMs = 12000) => {
    const b = new Uint8Array(4096);
    const n = await conTimeout(conn.read(b), timeoutMs, `read (${paso})`);
    const txt = dec.decode(b.subarray(0, n ?? 0));
    console.log(`[smtp] <- ${paso}: ${txt.trim().slice(0, 80)}`);
    return txt;
  };
  const wr = async (d: string, paso: string) => {
    console.log(`[smtp] -> ${paso}`);
    await conTimeout(conn.write(enc.encode(d + '\r\n')), 12000, `write (${paso})`);
  };

  await rd('banner'); await wr('EHLO outlook.com', 'EHLO'); await rd('ehlo'); await wr('STARTTLS', 'STARTTLS'); await rd('starttls-ack');
  console.log('[smtp] iniciando TLS...');
  const tls = await conTimeout(Deno.startTls(conn, { hostname: smtpHost }), 12000, 'Deno.startTls');
  console.log('[smtp] TLS listo, autenticando');

  const tw = async (d: string, paso: string) => {
    console.log(`[smtp] -> ${paso}`);
    await conTimeout(tls.write(enc.encode(d + '\r\n')), 12000, `tls write (${paso})`);
  };
  const tr = async (paso: string, timeoutMs = 12000) => {
    const b = new Uint8Array(4096);
    const n = await conTimeout(tls.read(b), timeoutMs, `tls read (${paso})`);
    const txt = dec.decode(b.subarray(0, n ?? 0));
    console.log(`[smtp] <- ${paso}: ${txt.trim().slice(0, 80)}`);
    return txt;
  };

  await tw('EHLO outlook.com', 'EHLO-tls'); await tr('ehlo-tls');
  await tw('AUTH LOGIN', 'AUTH LOGIN'); await tr('auth-login-ack');
  await tw(btoa(smtpUser), 'user'); await tr('user-ack');
  await tw(btoa(smtpPass), 'pass'); const authResp = await tr('pass-ack');
  if (!authResp.startsWith('235')) throw new Error(`SMTP rechazó la autenticación: ${authResp.trim()}`);

  await tw(`MAIL FROM:<${smtpUser}>`, 'MAIL FROM'); await tr('mail-from-ack');
  await tw(`RCPT TO:<${to}>`, 'RCPT TO'); await tr('rcpt-to-ack');
  await tw('DATA', 'DATA'); await tr('data-ack', 20000);

  // Normaliza a CRLF estricto y aplica "dot-stuffing" (RFC 5321 §4.5.2):
  // cualquier línea que empiece con "." se duplica el punto, para que el
  // servidor no la confunda con el terminador de mensaje "." solo en su línea.
  const bodyLines = html.split(/\r\n|\r|\n/).map(l => (l.startsWith('.') ? '.' + l : l));
  const msg = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    ...bodyLines,
    '.',
  ].join('\r\n');
  console.log(`[smtp] enviando cuerpo del mensaje (${msg.length} bytes)...`);
  await tw(msg, 'mensaje');
  await tr('mensaje-ack', 30000);
  await tw('QUIT', 'QUIT');
  tls.close();
  console.log('[smtp] correo enviado OK');
}

interface ComplianceDoc {
  id: string;
  colegio: string;
  territorio: string;
  tipo_documento: string;
  materia: string | null;
  estado: string;
  vigente: string | null;
  fecha_limite_recepcion: string | null;
  vigente_hasta: string | null;
  responsable: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  console.log('=== notify-compliance-vencimiento: inicio de invocación ===');
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const siteUrl     = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
    const adminEmail  = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const smtpUser    = Deno.env.get('SMTP_USER') ?? '';
    if (!supabaseUrl || !serviceKey) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en los Secrets de la función');
    const supabase    = createClient(supabaseUrl, serviceKey);

    // Tipo de envío: 'vencidos' (8am) o 'por_vencer' (7pm). Sin body = ambos.
    let tipo = 'todos';
    try {
      const body = await req.json();
      if (body?.tipo === 'vencidos' || body?.tipo === 'por_vencer') tipo = body.tipo;
    } catch { /* sin body */ }
    console.log(`[main] tipo solicitado: ${tipo}`);

    // Fecha con horario de México (UTC-6), porque el cron corre en UTC
    const ahoraMX = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const hoy     = new Date(ahoraMX); hoy.setUTCHours(0, 0, 0, 0);
    const hoyISO  = hoy.toISOString().slice(0, 10);

    const cols = 'id, colegio, territorio, tipo_documento, materia, estado, vigente, fecha_limite_recepcion, vigente_hasta, responsable';
    console.log('[main] consultando compliance_documentos...');

    // Vencidos: no verificados y con fecha límite ya pasada
    const resVencidos = tipo !== 'por_vencer' ? await supabase
      .from('compliance_documentos')
      .select(cols)
      .eq('activo', true)
      .neq('estado', 'Verificado')
      .not('fecha_limite_recepcion', 'is', null)
      .lt('fecha_limite_recepcion', hoyISO) : { data: [], error: null };
    if (resVencidos.error) throw new Error(`Error consultando vencidos: ${resVencidos.error.message}`);
    const vencidos = resVencidos.data;

    // Por vencer: marcados "Por expirar" en el registro
    const resPorVencer = tipo !== 'vencidos' ? await supabase
      .from('compliance_documentos')
      .select(cols)
      .eq('activo', true)
      .eq('vigente', 'Por expirar') : { data: [], error: null };
    if (resPorVencer.error) throw new Error(`Error consultando por vencer: ${resPorVencer.error.message}`);
    const porVencer = resPorVencer.data;

    console.log(`[main] consulta OK: ${vencidos?.length ?? 0} vencidos, ${porVencer?.length ?? 0} por vencer`);

    const todosDocs: ComplianceDoc[] = [...(vencidos ?? []), ...(porVencer ?? [])];
    if (todosDocs.length === 0) {
      console.log('[main] sin documentos que notificar, terminando');
      return new Response(JSON.stringify({ success: true, message: 'Sin documentos vencidos o por vencer' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fila = (d: ComplianceDoc) => {
      const esVencido = vencidos?.some(v => v.id === d.id);
      const fecha = esVencido ? d.fecha_limite_recepcion : d.vigente_hasta;
      return `
      <tr>
        <td style="padding:8px 12px;font-size:13px;border-bottom:1px solid #f1f5f9;">${d.tipo_documento ?? '—'}</td>
        <td style="padding:8px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;">${d.colegio.replace('Mano Amiga ', '')}</td>
        <td style="padding:8px 12px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;">${d.responsable ?? 'Sin asignar'}</td>
        <td style="padding:8px 12px;font-size:12px;border-bottom:1px solid #f1f5f9;">
          <span style="color:${esVencido ? '#DC2626' : '#d97706'};font-weight:700;">
            ${esVencido ? '🔴 VENCIDO' : '🟡 Por expirar'}
          </span><br>
          <span style="color:#64748b;font-size:11px;">${fecha ?? '—'}</span>
        </td>
      </tr>`;
    };

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #ED7102;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Sistema RCMA — Cumplimiento Normativo</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:11px;">Protección Civil y Donatarias Autorizadas · ${new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </td></tr>
        <tr><td style="background:${vencidos && vencidos.length > 0 ? '#DC2626' : '#d97706'};padding:12px 32px;">
          <p style="margin:0;color:#fff;font-size:13px;font-weight:700;">
            ${vencidos && vencidos.length > 0 ? `⚠️ ${vencidos.length} documento${vencidos.length !== 1 ? 's' : ''} vencido${vencidos.length !== 1 ? 's' : ''}` : ''}
            ${porVencer && porVencer.length > 0 ? ` · 🟡 ${porVencer.length} por expirar` : ''}
          </p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr style="background:#f8fafc;">
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;">Documento</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;">Colegio</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;">Responsable</th>
              <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #e2e8f0;">Estado</th>
            </tr>
            ${todosDocs.map(fila).join('')}
          </table>
          <br>
          <a href="${siteUrl}/cumplimiento/alertas" style="display:inline-block;background:#00295A;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ver Alertas de Cumplimiento →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · ${smtpUser} · Recordatorio automático ${tipo === 'vencidos' ? '8:00 AM — Vencidos' : tipo === 'por_vencer' ? '7:00 PM — Por expirar' : 'diario'}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const asunto = tipo === 'vencidos'
      ? `🔴 [RCMA] Cumplimiento: ${todosDocs.length} documento${todosDocs.length !== 1 ? 's' : ''} VENCIDO${todosDocs.length !== 1 ? 'S' : ''}`
      : tipo === 'por_vencer'
      ? `🟡 [RCMA] Cumplimiento: ${todosDocs.length} documento${todosDocs.length !== 1 ? 's' : ''} por expirar`
      : `⏰ [RCMA] Cumplimiento: ${todosDocs.length} documento${todosDocs.length !== 1 ? 's' : ''} requiere${todosDocs.length === 1 ? '' : 'n'} atención`;
    console.log(`[main] enviando correo a ${adminEmail}...`);
    await sendEmail(adminEmail, asunto, html);
    console.log('[main] correo enviado, guardando notificación interna');

    // Notificación interna en el sistema para el admin
    try {
      const { data: adminPerm } = await supabase.from('user_permissions').select('user_id').eq('user_email', adminEmail).maybeSingle();
      if (adminPerm?.user_id) {
        await supabase.from('notificaciones').insert({
          usuario_id: adminPerm.user_id,
          tipo:       tipo === 'vencidos' ? 'urgente' : 'alerta',
          titulo:     asunto,
          mensaje:    `${todosDocs.length} documento(s) de Cumplimiento Normativo requieren atención.`,
          link:       '/cumplimiento/alertas',
          modulo:     'cumplimiento',
        });
      }
    } catch (errNotif) {
      console.log(`[main] aviso: no se pudo guardar notificación interna: ${errNotif instanceof Error ? errNotif.message : errNotif}`);
    }

    console.log('=== notify-compliance-vencimiento: fin OK ===');
    return new Response(
      JSON.stringify({ success: true, enviados: todosDocs.length, vencidos: vencidos?.length ?? 0, por_vencer: porVencer?.length ?? 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.log(`[main] ERROR: ${err instanceof Error ? err.message : String(err)}`);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
