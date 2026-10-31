const { test, expect } = require('@playwright/test');
const { questions, answer, navigate, assign, snapshot } = require('./fixtures.cjs');
const { openGenerator, activeSession, examState, mockBatch } = require('./generator-fixtures.cjs');
const { installExam45Fixture, fullExamState, waitDraftCheckpoint, beginDeferred45, release45 } = require('./exam-45-ui-fixtures.cjs');

const title = 'Simulacro EXCOBA Medicina — 45 reactivos';
const phase = page => page.locator('#noaExam45Phase');
const generate = page => page.locator('#noaExam45Generate');
const accept = page => page.on('dialog', dialog => dialog.accept());

test.beforeEach(async ({ page }) => {
  page.exam45Errors = [];
  page.on('pageerror', error => page.exam45Errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.exam45Errors.push(message.text()); });
  await openGenerator(page);
  await page.waitForFunction(() => !!window.NOA_EXAM_UI_V25);
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
});

test.afterEach(async ({ page }, testInfo) => {
  const state = await page.evaluate(() => ({
    ui: window.__exam45Fixture?.stats || null,
    generator: window.__multiFixture?.stats || null,
    phase: document.querySelector('#noaExam45Phase')?.textContent,
    uiState: NOA_EXAM_UI_V25.state(), queue: examQueue.length, answers: examAnswers.length,
    attempts: db.attempts.length
  }));
  if (state.generator) expect(Object.values(state.generator.forbidden)).toEqual([0, 0, 0, 0, 0, 0]);
  expect(page.exam45Errors).toEqual([]);
  await testInfo.attach('v25-ui45-consola-estado-y-llamadas', {
    body: JSON.stringify({ ...state, errors: page.exam45Errors }, null, 2), contentType: 'application/json'
  });
});

test('v25 muestra la tarjeta, distribución, perfil y Calibrator reales sin sustituir v24 ni el modo manual', async ({ page }) => {
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(generate(page)).toHaveText('Generar simulacro de 45 reactivos');
  await expect(generate(page)).toBeEnabled();
  await expect(phase(page)).toHaveText('Listo para generar');
  for (const [group, count] of [['primary', 10], ['secondary', 20], ['medicine', 15]]) {
    await expect(page.locator(`#noaExam45Distribution [data-noa-exam45-group="${group}"]`)).toContainText(String(count));
  }
  await expect(page.locator('#noaExam45Card')).toContainText(/45\s*reactivos/i);
  await expect(page.locator('#noaExam45Card')).toContainText(/nueve\s*materias|9\s*materias/i);
  await expect(page.locator('#noaExam45Card')).toContainText(/proporcional/i);
  await expect(page.locator('#noaExam45Card')).toContainText(/cuatro|4\s*formatos/i);
  await expect(page.locator('#noaGeneratorCard')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generar simulacro', exact: true })).toBeVisible();
  expect(await page.locator('#noaGeneratorCount option').evaluateAll(options => options.map(option => option.value))).toEqual(['5', '10']);
  await expect(page.locator('#noaExam45Card').getByRole('button', { name: /cancelar generación/i })).toHaveCount(0);
  for (const key of ['official', 'extended', 'course', 'extreme']) {
    await page.locator('#nav button[data-page="notes"]').click();
    await page.locator('#excobaTrainingProfile').selectOption(key);
    const label = await page.evaluate(() => NOA_SOURCE_ENGINE.getProfile().label);
    await page.locator('#nav button[data-page="exam"]').click();
    await expect(page.locator('#noaExam45Profile')).toContainText(label);
  }
  for (const sample of [0, 5]) {
    const adaptive = await page.evaluate(sample => {
      db.attempts = sample ? [{ answers: Array.from({ length: sample }, () => ({ blueprint: { difficulty: 3 }, scoreFraction: 1, ok: true })) }] : [];
      save(); NOA_EXAM_UI_V25.refresh();
      return NOA_SOURCE_BLUEPRINT.calibrationState().adaptive;
    }, sample);
    await expect(page.locator('#noaExam45Calibration')).toContainText(adaptive ? /adaptativo/i : /inicial/i);
  }
});

test('v25 confirma recursos antes de generar y cancelar conserva examen, revisión y almacenamiento', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  await installExam45Fixture(page);
  const before = await fullExamState(page);
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.evaluate(() => NOA_EXAM_UI_V25.generate());
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).toMatch(/45/);
  expect(dialogs[0]).toMatch(/recursos|servicio|consum/i);
  expect(dialogs[0]).toMatch(/Judge/i);
  expect(dialogs[0]).toMatch(/incompleto/i);
  expect(dialogs[0]).toMatch(/reemplaz/i);
  expect(await fullExamState(page)).toEqual(before);
  const stats = await page.evaluate(() => __exam45Fixture.stats);
  expect(stats.plans).toBe(1);
  expect(stats.multiCalls).toEqual([]);
  expect(stats.starts).toEqual([]);
  await expect(generate(page)).toBeEnabled();
  expect(await page.evaluate(() => NOA_EXAM_UI_V25.state().busy)).toBe(false);
});

