// ============================================================================
// nexus-fotos — Fotos adjuntas a los comentarios de NEXUS
//
// Las fotos NO se guardan en Supabase: se suben al OneDrive de la Coordinación
// y en el comentario solo queda el id del archivo.
//   · Seguimiento de proyecto → su Expediente: ECO/06 - Fotografías/Durante
//     (si el proyecto no tiene Expediente: NEXUS/Seguimientos/<año>/<colegio>/<proyecto>)
//   · Pendiente               → NEXUS/Pendientes/<año>/<colegio>/<título>
//
// Body JSON:
//   { accion: 'subir', seguimiento_id | pendiente_id, nombre, tipo, base64 }
//        → { id, nombre }
//   { accion: 'ver', ids: string[] }
//        → { fotos: { id, nombre, miniatura, grande, onedrive }[] }   (links ≈1 hora)
//   { accion: 'base64', ids: string[] }
//        → { fotos: { id, nombre, tipo, base64 }[] }                  (Presentación Semanal)
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL      = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const ADMIN_EMAIL   = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
const ONEDRIVE_USER = 'rreyes@manoamiga.edu.mx';
const GRAPH         = `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive`;
const RAIZ          = 'Sistema RCMA Doc';
const MAX_BYTES     = 8 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type DB = any;

class Falla extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const limpiarNombre = (s: string) => s.normalize('NFC').replace(/[/\\:*?"<>|#%]/g, '_').trim()
  .replace(/[. ]+$/, '').replace(/^[. ]+/, '').slice(0, 120) || 'SIN_NOMBRE';
const clave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ruta = (partes: string[]) => partes.map(encodeURIComponent).join('/');

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
  if (!data.access_token) throw new Falla('No se pudo conectar con OneDrive', 502);
  return data.access_token;
}

type Thumb = { url?: string };
type Item = {
  id: string; name: string; webUrl?: string; folder?: unknown; file?: { mimeType?: string };
  thumbnails?: { small?: Thumb; medium?: Thumb; large?: Thumb }[];
  '@microsoft.graph.downloadUrl'?: string;
};

async function pedir<T>(token: string, url: string): Promise<T | null> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { if (r.status !== 404) console.log(`[graph] ${r.status} ${url.slice(0, 180)}`); return null; }
  return await r.json();
}
async function hijos(token: string, itemId: string): Promise<Item[]> {
  let url: string | null = `${GRAPH}/items/${encodeURIComponent(itemId)}/children?$top=200`;
  const todos: Item[] = [];
  for (let i = 0; url && i < 20; i++) {
    const r: { value?: Item[]; '@odata.nextLink'?: string } | null = await pedir(token, url);
    if (!r) break;
    todos.push(...(r.value ?? []));
    url = r['@odata.nextLink'] ?? null;
  }
  return todos;
}
async function subcarpeta(token: string, padreId: string, ok: (n: string) => boolean): Promise<Item | null> {
  return (await hijos(token, padreId)).find(h => h.folder && ok(h.name)) ?? null;
}

