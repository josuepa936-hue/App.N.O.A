# NOA — complemento opcional «course_only» (rama de prueba)

## Objetivo
Permitir que un contenido del Banco del curso que NO aparece en los subtemas oficiales (por ejemplo, Historia 1A: Prehistoria) se use como **material complementario** sin atribuirle códigos EXCOBA no demostrados.

## Principio de no alteración
- `main` no se modifica. El complemento solo existe en esta rama de prueba.
- Ninguna función del Source Analyzer, Blueprint, Generator, Judge, bancos de preguntas o evaluaciones fue reemplazada en sus archivos.
- Solo se añadió un archivo JavaScript y una etiqueta `<script>` para cargarlo después de Source Engine v6.
- El análisis original de cada fuente (incluyendo `related` y sus códigos) NO se modifica en `db.courseSources`.
- Se calcula una **vista efectiva** de la fuente para Source Blueprint cuando el usuario activa la protección: `course_only`, sin `syllabus_links` ni `concepts[].syllabus_codes`.
- No realiza cambios en materiales de otras materias o fuentes no marcadas.
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
- **No forma parte del respaldo académico estándar de NOA**. Tras cambiar de navegador/restaurar un respaldo hay que volver a marcar fuentes.
- Las vistas del analizador siguen mostrando sus resultados originales; el texto añadido debajo explica el alcance efectivo. No se está cambiando la salida ni el modelo del analizador.
- Los primeros 6.000 caracteres de cada fuente siguen siendo el límite de contexto existente del generador; este complemento no lo modifica.
- Los exámenes ya guardados y los cuestionarios locales no se reescriben retroactivamente.

## Comprobaciones
```bash
node --test tests/course-only-addon.unit.cjs
```
Tres pruebas unitarias: fuente marcada sin mutar datos almacenados ni otra fuente, persistencia/reversibilidad, y fallos de almacenamiento. Las pruebas pasaron en Node.js 22 durante la preparación. **Pendiente:** ejecutar los tests completos de Playwright y realizar prueba manual en NOA antes de integrar esta rama. No desplegar ni hacer merge sin validar en navegador.