test('v25 rechaza un plan inválido con mensaje legible antes de Multibatch y conserva la sesión', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  await installExam45Fixture(page);
  const before = await fullExamState(page);
  await page.evaluate(() => {
    const build = NOA_EXAM_PLAN_V25.build;
    NOA_EXAM_PLAN_V25.build = () => ({ ...build(), valid: false, errors: [{ message: 'Plan sintético inválido' }] });
  });
  accept(page);
  await page.evaluate(() => NOA_EXAM_UI_V25.generate());
  await expect(page.locator('#noaExam45Status')).toContainText(/plan|materia|Temario/i);
  expect(await page.evaluate(() => __exam45Fixture.stats.multiCalls)).toEqual([]);
  expect(await page.evaluate(() => __exam45Fixture.stats.starts)).toEqual([]);
  expect(await fullExamState(page)).toEqual(before);
  await expect(generate(page)).toBeEnabled();
});

test('v25 genera 45 con plan real, progreso de cero a 45, nueve materias y doble clic bloqueado', async ({ page }, testInfo) => {
  await installExam45Fixture(page, { deferred: true, omitTrace: true });
  accept(page);
  await page.evaluate(() => {
    window.__exam45Phases = [];
    new MutationObserver(records => {
      for (const record of records) for (const added of record.addedNodes) __exam45Phases.push(added.textContent);
    }).observe(document.querySelector('#noaExam45Phase'), { childList: true });
    const button = document.querySelector('#noaExam45Generate'); button.click(); button.click();
  });
  await page.waitForFunction(() => !!window.__multiFixture?.release);
  await expect(phase(page)).toHaveText('Generando reactivos');
  await expect(generate(page)).toBeDisabled();
  await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
  await page.evaluate(() => { renderAll(); NOA_EXAM_UI_V25.refresh(); NOA_GENERATOR_UI.refresh(); NOA_EXAM_UI_V25.generate(); });
  await expect(generate(page)).toBeDisabled();
  expect(await page.evaluate(() => __exam45Fixture.stats.multiCalls.length)).toBe(1);
  expect(await page.evaluate(() => __exam45Fixture.stats.plans)).toBe(1);
  expect(await page.evaluate(() => examQueue.length)).toBe(0);
  await release45(page);
  await expect(phase(page)).toHaveText('Generación completa');
  const payload = await page.evaluate(() => ({
    plan: __exam45Fixture.plan, result: __exam45Fixture.result,
    stats: __exam45Fixture.stats, generator: __multiFixture.stats, queue: examQueue,
    phases: __exam45Phases, ui: NOA_EXAM_UI_V25.state()
  }));
  expect(payload.plan.valid).toBe(true);
  expect(payload.plan.total).toBe(45);
  expect(payload.plan.unsupportedSlots).toEqual([]);
  expect(payload.stats.blueprints).toHaveLength(9);
  expect(payload.stats.multiCalls).toEqual([{ concurrency: 2, maxAttempts: 2, total: 45 }]);
  expect(payload.stats.starts).toEqual([{ count: 45, title }]);
  expect(payload.stats.confirmations).toHaveLength(1);
  expect(payload.stats.confirmations[0].generatorCalls).toBe(0);
  expect(payload.generator.calls).toHaveLength(45);
  expect(payload.generator.maxActive).toBe(2);
  expect(new Set(payload.stats.progress.map(progress => progress.subject)).size).toBe(9);
  expect(new Set(payload.stats.progress.map(progress => progress.groupId))).toEqual(new Set(['primary', 'secondary', 'medicine']));
  expect(payload.stats.progress[0]).toMatchObject({ processed: 0, accepted: 0, failed: 0, requested: 45 });
  expect(payload.stats.progress.at(-1)).toMatchObject({ processed: 45, accepted: 45, failed: 0, requested: 45 });
  expect(payload.ui.progress).toMatchObject({ processed: 45, accepted: 45, failed: 0, requested: 45 });
  for (let index = 1; index < payload.stats.progress.length; index++) {
    expect(payload.stats.progress[index].processed).toBeGreaterThanOrEqual(payload.stats.progress[index - 1].processed);
  }
  expect(payload.queue).toEqual(payload.result.questions);
  expect(payload.queue).toHaveLength(45);
  expect(new Set(payload.queue.map(question => question.id)).size).toBe(45);
  expect(new Set(payload.queue.map(question => question.planSlotId)).size).toBe(45);
  expect(new Set(payload.queue.map(question => question.interactionType)).size).toBe(4);
  for (const question of payload.queue) {
    const planned = payload.plan.slots.find(slot => slot.id === question.planSlotId);
    expect(question.subject).toBe(planned.subject);
    expect(question.groupId).toBe(planned.groupId);
    expect(question.slotId).toBe(planned.slotId);
    expect(question.blueprintSlot).toEqual(planned.blueprintSlot);
    expect(question.blueprint.difficulty).toBe(planned.blueprintSlot.difficulty.level);
    expect(question.sourceTrace).toEqual(planned.blueprintSlot.source);
    expect(question.accepted).toBe(true);
    expect(question.judge.qualityScore).toBe(10);
  }
  for (const expected of ['Validando plan académico', 'Generando reactivos', 'Evaluando y preparando examen', 'Generación completa']) {
    expect(payload.phases).toContain(expected);
  }
  await expect(page.locator('#noaExam45Processed')).toContainText(/45\s*\/\s*45/);
  await expect(page.locator('#noaExam45Progress')).not.toContainText('%');
  await expect(generate(page)).toBeEnabled();
  await testInfo.attach('ui45-plan-progreso-y-examen-sintetico', { body: JSON.stringify(payload, null, 2), contentType: 'application/json' });
});

