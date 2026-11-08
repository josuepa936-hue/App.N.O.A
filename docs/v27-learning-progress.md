# NOA v27.3A — Evolución descriptiva

## Arquitectura

`NOA_LEARNING_PROGRESS_V27.build(attempts, {catalog})` recibe datos explícitos y
no lee ni escribe almacenamiento. Usa normalizeHistory27.1 para deduplicar IDs y
resolver conflictos; proyecta con aggregateProjection27.2 (nuevo punto de entrada
puro que reutiliza exactamente la agregación existente). No reconstruye respuestas.
No modifica originales ni motores. Cada fila conserva identidad recibida, fecha
verificada, procedencia, cobertura de créditos y clasificación, resumen, razones
de exclusión y firma de condiciones registradas. Fechas faltantes, contradictorias
o inválidas no se sustituyen; se listan al final sin asignarles cronología.

`compare(before, after)` solo devuelve delta en puntos porcentuales si ambos son
completos/verificables, el resumen de puntuación coincide con los créditos, tienen ID y fechas distintas ascendentes, no son técnicos y
coinciden total y distribución de sección/materia/subtema/formato/dificultad
estimada/fuente y configuración temporal verificada. Un cambio de cantidad,
cobertura o límite temporal impide comparar globalmente.
La dificultad es estimada, no oficialmente calibrada. La falta de perfil de
entrenamiento o condiciones históricas no registradas se advierte; coincidencia
de condiciones registradas no es equivalencia psicométrica de los reactivos.

Las etiquetas mejora/retroceso/estabilidad son descriptivas, no pruebas de
aprendizaje. Sin dos candidatos con fechas distintas y condiciones coincidentes se informa
muestra insuficiente o condiciones incompatibles. Dos
intentos siguen siendo muestra limitada; no se calculan confianza estadística,
dominio alto, tendencias causales ni recomendaciones.

La UI dibuja barras nativas por fecha, sin unir ni suavizar muestras distintas,
lista cobertura/advertencias y permite seleccionar dos intentos. Los técnicos se
listan identificados pero se excluyen de gráfica y comparación. Los desconocidos
pueden mostrar cambios descriptivos, siempre sin evidencia verificada de dominio.
No se comparan porcentajes incompletos. No hay librerías nuevas ni persistencia
nueva; las vistas se derivan tras recargar/restaurar y funcionan offline (v6-81).

## Condiciones verificables y diagnóstico

Cada fila añade `conditions.timing` y `conditions.items` exclusivamente a la
proyección en memoria. No se guardan ni se migran los históricos. Los estados
son `known`, `absent`, `unknown`, `invalid` y `conflict`; los campos `sources` y
`evidence` conservan rutas como `attempts[1].answers[0].blueprintSlot.difficulty.level`.
Los diagnósticos solo copian valores primitivos; no comparten objetos de entrada.

La lectura de `timing` reconoce la configuración v26 con `version: 26` y
`durationMs` entero seguro entre 60000 y 86400000, los mismos límites que su
validador. Si se aportan `startedAt` y `deadlineAt`, ambos deben ser válidos y su
diferencia debe coincidir con el límite. El intervalo permitido participa en la
firma; el tiempo utilizado (`closedAt - startedAt`) y el motivo de cierre no
definen equivalencia. Dos límites de 60000 y 3600000 no son comparables.

Para expresar explícitamente un examen sin límite, esta capa de lectura admite
`timing: {mode: 'untimed'}` sin duración, inicio ni vencimiento. Es una declaración
de entrada documentada, no un campo que v26 guarde actualmente. No se sintetiza
para los históricos ni se añade al formato de respaldo; los respaldos siguen
validando el contrato persistido de v26. `timing` ausente o `null` significa configuración no
verificable, nunca cero minutos ni ausencia confirmada de límite. Los resultados
siguen visibles de forma descriptiva, pero no reciben un delta concluyente.
Las copias de un mismo intento se comprueban juntas para detectar límites o
modos contradictorios, conservando las rutas originales.

Para cada reactivo se inspeccionan todos los valores presentes de `difficulty`,
`blueprint.difficulty` y `blueprintSlot.difficulty.level`: deben ser enteros de
1 a 5 y coincidir. Se aplica lo mismo a `sourceType` y
`blueprintSlot.sourceType`, con los valores reales de v8: `official`, `extended`
y `course`. Ausencia de un campo opcional no genera conflicto si otro aporta
evidencia válida; un valor explícito desconocido, inválido o contradictorio
impide verificar esa condición. Se usa la fuente efectiva, no la solicitada:
un fallback de curso a oficial no es por sí mismo una contradicción.

Los porcentajes se formatean solo en presentación: `75%`, `62.5%` o
`No calculable`. No se redondean los créditos ni los datos de comparación.

## Procedencia actual y modificación mínima futura (no implementada)

`commitCompletedExam()` en index.html guarda id, score, total, pct, fecha,
difficultyStats, answers y, con v26, timing/finishReason. Actualmente NO declara
`evidenceKind: 'student'` para nuevos intentos. No se deduce procedencia a partir
de IDs, preguntas, ubicación en db o buenas puntuaciones de Judge.

Esta fase respeta student solo si todas las copias del mismo intento lo declaran.
Cualquier veto technicalTest/evidenceKind técnico, en intento o reactivo, prevalece
y excluye el intento de comparaciones/gráfica para evitar muestras mixtas. Los desconocidos no
aportan dominio; los históricos no se etiquetan ni se migran retrospectivamente.

Si se autoriza después, la modificación mínima sería declarar procedencia en la
creación de nuevos intentos, con contexto explícito de actividad del estudiante,
y marcar los flujos técnicos de prueba por separado. Requeriría un contrato de
origen y regresiones del guardado único/respaldos. Esta fase NO toca ese código,
no añade campos persistentes ni presupone esa autorización.

## Límites

La comparabilidad es deliberadamente estricta: muchos históricos no tendrán
metadatos suficientes. Se muestran con advertencias, sin inventar materia, fecha,
respuesta o perfil. La gráfica descriptiva puede mostrar exámenes completos de
condiciones distintas, como barras independientes; los selectores rechazan su
comparación. La cobertura de créditos y la clasificación se muestran por separado.
No sustituye una validación académica o científica de los contenidos generados.
