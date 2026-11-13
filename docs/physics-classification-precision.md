# Precisión conceptual en clasificación de Física

## Evidencia y alcance

El informe de una prueba real con Gemma 4 indicó 3/5 preguntas aceptadas.
Para `noa-slot-4`, Drag Judge informó `conceptual_unambiguity: uncertain`,
`ambiguity_control: 7`, `qualityScore: 8.7`, `contractValid: true`,
`critical_issues: []` y `requiresHumanReview: true`.
Las métricas recibidas fueron: fidelidad 10, dificultad 9, clasificación 8,
elementos 9, ambigüedad 7, razonamiento 8 y claridad 10.

La observación describió una categoría «Energía de movimiento o transferencia»
que también contenía potencia. La energía cinética es una forma de energía;
trabajo y calor son mecanismos de transferencia; potencia es una tasa de
transferencia. Esa etiqueta no ofrece un criterio científico homogéneo.
El rechazo es correcto: un promedio alto no subsana incertidumbre conceptual
ni un criterio por debajo de su mínimo. No se rebaja ningún estándar.

El prompt anterior de `generateDragClassify()` pedía categorías claras y una
asignación única, pero no exigía definiciones operativas, supuestos explícitos
ni distinguía esos conceptos. Se refuerzan exclusivamente esas instrucciones:

- Un criterio científico explícito y categorías distinguibles según él.
- Definiciones en etiquetas o contexto, conservando el contrato JSON.
- Separación de magnitudes, procesos, propiedades y mecanismos diferentes.
- Contexto y supuestos suficientes para una sola asignación defendible.
- Revisión de solapamientos y explicación de cada asignación.
- Reformulación dentro del Blueprint bloqueado, conservando materia,
  dificultad, fuente y formato.

No se cambian Judge v25.1, sus mínimos (ambigüedad sigue en 8), Blueprint,
cuotas, concurrencia, memoria, scoring, sesiones ni historial. La caché pasa
de v6-98 a v6-99 para distribuir el prompt; se conserva su aislamiento.
Las modificaciones de pruebas anteriores solo actualizan esa versión esperada.

## Rechazo independiente de selección múltiple v9

Se inspeccionaron `generateSingleSelect()`, `judgeItem()`, `generateSlot()` y
la política compartida `NOA_JUDGE_ACADEMIC.evaluate()` en v9. Este formato
comprueba métricas propias, contrato completo, revisión académica y umbrales;
el rechazo no implica por sí solo ambigüedad ni comparte necesariamente la
causa de clasificación.

El detalle adicional recibido corresponde a `generateDragSlot` y
`noa-slot-4`, no al rechazo de v9. No están disponibles el reactivo completo
ni el dictamen de selección múltiple. Su causa permanece **no determinada**.
No se modifica su prompt sin evidencia. Para diagnosticarlo se necesita el
reactivo (enunciado, opciones, clave, explicación y Blueprint) y el objeto
`judge` del aviso «NOA v9 Judge rechazó el slot»: métricas, `academic_review`,
`validationErrors` y `critical_issues`, sin tokens ni datos personales.

## Validación determinista

`tests/physics-classification-precision.spec.cjs` añade ocho pruebas Chromium:

1. Instrucciones precisas, generación repetida y Blueprint profundamente
   congelado sin alteraciones.
2. Clasificación correcta entre contribuciones cinética y potencial.
3. Clasificación correcta entre transferencia por calor y trabajo de frontera.
4. Rechazo con las métricas informadas y sin modificar una sesión activa.
5. Veto por incertidumbre aun con todas las métricas en 10.
6. Veto por solapamiento entre energía cinética y mecánica.
7. Mínimo de ambigüedad: 7 y 7.99 se rechazan; 8 puede aceptarse si cumple
   todos los demás requisitos.
8. El pipeline real no promociona un slot rechazado ni modifica puntuación,
   respuestas, borradores, memoria, historial o almacenamiento.

Los ejemplos y dictámenes son fixtures sintéticos explícitos. La
reconstrucción del caso ambiguo **no es el reactivo original**. Se usan los
generadores, validadores y políticas reales con `callAI` simulado y la red
externa bloqueada. Las pruebas verifican instrucciones y decisiones del
software; no demuestran que Gemma u otro modelo vaya a producir o detectar
siempre categorías científicamente correctas. No se realiza inferencia real,
despliegue ni cambio automático de proveedor. Física conserva su procedencia
alternativa, sin atribuir confirmación para Medicina UAQ.

## Resultados ejecutados

Chromium, un worker, sin reintentos automáticos ni inferencias reales:

| Archivo de pruebas | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| physics-classification-precision.spec.cjs | 8 | 0 | 0 |
| judge-academic.spec.cjs | 26 | 0 | 0 |
| ai-quota.spec.cjs | 21 | 0 | 0 |
| generator-ui.spec.cjs | 21 | 0 | 0 |
| physics-preparation.spec.cjs | 18 | 0 | 0 |
| physics-compatibility.spec.cjs | 3 | 0 | 0 |
| timed-exam.spec.cjs | 39 | 0 | 0 |
| backup-checkpoint-atomicity.spec.cjs | 26 | 0 | 0 |
| **Total de pruebas distintas** | **162** | **0** | **0** |

Primero se ejecutó:

```sh
npx playwright test tests/physics-classification-precision.spec.cjs --workers=1
```

Después:

```sh
npx playwright test tests/judge-academic.spec.cjs tests/ai-quota.spec.cjs tests/generator-ui.spec.cjs tests/physics-preparation.spec.cjs tests/physics-compatibility.spec.cjs tests/timed-exam.spec.cjs tests/backup-checkpoint-atomicity.spec.cjs --workers=1
```

Ambas ejecuciones utilizaron reporter JSON y artefactos en `/tmp`, sin
añadir resultados generados al repositorio. Informes locales:
`/tmp/noa-precision-specific.json` y `/tmp/noa-precision-regressions.json`.
También pasaron `node --check` en los JavaScript de la corrección y
`git diff --check`. Se verificó que los doce archivos de pruebas anteriores
solo cambian la versión esperada de caché; no se eliminaron aserciones.
La inspección de los archivos añadidos/modificados de la corrección no
detectó patrones de credenciales. No se ejecutó la suite completa.
