-- Hora opcional para pendientes y acuerdos (vacía = 9:00 en el calendario, como antes)
alter table public.nexus_pendientes      add column if not exists hora_limite time;
alter table public.compliance_pendientes add column if not exists hora_limite time;
alter table public.minuta_acuerdos       add column if not exists hora_compromiso time;

-- Aviso al calendario: también cuando cambia la hora
CREATE OR REPLACE FUNCTION public.nexus_calendario_avisar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_secreto text;
  v_id uuid := coalesce(new.id, old.id);
begin
  -- En cambios, solo avisar si cambió algo que afecta al evento
  if tg_op = 'UPDATE' and (
       new.titulo          is not distinct from old.titulo and
       new.descripcion     is not distinct from old.descripcion and
       new.fecha_limite    is not distinct from old.fecha_limite and
       new.hora_limite     is not distinct from old.hora_limite and
       new.estatus         is not distinct from old.estatus and
       new.tipo            is not distinct from old.tipo and
       new.asignado_a      is not distinct from old.asignado_a and
       new.created_by      is not distinct from old.created_by and
       new.prioridad       is not distinct from old.prioridad and
       new.colegio         is not distinct from old.colegio and
       new.territorio      is not distinct from old.territorio and
       new.proyecto_nombre is not distinct from old.proyecto_nombre and
       new.ticket_folio    is not distinct from old.ticket_folio
     ) then
    return new;
  end if;

  select decrypted_secret into v_secreto
    from vault.decrypted_secrets where name = 'nexus_cal_secret' limit 1;

  perform net.http_post(
    url     := 'https://wwghvummkxekrenfgzsd.supabase.co/functions/v1/nexus-calendario',
    body    := jsonb_build_object('pendiente_id', v_id, 'operacion', tg_op),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(v_secreto, '')),
    timeout_milliseconds := 15000
  );
  return coalesce(new, old);
exception when others then
  -- Si el aviso falla, el pendiente se guarda igual
  raise warning 'nexus_calendario_avisar: %', sqlerrm;
  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cn_calendario_avisar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_secreto text;
  v_id uuid := coalesce(new.id, old.id);
begin
  if tg_op = 'UPDATE' and (
       new.titulo       is not distinct from old.titulo and
       new.descripcion  is not distinct from old.descripcion and
       new.fecha_limite is not distinct from old.fecha_limite and
       new.hora_limite  is not distinct from old.hora_limite and
       new.estatus      is not distinct from old.estatus and
       new.tipo         is not distinct from old.tipo and
       new.asignado_a   is not distinct from old.asignado_a and
       new.created_by   is not distinct from old.created_by and
       new.prioridad    is not distinct from old.prioridad and
       new.colegio      is not distinct from old.colegio and
       new.origen_responsable is not distinct from old.origen_responsable
     ) then
    return new;
  end if;

  select decrypted_secret into v_secreto
    from vault.decrypted_secrets where name = 'nexus_cal_secret' limit 1;

  perform net.http_post(
    url     := 'https://wwghvummkxekrenfgzsd.supabase.co/functions/v1/nexus-calendario',
    body    := jsonb_build_object('pendiente_id', v_id, 'tabla', 'cumplimiento', 'operacion', tg_op),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(v_secreto, '')),
    timeout_milliseconds := 15000
  );
  return coalesce(new, old);
exception when others then
  raise warning 'cn_calendario_avisar: %', sqlerrm;
  return coalesce(new, old);
end;
$function$;

-- Minutas → NEXUS: copiar también la hora
CREATE OR REPLACE FUNCTION public.nexus_sync_desde_acuerdo()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  m        record;
  d        record;
  v_origen text;
  v_titulo text;
  v_est    text;
