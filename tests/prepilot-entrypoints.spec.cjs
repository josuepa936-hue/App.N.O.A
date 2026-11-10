const {test,expect}=require('@playwright/test');
const {openTimed,startMixed,timedQuestions}=require('./timed-exam-fixtures.cjs');
test.beforeEach(async({page})=>{
 page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await openTimed(page);
 await page.evaluate(()=>{
  window.entryBank=(missing=0)=>{db.questions=[];NOA_EXCOBA_V4.subjects.forEach((s,n)=>{const sid='entry-s-'+n,tid='entry-t-'+n;
   if(!db.subjects.some(s=>s.id===sid))db.subjects.push({id:sid,name:s.value});if(!db.topics.some(t=>t.id===tid))db.topics.push({id:tid,subjectId:sid,name:s.label,attempts:0,correct:0});
   for(let i=0;i<20-(n===2?missing:0);i++)db.questions.push({id:n+'-'+i,topicId:tid,text:'Pregunta '+n+' '+i,options:['A','B'],correct:0});});};
  window.entryEvidence=kind=>({id:'reload-study',evidenceKind:kind,score:1.5,total:3,at:'2026-05-31T12:00:00Z',answers:[
   {questionId:'cold-a',topicId:'test-topic',scoreFraction:1,ok:true,blueprint:{difficulty:3}},
   {questionId:'cold-b',topicId:'test-topic',scoreFraction:.5,ok:false,blueprint:{difficulty:3}},
   {questionId:'cold-c',topicId:'test-topic',omitted:true,scoreFraction:0,ok:false,blueprint:{difficulty:3}}
  ]});
  window.entrySnapshot=()=>JSON.stringify({db,examQueue,examAnswers,examIndex,examScore,timing:NOA_EXAM_SHELL.state().timing,storage:{...localStorage},declaration:document.getElementById('noaExamEvidenceKind').value});
 });
});
test.afterEach(async({page})=>expect(page.errors).toEqual([]));
for(const kind of ['student','technical_test','unknown','empty'])test('carga fría de indicadores: '+kind,async({page},info)=>{
 await page.evaluate(kind=>{db.attempts=kind==='empty'?[]:[entryEvidence(kind)];save();},kind);
 const before=await page.evaluate(()=>JSON.stringify({db,storage:{...localStorage}}));await page.reload();await page.clock.runFor(1600);
 await expect(page.locator('#sMastery')).toHaveText(kind==='student'?'75%':'Sin datos');
 await expect(page.locator('#subjectsWrap')).toContainText(kind==='student'?'75%':'Sin evidencia admisible');
 expect(await page.evaluate(()=>JSON.stringify({db,storage:{...localStorage}}))).toBe(before);
 if(kind==='student'){await page.locator('#nav button[data-page="dashboard"]').click();await page.screenshot({path:info.outputPath('dashboard-cold.png')});}
});
test('normalizador temporalmente ausente en bootstrap informa indisponibilidad y se recupera sin guardar',async({page})=>{
 await page.evaluate(()=>{db.attempts=[entryEvidence('student')];save();});
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{window.savedEntryNormalizer=window.NOA_RESULTS_NORMALIZATION_V27;delete window.NOA_RESULTS_NORMALIZATION_V27;},{once:true}));
 await page.reload();await page.clock.runFor(200);await expect(page.locator('#sMastery')).toHaveText('No disponible');
 const before=await page.evaluate(()=>JSON.stringify({db,storage:{...localStorage}}));
 await page.evaluate(()=>{window.NOA_RESULTS_NORMALIZATION_V27=savedEntryNormalizer;initializeLegacyAcademicIndicators();});
 await expect(page.locator('#sMastery')).toHaveText('75%');expect(await page.evaluate(()=>JSON.stringify({db,storage:{...localStorage}}))).toBe(before);
});
test('catálogo tardío no impide mostrar los topicId conocidos ni cambia un examen recuperado',async({page})=>{
 await page.evaluate(()=>{db.attempts=[entryEvidence('student')];save();});await startMixed(page,timedQuestions,true,1);
 const before=await page.evaluate(()=>({queue:examQueue,answers:examAnswers,index:examIndex,timing:NOA_EXAM_SHELL.state().timing}));
 await page.addInitScript(()=>Object.defineProperty(window,'NOA_EXCOBA_V4',{configurable:true,get:()=>undefined,set:value=>{window.savedEntryCatalog=value;}}));
 await page.reload();await page.clock.runFor(200);await expect(page.locator('#sMastery')).toHaveText('75%');
 expect(await page.evaluate(()=>({queue:examQueue,answers:examAnswers,index:examIndex,timing:NOA_EXAM_SHELL.state().timing}))).toEqual(before);
 await page.evaluate(()=>{Object.defineProperty(window,'NOA_EXCOBA_V4',{value:window.savedEntryCatalog,writable:true,configurable:true});});await page.clock.runFor(600);await expect(page.locator('#sMastery')).toHaveText('75%');
});
for(const bank of ['id','content','distribution','178','valid'])test('inicio manual rechaza 180: '+bank,async({page})=>{
 await page.evaluate(bank=>{entryBank(bank==='178'?2:0);if(bank==='id')db.questions=Array(180).fill(db.questions[0]);if(bank==='content')db.questions=db.questions.map(q=>({...q,text:'Mismo enunciado'}));if(bank==='distribution')db.questions=db.questions.map(q=>({...q,topicId:db.questions[0].topicId}));},bank);
 await startMixed(page,timedQuestions,true,1);
 await page.evaluate(()=>{document.getElementById('examCount').value='180';document.getElementById('noaExamEvidenceKind').value='student';window.beforeEntry=entrySnapshot();startExam();});
 expect(await page.evaluate(()=>entrySnapshot()===beforeEntry)).toBe(true);await expect(page.locator('#toast')).toContainText('Para 180 reactivos');
});
for(const route of ['begin','local-target','smart-target'])test('ruta intermedia rechaza 180 inválidos: '+route,async({page})=>{
 await page.evaluate(()=>entryBank(2));await startMixed(page,timedQuestions,true,1);
 await page.evaluate(async route=>{document.getElementById('noaExamEvidenceKind').value='student';window.beforeEntry=entrySnapshot();
  if(route==='begin')beginExamQueue(Array(180).fill(db.questions[0]),'Completo 180');
  if(route==='local-target')startExamForTarget('Biología',180);
  if(route==='smart-target')await smartStartExamForTarget('Biología',180);
 },route);expect(await page.evaluate(()=>entrySnapshot()===beforeEntry)).toBe(true);
});
test('180 específicos y su recuperación conservan distribución y declaración capturada',async({page})=>{
 await page.evaluate(()=>{entryBank();document.getElementById('noaExamEvidenceKind').value='student';startExcobaExam(180);});await page.clock.runFor(200);
 expect(await page.evaluate(()=>({total:examQueue.length,valid:validateLocalExcobaQueue(examQueue,180).valid,kind:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue).evidenceKind}))).toEqual({total:180,valid:true,kind:'student'});
 await page.reload();await page.clock.runFor(200);expect(await page.evaluate(()=>examQueue.length)).toBe(180);
});
const commands=[['NOA practica EXCOBA de 180 preguntas',180],['NOA inicia un simulacro EXCOBA de 180 reactivos',180],['NOA practica EXCOBA de 45 preguntas',45],['NOA practica EXCOBA',45],['NOA practica EXCOBA de 10 preguntas',10],['NOA practica EXCOBA de 181 preguntas',null],['NOA inicia un simulacro EXCOBA de Biología de 180 reactivos',180]];
for(const sufficient of [true,false])for(const [command,count] of commands)test('Comandos '+(sufficient?'suficiente: ':'insuficiente: ')+command,async({page})=>{
 await page.evaluate(sufficient=>{entryBank(sufficient?0:20);if(!sufficient)db.questions=[];document.getElementById('noaExamEvidenceKind').value='student';window.beforeEntry=entrySnapshot();},sufficient);
 await page.evaluate(command=>executeCommand(command),command);await page.clock.runFor(200);
 if(sufficient&&count){expect(await page.evaluate(()=>examQueue.length)).toBe(count);expect(await page.locator('#noaExamEvidenceKind').inputValue()).toBe('unknown');}
 else{expect(await page.evaluate(()=>entrySnapshot()===beforeEntry)).toBe(true);await expect(page.locator('#toast')).toContainText(count?'reactivos':'no soportada');}
});

