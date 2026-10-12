// ============================================================================
// nexus-calendario — Pendientes de NEXUS en el calendario de Outlook
//
// La base de datos llama a esta función (trigger con pg_net) cada vez que un
// pendiente se crea, cambia o se borra. Si el pendiente es de Ricardo y tiene
// fecha límite, se mantienen DOS eventos en su calendario de Outlook:
//   · "Vence en 3 días"  → 3 días antes de la fecha límite, 9:00, con recordatorio
//   · "Vence hoy"        → el día de la fecha límite, 9:00, con recordatorio
// Si cambia la fecha, los eventos se mueven; si se completa, se borra o se
// queda sin fecha, se eliminan. Los ids de los eventos se guardan en
// nexus_calendario_eventos (no en nexus_pendientes, para no disparar el
// trigger otra vez).
//
// Body JSON (siempre con el header x-webhook-secret = NEXUS_CAL_SECRET):
//   { pendiente_id }              → sincroniza ese pendiente
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
const OFFSET_H  = 6;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type DB = any;
type Pendiente = {
  id: string; titulo: string; descripcion: string | null; tipo: string; asignado_a: string | null;
  created_by: string | null; prioridad: string | null; fecha_limite: string | null; estatus: string;
  colegio: string | null; territorio: string | null; proyecto_nombre: string | null; ticket_folio: string | null;
};
type Mapa = { pendiente_id: string; evento_3d: string | null; evento_dia: string | null };
type Tipo = '3d' | 'dia';

const PRIORIDAD: Record<string, string> = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baja: 'Baja' };

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
/** Momento (UTC) de las 9:00 hora de México de ese día */
const momento = (fecha: string) => new Date(`${fecha}T${HORA}Z`).getTime() + OFFSET_H * 3600_000;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fechaLarga = (f: string) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function evento(p: Pendiente, tipo: Tipo) {
  const fechaLimite = p.fecha_limite!.slice(0, 10);
  const dia = tipo === '3d' ? sumarDias(fechaLimite, -3) : fechaLimite;
  const asunto = tipo === '3d' ? `Vence en 3 días: ${p.titulo}` : `Vence hoy: ${p.titulo}`;
  const filas = [
    ['Fecha límite', fechaLarga(fechaLimite)],
    ['Prioridad', p.prioridad ? (PRIORIDAD[p.prioridad] ?? p.prioridad) : ''],
    ['Colegio', p.colegio ?? ''],
    ['Territorio', p.territorio ?? ''],
    ['Proyecto', p.proyecto_nombre ?? ''],
    ['Ticket', p.ticket_folio ?? ''],
  ].filter(([, v]) => v);
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937">
${p.descripcion ? `<p style="white-space:pre-wrap">${esc(p.descripcion)}</p>` : ''}
<table style="border-collapse:collapse">${filas.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${k}</td><td style="padding:2px 0;font-weight:600">${esc(v)}</td></tr>`).join('')}</table>
<p><a href="${SITE_URL}/nexus">Abrir pendiente en NEXUS</a></p>
<p style="color:#9ca3af;font-size:12px">Evento creado automáticamente por el Sistema RCMA. Se actualiza solo si cambias el pendiente.</p></div>`;
  return {
    subject: asunto,
    body: { contentType: 'HTML', content: html },
    start: { dateTime: `${dia}T${HORA}`, timeZone: ZONA },
    end: { dateTime: `${dia}T09:15:00`, timeZone: ZONA },
    isReminderOn: true,
    reminderMinutesBeforeStart: 0,
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

async function sincronizar(db: DB, token: string, pendienteId: string): Promise<string> {
  const { data: p } = await db.from('nexus_pendientes')
    .select('id,titulo,descripcion,tipo,asignado_a,created_by,prioridad,fecha_limite,estatus,colegio,territorio,proyecto_nombre,ticket_folio')
    .eq('id', pendienteId).maybeSingle() as { data: Pendiente | null };
  const { data: mapa } = await db.from('nexus_calendario_eventos').select('*').eq('pendiente_id', pendienteId).maybeSingle() as { data: Mapa | null };

  const ahora = Date.now();
  const quiero: Record<Tipo, boolean> = { '3d': false, dia: false };
  if (p && esMio(p) && p.fecha_limite && p.estatus !== 'completado') {
    const f = p.fecha_limite.slice(0, 10);
    quiero['3d'] = momento(sumarDias(f, -3)) > ahora;
    quiero.dia = momento(f) + 9 * 3600_000 > ahora; // se puede crear hasta las 18:00 del día
  }

  const ids: Record<Tipo, string | null> = { '3d': mapa?.evento_3d ?? null, dia: mapa?.evento_dia ?? null };
  let error: string | null = null;
  for (const tipo of ['3d', 'dia'] as Tipo[]) {
    try {
      if (quiero[tipo] && p) {
        ids[tipo] = await guardarEvento(token, ids[tipo], evento(p, tipo), `nexus-${p.id}-${tipo}-${p.fecha_limite!.slice(0, 10)}`);
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
    await db.from('nexus_calendario_eventos').upsert({
      pendiente_id: pendienteId, evento_3d: ids['3d'], evento_dia: ids.dia,
      sincronizado_at: new Date().toISOString(), error,
    });
  } else if (mapa) {
    await db.from('nexus_calendario_eventos').delete().eq('pendiente_id', pendienteId);
  }
  if (error) return `error: ${error}`;
  return quiero['3d'] || quiero.dia ? `ok (${[quiero['3d'] && '3 días', quiero.dia && 'día'].filter(Boolean).join(' + ')})` : 'sin eventos';
}

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (!SECRETO || req.headers.get('x-webhook-secret') !== SECRETO) return json({ error: 'No autorizado' }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = await graphToken();

    if (body.accion === 'resincronizar') {
      const hoy = new Date(Date.now() - OFFSET_H * 3600_000).toISOString().slice(0, 10);
      const { data: abiertos } = await db.from('nexus_pendientes').select('id')
        .neq('estatus', 'completado').gte('fecha_limite', hoy)
        .or(`asignado_a.ilike.${CAL_EMAIL},and(tipo.eq.personal,created_by.ilike.${CAL_EMAIL})`);
      const { data: conEventos } = await db.from('nexus_calendario_eventos').select('pendiente_id');
      const ids = [...new Set([...(abiertos ?? []).map((r: { id: string }) => r.id), ...(conEventos ?? []).map((r: { pendiente_id: string }) => r.pendiente_id)])];
      const resultados: Record<string, string> = {};
      for (const id of ids) resultados[id] = await sincronizar(db, token, id);
      return json({ total: ids.length, resultados });
    }

    if (!body.pendiente_id) return json({ error: 'Falta pendiente_id' }, 400);
    return json({ resultado: await sincronizar(db, token, String(body.pendiente_id)) });
  } catch (e) {
    console.error('[nexus-calendario]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
