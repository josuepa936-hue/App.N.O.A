/* =========================================================
   NOA EXCOBA ANSWER REVISION ENGINE v22

   Permite modificar respuestas ya enviadas
   ANTES de finalizar el examen.

   Compatible con:
   - single_select
   - drag_classify
   - inline_select
   - drag_order

   Reglas:
   - no duplica intentos
   - no duplica examScore
   - aplica solo la diferencia de puntuación
   - conserva analytics
   - conserva topic.attempts
   ========================================================= */

(() => {

  const VERSION = '22.0';

  let revision = null;

  let revisionBannerObserver = null;


  // =====================================
  // DEPENDENCIAS
  // =====================================

  if(
    !window.NOA_EXAM_NAVIGATION ||
    !window.NOA_MIXED_EXAM
  ){

    throw new Error(
      'v22 necesita Exam Navigation v21'
    );

  }


  // =====================================
  // HELPERS
  // =====================================

  function esc(value){

    return String(
      value ?? ''
    )
      .replace(
        /[&<>"']/g,

        char => ({
          '&':'&amp;',
          '<':'&lt;',
          '>':'&gt;',
          '"':'&quot;',
          "'":'&#39;'
        }[char])
      );

  }


  function clone(value){

    try{

      if(
        typeof structuredClone ===
        'function'
      ){

        return structuredClone(
          value
        );

      }

    }catch{}


    return JSON.parse(
      JSON.stringify(
        value
      )
    );

  }


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


  function currentQuestion(){

    return (
      examQueue[
        examIndex
      ] ||
      null
    );

  }


  function answerFor(
    question
  ){

    if(!question){
      return null;
    }


    return (
      examAnswers.find(
        answer =>
          String(
            answer.questionId || ''
          ) ===
          String(
            question.id || ''
          )
      ) ||
      null
    );

  }


  function fractionOf(
    answer
  ){

    if(!answer){
      return 0;
    }


    if(
      Number.isFinite(
        Number(
          answer.scoreFraction
        )
      )
    ){

      return Math.max(
        0,
        Math.min(
          1,
          Number(
            answer.scoreFraction
          )
        )
      );

    }


    return answer.ok
      ? 1
      : 0;

  }


  function roundScore(
    value
  ){

    return (
      Math.round(
        Number(value) *
        1000000000
      ) /
      1000000000
    );

  }


  // =====================================
  // ESTILOS
  // =====================================

  function ensureStyles(){

    if(
      document.getElementById(
        'noaAnswerRevisionStyles'
      )
    ){
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'noaAnswerRevisionStyles';


    style.textContent = `

      .noa-revision-button{

        margin-top:14px;

        padding:
          8px 14px;

        border:
          1px solid #8b8b8b;

        border-radius:4px;

        background:white;

        color:#333;

        cursor:pointer;

        font-weight:700;

      }


      .noa-revision-button:hover{

        background:#f3f3f3;

      }


      .noa-revision-banner{

        margin-bottom:16px;

        padding:
          10px 12px;

        border-left:
          4px solid #b28a32;

        background:#fff7dd;

        color:#604b18;

        font-size:13px;

      }


      .noa-revision-cancel{

        margin-top:12px;

        padding:
          7px 12px;

        border:
          1px solid #999;

        border-radius:4px;

        background:white;

        cursor:pointer;

      }


      .noa-revision-single-options{

        display:grid;

        gap:9px;

        margin-top:18px;

      }


      .noa-revision-single-option{

        padding:
          12px;

        border:
          1px solid #aaa;

        border-radius:4px;

        background:white;

        color:#222;

        text-align:left;

        cursor:pointer;

        font-size:15px;

      }


      .noa-revision-single-option.selected{

        border:
          2px solid #315f91;

        background:#eaf2fb;

      }

    `;


    document.head
      .appendChild(
        style
      );

  }


  ensureStyles();


  // =====================================
  // CERRAR RENDERERS
  // =====================================

  function closeRenderers(){

    revisionBannerObserver?.disconnect();
    revisionBannerObserver = null;

    try{

      window
        .NOA_DRAG_RENDERER
        ?.close?.();

    }catch{}


    try{

      window
        .NOA_INLINE_RENDERER
        ?.close?.();

    }catch{}


    try{

      window
        .NOA_DRAG_ORDER_RENDERER
        ?.close?.();

    }catch{}

  }


  // =====================================
  // ACTUALIZAR DOMINIO
  // =====================================

  function applyTopicDelta(
    question,
    delta
  ){

    if(
      !question?.topicId ||
      !delta
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


    topic.correct =
      Math.max(
        0,
        roundScore(
          (
            topic.correct ||
            0
          ) +
          delta
        )
      );


    // IMPORTANTE:
    // attempts NO aumenta.
    // Sigue siendo el mismo reactivo.

    topic.lastSeen =
      new Date()
        .toISOString();

  }


  // =====================================
  // COMMIT DE UNA REVISIÓN
  // =====================================

  function commitRevision(
    newFraction,
    patch
  ){

    if(!revision){
      return;
    }


    const q =
      currentQuestion();


    if(
      !q ||
      String(q.id) !==
      String(
        revision.questionId
      )
    ){
      return;
    }


    const answer =
      answerFor(q);


    if(!answer){
      return;
    }


    const oldFraction =
      fractionOf(
        answer
      );


    const nextFraction =
      Math.max(
        0,
        Math.min(
          1,
          Number(
            newFraction
          ) || 0
        )
      );


    const delta =
      nextFraction -
      oldFraction;


    // =================================
    // SCORE GLOBAL
    // =================================

    examScore =
      Math.max(
        0,
        roundScore(
          examScore +
          delta
        )
      );


    // =================================
    // TOPIC
    // =================================

    applyTopicDelta(
      q,
      delta
    );


    // =================================
    // ACTUALIZAR MISMO ANSWER
    // =================================

    Object.assign(
      answer,
      patch,
      {

        ok:
          nextFraction === 1,

        scoreFraction:
          nextFraction,

        revised:
          true,

        revisedAt:
          new Date()
            .toISOString()

      }
    );


    console.log(
      'NOA · respuesta revisada',
      {

        question:
          examIndex + 1,

        oldFraction,

        newFraction:
          nextFraction,

        delta,

        examScore

      }
    );


    revision =
      null;


    closeRenderers();


    renderExam();


    setTimeout(
      () => {

        window
          .NOA_EXAM_NAVIGATION
          ?.refreshMap?.();

        window
          .NOA_EXAM_SHELL
          ?.sync?.();

      },
      80
    );

  }


  // =====================================
  // RESTAURAR DRAG CLASSIFY PARA EDITAR
  // =====================================

  function openDragEditor(
    question,
    answer
  ){

    closeRenderers();


    window
      .NOA_DRAG_RENDERER
      .open(
        question
      );


    const assignments =
      answer.assignments ||
      {};


    for(
      const [
        itemId,
        targetId
      ]
      of Object.entries(
        assignments
      )
    ){

      if(!targetId){
        continue;
      }


      const item =
        [
          ...document
            .querySelectorAll(
              '[data-noa-drag-item]'
            )
        ]
          .find(
            node =>
              String(
                node.dataset
                  .noaDragItem
              ) ===
              String(itemId)
          );


      item?.click();


      const target =
        [
          ...document
            .querySelectorAll(
              '[data-noa-target]'
            )
        ]
          .find(
            node =>
              String(
                node.dataset
                  .noaTarget
              ) ===
              String(targetId)
          );


      target?.click();

    }


    observeRevisionBanner(
      'noaDragRendererRoot',
      '.noa-drag-question'
    );

  }


  // =====================================
  // INLINE PARA EDITAR
  // =====================================

  function openInlineEditor(
    question,
    answer
  ){

    closeRenderers();


    window
      .NOA_INLINE_RENDERER
      .open(
        question
      );


    const selections =
      answer.selections ||
      {};


    for(
      const [
        blankId,
        value
      ]
      of Object.entries(
        selections
      )
    ){

      const select =
        [
          ...document
            .querySelectorAll(
              '[data-noa-inline]'
            )
        ]
          .find(
            node =>
              String(
                node.dataset
                  .noaInline
              ) ===
              String(blankId)
          );


      if(!select){
        continue;
      }


      select.value =
        String(value);


      select.dispatchEvent(
        new Event(
          'change',
          {
            bubbles:true
          }
        )
      );

    }


    observeRevisionBanner(
      'noaInlineRendererRoot',
      '.noa-inline-card'
    );

  }


  // =====================================
  // ORDER PARA EDITAR
  // =====================================

  function openOrderEditor(
    question,
    answer
  ){

    closeRenderers();


    window
      .NOA_DRAG_ORDER_RENDERER
      .open(
        question
      );


    const desired =
      Array.isArray(
        answer.order
      )
        ? answer.order
        : [];


    let guard = 0;


    for(
      let targetIndex=0;
      targetIndex<
        desired.length;
      targetIndex++
    ){

      const wanted =
        desired[
          targetIndex
        ];


      while(
        guard < 100
      ){

        guard++;


        const state =
          window
            .NOA_DRAG_ORDER_RENDERER
            .getState();


        const currentIndex =
          state
            .order
            .indexOf(
              wanted
            );


        if(
          currentIndex <=
          targetIndex
        ){
          break;
        }


        const button =
          [
            ...document
              .querySelectorAll(
                '[data-order-up]'
              )
          ]
            .find(
              node =>
                String(
                  node.dataset
                    .orderUp
                ) ===
                String(wanted)
            );


        if(!button){
          break;
        }


        button.click();

      }

    }


    observeRevisionBanner(
      'noaOrderRendererRoot',
      '.noa-order-card'
    );

  }


  // =====================================
  // BANNER
  // =====================================

  function observeRevisionBanner(
    rootId,
    selector
  ){

    const root = document.getElementById(rootId);
    const activeRevision = revision;

    if(!root || !activeRevision){
      return;
    }

    injectRevisionBanner(selector, root);

    revisionBannerObserver = new MutationObserver(() => {
      if(revision === activeRevision && root.isConnected){
        injectRevisionBanner(selector, root);
      }
    });

    // Los renderers reemplazan root.innerHTML al editar.
    // Observar solo sus hijos evita reaccionar al propio banner.
    revisionBannerObserver.observe(root, {childList:true});

  }


  function injectRevisionBanner(
    selector,
    root
  ){

    const container =
      root.querySelector(
        selector
      );


    if(
      !container ||
      container.querySelector('.noa-revision-banner')
    ){
      return;
    }


    const banner =
      document.createElement(
        'div'
      );


    banner.className =
      'noa-revision-banner';


    banner.innerHTML = `

      <b>
        Editando respuesta
      </b>

      <br>

      Los cambios reemplazarán
      tu respuesta anterior.

      <br>

      <button
        class="noa-revision-cancel"
        id="noaRevisionCancel"
      >
        Cancelar cambio
      </button>

    `;


    container.prepend(
      banner
    );

  }


  // =====================================
  // EDITOR SINGLE SELECT
  // =====================================

  function renderSingleEditor(
    question,
    answer
  ){

    const box =
      document.getElementById(
        'examBox'
      );


    if(!box){
      return;
    }


    const selected =
      Number(
        answer.selected
      );


    box.innerHTML = `

      <div
        class="noa-revision-banner"
      >

        <b>
          Editando respuesta
        </b>

        <br>

        Selecciona una nueva opción.

        <br>

        <button
          class="noa-revision-cancel"
          id="noaRevisionCancel"
        >
          Cancelar cambio
        </button>

      </div>


      <div class="small">

        Pregunta
        ${examIndex + 1}
        /
        ${examQueue.length}

      </div>


      <h2>

        ${esc(
          question.text
        )}

      </h2>


      <div
        class="
          noa-revision-single-options
        "
      >

        ${
          question.options
            .map(
              (
                option,
                index
              ) => `

                <button
                  class="
                    noa-revision-single-option
                    ${
                      index === selected
                        ? 'selected'
                        : ''
                    }
                  "

                  data-noa-revision-option="${
                    index
                  }"
                >

                  <b>
                    ${'ABCD'[index]})
                  </b>

                  ${esc(option)}

                </button>

              `
            )
            .join('')
        }

      </div>

    `;

  }


  // =====================================
  // INICIAR REVISIÓN
  // =====================================

  function beginRevision(){

    const mixed =
      mixedState();


    if(
      !mixed.mixedMode ||
      revision
    ){
      return;
    }


    const q =
      currentQuestion();


    const answer =
      answerFor(q);


    if(
      !q ||
      !answer
    ){
      return;
    }


    revision = {

      index:
        examIndex,

      questionId:
        q.id,

      type:
        q.interactionType ||
        'single_select'

    };


    const type =
      q.interactionType ||
      'single_select';


    if(
      type ===
      'drag_classify'
    ){

      openDragEditor(
        q,
        answer
      );


      return;

    }


    if(
      type ===
      'inline_select'
    ){

      openInlineEditor(
        q,
        answer
      );


      return;

    }


    if(
      type ===
      'drag_order'
    ){

      openOrderEditor(
        q,
        answer
      );


      return;

    }


    renderSingleEditor(
      q,
      answer
    );

  }


  // =====================================
  // CANCELAR
  // =====================================

  function cancelRevision(){

    if(!revision){
      return;
    }


    revision =
      null;


    closeRenderers();


    renderExam();

  }


  // =====================================
  // BOTÓN CAMBIAR RESPUESTA
  // =====================================

  function injectEditButton(){

    const mixed =
      mixedState();


    if(
      !mixed.mixedMode ||
      revision
    ){
      return;
    }


    const q =
      currentQuestion();


    const answer =
      answerFor(q);


    if(
      !q ||
      !answer ||
      document.getElementById(
        'noaRevisionEdit'
      )
    ){
      return;
    }


    let container =
      null;


    if(
      q.interactionType ===
      'drag_classify'
    ){

      container =
        document.getElementById(
          'noaDragResult'
        );

    }else if(
      q.interactionType ===
      'inline_select'
    ){

      container =
        document.getElementById(
          'noaInlineResult'
        );

    }else if(
      q.interactionType ===
      'drag_order'
    ){

      container =
        document.getElementById(
          'noaOrderResult'
        );

    }else{

      container =
        document.getElementById(
          'examBox'
        );

    }


    if(!container){
      return;
    }


    const button =
      document.createElement(
        'button'
      );


    button.id =
      'noaRevisionEdit';


    button.className =
      'noa-revision-button';


    button.textContent =
      'Cambiar respuesta';


    container.appendChild(
      button
    );

  }


  // =====================================
  // SUBMIT DRAG REVISADO
  // =====================================

  function commitDrag(){

    const q =
      currentQuestion();


    const state =
      window
        .NOA_DRAG_RENDERER
        .getState();


    const score =
      window
        .NOA_DRAG_RENDERER
        .calculateScore();


    if(
      !q ||
      !state ||
      !score
    ){
      return;
    }


    commitRevision(
      score.score,
      {

        interactionType:
          'drag_classify',

        partialCredit:
          true,

        correctComponents:
          score.correct,

        totalComponents:
          score.total,

        assignments:
          clone(
            state.assignments
          ),

        correctResponse:
          clone(
            q.correctResponse ||
            {}
          )

      }
    );

  }


  // =====================================
  // SUBMIT INLINE REVISADO
  // =====================================

  function commitInline(){

    const q =
      currentQuestion();


    const state =
      window
        .NOA_INLINE_RENDERER
        .getState();


    const score =
      window
        .NOA_INLINE_RENDERER
        .calculateScore();


    if(
      !q ||
      !state ||
      !score
    ){
      return;
    }


    const complete =
      q.blanks.every(
        blank =>
          state
            .selections[
              blank.id
            ] !== null
      );


    if(!complete){

      if(
        typeof toast ===
        'function'
      ){

        toast(
          'Completa todos los espacios'
        );

      }


      return;

    }


    commitRevision(
      score.score,
      {

        interactionType:
          'inline_select',

        partialCredit:
          true,

        correctComponents:
          score.correct,

        totalComponents:
          score.total,

        selections:
          clone(
            state.selections
          ),

        correctResponse:
          Object.fromEntries(

            q.blanks.map(
              blank => [
                blank.id,
                blank.correct
              ]
            )

          )

      }
    );

  }


  // =====================================
  // SUBMIT ORDER REVISADO
  // =====================================

  function commitOrder(){

    const q =
      currentQuestion();


    const state =
      window
        .NOA_DRAG_ORDER_RENDERER
        .getState();


    const score =
      window
        .NOA_DRAG_ORDER_RENDERER
        .calculateScore();


    if(
      !q ||
      !state ||
      !score
    ){
      return;
    }


    commitRevision(
      score.score,
      {

        interactionType:
          'drag_order',

        partialCredit:
          true,

        correctComponents:
          score.correct,

        totalComponents:
          score.total,

        exact:
          !!score.exact,

        order:[
          ...state.order
        ],

        correctOrder:[
          ...(
            q.correctOrder ||
            []
          )
        ]

      }
    );

  }


  // =====================================
  // SINGLE REVISADO
  // =====================================

  function commitSingle(
    optionIndex
  ){

    const q =
      currentQuestion();


    if(!q){
      return;
    }


    const selected =
      Number(
        optionIndex
      );


    const ok =
      selected ===
      q.correct;


    commitRevision(
      ok ? 1 : 0,
      {

        interactionType:
          'single_select',

        partialCredit:
          false,

        question:
          q.text,

        options:[
          ...q.options
        ],

        selected,

        correctIndex:
          q.correct,

        explanation:
          q.explain ||
          q.explanation ||
          ''

      }
    );

  }


  // =====================================
  // BLOQUEAR NAVEGACIÓN DURANTE EDICIÓN
  // =====================================

  function navigationAttempt(
    event
  ){

    if(!revision){
      return false;
    }


    const target =
      event.target;


    if(
      target
        ?.closest?.(
          '.noa-map-cell,' +
          '#noaShellPrevious,' +
          '#noaShellNext,' +
          '#noaShellFinish'
        )
    ){

      event.preventDefault();

      event.stopImmediatePropagation();


      if(
        typeof toast ===
        'function'
      ){

        toast(
          'Guarda o cancela el cambio primero'
        );

      }


      return true;

    }


    return false;

  }


  // =====================================
  // WRAP renderExam
  // =====================================

  const previousRenderExam =
    window.renderExam;


  window.renderExam =
    function(
      ...args
    ){

      const result =
        previousRenderExam
          .apply(
            this,
            args
          );


      setTimeout(
        injectEditButton,
        130
      );


      return result;

    };


  // =====================================
  // WRAP answerExam
  // =====================================

  const previousAnswerExam =
    window.answerExam;


  if(
    typeof previousAnswerExam ===
    'function'
  ){

    window.answerExam =
      function(
        optionIndex
      ){

        const result =
          previousAnswerExam(
            optionIndex
          );


        setTimeout(
          injectEditButton,
          80
        );


        return result;

      };

  }


  // =====================================
  // EVENTOS — CAPTURE
  // =====================================

  document.addEventListener(
    'keydown',

    event => {

      if(
        ['Enter',' '].includes(event.key) &&
        event.target?.closest?.('.noa-map-cell')
      ){
        navigationAttempt(event);
      }

    },

    true
  );


  document.addEventListener(
    'click',

    event => {


      // =================================
      // DURANTE REVISIÓN:
      // BLOQUEAR NAVEGACIÓN
      // =================================

      if(
        navigationAttempt(
          event
        )
      ){
        return;
      }


      // =================================
      // ABRIR EDICIÓN
      // =================================

      if(
        event.target
          ?.closest?.(
            '#noaRevisionEdit'
          )
      ){

        event.preventDefault();

        event.stopImmediatePropagation();


        beginRevision();


        return;

      }


      // =================================
      // CANCELAR
      // =================================

      if(
        event.target
          ?.closest?.(
            '#noaRevisionCancel'
          )
      ){

        event.preventDefault();

        event.stopImmediatePropagation();


        cancelRevision();


        return;

      }


      if(!revision){
        return;
      }


      // =================================
      // SINGLE SELECT EDITADO
      // =================================

      const option =
        event.target
          ?.closest?.(
            '[data-noa-revision-option]'
          );


      if(option){

        event.preventDefault();

        event.stopImmediatePropagation();


        commitSingle(
          Number(
            option.dataset
              .noaRevisionOption
          )
        );


        return;

      }


      // =================================
      // DRAG CLASSIFY EDITADO
      // =================================

      if(
        event.target
          ?.closest?.(
            '#noaDragSubmit'
          )
      ){

        event.preventDefault();

        event.stopImmediatePropagation();


        commitDrag();


        return;

      }


      // =================================
      // INLINE EDITADO
      // =================================

      if(
        event.target
          ?.closest?.(
            '#noaInlineSubmit'
          )
      ){

        event.preventDefault();

        event.stopImmediatePropagation();


        commitInline();


        return;

      }


      // =================================
      // ORDER EDITADO
      // =================================

      if(
        event.target
          ?.closest?.(
            '#noaOrderSubmit'
          )
      ){

        event.preventDefault();

        event.stopImmediatePropagation();


        commitOrder();


        return;

      }

    },

    true
  );


  // =====================================
  // DESPUÉS DE RESPONDER POR PRIMERA VEZ
  // =====================================

  document.addEventListener(
    'click',

    event => {

      if(
        event.target
          ?.closest?.(
            '#noaDragSubmit,' +
            '#noaInlineSubmit,' +
            '#noaOrderSubmit'
          )
      ){

        setTimeout(
          injectEditButton,
          100
        );

      }

    }
  );


  // =====================================
  // API
  // =====================================

  window.NOA_ANSWER_REVISION = {

    version:
      VERSION,

    begin:
      beginRevision,

    cancel:
      cancelRevision,

    active:
      () =>
        revision,

    state:
      () => ({

        revision:
          revision
            ? {...revision}
            : null,

        currentQuestion:
          examIndex,

        examScore

      })

  };


  console.log(
    'NOA EXCOBA Answer Revision v22 ✓'
  );

})();
