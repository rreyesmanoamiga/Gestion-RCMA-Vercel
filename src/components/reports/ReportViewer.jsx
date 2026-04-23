import React from 'react';
import { Printer, X } from 'lucide-react';
import DOMPurify from 'dompurify';

// Botones fuera del componente — se definen una sola vez
const btnPrint = "flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-medium hover:bg-slate-700 transition-colors shadow-sm";
const btnClose = "p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all";

export default function ReportViewer({ report, onClose }) {
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');

    // Guard — popup puede estar bloqueado por el navegador
    if (!printWindow) {
      alert('Por favor permite las ventanas emergentes para poder imprimir.');
      return;
    }

    // Sanitizar antes de inyectar en la ventana de impresión
    const safeHTML = DOMPurify.sanitize(report?.content_html || '');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>${report?.title || 'Reporte'}</title>
        <style>
          body { font-family: 'Inter', Arial, sans-serif; margin: 20px; color: #1a1a2e; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          th { background-color: #1e293b; color: white; }
          h1, h2, h3 { color: #0f172a; }
          @media print {
            body { margin: 1cm; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>${safeHTML}</body>
      </html>
    `);
    printWindow.document.close();

    // onload en lugar de setTimeout — dispara cuando el contenido realmente cargó
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    };
  };

  if (!report) return null;

  // Sanitizar el HTML del reporte antes de inyectarlo en el DOM
  const safeContent = DOMPurify.sanitize(
    report.content_html || '<p class="text-center text-slate-500">Reporte sin contenido disponible</p>'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-lg">
          <div className="flex items-center gap-4">
            <img
              src="https://media.base44.com/images/public/69d55a044cd0ffb90a373c25/ef4d204a2_images-Photoroom.png"
              alt="Mano Amiga"
              className="h-10 w-auto"
            />
            <h2 className="text-xl font-bold text-slate-800">{report.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className={btnPrint}>
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
            <button onClick={onClose} className={btnClose} aria-label="Cerrar">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Contenido sanitizado */}
        <div className="flex-1 overflow-y-auto p-8">
          <div
            className="prose prose-slate max-w-none
              prose-headings:text-slate-900
              prose-th:bg-slate-100 prose-th:p-3 prose-td:p-3 prose-table:border"
            dangerouslySetInnerHTML={{ __html: safeContent }}
          />
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 text-right rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
          >
            Cerrar Vista Previa
          </button>
        </div>
      </div>
    </div>
  );
}