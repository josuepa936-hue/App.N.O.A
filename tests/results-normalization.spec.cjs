const {test, expect} = require('@playwright/test');
const {openApp} = require('./fixtures.cjs');
const {timedQuestions, openTimed, startMixed, navigateTimed, answerTimed, expire} = require('./timed-exam-fixtures.cjs');

const at = '2026-06-01T12:00:00.000Z';
const subject = 'EXCOBA Primaria · Español';
const sample = patch => ({id:'attempt-a',at,total:1,score:1,
  answers:[{questionId:'question-a',subject,syllabusCode:'1.1.1',interactionType:'single_select',ok:true,...patch}]});

test.beforeEach(async ({page}) => {
  page.normalizationErrors = [];
  page.on('pageerror', error => page.normalizationErrors.push(error.message));
  page.on('console', message => {if(message.type() === 'error') page.normalizationErrors.push(message.text());});
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:8022'
    ? route.continue() : route.abort());
});
test.afterEach(async ({page}) => expect(page.normalizationErrors).toEqual([]));

async function normalize(page, attempt, options = {}){
  await openApp(page);
  return page.evaluate(({attempt,options}) => {
    const catalog = {subjects:NOA_EXCOBA_V4.subjects,items:NOA_EXCOBA_MASTER.get().items};
    return NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(attempt,{catalog,...options});
  },{attempt,options});
}

for(const [patch,status,credit] of [
  [{ok:true},'correct',1], [{ok:false},'incorrect',0],
  [{ok:false,scoreFraction:0.5,interactionType:'drag_classify'},'partial',0.5],
  [{ok:false,scoreFraction:0.25,interactionType:'inline_select'},'partial',0.25],
  [{ok:false,scoreFraction:2/3,interactionType:'drag_order'},'partial',2/3]
]){
  test('normaliza '+status+' '+(patch.interactionType || 'single_select')+' sin cambiar créditos',async({page})=>{
    const result = await normalize(page,sample(patch),{evidenceKind:'student'}), record=result.records[0];
    expect(record.status).toBe(status);expect(record.credit).toMatchObject({state:'known',value:credit});
    expect(record.maxCredit.value).toBe(1);expect(record.domainEligible).toBe(true);
    expect(record.knowledgeError).toBe(status==='incorrect');expect(result.completeness).toBe('complete');
  });
}

test('omisión por tiempo vence crédito contradictorio y no es error de conocimiento',async({page})=>{
  const input=sample({omitted:true,omissionReason:'timeout',presented:false,ok:true,scoreFraction:1});
  input.finishReason='timeout'; input.timing={finishReason:'timeout'};
  const record=(await normalize(page,input,{evidenceKind:'student'})).records[0];
  expect(record).toMatchObject({status:'omitted',credit:{value:0},domainEligible:false,knowledgeError:false,
    finishReason:{value:'timeout'},omissionReason:{value:'timeout'},exposure:{countsAsExposure:true,presented:{value:false}}});
  expect(record.quality.issues).toContain('omission_overrides_conflicting_credit');
});

test('ausencia, null y cero no se confunden',async({page})=>{
  const input={id:'a',total:3,score:0,answers:[{questionId:'absent'},{questionId:'null',scoreFraction:null},{questionId:'zero',scoreFraction:0}]};
  const result=await normalize(page,input);
  expect(result.records.map(record=>[record.credit.state,record.credit.value,record.status]))
    .toEqual([['absent',null,'unknown'],['unknown',null,'unknown'],['known',0,'incorrect']]);
  expect(result.reportedScore).toMatchObject({state:'known',value:0});
});

for(const score of [-0.1,1.1,'0',false]){
  test('rechaza crédito inválido '+JSON.stringify(score)+' sin rescatar ok',async({page})=>{
    const record=(await normalize(page,sample({scoreFraction:score}))).records[0];
    expect(record.credit).toMatchObject({value:null,state:'invalid'});expect(record.status).toBe('unknown');
  });
}

