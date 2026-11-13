const {test,expect}=require('@playwright/test');
const {openGenerator,activeSession}=require('./generator-fixtures.cjs');
const {configure,mockBridge,physicsBridge,receipt}=require('./ai-bridge-v2-fixtures.cjs');
test.beforeEach(async({page})=>{
 page.quotaErrors=[];page.on('pageerror',e=>page.quotaErrors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{document.getElementById('speakReplies').checked=false;},{once:true}));
 await openGenerator(page);await configure(page);
});
test.afterEach(async({page})=>expect(page.quotaErrors).toEqual([]));
test('Batch corta al primer 429 sin reposiciones ni errores académicos',async({page})=>{
 const calls=await mockBridge(page,()=>({status:429,body:{error:'Límite sintético',code:'quota_exceeded',rateLimit:{type:'temporary',retryAfterSeconds:20}}}));
 const result=await page.evaluate(async()=>{try{const batch=await NOA_BATCH_ORCHESTRATOR.generate({subject:NOA_EXCOBA_PREPARATION.physics().value,blueprintCount:5,limit:5,concurrency:1,maxAttempts:2,diversifyTopics:true,avoidHistoryDuplicates:true});return {resolved:true,summary:batch.summary};}catch(e){return {resolved:false,code:e.code,status:e.status,rateLimit:e.rateLimit};}});
 expect(calls).toHaveLength(1);expect(result).toMatchObject({resolved:false,code:'quota_exceeded',status:429,rateLimit:{type:'temporary'}});
});

