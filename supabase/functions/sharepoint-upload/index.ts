import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ALLOWED_ORIGIN = Deno.env.get('SITE_URL') ?? 'https://gestion-rcma-vercel.vercel.app';
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getAccessToken(): Promise<string> {
  const tenantId     = Deno.env.get('AZURE_TENANT_ID')     ?? '';
  const clientId     = Deno.env.get('AZURE_CLIENT_ID')     ?? '';
  const clientSecret = Deno.env.get('AZURE_CLIENT_SECRET') ?? '';
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: clientId,
      client_secret: clientSecret, scope: 'https://graph.microsoft.com/.default',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('No token: ' + JSON.stringify(data));
  return data.access_token;
}

const USER = 'rreyes@manoamiga.edu.mx';

async function deleteFile(token: string, carpeta: string, fileName: string): Promise<void> {
  const path = carpeta.split('/').map((p: string) => encodeURIComponent(p)).join('/');
  const url  = `https://graph.microsoft.com/v1.0/users/${USER}/drive/root:/Sistema%20RCMA%20Doc/${path}/${encodeURIComponent(fileName)}`;
  const res  = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) throw new Error(`Delete error ${res.status}: ${await res.text()}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const contentType = req.headers.get('content-type') ?? '';

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (body.action === 'delete') {
        const token = await getAccessToken();
        await deleteFile(token, body.carpeta, body.fileName);
        return new Response(JSON.stringify({ success: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── UPLOAD — la función solo recibe metadata y devuelve uploadUrl ─────────
    // El upload chunked lo hace el navegador directamente a Microsoft Graph
    // Esta función solo se usa para archivos pequeños (placeholders .keep)
    const form     = await req.formData();
    const file     = form.get('file')     as File;
    const carpeta  = form.get('carpeta')  as string;
    const fileName = form.get('fileName') as string;
    if (!file || !carpeta || !fileName) throw new Error('Faltan parámetros');

    const token = await getAccessToken();

    // Para archivos pequeños (< 4MB) subir directo
    if (file.size < 4 * 1024 * 1024) {
      const path     = carpeta.split('/').map((p: string) => encodeURIComponent(p)).join('/');
      const itemPath = `Sistema%20RCMA%20Doc/${path}/${encodeURIComponent(fileName)}`;
      const buf      = await file.arrayBuffer();
      const putRes   = await fetch(
        `https://graph.microsoft.com/v1.0/users/${USER}/drive/root:/${itemPath}:/content`,
        {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream' },
          body: buf,
        }
      );
      if (!putRes.ok) throw new Error(`Upload error ${putRes.status}: ${await putRes.text()}`);
      const item = await putRes.json();
      return new Response(JSON.stringify({ success: true, webUrl: item.webUrl ?? '' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Para archivos grandes devolver solo el uploadUrl (el browser sube los chunks)
    const path     = carpeta.split('/').map((p: string) => encodeURIComponent(p)).join('/');
    const itemPath = `Sistema%20RCMA%20Doc/${path}/${encodeURIComponent(fileName)}`;
    const sessionRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${USER}/drive/root:/${itemPath}:/createUploadSession`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace', name: fileName } }),
      }
    );
    if (!sessionRes.ok) throw new Error(`Session error ${sessionRes.status}`);
    const { uploadUrl } = await sessionRes.json();

    return new Response(JSON.stringify({ success: true, uploadUrl, webUrl: '' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});