/* =========================================================
   NOA EXCOBA INLINE MIXED INTEGRATION v16

   Integra inline_select en:

   Batch Orchestrator v10
          ↓
   Mixed Exam v13
          ↓
   Inline Renderer v15
          ↓
   crédito parcial
          ↓
   analytics del examen

   No modifica index.html base.
   ========================================================= */

(() => {

  const VERSION = '16.0';

  const recorded =
    new Set();


  // =====================================
  // DEPENDENCIAS
  // =====================================

  if(
    !window.NOA_INLINE_SELECT
  ){
    throw new Error(
      'Inline Select Engine v14 no está cargado'
    );
  }


  if(
    !window.NOA_INLINE_RENDERER
  ){
    throw new Error(
      'Inline Renderer v15 no está cargado'
    );
  }


  if(
    !window.NOA_MIXED_EXAM
  ){
    throw new Error(
      'Mixed Exam Engine v13 no está cargado'
    );
  }


  if(
    !window.NOA_BATCH_ORCHESTRATOR
  ){
    throw new Error(
      'Batch Orchestrator v10 no está cargado'
    );
  }


  // =====================================
  // HABILITAR EN BATCH
  // =====================================

  const supported =
    window
      .NOA_BATCH_ORCHESTRATOR
      .supportedTypes;


  if(
    Array.isArray(supported) &&
    !supported.includes(
      'inline_select'
    )
  ){

    supported.push(
      'inline_select'
    );

  }


  // =====================================
  // ESTILOS
  // =====================================

  function ensureStyles(){

    if(
      document.getElementById(
        'noaInlineMixedStyles'
      )
    ){
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'noaInlineMixedStyles';


    style.textContent = `

      body.noa-mixed-exam
      #noaInlineClose{
        display:none !important;
      }


      .noa-inline-mixed-continue{

        margin-top:18px;

        border:0;

        background:#34699a;

        color:white;

        padding:10px 20px;

        border-radius:4px;

        font-weight:700;

        cursor:pointer;

      }


      .noa-inline-mixed-badge{

        display:inline-block;

        margin-top:12px;

        padding:5px 9px;

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


  ensureStyles();


  // =====================================
  // ESTADO MIXTO
  // =====================================

  function mixedState(){

    try{

      return (
        window
          .NOA_MIXED_EXAM
          .state() ||
        {}
      );

    }catch{

      return {};

    }

  }


  // =====================================
  // RENDER ANTERIOR
  // =====================================

  const previousRenderExam =
    window.renderExam;


  if(
    typeof previousRenderExam !==
    'function'
  ){

    throw new Error(
      'v16 no encontró renderExam()'
    );

  }


  // =====================================
  // RENDER INLINE
  // =====================================

  function renderInlineQuestion(
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


        <h2
          style="
            margin-top:12px;
          "
        >

          Selección dentro de texto

        </h2>


        <p class="muted">

          Completa los espacios
          seleccionando la opción
          correspondiente.

        </p>

      `;

    }


    window
      .NOA_INLINE_RENDERER
      .open(
        question
      );

  }


  // =====================================
  // EXTENDER renderExam()
  // =====================================

  window.renderExam =
    function(){

      const state =
        mixedState();


      // Si no estamos dentro del
      // motor mixto, v16 no interviene.

      if(
        !state.mixedMode
      ){

        return previousRenderExam();

      }


      // =================================
      // EXAMEN FINALIZADO
      // =================================

      if(
        examIndex >=
        examQueue.length
      ){

        try{

          window
            .NOA_INLINE_RENDERER
            .close();

        }catch{}


        return previousRenderExam();

      }


      const question =
        examQueue[
          examIndex
        ];


      // =================================
      // INLINE SELECT
      // =================================

      if(
        question
          ?.interactionType ===
        'inline_select'
      ){

        return renderInlineQuestion(
          question
        );

      }


      // drag_classify y single_select
      // siguen hacia v13.

      return previousRenderExam();

    };


  // =====================================
  // ACTUALIZAR TOPIC
  // =====================================

  function updateTopic(
    question,
    fraction
  ){

    if(
      !question?.topicId
    ){
      return;
    }


    const topic =
      topicBy(
        question.topicId
      );


    if(!topic){
      return;
    }


    topic.attempts =
      (
        topic.attempts ||
        0
      ) + 1;


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


  // =====================================
  // REGISTRAR RESPUESTA
  // =====================================

  function recordInlineAnswer(){

    const mixed =
      mixedState();


    if(
      !mixed.mixedMode
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
        'inline_select'
    ){
      return;
    }


    const state =
      window
        .NOA_INLINE_RENDERER
        .getState();


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
            state.score.score
          ) || 0
        )
      );


    // =================================
    // SCORE GLOBAL
    // =================================

    examScore +=
      fraction;


    // =================================
    // TOPIC
    // =================================

    updateTopic(
      q,
      fraction
    );


    // =================================
    // ANALYTICS
    // =================================

    const selections =
      Object.fromEntries(

        Object.entries(
          state.selections
        )
          .map(
            ([id,value]) => [
              id,
              value
            ]
          )

      );


    const correctResponse =
      Object.fromEntries(

        q.blanks.map(
          blank => [

            blank.id,

            blank.correct

          ]
        )

      );


    examAnswers.push({

      questionId:
        q.id || '',


      question:
        q.text || '',


      options:[],


      selected:null,


      correctIndex:null,


      // Para compatibilidad con
      // analytics viejos:
      // solo es "ok" si obtuvo
      // crédito completo.

      ok:
        fraction === 1,


      scoreFraction:
        fraction,


      partialCredit:
        true,


      correctComponents:
        state.score.correct,


      totalComponents:
        state.score.total,


      selections,


      correctResponse,


      topicId:
        q.topicId || '',


      syllabusCode:
        (
          q.syllabusCodes ||
          []
        )[0] || '',


      sourceType:
        q.sourceType || '',


      interactionType:
        'inline_select',


      blueprint:
        q.blueprint ||
        null,


      judge:
        q.judge ||
        null,


      explanation:
        q.explanation ||
        q.explain ||
        ''

    });


    console.log(

      'NOA Mixed Exam · inline registrado',

      {

        fraction,

        examScore,

        correct:
          state.score.correct,

        total:
          state.score.total

      }

    );


    addContinueButton(
      fraction
    );

  }


  // =====================================
  // CONTINUAR
  // =====================================

  function addContinueButton(
    fraction
  ){

    const result =
      document.getElementById(
        'noaInlineResult'
      );


    if(
      !result ||
      document.getElementById(
        'noaInlineMixedContinue'
      )
    ){
      return;
    }


    const pct =
      Math.round(
        fraction * 100
      );


    const badge =
      document.createElement(
        'div'
      );


    badge.className =
      'noa-inline-mixed-badge';


    badge.textContent =
      `Crédito del reactivo: ${pct}%`;


    const br =
      document.createElement(
        'br'
      );


    const button =
      document.createElement(
        'button'
      );


    button.id =
      'noaInlineMixedContinue';


    button.className =
      'noa-inline-mixed-continue';


    button.textContent =

      examIndex + 1 <
      examQueue.length

        ? 'Continuar'

        : 'Ver resultado';


    result.appendChild(
      badge
    );


    result.appendChild(
      br
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


      // =================================
      // RESPONDER INLINE
      // =================================

      if(
        event.target
          ?.closest?.(
            '#noaInlineSubmit'
          )
      ){

        // v15 vuelve a renderizar
        // después de submit().
        // Esperamos un ciclo para
        // leer el nuevo state.

        setTimeout(
          recordInlineAnswer,
          0
        );


        return;

      }


      // =================================
      // CONTINUAR INLINE
      // =================================

      if(
        event.target
          ?.closest?.(
            '#noaInlineMixedContinue'
          )
      ){

        try{

          window
            .NOA_INLINE_RENDERER
            .close();

        }catch{}


        examIndex++;


        renderExam();


        return;

      }

    }
  );


  // =====================================
  // API
  // =====================================

  window.NOA_INLINE_MIXED = {

    version:
      VERSION,

    supported:
      true,

    record:
      recordInlineAnswer

  };


  console.log(
    'NOA EXCOBA Inline Mixed Integration v16 ✓'
  );

})();