for (const mode of ['reject', 'error']) {
  test(`v25 conserva sesión y no inicia examen cuando ${mode} deja 44 aceptadas`, async ({ page }) => {
    await activeSession(page); await waitDraftCheckpoint(page);
    await installExam45Fixture(page, { mode, always: true });
    const before = await fullExamState(page);
    accept(page);
    await page.evaluate(() => NOA_EXAM_UI_V25.generate());
    await expect(phase(page)).toHaveText('Generación incompleta');
    expect(await page.evaluate(() => __exam45Fixture.result.accepted)).toBe(44);
    expect(await page.evaluate(() => __exam45Fixture.result.complete)).toBe(false);
    expect(await page.evaluate(() => __exam45Fixture.stats.starts)).toEqual([]);
    expect(await fullExamState(page)).toEqual(before);
    await expect(page.locator('#noaExam45Accepted')).toContainText('44');
    await expect(page.locator('#noaExam45Failed')).toContainText('1');
    await expect(generate(page)).toBeEnabled();
  });
}

test('v25 maneja una promesa rechazada del motor sin perder sesión ni dejar bloqueado el botón', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  await installExam45Fixture(page);
  const before = await fullExamState(page);
  await page.evaluate(() => { NOA_MULTI_BATCH_V25.generate = async () => { throw new Error('Servicio sintético sin conexión'); }; });
  accept(page);
  await page.evaluate(() => NOA_EXAM_UI_V25.generate());
  await expect(phase(page)).toHaveText('Error de conexión o del motor');
  await expect(page.locator('#noaExam45Details')).toContainText('Servicio sintético sin conexión');
  expect(await fullExamState(page)).toEqual(before);
  expect(await page.evaluate(() => NOA_EXAM_UI_V25.state().busy)).toBe(false);
  await expect(generate(page)).toBeEnabled();
});

