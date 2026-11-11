const {test,expect}=require('@playwright/test');
const {openGenerator,mockBatch}=require('./generator-fixtures.cjs');
const {questions,answer,assign}=require('./fixtures.cjs');
const {installClock}=require('./timed-exam-fixtures.cjs');
const {installExam45Fixture}=require('./exam-45-ui-fixtures.cjs');

async function activeSession(page){
 await page.evaluate(q=>NOA_MIXED_EXAM.start(q,'Examen anterior protegido'),questions);await page.clock.runFor(200);
 await answer(page,questions[0]);await page.clock.runFor(200);await page.evaluate(()=>NOA_EXAM_NAVIGATION.navigateTo(1));await page.clock.runFor(200);
 await answer(page,questions[1],'partial');await page.clock.runFor(200);await page.locator('#noaRevisionEdit').click();await assign(page,'two','odd');
}

test.beforeEach(async({page})=>{
 page.physicsErrors=[];page.on('pageerror',e=>page.physicsErrors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{document.getElementById('speakReplies').checked=false;window.__physicsForbidden={ai:0,fetch:0};window.callAI=()=>{__physicsForbidden.ai++;throw new Error('No IA real');};window.fetch=()=>{__physicsForbidden.fetch++;throw new Error('No servicio externo');};},{once:true}));
 await installClock(page);await openGenerator(page);await page.evaluate(()=>{db.masterSyllabus={id:'uaq-excoba-2026-2-medicina',items:NOA_EXCOBA_FIX_V5.items.map(x=>({...x}))};save();});await page.clock.runFor(200);
});
test.afterEach(async({page})=>{expect(page.physicsErrors).toEqual([]);expect(await page.evaluate(()=>__physicsForbidden)).toEqual({ai:0,fetch:0});});

test('catálogo alternativo tiene ocho códigos propios, fuente explícita y conserva las nueve materias originales',async({page})=>{
 const data=await page.evaluate(()=>{const p=NOA_EXCOBA_PREPARATION;return {original:NOA_EXCOBA_V4.subjects.length,available:p.trainingSubjects().length,items:p.items(),reference:p.reference(),official:NOA_EXCOBA_FIX_V5.items.length,stored:db.masterSyllabus.items.length,catalog:NOA_ACADEMIC_RESULTS_V27.catalog()};});
 expect(data.original).toBe(9);expect(data.available).toBe(10);expect(data.items.map(i=>i.code)).toEqual(['3.3.1.1','3.3.1.2','3.3.1.3','3.3.1.4','3.3.2.1','3.3.2.2','3.3.2.3','3.3.2.4']);expect(data.reference).toMatchObject({kind:'alternative',confirmedForMedicine:false,acquisition:'user-transcription'});expect(data.items.every(i=>i.page===null)).toBe(true);expect(data.stored).toBe(data.official);expect(data.catalog.items.length).toBe(data.official+8);
 const physics=await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value);await expect(page.locator('#noaGeneratorSubject option').filter({hasText:'Física'})).toHaveAttribute('value',physics);await page.locator('#noaGeneratorSubject').selectOption(physics);await expect(page.locator('#noaPhysicsGenerationNotice')).toContainText('no confirmada');
});

for(const id of ['A','B'])test('plan '+id+': exactamente nueve materias, 45 slots y distribución 10/20/15',async({page})=>{
 const r=await page.evaluate(id=>{const p=NOA_EXCOBA_PREPARATION,plan=NOA_EXAM_PLAN_V25.build({preparationProfile:id});return {plan,physics:p.physics().value,formats:NOA_BATCH_ORCHESTRATOR.supportedTypes,profile:NOA_SOURCE_ENGINE.getProfile()};},id);
 expect(r.plan.valid).toBe(true);expect(r.plan.subjects).toHaveLength(9);expect(r.plan.slots).toHaveLength(45);expect(new Set(r.plan.slots.map(s=>s.id)).size).toBe(45);expect(r.plan.groups.map(g=>g.requiredCount)).toEqual([10,20,15]);const specialty=r.plan.subjects.filter(s=>s.groupId==='medicine');expect(specialty).toHaveLength(3);expect(specialty.some(s=>s.id===r.physics)).toBe(id==='B');expect(specialty.some(s=>s.id.includes('estadística'))).toBe(id==='A');expect(r.plan.profile.key).toBe(r.profile.key);expect(r.plan.slots.every(s=>r.formats.includes(s.blueprintSlot.interactionType))).toBe(true);
});

