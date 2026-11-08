const {test,expect}=require('@playwright/test');
const {openApp}=require('./fixtures.cjs');
async function setup(page){await openApp(page);await page.evaluate(()=>{
 window.progressOptions={catalog:NOA_ACADEMIC_RESULTS_V27.catalog()};
 window.makeProgressAttempt=(id,at,credit=1,count=2)=>{
  const attempt={id,at,total:count,evidenceKind:'student',score:credit*count,answers:Array.from({length:count},(_,i)=>({questionId:id+'-'+i,subject:'EXCOBA Primaria · Español',syllabusCode:'1.1.1',interactionType:'single_select',difficulty:3,sourceType:'official',scoreFraction:credit,ok:credit===1,presented:true}))};
  setProgressTiming(attempt);return attempt;
 };
 window.setProgressTiming=(attempt,durationMs=60000,elapsed=10000)=>{
  const closedAt=Date.parse(attempt.at),startedAt=closedAt-elapsed;
  attempt.timing={version:26,attemptId:attempt.id,startedAt,durationMs,deadlineAt:startedAt+durationMs,
   status:'closed',finishReason:elapsed===durationMs?'timeout':'manual',closedAt,presentedQuestionIds:attempt.answers.map(a=>a.questionId)};
 };
 window.progressHistory=[makeProgressAttempt('a','2026-01-01T12:00:00Z',.5),makeProgressAttempt('b','2026-02-01T12:00:00Z',1)];
});}
test.beforeEach(async({page})=>{page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));page.on('console',message=>{if(message.type()==='error')page.errors.push(message.text());});await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());});
test.afterEach(async({page})=>expect(page.errors).toEqual([]));
test('vacío y un solo intento conservan muestra insuficiente',async({page})=>{await setup(page);const r=await page.evaluate(()=>[NOA_LEARNING_PROGRESS_V27.build([],progressOptions),NOA_LEARNING_PROGRESS_V27.build(progressHistory.slice(0,1),progressOptions)]);expect(r[0].rows).toEqual([]);expect(r[1].rows).toHaveLength(1);expect(r.every(x=>x.sampleStatus.includes('insuficiente'))).toBe(true);});
for(const [credit,change] of [[1,'mejora descriptiva'],[.5,'estabilidad descriptiva'],[0,'retroceso descriptivo']])test(change,async({page})=>{await setup(page);const r=await page.evaluate(credit=>{progressHistory[1]=makeProgressAttempt('b','2026-02-01T12:00:00Z',credit);const m=NOA_LEARNING_PROGRESS_V27.build(progressHistory.slice().reverse(),progressOptions);return {m,c:NOA_LEARNING_PROGRESS_V27.compare(...m.rows)};},credit);expect(r.m.rows.map(x=>x.id)).toEqual(['a','b']);expect(r.c).toMatchObject({comparable:true,change,delta:(credit-.5)*100,domainEvidence:true});expect(r.c.subjects[0].delta).toBe((credit-.5)*100);});
test('fechas nulas, inválidas y calendario inexistente no se inventan',async({page})=>{await setup(page);const r=await page.evaluate(()=>NOA_LEARNING_PROGRESS_V27.build([makeProgressAttempt('null',null),makeProgressAttempt('invalid','bad'),makeProgressAttempt('calendar','2026-02-31T12:00:00Z')],progressOptions));expect(r.rows.every(x=>x.date===null&&!x.comparable)).toBe(true);});
test('incompletos no se comparan',async({page})=>{await setup(page);const r=await page.evaluate(()=>{delete progressHistory[1].answers[0].scoreFraction;delete progressHistory[1].answers[0].ok;const m=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);return NOA_LEARNING_PROGRESS_V27.compare(...m.rows);});expect(r.comparable).toBe(false);expect(r.delta).toBeNull();});
test('IDs duplicados se deduplican y resúmenes contradictorios no se comparan',async({page})=>{await setup(page);const r=await page.evaluate(()=>{const a=progressHistory[0];return {same:NOA_LEARNING_PROGRESS_V27.build([a,structuredClone(a)],progressOptions),conflict:NOA_LEARNING_PROGRESS_V27.build([a,{...structuredClone(a),total:9}],progressOptions)};});expect(r.same.rows).toHaveLength(1);expect(r.conflict.rows).toHaveLength(1);expect(r.conflict.rows[0].comparable).toBe(false);});
test('técnicos excluidos y desconocidos solo descriptivos',async({page})=>{await setup(page);const r=await page.evaluate(()=>{progressHistory.forEach(x=>delete x.evidenceKind);const m=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);const c=NOA_LEARNING_PROGRESS_V27.compare(...m.rows);progressHistory[1].technicalTest=true;const t=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);delete progressHistory[1].technicalTest;progressHistory[1].answers[0].technicalTest=true;const row=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions).rows[1];return {m,c,t:NOA_LEARNING_PROGRESS_V27.compare(...t.rows),row};});expect(r.c).toMatchObject({comparable:true,domainEvidence:false});expect(r.m.rows.every(x=>x.report.stats.domain.answered===0)).toBe(true);expect(r.t.comparable).toBe(false);expect(r.row.kind).toBe('technical_test');expect(r.row.comparable).toBe(false);});
for(const property of ['count','difficulty','sourceType','subtopic'])test('condiciones incompatibles: '+property,async({page})=>{await setup(page);const r=await page.evaluate(property=>{if(property==='count')progressHistory[1]=makeProgressAttempt('b','2026-02-01T12:00:00Z',1,5);else progressHistory[1].answers.forEach(a=>{if(property==='subtopic')a.syllabusCode='1.1.2';else a[property]=property==='difficulty'?4:'course';});const m=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);return {comparison:NOA_LEARNING_PROGRESS_V27.compare(...m.rows),sample:m.sampleStatus};},property);expect(r.comparison.comparable).toBe(false);expect(r.comparison.delta).toBeNull();expect(r.sample).toContain('insuficiente');});
test('pureza con históricos y catálogo congelados; no duplica en renders',async({page})=>{await setup(page);expect(await page.evaluate(()=>{const freeze=o=>{if(o&&typeof o==='object'){Object.values(o).forEach(freeze);Object.freeze(o);}return o;};freeze(progressHistory);freeze(progressOptions);const before=JSON.stringify({db,progressHistory,progressOptions,storage:{...localStorage},cal:NOA_CALIBRATOR.get()});const a=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions),b=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);for(let i=0;i<3;i++)NOA_LEARNING_PROGRESS_UI_V27.render();return before===JSON.stringify({db,progressHistory,progressOptions,storage:{...localStorage},cal:NOA_CALIBRATOR.get()})&&JSON.stringify(a)===JSON.stringify(b)&&document.querySelectorAll('.noa-learning-progress').length===1;})).toBe(true);});
for(const width of [390,1365])test('interfaz y selección accesible '+width,async({page},info)=>{await page.setViewportSize({width,height:1000});await setup(page);await page.evaluate(()=>{db.attempts=progressHistory;renderExamStats();});await page.locator('#nav button[data-page="exam"]').click();const panel=page.locator('.noa-learning-progress');await panel.locator('select').nth(0).selectOption('0');await panel.locator('select').nth(1).selectOption('1');await expect(panel).toContainText('mejora descriptiva');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await panel.screenshot({path:info.outputPath('learning-'+width+'.png')});});
test('recarga, respaldo y restauración conservan historial y selección calculable',async({page})=>{await setup(page);await page.evaluate(()=>{db.attempts=progressHistory;save();});const backup=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(backup.ok).toBe(true);await page.reload();await page.waitForFunction(()=>!!window.NOA_LEARNING_PROGRESS_UI_V27);await page.locator('#nav button[data-page="exam"]').click();await expect(page.locator('.noa-learning-progress')).toContainText('2026-02-01');expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup.backup)).ok).toBe(true);expect(await page.evaluate(()=>db.attempts.length)).toBe(2);await expect(page.locator('.noa-learning-progress')).toHaveCount(1);});
test.describe('offline',()=>{test.use({serviceWorkers:'allow'});test('historial y módulos disponibles sin conexión',async({page,context})=>{await setup(page);await page.evaluate(()=>{db.attempts=progressHistory;save();});await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.NOA_LEARNING_PROGRESS_UI_V27);await page.locator('#nav button[data-page="exam"]').click();await expect(page.locator('.noa-learning-progress')).toContainText('2026-02-01');expect(await page.evaluate(()=>db.attempts.length)).toBe(2);});});

