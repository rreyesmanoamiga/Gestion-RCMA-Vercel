import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { COLEGIOS } from '@/lib/colegios';
import ColegioSelector from '@/components/shared/ColegioSelector';

const inputClass  = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const labelClass  = "block text-xs font-bold text-slate-500 uppercase mb-1 mt-3";
const selectClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";

export const MATERIALES = [
  'Pétreos (piedra, arena, arcilla)',
  'Metálicos (acero, aluminio)',
  'Aglomerantes (cemento, cal, yeso)',
  'Cerámicos (ladrillos, azulejos)',
  'Madera',
  'Sintéticos (plásticos, aislantes)',
];

export const ESTADOS_ITEM = ['Bueno', 'Regular', 'Malo', 'Crítico'];

export interface ChecklistItem {
  nombre:      string;
  estado:      string;
  observacion: string;
}

interface FormData {
  titulo:      string;
  inspector:   string;
  fecha:       string;
  territorio:  string;
  colegio:     string;
  eco:         string;
  material:    string;
  descripcion: string;
  items:       ChecklistItem[];
}

const EMPTY_ITEM: ChecklistItem = { nombre: '', estado: 'Bueno', observacion: '' };

const INITIAL_FORM: FormData = {
  titulo:      '',
  inspector:   '',
  fecha:       new Date().toISOString().split('T')[0],
  territorio:  '',
  colegio:     '',
  eco:         '',
  material:    '',
  descripcion: '',
  items:       [{ ...EMPTY_ITEM }],
};

