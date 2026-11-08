const { test, expect } = require('@playwright/test');
const { activeSession } = require('./generator-fixtures.cjs');
const { waitDraftCheckpoint } = require('./exam-45-ui-fixtures.cjs');
const { answer, navigate } = require('./fixtures.cjs');
const { finish } = require('./question-memory-integration-fixtures.cjs');
const { biology, formats, openDiversity, installDiversity, batch, multi, fixture,
  seedHistorical, academicState, rawMemory, completeExam } = require('./question-diversity-integration-fixtures.cjs');

test.beforeEach(async ({ page }) => {
  page.diversityErrors = []; page.diversityRequests = [];
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) &&
      (url.origin !== 'http://127.0.0.1:8022' || !['GET', 'HEAD'].includes(request.method()))) {
      page.diversityRequests.push({ url: url.href, method: request.method() }); return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', error => page.diversityErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.diversityErrors.push(message.text()); });
  page.on('dialog', dialog => dialog.accept());
  await openDiversity(page); await installDiversity(page);
});

test.afterEach(async ({ page }, testInfo) => {
  const evidence = await page.evaluate(() => ({
    forbidden: __diversityFixture?.forbidden ?? { ai: 0, fetch: 0 },
    calls: __diversityFixture?.calls.length ?? 0,
    contains: __diversityFixture?.contains.length ?? 0,
    writes: __diversityFixture?.writes ?? [],
    stats: NOA_QUESTION_MEMORY_V25_2.stats()
  }));
  expect(evidence.forbidden).toEqual({ ai: 0, fetch: 0 });
  expect(page.diversityBeforeReloadForbidden ?? { ai: 0, fetch: 0 }).toEqual({ ai: 0, fetch: 0 });
  expect(page.diversityRequests).toEqual([]); expect(page.diversityErrors).toEqual([]);
  await testInfo.attach('diversidad-integrada-red-consola-y-memoria', {
    body: JSON.stringify({ ...evidence, requests: page.diversityRequests, errors: page.diversityErrors }, null, 2),
    contentType: 'application/json'
  });
});

async function forceFormat(page, type) {
  await page.evaluate(type => NOA_BATCH_ORCHESTRATOR.supportedTypes.splice(
    0, NOA_BATCH_ORCHESTRATOR.supportedTypes.length, type), type);
}

async function configure(page, values) {
  await page.evaluate(values => Object.assign(__diversityFixture.config, values), values);
}

function expectLocked(replacement) {
  for (const key of ['slotId','subject','index','difficulty','calibratorDifficulty',
    'interactionType','requestedSourceType','locked']) {
    expect(replacement.result[key], key).toEqual(replacement.original[key]);
  }
  expect(replacement.result.sourceType).toBe(replacement.original.sourceType);
  expect(replacement.result.source).toBeTruthy();
  expect(replacement.result.topicDiversity).toHaveProperty('codeChanged');
}

for (const count of [5, 10]) {
  test('diversidad v24 genera ' + count + ' con motores reales, rotación y memoria vacía', async ({ page }, testInfo) => {
    const before = await rawMemory(page);
    await page.locator('#noaGeneratorCount').selectOption(String(count));
    await page.locator('#noaGeneratorGenerate').click();
    await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación completada');
    await expect(page.locator('#noaGeneratorHistory')).toContainText(/historial vacío/i);
    const result = await fixture(page), queue = await page.evaluate(() => structuredClone(examQueue));
    expect(queue).toHaveLength(count);
    expect(new Set(queue.map(question => question.interactionType)).size).toBe(4);
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].options).toMatchObject({ blueprintCount: count, limit: count,
      diversifyTopics: true, avoidHistoryDuplicates: true });
    expect(result.batches[0].result.diagnostics).toMatchObject({ accepted: count, internalDuplicates: 0,
      historicalDuplicates: 0, replacements: 0, generationErrors: 0,
      history: { enabled: true, status: 'empty', checked: count, skipped: 0, duplicates: 0, complete: true } });
    expect(result.builds.every(options => options.diversifyTopics === true)).toBe(true);
    expect(queue.every(question => question.blueprintSlot.topicDiversity.enabled)).toBe(true);
    expect(new Set(queue.map(question => question.syllabusCode)).size).toBe(count);
    expect(result.contains.every(call => call.accepted === true && call.judge && call.options?.details === true)).toBe(true);
    expect(result.calls.every(call => Object.keys(call.options).join(',') === 'maxAttempts' && call.options.maxAttempts === 1)).toBe(true);
    expect(result.writes).toEqual([]); expect(await rawMemory(page)).toBe(before);
    await testInfo.attach('v24-rotacion-' + count, { body: JSON.stringify({
      options: result.batches[0].options, diagnostics: result.batches[0].result.diagnostics,
      codes: queue.map(question => question.syllabusCode), formats: queue.map(question => question.interactionType)
    }, null, 2), contentType: 'application/json' });
  });
}

