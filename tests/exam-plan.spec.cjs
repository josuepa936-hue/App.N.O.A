const { test, expect } = require('@playwright/test');
const { openGenerator, activeSession, examState } = require('./generator-fixtures.cjs');

const subjects = [
  'EXCOBA Primaria · Español',
  'EXCOBA Primaria · Matemáticas',
  'EXCOBA Secundaria · Español',
  'EXCOBA Secundaria · Matemáticas',
  'EXCOBA Secundaria · Ciencias naturales',
  'EXCOBA Secundaria · Ciencias sociales',
  'EXCOBA Medicina · Matemáticas para estadística',
  'EXCOBA Medicina · Biología',
  'EXCOBA Medicina · Química'
];

async function guardGeneration(page) {
  await page.evaluate(() => {
    window.__planCalls = { ai: 0, fetch: 0, batch: 0, generator: 0, exam: 0 };
    const forbidden = key => () => {
      window.__planCalls[key]++;
      throw new Error(`El planificador no debe llamar ${key}`);
    };
    window.callAI = forbidden('ai');
    window.fetch = forbidden('fetch');
    NOA_BATCH_ORCHESTRATOR.generate = forbidden('batch');
    NOA_BLUEPRINT_GENERATOR.generateSlot = forbidden('generator');
    window.__planNativeStart ||= NOA_MIXED_EXAM.start;
    NOA_MIXED_EXAM.start = forbidden('exam');
  });
}

test.beforeEach(async ({ page }) => {
  page.planErrors = [];
  page.on('pageerror', error => page.planErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.planErrors.push(message.text()); });
  await openGenerator(page);
  await page.waitForFunction(() => !!window.NOA_EXAM_PLAN_V25);
  await guardGeneration(page);
});

test.afterEach(async ({ page }, testInfo) => {
  const calls = await page.evaluate(() => window.__planCalls);
  expect(calls).toEqual({ ai: 0, fetch: 0, batch: 0, generator: 0, exam: 0 });
  expect(page.planErrors).toEqual([]);
  await testInfo.attach('v25-consola-y-llamadas-prohibidas', {
    body: JSON.stringify({ calls, errors: page.planErrors }, null, 2), contentType: 'application/json'
  });
});

test('v25 planifica nueve materias reales, 45 slots y distribución 10/20/15 sin alterar Blueprint', async ({ page }, testInfo) => {
  const { plan, originals, supported, appropriate } = await page.evaluate(() => {
    const original = NOA_SOURCE_BLUEPRINT.build;
    const originals = [];
    NOA_SOURCE_BLUEPRINT.build = options => {
      const blueprint = original(options);
      originals.push({ options, blueprint: structuredClone(blueprint) });
      return blueprint;
    };
    const supported = [...NOA_BATCH_ORCHESTRATOR.supportedTypes];
    const appropriate = Object.fromEntries(NOA_EXCOBA_V4.subjects.map(subject => [subject.value,
      NOA_EXCOBA_REALISM.formatsForSubject(subject.value).filter(type => supported.includes(type))]));
    return { plan: NOA_EXAM_PLAN_V25.build(), originals, supported, appropriate };
  });
  expect(plan.version).toBe('25.0');
  expect(plan.requestedTotal).toBe(45);
  expect(plan.total).toBe(45);
  expect(plan.distributionNote).toMatch(/proporcional/i);
  expect(plan.groups.map(group => [group.id, group.requiredCount])).toEqual([
    ['primary', 10], ['secondary', 20], ['medicine', 15]
  ]);
  expect(plan.groups.map(group => group.subjectIds)).toEqual([
    subjects.slice(0, 2), subjects.slice(2, 6), subjects.slice(6)
  ]);
  expect(plan.subjects.map(subject => subject.id)).toEqual(subjects);
  expect(originals.map(item => item.options)).toEqual(subjects.map(subject => ({ subject, count: 5,
    supportedInteractionTypes: supported })));
  expect(plan.interactionPolicy).toMatchObject({ restricted: true,
    supportedInteractionTypes: supported, selection: 'subject_intersection' });
  expect(plan.interactionPolicy.note).toMatch(/restringida/i);
  expect(plan.interactionPolicy.note).toMatch(/no.*oficial/i);
  expect(plan.slots).toHaveLength(45);
  expect(new Set(plan.slots.map(slot => slot.id)).size).toBe(45);
  for (let index = 0; index < subjects.length; index++) {
    const subject = plan.subjects[index];
    expect(subject.requiredCount).toBe(5);
    expect(subject.label).toBeTruthy();
    expect(subject.blueprint).toEqual(originals[index].blueprint);
    expect(subject.blueprint.slots).toHaveLength(5);
    expect(subject.blueprint.interactionPolicy).toMatchObject({ restricted: true,
      supportedInteractionTypes: supported, allowedInteractionTypes: appropriate[subject.id] });
    const planned = plan.slots.filter(slot => slot.subject === subject.id);
    expect(planned).toHaveLength(5);
    for (let slotIndex = 0; slotIndex < 5; slotIndex++) {
      const slot = planned[slotIndex], original = originals[index].blueprint.slots[slotIndex];
      expect(slot.groupId).toBe(subject.groupId);
      expect(slot.slotId).toBe(original.slotId);
      expect(slot.id).toBe(`v25:${encodeURIComponent(subject.id)}:${original.slotId}`);
      expect(slot.blueprintSlot).toEqual(original);
      expect(slot.blueprintSlot.difficulty).toEqual(original.difficulty);
      expect(appropriate[subject.id]).toContain(slot.blueprintSlot.interactionType);
      expect(slot.blueprintSlot.source.kind).toBe('official');
      expect(slot.blueprintSlot.syllabusCodes).not.toHaveLength(0);
    }
  }
  expect(plan.profile).toEqual(originals[0].blueprint.profile);
  expect(plan.calibration).toEqual(originals[0].blueprint.calibration);
  expect(plan.interactionTypes).toEqual([...new Set(plan.slots.map(slot => slot.blueprintSlot.interactionType))]);
  expect(plan.structureValid).toBe(true);
  expect(plan.valid).toBe(true);
  expect(plan.unsupportedSlots).toEqual([]);
  expect(plan.errors).toEqual([]);
  await testInfo.attach('plan-excoba-45-real', { body: JSON.stringify(plan, null, 2), contentType: 'application/json' });
});

