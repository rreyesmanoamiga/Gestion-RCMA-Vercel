-- ═════════════════════════════════════════════════════════════════════════════
-- PROGRAMA SOL · Recorrido SOL y Voluntariado SOL desde el celular,
-- solicitudes de firma del Coordinador y retiro del Checklist de Obras.
-- Pegar completo en Supabase → SQL Editor → Run. La validación está al final.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. Permiso nuevo: "Realizar recorridos y jornadas SOL" ──────────────────
alter table public.user_permissions add column if not exists sol_recorridos boolean not null default false;

-- Quién puede trabajar en campo en un colegio: el administrador, o quien tenga el
-- permiso y el colegio dentro de su alcance (territorio / colegio de Accesos).
create or replace function public.sol_puede_recorrer(p_colegio text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select public.sol_es_admin()
      or (public.rcma_tiene_permiso('sol_recorridos')
          and (p_colegio is null or public.rcma_puede_ver(null, p_colegio)));
$$;

-- ── 2. Inspecciones: el recorrido se guarda como inspección SOL ─────────────
alter table public.sol_inspecciones drop constraint if exists sol_inspecciones_tipo_check;
alter table public.sol_inspecciones add constraint sol_inspecciones_tipo_check
  check (tipo = any (array['linea_base','semanal','mensual','trimestral','anual','visita_mas']));
alter table public.sol_inspecciones drop constraint if exists sol_inspecciones_origen_check;
alter table public.sol_inspecciones add constraint sol_inspecciones_origen_check
  check (origen = any (array['excel','manual','recorrido']));
alter table public.sol_inspecciones alter column origen set default 'recorrido';
-- Dos visitas el mismo día al mismo colegio ya no chocan (solo aplica a capturas viejas)
alter table public.sol_inspecciones drop constraint if exists sol_inspecciones_colegio_fecha_tipo_key;
create unique index if not exists sol_inspecciones_colegio_fecha_tipo_uk
  on public.sol_inspecciones (colegio, fecha, tipo) where origen <> 'recorrido';
alter table public.sol_inspecciones add column if not exists folio text;
alter table public.sol_inspecciones add column if not exists recorrido jsonb not null default '{}'::jsonb;
create unique index if not exists sol_inspecciones_folio_uk on public.sol_inspecciones (folio) where folio is not null;
create unique index if not exists sol_inspecciones_borrador_uk on public.sol_inspecciones ((recorrido ->> 'borrador_id')) where recorrido ? 'borrador_id';

alter table public.sol_respuestas     add column if not exists fotos jsonb not null default '[]'::jsonb;
alter table public.sol_hallazgos      add column if not exists cuenta_sol boolean not null default true;
alter table public.sol_hallazgos      add column if not exists fotos jsonb not null default '[]'::jsonb;
alter table public.sol_tarjetas_rojas add column if not exists fotos jsonb not null default '[]'::jsonb;
alter table public.sol_tarjetas_rojas add column if not exists ubicacion text;

-- ── 3. Área Infraestructura (no cuenta en el Índice ni en el ranking) ───────
create table if not exists public.sol_criterios_infra (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  texto text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.sol_criterios_infra enable row level security;
drop policy if exists sol_infra_select on public.sol_criterios_infra;
create policy sol_infra_select on public.sol_criterios_infra for select to authenticated using (true);
drop policy if exists sol_infra_admin on public.sol_criterios_infra;
create policy sol_infra_admin on public.sol_criterios_infra for all to authenticated using (public.sol_es_admin()) with check (public.sol_es_admin());
insert into public.sol_criterios_infra (numero, texto) values
  (101, 'Tablero eléctrico cerrado, rotulado y con protecciones'),
  (102, 'Extintores vigentes, señalizados y sin obstrucción'),
  (103, 'Salidas de emergencia y rutas de evacuación señalizadas'),
  (104, 'Alumbrado de emergencia funcionando'),
  (105, 'Cisterna y tinacos tapados y limpios'),
  (106, 'Instalación de gas con válvulas de corte accesibles (si aplica)'),
  (107, 'Sin filtraciones ni humedad visibles en techos y muros'),
  (108, 'Sanitarios y bebederos funcionando')
on conflict (numero) do nothing;

-- ── 4. Lectura para el equipo de campo ──────────────────────────────────────
drop policy if exists sol_criterios_campo on public.sol_criterios;
create policy sol_criterios_campo on public.sol_criterios for select to authenticated using (public.sol_puede_recorrer(null));
drop policy if exists sol_insp_campo on public.sol_inspecciones;
create policy sol_insp_campo on public.sol_inspecciones for select to authenticated
  using (public.sol_puede_recorrer(colegio) and lower(coalesce(created_by, '')) = public.rcma_mi_correo());
drop policy if exists sol_resp_campo on public.sol_respuestas;
create policy sol_resp_campo on public.sol_respuestas for select to authenticated
  using (exists (select 1 from public.sol_inspecciones i where i.id = inspeccion_id
                 and lower(coalesce(i.created_by, '')) = public.rcma_mi_correo() and public.sol_puede_recorrer(i.colegio)));
drop policy if exists sol_hall_campo on public.sol_hallazgos;
create policy sol_hall_campo on public.sol_hallazgos for select to authenticated using (public.sol_puede_recorrer(colegio));
drop policy if exists sol_tr_campo on public.sol_tarjetas_rojas;
create policy sol_tr_campo on public.sol_tarjetas_rojas for select to authenticated using (public.sol_puede_recorrer(colegio));

-- ── 5. Guardar un recorrido completo (una sola transacción, folios sin choques) ─
create or replace function public.sol_codigo_corto(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(regexp_replace(coalesce(p, ''), '^MA\s+', '', 'i'), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.sol_ciclo_de(d date)
returns text language sql immutable as $$
  select case when extract(month from d) >= 8
              then extract(year from d)::int || '-' || (extract(year from d)::int + 1)
              else (extract(year from d)::int - 1) || '-' || extract(year from d)::int end;
$$;

create or replace function public.sol_trimestre_de(d date)
returns int language sql immutable as $$
  select case when extract(month from d) between 8 and 11 then 1
              when extract(month from d) = 12 or extract(month from d) <= 3 then 2 else 3 end;
$$;

-- Siguiente consecutivo de un prefijo ("ZAC-H-" → 37)
create or replace function public.sol_siguiente_num(p_tabla text, p_prefijo text)
returns int language plpgsql stable security definer set search_path = public as $$
declare n int;
begin
  execute format('select coalesce(max(nullif(regexp_replace(substr(folio, %s), ''[^0-9].*$'', ''''), '''')::int), 0)
                    from public.%I where folio like %L', length(p_prefijo) + 1, p_tabla, p_prefijo || '%')
    into n;
  return n + 1;
end $$;

create or replace function public.sol_registrar_recorrido(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_col   text := trim(p ->> 'colegio');
  v_fecha date := coalesce((p ->> 'fecha')::date, current_date);
  v_tipo  text := coalesce(nullif(p ->> 'tipo', ''), 'visita_mas');
  v_cc    text;
  v_terr  text;
  v_id    uuid;
  v_folio text;
  v_yo    text := public.rcma_mi_correo();
  v_n int; v_nh int := 0; v_nt int := 0;
  v_existe uuid;
  r record; x jsonb;
  v_ind numeric; v_s numeric; v_o numeric; v_l numeric; v_area jsonb := '{}'::jsonb;
  v_cal int; v_na int;
  v_res text; v_grave boolean;
  v_total_pal int;
begin
  if v_col is null or v_col = '' then raise exception 'Falta el colegio'; end if;
  if not public.sol_puede_recorrer(v_col) then raise exception 'No tienes permiso para registrar recorridos en este colegio'; end if;
  if v_tipo not in ('visita_mas', 'linea_base', 'trimestral', 'semanal', 'mensual', 'anual') then raise exception 'Tipo de recorrido no válido'; end if;

  -- Si el celular reintenta el envío, no se duplica
  select id into v_existe from public.sol_inspecciones where recorrido ->> 'borrador_id' = p ->> 'borrador_id';
  if v_existe is not null then
    select folio into v_folio from public.sol_inspecciones where id = v_existe;
    return jsonb_build_object('id', v_existe, 'folio', v_folio, 'hallazgos', null, 'tarjetas', null, 'repetido', true);
  end if;

  perform pg_advisory_xact_lock(hashtext('sol:' || v_col));
  v_cc := public.sol_codigo_corto(v_col);
  select territorio into v_terr from public.directorio where codigo = v_col limit 1;

  v_n := public.sol_siguiente_num('sol_inspecciones', 'REC-' || v_cc || '-' || extract(year from v_fecha)::int || '-');
  v_folio := 'REC-' || v_cc || '-' || extract(year from v_fecha)::int || '-' || lpad(v_n::text, 3, '0');

  insert into public.sol_inspecciones (colegio, territorio, fecha, tipo, ciclo, trimestre, inspectores, director, origen,
                                       folio, observaciones, created_by, recorrido)
  values (v_col, v_terr, v_fecha, v_tipo, public.sol_ciclo_de(v_fecha), public.sol_trimestre_de(v_fecha),
          nullif(p ->> 'elaboro_nombre', ''), nullif(p ->> 'director', ''), 'recorrido', v_folio,
          nullif(p ->> 'observaciones', ''), v_yo,
          jsonb_strip_nulls(jsonb_build_object(
            'borrador_id', p ->> 'borrador_id',
            'elaboro_nombre', p ->> 'elaboro_nombre', 'elaboro_puesto', p ->> 'elaboro_puesto', 'elaboro_correo', v_yo,
            'acompanante', p ->> 'acompanante', 'administrador', p ->> 'administrador',
            'hora_inicio', p ->> 'hora_inicio', 'hora_fin', p ->> 'hora_fin',
            'areas_omitidas', p -> 'areas_omitidas',
            'infraestructura', coalesce(p -> 'infraestructura', '[]'::jsonb),
            'extras', coalesce(p -> 'extras', '[]'::jsonb),
            'guardianes', coalesce(p -> 'guardianes', '[]'::jsonb),
            'firmas', p -> 'firmas')))
  returning id into v_id;

  -- Respuestas de los criterios SOL (el texto se toma del catálogo de ese día)
  insert into public.sol_respuestas (inspeccion_id, criterio_numero, area, tipo, texto, calificacion, na, observacion, foto, fotos)
  select v_id, c.numero, c.area, c.tipo, c.texto,
         case when coalesce((e ->> 'na')::boolean, false) then null else (e ->> 'calificacion')::int end,
         coalesce((e ->> 'na')::boolean, false),
         nullif(e ->> 'observacion', ''),
         jsonb_array_length(coalesce(e -> 'fotos', '[]'::jsonb)) > 0,
         coalesce(e -> 'fotos', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p -> 'respuestas', '[]'::jsonb)) e
  join public.sol_criterios c on c.numero = (e ->> 'criterio_numero')::int;

  -- Índice SOL (igual que la hoja Resultado)
  select round(100.0 * sum(calificacion) / nullif(2 * count(calificacion), 0), 1),
         round(100.0 * sum(calificacion) filter (where tipo = 'S') / nullif(2 * count(calificacion) filter (where tipo = 'S'), 0), 1),
         round(100.0 * sum(calificacion) filter (where tipo = 'O') / nullif(2 * count(calificacion) filter (where tipo = 'O'), 0), 1),
         round(100.0 * sum(calificacion) filter (where tipo = 'L') / nullif(2 * count(calificacion) filter (where tipo = 'L'), 0), 1),
         count(calificacion) filter (where not na), count(*) filter (where na)
    into v_ind, v_s, v_o, v_l, v_cal, v_na
  from public.sol_respuestas where inspeccion_id = v_id;
  select coalesce(jsonb_object_agg(area, ind), '{}'::jsonb) into v_area from (
    select area, round(100.0 * sum(calificacion) / nullif(2 * count(calificacion), 0), 1) ind
    from public.sol_respuestas where inspeccion_id = v_id group by area) a;
  update public.sol_inspecciones set indice = v_ind, indice_s = v_s, indice_o = v_o, indice_l = v_l, por_area = v_area,
         criterios_calificados = coalesce(v_cal, 0), criterios_na = coalesce(v_na, 0)
   where id = v_id;

  -- Hallazgos: Parcial o No cumple. Los de Infraestructura y conceptos extra no cuentan para SOL.
  v_n := public.sol_siguiente_num('sol_hallazgos', v_cc || '-H-');
  for r in select * from public.sol_respuestas where inspeccion_id = v_id and not na and calificacion in (0, 1) order by criterio_numero loop
    v_grave := r.tipo = 'S' and r.calificacion = 0;
    insert into public.sol_hallazgos (folio, colegio, territorio, inspeccion_id, criterio_numero, fecha, area, tipo, hallazgo,
                                      fecha_compromiso, estatus, riesgo_grave, cuenta_sol, fotos)
    values (v_cc || '-H-' || lpad(v_n::text, 3, '0'), v_col, v_terr, v_id, r.criterio_numero, v_fecha, r.area, r.tipo,
            r.texto || coalesce(' — ' || r.observacion, ''),
            case when v_grave then v_fecha else v_fecha + 30 end, 'abierto', v_grave, true, r.fotos);
    v_n := v_n + 1; v_nh := v_nh + 1;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p -> 'infraestructura', '[]'::jsonb)) loop
    v_res := x ->> 'resultado';
    if v_res in ('parcial', 'no_cumple') then
      v_grave := v_res = 'no_cumple';
      insert into public.sol_hallazgos (folio, colegio, territorio, inspeccion_id, fecha, area, hallazgo, fecha_compromiso,
                                        estatus, riesgo_grave, cuenta_sol, fotos)
      values (v_cc || '-H-' || lpad(v_n::text, 3, '0'), v_col, v_terr, v_id, v_fecha, 'Infraestructura',
              (x ->> 'texto') || coalesce(' — ' || nullif(x ->> 'observacion', ''), ''),
              case when v_grave then v_fecha else v_fecha + 30 end, 'abierto', v_grave, false, coalesce(x -> 'fotos', '[]'::jsonb));
      v_n := v_n + 1; v_nh := v_nh + 1;
    end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p -> 'extras', '[]'::jsonb)) loop
    v_res := x ->> 'resultado';
    if v_res in ('parcial', 'no_cumple') then
      insert into public.sol_hallazgos (folio, colegio, territorio, inspeccion_id, fecha, area, hallazgo, fecha_compromiso,
                                        estatus, riesgo_grave, cuenta_sol, fotos)
      values (v_cc || '-H-' || lpad(v_n::text, 3, '0'), v_col, v_terr, v_id, v_fecha, nullif(x ->> 'area', ''),
              'Concepto extra: ' || (x ->> 'texto') || coalesce(' — ' || nullif(x ->> 'observacion', ''), ''),
              v_fecha + 30, 'abierto', false, false, coalesce(x -> 'fotos', '[]'::jsonb));
      v_n := v_n + 1; v_nh := v_nh + 1;
    end if;
  end loop;

  -- Tarjetas rojas: los 30 días corren desde el registro
  v_n := public.sol_siguiente_num('sol_tarjetas_rojas', v_cc || '-TR-');
  for x in select * from jsonb_array_elements(coalesce(p -> 'tarjetas', '[]'::jsonb)) loop
    insert into public.sol_tarjetas_rojas (folio, colegio, territorio, inspeccion_id, fecha, area, articulo, cantidad, ubicacion,
                                           motivo, destino, fecha_limite, estatus, observaciones, fotos)
    values (v_cc || '-TR-' || lpad(v_n::text, 3, '0'), v_col, v_terr, v_id, current_date, nullif(x ->> 'area', ''),
            coalesce(nullif(x ->> 'articulo', ''), 'Artículo'), nullif(x ->> 'cantidad', '')::numeric, nullif(x ->> 'ubicacion', ''),
            nullif(x ->> 'motivo', ''), nullif(x ->> 'destino', ''), current_date + 30, 'pendiente',
            nullif(x ->> 'observaciones', ''), coalesce(x -> 'fotos', '[]'::jsonb));
    v_n := v_n + 1; v_nt := v_nt + 1;
  end loop;

  -- Guardianes: el concentrado SOL-F08 que se fotografió en el recorrido
  select count(*) * 5 into v_total_pal from public.sol_guardianes_renglones where activo;
  for x in select * from jsonb_array_elements(coalesce(p -> 'guardianes', '[]'::jsonb)) loop
    if coalesce(x ->> 'grupo', '') <> '' and coalesce(x ->> 'nivel', '') <> '' then
      insert into public.sol_guardianes (colegio, ciclo, trimestre, nivel, grupo, promedio, porcentaje, notas)
      values (v_col, public.sol_ciclo_de(v_fecha), public.sol_trimestre_de(v_fecha), x ->> 'nivel', x ->> 'grupo',
              nullif(x ->> 'promedio', '')::numeric,
              round(100.0 * nullif(x ->> 'promedio', '')::numeric / nullif(v_total_pal, 0), 1),
              'Concentrado SOL-F08 capturado en el recorrido ' || v_folio)
      on conflict (colegio, ciclo, trimestre, grupo) do update
        set nivel = excluded.nivel, promedio = excluded.promedio, porcentaje = excluded.porcentaje,
            notas = concat_ws(E'\n', public.sol_guardianes.notas, excluded.notas);
    end if;
  end loop;

  return jsonb_build_object('id', v_id, 'folio', v_folio, 'hallazgos', v_nh, 'tarjetas', v_nt, 'repetido', false);
end $$;
revoke all on function public.sol_registrar_recorrido(jsonb) from public, anon;
grant execute on function public.sol_registrar_recorrido(jsonb) to authenticated;

-- Liga del informe PDF que el celular sube a OneDrive al terminar
create or replace function public.sol_recorrido_pdf(p_id uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.sol_inspecciones set pdf_url = p_url, updated_at = now()
   where id = p_id and (public.sol_es_admin() or (lower(coalesce(created_by, '')) = public.rcma_mi_correo() and public.sol_puede_recorrer(colegio)));
  if not found then raise exception 'No se encontró el recorrido o no tienes permiso'; end if;
end $$;
revoke all on function public.sol_recorrido_pdf(uuid, text) from public, anon;
grant execute on function public.sol_recorrido_pdf(uuid, text) to authenticated;

-- ── 6. Voluntariado SOL: la jornada (sol_apoyos) va del aviso al cierre ─────
alter table public.sol_apoyos add column if not exists estatus text not null default 'cerrada';
alter table public.sol_apoyos drop constraint if exists sol_apoyos_estatus_check;
alter table public.sol_apoyos add constraint sol_apoyos_estatus_check
  check (estatus = any (array['aviso','autorizada','regresada','cerrada','cancelada']));
alter table public.sol_apoyos add column if not exists hora_inicio text;
alter table public.sol_apoyos add column if not exists hora_fin text;
alter table public.sol_apoyos add column if not exists voluntarios_esperados integer;
alter table public.sol_apoyos add column if not exists actividades text[] not null default '{}';
alter table public.sol_apoyos add column if not exists obs_coordinacion text;
alter table public.sol_apoyos add column if not exists autorizado_por text;
alter table public.sol_apoyos add column if not exists autorizado_at timestamptz;
alter table public.sol_apoyos add column if not exists creado_por text;
alter table public.sol_apoyos add column if not exists creado_nombre text;
alter table public.sol_apoyos add column if not exists llegada_at timestamptz;
alter table public.sol_apoyos add column if not exists reglas_acepta text;
alter table public.sol_apoyos add column if not exists reglas_firma text;
alter table public.sol_apoyos add column if not exists recibe_firma text;
alter table public.sol_apoyos add column if not exists informe_url text;

-- Folio automático (MTY-V-004) para que dos personas no tomen el mismo
create or replace function public.sol_apoyos_folio()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cc text;
begin
  if new.folio is null or new.folio = '' then
    perform pg_advisory_xact_lock(hashtext('solv:' || new.colegio));
    v_cc := public.sol_codigo_corto(new.colegio);
    new.folio := v_cc || '-V-' || lpad(public.sol_siguiente_num('sol_apoyos', v_cc || '-V-')::text, 3, '0');
  end if;
  return new;
end $$;
drop trigger if exists sol_apoyos_folio on public.sol_apoyos;
create trigger sol_apoyos_folio before insert on public.sol_apoyos for each row execute function public.sol_apoyos_folio();

-- Quien no es administrador no se autoriza solo ni cierra sin el procedimiento
create or replace function public.sol_apoyos_guarda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.sol_es_admin() or current_setting('sol.cierre', true) = '1' then return new; end if;
  if new.estatus is distinct from old.estatus and not (old.estatus = 'regresada' and new.estatus = 'aviso') then
    raise exception 'Solo la Coordinación cambia el estatus de la jornada';
  end if;
  if new.autorizado_por is distinct from old.autorizado_por or new.autorizado_at is distinct from old.autorizado_at
     or new.obs_coordinacion is distinct from old.obs_coordinacion or new.creado_por is distinct from old.creado_por then
    raise exception 'No puedes cambiar estos datos de la jornada';
  end if;
  return new;
end $$;
drop trigger if exists sol_apoyos_guarda on public.sol_apoyos;
create trigger sol_apoyos_guarda before update on public.sol_apoyos for each row execute function public.sol_apoyos_guarda();

drop policy if exists sol_apoyos_campo_sel on public.sol_apoyos;
create policy sol_apoyos_campo_sel on public.sol_apoyos for select to authenticated using (public.sol_puede_recorrer(colegio));
drop policy if exists sol_apoyos_campo_ins on public.sol_apoyos;
create policy sol_apoyos_campo_ins on public.sol_apoyos for insert to authenticated
  with check (public.sol_puede_recorrer(colegio) and estatus = 'aviso' and lower(coalesce(creado_por, '')) = public.rcma_mi_correo());
drop policy if exists sol_apoyos_campo_upd on public.sol_apoyos;
create policy sol_apoyos_campo_upd on public.sol_apoyos for update to authenticated
  using (public.sol_puede_recorrer(colegio) and lower(coalesce(creado_por, '')) = public.rcma_mi_correo() and estatus in ('aviso', 'regresada', 'autorizada'))
  with check (public.sol_puede_recorrer(colegio) and lower(coalesce(creado_por, '')) = public.rcma_mi_correo());
drop policy if exists sol_aliados_campo_sel on public.sol_aliados;
create policy sol_aliados_campo_sel on public.sol_aliados for select to authenticated using (public.sol_puede_recorrer(null));
drop policy if exists sol_aliados_campo_ins on public.sol_aliados;
create policy sol_aliados_campo_ins on public.sol_aliados for insert to authenticated with check (public.sol_puede_recorrer(null) and activo);

-- Cierre de la jornada: horas, fotos y los hallazgos/tarjetas atendidos se cierran
create or replace function public.sol_cerrar_jornada(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.sol_apoyos; v_nota text; v_h int := 0; v_t int := 0;
begin
  select * into a from public.sol_apoyos where id = p_id;
  if not found then raise exception 'Jornada no encontrada'; end if;
  if not (public.sol_es_admin() or (public.sol_puede_recorrer(a.colegio) and lower(coalesce(a.creado_por, '')) = public.rcma_mi_correo())) then
    raise exception 'No tienes permiso para cerrar esta jornada';
  end if;
  if a.estatus <> 'autorizada' and not public.sol_es_admin() then raise exception 'La jornada debe estar autorizada para cerrarse'; end if;
  perform set_config('sol.cierre', '1', true);
  v_nota := 'Atendido por voluntariado (' || coalesce(a.folio, '') || ')';
  update public.sol_apoyos set
    voluntarios = nullif(p ->> 'voluntarios', '')::int,
    horas = nullif(p ->> 'horas', '')::numeric,
    hora_fin = coalesce(nullif(p ->> 'hora_fin', ''), hora_fin),
    fotos = coalesce(p -> 'fotos', fotos),
    hallazgos_ids = coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(p -> 'hallazgos_ids')), '{}'),
    tarjetas_ids = coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(p -> 'tarjetas_ids')), '{}'),
    notas = nullif(p ->> 'notas', ''),
    responsable_campus = coalesce(nullif(p ->> 'responsable_campus', ''), responsable_campus),
    recibe_firma = coalesce(p ->> 'recibe_firma', recibe_firma),
    estatus = 'cerrada'
  where id = p_id;
  update public.sol_hallazgos set estatus = 'cerrado', fecha_cierre = a.fecha, notas = concat_ws(E'\n', notas, v_nota)
   where colegio = a.colegio and estatus <> 'cerrado'
     and id in (select value::uuid from jsonb_array_elements_text(coalesce(p -> 'hallazgos_ids', '[]'::jsonb)));
  get diagnostics v_h = row_count;
  update public.sol_tarjetas_rojas set estatus = 'resuelto', fecha_resolucion = a.fecha, observaciones = concat_ws(E'\n', observaciones, v_nota)
   where colegio = a.colegio and estatus <> 'resuelto'
     and id in (select value::uuid from jsonb_array_elements_text(coalesce(p -> 'tarjetas_ids', '[]'::jsonb)));
  get diagnostics v_t = row_count;
  return jsonb_build_object('hallazgos', v_h, 'tarjetas', v_t);
