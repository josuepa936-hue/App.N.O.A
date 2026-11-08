# NOA v27.3B fase 3 — Interfaz informativa de repaso

`excoba_patch_v27_study_recommendations_ui.js` presenta el motor de fase 2 en
`#noaStudyPlan`, sección independiente de ancho completo en Simulacros. No añade
un algoritmo académico, recomendaciones persistidas ni acciones de generación.

## Integración

La única fuente de recomendaciones es
`NOA_STUDY_RECOMMENDATIONS_V27.build(db.attempts, {catalog, referenceDate})`.
El catálogo procede de `NOA_ACADEMIC_RESULTS_V27.catalog()` y debe contener
materias y puntos con fuente `verified-static` o `verified-persisted`. Los nombres
de las tarjetas se resuelven por la pareja exacta materia/código en ese catálogo.
La UI no repara el Temario ni infiere materias a partir de textos.

La presentación genera una referencia ISO UTC explícita con la hora exacta.
Solo la clave de caché agrupa por minuto; nunca se trunca la referencia enviada
al motor, evitando excluir como futuros los intentos recién guardados.
Conserva el cálculo en memoria mientras historial, catálogo y minuto no cambien.
Los filtros actúan sobre esa proyección; no vuelven a ejecutar el motor. El orden
predeterminado conserva el orden devuelto por el motor. La opción alfabética solo
ordena una copia para presentar materias/subtemas; no cambia prioridades.

El módulo se carga después del motor y espera `DOMContentLoaded`, respetando la
inicialización de v4/v5. Si falta catálogo o motor, no calcula clasificaciones
provisionales. Usa un único temporizador de reintento con espera creciente de
250 ms hasta 10 s, cancelado cuando los módulos están disponibles.

Se encadena el punto existente `renderExamStats()`; sus llamadas desde guardado,
cierre y restauración actualizan el panel. No se añaden listeners de almacenamiento
ni intervalos permanentes de recálculo. `Actualizar plan` permite actualizar la
referencia temporal bajo demanda; no se actualizan vencimientos en segundo plano.
La API de presentación expone `refresh()` y `state()` (resumen independiente).

## Presentación y seguridad

- Las cuatro categorías y las fechas proceden del motor. La suficiencia expresa
  sus umbrales experimentales, no certificación de dominio ni frecuencia EXCOBA.
- Se muestran créditos, diversidad de reactivos/intentos, errores, parciales,
  cobertura temporal, razones y práctica sugerida. Solo se redondea la vista a
  cuatro decimales; no se modifican los créditos del motor ni los originales.
- Fechas ausentes se muestran como «Sin fecha verificable». Las fechas verificadas
  se presentan en la zona horaria del navegador, con la referencia visible.
- Los estados vacíos distinguen historial, declaración, evidencia, disponibilidad
  de catálogo y filtros. Técnicos/desconocidos siguen excluidos por el motor.
- Contenido dinámico mediante `textContent`; controles etiquetados, foco visible,
  prioridad textual y detalles nativos accesibles. Una columna en móvil y varias
  según el ancho disponible, sin librerías nuevas.
- Renderizar/filtrar no escribe `db`, localStorage, puntuación ni Calibrator.
  El panel no inicia sesiones, genera preguntas, crea notificaciones ni flashcards.

## Verificación y límites

`tests/study-recommendations-ui.spec.cjs` utiliza Chromium, historial sintético,
reloj fijo, catálogo real y red restringida a recursos estáticos locales. Incluye
cuatro prioridades, filtros, carga tardía, créditos parciales, procedencia, ausencia
de escrituras, restauración, teclado, capturas, cierres v26 de 5/10/45 reactivos y
recarga offline con Service Worker real. Esas pruebas no demuestran aprendizaje
real, calidad científica del contenido ni uso en dispositivos físicos.

Las recomendaciones dependen de las declaraciones e identidades locales y de la
admisibilidad conservadora del motor existente. No se reconstruye evidencia
histórica ausente. La actualización del tiempo es por interacción o por el punto
de actualización existente, con resolución de un minuto. Esta fase no modifica
los contratos académicos, el esquema persistente ni la ruta de guardado.

El módulo se incluye en ASSETS y la caché cambia de v6-85 a v6-86, conservando
el aislamiento por ruta de la aplicación. No se añaden dependencias.
