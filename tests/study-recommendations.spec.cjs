const {test,expect}=require('@playwright/test');
const {openApp}=require('./fixtures.cjs');
test.beforeEach(async({page})=>{
 page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:8022'?r.continue():r.abort());
 await openApp(page);
 await page.evaluate(()=>{
  window.recOptions={referenceDate:'2026-06-20T12:00:00Z',catalog:NOA_ACADEMIC_RESULTS_V27.catalog()};
  window.recAttempt=(id,credits=[0,0],at='2026-06-01T12:00:00Z')=>({id,evidenceKind:'student',at,total:credits.length,score:credits.reduce((a,b)=>a+b,0),answers:credits.map((credit,i)=>({questionId:id+'-'+i,subject:'EXCOBA Primaria · Español',syllabusCode:'1.1.1',interactionType:'single_select',scoreFraction:credit,ok:credit===1}))});
  window.recHistory=[recAttempt('a'),recAttempt('b',[0,0],'2026-06-02T12:00:00Z')];
  window.recs=()=>NOA_STUDY_RECOMMENDATIONS_V27.build(recHistory,recOptions);
 });
});
test.afterEach(async({page})=>expect(page.errors).toEqual([]));
test('historial vacío y catálogo no verificado no inventan debilidades',async({page})=>{
 expect(await page.evaluate(()=>NOA_STUDY_RECOMMENDATIONS_V27.build([],recOptions).recommendations)).toEqual([]);
 expect(await page.evaluate(()=>NOA_STUDY_RECOMMENDATIONS_V27.build(recHistory,{...recOptions,catalog:{}}).recommendations)).toEqual([]);
});
test('reactivo aislado requiere evaluación y repaso corto',async({page})=>{
 const r=await page.evaluate(()=>{recHistory=[recAttempt('a',[1])];return recs().recommendations[0];});
 expect(r).toMatchObject({priority:'evaluar',evidence:{responses:1,quality:'insufficient'},review:{intervalDays:1}});
});
for(const [name,credits,priority] of [['errores',[0,0],'reforzar'],['parciales',[.5,.5],'reforzar'],['mixto',[1,0],'practicar'],['favorable',[1,1],'repasar']])test(name,async({page})=>{
 const r=await page.evaluate(credits=>{recHistory=recHistory.map((a,i)=>recAttempt(a.id,credits,a.at));return recs().recommendations[0];},credits);
 expect(r.priority).toBe(priority);expect(r.evidence).toMatchObject({responses:4,distinctQuestions:4,distinctAttempts:2,quality:'sufficient'});
 expect(r.evidence.credit).toBe(credits.reduce((a,b)=>a+b,0)*2);
});
test('copias de respuestas e intentos no cuentan como práctica independiente',async({page})=>{
 const r=await page.evaluate(()=>{recHistory[0].answers.push(structuredClone(recHistory[0].answers[0]));recHistory.push(structuredClone(recHistory[1]));return recs().recommendations[0];});
 expect(r.evidence).toMatchObject({responses:4,distinctQuestions:4,distinctAttempts:2,credit:0});
});
test('repetir IDs entre intentos conserva créditos y limita diversidad',async({page})=>{
 const r=await page.evaluate(()=>{recHistory[1].answers.forEach((a,i)=>a.questionId=recHistory[0].answers[i].questionId);return recs().recommendations[0];});
 expect(r).toMatchObject({priority:'evaluar',evidence:{responses:4,distinctQuestions:2}});
});
for(const mode of ['technical','answer-technical','unknown','absent','conflict','score-conflict','identity','catalog-code'])test('excluye '+mode,async({page})=>{
 const r=await page.evaluate(mode=>{
  for(const a of recHistory){
   if(mode==='technical')a.technicalTest=true;
   if(mode==='answer-technical')a.answers[0].technicalTest=true;
   if(mode==='unknown')a.evidenceKind='unknown';
   if(mode==='absent')delete a.evidenceKind;
   if(mode==='score-conflict')a.score=2;
   if(mode==='identity')a.answers.forEach(q=>delete q.questionId);
   if(mode==='catalog-code')a.answers.forEach(q=>q.syllabusCode='9.9.9');
  }
  if(mode==='conflict')recHistory=recHistory.flatMap(a=>[a,{...a,evidenceKind:'unknown',answers:[]}]);
  return recs();
 },mode);
 expect(r.recommendations).toEqual([]);
});
test('omisión por tiempo no es error ni evidencia de dominio',async({page})=>{
 const r=await page.evaluate(()=>{recHistory=[recAttempt('a',[0,0])];Object.assign(recHistory[0].answers[0],{omitted:true,omissionReason:'timeout'});return recs().recommendations[0];});
 expect(r.evidence).toMatchObject({responses:1,errors:1,credit:0,maxCredit:1});
});
for(const at of [null,'bad','2026-02-31T12:00:00Z'])test('fecha ausente o inválida: '+at,async({page})=>{
 const r=await page.evaluate(at=>{recHistory.forEach(a=>a.at=at);return recs().recommendations[0];},at);
 expect(r.evidence.lastPracticeAt).toBeNull();expect(r.review.dueAt).toBeNull();expect(r.evidence.responses).toBe(4);
});
test('prácticas posteriores a la referencia no influyen retrospectivamente',async({page})=>{
 expect(await page.evaluate(()=>{recHistory.forEach(a=>a.at='2026-06-30T12:00:00Z');return recs().recommendations;})).toEqual([]);
});
test('política configurable y antigüedad explican fechas y ranking',async({page})=>{
 const r=await page.evaluate(()=>{recOptions.policy={intervals:{reforzar:2,practicar:4,repasar:8}};return recs().recommendations[0];});
 expect(r.review).toMatchObject({intervalDays:2,dueAt:'2026-06-04T12:00:00.000Z',due:true});
 expect(r.rank.score).toBe(r.rank.components.errors+r.rank.components.partials+r.rank.components.overdue);
});
test('políticas y referencias inválidas se rechazan',async({page})=>{
 expect(await page.evaluate(()=>[{}, {referenceDate:'bad'}, {...recOptions,policy:{intervals:{repasar:99}}}, {...recOptions,policy:{unknown:{}}}].map(o=>{try{NOA_STUDY_RECOMMENDATIONS_V27.build([],o);return false;}catch{return true;}}))).toEqual([true,true,true,true]);
});
test('precisión parcial, independencia de subtemas y materias',async({page})=>{
 const r=await page.evaluate(()=>{
  recHistory=[recAttempt('a',[1/3,2/3,1])];recHistory[0].answers[1].syllabusCode='1.1.2';
  recHistory[0].answers[2].subject='EXCOBA Primaria · Matemáticas';recHistory[0].answers[2].syllabusCode='1.2.1';
  return recs().recommendations;
 });
 expect(r).toHaveLength(3);expect(r.find(x=>x.subtopicId==='1.1.1').evidence.credit).toBe(1/3);
 expect(r.find(x=>x.subtopicId==='1.1.2').evidence.credit).toBe(2/3);
});
test('pureza, determinismo, ausencia de alias y escrituras con entradas congeladas',async({page})=>{
 expect(await page.evaluate(()=>{
  const collect=(o,s=new Set())=>{if(o&&typeof o==='object'&&!s.has(o)){s.add(o);Object.values(o).forEach(v=>collect(v,s));}return s;};
  recOptions.policy={intervals:{reforzar:2}};
  const inputs=collect([recHistory,recOptions]);inputs.forEach(Object.freeze);
  const before=JSON.stringify({db,recHistory,recOptions,storage:{...localStorage},cal:NOA_CALIBRATOR.get()});
  const native=Storage.prototype.setItem,ai=window.callAI;
  Storage.prototype.setItem=()=>{throw Error('write');};window.callAI=()=>{throw Error('IA');};
  try{const a=recs(),b=recs();return JSON.stringify(a)===JSON.stringify(b)&&![...collect(a)].some(v=>inputs.has(v))&&before===JSON.stringify({db,recHistory,recOptions,storage:{...localStorage},cal:NOA_CALIBRATOR.get()});}
  finally{Storage.prototype.setItem=native;window.callAI=ai;}
 })).toBe(true);
});
test('45 reactivos preservan exactamente los créditos',async({page})=>{
 const r=await page.evaluate(()=>{recHistory=[recAttempt('45',Array(45).fill(.5))];return recs().recommendations[0];});
 expect(r).toMatchObject({priority:'evaluar',evidence:{responses:45,credit:22.5,maxCredit:45,distinctAttempts:1}});
});
test.describe('offline',()=>{test.use({serviceWorkers:'allow'});test('motor disponible sin conexión sin modificar historial',async({page,context})=>{
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);
 await page.reload();await page.waitForFunction(()=>!!window.NOA_STUDY_RECOMMENDATIONS_V27);
 expect(await page.evaluate(()=>NOA_STUDY_RECOMMENDATIONS_V27.build([],{referenceDate:'2026-06-20T12:00:00Z',catalog:NOA_ACADEMIC_RESULTS_V27.catalog()}).recommendations)).toEqual([]);
});});

