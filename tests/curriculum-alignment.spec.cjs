const {test,expect}=require('@playwright/test');
const {openGenerator,activeSession}=require('./generator-fixtures.cjs');
const {fullExamState,waitDraftCheckpoint}=require('./exam-45-ui-fixtures.cjs');
const {review,installJudgeFixture}=require('./judge-academic-fixtures.cjs');
const {questions}=require('./fixtures.cjs');

const spanish='EXCOBA Primaria · Español';
const dates={instruction:'Completa las fechas de la Independencia de México.',
  text:'La Independencia de México comenzó en [[b1]] y se consumó en [[b2]].',
  blanks:[{id:'b1',options:['1810','1821'],correct:0},{id:'b2',options:['1821','1810'],correct:0}],
  explanation:'El inicio fue en 1810 y la consumación en 1821.'};
const reading={...structuredClone(dates),instruction:'Identifica información del recuento proporcionado.',
  text:'Lee: «En 1810 comenzó la lucha por la Independencia de México; en 1821 se consumó». Según el texto, el inicio ocurrió en [[b1]] y la consumación en [[b2]].',
  explanation:'El texto da ambos años; se identifica la información de cada acontecimiento sin recurrir a memoria histórica.'};
const spelling={instruction:'Aplica las reglas de acentuación.',
  text:'Completa la escritura correcta de las palabras agudas: El [[b1]] explicó la [[b2]] del siglo XIX.',
  blanks:[{id:'b1',options:['capitán','capitan'],correct:0},{id:'b2',options:['revolución','revolucion'],correct:0}],
  explanation:'Capitán y revolución llevan tilde porque son agudas terminadas en n; no se pide identificar ningún acontecimiento.'};
const writing={instruction:'Redacta la oración con concordancia entre sujeto y verbo.',
  text:'En un relato histórico: Los mensajeros [[b1]] al pueblo y la cronista [[b2]] el anuncio.',
  blanks:[{id:'b1',options:['llegaron','llegó'],correct:0},{id:'b2',options:['registró','registraron'],correct:0}],
  explanation:'Los mensajeros exige plural; la cronista exige singular. No se necesita conocer un hecho histórico.'};

test.beforeEach(async({page})=>{
  page.alignmentErrors=[];page.alignmentExternal=[];
  await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin!=='http://127.0.0.1:8022'){
      page.alignmentExternal.push(route.request().url());return route.abort();
    }return route.continue();
  });
  page.on('pageerror',e=>page.alignmentErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')page.alignmentErrors.push(m.text());});
  await openGenerator(page);await installJudgeFixture(page);
  await page.evaluate(()=>{
    db.masterSyllabus={id:'uaq-excoba-2026-2-medicina',items:NOA_EXCOBA_FIX_V5.items.map(i=>({...i}))};save();
    window.__curriculum={calls:[],response:null};
    window.callAI=async(messages,options)=>{
      __curriculum.calls.push({messages:structuredClone(messages),options:structuredClone(options)});
      return JSON.stringify(__curriculum.response);
    };
    __curriculum.slot=(format,subject,code)=>{
      const slot=__judgeFixture.slot(format,subject),item=NOA_ACADEMIC_RESULTS_V27.catalog().items.find(i=>i.code===code&&i.subject===subject);
      if(!item)throw Error('Fixture sin código real.');
      return {...slot,syllabusCodes:[code],sourceType:item.reference?'extended':'official',
        source:item.reference?{kind:'extended',anchorCode:code,anchorTitle:item.title,anchorFocus:item.focus,reference:item.reference}:
          {kind:'official',code,title:item.title,focus:item.focus}};
    };
  });
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
});
test.afterEach(async({page},info)=>{
  expect(page.alignmentErrors).toEqual([]);expect(page.alignmentExternal).toEqual([]);
  expect(await page.evaluate(()=>__judgeFixture.forbidden)).toBe(0);
  await info.attach('alcance-de-la-evidencia',{body:JSON.stringify({
    calls:await page.evaluate(()=>__curriculum.calls.length),realAIRequests:0,
    limitation:'Dictámenes semánticos simulados: verifican el contrato y sus vetos, no la exactitud de un modelo real.'}),contentType:'application/json'});
});

