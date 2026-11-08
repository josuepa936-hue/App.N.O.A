const { test, expect } = require('@playwright/test');
const { mockBatch } = require('./generator-fixtures.cjs');
const { START, subject, formats, timedQuestions, openTimed, setTimed, startMixed,
  navigateTimed, answerTimed, answerAll, state, expire, waitClosed, prepareInteractive, omission } = require('./timed-exam-fixtures.cjs');

test.beforeEach(async ({ page }) => {
  page.timedErrors = []; page.timedRequests = [];
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) &&
      (url.origin !== 'http://127.0.0.1:8022' || !['GET', 'HEAD'].includes(request.method()))) {
      page.timedRequests.push({ url: url.href, method: request.method() });
      return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', error => page.timedErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.timedErrors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  await openTimed(page);
});

test.afterEach(async ({ page }, testInfo) => {
  const evidence = await page.evaluate(() => ({
    forbidden: window.__timedForbidden || { ai: 0, fetch: 0 },
    attempts: db.attempts.length, memory: NOA_QUESTION_MEMORY_V25_2.stats()
  }));
  expect(evidence.forbidden).toEqual({ ai: 0, fetch: 0 });
  expect(page.timedBeforeReloadForbidden || { ai: 0, fetch: 0 }).toEqual({ ai: 0, fetch: 0 });
  expect(page.timedRequests).toEqual([]); expect(page.timedErrors).toEqual([]);
  await testInfo.attach('cronometro-consola-red-y-memoria', {
    body: JSON.stringify({ ...evidence, errors: page.timedErrors, requests: page.timedRequests }, null, 2),
    contentType: 'application/json'
  });
});

async function reload(page) {
  page.timedBeforeReloadForbidden = await page.evaluate(() => window.__timedForbidden || { ai: 0, fetch: 0 });
  await page.reload();
  await page.waitForFunction(() => !!window.NOA_EXAM_SHELL && !!window.NOA_EXAM_RECOVERY && !!window.NOA_QUESTION_MEMORY_V25_2);
  await page.clock.runFor(200);
  await page.evaluate(() => {
    window.__timedForbidden = { ai: 0, fetch: 0 };
    window.callAI = () => { __timedForbidden.ai++; throw new Error('IA real prohibida al recuperar'); };
    window.fetch = () => { __timedForbidden.fetch++; throw new Error('Red prohibida al recuperar'); };
  });
}

function assertClosed(result, { score, total, omitted }) {
  expect(result.attempts).toHaveLength(1);
  const attempt = result.attempts[0];
  expect(attempt).toMatchObject({ score, total, finishReason: 'timeout',
    timing: { version: 26, status: 'closed', finishReason: 'timeout' } });
  expect(attempt.id).toBe(attempt.timing.attemptId);
  expect(attempt.timing.closedAt).toBe(attempt.timing.deadlineAt);
  expect(attempt.answers).toHaveLength(total);
  expect(new Set(attempt.answers.map(answer => answer.questionId)).size).toBe(total);
  expect(attempt.answers.filter(answer => answer.omitted === true)).toHaveLength(omitted);
  expect(result.stored.attempts).toEqual(result.attempts);
  expect(result.active).toBeNull(); expect(result.stored).not.toHaveProperty('activeExam');
  return attempt;
}

async function holdSubmit(page, type, action = null) {
  const selector = { drag_classify: '#noaDragSubmit', inline_select: '#noaInlineSubmit', drag_order: '#noaOrderSubmit' }[type];
  return page.evaluate(({ selector, action }) => {
    const native = window.setTimeout;
    window.__timedHeldRecords = [];
    window.setTimeout = function(callback, delay, ...args) {
      if (delay === 0 && String(new Error().stack).includes('queueAnswerRecord')) {
        __timedHeldRecords.push(() => callback(...args)); return 0;
      }
      return native(callback, delay, ...args);
    };
    let registeredBeforeAction;
    try {
      document.querySelector(selector).click();
      registeredBeforeAction = examAnswers.length;
      // Submit and navigation/finalization intentionally share one JS turn.
      if (Number.isInteger(action?.navigateTo)) NOA_EXAM_NAVIGATION.navigateTo(action.navigateTo);
      if (action?.finish) window.__timedPendingFinish = NOA_EXAM_NAVIGATION.finishExam();
    } finally { window.setTimeout = native; }
    return action ? { held: __timedHeldRecords.length, registeredBeforeAction, indexAfterAction: examIndex }
      : __timedHeldRecords.length;
  }, { selector, action });
}

