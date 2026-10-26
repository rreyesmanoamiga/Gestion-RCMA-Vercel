// ============================================================================
// nexus-calendario — Pendientes de NEXUS en el calendario de Outlook
//
// La base de datos llama a esta función (trigger con pg_net) cada vez que un
// pendiente se crea, cambia o se borra. Si el pendiente es de Ricardo y tiene
// fecha límite, se mantiene UN evento en su calendario de Outlook:
//   · "Vence: <pendiente>" → el día de la fecha límite, a la hora límite
//     (hora_limite) con recordatorio 30 min antes; sin hora, a las 9:00 con
//     el recordatorio de Outlook 3 días antes.
// Si cambia la fecha, el evento se mueve (también si el pendiente ya venció
// y se le pone una fecha nueva). Mientras el pendiente siga abierto el evento
// se conserva aunque ya haya vencido; si se completa, se borra o se queda sin
// fecha, se elimina. (La versión anterior creaba además un evento
// "Vence en 3 días"; al sincronizar, esos se borran solos.)
// Los ids de los eventos se guardan en
// nexus_calendario_eventos (no en nexus_pendientes, para no disparar el
// trigger otra vez).
//
// También sincroniza los pendientes de Seguimiento de Trámites (Cumplimiento,
// tabla compliance_pendientes): llegan con tabla = 'cumplimiento' y el evento
// dice "Vence (CN): …" con liga a Seguimiento de Trámites.
//
// Body JSON (siempre con el header x-webhook-secret = NEXUS_CAL_SECRET):
//   { pendiente_id, tabla? }      → sincroniza ese pendiente (tabla: 'nexus' | 'cumplimiento')
//   { accion: 'resincronizar' }   → sincroniza todos los pendientes abiertos
//
// Requiere el permiso de aplicación Calendars.ReadWrite de Microsoft Graph.
// Se despliega con --no-verify-jwt (la llamada viene de la base de datos).
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL  = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const CAL_EMAIL = (Deno.env.get('NEXUS_CAL_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
const SECRETO   = Deno.env.get('NEXUS_CAL_SECRET') ?? '';
const GRAPH     = `https://graph.microsoft.com/v1.0/users/${CAL_EMAIL}/events`;
const HORA      = '09:00:00';
const ZONA      = 'Central Standard Time (Mexico)'; // Ciudad de México / Monterrey, UTC-6 sin horario de verano
const RECORDATORIO_MIN = 3 * 24 * 60; // sin hora: 3 días antes del inicio (9:00 → 9:00)
const RECORDATORIO_CON_HORA_MIN = 30; // con hora: 30 min antes
const DURACION_MIN = 15;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type DB = any;
type Pendiente = {
  id: string; titulo: string; descripcion: string | null; tipo: string; asignado_a: string | null;
  created_by: string | null; prioridad: string | null; fecha_limite: string | null; hora_limite: string | null; estatus: string;
  colegio: string | null; territorio: string | null; proyecto_nombre: string | null; ticket_folio: string | null;
  asignado_nombre: string | null; created_at: string | null; updated_at: string | null;
  acuerdo_id: string | null; origen: string | null; origen_numero: number | null; origen_asunto: string | null;
  origen_fecha: string | null; origen_responsable: string | null; origen_url: string | null;
};
type Tabla = 'nexus' | 'cumplimiento';
const COLS_CN = 'id,titulo,descripcion,tipo,asignado_a,asignado_nombre,created_by,prioridad,fecha_limite,hora_limite,estatus,colegio,territorio,created_at,updated_at,acuerdo_id,origen,origen_numero,origen_asunto,origen_fecha,origen_responsable,origen_url';
type Mapa = {
  tabla?: Tabla | null;
  pendiente_id: string; evento_3d: string | null; evento_dia: string | null;
  fecha_original?: string | null; ultima_fecha?: string | null; reprogramaciones?: number | null;
};
type Historial = { fechaOriginal: string | null; reprogramaciones: number };
type Tipo = '3d' | 'dia';

const PRIORIDAD: Record<string, string> = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baja: 'Baja' };
const PRIORIDAD_COLOR: Record<string, string> = { urgente: '#DC2626', alta: '#EA580C', normal: '#2563EB', baja: '#64748B' };
const AZUL = '#00295A';
const NARANJA = '#ED7102';

async function graphToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${Deno.env.get('AZURE_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: Deno.env.get('AZURE_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('AZURE_CLIENT_SECRET') ?? '',
      scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('No se pudo obtener el token de Microsoft Graph');
  return data.access_token;
}

/** ¿El pendiente es de Ricardo? (asignado a él, o personal creado por él) */
const esMio = (p: Pendiente) =>
  (p.asignado_a ?? '').toLowerCase() === CAL_EMAIL ||
  (p.tipo === 'personal' && (p.created_by ?? '').toLowerCase() === CAL_EMAIL);

/** 'YYYY-MM-DD' ± días */
function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 'HH:MM' de la hora límite, o null si no tiene */
const horaDe = (p: Pendiente) => p.hora_limite ? p.hora_limite.slice(0, 5) : null;
/** '14:30' → '2:30 p. m.' */
const horaLarga = (h: string) => new Date(`2000-01-01T${h}:00Z`).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fechaLarga = (f: string) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const fechaCorta = (f: string) => new Date(f.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Mexico_City' });

/** Renglón de la ficha (mismo estilo que los correos del sistema) */
function fila(etiqueta: string, valorHtml: string, i: number): string {
  const fondo = i % 2 === 0 ? 'background:#f8fafc;' : '';
  return `<tr style="${fondo}"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.03em;width:38%;border-bottom:1px solid #e2e8f0;vertical-align:top;font-family:Arial,sans-serif;">${etiqueta}</td><td style="padding:10px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;font-family:Arial,sans-serif;">${valorHtml}</td></tr>`;
}

function cuerpoHtml(p: Pendiente, h: Historial, tabla: Tabla = 'nexus'): string {
  const esCN = tabla === 'cumplimiento';
  const fechaLimite = p.fecha_limite!.slice(0, 10);
  const hora = horaDe(p);
  const venceTxt = `${fechaLarga(fechaLimite)}${hora ? ` a las ${horaLarga(hora)}` : ''}`;
  const esMinuta = !!p.acuerdo_id && (p.origen === 'acuerdo' || p.origen === 'accion');
  const doc = p.origen === 'accion' ? 'Nota técnica' : 'Minuta';
  const tipoTxt = !esMinuta ? (esCN ? 'Pendiente de Seguimiento de Trámites' : 'Pendiente de NEXUS')
    : `${p.origen === 'accion' ? 'Acción' : 'Acuerdo'}${p.origen_numero ? ` #${p.origen_numero}` : ''} de ${doc.toLowerCase()}${esCN ? ' de Cumplimiento' : ''}`;
  const prio = p.prioridad ?? 'normal';
  const prioHtml = `<span style="display:inline-block;padding:2px 10px;border-radius:10px;background:${PRIORIDAD_COLOR[prio] ?? '#2563EB'};color:#ffffff;font-size:12px;font-weight:700;">${esc(PRIORIDAD[prio] ?? prio)}</span>`;
  const reprogHtml = h.reprogramaciones > 0 && h.fechaOriginal
    ? `<span style="color:${NARANJA};font-weight:700;">Reprogramado ${h.reprogramaciones === 1 ? '1 vez' : `${h.reprogramaciones} veces`}</span><br/><span style="font-size:12px;color:#64748b;">Fecha original: ${esc(fechaCorta(h.fechaOriginal))}</span>`
    : '<span style="color:#059669;font-weight:700;">Sin cambios de fecha</span>';
  const paraQuien = p.tipo === 'compartido' && p.asignado_nombre ? p.asignado_nombre : (p.asignado_nombre || 'Ricardo Reyes Medina');

  const filas: [string, string][] = [];
  filas.push(['Origen', `<strong>${esc(tipoTxt)}</strong>`]);
  if (esMinuta) {
    filas.push([doc, `${esc(p.origen_asunto || 'Sin asunto')}${p.origen_fecha ? `<br/><span style="font-size:12px;color:#64748b;">${esc(fechaLarga(p.origen_fecha.slice(0, 10)))}</span>` : ''}`]);
    filas.push([`Responsable según la ${doc.toLowerCase()}`, `<strong>${esc(p.origen_responsable || 'Sin responsable')}</strong>`]);
  }
  filas.push(['Pendiente asignado a', esc(paraQuien)]);
  filas.push(['Fecha límite', `<strong>${esc(venceTxt)}</strong>`]);
  filas.push(['Reprogramación', reprogHtml]);
  filas.push(['Prioridad', prioHtml]);
  if (p.colegio) filas.push(['Colegio', esc(p.colegio)]);
  if (p.territorio) filas.push(['Territorio', esc(p.territorio)]);
  if (p.proyecto_nombre) filas.push(['Proyecto', esc(p.proyecto_nombre)]);
  if (p.ticket_folio) filas.push(['Ticket', `<span style="color:#4F82C2;font-weight:700;">${esc(p.ticket_folio)}</span>`]);
  if (p.updated_at) filas.push(['Última actualización', esc(fechaHora(p.updated_at))]);

  const texto = p.descripcion?.trim() || p.titulo;
  const boton = (href: string, txt: string, fondo: string) =>
    `<a href="${href}" style="display:inline-block;background:${fondo};color:#ffffff;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;">${txt}</a>`;

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:16px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="background:${AZUL};padding:22px 32px;border-bottom:3px solid ${NARANJA};">
  <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;font-family:Arial,sans-serif;">Sistema RCMA · ${esCN ? 'Seguimiento de Trámites' : 'NEXUS'}</p>
  <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;font-family:Arial,sans-serif;">${esCN ? 'Cumplimiento Normativo' : 'Coordinación de Obras'} — Colegios Mano Amiga</p>
</td></tr>
<tr><td style="background:${NARANJA};padding:12px 32px;">
  <p style="margin:0;color:#ffffff;font-size:14px;font-weight:700;font-family:Arial,sans-serif;">Vence el ${esc(venceTxt)}</p>
</td></tr>
<tr><td style="padding:28px 32px 8px;">
  <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;font-family:Arial,sans-serif;">${esc(esMinuta ? tipoTxt : 'Pendiente')}</p>
  <p style="margin:0 0 20px;color:#0f172a;font-size:16px;line-height:1.5;font-weight:600;white-space:pre-wrap;font-family:Arial,sans-serif;">${esc(texto)}</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:22px;">
    <tr style="background:#FFF4EA;"><td colspan="2" style="padding:9px 16px;font-size:12px;font-weight:700;color:#C25A00;border-bottom:1px solid #FDDDBF;font-family:Arial,sans-serif;">Datos del pendiente</td></tr>
    ${filas.map(([k, v], i) => fila(k, v, i)).join('\n    ')}
  </table>
  <p style="margin:0 0 24px;">${esCN ? boton(`${SITE_URL}/cumplimiento/seguimiento`, 'Abrir en Seguimiento de Trámites', NARANJA) : boton(`${SITE_URL}/nexus`, 'Abrir pendiente en NEXUS', NARANJA)}${esMinuta && p.origen_url ? `&nbsp;&nbsp;${boton(p.origen_url, `Ver ${doc.toLowerCase()}`, AZUL)}` : ''}</p>
</td></tr>
<tr><td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
  <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;font-family:Arial,sans-serif;">Evento creado automáticamente por el Sistema RCMA. Se actualiza solo cuando cambias el pendiente${esMinuta ? ` o el acuerdo en la ${doc.toLowerCase()}` : ''}.<br/>Al completarlo, se elimina de tu calendario.</p>
</td></tr>
</table></td></tr></table>`;
}

function evento(p: Pendiente, tipo: Tipo, h: Historial, tabla: Tabla = 'nexus') {
  const fechaLimite = p.fecha_limite!.slice(0, 10);
  const dia = tipo === '3d' ? sumarDias(fechaLimite, -3) : fechaLimite;
  const cn = tabla === 'cumplimiento' ? ' (CN)' : '';
  const asunto = tipo === '3d' ? `Vence en 3 días${cn}: ${p.titulo}` : `Vence${cn}: ${p.titulo}`;
  // Con hora límite el evento va a esa hora; sin hora, a las 9:00 como siempre
  const hora = tipo === 'dia' ? horaDe(p) : null;
  const inicio = `${dia}T${hora ? `${hora}:00` : HORA}`;
  const fin = new Date(new Date(`${inicio}Z`).getTime() + DURACION_MIN * 60000).toISOString().slice(0, 19);
  return {
    subject: asunto,
    body: { contentType: 'HTML', content: cuerpoHtml(p, h, tabla) },
    start: { dateTime: inicio, timeZone: ZONA },
    end: { dateTime: fin, timeZone: ZONA },
    isReminderOn: true,
    reminderMinutesBeforeStart: tipo === 'dia' ? (hora ? RECORDATORIO_CON_HORA_MIN : RECORDATORIO_MIN) : 0,
    showAs: 'free',
    importance: p.prioridad === 'urgente' || p.prioridad === 'alta' ? 'high' : 'normal',
    location: p.colegio ? { displayName: p.colegio } : undefined,
  };
}

async function graph(token: string, metodo: string, url: string, cuerpo?: unknown): Promise<Response> {
  return await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'outlook.timezone="Central Standard Time (Mexico)"' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
}

/** Crea o actualiza un evento; regresa su id */
async function guardarEvento(token: string, idActual: string | null, datos: Record<string, unknown>, transactionId: string): Promise<string> {
  if (idActual) {
    const r = await graph(token, 'PATCH', `${GRAPH}/${encodeURIComponent(idActual)}`, datos);
    if (r.ok) return idActual;
    if (r.status !== 404) throw new Error(`Outlook ${r.status}: ${(await r.text()).slice(0, 300)}`);
    // el evento se borró a mano en Outlook → se vuelve a crear
  }
  const r = await graph(token, 'POST', GRAPH, { ...datos, transactionId });
  if (!r.ok) throw new Error(`Outlook ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).id;
}

async function borrarEvento(token: string, id: string | null) {
  if (!id) return;
  const r = await graph(token, 'DELETE', `${GRAPH}/${encodeURIComponent(id)}`);
  if (!r.ok && r.status !== 404) throw new Error(`Outlook ${r.status} al borrar: ${(await r.text()).slice(0, 200)}`);
}

async function sincronizar(db: DB, token: string, pendienteId: string, tablaPedida?: Tabla): Promise<string> {
  const { data: mapa } = await db.from('nexus_calendario_eventos').select('*').eq('pendiente_id', pendienteId).maybeSingle() as { data: Mapa | null };
  const tabla: Tabla = tablaPedida ?? (mapa?.tabla === 'cumplimiento' ? 'cumplimiento' : 'nexus');
  const { data: p } = tabla === 'cumplimiento'
    ? await db.from('compliance_pendientes').select(COLS_CN).eq('id', pendienteId).maybeSingle() as { data: Pendiente | null }
    : await db.from('nexus_pendientes')
        .select('id,titulo,descripcion,tipo,asignado_a,asignado_nombre,created_by,prioridad,fecha_limite,hora_limite,estatus,colegio,territorio,proyecto_nombre,ticket_folio,created_at,updated_at,acuerdo_id,origen,origen_numero,origen_asunto,origen_fecha,origen_responsable,origen_url')
        .eq('id', pendienteId).maybeSingle() as { data: Pendiente | null };

  // Un solo evento: el día que vence, con recordatorio 3 días antes. Se
  // conserva aunque el pendiente ya haya vencido, mientras siga abierto,
  // para que al ponerle fecha nueva se mueva en Outlook. El tipo '3d' ya no
  // se crea: si existe de la versión anterior, se borra.
  const quiero: Record<Tipo, boolean> = {
    '3d': false,
    dia: !!(p && esMio(p) && p.fecha_limite && p.estatus !== 'completado' && p.estatus !== 'cancelado'),
  };

  // Historial de fechas: la primera fecha límite que vio el calendario y
  // cuántas veces se ha movido desde entonces
  const fechaActual = p?.fecha_limite?.slice(0, 10) ?? null;
  const hist: Historial = {
    fechaOriginal: mapa?.fecha_original ?? fechaActual,
    reprogramaciones: (mapa?.reprogramaciones ?? 0) +
      (mapa?.ultima_fecha && fechaActual && mapa.ultima_fecha !== fechaActual ? 1 : 0),
  };

  const ids: Record<Tipo, string | null> = { '3d': mapa?.evento_3d ?? null, dia: mapa?.evento_dia ?? null };
  let error: string | null = null;
  for (const tipo of ['3d', 'dia'] as Tipo[]) {
    try {
      if (quiero[tipo] && p) {
        ids[tipo] = await guardarEvento(token, ids[tipo], evento(p, tipo, hist, tabla), `${tabla === 'cumplimiento' ? 'cn' : 'nexus'}-${p.id}-${tipo}2-${p.fecha_limite!.slice(0, 10)}`);
      } else if (ids[tipo]) {
        await borrarEvento(token, ids[tipo]);
        ids[tipo] = null;
      }
    } catch (e) {
      error = (e as Error).message;
      console.error('[nexus-calendario]', pendienteId, tipo, error);
    }
  }

  if (ids['3d'] || ids.dia || error) {
    const fila = {
      pendiente_id: pendienteId, tabla, evento_3d: ids['3d'], evento_dia: ids.dia,
      sincronizado_at: new Date().toISOString(), error,
    };
    const { error: e1 } = await db.from('nexus_calendario_eventos').upsert({
      ...fila, fecha_original: hist.fechaOriginal, ultima_fecha: fechaActual, reprogramaciones: hist.reprogramaciones,
    });
    // Si todavía no se agregan las columnas del historial, guardar al menos los ids
    if (e1) await db.from('nexus_calendario_eventos').upsert(fila);
  } else if (mapa) {
    await db.from('nexus_calendario_eventos').delete().eq('pendiente_id', pendienteId);
  }
  if (error) return `error: ${error}`;
  return quiero.dia ? 'ok' : 'sin evento';
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (!SECRETO || req.headers.get('x-webhook-secret') !== SECRETO) return json({ error: 'No autorizado' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = await graphToken();

    if (body.accion === 'resincronizar') {
      // Todos los pendientes abiertos con fecha (también los vencidos)
      const { data: abiertos } = await db.from('nexus_pendientes').select('id')
        .neq('estatus', 'completado').not('fecha_limite', 'is', null)
        .or(`asignado_a.ilike.${CAL_EMAIL},and(tipo.eq.personal,created_by.ilike.${CAL_EMAIL})`);
      const { data: abiertosCN } = await db.from('compliance_pendientes').select('id')
        .not('estatus', 'in', '(completado,cancelado)').not('fecha_limite', 'is', null)
        .or(`asignado_a.ilike.${CAL_EMAIL},and(tipo.eq.personal,created_by.ilike.${CAL_EMAIL})`);
      const { data: conEventos } = await db.from('nexus_calendario_eventos').select('pendiente_id, tabla');
      const tablaDe = new Map<string, Tabla>();
      for (const r of (abiertos ?? []) as { id: string }[]) tablaDe.set(r.id, 'nexus');
      for (const r of (abiertosCN ?? []) as { id: string }[]) tablaDe.set(r.id, 'cumplimiento');
      for (const r of (conEventos ?? []) as { pendiente_id: string; tabla?: string }[]) {
        if (!tablaDe.has(r.pendiente_id)) tablaDe.set(r.pendiente_id, r.tabla === 'cumplimiento' ? 'cumplimiento' : 'nexus');
      }
      const resultados: Record<string, string> = {};
      for (const [id, t] of tablaDe) resultados[id] = await sincronizar(db, token, id, t);
      return json({ total: tablaDe.size, resultados });
    }

    if (!body.pendiente_id) return json({ error: 'Falta pendiente_id' }, 400);
    const tabla: Tabla | undefined = body.tabla === 'cumplimiento' ? 'cumplimiento' : body.tabla === 'nexus' ? 'nexus' : undefined;
    return json({ resultado: await sincronizar(db, token, String(body.pendiente_id), tabla) });
  } catch (e) {
    console.error('[nexus-calendario]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