begin
  -- Si este cambio lo provocó la propia sincronización, no se regresa (evita bucles)
  if coalesce(current_setting('rcma.nexus_sync', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  perform set_config('rcma.nexus_sync', 'on', true);

  if tg_op = 'DELETE' then
    delete from nexus_comentarios where pendiente_id in (select id from nexus_pendientes where acuerdo_id = old.id);
    delete from nexus_pendientes where acuerdo_id = old.id;
    perform set_config('rcma.nexus_sync', '', true);
    return old;
  end if;

  select * into m from minutas where id = new.minuta_id;

  -- Los acuerdos de Minutas de Cumplimiento van a Seguimiento de Trámites, no a NEXUS
  if coalesce(m.modulo, 'obras') = 'cumplimiento' then
    perform set_config('rcma.nexus_sync', '', true);
    return new;
  end if;

  select * into d from nexus_acuerdos_duenio();
  v_origen := case when m.tipo = 'nota_tecnica' then 'accion' else 'acuerdo' end;
  v_titulo := left(new.descripcion, 160);
  v_est    := case new.estado when 'en_proceso' then 'en_proceso' when 'cumplido' then 'completado' else 'pendiente' end;

  -- Cancelado: el pendiente sale de NEXUS
  if new.estado = 'cancelado' then
    delete from nexus_comentarios where pendiente_id in (select id from nexus_pendientes where acuerdo_id = new.id);
    delete from nexus_pendientes where acuerdo_id = new.id;
    perform set_config('rcma.nexus_sync', '', true);
    return new;
  end if;

  if exists (select 1 from nexus_pendientes where acuerdo_id = new.id) then
    update nexus_pendientes set
      titulo             = v_titulo,
      descripcion        = new.descripcion,
      fecha_limite       = new.fecha_compromiso,
      hora_limite        = new.hora_compromiso,
      estatus            = v_est,
      completado_at      = case when v_est = 'completado' then coalesce(completado_at, now()) else null end,
      origen             = v_origen,
      origen_numero      = new.numero,
      origen_responsable = new.responsable,
      origen_asunto      = m.asunto,
      origen_fecha       = m.fecha,
      origen_url         = m.onedrive_url,
      colegio            = m.colegio,
      territorio         = m.territorio,
      updated_at         = now()
    where acuerdo_id = new.id;
  elsif new.estado in ('pendiente', 'en_proceso') then
    -- Solo se crean pendientes para acuerdos abiertos
    insert into nexus_pendientes (
      titulo, descripcion, tipo, asignado_a, asignado_nombre, asignado_cc, asignado_cc_nombre,
      prioridad, fecha_limite, hora_limite, estatus, created_by, colegio, territorio,
      acuerdo_id, minuta_id, origen, origen_numero, origen_asunto, origen_fecha, origen_responsable, origen_url
    ) values (
      v_titulo, new.descripcion, 'personal', d.email, d.nombre, '', '',
      'normal', new.fecha_compromiso, new.hora_compromiso, v_est, d.email, m.colegio, m.territorio,
      new.id, new.minuta_id, v_origen, new.numero, m.asunto, m.fecha, new.responsable, m.onedrive_url
    );
  end if;
  perform set_config('rcma.nexus_sync', '', true);
  return new;
end $function$;

-- Minutas de Cumplimiento → Seguimiento de Trámites: copiar también la hora
CREATE OR REPLACE FUNCTION public.cn_sync_desde_acuerdo()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  m        record;
  d        record;
  v_origen text;
  v_titulo text;
  v_est    text;
begin
  -- Si este cambio lo provocó la propia sincronización, no se regresa (evita bucles)
  if coalesce(current_setting('rcma.cn_sync', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  perform set_config('rcma.cn_sync', 'on', true);

  if tg_op = 'DELETE' then
    delete from compliance_comentarios where pendiente_id in (select id from compliance_pendientes where acuerdo_id = old.id);
    delete from compliance_pendientes where acuerdo_id = old.id;
    perform set_config('rcma.cn_sync', '', true);
    return old;
  end if;

  select * into m from minutas where id = new.minuta_id;
  if m.id is null or coalesce(m.modulo, 'obras') <> 'cumplimiento' then
    perform set_config('rcma.cn_sync', '', true);
    return new;
  end if;

  select * into d from nexus_acuerdos_duenio();
  v_origen := case when m.tipo = 'nota_tecnica' then 'accion' else 'acuerdo' end;
  v_titulo := left(new.descripcion, 160);
  v_est    := case new.estado when 'en_proceso' then 'en_proceso' when 'cumplido' then 'completado' else 'pendiente' end;

  if new.estado = 'cancelado' then
    delete from compliance_comentarios where pendiente_id in (select id from compliance_pendientes where acuerdo_id = new.id);
    delete from compliance_pendientes where acuerdo_id = new.id;
    perform set_config('rcma.cn_sync', '', true);
    return new;
  end if;

  if exists (select 1 from compliance_pendientes where acuerdo_id = new.id) then
    update compliance_pendientes set
      titulo             = v_titulo,
      descripcion        = new.descripcion,
      fecha_limite       = new.fecha_compromiso,
      hora_limite        = new.hora_compromiso,
      estatus            = v_est,
      completado_at      = case when v_est = 'completado' then coalesce(completado_at, now()) else null end,
      origen             = v_origen,
      origen_numero      = new.numero,
      origen_responsable = new.responsable,
      origen_asunto      = m.asunto,
      origen_fecha       = m.fecha,
      origen_url         = m.onedrive_url,
      colegio            = m.colegio,
      territorio         = m.territorio,
      updated_at         = now()
    where acuerdo_id = new.id;
  elsif new.estado in ('pendiente', 'en_proceso') then
    insert into compliance_pendientes (
      titulo, descripcion, tipo, asignado_a, asignado_nombre, prioridad, fecha_limite, hora_limite, estatus,
      created_by, colegio, territorio,
      acuerdo_id, minuta_id, origen, origen_numero, origen_asunto, origen_fecha, origen_responsable, origen_url
    ) values (
      v_titulo, new.descripcion, 'personal', d.email, d.nombre, 'normal', new.fecha_compromiso, new.hora_compromiso, v_est,
      d.email, m.colegio, m.territorio,
      new.id, new.minuta_id, v_origen, new.numero, m.asunto, m.fecha, new.responsable, m.onedrive_url
    );
  end if;
  perform set_config('rcma.cn_sync', '', true);
  return new;
end $function$;
