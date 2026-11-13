const {test,expect}=require('@playwright/test');
const {openGenerator}=require('./generator-fixtures.cjs');
const {questions,answer,navigate}=require('./fixtures.cjs');
const {configure,receipt,mockBridge,physicsBridge,token}=require('./ai-bridge-v2-fixtures.cjs');
test.beforeEach(async({page})=>{
 page.bridgeErrors=[];page.on('pageerror',e=>page.bridgeErrors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{document.getElementById('speakReplies').checked=false;},{once:true}));
 await openGenerator(page);await page.evaluate(()=>{db.masterSyllabus={id:'uaq-excoba-2026-2-medicina',items:NOA_EXCOBA_FIX_V5.items.map(x=>({...x}))};save();});
});
test.afterEach(async({page})=>expect(page.bridgeErrors).toEqual([]));
const aiPage=page=>page.locator('#nav button[data-page="ai"]').click();

test('proveedores separados, modelos exactos, preferencias antiguas y persistencia sin alterar historial',async({page})=>{
 await page.evaluate(()=>{db.settings.openaiModel='preferencia-anterior';db.settings.ollamaModel='gemma3:4b';save();loadAISettingsUI();});
 const before=await page.evaluate(()=>JSON.stringify({attempts:db.attempts,topics:db.topics,questions:db.questions,examQueue,examAnswers,examScore}));
 await aiPage(page);await page.locator('[data-provider="groq"]').click();
 expect(await page.locator('#aiGroqModel option').allTextContents()).toEqual(['openai/gpt-oss-120b','openai/gpt-oss-20b','qwen/qwen3.8-27b']);
 await expect(page.locator('#aiGroqModel')).toHaveValue('openai/gpt-oss-120b');await page.locator('#aiGroqModel').selectOption('openai/gpt-oss-20b');
 await page.locator('[data-provider="cloudflare"]').click();await expect(page.locator('#aiCloudflareModel')).toHaveValue('@cf/google/gemma-4-26b-a4b-it');
 await page.reload();await aiPage(page);await expect(page.locator('[data-provider="cloudflare"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-provider="groq"]').click();await expect(page.locator('#aiGroqModel')).toHaveValue('openai/gpt-oss-20b');
 expect(await page.evaluate(()=>({openai:db.settings.openaiModel,ollama:db.settings.ollamaModel}))).toEqual({openai:'preferencia-anterior',ollama:'gemma3:4b'});
 expect(await page.evaluate(()=>JSON.stringify({attempts:db.attempts,topics:db.topics,questions:db.questions,examQueue,examAnswers,examScore}))).toBe(before);
});
for(const provider of ['groq','cloudflare'])test(provider+' envía contrato explícito, token y devuelve texto con recibo propio',async({page})=>{
 await configure(page,provider);const calls=await mockBridge(page,body=>({body:receipt(body,'Texto compatible')}));
 const r=await page.evaluate(async()=>{const call=callAI([{role:'user',content:'Prueba simulada'}],{temperature:0});return {text:await call,metadata:await call.metadata()};});
 expect(r.text).toBe('Texto compatible');expect(r.metadata).toMatchObject({provider,verified:true,verificationStatus:'matched',identityVerified:true,usage:{prompt_tokens:0,completion_tokens:2,total_tokens:2}});expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({provider,temperature:0,authorized:true,roles:['user']});
 await aiPage(page);await page.locator('#aiTestConnection').click();await expect(page.locator('#aiModelVerification')).toHaveText('Coincidencia verificada');await expect(page.locator('#aiReportedModel')).toHaveText(r.metadata.model);
});
for(const missing of ['null','absent','contradictory_flag'])test('Cloudflare '+missing+': no inventa modelo verificado',async({page})=>{
 await configure(page,'cloudflare');await mockBridge(page,body=>{const data=receipt(body,'NOA OK',{model:null,verified:missing==='contradictory_flag',verificationStatus:'not_reported'});if(missing==='absent')delete data.model;return {body:data};});
 await aiPage(page);await page.locator('#aiTestConnection').click();await expect(page.locator('#aiReportedModel')).toHaveText('Modelo no verificado');await expect(page.locator('#aiModelVerification')).toHaveText('Modelo no verificado');
 await expect(page.locator('#aiConnectionStatus')).toContainText('identidad del modelo no verificada');
});
for(const field of ['model','provider','requestedModel'])test('discrepancia en '+field+' rechaza respuesta y muestra advertencia',async({page})=>{
 await configure(page);await mockBridge(page,body=>({body:receipt(body,'No usar',{[field]:field==='provider'?'cloudflare':'modelo-distinto'})}));
 await aiPage(page);await page.locator('#aiTestConnection').click();await expect(page.locator('#aiModelVerification')).toHaveText('Discrepancia');await expect(page.locator('#aiConnectionStatus')).toContainText('No se utilizará');
});

test('concurrencia mantiene cada texto, proveedor, modelo, ID y usage ligados a su solicitud',async({page})=>{
 await configure(page);let release;const blocked=new Promise(r=>release=r);
 const calls=await mockBridge(page,async(body,index)=>{if(index===1)await blocked;return {body:receipt(body,'respuesta-'+index,{id:'id-'+index,usage:{prompt_tokens:index,total_tokens:index+3}})};});
 await page.evaluate(()=>{window.firstBridgeCall=callAI([{role:'user',content:'primera'}]);});await expect.poll(()=>calls.length).toBe(1);
 await configure(page,'cloudflare');const second=await page.evaluate(async()=>{const call=callAI([{role:'user',content:'segunda'}]);const text=await call,metadata=await call.metadata();metadata.usage.total_tokens=999;return {text,metadata:await call.metadata()};});
 release();const first=await page.evaluate(async()=>({text:await firstBridgeCall,metadata:await firstBridgeCall.metadata()}));
 expect(first.text).toBe('respuesta-1');expect(first.metadata).toMatchObject({provider:'groq',id:'id-1',usage:{total_tokens:4}});expect(second.text).toBe('respuesta-2');expect(second.metadata).toMatchObject({provider:'cloudflare',id:'id-2',usage:{total_tokens:5}});expect(first.metadata.requestId).not.toBe(second.metadata.requestId);
});
for(const status of [400,401,403,429,502,503])test('HTTP '+status+' es explícito, no filtra cuerpos sensibles ni reintenta',async({page})=>{
 await configure(page);const calls=await mockBridge(page,()=>({status,headers:{'Retry-After':'12','Access-Control-Expose-Headers':'Retry-After'},body:{error:'No mostrar '+token}}));
 const r=await page.evaluate(async()=>{try{await callAI([{role:'user',content:'error'}]);return null;}catch(e){return {status:e.status,code:e.code,message:e.message,retryAfter:e.retryAfter};}});
 expect(r.status).toBe(status);expect(r.message).not.toContain(token);expect(r.retryAfter).toBe(status===429?12:null);expect(calls).toHaveLength(1);
 await aiPage(page);await page.locator('#aiTestConnection').click();await expect(page.locator('#aiConnectionStatus')).toHaveClass(/ai-error/);await expect(page.locator('#aiTestConnection')).toBeEnabled();expect(await page.locator('#ai').innerText()).not.toContain(token);
});
for(const body of [{text:''},{text:'legacy'},null])test('JSON de respuesta inválido '+JSON.stringify(body)+' no confirma conexión',async({page})=>{
 await configure(page);await mockBridge(page,()=>({raw:JSON.stringify(body)}));await aiPage(page);await page.locator('#aiTestConnection').click();await expect(page.locator('#aiConnectionStatus')).toHaveClass(/ai-error/);await expect(page.locator('#aiModelVerification')).not.toHaveText('Coincidencia verificada');
});
test('HTML en lugar de JSON y fallo de red se manejan sin exponer datos',async({page})=>{
 await configure(page);await mockBridge(page,()=>({raw:'<html>no JSON</html>'}));expect(await page.evaluate(async()=>{try{await callAI([{role:'user',content:'JSON'}]);}catch(e){return e.code;}})).toBe('invalid_response');
 await page.unroute('https://noa-bridge-v2.test/**');expect(await page.evaluate(async()=>{try{await callAI([{role:'user',content:'red'}]);}catch(e){return e.code;}})).toBe('connection_error');
});
for(const provider of ['openai','ollama_bridge'])test(provider+' conserva preferencias pero no cae silenciosamente a otro proveedor',async({page})=>{
 await configure(page,provider);const calls=await mockBridge(page,()=>({}));await aiPage(page);await expect(page.locator('#aiProviderNotice')).toContainText('no está disponible');await expect(page.locator('#aiTestConnection')).toBeDisabled();expect(await page.evaluate(async()=>{try{await callAI([{role:'user',content:'legacy'}]);}catch(e){return e.code;}})).toBe('unsupported_provider');expect(calls).toHaveLength(0);
});
test('Ollama directo conserva endpoint, modelo y opciones sin enviar token al Bridge',async({page})=>{
 await configure(page,'ollama','gemma3:4b');await page.evaluate(()=>{db.settings.ollamaUrl='http://127.0.0.1:11434';});let data;
 await page.route('http://127.0.0.1:11434/api/chat',async route=>{data={body:route.request().postDataJSON(),hasAuth:!!route.request().headers().authorization};await route.fulfill({json:{message:{content:'Ollama local'},model:'gemma3:4b'},headers:{'Access-Control-Allow-Origin':'*'}});});
 const r=await page.evaluate(async()=>{const call=callAI([{role:'user',content:'local'}]);return {text:await call,metadata:await call.metadata()};});expect(r.text).toBe('Ollama local');expect(data.hasAuth).toBe(false);expect(data.body).toMatchObject({model:'gemma3:4b',stream:false,options:{temperature:.35}});expect(r.metadata).toMatchObject({transport:'ollama-direct',model:'gemma3:4b',identityVerified:true});
});
test('solo texto y modelos admitidos: no envía imágenes ni solicitudes inválidas',async({page})=>{
 await configure(page);const calls=await mockBridge(page,()=>({}));
 const r=await page.evaluate(async()=>{const errors=[];for(const [messages,options] of [[[{role:'user',content:[{type:'image_url',image_url:'no'}]}],{}],[[{role:'user',content:'modelo'}],{model:'no-admitido'}]])try{await callAI(messages,options);}catch(e){errors.push(e.code);}return errors;});expect(r).toEqual(['invalid_messages','invalid_model']);expect(calls).toHaveLength(0);
});
for(const provider of ['groq','cloudflare'])test('cinco preguntas de Física: transporte '+provider+' simulado con Generator, Batch y Judge reales',async({page})=>{
 await configure(page,provider);const fixture=await physicsBridge(page);
 await page.evaluate(()=>{const native=window.callAI;window.__bridgePipelineReceipts=[];window.callAI=(messages,options)=>{const pending=native(messages,options),kind=messages[0].content.includes('Judge')?'judge':'generator';pending.metadata().then(metadata=>__bridgePipelineReceipts.push({kind,metadata}),()=>{});return pending;};});
 await page.locator('#noaGeneratorSubject').selectOption(await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value));await page.locator('#noaExamEvidenceKind').selectOption('technical_test');await page.locator('#noaGeneratorGenerate').click();await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación completada');
 const receipts=await page.evaluate(()=>__bridgePipelineReceipts);expect(receipts).toHaveLength(10);expect(receipts.filter(r=>r.kind==='generator')).toHaveLength(5);expect(receipts.filter(r=>r.kind==='judge')).toHaveLength(5);expect(new Set(receipts.map(r=>r.metadata.requestId)).size).toBe(10);expect(new Set(receipts.map(r=>r.metadata.id)).size).toBe(10);expect(receipts.every(r=>r.metadata.provider===provider&&r.metadata.identityVerified)).toBe(true);
 expect(await page.evaluate(()=>examQueue.length)).toBe(5);expect(fixture.stats).toMatchObject({generated:5,judged:5});expect(fixture.calls).toHaveLength(10);expect(fixture.stats.formats).toEqual(await page.evaluate(()=>examQueue.map(q=>q.interactionType)));expect(fixture.stats.formats.every(f=>['single_select','drag_classify','inline_select','drag_order'].includes(f))).toBe(true);
 // El contrato existente admite materia/fuente en blueprintSlot (answerMetadata).
 const academic=await page.evaluate(()=>examQueue.map(q=>({accepted:q.accepted,subject:q.subject??q.blueprintSlot?.subject,
  code:q.syllabusCode||q.syllabusCodes?.[0]||q.blueprintSlot?.syllabusCodes?.[0],
  reference:q.sourceTrace?.reference??q.blueprintSlot?.source?.reference,
  topicSubject:subjectBy(topicBy(q.topicId)?.subjectId)?.name})));
 const physics=await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value);
 for(const q of academic){expect(q.accepted).toBe(true);expect(q.subject).toBe(physics);expect(q.topicSubject).toBe(physics);expect(q.code).toMatch(/^3\.3\./);expect(q.reference.confirmedForMedicine).toBe(false);}
 const q=await page.evaluate(()=>examQueue[0]);await answer(page,q);await page.waitForFunction(()=>examAnswers.length===1);
 const before=await page.evaluate(()=>JSON.stringify({queue:examQueue,answers:examAnswers,score:examScore,provenance:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue)}));await page.reload();await page.waitForFunction(()=>examQueue.length===5);expect(await page.evaluate(()=>JSON.stringify({queue:examQueue,answers:examAnswers,score:examScore,provenance:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue)}))).toBe(before);
 const backup=await page.evaluate(()=>NOA_QUESTION_MEMORY_V25_2.createBackup());expect(backup.ok).toBe(true);expect(JSON.stringify(backup.backup)).not.toContain(token);expect((await page.evaluate(b=>NOA_QUESTION_MEMORY_V25_2.restoreBackup(b),backup.backup)).ok).toBe(true);
});
test('proveedor inválido durante generación conserva sesión, crédito, checkpoint e historial',async({page})=>{
 await page.evaluate(q=>{document.getElementById('noaExamEvidenceKind').value='technical_test';NOA_MIXED_EXAM.start(q,'Control anterior');},questions);await answer(page,questions[0]);await navigate(page,1);
 await configure(page);await mockBridge(page,()=>({status:401,body:{error:'Token incorrecto'}}));await page.locator('#noaGeneratorSubject').selectOption(await page.evaluate(()=>NOA_EXCOBA_PREPARATION.physics().value));
 const read=()=>page.evaluate(()=>JSON.stringify({db,examQueue,examAnswers,examScore,examIndex,provenance:NOA_STUDY_PROVENANCE_V27.capture(examAnswers,examQueue),checkpoint:JSON.parse(localStorage.getItem(KEY))?.activeExam}));const before=await read();await page.evaluate(()=>NOA_GENERATOR_UI.generate());await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación incompleta');expect(await read()).toBe(before);await expect(page.locator('#noaGeneratorGenerate')).toBeEnabled();
});
for(const width of [320,390,1365])test('selector y recibo accesibles sin desbordamiento a '+width,async({page})=>{
 await mockBridge(page,body=>({body:receipt(body)}));await page.setViewportSize({width,height:900});
 for(const provider of ['groq','cloudflare']){
  await configure(page,provider);await aiPage(page);await page.locator('#aiTestConnection').click();await expect(page.locator('#aiModelVerification')).toHaveText('Coincidencia verificada');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);await expect(page.locator('[data-provider="'+provider+'"]')).toHaveAttribute('aria-pressed','true');
  const sizes=await page.evaluate(provider=>{const field=document.getElementById(provider==='groq'?'groqModelSettings':'cloudflareModelSettings'),select=field.querySelector('select');return {field:field.getBoundingClientRect().width,select:select.getBoundingClientRect().width};},provider);
  expect(sizes.select).toBeGreaterThanOrEqual(sizes.field-1);
  await page.screenshot({path:'/tmp/noa-bridge-v2-'+provider+'-'+width+'.png',fullPage:true});
 }
});

