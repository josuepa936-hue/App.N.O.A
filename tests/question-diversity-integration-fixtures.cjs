const { openGenerator } = require('./generator-fixtures.cjs');
const { questions, answer, navigate } = require('./fixtures.cjs');

const biology = 'EXCOBA Medicina · Biología';
const formats = ['single_select', 'drag_classify', 'inline_select', 'drag_order'];

async function openDiversity(page) {
  await openGenerator(page);
  await page.clock.setFixedTime(new Date('2026-02-10T12:00:00.000Z'));
  await page.evaluate(subject => {
    db.masterSyllabus.items = NOA_EXCOBA_FIX_V5.items.map(item => ({ ...item }));
    db.settings.noaTrainingProfile = 'official';
    document.getElementById('excobaTrainingProfile').value = 'official';
    db.courseSources = [];
    db.attempts = [];
    save();
    NOA_GENERATOR_UI.refresh();
    NOA_EXAM_UI_V25.refresh();
    document.getElementById('noaGeneratorSubject').value = subject;
  }, biology);
}

// Blueprint, Batch, Multibatch, memory, conversion and the exam remain real.
// The synthetic Generator result includes its Judge approval and full trace.
async function installDiversity(page, configuration = {}) {
  await page.evaluate(({ templates, configuration }) => {
    const clone = value => structuredClone(value);
    const state = window.__diversityFixture = {
      config: configuration, calls: [], contains: [], builds: [], plans: [], batches: [], multis: [],
      replacements: [], starts: [], writes: [], progress: [], events: [],
      forbidden: { ai: 0, fetch: 0 }, native: {}, barrierWaits: [], barrierReleased: false
    };
    const memory = NOA_QUESTION_MEMORY_V25_2;
    const native = state.native;
    native.contains = memory.contains.bind(memory);
    native.recordExam = memory.recordExam.bind(memory);
    native.stats = memory.stats.bind(memory);
    native.fingerprint = memory.fingerprint.bind(memory);
    native.batch = NOA_BATCH_ORCHESTRATOR.generate;
    native.multi = NOA_MULTI_BATCH_V25.generate;
    native.blueprint = NOA_SOURCE_BLUEPRINT.build;
    native.plan = NOA_EXAM_PLAN_V25.build;
    native.replace = NOA_SOURCE_BLUEPRINT.replaceSlot;
    native.start = NOA_MIXED_EXAM.start;
    native.getItem = Storage.prototype.getItem;
    native.statsReads = 0;
    window.callAI = () => { state.forbidden.ai++; throw new Error('No IA real en la prueba'); };
    window.fetch = () => { state.forbidden.fetch++; throw new Error('No red durante la generación sintética'); };
    memory.stats = function(...args) { native.statsReads++; return native.stats(...args); };
    memory.recordExam = async function(...args) {
      state.writes.push({ session: args[1], count: args[0]?.length });
      return native.recordExam(...args);
    };
    memory.contains = async function(...args) {
      const question = args[0];
      const record = { accepted: question?.accepted, judge: !!question?.judge,
        type: question?.interactionType, slotId: question?.slotId, options: clone(args[1] ?? null) };
      state.contains.push(record);
      state.events.push({ event: 'contains', accepted: question?.accepted, slotId: question?.slotId });
      if (state.config.memoryMode === 'throw') throw new Error('Fallo sintético del lector histórico');
      if (state.config.memoryMode === 'invalid_result') return false;
      let transient = false;
      if (state.config.memoryMode === 'transient_storage') {
        Storage.prototype.getItem = function(key) {
          if (key === memory.storageKey) throw new Error('Almacenamiento sintético no disponible');
          return native.getItem.call(this, key);
        };
        transient = true;
      }
      let result;
      try { result = await native.contains(...args); }
      finally { if (transient) Storage.prototype.getItem = native.getItem; }
      if (state.config.memoryMode === 'corrupt_during_contains') {
        localStorage.setItem(memory.storageKey, '{corrupt-during-contains');
      }
      record.result = clone(result);
      if (state.config.deferHistory) await new Promise(resolve => {
        state.releaseHistory = resolve;
      });
      if (state.config.barrier && question.interactionType === state.config.barrierFormat && !state.barrierReleased) {
        await new Promise(resolve => {
          state.barrierWaits.push(resolve);
          if (state.barrierWaits.length === 2) {
            state.barrierReleased = true;
            state.barrierWaits.splice(0).forEach(release => release());
          }
        });
      }
      return result;
    };
    NOA_SOURCE_BLUEPRINT.build = options => {
      state.builds.push(clone(options));
      return native.blueprint(options);
    };
    NOA_EXAM_PLAN_V25.build = options => {
      const plan = native.plan(options);
      state.plans.push(clone(plan));
      return plan;
    };
    NOA_SOURCE_BLUEPRINT.replaceSlot = (...args) => {
      const result = native.replace(...args);
      state.replacements.push({ original: clone(args[0]), attempt: args[1], result: clone(result) });
      return result;
    };
    NOA_BATCH_ORCHESTRATOR.generate = async options => {
      const record = { options: Object.fromEntries(Object.entries(options).filter(([, value]) => typeof value !== 'function')) };
      state.batches.push(record);
      record.result = await native.batch(options);
      return record.result;
    };
    NOA_MULTI_BATCH_V25.generate = async options => {
      const record = { options: Object.fromEntries(Object.entries(options).filter(([, value]) => typeof value !== 'function')) };
      state.multis.push(record);
      record.result = await native.multi({ ...options, onProgress: async event => {
        state.progress.push(clone(event));
        await options.onProgress?.(event);
      } });
      return record.result;
    };
    NOA_MIXED_EXAM.start = (queue, title) => {
      state.starts.push({ count: queue.length, title, questions: clone(queue) });
      return native.start(queue, title);
    };
    state.content = (slot, token) => {
      const question = clone(templates.find(item => item.interactionType === slot.interactionType));
      const suffix = ' [fixture ' + token + ']';
      if (question.text) question.text += suffix;
      if (question.stem) question.stem += suffix;
      // The academic concept and answer stay the same; the statement changes.
      return question;
    };
    state.attach = (slot, content, idSuffix = '') => {
      const question = clone(content);
      delete question.blueprint;
      delete question.topicId;
      Object.assign(question, {
        id: 'diversity:' + slot.subject + ':' + slot.slotId + ':' + (slot.variant || 0) + idSuffix,
        subject: slot.subject, slotId: slot.slotId, difficulty: slot.difficulty.level,
        blueprintSlot: clone(slot), sourceType: slot.sourceType, requestedSourceType: slot.requestedSourceType,
        sourceTrace: clone(slot.source), syllabusCode: slot.syllabusCodes[0] || '', syllabusCodes: clone(slot.syllabusCodes),
        judge: { qualityScore: 9.5, accepted: true, comments: 'Evaluación interna sintética.' }, accepted: true
      });
      if (question.elements) question.correctResponse = Object.fromEntries(
        question.elements.map(item => [item.id, item.correctTargetId]));
      return question;
    };
    state.preview = (slot, token = 'recorded') => state.attach(slot, state.content(slot, token), ':seed');
    NOA_BLUEPRINT_GENERATOR.generateSlot = async (slot, options) => {
      const config = state.config, key = slot.subject + '|' + slot.slotId;
      const occurrence = state.calls.filter(call => call.key === key && call.phase === (config.phase || 'A')).length + 1;
      const call = { key, phase: config.phase || 'A', occurrence, slot: clone(slot), options: clone(options) };
      state.calls.push(call);
      state.events.push({ event: 'generator', slotId: slot.slotId, occurrence });
      const affected = (!config.targetSubject || slot.subject === config.targetSubject) &&
        (config.all || (config.targetIndex === undefined ? slot.index === 0 : slot.index === config.targetIndex));
      const failing = affected && (config.always || occurrence === 1);
      if (failing && config.mode === 'generator_error') throw new Error('Fallo sintético de Generator/Judge');
      const token = config.mode === 'internal_first' && occurrence === 1
        ? 'shared-' + slot.interactionType
        : (config.phase || 'A') + ':' + slot.subject + ':' + slot.slotId + ':' + (slot.variant || 0);
      let content = state.content(slot, token);
      if (config.statement && slot.interactionType === 'single_select') content.text = config.statement;
      if (failing && ['historical_first', 'historical_always'].includes(config.mode)) {
        content = config.history?.find(question => question.interactionType === slot.interactionType) || config.history?.[0];
        if (!content || content.interactionType !== slot.interactionType) throw new Error('Fixture histórica incompatible con el slot');
      }
      const question = state.attach(slot, content);
      if (failing && config.visualOrder && question.options) {
        const answer = question.options[question.correct];
        question.options.reverse();
        question.correct = question.options.indexOf(answer);
      }
      if (failing && config.mode === 'reject_all') question.accepted = false;
      call.question = clone(question);
      return { slot: clone(slot), question, attempts: 1 };
    };
  }, { templates: questions, configuration });
}

