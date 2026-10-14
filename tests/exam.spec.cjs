const { test, expect } = require('@playwright/test');
const { questions, openApp, start, snapshot, navigate, assign, orderTo, answer } = require('./fixtures.cjs');

test.beforeEach(async ({ page }) => {
  page.runtimeErrors = [];
  page.on('pageerror', error => page.runtimeErrors.push(error.message));
  await openApp(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('estado-del-examen', {
    body: JSON.stringify(await snapshot(page), null, 2), contentType: 'application/json'
  });
  expect(page.runtimeErrors, 'Excepciones JavaScript').toEqual([]);
});

for (const [mode, credits] of [
  ['full', [1, 1, 1, 1]], ['partial', [1, .5, .5, .5]], ['zero', [0, 0, 0, 0]]
]) {
  test(`cuatro formatos: puntuación ${mode}, resultados v23 y Calibrator`, async ({ page }) => {
    await start(page);
    for (let index = 0; index < questions.length; index++) {
      await navigate(page, index);
      await answer(page, questions[index], mode, true);
      await expect.poll(async () => (await snapshot(page)).answers.length).toBe(index + 1);
    }
    const score = credits.reduce((sum, credit) => sum + credit, 0);
    const submitted = await snapshot(page);
    expect(submitted.answers.map(a => a.scoreFraction ?? (a.ok ? 1 : 0))).toEqual(credits);
    expect(submitted.score).toBe(score);
    expect(submitted.topic.attempts).toBe(4);
    await page.locator('#noaShellFinish').click();
    await expect(page.locator('#examBox')).toHaveAttribute('data-noa-results-engine', '23.0');
    await expect(page.locator('#examBox > h2')).toHaveText(`Resultado: ${score} / 4`);
    await expect(page.locator('[data-noa-result-type]')).toHaveCount(4);
    expect(await page.locator('[data-noa-result-type]').evaluateAll(els => els.map(el => el.dataset.noaResultType)))
      .toEqual(questions.map(q => q.interactionType));
    const completed = await snapshot(page);
    expect(completed.attempts).toHaveLength(1);
    expect(completed.attempts[0].score).toBe(score);
    expect(completed.calibration.sample).toBe(4);
    expect(completed.calibration.stats[3].credit).toBe(score);
    expect(completed.calibration.focus).toBe(mode === 'full' ? 4 : mode === 'partial' ? 3 : 2);
    await page.evaluate(() => { renderExam(); renderExam(); NOA_EXAM_NAVIGATION.finishExam(); });
    expect((await snapshot(page)).attempts).toHaveLength(1);
    await page.reload();
    expect((await snapshot(page)).attempts).toHaveLength(1);
  });
}

for (const type of ['drag_classify', 'inline_select', 'drag_order']) {
  test(`borrador ${type}: editar inmediatamente al volver conserva el cambio`, async ({ page }) => {
    await start(page, [questions[0], questions.find(q => q.interactionType === type)]);
    await navigate(page, 1);
    if (type === 'drag_classify') await assign(page, 'two', 'even');
    if (type === 'inline_select') await page.locator('[data-noa-inline="b1"]').selectOption('0');
    if (type === 'drag_order') await orderTo(page, ['one', 'two', 'three']);
    await page.locator('#noaShellPrevious').click();
    await expect(page.locator('#noaShellNext')).toBeVisible();

    // Un solo turno del navegador alcanza determinísticamente la antigua ventana
    // de restauración diferida. Se accionan los controles y sus eventos reales.
    const immediate = await page.evaluate(type => {
      document.querySelector('#noaShellNext').click();
      if (type === 'inline_select') {
        const select = document.querySelector('[data-noa-inline="b1"]');
        select.value = '1';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return { ...NOA_INLINE_RENDERER.getState().selections };
      }
      if (type === 'drag_classify') {
        document.querySelector('[data-noa-drag-item="two"]').click();
        document.querySelector('[data-noa-target="odd"]').click();
        return { ...NOA_DRAG_RENDERER.getState().assignments };
      }
      document.querySelector('[data-order-down="one"]').click();
      return [...NOA_DRAG_ORDER_RENDERER.getState().order];
    }, type);
    if (type === 'inline_select') expect(immediate.b1).toBe(1);
    if (type === 'drag_classify') expect(immediate.two).toBe('odd');
    if (type === 'drag_order') expect(immediate).toEqual(['two', 'one', 'three']);
    // Supera expresamente el temporizador de 60 ms de la regresión original.
    await page.waitForTimeout(200);
    const current = await snapshot(page);
    const edited = type === 'inline_select' ? current.inline.selections :
      type === 'drag_classify' ? current.drag.assignments : current.order.order;
    expect(edited).toEqual(immediate);
    expect(current.score).toBe(0);
    expect(current.answers).toEqual([]);
    await page.reload();
    const restored = await snapshot(page);
    expect(type === 'inline_select' ? restored.inline.selections :
      type === 'drag_classify' ? restored.drag.assignments : restored.order.order).toEqual(immediate);
  });
}

test('recarga conserva índice, crédito parcial, respuestas y borradores interactivos', async ({ page }) => {
  await start(page);
  await answer(page, questions[0]);
  await navigate(page, 1);
  await answer(page, questions[1], 'partial');
  await navigate(page, 2);
  await page.locator('[data-noa-inline="b1"]').selectOption('1');
  await navigate(page, 3);
  await orderTo(page, ['three', 'one', 'two']);
  const before = await snapshot(page);
  expect(before.score).toBe(1.5);
  expect(before.answers).toHaveLength(2);
  await page.reload();
  await page.reload();
  const restored = await snapshot(page);
  expect(restored.index).toBe(3);
  expect(restored.score).toBe(before.score);
  expect(restored.answers).toEqual(before.answers);
  expect(restored.order.order).toEqual(['three', 'one', 'two']);
  await navigate(page, 2);
  expect((await snapshot(page)).inline.selections).toEqual({ b1: 1, b2: null });
  await navigate(page, 1);
  expect((await snapshot(page)).score).toBe(1.5);
  expect((await snapshot(page)).answers).toEqual(before.answers);
});

for (const [index, type] of questions.map((q, index) => [index, q.interactionType])) {
  test(`revisión v22 ${type}: recargar y cancelar conserva puntuación y respuestas`, async ({ page }) => {
    await start(page);
    await navigate(page, index);
    await answer(page, questions[index]);
    await expect(page.locator('#noaRevisionEdit')).toBeVisible();
    const answered = await snapshot(page);
    await page.locator('#noaRevisionEdit').click();
    if (type === 'drag_classify') await assign(page, 'two', 'odd');
    if (type === 'inline_select') await page.locator('[data-noa-inline="b1"]').selectOption('1');
    if (type === 'drag_order') await orderTo(page, ['three', 'two', 'one']);
    const editing = await snapshot(page);
    expect(editing.revision).not.toBeNull();
    expect(editing.answers).toEqual(answered.answers);
    expect(editing.score).toBe(answered.score);
    await page.reload();
    const restored = await snapshot(page);
    expect(restored.revision).toEqual(editing.revision);
    expect(restored.answers).toEqual(answered.answers);
    expect(restored.score).toBe(answered.score);
    await page.locator('#noaRevisionCancel').click();
    const cancelled = await snapshot(page);
    expect(cancelled.revision).toBeNull();
    expect(cancelled.answers).toEqual(answered.answers);
    expect(cancelled.score).toBe(answered.score);
    expect(cancelled.topic.attempts).toBe(1);
  });
}

test('último single: bloquea pendientes, termina una vez y nueva sesión reinicia estado', async ({ page }) => {
  const queue = [...questions.slice(1), questions[0]];
  await start(page, queue);
  const freshDraftCount = (await snapshot(page)).nav.drafts;
  await navigate(page, 3);
  await answer(page, questions[0]);
  await page.locator('#examBox button[onclick="nextExam()"]').click();
  const pending = await snapshot(page);
  expect(pending.attempts).toEqual([]);
  expect(pending.score).toBe(1);
  expect(pending.answers).toHaveLength(1);
  await expect(page.locator('#toast')).toContainText('3 reactivos sin responder');
  // Una pregunta ya respondida se presenta mediante la vista de revisión.
  // Otra sesión deja el single pendiente hasta el final para probar su botón
  // Continuar real cuando se responde por primera vez como último reactivo.
  await start(page, queue);
  for (let index = 0; index < 3; index++) {
    await navigate(page, index);
    await answer(page, queue[index], 'full', true);
  }
  await navigate(page, 3);
  await answer(page, questions[0]);
  await page.locator('#examBox button[onclick="nextExam()"]').click();
  await expect(page.locator('#examBox')).toHaveAttribute('data-noa-results-engine', '23.0');
  let final = await snapshot(page);
  expect(final.score).toBe(4);
  expect(final.answers).toHaveLength(4);
  expect(final.attempts).toHaveLength(1);
  expect(final.topic.attempts).toBe(4);
  await page.evaluate(() => { nextExam(); renderExam(); NOA_EXAM_NAVIGATION.finishExam(); });
  expect((await snapshot(page)).attempts).toHaveLength(1);

  await page.evaluate(q => NOA_MIXED_EXAM.start(q, 'Nueva sesión'), queue);
  await navigate(page, 2);
  await orderTo(page, ['three', 'one', 'two']);
  await navigate(page, 3);
  await answer(page, questions[0]);
  await page.locator('#noaRevisionEdit').click();
  await page.locator('#noaShellMapButton').click();
  const previousClock = (await snapshot(page)).clock.startedAt;
  await page.evaluate(q => NOA_MIXED_EXAM.start(q, 'Sesión limpia'), queue);
  final = await snapshot(page);
  expect(final.score).toBe(0);
  expect(final.answers).toEqual([]);
  expect(final.index).toBe(0);
  expect(final.revision).toBeNull();
  expect(final.nav.drafts).toBe(freshDraftCount);
  expect(Object.values(final.drag.assignments).every(target => target === null)).toBe(true);
  expect(final.clock.mapOpen).toBe(false);
  expect(final.clock.startedAt).not.toBe(previousClock);
  expect(final.attempts).toHaveLength(1);
});

test('Calibrator usa ventanas de 12 intentos y 60 respuestas; Blueprint adapta desde cinco muestras', async ({ page }) => {
  // Se ejecutan los motores reales con historial sintético aislado; este caso
  // no pretende completar trece exámenes mediante la interfaz.
  const result = await page.evaluate(() => {
    const answer = (level, scoreFraction) => ({ blueprint: { difficulty: level }, scoreFraction, ok: scoreFraction === 1 });
    db = blank();
    db.masterSyllabus = { id: 'uaq-excoba-2026-2-medicina', items: [{ subject: 'EXCOBA Secundaria · Matemáticas', code: '2.2.1', title: 'Punto sintético', focus: 'Aritmética', page: 1 }] };
    db.attempts = [{ answers: [answer(5, 1)] }, ...Array.from({ length: 12 }, () => ({ answers: [answer(1, 0)] }))];
    const last12 = NOA_CALIBRATOR.get();
    db.attempts = [{ answers: [...Array.from({ length: 40 }, () => answer(1, 1)), ...Array.from({ length: 60 }, () => answer(4, 2 / 3))] }];
    const last60 = NOA_CALIBRATOR.get();
    const profile = () => ({ cal: NOA_CALIBRATOR.get(), blueprint: NOA_SOURCE_BLUEPRINT.build({ subject: 'EXCOBA Secundaria · Matemáticas', count: 10 }) });
    db.attempts = [{ answers: Array.from({ length: 4 }, () => answer(3, 1)) }];
    const sample4 = profile();
    db.attempts[0].answers.push(answer(3, 1));
    const sample5high = profile();
    db.attempts = [{ answers: Array.from({ length: 5 }, () => answer(3, 0)) }];
    return { last12, last60, sample4, sample5high, sample5low: profile() };
  });
  expect(result.last12.sample).toBe(12);
  expect(result.last12.stats[5].total).toBe(0);
  expect(result.last60.sample).toBe(60);
  expect(result.last60.stats[1].total).toBe(0);
  expect(result.last60.stats[4].credit).toBeCloseTo(40, 10);
  expect(result.sample4.blueprint.calibration.adaptive).toBe(false);
  for (const profile of [result.sample5high, result.sample5low]) {
    expect(profile.blueprint.calibration.adaptive).toBe(true);
    expect(profile.blueprint.slots.map(slot => slot.calibratorDifficulty)).toEqual(profile.cal.cycle);
  }
  expect(result.sample5high.cal.focus).toBe(4);
  expect(result.sample5low.cal.focus).toBe(2);
});

test('cambiar de examen mixto en revisión a manual reinicia sesión y recargar no inventa blueprint', async ({ page }) => {
  await start(page);
  await answer(page, questions[0]);
  await page.locator('#noaRevisionEdit').click();
  expect((await snapshot(page)).revision).not.toBeNull();
  await page.evaluate(() => {
    db.questions = Array.from({ length: 5 }, (_, index) => ({
      id: 'manual-transicion-' + index,
      topicId: 'test-topic',
      text: `${index}+1=?`, options: [String(index + 1), '100'], correct: 0,
      explain: 'Pregunta manual sintética sin blueprint'
    }));
    save();
    renderAll();
    document.querySelector('#examSubject').value = 'test-subject';
    document.querySelector('#examCount').value = '5';
    document.querySelector('button[onclick="startExam()"]').click();
  });
  const fresh = await snapshot(page);
  expect(await page.evaluate(() => NOA_MIXED_EXAM.state().mixedMode)).toBe(false);
  expect(fresh.revision).toBeNull();
  expect(fresh.score).toBe(0);
  expect(fresh.answers).toEqual([]);
  await page.locator('#examBox button[onclick="answerExam(0)"]').click();
  await page.locator('#examBox button[onclick="nextExam()"]').click();
  await page.reload();
  expect(await page.evaluate(() => NOA_MIXED_EXAM.state().mixedMode)).toBe(false);
  expect(await page.evaluate(() => examQueue.every(question => !question.blueprint))).toBe(true);
  for (let index = 1; index < 5; index++) {
    await page.locator('#examBox button[onclick="answerExam(0)"]').click();
    await page.locator('#examBox button[onclick="nextExam()"]').click();
  }
  await expect(page.locator('#examBox > h2')).toHaveText('Resultado: 5 / 5');
  const final = await snapshot(page);
  expect(final.attempts).toHaveLength(1);
  expect(final.calibration.sample).toBe(0);
  expect(final.answers.every(answer => !answer.blueprint)).toBe(true);
});