end $$;
revoke all on function public.sol_cerrar_jornada(uuid, jsonb) from public, anon;
grant execute on function public.sol_cerrar_jornada(uuid, jsonb) to authenticated;

create or replace function public.sol_jornada_informe(p_id uuid, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('sol.cierre', '1', true);
  update public.sol_apoyos set informe_url = p_url
   where id = p_id and (public.sol_es_admin() or (lower(coalesce(creado_por, '')) = public.rcma_mi_correo() and public.sol_puede_recorrer(colegio)));
  if not found then raise exception 'No se encontró la jornada o no tienes permiso'; end if;
end $$;
revoke all on function public.sol_jornada_informe(uuid, text) from public, anon;
grant execute on function public.sol_jornada_informe(uuid, text) to authenticated;

-- ── 7. Solicitudes de firma del Coordinador para los reconocimientos ────────
create table if not exists public.sol_firmas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('aliado','aliado_anual','campus','guardian','grupo')),
  referencia_id uuid,
  colegio text,
  titulo text not null,
  datos jsonb not null,
  solicitado_por text not null,
  solicitado_nombre text,
  estatus text not null default 'pendiente' check (estatus in ('pendiente','firmada','rechazada')),
  motivo text,
  firmado_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists sol_firmas_pendiente_uk on public.sol_firmas (referencia_id) where estatus = 'pendiente' and referencia_id is not null;
