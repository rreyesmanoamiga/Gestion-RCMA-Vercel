# Referencia: Pendientes Plaud → NEXUS

Base de datos: Supabase, proyecto **Gestion-RCMA** (ref `wwghvummkxekrenfgzsd`). Usuario: `rreyes@manoamiga.edu.mx` (Ricardo Reyes Medina).

## 1. Plaud (conector)

- `list_files` con `date_from` / `date_to` (YYYY-MM-DD). El nombre suele empezar con la fecha: "10-27 Reunión: …".
- `get_note` → resumen de Plaud con los pendientes / action items. Es la fuente principal.
- `get_transcript` → solo si hace falta confirmar quién dijo qué o una fecha.

## 2. Bitácora de grabaciones — `plaud_grabaciones`

| Campo | Uso |
|---|---|
| `file_id` | id de Plaud (`of_…`), llave única |
| `nombre` | nombre de la grabación |
| `fecha` | fecha de la reunión |
| `estado` | `pendientes_cargados` · `tiene_minuta` · `sin_pendientes` · `descartada` |
| `minuta_id` | id de la minuta si la reunión ya la tiene |
| `pendientes` | cuántos se crearon en NEXUS |
| `notas` | comentario libre |

Toda grabación revisada se registra aquí, aunque no se cree ningún pendiente. Una grabación que ya está en la tabla no se vuelve a proponer.

## 3. ¿Ya tiene minuta? — `minutas` (solo lectura)

Columnas útiles: `id, fecha, asunto, tema, colegio, proyecto_nombre, tipo, modulo`.
Busca minutas con `fecha` igual o ±2 días a la de la grabación y asunto/tema parecido. Si hay coincidencia, la grabación entra por la minuta, no por Plaud.

## 4. Pendientes — `nexus_pendientes`

Al crear un pendiente desde Plaud:

| Campo | Valor |
|---|---|
| `titulo` | corto y accionable ("Enviar cotización de … a MA QRO") |
| `descripcion` | contexto de la reunión en 1–3 líneas |
| `tipo` | `'personal'` |
| `asignado_a` / `asignado_nombre` | `'rreyes@manoamiga.edu.mx'` / `'Ricardo Reyes Medina'` (salvo que Ricardo diga otro) |
| `created_by` | `'rreyes@manoamiga.edu.mx'` |
| `prioridad` | `'baja'` · `'normal'` · `'alta'` · `'urgente'` |
| `fecha_limite` / `hora_limite` | solo si Ricardo la confirma (`date` / `time`) |
| `estatus` | `'pendiente'` |
| `colegio` / `territorio` | código y territorio del Directorio (ej. `'MA SCA'` / `'NORTE'`); para temas generales `'GENERAL'` / `'FMA'` |
| `proyecto_id` / `proyecto_nombre` | si el pendiente es de un proyecto existente (tabla `projects`: `id, name, colegio, status`) |
| `origen` | `'plaud'` |
| `origen_asunto` | nombre de la grabación |
| `origen_fecha` | fecha de la grabación |
| `origen_url` | `'plaud:' || file_id` (sirve para saber de qué grabación salió) |
| `presentar_semanal` | `false`, salvo que Ricardo diga que va a la junta del miércoles |

No llenar `acuerdo_id` ni `minuta_id`: son solo para acuerdos de minutas.

**Calendario:** el sistema crea solo el evento "Vence: …" en Outlook cuando el pendiente es de Ricardo y tiene `fecha_limite`. Con `hora_limite`, el aviso es 30 min antes; sin hora, el evento es a las 9:00 con aviso 3 días antes. Sin fecha límite no va al calendario.

## 5. Revisar repetidos

Pendientes abiertos: `nexus_pendientes` con `estatus <> 'completado'`. Compara el título y la descripción del pendiente propuesto con los abiertos (mismo colegio o proyecto, palabras clave en común). Si se parece, márcalo como "posible repetido" y di con cuál.

## 6. Colegios (tabla `directorio`)

`codigo, nombre, territorio`. Usa siempre el código corto (`MA MTY`) en `colegio` y el territorio tal como está en la tabla (`NORTE` o `MEXICO`, sin acento).
NORTE: Aguascalientes, Guadalajara, La Cima, León, Monterrey, Piedras Negras, Santa Catarina, Tijuana, Torreón, Villas de San Juan.
MÉXICO: Acapulco, Cancún, Chalco, Conkal, Lerma, Morelia, Puebla, Querétaro, Tapachula, Zomeyucán.
