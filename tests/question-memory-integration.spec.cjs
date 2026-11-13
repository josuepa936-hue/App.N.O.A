const { test, expect } = require('@playwright/test');
const { start, answer, navigate, snapshot } = require('./fixtures.cjs');
const { openGenerator, activeSession, mockBatch } = require('./generator-fixtures.cjs');
const { waitDraftCheckpoint } = require('./exam-45-ui-fixtures.cjs');
const { memoryQuestions, at, memoryState } = require('./question-memory-fixtures.cjs');
const { installAttemptSpy, generateExam, answerAll, finish, state, seedMemory, downloadBackup, importBackup } = require('./question-memory-integration-fixtures.cjs');

test.beforeEach(async ({ page }) => {
  page.memoryIntegrationErrors = [];
  page.memoryIntegrationRequests = [];
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && (url.origin !== 'http://127.0.0.1:8022' || !['GET', 'HEAD'].includes(request.method()))) {
      page.memoryIntegrationRequests.push({ url: url.href, method: request.method() });
      return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', error => page.memoryIntegrationErrors.push(error.message));
  await openGenerator(page);
  await page.waitForFunction(() => typeof window.NOA_QUESTION_MEMORY_V25_2?.recordSavedAttempt === 'function');
  await page.clock.setFixedTime(new Date(at[0]));
  await page.evaluate(() => {
    window.__memoryIntegrationAi = 0;
    window.callAI = async () => { __memoryIntegrationAi++; throw new Error('IA real prohibida en integración de memoria.'); };
  });
  await installAttemptSpy(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.whenIdle());
  const evidence = await page.evaluate(() => ({
    aiCalls: window.__memoryIntegrationAi ?? 0,
    stats: NOA_QUESTION_MEMORY_V25_2.stats(),
    diagnostics: NOA_QUESTION_MEMORY_V25_2.diagnostics(),
    attemptCalls: window.__memoryAttemptCalls || [], attempts: db.attempts.length
  }));
  expect(evidence.aiCalls).toBe(0);
  expect(page.memoryIntegrationRequests).toEqual([]);
  expect(page.memoryIntegrationErrors).toEqual([]);
  await testInfo.attach('integracion-memoria-red-diagnosticos', { body: JSON.stringify({ ...evidence,
    requests: page.memoryIntegrationRequests, errors: page.memoryIntegrationErrors }, null, 2), contentType: 'application/json' });
});

for (const count of [5, 10, 45]) {
  test(`memoria integra un examen real de ${count} reactivos después de guardar su intento`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    page.on('dialog', dialog => dialog.accept());
    const queue = await generateExam(page, count);
    expect(queue).toHaveLength(count);
    expect(new Set(queue.map(question => question.interactionType)).size).toBe(4);
    const partial = queue.findIndex(question => question.interactionType !== 'single_select');
    await answerAll(page, queue, partial);
    expect((await state(page)).stats.uniqueQuestions).toBe(0);
    await finish(page);
    await expect(page.locator('#examBox > h2')).toHaveText(`Resultado: ${count - .5} / ${count}`);
    const saved = await state(page), attempt = saved.db.attempts[0];
    expect(saved.db.attempts).toHaveLength(1);
    expect(saved.calls).toEqual([{ id: attempt.id, total: count, persisted: true }]);
    expect(saved.stats).toMatchObject({ ok: true, uniqueQuestions: count, totalSeen: count, sessions: 1 });
    expect(saved.entries).toHaveLength(count);
    expect(saved.entries.every(entry => entry.timesSeen === 1 && entry.sessionId === 'history:' + attempt.id)).toBe(true);
    expect(attempt).toMatchObject({ score: count - .5, total: count });
    expect(saved.answers).toHaveLength(count);
    expect(saved.calibration.sample).toBe(0); // No explicit student declaration in this fixture.
    expect(await page.evaluate(() => db.topics.reduce((sum, topic) => sum + topic.attempts, 0))).toBe(count);
    await testInfo.attach(`examen-finalizado-memoria-${count}`, { body: JSON.stringify({ queue, attempt,
      entries: saved.entries, stats: saved.stats, calls: saved.calls, calibration: saved.calibration }, null, 2), contentType: 'application/json' });
  });
}

