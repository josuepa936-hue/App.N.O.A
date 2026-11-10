# PR #24: generaciones asíncronas y rollback

Base auditada: d0d7152bab9654f11772878299de90cf3473628b.
Rama existente: feature/noa-v274-prepilot-critical. No se modifica main.

## Causa y reproducciones previas

Se ejecutaron las dos reproducciones de la auditoría antes de modificar el
producto. Ambas fallaron: una importación rechazada iniciaba un hash en la
generación1; el rollback restauraba0 y la siguiente importación volvía a usar1.
Al liberar el hash, reaparecían dos entradas y la sesión
`history:audit-rejected-async-memory` en una memoria restaurada vacía.

Se comprobaron tanto el checkpoint de cierre de la primera variante temporal
como el checkpoint vencido en el pasado respecto al reloj controlado. El
almacenamiento estaba disponible y el rollback había tenido éxito.
Reportes: /tmp/noa-epoch-red-future.json y /tmp/noa-epoch-red-expired.json.
Cada reporte contiene0 aprobadas,1 fallida,0 omitidas; son evidencia previa,
no se suman a los resultados de la corrección.

## Asignación y autorización independientes

`epochSequence` es un contador BigInt privado, monótono, sin IDs de reloj.
Cada transacción obtiene `++epochSequence`. Nunca se restaura ese contador.
`operationEpoch` identifica únicamente la generación autorizada actualmente.
El rollback recupera la autorización anterior, preservando sus tareas válidas,
sin volver a asignar la identidad de una operación abortada.

La revocación ocurre al comenzar a reparar el rollback, incluso si el navegador
deniega la reversión del almacenamiento. El escritor comprueba su autorización
dentro de la sección serializada, antes de intentar cualquier reparación, y
vuelve a comprobarla antes de procesar el registro. Una tarea revocada devuelve
`{ok:false,error:'operation_superseded'}` sin escribir ni reparar claves.
El mecanismo existente de serialización y Web Locks permanece intacto.

## Origen de tareas y callbacks

La API añade `captureGeneration()`: devuelve un objeto opaco congelado. Un
WeakMap privado lo vincula con la generación de origen; no contiene preguntas,
credenciales ni referencias a registros del usuario.

| Ruta | Captura y propagación |
|---|---|
| `recordExam(questions,id,options,generation?)` | Captura al invocar si no se aporta contexto; conserva el epoch durante el hash y lo verifica al escribir. |
| `recordSavedAttempt(attempt,questions,generation?)` | Conserva el contexto al entrar en `registerSavedAttempt`. |
| `registerSavedAttempt` | Verifica el intento duradero y filtra exposiciones con las mismas reglas; reenvía el origen como cuarto argumento a `recordExam`. |
| `recoverHistory(attempts,generation?)` | Una sola captura para todo el historial; cada iteración conserva ese origen y cancela explícitamente al perder autorización. `whenIdle` incluye la operación completa. |
| `commitCompletedExam` | Captura el contexto antes de cualquier callback diferido y lo pasa como tercer argumento de `recordSavedAttempt`. No cambia la puntuación ni el cierre. |
| `restoreBackup` y `resetData` | Comparten el asignador no reutilizable de la transacción existente. |

Para diferir una llamada se debe capturar el origen antes de programarla y
reenviar el mismo objeto, sin clonarlo. Ejemplo:

```js
const origin = memory.captureGeneration();
queueMicrotask(() => memory.recordSavedAttempt(attempt, questions, origin));
```

Las llamadas anteriores sin parámetro adicional siguen siendo operaciones
nuevas en la generación activa. Un objeto inventado o clonado devuelve
`invalid_generation`; no se convierte silenciosamente en una captura nueva.
Los callbacks internos de cierre solo resuelven su promesa después del registro;
no crean una segunda escritura con el contexto vigente en ese momento.

Las cancelaciones esperadas por sustitución de generación devuelven un resultado
controlado y no muestran un aviso de error de memoria sobre otra sesión.
`fingerprint`, `contains`, `recent` y `stats` son lectores, no escritores.

## Preservación y límites

