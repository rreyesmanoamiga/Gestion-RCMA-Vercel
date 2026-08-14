import React, { useMemo, useState } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import {
  useComplianceDocs, esRetraso, diasDiferencia, formatFecha,
  LoadingBlock, ErrorBlock, DetalleModal,
  type ComplianceDoc,
} from '@/lib/complianceShared';

export default function CumplimientoAlertas() {
  const { data: docs = [], isLoading, isError, refetch } = useComplianceDocs();
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [detalle, setDetalle] = useState<ComplianceDoc | null>(null);

  const vencidos = useMemo(() => {
    return docs
      .filter(d => esRetraso(d, hoy))
      .map(d => ({ ...d, dias: -diasDiferencia(d.fecha_limite_recepcion as string, hoy) }))
      .sort((a, b) => b.dias - a.dias);
  }, [docs, hoy]);

  const porExpirar = useMemo(() => {
    return docs
      .filter(d => d.vigente === 'Por expirar' && d.vigente_hasta)
      .map(d => ({ ...d, dias: diasDiferencia(d.vigente_hasta as string, hoy) }))
      .sort((a, b) => a.dias - b.dias);
  }, [docs, hoy]);

  return (
    <div className="p-6 lg:p-8 max-w-[1700px] mx-auto">
      <PageHeader title="Alertas" subtitle="Documentos vencidos y por expirar — priorizados de mayor a menor urgencia" />

      {isError ? <ErrorBlock onRetry={() => refetch()} /> : isLoading ? <LoadingBlock /> : (
        vencidos.length === 0 && porExpirar.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="text-lg font-bold text-[#00295A] mb-2">Sin alertas activas</h2>
            <p className="text-sm text-slate-500">Ningún documento está vencido o por expirar en este momento.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {vencidos.length > 0 && (
              <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-red-100 bg-red-50 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
                    Vencidos — {vencidos.length} documento{vencidos.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                  {vencidos.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50" onClick={() => setDetalle(d)}>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{d.tipo_documento}</p>
                        <p className="text-[11px] text-slate-400">{d.colegio.replace('Mano Amiga ', '')} · {d.territorio} · vencía {formatFecha(d.fecha_limite_recepcion)}{d.responsable ? ` · ${d.responsable}` : ''}</p>
                      </div>
                      <span className="text-xs font-bold text-white bg-red-600 px-2.5 py-1 rounded-full whitespace-nowrap ml-3">
                        {d.dias} día{d.dias !== 1 ? 's' : ''} de retraso
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {porExpirar.length > 0 && (
              <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#ED7102]" />
                  <p className="text-xs font-bold text-[#ED7102] uppercase tracking-wide">
                    Por expirar — {porExpirar.length} documento{porExpirar.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                  {porExpirar.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50" onClick={() => setDetalle(d)}>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800 truncate">{d.tipo_documento}</p>
                        <p className="text-[11px] text-slate-400">{d.colegio.replace('Mano Amiga ', '')} · {d.territorio} · vence {formatFecha(d.vigente_hasta)}{d.responsable ? ` · ${d.responsable}` : ''}</p>
                      </div>
                      <span className="text-xs font-bold text-white bg-[#ED7102] px-2.5 py-1 rounded-full whitespace-nowrap ml-3">
                        {d.dias} día{d.dias !== 1 ? 's' : ''} restantes
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {detalle && <DetalleModal doc={detalle} onClose={() => setDetalle(null)} onSaved={() => setDetalle(null)} />}
    </div>
  );
}
