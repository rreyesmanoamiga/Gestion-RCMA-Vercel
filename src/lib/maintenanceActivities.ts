export interface ActividadBase {
  id: number;
  categoria: string;
  actividad: string;
  tipo: 'Limpiar' | 'Renovar' | 'Revisar';
  frecuencia: string;
  frecuenciaDias: number;
}

export const FECHA_BASE = new Date(2025, 0, 1);

export const ACTIVIDADES_BASE: ActividadBase[] = [
  { id: 1,  categoria: 'Paredes y Acabados',       actividad: 'Limpiar paredes interiores',            tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180 },
  { id: 2,  categoria: 'Paredes y Acabados',       actividad: 'Limpiar banquinas y cornisas',          tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180 },
  { id: 3,  categoria: 'Paredes y Acabados',       actividad: 'Limpiar paredes exteriores',            tipo: 'Limpiar', frecuencia: '2 años',  frecuenciaDias: 730 },
  { id: 4,  categoria: 'Paredes y Acabados',       actividad: 'Renovar laminas deterioradas',          tipo: 'Renovar', frecuencia: '5 años',  frecuenciaDias: 1825 },
  { id: 5,  categoria: 'Pisos',                    actividad: 'Limpiar piso vinilico',                 tipo: 'Limpiar', frecuencia: '1 semana',frecuenciaDias: 7 },
  { id: 6,  categoria: 'Pisos',                    actividad: 'Encerar pisos ceramicos',               tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180 },
  { id: 7,  categoria: 'Pisos',                    actividad: 'Limpiar rodapie',                       tipo: 'Limpiar', frecuencia: '1 semana',frecuenciaDias: 7 },
  { id: 8,  categoria: 'Techo y Red Pluvial',      actividad: 'Limpiar laminas de cubierta',           tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90 },
  { id: 9,  categoria: 'Techo y Red Pluvial',      actividad: 'Limpiar canoas',                        tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90 },
  { id: 10, categoria: 'Techo y Red Pluvial',      actividad: 'Limpiar cubierta de techo',             tipo: 'Limpiar', frecuencia: '4 meses', frecuenciaDias: 120 },
  { id: 11, categoria: 'Techo y Red Pluvial',      actividad: 'Revisar anclajes de laminas',           tipo: 'Revisar', frecuencia: '1 año',   frecuenciaDias: 365 },
  { id: 12, categoria: 'Puertas y Ventanas',       actividad: 'Limpiar puertas y ventanas',            tipo: 'Limpiar', frecuencia: '1 mes',   frecuenciaDias: 30 },
  { id: 13, categoria: 'Puertas y Ventanas',       actividad: 'Lubricar bisagras y pivotes',           tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90 },
  { id: 14, categoria: 'Puertas y Ventanas',       actividad: 'Limpiar canales de desague',            tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180 },
  { id: 15, categoria: 'Red de Agua Potable',      actividad: 'Limpiar llaves de paso',                tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365 },
  { id: 16, categoria: 'Red de Agua Potable',      actividad: 'Limpiar cajas de registro',             tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365 },
  { id: 17, categoria: 'Sanitarios',               actividad: 'Limpiar sanitarios',                    tipo: 'Limpiar', frecuencia: '1 dia',   frecuenciaDias: 1 },
  { id: 18, categoria: 'Sanitarios',               actividad: 'Revisar llaves y tuberias',             tipo: 'Revisar', frecuencia: '5 años',  frecuenciaDias: 1825 },
  { id: 19, categoria: 'Red Sanitaria',            actividad: 'Limpiar arquetas y trampas',            tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180 },
  { id: 20, categoria: 'Red Sanitaria',            actividad: 'Limpiar tanque septico',                tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365 },
  { id: 21, categoria: 'Instalacion Electrica',    actividad: 'Limpiar apagadores y lamparas',         tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180 },
  { id: 22, categoria: 'Instalacion Electrica',    actividad: 'Limpiar difusores lamparas',            tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365 },
  { id: 23, categoria: 'Barandillas y Rejas',      actividad: 'Limpiar rejas y barandillas',           tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180 },
  { id: 24, categoria: 'Barandillas y Rejas',      actividad: 'Engrasar persianas enrollables',        tipo: 'Renovar', frecuencia: '3 años',  frecuenciaDias: 1095 },
  { id: 25, categoria: 'Seguridad y Emergencias',  actividad: 'Revisar extintores',                    tipo: 'Revisar', frecuencia: '6 meses', frecuenciaDias: 180 },
  { id: 26, categoria: 'Seguridad y Emergencias',  actividad: 'Revisar señalamientos de emergencia',   tipo: 'Revisar', frecuencia: '1 año',   frecuenciaDias: 365 },
  { id: 27, categoria: 'Seguridad y Emergencias',  actividad: 'Probar luces de emergencia',            tipo: 'Revisar', frecuencia: '1 mes',   frecuenciaDias: 30 },
  { id: 28, categoria: 'Seguridad y Emergencias',  actividad: 'Revisar botiquin de primeros auxilios', tipo: 'Revisar', frecuencia: '1 mes',   frecuenciaDias: 30 },
  { id: 29, categoria: 'Climatizacion',            actividad: 'Limpiar filtros de aires acondicionados',tipo:'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90 },
  { id: 30, categoria: 'Climatizacion',            actividad: 'Revision general de equipos de AC',     tipo: 'Revisar', frecuencia: '1 año',   frecuenciaDias: 365 },
  { id: 31, categoria: 'Areas Exteriores',         actividad: 'Revisar juegos infantiles y equipo',    tipo: 'Revisar', frecuencia: '1 mes',   frecuenciaDias: 30 },
  { id: 32, categoria: 'Areas Exteriores',         actividad: 'Limpiar patios y areas comunes',        tipo: 'Limpiar', frecuencia: '1 semana',frecuenciaDias: 7 },
  { id: 33, categoria: 'Areas Exteriores',         actividad: 'Revisar bardas y mallas perimetrales',  tipo: 'Revisar', frecuencia: '6 meses', frecuenciaDias: 180 },
  { id: 34, categoria: 'Instalaciones Especiales', actividad: 'Limpiar cisterna y tinaco',             tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180 },
  { id: 35, categoria: 'Instalaciones Especiales', actividad: 'Fumigacion y control de plagas',        tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90 },
  { id: 36, categoria: 'Instalaciones Especiales', actividad: 'Revisar camaras de seguridad',          tipo: 'Revisar', frecuencia: '1 mes',   frecuenciaDias: 30 },
  { id: 37, categoria: 'Instalaciones Especiales', actividad: 'Revisar planta de emergencia y UPS',    tipo: 'Revisar', frecuencia: '3 meses', frecuenciaDias: 90 },
];

export const COLORES_CATEGORIA: Record<string, string> = {
  'Paredes y Acabados':       '#6366f1',
  'Pisos':                    '#f59e0b',
  'Techo y Red Pluvial':      '#10b981',
  'Puertas y Ventanas':       '#3b82f6',
  'Red de Agua Potable':      '#06b6d4',
  'Sanitarios':               '#ec4899',
  'Red Sanitaria':            '#8b5cf6',
  'Instalacion Electrica':    '#f97316',
  'Barandillas y Rejas':      '#14b8a6',
  'Seguridad y Emergencias':  '#ef4444',
  'Climatizacion':            '#0ea5e9',
  'Areas Exteriores':         '#22c55e',
  'Instalaciones Especiales': '#a855f7',
  'Personalizado':            '#64748b',
};

/** Calcula los mantenimientos que caen dentro de los próximos N días */
export function proximosMantenimientos(
  actividades: ActividadBase[],
  diasVentana = 7,
): { actividad: ActividadBase; fecha: Date }[] {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const limite = new Date(hoy.getTime() + diasVentana * 86400000);
  const resultado: { actividad: ActividadBase; fecha: Date }[] = [];

  actividades.forEach(act => {
    // Skip diarios (demasiado frecuentes para mostrar en dashboard)
    if (act.frecuenciaDias <= 1) return;
    let fecha = new Date(FECHA_BASE);
    while (fecha <= limite) {
      if (fecha >= hoy && fecha <= limite) {
        resultado.push({ actividad: act, fecha: new Date(fecha) });
      }
      fecha = new Date(fecha.getTime() + act.frecuenciaDias * 86400000);
    }
  });

  return resultado.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}