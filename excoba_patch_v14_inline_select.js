/* =========================================================
   NOA EXCOBA INLINE SELECT ENGINE v14

   Formato:
   texto con espacios seleccionables.

   Ejemplo interno:

   "Los animales [[blank-1]] se desarrollan
    dentro del cuerpo materno."

   Cada blank contiene opciones y una
   respuesta correcta.

   CHECKPOINT:
   Generator + Judge.
   Todavía NO se añade al Batch v10.
   ========================================================= */

(() => {

  const VERSION = '14.0';


  // =====================================
  // JSON
  // =====================================

  function parseObject(raw){

    const text =
      String(raw ?? '')
        .replace(/```json/gi,'')
        .replace(/```/g,'')
        .trim();


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

      return JSON.parse(
        text.slice(
          a,
          b + 1
        )
      );

    }


    throw new Error(
      'NOA recibió JSON inválido'
    );

  }


  // =====================================
  // FUENTE
  // =====================================

  function sourceContext(slot){

    const s =
      slot?.source || {};


    if(
      s.kind === 'official'
    ){

      return `
FUENTE OFICIAL EXCOBA

Código:
${s.code}

Tema:
${s.title}

Alcance:
${s.focus}
`;

    }


    if(
      s.kind === 'extended'
    ){

      return `
ENTRENAMIENTO EXTENDIDO

Ancla oficial:
${s.anchorCode}

Tema:
${s.anchorTitle}

Alcance:
${s.anchorFocus}

Puede profundizar el concepto,
pero debe seguir siendo trazable
al punto oficial.
`;

    }


    if(
      s.kind === 'course'
    ){

      return `
MATERIAL DEL CURSO

Título:
${s.title}

Clasificación:
${s.classification}

Profundidad:
${s.depth}

Material:
----------------
${s.material}
----------------

No inventes contenido que no esté
respaldado por el material.
`;

    }


    throw new Error(
      'Fuente no reconocida'
    );

  }


  // =====================================
  // VALIDACIÓN
  // =====================================

  function validate(
    raw,
    slot
  ){

    const instruction =
      String(
        raw.instruction ||
        'Selecciona la opción correcta en cada espacio.'
      ).trim();


    const text =
      String(
        raw.text ||
        raw.paragraph ||
        ''
      ).trim();


    if(!text){

      throw new Error(
        'Falta el texto del reactivo'
      );

    }


    if(
      !Array.isArray(
        raw.blanks
      )
    ){

      throw new Error(
        'Falta el arreglo blanks'
      );

    }


    const blanks =
      raw.blanks
        .slice(0,5)
        .map(
          (blank,index) => {

            const id =
              String(
                blank.id ||
                `blank-${index + 1}`
              ).trim();


            const options =
              Array.isArray(
                blank.options
              )
                ? blank.options
                    .map(
                      x =>
                        String(x)
                          .trim()
                    )
                    .filter(Boolean)
                : [];


            const correct =
              Number(
                blank.correct
              );


            if(
              options.length < 2 ||
              options.length > 5
            ){

              throw new Error(
                `${id}: opciones inválidas`
              );

            }


            if(
              new Set(options).size !==
              options.length
            ){

              throw new Error(
                `${id}: opciones repetidas`
              );

            }


            if(
              !Number.isInteger(
                correct
              ) ||
              correct < 0 ||
              correct >=
                options.length
            ){

              throw new Error(
                `${id}: correct inválido`
              );

            }


            return {

              id,

              options,

              correct

            };

          }
        );


    if(
      blanks.length < 1
    ){

      throw new Error(
        'El reactivo necesita al menos un espacio'
      );

    }


    const ids =
      new Set(
        blanks.map(
          b => b.id
        )
      );


    if(
      ids.size !==
      blanks.length
    ){

      throw new Error(
        'Hay IDs de espacios repetidos'
      );

    }


    // Cada placeholder debe aparecer
    // exactamente una vez en el texto.

    for(
      const blank of blanks
    ){

      const token =
        `[[${blank.id}]]`;


      const count =
        text
          .split(token)
          .length - 1;


      if(count !== 1){

        throw new Error(
          `El marcador ${token} debe aparecer exactamente una vez`
        );

      }

    }


    const explanation =
      String(
        raw.explanation ||
        ''
      ).trim();


    return {

      id:
        typeof uid === 'function'
          ? uid()
          : (
              'noa-inline-' +
              Date.now()
            ),

      slotId:
        slot.slotId,

      blueprintSlot:
        slot,

      interactionType:
        'inline_select',

      instruction,

      text,

      blanks,

      explanation,

      syllabusCodes:[
        ...(
          slot.syllabusCodes ||
          []
        )
      ],

      sourceType:
        slot.sourceType,

      requestedSourceType:
        slot.requestedSourceType,

      difficulty:
        slot.difficulty
          ?.level || 3,

      scoring:{

        mode:
          'partial',

        maxScore:1,

        components:
          blanks.length,

        componentWeight:
          1 / blanks.length

      },

      judge:null,

      accepted:false

    };

  }


  // =====================================
  // GENERATOR
  // =====================================

  async function generate(
    slot
  ){

    if(
      slot.interactionType !==
      'inline_select'
    ){

      throw new Error(
        'El slot no es inline_select'
      );

    }


    const difficulty =
      slot.difficulty?.level || 3;


    const desiredBlanks =

      difficulty <= 2
        ? '1 o 2'

        : difficulty === 3
          ? '2 o 3'

          : '3 o 4';


    const raw =
      await callAI([

        {

          role:'system',

          content:
`Eres NOA EXCOBA Inline Select Generator.

Crea UN reactivo donde el estudiante
complete espacios seleccionando opciones.

Devuelve únicamente JSON válido.

No uses Markdown.

El reactivo debe parecer una actividad
académica integrada en un texto,
NO una serie de preguntas independientes.

Cada espacio debe tener una sola
respuesta defendible.

Las opciones incorrectas deben ser
plausibles.`

        },

        {

          role:'user',

          content:
`MATERIA:

${slot.subject}


DIFICULTAD:

${difficulty}/5

Nivel cognitivo:
${slot.difficulty?.cognitive || 'application'}

Pasos de razonamiento:
${slot.difficulty?.reasoningSteps || 1}


FUENTE:

${sourceContext(slot)}


CREA:

${desiredBlanks} espacios seleccionables.


USA MARCADORES EXACTOS:

[[blank-1]]
[[blank-2]]
etc.


FORMATO JSON:

{
  "instruction":
    "Selecciona la opción correcta en cada espacio.",

  "text":
    "Texto académico con [[blank-1]] y [[blank-2]].",

  "blanks":[

    {
      "id":"blank-1",

      "options":[
        "opción A",
        "opción B",
        "opción C"
      ],

      "correct":1
    },

    {
      "id":"blank-2",

      "options":[
        "opción A",
        "opción B",
        "opción C"
      ],

      "correct":0
    }

  ],

  "explanation":
    "explicación breve"
}


REGLAS:

- cada id debe aparecer exactamente
  una vez dentro del texto.
- usa 2 a 5 opciones por espacio.
- correct es índice empezando en 0.
- evita pistas gramaticales.
- evita opciones absurdas.
- en dificultad 3-5 debe requerir
  comprensión o aplicación.
- no inventes contenido fuera
  de la fuente.
- no escribas nada fuera del JSON.`
        }

      ],{

        temperature:0.25

      });


    return validate(
      parseObject(raw),
      slot
    );

  }


  // =====================================
  // JUDGE
  // =====================================

  async function judge(
    question,
    slot
  ){

    const raw =
      await callAI([

        {

          role:'system',

          content:
`Eres NOA Judge especializado en
reactivos EXCOBA de selección
dentro de texto.

Evalúa de 0 a 10:

source_fidelity
difficulty_match
blank_quality
option_quality
ambiguity_control
context_quality
reasoning_quality
clarity

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

    difficulty:
      slot.difficulty,

    sourceType:
      slot.sourceType,

    syllabusCodes:
      slot.syllabusCodes
  },
  null,
  2
)}


FUENTE:

${sourceContext(slot)}


REACTIVO:

${JSON.stringify(
  {
    instruction:
      question.instruction,

    text:
      question.text,

    blanks:
      question.blanks
  },
  null,
  2
)}


RESPUESTA:

{
  "source_fidelity":10,
  "difficulty_match":10,
  "blank_quality":10,
  "option_quality":10,
  "ambiguity_control":10,
  "context_quality":10,
  "reasoning_quality":10,
  "clarity":10,
  "comments":"comentario breve"
}`
        }

      ],{

        temperature:0

      });


    const j =
      parseObject(raw);


    const keys = [

      'source_fidelity',

      'difficulty_match',

      'blank_quality',

      'option_quality',

      'ambiguity_control',

      'context_quality',

      'reasoning_quality',

      'clarity'

    ];


    const scores =
      keys
        .map(
          key =>
            Number(j[key])
        )
        .filter(
          Number.isFinite
        );


    const qualityScore =
      scores.length

        ? Math.round(
            (
              scores.reduce(
                (a,b) =>
                  a + b,
                0
              ) /
              scores.length
            ) * 10
          ) / 10

        : null;


    const resultJudge = {

      ...Object.fromEntries(
        keys.map(
          key => [
            key,
            Number(j[key])
          ]
        )
      ),

      comments:
        String(
          j.comments || ''
        ),

      qualityScore

    };


    const accepted =

      Number.isFinite(
        qualityScore
      ) &&

      qualityScore >= 8.2 &&

      resultJudge
        .source_fidelity >= 9 &&

      resultJudge
        .difficulty_match >= 7 &&

      resultJudge
        .blank_quality >= 8 &&

      resultJudge
        .option_quality >= 7 &&

      resultJudge
        .ambiguity_control >= 8 &&

      resultJudge
        .context_quality >= 7 &&

      resultJudge
        .reasoning_quality >= 7 &&

      resultJudge
        .clarity >= 8;


    return {

      ...question,

      judge:
        resultJudge,

      accepted

    };

  }


  // =====================================
  // SLOT + REINTENTOS
  // =====================================

  async function generateSlot(
    slot,
    options={}
  ){

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


    let current =
      slot;


    let last =
      null;


    for(
      let attempt=0;
      attempt<maxAttempts;
      attempt++
    ){

      const q =
        await generate(
          current
        );


      const judged =
        await judge(
          q,
          current
        );


      last =
        judged;


      if(
        judged.accepted
      ){

        return {

          question:
            judged,

          slot:
            current,

          attempts:
            attempt + 1

        };

      }


      console.warn(
        'NOA Inline Judge rechazó reactivo',
        {
          slot:
            current.slotId,

          attempt:
            attempt + 1,

          score:
            judged
              .judge
              ?.qualityScore
        }
      );


      if(
        attempt <
        maxAttempts - 1
      ){

        current =
          window
            .NOA_SOURCE_BLUEPRINT
            .replaceSlot(
              slot,
              attempt + 1
            );

      }

    }


    throw new Error(
      'NOA Inline Judge no aprobó el reactivo. ' +
      'Último score: ' +
      (
        last
          ?.judge
          ?.qualityScore ??
        'N/D'
      )
    );

  }


  // =====================================
  // EXTENDER GENERATOR
  // =====================================

  const generator =
    window
      .NOA_BLUEPRINT_GENERATOR;


  if(!generator){

    throw new Error(
      'Generator Bridge debe cargarse antes de v14'
    );

  }


  const previous =
    generator
      .generateSlot;


  generator.generateSlot =
    async function(
      slot,
      options={}
    ){

      if(
        slot?.interactionType ===
        'inline_select'
      ){

        return generateSlot(
          slot,
          options
        );

      }


      return previous(
        slot,
        options
      );

    };


  // IMPORTANTE:
  // todavía NO añadimos inline_select
  // a NOA_BATCH_ORCHESTRATOR.
  //
  // Primero construiremos su renderer.


  window.NOA_INLINE_SELECT = {

    version:
      VERSION,

    generate,

    judge,

    generateSlot

  };


  console.log(
    'NOA EXCOBA Inline Select Engine v14 ✓'
  );

})();
