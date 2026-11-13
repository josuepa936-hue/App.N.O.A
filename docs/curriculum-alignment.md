# Correspondencia curricular de Generator y Judge — PR #26

## Diagnóstico y evidencia disponible

Se reportó una pregunta de fechas de inicio y consumación de la Independencia
de México en Primaria · Español. No se facilitó el reactivo completo ni el
código del slot; no es posible reconstruir su dictamen individual.

La inspección detectó una brecha reproducible: los cuatro Judges recibían
fuente, códigos y materia, pero el contrato no exigía justificar qué habilidad
requería resolver el reactivo ni su correspondencia semántica con el alcance
seleccionado. `source_fidelity` era una nota numérica sin esa evidencia
obligatoria. Un dictamen con métricas altas y revisiones académicas positivas
podía aprobar sin comprobar esa relación. El test conserva ese comportamiento
del evaluador anterior sin contexto y verifica que ya no basta en la ruta
real de Judge, que ahora siempre recibe el slot.

El catálogo canónico contiene **1.1.1 — Recuento histórico**: sucesión
cronológica, inferencia de fechas y lugares e información relevante. Por eso
no se bloquean palabras como «Independencia», años ni contextos históricos.
Identificar/inferir información de un texto suministrado puede evaluar lectura;
recordar fechas no proporcionadas evalúa Historia. Ortografía **1.1.5** y
Sintaxis **1.1.6** requieren sus propias habilidades; compartir materia no basta.

## Corrección

`alignmentScope()` en v9 lee los títulos y alcances del adaptador académico
verificado existente, `NOA_ACADEMIC_RESULTS_V27.catalog()`, por código exacto y
materia. No utiliza los títulos copiados en la pregunta como prueba. Un código
ajeno, inventado, repetido o sin catálogo impide la solicitud antes de IA.
No repara ni escribe el catálogo. Los cursos exclusivos conservan su alcance
propio sin inventar anclas; Física mantiene su referencia alternativa.

`alignmentContext()` proporciona ese alcance y un criterio común a Generator
y Judge de los cuatro formatos. Distingue la habilidad necesaria de la temática
incidental y exige respetar el Blueprint bloqueado.

En la ruta de evaluación de preguntas nuevas, el contrato añade:

```json
{
  "source_alignment": {
    "status": "pass | fail | uncertain",
    "syllabusCodes": ["códigos evaluados del slot"],
    "assessedSkill": "habilidad realmente necesaria para responder",
    "requiresUnrelatedKnowledge": false,
    "reason": "justificación específica con el alcance y los datos del reactivo"
  }
}
```

No se aprueba si falta esa comprobación, es inválida, está en conflicto con los
códigos seleccionados, declara fail/uncertain o reconoce conocimientos ajenos.
Esto explicita el control de correspondencia de `source_fidelity`; conserva
las métricas, mínimos, promedio mínimo 8.2, criterios científicos y vetos
anteriores de Judge v25.1. Un promedio 10 no subsana desalineación curricular.

Los cuatro consumidores de producción pasan el slot tanto al contrato como a
la evaluación. El evaluador sin slot conserva el contrato previo para usos
históricos/diagnósticos; ninguna de las cuatro rutas de Judge de generación
lo utiliza así. No se recalifican históricos ni se modifican respuestas,
créditos, sesiones, memoria, scoring, Calibrator, Blueprint o procedencia.
La nueva evidencia queda dentro del dictamen de las preguntas futuras.

La caché cambia v6-99 → v6-100 conservando el aislamiento y los ASSETS existentes.
Las doce pruebas anteriores con expectativas de caché solo actualizan ese
literal. Las fixtures compartidas de Judge/Bridge incorporan un dictamen
curricular positivo explícitamente simulado; los casos adversariales nuevos
suministran sus propios dictámenes sin ese valor predeterminado.

## Pruebas y limitaciones

`tests/curriculum-alignment.spec.cjs` contiene 21 casos deterministas:

- No bastan las notas altas sin evidencia semántica.
- Memorización histórica presentada como Español: fail, uncertain y
  reconocimiento de conocimientos ajenos impiden aceptación.
- Lectura con fechas proporcionadas, acentuación y concordancia: admisibles
  cuando corresponden al código seleccionado.
- Lectura bajo código de ortografía: no admisible por compartir materia.
- Matemáticas: distingue memorizar años de restarlos con datos suministrados.
- Biología/Química: distingue niveles de organización de balanceo de ecuaciones.
- Códigos y dictámenes inválidos, catálogo no disponible y catálogo persistido
  adulterado; curso sin ancla oficial y Física de referencia alternativa.
