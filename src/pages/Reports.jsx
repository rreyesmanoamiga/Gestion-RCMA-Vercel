import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; // Cambiado a Supabase
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
      // 1. Crear el registro del reporte en la base de datos
      const report = await db.Report.create({
        ...formData,
        status: 'generando'
      });
      setGeneratingId(report.id);

      // 2. Filtrar datos para el contenido del reporte
      const filteredProjects = projects.filter(p => {
        if (formData.date_from && p.start_date < formData.date_from) return false;
        if (formData.date_to && p.start_date > formData.date_to) return false;
        return true;
      });

      // 3. Generar el HTML del reporte (Sustituyendo al LLM de Base44)
      const reportHtml = `
        <div style="font-family: Arial, sans-serif; color: #334155; max-width: 800px; margin: auto; border: 1px solid #e2e8f0; padding: 40px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 20px;">
            <img src="https://media.base44.com/images/public/69d55a044cd0ffb90a373c25/ef4d204a2_images-Photoroom.png" style="height:60px;" alt="Logo" />
            <div style="text-align: right;">
              <h1 style="color: #2563eb; margin: 0; font-size: 24px;">Colegios Mano Amiga</h1>
              <p style="color: #f97316; margin: 0; font-weight: bold;">Juntos Transformando Vidas</p>
            </div>
          </div>
          
          <h2 style="text-align: center; text-transform: uppercase;">${formData.title}</h2>
          
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <p><strong>Tipo de Reporte:</strong> ${formData.report_type}</p>
            <p><strong>Preparado por:</strong> ${formData.prepared_by || 'Departamento de Mantenimiento'}</p>
            <p><strong>Dirigido a:</strong> ${formData.directed_to || 'Dirección General'}</p>
            <p><strong>Fecha:</strong> ${format(new Date(), 'dd/MM/yyyy')}</p>
          </div>

          <h3>Resumen Ejecutivo</h3>
          <p>${formData.summary || 'Sin resumen adicional.'}</p>

          <h3>Detalle de Actividades</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead>
              <tr style="background: #2563eb; color: white;">
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Actividad / Proyecto</th>
                <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${filteredProjects.map(p => `
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;">${p.name}</td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${p.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8;">
            Este es un reporte oficial generado por el Sistema de Gestión de Obras y Mantenimiento RCMA.
          </div>
        </div>
      `;

      // 4. Actualizar el registro con el HTML generado
      await db.Report.update(report.id, {
        content_html: reportHtml,
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
          <p className="text-sm text-primary font-medium">Generando reporte RCMA, por favor espere...</p>
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