// src/lib/audit.ts
import { supabase } from './supabaseClient';

export type AuditAccion =
  | 'login'
  | 'logout'
  | 'invitacion_enviada'
  | 'invitacion_aceptada'
  | 'crear'
  | 'editar'
  | 'autorizar'
  | 'cancelar'
  | 'eliminar'
  | 'completar';

export type AuditModulo =
  | 'usuarios'
  | 'solicitudes'
  | 'tickets_mas'
  | 'tickets'
  | 'proyectos'
  | 'presupuestos';

interface LogAuditParams {
  accion:       AuditAccion;
  modulo:       AuditModulo;
  registro_id?:  string | null;
  registro_ref?: string | null;
  detalle?:      Record<string, unknown> | null;
  en_nombre_de?: string | null;
}

/**
 * Registra una acción en el log de auditoría del sistema.
 * Nunca lanza error hacia arriba — si falla el log, no debe romper la acción principal del usuario.
 */
export async function logAudit({ accion, modulo, registro_id, registro_ref, detalle, en_nombre_de }: LogAuditParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('auditoria_sistema').insert({
      usuario_id:     user?.id ?? null,
      usuario_nombre: (user?.user_metadata?.full_name as string) ?? (user?.user_metadata?.name as string) ?? user?.email ?? 'Desconocido',
      usuario_email:  user?.email ?? null,
      accion,
      modulo,
      registro_id:    registro_id ?? null,
      registro_ref:   registro_ref ?? null,
      detalle:        detalle ?? null,
      en_nombre_de:   en_nombre_de ?? null,
    });
  } catch (e) {
    // Silencioso: la auditoría nunca debe bloquear la acción real del usuario
    console.warn('No se pudo registrar auditoría:', e);
  }
}
