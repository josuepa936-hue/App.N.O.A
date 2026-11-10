const {test,expect}=require('@playwright/test');
const {openTimed,startMixed,answerTimed,timedQuestions}=require('./timed-exam-fixtures.cjs');
const {memoryQuestions}=require('./question-memory-fixtures.cjs');

test.beforeEach(async({page})=>{
 page.generationErrors=[];page.on('pageerror',e=>page.generationErrors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
  window.__timedForbidden={ai:0,fetch:0};window.callAI=()=>{__timedForbidden.ai++;throw new Error('IA prohibida');};window.fetch=()=>{__timedForbidden.fetch++;throw new Error('Red de IA prohibida');};
 },{once:true}));
 await openTimed(page);await page.locator('#noaExamEvidenceKind').selectOption('student');
 await page.evaluate(()=>{db.attempts=[{id:'history-before',score:1,total:2,pct:50,at:'2026-05-01T12:00:00.000Z',evidenceKind:'unknown'}];});
 await startMixed(page,timedQuestions,true,10);await answerTimed(page,timedQuestions[0]);await page.evaluate(()=>NOA_EXAM_NAVIGATION.navigateTo(1));await page.clock.runFor(200);await answerTimed(page,timedQuestions[1],'partial');
 await page.locator('#noaRevisionEdit').click();await page.clock.runFor(200);
 await page.evaluate(async questions=>{
  window.genQuestions=questions;const m=NOA_QUESTION_MEMORY_V25_2;
  await m.recordExam([questions[3]],'original-memory');
  window.genInitial=(await m.createBackup()).backup;
  window.genSnapshot=()=>JSON.stringify({db,queue:examQueue,index:examIndex,score:examScore,answers:examAnswers,drafts:[...NOA_EXAM_NAVIGATION.drafts],revision:NOA_ANSWER_REVISION.capture(),clock:NOA_EXAM_SHELL.state(),provenance:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue),storage:{...localStorage},pending:document.getElementById('noaExamEvidenceKind').value});
  window.genCandidate=(phase='past')=>{
   const b=structuredClone(genInitial),a=b.db.activeExam,t=a.clock.timing;
   b.db.attempts=[];b.questionMemory={version:1,entries:[],sessions:[]};
   t.attemptId='audit-rejected-async-memory';
   if(phase==='active')return b;
   a.revision=null;a.drafts=[];a.index=a.queue.length;
   if(phase==='past'){t.durationMs=60000;t.deadlineAt=Date.now()-1000;t.startedAt=t.deadlineAt-t.durationMs;a.clock.startedAt=t.startedAt;a.clock.elapsed=(Date.now()-t.startedAt)/1000;}
   t.status='closing';t.finishReason='timeout';t.closedAt=t.deadlineAt;
   const answered=new Set(a.answers.map(x=>x.questionId));
   for(const q of a.queue)if(!answered.has(q.id))a.answers.push({questionId:q.id,interactionType:q.interactionType,omitted:true,omissionReason:'timeout',ok:false,scoreFraction:0,presented:t.presentedQuestionIds.includes(q.id)});
   return b;
  };
  window.genEmpty=()=>{const b=structuredClone(genInitial);delete b.db.activeExam;b.db.attempts=[];b.questionMemory={version:1,entries:[],sessions:[]};return b;};
  window.genHistory=()=>[0,1].map(i=>({id:'deferred-history-'+i,at:'2026-05-01T12:00:00.000Z',answers:[{...structuredClone(genQuestions[0]),text:'Contenido histórico único '+i}]}));
  window.genInstallGate=()=>{
   const digest=crypto.subtle.digest;let open=false;
   window.genJobs=[];
   crypto.subtle.digest=async function(...args){const job={released:open};genJobs.push(job);if(!open)await new Promise(resolve=>{job.release=()=>{job.released=true;resolve();};});return digest.apply(this,args);};
   window.genRelease=()=>{open=true;for(const job of genJobs)if(!job.released)job.release();};
   window.genRestoreDigest=()=>{genRelease();crypto.subtle.digest=digest;};
  };
 },memoryQuestions);
});
test.afterEach(async({page})=>{expect(page.generationErrors).toEqual([]);expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});});

