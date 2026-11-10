const {test,expect}=require('@playwright/test');
const {openTimed,startMixed,answerTimed,timedQuestions}=require('./timed-exam-fixtures.cjs');
const {memoryQuestions}=require('./question-memory-fixtures.cjs');

async function snapshot(page){return page.evaluate(()=>({db:structuredClone(db),queue:structuredClone(examQueue),index:examIndex,score:examScore,answers:structuredClone(examAnswers),drafts:structuredClone([...NOA_EXAM_NAVIGATION.drafts]),revision:NOA_ANSWER_REVISION.capture(),clock:NOA_EXAM_SHELL.state(),provenance:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue),storage:Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])),pending:document.getElementById('noaExamEvidenceKind').value}));}
async function backup180(page){return page.evaluate(async()=>{
 const exported=await NOA_QUESTION_MEMORY_V25_2.createBackup();if(!exported.ok)throw new Error(JSON.stringify(exported));
 const backup=exported.backup,active=backup.db.activeExam;
 active.queue=structuredClone(backup.db.questions);active.index=0;active.score=0;active.answers=[];active.drafts=[];active.revision=null;active.mixed=false;
 active.title='Entrenamiento completo 180';active.clock.timing.attemptId='import-180';active.clock.timing.presentedQuestionIds=[active.queue[0].id];
 delete active.startContract;return backup;
});}

test.beforeEach(async({page})=>{
 page.auditErrors=[];page.on('pageerror',error=>page.auditErrors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
  window.__timedForbidden={ai:0,fetch:0};
  window.callAI=()=>{__timedForbidden.ai++;throw new Error('IA real prohibida');};
  window.fetch=()=>{__timedForbidden.fetch++;throw new Error('Red de motores prohibida');};
 },{once:true}));
 await openTimed(page);await page.evaluate(()=>{
  db.questions=[];NOA_EXCOBA_V4.subjects.forEach((subject,n)=>{const sid='atomic-s'+n,tid='atomic-t'+n;db.subjects.push({id:sid,name:subject.value});db.topics.push({id:tid,subjectId:sid,name:subject.label,attempts:0,correct:0});for(let i=0;i<20;i++)db.questions.push({id:`atomic-${n}-${i}`,topicId:tid,text:`Reactivo determinista ${n} ${i}`,options:['Alfa','Beta'],correct:0});});
  db.attempts=[{id:'previous-history',score:1,total:2,pct:50,at:'2026-05-01T12:00:00.000Z',evidenceKind:'unknown'}];
  document.getElementById('noaExamEvidenceKind').value='student';
 });
 await startMixed(page,timedQuestions,true,10);await answerTimed(page,timedQuestions[0]);await page.evaluate(()=>NOA_EXAM_NAVIGATION.navigateTo(1));await page.clock.runFor(200);await answerTimed(page,timedQuestions[1],'partial');
 await page.evaluate(async question=>{await NOA_QUESTION_MEMORY_V25_2.recordExam([question],'atomic-existing-memory');document.getElementById('noaExamEvidenceKind').value='technical_test';},memoryQuestions[0]);
 await page.locator('#noaRevisionEdit').click();await page.clock.runFor(200);
});
test.afterEach(async({page})=>{expect(page.auditErrors).toEqual([]);expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});});

for(const defect of ['distribution','title'])test('reproductor '+defect+': respaldo histórico rechazado sin cambios ni escrituras',async({page})=>{
 const backup=await backup180(page);
 if(defect==='distribution')backup.db.activeExam.queue.find(q=>q.topicId==='atomic-t8').topicId='atomic-t0';
 else backup.db.activeExam.title='Entrenamiento completo 179';
 const before=await snapshot(page);
 const result=await page.evaluate(async backup=>{let writes=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){writes++;return original.apply(this,args);};try{return {outcome:await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup),writes};}finally{Storage.prototype.setItem=original;}},backup);
 expect(result.outcome).toMatchObject({ok:false,error:'invalid_active_exam'});expect(result.writes).toBe(0);expect(await snapshot(page)).toEqual(before);
});

