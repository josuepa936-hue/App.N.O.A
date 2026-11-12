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
    const provider=safe(data.provider),requestedModel=safe(data.requestedModel),model=safe(data.model);
    const verified=typeof data.verified==='boolean'?data.verified:null;
    const verificationStatus=safe(data.verificationStatus);
    const direct=config.provider==='ollama';
    const mismatch=!!((provider&&provider!==config.provider)||(requestedModel&&requestedModel!==config.model)||(model&&model!==config.model));
    const matched=!!model&&model===config.model&&(direct||
      (provider===config.provider&&requestedModel===config.model&&verified===true&&verificationStatus==='matched'));
    const usage={};
    if(record(data.usage))for(const key of ['prompt_tokens','completion_tokens','total_tokens']){
      if(Number.isSafeInteger(data.usage[key])&&data.usage[key]>=0)usage[key]=data.usage[key];
    }
    return {requestId:config.requestId,transport:direct?'ollama-direct':'bridge-v2',
      requestedProvider:config.provider,clientRequestedModel:config.model,
      provider,requestedModel,model,verified,verificationStatus,
      identityVerified:!mismatch&&matched,
      identityStatus:mismatch?'mismatch':matched?'matched':!model?'not_reported':'unverified',
      id:safe(data.id),usage:Object.keys(usage).length?usage:null};
  }
  async function httpError(response,config){
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
    const url=endpoint(config.base),headers={'Content-Type':'application/json'};
    if(config.token)headers.Authorization='Bearer '+config.token;
    const body={provider,model:config.model,messages:messages.map(({role,content})=>({role,content})),temperature};
    if(provider==='ollama'){body.stream=false;body.options={temperature};}
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),70000);
    try{
      let response;
      try{response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});}
      catch{throw error(controller.signal.aborted?'El servicio de IA agotó el tiempo de espera.':
        'No se pudo conectar con el servicio de IA. Revisa la URL, HTTPS, conexión y CORS.',controller.signal.aborted?'timeout':'connection_error');}
      if(!response.ok)throw await httpError(response,config);
      let data;
      try{data=await response.json();}catch{throw error('El servicio no devolvió JSON válido.','invalid_response');}
      const text=provider==='ollama'?(data?.message?.content??data?.response):data?.text;
      if(!record(data)||typeof text!=='string'||!text.trim())throw error('El servicio no devolvió texto utilizable.','invalid_response');
      const metadata=metadataFor(data,config);
      if(metadata.identityStatus==='mismatch')throw error('Discrepancia: el servidor reportó otro proveedor o modelo. No se utilizará esta respuesta.','identity_mismatch',null,metadata);
      if(provider!=='ollama'&&(data.provider!==provider||data.requestedModel!==config.model)){
        throw error('La respuesta no identifica el proveedor y la solicitud de Bridge v2. Comprueba la versión del Worker.','invalid_identity',null,metadata);
      }
      return {text,metadata};
    }finally{clearTimeout(timer);}
  }
  function call(messages,options={}){
    const response=request(messages,options),text=response.then(result=>result.text);
    // Lazy metadata promise: an ignored receipt cannot cause an unhandled rejection.
    Object.defineProperty(text,'metadata',{value:()=>response.then(result=>clone(result.metadata))});
    return text;
  }
  window.NOA_AI_BRIDGE_V2=Object.freeze({version:'2',models,selectedModel,request,call});
})();
