import React from 'react';
import { ShieldOff } from 'lucide-react';

interface AccesoRestringidoProps {
  mensaje?: string;
}

export default function AccesoRestringido({ mensaje }: AccesoRestringidoProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <ShieldOff className="w-7 h-7 text-slate-400" />
      </div>
      <h2 className="text-base font-bold text-slate-700">Acceso restringido</h2>
      <p className="text-sm text-slate-400 mt-1 max-w-sm">
        {mensaje ?? 'No tienes permiso para ver esta sección. Si crees que deberías tenerlo, pídele a tu administrador que lo active en Accesos.'}
      </p>
    </div>
  );
}
