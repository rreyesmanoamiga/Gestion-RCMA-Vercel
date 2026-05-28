import React, { useMemo } from 'react';
import { db } from '@/lib/db';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FolderKanban, ClipboardCheck, AlertTriangle, ArrowRight,
  Building2, MapPin, TicketCheck, FolderOpen, CalendarDays, ClockAlert,
  ChevronRight, Activity, ClipboardList, type LucideIcon
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import StatusBadge from '@/components/shared/StatusBadge';
import { COLEGIOS, type Colegio } from '@/lib/colegios';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts';
import { ACTIVIDADES_BASE, COLORES_CATEGORIA, proximosMantenimientos, type ActividadBase } from '@/lib/maintenanceActivities';

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface Project         { id: string; name?: string; status?: string; priority?: string; colegio?: string; territorio?: string; location?: string; progress?: number; created_at?: string; }
interface Checklist       { id: string; overall_status?: string; colegio?: string; territorio?: string; }
interface MaintenanceRecord { id: string; title?: string; status?: string; priority?: string; colegio?: string; territorio?: string; type?: string; scheduled_date?: string; }
interface Pendiente       { id: string; nombre_proyecto?: string; estatus?: string; colegio?: string; territorio?: string; created_at?: string; }
interface TicketRecord    { id: string; folio?: string; estatus?: string; titulo?: string; colegio?: string; created_at?: string; }
interface TicketMASRecord { id: string; folio?: string; estatus?: string; colegio?: string; created_at?: string; }
interface ActivityItem    { id: string; label: string; sub: string; type: string; date: string; to?: string; }

