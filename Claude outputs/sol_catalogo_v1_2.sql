-- ============================================================================
-- PROGRAMA SOL · Depuración del catálogo (v1.2) + formatos versionados
-- 1. Catálogo SOL-F01: de 40 a 33 criterios (sin infraestructura), renumerado.
--    Los 7 que salen quedan INACTIVOS (números 101–107) para no perder historial.
-- 2. Área "Cuarto eléctrico y subestación" → "Cuartos técnicos" (catálogo y
--    datos guardados: respuestas, hallazgos, tarjetas, apoyos y llaves jsonb).
-- 3. Tabla sol_guardianes_renglones (9 renglones editables del SOL-F07).
-- 4. Tabla sol_formatos_versiones (historial de versiones publicadas).
-- Se puede correr una sola vez; todo va dentro de una transacción.
-- ============================================================================
begin;

-- ── 1. Catálogo SOL-F01 ─────────────────────────────────────────────────────
create temp table _mapa (viejo int, nuevo int, area text, tipo text, texto text, activo boolean) on commit drop;
insert into _mapa values
  ( 1,  1, 'Aulas', 'S', 'Salida y pasillos libres de obstáculos; la puerta abre sin obstrucción', true),
  ( 2,  2, 'Aulas', 'S', 'Sin extensiones improvisadas ni cables en el paso; daños reportados a Mantenimiento', true),
  ( 3,  3, 'Aulas', 'O', 'Mobiliario acomodado; nada fuera de lugar', true),
  ( 4,  4, 'Aulas', 'O', 'Material didáctico guardado y rotulado', true),
  ( 5,  5, 'Aulas', 'L', 'Piso, pizarrón, ventanas y mobiliario limpios; basura en su contenedor', true),
  ( 6,  6, 'Baños', 'S', 'Pisos secos; fugas reportadas a Mantenimiento', true),
  ( 8,  7, 'Baños', 'O', 'Insumos (papel, jabón) abastecidos y en su lugar', true),
  ( 9,  8, 'Baños', 'L', 'Sanitarios, lavabos y espejos limpios, sin malos olores', true),
  (10,  9, 'Baños', 'L', 'Bitácora de limpieza visible y al día', true),
  (11, 10, 'Cocina y cafetería', 'S', 'Extintor visible y sin obstrucciones; área de gas despejada', true),
  (12, 11, 'Cocina y cafetería', 'S', 'Químicos de limpieza separados de los alimentos', true),
  (13, 12, 'Cocina y cafetería', 'O', 'Utensilios y alimentos en su lugar, rotulados y con fecha', true),
  (14, 13, 'Cocina y cafetería', 'L', 'Superficies, campana y equipo limpios', true),
  (16, 14, 'Bodegas', 'S', 'Estibas estables, material pesado abajo; sin acceso de alumnos', true),
  (17, 15, 'Bodegas', 'S', 'Sustancias químicas rotuladas y con hoja de seguridad', true),
  (18, 16, 'Bodegas', 'O', 'Estantes rotulados; cada cosa en su lugar', true),
  (19, 17, 'Bodegas', 'O', 'Sin material obsoleto (tarjetas rojas atendidas)', true),
  (20, 18, 'Bodegas', 'L', 'Piso y estantes limpios, sin plagas', true),
  (22, 19, 'Cuartos técnicos', 'S', 'Acceso restringido; área despejada frente al tablero, sin materiales almacenados', true),
  (25, 20, 'Cuartos técnicos', 'L', 'Área limpia, sin polvo ni basura acumulada', true),
  (26, 21, 'Patios y rutas de evacuación', 'S', 'Rutas y salidas de emergencia libres de obstáculos', true),
  (29, 22, 'Patios y rutas de evacuación', 'O', 'Mobiliario exterior y equipo deportivo guardado', true),
  (30, 23, 'Patios y rutas de evacuación', 'L', 'Patios y áreas verdes limpios; basura en sus contenedores', true),
  (31, 24, 'Oficinas', 'S', 'Extintor visible y accesible, sin obstrucciones', true),
  (32, 25, 'Oficinas', 'S', 'Botiquín completo, localizable y con insumos vigentes', true),
  (33, 26, 'Oficinas', 'S', 'Cables ordenados, sin sobrecarga de contactos', true),
  (34, 27, 'Oficinas', 'O', 'Escritorios y archivos ordenados; documentos resguardados', true),
  (35, 28, 'Oficinas', 'L', 'Área limpia', true),
  (36, 29, 'Laboratorios y talleres', 'S', 'Equipo de protección disponible y en su lugar', true),
  (37, 30, 'Laboratorios y talleres', 'S', 'Reactivos y herramientas resguardados bajo llave', true),
  (38, 31, 'Laboratorios y talleres', 'O', 'Herramientas y material con lugar asignado y rotulado', true),
  (39, 32, 'Laboratorios y talleres', 'O', 'Reglamento del laboratorio o taller visible', true),
  (40, 33, 'Laboratorios y talleres', 'L', 'Mesas, tarjas y equipo limpios', true),
  -- Salen por ser infraestructura (quedan inactivos con su texto original)
  ( 7, 101, 'Baños', 'S', null, false),
  (15, 102, 'Cocina y cafetería', 'L', null, false),
  (21, 103, 'Cuartos técnicos', 'S', null, false),
  (23, 104, 'Cuartos técnicos', 'S', null, false),
  (24, 105, 'Cuartos técnicos', 'O', null, false),
  (27, 106, 'Patios y rutas de evacuación', 'S', null, false),
  (28, 107, 'Patios y rutas de evacuación', 'S', null, false);

