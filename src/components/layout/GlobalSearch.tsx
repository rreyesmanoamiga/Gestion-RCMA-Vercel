import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import {
  Search, X, FolderKanban, TicketCheck, Inbox, BookOpen, ClipboardCheck,
  Package, CheckSquare, Building2, Loader2,
} from 'lucide-react';

interface SearchResult {
  id:        string;
  titulo:    string;
  subtitulo: string;
  modulo:    string;
  icon:      React.ElementType;
  color:     string;
  link:      string;
}

const MODULOS_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  proyectos:     { label: 'Proyectos',            icon: FolderKanban,   color: 'text-blue-600 bg-blue-50' },
  tickets:       { label: 'Tickets Registrados',  icon: TicketCheck,    color: 'text-emerald-600 bg-emerald-50' },
  tickets_mas:   { label: 'Ticket MAS',           icon: TicketCheck,    color: 'text-red-600 bg-red-50' },
  solicitudes:   { label: 'Solicitudes',          icon: Inbox,          color: 'text-amber-600 bg-amber-50' },
  anteproyectos: { label: 'Anteproyectos',        icon: BookOpen,       color: 'text-violet-600 bg-violet-50' },
  checklists:    { label: 'Checklists',           icon: ClipboardCheck, color: 'text-teal-600 bg-teal-50' },
  insumos:       { label: 'Insumos',              icon: Package,        color: 'text-orange-600 bg-orange-50' },
  nexus:         { label: 'NEXUS',                icon: CheckSquare,    color: 'text-indigo-600 bg-indigo-50' },
  levantamiento: { label: 'Levantamiento Nacional', icon: Building2,    color: 'text-slate-600 bg-slate-100' },
};

