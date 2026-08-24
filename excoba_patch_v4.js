/* =========================================================
   NOA EXCOBA PATCH v4
   Corrige Primaria/Secundaria para FLASHCARDS y CUESTIONARIOS.
   Debe cargarse DESPUÉS de excoba_master.js y excoba_patch_v3.js.
   ========================================================= */

(() => {
  const MASTER_ID='uaq-excoba-2026-2-medicina';
  const MASTER_SOURCE='Guía temática EXCOBA UAQ 2026-2 - PDF oficial';

  const SUBJECTS = [
    {label:'Primaria · Español', value:'EXCOBA Primaria · Español', prefixes:['1.1.']},
    {label:'Primaria · Matemáticas', value:'EXCOBA Primaria · Matemáticas', prefixes:['1.2.']},
    {label:'Secundaria · Español', value:'EXCOBA Secundaria · Español', prefixes:['2.1.']},
    {label:'Secundaria · Matemáticas', value:'EXCOBA Secundaria · Matemáticas', prefixes:['2.2.']},
    {label:'Secundaria · Ciencias naturales', value:'EXCOBA Secundaria · Ciencias naturales', prefixes:['2.3.']},
    {label:'Secundaria · Ciencias sociales', value:'EXCOBA Secundaria · Ciencias sociales', prefixes:['2.4.']},
    {label:'Medicina · Matemáticas para estadística', value:'EXCOBA Medicina · Matemáticas para estadística', prefixes:['3.1.']},
    {label:'Medicina · Biología', value:'EXCOBA Medicina · Biología', prefixes:['3.4.']},
    {label:'Medicina · Química', value:'EXCOBA Medicina · Química', prefixes:['3.6.']}
  ];

  function norm(v){
    return String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,' ')
      .trim();
  }

  function master(){
    return window.NOA_EXCOBA_MASTER?.get?.() || db?.masterSyllabus || null;
  }

  function subjectDef(target){
    const x=norm(target);
    return SUBJECTS.find(s=>
      norm(s.value)===x ||
      norm(s.label)===x ||
      (
        x.includes('primaria') &&
        x.includes('espanol') &&
        s.value==='EXCOBA Primaria · Español'
      ) ||
      (
        x.includes('primaria') &&
        x.includes('matemat') &&
        s.value==='EXCOBA Primaria · Matemáticas'
      ) ||
      (
        x.includes('secundaria') &&
        x.includes('espanol') &&
        s.value==='EXCOBA Secundaria · Español'
      ) ||
      (
        x.includes('secundaria') &&
        x.includes('matemat') &&
        s.value==='EXCOBA Secundaria · Matemáticas'
      ) ||
      (
        (x.includes('ciencias naturales') || x==='naturales') &&
        s.value==='EXCOBA Secundaria · Ciencias naturales'
      ) ||
      (
        (x.includes('ciencias sociales') || x==='sociales') &&
        s.value==='EXCOBA Secundaria · Ciencias sociales'
      ) ||
      (
        x.includes('estadistica') &&
        s.value==='EXCOBA Medicina · Matemáticas para estadística'
      ) ||
      (
        x.includes('biologia') &&
        s.value==='EXCOBA Medicina · Biología'
      ) ||
      (
        x.includes('quimica') &&
        s.value==='EXCOBA Medicina · Química'
      )
    ) || null;
  }

  function officialItems(target){
    const m=master();
    const def=subjectDef(target);
    if(!m?.items?.length || !def)return [];

    // Primero por nombre guardado.
    let items=m.items.filter(i=>i.subject===def.value);

    // Fallback robusto por código oficial.
    if(!items.length){
      items=m.items.filter(i=>
        def.prefixes.some(prefix=>
          String(i.code || '').startsWith(prefix)
        )
      );
    }

    return items;
  }

  function ensureTopicFor(item,def){
    let subject=db.subjects.find(s=>s.name===def.value);
    if(!subject){
      subject={
        id:uid(),
        name:def.value,
        source:MASTER_SOURCE,
        group:def.value.includes('Medicina')?'specialty':'basic',
        masterSyllabus:true
      };
      db.subjects.push(subject);
    }

    let topic=db.topics.find(t=>t.syllabusCode===item.code);

    if(!topic){
      topic={
        id:uid(),
        subjectId:subject.id,
        name:item.title || item.focus || item.code,
        focus:item.focus || item.title || '',
        syllabusCode:item.code,
        sourcePage:item.page,
        masterSyllabus:true,
        attempts:0,
        correct:0,
        lastSeen:null
      };
      db.topics.push(topic);
    }

    return topic;
  }

  function parseArray(raw){
    let txt=String(raw ?? '')
      .replace(/```json/gi,'')
      .replace(/```/g,'')
      .trim();

    try{
      const j=JSON.parse(txt);
      if(Array.isArray(j))return j;
      if(Array.isArray(j?.items))return j.items;
      if(Array.isArray(j?.flashcards))return j.flashcards;
      if(Array.isArray(j?.questions))return j.questions;
    }catch{}

    const a=txt.indexOf('[');
    const b=txt.lastIndexOf(']');
    if(a>=0 && b>a){
      const j=JSON.parse(txt.slice(a,b+1));
      if(Array.isArray(j))return j;
    }

    throw new Error('La IA no devolvió JSON válido');
  }

  function resolveCode(row,items){
    const candidate=String(
      row.syllabus_code ??
      row.syllabusCode ??
      row.code ??
      ''
    ).trim().replace(/\.$/,'');

    if(candidate){
      const exact=items.find(i=>
        String(i.code).trim().replace(/\.$/,'')===candidate
      );
      if(exact)return exact;
    }

    const hint=norm([
      row.topic,row.tema,row.front,row.question,row.pregunta
    ].filter(Boolean).join(' '));

    if(hint){
      let best=null,bestScore=0;
      for(const item of items){
        const words=norm(`${item.title} ${item.focus}`)
          .split(' ')
          .filter(w=>w.length>4);
        const score=words.reduce((a,w)=>a+(hint.includes(w)?1:0),0);
        if(score>bestScore){
          bestScore=score;
          best=item;
        }
      }
      if(bestScore>0)return best;
    }

    return null;
  }

  async function createFlashcardsV4(target,count=15){
    const def=subjectDef(target);
    if(!def)return toast('Materia no reconocida');

    const items=officialItems(def.value);

    if(!items.length){
      return toast(
        'No encontré los puntos de '+def.label+
        ' en el temario importado. Pulsa “Reimportar/Importar PDF oficial” para reconstruir el índice.'
      );
    }

    if(db.settings?.aiProvider==='offline'){
      return toast('Activa la conexión de IA para generar flashcards');
    }

    const button=document.getElementById('excobaMakeFlashBtn');
    const status=document.getElementById('excobaMaterialStatus');
    const made=[];
    const seen=new Set(db.cards.map(c=>norm(c.front)));
    let attempt=0;

    try{
      if(button)button.disabled=true;

      while(made.length<count && attempt<Math.max(4,Math.ceil(count/4)*2)){
        const needed=Math.min(5,count-made.length);
        if(status)status.textContent=
          `NOA está creando flashcards de ${def.label} · ${made.length}/${count}…`;

        const start=(attempt*8)%items.length;
        const slice=[];
        for(let i=0;i<Math.min(12,items.length);i++){
          slice.push(items[(start+i)%items.length]);
        }

        const scope=slice.map(i=>
          `- ${i.code} | ${i.title}: ${i.focus}`
        ).join('\n');

        const raw=await callAI([
          {
            role:'system',
            content:
`Eres el motor de flashcards de NOA para EXCOBA UAQ.
Devuelve SOLO JSON válido.
El listado de códigos delimita el alcance oficial.
Crea tarjetas concretas de recuperación activa y aplicación.
No introduzcas temas externos.`
          },
          {
            role:'user',
            content:
`MATERIA: ${def.value}

Crea ${needed} flashcards.

FORMATO:
[
  {
    "front":"pregunta concreta",
    "back":"respuesta breve, clara y suficiente",
    "syllabus_code":"código exacto"
  }
]

PUNTOS OFICIALES PERMITIDOS:
${scope}`
          }
        ],{temperature:0.3});

        const rows=parseArray(raw);

        for(const row of rows){
          const front=String(row.front ?? row.question ?? '').trim();
          const back=String(row.back ?? row.answer ?? row.respuesta ?? '').trim();
          const item=resolveCode(row,slice);

          if(!front || !back || !item)continue;

          const key=norm(front);
          if(!key || seen.has(key))continue;

          seen.add(key);
          const topic=ensureTopicFor(item,def);

          made.push({
            id:uid(),
            topicId:topic.id,
            front,
            back,
            ease:2.5,
            interval:0,
            reps:0,
            due:new Date().toISOString(),
            source:`${MASTER_SOURCE} · ${item.code} · PDF pág. ${item.page}`,
            syllabusCode:item.code,
            sourcePage:item.page,
            masterSyllabus:MASTER_ID
          });

          if(made.length>=count)break;
        }

        attempt++;
      }

      if(!made.length)throw new Error('No se generaron flashcards válidas');

      db.cards.push(...made);
      act(`${made.length} flashcards EXCOBA creadas de ${def.label}`);
      save();

      if(status)status.textContent=`✓ ${made.length} flashcards creadas`;
      toast(`${made.length} flashcards creadas`);
      page('flashcards','Flashcards');

    }catch(err){
      console.error('Flashcards v4',err);
      if(status)status.textContent='Error: '+err.message;
      toast('No pude crear flashcards: '+err.message);
    }finally{
      if(button)button.disabled=false;
    }
  }

  async function createQuizV4(target,count=10){
    const def=subjectDef(target);
    if(!def)return toast('Materia no reconocida');

    const items=officialItems(def.value);

    if(!items.length){
      return toast(
        'No encontré los puntos de '+def.label+
        ' en el temario importado. Pulsa “Reimportar/Importar PDF oficial” para reconstruir el índice.'
      );
    }

    // Si v3 está disponible, su motor ya es válido para cuestionarios.
    if(window.NOA_EXCOBA_V3?.createQuiz){
      return window.NOA_EXCOBA_V3.createQuiz(def.value,count);
    }

    if(window.NOA_EXCOBA_MASTER?.createQuiz){
      return window.NOA_EXCOBA_MASTER.createQuiz(def.value,count);
    }

    toast('No encuentro el motor de cuestionarios v3');
  }

  function rebuildSelect(){
    const select=document.getElementById('excobaStudySubject');
    if(!select)return;

    select.innerHTML=`
      <optgroup label="Educación primaria">
        <option value="EXCOBA Primaria · Español">Español</option>
        <option value="EXCOBA Primaria · Matemáticas">Matemáticas</option>
      </optgroup>
      <optgroup label="Educación secundaria">
        <option value="EXCOBA Secundaria · Español">Español</option>
        <option value="EXCOBA Secundaria · Matemáticas">Matemáticas</option>
        <option value="EXCOBA Secundaria · Ciencias naturales">Ciencias naturales</option>
        <option value="EXCOBA Secundaria · Ciencias sociales">Ciencias sociales</option>
      </optgroup>
      <optgroup label="Especialidad · Medicina">
        <option value="EXCOBA Medicina · Matemáticas para estadística">Matemáticas para estadística</option>
        <option value="EXCOBA Medicina · Biología">Biología</option>
        <option value="EXCOBA Medicina · Química">Química</option>
      </optgroup>
    `;
  }

  function replaceButtons(){
    const oldFlash=document.getElementById('excobaMakeFlashBtn');
    if(oldFlash && oldFlash.dataset.v4!=='1'){
      const fresh=oldFlash.cloneNode(true);
      fresh.dataset.v4='1';
      oldFlash.replaceWith(fresh);
      fresh.onclick=()=>{
        const target=document.getElementById('excobaStudySubject')?.value;
        const count=parseInt(document.getElementById('excobaFlashCount')?.value)||15;
        createFlashcardsV4(target,count);
      };
    }

    const oldQuiz=document.getElementById('excobaMakeQuizBtn');
    if(oldQuiz && oldQuiz.dataset.v4!=='1'){
      const fresh=oldQuiz.cloneNode(true);
      fresh.dataset.v4='1';
      oldQuiz.replaceWith(fresh);
      fresh.onclick=()=>{
        const target=document.getElementById('excobaStudySubject')?.value;
        const count=parseInt(document.getElementById('excobaQuizCount')?.value)||10;
        createQuizV4(target,count);
      };
    }
  }

  function addDiagnostic(){
    const box=document.getElementById('excobaStudyTools');
    if(!box || document.getElementById('excobaIndexDiagnostic'))return;

    const m=master();
    const counts=SUBJECTS.map(def=>({
      label:def.label,
      n:officialItems(def.value).length
    }));

    const d=document.createElement('div');
    d.id='excobaIndexDiagnostic';
    d.className='small';
    d.style.marginTop='10px';
    d.style.color='var(--muted)';
    d.innerHTML=
      '<b>Índice detectado:</b> '+
      counts.map(x=>`${x.label}: ${x.n}`).join(' · ');

    box.appendChild(d);
  }

  function init(){
    if(!window.NOA_EXCOBA_MASTER){
      setTimeout(init,250);
      return;
    }

    rebuildSelect();
    replaceButtons();
    addDiagnostic();

    window.NOA_EXCOBA_V4={
      subjects:SUBJECTS,
      itemsFor:officialItems,
      createFlashcards:createFlashcardsV4,
      createQuiz:createQuizV4
    };

    console.log('NOA EXCOBA v4 activo');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    init();
  }
})();