for(const count of [45,180])test('histórico válido '+count+': importar, recargar y conservar contrato ausente',async({page})=>{
 const backup=await backup180(page),active=backup.db.activeExam;
 if(count===45)active.queue=active.queue.filter(q=>Number(q.id.split('-').at(-1))<5);
 active.title='Entrenamiento completo '+count;
 const input=JSON.stringify(backup);
 expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup)).ok).toBe(true);
 expect(JSON.stringify(backup)).toBe(input);
 const imported=await snapshot(page);expect(imported.queue).toHaveLength(count);expect(imported.provenance.evidenceKind).toBe('student');expect(imported.db.activeExam).not.toHaveProperty('startContract');
 expect(imported.clock.timing).toEqual(active.clock.timing);
 await page.reload();await page.clock.runFor(200);
 const recovered=await snapshot(page);for(const key of ['queue','answers','score','index','provenance'])expect(recovered[key],key).toEqual(imported[key]);
 expect(recovered.clock.timing).toEqual(imported.clock.timing);expect(recovered.clock.startedAt).toBe(imported.clock.startedAt);expect(recovered.clock.elapsed).toBeCloseTo(imported.clock.elapsed+0.2,6);
});

test('moderno completo válido se restaura desde un catálogo distinto',async({page})=>{
 const backup=await backup180(page);backup.db.activeExam.startContract={version:1,mode:'excoba-local',requestedCount:180,availableCount:180,completion:'complete',allowShortfall:false,displayName:''};
 // IDs del respaldo distintos a todos los IDs del catálogo actualmente abierto.
 const mapping=new Map(backup.db.subjects.map(s=>[s.id,'import-'+s.id]));
 backup.db.subjects.forEach(s=>s.id=mapping.get(s.id));backup.db.topics.forEach(t=>{t.subjectId=mapping.get(t.subjectId);t.id='import-'+t.id;});
 for(const q of [...backup.db.questions,...backup.db.activeExam.queue])q.topicId='import-'+q.topicId;
 expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup)).ok).toBe(true);
 expect(await page.evaluate(()=>({count:examQueue.length,valid:validateLocalExcobaQueue(examQueue,180).valid,contract:db.activeExam.startContract.completion,attempts:db.attempts.length}))).toEqual({count:180,valid:true,contract:'complete',attempts:1});
});

for(const defect of ['contract','provenance','duplicate','mixed_mode'])test('rechazo previo atómico: '+defect,async({page})=>{
 const backup=await backup180(page),active=backup.db.activeExam;
 if(defect==='contract')active.startContract={version:1,mode:'excoba-local',requestedCount:45,availableCount:180,completion:'complete',allowShortfall:false};
 if(defect==='provenance')backup.db.attempts.push({id:active.clock.timing.attemptId,score:0,total:180,pct:0,evidenceKind:'technical_test'});
 if(defect==='duplicate')active.queue[1]=structuredClone(active.queue[0]);
 if(defect==='mixed_mode'){active.mixed=true;active.queue[0]={id:active.queue[0].id,interactionType:'drag_order',items:[{id:'a',text:'A'},{id:'b',text:'B'}],correctOrder:['a','b']};}
 const before=await snapshot(page);const outcome=await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup);
 expect(outcome.ok).toBe(false);expect(outcome.error).toBe(defect==='provenance'?'provenance_conflict':'invalid_active_exam');expect(await snapshot(page)).toEqual(before);
});

test('preflight de checkpoints es puro con entradas profundamente congeladas',async({page})=>{
 const backup=await backup180(page),before=await snapshot(page);
 const result=await page.evaluate(backup=>{const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};freeze(backup);const original=JSON.stringify(backup),a=NOA_EXAM_RECOVERY.validate(backup.db.activeExam,backup.db),b=NOA_EXAM_RECOVERY.validate(backup.db.activeExam,backup.db);return {a,b,intact:original===JSON.stringify(backup)};},backup);
 expect(result).toEqual({a:true,b:true,intact:true});expect(await snapshot(page)).toEqual(before);
});

