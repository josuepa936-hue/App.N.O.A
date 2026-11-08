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
trata sus intentos como actividad del estudiante, respetando los vetos técnicos
explícitos de27.1. Fixtures antiguos sin marcar no se pueden detectar automáticamente.
No se muestran niveles de dominio ni tendencias con muestras insuficientes.

La presentación utiliza tarjetas, progress y details nativos. Amplía el resultado
actual y permite consultar individualmente los cinco intentos que ya muestra el
historial. No compara intentos. Conserva las tarjetas de v23, Judge y Blueprint.
No llama a save(), no escribe en almacenamiento y no cambia scoring o Calibrator.
Las vistas repetidas reemplazan su propio panel sin acumular estadísticas.
Los datos siguen persistiendo por las rutas existentes; la nueva vista se deriva
tras recarga o restauración. Ambos módulos se incluyen offline en caché v6-78,
con el aislamiento por ámbito existente. No hay dependencias nuevas.
