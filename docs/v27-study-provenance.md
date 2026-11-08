# NOA v27.3B — Fase 1: procedencia declarada

## Contrato de procedencia, versión 1

Los nuevos intentos y checkpoints activos incorporan `evidenceKind`:

| Valor | Significado |
|---|---|
| `student` | El usuario eligió explícitamente iniciar una sesión de estudio. |
| `technical_test` | Prueba técnica declarada o marcada explícitamente en la sesión/reactivos. |
| `unknown` | No existe declaración verificable. No aporta evidencia de dominio. |

Un resultado técnico también conserva `technicalTest: true`, compatible con los
vetos existentes. Esa marca siempre prevalece sobre `student`, incluso cuando
aparece solo en una respuesta o reactivo. Los campos no certifican identidad,
calidad científica, aprendizaje ni dominio. No se infiere procedencia de IDs,
nombres, fechas, dificultad, puntuaciones, Judge o el servicio de generación.

## Captura y ciclo de vida

El selector «Procedencia del próximo simulacro» comienza en `unknown`, no se
guarda como preferencia y se consume una sola vez al aceptar una nueva cola.
Un intento de inicio fallido conserva la selección pendiente. Cambiar el selector
durante un examen solo declara el próximo; no modifica la sesión activa.
La generación v24/v25 sigue usando `NOA_MIXED_EXAM.start()`, que comparte esta
captura con las rutas manuales `startExam()` y `beginExamQueue()`.

`NOA_STUDY_PROVENANCE_V27` vincula la declaración al array de respuestas mediante
un WeakMap. `begin()` es idempotente para esa sesión; `capture()` devuelve campos
nuevos, sin referencias de entrada. Un veto técnico observado es monotónico.
`restore()` solo aplica el checkpoint durante la recuperación existente; nunca
consume la selección actual de la UI. Se restaura antes de cualquier cierre por
vencimiento. No mantiene claves nuevas de almacenamiento ni temporizadores.

La persistencia v21 incluye los campos en `activeExam` versión 1 de forma aditiva;
su validador acepta la ausencia para checkpoints anteriores y exige tipos/valores
válidos cuando están presentes. `commitCompletedExam()` captura la procedencia
sincrónicamente junto al resultado, antes de operaciones asíncronas. Conserva
el mutex por respuestas y la identidad de cierre de v26.

## Compatibilidad y conflictos

- No se migran ni etiquetan intentos antiguos. Ausencia o valores inválidos se
  muestran como desconocidos. Un checkpoint antiguo no hereda la selección UI.
- Los respaldos conservan su formato. Antes de escribir, el módulo de memoria
  comprueba la procedencia del checkpoint frente a todos los resultados del
  mismo ID. Un conflicto devuelve `provenance_conflict` sin modificar los datos
  locales ni el respaldo. La recuperación también conserva ambos registros si
  ya existe un conflicto local; no descarta el checkpoint por el ID solamente.
- Un resultado durable anterior sin `evidenceKind` puede reconciliarse con una
  sesión desconocida sin reescribir su JSON. Una nueva declaración de estudio
  no se considera equivalente a la ausencia de procedencia en ese resultado.
  `technicalTest: true` sin `evidenceKind` y `evidenceKind: 'technical_test'`
  representan el mismo veto. `reconcile()` compara esa semántica antes de la
  comparación exacta de los demás datos; fechas, respuestas y créditos deben
  coincidir y se reutiliza el JSON duradero. Un checkpoint redundante compatible
  se consume con éxito, sin crear un segundo intento.
- En v27.1 una procedencia explícita desconocida/inválida veta la opción
  `evidenceKind: 'student'`, también al deduplicar copias. Los históricos sin
  campo conservan el contrato anterior: solo un contexto explícito del llamador
  puede habilitar evidencia en la normalización individual; panel y evolución
  los mantienen desconocidos. Combinar copias exige declaraciones coherentes.
  Al combinar copias, la procedencia se resuelve entre todas ellas, incluso si
  una carece de respuestas. Un veto técnico del intento excluye todo el conjunto;
  una copia desconocida impide elevarlo a estudiante. `attemptProvenance` en la
  proyección conserva las declaraciones, estados y rutas de origen de cada copia.
  Esta información no se escribe en los originales ni cambia los créditos.
- Las sesiones nuevas con un veto técnico reciben la marca en todo el intento,
  que normalización y panel ya excluyen del dominio. Los históricos mixtos sin
  marca técnica global conservan su exclusión individual por respuesta;
  v27.3A mantiene su veto global de comparación. No cambian los créditos,
  omisiones ni puntuación. La procedencia desconocida sigue siendo descriptiva.

## Límites

La declaración es local y voluntaria, no una autenticación ni una protección
contra manipulación externa del almacenamiento. No atribuye procedencia al
contenido de las preguntas. No registra retrospectivamente configuración temporal
ni habilita comparaciones con condiciones insuficientes. No añade recomendaciones,
ni cambia Judge, Calibrator, puntuación o distribución de preguntas.

Los recursos se incluyen en ASSETS, con caché aislada v6-83.
