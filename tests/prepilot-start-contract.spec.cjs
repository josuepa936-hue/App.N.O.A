const {test,expect}=require('@playwright/test');
const {openTimed,startMixed,answerTimed,timedQuestions}=require('./timed-exam-fixtures.cjs');
test.beforeEach(async({page})=>{
 page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await openTimed(page);
 await page.evaluate(()=>{
  window.contractBank=(missing=0)=>{db.questions=[];NOA_EXCOBA_V4.subjects.forEach((s,n)=>{const sid='contract-s'+n,tid='contract-t'+n;if(!db.subjects.some(s=>s.id===sid))db.subjects.push({id:sid,name:s.value});if(!db.topics.some(t=>t.id===tid))db.topics.push({id:tid,subjectId:sid,name:s.label,attempts:0,correct:0});for(let i=0;i<20-(n===2?missing:0);i++)db.questions.push({id:n+'-'+i,topicId:tid,text:'Pregunta '+n+' '+i,options:['A','B'],correct:0});});};
  window.contractSnapshot=()=>JSON.stringify({db,examQueue,examAnswers,examIndex,examScore,clock:NOA_EXAM_SHELL.state(),drafts:[...NOA_EXAM_NAVIGATION.drafts],storage:{...localStorage},pending:document.getElementById('noaExamEvidenceKind').value});
 });
});
test.afterEach(async({page})=>expect(page.errors).toEqual([]));
test('regresión contextual: sesión 5 no sustituye 180 preguntas',async({page})=>{
 await page.evaluate(()=>{contractBank();document.getElementById('noaExamEvidenceKind').value='student';executeCommand('NOA para mi sesión 5 practica EXCOBA de 180 preguntas');});
 expect(await page.evaluate(()=>examQueue.length)).toBe(180);
});
test('regresión cola: 178 anunciados como completos preservan examen activo',async({page})=>{
 await page.evaluate(()=>contractBank(2));await startMixed(page,timedQuestions,true,1);await answerTimed(page,timedQuestions[0]);
 await page.evaluate(()=>{document.getElementById('noaExamEvidenceKind').value='student';window.beforeContract=contractSnapshot();beginExamQueue(db.questions,'Entrenamiento completo 180');});
 expect(await page.evaluate(()=>contractSnapshot()===beforeContract)).toBe(true);
});
const commands=[
 ['NOA para mi sesión 5 practica EXCOBA de 180 preguntas',180],
 ['NOA practica EXCOBA 2026 de 180 reactivos',180],
 ['NOA practica EXCOBA de 180 preguntas para la sesión 5',180],
 ['NOA practica EXCOBA de 45 preguntas',45],['NOA practica EXCOBA de 10 reactivos',10],
 ['NOA practica EXCOBA',45],['NOA practica EXCOBA de 45 preguntas y 180 reactivos',null],
 ['NOA practica EXCOBA de 181 preguntas',null],['NOA practica EXCOBA preguntas: 180',180],
 ['NOA practica EXCOBA 180',180],['NOA practica EXCOBA para sesión 5',45],
 ['NOA practica EXCOBA versión v27.4 fecha 10/11/2026',45],
 ['NOA practica EXCOBA 45 y 180',null],['NOA practica EXCOBA de -180 preguntas',null],
 ['NOA practica EXCOBA de 5.5 preguntas',null],['NOA practica EXCOBA 180 preguntas y 180 reactivos',180],
 ['NOA practica EXCOBA con el indicador H5',null],['NOA practica EXCOBA preguntas: 180a',null],
 ['NOA practica EXCOBA 2026',null],['NOA practica EXCOBA para el año 2026',45]
];
for(const sufficient of [true,false])for(const [command,count] of commands)test('cantidad contextual '+sufficient+': '+command,async({page})=>{
 await page.evaluate(sufficient=>{contractBank(sufficient?0:2);if(!sufficient)db.questions=[];document.getElementById('noaExamEvidenceKind').value='student';window.beforeContract=contractSnapshot();},sufficient);
 await page.evaluate(command=>executeCommand(command),command);await page.clock.runFor(200);
 if(sufficient&&count){expect(await page.evaluate(()=>examQueue.length)).toBe(count);expect(await page.locator('#noaExamEvidenceKind').inputValue()).toBe('unknown');}
 else expect(await page.evaluate(()=>contractSnapshot()===beforeContract)).toBe(true);
 expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});
});
for(const n of [178,179,180])for(const explicit of [false,true])test('contrato completo verifica cantidad '+n+', explícito '+explicit,async({page})=>{
 await page.evaluate(()=>contractBank());await startMixed(page,timedQuestions,true,1);await answerTimed(page,timedQuestions[0]);
 const starts=n===180&&explicit;
 await page.evaluate(({n,explicit})=>{document.getElementById('noaExamEvidenceKind').value='student';window.beforeContract=contractSnapshot();beginExamQueue(db.questions.slice(0,n),'Entrenamiento completo 180',explicit?{version:1,mode:'excoba-local',requestedCount:180,completion:'complete'}:undefined);},{n,explicit});
 if(starts){expect(await page.evaluate(()=>examQueue.length)).toBe(180);await expect(page.locator('#toast')).toContainText('completo 180');}
 else expect(await page.evaluate(()=>contractSnapshot()===beforeContract)).toBe(true);
});
for(const defect of ['ids','content','distribution','answer','partial-mode','declared-count','bad-version'])test('contrato rechaza '+defect+' antes de reemplazar sesión',async({page})=>{
 await page.evaluate(()=>contractBank());await startMixed(page,timedQuestions,true,1);await answerTimed(page,timedQuestions[0]);
 await page.evaluate(defect=>{const queue=structuredClone(db.questions),intent={version:1,mode:'excoba-local',requestedCount:180,completion:'complete'};
  if(defect==='ids')queue[1].id=queue[0].id;if(defect==='content')queue.forEach(q=>q.text='Duplicado');if(defect==='distribution')queue.forEach(q=>q.topicId=queue[0].topicId);if(defect==='answer')queue[0].correct=99;
  if(defect==='partial-mode'){intent.mode='manual';intent.completion='partial';}if(defect==='declared-count')intent.requestedCount=179;if(defect==='bad-version')intent.version=2;
  document.getElementById('noaExamEvidenceKind').value='student';window.beforeContract=contractSnapshot();beginExamQueue(queue,'Etiqueta arbitraria',intent);
 },defect);expect(await page.evaluate(()=>contractSnapshot()===beforeContract)).toBe(true);
});
test('contrato genera etiqueta, calcula disponible y no muta entradas congeladas',async({page})=>{
 const result=await page.evaluate(()=>{contractBank();const queue=structuredClone(db.questions),intent={version:1,mode:'excoba-local',requestedCount:180,completion:'complete'};
  const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};freeze(queue);freeze(intent);const before=JSON.stringify({queue,intent});
  const a=resolveExamStart(queue,'Soy oficial certificado',intent),b=resolveExamStart(queue,'Otro nombre',intent);
  return {same:before===JSON.stringify({queue,intent}),label:a.label,deterministic:JSON.stringify(a)===JSON.stringify(b),contract:a.contract};
 });expect(result.same&&result.deterministic).toBe(true);expect(result.label).toContain('sin equivalencia oficial');expect(result.label).not.toContain('certificado');
 expect(result.contract).toEqual({version:1,mode:'excoba-local',requestedCount:180,availableCount:180,completion:'complete'});
});
test('parcial anterior legítimo y contrato de 10 siguen disponibles con etiqueta segura',async({page})=>{
 await page.evaluate(()=>{contractBank();beginExamQueue(db.questions.slice(0,10),'Mi examen');});await page.clock.runFor(200);expect(await page.evaluate(()=>examQueue.length)).toBe(10);await expect(page.locator('#toast')).toContainText('Entrenamiento parcial local 10');
 await page.evaluate(()=>beginExamQueue(db.questions.slice(0,10),'Completo oficial 180',{version:1,mode:'manual',requestedCount:10,completion:'partial'}));await page.clock.runFor(200);
 expect(await page.evaluate(()=>examQueue.length)).toBe(10);await expect(page.locator('#toast')).not.toContainText('completo');
});
test('faltante parcial necesita permiso explícito y muestra cantidades distintas',async({page})=>{
 const r=await page.evaluate(()=>{contractBank();const q=db.questions.slice(0,8),intent={version:1,mode:'legacy-partial',requestedCount:10,completion:'partial'};return {strict:resolveExamStart(q,'',intent),partial:resolveExamStart(q,'',{...intent,allowShortfall:true})};});
 expect(r.strict.valid).toBe(false);expect(r.partial.contract.availableCount).toBe(8);expect(r.partial.label).toContain('8 de 10 solicitados');
});
test('180 legítimos recuperan índice, respuestas, crédito y procedencia sin duplicar',async({page})=>{
 await page.evaluate(()=>{contractBank();document.getElementById('noaExamEvidenceKind').value='student';startExcobaExam(180);});await page.clock.runFor(200);
 await page.locator('#examBox button[onclick="answerExam(0)"]').click();await page.locator('#examBox button[onclick="nextExam()"]').click();await page.clock.runFor(200);
 const before=await page.evaluate(()=>({queue:examQueue,index:examIndex,score:examScore,answers:examAnswers,kind:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue)}));
 await page.reload();await page.clock.runFor(200);
 expect(await page.evaluate(()=>({queue:examQueue,index:examIndex,score:examScore,answers:examAnswers,kind:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue)}))).toEqual(before);
 expect(await page.evaluate(()=>db.attempts.length)).toBe(0);
});
for(const command of ['NOA para mi sesión 5 inicia examen de Biología de 180 reactivos','NOA inicia examen de Biología de 45 preguntas y 180 reactivos'])test('wrapper por materia interpreta contexto y rechaza: '+command,async({page})=>{
 await page.evaluate(command=>{window.beforeContract=contractSnapshot();executeCommand(command);},command);expect(await page.evaluate(()=>contractSnapshot()===beforeContract)).toBe(true);expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});
});

