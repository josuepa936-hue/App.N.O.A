const {test,expect}=require('@playwright/test');
const {openGenerator}=require('./generator-fixtures.cjs');
const {installExam45Fixture}=require('./exam-45-ui-fixtures.cjs');
const {answer}=require('./fixtures.cjs');

test.beforeEach(async({page})=>{
 page.physicsErrors=[];page.on('pageerror',e=>page.physicsErrors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('speakReplies').checked=false;
  window.callAI=()=>{throw new Error('No IA real');};
 },{once:true}));
 await openGenerator(page);
 await page.evaluate(()=>{db.masterSyllabus={id:'uaq-excoba-2026-2-medicina',items:NOA_EXCOBA_FIX_V5.items.map(x=>({...x}))};save();});
});
test.afterEach(async({page})=>expect(page.physicsErrors).toEqual([]));

test('activar Física desde Biblioteca conserva catálogo, preguntas, historial y temas previos',async({page})=>{
 const before=await page.evaluate(()=>({subjects:structuredClone(db.subjects),topics:structuredClone(db.topics),questions:structuredClone(db.questions),attempts:structuredClone(db.attempts),master:structuredClone(db.masterSyllabus)}));
 await page.locator('#nav button[data-page="notes"]').click();
 await page.getByRole('button',{name:'Activar Física en Materias',exact:true}).click();
 const after=await page.evaluate(()=>({subjects:db.subjects,topics:db.topics,questions:db.questions,attempts:db.attempts,master:db.masterSyllabus,physics:NOA_EXCOBA_PREPARATION.physics().value}));
 expect(after.subjects.slice(0,before.subjects.length)).toEqual(before.subjects);expect(after.subjects.at(-1).name).toBe(after.physics);
 expect(after.topics.slice(0,before.topics.length)).toEqual(before.topics);expect(after.topics.length).toBe(before.topics.length+8);
 expect(after.questions).toEqual(before.questions);expect(after.attempts).toEqual(before.attempts);expect(after.master).toEqual(before.master);
 await page.getByRole('button',{name:'Activar Física en Materias',exact:true}).click();expect(await page.evaluate(()=>db.topics.length)).toBe(after.topics.length);
});

test('perfil B de 45 se recupera intacto aunque la selección futura vuelva a A',async({page})=>{
 await page.locator('#noaPreparationProfile').selectOption('B');await installExam45Fixture(page,{preparationProfile:'B'});
 await page.evaluate(()=>NOA_EXAM_UI_V25.generate());expect(await page.evaluate(()=>examQueue.length)).toBe(45);
 await answer(page,await page.evaluate(()=>examQueue[0]));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem(KEY))?.activeExam?.answers?.length===1);
 const read=()=>page.evaluate(()=>({queue:examQueue,answers:examAnswers,score:examScore,attempts:db.attempts}));
 const before=await read();await page.reload();await page.waitForFunction(()=>examQueue.length===45);
 expect(await read()).toEqual(before);await expect(page.locator('#noaPreparationProfile')).toHaveValue('A');
 expect(await page.evaluate(()=>new Set(examQueue.filter(q=>q.groupId==='medicine').map(q=>q.subject)).size)).toBe(3);
});

test.describe('Física con Service Worker real',()=>{
 test.use({serviceWorkers:'allow'});
 test('v6-97 conserva módulo, catálogo y perfiles offline y rechaza generación sin conexión',async({page,context})=>{
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const cache=await page.evaluate(async()=>{const scope=(await navigator.serviceWorker.getRegistration()).scope,name=(await caches.keys()).find(n=>n.startsWith('noa-mobile:'+encodeURIComponent(scope)+':'));return {name,asset:!!await(await caches.open(name)).match(new URL('excoba_patch_preparation_physics.js',scope).href)};});
  expect(cache.name).toMatch(/:v6-97$/);expect(cache.asset).toBe(true);
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.NOA_EXCOBA_PREPARATION);
  await page.locator('#nav button[data-page="exam"]').click();await page.locator('#noaPreparationProfile').selectOption('B');
  await page.locator('#noaGeneratorSubject').selectOption(await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value));
  expect(await page.evaluate(()=>NOA_EXAM_PLAN_V25.build({preparationProfile:'B'}).valid)).toBe(true);
  const before=await page.evaluate(()=>JSON.stringify({db,examQueue,examAnswers,examScore,examIndex}));
  await page.locator('#noaGeneratorGenerate').click();await expect(page.locator('#noaGeneratorPhase')).toHaveText('Error del motor');await expect(page.locator('#noaGeneratorDetails')).toContainText('Sin conexión');
  expect(await page.evaluate(()=>JSON.stringify({db,examQueue,examAnswers,examScore,examIndex}))).toBe(before);
 });
});
