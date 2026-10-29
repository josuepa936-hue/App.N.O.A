const { questions, openApp, answer, navigate, assign } = require('./fixtures.cjs');
const mathSubject = 'EXCOBA Secundaria · Matemáticas';

async function masterSubjects(page, limit = 9) {
  return page.evaluate(limit => {
    const definitions = NOA_EXCOBA_V4.subjects.slice(0, limit);
    db.masterSyllabus = {
      id: 'uaq-excoba-2026-2-medicina',
      items: definitions.map(subject => ({ subject: subject.value, code: subject.prefixes[0] + '1',
        title: 'Punto determinista de prueba', focus: 'Fixture aislada', page: 1 }))
    };
    save(); return definitions;
  }, limit);
}

async function openGenerator(page) {
  await openApp(page);
  await page.waitForFunction(() => window.NOA_GENERATOR_UI && window.NOA_EXCOBA_FIX_V5);
  await page.evaluate(() => {
    db = blank();
    db.subjects = NOA_EXCOBA_V4.subjects.map((subject, index) => ({
      id: subject.value === 'EXCOBA Secundaria · Matemáticas' ? 'test-subject' : `subject-${index}`, name: subject.value
    }));
    db.topics = db.subjects.map((subject, index) => ({
      id: subject.id === 'test-subject' ? 'test-topic' : `topic-${index}`, subjectId: subject.id,
      name: 'Tema sintético ' + index, syllabusCode: NOA_EXCOBA_V4.subjects[index].prefixes[0] + '1', attempts: 0, correct: 0
    }));
    save();
  });
  await masterSubjects(page);
  await page.locator('#nav button[data-page="exam"]').click();
  await page.locator('#noaGeneratorSubject').selectOption(mathSubject);
}

async function examState(page, topicIds) {
  return page.evaluate(ids => ({
    queue: examQueue, index: examIndex, score: examScore, answers: examAnswers,
    drafts: Array.from(NOA_EXAM_NAVIGATION.drafts.entries()), revision: NOA_ANSWER_REVISION.capture(), attempts: db.attempts,
    topics: db.topics.filter(topic => !ids || ids.includes(topic.id)).map(topic => ({ id: topic.id, attempts: topic.attempts, correct: topic.correct }))
  }), topicIds);
}

async function activeSession(page) {
  await page.evaluate(q => NOA_MIXED_EXAM.start(q, 'Examen anterior protegido'), questions);
  await answer(page, questions[0]); await navigate(page, 1); await answer(page, questions[1], 'partial');
  await page.locator('#noaRevisionEdit').click(); await assign(page, 'two', 'odd');
  return examState(page);
}

// Batch es el único motor sustituido. Blueprint, conversión, renderers,
// puntuación, revisión y recuperación permanecen reales.
async function mockBatch(page, mode = 'complete') {
  await page.evaluate(({ fixtures, mode }) => {
    window.__batchCalls = []; window.__batchPending = null; window.__generatorEvents = [];
    window.__nativeGeneratorConfirm ||= window.confirm;
    window.confirm = message => { window.__generatorEvents.push('confirm'); return window.__nativeGeneratorConfirm(message); };
    window.__buildGeneratorBatch = opts => {
      const blueprint = NOA_SOURCE_BLUEPRINT.build({ subject: opts.subject, count: opts.blueprintCount });
      const topic = db.topics.find(topic => subjectBy(topic.subjectId)?.name === opts.subject);
      const generated = Array.from({ length: opts.limit }, (_, index) => {
        const template = JSON.parse(JSON.stringify(fixtures[index % fixtures.length]));
        const slot = { ...blueprint.slots[index], interactionType: template.interactionType };
        blueprint.slots[index] = slot;
        const question = { ...template, id: `generated-${window.__batchCalls.length}-${index}`,
          topicId: topic?.id || '', slotId: slot.slotId, blueprintSlot: slot,
          blueprint: { ...template.blueprint, difficulty: slot.difficulty.level }, sourceType: slot.sourceType,
          requestedSourceType: slot.requestedSourceType, sourceTrace: slot.source,
          syllabusCode: slot.syllabusCodes[0] || '', syllabusCodes: slot.syllabusCodes,
          judge: { qualityScore: 9.5, accepted: true }, accepted: true };
        if (question.elements) question.correctResponse = Object.fromEntries(question.elements.map(item => [item.id, item.correctTargetId]));
        return { slot, question, attempts: 1, duplicate: false };
      });
      const failures = [];
      if (mode === 'incomplete') {
        generated.pop(); generated[generated.length - 1].duplicate = true;
        generated[1].question.accepted = false;
        failures.push({ slotId: blueprint.slots[opts.limit - 1].slotId, error: 'Fallo sintético determinista' });
      }
      if (mode === 'rejected') generated[1].question.accepted = false;
      if (mode === 'unsupported') generated[0].question.interactionType = 'unsupported_format';
      if (mode === 'malformed') delete generated[0].question.options;
      const batch = { blueprint, generated, failures, selectedSlots: generated.map(item => item.slot), summary: {
        requested: opts.limit, generated: generated.length,
        // Como Batch real, accepted incluye los duplicados.
        accepted: generated.filter(item => item.question.accepted).length,
        duplicates: generated.filter(item => item.duplicate).length, failures: failures.length } };
      window.__lastBatch = batch; return batch;
    };
    NOA_BATCH_ORCHESTRATOR.generate = async opts => {
      window.__generatorEvents.push('batch'); window.__batchCalls.push(JSON.parse(JSON.stringify(opts)));
      if (mode === 'error') throw new Error('Servicio de IA sintético no disponible');
      const batch = window.__buildGeneratorBatch(opts);
      if (mode === 'deferred') return new Promise((resolve, reject) => { window.__batchPending = { resolve: () => resolve(batch), reject }; });
      return batch;
    };
    NOA_GENERATOR_UI.refresh();
  }, { fixtures: questions, mode });
}
module.exports = { mathSubject, masterSubjects, openGenerator, examState, activeSession, mockBatch };
