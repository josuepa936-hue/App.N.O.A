const { expect } = require('@playwright/test');
const { openApp, questions, answer, assign, orderTo } = require('./fixtures.cjs');

const START = Date.parse('2026-06-01T12:00:00.000Z');
const subject = 'EXCOBA Medicina · Biología';
const formats = ['single_select', 'drag_classify', 'inline_select', 'drag_order'];
const timedQuestions = structuredClone(questions).map((question, index) => ({
  ...question,
  id: 'timed-' + question.id,
  subject,
  syllabusCode: '3.4.1.' + (index + 1),
  difficulty: question.blueprint?.difficulty ?? 3,
  sourceType: 'official',
  requestedSourceType: 'official',
  instruction: question.instruction || 'Selecciona la respuesta correcta.',
  judge: { qualityScore: 9.5, accepted: true, comments: 'Fixture sintética local.' }
}));

async function installClock(page) {
  await page.clock.install({ time: new Date(START - 60000) });
  await page.clock.pauseAt(new Date(START));
}

async function openTimed(page) {
  await installClock(page);
  // Audio is optional in NOA and unavailable in headless Chromium. Use its
  // normal setting before load/recovery rather than suppressing console errors.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const voice = document.getElementById('speakReplies');
      if (voice) voice.checked = false;
    }, { once: true });
  });
  await openApp(page);
  await page.evaluate(({ subject, queue }) => {
    document.getElementById('speakReplies').checked = false;
    db = blank();
    db.subjects = [{ id: 'test-subject', name: subject }];
    db.topics = [{ id: 'test-topic', subjectId: 'test-subject',
      name: 'Tema sintético de cronómetro', attempts: 0, correct: 0 }];
    db.masterSyllabus = { id: 'uaq-excoba-2026-2-medicina',
      items: NOA_EXCOBA_FIX_V5.items.map(item => ({ ...item })) };
    db.questions = structuredClone(queue);
    save();
    window.__timedForbidden = { ai: 0, fetch: 0 };
    window.callAI = () => { __timedForbidden.ai++; throw new Error('IA real prohibida en cronómetro'); };
    window.fetch = () => { __timedForbidden.fetch++; throw new Error('Red prohibida en examen sintético'); };
    const memory = NOA_QUESTION_MEMORY_V25_2;
    const record = memory.recordSavedAttempt;
    window.__timedMemoryCalls = [];
    memory.recordSavedAttempt = function(attempt, queue) {
      __timedMemoryCalls.push({ id: attempt.id, count: queue.length,
        persisted: JSON.parse(localStorage.getItem(KEY) || 'null')?.attempts
          ?.some(item => item.id === attempt.id) || false });
      return record.apply(this, arguments);
    };
  }, { subject, queue: timedQuestions });
  await page.clock.runFor(200);
  await page.locator('#nav button[data-page="exam"]').click();
}

async function setTimed(page, enabled = true, minutes = 1) {
  await page.locator('#noaExamTimed').setChecked(enabled);
  if (enabled) await page.locator('#noaExamDurationMinutes').fill(String(minutes));
}

async function startMixed(page, queue = timedQuestions, enabled = true, minutes = 1) {
  await setTimed(page, enabled, minutes);
  await page.evaluate(queue => NOA_MIXED_EXAM.start(queue, 'Simulacro cronometrado sintético'), queue);
  await page.clock.runFor(200);
  return state(page);
}

async function navigateTimed(page, index) {
  await page.evaluate(index => NOA_EXAM_NAVIGATION.navigateTo(index), index);
  await page.clock.runFor(200);
  await expect.poll(() => page.evaluate(() => examIndex)).toBe(index);
}

async function answerTimed(page, question, mode = 'full') {
  await answer(page, question, mode);
  await page.clock.runFor(200);
}

async function answerAll(page, queue = timedQuestions) {
  for (let index = 0; index < queue.length; index++) {
    await navigateTimed(page, index);
    await answerTimed(page, queue[index]);
    await expect.poll(() => page.evaluate(() => examAnswers.length)).toBe(index + 1);
  }
}

async function state(page) {
  const serialized = await page.evaluate(() => JSON.stringify({
    queue: examQueue,
    index: examIndex,
    score: examScore,
    answers: examAnswers,
    attempts: db.attempts,
    topics: db.topics,
    activity: db.activity,
    clock: NOA_EXAM_SHELL.state(),
    revision: NOA_ANSWER_REVISION.capture(),
    calibration: NOA_CALIBRATOR.get(),
    memory: NOA_QUESTION_MEMORY_V25_2.stats(),
    entries: NOA_QUESTION_MEMORY_V25_2.recent(undefined, 100),
    active: db.activeExam || null,
    stored: JSON.parse(localStorage.getItem(KEY) || 'null'),
    memoryRaw: localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey),
    memoryCalls: window.__timedMemoryCalls || [],
    forbidden: window.__timedForbidden || { ai: 0, fetch: 0 }
  }));
  return JSON.parse(serialized);
}

async function expire(page) {
  const deadline = await page.evaluate(() => NOA_EXAM_SHELL.state().timing.deadlineAt);
  const now = await page.evaluate(() => Date.now());
  await page.clock.fastForward(Math.max(0, deadline - now) + 1);
  return waitClosed(page);
}

async function waitClosed(page) {
  await expect.poll(() => page.evaluate(() => db.attempts.length)).toBe(1);
  await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.whenIdle());
  await expect(page.locator('#examBox')).toHaveAttribute('data-noa-results-engine', '23.0');
  return state(page);
}

async function prepareInteractive(page, question, mode = 'full') {
  if (question.interactionType === 'drag_classify') {
    for (let index = 0; index < question.elements.length; index++) {
      const item = question.elements[index];
      let target = item.correctTargetId;
      if (mode === 'partial' && index >= 2) target = target === 'even' ? 'odd' : 'even';
      await assign(page, item.id, target);
    }
  } else if (question.interactionType === 'inline_select') {
    for (let index = 0; index < question.blanks.length; index++) {
      const blank = question.blanks[index];
      await page.locator(`[data-noa-inline="${blank.id}"]`)
        .selectOption(mode === 'partial' && index > 0 ? '1' : '0');
    }
  } else if (question.interactionType === 'drag_order') {
    await orderTo(page, mode === 'partial' ? ['three', 'one', 'two'] : ['one', 'two', 'three']);
  }
}

function omission(recorded, question) {
  expect(recorded).toMatchObject({ questionId: question.id, omitted: true,
    omissionReason: 'timeout', ok: false, scoreFraction: 0 });
  expect(typeof recorded.presented).toBe('boolean');
  for (const field of ['selected', 'assignments', 'selections', 'order', 'userAnswer']) {
    expect(recorded).not.toHaveProperty(field);
  }
  expect(recorded.blueprint?.difficulty).toBe(question.blueprint?.difficulty ?? question.difficulty);
  expect(recorded.subject ?? recorded.blueprintSlot?.subject)
    .toBe(question.subject ?? question.blueprintSlot?.subject);
}

module.exports = { START, subject, formats, timedQuestions, installClock, openTimed,
  setTimed, startMixed, navigateTimed, answerTimed, answerAll, state,
  expire, waitClosed, prepareInteractive, omission };
