import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2 } from 'lucide-react';

export default function ChecklistForm({ open, onClose, onSubmit, record }) {
  const [formData, setFormData] = useState({
    title: '',
    inspector: '',
    location: '',
    status: 'pendiente',
    items: [{ label: '', completed: false }],
    observations: ''
  });

  useEffect(() => {
    if (record) {
      setFormData(record);
    } else {
      setFormData({
        title: '',
        inspector: '',
        location: '',
        status: 'pendiente',
        items: [{ label: '', completed: false }],
        observations: ''
      });
    }
  }, [record, open]);

  if (!open) return null;

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { label: '', completed: false }]
    });
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const updateItem = (index, value) => {
    const newItems = [...formData.items];
    newItems[index].label = value;
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
  const labelClass = "block text-[10px] font-black text-slate-400 uppercase mb-1 mt-3 tracking-widest";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900 uppercase tracking-tight">
            {record ? 'Editar Inspección' : 'Nuevo Registro de Levantamiento'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Título de la Lista</label>
              <input
                type="text"
                required
                className={inputClass}
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ej. Revisión Estructural Ala Norte"
              />
            </div>
            <div>
              <label className={labelClass}>Ubicación / Plantel</label>
              <input
                type="text"
                className={inputClass}
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Puntos de Inspección</label>
            <div className="space-y-2 mt-2">
              {formData.items.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    required
                    className={inputClass}
                    placeholder={`Punto ${index + 1}`}
                    value={item.label}
                    onChange={e => updateItem(index, e.target.value)}
                  />
                  <button 
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button 
                type="button"
                onClick={addItem}
                className="w-full py-2 border-2 border-dashed border-slate-200 rounded-md text-xs font-bold text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-3 h-3" /> Añadir Punto de Revisión
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>Observaciones Generales</label>
            <textarea
              className={`${inputClass} min-h-[100px]`}
              value={formData.observations}
              onChange={e => setFormData({ ...formData, observations: e.target.value })}
              placeholder="Notas técnicas sobre el estado del inmueble..."
            />
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
              Guardar Reporte
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}