test('diversidad v25 inicia 45 con nueve materias, 10/20/15, prioridad nueva y progreso real', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await seedHistorical(page, { count: 3, session: 'medicine-seen-before-45' });
  const before = await rawMemory(page);
  await page.locator('#noaExam45Generate').click();
  await expect(page.locator('#noaExam45Phase')).toHaveText('Generación completa');
  const result = await fixture(page), queue = await page.evaluate(() => structuredClone(examQueue));
  expect(queue).toHaveLength(45); expect(result.plans).toHaveLength(1);
  const plan = result.plans[0];
  expect(plan.groups.map(group => group.requiredCount)).toEqual([10, 20, 15]);
  expect(plan.subjects).toHaveLength(9);
  expect(plan.slots.every(slot => slot.blueprintSlot.topicDiversity.enabled)).toBe(true);
  for (const subject of plan.subjects) {
    expect(plan.slots.filter(slot => slot.subject === subject.id)).toHaveLength(5);
  }
  const bio = plan.subjects.find(subject => subject.id === biology);
  expect(bio.blueprint.slots.every(slot => slot.topicDiversity.priorFrequency === 0)).toBe(true);
  expect(result.multis[0].options.avoidHistoryDuplicates).toBe(true);
  expect(result.multis[0].result).toMatchObject({ complete: true, accepted: 45,
    diagnostics: { accepted: 45, historicalDuplicates: 0, internalDuplicates: 0, replacements: 0, generationErrors: 0,
      history: { checked: 45, skipped: 0, complete: true } } });
  expect(result.progress.at(-1)).toMatchObject({ requested: 45, accepted: 45, status: 'complete',
    diagnostics: { accepted: 45, history: { complete: true } } });
  expect(result.progress.every(event => event.accepted >= 0 && event.accepted <= 45)).toBe(true);
  expect(new Set(queue.map(question => question.planSlotId)).size).toBe(45);
  expect(await rawMemory(page)).toBe(before);
  await testInfo.attach('v25-plan-rotado-y-diagnosticos', { body: JSON.stringify({
    groups: plan.groups, subjects: plan.subjects.map(subject => ({ id: subject.id,
      codes: subject.blueprint.slots.map(slot => slot.syllabusCodes), traces: subject.blueprint.slots.map(slot => slot.topicDiversity) })),
    diagnostics: result.multis[0].result.diagnostics, progress: result.progress
  }, null, 2), contentType: 'application/json' });
});

test('diversidad mantiene los contratos históricos omitidos o false sin consultar memoria', async ({ page }) => {
  const output = await page.evaluate(async subject => {
    const state = __diversityFixture, start = state.native.statsReads, contains = state.contains.length;
    const omitted = await NOA_BATCH_ORCHESTRATOR.generate({ subject, blueprintCount: 5, limit: 5, concurrency: 1, maxAttempts: 1 });
    const disabled = await NOA_BATCH_ORCHESTRATOR.generate({ subject, blueprintCount: 5, limit: 5, concurrency: 1, maxAttempts: 1,
      diversifyTopics: false, avoidHistoryDuplicates: false });
    const planA = NOA_EXAM_PLAN_V25.build(), planB = NOA_EXAM_PLAN_V25.build({ diversifyTopics: false });
    const multiA = await NOA_MULTI_BATCH_V25.generate({ plan: planA, concurrency: 1, maxAttempts: 1 });
    const multiB = await NOA_MULTI_BATCH_V25.generate({ plan: planB, concurrency: 1, maxAttempts: 1, avoidHistoryDuplicates: false });
    return { omitted, disabled, planA, planB, multiA, multiB,
      reads: state.native.statsReads - start, checks: state.contains.length - contains };
  }, biology);
  expect(output.reads).toBe(0); expect(output.checks).toBe(0);
  expect(output.disabled).toEqual(output.omitted);
  expect(output.planB).toEqual(output.planA); expect(output.multiB).toEqual(output.multiA);
  expect(output.omitted).not.toHaveProperty('diagnostics');
  expect(output.multiA).not.toHaveProperty('diagnostics');
  expect(output.planA.slots.every(slot => !slot.blueprintSlot.topicDiversity)).toBe(true);
});