test('NaN e infinito permanecen inválidos en el runtime de navegador',async({page})=>{
  await openApp(page);
  expect(await page.evaluate(()=>[NaN,Infinity,-Infinity].map(scoreFraction=>
    NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt({answers:[{scoreFraction,ok:true}]}).records[0].credit.state)))
    .toEqual(['invalid','invalid','invalid']);
});

test('sin catálogo o sin metadatos académicos queda Sin clasificar',async({page})=>{
  const withoutCatalog=(await normalize(page,sample({}),{catalog:null})).records[0];
  expect(withoutCatalog.classification.labels.subject).toBe('Sin clasificar');
  const result=await normalize(page,{answers:[{ok:false,topicId:'local-mutable-topic'}]});
  expect(result.records[0].classification.labels).toEqual({section:'Sin clasificar',subject:'Sin clasificar',subtopic:'Sin clasificar'});
  expect(result.records[0].topicId.value).toBe('local-mutable-topic');
  expect(result.records[0].questionId.state).toBe('absent');
});

test('resuelve las nueve materias y secciones con los códigos reales del Temario',async({page})=>{
  await openApp(page);
  const result=await page.evaluate(()=>{
    const catalog={subjects:NOA_EXCOBA_V4.subjects,items:NOA_EXCOBA_MASTER.get().items};
    return catalog.subjects.map((subject,index)=>{
      const item=catalog.items.find(item=>item.subject===subject.value);
      const record=NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt({id:'nine',total:1,answers:[{questionId:String(index),syllabusCode:item.code,ok:true}]},{catalog}).records[0];
      return {actual:record.classification,expectedSubject:subject.value,expectedCode:item.code,prefix:subject.prefixes[0]};
    });
  });
  expect(result).toHaveLength(9);
  for(const item of result){
    expect(item.actual.subject.value).toBe(item.expectedSubject);expect(item.actual.subtopic.value).toBe(item.expectedCode);
    expect(item.actual.section.value).toBe({'1':'primary','2':'secondary','3':'medicine'}[item.prefix[0]]);
  }
});

test('conflictos de materia, sección y códigos inválidos no se resuelven por conjetura',async({page})=>{
  const conflict=(await normalize(page,sample({blueprintSlot:{subject:'EXCOBA Medicina · Biología'}}))).records[0];
  expect(conflict.classification.subject.state).toBe('conflict');expect(conflict.classification.labels.subtopic).toBe('Sin clasificar');
  const sectionConflict=(await normalize(page,sample({groupId:'medicine'}))).records[0];
  expect(sectionConflict.classification.section.state).toBe('conflict');
  const bad=(await normalize(page,sample({syllabusCode:'9.99.99'}))).records[0];
  expect(bad.classification.subtopic.state).toBe('invalid');expect(bad.allocations).toEqual([]);
});

test('varios subtemas conservan etiquetas pero no duplican ni reparten créditos',async({page})=>{
  const record=(await normalize(page,sample({syllabusCodes:['1.1.1','1.1.2'],scoreFraction:0.5,ok:false}))).records[0];
  expect(record.credit.value).toBe(0.5);expect(record.classification.subject.value).toBe(subject);
  expect(record.classification.subtopicCandidates).toEqual(['1.1.1','1.1.2']);
  expect(record.classification.labels.subtopic).toBe('Sin clasificar');expect(record.allocations).toEqual([]);
});

test('un subtema único recibe una sola asignación incluso repetido en el Blueprint',async({page})=>{
  const record=(await normalize(page,sample({blueprintSlot:{subject,syllabusCodes:['1.1.1','1.1.1']}}))).records[0];
  expect(record.allocations).toEqual([{subtopicId:'1.1.1',share:1}]);
});

test('histórico con solo resumen no inventa respuestas',async({page})=>{
  const result=await normalize(page,{id:'old',score:3,total:5,at:null});
  expect(result.records).toEqual([]);expect(result.completeness).toBe('incomplete');
  expect(result.at.state).toBe('unknown');expect(result.reportedScore.value).toBe(3);
  expect(result.issues).toContain('answer_count_mismatch');
});

