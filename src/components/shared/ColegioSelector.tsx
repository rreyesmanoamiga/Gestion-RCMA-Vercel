import { useMemo } from 'react';
// @ts-ignore
import { Label } from '@/components/ui/label';
// @ts-ignore
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COLEGIOS, TERRITORIOS, type Colegio } from '@/lib/colegios';

interface ColegioSelectorProps {
  territorio: string;
  colegio: string;
  onTerritorioChange: (value: string) => void;
  onColegioChange: (value: string) => void;
  required?: boolean;
}

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
      <div>
        <Label htmlFor="selector-territorio">
          Territorio {required && '*'}
        </Label>
        <Select value={territorio || 'all'} onValueChange={handleTerritorio}>
          <SelectTrigger id="selector-territorio">
            <SelectValue placeholder="Seleccionar..." />
          </SelectTrigger>
          <SelectContent>
            {!required && <SelectItem value="all">Todos</SelectItem>}
            {TERRITORIOS.map((t: string) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="selector-colegio">
          Colegio {required && '*'}
        </Label>
        <Select
          value={colegio || 'all'}
          onValueChange={(v: string) => onColegioChange(v === 'all' ? '' : v)}
        >
          <SelectTrigger id="selector-colegio">
            <SelectValue placeholder="Seleccionar..." />
          </SelectTrigger>
          <SelectContent>
            {!required && <SelectItem value="all">Todos</SelectItem>}
            {colegiosFiltrados.map((c: Colegio) => (
              <SelectItem key={c.colegio} value={c.colegio}>{c.colegio}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}