test('Retry-After no expuesto por CORS permanece desconocido, como en el candidato adjunto',async({page})=>{
 await configure(page);await mockBridge(page,()=>({status:429,headers:{'Retry-After':'12'},body:{error:'Límite'}}));
 const r=await page.evaluate(async()=>{try{await callAI([{role:'user',content:'límite'}]);}catch(e){return {status:e.status,retryAfter:e.retryAfter};}});expect(r).toEqual({status:429,retryAfter:null});
});
test('identidad exacta: espacios o claims incompatibles no certifican el modelo',async({page})=>{
 await configure(page);await mockBridge(page,body=>({body:receipt(body,'NOA OK',{model:body.model+' '})}));
 const r=await page.evaluate(async()=>{try{await callAI([{role:'user',content:'identidad'}]);}catch(e){return {code:e.code,metadata:e.metadata};}});expect(r.code).toBe('identity_mismatch');expect(r.metadata.identityVerified).toBe(false);
});
test('respuesta tardía del test no sobrescribe el proveedor recién seleccionado',async({page})=>{
 await configure(page);let release;const gate=new Promise(r=>release=r);const calls=await mockBridge(page,async body=>{await gate;return {body:receipt(body)};});
 await aiPage(page);await page.locator('#aiTestConnection').click();await expect.poll(()=>calls.length).toBe(1);
 await page.evaluate(()=>selectAIProvider('cloudflare'));release();await expect(page.locator('#aiTestConnection')).toBeEnabled();await expect(page.locator('#aiSelectedProvider')).toHaveText('Cloudflare Workers AI');await expect(page.locator('#aiReportedModel')).toHaveText('Sin probar');
});

