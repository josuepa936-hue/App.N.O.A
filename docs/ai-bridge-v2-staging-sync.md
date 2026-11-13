# Sincronización del candidato Worker — PR #26

Base auditada: `844fc451a5b193539c99cd62e643beb42dbb36ae`.
Se corrigieron únicamente los parámetros por modelo y la identidad externa
concreta de Gemma. No se desplegó Cloudflare, no se fusionó el PR y no se hicieron
inferencias reales. El frontend cambia solo para conservar y mostrar el nuevo
campo de identidad sin convertirlo en un modelo verificado.

## Payload Groq por modelo

| Modelo | Opción específica enviada | Opciones omitidas |
| --- | --- | --- |
| `openai/gpt-oss-120b` | `include_reasoning: false` | `reasoning_format`, `reasoning_effort` |
| `openai/gpt-oss-20b` | `include_reasoning: false` | `reasoning_format`, `reasoning_effort` |
| `qwen/qwen3.8-27b` | `reasoning_effort: "none"` | `include_reasoning`, `reasoning_format` |

Se conservan model, messages, temperature, stream:false y el límite anterior de
3000 tokens de salida. No se aplica una configuración común de razonamiento a
todos los modelos. GPT-OSS usa la configuración validada realmente que indicó
el usuario; no se revalidó mediante una inferencia nueva.

