const { questions } = require('./fixtures.cjs');

// El plan y replaceSlot son reales. Solo Generator/Judge se sustituyen por
// respuestas sintéticas; ningún formato se reescribe después de bloquearlo.
async function installMultibatchFixture(page, configuration = {}) {
  await page.evaluate(({ templates, configuration }) => {
    const clone = value => structuredClone(value);
    if (configuration.course) {
      document.getElementById('excobaTrainingProfile').value = 'course';
      db.settings.noaTrainingProfile = 'course';
      db.courseSources = configuration.readyCourse ? NOA_EXCOBA_V4.subjects.map((subject, index) => ({
        id: `synthetic-course-${index}`, subject: subject.value, title: 'Fuente sintética aislada',
        content: 'Material determinista de prueba.', analysisStatus: 'ready',
        analysis: { syllabus_links: [{ code: subject.prefixes[0] + '1' }], concepts: [] }
      })) : [];
    }
    const plan = NOA_EXAM_PLAN_V25.build();
    const orderedFormats = ['single_select', 'drag_classify', 'inline_select', 'drag_order'];
    const pairs = Object.fromEntries(orderedFormats.map(type => {
      const origin = plan.slots.findIndex(entry => entry.blueprintSlot.interactionType === type);
      const target = plan.slots.findIndex(entry => entry.blueprintSlot.interactionType === type &&
        entry.subject !== plan.slots[origin]?.subject);
      return [type, { origin, target }];
    }));
    if (configuration.format) {
      configuration.origin ??= pairs[configuration.format].origin;
      configuration.target ??= pairs[configuration.format].target;
    }
    // La estructura y los flags siguen siendo coherentes: el orquestador debe
    // rechazar el formato incompatible por su propia validación estricta.
    const invalidPlan = clone(plan);
    const invalidSlot = invalidPlan.slots[0].blueprintSlot;
    invalidSlot.interactionType = 'numeric_input';
    invalidPlan.subjects.find(subject => subject.id === invalidSlot.subject)
      .blueprint.slots[invalidSlot.index] = invalidSlot;
    const stats = { calls: [], replaceCalls: [], events: [], active: 0, maxActive: 0,
      forbidden: { ai: 0, fetch: 0, batch: 0, blueprint: 0, planner: 0, exam: 0 } };
    const state = window.__multiFixture = { plan, invalidPlan, pairs, config: configuration, stats, progress: [], result: null };
    const forbidden = key => () => { stats.forbidden[key]++; throw new Error(`Llamada prohibida: ${key}`); };
    window.callAI = forbidden('ai');
    window.fetch = forbidden('fetch');
    NOA_BATCH_ORCHESTRATOR.generate = forbidden('batch');
    NOA_SOURCE_BLUEPRINT.build = forbidden('blueprint');
    NOA_EXAM_PLAN_V25.build = forbidden('planner');
    state.nativeStart = NOA_MIXED_EXAM.start;
    NOA_MIXED_EXAM.start = forbidden('exam');
    const originalReplace = NOA_SOURCE_BLUEPRINT.replaceSlot;
    NOA_SOURCE_BLUEPRINT.replaceSlot = (slot, attempt) => {
      const replacement = originalReplace(slot, attempt);
      const key = state.config.replacementMutation;
      if (key === 'difficulty') replacement.difficulty.level = replacement.difficulty.level === 5 ? 4 : 5;
      if (key === 'calibratorDifficulty') replacement.calibratorDifficulty = 5;
      if (key === 'subject') replacement.subject = 'Materia falsa';
      if (key === 'slotId') replacement.slotId = 'otro-slot';
      if (key === 'index') replacement.index++;
      if (key === 'interactionType') replacement.interactionType = 'drag_order';
      if (key === 'requestedSourceType') replacement.requestedSourceType = 'course';
      if (key === 'locked') replacement.locked.difficulty = false;
      stats.replaceCalls.push({ slot: clone(slot), attempt, replacement: clone(replacement) });
      return replacement;
    };

    function content(slot, token) {
      const template = clone(templates.find(item => item.interactionType === slot.interactionType));
      const suffix = ` [contenido ${token}]`;
      if (template.text) template.text += suffix;
      if (template.stem) template.stem += suffix;
      if (template.instruction) template.instruction += suffix;
      if (template.options) template.options = template.options.map(option => option + suffix);
      for (const item of template.elements || []) item.text += suffix;
      for (const item of template.targets || []) item.label += suffix;
      for (const item of template.items || []) item.text += suffix;
      for (const blank of template.blanks || []) blank.options = blank.options.map(option => option + suffix);
      return template;
    }
    function questionFor(slot, entry, token) {
      const question = content(slot, token);
      delete question.blueprint;
      Object.assign(question, {
        id: `synthetic-${entry.id}-${slot.variant || 0}`,
        slotId: slot.slotId, difficulty: slot.difficulty.level, blueprintSlot: clone(slot),
        sourceType: slot.sourceType, requestedSourceType: slot.requestedSourceType,
        sourceTrace: clone(slot.source), syllabusCode: slot.syllabusCodes[0] || '',
        syllabusCodes: clone(slot.syllabusCodes),
        judge: { qualityScore: 10, comments: 'Judge sintético interno; no certificación oficial.' }, accepted: true
      });
      if (question.elements) question.correctResponse = Object.fromEntries(question.elements.map(item => [item.id, item.correctTargetId]));
      return question;
    }
    NOA_BLUEPRINT_GENERATOR.generateSlot = async (slot, options) => {
      const entry = plan.slots.find(item => item.subject === slot.subject && item.slotId === slot.slotId);
      if (!entry) throw new Error('Generator recibió un slot ajeno al plan');
      const position = plan.slots.indexOf(entry), config = state.config;
      const occurrence = stats.calls.filter(call => call.planSlotId === entry.id).length + 1;
      stats.active++;
      stats.maxActive = Math.max(stats.maxActive, stats.active);
      stats.calls.push({ planSlotId: entry.id, subject: slot.subject, slot: clone(slot), options: clone(options), occurrence });
      stats.events.push({ kind: 'start', position, subject: slot.subject, active: stats.active });
      try {
        if (config.deferred && !state.release) await new Promise(resolve => { state.release = resolve; });
        await new Promise(resolve => setTimeout(resolve, config.delay ?? 1));
        const target = config.target ?? 0;
        const affected = config.all || position === target;
        const failing = affected && (config.always || occurrence === 1);
        if (failing && config.mode === 'error') throw new Error('Fallo sintético de Generator');
        const token = `${position}-v${slot.variant || 0}`;
        let question = questionFor(slot, entry, token);
        if (failing && config.mode === 'reject') question.accepted = false;
        if (failing && config.mode === 'duplicate') {
          const origin = plan.slots[config.origin ?? 0];
          question = { ...content(origin.blueprintSlot, `${config.origin ?? 0}-v0`), ...Object.fromEntries(
            Object.entries(question).filter(([key]) => !['text', 'stem', 'instruction', 'options', 'elements', 'targets', 'blanks', 'items', 'correctOrder'].includes(key))
          ) };
          delete question.blueprint;
          if (question.elements) question.correctResponse = Object.fromEntries(question.elements.map(item => [item.id, item.correctTargetId]));
          if (config.normalizeDuplicate) {
            const normalize = value => `  ${value.toUpperCase().replace(/ /g, '   ')}  `;
            for (const key of ['text', 'stem', 'instruction']) if (question[key]) question[key] = normalize(question[key]);
            if (question.options) question.options = question.options.map(normalize);
            for (const item of question.elements || []) item.text = normalize(item.text);
            for (const item of question.targets || []) item.label = normalize(item.label);
            for (const item of question.items || []) item.text = normalize(item.text);
            for (const item of question.blanks || []) item.options = item.options.map(normalize);
            for (const blank of question.blanks || []) {
              question.text = question.text.replaceAll(`[[${blank.id.toUpperCase()}]]`, `[[${blank.id}]]`);
            }
          }
          if (config.renameBlanks && question.blanks) {
            for (const blank of question.blanks) {
              const newId = `renamed-${blank.id}`;
              question.text = question.text.replaceAll(`[[${blank.id}]]`, `[[${newId}]]`);
              blank.id = newId;
            }
          }
        }
        if (failing && config.mode === 'id') question.id = `synthetic-${plan.slots[config.origin ?? 0].id}-0`;
        if (failing && config.mode === 'metadata') {
          if (config.field === 'subject') question.subject = 'Materia falsa';
          if (config.field === 'slotId') question.slotId = 'slot-inventado';
          if (config.field === 'difficulty') question.difficulty = 5;
          if (config.field === 'interactionType') question.interactionType = 'drag_order';
          if (config.field === 'requestedSourceType') question.requestedSourceType = 'course';
          if (config.field === 'sourceType') question.sourceType = 'course';
          if (config.field === 'blueprintSlot') question.blueprintSlot.index++;
          if (config.field === 'judge') delete question.judge;
          if (config.field === 'render') {
            const field = { single_select: 'options', drag_classify: 'elements', inline_select: 'blanks', drag_order: 'items' }[slot.interactionType];
            delete question[field];
          }
        }
        if (config.omitTrace && ['inline_select', 'drag_order'].includes(slot.interactionType)) {
          delete question.sourceTrace;
          delete question.syllabusCode;
        }
        return { slot: clone(slot), question, attempts: 1 };
      } finally {
        stats.active--;
        stats.events.push({ kind: 'finish', position, subject: slot.subject, active: stats.active });
      }
    };
  }, { templates: questions, configuration });
}

async function runMultibatch(page, options = {}) {
  return page.evaluate(async options => {
    const fixture = window.__multiFixture;
    fixture.result = await NOA_MULTI_BATCH_V25.generate({
      plan: fixture.plan, concurrency: 2, maxAttempts: 2, ...options,
      onProgress: async progress => { fixture.progress.push(structuredClone(progress)); }
    });
    return { result: fixture.result, plan: fixture.plan, stats: fixture.stats, progress: fixture.progress };
  }, options);
}

module.exports = { installMultibatchFixture, runMultibatch };
