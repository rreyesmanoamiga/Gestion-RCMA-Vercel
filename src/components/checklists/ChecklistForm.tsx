import React, { useState, useEffect } from 'react';
import { X, Save, ChevronDown, ChevronUp, Info, MapPin, User } from 'lucide-react';
import { COLEGIOS, type Colegio } from '@/lib/colegios';
import ColegioSelector from '@/components/shared/ColegioSelector';

const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const labelClass = "block text-xs font-bold text-slate-500 uppercase mb-1 mt-3";

interface FormData {
  title:       string;
  territorio:  string;
  colegio:     string;
  status:      string;
  description: string;
}

const INITIAL_FORM: FormData = {
  title:       '',
  territorio:  '',
  colegio:     '',
  status:      'pendiente',
  description: '',
};

interface ChecklistRecord {
  title?:       string;
  territorio?:  string;
  colegio?:     string;
  location?:    string;
  status?:      string;
  description?: string;
  [key: string]: unknown;
}

interface ChecklistFormProps {
  open:       boolean;
  onClose:    () => void;
  onSubmit:   (data: Record<string, unknown>) => void;
  checklist?: ChecklistRecord | null;
  projects?:  unknown[];
}

export default function ChecklistForm({
  open,
  onClose,
  onSubmit,
  checklist = null,
}: ChecklistFormProps) {
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (checklist) {
      setFormData({
        title:       String(checklist.title       ?? ''),
        territorio:  String(checklist.territorio   ?? ''),
        colegio:     String(checklist.colegio ?? checklist.location ?? ''),
        status:      String(checklist.status       ?? 'pendiente'),
        description: String(checklist.description  ?? ''),
      });
    } else {
      setFormData(INITIAL_FORM);
    }
    setInfoOpen(false);
  }, [checklist, open]);

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
    onSubmit({ ...formData });
  };

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

        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          <div>
            <label className={labelClass}>Título del Checklist *</label>
            <input
              type="text"
              required
              className={inputClass}
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Ej. Revisión Mensual de Instalaciones"
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
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-slate-500 text-xs font-bold uppercase">Territorio</span>
                        <span className="text-slate-800 text-sm font-semibold ml-auto">
                          {colegioInfo.territorio}
                        </span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span className="text-slate-500 text-xs font-bold uppercase">ECO</span>
                        <span className="text-slate-800 text-sm font-semibold ml-auto text-right">
                          {colegioInfo.eco}
                        </span>
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

          <div>
            <label className={labelClass}>Descripción / Observaciones</label>
            <textarea
              className={`${inputClass} h-24 resize-none`}
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Detalles adicionales del checklist..."
            />
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {checklist ? 'Actualizar Checklist' : 'Crear Checklist'}
          </button>
        </div>
      </div>
    </div>
  );
}
