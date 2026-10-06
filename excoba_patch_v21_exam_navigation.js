/* =========================================================
   NOA EXCOBA EXAM NAVIGATION v21

   Navegación libre durante el examen:

   - mapa de reactivos clicable
   - anterior / siguiente
   - finalizar cuando todos los reactivos estén respondidos
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

  let renderGeneration = 0;
  let pendingRestore = null;

  let observedAnswers = null;
  let shellObserver = null;

  let recoverySnapshot = null;
  let recoveringSession = false;
  let checkpointAnswers = null;
  let sessionDatabase = null;
  let sessionTitle = '';
  let storageWarning = false;

  function deferForSession(callback, delay){
    const answers = examAnswers;
    setTimeout(() => {
      if(answers === examAnswers) callback();
    }, delay);
  }


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


  // El checkpoint comparte la escritura de db con el dominio de los temas.
  // Nunca reejecuta respuestas para reconstruir la puntuación guardada.
  function editorSnapshot(question){
    const type = question?.interactionType || 'single_select';
    const renderer = {
      drag_classify:window.NOA_DRAG_RENDERER,
      inline_select:window.NOA_INLINE_RENDERER,
      drag_order:window.NOA_DRAG_ORDER_RENDERER
    }[type];
    const state = renderer?.getState?.();
    if(!state || String(state.question?.id) !== String(question?.id)) return null;
    if(type === 'drag_classify'){
      return {type, assignments:clone(state.assignments), selectedItemId:state.selectedItemId ?? null};
    }
    if(type === 'inline_select') return {type, selections:clone(state.selections)};
    return {type, order:[...state.order]};
  }

  function persistSession(){
    if(recoveringSession || restoring || sessionDatabase !== db || !checkpointAnswers){
      return false;
    }
    try{
      if(examQueue.length && examIndex >= 0 && examIndex < examQueue.length){
        const mixed = mixedState().mixedMode;
        if(mixed){
          saveCurrentDraft();
          const question = currentQuestion();
          // Responder puede haber cerrado el renderer antes de record*(0).
          // Conservar el envío pendiente permite completarlo una sola vez al recuperar.
          if(!answerFor(question) && !pendingRestore){
            const snapshot = editorSnapshot(question);
            const renderer = {
              drag_classify:window.NOA_DRAG_RENDERER,
              inline_select:window.NOA_INLINE_RENDERER,
              drag_order:window.NOA_DRAG_ORDER_RENDERER
            }[snapshot?.type];
            if(snapshot && renderer?.getState?.()?.submitted){
              drafts.set(questionKey(question, examIndex), {...snapshot, submitted:true});
            }
          }
        }
        db.activeExam = {
          version:1,
          mixed,
          title:sessionTitle,
          queue:clone(examQueue),
          index:examIndex,
          score:examScore,
          answers:clone(examAnswers),
          drafts:mixed ? clone([...drafts]) : [],
          clock:mixed ? window.NOA_EXAM_SHELL.state() : null,
          revision:mixed ? window.NOA_ANSWER_REVISION?.capture?.() || null : null
        };
      }else{
        delete db.activeExam;
      }
      localStorage.setItem(KEY, JSON.stringify(db));
      storageWarning = false;
      const status = document.getElementById('saveState');
      if(status) status.textContent = 'Guardado automático ✓';
      return true;
    }catch(err){
      const status = document.getElementById('saveState');
      if(status) status.textContent = 'No se pudo guardar el examen';
      if(!storageWarning && typeof toast === 'function'){
        toast('No pude guardar el examen. Mantén esta pestaña abierta.');
      }
      storageWarning = true;
      return false;
    }
  }

  function deferCheckpoint(){
    if(recoveringSession || restoring) return;
    const answers = examAnswers;
    // Los motores registran el envío en un timeout de 0 ms.
    setTimeout(() => setTimeout(() => {
      if(answers === examAnswers) persistSession();
    }, 0), 0);
  }

  function validEditor(question, editor){
    if(!editor || typeof editor !== 'object' || Array.isArray(editor)) return false;
    const type = question.interactionType || 'single_select';
    if(type === 'single_select') return true;
    if(type === 'inline_select'){
      const selections = editor.selections;
      return selections && typeof selections === 'object' && !Array.isArray(selections) &&
        Object.keys(selections).length === question.blanks.length &&
        question.blanks.every(blank => selections[blank.id] === null ||
          Number.isInteger(selections[blank.id]) && selections[blank.id] >= 0 &&
          selections[blank.id] < blank.options.length);
    }
    if(type === 'drag_classify'){
      const assignments = editor.assignments;
      return assignments && typeof assignments === 'object' && !Array.isArray(assignments) &&
        Object.keys(assignments).length === question.elements.length &&
        question.elements.every(item => assignments[item.id] === null ||
          question.targets.some(target => target.id === assignments[item.id])) &&
        (editor.selectedItemId == null ||
          question.elements.some(item => item.id === editor.selectedItemId));
    }
    return Array.isArray(editor.order) && editor.order.length === question.items.length &&
      new Set(editor.order).size === question.items.length &&
      question.items.every(item => editor.order.includes(item.id));
  }

  function validRecovery(snapshot){
    if(!snapshot || snapshot.version !== 1 || typeof snapshot.mixed !== 'boolean' ||
      !Array.isArray(snapshot.queue) || !snapshot.queue.length ||
      !Number.isInteger(snapshot.index) || snapshot.index < 0 || snapshot.index >= snapshot.queue.length ||
      !Number.isFinite(snapshot.score) || snapshot.score < 0 || snapshot.score > snapshot.queue.length ||
      !Array.isArray(snapshot.answers) || !Array.isArray(snapshot.drafts)) return false;
    const questions = new Map();
    for(const question of snapshot.queue){
      const type = question?.interactionType || 'single_select';
      const id = String(question?.id || '');
      if(!id || questions.has(id) ||
        !['single_select','drag_classify','inline_select','drag_order'].includes(type) ||
        !snapshot.mixed && type !== 'single_select') return false;
      if(type === 'single_select' && (!Array.isArray(question.options) ||
        !Number.isInteger(question.correct) || question.correct < 0 || question.correct >= question.options.length)) return false;
      if(type === 'inline_select' && (!Array.isArray(question.blanks) || !question.blanks.length ||
        new Set(question.blanks.map(blank => blank.id)).size !== question.blanks.length ||
        question.blanks.some(blank => !Array.isArray(blank.options) || !blank.options.length ||
          !Number.isInteger(blank.correct) || blank.correct < 0 || blank.correct >= blank.options.length))) return false;
      if(type === 'drag_classify' && (!Array.isArray(question.elements) || !question.elements.length ||
        !Array.isArray(question.targets) || !question.targets.length ||
        new Set(question.elements.map(item => item.id)).size !== question.elements.length ||
        new Set(question.targets.map(target => target.id)).size !== question.targets.length)) return false;
      if(type === 'drag_order' && (!Array.isArray(question.items) || !question.items.length ||
        new Set(question.items.map(item => item.id)).size !== question.items.length ||
        !Array.isArray(question.correctOrder) || question.correctOrder.length !== question.items.length ||
        new Set(question.correctOrder).size !== question.items.length ||
        !question.items.every(item => question.correctOrder.includes(item.id)))) return false;
      questions.set(id, question);
    }
    const answered = new Set();
    let credit = 0;
    for(const answer of snapshot.answers){
      const id = String(answer?.questionId || '');
      const question = questions.get(id);
      if(!question || answer.questionId !== question.id || answered.has(id) ||
        !validEditor(question, answer)) return false;
      if((question.interactionType || 'single_select') === 'single_select' &&
        (!Number.isInteger(answer.selected) || answer.selected < 0 || answer.selected >= question.options.length ||
          answer.correctIndex !== question.correct)) return false;
      if(answer.scoreFraction !== undefined &&
        (!Number.isFinite(answer.scoreFraction) || answer.scoreFraction < 0 || answer.scoreFraction > 1)) return false;
      credit += answer.scoreFraction ?? (answer.ok ? 1 : 0);
      answered.add(id);
    }
    if(Math.abs(credit - snapshot.score) > 0.000001) return false;
    for(const entry of snapshot.drafts){
      if(!Array.isArray(entry) || entry.length !== 2 || !questions.has(String(entry[0])) ||
        entry[1]?.type !== (questions.get(String(entry[0])).interactionType || 'single_select') ||
        entry[1].submitted !== undefined && typeof entry[1].submitted !== 'boolean' ||
        !validEditor(questions.get(String(entry[0])), entry[1])) return false;
    }
    if(snapshot.revision){
      const question = snapshot.queue[snapshot.index];
      if(!snapshot.mixed || snapshot.revision.index !== snapshot.index ||
        String(snapshot.revision.questionId) !== String(question.id) ||
        snapshot.revision.type !== (question.interactionType || 'single_select') ||
        !answered.has(String(question.id)) || !validEditor(question, snapshot.revision.editor)) return false;
    }
    return !snapshot.mixed || snapshot.clock && Number.isFinite(snapshot.clock.startedAt) &&
      Number.isFinite(snapshot.clock.elapsed) && snapshot.clock.elapsed >= 0;
  }

  function recoverSession(){
    if(!db.activeExam) return false;
    try{
      const snapshot = clone(db.activeExam);
      if(!validRecovery(snapshot)) throw new Error('Checkpoint incompatible');
      recoveringSession = true;
      recoverySnapshot = snapshot;
      if(snapshot.mixed){
        window.NOA_MIXED_EXAM.start(snapshot.queue, snapshot.title);
      }else{
        beginExamQueue(snapshot.queue, snapshot.title);
      }
      recoveringSession = false;
      persistSession();
      if(typeof toast === 'function') toast('Examen recuperado. Puedes continuar.');
      return true;
    }catch(err){
      if(typeof toast === 'function') toast('No pude recuperar el examen guardado. Puedes iniciar otro.');
      return false;
    }finally{
      recoverySnapshot = null;
      recoveringSession = false;
    }
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

      body.noa-shell-active #toast{
        z-index:12001;
      }

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

    if(
      pendingRestore?.generation === renderGeneration &&
      pendingRestore.index === examIndex &&
      pendingRestore.key === key
    ){
      return;
    }


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

    if(!snapshot.submitted && snapshot.selectedItemId != null &&
      window.NOA_DRAG_RENDERER.getState()?.selectedItemId !== snapshot.selectedItemId){
      byDataset('[data-noa-drag-item]', 'noaDragItem', snapshot.selectedItemId)?.click();
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

    if(
      pendingRestore?.generation === renderGeneration &&
      pendingRestore.index === examIndex &&
      pendingRestore.key === questionKey(q, examIndex)
    ){
      pendingRestore = null;
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


    const answers = examAnswers;
    shellObserver?.disconnect();
    const observer =
      new MutationObserver(
        () => {

          if(answers !== examAnswers || !shell.isConnected){
            return;
          }

          deferForSession(
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

    shellObserver = observer;

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

      toast(
        `Aún tienes ${pending} ` +
        (
          pending === 1
            ? 'reactivo sin responder.'
            : 'reactivos sin responder.'
        ) +
        ' Completa los pendientes antes de ver el resultado.'
      );


      return;

    }


    saveCurrentDraft();


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


        deferForSession(
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

      let recovered = null;
      if(examQueue.length && examIndex >= 0 && examIndex < examQueue.length &&
        checkpointAnswers !== examAnswers){
        checkpointAnswers = examAnswers;
        sessionDatabase = db;
        sessionTitle = document.getElementById('pageTitle')?.textContent || 'Simulacro';
      }

      if(mixedState().mixedMode && observedAnswers !== examAnswers){
        observedAnswers = examAnswers;
        drafts.clear();
        pendingRestore = null;
        restoring = false;
        shellObserver?.disconnect();
        shellObserver = null;
      }

      if(recoverySnapshot){
        recovered = recoverySnapshot;
        recoverySnapshot = null;
        examIndex = recovered.index;
        examScore = recovered.score;
        // v22 ya observó este array: rellenarlo conserva la frontera de sesión.
        examAnswers.push(...clone(recovered.answers));
        drafts.clear();
        for(const [key, draft] of recovered.drafts) drafts.set(String(key), clone(draft));
        sessionTitle = recovered.title || sessionTitle;
      }

      if(examQueue.length && examIndex >= examQueue.length){
        // El núcleo persiste el intento al finalizar; no guardar una sesión terminada.
        delete db.activeExam;
      }

      // La generación sigue siendo monotónica entre sesiones.
      const generation = ++renderGeneration;
      const renderedIndex = examIndex;
      const renderedQuestion = currentQuestion();
      const renderedKey = questionKey(renderedQuestion, renderedIndex);

      // Proteger el borrador antes de que el renderer abra vacío.
      pendingRestore =
        mixedState().mixedMode &&
        renderedQuestion &&
        !isAnswered(renderedQuestion) &&
        drafts.has(renderedKey)
          ? {generation, index:renderedIndex, key:renderedKey}
          : null;

      const result =
        previousRenderExam
          .apply(
            this,
            args
          );

      if(recovered){
        if(recovered.mixed){
          window.NOA_EXAM_SHELL.restore(recovered.clock);
          if(recovered.revision && !window.NOA_ANSWER_REVISION.restore(recovered.revision)){
            throw new Error('No pude recuperar la revisión');
          }
        }
        const answer = answerFor(currentQuestion());
        if(answer && !recovered.revision &&
          (currentQuestion().interactionType || 'single_select') === 'single_select'){
          renderAnsweredSingle(currentQuestion(), answer);
          if(!recovered.mixed){
            const button = document.createElement('button');
            button.className = 'btn primary';
            button.textContent = 'Continuar';
            button.onclick = () => nextExam();
            document.getElementById('examBox').appendChild(button);
          }
        }
      }


      setTimeout(
        () => {

          if(
            generation !== renderGeneration ||
            renderedIndex !== examIndex ||
            renderedKey !== questionKey(currentQuestion(), examIndex)
          ){
            return;
          }

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

          const revision = window.NOA_ANSWER_REVISION?.active?.();
          if(revision && revision.index === examIndex &&
            String(revision.questionId) === String(q.id)){
            deferCheckpoint();
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

          deferCheckpoint();

        },
        60
      );

      persistSession();


      return result;

    };


  // =====================================
  // EVENTOS
  // =====================================

  // Ver resultado debe comprobar pendientes antes de que
  // los motores mixtos cierren el renderer e incrementen examIndex.
  document.addEventListener(
    'click',

    event => {

      if(
        mixedState().mixedMode &&
        examIndex === examQueue.length - 1 &&
        event.target?.closest?.(
          '#noaMixedContinue,' +
          '#noaInlineMixedContinue,' +
          '#noaOrderMixedContinue'
        )
      ){
        event.preventDefault();
        event.stopImmediatePropagation();
        finishExam();
      }

    },

    true
  );


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

        deferForSession(
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

  document.addEventListener('click', event => {
    if(event.target?.closest?.(
      '#examBox, #noaExamShell, #noaExamMap, #noaDragRendererRoot, #noaInlineRendererRoot, #noaOrderRendererRoot'
    )) deferCheckpoint();
  }, true);

  document.addEventListener('change', event => {
    if(event.target?.closest?.('#noaInlineRendererRoot')) deferCheckpoint();
  }, true);

  document.addEventListener('keydown', event => {
    if((event.key === 'Enter' || event.key === ' ') &&
      event.target?.closest?.('.noa-map-cell')) deferCheckpoint();
  }, true);

  window.addEventListener('pagehide', persistSession);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden') persistSession();
  });
  window.addEventListener('load', recoverSession);

  window.NOA_EXAM_RECOVERY = {
    save:persistSession,
    recover:recoverSession,
    state:() => ({saved:!!db.activeExam, recovering:recoveringSession})
  };

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
