/* Transporte de texto Bridge v2. Sin prompts, secretos ni metadatos globales. */
(() => {
  'use strict';
  const models=Object.freeze({
    groq:Object.freeze(['openai/gpt-oss-120b','openai/gpt-oss-20b','qwen/qwen3.8-27b']),
    cloudflare:Object.freeze(['@cf/google/gemma-4-26b-a4b-it'])
  });
  const clone=value=>JSON.parse(JSON.stringify(value));
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  function error(message,code,status=null,metadata=null,retryAfter=null){
    return Object.assign(new Error(message),{name:'NOAAIError',code,status,metadata,retryAfter});
  }
  function selectedModel(settings){
    return settings.aiProvider==='groq'?(settings.groqModel||models.groq[0]):
      settings.aiProvider==='cloudflare'?(settings.cloudflareModel||models.cloudflare[0]):
      settings.aiProvider==='openai'?settings.openaiModel:
      ['ollama','ollama_bridge'].includes(settings.aiProvider)?settings.ollamaModel:null;
  }
  function endpoint(base){
    let url;
    try{url=new URL(base);}catch{throw error('La URL del servicio no es válida.','invalid_url');}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash){
      throw error('Usa una URL HTTP/HTTPS sin credenciales, parámetros ni fragmentos.','invalid_url');
    }
    return url.href.replace(/\/+$/,'')+'/api/chat';
  }
  function metadataFor(data,config){
    const safe=value=>typeof value==='string'&&value.trim()?value.split(config.token||'\u0000').join('[oculto]').slice(0,200):null;
    const provider=safe(data.provider),requestedModel=safe(data.requestedModel),model=safe(data.model),reportedModel=safe(data.reportedModel);
    const verified=typeof data.verified==='boolean'?data.verified:null;
    const verificationStatus=safe(data.verificationStatus);
    const direct=config.provider==='ollama';
    // Only the exact alias observed for this public Cloudflare model is admitted.
    const externalUnverified=config.provider==='cloudflare'&&config.model==='@cf/google/gemma-4-26b-a4b-it'&&
      provider===config.provider&&requestedModel===config.model&&data.model===null&&
      reportedModel==='@cf/google/gemma-4-26b-a4b-it-external'&&verified===false&&verificationStatus==='external_unverified';
    const mismatch=!!((provider&&provider!==config.provider)||(requestedModel&&requestedModel!==config.model)||(model&&model!==config.model)||
      (reportedModel&&reportedModel!==config.model&&!externalUnverified));
    const matched=!!model&&model===config.model&&(direct||
      (provider===config.provider&&requestedModel===config.model&&verified===true&&verificationStatus==='matched'));
    const usage={};
    if(record(data.usage))for(const key of ['prompt_tokens','completion_tokens','total_tokens']){
      if(Number.isSafeInteger(data.usage[key])&&data.usage[key]>=0)usage[key]=data.usage[key];
    }
    return {requestId:config.requestId,transport:direct?'ollama-direct':'bridge-v2',
      requestedProvider:config.provider,clientRequestedModel:config.model,
      provider,requestedModel,model,reportedModel,verified,verificationStatus,
      identityVerified:!mismatch&&matched,
      identityStatus:mismatch?'mismatch':externalUnverified?'external_unverified':matched?'matched':!model?'not_reported':'unverified',
      id:safe(data.id),usage:Object.keys(usage).length?usage:null};
  }
  // Provider/model safety latches. They never contain credentials or academic data.
  const quotaPrefix='NOA_AI_QUOTA_V1:',quotas=new Map(),activeRequests=new Map();
  const isQuotaError=value=>value?.status===429||value?.code==='quota_exceeded';
  const selection=()=>({provider:db.settings.aiProvider,model:selectedModel(db.settings)});
  const quotaKey=({provider,model})=>quotaPrefix+encodeURIComponent(provider)+':'+encodeURIComponent(model);
  function retrySeconds(value,now=Date.now()){
    if(value===null||value===undefined||value==='')return null;
    let seconds=null;
    if(typeof value==='number'||typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value.trim()))seconds=Number(value);
    else if(typeof value==='string'){
      const time=Date.parse(value);
      if(Number.isFinite(time)&&new Date(time).toUTCString()===value.trim())seconds=Math.max(0,(time-now)/1000);
    }
    return Number.isFinite(seconds)&&seconds>=0&&now+Math.ceil(seconds)*1000<=8640000000000000?Math.ceil(seconds):null;
  }
  function validQuota(q){
    return record(q)&&q.version===1&&['groq','cloudflare','ollama'].includes(q.provider)&&typeof q.model==='string'&&q.model.length>0&&
      typeof q.id==='string'&&['daily','temporary','unknown'].includes(q.type)&&Number.isFinite(q.observedAt)&&
      (q.retryAt===null||Number.isFinite(q.retryAt));
  }
  function quotaState(target=selection()){
    const key=quotaKey(target);let q=quotas.get(key);
    try{const stored=JSON.parse(localStorage.getItem(key)||'null');if(validQuota(stored)&&stored.provider===target.provider&&stored.model===target.model&&(!q||q.persisted!==false||q.id===stored.id)){q={version:1,id:stored.id,provider:stored.provider,model:stored.model,type:stored.type,observedAt:stored.observedAt,retryAt:stored.retryAt,persisted:true};quotas.set(key,q);}}catch{}
    if(!q)return null;
    return {...clone(q),remainingSeconds:q.retryAt===null?null:Math.max(0,Math.ceil((q.retryAt-Date.now())/1000)),canResume:q.retryAt===null||Date.now()>=q.retryAt};
  }
  function quotaMessage(q){
    const scope=q.type==='daily'?'límite diario':q.type==='temporary'?'límite temporal':'límite de cuota (periodo no informado)';
    const wait=q.remainingSeconds===null?'El proveedor no informó una espera ni una hora de restablecimiento.':
      q.remainingSeconds>0?'Espera mínima indicada por el proveedor: '+q.remainingSeconds+' s.':'La espera mínima indicada terminó; esto no confirma que la cuota se haya renovado.';
    return 'Se alcanzó el '+scope+' de '+q.provider+' / '+q.model+'. '+wait+' El lote se detuvo sin evaluar académicamente los pendientes. No habrá reintentos automáticos. Usa la reanudación manual.'+(q.persisted===false?' No se pudo guardar la pausa; conserva esta pestaña abierta.':'');
  }
  function quotaError(q){return Object.assign(error(quotaMessage(q),'quota_exceeded',429,null,q.remainingSeconds),{rateLimit:clone(q)});}
  function assertAvailable(target=selection()){
    const q=quotaState(target);if(q)throw quotaError(q);
  }
  function notifyQuota(){window.dispatchEvent(new Event('noa-ai-quota-change'));}
  function registerQuota(config,limit,controller){
    const now=Date.now(),previous=quotaState(config),key=quotaKey(config);
    const deadlines=[previous?.retryAt,limit.retryAfterSeconds===null?null:(limit.observedAt??now)+limit.retryAfterSeconds*1000].filter(Number.isFinite);
    const q={version:1,id:crypto.randomUUID(),provider:config.provider,model:config.model,
      type:previous?.type==='daily'||limit.type==='daily'?'daily':limit.type!=='unknown'?limit.type:previous?.type||'unknown',
      observedAt:now,retryAt:deadlines.length?Math.max(...deadlines):null};
    quotas.set(key,{...q,persisted:false});
    try{localStorage.setItem(key,JSON.stringify(q));quotas.set(key,{...q,persisted:true});}catch{}
    const state=quotaState(config);
    for(const active of activeRequests.get(key)||[])if(active!==controller)active.abort({code:'quota_exceeded',rateLimit:state});
    notifyQuota();return quotaState(config);
  }
  function resumeQuota(target=selection()){
    const q=quotaState(target);if(!q)return {resumed:true,quota:null};
    if(activeRequests.get(quotaKey(target))?.size)return {resumed:false,quota:q,pending:true};
    if(!q.canResume)return {resumed:false,quota:q};
    const key=quotaKey(target);
    try{localStorage.removeItem(key);}catch{if(q.persisted)return {resumed:false,quota:q,storageError:true};}
    quotas.delete(key);notifyQuota();return {resumed:true,quota:null};
  }
  window.addEventListener('storage',event=>{
    if(!event.key?.startsWith(quotaPrefix))return;
    try{
      const next=JSON.parse(event.newValue||'null'),old=JSON.parse(event.oldValue||'null');
      if(validQuota(next))quotas.set(event.key,{version:1,id:next.id,provider:next.provider,model:next.model,type:next.type,observedAt:next.observedAt,retryAt:next.retryAt,persisted:true});
      else if(event.newValue===null&&quotas.get(event.key)?.id===old?.id)quotas.delete(event.key);
      notifyQuota();
    }catch{}
  });
  async function httpError(response,config,controller){
    if(response.status===429){
      const observedAt=Date.now(),header=retrySeconds(response.headers.get('Retry-After'),observedAt);
      // Latch immediately on status, before waiting for an optional error body.
      registerQuota(config,{type:'unknown',retryAfterSeconds:header,observedAt},controller);
      let data=null;try{data=await response.json();}catch{}
      const reported=record(data?.rateLimit)?data.rateLimit:{};
      const body=retrySeconds(reported.retryAfterSeconds);
      const waits=[header,body].filter(Number.isFinite);
      const q=registerQuota(config,{type:['daily','temporary'].includes(reported.type)?reported.type:'unknown',retryAfterSeconds:waits.length?Math.max(...waits):null,observedAt},controller);
      return quotaError(q);
    }
    // The candidate Worker rejects upstream identity mismatches with HTTP 502.
    // Recognize only its two fixed messages; never echo arbitrary error bodies.
    if(response.status===502){
      let data=null;try{data=await response.json();}catch{}
      if(record(data)&&['Groq reportó un modelo distinto del solicitado','Cloudflare AI reportó un modelo distinto del solicitado'].includes(data.error)){
        const metadata={...metadataFor({},config),identityStatus:'mismatch',identityVerified:false};
        return error('Discrepancia: el servidor rechazó un modelo distinto del solicitado. No se utilizará esta respuesta.','identity_mismatch',502,metadata);
      }
    }
    const messages={400:'Solicitud o modelo inválido para el Bridge.',401:'Token del Bridge incorrecto o ausente.',
      403:'Origen no permitido por el Bridge.',429:'Límite del proveedor alcanzado. Espera antes de volver a intentar.',
      502:'El proveedor de IA no está disponible o rechazó la solicitud.',503:'Bridge o proveedor no disponible o no configurado.'};
    const seconds=Number(response.headers.get('Retry-After'));
    return error(messages[response.status]||'El servicio de IA devolvió un error HTTP '+response.status+'.',
      'http_error',response.status,null,response.status===429&&Number.isInteger(seconds)&&seconds>0&&seconds<=120?seconds:null);
  }
  async function request(messages,options={}){
    ensureV6();
    // Snapshot before the first await: provider changes cannot reroute this call.
    const settings=db.settings,provider=settings.aiProvider;
    const config={provider,model:options.model??selectedModel(settings),token:provider==='ollama'?'':String(settings.bridgeToken||''),
      requestId:crypto.randomUUID(),base:provider==='ollama'?settings.ollamaUrl:settings.bridgeUrl};
    if(provider==='offline')throw error('NOA está en modo offline.','offline');
    if(['openai','ollama_bridge'].includes(provider))throw error(
      provider==='openai'?'OpenAI no está disponible con Bridge v2. Tus preferencias se conservan. Selecciona Groq, Cloudflare u Ollama directo.':
        'Ollama Bridge no está disponible con Bridge v2. Usa Ollama directo. Tus preferencias se conservan.','unsupported_provider');
    if(!['groq','cloudflare','ollama'].includes(provider))throw error('Selecciona un proveedor de IA admitido.','invalid_provider');
    if(typeof config.model!=='string'||!config.model.trim()||(models[provider]&&!models[provider].includes(config.model))){
      throw error('Modelo no admitido para el proveedor seleccionado.','invalid_model');
    }
    if(!Array.isArray(messages)||!messages.length||messages.some(m=>!record(m)||typeof m.content!=='string'||!m.content.trim()||
      !['system','developer','user','assistant'].includes(m.role))){
      throw error('Esta integración solo admite mensajes de texto válidos.','invalid_messages');
    }
    const temperature=options.temperature??0.35;
    if(typeof temperature!=='number'||!Number.isFinite(temperature)||temperature<0||temperature>2)throw error('Temperatura inválida.','invalid_temperature');
    assertAvailable(config);
    const url=endpoint(config.base),headers={'Content-Type':'application/json'};
    if(config.token)headers.Authorization='Bearer '+config.token;
    const body={provider,model:config.model,messages:messages.map(({role,content})=>({role,content})),temperature};
    if(provider==='ollama'){body.stream=false;body.options={temperature};}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),70000),key=quotaKey(config);
    if(!activeRequests.has(key))activeRequests.set(key,new Set());activeRequests.get(key).add(controller);
    function checkRequestQuota(){
      if(controller.signal.reason?.code==='quota_exceeded')throw quotaError(quotaState(config)||controller.signal.reason.rateLimit);
      assertAvailable(config);
    }
    try{
      let response;
      checkRequestQuota();
      try{response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});}
      catch{if(controller.signal.reason?.code==='quota_exceeded')throw quotaError(quotaState(config)||controller.signal.reason.rateLimit);throw error(controller.signal.aborted?'El servicio de IA agotó el tiempo de espera.':
        'No se pudo conectar con el servicio de IA. Revisa la URL, HTTPS, conexión y CORS.',controller.signal.aborted?'timeout':'connection_error');}
      checkRequestQuota();
      if(!response.ok)throw await httpError(response,config,controller);
      let data;
      try{data=await response.json();}catch{checkRequestQuota();throw error('El servicio no devolvió JSON válido.','invalid_response');}
      checkRequestQuota();
      const text=provider==='ollama'?(data?.message?.content??data?.response):data?.text;
      if(!record(data)||typeof text!=='string'||!text.trim())throw error('El servicio no devolvió texto utilizable.','invalid_response');
      const metadata=metadataFor(data,config);
      if(metadata.identityStatus==='mismatch')throw error('Discrepancia: el servidor reportó otro proveedor o modelo. No se utilizará esta respuesta.','identity_mismatch',null,metadata);
      if(provider!=='ollama'&&(data.provider!==provider||data.requestedModel!==config.model)){
        throw error('La respuesta no identifica el proveedor y la solicitud de Bridge v2. Comprueba la versión del Worker.','invalid_identity',null,metadata);
      }
      return {text,metadata};
    }finally{clearTimeout(timer);activeRequests.get(key)?.delete(controller);if(activeRequests.get(key)?.size===0)activeRequests.delete(key);}
  }
  function call(messages,options={}){
    const response=request(messages,options),text=response.then(result=>result.text);
    // Lazy metadata promise: an ignored receipt cannot cause an unhandled rejection.
    Object.defineProperty(text,'metadata',{value:()=>response.then(result=>clone(result.metadata))});
    return text;
  }
  window.NOA_AI_BRIDGE_V2=Object.freeze({version:'2',models,selectedModel,request,call,isQuotaError,quotaState,quotaMessage,assertAvailable,resumeQuota});
})();