test('duplicados exactos cuentan una vez y los contradictorios quedan en cuarentena',async({page})=>{
  const input=sample({});input.answers.push({...input.answers[0]});
  const exact=await normalize(page,input);
  expect(exact.records).toHaveLength(1);expect(exact.duplicatesRemoved).toBe(1);expect(exact.records[0].sourceIndexes).toEqual([0,1]);
  input.answers[1].ok=false;
  const conflict=await normalize(page,input);
  expect(conflict.records).toHaveLength(1);expect(conflict.records[0]).toMatchObject({status:'unknown',credit:{state:'conflict',value:null},domainEligible:false,allocations:[]});
  expect(conflict.records[0].classification.subject.value).toBe(subject);
});

test('historial deduplica IDs de intento sin colapsar intentos diferentes',async({page})=>{
  await openApp(page);
  const result=await page.evaluate(input=>{
    const api=NOA_RESULTS_NORMALIZATION_V27;
    const other={...input,id:'different'};
    return {same:api.normalizeHistory([input,structuredClone(input),other]),conflict:api.normalizeHistory([input,{...input,score:99}])};
  },sample({}));
  expect(result.same.attempts).toHaveLength(2);expect(result.same.issues).toHaveLength(1);
  expect(result.conflict.attempts).toHaveLength(1);expect(result.conflict.attempts[0].reportedScore.state).toBe('conflict');
  expect(result.conflict.attempts[0].records[0].credit.value).toBe(1);
  expect(result.conflict.attempts[0].issues).toContain('conflicting_attempt_id');
});

test('aliases pregunta/slot y un puente tardío no permiten doble contabilización',async({page})=>{
  const input={id:'aliases',total:1,answers:[
    {questionId:'q1',ok:true}, {planSlotId:'slot1',ok:true},
    {questionId:'q1',planSlotId:'slot1',ok:true},
    {questionId:'q2',planSlotId:'slot1',ok:false}
  ]};
  const result=await normalize(page,input);
  expect(result.records).toHaveLength(1);expect(result.duplicatesRemoved).toBe(3);
  expect(result.records[0].sourceIndexes).toEqual([0,1,2,3]);
  expect(result.records[0]).toMatchObject({status:'unknown',credit:{state:'conflict',value:null},domainEligible:false});
});

test('salidas independientes y fechas sin zona no se convierten en certeza',async({page})=>{
  await openApp(page);
  const result=await page.evaluate(input=>{
    input.at='2026-06-01T12:00:00';
    const first=NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(input);
    const second=NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(input);
    first.records[0].quality.issues.push('caller-change');
    first.records[0].credit.value=999;
    return {second,input};
  },sample({scoreFraction:0.5,ok:false}));
  expect(result.second.at.state).toBe('invalid');expect(result.second.records[0].credit.value).toBe(0.5);
  expect(result.second.records[0].quality.issues).not.toContain('caller-change');
  expect(result.input.answers[0].scoreFraction).toBe(0.5);
});

test('sin identidad no inventa IDs ni deduplica por texto',async({page})=>{
  const result=await normalize(page,{answers:[{ok:true},{ok:true}]});
  expect(result.records).toHaveLength(2);expect(result.records.every(record=>record.key===null)).toBe(true);
  expect(result.completeness).toBe('incomplete');expect(result.issues).toContain('missing_question_identity');
});

test('datos técnicos nunca se convierten en dominio y procedencia desconocida exige declaración',async({page})=>{
  const input=sample({});
  expect((await normalize(page,input)).records[0].domainEligible).toBe(false);
  input.technicalTest=true;
  const record=(await normalize(page,input,{evidenceKind:'student'})).records[0];
  expect(record.evidenceKind).toBe('technical_test');expect(record.domainEligible).toBe(false);expect(record.knowledgeError).toBeNull();
});

