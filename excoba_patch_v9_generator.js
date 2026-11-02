/* =========================================================
   NOA EXCOBA GENERATOR BRIDGE v9

   Primer puente entre:

   Source Blueprint v8
          ↓
   Generator
          ↓
   Judge

   CHECKPOINT ACTUAL:
   - single_select
   - una pregunta por slot
   - reposición manteniendo el slot bloqueado

   Todavía NO sustituye el simulador principal.
   ========================================================= */

(() => {

  const VERSION = '9.0';


  // =====================================
  // UTILIDADES
  // =====================================

  function cleanJSON(raw){

    return String(raw ?? '')
      .replace(/```json/gi,'')
      .replace(/```/g,'')
      .trim();

  }


  function parseObject(raw){

    const text =
      cleanJSON(raw);


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


    if(
      a >= 0 &&
      b > a
    ){

      const parsed =
        JSON.parse(
          text.slice(
            a,
            b + 1
          )
        );


      if(
        parsed &&
        typeof parsed === 'object'
      ){
        return parsed;
      }

    }


    throw new Error(
      'La IA no devolvió un objeto JSON válido'
    );

  }


  function clampIndex(value){

    const n =
      Number(value);


    if(
      !Number.isInteger(n) ||
      n < 0 ||
      n > 3
    ){
      return null;
    }


    return n;

  }


  function normalizeCode(value){

    return String(value || '')
      .trim()
      .replace(/\.$/,'');

  }


  // =====================================
  // CONTEXTO DE LA FUENTE
  // =====================================

  function sourceContext(slot){

    const source =
      slot?.source || {};


    // -------------------------------------
    // OFICIAL
    // -------------------------------------

    if(
      source.kind ===
      'official'
    ){

      return `
TIPO DE FUENTE:
OFICIAL EXCOBA

CÓDIGO:
${source.code}

TEMA:
${source.title}

ALCANCE:
${source.focus}

REGLA:
El reactivo debe permanecer dentro de este
punto del temario oficial.
`;

    }


    // -------------------------------------
    // EXTENDIDA
    // -------------------------------------

    if(
      source.kind ===
      'extended'
    ){

      return `
TIPO DE FUENTE:
ENTRENAMIENTO EXTENDIDO

PUNTO OFICIAL DE ANCLAJE:
${source.anchorCode}

TEMA:
${source.anchorTitle}

ALCANCE OFICIAL:
${source.anchorFocus}

REGLA:
Puedes construir una extensión natural,
una aplicación más profunda o una situación
más exigente, pero debe continuar siendo
académicamente trazable al punto oficial.

No conviertas la pregunta en trivia externa.
`;

    }


    // -------------------------------------
    // CURSO
    // -------------------------------------

    if(
      source.kind ===
      'course'
    ){

      const objective =
        source.objective
          ? `
OBJETIVO EVALUABLE:
${source.objective.text}

TIPO:
${source.objective.type}
`
          : '';


      const anchor =
        source.officialAnchor
          ? `
RELACIÓN OFICIAL:
${source.officialAnchor.code}
${source.officialAnchor.title}

${source.officialAnchor.focus}
`
          : `
RELACIÓN OFICIAL:
Este material puede ser exclusivo del curso.
No inventes una relación EXCOBA inexistente.
`;


      return `
TIPO DE FUENTE:
MATERIAL DEL CURSO

TÍTULO:
${source.title}

CLASIFICACIÓN:
${source.classification}

PROFUNDIDAD:
${source.depth}

${objective}

${anchor}

MATERIAL REAL DEL ESTUDIANTE:
-----------------------------
${source.material}
-----------------------------

REGLA:
La pregunta debe estar respaldada por
este material. No inventes que se vio
contenido que no aparece aquí.
`;

    }


    throw new Error(
      'Tipo de fuente no reconocido'
    );

  }


  // =====================================
  // ESPECIFICACIÓN DE DIFICULTAD
  // =====================================

  function difficultyContext(slot){

    const d =
      slot?.difficulty || {};


    return `
DIFICULTAD OBLIGATORIA:
${d.level}/5

NIVEL COGNITIVO:
${d.cognitive || 'application'}

PASOS DE RAZONAMIENTO:
${d.reasoningSteps || 1}

CONCEPTOS A INTEGRAR:
${d.conceptsIntegrated || 1}

CAMBIO DE REPRESENTACIÓN:
${d.representationShift ? 'sí' : 'no'}

SIMILITUD DE DISTRACTORES:
${d.distractorSimilarity || 'medium'}
`;

  }


  // =====================================
  // VALIDAR SALIDA
  // =====================================

  function validateSingleSelect(
    raw,
    slot
  ){

    const question =
      String(
        raw.question ??
        raw.stem ??
        ''
      ).trim();


    const options =
      Array.isArray(raw.options)
        ? raw.options
            .map(x =>
              String(x).trim()
            )
        : [];


    const correct =
      clampIndex(
        raw.correct
      );


    const explanation =
      String(
        raw.explanation || ''
      ).trim();


    if(!question){

      throw new Error(
        'Reactivo sin enunciado'
      );

    }


    if(
      options.length !== 4 ||
      options.some(x => !x)
    ){

      throw new Error(
        'El reactivo no contiene exactamente 4 opciones'
      );

    }


    if(correct === null){

      throw new Error(
        'Índice de respuesta correcta inválido'
      );

    }


    if(
      new Set(options).size !== 4
    ){

      throw new Error(
        'Hay opciones repetidas'
      );

    }


    const allowedCodes =
      new Set(
        (
          slot.syllabusCodes ||
          []
        ).map(
          normalizeCode
        )
      );


    let syllabusCode =
      normalizeCode(
        raw.syllabus_code ||
        raw.syllabusCode ||
        ''
      );


    // Fuente oficial/extendida:
    // el código tiene que ser uno permitido.

    if(
      slot.sourceType !==
        'course' &&
      allowedCodes.size
    ){

      if(
        !allowedCodes.has(
          syllabusCode
        )
      ){

        syllabusCode =
          [...allowedCodes][0];

      }

    }


    // Curso sin relación oficial:
    // el código puede quedar vacío.

    if(
      slot.sourceType ===
        'course' &&
      !allowedCodes.size
    ){

      syllabusCode = '';

    }


    return {

      id:
        typeof uid === 'function'
          ? uid()
          : (
              'noa-q-' +
              Date.now()
            ),

      slotId:
        slot.slotId,

      blueprintSlot:
        slot,

      interactionType:
        'single_select',

      instruction:
        String(
          raw.instruction ||
          'Selecciona la opción correcta.'
        ).trim(),

      text:
        question,

      options,

      correct,

      explain:
        explanation,

      syllabusCode,

      sourceType:
        slot.sourceType,

      requestedSourceType:
        slot.requestedSourceType,

      difficulty:
        slot.difficulty?.level || 3,

      sourceTrace:
        slot.source,

      judge:
        null

    };

  }


  // =====================================
  // GENERAR SINGLE SELECT
  // =====================================

  async function generateSingleSelect(
    slot
  ){

    const raw =
      await callAI([

        {

          role:'system',

          content:
`Eres NOA EXCOBA Generator.

Debes crear UN solo reactivo académico.

Devuelve ÚNICAMENTE un objeto JSON válido.

No uses Markdown.
No agregues texto antes ni después.

La dificultad describe demanda cognitiva,
NO vocabulario rebuscado.

Los distractores deben representar
errores conceptuales o de razonamiento
plausibles.

Las cuatro opciones deben ser similares
en longitud, especificidad y estilo.

No uses:
- todas las anteriores
- ninguna de las anteriores
- opciones absurdas
- pistas gramaticales
- preguntas capciosas

Debe existir una única respuesta correcta.`

        },

        {

          role:'user',

          content:
`MATERIA:
${slot.subject}

SLOT:
${slot.slotId}

FORMATO:
single_select

${difficultyContext(slot)}

${sourceContext(slot)}

REGLAS DE REALISMO:

${JSON.stringify(
  slot.realismRules || {},
  null,
  2
)}

FORMATO EXACTO:

{
  "instruction":
    "Selecciona la opción correcta.",

  "question":
    "enunciado del reactivo",

  "options":[
    "opción A",
    "opción B",
    "opción C",
    "opción D"
  ],

  "correct":0,

  "explanation":
    "justificación académica breve",

  "syllabus_code":
    "código permitido o vacío si es course_only"
}

REGLAS FINALES:

- correct debe ser 0, 1, 2 o 3.
- genera exactamente cuatro opciones.
- respeta el nivel de dificultad.
- si la dificultad es 3 o superior,
  prioriza aplicación o razonamiento.
- si la dificultad es 4 o 5,
  no permitas que la respuesta aparezca
  literalmente en el enunciado.
- no inventes contenido fuera de la fuente.`
        }

      ],{

        temperature:0.28

      });


    const parsed =
      parseObject(raw);


    return validateSingleSelect(
      parsed,
      slot
    );

  }


  // =====================================
  // CONTRATO ACADÉMICO COMPARTIDO POR LOS CUATRO JUDGES
  // Las notas de calidad y el dictamen académico son controles distintos.
  // Esto valida la respuesta del modelo, no constituye revisión independiente.
  // =====================================

  const JUDGE_POLICY_VERSION = '25.1';
  const JUDGE_THRESHOLDS = {
    single_select: {
      source_fidelity:9, difficulty_match:7, distractor_quality:7,
      reasoning_quality:7, clarity:8, single_correct:8
    },
    drag_classify: {
      source_fidelity:9, difficulty_match:7, classification_quality:8,
      element_quality:7, ambiguity_control:8, reasoning_quality:7, clarity:8
    },
    inline_select: {
      source_fidelity:9, difficulty_match:7, blank_quality:8, option_quality:7,
      ambiguity_control:8, context_quality:7, reasoning_quality:7, clarity:8
    },
    drag_order: {
      source_fidelity:9, difficulty_match:7, sequence_validity:8,
      order_uniqueness:8, semantic_distinctness:8, item_quality:7,
      reasoning_quality:7, ambiguity_control:8, clarity:8
    }
  };
  const JUDGE_METRIC_DESCRIPTIONS = {
    source_fidelity:'fidelidad al alcance de la fuente asignada; no acredita por sí sola exactitud científica',
    difficulty_match:'coincidencia con la demanda cognitiva solicitada',
    distractor_quality:'distractores plausibles pero incorrectos en este contexto',
    reasoning_quality:'demanda cognitiva y razonamiento auténticos',
    clarity:'precisión de instrucciones y redacción',
    single_correct:'una única opción correcta y académicamente defendible',
    classification_quality:'categorías claras y mutuamente discriminables',
    element_quality:'elementos útiles que permiten aplicar el criterio de clasificación',
    ambiguity_control:'ausencia de respuestas o interpretaciones alternativas igualmente defendibles',
    blank_quality:'cada espacio evalúa un concepto definido y tiene una única respuesta defendible',
    option_quality:'opciones pertinentes y plausibles para cada espacio',
    context_quality:'texto integrado, coherente y suficiente para resolver los espacios',
    sequence_validity:'secuencia correcta y científicamente defendible',
    order_uniqueness:'ningún intercambio mantiene otra secuencia igualmente válida',
    semantic_distinctness:'etapas conceptualmente distintas, sin duplicados ni solapamientos',
    item_quality:'etapas claras, útiles y adecuadas al proceso'
  };
  const ACADEMIC_CHECKS = [
    'scientific_accuracy', 'internal_consistency', 'answer_validity',
    'conceptual_unambiguity', 'non_overlap'
  ];
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const nonempty = value => typeof value === 'string' && value.trim().length > 0;
  const permitsNoOverlapNA = format => ['single_select','inline_select'].includes(format);

  function judgeThresholds(format){
    if(!own(JUDGE_THRESHOLDS, format)) throw new Error('Formato Judge no soportado: ' + format);
    return JUDGE_THRESHOLDS[format];
  }

  function academicInstructions(format){
    const metrics = Object.keys(judgeThresholds(format)).map(key =>
      `${key} = ${JUDGE_METRIC_DESCRIPTIONS[key]}.`
    ).join('\n');
    return `Eres NOA Judge, evaluador interno de reactivos académicos ${format}.
Evalúa UN reactivo y devuelve únicamente un objeto JSON que cumpla el contrato.
No lo reescribas. Resuélvelo internamente y coteja la clave y la explicación;
no presentes una solución dirigida al estudiante.

Califica cada métrica de calidad con un número real de 0 a 10:
${metrics}
No copies notas de una plantilla ni asignes máximos por defecto. Todas las
métricas son obligatorias; no sustituyas números por texto, null o booleanos.

Además realiza una revisión académica explícita, separada de esas notas:
scientific_accuracy: exactitud científica o académica acorde con la disciplina.
internal_consistency: coherencia del contexto, premisas, unidades y explicación.
answer_validity: verifica por tu cuenta que la clave sea correcta, completa y
única cuando corresponda, sin limitarte a repetir la respuesta suministrada.
conceptual_unambiguity: terminología precisa, supuestos suficientes y ausencia
de ambigüedades conceptuales o convenciones no declaradas.
non_overlap: en clasificación comprueba que categorías y asignaciones no se
solapen; en ordenamiento comprueba que los pasos sean distintos y que no se
presente un proceso y una parte de él como etapas independientes consecutivas.
${permitsNoOverlapNA(format)
  ? 'En este formato non_overlap puede ser not_applicable si justificas por qué no corresponde.'
  : 'En este formato non_overlap debe evaluarse; not_applicable no está permitido.'}
Cada criterio exige status pass, fail o uncertain y una reason concreta no vacía.
No uses pass cuando no puedas resolver una duda académica relevante.

Precauciones científicas y sus matices:
- En el sentido biológico habitual los organismos unicelulares no forman tejidos
  propios. Distingue ese error de una muestra de tejido de un huésped que contiene
  microorganismos o de un contexto diferente explícitamente justificado.
- La traducción incluye la formación de la cadena polipeptídica: no las trates
  como etapas totalmente independientes. Iniciación, elongación y terminación sí
  pueden ser fases distintas si el contexto y el orden están bien definidos.
- Aa × Aa produce proporción fenotípica 3:1 bajo dominancia completa; la
  proporción genotípica es 1:2:1. La numeración de las leyes de Mendel varía entre
  fuentes: pide el nombre ley de segregación o una convención explícita, sin
  rechazar una denominación inequívocamente definida por el contexto.
- Exotérmico describe ΔH < 0 y exergónico describe ΔG < 0 en las condiciones
  pertinentes. No son sinónimos; un proceso puede cumplir ambas condiciones.
  La mera aparición de ambos términos no implica error.
- La presencia de núcleo delimitado por membrana distingue la organización
  eucariota de la procariota y es un criterio estructural válido.
Estas precauciones no sustituyen la evaluación del resto del contenido.

source_fidelity evalúa alcance y respaldo de la fuente; que un tema figure en
el temario oficial no demuestra la verdad de cada afirmación del reactivo.
No supongas que buena redacción o un promedio alto subsanan un error científico.
Informa los fallos críticos en critical_issues como textos concretos; usa [] solo
si no los identificas. Cualquier issue, fail o uncertain bloquea la aceptación
independientemente del promedio. Justifica las dudas para revisión humana.
Esta es una evaluación interna de IA, no una validación científica independiente
ni una certificación oficial de la UAQ. No inventes contrastes o fuentes externas.`;
  }

  function academicResponseContract(format){
    const metricProperties = Object.fromEntries(Object.keys(judgeThresholds(format)).map(key => [
      key, {type:'number', minimum:0, maximum:10}
    ]));
    const reviewProperties = Object.fromEntries(ACADEMIC_CHECKS.map(key => [key, {
      type:'object',
      properties:{
        status:{type:'string', enum:key === 'non_overlap' && permitsNoOverlapNA(format)
          ? ['pass','fail','uncertain','not_applicable'] : ['pass','fail','uncertain']},
        reason:{type:'string', minLength:1, pattern:'\\S'}
      },
      required:['status','reason']
    }]));
    return JSON.stringify({
      $schema:'https://json-schema.org/draft/2020-12/schema',
      type:'object',
      properties:{
        ...metricProperties,
        academic_review:{type:'object', properties:reviewProperties, required:ACADEMIC_CHECKS},
        critical_issues:{type:'array', items:{type:'string', minLength:1, pattern:'\\S'}},
        comments:{type:'string'}
      },
      required:[...Object.keys(metricProperties),'academic_review','critical_issues']
    }, null, 2);
  }

  function evaluateAcademicJudge(raw, format){
    const thresholds = judgeThresholds(format);
    const input = record(raw) ? raw : {};
    const validationErrors = [];
    if(!record(raw)) validationErrors.push('La evaluación debe ser un objeto JSON.');
    const metrics = {};
    for(const key of Object.keys(thresholds)){
      const value = input[key];
      const valid = own(input,key) && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10;
      metrics[key] = valid ? value : null;
      if(!valid) validationErrors.push(`Métrica inválida o faltante: ${key}; se requiere un número finito entre 0 y 10.`);
    }
    const metricsValid = Object.values(metrics).every(value => value !== null);
    const qualityScore = metricsValid
      ? Math.round(Object.values(metrics).reduce((sum, value) => sum + value, 0) / Object.keys(metrics).length * 10) / 10
      : null;

    const review = record(input.academic_review) && own(input,'academic_review') ? input.academic_review : {};
    const academic_review = {};
    for(const key of ACADEMIC_CHECKS){
      const check = own(review,key) && record(review[key]) ? review[key] : {};
      const statuses = key === 'non_overlap' && permitsNoOverlapNA(format)
        ? ['pass','fail','uncertain','not_applicable'] : ['pass','fail','uncertain'];
      const validStatus = own(check,'status') && statuses.includes(check.status);
      const validReason = own(check,'reason') && nonempty(check.reason);
      if(!validStatus || !validReason) validationErrors.push(`Revisión académica inválida o faltante: ${key}; requiere status permitido y reason no vacía.`);
      academic_review[key] = {
        status:validStatus ? check.status : 'uncertain',
        reason:validReason ? check.reason.trim() : 'No se recibió una justificación académica válida.'
      };
    }
    const issuesValid = own(input,'critical_issues') && Array.isArray(input.critical_issues) &&
      Array.from(input.critical_issues).every(nonempty);
    if(!issuesValid) validationErrors.push('critical_issues debe ser un arreglo de textos no vacíos, o [] si no hay fallos críticos.');
    const critical_issues = Array.isArray(input.critical_issues)
      ? Array.from(input.critical_issues).filter(nonempty).map(value => value.trim()) : [];
    if(own(input,'comments') && typeof input.comments !== 'string'){
      validationErrors.push('comments debe ser texto cuando se incluye.');
    }
    const contractValid = validationErrors.length === 0;
    const academicPass = Object.values(academic_review).every(check =>
      check.status === 'pass' || check.status === 'not_applicable'
    ) && critical_issues.length === 0;
    const judge = {
      ...metrics,
      comments:typeof input.comments === 'string' ? input.comments.trim() : '',
      qualityScore, academic_review, critical_issues, contractValid, validationErrors,
      requiresHumanReview:!contractValid || !academicPass,
      policyVersion:JUDGE_POLICY_VERSION,
      evaluationScope:'internal_ai'
    };
    const accepted = contractValid && academicPass && qualityScore >= 8.2 &&
      Object.entries(thresholds).every(([key, minimum]) => metrics[key] >= minimum);
    return {judge, accepted};
  }

  window.NOA_JUDGE_ACADEMIC = {
    version:JUDGE_POLICY_VERSION,
    instructions:academicInstructions,
    responseContract:academicResponseContract,
    evaluate:evaluateAcademicJudge
  };

  // =====================================
  // JUDGE V9
  // =====================================

  async function judgeItem(question, slot){
    const raw = await callAI([
      {role:'system', content:window.NOA_JUDGE_ACADEMIC.instructions('single_select')},
      {role:'user', content:`BLUEPRINT:
${JSON.stringify({
  subject:slot.subject, slotId:slot.slotId, sourceType:slot.sourceType,
  syllabusCodes:slot.syllabusCodes, difficulty:slot.difficulty,
  interactionType:slot.interactionType, realismRules:slot.realismRules
}, null, 2)}

FUENTE:
${sourceContext(slot)}

REACTIVO:
${JSON.stringify({
  question:question.text, options:question.options, correct:question.correct,
  explanation:question.explain, syllabusCode:question.syllabusCode
}, null, 2)}

CONTRATO JSON DE RESPUESTA (esquema, no ejemplo de calificación):
${window.NOA_JUDGE_ACADEMIC.responseContract('single_select')}`}
    ], {temperature:0});
    const {judge, accepted} = window.NOA_JUDGE_ACADEMIC.evaluate(parseObject(raw), 'single_select');
    return {...question, judge, accepted};
  }


  // =====================================
  // GENERAR SLOT CON REPOSICIÓN
  // =====================================

  async function generateSlot(
    slot,
    options = {}
  ){

    if(!slot){

      throw new Error(
        'Falta el slot'
      );

    }


    if(
      slot.interactionType !==
      'single_select'
    ){

      throw new Error(
        'v9 checkpoint todavía trabaja ' +
        'solo con single_select. ' +
        'Este slot es ' +
        slot.interactionType
      );

    }


    const maxAttempts =
      Math.max(
        1,
        Math.min(
          3,
          Number(
            options.maxAttempts
          ) || 2
        )
      );


    let currentSlot =
      slot;


    let last = null;


    for(
      let attempt=0;
      attempt<maxAttempts;
      attempt++
    ){

      const generated =
        await generateSingleSelect(
          currentSlot
        );


      const judged =
        await judgeItem(
          generated,
          currentSlot
        );


      last = judged;


      if(
        judged.accepted
      ){

        return {

          question:
            judged,

          slot:
            currentSlot,

          attempts:
            attempt + 1

        };

      }


      console.warn(
        'NOA v9 Judge rechazó el slot',
        {
          slot:
            currentSlot.slotId,

          attempt:
            attempt + 1,

          score:
            judged
              .judge
              ?.qualityScore,

          judge:
            judged.judge
        }
      );


      if(
        attempt <
        maxAttempts - 1
      ){

        currentSlot =
          window
            .NOA_SOURCE_BLUEPRINT
            .replaceSlot(
              slot,
              attempt + 1
            );

      }

    }


    throw new Error(
      'NOA Judge no aprobó el reactivo ' +
      `después de ${maxAttempts} intentos. ` +
      (
        last?.judge?.qualityScore
          ? `Último score: ${
              last.judge.qualityScore
            }/10`
          : ''
      )
    );

  }


  // =====================================
  // CHECKPOINT AUTOMÁTICO
  // =====================================

  function findTestSlot(
    subject =
      'EXCOBA Medicina · Biología'
  ){

    const blueprint =
      window
        .NOA_SOURCE_BLUEPRINT
        .build({

          subject,

          count:10

        });


    const slot =
      blueprint
        .slots
        .find(
          s =>
            s.interactionType ===
            'single_select'
        );


    if(!slot){

      throw new Error(
        'No encontré un slot single_select'
      );

    }


    return {

      blueprint,

      slot

    };

  }


  // =====================================
  // API GLOBAL
  // =====================================

  window.NOA_BLUEPRINT_GENERATOR = {

    version:
      VERSION,

    findTestSlot,

    generateSlot,

    generateSingleSelect,

    judgeItem

  };


  console.log(
    'NOA EXCOBA Generator Bridge v9 ✓'
  );

})();
