/* =========================================================
   NOA EXCOBA MIXED EXAM ENGINE v13

   Integra dentro del examen real de NOA:

   - single_select
   - drag_classify
   - crédito parcial
   - navegación automática
   - Blueprint / Judge / Source traceability

   No modifica directamente index.html.
   ========================================================= */

(() => {

  const VERSION = '13.0';


  // =====================================
  // ESTADO
  // =====================================

  let mixedMode = false;

  const recorded =
    new Set();


  // =====================================
  // ESTILOS DE INTEGRACIÓN
  // =====================================

  function ensureStyles(){

    if(
      document.getElementById(
        'noaMixedExamStyles'
      )
    ){
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'noaMixedExamStyles';


    style.textContent = `

      body.noa-mixed-exam
      #noaDragClose{
        display:none !important;
      }


      .noa-mixed-continue{
        margin-top:18px;
        border:0;
        background:#34699a;
        color:white;
        padding:10px 20px;
        border-radius:4px;
        font-weight:700;
        cursor:pointer;
      }


      .noa-mixed-badge{
        display:inline-block;
        margin-top:10px;
        padding:5px 8px;
        border-radius:999px;
        background:#eef3f8;
        color:#40556b;
        font-size:12px;
      }

    `;


    document.head
      .appendChild(
        style
      );

  }


  // =====================================
  // NORMALIZAR BLUEPRINT
  // =====================================

  function legacyBlueprint(
    question
  ){

    const slot =
      question
        ?.blueprintSlot ||
      {};


    const difficulty =
      Number(
        question
          ?.difficulty ??
        slot
          ?.difficulty
          ?.level
      ) || 3;


    return {

      difficulty,

      cognitive_level:
        slot
          ?.difficulty
          ?.cognitive ||
        'application',

      reasoning_steps:
        slot
          ?.difficulty
          ?.reasoningSteps ||
        1,

      concepts_integrated:
        slot
          ?.difficulty
          ?.conceptsIntegrated ||
        1,

      interaction_type:
        question
          ?.interactionType ||
        'single_select',

      source_type:
        question
          ?.sourceType ||
        'official'

    };

  }


  // =====================================
  // ENCONTRAR TOPIC
  // =====================================

  function topicIdFor(
    question
  ){

    if(
      question?.topicId
    ){
      return question.topicId;
    }


    const codes = [

      question
        ?.syllabusCode,

      ...(
        question
          ?.syllabusCodes ||
        []
      )

    ]
      .filter(Boolean)
      .map(
        code =>
          String(code)
            .trim()
            .replace(/\.$/,'')
      );


    if(!codes.length){
      return '';
    }


    const topic =
      db.topics.find(
        t =>
          codes.includes(
            String(
              t.syllabusCode ||
              ''
            )
              .trim()
              .replace(/\.$/,'')
          )
      );


    return (
      topic?.id ||
      ''
    );

  }


  // =====================================
  // PREPARAR REACTIVO
  // =====================================

  function normalizeQuestion(
    question
  ){

    const q = {
      ...question
    };


    q.topicId =
      topicIdFor(q);


    q.blueprint =
      q.blueprint ||
      legacyBlueprint(q);


    if(
      q.interactionType ===
      'drag_classify'
    ){

      q.text =
        q.text ||
        [
          q.instruction,
          q.stem
        ]
          .filter(Boolean)
          .join(' — ');


      q.explain =
        q.explain ||
        q.explanation ||
        '';

    }


    if(
      q.interactionType ===
      'single_select'
    ){

      q.explain =
        q.explain ||
        q.explanation ||
        '';

    }


    return q;

  }


  // =====================================
  // CONVERTIR BATCH EN COLA
  // =====================================

  function questionsFromBatch(
    batch
  ){

    return (
      batch
        ?.generated ||
      []
    )
      .filter(
        item =>
          item &&
          item.question &&
          item.question.accepted === true &&
          !item.duplicate
      )
      .map(
        item =>
          normalizeQuestion(
            item.question
          )
      );

  }


  // =====================================
  // INICIAR EXAMEN MIXTO
  // =====================================

  function start(
    questions,
    title =
      'Simulacro EXCOBA mixto'
  ){

    if(
      !Array.isArray(
        questions
      ) ||
      !questions.length
    ){

      throw new Error(
        'No hay reactivos para iniciar el examen'
      );

    }


    ensureStyles();


    recorded.clear();


    mixedMode = true;


    document.body
      .classList
      .add(
        'noa-mixed-exam'
      );


    examQueue =
      questions.map(
        normalizeQuestion
      );


    examIndex = 0;

    examScore = 0;

    examAnswers = [];


    try{

      page(
        'exam',
        title
      );

    }catch{}


    renderExam();


    console.log(
      'NOA Mixed Exam iniciado',
      {
        total:
          examQueue.length,

        types:
          examQueue.map(
            q =>
              q.interactionType ||
              'single_select'
          )
      }
    );

  }


  // =====================================
  // RENDER EXAM ORIGINAL
  // =====================================

  const originalRenderExam =
    window.renderExam;


  if(
    typeof originalRenderExam !==
    'function'
  ){

    throw new Error(
      'NOA v13 no encontró renderExam()'
    );

  }


  // =====================================
  // RENDER DRAG
  // =====================================

  function renderDragQuestion(
    question
  ){

    const box =
      document.getElementById(
        'examBox'
      );


    if(box){

      box.innerHTML = `

        <div class="small">

          Pregunta
          ${examIndex + 1}
          /
          ${examQueue.length}

          · Reactivo interactivo

        </div>


        <h2 style="
          margin-top:12px;
        ">

          Clasificación de elementos

        </h2>


        <p class="muted">

          El reactivo se abrió
          en el simulador interactivo.

        </p>

      `;

    }


    window
      .NOA_DRAG_RENDERER
      .open(
        question
      );

  }


  // =====================================
  // WRAPPER DE renderExam()
  // =====================================

  window.renderExam =
    function(){

      if(
        !mixedMode
      ){

        return originalRenderExam();

      }


      // Examen terminado.
      // Dejar que NOA haga todo el
      // análisis final que ya tenía.

      if(
        examIndex >=
        examQueue.length
      ){

        document.body
          .classList
          .remove(
            'noa-mixed-exam'
          );


        try{

          window
            .NOA_DRAG_RENDERER
            ?.close?.();

        }catch{}


        mixedMode =
          false;


        return originalRenderExam();

      }


      const question =
        examQueue[
          examIndex
        ];


      if(
        question
          ?.interactionType ===
        'drag_classify'
      ){

        return renderDragQuestion(
          question
        );

      }


      // single_select sigue usando
      // exactamente el renderer anterior.

      return originalRenderExam();

    };


  // =====================================
  // REGISTRAR RESPUESTA DRAG
  // =====================================

  function recordDragAnswer(){

    if(
      !mixedMode
    ){
      return;
    }


    const q =
      examQueue[
        examIndex
      ];


    if(
      !q ||
      q.interactionType !==
        'drag_classify'
    ){
      return;
    }


    const state =
      window
        .NOA_DRAG_RENDERER
        ?.getState?.();


    if(
      !state ||
      !state.submitted ||
      !state.score
    ){
      return;
    }


    const key =
      `${examIndex}:${q.id}`;


    if(
      recorded.has(key)
    ){
      return;
    }


    recorded.add(key);


    const fraction =
      Math.max(
        0,
        Math.min(
          1,
          Number(
            state
              .score
              .score
          ) || 0
        )
      );


    // =================================
    // CRÉDITO PARCIAL
    // =================================

    examScore +=
      fraction;


    // =================================
    // ACTUALIZAR TOPIC
    // =================================

    const topic =
      topicBy(
        q.topicId
      );


    if(topic){

      topic.attempts =
        (
          topic.attempts ||
          0
        ) + 1;


      // Dominio también recibe
      // crédito fraccional.

      topic.correct =
        (
          topic.correct ||
          0
        ) +
        fraction;


      topic.lastSeen =
        new Date()
          .toISOString();

    }


    // =================================
    // ANALYTICS
    // =================================

    examAnswers.push({

      questionId:
        q.id || '',

      question:
        q.text || '',

      options:[],

      selected:null,

      correctIndex:null,


      // Compatibilidad con
      // estadísticas antiguas:
      // ok = crédito completo.

      ok:
        fraction === 1,


      scoreFraction:
        fraction,

      partialCredit:
        true,


      correctComponents:
        state
          .score
          .correct,

      totalComponents:
        state
          .score
          .total,


      assignments:{
        ...state.assignments
      },


      correctResponse:{
        ...q.correctResponse
      },


      topicId:
        q.topicId || '',

      syllabusCode:
        (
          q.syllabusCodes ||
          []
        )[0] || '',

      sourceType:
        q.sourceType ||
        '',

      interactionType:
        'drag_classify',

      blueprint:
        q.blueprint ||
        legacyBlueprint(q),

      judge:
        q.judge ||
        null,

      explanation:
        q.explain ||
        q.explanation ||
        ''

    });


    console.log(
      'NOA Mixed Exam · drag registrado',
      {
        fraction,
        examScore,
        answer:
          examAnswers[
            examAnswers.length - 1
          ]
      }
    );


    addContinueButton(
      fraction,
      state.score
    );

  }


  // =====================================
  // CONTINUAR DESPUÉS DE DRAG
  // =====================================

  function addContinueButton(
    fraction,
    score
  ){

    const result =
      document.getElementById(
        'noaDragResult'
      );


    if(
      !result ||
      document.getElementById(
        'noaMixedContinue'
      )
    ){
      return;
    }


    const pct =
      Math.round(
        fraction * 100
      );


    const info =
      document.createElement(
        'div'
      );


    info.className =
      'noa-mixed-badge';


    info.textContent =
      `Crédito del reactivo: ${pct}%`;


    const button =
      document.createElement(
        'button'
      );


    button.id =
      'noaMixedContinue';


    button.className =
      'noa-mixed-continue';


    button.textContent =
      examIndex + 1 <
      examQueue.length

        ? 'Continuar'

        : 'Ver resultado';


    result.appendChild(
      info
    );


    result.appendChild(
      document.createElement(
        'br'
      )
    );


    result.appendChild(
      button
    );

  }


  // =====================================
  // EVENT DELEGATION
  // =====================================

  document.addEventListener(
    'click',

    event => {


      // ---------------------------------
      // Después de pulsar Responder
      // en v12 esperamos un ciclo,
      // porque v12 vuelve a renderizar.
      // ---------------------------------

      if(
        event.target
          ?.closest?.(
            '#noaDragSubmit'
          )
      ){

        setTimeout(
          recordDragAnswer,
          0
        );

        return;

      }


      // ---------------------------------
      // CONTINUAR
      // ---------------------------------

      if(
        event.target
          ?.closest?.(
            '#noaMixedContinue'
          )
      ){

        try{

          window
            .NOA_DRAG_RENDERER
            .close();

        }catch{}


        examIndex++;


        renderExam();

      }

    }
  );


  // =====================================
  // GENERAR + INICIAR
  // =====================================

  async function generateAndStart({

    subject =
      'EXCOBA Medicina · Biología',

    blueprintCount = 10,

    maxAttempts = 2,

    concurrency = 2

  } = {}){


    const batch =
      await window
        .NOA_BATCH_ORCHESTRATOR
        .generate({

          subject,

          blueprintCount,

          // Queremos todos los slots
          // actualmente soportados.

          limit:
            Math.min(
              10,
              blueprintCount
            ),

          concurrency,

          maxAttempts

        });


    const questions =
      questionsFromBatch(
        batch
      );


    if(
      !questions.length
    ){

      throw new Error(
        'No se generaron reactivos compatibles'
      );

    }


    start(
      questions,
      'Simulacro EXCOBA · Motor mixto'
    );


    return {

      batch,

      questions

    };

  }


  // =====================================
  // INSPECCIÓN
  // =====================================

  function state(){

    return {

      mixedMode,

      examIndex,

      examScore,

      total:
        examQueue.length,

      current:
        examQueue[
          examIndex
        ] || null,

      answers:
        examAnswers

    };

  }


  // =====================================
  // API
  // =====================================

  window.NOA_MIXED_EXAM = {

    version:
      VERSION,

    start,

    generateAndStart,

    questionsFromBatch,

    state

  };


  console.log(
    'NOA EXCOBA Mixed Exam Engine v13 ✓'
  );

})();
