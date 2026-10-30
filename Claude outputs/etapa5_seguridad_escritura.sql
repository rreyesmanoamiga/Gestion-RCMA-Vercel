-- ============================================================================
-- ETAPA 5 · Seguridad de ESCRITURA (sin romper lo que ya funciona)
--
-- 1. Las 9 reglas que decidían "admin" con user_metadata (editable por el
--    propio usuario) pasan a usar rcma_es_admin() (tu correo o app_metadata).
-- 2. Candados RESTRICTIVOS de escritura, igual que la Etapa 4 hizo con la
--    lectura. Se suman (AND) a las reglas actuales, así que solo cierran: no
--    se borra ninguna regla existente. Cada candado replica lo que el sistema
--    ya permite en pantalla, para que nadie pierda lo que hoy usa:
--      tickets_mas ............ editar: admin / autorizar / cancelar Ticket MAS · borrar: admin
--                               (crear queda igual; el VoBo FMA va por su función y no se afecta)
--      minutas ................ crear / editar / eliminar según sus permisos (Obras y CN)
--      minuta_acuerdos ........ quien crea o edita minutas, o edita trámites CN
--      auditoria_sistema ...... nadie edita ni borra; solo se agregan registros propios
--      maintenance_completions  admin, usuarios sin colegio, o el colegio propio con ver_calendario
--      maintenance_settings ... admin o editar_calendario
--      minimos_indispensables . admin o su propio territorio
-- 3. Funciones de Supabase (service role) y funciones SECURITY DEFINER no
--    pasan por estas reglas, así que correos, recordatorios, VoBo FMA y
--    sincronizaciones NEXUS/CN siguen igual.
-- ============================================================================
begin;

-- ── 1. user_metadata → rcma_es_admin() ──────────────────────────────────────
do $$
declare r record; v_using text; v_check text; patron text := '((auth.jwt() -> ''user_metadata''::text) ->> ''role''::text) = ''admin''::text';
begin
  for r in select tablename, policyname, qual, with_check from pg_policies
           where schemaname = 'public' and (qual like '%user_metadata%' or with_check like '%user_metadata%')
  loop
    v_using := replace(r.qual, patron, 'public.rcma_es_admin()');
    v_check := replace(r.with_check, patron, 'public.rcma_es_admin()');
    execute format('alter policy %I on public.%I%s%s', r.policyname, r.tablename,
      case when v_using is not null then format(' using (%s)', v_using) else '' end,
      case when v_check is not null then format(' with check (%s)', v_check) else '' end);
  end loop;
end $$;

-- ── 2. Candados de escritura ────────────────────────────────────────────────
-- tickets_mas
drop policy if exists rcma_tm_update on public.tickets_mas;
drop policy if exists rcma_tm_delete on public.tickets_mas;
create policy rcma_tm_update on public.tickets_mas as restrictive for update to authenticated
  using      (public.rcma_es_admin() or public.rcma_tiene_permiso('autorizar_ticket_mas') or public.rcma_tiene_permiso('cancelar_ticket_mas'))
  with check (public.rcma_es_admin() or public.rcma_tiene_permiso('autorizar_ticket_mas') or public.rcma_tiene_permiso('cancelar_ticket_mas'));
create policy rcma_tm_delete on public.tickets_mas as restrictive for delete to authenticated
  using (public.rcma_es_admin());

-- minutas
drop policy if exists rcma_min_insert on public.minutas;
drop policy if exists rcma_min_update on public.minutas;
drop policy if exists rcma_min_delete on public.minutas;
create policy rcma_min_insert on public.minutas as restrictive for insert to authenticated
  with check (public.rcma_tiene_permiso('crear_minutas') or public.rcma_tiene_permiso('crear_minutas_cn'));
create policy rcma_min_update on public.minutas as restrictive for update to authenticated
  using      (public.rcma_tiene_permiso('editar_minutas') or public.rcma_tiene_permiso('editar_minutas_cn') or public.rcma_tiene_permiso('crear_minutas') or public.rcma_tiene_permiso('crear_minutas_cn'))
  with check (public.rcma_tiene_permiso('editar_minutas') or public.rcma_tiene_permiso('editar_minutas_cn') or public.rcma_tiene_permiso('crear_minutas') or public.rcma_tiene_permiso('crear_minutas_cn'));
create policy rcma_min_delete on public.minutas as restrictive for delete to authenticated
  using (public.rcma_tiene_permiso('eliminar_minutas') or public.rcma_tiene_permiso('eliminar_minutas_cn'));

-- minuta_acuerdos
drop policy if exists rcma_acu_insert on public.minuta_acuerdos;
drop policy if exists rcma_acu_update on public.minuta_acuerdos;
drop policy if exists rcma_acu_delete on public.minuta_acuerdos;
create policy rcma_acu_insert on public.minuta_acuerdos as restrictive for insert to authenticated
  with check (public.rcma_tiene_permiso('crear_minutas') or public.rcma_tiene_permiso('crear_minutas_cn') or public.rcma_tiene_permiso('editar_minutas') or public.rcma_tiene_permiso('editar_minutas_cn') or public.rcma_tiene_permiso('editar_tramites_cn'));
