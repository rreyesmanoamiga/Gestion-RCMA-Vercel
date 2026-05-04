import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { CALENDAR_SCOPES, msalInstance } from '@/lib/msalConfig';
import {
  CalendarDays, Plus, RefreshCw, LogIn, LogOut, X, Save,
  MapPin, User, Clock, ChevronLeft, ChevronRight, Building2, Loader2
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isToday, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { COLEGIOS } from '@/lib/colegios';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface TeamsEvent {
  id:      string;
  subject: string;
  start:   { dateTime: string; timeZone: string };
  end:     { dateTime: string; timeZone: string };
  location?: { displayName?: string };
  bodyPreview?: string;
  isOnlineMeeting?: boolean;
  onlineMeetingUrl?: string;
  _source: 'teams';
}

interface LocalEvent {
  id:           string;
  titulo:       string;
  fecha:        string;
  hora_inicio?: string;
  hora_fin?:    string;
  colegio?:     string;
  territorio?:  string;
  responsable?: string;
  notas?:       string;
  created_at?:  string;
  _source:      'local';
}

type AnyEvent = TeamsEvent | LocalEvent;

const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";
const labelClass = "block text-xs font-bold text-slate-500 uppercase mb-1 mt-3";

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─── Obtener eventos de Microsoft Graph ──────────────────────────────────────
async function fetchTeamsEvents(accessToken: string, start: Date, end: Date): Promise<TeamsEvent[]> {
  const url = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$select=subject,start,end,location,bodyPreview,isOnlineMeeting,onlineMeetingUrl&$orderby=start/dateTime&$top=50`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Error al obtener eventos de Teams');
  const data = await res.json();
  return (data.value ?? []).map((e: any) => ({ ...e, _source: 'teams' as const }));
}

// ─── Formulario nuevo evento local ────────────────────────────────────────────
function EventForm({ open, onClose, onSubmit, fecha }: {
  open: boolean; onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void; fecha?: Date;
}) {
  const [form, setForm] = useState({
    titulo: '', fecha: fecha ? format(fecha, 'yyyy-MM-dd') : '',
    hora_inicio: '', hora_fin: '', colegio: '', territorio: '',
    responsable: '', notas: '',
  });

  useEffect(() => {
    if (open) setForm(f => ({ ...f, fecha: fecha ? format(fecha, 'yyyy-MM-dd') : f.fecha }));
  }, [open, fecha]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      titulo:      form.titulo,
      fecha:       form.fecha,
      hora_inicio: form.hora_inicio || null,
      hora_fin:    form.hora_fin    || null,
      colegio:     form.colegio     || null,
      territorio:  form.territorio  || null,
      responsable: form.responsable || null,
      notas:       form.notas       || null,
    });
  };

  const colegiosPorTerritorio = form.territorio
    ? COLEGIOS.filter(c => c.territorio === form.territorio)
    : COLEGIOS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> Nueva Visita / Evento
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-1 flex-1">
          <div>
            <label className={labelClass}>Título *</label>
            <input required className={inputClass} value={form.titulo}
              onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="Ej. Visita de supervisión MA MTY" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Fecha *</label>
              <input required type="date" className={inputClass} value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass}>Hora inicio</label>
              <input type="time" className={inputClass} value={form.hora_inicio}
                onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Territorio</label>
              <select className={inputClass} value={form.territorio}
                onChange={e => setForm(f => ({ ...f, territorio: e.target.value, colegio: '' }))}>
                <option value="">Seleccionar...</option>
                {['NORTE','MEXICO','FMA'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Colegio</label>
              <select className={inputClass} value={form.colegio}
                onChange={e => setForm(f => ({ ...f, colegio: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {colegiosPorTerritorio.map(c => <option key={c.colegio} value={c.colegio}>{c.colegio}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Responsable</label>
            <input className={inputClass} value={form.responsable}
              onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))}
              placeholder="Nombre del responsable" />
          </div>
          <div>
            <label className={labelClass}>Notas</label>
            <textarea className={`${inputClass} h-20 resize-none`} value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Observaciones..." />
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md">
              Cancelar
            </button>
            <button type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2">
              <Save className="w-4 h-4" /> Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function AgendaVisitas() {
  const qc = useQueryClient();
  const hoy = new Date();

  const [año, setAño]         = useState(hoy.getFullYear());
  const [mes, setMes]         = useState(hoy.getMonth());
  const [diaSeleccionado, setDia] = useState<Date | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [msalReady, setMsalReady]     = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsEvents, setTeamsEvents]   = useState<TeamsEvent[]>([]);
  const [msalUser, setMsalUser]         = useState<string | null>(null);

  // Inicializar MSAL
  useEffect(() => {
    msalInstance.initialize().then(() => {
      setMsalReady(true);
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        setMsalUser(accounts[0].username);
        // Intentar obtener token silenciosamente
        msalInstance.acquireTokenSilent({ ...CALENDAR_SCOPES, account: accounts[0] })
          .then(res => setAccessToken(res.accessToken))
          .catch(() => setAccessToken(null));
      }
    }).catch(() => setMsalReady(true));
  }, []);

  // Cargar eventos de Teams cuando hay token
  useEffect(() => {
    if (!accessToken) return;
    const inicio = startOfMonth(new Date(año, mes));
    const fin    = endOfMonth(new Date(año, mes));
    setLoadingTeams(true);
    fetchTeamsEvents(accessToken, inicio, fin)
      .then(events => setTeamsEvents(events))
      .catch(() => { toast.error('Error al cargar eventos de Teams'); setTeamsEvents([]); })
      .finally(() => setLoadingTeams(false));
  }, [accessToken, año, mes]);

  // Cargar eventos locales
  const { data: localRaw = [] } = useQuery({
    queryKey: ['agenda-local', año, mes],
    queryFn: async () => {
      const inicio = format(startOfMonth(new Date(año, mes)), 'yyyy-MM-dd');
      const fin    = format(endOfMonth(new Date(año, mes)),   'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('agenda_visitas')
        .select('*')
        .gte('fecha', inicio)
        .lte('fecha', fin)
        .order('fecha');
      if (error) throw error;
      return data ?? [];
    },
  });

  const localEvents: LocalEvent[] = (localRaw as any[]).map(e => ({ ...e, _source: 'local' as const }));

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const { error } = await supabase.from('agenda_visitas').insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agenda-local'] });
      toast.success('Evento guardado correctamente');
      setShowForm(false);
    },
    onError: () => toast.error('Error al guardar el evento'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agenda_visitas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['agenda-local'] }); toast.success('Evento eliminado'); },
    onError: () => toast.error('Error al eliminar'),
  });

  // Conectar con Microsoft
  const handleConnectTeams = async () => {
    if (!msalReady) return;
    try {
      const res = await msalInstance.loginPopup(CALENDAR_SCOPES);
      setMsalUser(res.account.username);
      setAccessToken(res.accessToken);
      toast.success(`✅ Conectado como ${res.account.username}`);
    } catch (e: any) {
      if (!e?.message?.includes('user_cancelled')) toast.error('No se pudo conectar con Microsoft');
    }
  };

  const handleDisconnectTeams = () => {
    msalInstance.logoutPopup().catch(() => {});
    setAccessToken(null); setMsalUser(null); setTeamsEvents([]);
    toast.success('Sesión de Microsoft cerrada');
  };

  const handleRefreshTeams = async () => {
    if (!accessToken) return;
    const inicio = startOfMonth(new Date(año, mes));
    const fin    = endOfMonth(new Date(año, mes));
    setLoadingTeams(true);
    fetchTeamsEvents(accessToken, inicio, fin)
      .then(events => { setTeamsEvents(events); toast.success('Calendario actualizado'); })
      .catch(() => toast.error('Error al actualizar'))
      .finally(() => setLoadingTeams(false));
  };

  // Calendario
  const diasDelMes = useMemo(() => {
    const inicio = startOfWeek(startOfMonth(new Date(año, mes)), { weekStartsOn: 1 });
    const fin    = endOfWeek(endOfMonth(new Date(año, mes)), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: inicio, end: fin });
  }, [año, mes]);

  const eventosPorDia = useMemo(() => {
    const mapa: Record<string, AnyEvent[]> = {};
    [...localEvents, ...teamsEvents].forEach(ev => {
      const fecha = ev._source === 'local'
        ? (ev as LocalEvent).fecha
        : (ev as TeamsEvent).start.dateTime.slice(0, 10);
      if (!mapa[fecha]) mapa[fecha] = [];
      mapa[fecha].push(ev);
    });
    return mapa;
  }, [localEvents, teamsEvents]);

  const eventosDelDia = useMemo(() => {
    if (!diaSeleccionado) return [];
    const key = format(diaSeleccionado, 'yyyy-MM-dd');
    return eventosPorDia[key] ?? [];
  }, [diaSeleccionado, eventosPorDia]);

  const anteriorMes = () => { if (mes === 0) { setMes(11); setAño(a => a-1); } else setMes(m => m-1); };
  const siguienteMes = () => { if (mes === 11) { setMes(0); setAño(a => a+1); } else setMes(m => m+1); };

  const DIAS_SEMANA = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6" /> Agenda de Visitas
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Eventos locales + sincronización desde Teams/Outlook</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Botón Teams */}
          {!msalUser ? (
            <button onClick={handleConnectTeams} disabled={!msalReady}
              className="flex items-center gap-2 px-4 py-2 bg-[#6264A7] text-white rounded-lg text-sm font-bold hover:bg-[#4f5196] transition-colors disabled:opacity-50">
              <LogIn className="w-4 h-4" />
              Conectar con Teams
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-[#6264A7]/10 border border-[#6264A7]/30 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-[#6264A7] truncate max-w-[150px]">{msalUser}</span>
              </div>
              <button onClick={handleRefreshTeams} disabled={loadingTeams}
                className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                {loadingTeams ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-slate-500" />}
              </button>
              <button onClick={handleDisconnectTeams}
                className="p-2 border border-red-200 rounded-lg hover:bg-red-50 text-red-500 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
          <button onClick={() => { setDia(hoy); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-colors">
            <Plus className="w-4 h-4" /> Nuevo Evento
          </button>
        </div>
      </div>

      {/* Info banner Teams */}
      {!msalUser && (
        <div className="bg-[#6264A7]/5 border border-[#6264A7]/20 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#6264A7] flex items-center justify-center shrink-0">
            <CalendarDays className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#6264A7]">Sincroniza tu calendario de Teams</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Conecta tu cuenta de Microsoft para ver tus eventos de Teams y Outlook directamente en esta agenda.
              Los eventos locales siempre se guardan solo en esta app.
            </p>
          </div>
        </div>
      )}

      {/* Calendarios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendario principal */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Navegación mes */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
            <button onClick={anteriorMes} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
              {MESES[mes]} {año}
            </h2>
            <button onClick={siguienteMes} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Días semana */}
          <div className="grid grid-cols-7 border-b border-slate-100">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="py-2 text-center text-xs font-bold text-slate-400 uppercase">{d}</div>
            ))}
          </div>

          {/* Días */}
          <div className="grid grid-cols-7">
            {diasDelMes.map((dia, i) => {
              const key     = format(dia, 'yyyy-MM-dd');
              const eventos = eventosPorDia[key] ?? [];
              const esMesActual = dia.getMonth() === mes;
              const esHoy   = isToday(dia);
              const esSel   = diaSeleccionado ? isSameDay(dia, diaSeleccionado) : false;
              const teamsEv = eventos.filter(e => e._source === 'teams').length;
              const localEv = eventos.filter(e => e._source === 'local').length;

              return (
                <div key={i} onClick={() => setDia(dia)}
                  className={`min-h-[72px] p-1.5 border-b border-r border-slate-100 cursor-pointer transition-colors
                    ${!esMesActual ? 'bg-slate-50/50' : ''}
                    ${esSel ? 'bg-slate-900' : esHoy ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1
                    ${esHoy && !esSel ? 'bg-blue-600 text-white' : esSel ? 'bg-white text-slate-900' : esMesActual ? 'text-slate-700' : 'text-slate-300'}`}>
                    {dia.getDate()}
                  </span>
                  <div className="space-y-0.5">
                    {teamsEv > 0 && (
                      <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded truncate ${esSel ? 'bg-white/20 text-white' : 'bg-[#6264A7]/15 text-[#6264A7]'}`}>
                        {teamsEv} Teams
                      </div>
                    )}
                    {localEv > 0 && (
                      <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded truncate ${esSel ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                        {localEv} local{localEv !== 1 ? 'es' : ''}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel detalle día */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              {diaSeleccionado
                ? format(diaSeleccionado, "EEEE d 'de' MMMM", { locale: es })
                : 'Selecciona un día'}
            </h3>
            {diaSeleccionado && (
              <button onClick={() => { setShowForm(true); }}
                className="p-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {!diaSeleccionado && (
              <div className="p-8 text-center">
                <CalendarDays className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Haz clic en un día para ver sus eventos</p>
              </div>
            )}
            {diaSeleccionado && eventosDelDia.length === 0 && (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-400">Sin eventos para este día</p>
                <button onClick={() => setShowForm(true)}
                  className="mt-3 px-3 py-1.5 bg-slate-900 text-white rounded-md text-xs font-medium hover:bg-slate-800">
                  + Agregar evento
                </button>
              </div>
            )}
            {eventosDelDia.map(ev => {
              const isTeams = ev._source === 'teams';
              const t = ev as TeamsEvent;
              const l = ev as LocalEvent;
              return (
                <div key={ev.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isTeams ? 'bg-[#6264A7]' : 'bg-emerald-500'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {isTeams ? t.subject : l.titulo}
                      </p>
                      {isTeams ? (
                        <div className="text-xs text-slate-500 space-y-0.5 mt-1">
                          <p className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(parseISO(t.start.dateTime), 'HH:mm')} — {format(parseISO(t.end.dateTime), 'HH:mm')}
                          </p>
                          {t.location?.displayName && (
                            <p className="flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 shrink-0" />{t.location.displayName}
                            </p>
                          )}
                          {t.isOnlineMeeting && (
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 bg-[#6264A7]/10 text-[#6264A7] rounded-full">
                              📹 Teams Meeting
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 space-y-0.5 mt-1">
                          {l.hora_inicio && (
                            <p className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />{l.hora_inicio}
                            </p>
                          )}
                          {l.colegio && (
                            <p className="flex items-center gap-1 truncate">
                              <Building2 className="w-3 h-3 shrink-0" />{l.colegio}
                            </p>
                          )}
                          {l.responsable && (
                            <p className="flex items-center gap-1 truncate">
                              <User className="w-3 h-3 shrink-0" />{l.responsable}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isTeams ? 'bg-[#6264A7]/10 text-[#6264A7]' : 'bg-emerald-100 text-emerald-700'}`}>
                          {isTeams ? 'Teams' : 'Local'}
                        </span>
                        {!isTeams && (
                          <button onClick={() => deleteMutation.mutate(l.id)}
                            className="text-[10px] text-red-400 hover:text-red-600 transition-colors">
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Leyenda */}
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex gap-4">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
              <div className="w-2 h-2 rounded-full bg-[#6264A7]" /> Teams
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
              <div className="w-2 h-2 rounded-full bg-emerald-500" /> Local (solo app)
            </span>
          </div>
        </div>
      </div>

      <EventForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={data => createMutation.mutate(data)}
        fecha={diaSeleccionado ?? hoy}
      />
    </div>
  );
}
