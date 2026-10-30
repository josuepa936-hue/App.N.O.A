const { test, expect } = require('@playwright/test');
const { questions, answer, navigate, assign, snapshot } = require('./fixtures.cjs');
const { mathSubject, masterSubjects, openGenerator, examState, activeSession, mockBatch } = require('./generator-fixtures.cjs');

const phase = page => page.locator('#noaGeneratorPhase');
const generate = page => page.locator('#noaGeneratorGenerate');

test.beforeEach(async ({ page }) => {
  page.uiErrors = [];
  page.on('pageerror', error => page.uiErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.uiErrors.push(message.text()); });
  await openGenerator(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('v24-etapa2-estado-y-consola', {
    body: JSON.stringify(await page.evaluate(errors => ({ errors, calls: window.__batchCalls || [], events: window.__generatorEvents || [],
      subjects: [...document.querySelectorAll('#noaGeneratorSubject option')].map(option => option.value),
      count: document.querySelector('#noaGeneratorCount').value, profile: document.querySelector('#noaGeneratorProfile').textContent,
      calibration: document.querySelector('#noaGeneratorCalibration').textContent, status: document.querySelector('#noaGeneratorStatus').textContent,
      disabled: document.querySelector('#noaGeneratorGenerate').disabled, queue: examQueue,
      index: examIndex, score: examScore, answers: examAnswers, attempts: db.attempts }), page.uiErrors), null, 2),
    contentType: 'application/json'
  });
  expect(page.uiErrors, 'Consola y excepciones JavaScript').toEqual([]);
});

test('v24 etapa 2 activa la tarjeta con materia válida y conserva el acceso manual y cantidades 5/10', async ({ page }) => {
  await expect(page.locator('#noaGeneratorCard')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Generador inteligente NOA', exact: true })).toBeVisible();
  await expect(generate(page)).toBeEnabled(); await expect(phase(page)).toHaveText('Listo para generar');
  await expect(page.locator('#noaGeneratorStatus')).toHaveAttribute('role', 'status');
  await expect(page.getByRole('button', { name: 'Generar simulacro', exact: true })).toBeVisible();
  expect(await page.locator('#noaGeneratorCount option').evaluateAll(options => options.map(option => option.value))).toEqual(['5', '10']);
});

test('v24 ofrece solo materias del Temario y conserva selección al refrescar', async ({ page }) => {
  const definitions = await masterSubjects(page, 2);
  await page.evaluate(() => { db.subjects.push({ id: 'private-subject', name: 'Materia manual ajena al Temario' }); save(); });
  expect(await page.locator('#noaGeneratorSubject option').evaluateAll(options => options.filter(option => option.value).map(option => option.value)))
    .toEqual(definitions.map(subject => subject.value));
  await page.locator('#noaGeneratorSubject').selectOption(definitions[1].value); await page.locator('#noaGeneratorCount').selectOption('10');
  await page.evaluate(() => { renderAll(); window.dispatchEvent(new Event('focus')); });
  await expect(page.locator('#noaGeneratorSubject')).toHaveValue(definitions[1].value);
  await expect(page.locator('#noaGeneratorCount')).toHaveValue('10'); await expect(generate(page)).toBeEnabled();
});

test('v24 sin Temario no inventa materias ni habilita generación', async ({ page }) => {
  await page.evaluate(() => { db.masterSyllabus = null; save(); });
  expect(await page.locator('#noaGeneratorSubject option').evaluateAll(options => options.filter(option => option.value).map(option => option.value))).toEqual([]);
  await expect(page.locator('#noaGeneratorSubject')).toBeDisabled(); await expect(generate(page)).toBeDisabled();
  await expect(page.locator('#noaGeneratorStatus')).toContainText(/Temario Maestro/i);
});

test('v24 requiere Batch disponible y se habilita cuando vuelve a estarlo', async ({ page }) => {
  await page.evaluate(() => { window.__originalBatch = NOA_BATCH_ORCHESTRATOR.generate; NOA_BATCH_ORCHESTRATOR.generate = undefined; NOA_GENERATOR_UI.refresh(); });
  await expect(generate(page)).toBeDisabled();
  await page.evaluate(() => { NOA_BATCH_ORCHESTRATOR.generate = window.__originalBatch; NOA_GENERATOR_UI.refresh(); });
  await expect(generate(page)).toBeEnabled();
});

test('v24 conserva perfiles v6 y estado inicial/adaptativo del Calibrator existente', async ({ page }) => {
  for (const key of ['official', 'extended', 'course', 'extreme']) {
    await page.locator('#nav button[data-page="notes"]').click(); await page.locator('#excobaTrainingProfile').selectOption(key);
    const label = await page.evaluate(() => NOA_SOURCE_ENGINE.getProfile().label);
    await page.locator('#nav button[data-page="exam"]').click(); await expect(page.locator('#noaGeneratorProfile')).toContainText(label);
  }
  expect(await page.locator('#noaGeneratorCard select').count()).toBe(2);
  for (const sample of [0, 4, 5]) {
    const adaptive = await page.evaluate(sample => {
      db.attempts = sample ? [{ answers: Array.from({ length: sample }, () => ({ blueprint: { difficulty: 3 }, scoreFraction: 1, ok: true })) }] : [];
      save(); return NOA_SOURCE_BLUEPRINT.calibrationState().adaptive;
    }, sample);
    await expect(page.locator('#noaGeneratorCalibration')).toContainText(adaptive ? /adaptativo/i : /inicial/i);
    if (adaptive) await expect(page.locator('#noaGeneratorCalibration')).toContainText(String(sample));
  }
});

test('v24 cabe con nueve materias y el nombre más largo en teléfonos de 320 y 390 px', async ({ page }) => {
  const definitions = await masterSubjects(page); expect(definitions).toHaveLength(9);
  const longest = definitions.reduce((result, subject) => subject.label.length > result.label.length ? subject : result);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 }); await page.locator('#noaGeneratorSubject').selectOption(longest.value);
    const card = await page.locator('#noaGeneratorCard').boundingBox();
    expect(card.x).toBeGreaterThanOrEqual(0); expect(card.x + card.width).toBeLessThanOrEqual(width);
    for (const selector of ['#noaGeneratorSubject', '#noaGeneratorCount', '#noaGeneratorGenerate']) {
      const box = await page.locator(selector).boundingBox(); expect(box.x).toBeGreaterThanOrEqual(card.x);
      expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width); expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  }
});

