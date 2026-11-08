const {test,expect}=require('@playwright/test');
const {openTimed,startMixed,expire,timedQuestions}=require('./timed-exam-fixtures.cjs');
const panel=page=>page.locator('#noaStudyPlan');
test.beforeEach(async({page})=>{
 page.planErrors=[];page.on('pageerror',e=>page.planErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')page.planErrors.push(m.text());});
 page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:8022'&&['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 await openTimed(page);
 await page.evaluate(()=>{
  window.planAttempt=(id,credits,code='1.1.1',subject='EXCOBA Primaria · Español',at='2026-05-01T12:00:00Z')=>({id,evidenceKind:'student',total:credits.length,score:credits.reduce((a,b)=>a+b,0),at,answers:credits.map((credit,i)=>({questionId:id+'-'+i,subject,syllabusCode:code,interactionType:'drag_classify',scoreFraction:credit,ok:credit===1}))});
  window.planHistory=()=>[
   planAttempt('weak-a',[0,.5]),planAttempt('weak-b',[0,.5]),
   planAttempt('mix-a',[1,.5],'1.1.2'),planAttempt('mix-b',[1,.5],'1.1.2'),
   planAttempt('good-a',[1,1],'1.2.1','EXCOBA Primaria · Matemáticas'),planAttempt('good-b',[1,1],'1.2.1','EXCOBA Primaria · Matemáticas'),
   planAttempt('few',[1],'1.1.3',undefined,null)
  ];
 });
});
test.afterEach(async({page})=>expect(page.planErrors).toEqual([]));
async function seed(page){await page.evaluate(()=>{db.attempts=planHistory();save();});}

test('historial vacío y ubicación independiente de ancho completo',async({page})=>{
 await expect(panel(page)).toContainText('Mi plan de estudio — Recomendaciones NOA');
 await expect(panel(page)).toContainText('Historial vacío');
 expect(await page.evaluate(()=>document.getElementById('noaStudyPlan').parentElement.id)).toBe('exam');
 expect(await page.evaluate(()=>!!document.querySelector('#examStats #noaStudyPlan'))).toBe(false);
 await expect(panel(page).locator('article')).toHaveCount(0);
});
test('sesiones académicas, cuatro prioridades y créditos parciales con nombres reales',async({page})=>{
 await seed(page);await expect(panel(page).locator('article')).toHaveCount(4);
 for(const priority of ['reforzar','practicar','repasar','evaluar'])await expect(panel(page).locator('[data-priority="'+priority+'"]').first()).toBeVisible();
 await expect(panel(page).locator('[data-subtopic="1.1.1"]')).toContainText('1/4 créditos');
 await expect(panel(page).locator('[data-priority="evaluar"]')).toContainText('Evidencia insuficiente');
 const title=await page.evaluate(()=>NOA_ACADEMIC_RESULTS_V27.catalog().items.find(x=>x.code==='1.1.1').title);
 await expect(panel(page)).toContainText(title);
 const actual=await panel(page).locator('article').evaluateAll(nodes=>nodes.map(n=>n.dataset.priority));
 expect(actual).toEqual(['reforzar','practicar','repasar','evaluar']);
});
for(const kind of ['technical_test','unknown'])test('excluye procedencia '+kind,async({page})=>{
 await page.evaluate(kind=>{db.attempts=planHistory().map(a=>({...a,evidenceKind:kind}));save();},kind);
 await expect(panel(page).locator('article')).toHaveCount(0);
 await expect(panel(page)).toContainText('No hay sesiones de estudio declaradas');
 await expect(panel(page)).toContainText('no aporta evidencia de dominio');
});
test('datos insuficientes y fechas faltantes no inventan repaso',async({page})=>{
 await page.evaluate(()=>{db.attempts=[planAttempt('one',[.5],undefined,undefined,null)];save();});
 const card=panel(page).locator('article');await expect(card).toContainText('Evaluar');
 await expect(card).toContainText('Próximo repaso sugerido: Sin fecha verificable');
 await card.locator('summary').click();await expect(card).toContainText('Última práctica verificable: Sin fecha verificable');
});
test('fechas válidas muestran práctica, repaso y vencimiento',async({page})=>{
 await seed(page);const card=panel(page).locator('[data-subtopic="1.1.1"]');
 await expect(card).toContainText('Vencido');await card.locator('summary').click();
 await expect(card).toContainText('Última práctica verificable:');
 await expect(card).not.toContainText('Sin fecha verificable');
});
test('un intento recién guardado dentro del minuto no se excluye como futuro',async({page})=>{
 await page.clock.runFor(37500);
 await page.evaluate(()=>{db.attempts=[planAttempt('just-saved',[.5],undefined,undefined,new Date().toISOString())];save();});
 await expect(panel(page).locator('article')).toHaveCount(1);
 await expect(panel(page)).toContainText('0.5/1 créditos');
 expect(await page.evaluate(()=>NOA_STUDY_RECOMMENDATIONS_UI_V27.state().referenceDate===db.attempts[0].at)).toBe(true);
});
test('catálogo temporalmente ausente se recupera sin guardar ni responder',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{window.realPlanCatalog=NOA_ACADEMIC_RESULTS_V27.catalog;NOA_ACADEMIC_RESULTS_V27={...NOA_ACADEMIC_RESULTS_V27,catalog:()=>({source:'unavailable',subjects:[],items:[]})};NOA_STUDY_RECOMMENDATIONS_UI_V27.refresh();});
 await expect(panel(page)).toContainText('temporalmente no disponibles');await expect(panel(page).locator('article')).toHaveCount(0);
 await page.evaluate(()=>{NOA_ACADEMIC_RESULTS_V27={...NOA_ACADEMIC_RESULTS_V27,catalog:realPlanCatalog};});
 await page.clock.runFor(300);
 await expect(panel(page).locator('article')).toHaveCount(4);
});
test('carga inicial espera catálogo y no produce clasificación provisional',async({page})=>{
 await seed(page);
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
  window.realInitialCatalog=NOA_ACADEMIC_RESULTS_V27.catalog;
  NOA_ACADEMIC_RESULTS_V27={...NOA_ACADEMIC_RESULTS_V27,catalog:()=>({source:'unavailable',subjects:[],items:[]})};
 },{once:true}));
 await page.reload();await page.waitForFunction(()=>!!window.NOA_STUDY_RECOMMENDATIONS_UI_V27);
 expect(await page.evaluate(()=>NOA_STUDY_RECOMMENDATIONS_UI_V27.state().ready)).toBe(false);
 await page.evaluate(()=>{NOA_ACADEMIC_RESULTS_V27={...NOA_ACADEMIC_RESULTS_V27,catalog:realInitialCatalog};});
 await page.clock.runFor(300);expect(await page.evaluate(()=>NOA_STUDY_RECOMMENDATIONS_UI_V27.state().ready)).toBe(true);
});
test('filtros por materia, prioridad, sin coincidencias y ver todas son funcionales',async({page})=>{
 await seed(page);
 await panel(page).locator('#noaPlanSubject').selectOption('EXCOBA Primaria · Matemáticas');
 await expect(panel(page).locator('article')).toHaveCount(1);
 await panel(page).getByLabel('Prioridad',{exact:true}).selectOption('reforzar');
 await expect(panel(page)).toContainText('No hay recomendaciones para los filtros');
 await panel(page).getByRole('button',{name:'Ver todas',exact:true}).click();
 await expect(panel(page).locator('article')).toHaveCount(4);
 await panel(page).getByLabel('Prioridad',{exact:true}).selectOption('practicar');await expect(panel(page).locator('article')).toHaveCount(1);
});
test('vencidos excluye fechas futuras y no calculables; orden calculado se restaura',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{db.attempts.push(planAttempt('future-review',[1],'1.1.4',undefined,'2026-06-01T11:00:00Z'));save();});
 await panel(page).getByLabel('Solo repasos vencidos').check();
 await expect(panel(page).locator('[data-subtopic="1.1.4"]')).toHaveCount(0);
 await expect(panel(page).locator('[data-subtopic="1.1.3"]')).toHaveCount(0);
 await panel(page).getByRole('button',{name:'Ver todas',exact:true}).click();
 await panel(page).getByLabel('Orden de presentación').selectOption('subject');
 await panel(page).getByLabel('Orden de presentación').selectOption('priority');
 expect(await panel(page).locator('article').first().getAttribute('data-priority')).toBe('reforzar');
});
test('filtros y render repetido reutilizan cálculo, foco y nodos sin duplicar',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{
  window.planBuilds=0;const build=NOA_STUDY_RECOMMENDATIONS_V27.build;
  NOA_STUDY_RECOMMENDATIONS_V27={...NOA_STUDY_RECOMMENDATIONS_V27,build:(...args)=>{planBuilds++;return build(...args);}};
  for(let i=0;i<3;i++){renderExamStats();NOA_STUDY_RECOMMENDATIONS_UI_V27.refresh();}
 });
 await panel(page).getByLabel('Prioridad',{exact:true}).focus();
 await panel(page).getByLabel('Prioridad',{exact:true}).selectOption('repasar');
 await expect(panel(page).getByLabel('Prioridad',{exact:true})).toBeFocused();
 expect(await page.evaluate(()=>planBuilds)).toBe(0);
 await expect(page.locator('#noaStudyPlan')).toHaveCount(1);
 await expect(panel(page).locator('article')).toHaveCount(1);
});
test('render y filtros no escriben almacenamiento, historial, Calibrator ni puntuación',async({page})=>{
 await seed(page);
 expect(await page.evaluate(()=>{
  const snapshot=()=>JSON.stringify({db,storage:{...localStorage},cal:NOA_CALIBRATOR.get(),examScore,examAnswers});
  const before=snapshot(),set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  Storage.prototype.setItem=Storage.prototype.removeItem=()=>{throw Error('write forbidden');};
  try{NOA_STUDY_RECOMMENDATIONS_UI_V27.refresh();document.getElementById('noaPlanPriority').value='repasar';document.getElementById('noaPlanPriority').dispatchEvent(new Event('change'));return snapshot()===before;}
  finally{Storage.prototype.setItem=set;Storage.prototype.removeItem=remove;}
 })).toBe(true);
});
test('restaurar respaldo actualiza panel sin duplicar ni modificar su contenido',async({page})=>{
 await seed(page);const backup=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(backup.ok).toBe(true);
 await page.evaluate(()=>{db.attempts=[];save();});await expect(panel(page).locator('article')).toHaveCount(0);
 expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup.backup)).ok).toBe(true);
 await expect(panel(page).locator('article')).toHaveCount(4);
 expect(await page.evaluate(()=>db.attempts.length)).toBe(7);
});
test('contenido dinámico se representa como texto seguro',async({page})=>{
 await seed(page);
 await page.evaluate(()=>{
  const catalog=NOA_ACADEMIC_RESULTS_V27.catalog();catalog.items.find(i=>i.code==='1.1.1').title='<img src=x onerror="window.planInjected=true">';
  NOA_ACADEMIC_RESULTS_V27={...NOA_ACADEMIC_RESULTS_V27,catalog:()=>catalog};
  NOA_STUDY_RECOMMENDATIONS_UI_V27.refresh();
 });
 await expect(panel(page)).toContainText('<img src=x');await expect(panel(page).locator('img')).toHaveCount(0);
 expect(await page.evaluate(()=>!!window.planInjected)).toBe(false);
});
for(const width of [390,1365])test('teclado y captura responsive '+width,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await seed(page);
 const summary=panel(page).locator('summary').first();await summary.focus();await page.keyboard.press('Enter');
 await expect(panel(page).locator('details').first()).toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await panel(page).screenshot({path:info.outputPath('study-plan-'+width+'.png')});
});
for(const count of [5,10,45])test('cierre v26 de '+count+' preguntas actualiza el plan sin duplicar intentos',async({page})=>{
 await page.locator('#noaExamEvidenceKind').selectOption('student');
 const queue=Array.from({length:count},(_,i)=>({...timedQuestions[0],id:'plan-timed-'+i}));
 await startMixed(page,queue);await expire(page);
 await expect(panel(page)).toContainText('No hay evidencia académica suficiente y admisible');
 const model=await page.evaluate(()=>({attempts:db.attempts.length,score:examScore,omitted:examAnswers.filter(a=>a.omitted).length}));
 expect(model).toEqual({attempts:1,score:0,omitted:count});
});
test.describe('offline',()=>{test.use({serviceWorkers:'allow'});test('panel y datos cargan desde caché aislada sin conexión',async({page,context})=>{
 await seed(page);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.NOA_STUDY_RECOMMENDATIONS_UI_V27);
 await page.clock.runFor(200);await page.locator('#nav button[data-page="exam"]').click();
 await expect(panel(page).locator('article')).toHaveCount(4);
 expect(await page.evaluate(()=>db.attempts.length)).toBe(7);
});});
