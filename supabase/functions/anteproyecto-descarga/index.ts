// ============================================================================
// anteproyecto-descarga — Descarga del ZIP de un anteproyecto
//
// Los ZIP viven en el OneDrive de la Coordinación (rreyes@manoamiga.edu.mx).
// Quien no es dueño de esa carpeta no puede abrir el link de OneDrive, así que
// esta función:
//   1. revisa que el usuario tenga "Ver Anteproyectos" y que el anteproyecto
//      esté dentro de su alcance (GENERAL = todo, OF. MTY = Norte, OF. CDMX =
//      México, territorio o colegio según Accesos);
//   2. localiza el archivo en OneDrive;
//   3. devuelve un link de descarga directo y temporal (≈1 hora) que no pide
//      iniciar sesión en Microsoft.
//
// Body JSON: { anteproyecto_id }
// Respuesta:  { url, nombre }
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL      = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const ADMIN_EMAIL   = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
const ONEDRIVE_USER = 'rreyes@manoamiga.edu.mx';
const GRAPH         = `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive`;

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

type Item = { id?: string; name?: string; file?: unknown; '@microsoft.graph.downloadUrl'?: string };

async function pedir(token: string, url: string): Promise<Item | null> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { console.log(`[graph] ${r.status} ${url.slice(0, 160)}`); return null; }
  return await r.json();
}

// Busca el archivo por tres caminos, del más exacto al más amplio.
async function localizar(token: string, zipUrl: string | null, zipNombre: string | null): Promise<Item | null> {
  // 1) Link normal de OneDrive: .../Documents/Sistema RCMA Doc/Anteproyectos/.../archivo.zip
  if (zipUrl) {
    const m = zipUrl.split('?')[0].match(/\/Documents\/(.+)$/i);
    if (m) {
      const ruta = decodeURIComponent(m[1]).split('/').map(encodeURIComponent).join('/');
      const it = await pedir(token, `${GRAPH}/root:/${ruta}`);
      if (it?.id && it.file) return it;
    }
  }
  // 2) Link de compartir (/:u:/g/personal/...): se resuelve con /shares
  if (zipUrl && /\/:[a-z]:\//i.test(zipUrl)) {
    const b64 = btoa(unescape(encodeURIComponent(zipUrl))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    const it = await pedir(token, `https://graph.microsoft.com/v1.0/shares/u!${b64}/driveItem`);
    if (it?.id && it.file) return it;
  }
  // 3) Por nombre dentro de la carpeta de Anteproyectos
  if (zipNombre) {
    const q = zipNombre.replace(/'/g, "''");
    const r = await pedir(token, `${GRAPH}/root:/${encodeURIComponent('Sistema RCMA Doc')}/Anteproyectos:/search(q='${encodeURIComponent(q)}')`) as { value?: Item[] } | null;
    const it = r?.value?.find(v => v.name === zipNombre && v.file);
    if (it?.id) return it;
  }
  return null;
}

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
    const id = String(body.anteproyecto_id ?? '');
    if (!id) throw new Falla('Falta el anteproyecto');

    const { data: ant, error: ea } = await db.from('anteproyectos')
      .select('id, colegio, territorio, zip_url, zip_nombre').eq('id', id).maybeSingle();
    if (ea || !ant) throw new Falla('Anteproyecto no encontrado', 404);
    if (!ant.zip_url && !ant.zip_nombre) throw new Falla('Este anteproyecto no tiene archivo', 404);

    // ── Permiso y alcance (mismas reglas que la pantalla) ───────────────────
    if (!esAdmin) {
      const { data: p } = await db.from('user_permissions')
        .select('ver_anteproyectos, area, territorio, colegio').ilike('user_email', patronCorreo(email)).limit(1).maybeSingle();
      if (!p?.ver_anteproyectos) throw new Falla('No tienes permiso para ver anteproyectos', 403);

      const colegio = p.colegio as string | null;
      const oficina = colegio ? OFICINA_TERRITORIO[colegio] : undefined;
      const territorio = oficina ?? (p.territorio as string | null);
      const esGeneral = !territorio || territorio === 'GENERAL' || colegio === 'GENERAL';
      if (!esGeneral) {
        const areaEsColegio = !p.area || p.area === 'colegio' || p.area === 'director_colegio';
        const colegioEspecifico = areaEsColegio && colegio && colegio !== 'ECO' && colegio !== 'GENERAL' && !oficina ? colegio : null;
        const fuera = colegioEspecifico && ant.colegio
          ? ant.colegio !== colegioEspecifico
          : !!ant.territorio && ant.territorio !== territorio;
        if (fuera) throw new Falla('Este anteproyecto no está dentro de tu alcance', 403);
      }
    }

    // ── Archivo en OneDrive → link directo temporal ─────────────────────────
    const token = await graphToken();
    const item = await localizar(token, ant.zip_url, ant.zip_nombre);
    if (!item?.id) throw new Falla('No se encontró el archivo en OneDrive (pudo haberse movido o borrado)', 404);

    const conLink = await pedir(token, `${GRAPH}/items/${encodeURIComponent(item.id)}`);
    const url = conLink?.['@microsoft.graph.downloadUrl'];
    if (!url) throw new Falla('OneDrive no entregó el link de descarga', 502);

    return json({ url, nombre: conLink?.name ?? item.name ?? ant.zip_nombre ?? 'anteproyecto.zip' });
  } catch (e) {
    const status = e instanceof Falla ? e.status : 500;
    console.error('[anteproyecto-descarga]', e);
    return json({ error: (e as Error).message ?? 'Error' }, status);
  }
});
