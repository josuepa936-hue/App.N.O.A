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
  'course',

analysisStatus:
  'pending',

analysis:
  null,

analyzedAt:
  null,

analysisError:
  null

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

   // =========================================
// NOA SOURCE ANALYZER 1.0
// =========================================

function parseAnalyzerJSON(raw){

  const text =
    String(raw ?? '')
      .replace(/```json/gi,'')
      .replace(/```/g,'')
      .trim();


  try{

    const parsed =
      JSON.parse(text);

    if(
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
    ){
      return parsed;
    }

  }catch{}


  const a =
    text.indexOf('{');

  const b =
    text.lastIndexOf('}');


  if(a >= 0 && b > a){

    const parsed =
      JSON.parse(
        text.slice(a,b+1)
      );

    if(
      parsed &&
      typeof parsed === 'object'
    ){
      return parsed;
    }

  }


  throw new Error(
    'Source Analyzer recibió JSON inválido'
  );

}


function officialItemsForSource(subject){

  try{

    return (
      window
        .NOA_EXCOBA_V4
        ?.itemsFor?.(subject) ||
      []
    );

  }catch{

    return [];

  }

}


function clampDifficulty(value){

  const n =
    Number(value);

  if(!Number.isFinite(n)){
    return 3;
  }

  return Math.max(
    1,
    Math.min(5,Math.round(n))
  );

}


