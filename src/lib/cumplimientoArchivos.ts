// Expediente digital de Cumplimiento: archivos de cada documento del checklist.
// Toda acción pasa por la función del servidor "cumplimiento-archivos" (valida
// permisos y colegio, y maneja OneDrive sin exponer la llave de Microsoft).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface ArchivoCumplimiento {
  id: string;
  documento_id: string;
  colegio: string;
  nombre_original: string;
  archivo_nombre: string;
  url: string;
  tamano: number | null;
  origen: 'rcma' | 'colegio';
  subido_por_email: string | null;
  subido_por_nombre: string | null;
  created_at: string;
}

export type Revision = 'por_revisar' | 'verificado' | 'rechazado' | null;

export const REVISION_CFG: Record<string, { label: string; cls: string }> = {
  por_revisar: { label: 'Por revisar', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  verificado:  { label: 'Verificado',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rechazado:   { label: 'Rechazado',   cls: 'bg-red-100 text-red-700 border-red-200' },
};

const MAX_MB = 100;
const CHUNK = 5 * 1024 * 1024; // múltiplo de 320 KiB, como pide OneDrive

export async function accionCumplimiento<T = any>(accion: string, datos: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('cumplimiento-archivos', { body: { accion, ...datos } });
  if (error) {
    // El mensaje real del servidor viene en el cuerpo de la respuesta
    let msg = error.message;
    try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

// Sube uno o varios archivos a un documento. onProgreso recibe 0-100 del total.
export async function subirArchivos(documentoId: string, archivos: File[], onProgreso?: (pct: number, nombre: string) => void) {
  const grandes = archivos.filter(f => f.size > MAX_MB * 1024 * 1024);
  if (grandes.length) throw new Error(`Estos archivos pesan más de ${MAX_MB} MB: ${grandes.map(f => f.name).join(', ')}`);
  const total = archivos.reduce((s, f) => s + f.size, 0) || 1;
  let enviado = 0;
  let registrados = 0;

  try {
  for (let i = 0; i < archivos.length; i++) {
    const f = archivos[i];
    const { uploadUrl } = await accionCumplimiento<{ uploadUrl: string }>('iniciar_subida', {
      documento_id: documentoId, nombre: f.name, tamano: f.size,
    });

    let itemId = '';
    if (f.size === 0) throw new Error(`El archivo "${f.name}" está vacío`);
    for (let inicio = 0; inicio < f.size; inicio += CHUNK) {
      const fin = Math.min(inicio + CHUNK, f.size);
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${inicio}-${fin - 1}/${f.size}` },
        body: f.slice(inicio, fin),
      });
      if (!res.ok && res.status !== 202) throw new Error(`Error al subir "${f.name}" (${res.status})`);
      if (res.status === 200 || res.status === 201) itemId = (await res.json()).id ?? '';
      enviado += fin - inicio;
      onProgreso?.(Math.round((enviado / total) * 100), f.name);
    }
    if (!itemId) throw new Error(`OneDrive no confirmó el archivo "${f.name}"`);

    await accionCumplimiento('registrar_subida', { documento_id: documentoId, item_id: itemId, nombre: f.name });
    registrados++;
  }
  } finally {
    // Un solo aviso a la Coordinación por tanda, aunque algún archivo falle
    if (registrados > 0) await accionCumplimiento('notificar_subida', { documento_id: documentoId }).catch(() => {});
  }
}

export function useArchivosDocumento(documentoId: string | null | undefined) {
  return useQuery({
    queryKey: ['compliance_archivos', documentoId],
    enabled: !!documentoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('compliance_archivos')
        .select('*').eq('documento_id', documentoId!).order('created_at');
      if (error) throw error;
      return (data ?? []) as ArchivoCumplimiento[];
    },
  });
}

// Conteo de archivos por documento (para los íconos 📎 de las tablas)
export function useConteoArchivos(enabled = true) {
  return useQuery({
    queryKey: ['compliance_archivos_conteo'],
    enabled,
    queryFn: async () => {
      const mapa: Record<string, number> = {};
      let desde = 0;
      while (true) {
        const { data, error } = await supabase.from('compliance_archivos').select('documento_id').range(desde, desde + 999);
        if (error) throw error;
        (data ?? []).forEach((a: any) => { mapa[a.documento_id] = (mapa[a.documento_id] ?? 0) + 1; });
        if (!data || data.length < 1000) break;
        desde += 1000;
      }
      return mapa;
    },
  });
}

export function useRefrescarExpediente() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['compliance_archivos'] });
    qc.invalidateQueries({ queryKey: ['compliance_archivos_conteo'] });
    qc.invalidateQueries({ queryKey: ['compliance_documentos'] });
    qc.invalidateQueries({ queryKey: ['cumplimiento_mis_documentos'] });
  };
}

export const fmtTamano = (b: number | null) =>
  b == null ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