for(const route of ['local','smart'])for(const value of [0,NaN])test('petición parcial inválida no toca estado: '+route+' '+value,async({page})=>{
 await startMixed(page,timedQuestions,true,1);await answerTimed(page,timedQuestions[0]);
 await page.evaluate(async({route,value})=>{window.beforeContract=contractSnapshot();if(route==='local')startExamForTarget('Biología',value);else await smartStartExamForTarget('Biología',value);},{route,value});
 expect(await page.evaluate(()=>contractSnapshot()===beforeContract)).toBe(true);expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});
});

test('recuperación rechazada de completo178 conserva el checkpoint original',async({page})=>{
 await page.evaluate(()=>{contractBank();document.getElementById('noaExamEvidenceKind').value='student';startExcobaExam(180);});await page.clock.runFor(200);
 const seed=await page.evaluate(()=>{const stored=structuredClone(db);stored.activeExam.queue=stored.activeExam.queue.slice(0,178);stored.activeExam.title='Entrenamiento completo 180';return {key:KEY,raw:JSON.stringify(stored),checkpoint:JSON.stringify(stored.activeExam)};});
 // Seed the next document after beforeunload persists the current valid runtime.
 await page.addInitScript(({key,raw})=>localStorage.setItem(key,raw),seed);const before=seed.checkpoint;
 await page.reload();await page.clock.runFor(200);expect(await page.evaluate(()=>examQueue.length)).toBe(0);
 expect(await page.evaluate(()=>JSON.stringify(db.activeExam))).toBe(before);expect(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem(KEY)).activeExam))).toBe(before);
 expect(await page.evaluate(()=>db.attempts.length)).toBe(0);
});

for(const command of ['NOA en mi sesión 5 inicia un examen de Historia de 180 reactivos','NOA inicia un examen de Historia de 45 preguntas y 180 reactivos','NOA inicia un examen de Historia de 181 preguntas'])test('parser base sin wrapper de materia preserva rechazo: '+command,async({page})=>{
 await startMixed(page,timedQuestions,true,1);await answerTimed(page,timedQuestions[0]);
 await page.evaluate(command=>{document.getElementById('noaExamEvidenceKind').value='student';window.beforeContract=contractSnapshot();executeCommand(command);},command);
 expect(await page.evaluate(()=>contractSnapshot()===beforeContract)).toBe(true);expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});
});

for(const command of ['NOA simulacro EXCOBA de Biología del temario 2026 de 180 preguntas','NOA crea guía para un examen EXCOBA de Biología de 180 preguntas'])test('dominios ambiguos no caen en generadores anteriores: '+command,async({page})=>{
 await page.evaluate(command=>{db.settings.aiProvider='openai';window.beforeContract=contractSnapshot();executeCommand(command);},command);
 expect(await page.evaluate(()=>contractSnapshot()===beforeContract)).toBe(true);expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});await expect(page.locator('#toast')).toContainText('ambigua');
});
