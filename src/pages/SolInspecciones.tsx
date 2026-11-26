import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardCheck, FileSpreadsheet, FileText, FolderOpen, Trash2, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useDirectorio } from '@/lib/directorio';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import { SOL_TIPOS, tipoCorto, campusSOL, nombreCampus, cicloActual, fechaCorta, fmtIndice, type SolInspeccion } from '@/lib/sol';
import { traerTodo } from '@/lib/solData';
import { SolChip, CicloSelect, CampusSelect, inputCls, btnPrimary, useSolAdmin } from '@/components/sol/SolShared';

export default function SolInspecciones() {
  const isAdmin = useSolAdmin();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => campusSOL(directorio), [directorio]);

  const [ciclo, setCiclo] = useState(cicloActual());
  const [fCampus, setFCampus] = useState('');
  const [fTipo, setFTipo] = useState('');

  const { data: inspecciones = [], isLoading } = useQuery({
    queryKey: ['sol_inspecciones', ciclo],
    enabled: isAdmin,
    queryFn: async () => {
      return traerTodo<SolInspeccion>((a, b) => supabase.from('sol_inspecciones').select('*').eq('ciclo', ciclo).order('fecha', { ascending: false }).order('id').range(a, b));
    },
  });

  const filtradas = inspecciones.filter(i => (!fCampus || i.colegio === fCampus) && (!fTipo || i.tipo === fTipo));

  const eliminar = useMutation({
    mutationFn: async (i: SolInspeccion) => {
      const { error } = await supabase.from('sol_inspecciones').delete().eq('id', i.id);
      if (error) throw error;
      logAudit({ accion: 'eliminar', modulo: 'sol', registro_id: i.id, registro_ref: `${i.colegio} ${i.fecha} ${i.tipo}` });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sol_inspecciones'] }); toast.success('Inspección eliminada'); },
    onError: (e: unknown) => toast.error((e as { message?: string })?.message ?? 'Error al eliminar'),
  });

  if (!isAdmin) return <AccesoRestringido />;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Inspecciones SOL" subtitle="Los recorridos se hacen desde el celular (Recorrido SOL); cada uno llega aquí con su Índice, hallazgos, tarjetas rojas e informe en PDF" />

      <div className="flex flex-wrap gap-2 mb-5">
        <Link to="/sol/recorrido" className={btnPrimary}><ClipboardCheck className="w-4 h-4" />Nuevo recorrido</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <CicloSelect value={ciclo} onChange={setCiclo} />
        <CampusSelect campus={campus} value={fCampus} onChange={setFCampus} />
        <select className={inputCls} value={fTipo} onChange={e => setFTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {SOL_TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-left px-4 py-3">Campus</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Índice SOL</th>
              <th className="text-right px-3 py-3">S</th>
              <th className="text-right px-3 py-3">O</th>
              <th className="text-right px-3 py-3">L</th>
              <th className="text-left px-4 py-3">Archivos</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Cargando…</td></tr>}
            {!isLoading && filtradas.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No hay inspecciones en este ciclo con esos filtros.</td></tr>
            )}
            {filtradas.map(i => (
              <tr key={i.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/sol/inspecciones/${i.id}`)}>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">{fechaCorta(i.fecha)}</td>
                <td className="px-4 py-3"><p className="font-semibold text-slate-900">{nombreCampus(directorio, i.colegio)}</p><p className="text-[11px] text-slate-400">{i.colegio}</p></td>
                <td className="px-4 py-3 whitespace-nowrap">{tipoCorto(i.tipo)}{i.folio && <p className="text-[10px] text-slate-400">{i.folio}</p>}{i.origen === 'excel' && <span className="ml-1 text-[10px] text-slate-400">(Excel)</span>}</td>
                <td className="px-4 py-3"><SolChip valor={i.indice} conTexto /></td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtIndice(i.indice_s)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtIndice(i.indice_o)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtIndice(i.indice_l)}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1.5">
                    {i.archivo_url && <a href={i.archivo_url} target="_blank" rel="noreferrer" title="Excel original" className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"><FileSpreadsheet className="w-4 h-4" /></a>}
                    {i.pdf_url && <a href={i.pdf_url} target="_blank" rel="noreferrer" title={i.origen === 'recorrido' ? 'Informe del recorrido' : 'PDF firmado'} className="p-1.5 rounded hover:bg-red-50 text-red-600"><FileText className="w-4 h-4" /></a>}
                    {i.evidencia_url && <a href={i.evidencia_url} target="_blank" rel="noreferrer" title="Fotos / evidencia" className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><FolderOpen className="w-4 h-4" /></a>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                  <button className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Ver" onClick={() => navigate(`/sol/inspecciones/${i.id}`)}><Eye className="w-4 h-4" /></button>
                  <button className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600" title="Eliminar"
                    onClick={() => { if (confirm('¿Eliminar esta inspección y sus calificaciones? Los hallazgos y tarjetas rojas se conservan.')) eliminar.mutate(i); }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