test('diversidad valida los dos flags opcionales sin modificar sesiones o historial', async ({ page }) => {
  const before = await academicState(page);
  const errors = await page.evaluate(async subject => {
    const failures = [];
    for (const key of ['diversifyTopics','avoidHistoryDuplicates']) {
      for (const value of [null,'true',1]) {
        try { await NOA_BATCH_ORCHESTRATOR.generate({ subject, [key]: value }); failures.push(null); }
        catch (error) { failures.push(error.message); }
      }
    }
    const plan = NOA_EXAM_PLAN_V25.build();
    for (const value of [null,'true',1]) {
      try { await NOA_MULTI_BATCH_V25.generate({ plan, avoidHistoryDuplicates: value }); failures.push(null); }
      catch (error) { failures.push(error.message); }
    }
    return failures;
  }, biology);
  expect(errors).toHaveLength(9);
  expect(errors.every(message => typeof message === 'string' && message.length > 0)).toBe(true);
  expect(await academicState(page)).toEqual(before);
});

for (const type of formats) {
  test('diversidad detecta histórico ' + type + ', repone el mismo slot y conserva decisiones bloqueadas', async ({ page }) => {
    await forceFormat(page, type);
    const history = await seedHistorical(page, { type });
    await configure(page, { mode: 'historical_first', history });
    const before = await academicState(page), result = await batch(page, { blueprintCount: 2, limit: 2, concurrency: 1 });
    expect(result.generated).toHaveLength(2);
    expect(result.diagnostics).toMatchObject({ accepted: 2, historicalDuplicates: 1, internalDuplicates: 0,
      replacements: 1, generationErrors: 0, history: { complete: true, duplicates: 1, skipped: 0 } });
    expect(result.historicalDuplicates).toHaveLength(1);
    expect(result.historicalDuplicates[0]).toMatchObject({ reason: 'historical_duplicate' });
    const state = await fixture(page);
    expect(state.calls).toHaveLength(3);
    expect(state.replacements).toHaveLength(1); expectLocked(state.replacements[0]);
    expect(state.contains.every(call => call.accepted === true && call.judge)).toBe(true);
    for (const item of result.generated) {
      expect(await page.evaluate(question => NOA_QUESTION_MEMORY_V25_2.contains(question), item.question)).toBe(false);
      expect(item.question.blueprintSlot).toEqual(item.slot);
      expect(item.question.sourceTrace).toEqual(item.slot.source);
    }
    expect(await academicState(page)).toEqual(before);
  });
}

test('diversidad reconoce opciones reordenadas y no usa question.id como huella', async ({ page }) => {
  await forceFormat(page, 'single_select');
  const history = await seedHistorical(page);
  await configure(page, { mode: 'historical_first', visualOrder: true, history });
  const result = await batch(page, { blueprintCount: 1, limit: 1 });
  const state = await fixture(page);
  expect(state.calls[0].question.options).toEqual([...history[0].options].reverse());
  expect(state.calls[0].question.id).not.toBe(history[0].id);
  expect(result.diagnostics.historicalDuplicates).toBe(1);
  expect(result.generated).toHaveLength(1);
  expect(result.generated[0].question.id).not.toBe(state.calls[0].question.id);
});

test('diversidad permite otro planteamiento del mismo concepto y no altera Calibrator o memoria', async ({ page }) => {
  await forceFormat(page, 'single_select');
  const history = await seedHistorical(page);
  const before = await academicState(page);
  await configure(page, { statement: 'Una clínica dispone de dos muestras y recibe otras dos. ¿Cuántas muestras tiene ahora?' });
  const result = await batch(page, { blueprintCount: 1, limit: 1 });
  expect(result.generated).toHaveLength(1);
  expect(result.diagnostics).toMatchObject({ accepted: 1, historicalDuplicates: 0, replacements: 0 });
  expect(result.generated[0].question.text).not.toBe(history[0].text);
  expect(result.generated[0].question.options).toEqual(history[0].options);
  expect(await academicState(page)).toEqual(before);
});

