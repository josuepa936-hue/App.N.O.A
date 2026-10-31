/* NOA v25, etapa 3: interfaz del simulacro de 45 sobre Plan y Multibatch. */
(() => {
  const TITLE = 'Simulacro EXCOBA Medicina — 45 reactivos';
  const FORMATS = ['single_select', 'drag_classify', 'inline_select', 'drag_order'];
  const GROUP_COUNTS = {primary:10, secondary:20, medicine:15};
  const element = name => document.getElementById('noaExam45' + name);
  const assert = (value, message) => { if(!value) throw new Error(message); };
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  let busy = false, sequence = 0, phase = 'Listo para generar';
  let progress = null, activePlan = null;

  function peerBusy(){ return !!window.NOA_GENERATOR_UI?.state?.()?.busy; }
  function activeExam(){ return examQueue.length > 0 && examIndex >= 0 && examIndex < examQueue.length; }
  function status(next, details){
    phase = next;
    element('Phase').textContent = next;
    element('Details').textContent = details;
  }
  function showProgress(){
    const subject = activePlan?.subjects.find(item => item.id === progress?.subject);
    const group = activePlan?.groups.find(item => item.id === progress?.groupId);
    element('Subject').textContent = 'Materia actual: ' + (subject?.label || progress?.subject || '—');
    element('Group').textContent = 'Grupo académico: ' + (group?.label || '—');
    element('Processed').textContent = `Procesadas: ${progress?.processed ?? '—'}/45`;
    element('Accepted').textContent = `Aceptadas: ${progress?.accepted ?? '—'}`;
    element('Failed').textContent = `Fallidas: ${progress?.failed ?? '—'}`;
  }

  function refresh(){
    if(!element('Card')) return false;
    let available = false;
    try{
      const profile = activePlan?.profile || window.NOA_SOURCE_ENGINE?.getProfile?.();
      const calibration = activePlan?.calibration || window.NOA_SOURCE_BLUEPRINT?.calibrationState?.();
      element('Profile').textContent = profile ? `Perfil activo: ${profile.label}.` : 'Perfil de entrenamiento no disponible.';
      element('Calibration').textContent = !calibration ? 'Calibrator no disponible.' : calibration.adaptive
        ? `Calibrator adaptativo · ${calibration.sample ?? calibration.calibration?.sample} respuestas de referencia.`
        : 'Calibrator: ciclo inicial de dificultad.';
      const engines = typeof window.NOA_EXAM_PLAN_V25?.build === 'function' &&
        typeof window.NOA_MULTI_BATCH_V25?.generate === 'function' && typeof window.NOA_MIXED_EXAM?.start === 'function';
      const syllabus = window.NOA_EXCOBA_V4;
      const subjects = syllabus?.subjects || [];
      const completeSyllabus = subjects.length === 9 && subjects.every(subject => syllabus.itemsFor(subject.value).length > 0);
      available = engines && completeSyllabus && !!profile && !!calibration;
      element('Availability').textContent = peerBusy() ? 'El generador de 5/10 preguntas está activo. Espera a que termine.'
        : !engines ? 'Faltan los motores de planificación o generación. Recarga la aplicación.'
        : !completeSyllabus ? 'Carga las nueve materias del Temario Maestro EXCOBA para habilitar este simulacro.'
        : busy ? 'La sesión anterior se conserva mientras se prepara el lote.'
        : 'La generación requiere conexión al servicio de IA configurado.';
      return available;
    }catch(error){
      element('Availability').textContent = `No se pudieron consultar los motores: ${error?.message || 'datos no disponibles'}.`;
      return false;
    }finally{
      element('Generate').disabled = busy || peerBusy() || !available;
      element('Card').setAttribute('aria-busy', String(busy));
    }
  }

  function validateFormat(question){
    const keyed = values => Array.isArray(values) && values.length > 0 && values.every(item => item && text(item.id)) &&
      new Set(values.map(item => item.id)).size === values.length;
    const options = item => Array.isArray(item.options) && item.options.length > 0 && item.options.every(text) &&
      Number.isInteger(item.correct) && item.correct >= 0 && item.correct < item.options.length;
    let valid = false;
    switch(question.interactionType){
      case 'single_select': valid = text(question.text) && options(question); break;
      case 'drag_classify':
        valid = typeof window.NOA_DRAG_RENDERER?.open === 'function' && text(question.instruction) &&
          keyed(question.targets) && question.targets.every(item => text(item.label)) && keyed(question.elements) &&
          question.elements.every(item => text(item.text) && question.targets.some(target => target.id === item.correctTargetId));
        break;
      case 'inline_select': {
        const placeholders = [...String(question.text || '').matchAll(/\[\[([^\]]+)\]\]/g)].map(match => match[1]);
        valid = typeof window.NOA_INLINE_RENDERER?.open === 'function' && text(question.text) && keyed(question.blanks) &&
          question.blanks.every(options) && placeholders.length === question.blanks.length &&
          new Set(placeholders).size === placeholders.length && question.blanks.every(item => placeholders.includes(item.id));
        break;
      }
      case 'drag_order':
        valid = typeof window.NOA_DRAG_ORDER_RENDERER?.open === 'function' && text(question.instruction) &&
          keyed(question.items) && question.items.length > 1 && question.items.every(item => text(item.text)) &&
          Array.isArray(question.correctOrder) && question.correctOrder.length === question.items.length &&
          new Set(question.correctOrder).size === question.items.length &&
          question.correctOrder.every(id => question.items.some(item => item.id === id));
        break;
    }
    assert(valid, 'El resultado contiene un reactivo que no puede renderizarse.');
  }

  function validateResult(result, plan){
    const questions = result.questions;
    assert(new Set(questions.map(question => question?.id)).size === 45 && questions.every(question => text(question?.id)),
      'El resultado no contiene 45 IDs únicos.');
    assert(new Set(questions.map(question => question.planSlotId)).size === 45, 'Hay posiciones globales repetidas.');
    const slots = new Map(plan.slots.map(item => [item.id, item]));
    for(const question of questions){
      const expected = slots.get(question.planSlotId), slot = question.blueprintSlot;
      assert(expected && slot && question.subject === expected.subject && question.groupId === expected.groupId &&
        question.slotId === expected.slotId, 'Se perdió la identidad, materia o grupo de un reactivo.');
      for(const field of ['subject', 'slotId', 'index', 'difficulty', 'calibratorDifficulty', 'interactionType', 'requestedSourceType', 'locked']){
        assert(same(slot[field], expected.blueprintSlot[field]), `El resultado cambió el campo bloqueado ${field}.`);
      }
      assert(FORMATS.includes(question.interactionType) && question.interactionType === slot.interactionType &&
        question.difficulty === slot.difficulty.level && question.blueprint?.difficulty === slot.difficulty.level,
      'El resultado perdió formato, dificultad o Blueprint.');
      assert(question.accepted === true && question.judge && typeof question.judge === 'object' &&
        slot.source && question.sourceTrace && same(question.sourceTrace, slot.source) &&
        question.sourceType === slot.sourceType && question.requestedSourceType === slot.requestedSourceType &&
        Array.isArray(slot.syllabusCodes) && same(question.syllabusCodes, slot.syllabusCodes) &&
        (question.syllabusCode === '' || slot.syllabusCodes.includes(question.syllabusCode)),
      'El resultado perdió la aprobación interna de Judge o la trazabilidad de su fuente.');
      validateFormat(question);
    }
    assert(plan.subjects.length === 9 && plan.subjects.every(subject => questions.filter(q => q.subject === subject.id).length === 5),
      'Se requieren cinco reactivos por cada una de las nueve materias.');
    assert(Object.entries(GROUP_COUNTS).every(([group, count]) => questions.filter(q => q.groupId === group).length === count),
      'La distribución debe ser Primaria 10, Secundaria 20 y Medicina 15.');
  }

  async function generate(){
    if(busy || peerBusy()) return;
    busy = true;
    const run = ++sequence;
    let acceptingProgress = false, starting = false;
    activePlan = null;
    progress = null;
    showProgress();
    refresh();
    window.NOA_GENERATOR_UI?.refresh?.();
    try{
      status('Validando plan académico', 'Comprobando nueve materias, fuentes y 45 posiciones compatibles.');
      await pause();
      assert(typeof window.NOA_EXAM_PLAN_V25?.build === 'function' && typeof window.NOA_MULTI_BATCH_V25?.generate === 'function' &&
        typeof window.NOA_MIXED_EXAM?.start === 'function', 'Faltan los motores del simulacro de 45 reactivos.');
      const plan = window.NOA_EXAM_PLAN_V25.build();
      assert(plan?.valid === true && plan.total === 45 && Array.isArray(plan.unsupportedSlots) && !plan.unsupportedSlots.length &&
        plan.slots?.length === 45 && plan.subjects?.length === 9,
      `Plan académico inválido. ${plan?.errors?.[0]?.message || 'Se requieren 45 slots compatibles de las nueve materias.'}`);
      activePlan = JSON.parse(JSON.stringify(plan));
      refresh();
      if(navigator.onLine === false) throw new Error('Sin conexión al servicio de IA. Puedes continuar con tus preguntas guardadas.');
      const originalSession = examAnswers;
      const warning = 'Se solicitarán 45 reactivos a la IA. El proceso puede consumir recursos del servicio y puede haber fallos o rechazos de Judge. Un lote incompleto no iniciará examen.' +
        (activeExam() ? ' Tu examen activo se conservará durante la generación. Solo se reemplazará con un lote completo válido y una nueva confirmación.' : '');
      if(!window.confirm(warning + '\n\n¿Quieres generar el simulacro?')){
        status('Listo para generar', 'Generación cancelada antes de solicitar reactivos. Se conserva la sesión anterior.');
        return;
      }
      status('Generando reactivos', 'Preparando 45 reactivos con evaluación interna de Judge. Se conserva la sesión anterior.');
      acceptingProgress = true;
      const result = await window.NOA_MULTI_BATCH_V25.generate({
        plan, concurrency:2, maxAttempts:2,
        onProgress:event => {
          if(!busy || run !== sequence || !acceptingProgress) return;
          const subject = activePlan.subjects.find(item => item.id === event?.subject && item.groupId === event?.groupId);
          const values = [event?.processed, event?.accepted, event?.failed];
          if(!subject || event.requested !== 45 || !values.every(value => Number.isInteger(value) && value >= 0 && value <= 45) ||
            event.accepted + event.failed !== event.processed || (progress && event.processed < progress.processed)) return;
          progress = {...event};
          showProgress();
        }
      });
      acceptingProgress = false;
      status('Evaluando y preparando examen', 'Verificando cantidad, identidad global, distribución y trazabilidad del lote.');
      await pause();
      if(result?.complete !== true || result.accepted !== 45 || !Array.isArray(result.questions) || result.questions.length !== 45 ||
        !Array.isArray(result.failures) || result.failures.length !== 0){
        const count = Number.isInteger(result?.accepted) ? result.accepted : 'no informado';
        const reason = result?.failures?.find(failure => failure.error)?.error;
        status('Generación incompleta', `Aceptadas: ${count} de 45. No se inició un examen y se conserva la sesión anterior. Puedes volver a intentarlo.${reason ? ' Motivo: ' + reason : ''}`);
        return;
      }
      validateResult(result, activePlan);
      if(activeExam()){
        const changed = examAnswers !== originalSession;
        if(!window.confirm((changed ? 'Se inició otra sesión durante la generación. ' : 'Hay un examen activo. ') +
          'Los 45 reactivos están completos y validados internamente por NOA. ¿Autorizas reemplazar el examen activo por este simulacro?')){
          status('Generación completa', '45 reactivos preparados. Inicio cancelado: se conserva el examen activo. El lote no se guarda para después.');
          return;
        }
      }
      starting = true;
      window.NOA_MIXED_EXAM.start(result.questions, TITLE);
      status('Generación completa', '45 reactivos aceptados. Simulacro EXCOBA Medicina iniciado.');
      document.getElementById('examBox')?.scrollIntoView({block:'start'});
    }catch(error){
      status('Error de conexión o del motor', `${error?.message || 'No se pudo preparar el simulacro.'} ` +
        (starting ? 'No se pudo iniciar el simulacro.' : 'No se inició un examen; se conserva la sesión anterior. Puedes volver a intentarlo.'));
    }finally{
      acceptingProgress = false;
      busy = false;
      activePlan = null;
      refresh();
      window.NOA_GENERATOR_UI?.refresh?.();
    }
  }

  function init(){
    const exam = document.getElementById('exam');
    if(!exam || element('Card')) return;
    const style = document.createElement('style');
    style.textContent = `
      #noaExam45Card{margin-bottom:16px;min-width:0;overflow-wrap:anywhere}
      #noaExam45Distribution{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}
      #noaExam45Distribution dl{flex:1 1 160px;min-width:0;margin:0;padding:10px;border:1px solid var(--line);border-radius:10px}
      #noaExam45Distribution dt{font-size:12px;color:var(--muted)}
      #noaExam45Distribution dd{margin:5px 0 0;font-weight:700}
      #noaExam45Progress{display:flex;flex-wrap:wrap;gap:6px 16px;margin:10px 0}
      #noaExam45Progress p{margin:0;min-width:0}
      #noaExam45Generate{max-width:100%;white-space:normal}
      #noaExam45Generate:disabled{cursor:not-allowed;opacity:.6}
    `;
    document.head.appendChild(style);
    const card = document.createElement('div');
    card.id = 'noaExam45Card'; card.className = 'card';
    card.setAttribute('aria-labelledby', 'noaExam45Title');
    card.innerHTML = `
      <h2 id="noaExam45Title">${TITLE}</h2>
      <p>45 reactivos · Nueve materias</p>
      <div id="noaExam45Distribution">
        <dl data-noa-exam45-group="primary"><dt>Primaria</dt><dd>10</dd></dl>
        <dl data-noa-exam45-group="secondary"><dt>Secundaria</dt><dd>20</dd></dl>
        <dl data-noa-exam45-group="medicine"><dt>Especialidad Medicina</dt><dd>15</dd></dl>
      </div>
      <p class="small" id="noaExam45Profile"></p><p class="small" id="noaExam45Calibration"></p>
      <p class="small">Distribución proporcional del esquema EXCOBA Medicina. Los formatos están limitados a selección única, clasificación, selección en espacios y ordenamiento, los cuatro actualmente implementados por NOA. No representan todas las interacciones ni las frecuencias oficiales del EXCOBA. Judge es una evaluación interna de NOA, no una validación oficial de la UAQ.</p>
      <div id="noaExam45Status" role="status" aria-live="polite" aria-atomic="true">
        <b id="noaExam45Phase"></b><p class="small" id="noaExam45Details"></p>
        <div class="small" id="noaExam45Progress">
          <p id="noaExam45Subject"></p><p id="noaExam45Group"></p>
          <p id="noaExam45Processed"></p><p id="noaExam45Accepted"></p><p id="noaExam45Failed"></p>
        </div>
      </div>
      <p class="small" id="noaExam45Availability"></p>
      <button class="btn primary" id="noaExam45Generate" type="button" disabled aria-describedby="noaExam45Status noaExam45Availability">Generar simulacro de 45 reactivos</button>
      <p class="small" id="noaExam45RecoveryNote">La generación en curso no se guarda ni se recupera tras recargar; deberás iniciarla de nuevo. La recuperación del examen ya iniciado continúa disponible.</p>
    `;
    exam.prepend(card);
    element('Generate').addEventListener('click', generate);
    const previousRenderAll = window.renderAll;
    window.renderAll = function(...args){ const result = previousRenderAll.apply(this, args); refresh(); return result; };
    document.addEventListener('change', event => { if(event.target.id === 'excobaTrainingProfile') refresh(); });
    document.addEventListener('click', event => { if(event.target.closest('#nav button[data-page="exam"]')) refresh(); });
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.NOA_EXAM_UI_V25 = {version:'25.2-ui', refresh, generate, state:() => ({busy, phase, progress:progress ? {...progress} : null})};
    status('Listo para generar', 'Prepara un simulacro de nueve materias con un lote completo de 45 reactivos.');
    showProgress();
    refresh();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