test('v25 rechaza resultados completos con cantidad, identidades, distribución o trazabilidad dañadas', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  await installExam45Fixture(page);
  const before = await fullExamState(page);
  accept(page);
  const results = await page.evaluate(async () => {
    const native = NOA_MULTI_BATCH_V25.generate;
    const outcomes = [];
    for (const field of ['length', 'accepted', 'failure', 'id', 'planSlotId', 'group', 'subject', 'format', 'trace', 'blueprint', 'difficulty']) {
      NOA_MULTI_BATCH_V25.generate = async options => {
        const result = await native(options);
        if (field === 'length') result.questions.pop();
        if (field === 'accepted') result.accepted = 44;
        if (field === 'failure') result.failures.push({ error: 'Fallo sintético final' });
        if (field === 'id') result.questions[1].id = result.questions[0].id;
        if (field === 'planSlotId') result.questions[1].planSlotId = result.questions[0].planSlotId;
        if (field === 'group') result.questions[0].groupId = 'medicine';
        if (field === 'subject') result.questions[0].subject = result.questions[5].subject;
        if (field === 'format') result.questions[0].interactionType = 'numeric_input';
        if (field === 'trace') delete result.questions[0].sourceTrace;
        if (field === 'blueprint') delete result.questions[0].blueprintSlot;
        if (field === 'difficulty') result.questions[0].difficulty = 5;
        return result;
      };
      await NOA_EXAM_UI_V25.generate();
      outcomes.push({ field, starts: __exam45Fixture.stats.starts.length, busy: NOA_EXAM_UI_V25.state().busy,
        phase: NOA_EXAM_UI_V25.state().phase });
    }
    return outcomes;
  });
  for (const result of results) {
    expect(result.starts, result.field).toBe(0);
    expect(result.busy, result.field).toBe(false);
    expect(result.phase, result.field).toMatch(/Generación incompleta|Error de conexión o del motor/);
  }
  expect(await fullExamState(page)).toEqual(before);
  await expect(generate(page)).toBeEnabled();
});

for (const authorize of [false, true]) {
  test(`v25 exige autorización adicional para la sesión iniciada durante generación: ${authorize}`, async ({ page }) => {
    await installExam45Fixture(page, { deferred: true });
    let confirmations = 0;
    page.on('dialog', async dialog => {
      confirmations++;
      if (confirmations === 1 || authorize) await dialog.accept(); else await dialog.dismiss();
    });
    await beginDeferred45(page);
    await page.evaluate(queue => NOA_MIXED_EXAM.start(queue, 'Sesión iniciada durante generación'), questions);
    await answer(page, questions[0]);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(KEY)).activeExam?.answers.length)).toBe(1);
    const before = await fullExamState(page);
    await release45(page);
    await expect(phase(page)).toHaveText('Generación completa');
    expect(confirmations).toBe(2);
    if (authorize) {
      expect(await page.evaluate(() => examQueue.length)).toBe(45);
      expect(await page.evaluate(() => examAnswers.length)).toBe(0);
    } else {
      expect(await fullExamState(page)).toEqual(before);
      expect(await page.evaluate(() => __exam45Fixture.stats.starts.length)).toBe(1);
    }
    await expect(generate(page)).toBeEnabled();
  });
}

test('v25 también reconfirma al finalizar antes de sustituir el examen que ya estaba activo', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  await installExam45Fixture(page);
  const before = await fullExamState(page);
  let confirmations = 0;
  page.on('dialog', async dialog => { confirmations++; if (confirmations === 1) await dialog.accept(); else await dialog.dismiss(); });
  await page.evaluate(() => NOA_EXAM_UI_V25.generate());
  expect(confirmations).toBe(2);
  await expect(phase(page)).toHaveText('Generación completa');
  expect(await page.evaluate(() => __exam45Fixture.result.accepted)).toBe(45);
  expect(await page.evaluate(() => __exam45Fixture.stats.starts)).toEqual([]);
  expect(await fullExamState(page)).toEqual(before);
});

