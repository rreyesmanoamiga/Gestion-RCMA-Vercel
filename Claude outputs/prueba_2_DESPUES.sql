do $prueba$
declare
  res text := '';
  n int;
  uid_col uuid; uid_rr uuid; uid_car uuid; claims_car text;
  t uuid := '281c0c38-0092-4398-8c3f-10e8a4e11e4d';
  mi uuid := 'e83dfa91-a2f6-4a4e-9d86-54757f42d20b';
  ac uuid := 'ae067eb1-6025-49fc-a650-4a490ad2b79f';
  au uuid := 'd4bb93d6-42d3-4f91-8b7c-84c9a0f37d03';
  mc_json jsonb;
  claims_col text; claims_rr text;
  r record; v_using text; v_check text; patron text := '((auth.jwt() -> ''user_metadata''::text) ->> ''role''::text) = ''admin''::text';
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
drop policy if exists rcma_tm_update on public.tickets_mas;
drop policy if exists rcma_tm_delete on public.tickets_mas;
create policy rcma_tm_update on public.tickets_mas as restrictive for update to authenticated
  using      (public.rcma_es_admin() or public.rcma_tiene_permiso('autorizar_ticket_mas') or public.rcma_tiene_permiso('cancelar_ticket_mas'))
  with check (public.rcma_es_admin() or public.rcma_tiene_permiso('autorizar_ticket_mas') or public.rcma_tiene_permiso('cancelar_ticket_mas'));
create policy rcma_tm_delete on public.tickets_mas as restrictive for delete to authenticated
  using (public.rcma_es_admin());
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
drop policy if exists rcma_aud_insert on public.auditoria_sistema;
drop policy if exists rcma_aud_update on public.auditoria_sistema;
drop policy if exists rcma_aud_delete on public.auditoria_sistema;
create policy rcma_aud_insert on public.auditoria_sistema as restrictive for insert to authenticated
  with check (usuario_id = auth.uid() or usuario_id is null);
create policy rcma_aud_update on public.auditoria_sistema as restrictive for update to authenticated using (false) with check (false);
create policy rcma_aud_delete on public.auditoria_sistema as restrictive for delete to authenticated using (false);
drop policy if exists rcma_mc_insert on public.maintenance_completions;
drop policy if exists rcma_mc_update on public.maintenance_completions;
drop policy if exists rcma_mc_delete on public.maintenance_completions;
create or replace function public.rcma_puede_marcar(p_colegio text) returns boolean
  language sql stable security definer set search_path = public as $f$
  select public.rcma_es_admin()
      or not exists (select 1 from user_permissions up where lower(up.user_email) = public.rcma_mi_correo()
                       and up.colegio is not null and up.colegio <> '' and up.colegio <> 'ECO')
      or exists (select 1 from user_permissions up where lower(up.user_email) = public.rcma_mi_correo()
                   and up.colegio = p_colegio and up.ver_calendario = true)
$f$;
revoke execute on function public.rcma_puede_marcar(text) from anon;
create policy rcma_mc_insert on public.maintenance_completions as restrictive for insert to authenticated
  with check (public.rcma_puede_marcar(colegio));
create policy rcma_mc_update on public.maintenance_completions as restrictive for update to authenticated
  using (public.rcma_puede_marcar(colegio)) with check (public.rcma_puede_marcar(colegio));
create policy rcma_mc_delete on public.maintenance_completions as restrictive for delete to authenticated
  using (public.rcma_puede_marcar(colegio));
drop policy if exists rcma_ms_insert on public.maintenance_settings;
drop policy if exists rcma_ms_update on public.maintenance_settings;
drop policy if exists rcma_ms_delete on public.maintenance_settings;
create policy rcma_ms_insert on public.maintenance_settings as restrictive for insert to authenticated
  with check (public.rcma_tiene_permiso('editar_calendario'));
create policy rcma_ms_update on public.maintenance_settings as restrictive for update to authenticated
  using (public.rcma_tiene_permiso('editar_calendario')) with check (public.rcma_tiene_permiso('editar_calendario'));
create policy rcma_ms_delete on public.maintenance_settings as restrictive for delete to authenticated
  using (public.rcma_es_admin());
drop policy if exists rcma_mi_insert on public.minimos_indispensables;
drop policy if exists rcma_mi_update on public.minimos_indispensables;
drop policy if exists rcma_mi_delete on public.minimos_indispensables;
create or replace function public.rcma_mi_territorio() returns text
  language sql stable security definer set search_path = public as $f$
  select up.territorio from user_permissions up where lower(up.user_email) = public.rcma_mi_correo() limit 1
$f$;
revoke execute on function public.rcma_mi_territorio() from anon;
create policy rcma_mi_insert on public.minimos_indispensables as restrictive for insert to authenticated
  with check (public.rcma_es_admin() or territorio = public.rcma_mi_territorio());
create policy rcma_mi_update on public.minimos_indispensables as restrictive for update to authenticated
  using (public.rcma_es_admin() or territorio = public.rcma_mi_territorio())
  with check (public.rcma_es_admin() or territorio = public.rcma_mi_territorio());
