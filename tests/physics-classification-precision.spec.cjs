const { test, expect } = require('@playwright/test');
const { openGenerator, activeSession } = require('./generator-fixtures.cjs');
const { fullExamState, waitDraftCheckpoint } = require('./exam-45-ui-fixtures.cjs');
const { review, installJudgeFixture, judgeQuestion } = require('./judge-academic-fixtures.cjs');
const { mechanical, transfers, ambiguous, overlapping } = require('./physics-classification-fixtures.cjs');

test.beforeEach(async ({ page }) => {
  page.precisionErrors = [];
  page.precisionExternal = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:8022') {
      page.precisionExternal.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', error => page.precisionErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.precisionErrors.push(message.text()); });
  await openGenerator(page);
  await installJudgeFixture(page);
  await page.evaluate(() => {
    db.masterSyllabus = { id: 'uaq-excoba-2026-2-medicina', items: NOA_EXCOBA_FIX_V5.items.map(item => ({ ...item })) };
    save();
  });
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
});

test.afterEach(async ({ page }, testInfo) => {
  const evidence = await page.evaluate(() => ({ calls: __judgeFixture.calls.length, forbidden: __judgeFixture.forbidden }));
  expect(evidence.forbidden).toBe(0);
  expect(page.precisionExternal).toEqual([]);
  expect(page.precisionErrors).toEqual([]);
  await testInfo.attach('evidencia-simulada', { body: JSON.stringify({ ...evidence,
    realAIRequests: 0, limitation: 'Se comprueban prompts y decisiones con dictámenes simulados; no la precisión de un modelo real.' }), contentType: 'application/json' });
});

async function physicsSubject(page) {
  return page.evaluate(() => NOA_EXCOBA_PREPARATION.physics().value);
}

test('prompt define criterio, supuestos y magnitudes sin alterar el Blueprint bloqueado', async ({ page }) => {
  const result = await page.evaluate(async question => {
    const slot = __judgeFixture.slot('drag_classify', NOA_EXCOBA_PREPARATION.physics().value);
    const before = structuredClone(slot);
    function freeze(value) {
      if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
      return value;
    }
    freeze(slot);
    __judgeFixture.reply = question;
    const first = await NOA_DRAG_CLASSIFY.generate(slot);
    const second = await NOA_DRAG_CLASSIFY.generate(slot);
    return { slot, before, first, second, calls: __judgeFixture.calls };
  }, mechanical);
  expect(result.slot).toEqual(result.before);
  expect(result.first.blueprintSlot).toEqual(result.before);
  expect(result.first.interactionType).toBe('drag_classify');
  expect(result.first.accepted).toBe(false); // Generar no equivale a aprobar.
  expect(result.second.targets).toEqual(result.first.targets);
  expect(result.second.elements).toEqual(result.first.elements);
  expect(result.calls).toHaveLength(2);
  expect(result.calls[1]).toEqual(result.calls[0]);
  const prompt = result.calls[0].messages.map(message => message.content).join('\n');
  for (const text of ['único criterio científico', 'magnitudes, procesos, propiedades o mecanismos',
    'una sola asignación científicamente defendible', 'contexto y los supuestos',
    'energía de movimiento o transferencia', 'potencia es una tasa', 'no la clasifiques como forma de energía',
    'sin cambiar materia, dificultad', 'explicación debe justificar cada']) expect(prompt).toContain(text);
  expect(prompt).toContain(result.before.subject);
  expect(result.calls[0].options).toEqual({ temperature: 0.25 });
});

for (const [name, question] of Object.entries({ mechanical, transfers })) {
  test(`Física correcta ${name}: generador y Judge reales conservan una clasificación precisa con IA simulada`, async ({ page }) => {
    const result = await page.evaluate(async ({ question, positive }) => {
      const slot = __judgeFixture.slot('drag_classify', NOA_EXCOBA_PREPARATION.physics().value);
      const before = structuredClone(slot);
      const ai = window.callAI;
      window.callAI = (messages, options) => {
        __judgeFixture.reply = messages[0].content.includes('Drag Generator') ? question : positive;
        return ai(messages, options);
      };
      const outcome = await NOA_BLUEPRINT_GENERATOR.generateSlot(slot, { maxAttempts: 1 });
      return { outcome, slot, before, calls: __judgeFixture.calls };
    }, { question, positive: review('drag_classify') });
    expect(result.outcome.question.accepted).toBe(true);
    expect(result.outcome.question.judge).toMatchObject({ policyVersion: '25.1', requiresHumanReview: false });
    expect(result.slot).toEqual(result.before);
    expect(result.outcome.slot).toEqual(result.before);
    expect(result.outcome.question.targets.map(target => target.label)).toEqual(question.targets.map(target => target.label));
    expect(result.outcome.question.correctResponse).toEqual(Object.fromEntries(question.elements.map(element => [element.id, element.correctTargetId])));
    expect(result.calls).toHaveLength(2);
    expect(result.calls[1].messages.map(message => message.content).join('\n')).toContain(question.explanation);
  });
}

