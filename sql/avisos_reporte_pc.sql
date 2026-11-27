-- ══════════════════════════════════════════════════════════════════════════
-- Avisos del Reporte Mensual con Firma (Protección Civil)
--   1) pc_reportes_control: por colegio y mes cerrado (desde 2026-08) guarda
--      avance, cuándo quedó al 100 %, cuándo se avisó y cuándo se envió a PC.
--   2) pg_cron: lunes a viernes 8:20 am (Monterrey) llama a
--      reporte-mantenimiento-mensual con {"avisos_pc": true}. El aviso llega
--      SOLO al administrador del sistema.
-- Requisito: desplegar antes reporte-mantenimiento-mensual (versión con avisos_pc).
-- ══════════════════════════════════════════════════════════════════════════

-- 1) Control ------------------------------------------------------------------
create table if not exists public.pc_reportes_control (
  colegio         text not null,
  periodo         text not null,                 -- AAAA-MM
  programadas     integer not null default 0,
  hechas          integer not null default 0,
  avance          integer not null default 0,    -- %
  completo_en     timestamptz,                   -- cuándo quedó al 100 % (null si no está completo)
  avisado_en      timestamptz,                   -- cuándo se avisó al administrador
  enviado_en      timestamptz,                   -- cuándo se marcó "Enviado a PC"
  enviado_por     text,
  actualizado_en  timestamptz not null default now(),
  primary key (colegio, periodo)
);

alter table public.pc_reportes_control enable row level security;
drop policy if exists "pc_control_admin_lee" on public.pc_reportes_control;
create policy "pc_control_admin_lee" on public.pc_reportes_control
  for select to authenticated using (public.rcma_es_admin());
drop policy if exists "pc_control_admin_marca" on public.pc_reportes_control;
create policy "pc_control_admin_marca" on public.pc_reportes_control
  for update to authenticated using (public.rcma_es_admin()) with check (public.rcma_es_admin());
-- (la Edge Function escribe con la llave de servicio)
revoke all on public.pc_reportes_control from anon;

-- 2) pg_cron -----------------------------------------------------------------
do $$
declare
  base text;
begin
  select command into base from cron.job where jobname = 'reporte-mtto-mensual-dia1-8am-mx';
  if base is null then
    raise exception 'No encontré el job reporte-mtto-mensual-dia1-8am-mx para copiar sus encabezados';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'avisos-pc-8-20am-mx';
  perform cron.schedule('avisos-pc-8-20am-mx', '20 14 * * 1-5',
    replace(base, 'body    := ''{}''::jsonb', 'body    := ''{"avisos_pc": true}''::jsonb'));
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- VALIDACIÓN — todas las filas deben decir true
-- ══════════════════════════════════════════════════════════════════════════
select 'tabla de control creada'        as revision, to_regclass('public.pc_reportes_control') is not null as ok
union all select 'control con RLS',            (select relrowsecurity from pg_class where oid = 'public.pc_reportes_control'::regclass)
union all select 'job de avisos (L-V 8:20)',   exists (select 1 from cron.job where jobname = 'avisos-pc-8-20am-mx' and schedule = '20 14 * * 1-5')
union all select 'job llama con avisos_pc',    exists (select 1 from cron.job where jobname = 'avisos-pc-8-20am-mx' and command like '%"avisos_pc": true%' and command like '%reporte-mantenimiento-mensual%')
union all select 'usa el secreto de la Matriz', exists (select 1 from cron.job where jobname = 'avisos-pc-8-20am-mx' and command like '%matriz_mensual_cron%');