test('pureza con entradas congeladas, sin leer almacenamiento ni cambiar examen o Calibrator',async({page})=>{
  await openApp(page);
  const result=await page.evaluate(input=>{
    const catalog={subjects:NOA_EXCOBA_V4.subjects,items:NOA_EXCOBA_MASTER.get().items};
    const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
    const options=freeze({catalog:structuredClone(catalog),evidenceKind:'technical_test'});freeze(input);
    const snapshot=()=>JSON.stringify({db,examQueue,examAnswers,examScore,examIndex,cal:NOA_CALIBRATOR.get(),clock:NOA_EXAM_SHELL.state(),storage:{...localStorage},session:{...sessionStorage}});
    const before=snapshot(),original=JSON.stringify({input,options});
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
    Storage.prototype.getItem=Storage.prototype.setItem=Storage.prototype.removeItem=()=>{throw Error('storage access forbidden');};
    let first,second;
    try{first=NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(input,options);second=NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(input,options);}
    finally{Storage.prototype.getItem=get;Storage.prototype.setItem=set;Storage.prototype.removeItem=remove;}
    return {same:JSON.stringify(first)===JSON.stringify(second),unchanged:original===JSON.stringify({input,options}),runtime:before===snapshot(),first};
  },sample({scoreFraction:0.5,ok:false}));
  expect(result.same).toBe(true);expect(result.unchanged).toBe(true);expect(result.runtime).toBe(true);
  expect(result.first.records[0].credit.value).toBe(0.5);
});

test('normaliza un cierre v26 real con parcial y omisiones sin tocar memoria o respaldo',async({page})=>{
  await openTimed(page);await startMixed(page);await navigateTimed(page,1);await answerTimed(page,timedQuestions[1],'partial');
  const completed=await expire(page);
  const projected=await page.evaluate(async()=>{
    const before=JSON.stringify(db),memory=localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey),cal=JSON.stringify(NOA_CALIBRATOR.get());
    const backup=await NOA_QUESTION_MEMORY_V25_2.createBackup();
    const options={catalog:{subjects:NOA_EXCOBA_V4.subjects,items:NOA_EXCOBA_MASTER.get().items},evidenceKind:'technical_test'};
    const normalized=NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(db.attempts[0],options);
    const backupAfter=await NOA_QUESTION_MEMORY_V25_2.createBackup();
    return {normalized,unchanged:before===JSON.stringify(db),memoryUnchanged:memory===localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey),calUnchanged:cal===JSON.stringify(NOA_CALIBRATOR.get()),backupSame:JSON.stringify(backup.backup.db)===JSON.stringify(backupAfter.backup.db)};
  });
  expect(completed.attempts).toHaveLength(1);expect(projected.normalized.records).toHaveLength(4);
  expect(projected.normalized.records.filter(record=>record.status==='omitted')).toHaveLength(3);
  expect(projected.normalized.records.reduce((sum,record)=>sum+record.credit.value,0)).toBe(0.5);
  expect(projected.normalized.records.every(record=>record.domainEligible===false)).toBe(true);
  expect(projected).toMatchObject({unchanged:true,memoryUnchanged:true,calUnchanged:true,backupSame:true});
});

for(const [group,state] of [[undefined,'absent'],[null,'unknown'],['primary','known'],[['primary'],'conflict'],[{},'conflict'],[{toString:'primary'},'conflict'],['other','conflict']]){
  test('sección estricta y estado '+state+' para '+JSON.stringify(group),async({page})=>{
    const input={id:'section',total:1,answers:[{questionId:'q',ok:true,...(group===undefined?{}:{groupId:group})}]};
    const result=await normalize(page,input);
    expect(result.records[0].classification.section.state).toBe(state);
    expect(result.records[0].classification.section.sources).toEqual(group===undefined?[]:['answer.groupId']);
    if(state==='known') expect(result.records[0].classification.section.value).toBe('primary');
    else expect(result.records[0].classification.section.value).toBeNull();
  });
}

