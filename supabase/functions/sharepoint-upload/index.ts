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

async function uploadFile(token: string, carpeta: string, fileName: string, fileContent: Uint8Array, mimeType: string): Promise<string> {
  const path = carpeta.split('/').map(p => encodeURIComponent(p)).join('/');
  const url = `https://graph.microsoft.com/v1.0/users/${USER}/drive/root:/Sistema%20RCMA%20Doc/${path}/${encodeURIComponent(fileName)}:/content`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': mimeType },
    body: fileContent,
  });
  if (!res.ok) throw new Error(`Upload error ${res.status}: ${await res.text()}`);
  return (await res.json()).webUrl ?? '';
}

async function deleteFile(token: string, carpeta: string, fileName: string): Promise<void> {
  const path = carpeta.split('/').map(p => encodeURIComponent(p)).join('/');
  const url = `https://graph.microsoft.com/v1.0/users/${USER}/drive/root:/Sistema%20RCMA%20Doc/${path}/${encodeURIComponent(fileName)}`;
  const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) throw new Error(`Delete error ${res.status}: ${await res.text()}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (body.action === 'delete') {
        const token = await getAccessToken();
        await deleteFile(token, body.carpeta, body.fileName);
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const form     = await req.formData();
    const file     = form.get('file')     as File;
    const carpeta  = form.get('carpeta')  as string;
    const fileName = form.get('fileName') as string;
    if (!file || !carpeta || !fileName) throw new Error('Faltan parámetros');

    const content = new Uint8Array(await file.arrayBuffer());
    const token   = await getAccessToken();
    const webUrl  = await uploadFile(token, carpeta, fileName, content, file.type);

    return new Response(JSON.stringify({ success: true, webUrl }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
