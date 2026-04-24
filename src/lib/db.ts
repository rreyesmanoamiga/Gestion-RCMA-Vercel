import { supabase } from './supabaseClient';

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

function createEntityClient(tableName: string) {
  return {
    async list(
      orderBy: string = '-created_at',
      limit: number   = 100,
      { columns = '*', offset = 0 }: ListOptions = {}
    ) {
      const { column, ascending } = parseOrder(orderBy);
      let q = supabase.from(tableName).select(columns).order(column, { ascending });
      if (limit)  q = q.limit(limit);
      if (offset) q = q.range(offset, offset + limit - 1);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },

    async filter(
      filters: Record<string, unknown> = {},
      orderBy: string = '-created_at',
      limit: number   = 100,
      { columns = '*', offset = 0 }: ListOptions = {}
    ) {
      if (!Object.keys(filters).length) {
        throw new Error(`filter() en "${tableName}" requiere al menos un filtro. Usa list() para obtener todos los registros.`);
      }
      const { column, ascending } = parseOrder(orderBy);
      let q = supabase.from(tableName).select(columns).match(filters).order(column, { ascending });
      if (limit)  q = q.limit(limit);
      if (offset) q = q.range(offset, offset + limit - 1);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },

    async create(data: Record<string, unknown>) {
      const { data: result, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return result;
    },

    async update(id: string, data: Record<string, unknown>) {
      const { data: result, error } = await supabase
        .from(tableName)
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },

    async delete(id: string) {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
      if (error) throw error;
      return true;
    },
  };
}

export const db = {
  Project:           createEntityClient('projects'),
  Checklist:         createEntityClient('checklists'),
  MaintenanceRecord: createEntityClient('maintenance_records'),
  Report:            createEntityClient('reports'),
  UserPermissions:   createEntityClient('user_permissions'),
  Pendiente:         createEntityClient('pendientes'),
};