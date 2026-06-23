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
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB — el navegador no tiene límite de RAM como Supabase

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

async function uploadChunked(token: string, carpeta: string, fileName: string, file: File): Promise<string> {
  const path     = carpeta.split('/').map(p => encodeURIComponent(p)).join('/');
  const itemPath = `Sistema%20RCMA%20Doc/${path}/${encodeURIComponent(fileName)}`;

  // Crear upload session en Microsoft Graph
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
  let start  = 0;

  // Upload chunked directo desde el navegador — sin límite de tiempo de Supabase
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

    if (!chunkRes.ok && chunkRes.status !== 202) {
      throw new Error(`Chunk error ${chunkRes.status}: ${await chunkRes.text()}`);
    }
    if (chunkRes.status === 201 || chunkRes.status === 200) {
      const item = await chunkRes.json();
      webUrl = item.webUrl ?? '';
    }
    start = end;
  }
  return webUrl;
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
      const webUrl = await uploadChunked(token, carpeta, nombre, file);

      if (!webUrl) throw new Error('No se obtuvo URL del archivo');
      toast.success('Archivo subido a SharePoint ✓');
      return { webUrl, fileName: nombre };

    } catch (err: any) {
      toast.error('Error al subir archivo: ' + (err.message ?? 'Error desconocido'));
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Para uso directo con carpeta y fileName personalizados
  const uploadCustom = async (file: File, carpeta: string, fileName: string): Promise<string | null> => {
    setUploading(true);
    try {
      const token  = await getToken();
      const webUrl = await uploadChunked(token, carpeta, fileName, file);
      if (!webUrl) throw new Error('No se obtuvo URL');
      toast.success('Archivo subido ✓');
      return webUrl;
    } catch (err: any) {
      toast.error('Error al subir: ' + (err.message ?? 'Error'));
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploadCustom, uploading };
}