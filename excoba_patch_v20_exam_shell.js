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


    return (
      Date.now() -
      startedAt
    ) / 1000;

  }


  function updateClock(){

    const node =
      document.getElementById(
        'noaShellClock'
      );


    if(!node){
      return;
    }


    node.textContent =
      'Tiempo · ' +
      formatTime(
        elapsedSeconds()
      );

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


    if(
      !exam.mixedMode
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
          Tiempo ·
          ${formatTime(
            elapsedSeconds()
          )}
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


    startedAt =
      null;

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

      const result =
        previousRenderExam
          .apply(
            this,
            args
          );


      setTimeout(
        sync,
        0
      );


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

        setTimeout(
          sync,
          30
        );

      }

    }
  );


  // =====================================
  // API
  // =====================================

  window.NOA_EXAM_SHELL = {

    version:
      VERSION,

    sync,

    deactivate,

    state:
      () => ({

        startedAt,

        elapsed:
          elapsedSeconds(),

        mapOpen

      })

  };


  console.log(
    'NOA EXCOBA Simulator Shell v20 ✓'
  );

})();
