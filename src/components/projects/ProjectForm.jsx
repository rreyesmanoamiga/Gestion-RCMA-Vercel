import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Save, X } from 'lucide-react';

// DATOS EXACTOS DE TU EXCEL "Reencuentro y Gestión de Tareas"
const TERRITORIOS_DATA = {
  NORTE: [
    { colegio: 'CEC VAC', eco: 'JUAN CARLOS MURILLO' },
    { colegio: 'CEC CHIHUAHUA', eco: 'JUAN CARLOS MURILLO' },
    { colegio: 'CEC NUEVO LAREDO', eco: 'JUAN CARLOS MURILLO' },
    { colegio: 'CEC SALTILLO', eco: 'JUAN CARLOS MURILLO' }
  ],
  MEXICO: [
    { colegio: 'CEC SUR', eco: 'ALMA DELIA' },
    { colegio: 'CEC PROYECTO', eco: 'ALMA DELIA' },
    { colegio: 'CEC PRIMARIA', eco: 'JOSE LUIS RAMIREZ' },
    { colegio: 'CEC COACALCO', eco: 'JOSE LUIS RAMIREZ' }
  ],
  FMA: [
    { colegio: 'CMA COACALCO', eco: '-' },
    { colegio: 'CMA COAPA', eco: '-' },
    { colegio: 'CMA TAXQUEÑA', eco: '-' },
    { colegio: 'CMA PUEBLA', eco: '-' }
  ]
};

export default function ProjectForm({ open, onClose, onSubmit, project }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    territorio: '',
    colegio: '',
    eco: '',
    type: 'mantenimiento',
    status: 'planificado',
    priority: 'media',
    location: '',
    responsible: '',
    start_date: '',
    end_date: '',
    budget: '',
    progress: 0,
    ticket_number: '',
    notes: ''
  });

  useEffect(() => {
    if (project) {
      setForm({
        ...project,
        // Aseguramos que los valores numéricos no rompan los inputs
        budget: project.budget || '',
        progress: project.progress || 0,
        ticket_number: project.ticket_number || ''
      });
    }
  }, [project, open]);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleTerritorioChange = (v) => {
    setForm(prev => ({
      ...prev,
      territorio: v,
      colegio: '', // Limpiar selección anterior
      eco: ''
    }));
  };

  const handleColegioChange = (v) => {
    const info = TERRITORIOS_DATA[form.territorio]?.find(c => c.colegio === v);
    setForm(prev => ({
      ...prev,
      colegio: v,
      location: v, // Sincronizamos con location para la DB
      eco: info ? info.eco : ''
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ 
      ...form, 
      budget: form.budget ? Number(form.budget) : 0, 
      progress: Number(form.progress) || 0,
      ticket_number: form.ticket_number ? String(form.ticket_number) : null
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900">
            {project ? 'Editar Proyecto' : 'Nuevo Proyecto'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          
          {/* SECCIÓN DE UBICACIÓN (CASCADA) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase text-slate-500">Territorio</Label>
              <Select value={form.territorio} onValueChange={handleTerritorioChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Zona..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORTE">NORTE</SelectItem>
                  <SelectItem value="MEXICO">MEXICO</SelectItem>
                  <SelectItem value="FMA">FMA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-slate-500">Colegio / Sede</Label>
              <Select 
                value={form.colegio} 
                onValueChange={handleColegioChange}
                disabled={!form.territorio}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Colegio..." /></SelectTrigger>
                <SelectContent>
                  {form.territorio && TERRITORIOS_DATA[form.territorio].map(c => (
                    <SelectItem key={c.colegio} value={c.colegio}>{c.colegio}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* INDICADOR ECO AUTOMÁTICO */}
          {form.eco && (
            <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 flex justify-between items-center">
              <span className="text-xs font-bold text-blue-700 uppercase">Responsable ECO:</span>
              <span className="text-sm font-semibold text-blue-900">{form.eco}</span>
            </div>
          )}

          <div>
            <Label className="text-xs font-bold uppercase text-slate-500">Nombre del Proyecto *</Label>
            <Input 
              value={form.name} 
              onChange={e => update('name', e.target.value)} 
              required 
              placeholder="Ej: Impermeabilización General" 
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase text-slate-500">Tipo</Label>
              <Select value={form.type} onValueChange={v => update('type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                  <SelectItem value="construccion">Construcción</SelectItem>
                  <SelectItem value="remodelacion">Remodelación</SelectItem>
                  <SelectItem value="adecuacion">Adecuación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-slate-500">Prioridad</Label>
              <Select value={form.priority} onValueChange={v => update('priority', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
              <Label className="text-xs font-bold uppercase text-slate-500">Responsable Ejecución</Label>
              <Input 
                value={form.responsible} 
                onChange={e => update('responsible', e.target.value)} 
                placeholder="Persona/Empresa"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-slate-500">Presupuesto (MXN)</Label>
              <Input 
                type="number" 
                value={form.budget} 
                onChange={e => update('budget', e.target.value)} 
                placeholder="0.00"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-bold uppercase text-slate-500">Ticket # (Opcional)</Label>
              <div className="relative mt-1">
                <Input 
                  type="number" 
                  value={form.ticket_number} 
                  onChange={e => update('ticket_number', e.target.value)} 
                  placeholder="Ej: 42"
                />
                {form.ticket_number && (
                  <p className="mt-1 text-[10px] font-bold text-red-600">
                    ID: TCMM{String(form.ticket_number).padStart(4, '0')}
                  </p>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs font-bold uppercase text-slate-500">Avance (%)</Label>
              <Input 
                type="number" 
                max="100" 
                value={form.progress} 
                onChange={e => update('progress', e.target.value)} 
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs font-bold uppercase text-slate-500">Descripción / Notas</Label>
            <Textarea 
              value={form.description} 
              onChange={e => update('description', e.target.value)} 
              className="mt-1" 
              rows={2} 
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-slate-900 text-white hover:bg-slate-800">
              <Save className="w-4 h-4 mr-2" />
              {project ? 'Guardar Cambios' : 'Crear Proyecto'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}