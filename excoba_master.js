
/* =========================================================
   NOA - TEMARIO MAESTRO EXCOBA UAQ 2026-2
   Importa el PDF oficial en el navegador y usa su estructura
   como alcance maestro para Medicina General (QRO).
   ========================================================= */

(() => {
  const MASTER_ID = 'uaq-excoba-2026-2-medicina';
  const MASTER_SOURCE = 'Guía temática EXCOBA UAQ 2026-2 - PDF oficial';
  const MASTER_CAREER = 'Medicina General (QRO)';
  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const SUBJECTS = [
    {prefix:'1.1.', name:'EXCOBA Primaria · Español', group:'basic'},
    {prefix:'1.2.', name:'EXCOBA Primaria · Matemáticas', group:'basic'},
    {prefix:'2.1.', name:'EXCOBA Secundaria · Español', group:'basic'},
    {prefix:'2.2.', name:'EXCOBA Secundaria · Matemáticas', group:'basic'},
    {prefix:'2.3.', name:'EXCOBA Secundaria · Ciencias naturales', group:'basic'},
    {prefix:'2.4.', name:'EXCOBA Secundaria · Ciencias sociales', group:'basic'},
    {prefix:'3.1.', name:'EXCOBA Medicina · Matemáticas para estadística', group:'specialty'},
    {prefix:'3.4.', name:'EXCOBA Medicina · Biología', group:'specialty'},
    {prefix:'3.6.', name:'EXCOBA Medicina · Química', group:'specialty'}
  ];

  function norm(v){
    return String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,' ')
      .trim();
  }

  function ensureMasterStore(){
    if(!db.masterSyllabus) db.masterSyllabus = null;
    db.settings = db.settings || {};
    if(typeof db.settings.strictSyllabus !== 'boolean') db.settings.strictSyllabus = true;
  }

  function getMaster(){
    ensureMasterStore();
    return db.masterSyllabus && db.masterSyllabus.id === MASTER_ID
      ? db.masterSyllabus
      : null;
  }

  function subjectDefForCode(code){
    return SUBJECTS.find(s => code.startsWith(s.prefix)) || null;
  }

  async function loadPdfJs(){
    if(window.pdfjsLib){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return window.pdfjsLib;
    }
    await new Promise((resolve,reject)=>{
      const old = document.querySelector('script[data-noa-pdfjs]');
      if(old){
        old.addEventListener('load',resolve,{once:true});
        old.addEventListener('error',reject,{once:true});
        return;
      }
      const s=document.createElement('script');
      s.src=PDFJS_URL;
      s.async=true;
      s.dataset.noaPdfjs='1';
      s.onload=resolve;
      s.onerror=()=>reject(new Error('No pude cargar PDF.js. Revisa tu conexión.'));
      document.head.appendChild(s);
    });
    if(!window.pdfjsLib) throw new Error('PDF.js no quedó disponible');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return window.pdfjsLib;
  }

  function linesFromTextContent(tc){
    const rows=[];
    for(const item of tc.items || []){
      if(!item.str || !item.str.trim()) continue;
      const x = Number(item.transform?.[4] || 0);
      const y = Number(item.transform?.[5] || 0);
      let row=rows.find(r=>Math.abs(r.y-y)<1.8);
      if(!row){
        row={y,parts:[]};
        rows.push(row);
      }
      row.parts.push({x,text:item.str.trim()});
    }
    rows.sort((a,b)=>b.y-a.y);
    return rows
      .map(r=>r.parts.sort((a,b)=>a.x-b.x).map(p=>p.text).join(' ').replace(/\s+/g,' ').trim())
      .filter(Boolean);
  }

  async function extractPdfPages(file,onProgress){
    const pdfjs = await loadPdfJs();
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({data}).promise;
    const pages=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const tc=await page.getTextContent();
      pages.push({page:i,lines:linesFromTextContent(tc)});
      if(onProgress) onProgress(i,pdf.numPages);
    }
    return pages;
  }

  function validateOfficialPdf(pages){
    const all=norm(pages.map(p=>p.lines.join(' ')).join(' '));
    const required=[
      'examen de competencias basicas',
      'guia tematica del excoba',
      'universidad autonoma de queretaro',
      'medicina general',
      'matematicas para estadistica',
      'biologia',
      'quimica'
    ];
    const missing=required.filter(x=>!all.includes(x));
    if(missing.length){
      throw new Error('El PDF no coincide con el instructivo EXCOBA UAQ 2026-2 esperado.');
    }
  }

  function parseNumberedItems(pages){
    const raw=[];
    let current=null;

    const flush=()=>{
      if(!current) return;
      current.text=current.text.replace(/\s+/g,' ').trim();
      raw.push(current);
      current=null;
    };

    for(const p of pages){
      // La guia temática está en las páginas PDF 6-18.
      if(p.page < 6 || p.page > 18) continue;

      for(const sourceLine of p.lines){
        const line=sourceLine.replace(/\s+/g,' ').trim();
        if(!line || /^P\s*á\s*g\s*i\s*n\s*a/i.test(line)) continue;

        const m=line.match(/^(\d+(?:\.\d+){0,4})\.\s+(.+)$/);
        if(m && ['1','2','3'].includes(m[1].split('.')[0])){
          flush();
          current={code:m[1],text:m[2].trim(),page:p.page};
          continue;
        }

        if(current &&
           !/^Guía temática/i.test(line) &&
           !/^Esta guía temática/i.test(line) &&
           !/^La guía contiene/i.test(line) &&
           !/^Competencias básicas de las asignaturas/i.test(line)){
          current.text += ' ' + line;
        }
      }
    }
    flush();

    const unique=[];
    const seen=new Set();
    for(const item of raw){
      if(seen.has(item.code)) continue;
      seen.add(item.code);
      unique.push(item);
    }

    const codes=unique.map(x=>x.code);
    const leaves=unique.filter(x=>!codes.some(c=>c.startsWith(x.code+'.')));

    return leaves.map(item=>{
      const def=subjectDefForCode(item.code);
      if(!def) return null;

      const split=item.text.match(/^(.+?)\.\s+(.+)$/);
      const title=(split?.[1] || item.text).trim();
      const focus=(split?.[2] || item.text).trim();

      return {
        code:item.code,
        title,
        focus,
        page:item.page,
        subject:def.name,
        group:def.group
      };
    }).filter(Boolean);
  }

  function syncTopicsToNoa(items){
    for(const sdef of SUBJECTS){
      let s=db.subjects.find(x=>x.name===sdef.name);
      if(!s){
        s={id:uid(),name:sdef.name,source:EXCOBA_UAQ_2026?.source || MASTER_SOURCE,group:sdef.group,masterSyllabus:true};
        db.subjects.push(s);
      }else{
        s.source=EXCOBA_UAQ_2026?.source || MASTER_SOURCE;
        s.group=sdef.group;
        s.masterSyllabus=true;
      }

      for(const item of items.filter(x=>x.subject===sdef.name)){
        let t=db.topics.find(x=>x.syllabusCode===item.code);
        if(!t){
          const nt=norm(item.title);
          t=db.topics.find(x=>x.subjectId===s.id && norm(x.name)===nt);
        }

        if(t){
          t.subjectId=s.id;
          t.name=item.title;
          t.focus=item.focus;
          t.syllabusCode=item.code;
          t.sourcePage=item.page;
          t.masterSyllabus=true;
          if(typeof t.attempts!=='number') t.attempts=0;
          if(typeof t.correct!=='number') t.correct=0;
        }else{
          db.topics.push({
            id:uid(),
            subjectId:s.id,
            name:item.title,
            focus:item.focus,
            syllabusCode:item.code,
            sourcePage:item.page,
            masterSyllabus:true,
            attempts:0,
            correct:0,
            lastSeen:null
          });
        }
      }
    }
  }

  async function importMasterPdf(file){
    if(!file) return;
    if(!/\.pdf$/i.test(file.name)) return toast('Selecciona un archivo PDF');

    ensureMasterStore();
    const status=document.getElementById('excobaMasterStatus');
    const progress=document.getElementById('excobaMasterProgress');
    const importBtn=document.getElementById('excobaMasterImportBtn');

    try{
      if(importBtn) importBtn.disabled=true;
      if(status) status.textContent='Preparando lector PDF…';

      const pages=await extractPdfPages(file,(done,total)=>{
        if(status) status.textContent=`Leyendo PDF: página ${done} de ${total}…`;
        if(progress) progress.style.width=Math.round(done/total*100)+'%';
      });

      validateOfficialPdf(pages);
      if(status) status.textContent='Estructurando temas y subtemas oficiales…';

      const items=parseNumberedItems(pages);
      if(items.length < 80){
        throw new Error('Se extrajeron muy pocos temas; no guardaré un temario incompleto.');
      }

      const bySubject=Object.fromEntries(
        SUBJECTS.map(s=>[s.name,items.filter(x=>x.subject===s.name).length])
      );

      db.masterSyllabus={
        id:MASTER_ID,
        source:MASTER_SOURCE,
        fileName:file.name,
        career:MASTER_CAREER,
        importedAt:new Date().toISOString(),
        pdfPages:pages.length,
        strictScope:true,
        items,
        bySubject
      };
      db.settings.strictSyllabus=true;

      syncTopicsToNoa(items);
      act(`Temario maestro importado: ${items.length} puntos oficiales`);
      save();
      renderMasterUI();

      toast(`Temario maestro listo: ${items.length} puntos oficiales`);
      speak(`Temario oficial procesado. Detecté ${items.length} puntos de estudio para EXCOBA Medicina.`);
    }catch(err){
      console.error('NOA Master PDF:',err);
      if(status) status.textContent='Error: '+err.message;
      toast(err.message);
    }finally{
      if(importBtn) importBtn.disabled=false;
    }
  }

  function masterItemsForTarget(target,limit=30){
    const master=getMaster();
    if(!master?.items?.length) return [];

    const n=norm(target);
    let pool=master.items;

    const exactSubject=[
      ['matematicas para estadistica','EXCOBA Medicina · Matemáticas para estadística'],
      ['estadistica','EXCOBA Medicina · Matemáticas para estadística'],
      ['biologia','EXCOBA Medicina · Biología'],
      ['quimica','EXCOBA Medicina · Química'],
      ['ciencias naturales','EXCOBA Secundaria · Ciencias naturales'],
      ['ciencias sociales','EXCOBA Secundaria · Ciencias sociales']
    ].find(([key])=>n.includes(key));

    if(exactSubject){
      pool=pool.filter(x=>x.subject===exactSubject[1]);
      return pool.slice(0,limit);
    }

    const words=n.split(' ').filter(w=>w.length>3 && !['excoba','medicina','uaq','tema','sobre','para'].includes(w));
    if(!words.length) return pool.slice(0,limit);

    const ranked=pool.map(item=>{
      const hay=norm(`${item.code} ${item.title} ${item.focus} ${item.subject}`);
      const score=words.reduce((a,w)=>a+(hay.includes(w)?1:0),0);
      return {item,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);

    return ranked.slice(0,limit).map(x=>x.item);
  }

  function officialContext(target,limit=30){
    const items=masterItemsForTarget(target,limit);
    if(!items.length) return '';
    return [
      `FUENTE MAESTRA: ${MASTER_SOURCE}`,
      `CARRERA: ${MASTER_CAREER}`,
      'El PDF es un TEMARIO: define el alcance evaluable, no es un libro de texto.',
      'Solo desarrolla contenidos comprendidos en los códigos listados.',
      '',
      ...items.map(x=>`[${x.code} | PDF pág. ${x.page}] ${x.title}: ${x.focus}`)
    ].join('\n');
  }

  function officialCoverage(){
    const master=getMaster();
    if(!master) return [];

    return SUBJECTS.map(sdef=>{
      const items=master.items.filter(x=>x.subject===sdef.name);
      const topics=items.map(i=>db.topics.find(t=>t.syllabusCode===i.code)).filter(Boolean);
      const attempted=topics.filter(t=>(t.attempts||0)>0);
      const masteryPct=attempted.length
        ? Math.round(attempted.reduce((a,t)=>a+mastery(t),0)/attempted.length)
        : 0;
      return {
        name:sdef.name.replace(/^EXCOBA (Primaria|Secundaria|Medicina) · /,''),
        group:sdef.group,
        total:items.length,
        attempted:attempted.length,
        mastery:masteryPct
      };
    });
  }

  function renderMasterUI(){
    ensureMasterStore();
    const status=document.getElementById('excobaMasterStatus');
    const details=document.getElementById('excobaMasterDetails');
    const strict=document.getElementById('excobaStrictScope');
    if(strict) strict.checked=!!db.settings.strictSyllabus;

    const master=getMaster();
    if(!status || !details) return;

    if(!master){
      status.innerHTML='<b>Sin temario maestro</b><div class="small">Importa el instructivo oficial EXCOBA UAQ 2026-2.</div>';
      details.innerHTML='';
      return;
    }

    status.innerHTML=`
      <div class="row" style="justify-content:space-between">
        <div>
          <b>✓ ${esc(master.source)}</b>
          <div class="small">${esc(master.career)} · ${master.items.length} puntos oficiales · ${master.pdfPages} páginas</div>
        </div>
        <span class="badge">FUENTE MAESTRA</span>
      </div>
    `;

    details.innerHTML=officialCoverage().map(x=>`
      <div class="master-subject">
        <div class="row" style="justify-content:space-between;gap:8px">
          <div><b>${esc(x.name)}</b><div class="small">${x.attempted}/${x.total} temas practicados</div></div>
          <span class="badge">${x.mastery}%</span>
        </div>
        <div class="progress" style="margin-top:8px"><div style="width:${x.mastery}%"></div></div>
      </div>
    `).join('');
  }

  function injectMasterStyles(){
    if(document.getElementById('excobaMasterStyles')) return;
    const style=document.createElement('style');
    style.id='excobaMasterStyles';
    style.textContent=`
      .master-card{margin-bottom:16px;background:linear-gradient(145deg,#131d2d,#0d131e)}
      .master-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
      .master-kicker{font-size:11px;font-weight:800;letter-spacing:1.4px;color:var(--accent);margin-bottom:4px}
      .master-upload{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
      .master-progress{height:5px;background:#0a0f18;border-radius:99px;overflow:hidden;margin-top:12px}
      .master-progress>div{height:100%;width:0;background:var(--accent);transition:width .2s ease}
      .master-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:12px}
      .master-subject{padding:11px;border:1px solid var(--line);border-radius:12px;background:#0c121c}
      .master-note{margin-top:12px;padding:10px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:12px;line-height:1.5}
      .master-tools{margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:14px;background:#0c121c}
      .master-tools-title{font-weight:800;margin-bottom:4px}
      .master-tools-grid{display:grid;grid-template-columns:1.25fr .75fr .75fr;gap:10px;margin-top:12px}
      .master-tools-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .master-tools-actions .btn{flex:1}
      .master-live{margin-top:10px;font-size:12px;color:var(--muted);min-height:18px}
      @media(max-width:800px){
        .master-grid{grid-template-columns:1fr}
        .master-upload .btn{flex:1}
        .master-tools-grid{grid-template-columns:1fr}
        .master-tools-actions{display:grid;grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function injectMasterUI(){
    const notes=document.getElementById('notes');
    if(!notes || document.getElementById('excobaMasterCard')) return;

    const card=document.createElement('div');
    card.className='card master-card';
    card.id='excobaMasterCard';
    card.innerHTML=`
      <div class="master-head">
        <div>
          <div class="master-kicker">TEMARIO MAESTRO · EXCOBA UAQ</div>
          <h2 style="margin:0 0 5px">Importar PDF oficial</h2>
          <div class="muted">NOA extrae la guía temática y limita el alcance de Medicina a Matemáticas para estadística, Biología y Química.</div>
        </div>
        <label class="row small" style="white-space:nowrap">
          <input type="checkbox" id="excobaStrictScope"> Alcance estricto
        </label>
      </div>

      <div class="master-upload">
        <button class="btn primary" id="excobaMasterImportBtn" onclick="document.getElementById('excobaMasterPdf').click()">Importar PDF oficial</button>
        <input id="excobaMasterPdf" type="file" accept=".pdf,application/pdf" style="display:none">
        <button class="btn" id="excobaMasterResyncBtn">Sincronizar materias</button>
      </div>

      <div class="master-progress"><div id="excobaMasterProgress"></div></div>
      <div id="excobaMasterStatus" class="sourcebox" style="margin-top:12px"></div>
      <div id="excobaMasterDetails" class="master-grid"></div>

      <div class="master-tools" id="excobaStudyTools">
        <div class="master-tools-title">Crear material desde el temario</div>
        <div class="small">NOA usa el alcance oficial y Gemma 3:4b para crear material de estudio validado.</div>

        <div class="master-tools-grid">
          <div class="field">
            <label>Materia</label>
            <select id="excobaStudySubject">
              <option value="Biología">Biología</option>
              <option value="Química">Química</option>
              <option value="Matemáticas para estadística">Matemáticas para estadística</option>
            </select>
          </div>

          <div class="field">
            <label>Flashcards</label>
            <select id="excobaFlashCount">
              <option value="10">10</option>
              <option value="15" selected>15</option>
              <option value="20">20</option>
              <option value="30">30</option>
            </select>
          </div>

          <div class="field">
            <label>Cuestionario</label>
            <select id="excobaQuizCount">
              <option value="5">5</option>
              <option value="10" selected>10</option>
              <option value="15">15</option>
              <option value="20">20</option>
            </select>
          </div>
        </div>

        <div class="master-tools-actions">
          <button class="btn primary" id="excobaMakeFlashBtn">Crear flashcards</button>
          <button class="btn" id="excobaMakeQuizBtn">Crear cuestionario</button>
        </div>

        <div id="excobaMaterialStatus" class="master-live"></div>
      </div>

      <div class="master-note">
        <b>Cómo usa NOA este PDF:</b> el documento oficial define qué temas son evaluables. Gemma puede explicar esos temas usando conocimiento académico, pero NOA no atribuye al PDF datos que el PDF no contiene.
      </div>
    `;

    notes.insertBefore(card,notes.firstChild);

    document.getElementById('excobaMasterPdf').addEventListener('change',e=>{
      const file=e.target.files?.[0];
      if(file) importMasterPdf(file);
      e.target.value='';
    });

    document.getElementById('excobaStrictScope').addEventListener('change',e=>{
      db.settings.strictSyllabus=!!e.target.checked;
      if(db.masterSyllabus) db.masterSyllabus.strictScope=!!e.target.checked;
      save();
      toast(e.target.checked?'Alcance estricto activado':'Alcance estricto desactivado');
    });

    document.getElementById('excobaMasterResyncBtn').addEventListener('click',()=>{
      const master=getMaster();
      if(!master) return toast('Primero importa el PDF oficial');
      syncTopicsToNoa(master.items);
      act('Temario maestro resincronizado');
      save();
      toast('Materias y temas sincronizados');
    });

    document.getElementById('excobaMakeFlashBtn').addEventListener('click',()=>{
      const target=document.getElementById('excobaStudySubject').value;
      const count=parseInt(document.getElementById('excobaFlashCount').value)||15;
      createMasterFlashcards(target,count);
    });

    document.getElementById('excobaMakeQuizBtn').addEventListener('click',()=>{
      const target=document.getElementById('excobaStudySubject').value;
      const count=parseInt(document.getElementById('excobaQuizCount').value)||10;
      createMasterQuiz(target,count);
    });

    renderMasterUI();
  }

  function setMaterialStatus(text){
    const e=document.getElementById('excobaMaterialStatus');
    if(e)e.textContent=text||'';
  }

  async function createMasterFlashcards(target,count=15){
    const master=getMaster();
    if(!master) return toast('Primero importa el PDF oficial');
    if(db.settings.aiProvider==='offline'){
      return toast('Conecta Ollama Bridge para crear flashcards inteligentes');
    }

    const items=masterItemsForTarget(target,Math.max(12,Math.min(40,count*2)));
    if(!items.length) return toast('No encontré esa materia en el temario maestro');

    const allowed=new Map(items.map(x=>[x.code,x]));
    const created=[];
    const batchSize=6;
    const totalBatches=Math.ceil(count/batchSize);

    try{
      const btn=document.getElementById('excobaMakeFlashBtn');
      if(btn)btn.disabled=true;

      for(let batch=0;batch<totalBatches;batch++){
        const needed=Math.min(batchSize,count-created.length);
        if(needed<=0)break;

        setMaterialStatus(`Gemma está creando flashcards · bloque ${batch+1}/${totalBatches}…`);

        const official=officialContext(target,items.length);
        const raw=await callAI([
          {role:'system',content:
`Eres el motor de flashcards de NOA para EXCOBA UAQ.
Devuelve SOLO JSON válido, sin Markdown.
El temario oficial delimita el alcance, pero no es un libro de respuestas.
Usa conocimiento académico correcto únicamente para desarrollar los temas permitidos.
Las tarjetas deben promover recuperación activa, comprensión y aplicación.
Respuestas breves, precisas y autosuficientes.
Evita preguntas vagas como "explica todo sobre...".
No introduzcas temas fuera del alcance.`},
          {role:'user',content:
`Crea ${needed} flashcards distintas de "${target}".

FORMATO:
[
  {
    "front":"pregunta concreta",
    "back":"respuesta clara y breve",
    "syllabus_code":"código exacto permitido",
    "type":"concepto|comparación|aplicación|error_frecuente"
  }
]

REQUISITOS:
- Usa códigos exactos del alcance oficial.
- Mezcla recuerdo conceptual con aplicación.
- No repitas tarjetas ya obvias entre sí.
- Una tarjeta = una idea principal.
- La respuesta debe servir para estudiar, no ser una sola palabra.

ALCANCE OFICIAL:
${official}` }
        ],{model:db.settings.ollamaModel,temperature:0.32});

        const data=extractJSON(raw);
        if(!Array.isArray(data))continue;

        for(const f of data){
          if(created.length>=count)break;
          const code=String(f.syllabus_code||'').trim();
          const src=allowed.get(code);
          if(!src || !f.front || !f.back)continue;

          const front=String(f.front).trim();
          const back=String(f.back).trim();
          const duplicate=[...db.cards,...created].some(c=>norm(c.front)===norm(front));
          if(duplicate)continue;

          const topic=db.topics.find(t=>t.syllabusCode===code);
          created.push({
            id:uid(),
            topicId:topic?.id||'',
            front,
            back,
            ease:2.5,
            interval:0,
            reps:0,
            due:new Date().toISOString(),
            source:`${MASTER_SOURCE} · ${code} · PDF pág. ${src.page}`,
            syllabusCode:code,
            sourcePage:src.page,
            masterSyllabus:MASTER_ID,
            cardType:String(f.type||'concepto')
          });
        }
      }

      if(!created.length)throw new Error('Gemma no devolvió flashcards válidas');

      db.cards.push(...created);
      act(`${created.length} flashcards EXCOBA creadas de ${target}`);
      save();
      setMaterialStatus(`✓ ${created.length} flashcards guardadas en tu banco`);
      toast(`${created.length} flashcards creadas`);
      page('flashcards','Flashcards');
      speak(`Listo. Creé ${created.length} flashcards de ${target} basadas en el temario oficial.`);
    }catch(err){
      console.error('Flashcards EXCOBA:',err);
      setMaterialStatus('Error: '+err.message);
      toast('No pude crear las flashcards: '+err.message);
    }finally{
      const btn=document.getElementById('excobaMakeFlashBtn');
      if(btn)btn.disabled=false;
    }
  }

  async function createMasterQuiz(target,count=10){
    const master=getMaster();
    if(!master) return toast('Primero importa el PDF oficial');
    if(db.settings.aiProvider==='offline'){
      return toast('Conecta Ollama Bridge para crear cuestionarios inteligentes');
    }

    const btn=document.getElementById('excobaMakeQuizBtn');
    try{
      if(btn)btn.disabled=true;
      setMaterialStatus(`Gemma está construyendo ${count} reactivos de ${target}…`);

      const all=[];
      const batchSize=5;
      while(all.length<count){
        const needed=Math.min(batchSize,count-all.length);
        const qs=await generateAIQuestions(target,needed);
        for(const q of qs){
          const duplicate=[...db.questions,...all].some(x=>norm(x.text)===norm(q.text));
          if(!duplicate)all.push(q);
          if(all.length>=count)break;
        }
        if(!qs.length)break;
      }

      if(!all.length)throw new Error('No se generaron reactivos válidos');

      db.questions.push(...all);
      act(`${all.length} reactivos EXCOBA creados de ${target}`);
      save();
      setMaterialStatus(`✓ ${all.length} reactivos guardados y listos para practicar`);
      toast(`${all.length} preguntas creadas`);
      beginExamQueue(all,`Cuestionario EXCOBA · ${target}`);
    }catch(err){
      console.error('Cuestionario EXCOBA:',err);
      setMaterialStatus('Error: '+err.message);
      toast('No pude crear el cuestionario: '+err.message);
    }finally{
      if(btn)btn.disabled=false;
    }
  }

  // ---------- Integración con el motor de NOA ----------

  const originalRenderAll=renderAll;
  renderAll=function(){
    originalRenderAll();
    renderMasterUI();
  };

  const originalLoadExcobaPreset=loadExcobaPreset;
  loadExcobaPreset=function(silent=false){
    const master=getMaster();
    if(master?.items?.length){
      syncTopicsToNoa(master.items);
      if(!silent){
        act('Temario maestro EXCOBA activado');
        save();
        toast('Temario maestro oficial activado');
        speak('Temario maestro EXCOBA de Medicina activado.');
      }
      return;
    }
    return originalLoadExcobaPreset(silent);
  };

  const originalStudyContextFor=studyContextFor;
  studyContextFor=function(target){
    const official=officialContext(target,36);
    const base=originalStudyContextFor(target);
    if(getMaster() && db.settings.strictSyllabus && official){
      return `${official}\n\nMATERIAL PERSONAL COMPLEMENTARIO:\n${base || 'Sin apuntes personales relacionados.'}`;
    }
    return [official,base].filter(Boolean).join('\n\n');
  };

  const originalAskCoach=askCoach;
  askCoach=async function(){
    const inp=document.getElementById('coachInput');
    const q=inp.value.trim();
    if(!q) return;

    const master=getMaster();
    if(!master || !db.settings.strictSyllabus){
      return originalAskCoach();
    }

    inp.value='';
    addMsg('user',q);

    const official=officialContext(q,14);
    if(!official){
      const msg='Ese tema no aparece dentro del alcance que pude relacionar con el temario maestro. Puedes desactivar “Alcance estricto” si quieres una explicación fuera del EXCOBA.';
      addMsg('noa',msg);
      speak(msg);
      return;
    }

    const notes=searchNotes(q).map(n=>`[APUNTE: ${n.title}]\n${n.text.slice(0,2200)}`).join('\n\n');

    try{
      const answer=await callAI([
        {role:'system',content:
`Eres NOA, tutor académico para EXCOBA UAQ.
El PDF oficial proporcionado es un TEMARIO, no un libro de respuestas.
Su función es delimitar el alcance.
Puedes usar conocimiento académico correcto para explicar ÚNICAMENTE los conceptos incluidos en ese alcance.
No afirmes que un dato detallado aparece en el PDF si el PDF solo menciona el tema.
Explica de forma clara, ordenada y útil para examen.`},
        {role:'user',content:`ALCANCE OFICIAL:\n${official}\n\nAPUNTES DEL ESTUDIANTE:\n${notes||'Sin apuntes relacionados.'}\n\nPREGUNTA:\n${q}`}
      ],{model:db.settings.ollamaModel,temperature:0.25});
      addMsg('noa',answer);
      speak(answer);
    }catch(e){
      addMsg('noa',`No pude consultar la IA: ${e.message}`);
    }
  };

  const originalSmartCreateGuide=smartCreateGuide;
  smartCreateGuide=async function(target){
    const master=getMaster();
    if(!master || !db.settings.strictSyllabus || db.settings.aiProvider==='offline'){
      return originalSmartCreateGuide(target);
    }

    const official=officialContext(target,40);
    if(!official){
      toast('Ese tema no aparece en el alcance oficial cargado');
      return;
    }

    const status=document.getElementById('voiceStatus');
    if(status) status.textContent='NOA está creando una guía desde el temario maestro…';

    const notes=relevantNotes(target).map(n=>`[APUNTE: ${n.title}]\n${n.text.slice(0,3500)}`).join('\n\n');

    try{
      const text=await callAI([
        {role:'system',content:
`Eres NOA, tutor para EXCOBA UAQ.
Crea una guía de estudio rigurosa en Markdown.
REGLA CENTRAL: el temario oficial delimita el ALCANCE, pero no contiene todo el desarrollo teórico.
Puedes usar conocimiento académico correcto para explicar y enseñar SOLO los temas incluidos.
Distingue claramente "alcance oficial" de "explicación académica".
No introduzcas temas externos.
Incluye: alcance oficial, conceptos esenciales, explicación, relaciones, errores frecuentes, trampas de examen, recuperación activa y mini autoevaluación.`},
        {role:'user',content:`OBJETIVO: Guía de "${target}"\n\n${official}\n\nAPUNTES COMPLEMENTARIOS:\n${notes||'Sin apuntes personales relacionados.'}`}
      ],{model:db.settings.ollamaModel,temperature:0.3});

      const title=`Guía EXCOBA — ${target}`;
      lastGuide={title,markdown:text,summary:`Guía EXCOBA de ${target} lista.`};
      db.guides.push({id:uid(),title,markdown:text,created:new Date().toISOString(),provider:db.settings.aiProvider,masterSyllabus:MASTER_ID});
      act('Guía desde temario maestro: '+target);
      save();

      document.getElementById('guideTitle').textContent=title;
      document.getElementById('guideOutput').textContent=text;
      openModal('guideModal');
      speak(`Listo. Preparé la guía de ${target} usando el alcance oficial EXCOBA.`);
    }catch(err){
      toast('No pude generar la guía: '+err.message);
    }
  };

  const originalGenerateAIQuestions=generateAIQuestions;
  generateAIQuestions=async function(target,count){
    const master=getMaster();
    if(!master || !db.settings.strictSyllabus){
      return originalGenerateAIQuestions(target,count);
    }

    const items=masterItemsForTarget(target,Math.max(16,Math.min(48,count*3)));
    if(!items.length){
      throw new Error('Ese tema no aparece en el temario maestro');
    }

    const allowedCodes=new Map(items.map(x=>[x.code,x]));
    const official=officialContext(target,items.length);

    const prompt=`Genera ${count} reactivos de opción múltiple para practicar "${target}".

IMPORTANTE:
- El PDF oficial es un TEMARIO: los códigos siguientes delimitan el alcance.
- Puedes usar conocimiento académico correcto para construir el reactivo, pero SOLO dentro de esos temas.
- Cada pregunta debe declarar exactamente uno de los syllabus_code permitidos.
- Una sola respuesta correcta.
- Cuatro opciones.
- Distractores plausibles y del mismo nivel conceptual.
- Evita pistas por longitud, opciones absurdas, ambigüedad y memoria trivial cuando pueda evaluarse aplicación.
- Dificultad media-alta.
- No repitas el mismo planteamiento.

Devuelve EXCLUSIVAMENTE un arreglo JSON válido con:
{"question":"...","options":["...","...","...","..."],"correct":0,"explanation":"...","topic":"...","syllabus_code":"3.4.2.2"}

ALCANCE OFICIAL:
${official}`;

    const raw=await callAI([
      {role:'system',content:'Eres el motor de reactivos de NOA. Devuelve JSON estricto, sin Markdown y sin texto fuera del arreglo.'},
      {role:'user',content:prompt}
    ],{model:db.settings.ollamaModel,temperature:0.38});

    const data=extractJSON(raw);
    if(!Array.isArray(data)) throw new Error('Formato de examen inválido');

    const valid=[];
    for(const q of data){
      const code=String(q.syllabus_code||'').trim();
      const src=allowedCodes.get(code);
      if(!src) continue;
      if(!q.question || !Array.isArray(q.options) || q.options.length!==4) continue;
      const correct=Number(q.correct);
      if(!Number.isInteger(correct) || correct<0 || correct>3) continue;

      const topic=db.topics.find(t=>t.syllabusCode===code);
      valid.push({
        id:uid(),
        topicId:topic?.id||'',
        text:String(q.question),
        options:q.options.map(String),
        correct,
        explain:String(q.explanation||''),
        source:`${MASTER_SOURCE} · ${code} · PDF pág. ${src.page}`,
        syllabusCode:code,
        sourcePage:src.page,
        masterSyllabus:MASTER_ID
      });
      if(valid.length>=count) break;
    }

    if(!valid.length){
      throw new Error('La IA no devolvió reactivos válidos dentro del temario oficial');
    }

    if(valid.length<count){
      toast(`NOA validó ${valid.length}/${count} reactivos; descartó los que salieron del alcance`);
    }
    return valid;
  };

  const originalExecuteCommand=executeCommand;
  executeCommand=function(raw){
    const n=norm(raw);

    if(getMaster() && /(flashcards|tarjetas)/.test(n) && /(crea|creame|hazme|genera)/.test(n)){
      const m=n.match(/(\d{1,2})\s*(flashcards|tarjetas)?/);
      const count=m?Math.min(30,Math.max(5,parseInt(m[1]))):15;
      let target='';
      if(n.includes('biologia')) target='Biología';
      else if(n.includes('quimica')) target='Química';
      else if(n.includes('estadistica') || n.includes('matematicas')) target='Matemáticas para estadística';

      if(target && db.settings.aiProvider!=='offline'){
        createMasterFlashcards(target,count);
        return;
      }
    }

    if(getMaster() && /(cuestionario|examen|simulacro)/.test(n) && /excoba/.test(n)){
      const m=n.match(/(\d{1,3})\s*(preguntas|reactivos)?/);
      const count=m?Math.min(60,Math.max(1,parseInt(m[1]))):10;

      let target='';
      if(n.includes('biologia')) target='Biología';
      else if(n.includes('quimica')) target='Química';
      else if(n.includes('estadistica') || n.includes('matematicas')) target='Matemáticas para estadística';

      if(target && db.settings.aiProvider!=='offline'){
        createMasterQuiz(target,count);
        return;
      }
    }

    if(getMaster() && /(abre|muestra|ve).*(temario maestro)/.test(n)){
      page('notes','Biblioteca');
      document.getElementById('excobaMasterCard')?.scrollIntoView({behavior:'smooth'});
      return;
    }

    return originalExecuteCommand(raw);
  };

  // Exponer utilidades por si luego quieres ampliar Exam Engine 2.0.
  window.NOA_EXCOBA_MASTER={
    importPdf:importMasterPdf,
    get:()=>getMaster(),
    itemsFor:masterItemsForTarget,
    contextFor:officialContext,
    createFlashcards:createMasterFlashcards,
    createQuiz:createMasterQuiz,
    sync:()=>{
      const m=getMaster();
      if(m){syncTopicsToNoa(m.items);save();}
    }
  };

  // Inicialización
  ensureMasterStore();
  injectMasterStyles();
  injectMasterUI();
  renderMasterUI();

})();
