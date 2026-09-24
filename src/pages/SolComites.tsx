import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, X, Loader2, Upload, FileText, Printer, CheckCircle2, AlertCircle, BookUser, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useDirectorio, type DirectorioColegio } from '@/lib/directorio';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { logAudit } from '@/lib/audit';
import PageHeader from '@/components/shared/PageHeader';
import AccesoRestringido from '@/components/shared/AccesoRestringido';
import {
  SOL_AREAS, SOL_ROLES_COMITE, campusSOL, cicloActual, cicloLabel, fechaCorta, fechaLarga, hoyISO, imprimirHTML, escHTML,
  type SolComite, type SolIntegrante,
} from '@/lib/sol';
import { carpetaSOL } from '@/lib/solData';
import { CicloSelect, inputCls, labelCls, btnPrimary, btnSecondary, useSolAdmin } from '@/components/sol/SolShared';

export default function SolComites() {
  const isAdmin = useSolAdmin();
  const qc = useQueryClient();
  const { data: directorio = [] } = useDirectorio();
  const campus = useMemo(() => campusSOL(directorio), [directorio]);
  const [ciclo, setCiclo] = useState(cicloActual());
  const [editando, setEditando] = useState<DirectorioColegio | null>(null);

  const { data: comites = [] } = useQuery({
    queryKey: ['sol_comites', ciclo],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('sol_comites').select('*').eq('ciclo', ciclo);
      if (error) throw error;
      return (data ?? []) as SolComite[];
    },
  });

  if (!isAdmin) return <AccesoRestringido />;
  const completos = campus.filter(c => {
    const k = comites.find(x => x.colegio === c.codigo);
    return k && k.acta_url && SOL_AREAS.every(a => (k.duenos?.[a] ?? '').trim());
  }).length;

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader title="Comités SOL" subtitle="Integrantes (SOL-F02), dueños de área y acta de integración (SOL-F05) por campus y ciclo" />
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <CicloSelect value={ciclo} onChange={setCiclo} className="sm:w-60" />
        <p className="text-sm text-slate-600"><b>{completos}</b> de {campus.length} campus con comité completo (acta vigente y las 8 áreas con dueño)</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {campus.map(c => {
          const k = comites.find(x => x.colegio === c.codigo);
          const integrantes = (k?.integrantes ?? []).filter(i => i.nombre?.trim()).length;
          const duenos = SOL_AREAS.filter(a => (k?.duenos?.[a] ?? '').trim()).length;
          const ok = !!k?.acta_url && duenos === SOL_AREAS.length;
          return (
            <button key={c.codigo} onClick={() => setEditando(c)}
              className={`text-left bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition border-l-4 ${ok ? 'border-l-emerald-500 border-slate-200' : k ? 'border-l-amber-400 border-slate-200' : 'border-l-slate-300 border-slate-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-bold text-sm text-slate-900">{c.nombre}</p><p className="text-[11px] text-slate-400">{c.codigo} · {c.territorio === 'MEXICO' ? 'MÉXICO' : c.territorio}</p></div>
                {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <AlertCircle className={`w-5 h-5 shrink-0 ${k ? 'text-amber-500' : 'text-slate-300'}`} />}
              </div>
              <div className="mt-3 space-y-1 text-xs text-slate-600">
                <p><Users className="w-3.5 h-3.5 inline mr-1 text-slate-400" />{integrantes} integrante(s)</p>
                <p>Dueños de área: <b className={duenos === SOL_AREAS.length ? 'text-emerald-700' : 'text-amber-700'}>{duenos}/{SOL_AREAS.length}</b></p>
                <p>Acta SOL-F05: {k?.acta_url ? <b className="text-emerald-700">vigente{k.acta_fecha ? ` (${fechaCorta(k.acta_fecha)})` : ''}</b> : <span className="text-slate-400">pendiente</span>}</p>
              </div>
            </button>
          );
        })}
      </div>
      {editando && (
        <ComiteModal campus={editando} ciclo={ciclo} comite={comites.find(x => x.colegio === editando.codigo) ?? null}
          onClose={() => setEditando(null)} onSaved={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['sol_comites'] }); }} />
      )}
    </div>
  );
}

const vacio = (): SolIntegrante[] => SOL_ROLES_COMITE.map(r => ({ rol: r.rol, nombre: '', puesto: r.puesto, correo: '', telefono: '', areas: r.areas }));

function ComiteModal({ campus, ciclo, comite, onClose, onSaved }: {
  campus: DirectorioColegio; ciclo: string; comite: SolComite | null; onClose: () => void; onSaved: () => void;
}) {
  const [integrantes, setIntegrantes] = useState<SolIntegrante[]>(comite?.integrantes?.length ? comite.integrantes : vacio());
  const [duenos, setDuenos] = useState<Record<string, string>>({ ...(comite?.duenos ?? {}) });
  const [actaUrl, setActaUrl] = useState(comite?.acta_url ?? '');
  const [actaFecha, setActaFecha] = useState(comite?.acta_fecha ?? '');
  const [notas, setNotas] = useState(comite?.notas ?? '');
  const [guardando, setGuardando] = useState(false);
  const actaRef = useRef<HTMLInputElement>(null);
  const { uploadCustom, uploading } = useSharePointUpload();

  const setI = (k: number, campo: keyof SolIntegrante, v: string) => setIntegrantes(p => p.map((x, i) => i === k ? { ...x, [campo]: v } : x));

  const desdeDirectorio = () => {
    setIntegrantes(p => p.map(x => {
      if (x.rol === 'Presidente' && !x.nombre) return { ...x, nombre: campus.dir_nombre ?? '', correo: campus.dir_correo ?? '', telefono: campus.dir_tel_movil ?? '' };
      if (x.rol === 'Coordinador(a) SOL' && !x.nombre) return { ...x, nombre: campus.adm_nombre ?? '', correo: campus.adm_correo ?? '', telefono: campus.adm_tel_movil ?? '' };
      if (x.rol === 'Asesoría' && !x.nombre) return { ...x, nombre: campus.leo_nombre ?? '', correo: campus.leo_correo ?? '', telefono: campus.leo_tel_movil ?? '' };
      return x;
    }));
    toast.success('Director, Administrador y Líder ECO tomados del Directorio');
  };

  const subirActa = async (f: File) => {
    const url = await uploadCustom(f, carpetaSOL(campus.codigo, ciclo, 'Comite'), `Acta_SOL-F05_${f.name.replace(/[/\\:*?"<>|]/g, '_')}`);
    if (url) { setActaUrl(url); if (!actaFecha) setActaFecha(hoyISO()); }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const fila = {
        colegio: campus.codigo, ciclo, integrantes, duenos, acta_url: actaUrl || null, acta_fecha: actaFecha || null,
        notas: notas || null, updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('sol_comites').upsert(fila, { onConflict: 'colegio,ciclo' });
      if (error) throw error;
      logAudit({ accion: comite ? 'editar' : 'crear', modulo: 'sol', registro_id: comite?.id ?? null, registro_ref: `Comité ${campus.codigo} ${ciclo}` });
      toast.success('Comité guardado');
      onSaved();
    } catch (e: unknown) { toast.error((e as { message?: string })?.message ?? 'Error al guardar'); }
    finally { setGuardando(false); }
  };

  const imprimirF02 = () => {
    const filas = integrantes.map(i => `<tr><td><b>${escHTML(i.rol)}</b></td><td>${escHTML(i.nombre)}</td><td>${escHTML(i.puesto)}</td><td>${escHTML(i.correo)}</td><td>${escHTML(i.telefono)}</td><td>${escHTML(i.areas)}</td></tr>`).join('');
    const d = SOL_AREAS.map(a => `<tr><td>${escHTML(a)}</td><td>${escHTML(duenos[a] ?? '')}</td></tr>`).join('');
    imprimirHTML(`<!doctype html><html><head><meta charset="utf-8"><title>Comité SOL · ${escHTML(campus.nombre)}</title><style>
      @page{size:letter landscape;margin:12mm}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'Segoe UI',Arial,sans-serif;color:#1B2A3F;font-size:11px}
      .h{display:flex;gap:14px;align-items:center;border-bottom:3px solid #ED7102;padding-bottom:8px;margin-bottom:10px}.h img{height:46px}
      .t1{font-size:10px;letter-spacing:2px;font-weight:700;color:#ED7102}.t2{font-size:17px;font-weight:800;color:#00295A}
      table{width:100%;border-collapse:collapse;margin:6px 0 12px}th{background:#00295A;color:#fff;font-size:9.5px;text-transform:uppercase;padding:5px 6px;text-align:left}td{border-bottom:1px solid #D8DEE6;padding:6px}
      h3{color:#00295A;font-size:12.5px;margin:12px 0 4px}</style></head><body>
      <div class="h"><img src="${window.location.origin}/colegio-mano-amiga.png"/><div><div class="t1">COLEGIOS MANO AMIGA · PROGRAMA SOL</div><div class="t2">Integrantes del Comité SOL</div>
      <div>Anexo SOL-F02 · Campus: <b>${escHTML(campus.nombre)}</b> · Ciclo escolar ${cicloLabel(ciclo)}${actaFecha ? ` · Acta SOL-F05 del ${fechaLarga(actaFecha)}` : ''}</div></div></div>
      <table><tr><th>Rol</th><th>Nombre</th><th>Puesto</th><th>Correo</th><th>Teléfono</th><th>Área(s) a cargo</th></tr>${filas}</table>
      <h3>Dueños de área</h3><table style="max-width:600px"><tr><th>Área</th><th>Dueño(a) del área</th></tr>${d}</table></body></html>`);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div><h3 className="font-bold text-slate-900">Comité SOL · {campus.nombre}</h3><p className="text-xs text-slate-500">Ciclo {cicloLabel(ciclo)}</p></div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Cerrar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <button className={btnSecondary} onClick={desdeDirectorio}><BookUser className="w-4 h-4" />Llenar desde Directorio</button>
            <button className={btnSecondary} onClick={imprimirF02}><Printer className="w-4 h-4" />Imprimir SOL-F02</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="text-[11px] uppercase text-slate-500"><tr>
                <th className="text-left py-2 pr-2">Rol</th><th className="text-left py-2 pr-2">Nombre</th><th className="text-left py-2 pr-2">Puesto</th>
                <th className="text-left py-2 pr-2">Correo</th><th className="text-left py-2 pr-2">Teléfono</th><th className="text-left py-2 pr-2">Área(s) a cargo</th><th />
              </tr></thead>
              <tbody>
                {integrantes.map((x, k) => (
                  <tr key={k}>
                    <td className="pr-2 py-1"><input className={inputCls + ' font-semibold'} value={x.rol} onChange={e => setI(k, 'rol', e.target.value)} /></td>
                    <td className="pr-2 py-1"><input className={inputCls} value={x.nombre} onChange={e => setI(k, 'nombre', e.target.value)} /></td>
                    <td className="pr-2 py-1"><input className={inputCls} value={x.puesto} onChange={e => setI(k, 'puesto', e.target.value)} /></td>
                    <td className="pr-2 py-1"><input className={inputCls} value={x.correo} onChange={e => setI(k, 'correo', e.target.value)} /></td>
                    <td className="pr-2 py-1"><input className={inputCls} value={x.telefono} onChange={e => setI(k, 'telefono', e.target.value)} /></td>
                    <td className="pr-2 py-1"><input className={inputCls} value={x.areas} onChange={e => setI(k, 'areas', e.target.value)} /></td>
                    <td className="py-1"><button className="p-2 text-slate-400 hover:text-red-600" aria-label="Quitar" onClick={() => setIntegrantes(p => p.filter((_, i) => i !== k))}><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mt-2 text-sm font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1" onClick={() => setIntegrantes(p => [...p, { rol: 'Representante docente', nombre: '', puesto: 'Docente', correo: '', telefono: '', areas: '' }])}><Plus className="w-4 h-4" />Agregar integrante</button>
          </div>

          <div>
            <p className={labelCls}>Dueños de área</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SOL_AREAS.map(a => (
                <div key={a} className="flex items-center gap-2">
                  <span className="text-sm text-slate-700 w-56 shrink-0">{a}</span>
                  <input className={inputCls} placeholder={a === 'Aulas' ? 'Ej. Ver lista anexa (titular de cada grupo)' : 'Nombre del dueño'} value={duenos[a] ?? ''} onChange={e => setDuenos(d => ({ ...d, [a]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2"><label className={labelCls}>Acta de integración firmada (SOL-F05)</label>
              <div className="flex gap-2">
                <input className={inputCls} placeholder="Liga del PDF" value={actaUrl} onChange={e => setActaUrl(e.target.value)} />
                <button className={btnSecondary} disabled={uploading} onClick={() => actaRef.current?.click()}>{uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}Subir</button>
                {actaUrl && <a className={btnSecondary} href={actaUrl} target="_blank" rel="noreferrer"><FileText className="w-4 h-4" /></a>}
                <input ref={actaRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) subirActa(f); e.target.value = ''; }} />
              </div>
            </div>
            <div><label className={labelCls}>Fecha del acta</label><input type="date" className={inputCls} value={actaFecha} onChange={e => setActaFecha(e.target.value)} /></div>
          </div>
          <div><label className={labelCls}>Notas / acuerdos</label><textarea className={inputCls} rows={2} value={notas} onChange={e => setNotas(e.target.value)} /></div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={guardando} onClick={guardar}>{guardando && <Loader2 className="w-4 h-4 animate-spin" />}Guardar comité</button>
        </div>
      </div>
    </div>
  );
}
