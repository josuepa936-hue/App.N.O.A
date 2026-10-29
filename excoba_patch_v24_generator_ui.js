/* NOA v24, etapa 2: conexión de la interfaz a los motores existentes. */
(() => {
  const element = id => document.getElementById(id);
  const readyMessage = 'Selecciona una materia y 5 o 10 preguntas. Se necesita conexión al servicio de IA configurado.';
  const missingSubjectMessage = 'Carga el Temario Maestro EXCOBA en Biblioteca para ver sus materias.';
  const missingBatchMessage = 'El motor Batch no está disponible. Recarga la aplicación.';
  let busy = false;
  let phase = 'Listo para generar';
  let message = '';

  function subjects(){
    const syllabus = window.NOA_EXCOBA_V4;
    return (syllabus?.subjects || []).filter(subject => syllabus.itemsFor(subject.value).length > 0);
  }

  function status(next, details){
    phase = next;
    message = details;
    element('noaGeneratorPhase').textContent = next;
    element('noaGeneratorDetails').textContent = details;
  }

  function refresh(){
    const card = element('noaGeneratorCard');
    if(!card) return false;
    const select = element('noaGeneratorSubject');
    let available = [];
    try{
      available = subjects();
      const signature = JSON.stringify(available.map(subject => [subject.value, subject.label]));
      if(!busy && select.dataset.subjects !== signature){
        const previous = select.value;
        const options = available.length
          ? available.map(subject => new Option(subject.label, subject.value))
          : [new Option('Sin materias del Temario Maestro disponibles', '')];
        select.replaceChildren(...options);
        if(available.some(subject => subject.value === previous)) select.value = previous;
        select.dataset.subjects = signature;
      }
      const profile = window.NOA_SOURCE_ENGINE?.getProfile?.();
      element('noaGeneratorProfile').textContent = profile
        ? `Perfil activo: ${profile.label}.`
        : 'Perfil de entrenamiento no disponible.';
      const calibration = window.NOA_SOURCE_BLUEPRINT?.calibrationState?.();
      element('noaGeneratorCalibration').textContent = calibration
        ? calibration.adaptive
          ? `Calibrator adaptativo · ${calibration.calibration.sample} respuestas de referencia.`
          : 'Calibrator: ciclo inicial de dificultad.'
        : 'Estado del Calibrator no disponible.';
      if(!busy && !available.length){
        status('Listo para generar', missingSubjectMessage);
      }else if(!busy && typeof window.NOA_BATCH_ORCHESTRATOR?.generate !== 'function'){
        status('Error del motor', missingBatchMessage);
      }else if(!message || (!busy && [missingSubjectMessage, missingBatchMessage].includes(message))){
        status('Listo para generar', readyMessage);
      }
      return true;
    }catch(error){
      status('Error del motor', `No se pudieron actualizar los datos: ${error?.message || 'motor no disponible'}.`);
      return false;
    }finally{
      const validSubject = available.some(subject => subject.value === select.value);
      select.disabled = busy || !available.length;
      element('noaGeneratorCount').disabled = busy;
      element('noaGeneratorGenerate').disabled = busy || !validSubject ||
        typeof window.NOA_BATCH_ORCHESTRATOR?.generate !== 'function' ||
        ![5,10].includes(Number(element('noaGeneratorCount').value));
      card.setAttribute('aria-busy', String(busy));
    }
  }

  function activeExam(){
    return examQueue.length > 0 && examIndex >= 0 && examIndex < examQueue.length;
  }

  // Comprobar estructura para no abrir un renderer incompleto sobre la sesión
  // anterior. La aprobación de contenido sigue siendo responsabilidad de Judge.
  function assertRenderable(questions){
    const nonempty = values => Array.isArray(values) && values.length > 0;
    const keyed = values => nonempty(values) &&
      values.every(item => item && typeof item.id === 'string' && item.id.trim()) &&
      new Set(values.map(item => item.id)).size === values.length;
    const optionsValid = item => nonempty(item.options) && Number.isInteger(item.correct) &&
      item.options.every(option => typeof option === 'string' && option.trim()) &&
      item.correct >= 0 && item.correct < item.options.length;
    if(questions.some(question => !question.id) || new Set(questions.map(question => question.id)).size !== questions.length){
      throw new Error('El lote contiene identificadores ausentes o repetidos.');
    }
    for(const question of questions){
      let valid = false;
      switch(question.interactionType || 'single_select'){
        case 'single_select':
          valid = typeof question.text === 'string' && optionsValid(question);
          break;
        case 'drag_classify':
          valid = typeof window.NOA_DRAG_RENDERER?.open === 'function' &&
            keyed(question.elements) && keyed(question.targets);
          break;
        case 'inline_select':
          valid = typeof window.NOA_INLINE_RENDERER?.open === 'function' &&
            typeof question.text === 'string' && keyed(question.blanks) && question.blanks.every(optionsValid);
          break;
        case 'drag_order':
          valid = typeof window.NOA_DRAG_ORDER_RENDERER?.open === 'function' &&
            keyed(question.items) && nonempty(question.correctOrder) &&
            question.items.length === question.correctOrder.length &&
            new Set(question.correctOrder).size === question.items.length &&
            question.correctOrder.every(id => question.items.some(item => item.id === id));
          break;
      }
      if(!valid) throw new Error('El lote contiene un formato incompatible o un reactivo incompleto.');
    }
  }

  function summary(batch, accepted, count){
    const generated = Array.isArray(batch?.generated) ? batch.generated : [];
    const failures = Array.isArray(batch?.failures) ? batch.failures : [];
    const duplicates = generated.filter(item => item.duplicate).length;
    const rejected = generated.filter(item => !item.duplicate && item.question?.accepted !== true).length;
    return `Aceptadas: ${accepted} de ${count}. Fallidas o rechazadas: ${failures.length + rejected}. Duplicadas: ${duplicates}.`;
  }

  async function generate(){
    if(busy) return;
    busy = true;
    try{
      if(!refresh()) return;
      const subject = element('noaGeneratorSubject').value;
      const count = Number(element('noaGeneratorCount').value);
      if(!subjects().some(item => item.value === subject) || ![5,10].includes(count)){
        throw new Error('Selecciona una materia válida y exactamente 5 o 10 preguntas.');
      }
      if(typeof window.NOA_BATCH_ORCHESTRATOR?.generate !== 'function' ||
        typeof window.NOA_MIXED_EXAM?.questionsFromBatch !== 'function' || typeof window.NOA_MIXED_EXAM?.start !== 'function'){
        throw new Error('Los motores Batch y Mixed Exam deben estar disponibles.');
      }
      const approvedSession = examAnswers;
      if(activeExam() && !window.confirm('Hay un examen activo. ¿Quieres generar un nuevo lote y reemplazarlo solo si se completa? Si falla, conservarás tu progreso.')){
        status('Listo para generar', 'Generación cancelada. Se conserva tu examen actual.');
        return;
      }
      if(navigator.onLine === false) throw new Error('Sin conexión al servicio de IA. Puedes continuar con tus preguntas guardadas.');
      status('Preparando generación', 'Preparando materia, perfil y ciclo de dificultad.');
      await new Promise(resolve => setTimeout(resolve, 0));
      const pending = window.NOA_BATCH_ORCHESTRATOR.generate({
        subject, blueprintCount:count, limit:count, concurrency:2, maxAttempts:2
      });
      status('Generando y evaluando reactivos', 'NOA está generando y evaluando el lote. Tu sesión actual se conserva.');
      const batch = await pending;
      const questions = window.NOA_MIXED_EXAM.questionsFromBatch(batch);
      const counts = summary(batch, questions.length, count);
      if(questions.length !== count){
        const reason = batch?.failures?.find(failure => failure.error)?.error;
        status('Generación incompleta', `${counts} No se inició un examen. Puedes volver a intentarlo.${reason ? ' Motivo: ' + String(reason) : ''}`);
        return;
      }
      assertRenderable(questions);
      // La autorización anterior no cubre otro examen iniciado durante el await.
      if(activeExam() && examAnswers !== approvedSession &&
        !window.confirm('Hay una nueva sesión activa. ¿Quieres reemplazarla por el lote completo que acaba de generarse?')){
        status('Generación completada', `${counts} Inicio cancelado: se conserva la nueva sesión activa.`);
        return;
      }
      window.NOA_MIXED_EXAM.start(questions, 'Simulacro inteligente NOA');
      status('Generación completada', `${counts} Simulacro inteligente NOA iniciado.`);
    }catch(error){
      status('Error del motor', `${error?.message || 'No se pudo generar el lote.'} Se conserva la sesión anterior. Puedes volver a intentarlo.`);
    }finally{
      busy = false;
      refresh();
    }
  }

  function init(){
    const exam = element('exam');
    if(!exam || element('noaGeneratorCard')) return;
    const style = document.createElement('style');
    style.textContent = `
      #noaGeneratorCard{margin-bottom:16px;min-width:0}
      #noaGeneratorCard .noa-generator-fields{display:flex;flex-wrap:wrap;gap:12px}
      #noaGeneratorCard .field{min-width:0;flex:1 1 240px}
      #noaGeneratorCard select{width:100%;min-width:0;max-width:100%}
      #noaGeneratorCard .btn:disabled{cursor:not-allowed;opacity:.6}
      #noaGeneratorStatus{overflow-wrap:anywhere}
    `;
    document.head.appendChild(style);
    const card = document.createElement('div');
    card.id = 'noaGeneratorCard';
    card.className = 'card';
    card.setAttribute('aria-labelledby', 'noaGeneratorTitle');
    card.innerHTML = `
      <h2 id="noaGeneratorTitle">Generador inteligente NOA</h2>
      <div class="noa-generator-fields">
        <div class="field">
          <label for="noaGeneratorSubject">Materia del Temario Maestro EXCOBA</label>
          <select id="noaGeneratorSubject"></select>
        </div>
        <div class="field">
          <label for="noaGeneratorCount">Cantidad de preguntas</label>
          <select id="noaGeneratorCount"><option value="5">5</option><option value="10">10</option></select>
        </div>
      </div>
      <p class="small" id="noaGeneratorProfile"></p>
      <p class="small" id="noaGeneratorCalibration"></p>
      <div class="small" id="noaGeneratorStatus" role="status" aria-live="polite" aria-atomic="true">
        <b id="noaGeneratorPhase"></b><p id="noaGeneratorDetails"></p>
      </div>
      <p class="small">Judge es una evaluación interna de NOA; no es una validación oficial de la UAQ.</p>
      <button class="btn primary" id="noaGeneratorGenerate" type="button" disabled aria-describedby="noaGeneratorStatus">Generar con IA</button>
    `;
    exam.prepend(card);
    element('noaGeneratorGenerate').addEventListener('click', generate);

    const previousRenderAll = window.renderAll;
    window.renderAll = function(...args){
      const result = previousRenderAll.apply(this, args);
      refresh();
      return result;
    };
    document.addEventListener('change', event => {
      if(['excobaTrainingProfile', 'noaGeneratorSubject', 'noaGeneratorCount'].includes(event.target.id)) refresh();
    });
    document.addEventListener('click', event => {
      if(event.target.closest('#nav button[data-page="exam"]')) refresh();
    });
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.NOA_GENERATOR_UI = {version:'24.2-batch', refresh, generate, state:() => ({busy, phase})};
    refresh();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  }else{
    init();
  }
})();
