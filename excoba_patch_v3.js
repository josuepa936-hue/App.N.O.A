/* =========================================================
   NOA EXCOBA PATCH v3
   - Habilita las 9 materias oficiales del EXCOBA para Medicina
   - Corrige la generación de cuestionarios con Workers AI
   - Evita bucles infinitos por preguntas duplicadas
   - Hace más tolerante la validación de syllabus_code
   - Mantiene el Temario Maestro como límite de alcance
   ========================================================= */

(() => {
  const SUBJECTS_V3 = [
    {label:'Primaria · Español', value:'EXCOBA Primaria · Español'},
    {label:'Primaria · Matemáticas', value:'EXCOBA Primaria · Matemáticas'},
    {label:'Secundaria · Español', value:'EXCOBA Secundaria · Español'},
    {label:'Secundaria · Matemáticas', value:'EXCOBA Secundaria · Matemáticas'},
    {label:'Secundaria · Ciencias naturales', value:'EXCOBA Secundaria · Ciencias naturales'},
    {label:'Secundaria · Ciencias sociales', value:'EXCOBA Secundaria · Ciencias sociales'},
    {label:'Medicina · Matemáticas para estadística', value:'EXCOBA Medicina · Matemáticas para estadística'},
    {label:'Medicina · Biología', value:'EXCOBA Medicina · Biología'},
    {label:'Medicina · Química', value:'EXCOBA Medicina · Química'}
  ];

  function n(v){
    return String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,' ')
      .trim();
  }

  function safeToast(msg){
    try{ toast(msg); }catch{ console.log(msg); }
  }

  function setStatus(msg){
    const e=document.getElementById('excobaMaterialStatus');
    if(e)e.textContent=msg || '';
  }

  function api(){
    return window.NOA_EXCOBA_MASTER || null;
  }

  function master(){
    return api()?.get?.() || null;
  }

  function canonicalSubject(target){
    const x=n(target);

    const exact=SUBJECTS_V3.find(s=>n(s.value)===x || n(s.label)===x);
    if(exact)return exact.value;

    if(x.includes('primaria') && x.includes('espanol')) return 'EXCOBA Primaria · Español';
    if(x.includes('primaria') && (x.includes('matematica') || x.includes('matematicas'))) return 'EXCOBA Primaria · Matemáticas';

    if(x.includes('secundaria') && x.includes('espanol')) return 'EXCOBA Secundaria · Español';
    if(x.includes('secundaria') && (x.includes('matematica') || x.includes('matematicas'))) return 'EXCOBA Secundaria · Matemáticas';
    if(x.includes('ciencias naturales') || x.includes('naturales')) return 'EXCOBA Secundaria · Ciencias naturales';
    if(x.includes('ciencias sociales') || x.includes('sociales')) return 'EXCOBA Secundaria · Ciencias sociales';

    if(x.includes('estadistica')) return 'EXCOBA Medicina · Matemáticas para estadística';
    if(x.includes('biologia')) return 'EXCOBA Medicina · Biología';
    if(x.includes('quimica')) return 'EXCOBA Medicina · Química';

    return null;
  }

  function itemsForSubject(target){
    const m=master();
    if(!m?.items?.length)return [];

    const subject=canonicalSubject(target);
    if(!subject)return [];

    return m.items.filter(item=>item.subject===subject);
  }

  function parseJSONLoose(raw){
    const cleaned=String(raw ?? '')
      .replace(/```json/gi,'')
      .replace(/```/g,'')
      .trim();

    try{
      const j=JSON.parse(cleaned);
      if(Array.isArray(j))return j;
      if(Array.isArray(j?.questions))return j.questions;
      if(Array.isArray(j?.items))return j.items;
    }catch{}

    const a=cleaned.indexOf('[');
    const b=cleaned.lastIndexOf(']');
    if(a>=0 && b>a){
      try{
        const j=JSON.parse(cleaned.slice(a,b+1));
        if(Array.isArray(j))return j;
      }catch{}
    }

    const o=cleaned.indexOf('{');
    const z=cleaned.lastIndexOf('}');
    if(o>=0 && z>o){
      try{
        const j=JSON.parse(cleaned.slice(o,z+1));
        if(Array.isArray(j?.questions))return j.questions;
        if(Array.isArray(j?.items))return j.items;
      }catch{}
    }

    throw new Error('La IA no devolvió JSON utilizable');
  }

  function tokenScore(a,b){
    const A=new Set(n(a).split(' ').filter(w=>w.length>3));
    const B=new Set(n(b).split(' ').filter(w=>w.length>3));
    let score=0;
    for(const w of A)if(B.has(w))score++;
    return score;
  }

  function resolveItem(q,allowedItems){
    if(!allowedItems.length)return null;

    const byCode=new Map(
      allowedItems.map(i=>[
        String(i.code).trim().replace(/\.$/,''),
        i
      ])
    );

    const rawCode=String(
      q.syllabus_code ??
      q.syllabusCode ??
      q.code ??
      ''
    ).trim().replace(/\.$/,'');

    if(rawCode && byCode.has(rawCode)){
      return byCode.get(rawCode);
    }

    // Algunos modelos devuelven un padre o agregan espacios al código.
    const compact=rawCode.replace(/\s+/g,'');
    if(compact){
      const exact=allowedItems.find(i=>
        String(i.code).replace(/\s+/g,'').replace(/\.$/,'')===compact
      );
      if(exact)return exact;
    }

    // Si el modelo devolvió nombre de tema en vez de un código exacto,
    // se relaciona con el punto oficial más parecido.
    const hint=[
      q.topic,
      q.tema,
      q.subtopic,
      q.subtema,
      q.question,
      q.pregunta
    ].filter(Boolean).join(' ');

    if(hint){
      const ranked=allowedItems
        .map(item=>({
          item,
          score:
            tokenScore(hint,item.title)*3 +
            tokenScore(hint,item.focus)
        }))
        .sort((a,b)=>b.score-a.score);

      if(ranked[0]?.score>0)return ranked[0].item;
    }

    return null;
  }

  function pickBlueprint(items,batchIndex,size=8){
    if(items.length<=size)return [...items];

    const start=(batchIndex*size)%items.length;
    const out=[];
    for(let i=0;i<size;i++){
      out.push(items[(start+i)%items.length]);
    }
    return out;
  }
   function makeBlueprint(index){

  // =====================================
  // CICLO BASE
  // =====================================

  const baseCycle = [
    1,
    2,2,
    3,3,3,
    4,4,4,
    5
  ];


  let cycle = baseCycle;

  let calibration = null;


  // =====================================
  // CONSULTAR NOA CALIBRATOR
  // =====================================

  try{

    calibration =
      window.NOA_CALIBRATOR?.get?.() || null;


    if(
      calibration &&
      calibration.sample >= 5 &&
      Array.isArray(calibration.cycle) &&
      calibration.cycle.length
    ){

      cycle = calibration.cycle;

    }

  }catch(err){

    console.warn(
      'NOA Calibrator no disponible:',
      err
    );

  }


  // =====================================
  // DIFICULTAD ADAPTATIVA
  // =====================================

  const difficulty =
    Number(
      cycle[index % cycle.length]
    ) || 3;


  const cognitive = {

    1:'recall',

    2:'comprehension',

    3:'application',

    4:'integration',

    5:'multi_step'

  }[difficulty];


  const reasoningSteps = {

    1:1,

    2:1,

    3:2,

    4:2,

    5:3

  }[difficulty];


  const targetTime = {

    1:35,

    2:45,

    3:60,

    4:75,

    5:95

  }[difficulty];


  return {

    difficulty,

    cognitive_level:
      cognitive,

    reasoning_steps:
      reasoningSteps,

    target_time_seconds:
      targetTime,

    distractor_style:
      difficulty >= 3
        ? 'common_misconception'
        : 'conceptual_confusion',


    // =====================================
    // METADATOS DEL CALIBRATOR
    // =====================================

    adaptive:
      Boolean(
        calibration &&
        calibration.sample >= 5
      ),

    calibrator_focus:
      calibration?.focus ?? null,

    calibration_sample:
      calibration?.sample ?? 0

  };

}
   async function judgeQuestionBatch(questions, blueprints, subject){

  if(!questions.length) return [];

  try{

    const material = questions.map((q,i)=>({
      index:i,
      question:q.text,
      options:q.options,
      correct:q.correct,
      explanation:q.explain,
      syllabus_code:q.syllabusCode,

      expected_difficulty:
        blueprints[i]?.difficulty ?? 3,

      expected_cognitive_level:
        blueprints[i]?.cognitive_level ?? "application",

      expected_reasoning_steps:
        blueprints[i]?.reasoning_steps ?? 2
    }));


    const raw = await callAI([
      {
        role:"system",
        content:
`Eres NOA Judge, revisor profesional de reactivos para EXCOBA UAQ.

NO debes resolver ni reescribir los reactivos.

Tu función es evaluar su calidad.

Evalúa cada reactivo de manera estricta.

ESCALAS 0 A 10:

syllabus_fidelity:
10 = completamente dentro del tema indicado.
0 = fuera del alcance.

difficulty_match:
10 = coincide con la dificultad solicitada.
0 = muy por debajo o por encima.

distractor_quality:
10 = todos los distractores son plausibles y representan errores reales.
0 = distractores absurdos o evidentes.

reasoning_quality:
10 = exige el razonamiento esperado.
0 = se responde sin procesar realmente el problema.

clarity:
10 = redacción inequívoca y precisa.
0 = ambigua o confusa.

IMPORTANTE:
Una pregunta no es difícil simplemente porque use vocabulario complicado.

Sé crítico.

Devuelve SOLO JSON válido.`
      },

      {
        role:"user",
        content:
`MATERIA:
${subject}

EVALÚA:

${JSON.stringify(material)}

FORMATO EXACTO:

[
  {
    "index":0,
    "syllabus_fidelity":10,
    "difficulty_match":8,
    "distractor_quality":9,
    "reasoning_quality":8,
    "clarity":10,
    "comments":"comentario breve"
  }
]`
      }

    ],{
      temperature:0
    });


    const judgments=parseJSONLoose(raw);

    if(!Array.isArray(judgments)){
      return questions;
    }


    return questions.map((q,i)=>{

      const j=judgments.find(x=>
        Number(x.index)===i
      );

      if(!j) return q;


      const scores=[
        Number(j.syllabus_fidelity),
        Number(j.difficulty_match),
        Number(j.distractor_quality),
        Number(j.reasoning_quality),
        Number(j.clarity)
      ].filter(Number.isFinite);


      const qualityScore=scores.length
        ? scores.reduce((a,b)=>a+b,0)/scores.length
        : null;


      return {
        ...q,

        judge:{
          syllabus_fidelity:
            Number(j.syllabus_fidelity),

          difficulty_match:
            Number(j.difficulty_match),

          distractor_quality:
            Number(j.distractor_quality),

          reasoning_quality:
            Number(j.reasoning_quality),

          clarity:
            Number(j.clarity),

          comments:
            String(j.comments || ""),

          qualityScore:
            qualityScore===null
              ? null
              : Math.round(qualityScore*10)/10
        }
      };

    });


  }catch(err){

    console.warn(
      "NOA Judge no pudo evaluar el bloque:",
      err
    );

    // El examen sigue funcionando aunque el Judge falle.
    return questions;
  }
}

  async function generateQuestionBatchV3(target,count,batchIndex=0){
    const subject=canonicalSubject(target);
    if(!subject)throw new Error('Materia no reconocida');

    const items=itemsForSubject(subject);
    if(!items.length)throw new Error('La materia no tiene puntos detectados en el Temario Maestro');

    const blueprint=pickBlueprint(items,batchIndex,Math.min(10,Math.max(6,count*2)));

     const allowedText=blueprint
  .map(x=>`- ${x.code} | ${x.title}: ${x.focus}`)
  .join('\n');


// ===============================
// BLUEPRINT DE DIFICULTAD
// ===============================

const questionBlueprints = Array.from(
  {length: count},
  (_,i)=>makeBlueprint(batchIndex * 3 + i)
);

const blueprintText = questionBlueprints
  .map((b,i)=>`
REACTIVO ${i+1}
- dificultad: ${b.difficulty}/5
- nivel cognitivo: ${b.cognitive_level}
- pasos mínimos de razonamiento: ${b.reasoning_steps}
- distractores: ${b.distractor_style}
- tiempo objetivo: ${b.target_time_seconds} segundos
`)
  .join('\n');


const raw=await callAI([
  {
    role:'system',
    content:
`Eres el motor de evaluación de NOA para EXCOBA UAQ.

Devuelve ÚNICAMENTE un arreglo JSON válido.

El primer carácter de tu respuesta debe ser [
y el último carácter debe ser ].

No uses bloques de código Markdown.
No escribas comentarios antes o después del arreglo.

El listado proporcionado delimita el alcance oficial.

Genera reactivos claros con una sola respuesta correcta.

Los distractores deben ser plausibles y representar
errores conceptuales o de razonamiento realistas.

Respeta estrictamente el blueprint de dificultad.

No introduzcas temas fuera del listado.`
  },
  {
    role:'user',
    content:
       
`MATERIA:
${subject}

GENERA:
${count} reactivos.

BLUEPRINT OBLIGATORIO DE LOS REACTIVOS:

${blueprintText}


INTERPRETACIÓN DE DIFICULTAD:

NIVEL 1:
Recuerdo directo de un concepto, dato o definición.

NIVEL 2:
Comprensión, interpretación o comparación.

NIVEL 3:
Aplicación del conocimiento a una situación nueva.
No debe resolverse solamente recordando una definición.

NIVEL 4:
Integración de al menos dos conceptos.
Debe requerir razonamiento y discriminación entre
distractores plausibles.

NIVEL 5:
Problema multietapa.
Debe requerir inferencia, integración, cálculo o
varios pasos antes de obtener la respuesta.


REGLAS DE DIFICULTAD:

- Respeta el nivel asignado a CADA reactivo.
- No conviertas una pregunta sencilla en difícil usando vocabulario complicado.
- En niveles 3 a 5 utiliza situaciones, datos, casos o problemas cuando el tema lo permita.
- En niveles 4 y 5 la respuesta no debe aparecer literalmente en el enunciado.
- Los distractores deben representar errores de razonamiento plausibles.
- Las cuatro opciones deben tener longitud y nivel de detalle semejantes.
- Evita distractores absurdos.
- Evita pistas gramaticales.
- Evita que la opción correcta sea evidentemente más específica.
- No uses "todas las anteriores".
- No uses "ninguna de las anteriores".


FORMATO EXACTO:
[
{
  "question":"...",
  "options":["...","...","...","..."],
  "correct":0,
  "explanation":"...",
  "topic":"...",
  "syllabus_code":"código exacto",
  "difficulty":4,
  "cognitive_level":"integration",
  "reasoning_steps":2
}
]

REGLAS:
- "correct" debe ser 0, 1, 2 o 3.
- Usa exactamente uno de los syllabus_code listados.
- Cada reactivo debe evaluar comprensión, aplicación o razonamiento cuando sea posible.
- La explicación debe justificar la respuesta correcta.
- No uses "todas las anteriores" ni "ninguna de las anteriores".
- No escribas texto fuera del JSON.

PUNTOS OFICIALES PERMITIDOS:
${allowedText}`
      }
    ],{
      temperature:0.28
    });

    let data;

try {
  data = parseJSONLoose(raw);

} catch (firstError) {

  console.warn(
    "NOA recibió JSON imperfecto. Intentando repararlo:",
    raw
  );

  const repaired = await callAI([
    {
      role: "system",
      content: `
Eres un reparador estricto de JSON.

Tu única tarea es convertir el contenido recibido
en JSON válido.

NO respondas preguntas.
NO cambies el contenido académico.
NO agregues explicaciones.
NO uses Markdown.

Devuelve exclusivamente un arreglo JSON válido.
`
    },
    {
      role: "user",
      content: `
REPARA ESTE CONTENIDO:

${raw}

FORMATO OBLIGATORIO:

[
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correct": 0,
    "explanation": "...",
    "topic": "...",
    "syllabus_code": "..."
  }
]
`
    }
  ], {
    temperature: 0
  });

  data = parseJSONLoose(repaired);
}

const out=[];

    for(const q of data){
      const question=String(q.question ?? q.pregunta ?? '').trim();
      const options=Array.isArray(q.options)
        ? q.options.map(x=>String(x).trim())
        : Array.isArray(q.opciones)
          ? q.opciones.map(x=>String(x).trim())
          : [];

      let correct=Number(
        q.correct ??
        q.correct_index ??
        q.respuesta_correcta
      );

      if(!Number.isInteger(correct) && typeof q.correct==='string'){
        const letter=String(q.correct).trim().toUpperCase();
        correct='ABCD'.indexOf(letter);
      }

      const item=resolveItem(q,blueprint);

      if(!question)continue;
      if(options.length!==4 || options.some(x=>!x))continue;
      if(!Number.isInteger(correct) || correct<0 || correct>3)continue;
      if(!item)continue;

      const topic=db.topics.find(t=>t.syllabusCode===item.code);

      out.push({
        id:uid(),
        topicId:topic?.id || '',
        text:question,
        options,
        correct,
         blueprint:
  questionBlueprints[
    Math.min(out.length, questionBlueprints.length - 1)
  ],
        explain:String(q.explanation ?? q.explicacion ?? '').trim(),
        source:`Guía temática EXCOBA UAQ 2026-2 - PDF oficial · ${item.code} · PDF pág. ${item.page}`,
        syllabusCode:item.code,
        sourcePage:item.page,
        masterSyllabus:'uaq-excoba-2026-2-medicina'
      });

      if(out.length>=count)break;
    }

    // ==================================
// NOA JUDGE — MODO SOMBRA
// ==================================

const judged = await judgeQuestionBatch(
  out,
  out.map(q => q.blueprint),
  subject
);


// ==================================
// NOA JUDGE — FILTRO DE CALIDAD
// ==================================

const accepted = judged.filter(q => {

  const j = q.judge;

  // Si el Judge falla técnicamente,
  // dejamos pasar la pregunta para no romper el examen.
  if(!j || !Number.isFinite(j.qualityScore)){
    return true;
  }

  const passes =
  j.qualityScore >= 8.2 &&
  j.syllabus_fidelity >= 9 &&
  j.difficulty_match >= 7 &&
  j.distractor_quality >= 7 &&
  j.reasoning_quality >= 7 &&
  j.clarity >= 8;

  if(!passes){
    console.log(
      "NOA Judge rechazó reactivo:",
      {
        question:q.text,
        score:j.qualityScore,
        judge:j
      }
    );
  }

  return passes;
});

     // ==================================
// DIAGNÓSTICO TEMPORAL NOA
// ==================================



return accepted;
  }

async function generateQuestionsV3(target,count=5){

  const subject=canonicalSubject(target);

  if(!subject){
    throw new Error('Materia no reconocida');
  }


  const wanted=
    Math.max(
      1,
      Math.min(30,Number(count)||5)
    );


  // =====================================
  // DIVIDIR EN BLOQUES PEQUEÑOS
  // =====================================

  const sizes=[];

  let remaining=wanted;

  while(remaining>0){

    const size=Math.min(3,remaining);

    sizes.push(size);

    remaining-=size;

  }


  setStatus(
    `Generando ${wanted} reactivos en ${sizes.length} bloques…`
  );


  // =====================================
  // GENERAR BLOQUES EN PARALELO
  // =====================================

  const batches=
    await Promise.all(

      sizes.map((size,index)=>

        generateQuestionBatchV3(
          subject,
          size,
          index
        )

      )

    );


  const all=[];
  const seen=new Set();


  function addQuestions(list){

    for(const q of list){

      const key=n(q.text);

      if(!key || seen.has(key)){
        continue;
      }

      seen.add(key);

      all.push(q);

    }

  }


  for(const batch of batches){

    addQuestions(batch);

  }


  // =====================================
  // UNA SOLA RONDA DE REPOSICIÓN
  // =====================================

  if(all.length<wanted){

    const missing=
      wanted-all.length;


    setStatus(
      `Reponiendo ${missing} reactivo${missing===1?'':'s'}…`
    );


    const retrySizes=[];

    let retryRemaining=missing;


    while(retryRemaining>0){

      const size=
        Math.min(3,retryRemaining);

      retrySizes.push(size);

      retryRemaining-=size;

    }


    const retries=
      await Promise.all(

        retrySizes.map((size,index)=>

          generateQuestionBatchV3(

            subject,

            size,

            sizes.length + index

          )

        )

      );


    for(const batch of retries){

      addQuestions(batch);

    }

  }


  // =====================================
  // EXIGIR CANTIDAD COMPLETA
  // =====================================

  if(all.length<wanted){

    throw new Error(

      `NOA aprobó ${all.length} de ${wanted} reactivos. ` +
      `Faltaron ${wanted-all.length}.`

    );

  }


  return all.slice(0,wanted);

}

  async function createQuizV3(target,count=10){
    const m=master();
    if(!m)return safeToast('Primero importa el PDF oficial');

    if(db.settings?.aiProvider==='offline'){
      return safeToast('Activa tu conexión de IA para crear cuestionarios');
    }

    const subject=canonicalSubject(target);
    if(!subject)return safeToast('Selecciona una materia válida');

    const btn=document.getElementById('excobaMakeQuizBtn');

    try{
      if(btn)btn.disabled=true;
      setStatus(`NOA está construyendo ${count} reactivos de ${subject.replace(/^EXCOBA (Primaria|Secundaria|Medicina) · /,'')}…`);

      const qs=await generateQuestionsV3(subject,count);

      const existing=new Set(db.questions.map(q=>n(q.text)));
      const fresh=qs.filter(q=>!existing.has(n(q.text)));

      if(!fresh.length){
        throw new Error('Los reactivos generados ya estaban en el banco. Vuelve a intentarlo para obtener variantes.');
      }

      db.questions.push(...fresh);
      act(`${fresh.length} reactivos EXCOBA creados de ${subject}`);
      save();

      const judgeScores = fresh
  .map(q => q.judge?.qualityScore)
  .filter(Number.isFinite);

const judgeAverage = judgeScores.length
  ? Math.round(
      (
        judgeScores.reduce((a,b)=>a+b,0) /
        judgeScores.length
      ) * 10
    ) / 10
  : null;

setStatus(
  judgeAverage !== null
    ? `✓ ${fresh.length} reactivos aprobados · calidad Judge: ${judgeAverage}/10`
    : `✓ ${fresh.length} reactivos aprobados`
);
      safeToast(`${fresh.length} preguntas creadas`);

      beginExamQueue(
        fresh,
        `Cuestionario EXCOBA · ${subject.replace(/^EXCOBA (Primaria|Secundaria|Medicina) · /,'')}`
      );

    }catch(err){
      console.error('Cuestionario EXCOBA v3:',err);
      setStatus('Error: '+(err?.message || err));
      safeToast('No pude crear el cuestionario: '+(err?.message || err));
    }finally{
      if(btn)btn.disabled=false;
    }
  }

  function upgradeSubjectSelect(){
    const select=document.getElementById('excobaStudySubject');
    if(!select)return;

    const current=canonicalSubject(select.value);

    select.innerHTML=`
      <optgroup label="Competencias básicas · Primaria">
        ${SUBJECTS_V3.slice(0,2).map(s=>`<option value="${s.value}">${s.label}</option>`).join('')}
      </optgroup>
      <optgroup label="Competencias básicas · Secundaria">
        ${SUBJECTS_V3.slice(2,6).map(s=>`<option value="${s.value}">${s.label}</option>`).join('')}
      </optgroup>
      <optgroup label="Especialidad · Medicina">
        ${SUBJECTS_V3.slice(6).map(s=>`<option value="${s.value}">${s.label}</option>`).join('')}
      </optgroup>
    `;

    select.value=current || 'EXCOBA Medicina · Biología';
  }

  function replaceQuizButton(){
    const old=document.getElementById('excobaMakeQuizBtn');
    if(!old || old.dataset.v3==='1')return;

    const fresh=old.cloneNode(true);
    fresh.dataset.v3='1';
    old.replaceWith(fresh);

    fresh.addEventListener('click',()=>{
      const target=document.getElementById('excobaStudySubject')?.value;
      const count=parseInt(document.getElementById('excobaQuizCount')?.value)||10;
      createQuizV3(target,count);
    });
  }

  function subjectFromCommand(text){
    const x=n(text);

    if(x.includes('primaria') && x.includes('espanol')) return 'EXCOBA Primaria · Español';
    if(x.includes('primaria') && x.includes('matemat')) return 'EXCOBA Primaria · Matemáticas';

    if(x.includes('secundaria') && x.includes('espanol')) return 'EXCOBA Secundaria · Español';
    if(x.includes('secundaria') && x.includes('matemat')) return 'EXCOBA Secundaria · Matemáticas';

    if(x.includes('ciencias naturales') || x.includes('naturales')) return 'EXCOBA Secundaria · Ciencias naturales';
    if(x.includes('ciencias sociales') || x.includes('sociales')) return 'EXCOBA Secundaria · Ciencias sociales';

    if(x.includes('estadistica')) return 'EXCOBA Medicina · Matemáticas para estadística';
    if(x.includes('biologia')) return 'EXCOBA Medicina · Biología';
    if(x.includes('quimica')) return 'EXCOBA Medicina · Química';

    return null;
  }

  function patchVoiceCommands(){
    if(typeof window.executeCommand!=='function' || window.executeCommand.__noaV3)return;

    const previous=window.executeCommand;

    const wrapped=function(raw){
      const text=n(raw);
      const subject=subjectFromCommand(text);

      if(
        subject &&
        /(cuestionario|examen|simulacro)/.test(text) &&
        /(crea|creame|hazme|genera|prepara|inicia)/.test(text)
      ){
        const m=text.match(/(\d{1,2})\s*(preguntas|reactivos)?/);
        const count=m?Math.min(30,Math.max(1,parseInt(m[1]))):10;
        createQuizV3(subject,count);
        return;
      }

      if(
        subject &&
        /(flashcards|tarjetas)/.test(text) &&
        /(crea|creame|hazme|genera)/.test(text)
      ){
        const m=text.match(/(\d{1,2})\s*(flashcards|tarjetas)?/);
        const count=m?Math.min(30,Math.max(5,parseInt(m[1]))):15;
        api()?.createFlashcards?.(subject,count);
        return;
      }

      return previous(raw);
    };

    wrapped.__noaV3=true;
    window.executeCommand=wrapped;
  }

  function expose(){
    if(api()){
      api().createQuiz=createQuizV3;
      api().generateQuestions=generateQuestionsV3;
      api().subjects=SUBJECTS_V3.map(x=>x.value);
    }

    // También corrige cualquier flujo de NOA que use generateAIQuestions().
    window.generateAIQuestions=generateQuestionsV3;
    window.NOA_EXCOBA_V3={
      subjects:SUBJECTS_V3,
      createQuiz:createQuizV3,
      generateQuestions:generateQuestionsV3
    };
  }

  function init(){
    if(!api()){
      setTimeout(init,250);
      return;
    }

    upgradeSubjectSelect();
    replaceQuizButton();
    patchVoiceCommands();
    expose();

    console.log('NOA EXCOBA Patch v3 activo · 9 materias + Quiz Engine v3');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
