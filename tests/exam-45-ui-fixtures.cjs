const { installMultibatchFixture } = require('./exam-multibatch-fixtures.cjs');

async function installExam45Fixture(page, configuration = {}) {
  await page.evaluate(() => {
    window.__exam45Natives = {
      plan: NOA_EXAM_PLAN_V25.build,
      blueprint: NOA_SOURCE_BLUEPRINT.build,
      start: NOA_MIXED_EXAM.start,
      multi: NOA_MULTI_BATCH_V25.generate
    };
  });
  await installMultibatchFixture(page, configuration);
  await page.evaluate(() => {
    const natives = __exam45Natives;
    const clone = value => structuredClone(value);
    const fixture = window.__exam45Fixture = {
      stats: { plans: 0, blueprints: [], multiCalls: [], starts: [], confirmations: [], progress: [] },
      callbacks: [], plan: null, result: null, lastStarted: null
    };
    NOA_SOURCE_BLUEPRINT.build = options => {
      fixture.stats.blueprints.push(clone(options));
      return natives.blueprint(options);
    };
    NOA_EXAM_PLAN_V25.build = (...args) => {
      fixture.stats.plans++;
      const plan = natives.plan(...args);
      fixture.plan = clone(plan);
      return plan;
    };
    NOA_MIXED_EXAM.start = (questions, title) => {
      fixture.stats.starts.push({ count: questions.length, title });
      fixture.lastStarted = { questions: clone(questions), title };
      return natives.start(questions, title);
    };
    // Los generadores reales no proporcionan topicId; Mixed lo resuelve por
    // código del Temario. Las nueve materias deben conservar su tema real.
    const generateSlot = NOA_BLUEPRINT_GENERATOR.generateSlot;
    NOA_BLUEPRINT_GENERATOR.generateSlot = async (...args) => {
      const result = await generateSlot(...args);
      if (result.question) delete result.question.topicId;
      return result;
    };
    NOA_MULTI_BATCH_V25.generate = async options => {
      fixture.stats.multiCalls.push({ concurrency: options.concurrency,
        maxAttempts: options.maxAttempts, total: options.plan.total });
      fixture.callbacks.push(options.onProgress);
      const result = await natives.multi({ ...options, onProgress: async progress => {
        fixture.stats.progress.push(clone(progress));
        await options.onProgress?.(progress);
      } });
      fixture.result = clone(result);
      return result;
    };
    const confirm = window.confirm;
    window.confirm = message => {
      fixture.stats.confirmations.push({ message, generatorCalls: __multiFixture.stats.calls.length });
      return confirm.call(window, message);
    };
    NOA_EXAM_UI_V25.refresh();
    NOA_GENERATOR_UI.refresh();
  });
}

async function fullExamState(page) {
  return page.evaluate(() => ({
    db: structuredClone(db), queue: structuredClone(examQueue), index: examIndex,
    score: examScore, answers: structuredClone(examAnswers),
    drafts: structuredClone([...NOA_EXAM_NAVIGATION.drafts.entries()]),
    revision: NOA_ANSWER_REVISION.capture(), calibration: NOA_CALIBRATOR.get(),
    storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))
  }));
}

async function waitDraftCheckpoint(page) {
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved?.activeExam?.revision?.editor?.assignments?.two === 'odd';
  });
}

async function beginDeferred45(page) {
  await page.evaluate(() => { window.__exam45Promise = NOA_EXAM_UI_V25.generate(); });
  await page.waitForFunction(() => !!window.__multiFixture?.release);
}

async function release45(page) {
  await page.evaluate(() => __multiFixture.release());
}

module.exports = { installExam45Fixture, fullExamState, waitDraftCheckpoint, beginDeferred45, release45 };
