/* v27.3B phase 3: read-only presentation of the recommendation engine. */
(()=>{
 'use strict';
 const labels={reforzar:'Reforzar',practicar:'Practicar',repasar:'Repasar',evaluar:'Evaluar'};
 const explanations={reforzar:'Dificultad recurrente con evidencia suficiente.',practicar:'Rendimiento mixto o contenido en consolidación.',repasar:'Evidencia favorable; recuperación periódica sugerida.',evaluar:'Información insuficiente para establecer una prioridad académica.'};
 const number=v=>Number.isFinite(v)?String(Number(v.toFixed(4))):'No calculable';
 const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}):'Sin fecha verificable';
 const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 let initialized=false,controls=null,cache=null,lastDraw=null,retry=null,delay=250;
 function reference(){return new Date().toISOString();}
 function ensure(){
  const host=document.getElementById('noaStudyPlan');if(!host)return null;
  if(controls)return host;
  host.classList.add('noa-study-plan');
  host.appendChild(node('h2','Mi plan de estudio — Recomendaciones NOA')).id='noaStudyPlanTitle';
  host.appendChild(node('p','Prioridades de repaso calculadas a partir de sesiones de estudio declaradas y evidencia admisible. Son orientaciones experimentales, no diagnósticos de dominio ni frecuencias oficiales del EXCOBA.','noa-plan-help'));
  const filters=node('div',undefined,'noa-plan-filters');
  const select=(id,label,options)=>{const wrap=node('div',undefined,'noa-plan-field'),caption=node('label',label),input=node('select');input.id=id;caption.htmlFor=id;options.forEach(([value,text])=>{const o=node('option',text);o.value=value;input.appendChild(o);});wrap.append(caption,input);filters.appendChild(wrap);return input;};
  const subject=select('noaPlanSubject','Materia',[['','Todas las materias']]);
  const priority=select('noaPlanPriority','Prioridad',[['','Todas las prioridades'],...Object.entries(labels)]);
  const order=select('noaPlanOrder','Orden de presentación',[['priority','Prioridad calculada por NOA'],['subject','Materia y subtema (A–Z)']]);
  const checkLabel=node('label','Solo repasos vencidos'),overdue=node('input');overdue.type='checkbox';overdue.id='noaPlanOverdue';checkLabel.prepend(overdue);filters.appendChild(checkLabel);
  const all=node('button','Ver todas'),refresh=node('button','Actualizar plan');all.type=refresh.type='button';all.className=refresh.className='btn';filters.append(all,refresh);
  const status=node('p',undefined,'noa-plan-status');status.id='noaPlanStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const coverage=node('p',undefined,'noa-plan-help');coverage.id='noaPlanCoverage';
  const cards=node('div',undefined,'noa-plan-cards');cards.id='noaPlanCards';
  host.append(filters,status,coverage,cards);controls={subject,priority,order,overdue,all,refresh,status,coverage,cards};
  for(const el of [subject,priority,order,overdue])el.addEventListener('change',draw);
  all.addEventListener('click',()=>{subject.value=priority.value='';overdue.checked=false;order.value='priority';draw();});
  refresh.addEventListener('click',()=>update(true));
  return host;
 }
 function unavailable(message){
  cache=null;lastDraw=null;controls.cards.replaceChildren();controls.status.textContent=message;controls.coverage.textContent='Las recomendaciones se mostrarán cuando estén disponibles el catálogo verificado y los módulos académicos.';
  for(const key of ['subject','priority','order','overdue','all'])controls[key].disabled=true;
  if(retry===null)retry=setTimeout(()=>{retry=null;delay=Math.min(delay*2,10000);update();},delay);
 }
 function draw(){
  if(!cache)return;
  const {subject,priority,order,overdue,status,cards}=controls;
  const signature=JSON.stringify([cache.key,subject.value,priority.value,order.value,overdue.checked]);
  if(lastDraw===signature)return;lastDraw=signature;
  // Filtering preserves the engine's order; only the optional alphabetical view sorts.
  let rows=cache.model.recommendations.filter(r=>(!subject.value||r.subjectId===subject.value)&&(!priority.value||r.priority===priority.value)&&(!overdue.checked||r.review.due===true));
  if(order.value==='subject'){
   const name=r=>({subject:cache.catalog.subjects.find(s=>s.value===r.subjectId)?.value,
    title:cache.catalog.items.find(i=>i.code===r.subtopicId&&i.subject===r.subjectId)?.title});
   const compare=(a,b)=>a<b?-1:a>b?1:0;
   rows=[...rows].sort((a,b)=>{
    const x=name(a),y=name(b);
    return (x.subject||'').localeCompare(y.subject||'','es')||
     (x.title||'').localeCompare(y.title||'','es')||compare(a.subjectId,b.subjectId)||compare(a.subtopicId,b.subtopicId);
   });
  }
  cards.replaceChildren();
  if(!cache.attemptCount)status.textContent='Historial vacío. Completa un simulacro para disponer de resultados.';
  else if(!cache.declared)status.textContent='No hay sesiones de estudio declaradas. La procedencia técnica o desconocida no aporta evidencia de dominio. La declaración solo se aplica a nuevos simulacros.';
  else if(!cache.model.recommendations.length)status.textContent='No hay evidencia académica suficiente y admisible para proponer recomendaciones.';
  else if(!rows.length)status.textContent='No hay recomendaciones para los filtros elegidos.';
  else status.textContent=`${rows.length} de ${cache.model.recommendations.length} recomendaciones · ${Object.entries(labels).map(([key,label])=>label+': '+rows.filter(r=>r.priority===key).length).join(' · ')}`;
  for(const r of rows){
   const item=cache.catalog.items.find(item=>item.code===r.subtopicId&&item.subject===r.subjectId);
   const subjectEntry=cache.catalog.subjects.find(s=>s.value===r.subjectId);
   if(!item||!subjectEntry)continue; // Never invent a classification if the adapter changes.
   const card=node('article',undefined,'noa-plan-item noa-plan-'+r.priority);card.dataset.priority=r.priority;card.dataset.subtopic=r.subtopicId;
   card.appendChild(node('p',subjectEntry.value,'noa-plan-subject'));
   card.appendChild(node('h3',r.subtopicId+' · '+(item.title||r.subtopicId)));
   card.appendChild(node('p',labels[r.priority]+' · '+(r.evidence.quality==='sufficient'?'Evidencia suficiente según los umbrales experimentales':'Evidencia insuficiente'),'noa-plan-badge'));
   card.appendChild(node('p',explanations[r.priority]));
   card.appendChild(node('p',`${number(r.evidence.credit)}/${number(r.evidence.maxCredit)} créditos · ${r.evidence.responses} respuestas utilizadas · ${r.evidence.distinctQuestions} reactivos distintos · ${r.evidence.distinctAttempts} intentos`));
   card.appendChild(node('p','Próximo repaso sugerido: '+date(r.review.dueAt)+(r.review.due===true?' · Vencido':r.review.due===false?' · Próximo':''),'noa-plan-date'));
   card.appendChild(node('p','Práctica sugerida: '+r.practiceType));
   const detail=node('details'),summary=node('summary','Por qué se recomienda y evidencia');detail.appendChild(summary);
   detail.appendChild(node('p',`${r.evidence.errors} errores completos · ${r.evidence.partials} respuestas parciales. Las omisiones no se consideran automáticamente errores de conocimiento.`));
   detail.appendChild(node('p','Última práctica verificable: '+date(r.evidence.lastPracticeAt)));
   detail.appendChild(node('p',`${r.evidence.datedResponses}/${r.evidence.responses} respuestas con fecha verificable. Los créditos se redondean solo en esta presentación.`));
   const reasons=node('ul');r.reasons.forEach(reason=>reasons.appendChild(node('li',reason)));detail.appendChild(reasons);
   r.warnings.forEach(w=>detail.appendChild(node('p',w,'noa-plan-help')));card.appendChild(detail);cards.appendChild(card);
  }
 }
 function update(force=false){
  if(!initialized||!ensure())return;
  try{
   const catalog=window.NOA_ACADEMIC_RESULTS_V27?.catalog?.();
   if(!window.NOA_STUDY_RECOMMENDATIONS_V27||!['verified-static','verified-persisted'].includes(catalog?.source)||!catalog.items?.length||!catalog.subjects?.length){unavailable('Catálogo académico o módulos temporalmente no disponibles.');return;}
   if(retry!==null){clearTimeout(retry);retry=null;}delay=250;
   // Bucket only the cache key, never the engine reference: a just-saved attempt
   // must not appear to be in the future merely because seconds were truncated.
   const at=reference(),attempts=db.attempts,key=JSON.stringify([attempts,catalog,at.slice(0,16)]);
   if(force||!cache||cache.key!==key){
    lastDraw=null;
    const model=NOA_STUDY_RECOMMENDATIONS_V27.build(attempts,{catalog,referenceDate:at});
    cache={key,model,catalog,attemptCount:attempts.length,declared:attempts.some(a=>a?.evidenceKind==='student')};
    const previous=controls.subject.value;controls.subject.replaceChildren();
    const option=node('option','Todas las materias');option.value='';controls.subject.appendChild(option);
    [...new Set(model.recommendations.map(r=>r.subjectId))].forEach(id=>{const o=node('option',id);o.value=id;controls.subject.appendChild(o);});
    controls.subject.value=[...controls.subject.options].some(o=>o.value===previous)?previous:'';
    controls.coverage.textContent=`Referencia: ${date(model.referenceDate)}. ${model.excluded} registros normalizados excluidos por el motor. Históricos técnicos, desconocidos o contradictorios quedan fuera del cálculo de dominio.`;
   }
   for(const key of ['subject','priority','order','overdue','all'])controls[key].disabled=false;
   draw();
  }catch{cache=null;lastDraw=null;controls.cards.replaceChildren();controls.status.textContent='No se pudo calcular el plan. Usa Actualizar plan para volver a intentarlo.';}
 }
 const style=node('style');style.textContent=`.noa-study-plan{min-width:0;overflow-wrap:anywhere}.noa-study-plan .noa-plan-help{color:#c4cede;line-height:1.6}.noa-plan-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px;margin:16px 0;align-items:end}.noa-plan-filters .noa-plan-field,.noa-plan-filters label{display:flex;flex-direction:column;gap:8px;min-width:0}.noa-plan-filters select{width:100%;min-width:0}.noa-plan-filters input[type=checkbox]{width:24px;height:24px}.noa-plan-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:16px}.noa-plan-item{background:#101d30;border:1px solid #42506a;border-left:5px solid var(--plan-color);border-radius:12px;padding:16px;min-width:0;line-height:1.6}.noa-plan-reforzar{--plan-color:#ff9eaa}.noa-plan-practicar{--plan-color:#ffd58a}.noa-plan-repasar{--plan-color:#70ded0}.noa-plan-evaluar{--plan-color:#b6caff}.noa-plan-badge{color:var(--plan-color);font-weight:700}.noa-plan-subject{color:#c4cede}.noa-study-plan h3{font-size:1.15rem}.noa-study-plan summary{padding:12px 0;cursor:pointer;font-weight:600}.noa-study-plan details[open]{max-height:420px;overflow:auto}.noa-study-plan :is(select,button,input,summary):focus-visible{outline:3px solid #70ded0;outline-offset:3px}.noa-plan-status{line-height:1.6}`;document.head.appendChild(style);
 const previous=window.renderExamStats;
 window.renderExamStats=function(...args){const result=previous.apply(this,args);update();return result;};
 window.NOA_STUDY_RECOMMENDATIONS_UI_V27=Object.freeze({refresh:update,state:()=>({ready:!!cache,recommendations:cache?.model.recommendations.length||0,referenceDate:cache?.model.referenceDate||null})});
 function init(){if(initialized)return;initialized=true;update();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