const limit=(type='temporary',seconds=20)=>({status:429,body:{code:'quota_exceeded',rateLimit:{type,retryAfterSeconds:seconds}}});
const physics=async page=>{await page.locator('#noaGeneratorSubject').selectOption(await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value));};
async function snapshot(page){return page.evaluate(async()=>{await NOA_QUESTION_MEMORY_V25_2.whenIdle();return {db:structuredClone(db),queue:structuredClone(examQueue),answers:structuredClone(examAnswers),score:examScore,index:examIndex,drafts:structuredClone([...NOA_EXAM_NAVIGATION.drafts]),revision:NOA_ANSWER_REVISION.capture(),calibration:NOA_CALIBRATOR.get(),storage:Object.fromEntries(Object.keys(localStorage).filter(k=>!k.startsWith('NOA_AI_QUOTA_V1:')).sort().map(k=>[k,localStorage.getItem(k)]))};});}
for(const stage of ['generator','judge'])test('429 en '+stage+' detiene UI y no se convierte en rechazo académico',async({page})=>{
 const fixture=await physicsBridge(page,{respond:({isJudge})=>isJudge===(stage==='judge')?limit('daily',null):null});
 await physics(page);await page.locator('#noaGeneratorGenerate').click();await expect(page.locator('#noaGeneratorPhase')).toHaveText('Límite del proveedor');
 expect(fixture.calls).toHaveLength(stage==='judge'?2:1);expect(await page.evaluate(()=>examQueue.length)).toBe(0);await expect(page.locator('#noaGeneratorQuota')).toContainText('diario');await expect(page.locator('#noaGeneratorQuota')).toContainText('no informó');await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();await expect(page.locator('#noaGeneratorResumeQuota')).toBeVisible();
});
test('pausa compartida bloquea nuevas llamadas y aborta las concurrentes del mismo modelo',async({page})=>{
 let release;const gate=new Promise(r=>release=r);const calls=await mockBridge(page,async(body,index)=>{if(index===1){await gate;return {body:receipt(body)};}return limit();});
 await page.evaluate(()=>{window.quotaResults=Promise.allSettled([callAI([{role:'user',content:'primera'}]),callAI([{role:'user',content:'segunda'}])]).then(results=>results.map(r=>({status:r.status,code:r.reason?.code})));});
 await expect.poll(()=>calls.length).toBe(2);const result=await page.evaluate(()=>quotaResults);release();expect(result).toEqual([{status:'rejected',code:'quota_exceeded'},{status:'rejected',code:'quota_exceeded'}]);
 expect(await page.evaluate(async()=>{try{await callAI([{role:'user',content:'no enviar'}]);}catch(e){return e.code;}})).toBe('quota_exceeded');expect(calls).toHaveLength(2);
});
test('concurrencia configurable: Groq arranca en uno y conserva la preferencia',async({page})=>{
 await expect(page.locator('#noaGeneratorConcurrency')).toHaveValue('1');await page.locator('#noaGeneratorConcurrency').selectOption('2');await page.reload();await page.locator('#nav button[data-page="exam"]').click();await expect(page.locator('#noaGeneratorConcurrency')).toHaveValue('2');
});
test('Retry-After respeta espera mínima y solo reanuda tras acción manual',async({page})=>{
 const start=Date.parse('2026-11-13T00:00:00Z');await page.clock.setFixedTime(new Date(start));let failed=false;
 const fixture=await physicsBridge(page,{respond:()=>{if(!failed){failed=true;return limit('temporary',20);}return null;}});await physics(page);await page.locator('#noaGeneratorGenerate').click();await expect(page.locator('#noaGeneratorPhase')).toHaveText('Límite del proveedor');
 await page.locator('#noaGeneratorResumeQuota').click();expect(fixture.calls).toHaveLength(1);await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
 await page.clock.setFixedTime(new Date(start+21000));expect(await page.evaluate(()=>NOA_AI_BRIDGE_V2.quotaState().canResume)).toBe(true);expect(fixture.calls).toHaveLength(1);await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
 await page.locator('#noaGeneratorResumeQuota').click();expect(fixture.calls).toHaveLength(1);await expect(page.locator('#noaGeneratorGenerate')).toBeEnabled();await expect(page.locator('#noaExam45Generate')).toBeEnabled();
 await page.locator('#noaGeneratorGenerate').click();await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación completada');expect(fixture.calls).toHaveLength(11);expect(await page.evaluate(()=>examQueue.length)).toBe(5);
});
for(const type of ['daily','temporary','unknown'])test('recarga conserva pausa '+type+' sin inventar hora de restablecimiento',async({page})=>{
 const calls=await mockBridge(page,()=>limit(type,null));await physics(page);await page.locator('#noaGeneratorGenerate').click();await expect(page.locator('#noaGeneratorPhase')).toHaveText('Límite del proveedor');await page.reload();await page.locator('#nav button[data-page="exam"]').click();await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();await expect(page.locator('#noaGeneratorQuota')).toContainText('no informó');expect(calls).toHaveLength(1);
});
test('pausas se aíslan por proveedor y modelo, sin fallback automático',async({page})=>{
 const calls=await mockBridge(page,(body,index)=>index===1?limit():{body:receipt(body)});
 await page.evaluate(async()=>{try{await callAI([{role:'user',content:'cuota'}]);}catch{}});
 await configure(page,'groq','openai/gpt-oss-20b');expect(await page.evaluate(()=>callAI([{role:'user',content:'otro modelo explícito'}]))).toBe('NOA OK');
 await configure(page,'cloudflare');expect(await page.evaluate(()=>callAI([{role:'user',content:'otro proveedor explícito'}]))).toBe('NOA OK');
 await configure(page,'groq','openai/gpt-oss-120b');expect(await page.evaluate(async()=>{try{await callAI([{role:'user',content:'sigue pausado'}]);}catch(e){return e.code;}})).toBe('quota_exceeded');expect(calls.map(c=>[c.provider,c.model])).toEqual([['groq','openai/gpt-oss-120b'],['groq','openai/gpt-oss-20b'],['cloudflare','@cf/google/gemma-4-26b-a4b-it']]);
});
test('rechazo por cuota conserva examen, revisión, crédito parcial, memoria y respaldo',async({page})=>{
 await activeSession(page);await configure(page);const calls=await mockBridge(page,()=>limit());await physics(page);const before=await snapshot(page);
 await page.evaluate(()=>NOA_GENERATOR_UI.generate());await expect(page.locator('#noaGeneratorPhase')).toHaveText('Límite del proveedor');expect(await snapshot(page)).toEqual(before);expect(calls).toHaveLength(1);
 const backup=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(backup.ok).toBe(true);expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup.backup)).ok).toBe(true);
 expect(await page.evaluate(()=>({score:examScore,answers:examAnswers}))).toEqual({score:before.score,answers:before.answers});expect(await page.evaluate(()=>NOA_AI_BRIDGE_V2.quotaState({provider:'groq',model:'openai/gpt-oss-120b'})!==null)).toBe(true);
});
test('Batch sin historial también corta el lote por 429',async({page})=>{
 const calls=await mockBridge(page,()=>limit());const result=await page.evaluate(async()=>{try{await NOA_BATCH_ORCHESTRATOR.generate({subject:NOA_EXCOBA_PREPARATION.physics().value,blueprintCount:5,limit:5,concurrency:1,maxAttempts:2,diversifyTopics:true});}catch(e){return e.code;}});expect(result).toBe('quota_exceeded');expect(calls).toHaveLength(1);
});
test('multibatch de 45 detiene reposiciones sin iniciar examen',async({page})=>{
 const calls=await mockBridge(page,()=>limit());const result=await page.evaluate(async()=>{try{await NOA_MULTI_BATCH_V25.generate({plan:NOA_EXAM_PLAN_V25.build(),concurrency:1,maxAttempts:2,avoidHistoryDuplicates:true});}catch(e){return e.code;}});expect(result).toBe('quota_exceeded');expect(calls).toHaveLength(1);expect(await page.evaluate(()=>examQueue.length)).toBe(0);
});
test('Retry-After HTTP-date y mayor de 120 s no se recortan',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-13T00:00:00Z'));await mockBridge(page,()=>({status:429,headers:{'Retry-After':'Fri, 13 Nov 2026 01:00:00 GMT','Access-Control-Expose-Headers':'Retry-After'},body:{rateLimit:{type:'temporary'}}}));
 const result=await page.evaluate(async()=>{try{await callAI([{role:'user',content:'fecha explícita'}]);}catch(e){return {retryAfter:e.retryAfter,quota:e.rateLimit};}});expect(result.retryAfter).toBe(3600);expect(result.quota.type).toBe('temporary');
});
test('sin acceso a almacenamiento la pausa sigue protegiendo la pestaña',async({page})=>{
 await mockBridge(page,()=>limit('unknown',null));const result=await page.evaluate(async()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('fixture denied');};try{await callAI([{role:'user',content:'cuota'}]);}catch(e){return {code:e.code,persisted:e.rateLimit.persisted};}finally{Storage.prototype.setItem=original;}});expect(result).toEqual({code:'quota_exceeded',persisted:false});expect(await page.evaluate(()=>!!NOA_AI_BRIDGE_V2.quotaState())).toBe(true);
});