function verdict(code,status='pass',skill='Comprensión de información explícita del recuento.',unrelated=false){
  return {...review('inline_select',10),source_alignment:{status,syllabusCodes:[code],assessedSkill:skill,
    requiresUnrelatedKnowledge:unrelated,reason:status==='pass'?'La operación exigida se resuelve con el texto y la habilidad del subtema indicado.':'El reactivo exige recordar fechas históricas no proporcionadas; no evalúa lectura del recuento.'}};
}
async function judge(page,question,response,code='1.1.1',subject=spanish,format='inline_select'){
  return page.evaluate(async({question,response,code,subject,format})=>{
    const slot=__curriculum.slot(format,subject,code);__curriculum.response=response;
    return __judgeFixture.judge(format,question,slot);
  },{question,response,code,subject,format});
}

test('reproduce brecha anterior: notas altas sin comprobación semántica ya no bastan',async({page})=>{
  const response=review('inline_select',10);
  const historicalPolicy=await page.evaluate(r=>NOA_JUDGE_ACADEMIC.evaluate(r,'inline_select'),response);
  expect(historicalPolicy.accepted).toBe(true);
  const result=await judge(page,dates,response);
  expect(result.accepted).toBe(false);expect(result.judge.contractValid).toBe(false);
  expect(result.judge.validationErrors.join(' ')).toContain('source_alignment');
});

for(const [name,question,code,skill] of [
  ['comprensión con fechas proporcionadas',reading,'1.1.1','Identifica fechas y acontecimientos explícitos del recuento.'],
  ['ortografía en contexto histórico',spelling,'1.1.5','Aplica acentuación de palabras agudas terminadas en n.'],
  ['redacción con concordancia',writing,'1.1.6','Selecciona las formas verbales que concuerdan con el sujeto.']
])test(`acepta Español auténtico: ${name}`,async({page})=>{
  const result=await judge(page,question,verdict(code,'pass',skill),code);
  expect(result.accepted).toBe(true);expect(result.judge.source_alignment.assessedSkill).toBe(skill);
  expect(result.judge.qualityScore).toBe(10);expect(result.judge.policyVersion).toBe('25.1');
  expect(result.blanks).toEqual(question.blanks);
});

for(const status of ['fail','uncertain'])test(`veto ${status}: Historia de memoria disfrazada de Español con promedio 10`,async({page})=>{
  const result=await judge(page,dates,verdict('1.1.1',status,'Recuerda fechas históricas no incluidas en la lectura.',true));
  expect(result.accepted).toBe(false);expect(result.judge.contractValid).toBe(true);
  expect(result.judge).toMatchObject({qualityScore:10,requiresHumanReview:true,critical_issues:[]});
});

test('pass contradictorio no elude veto por conocimiento ajeno al subtema',async({page})=>{
  const result=await judge(page,dates,verdict('1.1.1','pass','Memoriza fechas históricas.',true));
  expect(result.accepted).toBe(false);expect(result.judge.requiresHumanReview).toBe(true);
});

test('materia correcta no basta: comprensión no sustituye Ortografía 1.1.5',async({page})=>{
  const r=verdict('1.1.5','fail','Extrae información del texto; no aplica reglas ortográficas.');
  r.source_alignment.reason='La lectura corresponde a 1.1.1, pero el slot bloqueado solicita 1.1.5.';
  expect((await judge(page,reading,r,'1.1.5')).accepted).toBe(false);
});

test('mismos años en Matemáticas: rechaza memoria histórica y acepta cálculo contextual',async({page})=>{
  const subject='EXCOBA Primaria · Matemáticas',code='1.2.1';
  const single=(status,skill,unrelated=false)=>({...review('single_select',10),source_alignment:verdict(code,status,skill,unrelated).source_alignment});
  const memory={text:'¿En qué año comenzó la Independencia de México?',options:['1810','1821','1800','1830'],correct:0,explain:'Comenzó en 1810.'};
  expect((await judge(page,memory,single('fail','Recuerda fechas históricas.',true),code,subject,'single_select')).accepted).toBe(false);
  const arithmetic={text:'En una línea temporal se dan 1810 y 1821. ¿Cuál es la diferencia entre esos números?',
    options:['11','21','10','31'],correct:0,explain:'1821 − 1810 = 11.'};
  expect((await judge(page,arithmetic,single('pass','Aplica resta de números naturales.'),code,subject,'single_select')).accepted).toBe(true);
});