test.describe('Bridge v2 con Service Worker real',()=>{
 test.use({serviceWorkers:'allow'});
 test('offline conserva transporte y preferencias sin acceder a proveedores',async({page,context})=>{
  await configure(page,'groq','openai/gpt-oss-20b');await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const cache=await page.evaluate(async()=>{const scope=(await navigator.serviceWorker.getRegistration()).scope,name=(await caches.keys()).find(n=>n.startsWith('noa-mobile:'+encodeURIComponent(scope)+':'));return {name,asset:!!await(await caches.open(name)).match(new URL('excoba_patch_ai_bridge_v2.js',scope).href)};});
  expect(cache.name).toMatch(/:v6-100$/);expect(cache.asset).toBe(true);const before=await page.evaluate(()=>JSON.stringify(db.attempts));
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!window.NOA_AI_BRIDGE_V2);await aiPage(page);
  await expect(page.locator('#aiGroqModel')).toHaveValue('openai/gpt-oss-20b');await expect(page.locator('#aiRequestedModel')).toHaveText('openai/gpt-oss-20b');expect(await page.evaluate(()=>JSON.stringify(db.attempts))).toBe(before);
 });
});

for(const provider of ['groq','cloudflare'])test('HTTP 502 de discrepancia del Worker '+provider+' se distingue de indisponibilidad',async({page})=>{
 await configure(page,provider);await mockBridge(page,()=>({status:502,body:{error:provider==='groq'?'Groq reportó un modelo distinto del solicitado':'Cloudflare AI reportó un modelo distinto del solicitado'}}));
 await aiPage(page);await page.locator('#aiTestConnection').click();await expect(page.locator('#aiModelVerification')).toHaveText('Discrepancia');await expect(page.locator('#aiReportedModel')).toHaveText('Modelo no verificado');await expect(page.locator('#aiConnectionStatus')).toContainText('No se utilizará');
});

