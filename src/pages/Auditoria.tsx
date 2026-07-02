import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { usePermissions } from '@/hooks/usePermissions';
import {
  ShieldAlert, Filter, LogIn, LogOut, UserPlus, CheckCircle2, PlusCircle,
  Pencil, Ban, Trash2, Award, ChevronDown, User as UserIcon,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const cardClass  = "bg-white rounded-xl border border-slate-200 shadow-sm p-5";
const selectClass = "px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-slate-900 focus:outline-none";
const PAGE_SIZE = 30;

interface AuditRow {
  id:             string;
  created_at:     string;
  usuario_id:     string | null;
  usuario_nombre: string | null;
  usuario_email:  string | null;
  accion:         string;
  modulo:         string;
  registro_id:    string | null;
  registro_ref:   string | null;
  detalle:        Record<string, unknown> | null;
  en_nombre_de:   string | null;
}

const ACCION_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  login:               { label: 'Inicio de sesión',       icon: LogIn,        color: 'bg-slate-100 text-slate-600' },
  logout:              { label: 'Cierre de sesión',       icon: LogOut,       color: 'bg-slate-100 text-slate-500' },
  invitacion_enviada:  { label: 'Invitación enviada',      icon: UserPlus,     color: 'bg-blue-50 text-blue-600' },
  invitacion_aceptada: { label: 'Invitación aceptada',     icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
  crear:               { label: 'Creación',                icon: PlusCircle,   color: 'bg-teal-50 text-teal-600' },
  editar:              { label: 'Edición',                 icon: Pencil,       color: 'bg-amber-50 text-amber-600' },
  autorizar:           { label: 'Autorización',             icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
  completar:           { label: 'Completado',              icon: Award,        color: 'bg-emerald-50 text-emerald-600' },
  cancelar:            { label: 'Cancelación',             icon: Ban,          color: 'bg-red-50 text-red-600' },
  eliminar:            { label: 'Eliminación',              icon: Trash2,       color: 'bg-red-50 text-red-600' },
};

const MODULO_LABEL: Record<string, string> = {
  usuarios:     'Usuarios',
  solicitudes:  'Solicitudes',
  tickets_mas:  'Ticket MAS',
  tickets:      'Tickets Registrados',
  proyectos:    'Proyectos',
  presupuestos: 'Presupuestos',
};

export default function Auditoria() {
  const { isAdmin } = usePermissions();
  const [filterModulo, setFilterModulo] = useState('all');
  const [filterAccion, setFilterAccion] = useState('all');
  const [filterUsuario, setFilterUsuario] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['auditoria_sistema'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auditoria_sistema')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
    enabled: isAdmin,
  });

  const usuarios = useMemo(() =>
    Array.from(new Set(rows.map(r => r.usuario_email).filter(Boolean))).sort() as string[],
    [rows]
  );

  const filtered = useMemo(() => rows.filter(r =>
    (filterModulo === 'all'  || r.modulo === filterModulo) &&
    (filterAccion === 'all'  || r.accion === filterAccion) &&
    (filterUsuario === 'all' || r.usuario_email === filterUsuario)
  ), [rows, filterModulo, filterAccion, filterUsuario]);

  const visible   = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore   = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <ShieldAlert className="w-12 h-12 text-slate-300 mb-3" />
        <p className="text-slate-500 font-semibold">Esta sección es exclusiva para administradores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Auditoría del Sistema"
        subtitle="Registro completo de acciones: usuarios, invitaciones, solicitudes, tickets y proyectos"
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4 text-slate-400" />
        <select className={selectClass} value={filterModulo}
          onChange={e => { setFilterModulo(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todos los módulos</option>
          {Object.entries(MODULO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={selectClass} value={filterAccion}
          onChange={e => { setFilterAccion(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todas las acciones</option>
          {Object.entries(ACCION_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className={selectClass} value={filterUsuario}
          onChange={e => { setFilterUsuario(e.target.value); setVisibleCount(PAGE_SIZE); }}>
          <option value="all">Todos los usuarios</option>
          {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <span className="text-sm text-slate-400">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Cargando auditoría...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">Sin registros para estos filtros.</div>
      ) : (
        <div className={cardClass + " p-0 overflow-hidden"}>
          <div className="divide-y divide-slate-100">
            {visible.map(r => {
              const meta = ACCION_META[r.accion] ?? { label: r.accion, icon: Pencil, color: 'bg-slate-100 text-slate-600' };
              const Icon = meta.icon;
              return (
                <div key={r.id} className="flex items-start gap-3 p-4 hover:bg-slate-50 transition-colors">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{meta.label}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase">
                        {MODULO_LABEL[r.modulo] ?? r.modulo}
                      </span>
                      {r.en_nombre_de && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 flex items-center gap-1">
                          <UserIcon className="w-3 h-3" /> A nombre de: {r.en_nombre_de}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">
                      <span className="font-semibold">{r.usuario_nombre ?? r.usuario_email ?? 'Desconocido'}</span>
                      {r.registro_ref && <> — <span className="text-slate-500">{r.registro_ref}</span></>}
                    </p>
                    {r.detalle && Object.keys(r.detalle).length > 0 && (
                      <p className="text-xs text-slate-400 mt-1 font-mono truncate">
                        {Object.entries(r.detalle).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join('  ·  ')}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                    {new Date(r.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-sm"
          >
            <ChevronDown className="w-4 h-4" />
            Cargar más ({remaining} restante{remaining !== 1 ? 's' : ''})
          </button>
          <p className="text-xs text-slate-400">
            Mostrando {visible.length} de {filtered.length} registros
          </p>
        </div>
      )}
    </div>
  );
}
