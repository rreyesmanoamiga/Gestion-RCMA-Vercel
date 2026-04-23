import { useMemo } from 'react';
import * as Label from '@radix-ui/react-label';
import * as Select from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import { COLEGIOS, TERRITORIOS, type Colegio } from '@/lib/colegios';

interface ColegioSelectorProps {
  territorio: string;
  colegio: string;
  onTerritorioChange: (value: string) => void;
  onColegioChange: (value: string) => void;
  required?: boolean;
}

const selectTriggerClass = "w-full flex items-center justify-between px-3 py-2 border border-slate-300 rounded-md text-sm bg-white text-slate-900 focus:ring-2 focus:ring-slate-900 focus:outline-none";
const selectContentClass = "z-50 bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden";
const selectItemClass    = "px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer outline-none focus:bg-slate-100";
const labelClass         = "block text-xs font-bold text-slate-500 uppercase mb-1";

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

  const handleTerritorio = (val: string) => {
    onTerritorioChange(val === 'all' ? '' : val);
    onColegioChange('');
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Territorio */}
      <div>
        <Label.Root htmlFor="selector-territorio" className={labelClass}>
          Territorio {required && '*'}
        </Label.Root>
        <Select.Root value={territorio || 'all'} onValueChange={handleTerritorio}>
          <Select.Trigger id="selector-territorio" className={selectTriggerClass}>
            <Select.Value placeholder="Seleccionar..." />
            <Select.Icon><ChevronDown className="w-4 h-4 text-slate-400" /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={selectContentClass} position="popper" sideOffset={4}>
              <Select.Viewport>
                {!required && (
                  <Select.Item value="all" className={selectItemClass}>
                    <Select.ItemText>Todos</Select.ItemText>
                  </Select.Item>
                )}
                {TERRITORIOS.map((t: string) => (
                  <Select.Item key={t} value={t} className={selectItemClass}>
                    <Select.ItemText>{t}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      {/* Colegio */}
      <div>
        <Label.Root htmlFor="selector-colegio" className={labelClass}>
          Colegio {required && '*'}
        </Label.Root>
        <Select.Root
          value={colegio || 'all'}
          onValueChange={(v: string) => onColegioChange(v === 'all' ? '' : v)}
        >
          <Select.Trigger id="selector-colegio" className={selectTriggerClass}>
            <Select.Value placeholder="Seleccionar..." />
            <Select.Icon><ChevronDown className="w-4 h-4 text-slate-400" /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className={selectContentClass} position="popper" sideOffset={4}>
              <Select.Viewport>
                {!required && (
                  <Select.Item value="all" className={selectItemClass}>
                    <Select.ItemText>Todos</Select.ItemText>
                  </Select.Item>
                )}
                {colegiosFiltrados.map((c: Colegio) => (
                  <Select.Item key={c.colegio} value={c.colegio} className={selectItemClass}>
                    <Select.ItemText>{c.colegio}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
    </div>
  );
}
