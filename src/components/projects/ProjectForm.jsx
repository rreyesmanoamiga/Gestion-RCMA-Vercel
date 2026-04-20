import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

export default function ProjectForm({ open, onClose, onSubmit, project }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'planificado',
    priority: 'media',
    location: '',
    responsible: '',
    start_date: '',
    progress: 0
  });

  useEffect(() => {
    if (project) {
      setFormData(project);
    } else {
      setFormData({
        name: '',
        description: '',
        status: 'planificado',
        priority: 'media',
        location: '',
        responsible: '',
        start_date: '',
        progress: 0
      });
    }
  }, [project, open]);

  // Esta es la animación y estructura del panel lateral (Slide-over)
  return (
    <>
      {/* Fondo oscuro con desenfoque (Overlay) */}
      <div 
        className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel Lateral Deslizable */}
      <div className={`fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-[101] transform transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="h-full flex flex-col">
          {/* Cabecera del Panel */}
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {project ? 'Editar Proyecto' : 'Nuevo Proyecto'}
              </h3>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Gestión de Obra</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Cuerpo del Formulario con scroll propio */}
          <form onSubmit={(e) => {
            e.preventDefault();
            const dataToSubmit = {
              ...formData,
              progress: parseInt(formData.progress) || 0,
              type: 'Mantenimiento', // Valor por defecto para evitar error 400
              territorio: 'MEXICO'   // Valor por defecto para evitar error 400
            };
            onSubmit(dataToSubmit);
          }} className="flex-1 overflow-y-auto p-6 space-y-5">
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Nombre del Proyecto</label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej. Impermeabilización de Aula 4"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Descripción</label>
              <textarea
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Estado</label>
                <select className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-white" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                  <option value="planificado">Planificado</option>
                  <option value="en_progreso">En Progreso</option>
                  <option value="pausado">Pausado</option>
                  <option value="completado">Completado</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Prioridad</label>
                <select className="w-full px-4 py-3 border border-slate-200 rounded-lg bg-white" value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })}>
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                </select>
              </div>
            </div>

            {/* Agregué este campo para que coincida con tu tabla 'colegio' */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Colegio / Ubicación</label>
              <input
                type="text"
                className="w-full px-4 py-3 border border-slate-200 rounded-lg"
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Fecha Inicio</label>
                <input
                  type="date"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg"
                  value={formData.start_date}
                  onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Progreso (%)</label>
                <input
                  type="number"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg"
                  value={formData.progress}
                  onChange={e => setFormData({ ...formData, progress: e.target.value })}
                />
              </div>
            </div>
          </form>

          {/* Botones fijos al final */}
          <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">
              Cancelar
            </button>
            <button onClick={() => {
              // Trigger el form submit manualmente si el botón está fuera del form tag o simplemente usa type="submit" dentro del form
            }} type="submit" className="flex-[2] px-4 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 flex items-center justify-center gap-2 shadow-lg">
              <Save className="w-5 h-5" />
              {project ? 'Actualizar' : 'Crear Proyecto'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}