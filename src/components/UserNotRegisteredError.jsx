import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function UserNotRegisteredError() {
  const { signOut } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-lg border border-slate-100">
        <div className="text-center">

          {/* Ícono — consistente con lucide-react */}
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-full bg-orange-100">
            <AlertTriangle className="w-8 h-8 text-orange-600" />
          </div>

          <h1 className="text-3xl font-bold text-slate-900 mb-4">
            Acceso Restringido
          </h1>
          <p className="text-slate-600 mb-8">
            No tienes acceso a esta aplicación. Por favor contacta al administrador para solicitar acceso.
          </p>

          <div className="p-4 bg-slate-50 rounded-md text-sm text-slate-600 text-left">
            <p className="font-medium mb-2">Si crees que esto es un error, puedes:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Verificar que estás usando la cuenta correcta</li>
              <li>Contactar al administrador del sistema para solicitar acceso</li>
              <li>Cerrar sesión e intentar con otra cuenta</li>
            </ul>
          </div>

          {/* Botón de cierre de sesión — evita que el usuario quede atrapado */}
          <button
            onClick={signOut}
            className="mt-6 w-full px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors"
          >
            Cerrar sesión
          </button>

        </div>
      </div>
    </div>
  );
}