test('otras disciplinas: Biología no admite un ejercicio de balanceo químico fuera de su subtema',async({page})=>{
  const question={text:'¿Qué coeficientes balancean H₂ + O₂ → H₂O?',options:['2, 1, 2','1, 1, 1','1, 2, 1','2, 2, 1'],correct:0,explain:'Se conservan los átomos con 2, 1, 2.'};
  for(const [subject,code,status] of [['EXCOBA Medicina · Biología','3.4.1.1','fail'],['EXCOBA Medicina · Química','3.6.1.6','pass']]){
    const response={...review('single_select',10),source_alignment:{...verdict(code,status,'Balancea ecuaciones químicas.').source_alignment,
      reason:status==='pass'?'Balancear ecuaciones corresponde al alcance 3.6.1.6.':'Balancear ecuaciones no evalúa niveles de organización de la materia viva.'}};
    expect((await judge(page,question,response,code,subject,'single_select')).accepted).toBe(status==='pass');
  }
});

test('no admite códigos ajenos, inventados, vacíos ni pruebas semánticas incompletas',async({page})=>{
  for(const mutation of [{syllabusCodes:['2.4.1']},{syllabusCodes:['1.1.999']},{syllabusCodes:[]},
    {syllabusCodes:['1.1.1','1.1.1']},{reason:' '},{assessedSkill:null},{requiresUnrelatedKnowledge:'false'},{status:'approved'}]){
    const response=verdict('1.1.1');Object.assign(response.source_alignment,mutation);
    const result=await judge(page,reading,response);
    expect(result.accepted).toBe(false);expect(result.judge.contractValid).toBe(false);
  }
});

test('slot con código incompatible se rechaza antes de solicitar IA, sin tocar la sesión',async({page})=>{
  await activeSession(page);await waitDraftCheckpoint(page);const before=await fullExamState(page);
  const result=await page.evaluate(async()=>{
    const slot=__curriculum.slot('inline_select','EXCOBA Primaria · Español','1.1.1');slot.syllabusCodes=['3.6.1.6'];
    try{await NOA_INLINE_SELECT.generate(slot);return null;}catch(e){return e.message;}
  });
  expect(result).toContain('no corresponden al catálogo');
  expect(await page.evaluate(()=>__curriculum.calls.length)).toBe(0);
  expect(await fullExamState(page)).toEqual(before);
});

test('rechazo curricular en pipeline preserva respuestas, memoria, historial, tiempo y procedencia',async({page})=>{
  await activeSession(page);await waitDraftCheckpoint(page);const before=await fullExamState(page);
  const result=await page.evaluate(async({question,response})=>{
    const slot=__curriculum.slot('inline_select','EXCOBA Primaria · Español','1.1.1'),original=JSON.stringify(slot);
    window.callAI=async(messages,options)=>{
      __curriculum.calls.push({messages,options});return JSON.stringify(messages[0].content.includes('Judge')?response:question);
    };
    try{await NOA_BLUEPRINT_GENERATOR.generateSlot(slot,{maxAttempts:1});return {accepted:true};}
    catch(e){return {message:e.message,slotUnchanged:JSON.stringify(slot)===original};}
  },{question:dates,response:verdict('1.1.1','fail','Recuerda fechas históricas.',true)});
  expect(result.message).toContain('Judge no aprobó');expect(result.slotUnchanged).toBe(true);
  expect(await page.evaluate(()=>__curriculum.calls.length)).toBe(2);expect(await fullExamState(page)).toEqual(before);
});

for(const [index,format] of ['single_select','drag_classify','inline_select','drag_order'].entries())test(`contrato compartido ${format}: catálogo real y habilidad evaluada en Generator y Judge`,async({page})=>{
  const result=await page.evaluate(async({format,question})=>{
    const slot=__curriculum.slot(format,'EXCOBA Medicina · Biología','3.4.1.1'),before=structuredClone(slot);
    const generate={single_select:NOA_BLUEPRINT_GENERATOR.generateSingleSelect,drag_classify:NOA_DRAG_CLASSIFY.generate,
      inline_select:NOA_INLINE_SELECT.generate,drag_order:NOA_DRAG_ORDER.generate}[format];
    __curriculum.response=format==='single_select'?{question:question.text,...question}:question;
    const generated=await generate(slot);
    __curriculum.response={};const judged=await __judgeFixture.judge(format,generated,slot);
    return {before,slot,judged,calls:__curriculum.calls};
  },{format,question:questions[index]});
  expect(result.slot).toEqual(result.before);expect(result.judged.accepted).toBe(false);
  for(const call of result.calls){
    const text=call.messages.map(m=>m.content).join('\n');
    expect(text).toContain('Niveles de organización de la materia viva');
    expect(text).toContain('habilidad NECESARIA');expect(text).toContain('no de subject');
  }
  expect(result.calls[1].messages[0].content).toContain('assessedSkill');
  // Schema wording differs per format; check the shared contract API.
  const required=await page.evaluate(format=>JSON.parse(NOA_JUDGE_ACADEMIC.responseContract(format,{syllabusCodes:['3.4.1.1']})).required,format);
  expect(required).toContain('source_alignment');
});

