const {test,expect}=require('@playwright/test');
const {openTimed,startMixed,answerTimed,timedQuestions}=require('./timed-exam-fixtures.cjs');

test.beforeEach(async({page})=>{
 page.auditErrors=[];page.on('pageerror',e=>page.auditErrors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/excoba_master.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:'window.__baseExamCommand=window.executeCommand;\n'+await response.text()+'\nwindow.__masterExamCommand=window.executeCommand;'});});
 await page.addInitScript(()=>{window.__timedForbidden={ai:0,fetch:0};document.addEventListener('DOMContentLoaded',()=>{window.callAI=()=>{__timedForbidden.ai++;throw new Error('IA real prohibida');};window.fetch=()=>{__timedForbidden.fetch++;throw new Error('Red de motor prohibida');};},{once:true});});
 await openTimed(page);
 await page.evaluate(()=>{
  db.subjects.push({id:'invariant-history',name:'Historia'});db.questions=[];
  NOA_EXCOBA_V4.subjects.forEach((s,n)=>{const sid='invariant-s'+n,tid='invariant-t'+n;db.subjects.push({id:sid,name:s.value});db.topics.push({id:tid,subjectId:sid,name:s.label,attempts:0,correct:0});for(let i=0;i<20;i++)db.questions.push({id:`invariant-${n}-${i}`,topicId:tid,text:`Pregunta ${n} ${i}`,options:['A','B'],correct:0});});
  window.invariantSnapshot=()=>JSON.stringify({db,examQueue,examAnswers,examIndex,examScore,clock:NOA_EXAM_SHELL.state(),drafts:[...NOA_EXAM_NAVIGATION.drafts],storage:{...localStorage},pending:document.getElementById('noaExamEvidenceKind').value});
 });
});