test('v25 conserva orden, identidades y contenido al construir el mismo plan dos veces', async ({ page }) => {
  const plans = await page.evaluate(() => {
    const withoutTimestamps = plan => {
      for (const subject of plan.subjects) delete subject.blueprint.createdAt;
      return plan;
    };
    return [withoutTimestamps(NOA_EXAM_PLAN_V25.build()), withoutTimestamps(NOA_EXAM_PLAN_V25.build())];
  });
  expect(plans[0]).toEqual(plans[1]);
});

test('v25 reutiliza los cuatro perfiles v6 y conserva la dificultad final de cada Blueprint', async ({ page }) => {
  for (const key of ['official', 'extended', 'course', 'extreme']) {
    const result = await page.evaluate(key => {
      document.getElementById('excobaTrainingProfile').value = key;
      db.settings.noaTrainingProfile = key;
      return { plan: NOA_EXAM_PLAN_V25.build(), profile: NOA_SOURCE_BLUEPRINT.currentProfile() };
    }, key);
    expect(result.plan.profile).toEqual(result.profile);
    expect(result.plan.profile.key).toBe(key);
    expect(result.plan.valid).toBe(true);
    expect(result.plan.unsupportedSlots).toEqual([]);
    for (const subject of result.plan.subjects) {
      expect(subject.blueprint.profile).toEqual(result.profile);
      for (const slot of subject.blueprint.slots) {
        expect(slot.difficulty.level).toBe(Math.min(5, slot.calibratorDifficulty + (key === 'extreme' ? 1 : 0)));
      }
    }
  }
});

test('v25 refleja el ciclo inicial y el adaptativo sin recalcular ni elevar la dificultad', async ({ page }) => {
  for (const sample of [0, 4, 5]) {
    const result = await page.evaluate(sample => {
      db.attempts = sample ? [{ answers: Array.from({ length: sample }, () => ({
        blueprint: { difficulty: 3 }, scoreFraction: 1, ok: true
      })) }] : [];
      return { plan: NOA_EXAM_PLAN_V25.build(), expected: NOA_SOURCE_BLUEPRINT.calibrationState() };
    }, sample);
    expect(result.plan.calibration.adaptive).toBe(sample >= 5);
    expect(result.plan.valid).toBe(true);
    expect(result.plan.unsupportedSlots).toEqual([]);
    expect(result.plan.calibration.sample).toBe(sample);
    expect(result.plan.calibration.cycle).toEqual(result.expected.cycle);
    for (const subject of result.plan.subjects) {
      expect(subject.blueprint.calibration).toEqual(result.plan.calibration);
      expect(subject.blueprint.slots.map(slot => slot.calibratorDifficulty)).toEqual(result.expected.cycle.slice(0, 5));
    }
  }
});

