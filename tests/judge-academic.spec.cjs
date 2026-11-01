const { test, expect } = require('@playwright/test');
const { questions, start, answer, navigate, snapshot } = require('./fixtures.cjs');
const { openGenerator, activeSession } = require('./generator-fixtures.cjs');
const { fullExamState, waitDraftCheckpoint } = require('./exam-45-ui-fixtures.cjs');
const { metrics, criteria, formats, cases, correctCell, review, installJudgeFixture, judgeQuestion, installPipelineAI } = require('./judge-academic-fixtures.cjs');

async function judgeEvidence(page) {
  return page.evaluate(() => window.__judgeFixture ? ({
    judgeCalls: __judgeFixture.calls.length, forbidden: __judgeFixture.forbidden,
    pipeline: window.__pipelineAI ? { generated: __pipelineAI.generated, judged: __pipelineAI.judged,
      forbidden: __pipelineAI.forbidden, formats: [...new Set(__pipelineAI.calls.map(call => call.format))] } : null
  }) : null);
}

test.beforeEach(async ({ page }) => {
  page.judgeErrors = [];
  page.judgeExternalRequests = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== 'http://127.0.0.1:8022') {
      page.judgeExternalRequests.push(url.href);
      return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', error => page.judgeErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.judgeErrors.push(message.text()); });
  await openGenerator(page);
  await installJudgeFixture(page);
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
});

test.afterEach(async ({ page }, testInfo) => {
  const current = await judgeEvidence(page);
  // Recargar elimina los mocks de window. Conservar explícitamente la
  // evidencia anterior y vigilar la red desde Node durante toda la prueba.
  const evidence = current || page.judgeBeforeReloadEvidence;
  expect(evidence, 'Los contadores se conservan incluso si la prueba recarga la página').toBeTruthy();
  expect(evidence.forbidden).toBe(0);
  if (evidence.pipeline) expect(evidence.pipeline.forbidden).toBe(0);
  expect(page.judgeExternalRequests).toEqual([]);
  expect(page.judgeErrors).toEqual([]);
  await testInfo.attach('judge-contrato-consola-y-llamadas', {
    body: JSON.stringify({ ...evidence, countersCapturedBeforeReload: !current, externalRequests: page.judgeExternalRequests,
      errors: page.judgeErrors, limitation: 'Las respuestas de IA son simuladas; estas pruebas validan software, no detección científica independiente.' }, null, 2),
    contentType: 'application/json'
  });
});

for (const item of cases) {
  test(`Judge caso ${item.id}: ${item.label}`, async ({ page }, testInfo) => {
    const response = review(item.format, 9.8);
    if (item.criterion) {
      response.academic_review[item.criterion] = { status: item.status, reason: item.issue };
      response.critical_issues = [item.issue];
    }
    const result = await judgeQuestion(page, item.format, item.question, response, item.subject);
    expect(result.accepted).toBe(item.id === 'E');
    expect(result.judge.qualityScore).toBe(9.8);
    expect(result.judge.contractValid).toBe(true);
    expect(result.judge.requiresHumanReview).toBe(item.id !== 'E');
    expect(result.judge.policyVersion).toBe('25.1');
    expect(result.judge.evaluationScope).toBe('internal_ai');
    expect(result.judge).not.toHaveProperty('accepted');
    for (const [key, value] of Object.entries(item.question)) expect(result[key]).toEqual(value);
    if (item.criterion) expect(result.judge.academic_review[item.criterion]).toEqual(response.academic_review[item.criterion]);
    await testInfo.attach(`regresion-cientifica-${item.id}`, { body: JSON.stringify({ question: item.question, mockJudge: response, result,
      limitation: 'El hallazgo proviene del Judge simulado; no demuestra que un modelo real detecte el defecto.' }, null, 2), contentType: 'application/json' });
  });
}

for (const item of cases.filter(item => item.corrected)) {
  test(`Judge caso ${item.id} corregido: conserva una pregunta científicamente consistente`, async ({ page }) => {
    const result = await judgeQuestion(page, item.format, item.corrected, review(item.format), item.subject);
    expect(result.accepted).toBe(true);
    expect(result.judge.requiresHumanReview).toBe(false);
    for (const [key, value] of Object.entries(item.corrected)) expect(result[key]).toEqual(value);
  });
}

