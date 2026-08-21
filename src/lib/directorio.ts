import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

/**
 * FUENTE ÚNICA DE VERDAD para datos de colegios y personas de contacto.
 *
 * Todo lo que antes vivía repetido/hardcodeado en distintos archivos
 * (colegios.ts, LevantamientoNacional.tsx, TicketMAS.tsx, etc.) debe leerse
 * de aquí — que a su vez lee en vivo de la tabla `directorio` en Supabase,
 * la misma que edita el módulo de Directorio.
 *
 * Regla de uso (acordada con Ricardo):
 *   - `codigo`  → nombre corto ("MA VSJ"). Usar SOLO cuando el espacio es
 *                 limitado: PDFs, tarjetas de KPI, tablas angostas.
 *   - `nombre`  → nombre completo ("Mano Amiga Villas de San Juan"). Es el
 *                 que se debe usar por default, y es OBLIGATORIO en
 *                 cualquier documento oficial que genere el sistema.
 *   - `nombre_oficial` → razón social legal (ej. "Centro Educativo Cualcan
 *                 Acapulco, S. C."). NO usar para despliegue general —
 *                 solo para documentos fiscales/legales que la pidan.
 *
 * Cuando cambias algo en el módulo de Directorio, se refleja aquí solo con
 * refrescar — nadie tiene que tocar código ni volver a desplegar nada.
 */

export interface DirectorioColegio {
  id: string;
  codigo: string;          // "MA VSJ"
  nombre: string;          // "Mano Amiga Villas de San Juan"
  nombre_oficial: string;  // razón social legal
  territorio: string;      // "NORTE" | "MEXICO" | "FMA"
  rfc: string;
  dir_fiscal: string;
  dir_fisica: string;
  telefonos: string;
  // Director
  dir_nombre: string; dir_correo: string; dir_tel_movil: string; dir_tel_red: string;
  // Administrador
  adm_nombre: string; adm_correo: string; adm_tel_movil: string; adm_tel_red: string;
  // CAR (Coordinador de Área Regional)
  car_nombre: string; car_correo: string; car_tel_movil: string;
  // Gerente de Operaciones ECO
  geo_nombre: string; geo_correo: string; geo_tel_movil: string;
  // Líder de Proyecto ECO
  leo_nombre: string; leo_correo: string; leo_tel_movil: string;
  // Gerente Jurídico OR-SER
  gjo_nombre: string; gjo_correo: string; gjo_tel_movil: string;
  // Líder Jurídico OR-SER
  ljo_nombre: string; ljo_correo: string; ljo_tel_movil: string;
  // Datos fiscales/administrativos (usados por Ticket MAS y Solicitud de Proyecto)
  sociedad: string; centro_gestor: string; contador_nombre: string; contador_correo: string;
  // Roles nacionales — SOLO viven en la fila codigo='GENERAL'. Separados de
  // dir_nombre/adm_nombre para no confundir "Director de escuela" con
  // "Director Nacional" ni "Administrador de escuela" con "Gerente".
  gerente_nombre: string; gerente_correo: string; gerente_tel_movil: string;
  director_nacional_nombre: string; director_nacional_correo: string; director_nacional_tel_movil: string;
  niveles?: string[];
  updated_at?: string;
}

const SELECT_COLS = '*';

/**
 * Hook principal — trae la tabla `directorio` completa, en vivo.
 * Úsalo una vez por página y comparte el resultado entre los helpers de
 * abajo, en vez de llamarlo repetidas veces.
 */
export function useDirectorio() {
  return useQuery({
    queryKey: ['directorio_global'],
    queryFn: async () => {
      const { data, error } = await supabase.from('directorio').select(SELECT_COLS).order('nombre');
      if (error) throw error;
      return (data ?? []) as DirectorioColegio[];
    },
    staleTime: 1000 * 60 * 5, // 5 min — el directorio no cambia segundo a segundo
  });
}

// ── Helpers de lookup síncrono, dado el array ya cargado por useDirectorio() ──

