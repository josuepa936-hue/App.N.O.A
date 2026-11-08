/* v27.3B phase 2: pure, experimental study priorities; no writes or scheduling. */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./excoba_patch_v27_results_normalization.js'):root.NOA_RESULTS_NORMALIZATION_V27);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.NOA_STUDY_RECOMMENDATIONS_V27=api;
})(globalThis,function(normalizer){
 'use strict';
 const DAY=86400000;
 const defaults={minResponses:4,minQuestions:3,minAttempts:2,lowCredit:.6,highCredit:.85,difficultyShare:.75,
  intervals:{evaluar:1,reforzar:1,practicar:3,repasar:7},weights:{errors:3,partials:1,overdue:1}};
 const technical=value=>value?.technicalTest===true||value?.evidenceKind==='technical_test';
 function date(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
  const [year,month,day]=value.slice(0,10).split('-').map(Number),leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  const time=Date.parse(value);
  return month>=1&&month<=12&&day>=1&&day<=days[month-1]&&Number.isFinite(time)?time:null;
 }
 function policy(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!Object.hasOwn(defaults,k)))throw new RangeError('Política inválida');
  for(const group of ['intervals','weights'])if(input[group]!==undefined&&(!input[group]||typeof input[group]!=='object'||Array.isArray(input[group])||Object.keys(input[group]).some(k=>!Object.hasOwn(defaults[group],k))))throw new RangeError('Política inválida: '+group);
  const p={...defaults,...input,intervals:{...defaults.intervals,...input.intervals},weights:{...defaults.weights,...input.weights}};
  for(const key of ['minResponses','minQuestions','minAttempts'])if(!Number.isSafeInteger(p[key])||p[key]<1)throw new RangeError('Umbral inválido: '+key);
  if(!Number.isFinite(p.lowCredit)||!Number.isFinite(p.highCredit)||p.lowCredit<0||p.highCredit>1||p.lowCredit>=p.highCredit)throw new RangeError('Umbrales de crédito inválidos');
  if(!Number.isFinite(p.difficultyShare)||p.difficultyShare<.5||p.difficultyShare>1)throw new RangeError('Proporción de dificultad inválida');
  for(const key of Object.keys(defaults.intervals))if(!Number.isInteger(p.intervals[key])||p.intervals[key]<1||p.intervals[key]>30)throw new RangeError('Intervalo inválido: '+key);
  if(p.intervals.evaluar>p.intervals.practicar||p.intervals.reforzar>p.intervals.practicar||p.intervals.practicar>p.intervals.repasar)throw new RangeError('Intervalos incoherentes');
  for(const key of Object.keys(defaults.weights))if(!Number.isFinite(p.weights[key])||p.weights[key]<0||p.weights[key]>100)throw new RangeError('Peso inválido: '+key);
  return p;
 }
 function build(attempts,{catalog,referenceDate,policy:customPolicy}={}){
  const now=date(referenceDate);if(now===null)throw new RangeError('Fecha de referencia ISO válida requerida');
  const p=policy(customPolicy),source=Array.isArray(attempts)?attempts:[];
  // catalog() in academic results supplies these verified, read-only references.
  if(!['verified-static','verified-persisted'].includes(catalog?.source)||!Array.isArray(catalog.items)||!Array.isArray(catalog.subjects))return {version:'1',recommendations:[],excluded:0,warnings:['Catálogo verificado no disponible']};
  const history=normalizer.normalizeHistory(source,{catalog,evidenceKind:'student'}),topics=new Map();
  let excluded=0;
  for(const projection of history.attempts){
   const variants=(projection.sourceAttemptIndexes||[]).map(i=>source[i]);
   const interpretable=projection.issues.every(issue=>issue==='duplicate_answers')&&projection.declaredTotal.state==='known'&&projection.declaredTotal.value===projection.records.length;
   const eligible=variants.length&&variants.every(a=>a?.evidenceKind==='student'&&!technical(a)&&!(Array.isArray(a.answers)&&a.answers.some(technical)))&&projection.attemptId.state==='known'&&interpretable&&projection.reportedScore.state==='known'&&Math.abs(projection.reportedScore.value-projection.records.reduce((sum,r)=>sum+(r.credit.value||0),0))<1e-9;
   for(const record of projection.records){
    const c=record.classification;
    const time=record.at.state==='known'?date(record.at.value):null;
    if(time!==null&&time>now){excluded++;continue;}
    if(!eligible||!record.domainEligible||record.status==='omitted'||record.questionId.state!=='known'||record.credit.state!=='known'||record.quality.deduplication==='unverifiable'||record.quality.issues.length||c.subject.state!=='known'||c.subtopic.state!=='known'||c.section.state!=='known'||record.allocations.length!==1){excluded++;continue;}
    const key=JSON.stringify([c.subject.value,c.subtopic.value]);
    if(!topics.has(key))topics.set(key,{subjectId:c.subject.value,subtopicId:c.subtopic.value,sectionId:c.section.value,credit:0,responses:0,questions:new Set(),attempts:new Set(),errors:0,partials:0,errorAttempts:new Set(),partialAttempts:new Set(),latest:null,dated:0});
    const t=topics.get(key),id=projection.attemptId.value;
    t.responses++;t.credit+=record.credit.value;t.questions.add(record.questionId.value);t.attempts.add(id);
    if(record.status==='incorrect'){t.errors++;t.errorAttempts.add(id);}
    if(record.status==='partial'){t.partials++;t.partialAttempts.add(id);}
    if(time!==null&&time<=now){t.dated++;t.latest=t.latest===null?time:Math.max(t.latest,time);}
   }
  }
  const recommendations=[...topics.values()].map(t=>{
   const sufficient=t.responses>=p.minResponses&&t.questions.size>=p.minQuestions&&t.attempts.size>=p.minAttempts;
   const fraction=t.credit/t.responses;
   const difficult=(t.errors/t.responses>=p.difficultyShare&&t.errorAttempts.size>=2)||(t.partials/t.responses>=p.difficultyShare&&t.partialAttempts.size>=2);
   const priority=!sufficient?'evaluar':fraction<=p.lowCredit&&difficult?'reforzar':fraction>=p.highCredit?'repasar':'practicar';
   const temporal=t.dated===t.responses&&t.latest!==null;
   const intervalDays=t.questions.size<2?Math.min(1,p.intervals[priority]):p.intervals[priority];
   const due=temporal?t.latest+intervalDays*DAY:null;
   const overdue=due===null?0:Math.max(0,Math.floor((now-due)/DAY));
   const components={errors:t.errorAttempts.size*p.weights.errors,partials:t.partialAttempts.size*p.weights.partials,overdue:Math.min(overdue,30)*p.weights.overdue};
   return {subjectId:t.subjectId,subtopicId:t.subtopicId,sectionId:t.sectionId,priority,
    reasons:[`${t.errors} errores completos en ${t.errorAttempts.size} intentos; ${t.partials} respuestas parciales en ${t.partialAttempts.size} intentos.`,`${t.credit}/${t.responses} créditos; ${t.questions.size} reactivos distintos y ${t.attempts.size} intentos.`,sufficient?'Cumple los umbrales de cantidad, diversidad e intentos.':'Evidencia insuficiente para inferir una dificultad consistente.'],
    evidence:{responses:t.responses,distinctQuestions:t.questions.size,distinctAttempts:t.attempts.size,credit:t.credit,maxCredit:t.responses,fraction,errors:t.errors,partials:t.partials,errorAttempts:t.errorAttempts.size,datedResponses:t.dated,lastPracticeAt:t.latest===null?null:new Date(t.latest).toISOString(),quality:sufficient?'sufficient':'insufficient'},
    practiceType:{evaluar:'evaluación diagnóstica',reforzar:'resolución guiada',practicar:'práctica variada',repasar:'recuperación sin apoyo'}[priority],
    review:{experimental:true,intervalDays,dueAt:due===null?null:new Date(due).toISOString(),due:due===null?null:now>=due},
    rank:{score:components.errors+components.partials+components.overdue,components},
    warnings:['Política experimental; no expresa frecuencia oficial EXCOBA ni certifica dominio.',...(!temporal?['Sin cobertura temporal completa; fecha de repaso no calculable.']:[]),...(t.questions.size<t.responses?['Repeticiones del mismo ID no cuentan como diversidad independiente.']:[])]};
  });
  const cmp=(a,b)=>a<b?-1:a>b?1:0;
  recommendations.sort((a,b)=>b.rank.score-a.rank.score||cmp(a.subjectId,b.subjectId)||cmp(a.subtopicId,b.subtopicId));
  return {version:'1',referenceDate:new Date(now).toISOString(),policy:p,recommendations,excluded,warnings:['Resultados descriptivos; no prueban aprendizaje causal. Reactivos distintos significa IDs distintos, no validación independiente del contenido.']};
 }
 return Object.freeze({version:'1',build});
});
