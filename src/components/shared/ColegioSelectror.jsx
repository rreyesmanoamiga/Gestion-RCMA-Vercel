import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COLEGIOS, TERRITORIOS } from '@/lib/colegios';

export default function ColegioSelector({ territorio, colegio, onTerritorioChange, onColegioChange, required = false }) {
  const colegiosFiltrados = territorio
    ? COLEGIOS.filter(c => c.territorio === territorio)
    : COLEGIOS;

  const handleTerritorio = (val) => {
    onTerritorioChange(val === 'all' ? '' : val);
    onColegioChange(''); // reset colegio when territory changes
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label>Territorio {required && '*'}</Label>
        <Select value={territorio || 'all'} onValueChange={handleTerritorio}>
          <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
          <SelectContent>
            {!required && <SelectItem value="all">Todos</SelectItem>}
            {TERRITORIOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Colegio {required && '*'}</Label>
        <Select value={colegio || 'all'} onValueChange={v => onColegioChange(v === 'all' ? '' : v)}>
          <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
          <SelectContent>
            {!required && <SelectItem value="all">Todos</SelectItem>}
            {colegiosFiltrados.map(c => <SelectItem key={c.colegio} value={c.colegio}>{c.colegio}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}