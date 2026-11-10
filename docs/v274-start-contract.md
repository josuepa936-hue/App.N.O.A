# PR #24 — Cantidad contextual y contrato de inicio

Actualización sobre 13b260d, misma rama y PR. No cambia los motores v26/v27,
Judge, scoring, Calibrator, recomendaciones ni el esquema persistente.

## Causas

El parser anterior elegía el primer número, independientemente de su función.
La guarda de beginExamQueue miraba solo la longitud recibida: una cola178 podía
aceptarse con una etiqueta libre que anunciaba un completo180.

## Cantidades

parseExcobaTrainingCount es una extracción determinista y sin efectos secundarios.
Prioriza número seguido de preguntas/reactivos y las formas inversas preguntas:
180 o reactivos de180. Varias cantidades explícitas distintas se rechazan; repetir
la misma cifra con ambas unidades no es una contradicción.

Se separan sesión, intento, año, fecha, tema/subtema, capítulo, grupo, nivel y
versión de la cantidad de reactivos. Fechas y versiones conservan puntuación para
no transformarlas en cantidades. Un año sin marcar se puede ignorar cuando existe
una cantidad explícita de reactivos; sin esa cantidad se pide aclaración en lugar
de asumir45. Un año marcado como tal no constituye una cantidad solicitada.

Abreviaturas como EXCOBA180 solo se admiten con una única cifra inequívoca junto
al nombre de la modalidad/acción. Identificadores H5, cantidades malformadas y
números restantes sin contexto suficiente provocan aclaración. No hay un sistema
nuevo de lenguaje natural: expresiones no reconocidas se rechazan de forma segura.
Una orden que mezcla intención de examen EXCOBA con guía, tarjetas o temario pide
aclaración para impedir que caiga en generadores heredados con truncamientos.
La ruta base sin materia canónica también valida la cantidad antes de registrar
actividad o guardar; no depende de que un wrapper reconozca la materia.

Modos EXCOBA permitidos:5/10/15/20/45/180. El predeterminado45 solo se aplica si
no hay cantidad ni ambigüedad relevante. v3 reutiliza la extracción para órdenes
por materia, conservando su predeterminado10 y rechazando cantidades que exceden
su ruta parcial; nunca trunca180 en18. Los wrappers existentes del Temario y v3
siguen delegando al mismo parser común. No se hacen llamadas IA en las pruebas.

## Contrato mínimo versión1

```js
beginExamQueue(queue, legacyLabel, {
  version: 1,
  mode: 'excoba-local', // 'manual' o 'legacy-partial' para parciales
  requestedCount: 180,
  completion: 'complete' // 'partial' para las otras rutas
});
```

resolveExamStart devuelve valid/message o valid/label/contract. El resultado
contract contiene version, mode, requestedCount, availableCount y completion;
availableCount se calcula desde la cola, no se confía en una cifra del llamador.
No comparte referencias mutables con el contrato de entrada. La validación no
muta la cola ni sus preguntas; el resultado de metadatos está congelado.

Completos: solo excoba-local45 o180. Exigen cantidad exacta, IDs y contenido
únicos, validez estructural y cinco o veinte por cada materia canónica. El180
mantiene40/80/60 y no se valida usando v25. allowShortfall no relaja un completo.
La etiqueta final se genera desde la modalidad y total validados, e informa que
el banco local no tiene equivalencia oficial certificada.

Parciales: cantidad positiva menor de180. Por defecto exige coincidencia exacta;
allowShortfall:true es la compatibilidad explícita de rutas antiguas que ya
admitían menos preguntas. En ese caso la etiqueta indica, por ejemplo,8 de10
solicitados. Los Comandos EXCOBA y la selección manual exigen su cantidad exacta.
No se admite una cola mayor de la solicitada ni se presenta como completo.

## Compatibilidad y puntos de entrada

- startExam mantiene el rechazo de180 genéricos y envía el resto al inicio común
  con intención manual y cantidad exacta, sin alterar el scoring.
- startExcobaExam valida su banco y envía el contrato completo45/180 explícito.
- startExamForTarget/smartStartExamForTarget rechazan180 e importes inválidos antes
  de cargar/generar banco o llamar IA; pasan su intención parcial al inicio final.
- Comandos parciales pasan contrato exacto; los completos usan startExcobaExam.
- El cuestionario heredado v3 conserva llamadas parciales de dos argumentos.
  No se confía en su texto para validar un completo.
- beginExamQueue adapta llamadas antiguas parciales a una etiqueta parcial segura.
  Una llamada sin contrato que anuncie180/completo/oficial se rechaza; el texto
  solo puede vetar esa compatibilidad y nunca autoriza una modalidad completa.
  Una etiqueta arbitraria con contrato explícito válido se ignora en la salida.