for(const phase of ['future','past'])test('reproducción original '+phase+': el intento rechazado no reaparece tras otra importación',async({page})=>{
 const r=await page.evaluate(async phase=>{
  const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover,before=genSnapshot();genInstallGate();
  try{
   NOA_EXAM_RECOVERY.recover=function(){recover();return false;};
   const failed=await m.restoreBackup(genCandidate(phase));NOA_EXAM_RECOVERY.recover=recover;
   const unchanged=before===genSnapshot(),held=genJobs.length;
   const accepted=await m.restoreBackup(genEmpty()),empty=genSnapshot();
   genRelease();await m.whenIdle();
   return {failed,accepted,held,unchanged,stable:empty===genSnapshot(),memory:m.stats(),sessions:JSON.parse(localStorage.getItem(m.storageKey)).sessions,attempts:db.attempts};
  }finally{genRestoreDigest();NOA_EXAM_RECOVERY.recover=recover;}
 },phase);
 expect(r).toMatchObject({failed:{ok:false,rolledBack:true},accepted:{ok:true},unchanged:true,stable:true,memory:{uniqueQuestions:0,sessions:0},attempts:[]});expect(r.held).toBeGreaterThan(0);expect(r.sessions.some(s=>s.id==='history:audit-rejected-async-memory')).toBe(false);
});

test('checkpoint activo: una tarea iniciada durante la recuperación rechazada queda revocada',async({page})=>{
 const r=await page.evaluate(async()=>{
  const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover,before=genSnapshot();genInstallGate();let pending;
  try{NOA_EXAM_RECOVERY.recover=function(){recover();pending=m.recordExam([genQuestions[0]],'aborted-active');return false;};
   const failed=await m.restoreBackup(genCandidate('active'));NOA_EXAM_RECOVERY.recover=recover;genRelease();const outcome=await pending;await m.whenIdle();return {failed,outcome,unchanged:before===genSnapshot()};
  }finally{genRestoreDigest();NOA_EXAM_RECOVERY.recover=recover;}
 });expect(r).toMatchObject({failed:{rolledBack:true},outcome:{ok:false,error:'operation_superseded'},unchanged:true});
});

test('generaciones concurrentes: conserva la tarea anterior válida y revoca la abortada',async({page})=>{
 const r=await page.evaluate(async()=>{
  const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover;genInstallGate();let rejected;
  const prior=m.recordExam([genQuestions[2]],'legitimate-before');
  try{NOA_EXAM_RECOVERY.recover=function(){recover();rejected=m.recordExam([genQuestions[1]],'aborted-concurrent');return false;};
   const failed=await m.restoreBackup(genCandidate('active'));NOA_EXAM_RECOVERY.recover=recover;
   genRelease();const outcomes=await Promise.all([prior,rejected]);await m.whenIdle();return {failed,outcomes,sessions:JSON.parse(localStorage.getItem(m.storageKey)).sessions.map(s=>s.id),score:examScore,history:db.attempts.length};
  }finally{genRestoreDigest();NOA_EXAM_RECOVERY.recover=recover;}
 });expect(r.failed.rolledBack).toBe(true);expect(r.outcomes[0].ok).toBe(true);expect(r.outcomes[1]).toMatchObject({ok:false,error:'operation_superseded'});expect(r.sessions.sort()).toEqual(['legitimate-before','original-memory']);expect(r).toMatchObject({score:1.5,history:1});
});

