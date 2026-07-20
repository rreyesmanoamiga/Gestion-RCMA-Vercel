import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface UploadOptions {
  modulo:      'Evidencias' | 'Insumos' | 'Anteproyectos' | 'Reportes' | 'Cotizaciones';
  territorio?: string;
  colegio?:    string;
  referencia?: string;
}

interface UploadResult {
  webUrl:   string;
  fileName: string;
}

const USER       = 'rreyes@manoamiga.edu.mx';
const CHUNK_SIZE = 5 * 1024 * 1024;

async function getToken(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const supaToken = sessionData?.session?.access_token ?? '';
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-sharepoint-token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supaToken}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('No se pudo obtener token de Azure');
  return data.access_token;
}

// Genera un link anónimo "anyone with the link can view"
// Reintenta porque, justo después de subir un archivo, SharePoint puede tardar
// unos segundos en terminar de procesarlo (423 Locked / 404 transitorio).
export async function generateShareLink(driveItemId: string, token: string): Promise<string | null> {
  const MAX_INTENTOS = 4;
  const ESPERAS_MS   = [1000, 2000, 3500, 5000]; // backoff progresivo

  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, ESPERAS_MS[intento - 1]));

    try {
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/users/${USER}/drive/items/${driveItemId}/createLink`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'view', scope: 'anonymous' }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const link = data.link?.webUrl ?? null;
        if (link) return link;
        console.warn(`generateShareLink: respuesta OK sin link.webUrl (intento ${intento + 1})`, data);
        continue;
      }

      // 423 = archivo aún bloqueado por procesamiento reciente → reintentar
      // 404 = el item todavía no aparece indexado → reintentar
      // Otros códigos (401/403/etc.) → no tiene caso reintentar, es un problema de permisos
      const bodyText = await res.text().catch(() => '');
      console.warn(`generateShareLink: fallo HTTP ${res.status} (intento ${intento + 1}/${MAX_INTENTOS})`, bodyText);
      if (res.status !== 423 && res.status !== 404 && res.status !== 429) {
        return null; // error no transitorio, no vale la pena reintentar
      }
    } catch (err) {
      console.warn(`generateShareLink: error de red (intento ${intento + 1}/${MAX_INTENTOS})`, err);
    }
  }

  console.error('generateShareLink: se agotaron los intentos, se usará el webUrl como respaldo');
  return null;
}

// Obtiene el driveItemId desde el path del archivo
async function getDriveItemId(token: string, carpeta: string, fileName: string): Promise<string | null> {
  const path     = carpeta.split('/').map(p => encodeURIComponent(p)).join('/');
  const itemPath = `Sistema%20RCMA%20Doc/${path}/${encodeURIComponent(fileName)}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${USER}/drive/root:/${itemPath}`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.id ?? null;
}

async function uploadChunked(token: string, carpeta: string, fileName: string, file: File): Promise<{ webUrl: string; shareUrl: string; itemId: string }> {
  const path     = carpeta.split('/').map(p => encodeURIComponent(p)).join('/');
  const itemPath = `Sistema%20RCMA%20Doc/${path}/${encodeURIComponent(fileName)}`;

  const sessionRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${USER}/drive/root:/${itemPath}:/createUploadSession`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace', name: fileName } }),
    }
  );
  if (!sessionRes.ok) throw new Error(`Upload session error ${sessionRes.status}`);
  const { uploadUrl } = await sessionRes.json();

  const totalSize = file.size;
  let webUrl = '';
  let itemId = '';
  let start  = 0;

  while (start < totalSize) {
    const end  = Math.min(start + CHUNK_SIZE, totalSize);
    const buf  = await file.slice(start, end).arrayBuffer();
    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(buf.byteLength),
        'Content-Range': `bytes ${start}-${end - 1}/${totalSize}`,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: buf,
    });
    if (!chunkRes.ok && chunkRes.status !== 202) throw new Error(`Chunk error ${chunkRes.status}`);
    if (chunkRes.status === 201 || chunkRes.status === 200) {
      const item = await chunkRes.json();
      webUrl = item.webUrl ?? '';
      itemId = item.id ?? '';
    }
    start = end;
  }

  // Generar link anónimo
  let shareUrl = webUrl;
  if (itemId) {
    const anon = await generateShareLink(itemId, token);
    if (anon) shareUrl = anon;
  }

  return { webUrl, shareUrl, itemId };
}

