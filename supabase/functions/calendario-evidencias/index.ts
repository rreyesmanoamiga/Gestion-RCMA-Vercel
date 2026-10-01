// ============================================================================
// calendario-evidencias — Fotos de evidencia del Calendario de Mantenimiento
//
// Cada actividad marcada como realizada guarda el link de su foto (en el
// OneDrive de la Coordinación). Esta función toma las actividades realizadas
// de un colegio en un rango de fechas y regresa, para cada una, el link de la
// miniatura y de la foto completa (temporales, ≈1 hora) para verlas dentro del
// sistema. NO guarda nada en Supabase.
//
// Body JSON: { colegio, desde: 'YYYY-MM-DD', hasta: 'YYYY-MM-DD' }
// Respuesta: { fotos: { [completion_id]: { miniatura, grande, onedrive } } }
// Solo administrador (la vista de Cumplimiento del Calendario es suya).
// ============================================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL      = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const ADMIN_EMAIL   = (Deno.env.get('ADMIN_EMAIL') ?? 'rreyes@manoamiga.edu.mx').toLowerCase();
const ONEDRIVE_USER = 'rreyes@manoamiga.edu.mx';

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

type Thumb = { url?: string };
type Item = {
  id?: string; name?: string; webUrl?: string;
  parentReference?: { driveId?: string };
  thumbnails?: { small?: Thumb; medium?: Thumb; large?: Thumb }[];
  '@microsoft.graph.downloadUrl'?: string;
};

// Graph $batch: hasta 20 consultas por llamada; los lotes se mandan en paralelo
async function lote(token: string, pedidos: { id: string; url: string }[]): Promise<Map<string, Item>> {
  const out = new Map<string, Item>();
  const grupos: { id: string; url: string }[][] = [];
  for (let i = 0; i < pedidos.length; i += 20) grupos.push(pedidos.slice(i, i + 20));
  await Promise.all(grupos.map(async g => {
    const r = await fetch('https://graph.microsoft.com/v1.0/$batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: g.map(p => ({ id: p.id, method: 'GET', url: p.url })) }),
    });
    if (!r.ok) { console.log(`[graph batch] ${r.status}`); return; }
    const d = await r.json() as { responses?: { id: string; status: number; body?: Item }[] };
    for (const resp of d.responses ?? []) {
      if (resp.status === 200 && resp.body) out.set(resp.id, resp.body);
      else if (resp.status !== 404) console.log(`[graph] ${resp.status} pedido ${resp.id}`);
    }
  }));
  return out;
}

// Link guardado → consulta para encontrar el archivo en OneDrive
function consultaDelLink(url: string): string | null {
  if (/\/:[a-z]:\//i.test(url)) {
    // Link de compartir: /shares/u!<base64url del link>
    const b64 = btoa(unescape(encodeURIComponent(url))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    return `/shares/u!${b64}/driveItem`;
  }
  const m = url.split('?')[0].match(/\/Documents\/(.+)$/i);
  if (m) {
    const ruta = decodeURIComponent(m[1]).split('/').map(encodeURIComponent).join('/');
    return `/users/${ONEDRIVE_USER}/drive/root:/${ruta}`;
  }
  return null;
}

const fechaOk = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: eu } = await db.auth.getUser(jwt);
    if (eu || !u?.user?.email) throw new Falla('Sesión no válida', 401);
    const email = u.user.email.toLowerCase();
    const esAdmin = email === ADMIN_EMAIL || u.user.app_metadata?.role === 'admin';
    if (!esAdmin) throw new Falla('Solo el administrador puede ver las evidencias del Calendario', 403);

    const body = await req.json().catch(() => ({}));
    const colegio = String(body.colegio ?? '');
    if (!colegio || !fechaOk(body.desde) || !fechaOk(body.hasta)) throw new Falla('Faltan colegio o fechas');

    const { data: filas, error } = await db.from('maintenance_completions')
      .select('id, evidencia_url')
      .eq('colegio', colegio).gte('fecha_programada', body.desde).lte('fecha_programada', body.hasta)
      .not('evidencia_url', 'is', null)
      .limit(1000);
    if (error) throw new Falla(error.message, 500);

    const pedidos = (filas ?? [])
      .map(f => ({ id: String(f.id), url: consultaDelLink(String(f.evidencia_url)) }))
      .filter((p): p is { id: string; url: string } => !!p.url);
    if (pedidos.length === 0) return json({ fotos: {} });

    const token = await graphToken();

    // 1) Ubicar cada archivo  2) Pedir sus miniaturas y link de descarga
    const ubicados = await lote(token, pedidos);
    const segundos: { id: string; url: string }[] = [];
    for (const [id, it] of ubicados) {
      const drive = it.parentReference?.driveId;
      if (it.id && drive) segundos.push({ id, url: `/drives/${drive}/items/${it.id}?$expand=thumbnails` });
    }
    const detalles = await lote(token, segundos);

    const fotos: Record<string, { miniatura: string | null; grande: string | null; onedrive: string | null }> = {};
    for (const [id, it] of detalles) {
      const t = it.thumbnails?.[0];
      fotos[id] = {
        miniatura: t?.medium?.url ?? t?.small?.url ?? t?.large?.url ?? null,
        grande: it['@microsoft.graph.downloadUrl'] ?? t?.large?.url ?? null,
        onedrive: it.webUrl ?? null,
      };
    }
    return json({ fotos });
  } catch (e) {
    const status = e instanceof Falla ? e.status : 500;
    console.error('[calendario-evidencias]', e);
    return json({ error: (e as Error).message ?? 'Error' }, status);
  }
});