test('proyecciones de arrays y objetos congelados no exponen referencias de entrada',async({page})=>{
  await openApp(page);
  const result=await page.evaluate(()=>{
    const input={id:'frozen',answers:[{questionId:'a',groupId:['primary'],ok:true},{questionId:'b',groupId:{value:'primary'},ok:false}]};
    const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
    freeze(input);const before=JSON.stringify(input);
    const projection=NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(input);
    const objects=value=>value&&typeof value==='object'?[value,...Object.values(value).flatMap(objects)]:[];
    const inputs=new Set(objects(input));
    const shared=objects(projection).some(value=>inputs.has(value));
    projection.records[0].classification.section.value=['modified'];projection.records[1].quality.issues.push('modified');
    return {shared,unchanged:before===JSON.stringify(input)};
  });
  expect(result).toEqual({shared:false,unchanged:true});
});

for(const omitted of [false,true]){
  test('duplicados coincidentes conservan '+(omitted?'omisión':'parcial')+' pese a presentación y descripción distintas',async({page})=>{
    const input=sample({scoreFraction:omitted?0:0.5,ok:false,omitted,presented:false});
    input.answers.push({...input.answers[0],presented:true,explanation:'Otra descripción'});
    const result=await normalize(page,input,{evidenceKind:'student'}),record=result.records[0];
    expect(record.credit.value).toBe(omitted?0:0.5);expect(record.status).toBe(omitted?'omitted':'partial');
    expect(record.exposure.presented.state).toBe('conflict');expect(record.sourceIndexes).toEqual([0,1]);
    expect(record.credit.sources).toHaveLength(2);expect(record.domainEligible).toBe(!omitted);
  });
}

test('clasificación contradictoria no se elige del primero ni borra crédito coincidente',async({page})=>{
  const input=sample({scoreFraction:0.5,ok:false});
  input.answers.push({...input.answers[0],subject:'EXCOBA Medicina · Biología',syllabusCode:'3.4.1'});
  const record=(await normalize(page,input)).records[0];
  expect(record.credit.value).toBe(0.5);expect(record.classification.subject.state).toBe('conflict');
  expect(record.classification.labels.subject).toBe('Sin clasificar');expect(record.allocations).toEqual([]);
});

test('omisiones vs respuestas y vetos técnicos se resuelven por separado',async({page})=>{
  const input=sample({scoreFraction:0,ok:false,omitted:true});
  input.answers.push({...input.answers[0],omitted:false,technicalTest:true});
  const record=(await normalize(page,input,{evidenceKind:'student'})).records[0];
  expect(record.credit.state).toBe('conflict');expect(record.omitted.state).toBe('conflict');
  expect(record.evidenceKind).toBe('technical_test');expect(record.domainEligible).toBe(false);
});

test('historial combina campos coincidentes y marca resúmenes incompatibles con procedencia',async({page})=>{
  await openApp(page);
  const input=sample({scoreFraction:0.5,ok:false});
  const result=await page.evaluate(input=>{
    const variants=[input,{...structuredClone(input),score:0,total:2,at:'2026-07-01T12:00:00.000Z'}, {...structuredClone(input),note:'No académico'}];
    const before=JSON.stringify(variants);
    const first=NOA_RESULTS_NORMALIZATION_V27.normalizeHistory(variants);
    const second=NOA_RESULTS_NORMALIZATION_V27.normalizeHistory(variants);
    return {first,same:JSON.stringify(first)===JSON.stringify(second),unchanged:before===JSON.stringify(variants)};
  },input);
  const attempt=result.first.attempts[0];expect(result.first.attempts).toHaveLength(1);
  for(const key of ['reportedScore','declaredTotal','at']){
    expect(attempt[key].state).toBe('conflict');expect(attempt[key].value).toBeNull();expect(attempt[key].sources).toHaveLength(3);
  }
  expect(attempt.records).toHaveLength(1);expect(attempt.records[0].credit.value).toBe(0.5);
  expect(attempt.records[0].provenance).toEqual([{attemptIndex:0,answerIndex:0},{attemptIndex:1,answerIndex:0},{attemptIndex:2,answerIndex:0}]);
  expect(attempt.sourceAttemptIndexes).toEqual([0,1,2]);expect(result.same).toBe(true);expect(result.unchanged).toBe(true);
});