for(const [credits,priority,interval] of [
 [[0,0],'reforzar',1],[[0,.5],'reforzar',1],[[.5,.5],'reforzar',1],[[1,.5],'practicar',3],[[1,1],'repasar',7]
])test('dificultad conjunta '+JSON.stringify(credits),async({page})=>{
 const r=await page.evaluate(credits=>{
  recHistory=recHistory.map(a=>recAttempt(a.id,credits,a.at));return recs().recommendations[0];
 },credits);
 expect(r.priority).toBe(priority);expect(r.review.intervalDays).toBe(interval);
 expect(r.evidence).toMatchObject({credit:2*(credits[0]+credits[1]),responses:4,distinctAttempts:2,distinctQuestions:4,quality:'sufficient'});
});

test('cada mejora individual conserva o reduce urgencia y ranking y no acorta repaso',async({page})=>{
 const result=await page.evaluate(()=>{
  const levels=[0,.5,1],order={evaluar:0,repasar:1,practicar:2,reforzar:3},failures=[];
  let checks=0;
  for(const policy of [{},{weights:{errors:1,partials:1},intervals:{reforzar:2,practicar:4,repasar:9}},{minResponses:5}]){
   const recommend=values=>NOA_STUDY_RECOMMENDATIONS_V27.build([
    recAttempt('a',values.slice(0,2)),recAttempt('b',values.slice(2),'2026-06-02T12:00:00Z')
   ],{...recOptions,policy}).recommendations[0];
   for(let n=0;n<81;n++){
    const values=[0,1,2,3].map(i=>levels[Math.floor(n/(3**i))%3]);
    const before=recommend(values);
    for(let i=0;i<4;i++)if(values[i]<1){
     const improved=[...values];improved[i]=values[i]===0?.5:1;
     const after=recommend(improved);checks++;
     if(order[after.priority]>order[before.priority]||after.review.intervalDays<before.review.intervalDays||after.rank.score>before.rank.score+1e-9||after.review.dueAt<before.review.dueAt)failures.push({values,improved,before,after});
    }
   }
  }
  return {checks,failures};
 });
 expect(result.checks).toBe(648);expect(result.failures).toEqual([]);
});

