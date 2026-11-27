// Lee el PDF de una minuta o nota técnica (formato institucional) y saca la
// tabla de "Acuerdos y compromisos" / "Acciones recomendadas":
//   No. | Acuerdo / Compromiso | Responsable | Fecha
// Devuelve las filas para precargar el formulario; el usuario las revisa antes
// de guardar. Si no encuentra la tabla, regresa [] y se captura a mano.

export interface AcuerdoLeido {
  descripcion: string;
  responsable: string;
  fecha_compromiso: string; // YYYY-MM-DD o ''
  hora_compromiso: string;  // HH:MM o ''
}

export interface Trozo { str: string; x: number; y: number; pagina: number }

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
};
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const limpio = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();

/** "25-nov-2026, 9:00 h" · "26/11/2026" · "2026-11-26" → { fecha, hora, resto } */
export function leerFecha(texto: string, anioRef = new Date().getFullYear()): { fecha: string; hora: string } {
  const t = sinAcentos(texto.toLowerCase());
  let fecha = '';
  let m = t.match(/(\d{1,2})[-\s/]+(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?(?:[-\s/,]+(?:de\s+)?(\d{4}))?/);
  if (m) {
    const anio = m[3] ? Number(m[3]) : anioRef;
    fecha = `${anio}-${String(MESES[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  } else if ((m = t.match(/(\d{4})-(\d{2})-(\d{2})/))) {
    fecha = `${m[1]}-${m[2]}-${m[3]}`;
  } else if ((m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) {
    fecha = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  let hora = '';
  const h = t.match(/(\d{1,2}):(\d{2})/);
  if (fecha && h) hora = `${h[1].padStart(2, '0')}:${h[2]}`;
  return { fecha, hora };
}

/** Agrupa los trozos de texto en renglones (misma página y misma altura). */
function renglones(trozos: Trozo[]) {
  const ordenados = [...trozos].filter(t => t.str.trim()).sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x);
  const filas: { pagina: number; y: number; trozos: Trozo[] }[] = [];
  for (const t of ordenados) {
    const f = filas[filas.length - 1];
    if (f && f.pagina === t.pagina && Math.abs(f.y - t.y) < 3) f.trozos.push(t);
    else filas.push({ pagina: t.pagina, y: t.y, trozos: [t] });
  }
  filas.forEach(f => f.trozos.sort((a, b) => a.x - b.x));
  return filas;
}

const textoFila = (f: { trozos: Trozo[] }) => limpio(f.trozos.map(t => t.str).join(' '));

export function extraerAcuerdos(trozos: Trozo[], anioRef?: number): AcuerdoLeido[] {
  const filas = renglones(trozos);
  // 1) Título de la sección
  const iTitulo = filas.findIndex(f => /^\d+\.?\s*(acuerdos|acciones)/i.test(sinAcentos(textoFila(f))));
  if (iTitulo < 0) return [];
  // 2) Encabezado de la tabla (renglón con "Responsable" y "Fecha")
  let iEnc = -1;
  for (let i = iTitulo; i < Math.min(filas.length, iTitulo + 6); i++) {
    const t = sinAcentos(textoFila(filas[i])).toLowerCase();
    if (t.includes('responsable') && t.includes('fecha')) { iEnc = i; break; }
  }
  if (iEnc < 0) return [];
  const enc = filas[iEnc].trozos;
  const xDe = (re: RegExp) => enc.find(t => re.test(sinAcentos(t.str).toLowerCase()))?.x;
  const xResp = xDe(/responsable/);
  const xFecha = xDe(/fecha/);
  const xDesc = xDe(/acuerdo|accion|compromiso/) ?? (enc[1]?.x ?? enc[0].x + 30);
  if (xResp == null || xFecha == null) return [];
  const xNum = enc[0].x;
  const margen = 4;

  // 3) Renglones de la tabla hasta la siguiente sección
  const salida: { desc: string[]; resp: string[]; fecha: string[] }[] = [];
  for (let i = iEnc + 1; i < filas.length; i++) {
    const f = filas[i];
    const t = textoFila(f);
    if (/juntos transformando vidas/i.test(t)) continue;           // pie de página
    if (/^\d+\.\s+[A-ZÁÉÍÓÚÑ]/.test(t) && f.trozos[0].x <= xNum + margen && !/^\d+\s*$/.test(f.trozos[0].str)) break; // "6. Notas adicionales"
    const primero = f.trozos[0];
    const esNuevo = /^\d{1,2}\.?$/.test(primero.str.trim()) && primero.x < xDesc - margen;
    if (esNuevo) salida.push({ desc: [], resp: [], fecha: [] });
    const actual = salida[salida.length - 1];
    if (!actual) continue;
    for (const tr of f.trozos) {
      if (tr === primero && esNuevo) continue;
      if (tr.x >= xFecha - margen) actual.fecha.push(tr.str);
      else if (tr.x >= xResp - margen) actual.resp.push(tr.str);
      else if (tr.x >= xDesc - margen * 3) actual.desc.push(tr.str);
    }
  }

  return salida
    .map(r => {
      const desc = limpio(r.desc.join(' '));
      const resp = limpio(r.resp.join(' ').replace(/\s*\/\s*/g, ' / '));
      const fechaTxt = limpio(r.fecha.join(' ').replace(/-\s+/g, '-'));
      // "A definir en la reunión del 26-nov", "Por confirmar"… no son fechas de compromiso
      const sinFecha = /^(a definir|por definir|por confirmar|pendiente|no especificad)/i.test(sinAcentos(fechaTxt));
      const { fecha, hora } = sinFecha ? { fecha: '', hora: '' } : leerFecha(fechaTxt, anioRef);
      // Si la fecha no es una fecha ("No especificado", "A definir…"), se conserva el texto en la descripción
      const nota = !fecha && fechaTxt && !/^no especificad/i.test(fechaTxt) ? ` (Fecha: ${fechaTxt})` : '';
      return { descripcion: desc + nota, responsable: resp, fecha_compromiso: fecha, hora_compromiso: hora };
    })
    .filter(r => r.descripcion);
}

/** Lee el archivo PDF en el navegador y regresa los acuerdos encontrados. */
export async function leerAcuerdosDePdf(archivo: File): Promise<AcuerdoLeido[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: await archivo.arrayBuffer() }).promise;
  const trozos: Trozo[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const contenido = await pagina.getTextContent();
    for (const it of contenido.items as { str?: string; transform?: number[] }[]) {
      if (!it.str || !it.transform) continue;
      trozos.push({ str: it.str, x: it.transform[4], y: it.transform[5], pagina: p });
    }
  }
  return extraerAcuerdos(trozos);
}