test('resumen ausente o contradictorio no se compara ni fabrica porcentaje',async({page})=>{await setup(page);const r=await page.evaluate(()=>{const a=structuredClone(progressHistory[0]);delete a.score;const b={...structuredClone(progressHistory[1]),score:0};return NOA_LEARNING_PROGRESS_V27.build([a,b],progressOptions);});expect(r.rows.every(x=>!x.comparable&&x.report.stats.percent===null)).toBe(true);});

test('límites temporales iguales permiten comparación; el tiempo utilizado no define equivalencia',async({page})=>{
 await setup(page);
 const result=await page.evaluate(()=>{
  setProgressTiming(progressHistory[0],60000,5000);
  setProgressTiming(progressHistory[1],60000,45000);
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return {comparison:NOA_LEARNING_PROGRESS_V27.compare(...model.rows),rows:model.rows};
 });
 expect(result.comparison).toMatchObject({comparable:true,change:'mejora descriptiva',delta:50});
 for(const row of result.rows)expect(row.conditions.timing).toMatchObject({state:'known',mode:'timed',durationMs:60000});
});

test('60 segundos y 60 minutos son incompatibles aunque el tiempo utilizado coincida',async({page})=>{
 await setup(page);
 const result=await page.evaluate(()=>{
  setProgressTiming(progressHistory[0],60000,10000);
  setProgressTiming(progressHistory[1],3600000,10000);
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return {comparison:NOA_LEARNING_PROGRESS_V27.compare(...model.rows),model};
 });
 expect(result.model.rows.every(row=>row.report.complete)).toBe(true);
 expect(result.model.rows.map(row=>row.report.stats.percent)).toEqual([50,100]);
 expect(result.model.sampleStatus).toContain('incompatibles');
 expect(result.comparison).toMatchObject({comparable:false,delta:null,change:null});
 expect(result.comparison.reasons.join(' ')).toContain('condiciones temporales diferentes');
});