test('diversidad conserva diferencias científicas de mayúsculas y signos sin aceptar claves distintas del mismo enunciado', async ({ page }) => {
  await forceFormat(page, 'single_select');
  await page.evaluate(() => {
    const original = NOA_BLUEPRINT_GENERATOR.generateSlot;
    __diversityFixture.config.contentMode = 'distinct';
    NOA_BLUEPRINT_GENERATOR.generateSlot = async (...args) => {
      const result = await original(...args), index = args[0].index;
      if (__diversityFixture.config.contentMode === 'distinct') {
        result.question.text = ['¿Qué representa Co?', '¿Qué representa CO?', 'Evalúa 2!.', 'Evalúa 2.',
          '¿Qué representa x²?', '¿Qué representa x2?'][index];
        result.question.options = index < 2 ? ['Cobalto','Monóxido de carbono','Carbono','Cobre'] : ['2','4','6','8'];
        result.question.correct = index === 1 ? 1 : 0;
      } else {
        // An intentionally inconsistent synthetic key must not make the same
        // visible question a distinct item after a simulated Judge approval.
        result.question.text = 'Selecciona el resultado de 2 + 2.';
        result.question.options = ['4','5','6','7'];
        result.question.correct = index;
      }
      return result;
    };
  });
  const before = await rawMemory(page);
  const distinct = await batch(page, { blueprintCount: 6, limit: 6, concurrency: 1, maxAttempts: 1 });
  expect(distinct.generated).toHaveLength(6);
  expect(distinct.diagnostics).toMatchObject({ accepted: 6, internalDuplicates: 0, historicalDuplicates: 0 });
  expect(distinct.generated.map(item => item.question.text)).toEqual([
    '¿Qué representa Co?', '¿Qué representa CO?', 'Evalúa 2!.', 'Evalúa 2.',
    '¿Qué representa x²?', '¿Qué representa x2?'
  ]);
  await configure(page, { contentMode: 'conflicting_keys' });
  const repeated = await batch(page, { blueprintCount: 2, limit: 2, concurrency: 1, maxAttempts: 1 });
  expect(repeated.generated).toHaveLength(1);
  expect(repeated.diagnostics).toMatchObject({ accepted: 1, internalDuplicates: 1, historicalDuplicates: 0 });
  expect(repeated.failures).toHaveLength(1);
  expect(await rawMemory(page)).toBe(before);
});

test('diversidad espera contains asíncrono antes de aceptar el candidato', async ({ page }) => {
  await forceFormat(page, 'single_select');
  await configure(page, { deferHistory: true });
  await page.evaluate(subject => {
    window.__pendingDiversity = NOA_BATCH_ORCHESTRATOR.generate({ subject, blueprintCount: 1, limit: 1,
      diversifyTopics: true, avoidHistoryDuplicates: true, maxAttempts: 2 });
  }, biology);
  await page.waitForFunction(() => typeof __diversityFixture.releaseHistory === 'function');
  const pending = await fixture(page);
  expect(pending.contains).toHaveLength(1);
  expect(pending.contains[0]).toMatchObject({ accepted: true, judge: true, options: { details: true } });
  expect(pending.batches[0]).not.toHaveProperty('result');
  expect(pending.starts).toEqual([]); expect(pending.writes).toEqual([]);
  await page.evaluate(() => __diversityFixture.releaseHistory());
  const result = await page.evaluate(() => __pendingDiversity);
  expect(result.generated).toHaveLength(1);
  expect(result.diagnostics.history).toMatchObject({ checked: 1, skipped: 0, complete: true });
});

