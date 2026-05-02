import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Calendar, CheckCircle2, Clock, AlertTriangle, Wrench, X, Plus, Trash2, Bell, Mail, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';

interface Actividad {
  id: number | string;
  categoria: string;
  actividad: string;
  tipo: 'Limpiar' | 'Renovar' | 'Revisar';
  frecuencia: string;
  frecuenciaDias: number;
  descripcion: string;
  esPersonalizada?: boolean;
}

interface NotificationRecipient {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
}

const ACTIVIDADES_BASE: Actividad[] = [
  { id: 1,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar paredes interiores',       tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de las paredes y divisiones interiores.' },
  { id: 2,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar banquinas y cornisas',     tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de banquinas, cornisas y demas acabados.' },
  { id: 3,  categoria: 'Paredes y Acabados',    actividad: 'Limpiar paredes exteriores',       tipo: 'Limpiar', frecuencia: '2 años',  frecuenciaDias: 730,  descripcion: 'Limpieza general de las paredes exteriores.' },
  { id: 4,  categoria: 'Paredes y Acabados',    actividad: 'Renovar laminas deterioradas',     tipo: 'Renovar', frecuencia: '5 años',  frecuenciaDias: 1825, descripcion: 'Sustitucion de las laminas y/o paneles que presenten deterioro.' },
  { id: 5,  categoria: 'Pisos',                 actividad: 'Limpiar piso vinilico',            tipo: 'Limpiar', frecuencia: '1 semana',frecuenciaDias: 7,    descripcion: 'Limpieza y cepillado con productos antimanchas.' },
  { id: 6,  categoria: 'Pisos',                 actividad: 'Encerar pisos ceramicos',          tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Encerado de los pisos ceramicos.' },
  { id: 7,  categoria: 'Pisos',                 actividad: 'Limpiar rodapie',                  tipo: 'Limpiar', frecuencia: '1 semana',frecuenciaDias: 7,    descripcion: 'Limpieza del rodapie.' },
  { id: 8,  categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar laminas de cubierta',     tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,   descripcion: 'Limpieza externa e interna de las laminas.' },
  { id: 9,  categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar canoas',                  tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,   descripcion: 'Limpieza de las canoas.' },
  { id: 10, categoria: 'Techo y Red Pluvial',   actividad: 'Limpiar cubierta de techo',       tipo: 'Limpiar', frecuencia: '4 meses', frecuenciaDias: 120,  descripcion: 'Limpieza de la cubierta de techo.' },
  { id: 11, categoria: 'Techo y Red Pluvial',   actividad: 'Revisar anclajes de laminas',     tipo: 'Revisar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Revision y resocado de los anclajes de laminas.' },
  { id: 12, categoria: 'Puertas y Ventanas',    actividad: 'Limpiar puertas y ventanas',      tipo: 'Limpiar', frecuencia: '1 mes',   frecuenciaDias: 30,   descripcion: 'Limpieza integral de superficies expuestas.' },
  { id: 13, categoria: 'Puertas y Ventanas',    actividad: 'Lubricar bisagras y pivotes',     tipo: 'Limpiar', frecuencia: '3 meses', frecuenciaDias: 90,   descripcion: 'Lubricacion de bisagras, pivotes y brazos hidraulicos.' },
  { id: 14, categoria: 'Puertas y Ventanas',    actividad: 'Limpiar canales de desague',      tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de canales y perforaciones de desague.' },
  { id: 15, categoria: 'Red de Agua Potable',   actividad: 'Limpiar llaves de paso',          tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Limpiar llaves de paso y lubricacion del vastago.' },
  { id: 16, categoria: 'Red de Agua Potable',   actividad: 'Limpiar cajas de registro',       tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Limpieza de las cajas de registro.' },
  { id: 17, categoria: 'Sanitarios',            actividad: 'Limpiar sanitarios',              tipo: 'Limpiar', frecuencia: '1 dia',   frecuenciaDias: 1,    descripcion: 'Limpieza y desinfeccion de lavatorios, orinales e inodoros.' },
  { id: 18, categoria: 'Sanitarios',            actividad: 'Revisar llaves y tuberias',       tipo: 'Revisar', frecuencia: '5 años',  frecuenciaDias: 1825, descripcion: 'Sustitucion general de llaves de control y tuberias.' },
  { id: 19, categoria: 'Red Sanitaria',         actividad: 'Limpiar arquetas y trampas',      tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de arquetas, trampa de grasa y cajas de registro.' },
  { id: 20, categoria: 'Red Sanitaria',         actividad: 'Limpiar tanque septico',          tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Limpieza del tanque septico y drenajes.' },
  { id: 21, categoria: 'Instalacion Electrica', actividad: 'Limpiar apagadores y lamparas',  tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza de apagadores, tomacorrientes y lamparas.' },
  { id: 22, categoria: 'Instalacion Electrica', actividad: 'Limpiar difusores lamparas',     tipo: 'Limpiar', frecuencia: '1 año',   frecuenciaDias: 365,  descripcion: 'Desmontaje y limpieza de difusores de lamparas fluorescentes.' },
  { id: 23, categoria: 'Barandillas y Rejas',   actividad: 'Limpiar rejas y barandillas',    tipo: 'Limpiar', frecuencia: '6 meses', frecuenciaDias: 180,  descripcion: 'Limpieza integral de las rejas, barandillas y persianas.' },
  { id: 24, categoria: 'Barandillas y Rejas',   actividad: 'Engrasar persianas enrollables', tipo: 'Renovar', frecuencia: '3 años',  frecuenciaDias: 1095, descripcion: 'Engrasado de las guias y del tambor de las persianas.' },
];

const COLORES_CATEGORIA: Record<string, string> = {
  'Paredes y Acabados':   '#6366f1',
  'Pisos':                '#f59e0b',
  'Techo y Red Pluvial':  '#10b981',
  'Puertas y Ventanas':   '#3b82f6',
  'Red de Agua Potable':  '#06b6d4',
  'Sanitarios':           '#ec4899',
  'Red Sanitaria':        '#8b5cf6',
  'Instalacion Electrica':'#f97316',
  'Barandillas y Rejas':  '#14b8a6',
  'Personalizado':        '#64748b',
};

const FRECUENCIAS_PRESET = [
  { label: '1 dia',    dias: 1 },
  { label: '1 semana', dias: 7 },
  { label: '1 mes',    dias: 30 },
  { label: '3 meses',  dias: 90 },
  { label: '4 meses',  dias: 120 },
  { label: '6 meses',  dias: 180 },
  { label: '1 año',    dias: 365 },
  { label: '2 años',   dias: 730 },
  { label: '3 años',   dias: 1095 },
  { label: '5 años',   dias: 1825 },
];

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
const FECHA_BASE = new Date(2025, 0, 1);

function calcularFechasEnMes(act: Actividad, año: number, mes: number): Date[] {
  const fechas: Date[] = [];
  const inicioMes = new Date(año, mes, 1);
  const finMes = new Date(año, mes + 1, 0);
  let fecha = new Date(FECHA_BASE);
  while (fecha <= finMes) {
    if (fecha >= inicioMes) fechas.push(new Date(fecha));
    fecha = new Date(fecha.getTime() + act.frecuenciaDias * 86400000);
  }
  return fechas;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const inputClass = "w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-slate-900 focus:outline-none bg-white";

export default function CalendarioMantenimiento() {
  const hoy = new Date();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [año, setAño] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const [diaSeleccionado, setDiaSeleccionado] = useState<number | null>(null);
  const [vistaActiva, setVistaActiva] = useState<'calendario' | 'lista'>('calendario');
  const [showModal, setShowModal] = useState(false);
  const [showGestion, setShowGestion] = useState(false);
  const [showNotificaciones, setShowNotificaciones] = useState(false);

  const [form, setForm] = useState({
    categoria: '', categoriaCustom: '', actividad: '',
    tipo: 'Limpiar' as 'Limpiar' | 'Renovar' | 'Revisar',
    frecuencia: '1 mes', frecuenciaDias: 30, descripcion: '',
  });

  const [formRecipient, setFormRecipient] = useState({ email: '', nombre: '' });
  const isAdmin = useMemo(() => !!user, [user]);

  const { data: customRaw = [] } = useQuery({
    queryKey: ['customMaintenance'],
    queryFn: async () => {
      const { data, error } = await supabase.from('custom_maintenance').select('*').order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const { data: recipients = [], isLoading: loadingRecipients } = useQuery({
    queryKey: ['maintenanceRecipients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_notification_recipients')
        .select('*').order('created_at');
      if (error) throw error;
      return data as NotificationRecipient[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const categoria = data.categoria === '__custom__' ? data.categoriaCustom : data.categoria;
      const { error } = await supabase.from('custom_maintenance').insert({
        categoria, actividad: data.actividad, tipo: data.tipo,
        frecuencia: data.frecuencia, frecuencia_dias: data.frecuenciaDias, descripcion: data.descripcion,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customMaintenance'] });
      toast.success('Mantenimiento agregado');
      setShowModal(false);
      setForm({ categoria: '', categoriaCustom: '', actividad: '', tipo: 'Limpiar', frecuencia: '1 mes', frecuenciaDias: 30, descripcion: '' });
    },
    onError: () => toast.error('Error al guardar'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_maintenance').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customMaintenance'] }); toast.success('Eliminado'); },
    onError: () => toast.error('Error al eliminar'),
  });

  const addRecipientMutation = useMutation({
    mutationFn: async (data: { email: string; nombre: string }) => {
      const { error } = await supabase.from('maintenance_notification_recipients')
        .insert({ email: data.email.toLowerCase().trim(), nombre: data.nombre.trim(), activo: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenanceRecipients'] });
      toast.success('Destinatario agregado');
      setFormRecipient({ email: '', nombre: '' });
    },
    onError: (err: any) => {
      if (err?.message?.includes('duplicate') || err?.code === '23505') toast.error('Este correo ya esta registrado');
      else toast.error('Error al agregar');
    },
  });

  const toggleRecipientMutation = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('maintenance_notification_recipients').update({ activo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenanceRecipients'] }); toast.success('Estado actualizado'); },
    onError: () => toast.error('Error al actualizar'),
  });

  const deleteRecipientMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('maintenance_notification_recipients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenanceRecipients'] }); toast.success('Destinatario eliminado'); },
    onError: () => toast.error('Error al eliminar'),
  });

  const customActividades: Actividad[] = customRaw.map((r: any) => ({
    id: r.id, categoria: r.categoria, actividad: r.actividad, tipo: r.tipo,
    frecuencia: r.frecuencia, frecuenciaDias: r.frecuencia_dias, descripcion: r.descripcion || '', esPersonalizada: true,
  }));

  const todasActividades = [...ACTIVIDADES_BASE, ...customActividades];
  const todasCategorias = [...new Set(todasActividades.map(a => a.categoria))];

  const actividadesPorDia = useMemo(() => {
    const mapa: Record<number, Actividad[]> = {};
    const actsFiltradas = categoriaFiltro === 'Todas' ? todasActividades : todasActividades.filter(a => a.categoria === categoriaFiltro);
    actsFiltradas.forEach(act => {
      calcularFechasEnMes(act, año, mes).forEach(f => {
        const dia = f.getDate();
        if (!mapa[dia]) mapa[dia] = [];
        mapa[dia].push(act);
      });
    });
    return mapa;
  }, [año, mes, categoriaFiltro, todasActividades]);

  const resumen = useMemo(() => {
    let total = 0, limpiar = 0, renovar = 0, revisar = 0;
    Object.values(actividadesPorDia).forEach(acts => acts.forEach(a => {
      total++; if (a.tipo === 'Limpiar') limpiar++; else if (a.tipo === 'Renovar') renovar++; else revisar++;
    }));
    return { total, limpiar, renovar, revisar };
  }, [actividadesPorDia]);

  const diasEnMes = new Date(año, mes + 1, 0).getDate();
  const primerDiaMes = new Date(año, mes, 1).getDay();
  const actsDia = diaSeleccionado ? actividadesPorDia[diaSeleccionado] || [] : [];
  const esHoy = (d: number) => d === hoy.getDate() && mes === hoy.getMonth() && año === hoy.getFullYear();
  const anteriorMes = () => { if (mes === 0) { setMes(11); setAño(a => a-1); } else setMes(m => m-1); setDiaSeleccionado(null); };
  const siguienteMes = () => { if (mes === 11) { setMes(0); setAño(a => a+1); } else setMes(m => m+1); setDiaSeleccionado(null); };
  const colorCat = (cat: string) => COLORES_CATEGORIA[cat] || '#64748b';
  const handleFrecuencia = (freq: string) => {
    const preset = FRECUENCIAS_PRESET.find(f => f.label === freq);
    setForm(f => ({ ...f, frecuencia: freq, frecuenciaDias: preset?.dias ?? f.frecuenciaDias }));
  };
  const activeRecipients = recipients.filter(r => r.activo).length;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6" /> Calendario de Mantenimiento
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Cronograma basado en guias tecnicas de mantenimiento</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setVistaActiva('calendario')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${vistaActiva === 'calendario' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            Calendario
          </button>
          <button onClick={() => setVistaActiva('lista')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${vistaActiva === 'lista' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            Lista
          </button>
          {isAdmin && (
            <>
              <button onClick={() => setShowNotificaciones(true)}
                className="px-4 py-2 rounded-md text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 relative">
                <Bell className="w-4 h-4" /> Notificaciones
                {activeRecipients > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {activeRecipients}
                  </span>
                )}
              </button>
              <button onClick={() => setShowGestion(true)}
                className="px-4 py-2 rounded-md text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
                Gestionar
              </button>
              <button onClick={() => setShowModal(true)}
                className="px-4 py-2 rounded-md text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 transition-colors flex items-center gap-2">
                <Plus className="w-4 h-4" /> Agregar
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: resumen.total, color: 'bg-slate-900 text-white', icon: <Wrench className="w-4 h-4" /> },
          { label: 'Limpieza', value: resumen.limpiar, color: 'bg-blue-50 text-blue-700 border border-blue-200', icon: <CheckCircle2 className="w-4 h-4" /> },
          { label: 'Renovacion', value: resumen.renovar, color: 'bg-amber-50 text-amber-700 border border-amber-200', icon: <AlertTriangle className="w-4 h-4" /> },
          { label: 'Revision', value: resumen.revisar, color: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: <Clock className="w-4 h-4" /> },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
            <div className="flex items-center gap-2 mb-1 opacity-70">{s.icon}<span className="text-xs font-bold uppercase tracking-wide">{s.label}</span></div>
            <p className="text-3xl font-black">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setCategoriaFiltro('Todas')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${categoriaFiltro === 'Todas' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
          Todas
        </button>
        {todasCategorias.map(cat => (
          <button key={cat} onClick={() => setCategoriaFiltro(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${categoriaFiltro === cat ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            style={categoriaFiltro === cat ? { backgroundColor: colorCat(cat) } : {}}>
            {cat}
          </button>
        ))}
      </div>

      {vistaActiva === 'calendario' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
            <button onClick={anteriorMes} className="p-2 hover:bg-slate-200 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5" /></button>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">{MESES[mes]} {año}</h2>
            <button onClick={siguienteMes} className="p-2 hover:bg-slate-200 rounded-lg transition-colors"><ChevronRight className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-100">
            {DIAS_SEMANA.map(d => (<div key={d} className="py-2 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">{d}</div>))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: primerDiaMes }).map((_, i) => (<div key={`e-${i}`} className="border-b border-r border-slate-100 h-24 bg-slate-50/50" />))}
            {Array.from({ length: diasEnMes }).map((_, i) => {
              const dia = i + 1;
              const acts = actividadesPorDia[dia] || [];
              const isHoy = esHoy(dia);
              const isSel = diaSeleccionado === dia;
              return (
                <div key={dia} onClick={() => setDiaSeleccionado(isSel ? null : dia)}
                  className={`border-b border-r border-slate-100 h-24 p-1.5 cursor-pointer transition-colors overflow-hidden ${isSel ? 'bg-slate-900' : isHoy ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className={`text-xs font-bold block mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isHoy && !isSel ? 'bg-blue-600 text-white' : isSel ? 'bg-white text-slate-900' : 'text-slate-700'}`}>{dia}</span>
                  <div className="space-y-0.5">
                    {acts.slice(0, 3).map((act, idx) => (
                      <div key={idx} className="text-[10px] font-medium px-1 py-0.5 rounded truncate"
                        style={{ backgroundColor: isSel ? 'rgba(255,255,255,0.15)' : colorCat(act.categoria) + '22', color: isSel ? 'white' : colorCat(act.categoria) }}>
                        {act.actividad}
                      </div>
                    ))}
                    {acts.length > 3 && <div className={`text-[10px] font-bold ${isSel ? 'text-slate-300' : 'text-slate-400'}`}>+{acts.length - 3} mas</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Actividades — {MESES[mes]} {año}</h2>
            <div className="flex gap-2">
              <button onClick={anteriorMes} className="p-1.5 hover:bg-slate-200 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={siguienteMes} className="p-1.5 hover:bg-slate-200 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {Object.entries(actividadesPorDia).sort(([a],[b]) => Number(a)-Number(b)).map(([dia, acts]) => (
              <div key={dia} className="px-5 py-3">
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">{DIAS_SEMANA[new Date(año,mes,Number(dia)).getDay()]} {dia} de {MESES[mes]}</p>
                <div className="space-y-1.5">
                  {acts.map((act, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorCat(act.categoria) }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{act.actividad}{act.esPersonalizada && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded-full">CUSTOM</span>}</p>
                        <p className="text-xs text-slate-500 truncate">{act.descripcion}</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: colorCat(act.categoria)+'22', color: colorCat(act.categoria) }}>{act.categoria}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${act.tipo==='Limpiar'?'bg-blue-100 text-blue-700':act.tipo==='Renovar'?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}`}>{act.tipo}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(actividadesPorDia).length === 0 && (<div className="py-12 text-center"><p className="text-sm text-slate-400 italic">No hay actividades para este mes.</p></div>)}
          </div>
        </div>
      )}

      {diaSeleccionado && actsDia.length > 0 && vistaActiva === 'calendario' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
              {DIAS_SEMANA[new Date(año,mes,diaSeleccionado).getDay()]} {diaSeleccionado} de {MESES[mes]} — {actsDia.length} actividad{actsDia.length!==1?'es':''}
            </h3>
            <button onClick={() => setDiaSeleccionado(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="divide-y divide-slate-100">
            {actsDia.map((act, idx) => (
              <div key={idx} className="px-5 py-3 flex items-start gap-3">
                <div className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: colorCat(act.categoria) }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{act.actividad}{act.esPersonalizada && <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-500 rounded-full">CUSTOM</span>}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{act.descripcion}</p>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: colorCat(act.categoria)+'22', color: colorCat(act.categoria) }}>{act.categoria}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${act.tipo==='Limpiar'?'bg-blue-100 text-blue-700':act.tipo==='Renovar'?'bg-amber-100 text-amber-700':'bg-emerald-100 text-emerald-700'}`}>{act.tipo}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Cada {act.frecuencia}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Notificaciones */}
      {showNotificaciones && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-slate-700" />
                <div>
                  <h3 className="font-bold text-slate-900">Notificacion a Usuarios</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Correos que reciben recordatorios de mantenimiento</p>
                </div>
              </div>
              <button onClick={() => setShowNotificaciones(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="mx-5 mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-3">
              <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-800">Como funciona</p>
                <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                  1 dia antes de cada mantenimiento, los destinatarios activos reciben un correo con el detalle y un archivo <strong>.ics</strong> para agregar el evento a su Outlook. Cuando aceptan, te llega confirmacion automatica.
                </p>
              </div>
            </div>
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-500 uppercase mb-3">Agregar destinatario</p>
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <input className={inputClass} placeholder="Nombre (ej: Juan Perez)" value={formRecipient.nombre}
                    onChange={e => setFormRecipient(f => ({ ...f, nombre: e.target.value }))} />
                  <input className={inputClass} type="email" placeholder="correo@ejemplo.com" value={formRecipient.email}
                    onChange={e => setFormRecipient(f => ({ ...f, email: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && formRecipient.email && formRecipient.nombre && isValidEmail(formRecipient.email)) addRecipientMutation.mutate(formRecipient); }} />
                </div>
                <button disabled={!formRecipient.email || !formRecipient.nombre || !isValidEmail(formRecipient.email) || addRecipientMutation.isPending}
                  onClick={() => addRecipientMutation.mutate(formRecipient)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-40 transition-colors flex items-center gap-1.5 self-end">
                  <UserPlus className="w-4 h-4" />
                  {addRecipientMutation.isPending ? '...' : 'Agregar'}
                </button>
              </div>
              {formRecipient.email && !isValidEmail(formRecipient.email) && <p className="text-xs text-red-500 mt-1">Correo no valido</p>}
            </div>
            <div className="overflow-y-auto flex-1">
              {loadingRecipients ? (
                <div className="py-8 text-center"><p className="text-sm text-slate-400">Cargando...</p></div>
              ) : recipients.length === 0 ? (
                <div className="py-10 text-center px-5">
                  <Bell className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-500">Sin destinatarios configurados</p>
                  <p className="text-xs text-slate-400 mt-1">Los recordatorios solo te llegaran a ti por ahora.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recipients.map(r => (
                    <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${r.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {(r.nombre || r.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{r.nombre || '-'}</p>
                        <p className="text-xs text-slate-500 truncate">{r.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => toggleRecipientMutation.mutate({ id: r.id, activo: !r.activo })}
                          className={`relative w-10 h-5 rounded-full transition-colors ${r.activo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${r.activo ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <span className={`text-[10px] font-bold ${r.activo ? 'text-emerald-600' : 'text-slate-400'}`}>{r.activo ? 'Activo' : 'Inactivo'}</span>
                        <button onClick={() => deleteRecipientMutation.mutate(r.id)} disabled={deleteRecipientMutation.isPending}
                          className="text-red-400 hover:text-red-600 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">{activeRecipients} activo{activeRecipients !== 1 ? 's' : ''} de {recipients.length}</span>
              <p className="text-xs text-slate-400 italic">Siempre recibes copia como admin</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agregar mantenimiento */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><Plus className="w-4 h-4" /> Nuevo Mantenimiento</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoria</label>
                <select className={inputClass} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  <option value="">Seleccionar categoria...</option>
                  {todasCategorias.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">+ Nueva categoria</option>
                </select>
              </div>
              {form.categoria === '__custom__' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nueva categoria</label>
                  <input className={inputClass} placeholder="Ej: Area Exterior" value={form.categoriaCustom} onChange={e => setForm(f => ({ ...f, categoriaCustom: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Actividad</label>
                <input className={inputClass} placeholder="Ej: Revisar extintores" value={form.actividad} onChange={e => setForm(f => ({ ...f, actividad: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo</label>
                <select className={inputClass} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))}>
                  <option value="Limpiar">Limpiar</option><option value="Renovar">Renovar</option><option value="Revisar">Revisar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Frecuencia</label>
                <select className={inputClass} value={form.frecuencia} onChange={e => handleFrecuencia(e.target.value)}>
                  {FRECUENCIAS_PRESET.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripcion (opcional)</label>
                <textarea className={inputClass} rows={3} placeholder="Describe la actividad..." value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-md">Cancelar</button>
              <button disabled={addMutation.isPending || !form.actividad || (!form.categoria || (form.categoria === '__custom__' && !form.categoriaCustom))}
                onClick={() => addMutation.mutate(form)}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 transition-colors">
                {addMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gestionar personalizados */}
      {showGestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><Wrench className="w-4 h-4" /> Mantenimientos Personalizados</h3>
              <button onClick={() => setShowGestion(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto flex-1">
              {customActividades.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-slate-400 italic">No hay mantenimientos personalizados.</p>
                  <button onClick={() => { setShowGestion(false); setShowModal(true); }}
                    className="mt-4 px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2 mx-auto">
                    <Plus className="w-4 h-4" /> Agregar primero
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {customActividades.map(act => (
                    <div key={act.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: colorCat(act.categoria) }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900">{act.actividad}</p>
                        <p className="text-xs text-slate-500">{act.categoria} · {act.tipo} · Cada {act.frecuencia}</p>
                        {act.descripcion && <p className="text-xs text-slate-400 mt-0.5">{act.descripcion}</p>}
                      </div>
                      <button onClick={() => deleteMutation.mutate(String(act.id))} disabled={deleteMutation.isPending}
                        className="text-red-400 hover:text-red-600 transition-colors shrink-0 p-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="text-xs text-slate-500">{customActividades.length} personalizados</span>
              <button onClick={() => { setShowGestion(false); setShowModal(true); }}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Agregar nuevo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
