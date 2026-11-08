# NOA v27.2 — Resultados por materia y subtema

`NOA_ACADEMIC_STATS_V27.aggregate(attempt, options)` es una función pura que recibe
registros originales y las opciones del normalizador27.1 (catálogo explícito y
procedencia). Devuelve `stats`, `sections` con materias y subtemas anidados,
`issues`, `declaredTotal` y `complete`. No lee estado global ni almacena resultados.
El normalizador existente sigue resolviendo identidades, conflictos y metadatos.

Las unidades son reactivos y créditos máximos de1. Crédito parcial se conserva
exactamente; los valores de la interfaz se redondean solo para presentación.
El porcentaje global requiere un total declarado coherente; es créditos / máximos y solo se calcula cuando todos los créditos
son verificables. Si hay desconocidos se muestra «No calculable», el crédito
conocido y su cobertura; no se imputa cero a resultados desconocidos. Los huecos
entre total declarado y respuestas disponibles quedan Sin clasificar/desconocidos.
`verifiedMaxCredit` permite conocer cuántos créditos máximos son verificables.
Los indicadores de estado y la marca no verificable pueden solaparse: una respuesta
sin identidad conserva el estado recibido, pero no aporta crédito verificable.

Cada reactivo pasa por una única sección/materia/subtema; los códigos múltiples
sin asignación única van a Sin clasificar. No se inventan materias ni se deduce
clasificación por texto. Se muestran grupos observados; una materia ausente no se
presenta como rendimiento cero. Se reutilizan las nueve materias del catálogo,
sin cambiar distribución de45 ni añadir frecuencias oficiales.

`domain` cuenta únicamente resultados verificables y habilitados como evidencia
por27.1; excluye omisiones y datos técnicos marcados. El panel de la aplicación
solo habilita evidencia de estudiante cuando el intento declara explícitamente
`evidenceKind: 'student'`. Respeta los vetos técnicos de27.1; los intentos sin
declaración permanecen con procedencia desconocida. Fixtures antiguos sin marcar no se pueden detectar automáticamente.
No se muestran niveles de dominio ni tendencias con muestras insuficientes.

La presentación utiliza tarjetas, progress y details nativos. Amplía el resultado
actual y permite consultar individualmente los cinco intentos que ya muestra el
historial. No compara intentos. Conserva las tarjetas de v23, Judge y Blueprint.
No llama a save(), no escribe en almacenamiento y no cambia scoring o Calibrator.
Las vistas repetidas reemplazan su propio panel sin acumular estadísticas.
Los datos siguen persistiendo por las rutas existentes; la nueva vista se deriva
tras recarga o restauración. Ambos módulos se incluyen offline en caché v6-79,
con el aislamiento por ámbito existente. No hay dependencias nuevas.


## Correcciones de catálogo y procedencia del PR19

La inicialización única ocurre después de los listeners de DOMContentLoaded de
v4/v5. Los wrappers anteriores siguen mostrando las tarjetas existentes durante
la carga, sin un panel académico temporalmente mal clasificado. `refresh()` permite
actualizar vistas explícitamente; no hay polling, reparaciones ni escrituras.

`catalog()` contrasta identidad, tamaño, unicidad de códigos y correspondencia de
materia/título/foco del persistido con `NOA_EXCOBA_FIX_V5.items`. Siempre entrega
valores canónicos; informa `verified-persisted`, `verified-static` o `unavailable`.
Si faltan las fuentes verificables devuelve catálogo vacío y conserva Sin clasificar.
No llama a getters que reparen datos ni a repair()/save().

La vista inmediata usa el ID temporal de v26 para localizar el intento guardado,
o la promesa ya existente en `noaCompletedExamCommits`, ligada por identidad al
array de respuestas. No busca por nombres, patrones de IDs o puntuación. La espera
no vuelve a ejecutar el commit. Las continuaciones comprueban identidad de base,
cola, respuestas y render para no aplicar un intento viejo a una sesión nueva.
Sin contexto verificable, la vista conserva puntuación de examen y procedencia
unknown; no se habilita dominio automáticamente. El historial usa el mismo resolver
de procedencia. No se cambian registros históricos para añadir etiquetas.