-- Candado: el catálogo debe estar como en la consulta del 28-oct (40 criterios, 1–40)
do $$
begin
  if (select count(*) from sol_criterios where numero between 1 and 40) <> 40
     or exists (select 1 from sol_criterios where numero > 40) then
    raise exception 'El catálogo no está en su estado original (40 criterios del 1 al 40). No se aplicó nada.';
  end if;
end $$;

-- Dos pasos para no chocar con números repetidos
update sol_criterios set numero = numero + 1000 where numero between 1 and 40;
update sol_criterios c set
  numero = m.nuevo,
  area   = m.area,
  tipo   = m.tipo,
  texto  = coalesce(m.texto, c.texto),
  activo = m.activo
from _mapa m
where c.numero = m.viejo + 1000;

-- ── 2. Renombrar el área en los datos ya guardados ──────────────────────────
update sol_respuestas      set area = 'Cuartos técnicos' where area = 'Cuarto eléctrico y subestación';
update sol_hallazgos       set area = 'Cuartos técnicos' where area = 'Cuarto eléctrico y subestación';
update sol_tarjetas_rojas  set area = 'Cuartos técnicos' where area = 'Cuarto eléctrico y subestación';
update sol_apoyos          set area = 'Cuartos técnicos' where area = 'Cuarto eléctrico y subestación';

update sol_inspecciones set por_area = (por_area - 'Cuarto eléctrico y subestación')
  || jsonb_build_object('Cuartos técnicos', por_area -> 'Cuarto eléctrico y subestación')
where por_area ? 'Cuarto eléctrico y subestación';
update sol_inspecciones set duenos = (duenos - 'Cuarto eléctrico y subestación')
  || jsonb_build_object('Cuartos técnicos', duenos -> 'Cuarto eléctrico y subestación')
where duenos ? 'Cuarto eléctrico y subestación';
update sol_comites set duenos = (duenos - 'Cuarto eléctrico y subestación')
  || jsonb_build_object('Cuartos técnicos', duenos -> 'Cuarto eléctrico y subestación')
where duenos ? 'Cuarto eléctrico y subestación';

