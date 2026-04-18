import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import PhotoUploader from '@/components/shared/PhotoUploader';
import ColegioSelector from '@/components/shared/ColegioSelector';

const CONCRETE_ITEMS = [
  'Fisuras / Grietas', 'Desprendimiento', 'Corrosión de armadura', 'Eflorescencia',
  'Humedad / Filtraciones', 'Deformaciones', 'Juntas de dilatación', 'Acabado superficial'
];

const METALLIC_ITEMS = [
  'Corrosión / Oxidación', 'Deformaciones', 'Soldaduras', 'Conexiones / Pernos',
  'Pintura / Recubrimiento', 'Anclajes', 'Vibraciones anormales', 'Alineamiento'
];

export default function ChecklistForm({ open, onClose, onSubmit, checklist, projects = [] }) {
  const defaultItems = (type) => {
    const elements = type === 'concreto' ? CONCRETE_ITEMS : METALLIC_ITEMS;
    return elements.map(el => ({ element: el, condition: 'bueno', observations: '', photo_url: '' }));
  };

  const [form, setForm] = useState(checklist || {
    territorio: '', colegio: '', project_id: '', title: '', infrastructure_type: 'concreto',
    location: '', inspector: '', inspection_date: new Date().toISOString().split('T')[0],
    overall_status: 'bueno', items: defaultItems('concreto'),
    general_observations: '', photos: []
  });

  const update = (field, value) => {
    if (field === 'infrastructure_type' && !checklist) {
      setForm(prev => ({ ...prev, [field]: value, items: defaultItems(value) }));
    } else {
      setForm(prev => ({ ...prev, [field]: value }));
    }
  };

  const updateItem = (index, field, value) => {
    const newItems = [...form.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setForm(prev => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { element: '', condition: 'bueno', observations: '', photo_url: '' }]
    }));
  };

  const removeItem = (index) => {
    setForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{checklist ? 'Editar Checklist' : 'Nueva Inspección'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <ColegioSelector
            territorio={form.territorio}
            colegio={form.colegio}
            onTerritorioChange={v => update('territorio', v)}
            onColegioChange={v => update('colegio', v)}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Título *</Label>
              <Input value={form.title} onChange={e => update('title', e.target.value)} required placeholder="Ej: Inspección columnas Edificio A" />
            </div>
            <div>
              <Label>Tipo de Infraestructura *</Label>
              <Select value={form.infrastructure_type} onValueChange={v => update('infrastructure_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concreto">Concreto</SelectItem>
                  <SelectItem value="metalica">Metálica</SelectItem>
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
              <Input value={form.location} onChange={e => update('location', e.target.value)} placeholder="Ubicación de inspección" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Inspector</Label>
              <Input value={form.inspector} onChange={e => update('inspector', e.target.value)} placeholder="Nombre del inspector" />
            </div>
            <div>
              <Label>Fecha de Inspección</Label>
              <Input type="date" value={form.inspection_date} onChange={e => update('inspection_date', e.target.value)} />
            </div>
          </div>

          {/* Inspection Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-semibold">Elementos de Inspección</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1">
                <Plus className="w-3.5 h-3.5" /> Agregar
              </Button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, i) => (
                <div key={i} className="p-3 bg-muted/50 rounded-lg border border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={item.element}
                      onChange={e => updateItem(i, 'element', e.target.value)}
                      placeholder="Elemento"
                      className="flex-1"
                    />
                    <Select value={item.condition} onValueChange={v => updateItem(i, 'condition', v)}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bueno">Bueno</SelectItem>
                        <SelectItem value="regular">Regular</SelectItem>
                        <SelectItem value="malo">Malo</SelectItem>
                        <SelectItem value="critico">Crítico</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)} className="text-destructive shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Input
                    value={item.observations}
                    onChange={e => updateItem(i, 'observations', e.target.value)}
                    placeholder="Observaciones..."
                    className="text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Estado General</Label>
            <Select value={form.overall_status} onValueChange={v => update('overall_status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bueno">Bueno</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="malo">Malo</SelectItem>
                <SelectItem value="critico">Crítico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Observaciones Generales</Label>
            <Textarea value={form.general_observations} onChange={e => update('general_observations', e.target.value)} rows={3} placeholder="Observaciones generales de la inspección..." />
          </div>

          <PhotoUploader photos={form.photos || []} onChange={photos => update('photos', photos)} label="Evidencia Fotográfica" />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">{checklist ? 'Guardar Cambios' : 'Crear Checklist'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}