test('cronometrado frente a declaración explícita sin límite no se compara',async({page})=>{
 await setup(page);
 const result=await page.evaluate(()=>{
  setProgressTiming(progressHistory[0]);
  progressHistory[1].timing={mode:'untimed'};
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return {comparison:NOA_LEARNING_PROGRESS_V27.compare(...model.rows),rows:model.rows};
 });
 expect(result.rows[1].conditions.timing).toMatchObject({state:'known',mode:'untimed',durationMs:null});
 expect(result.comparison).toMatchObject({comparable:false,delta:null});
});

test('dos declaraciones explícitas sin límite permiten comparación sin inventar duración cero',async({page})=>{
 await setup(page);
 const result=await page.evaluate(()=>{
  progressHistory.forEach(attempt=>{attempt.timing={mode:'untimed'};});
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return {comparison:NOA_LEARNING_PROGRESS_V27.compare(...model.rows),conditions:model.rows.map(row=>row.conditions.timing)};
 });
 expect(result.comparison.comparable).toBe(true);
 expect(result.conditions.every(timing=>timing.mode==='untimed'&&timing.state==='known'&&timing.durationMs===null)).toBe(true);
});

for(const [name,timing,state] of [
 ['ausente',undefined,'absent'],['null',null,'unknown'],['objeto vacío',{},'unknown'],
 ['sin duración',{version:26},'unknown'],['duración null',{version:26,durationMs:null},'unknown'],
 ['cero',{version:26,durationMs:0},'invalid'],['cadena',{version:26,durationMs:'60000'},'invalid'],
 ['fuera de rango',{version:26,durationMs:86400001},'invalid'],['no entero',{version:26,durationMs:60000.5},'invalid'],
 ['versión inválida',{version:25,durationMs:60000},'invalid'],['array',[],'invalid'],
 ['intervalo contradictorio',{version:26,durationMs:60000,startedAt:1000,deadlineAt:121000},'conflict'],
 ['sin límite con duración',{mode:'untimed',durationMs:60000},'conflict']
])test('configuración temporal no verificable: '+name,async({page})=>{
 await setup(page);
 const result=await page.evaluate(({timing,remove})=>{
  if(remove)delete progressHistory[1].timing;else progressHistory[1].timing=timing;
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return {row:model.rows[1],comparison:NOA_LEARNING_PROGRESS_V27.compare(...model.rows)};
 },{timing,remove:name==='ausente'});
 expect(result.row.conditions.timing).toMatchObject({state,mode:'unknown',durationMs:null});
 expect(result.row.report.stats.percent).toBe(100);
 expect(result.comparison).toMatchObject({comparable:false,delta:null});
 expect(result.row.reasons.join(' ')).toContain('Configuración temporal');
});

