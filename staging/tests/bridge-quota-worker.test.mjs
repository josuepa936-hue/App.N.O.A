import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../noa-worker-bridge-v2.mjs';
const nativeFetch=globalThis.fetch;
const token='fixture-staging-not-a-real-token';
const model='openai/gpt-oss-120b';
const origin='http://127.0.0.1:8765';
const env={NOA_BRIDGE_TOKEN:token,GROQ_API_KEY:'fixture-not-a-real-api-key',NOA_ALLOWED_ORIGINS:origin,
 AI:{run(){throw Error('No fallback to Cloudflare');}}};
const request=(extra={})=>new Request('https://staging.test/api/chat',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json',...extra},body:JSON.stringify({provider:'groq',model,messages:[{role:'user',content:'Fixture only'}],temperature:0})});
async function limited(body,headers={}){
 let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(JSON.parse(options.body).model,model);return new Response(typeof body==='string'?body:JSON.stringify(body),{status:429,headers});};
 try{const response=await worker.fetch(request(),env);return {response,payload:await response.json(),calls};}finally{globalThis.fetch=nativeFetch;}
}
for(const [label,message,type] of [['daily','Rate limit: tokens per day (TPD). private-org fixture-key','daily'],['temporary','Rate limit: requests per minute (RPM). private-org','temporary'],['unknown','Limit reached private-org','unknown']])test('429 '+label+' emits only safe metadata and no fallback',async()=>{
 const r=await limited({error:{message,organization:'private-org',credential:'must-not-return'}},{'retry-after':'3600'});
 assert.equal(r.calls,1);assert.equal(r.response.status,429);assert.equal(r.response.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(r.response.headers.get('Access-Control-Expose-Headers'),'Retry-After');assert.equal(r.response.headers.get('Retry-After'),'3600');
 assert.deepEqual(r.payload.rateLimit,{type,retryAfterSeconds:3600});assert.equal(r.payload.code,'quota_exceeded');assert.equal(r.payload.requestedModel,model);
 for(const text of ['private-org','must-not-return',token,env.GROQ_API_KEY])assert.ok(!JSON.stringify(r.payload).includes(text));
});
test('daily without Retry-After never invents reset time',async()=>{
 const r=await limited({error:{limit_type:'daily',message:'Quota exhausted'}});assert.deepEqual(r.payload.rateLimit,{type:'daily',retryAfterSeconds:null});assert.equal(r.response.headers.get('Retry-After'),null);
});
test('Retry-After HTTP-date and values above 120 seconds are respected',async()=>{
 const originalNow=Date.now;Date.now=()=>Date.parse('2026-11-13T00:00:00.000Z');
 try{const r=await limited({error:{limit_type:'temporary'}},{'retry-after':'Fri, 13 Nov 2026 01:00:00 GMT'});assert.equal(r.payload.rateLimit.retryAfterSeconds,3600);assert.equal(r.response.headers.get('Retry-After'),'3600');}finally{Date.now=originalNow;}
});
for(const value of ['no-reset','-5','Infinity'])test('invalid Retry-After '+value+' is not forwarded',async()=>{
 const r=await limited('not JSON private-org',{'retry-after':value});assert.equal(r.payload.rateLimit.type,'unknown');assert.equal(r.payload.rateLimit.retryAfterSeconds,null);assert.equal(r.response.headers.get('Retry-After'),null);
});
test('preflight exposes only safe header for explicitly allowed local origin',async()=>{
 const response=await worker.fetch(new Request('https://staging.test/api/chat',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'}}),env);
 assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Expose-Headers'),'Retry-After');assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
});
test('authentication and origin guards remain before the provider call',async()=>{
 globalThis.fetch=()=>{throw Error('No upstream call');};
 try{
  const unauth=await worker.fetch(request({Authorization:'Bearer wrong-fixture-token'}),env);assert.equal(unauth.status,401);
  const denied=await worker.fetch(request({Origin:'https://untrusted.test'}),env);assert.equal(denied.status,403);assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
 }finally{globalThis.fetch=nativeFetch;}
});
test('successful model receipt remains compatible',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({model,id:'fixture-response',choices:[{message:{content:'NOA OK'}}],usage:{prompt_tokens:0,total_tokens:2}}));
 try{const response=await worker.fetch(request(),env),payload=await response.json();assert.equal(response.status,200);assert.equal(payload.text,'NOA OK');assert.equal(payload.verified,true);assert.equal(payload.model,model);assert.equal(payload.usage.prompt_tokens,0);}finally{globalThis.fetch=nativeFetch;}
});

test('ambiguous periods remain unknown instead of guessing daily',async()=>{const r=await limited({error:{message:'tokens per minute (TPM), requests per day (RPD)'}});assert.equal(r.payload.rateLimit.type,'unknown');});

const cloudflareModel='@cf/google/gemma-4-26b-a4b-it';
const externalModel='@cf/google/gemma-4-26b-a4b-it-external';
function requestFor(provider,wanted){return new Request('https://staging.test/api/chat',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({provider,model:wanted,messages:[{role:'user',content:'Fixture only'}],temperature:0})});}
for(const wanted of ['openai/gpt-oss-120b','openai/gpt-oss-20b','qwen/qwen3.8-27b'])test('model-specific Groq payload '+wanted,async()=>{
 let payload;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');payload=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer '+env.GROQ_API_KEY);return new Response(JSON.stringify({model:wanted,choices:[{message:{content:'NOA OK'}}]}));};
 try{
  const response=await worker.fetch(requestFor('groq',wanted),env);assert.equal(response.status,200);
  assert.equal(payload.model,wanted);assert.equal(payload.stream,false);assert.equal(payload.temperature,0);assert.equal(payload.max_completion_tokens,3000);assert.deepEqual(payload.messages,[{role:'user',content:'Fixture only'}]);assert.ok(!Object.hasOwn(payload,'reasoning_format'));
  if(wanted.startsWith('openai/')){assert.equal(payload.include_reasoning,false);assert.ok(!Object.hasOwn(payload,'reasoning_effort'));}
  else{assert.equal(payload.reasoning_effort,'none');assert.ok(!Object.hasOwn(payload,'include_reasoning'));}
  const result=await response.json();assert.equal(result.verified,true);for(const secret of [token,env.GROQ_API_KEY])assert.ok(!JSON.stringify(result).includes(secret));
 }finally{globalThis.fetch=nativeFetch;}
});
for(const reported of [cloudflareModel,externalModel])test('Cloudflare documented identity '+reported,async()=>{
 const configured={...env,AI:{async run(wanted,options){assert.equal(wanted,cloudflareModel);assert.deepEqual(options.chat_template_kwargs,{enable_thinking:false});return {response:'Texto conservado',model:reported,id:'fixture-cf-id',usage:{prompt_tokens:0,total_tokens:2},reasoning:'fixture-private-reasoning',secret:'fixture-private-secret'};}}};
 const response=await worker.fetch(requestFor('cloudflare',cloudflareModel),configured),result=await response.json();assert.equal(response.status,200);assert.equal(result.text,'Texto conservado');assert.equal(result.provider,'cloudflare');assert.equal(result.requestedModel,cloudflareModel);assert.equal(result.id,'fixture-cf-id');assert.equal(result.usage.prompt_tokens,0);
 if(reported===cloudflareModel){assert.equal(result.model,cloudflareModel);assert.equal(result.verified,true);assert.equal(result.verificationStatus,'matched');}
 else{assert.equal(result.model,null);assert.equal(result.reportedModel,externalModel);assert.equal(result.verified,false);assert.equal(result.verificationStatus,'external_unverified');}
 for(const text of ['fixture-private-reasoning','fixture-private-secret',token,env.GROQ_API_KEY])assert.ok(!JSON.stringify(result).includes(text));
});
for(const reported of [externalModel+'-v2',externalModel+'-other','@cf/google/another-model-external',cloudflareModel+' '])test('unknown Cloudflare identity remains rejected '+JSON.stringify(reported),async()=>{
 const response=await worker.fetch(requestFor('cloudflare',cloudflareModel),{...env,AI:{async run(){return {response:'Do not accept',model:reported};}}});const payload=await response.json();assert.equal(response.status,502);assert.ok(!Object.hasOwn(payload,'text'));assert.ok(!Object.hasOwn(payload,'verified'));
});
test('external identifier is never accepted as the requested public model',async()=>{
 let called=false;const response=await worker.fetch(requestFor('cloudflare',externalModel),{...env,AI:{run(){called=true;}}});assert.equal(response.status,400);assert.equal(called,false);
});
