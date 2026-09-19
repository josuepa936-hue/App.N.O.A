/* =========================================================
   NOA EXCOBA EXAM NAVIGATION v21

   Navegación libre durante el examen:

   - mapa de reactivos clicable
   - anterior / siguiente
   - finalizar cuando el usuario decida
   - conserva borradores interactivos
   - restaura:
       drag_classify
       inline_select
       drag_order
   - conserva respuestas ya enviadas
   - evita doble puntuación
   - ordena analytics al finalizar

   IMPORTANTE:
   las respuestas ya enviadas quedan bloqueadas.
   ========================================================= */

(() => {

  const VERSION = '21.0';

  const drafts =
    new Map();

  let restoring =
    false;


  // =====================================
  // DEPENDENCIAS
  // =====================================

  if(
    !window.NOA_MIXED_EXAM ||
    !window.NOA_EXAM_SHELL
  ){

    throw new Error(
      'v21 necesita Mixed Exam + Simulator Shell'
    );

  }


  // =====================================
  // UTILIDADES
  // =====================================

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


  function questionKey(
    question,
    index
  ){

    return String(
      question?.id ||
      question?.slotId ||
      `question-${index}`
    );

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


    const id =
      String(
        question.id || ''
      );


    return (
      examAnswers.find(
        answer =>
          String(
            answer.questionId || ''
          ) === id
      ) ||
      null
    );

  }


  function isAnswered(
    question
  ){

    return !!answerFor(
      question
    );

  }


  // =====================================
  // ESTILOS
  // =====================================

  function ensureStyles(){

    if(
      document.getElementById(
        'noaExamNavigationStyles'
      )
    ){
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'noaExamNavigationStyles';


    style.textContent = `

      .noa-shell-nav{

        margin-top:7px;

        display:flex;

        align-items:center;

        justify-content:center;

        gap:7px;

        flex-wrap:wrap;

      }


      .noa-shell-nav-btn{

        padding:
          5px 10px;

        border:
          1px solid #999;

        border-radius:4px;

        background:white;

        color:#333;

        cursor:pointer;

        font-size:12px;

        font-weight:600;

      }


      .noa-shell-nav-btn:hover{

        background:#f3f3f3;

      }


      .noa-shell-nav-btn:disabled{

        opacity:.35;

        cursor:not-allowed;

      }


      .noa-shell-finish{

        border-color:#8a4a4a;

        color:#843838;

      }


      .noa-map-cell{

        cursor:pointer;

        user-select:none;

      }


      .noa-map-cell:hover{

        filter:brightness(.96);

      }


      .noa-map-cell.drafted{

        border-color:#b28a32;

        background:#fff7dd;

        color:#755b1d;

      }


      .noa-map-dot.drafted{

        background:#fff7dd;

        border-color:#b28a32;

      }


      .noa-v21-readonly{

        display:grid;

        gap:12px;

      }


      .noa-v21-answer{

        padding:12px;

        border:
          1px solid #d2d2d2;

        background:#fafafa;

      }


      .noa-v21-answer.correct{

        border-color:#37945c;

        background:#effaf3;

      }


      .noa-v21-answer.wrong{

        border-color:#b73535;

        background:#fff1f1;

      }


      .noa-v21-locked{

        display:inline-block;

        margin-bottom:12px;

        padding:
          5px 9px;

        border-radius:999px;

        background:#eef3f8;

        color:#40556b;

        font-size:12px;

      }


      @media(max-width:760px){

        .noa-shell-nav{

          justify-content:flex-start;

        }


        .noa-shell-nav-btn{

          padding:
            5px 8px;

          font-size:11px;

        }

      }

    `;


    document.head
      .appendChild(
        style
      );

  }


  ensureStyles();


  // =====================================
  // GUARDAR BORRADOR ACTUAL
  // =====================================

  function saveCurrentDraft(){

    if(restoring){
      return;
    }


    const mixed =
      mixedState();


    if(
      !mixed.mixedMode
    ){
      return;
    }


    const q =
      currentQuestion();


    if(
      !q ||
      isAnswered(q)
    ){
      return;
    }


    const key =
      questionKey(
        q,
        examIndex
      );


    // =================================
    // DRAG CLASSIFY
    // =================================

    if(
      q.interactionType ===
      'drag_classify'
    ){

      const state =
        window
          .NOA_DRAG_RENDERER
          ?.getState?.();


      if(
        state &&
        !state.submitted
      ){

        drafts.set(
          key,
          {

            type:
              'drag_classify',

            assignments:
              clone(
                state.assignments
              ),

            selectedItemId:
              state.selectedItemId ||
              null

          }
        );

      }


      return;

    }


    // =================================
    // INLINE SELECT
    // =================================

    if(
      q.interactionType ===
      'inline_select'
    ){

      const state =
        window
          .NOA_INLINE_RENDERER
          ?.getState?.();


      if(
        state &&
        !state.submitted
      ){

        drafts.set(
          key,
          {

            type:
              'inline_select',

            selections:
              clone(
                state.selections
              )

          }
        );

      }


      return;

    }


    // =================================
    // DRAG ORDER
    // =================================

    if(
      q.interactionType ===
      'drag_order'
    ){

      const state =
        window
          .NOA_DRAG_ORDER_RENDERER
          ?.getState?.();


      if(
        state &&
        !state.submitted
      ){

        drafts.set(
          key,
          {

            type:
              'drag_order',

            order:
              [
                ...state.order
              ]

          }
        );

      }

    }

  }


  // =====================================
  // CERRAR RENDERERS
  // =====================================

  function closeRenderers(){

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
  // SNAPSHOT PARA RESTAURAR
  // =====================================

  function restoreData(
    question,
    index
  ){

    const answer =
      answerFor(
        question
      );


    // =================================
    // YA RESPONDIDA
    // =================================

    if(answer){

      if(
        question.interactionType ===
        'drag_classify'
      ){

        return {

          submitted:true,

          type:
            'drag_classify',

          assignments:
            clone(
              answer.assignments ||
              {}
            )

        };

      }


      if(
        question.interactionType ===
        'inline_select'
      ){

        return {

          submitted:true,

          type:
            'inline_select',

          selections:
            clone(
              answer.selections ||
              {}
            )

        };

      }


      if(
        question.interactionType ===
        'drag_order'
      ){

        return {

          submitted:true,

          type:
            'drag_order',

          order:[
            ...(
              answer.order ||
              []
            )
          ]

        };

      }


      return null;

    }


    // =================================
    // BORRADOR
    // =================================

    return (
      drafts.get(
        questionKey(
          question,
          index
        )
      ) ||
      null
    );

  }


  // =====================================
  // BUSCAR ELEMENTO POR DATASET
  // =====================================

  function byDataset(
    selector,
    property,
    value
  ){

    return (
      [
        ...document
          .querySelectorAll(
            selector
          )
      ]
        .find(
          node =>
            String(
              node.dataset[
                property
              ] || ''
            ) ===
            String(value)
        ) ||
      null
    );

  }


  // =====================================
  // RESTAURAR DRAG CLASSIFY
  // =====================================

  function restoreDrag(
    snapshot
  ){

    const assignments =
      snapshot
        ?.assignments ||
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
        byDataset(
          '[data-noa-drag-item]',
          'noaDragItem',
          itemId
        );


      item?.click();


      const target =
        byDataset(
          '[data-noa-target]',
          'noaTarget',
          targetId
        );


      target?.click();

    }


    if(
      snapshot.submitted
    ){

      document
        .getElementById(
          'noaDragSubmit'
        )
        ?.click();

    }

  }


  // =====================================
  // RESTAURAR INLINE
  // =====================================

  function restoreInline(
    snapshot
  ){

    const selections =
      snapshot
        ?.selections ||
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

      if(
        value === null ||
        value === undefined
      ){
        continue;
      }


      const select =
        byDataset(
          '[data-noa-inline]',
          'noaInline',
          blankId
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


    if(
      snapshot.submitted
    ){

      document
        .getElementById(
          'noaInlineSubmit'
        )
        ?.click();

    }

  }


  // =====================================
  // RESTAURAR DRAG ORDER
  // =====================================

  function restoreOrder(
    snapshot
  ){

    const desired =
      Array.isArray(
        snapshot?.order
      )
        ? snapshot.order
        : [];


    if(!desired.length){
      return;
    }


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
            ?.getState?.();


        const current =
          state?.order || [];


        const currentIndex =
          current.indexOf(
            wanted
          );


        if(
          currentIndex <=
          targetIndex
        ){
          break;
        }


        const up =
          byDataset(
            '[data-order-up]',
            'orderUp',
            wanted
          );


        if(!up){
          break;
        }


        up.click();

      }

    }


    if(
      snapshot.submitted
    ){

      document
        .getElementById(
          'noaOrderSubmit'
        )
        ?.click();

    }

  }


  // =====================================
  // RESTAURAR ACTUAL
  // =====================================

  function restoreCurrent(){

    const mixed =
      mixedState();


    if(
      !mixed.mixedMode
    ){
      return;
    }


    const q =
      currentQuestion();


    if(!q){
      return;
    }


    const snapshot =
      restoreData(
        q,
        examIndex
      );


    if(!snapshot){
      return;
    }


    restoring =
      true;


    try{

      if(
        q.interactionType ===
        'drag_classify'
      ){

        restoreDrag(
          snapshot
        );

      }


      if(
        q.interactionType ===
        'inline_select'
      ){

        restoreInline(
          snapshot
        );

      }


      if(
        q.interactionType ===
        'drag_order'
      ){

        restoreOrder(
          snapshot
        );

      }

    }finally{

      restoring =
        false;

    }

  }


  // =====================================
  // SINGLE SELECT YA RESPONDIDA
  // =====================================

  function renderAnsweredSingle(
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


    const correct =
      Number(
        answer.correctIndex
      );


    box.innerHTML = `

      <div
        class="noa-v21-readonly"
      >

        <div>

          <span
            class="noa-v21-locked"
          >
            Respuesta registrada
          </span>

          <div class="small">

            Pregunta
            ${examIndex + 1}
            /
            ${examQueue.length}

          </div>

        </div>


        <h2>

          ${esc(question.text)}

        </h2>


        ${
          question
            .options
            .map(
              (
                option,
                index
              ) => {

                let stateClass =
                  '';


                if(
                  index === correct
                ){

                  stateClass =
                    'correct';

                }else if(
                  index === selected
                ){

                  stateClass =
                    'wrong';

                }


                return `

                  <div
                    class="
                      noa-v21-answer
                      ${stateClass}
                    "
                  >

                    <b>
                      ${'ABCD'[index]})
                    </b>

                    ${esc(option)}

                  </div>

                `;

              }
            )
            .join('')
        }


        <div class="small">

          Tu respuesta:

          <b>
            ${'ABCD'[selected] || '-'}
          </b>

          · Respuesta correcta:

          <b>
            ${'ABCD'[correct] || '-'}
          </b>

        </div>


        ${
          answer.explanation

            ? `
              <p class="muted">
                ${esc(
                  answer.explanation
                )}
              </p>
            `

            : ''
        }

      </div>

    `;

  }


  // =====================================
  // CONTROLES DEL SHELL
  // =====================================

  function injectShellControls(){

    const shell =
      document.getElementById(
        'noaExamShell'
      );


    if(!shell){
      return;
    }


    const center =
      shell.querySelector(
        '.noa-shell-center'
      );


    if(
      !center ||
      document.getElementById(
        'noaShellNav'
      )
    ){
      return;
    }


    const nav =
      document.createElement(
        'div'
      );


    nav.id =
      'noaShellNav';


    nav.className =
      'noa-shell-nav';


    nav.innerHTML = `

      <button
        class="noa-shell-nav-btn"
        id="noaShellPrevious"

        ${
          examIndex <= 0
            ? 'disabled'
            : ''
        }
      >
        ← Anterior
      </button>


      <button
        class="noa-shell-nav-btn"
        id="noaShellNext"

        ${
          examIndex >=
          examQueue.length - 1
            ? 'disabled'
            : ''
        }
      >
        Siguiente →
      </button>


      <button
        class="
          noa-shell-nav-btn
          noa-shell-finish
        "
        id="noaShellFinish"
      >
        Finalizar
      </button>

    `;


    center.appendChild(
      nav
    );

  }


  // =====================================
  // OBSERVAR SHELL
  // =====================================

  function ensureShellObserver(){

    const shell =
      document.getElementById(
        'noaExamShell'
      );


    if(
      !shell ||
      shell.dataset
        .noaV21Observed
    ){
      return;
    }


    shell.dataset
      .noaV21Observed =
        '1';


    const observer =
      new MutationObserver(
        () => {

          setTimeout(
            () => {

              injectShellControls();

              refreshMap();

            },
            0
          );

        }
      );


    observer.observe(
      shell,
      {
        childList:true,
        subtree:true
      }
    );

  }


  // =====================================
  // MAPA CORRECTO
  // =====================================

  function refreshMap(){

    const mixed =
      mixedState();


    if(
      !mixed.mixedMode
    ){
      return;
    }


    const cells = [
      ...document
        .querySelectorAll(
          '.noa-map-cell'
        )
    ];


    if(!cells.length){
      return;
    }


    cells.forEach(
      (
        cell,
        index
      ) => {

        const q =
          examQueue[
            index
          ];


        if(!q){
          return;
        }


        const answered =
          isAnswered(q);


        const drafted =
          drafts.has(
            questionKey(
              q,
              index
            )
          );


        cell.dataset
          .noaQuestionIndex =
            String(index);


        cell.setAttribute(
          'role',
          'button'
        );


        cell.setAttribute(
          'tabindex',
          '0'
        );


        cell.classList.remove(
          'answered',
          'current',
          'pending',
          'drafted'
        );


        if(
          index ===
          examIndex
        ){

          cell.classList.add(
            'current'
          );


          cell.title =
            `Pregunta ${index + 1} · actual`;

        }else if(answered){

          cell.classList.add(
            'answered'
          );


          cell.title =
            `Pregunta ${index + 1} · respondida`;

        }else if(drafted){

          cell.classList.add(
            'drafted'
          );


          cell.title =
            `Pregunta ${index + 1} · en progreso`;

        }else{

          cell.classList.add(
            'pending'
          );


          cell.title =
            `Pregunta ${index + 1} · pendiente`;

        }

      }
    );


    const legend =
      document.querySelector(
        '.noa-map-legend'
      );


    if(
      legend &&
      !document.getElementById(
        'noaDraftLegend'
      )
    ){

      const row =
        document.createElement(
          'div'
        );


      row.id =
        'noaDraftLegend';


      row.innerHTML = `

        <span
          class="
            noa-map-dot
            drafted
          "
        ></span>

        En progreso

      `;


      legend.appendChild(
        row
      );

    }

  }


  // =====================================
  // NAVEGAR
  // =====================================

  function navigateTo(
    targetIndex
  ){

    const mixed =
      mixedState();


    if(
      !mixed.mixedMode
    ){
      return;
    }


    const target =
      Number(
        targetIndex
      );


    if(
      !Number.isInteger(
        target
      ) ||
      target < 0 ||
      target >=
        examQueue.length
    ){
      return;
    }


    if(
      target ===
      examIndex
    ){
      return;
    }


    saveCurrentDraft();


    closeRenderers();


    examIndex =
      target;


    renderExam();

  }


  // =====================================
  // ORDENAR ANALYTICS
  // =====================================

  function sortAnswers(){

    const positions =
      new Map();


    examQueue.forEach(
      (
        question,
        index
      ) => {

        positions.set(
          String(
            question.id || ''
          ),
          index
        );

      }
    );


    examAnswers.sort(
      (a,b) => {

        const pa =
          positions.get(
            String(
              a.questionId || ''
            )
          ) ?? 9999;


        const pb =
          positions.get(
            String(
              b.questionId || ''
            )
          ) ?? 9999;


        return pa - pb;

      }
    );

  }


  // =====================================
  // FINALIZAR EXAMEN
  // =====================================

  function finishExam(){

    const mixed =
      mixedState();


    if(
      !mixed.mixedMode
    ){
      return;
    }


    saveCurrentDraft();


    const answered =
      examQueue.filter(
        question =>
          isAnswered(
            question
          )
      ).length;


    const pending =
      examQueue.length -
      answered;


    if(
      pending > 0
    ){

      const proceed =
        window.confirm(

          `Aún tienes ${pending} ` +
          (
            pending === 1
              ? 'reactivo sin responder.'
              : 'reactivos sin responder.'
          ) +
          '\n\n' +
          'Si finalizas ahora, se contarán ' +
          'sin puntuación.'

        );


      if(!proceed){
        return;
      }

    }


    sortAnswers();


    closeRenderers();


    examIndex =
      examQueue.length;


    renderExam();


    drafts.clear();

  }


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

        const mixed =
          mixedState();


        if(
          !mixed.mixedMode
        ){

          return previousAnswerExam(
            optionIndex
          );

        }


        const q =
          currentQuestion();


        if(!q){
          return;
        }


        const existing =
          answerFor(q);


        // No volver a sumar.
        if(existing){

          renderAnsweredSingle(
            q,
            existing
          );


          return;

        }


        const result =
          previousAnswerExam(
            optionIndex
          );


        // Ya no existe borrador.
        drafts.delete(
          questionKey(
            q,
            examIndex
          )
        );


        setTimeout(
          () => {

            injectShellControls();

            refreshMap();

          },
          30
        );


        return result;

      };

  }


  // =====================================
  // WRAP nextExam
  // =====================================

  const previousNextExam =
    window.nextExam;


  if(
    typeof previousNextExam ===
    'function'
  ){

    window.nextExam =
      function(){

        const mixed =
          mixedState();


        if(
          !mixed.mixedMode
        ){

          return previousNextExam();

        }


        if(
          examIndex <
          examQueue.length - 1
        ){

          navigateTo(
            examIndex + 1
          );

        }

      };

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
        () => {

          const mixed =
            mixedState();


          if(
            !mixed.mixedMode
          ){

            drafts.clear();

            return;
          }


          injectShellControls();

          ensureShellObserver();

          refreshMap();


          const q =
            currentQuestion();


          if(!q){
            return;
          }


          // =================================
          // SINGLE YA RESPONDIDA
          // =================================

          if(
            q.interactionType ===
            'single_select'
          ){

            const answer =
              answerFor(q);


            if(answer){

              renderAnsweredSingle(
                q,
                answer
              );

            }

          }


          // =================================
          // INTERACTIVOS
          // =================================

          if(
            [
              'drag_classify',
              'inline_select',
              'drag_order'
            ].includes(
              q.interactionType
            )
          ){

            restoreCurrent();

          }

        },
        60
      );


      return result;

    };


  // =====================================
  // EVENTOS
  // =====================================

  document.addEventListener(
    'click',

    event => {


      // ---------------------------------
      // MAPA
      // ---------------------------------

      const cell =
        event.target
          ?.closest?.(
            '.noa-map-cell'
          );


      if(
        cell &&
        cell.dataset
          .noaQuestionIndex !==
          undefined
      ){

        navigateTo(
          Number(
            cell.dataset
              .noaQuestionIndex
          )
        );


        return;

      }


      // ---------------------------------
      // ANTERIOR
      // ---------------------------------

      if(
        event.target
          ?.closest?.(
            '#noaShellPrevious'
          )
      ){

        navigateTo(
          examIndex - 1
        );


        return;

      }


      // ---------------------------------
      // SIGUIENTE
      // ---------------------------------

      if(
        event.target
          ?.closest?.(
            '#noaShellNext'
          )
      ){

        navigateTo(
          examIndex + 1
        );


        return;

      }


      // ---------------------------------
      // FINALIZAR
      // ---------------------------------

      if(
        event.target
          ?.closest?.(
            '#noaShellFinish'
          )
      ){

        finishExam();


        return;

      }


      // ---------------------------------
      // ABRIR MAPA
      // ---------------------------------

      if(
        event.target
          ?.closest?.(
            '#noaShellMapButton'
          )
      ){

        setTimeout(
          refreshMap,
          20
        );

      }

    }
  );


  // =====================================
  // TECLADO EN CELDAS
  // =====================================

  document.addEventListener(
    'keydown',

    event => {

      if(
        ![
          'Enter',
          ' '
        ].includes(
          event.key
        )
      ){
        return;
      }


      const cell =
        event.target
          ?.closest?.(
            '.noa-map-cell'
          );


      if(
        !cell ||
        cell.dataset
          .noaQuestionIndex ===
          undefined
      ){
        return;
      }


      event.preventDefault();


      navigateTo(
        Number(
          cell.dataset
            .noaQuestionIndex
        )
      );

    }
  );


  // =====================================
  // API
  // =====================================

  window.NOA_EXAM_NAVIGATION = {

    version:
      VERSION,

    navigateTo,

    saveCurrentDraft,

    restoreCurrent,

    finishExam,

    refreshMap,

    drafts,

    state:
      () => ({

        current:
          examIndex,

        total:
          examQueue.length,

        answered:
          examQueue.filter(
            q =>
              isAnswered(q)
          ).length,

        drafts:
          drafts.size

      })

  };


  console.log(
    'NOA EXCOBA Exam Navigation v21 ✓'
  );

})();
