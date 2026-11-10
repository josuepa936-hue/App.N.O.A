const {test,expect}=require('@playwright/test');
const {openTimed,startMixed,answerTimed,timedQuestions}=require('./timed-exam-fixtures.cjs');

test.beforeEach(async({page})=>{
 page.errors=[];page.on('pageerror',e=>page.errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(()=>{window.__timedForbidden={ai:0,fetch:0};document.addEventListener('DOMContentLoaded',()=>{window.callAI=()=>{__timedForbidden.ai++;throw new Error('IA real prohibida');};window.fetch=()=>{__timedForbidden.fetch++;throw new Error('Red de motor prohibida');};},{once:true});});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await openTimed(page);
 await page.evaluate(()=>{
  window.spanishBank=()=>{db.questions=[];NOA_EXCOBA_V4.subjects.forEach((s,n)=>{const sid='spanish-s'+n,tid='spanish-t'+n;db.subjects.push({id:sid,name:s.value});db.topics.push({id:tid,subjectId:sid,name:s.label,attempts:0,correct:0});for(let i=0;i<20;i++)db.questions.push({id:n+'-'+i,topicId:tid,text:'Reactivo '+n+' '+i,options:['A','B'],correct:0});});};
  window.spanishSnapshot=()=>JSON.stringify({db,examQueue,examAnswers,examIndex,examScore,clock:NOA_EXAM_SHELL.state(),drafts:[...NOA_EXAM_NAVIGATION.drafts],storage:{...localStorage},pending:document.getElementById('noaExamEvidenceKind').value});spanishBank();
 });
});
test.afterEach(async({page})=>{expect(page.errors).toEqual([]);expect(await page.evaluate(()=>__timedForbidden)).toEqual({ai:0,fetch:0});});
async function active(page){await startMixed(page,timedQuestions,true,1);await answerTimed(page,timedQuestions[0]);await page.evaluate(()=>{document.getElementById('noaExamEvidenceKind').value='student';window.beforeSpanish=spanishSnapshot();});}

test('auditoría: ciento ochenta no se sustituye por45',async({page})=>{
 await page.evaluate(()=>executeCommand('NOA practica EXCOBA de ciento ochenta preguntas'));expect(await page.evaluate(()=>examQueue.length)).toBe(180);
});
for(const command of ['NOA practica EXCOBA de dieciocho preguntas','NOA practica EXCOBA de −180 preguntas'])test('auditoría: rechazo íntegro de '+command,async({page})=>{
 await active(page);await page.evaluate(command=>executeCommand(command),command);expect(await page.evaluate(()=>spanishSnapshot()===beforeSpanish)).toBe(true);
});
test('auditoría: inicio mixto178 no anuncia completo180',async({page})=>{
 await active(page);const result=await page.evaluate(()=>{try{NOA_MIXED_EXAM.start(db.questions.slice(0,178),'Entrenamiento completo 180');}catch{}return spanishSnapshot()===beforeSpanish;});expect(result).toBe(true);
});
test('auditoría: checkpoint mixto178 completo180 conserva original y no inicia',async({page})=>{
 await active(page);const seed=await page.evaluate(()=>{const stored=structuredClone(db);stored.activeExam={...stored.activeExam,mixed:true,title:'Entrenamiento completo 180',queue:db.questions.slice(0,178),index:0,score:0,answers:[],drafts:[],revision:null};stored.activeExam.clock.timing.presentedQuestionIds=[];return {key:KEY,raw:JSON.stringify(stored),checkpoint:JSON.stringify(stored.activeExam)};});
 await page.addInitScript(({key,raw})=>localStorage.setItem(key,raw),seed);await page.reload();await page.clock.runFor(200);
 expect(await page.evaluate(()=>examQueue.length)).toBe(0);expect(await page.evaluate(()=>JSON.stringify(db.activeExam))).toBe(seed.checkpoint);expect(await page.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem(KEY)).activeExam))).toBe(seed.checkpoint);
});

