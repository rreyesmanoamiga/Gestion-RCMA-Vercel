import { useMemo } from 'react';
import { usePermissions } from './usePermissions';

/**
 * useScope — filtro de visibilidad por Área / Territorio / Colegio.
 *
 * Reglas:
 * - Admin siempre ve todo.
 * - Un usuario con alcance "GENERAL" (o colegio "GENERAL") ve todo.
 * - Un usuario de Colegio/Director de Colegio con un colegio específico asignado
 *   solo ve filas de ESE colegio.
 * - Un usuario de Colegio marcado como "ECO" (cubre varios colegios) o un usuario
 *   ORSER/Coordinación con territorio (Norte/México) ve TODO ese territorio.
 * - Usuarios antiguos sin `area`/`territorio` capturados (de antes de esta función)
 *   se tratan como generales, para no ocultarles de golpe algo que ya veían.
 *
 * filtrarPorAlcance() es genérico: se le pasa cómo leer el territorio/colegio
 * de cada fila y filtra el arreglo — no toca la consulta a Supabase, funciona
 * sobre datos ya traídos (igual que el resto de los filtros del sistema).
 */
export function useScope() {
  const { isAdmin, permsRecord } = usePermissions();

  const area       = (permsRecord as Record<string, unknown> | null)?.area as string | undefined;
  const territorio = (permsRecord as Record<string, unknown> | null)?.territorio as string | undefined;
  const colegio    = (permsRecord as Record<string, unknown> | null)?.colegio as string | undefined;

  const esGeneral = isAdmin
    || !territorio
    || territorio === 'GENERAL'
    || colegio === 'GENERAL';

  // Área "colegio-céntrica": tiene sentido filtrar por colegio exacto (si trae uno real, no ECO).
  const areaEsColegio = !area || area === 'colegio' || area === 'director_colegio';
  const colegioEspecifico = areaEsColegio && colegio && colegio !== 'ECO' ? colegio : null;

  const filtrarPorAlcance = useMemo(() => {
    return function filtrar<T>(
      rows: T[],
      getTerritorio: (row: T) => string | undefined | null,
      getColegio?: (row: T) => string | undefined | null,
    ): T[] {
      if (esGeneral) return rows;
      return rows.filter(row => {
        const filaColegio = getColegio ? getColegio(row) : undefined;
        // 1) Usuario con colegio específico asignado: coincidencia exacta si la fila trae colegio.
        if (colegioEspecifico && getColegio) {
          if (filaColegio) return filaColegio === colegioEspecifico;
        }
        // 2) Resto (ECO, ORSER, Coordinación con territorio): todo el territorio.
        const filaTerritorio = getTerritorio(row);
        if (territorio && filaTerritorio) return filaTerritorio === territorio;
        // 3) Fila sin territorio/colegio identificable: no la ocultamos (evita romper datos legacy).
        return true;
      });
    };
  }, [esGeneral, territorio, colegioEspecifico]);

  return { esGeneral, area, territorio, colegio, colegioEspecifico, filtrarPorAlcance };
}
