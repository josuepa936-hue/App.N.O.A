/* NOA v25, etapa 2: prepara lotes sobre un plan fijo; nunca inicia un examen. */
(() => {
  const TOTAL = 45;
  const GROUP_COUNTS = {primary:10, secondary:20, medicine:15};
  const FORMATS = ['single_select', 'drag_classify', 'inline_select', 'drag_order'];
  let active = false;
  const clone = value => JSON.parse(JSON.stringify(value));
  const stable = value => JSON.stringify(value, (_, item) => item &&
    typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  const same = (left, right) => stable(left) === stable(right);
  const limit = (value, fallback) => Number.isFinite(Number(value))
    ? Math.max(1, Math.min(2, Math.trunc(Number(value)))) : fallback;
  const assert = (condition, message) => { if(!condition) throw new Error(message); };
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const keyed = items => Array.isArray(items) && items.length > 0 &&
    items.every(item => item && text(item.id)) && new Set(items.map(item => item.id)).size === items.length;
  const optionsValid = item => Array.isArray(item.options) && item.options.length > 0 &&
    item.options.every(text) && Number.isInteger(item.correct) && item.correct >= 0 && item.correct < item.options.length;

  function validatePlan(plan){
    assert(window.NOA_EXAM_PLAN_V25 && window.NOA_SOURCE_BLUEPRINT?.replaceSlot &&
      window.NOA_BLUEPRINT_GENERATOR?.generateSlot && window.NOA_MIXED_EXAM?.questionsFromBatch,
    'Faltan motores de planificación, Generator o examen mixto.');
    assert(plan?.version === '25.0' && plan.valid === true && plan.structureValid === true &&
      plan.requestedTotal === TOTAL && plan.total === TOTAL && Array.isArray(plan.errors) && !plan.errors.length,
    'Se requiere un plan v25 válido de exactamente 45 slots.');
    assert(plan.subjects?.length === 9 && plan.groups?.length === 3 && plan.slots?.length === TOTAL,
      'El plan debe contener nueve materias, tres grupos y 45 slots.');
    const catalog = window.NOA_EXCOBA_V4?.subjects || [];
    const subjects = new Map();
    for(const subject of plan.subjects){
      const real = catalog.find(item => item.value === subject.id);
      const section = real?.prefixes?.[0]?.split('.')[0];
      const groupId = {1:'primary', 2:'secondary', 3:'medicine'}[section];
      assert(real && subject.groupId === groupId && !subjects.has(subject.id) && subject.requiredCount === 5 &&
        subject.blueprint?.subject === subject.id && subject.blueprint.count === 5 && subject.blueprint.slots?.length === 5 &&
        same(subject.blueprint.profile, plan.profile) && same(subject.blueprint.calibration, plan.calibration),
      'Materia, perfil o Blueprint incoherentes en el plan.');
      subjects.set(subject.id, subject);
    }
    const ids = new Set();
    for(const item of plan.slots){
      const slot = item.blueprintSlot;
      const subject = subjects.get(item.subject);
      assert(subject && slot && item.groupId === subject.groupId && slot.subject === item.subject &&
        item.slotId === slot.slotId && text(slot.slotId) && Number.isInteger(slot.index) && slot.index >= 0 && slot.index < 5 &&
        same(slot, subject.blueprint.slots[slot.index]) &&
        item.id === `v25:${encodeURIComponent(item.subject)}:${encodeURIComponent(slot.slotId)}` && !ids.has(item.id),
      'La identidad compuesta del slot no coincide con su Blueprint.');
      assert(Number.isInteger(slot.difficulty?.level) && slot.difficulty.level >= 1 && slot.difficulty.level <= 5 &&
        slot.locked?.difficulty === true && slot.locked?.interactionType === true && slot.locked?.requestedSourceType === true &&
        slot.source && text(slot.sourceType) && text(slot.requestedSourceType) && Array.isArray(slot.syllabusCodes),
      'El slot perdió dificultad bloqueada o trazabilidad.');
      assert(FORMATS.includes(slot.interactionType) && window.NOA_BATCH_ORCHESTRATOR?.supportedTypes?.includes(slot.interactionType),
        `Formato no soportado en el plan: ${slot.interactionType}`);
      ids.add(item.id);
    }
    for(const subject of subjects.values()){
      const slots = plan.slots.filter(item => item.subject === subject.id);
      assert(slots.length === 5 && new Set(slots.map(item => item.blueprintSlot.index)).size === 5,
        'Cada materia debe contener cinco posiciones diferentes.');
    }
    assert(new Set(plan.groups.map(group => group.id)).size === 3, 'Los grupos académicos están repetidos.');
    for(const group of plan.groups){
      const assigned = plan.subjects.filter(subject => subject.groupId === group.id).map(subject => subject.id).sort();
      assert(group.requiredCount === GROUP_COUNTS[group.id] &&
        same([...group.subjectIds].sort(), assigned) && plan.slots.filter(item => item.groupId === group.id).length === group.requiredCount,
      'La distribución académica debe ser 10/20/15.');
    }
  }

  function validateLocked(slot, original){
    for(const field of ['subject', 'index', 'slotId', 'difficulty', 'calibratorDifficulty',
      'interactionType', 'requestedSourceType', 'locked']){
      assert(same(slot?.[field], original[field]), `La reposición cambió el campo bloqueado ${field}.`);
    }
    assert(slot.source && text(slot.sourceType) && Array.isArray(slot.syllabusCodes), 'La reposición perdió su fuente.');
  }

  function validateRenderable(question){
    let valid = false;
    switch(question.interactionType){
      case 'single_select':
        valid = text(question.text) && optionsValid(question);
        break;
      case 'drag_classify':
        valid = typeof window.NOA_DRAG_RENDERER?.open === 'function' && text(question.instruction) &&
          keyed(question.targets) && question.targets.every(target => text(target.label)) && keyed(question.elements) &&
          question.elements.every(item => text(item.text) && question.targets.some(target => target.id === item.correctTargetId)) &&
          (!question.correctResponse || question.elements.every(item => question.correctResponse[item.id] === item.correctTargetId));
        break;
      case 'inline_select': {
        const placeholders = [...String(question.text || '').matchAll(/\[\[([^\]]+)\]\]/g)].map(match => match[1]);
        valid = typeof window.NOA_INLINE_RENDERER?.open === 'function' && text(question.text) && keyed(question.blanks) &&
          question.blanks.every(optionsValid) && placeholders.length === question.blanks.length &&
          new Set(placeholders).size === placeholders.length && question.blanks.every(blank => placeholders.includes(blank.id));
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
    assert(valid, 'El reactivo no puede renderizarse con su formato y respuestas.');
  }

  function validateResult(result, current, item){
    const question = result?.question;
    assert(question?.accepted === true && question.judge && typeof question.judge === 'object', 'Judge no aprobó el reactivo.');
    assert(same(result.slot, current) && same(question.blueprintSlot, current), 'Generator cambió el slot o su Blueprint.');
    for(const field of ['slotId', 'interactionType', 'sourceType', 'requestedSourceType']){
      assert(question[field] === current[field], `El reactivo cambió ${field}.`);
    }
    assert(text(question.id) && question.difficulty === current.difficulty.level &&
      (question.blueprint === undefined || question.blueprint?.difficulty === current.difficulty.level),
    'El reactivo perdió identidad o dificultad.');
    assert((question.subject === undefined || question.subject === item.subject) &&
      (question.planSlotId === undefined || question.planSlotId === item.id) &&
      (question.groupId === undefined || question.groupId === item.groupId), 'El reactivo cambió de posición o materia.');
    assert(question.sourceTrace === undefined || same(question.sourceTrace, current.source), 'La trazabilidad no coincide con la fuente.');
    assert(question.syllabusCode === undefined || question.syllabusCode === '' || current.syllabusCodes.includes(question.syllabusCode),
      'El código del reactivo no pertenece al slot.');
    assert(question.syllabusCodes === undefined || same(question.syllabusCodes, current.syllabusCodes), 'Cambió el temario del slot.');
    validateRenderable(question);
    return {...clone(question), subject:item.subject, groupId:item.groupId, planSlotId:item.id,
      sourceTrace:clone(current.source), syllabusCode:question.syllabusCode ?? current.syllabusCodes[0] ?? '',
      syllabusCodes:clone(current.syllabusCodes)};
  }

  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\u2212/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
    .replace(/([+\-*/=<>^%])/g, ' $1 ').replace(/[^\p{L}\p{N}+\-*/=<>^%]+/gu, ' ').trim();
  const normalizedList = values => values.map(norm).sort();
  function questionKey(question){
    const content = {format:question.interactionType, instruction:norm(question.instruction),
      text:norm(question.text), stem:norm(question.stem)};
    if(question.interactionType === 'single_select'){
      // Una instrucción genérica distinta no convierte el mismo reactivo en otro.
      delete content.instruction;
      content.options = normalizedList(question.options);
    }
    if(question.interactionType === 'drag_classify'){
      content.elements = normalizedList(question.elements.map(item => item.text));
      content.targets = normalizedList(question.targets.map(item => item.label));
    }
    if(question.interactionType === 'inline_select'){
      delete content.instruction;
      const blanks = new Map(question.blanks.map(blank => [blank.id, blank]));
      const ordered = [];
      content.text = norm(question.text.replace(/\[\[([^\]]+)\]\]/g, (_, id) => {
        ordered.push(normalizedList(blanks.get(id).options));
        return ' espacio ';
      }));
      content.blanks = ordered;
    }
    if(question.interactionType === 'drag_order') content.items = normalizedList(question.items.map(item => item.text));
    return stable(content);
  }

  async function generate({plan, concurrency = 2, maxAttempts = 2, onProgress} = {}){
    assert(!active, 'Ya existe una generación multibatch activa.');
    const snapshot = clone(plan || null);
    validatePlan(snapshot);
    const parallel = limit(concurrency, 2), attempts = limit(maxAttempts, 2);
    const generated = [], failures = [], duplicates = [], replacements = [], fallbacks = [], progressErrors = [];
    const accepted = new Map(), contents = new Map(), ids = new Map();
    let processed = 0;
    let progress = Promise.resolve();
    active = true;
    function report(item, status = 'generating'){
      const event = Object.freeze({groupId:item.groupId, subject:item.subject, processed,
        accepted:accepted.size, failed:failures.filter(failure => failure.planSlotId !== null).length,
        requested:TOTAL, status});
      progress = progress.then(async () => {
        if(typeof onProgress !== 'function') return;
        try{ await onProgress(event); }catch(error){ progressErrors.push(error?.message || String(error)); }
      });
      return progress;
    }
    async function processSlot(item){
      const original = item.blueprintSlot;
      let current = original;
      const history = [];
      for(let attempt = 1; attempt <= attempts; attempt++){
        let record = null;
        try{
          if(attempt > 1){
            const next = window.NOA_SOURCE_BLUEPRINT.replaceSlot(clone(original), attempt - 1);
            validateLocked(next, original);
            replacements.push({planSlotId:item.id, attempt, reason:history.at(-1).error,
              fromSlot:clone(current), toSlot:clone(next)});
            current = next;
          }
          if(current.fallbackFrom){
            fallbacks.push({planSlotId:item.id, attempt, subject:item.subject, requestedSourceType:current.requestedSourceType,
              sourceType:current.sourceType, fallbackFrom:current.fallbackFrom, fallbackReason:current.fallbackReason,
              sourceTrace:clone(current.source)});
          }
          // Un único intento interno: este orquestador controla todo el presupuesto.
          const result = await window.NOA_BLUEPRINT_GENERATOR.generateSlot(clone(current), {maxAttempts:1});
          record = {...clone(result), planSlotId:item.id, groupId:item.groupId, subject:item.subject,
            attempt, valid:false, duplicate:false};
          generated.push(record);
          const question = validateResult(result, current, item);
          const key = questionKey(question);
          for(const [kind, seen, candidate] of [['content', contents, key], ['id', ids, question.id]]){
            if(seen.has(candidate)){
              record.duplicate = true;
              duplicates.push({planSlotId:item.id, attempt, questionId:question.id, kind, duplicateOf:seen.get(candidate)});
            }
          }
          assert(!record.duplicate, 'Reactivo duplicado globalmente por contenido o ID.');
          contents.set(key, item.id);
          ids.set(question.id, item.id);
          record.question = question;
          record.valid = true;
          accepted.set(item.id, record);
          break;
        }catch(error){
          const message = error?.message || String(error);
          history.push({attempt, error:message});
          if(record) record.validationError = message;
        }
      }
      if(!accepted.has(item.id)){
        failures.push({planSlotId:item.id, groupId:item.groupId, subject:item.subject, slotId:original.slotId,
          attempts:history.length, error:history.at(-1)?.error || 'Slot incompleto.', history});
      }
      processed++;
      await report(item);
    }
    try{
      await report(snapshot.slots[0]);
      for(const subject of snapshot.subjects){
        const batch = snapshot.slots.filter(item => item.subject === subject.id);
        let cursor = 0;
        const workers = Array.from({length:parallel}, async () => {
          while(cursor < batch.length){
            const item = batch[cursor++];
            await processSlot(item);
          }
        });
        // Drenar todos los trabajadores antes de propagar un fallo inesperado.
        const settled = await Promise.allSettled(workers);
        const rejected = settled.find(item => item.status === 'rejected');
        if(rejected) throw rejected.reason;
      }
      let complete = accepted.size === TOTAL && failures.length === 0;
      let questions = [];
      if(complete){
        try{
          const selected = snapshot.slots.map(item => accepted.get(item.id));
          const converted = window.NOA_MIXED_EXAM.questionsFromBatch({generated:clone(selected)});
          assert(Array.isArray(converted) && converted.length === TOTAL && new Set(converted.map(q => q.id)).size === TOTAL,
            'La conversión no devolvió exactamente 45 preguntas únicas.');
          converted.forEach((question, index) => {
            const item = snapshot.slots[index], expected = selected[index].question;
            validateResult({question, slot:expected.blueprintSlot}, expected.blueprintSlot, item);
            assert(question.blueprint?.difficulty === expected.difficulty &&
              question.planSlotId === item.id && question.groupId === item.groupId && question.subject === item.subject &&
              question.id === expected.id && same(question.judge, expected.judge) &&
              same(question.sourceTrace, expected.sourceTrace), 'La conversión perdió identidad, Judge o trazabilidad.');
          });
          questions = converted;
        }catch(error){
          complete = false;
          failures.push({planSlotId:null, error:error?.message || String(error), stage:'conversion'});
        }
      }
      await report(snapshot.slots.at(-1), complete ? 'complete' : 'incomplete');
      const positions = new Map(snapshot.slots.map((item, index) => [item.id, index]));
      generated.sort((a, b) => positions.get(a.planSlotId) - positions.get(b.planSlotId) || a.attempt - b.attempt);
      const groups = snapshot.groups.map(group => ({...group,
        processed:snapshot.slots.filter(item => item.groupId === group.id).length,
        accepted:[...accepted.values()].filter(item => item.groupId === group.id).length,
        failed:failures.filter(item => item.groupId === group.id).length}));
      const subjectCounts = Object.fromEntries(snapshot.subjects.map(subject => [subject.id,
        [...accepted.values()].filter(item => item.subject === subject.id).length]));
      return {requested:TOTAL, accepted:accepted.size, complete, groups, subjectCounts, generated, failures,
        duplicates, replacements, fallbacks, questions,
        summary:{requested:TOTAL, processed, generated:generated.length, accepted:accepted.size,
          failed:failures.filter(failure => failure.planSlotId !== null).length,
          conversionErrors:failures.filter(failure => failure.stage === 'conversion').length,
          duplicates:duplicates.length, replacements:replacements.length, fallbacks:fallbacks.length,
          concurrency:parallel, maxAttempts:attempts, progressErrors, complete}};
    }finally{
      await progress;
      active = false;
    }
  }

  window.NOA_MULTI_BATCH_V25 = {version:'25.1', generate};
})();
