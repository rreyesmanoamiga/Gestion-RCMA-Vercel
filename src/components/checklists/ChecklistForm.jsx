import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

// Mantenemos la misma fuente de verdad para los datos
const TERRITORIOS_DATA = {
  NORTE: [
    { colegio: 'CEC VAC' },
    { colegio: 'CEC CHIHUAHUA' },
    { colegio: 'CEC NUEVO LAREDO' },
    { colegio: 'CEC SALTILLO' }
  ],
  MEXICO: [
    { colegio: 'CEC SUR' },
    { colegio: 'CEC PROYECTO' },
    { colegio: 'CEC PRIMARIA' },
    { colegio: 'CEC COACALCO' }
  ],
  FMA: [
    { colegio: 'CMA COACALCO' },
    { colegio: 'CMA COAPA' },
    { colegio: 'CMA TAXQUEÑA' },
    { colegio: 'CMA PUEBLA' }
  ]
};

export default function ChecklistForm({ open, onClose, onSubmit, checklist }) {
  const [formData, setFormData] = useState({
    title: '',
    territorio: '',
    location: '', // Este es el Colegio
    status: 'pendiente',
    description: ''
  });

  useEffect(() => {
    if (checklist) {
      setFormData(checklist);
    } else {
      setFormData({
        title: '',
        territorio: '',
        location: '',
        status: 'pendiente',
        description: ''
      });
    }
  }, [checklist, open]);

  if (!open) return null;

  // Lógica de cambio de Territorio (limpia el colegio seleccionado)
  const handleTerritorioChange = (e) => {
    setFormData({
      ...formData,
      territorio: e.target.value,
      location: '' // Reinicia el colegio al cambiar de zona
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Enviamos los datos a la base de datos (Supabase)
    onSubmit({
      ...formData,
      colegio: formData.location // Sincronizamos con el nombre de tu columna
    });
  };

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
  const labelClass = "block text-xs font-bold text-slate-500 uppercase mb-1 mt-3";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900">
            {checklist ? 'Editar Checklist' : 'Nuevo Checklist'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-1">
          <div>
            <label className={labelClass}>Título del Checklist *</label>
            <input
              type="text" required className={inputClass}
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="Ej. Revisión Mensual de Instalaciones"
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
              <label className={labelClass}>Colegio / Sede</label>
              <select 
                className={inputClass}
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
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
            <label className={labelClass}>Descripción / Observaciones</label>
            <textarea
              className={`${inputClass} h-24 resize-none`}
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detalles adicionales del checklist..."
            />
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
              {checklist ? 'Actualizar Checklist' : 'Crear Checklist'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}