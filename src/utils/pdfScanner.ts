// src/utils/pdfScanner.ts
import * as pdfjsLib from 'pdfjs-dist';

// pdfjs-dist v4/v5 requiere .mjs — el error original era usar .min.js (formato v2/v3)
// unpkg garantiza que la versión del worker coincida exactamente con la instalada
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const extraerTextoDePDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let textoCompleto = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as any[];
    let lastY: number | null = null;

    for (const item of items) {
      if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
        textoCompleto += '\n';
      }
      textoCompleto += item.str + ' ';
      lastY = item.transform[5];
    }
    textoCompleto += '\n--- PÁGINA ' + i + ' ---\n';
  }

  return textoCompleto.trim();
};