// ============================================================================
// sol-notificaciones — Correos del Programa SOL en campo
//
// Body JSON: { accion, id }
//   · recorrido_terminado (id = sol_inspecciones.id) → director y administrador del
//       colegio, con copia a la Coordinación y a quien hizo el recorrido.
//   · jornada_aviso       (id = sol_apoyos.id)       → Coordinación: hay un aviso por autorizar.
//   · jornada_respuesta   (id = sol_apoyos.id)       → quien avisó: autorizada o regresada.
//   · firma_solicitada    (id = sol_firmas.id)       → Coordinación: piden su firma.
//   · firma_resuelta      (id = sol_firmas.id)       → quien la pidió: firmada o regresada.
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL    = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();

const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
class Falla extends Error { constructor(msg: string, public status = 400) { super(msg); } }

// ── Mismo helper SMTP que usan las demás funciones ─────────────────────────────
async function sendEmail(to: string, cc: string[], subject: string, html: string) {
  const smtpHost = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const smtpPort = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const smtpUser = Deno.env.get('SMTP_USER') ?? '';
  const smtpPass = Deno.env.get('SMTP_PASS') ?? '';

  const conn    = await Deno.connect({ hostname: smtpHost, port: smtpPort });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const read    = async () => { const b = new Uint8Array(1024); const n = await conn.read(b); return decoder.decode(b.subarray(0, n ?? 0)); };
  const write   = async (d: string) => { await conn.write(encoder.encode(d + '\r\n')); };

  await read(); await write('EHLO outlook.com'); await read();
  await write('STARTTLS'); await read();

  const tls      = await Deno.startTls(conn, { hostname: smtpHost });
  const tlsWrite = async (d: string) => { await tls.write(encoder.encode(d + '\r\n')); };
  const tlsRead  = async () => { const b = new Uint8Array(4096); const n = await tls.read(b); return decoder.decode(b.subarray(0, n ?? 0)); };

  await tlsWrite('EHLO outlook.com'); await tlsRead();
  await tlsWrite('AUTH LOGIN');       await tlsRead();
  await tlsWrite(btoa(smtpUser));     await tlsRead();
  await tlsWrite(btoa(smtpPass));     await tlsRead();
  await tlsWrite(`MAIL FROM:<${smtpUser}>`); await tlsRead();
  await tlsWrite(`RCPT TO:<${to}>`); await tlsRead();
  for (const c of cc) { await tlsWrite(`RCPT TO:<${c}>`); await tlsRead(); }
  await tlsWrite('DATA'); await tlsRead();

  const boundary = 'boundary_' + Date.now();
  const message = [
    `From: Sistema RCMA <${smtpUser}>`,
    `To: ${to}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
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

  await tlsWrite(message); await tlsRead();
  await tlsWrite('QUIT');
  tls.close();
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const fecha = (d?: string | null) => { if (!d) return '—'; const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
const limpios = (xs: (string | null | undefined)[], quitar: string[] = []) => {
  const fuera = new Set(quitar.map(x => x.toLowerCase()));
  const out: string[] = [];
  for (const x of xs) { const v = (x ?? '').trim().toLowerCase(); if (v && v.includes('@') && !fuera.has(v) && !out.includes(v)) out.push(v); }
  return out;
};

/** Plantilla institucional (igual a los demás correos del sistema). */
function plantilla(franja: string, color: string, saludo: string, cuerpo: string, filas: [string, string][], boton?: { texto: string; url: string }) {
  const tabla = filas.map(([k, v], i) => `<tr${i % 2 ? '' : ' style="background:#f8fafc;"'}><td style="padding:10px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;width:38%;border-bottom:1px solid #e2e8f0;">${esc(k)}</td><td style="padding:10px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${v}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
<tr><td style="background:#00295A;padding:28px 40px;border-bottom:3px solid ${color};">
<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Sistema RCMA</h1>
<p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">Programa SOL · Seguridad, Orden y Limpieza</p></td></tr>
<tr><td style="background:${color};padding:14px 40px;"><p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;">${esc(franja)}</p></td></tr>
<tr><td style="padding:32px 40px;">
<p style="color:#475569;font-size:15px;margin:0 0 8px;">${saludo}</p>
<p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 20px;">${cuerpo}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">${tabla}</table>
${boton ? `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 4px;"><a href="${boton.url}" style="background-color:#0f172a;color:#ffffff;padding:13px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;display:inline-block;">${esc(boton.texto)}</a></td></tr></table>` : ''}
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;"><p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">Coordinación de Obras y Mantenimiento RCMA · Sistema RCMA &#169; ${new Date().getFullYear()}</p></td></tr>
</table></td></tr></table></body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: eu } = await db.auth.getUser(jwt);
    if (eu || !u?.user?.email) throw new Falla('Sesión no válida', 401);
    const yo = u.user.email.toLowerCase();
    const esAdmin = yo === ADMIN_EMAIL || u.user.app_metadata?.role === 'admin';

    const { accion, id } = await req.json().catch(() => ({}));
    if (!accion || !id) throw new Falla('Falta la acción o el registro');
    const colegioDe = async (codigo: string) => (await db.from('directorio').select('codigo, nombre, dir_nombre, dir_correo, adm_nombre, adm_correo').eq('codigo', codigo).maybeSingle()).data;

    // ── Recorrido terminado → director y administrador del colegio ─────────
    if (accion === 'recorrido_terminado') {
      const { data: i } = await db.from('sol_inspecciones').select('*').eq('id', id).maybeSingle();
      if (!i) throw new Falla('Recorrido no encontrado', 404);
      if (!esAdmin && (i.created_by ?? '').toLowerCase() !== yo) throw new Falla('No hiciste este recorrido', 403);
      const c = await colegioDe(i.colegio);
      const { data: hs } = await db.from('sol_hallazgos').select('riesgo_grave, cuenta_sol').eq('inspeccion_id', id);
      const { count: nTr } = await db.from('sol_tarjetas_rojas').select('id', { count: 'exact', head: true }).eq('inspeccion_id', id);
      const graves = (hs ?? []).filter(h => h.riesgo_grave).length;
      const r = i.recorrido ?? {};
      const para = limpios([c?.dir_correo, c?.adm_correo]);
      const destino = para[0] ?? ADMIN_EMAIL;
      const cc = limpios([...para.slice(1), ADMIN_EMAIL, i.created_by], [destino]);
      const html = plantilla(`Informe de Recorrido SOL · ${i.folio ?? ''}`, '#ED7102',
        `Estimado(a) <strong>${esc(c?.dir_nombre || 'Director(a)')}</strong>,`,
        `El equipo de Mano Amiga Servicios realizó un <strong>Recorrido SOL</strong> en su colegio. Le compartimos el resultado y el informe con las fotos; los hallazgos ya están registrados con su fecha compromiso.${graves ? ` <strong style="color:#b91c1c;">Hay ${graves} punto(s) de riesgo grave que deben atenderse hoy.</strong>` : ''}`,
        [
          ['Folio', `<strong style="color:#ED7102;">${esc(i.folio)}</strong>`],
          ['Colegio', esc(c?.nombre ?? i.colegio)],
          ['Fecha', `${fecha(i.fecha)} · ${esc(r.hora_inicio ?? '')}–${esc(r.hora_fin ?? '')}`],
          ['Elaboró', esc(r.elaboro_nombre ?? i.inspectores ?? '—')],
          ['Índice SOL', `<strong>${i.indice ?? '—'}</strong> &nbsp;(S ${i.indice_s ?? '—'} · O ${i.indice_o ?? '—'} · L ${i.indice_l ?? '—'})`],
          ['Hallazgos', `${(hs ?? []).length}${graves ? ` · <span style="color:#b91c1c;font-weight:700;">${graves} riesgo grave</span>` : ''}`],
          ['Tarjetas rojas', `${nTr ?? 0} · 30 días para darles destino`],
        ],
        i.pdf_url ? { texto: 'Ver informe en PDF', url: i.pdf_url } : undefined);
      await sendEmail(destino, cc, `Informe de Recorrido SOL ${i.folio ?? ''} · ${c?.nombre ?? i.colegio}`, html);
      return json({ ok: true });
    }

    // ── Jornadas de voluntariado ───────────────────────────────────────────
    if (accion === 'jornada_aviso' || accion === 'jornada_respuesta') {
      const { data: a } = await db.from('sol_apoyos').select('*').eq('id', id).maybeSingle();
      if (!a) throw new Falla('Jornada no encontrada', 404);
      if (!esAdmin && (a.creado_por ?? '').toLowerCase() !== yo) throw new Falla('No avisaste esta jornada', 403);
      const c = await colegioDe(a.colegio);
      const { data: al } = await db.from('sol_aliados').select('nombre').eq('id', a.aliado_id).maybeSingle();
      const filas: [string, string][] = [
        ['Folio', `<strong style="color:#ED7102;">${esc(a.folio)}</strong>`],
        ['Colegio', esc(c?.nombre ?? a.colegio)],
        ['Aliado', esc(al?.nombre ?? '—')],
        ['Fecha y horario', `${fecha(a.fecha)} · ${esc(a.hora_inicio ?? '')}–${esc(a.hora_fin ?? '')}`],
        ['Actividades', esc((a.actividades ?? []).join(', ') || a.actividad)],
        ['Voluntarios esperados', esc(a.voluntarios_esperados ?? '—')],
        ['Hallazgos por atender', String((a.hallazgos_ids ?? []).length)],
      ];
      if (accion === 'jornada_aviso') {
        const html = plantilla(`Aviso de jornada de voluntariado · ${a.folio}`, '#059669', 'Hola,',
          `<strong>${esc(a.creado_nombre || a.creado_por)}</strong> avisó una jornada de Voluntariado SOL. Revísala y autorízala o regrésala con observaciones.${a.notas ? `<br/><em>Notas: ${esc(a.notas)}</em>` : ''}`,
          filas, { texto: 'Revisar en Voluntariado SOL', url: `${SITE_URL}/sol/voluntariado` });
        await sendEmail(ADMIN_EMAIL, limpios([a.creado_por], [ADMIN_EMAIL]), `Aviso de voluntariado ${a.folio} · ${c?.nombre ?? a.colegio}`, html);
      } else {
        const ok = a.estatus === 'autorizada';
        const html = plantilla(ok ? `Jornada autorizada · ${a.folio}` : `Jornada regresada · ${a.folio}`, ok ? '#059669' : '#b91c1c',
          `Hola <strong>${esc(a.creado_nombre || '')}</strong>,`,
          ok ? 'La Coordinación <strong style="color:#059669;">autorizó</strong> la jornada. El día de la jornada registra la llegada desde Voluntariado SOL; el responsable del aliado acepta las reglas en pantalla.'
             : `La Coordinación <strong style="color:#b91c1c;">regresó</strong> el aviso con estas observaciones:<br/><em>${esc(a.obs_coordinacion ?? '')}</em><br/>Corrígelo y reenvíalo desde Voluntariado SOL.`,
          filas, { texto: 'Abrir Voluntariado SOL', url: `${SITE_URL}/sol/jornadas` });
        const para = (a.creado_por ?? '').toLowerCase() || ADMIN_EMAIL;
        await sendEmail(para, limpios([ADMIN_EMAIL], [para]), `${ok ? 'Autorizada' : 'Regresada'}: jornada ${a.folio} · ${c?.nombre ?? a.colegio}`, html);
      }
      return json({ ok: true });
    }

    // ── Firma del Coordinador ──────────────────────────────────────────────
    if (accion === 'firma_solicitada' || accion === 'firma_resuelta') {
      const { data: f } = await db.from('sol_firmas').select('*').eq('id', id).maybeSingle();
      if (!f) throw new Falla('Solicitud no encontrada', 404);
      if (!esAdmin && (f.solicitado_por ?? '').toLowerCase() !== yo) throw new Falla('No pediste esta firma', 403);
      const d = f.datos ?? {};
      const filas: [string, string][] = [
        ['Reconocimiento', `<strong>${esc(f.titulo)}</strong>`],
        ['Se otorga a', esc(d.aliadoNombre || d.campusNombre || '—')],
        ['Motivo', esc(d.actividad ?? '—')],
        ['Lo pidió', esc(f.solicitado_nombre || f.solicitado_por)],
        ['Fecha de solicitud', fecha(f.created_at)],
      ];
      if (accion === 'firma_solicitada') {
        const html = plantilla('Solicitud de firma del Coordinador', '#ED7102', 'Hola Ricardo,',
          'Se solicita tu firma para el siguiente reconocimiento. Entra al sistema, revisa el diploma y dale <strong>Firmar</strong>; el sistema colocará tu firma y le avisará a quien lo pidió.',
          filas, { texto: 'Revisar y firmar', url: `${SITE_URL}/sol/firmas` });
        await sendEmail(ADMIN_EMAIL, [], `Firma solicitada · ${f.titulo}`, html);
      } else {
        const ok = f.estatus === 'firmada';
        const html = plantilla(ok ? 'Reconocimiento firmado' : 'Solicitud de firma regresada', ok ? '#059669' : '#b91c1c',
          `Hola <strong>${esc(f.solicitado_nombre || '')}</strong>,`,
          ok ? 'El reconocimiento ya <strong style="color:#059669;">está firmado por el Coordinador</strong>. Ya puedes descargarlo o compartirlo por WhatsApp o correo desde Voluntariado SOL.'
             : `El Coordinador regresó la solicitud con estas observaciones:<br/><em>${esc(f.motivo ?? '')}</em>`,
          filas, { texto: ok ? 'Descargar el diploma' : 'Abrir Voluntariado SOL', url: `${SITE_URL}/sol/jornadas` });
        await sendEmail((f.solicitado_por ?? ADMIN_EMAIL).toLowerCase(), [], `${ok ? 'Firmado' : 'Regresado'}: ${f.titulo}`, html);
      }
      return json({ ok: true });
    }

    throw new Falla('Acción no válida');
  } catch (e) {
    const status = e instanceof Falla ? e.status : 500;
    console.error('[sol-notificaciones]', e);
    return json({ error: (e as Error).message ?? 'Error' }, status);
  }
});