async function buscarGlobal(q: string): Promise<SearchResult[]> {
  const like = `%${q}%`;
  const results: SearchResult[] = [];

  const queries = [
    supabase.from('projects').select('id,name,folio,colegio,territorio')
      .or(`name.ilike.${like},folio.ilike.${like},colegio.ilike.${like}`).limit(5),
    supabase.from('tickets').select('id,folio_num,nombre_proyecto,colegio')
      .or(`folio_num.ilike.${like},nombre_proyecto.ilike.${like},colegio.ilike.${like}`).limit(5),
    supabase.from('tickets_mas').select('id,folio,colegio,descripcion')
      .or(`folio.ilike.${like},colegio.ilike.${like},descripcion.ilike.${like}`).limit(5),
    supabase.from('solicitudes').select('id,nombre_proyecto,nombre_centro,nombre_solicitante')
      .or(`nombre_proyecto.ilike.${like},nombre_centro.ilike.${like},nombre_solicitante.ilike.${like}`).limit(5),
    supabase.from('anteproyectos').select('id,nombre_proyecto,colegio')
      .or(`nombre_proyecto.ilike.${like},colegio.ilike.${like}`).limit(5),
    supabase.from('checklists').select('id,titulo,colegio')
      .or(`titulo.ilike.${like},colegio.ilike.${like}`).limit(5),
    supabase.from('insumos_requisiciones').select('id,folio')
      .ilike('folio', like).limit(5),
    supabase.from('nexus_pendientes').select('id,titulo,colegio')
      .or(`titulo.ilike.${like},colegio.ilike.${like}`).limit(5),
    supabase.from('levantamiento_planteles').select('id,colegio_nombre,zona')
      .ilike('colegio_nombre', like).limit(5),
  ] as const;

  const [projects, tickets, ticketsMas, solicitudes, anteproyectos, checklists, insumos, nexus, planteles] =
    await Promise.allSettled(queries);

  const meta = (mod: string) => MODULOS_META[mod];

  if (projects.status === 'fulfilled') (projects.value.data ?? []).forEach((p: any) => {
    results.push({ id: p.id, titulo: p.name ?? 'Sin nombre', subtitulo: [p.folio, p.colegio].filter(Boolean).join(' — '), modulo: 'proyectos', icon: meta('proyectos').icon, color: meta('proyectos').color, link: `/proyectos/${p.id}` });
  });
  if (tickets.status === 'fulfilled') (tickets.value.data ?? []).forEach((t: any) => {
    results.push({ id: t.id, titulo: t.folio_num ?? 'Sin folio', subtitulo: [t.nombre_proyecto, t.colegio].filter(Boolean).join(' — '), modulo: 'tickets', icon: meta('tickets').icon, color: meta('tickets').color, link: '/tickets' });
  });
  if (ticketsMas.status === 'fulfilled') (ticketsMas.value.data ?? []).forEach((t: any) => {
    results.push({ id: t.id, titulo: t.folio ?? 'Sin folio', subtitulo: [t.colegio, t.descripcion?.slice(0, 50)].filter(Boolean).join(' — '), modulo: 'tickets_mas', icon: meta('tickets_mas').icon, color: meta('tickets_mas').color, link: '/ticket-mas' });
  });
  if (solicitudes.status === 'fulfilled') (solicitudes.value.data ?? []).forEach((s: any) => {
    results.push({ id: s.id, titulo: s.nombre_proyecto ?? 'Sin nombre', subtitulo: [s.nombre_centro, s.nombre_solicitante].filter(Boolean).join(' — '), modulo: 'solicitudes', icon: meta('solicitudes').icon, color: meta('solicitudes').color, link: '/solicitudes' });
  });
  if (anteproyectos.status === 'fulfilled') (anteproyectos.value.data ?? []).forEach((a: any) => {
    results.push({ id: a.id, titulo: a.nombre_proyecto ?? 'Sin nombre', subtitulo: a.colegio ?? '', modulo: 'anteproyectos', icon: meta('anteproyectos').icon, color: meta('anteproyectos').color, link: '/anteproyectos' });
  });
  if (checklists.status === 'fulfilled') (checklists.value.data ?? []).forEach((c: any) => {
    results.push({ id: c.id, titulo: c.titulo ?? 'Sin título', subtitulo: c.colegio ?? '', modulo: 'checklists', icon: meta('checklists').icon, color: meta('checklists').color, link: `/checklists/${c.id}` });
  });
  if (insumos.status === 'fulfilled') (insumos.value.data ?? []).forEach((i: any) => {
    results.push({ id: i.id, titulo: i.folio ?? 'Sin folio', subtitulo: 'Requisición de Insumos', modulo: 'insumos', icon: meta('insumos').icon, color: meta('insumos').color, link: '/insumos' });
  });
  if (nexus.status === 'fulfilled') (nexus.value.data ?? []).forEach((n: any) => {
    results.push({ id: n.id, titulo: n.titulo ?? 'Sin título', subtitulo: n.colegio ?? 'Pendiente NEXUS', modulo: 'nexus', icon: meta('nexus').icon, color: meta('nexus').color, link: '/nexus' });
  });
  if (planteles.status === 'fulfilled') (planteles.value.data ?? []).forEach((p: any) => {
    results.push({ id: p.id, titulo: p.colegio_nombre ?? 'Sin nombre', subtitulo: p.zona ?? 'Levantamiento Nacional', modulo: 'levantamiento', icon: meta('levantamiento').icon, color: meta('levantamiento').color, link: '/levantamiento' });
  });

  return results;
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await buscarGlobal(q.trim());
        setResults(r);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (v: string) => {
    setQuery(v);
    setOpen(true);
    runSearch(v);
  };

  const handleSelect = (r: SearchResult) => {
    navigate(r.link);
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  const clear = () => { setQuery(''); setResults([]); setOpen(false); };

  // Agrupar resultados por módulo, preservando orden de aparición
  const grupos = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.modulo] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div ref={ref} className="relative w-full max-w-md min-w-0">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Buscar folio, proyecto, colegio…"
          className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 rounded-full bg-slate-50 focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 focus:outline-none transition-colors"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
        {!loading && query && (
          <button onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute left-0 mt-2 w-full min-w-[22rem] bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-400">Buscando…</div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">Sin resultados para "{query}"</div>
          ) : (
            Object.entries(grupos).map(([modulo, items]) => (
              <div key={modulo}>
                <div className="px-4 py-1.5 bg-slate-50 border-b border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">{MODULOS_META[modulo]?.label ?? modulo}</p>
                </div>
                {items.map(r => {
                  const Icon = r.icon;
                  return (
                    <div key={r.modulo + r.id}
                      onClick={() => handleSelect(r)}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{r.titulo}</p>
                        {r.subtitulo && <p className="text-xs text-slate-500 truncate">{r.subtitulo}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