const exactForms=[[5,'cinco'],[10,'diez'],[15,'quince'],[20,'veinte'],[45,'cuarenta y cinco'],[180,'ciento ochenta']];
for(const [count,words] of exactForms)test('invariantes A/D: consumo completo de '+words,async({page})=>{
 const result=await page.evaluate(({count,words})=>{
  const context=Object.freeze({subjectNames:Object.freeze(['Biología','Historia'])});
  const valid=[],invalid=[];
  for(const scope of ['NOA practica EXCOBA','NOA inicia un examen de Biología','NOA inicia un examen de Historia'])for(const amount of [String(count),words]){
   for(const expression of [amount+' preguntas','reactivos: '+amount])valid.push({raw:scope+' de '+expression,count});
   for(const expression of ['aproximadamente '+amount+' preguntas',amount+' y pico preguntas','preguntas: '+amount+' y pico','entre '+amount+' y '+amount+' reactivos',amount+' ± 1 preguntas','casi '+amount+' preguntas'])invalid.push(scope+' de '+expression);
  }
  const before=JSON.stringify(context),issues=[];
  for(const x of valid){const r=parseExcobaTrainingCount(x.raw,10,context);if(!r.valid||r.kind!=='exact'||r.count!==x.count||r.source==='default')issues.push({raw:x.raw,result:r});}
  for(const raw of invalid){const r=parseExcobaTrainingCount(raw,10,context);if(r.valid||r.count!==undefined||r.kind==='absent')issues.push({raw,result:r});}
  return {issues,intact:before===JSON.stringify(context),valid:valid.length,invalid:invalid.length};
 },{count,words});expect(result.issues).toEqual([]);expect(result.intact).toBe(true);expect(result.valid).toBe(12);expect(result.invalid).toBe(36);
});
test('invariante A: signos y tokens Unicode no se descartan',async({page})=>{
 const issues=await page.evaluate(()=>{const issues=[];for(const glyph of ['−','⁻','₋','﹣','－','–','—','±','∓','⊖','※','\u200b','\ufeff','\u0338'])for(const expression of [glyph+'180',glyph+' ciento ochenta','180'+glyph]){
  const raw='NOA practica EXCOBA de '+expression+' preguntas',r=parseExcobaTrainingCount(raw);if(r.valid||r.source==='default')issues.push({raw,result:r});
 }return issues;});expect(issues).toEqual([]);
});
test('invariantes A/D: estados diferenciados y gramática de cláusulas',async({page})=>{
 const r=await page.evaluate(()=>{
  const context={subjectNames:['Biología','Historia']};
  const states=['NOA practica EXCOBA de cinco preguntas','NOA practica EXCOBA de dieciocho preguntas','NOA practica EXCOBA de aproximadamente 180 preguntas','NOA practica EXCOBA de tropecientas preguntas','NOA inicia un examen de Historia'].map(raw=>parseExcobaTrainingCount(raw,10,context));
  const malformed=['preguntas y cinco','cinco y preguntas','cinco preguntas y','preguntas cinco y','preguntas cinco y pico','cinco reactivos cuarenta y cinco','de'];
  const failures=malformed.map(x=>({raw:'NOA practica EXCOBA '+x})).filter(x=>parseExcobaTrainingCount(x.raw).valid);
  const good=['cinco preguntas y cinco reactivos','preguntas cinco y reactivos cinco','cinco preguntas y reactivos cinco','preguntas cinco y cinco reactivos'].map(x=>parseExcobaTrainingCount('NOA practica EXCOBA '+x));
  return {states,failures,good};
 });expect(r.states.map(x=>x.kind)).toEqual(['exact','unsupported','ambiguous','uninterpretable','absent']);expect(r.states[4].count).toBe(10);expect(r.failures).toEqual([]);expect(r.good.every(x=>x.valid&&x.count===5)).toBe(true);
});
for(const route of ['__baseExamCommand','__masterExamCommand','executeCommand'])test('invariantes B/E: rechazos íntegros en '+route,async({page})=>{
 await active(page);const r=await page.evaluate(async route=>{
  const cases=[];for(const scope of ['NOA practica EXCOBA','NOA inicia un examen de Biología','NOA inicia un examen de Historia'])for(const expression of ['de veintipico','de treinta preguntas','de aproximadamente 180 preguntas','preguntas cuarenta y cinco y pico','de ⁻180 reactivos','de 45 preguntas y diez reactivos'])cases.push(scope+' '+expression);
  const failures=[];for(const raw of cases){await window[route](raw);await Promise.resolve();if(invariantSnapshot()!==beforeInvariant)failures.push(raw);}
  return {failures,forbidden:__timedForbidden,count:cases.length};
 },route);expect(r.failures).toEqual([]);expect(r.forbidden).toEqual({ai:0,fetch:0});expect(r.count).toBe(18);
});
test('invariantes D/E: mismos comandos exactos y sin cantidad en todos los wrappers',async({page})=>{
 const r=await page.evaluate(()=>{
  const calls=[],issues=[],start=startExcobaExam,begin=beginExamQueue;
  startExcobaExam=count=>calls.push(count);beginExamQueue=(queue,label,intent)=>calls.push(intent.requestedCount);
  try{for(const route of [__baseExamCommand,__masterExamCommand,executeCommand])for(const [count,words] of [[5,'cinco'],[10,'diez'],[15,'quince'],[20,'veinte'],[45,'cuarenta y cinco'],[180,'ciento ochenta']]){
    for(const amount of [String(count),words])for(const expression of [amount+' preguntas','reactivos: '+amount,amount+' preguntas y reactivos '+amount,'preguntas '+amount+' y '+amount+' reactivos']){const n=calls.length;route('NOA practica EXCOBA de '+expression);if(calls.length!==n+1||calls.at(-1)!==count)issues.push({count,words});}
   }
   for(const route of [__baseExamCommand,__masterExamCommand,executeCommand]){route('NOA practica EXCOBA');if(calls.at(-1)!==45)issues.push({default:calls.at(-1)});}
  }finally{startExcobaExam=start;beginExamQueue=begin;}
  return {issues,count:calls.length};
 });expect(r.issues).toEqual([]);expect(r.count).toBe(147);
});
test('pureza y determinismo con contextos congelados y cantidades contextuales',async({page})=>{
 const r=await page.evaluate(()=>{
  const context=Object.freeze({subjectNames:Object.freeze(['Historia','Biología'])}),raws=Object.freeze(['NOA sesión cinco practica EXCOBA de ciento ochenta preguntas','NOA EXCOBA 2026 de 180 reactivos','NOA practica EXCOBA versión v27.4 fecha 10/11/2026','NOA practica EXCOBA fecha 10.11.2026 de diez preguntas','NOA inicia un examen de Historia para sesión treinta y dos','NOA inicia un examen de Biología de veintipico']);
  const before=JSON.stringify({context,raws}),a=raws.map(x=>parseExcobaTrainingCount(x,45,context)),b=raws.map(x=>parseExcobaTrainingCount(x,45,context));return {same:JSON.stringify(a)===JSON.stringify(b),intact:before===JSON.stringify({context,raws}),a};
 });expect(r.same&&r.intact).toBe(true);expect(r.a.map(x=>x.valid?x.count:null)).toEqual([180,180,45,10,45,null]);
});
test('invariante C: títulos nunca autorizan completos y rechazos preservan sesión',async({page})=>{
 await active(page);const r=await page.evaluate(()=>{
  const failures=[];for(const title of ['completo180','Completo 180','completo-180','completo_180','Examen ciento ochenta','EXCOBA180','180 reactivos','examen oficial'])for(const n of [10,178,179,180]){
   for(const route of ['manual','mixed']){try{if(route==='mixed')NOA_MIXED_EXAM.start(db.questions.slice(0,n),title);else beginExamQueue(db.questions.slice(0,n),title);}catch{}if(invariantSnapshot()!==beforeInvariant)failures.push({title,n,route});}
  }return failures;
 });expect(r).toEqual([]);
});
test('etiqueta principal derivada, nombre seguro secundario y sin duplicados',async({page})=>{
 await page.evaluate(()=>NOA_MIXED_EXAM.start(db.questions.slice(0,10),'Repaso personal'));
 await expect(page.locator('#pageTitle')).toHaveText('Simulacro mixto de 10');await expect(page.locator('#noaExamDisplayName')).toHaveText('Nombre del simulacro: Repaso personal');
 await page.evaluate(()=>{renderExam();renderExam();});await expect(page.locator('#noaExamDisplayName')).toHaveCount(1);
 await page.reload();await page.clock.runFor(200);await expect(page.locator('#noaExamDisplayName')).toHaveText('Nombre del simulacro: Repaso personal');
 await page.evaluate(()=>NOA_MIXED_EXAM.start(db.questions.slice(0,10),'completo180',{version:1,mode:'mixed',requestedCount:10,completion:'partial'}));
 await expect(page.locator('#pageTitle')).toHaveText('Simulacro mixto de 10');await expect(page.locator('#noaExamDisplayName')).toBeHidden();
});
test('contrato nuevo de45 local conserva modo completo al recuperar',async({page})=>{
 await page.evaluate(()=>{document.getElementById('noaExamTimed').checked=true;document.getElementById('noaExamDurationMinutes').value='1';startExcobaExam(45);});await page.clock.runFor(200);
 const before=await page.evaluate(()=>({queue:examQueue,score:examScore,answers:examAnswers,timing:NOA_EXAM_SHELL.state().timing,contract:db.activeExam.startContract}));expect(before.contract).toMatchObject({completion:'complete',requestedCount:45,availableCount:45});
 await page.reload();await page.clock.runFor(200);expect(await page.evaluate(()=>({queue:examQueue,score:examScore,answers:examAnswers,timing:NOA_EXAM_SHELL.state().timing,contract:db.activeExam.startContract}))).toEqual(before);await expect(page.locator('#pageTitle')).toHaveText('Entrenamiento local completo 45');
});
test('checkpoint histórico sin contrato se recupera sin añadirle metadatos',async({page})=>{
 await active(page);const seed=await page.evaluate(()=>{const stored=structuredClone(db);delete stored.activeExam.startContract;return {key:KEY,raw:JSON.stringify(stored),answers:stored.activeExam.answers,attempts:stored.attempts};});
 await page.addInitScript(({key,raw})=>localStorage.setItem(key,raw),seed);await page.reload();await page.clock.runFor(200);expect(await page.evaluate(()=>({contract:Object.hasOwn(db.activeExam,'startContract'),total:examQueue.length,answers:examAnswers,attempts:db.attempts}))).toEqual({contract:false,total:4,answers:seed.answers,attempts:seed.attempts});
});
test('contrato de checkpoint contradictorio no sobrescribe el original',async({page})=>{
 await active(page);const seed=await page.evaluate(()=>{const stored=structuredClone(db);stored.activeExam.startContract.mode='excoba-local';stored.activeExam.startContract.completion='complete';return {key:KEY,raw:JSON.stringify(stored),checkpoint:JSON.stringify(stored.activeExam)};});
 await page.addInitScript(({key,raw})=>localStorage.setItem(key,raw),seed);await page.reload();await page.clock.runFor(200);expect(await page.evaluate(()=>examQueue.length)).toBe(0);expect(await page.evaluate(()=>JSON.stringify(db.activeExam))).toBe(seed.checkpoint);expect(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem(KEY)).activeExam))).toBe(seed.checkpoint);
});
test('cantidad ambigua implícita en contexto EXCOBA también se rechaza',async({page})=>{
 await active(page);await page.evaluate(()=>{const select=document.getElementById('examSubject');select.add(new Option('Biología','invariant-s7'));select.value='invariant-s7';window.beforeInvariant=invariantSnapshot();executeCommand('NOA sesión cinco practica aproximadamente 180 preguntas');});
 expect(await page.evaluate(()=>invariantSnapshot()===beforeInvariant)).toBe(true);expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});
});
test('cláusulas de contexto no ocultan una cantidad explícita inválida',async({page})=>{
 const r=await page.evaluate(()=>{
  const cases=['NOA practica EXCOBA de 180-5-5 preguntas 45','NOA practica EXCOBA de 2026-11-10 preguntas 45','NOA practica EXCOBA preguntas 10.11.2026 45','NOA practica EXCOBA sesión cinco preguntas 45'];
  for(const binder of ['por','para','de','con','al'])cases.push('NOA practica EXCOBA preguntas: cuarenta '+binder+' y cinco');
  cases.push('NOA practica EXCOBA cuarenta Biología y cinco preguntas','NOA practica EXCOBA preguntas cuarenta de Biología y cinco');
  const issues=cases.filter(raw=>parseExcobaTrainingCount(raw,45,{subjectNames:['Biología']}).valid);
  const names=Object.freeze({subjectNames:Object.freeze(['Menos','Aproximadamente','Cinco preguntas'])});
  for(const raw of ['NOA practica EXCOBA de menos 180 preguntas','NOA practica EXCOBA de aproximadamente 180 preguntas'])if(parseExcobaTrainingCount(raw,45,names).valid)issues.push(raw);
  return issues;
 });expect(r).toEqual([]);
});
test('las rutas de guía sin examen conservan su comportamiento',async({page})=>{
 const result=await page.evaluate(()=>{
  const guide=smartCreateGuide,calls=[];smartCreateGuide=target=>calls.push(target);
  try{for(const route of [__baseExamCommand,__masterExamCommand,executeCommand]){
   route('NOA crea una guía de Biología');route('NOA crea una guía EXCOBA con quince preguntas');
  }}finally{smartCreateGuide=guide;}return {calls,forbidden:__timedForbidden};
 });expect(result.calls).toHaveLength(6);expect(result.forbidden).toEqual({ai:0,fetch:0});
});
test('parcial legítimo con faltante explícito recupera el estado y no anuncia otro total',async({page})=>{
 await active(page);await page.evaluate(()=>beginExamQueue(db.questions.slice(0,8),'Simulacro',{version:1,mode:'legacy-partial',requestedCount:10,completion:'partial',allowShortfall:true}));await page.clock.runFor(200);
 await expect(page.locator('#pageTitle')).toHaveText('Entrenamiento parcial local 8');await expect(page.locator('#toast')).toContainText('8 de 10 solicitados');
 await page.locator('#examBox button[onclick="answerExam(0)"]').click();await page.evaluate(()=>NOA_EXAM_NAVIGATION.navigateTo(1));await page.clock.runFor(200);
 const capture=()=>page.evaluate(()=>({queue:examQueue,index:examIndex,score:examScore,answers:examAnswers,timing:NOA_EXAM_SHELL.state().timing,kind:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue),attempts:db.attempts}));const before=await capture();await page.reload();await page.clock.runFor(200);expect(await capture()).toEqual(before);
});
test('las API por materia rechazan cantidades no numéricas antes de escribir o generar',async({page})=>{
 await active(page);const failures=await page.evaluate(async()=>{const failures=[];for(const count of ['veintipico','⁻180','180',-5,0,NaN,Infinity])for(const route of [startExamForTarget,smartStartExamForTarget]){await route('Biología',count);if(invariantSnapshot()!==beforeInvariant)failures.push(String(count));}return {failures,forbidden:__timedForbidden};});expect(failures).toEqual({failures:[],forbidden:{ai:0,fetch:0}});
});
test('respaldo con contrato incompatible se rechaza antes de reemplazar datos',async({page})=>{
 await active(page);const r=await page.evaluate(async()=>{
  const backup=await NOA_QUESTION_MEMORY_V25_2.createBackup();if(!backup.ok)throw new Error(backup.error);
  backup.backup.db.activeExam.startContract.completion='complete';backup.backup.db.activeExam.startContract.mode='excoba-local';
  const before=invariantSnapshot(),result=await NOA_QUESTION_MEMORY_V25_2.restoreBackup(backup.backup);return {ok:result.ok,same:before===invariantSnapshot()};
 });expect(r).toEqual({ok:false,same:true});
});
test('contrato completo del respaldo se valida contra su propio catálogo',async({page})=>{
 const r=await page.evaluate(()=>{
  startExcobaExam(180);const candidate=structuredClone(db),snapshot=candidate.activeExam;
  const current={subjects:db.subjects,topics:db.topics};db.subjects=[];db.topics=[];
  try{return {candidate:NOA_EXAM_RECOVERY.validate(snapshot,candidate),unrelated:NOA_EXAM_RECOVERY.validate(snapshot)};}
  finally{db.subjects=current.subjects;db.topics=current.topics;}
 });expect(r).toEqual({candidate:true,unrelated:false});
});
test('modo y renderer de checkpoint deben corresponder',async({page})=>{
 await active(page);const r=await page.evaluate(()=>{const snapshot=structuredClone(db.activeExam);snapshot.startContract.mode='manual';return {accepted:NOA_EXAM_RECOVERY.validate(snapshot),same:invariantSnapshot()===beforeInvariant};});expect(r).toEqual({accepted:false,same:true});
});
test('nombre secundario largo no desborda y captura no comparte referencias',async({page})=>{
 await page.setViewportSize({width:320,height:844});await page.evaluate(()=>NOA_MIXED_EXAM.start(db.questions.slice(0,10),'Repaso'.repeat(80)));await page.clock.runFor(200);
 const r=await page.evaluate(()=>{const first=captureExamStartContract(examAnswers);first.mode='excoba-local';first.displayName='completo180';const current=captureExamStartContract(examAnswers),element=document.getElementById('noaExamDisplayName');return {width:document.documentElement.scrollWidth,mode:current.mode,name:current.displayName,text:element.textContent,scroll:element.scrollWidth,client:element.clientWidth};});
 expect(r.width).toBeLessThanOrEqual(321);expect(r.mode).toBe('mixed');expect(r.name).toBe('Repaso'.repeat(80));expect(r.text).toContain(r.name);expect(r.scroll).toBeLessThanOrEqual(r.client+1);
});
test('invariante E también conserva límites de la ruta por materia',async({page})=>{
 await active(page);const r=await page.evaluate(async()=>{
  const failures=[];for(const route of [__baseExamCommand,__masterExamCommand,executeCommand])for(const amount of ['45','cuarenta y cinco','180','ciento ochenta']){
   await route('NOA inicia un examen de Biología de '+amount+' preguntas');if(invariantSnapshot()!==beforeInvariant)failures.push(amount);
  }
  return {failures,forbidden:__timedForbidden,history:readExamCommandQuantity('NOA inicia un examen de Historia de cuarenta y cinco preguntas',10)};
 });expect(r.failures).toEqual([]);expect(r.forbidden).toEqual({ai:0,fetch:0});expect(r.history).toMatchObject({valid:true,count:45,kind:'exact'});
});
test('los campos de contexto no pueden unir fragmentos de una cantidad',async({page})=>{
 await active(page);for(const raw of ['NOA practica EXCOBA preguntas cuarenta v27.4 y cinco','NOA practica EXCOBA cuarenta fecha 2026-11-10 y cinco preguntas']){
  await page.evaluate(raw=>executeCommand(raw),raw);expect(await page.evaluate(()=>invariantSnapshot()===beforeInvariant)).toBe(true);
 }expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});
});
test('cláusulas exactas combinadas conservan ambas direcciones legítimas',async({page})=>{
 await active(page);await page.evaluate(()=>executeCommand('NOA practica EXCOBA preguntas cinco para fecha 2026-11-10 y cinco reactivos'));
 expect(await page.evaluate(()=>examQueue.length)).toBe(5);expect(await page.evaluate(()=>examScore)).toBe(0);expect(await page.locator('#noaExamEvidenceKind').inputValue()).toBe('unknown');expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});
});
test('API antigua de generación no convierte valores inválidos en predeterminados',async({page})=>{
 await active(page);const r=await page.evaluate(async()=>{
  const failures=[];for(const count of ['veintipico','10','⁻180',null,0,-5,31,NaN,Infinity])for(const route of [NOA_EXCOBA_V3.createQuiz,NOA_EXCOBA_V3.generateQuestions]){
   try{await route('Biología',count);}catch{}if(invariantSnapshot()!==beforeInvariant)failures.push(String(count));
  }return {failures,forbidden:__timedForbidden};
 });expect(r).toEqual({failures:[],forbidden:{ai:0,fetch:0}});
});
test.afterEach(async({page})=>expect(page.auditErrors).toEqual([]));
async function active(page){await startMixed(page,timedQuestions,true,1);await answerTimed(page,timedQuestions[0]);await page.evaluate(()=>{document.getElementById('noaExamEvidenceKind').value='student';db.settings.aiProvider='openai';window.beforeInvariant=invariantSnapshot();});}

