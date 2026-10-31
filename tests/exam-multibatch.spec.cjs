const { test, expect } = require('@playwright/test');
const { openGenerator, activeSession, examState } = require('./generator-fixtures.cjs');
const { installMultibatchFixture, runMultibatch } = require('./exam-multibatch-fixtures.cjs');

test.beforeEach(async ({ page }) => {
  page.multibatchErrors = [];
  page.on('pageerror', error => page.multibatchErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.multibatchErrors.push(message.text()); });
  await openGenerator(page);
  await page.waitForFunction(() => !!window.NOA_MULTI_BATCH_V25);
});

test.afterEach(async ({ page }, testInfo) => {
  const stats = await page.evaluate(() => window.__multiFixture?.stats || null);
  if (stats) expect(Object.values(stats.forbidden)).toEqual([0, 0, 0, 0, 0, 0]);
  expect(page.multibatchErrors).toEqual([]);
  await testInfo.attach('multibatch-consola-y-llamadas', {
    body: JSON.stringify({ stats, errors: page.multibatchErrors }, null, 2), contentType: 'application/json'
  });
});

test('v25 prepara exactamente 45 preguntas de nueve materias conservando identidad y trazabilidad', async ({ page }, testInfo) => {
  await installMultibatchFixture(page, { omitTrace: true });
  const { result, plan, stats, progress } = await runMultibatch(page);
  expect(result.requested).toBe(45);
  expect(plan.valid).toBe(true);
  expect(plan.unsupportedSlots).toEqual([]);
  expect(plan.interactionPolicy.restricted).toBe(true);
  expect(result.accepted).toBe(45);
  expect(result.complete).toBe(true);
  expect(result.questions).toHaveLength(45);
  expect(result.generated).toHaveLength(45);
  expect(result.failures).toEqual([]);
  expect(result.duplicates).toEqual([]);
  expect(result.replacements).toEqual([]);
  expect(new Set(result.questions.map(question => question.id)).size).toBe(45);
  expect(new Set(result.questions.map(question => question.planSlotId)).size).toBe(45);
  expect(new Set(result.questions.map(question => question.interactionType)).size).toBe(4);
  expect(Object.values(result.subjectCounts)).toEqual(Array(9).fill(5));
  expect(result.groups.map(group => [group.id, group.accepted])).toEqual([
    ['primary', 10], ['secondary', 20], ['medicine', 15]
  ]);
  for (const entry of plan.slots) {
    const question = result.questions.find(question => question.planSlotId === entry.id);
    expect(question.subject).toBe(entry.subject);
    expect(question.groupId).toBe(entry.groupId);
    expect(question.slotId).toBe(entry.slotId);
    expect(question.blueprintSlot).toEqual(entry.blueprintSlot);
    expect(question.difficulty).toBe(entry.blueprintSlot.difficulty.level);
    expect(question.interactionType).toBe(entry.blueprintSlot.interactionType);
    expect(question.requestedSourceType).toBe(entry.blueprintSlot.requestedSourceType);
    expect(question.sourceType).toBe(entry.blueprintSlot.sourceType);
    expect(question.sourceTrace).toEqual(entry.blueprintSlot.source);
    expect(question.syllabusCode).toBe(entry.blueprintSlot.syllabusCodes[0]);
    expect(question.accepted).toBe(true);
    expect(question.judge.qualityScore).toBe(10);
    expect(question.blueprint.difficulty).toBe(entry.blueprintSlot.difficulty.level);
  }
  expect(stats.calls).toHaveLength(45);
  expect(stats.calls.every(call => call.options.maxAttempts === 1)).toBe(true);
  expect(stats.maxActive).toBe(2);
  expect(progress[0]).toMatchObject({ processed: 0, accepted: 0, failed: 0, requested: 45, status: 'generating' });
  expect(progress.at(-1)).toMatchObject({ processed: 45, accepted: 45, failed: 0, requested: 45, status: 'complete' });
  for (let index = 1; index < progress.length; index++) {
    expect(progress[index].processed).toBeGreaterThanOrEqual(progress[index - 1].processed);
    expect(progress[index].accepted + progress[index].failed).toBe(progress[index].processed);
  }
  await testInfo.attach('resultado-sintetico-45', { body: JSON.stringify({ result, progress }, null, 2), contentType: 'application/json' });
});

