# Corrección de cuota Groq — PR #26

## Reproducción y causa

El transporte anterior representaba HTTP 429 como un error HTTP genérico. Batch
lo sumaba a errores de generación y aplicaba reposiciones de slots. El reproductor
simulado de cinco preguntas, concurrencia 1 y dos intentos registró **10 llamadas**
y cinco reposiciones. La prueba que exige detenerse tras la primera falló antes
de corregir el producto. No hubo inferencias reales.

La ruta usada por la tarjeta de 5/10 es `generateWithHistory`. Se corrige esa
ruta y el map concurrente de Batch, y se propaga el mismo corte en multibatch de
45. No se cambia el límite de 10 de v10 ni la evaluación académica.

## Contrato y comportamiento

HTTP 429 se representa como `NOAAIError` con `code:'quota_exceeded'`, `status:429`
y `rateLimit` seguro. Es un fallo de servicio, no un rechazo académico. El error
se propaga completo; no aumenta los contadores académicos ni se devuelve un
lote incompleto para iniciar un examen. No se repone un slot por cuota.

El transporte comparte una pausa por **proveedor y modelo**, con estado separado
en claves `NOA_AI_QUOTA_V1:*`. No guarda token, prompts, respuestas, claves del
proveedor ni identificadores de cuentas. El historial y la memoria académica no
se usan para guardar esta pausa. Se conserva al recargar y durante la restauración
de un respaldo en el mismo navegador. Los eventos de storage sincronizan pestañas.

Al recibir 429 se bloquean inmediatamente las nuevas llamadas de ese modelo y se
aborta la espera de otras solicitudes en vuelo del mismo modelo. Los callbacks
abortados conservan el veto aunque otra pestaña haya retirado la pausa: no pueden
revivir el lote anterior. Batch drena sus trabajadores y propaga el error; las
sesiones anteriores, borradores, créditos, revisión y memoria permanecen intactos.

La pausa continúa hasta una acción manual. No hay temporizador de reintentos.
Si se informó Retry-After, **Comprobar y reanudar manualmente** no permite retirar
la pausa antes de la espera mínima. Después de retirarla aún debe pulsarse
**Generar con IA** para empezar otro lote. No se reanuda el lote descartado ni se
solicitan preguntas automáticamente. Si no hay espera conocida, la acción es una
decisión explícita del usuario; no significa que la cuota se haya renovado.

Se admite Retry-After numérico o HTTP-date, también por encima de 120 segundos.
El plazo se calcula desde la recepción del 429, sin volver a sumar la espera al
terminar de leer el cuerpo. El cuerpo seguro puede aportar `retryAfterSeconds`
cuando CORS no exponga la cabecera. Se distingue daily/temporary/unknown solo por
información explícita del proveedor; no se inventa una hora ni un cambio de día.

La tarjeta permite elegir concurrencia 1/2/3. Groq usa **1 por defecto**; su
preferencia se conserva por separado. Los otros proveedores conservan 2 por
defecto. La UI de 45 reutiliza esa elección. Ninguna ruta selecciona otro modelo,
Cloudflare o Gemma automáticamente al llegar al límite.

## Candidato para staging, sin despliegue

`staging/noa-worker-bridge-v2.mjs` parte del candidato adjunto
`noa-worker-bridge-v2-predeploy.js`. No se incorpora a ASSETS ni se carga en el
frontend. No hay configuración de Wrangler ni despliegue automático añadido.

Se mantienen autorización, allowlist de modelos, separación de proveedores y
validación de identidad. La modificación de 429 devuelve únicamente:

```json
{
  "error": "Límite de uso de Groq alcanzado",
  "code": "quota_exceeded",
  "provider": "groq",
  "requestedModel": "openai/gpt-oss-120b",
  "upstreamStatus": 429,
  "rateLimit": {"type": "daily", "retryAfterSeconds": null}
}
```

El ejemplo no afirma que la cuota real actual sea diaria. Se clasifican marcadores
explícitos de Groq (TPD/RPD o TPM/RPM); las señales ambiguas quedan unknown. No se
reenvían mensajes originales, cuentas, organizaciones, claves, prompts ni cuerpos
arbitrarios. Si hay espera válida, se transmite en Retry-After y se expone esa
cabecera por CORS. La clave privada sigue exclusivamente en el Worker.

URL indicada por el usuario: `https://noa-ai-staging.josuepa936.workers.dev`.
Origen local indicado: `http://127.0.0.1:8765`; debe configurarse explícitamente
entre los orígenes permitidos de staging. La lectura de `/health` desde este
entorno quedó bloqueada por el proxy y la política de destinos. Por tanto,
**no se verificó el código desplegado**, sus credenciales ni sus respuestas
reales. El código revisado/probado es el candidato local, no una actualización
del servicio remoto. No se ha desplegado Cloudflare ni cambiado producción.

## Límites de la protección

- Una solicitud ya enviada puede haber consumido tokens aunque el navegador la
  aborte. La corrección impide llamadas posteriores; no garantiza reembolso.
- La pausa es del mismo origen/navegador. No reemplaza cuotas de servidor ni
  coordina todos los dispositivos o usuarios de una cuenta Groq.
- La hora local permite calcular la espera mínima recibida; no certifica la
  disponibilidad posterior del proveedor. Un nuevo intento manual puede recibir 429.
- Si el navegador deniega localStorage, la protección sigue en RAM en esa pestaña,
  pero no se garantiza su conservación después de cerrarla o recargarla. Una
  escritura parcial tampoco sustituye en RAM una espera nueva por otra antigua:
  el caso reproducido conserva 20 s aunque en disco hubieran quedado 1 s.