test('comando de materia sin EXCOBA no trunca 180 a 18 ni llama IA',async({page})=>{
 await page.evaluate(()=>{window.beforeEntry=entrySnapshot();executeCommand('NOA inicia un examen de Biología de 180 reactivos');});
 expect(await page.evaluate(()=>entrySnapshot()===beforeEntry)).toBe(true);await expect(page.locator('#toast')).toContainText('no se cambiará la cantidad');
});
for(const mode of ['distribution','content','invalid'])test('beginExamQueue valida toda cola de 180: '+mode,async({page})=>{
 await page.evaluate(()=>entryBank());await startMixed(page,timedQuestions,true,1);
 await page.evaluate(mode=>{const queue=structuredClone(db.questions);if(mode==='distribution')queue.forEach(q=>q.topicId=queue[0].topicId);if(mode==='content')queue.forEach(q=>q.text='Duplicado');if(mode==='invalid')queue[0].correct=50;window.beforeEntry=entrySnapshot();beginExamQueue(queue,'Completo 180');},mode);
 expect(await page.evaluate(()=>entrySnapshot()===beforeEntry)).toBe(true);
});

for(const sufficient of [true,false])test('wrapper del Temario no trunca 180 a 60 con proveedor configurado: '+sufficient,async({page})=>{
 await page.evaluate(sufficient=>{entryBank();if(!sufficient)db.questions=[];db.settings.aiProvider='openai';document.getElementById('noaExamEvidenceKind').value='student';window.beforeEntry=entrySnapshot();executeCommand('NOA simulacro EXCOBA de Biología de 180 reactivos');},sufficient);
 await page.clock.runFor(200);expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});
 if(sufficient)expect(await page.evaluate(()=>examQueue.length)).toBe(180);else expect(await page.evaluate(()=>entrySnapshot()===beforeEntry)).toBe(true);
});