for (const count of [5, 10]) {
  test(`v24 genera exactamente ${count}, conserva cuatro formatos y toda la trazabilidad`, async ({ page }) => {
    await mockBatch(page); await page.locator('#noaGeneratorCount').selectOption(String(count)); await generate(page).click();
    await expect(phase(page)).toHaveText('Generación completada');
    const result = await page.evaluate(() => ({ calls: window.__batchCalls, queue: examQueue,
      expected: NOA_MIXED_EXAM.questionsFromBatch(window.__lastBatch), mixed: NOA_MIXED_EXAM.state().mixedMode,
      title: document.querySelector('#pageTitle').textContent }));
    expect(result.calls).toEqual([{ subject: mathSubject, blueprintCount: count, limit: count, concurrency: 2, maxAttempts: 2 }]);
    expect(result.queue).toEqual(result.expected); expect(result.queue).toHaveLength(count);
    expect(new Set(result.queue.map(question => question.interactionType))).toEqual(new Set(questions.map(question => question.interactionType)));
    expect(result.queue.every(q => q.sourceTrace && q.sourceType && q.blueprintSlot && q.blueprint && q.judge && q.syllabusCode)).toBe(true);
    expect(result.mixed).toBe(true); expect(result.title).toBe('Simulacro inteligente NOA'); await expect(generate(page)).toBeEnabled();
    expect((await snapshot(page)).score).toBe(0); expect((await snapshot(page)).answers).toEqual([]);
  });
}

test('v24 rechaza cantidad manipulada fuera de 5/10 sin llamar Batch', async ({ page }) => {
  await mockBatch(page);
  await page.evaluate(() => { const select = document.querySelector('#noaGeneratorCount'); select.add(new Option('45', '45')); select.value = '45'; document.querySelector('#noaGeneratorGenerate').click(); });
  await expect(phase(page)).toHaveText('Error del motor'); expect(await page.evaluate(() => window.__batchCalls.length)).toBe(0);
  expect(await page.evaluate(() => examQueue.length)).toBe(0);
});

test('v24 muestra etapas y refresh/renderAll no permiten clics duplicados durante una petición', async ({ page }) => {
  await mockBatch(page, 'deferred');
  await page.evaluate(() => {
    window.__phases = []; const node = document.querySelector('#noaGeneratorPhase');
    new MutationObserver(records => { for (const record of records) for (const added of record.addedNodes) window.__phases.push(added.textContent); }).observe(node, { childList: true });
    document.querySelector('#noaGeneratorGenerate').click();
  });
  await expect(phase(page)).toHaveText('Generando y evaluando reactivos');
  expect(await page.evaluate(() => window.__phases)).toContain('Preparando generación'); await expect(generate(page)).toBeDisabled();
  await expect(page.locator('#noaGeneratorSubject')).toBeDisabled(); await expect(page.locator('#noaGeneratorCount')).toBeDisabled();
  await page.evaluate(() => { renderAll(); NOA_GENERATOR_UI.refresh(); document.querySelector('#noaGeneratorGenerate').click(); NOA_GENERATOR_UI.generate(); });
  await expect(generate(page)).toBeDisabled(); await expect(phase(page)).toHaveText('Generando y evaluando reactivos');
  expect(await page.evaluate(() => window.__batchCalls.length)).toBe(1); expect(await page.evaluate(() => examQueue.length)).toBe(0);
  await page.evaluate(() => window.__batchPending.resolve()); await expect(phase(page)).toHaveText('Generación completada');
  await expect(generate(page)).toBeEnabled(); expect(await page.evaluate(() => window.__batchCalls.length)).toBe(1);
});