test('v25 informa el fallback a fuente oficial cuando el perfil curso carece de material analizado', async ({ page }) => {
  const plan = await page.evaluate(() => {
    document.getElementById('excobaTrainingProfile').value = 'course';
    db.settings.noaTrainingProfile = 'course';
    db.courseSources = [];
    return NOA_EXAM_PLAN_V25.build();
  });
  expect(plan.profile.key).toBe('course');
  const courseSlots = plan.slots.filter(slot => slot.blueprintSlot.requestedSourceType === 'course');
  expect(courseSlots.length).toBeGreaterThan(0);
  for (const { blueprintSlot: slot } of courseSlots) {
    expect(slot.sourceType).toBe('official');
    expect(slot.fallbackFrom).toBe('course');
    expect(slot.fallbackReason).toBe('no_ready_course_source');
    expect(slot.source.kind).toBe('official');
    expect(slot.source).not.toHaveProperty('courseSourceId');
  }
});

test('v25 declara válido el plan estándar con los cuatro formatos compatibles', async ({ page }) => {
  const plan = await page.evaluate(() => NOA_EXAM_PLAN_V25.build());
  expect(plan.total).toBe(45);
  expect(plan.slots).toHaveLength(45);
  expect(plan.structureValid).toBe(true);
  expect(plan.valid).toBe(true);
  expect(plan.errors).toEqual([]);
  expect(plan.unsupportedSlots).toEqual([]);
  expect(new Set(plan.interactionTypes)).toEqual(new Set(['single_select', 'drag_classify', 'inline_select', 'drag_order']));
});

test('v25 detecta un formato no soportado y conserva todos los slots y su dificultad', async ({ page }) => {
  const result = await page.evaluate(() => {
    const original = NOA_SOURCE_BLUEPRINT.build;
    let injected;
    NOA_SOURCE_BLUEPRINT.build = options => {
      const blueprint = original(options);
      if (!injected) {
        blueprint.slots[0].interactionType = 'formato_sintetico_no_soportado';
        injected = structuredClone(blueprint.slots[0]);
      }
      return blueprint;
    };
    return { plan: NOA_EXAM_PLAN_V25.build(), injected };
  });
  expect(result.plan.structureValid).toBe(true);
  expect(result.plan.valid).toBe(false);
  expect(result.plan.slots).toHaveLength(45);
  expect(result.plan.slots[0].blueprintSlot).toEqual(result.injected);
  expect(result.plan.unsupportedSlots).toEqual([{
    id: result.plan.slots[0].id, subject: subjects[0], interactionType: 'formato_sintetico_no_soportado'
  }]);
  expect(result.plan.errors.some(error => error.code === 'unsupported_interaction')).toBe(true);
});

for (const scenario of ['missing_subject', 'duplicate_subject', 'missing_syllabus']) {
  test(`v25 rechaza catálogo inválido: ${scenario}`, async ({ page }) => {
    const plan = await page.evaluate(scenario => {
      if (scenario === 'missing_subject') NOA_EXCOBA_V4.subjects.shift();
      if (scenario === 'duplicate_subject') NOA_EXCOBA_V4.subjects[1].value = NOA_EXCOBA_V4.subjects[0].value;
      if (scenario === 'missing_syllabus') {
        db.masterSyllabus.items = db.masterSyllabus.items.filter(item => item.subject !== NOA_EXCOBA_V4.subjects[0].value);
      }
      return NOA_EXAM_PLAN_V25.build();
    }, scenario);
    expect(plan.structureValid).toBe(false);
    expect(plan.valid).toBe(false);
    expect(plan.errors.some(error => error.code === scenario)).toBe(true);
  });
}