test('tres generaciones concurrentes: solo escribe la posterior a una restauración válida',async({page})=>{
 const r=await page.evaluate(async()=>{
  const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover;genInstallGate();let rejected;
  const prior=m.recordExam([genQuestions[2]],'old-replaced');
  try{NOA_EXAM_RECOVERY.recover=function(){recover();rejected=m.recordExam([genQuestions[1]],'aborted-replaced');return false;};
   await m.restoreBackup(genCandidate('active'));NOA_EXAM_RECOVERY.recover=recover;const accepted=await m.restoreBackup(genEmpty());
   const current=m.recordExam([genQuestions[0]],'new-legitimate');genRelease();const outcomes=await Promise.all([prior,rejected,current]);await m.whenIdle();
   return {accepted,outcomes,sessions:JSON.parse(localStorage.getItem(m.storageKey)).sessions.map(s=>s.id)};
  }finally{genRestoreDigest();NOA_EXAM_RECOVERY.recover=recover;}
 });expect(r.accepted.ok).toBe(true);expect(r.outcomes.slice(0,2).map(o=>o.error)).toEqual(['operation_superseded','operation_superseded']);expect(r.outcomes[2].ok).toBe(true);expect(r.sessions).toEqual(['new-legitimate']);
});

test('varios rollbacks nunca vuelven a autorizar identificadores descartados',async({page})=>{
 const r=await page.evaluate(async()=>{
  const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover;genInstallGate();const pending=[];
  try{
   for(let i=0;i<4;i++){NOA_EXAM_RECOVERY.recover=function(){recover();pending.push(m.recordExam([genQuestions[0]],'discarded-'+i));return false;};const outcome=await m.restoreBackup(genCandidate('active'));if(!outcome.rolledBack)throw new Error('Rollback no completado');}
   NOA_EXAM_RECOVERY.recover=recover;
   const accepted=await m.restoreBackup(genEmpty());genRelease();const outcomes=await Promise.all(pending);await m.whenIdle();
   return {accepted,outcomes,memory:m.stats()};
  }finally{genRestoreDigest();NOA_EXAM_RECOVERY.recover=recover;}
 });expect(r.accepted.ok).toBe(true);expect(r.outcomes.map(o=>o.error)).toEqual(Array(4).fill('operation_superseded'));expect(r.memory.uniqueQuestions).toBe(0);
});

for(const endpoint of ['recordSavedAttempt','recordExam'])test('callback diferido de '+endpoint+' conserva el origen de la importación',async({page})=>{
 const r=await page.evaluate(async endpoint=>{
  const m=NOA_QUESTION_MEMORY_V25_2,native=m[endpoint],recover=NOA_EXAM_RECOVERY.recover;let release,called=0,outcome;
  m[endpoint]=(...args)=>{called++;return new Promise(resolve=>{release=()=>native(...args).then(value=>{outcome=value;resolve(value);});});};
  try{NOA_EXAM_RECOVERY.recover=function(){recover();return false;};const failed=await m.restoreBackup(genCandidate('past'));NOA_EXAM_RECOVERY.recover=recover;
   const accepted=await m.restoreBackup(genEmpty()),before=genSnapshot();await release();await m.whenIdle();return {failed,accepted,called,outcome,stable:before===genSnapshot(),memory:m.stats()};
  }finally{m[endpoint]=native;NOA_EXAM_RECOVERY.recover=recover;}
 },endpoint);
 expect(r).toMatchObject({failed:{rolledBack:true},accepted:{ok:true},called:1,outcome:{ok:false,error:'operation_superseded'},stable:true,memory:{uniqueQuestions:0}});
});