// ─── Colores ──────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  en_proceso: '#3b82f6', en_espera: '#f59e0b',
  completado: '#10b981', cancelado: '#ef4444',
  pendiente:  '#8b5cf6', revision:  '#06b6d4',
  autorizado: '#10b981', en_revision: '#06b6d4',
};
const STATUS_LABELS: Record<string, string> = {
  en_proceso: 'En Proceso', en_espera: 'En Espera',
  completado: 'Completado', cancelado: 'Cancelado',
  pendiente:  'Pendiente',  revision:  'Revisión',
  autorizado: 'Autorizado', en_revision: 'En Revisión',
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
interface KPICardProps {
  title: string; value: number | string; subtitle?: string;
  icon: LucideIcon; color: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal';
  trend?: 'up' | 'down' | 'neutral'; trendLabel?: string; to?: string;
}
function KPICard({ title, value, subtitle, icon: Icon, color, trend, trendLabel, to }: KPICardProps) {
  const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
    blue:   { bg: 'bg-blue-50',    icon: 'text-blue-600',    border: 'border-blue-100' },
    green:  { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' },
    orange: { bg: 'bg-amber-50',   icon: 'text-amber-600',   border: 'border-amber-100' },
    red:    { bg: 'bg-red-50',     icon: 'text-red-600',     border: 'border-red-100' },
    purple: { bg: 'bg-purple-50',  icon: 'text-purple-600',  border: 'border-purple-100' },
    teal:   { bg: 'bg-teal-50',    icon: 'text-teal-600',    border: 'border-teal-100' },
  };
  const c = colorMap[color];
  const inner = (
    <div className={`bg-white rounded-xl border ${c.border} p-4 hover:shadow-md transition-all duration-200 h-full`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
        {trend && trendLabel && (
          <span className={`text-xs font-semibold flex items-center gap-0.5 px-2 py-0.5 rounded-full ${
            trend === 'up' ? 'bg-emerald-50 text-emerald-600' :
            trend === 'down' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendLabel}
          </span>
        )}
      </div>
      <p className="text-3xl font-black text-slate-900 mb-0.5">{value}</p>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{title}</p>
      {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2">
        <p className="text-xs font-bold text-slate-800">{payload[0].name}</p>
        <p className="text-sm font-black text-slate-900">{payload[0].value}</p>
      </div>
    );
  }
  return null;
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Dashboard() {
  const projectsQuery    = useQuery({ queryKey: ['projects'],    queryFn: () => db.Project.list('-created_at', 500) });
  const checklistsQuery  = useQuery({ queryKey: ['checklists'],  queryFn: () => db.Checklist.list('-created_at', 500) });
  const maintenanceQuery = useQuery({ queryKey: ['maintenance'], queryFn: () => db.MaintenanceRecord.list('-created_at', 500) });
  const pendientesQuery  = useQuery({ queryKey: ['pendientes'],  queryFn: () => db.Pendiente.list('-fecha_actualizacion', 100) });

  const ticketsQuery = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  const ticketsMasQuery = useQuery({
    queryKey: ['tickets_mas_dash'],
    queryFn: async () => {
      const { data } = await supabase.from('tickets_mas').select('id, folio, estatus, colegio, created_at').order('created_at', { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  const customMttoQuery = useQuery({
    queryKey: ['customMaintenance_dash'],
    queryFn: async () => {
      const { data } = await supabase.from('custom_maintenance').select('*');
      return data ?? [];
    },
  });

  const projects    = useMemo(() => (projectsQuery.data    ?? []) as unknown as Project[],            [projectsQuery.data]);
  const checklists  = useMemo(() => (checklistsQuery.data  ?? []) as unknown as Checklist[],          [checklistsQuery.data]);
  const maintenance = useMemo(() => (maintenanceQuery.data ?? []) as unknown as MaintenanceRecord[],  [maintenanceQuery.data]);
  const pendientes  = useMemo(() => (pendientesQuery.data  ?? []) as unknown as Pendiente[],          [pendientesQuery.data]);
  const tickets     = useMemo(() => (ticketsQuery.data     ?? []) as unknown as TicketRecord[],       [ticketsQuery.data]);
  const ticketsMas  = useMemo(() => (ticketsMasQuery.data  ?? []) as unknown as TicketMASRecord[],    [ticketsMasQuery.data]);

  const isLoading = projectsQuery.isLoading || checklistsQuery.isLoading || maintenanceQuery.isLoading;

  // ─── Actividades para próximos mantenimientos (base + overrides) ────────────
  const actividadesVigentes = useMemo<ActividadBase[]>(() => {
    const custom = (customMttoQuery.data ?? []) as any[];
    const overrides: Record<number, ActividadBase> = {};

    custom.filter(r => r.base_id != null).forEach(r => {
      overrides[r.base_id as number] = {
        id:             r.base_id,
        categoria:      r.categoria,
        actividad:      r.actividad,
        tipo:           r.tipo as ActividadBase['tipo'],
        frecuencia:     r.frecuencia,
        frecuenciaDias: r.frecuencia_dias,
      };
    });

    const base: ActividadBase[] = ACTIVIDADES_BASE.map(a => overrides[a.id as number] ?? a);
    const customPuras: ActividadBase[] = custom.filter(r => r.base_id == null).map(r => ({
      id:             r.id,
      categoria:      r.categoria,
      actividad:      r.actividad,
      tipo:           r.tipo as ActividadBase['tipo'],
      frecuencia:     r.frecuencia,
      frecuenciaDias: r.frecuencia_dias,
    }));

    return [...base, ...customPuras];
  }, [customMttoQuery.data]);

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    activeProjects:        projects.filter(p => p.status === 'en_proceso' || p.status === 'en_espera').length,
    completedProjects:     projects.filter(p => p.status === 'completado').length,
    criticalChecklists:    checklists.filter(c => c.overall_status === 'critico' || c.overall_status === 'malo').length,
    pendingMaintenance:    pendientes.filter(m => m.estatus === 'pendiente' || m.estatus === 'en_proceso').length,
    urgentItems:           projects.filter(p => p.priority === 'urgente' && p.status !== 'completado' && p.status !== 'cancelado').length,
    openTickets:           tickets.filter(t => t.estatus !== 'cerrado' && t.estatus !== 'resuelto').length,
    ticketsMasPendientes:  ticketsMas.filter(t => t.estatus === 'pendiente' || t.estatus === 'en_revision').length,
    ticketsMasAutorizados: ticketsMas.filter(t => t.estatus === 'autorizado').length,
  }), [projects, checklists, pendientes, tickets, ticketsMas]);

  // ─── Gráficas de distribución ──────────────────────────────────────────────
  const projectsByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    projects.forEach(p => { const k = p.status ?? 'sin_estado'; map[k] = (map[k] ?? 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({ name: STATUS_LABELS[status] ?? status, value: count, color: STATUS_COLORS[status] ?? '#94a3b8' }));
  }, [projects]);

  const ticketsByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    tickets.forEach(t => { const k = t.estatus ?? 'sin_estado'; map[k] = (map[k] ?? 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({ name: STATUS_LABELS[status] ?? status, value: count, color: STATUS_COLORS[status] ?? '#94a3b8' }));
  }, [tickets]);

  // ─── Tendencia últimas 5 semanas ───────────────────────────────────────────
  const tendencia = useMemo(() => {
    const getWeekKey = (dateStr: string) => {
      const d = new Date(dateStr);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      monday.setHours(0, 0, 0, 0);
      return monday.toISOString().slice(0, 10);
    };
    const weekMap: Record<string, { proyectos: number; tickets: number; ticketsMas: number }> = {};
    const hace35 = new Date(); hace35.setDate(hace35.getDate() - 35);

    const ensure = (k: string) => { if (!weekMap[k]) weekMap[k] = { proyectos: 0, tickets: 0, ticketsMas: 0 }; };

    projects.filter(p => p.created_at && new Date(p.created_at) >= hace35).forEach(p => {
      const k = getWeekKey(p.created_at!); ensure(k); weekMap[k].proyectos++;
    });
    tickets.filter(t => t.created_at && new Date(t.created_at) >= hace35).forEach(t => {
      const k = getWeekKey(t.created_at!); ensure(k); weekMap[k].tickets++;
    });
    ticketsMas.filter(t => t.created_at && new Date(t.created_at) >= hace35).forEach(t => {
      const k = getWeekKey(t.created_at!); ensure(k); weekMap[k].ticketsMas++;
    });

    return Object.entries(weekMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, counts]) => ({
        semana: new Date(week + 'T12:00:00').toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }),
        ...counts,
      }));
  }, [projects, tickets, ticketsMas]);

  // ─── Próximos mantenimientos (7 días) ─────────────────────────────────────
  const proximosMttos = useMemo(() => proximosMantenimientos(actividadesVigentes, 7).slice(0, 6), [actividadesVigentes]);

  // ─── Colegios con alertas ──────────────────────────────────────────────────
  const urgentColegios = useMemo(() => {
    const s = new Set<string>();
    projects.forEach(p => { if (p.priority === 'urgente' && p.status !== 'completado' && p.colegio) s.add(p.colegio); });
    maintenance.forEach(m => { if (m.priority === 'urgente' && m.status !== 'completado' && m.colegio) s.add(m.colegio); });
    checklists.forEach(c => { if ((c.overall_status === 'critico' || c.overall_status === 'malo') && c.colegio) s.add(c.colegio); });
    return s;
  }, [projects, maintenance, checklists]);

  // ─── Resumen por territorio (NORTE, MEXICO, FMA) ──────────────────────────
  const territorySummary = useMemo(() =>
    ['NORTE', 'MEXICO', 'FMA'].map(territorio => {
      const colegios  = COLEGIOS.filter((c: Colegio) => c.territorio === territorio);
      const tProjects = projects.filter(p => p.territorio === territorio);
      const tCheck    = checklists.filter(c => c.territorio === territorio);
      const tMaint    = maintenance.filter(m => m.territorio === territorio);
      const sinAlertas = colegios.filter(c => !urgentColegios.has(c.colegio)).length;
      const pct        = colegios.length > 0 ? Math.round((sinAlertas / colegios.length) * 100) : 100;
      return { territorio, colegios, tProjects, tCheck, tMaint, sinAlertas, pct };
    }),
    [projects, checklists, maintenance, urgentColegios]
  );

  // ─── Actividad reciente ────────────────────────────────────────────────────
  const recentActivity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    projects.slice(0, 3).forEach(p => items.push({ id: `p-${p.id}`, label: p.name ?? 'Proyecto sin nombre', sub: p.colegio ?? '', type: 'proyecto', date: p.created_at ?? '', to: `/proyectos/${p.id}` }));
    tickets.slice(0, 3).forEach(t => items.push({ id: `t-${t.id}`, label: t.titulo ?? `Ticket ${t.folio ?? ''}`, sub: t.colegio ?? '', type: 'ticket', date: t.created_at ?? '', to: '/tickets' }));
    ticketsMas.slice(0, 3).forEach(t => items.push({ id: `tm-${t.id}`, label: `Ticket MAS ${t.folio ?? ''}`, sub: t.colegio ?? '', type: 'ticketMas', date: t.created_at ?? '', to: '/ticket-mas' }));
    pendientes.slice(0, 2).forEach(p => items.push({ id: `pe-${p.id}`, label: p.nombre_proyecto ?? 'Pendiente sin nombre', sub: p.colegio ?? '', type: 'pendiente', date: p.created_at ?? '', to: '/pendientes' }));
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [projects, tickets, ticketsMas, pendientes]);

  const recentProjects = useMemo(() => projects.slice(0, 5), [projects]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const typeIcon: Record<string, LucideIcon>  = { proyecto: FolderKanban, ticket: TicketCheck, ticketMas: ClipboardList, pendiente: ClockAlert };
  const typeColor: Record<string, string>     = { proyecto: 'bg-blue-100 text-blue-600', ticket: 'bg-red-100 text-red-600', ticketMas: 'bg-teal-100 text-teal-600', pendiente: 'bg-amber-100 text-amber-600' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Colegios Mano Amiga</h1>
          </div>
          <p className="text-sm text-slate-500 ml-11">
            Panel de Gestión · {projects.length} proyectos · {tickets.length} tickets · {ticketsMas.length} tickets MAS · {pendientes.length} pendientes
          </p>
        </div>
        <div className="hidden sm:flex items-center justify-center bg-white rounded-xl p-3 shadow-sm border border-slate-100">
          <img src="/logo.png" alt="Mano Amiga" className="h-16 w-auto object-contain" />
        </div>
      </div>

      {/* ─── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard title="Proyectos Activos"  value={stats.activeProjects}
          subtitle={`${stats.completedProjects} completados`}
          icon={FolderKanban} color="blue" to="/proyectos"
          trend={stats.activeProjects > 0 ? 'up' : 'neutral'} trendLabel={`${projects.length} total`} />
        <KPICard title="Tickets Abiertos"   value={stats.openTickets}
          subtitle={`${tickets.length} tickets totales`}
          icon={TicketCheck} color="red" to="/tickets"
          trend={stats.openTickets > 5 ? 'down' : 'neutral'} trendLabel={`${tickets.length} total`} />
        <KPICard title="Ticket MAS"         value={stats.ticketsMasPendientes}
          subtitle={`${stats.ticketsMasAutorizados} autorizados`}
          icon={ClipboardList} color="teal" to="/ticket-mas"
          trend={stats.ticketsMasPendientes > 0 ? 'down' : 'up'} trendLabel={`${ticketsMas.length} total`} />
        <KPICard title="Pendientes"         value={stats.pendingMaintenance}
          subtitle={`${pendientes.length} registros`}
          icon={ClockAlert} color="orange" to="/pendientes"
          trend="neutral" trendLabel={`${pendientes.length} total`} />
        <KPICard title="Inspecciones"       value={stats.criticalChecklists > 0 ? stats.criticalChecklists : checklists.length}
          subtitle={stats.criticalChecklists > 0 ? 'requieren atención' : 'sin alertas críticas'}
          icon={ClipboardCheck} color={stats.criticalChecklists > 0 ? 'red' : 'green'} to="/checklists"
          trend={stats.criticalChecklists > 0 ? 'down' : 'up'} trendLabel={`${checklists.length} total`} />
        <KPICard title="Urgentes"           value={stats.urgentItems}
          subtitle="Acción inmediata"
          icon={AlertTriangle} color={stats.urgentItems > 0 ? 'red' : 'green'}
          trend={stats.urgentItems > 0 ? 'down' : 'up'} trendLabel="prioridad alta" />
      </div>

      {/* ─── Gráficas ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dona — proyectos */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center"><FolderKanban className="w-4 h-4 text-blue-600" /></div>
            <div><h2 className="text-sm font-bold text-slate-800">Proyectos por Estatus</h2><p className="text-xs text-slate-400">{projects.length} totales</p></div>
          </div>
          {projectsByStatus.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-slate-400">Sin datos</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={projectsByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3} dataKey="value">
                  {projectsByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Barras — tickets */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center"><TicketCheck className="w-4 h-4 text-red-600" /></div>
            <div><h2 className="text-sm font-bold text-slate-800">Tickets por Estatus</h2><p className="text-xs text-slate-400">{tickets.length} totales</p></div>
          </div>
          {ticketsByStatus.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-slate-400">Sin tickets</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={ticketsByStatus} barSize={28} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {ticketsByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Área — tendencia últimas 5 semanas */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center"><Activity className="w-4 h-4 text-purple-600" /></div>
            <div><h2 className="text-sm font-bold text-slate-800">Tendencia (5 semanas)</h2><p className="text-xs text-slate-400">Nuevos registros por semana</p></div>
          </div>
          {tendencia.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-slate-400">Sin actividad reciente</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={tendencia} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="gProyectos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gTickets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gMas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="proyectos"  name="Proyectos"   stroke="#3b82f6" fill="url(#gProyectos)" strokeWidth={2} dot={{ r: 3 }} />
                <Area type="monotone" dataKey="tickets"    name="Tickets"     stroke="#ef4444" fill="url(#gTickets)"   strokeWidth={2} dot={{ r: 3 }} />
                <Area type="monotone" dataKey="ticketsMas" name="Tickets MAS" stroke="#14b8a6" fill="url(#gMas)"       strokeWidth={2} dot={{ r: 3 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─── Próximos Mantenimientos (7 días) ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-purple-600" /> Próximos Mantenimientos — Esta Semana
          </h2>
          <Link to="/calendario" className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:underline">
            Ver calendario <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {proximosMttos.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-400">Sin mantenimientos programados para los próximos 7 días</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
            {proximosMttos.map(({ actividad: act, fecha }, i) => {
              const diasRestantes = Math.round((fecha.getTime() - new Date().setHours(0,0,0,0)) / 86400000);
              const color = COLORES_CATEGORIA[act.categoria] ?? '#64748b';
              return (
                <div key={`${act.id}-${i}`} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{act.actividad}</p>
                    <p className="text-xs text-slate-500">{act.categoria}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold" style={{ color }}>
                      {diasRestantes === 0 ? 'Hoy' : `En ${diasRestantes}d`}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {fecha.toLocaleDateString('es-MX', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Territorios (NORTE / MEXICO / FMA) ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {territorySummary.map(({ territorio, colegios, tProjects, tCheck, tMaint, sinAlertas, pct }) => (
          <div key={territorio} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-slate-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Territorio {territorio}</h2>
                  <p className="text-xs text-slate-400">{colegios.length} colegios</p>
                </div>
              </div>
              <span className={`text-sm font-black px-3 py-1 rounded-full ${
                pct >= 80 ? 'bg-emerald-100 text-emerald-700' :
                pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                {pct}% OK
              </span>
            </div>
            <div className="mb-4">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{sinAlertas} de {colegios.length} sin alertas</p>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'Proyectos',    value: tProjects.length },
                { label: 'Inspecciones', value: tCheck.length },
                { label: 'Mtto. Pend.',  value: tMaint.filter(m => m.status !== 'completado').length },
              ].map(s => (
                <div key={s.label} className="text-center p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-xl font-black text-slate-900">{s.value}</p>
                  <p className="text-[10px] text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {colegios.map(c => (
                <span key={c.colegio}
                  className={`text-xs px-2 py-0.5 rounded-md font-semibold border ${
                    urgentColegios.has(c.colegio)
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  {c.colegio}
                </span>
              ))}
              {colegios.length === 0 && <p className="text-xs text-slate-400">Sin colegios registrados</p>}
            </div>
            {urgentColegios.size > 0 && <p className="text-[10px] text-slate-400 mt-2">🔴 Con alertas activas</p>}
          </div>
        ))}
      </div>

      {/* ─── Proyectos recientes + Actividad ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-blue-600" /> Proyectos Recientes
            </h2>
            <Link to="/proyectos" className="text-xs text-blue-600 font-semibold flex items-center gap-1 hover:underline">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {recentProjects.length === 0 && <p className="p-5 text-sm text-slate-400 text-center">No hay proyectos registrados</p>}
            {recentProjects.map(project => (
              <Link key={project.id} to={`/proyectos/${project.id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors group">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{project.name}</p>
                  <p className="text-xs text-slate-400">{project.colegio ?? project.location ?? 'Sin ubicación'}</p>
                  {typeof project.progress === 'number' && (
                    <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full w-32">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${project.progress}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <StatusBadge status={project.status} />
                  <ChevronRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-600" /> Actividad Reciente
            </h2>
          </div>
          <div className="divide-y divide-slate-50">
            {recentActivity.length === 0 && <p className="p-5 text-sm text-slate-400 text-center">Sin actividad reciente</p>}
            {recentActivity.map(item => {
              const Icon = typeIcon[item.type] ?? Activity;
              const col  = typeColor[item.type] ?? 'bg-slate-100 text-slate-500';
              return (
                <Link key={item.id} to={item.to ?? '#'}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors group">
                  <div className={`w-7 h-7 rounded-lg ${col} flex items-center justify-center shrink-0`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.sub || item.type}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Accesos Rápidos ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Accesos Rápidos</h2>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-3">
          {([
            { label: 'Ticket MAS',    path: '/ticket-mas',    icon: ClipboardList,      color: 'bg-teal-50 text-teal-600 border-teal-100',           count: stats.ticketsMasPendientes },
            { label: 'Tickets',       path: '/tickets',       icon: TicketCheck,    color: 'bg-red-50 text-red-600 border-red-100',               count: stats.openTickets },
            { label: 'Proyectos',     path: '/proyectos',     icon: FolderKanban,   color: 'bg-blue-50 text-blue-600 border-blue-100',            count: stats.activeProjects },
            { label: 'Anteproyectos', path: '/anteproyectos', icon: FolderOpen,     color: 'bg-indigo-50 text-indigo-600 border-indigo-100',      count: null },
            { label: 'Checklists',    path: '/checklists',    icon: ClipboardCheck, color: 'bg-emerald-50 text-emerald-600 border-emerald-100',   count: checklists.length },
            { label: 'Pendientes',    path: '/pendientes',    icon: ClockAlert,     color: 'bg-amber-50 text-amber-600 border-amber-100',         count: stats.pendingMaintenance },
            { label: 'Calendario',    path: '/calendario',    icon: CalendarDays,   color: 'bg-purple-50 text-purple-600 border-purple-100',      count: proximosMttos.length > 0 ? proximosMttos.length : null },
          ] as { label: string; path: string; icon: LucideIcon; color: string; count: number | null }[]).map(
            ({ label, path, icon: Icon, color, count }) => (
              <Link key={path} to={path}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${color} hover:shadow-md transition-all duration-200 group relative`}>
                <div className="relative">
                  <Icon className="w-6 h-6" />
                  {count !== null && count > 0 && (
                    <span className="absolute -top-2 -right-2 text-[10px] font-black bg-white border border-current rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-center leading-tight">{label}</span>
                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )
          )}
        </div>
      </div>
    </div>
  );
}
