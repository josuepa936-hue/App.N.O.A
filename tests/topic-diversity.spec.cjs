const { test, expect } = require('@playwright/test');
const { activeSession } = require('./generator-fixtures.cjs');
const { waitDraftCheckpoint } = require('./exam-45-ui-fixtures.cjs');
const { questions } = require('./fixtures.cjs');
const { biology, chemistry, supported, dates, guardPlanning, openTopics, catalog, limitCatalog, profile,
  expose, seedRanking, build, codes, state, courses } = require('./topic-diversity-fixtures.cjs');

test.beforeEach(async ({ page }) => {
  page.topicErrors = []; page.topicRequests = [];
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && (url.origin !== 'http://127.0.0.1:8022' || !['GET', 'HEAD'].includes(request.method()))) {
      page.topicRequests.push({ url: url.href, method: request.method() }); return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', error => page.topicErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') page.topicErrors.push(message.text()); });
  await openTopics(page);
});

test.afterEach(async ({ page }, testInfo) => {
  const result = await page.evaluate(() => ({ calls: __topicFixture.calls,
    captures: __topicFixture.captures.length, stats: NOA_QUESTION_MEMORY_V25_2.stats() }));
  expect(Object.values(result.calls)).toEqual([0, 0, 0, 0, 0, 0]);
  if (page.topicBeforeReloadCalls) expect(Object.values(page.topicBeforeReloadCalls)).toEqual([0, 0, 0, 0, 0, 0]);
  expect(page.topicErrors).toEqual([]); expect(page.topicRequests).toEqual([]);
  await testInfo.attach('diversidad-consola-red-y-llamadas', { body: JSON.stringify({ ...result,
    errors: page.topicErrors, requests: page.topicRequests }, null, 2), contentType: 'application/json' });
});

test('diversidad omitida, false o undefined conserva v8 y no consulta la memoria', async ({ page }) => {
  const before = await page.evaluate(subject => NOA_SOURCE_BLUEPRINT.build({ subject, count: 8 }), biology);
  await seedRanking(page);
  const result = await page.evaluate(subject => {
    const memory = NOA_QUESTION_MEMORY_V25_2, recent = memory.recent, stats = memory.stats;
    let reads = 0;
    memory.recent = memory.stats = () => { reads++; throw new Error('No consultar memoria en el modo anterior'); };
    try {
      const blueprints = [NOA_SOURCE_BLUEPRINT.build({ subject, count: 8 }),
        NOA_SOURCE_BLUEPRINT.build({ subject, count: 8, diversifyTopics: false }),
        NOA_SOURCE_BLUEPRINT.build({ subject, count: 8, diversifyTopics: undefined })];
      return { reads, blueprints };
    } finally { memory.recent = recent; memory.stats = stats; }
  }, biology);
  expect(result.reads).toBe(0);
  for (const blueprint of result.blueprints) {
    expect(blueprint).toEqual(before); expect(blueprint).not.toHaveProperty('topicDiversity');
    expect(blueprint.slots.every(slot => !Object.hasOwn(slot, 'topicDiversity'))).toBe(true);
  }
});

test('diversidad rechaza valores no booleanos sin alterar el estado', async ({ page }) => {
  const before = await state(page);
  const failures = await page.evaluate(subject => [null, 1, 'true', {}, []].map(diversifyTopics => {
    try { NOA_SOURCE_BLUEPRINT.build({ subject, count: 5, diversifyTopics }); return null; }
    catch (error) { return error.message; }
  }), biology);
  expect(failures.every(message => typeof message === 'string' && message.length > 0)).toBe(true);
  expect(await state(page)).toEqual(before);
});

test('diversidad prioriza nunca vistos y registra un ejemplo antes y después de rotación', async ({ page }, testInfo) => {
  const available = await catalog(page);
  const previous = await page.evaluate(subject => NOA_SOURCE_BLUEPRINT.build({ subject, count: 8 }), biology);
  await seedRanking(page);
  const rotated = await build(page, { count: 8 });
  expect(codes(previous)).toEqual(available.map(item => item.code));
  expect(codes(rotated)).toEqual([...available.slice(3).map(item => item.code), available[1].code, available[2].code, available[0].code]);
  expect(rotated.topicDiversity).toMatchObject({ enabled: true, mode: 'memory_priority', memoryStatus: 'ready',
    policy: 'coverage_frequency_recency', candidateCount: 8, uniqueSelectedCodes: 8, reusedSlots: 0 });
  expect(rotated.slots[0].topicDiversity).toMatchObject({ selectedCode: available[3].code, priorFrequency: 0,
    lastSeenAt: null, reason: 'unseen' });
  await testInfo.attach('rotacion-antes-despues-con-historial-real', { body: JSON.stringify({
    subject: biology, previous, rotated, stats: await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.stats())
  }, null, 2), contentType: 'application/json' });
});