test('v25 bloquea su handler mientras v24 genera y vuelve a habilitarse al terminar', async ({ page }) => {
  await installExam45Fixture(page);
  await mockBatch(page, 'deferred');
  await page.locator('#noaGeneratorGenerate').click();
  await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generando y evaluando reactivos');
  await expect(generate(page)).toBeDisabled();
  await page.evaluate(() => { NOA_EXAM_UI_V25.generate(); renderAll(); NOA_EXAM_UI_V25.refresh(); });
  expect(await page.evaluate(() => __exam45Fixture.stats.multiCalls)).toEqual([]);
  expect(await page.evaluate(() => __exam45Fixture.stats.plans)).toBe(0);
  await page.evaluate(() => __batchPending.resolve());
  await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación completada');
  expect(await page.evaluate(() => examQueue.length)).toBe(5);
  await expect(generate(page)).toBeEnabled();
});

test('v25 bloquea v24 en ambas rutas de clic y handler durante la generación de 45', async ({ page }) => {
  await installExam45Fixture(page, { deferred: true });
  await mockBatch(page);
  accept(page);
  await beginDeferred45(page);
  await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
  await page.evaluate(() => { document.querySelector('#noaGeneratorGenerate').click(); NOA_GENERATOR_UI.generate(); renderAll(); });
  expect(await page.evaluate(() => __batchCalls.length)).toBe(0);
  expect(await page.evaluate(() => examQueue.length)).toBe(0);
  await release45(page);
  await expect(phase(page)).toHaveText('Generación completa');
  expect(await page.evaluate(() => examQueue.length)).toBe(45);
  expect(await page.evaluate(() => __batchCalls.length)).toBe(0);
  await expect(page.locator('#noaGeneratorGenerate')).toBeEnabled();
});

test('v25 ignora callbacks antiguos después de terminar y durante una generación nueva', async ({ page }) => {
  await installExam45Fixture(page);
  accept(page);
  await generate(page).click();
  await expect(phase(page)).toHaveText('Generación completa');
  const output = await page.evaluate(async () => {
    const previous = __exam45Fixture.callbacks[0];
    const last = __exam45Fixture.plan.slots.at(-1);
    const completed = structuredClone(NOA_EXAM_UI_V25.state());
    previous({ groupId: last.groupId, subject: last.subject, processed: 45,
      accepted: 44, failed: 1, requested: 45, status: 'generating' });
    const afterComplete = structuredClone(NOA_EXAM_UI_V25.state());
    const native = NOA_BLUEPRINT_GENERATOR.generateSlot;
    const gate = new Promise(resolve => { window.__releaseNewExam45 = resolve; });
    NOA_BLUEPRINT_GENERATOR.generateSlot = async (...args) => { await gate; return native(...args); };
    window.__newExam45Promise = NOA_EXAM_UI_V25.generate();
    return { completed, afterComplete };
  });
  expect(output.afterComplete).toEqual(output.completed);
  await expect(phase(page)).toHaveText('Generando reactivos');
  const before = await page.evaluate(() => structuredClone(NOA_EXAM_UI_V25.state()));
  await page.evaluate(() => {
    const last = __exam45Fixture.plan.slots.at(-1);
    __exam45Fixture.callbacks[0]({ groupId: last.groupId, subject: last.subject, processed: 44,
      accepted: 44, failed: 0, requested: 45, status: 'generating' });
  });
  expect(await page.evaluate(() => NOA_EXAM_UI_V25.state())).toEqual(before);
  await page.evaluate(() => __releaseNewExam45());
  await expect(phase(page)).toHaveText('Generación completa');
  expect(await page.evaluate(() => __exam45Fixture.stats.starts.length)).toBe(2);
});

test('v25 al recargar durante generación conserva el examen anterior y no promete recuperar el lote pendiente', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  await installExam45Fixture(page, { deferred: true });
  const before = await examState(page);
  accept(page);
  await beginDeferred45(page);
  await page.reload();
  await page.waitForFunction(() => !!window.NOA_EXAM_UI_V25 && examQueue.length === 4);
  expect(await examState(page, before.topics.map(topic => topic.id))).toEqual(before);
  expect(await page.evaluate(() => NOA_EXAM_UI_V25.state().busy)).toBe(false);
  await expect(phase(page)).toHaveText('Listo para generar');
  await expect(page.locator('#noaExam45RecoveryNote')).toContainText(/recarg|no.*recuper|no.*guard|no.*persist/i);
  expect(await page.evaluate(() => db.attempts.length)).toBe(0);
});