test('cambiar A/B no escribe almacenamiento ni modifica examen, historial o perfil v6',async({page})=>{
 await activeSession(page);await page.clock.runFor(200);const before=await page.evaluate(()=>JSON.stringify({db,examQueue,examAnswers,examScore,examIndex,clock:NOA_EXAM_SHELL.state(),storage:{...localStorage}}));
 await page.locator('#noaPreparationProfile').selectOption('B');await page.locator('#noaPreparationProfile').selectOption('A');expect(await page.evaluate(()=>JSON.stringify({db,examQueue,examAnswers,examScore,examIndex,clock:NOA_EXAM_SHELL.state(),storage:{...localStorage}}))).toBe(before);
});

test('Blueprint y reemplazo de Física conservan dificultad, formatos, referencia y fallback sin atribución oficial',async({page})=>{
 const r=await page.evaluate(()=>{const p=NOA_EXCOBA_PREPARATION,subject=p.physics().value,b=NOA_SOURCE_BLUEPRINT.build({subject,count:10,supportedInteractionTypes:NOA_BATCH_ORCHESTRATOR.supportedTypes,diversifyTopics:true}),replacement=NOA_SOURCE_BLUEPRINT.replaceSlot(b.slots[0],1);return {b,replacement,context:p.sourceContext(b.slots[0])};});
 for(const slot of [...r.b.slots,r.replacement]){expect(slot.source.reference.confirmedForMedicine).toBe(false);expect(slot.source.reference.acquisition).toBe('user-transcription');expect(slot.sourceType).toBe('extended');expect(slot.syllabusCodes.every(c=>c.startsWith('3.3.'))).toBe(true);expect(['single_select','inline_select','drag_classify','drag_order']).toContain(slot.interactionType);}
 expect(r.replacement.difficulty).toEqual(r.b.slots[0].difficulty);expect(r.replacement.interactionType).toBe(r.b.slots[0].interactionType);expect(r.context).toContain('no confirmada para Medicina UAQ');
});

for(const count of [5,10])test('generador inteligente inicia '+count+' de Física sin banco previo y preserva trazabilidad',async({page})=>{
 await mockBatch(page);await page.locator('#noaGeneratorSubject').selectOption(await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value));await page.locator('#noaGeneratorCount').selectOption(String(count));await page.locator('#noaGeneratorGenerate').click();await page.clock.runFor(200);await expect.poll(()=>page.evaluate(()=>examQueue.length)).toBe(count);
 const r=await page.evaluate(()=>({queue:examQueue,topics:db.topics.filter(t=>t.source===NOA_EXCOBA_PREPARATION.reference().id),bank:db.questions.length}));expect(r.bank).toBe(0);expect(r.topics).toHaveLength(8);expect(r.queue.every(q=>q.sourceTrace.reference.confirmedForMedicine===false&&r.topics.some(t=>t.id===q.topicId))).toBe(true);expect(new Set(r.queue.map(q=>q.interactionType)).size).toBe(4);
});

test('lote incompleto de Física conserva la sesión anterior y no crea temas ni intentos',async({page})=>{
 await activeSession(page);await page.clock.runFor(200);await mockBatch(page,'incomplete');await page.locator('#noaGeneratorSubject').selectOption(await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value));const before=await page.evaluate(()=>JSON.stringify({db,examQueue,examIndex,examScore,examAnswers,storage:{...localStorage}}));await page.evaluate(()=>{void NOA_GENERATOR_UI.generate();});await page.clock.runFor(200);await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación incompleta');expect(await page.evaluate(()=>JSON.stringify({db,examQueue,examIndex,examScore,examAnswers,storage:{...localStorage}}))).toBe(before);
});

