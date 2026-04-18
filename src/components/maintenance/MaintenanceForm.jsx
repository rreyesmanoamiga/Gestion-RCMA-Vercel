import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PhotoUploader from '@/components/shared/PhotoUploader';
import ColegioSelector from '@/components/shared/ColegioSelector';

export default function MaintenanceForm({ open, onClose, onSubmit, record, projects = [] }) {
  const [form, setForm] = useState(record || {
    territorio: '', colegio: '', project_id: '', title: '', type: 'preventivo', status: 'pendiente',
    priority: 'media', location: '', description: '', scheduled_date: '',
    completed_date: '', responsible: '', cost: '', materials_used: '',
    findings: '', actions_taken: '', photos_before: [], photos_after: [],
    next_maintenance_date: '', notes: ''
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ ...form, cost: form.cost ? Number(form.cost) : undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? 'Editar Mantenimiento' : 'Nuevo Mantenimiento'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ColegioSelector
            territorio={form.territorio}
            colegio={form.colegio}
            onTerritorioChange={v => update('territorio', v)}
            onColegioChange={v => update('colegio', v)}
          />
          <div>
            <Label>Título *</Label>
            <Input value={form.title} onChange={e => update('title', e.target.value)} required placeholder="Ej: Mantenimiento preventivo de techos" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={form.type} onValueChange={v => update('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preventivo">Preventivo</SelectItem>
                  <SelectItem value="correctivo">Correctivo</SelectItem>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Proyecto asociado</Label>
              <Select value={form.project_id || 'none'} onValueChange={v => update('project_id', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin proyecto</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ubicación</Label>
              <Input value={form.location} onChange={e => update('location', e.target.value)} placeholder="Ubicación" />
            </div>
          </div>

          <div>
            <Label>Descripción</Label>
            <Textarea value={form.description} onChange={e => update('description', e.target.value)} rows={3} placeholder="Descripción del mantenimiento..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha Programada</Label>
              <Input type="date" value={form.scheduled_date} onChange={e => update('scheduled_date', e.target.value)} />
            </div>
            <div>
              <Label>Responsable</Label>
              <Input value={form.responsible} onChange={e => update('responsible', e.target.value)} placeholder="Nombre" />
            </div>
          </div>

          {record && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Estado</Label>
                  <Select value={form.status} onValueChange={v => update('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="en_progreso">En Progreso</SelectItem>
                      <SelectItem value="completado">Completado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fecha de Completado</Label>
                  <Input type="date" value={form.completed_date} onChange={e => update('completed_date', e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Hallazgos</Label>
                <Textarea value={form.findings} onChange={e => update('findings', e.target.value)} rows={2} placeholder="Hallazgos encontrados..." />
              </div>
              <div>
                <Label>Acciones Realizadas</Label>
                <Textarea value={form.actions_taken} onChange={e => update('actions_taken', e.target.value)} rows={2} placeholder="Acciones tomadas..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Costo</Label>
                  <Input type="number" value={form.cost} onChange={e => update('cost', e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <Label>Materiales Usados</Label>
                  <Input value={form.materials_used} onChange={e => update('materials_used', e.target.value)} placeholder="Materiales" />
                </div>
              </div>
              <div>
                <Label>Próximo Mantenimiento</Label>
                <Input type="date" value={form.next_maintenance_date} onChange={e => update('next_maintenance_date', e.target.value)} />
              </div>
            </>
          )}

          <PhotoUploader photos={form.photos_before || []} onChange={photos => update('photos_before', photos)} label="Fotos Antes" />
          <PhotoUploader photos={form.photos_after || []} onChange={photos => update('photos_after', photos)} label="Fotos Después" />

          <div>
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} placeholder="Notas adicionales..." />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{record ? 'Guardar Cambios' : 'Crear Registro'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}