- Pipeline rechazado sin alterar la sesión, respuestas, borradores, memoria,
  historial, almacenamiento ni procedencia; slot sin mutaciones.
- Los cuatro formatos reciben el alcance real; determinismo y ausencia de
  referencias mutables compartidas en la evidencia proyectada.

La primera ejecución dio 17 aprobadas y un fallo de fixture: `inline_select`
no está permitido en Primaria · Matemáticas por v7. Se corrigió la prueba a
selección simple, sin ampliar los formatos del producto. La segunda dio
20 aprobadas y un fallo de fixture: no pudo sustituir una función de un API
congelado al simular catálogo ausente. Se sustituyó el adaptador completo
temporalmente y se restauró en finally. La ejecución específica final dio
**21 aprobadas, 0 fallidas y 0 omitidas**. No se suman casos repetidos.

Las preguntas son reconstrucciones sintéticas, no el original informado.
Los tests bloquean la red externa y simulan la respuesta de IA. Verifican
instrucciones, catálogo, contratos y decisiones del software. **No demuestran
que un modelo real detecte siempre una desalineación**: aún puede emitir un
dictamen semántico incorrecto que formalmente cumpla el contrato. No se añade
un clasificador por palabras clave ni se afirma validación oficial o humana.
No se ejecutan inferencias reales, despliegues ni cambios de proveedor.

## Regresiones ejecutadas y trazabilidad de resultados

Se ejecutó una batería relacionada de 207 pruebas con un worker Chromium:
**184 aprobadas, 23 fallidas y 0 omitidas**. Los 23 fallos quedaron en
`judge-academic.spec.cjs`: su fixture heredaba del setup de interfaz códigos
construidos como prefijo + `1` (por ejemplo `3.4.1`), inexistentes en el
catálogo real de Biología (`3.4.1.1`, etc.). La validación curricular los
rechazó correctamente antes de consultar IA. Se actualizó exclusivamente el
setup compartido para cargar `NOA_EXCOBA_FIX_V5.items`, sin relajar el control,
eliminar pruebas ni cambiar las aserciones de Judge.

Después se ejecutaron solo los archivos afectados por esa fixture compartida:

```sh
npx playwright test tests/judge-academic.spec.cjs tests/physics-classification-precision.spec.cjs tests/curriculum-alignment.spec.cjs --workers=1
```

Resultado: **55 aprobadas, 0 fallidas, 0 omitidas**. La batería anterior no
se repitió completa. La última ejecución de cada caso deja esta evidencia:

| Archivo | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| curriculum-alignment.spec.cjs | 21 | 0 | 0 |
| judge-academic.spec.cjs | 26 | 0 | 0 |
| physics-classification-precision.spec.cjs | 8 | 0 | 0 |
| ai-bridge-v2.spec.cjs | 43 | 0 | 0 |
| ai-quota.spec.cjs | 21 | 0 | 0 |
| backup-checkpoint-atomicity.spec.cjs | 26 | 0 | 0 |
| generator-trace-audit.spec.cjs | 2 | 0 | 0 |
| generator-ui.spec.cjs | 21 | 0 | 0 |
| physics-compatibility.spec.cjs | 3 | 0 | 0 |
| physics-preparation.spec.cjs | 18 | 0 | 0 |
| timed-exam.spec.cjs | 39 | 0 | 0 |
| **Casos distintos, última ejecución** | **228** | **0** | **0** |

No se suman las reejecuciones como casos adicionales ni se presenta ese total
como una única ejecución. Las regresiones cubrieron lotes sintéticos de 5, 10
y 45, los cuatro formatos, cuotas 429 y concurrencia, resultados guardados,
créditos parciales, cierre/recuperación, respaldos, móvil y offline.
No se ejecutó la suite completa.

Se utilizaron reporteros JSON y artefactos fuera del repositorio:
`/tmp/noa-alignment-specific.json`, `/tmp/noa-alignment-specific-final.json`,
`/tmp/noa-alignment-specific-verified.json`, `/tmp/noa-alignment-regressions.json`
y `/tmp/noa-alignment-judge-verified.json`. Se verificaron sintaxis y
`git diff --check`; una comparación con HEAD confirmó intactos
`JUDGE_POLICY_VERSION`, `JUDGE_THRESHOLDS` y `ACADEMIC_CHECKS`.
