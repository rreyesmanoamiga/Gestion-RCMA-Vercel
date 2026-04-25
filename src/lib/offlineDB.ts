import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { supabase } from '@/lib/supabaseClient';

// ─── Schema de la base de datos local ────────────────────────────────────────
interface RCMAOfflineDB extends DBSchema {
  pendingChanges: {
    key: number;
    value: {
      id?: number;
      table: string;
      operation: 'insert' | 'update' | 'delete';
      data: Record<string, unknown>;
      recordId?: string;
      timestamp: number;
    };
    indexes: { 'by-timestamp': number };
  };
  cachedData: {
    key: string;
    value: {
      key: string;
      data: unknown;
      cachedAt: number;
    };
  };
}

let db: IDBPDatabase<RCMAOfflineDB> | null = null;

async function getDB() {
  if (!db) {
    db = await openDB<RCMAOfflineDB>('rcma-offline', 1, {
      upgrade(database) {
        // Tabla de cambios pendientes
        const pendingStore = database.createObjectStore('pendingChanges', {
          keyPath: 'id',
          autoIncrement: true,
        });
        pendingStore.createIndex('by-timestamp', 'timestamp');

        // Tabla de datos cacheados
        database.createObjectStore('cachedData', { keyPath: 'key' });
      },
    });
  }
  return db;
}

// ─── Guardar cambio pendiente cuando no hay internet ─────────────────────────
export async function savePendingChange(
  table: string,
  operation: 'insert' | 'update' | 'delete',
  data: Record<string, unknown>,
  recordId?: string
) {
  const database = await getDB();
  await database.add('pendingChanges', {
    table,
    operation,
    data,
    recordId,
    timestamp: Date.now(),
  });
}

// ─── Obtener cantidad de cambios pendientes ───────────────────────────────────
export async function getPendingCount(): Promise<number> {
  const database = await getDB();
  return database.count('pendingChanges');
}

// ─── Sincronizar cambios pendientes con Supabase ──────────────────────────────
export async function syncPendingChanges(): Promise<{ success: number; failed: number }> {
  const database = await getDB();
  const pending = await database.getAll('pendingChanges');

  let success = 0;
  let failed = 0;

  for (const change of pending) {
    try {
      if (change.operation === 'insert') {
        const { error } = await supabase.from(change.table).insert(change.data);
        if (error) throw error;
      } else if (change.operation === 'update' && change.recordId) {
        const { error } = await supabase
          .from(change.table)
          .update(change.data)
          .eq('id', change.recordId);
        if (error) throw error;
      } else if (change.operation === 'delete' && change.recordId) {
        const { error } = await supabase
          .from(change.table)
          .delete()
          .eq('id', change.recordId);
        if (error) throw error;
      }

      // Eliminar el cambio después de sincronizar exitosamente
      if (change.id !== undefined) {
        await database.delete('pendingChanges', change.id);
      }
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
}

// ─── Guardar datos en caché local ─────────────────────────────────────────────
export async function cacheData(key: string, data: unknown) {
  const database = await getDB();
  await database.put('cachedData', { key, data, cachedAt: Date.now() });
}

// ─── Leer datos del caché local ───────────────────────────────────────────────
export async function getCachedData<T>(key: string): Promise<T | null> {
  const database = await getDB();
  const record = await database.get('cachedData', key);
  return record ? (record.data as T) : null;
}