async function failAttemptWrites(page) {
  await page.evaluate(() => {
    window.__timedNativeSetItem = Storage.prototype.setItem;
    const attemptId = NOA_EXAM_SHELL.state().timing.attemptId;
    Storage.prototype.setItem = function(key, value) {
      if (key === KEY && JSON.parse(value).attempts?.some(attempt => attempt.id === attemptId)) {
        throw new Error('Fallo sintético al guardar el intento cronometrado');
      }
      return __timedNativeSetItem.call(this, key, value);
    };
  });
}

async function expireWithFailedWrite(page) {
  const remaining = await page.evaluate(() => NOA_EXAM_SHELL.state().timing.deadlineAt - Date.now());
  await page.clock.fastForward(Math.max(0, remaining) + 1);
  await expect(page.locator('#noaTimedClosureStatus')).toContainText('No pude guardar');
  await expect(page.locator('#noaTimedRetryClosure')).toBeVisible();
  return state(page);
}

test('cronómetro configurable conserva deadline al navegar y cambiar la configuración visual', async ({ page }, testInfo) => {
  await expect(page.locator('#noaExamTimed')).not.toBeChecked();
  await expect(page.locator('#noaExamDurationMinutes')).toBeDisabled();
  await expect(page.locator('#noaExamTimingHelp')).toContainText(/no una duración oficial verificada/i);
  const initial = await startMixed(page, timedQuestions, true, 2), timing = initial.clock.timing;
  expect(timing.deadlineAt - timing.startedAt).toBe(120000);
  await expect(page.locator('#noaShellClock')).toContainText('Tiempo restante');
  await page.clock.runFor(10000); await navigateTimed(page, 2);
  await page.evaluate(() => { document.getElementById('noaExamDurationMinutes').value = '900'; document.getElementById('noaExamTimed').checked = false; });
  const later = await state(page);
  expect(later.clock.timing.deadlineAt).toBe(timing.deadlineAt);
  expect(later.clock.timing.attemptId).toBe(timing.attemptId);
  expect(later.clock.timing.presentedQuestionIds).toContain(timedQuestions[2].id);
  expect(later.attempts).toEqual([]);
  await testInfo.attach('deadline-absoluto-configuracion', { body: JSON.stringify({ initial: timing, later: later.clock }, null, 2), contentType: 'application/json' });
});

test('duración inválida no reemplaza la sesión anterior', async ({ page }) => {
  const initial = await startMixed(page);
  await page.evaluate(() => { document.getElementById('noaExamDurationMinutes').value = '0'; });
  const error = await page.evaluate(queue => {
    try { NOA_MIXED_EXAM.start(queue.map(question => ({ ...question, id: 'invalid-' + question.id })), 'Inválido'); return null; }
    catch (error) { return error.message; }
  }, timedQuestions);
  expect(error).toMatch(/duraci[oó]n|minutos/i);
  const current = await state(page);
  expect(current.queue).toEqual(initial.queue); expect(current.answers).toEqual(initial.answers);
  expect(current.clock.timing).toEqual(initial.clock.timing); expect(current.attempts).toEqual([]);
});

test('entrenamiento sin tiempo conserva elapsed y no aplica la duración configurada', async ({ page }) => {
  await startMixed(page, timedQuestions, false);
  await page.evaluate(() => { document.getElementById('noaExamDurationMinutes').value = '1'; });
  await page.clock.fastForward(120001);
  const result = await state(page);
  expect(result.clock).not.toHaveProperty('timing'); expect(result.clock.elapsed).toBeGreaterThanOrEqual(120);
  expect(result.attempts).toEqual([]); expect(result.answers).toEqual([]);
  await expect(page.locator('#noaShellClock')).not.toContainText('Tiempo restante');
});