for(const failure of ['storage','render','recover','recover_noop','verification','post_verification'])test('fallo '+failure+': revierte almacenamiento y sesión completa',async({page})=>{
 const backup=await backup180(page);backup.db.notes=[{id:'imported-note',title:'Importada',text:'No debe reemplazar los datos vigentes al fallar.'}];
 const before=await snapshot(page);
 const result=await page.evaluate(async({backup,failure})=>{
  const set=Storage.prototype.setItem,get=Storage.prototype.getItem,render=window.renderAll,recover=NOA_EXAM_RECOVERY.recover;
  let armed=true,writes=0;
  Storage.prototype.setItem=function(key,value){writes++;if(failure==='storage'&&key===KEY&&armed){armed=false;throw new DOMException('Fallo sintético','QuotaExceededError');}return set.call(this,key,value);};
  if(failure==='render')window.renderAll=function(...args){if(armed){armed=false;throw new Error('Fallo posterior a escritura');}return render.apply(this,args);};
  if(failure==='recover')NOA_EXAM_RECOVERY.recover=()=>false;
  if(failure==='recover_noop')NOA_EXAM_RECOVERY.recover=()=>true;
  if(failure==='post_verification'){
   armed=false;NOA_EXAM_RECOVERY.recover=function(){const result=recover();armed=true;return result;};
   Storage.prototype.getItem=function(key){if(key===KEY&&armed){armed=false;throw new Error('Verificación posterior al runtime denegada');}return get.call(this,key);};
  }
  if(failure==='verification')Storage.prototype.getItem=function(key){if(key===KEY&&writes>=2&&armed){armed=false;throw new Error('Lectura de verificación denegada');}return get.call(this,key);};
  try{return {outcome:await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup),writes};}
  finally{Storage.prototype.setItem=set;Storage.prototype.getItem=get;window.renderAll=render;NOA_EXAM_RECOVERY.recover=recover;}
 },{backup,failure});
 expect(result.outcome.ok).toBe(false);expect(result.outcome).not.toHaveProperty('committed',true);
 if(['render','recover','recover_noop','post_verification'].includes(failure))expect(result.outcome).toMatchObject({error:'runtime_refresh_failed',rolledBack:true});
 expect(await snapshot(page)).toEqual(before);
 await expect(page.locator('#noaRevisionCancel')).toBeVisible();
 // Los callbacks diferidos tampoco deben escribir sobre la sesión recuperada.
 await page.clock.runFor(200);expect((await snapshot(page)).answers).toEqual(before.answers);expect((await snapshot(page)).db.attempts).toEqual(before.db.attempts);
});

test('fallo después de recuperar realmente el nuevo examen también revierte',async({page})=>{
 const backup=await backup180(page),before=await snapshot(page);
 const outcome=await page.evaluate(async backup=>{const recover=NOA_EXAM_RECOVERY.recover;NOA_EXAM_RECOVERY.recover=function(){recover();return false;};try{return await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup);}finally{NOA_EXAM_RECOVERY.recover=recover;}},backup);
 expect(outcome).toMatchObject({ok:false,rolledBack:true});expect(await snapshot(page)).toEqual(before);
});

test('importación sin examen activo conserva historial y memoria',async({page})=>{
 const backup=await backup180(page);delete backup.db.activeExam;
 const history=structuredClone(backup.db.attempts),memory=JSON.stringify(backup.questionMemory);
 const outcome=await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup);
 expect(outcome).toMatchObject({ok:true});
 expect(await page.evaluate(()=>({queue:examQueue.length,answers:examAnswers.length,active:db.activeExam||null,attempts:db.attempts,memory:localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey)}))).toEqual({queue:0,answers:0,active:null,attempts:history,memory});
});

test('respaldo con parcial y omisiones válidas completa su cierre sin duplicar créditos',async({page})=>{
 const backup=(await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup())).backup,active=backup.db.activeExam;
 active.revision=null;active.drafts=[];active.index=active.queue.length;
 const timing=active.clock.timing;timing.status='closing';timing.finishReason='timeout';timing.closedAt=timing.deadlineAt;
 const answered=new Set(active.answers.map(a=>a.questionId));for(const q of active.queue)if(!answered.has(q.id))active.answers.push({questionId:q.id,interactionType:q.interactionType,omitted:true,omissionReason:'timeout',ok:false,scoreFraction:0,presented:timing.presentedQuestionIds.includes(q.id)});
 expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup)).ok).toBe(true);
 await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.whenIdle());
 const result=await page.evaluate(()=>db.attempts.filter(a=>a.id===''+NOA_EXAM_SHELL.state().timing.attemptId));expect(result).toHaveLength(1);expect(result[0]).toMatchObject({score:1.5,total:4,evidenceKind:'student'});expect(result[0].answers.filter(a=>a.omitted)).toHaveLength(2);
});

