# Física de bachillerato y perfiles de preparación

El complemento `NOA_EXCOBA_PREPARATION` añade ocho subtemas de Física con códigos
3.3.1.1–3.3.1.4 y 3.3.2.1–3.3.2.4. Son independientes de Ciencias naturales de
secundaria y de Matemáticas para Estadística (3.1.). No se sustituyen las nueve
materias originales ni el catálogo persistido del Temario Maestro.

## Procedencia

Referencia temática alternativa: sección 3.3 del Instructivo EXCOBA UAQ
Licenciatura 2027-1:
https://dsa.uaq.mx/docs/ingreso_licenciatura/2027-1/Instructivo_EXCOBA_UAQ-Licenciatura.pdf

El contenido se incorporó desde la transcripción proporcionada por el usuario.
El entorno no pudo descargar el PDF (403); no se verificaron sus páginas ni la
correspondencia de esta composición con Medicina UAQ. Por eso `page` es null,
`acquisition` es `user-transcription` y `confirmedForMedicine` es false.
No son preguntas científicamente verificadas ni frecuencias oficiales.

## Composición

- A: Biología, Química y Matemáticas para Estadística (valor inicial).
- B: Biología, Química y Física (alternativa no confirmada para Medicina UAQ).

Cada perfil conserva seis materias de educación básica y tres de especialidad.
El plan moderno tiene cinco slots por materia: 10/20/15, total 45. El banco local
completo requiere veinte reactivos únicos por materia: 40/80/60, total 180.
Seleccionar B no permite completar bancos insuficientes con Estadística.
La selección se aplica a nuevos simulacros y no cambia exámenes recuperados.
No se persiste una preferencia nueva: al abrir de nuevo se ofrece A.

## Integración

Las diez materias quedan disponibles en el entrenamiento inteligente de 5/10.
Física utiliza el Blueprint, formatos compatibles, dificultad, Judge y memoria
existentes. Su fuente alternativa se identifica mediante el tipo extendido
existente; un material de curso realmente disponible conserva su procedencia.
No se añaden preguntas al banco automáticamente. Los ocho temas se activan
expresamente desde Biblioteca o al iniciar un lote válido de Física.
La práctica local parcial utiliza las preguntas válidas disponibles y anuncia
la cantidad real. La generación requiere el servicio de IA configurado.

El adaptador académico suministra Física al normalizador y a las estadísticas,
evolución y recomendaciones existentes sin cambiar sus algoritmos ni el esquema
de almacenamiento. Las marcas técnicas y desconocidas mantienen sus vetos.
El Service Worker incorpora el módulo en la caché aislada v6-95.

Las pruebas usan respuestas sintéticas y no certifican funcionamiento del
servicio real de IA ni exactitud científica de futuras preguntas.

## Archivos de esta integración

Producción:

- `excoba_patch_preparation_physics.js`
- `excoba_patch_v11_drag_classify.js`
- `excoba_patch_v13_mixed_exam.js`
- `excoba_patch_v14_inline_select.js`
- `excoba_patch_v17_drag_order.js`
- `excoba_patch_v24_generator_ui.js`
- `excoba_patch_v25_exam_plan.js`
- `excoba_patch_v25_exam_ui.js`
- `excoba_patch_v25_multibatch.js`
- `excoba_patch_v27_academic_results.js`
- `excoba_patch_v8_blueprint.js`
- `excoba_patch_v9_generator.js`
- `index.html`
- `sw.js`

Pruebas y fixtures:

- `tests/exam-45-ui.spec.cjs`
- `tests/exam-multibatch-fixtures.cjs`
- `tests/exam-multibatch.spec.cjs`
- `tests/exam-plan.spec.cjs`
- `tests/generator-ui.spec.cjs`
- `tests/physics-compatibility.spec.cjs`
- `tests/physics-preparation.spec.cjs`
- `tests/question-diversity-integration.spec.cjs`
- `tests/question-memory-integration.spec.cjs`
- `tests/question-memory.spec.cjs`
- `tests/results-normalization.spec.cjs`
- `tests/timed-exam.spec.cjs`
- `tests/topic-diversity.spec.cjs`

Los cambios de varias suites antiguas solo actualizan la versión esperada de
caché. El fixture multibatch permite elegir A/B; los rechazos y las respuestas
sintéticas conservan el comportamiento anterior por defecto. No se añaden
dependencias ni preguntas al código de producción.

## Validación ejecutada en Chromium

Dos baterías dirigidas finales: **514 pruebas distintas aprobadas, 0 fallidas,
0 omitidas**. No se ejecutó la suite completa ni IA real. Contextos de navegador
con almacenamiento aislado y respuestas sintéticas de Generator/Batch.

| Suite | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| `academic-results.spec.cjs` | 22 | 0 | 0 |
| `backup-checkpoint-atomicity.spec.cjs` | 26 | 0 | 0 |
| `exam-45-ui.spec.cjs` | 22 | 0 | 0 |
| `exam-multibatch.spec.cjs` | 25 | 0 | 0 |
| `exam-plan.spec.cjs` | 14 | 0 | 0 |
| `generator-ui.spec.cjs` | 21 | 0 | 0 |
| `physics-preparation.spec.cjs` | 18 | 0 | 0 |
| `question-memory-generations.spec.cjs` | 20 | 0 | 0 |
| `study-recommendations.spec.cjs` | 51 | 0 | 0 |
| `timed-exam.spec.cjs` | 39 | 0 | 0 |
| `learning-progress.spec.cjs` | 61 | 0 | 0 |
| `physics-compatibility.spec.cjs` | 3 | 0 | 0 |
| `prepilot-start-contract.spec.cjs` | 71 | 0 | 0 |
| `results-normalization.spec.cjs` | 43 | 0 | 0 |
| `study-provenance.spec.cjs` | 55 | 0 | 0 |
| `study-recommendations-ui.spec.cjs` | 23 | 0 | 0 |

Las baterías finales incluyen 21 pruebas nuevas de Física. Comprueban ocho
códigos, referencia alternativa, las dos composiciones de 45/180, dificultad y
reposición, generación sintética de 5/10/45, bancos incompletos, práctica local
parcial, contadores separados de Estadística, recuperación y respaldo,
clasificación y recomendaciones, activación idempotente, caché real v6-95 y
recarga offline. Las vistas de 320, 390 y 1365 px no desbordan; se generaron
capturas locales de las tres.

La línea base dirigida pasó 3 pruebas antes de modificar producción. Las
primeras ejecuciones de la suite nueva dieron 8/18 y 17/18: se corrigió el montaje
prematuro de los controles, y los tests se ajustaron para avanzar el reloj de
revisión, comprobar atributos de opciones e invocar el handler público cuando
el editor modal permanece abierto. Estas ejecuciones y la línea base no se
suman a las 514 finales. No se ocultaron fallos ni se desactivaron pruebas.

También pasaron la comprobación de sintaxis de los scripts modificados,
el JavaScript inline de index.html y `git diff --check`.
No se afirma funcionamiento del servicio real de generación de IA.