for (const format of formats) {
  test(`Judge ${format}: API real exige contrato completo sin plantilla de dieces`, async ({ page }) => {
    const source = cases.find(item => item.format === format);
    const response = review(format);
    const result = await judgeQuestion(page, format, source.corrected || source.question, response, source.subject);
    expect(result.accepted).toBe(true);
    for (const key of metrics[format]) expect(result.judge[key]).toBe(9.2);
    const payload = await page.evaluate(format => ({ schema: JSON.parse(NOA_JUDGE_ACADEMIC.responseContract(format)),
      call: __judgeFixture.calls.at(-1) }), format);
    expect(payload.call.options.temperature).toBe(0);
    const prompt = payload.call.messages.map(message => message.content).join('\n');
    for (const key of [...metrics[format], 'academic_review', 'critical_issues', ...criteria]) expect(prompt).toContain(key);
    for (const key of metrics[format]) {
      expect(payload.schema.required).toContain(key);
      expect(payload.schema.properties[key]).toMatchObject({ type: 'number', minimum: 0, maximum: 10 });
      expect(prompt).not.toMatch(new RegExp(`"${key}"\\s*:\\s*10(?:[,.}\\s]|$)`));
    }
    expect(payload.schema.required).toEqual(expect.arrayContaining(['academic_review', 'critical_issues']));
    expect(payload.schema.properties.academic_review.required).toEqual(criteria);
    expect(prompt).toContain(source.corrected?.explanation || source.question.explanation || source.question.explain);
    expect(prompt).toMatch(/unicelular/i);
    expect(prompt).toMatch(/Mendel/i);
    expect(prompt).toMatch(/polipept/i);
    expect(prompt).toMatch(/exot[eé]rmic/i);
    expect(prompt).toMatch(/independiente/i);
  });

  test(`Judge ${format}: rechaza toda métrica faltante o inválida sin promedios parciales`, async ({ page }) => {
    const response = review(format);
    const outcomes = await page.evaluate(async ({ format, response }) => {
      const fixture = __judgeFixture, slot = fixture.slot(format), question = fixture.cases.find(item => item.format === format).question;
      const outcomes = [];
      for (const key of fixture.metrics[format]) {
        const raw = structuredClone(response); delete raw[key]; fixture.reply = raw;
        outcomes.push({ name: 'missing-' + key, result: await fixture.judge(format, question, slot) });
      }
      for (const [name, value] of [['null', null], ['string', '10'], ['boolean', true], ['negative', -.1], ['over-ten', 10.1], ['object', {}], ['array', [10]]]) {
        fixture.reply = { ...structuredClone(response), source_fidelity: value };
        outcomes.push({ name, result: await fixture.judge(format, question, slot) });
      }
      return outcomes;
    }, { format, response });
    for (const outcome of outcomes) {
      expect(outcome.result.accepted, outcome.name).toBe(false);
      expect(outcome.result.judge.contractValid, outcome.name).toBe(false);
      expect(outcome.result.judge.qualityScore, outcome.name).toBeNull();
      expect(outcome.result.judge.validationErrors.length, outcome.name).toBeGreaterThan(0);
      expect(outcome.result.judge.requiresHumanReview, outcome.name).toBe(true);
    }
  });
}

test('Judge rechaza NaN e infinitos y no acepta un qualityScore o accepted externo', async ({ page }) => {
  const results = await page.evaluate(({ formats, responses }) => formats.flatMap(format => {
    const raw = responses[format];
    return [NaN, Infinity, -Infinity].map(value => ({ format,
      result: NOA_JUDGE_ACADEMIC.evaluate({ ...raw, source_fidelity: value, qualityScore: 10, accepted: true }, format) }));
  }), { formats, responses: Object.fromEntries(formats.map(format => [format, review(format)])) });
  for (const outcome of results) {
    expect(outcome.result.accepted).toBe(false);
    expect(outcome.result.judge.qualityScore).toBeNull();
    expect(outcome.result.judge.contractValid).toBe(false);
  }
});

test('Judge rechaza revisiones incompletas, estados desconocidos y razones vacías en cuatro formatos', async ({ page }) => {
  const results = await page.evaluate(async responses => {
    const fixture = __judgeFixture, output = [];
    for (const [format, positive] of Object.entries(responses)) {
      const slot = fixture.slot(format), question = fixture.cases.find(item => item.format === format).question;
      const malformed = [];
      const missingReview = structuredClone(positive); delete missingReview.academic_review; malformed.push(missingReview);
      const missingIssues = structuredClone(positive); delete missingIssues.critical_issues; malformed.push(missingIssues);
      for (const key of fixture.criteria) {
        const missing = structuredClone(positive); delete missing.academic_review[key]; malformed.push(missing);
        for (const mutation of [{ status: 'approved' }, { reason: '   ' }, { reason: null }]) {
          const raw = structuredClone(positive); Object.assign(raw.academic_review[key], mutation); malformed.push(raw);
        }
      }
      for (const issues of [null, '', [null], [' '], [10]]) malformed.push({ ...structuredClone(positive), critical_issues: issues });
      if (['drag_classify', 'drag_order'].includes(format)) {
        const raw = structuredClone(positive); raw.academic_review.non_overlap.status = 'not_applicable'; malformed.push(raw);
      }
      for (let index = 0; index < malformed.length; index++) {
        fixture.reply = malformed[index]; output.push({ format, index, result: await fixture.judge(format, question, slot) });
      }
    }
    return output;
  }, Object.fromEntries(formats.map(format => [format, review(format)])));
  for (const outcome of results) {
    expect(outcome.result.accepted, `${outcome.format}/${outcome.index}`).toBe(false);
    expect(outcome.result.judge.contractValid).toBe(false);
    expect(outcome.result.judge.requiresHumanReview).toBe(true);
    expect(outcome.result.judge.validationErrors.length).toBeGreaterThan(0);
  }
});