export function findColegio(rows: DirectorioColegio[], codigo: string): DirectorioColegio | null {
  if (!codigo) return null;
  return rows.find(r => r.codigo === codigo) ?? null;
}

/** Nombre completo ("Mano Amiga X") a partir del código corto. Cae de vuelta al código si no lo encuentra. */
export function nombreCompleto(rows: DirectorioColegio[], codigo: string): string {
  return findColegio(rows, codigo)?.nombre || codigo;
}

export function getDirector(rows: DirectorioColegio[], codigo: string) {
  const c = findColegio(rows, codigo);
  return { nombre: c?.dir_nombre ?? '', correo: c?.dir_correo ?? '', telMovil: c?.dir_tel_movil ?? '', telRed: c?.dir_tel_red ?? '' };
}

export function getAdministrador(rows: DirectorioColegio[], codigo: string) {
  const c = findColegio(rows, codigo);
  return { nombre: c?.adm_nombre ?? '', correo: c?.adm_correo ?? '', telMovil: c?.adm_tel_movil ?? '', telRed: c?.adm_tel_red ?? '' };
}

export function getCAR(rows: DirectorioColegio[], codigo: string) {
  const c = findColegio(rows, codigo);
  return { nombre: c?.car_nombre ?? '', correo: c?.car_correo ?? '', telMovil: c?.car_tel_movil ?? '' };
}

export function getGerenteEco(rows: DirectorioColegio[], codigo: string) {
  const c = findColegio(rows, codigo);
  return { nombre: c?.geo_nombre ?? '', correo: c?.geo_correo ?? '', telMovil: c?.geo_tel_movil ?? '' };
}

export function getLiderEco(rows: DirectorioColegio[], codigo: string) {
  const c = findColegio(rows, codigo);
  return { nombre: c?.leo_nombre ?? '', correo: c?.leo_correo ?? '', telMovil: c?.leo_tel_movil ?? '' };
}

export function getGerenteJuridico(rows: DirectorioColegio[], codigo: string) {
  const c = findColegio(rows, codigo);
  return { nombre: c?.gjo_nombre ?? '', correo: c?.gjo_correo ?? '', telMovil: c?.gjo_tel_movil ?? '' };
}

export function getLiderJuridico(rows: DirectorioColegio[], codigo: string) {
  const c = findColegio(rows, codigo);
  return { nombre: c?.ljo_nombre ?? '', correo: c?.ljo_correo ?? '', telMovil: c?.ljo_tel_movil ?? '' };
}

export function getDatosFiscales(rows: DirectorioColegio[], codigo: string) {
  const c = findColegio(rows, codigo);
  return {
    sociedad: c?.sociedad ?? '',
    centroGestor: c?.centro_gestor ?? '',
    contadorNombre: c?.contador_nombre ?? '',
    contadorCorreo: c?.contador_correo ?? '',
    razonSocial: c?.nombre_oficial ?? '',
  };
}

/** Roles nacionales (Gerente, Director Nacional) — siempre viven en la fila
 *  codigo='GENERAL', sin importar de qué colegio se trate la notificación. */
export function getGerenteFMA(rows: DirectorioColegio[]) {
  const c = findColegio(rows, 'GENERAL');
  return { nombre: c?.gerente_nombre ?? '', correo: c?.gerente_correo ?? '', telMovil: c?.gerente_tel_movil ?? '' };
}

export function getDirectorNacional(rows: DirectorioColegio[]) {
  const c = findColegio(rows, 'GENERAL');
  return { nombre: c?.director_nacional_nombre ?? '', correo: c?.director_nacional_correo ?? '', telMovil: c?.director_nacional_tel_movil ?? '' };
}

export function getTerritorios(rows: DirectorioColegio[]): string[] {
  return Array.from(new Set(rows.map(r => r.territorio))).sort();
}

export function getColegiosPorTerritorio(rows: DirectorioColegio[], territorio: string): DirectorioColegio[] {
  return rows.filter(r => r.territorio === territorio);
}