test('v25 respeta bloques de cinco y limita concurrencia a dos incluso si se solicita más', async ({ page }) => {
  await installMultibatchFixture(page, { delay: 2 });
  const { result, stats } = await runMultibatch(page, { concurrency: 99 });
  expect(result.complete).toBe(true);
  expect(stats.maxActive).toBe(2);
  expect(result.summary.concurrency).toBe(2);
  const completed = new Map();
  let previous;
  for (const event of stats.events) {
    if (event.kind === 'start' && event.subject !== previous) {
      if (previous) expect(completed.get(previous)).toBe(5);
      previous = event.subject;
    }
    if (event.kind === 'finish') completed.set(event.subject, (completed.get(event.subject) || 0) + 1);
  }
  expect([...completed.values()]).toEqual(Array(9).fill(5));
});

test('v25 permite ejecución secuencial y conserva el plan original aunque Generator modifique su copia', async ({ page }) => {
  await installMultibatchFixture(page);
  const result = await page.evaluate(async () => {
    const before = JSON.stringify(__multiFixture.plan);
    const original = NOA_BLUEPRINT_GENERATOR.generateSlot;
    NOA_BLUEPRINT_GENERATOR.generateSlot = async (slot, options) => {
      const result = await original(slot, options);
      slot.source.title = 'Mutación de la copia del motor';
      return result;
    };
    const batch = await NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan, concurrency: 1, maxAttempts: 2 });
    return { before, after: JSON.stringify(__multiFixture.plan), batch, maxActive: __multiFixture.stats.maxActive };
  });
  expect(result.after).toBe(result.before);
  expect(result.batch.complete).toBe(true);
  expect(result.maxActive).toBe(1);
});

test('v25 rechaza planes inválidos o alterados antes de llamar Generator', async ({ page }) => {
  await installMultibatchFixture(page);
  const outcomes = await page.evaluate(async () => {
    const original = __multiFixture.plan;
    const cases = [__multiFixture.invalidPlan, null];
    for (const field of ['total', 'slots', 'identity', 'subject', 'group', 'blueprint']) {
      const plan = structuredClone(original);
      if (field === 'total') plan.total = 44;
      if (field === 'slots') plan.slots.pop();
      if (field === 'identity') plan.slots[1].id = plan.slots[0].id;
      if (field === 'subject') plan.subjects[0].id = 'Materia inventada';
      if (field === 'group') plan.groups[0].requiredCount = 9;
      if (field === 'blueprint') {
        plan.slots[0].blueprintSlot = structuredClone(plan.slots[0].blueprintSlot);
        plan.slots[0].blueprintSlot.difficulty.level = 5;
      }
      cases.push(plan);
    }
    const outcomes = [];
    for (const plan of cases) {
      try { await NOA_MULTI_BATCH_V25.generate({ plan }); outcomes.push('accepted'); }
      catch (error) { outcomes.push(error.message); }
    }
    return { outcomes, calls: __multiFixture.stats.calls.length };
  });
  expect(outcomes.outcomes).toHaveLength(8);
  expect(outcomes.outcomes[0]).toMatch(/formato no soportado/i);
  expect(outcomes.outcomes.every(message => message !== 'accepted' && message.length > 0)).toBe(true);
  expect(outcomes.calls).toBe(0);
});