create policy rcma_acu_update on public.minuta_acuerdos as restrictive for update to authenticated
  using      (public.rcma_tiene_permiso('crear_minutas') or public.rcma_tiene_permiso('crear_minutas_cn') or public.rcma_tiene_permiso('editar_minutas') or public.rcma_tiene_permiso('editar_minutas_cn') or public.rcma_tiene_permiso('editar_tramites_cn'))
  with check (public.rcma_tiene_permiso('crear_minutas') or public.rcma_tiene_permiso('crear_minutas_cn') or public.rcma_tiene_permiso('editar_minutas') or public.rcma_tiene_permiso('editar_minutas_cn') or public.rcma_tiene_permiso('editar_tramites_cn'));
create policy rcma_acu_delete on public.minuta_acuerdos as restrictive for delete to authenticated
  using (public.rcma_tiene_permiso('crear_minutas') or public.rcma_tiene_permiso('crear_minutas_cn') or public.rcma_tiene_permiso('editar_minutas') or public.rcma_tiene_permiso('editar_minutas_cn') or public.rcma_tiene_permiso('eliminar_minutas') or public.rcma_tiene_permiso('eliminar_minutas_cn'));

-- auditoria_sistema: la bitácora no se edita ni se borra
drop policy if exists rcma_aud_insert on public.auditoria_sistema;
drop policy if exists rcma_aud_update on public.auditoria_sistema;
drop policy if exists rcma_aud_delete on public.auditoria_sistema;
create policy rcma_aud_insert on public.auditoria_sistema as restrictive for insert to authenticated
  with check (usuario_id = auth.uid() or usuario_id is null);
create policy rcma_aud_update on public.auditoria_sistema as restrictive for update to authenticated using (false) with check (false);
create policy rcma_aud_delete on public.auditoria_sistema as restrictive for delete to authenticated using (false);

-- maintenance_completions: la misma regla que ya existía, ahora obligatoria
drop policy if exists rcma_mc_insert on public.maintenance_completions;
drop policy if exists rcma_mc_update on public.maintenance_completions;
drop policy if exists rcma_mc_delete on public.maintenance_completions;
create or replace function public.rcma_puede_marcar(p_colegio text) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.rcma_es_admin()
      or not exists (select 1 from user_permissions up where lower(up.user_email) = public.rcma_mi_correo()
                       and up.colegio is not null and up.colegio <> '' and up.colegio <> 'ECO')
      or exists (select 1 from user_permissions up where lower(up.user_email) = public.rcma_mi_correo()
                   and up.colegio = p_colegio and up.ver_calendario = true)
$$;
revoke execute on function public.rcma_puede_marcar(text) from anon;
create policy rcma_mc_insert on public.maintenance_completions as restrictive for insert to authenticated
  with check (public.rcma_puede_marcar(colegio));
create policy rcma_mc_update on public.maintenance_completions as restrictive for update to authenticated
  using (public.rcma_puede_marcar(colegio)) with check (public.rcma_puede_marcar(colegio));
create policy rcma_mc_delete on public.maintenance_completions as restrictive for delete to authenticated
  using (public.rcma_puede_marcar(colegio));

-- maintenance_settings
drop policy if exists rcma_ms_insert on public.maintenance_settings;
drop policy if exists rcma_ms_update on public.maintenance_settings;
drop policy if exists rcma_ms_delete on public.maintenance_settings;
create policy rcma_ms_insert on public.maintenance_settings as restrictive for insert to authenticated
  with check (public.rcma_tiene_permiso('editar_calendario'));
create policy rcma_ms_update on public.maintenance_settings as restrictive for update to authenticated
  using (public.rcma_tiene_permiso('editar_calendario')) with check (public.rcma_tiene_permiso('editar_calendario'));
create policy rcma_ms_delete on public.maintenance_settings as restrictive for delete to authenticated
  using (public.rcma_es_admin());

-- minimos_indispensables: admin o su propio territorio (como las reglas ECO que ya existían)
drop policy if exists rcma_mi_insert on public.minimos_indispensables;
drop policy if exists rcma_mi_update on public.minimos_indispensables;
drop policy if exists rcma_mi_delete on public.minimos_indispensables;
create or replace function public.rcma_mi_territorio() returns text
  language sql stable security definer set search_path = public as $$
  select up.territorio from user_permissions up where lower(up.user_email) = public.rcma_mi_correo() limit 1
$$;
revoke execute on function public.rcma_mi_territorio() from anon;
create policy rcma_mi_insert on public.minimos_indispensables as restrictive for insert to authenticated
  with check (public.rcma_es_admin() or territorio = public.rcma_mi_territorio());
create policy rcma_mi_update on public.minimos_indispensables as restrictive for update to authenticated
  using (public.rcma_es_admin() or territorio = public.rcma_mi_territorio())
  with check (public.rcma_es_admin() or territorio = public.rcma_mi_territorio());
create policy rcma_mi_delete on public.minimos_indispensables as restrictive for delete to authenticated
  using (public.rcma_es_admin() or territorio = public.rcma_mi_territorio());

commit;

-- ── Validación ──────────────────────────────────────────────────────────────
select
  (select count(*) from pg_policies where schemaname = 'public' and (qual like '%user_metadata%' or with_check like '%user_metadata%')) as reglas_con_user_metadata, -- 0
  (select count(*) from pg_policies where schemaname = 'public' and policyname like any (array['rcma_tm_%','rcma_min_%','rcma_acu_%','rcma_aud_%','rcma_mc_%','rcma_ms_%','rcma_mi_%'])) as candados_nuevos; -- 21
