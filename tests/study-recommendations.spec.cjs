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
