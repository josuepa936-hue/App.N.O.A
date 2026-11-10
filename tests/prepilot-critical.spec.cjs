const {test,expect}=require('@playwright/test');
const {openTimed,startMixed,answerTimed,expire,timedQuestions}=require('./timed-exam-fixtures.cjs');
test.beforeEach(async({page})=>{
 page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')page.errors.push(m.text());});page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await openTimed(page);
 await page.evaluate(()=>{
  window.seedLegacyBank=(missing=0)=>{
   db.questions=[];
   NOA_EXCOBA_V4.subjects.forEach((s,n)=>{
    const sid='legacy-subject-'+n,tid='legacy-topic-'+n;
    if(!db.subjects.some(s=>s.id===sid))db.subjects.push({id:sid,name:s.value});
    if(!db.topics.some(t=>t.id===tid))db.topics.push({id:tid,subjectId:sid,name:s.label,attempts:0,correct:0});
    for(let i=0;i<20-(n===2?missing:0);i++)db.questions.push({id:n+'-'+i,topicId:tid,text:'Pregunta determinista '+n+' '+i,options:['Correcta '+n+' '+i,'Alternativa'],correct:0});
   });save();
  };
  window.studentLegacy=(id='study',kind='student')=>({id,evidenceKind:kind,at:'2026-05-31T12:00:00Z',score:1.5,total:3,answers:[
   {questionId:id+'a',topicId:'test-topic',scoreFraction:1,ok:true,blueprint:{difficulty:3}},
   {questionId:id+'b',topicId:'test-topic',scoreFraction:.5,ok:false,blueprint:{difficulty:3}},
   {questionId:id+'c',topicId:'test-topic',scoreFraction:0,ok:false,omitted:true,omissionReason:'timeout',blueprint:{difficulty:3}}
  ]});
 });
});
test.afterEach(async({page})=>expect(page.errors).toEqual([]));
for(const mode of ['178','insufficient','duplicate-id','duplicate-content','invalid'])test('180 rechaza banco '+mode+' sin consumir procedencia ni sesión',async({page})=>{
 await page.evaluate(mode=>{
  seedLegacyBank(mode==='178'?2:mode==='insufficient'?1:0);
  if(mode==='duplicate-id')db.questions[0].id=db.questions[1].id;
  if(mode==='duplicate-content')db.questions[0]={...db.questions[1],id:'new-id'};
  if(mode==='invalid')db.questions[0].correct=20;
 },mode);
 await page.locator('#noaExamEvidenceKind').selectOption('student');
 await startMixed(page,timedQuestions,true,1);
 await page.evaluate(()=>{document.getElementById('noaExamEvidenceKind').value='technical_test';window.beforeLegacy=JSON.stringify({db,examQueue,examAnswers,examScore,clock:NOA_EXAM_SHELL.state().timing,storage:{...localStorage}});startExcobaExam(180);});
 expect(await page.evaluate(()=>beforeLegacy===JSON.stringify({db,examQueue,examAnswers,examScore,clock:NOA_EXAM_SHELL.state().timing,storage:{...localStorage}}))).toBe(true);
 expect(await page.evaluate(()=>document.getElementById('noaExamEvidenceKind').value)).toBe('technical_test');
 await expect(page.locator('#toast')).toContainText('Faltan reactivos válidos únicos');
});
test('180 válidos inicia con distribución 40/80/60 y veinte por materia',async({page})=>{
 await page.evaluate(()=>seedLegacyBank());await page.locator('#noaExamEvidenceKind').selectOption('student');
 await page.locator('#nav button[data-page="voice"]').click();await page.getByRole('button',{name:'Entrenamiento completo 180',exact:true}).click();await page.clock.runFor(200);
 const result=await page.evaluate(()=>({count:examQueue.length,unique:new Set(examQueue.map(q=>q.id)).size,bySubject:NOA_EXCOBA_V4.subjects.map(s=>examQueue.filter(q=>subjectBy(topicBy(q.topicId).subjectId).name===s.value).length),kind:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue).evidenceKind,history:db.attempts.length}));
 expect(result).toEqual({count:180,unique:180,bySubject:Array(9).fill(20),kind:'student',history:0});
});
test('Comandos de 180 pasan por la validación y no consumen declaración',async({page})=>{
 await page.evaluate(()=>{seedLegacyBank(2);document.getElementById('noaExamEvidenceKind').value='student';executeCommand('NOA inicia un simulacro EXCOBA de 180 preguntas');});
 expect(await page.evaluate(()=>({count:examQueue.length,kind:document.getElementById('noaExamEvidenceKind').value,attempts:db.attempts.length}))).toEqual({count:0,kind:'student',attempts:0});
 await expect(page.locator('#toast')).toContainText('faltan 2');
});
test('45 local conserva cinco por materia y explicita entrenamiento',async({page})=>{
 await page.evaluate(()=>{seedLegacyBank();startExcobaExam(45);});await page.clock.runFor(200);
 expect(await page.evaluate(()=>examQueue.length)).toBe(45);await expect(page.locator('#toast')).toContainText('sin equivalencia oficial');
});
for(const kind of ['student','technical_test','unknown','legacy'])test('selección de evidencia '+kind+' conserva créditos y registros',async({page})=>{
 const result=await page.evaluate(kind=>{
  const a=studentLegacy('evidence',kind);if(kind==='legacy')delete a.evidenceKind;
  db.attempts=[a];db.topics[0].correct=999;db.topics[0].attempts=999;
  const before=JSON.stringify(db);renderAll();const cal=NOA_CALIBRATOR.get();
  return {sample:cal.sample,credit:cal.stats[3].credit,mastery:mastery(db.topics[0]),same:before===JSON.stringify(db),label:document.getElementById('sMastery').textContent};
 },kind);
 expect(result.same).toBe(true);expect(result.sample).toBe(kind==='student'?2:0);expect(result.credit).toBe(kind==='student'?1.5:0);expect(result.mastery).toBe(kind==='student'?75:null);
 if(kind!=='student')expect(result.label).toBe('Sin datos');
});
for(const mode of ['empty-technical','empty-unknown','technical-answer','bad-credit','incomplete','difficulty-conflict','credit-conflict','invalid-provenance','invalid-answers','difficulty-object','identical'])test('históricos y copias: '+mode,async({page})=>{
 const r=await page.evaluate(mode=>{
  const a=studentLegacy();db.attempts=[a];
  if(mode==='identical')db.attempts.push(structuredClone(a));
  if(mode==='empty-technical'||mode==='empty-unknown')db.attempts.push({id:a.id,evidenceKind:mode==='empty-technical'?'technical_test':'unknown',answers:[]});
  if(mode==='technical-answer')a.answers[0].technicalTest=true;
  if(mode==='bad-credit')a.answers[0].scoreFraction=NaN;
  if(mode==='incomplete')a.total=10;
  if(mode==='invalid-answers')a.answers={};
  if(mode==='credit-conflict')a.answers[0].ok=false;
  if(mode==='invalid-provenance')a.answers[0].technicalTest='true';
  if(mode==='difficulty-conflict')a.answers.forEach(a=>a.difficulty=4);
  if(mode==='difficulty-object')a.answers.forEach(a=>a.blueprintSlot={difficulty:{level:3}});
  const before=JSON.stringify(db);const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};freeze(db.attempts);
  const c=NOA_CALIBRATOR.get();const first=JSON.stringify(c);const again=JSON.stringify(NOA_CALIBRATOR.get());
  return {sample:c.sample,credit:c.stats[3].credit,same:before===JSON.stringify(db),deterministic:first===again};
 },mode);
 expect(r.same&&r.deterministic).toBe(true);expect(r.sample).toBe(['identical','difficulty-object'].includes(mode)?2:0);
});
test('nuevo examen técnico, respaldo y recarga no alteran indicadores académicos',async({page})=>{
 await page.evaluate(()=>{db.attempts=[studentLegacy()];save();window.calBefore=JSON.stringify(NOA_CALIBRATOR.get());window.masterBefore=mastery(db.topics[0]);});
 await page.locator('#noaExamEvidenceKind').selectOption('technical_test');await startMixed(page,timedQuestions,true,1);await answerTimed(page,timedQuestions[0]);
 // expire helper expects one attempt; this case already has one historical attempt.
 const delta=await page.evaluate(()=>NOA_EXAM_SHELL.state().timing.deadlineAt-Date.now());await page.clock.fastForward(delta+1);await expect.poll(()=>page.evaluate(()=>db.attempts.length)).toBe(2);await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.whenIdle());await page.clock.runFor(200);
 expect(await page.evaluate(()=>JSON.stringify(NOA_CALIBRATOR.get())===calBefore&&mastery(db.topics[0])===masterBefore)).toBe(true);
 const backup=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(backup.ok).toBe(true);await page.reload();await page.clock.runFor(200);
 expect(await page.evaluate(()=>NOA_CALIBRATOR.get().sample)).toBe(2);expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup.backup)).ok).toBe(true);expect(await page.evaluate(()=>NOA_CALIBRATOR.get().sample)).toBe(2);
});
test.describe('offline',()=>{test.use({serviceWorkers:'allow'});test('evidencia y validación disponibles offline y en móvil',async({page,context})=>{
 await page.evaluate(()=>{db.attempts=[studentLegacy()];save();});await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await page.clock.runFor(200);await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>NOA_CALIBRATOR.get().sample)).toBe(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>startExcobaExam(180));expect(await page.evaluate(()=>examQueue.length)).toBe(0);
});});

 test('entrenamiento parcial conserva acceso sin anunciar un examen completo',async({page})=>{
 await page.evaluate(()=>{seedLegacyBank(2);startExamForTarget('Secundaria Español',30);});await page.clock.runFor(200);
 expect(await page.evaluate(()=>examQueue.length)).toBe(18);await expect(page.locator('#toast')).toContainText('Entrenamiento parcial');
});

test('identidad textual conserva diferencias científicas de mayúsculas',async({page})=>{
 await page.evaluate(()=>{seedLegacyBank();db.questions[0].text=db.questions[1].text='Identifica la notación';db.questions[0].options=['CO','X'];db.questions[1].options=['Co','X'];startExcobaExam(180);});await page.clock.runFor(200);
 expect(await page.evaluate(()=>examQueue.length)).toBe(180);
});
test('última práctica usa el instante real y conserva las zonas registradas',async({page})=>{
 const result=await page.evaluate(()=>{const a=studentLegacy('offset'),b=studentLegacy('utc');a.at='2026-05-31T08:00:00-05:00';b.at='2026-05-31T12:30:00Z';db.attempts=[a,b];const before=JSON.stringify(db.attempts);const projected=academicTopic(db.topics[0]);return {last:projected.lastSeen,same:JSON.stringify(db.attempts)===before};});
 expect(result).toEqual({last:'2026-05-31T08:00:00-05:00',same:true});
});
