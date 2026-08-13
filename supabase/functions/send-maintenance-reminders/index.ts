import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Actividad {
  id: number | string;
  categoria: string;
  actividad: string;
  tipo: string;
  frecuencia: string;
  frecuenciaDias: number;
  descripcion: string;
}

const ACTIVIDADES_BASE: Actividad[] = [
  { id: 1,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar paredes interiores',      tipo: 'Limpiar', frecuencia: '6 meses',  frecuenciaDias: 180  , descripcion: 'Limpieza de las paredes y divisiones interiores.' },
  { id: 2,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar banquinas y cornisas',    tipo: 'Limpiar', frecuencia: '6 meses',  frecuenciaDias: 180  , descripcion: 'Limpieza de banquinas, cornisas y demas acabados.' },
  { id: 3,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar paredes exteriores',      tipo: 'Limpiar', frecuencia: '2 anos',   frecuenciaDias: 730  , descripcion: 'Limpieza general de las paredes exteriores.' },
  { id: 4,  categoria: 'Paredes y Acabados',    actividad: 'Renovar laminas deterioradas',    tipo: 'Renovar', frecuencia: '5 anos',   frecuenciaDias: 1825 , descripcion: 'Sustitucion de las laminas y/o paneles deteriorados.' },
  { id: 5,  categoria: 'Pisos',                 actividad: 'Limpiar piso vinilico',           tipo: 'Limpiar', frecuencia: '1 semana', frecuenciaDias: 7    , descripcion: 'Limpieza y cepillado con productos antimanchas.' },
  { id: 6,  categoria: 'Pisos',                 actividad: 'Encerar pisos ceramicos',         tipo: 'Limpiar', frecuencia: '6 meses',  frecuenciaDias: 180  , descripcion: 'Encerado de los pisos ceramicos.' },
  { id: 7,  categoria: 'Pisos',                 actividad: 'Limpiar rodapie',                 tipo: 'Limpiar', frecuencia: '1 semana', frecuenciaDias: 7    , descripcion: 'Limpieza del rodapie.' },
  { id: 8,  categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar laminas de cubierta',     tipo: 'Limpiar', frecuencia: '3 meses',  frecuenciaDias: 90   , descripcion: 'Limpieza externa e interna de las laminas.' },
  { id: 9,  categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar canoas',                  tipo: 'Limpiar', frecuencia: '3 meses',  frecuenciaDias: 90   , descripcion: 'Limpieza de las canoas.' },
  { id: 10, categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar cubierta de techo',       tipo: 'Limpiar', frecuencia: '4 meses',  frecuenciaDias: 120  , descripcion: 'Limpieza de la cubierta de techo.' },
  { id: 11, categoria: 'Techo y Red Pluvial',   actividad: 'Revisar anclajes de laminas',     tipo: 'Revisar', frecuencia: '1 ano',    frecuenciaDias: 365  , descripcion: 'Revision y resocado de los anclajes de laminas.' },
  { id: 12, categoria: 'Puertas y Ventanas',    actividad: 'Limpiar puertas y ventanas',      tipo: 'Limpiar', frecuencia: '1 mes',    frecuenciaDias: 30   , descripcion: 'Limpieza integral de superficies expuestas.' },
  { id: 13, categoria: 'Puertas y Ventanas',    actividad: 'Lubricar bisagras y pivotes',     tipo: 'Limpiar', frecuencia: '3 meses',  frecuenciaDias: 90   , descripcion: 'Lubricacion de bisagras, pivotes y brazos hidraulicos.' },
  { id: 14, categoria: 'Puertas y Ventanas',    actividad: 'Limpiar canales de desague',      tipo: 'Limpiar', frecuencia: '6 meses',  frecuenciaDias: 180  , descripcion: 'Limpieza de canales y perforaciones de desague.' },
  { id: 15, categoria: 'Red de Agua Potable',   actividad: 'Limpiar llaves de paso',          tipo: 'Limpiar', frecuencia: '1 ano',    frecuenciaDias: 365  , descripcion: 'Limpiar llaves de paso y lubricacion del vastago.' },
  { id: 16, categoria: 'Red de Agua Potable',   actividad: 'Limpiar cajas de registro',       tipo: 'Limpiar', frecuencia: '1 ano',    frecuenciaDias: 365  , descripcion: 'Limpieza de las cajas de registro.' },
  { id: 17, categoria: 'Sanitarios',            actividad: 'Limpiar sanitarios',              tipo: 'Limpiar', frecuencia: '1 dia',    frecuenciaDias: 1    , descripcion: 'Limpieza y desinfeccion de lavatorios, orinales e inodoros.' },
  { id: 18, categoria: 'Sanitarios',            actividad: 'Revisar llaves y tuberias',       tipo: 'Revisar', frecuencia: '5 anos',   frecuenciaDias: 1825 , descripcion: 'Sustitucion general de llaves de control y tuberias.' },
  { id: 19, categoria: 'Red Sanitaria',         actividad: 'Limpiar arquetas y trampas',      tipo: 'Limpiar', frecuencia: '6 meses',  frecuenciaDias: 180  , descripcion: 'Limpieza de arquetas, trampa de grasa y cajas de registro.' },
  { id: 20, categoria: 'Red Sanitaria',         actividad: 'Limpiar tanque septico',          tipo: 'Limpiar', frecuencia: '1 ano',    frecuenciaDias: 365  , descripcion: 'Limpieza del tanque septico y drenajes.' },
  { id: 21, categoria: 'Instalacion Electrica', actividad: 'Limpiar apagadores y lamparas',  tipo: 'Limpiar', frecuencia: '6 meses',  frecuenciaDias: 180  , descripcion: 'Limpieza de apagadores, tomacorrientes y lamparas.' },
  { id: 22, categoria: 'Instalacion Electrica', actividad: 'Limpiar difusores lamparas',     tipo: 'Limpiar', frecuencia: '1 ano',    frecuenciaDias: 365  , descripcion: 'Desmontaje y limpieza de difusores de lamparas.' },
  { id: 23, categoria: 'Barandillas y Rejas',   actividad: 'Limpiar rejas y barandillas',    tipo: 'Limpiar', frecuencia: '6 meses',  frecuenciaDias: 180  , descripcion: 'Limpieza integral de las rejas, barandillas y persianas.' },
  { id: 24, categoria: 'Barandillas y Rejas',   actividad: 'Engrasar persianas enrollables', tipo: 'Renovar', frecuencia: '3 anos',   frecuenciaDias: 1095 , descripcion: 'Engrasado de las guias y del tambor de las persianas.' },
];

const FECHA_BASE = new Date(2025, 0, 1);

function ocurreHoy(act: Actividad, hoy: Date): boolean {
  const diffHoy = Math.floor((hoy.getTime() - FECHA_BASE.getTime()) / 86400000);
  const esFechaNaturalHoy = diffHoy >= 0 && diffHoy % act.frecuenciaDias === 0;

  if (act.frecuenciaDias === 1) {
    // Diaria: el domingo se omite, sin correrse.
    return esFechaNaturalHoy && hoy.getDay() !== 0;
  }

  // No diaria: cuenta si hoy es su fecha natural (y no es domingo)...
  if (esFechaNaturalHoy && hoy.getDay() !== 0) return true;
  // ...o si hoy es lunes y absorbe la fecha natural que cayó el domingo anterior.
  if (hoy.getDay() === 1) {
    const domingoAnterior = new Date(hoy.getTime() - 86400000);
    const diffDom = Math.floor((domingoAnterior.getTime() - FECHA_BASE.getTime()) / 86400000);
    if (diffDom >= 0 && diffDom % act.frecuenciaDias === 0) return true;
  }
  return false;
}

// ─── SMTP identico a notify-nueva-solicitud (funcionando) ─────────────────────
async function sendEmail(to: string, subject: string, html: string) {
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
  await tlsWrite('DATA');
  await tlsRead();

  const boundary = 'boundary_' + Date.now();
  const message = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to}`,
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

  await tlsWrite(message);
  await tlsRead();
  await tlsWrite('QUIT');
  tlsConn.close();
}

function generarHTML(actividades: Actividad[], fecha: Date, adminEmail: string, siteUrl: string): string {
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const DIAS  = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  const fechaStr = `${DIAS[fecha.getDay()]} ${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`;

  const colorTipo = (tipo: string) => {
    if (tipo === 'Limpiar') return { bg: '#dbeafe', text: '#1d4ed8' };
    if (tipo === 'Renovar') return { bg: '#fef3c7', text: '#d97706' };
    return { bg: '#d1fae5', text: '#065f46' };
  };

  const actividadesHTML = actividades.map(act => {
    const c = colorTipo(act.tipo);
    return `<tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0f172a;">${act.actividad}</p>
        <p style="margin:0 0 6px;font-size:12px;color:#64748b;">${act.descripcion}</p>
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:#f1f5f9;color:#475569;">${act.categoria}</span>
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${c.bg};color:${c.text};">${act.tipo}</span>
        <span style="font-size:11px;padding:2px 8px;border-radius:20px;background:#f8fafc;color:#94a3b8;">Cada ${act.frecuencia}</span>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<tr><td style="background:#00295A;padding:32px 40px;border-bottom:3px solid #ED7102;">
  <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Sistema RCMA — Recordatorio de Mantenimiento</h1>
  <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Colegios Mano Amiga</p>
</td></tr>
<tr><td style="padding:32px 40px 0;">
  <div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
    <p style="margin:0;font-size:15px;font-weight:700;color:#713f12;">Mantenimiento programado para hoy</p>
    <p style="margin:4px 0 0;font-size:13px;color:#92400e;">${fechaStr}</p>
  </div>
  <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
    Se ${actividades.length === 1 ? 'ha programado' : 'han programado'} <strong>${actividades.length} actividad${actividades.length !== 1 ? 'es' : ''} de mantenimiento</strong> para hoy.
  </p>
</td></tr>
<tr><td style="padding:0 40px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    <tr><td style="background:#f8fafc;padding:10px 16px;border-bottom:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Actividades programadas</p>
    </td></tr>
    ${actividadesHTML}
  </table>
</td></tr>
<tr><td style="padding:0 40px 32px;">
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;">
    <p style="margin:0;font-size:13px;color:#1e40af;">
      <strong>No se te olvide marcar como realizado</strong> en el sistema en cuanto termines cada actividad — toma menos de un minuto y así queda tu registro al día.
    </p>
  </div>
  <a href="${siteUrl}/calendario" style="display:inline-block;margin-top:16px;background:#ED7102;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">Ir a marcar en el sistema →</a>
</td></tr>
<tr><td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
  <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">Sistema RCMA — Colegios Mano Amiga</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

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
    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data: customRaw = [] } = await supabase
      .from('custom_maintenance').select('*');

    // Respetar overrides de actividades base (base_id) y las que se ocultaron
    const baseOverrides: Record<number, { data: Actividad; eliminado: boolean }> = {};
    (customRaw || []).filter((r: any) => r.base_id != null).forEach((r: any) => {
      baseOverrides[r.base_id] = {
        eliminado: !!r.eliminado,
        data: {
          id: r.base_id, categoria: r.categoria, actividad: r.actividad,
          tipo: r.tipo, frecuencia: r.frecuencia,
          frecuenciaDias: r.frecuencia_dias, descripcion: r.descripcion || '',
        },
      };
    });
    const actividadesBase = ACTIVIDADES_BASE
      .filter(a => !baseOverrides[a.id as number]?.eliminado)
      .map(a => baseOverrides[a.id as number]?.data ?? a);
    const customPuras: Actividad[] = (customRaw || [])
      .filter((r: any) => r.base_id == null)
      .map((r: any) => ({
        id: r.id, categoria: r.categoria, actividad: r.actividad,
        tipo: r.tipo, frecuencia: r.frecuencia,
        frecuenciaDias: r.frecuencia_dias, descripcion: r.descripcion || '',
      }));

    const todasActividades = [...actividadesBase, ...customPuras];
    const actividadesHoy = todasActividades.filter(act => ocurreHoy(act, hoy));

    if (actividadesHoy.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No hay mantenimientos para hoy', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Leer configuración desde maintenance_settings ──────────────────────
    const { data: allSettings } = await supabase
      .from('maintenance_settings')
      .select('key, value')
      .in('key', ['admin_notif_activo', 'notif_hora']);

    const settingsMap: Record<string, string> = {};
    for (const s of (allSettings ?? [])) settingsMap[s.key] = String(s.value);

    // Toggle: solo es true si explícitamente dice 'true'
    const adminNotifActivo: boolean = settingsMap['admin_notif_activo'] === 'true';

    // Verificar que la hora actual coincida con la configurada
    const horaConfig = parseInt(settingsMap['notif_hora'] ?? '7', 10);
    const horaMexico = new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false });
    const horaActual = parseInt(horaMexico, 10);

    if (horaActual !== horaConfig) {
      return new Response(JSON.stringify({ skipped: true, reason: `Hora actual ${horaActual} != hora config ${horaConfig}` }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Nota: "adminNotifActivo" solo decide si TÚ (admin) recibes copia personal.
    // Ya NO corta el envío a los demás destinatarios — antes, si tenías tu copia
    // apagada, se cancelaba todo el recordatorio para todo mundo, aunque otros
    // destinatarios sí estuvieran configurados para recibirlo.

    // ── Destinatarios con filtro de actividades ─────────────────────────────
    const { data: recipientsRaw = [] } = await supabase
      .from('maintenance_notification_recipients')
      .select('email, actividades_ids')
      .eq('activo', true);

    let sent = 0;
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const subject = `Sistema RCMA: ${actividadesHoy.length} mantenimiento(s) para hoy ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`;

    // Enviar al admin solo si tiene el toggle activado
    if (adminNotifActivo && adminEmail) {
      const htmlContent = generarHTML(actividadesHoy, hoy, adminEmail, siteUrl);
      await sendEmail(adminEmail, subject, htmlContent);
      sent++;
    }

    // Enviar a cada destinatario respetando su filtro de actividades
    for (const r of (recipientsRaw || []) as any[]) {
      if (!r.email) continue;
      // Si tiene filtro, enviar solo las actividades que le corresponden
      const actividadesParaEste: Actividad[] = r.actividades_ids == null
        ? actividadesHoy
        : actividadesHoy.filter(act => (r.actividades_ids as number[]).includes(Number(act.id)));

      if (actividadesParaEste.length === 0) continue;

      const htmlContent = generarHTML(actividadesParaEste, hoy, adminEmail, siteUrl);
      await sendEmail(r.email, subject, htmlContent);
      sent++;
    }

    return new Response(
      JSON.stringify({ success: true, message: `Recordatorio enviado a ${sent} destinatario(s)`, actividades: actividadesHoy.length, sent }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});