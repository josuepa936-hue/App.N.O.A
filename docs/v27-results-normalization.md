# NOA v27, fase 1 — Contrato de normalización 27.1

Esta capa proyecta resultados existentes. No puntúa respuestas, no inicia ni
finaliza exámenes y no constituye una evaluación científica de preguntas ni una
certificación de dominio. No presenta una interfaz nueva ni calcula tendencias.

## API y pureza

`NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(attempt, options)` y
`normalizeHistory(attempts, options)` están disponibles en el navegador. El mismo
archivo admite `require()` para consumidores locales, sin dependencias.

Las entradas son registros JSON originales, no la salida normalizada. Repetir
una operación con los mismos datos devuelve el mismo contenido. Las funciones
no leen `db`, almacenamiento, red, reloj actual, Calibrator ni motores de examen.
No modifican las entradas, aunque estén congeladas. Cada llamada devuelve objetos
nuevos, sin referencias mutables a las entradas. Registrar la API global al cargar
el archivo no escribe ningún dato académico.

Opciones explícitas:

```js
const options = {
  catalog: {
    subjects: NOA_EXCOBA_V4.subjects,
    items: NOA_EXCOBA_MASTER.get().items
  },
  evidenceKind: 'technical_test' // 'student' o 'unknown'
};
const projection = NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(attempt, options);
```

El consumidor entrega un snapshot del catálogo existente; el normalizador no
llama a esas APIs. No se necesita ejecutar Blueprint, Batch ni IA. Sin catálogo
válido no se verifican materias o códigos. No se resuelven históricos desde el
banco actual, nombres similares, posiciones de preguntas o IDs locales de temas.

## Campos y estados

Cada resultado incluye `contractVersion: "27.1"`. Los campos verificables emplean
`{value, state, sources}`. `sources` enumera rutas de procedencia, no credenciales
ni el texto completo del reactivo.

| Estado | Significado |
| --- | --- |
| `known` | Valor válido según el contrato; incluye cero y `false`. |
| `absent` | La propiedad no existe. |
| `unknown` | Se recibió `null`/`undefined` o no hay una atribución única. |
| `invalid` | Tipo, rango, referencia de catálogo o estructura no verificable. |
| `conflict` | Fuentes incompatibles; no se elige una arbitrariamente. |

Los estados distintos de `known` usan `value: null`. No se convierten cadenas,
booleanos o valores ausentes a números. Una cadena vacía no es un identificador
válido; los códigos vacíos heredados se tratan como desconocidos. Los IDs son
cadenas no vacías. Las fechas requieren ISO con zona horaria explícita.

La proyección del intento contiene `attemptId`, `at`, `declaredTotal`,
`reportedScore`, `records`, `duplicatesRemoved`, `completeness` e `issues`.
`reportedScore` conserva el resumen histórico, sin sustituir créditos por
reactivo ni inventar respuestas para reconciliarlo. `completeness` describe
cobertura estructural de respuestas, no calidad científica o dominio.

Cada registro contiene:

| Campo | Contrato |
| --- | --- |
| `attemptId`, `questionId`, `planSlotId`, `topicId` | Identidades recibidas. `topicId` no se convierte automáticamente a código oficial. |
| `key` | Identidad compuesta del intento y pregunta —o slot si falta pregunta—; `null` cuando no puede construirse. |
| `sourceIndexes` | Posiciones de los registros originales, sin presentarlas como IDs inventados. |
| `classification` | Sección, materia, subtema, códigos candidatos, etiquetas y problemas de resolución. |
| `format` | Uno de los cuatro tipos actuales cuando se declara; no se presume `single_select` si falta. |
| `status` | `correct`, `incorrect`, `partial`, `omitted` o `unknown`. El último evita clasificar históricos insuficientes. |
| `credit`, `maxCredit` | Crédito obtenido y unidad máxima de NOA: un reactivo equivale a un crédito máximo. |
| `finishReason`, `omissionReason`, `omitted` | Motivo de cierre declarado, condición y motivo de omisión. |
| `at` | Fecha del intento; nunca se reemplaza por la fecha de normalización. |
| `exposure` | Exposición analítica al intento y dato independiente de presentación visual. |
| `evidenceKind`, `domainEligible`, `knowledgeError` | Procedencia declarada y límites para usar el resultado como evidencia académica. |
| `allocations` | A lo sumo una atribución de subtema con `share: 1`; ninguna cuando hay ambigüedad. |
| `quality` | Cobertura de clasificación, problemas y posibilidad de deduplicación. |

`quality.classification = verified` solo indica consistencia con el catálogo;
no significa validación oficial de la pregunta o del nivel del estudiante.

## Crédito, omisiones y procedencia

1. `omitted === true` prevalece: cero crédito incluso si `ok` o `scoreFraction`
   lo contradicen; se registra una advertencia. Nunca es un error de conocimiento.
2. `scoreFraction` finito entre cero y uno conserva su valor exacto. No se
   redondea ni se modifica `examScore`. Si falta, un `ok` booleano permite el
   fallback histórico 1/0. Un crédito explícitamente nulo o inválido no se rescata
   con `ok`.
3. El estado es correcto con 1, parcial entre 0 y 1 e incorrecto con 0, salvo
   omisión o condición explícitamente desconocida/inválida. Los datos insuficientes
   permanecen `unknown`; no se convierten a error.
