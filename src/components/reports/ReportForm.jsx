import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

export default function ReportForm({ open, onClose, onSubmit, isGenerating }) {
  const [form, setForm] = useState({
    title: '', report_type: 'general', date_from: '', date_to: '',
    prepared_by: '', directed_to: '', summary: ''
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generar Nuevo Reporte</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Título del Reporte *</Label>
            <Input value={form.title} onChange={e => update('title', e.target.value)} required placeholder="Ej: Reporte Mensual de Mantenimiento - Marzo 2026" />
          </div>
          <div>
            <Label>Tipo de Reporte</Label>
            <Select value={form.report_type} onValueChange={v => update('report_type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
              <Label>Desde</Label>
              <Input type="date" value={form.date_from} onChange={e => update('date_from', e.target.value)} />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={form.date_to} onChange={e => update('date_to', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Preparado por</Label>
              <Input value={form.prepared_by} onChange={e => update('prepared_by', e.target.value)} placeholder="Tu nombre" />
            </div>
            <div>
              <Label>Dirigido a</Label>
              <Input value={form.directed_to} onChange={e => update('directed_to', e.target.value)} placeholder="Ej: Director General" />
            </div>
          </div>
          <div>
            <Label>Resumen / Enfoque del reporte</Label>
            <Textarea value={form.summary} onChange={e => update('summary', e.target.value)} rows={3} placeholder="Describe qué quieres que el reporte destaque..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isGenerating}>Cancelar</Button>
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