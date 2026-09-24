import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Upload, FilePlus2, FileSpreadsheet, FileText, FolderOpen, Trash2, Eye, AlertTriangle, CheckCircle2, X, Loader2, Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useDirectorio, type DirectorioColegio } from '@/lib/directorio';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_TIPOS, SOL_AREAS, tipoCorto, campusSOL, nombreCampus, parseSolExcel, calcularIndice, cicloActual, cicloDe,
  fechaCorta, hoyISO, fmtIndice, type ParsedSOL, type SolInspeccion,
} from '@/lib/sol';
import { importarInspeccion, buscarInspeccionExistente, crearInspeccionManual, carpetaSOL, traerTodo } from '@/lib/solData';
import {
  SolChip, CicloSelect, CampusSelect, inputCls, labelCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

export default function SolInspecciones() {
  const isAdmin = useSolAdmin();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => campusSOL(directorio), [directorio]);

  const [ciclo, setCiclo] = useState(cicloActual());
  const [fCampus, setFCampus] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [importando, setImportando] = useState(false);
  const [manual, setManual] = useState(false);

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
      <PageHeader title="Inspecciones SOL" subtitle="Formato SOL-F01 · Importa el Excel que envía cada campus o captura una inspección a mano" />

      <div className="flex flex-wrap gap-2 mb-5">
        <button className={btnPrimary} onClick={() => setImportando(true)}><Upload className="w-4 h-4" />Importar Excel SOL-F01</button>
        <button className={btnSecondary} onClick={() => setManual(true)}><FilePlus2 className="w-4 h-4" />Captura manual</button>
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
                <td className="px-4 py-3 whitespace-nowrap">{tipoCorto(i.tipo)}{i.origen === 'manual' && <span className="ml-1 text-[10px] text-slate-400">(manual)</span>}</td>
                <td className="px-4 py-3"><SolChip valor={i.indice} conTexto /></td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtIndice(i.indice_s)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtIndice(i.indice_o)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{fmtIndice(i.indice_l)}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1.5">
                    {i.archivo_url && <a href={i.archivo_url} target="_blank" rel="noreferrer" title="Excel original" className="p-1.5 rounded hover:bg-emerald-50 text-emerald-600"><FileSpreadsheet className="w-4 h-4" /></a>}
                    {i.pdf_url && <a href={i.pdf_url} target="_blank" rel="noreferrer" title="PDF firmado" className="p-1.5 rounded hover:bg-red-50 text-red-600"><FileText className="w-4 h-4" /></a>}
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

      {importando && (
        <ImportarModal
          directorio={directorio}
          usuario={user?.email ?? null}
          onClose={() => setImportando(false)}
          onDone={(id, cicloNuevo) => { setImportando(false); qc.invalidateQueries({ queryKey: ['sol_inspecciones'] }); qc.invalidateQueries({ queryKey: ['sol_hallazgos'] }); qc.invalidateQueries({ queryKey: ['sol_tarjetas'] }); setCiclo(cicloNuevo); navigate(`/sol/inspecciones/${id}`); }}
        />
      )}
      {manual && (
        <ManualModal
          campus={campus}
          usuario={user?.email ?? null}
          onClose={() => setManual(false)}
          onDone={id => { setManual(false); qc.invalidateQueries({ queryKey: ['sol_inspecciones'] }); navigate(`/sol/inspecciones/${id}`); }}
        />
      )}
    </div>
  );
}