test('memoria no vuelve a registrar un intento al renderizar resultados, finalizar de nuevo ni recargar', async ({ page }) => {
  await start(page, memoryQuestions); await answerAll(page, memoryQuestions); await finish(page);
  const first = await state(page);
  await page.evaluate(() => { renderExam(); renderExam(); NOA_EXAM_NAVIGATION.finishExam(); });
  await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.whenIdle());
  const repeated = await state(page);
  expect(repeated.rawMemory).toBe(first.rawMemory);
  expect(repeated.db.attempts).toEqual(first.db.attempts);
  expect(repeated.calls).toHaveLength(1);
  await page.reload(); await page.waitForFunction(() => !!window.NOA_QUESTION_MEMORY_V25_2);
  const reloaded = await state(page);
  expect(reloaded.rawMemory).toBe(first.rawMemory);
  expect(reloaded.db.attempts).toEqual(first.db.attempts);
  expect(reloaded.entries.every(entry => entry.timesSeen === 1)).toBe(true);
});

test('memoria no registra cambios de respuesta o revisión antes del intento final', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  expect((await state(page)).stats.uniqueQuestions).toBe(0);
  expect((await state(page)).calls).toEqual([]);
  await page.locator('#noaRevisionCancel').click();
  await navigate(page, 0); await page.locator('#noaRevisionEdit').click();
  await page.locator('[data-noa-revision-option="1"]').click();
  await expect.poll(() => page.evaluate(() => examAnswers[0].selected)).toBe(1);
  await page.locator('#noaRevisionEdit').click();
  await page.locator('[data-noa-revision-option="0"]').click();
  await expect.poll(() => page.evaluate(() => examAnswers[0].selected)).toBe(0);
  const queue = await page.evaluate(() => structuredClone(examQueue));
  for (let index = 2; index < queue.length; index++) { await navigate(page, index); await answer(page, queue[index]); }
  expect((await state(page)).calls).toEqual([]);
  await finish(page);
  const completed = await state(page);
  expect(completed.stats).toMatchObject({ uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
  expect(completed.calls).toHaveLength(1);
  expect(completed.calibration.sample).toBe(0); // No explicit student declaration in this fixture.
  expect(completed.score).toBe(3.5);
});

test('memoria no registra un examen con preguntas pendientes cuando se intenta finalizar', async ({ page }) => {
  await start(page, memoryQuestions);
  await answer(page, memoryQuestions[0]);
  await page.locator('#noaShellFinish').click();
  await expect(page.locator('#toast')).toContainText('reactivos sin responder');
  const unfinished = await state(page);
  expect(unfinished.db.attempts).toEqual([]);
  expect(unfinished.stats.uniqueQuestions).toBe(0);
  expect(unfinished.rawMemory).toBeNull();
  expect(unfinished.calls).toEqual([]);
  expect(unfinished.score).toBe(1);
});

for (const mode of ['incomplete', 'error']) {
  test(`memoria no registra ni pierde sesión cuando la generación termina en ${mode}`, async ({ page }) => {
    await activeSession(page); await waitDraftCheckpoint(page);
    await mockBatch(page, mode);
    const before = await memoryState(page);
    page.on('dialog', dialog => dialog.accept());
    // The active drag editor is a modal overlay; exercise the public generation
    // action while preserving that editor and its draft for this error-path test.
    await page.evaluate(() => NOA_GENERATOR_UI.generate());
    await expect(page.locator('#noaGeneratorPhase')).toHaveText(mode === 'error' ? 'Error del motor' : 'Generación incompleta');
    expect(await memoryState(page)).toEqual(before);
    const failed = await state(page);
    expect(failed.stats.uniqueQuestions).toBe(0);
    expect(failed.calls).toEqual([]);
    expect(failed.rawMemory).toBeNull();
  });
}

test('memoria registra las preguntas completas de una sesión recuperada tras recargar', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  await page.reload();
  await page.waitForFunction(() => !!window.NOA_QUESTION_MEMORY_V25_2 && examQueue.length === 4);
  await installAttemptSpy(page);
  await expect(page.locator('#noaRevisionCancel')).toBeVisible();
  await page.locator('#noaRevisionCancel').click();
  const queue = await page.evaluate(() => structuredClone(examQueue));
  for (let index = 2; index < queue.length; index++) { await navigate(page, index); await answer(page, queue[index]); }
  await finish(page);
  const result = await state(page);
  expect(result.stats).toMatchObject({ uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
  expect(result.calls).toHaveLength(1);
  expect(result.calls[0].persisted).toBe(true);
  expect(result.score).toBe(3.5);
  expect(result.db.attempts).toHaveLength(1);
});

test('memoria fallida conserva el intento persistido, puntuación y diagnóstico identificable', async ({ page }) => {
  await start(page, memoryQuestions); await answerAll(page, memoryQuestions);
  await page.evaluate(() => {
    window.__originalMemorySetItem = Storage.prototype.setItem;
    const memoryKey = NOA_QUESTION_MEMORY_V25_2.storageKey;
    Storage.prototype.setItem = function(name, value) {
      if (name === memoryKey) throw new DOMException('Cuota sintética de memoria', 'QuotaExceededError');
      return __originalMemorySetItem.call(this, name, value);
    };
  });
  await finish(page);
  const result = await state(page);
  await page.evaluate(() => { Storage.prototype.setItem = __originalMemorySetItem; });
  expect(result.score).toBe(4);
  expect(result.db.attempts).toHaveLength(1);
  expect(JSON.parse(result.rawDb).attempts).toHaveLength(1);
  expect(result.rawMemory).toBeNull();
  expect(result.calibration.sample).toBe(0); // No explicit student declaration in this fixture.
  expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ attemptId: result.db.attempts[0].id, error: 'storage_unavailable' })]));
  await expect(page.locator('#examBox > h2')).toHaveText('Resultado: 4 / 4');
});

