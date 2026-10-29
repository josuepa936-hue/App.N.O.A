const { test, expect } = require('@playwright/test');
const { openApp, start, questions, answer, navigate, assign } = require('./fixtures.cjs');

async function masterSubjects(page, limit = 9) {
  return page.evaluate(limit => {
    const definitions = NOA_EXCOBA_V4.subjects.slice(0, limit);
    db.masterSyllabus = {
      id: 'uaq-excoba-2026-2-medicina',
      items: definitions.map(subject => ({
        subject: subject.value, code: subject.prefixes[0] + '1',
        title: 'Punto determinista de prueba', focus: 'Fixture aislada', page: 1
      }))
    };
    save();
    return definitions;
  }, limit);
}

async function examState(page) {
  return page.evaluate(() => ({
    queue: examQueue, index: examIndex, score: examScore, answers: examAnswers,
    drafts: Array.from(NOA_EXAM_NAVIGATION.drafts.entries()),
    revision: NOA_ANSWER_REVISION.capture(), attempts: db.attempts,
    topics: db.topics.map(topic => ({ id: topic.id, attempts: topic.attempts, correct: topic.correct }))
  }));
}

test.beforeEach(async ({ page }) => {
  page.uiErrors = [];
  page.on('pageerror', error => page.uiErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.uiErrors.push(message.text()); });
  await openApp(page);
  await page.waitForFunction(() => window.NOA_GENERATOR_UI && window.NOA_EXCOBA_FIX_V5);
  await page.locator('#nav button[data-page="exam"]').click();
});

test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach('v24-etapa1-interfaz', {
    body: JSON.stringify(await page.evaluate(errors => ({
      errors,
      subjects: [...document.querySelectorAll('#noaGeneratorSubject option')].map(option => ({ value: option.value, label: option.textContent })),
      count: document.querySelector('#noaGeneratorCount').value,
      profile: document.querySelector('#noaGeneratorProfile').textContent,
      calibration: document.querySelector('#noaGeneratorCalibration').textContent,
      message: document.querySelector('#noaGeneratorStatus').textContent,
      disabled: document.querySelector('#noaGeneratorGenerate').disabled
    }), page.uiErrors), null, 2),
    contentType: 'application/json'
  });
  expect(page.uiErrors, 'Consola y excepciones JavaScript').toEqual([]);
});

test('v24 etapa 1 muestra la tarjeta y conserva el acceso al simulacro manual', async ({ page }) => {
  const card = page.locator('#noaGeneratorCard');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name: 'Generador inteligente NOA', exact: true })).toBeVisible();
  await expect(page.locator('#noaGeneratorGenerate')).toHaveText('Generar con IA');
  await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
  await expect(page.locator('#noaGeneratorStatus')).toHaveAttribute('role', 'status');
  await expect(page.locator('#noaGeneratorStatus')).toContainText(/preparaci[oó]n/i);
  await expect(page.getByRole('button', { name: 'Generar simulacro', exact: true })).toBeVisible();
  expect(await page.locator('#noaGeneratorCount option').evaluateAll(options => options.map(option => option.value))).toEqual(['5', '10']);
  await page.locator('#noaGeneratorCount').selectOption('10');
  await expect(page.locator('#noaGeneratorCount')).toHaveValue('10');
  await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
});

test('v24 etapa 1 ofrece solo materias presentes en el Temario Maestro, no materias manuales', async ({ page }) => {
  const definitions = await masterSubjects(page, 2);
  await page.evaluate(() => { db.subjects.push({ id: 'private-subject', name: 'Materia manual fuera del Temario' }); save(); });
  expect(await page.locator('#noaGeneratorSubject option').evaluateAll(options => options.filter(option => option.value).map(option => option.value)))
    .toEqual(definitions.map(subject => subject.value));
  await page.locator('#noaGeneratorSubject').selectOption(definitions[1].value);
  await page.evaluate(() => renderAll());
  await expect(page.locator('#noaGeneratorSubject')).toHaveValue(definitions[1].value);
  await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
});

test('v24 etapa 1 informa que falta el Temario sin inventar materias', async ({ page }) => {
  await page.evaluate(() => { db.masterSyllabus = null; save(); });
  expect(await page.locator('#noaGeneratorSubject option').evaluateAll(options => options.filter(option => option.value).map(option => option.value))).toEqual([]);
  await expect(page.locator('#noaGeneratorSubject')).toBeDisabled();
  await expect(page.locator('#noaGeneratorStatus')).toContainText(/Temario Maestro/i);
  await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
});

