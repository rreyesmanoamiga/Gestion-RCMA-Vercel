import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { encode as b64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base64 de texto UTF-8 / bytes, en renglones de 76 caracteres (como lo pide MIME)
const b64Texto = (t: string) => b64(new TextEncoder().encode(t));
const enRenglones = (s: string) => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();
// Encabezado con acentos/emojis (Asunto, nombre del archivo)
const encabezadoUTF8 = (t: string) => `=?UTF-8?B?${b64Texto(t)}?=`;

interface Adjunto { nombre: string; base64: string }

async function sendEmail(to: string[], cc: string[], subject: string, html: string, adjunto: Adjunto | null) {
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
  // Con el PDF adjunto el mensaje pesa varios MB: se escribe completo aunque el socket acepte por partes
  const tw = async (d: string) => {
    const datos = enc.encode(d + '\r\n');
    let enviado = 0;
    while (enviado < datos.length) enviado += await tls.write(datos.subarray(enviado));
  };
  const tr = async () => { const b = new Uint8Array(4096); const n = await tls.read(b); return dec.decode(b.subarray(0, n ?? 0)); };
  await tw('EHLO outlook.com'); await tr(); await tw('AUTH LOGIN'); await tr();
  await tw(btoa(smtpUser)); await tr(); await tw(btoa(smtpPass)); await tr();
  await tw(`MAIL FROM:<${smtpUser}>`); await tr();
  for (const addr of to) { await tw(`RCPT TO:<${addr}>`); await tr(); }
  for (const addr of cc) { if (addr) { await tw(`RCPT TO:<${addr}>`); await tr(); } }
  await tw('DATA'); await tr();
  const ccHeader = cc.filter(Boolean).join(', ');
  const cabeceras = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to.join(', ')}`,
    ...(ccHeader ? [`Cc: ${ccHeader}`] : []),
    `Subject: ${encabezadoUTF8(subject)}`,
    'MIME-Version: 1.0',
  ];
  let cuerpo: string[];
  if (adjunto) {
    const limite = `rcma_${crypto.randomUUID().replace(/-/g, '')}`;
    const nombre = adjunto.nombre.replace(/[\r\n"]/g, '');
    const nombreAscii = nombre.normalize('NFD').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ') || 'minuta.pdf';
    cuerpo = [
      `Content-Type: multipart/mixed; boundary="${limite}"`,
      '',
      `--${limite}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      enRenglones(b64Texto(html)),
      `--${limite}`,
      `Content-Type: application/pdf; name="${nombreAscii}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${nombreAscii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      '',
      enRenglones(adjunto.base64.replace(/\s+/g, '')),
      `--${limite}--`,
    ];
  } else {
    cuerpo = [
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      enRenglones(b64Texto(html)),
    ];
  }
  await tw([...cabeceras, ...cuerpo, '.'].join('\r\n')); await tr(); await tw('QUIT'); tls.close();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const {
      para, cc, tipo_label, asunto, fecha, proyecto_nombre, territorio, colegio,
      subido_por, onedrive_url, siteUrl, modulo, tema, ruta, adjunto,
    } = await req.json();
    const esCN = modulo === 'cumplimiento';
    // El PDF llega en base64 desde el navegador (hasta ~4 MB); si viene algo raro, se manda sin adjunto
    const pdf: Adjunto | null =
      adjunto && typeof adjunto.base64 === 'string' && adjunto.base64.length > 0 && adjunto.base64.length <= 6_000_000
        ? { nombre: String(adjunto.nombre || 'minuta.pdf'), base64: adjunto.base64 } : null;

    // "Para" puede ser uno o varios correos (texto o lista)
    const paraLista = (Array.isArray(para) ? para : [para]).map(x => String(x ?? '').trim()).filter(Boolean);
    if (!paraLista.length) {
      return new Response(JSON.stringify({ error: 'Falta el destinatario principal (Para)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const fechaFmt = fecha ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #4F82C2;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">${esCN ? 'Cumplimiento Normativo · Protección Civil' : 'Coordinación de Obras'} — Colegios Mano Amiga</p>
        </td></tr>
        <tr><td style="background:#4F82C2;padding:16px 40px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:700;">📄 Nueva ${tipo_label ?? 'Minuta de Reunión'} — ${asunto ?? '—'}</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">
            Se ha subido una nueva ${(tipo_label ?? 'Minuta de Reunión').toLowerCase()} al Sistema RCMA:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:28px;">
            <tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;width:35%;border-bottom:1px solid #e2e8f0;">Asunto</td>
              <td style="padding:12px 16px;font-size:14px;font-weight:600;color:#0f172a;border-bottom:1px solid #e2e8f0;">${asunto ?? '—'}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Fecha de la Reunión</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${fechaFmt}</td>
            </tr>
            ${tema ? `<tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Tema</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${tema}</td>
            </tr>` : ''}
            ${proyecto_nombre ? `<tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Proyecto</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${proyecto_nombre}</td>
            </tr>` : ''}
            ${(territorio || colegio) ? `<tr>
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">Territorio / Colegio</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${[territorio, colegio].filter(Boolean).join(' / ')}</td>
            </tr>` : ''}
            <tr style="background:#f8fafc;">
              <td style="padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;">Subido por</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;">${subido_por ?? '—'}</td>
            </tr>
          </table>
          ${pdf ? `<p style="margin:0 0 18px;padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;color:#1e3a8a;font-size:13px;">📎 El PDF de la ${(tipo_label ?? 'minuta').toLowerCase()} va adjunto a este correo.</p>` : ''}
          ${onedrive_url ? `<a href="${onedrive_url}" style="display:inline-block;background:#4F82C2;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ver Minuta (PDF) →</a>` : ''}
          ${siteUrl ? `<p style="margin:20px 0 0;"><a href="${siteUrl}${ruta || '/minutas'}" style="color:#4F82C2;font-size:13px;">O consúltala en el Sistema RCMA →</a> <span style="color:#94a3b8;font-size:12px;">(requiere usuario del sistema)</span></p>` : ''}
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Sistema RCMA · ${smtpUser}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const paraSet = new Set(paraLista.map(x => x.toLowerCase()));
    const ccLista = (Array.isArray(cc) ? cc : []).filter((x: string) => x && !paraSet.has(String(x).toLowerCase()));
    await sendEmail(paraLista, ccLista, `📄 [RCMA${esCN ? ' · Cumplimiento' : ''}] Nueva ${tipo_label ?? 'Minuta'}: ${asunto ?? 'Reunión'}`, html, pdf);

    return new Response(
      JSON.stringify({ success: true, adjunto: !!pdf }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
