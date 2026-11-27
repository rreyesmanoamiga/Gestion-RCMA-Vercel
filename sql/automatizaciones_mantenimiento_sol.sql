-- ══════════════════════════════════════════════════════════════════════════
-- Automatizaciones: reporte mensual de mantenimiento y recordatorios SOL
--   1) Bitácora de los reportes mensuales enviados (mantenimiento_reportes_log)
--   2) pg_cron:
--        · reporte-mantenimiento-mensual → día 1 de cada mes, 8:00 am (Monterrey)
--        · sol-recordatorios             → lunes a viernes, 8:15 am (Monterrey)
--      Usan el mismo secreto de la Matriz mensual (Vault: matriz_mensual_cron),
--      copiando los encabezados del job de la Matriz que ya funciona.
-- Requisito: desplegar antes las funciones reporte-mantenimiento-mensual y
-- sol-recordatorios.
-- ══════════════════════════════════════════════════════════════════════════

-- 1) Bitácora ----------------------------------------------------------------
create table if not exists public.mantenimiento_reportes_log (
  id            uuid primary key default gen_random_uuid(),
  periodo       text not null,               -- AAAA-MM reportado
  colegio       text not null,
  folio         text,
  ok            boolean not null default true,
  prueba        boolean not null default false,
  avance_anual  integer,
  avance_mes    integer,
  para          text[],
  cc            text[],
  web_url       text,
  mensaje       text,
  created_at    timestamptz not null default now()
);
create index if not exists mantenimiento_reportes_log_periodo on public.mantenimiento_reportes_log (periodo, colegio);

alter table public.mantenimiento_reportes_log enable row level security;
drop policy if exists "mtto_log_admin_lee" on public.mantenimiento_reportes_log;
create policy "mtto_log_admin_lee" on public.mantenimiento_reportes_log
  for select to authenticated using (public.rcma_es_admin());
-- (solo la Edge Function escribe, con la llave de servicio)
revoke all on public.mantenimiento_reportes_log from anon;

-- 2) pg_cron -----------------------------------------------------------------
do $$
declare
  base text;
begin
  select command into base from cron.job where jobname = 'matriz-mensual-dia1-7am-mx';
  if base is null then
    raise exception 'No encontré el job matriz-mensual-dia1-7am-mx para copiar sus encabezados';
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname in ('reporte-mtto-mensual-dia1-8am-mx', 'sol-recordatorios-8-15am-mx');

  perform cron.schedule('reporte-mtto-mensual-dia1-8am-mx', '0 14 1 * *',
    replace(base, '/functions/v1/matriz-mensual', '/functions/v1/reporte-mantenimiento-mensual'));

  perform cron.schedule('sol-recordatorios-8-15am-mx', '15 14 * * 1-5',
    replace(base, '/functions/v1/matriz-mensual', '/functions/v1/sol-recordatorios'));
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- VALIDACIÓN — todas las filas deben decir true
-- ══════════════════════════════════════════════════════════════════════════
select 'tabla bitácora creada'          as revision, to_regclass('public.mantenimiento_reportes_log') is not null as ok
union all select 'bitácora con RLS',           (select relrowsecurity from pg_class where oid = 'public.mantenimiento_reportes_log'::regclass)
union all select 'job reporte mensual (día 1)', exists (select 1 from cron.job where jobname = 'reporte-mtto-mensual-dia1-8am-mx' and schedule = '0 14 1 * *' and command like '%reporte-mantenimiento-mensual%')
union all select 'job recordatorios SOL',       exists (select 1 from cron.job where jobname = 'sol-recordatorios-8-15am-mx' and schedule = '15 14 * * 1-5' and command like '%sol-recordatorios%')
union all select 'usan el secreto de la Matriz', (select bool_and(command like '%matriz_mensual_cron%') from cron.job where jobname in ('reporte-mtto-mensual-dia1-8am-mx', 'sol-recordatorios-8-15am-mx'));
