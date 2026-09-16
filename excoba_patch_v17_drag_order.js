/* =========================================================
   NOA EXCOBA DRAG ORDER ENGINE v17

   Genera y juzga reactivos donde
   el estudiante debe ordenar elementos.

   Ejemplos:
   - pasos de un procedimiento
   - secuencia biológica
   - orden cronológico
   - proceso lógico

   CHECKPOINT:
   Generator + Judge.

   Todavía NO entra al Batch ni al examen.
   ========================================================= */

(() => {

  const VERSION = '17.0';


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
      'NOA Drag Order recibió JSON inválido'
    );

  }


  // =====================================
  // ID
  // =====================================

  function makeId(prefix){

    if(
      typeof crypto !== 'undefined' &&
      crypto.randomUUID
    ){

      return (
        prefix +
        '-' +
        crypto.randomUUID()
      );

    }


    return (
      prefix +
      '-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2)
    );

  }


  // =====================================
  // FUENTE
  // =====================================

  function sourceContext(slot){

    const s =
      slot?.source || {};


    if(
      s.kind ===
      'official'
    ){

      return `
FUENTE:
Temario oficial EXCOBA

Código:
${s.code}

Tema:
${s.title}

Alcance:
${s.focus}

El reactivo debe permanecer
dentro del alcance oficial.
`;

    }


    if(
      s.kind ===
      'extended'
    ){

      return `
FUENTE:
Entrenamiento extendido

Ancla oficial:
${s.anchorCode}

Tema:
${s.anchorTitle}

Alcance:
${s.anchorFocus}

Puede profundizar el proceso,
pero debe seguir siendo trazable
al punto oficial.
`;

    }


    if(
      s.kind ===
      'course'
    ){

      return `
FUENTE:
Material del curso

Título:
${s.title}

Clasificación:
${s.classification}

Profundidad:
${s.depth}

MATERIAL:
-------------------------
${s.material}
-------------------------

No inventes contenido que no
esté respaldado por este material.
`;

    }


    throw new Error(
      'Fuente no reconocida'
    );

  }


  // =====================================
  // VALIDAR
  // =====================================

  function validate(
    raw,
    slot
  ){

    const instruction =
      String(
        raw.instruction ||
        'Ordena los elementos en la secuencia correcta.'
      ).trim();


    const stem =
      String(
        raw.stem ||
        raw.context ||
        ''
      ).trim();


    if(
      !Array.isArray(
        raw.items
      )
    ){

      throw new Error(
        'Falta el arreglo items'
      );

    }


    const items =
      raw.items
        .slice(0,8)
        .map(
          (item,index) => ({

            id:
              String(
                item.id ||
                `item-${index + 1}`
              ).trim(),

            text:
              String(
                item.text ||
                item.label ||
                ''
              ).trim()

          })
        )
        .filter(
          item =>
            item.id &&
            item.text
        );


    if(
      items.length < 3
    ){

      throw new Error(
        'drag_order necesita al menos 3 elementos'
      );

    }


    const itemIds =
      new Set(
        items.map(
          item =>
            item.id
        )
      );


    if(
      itemIds.size !==
      items.length
    ){

      throw new Error(
        'Hay IDs repetidos'
      );

    }


    if(
      !Array.isArray(
        raw.correctOrder
      )
    ){

      throw new Error(
        'Falta correctOrder'
      );

    }


    const correctOrder =
      raw.correctOrder
        .map(
          id =>
            String(id).trim()
        );


    if(
      correctOrder.length !==
      items.length
    ){

      throw new Error(
        'correctOrder debe contener todos los elementos'
      );

    }


    if(
      new Set(
        correctOrder
      ).size !==
      correctOrder.length
    ){

      throw new Error(
        'correctOrder contiene duplicados'
      );

    }


    for(
      const id of correctOrder
    ){

      if(
        !itemIds.has(id)
      ){

        throw new Error(
          `correctOrder contiene ID inexistente: ${id}`
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
        makeId(
          'noa-order'
        ),

      slotId:
        slot.slotId,

      blueprintSlot:
        slot,

      interactionType:
        'drag_order',

      instruction,

      stem,

      items,

      correctOrder,

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
        slot.difficulty?.level ||
        3,

      scoring:{

        mode:
          'partial',

        maxScore:
          1,

        components:
          Math.max(
            1,
            items.length - 1
          ),

        method:
          'adjacent_pairs'

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
      'drag_order'
    ){

      throw new Error(
        'El slot no es drag_order'
      );

    }


    const difficulty =
      slot.difficulty?.level || 3;


    const itemRange =

      difficulty <= 2
        ? '3 o 4'

        : difficulty === 3
          ? '4 o 5'

          : '5 o 6';


    const raw =
      await callAI([

        {

          role:'system',

          content:
`Eres NOA EXCOBA Drag Order Generator.

Crea UN reactivo donde el estudiante
deba ordenar elementos.

Puede evaluar:

- secuencia de un proceso
- pasos de un procedimiento
- orden cronológico
- progresión lógica o biológica

Devuelve únicamente JSON válido.

REGLAS:

- debe existir una única secuencia
  académicamente defendible.

- cada elemento debe representar
  una etapa, evento, nivel o paso
  SEMÁNTICAMENTE DISTINTO.

- no generes dos elementos que
  describan esencialmente la misma
  entidad o etapa con palabras distintas.

- evita pasos intercambiables.
- evita pistas como "primero",
  "después", "finalmente" dentro
  de los propios elementos.
- no uses numeración visible.
- la dificultad debe venir de la
  comprensión del proceso.
- no inventes hechos fuera de la fuente.`

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


GENERA:

${itemRange} elementos.


FORMATO JSON EXACTO:

{
  "instruction":
    "Ordena los siguientes elementos en la secuencia correcta.",

  "stem":
    "Contexto breve.",

  "items":[

    {
      "id":"item-1",
      "text":"Elemento A"
    },

    {
      "id":"item-2",
      "text":"Elemento B"
    },

    {
      "id":"item-3",
      "text":"Elemento C"
    }

  ],

  "correctOrder":[
    "item-2",
    "item-1",
    "item-3"
  ],

  "explanation":
    "Explicación breve de la secuencia."
}


REGLAS FINALES:

- correctOrder debe contener
  exactamente todos los IDs.
- no repitas IDs.
- ningún paso debe poder cambiarse
  de posición sin alterar la lógica.
- dificultad 4-5 debe requerir
  integración o razonamiento.
- no escribas nada fuera del JSON.`
        }

      ],{

        temperature:0.24

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
reactivos EXCOBA de ordenamiento.

Evalúa de 0 a 10:

source_fidelity
= fidelidad a la fuente.

difficulty_match
= coincide con la dificultad pedida.

sequence_validity
= existe una secuencia correcta real.

order_uniqueness
= los elementos no pueden intercambiarse
sin alterar la lógica.

semantic_distinctness
= cada elemento representa una etapa
realmente distinta; no hay duplicados
conceptuales, solapamientos ni dos
formas de describir el mismo nivel.

item_quality
= los pasos son claros y útiles.

reasoning_quality
= demanda cognitiva auténtica.

ambiguity_control
= ausencia de órdenes alternativos
igualmente defendibles.

clarity
= instrucciones y redacción.

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

    stem:
      question.stem,

    items:
      question.items,

    correctOrder:
      question.correctOrder
  },
  null,
  2
)}


DEVUELVE:

{
  "source_fidelity":10,
  "difficulty_match":10,
  "sequence_validity":10,
  "order_uniqueness":10,
   "semantic_distinctness":10,
  "item_quality":10,
  "reasoning_quality":10,
  "ambiguity_control":10,
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

      'sequence_validity',

      'order_uniqueness',

       'semantic_distinctness',

      'item_quality',

      'reasoning_quality',

      'ambiguity_control',

      'clarity'

    ];


    const values =
      keys
        .map(
          key =>
            Number(j[key])
        )
        .filter(
          Number.isFinite
        );


    const qualityScore =

      values.length

        ? Math.round(
            (
              values.reduce(
                (a,b) =>
                  a + b,
                0
              ) /
              values.length
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
        .sequence_validity >= 8 &&

      resultJudge
        .order_uniqueness >= 8 &&

       resultJudge
  .semantic_distinctness >= 8 &&

      resultJudge
        .item_quality >= 7 &&

      resultJudge
        .reasoning_quality >= 7 &&

      resultJudge
        .ambiguity_control >= 8 &&

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
        'NOA Order Judge rechazó reactivo',
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
      'NOA Order Judge no aprobó el reactivo. ' +
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
  // EXTENDER GENERATOR GLOBAL
  // =====================================

  const generator =
    window
      .NOA_BLUEPRINT_GENERATOR;


  if(!generator){

    throw new Error(
      'Generator Bridge debe cargarse antes de v17'
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
        'drag_order'
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


  // Todavía NO añadimos drag_order
  // a supportedTypes.
  //
  // Primero validamos Generator + Judge.


  window.NOA_DRAG_ORDER = {

    version:
      VERSION,

    generate,

    judge,

    generateSlot

  };


  console.log(
    'NOA EXCOBA Drag Order Engine v17 ✓'
  );

})();
