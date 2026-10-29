const { test, expect } = require('@playwright/test');
const { answer, navigate, snapshot } = require('./fixtures.cjs');
const { openGenerator, mockBatch } = require('./generator-fixtures.cjs');

function expectedMetadata(question) {
  return {
    slotId: question.slotId,
    blueprintSlot: question.blueprintSlot,
    sourceTrace: question.sourceTrace ?? question.blueprintSlot.source,
    sourceType: question.sourceType,
    requestedSourceType: question.requestedSourceType,
    difficulty: question.difficulty,
    interactionType: question.interactionType,
    accepted: question.accepted,
    blueprint: question.blueprint,
    judge: question.judge
  };
}

function verifyAnswers(answers, queue) {
  expect(answers).toHaveLength(queue.length);
  for (const question of queue) {
    const recorded = answers.find(item => item.questionId === question.id);
    expect(recorded, `Respuesta de ${question.id}`).toBeTruthy();
    for (const [key, value] of Object.entries(expectedMetadata(question))) {
      expect(recorded[key], `${question.id}: ${key}`).toEqual(value);
    }
    expect(recorded.accepted).toBe(true);
    // El estado de aprobación real está en question.accepted, no en judge.accepted.
    expect(recorded.judge).not.toHaveProperty('accepted');
  }
}

for (const count of [5, 10]) {
  test(`v24 conserva trazabilidad de ${count} reactivos al responder, revisar, finalizar y recargar`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await openGenerator(page);
    await mockBatch(page);
    await page.evaluate(() => {
      const build = window.__buildGeneratorBatch;
      window.__buildGeneratorBatch = options => {
        const batch = build(options);
        for (const item of batch.generated) {
          const question = item.question;
          // Los generadores reales proporcionan difficulty; Mixed crea el
          // blueprint compatible. El mock ordinario no cubría esta forma.
          delete question.blueprint;
          question.difficulty = item.slot.difficulty.level;
          if (['inline_select', 'drag_order'].includes(question.interactionType)) {
            // Estos generadores conservan la fuente en blueprintSlot.source.
            delete question.sourceTrace;
          }
          const metrics = {
            single_select: ['source_fidelity', 'difficulty_match', 'distractor_quality', 'reasoning_quality', 'clarity', 'single_correct'],
            drag_classify: ['source_fidelity', 'difficulty_match', 'classification_quality', 'element_quality', 'ambiguity_control', 'reasoning_quality', 'clarity'],
            inline_select: ['source_fidelity', 'difficulty_match', 'blank_quality', 'option_quality', 'ambiguity_control', 'context_quality', 'reasoning_quality', 'clarity'],
            drag_order: ['source_fidelity', 'difficulty_match', 'sequence_validity', 'order_uniqueness', 'semantic_distinctness', 'item_quality', 'reasoning_quality', 'ambiguity_control', 'clarity']
          }[question.interactionType];
          question.judge = {
            ...Object.fromEntries(metrics.map(key => [key, 10])),
            qualityScore: 10,
            comments: 'Evaluación interna sintética; no es certificación oficial.'
          };
          question.accepted = true;
        }
        return batch;
      };
    });
    await page.locator('#noaGeneratorCount').selectOption(String(count));
    await page.locator('#noaGeneratorGenerate').click();
    await expect(page.locator('#noaGeneratorPhase')).toHaveText('Generación completada');
    const payload = await page.evaluate(() => ({ queue: examQueue, batch: window.__lastBatch }));
    const queue = payload.queue;
    expect(queue).toHaveLength(count);
    expect(new Set(queue.map(question => question.id)).size).toBe(count);
    expect(new Set(queue.map(question => question.slotId)).size).toBe(count);
    expect(new Set(queue.map(question => question.interactionType)).size).toBe(4);
    for (let index = 0; index < count; index++) {
      const question = queue[index], original = payload.batch.generated[index].question;
      expect(original).not.toHaveProperty('blueprint');
      expect(question.slotId).toBe(original.slotId);
      expect(question.blueprint.difficulty).toBe(original.difficulty);
      expect(question.difficulty).toBe(question.blueprintSlot.difficulty.level);
      if (['inline_select', 'drag_order'].includes(question.interactionType)) {
        expect(question).not.toHaveProperty('sourceTrace');
      }
    }

    let expectedScore = 0;
    for (let index = 0; index < count; index++) {
      await navigate(page, index);
      const single = queue[index].interactionType === 'single_select';
      await answer(page, queue[index], single ? 'full' : 'partial');
      expectedScore += single ? 1 : .5;
      await expect.poll(() => page.evaluate(() => examAnswers.length)).toBe(index + 1);
      verifyAnswers((await snapshot(page)).answers, queue.slice(0, index + 1));
      expect((await snapshot(page)).score).toBe(expectedScore);
    }
    await expect.poll(() => page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem(KEY));
      return saved.activeExam?.answers.length;
    })).toBe(count);
    const checkpoint = await page.evaluate(() => JSON.parse(localStorage.getItem(KEY)).activeExam);
    verifyAnswers(checkpoint.answers, queue);

    await navigate(page, 0);
    await page.locator('#noaRevisionEdit').click();
    await page.locator('#noaRevisionCancel').click();
    verifyAnswers((await snapshot(page)).answers, queue);
    await page.locator('#noaRevisionEdit').click();
    await page.locator('[data-noa-revision-option="1"]').click();
    await expect.poll(() => page.evaluate(() => examAnswers[0].selected)).toBe(1);
    verifyAnswers((await snapshot(page)).answers, queue);
    expect((await snapshot(page)).score).toBe(expectedScore - 1);
    await page.locator('#noaRevisionEdit').click();
    await page.locator('[data-noa-revision-option="0"]').click();
    await expect.poll(() => page.evaluate(() => examAnswers[0].selected)).toBe(0);
    verifyAnswers((await snapshot(page)).answers, queue);
    expect((await snapshot(page)).score).toBe(expectedScore);
    expect(await page.evaluate(() => topicBy(examQueue[0].topicId).attempts)).toBe(count);

    await page.locator('#noaShellFinish').click();
    await expect(page.locator('#examBox')).toHaveAttribute('data-noa-results-engine', '23.0');
    await expect(page.locator('#examBox > h2')).toHaveText(`Resultado: ${expectedScore} / ${count}`);
    const completed = await snapshot(page);
    expect(completed.attempts).toHaveLength(1);
    verifyAnswers(completed.attempts[0].answers, queue);
    expect(completed.calibration.sample).toBe(count);
    expect(Object.values(completed.calibration.stats).reduce((sum, stats) => sum + stats.credit, 0)).toBe(expectedScore);
    await page.reload();
    const reloaded = await snapshot(page);
    expect(reloaded.attempts).toEqual(completed.attempts);
    verifyAnswers(reloaded.attempts[0].answers, queue);
    expect(errors).toEqual([]);
    await testInfo.attach('trazabilidad-preguntas-respuestas-historial', {
      body: JSON.stringify({ count, queue, checkpoint, completed: completed.attempts, reloaded: reloaded.attempts, expectedScore, errors }, null, 2),
      contentType: 'application/json'
    });
  });
}