test('Batch concurrente no lanza slots o reposiciones después de 429',async({page})=>{
 const calls=await mockBridge(page,()=>limit());await page.evaluate(()=>{const generate=NOA_BLUEPRINT_GENERATOR.generateSlot,replace=NOA_SOURCE_BLUEPRINT.replaceSlot;window.quotaCounters={slots:0,replacements:0};NOA_BLUEPRINT_GENERATOR.generateSlot=(...args)=>{quotaCounters.slots++;return generate(...args);};NOA_SOURCE_BLUEPRINT.replaceSlot=(...args)=>{quotaCounters.replacements++;return replace(...args);};});
 const r=await page.evaluate(async()=>{try{await NOA_BATCH_ORCHESTRATOR.generate({subject:NOA_EXCOBA_PREPARATION.physics().value,blueprintCount:5,limit:5,concurrency:2,maxAttempts:2,diversifyTopics:true,avoidHistoryDuplicates:true});}catch(e){return {code:e.code,counters:quotaCounters};}});
 expect(r.code).toBe('quota_exceeded');expect(r.counters.replacements).toBe(0);expect(r.counters.slots).toBeLessThanOrEqual(2);expect(calls.length).toBeLessThanOrEqual(2);
});
test('una cuota no aborta otra solicitud concurrente de un modelo distinto',async({page})=>{
 let release;const gate=new Promise(r=>release=r);const calls=await mockBridge(page,async(body,index)=>{if(index===1){await gate;return limit();}return {body:receipt(body,'otro modelo válido')};});
 await page.evaluate(()=>{window.oldModel=callAI([{role:'user',content:'primer modelo'}]).then(()=>null,e=>e.code);});await expect.poll(()=>calls.length).toBe(1);await configure(page,'groq','openai/gpt-oss-20b');expect(await page.evaluate(()=>callAI([{role:'user',content:'segundo modelo explícito'}]))).toBe('otro modelo válido');release();expect(await page.evaluate(()=>oldModel)).toBe('quota_exceeded');expect(await page.evaluate(()=>NOA_AI_BRIDGE_V2.quotaState())).toBe(null);expect(calls).toHaveLength(2);
});
test('callback antiguo abortado no revive tras reanudación en otra pestaña',async({page})=>{
 await mockBridge(page,()=>limit('unknown',null));await page.evaluate(()=>{
  const native=window.fetch;window.restoreQuotaFetch=()=>{window.fetch=native;};
  window.fetch=(url,options)=>JSON.parse(options.body).messages[0].content==='slow'?Promise.resolve({ok:true,json:()=>new Promise(resolve=>{window.releaseQuotaBody=()=>resolve({text:'descartar callback viejo',provider:'groq',requestedModel:'openai/gpt-oss-120b',model:'openai/gpt-oss-120b',verified:true,verificationStatus:'matched'});})}):native(url,options);
  window.slowQuotaOutcome=callAI([{role:'user',content:'slow'}]).then(()=>({accepted:true}),e=>({accepted:false,code:e.code}));
 });
 await page.waitForFunction(()=>!!window.releaseQuotaBody);
 await page.evaluate(async()=>{try{await callAI([{role:'user',content:'quota'}]);}catch{}});
 const result=await page.evaluate(async()=>{
  const key=Object.keys(localStorage).find(k=>k.startsWith('NOA_AI_QUOTA_V1:')),oldValue=localStorage.getItem(key);localStorage.removeItem(key);window.dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue:null}));
  const cleared=NOA_AI_BRIDGE_V2.quotaState()===null;releaseQuotaBody();const outcome=await slowQuotaOutcome;restoreQuotaFetch();return {cleared,outcome};
 });expect(result).toEqual({cleared:true,outcome:{accepted:false,code:'quota_exceeded'}});
});

