import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ColegioSelector from '@/components/shared/ColegioSelector';
import { getColegioInfo } from '@/lib/colegios';

export default function ProjectForm({ open, onClose, onSubmit, project }) {
  const [form, setForm] = useState(project || {
    territorio: '', colegio: '', name: '', description: '', location: '',
    type: 'construccion', status: 'planificado', priority: 'media',
    start_date: '', end_date: '', responsible: '', budget: '', progress: 0, notes: '', ticket_number: '', eco: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ ...form, budget: form.budget ? Number(form.budget) : undefined, progress: Number(form.progress) || 0 });
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleColegioChange = (colegio) => {
    const info = getColegioInfo(colegio);
    setForm(prev => ({
      ...prev,
      colegio,
      territorio: info ? info.territorio : prev.territorio,
      eco: info ? info.eco : '',
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? 'Editar Proyecto' : 'Nuevo Proyecto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ColegioSelector
            territorio={form.territorio}
            colegio={form.colegio}
            onTerritorioChange={v => update('territorio', v)}
            onColegioChange={handleColegioChange}
          />
          {form.eco && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm">
              <span className="font-semibold text-blue-700">ECO: </span>
              <span className="text-blue-900">{form.eco}</span>
            </div>
          )}
          <div>
            <Label>Nombre del Proyecto *</Label>
            <Input value={form.name} onChange={e => update('name', e.target.value)} required placeholder="Ej: Reparación de techo Edificio A" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={v => update('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="construccion">Construcción</SelectItem>
                  <SelectItem value="remodelacion">Remodelación</SelectItem>
                  <SelectItem value="adecuacion">Adecuación</SelectItem>
                  <SelectItem value="mejora">Mejora</SelectItem>
                  <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                  <SelectItem value="portafolio">Portafolio</SelectItem>
                  <SelectItem value="garantias">Garantías</SelectItem>
                  <SelectItem value="revision">Revisión</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridad</Label>
              <Select value={form.priority} onValueChange={v => update('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Ubicación</Label>
            <Input value={form.location} onChange={e => update('location', e.target.value)} placeholder="Ej: Campus Norte, Edificio B" />
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={form.description} onChange={e => update('description', e.target.value)} placeholder="Descripción detallada del proyecto..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha de Inicio</Label>
              <Input type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)} />
            </div>
            <div>
              <Label>Fecha de Fin</Label>
              <Input type="date" value={form.end_date} onChange={e => update('end_date', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Responsable</Label>
              <Select value={form.responsible} onValueChange={v => update('responsible', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANO AMIGA SERVICIOS">Mano Amiga Servicios</SelectItem>
                  <SelectItem value="MA COLEGIO">MA Colegio</SelectItem>
                  <SelectItem value="PROVEEDOR">Proveedor</SelectItem>
                  <SelectItem value="ECO">Eco</SelectItem>
                  <SelectItem value="JURIDICO">Jurídico</SelectItem>
                  <SelectItem value="INMOBILIARIA">Inmobiliaria</SelectItem>
                  <SelectItem value="RECAUDACIÓN">Recaudación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Presupuesto (MXN)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.budget}
                  onChange={e => update('budget', e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
              {form.budget && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {Number(form.budget).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ticket #</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  value={form.ticket_number}
                  onChange={e => update('ticket_number', e.target.value)}
                  placeholder="Ej: 42"
                />
                {form.ticket_number && (
                  <p className="mt-1 text-sm font-bold text-red-600">
                    TCMM{String(form.ticket_number).padStart(4, '0')}
                  </p>
                )}
              </div>
            </div>
          </div>
          {project && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={v => update('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_iniciado">No Se Ha Iniciado</SelectItem>
                    <SelectItem value="en_curso">En Curso</SelectItem>
                    <SelectItem value="completado">Completado</SelectItem>
                    <SelectItem value="necesita_revision">Necesita Revisión</SelectItem>
                    <SelectItem value="aprobado">Aprobado</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="en_espera">En Espera</SelectItem>
                    <SelectItem value="en_proceso_cierre">En Proceso de Cierre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Avance (%)</Label>
                <Input type="number" min="0" max="100" value={form.progress} onChange={e => update('progress', e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} placeholder="Notas adicionales..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{project ? 'Guardar Cambios' : 'Crear Proyecto'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}