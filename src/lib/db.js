import { supabase } from './supabaseClient';

function parseOrder(orderStr) {
  if (!orderStr) return { column: 'created_at', ascending: false };
  const ascending = !orderStr.startsWith('-');
  const column = orderStr.replace(/^-/, '');
  return { column, ascending };
}

function createEntityClient(tableName) {
  return {
    async list(orderBy = '-created_at', limit = 100) {
      const { column, ascending } = parseOrder(orderBy);
      let q = supabase.from(tableName).select('*').order(column, { ascending });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async filter(filters = {}, orderBy = '-created_at', limit = 100) {
      const { column, ascending } = parseOrder(orderBy);
      let q = supabase.from(tableName).select('*').match(filters).order(column, { ascending });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async create(data) {
      const { data: result, error } = await supabase.from(tableName).insert(data).select().single();
      if (error) throw error;
      return result;
    },
    async update(id, data) {
      const { data: result, error } = await supabase.from(tableName).update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },
    async delete(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
    },
  };
}

export const db = {
  Project: createEntityClient('projects'),
  Checklist: createEntityClient('checklists'),
  MaintenanceRecord: createEntityClient('maintenance_records'),
  Report: createEntityClient('reports'),
  UserPermissions: createEntityClient('user_permissions'),
};