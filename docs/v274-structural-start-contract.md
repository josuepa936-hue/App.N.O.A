# PR #24 — Interpretación e inicio mediante contratos estructurales

Base:2579beae6b5728f1eb1b73fece5384efed15b8e0.
Rama existente:feature/noa-v274-prepilot-critical. No se modifica main.

## Cuatro causas raíz

1. Se reconocía un prefijo numérico y se ignoraba el resto de la expresión:
   «preguntas cuarenta y cinco y pico» se aceptaba como45.
2. La comprobación del residuo desconocido dependía de la palabra EXCOBA.
   «examen de Biología de veintipico» se consideraba sin cantidad y activaba10.
3. La extracción podía saltar un signo/símbolo desconocido y reconocer su sufijo
   positivo: ⁻180 se convertía en180. La lista de reemplazos no resolvía esa causa.
4. El título de una sesión mixta podía conservarse como etiqueta principal después
   de validar solo una modalidad parcial. completo180 evitaba los límites de palabra.

Las siete reproducciones automatizadas fallaron antes de cambiar el producto.
La corrección no consiste en añadir esas frases a una lista de excepciones.

## Contrato de interpretación

parseExcobaTrainingCount(raw, defaultCount, context) es puro y no lee db ni reloj.
context.subjectNames contiene nombres/alias reales suministrados por el adaptador
de lectura examQuantityContext. No se inventan materias ni identificadores.

| kind | Significado | valid | count |
|---|---|---|---|
|exact|Cantidad exacta y admitida|true|Cantidad reconocida|
|unsupported|Entero no admitido, negativo o modalidad no disponible|false|Ausente|
|ambiguous|Aproximación, contradicción o expresión parcialmente consumida|false|Ausente|
|uninterpretable|Cantidad presente o sintaxis no interpretable|false|Ausente|
|absent|Ausencia auténtica tras consumir estructura, destino y contexto|true|Predeterminado explícito|

Se conserva quantityState para consumidores anteriores:recognized,unrecognized,
absent. source sigue distinguiendo explicit,abbreviated,default. Un rechazo nunca
devuelve un count utilizable. reason permite distinguir contradicción, signo,
residuo no consumido, contexto inválido y modo de ruta no disponible.

## Gramática finita y consumo completo

El lexer conserva todos los tokens, incluidos signos, símbolos y caracteres no
reconocidos. Solo se normalizan mayúsculas, acentos conocidos, espacios admitidos
y signos negativos definidos. Los demás símbolos o marcas no se descartan para
extraer un sufijo válido. Ejemplos:±180,180※ y caracteres de ancho cero se rechazan.

Esquema simplificado:

```text
Solicitud = PrefijoComando [DestinoRegistrado] [CláusulasCantidad] [Contextos]
Cantidad  = [Signo] (EnteroDecimal | EnteroEspañol)
Cláusula  = Cantidad Unidad | Unidad [":" | "=" | "de"] Cantidad
Unidad    = pregunta(s) | reactivo(s)
```

Los enteros españoles tienen una gramática finita de unidades, decenas y centenas.
Las cantidades admitidas siguen siendo exclusivamente5/10/15/20/45/180. No se
implementan aritmética, aproximaciones, intervalos, fracciones, separadores de
millares, notación científica ni interpretación general de lenguaje natural.

Después de empezar una cantidad, las palabras de la estructura del comando no se
eliminan de su interior. «cuarenta por y cinco» no puede convertirse en45. Los
nombres del catálogo se enlazan solo en posiciones de destino, no entre palabras
numéricas. Tampoco pueden ocultar un signo o una unidad completa como si fueran
un nombre de materia.

Las cláusulas múltiples deben consumir todos sus tokens y expresar la misma
cantidad. «180 preguntas y ciento ochenta reactivos» es consistente;
«180 preguntas y45 reactivos» no lo es. Las conjunciones colgantes se rechazan.
Se conservan las combinaciones de ambas direcciones, también «preguntas cinco
y cinco reactivos». Una separación en dos cantidades solo es válida entre dos
unidades y cuando existe una única partición completa; no se recortan prefijos.