for (const engine of ['batch','multibatch']) {
  test('diversidad ' + engine + ' conserva deduplicación interna tras dos awaits históricos simultáneos', async ({ page }) => {
    const barrierFormat = await page.evaluate(({ subject, engine }) => {
      const blueprint = engine === 'batch'
        ? __diversityFixture.native.blueprint({ subject, count: 5, diversifyTopics: true,
          supportedInteractionTypes: NOA_BATCH_ORCHESTRATOR.supportedTypes })
        : __diversityFixture.native.plan({ diversifyTopics: true }).subjects[0].blueprint;
      return blueprint.slots.find(slot => blueprint.slots.filter(item => item.interactionType === slot.interactionType).length > 1).interactionType;
    }, { subject: biology, engine });
    await configure(page, { mode: 'internal_first', all: true, barrier: true, barrierFormat });
    const before = await rawMemory(page);
    const result = engine === 'batch' ? await batch(page) : await multi(page);
    const accepted = engine === 'batch' ? result.generated.map(item => item.question) : result.questions;
    expect(accepted).toHaveLength(engine === 'batch' ? 5 : 45);
    expect(result.diagnostics.internalDuplicates).toBeGreaterThan(0);
    expect(result.diagnostics.historicalDuplicates).toBe(0);
    const fingerprints = await page.evaluate(questions => Promise.all(
      questions.map(question => NOA_QUESTION_MEMORY_V25_2.fingerprint(question))), accepted);
    expect(fingerprints.every(Boolean)).toBe(true);
    expect(new Set(fingerprints).size).toBe(accepted.length);
    const state = await fixture(page);
    expect(state.barrierReleased).toBe(true);
    expect(state.calls.length).toBeLessThanOrEqual(2 * accepted.length);
    expect(state.writes).toEqual([]); expect(await rawMemory(page)).toBe(before);
    if (engine === 'multibatch') expect(result.complete).toBe(true);
  });
}

for (const count of [5, 45]) {
  test('diversidad limita reposiciones históricas y protege el examen anterior en UI ' + count, async ({ page }) => {
    test.setTimeout(60000);
    const history = [];
    for (const type of formats) history.push(...await seedHistorical(page, { type, session: 'permanent-' + type }));
    await configure(page, { mode: 'historical_always', history, always: true, targetSubject: biology });
    await activeSession(page); await waitDraftCheckpoint(page);
    const before = await academicState(page);
    const startsBefore = await page.evaluate(() => structuredClone(__diversityFixture.starts));
    // The revision overlay intentionally remains active. Dispatch the card's
    // real click handler to test protection without closing or editing it.
    await page.locator(count === 45 ? '#noaExam45Generate' : '#noaGeneratorGenerate')
      .evaluate(button => button.click());
    await expect(page.locator(count === 45 ? '#noaExam45Phase' : '#noaGeneratorPhase')).toHaveText('Generación incompleta');
    const state = await fixture(page), result = count === 45 ? state.multis[0].result : state.batches[0].result;
    expect(result.diagnostics.historicalDuplicates).toBeGreaterThan(0);
    expect(result.diagnostics.replacements).toBeGreaterThan(0);
    expect(result.diagnostics.accepted).toBeLessThan(count);
    const occurrences = Object.values(Object.groupBy(state.calls, call => call.key)).map(calls => calls.length);
    expect(occurrences.every(count => count <= 2)).toBe(true);
    expect(state.starts).toEqual(startsBefore); expect(state.writes.length).toBe(4);
    expect(await academicState(page)).toEqual(before);
    await expect(page.locator(count === 45 ? '#noaExam45DiversityMetrics' : '#noaGeneratorDetails')).toContainText(/hist[oó]ric/i);
  });
}

test('diversidad nunca consulta contains si Generator o Judge no aprobaron el candidato', async ({ page }) => {
  await configure(page, { mode: 'reject_all', all: true, always: true });
  const result = await batch(page, { blueprintCount: 2, limit: 2 });
  expect(result.generated).toEqual([]);
  expect(result.diagnostics).toMatchObject({ accepted: 0, generationErrors: 4,
    history: { status: 'not_checked', checked: 0, skipped: 0, complete: false } });
  const state = await fixture(page);
  expect(state.contains).toEqual([]); expect(state.calls).toHaveLength(4); expect(state.writes).toEqual([]);
});

