/* =========================================================
   NOA EXCOBA DRAG ORDER RENDERER v18

   Renderer para:
   drag_order

   - mezcla automáticamente los elementos
   - drag & drop
   - botones subir / bajar
   - compatible con móvil
   - crédito parcial por pares adyacentes
   - feedback final

   Todavía NO entra al examen mixto.
   ========================================================= */

(() => {

  const VERSION = '18.0';

  let activeState = null;


  // =====================================
  // ESTILOS
  // =====================================

  function ensureStyles(){

    if(
      document.getElementById(
        'noaOrderRendererStyles'
      )
    ){
      return;
    }


    const style =
      document.createElement(
        'style'
      );


    style.id =
      'noaOrderRendererStyles';


    style.textContent = `

      .noa-order-overlay{

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


      .noa-order-topbar{

        min-height:58px;

        padding:
          8px 18px;

        display:flex;

        align-items:center;

        justify-content:
          space-between;

        gap:15px;

        background:#e5e5e5;

        border-bottom:
          1px solid #c6c6c6;

      }


      .noa-order-brand{

        font-size:15px;

        font-weight:700;

      }


      .noa-order-type{

        margin-top:2px;

        font-size:13px;

        color:#555;

      }


      .noa-order-close{

        padding:
          7px 12px;

        border:
          1px solid #aaa;

        border-radius:5px;

        background:white;

        cursor:pointer;

      }


      .noa-order-page{

        width:min(
          950px,
          calc(100% - 28px)
        );

        margin:
          25px auto 60px;

      }


      .noa-order-card{

        padding:26px;

        background:white;

        border:
          1px solid #ccc;

        border-radius:4px;

        box-shadow:
          0 1px 3px
          rgba(0,0,0,.08);

      }


      .noa-order-label{

        margin-bottom:10px;

        font-size:12px;

        color:#666;

        text-transform:uppercase;

        letter-spacing:.6px;

      }


      .noa-order-instruction{

        margin-bottom:8px;

        font-size:20px;

        font-weight:600;

        line-height:1.45;

      }


      .noa-order-stem{

        margin-bottom:20px;

        color:#444;

        line-height:1.55;

      }


      .noa-order-help{

        margin-bottom:18px;

        padding:
          10px 12px;

        border-left:
          4px solid #808080;

        background:#f7f7f7;

        color:#555;

        font-size:13px;

      }


      .noa-order-list{

        display:grid;

        gap:10px;

      }


      .noa-order-row{

        display:grid;

        grid-template-columns:
          44px 1fr auto;

        align-items:center;

        gap:10px;

        padding:
          10px;

        border:
          1px solid #a5a5a5;

        border-radius:4px;

        background:#fafafa;

        cursor:grab;

        transition:
          border-color .15s ease,
          background .15s ease,
          transform .15s ease;

      }


      .noa-order-row:hover{

        border-color:#555;

      }


      .noa-order-row.dragging{

        opacity:.45;

      }


      .noa-order-row.over{

        border:
          2px solid #1769aa;

        background:#eef6fd;

      }


      .noa-order-position{

        width:34px;
        height:34px;

        display:flex;

        align-items:center;

        justify-content:center;

        border-radius:50%;

        background:#e5e5e5;

        font-weight:700;

      }


      .noa-order-text{

        line-height:1.4;

        font-size:15px;

      }


      .noa-order-controls{

        display:flex;

        gap:5px;

      }


      .noa-order-arrow{

        width:34px;
        height:34px;

        border:
          1px solid #999;

        border-radius:3px;

        background:white;

        cursor:pointer;

        font-size:16px;

        font-weight:700;

      }


      .noa-order-arrow:disabled{

        opacity:.35;

        cursor:not-allowed;

      }


      .noa-order-row.correct-position{

        border-color:#37945c;

        background:#effaf3;

      }


      .noa-order-row.wrong-position{

        border-color:#b73535;

        background:#fff1f1;

      }


      .noa-order-actions{

        display:flex;

        justify-content:flex-end;

        gap:10px;

        flex-wrap:wrap;

        margin-top:22px;

      }


      .noa-order-btn{

        padding:
          9px 18px;

        border:
          1px solid #888;

        border-radius:4px;

        background:white;

        cursor:pointer;

        font-weight:600;

      }


      .noa-order-btn.primary{

        color:white;

        border-color:#34699a;

        background:#34699a;

      }


      .noa-order-btn:disabled{

        opacity:.5;

        cursor:not-allowed;

      }


      .noa-order-result{

        display:none;

        margin-top:22px;

        padding-top:20px;

        border-top:
          1px solid #ddd;

      }


      .noa-order-score{

        margin-bottom:10px;

        font-size:21px;

        font-weight:700;

      }


      .noa-order-subscore{

        margin-bottom:15px;

        color:#555;

      }


      .noa-order-correct-list{

        display:grid;

        gap:6px;

        margin-top:12px;

      }


      .noa-order-correct-row{

        padding:
          8px 10px;

        border:
          1px solid #ddd;

        background:#fafafa;

        font-size:14px;

      }


      .noa-order-explanation{

        margin-top:16px;

        color:#444;

        line-height:1.55;

      }


      @media(max-width:700px){

        .noa-order-page{

          width:
            calc(100% - 16px);

          margin-top:12px;

        }


        .noa-order-card{

          padding:16px;

        }


        .noa-order-row{

          grid-template-columns:
            36px 1fr;

        }


        .noa-order-controls{

          grid-column:
            1 / -1;

          justify-content:flex-end;

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
  // SHUFFLE
  // =====================================

  function arraysEqual(
    a,
    b
  ){

    return (
      a.length ===
        b.length &&

      a.every(
        (value,index) =>
          value === b[index]
      )
    );

  }


  function shuffledOrder(
    question
  ){

    const ids =
      question
        .items
        .map(
          item => item.id
        );


    const shuffled = [
      ...ids
    ];


    // Fisher-Yates

    for(
      let i =
        shuffled.length - 1;

      i > 0;

      i--
    ){

      const j =
        Math.floor(
          Math.random() *
          (i + 1)
        );


      [
        shuffled[i],
        shuffled[j]
      ] = [

        shuffled[j],
        shuffled[i]

      ];

    }


    // Evitar que casualmente
    // aparezca ya resuelto.

    if(
      shuffled.length > 1 &&
      arraysEqual(
        shuffled,
        question.correctOrder
      )
    ){

      [
        shuffled[0],
        shuffled[1]
      ] = [

        shuffled[1],
        shuffled[0]

      ];

    }


    return shuffled;

  }


  // =====================================
  // ESTADO
  // =====================================

  function createState(
    question
  ){

    return {

      question,

      order:
        shuffledOrder(
          question
        ),

      submitted:false,

      score:null

    };

  }


  // =====================================
  // ITEM
  // =====================================

  function itemById(
    question,
    id
  ){

    return (
      question
        .items
        .find(
          item =>
            item.id === id
        ) ||
      null
    );

  }


  // =====================================
  // MOVER
  // =====================================

  function moveToIndex(
    itemId,
    targetIndex
  ){

    if(
      !activeState ||
      activeState.submitted
    ){
      return;
    }


    const currentIndex =
      activeState
        .order
        .indexOf(
          itemId
        );


    if(
      currentIndex < 0
    ){
      return;
    }


    const next = [
      ...activeState.order
    ];


    next.splice(
      currentIndex,
      1
    );


    const safeIndex =
      Math.max(
        0,
        Math.min(
          next.length,
          targetIndex
        )
      );


    next.splice(
      safeIndex,
      0,
      itemId
    );


    activeState.order =
      next;


    render();

  }


  function moveBy(
    itemId,
    delta
  ){

    if(
      !activeState ||
      activeState.submitted
    ){
      return;
    }


    const index =
      activeState
        .order
        .indexOf(
          itemId
        );


    if(index < 0){
      return;
    }


    const target =
      index + delta;


    if(
      target < 0 ||
      target >=
        activeState
          .order
          .length
    ){
      return;
    }


    const next = [
      ...activeState.order
    ];


    [
      next[index],
      next[target]
    ] = [

      next[target],
      next[index]

    ];


    activeState.order =
      next;


    render();

  }


  // =====================================
  // SCORE
  // =====================================

  function calculateScore(){

    if(!activeState){
      return null;
    }


    const current =
      activeState.order;


    const correct =
      activeState
        .question
        .correctOrder;


    const totalPairs =
      Math.max(
        1,
        correct.length - 1
      );


    const correctPairs =
      new Set();


    for(
      let i=0;
      i<
        correct.length - 1;
      i++
    ){

      correctPairs.add(
        correct[i] +
        '→' +
        correct[i + 1]
      );

    }


    let matchedPairs = 0;


    for(
      let i=0;
      i<
        current.length - 1;
      i++
    ){

      const pair =
        current[i] +
        '→' +
        current[i + 1];


      if(
        correctPairs.has(
          pair
        )
      ){

        matchedPairs++;

      }

    }


    const exact =
      arraysEqual(
        current,
        correct
      );


    return {

      correct:
        matchedPairs,

      total:
        totalPairs,

      score:
        exact
          ? 1
          : matchedPairs /
            totalPairs,

      exact

    };

  }


  // =====================================
  // RENDER
  // =====================================

  function render(){

    const root =
      document.getElementById(
        'noaOrderRendererRoot'
      );


    if(
      !root ||
      !activeState
    ){
      return;
    }


    const q =
      activeState.question;


    root.innerHTML = `

      <div
        class="noa-order-overlay"
      >

        <div
          class="noa-order-topbar"
        >

          <div>

            <div
              class="noa-order-brand"
            >
              NOA · Simulador EXCOBA
            </div>

            <div
              class="noa-order-type"
            >
              Ordenamiento de elementos
            </div>

          </div>


          <button
            class="noa-order-close"
            id="noaOrderClose"
          >
            Cerrar
          </button>

        </div>


        <div
          class="noa-order-page"
        >

          <div
            class="noa-order-card"
          >

            <div
              class="noa-order-label"
            >
              Ordenamiento
            </div>


            <div
              class="noa-order-instruction"
            >

              ${esc(q.instruction)}

            </div>


            ${
              q.stem

                ? `
                  <div
                    class="noa-order-stem"
                  >
                    ${esc(q.stem)}
                  </div>
                `

                : ''
            }


            <div
              class="noa-order-help"
            >

              Arrastra los elementos
              para cambiar su posición.

              También puedes usar
              ↑ y ↓.

            </div>


            <div
              class="noa-order-list"
              id="noaOrderList"
            >

              ${
                activeState
                  .order
                  .map(
                    (
                      id,
                      index
                    ) => {

                      const item =
                        itemById(
                          q,
                          id
                        );


                      const correctId =
                        q
                          .correctOrder[
                            index
                          ];


                      let resultClass =
                        '';


                      if(
                        activeState
                          .submitted
                      ){

                        resultClass =
                          id === correctId

                            ? 'correct-position'

                            : 'wrong-position';

                      }


                      return `

                        <div
                          class="
                            noa-order-row
                            ${resultClass}
                          "

                          draggable="${
                            activeState
                              .submitted
                              ? 'false'
                              : 'true'
                          }"

                          data-noa-order-item="${
                            esc(id)
                          }"

                          data-order-index="${
                            index
                          }"
                        >

                          <div
                            class="
                              noa-order-position
                            "
                          >
                            ${index + 1}
                          </div>


                          <div
                            class="
                              noa-order-text
                            "
                          >
                            ${esc(item?.text)}
                          </div>


                          <div
                            class="
                              noa-order-controls
                            "
                          >

                            <button
                              class="
                                noa-order-arrow
                              "

                              data-order-up="${
                                esc(id)
                              }"

                              ${
                                (
                                  index === 0 ||
                                  activeState
                                    .submitted
                                )
                                  ? 'disabled'
                                  : ''
                              }
                            >
                              ↑
                            </button>


                            <button
                              class="
                                noa-order-arrow
                              "

                              data-order-down="${
                                esc(id)
                              }"

                              ${
                                (
                                  index ===
                                  activeState
                                    .order
                                    .length - 1 ||

                                  activeState
                                    .submitted
                                )
                                  ? 'disabled'
                                  : ''
                              }
                            >
                              ↓
                            </button>

                          </div>

                        </div>

                      `;

                    }
                  )
                  .join('')
              }

            </div>


            <div
              class="noa-order-actions"
            >

              <button
                class="noa-order-btn"
                id="noaOrderReset"

                ${
                  activeState.submitted
                    ? 'disabled'
                    : ''
                }
              >

                Mezclar de nuevo

              </button>


              <button
                class="
                  noa-order-btn
                  primary
                "

                id="noaOrderSubmit"

                ${
                  activeState.submitted
                    ? 'disabled'
                    : ''
                }
              >

                Responder

              </button>

            </div>


            <div
              class="noa-order-result"
              id="noaOrderResult"

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
  // EVENTS
  // =====================================

  function bindEvents(){

    document
      .querySelectorAll(
        '[data-noa-order-item]'
      )
      .forEach(
        row => {

          const id =
            row.dataset
              .noaOrderItem;


          row.addEventListener(
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


              row
                .classList
                .add(
                  'dragging'
                );

            }
          );


          row.addEventListener(
            'dragend',

            () => {

              row
                .classList
                .remove(
                  'dragging'
                );

            }
          );


          row.addEventListener(
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


              row
                .classList
                .add(
                  'over'
                );

            }
          );


          row.addEventListener(
            'dragleave',

            () => {

              row
                .classList
                .remove(
                  'over'
                );

            }
          );


          row.addEventListener(
            'drop',

            event => {

              event
                .preventDefault();


              row
                .classList
                .remove(
                  'over'
                );


              const draggedId =
                event
                  .dataTransfer
                  .getData(
                    'text/plain'
                  );


              if(
                !draggedId ||
                draggedId === id
              ){
                return;
              }


              const targetIndex =
                activeState
                  .order
                  .indexOf(
                    id
                  );


              moveToIndex(
                draggedId,
                targetIndex
              );

            }
          );

        }
      );


    document
      .querySelectorAll(
        '[data-order-up]'
      )
      .forEach(
        button => {

          button.addEventListener(
            'click',
            () =>
              moveBy(
                button.dataset
                  .orderUp,
                -1
              )
          );

        }
      );


    document
      .querySelectorAll(
        '[data-order-down]'
      )
      .forEach(
        button => {

          button.addEventListener(
            'click',
            () =>
              moveBy(
                button.dataset
                  .orderDown,
                1
              )
          );

        }
      );


    document
      .getElementById(
        'noaOrderReset'
      )
      ?.addEventListener(
        'click',
        reset
      );


    document
      .getElementById(
        'noaOrderSubmit'
      )
      ?.addEventListener(
        'click',
        submit
      );


    document
      .getElementById(
        'noaOrderClose'
      )
      ?.addEventListener(
        'click',
        close
      );

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


    const correctRows =
      q.correctOrder
        .map(
          (
            id,
            index
          ) => {

            const item =
              itemById(
                q,
                id
              );


            return `

              <div
                class="
                  noa-order-correct-row
                "
              >

                <b>
                  ${index + 1}.
                </b>

                ${esc(item?.text)}

              </div>

            `;

          }
        )
        .join('');


    return `

      <div
        class="noa-order-score"
      >

        ${pct}%

      </div>


      <div
        class="noa-order-subscore"
      >

        Relaciones consecutivas correctas:

        <b>
          ${score.correct}
          /
          ${score.total}
        </b>

      </div>


      <b>
        Orden correcto:
      </b>


      <div
        class="
          noa-order-correct-list
        "
      >

        ${correctRows}

      </div>


      ${
        q.explanation

          ? `
            <div
              class="
                noa-order-explanation
              "
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


    activeState.score =
      calculateScore();


    activeState.submitted =
      true;


    render();


    console.log(
      'NOA Order Score:',
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


    activeState.order =
      shuffledOrder(
        activeState.question
      );


    render();

  }


  // =====================================
  // OPEN
  // =====================================

  function open(
    question
  ){

    if(
      !question ||
      question
        .interactionType !==
        'drag_order'
    ){

      throw new Error(
        'El renderer necesita un reactivo drag_order'
      );

    }


    ensureStyles();


    let root =
      document.getElementById(
        'noaOrderRendererRoot'
      );


    if(!root){

      root =
        document.createElement(
          'div'
        );


      root.id =
        'noaOrderRendererRoot';


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
  // CLOSE
  // =====================================

  function close(){

    document
      .getElementById(
        'noaOrderRendererRoot'
      )
      ?.remove();


    activeState =
      null;

  }


  // =====================================
  // API
  // =====================================

  window.NOA_DRAG_ORDER_RENDERER = {

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
    'NOA EXCOBA Drag Order Renderer v18 ✓'
  );

})();