for(const origin of ['replaced','aborted'])test('recoverHistory '+origin+': las iteraciones no capturan una generación nueva',async({page})=>{
 const r=await page.evaluate(async origin=>{
  const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover;genInstallGate();let pending;
  try{
   if(origin==='replaced')pending=m.recoverHistory(genHistory());
   else{NOA_EXAM_RECOVERY.recover=function(){recover();pending=m.recoverHistory(genHistory());return false;};await m.restoreBackup(genCandidate('active'));NOA_EXAM_RECOVERY.recover=recover;}
   await m.restoreBackup(genEmpty());const before=genSnapshot();genRelease();const result=await pending;await m.whenIdle();return {result,stable:before===genSnapshot(),digests:genJobs.length,memory:m.stats()};
  }finally{genRestoreDigest();NOA_EXAM_RECOVERY.recover=recover;}
 },origin);
 expect(r).toMatchObject({result:{ok:false,error:'operation_superseded'},stable:true,digests:1,memory:{uniqueQuestions:0}});
});

test('recoverHistory legítimo después de rollback conserva exposición y deduplicación',async({page})=>{
 const r=await page.evaluate(async()=>{
  const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover;try{NOA_EXAM_RECOVERY.recover=()=>false;await m.restoreBackup(genCandidate('active'));}finally{NOA_EXAM_RECOVERY.recover=recover;}
  const first=await m.recoverHistory(genHistory()),raw=localStorage.getItem(m.storageKey),repeat=await m.recoverHistory(genHistory());
  return {first,repeat,stable:raw===localStorage.getItem(m.storageKey),memory:m.stats()};
 });expect(r.first).toMatchObject({ok:true,recovered:2});expect(r.repeat).toMatchObject({ok:true,recovered:0});expect(r.stable).toBe(true);expect(r.memory).toMatchObject({uniqueQuestions:3,totalSeen:3,sessions:3});
});

test('fallo de almacenamiento: preserva la tarea legítima y cancela la creada durante la transacción',async({page})=>{
 const r=await page.evaluate(async()=>{
  const m=NOA_QUESTION_MEMORY_V25_2,set=Storage.prototype.setItem;genInstallGate();let rejected,armed=true;
  const prior=m.recordExam([genQuestions[2]],'before-storage-failure');
  Storage.prototype.setItem=function(key,value){if(key===KEY&&armed){armed=false;rejected=m.recordExam([genQuestions[1]],'aborted-storage');throw new DOMException('Escritura denegada','QuotaExceededError');}return set.call(this,key,value);};
  try{const failed=await m.restoreBackup(genCandidate('active'));Storage.prototype.setItem=set;genRelease();const outcomes=await Promise.all([prior,rejected]);await m.whenIdle();return {failed,outcomes,sessions:JSON.parse(localStorage.getItem(m.storageKey)).sessions.map(s=>s.id)};}
  finally{genRestoreDigest();Storage.prototype.setItem=set;}
 });expect(r.failed).toMatchObject({ok:false,error:'storage_unavailable'});expect(r.outcomes[0].ok).toBe(true);expect(r.outcomes[1].error).toBe('operation_superseded');expect(r.sessions.sort()).toEqual(['before-storage-failure','original-memory']);
});

test('rollback denegado: la tarea abortada no escribe ni intenta reparar las claves',async({page})=>{
 const r=await page.evaluate(async()=>{
  const m=NOA_QUESTION_MEMORY_V25_2,set=Storage.prototype.setItem,recover=NOA_EXAM_RECOVERY.recover,before=genSnapshot();genInstallGate();let rejected,deny=false,writes=0;
  Storage.prototype.setItem=function(key,value){writes++;if(deny&&key===KEY)throw new DOMException('Rollback denegado','SecurityError');return set.call(this,key,value);};
  try{NOA_EXAM_RECOVERY.recover=function(){recover();rejected=m.recordExam([genQuestions[1]],'aborted-denied');deny=true;return false;};
   const failed=await m.restoreBackup(genCandidate('active'));NOA_EXAM_RECOVERY.recover=recover;const warning=document.getElementById('toast').textContent;writes=0;
   genRelease();const outcome=await rejected;await m.whenIdle();const lateWrites=writes;Storage.prototype.setItem=set;
   const repaired=await m.createBackup();return {failed,warning,outcome,lateWrites,repaired:repaired.ok,unchanged:before===genSnapshot()};
  }finally{genRestoreDigest();Storage.prototype.setItem=set;NOA_EXAM_RECOVERY.recover=recover;}
 });expect(r.failed).toMatchObject({ok:false,rollbackFailed:true});expect(r.warning).toContain('Conserva esta pestaña');expect(r).toMatchObject({outcome:{error:'operation_superseded'},lateWrites:0,repaired:true,unchanged:true});
});

