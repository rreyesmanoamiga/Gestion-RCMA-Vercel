// Imagen del aviso de cancelación de un Ticket MAS (mismo diseño que el correo
// "Ticket MAS Cancelado") para ponerla en la Presentación Semanal, en la caja
// de evidencia del proyecto cancelado. Se dibuja en el navegador (canvas) y
// tiene la proporción de las cajas de imagen de la plantilla (≈1.16 : 1).

export interface DatosAvisoCancelacion {
  folio?: string | null;
  colegio?: string | null;
  proyecto?: string | null;
  territorio?: string | null;
  fecha?: string | null;          // ISO de la cancelación
  motivo?: string | null;
}

const ANCHO = 1392;
const ALTO = 1200;

function fechaLarga(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Parte un texto en renglones que quepan en `max` px; corta con "…" si pasa de `lineas`. */
function renglones(ctx: CanvasRenderingContext2D, texto: string, max: number, lineas: number) {
  const palabras = texto.replace(/\s+/g, ' ').trim().split(' ');
  const out: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width <= max) { actual = prueba; continue; }
    if (actual) out.push(actual);
    actual = p;
    if (out.length === lineas) break;
  }
  if (out.length < lineas && actual) out.push(actual);
  if (out.length === lineas && palabras.join(' ').length > out.join(' ').length) {
    let u = out[lineas - 1];
    while (u && ctx.measureText(u + '…').width > max) u = u.slice(0, -1);
    out[lineas - 1] = u.trimEnd() + '…';
  }
  return out.length ? out : ['—'];
}

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Regresa el PNG del aviso (bytes) y su tamaño. */
export async function imagenAvisoCancelacion(d: DatosAvisoCancelacion): Promise<{ bytes: Uint8Array; ancho: number; alto: number }> {
  const canvas = document.createElement('canvas');
  canvas.width = ANCHO; canvas.height = ALTO;
  const ctx = canvas.getContext('2d')!;
  const F = 'Arial, Helvetica, sans-serif';

  // Fondo y tarjeta (letras grandes: la imagen se ve pequeña dentro del slide)
  ctx.fillStyle = '#F1F5F9'; ctx.fillRect(0, 0, ANCHO, ALTO);
  const X = 24, Y = 24, W = ANCHO - 48, H = ALTO - 48;
  ctx.save(); rect(ctx, X, Y, W, H, 22); ctx.clip();
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(X, Y, W, H);

  // Encabezado azul + banda roja (igual que el correo)
  ctx.fillStyle = '#00295A'; ctx.fillRect(X, Y, W, 120);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 54px ${F}`; ctx.fillText('Sistema RCMA', X + 50, Y + 64);
  ctx.fillStyle = '#94A3B8'; ctx.font = `28px ${F}`; ctx.fillText('Coordinación de Obras — Colegios Mano Amiga', X + 50, Y + 102);
  ctx.fillStyle = '#DC2626'; ctx.fillRect(X, Y + 120, W, 110);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 50px ${F}`;
  ctx.fillText(renglones(ctx, `⊘ Ticket MAS Cancelado${d.folio ? ` — ${d.folio}` : ''}`, W - 100, 1)[0], X + 50, Y + 193);

  // Detalles
  const TX = X + 50, TW = W - 100, COL = 300, FILA = 92;
  let ty = Y + 262;
  const filas: [string, string][] = [
    ['COLEGIO', d.colegio || '—'],
    ['PROYECTO', d.proyecto || '—'],
    ['FECHA', fechaLarga(d.fecha)],
  ];
  filas.forEach(([k, v], i) => {
    ctx.fillStyle = i % 2 === 0 ? '#F8FAFC' : '#FFFFFF'; ctx.fillRect(TX, ty, TW, FILA);
    ctx.fillStyle = '#E2E8F0'; ctx.fillRect(TX, ty + FILA - 2, TW, 2);
    ctx.fillStyle = '#64748B'; ctx.font = `bold 30px ${F}`; ctx.fillText(k, TX + 24, ty + 58);
    ctx.fillStyle = '#0F172A'; ctx.font = `38px ${F}`;
    ctx.fillText(renglones(ctx, v, TW - COL - 30, 1)[0], TX + COL, ty + 60);
    ty += FILA;
  });
  // Motivo: lo más importante, ocupa el resto de la tarjeta
  const finY = Y + H - 30;
  ctx.fillStyle = '#FEE2E2'; ctx.fillRect(TX, ty, TW, finY - ty);
  ctx.fillStyle = '#DC2626'; ctx.font = `bold 32px ${F}`; ctx.fillText('MOTIVO DE CANCELACIÓN', TX + 24, ty + 54);
  ctx.font = `bold 44px ${F}`;
  renglones(ctx, d.motivo || 'Sin motivo registrado.', TW - 48, Math.floor((finY - ty - 90) / 56))
    .forEach((l, i) => ctx.fillText(l, TX + 24, ty + 118 + i * 56));
  ctx.restore();

  const blob: Blob = await new Promise((ok, mal) => canvas.toBlob(b => (b ? ok(b) : mal(new Error('No se pudo generar la imagen'))), 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ancho: ANCHO, alto: ALTO };
}
