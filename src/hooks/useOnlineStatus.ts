import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { syncPendingChanges, getPendingCount } from './offlineDB';

// ─── Hook para detectar estado de conexión ────────────────────────────────────
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Actualizar contador de pendientes
  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  // Sincronizar cuando se recupera internet
  const handleOnline = useCallback(async () => {
    setIsOnline(true);
    const count = await getPendingCount();

    if (count > 0) {
      setSyncing(true);
      toast.info(`Sincronizando ${count} cambio${count !== 1 ? 's' : ''} pendiente${count !== 1 ? 's' : ''}...`);

      const { success, failed } = await syncPendingChanges();
      setSyncing(false);
      setPendingCount(0);

      if (failed === 0) {
        toast.success(`✅ ${success} cambio${success !== 1 ? 's' : ''} sincronizado${success !== 1 ? 's' : ''} correctamente`);
      } else {
        toast.warning(`⚠️ ${success} sincronizados, ${failed} fallaron`);
      }
    } else {
      toast.success('✅ Conexión restaurada');
    }
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    toast.warning('📶 Sin conexión — Los cambios se guardarán localmente');
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    refreshPendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline, refreshPendingCount]);

  return { isOnline, pendingCount, syncing, refreshPendingCount };
}