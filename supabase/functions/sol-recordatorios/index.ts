// ============================================================================
// sol-recordatorios — Avisos del Programa SOL por colegio (días hábiles, 8:15 am)
//
//   · 5 días antes de que venza un hallazgo o una tarjeta roja: aviso al
//     administrador del colegio, CC al director.
//   · El día que vence: aviso de vencido, ahora también con CC al CAR.
//   · Un solo correo por colegio y solo si tiene algo; si no, no se manda nada.
//   · Fechas que caen en fin de semana: el viernes avisa también lo que vence
//     5–7 días después, y el lunes avisa lo que venció sábado o domingo.
//
// Quién la puede llamar: pg_cron (encabezado x-matriz-secret) o el administrador.
// Cuerpo opcional: { "prueba": true } → todo se manda solo al administrador.
//                  { "colegio": "MA PIE" } · { "hoy": "2026-12-07" } (para probar)
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const DIAS_ANTES = 5;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-matriz-secret' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const correoOk = (c?: string | null) => !!c && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim());
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fCorta = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return `${dd}-${MESES[m - 1]}-${y}`; };
const sumar = (d: string, n: number) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

interface Item { tipo: 'Hallazgo' | 'Tarjeta roja'; folio: string; area: string; texto: string; fecha: string; grave?: boolean }

async function enviarCorreo(para: string[], cc: string[], asunto: string, html: string) {
  const host = Deno.env.get('SMTP_HOST') ?? 'smtp.office365.com';
  const port = parseInt(Deno.env.get('SMTP_PORT') ?? '587');
  const user = Deno.env.get('SMTP_USER') ?? '';
  const pass = Deno.env.get('SMTP_PASS') ?? '';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const conn = await Deno.connect({ hostname: host, port });
  const leer = async (c: Deno.Conn) => { const b = new Uint8Array(4096); const n = await c.read(b); return dec.decode(b.subarray(0, n ?? 0)); };
  await leer(conn); await conn.write(enc.encode('EHLO outlook.com\r\n')); await leer(conn);
  await conn.write(enc.encode('STARTTLS\r\n')); await leer(conn);
  const tls = await Deno.startTls(conn, { hostname: host });
  const cmd = async (s: string) => { await tls.write(enc.encode(s + '\r\n')); return await leer(tls); };
  await cmd('EHLO outlook.com'); await cmd('AUTH LOGIN'); await cmd(btoa(user));
  if (!(await cmd(btoa(pass))).startsWith('235')) throw new Error('SMTP: autenticación rechazada');
  await cmd(`MAIL FROM:<${user}>`);
  for (const d of [...para, ...cc]) await cmd(`RCPT TO:<${d}>`);
  await cmd('DATA');
  const asuntoB64 = `=?UTF-8?B?${btoa(String.fromCharCode(...enc.encode(asunto)))}?=`;
  let bin = ''; const bytes = enc.encode(html);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const msg = [
    `From: Sistema RCMA <${user}>`, `To: ${para.join(', ')}`, ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${asuntoB64}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    btoa(bin).replace(/.{76}/g, '$&\r\n'), '.',
  ].join('\r\n');
  const fin = await cmd(msg);
  await cmd('QUIT'); try { tls.close(); } catch { /* ya cerrado */ }
  if (!fin.startsWith('250')) throw new Error('SMTP: el servidor no aceptó el mensaje');
}

