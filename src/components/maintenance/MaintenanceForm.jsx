import React, { useState, useEffect } from 'react';
import { X, Save, Wrench } from 'lucide-react';

export default function MaintenanceForm({ open, onClose, onSubmit, task }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'pendiente',
    priority: 'media',
    location: '',
    assigned_to: '',
    due_date: ''
  });

  useEffect(() => {
    if (task) {
      setFormData(task);
    } else {
      setFormData({
        title: '',
        description: '',
        status: 'pendiente',
        priority: 'media',
        location: '',
        assigned_to: '',
        due_date: ''
      });
    }
  }, [task, open]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
  const labelClass = "block text-[10px] font-black text-slate-400 uppercase mb-1 mt-3 tracking-widest";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2 uppercase tracking-tight">
            <Wrench className="w-4 h-4 text-slate-400" />
            {task ? 'Editar Orden de Trabajo' : 'Nueva Orden de Mantenimiento'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-2">
          <div>
            <label className={labelClass}>Título de la Tarea / Correctivo *</label>
            <input
              type="text"
              required
              className={inputClass}
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="Ej. Reparación de filtración en losa"
            />
          </div>

          <div>
            <label className={labelClass}>Descripción del Problema</label>
            <textarea
              className={`${inputClass} min-h-[80px]`}
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detalle los hallazgos encontrados..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Estado</label>
              <select 
                className={inputClass}
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="pendiente">Pendiente</option>
                <option value="en_progreso">En Progreso</option>
                <option value="completado">Completado</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Prioridad</label>
              <select 
                className={inputClass}
                value={formData.priority}
                onChange={e => setFormData({ ...formData, priority: e.target.value })}
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Ubicación / Área del Plantel</label>
            <input
              type="text"
              className={inputClass}
              value={formData.location}
              onChange={e => setFormData({ ...formData, location: e.target.value })}
              placeholder="Ej. Edificio B, Planta Alta"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Asignado a (Técnico)</label>
              <input
                type="text"
                className={inputClass}
                value={formData.assigned_to}
                onChange={e => setFormData({ ...formData, assigned_to: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Fecha Límite</label>
              <input
                type="date"
                className={inputClass}
                value={formData.due_date}
                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>
          </div>

          <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 mt-6">
            <button 
              type="button"
              onClick={onClose} 
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              className="px-6 py-2 bg-slate-900 text-white rounded-md text-sm font-bold hover:bg-slate-800 flex items-center gap-2 shadow-lg active:scale-95 transition-all"
            >
              <Save className="w-4 h-4" />
              {task ? 'Actualizar Orden' : 'Crear Orden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}