4. Conforme a la regla de v27, una omisión cuenta como exposición **analítica al
   intento** (`countsAsExposure: true`). `exposure.presented` conserva por separado
   el booleano v26, incluido `false`: exposición analítica no implica que se haya
   mostrado o leído la pregunta. Esta proyección no alimenta ni cambia la memoria
   v25.2, que sigue excluyendo de su historial visual las omisiones nunca presentadas.
5. Solo la opción explícita `evidenceKind: 'student'` habilita resultados conocidos
   no omitidos para futuras métricas de dominio. Por defecto la procedencia es
   `unknown`. Los marcadores `evidenceKind: 'technical_test'` o `technicalTest: true`
   en intento o respuesta vetan esa habilitación, incluso con opción `student`.
   Desde v27.3B, una marca explícita `unknown` o inválida también veta esa opción;
   las marcas técnicas por respuesta conservan su exclusión individual histórica.
   No se deduce procedencia por patrones de ID ni por una buena puntuación de Judge.
6. `domainEligible` no afirma dominio: un consumidor futuro deberá exigir además
   clasificación válida para atribuir resultados a una materia o subtema. Las
   pruebas técnicas conservan sus créditos para verificar software, sin aportar
   evidencia de aprendizaje real. No hay forma fiable de detectar fixtures antiguos
   sin marcadores: el consumidor debe declarar la procedencia honestamente.

## Clasificación y prevención de duplicados

Las materias se contrastan con los valores existentes de v4; las secciones
`primary`, `secondary`, `medicine` proceden de sus prefijos documentados y de los
IDs del plan v25. Los códigos se contrastan con los ítems reales del Temario.
Se conservan las dimensiones válidas aunque otra quede «Sin clasificar».

Un código único puede resolver materia y sección. Nombres explícitos y Blueprint
contradictorios no se resuelven por preferencia. Los códigos inexistentes, ambiguos
o de materias en conflicto no reciben atribución de subtema. Los códigos múltiples
se conservan como candidatos, sin asignar crédito a cada uno ni elegir el primero.
Solo un subtema único y validado recibe una asignación completa.

Dentro de un intento se conectan los aliases de pregunta/slot y se proyecta
una sola unidad. La combinación se realiza por campos normalizados: diferencias
descriptivas no invalidan créditos. Créditos y omisiones coincidentes se conservan;
un conflicto exclusivo de `presented` solo afecta a la presentación. Créditos,
identidades o condiciones de omisión incompatibles dejan el resultado académico
como desconocido. La clasificación se combina independientemente y no elige una
materia o subtema contradictorio. Un veto técnico de cualquier copia se conserva.
`sourceIndexes` y las fuentes de cada campo identifican las copias originales.

El historial deduplica IDs de intento. `reportedScore`, `declaredTotal` y `at` se
combinan por separado: valores coincidentes se conservan y valores incompatibles
quedan como `conflict`, sin elegir la primera copia. Las respuestas se normalizan
y deduplican igualmente; no se inventan respuestas para reconciliar resúmenes.
`sourceAttemptIndexes` identifica las copias de intento; en respuestas combinadas,
`provenance` contiene pares `{attemptIndex, answerIndex}` para localizar sus fuentes.
Un intento con conflictos en resúmenes queda incompleto, aunque conserve hechos
coincidentes por reactivo. Intentos con IDs distintos siguen siendo diferentes.

`groupId` solo admite cadenas primitivas del enum de secciones. Arrays y objetos
no se convierten a claves válidas. Sin evidencia derivable del catálogo, una
propiedad inexistente permanece `absent`, mientras que `groupId: null` permanece
`unknown`, con su fuente. Ninguna proyección comparte referencias mutables de entrada.

Sin identidades no se deduplica por contenido ni se inventan IDs: se informa que
la deduplicación es no verificable. El consumidor no debe sumar esos registros
entre importaciones como si hubiera una garantía de identidad. Al combinar copias
de un mismo intento con respuestas sin IDs, los créditos no verificables quedan
como desconocidos y no aportan dominio; las omisiones conservan cero créditos.

## Compatibilidad y límites de esta fase

- No cambia el esquema persistente ni añade colecciones a `db` o al respaldo.
- No modifica v23, v26, scoring, Judge, Calibrator, generación, plan de 45,
  memoria, recuperación ni los datos originales.
- No migra, rellena ni elimina históricos. Un intento con solo resumen mantiene
  su puntuación declarada y una lista de respuestas vacía e incompleta.
- No reconstruye formatos o respuestas a partir de selecciones, texto o el banco.
- No interpreta dificultad estimada como dificultad oficialmente calibrada.
- La carga del módulo es posterior a los módulos existentes; el SW incluye el
  recurso con caché `v6-77`, conservando el aislamiento por ámbito.
- No hay gráficos, tendencias, recomendaciones, comparaciones ni nueva interfaz.

Las pruebas específicas usan catálogo real y datos sintéticos, entradas congeladas,
guardas de almacenamiento, un cierre real de v26 con reloj virtual y recarga offline.
Los resultados ejecutados se documentan en el informe de entrega, separados de
las pruebas que no se hayan ejecutado.