async function analyzeCourseSource(sourceId){

  ensureSourceDB();


  const source =
    db.courseSources.find(
      s => s.id === sourceId
    );


  if(!source){

    throw new Error(
      'No encontré el material de clase'
    );

  }


  source.analysisStatus =
    'analyzing';

  source.analysisError =
    null;


  try{
    save();
  }catch{}


  renderCourseSources();


  // =========================================
  // TEMARIO OFICIAL RELACIONADO
  // =========================================

  const officialItems =
    officialItemsForSource(
      source.subject
    );

   const allowedCodes =
  new Set(
    officialItems.map(item =>
      String(item.code || '')
        .trim()
        .replace(/\.$/,'')
    )
  );


  const officialText =
    officialItems.length

      ? officialItems
          .slice(0,40)
          .map(item =>

            `${item.code} | ` +
            `${item.title}: ` +
            `${item.focus || ''}`

          )
          .join('\n')

      : 'No hay puntos oficiales disponibles.';


  // =========================================
  // LLAMADA A IA
  // =========================================

  const raw =
    await callAI([

      {
        role:'system',

        content:
`Eres NOA Source Analyzer.

Tu trabajo NO es crear preguntas todavía.

Debes convertir material de clase del estudiante
en un mapa académico estructurado que posteriormente
usará un motor de evaluación.

REGLAS IMPORTANTES:

1. Los conceptos declarados como vistos en clase
deben estar respaldados por el MATERIAL DEL CURSO.

2. Puedes detectar relaciones académicas implícitas,
pero debes marcar esas relaciones como "inferred".

3. Nunca inventes que un contenido estaba en la clase.

4. Solo puedes asociar códigos EXCOBA que aparezcan
en la lista oficial proporcionada.

5. Distingue:

core
= contenido directamente alineado con EXCOBA.

related
= extensión natural de un punto EXCOBA.

course_only
= fue visto en clase, pero no está claramente
representado en el temario proporcionado.

advanced
= contenido de profundidad superior que puede
servir para entrenamiento avanzado.

6. La dificultad sugerida 1-5 debe depender de
la demanda cognitiva posible, no de palabras difíciles.

7. Devuelve ÚNICAMENTE JSON válido.`
      },


      {
        role:'user',

        content:
`MATERIA:
${source.subject}

TÍTULO:
${source.title}

MATERIAL DEL CURSO:
--------------------
${source.content}
--------------------

PUNTOS OFICIALES EXCOBA DISPONIBLES:
--------------------
${officialText}
--------------------

Analiza el material.

FORMATO EXACTO:

{
  "summary":"resumen académico breve",

  "concepts":[
    {
      "name":"concepto",
      "classification":"core",
      "depth":"basic",
      "syllabus_codes":["3.4.x.x"]
    }
  ],

  "relations":[
    {
      "from":"concepto A",
      "to":"concepto B",
      "relation":"descripción breve",
      "origin":"explicit"
    }
  ],

  "syllabus_links":[
    {
      "code":"3.4.x.x",
      "relation":"direct",
      "confidence":0.95
    }
  ],

  "evaluable_objectives":[
    {
      "type":"application",
      "objective":"objetivo evaluable",
      "suggested_difficulty":3
    }
  ],

  "overall_classification":"related",

  "estimated_depth":"intermediate"
}`
      }

    ],{
      temperature:0.1
    });


  const data =
    parseAnalyzerJSON(raw);


  // =========================================
  // NORMALIZAR RESULTADO
  // =========================================

  const analysis = {

    summary:
      String(
        data.summary || ''
      )
        .trim()
        .slice(0,700),


    concepts:
      Array.isArray(data.concepts)

        ? data.concepts
            .slice(0,40)
            .map(c => ({

              name:
                String(
                  c.name || ''
                ).trim(),

              classification:
                [
                  'core',
                  'related',
                  'course_only',
                  'advanced'
                ].includes(
                  c.classification
                )
                  ? c.classification
                  : 'course_only',

              depth:
                [
                  'basic',
                  'intermediate',
                  'advanced'
                ].includes(c.depth)

                  ? c.depth
                  : 'intermediate',

             syllabus_codes:
  Array.isArray(
    c.syllabus_codes
  )
    ? c.syllabus_codes
        .map(code =>
          String(code || '')
            .trim()
            .replace(/\.$/,'')
        )
        .filter(code =>
          allowedCodes.has(code)
        )
        .slice(0,8)
    : []

            }))
            .filter(c => c.name)

        : [],


    relations:
      Array.isArray(data.relations)

        ? data.relations
            .slice(0,40)
            .map(r => ({

              from:
                String(
                  r.from || ''
                ).trim(),

              to:
                String(
                  r.to || ''
                ).trim(),

              relation:
                String(
                  r.relation || ''
                ).trim(),

              origin:
                r.origin === 'explicit'
                  ? 'explicit'
                  : 'inferred'

            }))
            .filter(
              r => r.from && r.to
            )

        : [],


    syllabus_links:
      Array.isArray(
        data.syllabus_links
      )

        ? data.syllabus_links
            .slice(0,20)
            .map(link => ({

              code:
                String(
                  link.code || ''
                ).trim(),

              relation:
                String(
                  link.relation ||
                  'related'
                ).trim(),

              confidence:
                Math.max(
                  0,
                  Math.min(
                    1,
                    Number(
                      link.confidence
                    ) || 0
                  )
                )

         }))
.filter(link =>
  link.code &&
  allowedCodes.has(
    String(link.code)
      .trim()
      .replace(/\.$/,'')
  )
)

        : [],


    evaluable_objectives:
      Array.isArray(
        data.evaluable_objectives
      )

        ? data.evaluable_objectives
            .slice(0,30)
            .map(o => ({

              type:
                [
                  'conceptual',
                  'comprehension',
                  'application',
                  'integration',
                  'discrimination',
                  'multi_step'
                ].includes(o.type)

                  ? o.type
                  : 'application',

              objective:
                String(
                  o.objective || ''
                ).trim(),

              suggested_difficulty:
                clampDifficulty(
                  o.suggested_difficulty
                )

            }))
            .filter(
              o => o.objective
            )

        : [],


    overall_classification:
      [
        'core',
        'related',
        'course_only',
        'advanced'
      ].includes(
        data.overall_classification
      )

        ? data.overall_classification
        : 'course_only',


    estimated_depth:
      [
        'basic',
        'intermediate',
        'advanced'
      ].includes(
        data.estimated_depth
      )

        ? data.estimated_depth
        : 'intermediate'

  };


  // =========================================
  // GUARDAR ANÁLISIS
  // =========================================

  source.analysis =
    analysis;

  source.analysisStatus =
    'ready';

  source.analyzedAt =
    new Date().toISOString();

  source.analysisError =
    null;


  try{
    save();
  }catch{}


  renderCourseSources();


  return analysis;

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
${renderSourceAnalysis(s)}

<button
  class="btn"
  style="margin-top:8px"
  data-analyze-course="${s.id}"
>
  ${
    s.analysis
      ? 'Reanalizar con NOA'
      : 'Analizar con NOA'
  }
</button>

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
    '[data-analyze-course]'
  )
  .forEach(btn => {

    btn.addEventListener(
      'click',

      async () => {

        const id =
          btn.dataset.analyzeCourse;

        try{

          btn.disabled = true;

          await analyzeCourseSource(id);

          try{
            toast(
              'Source Analyzer completado'
            );
          }catch{}

        }catch(err){

          const source =
            db.courseSources.find(
              s => s.id === id
            );

          if(source){

            source.analysisStatus =
              'error';

            source.analysisError =
              err.message;

            try{
              save();
            }catch{}

          }

          renderCourseSources();

          try{
            toast(
              'No pude analizar: ' +
              err.message
            );
          }catch{}

        }

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
function renderSourceAnalysis(source){

  if(
    source.analysisStatus ===
    'analyzing'
  ){

    return `

      <div
        class="sourcebox"
        style="margin-top:10px"
      >

        NOA Source Analyzer
        está analizando este material…

      </div>

    `;

  }


  if(
    source.analysisStatus ===
    'error'
  ){

    return `

      <div
        class="sourcebox"
        style="margin-top:10px"
      >

        <b>
          Análisis pendiente
        </b>

        <div class="small">

          ${
            escapeHTML(
              source.analysisError ||
              'No se pudo analizar.'
            )
          }

        </div>

      </div>

    `;

  }


  const a =
    source.analysis;


  if(!a){

    return `

      <div
        class="sourcebox"
        style="margin-top:10px"
      >

        Material guardado,
        todavía sin analizar.

      </div>

    `;

  }


  const concepts =
    (a.concepts || [])
      .slice(0,8)
      .map(c =>
        escapeHTML(c.name)
      )
      .join(' · ');


  const codes =
    (a.syllabus_links || [])
      .slice(0,6)
      .map(x =>
        escapeHTML(x.code)
      )
      .join(' · ');


  const levels =
    [...new Set(

      (a.evaluable_objectives || [])
        .map(o =>
          o.suggested_difficulty
        )

    )]
      .sort()
      .join(' · ');


  return `

    <div
      class="sourcebox"
      style="margin-top:10px"
    >

      <b>
        NOA Source Analyzer ✓
      </b>


      <div
        class="small"
        style="margin-top:6px"
      >

        Clasificación:
        <b>
          ${escapeHTML(
            a.overall_classification
          )}
        </b>

        · Profundidad:
        <b>
          ${escapeHTML(
            a.estimated_depth
          )}
        </b>

      </div>


      ${
        concepts
          ? `
            <div
              class="small"
              style="margin-top:6px"
            >

              <b>Conceptos:</b>
              ${concepts}

            </div>
          `
          : ''
      }


      ${
        codes
          ? `
            <div
              class="small"
              style="margin-top:6px"
            >

              <b>
                Relación EXCOBA:
              </b>

              ${codes}

            </div>
          `
          : ''
      }


      ${
        levels
          ? `
            <div
              class="small"
              style="margin-top:6px"
            >

              <b>
                Niveles evaluables:
              </b>

              ${levels}

            </div>
          `
          : ''
      }


      ${
        a.summary
          ? `
            <div
              class="small"
              style="margin-top:8px"
            >

              ${
                escapeHTML(
                  a.summary
                )
              }

            </div>
          `
          : ''
      }

    </div>

  `;

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
  document.getElementById(
    'excobaStudyTools'
  ) ||
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
        async () => {
           

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


   const source =
  addCourseSource(
    subject,
    content
  );


input.value = '';

renderCourseSources();


try{

  toast(
    'Material guardado. NOA lo está analizando…'
  );

}catch{}


try{

  await analyzeCourseSource(
    source.id
  );


  try{

    toast(
      'Material analizado y clasificado'
    );

  }catch{}


}catch(err){

  console.warn(
    'Source Analyzer:',
    err
  );

  try{

    toast(
      'Material guardado, pero el análisis quedó pendiente'
    );

  }catch{}

}

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

    removeCourseSource,

  analyzeCourseSource

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
