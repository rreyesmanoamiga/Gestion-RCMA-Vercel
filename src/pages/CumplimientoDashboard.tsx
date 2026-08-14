import React, { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import PageHeader from '@/components/shared/PageHeader';
import {
  ShieldCheck, ShieldAlert, Clock, FileText, ChevronRight,
  type LucideIcon, ListTodo, CheckCircle2,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { useComplianceDocs, esRetraso, LoadingBlock, ErrorBlock } from '@/lib/complianceShared';

const ESTADO_COLORS: Record<string, string> = {
  Verificado: '#10b981',
  Pendiente: '#f97316',
  'Por revisar': '#f59e0b',
  Observaciones: '#ef4444',
};

interface KPICardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: LucideIcon;
  accent: string;
  to?: string;
}
function KPICard({ title, value, subtitle, icon: Icon, accent, to }: KPICardProps) {
  const inner = (
    <div className="bg-white rounded-xl border border-slate-200 p-5 pl-6 hover:shadow-md hover:border-slate-300 transition-all duration-200 h-full relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: accent }} />
      <Icon className="w-4 h-4 text-slate-300 mb-3" aria-hidden="true" />
      <p className="font-display text-4xl font-semibold text-[#00295A] mb-1 leading-none">{value}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
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

export default function CumplimientoDashboard() {
  const { data: docs = [], isLoading, isError, refetch } = useComplianceDocs();

  const { data: pendientesActivos = 0 } = useQuery({
    queryKey: ['compliance_pendientes_activos_dashboard'],
    queryFn: async () => {
      const { count } = await supabase
        .from('compliance_pendientes')
        .select('*', { count: 'exact', head: true })
        .not('estatus', 'in', '(completado,cancelado)');
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const kpis = useMemo(() => {
    const total = docs.length;
    const retraso = docs.filter(d => esRetraso(d, hoy)).length;
    const porExpirar = docs.filter(d => d.vigente === 'Por expirar').length;
    const verificados = docs.filter(d => d.estado === 'Verificado').length;
    const pctCumplimiento = total > 0 ? Math.round((verificados / total) * 100) : 0;
    return { total, retraso, porExpirar, verificados, pctCumplimiento };
  }, [docs, hoy]);

  const estadoPie = useMemo(() => {
    const conteo = new Map<string, number>();
    docs.forEach(d => conteo.set(d.estado, (conteo.get(d.estado) ?? 0) + 1));
    return Array.from(conteo.entries()).map(([name, value]) => ({ name, value }));
  }, [docs]);

  const topRetraso = useMemo(() => {
    const mapa = new Map<string, number>();
    docs.forEach(d => {
      if (esRetraso(d, hoy)) mapa.set(d.colegio.replace('Mano Amiga ', ''), (mapa.get(d.colegio.replace('Mano Amiga ', '')) ?? 0) + 1);
    });
    return Array.from(mapa.entries())
      .map(([colegio, retraso]) => ({ colegio, retraso }))
      .sort((a, b) => b.retraso - a.retraso)
      .slice(0, 8);
  }, [docs, hoy]);

  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
      <PageHeader title="Dashboard" subtitle="Vista general de Cumplimiento Normativo — Protección Civil y Donatarias Autorizadas" />

      {isError ? <ErrorBlock onRetry={() => refetch()} /> : isLoading ? <LoadingBlock /> : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KPICard title="Documentos" value={kpis.total} icon={FileText} accent="#4F82C2" to="/cumplimiento/documentos" />
            <KPICard title="En retraso" value={kpis.retraso} icon={ShieldAlert} accent="#ef4444" to="/cumplimiento/alertas" />
            <KPICard title="Por expirar" value={kpis.porExpirar} icon={Clock} accent="#ED7102" to="/cumplimiento/alertas" />
            <KPICard title="Verificados" value={kpis.verificados} icon={ShieldCheck} accent="#10b981" subtitle={`${kpis.pctCumplimiento}% del total`} to="/cumplimiento/documentos" />
            <KPICard title="Pendientes activos" value={pendientesActivos} icon={ListTodo} accent="#8b5cf6" to="/cumplimiento/seguimiento" />
          </div>

          {/* Gráficas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight mb-4">Distribución por estado</h2>
              {estadoPie.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">Sin datos.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={estadoPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {estadoPie.map((entry, i) => (
                        <Cell key={i} fill={ESTADO_COLORS[entry.name] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight mb-4">Top colegios con más retraso</h2>
              {topRetraso.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <CheckCircle2 className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm font-semibold">¡Sin retrasos! Todos los colegios al día</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={topRetraso} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="colegio" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="retraso" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Accesos rápidos */}
          <div>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Accesos Rápidos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                { label: 'Panel General', path: '/cumplimiento/panel-general', icon: ShieldCheck, color: 'bg-blue-50 text-blue-600 border-blue-100' },
                { label: 'Documentos',    path: '/cumplimiento/documentos',    icon: FileText,     color: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
                { label: 'Alertas',       path: '/cumplimiento/alertas',       icon: ShieldAlert,  color: 'bg-red-50 text-red-600 border-red-100' },
                { label: 'Seguimiento',   path: '/cumplimiento/seguimiento',   icon: ListTodo,     color: 'bg-purple-50 text-purple-600 border-purple-100' },
              ] as { label: string; path: string; icon: LucideIcon; color: string }[]).map(({ label, path, icon: Icon, color }) => (
                <Link key={path} to={path}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${color} hover:shadow-md transition-all duration-200 group`}>
                  <Icon className="w-6 h-6" />
                  <span className="text-xs font-bold text-center leading-tight">{label}</span>
                  <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
