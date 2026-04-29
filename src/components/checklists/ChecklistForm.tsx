import React, { useState, useEffect } from 'react';
import { X, Save, ChevronDown, ChevronUp, Info, MapPin, User, Plus, Trash2 } from 'lucide-react';
import { COLEGIOS, type Colegio } from '@/lib/colegios';
import ColegioSelector from '@/components/shared/ColegioSelector';

const inputClass  = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const labelClass  = "block text-xs font-bold text-slate-500 uppercase mb-1 mt-3";
const selectSmall = "px-2 py-1 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";

const TIPOS_MATERIAL = [
  { value: 'petreos',       label: 'Pétreos (piedra, arena, arcilla)'     },
  { value: 'metalicos',     label: 'Metálicos (acero, aluminio)'           },
  { value: 'aglomerantes',  label: 'Aglomerantes (cemento, cal, yeso)'     },
  { value: 'ceramicos',     label: 'Cerámicos (ladrillos, azulejos)'       },
  { value: 'madera',        label: 'Madera'                                },
  { value: 'sinteticos',    label: 'Sintéticos (plásticos, aislantes)'     },
];

const CONDICIONES = [
  { value: 'bueno',   label: 'Bueno'   },
  { value: 'regular', label: 'Regular' },
  { value: 'malo',    label: 'Malo'    },
  { value: 'critico', label: 'Crítico' },
];

interface ItemInspeccion {
  label:     string;
  condition: string;
  notes:     string;
}

interface FormData {
  title:                string;
  territorio:           string;
  colegio:              string;
  infrastructure_type:  string;
  inspector:            string;
  inspection_date:      string;
  general_observations: string;
  items:                ItemInspeccion[];
}

const INITIAL_FORM: FormData = {
  title:                '',
  territorio:           '',
  colegio:              '',
  infrastructure_type:  'petreos',
  inspector:            '',
  inspection_date:      new Date().toISOString().split('T')[0],
  general_observations: '',
  items:                [],
};

interface ChecklistRecord {
  title?:                string;
  territorio?:           string;
  colegio?:              string;
  location?:             string;
  infrastructure_type?:  string;
  inspector?:            string;
  inspection_date?:      string;
  general_observations?: string;
  items?:                ItemInspeccion[];
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
        title:                String(checklist.title                ?? ''),
        territorio:           String(checklist.territorio           ?? ''),
        colegio:              String(checklist.colegio ?? checklist.location ?? ''),
        infrastructure_type:  String(checklist.infrastructure_type  ?? 'petreos'),
        inspector:            String(checklist.inspector             ?? ''),
        inspection_date:      String(checklist.inspection_date      ?? new Date().toISOString().split('T')[0]),
        general_observations: String(checklist.general_observations ?? ''),
        items:                (checklist.items as ItemInspeccion[]) ?? [],
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

  // ── Items helpers ────────────────────────────────────────────────────────────
  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { label: '', condition: 'bueno', notes: '' }],
    }));
  };

  const updateItem = (idx: number, field: keyof ItemInspeccion, value: string) => {
    setFormData(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      return { ...prev, items };
    });
  };

  const removeItem = (idx: number) => {
    setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  // ── Calcular estatus general automático ──────────────────────────────────────
  const computeOverallStatus = (items: ItemInspeccion[]): string => {
    if (items.length === 0) return 'bueno';
    if (items.some(it => it.condition === 'critico')) return 'critico';
    if (items.some(it => it.condition === 'malo'))    return 'malo';
    if (items.some(it => it.condition === 'regular')) return 'regular';
    return 'bueno';
  };

  const handleSubmit = (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.territorio || !formData.colegio) return;
    onSubmit({
      ...formData,
      overall_status: computeOverallStatus(formData.items),
      description:    formData.general_observations,
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col border border-slate-200">

        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-900">
            {checklist ? 'Editar Checklist' : 'Nuevo Checklist'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-3 flex-1">

          {/* Título */}
          <div>
            <label className={labelClass}>Título del Checklist *</label>
            <input
              type="text" required className={inputClass}
              value={formData.title}
              onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Ej. Revisión Mensual de Instalaciones"
            />
          </div>

          {/* Inspector */}
          <div>
            <label className={labelClass}>Inspector</label>
            <input
              type="text" className={inputClass}
              value={formData.inspector}
              onChange={e => setFormData(prev => ({ ...prev, inspector: e.target.value }))}
              placeholder="Nombre del inspector"
            />
          </div>

          {/* Fecha */}
          <div>
            <label className={labelClass}>Fecha de Inspección</label>
            <input
              type="date" className={inputClass}
              value={formData.inspection_date}
              onChange={e => setFormData(prev => ({ ...prev, inspection_date: e.target.value }))}
            />
          </div>

          {/* Territorio / Colegio */}
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

          {/* Info colegio */}
          {hasInfo && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setInfoOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
              >
                <span className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide">
                  <Info className="w-3.5 h-3.5 text-blue-500" />
                  {colegioInfo ? `Info: ${colegioInfo.colegio}` : `Colegios en territorio ${formData.territorio}`}
                </span>
                {infoOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {infoOpen && (
                <div className="px-4 py-3 bg-white space-y-3">
                  {colegioInfo && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-slate-500 text-xs font-bold uppercase">Territorio</span>
                        <span className="text-slate-800 text-sm font-semibold ml-auto">{colegioInfo.territorio}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
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
                            onClick={() => { setFormData(prev => ({ ...prev, colegio: c.colegio })); setInfoOpen(true); }}
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

          {/* Tipo de Material */}
          <div>
            <label className={labelClass}>Tipo de Material *</label>
            <select
              className={inputClass}
              value={formData.infrastructure_type}
              onChange={e => setFormData(prev => ({ ...prev, infrastructure_type: e.target.value }))}
              required
            >
              {TIPOS_MATERIAL.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Descripción */}
          <div>
            <label className={labelClass}>Descripción / Observaciones</label>
            <textarea
              className={`${inputClass} h-20 resize-none`}
              value={formData.general_observations}
              onChange={e => setFormData(prev => ({ ...prev, general_observations: e.target.value }))}
              placeholder="Detalles adicionales del checklist..."
            />
          </div>

          {/* Items de inspección */}
          <div>
            <div className="flex items-center justify-between mt-4 mb-2">
              <label className="text-xs font-bold text-slate-500 uppercase">
                Items a Inspeccionar ({formData.items.length})
              </label>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-bold hover:bg-slate-700 transition-colors"
              >
                <Plus className="w-3 h-3" /> Agregar Item
              </button>
            </div>

            {formData.items.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-6 text-center text-xs text-slate-400">
                Sin items. Haz clic en "Agregar Item" para comenzar.
              </div>
            ) : (
              <div className="space-y-2">
                {formData.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-start p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        className={inputClass}
                        value={item.label}
                        onChange={e => updateItem(idx, 'label', e.target.value)}
                        placeholder={`Item ${idx + 1} — ej. Revisión de cubierta`}
                      />
                      <input
                        type="text"
                        className={`${inputClass} text-xs`}
                        value={item.notes}
                        onChange={e => updateItem(idx, 'notes', e.target.value)}
                        placeholder="Notas adicionales (opcional)"
                      />
                    </div>
                    <div className="flex flex-col gap-2 items-end shrink-0">
                      <select
                        className={selectSmall}
                        value={item.condition}
                        onChange={e => updateItem(idx, 'condition', e.target.value)}
                      >
                        {CONDICIONES.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md"
          >
            Cancelar
          </button>
          <button
            type="button" onClick={handleSubmit}
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