alter table public.sol_firmas enable row level security;
drop policy if exists sol_firmas_admin on public.sol_firmas;
create policy sol_firmas_admin on public.sol_firmas for all to authenticated using (public.sol_es_admin()) with check (public.sol_es_admin());
drop policy if exists sol_firmas_propias on public.sol_firmas;
create policy sol_firmas_propias on public.sol_firmas for select to authenticated using (lower(solicitado_por) = public.rcma_mi_correo());
drop policy if exists sol_firmas_solicitar on public.sol_firmas;
create policy sol_firmas_solicitar on public.sol_firmas for insert to authenticated
  with check (lower(solicitado_por) = public.rcma_mi_correo() and estatus = 'pendiente' and firmado_at is null
              and public.sol_puede_recorrer(colegio));

-- ── 8. El dictamen Campus SOL ignora Infraestructura y conceptos extra ──────
create or replace function public.sol_resumen_campus(p_ciclo text default null::text)
returns table(colegio text, hallazgos_total bigint, hallazgos_abiertos bigint, hallazgos_vencidos bigint, hallazgos_cerrados bigint,
              hallazgos_cerrados_30 bigint, riesgos_graves bigint, tarjetas_total bigint, tarjetas_pendientes bigint,
              tarjetas_vencidas bigint, tarjetas_con_ticket bigint, areas_con_dueno integer, comite_con_acta boolean, distintivos text)