for(const id of ['A','B'])test('Multibatch real y UI completan perfil '+id+' con tres especialidades y 45 reactivos sintéticos',async({page})=>{
 await page.locator('#noaPreparationProfile').selectOption(id);await installExam45Fixture(page,{preparationProfile:id});await page.evaluate(()=>{window.physicsGeneration=NOA_EXAM_UI_V25.generate();});for(let i=0;i<80;i++){await page.clock.runFor(100);if(await page.evaluate(()=>!NOA_EXAM_UI_V25.state().busy))break;}await page.evaluate(()=>physicsGeneration);
 const r=await page.evaluate(()=>({phase:NOA_EXAM_UI_V25.state().phase,queue:examQueue,profile:__exam45Fixture.plan.preparationProfile,forbidden:__multiFixture.stats.forbidden,physics:NOA_EXCOBA_PREPARATION.physics().value}));expect(r.queue).toHaveLength(45);expect(r.profile).toBe(id);expect(new Set(r.queue.filter(q=>q.groupId==='medicine').map(q=>q.subject)).size).toBe(3);expect(r.queue.some(q=>q.subject===r.physics)).toBe(id==='B');expect(r.queue.filter(q=>q.groupId==='medicine').some(q=>q.subject.includes('estadística'))).toBe(id==='A');expect(Object.values(r.forbidden)).toEqual([0,0,0,0,0,0]);
});

test('práctica parcial local de Física usa dos disponibles y no modifica Estadística',async({page})=>{
 await page.evaluate(()=>{const p=NOA_EXCOBA_PREPARATION;const old=JSON.stringify(db.topics);p.ensurePhysicsTopics();const topic=db.topics.find(t=>t.syllabusCode==='3.3.1.1');db.questions=[0,1].map(i=>({id:'physics-local-'+i,topicId:topic.id,text:'Pregunta local de Física '+i,options:['A','B'],correct:0}));save();window.previousPhysicsTopics=old;});
 await page.locator('#noaGeneratorSubject').selectOption(await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value));await page.locator('#noaPhysicsPractice').click();await page.clock.runFor(200);expect(await page.evaluate(()=>examQueue.length)).toBe(2);await expect(page.locator('#pageTitle')).toHaveText('Entrenamiento parcial local 2');await expect(page.locator('#toast')).toContainText('2 de 5 solicitados');
 const prior=await page.evaluate(()=>JSON.parse(previousPhysicsTopics));const now=await page.evaluate(()=>db.topics.filter(t=>!t.syllabusCode?.startsWith('3.3.')));expect(now).toEqual(prior);
});

test('180 completo rechaza faltantes B, conserva sesión y acepta distribución exacta de ambos perfiles',async({page})=>{
 await activeSession(page);await page.clock.runFor(200);await page.locator('#noaPreparationProfile').selectOption('B');const before=await page.evaluate(()=>JSON.stringify({db,examQueue,examAnswers,examScore,examIndex,clock:NOA_EXAM_SHELL.state(),storage:{...localStorage}}));await page.evaluate(()=>startExcobaExam(180));expect(await page.evaluate(()=>JSON.stringify({db,examQueue,examAnswers,examScore,examIndex,clock:NOA_EXAM_SHELL.state(),storage:{...localStorage}}))).toBe(before);
 await page.evaluate(()=>{const p=NOA_EXCOBA_PREPARATION;p.ensurePhysicsTopics();db.questions=[];for(const [i,s] of p.trainingSubjects().entries()){const subject=db.subjects.find(x=>x.name===s.value),topic=db.topics.find(t=>t.subjectId===subject.id);for(let n=0;n<20;n++)db.questions.push({id:`full-${i}-${n}`,topicId:topic.id,text:`Reactivo ${i} ${n}`,options:['A','B'],correct:0});}});
 for(const id of ['A','B']){await page.locator('#noaPreparationProfile').selectOption(id);await page.evaluate(()=>startExcobaExam(180));expect(await page.evaluate(()=>({count:examQueue.length,valid:validateLocalExcobaQueue(examQueue,180).valid,subjects:new Set(examQueue.map(q=>subjectBy(topicBy(q.topicId).subjectId).name)).size}))).toEqual({count:180,valid:true,subjects:9});}
 const mixed=await page.evaluate(()=>{const q=structuredClone(examQueue),stats=db.questions.find(q=>subjectBy(topicBy(q.topicId).subjectId).name.includes('estadística'));q[0]=stats;return validateLocalExcobaQueue(q,180).valid;});expect(mixed).toBe(false);
});

