import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmail(to: string, cc: string[], subject: string, html: string) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';

  const conn    = await Deno.connect({ hostname: smtpHost, port: smtpPort });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const read    = async () => { const b = new Uint8Array(4096); const n = await conn.read(b); return decoder.decode(b.subarray(0, n ?? 0)); };
  const write   = async (d: string) => { await conn.write(encoder.encode(d + '\r\n')); };

  await read(); await write('EHLO outlook.com'); await read(); await write('STARTTLS'); await read();
  const tls      = await Deno.startTls(conn, { hostname: smtpHost });
  const tlsWrite = async (d: string) => { await tls.write(encoder.encode(d + '\r\n')); };
  const tlsRead  = async () => { const b = new Uint8Array(4096); const n = await tls.read(b); return decoder.decode(b.subarray(0, n ?? 0)); };

  await tlsWrite('EHLO outlook.com'); await tlsRead();
  await tlsWrite('AUTH LOGIN');       await tlsRead();
  await tlsWrite(btoa(smtpUser));     await tlsRead();
  await tlsWrite(btoa(smtpPass));     await tlsRead();
  await tlsWrite(`MAIL FROM:<${smtpUser}>`); await tlsRead();
  await tlsWrite(`RCPT TO:<${to}>`);        await tlsRead();
  for (const ccAddr of cc) {
    if (ccAddr) { await tlsWrite(`RCPT TO:<${ccAddr}>`); await tlsRead(); }
  }
  await tlsWrite('DATA'); await tlsRead();

  const boundary = 'bnd_' + Date.now();
  const ccHeader = cc.filter(Boolean).join(', ');
  const msg = [
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

  await tlsWrite(msg); await tlsRead(); await tlsWrite('QUIT'); tls.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const {
      folio, proveedores, items, total, notas,
      link_cotizacion, siteUrl, solicitante,
    } = await req.json();

    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const smtpUser   = Deno.env.get('SMTP_USER')   ?? '';
    const appUrl     = siteUrl ?? Deno.env.get('SITE_URL') ?? '';

    const voboEmail = 'fguerra@manoamiga.edu.mx';     // Félix Guerra — autoriza
    const ccEmail   = 'arodriguez@manoamiga.edu.mx';   // Ángel Rodríguez — copia

    const itemsHTML = (items as any[]).map((it: any, i: number) => `
      <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;">${it.nombre_producto}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:center;">${it.unidad}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:center;">${it.cantidad}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;">
          ${it.precio_cotizado != null ? Number(it.precio_cotizado).toLocaleString('es-MX', { style:'currency', currency:'MXN' }) : '—'}
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;font-weight:600;">
          ${it.precio_cotizado != null ? (Number(it.precio_cotizado) * Number(it.cantidad)).toLocaleString('es-MX', { style:'currency', currency:'MXN' }) : '—'}
        </td>
      </tr>`).join('');

    const totalFmt = Number(total ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">

    <div style="background:#0f172a;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <p style="color:#94a3b8;font-size:11px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.08em;">Sistema RCMA</p>
        <h1 style="color:#fff;font-size:17px;font-weight:700;margin:0;">Solicitud de VoBo — Insumos</h1>
      </div>
      <div style="background:#0d8a7e;color:#fff;font-size:13px;font-weight:700;padding:6px 14px;border-radius:6px;">${folio}</div>
    </div>

    <div style="padding:24px 28px;">
      <p style="color:#334155;font-size:14px;margin:0 0 16px;">
        Se requiere su <strong>VoBo</strong> para la siguiente requisición de insumos de limpieza.
      </p>

      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <tr><td style="padding:8px 14px;font-size:12px;color:#64748b;font-weight:700;width:140px;">PROVEEDOR(ES)</td>
            <td style="padding:8px 14px;font-size:13px;color:#0f172a;">${Array.isArray(proveedores) ? proveedores.join(', ') : proveedores ?? '—'}</td></tr>
        <tr style="background:#fff"><td style="padding:8px 14px;font-size:12px;color:#64748b;font-weight:700;">SOLICITANTE</td>
            <td style="padding:8px 14px;font-size:13px;color:#0f172a;">${solicitante ?? 'Coordinación de Obras'}</td></tr>
        ${notas ? `<tr><td style="padding:8px 14px;font-size:12px;color:#64748b;font-weight:700;">NOTAS</td>
            <td style="padding:8px 14px;font-size:13px;color:#0f172a;">${notas}</td></tr>` : ''}
      </table>

      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <thead>
          <tr style="background:#0f172a;">
            <th style="padding:10px;color:#fff;font-size:12px;text-align:left;">Producto</th>
            <th style="padding:10px;color:#fff;font-size:12px;text-align:center;">Unidad</th>
            <th style="padding:10px;color:#fff;font-size:12px;text-align:center;">Cantidad</th>
            <th style="padding:10px;color:#fff;font-size:12px;text-align:right;">Precio Unit.</th>
            <th style="padding:10px;color:#fff;font-size:12px;text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsHTML}</tbody>
        <tfoot>
          <tr style="background:#0f172a;">
            <td colspan="4" style="padding:10px;color:#fff;font-size:13px;font-weight:700;text-align:right;">TOTAL</td>
            <td style="padding:10px;color:#fff;font-size:14px;font-weight:700;text-align:right;">${totalFmt}</td>
          </tr>
        </tfoot>
      </table>

      ${link_cotizacion ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:20px;">📎</span>
        <div>
          <p style="font-size:12px;font-weight:700;color:#1e40af;margin:0 0 4px;">Cotización del Proveedor</p>
          <a href="${link_cotizacion}" target="_blank" style="color:#2563eb;font-size:13px;">Ver cotización original →</a>
        </div>
      </div>` : ''}

      <div style="text-align:center;margin-top:24px;">
        <a href="${appUrl}/insumos" style="display:inline-block;background:#0f172a;color:#fff;font-size:14px;font-weight:700;padding:12px 32px;border-radius:8px;text-decoration:none;">
          Dar VoBo en el Sistema →
        </a>
      </div>
    </div>

    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">Sistema RCMA · Coordinación de Obras y Mantenimientos · <a href="mailto:${adminEmail}" style="color:#64748b;">${adminEmail}</a></p>
    </div>
  </div>
</body></html>`;

    await sendEmail(
      voboEmail,
      [ccEmail !== voboEmail ? ccEmail : ''],
      `📋 Solicitud de VoBo — ${folio} | Insumos FMA`,
      html
    );

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