No hay campos persistentes nuevos. El contador BigInt y los contextos pertenecen
solo a la ejecución JavaScript; no entran en db, checkpoints ni respaldos JSON.
Se conservan formato/versiones persistentes, créditos, omisiones, procedencia,
exposición, deduplicación y el contrato de inicio existente.

Las tareas anteriores pueden continuar tras un rollback correcto. Una
restauración posterior que sustituya legítimamente ese estado las cancela de
forma explícita; nunca las reasigna a la generación nueva.
Si el navegador deniega permanentemente el rollback, se mantiene la advertencia
existente y los originales en RAM. Cerrar esa pestaña puede perder la copia
temporal. No se añade coordinación entre ejecuciones de distintas pestañas.

## Verificación

`tests/question-memory-generations.spec.cjs` contiene20 pruebas deterministas
con promesas/barreras de Web Crypto, reloj controlado, Chromium y almacenamiento
aislado; no hay temporizadores reales para ordenar las operaciones ni IA real.

La batería final específica se ejecutó con un worker:

```sh
npx playwright test tests/question-memory-generations.spec.cjs --workers=1 --reporter=json --output=/tmp/noa-epoch-final-specific > /tmp/noa-epoch-final-specific.json
```

Resultado:20 aprobadas,0 fallidas,0 omitidas. La primera batería de17 casos
también pasó; se solapa y no se suma. Las ampliaciones incluyen un historial y
un cierre legítimos ya pendientes antes del rollback y un borrado posterior.

Las invariantes cubren revocación, no reutilización, igualdad de snapshots tras
rechazo, callbacks diferidos, generaciones concurrentes, tareas válidas,
historial de varios intentos, parcial/omisiones, rollback denegado y reparación,
recarga v26, exportación, deduplicación y ejecución offline.

Los scripts servidos actualizan la caché v6-93→v6-94, conservando ASSETS y su
aislamiento por scope. Diez specs existentes solo actualizan ese literal.
No se cambian Judge, Calibrator, scoring, recomendaciones, esquemas ni históricos.

La batería relacionada se ejecutó una sola vez, con dos workers y sin IA real:
229 aprobadas,0 fallidas,0 omitidas (/tmp/noa-epoch-regressions.json).
Incluye completos: memoria24,integración de memoria32,diversidad integrada30,
atomicidad de respaldo26,cronómetro39,procedencia55 yexamen14. Además incluye
Pages3 yseis casos offline de los otros módulos. No se ejecutó toda la suite.

Selección exacta reproducible:

```sh
npx playwright test tests/question-memory.spec.cjs tests/question-memory-integration.spec.cjs tests/question-diversity-integration.spec.cjs tests/backup-checkpoint-atomicity.spec.cjs tests/timed-exam.spec.cjs tests/study-provenance.spec.cjs tests/exam.spec.cjs tests/exam-plan.spec.cjs tests/exam-multibatch.spec.cjs tests/exam-45-ui.spec.cjs tests/generator-ui.spec.cjs tests/results-normalization.spec.cjs tests/topic-diversity.spec.cjs tests/pages.spec.cjs --workers=2 --reporter=json --output=/tmp/noa-epoch-regressions --grep 'question-memory.spec.cjs|question-memory-integration.spec.cjs|question-diversity-integration.spec.cjs|backup-checkpoint-atomicity.spec.cjs|timed-exam.spec.cjs|study-provenance.spec.cjs|exam.spec.cjs|pages.spec.cjs|offline|Service Worker|service worker' > /tmp/noa-epoch-regressions.json
```

Balance final sin sumar ejecuciones solapadas:249 casos distintos aprobados,
0 fallidos,0 omitidos. /tmp/noa-epoch-final-summary.json registra la unión de
los20 nuevos y229 relacionados por archivo,título yproyecto. Las dos fallas
previas intencionales demuestran la reproducción del defecto y no son resultados
pendientes de la corrección. Sintaxis de los módulos y scripts inline correcta;
git diff --check correcto.

Archivos: excoba_patch_v25_question_memory.js,index.html,sw.js,este documento,
tests/question-memory-generations.spec.cjs y diez expectativas de caché:
exam-45-ui,exam-multibatch,exam-plan,generator-ui,question-diversity-integration,
question-memory-integration,question-memory,results-normalization,timed-exam y
topic-diversity, bajo tests/ y con sufijo .spec.cjs.