for (const mode of ['reject', 'error']) {
  test(`v25 repone el mismo slot tras ${mode} y conserva todas las decisiones bloqueadas`, async ({ page }) => {
    await installMultibatchFixture(page, { mode });
    const { result, plan, stats } = await runMultibatch(page);
    expect(result.complete).toBe(true);
    expect(result.accepted).toBe(45);
    expect(result.replacements).toHaveLength(1);
    expect(stats.replaceCalls).toHaveLength(1);
    const replacement = stats.replaceCalls[0];
    expect(replacement.slot).toEqual(plan.slots[0].blueprintSlot);
    for (const key of ['subject', 'slotId', 'index', 'difficulty', 'calibratorDifficulty', 'interactionType', 'requestedSourceType', 'locked']) {
      expect(replacement.replacement[key]).toEqual(plan.slots[0].blueprintSlot[key]);
    }
    expect(result.questions[0].planSlotId).toBe(plan.slots[0].id);
    expect(stats.calls.filter(call => call.planSlotId === plan.slots[0].id)).toHaveLength(2);
    expect(result.summary.generated).toBe(mode === 'reject' ? 46 : 45);
  });
}

for (const format of ['single_select', 'drag_classify', 'inline_select', 'drag_order']) {
  test(`v25 detecta duplicado global ${format} entre materias y repone`, async ({ page }) => {
    await installMultibatchFixture(page, { mode: 'duplicate', format, normalizeDuplicate: true, renameBlanks: format === 'inline_select' });
    const { origin, target } = await page.evaluate(format => __multiFixture.pairs[format], format);
    const { result, plan } = await runMultibatch(page);
    expect(origin).toBeGreaterThanOrEqual(0);
    expect(target).toBeGreaterThanOrEqual(0);
    expect(plan.slots[origin].subject).not.toBe(plan.slots[target].subject);
    expect(result.complete).toBe(true);
    expect(result.accepted).toBe(45);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]).toMatchObject({ planSlotId: plan.slots[target].id, kind: 'content' });
    expect(result.replacements).toHaveLength(1);
    expect(result.questions[target].planSlotId).toBe(plan.slots[target].id);
  });
}

test('v25 detecta ID final repetido aunque el contenido sea diferente', async ({ page }) => {
  await installMultibatchFixture(page, { mode: 'id', target: 10, origin: 0 });
  const { result, plan } = await runMultibatch(page);
  expect(result.complete).toBe(true);
  expect(result.duplicates).toHaveLength(1);
  expect(result.duplicates[0]).toMatchObject({ planSlotId: plan.slots[10].id, kind: 'id' });
  expect(new Set(result.questions.map(question => question.id)).size).toBe(45);
});

for (const scenario of ['instruction_only', 'different_operator']) {
  test(`v25 compara el contenido académico single_select: ${scenario}`, async ({ page }) => {
    await installMultibatchFixture(page);
    const result = await page.evaluate(async scenario => {
      const generate = NOA_BLUEPRINT_GENERATOR.generateSlot;
      const { origin, target } = __multiFixture.pairs.single_select;
      NOA_BLUEPRINT_GENERATOR.generateSlot = async (slot, options) => {
        const generated = await generate(slot, options);
        const position = __multiFixture.plan.slots.findIndex(entry => entry.subject === slot.subject && entry.slotId === slot.slotId);
        if ([origin, target].includes(position)) {
          generated.question.text = scenario === 'different_operator' && position === target ? '2 - 2 = ?' : '2 + 2 = ?';
          generated.question.options = ['0', '2', '4', '8'];
          generated.question.correct = scenario === 'different_operator' && position === target ? 0 : 2;
          generated.question.instruction = scenario === 'instruction_only' && position === target
            ? 'Elige la opción correcta.' : 'Selecciona una respuesta.';
        }
        return generated;
      };
      return NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan, maxAttempts: 1 });
    }, scenario);
    if (scenario === 'instruction_only') {
      expect(result.complete).toBe(false);
      expect(result.accepted).toBe(44);
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].kind).toBe('content');
      expect(result.questions).toEqual([]);
    } else {
      expect(result.complete).toBe(true);
      expect(result.accepted).toBe(45);
      expect(result.duplicates).toEqual([]);
    }
  });
}