test('cierre legítimo posterior conserva crédito parcial, omisiones y registro único',async({page})=>{
 await page.evaluate(async()=>{const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover;try{NOA_EXAM_RECOVERY.recover=()=>false;await m.restoreBackup(genCandidate('active'));}finally{NOA_EXAM_RECOVERY.recover=recover;}const result=await m.restoreBackup(genInitial);if(!result.ok)throw new Error(JSON.stringify(result));});
 const delay=await page.evaluate(()=>Math.max(0,NOA_EXAM_SHELL.state().timing.deadlineAt-Date.now())+1);await page.clock.fastForward(delay);await expect.poll(()=>page.evaluate(()=>db.attempts.length)).toBe(2);await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.whenIdle());
 const r=await page.evaluate(async()=>{const m=NOA_QUESTION_MEMORY_V25_2,attempt=db.attempts.at(-1),before=localStorage.getItem(m.storageKey);const repeat=await m.recordSavedAttempt(attempt,examQueue);return {attempt,repeat,stable:before===localStorage.getItem(m.storageKey),sessions:JSON.parse(before).sessions.filter(s=>s.id==='history:'+attempt.id).length};});
 expect(r.attempt).toMatchObject({score:1.5,total:4,evidenceKind:'student',finishReason:'timeout'});expect(r.attempt.answers.filter(a=>a.omitted)).toHaveLength(2);expect(r).toMatchObject({repeat:{ok:true},stable:true,sessions:1});
});

test('capturas opacas: no se pueden falsificar ni mutar para autorizar escrituras',async({page})=>{
 const r=await page.evaluate(async()=>{const m=NOA_QUESTION_MEMORY_V25_2,context=m.captureGeneration(),before=genSnapshot();const results=[];for(const fake of [{},null,structuredClone(context)])results.push(await m.recordExam([genQuestions[0]],'forged',{},fake));return {frozen:Object.isFrozen(context),serialized:JSON.stringify(context),results,unchanged:before===genSnapshot()};});
 expect(r).toMatchObject({frozen:true,serialized:'{}',unchanged:true});expect(r.results.map(o=>o.error)).toEqual(Array(3).fill('invalid_generation'));
});

test('offline: rollback, nueva importación y liberación tardía conservan el respaldo',async({page,context})=>{
 await context.setOffline(true);const r=await page.evaluate(async()=>{const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover;genInstallGate();let pending;try{NOA_EXAM_RECOVERY.recover=function(){recover();pending=m.recordExam([genQuestions[0]],'aborted-offline');return false;};const failed=await m.restoreBackup(genCandidate('active'));NOA_EXAM_RECOVERY.recover=recover;const accepted=await m.restoreBackup(genEmpty()),before=genSnapshot();genRelease();const result=await pending;await m.whenIdle();return {failed,accepted,result,stable:before===genSnapshot()};}finally{genRestoreDigest();NOA_EXAM_RECOVERY.recover=recover;}});
 expect(r).toMatchObject({failed:{rolledBack:true},accepted:{ok:true},result:{error:'operation_superseded'},stable:true});
});

