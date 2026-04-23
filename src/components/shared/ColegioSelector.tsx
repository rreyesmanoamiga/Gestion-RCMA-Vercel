import React, { useMemo } from 'react';
import { COLEGIOS, TERRITORIOS, type Colegio } from '@/lib/colegios';

interface ColegioSelectorProps {
  territorio: string;
  colegio: string;
  onTerritorioChange: (value: string) => void;
  onColegioChange: (value: string) => void;
  required?: boolean;
}

const selectClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white text-slate-900";
const labelClass  = "block text-xs font-bold text-slate-500 uppercase mb-1";

export default function ColegioSelector({
  territorio,
  colegio,
  onTerritorioChange,
  onColegioChange,
  required = false,
}: ColegioSelectorProps) {
  const colegiosFiltrados = useMemo(() =>
    territorio
      ? COLEGIOS.filter((c: Colegio) => c.territorio === territorio)
      : COLEGIOS,
    [territorio]
  );

  const handleTerritorio = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    onTerritorioChange(val === '' ? '' : val);
    onColegioChange('');
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Territorio */}
      <div>
        <label htmlFor="selector-territorio" className={labelClass}>
          Territorio {required && '*'}
        </label>
        <select
          id="selector-territorio"
          className={selectClass}
          value={territorio}
          onChange={handleTerritorio}
          required={required}
        >
          <option value="">{required ? 'Seleccionar...' : 'Todos'}</option>
          {TERRITORIOS.map((t: string) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Colegio */}
      <div>
        <label htmlFor="selector-colegio" className={labelClass}>
          Colegio {required && '*'}
        </label>
        <select
          id="selector-colegio"
          className={selectClass}
          value={colegio}
          onChange={e => onColegioChange(e.target.value)}
          required={required}
          disabled={required && !territorio}
        >
          <option value="">{required ? 'Seleccionar...' : 'Todos'}</option>
          {colegiosFiltrados.map((c: Colegio) => (
            <option key={c.colegio} value={c.colegio}>{c.colegio}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
