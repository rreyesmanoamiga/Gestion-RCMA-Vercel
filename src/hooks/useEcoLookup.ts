// src/hooks/useEcoLookup.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

interface DirectorioEcoRow {
  codigo: string;
  leo_nombre: string | null;
}

/**
 * Busca el nombre del Líder de Proyecto ECO por colegio, tomándolo de la
 * tabla `directorio` (columna leo_nombre) en vez de un valor fijo en el código.
 * Así, cualquier cambio de personal se actualiza solo en toda la app en
 * cuanto se edita en el módulo de Directorio — sin tocar código.
 */
export function useEcoLookup() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['directorio_eco_lookup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('directorio').select('codigo, leo_nombre');
      if (error) throw error;
      return (data ?? []) as DirectorioEcoRow[];
    },
    staleTime: 1000 * 60 * 10, // 10 minutos — el personal no cambia tan seguido
  });

  const getEco = (colegio: string): string => {
    if (!colegio) return '';
    const row = data.find(d => d.codigo === colegio);
    let nombre = row?.leo_nombre?.trim() ?? '';
    // Limpieza defensiva por si algún registro trae basura de captura (ej. "-\tNombre")
    nombre = nombre.replace(/^-+\s*/, '').trim();
    return nombre && nombre !== '-' ? nombre : '';
  };

  return { getEco, isLoading };
}
