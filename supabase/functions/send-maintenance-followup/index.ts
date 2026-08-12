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
  _esBase?: boolean; // true = actividad precargada (id numérico original), false = custom pura (UUID)
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

// Misma regla que en el sistema: diarias se omiten en domingo (sin correrse);
// el resto se corre al lunes si su única fecha del periodo cae en domingo.
function ocurreHoy(act: Actividad, hoy: Date): boolean {
  const diffHoy = Math.floor((hoy.getTime() - FECHA_BASE.getTime()) / 86400000);
  const esFechaNaturalHoy = diffHoy >= 0 && diffHoy % act.frecuenciaDias === 0;

  if (act.frecuenciaDias === 1) {
    return esFechaNaturalHoy && hoy.getDay() !== 0;
  }

  if (esFechaNaturalHoy && hoy.getDay() !== 0) return true;
  if (hoy.getDay() === 1) {
    const domingoAnterior = new Date(hoy.getTime() - 86400000);
    const diffDom = Math.floor((domingoAnterior.getTime() - FECHA_BASE.getTime()) / 86400000);
    if (diffDom >= 0 && diffDom % act.frecuenciaDias === 0) return true;
  }
  return false;
}

async function sendEmail(to: string, subject: string, html: string) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';

  const conn = await Deno.connect({ hostname: smtpHost, port: smtpPort });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const read = async () => { const buf = new Uint8Array(1024); const n = await conn.read(buf); return decoder.decode(buf.subarray(0, n ?? 0)); };
  const write = async (data: string) => { await conn.write(encoder.encode(data + '\r\n')); };

  await read(); await write('EHLO outlook.com'); await read(); await write('STARTTLS'); await read();

  const tlsConn = await Deno.startTls(conn, { hostname: smtpHost });
  const tlsWrite = async (data: string) => { await tlsConn.write(encoder.encode(data + '\r\n')); };
  const tlsRead = async () => { const buf = new Uint8Array(4096); const n = await tlsConn.read(buf); return decoder.decode(buf.subarray(0, n ?? 0)); };

  await tlsWrite('EHLO outlook.com'); await tlsRead();
  await tlsWrite('AUTH LOGIN'); await tlsRead();
  await tlsWrite(btoa(smtpUser)); await tlsRead();
  await tlsWrite(btoa(smtpPass)); await tlsRead();
  await tlsWrite(`MAIL FROM:<${smtpUser}>`); await tlsRead();
  await tlsWrite(`RCPT TO:<${to}>`); await tlsRead();
  await tlsWrite('DATA'); await tlsRead();

  const boundary = 'boundary_' + Date.now();
  const message = [
    `From: Sistema RCMA <${smtpUser}>`, `To: ${to}`, `Subject: ${subject}`,
    'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', '', html, '', `--${boundary}--`, '.',
  ].join('\r\n');

  await tlsWrite(message); await tlsRead();
  await tlsWrite('QUIT'); tlsConn.close();
}