test('aviso y reanudación caben en móvil y bloquean también el inicio de 45',async({page})=>{
 await page.setViewportSize({width:320,height:900});await mockBridge(page,()=>limit('daily',null));await physics(page);await page.locator('#noaGeneratorGenerate').click();await expect(page.locator('#noaGeneratorPhase')).toHaveText('Límite del proveedor');await expect(page.locator('#noaExam45Generate')).toBeDisabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);await page.screenshot({path:'/tmp/noa-quota-mobile-320.png',fullPage:true});
});
test.describe('cuota persistente con SW real',()=>{
 test.use({serviceWorkers:'allow'});
 test('pausa sobrevive recarga offline sin solicitudes nuevas',async({page,context})=>{
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);const calls=await mockBridge(page,()=>limit('daily',null));await physics(page);await page.locator('#noaGeneratorGenerate').click();await expect(page.locator('#noaGeneratorPhase')).toHaveText('Límite del proveedor');
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.NOA_GENERATOR_UI);await page.locator('#nav button[data-page="exam"]').click();await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();await expect(page.locator('#noaGeneratorQuota')).toContainText('diario');expect(calls).toHaveLength(1);
 });
});

test('fallo de la segunda escritura no pierde una espera más larga del cuerpo seguro',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-13T00:00:00Z'));await mockBridge(page,()=>({status:429,headers:{'Retry-After':'1','Access-Control-Expose-Headers':'Retry-After'},body:{rateLimit:{type:'temporary',retryAfterSeconds:20}}}));
 const r=await page.evaluate(async()=>{const native=Storage.prototype.setItem;let writes=0;Storage.prototype.setItem=function(key,value){if(key.startsWith('NOA_AI_QUOTA_V1:')&&++writes>1)throw Error('fixture second write denied');return native.call(this,key,value);};try{await callAI([{role:'user',content:'dos observaciones de la misma cuota'}]);}catch(e){return {retryAfter:e.retryAfter,type:e.rateLimit.type,persisted:e.rateLimit.persisted};}finally{Storage.prototype.setItem=native;}});
 expect(r).toEqual({retryAfter:20,type:'temporary',persisted:false});
});
