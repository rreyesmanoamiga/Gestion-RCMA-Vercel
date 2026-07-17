import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? '*';
const corsHeaders = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

// Asesores de Procuración de Fondos — siempre van en "Para:"
const ASESORES_FONDOS = [
  'mromo@manoamiga.edu.mx',
  'smendoza@manoamiga.edu.mx',
  'lsanchez@manoamiga.edu.mx',
];

const CAR_CORREOS: Record<string, string> = {
  NORTE:  'jalvarado@manoamiga.edu.mx',
  MEXICO: 'gromero@manoamiga.edu.mx',
  FMA:    'fguerra@manoamiga.edu.mx',
};

async function sendEmail(to: string[], cc: string[], subject: string, html: string) {
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
  await tw('MAIL FROM:<' + smtpUser + '>'); await tr();
  for (const toAddr of to) { if (toAddr) { await tw('RCPT TO:<' + toAddr + '>'); await tr(); } }
  for (const ccAddr of cc) { if (ccAddr) { await tw('RCPT TO:<' + ccAddr + '>'); await tr(); } }
  await tw('DATA'); await tr();
  const toHeader = to.filter(Boolean).join(', ');
  const ccHeader = cc.filter(Boolean).join(', ');
  const msg = [
    'From: Sistema RCMA <' + smtpUser + '>',
    'To: ' + toHeader,
    ...(ccHeader ? ['Cc: ' + ccHeader] : []),
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '', html, '.',
  ].join('\r\n');
  await tw(msg); await tr(); await tw('QUIT'); tls.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { nombre_proyecto, colegio, territorio, presupuesto, subido_por, siteUrl } = await req.json();
    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const appUrl      = siteUrl ?? Deno.env.get('SITE_URL') ?? '';
    const carEmail    = CAR_CORREOS[territorio] ?? '';

    const presupuestoTxt = presupuesto ? '$' + Number(presupuesto).toLocaleString('es-MX', { minimumFractionDigits: 2 }) : '—';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
    <div style="background:#0f172a;padding:20px 28px;">
      <h1 style="color:#fff;font-size:17px;font-weight:700;margin:0;">📐 Nuevo Anteproyecto</h1>
      <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Sistema RCMA · Coordinación de Obras</p>
    </div>
    <div style="padding:24px 28px;">
      <p style="color:#334155;font-size:14px;line-height:1.6;">
        Se registró un nuevo anteproyecto con la información y documentación disponible para su gestión de recaudación de fondos:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0;">
        <tr><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;width:35%;">Proyecto</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;font-weight:700;">${nombre_proyecto}</td></tr>
        <tr><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Colegio</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${colegio ?? '—'}</td></tr>
        <tr><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Territorio</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${territorio ?? '—'}</td></tr>
        <tr><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Presupuesto Estimado</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;">${presupuestoTxt}</td></tr>
      </table>
      <p style="color:#64748b;font-size:12px;">Registrado por: <strong>${subido_por ?? '—'}</strong></p>
      <div style="text-align:center;margin-top:20px;">
        <a href="${appUrl}/anteproyectos" style="display:inline-block;background:#0f172a;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;">Ver Anteproyecto →</a>
      </div>
    </div>
  </div>
</body></html>`;

    const ccList = [adminEmail, 'arodriguez@manoamiga.edu.mx', 'ecastaneda@manoamiga.edu.mx', carEmail].filter(Boolean);
    await sendEmail(ASESORES_FONDOS, ccList, '📐 Nuevo Anteproyecto — ' + nombre_proyecto, html);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