test('copias de un intento con límites contradictorios conservan créditos una sola vez y procedencia',async({page})=>{
 await setup(page);
 const row=await page.evaluate(()=>{
  const attempt=progressHistory[0];setProgressTiming(attempt,60000);
  const copy=structuredClone(attempt);setProgressTiming(copy,3600000);
  return NOA_LEARNING_PROGRESS_V27.build([attempt,copy],progressOptions).rows[0];
 });
 expect(row).toMatchObject({comparable:false,report:{stats:{total:2,credit:1}},conditions:{timing:{state:'conflict'}}});
 expect(row.conditions.timing.sources).toEqual(expect.arrayContaining(['attempts[0].timing.durationMs','attempts[1].timing.durationMs']));
});

test('dificultades coincidentes se verifican desde los tres campos con su procedencia',async({page})=>{
 await setup(page);
 const result=await page.evaluate(()=>{
  progressHistory.forEach(attempt=>attempt.answers.forEach(answer=>{
   answer.blueprint={difficulty:3};answer.blueprintSlot={difficulty:{level:3},sourceType:'official'};
  }));
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return {comparison:NOA_LEARNING_PROGRESS_V27.compare(...model.rows),conditions:model.rows[0].conditions.items[0]};
 });
 expect(result.comparison.comparable).toBe(true);
 expect(result.conditions.difficulty).toMatchObject({state:'known',value:3});
 expect(result.conditions.difficulty.sources).toEqual(['attempts[0].answers[0].difficulty','attempts[0].answers[0].blueprint.difficulty','attempts[0].answers[0].blueprintSlot.difficulty.level']);
 expect(result.conditions.sourceType).toMatchObject({state:'known',value:'official'});
});

for(const field of ['blueprint','blueprintSlot'])test('dificultad contradictoria dentro del reactivo: '+field,async({page})=>{
 await setup(page);
 const result=await page.evaluate(field=>{
  const answer=progressHistory[1].answers[0];
  if(field==='blueprint')answer.blueprint={difficulty:5};else answer.blueprintSlot={difficulty:{level:5}};
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return {comparison:NOA_LEARNING_PROGRESS_V27.compare(...model.rows),row:model.rows[1]};
 },field);
 const condition=result.row.conditions.items[0].difficulty;
 expect(condition).toMatchObject({state:'conflict',value:null});
 expect(condition.evidence.map(item=>item.value)).toEqual([3,5]);
 expect(condition.sources[1]).toContain(field+'.difficulty');
 expect(result.row.report.stats.percent).toBe(100);
 expect(result.comparison).toMatchObject({comparable:false,delta:null});
});

