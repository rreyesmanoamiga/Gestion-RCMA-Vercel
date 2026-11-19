// Capacitación · consultas compartidas (catálogo, resumen y miniaturas)
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { accionCapacitacion, type Video, type Resumen } from '@/lib/capacitacion';

/** Videos que el usuario puede ver (la base filtra: borradores solo para la Coordinación) */
export function useVideos() {
  return useQuery({
    queryKey: ['capacitacion_videos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('capacitacion_videos').select('*')
        .order('publicado_at', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Video[];
    },
  });
}

/** Visitas, me gusta, comentarios y lo mío, por video */
export function useResumen() {
  return useQuery({
    queryKey: ['capacitacion_resumen'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('capacitacion_resumen');
      if (error) throw error;
      return Object.fromEntries(((data ?? []) as Resumen[]).map(r => [r.video_id, r])) as Record<string, Resumen>;
    },
  });
}

/** Links temporales (≈1 h) de las miniaturas en OneDrive */
export function useMiniaturas(ids: string[]) {
  const clave = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['capacitacion_miniaturas', clave],
    queryFn: async () => (await accionCapacitacion<{ urls: Record<string, string> }>('miniaturas', { ids })).urls,
    enabled: ids.length > 0,
    staleTime: 40 * 60 * 1000,
    gcTime: 45 * 60 * 1000,
    retry: 1,
  });
}