test('v25 distingue inline_select con igual contexto y distintas opciones por espacio', async ({ page }) => {
  await installMultibatchFixture(page);
  const result = await page.evaluate(async () => {
    const generate = NOA_BLUEPRINT_GENERATOR.generateSlot;
    const { origin, target } = __multiFixture.pairs.inline_select;
    NOA_BLUEPRINT_GENERATOR.generateSlot = async (slot, options) => {
      const generated = await generate(slot, options);
      const position = __multiFixture.plan.slots.findIndex(entry => entry.subject === slot.subject && entry.slotId === slot.slotId);
      if ([origin, target].includes(position)) {
        generated.question.instruction = 'Completa los espacios.';
        generated.question.text = 'Primero [[b1]] y después [[b2]].';
        generated.question.blanks = [
          { id: 'b1', options: position === origin ? ['2', '3'] : ['5', '6'], correct: 0 },
          { id: 'b2', options: ['4', '5'], correct: 0 }
        ];
      }
      return generated;
    };
    return NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan, maxAttempts: 1 });
  });
  expect(result.complete).toBe(true);
  expect(result.accepted).toBe(45);
  expect(result.duplicates).toEqual([]);
});

test('v25 detecta inline duplicado con instrucción genérica distinta', async ({ page }) => {
  await installMultibatchFixture(page);
  const result = await page.evaluate(async () => {
    const generate = NOA_BLUEPRINT_GENERATOR.generateSlot;
    const { origin, target } = __multiFixture.pairs.inline_select;
    NOA_BLUEPRINT_GENERATOR.generateSlot = async (slot, options) => {
      const generated = await generate(slot, options);
      const position = __multiFixture.plan.slots.findIndex(entry => entry.subject === slot.subject && entry.slotId === slot.slotId);
      if ([origin, target].includes(position)) {
        generated.question.instruction = position === origin ? 'Completa los espacios.' : 'Selecciona las respuestas.';
        generated.question.text = 'Primero [[b1]] y después [[b2]].';
        generated.question.blanks = [
          { id: 'b1', options: ['2', '3'], correct: 0 },
          { id: 'b2', options: ['4', '5'], correct: 0 }
        ];
      }
      return generated;
    };
    return NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan, maxAttempts: 1 });
  });
  expect(result.complete).toBe(false);
  expect(result.accepted).toBe(44);
  expect(result.duplicates).toHaveLength(1);
  expect(result.duplicates[0].kind).toBe('content');
  expect(result.questions).toEqual([]);
});

test('v25 limita reintentos y no marca 44 preguntas como examen listo', async ({ page }) => {
  await installMultibatchFixture(page, { mode: 'reject', always: true });
  const { result, plan, stats, progress } = await runMultibatch(page, { maxAttempts: 99 });
  expect(result.accepted).toBe(44);
  expect(result.complete).toBe(false);
  expect(result.questions).toEqual([]);
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toMatchObject({ planSlotId: plan.slots[0].id, attempts: 2 });
  expect(stats.calls.filter(call => call.planSlotId === plan.slots[0].id)).toHaveLength(2);
  expect(result.summary.maxAttempts).toBe(2);
  expect(result.summary.generated).toBe(46);
  expect(progress.at(-1)).toMatchObject({ processed: 45, accepted: 44, failed: 1, status: 'incomplete' });
});

test('v25 informa fallo permanente de Generator sin confundir generados con aceptados', async ({ page }) => {
  await installMultibatchFixture(page, { mode: 'error', always: true });
  const { result, stats } = await runMultibatch(page, { maxAttempts: 1 });
  expect(result.complete).toBe(false);
  expect(result.accepted).toBe(44);
  expect(result.generated).toHaveLength(44);
  expect(result.questions).toEqual([]);
  expect(result.failures).toHaveLength(1);
  expect(result.replacements).toEqual([]);
  expect(stats.calls).toHaveLength(45);
});

