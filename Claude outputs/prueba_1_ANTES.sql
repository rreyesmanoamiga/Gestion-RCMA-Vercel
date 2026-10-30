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
  raise exception 'ANTES (todo se deshizo): %', res;
end $prueba$;