test('memoria rechaza estructura insuficiente sin inventarla ni modificar el resultado del examen', async ({ page }) => {
  await start(page, memoryQuestions); await answerAll(page, memoryQuestions);
  await page.evaluate(() => { delete examQueue[0].options; });
  await finish(page);
  const result = await state(page);
  expect(result.db.attempts).toHaveLength(1);
  expect(result.score).toBe(4);
  expect(result.answers).toHaveLength(4);
  expect(result.rawMemory).toBeNull();
  expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ attemptId: result.db.attempts[0].id, error: 'invalid_questions' })]));
});

test('memoria no registra un intento cuyo guardado académico no llegó al almacenamiento', async ({ page }) => {
  await start(page, memoryQuestions); await answerAll(page, memoryQuestions);
  await page.evaluate(() => {
    window.__originalAcademicSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === KEY && JSON.parse(value).attempts?.length) throw new DOMException('Guardado académico sintético denegado', 'QuotaExceededError');
      return __originalAcademicSetItem.call(this, name, value);
    };
  });
  await page.evaluate(() => Promise.all([NOA_EXAM_NAVIGATION.finishExam(), NOA_EXAM_NAVIGATION.finishExam()]));
  await expect.poll(() => page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.diagnostics().some(item => !!item.error))).toBe(true);
  await page.evaluate(() => { Storage.prototype.setItem = __originalAcademicSetItem; });
  const result = await state(page);
  expect(JSON.parse(result.rawDb).attempts).toEqual([]);
  expect(result.rawMemory).toBeNull();
  expect(result.stats.uniqueQuestions).toBe(0);
  expect(result.calls).toEqual([]);
  expect(result.score).toBe(4);
  expect(result.answers).toHaveLength(4);
  expect(await page.evaluate(() => examIndex)).toBe(3);
});

