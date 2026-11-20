# NOA — complemento opcional «course_only» (rama de prueba)

## Objetivo
Permitir que un contenido de **Secundaria · Ciencias sociales** que queda fuera de los subtemas oficiales, como Prehistoria en Historia 1A, se use como **material complementario** sin atribuirle códigos EXCOBA no demostrados. Los materiales de Historia y Geografía con correspondencia curricular mantienen sus códigos mientras su protección esté desactivada.

## Principio de no alteración
- `main` no se modifica. El complemento solo existe en esta rama de prueba.
- Ninguna función del Source Analyzer, Blueprint, Generator, Judge, bancos de preguntas o evaluaciones fue reemplazada en sus archivos.
- El complemento se carga después de Source Engine v6 y se incluye en el precaché PWA `v6-101`.
- El análisis original de cada fuente (incluyendo `related` y sus códigos) NO se modifica en `db.courseSources`.
- Se calcula una **vista efectiva** de la fuente para Source Blueprint cuando el usuario activa la protección: `course_only`, sin `syllabus_links` ni `concepts[].syllabus_codes`.
- Solo se habilita en `EXCOBA Secundaria · Ciencias sociales`. El Banco del curso oculta el control para otras materias y la API ignora sus marcas anteriores sin modificar los datos guardados.
- No altera el perfil **Simulacro oficial**; los materiales del curso solo son elegibles en perfiles con cupo `course`.

## Uso en la rama de prueba
1. En **Crear material desde el temario**, seleccionar **Secundaria · Ciencias sociales**.
2. Ir al **Banco del curso** y localizar **Historia 1A**; debe tener el análisis terminado.
3. Pulsar **Usar solo como material complementario** debajo de esa fuente.
4. Aparecerá **Alcance efectivo para generar: course_only, sin códigos oficiales**. Es normal que el cuadro del Source Analyzer siga mostrando el análisis original: **no ha sido editado**.
5. Con **Curso + EXCOBA**, generar un lote pequeño y comprobar la procedencia del reactivo. No afirmar que es temario oficial.
6. Si se quiere volver al comportamiento anterior, pulsar **Quitar protección complementaria**.

El control es **optativo, por fuente y reversible**. No clasifica automáticamente toda la Historia antigua: el alumno debe confirmar cuáles partes no se encuentran en el temario.

## Persistencia y límites
- La elección se guarda en una clave separada de `localStorage` para el mismo navegador y ruta de NOA; no modifica los datos del curso.
- **La preferencia queda fuera del respaldo académico estándar de NOA**. En un navegador nuevo hay que volver a marcar las fuentes.
- La primera instalación y la actualización necesitan descargar la versión con conexión. Una vez activado `v6-101`, el Banco del curso permite consultar y cambiar la protección sin conexión. La generación con IA sigue necesitando acceso al proveedor configurado.
- Las vistas del analizador siguen mostrando sus resultados originales; el texto añadido debajo explica el alcance efectivo. No se está cambiando la salida ni el modelo del analizador.
- Los primeros 6.000 caracteres de cada fuente siguen siendo el límite de contexto existente del generador; este complemento no lo modifica.
- Los exámenes ya guardados y los cuestionarios locales no se reescriben retroactivamente.

## Comprobaciones
```bash
node tests/course-only-addon.unit.cjs
npm test -- --workers=4
```

## Primera auditoría del PR #27

La revisión de partida es `424f6c56d710c33aa527323eceda6fb3bb0a7c87`, sobre
`main` en `2b8a620ae4c09fa12299cc69a32a99a004a57a82`. Se revisaron el
complemento, Source Analyzer v6, Blueprint v8, Generator y Judge v9, Batch
v10, Generador inteligente v24, `index.html` y las pruebas unitarias. Para
seguir la procedencia hasta el intento y la carga offline también se
inspeccionaron Mixed Exam v13, memoria v25.2, normalización académica v27,
preparación de Física y `sw.js`.

