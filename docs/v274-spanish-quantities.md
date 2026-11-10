# PR #24 — Cantidades españolas y cierre de los hallazgos de auditoría

Base auditada: dbc09542226bf50a5cab876d96f8e7c005599840.
Misma rama feature/noa-v274-prepilot-critical. No se modifica main ni se fusiona.

## Hallazgos originales y corrección

1. Las cantidades en palabras se confundían con ausencia de cantidad. El parser
   aplicaba45 a «ciento ochenta preguntas» y «dieciocho preguntas». Ahora reconoce
   las seis cantidades admitidas y rechaza las no admitidas o desconocidas.
2. U+2212 se consumía como delimitador y −180 pasaba a180 positivo. Los signos
   negativos Unicode reconocidos se normalizan sin descartar el signo, incluso
   separado por espacios; no se admiten cantidades negativas.
3. El inicio mixto y la recuperación con mixed=true evitaban beginExamQueue.
   start de v13 ahora consulta resolveExamStart antes de modificar renderers,
   cola, respuestas, puntuación o procedencia. Un error detiene la recuperación
   mediante su manejo existente y conserva el checkpoint rechazado.
4. El control noaExamEvidenceKind imponía un mínimo intrínseco que desbordaba320px.
   Solo ese select recibe min-width:0 y width/max-width:100%. No se rediseña el panel.

El estado de fusionabilidad de GitHub no era un defecto de código confirmado.
La API403, el merge sintético antiguo y las comprobaciones no visibles siguen
siendo limitaciones de verificación; no se cambia ninguna configuración remota.

## Contrato del parser

```js
parseExcobaTrainingCount('NOA practica EXCOBA de ciento ochenta preguntas');
// {valid:true,count:180,quantityState:'recognized',source:'explicit'}
parseExcobaTrainingCount('NOA practica EXCOBA de dieciocho preguntas');
// {valid:false,quantityState:'unrecognized',message:...}; sin count.
parseExcobaTrainingCount('NOA practica EXCOBA');
// {valid:true,count:45,quantityState:'absent',source:'default'}
```

quantityState distingue una cantidad admitida, una presente pero no admitida o
no interpretable, y la ausencia real. Los consumidores conservan valid/count;
no se cambia su contrato persistente porque este resultado no se almacena.

El vocabulario admitido es exactamente cinco, diez, quince, veinte, cuarenta y
cinco y ciento ochenta. Se reconoce antes y después de preguntas/reactivos,
con mayúsculas, espacios y normalización de acentos. Las cifras siguen admitiendo
5/10/15/20/45/180. Las cantidades repetidas coincidentes son compatibles; cifras
y palabras contradictorias se rechazan. Los compuestos no admitidos no pueden
convertirse en un sufijo admitido: «cinco mil» no se transforma en cinco.

Una lista finita identifica otras expresiones numéricas para rechazarlas, sin
intentar interpretar lenguaje general. Si se menciona preguntas/reactivos sin
una cantidad interpretable, se pide aclaración. Si no hay unidad ni cifra, un
residuo no reconocido en la sintaxis EXCOBA tampoco autoriza el predeterminado45.
No es un sistema de lenguaje natural nuevo; las frases fuera de esa gramática
pueden requerir reformulación.

Los números de sesión, intento, año, fecha, versión, materia y demás contextos
ya reconocidos se separan de las cantidades de reactivos, también escritos en
palabras. Los artículos de «un examen» o «un simulacro» no se tratan como cantidad1.

## Consumidores y contrato de inicio

Comandos base, v3 y el wrapper del Temario siguen usando la interpretación común.
Un pedido explícito EXCOBA con cantidad y unidad también puede omitir el verbo.
La forma abreviada «NOA sesión cinco, practica ciento ochenta preguntas» necesita
una materia canónica EXCOBA seleccionada; no se infiere una materia por nombres
de reactivos ni se inventa un contexto académico.

beginExamQueue no cambia. resolveExamStart conserva cantidades, modalidades,
unicidad y distribución; solo amplía el veto de etiquetas heredadas para reconocer
«ciento ochenta». Un texto de título nunca autoriza un completo.

NOA_MIXED_EXAM.start acepta opcionalmente el mismo tercer argumento de intención.
Un completo requiere el contrato validado y recibe su etiqueta derivada. Para
parciales heredados seguros se conservan los títulos existentes, incluido v24 y
v25 moderno. Una cola de180 durante recuperación controlada usa la adaptación
existente y debe superar la validación íntegra. No hay migración de checkpoints.

No se cambian Judge, Calibrator, scoring, recuperación v26, memoria, normalizadores
ni recomendaciones. Los rechazos no deben consumir declaraciones ni escribir.

## PWA y archivos

SW pasa de v6-90 a v6-91 manteniendo el prefijo aislado por scope. index y v13 ya
pertenecían a ASSETS. Los diez specs anteriores solo actualizan su literal de
caché esperado. No se añaden dependencias ni configuración de desarrollo.

Archivos funcionales: index.html, excoba_patch_v13_mixed_exam.js y sw.js.
Nueva cobertura: tests/prepilot-spanish-quantities.spec.cjs.
Este documento conserva causas, contrato, alcance y registro de pruebas.

