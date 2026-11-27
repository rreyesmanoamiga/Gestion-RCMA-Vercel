-- ══════════════════════════════════════════════════════════════════════════
-- Contactos externos de Minutas de Obras: equipo ECO tomado del Directorio
-- (directorio_contactos, entidad ECO, activos y con correo).
--   · Van en CC y sin marcar por defecto (igual que los 3 que ya existen).
--   · No duplica: si el correo ya está en la lista, lo deja como está.
--   · María Cristina De León Castañón no se agrega: no tiene correo en el Directorio.
-- ══════════════════════════════════════════════════════════════════════════
insert into public.contactos_notificacion (nombre, correo, organizacion, puesto, modulo, va_en, marcado_default, activo, orden)
select v.nombre, v.correo, 'ECO', v.puesto, 'minutas_obras', 'cc', false, true, v.orden
from (values
  ('Arq. David Maciel Martínez',           'dmaciel@ecodg.net',     'Gerente de Proyectos',         4),
  ('Arq. Ileana Gámez Monsivais',          'igamez@ecodg.net',      'Gerente',                      5),
  ('Arq. José Antonio Ugarte Sila',        'jaugarte@ecodg.net',    'Gerente',                      6),
  ('Arq. Sergio Benjamin Garavito',        'bgaravito@icred.org',   'Gerente',                      7),
  ('Arq. María de Jesús Silva Campos',     'mjsilva@ecodg.net',     'Coordinadora de Proyecto',     8),
  ('Ing. Felipe de Jesús García Sánchez',  'fgarcia@ecodg.net',     'Coordinador de Instalaciones', 9),
  ('Ing. Víctor Rogelio Aguilera Ortiz',   'vaguilera@ecodg.net',   'Coordinador de Instalaciones', 10),
  ('Arq. Adrian Rodriguez López',          'earodriguez@ecodg.net', 'Líder de Proyecto',            11),
  ('Arq. Armando Naranjo',                 'anaranjo@ecodg.net',    'Líder de Proyecto',            12),
  ('Arq. Harold Fabricio Especiano',       'hespeciano@ecodg.net',  'Líder de Proyecto',            13),
  ('Arq. Juan Antonio Montoya',            'jmontoya@ecodg.net',    'Líder de Proyecto',            14),
  ('Ing. Héctor Martín Rodríguez Herrera', 'hrodriguez@ecodg.net',  'Líder de Proyecto',            15),
  ('Ing. Jorge Hernández Azua',            'jhernandez@ecodg.net',  'Líder de Proyecto',            16),
  ('Ing. Pablo Adrián Navarro Amezcua',    'panavarro@ecodg.net',   'Líder de Proyecto',            17),
  ('Arq. Sherly Orozco Loza',              'sorozco@ecodg.net',     'Supervisión de Obra',          18),
  ('Sergio Obed Martínez Hernández',       'smartinez@ecodg.net',   'Supervisión de Obra',          19)
) as v(nombre, correo, puesto, orden)
where not exists (
  select 1 from public.contactos_notificacion c
  where c.modulo = 'minutas_obras' and lower(c.correo) = lower(v.correo)
);

-- ══════════════════════════════════════════════════════════════════════════
-- VALIDACIÓN — todas las filas deben decir true
-- ══════════════════════════════════════════════════════════════════════════
select 'contactos ECO en Minutas de Obras (19)' as revision,
       (select count(*) from public.contactos_notificacion where modulo = 'minutas_obras' and organizacion = 'ECO') = 19 as ok
union all select 'sin correos duplicados',
       (select count(*) = count(distinct lower(correo)) from public.contactos_notificacion where modulo = 'minutas_obras')
union all select 'todos en CC y sin marcar por defecto',
       not exists (select 1 from public.contactos_notificacion where modulo = 'minutas_obras' and organizacion = 'ECO' and (va_en <> 'cc' or marcado_default))
union all select 'los 3 anteriores siguen igual',
       (select count(*) from public.contactos_notificacion where modulo = 'minutas_obras' and correo in ('atirado@ecodg.net','rhernandez@ecodg.net','jbonilla@ecodg.net')) = 3;
