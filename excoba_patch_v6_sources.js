/* =========================================================
   NOA SOURCE ENGINE v6
   - Perfiles de entrenamiento
   - Banco personal de clases
   - Infraestructura para preguntas extendidas
   ========================================================= */

(() => {

  // =========================================
  // PERFILES
  // =========================================

  const TRAINING_PROFILES = {

    official: {
      key: 'official',
      label: 'Simulacro oficial',
      official: 1.00,
      extended: 0.00,
      course: 0.00,
      challenge: false
    },

    extended: {
      key: 'extended',
      label: 'Entrenamiento extendido',
      official: 0.55,
      extended: 0.30,
      course: 0.15,
      challenge: false
    },

    course: {
      key: 'course',
      label: 'Curso + EXCOBA',
      official: 0.40,
      extended: 0.15,
      course: 0.45,
      challenge: false
    },

    extreme: {
      key: 'extreme',
      label: 'Desafío extremo',
      official: 0.40,
      extended: 0.35,
      course: 0.25,
      challenge: true
    }

  };


  // =========================================
  // BASE DE DATOS
  // =========================================

  function ensureSourceDB(){

    if(!db.settings){
      db.settings = {};
    }

    if(!db.settings.noaTrainingProfile){

      db.settings.noaTrainingProfile =
        'official';

    }

    if(!Array.isArray(db.courseSources)){

      db.courseSources = [];

    }

  }


  function makeId(){

    if(
      typeof crypto !== 'undefined' &&
      crypto.randomUUID
    ){

      return crypto.randomUUID();

    }

    return (
      'course-' +
      Date.now() +
      '-' +
      Math.random()
        .toString(36)
        .slice(2)
    );

  }


  // =========================================
  // PERFIL ACTUAL
  // =========================================

  function getTrainingProfile(){

    ensureSourceDB();

    const select =
      document.getElementById(
        'excobaTrainingProfile'
      );

    const key =
      select?.value ||
      db.settings.noaTrainingProfile ||
      'official';


    return (

      TRAINING_PROFILES[key] ||
      TRAINING_PROFILES.official

    );

  }


  function setTrainingProfile(key){

    ensureSourceDB();

    if(!TRAINING_PROFILES[key]){
      return;
    }

    db.settings.noaTrainingProfile = key;

    try{
      save();
    }catch{}

    renderProfileInfo();

  }


  // =========================================
  // FUENTES DEL CURSO
  // =========================================

  function addCourseSource(
    subject,
    content,
    title=''
  ){

    ensureSourceDB();

    const text =
      String(content || '').trim();

    if(!text){
      return false;
    }


    const source = {

      id: makeId(),

      subject:
        String(subject || '').trim(),

      title:
        String(title || '').trim() ||
        text.split('\n')[0].slice(0,80),

      content: text,

      createdAt:
        new Date().toISOString(),

      sourceType:
        'course'

    };


    db.courseSources.push(source);

    try{
      save();
    }catch{}


    return source;

  }


  function getCourseSources(subject){

    ensureSourceDB();

    const target =
      String(subject || '')
        .trim()
        .toLowerCase();


    return db.courseSources.filter(s => {

      if(!target){
        return true;
      }

      return String(
        s.subject || ''
      )
        .trim()
        .toLowerCase() === target;

    });

  }


  function removeCourseSource(id){

    ensureSourceDB();

    db.courseSources =
      db.courseSources.filter(
        s => s.id !== id
      );

    try{
      save();
    }catch{}

    renderCourseSources();

  }


  // =========================================
  // INFORMACIÓN DEL PERFIL
  // =========================================

  function pct(v){

    return Math.round(v * 100);

  }


  function renderProfileInfo(){

    const box =
      document.getElementById(
        'noaTrainingProfileInfo'
      );

    if(!box){
      return;
    }


    const p =
      getTrainingProfile();


    box.innerHTML = `

      <b>${p.label}</b>

      <div class="small"
           style="margin-top:5px">

        Oficial:
        ${pct(p.official)}%

        · Extendido:
        ${pct(p.extended)}%

        · Curso:
        ${pct(p.course)}%

        ${
          p.challenge
            ? ' · dificultad extrema'
            : ''
        }

      </div>

    `;

  }


  // =========================================
  // MOSTRAR FUENTES GUARDADAS
  // =========================================

  function renderCourseSources(){

    const box =
      document.getElementById(
        'noaCourseSourcesList'
      );

    if(!box){
      return;
    }


    const subject =
      document.getElementById(
        'excobaStudySubject'
      )?.value || '';


    const sources =
      getCourseSources(subject);


    if(!sources.length){

      box.innerHTML = `

        <div class="muted small">

          Todavía no hay material de clase
          guardado para esta materia.

        </div>

      `;

      return;

    }


    box.innerHTML =
      sources.map(s => `

        <div
          class="item"
          style="margin-top:8px"
        >

          <b>
            ${escapeHTML(s.title)}
          </b>

          <div
            class="small"
            style="margin-top:5px"
          >

            ${escapeHTML(
              s.content.slice(0,180)
            )}

            ${
              s.content.length > 180
                ? '…'
                : ''
            }

          </div>

          <button
            class="btn"
            style="margin-top:8px"
            data-remove-course="${s.id}"
          >

            Eliminar

          </button>

        </div>

      `).join('');


    box
      .querySelectorAll(
        '[data-remove-course]'
      )
      .forEach(btn => {

        btn.addEventListener(
          'click',
          () => {

            removeCourseSource(
              btn.dataset.removeCourse
            );

          }
        );

      });

  }


  function escapeHTML(value){

    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;');

  }


  // =========================================
  // CREAR INTERFAZ
  // =========================================

  function ensureSourceUI(){

    ensureSourceDB();


    if(
      document.getElementById(
        'excobaTrainingProfile'
      )
    ){

      renderProfileInfo();
      renderCourseSources();

      return;

    }


    const subjectSelect =
      document.getElementById(
        'excobaStudySubject'
      );


    if(!subjectSelect){
      return;
    }


    const card =
      subjectSelect.closest('.card');


    if(!card){
      return;
    }


    const block =
      document.createElement('div');


    block.innerHTML = `

      <div
        style="
          margin-top:18px;
          padding-top:18px;
          border-top:1px solid var(--line);
        "
      >

        <h3>
          Motor de entrenamiento
        </h3>


        <div class="field">

          <label>
            Modo
          </label>

          <select
            id="excobaTrainingProfile"
          >

            <option value="official">
              Simulacro oficial
            </option>

            <option value="extended">
              Entrenamiento extendido
            </option>

            <option value="course">
              Curso + EXCOBA
            </option>

            <option value="extreme">
              Desafío extremo
            </option>

          </select>

        </div>


        <div
          id="noaTrainingProfileInfo"
          class="sourcebox"
          style="margin-top:10px"
        ></div>


        <div
          style="
            margin-top:18px;
            padding-top:18px;
            border-top:1px solid var(--line);
          "
        >

          <h3>
            Banco del curso
          </h3>


          <p class="small">

            Guarda aquí temas, fragmentos de
            apuntes o contenido que hayas visto
            en tus clases.

          </p>


          <textarea
            id="noaCourseSourceInput"
            placeholder="Ejemplo:

Bioquímica · Enzimas
Cinética enzimática, Km, Vmax,
inhibición competitiva..."
          ></textarea>


          <button
            class="btn primary"
            id="noaSaveCourseSource"
            style="margin-top:10px"
          >

            Guardar material de clase

          </button>


          <div
            id="noaCourseSourcesList"
            style="margin-top:12px"
          ></div>

        </div>

      </div>

    `;


    card.appendChild(block);


    const profileSelect =
      document.getElementById(
        'excobaTrainingProfile'
      );


    profileSelect.value =
      db.settings.noaTrainingProfile ||
      'official';


    profileSelect.addEventListener(
      'change',
      () => {

        setTrainingProfile(
          profileSelect.value
        );

      }
    );


    subjectSelect.addEventListener(
      'change',
      renderCourseSources
    );


    document
      .getElementById(
        'noaSaveCourseSource'
      )
      ?.addEventListener(
        'click',
        () => {

          const input =
            document.getElementById(
              'noaCourseSourceInput'
            );

          const content =
            input?.value.trim() || '';


          if(!content){

            try{
              toast(
                'Escribe primero el material de clase'
              );
            }catch{}

            return;

          }


          const subject =
            subjectSelect.value;


          addCourseSource(
            subject,
            content
          );


          input.value = '';


          renderCourseSources();


          try{
            toast(
              'Material del curso guardado'
            );
          }catch{}

        }
      );


    renderProfileInfo();
    renderCourseSources();

  }


  // =========================================
  // API GLOBAL
  // =========================================

  window.NOA_SOURCE_ENGINE = {

    profiles:
      TRAINING_PROFILES,

    getProfile:
      getTrainingProfile,

    getCourseSources,

    addCourseSource,

    removeCourseSource

  };


  // =========================================
  // INICIO
  // =========================================

  function init(){

    ensureSourceDB();

    ensureSourceUI();

    setTimeout(
      ensureSourceUI,
      400
    );

    setTimeout(
      ensureSourceUI,
      1200
    );

  }


  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(
      'DOMContentLoaded',
      init
    );

  }else{

    init();

  }

})();