test('diversidad prefiere menor frecuencia y entre iguales recupera el tema más antiguo', async ({ page }) => {
  await limitCatalog(page, biology, 3); const available = await catalog(page);
  for (let index = 0; index < 3; index++) await expose(page, { index: 0, session: 'frequent-' + index, at: dates[index] });
  await expose(page, { index: 1, session: 'less-frequent-old', at: dates[0] });
  await expose(page, { index: 2, session: 'less-frequent-recent', at: dates[2] });
  const blueprint = await build(page, { count: 3 });
  expect(codes(blueprint)).toEqual([available[1].code, available[2].code, available[0].code]);
  expect(blueprint.slots[0].topicDiversity).toMatchObject({ priorFrequency: 1, lastSeenAt: dates[0], reason: 'least_frequent_then_oldest' });
  expect(blueprint.slots[2].topicDiversity.priorFrequency).toBe(3);
});

test('diversidad agrega todos los fingerprints de un código y conserva su última exposición real', async ({ page }) => {
  await limitCatalog(page, biology, 3); const available = await catalog(page);
  await expose(page, { index: 0, variant: 'first', session: 'aggregate-zero-old', at: dates[0] });
  await expose(page, { index: 0, variant: 'other', session: 'aggregate-zero-new', at: dates[2] });
  await expose(page, { index: 1, session: 'aggregate-one-old', at: dates[0] });
  await expose(page, { index: 1, session: 'aggregate-one-new', at: dates[1] });
  for (let index = 0; index < 3; index++) await expose(page, { index: 2, session: 'aggregate-two-' + index, at: dates[0] });
  const blueprint = await build(page, { count: 3 });
  expect(codes(blueprint)).toEqual([available[1].code, available[0].code, available[2].code]);
  expect(blueprint.slots[1].topicDiversity).toMatchObject({ priorFrequency: 2, lastSeenAt: dates[2] });
});

test('diversidad conserva las nueve materias y distribuye cinco códigos distintos en cada una', async ({ page }, testInfo) => {
  const distribution = await page.evaluate(types => NOA_EXCOBA_V4.subjects.map(subject => {
    const blueprint = NOA_SOURCE_BLUEPRINT.build({ subject: subject.value, count: 5, diversifyTopics: true, supportedInteractionTypes: types });
    return { subject: subject.value, available: NOA_EXCOBA_V4.itemsFor(subject.value).map(item => item.code), blueprint };
  }), supported);
  expect(distribution).toHaveLength(9);
  expect(distribution.reduce((sum, item) => sum + item.blueprint.slots.length, 0)).toBe(45);
  for (const item of distribution) {
    expect(new Set(codes(item.blueprint)).size).toBe(5);
    expect(codes(item.blueprint).every(code => item.available.includes(code))).toBe(true);
    expect(item.blueprint.topicDiversity.reusedSlots).toBe(0);
  }
  await testInfo.attach('distribucion-opcional-nueve-materias-45-slots', { body: JSON.stringify(distribution, null, 2), contentType: 'application/json' });
});

test('diversidad reutiliza de manera controlada si hay menos temas que slots', async ({ page }) => {
  await limitCatalog(page, biology, 2); const available = await catalog(page);
  await expose(page, { index: 1, session: 'one-seen' });
  const blueprint = await build(page, { count: 7 }), selected = codes(blueprint);
  const counts = available.map(item => selected.filter(code => code === item.code).length);
  expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  expect(blueprint.topicDiversity).toMatchObject({ candidateCount: 2, uniqueSelectedCodes: 2, reusedSlots: 5 });
  expect(blueprint.slots.slice(2).every(slot => slot.topicDiversity.reason === 'controlled_reuse')).toBe(true);
});