test('clasificación académica y recomendaciones incluyen Física sin reclasificar Estadística',async({page})=>{
 const r=await page.evaluate(()=>{const p=NOA_EXCOBA_PREPARATION,catalog=NOA_ACADEMIC_RESULTS_V27.catalog();const attempts=[{id:'physics-study',at:'2026-05-01T12:00:00.000Z',evidenceKind:'student',total:1,score:.5,answers:[{questionId:'physics-r',subject:p.physics().value,syllabusCode:'3.3.1.1',interactionType:'single_select',ok:false,scoreFraction:.5}]}];const stats=NOA_ACADEMIC_STATS_V27.aggregate(attempts[0],{catalog,evidenceKind:'student'});const recommendations=NOA_STUDY_RECOMMENDATIONS_V27.build(attempts,{catalog,referenceDate:'2026-06-01T12:00:00.000Z'});return {stats,recommendations,physics:p.physics().value,statsCode:catalog.items.find(i=>i.code==='3.1.1.1')?.subject};});
 expect(r.stats.sections[0].id).toBe('medicine');expect(r.stats.sections[0].children[0].id).toBe(r.physics);expect(r.stats.stats.credit).toBe(.5);expect(r.statsCode).toContain('estadística');expect(r.recommendations.recommendations.some(x=>x.subjectId===r.physics)).toBe(true);
});

test('metadatos Physics no pueden dirigir sus aciertos al tema de Estadística',async({page})=>{
 const r=await page.evaluate(()=>{const p=NOA_EXCOBA_PREPARATION,stats=db.topics.find(t=>subjectBy(t.subjectId).name.includes('estadística')),before=structuredClone(stats);NOA_MIXED_EXAM.start([{id:'physics-bound-topic',subject:p.physics().value,syllabusCode:'3.3.1.1',topicId:stats.id,text:'Tema de Física',options:['A','B'],correct:0}],'Práctica Física');answerExam(0);return {before,after:stats,topic:topicBy(examQueue[0].topicId),physics:p.physics().value};});expect(r.after).toEqual(r.before);expect(r.topic.syllabusCode).toBe('3.3.1.1');expect(r.topic.attempts).toBe(1);
});

test('recarga y respaldo de examen Physics conservan crédito, procedencia y memoria',async({page})=>{
 await mockBatch(page);await page.locator('#noaGeneratorSubject').selectOption(await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value));await page.locator('#noaGeneratorGenerate').click();await page.clock.runFor(200);await page.locator('#examBox button[onclick="answerExam(0)"]').click();await page.clock.runFor(200);
 const read=()=>page.evaluate(()=>({queue:examQueue,index:examIndex,score:examScore,answers:examAnswers,attempts:db.attempts,provenance:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue)}));const before=await read(),backup=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(backup.ok).toBe(true);await page.reload();await page.clock.runFor(200);expect(await read()).toEqual(before);expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup.backup)).ok).toBe(true);expect(await read()).toEqual(before);
});

for(const width of [320,390,1365])test('interfaz Physics y perfiles sin desbordamiento a '+width,async({page})=>{
 await page.setViewportSize({width,height:900});await page.locator('#noaPreparationProfile').selectOption('B');await page.locator('#noaGeneratorSubject').selectOption(await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value));await expect(page.locator('#noaPhysicsGenerationNotice')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);await page.screenshot({path:`/tmp/noa-physics-${width}.png`,fullPage:true});
});
