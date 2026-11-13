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