test('diversidad mantiene las materias independientes aunque el historial contenga un código ajeno', async ({ page }) => {
  const baseline = await build(page, { count: 3 });
  await expose(page, { subject: chemistry, index: 0, session: 'chemistry-only' });
  await page.evaluate(async ({ code, subject }) => {
    const result = await NOA_QUESTION_MEMORY_V25_2.recordExam([{ id: 'other-subject-same-code', subject,
      syllabusCode: code, interactionType: 'single_select', text: 'Fixture de materia ajena.', options: ['A','B'], correct: 0 }], 'other-scope');
    if (!result.ok) throw new Error(result.error);
  }, { code: codes(baseline)[0], subject: chemistry });
  expect(await build(page, { count: 3 })).toEqual(baseline);
});

test('diversidad reproduce el plan completo sin utilizar Math.random', async ({ page }) => {
  await seedRanking(page);
  const result = await page.evaluate(subject => {
    const previous = Math.random;
    Math.random = () => { throw new Error('No usar azar para diversidad'); };
    try { return [NOA_SOURCE_BLUEPRINT.build({ subject, count: 8, diversifyTopics: true }),
      NOA_SOURCE_BLUEPRINT.build({ subject, count: 8, diversifyTopics: true })]; }
    finally { Math.random = previous; }
  }, biology);
  expect(result[0]).toEqual(result[1]);
});

test('diversidad actualiza prioridades después de un nuevo examen registrado en memoria', async ({ page }) => {
  const before = await build(page, { count: 1 }), available = await catalog(page);
  expect(codes(before)).toEqual([available[0].code]);
  await expose(page, { index: 0, session: 'new-completed-exposure' });
  const after = await build(page, { count: 1 });
  expect(codes(after)).toEqual([available[1].code]);
});

test('diversidad sin historial aplica una cobertura válida sin escribir memoria', async ({ page }) => {
  const before = await state(page), blueprint = await build(page, { count: 8 });
  expect(blueprint.topicDiversity.memoryStatus).toBe('empty');
  expect(new Set(codes(blueprint)).size).toBe(8);
  expect(blueprint.slots.every(slot => slot.topicDiversity.priorFrequency === 0 && slot.topicDiversity.lastSeenAt === null)).toBe(true);
  expect(await state(page)).toEqual(before);
});

test('diversidad ignora memoria corrupta sin repararla ni bloquear el Blueprint', async ({ page }) => {
  const invalid = '{invalid-topic-memory';
  await page.evaluate(value => localStorage.setItem(NOA_QUESTION_MEMORY_V25_2.storageKey, value), invalid);
  const before = await state(page), blueprint = await build(page, { count: 8 });
  expect(blueprint.topicDiversity).toMatchObject({ enabled: true, mode: 'coverage_fallback', memoryStatus: 'invalid' });
  expect(new Set(codes(blueprint)).size).toBe(8);
  expect(await state(page)).toEqual(before);
  expect(await page.evaluate(() => localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey))).toBe(invalid);
});

test('diversidad usa fallback seguro con memoria ausente o respuesta inválida', async ({ page }) => {
  const result = await page.evaluate(subject => {
    const native = window.NOA_QUESTION_MEMORY_V25_2;
    const plans = [];
    try {
      window.NOA_QUESTION_MEMORY_V25_2 = undefined;
      plans.push(NOA_SOURCE_BLUEPRINT.build({ subject, count: 5, diversifyTopics: true }));
      window.NOA_QUESTION_MEMORY_V25_2 = { stats: () => ({ ok: true, uniqueQuestions: 1 }), recent: () => [null] };
      plans.push(NOA_SOURCE_BLUEPRINT.build({ subject, count: 5, diversifyTopics: true }));
      return plans;
    } finally { window.NOA_QUESTION_MEMORY_V25_2 = native; }
  }, biology);
  expect(result[0].topicDiversity.memoryStatus).toBe('unavailable');
  expect(result[1].topicDiversity.memoryStatus).toBe('invalid');
  for (const plan of result) { expect(plan.slots).toHaveLength(5); expect(new Set(codes(plan)).size).toBe(5); }
});

test('diversidad consulta también exposiciones antiguas fuera del límite predeterminado de veinte registros', async ({ page }) => {
  await expose(page, { index: 1, session: 'older-topic-outside-twenty', at: dates[0] });
  await expose(page, { index: 0, variant: 'many-entries', session: 'newer-twenty-two', at: dates[2], questionCount: 22 });
  expect(await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.stats().uniqueQuestions)).toBe(23);
  const available = await catalog(page), blueprint = await build(page, { count: 1 });
  expect(codes(blueprint)).toEqual([available[2].code]);
});

