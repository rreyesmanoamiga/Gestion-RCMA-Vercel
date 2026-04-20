import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

// DATOS EXTRAÍDOS DE TU EXCEL "Reencuentro y Gestión de Tareas"
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
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'planificado',
    priority: 'media',
    territorio: '', // Nuevo: Para control de filtros
    location: '',   // Colegio
    eco: '',        // Responsable ECO automático
    responsible: '', // Responsable ejecución
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
        territorio: '',
        location: '',
        eco: '',
        responsible: '',
        start_date: '',
        progress: 0
      });
    }
  }, [project, open]);

  if (!open) return null;

  // Lógica de cambio de Territorio (limpia colegio y eco)
  const handleTerritorioChange = (e) => {
    setFormData({
      ...formData,
      territorio: e.target.value,
      location: '', 
      eco: ''      
    });
  };

  // Lógica de cambio de Colegio (asigna Responsable ECO automático)
  const handleColegioChange = (e) => {
    const colName = e.target.value;
    const zona = formData.territorio;
    const info = TERRITORIOS_DATA[zona]?.find(c => c.colegio === colName);
    
    setFormData({
      ...formData,
      location: colName,
      eco: info ? info.eco : ''
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Mantenemos tu lógica de envío para Supabase
    const dataToSubmit = {
      ...formData,
      progress: parseInt(formData.progress) || 0,
      colegio: formData.location, // Sincronización con tu columna DB
      type: 'Mantenimiento' // Valor por defecto según tu SQL
    };
    
    onSubmit(dataToSubmit);
  };

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
  const labelClass = "block text-xs font-bold text-slate-500 uppercase mb-1 mt-3";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900">
            {project ? 'Editar Proyecto' : 'Nuevo Proyecto'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-1">
          <div>
            <label className={labelClass}>Nombre del Proyecto *</label>
            <input
              type="text" required className={inputClass}
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej. Impermeabilización de Aula 4"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Territorio</label>
              <select 
                className={inputClass} 
                value={formData.territorio} 
                onChange={handleTerritorioChange}
                required
              >
                <option value="">Seleccione...</option>
                <option value="NORTE">NORTE</option>
                <option value="MEXICO">MEXICO</option>
                <option value="FMA">FMA</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Ubicación / Colegio</label>
              <select 
                className={inputClass}
                value={formData.location}
                onChange={handleColegioChange}
                disabled={!formData.territorio}
                required
              >
                <option value="">Seleccione...</option>
                {formData.territorio && TERRITORIOS_DATA[formData.territorio].map(item => (
                  <option key={item.colegio} value={item.colegio}>{item.colegio}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Responsable ECO (Automático)</label>
            <input
              type="text"
              readOnly
              className={`${inputClass} bg-slate-50 font-semibold text-slate-600`}
              value={formData.eco}
              placeholder="Se asigna según el colegio"
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
                onChange={e => setFormData({ ...formData, priority: e.target.value })}
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Responsable de Ejecución</label>
            <input
              type="text"
              className={inputClass}
              value={formData.responsible}
              onChange={e => setFormData({ ...formData, responsible: e.target.value })}
              placeholder="Persona a cargo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Fecha de Inicio</label>
              <input
                type="date"
                className={inputClass}
                value={formData.start_date}
                onChange={e => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Progreso (%)</label>
              <input
                type="number"
                min="0" max="100"
                className={inputClass}
                value={formData.progress}
                onChange={e => setFormData({ ...formData, progress: e.target.value })}
              />
            </div>
          </div>

          <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 mt-6">
            <button 
              type="button"
              onClick={onClose} 
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md"
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