test('v25 rechaza preguntas con metadatos, Judge o estructura de renderer incoherentes', async ({ page }) => {
  await installMultibatchFixture(page);
  const outputs = await page.evaluate(async () => {
    const outcomes = [];
    for (const field of ['subject', 'slotId', 'difficulty', 'interactionType', 'requestedSourceType', 'sourceType', 'blueprintSlot', 'judge', 'render']) {
      __multiFixture.stats.calls.length = 0;
      __multiFixture.config = { mode: 'metadata', field, always: true };
      const result = await NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan, maxAttempts: 1 });
      outcomes.push({ field, complete: result.complete, accepted: result.accepted, questions: result.questions, failures: result.failures });
    }
    return outcomes;
  });
  for (const output of outputs) {
    expect(output.complete, output.field).toBe(false);
    expect(output.accepted, output.field).toBe(44);
    expect(output.questions, output.field).toEqual([]);
    expect(output.failures, output.field).toHaveLength(1);
  }
});

test('v25 impide reposiciones que alteren campos bloqueados antes de volver a Generator', async ({ page }) => {
  await installMultibatchFixture(page);
  const results = await page.evaluate(async () => {
    const outputs = [];
    for (const field of ['subject', 'slotId', 'index', 'difficulty', 'calibratorDifficulty', 'interactionType', 'requestedSourceType', 'locked']) {
      __multiFixture.stats.calls.length = 0;
      __multiFixture.config = { mode: 'reject', replacementMutation: field };
      const result = await NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan });
      outputs.push({ field, result, calls: __multiFixture.stats.calls.filter(call => call.planSlotId === __multiFixture.plan.slots[0].id).length });
    }
    return outputs;
  });
  for (const output of results) {
    expect(output.result.complete, output.field).toBe(false);
    expect(output.result.accepted, output.field).toBe(44);
    expect(output.result.questions, output.field).toEqual([]);
    expect(output.calls, output.field).toBe(1);
  }
});

test('v25 registra fallback real del motor en una reposición sin modificar la fuente planificada', async ({ page }) => {
  await installMultibatchFixture(page, { course: true, readyCourse: true, mode: 'error' });
  const output = await page.evaluate(async () => {
    const target = __multiFixture.plan.slots.findIndex(entry => entry.blueprintSlot.sourceType === 'course');
    __multiFixture.config.target = target;
    db.courseSources = [];
    const before = JSON.stringify(__multiFixture.plan);
    const result = await NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan });
    return { result, entry: __multiFixture.plan.slots[target], before, after: JSON.stringify(__multiFixture.plan) };
  });
  expect(output.entry.blueprintSlot.sourceType).toBe('course');
  expect(output.result.complete).toBe(true);
  expect(output.after).toBe(output.before);
  const fallback = output.result.fallbacks.find(item => item.planSlotId === output.entry.id);
  expect(fallback).toMatchObject({ requestedSourceType: 'course', sourceType: 'official', fallbackFrom: 'course', fallbackReason: 'no_ready_course_source' });
  const question = output.result.questions.find(item => item.planSlotId === output.entry.id);
  expect(question.sourceType).toBe('official');
  expect(question.requestedSourceType).toBe('course');
  expect(question.slotId).toBe(output.entry.slotId);
});

test('v25 serializa progreso, captura fallos del callback y no emite callbacks tras resolver', async ({ page }) => {
  await installMultibatchFixture(page);
  const output = await page.evaluate(async () => {
    let active = 0, max = 0;
    const events = [];
    const result = await NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan, onProgress: async progress => {
      active++; max = Math.max(max, active);
      try {
        await new Promise(resolve => setTimeout(resolve, 1));
        events.push(structuredClone(progress));
        if (events.length === 2) throw new Error('Fallo sintético de callback');
      } finally { active--; }
    } });
    const before = events.length;
    await new Promise(resolve => setTimeout(resolve, 20));
    return { result, max, active, before, after: events.length, last: events.at(-1) };
  });
  expect(output.result.complete).toBe(true);
  expect(output.max).toBe(1);
  expect(output.active).toBe(0);
  expect(output.before).toBe(output.after);
  expect(output.last.status).toBe('complete');
  expect(output.result.summary.progressErrors).toContain('Fallo sintético de callback');
});