test('diversidad preserva perfiles, Calibrator, dificultad y formato en los cuatro entrenamientos', async ({ page }) => {
  await seedRanking(page); await courses(page);
  const results = await page.evaluate(types => {
    const results = [];
    for (const profile of ['official','extended','course','extreme']) {
      db.settings.noaTrainingProfile = profile; document.getElementById('excobaTrainingProfile').value = profile;
      for (const sample of [0, 5]) {
        db.attempts = sample ? [{ answers: Array.from({ length: sample }, () => ({ blueprint: { difficulty: 3 }, scoreFraction: 1, ok: true })) }] : [];
        results.push({ previous: NOA_SOURCE_BLUEPRINT.build({ subject: 'EXCOBA Medicina · Biología', count: 8, supportedInteractionTypes: types }),
          diverse: NOA_SOURCE_BLUEPRINT.build({ subject: 'EXCOBA Medicina · Biología', count: 8, supportedInteractionTypes: types, diversifyTopics: true }) });
      }
    }
    return results;
  }, supported);
  for (const { previous, diverse } of results) {
    for (const key of ['subject','count','profile','calibration','requestedSourceCounts','interactionPolicy']) expect(diverse[key]).toEqual(previous[key]);
    for (let index = 0; index < previous.slots.length; index++) {
      for (const key of ['slotId','index','subject','requestedSourceType','sourceType','fallbackFrom','fallbackReason',
        'calibratorDifficulty','difficulty','interactionType','responseFamily','partialCreditEligible','scoringMode','realismRules','locked']) {
        expect(diverse.slots[index][key], `${diverse.profile.key}/${index}/${key}`).toEqual(previous.slots[index][key]);
      }
    }
  }
});

test('diversidad conserva cursos reales y permite rotar su fallback oficial sin inventar material', async ({ page }) => {
  await profile(page, 'course'); await seedRanking(page); await courses(page);
  const withSources = await page.evaluate(subject => ({ previous: NOA_SOURCE_BLUEPRINT.build({ subject, count: 8 }),
    diverse: NOA_SOURCE_BLUEPRINT.build({ subject, count: 8, diversifyTopics: true }) }), biology);
  const actualCourse = withSources.diverse.slots.filter(slot => slot.sourceType === 'course');
  expect(actualCourse.length).toBeGreaterThan(0);
  for (const slot of actualCourse) {
    const previous = withSources.previous.slots[slot.index];
    expect(slot.source).toEqual(previous.source); expect(slot.syllabusCodes).toEqual(previous.syllabusCodes);
    expect(slot.topicDiversity).toMatchObject({ mode: 'course_preserved', reason: 'course_mapping_unavailable' });
  }
  await page.evaluate(() => { db.courseSources = []; });
  const fallback = await build(page, { count: 8 });
  const requestedCourse = fallback.slots.filter(slot => slot.requestedSourceType === 'course');
  expect(requestedCourse.length).toBeGreaterThan(0);
  for (const slot of requestedCourse) {
    expect(slot).toMatchObject({ sourceType: 'official', fallbackFrom: 'course', fallbackReason: 'no_ready_course_source' });
    expect(slot.source.kind).toBe('official'); expect(slot.source).not.toHaveProperty('courseSourceId');
    expect(slot.syllabusCodes[0]).toBe(slot.topicDiversity.selectedCode);
  }
});

test('diversidad sin códigos de curso conserva la resolución original y su objetivo', async ({ page }) => {
  await profile(page, 'course'); await courses(page, { coded: false });
  const result = await page.evaluate(subject => ({ previous: NOA_SOURCE_BLUEPRINT.build({ subject, count: 8 }),
    diverse: NOA_SOURCE_BLUEPRINT.build({ subject, count: 8, diversifyTopics: true }) }), biology);
  const courseSlots = result.diverse.slots.filter(slot => slot.sourceType === 'course');
  expect(courseSlots.length).toBeGreaterThan(0);
  for (const slot of courseSlots) {
    expect(slot.syllabusCodes).toEqual([]); expect(slot.source.officialAnchor).toBeNull();
    expect(slot.source).toEqual(result.previous.slots[slot.index].source);
    expect(slot.source.objective).toEqual(result.previous.slots[slot.index].source.objective);
    expect(slot.topicDiversity.reason).toBe('course_mapping_unavailable');
  }
});

