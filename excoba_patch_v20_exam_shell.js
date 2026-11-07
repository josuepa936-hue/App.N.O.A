/* =========================================================
   NOA EXCOBA SIMULATOR SHELL v20

   Interfaz unificada para el examen mixto:

   - barra superior
   - cronómetro
   - contador de preguntas
   - cuadrícula de navegación visual
   - estados:
       respondida
       actual
       pendiente
   - oculta interfaz general de NOA
     durante el simulacro

   La navegación libre todavía NO está habilitada.
   ========================================================= */

(() => {

  const VERSION = '20.0';

  let startedAt = null;

  let timerHandle = null;

  let mapOpen = false;

  let observedAnswers = null;

  // Timed sessions are opt-in; recovery always reuses the stored deadline.
  let timing = null;
  let completionPromise = null;
  let completionError = null;
  const copy = value => JSON.parse(JSON.stringify(value));

  function configuration(){
    if(!document.getElementById('noaExamTimed')?.checked) return null;
    const minutes = Number(document.getElementById('noaExamDurationMinutes')?.value);
    if(!Number.isInteger(minutes) || minutes < 1 || minutes > 1440){
      throw new Error('Elige una duración de práctica entre 1 y 1440 minutos.');
    }
    return {durationMs:minutes * 60000};
  }

  function validTiming(value, questions = examQueue){
    if(!value || value.version !== 26 || typeof value.attemptId !== 'string' ||
      !value.attemptId.trim() || value.attemptId.length > 256 ||
      !Number.isSafeInteger(value.startedAt) || value.startedAt <= 0 ||
      !Number.isSafeInteger(value.durationMs) || value.durationMs < 60000 || value.durationMs > 86400000 ||
      !Number.isSafeInteger(value.deadlineAt) || value.deadlineAt !== value.startedAt + value.durationMs ||
      !['open','closing','closed'].includes(value.status) ||
      !Array.isArray(value.presentedQuestionIds) ||
      value.presentedQuestionIds.some(id => typeof id !== 'string' || !id) ||
      new Set(value.presentedQuestionIds).size !== value.presentedQuestionIds.length) return false;
    const ids = new Set((questions || []).map(question => String(question.id)));
    if(value.presentedQuestionIds.some(id => !ids.has(id))) return false;
    if(value.status === 'open') return value.finishReason === null && value.closedAt === null;
    return ['manual','timeout'].includes(value.finishReason) && Number.isSafeInteger(value.closedAt) &&
      value.closedAt >= value.startedAt && (value.finishReason === 'timeout'
        ? value.closedAt === value.deadlineAt : value.closedAt < value.deadlineAt);
  }

  function beginTiming(){
    const selected = configuration();
    if(!selected) return;
    const now = Date.now();
    startedAt = now;
    timing = {version:26,attemptId:uid(),startedAt:now,durationMs:selected.durationMs,
      deadlineAt:now + selected.durationMs,status:'open',finishReason:null,closedAt:null,presentedQuestionIds:[]};
  }

  function notePresented(){
    if(!timing || timing.status !== 'open' || Date.now() >= timing.deadlineAt) return;
    const id = examQueue[examIndex]?.id;
    if(id != null && !timing.presentedQuestionIds.includes(String(id))){
      timing.presentedQuestionIds.push(String(id));
    }
  }

  function prepareCompletion(reason = 'manual'){
    if(!timing || observedAnswers !== examAnswers) return null;
    if(timing.status !== 'open') return copy(timing);
    const timeout = Date.now() >= timing.deadlineAt;
    if(reason === 'timeout' && !timeout) return null;
    timing.status = 'closing';
    timing.finishReason = timeout ? 'timeout' : 'manual';
    timing.closedAt = timeout ? timing.deadlineAt : Date.now();
    for(const answer of examAnswers){
      if(answer.omitted !== true && !timing.presentedQuestionIds.includes(String(answer.questionId))){
        timing.presentedQuestionIds.push(String(answer.questionId));
      }
    }
    stopClock();
    window.NOA_ANSWER_REVISION?.closeForClosure?.();
    window.NOA_DRAG_RENDERER?.close?.();
    window.NOA_INLINE_RENDERER?.close?.();
    window.NOA_DRAG_ORDER_RENDERER?.close?.();
    return copy(timing);
  }

  function markCommitted(answers, attemptId){
    if(answers !== examAnswers || observedAnswers !== answers || timing?.attemptId !== attemptId) return;
    timing.status = 'closed';
    completionError = null;
    stopClock();
  }

  function completionFailed(answers){
    if(answers !== examAnswers || observedAnswers !== answers || !timing) return;
    // A possibly durable close remains locked until it is verified or retried.
    completionError = 'No pude guardar el examen. Mantén esta pestaña abierta y vuelve a intentar el cierre.';
    stopClock();
  }

  function closureMessage(){
    const box = document.getElementById('examBox');
    if(!box) return;
    const heading = timing?.finishReason === 'timeout' ? 'Tiempo finalizado' : 'Examen finalizado';
    box.innerHTML = '<h2>' + heading + '</h2><p role="status" id="noaTimedClosureStatus"></p>' +
      (completionError ? '<button class="btn primary" id="noaTimedRetryClosure" type="button">Reintentar guardado</button>' : '');
    document.getElementById('noaTimedClosureStatus').textContent = completionError || 'Guardando el resultado del simulacro…';
    document.getElementById('noaTimedRetryClosure')?.addEventListener('click', () => { expire(); });
  }

  function expire(){
    const sessionAnswers = examAnswers, sessionDatabase = db, sessionQueue = examQueue, sessionTiming = timing;
    if(!sessionTiming || observedAnswers !== sessionAnswers) return Promise.resolve(null);
    if(completionPromise) return completionPromise;
    if(sessionTiming.status === 'closed'){
      return Promise.resolve(db.attempts.find(attempt => attempt.id === sessionTiming.attemptId) || null);
    }
    if(sessionTiming.status === 'open' && Date.now() < sessionTiming.deadlineAt) return Promise.resolve(null);
    prepareCompletion(sessionTiming.finishReason || 'timeout');
    completionError = null;
    const stillCurrent = () => sessionAnswers === examAnswers && sessionDatabase === db &&
      sessionQueue === examQueue && timing === sessionTiming;
    // Assign the mutex first, then invoke commit synchronously. A new exam can
    // start in this JS turn without replacing the expired exam's input snapshot.
    let resolvePending;
    const pending = new Promise(resolve => { resolvePending = resolve; });
    completionPromise = pending;
    (async () => {
      let result = null;
      try{
        const attempt = await commitCompletedExam({reason:sessionTiming.finishReason});
        result = attempt;
        if(!stillCurrent()) return;
        if(!attempt) throw new Error('El cierre todavía no pudo guardarse.');
        timing.status = 'closed';
        completionError = null;
        deactivate();
        renderExam();
      }catch{
        if(stillCurrent()){
          completionError = 'No pude guardar el examen. Mantén esta pestaña abierta y vuelve a intentar el cierre.';
          window.NOA_EXAM_RECOVERY?.save?.();
          deactivate();
          closureMessage();
        }
      }finally{
        if(completionPromise === pending) completionPromise = null;
        resolvePending(result);
      }
    })();
    return pending;
  }

  function canInteract(){
    if(!timing || observedAnswers !== examAnswers) return true;
    if(timing.status !== 'open') return false;
    if(Date.now() >= timing.deadlineAt){
      expire();
      return false;
    }
    notePresented();
    return true;
  }

  function remainingSeconds(){
    return timing ? Math.max(0, Math.ceil((timing.deadlineAt - Date.now()) / 1000)) : null;
  }


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
    !window.NOA_MIXED_EXAM
  ){

    throw new Error(
      'Mixed Exam Engine no está cargado'
    );

  }


  // =====================================
  // ESTILOS
  // =====================================

  function ensureStyles(){

    if(
      document.getElementById(
        'noaExamShellStyles'
      )
    ){
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'noaExamShellStyles';


    style.textContent = `

      /* ================================
         MODO EXAMEN
         ================================ */

      body.noa-shell-active{

        background:#f2f2f2;

      }


      body.noa-shell-active
      .sidebar,

      body.noa-shell-active
      .voicebar,

      body.noa-shell-active
      .main > .topbar{

        display:none !important;

      }


      body.noa-shell-active
      .app{

        display:block;

      }


      body.noa-shell-active
      .main{

        width:100%;

        max-width:none;

        margin:0;

        padding:
          84px 24px 28px;

      }


      body.noa-shell-active
      #exam{

        display:block !important;

        max-width:1050px;

        margin:
          0 auto;

      }


      /* Ocultar controles normales
         durante el examen */

      body.noa-shell-active
      #exam > .grid{

        display:none !important;

      }


      body.noa-shell-active
      #examBox{

        margin-top:0 !important;

      }


      /* ================================
         RENDERERS INTERACTIVOS
         ================================ */

      body.noa-shell-active
      .noa-drag-topbar,

      body.noa-shell-active
      .noa-inline-topbar,

      body.noa-shell-active
      .noa-order-topbar{

        display:none !important;

      }


      body.noa-shell-active
      .noa-drag-overlay,

      body.noa-shell-active
      .noa-inline-overlay,

      body.noa-shell-active
      .noa-order-overlay{

        box-sizing:border-box;

        padding-top:70px;

      }


      /* ================================
         SHELL SUPERIOR
         ================================ */

      .noa-exam-shell{

        position:fixed;

        top:0;
        left:0;
        right:0;

        z-index:12000;

        min-height:64px;

        display:flex;

        align-items:center;

        justify-content:
          space-between;

        gap:18px;

        padding:
          8px 18px;

        background:#e4e4e4;

        border-bottom:
          1px solid #bdbdbd;

        box-shadow:
          0 1px 4px
          rgba(0,0,0,.12);

        color:#202124;

        font-family:
          Arial,
          Helvetica,
          sans-serif;

      }


      .noa-shell-left{

        display:flex;

        align-items:center;

        gap:12px;

        min-width:230px;

      }


      .noa-shell-logo{

        width:34px;
        height:34px;

        display:flex;

        align-items:center;

        justify-content:center;

        border-radius:4px;

        background:#253a54;

        color:white;

        font-weight:800;

      }


      .noa-shell-title{

        font-size:14px;

        font-weight:700;

      }


      .noa-shell-subtitle{

        margin-top:2px;

        color:#666;

        font-size:11px;

      }


      /* ================================
         CENTRO
         ================================ */

      .noa-shell-center{

        text-align:center;

        flex:1;

      }


      .noa-shell-question{

        font-size:15px;

        font-weight:700;

      }


      .noa-shell-progress{

        margin-top:5px;

        width:min(
          360px,
          100%
        );

        height:5px;

        margin-left:auto;
        margin-right:auto;

        overflow:hidden;

        border-radius:999px;

        background:#c6c6c6;

      }


      .noa-shell-progress-fill{

        height:100%;

        background:#456f9e;

        transition:
          width .2s ease;

      }


      /* ================================
         DERECHA
         ================================ */

      .noa-shell-right{

        display:flex;

        align-items:center;

        justify-content:flex-end;

        gap:10px;

        min-width:250px;

      }


      .noa-shell-time{

        min-width:96px;

        padding:
          7px 10px;

        border:
          1px solid #aaa;

        border-radius:4px;

        background:white;

        text-align:center;

        font-size:14px;

        font-variant-numeric:
          tabular-nums;

      }


      .noa-shell-map-button{

        padding:
          8px 13px;

        border:
          1px solid #8f8f8f;

        border-radius:4px;

        background:white;

        cursor:pointer;

        font-weight:600;

      }


      /* ================================
         MAPA
         ================================ */

      .noa-exam-map{

        position:fixed;

        z-index:11999;

        top:64px;
        right:12px;

        width:310px;

        max-height:
          calc(100vh - 82px);

        overflow:auto;

        padding:16px;

        border:
          1px solid #aaa;

        border-radius:
          0 0 6px 6px;

        background:white;

        box-shadow:
          0 5px 16px
          rgba(0,0,0,.18);

        color:#202124;

        font-family:
          Arial,
          Helvetica,
          sans-serif;

      }


      .noa-exam-map-title{

        margin-bottom:12px;

        font-size:14px;

        font-weight:700;

      }


      .noa-exam-map-grid{

        display:grid;

        grid-template-columns:
          repeat(
            5,
            1fr
          );

        gap:7px;

      }


      .noa-map-cell{

        aspect-ratio:1;

        display:flex;

        align-items:center;

        justify-content:center;

        border:
          1px solid #aaa;

        border-radius:3px;

        background:white;

        color:#333;

        font-size:13px;

        font-weight:600;

      }


      .noa-map-cell.answered{

        border-color:#47765c;

        background:#eaf5ee;

        color:#28533b;

      }


      .noa-map-cell.current{

        border:
          2px solid #315f91;

        background:#eaf2fb;

        color:#244d78;

      }


      .noa-map-cell.pending{

        color:#777;

      }


      .noa-map-legend{

        margin-top:14px;

        display:grid;

        gap:6px;

        color:#555;

        font-size:11px;

      }


      .noa-map-dot{

        display:inline-block;

        width:10px;
        height:10px;

        margin-right:6px;

        border:
          1px solid #999;

      }


      .noa-map-dot.answered{

        background:#eaf5ee;

        border-color:#47765c;

      }


      .noa-map-dot.current{

        background:#eaf2fb;

        border-color:#315f91;

      }


      /* ================================
         RESPONSIVE
         ================================ */

      @media(max-width:760px){

        .noa-exam-shell{

          gap:8px;

          padding:
            7px 9px;

        }


        .noa-shell-left{

          min-width:0;

        }


        .noa-shell-subtitle{

          display:none;

        }


        .noa-shell-center{

          text-align:left;

        }


        .noa-shell-progress{

          display:none;

        }


        .noa-shell-right{

          min-width:0;

        }


        .noa-shell-map-button{

          padding:
            7px 9px;

        }


        .noa-exam-map{

          right:5px;

          width:
            min(
              300px,
              calc(100vw - 10px)
            );

        }


        body.noa-shell-active
        .main{

          padding:
            78px 8px 20px;

        }

      }

    `;


    document.head
      .appendChild(
        style
      );

  }


  // =====================================
  // TIEMPO
  // =====================================

  function formatTime(
    seconds
  ){

    const total =
      Math.max(
        0,
        Math.floor(seconds)
      );


    const hours =
      Math.floor(
        total / 3600
      );


    const minutes =
      Math.floor(
        (
          total % 3600
        ) / 60
      );


    const secs =
      total % 60;


    const mm =
      String(minutes)
        .padStart(
          2,
          '0'
        );


    const ss =
      String(secs)
        .padStart(
          2,
          '0'
        );


    if(hours){

      return (
        String(hours)
          .padStart(
            2,
            '0'
          ) +
        ':' +
        mm +
        ':' +
        ss
      );

    }


    return (
      mm +
      ':' +
      ss
    );

  }


  function elapsedSeconds(){

    if(!startedAt){
      return 0;
    }


    return ((timing?.closedAt ?? Date.now()) - startedAt) / 1000;

  }


  function updateClock(){
    if(timing?.status === 'open' && Date.now() >= timing.deadlineAt){
      expire();
      return;
    }
    const node = document.getElementById('noaShellClock');
    if(node) node.textContent = timing
      ? 'Tiempo restante · ' + formatTime(remainingSeconds())
      : 'Tiempo · ' + formatTime(elapsedSeconds());
  }


  function startClock(){

    if(!startedAt){

      startedAt =
        Date.now();

    }


    if(timerHandle){
      return;
    }


    timerHandle =
      setInterval(
        updateClock,
        1000
      );


    updateClock();

  }


  function stopClock(){

    if(timerHandle){

      clearInterval(
        timerHandle
      );

    }


    timerHandle =
      null;

  }


  // =====================================
  // ESTADO
  // =====================================

  function state(){

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
  // CREAR SHELL
  // =====================================

  function ensureShell(){

    let shell =
      document.getElementById(
        'noaExamShell'
      );


    if(shell){
      return shell;
    }


    shell =
      document.createElement(
        'div'
      );


    shell.id =
      'noaExamShell';


    shell.className =
      'noa-exam-shell';


    document.body
      .appendChild(
        shell
      );


    return shell;

  }


  // =====================================
  // MAPA
  // =====================================

  function renderMap(
    exam
  ){

    let map =
      document.getElementById(
        'noaExamMap'
      );


    if(!mapOpen){

      map?.remove();

      return;

    }


    if(!map){

      map =
        document.createElement(
          'div'
        );


      map.id =
        'noaExamMap';


      map.className =
        'noa-exam-map';


      document.body
        .appendChild(
          map
        );

    }


    const total =
      Number(
        exam.total
      ) || 0;


    const current =
      Number(
        exam.examIndex
      ) || 0;


    const answered =
      Array.isArray(
        exam.answers
      )
        ? exam.answers.length
        : 0;


    const cells = [];


    for(
      let i=0;
      i<total;
      i++
    ){

      let status =
        'pending';


      if(
        i < answered
      ){

        status =
          'answered';

      }


      if(
        i === current &&
        current < total
      ){

        status =
          'current';

      }


      cells.push(`

        <div
          class="
            noa-map-cell
            ${status}
          "
          title="Pregunta ${i + 1}"
        >
          ${i + 1}
        </div>

      `);

    }


    map.innerHTML = `

      <div
        class="noa-exam-map-title"
      >
        Navegación del examen
      </div>


      <div
        class="noa-exam-map-grid"
      >
        ${cells.join('')}
      </div>


      <div
        class="noa-map-legend"
      >

        <div>
          <span
            class="
              noa-map-dot
              answered
            "
          ></span>
          Respondida
        </div>

        <div>
          <span
            class="
              noa-map-dot
              current
            "
          ></span>
          Pregunta actual
        </div>

        <div>
          <span
            class="noa-map-dot"
          ></span>
          Pendiente
        </div>

      </div>

    `;

  }


  // =====================================
  // SINCRONIZAR
  // =====================================

  function sync(){

    const exam =
      state();


    if(timing && timing.status !== 'open'){
      if(timing.status === 'closing' && !completionPromise && !completionError) expire();
      deactivate();
      if(timing.status === 'closing' && completionError) closureMessage();
      return;
    }
    if(timing && Date.now() >= timing.deadlineAt){ expire(); return; }
    if(
      !exam.mixedMode && !timing
    ){

      deactivate();

      return;

    }


    ensureStyles();


    document.body
      .classList
      .add(
        'noa-shell-active'
      );


    startClock();


    const shell =
      ensureShell();


    const total =
      Number(
        exam.total
      ) || 0;


    const index =
      Number(
        exam.examIndex
      ) || 0;


    const answered =
      Array.isArray(
        exam.answers
      )
        ? exam.answers.length
        : 0;


    const questionNumber =
      Math.min(
        index + 1,
        total
      );


    const progress =
      total

        ? Math.round(
            answered /
            total *
            100
          )

        : 0;


    shell.innerHTML = `

      <div
        class="noa-shell-left"
      >

        <div
          class="noa-shell-logo"
        >
          N
        </div>

        <div>

          <div
            class="noa-shell-title"
          >
            NOA · EXCOBA
          </div>

          <div
            class="noa-shell-subtitle"
          >
            Simulador de admisión
          </div>

        </div>

      </div>


      <div
        class="noa-shell-center"
      >

        <div
          class="noa-shell-question"
        >

          Pregunta
          ${questionNumber}
          de
          ${total}

        </div>


        <div
          class="noa-shell-progress"
        >

          <div
            class="
              noa-shell-progress-fill
            "

            style="
              width:${progress}%
            "
          ></div>

        </div>

      </div>


      <div
        class="noa-shell-right"
      >

        <div
          class="noa-shell-time"
          id="noaShellClock"
        >
          ${timing ? 'Tiempo restante · ' : 'Tiempo · '}
          ${formatTime(timing ? remainingSeconds() : elapsedSeconds())}
        </div>


        <button
          class="
            noa-shell-map-button
          "

          id="noaShellMapButton"
        >
          Reactivos
        </button>

      </div>

    `;


    document
      .getElementById(
        'noaShellMapButton'
      )
      ?.addEventListener(
        'click',
        () => {

          mapOpen =
            !mapOpen;


          renderMap(
            state()
          );

        }
      );


    renderMap(
      exam
    );

  }


  // =====================================
  // DESACTIVAR
  // =====================================

  function deactivate(){

    document.body
      .classList
      .remove(
        'noa-shell-active'
      );


    document
      .getElementById(
        'noaExamShell'
      )
      ?.remove();


    document
      .getElementById(
        'noaExamMap'
      )
      ?.remove();


    mapOpen =
      false;


    stopClock();


    if(!timing) startedAt = null;

  }


  // =====================================
  // WRAP RENDER EXAM
  // =====================================

  const previousRenderExam =
    window.renderExam;


  window.renderExam =
    function(
      ...args
    ){

      const newSession =
        observedAnswers !== examAnswers;
      if(newSession){
        observedAnswers = examAnswers;
        timing = null;
        completionPromise = null;
        completionError = null;
        deactivate();
        if(examQueue.length && examIndex >= 0 && examIndex < examQueue.length) beginTiming();
      }
      if(timing && timing.status !== 'open' && examIndex < examQueue.length){
        if(!completionPromise && !completionError && timing.status === 'closing') expire();
        if(completionError) closureMessage();
        return;
      }
      if(timing && !canInteract() && examIndex < examQueue.length) return;
      notePresented();

      const result =
        previousRenderExam
          .apply(
            this,
            args
          );


      if(newSession){
        sync();
      }else{
        deferForSession(sync, 0);
      }


      return result;

    };


  // =====================================
  // ACTUALIZAR AL RESPONDER
  // =====================================

  document.addEventListener(
    'click',

    event => {

      if(
        event.target
          ?.closest?.(
            '#noaDragSubmit,' +
            '#noaInlineSubmit,' +
            '#noaOrderSubmit,' +
            '#noaMixedContinue,' +
            '#noaInlineMixedContinue,' +
            '#noaOrderMixedContinue'
          )
      ){

        deferForSession(
          sync,
          30
        );

      }

    }
  );


  // =====================================
  // API
  // =====================================

  function restoreSessionClock(snapshot, options = {}){
    observedAnswers = examAnswers;
    stopClock();
    startedAt = null;
    mapOpen = false;
    timing = null;
    completionPromise = null;
    completionError = null;
    if(snapshot?.timing){
      if(!validTiming(snapshot.timing,examQueue)) throw new Error('El límite de tiempo guardado no es válido.');
      timing = copy(snapshot.timing);
      startedAt = timing.startedAt;
    }else{
      if(!state().mixedMode || !snapshot) return;
      const now = Date.now();
      const elapsed = Number.isFinite(snapshot.elapsed) ? Math.max(0,snapshot.elapsed) : 0;
      startedAt = Number.isFinite(snapshot.startedAt) && snapshot.startedAt > 0
        ? Math.min(snapshot.startedAt,now - elapsed * 1000) : now - elapsed * 1000;
    }
    mapOpen = snapshot?.mapOpen === true;
    if(options.sync !== false) sync();
  }

  // On hide, navigation persists the original deadline. Closing from the old
  // document during reload would remove the checkpoint before recovery can show
  // the result. Recheck immediately when the document becomes visible instead.
  document.addEventListener('visibilitychange', () => {
    if(timing && document.visibilityState === 'visible') sync();
  });
  window.addEventListener('focus', () => { if(timing) sync(); });
  window.addEventListener('pageshow', () => { if(timing) sync(); });


  window.NOA_EXAM_SHELL = {

    version:
      VERSION,

    sync,
    configuration,
    validTiming,
    canInteract,
    expire,
    prepareCompletion,
    markCommitted,
    completionFailed,

    deactivate,

    restore:
      restoreSessionClock,

    state:
      () => ({

        startedAt,

        elapsed:
          elapsedSeconds(),

        mapOpen,
        ...(timing && observedAnswers === examAnswers ? {timing:copy(timing),error:completionError} : {})

      })

  };


  console.log(
    'NOA EXCOBA Simulator Shell v20 ✓'
  );

})();
