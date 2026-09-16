/* =========================================================
   NOA EXCOBA DRAG RENDERER v12

   Renderer visual para:
   drag_classify

   - Arrastrar con mouse
   - Selección por clic/touch
   - Categorías visuales
   - Banco de elementos
   - Puntuación parcial
   - Feedback posterior a responder

   Todavía NO sustituye renderExam().
   ========================================================= */

(() => {

  const VERSION = '12.0';

  let activeState = null;


  // =====================================
  // ESTILOS
  // =====================================

  function ensureStyles(){

    if(
      document.getElementById(
        'noaDragRendererStyles'
      )
    ){
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'noaDragRendererStyles';


    style.textContent = `

      .noa-drag-overlay{
        position:fixed;
        inset:0;
        z-index:9999;
        background:#f2f2f2;
        color:#202124;
        overflow:auto;
        font-family:
          Arial,
          Helvetica,
          sans-serif;
      }


      .noa-drag-topbar{
        min-height:58px;
        background:#e5e5e5;
        border-bottom:1px solid #c6c6c6;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
        padding:8px 18px;
      }


      .noa-drag-brand{
        font-weight:700;
        font-size:15px;
      }


      .noa-drag-counter{
        color:#555;
        font-size:13px;
      }


      .noa-drag-close{
        border:1px solid #aaa;
        background:white;
        border-radius:5px;
        padding:7px 12px;
        cursor:pointer;
      }


      .noa-drag-page{
        width:min(
          1100px,
          calc(100% - 28px)
        );
        margin:24px auto 60px;
      }


      .noa-drag-question{
        background:white;
        border:1px solid #cfcfcf;
        border-radius:4px;
        box-shadow:
          0 1px 3px
          rgba(0,0,0,.08);
        padding:24px;
      }


      .noa-drag-type{
        font-size:12px;
        color:#666;
        text-transform:uppercase;
        letter-spacing:.6px;
        margin-bottom:10px;
      }


      .noa-drag-instruction{
        font-size:19px;
        font-weight:600;
        line-height:1.45;
        margin-bottom:8px;
      }


      .noa-drag-stem{
        color:#444;
        line-height:1.55;
        margin-bottom:22px;
      }


      .noa-drag-help{
        background:#f7f7f7;
        border-left:4px solid #808080;
        padding:10px 12px;
        font-size:13px;
        color:#555;
        margin-bottom:20px;
      }


      .noa-drag-bank-title{
        font-size:13px;
        font-weight:700;
        margin-bottom:8px;
      }


      .noa-drag-bank{
        min-height:80px;
        border:1px dashed #999;
        background:#fafafa;
        padding:12px;
        display:flex;
        flex-wrap:wrap;
        gap:9px;
        align-content:flex-start;
        margin-bottom:22px;
      }


      .noa-drag-item{
        background:white;
        border:1px solid #8b8b8b;
        border-radius:3px;
        padding:9px 12px;
        cursor:grab;
        user-select:none;
        font-size:14px;
        line-height:1.35;
        max-width:300px;
        transition:
          border-color .15s ease,
          box-shadow .15s ease,
          transform .15s ease;
      }


      .noa-drag-item:hover{
        border-color:#333;
      }


      .noa-drag-item.selected{
        border:2px solid #1769aa;
        box-shadow:
          0 0 0 2px
          rgba(23,105,170,.15);
        transform:
          translateY(-1px);
      }


      .noa-drag-item.dragging{
        opacity:.55;
      }


      .noa-drag-targets{
        display:grid;
        grid-template-columns:
          repeat(
            auto-fit,
            minmax(210px,1fr)
          );
        gap:14px;
      }


      .noa-drag-target{
        border:1px solid #a8a8a8;
        background:#f8f8f8;
        min-height:180px;
        display:flex;
        flex-direction:column;
      }


      .noa-drag-target.over{
        border:2px solid #1769aa;
        background:#eef6fd;
      }


      .noa-drag-target-header{
        background:#e6e6e6;
        border-bottom:1px solid #bdbdbd;
        padding:10px 12px;
        font-weight:700;
        font-size:14px;
        min-height:40px;
      }


      .noa-drag-target-body{
        padding:10px;
        display:flex;
        flex-direction:column;
        gap:8px;
        min-height:130px;
        flex:1;
      }


      .noa-drag-target.correct{
        border-color:#37945c;
      }


      .noa-drag-target.wrong{
        border-color:#b73535;
      }


      .noa-drag-actions{
        display:flex;
        justify-content:flex-end;
        flex-wrap:wrap;
        gap:10px;
        margin-top:22px;
      }


      .noa-drag-btn{
        border:1px solid #8a8a8a;
        background:#fff;
        border-radius:4px;
        padding:9px 17px;
        cursor:pointer;
        font-weight:600;
      }


      .noa-drag-btn.primary{
        background:#34699a;
        color:white;
        border-color:#34699a;
      }


      .noa-drag-btn:disabled{
        opacity:.5;
        cursor:not-allowed;
      }


      .noa-drag-result{
        margin-top:20px;
        border-top:1px solid #ddd;
        padding-top:18px;
        display:none;
      }


      .noa-drag-score{
        font-size:20px;
        font-weight:700;
        margin-bottom:8px;
      }


      .noa-drag-explanation{
        line-height:1.55;
        color:#444;
      }


      .noa-drag-correct-item{
        border-color:#32945a !important;
        background:#effaf3 !important;
      }


      .noa-drag-wrong-item{
        border-color:#b43d3d !important;
        background:#fff1f1 !important;
      }


      @media(max-width:700px){

        .noa-drag-page{
          width:
            calc(100% - 16px);
          margin-top:12px;
        }


        .noa-drag-question{
          padding:16px;
        }


        .noa-drag-targets{
          grid-template-columns:1fr;
        }


        .noa-drag-item{
          max-width:100%;
          width:100%;
        }

      }

    `;


    document.head
      .appendChild(
        style
      );

  }


  // =====================================
  // HELPERS
  // =====================================

  function esc(value){

    return String(value ?? '')
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


  function findItem(
    question,
    itemId
  ){

    return question
      .elements
      .find(
        x =>
          x.id === itemId
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

      selectedItemId:null,

      assignments:
        Object.fromEntries(
          question
            .elements
            .map(
              e => [
                e.id,
                null
              ]
            )
        ),

      submitted:false,

      score:null

    };

  }


  // =====================================
  // MOVER ELEMENTO
  // =====================================

  function assign(
    itemId,
    targetId
  ){

    if(
      !activeState ||
      activeState.submitted
    ){
      return;
    }


    if(
      !activeState
        .assignments
        .hasOwnProperty(
          itemId
        )
    ){
      return;
    }


    activeState
      .assignments[
        itemId
      ] =
        targetId || null;


    activeState.selectedItemId =
      null;


    renderCurrent();

  }


  function selectItem(
    itemId
  ){

    if(
      !activeState ||
      activeState.submitted
    ){
      return;
    }


    activeState.selectedItemId =

      activeState
        .selectedItemId ===
        itemId

        ? null

        : itemId;


    renderCurrent();

  }


  function selectTarget(
    targetId
  ){

    if(
      !activeState
        ?.selectedItemId
    ){
      return;
    }


    assign(
      activeState
        .selectedItemId,
      targetId
    );

  }


  // =====================================
  // CREAR ITEM
  // =====================================

  function itemHTML(
    item
  ){

    const selected =
      activeState
        ?.selectedItemId ===
        item.id;


    let resultClass = '';


    if(
      activeState
        ?.submitted
    ){

      const assigned =
        activeState
          .assignments[
            item.id
          ];


      resultClass =
        assigned ===
          item.correctTargetId

          ? 'noa-drag-correct-item'

          : 'noa-drag-wrong-item';

    }


    return `

      <div
        class="
          noa-drag-item
          ${selected ? 'selected' : ''}
          ${resultClass}
        "

        draggable="${
          activeState
            ?.submitted
            ? 'false'
            : 'true'
        }"

        data-noa-drag-item="${
          esc(item.id)
        }"
      >

        ${esc(item.text)}

      </div>

    `;

  }


  // =====================================
  // RENDER
  // =====================================

  function renderCurrent(){

    const root =
      document.getElementById(
        'noaDragRendererRoot'
      );


    if(
      !root ||
      !activeState
    ){
      return;
    }


    const q =
      activeState.question;


    const unassigned =
      q.elements.filter(
        element =>
          !activeState
            .assignments[
              element.id
            ]
      );


    const allAssigned =
      q.elements.every(
        element =>
          activeState
            .assignments[
              element.id
            ]
      );


    root.innerHTML = `

      <div class="noa-drag-overlay">

        <div class="noa-drag-topbar">

          <div>

            <div class="noa-drag-brand">
              NOA · Simulador EXCOBA
            </div>

            <div class="noa-drag-counter">
              Reactivo de clasificación
            </div>

          </div>


          <button
            class="noa-drag-close"
            id="noaDragClose"
          >
            Cerrar
          </button>

        </div>


        <div class="noa-drag-page">

          <div class="noa-drag-question">

            <div class="noa-drag-type">
              Clasificación de elementos
            </div>


            <div class="noa-drag-instruction">

              ${
                esc(
                  q.instruction
                )
              }

            </div>


            ${
              q.stem

                ? `
                  <div class="noa-drag-stem">
                    ${esc(q.stem)}
                  </div>
                `

                : ''
            }


            <div class="noa-drag-help">

              Arrastra los elementos a su
              categoría correspondiente.

              También puedes seleccionar
              un elemento y después
              seleccionar la categoría.

            </div>


            <div class="noa-drag-bank-title">

              Elementos por clasificar

            </div>


            <div
              class="noa-drag-bank"
              data-noa-drag-bank
            >

              ${
                unassigned
                  .map(
                    itemHTML
                  )
                  .join('')
              }

              ${
                !unassigned.length

                  ? `
                    <span style="
                      color:#777;
                      font-size:13px;
                    ">
                      Todos los elementos
                      han sido colocados.
                    </span>
                  `

                  : ''
              }

            </div>


            <div class="noa-drag-targets">

              ${
                q.targets
                  .map(
                    target => {

                      const placed =
                        q.elements.filter(
                          element =>
                            activeState
                              .assignments[
                                element.id
                              ] ===
                            target.id
                        );


                      return `

                        <div
                          class="noa-drag-target"

                          data-noa-target="${
                            esc(
                              target.id
                            )
                          }"
                        >

                          <div
                            class="
                              noa-drag-target-header
                            "
                          >

                            ${esc(target.label)}

                          </div>


                          <div
                            class="
                              noa-drag-target-body
                            "
                          >

                            ${
                              placed
                                .map(
                                  itemHTML
                                )
                                .join('')
                            }

                          </div>

                        </div>

                      `;

                    }
                  )
                  .join('')
              }

            </div>


            <div class="noa-drag-actions">

              <button
                class="noa-drag-btn"
                id="noaDragReset"
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
                  noa-drag-btn
                  primary
                "
                id="noaDragSubmit"

                ${
                  (
                    !allAssigned ||
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
              class="noa-drag-result"
              id="noaDragResult"

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
        '[data-noa-drag-item]'
      )
      .forEach(
        element => {

          const id =
            element.dataset
              .noaDragItem;


          element.addEventListener(
            'click',
            () =>
              selectItem(id)
          );


          element.addEventListener(
            'dragstart',
            event => {

              if(
                activeState
                  .submitted
              ){
                event
                  .preventDefault();

                return;
              }


              event
                .dataTransfer
                .setData(
                  'text/plain',
                  id
                );


              element
                .classList
                .add(
                  'dragging'
                );

            }
          );


          element.addEventListener(
            'dragend',
            () => {

              element
                .classList
                .remove(
                  'dragging'
                );

            }
          );

        }
      );


    document
      .querySelectorAll(
        '[data-noa-target]'
      )
      .forEach(
        target => {

          const targetId =
            target.dataset
              .noaTarget;


          target.addEventListener(
            'click',
            event => {

              if(
                event.target
                  .closest(
                    '[data-noa-drag-item]'
                  )
              ){
                return;
              }


              selectTarget(
                targetId
              );

            }
          );


          target.addEventListener(
            'dragover',
            event => {

              if(
                activeState
                  .submitted
              ){
                return;
              }


              event
                .preventDefault();


              target
                .classList
                .add(
                  'over'
                );

            }
          );


          target.addEventListener(
            'dragleave',
            () => {

              target
                .classList
                .remove(
                  'over'
                );

            }
          );


          target.addEventListener(
            'drop',
            event => {

              event
                .preventDefault();


              target
                .classList
                .remove(
                  'over'
                );


              const itemId =
                event
                  .dataTransfer
                  .getData(
                    'text/plain'
                  );


              if(itemId){

                assign(
                  itemId,
                  targetId
                );

              }

            }
          );

        }
      );


    document
      .querySelector(
        '[data-noa-drag-bank]'
      )
      ?.addEventListener(
        'dragover',
        event =>
          event
            .preventDefault()
      );


    document
      .querySelector(
        '[data-noa-drag-bank]'
      )
      ?.addEventListener(
        'drop',
        event => {

          event
            .preventDefault();


          const itemId =
            event
              .dataTransfer
              .getData(
                'text/plain'
              );


          if(itemId){

            assign(
              itemId,
              null
            );

          }

        }
      );


    document
      .getElementById(
        'noaDragReset'
      )
      ?.addEventListener(
        'click',
        reset
      );


    document
      .getElementById(
        'noaDragSubmit'
      )
      ?.addEventListener(
        'click',
        submit
      );


    document
      .getElementById(
        'noaDragClose'
      )
      ?.addEventListener(
        'click',
        close
      );

  }


  // =====================================
  // SCORE
  // =====================================

  function calculateScore(){

    const q =
      activeState.question;


    let correct = 0;


    q.elements.forEach(
      element => {

        if(
          activeState
            .assignments[
              element.id
            ] ===
          element
            .correctTargetId
        ){

          correct++;

        }

      }
    );


    return {

      correct,

      total:
        q.elements.length,

      score:
        q.elements.length

          ? correct /
            q.elements.length

          : 0

    };

  }


  function resultHTML(){

    const result =
      activeState.score;


    const pct =
      Math.round(
        result.score * 100
      );


    return `

      <div class="noa-drag-score">

        ${
          result.correct
        } / ${
          result.total
        } correctos

        · ${pct}%

      </div>


      <div class="noa-drag-explanation">

        ${
          esc(
            activeState
              .question
              .explanation ||
            ''
          )
        }

      </div>

    `;

  }


  function submit(){

    if(
      !activeState ||
      activeState.submitted
    ){
      return;
    }


    activeState.score =
      calculateScore();


    activeState.submitted =
      true;


    renderCurrent();


    console.log(
      'NOA Drag Score:',
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
      activeState
        .assignments
    )
      .forEach(
        key => {

          activeState
            .assignments[
              key
            ] = null;

        }
      );


    activeState.selectedItemId =
      null;


    renderCurrent();

  }


  // =====================================
  // ABRIR / CERRAR
  // =====================================

  function open(
    question
  ){

    if(
      !question ||
      question
        .interactionType !==
        'drag_classify'
    ){

      throw new Error(
        'El renderer necesita ' +
        'un reactivo drag_classify'
      );

    }


    ensureStyles();


    let root =
      document.getElementById(
        'noaDragRendererRoot'
      );


    if(!root){

      root =
        document.createElement(
          'div'
        );


      root.id =
        'noaDragRendererRoot';


      document.body
        .appendChild(
          root
        );

    }


    activeState =
      createState(
        question
      );


    renderCurrent();


    return activeState;

  }


  function close(){

    document
      .getElementById(
        'noaDragRendererRoot'
      )
      ?.remove();


    activeState =
      null;

  }


  function getState(){

    return activeState;

  }


  // =====================================
  // API
  // =====================================

  window.NOA_DRAG_RENDERER = {

    version:
      VERSION,

    open,

    close,

    getState,

    calculateScore:
      () =>
        activeState
          ? calculateScore()
          : null

  };


  console.log(
    'NOA EXCOBA Drag Renderer v12 ✓'
  );

})();
