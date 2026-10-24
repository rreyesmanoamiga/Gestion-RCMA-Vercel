// Áreas / Organización de los usuarios (Accesos). Compartido con el aviso de
// "Ver como" y con cualquier pantalla que necesite mostrar el área de alguien.
// ─── Áreas / Organización ───────────────────────────────────────────────────
// Identifica a QUÉ pertenece el usuario. Separado del alcance (qué tanto ve).
export const AREAS: { value: string; label: string; color: string }[] = [
  { value: 'fma_direccion_nacional', label: 'Director Nacional (FMA)',   color: 'bg-slate-100 text-slate-800 border-slate-300' },
  { value: 'fma_gerencia',      label: 'Gerencia (FMA)',                 color: 'bg-slate-50 text-slate-700 border-slate-200' },
  { value: 'car',               label: 'Coord. Admin. Regional (FMA)',   color: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'colegio',           label: 'Colegios (MA)',                  color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'fma_admisiones',    label: 'Admisiones (FMA)',               color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  { value: 'fma_becas',         label: 'Becas (FMA)',                    color: 'bg-pink-50 text-pink-700 border-pink-200' },
  { value: 'fma_aux_contable',  label: 'Aux. Cont. (FMA)',               color: 'bg-lime-50 text-lime-700 border-lime-200' },
  { value: 'fma_procuracion',   label: 'Procuración de Fondos (FMA)',    color: 'bg-violet-50 text-violet-700 border-violet-200' },
  { value: 'orser_inmobiliaria', label: 'Inmobiliaria (ORS-SER)',        color: 'bg-stone-50 text-stone-700 border-stone-200' },
  { value: 'director_colegio',  label: 'Director de Colegio',            color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'coordinacion_rcma', label: 'Informática (FMA)',              color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'orser_finanzas',    label: 'Finanzas (ORS-SER)',             color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'orser_juridico',    label: 'Jurídico (ORS-SER)',             color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { value: 'orser_fiscal',      label: 'Fiscal (ORS-SER)',               color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'orser_eco',         label: 'ECO (ORS-SER)',                  color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { value: 'orser_pc',          label: 'Protección Civil (ORS-SER)',     color: 'bg-red-50 text-red-700 border-red-200' },
];
export const getAreaInfo = (value?: string) => AREAS.find(a => a.value === value) ?? null;

// ─── Qué ve un usuario según su área, territorio y colegio ──────────────────
// Repite EXACTAMENTE la regla de useScope para poder explicarla en Accesos
// antes de guardar, y avisar de las combinaciones que suelen ser un error.
const AREAS_DE_COLEGIO = ['colegio', 'director_colegio'];
const OFICINAS_VIEJAS = ['OF. MTY', 'OF. CDMX'];
const NOMBRE_TERRITORIO: Record<string, string> = { NORTE: 'Norte', MEXICO: 'México', FMA: 'FMA' };

export interface ResumenAlcance { texto: string; avisos: string[] }

export function resumenAlcance(
  u: { area?: string | null; territorio?: string | null; colegio?: string | null },
  perms?: Record<string, unknown> | null,
): ResumenAlcance {
  const area = (u.area ?? '').trim();
  const territorio = (u.territorio ?? '').trim();
  const colegio = (u.colegio ?? '').trim();
  const avisos: string[] = [];
  const areaEsColegio = !area || AREAS_DE_COLEGIO.includes(area);
  const t = NOMBRE_TERRITORIO[territorio] ?? territorio;

  let texto: string;
  if (!territorio) {
    texto = 'TODO (no tiene territorio)';
    avisos.push('No tiene territorio capturado: va a ver la información de TODOS los colegios.');
  } else if (territorio === 'GENERAL' || colegio === 'GENERAL') {
    texto = 'Todo (alcance nacional)';
  } else if (areaEsColegio && colegio && colegio !== 'ECO' && !OFICINAS_VIEJAS.includes(colegio)) {
    texto = `Solo ${colegio}`;
  } else {
    texto = territorio === 'FMA' ? 'Solo registros de FMA' : `Todo el territorio ${t}`;
  }

  if (areaEsColegio && territorio && territorio !== 'GENERAL' && !colegio)
    avisos.push(`Es de colegio pero no tiene colegio asignado: va a ver todo el territorio ${t}.`);
  if (!areaEsColegio && colegio && colegio !== 'GENERAL' && territorio && territorio !== 'GENERAL')
    avisos.push(`Tiene el colegio ${colegio}, pero por su área ve todo el territorio ${t}.`);
  if (OFICINAS_VIEJAS.includes(colegio))
    avisos.push(`Tiene ${colegio} asignado (ya no se usa): solo verá registros de FMA. Asígnale área y alcance.`);
  if (perms && !Object.entries(perms).some(([k, v]) => k.startsWith('ver_') && v === true))
    avisos.push('No tiene ningún permiso de "Ver": solo le aparecerán Protocolo y Directorio.');

  return { texto, avisos };
}
