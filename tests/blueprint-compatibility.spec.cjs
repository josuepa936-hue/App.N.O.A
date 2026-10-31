const { test, expect } = require('@playwright/test');
const { createHash } = require('node:crypto');
const legacy = require('./fixtures/v8-legacy-fingerprints.json');
const { openGenerator, activeSession } = require('./generator-fixtures.cjs');

const supported = ['single_select', 'drag_classify', 'inline_select', 'drag_order'];

test.beforeEach(async ({ page }) => {
  page.compatibilityErrors = [];
  page.on('pageerror', error => page.compatibilityErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.compatibilityErrors.push(message.text()); });
  await openGenerator(page);
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00Z'));
  await page.evaluate(() => {
    const calls = window.__compatibilityCalls = { ai: 0, fetch: 0, batch: 0, generator: 0, multi: 0, exam: 0 };
    const forbidden = key => () => { calls[key]++; throw new Error(`Llamada prohibida: ${key}`); };
    window.callAI = forbidden('ai');
    window.fetch = forbidden('fetch');
    NOA_BATCH_ORCHESTRATOR.generate = forbidden('batch');
    NOA_BLUEPRINT_GENERATOR.generateSlot = forbidden('generator');
    NOA_MULTI_BATCH_V25.generate = forbidden('multi');
    window.__compatibilityNativeStart = NOA_MIXED_EXAM.start;
    NOA_MIXED_EXAM.start = forbidden('exam');
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const calls = await page.evaluate(() => __compatibilityCalls);
  expect(Object.values(calls)).toEqual([0, 0, 0, 0, 0, 0]);
  expect(page.compatibilityErrors).toEqual([]);
  await testInfo.attach('compatibilidad-consola-y-llamadas', {
    body: JSON.stringify({ calls, errors: page.compatibilityErrors }, null, 2), contentType: 'application/json'
  });
});

test('v8 sin restricción conserva las huellas originales de nueve materias y ocho estados de entrenamiento', async ({ page }) => {
  // Capturadas con el motor original del commit indicado en el fixture,
  // antes de modificarlo; no dependen del HEAD ni del historial de Git al ejecutar.
  for (const { profile, sample, sha256 } of legacy.cases) {
    const blueprints = await page.evaluate(({ profile, sample }) => {
      document.getElementById('excobaTrainingProfile').value = profile;
      db.settings.noaTrainingProfile = profile;
      db.attempts = sample ? [{ answers: Array.from({ length: sample }, () => ({
        blueprint: { difficulty: 3 }, scoreFraction: 1, ok: true
      })) }] : [];
      return NOA_EXCOBA_V4.subjects.map(subject => {
        const blueprint = NOA_SOURCE_BLUEPRINT.build({ subject: subject.value, count: 5 });
        delete blueprint.createdAt;
        return blueprint;
      });
    }, { profile, sample });
    expect(createHash('sha256').update(JSON.stringify(blueprints)).digest('hex'), `${profile}/${sample}`).toBe(sha256);
    expect(blueprints.every(blueprint => !Object.hasOwn(blueprint, 'interactionPolicy'))).toBe(true);
  }
});

test('v8 trata undefined como ausencia y no modifica el comportamiento o los metadatos anteriores', async ({ page }) => {
  const result = await page.evaluate(() => NOA_EXCOBA_V4.subjects.map(subject => ({
    absent: NOA_SOURCE_BLUEPRINT.build({ subject: subject.value, count: 5 }),
    undefinedOption: NOA_SOURCE_BLUEPRINT.build({ subject: subject.value, count: 5, supportedInteractionTypes: undefined })
  })));
  for (const item of result) expect(item.undefinedOption).toEqual(item.absent);
});

test('v8 restringe determinísticamente en orden v7 sin depender del orden o duplicados de la lista soportada', async ({ page }) => {
  const results = await page.evaluate(types => NOA_EXCOBA_V4.subjects.map(subject => ({
    normal: NOA_SOURCE_BLUEPRINT.build({ subject: subject.value, count: 5, supportedInteractionTypes: types }),
    reversed: NOA_SOURCE_BLUEPRINT.build({ subject: subject.value, count: 5, supportedInteractionTypes: [...types].reverse() }),
    repeated: NOA_SOURCE_BLUEPRINT.build({ subject: subject.value, count: 5, supportedInteractionTypes: [...types, ...types] }),
    allowed: NOA_EXCOBA_REALISM.formatsForSubject(subject.value).filter(type => types.includes(type))
  })), supported);
  for (const { normal, reversed, repeated, allowed } of results) {
    expect(normal.slots).toEqual(reversed.slots);
    expect(normal.slots).toEqual(repeated.slots);
    expect(normal.interactionPolicy).toMatchObject({ restricted: true,
      supportedInteractionTypes: supported, allowedInteractionTypes: allowed });
    expect(repeated.interactionPolicy.supportedInteractionTypes).toEqual(supported);
    expect(normal.interactionPolicy.note).toMatch(/no.*oficial/i);
    expect(normal.slots.every(slot => allowed.includes(slot.interactionType))).toBe(true);
  }
});

test('v8 restringido conserva fuentes, Calibrator y dificultad y construye realismo coherente con el formato elegido', async ({ page }) => {
  const cases = await page.evaluate(types => {
    const results = [];
    for (const profile of ['official', 'extended', 'course', 'extreme']) {
      document.getElementById('excobaTrainingProfile').value = profile;
      db.settings.noaTrainingProfile = profile;
      for (const sample of [0, 5]) {
        db.attempts = sample ? [{ answers: Array.from({ length: sample }, () => ({
          blueprint: { difficulty: 3 }, scoreFraction: 1, ok: true
        })) }] : [];
        for (const subject of NOA_EXCOBA_V4.subjects) {
          const original = NOA_SOURCE_BLUEPRINT.build({ subject: subject.value, count: 5 });
          const restricted = NOA_SOURCE_BLUEPRINT.build({ subject: subject.value, count: 5, supportedInteractionTypes: types });
          const realism = restricted.slots.map(slot => NOA_EXCOBA_REALISM.makeBlueprint({
            subject: slot.subject, difficulty: slot.difficulty.level,
            sourceType: slot.requestedSourceType, interactionType: slot.interactionType
          }));
          results.push({ original, restricted, realism });
        }
      }
    }
    return results;
  }, supported);
  for (const { original, restricted, realism } of cases) {
    const { interactionPolicy, slots, ...metadata } = restricted;
    const { slots: previousSlots, ...previousMetadata } = original;
    expect(metadata).toEqual(previousMetadata);
    for (let index = 0; index < slots.length; index++) {
      const { interactionType, responseFamily, partialCreditEligible, ...preserved } = slots[index];
      const { interactionType: oldType, responseFamily: oldFamily, partialCreditEligible: oldCredit, ...previous } = previousSlots[index];
      expect(preserved).toEqual(previous);
      expect(interactionType).toBe(realism[index].interactionType);
      expect(responseFamily).toBe(realism[index].responseFamily);
      expect(partialCreditEligible).toBe(realism[index].partialCredit);
      expect(slots[index].difficulty).toEqual(realism[index].difficulty);
      expect(slots[index].realismRules).toEqual(realism[index].realismRules);
      expect(slots[index].locked).toEqual({ difficulty: true, interactionType: true, requestedSourceType: true });
    }
  }
});

test('v8 rechaza explícitamente restricciones inválidas o sin formatos apropiados para la materia', async ({ page }) => {
  const errors = await page.evaluate(() => {
    const subject = NOA_EXCOBA_V4.subjects[0].value;
    return [null, 'single_select', {}, [], ['numeric_input'], ['formato_inexistente']].map(supportedInteractionTypes => {
      try {
        NOA_SOURCE_BLUEPRINT.build({ subject, count: 5, supportedInteractionTypes });
        return null;
      } catch (error) { return error.message; }
    });
  });
  expect(errors).toHaveLength(6);
  for (const error of errors) expect(typeof error === 'string' && error.length > 0).toBe(true);
});

test('v8 repone los 45 slots compatibles preservando formato, dificultad, identidad y campos bloqueados', async ({ page }) => {
  const result = await page.evaluate(types => NOA_EXCOBA_V4.subjects.flatMap(subject => {
    const blueprint = NOA_SOURCE_BLUEPRINT.build({ subject: subject.value, count: 5, supportedInteractionTypes: types });
    return blueprint.slots.map(slot => ({ slot,
      replacements: [NOA_SOURCE_BLUEPRINT.replaceSlot(slot, 1), NOA_SOURCE_BLUEPRINT.replaceSlot(slot, 2)] }));
  }), supported);
  expect(result).toHaveLength(45);
  for (const { slot, replacements } of result) {
    for (const replacement of replacements) {
      for (const field of ['subject', 'index', 'slotId', 'difficulty', 'calibratorDifficulty',
        'interactionType', 'requestedSourceType', 'locked', 'responseFamily', 'partialCreditEligible', 'realismRules']) {
        expect(replacement[field], `${slot.subject}/${slot.slotId}/${field}`).toEqual(slot[field]);
      }
    }
  }
});

test('v25 plan real compatible registra la restricción y su distribución sin atribuir frecuencias oficiales', async ({ page }, testInfo) => {
  const result = await page.evaluate(() => {
    const plan = NOA_EXAM_PLAN_V25.build();
    return { plan, distribution: plan.subjects.map(subject => ({
      subject: subject.id, groupId: subject.groupId,
      allowed: NOA_EXCOBA_REALISM.formatsForSubject(subject.id),
      formats: subject.blueprint.slots.reduce((counts, slot) => {
        counts[slot.interactionType] = (counts[slot.interactionType] || 0) + 1;
        return counts;
      }, {})
    })) };
  });
  expect(result.plan.total).toBe(45);
  expect(result.plan.valid).toBe(true);
  expect(result.plan.unsupportedSlots).toEqual([]);
  expect(result.plan.errors).toEqual([]);
  expect(result.plan.groups.map(group => group.requiredCount)).toEqual([10, 20, 15]);
  expect(new Set(result.plan.slots.map(slot => slot.id)).size).toBe(45);
  expect(result.plan.interactionPolicy).toMatchObject({ restricted: true, supportedInteractionTypes: supported, selection: 'subject_intersection' });
  expect(result.plan.interactionPolicy.note).toMatch(/no.*oficial/i);
  for (const subject of result.distribution) {
    expect(Object.values(subject.formats).reduce((sum, count) => sum + count, 0)).toBe(5);
    expect(Object.keys(subject.formats).every(type => supported.includes(type) && subject.allowed.includes(type))).toBe(true);
  }
  await testInfo.attach('distribucion-compatible-real-v25', {
    body: JSON.stringify({ distribution: result.distribution, policy: result.plan.interactionPolicy,
      total: result.plan.total, unsupported: result.plan.unsupportedSlots.length }, null, 2), contentType: 'application/json'
  });
});

test('v8 y v25 compatibles no alteran sesión, revisión, borradores ni almacenamiento y no llaman IA', async ({ page }) => {
  await page.evaluate(() => { NOA_MIXED_EXAM.start = __compatibilityNativeStart; });
  await activeSession(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(KEY)).activeExam?.answers.length)).toBe(2);
  const result = await page.evaluate(types => {
    NOA_MIXED_EXAM.start = () => { __compatibilityCalls.exam++; throw new Error('No iniciar examen'); };
    const capture = () => JSON.stringify({
      db, queue: examQueue, index: examIndex, score: examScore, answers: examAnswers,
      drafts: [...NOA_EXAM_NAVIGATION.drafts.entries()], revision: NOA_ANSWER_REVISION.capture(),
      calibration: NOA_CALIBRATOR.get(),
      storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]))
    });
    const before = capture();
    for (const subject of NOA_EXCOBA_V4.subjects) NOA_SOURCE_BLUEPRINT.build({
      subject: subject.value, count: 5, supportedInteractionTypes: types
    });
    const plan = NOA_EXAM_PLAN_V25.build();
    let rejected = false;
    try {
      NOA_SOURCE_BLUEPRINT.build({ subject: NOA_EXCOBA_V4.subjects[0].value,
        count: 5, supportedInteractionTypes: [] });
    } catch { rejected = true; }
    return { before, after: capture(), total: plan.total, rejected };
  }, supported);
  expect(result.total).toBe(45);
  expect(result.rejected).toBe(true);
  expect(result.after).toBe(result.before);
});
