import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

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
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #2563eb; color: white; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>${report?.content_html || ''}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (!report) return null;

  return (
    <Dialog open={!!report} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="https://media.base44.com/images/public/69d55a044cd0ffb90a373c25/ef4d204a2_images-Photoroom.png" alt="Mano Amiga" className="h-10 w-auto" />
              <DialogTitle>{report.title}</DialogTitle>
            </div>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" /> Imprimir
            </Button>
          </div>
        </DialogHeader>
        <div
          ref={contentRef}
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: report.content_html || '<p>Reporte sin contenido</p>' }}
        />
      </DialogContent>
    </Dialog>
  );
}