/* v27.2 presentation: projections only; no save(), scoring or adaptive updates. */
(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const display=value=>Number.isInteger(value)?String(value):String(Number(value.toFixed(4)));
 let initialized=false;
 const currentTokens=new WeakMap();
 function catalog(){
  const subjects=window.NOA_EXCOBA_V4?.subjects;
  const official=window.NOA_EXCOBA_FIX_V5?.items;
  if(!Array.isArray(subjects)||!Array.isArray(official))return {subjects:[],items:[],source:'unavailable'};
  const stored=db.masterSyllabus;
  const byCode=new Map(official.map(item=>[item.code,item]));
  const seen=new Set();
  const valid=stored?.id==='uaq-excoba-2026-2-medicina'&&Array.isArray(stored.items)&&stored.items.length===official.length&&stored.items.every(item=>{
   const expected=byCode.get(item?.code);
   if(!expected||seen.has(item.code))return false;
   seen.add(item.code);
   return ['subject','title','focus'].every(key=>item[key]===expected[key]);
  });
  // Use canonical values even for a verified persisted copy. Never repair it.
  const available=window.NOA_EXCOBA_PREPARATION?.trainingSubjects()||subjects;
  const supplemental=window.NOA_EXCOBA_PREPARATION?.items()||[];
  return {subjects:available.map(item=>({...item,prefixes:[...item.prefixes]})),items:[...official,...supplemental].map(item=>({...item})),source:valid?'verified-persisted':'verified-static',supplementalSources:supplemental.length?[window.NOA_EXCOBA_PREPARATION.reference()]:[]};
 }
 function evidence(attempt){
  if(attempt?.technicalTest===true||attempt?.evidenceKind==='technical_test')return 'technical_test';
  return attempt?.evidenceKind==='student'?'student':'unknown';
 }
 function currentResult(){
  const host=document.getElementById('examBox');
  if(!initialized||!host||!examQueue.length||examIndex<examQueue.length||host.dataset.noaResultsEngine!=='23.0'||window.NOA_EXAM_SHELL?.state?.()?.timing?.status==='closing')return;
  const answers=examAnswers,database=db,queue=examQueue,token={};currentTokens.set(host,token);
  const stillCurrent=()=>db===database&&examAnswers===answers&&examQueue===queue&&examIndex>=queue.length&&currentTokens.get(host)===token;
  const id=window.NOA_EXAM_SHELL?.state?.()?.timing?.attemptId;
  const stored=id&&database.attempts.find(attempt=>attempt.id===id);
  if(stored){render(host,stored);return;}
  const completion=typeof noaCompletedExamCommits!=='undefined'?noaCompletedExamCommits.get(answers):null;
  if(completion){
   Promise.resolve(completion).then(attempt=>{
    if(!stillCurrent())return;
    const saved=attempt&&database.attempts.find(item=>item.id===attempt.id);
    render(host,saved||{total:queue.length,answers});
   }).catch(()=>{ /* Existing v26 closure owns errors; never commit from here. */ });
  }else render(host,{total:queue.length,answers});
 }
 function metrics(s){
  const pct=s.percent===null?'No calculable':display(s.percent)+'%';
  return `<p><strong>${esc(pct)}</strong> · ${esc(display(s.credit))}/${s.maxCredit} créditos${s.unknown?' · crédito conocido; resultado incompleto':''}</p>
   <progress max="${Math.max(1,s.maxCredit)}" value="${s.credit}" aria-label="Créditos conocidos: ${esc(display(s.credit))} de ${s.maxCredit}"></progress>
   <p class="small">Total: ${s.total} · Respondidos: ${s.answered} · Correctos: ${s.correct} · Parciales: ${s.partial} · Incorrectos: ${s.incorrect} · Omitidos: ${s.omitted} (por tiempo: ${s.omittedByTime}) · Desconocidos/no verificables: ${s.unknown}</p>`;
 }
 function render(host,attempt){
  host.querySelector(':scope > .noa-academic-panel')?.remove();
  if(!initialized)return null;
  const resolved=catalog();
  const kind=evidence(attempt);
  const result=NOA_ACADEMIC_STATS_V27.aggregate(attempt,{catalog:resolved,evidenceKind:kind});
  const panel=document.createElement('section');panel.className='noa-academic-panel card';panel.setAttribute('aria-label','Resultados académicos por materia y subtema');
  panel.innerHTML=`<h3>Desglose académico</h3>
   <p class="small">Procedencia: ${kind==='technical_test'?'datos técnicos de prueba':kind==='student'?'estudiante declarada':'desconocida; no aporta evidencia de dominio'}.</p>
   <p class="small">Rendimiento del examen: créditos obtenidos / créditos máximos, incluidas omisiones de cero. El porcentaje global exige un total registrado y créditos verificables. Las cifras de crédito se muestran redondeadas, conservando el valor exacto en el cálculo.</p>
   ${metrics(result.stats)}
   <p class="small">Evidencia sobre respuestas: ${display(result.stats.domain.credit)}/${result.stats.domain.maxCredit} créditos · ${result.stats.domain.knowledgeErrors} errores de conocimiento. Excluye omisiones, datos técnicos marcados y registros no verificables. No es una certificación de dominio ni una tendencia.</p>
   ${result.sections.map(section=>`<article class="noa-academic-section"><h4>${esc(section.label)}</h4>${metrics(section.stats)}
    ${section.children.map(subject=>`<details class="noa-academic-subject"><summary>${esc(subject.label)}</summary>${metrics(subject.stats)}
     <details><summary>Subtemas</summary>${subject.children.map(sub=>`<article><h5>${esc(sub.id?sub.id+' · '+sub.label:sub.label)}</h5>${metrics(sub.stats)}</article>`).join('')}</details></details>`).join('')}</article>`).join('')}
   ${!result.complete?'<p class="small">El registro contiene datos incompletos o duplicados; no se han inventado respuestas.</p>':''}`;
  host.appendChild(panel);return result;
 }
 const style=document.createElement('style');style.textContent=`.noa-academic-panel{margin-top:16px;overflow-wrap:anywhere;min-width:0}.noa-academic-panel progress{width:100%;height:14px;accent-color:#51d6bb}.noa-academic-panel .small{color:#c4cede;line-height:1.6}.noa-academic-panel summary{cursor:pointer;padding:12px 4px;color:#e9efff}.noa-academic-panel summary:focus-visible{outline:3px solid #51d6bb;outline-offset:2px}.noa-academic-section{padding:10px 0;border-top:1px solid #42506a}.noa-academic-subject{padding:4px 8px;background:#101d30;margin:8px 0;border-radius:10px}.noa-academic-panel h5{font-size:1rem;margin:12px 0}`;document.head.appendChild(style);
 const previous=window.renderExam;
 window.renderExam=function(...args){const value=previous.apply(this,args);currentResult();return value;};
 const previousStats=window.renderExamStats;
 window.renderExamStats=function(...args){
  const value=previousStats.apply(this,args),host=document.getElementById('examStats');
  if(initialized&&host&&db.attempts.length){
   const wrapper=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');
   label.textContent='Consultar desglose de un intento ';label.appendChild(select);wrapper.appendChild(label);
   const attempts=db.attempts.slice(-5).reverse();
   attempts.forEach((attempt,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=`Intento ${db.attempts.length-index} · ${attempt.at?fmtDate(attempt.at):'Fecha desconocida'}`;select.appendChild(option);});
   select.addEventListener('change',()=>render(wrapper,attempts[Number(select.value)]));host.appendChild(wrapper);render(wrapper,attempts[0]);
  }return value;
 };
 function refresh(){if(!initialized)return;window.renderExamStats();currentResult();}
 function init(){if(initialized)return;initialized=true;refresh();}
 window.NOA_ACADEMIC_RESULTS_V27=Object.freeze({render,catalog,refresh});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
