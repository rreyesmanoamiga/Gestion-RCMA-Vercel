import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmail(to: string, cc: string[], subject: string, html: string) {
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
  for (const ccAddr of cc) { if (ccAddr) { await tw(`RCPT TO:<${ccAddr}>`); await tr(); } }
  await tw('DATA'); await tr();
  const ccHeader = cc.filter(Boolean).join(', ');
  const msg = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to}`,
    ...(ccHeader ? [`Cc: ${ccHeader}`] : []),
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
    const {
      nombre_proyecto, colegio, territorio, responsable,
      presupuesto, costo_real, folio,
      correo_admin, correo_car, site_url,
    } = await req.json();

    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const fecha    = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

    const fmtMXN = (n: number | null | undefined) =>
      n != null ? n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—';

    const diff         = (presupuesto && costo_real) ? costo_real - presupuesto : null;
    const pctDiff      = (presupuesto && diff != null) ? Math.round((diff / presupuesto) * 100) : null;
    const diffLabel    = diff == null ? '—'
      : diff > 0 ? `+${fmtMXN(diff)} (sobrecosto ${pctDiff}%)`
      : diff < 0 ? `${fmtMXN(diff)} (ahorro ${Math.abs(pctDiff ?? 0)}%)`
      : 'Exacto (0%)';
    const diffColor    = diff == null ? '#64748b' : diff > 0 ? '#DC2626' : diff < 0 ? '#059669' : '#64748b';

    const buildHtml = () => `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr><td style="background:#00295A;padding:28px 36px;border-bottom:3px solid #059669;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Coordinación de Obras — Colegios Mano Amiga</p>
        </td></tr>
        <tr><td style="background:#059669;padding:14px 36px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">✅ Proyecto Completado — ${nombre_proyecto ?? '—'}</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
            El siguiente proyecto ha sido marcado como <strong>Completado</strong> en el Sistema RCMA:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr style="background:#f8fafc;">
              <td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;width:40%;border-bottom:1px solid #e2e8f0;">Proyecto</td>
              <td style="padding:10px 14px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${nombre_proyecto ?? '—'} ${folio ? `<span style="color:#DC2626;font-size:11px;">(${folio})</span>` : ''}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Colegio / Territorio</td>
              <td style="padding:10px 14px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${colegio ?? '—'} / ${territorio ?? '—'}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Responsable</td>
              <td style="padding:10px 14px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${responsable ?? '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Presupuesto Inicial</td>
              <td style="padding:10px 14px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${fmtMXN(presupuesto)}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Costo Real Final</td>
              <td style="padding:10px 14px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${fmtMXN(costo_real)}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Diferencia</td>
              <td style="padding:10px 14px;font-size:14px;font-weight:700;color:${diffColor};border-bottom:1px solid #e2e8f0;">${diffLabel}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Fecha de Cierre</td>
              <td style="padding:10px 14px;font-size:14px;color:#0f172a;">${fecha}</td>
            </tr>
          </table>
          ${site_url ? `<a href="${site_url}/proyectos" style="display:inline-block;background:#00295A;color:#fff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ver en Sistema RCMA →</a>` : ''}
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · ${smtpUser}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const errores: string[] = [];
    const adminEmail = correo_admin || 'rreyes@manoamiga.edu.mx';
    const ccList = [correo_car ?? '', 'arodriguez@manoamiga.edu.mx', 'ecastaneda@manoamiga.edu.mx']
      .filter(c => c && c !== adminEmail);

    try {
      await sendEmail(
        adminEmail,
        ccList,
        `✅ [RCMA] Proyecto completado: ${nombre_proyecto ?? '—'} — ${colegio ?? ''}`,
        buildHtml()
      );
    } catch (e) { errores.push(`envío: ${e instanceof Error ? e.message : 'error'}`); }

    return new Response(
      JSON.stringify({ success: errores.length === 0, errores }),
      { status: errores.length > 0 ? 207 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