test('diversidad reserva el ancla de un curso fijo antes de distribuir fuentes oficiales y extendidas', async ({ page }) => {
  await profile(page, 'course'); await courses(page);
  const anchor = await page.evaluate(() => {
    db.courseSources = db.courseSources.slice(0,1);
    return db.courseSources[0].analysis.syllabus_links[0].code;
  });
  const blueprint = await build(page, { count: 8 });
  const fixed = blueprint.slots.filter(slot => slot.sourceType === 'course');
  const movable = blueprint.slots.filter(slot => slot.sourceType !== 'course');
  expect(fixed.length).toBeGreaterThan(0); expect(movable.length).toBeGreaterThan(0);
  expect(fixed.every(slot => slot.syllabusCodes[0] === anchor)).toBe(true);
  expect(movable.every(slot => !slot.syllabusCodes.includes(anchor))).toBe(true);
  expect(new Set(movable.map(slot => slot.syllabusCodes[0])).size).toBe(movable.length);
});

test('diversidad repone con alternativa libre y conserva todos los campos bloqueados', async ({ page }) => {
  await seedRanking(page);
  const result = await page.evaluate(({ subject, types }) => {
    const plan = NOA_SOURCE_BLUEPRINT.build({ subject, count: 3, diversifyTopics: true, supportedInteractionTypes: types });
    const slot = plan.slots[0];
    return { plan, slot, replacements: [NOA_SOURCE_BLUEPRINT.replaceSlot(structuredClone(slot), 1),
      NOA_SOURCE_BLUEPRINT.replaceSlot(structuredClone(slot), 2)], repeated: NOA_SOURCE_BLUEPRINT.replaceSlot(structuredClone(slot), 1) };
  }, { subject: biology, types: supported });
  expect(result.repeated).toEqual(result.replacements[0]);
  for (const replacement of result.replacements) {
    for (const key of ['slotId','subject','index','difficulty','calibratorDifficulty','interactionType','requestedSourceType',
      'locked','responseFamily','partialCreditEligible','realismRules','sourceType']) expect(replacement[key], key).toEqual(result.slot[key]);
    expect(result.plan.slots.map(slot => slot.syllabusCodes[0])).not.toContain(replacement.syllabusCodes[0]);
    expect(replacement.topicDiversity).toMatchObject({ reason: 'replacement_alternative', originalCodes: result.slot.syllabusCodes, selectedCodes: replacement.syllabusCodes, codeChanged: true,
      selectedCode: replacement.syllabusCodes[0] });
  }
});

test('diversidad no empeora cobertura al reponer cuando todos los temas ya están reservados', async ({ page }) => {
  await limitCatalog(page, biology, 3);
  const result = await page.evaluate(subject => {
    const plan = NOA_SOURCE_BLUEPRINT.build({ subject, count: 3, diversifyTopics: true });
    return { plan, replacement: NOA_SOURCE_BLUEPRINT.replaceSlot(structuredClone(plan.slots[0]), 1) };
  }, biology);
  expect(result.replacement.syllabusCodes).toEqual(result.plan.slots[0].syllabusCodes);
  expect(result.replacement.topicDiversity).toMatchObject({ reason: 'replacement_preserved', codeChanged: false,
    originalCodes: result.plan.slots[0].syllabusCodes, selectedCodes: result.replacement.syllabusCodes });
});

