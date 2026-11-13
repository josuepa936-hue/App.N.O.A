const {alignedReview}=require('./judge-academic-fixtures.cjs');
const bridge='https://noa-bridge-v2.test';
const token='fixture-only-not-a-real-secret';
async function configure(page,provider='groq',model){
 await page.evaluate(({bridge,token,provider,model})=>{
  db.settings.aiProvider=provider;db.settings.bridgeUrl=bridge;db.settings.bridgeToken=token;
  if(model)db.settings[provider==='cloudflare'?'cloudflareModel':provider==='ollama'?'ollamaModel':'groqModel']=model;
  save();loadAISettingsUI();clearAIConnection();
 },{bridge,token,provider,model});
}
function receipt(body,text='NOA OK',extra={}){
 return {text,provider:body.provider,requestedModel:body.model,model:body.model,verified:true,verificationStatus:'matched',id:'synthetic-response',usage:{prompt_tokens:0,completion_tokens:2,total_tokens:2},...extra};
}
async function mockBridge(page,respond){
 const calls=[];
 await page.route(bridge+'/**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS'}});
  const body=route.request().postDataJSON();
  calls.push({provider:body.provider,model:body.model,temperature:body.temperature,roles:body.messages.map(m=>m.role),authorized:route.request().headers().authorization==='Bearer '+token});
  const response=await respond(body,calls.length,route);
  if(response===null)return;
  await route.fulfill({status:response?.status||200,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json',...(response?.headers||{})},body:typeof response?.raw==='string'?response.raw:JSON.stringify(response?.body??receipt(body))});
 });
 return calls;
}
function physicsItem(format,index){
 const items={
  single_select:{question:'¿Qué unidad del SI corresponde a una fuerza?',options:['newton','joule','watt','pascal'],correct:0,explanation:'Un newton equivale a kg·m/s².'},
  drag_classify:{instruction:'Clasifica las magnitudes en escalares y vectoriales.',stem:'Magnitudes físicas.',targets:[{id:'even',label:'Escalar'},{id:'odd',label:'Vectorial'}],elements:[{id:'two',text:'Masa',correctTargetId:'even'},{id:'four',text:'Temperatura',correctTargetId:'even'},{id:'one',text:'Velocidad',correctTargetId:'odd'},{id:'three',text:'Fuerza',correctTargetId:'odd'}],explanation:'Masa y temperatura son escalares; velocidad y fuerza requieren dirección.'},
  inline_select:{instruction:'Completa las unidades del SI.',text:'El trabajo se mide en [[b1]] y la potencia en [[b2]].',blanks:[{id:'b1',options:['joules','watts'],correct:0},{id:'b2',options:['watts','joules'],correct:0}],explanation:'El trabajo es energía; la potencia es energía por unidad de tiempo.'},
  drag_order:{instruction:'Ordena cronológicamente las observaciones de un móvil.',stem:'Movimiento rectilíneo.',items:[{id:'one',text:'t = 0 s: x = 0 m'},{id:'two',text:'t = 1 s: x = 2 m'},{id:'three',text:'t = 2 s: x = 4 m'}],correctOrder:['one','two','three'],explanation:'Los instantes se ordenan de 0 a 2 segundos.'}
 };
 const q=structuredClone(items[format]);for(const key of ['question','text','stem'])if(q[key])q[key]+=' Caso sintético '+index+'.';return q;
}
async function physicsBridge(page,options={}){
 const stats={generated:0,judged:0,formats:[]};
 const calls=await mockBridge(page,body=>{
  const system=body.messages[0].content,prompt=body.messages.at(-1).content,isJudge=system.includes('Judge');
  const format=isJudge?(prompt.includes('"sequence_validity"')?'drag_order':prompt.includes('"blank_quality"')?'inline_select':prompt.includes('"classification_quality"')?'drag_classify':'single_select'):
   system.includes('Drag Order Generator')?'drag_order':system.includes('Inline Select Generator')?'inline_select':system.includes('Drag Generator')?'drag_classify':'single_select';
  const intercepted=options.respond?.({body,isJudge,format,stats});if(intercepted)return intercepted;
  const value=isJudge?(stats.judged++,alignedReview(format,body.messages)):(stats.formats.push(format),physicsItem(format,++stats.generated));
  return {body:receipt(body,JSON.stringify(value),{id:'synthetic-'+(stats.generated+stats.judged)})};
 });
 return {calls,stats};
}
module.exports={bridge,token,configure,receipt,mockBridge,physicsBridge};