const accepted=[
 ['NOA practica EXCOBA de cinco preguntas',5],['NOA practica EXCOBA de diez preguntas',10],
 ['NOA practica EXCOBA de quince reactivos',15],['NOA practica EXCOBA de veinte preguntas',20],
 ['NOA practica EXCOBA de cuarenta y cinco preguntas',45],['NOA practica EXCOBA de ciento ochenta preguntas',180],
 ['NOA practica EXCOBA preguntas cinco',5],['NOA practica EXCOBA preguntas: diez',10],
 ['NOA practica EXCOBA reactivos de quince',15],['NOA practica EXCOBA reactivos: veinte',20],
 ['NOA practica EXCOBA preguntas cuarenta y cinco',45],['NOA practica EXCOBA reactivos ciento ochenta',180],
 ['NOA sesión cinco, practica EXCOBA ciento ochenta preguntas',180],
 ['NOA EXCOBA 2026 de ciento ochenta reactivos',180],
 ['NOA INICIA UN SIMULACRO EXCOBA DE CÍENTO OCHÉNTA PREGUNTAS',180],
 ['NOA practica EXCOBA ciento ochenta preguntas y 180 reactivos',180],
 ['NOA practica EXCOBA versión v27.4 fecha 10/11/2026 para sesión treinta y dos de quince preguntas',15],
 ['NOA practica EXCOBA',45],['NOA practica EXCOBA para sesión cinco',45],
 ['NOA inicia un simulacro EXCOBA para el año 2026',45],['NOA practica EXCOBA para materia cinco de veinte preguntas',20]
];
const rejected=[
 'NOA practica EXCOBA de dieciocho preguntas','NOA practica EXCOBA de treinta preguntas',
 'NOA practica EXCOBA de dos mil ciento ochenta preguntas','NOA practica EXCOBA de cinco mil preguntas',
 'NOA practica EXCOBA de tropecientas preguntas','NOA practica EXCOBA de veintipico reactivos',
 'NOA practica EXCOBA preguntas: incontables','NOA practica EXCOBA preguntas: bananas',
 'NOA practica EXCOBA de muchas preguntas','NOA practica EXCOBA de un montón de preguntas',
 'NOA practica EXCOBA ciento ochenta preguntas y 45 reactivos',
 'NOA practica EXCOBA preguntas: 10 y reactivos quince',
 'NOA practica EXCOBA de menos ciento ochenta preguntas','NOA practica EXCOBA de −ciento ochenta preguntas',
 'NOA practica EXCOBA de −180 preguntas','NOA practica EXCOBA preguntas: －180',
 'NOA practica EXCOBA de ciento y ochenta preguntas','NOA practica EXCOBA preguntas desconocidas',
 'NOA practica EXCOBA tropecientas','NOA practica EXCOBA de veintipico',
 'NOA practica EXCOBA de treinta','NOA practica EXCOBA de 181 preguntas',
 'NOA practica EXCOBA de − ciento ochenta preguntas'
];
for(const sufficient of [true,false])for(const [command,count] of accepted)test('español admitido '+sufficient+': '+command,async({page})=>{
 await active(page);await page.evaluate(sufficient=>{if(!sufficient)db.questions=[];window.beforeSpanish=spanishSnapshot();},sufficient);
 await page.evaluate(command=>executeCommand(command),command);
 if(sufficient){await page.clock.runFor(200);expect(await page.evaluate(()=>examQueue.length)).toBe(count);expect(await page.locator('#noaExamEvidenceKind').inputValue()).toBe('unknown');}
 else expect(await page.evaluate(()=>spanishSnapshot()===beforeSpanish)).toBe(true);
});
for(const command of rejected)test('español rechazado conserva examen: '+command,async({page})=>{
 await active(page);await page.evaluate(command=>executeCommand(command),command);expect(await page.evaluate(()=>spanishSnapshot()===beforeSpanish)).toBe(true);
});
test('contrato puro distingue reconocido, desconocido y ausencia sin mutar entradas',async({page})=>{
 const r=await page.evaluate(()=>{const inputs=Object.freeze(['NOA practica EXCOBA de ciento ochenta preguntas','NOA practica EXCOBA de dieciocho preguntas','NOA practica EXCOBA']);const before=JSON.stringify(inputs),a=inputs.map(x=>parseExcobaTrainingCount(x)),b=inputs.map(x=>parseExcobaTrainingCount(x));return {a,same:JSON.stringify(a)===JSON.stringify(b),intact:before===JSON.stringify(inputs)};});
 expect(r.same&&r.intact).toBe(true);expect(r.a.map(x=>x.quantityState)).toEqual(['recognized','unrecognized','absent']);expect(r.a[1].count).toBeUndefined();
});
test('sesión cinco sin nombre EXCOBA requiere materia canónica seleccionada',async({page})=>{
 await page.evaluate(()=>{const select=document.getElementById('examSubject');select.add(new Option('Materia canónica','spanish-s0'));select.value='spanish-s0';executeCommand('NOA sesión cinco, practica ciento ochenta preguntas');});
 expect(await page.evaluate(()=>examQueue.length)).toBe(180);
});
for(const command of ['NOA inicia un examen de Biología de dieciocho reactivos','NOA inicia un examen de Historia de treinta preguntas'])test('wrapper sin EXCOBA rechaza palabras sin IA: '+command,async({page})=>{
 await active(page);await page.evaluate(command=>executeCommand(command),command);expect(await page.evaluate(()=>spanishSnapshot()===beforeSpanish)).toBe(true);
});
test('wrapper Temario con proveedor conserva ciento ochenta sin llamar al motor',async({page})=>{
 await page.evaluate(()=>{db.settings.aiProvider='openai';executeCommand('NOA simulacro EXCOBA de Biología de ciento ochenta reactivos');});expect(await page.evaluate(()=>examQueue.length)).toBe(180);
});
for(const n of [178,179,180])for(const explicit of [false,true])test('contrato mixto cantidad '+n+' explícito '+explicit,async({page})=>{
 await active(page);const r=await page.evaluate(({n,explicit})=>{try{NOA_MIXED_EXAM.start(db.questions.slice(0,n),'Etiqueta arbitraria',explicit?{version:1,mode:'excoba-local',requestedCount:180,completion:'complete'}:undefined);}catch{}return {same:spanishSnapshot()===beforeSpanish,total:examQueue.length,title:document.getElementById('pageTitle').textContent};},{n,explicit});
 if(n===180&&explicit){expect(r.total).toBe(180);expect(r.title).toContain('completo 180');}else if(n===180||explicit)expect(r.same).toBe(true);else{expect(r.total).toBe(n);expect(r.title).not.toContain('180');}
});
for(const defect of ['ids','content','distribution'])test('contrato mixto completo rechaza '+defect+' sin mutación',async({page})=>{
 await active(page);await page.evaluate(defect=>{const q=structuredClone(db.questions);if(defect==='ids')q[1].id=q[0].id;if(defect==='content')q.forEach(x=>x.text='Duplicado');if(defect==='distribution')q.forEach(x=>x.topicId=q[0].topicId);try{NOA_MIXED_EXAM.start(q,'180',{version:1,mode:'excoba-local',requestedCount:180,completion:'complete'});}catch{}},defect);expect(await page.evaluate(()=>spanishSnapshot()===beforeSpanish)).toBe(true);
});
test('mixto180 válido recupera deadline, índice, respuesta, crédito y procedencia',async({page})=>{
 await active(page);await page.evaluate(()=>NOA_MIXED_EXAM.start(db.questions,'Título ignorado',{version:1,mode:'excoba-local',requestedCount:180,completion:'complete'}));await page.clock.runFor(200);
 await page.locator('#examBox button[onclick="answerExam(0)"]').click();await page.evaluate(()=>NOA_EXAM_NAVIGATION.navigateTo(1));await page.clock.runFor(200);
 const capture=()=>page.evaluate(()=>({queue:examQueue,index:examIndex,score:examScore,answers:examAnswers,timing:NOA_EXAM_SHELL.state().timing,kind:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue),attempts:db.attempts}));
 const before=await capture();expect(before.timing.deadlineAt).toBeGreaterThan(0);await page.reload();await page.clock.runFor(200);expect(await capture()).toEqual(before);
});
test('título mixto ciento ochenta tampoco autoriza una cola parcial',async({page})=>{
 await active(page);await page.evaluate(()=>{try{NOA_MIXED_EXAM.start(db.questions.slice(0,178),'EXCOBA ciento ochenta');}catch{}});expect(await page.evaluate(()=>spanishSnapshot()===beforeSpanish)).toBe(true);
});