test('un conflicto exclusivo de total conserva puntuación y fecha coincidentes',async({page})=>{
  await openApp(page);
  const result=await page.evaluate(input=>NOA_RESULTS_NORMALIZATION_V27.normalizeHistory([input,{...structuredClone(input),total:2}]),sample({}));
  const attempt=result.attempts[0];
  expect(attempt.declaredTotal).toMatchObject({state:'conflict',value:null});
  expect(attempt.reportedScore).toMatchObject({state:'known',value:1});
  expect(attempt.at).toMatchObject({state:'known',value:at});
  expect(attempt.reportedScore.sources).toEqual(['attempts[0].attempt.score','attempts[1].attempt.score']);
});

test('historial ignora diferencias descriptivas y conserva resúmenes coincidentes',async({page})=>{
  await openApp(page);
  const result=await page.evaluate(input=>NOA_RESULTS_NORMALIZATION_V27.normalizeHistory([input,structuredClone(input),{...structuredClone(input),note:'descriptivo'}]),sample({}));
  expect(result.attempts).toHaveLength(1);const attempt=result.attempts[0];
  expect(attempt.reportedScore).toMatchObject({state:'known',value:1});expect(attempt.declaredTotal.value).toBe(1);
  expect(attempt.at.state).toBe('known');expect(attempt.records).toHaveLength(1);expect(attempt.records[0].credit.value).toBe(1);
  expect(attempt.completeness).toBe('complete');
});

test('copias de un histórico sin IDs no generan créditos duplicados por posición',async({page})=>{
  await openApp(page);
  const result=await page.evaluate(()=>{
    const input={id:'anonymous',total:1,score:1,answers:[{ok:true}]};
    const omission={id:'omission',total:1,score:0,answers:[{omitted:true,scoreFraction:0,presented:false}]};
    return {answered:NOA_RESULTS_NORMALIZATION_V27.normalizeHistory([input,structuredClone(input)]),
      omitted:NOA_RESULTS_NORMALIZATION_V27.normalizeHistory([omission,structuredClone(omission)])};
  });
  expect(result.omitted.attempts[0].records.every(record=>record.status==='omitted' && record.credit.value===0 && !record.domainEligible)).toBe(true);
  const attempt=result.answered.attempts[0];expect(result.answered.attempts).toHaveLength(1);
  expect(attempt.completeness).toBe('incomplete');
  expect(attempt.records.every(record=>record.credit.state==='conflict' && record.credit.value===null && !record.domainEligible)).toBe(true);
  expect(attempt.records.flatMap(record=>record.provenance)).toEqual([{attemptIndex:0,answerIndex:0},{attemptIndex:1,answerIndex:0}]);
});

test.describe('normalizador disponible offline con SW real',()=>{
  test.use({serviceWorkers:'allow'});
  test('carga desde ASSETS y conserva la API tras recargar offline',async({page,context})=>{
    await openApp(page);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const cached=await page.evaluate(async()=>{
      const scope=(await navigator.serviceWorker.ready).scope;
      const names=(await caches.keys()).filter(name=>name.startsWith('noa-mobile:'+encodeURIComponent(scope)+':'));
      return {names,asset:!!await (await caches.open(names[0])).match(new URL('excoba_patch_v27_results_normalization.js',scope).href)};
    });
    expect(cached.names).toHaveLength(1);expect(cached.names[0]).toMatch(/:v6-81$/);expect(cached.asset).toBe(true);
    await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.NOA_RESULTS_NORMALIZATION_V27);
    expect(await page.evaluate(()=>NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt({answers:[{ok:false}]}).records[0].credit.value)).toBe(0);
  });
});