- Recuperación v26: exclusivamente durante la recuperación controlada, una cola
  antigua de180 se adapta al contrato completo y se valida íntegramente. No se
  inventan datos de procedencia ni se migra el checkpoint. Si el inicio recuperado
  se rechaza, se lanza al manejo de errores ya existente de v26 para evitar que
  persistSession sobrescriba el checkpoint con un runtime vacío. El motor no cambia.

Todas las validaciones ocurren antes de stop, cambios de cola/índice/respuestas/
score, captura de procedencia o render del examen. Un rechazo normal solo informa
por toast y devuelve false. Los tests comparan DB, checkpoint, almacenamiento,
cronómetro, borradores, respuestas, índice, puntuación y declaración pendientes.

## Límites

El contrato es de inicio, no una certificación científica de preguntas. La
unicidad textual no prueba diversidad semántica. No se rellena un banco incompleto.
Se requiere catálogo al validar completos; no se inventa una distribución si falta.
No se instala nada ni se modifica el simulacro moderno de45. SW v6-90 mantiene
el aislamiento existente y entrega index/v3 actualizados.

El desbordamiento preexistente de #noaExamEvidenceKind a320px sigue documentado
en v274-prepilot-critical.md: no se cambia el control, no se elimina ni deshabilita
su prueba. No se afirma aptitud para piloto ni se inicia Fase2.

## Validación ejecutada — 10 de noviembre de 2026

Chromium, un worker, fixtures deterministas y almacenamiento aislado. Sin IA real
ni instalaciones.

| Ejecución | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Reproducciones antes de corregir el producto | 0 | 2 | 0 |
| Primera implementación, cobertura inicial | 53 | 0 | 0 |
| Ampliación de casos ambiguos | 57 | 0 | 0 |
| Ampliación a 69 casos, antes de corregir el fixture | 68 | 1 | 0 |
| Fixture corregido y dos órdenes ambiguas adicionales | 3 | 0 | 0 |
| Archivo específico final completo | 71 | 0 | 0 |
| Regresiones dirigidas | 241 | 0 | 0 |

Las ejecuciones de ampliación se solapan y no se suman. Cobertura final: 312 casos
distintos (71 específicos + 241 regresiones). El fallo intermedio era del montaje:
beforeunload persistía el runtime válido180 sobre el checkpoint178 artificial.
El fixture ahora inyecta la base inválida en el documento nuevo después de ese
guardado. No se eliminó ni omitió el caso. Pasó individualmente y dentro de los71.

Comando específico final:

```sh
npx playwright test tests/prepilot-start-contract.spec.cjs --workers=1 --reporter=json --output=/tmp/noa-pr24-contract-verified > /tmp/noa-pr24-contract-verified.json
```

Regresiones ejecutadas una sola vez; la selección no elimina la prueba móvil320:

```sh
npx playwright test tests/prepilot-critical.spec.cjs tests/prepilot-entrypoints.spec.cjs tests/exam.spec.cjs tests/pages.spec.cjs tests/timed-exam.spec.cjs tests/study-provenance.spec.cjs tests/results-normalization.spec.cjs tests/academic-results.spec.cjs tests/exam-45-ui.spec.cjs --workers=1 --reporter=line --output=/tmp/noa-pr24-start-regressions --grep 'prepilot-critical|prepilot-entrypoints|exam.spec.cjs|pages.spec.cjs|timed-exam|study-provenance|results-normalization|academic-results|v25 genera 45 con plan real|v25 completa 45 posiciones'
```

Incluyen v27.4,45 moderno, formatos/crédito parcial, revisión, procedencia,
resultados, cierre/recuperación v26, respaldo/restauración, móvil390 y SW offline.
Los últimos ajustes conservadores del parser, guard de recuperación y comandos
base se cubrieron después con el archivo específico final; las241 regresiones no
se volvieron a ejecutar tras esos últimos ajustes.

Evidencia de las reproducciones obligatorias:

- «sesión5 …180 preguntas»:180 con banco suficiente; sin banco, rechazo intacto.
- Cola178 con etiqueta completo180: rechazo con examen activo4, respuesta y crédito1.

También pasan180 válidos con recuperación,178/179 inválidos, duplicados de ID y
contenido, distribución incorrecta, procedencia pendiente, parciales10, contrato
con entradas congeladas y etiquetas derivadas. Cada caso específico comprueba
ausencia de pageerror. Sintaxis de13 archivos JS/CJS y dos scripts inline válida;
git diff --check correcto.

Los diez specs anteriores solo cambian el literal esperado de caché v6-89→v6-90;
no se afirma haber ejecutado todos esos archivos completos. No se ejecutó toda la
suite, IA real ni el caso del desbordamiento320 en esta corrección. La limitación
móvil permanece abierta para decidir el piloto.
