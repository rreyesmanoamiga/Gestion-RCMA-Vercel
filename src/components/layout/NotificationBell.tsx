import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Bell, CheckCheck, Trash2, Info, CheckCircle2, AlertTriangle, AlertOctagon } from 'lucide-react';

interface Notificacion {
  id:          string;
  created_at:  string;
  tipo:        'info' | 'exito' | 'alerta' | 'urgente';
  titulo:      string;
  mensaje:     string | null;
  link:        string | null;
  leida:       boolean;
}

const TIPO_META: Record<string, { icon: React.ElementType; color: string }> = {
  info:    { icon: Info,          color: 'text-blue-500 bg-blue-50' },
  exito:   { icon: CheckCircle2,  color: 'text-emerald-500 bg-emerald-50' },
  alerta:  { icon: AlertTriangle, color: 'text-amber-500 bg-amber-50' },
  urgente: { icon: AlertOctagon,  color: 'text-red-500 bg-red-50' },
};

function tiempoRelativo(fecha: string): string {
  const diffMs = Date.now() - new Date(fecha).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1)   return 'ahora';
  if (min < 60)  return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7)     return `hace ${d} d`;
  return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: notificaciones = [] } = useQuery({
    queryKey: ['notificaciones', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .eq('usuario_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Notificacion[];
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  const noLeidas = notificaciones.filter(n => !n.leida).length;

  const marcarLeidaMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notificaciones').update({ leida: true }).eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones', user?.id] }),
  });

  const marcarTodasLeidasMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('notificaciones').update({ leida: true }).eq('usuario_id', user!.id).eq('leida', false);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones', user?.id] }),
  });

  const eliminarMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notificaciones').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones', user?.id] }),
  });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClickNotif = (n: Notificacion) => {
    if (!n.leida) marcarLeidaMutation.mutate(n.id);
    if (n.link) { navigate(n.link); setOpen(false); }
  };

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notificaciones"
        className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-black">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[92vw] bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900">Notificaciones</h3>
            {noLeidas > 0 && (
              <button onClick={() => marcarTodasLeidasMutation.mutate()}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
                <CheckCheck className="w-3.5 h-3.5" /> Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {notificaciones.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">Sin notificaciones por ahora.</div>
            ) : (
              notificaciones.map(n => {
                const meta = TIPO_META[n.tipo] ?? TIPO_META.info;
                const Icon = meta.icon;
                return (
                  <div key={n.id}
                    onClick={() => handleClickNotif(n)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.leida ? 'bg-blue-50/40' : ''}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.leida ? 'font-bold text-slate-900' : 'font-medium text-slate-600'}`}>{n.titulo}</p>
                      {n.mensaje && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.mensaje}</p>}
                      <p className="text-[10px] text-slate-400 mt-1">{tiempoRelativo(n.created_at)}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); eliminarMutation.mutate(n.id); }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-500 text-slate-300 shrink-0 transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {!n.leida && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