create policy rcma_mi_delete on public.minimos_indispensables as restrictive for delete to authenticated
  using (public.rcma_es_admin() or territorio = public.rcma_mi_territorio());
  select id into uid_col from auth.users where lower(email)='lsanchez.zom@manoamiga.edu.mx';
  select id into uid_car from auth.users where lower(email)='gromero@manoamiga.edu.mx';
  select id into uid_rr  from auth.users where lower(email)='rreyes@manoamiga.edu.mx';
  select to_jsonb(m) - 'id' into mc_json from maintenance_completions m where id='7b67f49e-90e4-4fa5-b116-d87ad8589244';
  claims_col := json_build_object('sub',uid_col,'email','lsanchez.zom@manoamiga.edu.mx','role','authenticated','user_metadata',json_build_object('role','admin'),'app_metadata',json_build_object())::text;
  claims_car := json_build_object('sub',uid_car,'email','gromero@manoamiga.edu.mx','role','authenticated','user_metadata',json_build_object('role','admin'),'app_metadata',json_build_object())::text;
  claims_rr  := json_build_object('sub',uid_rr,'email','rreyes@manoamiga.edu.mx','role','authenticated','user_metadata',json_build_object('role','admin'),'app_metadata',json_build_object())::text;
  -- ===== CAR que se puso admin =====
  perform set_config('request.jwt.claims', claims_car, true);
  perform set_config('role', 'authenticated', true);
  update tickets_mas set descripcion = descripcion where id = t; get diagnostics n = row_count; res := res || format('CAR editar ticket: %s | ', n);
  delete from tickets_mas where id = t; get diagnostics n = row_count; res := res || format('CAR borrar ticket: %s | ', n);
  update minutas set asunto = asunto where id = mi; get diagnostics n = row_count; res := res || format('CAR editar minuta: %s | ', n);
  delete from minutas where id = mi; get diagnostics n = row_count; res := res || format('CAR borrar minuta: %s | ', n);
  update minuta_acuerdos set id = id where id = ac; get diagnostics n = row_count; res := res || format('CAR editar acuerdo: %s | ', n);
  delete from auditoria_sistema where id = au; get diagnostics n = row_count; res := res || format('CAR borrar bitacora: %s | ', n);
  update maintenance_settings set value = value where key = 'notif_hora'; get diagnostics n = row_count; res := res || format('CAR editar config: %s | ', n);
  begin
    insert into auditoria_sistema (usuario_id, usuario_email, accion, modulo) values (uid_rr, 'rreyes@manoamiga.edu.mx', 'editar', 'sol');
    res := res || 'CAR bitacora a nombre de otro: PERMITIDO | ';
  exception when others then res := res || 'CAR bitacora a nombre de otro: bloqueado | '; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', claims_col, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into maintenance_completions select * from jsonb_populate_record(null::maintenance_completions, mc_json || jsonb_build_object('id', gen_random_uuid(), 'colegio', 'MA MTY'));
    res := res || 'COL marcar OTRO colegio: PERMITIDO | ';
  exception when others then res := res || 'COL marcar OTRO colegio: bloqueado | '; end;
  begin
    insert into maintenance_completions select * from jsonb_populate_record(null::maintenance_completions, mc_json || jsonb_build_object('id', gen_random_uuid(), 'colegio', 'MA ZOM', 'realizado_por', 'lsanchez.zom@manoamiga.edu.mx', 'fecha_programada', '2099-01-01'));
    res := res || 'COL marcar SU colegio: ok | ';
  exception when others then res := res || 'COL marcar SU colegio: FALLO ' || sqlerrm || ' | '; end;
  begin
    insert into auditoria_sistema (usuario_id, usuario_email, accion, modulo) values (uid_rr, 'rreyes@manoamiga.edu.mx', 'editar', 'sol');
    res := res || 'COL bitacora a nombre de otro: PERMITIDO | ';
  exception when others then res := res || 'COL bitacora a nombre de otro: bloqueado | '; end;
  begin
    insert into auditoria_sistema (usuario_id, usuario_email, accion, modulo) values (uid_col, 'lsanchez.zom@manoamiga.edu.mx', 'editar', 'calendario');
    res := res || 'COL bitacora propia: ok | ';
  exception when others then res := res || 'COL bitacora propia: FALLO ' || sqlerrm || ' | '; end;
  execute 'reset role';
  -- ===== Ricardo =====
  perform set_config('request.jwt.claims', claims_rr, true);
  perform set_config('role', 'authenticated', true);
  update tickets_mas set descripcion = descripcion where id = t; get diagnostics n = row_count; res := res || format('RR editar ticket: %s | ', n);
  update minutas set asunto = asunto where id = mi; get diagnostics n = row_count; res := res || format('RR editar minuta: %s | ', n);
  update minuta_acuerdos set id = id where id = ac; get diagnostics n = row_count; res := res || format('RR editar acuerdo: %s | ', n);
  update maintenance_settings set value = value where key = 'notif_hora'; get diagnostics n = row_count; res := res || format('RR editar config: %s | ', n);
  begin
    insert into maintenance_completions select * from jsonb_populate_record(null::maintenance_completions, mc_json || jsonb_build_object('id', gen_random_uuid(), 'fecha_programada', '2099-01-02'));
    res := res || 'RR marcar MTY: ok | ';
  exception when others then res := res || 'RR marcar MTY: FALLO ' || sqlerrm || ' | '; end;
  delete from auditoria_sistema where id = au; get diagnostics n = row_count; res := res || format('RR borrar bitacora: %s', n);
  execute 'reset role';
  raise exception 'PRUEBA (todo se deshizo): %', res;
end $prueba$;