test('v25 completa 45 posiciones con crédito parcial, revisión, recuperación, resultados v23 e historial único', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await installExam45Fixture(page, { omitTrace: true });
  accept(page);
  await generate(page).click();
  await expect(phase(page)).toHaveText('Generación completa');
  const queue = await page.evaluate(() => structuredClone(examQueue));
  await page.locator('#noaShellMapButton').click();
  await expect(page.locator('.noa-map-cell[data-noa-question-index]')).toHaveCount(45);
  await page.locator('.noa-map-cell[data-noa-question-index="44"]').click();
  expect(await page.evaluate(() => examIndex)).toBe(44);
  await page.locator('.noa-map-cell[data-noa-question-index="0"]').click();
  await page.locator('#noaShellMapButton').click();
  await expect(page.locator('#noaExamMap')).toHaveCount(0);
  await answer(page, queue[0], 'partial');
  for (let index = 1; index <= 4; index++) { await navigate(page, index); await answer(page, queue[index]); }
  expect(await page.evaluate(() => examScore)).toBe(4.5);
  const classify = queue.findIndex(question => question.interactionType === 'drag_classify');
  await navigate(page, classify);
  await page.locator('#noaRevisionEdit').click();
  await assign(page, 'two', 'odd');
  await waitDraftCheckpoint(page);
  const before = await examState(page);
  await page.reload();
  await page.waitForFunction(() => !!window.NOA_EXAM_UI_V25 && examQueue.length === 45);
  expect(await examState(page, before.topics.map(topic => topic.id))).toEqual(before);
  await expect(page.locator('#noaRevisionCancel')).toBeVisible();
  await page.locator('#noaRevisionCancel').click();
  for (let index = 5; index < queue.length; index++) { await navigate(page, index); await answer(page, queue[index]); }
  await expect.poll(() => page.evaluate(() => examAnswers.length)).toBe(45);
  expect(await page.evaluate(() => examScore)).toBe(44.5);
  const verify = (answers, original) => {
    expect(answers).toHaveLength(45);
    expect(new Set(answers.map(item => item.planSlotId)).size).toBe(45);
    for (const question of original) {
      const recorded = answers.find(item => item.questionId === question.id);
      for (const key of ['planSlotId', 'subject', 'groupId', 'slotId', 'blueprintSlot', 'blueprint',
        'sourceType', 'requestedSourceType', 'sourceTrace', 'difficulty', 'interactionType', 'judge', 'accepted']) {
        expect(recorded[key], `${question.id}/${key}`).toEqual(question[key]);
      }
    }
  };
  verify((await snapshot(page)).answers, queue);
  expect(await page.evaluate(() => db.topics.reduce((sum, topic) => sum + topic.attempts, 0))).toBe(45);
  await page.locator('#noaShellFinish').click();
  await expect(page.locator('#examBox')).toHaveAttribute('data-noa-results-engine', '23.0');
  await expect(page.locator('#examBox > h2')).toHaveText('Resultado: 44.5 / 45');
  await page.evaluate(() => { NOA_EXAM_NAVIGATION.finishExam(); NOA_EXAM_NAVIGATION.finishExam(); });
  const completed = await snapshot(page);
  expect(completed.attempts).toHaveLength(1);
  expect(completed.attempts[0]).toMatchObject({ score: 44.5, total: 45 });
  verify(completed.attempts[0].answers, queue);
  expect(completed.calibration.sample).toBe(45);
  await page.reload();
  const reloaded = await snapshot(page);
  expect(reloaded.attempts).toEqual(completed.attempts);
  verify(reloaded.attempts[0].answers, queue);
  await testInfo.attach('ui45-recuperacion-resultados-historial', { body: JSON.stringify({ queue,
    completed: completed.attempts, reloaded: reloaded.attempts, calibration: completed.calibration }, null, 2), contentType: 'application/json' });
});

