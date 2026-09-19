/* =========================================================
   NOA EXCOBA DRAG ORDER MIXED INTEGRATION v19

   Integra drag_order en:

   Batch Orchestrator
          ↓
   Mixed Exam
          ↓
   Drag Order Renderer
          ↓
   crédito parcial
          ↓
   analytics

   ========================================================= */

(() => {

  const VERSION = '19.0';

  const recorded =
    new Set();


  // =====================================
  // DEPENDENCIAS
  // =====================================

  if(
    !window.NOA_DRAG_ORDER
  ){

    throw new Error(
      'Drag Order Engine v17 no está cargado'
    );

  }


  if(
    !window.NOA_DRAG_ORDER_RENDERER
  ){

    throw new Error(
      'Drag Order Renderer v18 no está cargado'
    );

  }


  if(
    !window.NOA_MIXED_EXAM
  ){

    throw new Error(
      'Mixed Exam v13 no está cargado'
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
  // HABILITAR FORMATO EN BATCH
  // =====================================

  const supported =
    window
      .NOA_BATCH_ORCHESTRATOR
      .supportedTypes;


  if(
    Array.isArray(
      supported
    ) &&
    !supported.includes(
      'drag_order'
    )
  ){

    supported.push(
      'drag_order'
    );

  }


  // =====================================
  // ESTILOS
  // =====================================

  function ensureStyles(){

    if(
      document.getElementById(
        'noaOrderMixedStyles'
      )
    ){
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'noaOrderMixedStyles';


    style.textContent = `

      body.noa-mixed-exam
      #noaOrderClose{

        display:none !important;

      }


      .noa-order-mixed-badge{

        display:inline-block;

        margin-top:12px;

        padding:
          5px 9px;

        border-radius:
          999px;

        background:
          #eef3f8;

        color:
          #40556b;

        font-size:
          12px;

      }


      .noa-order-mixed-continue{

        margin-top:18px;

        padding:
          10px 20px;

        border:0;

        border-radius:4px;

        background:#34699a;

        color:white;

        cursor:pointer;

        font-weight:700;

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
      'v19 no encontró renderExam()'
    );

  }


  // =====================================
  // RENDER DRAG ORDER
  // =====================================

  function renderOrderQuestion(
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

          Ordenamiento

        </h2>


        <p class="muted">

          Coloca los elementos
          en la secuencia correcta.

        </p>

      `;

    }


    window
      .NOA_DRAG_ORDER_RENDERER
      .open(
        question
      );

  }


  // =====================================
  // EXTENDER renderExam
  // =====================================

  window.renderExam =
    function(){

      const state =
        mixedState();


      // Fuera del examen mixto,
      // v19 no interviene.

      if(
        !state.mixedMode
      ){

        return previousRenderExam();

      }


      // =================================
      // FIN DEL EXAMEN
      // =================================

      if(
        examIndex >=
        examQueue.length
      ){

        try{

          window
            .NOA_DRAG_ORDER_RENDERER
            .close();

        }catch{}


        return previousRenderExam();

      }


      const question =
        examQueue[
          examIndex
        ];


      // =================================
      // DRAG ORDER
      // =================================

      if(
        question
          ?.interactionType ===
        'drag_order'
      ){

        return renderOrderQuestion(
          question
        );

      }


      // Los demás formatos siguen
      // hacia v16 → v13.

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

  function recordOrderAnswer(){

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
        'drag_order'
    ){
      return;
    }


    const state =
      window
        .NOA_DRAG_ORDER_RENDERER
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
            state
              .score
              .score
          ) || 0
        )
      );


    // =================================
    // SCORE GLOBAL
    // =================================

    examScore +=
      fraction;


    // =================================
    // DOMINIO
    // =================================

    updateTopic(
      q,
      fraction
    );


    // =================================
    // ANALYTICS
    // =================================

    examAnswers.push({

      questionId:
        q.id || '',


      question:
        [
          q.instruction,
          q.stem
        ]
          .filter(Boolean)
          .join(' — '),


      options:[],


      selected:null,


      correctIndex:null,


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


      exact:
        !!state.score.exact,


      order:[
        ...state.order
      ],


      correctOrder:[
        ...(
          q.correctOrder ||
          []
        )
      ],


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
        'drag_order',


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

      'NOA Mixed Exam · order registrado',

      {

        fraction,

        examScore,

        correctPairs:
          state.score.correct,

        totalPairs:
          state.score.total,

        exact:
          state.score.exact

      }

    );


    addContinueButton(
      fraction,
      state.score
    );

  }


  // =====================================
  // CONTINUAR
  // =====================================

  function addContinueButton(
    fraction,
    score
  ){

    const result =
      document.getElementById(
        'noaOrderResult'
      );


    if(
      !result ||
      document.getElementById(
        'noaOrderMixedContinue'
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
      'noa-order-mixed-badge';


    badge.textContent =
      `Crédito del reactivo: ${pct}%`;


    const detail =
      document.createElement(
        'div'
      );


    detail.style.marginTop =
      '7px';


    detail.style.fontSize =
      '13px';


    detail.style.color =
      '#555';


    detail.textContent =

      score.exact

        ? 'Secuencia exacta.'

        : (
            'Relaciones consecutivas correctas: ' +
            score.correct +
            '/' +
            score.total
          );


    const button =
      document.createElement(
        'button'
      );


    button.id =
      'noaOrderMixedContinue';


    button.className =
      'noa-order-mixed-continue';


    button.textContent =

      examIndex + 1 <
      examQueue.length

        ? 'Continuar'

        : 'Ver resultado';


    result.appendChild(
      badge
    );


    result.appendChild(
      detail
    );


    result.appendChild(
      button
    );

  }


  // =====================================
  // EVENTOS
  // =====================================

  document.addEventListener(
    'click',

    event => {


      // =================================
      // RESPONDER
      // =================================

      if(
        event.target
          ?.closest?.(
            '#noaOrderSubmit'
          )
      ){

        // v18 vuelve a renderizar
        // después de responder.

        setTimeout(
          recordOrderAnswer,
          0
        );


        return;

      }


      // =================================
      // CONTINUAR
      // =================================

      if(
        event.target
          ?.closest?.(
            '#noaOrderMixedContinue'
          )
      ){

        try{

          window
            .NOA_DRAG_ORDER_RENDERER
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

  window.NOA_DRAG_ORDER_MIXED = {

    version:
      VERSION,

    supported:
      true,

    record:
      recordOrderAnswer

  };


  console.log(
    'NOA EXCOBA Drag Order Mixed Integration v19 ✓'
  );

})();
