-- ============================================================================
-- Pendientes Plaud → NEXUS · Bitácora de grabaciones revisadas
-- Guarda qué grabaciones de Plaud ya se revisaron y qué pasó con cada una,
-- para no cargar dos veces los mismos pendientes ni duplicar los de una minuta.
-- Solo el administrador lee y escribe (igual que el resto del sistema).
-- ============================================================================
begin;

create table if not exists public.plaud_grabaciones (
  file_id        text primary key,                 -- id de Plaud (of_…)
  nombre         text not null,                    -- nombre de la grabación en Plaud
  fecha          date,                             -- fecha de la reunión
  estado         text not null check (estado in ('pendientes_cargados', 'tiene_minuta', 'sin_pendientes', 'descartada')),
  minuta_id      uuid references public.minutas(id) on delete set null,  -- si la reunión ya tiene minuta en el sistema
  pendientes     int  not null default 0,          -- cuántos pendientes se crearon en NEXUS
  notas          text,
  procesado_at   timestamptz not null default now(),
  procesado_por  text not null default 'rreyes@manoamiga.edu.mx'
);

alter table public.plaud_grabaciones enable row level security;
drop policy if exists plaud_admin on public.plaud_grabaciones;
create policy plaud_admin on public.plaud_grabaciones for all to authenticated
  using (public.rcma_es_admin()) with check (public.rcma_es_admin());

create index if not exists idx_nexus_pend_origen_plaud on public.nexus_pendientes (origen_url) where origen = 'plaud';

commit;

-- ── Validación ──────────────────────────────────────────────────────────────
select
  (select count(*) from information_schema.tables where table_name = 'plaud_grabaciones') as tabla_creada,      -- 1
  (select relrowsecurity from pg_class where relname = 'plaud_grabaciones')               as rls_activa,       -- true
  (select count(*) from pg_policies where tablename = 'plaud_grabaciones')               as reglas;            -- 1