Años, fechas, versiones y números de sesión se reconocen como campos completos,
con sus introductores. No se retiran como contexto si están vinculados a una
unidad de cantidad de forma ambigua. No se inventan fechas ni se guardan nuevas
fechas a partir de esos campos. Las fechas son contexto léxico, no un calendario
ni una afirmación de validez de eventos.
Los intervalos originales de los campos consumidos se conservan para impedir
que una versión o fecha entre «cuarenta» e «y cinco» una artificialmente45.

El predeterminado solo aparece al no quedar cantidades, unidades incompletas,
palabras desconocidas ni residuos. Funciona igual dentro y fuera de EXCOBA. Los
nombres registrados permiten distinguir «examen de Historia» de una cantidad
desconocida posterior; no se usa una coincidencia difusa para declarar ausencia.

## Rutas y límites existentes

readExamCommandQuantity aplica la decisión pura antes de modificar actividad,
guardar, generar, consumir procedencia o reemplazar la sesión. Lo reutilizan
executeCommand, v3 y el handler EXCOBA; el wrapper del Temario delega al handler.
No se modifica excoba_master.js ni sus datos académicos.

La capacidad de la ruta antigua por materia se consulta al clasificador original
de v3, ahora expuesto como classifyExamCommandSubject. No se duplica su heurística
ni se cambian sus límites. Un45/180 por esa ruta requiere la modalidad EXCOBA
específica; una materia genérica registrada conserva las capacidades anteriores.
Las API por materia mantienen sus guardas de enteros numéricos antes de IA o banco.
Las API públicas antiguas de creación/generación v3 también exigen un number
entero de1 a30: no convierten cadenas, null o NaN en otro número ni recortan31
a30. Sus límites y el algoritmo para cantidades numéricas válidas no cambian.
Las palabras/cifras de Comandos se convierten antes en count mediante el parser;
los predeterminados de las API solo corresponden a un argumento omitido.

La selección canónica EXCOBA puede dar contexto a una orden abreviada de práctica,
pero el alcance ya no depende de reconocer de antemano una de las seis cantidades.
Una cantidad aproximada en ese contexto se rechaza en lugar de enviarse al Coach.
Los comandos de guía que no piden examen siguen su ruta existente.

## Contrato de inicio y presentación

resolveExamStart valida version,mode,requestedCount,availableCount,completion y
el permiso explícito de faltante antes de cualquier cambio de sesión. Los completos
requieren cantidad exacta, formato compatible, IDs/contenidos únicos y distribución
canónica.180 mantiene nueve materias de20 y40/80/60. No se modifica scoring.

El tokenizador de títulos distingue completo180 igual que completo 180 con espacios
entre palabra y número. Sus números/afirmaciones solo pueden vetar una llamada
heredada incoherente; nunca autorizan una modalidad. Los títulos heredados que
anuncian180 sin contrato adecuado se rechazan aunque la cola tenga180.

La etiqueta principal, primaryLabel, siempre se deriva del modo validado y de la
cantidad real. Esto se aplica a beginExamQueue y NOA_MIXED_EXAM.start. Nunca se
conserva un título libre como encabezado principal del examen mixto.

Un nombre neutral sin afirmaciones numéricas o de modalidad puede mostrarse como
texto secundario «Nombre del simulacro», usando textContent. No participa en la
validación ni en la puntuación. Nombres no verificables no se muestran. No se
añaden listeners ni paneles repetidos; el texto largo se ajusta al ancho móvil.

Los faltantes parciales permitidos se informan en label/toast, por ejemplo8 de10
solicitados; el encabezado principal solo anuncia8. No se intenta reconstruir la
modalidad ni el total solicitado a partir del texto de un encabezado.