Para Qwen se consultó el **SDK oficial de Groq**, en una revisión fijada:
[completion_create_params.py](https://github.com/groq/groq-python/blob/55066d94acca028c3cb74e050f2711b80ade6298/src/groq/types/chat/completion_create_params.py#L187).
Documenta `none` para los modelos qwen3, enumera expresamente
`qwen/qwen3.8-27b`, señala que su valor predeterminado es none y que también
admite low/medium/high. En las líneas 131–136 y 201–205 documenta que
`include_reasoning` y `reasoning_format` son mutuamente excluyentes.

Referencia descargada por HTTPS desde el repositorio oficial, sin credenciales:
revisión `55066d94acca028c3cb74e050f2711b80ade6298`, SHA256 del archivo
`e186bd9fec40233efdd70b6c33ed9537e8017f46a397c349b5287abfeee6dc4d`.
Esto verifica el contrato documentado, **no la disponibilidad del modelo ni su
aceptación real para una cuenta o despliegue concreto**.

## Gemma: excepción exacta, sin prefijos

El único alias admitido para el modelo público
`@cf/google/gemma-4-26b-a4b-it` es
`@cf/google/gemma-4-26b-a4b-it-external`, documentado por la prueba real del usuario.
La solicitud sigue usando el identificador público; solicitar directamente el
alias externo sigue siendo inválido.

La respuesta conserva el texto y devuelve:

```json
{
  "provider": "cloudflare",
  "requestedModel": "@cf/google/gemma-4-26b-a4b-it",
  "model": null,
  "reportedModel": "@cf/google/gemma-4-26b-a4b-it-external",
  "verified": false,
  "verificationStatus": "external_unverified"
}
```

El frontend conserva `reportedModel` en el recibo de esa solicitud, muestra el
identificador completo junto con **Modelo no verificado** y mantiene
`identityVerified:false`. La coincidencia exacta con el identificador público
mantiene el resultado verificado anterior. La ausencia de modelo mantiene el
estado no verificado anterior.

No se compara por prefijo, no se añade el alias al selector y no se admiten
nombres similares, sufijos adicionales o declaraciones incompatibles. El Worker
rechaza esas discrepancias con 502; el frontend también rechaza una respuesta
200 falsificada con reportedModel desconocido o verified/status/model incoherentes.
Los datos id y usage se conservan. Los campos arbitrarios del proveedor y sus
trazas privadas de razonamiento no se reenvían.

## Alcance y validación

Se conservan autenticación, CORS, manejo de 429, Retry-After y pausas de cuota.
No cambian Batch, Generator, Judge, Blueprint, Calibrator, scoring, memoria o
normalización académica. La caché del frontend pasa a **v6-98** porque se sirve
el recibo ampliado; se conserva el aislamiento existente.

Comandos de las pruebas locales:

```sh
node staging/tests/bridge-quota-worker.test.mjs
npx playwright test tests/ai-bridge-v2.spec.cjs tests/ai-quota.spec.cjs --workers=1
npx playwright test tests/generator-ui.spec.cjs tests/physics-preparation.spec.cjs tests/physics-compatibility.spec.cjs tests/timed-exam.spec.cjs tests/backup-checkpoint-atomicity.spec.cjs --workers=2
```

Los servicios, los mensajes y las credenciales de las pruebas son simulados.
La prueba de compatibilidad importa el candidato Worker y entrega su respuesta
real de software al frontend; env.AI.run se sustituye por una función local.
No debe confundirse con una respuesta de Cloudflare real.

Antes de corregir, los casos añadidos reprodujeron cuatro fallos: payloads de
los tres modelos Groq y el alias externo de Cloudflare. El resultado fue 18
aprobadas y 4 fallidas. Esos cuatro casos pasan después de corregir, sin eliminar
las pruebas de autenticación, cuota ni discrepancias desconocidas.

## Siguiente checkpoint autorizado

El candidato está preparado para una **prueba controlada en staging**, después
de revisión y despliegue manual autorizado. Verificar separadamente cada modelo,
con concurrencia 1 para Groq y sin bucles de reintento. Para Cloudflare, el alias
externo documentado debe conservar el texto sin aparecer como coincidencia
verificada. La disponibilidad y aceptación reales de Qwen siguen pendientes.
No se declara listo para producción por el resultado de simulaciones.

## Resultados finales ejecutados

| Batería | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| Worker, Node con proveedores simulados | 22 | 0 | 0 |
| Frontend: identidad, Bridge y cuota, Chromium | 64 | 0 | 0 |
| Regresiones relacionadas, Chromium | 107 | 0 | 0 |

Son **193 pruebas distintas**, sin sumar la ejecución previa que reprodujo
18 aprobadas y 4 fallidas. No se ejecutó toda la suite del repositorio.
No se hicieron inferencias reales ni se consumió cuota del proveedor.

Las 22 del Worker cubren por separado los tres payloads Groq; identidad exacta,
externa y desconocida de Gemma; petición inválida del alias externo; token/origen;
429 temporal, diario y desconocido; Retry-After numérico y HTTP-date; CORS; uso,
metadatos y ausencia de credenciales o campos privados en la respuesta.

Las 64 del frontend/cuota incluyen la respuesta del candidato Worker pasando al
cliente, texto conservado, reportedModel sin verificación, rechazo de variantes
y claims falsos, metadatos concurrentes, pausa/reanudación y protección de sesión.

Regresiones ejecutadas:

- `backup-checkpoint-atomicity.spec.cjs`: 26 aprobadas, 0 fallidas, 0 omitidas.
- `generator-ui.spec.cjs`: 21 aprobadas, 0 fallidas, 0 omitidas.
- `physics-compatibility.spec.cjs`: 3 aprobadas, 0 fallidas, 0 omitidas.
- `physics-preparation.spec.cjs`: 18 aprobadas, 0 fallidas, 0 omitidas.
- `timed-exam.spec.cjs`: 39 aprobadas, 0 fallidas, 0 omitidas.

Sintaxis, revisión de credenciales privadas y `git diff --check`: correctos.
No se modifican motores académicos ni registros persistidos. Los cambios de
versión en suites antiguas solo actualizan la expectativa del SW a v6-98.

## Archivos de esta sincronización

- `docs/ai-bridge-v2-frontend.md`
- `docs/ai-bridge-v2-staging-sync.md`
- `excoba_patch_ai_bridge_v2.js`
- `index.html`
- `staging/noa-worker-bridge-v2.mjs`
- `staging/tests/bridge-quota-worker.test.mjs`
- `sw.js`
- `tests/ai-bridge-v2.spec.cjs`
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
