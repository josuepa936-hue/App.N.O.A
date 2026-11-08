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
estimada/fuente. Un cambio de cantidad o cobertura impide comparar globalmente.
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
nueva; las vistas se derivan tras recargar/restaurar y funcionan offline (v6-80).

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
