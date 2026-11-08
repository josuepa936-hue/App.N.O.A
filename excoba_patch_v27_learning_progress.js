/* v27.3A: pure descriptive history, no writes or adaptive recommendations. */
(function(root,factory){
 const node=typeof module==='object'&&module.exports;
 const api=factory(node?require('./excoba_patch_v27_results_normalization.js'):root.NOA_RESULTS_NORMALIZATION_V27,node?require('./excoba_patch_v27_academic_stats.js'):root.NOA_ACADEMIC_STATS_V27);
 if(node)module.exports=api;else root.NOA_LEARNING_PROGRESS_V27=api;
})(globalThis,function(normalizer,stats){
 'use strict';
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
   const raw=variants.flatMap(a=>Array.isArray(a?.answers)?a.answers:[]);
   let metadata=true;
   const descriptors=safe.records.map(r=>{
    const c=r.classification;
    if(!['section','subject','subtopic'].every(k=>c[k].state==='known')||r.format.state!=='known')metadata=false;
    const values=r.sourceIndexes.map(i=>raw[i]).filter(Boolean);
    const difficulties=[...new Set(values.map(a=>a.difficulty??a.blueprint?.difficulty??a.blueprintSlot?.difficulty?.level))];
    const sources=[...new Set(values.map(a=>a.sourceType??a.blueprintSlot?.sourceType))];
    if(difficulties.length!==1||!Number.isInteger(difficulties[0])||difficulties[0]<1||difficulties[0]>5||sources.length!==1||typeof sources[0]!=='string'||!sources[0].trim())metadata=false;
    return JSON.stringify([c.section.value,c.subject.value,c.subtopic.value,r.format.value,difficulties[0]??null,sources[0]??null]);
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
   if(kind==='technical_test')reasons.push('Datos técnicos de prueba');
   return {index,id:projection.attemptId.value,date,kind,report,coverage:{verified:report.stats.verifiedMaxCredit,total:report.stats.total,classified:safe.records.filter(r=>['section','subject','subtopic'].every(k=>r.classification[k].state==='known')).length},signature:JSON.stringify([report.stats.total,descriptors]),comparable:reasons.length===0,reasons,
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
  if(before.signature!==after.signature)reasons.push('Cantidad, cobertura, formatos, dificultad estimada o fuentes diferentes');
  if(reasons.length)return {comparable:false,reasons:[...new Set(reasons)],delta:null,change:null,subjects:[],sections:[]};
  const delta=after.report.stats.percent-before.report.stats.percent;
  const diff=(left,right)=>right.map(item=>{const previous=left.find(x=>x.id===item.id);return {id:item.id,label:item.label,before:previous.stats.percent,after:item.stats.percent,delta:item.stats.percent-previous.stats.percent,total:item.stats.total};});
  return {comparable:true,reasons:[],delta,change:Math.abs(delta)<1e-10?'estabilidad descriptiva':delta>0?'mejora descriptiva':'retroceso descriptivo',
   sections:diff(before.report.sections,after.report.sections),subjects:diff(before.report.sections.flatMap(s=>s.children),after.report.sections.flatMap(s=>s.children)),
   domainEvidence:before.kind==='student'&&after.kind==='student'&&before.report.stats.domain.answered>0&&after.report.stats.domain.answered>0,warning:'Muestra limitada: cambio descriptivo entre dos intentos; no demuestra aprendizaje causal. Perfil de entrenamiento y condiciones no registrados pueden variar.'};
 }
 return Object.freeze({version:'27.3A',build,compare});
});