test('v24 etapa 1 refleja los cuatro perfiles del único selector de v6', async ({ page }) => {
  for (const key of ['official', 'extended', 'course', 'extreme']) {
    await page.locator('#nav button[data-page="notes"]').click();
    await page.locator('#excobaTrainingProfile').selectOption(key);
    const label = await page.evaluate(() => NOA_SOURCE_ENGINE.getProfile().label);
    await page.locator('#nav button[data-page="exam"]').click();
    await expect(page.locator('#noaGeneratorProfile')).toContainText(label);
    await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
  }
  expect(await page.locator('#noaGeneratorCard select').count()).toBe(2);
});

test('v24 etapa 1 usa el estado inicial o adaptativo del Calibrator existente', async ({ page }) => {
  for (const sample of [0, 4, 5]) {
    const adaptive = await page.evaluate(sample => {
      db.attempts = sample ? [{ answers: Array.from({ length: sample }, () => ({ blueprint: { difficulty: 3 }, scoreFraction: 1, ok: true })) }] : [];
      save();
      return NOA_SOURCE_BLUEPRINT.calibrationState().adaptive;
    }, sample);
    await expect(page.locator('#noaGeneratorCalibration')).toContainText(adaptive ? /adaptativo/i : /inicial/i);
    if (adaptive) await expect(page.locator('#noaGeneratorCalibration')).toContainText(String(sample));
    await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
  }
});

test('v24 etapa 1 cambia materias y cantidades sin perder la selección al refrescar', async ({ page }) => {
  const definitions = await masterSubjects(page);
  await page.locator('#noaGeneratorSubject').selectOption(definitions[8].value);
  await page.locator('#noaGeneratorCount').selectOption('10');
  await page.evaluate(() => { renderAll(); window.dispatchEvent(new Event('focus')); });
  await expect(page.locator('#noaGeneratorSubject')).toHaveValue(definitions[8].value);
  await expect(page.locator('#noaGeneratorCount')).toHaveValue('10');
  await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
});

test('v24 etapa 1 no llama Batch ni IA y conserva el examen y sus borradores', async ({ page }) => {
  await start(page);
  await answer(page, questions[0]);
  await navigate(page, 1);
  await assign(page, 'two', 'even');
  await masterSubjects(page);
  await page.evaluate(() => {
    window.__stage1Calls = { batch: 0, ai: 0 };
    NOA_BATCH_ORCHESTRATOR.generate = async () => { window.__stage1Calls.batch++; throw new Error('Batch no debe ejecutarse en etapa 1'); };
    window.callAI = async () => { window.__stage1Calls.ai++; throw new Error('IA no debe ejecutarse en etapa 1'); };
  });
  const before = await examState(page);
  await page.locator('#noaGeneratorGenerate').evaluate(button => { button.click(); button.click(); button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await page.evaluate(() => NOA_GENERATOR_UI.refresh());
  expect(await page.evaluate(() => window.__stage1Calls)).toEqual({ batch: 0, ai: 0 });
  expect(await examState(page)).toEqual(before);
  await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
});

test('v24 etapa 1 cabe con nueve materias en teléfonos de 320 y 390 px', async ({ page }) => {
  const definitions = await masterSubjects(page);
  expect(definitions).toHaveLength(9);
  const longest = definitions.reduce((result, subject) => subject.label.length > result.label.length ? subject : result);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('#noaGeneratorSubject').selectOption(longest.value);
    const card = await page.locator('#noaGeneratorCard').boundingBox();
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(width);
    for (const selector of ['#noaGeneratorSubject', '#noaGeneratorCount', '#noaGeneratorGenerate']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(card.x);
      expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
  }
});

test.describe('v24 etapa 1 con service worker real', () => {
  test.use({ serviceWorkers: 'allow' });

  test('v24 permanece disponible offline con caché v63 aislada y botón deshabilitado', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cached = await page.evaluate(async () => {
      const scope = (await navigator.serviceWorker.getRegistration()).scope;
      const name = (await caches.keys()).find(name => name.startsWith(`noa-mobile:${encodeURIComponent(scope)}:`));
      return { name, v24: !!await (await caches.open(name)).match(new URL('excoba_patch_v24_generator_ui.js', scope).href) };
    });
    expect(cached.name).toMatch(/:v6-63$/);
    expect(cached.v24).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => !!window.NOA_GENERATOR_UI);
    await page.locator('#nav button[data-page="exam"]').click();
    await expect(page.locator('#noaGeneratorCard')).toBeVisible();
    await expect(page.locator('#noaGeneratorGenerate')).toBeDisabled();
    await expect(page.locator('#noaGeneratorStatus')).toContainText(/preparaci[oó]n/i);
    expect(await page.evaluate(() => !!window.NOA_RESULTS_ENGINE)).toBe(true);
  });
});
