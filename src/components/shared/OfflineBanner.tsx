import React from 'react';
import { WifiOff, RefreshCw, Clock } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export default function OfflineBanner() {
  const { isOnline, pendingCount, syncing } = useOnlineStatus();

  if (isOnline && pendingCount === 0 && !syncing) return null;

  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300
      ${!isOnline
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : syncing
          ? 'bg-blue-50 border-blue-200 text-blue-800'
          : 'bg-green-50 border-green-200 text-green-800'
      }`}>
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            Sin conexión — modo offline
            {pendingCount > 0 && (
              <span className="ml-2 bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full text-xs font-bold">
                {pendingCount} cambio{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
          </span>
        </>
      ) : syncing ? (
        <>
          <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
          <span>Sincronizando cambios pendientes...</span>
        </>
      ) : (
        <>
          <Clock className="w-4 h-4 shrink-0" />
          <span>{pendingCount} cambio{pendingCount !== 1 ? 's' : ''} por sincronizar</span>
        </>
      )}
    </div>
  );
}