test('ranking ordena primero categoría; créditos y fechas originales intactos',async({page})=>{
 const result=await page.evaluate(()=>{
  recHistory.forEach(a=>a.at='2026-06-19T12:00:00Z');
  const favorable=[recAttempt('c',[1,1]),recAttempt('d',[1,1])];
  favorable.forEach(a=>a.answers.forEach(q=>q.syllabusCode='1.1.2'));recHistory.push(...favorable);
  const before=JSON.stringify(recHistory);
  const result=NOA_STUDY_RECOMMENDATIONS_V27.build(recHistory,{...recOptions,policy:{weights:{overdue:100}}});
  return {result,same:before===JSON.stringify(recHistory)};
 });
 expect(result.result.recommendations.map(r=>r.priority)).toEqual(['reforzar','repasar']);
 expect(result.result.recommendations[1].rank.score).toBeGreaterThan(result.result.recommendations[0].rank.score);
 expect(result.same).toBe(true);
});

for(const mode of ['invalid','absent','unknown','conflict','matching'])test('admisibilidad de formato: '+mode,async({page})=>{
 const result=await page.evaluate(mode=>{
  recHistory=recHistory.map(a=>recAttempt(a.id,[.5,.5],a.at));
  const q=recHistory[0].answers[0];
  if(mode==='invalid')q.interactionType='invented';
  if(mode==='absent')delete q.interactionType;
  if(mode==='unknown')q.interactionType=null;
  if(['conflict','matching'].includes(mode)){
   q.interactionType='drag_classify';
   recHistory[0].answers.push({...q,interactionType:mode==='conflict'?'inline_select':'drag_classify'});
  }
  const before=JSON.stringify(recHistory),result=recs();
  return {result,same:before===JSON.stringify(recHistory)};
 },mode);
 const accepted=mode==='matching';
 expect(result.result.excluded).toBe(accepted?0:1);
 expect(result.result.recommendations[0]).toMatchObject({priority:accepted?'reforzar':'evaluar',evidence:{responses:accepted?4:3,credit:accepted?2:1.5,quality:accepted?'sufficient':'insufficient'}});
 expect(result.same).toBe(true);
});
for(const format of ['single_select','drag_classify','inline_select','drag_order'])test('formato conocido permitido: '+format,async({page})=>{
 const r=await page.evaluate(format=>{recHistory.forEach(a=>a.answers.forEach(q=>q.interactionType=format));return recs();},format);
 expect(r.excluded).toBe(0);expect(r.recommendations[0].evidence.responses).toBe(4);
});