test('diversidad distribuye reservas disjuntas al reponer varios slots originales clonados', async ({ page }) => {
  const before = await state(page);
  const result = await page.evaluate(({ subject, types }) => {
    const plan = NOA_SOURCE_BLUEPRINT.build({ subject, count: 5, diversifyTopics: true, supportedInteractionTypes: types });
    const clone = value => JSON.parse(JSON.stringify(value));
    const originals = clone(plan.slots);
    const first = originals.map(slot => NOA_SOURCE_BLUEPRINT.replaceSlot(clone(slot), 1));
    const second = originals.map(slot => NOA_SOURCE_BLUEPRINT.replaceSlot(clone(slot), 2));
    const reversed = [...originals].reverse().map(slot => NOA_SOURCE_BLUEPRINT.replaceSlot(clone(slot), 1)).reverse();
    return { originals, first, second, reversed, after: plan.slots, available: NOA_EXCOBA_V4.itemsFor(subject).map(item => item.code) };
  }, { subject: biology, types: supported });
  expect(result.available).toHaveLength(8);
  expect(result.after).toEqual(result.originals);
  expect(result.reversed).toEqual(result.first);
  const originalCodes = result.originals.map(slot => slot.syllabusCodes[0]);
  for (const replacements of [result.first, result.second]) {
    const selected = replacements.map(slot => slot.syllabusCodes[0]);
    expect(new Set(selected).size).toBe(5);
    expect(selected.filter((code, index) => code !== originalCodes[index])).toHaveLength(3);
    expect(selected.filter((code, index) => code === originalCodes[index])).toHaveLength(2);
    for (let index = 0; index < replacements.length; index++) {
      const original = result.originals[index], replacement = replacements[index];
      expect(result.available).toContain(selected[index]);
      expect(originalCodes.filter((_, sibling) => sibling !== index)).not.toContain(selected[index]);
      expect(replacement.topicDiversity.codeChanged).toBe(selected[index] !== originalCodes[index]);
      for (const key of ['slotId','subject','index','difficulty','calibratorDifficulty','interactionType','requestedSourceType',
        'locked','responseFamily','partialCreditEligible','realismRules','sourceType']) expect(replacement[key], key).toEqual(original[key]);
    }
  }
  expect(await state(page)).toEqual(before);
});

test('diversidad usa su reserva válida o rechaza claramente si el código original desapareció del catálogo', async ({ page }) => {
  const before = await state(page);
  const result = await page.evaluate(({ subject, types }) => {
    const plan = NOA_SOURCE_BLUEPRINT.build({ subject, count: 3, diversifyTopics: true, supportedInteractionTypes: types });
    const original = JSON.parse(JSON.stringify(plan.slots[0]));
    const items = NOA_EXCOBA_V4.itemsFor(subject).map(item => ({ ...item }));
    db.masterSyllabus.items = db.masterSyllabus.items.filter(item => item.subject !== subject).concat(items.slice(1, 4));
    const valid = NOA_SOURCE_BLUEPRINT.replaceSlot(JSON.parse(JSON.stringify(original)), 1);
    const available = NOA_EXCOBA_V4.itemsFor(subject).map(item => item.code);
    db.masterSyllabus.items = db.masterSyllabus.items.filter(item => item.subject !== subject).concat(items.slice(1, 3));
    let invalid;
    try { invalid = { replacement: NOA_SOURCE_BLUEPRINT.replaceSlot(JSON.parse(JSON.stringify(original)), 1) }; }
    catch (error) { invalid = { error: error.message }; }
    return { plan, original, valid, available, invalid };
  }, { subject: biology, types: supported });
  expect(result.available).not.toContain(result.original.syllabusCodes[0]);
  expect(result.valid.syllabusCodes).toEqual([result.available[2]]);
  expect(result.plan.slots.slice(1).flatMap(slot => slot.syllabusCodes)).not.toContain(result.valid.syllabusCodes[0]);
  expect(result.valid.topicDiversity).toMatchObject({ reason: 'replacement_alternative', codeChanged: true,
    originalCodes: result.original.syllabusCodes, selectedCodes: result.valid.syllabusCodes });
  for (const key of ['slotId','subject','index','difficulty','calibratorDifficulty','interactionType','requestedSourceType',
    'locked','responseFamily','partialCreditEligible','realismRules','sourceType']) expect(result.valid[key], key).toEqual(result.original[key]);
  expect(result.invalid).not.toHaveProperty('replacement');
  expect(result.invalid.error).toMatch(/tem[aá]|c[oó]dig|alternativ|reserv|cat[aá]log|punto/i);
  const after = await state(page);
  delete before.db.masterSyllabus; delete after.db.masterSyllabus;
  expect(after).toEqual(before);
});

