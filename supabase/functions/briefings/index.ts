// ============================================================================
// briefings — Briefings diarios (Resumen matutino y Preparación de reuniones)
//
// Guarda y lista los PDF en OneDrive: Sistema RCMA Doc/Briefings/AAAA/MM - Mes.
// Solo la Coordinación RCMA (admin). La llave de Microsoft nunca sale de aquí:
// el navegador recibe solo la URL de carga de OneDrive para su archivo.
//
// Acciones (body JSON { accion, ... }):
//   listar          { anio? }                 → años disponibles y archivos del año
//   iniciar_subida  { nombre, tamano, fecha } → URL de carga (OneDrive) para un PDF
//   eliminar        { item_id }               → borra un PDF de la carpeta Briefings
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL      = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const ADMIN_EMAIL   = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
const ONEDRIVE_USER = 'rreyes@manoamiga.edu.mx';
const RAIZ          = 'Sistema RCMA Doc/Briefings';
const MAX_BYTES     = 20 * 1024 * 1024; // 20 MB por PDF
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const cors = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class Falla extends Error { constructor(msg: string, public status = 400) { super(msg); } }

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

const DRIVE = `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive`;
const ruta = (...partes: string[]) => [...RAIZ.split('/'), ...partes].map(encodeURIComponent).join('/');
// OneDrive no acepta  " * : < > ? / \ |  en nombres
const limpiar = (s: string) =>
  s.replace(/["*:<>?/\\|#%]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 150).replace(/[\s.]+$/, '') || 'briefing.pdf';

interface ItemGraph { id: string; name: string; size?: number; webUrl?: string; createdDateTime?: string; folder?: unknown; file?: unknown; parentReference?: { path?: string } }

async function hijos(token: string, path: string): Promise<ItemGraph[]> {
  const out: ItemGraph[] = [];
  let url: string | null = `${DRIVE}/root:/${path}:/children?$top=200&$select=id,name,size,webUrl,createdDateTime,folder,file`;
  while (url) {
    const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 404) return [];
    if (!r.ok) throw new Falla(`No se pudo leer OneDrive (${r.status})`, 502);
    const d = await r.json();
    out.push(...(d.value ?? []));
    url = d['@odata.nextLink'] ?? null;
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ── Solo la Coordinación RCMA (admin por correo o app_metadata) ─────────
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: eu } = await db.auth.getUser(jwt);
    if (eu || !u?.user?.email) throw new Falla('Sesión no válida', 401);
    const email = u.user.email.toLowerCase();
    const esAdmin = email === ADMIN_EMAIL || u.user.app_metadata?.role === 'admin';
    if (!esAdmin) throw new Falla('Solo la Coordinación RCMA puede ver los briefings', 403);

    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion ?? '');
    const token = await graphToken();

    // ── Listar: años disponibles y los PDF del año pedido ───────────────────
    if (accion === 'listar') {
      const anios = (await hijos(token, ruta())).filter(i => i.folder && /^\d{4}$/.test(i.name)).map(i => i.name).sort().reverse();
      const anio = /^\d{4}$/.test(String(body.anio ?? '')) ? String(body.anio) : (anios[0] ?? String(new Date().getFullYear()));
      const meses = (await hijos(token, ruta(anio))).filter(i => i.folder).sort((a, b) => b.name.localeCompare(a.name));
      const archivos = [];
      for (const m of meses) {
        const items = await hijos(token, ruta(anio, m.name));
        for (const f of items.filter(i => i.file && /\.pdf$/i.test(i.name))) {
          archivos.push({ id: f.id, nombre: f.name, tamano: f.size ?? 0, url: f.webUrl ?? '', creado: f.createdDateTime ?? null, mes: m.name });
        }
      }
      return json({ anios, anio, archivos });
    }

    // ── Subir: URL de carga en la carpeta del mes de la fecha del briefing ──
    if (accion === 'iniciar_subida') {
      const nombre = limpiar(String(body.nombre ?? ''));
      const tamano = Number(body.tamano ?? 0);
      if (!/\.pdf$/i.test(nombre)) throw new Falla('Solo se pueden subir archivos PDF');
      if (!(tamano > 0)) throw new Falla('El archivo está vacío');
      if (tamano > MAX_BYTES) throw new Falla('El PDF pesa más de 20 MB');
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.fecha ?? ''));
      if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Falla('Fecha del briefing no válida');
      const carpetaMes = `${m[2]} - ${MESES[Number(m[2]) - 1]}`;
      // OneDrive crea solas las carpetas del año y del mes si no existen
      const r = await fetch(`${DRIVE}/root:/${ruta(m[1], carpetaMes, nombre)}:/createUploadSession`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: nombre }, fileSize: tamano }),
      });
      if (!r.ok) throw new Falla(`OneDrive no aceptó la carga (${r.status})`, 502);
      const { uploadUrl } = await r.json();
      return json({ uploadUrl, carpeta: `${RAIZ}/${m[1]}/${carpetaMes}`, archivo: nombre });
    }

    // ── Eliminar: solo PDFs que estén dentro de la carpeta Briefings ────────
    if (accion === 'eliminar') {
      const itemId = String(body.item_id ?? '');
      if (!itemId) throw new Falla('Falta el archivo');
      const r = await fetch(`${DRIVE}/items/${encodeURIComponent(itemId)}?$select=id,name,file,parentReference`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Falla('Archivo no encontrado', 404);
      const it: ItemGraph = await r.json();
      const padre = decodeURIComponent(it.parentReference?.path ?? '');
      if (!it.file || !/\.pdf$/i.test(it.name) || !padre.includes(`/${RAIZ}/`)) throw new Falla('Ese archivo no es un briefing', 403);
      const d = await fetch(`${DRIVE}/items/${encodeURIComponent(itemId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!d.ok && d.status !== 404) throw new Falla(`No se pudo borrar en OneDrive (${d.status})`, 502);
      return json({ ok: true });
    }

    throw new Falla('Acción no válida');
  } catch (e) {
    const status = e instanceof Falla ? e.status : 500;
    console.error('[briefings]', e);
    return json({ error: e instanceof Error ? e.message : 'Error' }, status);
  }
});
