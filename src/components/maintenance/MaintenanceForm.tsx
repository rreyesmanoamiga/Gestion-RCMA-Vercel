import React, { useState, useEffect } from 'react';
import { X, Save, Hammer, ChevronDown, ChevronUp, Info, MapPin, User } from 'lucide-react';
import { COLEGIOS, type Colegio } from '@/lib/colegios';
import ColegioSelector from '@/components/shared/ColegioSelector';

const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const labelClass = "block text-xs font-bold text-slate-500 uppercase mb-1 mt-3";

interface FormData {
  title:          string;
  territorio:     string;
  colegio:        string;
  type:           string;
  priority:       string;
  status:         string;
  description:    string;
  scheduled_date: string;
}

const INITIAL_FORM: FormData = {
  title:          '',
  territorio:     '',
  colegio:        '',
  type:           'Correctivo',
  priority:       'media',
  status:         'pendiente',
  description:    '',
  scheduled_date: '',
};

interface MaintenanceFormProps {
  open:         boolean;
  onClose:      () => void;
  onSubmit:     (data: Record<string, unknown>) => void;
  maintenance?: Record<string, unknown> | null;
}

export default function MaintenanceForm({
  open,
  onClose,
  onSubmit,
  maintenance = null,
}: MaintenanceFormProps) {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (maintenance) {
      setFormData({
        title:          String(maintenance.title          ?? ''),
        territorio:     String(maintenance.territorio      ?? ''),
        colegio:        String(maintenance.colegio ?? maintenance.location ?? ''),
        type:           String(maintenance.type            ?? 'Correctivo'),
        priority:       String(maintenance.priority        ?? 'media'),
        status:         String(maintenance.status          ?? 'pendiente'),
        description:    String(maintenance.description     ?? ''),
        scheduled_date: String(maintenance.scheduled_date  ?? ''),
      });
    } else {
      setFormData(INITIAL_FORM);
    }
    setInfoOpen(false);
  }, [maintenance, open]);

  if (!open) return null;

  const colegiosFiltrados: Colegio[] = formData.territorio
    ? COLEGIOS.filter(c => c.territorio === formData.territorio)
    : [];

  const colegioInfo: Colegio | null = formData.colegio
    ? COLEGIOS.find(c => c.colegio === formData.colegio) ?? null
    : null;

  const territorioInfo: Colegio[] | null = formData.territorio && !formData.colegio
    ? colegiosFiltrados
    : null;

  const hasInfo = !!(colegioInfo || (territorioInfo && territorioInfo.length > 0));

  const handleSubmit = (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...formData, updated_at: new Date() });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">

        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Hammer className="w-4 h-4" />
            {maintenance ? 'Editar Mantenimiento' : 'Nuevo Mantenimiento'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-3 flex-1">

          <div>
            <label className={labelClass}>Asunto / Tarea *</label>
            <input
              type="text"
              required
              className={inputClass}
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Ej. Revisión de transformador"
            />
          </div>

          <ColegioSelector
            territorio={formData.territorio}
            colegio={formData.colegio}
            onTerritorioChange={val => {
              setFormData(prev => ({ ...prev, territorio: val, colegio: '' }));
              setInfoOpen(false);
            }}
            onColegioChange={val => {
              setFormData(prev => ({ ...prev, colegio: val }));
              setInfoOpen(!!val);
            }}
            required
          />

          {hasInfo && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setInfoOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide">
                  <Info className="w-3.5 h-3.5 text-blue-500" />
                  {colegioInfo
                    ? `Info: ${colegioInfo.colegio}`
                    : `Colegios en territorio ${formData.territorio}`}
                </span>
                {infoOpen
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {infoOpen && (
                <div className="px-4 py-3 bg-white space-y-3">
                  {colegioInfo && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-slate-500 text-xs font-bold uppercase">Territorio</span>
                        <span className="text-slate-800 text-sm font-semibold ml-auto">{colegioInfo.territorio}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span className="text-slate-500 text-xs font-bold uppercase">ECO</span>
                        <span className="text-slate-800 text-sm font-semibold ml-auto text-right">{colegioInfo.eco}</span>
                      </div>
                    </div>
                  )}

                  {territorioInfo && territorioInfo.length > 0 && (
                    <div className="divide-y divide-slate-100">
                      {territorioInfo.map(c => (
                        <div key={c.colegio} className="py-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{c.colegio}</p>
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                              <User className="w-3 h-3" /> {c.eco}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, colegio: c.colegio }));
                              setInfoOpen(true);
                            }}
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 shrink-0 mt-1 uppercase tracking-wide"
                          >
                            Seleccionar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tipo</label>
              <select
                className={inputClass}
                value={formData.type}
                onChange={e => setFormData(prev => ({ ...prev, type: e.target.value }))}
              >
                <option value="Preventivo">Preventivo</option>
                <option value="Correctivo">Correctivo</option>
                <option value="Mejora">Mejora</option>
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
                <option value="critica">Crítica</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Descripción</label>
            <textarea
              className={`${inputClass} h-20 resize-none`}
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium flex items-center gap-2 hover:bg-slate-800"
          >
            <Save className="w-4 h-4" />
            {maintenance ? 'Actualizar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