test('diversidad explica la reposición de cursos con códigos múltiples o sin código sin ocultar cambios', async ({ page }) => {
  await profile(page, 'course'); await courses(page);
  const multi = await page.evaluate(subject => {
    const items = NOA_EXCOBA_V4.itemsFor(subject);
    db.courseSources[0].analysis.syllabus_links = [{ code: items[0].code }, { code: items[1].code }];
    db.courseSources[1].analysis.syllabus_links = [{ code: items[0].code }, { code: items[2].code }];
    const plan = NOA_SOURCE_BLUEPRINT.build({ subject, count: 8, diversifyTopics: true });
    return plan.slots.filter(slot => slot.sourceType === 'course').map(slot => ({ slot,
      replacement: NOA_SOURCE_BLUEPRINT.replaceSlot(JSON.parse(JSON.stringify(slot)), 1) }));
  }, biology);
  await courses(page, { coded: false });
  const uncoded = await page.evaluate(subject => {
    const plan = NOA_SOURCE_BLUEPRINT.build({ subject, count: 8, diversifyTopics: true });
    return plan.slots.filter(slot => slot.sourceType === 'course').map(slot => ({ slot,
      replacement: NOA_SOURCE_BLUEPRINT.replaceSlot(JSON.parse(JSON.stringify(slot)), 1) }));
  }, biology);
  expect(multi.length).toBeGreaterThan(0); expect(uncoded.length).toBeGreaterThan(0);
  expect(multi.every(value => value.slot.syllabusCodes.length === 2)).toBe(true);
  expect(uncoded.every(value => value.slot.syllabusCodes.length === 0)).toBe(true);
  for (const { slot, replacement } of [...multi, ...uncoded]) {
    expect(replacement.topicDiversity.originalCodes).toEqual(slot.syllabusCodes);
    expect(replacement.topicDiversity.selectedCodes).toEqual(replacement.syllabusCodes);
    const changed = JSON.stringify([...new Set(slot.syllabusCodes)].sort()) !==
      JSON.stringify([...new Set(replacement.syllabusCodes)].sort());
    expect(replacement.topicDiversity.codeChanged).toBe(changed);
    for (const key of ['slotId','subject','index','difficulty','calibratorDifficulty','interactionType','requestedSourceType',
      'locked','responseFamily','partialCreditEligible','realismRules','sourceType']) expect(replacement[key], key).toEqual(slot[key]);
  }
});

test('diversidad expone trazabilidad compacta fuera de la fuente y las reglas enviadas a IA', async ({ page }) => {
  await seedRanking(page); const plan = await build(page, { count: 8 });
  for (const slot of plan.slots) {
    expect(slot.topicDiversity).toMatchObject({ enabled: true, mode: 'memory_priority', memoryStatus: 'ready', selectedCode: slot.syllabusCodes[0] });
    expect(Number.isSafeInteger(slot.topicDiversity.priorFrequency)).toBe(true);
    expect(slot.topicDiversity.priorFrequency).toBeGreaterThanOrEqual(0);
    expect(typeof slot.topicDiversity.reason).toBe('string');
    expect(Number.isSafeInteger(slot.topicDiversity.withinBlueprintUses)).toBe(true);
    expect(slot.topicDiversity.blueprintUsage).toEqual(Object.fromEntries(codes(plan).map(code => [code, 1])));
    for (const value of [slot.source, slot.realismRules]) {
      const raw = JSON.stringify(value);
      for (const marker of ['topicDiversity','priorFrequency','lastSeenAt','blueprintUsage', ...dates]) expect(raw).not.toContain(marker);
    }
    expect(slot.topicDiversity).not.toHaveProperty('sessionId'); expect(slot.topicDiversity).not.toHaveProperty('fingerprint');
  }
});

test('API del plan45 mantiene la diversidad opcional y v24 conserva las cantidades 5/10', async ({ page }) => {
  await seedRanking(page);
  const result = await page.evaluate(() => {
    const native = NOA_SOURCE_BLUEPRINT.build, options = [];
    NOA_SOURCE_BLUEPRINT.build = value => { options.push(structuredClone(value)); return native(value); };
    try { return { plan: NOA_EXAM_PLAN_V25.build(), options }; }
    finally { NOA_SOURCE_BLUEPRINT.build = native; }
  });
  expect(result.plan.valid).toBe(true); expect(result.plan.total).toBe(45);
  expect(result.plan.groups.map(group => group.requiredCount)).toEqual([10, 20, 15]);
  expect(result.options).toHaveLength(9);
  expect(result.options.every(value => !Object.hasOwn(value, 'diversifyTopics'))).toBe(true);
  expect(result.plan.slots.every(slot => !Object.hasOwn(slot.blueprintSlot, 'topicDiversity'))).toBe(true);
  expect(await page.locator('#noaGeneratorCount option').evaluateAll(options => options.map(option => option.value))).toEqual(['5','10']);
});

