const {test,expect}=require('@playwright/test');
const {openTimed,startMixed,timedQuestions,answerTimed,answerAll,navigateTimed,expire}=require('./timed-exam-fixtures.cjs');

test.beforeEach(async({page})=>{
 page.provenanceErrors=[];page.externalRequests=[];
 page.on('pageerror',error=>page.provenanceErrors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')page.provenanceErrors.push(message.text());});
 page.on('dialog',dialog=>dialog.accept());
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!=='http://127.0.0.1:8022'||!['GET','HEAD'].includes(request.method())){
   page.externalRequests.push(request.url());return route.abort();
  }
  return route.continue();
 });
 await openTimed(page);
});
test.afterEach(async({page})=>{
 expect(page.provenanceErrors).toEqual([]);expect(page.externalRequests).toEqual([]);
 expect(await page.evaluate(()=>window.__timedForbidden||{ai:0,fetch:0})).toEqual({ai:0,fetch:0});
});

// The shell hides setup during an active exam; also test changes to that pending value.
const choose=(page,kind)=>page.locator('#noaExamEvidenceKind').selectOption(kind,{force:true});
const current=page=>page.evaluate(()=>({
 context:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue),checkpoint:db.activeExam,
 attempts:db.attempts,selection:document.getElementById('noaExamEvidenceKind').value
}));
async function manualClose(page){
 await answerAll(page);
 await page.evaluate(()=>NOA_EXAM_NAVIGATION.finishExam());
 await page.clock.runFor(200);
 await expect.poll(()=>page.evaluate(()=>db.attempts.length)).toBe(1);
}
async function reload(page){
 await page.reload();await page.waitForFunction(()=>!!window.NOA_STUDY_PROVENANCE_V27&&!!window.NOA_EXAM_RECOVERY);
 await page.clock.runFor(200);
 await expect(page.locator('#examBox')).toBeVisible();
}

for(const kind of ['student','unknown','technical_test'])test('cierre manual conserva declaración '+kind,async({page})=>{
 await expect(page.locator('#noaExamEvidenceKind')).toHaveValue('unknown');
 if(kind!=='unknown')await choose(page,kind);
 await startMixed(page,timedQuestions,false);
 expect((await current(page)).context.evidenceKind).toBe(kind);
 await expect(page.locator('#noaExamEvidenceKind')).toHaveValue('unknown');
 await manualClose(page);
 const result=await page.evaluate(()=>{
  const attempt=db.attempts[0];
  const normalized=NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(attempt,{catalog:NOA_ACADEMIC_RESULTS_V27.catalog(),evidenceKind:'student'});
  const row=NOA_LEARNING_PROGRESS_V27.build(db.attempts,{catalog:NOA_ACADEMIC_RESULTS_V27.catalog()}).rows[0];
  return {attempt,normalized,row};
 });
 expect(result.attempt).toMatchObject({evidenceKind:kind,score:4,total:4});
 expect(result.normalized.records.every(record=>record.domainEligible===(kind==='student'))).toBe(true);
 expect(result.row.kind).toBe(kind);
 expect(result.row.report.stats.domain.answered).toBe(kind==='student'?4:0);
 const label=kind==='student'?'estudiante declarada':kind==='technical_test'?'datos técnicos de prueba':'desconocida';
 await expect(page.locator('#examBox .noa-academic-panel')).toContainText('Procedencia: '+label);
});

for(const kind of ['student','unknown','technical_test'])test('vencimiento conserva procedencia y parcial: '+kind,async({page})=>{
 await choose(page,kind);await startMixed(page);
 await navigateTimed(page,1);await answerTimed(page,timedQuestions[1],'partial');
 const result=await expire(page);
 expect(result.attempts).toHaveLength(1);
 expect(result.attempts[0]).toMatchObject({evidenceKind:kind,score:.5,finishReason:'timeout'});
 expect(result.attempts[0].answers.filter(answer=>answer.omitted)).toHaveLength(3);
 const stats=await page.evaluate(()=>NOA_ACADEMIC_STATS_V27.aggregate(db.attempts[0],{evidenceKind:db.attempts[0].evidenceKind}).stats);
 expect(stats).toMatchObject({partial:1,omitted:3,omittedByTime:3,credit:.5,incorrect:0});
 expect(stats.domain.answered).toBe(kind==='student'?1:0);
});

