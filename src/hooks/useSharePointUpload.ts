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

      const form = new FormData();
      form.append('file',     file);
      form.append('carpeta',  carpeta);
      form.append('fileName', nombre);

      const { data, error } = await supabase.functions.invoke('sharepoint-upload', { body: form });

      if (error) throw error;
      if (!data?.webUrl) throw new Error('No se obtuvo URL del archivo');

      toast.success('Archivo subido a SharePoint ✓');
      return { webUrl: data.webUrl, fileName: nombre };

    } catch (err: any) {
      toast.error('Error al subir archivo: ' + (err.message ?? 'Error desconocido'));
      return null;
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploading };
}