## Recuperación y respaldo

Para conservar la intención sin inferirla desde títulos, las sesiones nuevas
incluyen un campo opcional startContract en el checkpoint existente. Se escribe
con el guardado de v26 ya existente, sin un segundo guardado ni temporizador.
Contiene version,mode,requestedCount,availableCount,completion,allowShortfall y
un nombre secundario seguro. No se añade a db.attempts ni altera el esquema de
resultados, créditos, fechas, procedencia o historial académico.

La sesión mantiene el contrato en un WeakMap ligado a su array de respuestas.
Las capturas son copias sin referencias mutables compartidas. Al recuperar se
validan cantidades, modo, renderer, nombre y cola antes de cambiar el runtime.
El nombre secundario tampoco puede cambiar el modo recuperado.

No hay migración ni barrido de históricos. Un checkpoint sin startContract sigue
sin ese campo al recuperarse. La compatibilidad180 valida íntegramente la cola;
una cola histórica45 canónica verificada puede recuperarse como práctica descriptiva
sin inferir un modo completo desde su título. Contradicciones o datos inválidos
se rechazan manteniendo el checkpoint original, respuestas e historial.

La validación de respaldo recibe explícitamente el catálogo del respaldo propuesto,
no el catálogo de la sesión que está abierta. Así puede rechazar un contrato
incompatible antes de reemplazar datos, y aceptar un respaldo válido con otros IDs.
En memoria v25.2 solo cambia ese argumento de validación; no la deduplicación.

## Archivos y alcance

- index.html:lexer,gramática,adaptador,política de ruta,contratos y etiqueta secundaria.
- excoba_patch_v3.js:consumidor compartido y exposición del clasificador existente.
- excoba_patch_v13_mixed_exam.js:encabezado derivado y asociación del contrato.
- excoba_patch_v21_exam_navigation.js:captura/validación/recuperación del campo opcional.
- excoba_patch_v25_question_memory.js:un argumento de contexto para validar respaldos.
- sw.js:cachév6-92; se conserva el aislamiento por scope y ASSETS existentes.
- tests/prepilot-quantity-invariants.spec.cjs:reproducciones e invariantes A–E.
- tests/generator-ui.spec.cjs:expectativa del encabezado derivado y nombre secundario;
  conserva la comprobación del nombre original de v24 como metadato visible.
- Otros nueve specs existentes:solo literal esperado de cachév6-91→v6-92.

Esos nueve specs son exam-45-ui,exam-multibatch,exam-plan,
question-diversity-integration,question-memory-integration,question-memory,
results-normalization,timed-exam ytopic-diversity, todos bajo tests/ ycon sufijo
.spec.cjs. No se afirma que se hayan ejecutado completos los archivos que solo
actualizan su literal de caché; la selección exacta figura en los comandos.

No se cambian Judge,Calibrator,scoring,Temario Maestro,recomendaciones ni el límite
de v10. No se añade Física,dependencias,despliegues,otra rama ni Fase2.

## Verificación

Las pruebas usan Chromium,un worker,contextos aislados,reloj controlado y stubs de
IA/red. Las variantes dentro de una prueba de invariantes son aserciones de esa
prueba, no se suman como ejecuciones independientes.

La evidencia completa y los reportes JSON se generan en /tmp/noa-pr24-structural-*.
Las ejecuciones de ampliación se solapan y no se suman.

| Ejecución | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
|Siete reproducciones originales antes de corregir|0|7|0|
|Primera implementación de esas reproducciones|7|0|0|
|Primera batería específica e invariantes|179|0|0|
|Seguimiento de bordes de contexto y rutas|9|0|0|
|Ampliación específica|184|0|0|
|Ampliación con checkpoints|187|0|0|
|Invariantes con respaldo y modos|34|0|0|
|Batería específica ampliada|192|0|0|
|Reproducción adicional de contexto insertado antes de corregir|0|1|0|
|Invariantes con posiciones de contexto|36|0|0|
|Batería de compatibilidad|335|0|0|
|Validación final de todas las cantidades y contratos|195|0|0|