test('v24 lote incompleto excluye rechazadas y duplicadas sin modificar sesión ni rellenar', async ({ page }) => {
  const before = await activeSession(page); await mockBatch(page, 'incomplete');
  page.on('dialog', dialog => dialog.accept());
  // El editor de revisión es modal: invocar el handler público permite mantenerlo abierto.
  await page.evaluate(() => NOA_GENERATOR_UI.generate());
  await expect(phase(page)).toHaveText('Generación incompleta');
  await expect(page.locator('#noaGeneratorDetails')).toContainText(/2\s*(de|\/)\s*5/);
  await expect(page.locator('#noaGeneratorDetails')).toContainText(/fall|rechaz/i);
  await expect(page.locator('#noaGeneratorDetails')).toContainText(/duplicad/i);
  expect(await examState(page)).toEqual(before); expect(await page.evaluate(() => window.__generatorEvents)).toEqual(['confirm', 'batch']);
  expect(await page.evaluate(() => NOA_MIXED_EXAM.questionsFromBatch(window.__lastBatch).length)).toBe(2); await expect(generate(page)).toBeEnabled();
});

test('v24 un reactivo rechazado por Judge deja cuatro de cinco y no inicia examen', async ({ page }) => {
  const before = await examState(page); await mockBatch(page, 'rejected'); await generate(page).click();
  await expect(phase(page)).toHaveText('Generación incompleta');
  await expect(page.locator('#noaGeneratorDetails')).toContainText(/4\s*(de|\/)\s*5/);
  expect(await page.evaluate(() => window.__lastBatch.generated.length)).toBe(5); expect(await examState(page)).toEqual(before);
  await expect(generate(page)).toBeEnabled();
});

test('v24 un rechazo del motor conserva sesión y libera el botón para reintentar', async ({ page }) => {
  const before = await activeSession(page); await mockBatch(page, 'error'); page.on('dialog', dialog => dialog.accept());
  await page.evaluate(() => NOA_GENERATOR_UI.generate()); await expect(phase(page)).toHaveText('Error del motor');
  await expect(page.locator('#noaGeneratorDetails')).toContainText('Servicio de IA sintético no disponible');
  expect(await examState(page)).toEqual(before); await expect(generate(page)).toBeEnabled();
  await mockBatch(page); await page.evaluate(() => NOA_GENERATOR_UI.generate());
  await expect(phase(page)).toHaveText('Generación completada'); expect(await page.evaluate(() => examQueue.length)).toBe(5);
});

test('v24 cancelar confirmación previa no llama Batch ni pierde progreso', async ({ page }) => {
  const before = await activeSession(page); await mockBatch(page); let confirmations = 0;
  page.on('dialog', async dialog => { confirmations++; await dialog.dismiss(); });
  await page.evaluate(() => NOA_GENERATOR_UI.generate()); expect(confirmations).toBe(1);
  expect(await page.evaluate(() => window.__batchCalls.length)).toBe(0); expect(await examState(page)).toEqual(before);
  expect(await page.evaluate(() => window.__generatorEvents)).toEqual(['confirm']); await expect(generate(page)).toBeEnabled();
});

test('v24 confirma antes de Batch y conserva el examen hasta recibir el lote completo', async ({ page }) => {
  const before = await activeSession(page); await mockBatch(page, 'deferred'); page.on('dialog', dialog => dialog.accept());
  await page.evaluate(() => { window.__generationPromise = NOA_GENERATOR_UI.generate(); });
  await expect(phase(page)).toHaveText('Generando y evaluando reactivos'); expect(await examState(page)).toEqual(before);
  expect(await page.evaluate(() => window.__generatorEvents)).toEqual(['confirm', 'batch']);
  await page.evaluate(() => window.__batchPending.resolve()); await expect(phase(page)).toHaveText('Generación completada');
  expect(await page.evaluate(() => examQueue.length)).toBe(5);
});

