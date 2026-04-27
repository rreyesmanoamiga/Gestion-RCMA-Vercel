import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { COLEGIOS } from '@/lib/colegios';
import ColegioSelector from '@/components/shared/ColegioSelector';

const inputClass    = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const labelClass    = "block text-xs font-bold text-slate-500 uppercase mb-1 mt-3";
const readOnlyClass = "w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50 font-semibold text-slate-600 cursor-default";

const DEFAULT_PROJECT_TYPE = 'Mantenimiento';

interface FormData {
  name:           string;
  description:    string;
  status:         string;
  priority:       string;
  territorio:     string;
  colegio:        string;
  eco:            string;
  responsible:    string;
  start_date:     string;
  end_date:       string;
  progress:       number;
  notes:          string;
  budget:         string;
  ticket_number:  string;
}

const INITIAL_FORM: FormData = {
  name:           '',
  description:    '',
  status:         'planificado',
  priority:       'media',
  territorio:     '',
  colegio:        '',
  eco:            '',
  responsible:    '',
  start_date:     '',
  end_date:       '',
  progress:       0,
  notes:          '',
  budget:         '',
  ticket_number:  '',
};

interface ProjectFormProps {
  open:     boolean;
  onClose:  () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  project?: Record<string, unknown> | null;
}

export default function ProjectForm({ open, onClose, onSubmit, project = null }: ProjectFormProps) {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);

  useEffect(() => {
    if (project) {
      setFormData({
        ...INITIAL_FORM,
        name:          String(project.name          ?? ''),
        description:   String(project.description   ?? ''),
        status:        String(project.status         ?? 'planificado'),
        priority:      String(project.priority       ?? 'media'),
        territorio:    String(project.territorio     ?? ''),
        colegio:       String(project.colegio    ?? project.location ?? ''),
        eco:           String(project.eco            ?? ''),
        responsible:   String(project.responsible    ?? ''),
        start_date:    String(project.start_date     ?? ''),
        end_date:      String(project.end_date       ?? ''),
        progress:      Number(project.progress       ?? 0),
        notes:         String(project.notes          ?? ''),
        budget:        project.budget != null ? String(project.budget) : '',
        ticket_number: project.ticket_number != null ? String(project.ticket_number) : '',
      });
    } else {
      setFormData(INITIAL_FORM);
    }
  }, [project, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const folio = formData.ticket_number
      ? `TCMM${String(formData.ticket_number).padStart(3, '0')}`
      : null;
    onSubmit({
      name:          formData.name,
      description:   formData.description,
      status:        formData.status,
      priority:      formData.priority,
      territorio:    formData.territorio,
      colegio:       formData.colegio,
      eco:           formData.eco,
      responsible:   formData.responsible,
      start_date:    formData.start_date || null,
      end_date:      formData.end_date   || null,
      progress:      formData.progress   || 0,
      notes:         formData.notes,
      budget:        formData.budget ? parseFloat(formData.budget) : null,
      ticket_number: formData.ticket_number ? parseInt(formData.ticket_number) : null,
      folio,
      type:          DEFAULT_PROJECT_TYPE,
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

          {/* Folio de Ticket */}
          <div>
            <label className={labelClass}>Número de Folio (opcional)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-red-500 pointer-events-none">TCMM</span>
              <input
                type="number"
                min="1"
                className="w-full pl-14 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900"
                value={formData.ticket_number}
                onChange={e => setFormData(prev => ({ ...prev, ticket_number: e.target.value }))}
                placeholder="Ej. 10 → TCMM010"
              />
            </div>
            {formData.ticket_number && (
              <p className="text-xs font-bold text-red-500 mt-1">
                Folio: TCMM{String(formData.ticket_number).padStart(3, '0')}
              </p>
            )}
          </div>

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

          <ColegioSelector
            territorio={formData.territorio}
            colegio={formData.colegio}
            onTerritorioChange={val => {
              setFormData(prev => ({ ...prev, territorio: val, colegio: '', eco: '' }));
            }}
            onColegioChange={val => {
              const colegioData = COLEGIOS.find(c => c.colegio === val);
              setFormData(prev => ({ ...prev, colegio: val, eco: colegioData?.eco ?? '' }));
            }}
            required
          />

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Estado</label>
              <select className={inputClass} value={formData.status}
                onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}>
                <option value="planificado">Planificado</option>
                <option value="en_progreso">En Progreso</option>
                <option value="pausado">Pausado</option>
                <option value="completado">Completado</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Prioridad</label>
              <select className={inputClass} value={formData.priority}
                onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Responsable de Ejecución</label>
            <input type="text" className={inputClass} value={formData.responsible}
              onChange={e => setFormData(prev => ({ ...prev, responsible: e.target.value }))}
              placeholder="Persona a cargo" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Fecha de Inicio</label>
              <input type="date" className={inputClass} value={formData.start_date}
                onChange={e => setFormData(prev => ({ ...prev, start_date: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Fecha de Fin</label>
              <input type="date" className={inputClass} value={formData.end_date}
                onChange={e => setFormData(prev => ({ ...prev, end_date: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Presupuesto (MXN)</label>
              <input type="number" min="0" step="0.01" className={inputClass} value={formData.budget}
                onChange={e => setFormData(prev => ({ ...prev, budget: e.target.value }))}
                placeholder="0.00" />
            </div>
            <div>
              <label className={labelClass}>Progreso (%)</label>
              <input type="number" min="0" max="100" className={inputClass} value={formData.progress}
                onChange={e => setFormData(prev => ({ ...prev, progress: Number(e.target.value) }))} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Notas</label>
            <textarea className={`${inputClass} h-20 resize-none`} value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Observaciones o detalles adicionales..." />
          </div>

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