test('exportación y recarga v26 conservan resultados y plazo sin persistir generaciones',async({page})=>{
 const exported=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(exported.ok).toBe(true);const before=await page.evaluate(()=>({deadline:NOA_EXAM_SHELL.state().timing,score:examScore,answers:examAnswers,history:db.attempts,memory:localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey)}));
 await page.reload();await page.clock.runFor(200);const after=await page.evaluate(()=>({deadline:NOA_EXAM_SHELL.state().timing,score:examScore,answers:examAnswers,history:db.attempts,memory:localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey)}));expect(after).toEqual(before);
 expect(Object.keys(exported.backup)).toEqual(['format','version','db','questionMemory']);expect(JSON.stringify(exported.backup)).not.toContain('operationEpoch');
});

test('recoverHistory pendiente anterior continúa tras rollback sin perder intentos válidos',async({page})=>{
 const r=await page.evaluate(async()=>{const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover;genInstallGate();const source=genHistory(),original=JSON.stringify(source),pending=m.recoverHistory(source);try{NOA_EXAM_RECOVERY.recover=()=>false;const failed=await m.restoreBackup(genCandidate('active'));NOA_EXAM_RECOVERY.recover=recover;genRelease();const outcome=await pending;await m.whenIdle();return {failed,outcome,inputIntact:JSON.stringify(source)===original,memory:m.stats(),sessions:JSON.parse(localStorage.getItem(m.storageKey)).sessions.map(s=>s.id)};}finally{genRestoreDigest();NOA_EXAM_RECOVERY.recover=recover;}});
 expect(r).toMatchObject({failed:{rolledBack:true},outcome:{ok:true,recovered:2},inputIntact:true,memory:{uniqueQuestions:3,sessions:3}});expect(r.sessions.sort()).toEqual(['history:deferred-history-0','history:deferred-history-1','original-memory']);
});

test('cierre anterior pendiente conserva su generación y crédito después del rollback',async({page})=>{
 await page.evaluate(()=>genInstallGate());const delay=await page.evaluate(()=>Math.max(0,NOA_EXAM_SHELL.state().timing.deadlineAt-Date.now())+1);await page.clock.fastForward(delay);await expect.poll(()=>page.evaluate(()=>db.attempts.length)).toBe(2);
 const r=await page.evaluate(async()=>{const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover,history=JSON.stringify(db.attempts),id=db.attempts.at(-1).id;try{NOA_EXAM_RECOVERY.recover=()=>false;const failed=await m.restoreBackup(genCandidate('active'));NOA_EXAM_RECOVERY.recover=recover;genRelease();await m.whenIdle();return {failed,historyIntact:history===JSON.stringify(db.attempts),attempt:db.attempts.at(-1),sessions:JSON.parse(localStorage.getItem(m.storageKey)).sessions.filter(s=>s.id==='history:'+id).length};}finally{genRestoreDigest();NOA_EXAM_RECOVERY.recover=recover;}});
 expect(r).toMatchObject({failed:{rolledBack:true},historyIntact:true,attempt:{score:1.5,total:4,evidenceKind:'student'},sessions:1});
});

test('un borrado posterior al rollback tampoco reutiliza la generación descartada',async({page})=>{
 const r=await page.evaluate(async()=>{const m=NOA_QUESTION_MEMORY_V25_2,recover=NOA_EXAM_RECOVERY.recover;genInstallGate();let pending;try{NOA_EXAM_RECOVERY.recover=function(){recover();pending=m.recordExam([genQuestions[0]],'aborted-before-reset');return false;};const failed=await m.restoreBackup(genCandidate('active'));NOA_EXAM_RECOVERY.recover=recover;const reset=await m.resetData(),before=localStorage.getItem(m.storageKey);genRelease();const outcome=await pending;await m.whenIdle();return {failed,reset,outcome,before,after:localStorage.getItem(m.storageKey),attempts:db.attempts};}finally{genRestoreDigest();NOA_EXAM_RECOVERY.recover=recover;}});
 expect(r).toMatchObject({failed:{rolledBack:true},reset:{ok:true},outcome:{error:'operation_superseded'},before:null,after:null,attempts:[]});
});
