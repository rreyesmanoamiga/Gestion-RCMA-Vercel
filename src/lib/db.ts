import { supabase } from './supabaseClient';
import { savePendingChange, getCachedData, cacheData } from './offlineDB';

interface ParsedOrder {
  column: string;
  ascending: boolean;
}

interface ListOptions {
  columns?: string;
  offset?: number;
}

function parseOrder(orderStr: string): ParsedOrder {
  if (!orderStr) return { column: 'created_at', ascending: false };
  const ascending = !orderStr.startsWith('-');
  const column    = orderStr.replace(/^-/, '');
  return { column, ascending };
}

// Genera un ID temporal para registros creados offline
function tempId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function createEntityClient(tableName: string) {
  return {
    async list(
      orderBy: string = '-created_at',
      limit: number   = 100,
      { columns = '*', offset = 0 }: ListOptions = {}
    ) {
      const cacheKey = `${tableName}:list:${orderBy}:${limit}:${offset}`;

      try {
        const { column, ascending } = parseOrder(orderBy);
        let q = supabase.from(tableName).select(columns).order(column, { ascending });
        if (limit)  q = q.limit(limit);
        if (offset) q = q.range(offset, offset + limit - 1);
        const { data, error } = await q;
        if (error) throw error;
        const result = data ?? [];
        // Guardar en caché para uso offline
        await cacheData(cacheKey, result);
        return result;
      } catch {
        // Sin internet — devolver datos del caché
        const cached = await getCachedData<unknown[]>(cacheKey);
        return cached ?? [];
      }
    },

    async filter(
      filters: Record<string, unknown> = {},
      orderBy: string = '-created_at',
      limit: number   = 100,
      { columns = '*', offset = 0 }: ListOptions = {}
    ) {
      if (!Object.keys(filters).length) {
        throw new Error(`filter() en "${tableName}" requiere al menos un filtro.`);
      }
      const cacheKey = `${tableName}:filter:${JSON.stringify(filters)}:${orderBy}:${limit}`;

      try {
        const { column, ascending } = parseOrder(orderBy);
        let q = supabase.from(tableName).select(columns).match(filters).order(column, { ascending });
        if (limit)  q = q.limit(limit);
        if (offset) q = q.range(offset, offset + limit - 1);
        const { data, error } = await q;
        if (error) throw error;
        const result = data ?? [];
        await cacheData(cacheKey, result);
        return result;
      } catch {
        const cached = await getCachedData<unknown[]>(cacheKey);
        return cached ?? [];
      }
    },

    async create(data: Record<string, unknown>) {
      try {
        const { data: result, error } = await supabase
          .from(tableName)
          .insert(data)
          .select()
          .single();
        if (error) throw error;
        return result;
      } catch {
        // Sin internet — guardar como pendiente y devolver objeto temporal
        const offlineRecord = {
          ...data,
          id: tempId(),
          created_at: new Date().toISOString(),
          _offline: true,
        };
        await savePendingChange(tableName, 'insert', data);
        return offlineRecord;
      }
    },

    async update(id: string, data: Record<string, unknown>) {
      try {
        const { data: result, error } = await supabase
          .from(tableName)
          .update(data)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return result;
      } catch {
        // Sin internet — guardar como pendiente y devolver objeto actualizado
        const offlineRecord = {
          ...data,
          id,
          updated_at: new Date().toISOString(),
          _offline: true,
        };
        await savePendingChange(tableName, 'update', data, id);
        return offlineRecord;
      }
    },

    async delete(id: string) {
      try {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', id);
        if (error) throw error;
        return true;
      } catch {
        // Sin internet — guardar como pendiente
        await savePendingChange(tableName, 'delete', { id }, id);
        return true;
      }
    },
  };
}

export const db = {
  Project:           createEntityClient('projects'),
  MaintenanceRecord: createEntityClient('maintenance_records'),
  Report:            createEntityClient('reports'),
  UserPermissions:   createEntityClient('user_permissions'),
  Pendiente:         createEntityClient('pendientes'),
};