import React, { useRef } from 'react';
import { Printer, X } from 'lucide-react';

export default function ReportViewer({ report, onClose }) {
  const contentRef = useRef(null);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
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
      <body>${report?.content_html || ''}</body>
      </html>
    `);
    printWindow.document.close();
    // Pequeño delay para asegurar que el contenido cargue antes de imprimir
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  if (!report) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        
        {/* Header del Reporte */}
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
            <button 
              onClick={handlePrint} 
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-md text-sm font-medium hover:bg-slate-700 transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" /> 
              <span>Imprimir</span>
            </button>
            
            <button 
              onClick={onClose} 
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Contenido del Reporte */}
        <div className="flex-1 overflow-y-auto p-8">
          <div
            ref={contentRef}
            className="prose prose-slate max-w-none 
              prose-headings:text-slate-900 
              prose-th:bg-slate-100 prose-th:p-3 prose-td:p-3 prose-table:border"
            dangerouslySetInnerHTML={{ 
              __html: report.content_html || '<p class="text-center text-slate-500">Reporte sin contenido disponible</p>' 
            }}
          />
        </div>

        {/* Footer del Modal */}
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