for(const timed of [true,false])for(const kind of ['student','unknown','technical_test'])test('recarga activa '+kind+' '+(timed?'cronometrada':'sin tiempo'),async({page})=>{
 await choose(page,kind);await startMixed(page,timedQuestions,timed);
 if(timed){await navigateTimed(page,1);await answerTimed(page,timedQuestions[1],'partial');}
 await page.evaluate(()=>NOA_EXAM_RECOVERY.save());
 expect((await current(page)).checkpoint.evidenceKind).toBe(kind);
 await choose(page,kind==='student'?'technical_test':'student');
 await reload(page);
 expect((await current(page)).context.evidenceKind).toBe(kind);
 if(timed){
  const result=await expire(page);expect(result.attempts[0]).toMatchObject({evidenceKind:kind,score:.5});
 }else{await manualClose(page);expect((await current(page)).attempts[0].evidenceKind).toBe(kind);}
});

test('declaración de próximo examen no modifica la sesión y se consume una sola vez',async({page})=>{
 await choose(page,'student');await startMixed(page);
 await choose(page,'technical_test');
 expect((await current(page)).context.evidenceKind).toBe('student');
 await page.evaluate(()=>{document.getElementById('noaExamDurationMinutes').value='0';});
 const error=await page.evaluate(queue=>{try{NOA_MIXED_EXAM.start(queue);return null;}catch(error){return error.message;}},timedQuestions);
 expect(error).toMatch(/duración/i);
 expect((await current(page)).context.evidenceKind).toBe('student');
 await expect(page.locator('#noaExamEvidenceKind')).toHaveValue('technical_test');
 await page.evaluate(queue=>{document.getElementById('noaExamDurationMinutes').value='1';NOA_MIXED_EXAM.start(queue);},timedQuestions);
 expect((await current(page)).context.evidenceKind).toBe('technical_test');
 await page.evaluate(queue=>NOA_MIXED_EXAM.start(queue),timedQuestions);
 expect((await current(page)).context.evidenceKind).toBe('unknown');
});

test('reactivo técnico veta declaración estudiante y no se infiere por nombre o ID',async({page})=>{
 await choose(page,'student');
 const queue=structuredClone(timedQuestions);queue[0].technicalTest=true;
 await startMixed(page,queue);
 expect((await current(page)).context).toEqual({evidenceKind:'technical_test',technicalTest:true});
 await page.evaluate(()=>{delete examQueue[0].technicalTest;});
 expect((await current(page)).context.evidenceKind).toBe('technical_test');
 expect((await expire(page)).attempts[0].evidenceKind).toBe('technical_test');
 await startMixed(page,[{...timedQuestions[0],id:'technical-test-student',text:'Prueba técnica: pregunta sintética'}]);
 expect((await current(page)).context.evidenceKind).toBe('unknown');
});

test('checkpoint antiguo no hereda declaración UI ni convierte historial previo',async({page})=>{
 await startMixed(page);
 const legacy=await page.evaluate(()=>{
  const old={id:'legacy',total:1,score:0,at:'2025-01-01T12:00:00Z'};
  db.attempts.push(old);NOA_EXAM_RECOVERY.save();
  delete db.activeExam.evidenceKind;delete db.activeExam.technicalTest;
  localStorage.setItem(KEY,JSON.stringify(db));return JSON.stringify(old);
 });
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{document.getElementById('noaExamEvidenceKind').value='student';},{once:true}));
 await reload(page);
 expect((await current(page)).context.evidenceKind).toBe('unknown');
 await expect(page.locator('#noaExamEvidenceKind')).toHaveValue('student');
 const deadline=await page.evaluate(()=>NOA_EXAM_SHELL.state().timing.deadlineAt-Date.now());
 await page.clock.fastForward(deadline+1);
 await expect.poll(()=>page.evaluate(()=>db.attempts.length)).toBe(2);
 await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.whenIdle());
 expect(await page.evaluate(()=>JSON.stringify(db.attempts[0]))).toBe(legacy);
 expect((await current(page)).attempts[1].evidenceKind).toBe('unknown');
});