for(const sourceType of ['official','extended','course'])test('fuentes válidas coincidentes: '+sourceType,async({page})=>{
 await setup(page);
 const result=await page.evaluate(sourceType=>{
  progressHistory.forEach(attempt=>attempt.answers.forEach(answer=>{answer.sourceType=sourceType;answer.blueprintSlot={sourceType};}));
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return {comparison:NOA_LEARNING_PROGRESS_V27.compare(...model.rows),condition:model.rows[0].conditions.items[0].sourceType};
 },sourceType);
 expect(result.comparison.comparable).toBe(true);
 expect(result.condition).toMatchObject({state:'known',value:sourceType});
 expect(result.condition.sources).toHaveLength(2);
});

test('fuentes contradictorias no prueban equivalencia ni pierden procedencia',async({page})=>{
 await setup(page);
 const result=await page.evaluate(()=>{
  progressHistory[1].answers[0].blueprintSlot={sourceType:'course'};
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return {comparison:NOA_LEARNING_PROGRESS_V27.compare(...model.rows),condition:model.rows[1].conditions.items[0].sourceType};
 });
 expect(result.condition).toMatchObject({state:'conflict',value:null});
 expect(result.condition.evidence.map(item=>[item.source,item.value])).toEqual([
  ['attempts[1].answers[0].sourceType','official'],['attempts[1].answers[0].blueprintSlot.sourceType','course']
 ]);
 expect(result.comparison).toMatchObject({comparable:false,delta:null});
});

for(const [name,patch,field,state] of [
 ['ausente dificultad',{},'difficulty','absent'],['dificultad null',{difficulty:null},'difficulty','unknown'],
 ['dificultad cadena',{difficulty:'3'},'difficulty','invalid'],['dificultad fuera de rango',{difficulty:6},'difficulty','invalid'],
 ['dificultad array',{difficulty:[3]},'difficulty','invalid'],['dificultad objeto',{difficulty:{level:3}},'difficulty','invalid'],
 ['fuente ausente',{},'sourceType','absent'],['fuente null',{sourceType:null},'sourceType','unknown'],
 ['fuente ajena',{sourceType:'invented'},'sourceType','invalid'],['fuente array',{sourceType:['official']},'sourceType','invalid']
])test('metadatos no verificables: '+name,async({page})=>{
 await setup(page);
 const result=await page.evaluate(({patch,field})=>{
  const answer=progressHistory[1].answers[0];delete answer[field];Object.assign(answer,patch);
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return {comparison:NOA_LEARNING_PROGRESS_V27.compare(...model.rows),condition:model.rows[1].conditions.items[0][field]};
 },{patch,field});
 expect(result.condition).toMatchObject({state,value:null});
 expect(result.comparison).toMatchObject({comparable:false,delta:null});
});

test('metadatos válidos anidados siguen disponibles sin el campo superior',async({page})=>{
 await setup(page);
 const result=await page.evaluate(()=>{
  progressHistory.forEach(attempt=>attempt.answers.forEach(answer=>{
   delete answer.difficulty;delete answer.sourceType;answer.blueprintSlot={difficulty:{level:3},sourceType:'official'};
  }));
  const model=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
  return NOA_LEARNING_PROGRESS_V27.compare(...model.rows);
 });
 expect(result.comparable).toBe(true);
});

test('crédito parcial exacto y omisiones por tiempo sobreviven a duplicados y normalización',async({page})=>{
 await setup(page);
 const result=await page.evaluate(()=>{
  const attempt=makeProgressAttempt('partial','2026-03-01T12:00:00Z',0);
  attempt.answers[0]={...attempt.answers[0],interactionType:'drag_order',scoreFraction:1/3,ok:false};
  attempt.answers[1]={...attempt.answers[1],omitted:true,omissionReason:'timeout',presented:false,scoreFraction:0,ok:false};
  attempt.score=1/3;setProgressTiming(attempt,60000,60000);attempt.finishReason='timeout';
  return NOA_LEARNING_PROGRESS_V27.build([attempt,structuredClone(attempt)],progressOptions);
 });
 expect(result.rows).toHaveLength(1);
 expect(result.rows[0].report.stats).toMatchObject({total:2,answered:1,partial:1,incorrect:0,omitted:1,omittedByTime:1,credit:1/3,maxCredit:2,domain:{answered:1,knowledgeErrors:0,credit:1/3,maxCredit:1}});
 expect(result.rows[0].report.stats.percent).toBe((1/3)/2*100);
 expect(result.rows[0].conditions.items[0].difficulty.sources).toHaveLength(2);
});