test('diversidad v10 rechaza metadatos incoherentes antes de consultar el historial', async ({ page }) => {
  await forceFormat(page, 'single_select');
  await page.evaluate(() => {
    const original = NOA_BLUEPRINT_GENERATOR.generateSlot;
    NOA_BLUEPRINT_GENERATOR.generateSlot = async (...args) => {
      const result = await original(...args), question = result.question;
      switch (__diversityFixture.config.invalidQuestionField) {
        case 'interactionType': question.interactionType = 'drag_order'; break;
        case 'difficulty': question.difficulty = question.difficulty === 5 ? 4 : 5; break;
        case 'sourceType': question.sourceType = 'course'; break;
        case 'requestedSourceType': question.requestedSourceType = 'extended'; break;
        case 'blueprintSlot': question.blueprintSlot.index++; break;
        case 'sourceTrace': question.sourceTrace = { ...question.sourceTrace, title: 'Fuente incoherente sintética' }; break;
        case 'syllabusCodes': question.syllabusCodes = ['invented-official-code']; break;
      }
      return result;
    };
  });
  const before = await academicState(page);
  const fields = ['interactionType','difficulty','sourceType','requestedSourceType','blueprintSlot','sourceTrace','syllabusCodes'];
  for (const invalidQuestionField of fields) {
    await configure(page, { invalidQuestionField });
    const result = await batch(page, { blueprintCount: 1, limit: 1, maxAttempts: 1, concurrency: 1 });
    expect(result.generated, invalidQuestionField).toEqual([]);
    expect(result.failures, invalidQuestionField).toHaveLength(1);
    expect(result.diagnostics, invalidQuestionField).toMatchObject({ accepted: 0, generationErrors: 1,
      history: { status: 'not_checked', checked: 0, skipped: 0, complete: false } });
  }
  const state = await fixture(page);
  expect(state.calls).toHaveLength(fields.length);
  expect(state.calls.every(call => call.options.maxAttempts === 1)).toBe(true);
  expect(state.contains).toEqual([]); expect(state.replacements).toEqual([]); expect(state.writes).toEqual([]);
  expect(await academicState(page)).toEqual(before);
});

for (const memoryMode of ['throw','invalid_result','transient_storage','corrupt_during_contains']) {
  test('diversidad degrada sin afirmar comprobación histórica exitosa: ' + memoryMode, async ({ page }) => {
    await configure(page, { memoryMode });
    const before = await rawMemory(page), result = await batch(page, { blueprintCount: 2, limit: 2, concurrency: 1 });
    expect(result.generated).toHaveLength(2);
    expect(result.diagnostics.history).toMatchObject({ complete: false,
      checked: memoryMode === 'corrupt_during_contains' ? 1 : 0,
      skipped: memoryMode === 'corrupt_during_contains' ? 1 : 2 });
    expect(result.diagnostics.history.issues.length).toBeGreaterThan(0);
    expect(['corrupt','unavailable']).toContain(result.diagnostics.history.status);
    expect((await fixture(page)).writes).toEqual([]);
    if (memoryMode === 'corrupt_during_contains') expect(await rawMemory(page)).toBe('{corrupt-during-contains');
    else expect(await rawMemory(page)).toBe(before);
    if (memoryMode === 'transient_storage') {
      expect(await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.stats().ok)).toBe(true);
      expect((await fixture(page)).contains[0].result).toMatchObject({ ok: false, contains: false, error: 'storage_unavailable' });
    }
  });
}

for (const [count, memoryState] of [[5,'corrupt'],[5,'unavailable'],[45,'corrupt']]) {
  test('diversidad UI ' + count + ' informa memoria ' + memoryState + ' sin destruir datos ni bloquear generación', async ({ page }) => {
    const history = await seedHistorical(page);
    const original = await rawMemory(page);
    await page.evaluate(mode => {
      const state = __diversityFixture, memory = NOA_QUESTION_MEMORY_V25_2;
      if (mode === 'corrupt') localStorage.setItem(memory.storageKey, '{preserve-corrupt-memory');
      else Storage.prototype.getItem = function(key) {
        if (key === memory.storageKey) throw new Error('Almacenamiento sintético no disponible');
        return state.native.getItem.call(this, key);
      };
    }, memoryState);
    await page.locator(count === 45 ? '#noaExam45Generate' : '#noaGeneratorGenerate').click();
    await expect(page.locator(count === 45 ? '#noaExam45Phase' : '#noaGeneratorPhase')).toHaveText(
      count === 45 ? 'Generación completa' : 'Generación completada');
    await expect(page.locator(count === 45 ? '#noaExam45History' : '#noaGeneratorHistory')).toContainText(
      memoryState === 'corrupt' ? /memoria corrupta.*no se pudo comprobar/i : /almacenamiento no disponible/i);
    const state = await fixture(page), result = count === 45 ? state.multis[0].result : state.batches[0].result;
    expect(result.diagnostics.history).toMatchObject({ status: memoryState, complete: false, checked: 0, skipped: count });
    expect(state.contains).toEqual([]);
    expect(state.writes).toHaveLength(1); expect(history).toHaveLength(1);
    await page.evaluate(() => { Storage.prototype.getItem = __diversityFixture.native.getItem; });
    expect(await rawMemory(page)).toBe(memoryState === 'corrupt' ? '{preserve-corrupt-memory' : original);
  });
}