test('Judge veta cada hallazgo académico o critical_issues aun con promedio 10 y otros criterios perfectos', async ({ page }) => {
  const outcomes = await page.evaluate(async responses => {
    const fixture = __judgeFixture, output = [];
    for (const [format, positive] of Object.entries(responses)) {
      const slot = fixture.slot(format), question = fixture.cases.find(item => item.format === format).question;
      for (const criterion of fixture.criteria) {
        for (const status of ['fail', 'uncertain']) {
          fixture.reply = structuredClone(positive); fixture.reply.academic_review[criterion] = { status, reason: 'Hallazgo académico de regresión.' };
          output.push({ format, criterion, status, result: await fixture.judge(format, question, slot) });
        }
      }
      fixture.reply = { ...structuredClone(positive), critical_issues: ['Contradicción científica crítica.'] };
      output.push({ format, criterion: 'critical_issues', result: await fixture.judge(format, question, slot) });
    }
    return output;
  }, Object.fromEntries(formats.map(format => [format, review(format, 10)])));
  for (const outcome of outcomes) {
    expect(outcome.result.judge.qualityScore).toBe(10);
    expect(outcome.result.judge.contractValid).toBe(true);
    expect(outcome.result.judge.requiresHumanReview).toBe(true);
    expect(outcome.result.accepted).toBe(false);
  }
});

test('Judge conserva los umbrales anteriores y rechaza JSON malformado sin modificar una sesión', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  const before = await fullExamState(page);
  const responses = Object.fromEntries(formats.map(format => [format, review(format)]));
  const outcomes = await page.evaluate(async responses => {
    const fixture = __judgeFixture, outcomes = [];
    for (const [format, response] of Object.entries(responses)) {
      const slot = fixture.slot(format), question = fixture.cases.find(item => item.format === format).question;
      fixture.reply = { ...response, source_fidelity: 8.9 };
      outcomes.push(await fixture.judge(format, question, slot));
      fixture.reply = 'esto no es JSON';
      try { await fixture.judge(format, question, slot); outcomes.push({ malformedAccepted: true }); }
      catch (error) { outcomes.push({ malformedRejected: true, error: error.message }); }
    }
    return outcomes;
  }, responses);
  for (let index = 0; index < outcomes.length; index += 2) {
    expect(outcomes[index].accepted).toBe(false);
    expect(outcomes[index].judge.contractValid).toBe(true);
    expect(outcomes[index].judge.requiresHumanReview).toBe(false);
    expect(outcomes[index + 1]).toMatchObject({ malformedRejected: true });
    expect(outcomes[index + 1].error.length).toBeGreaterThan(0);
  }
  expect(await fullExamState(page)).toEqual(before);
});

