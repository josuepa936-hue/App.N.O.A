/* =========================================================
   NOA EXCOBA INLINE SELECT RENDERER v15

   Renderer visual para:
   inline_select

   - Selects incrustados en el texto
   - Compatible con mouse / touch
   - Crédito parcial por espacio
   - Feedback posterior
   - Renderer aislado para checkpoint

   Todavía NO entra automáticamente al examen mixto.
   ========================================================= */

(() => {

  const VERSION = '15.0';

  let activeState = null;


  // =====================================
  // ESTILOS
  // =====================================

  function ensureStyles(){

    if(
      document.getElementById(
        'noaInlineRendererStyles'
      )
    ){
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'noaInlineRendererStyles';


    style.textContent = `

      .noa-inline-overlay{
        position:fixed;
        inset:0;
        z-index:9999;
        overflow:auto;
        background:#f2f2f2;
        color:#202124;
        font-family:
          Arial,
          Helvetica,
          sans-serif;
      }


      .noa-inline-topbar{
        min-height:58px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        padding:8px 18px;
        background:#e5e5e5;
        border-bottom:1px solid #c8c8c8;
      }


      .noa-inline-brand{
        font-size:15px;
        font-weight:700;
      }


      .noa-inline-type{
        font-size:13px;
        color:#555;
      }


      .noa-inline-close{
        padding:7px 12px;
        border:1px solid #aaa;
        border-radius:5px;
        background:white;
        cursor:pointer;
      }


      .noa-inline-page{
        width:min(
          1050px,
          calc(100% - 28px)
        );
        margin:26px auto 60px;
      }


      .noa-inline-card{
        padding:28px;
        background:white;
        border:1px solid #ccc;
        border-radius:4px;
        box-shadow:
          0 1px 3px
          rgba(0,0,0,.08);
      }


      .noa-inline-label{
        margin-bottom:12px;
        color:#666;
        font-size:12px;
        text-transform:uppercase;
        letter-spacing:.6px;
      }


      .noa-inline-instruction{
        margin-bottom:20px;
        font-size:20px;
        line-height:1.45;
        font-weight:600;
      }


      .noa-inline-text{
        padding:22px;
        border:1px solid #d3d3d3;
        background:#fafafa;

        font-size:18px;
        line-height:2.2;
      }


      .noa-inline-select{
        min-width:130px;
        max-width:260px;

        margin:
          0 4px;

        padding:
          7px 28px 7px 9px;

        border:
          1px solid #777;

        border-radius:3px;

        background:white;

        font-size:
          .92em;

        vertical-align:
          baseline;
      }


      .noa-inline-select:focus{
        outline:
          2px solid
          rgba(23,105,170,.25);

        border-color:
          #1769aa;
      }


      .noa-inline-select.correct{
        border:
          2px solid #37945c;

        background:
          #effaf3;
      }


      .noa-inline-select.wrong{
        border:
          2px solid #b73535;

        background:
          #fff1f1;
      }


      .noa-inline-actions{
        display:flex;
        justify-content:flex-end;
        gap:10px;
        flex-wrap:wrap;
        margin-top:22px;
      }


      .noa-inline-btn{
        padding:9px 18px;

        border:
          1px solid #888;

        border-radius:4px;

        background:white;

        cursor:pointer;

        font-weight:600;
      }


      .noa-inline-btn.primary{
        color:white;
        border-color:#34699a;
        background:#34699a;
      }


      .noa-inline-btn:disabled{
        opacity:.5;
        cursor:not-allowed;
      }


      .noa-inline-result{
        display:none;

        margin-top:22px;
        padding-top:20px;

        border-top:
          1px solid #ddd;
      }


      .noa-inline-score{
        margin-bottom:10px;

        font-size:21px;
        font-weight:700;
      }


      .noa-inline-answer-list{
        margin-top:15px;
        display:grid;
        gap:8px;
      }


      .noa-inline-answer{
        padding:9px 11px;

        border:
          1px solid #ddd;

        background:#fafafa;

        font-size:14px;
      }


      .noa-inline-explanation{
        margin-top:16px;

        color:#444;

        line-height:1.55;
      }


      @media(max-width:700px){

        .noa-inline-page{
          width:
            calc(100% - 16px);

          margin-top:12px;
        }


        .noa-inline-card{
          padding:16px;
        }


        .noa-inline-text{
          padding:14px;

          font-size:16px;

          line-height:2.4;
        }


        .noa-inline-select{
          max-width:100%;
        }

      }

    `;


    document.head
      .appendChild(
        style
      );

  }


  // =====================================
  // ESCAPE
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


  // =====================================
  // ESTADO
  // =====================================

  function createState(
    question
  ){

    return {

      question,

      selections:
        Object.fromEntries(

          question
            .blanks
            .map(
              blank => [
                blank.id,
                null
              ]
            )

        ),

      submitted:false,

      score:null

    };

  }


  // =====================================
  // ENCONTRAR BLANK
  // =====================================

  function blankById(
    question,
    id
  ){

    return question
      .blanks
      .find(
        blank =>
          blank.id === id
      ) || null;

  }


  // =====================================
  // RENDER SELECT
  // =====================================

  function selectHTML(
    blank
  ){

    const selected =
      activeState
        .selections[
          blank.id
        ];


    let resultClass = '';


    if(
      activeState.submitted
    ){

      resultClass =
        Number(selected) ===
        blank.correct

          ? 'correct'

          : 'wrong';

    }


    return `

      <select
        class="
          noa-inline-select
          ${resultClass}
        "

        data-noa-inline="${
          esc(blank.id)
        }"

        ${
          activeState.submitted
            ? 'disabled'
            : ''
        }
      >

        <option
          value=""
          ${
            selected === null
              ? 'selected'
              : ''
          }
          disabled
        >

          Selecciona…

        </option>


        ${
          blank
            .options
            .map(
              (option,index) => `

                <option
                  value="${index}"

                  ${
                    Number(selected) ===
                    index
                      ? 'selected'
                      : ''
                  }
                >

                  ${esc(option)}

                </option>

              `
            )
            .join('')
        }

      </select>

    `;

  }


  // =====================================
  // CONVERTIR TEXTO
  // =====================================

  function textHTML(
    question
  ){

    const text =
      String(
        question.text || ''
      );


    const regex =
      /\[\[([^\]]+)\]\]/g;


    let html = '';

    let lastIndex = 0;

    let match;


    while(
      (
        match =
          regex.exec(text)
      ) !== null
    ){

      const before =
        text.slice(
          lastIndex,
          match.index
        );


      html +=
        esc(before)
          .replace(
            /\n/g,
            '<br>'
          );


      const id =
        String(
          match[1] || ''
        ).trim();


      const blank =
        blankById(
          question,
          id
        );


      if(blank){

        html +=
          selectHTML(
            blank
          );

      }else{

        html +=
          esc(
            match[0]
          );

      }


      lastIndex =
        regex.lastIndex;

    }


    html +=
      esc(
        text.slice(
          lastIndex
        )
      )
        .replace(
          /\n/g,
          '<br>'
        );


    return html;

  }


  // =====================================
  // RENDER PRINCIPAL
  // =====================================

  function render(){

    const root =
      document.getElementById(
        'noaInlineRendererRoot'
      );


    if(
      !root ||
      !activeState
    ){
      return;
    }


    const q =
      activeState.question;


    const complete =
      q.blanks.every(
        blank =>
          activeState
            .selections[
              blank.id
            ] !== null
      );


    root.innerHTML = `

      <div
        class="noa-inline-overlay"
      >

        <div
          class="noa-inline-topbar"
        >

          <div>

            <div
              class="noa-inline-brand"
            >
              NOA · Simulador EXCOBA
            </div>

            <div
              class="noa-inline-type"
            >
              Selección dentro de texto
            </div>

          </div>


          <button
            class="noa-inline-close"
            id="noaInlineClose"
          >
            Cerrar
          </button>

        </div>


        <div
          class="noa-inline-page"
        >

          <div
            class="noa-inline-card"
          >

            <div
              class="noa-inline-label"
            >
              Completar texto
            </div>


            <div
              class="noa-inline-instruction"
            >

              ${esc(q.instruction)}

            </div>


            <div
              class="noa-inline-text"
            >

              ${textHTML(q)}

            </div>


            <div
              class="noa-inline-actions"
            >

              <button
                class="noa-inline-btn"
                id="noaInlineReset"

                ${
                  activeState.submitted
                    ? 'disabled'
                    : ''
                }
              >

                Reiniciar

              </button>


              <button
                class="
                  noa-inline-btn
                  primary
                "

                id="noaInlineSubmit"

                ${
                  (
                    !complete ||
                    activeState.submitted
                  )
                    ? 'disabled'
                    : ''
                }
              >

                Responder

              </button>

            </div>


            <div
              class="noa-inline-result"
              id="noaInlineResult"

              style="${
                activeState.submitted
                  ? 'display:block'
                  : ''
              }"
            >

              ${
                activeState.submitted

                  ? resultHTML()

                  : ''
              }

            </div>

          </div>

        </div>

      </div>

    `;


    bindEvents();

  }


  // =====================================
  // EVENTOS
  // =====================================

  function bindEvents(){

    document
      .querySelectorAll(
        '[data-noa-inline]'
      )
      .forEach(
        select => {

          select.addEventListener(
            'change',
            () => {

              if(
                !activeState ||
                activeState.submitted
              ){
                return;
              }


              const id =
                select.dataset
                  .noaInline;


              const value =
                Number(
                  select.value
                );


              activeState
                .selections[
                  id
                ] =
                  Number.isInteger(
                    value
                  )
                    ? value
                    : null;


              render();

            }
          );

        }
      );


    document
      .getElementById(
        'noaInlineReset'
      )
      ?.addEventListener(
        'click',
        reset
      );


    document
      .getElementById(
        'noaInlineSubmit'
      )
      ?.addEventListener(
        'click',
        submit
      );


    document
      .getElementById(
        'noaInlineClose'
      )
      ?.addEventListener(
        'click',
        close
      );

  }


  // =====================================
  // SCORING
  // =====================================

  function calculateScore(){

    if(!activeState){
      return null;
    }


    const q =
      activeState.question;


    let correct = 0;


    q.blanks.forEach(
      blank => {

        const selected =
          activeState
            .selections[
              blank.id
            ];


        if(
          Number(selected) ===
          blank.correct
        ){

          correct++;

        }

      }
    );


    return {

      correct,

      total:
        q.blanks.length,

      score:
        q.blanks.length

          ? correct /
            q.blanks.length

          : 0

    };

  }


  // =====================================
  // RESULTADO
  // =====================================

  function resultHTML(){

    const q =
      activeState.question;


    const score =
      activeState.score;


    const pct =
      Math.round(
        score.score * 100
      );


    const answers =
      q.blanks
        .map(
          (blank,index) => {

            const selectedIndex =
              activeState
                .selections[
                  blank.id
                ];


            const selected =
              blank.options[
                selectedIndex
              ] ?? 'Sin respuesta';


            const correct =
              blank.options[
                blank.correct
              ];


            const ok =
              Number(
                selectedIndex
              ) ===
              blank.correct;


            return `

              <div
                class="noa-inline-answer"
              >

                <b>
                  Espacio ${index + 1}
                  ${ok ? '✓' : '✕'}
                </b>

                <br>

                Tu respuesta:
                ${esc(selected)}

                ${
                  !ok
                    ? `
                      <br>
                      Correcta:
                      <b>
                        ${esc(correct)}
                      </b>
                    `
                    : ''
                }

              </div>

            `;

          }
        )
        .join('');


    return `

      <div
        class="noa-inline-score"
      >

        ${score.correct}
        /
        ${score.total}
        correctos

        · ${pct}%

      </div>


      <div
        class="noa-inline-answer-list"
      >

        ${answers}

      </div>


      ${
        q.explanation

          ? `
            <div
              class="noa-inline-explanation"
            >

              ${esc(q.explanation)}

            </div>
          `

          : ''
      }

    `;

  }


  // =====================================
  // SUBMIT
  // =====================================

  function submit(){

    if(
      !activeState ||
      activeState.submitted
    ){
      return;
    }


    const complete =
      activeState
        .question
        .blanks
        .every(
          blank =>
            activeState
              .selections[
                blank.id
              ] !== null
        );


    if(!complete){
      return;
    }


    activeState.score =
      calculateScore();


    activeState.submitted =
      true;


    render();


    console.log(
      'NOA Inline Score:',
      activeState.score
    );

  }


  // =====================================
  // RESET
  // =====================================

  function reset(){

    if(
      !activeState ||
      activeState.submitted
    ){
      return;
    }


    Object.keys(
      activeState.selections
    )
      .forEach(
        id => {

          activeState
            .selections[
              id
            ] = null;

        }
      );


    render();

  }


  // =====================================
  // ABRIR
  // =====================================

  function open(
    question
  ){

    if(
      !question ||
      question
        .interactionType !==
        'inline_select'
    ){

      throw new Error(
        'El renderer necesita un reactivo inline_select'
      );

    }


    ensureStyles();


    let root =
      document.getElementById(
        'noaInlineRendererRoot'
      );


    if(!root){

      root =
        document.createElement(
          'div'
        );


      root.id =
        'noaInlineRendererRoot';


      document.body
        .appendChild(
          root
        );

    }


    activeState =
      createState(
        question
      );


    render();


    return activeState;

  }


  // =====================================
  // CERRAR
  // =====================================

  function close(){

    document
      .getElementById(
        'noaInlineRendererRoot'
      )
      ?.remove();


    activeState =
      null;

  }


  // =====================================
  // API
  // =====================================

  window.NOA_INLINE_RENDERER = {

    version:
      VERSION,

    open,

    close,

    getState:
      () =>
        activeState,

    calculateScore:
      () =>
        activeState
          ? calculateScore()
          : null

  };


  console.log(
    'NOA EXCOBA Inline Select Renderer v15 ✓'
  );

})();