// Renombra una carpeta en OneDrive (para marcarla como CANCELADA)
export async function renameCarpetaSharePoint(carpeta: string, nuevoNombre: string): Promise<boolean> {
  try {
    const token    = await getToken();
    const segments = carpeta.split('/').map(p => encodeURIComponent(p)).join('/');
    const path     = `Sistema%20RCMA%20Doc/${segments}`;
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${USER}/drive/root:/${path}`,
      {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nuevoNombre }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function useSharePointUpload() {
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File, options: UploadOptions): Promise<UploadResult | null> => {
    setUploading(true);
    try {
      const mes    = format(new Date(), 'MMM yyyy', { locale: es });
      const fecha  = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      const nombre = `${fecha}_${file.name}`;
      const anio   = new Date().getFullYear();

      let carpeta = '';
      if (options.modulo === 'Evidencias') {
        carpeta = `Evidencias/${options.territorio ?? 'SIN_TERRITORIO'}/${options.colegio ?? 'SIN_COLEGIO'}/${options.referencia ?? 'General'}/${mes}`;
      } else if (options.modulo === 'Insumos') {
        carpeta = `Insumos/${anio}/${options.referencia ?? 'SIN_FOLIO'}`;
      } else if (options.modulo === 'Anteproyectos') {
        carpeta = `Anteproyectos/${anio}/${options.colegio ?? 'SIN_COLEGIO'}/${options.referencia ?? 'SIN_NOMBRE'}`;
      } else if (options.modulo === 'Reportes') {
        carpeta = `Reportes/${anio}`;
      } else if (options.modulo === 'Cotizaciones') {
        carpeta = `Cotizaciones/${options.colegio ?? 'SIN_COLEGIO'}/${options.referencia ?? 'SIN_PROYECTO'}`;
      }

      const token  = await getToken();
      const result = await uploadChunked(token, carpeta, nombre, file);

      toast.success('Archivo subido a SharePoint ✓');
      return { webUrl: result.shareUrl, fileName: nombre };

    } catch (err: any) {
      toast.error('Error al subir archivo: ' + (err.message ?? 'Error desconocido'));
      return null;
    } finally {
      setUploading(false);
    }
  };

  const uploadCustom = async (file: File, carpeta: string, fileName: string): Promise<string | null> => {
    setUploading(true);
    try {
      const token  = await getToken();
      const result = await uploadChunked(token, carpeta, fileName, file);
      toast.success('Archivo subido ✓');
      return result.shareUrl;
    } catch (err: any) {
      toast.error('Error al subir: ' + (err.message ?? 'Error'));
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Migra todos los links existentes en la DB a links anónimos
  const migrarLinks = async (): Promise<void> => {
    const token = await getToken();

    const tablas = [
      { tabla: 'anteproyectos',                  urlCol: 'zip_url',          pathCol: 'zip_nombre',     pathBase: null },
      { tabla: 'levantamiento_comunicados',       urlCol: 'onedrive_url',     pathCol: 'archivo_nombre', pathBase: 'onedrive_path' },
      { tabla: 'levantamiento_reportes',          urlCol: 'onedrive_url',     pathCol: 'archivo_nombre', pathBase: 'onedrive_path' },
      { tabla: 'levantamiento_reportes_generales',urlCol: 'onedrive_url',     pathCol: 'archivo_nombre', pathBase: 'onedrive_path' },
      { tabla: 'levantamiento_entregables',       urlCol: 'acta_cierre_url',  pathCol: 'acta_cierre_nombre', pathBase: null },
    ];

    let total = 0;
    let ok    = 0;

    for (const t of tablas) {
      const { data: rows } = await supabase.from(t.tabla).select('*').not(t.urlCol, 'is', null);
      if (!rows?.length) continue;

      for (const row of rows) {
        total++;
        try {
          const carpeta  = t.pathBase ? row[t.pathBase] : null;
          const fileName = row[t.pathCol];
          if (!carpeta || !fileName) continue;

          const itemId = await getDriveItemId(token, carpeta, fileName);
          if (!itemId) continue;

          const shareUrl = await generateShareLink(itemId, token);
          if (!shareUrl) continue;

          await supabase.from(t.tabla).update({ [t.urlCol]: shareUrl }).eq('id', row.id);
          ok++;
        } catch { /* continuar con el siguiente */ }
      }
    }

    toast.success(`Links migrados: ${ok}/${total} archivos actualizados`);
  };

  return { upload, uploadCustom, uploading, migrarLinks };
}