test('respaldo descargado incluye memoria validada y excluye credenciales, conexiones y conversaciones', async ({ page }, testInfo) => {
  await seedMemory(page);
  const secrets = ['SYNTHETIC-BRIDGE-TOKEN', 'SYNTHETIC-PASSWORD', 'SYNTHETIC-PRIVATE-URL', 'SYNTHETIC-CHAT-MESSAGE'];
  await page.evaluate(secrets => {
    db.settings.bridgeToken = secrets[0]; db.settings.password = secrets[1];
    db.settings.bridgeUrl = 'https://SYNTHETIC-PRIVATE-URL.invalid'; db.settings.ollamaUrl = 'http://SYNTHETIC-PRIVATE-URL.invalid:11434';
    db.settings.apiKey = secrets[0]; db.conversations = [{ content: secrets[3] }]; db.messages = [{ content: secrets[3] }];
    db.settings.privateConnection = { nested: { token: secrets[0], url: 'https://SYNTHETIC-PRIVATE-URL.invalid' } };
    db.notes = [{ id: 'academic-note', title: 'Nota académica', text: 'Contenido académico que debe conservarse.',
      metadata: { credentials: { accessToken: secrets[0], password: secrets[1] },
        privateConnection: { url: 'https://SYNTHETIC-PRIVATE-URL.invalid' }, conversations: [{ content: secrets[3] }] } }];
    save();
  }, secrets);
  const before = await state(page), backup = await downloadBackup(page), raw = JSON.stringify(backup);
  expect(backup).toMatchObject({ format: 'noa-backup', version: 1 });
  expect(backup.questionMemory).toMatchObject({ version: 1 });
  expect(backup.questionMemory.entries).toHaveLength(1);
  expect(backup.questionMemory.sessions).toHaveLength(1);
  expect(backup.db.notes).toHaveLength(1);
  expect(backup.db.notes[0]).toMatchObject({ id: 'academic-note', title: 'Nota académica', text: 'Contenido académico que debe conservarse.' });
  for (const secret of secrets) expect(raw).not.toContain(secret);
  expect(backup.db.settings).not.toHaveProperty('bridgeToken');
  expect(backup.db.settings).not.toHaveProperty('bridgeUrl');
  expect(backup.db.settings).not.toHaveProperty('ollamaUrl');
  expect(backup.db).not.toHaveProperty('conversations'); expect(backup.db).not.toHaveProperty('messages');
  expect((await state(page)).db).toEqual(before.db);
  await testInfo.attach('respaldo-con-memoria-sin-credenciales', { body: JSON.stringify(backup, null, 2), contentType: 'application/json' });
});

test('respaldo no exporta como válida una memoria corrupta', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem(NOA_QUESTION_MEMORY_V25_2.storageKey, '{broken-memory'));
  const result = await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.createBackup());
  expect(result.ok).toBe(false);
  expect(result.error).toBe('corrupt_storage');
  expect(await page.evaluate(() => localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey))).toBe('{broken-memory');
});

test('restaurar el mismo respaldo dos veces conserva datos y no duplica sesiones', async ({ page }) => {
  await seedMemory(page);
  const backup = await downloadBackup(page);
  backup.db.notes = [{ id: 'restored-note', title: 'Restaurada', text: 'Nota preservada en dos importaciones.' }];
  await page.evaluate(async question => { await NOA_QUESTION_MEMORY_V25_2.recordExam([question], 'will-be-replaced'); }, memoryQuestions[1]);
  await importBackup(page, backup);
  const first = await state(page);
  expect(first.db.notes).toEqual(backup.db.notes);
  expect(first.stats).toMatchObject({ uniqueQuestions: 1, totalSeen: 1, sessions: 1 });
  await importBackup(page, backup);
  const repeated = await state(page);
  expect(repeated.db).toEqual(first.db);
  expect(repeated.rawMemory).toBe(first.rawMemory);
  expect(repeated.stats).toEqual(first.stats);
  expect(repeated.calls).toEqual([]);
});

