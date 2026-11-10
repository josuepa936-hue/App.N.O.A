# PR #24 — Tres correcciones de auditoría

Base de esta actualización: f57224e, misma rama feature/noa-v274-prepilot-critical.
No se cambia main, motores v26/v27, Judge, scoring ni fórmulas de Calibrator.

## Inicialización de indicadores

La primera llamada a renderAll precedía la carga del normalizador. Al recargar
con Temario completo no se producía necesariamente otro render del Dashboard.
Ahora renderLegacyAcademicIndicators reúne Dashboard, Materias y contadores de
presentación; renderAll lo reutiliza. Una llamada explícita tras los scripts y en
DOMContentLoaded actualiza esas vistas sin save, sin renderExam y sin reiniciar
la sesión. No hay polling ni temporizador de recálculo. Falta de referencia al
normalizador se muestra como No disponible; ausencia de evidencia como Sin datos.

Las pruebas comprueban 75% para 1.5 créditos sobre dos respuestas admisibles y una
omisión después de una carga fría, sin interacción ni escrituras adicionales.
También comprueban técnicos, unknown, vacío y publicación tardía del catálogo.
La simulación de normalizador ausente retira temporalmente su referencia en
bootstrap; no afirma funcionamiento completo de todos los motores si no se
puede descargar ese script requerido. La clasificación de topicId conocida de
estos indicadores es provisional; no se inventan códigos del Temario.

## Entradas de 180

La validación estructural/textual anterior se reutiliza en
uniqueLocalExcobaQuestions y validateLocalExcobaQueue: no se cambian sus reglas.
Los veinte reactivos por cada materia implican 40/80/60, no frecuencias oficiales
de formatos. No se rellenan cupos ni se llama IA para completar el banco.

| Entrada | Protección |
|---|---|
| Botón manual / startExam | Solicitud genérica >=180 se rechaza y dirige al entrenamiento específico antes de cambiar sesión |
| Botones locales / startExcobaExam | Banco único, total y cuotas exactos antes de beginExamQueue |
| startExamForTarget | >=180 se rechaza antes de cargar/generar banco parcial |
| smartStartExamForTarget | >=180 se rechaza antes de cambiar vista, llamar IA o guardar preguntas |
| beginExamQueue | Toda cola >=180 debe ser exactamente180 y superar la validación específica; recuperación válida de180 sigue disponible |
| sampleBalanced/selectQuestionsForSubject | No inician sesiones; un resultado de180 también debe pasar el control final |
| Comandos de index, wrapper v3 y wrapper del Temario Maestro | Comparten handleExcobaTrainingCommand antes de las ramas antiguas |
| Cuestionarios heredados por materia | Selector propio ofrece5/10/15/20. En Comandos v3 ya no captura dos dígitos ni trunca cantidades superiores a30 |
| v24/v25 modernos | APIs sin cambios; tamaños5/10 y45, respectivamente; no se reinterpreta v25 como validador de180 |

La guarda final valida cualquier cola completa independientemente de su etiqueta,
no infiere procedencia de nombres. No elimina rutas parciales ni datos antiguos.
Las entradas genéricas no se usan para iniciar180 aunque el banco sea completo:
el usuario recibe orientación explícita a la modalidad dedicada.

## Cantidades de Comandos

El parser común obtiene la cantidad explícita antes de elegir modalidad. EXCOBA
45 y180 usan sus rutas locales validadas; sin cantidad usa45, como antes. Las
cantidades parciales admitidas son5/10/15/20, con cantidad exacta y etiqueta de
entrenamiento parcial. Otras cantidades se rechazan mostrando las opciones.
Los rechazos ocurren antes del log/save del parser antiguo y no consumen la
procedencia. La ruta parcial no añade plantillas ni genera reactivos faltantes.

Se cubren frases de práctica, inicio y formas nominales ya interceptadas por el
Temario, con bancos suficientes e insuficientes. El wrapper v3 delega EXCOBA al
parser común y, para otras órdenes por materia, lee todos los dígitos y rechaza
cantidades que exceden su límite en lugar de convertir180 en18. El wrapper del
Temario también delega antes de su antiguo límite60. No cambia el generador ni
se validan servicios IA reales con estas pruebas.

## Verificación y límites

Nueva suite tests/prepilot-entrypoints.spec.cjs. Aislamiento de contexto, reloj
controlado, banco sintético y red local. Captura Dashboard después de recargar.
Pruebas de conservación incluyen cola, índice, respuestas, score, cronómetro,
DB, almacenamiento y declaración ante rechazo. Se conserva recuperación de180
válidos y se prueban guardas intermedias además de botones y comandos.

SW v6-89 entrega index, wrapper v3 y wrapper del Temario actualizados, conservando
ASSETS y el aislamiento por scope. Sin dependencias nuevas ni cambios de esquema.

El desbordamiento preexistente de #noaExamEvidenceKind a320px sigue documentado en
v274-prepilot-critical.md. No se cambia el control ni se elimina o deshabilita la
prueba correspondiente de exam-45-ui.spec.cjs. No se declara aptitud para piloto.
