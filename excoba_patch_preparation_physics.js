/* Complemento de preparación: conserva el catálogo oficial y añade una referencia alternativa. */
(() => {
  const PHYSICS={value:'EXCOBA Especialidad · Física',label:'Especialidad · Física (referencia alternativa)',prefixes:['3.3.']};
  const REFERENCE={id:'uaq-excoba-2027-1-physics-reference',kind:'alternative',confirmedForMedicine:false,
    title:'Instructivo EXCOBA UAQ Licenciatura 2027-1 · sección 3.3 Física',
    url:'https://dsa.uaq.mx/docs/ingreso_licenciatura/2027-1/Instructivo_EXCOBA_UAQ-Licenciatura.pdf',
    acquisition:'user-transcription',note:'Referencia temática alternativa; no confirmada para Medicina UAQ. Contenido incorporado desde una transcripción de la sección de Física; páginas no proporcionadas.'};
  const ROWS=[
    ['3.3.1.1','Reconoces el lenguaje técnico básico de la física','Método Científico, magnitudes físicas y su medición, notación científica y vectores.'],
    ['3.3.1.2','Identificas diferencias entre distintos tipos de movimiento','Movimiento en una y dos dimensiones.'],
    ['3.3.1.3','Comprendes el movimiento de los cuerpos a partir de las leyes de dinámica de Newton','Aplicas las leyes de la dinámica, ley de la gravitación universal y leyes de Kepler.'],
    ['3.3.1.4','Relacionas el trabajo con la energía','Trabajo. Energía cinética y energía potencial. Ley de la conservación de la energía mecánica. Potencia.'],
    ['3.3.2.1','Explicas el comportamiento de los fluidos','Hidráulica. Hidrostática. Hidrodinámica.'],
    ['3.3.2.2','Identificas diferencias entre calor y temperatura','El calor y la temperatura. La dilatación térmica. El calor específico. Procesos termodinámicos.'],
    ['3.3.2.3','Comprendes las leyes de la electricidad','Electricidad. Electrostática. Electrodinámica.'],
    ['3.3.2.4','Relacionas la electricidad con el magnetismo','Magnetismo. Electromagnetismo.']
  ];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const items=()=>ROWS.map(([code,title,focus])=>({code,title,focus,subject:PHYSICS.value,group:'specialty',page:null,reference:clone(REFERENCE)}));
  const isPhysics=subject=>subject===PHYSICS.value;
  const questionSubject=q=>q?.subject??q?.blueprintSlot?.subject;
  function trainingSubjects(){return [...(window.NOA_EXCOBA_V4?.subjects||[]),clone(PHYSICS)];}
  function examSubjects(profile='A'){
    if(!['A','B'].includes(profile))throw new Error('Perfil de preparación inválido.');
    return (window.NOA_EXCOBA_V4?.subjects||[]).map(subject=>profile==='B'&&subject.prefixes?.includes('3.1.')?clone(PHYSICS):subject);
  }
  const selected=()=>document.getElementById('noaPreparationProfile')?.value||'A';
  function decorateSource(subject,resolved){
    if(!isPhysics(subject))return resolved;
    const source={...resolved.source,reference:clone(REFERENCE)};
    if(resolved.actualType==='course')return {...resolved,source};
    return {...resolved,actualType:'extended',fallbackFrom:resolved.fallbackFrom||(resolved.actualType==='official'?'official':null),
      fallbackReason:'Referencia alternativa de Física; no confirmada para Medicina UAQ.',
      source:{...source,kind:'extended',anchorCode:source.anchorCode||source.code,anchorTitle:source.anchorTitle||source.title,anchorFocus:source.anchorFocus||source.focus}};
  }
  function sourceContext(slot){
    if(!isPhysics(slot?.subject))return null;
    return `REFERENCIA TEMÁTICA ALTERNATIVA DE FÍSICA\n${REFERENCE.title}\n${REFERENCE.url}\n${REFERENCE.note}\nNo denomines oficial ni confirmado para Medicina UAQ este alcance.\nFuente efectiva: ${slot.sourceType==='course'?'material del curso disponible':'referencia alternativa de bachillerato'}.\nDatos de la fuente y del subtema:\n${JSON.stringify(slot.source)}`;
  }
  // Add catalog entries only on an explicit activation or an accepted new exam.
  // Never repair a recovered checkpoint, mutate old topics, or create questions.
  function ensurePhysicsTopics(){
    const existing=db.subjects.find(s=>s.name===PHYSICS.value),subject=existing||{id:uid(),name:PHYSICS.value,group:'specialty',source:REFERENCE.id};
    const additions=[];
    for(const item of items()){
      const matches=db.topics.filter(t=>t.syllabusCode===item.code);
      if(matches.some(t=>t.subjectId!==subject.id))throw new Error('Código de Física ocupado por otra materia: '+item.code);
      if(!matches.length)additions.push({id:uid(),subjectId:subject.id,name:item.title,focus:item.focus,syllabusCode:item.code,source:REFERENCE.id,sourcePage:null,attempts:0,correct:0});
    }
    if(!existing)db.subjects.push(subject);db.topics.push(...additions);
    return subject;
  }
  function ensureTopicsForQuestions(questions){
    if(window.NOA_EXAM_RECOVERY?.state?.().recovering)return;
    const physics=questions.filter(q=>isPhysics(q?.subject)||isPhysics(q?.blueprintSlot?.subject)),known=new Set(items().map(item=>item.code));
    for(const q of physics){if(q.subject&&q.blueprintSlot?.subject&&q.subject!==q.blueprintSlot.subject)throw new Error('Materia de Física contradictoria.');const codes=[q.syllabusCode,...(q.syllabusCodes||[]),...(q.blueprintSlot?.syllabusCodes||[])].filter(Boolean);if(!codes.length||codes.some(code=>!known.has(code)))throw new Error('Física requiere subtemas verificables del catálogo alternativo.');}
    if(physics.length)ensurePhysicsTopics();
  }
  function topicIdForQuestion(question){
    if(!isPhysics(questionSubject(question)))return null;
    const code=question.syllabusCode||question.syllabusCodes?.[0]||question.blueprintSlot?.syllabusCodes?.[0];
    return db.topics.find(t=>t.syllabusCode===code&&db.subjects.find(s=>s.id===t.subjectId)?.name===PHYSICS.value)?.id||'';
  }
  function practiceAvailable(){
    if(window.NOA_GENERATOR_UI?.state?.().busy||window.NOA_EXAM_UI_V25?.state?.().busy)return;
    const count=Number(document.getElementById('noaGeneratorCount').value),subject=db.subjects.find(s=>s.name===PHYSICS.value);
    const pool=uniqueLocalExcobaQuestions(db.questions,[PHYSICS]).filter(q=>db.topics.find(t=>t.id===q.topicId)?.subjectId===subject?.id);
    if(!pool.length)return toast('No hay reactivos locales válidos de Física. Puedes generarlos con IA o añadir preguntas a los subtemas activados.');
    if(examQueue.length&&examIndex<examQueue.length&&!confirm('¿Reemplazar el examen activo por una práctica parcial de Física?'))return;
    beginExamQueue(pool.slice(0,count),'Práctica de Física',{version:1,mode:'manual',requestedCount:count,completion:'partial',allowShortfall:true});
  }
  function refresh(){
    const selection=document.getElementById('noaPreparationProfile'),notice=document.getElementById('noaPreparationNote');
    if(selection){selection.disabled=!!(window.NOA_EXAM_UI_V25?.state?.().busy||window.NOA_GENERATOR_UI?.state?.().busy);notice.textContent=selection.value==='B'?'Perfil B: Biología, Química y Física. Física usa una referencia alternativa; esta composición no está confirmada para Medicina UAQ.':'Perfil A: Biología, Química y Matemáticas para Estadística. Se conserva el esquema existente.';}
    const physics=isPhysics(document.getElementById('noaGeneratorSubject')?.value);
    const info=document.getElementById('noaPhysicsGenerationNotice'),button=document.getElementById('noaPhysicsPractice');
    if(info)info.hidden=!physics;if(button){button.hidden=!physics;button.disabled=!!(window.NOA_GENERATOR_UI?.state?.().busy||window.NOA_EXAM_UI_V25?.state?.().busy);}
  }
  function setupUI(){
    const card=document.getElementById('noaExam45Card');
    if(card&&!document.getElementById('noaPreparationProfile')){
      const wrap=document.createElement('div');wrap.className='field';wrap.style.minWidth='0';
      wrap.innerHTML='<label for="noaPreparationProfile">Composición de especialidad para los próximos simulacros de 45/180</label><select id="noaPreparationProfile"><option value="A">Perfil A · Biología, Química y Estadística</option><option value="B">Perfil B · Biología, Química y Física</option></select><p class="small" id="noaPreparationNote"></p>';
      Object.assign(wrap.querySelector('select').style,{minWidth:'0',width:'100%',maxWidth:'100%'});
      card.querySelector('h2').after(wrap);wrap.querySelector('select').addEventListener('change',()=>{refresh();window.NOA_EXAM_UI_V25?.refresh();});
    }
    const generator=document.getElementById('noaGeneratorCard');
    if(generator&&!document.getElementById('noaPhysicsPractice')){
      const p=document.createElement('p');p.id='noaPhysicsGenerationNotice';p.className='small';p.textContent=REFERENCE.note;generator.append(p);
      const button=document.createElement('button');button.id='noaPhysicsPractice';button.type='button';button.className='btn';button.textContent='Practicar Física disponible (parcial)';button.addEventListener('click',practiceAvailable);generator.append(button);
      document.getElementById('noaGeneratorSubject').addEventListener('change',refresh);
    }
    if(!document.getElementById('noaPhysicsCatalog')){
      const card=document.createElement('div');card.id='noaPhysicsCatalog';card.className='card';
      const heading=document.createElement('h2');heading.textContent='Física de bachillerato · referencia alternativa';card.append(heading);
      const note=document.createElement('p');note.className='small';note.textContent=REFERENCE.note;card.append(note);
      const link=document.createElement('a');link.href=REFERENCE.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=REFERENCE.title;card.append(link);
      const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Ver los ocho subtemas de Física';details.append(summary);
      for(const item of items()){const p=document.createElement('p');p.textContent=item.code+' · '+item.title+'. '+item.focus;details.append(p);}card.append(details);
      const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Activar Física en Materias';button.addEventListener('click',()=>{try{ensurePhysicsTopics();save();toast('Física activada con ocho subtemas. No se añadieron preguntas.');}catch(e){toast(e.message);}});card.append(button);
      document.getElementById('notes').prepend(card);
    }
    refresh();window.NOA_GENERATOR_UI?.refresh();window.NOA_EXAM_UI_V25?.refresh();
  }
  function init(){
    const syllabus=window.NOA_EXCOBA_V4,original=syllabus.itemsFor;
    syllabus.itemsFor=subject=>isPhysics(subject)?items():original(subject);
    setTimeout(setupUI,0);
  }
  window.NOA_EXCOBA_PREPARATION=Object.freeze({physics:()=>clone(PHYSICS),reference:()=>clone(REFERENCE),items,trainingSubjects,examSubjects,selected,decorateSource,sourceContext,ensurePhysicsTopics,ensureTopicsForQuestions,topicIdForQuestion,refresh});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
