// Firmas por autorizar: reconocimientos que los colegios o el equipo MAS piden que
// firme el Coordinador. Al firmar, el sistema coloca la firma en el diploma y le
// avisa por correo a quien lo pidió.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PenLine, Loader2, CheckCircle2, Undo2, Eye, X, Award } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import { htmlDiplomas, fechaCorta, type DatosDiploma } from '@/lib/sol';
import { traerTodo } from '@/lib/solData';
import { notificarSOL } from '@/lib/solCampo';
import { FIRMA_RCMA_SRC } from '@/lib/firmaRcma';
import { KpiSOL, inputCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

interface Firma {
  id: string; tipo: string; referencia_id: string | null; colegio: string | null; titulo: string; datos: DatosDiploma;
  solicitado_por: string; solicitado_nombre: string | null; estatus: 'pendiente' | 'firmada' | 'rechazada';
  motivo: string | null; firmado_at: string | null; created_at: string;
}
const ESTATUS = {
  pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
  firmada:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  rechazada: 'bg-red-50 text-red-700 border-red-200',
};

export default function SolFirmas() {
  const isAdmin = useSolAdmin();
  const qc = useQueryClient();
  const [vista, setVista] = useState<Firma | null>(null);
  const [regresar, setRegresar] = useState<Firma | null>(null);
  const [motivo, setMotivo] = useState('');
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const { data: firmas = [], isLoading } = useQuery({
    queryKey: ['sol_firmas'],
    enabled: isAdmin,
    queryFn: () => traerTodo<Firma>((a, z) => supabase.from('sol_firmas').select('*').order('created_at', { ascending: false }).range(a, z)),
  });
  if (!isAdmin) return <AccesoRestringido />;

  const pendientes = firmas.filter(f => f.estatus === 'pendiente');
  const resolver = async (f: Firma, estatus: 'firmada' | 'rechazada', m?: string) => {
    setTrabajando(f.id);
    try {
      const { error } = await supabase.from('sol_firmas').update({ estatus, motivo: m ?? null, firmado_at: estatus === 'firmada' ? new Date().toISOString() : null }).eq('id', f.id);
      if (error) throw error;
      logAudit({ accion: estatus === 'firmada' ? 'autorizar' : 'editar', modulo: 'sol', registro_id: f.id, registro_ref: `Firma ${f.titulo}` });
      await notificarSOL('firma_resuelta', f.id);
      toast.success(estatus === 'firmada' ? 'Firmado. Se avisó por correo a quien lo pidió.' : 'Se regresó la solicitud con tus observaciones');
      qc.invalidateQueries({ queryKey: ['sol_firmas'] });
      setRegresar(null); setMotivo(''); setVista(null);
    } catch (e) { toast.error((e as Error).message ?? 'Error'); }
    finally { setTrabajando(null); }
  };

  const fila = (f: Firma) => (
    <tr key={f.id} className="align-top">
      <td className="px-4 py-3"><p className="font-semibold text-slate-900">{f.titulo}</p><p className="text-[11px] text-slate-500">{f.datos?.actividad ?? ''}</p></td>
      <td className="px-4 py-3"><p className="text-slate-800">{f.solicitado_nombre || f.solicitado_por}</p><p className="text-[11px] text-slate-500">{f.solicitado_por}</p></td>
      <td className="px-4 py-3 whitespace-nowrap">{fechaCorta(f.created_at.slice(0, 10))}</td>
      <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-bold capitalize ${ESTATUS[f.estatus]}`}>{f.estatus}</span>
        {f.motivo && <p className="text-[11px] text-slate-500 mt-1 max-w-[220px]">{f.motivo}</p>}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <button className="p-2 rounded-md hover:bg-slate-100 text-slate-600" title="Ver diploma" onClick={() => setVista(f)}><Eye className="w-4 h-4" /></button>
        {f.estatus === 'pendiente' && (
          <>
            <button className="p-2 rounded-md hover:bg-red-50 text-slate-500 hover:text-red-600" title="Regresar" onClick={() => { setRegresar(f); setMotivo(''); }}><Undo2 className="w-4 h-4" /></button>
            <button className={btnPrimary + ' !px-3 !py-1.5 ml-1'} disabled={trabajando === f.id} onClick={() => resolver(f, 'firmada')}>
              {trabajando === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}Firmar
            </button>
          </>
        )}
      </td>
    </tr>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Firmas por autorizar" subtitle="Reconocimientos que piden tu firma · al firmar, el sistema la coloca en el diploma y avisa por correo" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <KpiSOL titulo="Por firmar" valor={pendientes.length} icon={PenLine} tono={pendientes.length ? 'naranja' : 'slate'} />
        <KpiSOL titulo="Firmados" valor={firmas.filter(f => f.estatus === 'firmada').length} icon={CheckCircle2} tono="verde" />
        <KpiSOL titulo="Regresados" valor={firmas.filter(f => f.estatus === 'rechazada').length} icon={Undo2} tono="slate" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5 flex items-center gap-4">
        <img src={FIRMA_RCMA_SRC} alt="Tu firma" className="h-14 w-auto" />
        <p className="text-sm text-slate-600">Esta es la firma que se coloca, centrada sobre tu línea, en cada reconocimiento que autorices.</p>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr>
            <th className="text-left px-4 py-3">Reconocimiento</th><th className="text-left px-4 py-3">Lo pidió</th><th className="text-left px-4 py-3">Fecha</th>
            <th className="text-left px-4 py-3">Estatus</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Cargando…</td></tr>}
            {!isLoading && firmas.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No hay solicitudes de firma.</td></tr>}
            {pendientes.map(fila)}
            {firmas.filter(f => f.estatus !== 'pendiente').map(fila)}
          </tbody>
        </table>
      </div>

      {vista && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setVista(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><Award className="w-4 h-4 text-emerald-600" />{vista.titulo}</h3>
              <button onClick={() => setVista(null)} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 overflow-auto">
              <div className="mx-auto" style={{ width: 792, height: 612, maxWidth: '100%' }}>
                <iframe title="Diploma" srcDoc={htmlDiplomas(vista.datos, { firmaCoordinador: true })}
                  style={{ width: 1056, height: 816, transform: 'scale(0.75)', transformOrigin: 'top left', border: '1px solid #e2e8f0' }} />
              </div>
              <p className="text-[11px] text-slate-500 mt-2">Así quedará con tu firma.</p>
            </div>
            {vista.estatus === 'pendiente' && (
              <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
                <button className={btnSecondary} onClick={() => { setRegresar(vista); setMotivo(''); }}><Undo2 className="w-4 h-4" />Regresar</button>
                <button className={btnPrimary} disabled={trabajando === vista.id} onClick={() => resolver(vista, 'firmada')}>
                  {trabajando === vista.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}Firmar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {regresar && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={() => setRegresar(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900">Regresar la solicitud</h3>
            <p className="text-sm text-slate-600">{regresar.titulo}</p>
            <textarea className={inputCls} rows={3} placeholder="¿Qué hay que corregir?" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <button className={btnSecondary} onClick={() => setRegresar(null)}>Cancelar</button>
              <button className={btnPrimary} disabled={!motivo.trim() || trabajando === regresar.id} onClick={() => resolver(regresar, 'rechazada', motivo.trim())}>Regresar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