function tabla(items: Item[], color: string) {
  const filas = items.map(i => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#dc2626;font-weight:bold;white-space:nowrap;">${esc(i.folio)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#0f172a;">
      <b>${esc(i.tipo)}</b>${i.grave ? ' <span style="color:#dc2626;font-weight:bold;">· riesgo grave</span>' : ''} · ${esc(i.area)}<br>
      <span style="color:#475569;">${esc(i.texto)}</span></td>
    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:${color};font-weight:bold;white-space:nowrap;">${fCorta(i.fecha)}</td></tr>`).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    <tr style="background:#f8fafc;"><td style="padding:8px 12px;font-size:10px;color:#94a3b8;font-weight:bold;">FOLIO</td>
    <td style="padding:8px 12px;font-size:10px;color:#94a3b8;font-weight:bold;">DETALLE</td>
    <td style="padding:8px 12px;font-size:10px;color:#94a3b8;font-weight:bold;">FECHA LÍMITE</td></tr>${filas}</table>`;
}


/** Bloque de contacto: el correo lo manda el sistema (cuenta solo de salida); dudas → Coordinación */
const CONTACTO = { nombre: 'Ing. Ricardo Joanathan Reyes Medina', puesto: 'Coordinador de Obras y Mantenimiento RCMA' };
const bloqueContacto = () => `<tr><td style="padding:4px 36px 22px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-left:4px solid #ED7102;border-radius:8px;">
    <tr><td style="padding:14px 18px;font-size:13px;color:#334155;line-height:1.6;">
      <b style="color:#00295A;">¿Tienen dudas o necesitan apoyo?</b><br>
      Comuníquense con la Coordinación de Obras y Mantenimiento RCMA:<br>
      <b>${CONTACTO.nombre}</b> · ${CONTACTO.puesto}
    </td></tr></table></td></tr>`;
const pieAutomatico = `<tr><td style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e2e8f0;">
  <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">Este es un mensaje automático del Sistema RCMA; por favor no respondan a este correo.<br>Colegios Mano Amiga — Juntos Transformando Vidas.</p>
</td></tr>`;

function html(nombre: string, saludo: string, porVencer: Item[], vencidos: Item[]) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#00295A;padding:24px 36px;border-bottom:3px solid #ED7102;">
  <h1 style="margin:0;color:#fff;font-size:20px;">Programa SOL · Recordatorio</h1>
  <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">${esc(nombre)}</p></td></tr>
<tr><td style="padding:24px 36px 4px;color:#334155;font-size:14px;line-height:1.6;">
  <p>${esc(saludo)}</p>
  <p>El Sistema RCMA les recuerda ${vencidos.length && porVencer.length ? 'los hallazgos y tarjetas rojas vencidos y los que están por vencer' : vencidos.length ? 'los hallazgos y tarjetas rojas que vencieron' : `los hallazgos y tarjetas rojas que vencen en los próximos ${DIAS_ANTES} días`} en su colegio. Al atenderlos, por favor regístrenlo en el Sistema RCMA con su foto de cierre.</p></td></tr>
${vencidos.length ? `<tr><td style="padding:8px 36px;"><p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#dc2626;">Vencidos (${vencidos.length})</p>${tabla(vencidos, '#dc2626')}</td></tr>` : ''}
${porVencer.length ? `<tr><td style="padding:8px 36px;"><p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#d97706;">Por vencer (${porVencer.length})</p>${tabla(porVencer, '#d97706')}</td></tr>` : ''}
<tr><td style="padding:18px 36px 26px;">
  <a href="${SITE_URL}/sol/hallazgos" style="display:inline-block;background:#ED7102;color:#fff;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:bold;text-decoration:none;">Ver en el sistema →</a>
</td></tr>
${bloqueContacto()}
${pieAutomatico}
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  try {
    let permitido = false;
    const secreto = req.headers.get('x-matriz-secret') ?? '';
    if (secreto) { const { data } = await db.rpc('rcma_matriz_secreto_ok', { p_secreto: secreto }); permitido = data === true; }
    if (!permitido) {
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: u } = await db.auth.getUser(jwt);
      permitido = (u?.user?.email ?? '').toLowerCase() === ADMIN_EMAIL;
    }
    if (!permitido) return json({ error: 'Sin permiso' }, 403);

    const hoy = typeof body?.hoy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.hoy) ? body.hoy : new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
    const dia = new Date(hoy + 'T12:00:00Z').getUTCDay(); // 1 = lunes … 5 = viernes
    // Ventanas (el viernes cubre lo que vence el fin de semana; el lunes, lo que venció en él)
    const porVencerDias = [sumar(hoy, DIAS_ANTES), ...(dia === 5 ? [sumar(hoy, DIAS_ANTES + 1), sumar(hoy, DIAS_ANTES + 2)] : [])];
    const vencenDias = [hoy, ...(dia === 1 ? [sumar(hoy, -1), sumar(hoy, -2)] : [])];
    const todas = [...porVencerDias, ...vencenDias];

    let qh = db.from('sol_hallazgos').select('folio, colegio, area, hallazgo, fecha_compromiso, riesgo_grave')
      .in('estatus', ['abierto', 'en_proceso']).in('fecha_compromiso', todas);
    let qt = db.from('sol_tarjetas_rojas').select('folio, colegio, area, articulo, cantidad, fecha_limite')
      .in('estatus', ['pendiente', 'en_proceso']).in('fecha_limite', todas);
    if (typeof body?.colegio === 'string') { qh = qh.eq('colegio', body.colegio); qt = qt.eq('colegio', body.colegio); }
    const [{ data: hall, error: e1 }, { data: tarj, error: e2 }, { data: dir }] = await Promise.all([
      qh, qt, db.from('directorio').select('codigo, nombre, dir_nombre, dir_correo, adm_nombre, adm_correo, car_correo'),
    ]);
    if (e1) throw e1; if (e2) throw e2;

    const porColegio = new Map<string, { porVencer: Item[]; vencidos: Item[] }>();
    const meter = (colegio: string, it: Item) => {
      const g = porColegio.get(colegio) ?? { porVencer: [], vencidos: [] };
      (vencenDias.includes(it.fecha) ? g.vencidos : g.porVencer).push(it);
      porColegio.set(colegio, g);
    };
    (hall ?? []).forEach((h: any) => meter(h.colegio, { tipo: 'Hallazgo', folio: h.folio, area: h.area, texto: h.hallazgo, fecha: h.fecha_compromiso, grave: !!h.riesgo_grave }));
    (tarj ?? []).forEach((t: any) => meter(t.colegio, { tipo: 'Tarjeta roja', folio: t.folio, area: t.area, texto: `${t.articulo}${t.cantidad ? ` × ${t.cantidad}` : ''}`, fecha: t.fecha_limite }));

    const resultados: any[] = [];
    for (const [colegio, g] of porColegio) {
      const f: any = (dir ?? []).find((d: any) => d.codigo === colegio) ?? {};
      const nombre = f.nombre || colegio;
      try {
        const para = correoOk(f.adm_correo) ? [f.adm_correo.trim()] : correoOk(f.dir_correo) ? [f.dir_correo.trim()] : [];
        const cc = [f.dir_correo, ...(g.vencidos.length ? [f.car_correo] : [])].filter(correoOk)
          .map((c: string) => c.trim().toLowerCase()).filter((c: string, i: number, a: string[]) => a.indexOf(c) === i && !para.map(p => p.toLowerCase()).includes(c));
        const nombres = [f.dir_nombre, f.adm_nombre].filter(Boolean);
        const saludo = `Estimados en Cristo${nombres.length ? ', ' + nombres.join(' y ') : ''},`;
        const asunto = `Programa SOL · ${g.vencidos.length ? `${g.vencidos.length} vencido${g.vencidos.length !== 1 ? 's' : ''}` : ''}${g.vencidos.length && g.porVencer.length ? ' y ' : ''}${g.porVencer.length ? `${g.porVencer.length} por vencer` : ''} · ${nombre}`;
        const cuerpo = html(nombre, saludo, g.porVencer, g.vencidos);
        if (body?.prueba === true) await enviarCorreo([ADMIN_EMAIL], [], `[PRUEBA] ${asunto}`, cuerpo);
        else {
          if (!para.length) throw new Error('Sin correo de administrador ni de director en el Directorio');
          await enviarCorreo(para, cc, asunto, cuerpo);
        }
        resultados.push({ colegio, ok: true, porVencer: g.porVencer.length, vencidos: g.vencidos.length });
      } catch (e) {
        resultados.push({ colegio, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return json({ ok: true, hoy, colegios: resultados.length, resultados });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
