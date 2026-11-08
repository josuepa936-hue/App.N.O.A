/* v27.3A read-only history view. */
(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=v=>Number.isFinite(v)?String(Number(v.toFixed(4))):'No calculable';
 const percent=v=>Number.isFinite(v)?num(v)+'%':'No calculable';
 const timingLabel=t=>t.state!=='known'?'Configuración temporal no verificable':t.mode==='untimed'?'Sin límite de tiempo':`Límite permitido: ${num(t.durationMs/60000)} min`;
 let ready=false;
 function render(){
  if(!ready)return;
  const host=document.getElementById('examStats');if(!host)return;
  host.querySelector(':scope > .noa-learning-progress')?.remove();
  const model=NOA_LEARNING_PROGRESS_V27.build(db.attempts,{catalog:NOA_ACADEMIC_RESULTS_V27.catalog()});
  const panel=document.createElement('section');panel.className='noa-learning-progress card';panel.setAttribute('aria-label','Evolución descriptiva de simulacros');
  panel.innerHTML='<h3>Evolución del rendimiento</h3><p class="small">'+esc(model.sampleStatus)+'</p><p class="small">Se comparan solo exámenes completos con igual cantidad y distribución registrada de materias, subtemas, formatos, dificultad estimada, fuentes y límite temporal verificable. No se asume equivalencia oficial ni se mide dominio.</p>';
  const chart=document.createElement('div');chart.setAttribute('role','img');chart.setAttribute('aria-label','Gráfica de porcentajes completos por fecha; cada barra corresponde a una muestra independiente');chart.className='noa-progress-chart';
  const points=model.rows.filter(r=>r.date&&r.kind!=='technical_test'&&r.report.complete&&r.report.stats.percent!==null);
  for(const row of points){const bar=document.createElement('div');bar.innerHTML=`<span>${esc(row.date)} · ${percent(row.report.stats.percent)} · ${row.report.stats.total} reactivos</span><progress max="100" value="${row.report.stats.percent}" aria-label="${esc(row.date)}: ${percent(row.report.stats.percent)}"></progress>`;chart.appendChild(bar);}
  if(!points.length)chart.textContent='Sin resultados completos y fechados para graficar.';
  panel.appendChild(chart);
  const table=document.createElement('div');table.className='noa-progress-history';
  for(const row of model.rows){const item=document.createElement('p');item.className='small';item.textContent=`${row.date||'Fecha no verificable'} · ${percent(row.report.stats.percent)} · ${num(row.report.stats.credit)}/${row.report.stats.maxCredit} créditos · respondidos ${row.report.stats.answered}/${row.report.stats.total}; omitidos ${row.report.stats.omitted} · créditos verificables ${row.coverage.verified}/${row.coverage.total}; clasificación ${row.coverage.classified}/${row.coverage.total} · ${timingLabel(row.conditions.timing)} · ${row.warning} ${row.reasons.join('. ')}`;table.appendChild(item);}
  if(!model.rows.length)table.textContent='Aún no hay intentos guardados.';panel.appendChild(table);
  const controls=document.createElement('div'),comparison=document.createElement('div');comparison.setAttribute('role','status');comparison.setAttribute('aria-live','polite');
  const select=label=>{const wrap=document.createElement('label'),input=document.createElement('select');wrap.textContent=label;const blank=document.createElement('option');blank.value='';blank.textContent='Selecciona un intento';input.appendChild(blank);model.rows.forEach((r,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${r.date||'Sin fecha'} · ${r.id||'Sin ID verificable'} · ${r.report.stats.total} reactivos`;input.appendChild(option);});wrap.appendChild(input);controls.appendChild(wrap);return input;};
  const a=select('Intento anterior '),b=select('Intento posterior ');
  function detail(row){return row?`<h4>Intento seleccionado: ${esc(row.date||'Sin fecha verificable')}</h4><p class="small">${esc(row.warning)} ${timingLabel(row.conditions.timing)}.</p>${row.report.sections.map(section=>`<h5>${esc(section.label)} · ${percent(section.stats.percent)} (${num(section.stats.credit)}/${section.stats.maxCredit} créditos)</h5>${section.children.map(subject=>`<p>${esc(subject.label)}: ${percent(subject.stats.percent)} · ${num(subject.stats.credit)}/${subject.stats.maxCredit} créditos</p>`).join('')}`).join('')}`:'';}
  function update(){const result=NOA_LEARNING_PROGRESS_V27.compare(model.rows[a.value===''?-1:Number(a.value)],model.rows[b.value===''?-1:Number(b.value)]);comparison.innerHTML=result.comparable?`<p><strong>${esc(result.change)}</strong>: ${num(result.delta)} puntos porcentuales.</p><p class="small">${esc(result.warning)} ${result.domainEvidence?'Ambos intentos declarados del estudiante.':'Sin evidencia verificada de dominio.'}</p><h4>Por sección</h4>${result.sections.map(s=>`<p>${esc(s.label)}: ${percent(s.before)} → ${percent(s.after)} (${num(s.delta)} pp; ${s.total} reactivos)</p>`).join('')}<h4>Por materia</h4>${result.subjects.map(s=>`<p>${esc(s.label)}: ${percent(s.before)} → ${percent(s.after)} (${num(s.delta)} pp; ${s.total} reactivos)</p>`).join('')}`:`<p>No comparables: ${esc(result.reasons.join('. '))}.</p>`;comparison.innerHTML=detail(model.rows[b.value!==''?Number(b.value):a.value!==''?Number(a.value):-1])+comparison.innerHTML;}
  a.addEventListener('change',update);b.addEventListener('change',update);panel.appendChild(controls);panel.appendChild(comparison);update();host.appendChild(panel);return model;
 }
 const style=document.createElement('style');style.textContent='.noa-learning-progress{margin-top:16px;overflow-wrap:anywhere;min-width:0}.noa-learning-progress .small{color:#c4cede;line-height:1.6}.noa-learning-progress label{display:block;margin:12px 0}.noa-learning-progress select{width:100%;min-width:0;max-width:100%}.noa-learning-progress progress{width:100%;accent-color:#51d6bb}.noa-learning-progress select:focus-visible{outline:3px solid #51d6bb}.noa-progress-history{max-height:260px;overflow:auto}.noa-progress-chart{max-height:300px;overflow:auto}';document.head.appendChild(style);
 const previous=window.renderExamStats;window.renderExamStats=function(...args){const result=previous.apply(this,args);render();return result;};
 window.NOA_LEARNING_PROGRESS_UI_V27=Object.freeze({render});
 function init(){if(ready)return;ready=true;render();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
