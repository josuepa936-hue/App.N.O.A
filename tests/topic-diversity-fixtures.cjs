const { openGenerator } = require('./generator-fixtures.cjs');

const biology = 'EXCOBA Medicina · Biología';
const chemistry = 'EXCOBA Medicina · Química';
const supported = ['single_select', 'drag_classify', 'inline_select', 'drag_order'];
const dates = ['2026-01-01T12:00:00.000Z', '2026-01-02T12:00:00.000Z', '2026-01-03T12:00:00.000Z'];

async function guardPlanning(page) {
  await page.evaluate(() => {
    const fixture = window.__topicFixture ||= { calls: { ai: 0, fetch: 0, batch: 0, generator: 0, multi: 0, exam: 0 }, captures: [] };
    fixture.nativeStart ||= NOA_MIXED_EXAM.start;
    fixture.nativeMemory ||= NOA_QUESTION_MEMORY_V25_2;
    const forbidden = key => () => { fixture.calls[key]++; throw new Error('Llamada prohibida durante planificación: ' + key); };
    window.callAI = forbidden('ai');
    window.fetch = forbidden('fetch');
    NOA_BATCH_ORCHESTRATOR.generate = forbidden('batch');
    NOA_BLUEPRINT_GENERATOR.generateSlot = forbidden('generator');
    NOA_MULTI_BATCH_V25.generate = forbidden('multi');
    NOA_MIXED_EXAM.start = forbidden('exam');
  });
}

async function openTopics(page) {
  await openGenerator(page);
  await page.clock.setFixedTime(new Date('2026-01-10T12:00:00.000Z'));
  await page.evaluate(() => {
    const definitions = NOA_EXCOBA_V4.subjects;
    db.masterSyllabus.items = definitions.flatMap(subject => NOA_EXCOBA_FIX_V5.items
      .filter(item => item.subject === subject.value).slice(0, 8).map(item => ({ ...item })));
    db.settings.noaTrainingProfile = 'official';
    document.getElementById('excobaTrainingProfile').value = 'official';
    db.courseSources = [];
    db.attempts = [];
    save();
  });
  await guardPlanning(page);
}

async function catalog(page, subject = biology) {
  return page.evaluate(subject => structuredClone(NOA_EXCOBA_V4.itemsFor(subject)), subject);
}

async function limitCatalog(page, subject, count) {
  await page.evaluate(({ subject, count }) => {
    let used = 0;
    db.masterSyllabus.items = db.masterSyllabus.items.filter(item => item.subject !== subject || used++ < count);
  }, { subject, count });
}

async function profile(page, key) {
  await page.evaluate(key => {
    db.settings.noaTrainingProfile = key;
    document.getElementById('excobaTrainingProfile').value = key;
  }, key);
}

async function expose(page, { subject = biology, index = 0, variant = 'same', session, at = dates[0], questionCount = 1 }) {
  return page.evaluate(async ({ subject, index, variant, session, at, questionCount }) => {
    const item = NOA_EXCOBA_V4.itemsFor(subject)[index];
    if (!item) throw new Error('No existe el punto real de la fixture');
    const questions = Array.from({ length: questionCount }, (_, position) => ({
      id: `topic-history-${item.code}-${variant}-${position}`,
      subject, syllabusCode: item.code, interactionType: 'single_select', difficulty: 3, sourceType: 'official',
      instruction: 'Selecciona la opción correcta.',
      text: `Pregunta sintética ${item.code}, variante ${variant}-${position}: ¿cuánto es 2 + 2?`,
      options: ['4', '5', '6', '7'], correct: 0,
      explain: 'Fixture para registrar exposición; no certifica la calidad académica del tema.'
    }));
    const result = await NOA_QUESTION_MEMORY_V25_2.recordExam(questions, session, { seenAt: at });
    if (!result.ok) throw new Error('No se registró el historial sintético: ' + result.error);
    return { result, code: item.code };
  }, { subject, index, variant, session, at, questionCount });
}

async function seedRanking(page, subject = biology) {
  await expose(page, { subject, index: 0, session: 'topic-zero-old', at: dates[0] });
  await expose(page, { subject, index: 0, session: 'topic-zero-again', at: dates[1] });
  await expose(page, { subject, index: 1, session: 'topic-one-old', at: dates[0] });
  await expose(page, { subject, index: 2, session: 'topic-two-recent', at: dates[2] });
}

async function build(page, options = {}) {
  return page.evaluate(options => NOA_SOURCE_BLUEPRINT.build(options), { subject: biology, count: 5, diversifyTopics: true, ...options });
}

function codes(blueprint) { return blueprint.slots.map(slot => slot.syllabusCodes[0] ?? null); }

async function state(page) {
  return page.evaluate(() => ({
    db: structuredClone(db), queue: structuredClone(examQueue), index: examIndex, score: examScore,
    answers: structuredClone(examAnswers), drafts: structuredClone([...NOA_EXAM_NAVIGATION.drafts.entries()]),
    revision: NOA_ANSWER_REVISION.capture(), calibration: NOA_CALIBRATOR.get(),
    storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))
  }));
}

async function courses(page, { subject = biology, coded = true } = {}) {
  return page.evaluate(({ subject, coded }) => {
    const items = NOA_EXCOBA_V4.itemsFor(subject);
    db.courseSources = [0, 1].map(index => ({
      id: 'synthetic-course-' + index, subject, title: 'Material sintético ' + index,
      content: 'Contenido académico sintético y local ' + index + '.', analysisStatus: 'ready',
      analysis: { overall_classification: coded ? 'official_aligned' : 'course_only', estimated_depth: 'intermediate',
        concepts: [], syllabus_links: coded ? [{ code: items[index].code }] : [],
        evaluable_objectives: [{ type: 'application', objective: 'Objetivo sintético ' + index, suggested_difficulty: 3 }] }
    }));
    return structuredClone(db.courseSources);
  }, { subject, coded });
}

module.exports = { biology, chemistry, supported, dates, guardPlanning, openTopics, catalog, limitCatalog, profile,
  expose, seedRanking, build, codes, state, courses };
