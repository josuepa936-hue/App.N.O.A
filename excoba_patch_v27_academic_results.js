/* v27.2 presentation: projections only; no save(), scoring or adaptive updates. */
(()=>{
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const display=value=>Number.isInteger(value)?String(value):String(Number(value.toFixed(4)));
 function metrics(s){
  const pct=s.percent===null?'No calculable':display(s.percent)+'%';
  return `<p><strong>${esc(pct)}</strong> · ${esc(display(s.credit))}/${s.maxCredit} créditos${s.unknown?' · crédito conocido; resultado incompleto':''}</p>
   <progress max="${Math.max(1,s.maxCredit)}" value="${s.credit}" aria-label="Créditos conocidos: ${esc(display(s.credit))} de ${s.maxCredit}"></progress>
   <p class="small">Total: ${s.total} · Respondidos: ${s.answered} · Correctos: ${s.correct} · Parciales: ${s.partial} · Incorrectos: ${s.incorrect} · Omitidos: ${s.omitted} (por tiempo: ${s.omittedByTime}) · Desconocidos/no verificables: ${s.unknown}</p>`;
 }
 function render(host,attempt){
  host.querySelector(':scope > .noa-academic-panel')?.remove();
  const catalog={subjects:window.NOA_EXCOBA_V4?.subjects||[],items:db.masterSyllabus?.items||[]};
  // Saved app attempts are student activity unless explicitly marked technical.
  const result=NOA_ACADEMIC_STATS_V27.aggregate(attempt,{catalog,evidenceKind:'student'});
  const panel=document.createElement('section');panel.className='noa-academic-panel card';panel.setAttribute('aria-label','Resultados académicos por materia y subtema');
  panel.innerHTML=`<h3>Desglose académico</h3>
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
 window.renderExam=function(...args){const value=previous.apply(this,args);if(examQueue.length&&examIndex>=examQueue.length){const host=document.getElementById('examBox');if(host&&host.dataset.noaResultsEngine==='23.0'&&window.NOA_EXAM_SHELL?.state?.()?.timing?.status!=='closing')render(host,{total:examQueue.length,answers:examAnswers});}return value;};
 const previousStats=window.renderExamStats;
 window.renderExamStats=function(...args){
  const value=previousStats.apply(this,args),host=document.getElementById('examStats');
  if(host&&db.attempts.length){
   const wrapper=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');
   label.textContent='Consultar desglose de un intento ';label.appendChild(select);wrapper.appendChild(label);
   const attempts=db.attempts.slice(-5).reverse();
   attempts.forEach((attempt,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=`Intento ${db.attempts.length-index} · ${attempt.at?fmtDate(attempt.at):'Fecha desconocida'}`;select.appendChild(option);});
   select.addEventListener('change',()=>render(wrapper,attempts[Number(select.value)]));host.appendChild(wrapper);render(wrapper,attempts[0]);
  }return value;
 };
 window.NOA_ACADEMIC_RESULTS_V27=Object.freeze({render});window.renderExamStats();
})();