test('diversidad no marca éxito histórico cuando falla SHA-256 aunque stats siga disponible', async ({ page }) => {
  const before = await rawMemory(page);
  await page.evaluate(() => {
    __diversityFixture.native.digest = crypto.subtle.digest;
    crypto.subtle.digest = async () => { throw new Error('SHA-256 sintético no disponible'); };
  });
  const result = await batch(page, { blueprintCount: 1, limit: 1 });
  await page.evaluate(() => { crypto.subtle.digest = __diversityFixture.native.digest; });
  expect(result.generated).toHaveLength(1);
  expect(result.diagnostics.history).toMatchObject({ status: 'unavailable', checked: 0, skipped: 1, complete: false });
  expect(await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.stats().ok)).toBe(true);
  expect(await rawMemory(page)).toBe(before);
});

test('diversidad conserva contains booleano histórico y expone lectura detallada verificable', async ({ page }) => {
  const history = await seedHistorical(page);
  const result = await page.evaluate(async question => ({
    legacy: await NOA_QUESTION_MEMORY_V25_2.contains(question),
    disabled: await NOA_QUESTION_MEMORY_V25_2.contains(question, { details: false }),
    detailed: await NOA_QUESTION_MEMORY_V25_2.contains(question, { details: true })
  }), history[0]);
  expect(result).toEqual({ legacy: true, disabled: true, detailed: { ok: true, contains: true } });
});

test('diversidad Examen A finalizado → B rota temas y evita preguntas exactas sin duplicar historial', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.locator('#noaGeneratorGenerate').click();
  await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación completada');
  const queueA = await page.evaluate(() => structuredClone(examQueue));
  expect(queueA).toHaveLength(5);
  const partial = queueA.findIndex(question => question.interactionType === 'drag_classify');
  expect(partial).toBeGreaterThanOrEqual(0);
  const memoryBefore = await rawMemory(page);
  await completeExam(page, queueA, partial);
  await navigate(page, partial);
  await page.locator('#noaRevisionEdit').click();
  await page.locator('#noaRevisionCancel').click();
  expect(await rawMemory(page)).toBe(memoryBefore);
  await finish(page);
  await expect(page.locator('#examBox > h2')).toHaveText('Resultado: 4.5 / 5');
  const saved = await page.evaluate(() => ({ attempts: structuredClone(db.attempts),
    stats: NOA_QUESTION_MEMORY_V25_2.stats(), entries: NOA_QUESTION_MEMORY_V25_2.recent(undefined, 100),
    calibration: NOA_CALIBRATOR.get() }));
  expect(saved.attempts).toHaveLength(1);
  expect(saved.stats).toMatchObject({ ok: true, uniqueQuestions: 5, totalSeen: 5, sessions: 1 });
  expect(saved.calibration.sample).toBe(5);
  expect(saved.entries.every(entry => entry.timesSeen === 1)).toBe(true);
  await page.evaluate(() => { NOA_EXAM_NAVIGATION.finishExam(); NOA_EXAM_NAVIGATION.finishExam(); });
  page.diversityBeforeReloadForbidden = (await fixture(page)).forbidden;
  await page.reload();
  await page.waitForFunction(() => !!window.NOA_QUESTION_MEMORY_V25_2 && !!window.NOA_GENERATOR_UI);
  await installDiversity(page, { phase: 'B', mode: 'historical_first', history: queueA, targetSubject: biology });
  expect(await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.stats())).toEqual(saved.stats);
  expect(await page.evaluate(() => structuredClone(db.attempts))).toEqual(saved.attempts);
  await page.locator('#nav button[data-page="exam"]').click();
  await page.locator('#noaGeneratorSubject').selectOption(biology);
  const memoryAfterA = await rawMemory(page), calibration = await page.evaluate(() => NOA_CALIBRATOR.get());
  await page.locator('#noaGeneratorGenerate').click();
  await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación completada');
  const queueB = await page.evaluate(() => structuredClone(examQueue)), state = await fixture(page);
  expect(queueB).toHaveLength(5);
  const codesA = queueA.map(question => question.syllabusCode), codesB = queueB.map(question => question.syllabusCode);
  expect(codesB.every(code => !codesA.includes(code))).toBe(true);
  expect(queueB.every(question => question.blueprintSlot.topicDiversity.priorFrequency === 0)).toBe(true);
  expect(state.batches[0].result.diagnostics).toMatchObject({ accepted: 5, historicalDuplicates: 1, replacements: 1,
    history: { status: 'ready', complete: true } });
  for (const question of queueB) {
    expect(await page.evaluate(question => NOA_QUESTION_MEMORY_V25_2.contains(question), question)).toBe(false);
  }
  expect(await rawMemory(page)).toBe(memoryAfterA);
  expect(await page.evaluate(() => NOA_CALIBRATOR.get())).toEqual(calibration);
  expect(await page.evaluate(() => structuredClone(db.attempts))).toEqual(saved.attempts);
  await testInfo.attach('secuencia-real-A-finalizado-B-diverso', { body: JSON.stringify({
    codesA, codesB, resultA: saved.attempts[0], memoryAfterA: saved.stats,
    entries: saved.entries, diagnosticsB: state.batches[0].result.diagnostics,
    replacementsB: state.replacements, calibrationBeforeB: calibration
  }, null, 2), contentType: 'application/json' });
});