language sql stable security definer set search_path to 'public' as $function$
  with campus as (
    select distinct colegio from sol_inspecciones
    union select colegio from sol_hallazgos
    union select colegio from sol_tarjetas_rojas
    union select colegio from sol_comites
  ),
  h as (
    select colegio,
      count(*)                                                        as total,
      count(*) filter (where estatus <> 'cerrado')                    as abiertos,
      count(*) filter (where estatus <> 'cerrado' and current_date - fecha > 30) as vencidos,
      count(*) filter (where estatus = 'cerrado')                     as cerrados,
      count(*) filter (where estatus = 'cerrado' and fecha_cierre is not null and fecha_cierre - fecha <= 30) as cerrados_30,
      count(*) filter (where estatus <> 'cerrado' and riesgo_grave)   as graves
    from sol_hallazgos
    where cuenta_sol
      and (p_ciclo is null
       or fecha between to_date(split_part(p_ciclo,'-',1) || '-08-01','YYYY-MM-DD')
                    and to_date(split_part(p_ciclo,'-',2) || '-07-31','YYYY-MM-DD'))
    group by colegio
  ),
  t as (
    select colegio,
      count(*)                                                                        as total,
      count(*) filter (where estatus <> 'resuelto')                                   as pendientes,
      count(*) filter (where estatus <> 'resuelto' and fecha_limite is not null and fecha_limite < current_date) as vencidas,
      count(*) filter (where ticket_mas_id is not null)                               as con_ticket
    from sol_tarjetas_rojas
    where p_ciclo is null
       or fecha between to_date(split_part(p_ciclo,'-',1) || '-08-01','YYYY-MM-DD')
                    and to_date(split_part(p_ciclo,'-',2) || '-07-31','YYYY-MM-DD')
    group by colegio
  ),
  c as (
    select distinct on (colegio) colegio,
      (select count(*) from jsonb_each_text(duenos) d where trim(d.value) <> '')::int as areas,
      (acta_url is not null and acta_url <> '') as acta
    from sol_comites
    where p_ciclo is null or ciclo = p_ciclo
    order by colegio, ciclo desc
  ),
  r as (
    select colegio, string_agg(ciclo, ', ' order by ciclo) as ciclos
    from sol_reconocimientos where tipo = 'campus' group by colegio
  )
  select cp.colegio,
    coalesce(h.total,0), coalesce(h.abiertos,0), coalesce(h.vencidos,0), coalesce(h.cerrados,0),
    coalesce(h.cerrados_30,0), coalesce(h.graves,0),
    coalesce(t.total,0), coalesce(t.pendientes,0), coalesce(t.vencidas,0), coalesce(t.con_ticket,0),
    coalesce(c.areas,0), coalesce(c.acta,false), r.ciclos
  from campus cp
  left join h on h.colegio = cp.colegio
  left join t on t.colegio = cp.colegio
  left join c on c.colegio = cp.colegio
  left join r on r.colegio = cp.colegio
  where sol_puede_ver();
