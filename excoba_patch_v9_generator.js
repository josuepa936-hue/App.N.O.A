/* =========================================================
   NOA EXCOBA GENERATOR BRIDGE v9

   Primer puente entre:

   Source Blueprint v8
          ↓
   Generator
          ↓
   Judge

   CHECKPOINT ACTUAL:
   - single_select
   - una pregunta por slot
   - reposición manteniendo el slot bloqueado

   Todavía NO sustituye el simulador principal.
   ========================================================= */

(() => {

  const VERSION = '9.0';


  // =====================================
  // UTILIDADES
  // =====================================

  function cleanJSON(raw){

    return String(raw ?? '')
      .replace(/```json/gi,'')
      .replace(/```/g,'')
      .trim();

  }


  function parseObject(raw){

    const text =
      cleanJSON(raw);


    try{

      const parsed =
        JSON.parse(text);

      if(
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ){
        return parsed;
      }

    }catch{}


    const a =
      text.indexOf('{');

    const b =
      text.lastIndexOf('}');


    if(
      a >= 0 &&
      b > a
    ){

      const parsed =
        JSON.parse(
          text.slice(
            a,
            b + 1
          )
        );


      if(
        parsed &&
        typeof parsed === 'object'
      ){
        return parsed;
      }

    }


    throw new Error(
      'La IA no devolvió un objeto JSON válido'
    );

  }


  function clampIndex(value){

    const n =
      Number(value);


    if(
      !Number.isInteger(n) ||
      n < 0 ||
      n > 3
    ){
      return null;
    }


    return n;

  }


  function normalizeCode(value){

    return String(value || '')
      .trim()
      .replace(/\.$/,'');

  }


  // =====================================
  // CONTEXTO DE LA FUENTE
  // =====================================

  function sourceContext(slot){

    const source =
      slot?.source || {};


    // -------------------------------------
    // OFICIAL
    // -------------------------------------

    if(
      source.kind ===
      'official'
    ){

      return `
TIPO DE FUENTE:
OFICIAL EXCOBA

CÓDIGO:
${source.code}

TEMA:
${source.title}

ALCANCE:
${source.focus}

REGLA:
El reactivo debe permanecer dentro de este
punto del temario oficial.
`;

    }


    // -------------------------------------
    // EXTENDIDA
    // -------------------------------------

    if(
      source.kind ===
      'extended'
    ){

      return `
TIPO DE FUENTE:
ENTRENAMIENTO EXTENDIDO

PUNTO OFICIAL DE ANCLAJE:
${source.anchorCode}

TEMA:
${source.anchorTitle}

ALCANCE OFICIAL:
${source.anchorFocus}

REGLA:
Puedes construir una extensión natural,
una aplicación más profunda o una situación
más exigente, pero debe continuar siendo
académicamente trazable al punto oficial.

No conviertas la pregunta en trivia externa.
`;

    }


    // -------------------------------------
    // CURSO
    // -------------------------------------

    if(
      source.kind ===
      'course'
    ){

      const objective =
        source.objective
          ? `
OBJETIVO EVALUABLE:
${source.objective.text}

TIPO:
${source.objective.type}
`
          : '';


      const anchor =
        source.officialAnchor
          ? `
RELACIÓN OFICIAL:
${source.officialAnchor.code}
${source.officialAnchor.title}

${source.officialAnchor.focus}
`
          : `
RELACIÓN OFICIAL:
Este material puede ser exclusivo del curso.
No inventes una relación EXCOBA inexistente.
`;


      return `
TIPO DE FUENTE:
MATERIAL DEL CURSO

TÍTULO:
${source.title}

CLASIFICACIÓN:
${source.classification}

PROFUNDIDAD:
${source.depth}

${objective}

${anchor}

MATERIAL REAL DEL ESTUDIANTE:
-----------------------------
${source.material}
-----------------------------

REGLA:
La pregunta debe estar respaldada por
este material. No inventes que se vio
contenido que no aparece aquí.
`;

    }


    throw new Error(
      'Tipo de fuente no reconocido'
    );

  }


  // =====================================
  // ESPECIFICACIÓN DE DIFICULTAD
  // =====================================

  function difficultyContext(slot){

    const d =
      slot?.difficulty || {};


    return `
DIFICULTAD OBLIGATORIA:
${d.level}/5

NIVEL COGNITIVO:
${d.cognitive || 'application'}

PASOS DE RAZONAMIENTO:
${d.reasoningSteps || 1}

CONCEPTOS A INTEGRAR:
${d.conceptsIntegrated || 1}

CAMBIO DE REPRESENTACIÓN:
${d.representationShift ? 'sí' : 'no'}

SIMILITUD DE DISTRACTORES:
${d.distractorSimilarity || 'medium'}
`;

  }


  // =====================================
  // VALIDAR SALIDA
  // =====================================

  function validateSingleSelect(
    raw,
    slot
  ){

    const question =
      String(
        raw.question ??
        raw.stem ??
        ''
      ).trim();


    const options =
      Array.isArray(raw.options)
        ? raw.options
            .map(x =>
              String(x).trim()
            )
        : [];


    const correct =
      clampIndex(
        raw.correct
      );


    const explanation =
      String(
        raw.explanation || ''
      ).trim();


    if(!question){

      throw new Error(
        'Reactivo sin enunciado'
      );

    }


    if(
      options.length !== 4 ||
      options.some(x => !x)
    ){

      throw new Error(
        'El reactivo no contiene exactamente 4 opciones'
      );

    }


    if(correct === null){

      throw new Error(
        'Índice de respuesta correcta inválido'
      );

    }


    if(
      new Set(options).size !== 4
    ){

      throw new Error(
        'Hay opciones repetidas'
      );

    }


    const allowedCodes =
      new Set(
        (
          slot.syllabusCodes ||
          []
        ).map(
          normalizeCode
        )
      );


    let syllabusCode =
      normalizeCode(
        raw.syllabus_code ||
        raw.syllabusCode ||
        ''
      );


    // Fuente oficial/extendida:
    // el código tiene que ser uno permitido.

    if(
      slot.sourceType !==
        'course' &&
      allowedCodes.size
    ){

      if(
        !allowedCodes.has(
          syllabusCode
        )
      ){

        syllabusCode =
          [...allowedCodes][0];

      }

    }


    // Curso sin relación oficial:
    // el código puede quedar vacío.

    if(
      slot.sourceType ===
        'course' &&
      !allowedCodes.size
    ){

      syllabusCode = '';

    }


    return {

      id:
        typeof uid === 'function'
          ? uid()
          : (
              'noa-q-' +
              Date.now()
            ),

      slotId:
        slot.slotId,

      blueprintSlot:
        slot,

      interactionType:
        'single_select',

      instruction:
        String(
          raw.instruction ||
          'Selecciona la opción correcta.'
        ).trim(),

      text:
        question,

      options,

      correct,

      explain:
        explanation,

      syllabusCode,

      sourceType:
        slot.sourceType,

      requestedSourceType:
        slot.requestedSourceType,

      difficulty:
        slot.difficulty?.level || 3,

      sourceTrace:
        slot.source,

      judge:
        null

    };

  }


  // =====================================
  // GENERAR SINGLE SELECT
  // =====================================

  async function generateSingleSelect(
    slot
  ){

    const raw =
      await callAI([

        {

          role:'system',

          content:
`Eres NOA EXCOBA Generator.

Debes crear UN solo reactivo académico.

Devuelve ÚNICAMENTE un objeto JSON válido.

No uses Markdown.
No agregues texto antes ni después.

La dificultad describe demanda cognitiva,
NO vocabulario rebuscado.

Los distractores deben representar
errores conceptuales o de razonamiento
plausibles.

Las cuatro opciones deben ser similares
en longitud, especificidad y estilo.

No uses:
- todas las anteriores
- ninguna de las anteriores
- opciones absurdas
- pistas gramaticales
- preguntas capciosas

Debe existir una única respuesta correcta.`

        },

        {

          role:'user',

          content:
`MATERIA:
${slot.subject}

SLOT:
${slot.slotId}

FORMATO:
single_select

${difficultyContext(slot)}

${sourceContext(slot)}

REGLAS DE REALISMO:

${JSON.stringify(
  slot.realismRules || {},
  null,
  2
)}

FORMATO EXACTO:

{
  "instruction":
    "Selecciona la opción correcta.",

  "question":
    "enunciado del reactivo",

  "options":[
    "opción A",
    "opción B",
    "opción C",
    "opción D"
  ],

  "correct":0,

  "explanation":
    "justificación académica breve",

  "syllabus_code":
    "código permitido o vacío si es course_only"
}

REGLAS FINALES:

- correct debe ser 0, 1, 2 o 3.
- genera exactamente cuatro opciones.
- respeta el nivel de dificultad.
- si la dificultad es 3 o superior,
  prioriza aplicación o razonamiento.
- si la dificultad es 4 o 5,
  no permitas que la respuesta aparezca
  literalmente en el enunciado.
- no inventes contenido fuera de la fuente.`
        }

      ],{

        temperature:0.28

      });


    const parsed =
      parseObject(raw);


    return validateSingleSelect(
      parsed,
      slot
    );

  }


  // =====================================
  // JUDGE V9
  // =====================================

  async function judgeItem(
    question,
    slot
  ){

    const raw =
      await callAI([

        {

          role:'system',

          content:
`Eres NOA Judge.

Evalúa UN reactivo.

NO lo resuelvas para el usuario.
NO lo reescribas.

Califica de 0 a 10:

source_fidelity
= fidelidad a la fuente asignada.

difficulty_match
= coincidencia con la dificultad solicitada.

distractor_quality
= calidad y plausibilidad de distractores.

reasoning_quality
= demanda cognitiva real.

clarity
= precisión y ausencia de ambigüedad.

single_correct
= qué tan claro es que existe una sola
respuesta correcta.

Devuelve únicamente JSON válido.`

        },

        {

          role:'user',

          content:
`BLUEPRINT:

${JSON.stringify(
  {
    subject:
      slot.subject,

    slotId:
      slot.slotId,

    sourceType:
      slot.sourceType,

    syllabusCodes:
      slot.syllabusCodes,

    difficulty:
      slot.difficulty,

    interactionType:
      slot.interactionType,

    realismRules:
      slot.realismRules
  },
  null,
  2
)}

FUENTE:

${sourceContext(slot)}

REACTIVO:

${JSON.stringify(
  {
    question:
      question.text,

    options:
      question.options,

    correct:
      question.correct,

    explanation:
      question.explain,

    syllabusCode:
      question.syllabusCode
  },
  null,
  2
)}

RESPUESTA EXACTA:

{
  "source_fidelity":10,
  "difficulty_match":10,
  "distractor_quality":10,
  "reasoning_quality":10,
  "clarity":10,
  "single_correct":10,
  "comments":"comentario breve"
}`
        }

      ],{

        temperature:0

      });


    const j =
      parseObject(raw);


    const scores = [

      Number(
        j.source_fidelity
      ),

      Number(
        j.difficulty_match
      ),

      Number(
        j.distractor_quality
      ),

      Number(
        j.reasoning_quality
      ),

      Number(
        j.clarity
      ),

      Number(
        j.single_correct
      )

    ].filter(
      Number.isFinite
    );


    const qualityScore =
      scores.length

        ? scores.reduce(
            (a,b) => a + b,
            0
          ) / scores.length

        : null;


    const judge = {

      source_fidelity:
        Number(
          j.source_fidelity
        ),

      difficulty_match:
        Number(
          j.difficulty_match
        ),

      distractor_quality:
        Number(
          j.distractor_quality
        ),

      reasoning_quality:
        Number(
          j.reasoning_quality
        ),

      clarity:
        Number(
          j.clarity
        ),

      single_correct:
        Number(
          j.single_correct
        ),

      comments:
        String(
          j.comments || ''
        ),

      qualityScore:
        qualityScore === null
          ? null
          : Math.round(
              qualityScore * 10
            ) / 10

    };


    const passes =
      Number.isFinite(
        judge.qualityScore
      ) &&

      judge.qualityScore >= 8.2 &&

      judge.source_fidelity >= 9 &&

      judge.difficulty_match >= 7 &&

      judge.distractor_quality >= 7 &&

      judge.reasoning_quality >= 7 &&

      judge.clarity >= 8 &&

      judge.single_correct >= 8;


    return {

      ...question,

      judge,

      accepted:
        passes

    };

  }


  // =====================================
  // GENERAR SLOT CON REPOSICIÓN
  // =====================================

  async function generateSlot(
    slot,
    options = {}
  ){

    if(!slot){

      throw new Error(
        'Falta el slot'
      );

    }


    if(
      slot.interactionType !==
      'single_select'
    ){

      throw new Error(
        'v9 checkpoint todavía trabaja ' +
        'solo con single_select. ' +
        'Este slot es ' +
        slot.interactionType
      );

    }


    const maxAttempts =
      Math.max(
        1,
        Math.min(
          3,
          Number(
            options.maxAttempts
          ) || 2
        )
      );


    let currentSlot =
      slot;


    let last = null;


    for(
      let attempt=0;
      attempt<maxAttempts;
      attempt++
    ){

      const generated =
        await generateSingleSelect(
          currentSlot
        );


      const judged =
        await judgeItem(
          generated,
          currentSlot
        );


      last = judged;


      if(
        judged.accepted
      ){

        return {

          question:
            judged,

          slot:
            currentSlot,

          attempts:
            attempt + 1

        };

      }


      console.warn(
        'NOA v9 Judge rechazó el slot',
        {
          slot:
            currentSlot.slotId,

          attempt:
            attempt + 1,

          score:
            judged
              .judge
              ?.qualityScore,

          judge:
            judged.judge
        }
      );


      if(
        attempt <
        maxAttempts - 1
      ){

        currentSlot =
          window
            .NOA_SOURCE_BLUEPRINT
            .replaceSlot(
              slot,
              attempt + 1
            );

      }

    }


    throw new Error(
      'NOA Judge no aprobó el reactivo ' +
      `después de ${maxAttempts} intentos. ` +
      (
        last?.judge?.qualityScore
          ? `Último score: ${
              last.judge.qualityScore
            }/10`
          : ''
      )
    );

  }


  // =====================================
  // CHECKPOINT AUTOMÁTICO
  // =====================================

  function findTestSlot(
    subject =
      'EXCOBA Medicina · Biología'
  ){

    const blueprint =
      window
        .NOA_SOURCE_BLUEPRINT
        .build({

          subject,

          count:10

        });


    const slot =
      blueprint
        .slots
        .find(
          s =>
            s.interactionType ===
            'single_select'
        );


    if(!slot){

      throw new Error(
        'No encontré un slot single_select'
      );

    }


    return {

      blueprint,

      slot

    };

  }


  // =====================================
  // API GLOBAL
  // =====================================

  window.NOA_BLUEPRINT_GENERATOR = {

    version:
      VERSION,

    findTestSlot,

    generateSlot,

    generateSingleSelect,

    judgeItem

  };


  console.log(
    'NOA EXCOBA Generator Bridge v9 ✓'
  );

})();
