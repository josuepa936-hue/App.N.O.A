# NOA AI Bridge v2 — frontend de texto

Esta rama recupera la implementación local de `feature/noa-ai-bridge-v2`.
No fue necesario reconstruir los archivos. La base es `main` en
`504dbda7de13b21f4e5032094a0748339c9af941` (PR #25 integrado).

Se usaron como referencia de contrato los adjuntos del usuario
`noa-worker-bridge-v2-predeploy.js` y `GUIA_NOA_BRIDGE_V2.md`.
No se modificó ni desplegó el Worker. No se instalaron dependencias.
El candidato adjunto sigue siendo predespliegue: esta rama no confirma ningún
servicio, credencial ni disponibilidad real de los modelos. El frontend rechaza
respuestas del Worker antiguo sin identidad v2; el paso a producción requiere
coordinar frontend y servidor, después de validar staging.

## Proveedores y preferencias

- Groq: `openai/gpt-oss-120b` por defecto, `openai/gpt-oss-20b` y
  `qwen/qwen3.8-27b`. Solo texto.
- Cloudflare: `@cf/google/gemma-4-26b-a4b-it`.
- Ollama directo conserva URL y modelo configurados, inicialmente `gemma3:4b`.
  Usa su propio endpoint; nunca recibe el token del Bridge.
- OpenAI y Ollama Bridge anteriores siguen identificables y conservan sus
  preferencias. Se muestran incompatibles con este Worker v2 y no se redirigen
  a otro proveedor. La prueba de conexión queda deshabilitada para ellos.

Se añaden preferencias `groqModel` y `cloudflareModel` a settings, conservando
las anteriores. No se migra ni modifica el esquema de intentos, respuestas o
puntuaciones. Las operaciones de configuración guardan preferencias mediante
el mecanismo existente. Los respaldos académicos siguen excluyendo conexiones
y secretos como antes; no se presentan como respaldo de la configuración de IA.

## Contrato de transporte

`callAI(messages, options)` conserva una promesa cuyo resultado es **texto**.
Generator, los cuatro Judges y Batch no se modifican.

Cada promesa dispone de `metadata()`, asociado exclusivamente a esa llamada:

```js
const pending = callAI(messages, { temperature: 0 });
const text = await pending;
const receipt = await pending.metadata();
```

También está disponible `NOA_AI_BRIDGE_V2.request(messages, options)`, que
resuelve `{text, metadata}`. Proveedor, modelo y token se capturan antes de la
primera espera. No existe un almacén global de «último modelo» ni un registro de
prompts. Consultar un recibo devuelve una copia independiente. Los recibos son
transitorios; no se añaden modelos no verificados al historial académico.

El Bridge recibe POST a `<URL base>/api/chat` con `provider`, `model`,
`messages` y `temperature`, usando el token configurado como Bearer. Ollama
conserva además `stream:false` y `options.temperature`.

La respuesta del Bridge debe contener texto no vacío y coincidir en `provider`
y `requestedModel` con la solicitud. Se leen los metadatos `provider`,
`requestedModel`, `model`, `verified`, `verificationStatus`, `id` y `usage`.
Se conserva por separado lo solicitado por el cliente y lo reportado por el
servidor. `identityVerified` solo es true cuando las identidades coinciden y el
Bridge informa `verified:true` y `verificationStatus:'matched'`.

Un modelo ausente o null se muestra como **Modelo no verificado**, sin copiar
el solicitado. Un modelo reportado sin confirmación suficiente permanece no
verificado. Una discrepancia explícita de proveedor o modelo rechaza el texto.
Una respuesta del Worker antiguo sin identificación v2 no confirma conexión.
La coincidencia verifica metadatos declarados por el servidor; no certifica
independientemente al modelo ni la calidad científica de sus respuestas.

Se manejan HTTP 400, 401, 403, 429, 502 y 503 mediante mensajes controlados,
sin mostrar cuerpos de error arbitrarios. Se reconocen únicamente los dos
mensajes fijos de discrepancia de modelo que el candidato devuelve con HTTP 502;
se informa la discrepancia sin inventar el modelo rechazado. El transporte no cambia de proveedor
ni reintenta automáticamente. El Batch conserva sus reposiciones limitadas
existentes. Hay un límite de espera de 70 segundos por solicitud.

## Seguridad, CORS y PWA

La clave privada de Groq pertenece exclusivamente al servidor. El frontend no
solicita ni incorpora esa clave. El token de Bridge sigue usando el campo de
contraseña existente; no se añade a los recibos ni a las capturas de texto.
Las URL no admiten credenciales, parámetros ni fragmentos.

El candidato adjunto permite leer `Retry-After` únicamente si el navegador
expone ese encabezado. Actualmente no declara `Access-Control-Expose-Headers`:
la interfaz informa el límite 429 sin inventar segundos. Un servidor de staging
que sí lo exponga permite mostrar su valor saneado. Un rechazo CORS puede
aparecer como error de red porque el navegador no entrega el estado HTTP.

El nuevo script se carga antes de los motores y se incorpora a ASSETS.
La caché pasa de v6-95 a **v6-96**, conservando el aislamiento por scope.
No se implementa Vision, procesamiento de imágenes ni transcripción remota v2.
El reconocimiento de voz propio del navegador se conserva.

## Prueba real pendiente: procedimiento

Estas instrucciones no significan que se haya desplegado o probado un servicio.
Requieren un Worker de staging configurado y autorizado previamente.

1. Configurar las credenciales exclusivamente en el servidor del Worker y
   habilitar el origen exacto del frontend, sin ruta. Para GitHub Pages es
   `https://josuepa936-hue.github.io`. Un frontend local requiere autorización
   explícita de su origen en staging.
2. En NOA → IA, elegir Groq o Cloudflare. Introducir la URL HTTPS base de staging,
   sin `/api/chat`, y el token directamente en el campo de contraseña. No pegar
   claves privadas, tokens o capturas de credenciales en conversaciones o Git.
3. Elegir un modelo de ese proveedor y pulsar **Probar conexión** una vez.
   Comprobar proveedor solicitado/reportado, modelo solicitado/reportado y
   coincidencia. Cloudflare puede dar texto con modelo no verificado.
4. Si hay 401, corregir el token; 403/error CORS, revisar el origen; 400, revisar
   el contrato/modelo; 429, esperar; 502/503, revisar el servicio. No probar otro
   proveedor de forma implícita ni repetir lotes indefinidamente.
5. En Simulacros elegir procedencia **prueba técnica**, Física de especialidad y
   cinco preguntas. Iniciar una única generación. Debe aceptar cinco antes de
   reemplazar una sesión. Judge es evaluación interna, no validación científica
   independiente ni confirmación del temario de Física para Medicina UAQ.
6. Responder, finalizar, revisar explicaciones, crédito y clasificación. Recargar
   y comprobar historial, recuperación y respaldo. El intento técnico debe quedar
   excluido de evidencia de dominio y recomendaciones académicas del estudiante.
7. Solo después de este checkpoint utilizar sesiones de estudio declaradas para
   la práctica personal. Los intentos técnicos anteriores siguen siendo técnicos.

Una prueba de conexión consume una solicitud; un lote válido sin reposiciones
suele requerir cinco generaciones y cinco evaluaciones. Las reposiciones pueden
aumentar ese número. En las pruebas de esta rama todas las respuestas de IA son
simuladas, con datos aislados y sin gasto de inferencia real.

## Recuperación y correcciones finales

Se recuperaron todos los cambios locales: index, transporte nuevo, SW y los dos
archivos de pruebas. No se reconstruyó código desde main ni se descartaron archivos.
El informe que había quedado sin consultar también se recuperó: 31 aprobadas y
2 fallidas. La repetición produjo el mismo resultado.

Los dos fallos exigían indebidamente `question.subject` en el nivel superior.
El contrato académico existente permite `blueprintSlot.subject`. La prueba
ahora valida las dos rutas y, además, la materia del tema real en db. No se
cambiaron los motores para acomodar el test. Los formatos siguen siendo los
seleccionados por el Blueprint, sin forzar cuatro formatos en cada lote de Física.

Se añadieron comprobaciones de recibos distintos de Generator y Judge durante
la generación concurrente y del recurso nuevo en la caché offline real.
Dos defectos adicionales se reprodujeron antes de corregirse:

- El 502 de discrepancia del candidato se confundía con indisponibilidad genérica
  (dos reproducciones fallidas, una por proveedor). Se reconocen solo sus mensajes
  fijos; la interfaz no inventa un modelo rechazado ni muestra errores arbitrarios.
- La fila flex estrechaba los selectores de modelo a 320, 390 y 1365 px (tres
  reproducciones fallidas). Los grupos usan ahora el grid original de `.field`.
  La comprobación exige ancho completo y cubre Groq y Cloudflare en cada tamaño.

No se eliminaron ni desactivaron pruebas. Los fallos previos se documentan;
no se suman sus ejecuciones a las pruebas distintas aprobadas.

## Archivos

- `excoba_patch_ai_bridge_v2.js`
- `index.html`
- `sw.js`
- `tests/ai-bridge-v2-fixtures.cjs`
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

Los cambios de versión en suites existentes actualizan la expectativa del
Service Worker a v6-96. No se incorporan los adjuntos del servidor a producción.

## Validación final ejecutada

**294 pruebas distintas aprobadas: 36 específicas + 258 regresiones.**
Cero fallidas, cero omitidas. Todas en Chromium con almacenamiento aislado.
Los servicios y las respuestas de IA son simulados. No hubo inferencias reales.
No se ejecutó la suite completa del repositorio.

| Suite | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| `ai-bridge-v2.spec.cjs` | 36 | 0 | 0 |
| `backup-checkpoint-atomicity.spec.cjs` | 26 | 0 | 0 |
| `exam-45-ui.spec.cjs` | 22 | 0 | 0 |
| `generator-ui.spec.cjs` | 21 | 0 | 0 |
| `judge-academic.spec.cjs` | 26 | 0 | 0 |
| `physics-compatibility.spec.cjs` | 3 | 0 | 0 |
| `physics-preparation.spec.cjs` | 18 | 0 | 0 |
| `prepilot-start-contract.spec.cjs` | 71 | 0 | 0 |
| `question-memory-integration.spec.cjs` | 32 | 0 | 0 |
| `timed-exam.spec.cjs` | 39 | 0 | 0 |

Después del último cambio visual (flex → grid) se ejecutaron de nuevo las
36 específicas y las 21 del generador: **57/57**. Esas 21 ya están incluidas en
las 258 regresiones y no se contabilizan por duplicado. Las otras regresiones
preceden únicamente a ese ajuste de presentación del selector de IA.

Las pruebas comprueban preferencias y modelos, token y enrutamiento, identidad
por solicitud, concurrencia Generator/Judge, 400/401/403/429/502/503, rechazo de
respuestas inválidas, preservación del examen, Física de cinco preguntas,
créditos, cuatro formatos compatibles, recuperación, respaldos, cierre v26 y
simulacros de 45/180. Se verificaron Groq y Cloudflare en 320/390/1365 px y el
nuevo recurso en una caché offline real v6-96. Los Judges del software son reales
en esas pruebas, pero sus respuestas de IA se simulan: no demuestran evaluación
científica ni disponibilidad real de los proveedores.

La revisión del diff, el escaneo de patrones de credenciales, la sintaxis de los
scripts modificados y el JavaScript inline, y `git diff --check` fueron correctos.
Los fixtures contienen solo un token ficticio, explícitamente identificado.
No se modificaron Judge, Calibrator, scoring ni Blueprint.

Estado: **listo para revisión del frontend**. Pendiente el checkpoint real de
staging descrito arriba; no se considera completada la integración operativa
con Groq o Cloudflare por el resultado de mocks.
