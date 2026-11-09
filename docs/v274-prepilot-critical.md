# v27.4 fase 1 — Inicio completo y evidencia heredada

## Causas y alcance

La ruta local antigua tomaba hasta la cantidad pedida por materia y solo exigía
una cola no vacía. Permitía anunciar 180 con 178. Por separado, Dashboard y
Calibrator heredado consumían contadores/historial sin distinguir procedencia.

No se modifican los módulos v27, Judge, scoring ni las fórmulas de Calibrator.
La selección de evidencia de su consumidor heredado en index sí cambia.

## Entrenamiento local

startExcobaExam admite únicamente 45 o 180. Lee las nueve materias reales de v4
y el banco ya existente. Exige cinco o veinte reactivos válidos únicos por materia:
10/20/15 para 45 y 40/80/60 para 180. No utiliza v25 como validador de 180.

Valida single_select (el renderer de esa ruta), texto, opciones, respuesta e IDs.
Descarta IDs repetidos y contenidos textuales iguales normalizados en NFC/espacios con las mismas opciones
sin depender del orden de estas y conservando mayúsculas científicas. La identidad textual conservadora no certifica
que dos preguntas sean semánticamente distintas. No se llama a IA ni se añaden
preguntas para llenar faltantes. No se genera automáticamente el antiguo banco
de plantillas al pulsar estos botones; debe existir un banco suficiente.

Antes de beginExamQueue se comprueba cada cupo y el total. Un rechazo solo muestra
las materias/cantidades faltantes: no guarda, reinicia sesión, cambia cola,
consume declaración ni crea intentos. Una cola completa se identifica como
entrenamiento local de banco manual/plantillas, sin equivalencia oficial. Las
rutas parciales de Simulacros continúan disponibles. La distribución no representa
frecuencias oficiales de formatos ni una validación científica de las preguntas.

## Evidencia para indicadores heredados

legacyAcademicEvidence utiliza normalizeHistory v27.1 sin cambiarlo. Todas las
copias de un intento deben ser student explícito y válidas según el contrato de
procedencia. Un veto técnico en intento o respuesta excluye el intento, incluso
si una copia técnica está vacía. Unknown y ausencia histórica no se promueven.

Exige identidad de intento/reactivos, total y puntuación verificables y coherentes.
Deduplica con el normalizador; rechaza conflictos académicos y crédito/ok
contradictorios. Solo conserva respuestas con crédito conocido, procedencia
admisible y resultado correcto, parcial o incorrecto. Las omisiones siguen
valiendo cero en el examen y permanecen intactas; no entran en estos indicadores
sobre respuestas de conocimiento ni en la muestra adaptativa heredada.

La dificultad solo se copia a la entrada de Calibrator si todos los valores
registrados disponibles (difficulty, blueprint.difficulty, blueprintSlot.difficulty.level, o difficulty numérico de slots antiguos)
son enteros 1..5 coincidentes. No se inventan dificultades históricas. La fórmula,
ciclo y umbrales siguen iguales: últimas doce sesiones admisibles y hasta sesenta
respuestas con dificultad verificable. Ahora puede bajar la muestra histórica o
volver al ciclo inicial: es selección conservadora, no eliminación de datos.

Dashboard/Materias/prioridad/voz/selección del banco leen una proyección de créditos,
cantidad y última práctica por topicId conocido, sin adivinar correspondencias.
Sin evidencia se muestra Sin datos o Sin evidencia admisible. La prioridad
heredada se etiqueta provisional y conserva su heurística; no equivale a las
recomendaciones verificadas de v27.3B ni certifica dominio. No se incorporan los
contadores crudos de flashcards a esta proyección porque no permiten reconstruir
procedencia y crédito por reactivo.

Los escritores de contadores raw en las rutas single, classify, inline, order,
revisión y flashcards se conservan para compatibilidad. Esos contadores no se
borran, migran ni se presentan como rendimiento académico. Ninguna proyección
reescribe respuestas, créditos, fechas o históricos. El caché de lectura es
transitorio, depende del contenido de attempts y no añade esquema persistente.
Respaldo/restauración siguen incluyendo todos los datos originales.

## Validación

Nueva suite: tests/prepilot-critical.spec.cjs. Incluye cupos y rechazo activo,
180 completos, duplicados, Comandos, 45 local, procedencia, omisiones/parciales,
conflictos, entradas congeladas, determinismo, cierre, recarga, respaldo y offline
móvil. Las regresiones de calibración que usaban históricos anónimos ahora crean
fixtures student con identidad y resúmenes coherentes; no se reinterpretan esos
registros en producción ni se elimina cobertura de los unknown.

Sin dependencias nuevas. SW v6-88 mantiene su aislamiento por scope. No se cambia
la distribución ni los motores del simulacro moderno de45. IA real, dispositivos
físicos y calidad científica de un banco real no son verificaciones de esta fase.

## Limitación móvil previa detectada

La regresión de v25 a 320 px detectó ancho de documento 383 px por el control de
procedencia existente. La misma apertura interceptando index.html de origin/main
reprodujo exactamente 383/320. No se modifica ese control ni se elimina su prueba
en esta fase. A 390 px y otros tamaños ejecutados no se observó ese desbordamiento.
Esta fase no constituye autorización para piloto ni afirma que toda la suite pase.