test('evaluación repetida y proyección de evidencia no mutan slot ni dictamen',async({page})=>{
  const response=verdict('1.1.1');const result=await page.evaluate(response=>{
    const slot=__curriculum.slot('inline_select','EXCOBA Primaria · Español','1.1.1');
    const before=JSON.stringify({slot,response});
    const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};
    freeze(slot);freeze(response);
    const a=NOA_JUDGE_ACADEMIC.evaluate(response,'inline_select',slot),b=NOA_JUDGE_ACADEMIC.evaluate(response,'inline_select',slot);
    const equal=JSON.stringify(a)===JSON.stringify(b);a.judge.source_alignment.syllabusCodes.push('inventado');
    return {equal,unchanged:JSON.stringify({slot,response})===before,b};
  },response);
  expect(result.equal).toBe(true);expect(result.unchanged).toBe(true);expect(result.b.accepted).toBe(true);
  expect(result.b.judge.source_alignment.syllabusCodes).toEqual(['1.1.1']);
});

test('catálogo estático verificado prevalece sobre títulos adulterados del respaldo o Blueprint',async({page})=>{
  const scope=await page.evaluate(()=>{
    db.masterSyllabus.items[0].title='Fechas para memorizar';
    const slot=__curriculum.slot('inline_select','EXCOBA Primaria · Español','1.1.1');
    slot.source.title='Fechas para memorizar';slot.source.focus='Memorizar todos los años';
    return NOA_JUDGE_ACADEMIC.alignmentContext(slot);
  });
  expect(scope).toContain('Identificación de una sucesión cronológica de hechos.');
  expect(scope).not.toContain('Fechas para memorizar');expect(scope).not.toContain('Memorizar todos los años');
});

test('curso exclusivo conserva alcance propio sin inventar ancla oficial',async({page})=>{
  const result=await page.evaluate(response=>{
    const slot=__curriculum.slot('inline_select','EXCOBA Primaria · Español','1.1.1');
    slot.syllabusCodes=[];slot.sourceType='course';slot.requestedSourceType='course';
    slot.source={kind:'course',title:'Ejercicio de redacción del curso',material:'Practica concordancia en un texto suministrado.',objective:{text:'Aplicar concordancia.'}};
    response.source_alignment.syllabusCodes=[];
    return {context:NOA_JUDGE_ACADEMIC.alignmentContext(slot),result:NOA_JUDGE_ACADEMIC.evaluate(response,'inline_select',slot)};
  },verdict('1.1.1','pass','Concordancia según el material del curso.'));
  expect(result.result.accepted).toBe(true);expect(result.context).toContain('"topics":[]');
  expect(result.context).toContain('Aplicar concordancia.');
});

test('Física conserva su referencia alternativa y el catálogo ausente impide nuevas solicitudes',async({page})=>{
  const result=await page.evaluate(async()=>{
    const slot=__curriculum.slot('drag_classify',NOA_EXCOBA_PREPARATION.physics().value,'3.3.1.4');
    const context=NOA_JUDGE_ACADEMIC.alignmentContext(slot);
    const adapter=window.NOA_ACADEMIC_RESULTS_V27;
    window.NOA_ACADEMIC_RESULTS_V27={catalog:()=>({items:[]})};
    try{await NOA_DRAG_CLASSIFY.generate(slot);return {context,error:null};}
    catch(e){return {context,error:e.message};}
    finally{window.NOA_ACADEMIC_RESULTS_V27=adapter;}
  });
  expect(result.context).toContain('"reference":"alternative"');
  expect(result.error).toContain('no corresponden al catálogo');
  expect(await page.evaluate(()=>__curriculum.calls.length)).toBe(0);
});