for(const kind of ['student','technical_test','unknown'])test('respaldo de sesión activa y resultado completado: '+kind,async({page})=>{
 await choose(page,kind);await startMixed(page);
 const backup=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(backup.ok).toBe(true);
 await choose(page,kind==='student'?'technical_test':'student');
 const restored=await page.evaluate(async backup=>{
  const original=JSON.stringify(backup),result=await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup);
  return {result,unchanged:original===JSON.stringify(backup)};
 },backup.backup);
 expect(restored).toMatchObject({result:{ok:true},unchanged:true});
 expect((await current(page)).context.evidenceKind).toBe(kind);
 await expire(page);
 const completed=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(completed.ok).toBe(true);
 expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),completed.backup)).ok).toBe(true);
 expect((await current(page)).attempts[0].evidenceKind).toBe(kind);
 expect((await current(page)).attempts).toHaveLength(1);
});

test('conflicto en respaldo activo conserva veto técnico frente a student',async({page})=>{
 await choose(page,'student');await startMixed(page);
 const backup=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(backup.ok).toBe(true);
 backup.backup.db.activeExam.technicalTest=true;
 expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup.backup)).ok).toBe(true);
 expect((await current(page)).context.evidenceKind).toBe('technical_test');
 expect((await expire(page)).attempts[0]).toMatchObject({evidenceKind:'technical_test',technicalTest:true});
});

for(const invalid of [null,['student'],'invented'])test('checkpoint con procedencia inválida no reemplaza datos: '+JSON.stringify(invalid),async({page})=>{
 await startMixed(page);
 const result=await page.evaluate(async invalid=>{
  const backup=await NOA_QUESTION_MEMORY_V25_2.createBackup();backup.backup.db.activeExam.evidenceKind=invalid;
  const before=JSON.stringify(db),stored=localStorage.getItem(KEY);
  const restored=await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup.backup);
  return {restored,unchanged:before===JSON.stringify(db)&&stored===localStorage.getItem(KEY)};
 },invalid);
 expect(result).toMatchObject({restored:{ok:false,error:'invalid_active_exam'},unchanged:true});
});

test('unknown explícito no se convierte en dominio por opción student ni por deduplicación',async({page})=>{
 const result=await page.evaluate(()=>{
  const student={id:'same',total:1,score:1,evidenceKind:'student',answers:[{questionId:'q',ok:true}]};
  const unknown={...student,evidenceKind:'unknown'};
  const before=JSON.stringify([student,unknown]);
  const options={evidenceKind:'student'};
  const normalized=NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(unknown,options);
  const history=NOA_RESULTS_NORMALIZATION_V27.normalizeHistory([student,unknown],options);
  const technical={...student,technicalTest:true,answers:[{questionId:'q',ok:true,technicalTest:true},{questionId:'q2',ok:true}],total:2,score:2};
  const veto=NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(technical,options);
  return {normalized,history,veto,unchanged:before===JSON.stringify([student,unknown])};
 });
 expect(result.normalized.records[0]).toMatchObject({evidenceKind:'unknown',domainEligible:false,credit:{value:1}});
 expect(result.history.attempts).toHaveLength(1);
 expect(result.history.attempts[0].records[0]).toMatchObject({evidenceKind:'unknown',domainEligible:false,credit:{value:1}});
 expect(result.veto.records.every(record=>record.evidenceKind==='technical_test'&&!record.domainEligible)).toBe(true);
 expect(result.unchanged).toBe(true);
});

test('respuesta técnica no pierde su veto al combinar intentos unknown y student',async({page})=>{
 const result=await page.evaluate(()=>{
  const attempt={id:'conflict',total:2,score:2,evidenceKind:'unknown',answers:[
   {questionId:'a',ok:true,evidenceKind:'technical_test'},{questionId:'b',ok:true}
  ]};
  const copy=structuredClone(attempt);copy.evidenceKind='student';delete copy.answers[0].evidenceKind;
  const before=JSON.stringify([attempt,copy]);
  const history=NOA_RESULTS_NORMALIZATION_V27.normalizeHistory([attempt,copy],{evidenceKind:'student'});
  const model=NOA_LEARNING_PROGRESS_V27.build([attempt,copy]);
  return {history,model,same:before===JSON.stringify([attempt,copy])};
 });
 expect(result.history.attempts).toHaveLength(1);
 expect(result.history.attempts[0].records).toHaveLength(2);
 expect(result.history.attempts[0].records.map(record=>record.evidenceKind)).toEqual(['technical_test','unknown']);
 expect(result.history.attempts[0].records.every(record=>!record.domainEligible&&record.credit.value===1)).toBe(true);
 expect(result.model.rows[0].kind).toBe('technical_test');
 expect(result.model.rows[0].report.stats.domain.answered).toBe(0);
 expect(result.same).toBe(true);
});