El complemento intercepta la API pública de lectura de fuentes. El Banco del
curso y Source Analyzer mantienen su acceso a los análisis originales. El
perfil oficial reserva todos sus slots a la fuente oficial. Los perfiles con
cupo de curso pueden consumir la vista complementaria de las fuentes marcadas.

La vista efectiva inicial compartía `evaluable_objectives` y otras referencias
anidadas con la fuente original. Una prueba unitaria reprodujo la mutación del
objetivo original al editar la vista. `effectiveSource()` ahora copia la
fuente marcada antes de proyectar la clasificación y quitar los códigos. La
API devuelve las fuentes sin marcar como antes. La corrección queda dentro
del complemento y no añade dependencias.

### Bloqueos detectados en la revisión de partida

1. **Carga de PWA.** `index.html` incluye el complemento, pero `sw.js` no lo
   incluye en `ASSETS` y conserva `v6-100`. En una instalación limpia, la
   primera visita carga el archivo por red antes de que el Service Worker
   controle la página. Si se recarga offline inmediatamente, el HTML en caché
   pide un script que no se encuentra en la caché. Chromium conserva los
   motores base y no carga el complemento. La corrección mínima es añadir el
   script al precaché, incrementar la versión y comprobar instalación limpia
   y actualización desde el caché anterior. `sw.js` excede el alcance de esta
   auditoría.
2. **Física complementaria.** `ensureTopicsForQuestions()` exige un código
   verificable de la referencia alternativa para cualquier reactivo de
   Física. Un slot `course_only` sin código puede pasar Generator y Judge,
   pero el contrato de inicio rechaza ese reactivo. La corrección propuesta
   necesita autorización en el contrato existente de Física. Se podría
   admitir exclusivamente un slot con materia consistente, fuente `course`,
   clasificación `course_only` y listas de códigos vacías, sin asignar un
   subtema al reactivo. Se mantendría la validación estricta de los demás casos.

En los materiales complementarios falta una atribución curricular por subtema
de forma intencional. Los indicadores que agrupan por el nombre de materia
siguen aplicando las reglas existentes de NOA. La elección del complemento es
local a la ruta del navegador y queda fuera del respaldo académico. El
alumno decide qué materiales marcar después de revisar su relación con el
temario. La corrección no cambia la clasificación producida por el modelo.

### Resultados de la auditoría

| Ejecución | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| Node `tests/course-only-addon.unit.cjs`, final | 5 | 0 | 0 |
| Batería de Chromium con ocho archivos, inicial | 189 | 3 | 0 |
| Chromium `tests/course-only-addon.spec.cjs`, final | 5 | 0 | 0 |
| **Casos distintos de Chromium según su última ejecución** | **191** | **2** | **0** |

La batería amplia incluyó el complemento, correspondencia curricular, Judge,
plan de 45, compatibilidad de Física, generador v24, memoria e inicio de
simulacros. El fallo inicial del caso de Prehistoria en esa batería se debió
a que el ayudante de respuestas esperaba otros IDs para `drag_order`. El
caso final cerró un lote de cinco, con puntuación 5/5. Verificó que el reactivo
del curso conservó el código vacío en la cola y en el intento, el valor nulo
en memoria y cero asignaciones a subtemas oficiales. Otro caso generó un
reactivo de Geografía manteniendo `core` y el código `2.4.1.1`.

Las dos regresiones operativas son los tests offline de `exam-plan.spec.cjs`
y `generator-ui.spec.cjs`. Ambos registraron `net::ERR_FAILED` al recargar.
El caso específico de precaché y el de Física pasan porque comprueban que
los defectos se reproducen. Sus resultados no certifican esas funciones.
Física llegó a un dictamen aceptado con `course_only` y sin código. El inicio
rechazó la pregunta y el estado anterior se conservó. Un dictamen simulado que
intentó adjudicarle un código de Física también fue rechazado por Judge.

El navegador usó los motores reales de NOA y simuló las respuestas del
proveedor de IA. La prueba verificó el flujo, la puntuación y la trazabilidad.
La capacidad de un proveedor real para redactar preguntas de calidad queda
sin verificar. Pasaron las comprobaciones de sintaxis y `git diff --check`.
Los cambios quedaron locales en la rama del PR. Las referencias remotas de
`main` y del PR permanecen en los commits de partida.