$function$;

-- ── 9. Se retira el Checklist de Obras (las dos tablas están vacías) ────────
drop table if exists public.checklists;
drop table if exists public.minimos_indispensables;

-- ═════════════════════════════════════════════════════════════════════════════
-- VALIDACIÓN — todas las filas deben decir true
-- ═════════════════════════════════════════════════════════════════════════════
select 'permiso sol_recorridos'           as revision, exists (select 1 from information_schema.columns where table_schema='public' and table_name='user_permissions' and column_name='sol_recorridos') as ok
union all select 'tipo visita_mas permitido',      pg_get_constraintdef((select oid from pg_constraint where conname='sol_inspecciones_tipo_check')) like '%visita_mas%'
union all select 'columna recorrido',              exists (select 1 from information_schema.columns where table_name='sol_inspecciones' and column_name='recorrido')
union all select 'hallazgos cuenta_sol',           exists (select 1 from information_schema.columns where table_name='sol_hallazgos' and column_name='cuenta_sol')
union all select '8 puntos de Infraestructura',    (select count(*) from public.sol_criterios_infra where activo) = 8
union all select 'función registrar recorrido',    exists (select 1 from pg_proc where proname='sol_registrar_recorrido')
union all select 'función cerrar jornada',         exists (select 1 from pg_proc where proname='sol_cerrar_jornada')
union all select 'tabla solicitudes de firma',     to_regclass('public.sol_firmas') is not null
union all select 'jornadas con estatus',           exists (select 1 from information_schema.columns where table_name='sol_apoyos' and column_name='estatus')
union all select 'checklists retirado',            to_regclass('public.checklists') is null and to_regclass('public.minimos_indispensables') is null
union all select 'folio REC de prueba',            public.sol_codigo_corto('MA ZAC') = 'ZAC' and public.sol_ciclo_de('2026-11-26') = '2026-2027' and public.sol_trimestre_de('2026-12-05') = 2;