for(const group of ['root','intervals','weights'])for(const enumerable of [true,false])test('rechaza Symbol '+group+' enumerable='+enumerable,async({page})=>{
 const r=await page.evaluate(({group,enumerable})=>{
  const symbol=Symbol('extra'),nested={value:0},p=group==='root'?{}:{[group]:{}};
  const target=group==='root'?p:p[group];Object.defineProperty(target,symbol,{value:nested,enumerable});
  const freeze=o=>{if(o&&typeof o==='object'){Reflect.ownKeys(o).forEach(k=>freeze(o[k]));Object.freeze(o);}return o;};
  freeze(p);let rejected=0;
  for(let i=0;i<2;i++)try{NOA_STUDY_RECOMMENDATIONS_V27.build(recHistory,{...recOptions,policy:p});}catch(e){if(e instanceof RangeError)rejected++;}
  return {rejected,same:target[symbol]===nested&&nested.value===0};
 },{group,enumerable});
 expect(r).toEqual({rejected:2,same:true});
});
test('mutar política efectiva no afecta entrada, defaults ni llamadas posteriores',async({page})=>{
 expect(await page.evaluate(()=>{
  const policy={intervals:{reforzar:2},weights:{errors:3,partials:1}};
  Object.freeze(policy.intervals);Object.freeze(policy.weights);Object.freeze(policy);
  const input=JSON.stringify(policy),opts={...recOptions,policy};
  const a=NOA_STUDY_RECOMMENDATIONS_V27.build(recHistory,opts),before=JSON.stringify(a);
  a.policy.intervals.reforzar=30;a.policy.weights.errors=99;a.policy.minResponses=99;
  const b=NOA_STUDY_RECOMMENDATIONS_V27.build(recHistory,opts),c=recs();
  return input===JSON.stringify(policy)&&before===JSON.stringify(b)&&c.policy.intervals.reforzar===1&&c.policy.weights.errors===3;
 })).toBe(true);
});
test('objetos anidados inválidos y pesos que romperían monotonía se rechazan',async({page})=>{
 expect(await page.evaluate(()=>[
  {intervals:{reforzar:{days:1}}},{weights:{errors:{value:3}}},{weights:{errors:0,partials:1}}
 ].map(policy=>{try{NOA_STUDY_RECOMMENDATIONS_V27.build(recHistory,{...recOptions,policy});return false;}catch(e){return e instanceof RangeError;}}))).toEqual([true,true,true]);
});
