// Genera un archivo .ics (calendario) para un pendiente de NEXUS.
// Al abrirlo, Outlook / Calendario del celular lo agrega como evento de
// todo el día en la fecha límite, con recordatorio un día antes a las 9:00
// y el mismo día a las 8:00. Usa un UID fijo por pendiente: si se vuelve a
// descargar (por ejemplo, después de cambiar la fecha), el evento se
// actualiza en lugar de duplicarse.

export interface PendienteICS {
  id: string;
  titulo: string;
  descripcion?: string | null;
  fecha_limite?: string | null;
  prioridad?: string | null;
  colegio?: string | null;
  territorio?: string | null;
  proyecto_nombre?: string | null;
  ticket_folio?: string | null;
  asignado_nombre?: string | null;
}

const PRIORIDAD: Record<string, string> = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baja: 'Baja' };

/** Escapa texto según RFC 5545 (\ ; , y saltos de línea) */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Corta líneas a 75 bytes como pide el estándar (sin partir caracteres UTF-8) */
function doblar(linea: string): string {
  const enc = new TextEncoder();
  if (enc.encode(linea).length <= 75) return linea;
  const partes: string[] = [];
  let actual = '';
  let bytes = 0;
  for (const ch of linea) {
    const n = enc.encode(ch).length;
    const limite = partes.length === 0 ? 75 : 74; // las continuaciones llevan un espacio al inicio
    if (bytes + n > limite) { partes.push(actual); actual = ''; bytes = 0; }
    actual += ch; bytes += n;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

const yyyymmdd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const sello = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function crearICSPendiente(p: PendienteICS, urlSistema: string): string {
  // Fecha del evento: la fecha límite; sin fecha, el día de hoy
  const base = p.fecha_limite ? new Date(p.fecha_limite.slice(0, 10) + 'T12:00:00') : new Date();
  const fin = new Date(base); fin.setDate(fin.getDate() + 1);
  const ahora = new Date();

  const detalle = [
    p.descripcion?.trim() || '',
    '',
    p.prioridad ? `Prioridad: ${PRIORIDAD[p.prioridad] ?? p.prioridad}` : '',
    p.colegio ? `Colegio: ${p.colegio}` : '',
    p.territorio ? `Territorio: ${p.territorio}` : '',
    p.proyecto_nombre ? `Proyecto: ${p.proyecto_nombre}` : '',
    p.ticket_folio ? `Ticket: ${p.ticket_folio}` : '',
    p.asignado_nombre ? `Responsable: ${p.asignado_nombre}` : '',
    p.fecha_limite ? '' : 'Sin fecha límite en el sistema: se agendó el día en que se descargó.',
    '',
    `Abrir en NEXUS: ${urlSistema}`,
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n').trim();

  const titulo = `Pendiente: ${p.titulo}`;
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mano Amiga//Sistema RCMA NEXUS//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:nexus-pendiente-${p.id}@sistema-rcma`,
    `DTSTAMP:${sello(ahora)}`,
    `SEQUENCE:${Math.floor(ahora.getTime() / 60000)}`,
    `DTSTART;VALUE=DATE:${yyyymmdd(base)}`,
    `DTEND;VALUE=DATE:${yyyymmdd(fin)}`,
    `SUMMARY:${esc(titulo)}`,
    `DESCRIPTION:${esc(detalle)}`,
    `URL:${urlSistema}`,
    p.colegio ? `LOCATION:${esc(p.colegio)}` : '',
    'CATEGORIES:NEXUS',
    p.prioridad === 'urgente' || p.prioridad === 'alta' ? 'PRIORITY:1' : 'PRIORITY:5',
    'TRANSP:TRANSPARENT',
    'X-MICROSOFT-CDO-ALLDAYEVENT:TRUE',
    'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
    // Outlook usa el primer recordatorio; el celular respeta los dos
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(titulo)}`,
    'TRIGGER:-PT15H',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(titulo)}`,
    'TRIGGER:PT8H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lineas.map(doblar).join('\r\n') + '\r\n';
}

/** Descarga el .ics; al abrirlo se agrega al calendario */
export function descargarICSPendiente(p: PendienteICS) {
  const url = `${window.location.origin}/nexus`;
  const contenido = crearICSPendiente(p, url);
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' });
  const nombre = `Pendiente - ${p.titulo}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) + '.ics';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