test('diversidad no modifica examen activo, revisión, borradores, intentos o almacenamiento', async ({ page }) => {
  await seedRanking(page);
  await page.evaluate(() => { NOA_MIXED_EXAM.start = __topicFixture.nativeStart; });
  await activeSession(page); await waitDraftCheckpoint(page);
  await guardPlanning(page);
  const before = await state(page);
  const plan = await build(page, { count: 8 });
  await page.evaluate(slot => NOA_SOURCE_BLUEPRINT.replaceSlot(slot, 1), plan.slots[0]);
  expect(await state(page)).toEqual(before);
});

test('diversidad no filtra el historial en los ocho prompts públicos de Generator y Judge', async ({ page }, testInfo) => {
  await limitCatalog(page, biology, 1);
  await expose(page, { session: 'HISTORY-PRIVATE-SESSION-ID', at: dates[0] });
  const result = await page.evaluate(async ({ subject, templates, types }) => {
    const fixture = __topicFixture, forbidden = window.callAI;
    const calls = [];
    window.callAI = async (messages, options) => {
      fixture.captures.push({ messages: structuredClone(messages), options: structuredClone(options) });
      throw new Error('TOPIC-DIVERSITY-CAPTURE');
    };
    try {
      for (const type of types) {
        const slot = NOA_SOURCE_BLUEPRINT.build({ subject, count: 1, diversifyTopics: true, supportedInteractionTypes: [type] }).slots[0];
        const question = { ...structuredClone(templates.find(item => item.interactionType === type)),
          blueprintSlot: slot, subject, sourceType: slot.sourceType, syllabusCode: slot.syllabusCodes[0] };
        const generate = { single_select: NOA_BLUEPRINT_GENERATOR.generateSingleSelect, drag_classify: NOA_DRAG_CLASSIFY.generate,
          inline_select: NOA_INLINE_SELECT.generate, drag_order: NOA_DRAG_ORDER.generate }[type];
        const judge = { single_select: NOA_BLUEPRINT_GENERATOR.judgeItem, drag_classify: NOA_DRAG_CLASSIFY.judge,
          inline_select: NOA_INLINE_SELECT.judge, drag_order: NOA_DRAG_ORDER.judge }[type];
        for (const [kind, action] of [['generator', () => generate(slot)], ['judge', () => judge(question, slot)]]) {
          try { await action(); throw new Error('La fixture debe detenerse antes de generar contenido'); }
          catch (error) { if (error.message !== 'TOPIC-DIVERSITY-CAPTURE') throw error; }
          calls.push({ type, kind });
        }
      }
      return { calls, prompts: structuredClone(fixture.captures) };
    } finally { window.callAI = forbidden; }
  }, { subject: biology, templates: questions, types: supported });
  expect(result.calls).toHaveLength(8); expect(result.prompts).toHaveLength(8);
  for (const call of result.prompts) {
    const raw = JSON.stringify(call.messages);
    for (const marker of ['topicDiversity','priorFrequency','lastSeenAt','blueprintUsage','HISTORY-PRIVATE-SESSION-ID',dates[0]]) expect(raw).not.toContain(marker);
  }
  await testInfo.attach('ocho-prompts-capturados-sin-historial', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});

test.describe('diversidad con Service Worker real', () => {
  test.use({ serviceWorkers: 'allow' });
  test('diversidad y memoria permanecen disponibles después de recargar offline', async ({ page, context }) => {
    await seedRanking(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const beforeMemory = await page.evaluate(() => localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey));
    page.topicBeforeReloadCalls = await page.evaluate(() => structuredClone(__topicFixture.calls));
    await context.setOffline(true); await page.reload();
    await page.waitForFunction(() => !!window.NOA_SOURCE_BLUEPRINT && !!window.NOA_QUESTION_MEMORY_V25_2);
    await guardPlanning(page);
    const plan = await build(page, { count: 5 });
    expect(plan.slots).toHaveLength(5); expect(plan.topicDiversity.memoryStatus).toBe('ready');
    expect(new Set(codes(plan)).size).toBe(5);
    expect(await page.evaluate(() => localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey))).toBe(beforeMemory);
    const cache = await page.evaluate(async () => {
      const scope = (await navigator.serviceWorker.getRegistration()).scope;
      const names = (await caches.keys()).filter(name => name.startsWith(`noa-mobile:${encodeURIComponent(scope)}:`));
      return { names, blueprint: !!await (await caches.open(names[0])).match(new URL('excoba_patch_v8_blueprint.js', scope).href) };
    });
    expect(cache.names).toHaveLength(1); expect(cache.names[0]).toMatch(/:v6-75$/); expect(cache.blueprint).toBe(true);
  });
});