test.describe('diversidad integrada con Service Worker real', () => {
  test.use({ serviceWorkers: 'allow' });
  test('diversidad offline conserva memoria, informa conexión ausente y permite comprobar el algoritmo local sintético', async ({ page, context }) => {
    const history = await seedHistorical(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const memoryBefore = await rawMemory(page);
    page.diversityBeforeReloadForbidden = (await fixture(page)).forbidden;
    await context.setOffline(true); await page.reload();
    await page.waitForFunction(() => !!window.NOA_GENERATOR_UI && !!window.NOA_QUESTION_MEMORY_V25_2);
    await installDiversity(page, { mode: 'historical_first', history });
    await forceFormat(page, 'single_select');
    await page.locator('#nav button[data-page="exam"]').click();
    await page.locator('#noaGeneratorSubject').selectOption(biology);
    const before = await academicState(page);
    await page.locator('#noaGeneratorGenerate').click();
    await expect(page.locator('#noaGeneratorPhase')).toHaveText('Error del motor');
    await expect(page.locator('#noaGeneratorDetails')).toContainText(/conexi[oó]n|offline|internet/i);
    const unavailable = await fixture(page);
    expect(unavailable.batches).toEqual([]); expect(unavailable.starts).toEqual([]);
    expect(await academicState(page)).toEqual(before);
    // Only the local pipeline is exercised with a synthetic Generator. The UI
    // correctly requires its configured AI service and does not promise AI offline.
    const local = await batch(page);
    expect(local.generated).toHaveLength(5);
    expect(local.diagnostics).toMatchObject({ accepted: 5, historicalDuplicates: 1,
      history: { status: 'ready', complete: true } });
    expect((await fixture(page)).starts).toEqual([]);
    expect(await academicState(page)).toEqual(before);
    expect(await rawMemory(page)).toBe(memoryBefore);
    const cachesState = await page.evaluate(async () => {
      const scope = (await navigator.serviceWorker.getRegistration()).scope;
      const names = (await caches.keys()).filter(name => name.startsWith('noa-mobile:' + encodeURIComponent(scope) + ':'));
      return { names, memory: !!await (await caches.open(names[0])).match(new URL('excoba_patch_v25_question_memory.js', scope).href) };
    });
    expect(cachesState.names).toHaveLength(1); expect(cachesState.names[0]).toMatch(/:v6-83$/);
    expect(cachesState.memory).toBe(true);
  });
});
