// Aviso por correo de una corrección hecha por la Coordinación RCMA a una
// Solicitud de Proyecto o a un Ticket MAS. Para: quien llenó la solicitud.
// Copia: los mismos destinatarios que reciben el aviso de solicitud nueva /
// Ticket MAS nuevo (resueltos en vivo desde Directorio).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmail(to: string, cc: string[], subject: string, html: string) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';

  const conn = await Deno.connect({ hostname: smtpHost, port: smtpPort });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const read = async () => {
    const buf = new Uint8Array(1024);
    const n = await conn.read(buf);
    return decoder.decode(buf.subarray(0, n ?? 0));
  };
  const write = async (data: string) => {
    await conn.write(encoder.encode(data + '\r\n'));
  };

  await read();
  await write('EHLO outlook.com');
  await read();
  await write('STARTTLS');
  await read();

  const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
  const tlsWrite = async (data: string) => {
    await tlsConn.write(encoder.encode(data + '\r\n'));
  };
  const tlsRead = async () => {
    const buf = new Uint8Array(4096);
    const n = await tlsConn.read(buf);
    return decoder.decode(buf.subarray(0, n ?? 0));
  };

  await tlsWrite('EHLO outlook.com');
  await tlsRead();
  await tlsWrite('AUTH LOGIN');
  await tlsRead();
  await tlsWrite(btoa(smtpUser));
  await tlsRead();
  await tlsWrite(btoa(smtpPass));
  await tlsRead();
  await tlsWrite(`MAIL FROM:<${smtpUser}>`);
  await tlsRead();
  await tlsWrite(`RCPT TO:<${to}>`);
  await tlsRead();
  // CC recipients
  for (const ccAddr of cc) {
    if (ccAddr) { await tlsWrite(`RCPT TO:<${ccAddr}>`); await tlsRead(); }
  }
  await tlsWrite('DATA');
  await tlsRead();

  const boundary = 'boundary_' + Date.now();
  const ccHeader = cc.filter(Boolean).join(', ');
  const message = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to}`,
    ...(ccHeader ? [`Cc: ${ccHeader}`] : []),
    `Subject: ${asunto(subject)}`,
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

  await tlsWrite(message);
  await tlsRead();
  await tlsWrite('QUIT');
  tlsConn.close();
}

/** Asunto con acentos/emoji codificado (RFC 2047) */
function asunto(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const esCorreo = (s: unknown): s is string => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

interface Cambio { campo: string; antes: string; despues: string }

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      tipo, folio, proyecto, colegio, nombre_solicitante, correo_solicitante,
      motivo, cambios, corregido_por,
    } = await req.json() as {
      tipo: 'solicitud' | 'ticket_mas'; folio?: string; proyecto?: string; colegio?: string;
      nombre_solicitante?: string; correo_solicitante?: string; motivo?: string; cambios?: Cambio[]; corregido_por?: string;
    };
    if (tipo !== 'solicitud' && tipo !== 'ticket_mas') throw new Error('Tipo de corrección no válido');
    if (!esCorreo(correo_solicitante)) throw new Error('La solicitud no tiene un correo de solicitante válido');

    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx';
    const smtpUser   = Deno.env.get('SMTP_USER')   ?? '';
    const siteUrl    = Deno.env.get('SITE_URL')     ?? '';

    // ── Copias: las mismas del aviso original ────────────────────────────────
    let carEmail = '';
    let gerenteEmail = 'arodriguez@manoamiga.edu.mx';          // respaldo
    let directorNacionalEmail = 'ecastaneda@manoamiga.edu.mx'; // respaldo
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey);
      if (colegio) {
        const { data: fila } = await supabase.from('directorio').select('car_correo').eq('nombre', colegio).maybeSingle();
        carEmail = fila?.car_correo ?? '';
      }
      if (tipo === 'ticket_mas') {
        const { data: general } = await supabase.from('directorio').select('gerente_correo, director_nacional_correo').eq('codigo', 'GENERAL').maybeSingle();
        if (general?.gerente_correo) gerenteEmail = general.gerente_correo;
        if (general?.director_nacional_correo) directorNacionalEmail = general.director_nacional_correo;
      }
    }

    let copias: string[];
    if (tipo === 'ticket_mas') {
      // Ticket MAS nuevo: Coordinación + Gerente + Director Nacional + CAR
      copias = [adminEmail, gerenteEmail, directorNacionalEmail, carEmail];
    } else if (['FMA', 'FIA', 'AUN'].includes(String(colegio ?? '').trim())) {
      // Solicitud de FMA: la revisa el jefe directo, con copia a fondeo y Coordinación
      copias = ['arodriguez@manoamiga.edu.mx', 'fguerra@manoamiga.edu.mx', adminEmail];
    } else {
      // Solicitud de Proyecto nueva: Coordinación + CAR del colegio
      copias = [adminEmail, carEmail];
    }
    const para = correo_solicitante.toLowerCase();
    copias = copias
      .map(c => (c ?? '').trim().toLowerCase())
      .filter((c, i, arr) => esCorreo(c) && c !== para && arr.indexOf(c) === i);

    // ── Contenido ────────────────────────────────────────────────────────────
    const que = tipo === 'ticket_mas' ? 'tu Ticket MAS' : 'tu Solicitud de Proyecto';
    const titulo = tipo === 'ticket_mas' ? `Corrección al Ticket MAS ${folio ?? ''}` : 'Corrección a la Solicitud de Proyecto';
    const ruta = tipo === 'ticket_mas' ? '/ticket-mas' : '/';
    const lista: Cambio[] = Array.isArray(cambios) ? cambios.slice(0, 60) : [];

    const filaDato = (k: string, v: unknown, alt: boolean) => `
            <tr${alt ? ' style="background:#f8fafc;"' : ''}><td style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;width:38%;border-bottom:1px solid #e2e8f0;">${k}</td><td style="padding:10px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${esc(v) || '—'}</td></tr>`;
    const filasCambios = lista.map((c, i) => `
            <tr${i % 2 ? ' style="background:#f8fafc;"' : ''}>
              <td style="padding:9px 12px;font-size:12px;font-weight:700;color:#334155;border-bottom:1px solid #e2e8f0;">${esc(c.campo)}</td>
              <td style="padding:9px 12px;font-size:12px;color:#94a3b8;text-decoration:line-through;border-bottom:1px solid #e2e8f0;">${esc(c.antes)}</td>
              <td style="padding:9px 12px;font-size:12px;font-weight:700;color:#0f172a;border-bottom:1px solid #e2e8f0;">${esc(c.despues)}</td>
            </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #ED7102;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Coordinación de Obras — Colegios Mano Amiga</p>
        </td></tr>
        <tr><td style="background:#D97706;padding:16px 40px;">
          <p style="margin:0;color:#fff;font-size:14px;font-weight:600;">✏️ ${esc(titulo)}</p>
        </td></tr>
        <tr><td style="padding:32px 36px;">
          <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
            Hola${nombre_solicitante ? ' ' + esc(nombre_solicitante) : ''}: la Coordinación de Obras y Mantenimiento corrigió ${que} con la información que se indica abajo.
            <strong>No es necesario volver a llenarla</strong>; el trámite continúa con estos datos.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:22px;">${
            [tipo === 'ticket_mas' ? filaDato('Folio', folio, true) : '', filaDato('Proyecto', proyecto, tipo !== 'ticket_mas'), filaDato('Colegio', colegio, tipo === 'ticket_mas'),
             filaDato('Solicitante', nombre_solicitante, tipo !== 'ticket_mas')].join('')}
          </table>
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#334155;text-transform:uppercase;">Qué se corrigió</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:22px;">
            <tr style="background:#334155;">
              <td style="padding:9px 12px;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;width:36%;">Campo</td>
              <td style="padding:9px 12px;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;">Decía</td>
              <td style="padding:9px 12px;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;">Queda</td>
            </tr>${filasCambios}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#9A3412;text-transform:uppercase;">Motivo de la corrección</p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#431407;">${esc(motivo)}</p>
            </td></tr>
          </table>
          <p style="color:#64748b;font-size:12px;line-height:1.5;margin:0 0 22px;">
            Si algún dato no es correcto, responde a este correo o comunícate con la Coordinación de Obras y Mantenimiento.
            Corrección registrada por ${esc(corregido_por || 'la Coordinación RCMA')} en la bitácora de auditoría del sistema.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background:#00295A;border-radius:8px;padding:12px 28px;">
              <a href="${siteUrl}${ruta}" style="color:#fff;font-size:14px;font-weight:600;text-decoration:none;">Abrir el Sistema RCMA →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:20px 36px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Este correo fue enviado automáticamente por <strong>Sistema RCMA</strong> · ${esc(smtpUser)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const subject = tipo === 'ticket_mas'
      ? `✏️ Corrección al Ticket MAS ${folio ?? ''} — ${colegio ?? ''}`
      : `✏️ Corrección a tu solicitud: ${proyecto ?? 'Sin nombre'} — ${colegio ?? ''}`;

    await sendEmail(para, copias, subject, html);

    return new Response(JSON.stringify({ success: true, para, copias }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