Specs cuyo único cambio es la versión esperada de caché:

```text
tests/exam-45-ui.spec.cjs
tests/exam-multibatch.spec.cjs
tests/exam-plan.spec.cjs
tests/generator-ui.spec.cjs
tests/question-diversity-integration.spec.cjs
tests/question-memory-integration.spec.cjs
tests/question-memory.spec.cjs
tests/results-normalization.spec.cjs
tests/timed-exam.spec.cjs
tests/topic-diversity.spec.cjs
```

No se afirma haber ejecutado todos esos archivos completos: el reporte de
regresiones conserva la selección exacta. No se eliminan ni deshabilitan tests.

## Registro de validación

Chromium instalado, un worker, datos aislados y pruebas deterministas sin IA real.

- Antes de cambiar código servido: seis pruebas fallidas, cero aprobadas u omitidas;
  reproducen los cuatro hallazgos mediante cinco casos nuevos y el caso móvil existente.
- Primera corrección: cinco aprobadas y una fallida. El fallo restante era del
  fixture afterEach: el contador de llamadas vetadas no se reinstalaba al recargar.
  Se reinstala ahora en cada documento; no se eliminó ninguna aserción.
- Primera matriz específica:134 aprobadas,21 fallidas,0 omitidas. Los21 fallos eran
  del fixture: avanzaba el reloj200ms después del rechazo y exigía elapsed idéntico.
  Un diagnóstico aislado confirmó estado inmediatamente intacto y únicamente
  elapsed0.4→0.6 al avanzar el reloj. Se compara ahora antes de avanzarlo.
- Seguimiento dirigido:23 aprobadas,0 fallidas,0 omitidas. Son los21 casos de banco
  insuficiente corregidos y dos casos adicionales: signo separado y título en palabras.
- Un intento de comprobación simultánea no llegó a ejecutar casos porque8022
  estaba ocupado. Se diagnosticó como infraestructura, sin contar casos como PASS.

Cobertura específica final sin sumar repeticiones:157 casos distintos aprobados,
0 fallidos y0 omitidos (71 anteriores y86 nuevos). No se ocultan las ejecuciones
intermedias fallidas ni se suman pruebas de tareas anteriores.

Comandos y reportes:

```sh
npx playwright test tests/prepilot-spanish-quantities.spec.cjs tests/prepilot-start-contract.spec.cjs --workers=1 --reporter=json --output=/tmp/noa-pr24-spanish-specific > /tmp/noa-pr24-spanish-specific.json
npx playwright test tests/prepilot-spanish-quantities.spec.cjs --workers=1 --reporter=json --grep 'español admitido false:|título mixto|− ciento' --output=/tmp/noa-pr24-spanish-followup > /tmp/noa-pr24-spanish-followup.json
```

Las regresiones se registran en /tmp/noa-pr24-spanish-regressions.json. Incluyen
v26, procedencia, manuales, formatos, revisión/crédito parcial, 5/10/45 sintéticos,
180, cuatro tamaños de pantalla, respaldo/restauración y SW offline.

Resultado de regresiones sobre el código final:132 aprobadas,0 fallidas,0 omitidas.
Los cuatro casos móviles320/390/768/1365 pasan. El caso320 existente verifica
listo, generación e incompleto: ya no falla en su primera comprobación de ancho.
Es evidencia de navegador automatizado, no una prueba en un teléfono físico.

```sh
npx playwright test tests/timed-exam.spec.cjs tests/study-provenance.spec.cjs tests/exam.spec.cjs tests/pages.spec.cjs tests/prepilot-entrypoints.spec.cjs tests/exam-45-ui.spec.cjs tests/generator-ui.spec.cjs --workers=1 --reporter=json --output=/tmp/noa-pr24-spanish-regressions --grep 'timed-exam.spec.cjs|study-provenance.spec.cjs|exam.spec.cjs|pages.spec.cjs|inicio manual rechaza 180|ruta intermedia|180 específicos|wrapper del Temario|comando de materia sin EXCOBA|v25 genera 45 con plan real|v25 completa 45 posiciones|sin desbordamiento a (320|390|768|1365)px|v25 UI45 se almacena|v24 genera exactamente' > /tmp/noa-pr24-spanish-regressions.json
```

Balance sin duplicar seguimientos:289 casos distintos aprobados,0 fallidos y0
omitidos en su resultado final (157 específicos y132 regresiones). No es toda la
suite. Sintaxis de index, v13, SW y nuevo spec comprobada; git diff --check correcto.
La última ampliación del veto de títulos y signos separados se verificó con sus
casos dirigidos; toda la batería de regresiones se ejecutó después de esos cambios.

Las notas anteriores que documentaban320px como pendiente describen el estado
histórico. Esta tarea autoriza corregir también ese hallazgo; el resultado actual
se evalúa con la prueba existente completa, sin eliminar ni deshabilitar cobertura.

No se certifican calidad científica de preguntas, IA real, dispositivos físicos,
ni toda la suite por haber pasado estas pruebas dirigidas. No se inicia Fase2.