const publicGemma='@cf/google/gemma-4-26b-a4b-it';
const externalGemma='@cf/google/gemma-4-26b-a4b-it-external';
async function cloudflareWorkerRoute(page,reported){
 const worker=(await import('../staging/noa-worker-bridge-v2.mjs')).default;
 await mockBridge(page,async body=>{
  const response=await worker.fetch(new Request('https://staging.test/api/chat',{method:'POST',headers:{Origin:'http://127.0.0.1:8022',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}),{
   NOA_BRIDGE_TOKEN:token,NOA_ALLOWED_ORIGINS:'http://127.0.0.1:8022',AI:{async run(model){expect(model).toBe(publicGemma);return {response:'Texto simulado conservado',model:reported,id:'fixture-cf-reported',usage:{prompt_tokens:0,total_tokens:2}};}}
  });
  return {status:response.status,body:await response.json()};
 });
}
for(const reported of [publicGemma,externalGemma])test('frontend interpreta la respuesta real del candidato Worker '+reported,async({page})=>{
 await configure(page,'cloudflare');await cloudflareWorkerRoute(page,reported);
 const result=await page.evaluate(async()=>{const pending=callAI([{role:'user',content:'Respuesta sintética; no inferencia real'}]);return {text:await pending,metadata:await pending.metadata()};});
 expect(result.text).toBe('Texto simulado conservado');expect(result.metadata.requestedModel).toBe(publicGemma);expect(result.metadata.usage.prompt_tokens).toBe(0);
 await aiPage(page);await page.locator('#aiTestConnection').click();
 if(reported===publicGemma){expect(result.metadata.model).toBe(publicGemma);expect(result.metadata.identityVerified).toBe(true);await expect(page.locator('#aiModelVerification')).toHaveText('Coincidencia verificada');}
 else{expect(result.metadata).toMatchObject({model:null,reportedModel:externalGemma,verified:false,verificationStatus:'external_unverified',identityStatus:'external_unverified',identityVerified:false});await expect(page.locator('#aiReportedModel')).toContainText(externalGemma);await expect(page.locator('#aiReportedModel')).toContainText('Modelo no verificado');await expect(page.locator('#aiModelVerification')).toHaveText('Modelo no verificado');await expect(page.locator('#aiConnectionStatus')).toContainText('identidad del modelo no verificada');}
});
test('modelo desconocido del candidato no llega al frontend como texto utilizable',async({page})=>{
 await configure(page,'cloudflare');await cloudflareWorkerRoute(page,externalGemma+'-v2');const result=await page.evaluate(async()=>{try{await callAI([{role:'user',content:'desconocido'}]);return {accepted:true};}catch(e){return {accepted:false,status:e.status,code:e.code};}});expect(result).toEqual({accepted:false,status:502,code:'identity_mismatch'});
});
for(const variant of ['unknown','verified','status','model'])test('reportedModel no permite ampliar la excepción externa: '+variant,async({page})=>{
 await configure(page,'cloudflare');await mockBridge(page,body=>({body:receipt(body,'No aceptar',{model:null,reportedModel:externalGemma,verified:false,verificationStatus:'external_unverified',...(variant==='unknown'?{reportedModel:externalGemma+'-other'}:variant==='verified'?{verified:true}:variant==='status'?{verificationStatus:'matched'}:{model:publicGemma})})}));
 const result=await page.evaluate(async()=>{try{await callAI([{role:'user',content:'claims incompatibles'}]);return null;}catch(e){return e.code;}});expect(result).toBe('identity_mismatch');
});