// ── Importar Excel ──────────────────────────────────────────────────────────
function ImportarModal({ directorio, usuario, onClose, onDone }: {
  directorio: DirectorioColegio[]; usuario: string | null;
  onClose: () => void; onDone: (id: string, ciclo: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSOL | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [existe, setExiste] = useState(false);
  const [guardarOneDrive, setGuardarOneDrive] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const { uploadCustom } = useSharePointUpload();

  const leer = async (f: File) => {
    setArchivo(f); setParsed(null); setLeyendo(true); setExiste(false);
    try {
      const p = await parseSolExcel(f, directorio);
      setParsed(p);
      if (p.colegio && p.fecha && p.tipo) setExiste(!!(await buscarInspeccionExistente(p.colegio, p.fecha, p.tipo)));
    } finally { setLeyendo(false); }
  };

  const calc = parsed ? calcularIndice(parsed.respuestas) : null;
  const ceroUno = parsed ? parsed.respuestas.filter(r => !r.na && (r.calificacion === 0 || r.calificacion === 1)).length : 0;
  const puede = !!parsed && parsed.errores.length === 0 && !guardando;

  const confirmar = async () => {
    if (!parsed || !archivo) return;
    setGuardando(true);
    try {
      let archivoUrl: string | null = null;
      if (guardarOneDrive && parsed.colegio && parsed.fecha) {
        archivoUrl = await uploadCustom(archivo, carpetaSOL(parsed.colegio, cicloDe(parsed.fecha), 'Inspecciones'),
          `${parsed.fecha}_${parsed.tipo}_${archivo.name.replace(/[/\\:*?"<>|]/g, '_')}`);
      }
      const r = await importarInspeccion(parsed, { archivoUrl, usuario });
      logAudit({ accion: r.reemplazada ? 'editar' : 'crear', modulo: 'sol', registro_id: r.inspeccionId,
        registro_ref: `${parsed.colegio} ${parsed.fecha} ${parsed.tipo}`, detalle: { origen: 'excel', ...r } });
      const partes = [
        r.reemplazada ? 'Inspección reemplazada' : 'Inspección importada',
        r.hallazgosNuevos + r.hallazgosAuto ? `${r.hallazgosNuevos + r.hallazgosAuto} hallazgo(s) nuevo(s)` : '',
        r.hallazgosActualizados ? `${r.hallazgosActualizados} actualizado(s)` : '',
        r.tarjetasNuevas ? `${r.tarjetasNuevas} tarjeta(s) roja(s) nueva(s)` : '',
        r.tarjetasActualizadas ? `${r.tarjetasActualizadas} tarjeta(s) actualizada(s)` : '',
      ].filter(Boolean);
      toast.success(partes.join(' · '));
      onDone(r.inspeccionId, cicloDe(parsed.fecha!));
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? 'Error al importar');
    } finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" />Importar formato SOL-F01</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition">
            <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">{archivo ? archivo.name : 'Selecciona el Excel que envió el campus'}</p>
            <p className="text-xs text-slate-500">Se leen las hojas Inspección, Hallazgos y Tarjeta Roja</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />
          </div>

          {leyendo && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Leyendo archivo…</p>}

          {parsed && (
            <>
              {parsed.errores.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-bold text-red-700 flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4" />No se puede importar</p>
                  <ul className="list-disc pl-5 text-sm text-red-700 space-y-0.5">{parsed.errores.map((e, k) => <li key={k}>{e}</li>)}</ul>
                </div>
              )}
              {parsed.avisos.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-bold text-amber-700 flex items-center gap-2 mb-1"><Info className="w-4 h-4" />Revisa antes de confirmar</p>
                  <ul className="list-disc pl-5 text-sm text-amber-800 space-y-0.5">{parsed.avisos.map((e, k) => <li key={k}>{e}</li>)}</ul>
                </div>
              )}
              {existe && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Ya existe una inspección de este campus con la misma fecha y tipo. Al confirmar se <b>reemplazan sus calificaciones</b>; los hallazgos y tarjetas rojas se actualizan sin duplicarse.
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Dato l="Campus" v={parsed.colegio ? nombreCampus(directorio, parsed.colegio) : parsed.campusTexto || '—'} />
                <Dato l="Fecha" v={fechaCorta(parsed.fecha)} />
                <Dato l="Tipo" v={parsed.tipo ? tipoCorto(parsed.tipo) : parsed.tipoTexto || '—'} />
                <Dato l="Versión" v={parsed.version || '—'} />
                <Dato l="Inspector(es)" v={parsed.inspectores || '—'} />
                <Dato l="Director" v={parsed.director || '—'} />
                <Dato l="Criterios" v={`${calc?.calificados ?? 0} calificados · ${calc?.na ?? 0} NA`} />
                <div><p className={labelCls}>Índice SOL</p><SolChip valor={calc?.indice} conTexto /></div>
              </div>

              {calc && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SOL_AREAS.map(a => (
                    <div key={a} className="rounded-lg border border-slate-200 px-3 py-2">
                      <p className="text-[11px] text-slate-500 truncate" title={a}>{a}</p>
                      <div className="flex items-center justify-between gap-2"><SolChip valor={calc.porArea[a]} /><span className="text-[10px] text-slate-400 truncate">{parsed.duenos[a] ?? ''}</span></div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 space-y-1">
                <p><b>Hallazgos:</b> {parsed.hallazgos.length
                  ? `${parsed.hallazgos.length} registrados en la hoja Hallazgos.`
                  : `la hoja viene vacía; se crearán ${ceroUno} automáticamente a partir de los criterios con 0 o 1.`}
                  {parsed.hallazgos.length > 0 && parsed.hallazgos.length < ceroUno && <span className="text-amber-700"> Ojo: hay {ceroUno} criterios con 0 o 1.</span>}</p>
                <p><b>Tarjetas rojas:</b> {parsed.tarjetas.length} en la hoja (las que ya existían se actualizan, no se duplican).</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={guardarOneDrive} onChange={e => setGuardarOneDrive(e.target.checked)} />
                Guardar el Excel original en OneDrive (Programa SOL / campus / ciclo)
              </label>
            </>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={!puede} onClick={confirmar}>
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {existe ? 'Reemplazar e importar' : 'Confirmar e importar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dato({ l, v }: { l: string; v: React.ReactNode }) {
  return <div><p className={labelCls}>{l}</p><p className="text-slate-900 font-medium break-words">{v}</p></div>;
}

// ── Captura manual ──────────────────────────────────────────────────────────
function ManualModal({ campus, usuario, onClose, onDone }: {
  campus: ReturnType<typeof campusSOL>; usuario: string | null; onClose: () => void; onDone: (id: string) => void;
}) {
  const [colegio, setColegio] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [tipo, setTipo] = useState('mensual');
  const [guardando, setGuardando] = useState(false);
  const crear = async () => {
    if (!colegio || !fecha) { toast.error('Elige campus y fecha'); return; }
    setGuardando(true);
    try {
      const territorio = campus.find(c => c.codigo === colegio)?.territorio ?? null;
      const id = await crearInspeccionManual({ colegio, territorio, fecha, tipo, usuario });
      logAudit({ accion: 'crear', modulo: 'sol', registro_id: id, registro_ref: `${colegio} ${fecha} ${tipo}`, detalle: { origen: 'manual' } });
      onDone(id);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? 'Error al crear');
    } finally { setGuardando(false); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Nueva inspección (captura manual)</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className={labelCls}>Campus</label><CampusSelect campus={campus} value={colegio} onChange={setColegio} todos={false} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>Fecha</label><input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} /></div>
            <div><label className={labelCls}>Tipo</label>
              <select className={inputCls} value={tipo} onChange={e => setTipo(e.target.value)}>
                {SOL_TIPOS.map(t => <option key={t.key} value={t.key}>{t.corto}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">Se crea con los 40 criterios del catálogo sin calificar; en la siguiente pantalla los calificas.</p>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={guardando || !colegio} onClick={crear}>{guardando && <Loader2 className="w-4 h-4 animate-spin" />}Crear y calificar</button>
        </div>
      </div>
    </div>
  );
}
