# NOA v27.3B fase 2 — Motor experimental de repaso

API pura, versión 1:

```js
NOA_STUDY_RECOMMENDATIONS_V27.build(attempts, {
  catalog: NOA_ACADEMIC_RESULTS_V27.catalog(),
  referenceDate: '2026-06-20T12:00:00Z',
  policy: {} // ajustes opcionales
});
```

El llamador entrega explícitamente el catálogo canónico verificado del adaptador
v27.2 (referencias v4/v5), nunca un temario persistido sin validar. `source` debe
ser verified-static o verified-persisted. Este marcador es un contrato del
llamador, no una autenticación del catálogo frente a entradas manipuladas.
El motor no lee db, almacenamiento, Calibrator, reloj actual ni red. No añade UI,
calendarios, notificaciones, generación ni escrituras. Usa normalizeHistory27.1
para resolver identidades, créditos, conflictos y copias del mismo intento.

## Evidencia y agrupación

Exige todas las copias declaradas student y excluye un intento si contiene un
veto técnico, incluso en una respuesta. Este filtro es deliberadamente más
conservador que estadísticas históricas por reactivo. Requiere ID de intento,
resumen consistente con créditos normalizados y total verificable. Permite el
aviso inocuo duplicate_answers tras deduplicar; rechaza otros problemas de
interpretación. Cada respuesta debe tener ID de pregunta, crédito conocido,
sección/materia/subtema verificados y una sola asignación. No utiliza preguntas
sin identidad global de reactivo aunque tengan un slot local.

Las omisiones no son errores ni evidencia de dominio; se excluyen del denominador.
La agrupación usa una única pareja materia/subtema y nunca reparte créditos entre
varios temas. La respuesta de un mismo ID en dos intentos reales conserva sus
créditos, pero no aumenta la diversidad de preguntas. IDs diferentes no prueban
que los contenidos sean semánticamente distintos; no se llama a fingerprint,
que es asíncrono y pertenece a memoria. No se reconstruye información ausente.

Por tema se devuelven respuestas, IDs de preguntas e intentos distintos, créditos
exactos y posibles, errores completos, parciales, intentos con errores, fecha
conocida más reciente y cobertura temporal. Los créditos no se redondean.
Historial vacío/sin evidencia devuelve una lista vacía. Un tema observado con
pocos datos recibe evaluar, nunca un diagnóstico de debilidad.

## Política configurable

Valores predeterminados experimentales, no frecuencias oficiales EXCOBA:

- Suficiencia: al menos 4 respuestas, 3 IDs de pregunta y 2 intentos.
- Reforzar: suficiencia, crédito medio <= .6 y al menos 75% de errores completos
  en dos intentos distintos, o 75% de parciales en dos intentos distintos.
- Repasar: suficiencia y crédito medio >= .85.
- Practicar: suficiente pero mixto o en consolidación.
- Evaluar: no cumple algún umbral de suficiencia.

Umbrales: minResponses/minQuestions/minAttempts (enteros positivos), lowCredit y
highCredit (0..1, ordenados), difficultyShare (.5..1). No se denomina dominio a
la suficiencia: solo indica que se cumplen estos mínimos de cobertura.

intervals: evaluar=1, reforzar=1, practicar=3, repasar=7 días. Se admiten enteros
1..30, manteniendo evaluar/reforzar <= practicar <= repasar. Si solo hay un ID
de pregunta, el intervalo efectivo no supera un día, aun con ajustes permisivos.
La propuesta es última práctica + intervalo; no crea eventos. Si ya venció,
due=true conserva la fecha original en lugar de inventar una práctica nueva.

Las fechas ISO requieren zona horaria y calendario válido. Las prácticas futuras
respecto a referenceDate se excluyen. Evidencia sin fecha válida puede contribuir
a los créditos, pero impide una fecha de repaso fiable para ese tema: dueAt/due
son null. lastPracticeAt, si existe, solo representa la última fecha conocida.

Orden explicable: errores en intentos distintos * weights.errors (3) + parciales
en intentos distintos * weights.partials (1) + días de retraso, limitados a 30,
* weights.overdue (1). Pesos configurables 0..100. Sin fecha fiable el componente
de retraso es cero. Empates por IDs de materia y subtema, sin depender de locale.
Esta puntuación ordena acciones, no mide dominio ni aprendizaje causal.

## Salida

version/recommendations/excluded/warnings, y referenceDate/policy cuando hay
catálogo verificado disponible. Cada recomendación
contiene subjectId/subtopicId/sectionId, priority, reasons, evidence, practiceType,
review (experimental, intervalDays, dueAt, due), rank (score y componentes) y
warnings. `excluded` cuenta registros normalizados excluidos, no copias originales.
La salida no comparte referencias mutables con las entradas ni con los defaults.

No se comparan tasas como evidencia causal ni se certifica calidad científica.
El análisis depende de la integridad de IDs y declaraciones locales. Un cambio
de catálogo requiere volver a calcular la proyección. Esta fase no almacena
recomendaciones ni sustituye Judge, Calibrator, resultados o memoria.

Pruebas deterministas: tests/study-recommendations.spec.cjs, con catálogo real,
respuestas sintéticas y referencia fija; sin servicio de IA. Recursos offline
incluidos en ASSETS, caché aislada v6-84.
