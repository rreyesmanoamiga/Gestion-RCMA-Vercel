-- ══════════════════════════════════════════════════════════════════════════
-- Estado de acceso de los usuarios (Accesos)
-- Dice, para cada correo, cuándo se le mandó el último enlace de invitación y
-- cuándo usó el sistema por última vez. Solo el administrador puede consultarla.
-- Último ingreso = lo más reciente entre su último inicio de sesión y la última
-- vez que su sesión estuvo activa (quien deja la sesión abierta en el celular
-- casi nunca vuelve a "iniciar sesión", pero su sesión se renueva al usarlo).
-- ══════════════════════════════════════════════════════════════════════════

create or replace function public.rcma_estado_accesos()
returns table (email text, enlace_enviado timestamptz, ultimo_ingreso timestamptz, confirmado boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.rcma_es_admin() then
    raise exception 'Solo el administrador puede consultar el estado de los accesos';
  end if;
  return query
    select lower(u.email)::text,
           greatest(u.invited_at, u.recovery_sent_at, u.confirmation_sent_at),
           greatest(u.last_sign_in_at,
                    (select max(greatest(s.updated_at, s.refreshed_at)) from auth.sessions s where s.user_id = u.id)),
           u.email_confirmed_at is not null
      from auth.users u
     where u.email is not null;
end $$;

revoke all on function public.rcma_estado_accesos() from public, anon;
grant execute on function public.rcma_estado_accesos() to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- VALIDACIÓN — todas las filas deben decir true
-- ══════════════════════════════════════════════════════════════════════════
select 'función creada'               as revision, exists (select 1 from pg_proc where proname = 'rcma_estado_accesos') as ok
union all select 'es security definer',          (select prosecdef from pg_proc where proname = 'rcma_estado_accesos')
union all select 'anon no la puede ejecutar',    not has_function_privilege('anon', 'public.rcma_estado_accesos()', 'execute')
union all select 'usuarios con sesión sí',       has_function_privilege('authenticated', 'public.rcma_estado_accesos()', 'execute');

-- Para revisar quién NO ha entrado nunca (puedes correrlo aparte):
-- select p.nombre, p.user_email, u.invited_at
--   from public.user_permissions p left join auth.users u on lower(u.email) = lower(p.user_email)
--  where u.last_sign_in_at is null and coalesce(p.role, '') <> 'admin';