test('v25 rechaza ejecuciones solapadas y vuelve a permitir una nueva al finalizar', async ({ page }) => {
  await installMultibatchFixture(page, { deferred: true });
  const output = await page.evaluate(async () => {
    const first = NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan });
    await new Promise(resolve => setTimeout(resolve, 0));
    let rejection;
    try { await NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan }); } catch (error) { rejection = error.message; }
    __multiFixture.release();
    const result = await first;
    __multiFixture.config = {};
    const next = await NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan });
    return { rejection, result, next };
  });
  expect(output.rejection).toBeTruthy();
  expect(output.result.complete).toBe(true);
  expect(output.next.complete).toBe(true);
});

test('v25 conserva sesión activa, revisión, borradores, intentos y almacenamiento al preparar 45', async ({ page }, testInfo) => {
  await activeSession(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(KEY)).activeExam?.answers.length)).toBe(2);
  await installMultibatchFixture(page);
  const beforeSession = await examState(page);
  const output = await page.evaluate(async () => {
    const capture = () => JSON.stringify({ db, storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
      queue: examQueue, index: examIndex, score: examScore, answers: examAnswers,
      drafts: [...NOA_EXAM_NAVIGATION.drafts.entries()], revision: NOA_ANSWER_REVISION.capture() });
    const before = capture();
    const result = await NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan });
    const afterSuccess = capture();
    __multiFixture.config = { mode: 'error', always: true, target: 0 };
    const incomplete = await NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan });
    return { before, afterSuccess, after: capture(), complete: result.complete,
      incomplete: { complete: incomplete.complete, accepted: incomplete.accepted, questions: incomplete.questions } };
  });
  expect(output.complete).toBe(true);
  expect(output.afterSuccess).toBe(output.before);
  expect(output.after).toBe(output.before);
  expect(output.incomplete).toEqual({ complete: false, accepted: 44, questions: [] });
  expect(await examState(page)).toEqual(beforeSession);
  await testInfo.attach('sesion-protegida-multibatch', { body: JSON.stringify(output, null, 2), contentType: 'application/json' });
});

test('v25 no entrega examen listo si la conversión pierde cantidad, identidad o unicidad', async ({ page }) => {
  await installMultibatchFixture(page);
  const outcomes = await page.evaluate(async () => {
    const convert = NOA_MIXED_EXAM.questionsFromBatch;
    const outcomes = [];
    for (const scenario of ['length', 'identity', 'id']) {
      NOA_MIXED_EXAM.questionsFromBatch = batch => {
        const questions = convert(batch);
        if (scenario === 'length') questions.pop();
        if (scenario === 'identity') delete questions[0].planSlotId;
        if (scenario === 'id') questions[1].id = questions[0].id;
        return questions;
      };
      const result = await NOA_MULTI_BATCH_V25.generate({ plan: __multiFixture.plan });
      outcomes.push({ scenario, result });
    }
    return outcomes;
  });
  for (const { scenario, result } of outcomes) {
    expect(result.accepted, scenario).toBe(45);
    expect(result.complete, scenario).toBe(false);
    expect(result.questions, scenario).toEqual([]);
    expect(result.failures.some(failure => failure.stage === 'conversion'), scenario).toBe(true);
  }
});

test.describe('v25 multilote con service worker real', () => {
  test.use({ serviceWorkers: 'allow' });
  test('v25 queda en caché v69 y el resto de NOA continúa disponible tras recargar offline', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cached = await page.evaluate(async () => {
      const scope = (await navigator.serviceWorker.getRegistration()).scope;
      const name = (await caches.keys()).find(name => name.startsWith(`noa-mobile:${encodeURIComponent(scope)}:`));
      return { name, module: !!await (await caches.open(name)).match(new URL('excoba_patch_v25_multibatch.js', scope).href) };
    });
    expect(cached.name).toMatch(/:v6-69$/);
    expect(cached.module).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => !!window.NOA_MULTI_BATCH_V25 && !!window.NOA_RESULTS_ENGINE);
    await expect(page.locator('#nav')).toBeVisible();
    await expect(page.locator('#examCount option')).toHaveCount(6);
    await expect(page.locator('#noaGeneratorCount option')).toHaveCount(2);
  });
});
