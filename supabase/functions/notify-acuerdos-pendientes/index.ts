import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── SMTP idéntico al resto de las funciones del sistema ───────────────────
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

interface AcuerdoFila {
  descripcion: string;
  responsable: string | null;
  fecha_compromiso: string | null;
  estado: string;
  colegio: string | null;
  asunto: string | null;
  onedrive_url: string | null;
}

function filaHTML(a: AcuerdoFila, vencido: boolean): string {
  const fechaStr = a.fecha_compromiso
    ? new Date(a.fecha_compromiso + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  return `<tr>
    <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f172a;">${a.descripcion}</p>
      <p style="margin:0 0 6px;font-size:12px;color:#64748b;">
        ${a.responsable ? `👤 ${a.responsable} &nbsp;·&nbsp; ` : ''}${a.colegio ? `🏫 ${a.colegio} &nbsp;·&nbsp; ` : ''}📄 ${a.asunto ?? '—'}
      </p>
      <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${vencido ? '#fee2e2' : '#fef3c7'};color:${vencido ? '#b91c1c' : '#92400e'};">
        ${vencido ? 'Vencido' : 'Próximo a vencer'} — ${fechaStr}
      </span>
    </td>
  </tr>`;
}

function generarHTML(vencidos: AcuerdoFila[], proximos: AcuerdoFila[], siteUrl: string): string {
  const seccion = (titulo: string, color: string, filas: AcuerdoFila[], vencido: boolean) => filas.length === 0 ? '' : `
    <tr><td style="background:#f8fafc;padding:10px 16px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;font-weight:700;color:${color};text-transform:uppercase;">${titulo} (${filas.length})</p>
    </td></tr>
    ${filas.map(a => filaHTML(a, vencido)).join('')}
  `;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<tr><td style="background:#00295A;padding:28px 36px;border-bottom:3px solid #ED7102;">
  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Sistema RCMA</h1>
  <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Seguimiento semanal de Acuerdos y Compromisos</p>
</td></tr>
<tr><td style="padding:24px 36px 0;">
  <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 4px;">
    Resumen de acuerdos de minutas que están vencidos o vencen en los próximos 7 días.
  </p>
</td></tr>
<tr><td style="padding:8px 0 24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    ${seccion('Vencidos', '#b91c1c', vencidos, true)}
    ${seccion('Vencen esta semana', '#92400e', proximos, false)}
  </table>
</td></tr>
<tr><td style="padding:0 36px 32px;">
  <a href="${siteUrl}/minutas" style="display:inline-block;background:#4F82C2;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ver Seguimiento de Acuerdos →</a>
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
  <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · Colegios Mano Amiga</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? Deno.env.get('SMTP_USER') ?? '';
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const enSieteDias = new Date(hoy); enSieteDias.setDate(enSieteDias.getDate() + 7);
    const hoyStr   = hoy.toISOString().slice(0, 10);
    const limiteStr = enSieteDias.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('minuta_acuerdos')
      .select('descripcion, responsable, fecha_compromiso, estado, minuta:minuta_id(asunto, colegio, onedrive_url)')
      .in('estado', ['pendiente', 'en_proceso'])
      .not('fecha_compromiso', 'is', null)
      .lte('fecha_compromiso', limiteStr)
      .order('fecha_compromiso', { ascending: true });

    if (error) throw error;

    const filas: AcuerdoFila[] = (data ?? []).map((a: any) => ({
      descripcion: a.descripcion, responsable: a.responsable, fecha_compromiso: a.fecha_compromiso,
      estado: a.estado, colegio: a.minuta?.colegio ?? null, asunto: a.minuta?.asunto ?? null,
      onedrive_url: a.minuta?.onedrive_url ?? null,
    }));

    const vencidos  = filas.filter(a => a.fecha_compromiso! < hoyStr);
    const proximos  = filas.filter(a => a.fecha_compromiso! >= hoyStr);

    if (vencidos.length === 0 && proximos.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Sin acuerdos vencidos ni próximos', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const subject = `Sistema RCMA: ${vencidos.length} acuerdo(s) vencido(s), ${proximos.length} por vencer`;
    const html = generarHTML(vencidos, proximos, siteUrl);
    if (adminEmail) await sendEmail(adminEmail, subject, html);

    return new Response(
      JSON.stringify({ success: true, vencidos: vencidos.length, proximos: proximos.length, sent: adminEmail ? 1 : 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Error:', message);
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