test('restaurar una copia antigua sin memoria conserva la memoria existente', async ({ page }) => {
  await seedMemory(page); const before = await state(page);
  const legacy = structuredClone(before.db);
  legacy.notes = [{ id: 'legacy-note', title: 'Copia anterior', text: 'Restauración compatible.' }];
  await importBackup(page, legacy);
  const after = await state(page);
  expect(after.db.notes).toEqual(legacy.notes);
  expect(after.rawMemory).toBe(before.rawMemory);
  expect(after.stats).toEqual(before.stats);
});

test('restaurar un respaldo de examen activo conserva revisión y permite finalizar una sola vez', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  const before = await memoryState(page);
  const backup = await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.createBackup());
  expect(backup.ok).toBe(true);
  expect(backup.backup.db.activeExam).toBeTruthy();
  const restored = await page.evaluate(async backup => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    const reset = await memory.resetData();
    if(!reset.ok) return reset;
    return memory.restoreBackup(backup);
  }, backup.backup);
  expect(restored.ok).toBe(true);
  const after = await memoryState(page);
  for(const key of ['queue','index','score','answers','drafts','revision']) expect(after[key], key).toEqual(before[key]);
  await expect(page.locator('#noaRevisionCancel')).toBeVisible();
  await page.locator('#noaRevisionCancel').click();
  const queue = await page.evaluate(() => structuredClone(examQueue));
  for(let index = 2; index < queue.length; index++) { await navigate(page,index); await answer(page,queue[index]); }
  await finish(page);
  const result = await state(page);
  expect(result.stats).toMatchObject({uniqueQuestions:4,totalSeen:4,sessions:1});
  expect(result.db.attempts).toHaveLength(1);
  expect(result.score).toBe(3.5);
});

for (const kind of ['json', 'academic', 'memory', 'course-source', 'course-analysis', 'missing-fields', 'format']) {
  test(`restauración ${kind} inválida no reemplaza base ni memoria`, async ({ page }) => {
    await seedMemory(page); const backup = await downloadBackup(page);
    let invalid = structuredClone(backup);
    if (kind === 'json') invalid = '{broken backup';
    if (kind === 'academic') invalid.db.attempts = 'invalid attempts';
    if (kind === 'memory') invalid.questionMemory.entries = [null];
    if (kind === 'course-source') invalid.db.courseSources = [{ id: 'invalid-course', subject: 'EXCOBA Medicina · Biología', title: 'Fuente sin contenido' }];
    if (kind === 'course-analysis') invalid.db.courseSources = [{ id: 'invalid-analysis', subject: 'EXCOBA Medicina · Biología', title: 'Fuente', content: 'Contenido académico.', analysis: { concepts: 'not-an-array' } }];
    if (kind === 'missing-fields') invalid = {version:6};
    if (kind === 'format') invalid = {...backup.db,format:'another-application'};
    const before = await state(page);
    await importBackup(page, invalid, false);
    const after = await state(page);
    expect(after.rawDb).toBe(before.rawDb);
    expect(after.rawMemory).toBe(before.rawMemory);
    expect(after.db).toEqual(before.db);
  });
}

test('restauración revierte ambas claves cuando falla la segunda escritura', async ({ page }) => {
  await seedMemory(page); const original = await downloadBackup(page);
  await page.evaluate(async question => NOA_QUESTION_MEMORY_V25_2.recordExam([question], 'second-snapshot-session'), memoryQuestions[1]);
  const target = await downloadBackup(page); target.db.notes = [{ id: 'partial-must-not-remain', title: 'Otra copia', text: 'No debe quedar parcialmente restaurada.' }];
  await importBackup(page, original);
  const before = await state(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem, key = KEY;
    let failed = false; window.__restoreSetItem = original;
    Storage.prototype.setItem = function(name, value) {
      if (name === key && !failed) { failed = true; throw new DOMException('Segunda escritura sintética denegada', 'QuotaExceededError'); }
      return original.call(this, name, value);
    };
  });
  await importBackup(page, target, false);
  await page.evaluate(() => { Storage.prototype.setItem = __restoreSetItem; });
  const after = await state(page);
  expect(after.rawDb).toBe(before.rawDb); expect(after.rawMemory).toBe(before.rawMemory);
  expect(after.db).toEqual(before.db);
});