test('reproduce dictamen de slot 4: incertidumbre y mínimo 8 impiden aceptación con score 8.7 y contrato válido', async ({ page }, testInfo) => {
  await activeSession(page);
  await waitDraftCheckpoint(page);
  const before = await fullExamState(page);
  const response = { ...review('drag_classify'), source_fidelity: 10, difficulty_match: 9,
    classification_quality: 8, element_quality: 9, ambiguity_control: 7, reasoning_quality: 8, clarity: 10 };
  response.academic_review.conceptual_unambiguity = { status: 'uncertain',
    reason: 'La categoría mezcla energía asociada al movimiento, transferencia y potencia; esta última es una tasa, no una forma de energía.' };
  const result = await judgeQuestion(page, 'drag_classify', ambiguous, response, await physicsSubject(page));
  expect(result.accepted).toBe(false);
  expect(result.judge).toMatchObject({ qualityScore: 8.7, contractValid: true, critical_issues: [],
    requiresHumanReview: true, ambiguity_control: 7, validationErrors: [], policyVersion: '25.1' });
  expect(await fullExamState(page)).toEqual(before);
  await testInfo.attach('rechazo-informado-reconstruccion-sintetica', { body: JSON.stringify({ question: ambiguous,
    simulatedReview: response, result, limitation: 'Las métricas reproducen el informe; el reactivo es una reconstrucción, no el original.' }), contentType: 'application/json' });
});

test('incertidumbre conceptual sigue vetando aun con todas las métricas en 10', async ({ page }) => {
  const response = review('drag_classify', 10);
  response.academic_review.conceptual_unambiguity = { status: 'uncertain', reason: 'La etiqueta reúne conceptos físicos heterogéneos.' };
  const result = await judgeQuestion(page, 'drag_classify', ambiguous, response, await physicsSubject(page));
  expect(result.accepted).toBe(false);
  expect(result.judge).toMatchObject({ qualityScore: 10, contractValid: true, requiresHumanReview: true, critical_issues: [] });
});

test('solapamiento entre energía cinética y mecánica sigue rechazado sin bajar estándares', async ({ page }) => {
  const response = review('drag_classify', 10);
  response.academic_review.non_overlap = { status: 'fail', reason: 'La energía cinética forma parte de la energía mecánica; un elemento admite ambas asignaciones.' };
  const result = await judgeQuestion(page, 'drag_classify', overlapping, response, await physicsSubject(page));
  expect(result.accepted).toBe(false);
  expect(result.judge.requiresHumanReview).toBe(true);
});

test('ambiguity_control mantiene exactamente el mínimo 8 aunque la revisión conceptual pase', async ({ page }) => {
  for (const [score, accepted] of [[7, false], [7.99, false], [8, true]]) {
    const response = { ...review('drag_classify', 10), ambiguity_control: score };
    const result = await judgeQuestion(page, 'drag_classify', mechanical, response, await physicsSubject(page));
    expect(result.accepted).toBe(accepted);
    expect(result.judge.ambiguity_control).toBe(score);
  }
});

test('slot rechazado no se promociona ni modifica sesión, borradores, memoria o historial', async ({ page }) => {
  await activeSession(page);
  await waitDraftCheckpoint(page);
  const before = await fullExamState(page);
  const result = await page.evaluate(async ({ question, response }) => {
    const slot = __judgeFixture.slot('drag_classify', NOA_EXCOBA_PREPARATION.physics().value);
    const ai = window.callAI;
    window.callAI = (messages, options) => {
      __judgeFixture.reply = messages[0].content.includes('Drag Generator') ? question : response;
      return ai(messages, options);
    };
    try { await NOA_BLUEPRINT_GENERATOR.generateSlot(slot, { maxAttempts: 1 }); return { accepted: true }; }
    catch (error) { return { error: error.message, calls: __judgeFixture.calls.length }; }
  }, { question: ambiguous, response: { ...review('drag_classify'), ambiguity_control: 7 } });
  expect(result.error).toContain('NOA Drag Judge no aprobó');
  expect(result.calls).toBe(2);
  expect(await fullExamState(page)).toEqual(before);
});