test('importación offline mantiene el plazo cronometrado',async({page,context})=>{
 const backup=await backup180(page);await context.setOffline(true);
 expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup)).ok).toBe(true);
 expect(await page.evaluate(()=>NOA_EXAM_SHELL.state().timing)).toEqual(backup.db.activeExam.clock.timing);
});

test('rollback denegado informa riesgo y conserva originales para reparación',async({page})=>{
 const backup=await backup180(page),before=await snapshot(page);
 const outcome=await page.evaluate(async backup=>{
  const set=Storage.prototype.setItem,render=window.renderAll;let deny=false;
  window.renderAll=function(...args){if(!deny){deny=true;throw new Error('Fallo posterior al commit');}return render.apply(this,args);};
  Storage.prototype.setItem=function(key,value){if(deny&&key===KEY)throw new DOMException('Rollback denegado','SecurityError');return set.call(this,key,value);};
  try{return await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup);}finally{Storage.prototype.setItem=set;window.renderAll=render;}
 },backup);
 expect(outcome).toMatchObject({ok:false,error:'rollback_failed',rollbackFailed:true,storageRestored:false});
 await expect(page.locator('#toast')).toContainText('Conserva esta pestaña');
 const repaired=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(repaired.ok).toBe(true);
 expect(await snapshot(page)).toEqual(before);
});

test('respaldo histórico sin perfil utiliza defaults existentes antes de escribir',async({page})=>{
 const backup=await backup180(page);delete backup.db.activeExam;delete backup.db.settings.noaTrainingProfile;delete backup.db.masterSyllabus;
 expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup)).ok).toBe(true);
 expect(await page.evaluate(()=>localStorage.getItem(KEY)===JSON.stringify(db))).toBe(true);
});

test('renderAll permanentemente indisponible no destruye la sesión anterior',async({page})=>{
 const backup=await backup180(page),before=await snapshot(page);
 const outcome=await page.evaluate(async backup=>{const render=window.renderAll;window.renderAll=()=>{throw new Error('Presentación indisponible');};try{return await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup);}finally{window.renderAll=render;}},backup);
 expect(outcome).toMatchObject({ok:false,rolledBack:true});expect(await snapshot(page)).toEqual(before);
});

test('rollback conserva resultados ya finalizados y no duplica intentos',async({page})=>{
 const backup=await backup180(page);
 const delay=await page.evaluate(()=>Math.max(0,NOA_EXAM_SHELL.state().timing.deadlineAt-Date.now())+1);
 await page.clock.fastForward(delay);await expect.poll(()=>page.evaluate(()=>db.attempts.length)).toBe(2);await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.whenIdle());
 const before=await snapshot(page);
 const outcome=await page.evaluate(async backup=>{const recover=NOA_EXAM_RECOVERY.recover;NOA_EXAM_RECOVERY.recover=()=>false;try{return await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup);}finally{NOA_EXAM_RECOVERY.recover=recover;}},backup);
 expect(outcome).toMatchObject({ok:false,rolledBack:true});expect(await snapshot(page)).toEqual(before);
});

test('rollback después de recuperar revierte memoria e historial realmente diferentes',async({page})=>{
 const backup=await backup180(page);backup.db.attempts=[];backup.questionMemory={version:1,entries:[],sessions:[]};
 const before=await snapshot(page);expect(before.db.attempts).toHaveLength(1);
 const memoryKey=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.storageKey);expect(JSON.parse(before.storage[memoryKey]).entries).toHaveLength(1);
 const outcome=await page.evaluate(async backup=>{const recover=NOA_EXAM_RECOVERY.recover;NOA_EXAM_RECOVERY.recover=function(){const restored=recover();if(!restored)throw new Error('No se aplicó el respaldo de prueba');return false;};try{return await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup);}finally{NOA_EXAM_RECOVERY.recover=recover;}},backup);
 expect(outcome).toMatchObject({ok:false,rolledBack:true});expect(await snapshot(page)).toEqual(before);
});

test('fallo de navegación de UI no impide completar la reversión del almacenamiento',async({page})=>{
 const backup=await backup180(page),before=await snapshot(page);
 const outcome=await page.evaluate(async backup=>{const navigate=window.page;window.page=()=>{throw new Error('Navegación indisponible');};try{return await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup);}finally{window.page=navigate;}},backup);
 expect(outcome).toMatchObject({ok:false,rolledBack:true});expect(await snapshot(page)).toEqual(before);
});