for (const width of [320, 390, 768, 1365]) {
  test(`v25 se mantiene legible y sin desbordamiento a ${width}px en listo, generación e incompleto`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const assertFits = async () => {
      const state = await page.evaluate(() => {
        const card = document.querySelector('#noaExam45Card').getBoundingClientRect();
        return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
          left: card.left, right: card.right,
          elements: ['noaExam45Generate', 'noaExam45Status', 'noaExam45Progress', 'noaExam45Distribution'].map(id => {
            const element = document.getElementById(id), rect = element.getBoundingClientRect();
            return { id, left: rect.left, right: rect.right, width: rect.width,
              scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
          }) };
      });
      expect(state.documentWidth).toBeLessThanOrEqual(state.viewport + 1);
      expect(state.left).toBeGreaterThanOrEqual(0);
      expect(state.right).toBeLessThanOrEqual(state.viewport);
      for (const element of state.elements) {
        if (!element.width) continue;
        expect(element.left, element.id).toBeGreaterThanOrEqual(state.left);
        expect(element.right, element.id).toBeLessThanOrEqual(state.right);
        expect(element.scrollWidth, element.id).toBeLessThanOrEqual(element.clientWidth + 1);
      }
    };
    await assertFits();
    await installExam45Fixture(page, { deferred: true, mode: 'reject', always: true });
    accept(page);
    await beginDeferred45(page); await assertFits();
    await release45(page);
    await expect(phase(page)).toHaveText('Generación incompleta');
    await assertFits();
    if (width === 320) {
      await page.evaluate(() => { __multiFixture.config = {}; });
      await generate(page).click();
      await expect(phase(page)).toHaveText('Generación completa');
      await page.locator('#noaShellMapButton').click();
      await expect(page.locator('.noa-map-cell[data-noa-question-index]')).toHaveCount(45);
      await assertFits();
      const cells = await page.locator('.noa-map-cell[data-noa-question-index]').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right };
      }));
      for (const cell of cells) { expect(cell.left).toBeGreaterThanOrEqual(0); expect(cell.right).toBeLessThanOrEqual(320); }
      await page.locator('#noaShellMapButton').click();
      await expect(page.locator('#noaExamMap')).toHaveCount(0);
    }
  });
}

test('v25 ofrece estado accesible y permite confirmar o cancelar mediante teclado', async ({ page }) => {
  await installExam45Fixture(page);
  await expect(page.locator('#noaExam45Card')).toHaveAttribute('aria-labelledby', 'noaExam45Title');
  await expect(page.locator('#noaExam45Status')).toHaveAttribute('role', 'status');
  await expect(page.locator('#noaExam45Status')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#noaExam45Status')).toHaveAttribute('aria-atomic', 'true');
  await expect(generate(page)).toHaveAttribute('aria-describedby', /noaExam45Status/);
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await generate(page).focus();
  await expect(generate(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => dialogs).toBe(1);
  expect(await page.evaluate(() => __exam45Fixture.stats.multiCalls)).toEqual([]);
  await expect(generate(page)).toBeEnabled();
});

test.describe('v25 UI45 con Service Worker real', () => {
  test.use({ serviceWorkers: 'allow' });
  test('v25 UI45 se almacena en caché v69 aislada y NOA conserva el acceso offline', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cache = await page.evaluate(async () => {
      const scope = (await navigator.serviceWorker.getRegistration()).scope;
      const name = (await caches.keys()).find(name => name.startsWith(`noa-mobile:${encodeURIComponent(scope)}:`));
      return { name, ui: !!await (await caches.open(name)).match(new URL('excoba_patch_v25_exam_ui.js', scope).href) };
    });
    expect(cache.name).toMatch(/:v6-69$/); expect(cache.ui).toBe(true);
    await context.setOffline(true); await page.reload();
    await page.waitForFunction(() => !!window.NOA_EXAM_UI_V25 && !!window.NOA_RESULTS_ENGINE);
    await page.locator('#nav button[data-page="exam"]').click();
    await expect(page.locator('#noaExam45Card')).toBeVisible();
    await expect(page.locator('#noaGeneratorCard')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar simulacro', exact: true })).toBeVisible();
    expect(await page.locator('#noaGeneratorCount option').evaluateAll(options => options.map(option => option.value))).toEqual(['5', '10']);
    await installExam45Fixture(page);
    accept(page);
    await generate(page).click();
    await expect(phase(page)).toHaveText('Error de conexión o del motor');
    expect(await page.evaluate(() => __exam45Fixture.stats.multiCalls)).toEqual([]);
    expect(await page.evaluate(() => examQueue.length)).toBe(0);
  });
});
