// src/lib/notifications.ts
import { supabase } from './supabaseClient';

export type NotifTipo = 'info' | 'exito' | 'alerta' | 'urgente';

interface NotifyParams {
  usuario_id:  string;
  tipo?:       NotifTipo;
  titulo:      string;
  mensaje?:    string | null;
  link?:       string | null;
  modulo?:     string | null;
  registro_id?: string | null;
}

/**
 * Crea una notificación interna para un usuario específico (por su ID).
 * Nunca lanza error hacia arriba — si falla, no debe romper la acción principal.
 */
export async function notify({ usuario_id, tipo = 'info', titulo, mensaje, link, modulo, registro_id }: NotifyParams): Promise<void> {
  try {
    await supabase.from('notificaciones').insert({
      usuario_id, tipo, titulo,
      mensaje:     mensaje ?? null,
      link:        link ?? null,
      modulo:      modulo ?? null,
      registro_id: registro_id ?? null,
    });
  } catch (e) {
    console.warn('No se pudo crear la notificación:', e);
  }
}

/**
 * Igual que notify(), pero resuelve el usuario_id a partir de su correo.
 * Útil cuando solo se tiene el email (ej. CAR de territorio, admin, etc.)
 * Si el correo no corresponde a ningún usuario del sistema, no hace nada.
 */
export async function notifyByEmail(email: string | null | undefined, params: Omit<NotifyParams, 'usuario_id'>): Promise<void> {
  if (!email) return;
  try {
    const { data: perm } = await supabase.from('user_permissions').select('user_id').eq('user_email', email).maybeSingle();
    if (!perm?.user_id) return;
    await notify({ ...params, usuario_id: perm.user_id });
  } catch (e) {
    console.warn('No se pudo resolver el destinatario de la notificación:', e);
  }
}
