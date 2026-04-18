import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import StatusBadge from '@/components/shared/StatusBadge';
import ReportForm from '@/components/reports/ReportForm';
import ReportViewer from '@/components/reports/ReportViewer';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function Reports() {
  const [showForm, setShowForm] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);
  const queryClient = useQueryClient();

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => db.Report.list('-created_at', 50),
  });

  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => db.Project.list('-created_at', 100) });
  const { data: checklists = [] } = useQuery({ queryKey: ['checklists'], queryFn: () => db.Checklist.list('-created_at', 100) });
  const { data: maintenance = [] } = useQuery({ queryKey: ['maintenance'], queryFn: () => db.MaintenanceRecord.list('-created_at', 100) });

  const createMutation = useMutation({
    mutationFn: async (formData) => {
      // Create report record first
      const report = await db.Report.create(formData);
      setGeneratingId(report.id);

      // Generate report content using LLM
      const contextData = {
        projects: projects.filter(p => {
          if (formData.date_from && p.start_date < formData.date_from) return false;
          if (formData.date_to && p.start_date > formData.date_to) return false;
          return true;
        }),
        checklists: formData.report_type === 'inspecciones' || formData.report_type === 'general' ? checklists : [],
        maintenance: formData.report_type === 'mantenimiento' || formData.report_type === 'general' ? maintenance : [],
      };

      const llmResponse = await base44.integrations.Core.InvokeLLM({
        prompt: `Genera un reporte profesional en HTML para Colegios Mano Amiga.

Título: ${formData.title}
Tipo: ${formData.report_type}
Preparado por: ${formData.prepared_by || 'Departamento de Mantenimiento'}
Dirigido a: ${formData.directed_to || 'Dirección General'}
Resumen solicitado: ${formData.summary || 'Reporte general'}
Período: ${formData.date_from || 'N/A'} a ${formData.date_to || 'N/A'}

Datos disponibles:
- Proyectos (${contextData.projects.length}): ${JSON.stringify(contextData.projects.map(p => ({ nombre: p.name, estado: p.status, tipo: p.type, avance: p.progress, ubicacion: p.location })))}
- Inspecciones (${contextData.checklists.length}): ${JSON.stringify(contextData.checklists.map(c => ({ titulo: c.title, tipo: c.infrastructure_type, estado: c.overall_status, items: c.items?.length, fecha: c.inspection_date })))}
- Mantenimientos (${contextData.maintenance.length}): ${JSON.stringify(contextData.maintenance.map(m => ({ titulo: m.title, tipo: m.type, estado: m.status, prioridad: m.priority, fecha: m.scheduled_date })))}

Genera contenido HTML profesional con tablas, secciones claras, estadísticas resumen, y recomendaciones. El HTML debe ser limpio y bien estructurado con estilos inline para impresión. Usa colores azul corporativo (#2563eb) y naranja (#f97316) de Mano Amiga. Incluye:
1. Encabezado con el logo de Mano Amiga usando esta imagen: <img src="https://media.base44.com/images/public/69d55a044cd0ffb90a373c25/ef4d204a2_images-Photoroom.png" style="height:80px;" alt="Mano Amiga Logo" /> y el texto "Colegios Mano Amiga" y "Juntos Transformando Vidas"
2. Información del reporte (fecha, preparado por, dirigido a)
3. Resumen ejecutivo
4. Detalle según tipo de reporte
5. Estadísticas y métricas clave
6. Conclusiones y recomendaciones
Solo devuelve el HTML, sin markdown ni bloques de código.`,
      });

      await db.Report.update(report.id, {
        content_html: llmResponse,
        status: 'finalizado'
      });

      setGeneratingId(null);
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setShowForm(false);
    },
    onError: () => setGeneratingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.Report.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  const reportTypeLabels = {
    proyectos: 'Proyectos',
    mantenimiento: 'Mantenimiento',
    inspecciones: 'Inspecciones',
    general: 'General'
  };

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Genera reportes para presentar a las autoridades" actionLabel="Generar Reporte" onAction={() => setShowForm(true)} />

      {generatingId && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-3 mb-6">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <p className="text-sm text-primary font-medium">Generando reporte, por favor espere...</p>
        </div>
      )}

      {reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No hay reportes"
          description="Genera un reporte con los datos de tus proyectos, inspecciones y mantenimientos."
          actionLabel="Generar Reporte"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {reports.map(report => (
            <div key={report.id} className="bg-card rounded-xl border border-border p-5 hover:shadow-lg transition-all duration-300">
              <div className="flex items-start justify-between mb-3">
                <StatusBadge status={report.status} />
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {reportTypeLabels[report.report_type] || report.report_type}
                </span>
              </div>
              <h3 className="font-semibold text-foreground mb-1">{report.title}</h3>
              {report.directed_to && <p className="text-xs text-muted-foreground mb-1">Para: {report.directed_to}</p>}
              <p className="text-xs text-muted-foreground mb-4">
                {report.created_date ? format(new Date(report.created_date), 'dd MMM yyyy', { locale: es }) : ''}
              </p>
              <div className="flex gap-2">
                {report.status === 'finalizado' && (
                  <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => setViewingReport(report)}>
                    <Eye className="w-3.5 h-3.5" /> Ver
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar reporte?</AlertDialogTitle>
                      <AlertDialogDescription>Esta acción no se puede deshacer. El reporte "{report.title}" será eliminado permanentemente.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate(report.id)}>Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <ReportForm open={showForm} onClose={() => setShowForm(false)} onSubmit={data => createMutation.mutate(data)} isGenerating={!!generatingId} />
      <ReportViewer report={viewingReport} onClose={() => setViewingReport(null)} />
    </div>
  );
}