export const calcularEstadoGeneral = (items: ChecklistItem[]): string => {
  if (!items.length) return 'bueno';
  const orden = ['Bueno', 'Regular', 'Malo', 'Crítico'];
  let peor = 0;
  items.forEach(item => {
    const idx = orden.indexOf(item.estado);
    if (idx > peor) peor = idx;
  });
  return orden[peor].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

interface ChecklistFormProps {
  open:       boolean;
  onClose:    () => void;
  onSubmit:   (data: Record<string, unknown>) => void;
  checklist?: Record<string, unknown> | null;
}

export default function ChecklistForm({ open, onClose, onSubmit, checklist = null }: ChecklistFormProps) {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors]     = useState<Record<string, string>>({});

  useEffect(() => {
    if (checklist) {
      setFormData({
        titulo:      String(checklist.titulo      ?? ''),
        inspector:   String(checklist.inspector   ?? ''),
        fecha:       String(checklist.fecha       ?? new Date().toISOString().split('T')[0]),
        territorio:  String(checklist.territorio  ?? ''),
        colegio:     String(checklist.colegio     ?? ''),
        eco:         String(checklist.eco         ?? ''),
        material:    String(checklist.material    ?? ''),
        descripcion: String(checklist.descripcion ?? ''),
        items: Array.isArray(checklist.items) && (checklist.items as ChecklistItem[]).length > 0
          ? (checklist.items as ChecklistItem[])
          : [{ ...EMPTY_ITEM }],
      });
    } else {
      setFormData({ ...INITIAL_FORM, fecha: new Date().toISOString().split('T')[0], items: [{ ...EMPTY_ITEM }] });
    }
    setErrors({});
  }, [checklist, open]);

  if (!open) return null;

  const handleColegioChange = (colegio: string) => {
    const info = COLEGIOS.find(c => c.colegio === colegio);
    setFormData(prev => ({ ...prev, colegio, eco: info?.eco ?? '' }));
  };

  const handleTerritorioChange = (territorio: string) => {
    setFormData(prev => ({ ...prev, territorio, colegio: '', eco: '' }));
  };

  const addItem = () =>
    setFormData(prev => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM }] }));

  const removeItem = (index: number) =>
    setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const updateItem = (index: number, field: keyof ChecklistItem, value: string) =>
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item),
    }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!formData.titulo.trim()) e.titulo   = 'El título es obligatorio';
    if (!formData.colegio)       e.colegio  = 'El colegio es obligatorio';
    if (!formData.material)      e.material = 'El tipo de material es obligatorio';
    if (formData.items.length === 0) e.items = 'Agrega al menos 1 ítem';
    formData.items.forEach((item, i) => {
      if (!item.nombre.trim()) e[`item_${i}`] = 'El nombre es obligatorio';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      titulo:         formData.titulo,
      inspector:      formData.inspector   || null,
      fecha:          formData.fecha       || null,
      territorio:     formData.territorio,
      colegio:        formData.colegio,
      eco:            formData.eco,
      material:       formData.material,
      descripcion:    formData.descripcion,
      items:          formData.items,
      overall_status: calcularEstadoGeneral(formData.items),
    });
  };

  const colegioInfo = COLEGIOS.find(c => c.colegio === formData.colegio);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900">
            {checklist ? 'Editar Checklist' : 'Nuevo Checklist'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <form id="checklist-form" onSubmit={handleSubmit} className="space-y-1">

            {/* Título */}
            <div>
              <label className={labelClass}>Título del Checklist *</label>
              <input
                type="text"
                className={`${inputClass} ${errors.titulo ? 'border-red-400' : ''}`}
                value={formData.titulo}
                onChange={e => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
                placeholder="Ej. Revisión de impermeabilizante - Edificio Primaria"
              />
              {errors.titulo && <p className="text-xs text-red-500 mt-1">{errors.titulo}</p>}
            </div>

            {/* Inspector */}
            <div>
              <label className={labelClass}>Inspector (opcional)</label>
              <input
                type="text"
                className={inputClass}
                value={formData.inspector}
                onChange={e => setFormData(prev => ({ ...prev, inspector: e.target.value }))}
                placeholder="Nombre del inspector"
              />
            </div>

            {/* Fecha */}
            <div>
              <label className={labelClass}>Fecha de Inspección (opcional)</label>
              <input
                type="date"
                className={inputClass}
                value={formData.fecha}
                onChange={e => setFormData(prev => ({ ...prev, fecha: e.target.value }))}
              />
            </div>

            {/* Territorio + Colegio */}
            <div className="mt-3">
              <ColegioSelector
                territorio={formData.territorio}
                colegio={formData.colegio}
                onTerritorioChange={handleTerritorioChange}
                onColegioChange={handleColegioChange}
                required
              />
              {errors.colegio && <p className="text-xs text-red-500 mt-1">{errors.colegio}</p>}
            </div>

            {/* Info ECO */}
            {colegioInfo && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-400 uppercase text-[10px] tracking-widest mb-1">
                  ℹ️ Info: {colegioInfo.colegio}
                </p>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-400 uppercase tracking-wide">Territorio</span>
                  <span className="font-bold text-slate-700">{colegioInfo.territorio}</span>
                </div>
                {colegioInfo.eco !== '-' && (
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-400 uppercase tracking-wide">ECO</span>
                    <span className="font-bold text-slate-700">{colegioInfo.eco}</span>
                  </div>
                )}
              </div>
            )}

            {/* Material */}
            <div>
              <label className={labelClass}>Tipo de Material *</label>
              <select
                className={`${selectClass} ${errors.material ? 'border-red-400' : ''}`}
                value={formData.material}
                onChange={e => setFormData(prev => ({ ...prev, material: e.target.value }))}
              >
                <option value="">Seleccionar material...</option>
                {MATERIALES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              {errors.material && <p className="text-xs text-red-500 mt-1">{errors.material}</p>}
            </div>

            {/* Descripción */}
            <div>
              <label className={labelClass}>Descripción / Observaciones</label>
              <textarea
                className={inputClass}
                rows={3}
                value={formData.descripcion}
                onChange={e => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                placeholder="Observaciones generales de la inspección..."
              />
            </div>

            {/* Items */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-500 uppercase">
                  Ítems a Inspeccionar ({formData.items.length}) *
                </label>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-md hover:bg-slate-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar Ítem
                </button>
              </div>
              {errors.items && <p className="text-xs text-red-500 mb-2">{errors.items}</p>}

              <div className="space-y-3">
                {formData.items.map((item, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <input
                          type="text"
                          className={`${inputClass} ${errors[`item_${index}`] ? 'border-red-400' : ''}`}
                          value={item.nombre}
                          onChange={e => updateItem(index, 'nombre', e.target.value)}
                          placeholder="Nombre del ítem (ej. Adherencia)"
                        />
                        {errors[`item_${index}`] && (
                          <p className="text-xs text-red-500 mt-1">{errors[`item_${index}`]}</p>
                        )}
                      </div>
                      <select
                        className="px-2 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        value={item.estado}
                        onChange={e => updateItem(index, 'estado', e.target.value)}
                      >
                        {ESTADOS_ITEM.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="text-red-400 hover:text-red-600 p-1.5 mt-0.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      className={inputClass}
                      value={item.observacion}
                      onChange={e => updateItem(index, 'observacion', e.target.value)}
                      placeholder="Observación del ítem (opcional)"
                    />
                  </div>
                ))}
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="checklist-form"
            className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
          >
            {checklist ? '✓ Actualizar Checklist' : '✓ Crear Checklist'}
          </button>
        </div>
      </div>
    </div>
  );
}