test('cierres simultáneos conservan una procedencia y un solo guardado',async({page})=>{
 await choose(page,'student');await startMixed(page);await answerTimed(page,timedQuestions[0]);
 const deadline=await page.evaluate(()=>NOA_EXAM_SHELL.state().timing.deadlineAt);
 await page.clock.setSystemTime(new Date(deadline+1));
 await page.evaluate(()=>Promise.all([NOA_EXAM_SHELL.expire(),NOA_EXAM_NAVIGATION.finishExam(),commitCompletedExam({reason:'timeout'})]));
 expect((await current(page)).attempts).toHaveLength(1);
 expect((await current(page)).attempts[0]).toMatchObject({evidenceKind:'student',score:1});
 await page.evaluate(()=>{renderExam();renderExam();renderExamStats();});
 expect((await current(page)).attempts).toHaveLength(1);
 expect(await page.evaluate(()=>__timedMemoryCalls.length)).toBe(1);
});

test('resultado durable anterior sin marca se reutiliza sin reescribir su JSON',async({page})=>{
 await startMixed(page);await expire(page);
 const result=await page.evaluate(async()=>{
  delete db.attempts[0].evidenceKind;
  localStorage.setItem(KEY,JSON.stringify(db));
  const before=JSON.stringify(db.attempts[0]),stored=localStorage.getItem(KEY);
  noaCompletedExamCommits.delete(examAnswers); // Simulate losing the in-memory completion cache.
  const attempt=await commitCompletedExam({reason:'timeout'});
  return {same:before===JSON.stringify(attempt),stored:stored===localStorage.getItem(KEY),count:db.attempts.length};
 });
 expect(result).toEqual({same:true,stored:true,count:1});
});

test('rutas manuales originales capturan la declaración al aceptar una cola',async({page})=>{
 await choose(page,'student');
 await page.evaluate(question=>{
  db.questions=Array.from({length:5},(_,i)=>({...question,id:'manual-'+i}));
  document.getElementById('examCount').value='5';startExam();
 },timedQuestions[0]);
 expect((await current(page)).context.evidenceKind).toBe('student');
 for(let i=0;i<5;i++){
  await page.locator('#examBox button[onclick="answerExam(0)"]').click();
  await page.evaluate(()=>nextExam());await page.clock.runFor(100);
 }
 expect((await current(page)).attempts[0]).toMatchObject({evidenceKind:'student',score:5,total:5});
 await choose(page,'technical_test');
 await page.evaluate(question=>beginExamQueue([question],'Inicio manual'),timedQuestions[0]);
 expect((await current(page)).context.evidenceKind).toBe('technical_test');
});

for(const count of [5,10,45])test('procedencia atraviesa inicio y vencimiento de '+count+' reactivos',async({page})=>{
 await choose(page,'student');
 const queue=Array.from({length:count},(_,i)=>({...timedQuestions[0],id:'size-'+i}));
 await startMixed(page,queue);
 const result=await expire(page);
 expect(result.attempts[0]).toMatchObject({evidenceKind:'student',total:count,score:0});
 expect(result.attempts[0].answers.filter(answer=>answer.omitted)).toHaveLength(count);
});

test.describe('offline',()=>{
 test.use({serviceWorkers:'allow'});
 test('declaración y recuperación sobreviven sin conexión con recursos aislados',async({page,context})=>{
  await choose(page,'student');await startMixed(page);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await reload(page);
  expect((await current(page)).context.evidenceKind).toBe('student');
  expect((await expire(page)).attempts[0].evidenceKind).toBe('student');
 });
});