test('v24 pide nuevo consentimiento si se abre otra sesión mientras Batch está pendiente', async ({ page }) => {
  await mockBatch(page, 'deferred'); await generate(page).click(); await expect(phase(page)).toHaveText('Generando y evaluando reactivos');
  await page.evaluate(q => NOA_MIXED_EXAM.start(q, 'Nueva sesión durante generación'), questions); await answer(page, questions[0]);
  const before = await examState(page); let confirmations = 0;
  page.on('dialog', async dialog => { confirmations++; await dialog.dismiss(); });
  await page.evaluate(() => window.__batchPending.resolve()); await expect.poll(() => confirmations).toBe(1);
  expect(await examState(page)).toEqual(before); await expect(generate(page)).toBeEnabled();
  expect(await page.evaluate(() => window.__generatorEvents)).toEqual(['batch', 'confirm']);
});

for (const mode of ['unsupported', 'malformed']) {
  test(`v24 rechaza lote ${mode} antes de sustituir la sesión`, async ({ page }) => {
    const before = await activeSession(page); await mockBatch(page, mode); page.on('dialog', dialog => dialog.accept());
    await page.evaluate(() => NOA_GENERATOR_UI.generate()); await expect(phase(page)).toHaveText('Error del motor');
    expect(await examState(page)).toEqual(before); await expect(generate(page)).toBeEnabled();
  });
}

test('v24 un fallo del perfil no deja promesas rechazadas ni busy bloqueado', async ({ page }) => {
  const before = await examState(page); await mockBatch(page);
  await page.evaluate(() => { window.__getProfile = NOA_SOURCE_ENGINE.getProfile; NOA_SOURCE_ENGINE.getProfile = () => { throw new Error('Fallo sintético al leer perfil'); }; });
  await generate(page).click(); await expect(phase(page)).toHaveText('Error del motor'); expect(await examState(page)).toEqual(before);
  expect(await page.evaluate(() => NOA_GENERATOR_UI.state().busy)).toBe(false);
  await page.evaluate(() => { NOA_SOURCE_ENGINE.getProfile = window.__getProfile; NOA_GENERATOR_UI.refresh(); }); await expect(generate(page)).toBeEnabled();
  await generate(page).click(); await expect(phase(page)).toHaveText('Generación completada');
});

test('v24 navega, puntúa parcialmente, revisa, recupera y guarda resultados v23 una sola vez', async ({ page }) => {
  await mockBatch(page); await generate(page).click(); await expect(phase(page)).toHaveText('Generación completada');
  const queue = await page.evaluate(() => examQueue); await answer(page, queue[0]); await navigate(page, 1); await answer(page, queue[1], 'partial');
  await expect(page.locator('#noaRevisionEdit')).toBeVisible(); expect((await snapshot(page)).score).toBe(1.5);
  await page.locator('#noaRevisionEdit').click(); await assign(page, 'two', 'odd'); const before = await examState(page);
  await page.reload(); await page.waitForFunction(() => !!window.NOA_GENERATOR_UI && examQueue.length === 5);
  expect(await examState(page, before.topics.map(topic => topic.id))).toEqual(before); await page.locator('#noaRevisionCancel').click();
  for (let index = 2; index < queue.length; index++) { await navigate(page, index); await answer(page, queue[index]); }
  await page.locator('#noaShellFinish').click(); await expect(page.locator('#examBox')).toHaveAttribute('data-noa-results-engine', '23.0');
  await expect(page.locator('#examBox > h2')).toHaveText('Resultado: 4.5 / 5'); expect((await snapshot(page)).attempts).toHaveLength(1);
  await page.reload(); expect((await snapshot(page)).attempts).toHaveLength(1);
});

test.describe('v24 etapa 2 con service worker real', () => {
  test.use({ serviceWorkers: 'allow' });
  test('v24 usa caché v68 aislada y el fallo de IA offline conserva el estado', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cached = await page.evaluate(async () => {
      const scope = (await navigator.serviceWorker.getRegistration()).scope;
      const name = (await caches.keys()).find(name => name.startsWith(`noa-mobile:${encodeURIComponent(scope)}:`));
      return { name, v24: !!await (await caches.open(name)).match(new URL('excoba_patch_v24_generator_ui.js', scope).href) };
    });
    expect(cached.name).toMatch(/:v6-68$/); expect(cached.v24).toBe(true);
    await context.setOffline(true); await page.reload(); await page.waitForFunction(() => !!window.NOA_GENERATOR_UI);
    await page.locator('#nav button[data-page="exam"]').click(); const before = await examState(page); await generate(page).click();
    await expect(phase(page)).toHaveText('Error del motor'); await expect(page.locator('#noaGeneratorDetails')).toContainText(/conexi[oó]n|offline|internet/i);
    expect(await examState(page)).toEqual(before); await expect(generate(page)).toBeEnabled();
  });
});
