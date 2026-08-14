import React from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldCheck, FileText, ShieldAlert, LayoutDashboard, Construction } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const TABS = [
  { path: '/cumplimiento',            label: 'Panel General', icon: LayoutDashboard },
  { path: '/cumplimiento/documentos', label: 'Documentos',    icon: FileText },
  { path: '/cumplimiento/alertas',    label: 'Alertas',       icon: ShieldAlert },
];

export default function CumplimientoNormativo() {
  const location = useLocation();
  const tabActivo = TABS.find(t => t.path === location.pathname) ?? TABS[0];

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader title="Cumplimiento Normativo" subtitle="Protección Civil, Donatarias y documentación regulatoria — motor de ejecución sobre el registro oficial de Compliance" />

      <div className="flex gap-2 mb-6 border-b border-slate-200">
        {TABS.map(t => {
          const Icon = t.icon;
          const activo = t.path === tabActivo.path;
          return (
            <a key={t.path} href={t.path}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activo ? 'border-[#ED7102] text-[#00295A]' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}>
              <Icon className="w-4 h-4" /> {t.label}
            </a>
          );
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-4">
          <Construction className="w-7 h-7 text-[#ED7102]" />
        </div>
        <h2 className="text-lg font-bold text-[#00295A] mb-2">Estamos armando esta sección</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {tabActivo.label} de Cumplimiento Normativo está en construcción — pronto vas a poder ver aquí el estatus real
          de los documentos de Protección Civil y Donatarias Autorizadas de los 20 colegios, con seguimiento operativo
          (responsable, cotización, fecha objetivo) que complementa al registro oficial de Compliance.
        </p>
        <div className="flex items-center justify-center gap-2 mt-5 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4" />
          Visible solo para ti por el momento
        </div>
      </div>
    </div>
  );
}
