import React, { useState } from 'react';
import { db } from '@/lib/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Search } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import StatusBadge from '@/components/shared/StatusBadge';
import ChecklistForm from '@/components/checklists/ChecklistForm';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COLEGIOS, TERRITORIOS } from '@/lib/colegios';

export default function Checklists() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterTerritorio, setFilterTerritorio] = useState('all');
  const [filterColegio, setFilterColegio] = useState('all');
  const queryClient = useQueryClient();

  const { data: checklists = [], isLoading } = useQuery({
    queryKey: ['checklists'],
    queryFn: () => db.Checklist.list('-created_at', 100),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => db.Project.list('-created_at', 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => db.Checklist.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklists'] });
      setShowForm(false);
    },
  });

  const colegiosPorTerritorio = filterTerritorio !== 'all'
    ? COLEGIOS.filter(c => c.territorio === filterTerritorio)
    : COLEGIOS;

  const filtered = checklists.filter(c => {
    if (filterType !== 'all' && c.infrastructure_type !== filterType) return false;
    if (filterTerritorio !== 'all' && c.territorio !== filterTerritorio) return false;
    if (filterColegio !== 'all' && c.colegio !== filterColegio) return false;
    if (search && !c.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getProjectName = (id) => projects.find(p => p.id === id)?.name || '';

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  }

  return (
    <div>
      <PageHeader title="Checklists de Inspección" subtitle="Validación visual de infraestructuras" actionLabel="Nueva Inspección" onAction={() => setShowForm(true)} />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 w-40" />
        </div>
        <Select value={filterTerritorio} onValueChange={v => { setFilterTerritorio(v); setFilterColegio('all'); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Territorio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Territorios</SelectItem>
            {TERRITORIOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterColegio} onValueChange={setFilterColegio}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Colegio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Colegios</SelectItem>
            {colegiosPorTerritorio.map(c => <SelectItem key={c.colegio} value={c.colegio}>{c.colegio}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="concreto">Concreto</SelectItem>
            <SelectItem value="metalica">Metálica</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No hay inspecciones"
          description="Crea tu primera inspección para validar el estado de tus infraestructuras."
          actionLabel="Nueva Inspección"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(checklist => {
            const itemCounts = { bueno: 0, regular: 0, malo: 0, critico: 0 };
            (checklist.items || []).forEach(item => { if (itemCounts[item.condition] !== undefined) itemCounts[item.condition]++; });

            return (
              <Link key={checklist.id} to={`/checklists/${checklist.id}`} className="bg-card rounded-xl border border-border p-5 hover:shadow-lg transition-all duration-300 group">
                <div className="flex items-start justify-between mb-3">
                  <StatusBadge status={checklist.overall_status} />
                  <div className="text-right shrink-0 ml-2">
                    {checklist.colegio && <p className="text-xs font-semibold text-primary">{checklist.colegio}</p>}
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {checklist.infrastructure_type === 'concreto' ? 'Concreto' : 'Metálica'}
                    </span>
                  </div>
                </div>
                <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">{checklist.title}</h3>
                {checklist.project_id && (
                  <p className="text-xs text-muted-foreground mb-2">Proyecto: {getProjectName(checklist.project_id)}</p>
                )}
                
                {/* Item summary */}
                <div className="flex gap-2 mb-3">
                  {itemCounts.bueno > 0 && <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">{itemCounts.bueno} ✓</span>}
                  {itemCounts.regular > 0 && <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">{itemCounts.regular} !</span>}
                  {itemCounts.malo > 0 && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">{itemCounts.malo} ✗</span>}
                  {itemCounts.critico > 0 && <span className="text-xs px-1.5 py-0.5 bg-red-200 text-red-800 rounded">{itemCounts.critico} ⚠</span>}
                </div>

                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{checklist.inspector || 'Sin inspector'}</span>
                  <span>{checklist.inspection_date ? format(new Date(checklist.inspection_date), 'dd MMM yyyy', { locale: es }) : ''}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ChecklistForm open={showForm} onClose={() => setShowForm(false)} onSubmit={data => createMutation.mutate(data)} projects={projects} />
    </div>
  );
}