function generarHTML(colegio: string, pendientes: Actividad[], siteUrl: string): string {
  const filasHTML = pendientes.map(act => `<tr>
    <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;">
      <p style="margin:0 0 3px;font-size:13px;font-weight:700;color:#0f172a;">${act.actividad}</p>
      <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:#f1f5f9;color:#475569;">${act.categoria}</span>
    </td>
  </tr>`).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<tr><td style="background:#00295A;padding:28px 36px;border-bottom:3px solid #ED7102;">
  <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">⚠️ Aviso de seguimiento</p>
  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Aún no has marcado tu mantenimiento de hoy</h1>
</td></tr>
<tr><td style="padding:24px 36px 0;">
  <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 4px;">
    Hola, este es un recordatorio de que <strong>${colegio}</strong> tiene ${pendientes.length} actividad${pendientes.length !== 1 ? 'es' : ''} de mantenimiento programada${pendientes.length !== 1 ? 's' : ''} para hoy que todavía no se ${pendientes.length !== 1 ? 'han' : 'ha'} marcado como realizada${pendientes.length !== 1 ? 's' : ''} en el sistema.
  </p>
</td></tr>
<tr><td style="padding:16px 36px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    <tr><td style="background:#f8fafc;padding:10px 16px;border-bottom:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;">Pendientes de hoy</p>
    </td></tr>
    ${filasHTML}
  </table>
</td></tr>
<tr><td style="padding:24px 36px 32px;">
  <a href="${siteUrl}/calendario" style="display:inline-block;background:#ED7102;color:#fff;padding:11px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">Marcar en el sistema →</a>
  <p style="margin:12px 0 0;color:#94a3b8;font-size:11px;">Te toma menos de un minuto — solo entra a Calendario y dale clic a "Marcar realizado".</p>
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

    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';

    const hoy = new Date();
    const hoyISO = hoy.toISOString().slice(0, 10);

    // ── Catálogo de actividades (base + overrides + custom, excluyendo ocultas) ──
    const { data: customRaw = [] } = await supabase.from('custom_maintenance').select('*');

    const baseOverrides: Record<number, { data: Actividad; eliminado: boolean }> = {};
    (customRaw || []).filter((r: any) => r.base_id != null).forEach((r: any) => {
      baseOverrides[r.base_id] = {
        eliminado: !!r.eliminado,
        data: {
          id: r.base_id, categoria: r.categoria, actividad: r.actividad,
          tipo: r.tipo, frecuencia: r.frecuencia, frecuenciaDias: r.frecuencia_dias,
          descripcion: r.descripcion || '', _esBase: true,
        },
      };
    });
    const actividadesBase = ACTIVIDADES_BASE
      .filter(a => !baseOverrides[a.id as number]?.eliminado)
      .map(a => baseOverrides[a.id as number]?.data ?? { ...a, _esBase: true });
    const customPuras: Actividad[] = (customRaw || [])
      .filter((r: any) => r.base_id == null)
      .map((r: any) => ({
        id: r.id, categoria: r.categoria, actividad: r.actividad,
        tipo: r.tipo, frecuencia: r.frecuencia, frecuenciaDias: r.frecuencia_dias,
        descripcion: r.descripcion || '', _esBase: false,
      }));
    const todasActividades = [...actividadesBase, ...customPuras];

    const actividadesHoy = todasActividades.filter(act => ocurreHoy(act, hoy));
    if (actividadesHoy.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Sin mantenimientos programados para hoy', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const actividadRef = (act: Actividad) => act._esBase ? `base:${act.id}` : `custom:${act.id}`;

    // ── Colegios con administrador asignado (colegio específico + ver_calendario) ──
    const { data: admins = [] } = await supabase
      .from('user_permissions')
      .select('user_email, nombre, colegio')
      .eq('ver_calendario', true)
      .not('colegio', 'is', null)
      .neq('colegio', '')
      .neq('colegio', 'ECO');

    const colegiosConAdmin = [...new Set((admins || []).map((a: any) => a.colegio))];
    if (colegiosConAdmin.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Sin administradores de colegio configurados', sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Lo que ya se marcó hoy, por colegio ─────────────────────────────────
    const { data: completions = [] } = await supabase
      .from('maintenance_completions')
      .select('colegio, actividad_ref')
      .eq('fecha_programada', hoyISO);

    const completadoSet = new Set((completions || []).map((c: any) => `${c.colegio}|${c.actividad_ref}`));

    let sent = 0;
    for (const colegio of colegiosConAdmin) {
      const pendientes = actividadesHoy.filter(act => !completadoSet.has(`${colegio}|${actividadRef(act)}`));
      if (pendientes.length === 0) continue; // ya marcó todo — no se le manda nada

      const destinatarios = (admins || []).filter((a: any) => a.colegio === colegio);
      if (destinatarios.length === 0) continue;

      const html = generarHTML(colegio as string, pendientes, siteUrl);
      const subject = `⚠️ ${colegio}: ${pendientes.length} mantenimiento(s) sin marcar hoy`;

      for (const d of destinatarios as any[]) {
        if (!d.user_email) continue;
        try { await sendEmail(d.user_email, subject, html); sent++; }
        catch (e) { console.error(`Error enviando a ${d.user_email}:`, e); }
      }
    }

    return new Response(JSON.stringify({ success: true, colegiosConPendientes: sent > 0, sent }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Error:', message);
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