test('v25 rechaza errores, slots inválidos, identidades duplicadas y metadatos incoherentes de Blueprint', async ({ page }) => {
  const results = await page.evaluate(() => {
    const original = NOA_SOURCE_BLUEPRINT.build;
    return ['blueprint_error', 'invalid_blueprint', 'invalid_slot', 'duplicate_slot_id', 'profile_mismatch', 'calibration_mismatch'].map(scenario => {
      let index = 0;
      NOA_SOURCE_BLUEPRINT.build = options => {
        index++;
        if (scenario === 'blueprint_error' && index === 1) throw new Error('Fallo Blueprint sintético');
        const blueprint = original(options);
        if (index === 1 && scenario === 'invalid_blueprint') blueprint.slots.pop();
        if (index === 1 && scenario === 'invalid_slot') delete blueprint.slots[0].source;
        if (index === 1 && scenario === 'duplicate_slot_id') blueprint.slots[1].slotId = blueprint.slots[0].slotId;
        if (index === 2 && scenario === 'profile_mismatch') blueprint.profile.key = 'perfil_sintetico_distinto';
        if (index === 2 && scenario === 'calibration_mismatch') blueprint.calibration.cycle = [5, 5, 5, 5, 5];
        return blueprint;
      };
      const plan = NOA_EXAM_PLAN_V25.build();
      return { scenario, structureValid: plan.structureValid, valid: plan.valid, errors: plan.errors };
    });
  });
  for (const result of results) {
    expect(result.structureValid, result.scenario).toBe(false);
    expect(result.valid, result.scenario).toBe(false);
    expect(result.errors.some(error => error.code === result.scenario), result.scenario).toBe(true);
  }
});

test('v25 informa motor faltante sin generar ni iniciar examen', async ({ page }) => {
  const plans = await page.evaluate(() => {
    const original = NOA_SOURCE_BLUEPRINT.build;
    NOA_SOURCE_BLUEPRINT.build = undefined;
    const missingBlueprint = NOA_EXAM_PLAN_V25.build();
    NOA_SOURCE_BLUEPRINT.build = original;
    NOA_BATCH_ORCHESTRATOR.supportedTypes = {};
    return [missingBlueprint, NOA_EXAM_PLAN_V25.build()];
  });
  for (const plan of plans) {
    expect(plan.structureValid).toBe(false);
    expect(plan.valid).toBe(false);
    expect(plan.errors.some(error => error.code === 'missing_engine')).toBe(true);
  }
});

test('v25 no modifica sesión activa, revisión, borradores, intentos ni almacenamiento', async ({ page }, testInfo) => {
  await page.evaluate(() => { NOA_MIXED_EXAM.start = window.__planNativeStart; });
  await activeSession(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem(KEY)).activeExam?.answers.length)).toBe(2);
  const beforeSession = await examState(page);
  const result = await page.evaluate(() => {
    NOA_MIXED_EXAM.start = () => {
      window.__planCalls.exam++;
      throw new Error('El planificador no debe iniciar examen');
    };
    const capture = () => JSON.stringify({
      db, storage: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])),
      queue: examQueue, index: examIndex, score: examScore, answers: examAnswers,
      drafts: [...NOA_EXAM_NAVIGATION.drafts.entries()], revision: NOA_ANSWER_REVISION.capture(),
      calibration: NOA_CALIBRATOR.get()
    });
    const before = capture();
    const plan = NOA_EXAM_PLAN_V25.build();
    return { before, after: capture(), total: plan.total };
  });
  expect(result.total).toBe(45);
  expect(result.after).toBe(result.before);
  expect(await examState(page)).toEqual(beforeSession);
  await testInfo.attach('sesion-y-almacenamiento-antes-despues', {
    body: JSON.stringify(result, null, 2), contentType: 'application/json'
  });
});

test.describe('v25 con service worker real', () => {
  test.use({ serviceWorkers: 'allow' });

  test('v25 se almacena en caché v68 aislada y construye el plan tras recargar offline', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cached = await page.evaluate(async () => {
      const scope = (await navigator.serviceWorker.getRegistration()).scope;
      const name = (await caches.keys()).find(name => name.startsWith(`noa-mobile:${encodeURIComponent(scope)}:`));
      return { name, v25: !!await (await caches.open(name)).match(new URL('excoba_patch_v25_exam_plan.js', scope).href) };
    });
    expect(cached.name).toMatch(/:v6-68$/);
    expect(cached.v25).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => !!window.NOA_EXAM_PLAN_V25);
    await guardGeneration(page);
    const plan = await page.evaluate(() => NOA_EXAM_PLAN_V25.build());
    expect(plan.total).toBe(45);
    expect(plan.valid).toBe(true);
    expect(plan.structureValid).toBe(true);
    expect(plan.slots).toHaveLength(45);
  });
});