La reproducción adicional comprobó que retirar v27.4 dentro de «cuarenta ... y
cinco» podía unir dos fragmentos y crear45. Se corrigió mediante límites de los
campos/expresiones, no con una frase especial. Se conserva su regresión.

La batería335 se ejecutó con dos workers y cubrió v26,procedencia,manuales,
resultados/créditos parciales,Dashboard,backups,recomendaciones,5/10/45/180,
móvil320/390/768/1365 y Service Worker offline. Tras los últimos ajustes de
composición de cláusulas y guardas de las API antiguas se reejecutaron195 casos
de todas las cantidades,rutas y contratos sobre el código final. Los otros
módulos no cambiaron después de esa batería.

La intersección entre335 y195 es de157 casos. Balance final sin duplicados:
**373 casos distintos aprobados,0 fallidos,0 omitidos**. El archivo
/tmp/noa-pr24-structural-summary.json registra el cálculo por archivo,título y
proyecto. No se suman las baterías intermedias ni ejecuciones de tareas anteriores.

Las invariantes no inflan el número de pruebas con sus variantes internas:

- A:288 decisiones de gramática y42 variaciones Unicode,además de estados y cláusulas.
- B:54 rechazos efectivos por tres rutas con snapshot completo y cero IA.
- C:64 intentos heredados bloqueados,títulos derivados,completos válidos y recuperación.
- D:cinco estados explícitos,ausencia real,contextos y rechazo de valores inválidos en API.
- E:147 despachos exactos/predeterminados por tres rutas y límites por materia coherentes.

Se verificaron pureza,determinismo,contextos congelados,capturas sin alias,
preservación de históricos sin contrato y rechazo de respaldos incompatibles.
La sintaxis de los módulos modificados y los dos scripts inline es válida;
git diff --check correcto. No hubo fallos de fixture ni de infraestructura en
estas ejecuciones de navegador; los FAIL iniciales eran las reproducciones previstas.

Comandos finales reproducibles:

```sh
npx playwright test tests/prepilot-quantity-invariants.spec.cjs tests/prepilot-spanish-quantities.spec.cjs tests/prepilot-start-contract.spec.cjs --workers=2 --reporter=json --output=/tmp/noa-pr24-structural-verified-commands > /tmp/noa-pr24-structural-verified-commands.json
npx playwright test tests/prepilot-spanish-quantities.spec.cjs tests/prepilot-start-contract.spec.cjs tests/timed-exam.spec.cjs tests/study-provenance.spec.cjs tests/exam.spec.cjs tests/pages.spec.cjs tests/prepilot-entrypoints.spec.cjs tests/generator-ui.spec.cjs tests/exam-45-ui.spec.cjs tests/study-recommendations-ui.spec.cjs --workers=2 --reporter=json --output=/tmp/noa-pr24-structural-final-regressions --grep 'prepilot-spanish-quantities.spec.cjs|prepilot-start-contract.spec.cjs|timed-exam.spec.cjs|study-provenance.spec.cjs|exam.spec.cjs|pages.spec.cjs|prepilot-entrypoints.spec.cjs|generator-ui.spec.cjs|v25 genera 45 con plan real|v25 completa 45 posiciones|sin desbordamiento a (320|390|768|1365)px|v25 UI45 se almacena|render y filtros no escriben|restaurar respaldo actualiza|actualización forzada dentro del minuto|panel y datos cargan' > /tmp/noa-pr24-structural-final-regressions.json
```

No se ejecutó toda la suite ni IA real. Los fixtures sintéticos validan reglas
del software, no calidad científica del servicio ni dominio real del estudiante.
No se probaron dispositivos físicos. Las frases fuera de la gramática admitida
requieren reformulación; no se intenta resolver lenguaje libre o aritmética.
