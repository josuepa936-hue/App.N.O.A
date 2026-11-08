/* v27.2: pure aggregation of the v27.1 projection; no persistence or scoring. */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./excoba_patch_v27_results_normalization.js'):root.NOA_RESULTS_NORMALIZATION_V27);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.NOA_ACADEMIC_STATS_V27=api;
})(globalThis,function(normalizer){
 'use strict';
 const empty=()=>({total:0,answered:0,correct:0,incorrect:0,partial:0,omitted:0,omittedByTime:0,unknown:0,credit:0,maxCredit:0,verifiedMaxCredit:0,percent:null,domain:{answered:0,knowledgeErrors:0,credit:0,maxCredit:0}});
 function add(stats,record){
  stats.total++;stats.maxCredit++;
  const verified=record.credit.state==='known'&&record.status!=='unknown'&&record.quality.deduplication!=='unverifiable';
  if(!verified)stats.unknown++;
  else{stats.credit+=record.credit.value;stats.verifiedMaxCredit++;}
  if(record.status==='omitted'){
   stats.omitted++;if(record.omissionReason.value==='timeout'||record.finishReason.value==='timeout')stats.omittedByTime++;
  }else if(['correct','incorrect','partial'].includes(record.status)){
   stats.answered++;stats[record.status]++;
  }
  if(verified&&record.domainEligible){
   stats.domain.answered++;stats.domain.maxCredit++;stats.domain.credit+=record.credit.value;
   if(record.knowledgeError===true)stats.domain.knowledgeErrors++;
  }
 }
 function finish(stats){stats.percent=stats.total>0&&stats.unknown===0?stats.credit/stats.maxCredit*100:null;return stats;}
 function aggregateProjection(projection){
  const overall=empty(),sections=new Map();
  const bucket=(map,id,label)=>{if(!map.has(id))map.set(id,{id,label,stats:empty(),children:new Map()});return map.get(id);};
  for(const record of projection.records){
   const c=record.classification;
   const section=bucket(sections,c.section.state==='known'?c.section.value:null,c.labels.section);
   const subject=bucket(section.children,c.subject.state==='known'?c.subject.value:null,c.labels.subject);
   const subId=c.subtopic.state==='known'&&record.allocations.length===1?c.subtopic.value:null;
   const sub=bucket(subject.children,subId,subId?c.labels.subtopic:'Sin clasificar');
   for(const stats of [overall,section.stats,subject.stats,sub.stats])add(stats,record);
  }
  const missing=projection.declaredTotal.state==='known'?Math.max(0,projection.declaredTotal.value-projection.records.length):0;
  // Missing historical answers have no invented identities or classification.
  if(missing){
   const section=bucket(sections,null,'Sin clasificar'),subject=bucket(section.children,null,'Sin clasificar'),sub=bucket(subject.children,null,'Sin clasificar');
   for(const stats of [overall,section.stats,subject.stats,sub.stats]){stats.total+=missing;stats.unknown+=missing;stats.maxCredit+=missing;}
  }
  finish(overall);
  if(projection.declaredTotal.state!=='known'||projection.declaredTotal.value!==overall.total)overall.percent=null;
  const serialize=map=>[...map.values()].map(item=>({id:item.id,label:item.label,stats:finish(item.stats),children:serialize(item.children)}));
  return {version:'27.2',attemptId:projection.attemptId,stats:overall,sections:serialize(sections),issues:[...projection.issues],
   declaredTotal:projection.declaredTotal,complete:projection.completeness==='complete'&&overall.unknown===0};
 }
 function aggregate(attempt,options={}){return aggregateProjection(normalizer.normalizeAttempt(attempt,options));}
 return Object.freeze({version:'27.2',aggregate,aggregateProjection});
});
