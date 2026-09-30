// ============================================================================
// proyecto-fotos — Galería de Evidencia Fotográfica de un proyecto
//
// Las fotos viven en el OneDrive de la Coordinación, dentro del Expediente:
//   Expedientes/<año>/<colegio>/<folio> - <nombre>/ECO/06 - Fotografías/
//        Antes · Durante · Después
// Esta función NO guarda nada en Supabase: solo lee esas carpetas y regresa
// los links (temporales, ≈1 hora) de miniatura y de la foto completa, que el
// navegador baja directo de Microsoft.
//
// Body JSON: { proyecto_id }
// Respuesta: { encontrado, carpeta_url?, antes: Foto[], durante: Foto[], despues: Foto[] }
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL      = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const ADMIN_EMAIL   = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
const ONEDRIVE_USER = 'rreyes@manoamiga.edu.mx';
const GRAPH         = `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive`;
const RAIZ          = 'Sistema RCMA Doc';

// Oficinas FMA que equivalen a un territorio completo (igual que useScope.ts)
const OFICINA_TERRITORIO: Record<string, string> = { 'OF. MTY': 'NORTE', 'OF. CDMX': 'MEXICO' };

const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class Falla extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const patronCorreo = (e: string) => e.replace(/[\\%_]/g, m => '\\' + m);
// Mismo criterio con el que el sistema nombra las carpetas del Expediente
const limpiarNombre = (s: string) => s.normalize('NFC').replace(/[/\\:*?"<>|]/g, '_').trim()
  .replace(/[. ]+$/, '').replace(/^[. ]+/, '');
// Para comparar nombres sin acentos ni mayúsculas ("Después" = "despues")
const clave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

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
  id: string; name: string; webUrl?: string; folder?: unknown;
  file?: { mimeType?: string }; image?: unknown;
  thumbnails?: { small?: Thumb; medium?: Thumb; large?: Thumb }[];
  '@microsoft.graph.downloadUrl'?: string;
  createdDateTime?: string;
};

async function pedir<T>(token: string, url: string): Promise<T | null> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { if (r.status !== 404) console.log(`[graph] ${r.status} ${url.slice(0, 180)}`); return null; }
  return await r.json();
}

// Hijos de una carpeta (todas las páginas)
async function hijos(token: string, itemId: string, conMiniaturas = false): Promise<Item[]> {
  let url: string | null = `${GRAPH}/items/${encodeURIComponent(itemId)}/children?$top=200${conMiniaturas ? '&$expand=thumbnails' : ''}`;
  const todos: Item[] = [];
  for (let i = 0; url && i < 20; i++) {
    const r: { value?: Item[]; '@odata.nextLink'?: string } | null = await pedir(token, url);
    if (!r) break;
    todos.push(...(r.value ?? []));
    url = r['@odata.nextLink'] ?? null;
  }
  return todos;
}

async function porRuta(token: string, ruta: string): Promise<Item | null> {
  const p = [RAIZ, ...ruta.split('/')].map(encodeURIComponent).join('/');
  return await pedir<Item>(token, `${GRAPH}/root:/${p}`);
}

// Subcarpeta por nombre, sin importar acentos/mayúsculas
async function subcarpeta(token: string, padreId: string, nombre: string | ((n: string) => boolean)): Promise<Item | null> {
  const ok = typeof nombre === 'string' ? (n: string) => clave(n) === clave(nombre) : nombre;
  return (await hijos(token, padreId)).find(h => h.folder && ok(h.name)) ?? null;
}

