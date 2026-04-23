import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

const INITIAL_FORM = {
  title:       '',
  report_type: 'general',
  date_from:   '',
  date_to:     '',
  prepared_by: '',
  directed_to: '',
  summary:     '',
};

export default function ReportForm({ open, onClose, onSubmit, isGenerating }) {
  const [form, setForm] = useState(INITIAL_FORM);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // Reset al cerrar — evita estado sucio al reabrir el formulario
  const handleClose = () => {
    setForm(INITIAL_FORM);
    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generar Nuevo Reporte</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <Label htmlFor="report-title">Título del Reporte *</Label>
            <Input
              id="report-title"
              value={form.title}
              onChange={e => update('title', e.target.value)}
              required
              placeholder="Ej: Reporte Mensual de Mantenimiento - Marzo 2026"
            />
          </div>

          <div>
            <Label htmlFor="report-type">Tipo de Reporte</Label>
            <Select value={form.report_type} onValueChange={v => update('report_type', v)}>
              <SelectTrigger id="report-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General (Todo)</SelectItem>
                <SelectItem value="proyectos">Proyectos</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                <SelectItem value="inspecciones">Inspecciones</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date-from">Desde</Label>
              <Input
                id="date-from"
                type="date"
                value={form.date_from}
                onChange={e => update('date_from', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="date-to">Hasta</Label>
              <Input
                id="date-to"
                type="date"
                value={form.date_to}
                onChange={e => update('date_to', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="prepared-by">Preparado por</Label>
              <Input
                id="prepared-by"
                value={form.prepared_by}
                onChange={e => update('prepared_by', e.target.value)}
                placeholder="Tu nombre"
              />
            </div>
            <div>
              <Label htmlFor="directed-to">Dirigido a</Label>
              <Input
                id="directed-to"
                value={form.directed_to}
                onChange={e => update('directed_to', e.target.value)}
                placeholder="Ej: Director General"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="summary">Resumen / Enfoque del reporte</Label>
            <Textarea
              id="summary"
              value={form.summary}
              onChange={e => update('summary', e.target.value)}
              rows={3}
              placeholder="Describe qué quieres que el reporte destaque..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isGenerating}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isGenerating} className="gap-2">
              {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
              {isGenerating ? 'Generando...' : 'Generar Reporte'}
            </Button>
          </div>

        </form>
      </DialogContent>
    </Dialog>
  );
}