-- ── 3. Renglones de la Bitácora del Guardián (SOL-F07) ──────────────────────
create table if not exists sol_guardianes_renglones (
  id         uuid primary key default gen_random_uuid(),
  orden      int  not null,
  tipo       text not null check (tipo in ('S','O','L')),
  texto      text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table sol_guardianes_renglones enable row level security;
drop policy if exists sol_gr_select on sol_guardianes_renglones;
drop policy if exists sol_gr_write  on sol_guardianes_renglones;
create policy sol_gr_select on sol_guardianes_renglones for select to authenticated using (true);
create policy sol_gr_write  on sol_guardianes_renglones for all to authenticated
  using      (lower(auth.jwt() ->> 'email') = 'rreyes@manoamiga.edu.mx')
  with check (lower(auth.jwt() ->> 'email') = 'rreyes@manoamiga.edu.mx');

insert into sol_guardianes_renglones (orden, tipo, texto)
select * from (values
  (1, 'S', 'La puerta y el pasillo del salón están libres: no hay nada tirado.'),
  (2, 'S', 'Las mochilas están en su lugar y no estorban el paso.'),
  (3, 'S', 'No hay cables sueltos ni contactos rotos (si los hay, avisamos).'),
  (4, 'O', 'Cada material está en su lugar: libros, colores, juegos.'),
  (5, 'O', 'Las bancas y sillas quedaron acomodadas.'),
  (6, 'O', 'Al terminar la clase guardamos lo que usamos.'),
  (7, 'L', 'El piso está limpio, sin basura.'),
  (8, 'L', 'Las mesas y el pizarrón quedaron limpios.'),
  (9, 'L', 'La basura está en el bote correcto.')
) v(orden, tipo, texto)
where not exists (select 1 from sol_guardianes_renglones);

-- ── 4. Historial de versiones de los formatos ───────────────────────────────
create table if not exists sol_formatos_versiones (
  id             uuid primary key default gen_random_uuid(),
  formato        text not null check (formato in ('SOL-F01','GUARDIANES','SOL-V03')),
  version        text not null,
  vigente_desde  date not null default current_date,
  contenido      jsonb,            -- copia de los criterios / renglones de esa versión
  archivo_url    text,             -- liga de OneDrive
  archivo_nombre text,
  notas          text,
  publicado_por  text,
  created_at     timestamptz not null default now(),
  unique (formato, version)
);
alter table sol_formatos_versiones enable row level security;
drop policy if exists sol_fv_select on sol_formatos_versiones;
drop policy if exists sol_fv_write  on sol_formatos_versiones;
create policy sol_fv_select on sol_formatos_versiones for select to authenticated using (true);
create policy sol_fv_write  on sol_formatos_versiones for all to authenticated
  using      (lower(auth.jwt() ->> 'email') = 'rreyes@manoamiga.edu.mx')
  with check (lower(auth.jwt() ->> 'email') = 'rreyes@manoamiga.edu.mx');

-- Versiones que ya circularon (sin archivo). La 1.2 del SOL-F01 y la 1.1 de
-- Guardianes y Voluntariado se publican desde el sistema (Catálogo SOL).
insert into sol_formatos_versiones (formato, version, vigente_desde, notas, publicado_por) values
  ('SOL-F01',    '1.0', '2026-09-01', 'Formato original (40 criterios)', 'rreyes@manoamiga.edu.mx'),
  ('SOL-F01',    '1.1', '2026-09-24', 'Formato protegido para el importador (40 criterios)', 'rreyes@manoamiga.edu.mx'),
  ('GUARDIANES', '1.0', '2026-09-24', 'SOL-F07, F08 y F09 originales', 'rreyes@manoamiga.edu.mx'),
  ('SOL-V03',    '1.0', '2026-10-13', 'Registro de jornada de voluntariado original', 'rreyes@manoamiga.edu.mx')
on conflict (formato, version) do nothing;

commit;

-- ── Validación ──────────────────────────────────────────────────────────────
select
  (select count(*) from sol_criterios where activo)                                   as criterios_activos,      -- 33
  (select count(*) from sol_criterios where not activo)                               as criterios_inactivos,    -- 7
  (select string_agg(distinct area, ', ') from sol_criterios where activo)            as areas_activas,
  (select count(*) from sol_criterios where area ilike 'Cuarto eléctrico%')           as quedan_cuarto_electrico, -- 0
  (select count(*) from sol_respuestas where area ilike 'Cuarto eléctrico%')          as respuestas_sin_migrar,   -- 0
  (select count(*) from sol_guardianes_renglones where activo)                        as renglones_guardianes,    -- 9
  (select string_agg(formato || ' ' || version, ' · ' order by formato, version) from sol_formatos_versiones) as versiones,
  (select coalesce(bool_or(prosrc ilike '%Cuarto el%'), false) from pg_proc where proname = 'sol_resumen_campus') as rpc_menciona_area_vieja; -- debe ser false