## Correcciones autorizadas

El Service Worker agrega el complemento a `ASSETS` y activa `v6-101` en el
mismo ámbito de caché. La instalación descarga los recursos de esa versión
con `cache: 'reload'`. La auditoría reprodujo que el comportamiento anterior
podía guardar HTML antiguo en la caché nueva cuando seguía vigente en la
caché HTTP. Las pruebas de instalación limpia y actualización desde `v6-100`
comprueban la recarga offline, incluso con respuestas HTTP antiguas frescas,
y la conservación del análisis, la marca de Historia y las cachés ajenas.

El complemento aplica el mismo límite por materia al control del Banco,
la API de activación y la vista efectiva consumida por Blueprint. Una marca
guardada para otra materia deja de tener efecto y conserva su registro. Se
prueban las nueve materias fuera del alcance, incluida Física de especialidad.
La práctica de Física mantiene `3.3.1.1` y arranca con el contrato existente.
El perfil oficial asigna únicamente fuentes oficiales aunque haya una
marca activa. Prehistoria se evalúa usando el texto del curso y sin código
oficial, y la fuente de Geografía del caso conserva `2.4.1.1`.

### Fallos reproducidos en la base

| Prueba | Fallos | Evidencia en la copia temporal de `main` |
| --- | ---: | --- |
| `blueprint-compatibility.spec.cjs` | 1 | En `official/5`, la huella recibida corresponde a cero muestras. El fixture espera la huella histórica de cinco muestras. |
| `generator-ux-audit.spec.cjs` | 4 | A 320, 390, 768 y 1365 px el fixture espera 9 materias y encuentra 10 por la inclusión anterior de Física. Estas pruebas se detienen antes de verificar el desbordamiento. |
| `generator-ux-audit.spec.cjs` | 1 | El fixture espera que Tab lleve al botón tras la cantidad. El control de concurrencia ocupa ese lugar. |
| `prepilot-entrypoints.spec.cjs` | 1 | Al retrasar el catálogo, el arranque registra `Cannot read properties of undefined (reading 'itemsFor')`. |

La copia temporal partió de `2b8a620ae4c09fa12299cc69a32a99a004a57a82` y
usó otro puerto local para ejecutar las mismas comprobaciones sin interferir
con la suite de la rama. Los siete casos se conservan con sus aserciones
originales. Un fallo de fixture previo del complemento se resolvió al probar
por API la materia que el Banco del curso no ofrece en su selector. En una
pasada del nuevo caso de actualización, el fixture del Worker antiguo quedó
con una expresión sin cerrar y se agotó el tiempo de instalación. Una vez
corregida la expresión, las dos pruebas de PWA pasaron.

### Validación final de las correcciones

| Ejecución | Aprobadas | Fallidas | Omitidas |
| --- | ---: | ---: | ---: |
| Node, pruebas unitarias del complemento | 6 | 0 | 0 |
| Playwright, suite completa de Chromium con cuatro workers | 967 | 7 | 0 |
| Casos específicos del complemento y PWA dentro de la suite completa | 7 | 0 | 0 |

La suite completa ejecutó 974 casos. Los siete fallos son los reproducidos
en la copia temporal de `main`. Las regresiones offline de plan y generación
que fallaron durante la primera auditoría pasaron con `v6-101`.

Se detuvo una ejecución preliminar tras confirmar el defecto de caché HTTP.
Quedó en 282 aprobadas, 6 fallidas, 3 interrumpidas y 683 sin ejecutar.
El resultado de esa corrida no se suma a la suite definitiva. Las pruebas
del flujo académico usan respuestas simuladas del proveedor de IA con los
motores reales de NOA. Se comprobaron sintaxis y `git diff --check`.

Informe JSON local de la suite final: `/tmp/noa-pr27-complete.json`.
SHA-256: `df0dddaf317c757cffbeb5b2d65d1c345bbca6d15a558ddecf803e1df6127c83`.
