import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Actividad {
  id: number | string;
  categoria: string;
  actividad: string;
  tipo: string;
  frecuencia: string;
  frecuenciaDias: number;
  descripcion: string;
}

interface NotificationRecipient {
  email: string;
  nombre?: string;
}

// ─── Actividades base del cronograma ─────────────────────────────────────────
const ACTIVIDADES_BASE: Actividad[] = [
  { id: 1,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar paredes interiores',       tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de las paredes y divisiones interiores.' },
  { id: 2,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar banquinas y cornisas',     tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de banquinas, cornisas y demás acabados.' },
  { id: 3,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar paredes exteriores',       tipo: 'Limpiar', frecuencia: '2 años',  frecuenciaDias: 730,  descripcion: 'Limpieza general de las paredes exteriores.' },
  { id: 4,  categoria: 'Paredes y Acabados',    actividad: 'Renovar láminas deterioradas',     tipo: 'Renovar', frecuencia: '5 años',  frecuenciaDias: 1825, descripcion: 'Sustitución de las láminas y/o paneles que presenten deterioro.' },
  { id: 5,  categoria: 'Pisos',                 actividad: 'Limpiar piso vinílico',            tipo: 'Limpiar', frecuencia: '1 semana',frecuenciaDias: 7,    descripcion: 'Limpieza y cepillado con productos antimanchas.' },
  { id: 6,  categoria: 'Pisos',                 actividad: 'Encerar pisos cerámicos',          tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Encerado de los pisos cerámicos.' },
  { id: 7,  categoria: 'Pisos',                 actividad: 'Limpiar rodapié',                  tipo: 'Limpiar', frecuencia: '1 semana',frecuenciaDias: 7,    descripcion: 'Limpieza del rodapié.' },
  { id: 8,  categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar láminas de cubierta',     tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,   descripcion: 'Limpieza externa e interna de las láminas.' },
  { id: 9,  categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar canoas',                  tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,   descripcion: 'Limpieza de las canoas.' },
  { id: 10, categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar cubierta de techo',       tipo: 'Limpiar', frecuencia: '4 meses', frecuenciaDias: 120,  descripcion: 'Limpieza de la cubierta de techo.' },
  { id: 11, categoria: 'Techo y Red Pluvial',   actividad: 'Revisar anclajes de láminas',     tipo: 'Revisar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Revisión y resocado de los anclajes de láminas.' },
  { id: 12, categoria: 'Puertas y Ventanas',    actividad: 'Limpiar puertas y ventanas',      tipo: 'Limpiar', frecuencia: '1 mes',   frecuenciaDias: 30,   descripcion: 'Limpieza integral de superficies expuestas.' },
  { id: 13, categoria: 'Puertas y Ventanas',    actividad: 'Lubricar bisagras y pivotes',     tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,   descripcion: 'Lubricación de bisagras, pivotes y brazos hidráulicos.' },
  { id: 14, categoria: 'Puertas y Ventanas',    actividad: 'Limpiar canales de desagüe',      tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de canales y perforaciones de desagüe.' },
  { id: 15, categoria: 'Red de Agua Potable',   actividad: 'Limpiar llaves de paso',          tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Limpiar llaves de paso y lubricación del vástago.' },
  { id: 16, categoria: 'Red de Agua Potable',   actividad: 'Limpiar cajas de registro',       tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Limpieza de las cajas de registro.' },
  { id: 17, categoria: 'Sanitarios',            actividad: 'Limpiar sanitarios',              tipo: 'Limpiar', frecuencia: '1 día',   frecuenciaDias: 1,    descripcion: 'Limpieza y desinfección de lavatorios, orinales e inodoros.' },
  { id: 18, categoria: 'Sanitarios',            actividad: 'Revisar llaves y tuberías',       tipo: 'Revisar', frecuencia: '5 años',  frecuenciaDias: 1825, descripcion: 'Sustitución general de llaves de control y tuberías.' },
  { id: 19, categoria: 'Red Sanitaria',         actividad: 'Limpiar arquetas y trampas',      tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de arquetas, trampa de grasa y cajas de registro.' },
  { id: 20, categoria: 'Red Sanitaria',         actividad: 'Limpiar tanque séptico',          tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Limpieza del tanque séptico y drenajes.' },
  { id: 21, categoria: 'Instalación Eléctrica', actividad: 'Limpiar apagadores y lámparas',  tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de apagadores, tomacorrientes y lámparas.' },
  { id: 22, categoria: 'Instalación Eléctrica', actividad: 'Limpiar difusores lámparas',     tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Desmontaje y limpieza de difusores de lámparas fluorescentes.' },
  { id: 23, categoria: 'Barandillas y Rejas',   actividad: 'Limpiar rejas y barandillas',    tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza integral de las rejas, barandillas y persianas.' },
  { id: 24, categoria: 'Barandillas y Rejas',   actividad: 'Engrasar persianas enrollables', tipo: 'Renovar', frecuencia: '3 años',  frecuenciaDias: 1095, descripcion: 'Engrasado de las guías y del tambor de las persianas.' },
];

const FECHA_BASE = new Date(2025, 0, 1);

// ─── Verificar si una actividad ocurre mañana ────────────────────────────────
function ocurreMañana(act: Actividad, mañana: Date): boolean {
  const diff = Math.floor((mañana.getTime() - FECHA_BASE.getTime()) / 86400000);
  return diff >= 0 && diff % act.frecuenciaDias === 0;
}

// ─── Generar archivo iCalendar (.ics) ─────────────────────────────────────────
function generarICS(actividades: Actividad[], fecha: Date, adminEmail: string): string {
  const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `rcma-${fecha.getTime()}@manoamiga.edu.mx`;

  const fechaStr = formatDate(fecha);
  const fechaFinStr = formatDate(new Date(fecha.getTime() + 3600000)); // +1 hora
  const ahora = formatDate(new Date());

  const titulo = actividades.length === 1
    ? `🔧 Mantenimiento: ${actividades[0].actividad}`
    : `🔧 Mantenimientos programados (${actividades.length} actividades)`;

  const descripcionItems = actividades
    .map(a => `• ${a.actividad} [${a.categoria}] - ${a.tipo}\\n  ${a.descripcion}`)
    .join('\\n\\n');

  const descripcion = `Recordatorio de mantenimiento — Colegios Mano Amiga\\n\\n${descripcionItems}\\n\\nSistema RCMA`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sistema RCMA//Colegios Mano Amiga//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${ahora}`,
    `DTSTART:${fechaStr}`,
    `DTEND:${fechaFinStr}`,
    `SUMMARY:${titulo}`,
    `DESCRIPTION:${descripcion}`,
    `ORGANIZER;CN=Sistema RCMA:mailto:${adminEmail}`,
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Equipo Mantenimiento:mailto:${adminEmail}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio de mantenimiento en 30 minutos',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// ─── Enviar email con iCal adjunto y múltiples destinatarios ─────────────────
async function sendEmailWithICS(
  recipients: string[],
  ccEmail: string,
  subject: string,
  html: string,
  icsContent: string,
  icsFilename: string
) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';

  const conn = await Deno.connect({ hostname: smtpHost, port: smtpPort });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const read = async () => {
    const buf = new Uint8Array(4096);
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
    const buf = new Uint8Array(8192);
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

  // Agregar todos los destinatarios + CC
  const allRecipients = [...new Set([...recipients, ccEmail])];
  for (const r of allRecipients) {
    await tlsWrite(`RCPT TO:<${r}>`);
    await tlsRead();
  }

  await tlsWrite('DATA');
  await tlsRead();

  const boundary = 'boundary_' + Date.now();
  const icsBase64 = btoa(unescape(encodeURIComponent(icsContent)));

  const toHeader = recipients.join(', ');
  const message = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${toHeader}`,
    `Cc: ${ccEmail}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    html,
    '',
    `--${boundary}`,
    `Content-Type: text/calendar; charset=UTF-8; method=REQUEST; name="${icsFilename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${icsFilename}"`,
    '',
    icsBase64,
    '',
    `--${boundary}--`,
    '.',
  ].join('\r\n');

  await tlsWrite(message);
  await tlsRead();
  await tlsWrite('QUIT');
  tlsConn.close();
}

// ─── HTML del correo ──────────────────────────────────────────────────────────
function generarHTML(actividades: Actividad[], fecha: Date, adminEmail: string): string {
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

  const fechaStr = `${DIAS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`;

  const colorTipo = (tipo: string) => {
    if (tipo === 'Limpiar') return { bg: '#dbeafe', text: '#1d4ed8' };
    if (tipo === 'Renovar') return { bg: '#fef3c7', text: '#d97706' };
    return { bg: '#d1fae5', text: '#065f46' };
  };

  const actividadesHTML = actividades.map(act => {
    const c = colorTipo(act.tipo);
    return `
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <div style="flex:1;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f172a;">${act.actividad}</p>
              <p style="margin:0 0 6px;font-size:12px;color:#64748b;">${act.descripcion}</p>
              <div style="display:inline-flex;gap:6px;flex-wrap:wrap;">
                <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:#f1f5f9;color:#475569;">${act.categoria}</span>
                <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${c.bg};color:${c.text};">${act.tipo}</span>
                <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:#f8fafc;color:#94a3b8;">Cada ${act.frecuencia}</span>
              </div>
            </div>
          </div>
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;">
        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">🔧 Sistema RCMA</h1>
            <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Colegios Mano Amiga — Recordatorio de Mantenimiento</p>
          </td>
        </tr>
        <!-- Alerta -->
        <tr>
          <td style="padding:32px 40px 0;">
            <div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0;font-size:15px;font-weight:700;color:#713f12;">⏰ Mantenimiento programado para mañana</p>
              <p style="margin:4px 0 0;font-size:13px;color:#92400e;">${fechaStr}</p>
            </div>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
              Se han programado <strong>${actividades.length} actividad${actividades.length !== 1 ? 'es' : ''} de mantenimiento</strong> para mañana.
              Por favor asegúrese de que el equipo esté preparado.
            </p>
          </td>
        </tr>
        <!-- Lista de actividades -->
        <tr>
          <td style="padding:0 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
              <tr>
                <td style="background:#f8fafc;padding:10px 16px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Actividades programadas</p>
                </td>
              </tr>
              ${actividadesHTML}
            </table>
          </td>
        </tr>
        <!-- Botón agregar calendario -->
        <tr>
          <td style="padding:28px 40px 0;">
            <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:20px;text-align:center;">
              <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#15803d;">📅 Agregar a tu Calendario</p>
              <p style="margin:0 0 16px;font-size:13px;color:#166534;">
                Este correo incluye un archivo <strong>.ics</strong> adjunto. Ábrelo para agregar este recordatorio directamente a tu calendario de Outlook.
              </p>
              <p style="margin:0;font-size:12px;color:#4ade80;font-style:italic;">
                Al aceptar la invitación, el administrador recibirá una confirmación automáticamente.
              </p>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;margin-top:32px;">
            <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
              Sistema RCMA · Colegios Mano Amiga · <a href="mailto:${adminEmail}" style="color:#64748b;">${adminEmail}</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? Deno.env.get('SMTP_USER') ?? '';

    // Calcular fecha de mañana
    const mañana = new Date();
    mañana.setDate(mañana.getDate() + 1);
    mañana.setHours(8, 0, 0, 0); // 8:00 AM

    // Cargar mantenimientos personalizados de Supabase
    const { data: customRaw = [] } = await supabase
      .from('custom_maintenance')
      .select('*');

    const customActividades: Actividad[] = (customRaw || []).map((r: any) => ({
      id: r.id,
      categoria: r.categoria,
      actividad: r.actividad,
      tipo: r.tipo,
      frecuencia: r.frecuencia,
      frecuenciaDias: r.frecuencia_dias,
      descripcion: r.descripcion || '',
    }));

    const todasActividades = [...ACTIVIDADES_BASE, ...customActividades];

    // Filtrar las que ocurren mañana
    const actividadesMañana = todasActividades.filter(act => ocurreMañana(act, mañana));

    if (actividadesMañana.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No hay mantenimientos para mañana', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cargar destinatarios de notificación desde Supabase
    const { data: recipientsRaw = [] } = await supabase
      .from('maintenance_notification_recipients')
      .select('email, nombre')
      .eq('activo', true);

    const recipients: string[] = (recipientsRaw || []).map((r: any) => r.email);

    // Si no hay destinatarios configurados, solo mandar al admin
    const destinatarios = recipients.length > 0 ? recipients : [adminEmail];

    // Generar ICS y HTML
    const icsContent = generarICS(actividadesMañana, mañana, adminEmail);
    const htmlContent = generarHTML(actividadesMañana, mañana, adminEmail);

    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const subject = `🔧 Recordatorio: ${actividadesMañana.length} mantenimiento${actividadesMañana.length !== 1 ? 's' : ''} programado${actividadesMañana.length !== 1 ? 's' : ''} para mañana ${mañana.getDate()} de ${MESES[mañana.getMonth()]}`;
    const icsFilename = `mantenimiento-${mañana.toISOString().split('T')[0]}.ics`;

    // Enviar correo con ICS adjunto
    await sendEmailWithICS(
      destinatarios,
      adminEmail, // siempre con copia al admin
      subject,
      htmlContent,
      icsContent,
      icsFilename
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Recordatorio enviado a ${destinatarios.length} destinatario(s)`,
        actividades: actividadesMañana.length,
        destinatarios: destinatarios.length,
        sent: destinatarios.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Error en send-maintenance-reminders:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});