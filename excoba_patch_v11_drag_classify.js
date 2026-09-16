/* =========================================================
   NOA EXCOBA DRAG CLASSIFY ENGINE v11

   Añade soporte real para:
   drag_classify

   Flujo:

   Source Blueprint v8
          ↓
   Drag Generator v11
          ↓
   Drag Judge v11
          ↓
   Reactivo estructurado

   No renderiza todavía la interfaz visual.
   ========================================================= */

(() => {

  const VERSION = '11.0';


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


    const start =
      text.indexOf('{');

    const end =
      text.lastIndexOf('}');


    if(
      start >= 0 &&
      end > start
    ){

      return JSON.parse(
        text.slice(
          start,
          end + 1
        )
      );

    }


    throw new Error(
      'NOA recibió JSON inválido'
    );

  }


  function makeId(prefix='id'){

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
  // CONTEXTO DE FUENTE
  // =====================================

  function sourceContext(slot){

    const source =
      slot?.source || {};


    if(
      source.kind ===
      'official'
    ){

      return `
FUENTE:
Temario oficial EXCOBA.

CÓDIGO:
${source.code}

TEMA:
${source.title}

ALCANCE:
${source.focus}

El reactivo debe permanecer
estrictamente dentro de este alcance.
`;

    }


    if(
      source.kind ===
      'extended'
    ){

      return `
FUENTE:
Entrenamiento extendido.

PUNTO OFICIAL DE ANCLAJE:
${source.anchorCode}

TEMA:
${source.anchorTitle}

ALCANCE:
${source.anchorFocus}

Puedes construir una aplicación
más profunda del concepto,
pero debe seguir siendo trazable
al punto oficial.
`;

    }


    if(
      source.kind ===
      'course'
    ){

      return `
FUENTE:
Material real del curso.

TÍTULO:
${source.title}

CLASIFICACIÓN:
${source.classification}

PROFUNDIDAD:
${source.depth}

MATERIAL:
------------------------
${source.material}
------------------------

No inventes contenido que no
esté respaldado por el material.
`;

    }


    throw new Error(
      'Fuente desconocida'
    );

  }


  // =====================================
  // DIFICULTAD
  // =====================================

  function difficultyContext(slot){

    const d =
      slot?.difficulty || {};


    return `
NIVEL:
${d.level}/5

DEMANDA COGNITIVA:
${d.cognitive || 'application'}

PASOS DE RAZONAMIENTO:
${d.reasoningSteps || 1}

CONCEPTOS INTEGRADOS:
${d.conceptsIntegrated || 1}

SIMILITUD ENTRE ALTERNATIVAS:
${d.distractorSimilarity || 'medium'}
`;

  }


  // =====================================
  // NORMALIZAR TARGETS
  // =====================================

  function normalizeTargets(rawTargets){

    if(
      !Array.isArray(rawTargets)
    ){

      return [];

    }


    return rawTargets
      .slice(0,4)
      .map(
        (target,index) => ({

          id:
            String(
              target.id ||
              `target-${index+1}`
            ).trim(),

          label:
            String(
              target.label ||
              target.name ||
              ''
            ).trim()

        })
      )
      .filter(
        target =>
          target.id &&
          target.label
      );

  }


  // =====================================
  // NORMALIZAR ELEMENTOS
  // =====================================

  function normalizeElements(
    rawElements,
    targetIds
  ){

    if(
      !Array.isArray(rawElements)
    ){

      return [];

    }


    return rawElements
      .slice(0,10)
      .map(
        (element,index) => {

          const correctTargetId =
            String(
              element.correctTargetId ||
              element.correct_target_id ||
              element.targetId ||
              element.target_id ||
              ''
            ).trim();


          return {

            id:
              String(
                element.id ||
                `element-${index+1}`
              ).trim(),

            text:
              String(
                element.text ||
                element.label ||
                ''
              ).trim(),

            correctTargetId

          };

        }
      )
      .filter(
        element =>
          element.id &&
          element.text &&
          targetIds.has(
            element.correctTargetId
          )
      );

  }


  // =====================================
  // VALIDAR DRAG CLASSIFY
  // =====================================

  function validateDragClassify(
    raw,
    slot
  ){

    const targets =
      normalizeTargets(
        raw.targets
      );


    if(
      targets.length < 2
    ){

      throw new Error(
        'drag_classify necesita al menos 2 categorías'
      );

    }


    const targetIds =
      new Set(
        targets.map(
          target =>
            target.id
        )
      );


    if(
      targetIds.size !==
      targets.length
    ){

      throw new Error(
        'Hay categorías con ID repetido'
      );

    }


    const elements =
      normalizeElements(
        raw.elements,
        targetIds
      );


    if(
      elements.length < 3
    ){

      throw new Error(
        'drag_classify necesita al menos 3 elementos'
      );

    }


    const elementIds =
      new Set(
        elements.map(
          element =>
            element.id
        )
      );


    if(
      elementIds.size !==
      elements.length
    ){

      throw new Error(
        'Hay elementos repetidos'
      );

    }


    const usedTargets =
      new Set(
        elements.map(
          element =>
            element.correctTargetId
        )
      );


    if(
      usedTargets.size < 2
    ){

      throw new Error(
        'Todos los elementos terminaron en una sola categoría'
      );

    }


    const instruction =
      String(
        raw.instruction ||
        'Clasifica cada elemento en la categoría correspondiente.'
      ).trim();


    const stem =
      String(
        raw.stem ||
        raw.question ||
        raw.context ||
        ''
      ).trim();


    const explanation =
      String(
        raw.explanation ||
        ''
      ).trim();


    const componentWeight =
      1 /
      elements.length;


    return {

      id:
        makeId(
          'noa-drag'
        ),

      slotId:
        slot.slotId,

      blueprintSlot:
        slot,

      interactionType:
        'drag_classify',

      instruction,

      stem,

      targets,

      elements,

      correctResponse:
        Object.fromEntries(

          elements.map(
            element => [

              element.id,

              element
                .correctTargetId

            ]
          )

        ),

      explanation,

      syllabusCodes:
        [
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

      sourceTrace:
        slot.source,

      scoring:{

        mode:
          'partial',

        maxScore:
          1,

        components:
          elements.length,

        componentWeight

      },

      judge:null,

      accepted:false

    };

  }


  // =====================================
  // GENERADOR
  // =====================================

  async function generateDragClassify(
    slot
  ){

    if(
      slot.interactionType !==
      'drag_classify'
    ){

      throw new Error(
        'El slot no es drag_classify'
      );

    }


    const d =
      slot.difficulty || {};


    const minElements =
      Array.isArray(
        d.elementCount
      )
        ? d.elementCount[0]
        : 3;


    const maxElements =
      Array.isArray(
        d.elementCount
      )
        ? d.elementCount[1]
        : 6;


    const raw =
      await callAI([

        {

          role:'system',

          content:
`Eres NOA EXCOBA Drag Generator.

Debes crear UN reactivo de clasificación.

El usuario debe mover varios elementos
hacia categorías.

Devuelve únicamente JSON válido.

No uses Markdown.
No añadas comentarios.

REGLAS:

- cada elemento debe tener UNA categoría correcta.
- las categorías deben ser conceptualmente claras.
- evita pistas obvias por vocabulario.
- los elementos deben requerir comprensión.
- no uses categorías redundantes.
- no inventes hechos fuera de la fuente.
- la dificultad depende del razonamiento,
  no de palabras difíciles.`

        },

        {

          role:'user',

          content:
`MATERIA:

${slot.subject}


FORMATO:

drag_classify


${difficultyContext(slot)}


${sourceContext(slot)}


NÚMERO APROXIMADO DE ELEMENTOS:

mínimo ${minElements}
máximo ${maxElements}


FORMATO JSON EXACTO:

{
  "instruction":
    "Clasifica cada elemento.",

  "stem":
    "contexto breve si es necesario",

  "targets":[

    {
      "id":"target-1",
      "label":"Categoría A"
    },

    {
      "id":"target-2",
      "label":"Categoría B"
    }

  ],

  "elements":[

    {
      "id":"element-1",
      "text":"Elemento 1",
      "correctTargetId":"target-1"
    },

    {
      "id":"element-2",
      "text":"Elemento 2",
      "correctTargetId":"target-2"
    }

  ],

  "explanation":
    "explicación breve del criterio"
}


REGLAS FINALES:

- usa entre 2 y 4 categorías.
- usa entre ${minElements} y ${maxElements} elementos.
- utiliza al menos dos categorías.
- ningún elemento puede pertenecer
  correctamente a dos categorías.
- no hagas evidente la respuesta
  por similitud lingüística.
- en dificultad 4-5,
  integra conceptos o contexto.
- no escribas nada fuera del JSON.`
        }

      ],{

        temperature:
          0.25

      });


    return validateDragClassify(

      parseObject(raw),

      slot

    );

  }


  // =====================================
  // JUDGE
  // =====================================

  async function judgeDragClassify(
    question,
    slot
  ){

    const raw =
      await callAI([

        {

          role:'system',

          content:
`Eres NOA Judge especializado
en reactivos EXCOBA de clasificación.

Evalúa de 0 a 10:

source_fidelity
= fidelidad a la fuente.

difficulty_match
= coincidencia con la dificultad.

classification_quality
= categorías claras y mutuamente
discriminables.

element_quality
= elementos académicamente útiles
y no triviales.

ambiguity_control
= cada elemento tiene una sola
clasificación defendible.

reasoning_quality
= demanda cognitiva real.

clarity
= instrucciones y redacción claras.

Devuelve únicamente JSON válido.`

        },

        {

          role:'user',

          content:
`BLUEPRINT:

${JSON.stringify(
  {
    slotId:
      slot.slotId,

    subject:
      slot.subject,

    sourceType:
      slot.sourceType,

    difficulty:
      slot.difficulty,

    interactionType:
      slot.interactionType,

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

    targets:
      question.targets,

    elements:
      question.elements,

    correctResponse:
      question.correctResponse

  },
  null,
  2
)}


DEVUELVE:

{
  "source_fidelity":10,
  "difficulty_match":10,
  "classification_quality":10,
  "element_quality":10,
  "ambiguity_control":10,
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


    const values = [

      Number(
        j.source_fidelity
      ),

      Number(
        j.difficulty_match
      ),

      Number(
        j.classification_quality
      ),

      Number(
        j.element_quality
      ),

      Number(
        j.ambiguity_control
      ),

      Number(
        j.reasoning_quality
      ),

      Number(
        j.clarity
      )

    ].filter(
      Number.isFinite
    );


    const qualityScore =
      values.length

        ? values.reduce(
            (a,b) =>
              a + b,
            0
          ) /
          values.length

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

      classification_quality:
        Number(
          j.classification_quality
        ),

      element_quality:
        Number(
          j.element_quality
        ),

      ambiguity_control:
        Number(
          j.ambiguity_control
        ),

      reasoning_quality:
        Number(
          j.reasoning_quality
        ),

      clarity:
        Number(
          j.clarity
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


    const accepted =

      Number.isFinite(
        judge.qualityScore
      ) &&

      judge.qualityScore >= 8.2 &&

      judge.source_fidelity >= 9 &&

      judge.difficulty_match >= 7 &&

      judge.classification_quality >= 8 &&

      judge.element_quality >= 7 &&

      judge.ambiguity_control >= 8 &&

      judge.reasoning_quality >= 7 &&

      judge.clarity >= 8;


    return {

      ...question,

      judge,

      accepted

    };

  }


  // =====================================
  // GENERAR SLOT DRAG
  // =====================================

  async function generateDragSlot(
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


    let currentSlot =
      slot;


    let last =
      null;


    for(
      let attempt=0;
      attempt<maxAttempts;
      attempt++
    ){

      const question =
        await generateDragClassify(
          currentSlot
        );


      const judged =
        await judgeDragClassify(
          question,
          currentSlot
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
            currentSlot,

          attempts:
            attempt + 1

        };

      }


      console.warn(
        'NOA Drag Judge rechazó reactivo',
        {
          slot:
            currentSlot.slotId,

          attempt:
            attempt + 1,

          quality:
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
      'NOA Drag Judge no aprobó ' +
      'el reactivo. Último score: ' +
      (
        last
          ?.judge
          ?.qualityScore ??
        'N/D'
      )
    );

  }


  // =====================================
  // EXTENDER GENERATOR v9
  // =====================================

  const generator =
    window
      .NOA_BLUEPRINT_GENERATOR;


  if(!generator){

    throw new Error(
      'Generator Bridge v9 debe cargarse antes de v11'
    );

  }


  const previousGenerateSlot =
    generator.generateSlot;


  generator.generateSlot =
    async function(
      slot,
      options={}
    ){

      if(
        slot?.interactionType ===
        'drag_classify'
      ){

        return generateDragSlot(
          slot,
          options
        );

      }


      return previousGenerateSlot(
        slot,
        options
      );

    };


  // =====================================
  // EXTENDER BATCH v10
  // =====================================

  const batch =
    window
      .NOA_BATCH_ORCHESTRATOR;


  if(
    batch &&
    Array.isArray(
      batch.supportedTypes
    ) &&
    !batch
      .supportedTypes
      .includes(
        'drag_classify'
      )
  ){

    batch
      .supportedTypes
      .push(
        'drag_classify'
      );

  }


  // =====================================
  // API
  // =====================================

  window.NOA_DRAG_CLASSIFY = {

    version:
      VERSION,

    generate:
      generateDragClassify,

    judge:
      judgeDragClassify,

    generateSlot:
      generateDragSlot

  };


  console.log(
    'NOA EXCOBA Drag Classify Engine v11 ✓'
  );

})();