function base64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function deBase64(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Carpeta destino ─────────────────────────────────────────────────────────
// Devuelve la ruta para subir (relativa a un item o a la raíz)
type Destino = { baseId: string | null; partes: string[] };

async function destinoSeguimiento(db: DB, token: string, seguimientoId: string): Promise<Destino> {
  const { data: seg } = await db.from('nexus_seguimientos')
    .select('id, proyecto_id, proyecto_nombre, colegio, created_at').eq('id', seguimientoId).maybeSingle();
  if (!seg) throw new Falla('Seguimiento no encontrado', 404);
  const anioHoy = new Date().getFullYear();
  const respaldo: Destino = { baseId: null, partes: [RAIZ, 'NEXUS', 'Seguimientos', String(anioHoy),
    limpiarNombre(String(seg.colegio ?? 'SIN_COLEGIO')), limpiarNombre(String(seg.proyecto_nombre ?? seg.id))] };
  if (!seg.proyecto_id) return respaldo;

  const { data: proy } = await db.from('projects').select('id, folio, colegio, created_at').eq('id', seg.proyecto_id).maybeSingle();
  let folio: string | null = proy?.folio ?? null;
  if (!folio) {
    const { data: t } = await db.from('tickets').select('folio').eq('proyecto_id', seg.proyecto_id).limit(1).maybeSingle();
    folio = t?.folio ?? null;
  }
  if (!folio) return respaldo;

  // Misma búsqueda del Expediente que usa la galería (proyecto-fotos)
  const { data: tmas } = await db.from('tickets_mas').select('created_at, colegio').eq('folio', folio).maybeSingle();
  const origen = tmas ?? (await db.from('tickets').select('created_at, colegio').eq('folio', folio).maybeSingle()).data;
  const colegios = [...new Set([origen?.colegio, proy?.colegio].filter(Boolean).map(c => limpiarNombre(String(c))))];
  const anios = [...new Set([
    origen?.created_at ? new Date(origen.created_at).getFullYear() : null,
    proy?.created_at ? new Date(proy.created_at).getFullYear() : null,
    anioHoy,
  ].filter(Boolean) as number[])];
  const prefijo = clave(`${limpiarNombre(folio)} -`);
  for (const anio of anios) {
    for (const col of colegios) {
      const carpetaColegio = await pedir<Item>(token, `${GRAPH}/root:/${ruta([RAIZ, 'Expedientes', String(anio), col])}`);
      if (!carpetaColegio?.id) continue;
      const exp = await subcarpeta(token, carpetaColegio.id,
        n => clave(n).startsWith(prefijo) || clave(n) === clave(limpiarNombre(folio!)));
      if (!exp) continue;
      // ECO / 06 - Fotografías / Durante (se respetan los nombres que ya existan)
      const eco = await subcarpeta(token, exp.id, n => clave(n) === 'eco');
      if (!eco) return { baseId: exp.id, partes: ['ECO', '06 - Fotografías', 'Durante'] };
      const fotos = await subcarpeta(token, eco.id, n => /^0?6\s*-\s*fotograf/.test(clave(n)));
      if (!fotos) return { baseId: eco.id, partes: ['06 - Fotografías', 'Durante'] };
      const durante = await subcarpeta(token, fotos.id, n => clave(n) === 'durante');
      return durante ? { baseId: durante.id, partes: [] } : { baseId: fotos.id, partes: ['Durante'] };
    }
  }
  return respaldo;
}

async function destinoPendiente(db: DB, pendienteId: string): Promise<{ destino: Destino; pend: Record<string, unknown> }> {
  const { data: p } = await db.from('nexus_pendientes')
    .select('id, titulo, colegio, asignado_a, asignado_cc, created_by, created_at').eq('id', pendienteId).maybeSingle();
  if (!p) throw new Falla('Pendiente no encontrado', 404);
  const anio = p.created_at ? new Date(p.created_at).getFullYear() : new Date().getFullYear();
  return {
    pend: p,
    destino: { baseId: null, partes: [RAIZ, 'NEXUS', 'Pendientes', String(anio),
      limpiarNombre(String(p.colegio ?? 'SIN_COLEGIO')), limpiarNombre(`${String(p.titulo ?? 'Pendiente')} (${String(p.id).slice(0, 8)})`)] },
  };
}

async function subir(token: string, destino: Destino, nombre: string, tipo: string, bytes: Uint8Array): Promise<Item> {
  const camino = ruta([...destino.partes, nombre]);
  const url = destino.baseId
    ? `${GRAPH}/items/${encodeURIComponent(destino.baseId)}:/${camino}:/content?@microsoft.graph.conflictBehavior=rename`
    : `${GRAPH}/root:/${camino}:/content?@microsoft.graph.conflictBehavior=rename`;
  const r = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipo }, body: new Blob([bytes as BlobPart], { type: tipo }) });
  if (!r.ok) { console.log('[subir]', r.status, await r.text().catch(() => '')); throw new Falla('No se pudo subir la foto a OneDrive', 502); }
  return await r.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: eu } = await db.auth.getUser(jwt);
    if (eu || !u?.user?.email) throw new Falla('Sesión no válida', 401);
    const email = u.user.email.toLowerCase();
    const esAdmin = email === ADMIN_EMAIL || u.user.app_metadata?.role === 'admin' || u.user.user_metadata?.role === 'admin';

    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion ?? '');
    const token = await graphToken();

    // ── Subir una foto a un comentario ─────────────────────────────────────
    if (accion === 'subir') {
      const b64 = String(body.base64 ?? '');
      if (!b64) throw new Falla('Falta la imagen');
      const bytes = deBase64(b64);
      if (bytes.length > MAX_BYTES) throw new Falla('La imagen es demasiado grande (máx. 8 MB)');
      const tipo = /^image\/(jpeg|png|webp|gif)$/.test(String(body.tipo)) ? String(body.tipo) : 'image/jpeg';
      const ext = tipo === 'image/png' ? 'png' : tipo === 'image/webp' ? 'webp' : tipo === 'image/gif' ? 'gif' : 'jpg';
      const sello = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
      const base = limpiarNombre(String(body.nombre ?? 'foto').replace(/\.[a-z0-9]+$/i, '')).slice(0, 60);
      const nombre = `NEXUS_${sello}_${base}.${ext}`;

      let destino: Destino;
      if (body.seguimiento_id) {
        if (!esAdmin) throw new Falla('Solo el administrador puede agregar fotos al seguimiento', 403);
        destino = await destinoSeguimiento(db, token, String(body.seguimiento_id));
      } else if (body.pendiente_id) {
        const r = await destinoPendiente(db, String(body.pendiente_id));
        const p = r.pend as Record<string, string | null>;
        const participa = [p.asignado_a, p.asignado_cc, p.created_by].some(e => (e ?? '').toLowerCase() === email);
        if (!esAdmin && !participa) throw new Falla('No participas en este pendiente', 403);
        destino = r.destino;
      } else throw new Falla('Falta el seguimiento o el pendiente');

      const item = await subir(token, destino, nombre, tipo, bytes);
      return json({ id: item.id, nombre: item.name });
    }

    // ── Ver / descargar fotos ya adjuntas ──────────────────────────────────
    if (accion === 'ver' || accion === 'base64') {
      const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean).slice(0, 60);
      if (!ids.length) return json({ fotos: [] });
      // Solo se entregan fotos que de verdad están en un comentario al que el usuario tiene acceso
      const { data: coms } = await db.from('nexus_comentarios').select('fotos, seguimiento_id, pendiente_id').not('fotos', 'is', null);
      const permitidos = new Set<string>();
      const pendIds = new Set<string>();
      for (const c of coms ?? []) for (const f of (c.fotos ?? []) as { id: string }[]) {
        if (!ids.includes(f.id)) continue;
        if (esAdmin) permitidos.add(f.id); else if (c.pendiente_id) pendIds.add(`${c.pendiente_id}|${f.id}`);
      }
      if (!esAdmin && pendIds.size) {
        const idsPend = [...new Set([...pendIds].map(x => x.split('|')[0]))];
        const { data: ps } = await db.from('nexus_pendientes').select('id, asignado_a, asignado_cc, created_by').in('id', idsPend);
        const mios = new Set((ps ?? []).filter(p => [p.asignado_a, p.asignado_cc, p.created_by]
          .some(e => (e ?? '').toLowerCase() === email)).map(p => p.id));
        for (const x of pendIds) { const [pid, fid] = x.split('|'); if (mios.has(pid)) permitidos.add(fid); }
      }

      const items = (await Promise.all(ids.filter(id => permitidos.has(id)).map(id =>
        pedir<Item>(token, `${GRAPH}/items/${encodeURIComponent(id)}?$expand=thumbnails`)))).filter(Boolean) as Item[];

      if (accion === 'ver') {
        return json({ fotos: items.map(it => {
          const t = it.thumbnails?.[0];
          return {
            id: it.id, nombre: it.name,
            miniatura: t?.medium?.url ?? t?.small?.url ?? null,
            grande: it['@microsoft.graph.downloadUrl'] ?? t?.large?.url ?? null,
            onedrive: esAdmin ? it.webUrl ?? null : null,
          };
        }) });
      }
      const fotos = (await Promise.all(items.map(async it => {
        const url = it.thumbnails?.[0]?.large?.url ?? it.thumbnails?.[0]?.medium?.url;
        if (!url) return null;
        const r = await fetch(url);
        if (!r.ok) return null;
        return { id: it.id, nombre: it.name, tipo: r.headers.get('content-type') ?? 'image/jpeg',
          base64: base64(new Uint8Array(await r.arrayBuffer())) };
      }))).filter(Boolean);
      return json({ fotos });
    }

    throw new Falla('Acción no válida');
  } catch (e) {
    const status = e instanceof Falla ? e.status : 500;
    console.error('[nexus-fotos]', e);
    return json({ error: (e as Error).message ?? 'Error' }, status);
  }
});
