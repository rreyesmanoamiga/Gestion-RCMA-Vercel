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
      tipo, folio, proveedores, items, total, iva_porcentaje, total_con_iva, notas,
      link_cotizacion, siteUrl, solicitante, vobo_por, vobo_fecha,
    } = await req.json();

    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const smtpUser   = Deno.env.get('SMTP_USER')   ?? '';
    const appUrl     = siteUrl ?? Deno.env.get('SITE_URL') ?? '';

    const ivaPct   = Number(iva_porcentaje ?? 16);
    const subtotal = Number(total ?? 0);
    const ivaAmt   = subtotal * (ivaPct / 100);
    const totalIVA = Number(total_con_iva ?? (subtotal + ivaAmt));
    const fmt = (n: number) => n.toLocaleString('es-MX', { style:'currency', currency:'MXN' });

    // ── Correo de CONFIRMACIÓN al admin cuando Felix autoriza ────────────────
    if (tipo === 'autorizado') {
      const htmlAuth = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr><td style="background:#00295A;padding:28px 36px;border-bottom:3px solid #059669;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Insumos — Coordinación de Obras</p>
        </td></tr>
        <tr><td style="background:#059669;padding:14px 36px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">✅ VoBo Autorizado — ${folio}</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
            La requisición <strong>${folio}</strong> ha sido <strong style="color:#059669;">AUTORIZADA</strong> por <strong>${vobo_por}</strong> el ${vobo_fecha ?? 'hoy'}.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:28px;">
            <tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;width:35%;border-bottom:1px solid #e2e8f0;">Proveedor</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${Array.isArray(proveedores) ? proveedores.join(', ') : proveedores ?? '—'}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Subtotal</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${fmt(subtotal)}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">IVA (${ivaPct}%)</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${fmt(ivaAmt)}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Total a Pagar</td>
              <td style="padding:12px 16px;font-size:15px;color:#059669;font-weight:700;">${fmt(totalIVA)}</td>
            </tr>
          </table>
          <p style="color:#64748b;font-size:13px;margin:0 0 20px;">Ya puedes descargar el PDF autorizado desde el sistema y notificar al proveedor.</p>
          <a href="${appUrl}/insumos" style="display:inline-block;background:#059669;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ver en el Sistema →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · ${smtpUser}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
      await sendEmail(adminEmail, ['arodriguez@manoamiga.edu.mx'], `✅ VoBo Autorizado — ${folio} | Insumos FMA`, htmlAuth);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Correo de SOLICITUD a Félix (flujo original) ─────────────────────────
    const voboEmail = 'fguerra@manoamiga.edu.mx';
    const ccEmail   = 'arodriguez@manoamiga.edu.mx';

    const itemsHTML = (items as any[]).map((it: any, i: number) => `
      <tr style="background:${i % 2 === 0 ? '#f8fafc' : '#fff'}">
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;">${it.nombre_producto}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;text-align:center;">${it.unidad}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;text-align:center;">${it.cantidad}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;text-align:right;">
          ${it.precio_cotizado != null ? Number(it.precio_cotizado).toLocaleString('es-MX', { style:'currency', currency:'MXN' }) : '—'}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;text-align:right;font-weight:600;">
          ${it.precio_cotizado != null ? (Number(it.precio_cotizado) * Number(it.cantidad)).toLocaleString('es-MX', { style:'currency', currency:'MXN' }) : '—'}
        </td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr><td style="background:#00295A;padding:28px 36px;border-bottom:3px solid #4F82C2;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Insumos — Coordinación de Obras</p>
        </td></tr>
        <tr><td style="background:#4F82C2;padding:14px 36px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">📋 Solicitud de VoBo — ${folio}</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
            Se requiere su <strong>VoBo</strong> para la siguiente requisición de insumos de limpieza.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
            <tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;width:35%;border-bottom:1px solid #e2e8f0;">Proveedor(es)</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${Array.isArray(proveedores) ? proveedores.join(', ') : proveedores ?? '—'}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;${notas ? 'border-bottom:1px solid #e2e8f0;' : ''}">Solicitante</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;${notas ? 'border-bottom:1px solid #e2e8f0;' : ''}">${solicitante ?? 'Coordinación de Obras'}</td>
            </tr>
            ${notas ? `<tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Notas</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;">${notas}</td>
            </tr>` : ''}
          </table>

          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
            <thead>
              <tr style="background:#00295A;">
                <th style="padding:10px 12px;color:#fff;font-size:11px;text-align:left;text-transform:uppercase;">Producto</th>
                <th style="padding:10px 12px;color:#fff;font-size:11px;text-align:center;text-transform:uppercase;">Unidad</th>
                <th style="padding:10px 12px;color:#fff;font-size:11px;text-align:center;text-transform:uppercase;">Cantidad</th>
                <th style="padding:10px 12px;color:#fff;font-size:11px;text-align:right;text-transform:uppercase;">Precio Unit.</th>
                <th style="padding:10px 12px;color:#fff;font-size:11px;text-align:right;text-transform:uppercase;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHTML}</tbody>
            <tfoot>
              <tr style="background:#f8fafc;">
                <td colspan="4" style="padding:8px 12px;font-size:12px;color:#64748b;text-align:right;">Subtotal:</td>
                <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#0f172a;text-align:right;">${fmt(subtotal)}</td>
              </tr>
              <tr style="background:#f8fafc;">
                <td colspan="4" style="padding:8px 12px;font-size:12px;color:#64748b;text-align:right;">IVA (${ivaPct}%):</td>
                <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#0f172a;text-align:right;">${fmt(ivaAmt)}</td>
              </tr>
              <tr style="background:#4F82C2;">
                <td colspan="4" style="padding:12px;color:#fff;font-size:13px;font-weight:700;text-align:right;">TOTAL A PAGAR (con IVA)</td>
                <td style="padding:12px;color:#fff;font-size:15px;font-weight:700;text-align:right;">${fmt(totalIVA)}</td>
              </tr>
            </tfoot>
          </table>

          ${link_cotizacion ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:20px;">
            <tr><td style="padding:14px 18px;">
              <p style="font-size:12px;font-weight:700;color:#00295A;margin:0 0 4px;">📎 Cotización del Proveedor</p>
              <a href="${link_cotizacion}" target="_blank" style="color:#4F82C2;font-size:13px;">Ver cotización original →</a>
            </td></tr>
          </table>` : ''}

          <a href="${appUrl}/insumos" style="display:inline-block;background:#00295A;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Dar VoBo en el Sistema →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · ${smtpUser}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
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
