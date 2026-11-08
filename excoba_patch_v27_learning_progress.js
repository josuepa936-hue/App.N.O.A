/* v27.3A: pure descriptive history, no writes or adaptive recommendations. */
(function(root,factory){
 const node=typeof module==='object'&&module.exports;
 const api=factory(node?require('./excoba_patch_v27_results_normalization.js'):root.NOA_RESULTS_NORMALIZATION_V27,node?require('./excoba_patch_v27_academic_stats.js'):root.NOA_ACADEMIC_STATS_V27);
 if(node)module.exports=api;else root.NOA_LEARNING_PROGRESS_V27=api;
})(globalThis,function(normalizer,stats){
 'use strict';
 const own=(value,key)=>value!=null&&Object.prototype.hasOwnProperty.call(value,key);
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 function evidence(value,path,valid){
  const state=value==null?'unknown':valid(value)?'known':'invalid';
  // Diagnostic values must never retain an input object or array.
  return {source:path,state,value:['string','number','boolean'].includes(typeof value)&&!(typeof value==='number'&&!Number.isFinite(value))?value:null};
 }
 function readCondition(input,path,prefix,valid){
  let value=input;
  for(let i=0;i<path.length;i++){
   if(!object(value))return value==null?[]:[evidence(value,prefix+'.'+path.slice(0,i).join('.'),()=>false)];
   if(!own(value,path[i]))return [];
   value=value[path[i]];
  }
  return [evidence(value,prefix+'.'+path.join('.'),valid)];
 }
 function condition(items){
  const known=items.filter(item=>item.state==='known'),values=new Set(known.map(item=>item.value));
  const state=values.size>1?'conflict':items.some(item=>item.state==='invalid')?'invalid':items.some(item=>item.state==='unknown')?'unknown':known.length?'known':'absent';
  return {state,value:state==='known'?known[0].value:null,sources:items.map(item=>item.source),evidence:items};
 }
 function temporalConditions(variants,indexes){
  const copies=variants.map((attempt,i)=>{
   const path='attempts['+indexes[i]+'].timing';
   if(!own(attempt,'timing'))return {state:'absent',mode:'unknown',durationMs:null,sources:[],evidence:[]};
   const value=attempt.timing;
   const result={state:'unknown',mode:'unknown',durationMs:null,sources:[path],evidence:[]};
   if(value==null)return result;
   if(!object(value))return {...result,state:'invalid',evidence:[evidence(value,path,()=>false)]};
   const fields=['mode','version','durationMs','startedAt','deadlineAt'];
   result.evidence=fields.filter(key=>own(value,key)).map(key=>evidence(value[key],path+'.'+key,entry=>{
    if(key==='mode')return ['timed','untimed'].includes(entry);
    if(key==='version')return entry===26;
    return Number.isSafeInteger(entry)&&(key==='durationMs'?entry>=60000&&entry<=86400000:entry>0);
   }));
   result.sources=result.evidence.length?result.evidence.map(item=>item.source):[path];
   // Explicit read-only declaration; v26 does not persist this for untimed exams.
   if(value.mode==='untimed'){
    if(['durationMs','startedAt','deadlineAt'].some(key=>own(value,key)))return {...result,state:'conflict'};
    return {...result,state:result.evidence.some(item=>item.state!=='known')?'invalid':'known',mode:'untimed'};
   }
   if(result.evidence.some(item=>item.state==='invalid'))return {...result,state:'invalid'};
   if(result.evidence.some(item=>item.state==='unknown'))return result;
   if(value.version!==26||!own(value,'durationMs'))return result;
   // Check the stored allowed interval when present, never the elapsed time.
   if(own(value,'startedAt')||own(value,'deadlineAt')){
    if(!own(value,'startedAt')||!own(value,'deadlineAt'))return result;
    if(value.deadlineAt!==value.startedAt+value.durationMs)return {...result,state:'conflict'};
   }
   return {...result,state:'known',mode:'timed',durationMs:value.durationMs};
  });
  const known=copies.filter(copy=>copy.state==='known');
  const signatures=new Set(known.map(copy=>JSON.stringify([copy.mode,copy.durationMs])));
  const state=signatures.size>1||copies.some(copy=>copy.state==='conflict')?'conflict':copies.some(copy=>copy.state==='invalid')?'invalid':copies.some(copy=>copy.state==='unknown')?'unknown':known.length?'known':'absent';
  return {state,mode:state==='known'?known[0].mode:'unknown',durationMs:state==='known'?known[0].durationMs:null,
   sources:copies.flatMap(copy=>copy.sources),evidence:copies.flatMap(copy=>copy.evidence)};
 }
 function build(attempts,options={}){
  const source=Array.isArray(attempts)?attempts:[];
  const history=normalizer.normalizeHistory(source,{catalog:options.catalog,evidenceKind:'student'});
  const rows=history.attempts.map((projection,index)=>{
   const indexes=projection.sourceAttemptIndexes||[index],variants=indexes.map(i=>source[i]);
   const kind=(variants.some(a=>a?.technicalTest===true||a?.evidenceKind==='technical_test')||projection.records.some(r=>r.evidenceKind==='technical_test'))?'technical_test':variants.every(a=>a?.evidenceKind==='student')?'student':'unknown';
   const safe={...projection,records:projection.records.map(r=>({...r,domainEligible:kind==='student'&&r.domainEligible,knowledgeError:kind==='student'?r.knowledgeError:null}))};
   const report=stats.aggregateProjection(safe);
   const scoreVerified=projection.reportedScore.state==='known'&&Math.abs(projection.reportedScore.value-report.stats.credit)<1e-9;
   if(!scoreVerified)report.complete=false;
   const timing=temporalConditions(variants,indexes);
   const raw=variants.flatMap((a,i)=>Array.isArray(a?.answers)?a.answers.map((value,j)=>({value,path:'attempts['+indexes[i]+'].answers['+j+']'})):[]);
   const itemConditions=[];
   let metadata=true;
   const descriptors=safe.records.map(r=>{
    const c=r.classification;
    if(!['section','subject','subtopic'].every(k=>c[k].state==='known')||r.format.state!=='known')metadata=false;
    const values=r.sourceIndexes.map(i=>raw[i]).filter(Boolean);
    const difficulty=condition(values.flatMap(a=>[['difficulty'],['blueprint','difficulty'],['blueprintSlot','difficulty','level']].flatMap(path=>readCondition(a.value,path,a.path,value=>Number.isInteger(value)&&value>=1&&value<=5))));
    const sourceType=condition(values.flatMap(a=>[['sourceType'],['blueprintSlot','sourceType']].flatMap(path=>readCondition(a.value,path,a.path,value=>['official','extended','course'].includes(value)))));
    itemConditions.push({key:r.key,sourceIndexes:[...r.sourceIndexes],difficulty,sourceType});
    if(difficulty.state!=='known'||sourceType.state!=='known')metadata=false;
    return JSON.stringify([c.section.value,c.subject.value,c.subtopic.value,r.format.value,difficulty.value,sourceType.value]);
   }).sort();
   const parts=(projection.at.value||'').slice(0,10).split('-').map(Number);
   const calendar=parts.length===3&&parts[1]>=1&&parts[1]<=12&&parts[2]>=1&&parts[2]<=new Date(Date.UTC(parts[0],parts[1],0)).getUTCDate();
   if(!report.complete)report.stats.percent=null;
   const date=projection.at.state==='known'&&calendar?projection.at.value:null;
   const reasons=[];
   if(!scoreVerified)reasons.push('Resumen de puntuación ausente o incompatible con los créditos');
   if(!report.complete||report.stats.percent===null||report.stats.total===0)reasons.push('Resultado incompleto o no verificable');
   if(projection.attemptId.state!=='known')reasons.push('Identificador no verificable');
   if(!date)reasons.push('Fecha ausente, inválida o contradictoria');
   if(!metadata)reasons.push('Cobertura o condiciones académicas insuficientes');
   if(timing.state!=='known')reasons.push('Configuración temporal ausente, desconocida, inválida o contradictoria');
   if(kind==='technical_test')reasons.push('Datos técnicos de prueba');
   return {index,id:projection.attemptId.value,date,kind,report,conditions:{timing,items:itemConditions},coverage:{verified:report.stats.verifiedMaxCredit,total:report.stats.total,classified:safe.records.filter(r=>['section','subject','subtopic'].every(k=>r.classification[k].state==='known')).length},signature:JSON.stringify([report.stats.total,descriptors,timing.mode,timing.durationMs]),comparable:reasons.length===0,reasons,
    warning:kind==='unknown'?'Procedencia desconocida: historial descriptivo, sin evidencia verificada de dominio.':kind==='technical_test'?'Datos técnicos excluidos de comparaciones.':'Procedencia declarada del estudiante; no certifica dominio.'};
  });
  rows.sort((a,b)=>a.date&&b.date?Date.parse(a.date)-Date.parse(b.date)||a.index-b.index:a.date?-1:b.date?1:a.index-b.index);
  const cohorts=new Map();
  for(const row of rows.filter(r=>r.comparable)){if(!cohorts.has(row.signature))cohorts.set(row.signature,new Set());cohorts.get(row.signature).add(Date.parse(row.date));}
  const hasPair=[...cohorts.values()].some(dates=>dates.size>=2);
  return {version:'27.3A',rows,issues:history.issues,comparableCount:rows.filter(r=>r.comparable).length,
   sampleStatus:!hasPair?'Muestra insuficiente o condiciones incompatibles para comparar.':'Comparación descriptiva; no demuestra aprendizaje ni dominio.'};
 }
 function compare(before,after){
  const reasons=[];
  if(!before||!after)return {comparable:false,reasons:['Selecciona dos intentos'],delta:null,change:null,subjects:[],sections:[]};
  reasons.push(...before.reasons,...after.reasons);
  if(before.index===after.index)reasons.push('Es el mismo intento');
  if(before.date&&after.date&&Date.parse(before.date)>=Date.parse(after.date))reasons.push('Selecciona fechas distintas en orden cronológico');
  if(before.signature!==after.signature)reasons.push('Cantidad, cobertura, formatos, dificultad estimada, fuentes o condiciones temporales diferentes');
  if(reasons.length)return {comparable:false,reasons:[...new Set(reasons)],delta:null,change:null,subjects:[],sections:[]};
  const delta=after.report.stats.percent-before.report.stats.percent;
  const diff=(left,right)=>right.map(item=>{const previous=left.find(x=>x.id===item.id);return {id:item.id,label:item.label,before:previous.stats.percent,after:item.stats.percent,delta:item.stats.percent-previous.stats.percent,total:item.stats.total};});
  return {comparable:true,reasons:[],delta,change:Math.abs(delta)<1e-10?'estabilidad descriptiva':delta>0?'mejora descriptiva':'retroceso descriptivo',
   sections:diff(before.report.sections,after.report.sections),subjects:diff(before.report.sections.flatMap(s=>s.children),after.report.sections.flatMap(s=>s.children)),
   domainEvidence:before.kind==='student'&&after.kind==='student'&&before.report.stats.domain.answered>0&&after.report.stats.domain.answered>0,warning:'Muestra limitada: cambio descriptivo entre dos intentos; no demuestra aprendizaje causal. Perfil de entrenamiento y condiciones no registrados pueden variar.'};
 }
 return Object.freeze({version:'27.3A',build,compare});
});
