const { readFile } = require('node:fs/promises');
const { expect } = require('@playwright/test');
const { answer, navigate } = require('./fixtures.cjs');
const { mockBatch } = require('./generator-fixtures.cjs');
const { installExam45Fixture } = require('./exam-45-ui-fixtures.cjs');
const { memoryQuestions } = require('./question-memory-fixtures.cjs');

async function installAttemptSpy(page) {
  await page.evaluate(() => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    window.__memoryAttemptCalls = [];
    const original = memory.recordSavedAttempt;
    memory.recordSavedAttempt = async function(attempt, questions) {
      const persisted = JSON.parse(localStorage.getItem(KEY) || 'null');
      __memoryAttemptCalls.push({ id: attempt?.id, total: questions?.length,
        persisted: !!persisted?.attempts?.some(item => item.id === attempt?.id) });
      return original.apply(this, arguments);
    };
  });
}

async function generateExam(page, count) {
  if (count === 45) {
    await installExam45Fixture(page);
    await page.locator('#noaExam45Generate').click();
    await expect(page.locator('#noaExam45Phase')).toHaveText('Generación completa');
  } else {
    await mockBatch(page);
    await page.evaluate(() => {
      const build = window.__buildGeneratorBatch;
      window.__buildGeneratorBatch = options => {
        const batch = build(options);
        batch.generated.forEach((item, index) => {
          const question = item.question, suffix = ` Variante única ${index}.`;
          if (question.text) question.text += suffix;
          if (question.stem) question.stem += suffix;
        });
        return batch;
      };
    });
    await page.locator('#noaGeneratorCount').selectOption(String(count));
    await page.locator('#noaGeneratorGenerate').click();
    await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación completada');
  }
  return page.evaluate(() => structuredClone(examQueue));
}

async function answerAll(page, queue, partialIndex = -1, from = 0) {
  for (let index = from; index < queue.length; index++) {
    await navigate(page, index);
    await answer(page, queue[index], index === partialIndex ? 'partial' : 'full');
    await page.waitForFunction(expected => examAnswers.length === expected, index + 1);
  }
}

async function finish(page) {
  await page.locator('#noaShellFinish').click();
  await page.waitForFunction(() => document.querySelector('#examBox')?.dataset.noaResultsEngine === '23.0');
  await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.whenIdle());
}

async function state(page) {
  return page.evaluate(() => ({
    db: structuredClone(db), rawDb: localStorage.getItem(KEY),
    rawMemory: localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey),
    stats: NOA_QUESTION_MEMORY_V25_2.stats(),
    entries: NOA_QUESTION_MEMORY_V25_2.recent(undefined, 100),
    diagnostics: NOA_QUESTION_MEMORY_V25_2.diagnostics(),
    score: examScore, answers: structuredClone(examAnswers),
    queue: structuredClone(examQueue), calibration: NOA_CALIBRATOR.get(),
    calls: window.__memoryAttemptCalls || []
  }));
}

async function seedMemory(page, session = 'seed-memory') {
  await page.evaluate(async ({ question, session }) => {
    const result = await NOA_QUESTION_MEMORY_V25_2.recordExam([question], session);
    if (!result.ok) throw new Error('No se pudo preparar memoria sintética: ' + result.error);
  }, { question: memoryQuestions[0], session });
}

async function downloadBackup(page) {
  await page.locator('#nav button[data-page="backup"]').click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar copia', exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile(await download.path(), 'utf8'));
}

async function importBackup(page, backup, success = true) {
  await page.locator('#nav button[data-page="backup"]').click();
  await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
  const input = page.locator('#backupInput');
  await input.setInputFiles([]);
  await input.setInputFiles({ name: 'NOA_fixture_backup.json', mimeType: 'application/json',
    buffer: Buffer.from(typeof backup === 'string' ? backup : JSON.stringify(backup)) });
  await page.waitForFunction(() => !!document.querySelector('#toast')?.textContent.trim());
  const text = await page.locator('#toast').textContent();
  if (success && text !== 'Copia restaurada') throw new Error('La importación no se completó: ' + text);
  if (!success && text === 'Copia restaurada') throw new Error('La importación inválida mostró éxito');
  await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.whenIdle());
  return text;
}

module.exports = { installAttemptSpy, generateExam, answerAll, finish, state, seedMemory, downloadBackup, importBackup };