async function batch(page, overrides = {}) {
  return page.evaluate(options => NOA_BATCH_ORCHESTRATOR.generate(options), {
    subject: biology, blueprintCount: 5, limit: 5, concurrency: 2, maxAttempts: 2,
    diversifyTopics: true, avoidHistoryDuplicates: true, ...overrides
  });
}

async function multi(page, overrides = {}) {
  return page.evaluate(options => NOA_MULTI_BATCH_V25.generate({
    plan: NOA_EXAM_PLAN_V25.build({ diversifyTopics: true }), concurrency: 2, maxAttempts: 2,
    avoidHistoryDuplicates: true, ...options
  }), overrides);
}

async function fixture(page) {
  const serialized = await page.evaluate(() => {
    const state = __diversityFixture;
    return JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key]) =>
      !['native', 'content', 'attach', 'preview', 'barrierWaits', 'releaseHistory'].includes(key))));
  });
  return JSON.parse(serialized);
}

async function seedHistorical(page, { type = 'single_select', count = 1, session = 'historical-fixture', token = 'recorded' } = {}) {
  return page.evaluate(async ({ type, count, session, token, subject }) => {
    const state = __diversityFixture;
    const plan = state.native.blueprint({ subject, count: Math.max(count, 5), supportedInteractionTypes: [type], diversifyTopics: true });
    const questions = plan.slots.slice(0, count).map(slot => state.preview(slot, token + '-' + slot.index));
    const result = await NOA_QUESTION_MEMORY_V25_2.recordExam(questions, session, { seenAt: '2026-02-01T12:00:00.000Z' });
    if (!result.ok) throw new Error('Memoria sintética no registrada: ' + result.error);
    return questions;
  }, { type, count, session, token, subject: biology });
}

async function academicState(page) {
  return page.evaluate(() => ({
    queue: structuredClone(examQueue), index: examIndex, score: examScore, answers: structuredClone(examAnswers),
    drafts: structuredClone([...NOA_EXAM_NAVIGATION.drafts.entries()]), revision: NOA_ANSWER_REVISION.capture(),
    attempts: structuredClone(db.attempts), topics: structuredClone(db.topics), calibration: NOA_CALIBRATOR.get(),
    storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))
  }));
}

async function rawMemory(page) {
  return page.evaluate(() => localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey));
}

async function completeExam(page, queue, partialIndex = -1) {
  for (let index = 0; index < queue.length; index++) {
    await navigate(page, index);
    await answer(page, queue[index], index === partialIndex ? 'partial' : 'full');
    await page.waitForFunction(expected => examAnswers.length === expected, index + 1);
  }
}

module.exports = { biology, formats, openDiversity, installDiversity, batch, multi, fixture,
  seedHistorical, academicState, rawMemory, completeExam };