test('restauración informa rollback fallido si el almacenamiento también rechaza revertir', async ({ page }) => {
  await seedMemory(page); const original = await downloadBackup(page);
  await page.evaluate(question => NOA_QUESTION_MEMORY_V25_2.recordExam([question], 'rollback-target-extra'), memoryQuestions[1]);
  const target = await downloadBackup(page);
  await importBackup(page, original);
  const before = await state(page);
  target.db.notes = [{ id: 'different-restoration', title: 'Otra copia', text: 'Contenido académico.' }];
  await page.evaluate(() => {
    const memory = NOA_QUESTION_MEMORY_V25_2, nativeRestore = memory.restoreBackup;
    memory.restoreBackup = async function(...args) {
      const result = await nativeRestore.apply(this, args); window.__restoreOutcome = result; return result;
    };
    const original = Storage.prototype.setItem, memoryKey = memory.storageKey;
    let academicWrites = 0, memoryWrites = 0; window.__rollbackSetItem = original;
    Storage.prototype.setItem = function(name, value) {
      if (name === KEY && ++academicWrites === 1) throw new DOMException('Segunda escritura sintética denegada', 'QuotaExceededError');
      if (name === memoryKey && ++memoryWrites > 1) throw new DOMException('Rollback sintético denegado', 'SecurityError');
      return original.call(this, name, value);
    };
  });
  const message = await importBackup(page, target, false);
  await page.evaluate(() => { Storage.prototype.setItem = __rollbackSetItem; });
  const outcome = await page.evaluate(() => __restoreOutcome);
  expect(outcome.ok).toBe(false); expect(outcome.rollbackFailed).toBe(true);
  expect(message).not.toBe('Copia restaurada');
  expect((await state(page)).diagnostics.some(item => !!item.error)).toBe(true);
  expect((await state(page)).stats).toMatchObject({ok:false,error:'rollback_failed'});
  const repaired = await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.createBackup());
  expect(repaired.ok).toBe(true);
  const after = await state(page);
  expect(after.rawDb).toBe(before.rawDb); expect(after.rawMemory).toBe(before.rawMemory);
});

test('cancelar borrar todos conserva los dos almacenamientos', async ({ page }) => {
  await seedMemory(page); const before = await state(page);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#nav button[data-page="backup"]').click();
  await page.getByRole('button', { name: 'Borrar todos los datos', exact: true }).click();
  await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.whenIdle());
  const after = await state(page);
  expect(after.rawDb).toBe(before.rawDb); expect(after.rawMemory).toBe(before.rawMemory);
});