test('vencimiento con todas respondidas conserva crédito y guarda una sola vez', async ({ page }) => {
  const initial = await startMixed(page); await answerAll(page);
  const before = await state(page), result = await expire(page);
  const attempt = assertClosed(result, { score: 4, total: 4, omitted: 0 });
  expect(attempt.id).toBe(initial.clock.timing.attemptId);
  expect(attempt.answers.map(answer => answer.scoreFraction)).toEqual(before.answers.map(answer => answer.scoreFraction));
  expect(result.topics).toEqual(before.topics); expect(result.memory).toMatchObject({ uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
  await expect(page.locator('#noaTimedExamResultSummary')).toContainText('Omitidas: 0');
});

test('pendientes distingue omisiones, dominio y exposición visitada', async ({ page }, testInfo) => {
  await startMixed(page); await navigateTimed(page, 1);
  const before = await state(page), result = await expire(page);
  const attempt = assertClosed(result, { score: 0, total: 4, omitted: 4 });
  attempt.answers.forEach((answer, index) => omission(answer, result.queue[index]));
  expect(attempt.answers.map(answer => answer.presented)).toEqual([true, true, false, false]);
  expect(result.topics).toEqual(before.topics); expect(result.topics[0].attempts).toBe(0);
  expect(result.memory).toMatchObject({ uniqueQuestions: 2, totalSeen: 2, sessions: 1 });
  expect(result.calibration.sample).toBe(4);
  await expect(page.locator('[data-noa-result-status="omitted"]')).toHaveCount(4);
  await testInfo.attach('omisiones-y-exposicion', { body: JSON.stringify({ attempt, topics: result.topics, memory: result.memory, entries: result.entries }, null, 2), contentType: 'application/json' });
});

test('vencimiento conserva crédito parcial sin calificar pendientes', async ({ page }) => {
  await startMixed(page); await navigateTimed(page, 1); await answerTimed(page, timedQuestions[1], 'partial');
  const before = await state(page), result = await expire(page);
  assertClosed(result, { score: 0.5, total: 4, omitted: 3 });
  const kept = result.answers.find(answer => answer.questionId === timedQuestions[1].id);
  expect(kept).toEqual(before.answers[0]); expect(result.topics).toEqual(before.topics);
  expect(result.memory).toMatchObject({ uniqueQuestions: 2, totalSeen: 2, sessions: 1 });
  await expect(page.locator('#examBox > h2')).toHaveText('Resultado: 0.5 / 4');
});

test('recarga antes del vencimiento conserva deadline, respuestas y borrador', async ({ page }) => {
  const initial = await startMixed(page); await answerTimed(page, timedQuestions[0]); await navigateTimed(page, 1);
  await prepareInteractive(page, timedQuestions[1], 'partial'); await page.clock.runFor(10000);
  await page.evaluate(() => NOA_EXAM_RECOVERY.save());
  const before = await state(page); await reload(page); const restored = await state(page);
  expect(restored.clock.timing.deadlineAt).toBe(initial.clock.timing.deadlineAt);
  expect(restored.clock.timing.attemptId).toBe(initial.clock.timing.attemptId);
  expect(restored.answers).toEqual(before.answers); expect(restored.score).toBe(1);
  expect(await page.evaluate(() => NOA_DRAG_RENDERER.getState().assignments.two)).toBe('even');
  const result = await expire(page); assertClosed(result, { score: 1, total: 4, omitted: 3 });
});

test('recarga vencida cierra antes de reproducir un borrador enviado pendiente', async ({ page }) => {
  const initial = await startMixed(page); await navigateTimed(page, 1); await prepareInteractive(page, timedQuestions[1]);
  expect(await holdSubmit(page, 'drag_classify')).toBe(1);
  await page.evaluate(() => NOA_EXAM_RECOVERY.save());
  await page.clock.setSystemTime(new Date(initial.clock.timing.deadlineAt + 5000));
  await reload(page); const result = await waitClosed(page);
  assertClosed(result, { score: 0, total: 4, omitted: 4 });
  expect(result.clock.timing.deadlineAt).toBe(initial.clock.timing.deadlineAt);
  expect(result.revision).toBeNull(); expect(result.topics[0].attempts).toBe(0);
});

for (const type of formats) {
  test('deadline bloquea respuestas y callbacks tardíos de ' + type, async ({ page }) => {
    const question = timedQuestions.find(question => question.interactionType === type);
    const initial = await startMixed(page, [question]);
    if (type !== 'single_select') { await prepareInteractive(page, question); expect(await holdSubmit(page, type)).toBe(1); }
    await page.clock.setSystemTime(new Date(initial.clock.timing.deadlineAt + 1));
    await page.evaluate(type => {
      if (type === 'single_select') answerExam(0);
      else __timedHeldRecords.forEach(record => record());
    }, type);
    const result = await waitClosed(page); assertClosed(result, { score: 0, total: 1, omitted: 1 });
    expect(result.topics[0].attempts).toBe(0); expect(result.topics[0].correct).toBe(0);
    const before = result.attempts;
    await page.evaluate(async () => {
      answerExam(0); nextExam(); NOA_EXAM_NAVIGATION.navigateTo(0);
      document.querySelector('#noaRevisionEdit')?.click();
      await Promise.all([NOA_EXAM_NAVIGATION.finishExam(), NOA_EXAM_SHELL.expire()]);
    });
    expect((await state(page)).attempts).toEqual(before);
  });
}

test('cierre manual simultáneo y expiración comparten un intento', async ({ page }) => {
  const initial = await startMixed(page); await answerAll(page);
  await page.clock.setSystemTime(new Date(initial.clock.timing.deadlineAt));
  await page.evaluate(async () => Promise.all([NOA_EXAM_NAVIGATION.finishExam(), NOA_EXAM_SHELL.expire(), commitCompletedExam({ reason: 'timeout' })]));
  const result = await waitClosed(page); assertClosed(result, { score: 4, total: 4, omitted: 0 });
  expect(result.memory).toMatchObject({ uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
  expect(new Set(result.memoryCalls.map(call => call.id)).size).toBe(1);
});

test('finalización manual previa conserva motivo y cancela vencimiento posterior', async ({ page }) => {
  await startMixed(page); await answerAll(page); await page.evaluate(() => NOA_EXAM_NAVIGATION.finishExam());
  const result = await waitClosed(page);
  expect(result.attempts[0]).toMatchObject({ score: 4, total: 4, finishReason: 'manual', timing: { status: 'closed' } });
  expect(result.attempts[0].timing.closedAt).toBeLessThan(result.attempts[0].timing.deadlineAt);
  await page.clock.fastForward(120000);
  expect((await state(page)).attempts).toEqual(result.attempts);
});

test('revisión activa se descarta al vencer conservando el crédito registrado', async ({ page }) => {
  await startMixed(page); await navigateTimed(page, 1); await answerTimed(page, timedQuestions[1], 'partial');
  await page.locator('#noaRevisionEdit').click();
  // A single-select option confirms immediately in v22. Keep a classification
  // editor with a changed draft, without submitting that replacement response.
  await page.locator('[data-noa-drag-item="two"]').click();
  await page.locator('[data-noa-target="odd"]').click({ position: { x: 5, y: 5 } });
  const before = await state(page); expect(before.revision).toBeTruthy();
  expect(before.score).toBe(0.5);
  const result = await expire(page); assertClosed(result, { score: 0.5, total: 4, omitted: 3 });
  expect(result.answers.find(answer => answer.questionId === timedQuestions[1].id)).toEqual(before.answers[0]);
  expect(result.revision).toBeNull(); expect(result.topics).toEqual(before.topics);
});

test('guardado fallido mantiene cierre bloqueado y reintenta con el mismo ID', async ({ page }) => {
  const initial = await startMixed(page); await answerTimed(page, timedQuestions[0]); await failAttemptWrites(page);
  const failed = await expireWithFailedWrite(page);
  expect(failed.attempts).toEqual([]); expect(failed.clock.timing.status).toBe('closing');
  expect(await page.evaluate(() => NOA_EXAM_SHELL.canInteract())).toBe(false);
  expect(failed.answers).toHaveLength(4);
  await page.evaluate(() => { Storage.prototype.setItem = __timedNativeSetItem; });
  await page.locator('#noaTimedRetryClosure').click();
  const result = await waitClosed(page); const attempt = assertClosed(result, { score: 1, total: 4, omitted: 3 });
  expect(attempt.id).toBe(initial.clock.timing.attemptId);
  expect(result.memory).toMatchObject({ sessions: 1, totalSeen: 1 });
});

test('recupera checkpoint de cierre tras fallo sin duplicar omisiones', async ({ page }) => {
  const initial = await startMixed(page); await answerTimed(page, timedQuestions[0]); await failAttemptWrites(page);
  const failed = await expireWithFailedWrite(page); expect(failed.stored.activeExam.clock.timing.status).toBe('closing');
  await page.evaluate(() => { Storage.prototype.setItem = __timedNativeSetItem; });
  await reload(page); const result = await waitClosed(page); assertClosed(result, { score: 1, total: 4, omitted: 3 });
  expect(result.clock.timing.attemptId).toBe(initial.clock.timing.attemptId);
});

test('checkpoint antiguo de intento guardado no resucita sesión ni exposición', async ({ page }) => {
  await startMixed(page); await answerTimed(page, timedQuestions[0]); await page.evaluate(() => NOA_EXAM_RECOVERY.save());
  const checkpoint = (await state(page)).active;
  const closed = await expire(page);
  await page.evaluate(snapshot => { db.activeExam = snapshot; localStorage.setItem(KEY, JSON.stringify(db)); }, checkpoint);
  await reload(page); const result = await state(page);
  expect(result.attempts).toEqual(closed.attempts); expect(result.memory).toEqual(closed.memory);
  expect(result.stored).not.toHaveProperty('activeExam');
});

test('callback y plazo de sesión anterior no responden al entrenamiento nuevo', async ({ page }) => {
  await startMixed(page); await navigateTimed(page, 1); await prepareInteractive(page, timedQuestions[1]);
  expect(await holdSubmit(page, 'drag_classify')).toBe(1);
  await page.evaluate(queue => {
    document.getElementById('noaExamTimed').checked = false;
    NOA_MIXED_EXAM.start(queue.map(question => ({ ...question, id: 'new-' + question.id })), 'Nueva sesión');
    __timedHeldRecords.forEach(record => record());
  }, timedQuestions);
  await page.clock.fastForward(120001);
  const result = await state(page);
  expect(result.clock).not.toHaveProperty('timing'); expect(result.answers).toEqual([]);
  expect(result.attempts).toEqual([]); expect(result.score).toBe(0);
  expect(result.queue.every(question => question.id.startsWith('new-'))).toBe(true);
  expect(result.topics[0].attempts).toBe(0);
});

test('expirar y comenzar otra sesión en el mismo turno conserva ambos estados', async ({ page }) => {
  const initial = await startMixed(page); await page.clock.setSystemTime(new Date(initial.clock.timing.deadlineAt));
  await page.evaluate(async queue => {
    const pending = NOA_EXAM_SHELL.expire();
    document.getElementById('noaExamTimed').checked = false;
    NOA_MIXED_EXAM.start(queue.map(question => ({ ...question, id: 'same-turn-' + question.id })), 'Nueva sesión inmediata');
    await pending;
  }, timedQuestions);
  await page.clock.runFor(200); await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.whenIdle());
  const result = await state(page);
  expect(result.attempts).toHaveLength(1); expect(result.attempts[0].id).toBe(initial.clock.timing.attemptId);
  expect(result.attempts[0].answers.filter(answer => answer.omitted)).toHaveLength(4);
  expect(result.answers).toEqual([]); expect(result.score).toBe(0); expect(result.index).toBe(0);
  expect(result.queue.every(question => question.id.startsWith('same-turn-'))).toBe(true);
  expect(result.clock).not.toHaveProperty('timing');
});

async function startManual(page) {
  await page.evaluate(() => {
    db.questions = Array.from({ length: 5 }, (_, index) => ({ id: 'manual-timed-' + index,
      topicId: 'test-topic', text: 'Suma manual ' + index + ' + 1', options: ['1', '2', '3', '4'], correct: 0, explain: 'Fixture manual' }));
    save(); renderExam();
  });
  await setTimed(page); await page.locator('#examCount').selectOption('5');
  await page.getByRole('button', { name: 'Generar simulacro', exact: true }).click();
  await page.clock.runFor(200);
  await page.locator('#examBox button[onclick="answerExam(0)"]').click();
  await page.clock.runFor(200);
}

test('manual usa configuración común y omisiones sin dificultad inventada', async ({ page }) => {
  await startManual(page); const started = await state(page); expect(started.clock.timing).toBeTruthy();
  expect(await page.evaluate(() => NOA_MIXED_EXAM.state().mixedMode)).toBe(false);
  const result = await expire(page); assertClosed(result, { score: 1, total: 5, omitted: 4 });
  expect(result.topics[0]).toMatchObject({ attempts: 1, correct: 1 });
  expect(result.calibration.sample).toBe(0);
  expect(result.attempts[0].answers.every(answer => !answer.blueprint)).toBe(true);
});

test('manual sin interactionType recupera cierre pendiente después de fallo', async ({ page }) => {
  await startManual(page); const initial = await state(page); await failAttemptWrites(page);
  const failed = await expireWithFailedWrite(page);
  expect(failed.answers.filter(answer => answer.omitted).every(answer => answer.interactionType === 'single_select')).toBe(true);
  await page.evaluate(() => { Storage.prototype.setItem = __timedNativeSetItem; });
  await reload(page); const result = await waitClosed(page); assertClosed(result, { score: 1, total: 5, omitted: 4 });
  expect(result.attempts[0].id).toBe(initial.clock.timing.attemptId);
});

test('45 reactivos conservan distribución y trazabilidad al vencer', async ({ page }, testInfo) => {
  const plan = await page.evaluate(templates => {
    db.masterSyllabus.items = NOA_EXCOBA_FIX_V5.items.map(item => ({ ...item }));
    db.subjects = NOA_EXCOBA_V4.subjects.map((item, index) => ({ id: 'timed-subject-' + index, name: item.value }));
    db.topics = db.subjects.map((item, index) => ({ id: 'timed-topic-' + index, subjectId: item.id, name: 'Tema ' + index, attempts: 0, correct: 0 }));
    const plan = NOA_EXAM_PLAN_V25.build();
    window.__timed45 = plan.slots.map((entry, index) => {
      const slot = entry.blueprintSlot, template = structuredClone(templates.find(question => question.interactionType === slot.interactionType));
      const suffix = ' [45 posición ' + index + ']';
      if (template.text) template.text += suffix; if (template.stem) template.stem += suffix;
      delete template.blueprint;
      return { ...template, id: 'timed45-' + index, topicId: db.topics.find(topic => db.subjects.find(subject => subject.id === topic.subjectId)?.name === entry.subject).id,
        subject: entry.subject, groupId: entry.groupId, planSlotId: entry.id, slotId: slot.slotId,
        blueprintSlot: structuredClone(slot), difficulty: slot.difficulty.level,
        sourceType: slot.sourceType, requestedSourceType: slot.requestedSourceType, sourceTrace: structuredClone(slot.source),
        syllabusCode: slot.syllabusCodes[0] || '', syllabusCodes: structuredClone(slot.syllabusCodes), judge: { qualityScore: 9.5, accepted: true }, accepted: true };
    });
    save(); return { total: plan.total, groups: plan.groups.map(group => [group.id, group.requiredCount]), subjects: plan.subjects.map(subject => subject.id) };
  }, timedQuestions);
  expect(plan.total).toBe(45); expect(plan.subjects).toHaveLength(9);
  expect(plan.groups).toEqual([['primary', 10], ['secondary', 20], ['medicine', 15]]);
  await setTimed(page); await page.evaluate(() => NOA_MIXED_EXAM.start(__timed45, '45 cronometrado sintético')); await page.clock.runFor(200);
  const first = await page.evaluate(() => examQueue[0]); await answerTimed(page, first);
  const result = await expire(page), attempt = assertClosed(result, { score: 1, total: 45, omitted: 44 });
  expect(new Set(attempt.answers.map(answer => answer.planSlotId)).size).toBe(45);
  expect(new Set(attempt.answers.map(answer => answer.subject)).size).toBe(9);
  expect(result.topics.reduce((sum, topic) => sum + topic.attempts, 0)).toBe(1);
  expect(result.memory).toMatchObject({ uniqueQuestions: 1, totalSeen: 1, sessions: 1 });
  for (const answer of attempt.answers) {
    const question = result.queue.find(question => question.id === answer.questionId);
    expect(answer.blueprintSlot).toEqual(question.blueprintSlot); expect(answer.sourceTrace).toEqual(question.sourceTrace);
  }
  await testInfo.attach('45-cierre-y-trazabilidad', { body: JSON.stringify({ plan, attempt, memory: result.memory, topics: result.topics }, null, 2), contentType: 'application/json' });
});

test('respaldo recupera deadline aun con configuración actual inválida', async ({ page }) => {
  const initial = await startMixed(page); await answerTimed(page, timedQuestions[0]); await page.evaluate(() => NOA_EXAM_RECOVERY.save());
  const backup = await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.createBackup()); expect(backup.ok).toBe(true);
  await page.clock.runFor(10000); await page.evaluate(() => { document.getElementById('noaExamDurationMinutes').value = '0'; });
  const restored = await page.evaluate(payload => NOA_QUESTION_MEMORY_V25_2.restoreBackup(payload), backup.backup);
  expect(restored.ok).toBe(true); await page.evaluate(() => NOA_EXAM_RECOVERY.recover()); await page.clock.runFor(200);
  const current = await state(page);
  expect(current.clock.timing.deadlineAt).toBe(initial.clock.timing.deadlineAt);
  expect(current.clock.timing.attemptId).toBe(initial.clock.timing.attemptId); expect(current.score).toBe(1);
  const result = await expire(page); assertClosed(result, { score: 1, total: 4, omitted: 3 });
  const completed = await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.createBackup()); expect(completed.ok).toBe(true);
  expect((await page.evaluate(payload => NOA_QUESTION_MEMORY_V25_2.restoreBackup(payload), completed.backup)).ok).toBe(true);
  expect((await state(page)).attempts).toEqual(result.attempts);
});

test('generación de IA pendiente no consume tiempo antes de iniciar examen', async ({ page }) => {
  await setTimed(page); await mockBatch(page, 'deferred');
  await page.locator('#noaGeneratorSubject').selectOption(subject); await page.locator('#noaGeneratorGenerate').click();
  await page.clock.runFor(200); await page.waitForFunction(() => !!window.__batchPending);
  await page.clock.fastForward(300000);
  expect((await state(page)).clock).not.toHaveProperty('timing');
  expect((await state(page)).attempts).toEqual([]);
  const now = await page.evaluate(() => Date.now());
  await page.evaluate(() => __batchPending.resolve()); await page.clock.runFor(200);
  await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación completada');
  const result = await state(page);
  expect(result.clock.timing.startedAt).toBeGreaterThanOrEqual(now);
  expect(result.clock.timing.deadlineAt - result.clock.timing.startedAt).toBe(60000);
  expect(result.answers).toEqual([]); expect(result.attempts).toEqual([]);
});

test('lectura de verificación fallida reutiliza el intento durable sin sobrescribirlo', async ({ page }) => {
  const initial = await startMixed(page); await answerTimed(page, timedQuestions[0]);
  await page.evaluate(() => {
    window.__timedNativeSetItem = Storage.prototype.setItem; window.__timedNativeGetItem = Storage.prototype.getItem;
    const target = NOA_EXAM_SHELL.state().timing.attemptId;
    window.__timedFailedReads = 0; window.__timedSavedAttempt = null;
    Storage.prototype.setItem = function(key, value) {
      const stored = key === KEY ? JSON.parse(value).attempts?.find(attempt => attempt.id === target) : null;
      const result = __timedNativeSetItem.call(this, key, value);
      if (stored && !__timedSavedAttempt) { __timedSavedAttempt = structuredClone(stored); __timedFailedReads = 2; }
      return result;
    };
    Storage.prototype.getItem = function(key) {
      if (key === KEY && __timedFailedReads > 0) { __timedFailedReads--; throw new Error('Lectura de verificación sintética fallida'); }
      return __timedNativeGetItem.call(this, key);
    };
  });
  const remaining = await page.evaluate(() => NOA_EXAM_SHELL.state().timing.deadlineAt - Date.now());
  await page.clock.fastForward(remaining + 1);
  await expect(page.locator('#noaTimedRetryClosure')).toBeVisible();
  const saved = await page.evaluate(() => structuredClone(__timedSavedAttempt));
  expect(saved.id).toBe(initial.clock.timing.attemptId);
  expect(saved.at).toBe(new Date(initial.clock.timing.deadlineAt).toISOString());
  expect(await page.evaluate(() => JSON.parse(__timedNativeGetItem.call(localStorage, KEY)).attempts.find(attempt => attempt.id === __timedSavedAttempt.id))).toEqual(saved);
  await page.evaluate(() => { Storage.prototype.getItem = __timedNativeGetItem; Storage.prototype.setItem = __timedNativeSetItem; });
  await page.locator('#noaTimedRetryClosure').click();
  const result = await waitClosed(page);
  expect(result.attempts).toEqual([saved]); expect(result.stored.attempts).toEqual([saved]);
  expect(result.activity.filter(item => String(item.text || item.label || '').includes('Simulacro:')).length).toBeLessThanOrEqual(1);
  expect(result.memory).toMatchObject({ sessions: 1, totalSeen: 1 });
});

test.describe('cronómetro con Service Worker real', () => {
  test.use({ serviceWorkers: 'allow' });
  test('recuperación y cierre funcionan offline con caché aislada', async ({ page, context }) => {
    const initial = await startMixed(page); await answerTimed(page, timedQuestions[0]);
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.evaluate(() => NOA_EXAM_RECOVERY.save()); await context.setOffline(true); await reload(page);
    expect((await state(page)).clock.timing.deadlineAt).toBe(initial.clock.timing.deadlineAt);
    const result = await expire(page); assertClosed(result, { score: 1, total: 4, omitted: 3 });
    expect(result.memory).toMatchObject({ ok: true, uniqueQuestions: 1, totalSeen: 1, sessions: 1 });
    const names = await page.evaluate(async () => {
      const scope = (await navigator.serviceWorker.getRegistration()).scope;
      return (await caches.keys()).filter(name => name.startsWith('noa-mobile:' + encodeURIComponent(scope) + ':'));
    });
    expect(names).toHaveLength(1); expect(names[0]).toMatch(/:v6-78$/);
  });
});


// A submitted interactive response can still be waiting for its zero-delay
// recorder when another navigation action arrives. Exercise both clock modes.
for (const timed of [false, true]) {
  for (const type of formats.filter(type => type !== 'single_select')) {
    const mode = timed ? 'cronometrado' : 'sin tiempo';
    test('respuesta pendiente ' + type + ' se registra antes de navegar en 45 ' + mode, async ({ page }) => {
      const queue = Array.from({ length: 45 }, (_, index) => {
        const template = structuredClone(timedQuestions[index % timedQuestions.length]);
        return { ...template, id: 'pending-navigation-' + index };
      });
      await startMixed(page, queue, timed);
      const current = queue.findIndex(question => question.interactionType === type);
      const next = current + 1;
      await navigateTimed(page, current);
      await prepareInteractive(page, queue[current]);
      const held = await holdSubmit(page, type, { navigateTo: next });
      expect(held.held).toBe(1);
      expect(held.registeredBeforeAction).toBe(0);
      await page.clock.runFor(200);
      const recorded = await state(page);
      expect(recorded.index).toBe(next);
      expect(recorded.answers).toHaveLength(1);
      expect(recorded.answers[0]).toMatchObject({ questionId: queue[current].id, ok: true, scoreFraction: 1 });
      expect(recorded.score).toBe(1);
      expect(recorded.topics[0]).toMatchObject({ attempts: 1, correct: 1 });
      expect(recorded.attempts).toEqual([]);
      if (timed) expect(recorded.clock.timing.status).toBe('open');
      else expect(recorded.clock).not.toHaveProperty('timing');
      await page.evaluate(() => __timedHeldRecords.forEach(record => record()));
      await page.clock.runFor(200);
      const repeated = await state(page);
      expect(repeated.answers).toEqual(recorded.answers);
      expect(repeated.score).toBe(recorded.score);
      expect(repeated.topics).toEqual(recorded.topics);
      expect(repeated.index).toBe(next);
    });

    test('última respuesta pendiente ' + type + ' se registra antes de finalizar ' + mode, async ({ page }) => {
      const question = timedQuestions.find(question => question.interactionType === type);
      const queue = [...timedQuestions.filter(item => item.interactionType !== type), question];
      await startMixed(page, queue, timed);
      for (let index = 0; index < queue.length - 1; index++) {
        await navigateTimed(page, index);
        await answerTimed(page, queue[index]);
      }
      await navigateTimed(page, queue.length - 1);
      await prepareInteractive(page, question);
      const held = await holdSubmit(page, type, { finish: true });
      expect(held.held).toBe(1);
      expect(held.registeredBeforeAction).toBe(queue.length - 1);
      await page.clock.runFor(200);
      await page.evaluate(() => __timedPendingFinish);
      const closed = await waitClosed(page);
      expect(closed.attempts).toHaveLength(1);
      expect(closed.attempts[0]).toMatchObject({ score: 4, total: 4 });
      expect(closed.attempts[0].answers).toHaveLength(4);
      expect(closed.attempts[0].answers.find(answer => answer.questionId === question.id))
        .toMatchObject({ ok: true, scoreFraction: 1 });
      expect(closed.answers.some(answer => answer.omitted === true)).toBe(false);
      expect(closed.topics[0]).toMatchObject({ attempts: 4, correct: 4 });
      expect(closed.memory).toMatchObject({ uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
      if (timed) expect(closed.attempts[0].finishReason).toBe('manual');
      else expect(closed.attempts[0]).not.toHaveProperty('timing');
      await page.evaluate(() => __timedHeldRecords.forEach(record => record()));
      await page.clock.runFor(200);
      const repeated = await state(page);
      expect(repeated.attempts).toEqual(closed.attempts);
      expect(repeated.answers).toEqual(closed.answers);
      expect(repeated.topics).toEqual(closed.topics);
      expect(repeated.memory).toEqual(closed.memory);
    });
  }
}