test('proyecciones no comparten referencias mutables, no escriben y son deterministas',async({page})=>{
 await setup(page);
 expect(await page.evaluate(()=>{
  setProgressTiming(progressHistory[0]);setProgressTiming(progressHistory[1]);
  progressHistory[0].answers[0].blueprintSlot={difficulty:{level:5},sourceType:['official']};
  const collect=(value,set=new Set())=>{if(value&&typeof value==='object'&&!set.has(value)){set.add(value);Object.values(value).forEach(v=>collect(v,set));}return set;};
  const inputs=collect([progressHistory,progressOptions]);inputs.forEach(Object.freeze);
  const before=JSON.stringify(progressHistory),storage=JSON.stringify({...localStorage});
  let writes=0,ai=0;const native=Storage.prototype.setItem,callAI=window.callAI;
  Storage.prototype.setItem=function(){writes++;throw new Error('Escritura prohibida');};
  window.callAI=()=>{ai++;throw new Error('IA prohibida');};
  try{
   const first=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
   const second=NOA_LEARNING_PROGRESS_V27.build(progressHistory,progressOptions);
   const same=JSON.stringify(first)===JSON.stringify(second),shared=[...collect(first)].some(value=>inputs.has(value));
   for(let i=0;i<3;i++)NOA_LEARNING_PROGRESS_UI_V27.render();
   first.rows[0].conditions.items[0].difficulty.evidence[0].value=99;
   return same&&!shared&&writes===0&&ai===0&&before===JSON.stringify(progressHistory)&&storage===JSON.stringify({...localStorage});
  }finally{Storage.prototype.setItem=native;window.callAI=callAI;}
 })).toBe(true);
});

test('porcentajes numéricos en historial, gráfica, secciones y materias se formatean sin cambiar créditos',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{
  db.attempts=[makeProgressAttempt('a','2026-01-01T12:00:00Z',.75),makeProgressAttempt('b','2026-02-01T12:00:00Z',.625)];
  renderExamStats();
 });
 await page.locator('#nav button[data-page="exam"]').click();
 const panel=page.locator('.noa-learning-progress');
 await expect(panel.locator('.noa-progress-history')).toContainText('75%');
 await expect(panel.locator('.noa-progress-chart')).toContainText('62.5%');
 await panel.locator('select').nth(0).selectOption('0');await panel.locator('select').nth(1).selectOption('1');
 await expect(panel.locator('h5')).toContainText('62.5%');
 await expect(panel.locator('[role="status"]')).toContainText('75% → 62.5%');
 expect(await page.evaluate(()=>db.attempts.map(a=>a.score))).toEqual([1.5,1.25]);
});

for(const invalid of ['absent','null','NaN','Infinity'])test('porcentajes no calculables sin símbolo espurio: '+invalid,async({page})=>{
 await setup(page);
 await page.evaluate(invalid=>{
  const attempt=makeProgressAttempt('unknown','2026-03-01T12:00:00Z');
  const answer=attempt.answers[0];delete answer.ok;
  if(invalid==='absent')delete answer.scoreFraction;else answer.scoreFraction=invalid==='null'?null:invalid==='NaN'?NaN:Infinity;
  db.attempts=[attempt];renderExamStats();
 },invalid);
 await page.locator('#nav button[data-page="exam"]').click();
 const panel=page.locator('.noa-learning-progress');await panel.locator('select').nth(1).selectOption('0');
 await expect(panel.locator('.noa-progress-history')).toContainText('No calculable');
 await expect(panel.locator('h5')).toContainText('No calculable');
 await expect(panel).not.toContainText(/No calculable%|NaN%|undefined%/);
 await expect(panel.locator('.noa-progress-chart progress')).toHaveCount(0);
});