test.describe('reproducciones auditoría',()=>{
 for(const command of ['NOA practica EXCOBA preguntas: cuarenta y cinco y pico','NOA practica EXCOBA reactivos: quince y pico','NOA inicia un examen de Biología de veintipico','NOA inicia un examen de Historia de tropecientas','NOA practica EXCOBA de ⁻180 preguntas'])test(command,async({page})=>{
  await active(page);await page.evaluate(command=>executeCommand(command),command);expect(await page.evaluate(()=>invariantSnapshot()===beforeInvariant)).toBe(true);expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});
 });
 test('completo180 mixto no autoriza178',async({page})=>{
  await active(page);await page.evaluate(()=>{try{NOA_MIXED_EXAM.start(db.questions.slice(0,178),'Simulacro completo180');}catch{}});expect(await page.evaluate(()=>invariantSnapshot()===beforeInvariant)).toBe(true);
 });
 test('checkpoint completo180 no recupera178 ni pierde el original',async({page})=>{
  await active(page);const seed=await page.evaluate(()=>{const stored=structuredClone(db);stored.activeExam={...stored.activeExam,mixed:true,title:'Simulacro completo180',queue:db.questions.slice(0,178),index:0,score:0,answers:[],drafts:[],revision:null};stored.activeExam.clock.timing.presentedQuestionIds=[];return {key:KEY,raw:JSON.stringify(stored),checkpoint:JSON.stringify(stored.activeExam)};});
  await page.addInitScript(({key,raw})=>localStorage.setItem(key,raw),seed);await page.reload();await page.clock.runFor(200);expect(await page.evaluate(()=>examQueue.length)).toBe(0);expect(await page.evaluate(()=>JSON.stringify(db.activeExam))).toBe(seed.checkpoint);expect(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem(KEY)).activeExam))).toBe(seed.checkpoint);
 });
});
