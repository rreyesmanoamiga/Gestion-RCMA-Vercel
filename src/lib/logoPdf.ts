// Logo para PDFs (jsPDF).
//
// /logo.png es un lienzo ancho (612×367) con mucho espacio transparente a los
// lados. Los PDFs lo colocan en una caja cuadrada (22×22, 26×26, 28×24…), así que
// se veía aplastado. Esta función recorta el espacio vacío y devuelve el logo
// centrado en un lienzo CUADRADO con el mismo margen que tenía el logo anterior
// (el dibujo ocupa ~80 % de la caja), para que todos los PDFs se vean como antes.

export function logoCuadradoDataURL(img: HTMLImageElement): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sctx = src.getContext('2d')!;
  sctx.drawImage(img, 0, 0);

  // Área con contenido (píxeles no transparentes)
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  try {
    const d = sctx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
  } catch {
    return src.toDataURL('image/png');
  }
  if (x1 < 0) return src.toDataURL('image/png');

  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const lado = Math.round(Math.max(cw, ch) / 0.8);
  const out = document.createElement('canvas');
  out.width = lado; out.height = lado;
  out.getContext('2d')!.drawImage(src, x0, y0, cw, ch, Math.round((lado - cw) / 2), Math.round((lado - ch) / 2), cw, ch);
  return out.toDataURL('image/png');
}