- No se cambian Judge, Blueprint, Calibrator, scoring, deduplicación ni las
  fórmulas de estadísticas. Los datos de progreso no se borran para reanudar.
- Las credenciales siguen excluidas de los respaldos académicos, como antes.

## Comprobación reproducible

```sh
npx playwright test tests/ai-quota.spec.cjs tests/ai-bridge-v2.spec.cjs --workers=1
node staging/tests/bridge-quota-worker.test.mjs
```

La suite usa rutas simuladas y contextos aislados. El Worker se importa localmente
con fetch y credenciales ficticias. Las pruebas no consumen tokens ni demuestran
que Groq haya repuesto la cuota real. Se preparó la caché aislada **v6-97**.

Antes de solicitar otra generación real deben revisarse este diff y el candidato
de staging, comprobarse su despliegue autorizado y la exposición CORS de los
metadatos. No se ha solicitado ni ejecutado otra prueba real en esta tarea.

## Resultados reales de validación

| Ejecución | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| Cuota + Bridge, antes del último caso de almacenamiento | 56 | 0 | 0 |
| Regresiones relacionadas, primera ejecución | 241 | 1 | 0 |
| Última ejecución: cuota + Bridge + generador | 78 | 0 | 0 |
| Candidato Worker, Node con fetch simulado | 12 | 0 | 0 |

La última ejecución contiene 21 pruebas de cuota, 36 de Bridge y 21 del generador.
Las 21 del generador ya forman parte de las 242 regresiones; las repeticiones no
se suman como casos nuevos. La cobertura final comprende **311 pruebas distintas**
(299 de Chromium y 12 del Worker), sin fallos pendientes en los casos ejecutados.
No se ejecutó toda la suite del repositorio.

El único fallo de la regresión amplia fue una expectativa de dos selectores en
la tarjeta: ahora hay tres por el control solicitado de concurrencia. Se cambió
por la lista exacta de sus tres IDs. Se conservaron y ejecutaron las comprobaciones
de los cuatro perfiles y Calibrator. No se eliminaron ni desactivaron tests.

El caso nuevo de escritura parcial falló antes de la corrección: devolvía 1 s,
tipo unknown y persisted=true en lugar de conservar en RAM 20 s, temporary y
persisted=false. Ahora pasa y muestra la advertencia de almacenamiento.

Detalle de las regresiones amplias (el generador se revalidó 21/21 en la última
batería; las demás no tuvieron fallos):

- `backup-checkpoint-atomicity.spec.cjs`: 26 aprobadas, 0 fallidas, 0 omitidas en la primera ejecución.
- `exam-45-ui.spec.cjs`: 22 aprobadas, 0 fallidas, 0 omitidas en la primera ejecución.
- `exam-multibatch.spec.cjs`: 25 aprobadas, 0 fallidas, 0 omitidas en la primera ejecución.
- `generator-ui.spec.cjs`: 20 aprobadas, 1 fallidas, 0 omitidas en la primera ejecución.
- `judge-academic.spec.cjs`: 26 aprobadas, 0 fallidas, 0 omitidas en la primera ejecución.
- `physics-compatibility.spec.cjs`: 3 aprobadas, 0 fallidas, 0 omitidas en la primera ejecución.
- `physics-preparation.spec.cjs`: 18 aprobadas, 0 fallidas, 0 omitidas en la primera ejecución.
- `question-diversity-integration.spec.cjs`: 30 aprobadas, 0 fallidas, 0 omitidas en la primera ejecución.
- `question-memory-integration.spec.cjs`: 32 aprobadas, 0 fallidas, 0 omitidas en la primera ejecución.
- `timed-exam.spec.cjs`: 39 aprobadas, 0 fallidas, 0 omitidas en la primera ejecución.

También pasaron sintaxis, revisión de credenciales privadas y `git diff --check`.
Los archivos de Blueprint, Judges, Calibrator/scoring en index, memoria y
estadísticas no se modificaron. Los cambios de versión de suites antiguas solo
actualizan la caché esperada a v6-97, salvo la adaptación descrita del selector.
Las pruebas Node viven fuera de testDir de Playwright para no mezclar runners;
se ejecutaron expresamente con el comando documentado.

## Archivos de la corrección

- `docs/ai-bridge-v2-frontend.md`
- `docs/ai-bridge-v2-quotas.md`
- `excoba_patch_ai_bridge_v2.js`
- `excoba_patch_v10_batch.js`
- `excoba_patch_v24_generator_ui.js`
- `excoba_patch_v25_exam_ui.js`
- `excoba_patch_v25_multibatch.js`
- `staging/noa-worker-bridge-v2.mjs`
- `staging/tests/bridge-quota-worker.test.mjs`
- `sw.js`
- `tests/ai-bridge-v2-fixtures.cjs`
- `tests/ai-bridge-v2.spec.cjs`
- `tests/ai-quota.spec.cjs`
- `tests/exam-45-ui.spec.cjs`
- `tests/exam-multibatch.spec.cjs`
- `tests/exam-plan.spec.cjs`
- `tests/generator-ui.spec.cjs`
- `tests/physics-compatibility.spec.cjs`
- `tests/question-diversity-integration.spec.cjs`
- `tests/question-memory-integration.spec.cjs`
- `tests/question-memory.spec.cjs`
- `tests/results-normalization.spec.cjs`
- `tests/timed-exam.spec.cjs`
- `tests/topic-diversity.spec.cjs`