test('borrar todos elimina base y memoria propias conservando claves de otras aplicaciones', async ({ page }) => {
  await seedMemory(page);
  await page.evaluate(() => {
    localStorage.setItem('OtherProject:data', 'otro dato sintético');
    localStorage.setItem('NOA_QUESTION_MEMORY_V25_2:/OtherProject/', 'memoria ajena sintética');
  });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#nav button[data-page="backup"]').click();
  await page.getByRole('button', { name: 'Borrar todos los datos', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Datos borrados');
  const after = await page.evaluate(() => ({ dbKey: localStorage.getItem(KEY), memory: localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey),
    attempts: db.attempts, topics: db.topics, foreign: localStorage.getItem('OtherProject:data'),
    foreignMemory: localStorage.getItem('NOA_QUESTION_MEMORY_V25_2:/OtherProject/') }));
  expect(after).toEqual({ dbKey: null, memory: null, attempts: [], topics: [], foreign: 'otro dato sintético', foreignMemory: 'memoria ajena sintética' });
});

test('borrado fallido conserva datos y no informa éxito completo', async ({ page }) => {
  await seedMemory(page); const before = await state(page);
  await page.evaluate(() => {
    const original = Storage.prototype.removeItem, key = NOA_QUESTION_MEMORY_V25_2.storageKey;
    window.__resetRemoveItem = original;
    Storage.prototype.removeItem = function(name) {
      if (name === key) throw new DOMException('Borrado sintético denegado', 'SecurityError');
      return original.call(this, name);
    };
  });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#nav button[data-page="backup"]').click();
  await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
  await page.getByRole('button', { name: 'Borrar todos los datos', exact: true }).click();
  await page.waitForFunction(() => !!document.querySelector('#toast').textContent.trim());
  expect(await page.locator('#toast').textContent()).not.toBe('Datos borrados');
  await page.evaluate(() => { Storage.prototype.removeItem = __resetRemoveItem; });
  const after = await state(page);
  expect(after.rawDb).toBe(before.rawDb); expect(after.rawMemory).toBe(before.rawMemory);
  expect(after.db).toEqual(before.db);
});

for (const operation of ['reset', 'restore']) {
  test(`${operation} impide que un hash anterior resucite la memoria después de completarse`, async ({ page }) => {
    await seedMemory(page); const backup = await downloadBackup(page);
    await page.evaluate(question => {
      const original = crypto.subtle.digest;
      window.__epochOriginalDigest = original;
      const gate = new Promise(resolve => { window.__releaseOldDigest = resolve; });
      crypto.subtle.digest = async function(...args) { await gate; return original.apply(this, args); };
      window.__epochOldRecord = NOA_QUESTION_MEMORY_V25_2.recordExam([question], 'old-job-must-not-commit');
    }, memoryQuestions[1]);
    const result = await page.evaluate(async ({ operation, backup }) => {
      const memory = NOA_QUESTION_MEMORY_V25_2;
      const changed = operation === 'reset' ? await memory.resetData() : await memory.restoreBackup(backup);
      const afterOperation = localStorage.getItem(memory.storageKey);
      __releaseOldDigest(); await __epochOldRecord;
      crypto.subtle.digest = __epochOriginalDigest;
      await memory.whenIdle();
      return { changed, afterOperation, final: localStorage.getItem(memory.storageKey), stats: memory.stats() };
    }, { operation, backup });
    expect(result.changed.ok).toBe(true);
    expect(result.final).toBe(result.afterOperation);
    expect(result.stats.uniqueQuestions).toBe(operation === 'reset' ? 0 : 1);
  });
}

test.describe('integración de memoria con Service Worker real', () => {
  test.use({ serviceWorkers: 'allow' });
  test('examen y respaldo con memoria funcionan después de recargar offline con caché v80', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cached = await page.evaluate(async () => {
      const scope = (await navigator.serviceWorker.getRegistration()).scope;
      const names = (await caches.keys()).filter(name => name.startsWith(`noa-mobile:${encodeURIComponent(scope)}:`));
      return { names, memory: !!await (await caches.open(names[0])).match(new URL('excoba_patch_v25_question_memory.js', scope).href) };
    });
    expect(cached.names).toHaveLength(1); expect(cached.names[0]).toMatch(/:v6-97$/); expect(cached.memory).toBe(true);
    await context.setOffline(true); await page.reload();
    await page.waitForFunction(() => !!window.NOA_QUESTION_MEMORY_V25_2);
    await installAttemptSpy(page); await start(page, memoryQuestions); await answerAll(page, memoryQuestions); await finish(page);
    const result = await state(page);
    expect(result.stats).toMatchObject({ uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
    const backup = await downloadBackup(page);
    expect(backup.questionMemory.entries).toHaveLength(4);
    expect(backup.db.attempts).toHaveLength(1);
  });
});