test('Judge muestra métricas específicas y fuentes históricas sin alterar resultados ni historial anterior', async ({ page }) => {
  const queue = structuredClone(questions);
  queue.forEach((question, index) => {
    const format = question.interactionType;
    question.judge = { ...Object.fromEntries(metrics[format].map(key => [key, 9.2])), qualityScore: 9.2, comments: 'Histórico sintético.' };
    if (index === 0) question.judge.syllabus_fidelity = 3;
    if (index === 1) { delete question.judge.source_fidelity; question.judge.syllabus_fidelity = 9.4; }
    if (index === 2) { delete question.judge.source_fidelity; question.judge.source_match = 9.6; }
  });
  await start(page, queue);
  for (let index = 0; index < queue.length; index++) { await navigate(page, index); await answer(page, queue[index]); }
  await page.locator('#noaShellFinish').click();
  await expect(page.locator('#examBox')).toHaveAttribute('data-noa-results-engine', '23.0');
  await expect(page.locator('#examBox > h2')).toHaveText('Resultado: 4 / 4');
  for (const [index, format] of formats.entries()) {
    const card = page.locator(`[data-noa-result-type="${format}"] [data-noa-judge-review]`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('Sin revisión académica estructurada registrada');
    for (const key of metrics[format]) await expect(card.locator(`[data-noa-judge-metric="${key}"]`)).toHaveCount(1);
    await expect(card.locator('[data-noa-judge-metric="distractor_quality"]')).toHaveCount(index === 0 ? 1 : 0);
  }
  await expect(page.locator('[data-noa-judge-source-metric="source_fidelity"]')).toHaveCount(2);
  await expect(page.locator('[data-noa-judge-source-metric="syllabus_fidelity"]')).toContainText('9.4/10');
  await expect(page.locator('[data-noa-judge-source-metric="source_match"]')).toContainText('9.6/10');
  const completed = await snapshot(page);
  expect(completed.attempts).toHaveLength(1);
  expect(completed.calibration.sample).toBe(4);
  expect(completed.attempts[0].answers.map(answer => answer.judge)).toEqual(queue.map(question => question.judge));
  page.judgeBeforeReloadEvidence = await judgeEvidence(page);
  await page.reload();
  expect((await snapshot(page)).attempts).toEqual(completed.attempts);
});

test('Judge presenta revisión estructurada y escapa observaciones sin afirmar validación independiente', async ({ page }) => {
  const response = review('drag_order');
  response.academic_review.non_overlap = { status: 'uncertain', reason: '<img src=x onerror="window.__academicXss=true"> Posible solapamiento.' };
  response.critical_issues = ['<script>window.__academicXss=true</script> Hallazgo sintético.'];
  const queue = [{ ...questions[3], judge: { ...response, qualityScore: 9.2, requiresHumanReview: true } }];
  await start(page, queue);
  await answer(page, queue[0]);
  await page.locator('#noaShellFinish').click();
  const card = page.locator('[data-noa-judge-review]');
  await expect(card.locator('[data-noa-judge-criterion]')).toHaveCount(5);
  await expect(card.locator('[data-noa-judge-criterion="non_overlap"]')).toHaveAttribute('data-noa-judge-status', 'uncertain');
  await expect(card).toContainText('Incierto');
  await expect(card).toContainText('Requiere revisión humana');
  await expect(card).toContainText('Posible solapamiento');
  await expect(card).toContainText(/no.*validaci[oó]n.*independiente/i);
  expect(await card.locator('script,img').count()).toBe(0);
  expect(await page.evaluate(() => !!window.__academicXss)).toBe(false);
  expect((await snapshot(page)).score).toBe(1);
});

for (const count of [5, 10, 45]) {
  test(`Judge se integra en ${count} reactivos con Generator y motores reales, solo callAI simulado`, async ({ page }, testInfo) => {
    await installPipelineAI(page);
    const before = await fullExamState(page);
    const payload = await page.evaluate(async count => {
      let questions, result;
      if (count === 45) {
        const plan = NOA_EXAM_PLAN_V25.build();
        result = await NOA_MULTI_BATCH_V25.generate({ plan, concurrency: 2, maxAttempts: 2 });
        questions = result.questions;
      } else {
        // Biología utiliza los cuatro formatos ya soportados; el Blueprint
        // solicita exactamente5/10 sin cambiar la API o el límite de Batch.
        result = await NOA_BATCH_ORCHESTRATOR.generate({ subject: 'EXCOBA Medicina · Biología', blueprintCount: count,
          limit: count, concurrency: 2, maxAttempts: 1 });
        questions = NOA_MIXED_EXAM.questionsFromBatch(result);
      }
      return { questions, complete: result.complete, failures: result.failures, calls: __pipelineAI.calls.map(call => ({ kind: call.kind, format: call.format })),
        generated: __pipelineAI.generated, judged: __pipelineAI.judged };
    }, count);
    expect(payload.questions).toHaveLength(count);
    expect(payload.generated).toBe(count);
    expect(payload.judged).toBe(count);
    expect(payload.failures).toEqual([]);
    expect(new Set(payload.questions.map(question => question.interactionType)).size).toBe(4);
    if (count === 45) {
      expect(payload.complete).toBe(true);
      expect(new Set(payload.questions.map(question => question.planSlotId)).size).toBe(45);
      expect(new Set(payload.questions.map(question => question.subject)).size).toBe(9);
    }
    for (const question of payload.questions) {
      expect(question.accepted).toBe(true);
      expect(question.judge.contractValid).toBe(true);
      expect(question.judge.policyVersion).toBe('25.1');
      expect(question.judge.qualityScore).toBe(9.2);
      expect(question.judge.critical_issues).toEqual([]);
      expect(question.judge.requiresHumanReview).toBe(false);
    }
    expect(await fullExamState(page)).toEqual(before);
    await testInfo.attach(`integracion-real-judge-${count}-reactivos-sinteticos`, { body: JSON.stringify(payload, null, 2), contentType: 'application/json' });
  });
}