const esImagen = (it: Item) =>
  !it.folder && (!!it.image || (it.file?.mimeType ?? '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(it.name));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Quién llama ─────────────────────────────────────────────────────────
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: eu } = await db.auth.getUser(jwt);
    if (eu || !u?.user?.email) throw new Falla('Sesión no válida', 401);
    const email = u.user.email.toLowerCase();
    const esAdmin = email === ADMIN_EMAIL || u.user.app_metadata?.role === 'admin';

    const body = await req.json().catch(() => ({}));
    const id = String(body.proyecto_id ?? '');
    if (!id) throw new Falla('Falta el proyecto');

    const { data: proy, error: ep } = await db.from('projects')
      .select('id, name, folio, colegio, territorio, created_at').eq('id', id).maybeSingle();
    if (ep || !proy) throw new Falla('Proyecto no encontrado', 404);

    // ── Permiso y alcance (mismas reglas que la pantalla) ───────────────────
    if (!esAdmin) {
      const { data: p } = await db.from('user_permissions')
        .select('ver_proyectos, area, territorio, colegio').ilike('user_email', patronCorreo(email)).limit(1).maybeSingle();
      if (!p?.ver_proyectos) throw new Falla('No tienes permiso para ver proyectos', 403);
      const colegio = p.colegio as string | null;
      const oficina = colegio ? OFICINA_TERRITORIO[colegio] : undefined;
      const territorio = oficina ?? (p.territorio as string | null);
      const esGeneral = !territorio || territorio === 'GENERAL' || colegio === 'GENERAL';
      if (!esGeneral) {
        const areaEsColegio = !p.area || p.area === 'colegio' || p.area === 'director_colegio';
        const colegioEspecifico = areaEsColegio && colegio && colegio !== 'ECO' && colegio !== 'GENERAL' && !oficina ? colegio : null;
        const fuera = colegioEspecifico && proy.colegio
          ? proy.colegio !== colegioEspecifico
          : !!proy.territorio && proy.territorio !== territorio;
        if (fuera) throw new Falla('Este proyecto no está dentro de tu alcance', 403);
      }
    }

    // ── Folio y datos del ticket de origen (año y colegio de la carpeta) ────
    let folio: string | null = proy.folio ?? null;
    if (!folio) {
      const { data: t } = await db.from('tickets').select('folio').eq('proyecto_id', id).limit(1).maybeSingle();
      folio = t?.folio ?? null;
    }
    const vacio = { encontrado: false, antes: [], durante: [], despues: [] };
    if (!folio) return json(vacio);

    const { data: tmas } = await db.from('tickets_mas').select('created_at, colegio').eq('folio', folio).maybeSingle();
    const origen = tmas ?? (await db.from('tickets').select('created_at, colegio').eq('folio', folio).maybeSingle()).data;

    const colegios = [...new Set([origen?.colegio, proy.colegio].filter(Boolean).map(c => limpiarNombre(String(c))))];
    const anios = [...new Set([
      origen?.created_at ? new Date(origen.created_at).getFullYear() : null,
      proy.created_at ? new Date(proy.created_at).getFullYear() : null,
      new Date().getFullYear(),
    ].filter(Boolean) as number[])];

    const token = await graphToken();

    // ── Carpeta del Expediente: la que empieza con "<folio> - " ─────────────
    let expediente: Item | null = null;
    const prefijo = clave(`${limpiarNombre(folio)} -`);
    buscar: for (const anio of anios) {
      for (const col of colegios) {
        const carpetaColegio = await porRuta(token, `Expedientes/${anio}/${col}`);
        if (!carpetaColegio?.id) continue;
        expediente = await subcarpeta(token, carpetaColegio.id,
          n => clave(n).startsWith(prefijo) || clave(n) === clave(limpiarNombre(folio!)));
        if (expediente) break buscar;
      }
    }
    if (!expediente) return json(vacio);

    const eco = await subcarpeta(token, expediente.id, 'ECO');
    const fotos = eco ? await subcarpeta(token, eco.id, n => /^0?6\s*-\s*fotograf/.test(clave(n))) : null;
    if (!fotos) return json({ ...vacio, encontrado: true, carpeta_url: esAdmin ? expediente.webUrl : undefined });

    const secciones = await hijos(token, fotos.id);
    const leer = async (nombre: string) => {
      const c = secciones.find(s => s.folder && clave(s.name) === nombre);
      if (!c) return [];
      const items = (await hijos(token, c.id, true)).filter(esImagen);
      return items
        .sort((a, b) => (a.createdDateTime ?? '').localeCompare(b.createdDateTime ?? '') || a.name.localeCompare(b.name))
        .map(it => {
          const t = it.thumbnails?.[0];
          const heic = /\.(heic|heif|tiff?)$/i.test(it.name);
          return {
            id: it.id,
            nombre: it.name,
            miniatura: t?.medium?.url ?? t?.small?.url ?? t?.large?.url ?? null,
            // HEIC/TIFF no se ven en el navegador: para esos se usa la vista grande de Microsoft
            grande: (heic ? t?.large?.url : it['@microsoft.graph.downloadUrl']) ?? t?.large?.url ?? null,
            onedrive: esAdmin ? it.webUrl ?? null : null,
          };
        });
    };
    const [antes, durante, despues] = await Promise.all([leer('antes'), leer('durante'), leer('despues')]);

    return json({ encontrado: true, carpeta_url: esAdmin ? fotos.webUrl : undefined, antes, durante, despues });
  } catch (e) {
    const status = e instanceof Falla ? e.status : 500;
    console.error('[proyecto-fotos]', e);
    return json({ error: (e as Error).message ?? 'Error' }, status);
  }
});
