import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { COLEGIOS } from '@/lib/colegios';
import ColegioSelector from '@/components/shared/ColegioSelector';

// Fuera del componente — se definen una sola vez
const inputClass    = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const labelClass    = "block text-xs font-bold text-slate-500 uppercase mb-1 mt-3";
const readOnlyClass = "w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 font-semibold text-slate-600 cursor-default";

const DEFAULT_PROJECT_TYPE = 'Mantenimiento';

const INITIAL_FORM = {
  name:        '',
  description: '',
  status:      'planificado',
  priority:    'media',
  territorio:  '',
  colegio:     '',
  eco:         '',
  responsible: '',
  start_date:  '',
  progress:    0,
};

export default function ProjectForm({ open, onClose, onSubmit, project }) {
  const [formData, setFormData] = useState(INITIAL_FORM);

  useEffect(() => {
    if (project) {
      setFormData({
        ...INITIAL_FORM,
        ...project,
        colegio:  project.colegio  ?? project.location ?? '',
        eco:      project.eco      ?? '',
        progress: project.progress ?? 0,
      });
    } else {
      setFormData(INITIAL_FORM);
    }
  }, [project, open]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      progress: parseInt(formData.progress) || 0,
      type:     DEFAULT_PROJECT_TYPE,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900">
            {project ? 'Editar Proyecto' : 'Nuevo Proyecto'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-1 flex-1">

          {/* Nombre */}
          <div>
            <label className={labelClass}>Nombre del Proyecto *</label>
            <input
              type="text"
              required
              className={inputClass}
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ej. Impermeabilización de Aula 4"
            />
          </div>

          {/* Territorio + Colegio — usando ColegioSelector */}
          <ColegioSelector
            territorio={formData.territorio}
            colegio={formData.colegio}
            onTerritorioChange={val => {
              setFormData(prev => ({
                ...prev,
                territorio: val,
                colegio:    '',
                eco:        '',
              }));
            }}
            onColegioChange={val => {
              // ECO se asigna automáticamente desde colegios.js al seleccionar el colegio
              const colegioData = COLEGIOS.find(c => c.colegio === val);
              setFormData(prev => ({
                ...prev,
                colegio: val,
                eco:     colegioData?.eco ?? '',
              }));
            }}
            required
          />

          {/* ECO automático — readOnly, asignado desde colegios.js */}
          <div>
            <label className={labelClass}>Responsable ECO (Automático)</label>
            <input
              type="text"
              readOnly
              className={readOnlyClass}
              value={formData.eco}
              placeholder="Se asigna según el colegio seleccionado"
            />
          </div>

          {/* Estado + Prioridad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Estado</label>
              <select
                className={inputClass}
                value={formData.status}
                onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="planificado">Planificado</option>
                <option value="en_progreso">En Progreso</option>
                <option value="pausado">Pausado</option>
                <option value="completado">Completado</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Prioridad</label>
              <select
                className={inputClass}
                value={formData.priority}
                onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          {/* Responsable de ejecución */}
          <div>
            <label className={labelClass}>Responsable de Ejecución</label>
            <input
              type="text"
              className={inputClass}
              value={formData.responsible}
              onChange={e => setFormData(prev => ({ ...prev, responsible: e.target.value }))}
              placeholder="Persona a cargo"
            />
          </div>

          {/* Fecha + Progreso */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Fecha de Inicio</label>
              <input
                type="date"
                className={inputClass}
                value={formData.start_date}
                onChange={e => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Progreso (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                className={inputClass}
                value={formData.progress}
                onChange={e => setFormData(prev => ({ ...prev, progress: e.target.value }))}
              />
            </div>
          </div>

          {/* Footer dentro del form */}
          <div className="pt-6 border-t border-slate-100 flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {project ? 'Actualizar Proyecto' : 'Guardar Proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}