const { test, expect } = require('@playwright/test');
const { openGenerator, activeSession } = require('./generator-fixtures.cjs');
const { start, answer, navigate } = require('./fixtures.cjs');
const { waitDraftCheckpoint } = require('./exam-45-ui-fixtures.cjs');
const { biology, chemistry, at, memoryQuestions, visualVariants, memoryState, storedMemory } = require('./question-memory-fixtures.cjs');

test.beforeEach(async ({ page }) => {
  page.memoryErrors = [];
  page.memoryExternalRequests = [];
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && (url.origin !== 'http://127.0.0.1:8022' || !['GET', 'HEAD'].includes(request.method()))) {
      page.memoryExternalRequests.push({ url: url.href, method: request.method() });
      return route.abort();
    }
    return route.continue();
  });
  page.on('pageerror', error => page.memoryErrors.push(error.message));
  await openGenerator(page);
  await page.waitForFunction(() => !!window.NOA_QUESTION_MEMORY_V25_2);
  await page.clock.setFixedTime(new Date(at[0]));
  await page.evaluate(() => {
    window.__memoryAiCalls = 0;
    window.callAI = async () => { __memoryAiCalls++; throw new Error('IA real prohibida en las pruebas de memoria.'); };
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const evidence = await page.evaluate(() => ({
    stats: NOA_QUESTION_MEMORY_V25_2.stats(),
    storageKey: NOA_QUESTION_MEMORY_V25_2.storageKey,
    aiCalls: window.__memoryAiCalls ?? 0
  }));
  expect(evidence.aiCalls).toBe(0);
  expect(page.memoryExternalRequests).toEqual([]);
  expect(page.memoryErrors).toEqual([]);
  await testInfo.attach('memoria-local-red-y-consola', { body: JSON.stringify({ ...evidence,
    externalRequests: page.memoryExternalRequests, errors: page.memoryErrors }, null, 2), contentType: 'application/json' });
});

test('memoria registra cuatro formatos con metadatos compactos y reconoce las preguntas nuevas', async ({ page }, testInfo) => {
  const result = await page.evaluate(async ({ questions, at, subject }) => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    const before = await Promise.all(questions.map(question => memory.contains(question)));
    const recorded = await memory.recordExam(questions, 'new-session', { seenAt: at });
    return { before, recorded, after: await Promise.all(questions.map(question => memory.contains(question))),
      stats: memory.stats(subject), entries: memory.recent(subject, 10) };
  }, { questions: memoryQuestions, at: at[0], subject: biology });
  expect(result.before).toEqual([false, false, false, false]);
  expect(result.recorded).toMatchObject({ ok: true, added: 4, updated: 0 });
  expect(result.after).toEqual([true, true, true, true]);
  expect(result.stats).toMatchObject({ ok: true, uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
  expect(result.entries).toHaveLength(4);
  expect(new Set(result.entries.map(entry => entry.interactionType)).size).toBe(4);
  for (const entry of result.entries) {
    expect(entry).toMatchObject({ subject: biology, syllabusCode: '3.2.1', difficulty: 3, sourceType: 'official',
      firstSeenAt: at[0], lastSeenAt: at[0], timesSeen: 1, sessionId: 'new-session' });
    expect(entry.fingerprint).toMatch(/^qm1:sha256:[0-9a-f]{64}$/);
  }
  await testInfo.attach('registro-cuatro-formatos', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});

test('memoria conserva huellas al reordenar opciones, categorías, espacios e items visuales', async ({ page }) => {
  const result = await page.evaluate(async ({ questions, variants }) => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    await memory.recordExam(questions, 'visual-original');
    return { original: await Promise.all(questions.map(question => memory.fingerprint(question))),
      variants: await Promise.all(variants.map(question => memory.fingerprint(question))),
      contains: await Promise.all(variants.map(question => memory.contains(question))) };
  }, { questions: memoryQuestions, variants: visualVariants() });
  expect(result.variants).toEqual(result.original);
  expect(result.contains).toEqual([true, true, true, true]);
  expect(new Set(result.original).size).toBe(4);
});

test('memoria normaliza signos interrogativos y espacios sin depender del ID ni de metadatos', async ({ page }) => {
  const hashes = await page.evaluate(async question => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    const variants = [question,
      { ...question, text: question.text.replace(/[¿?]/g, '') },
      { ...question, id: 'another-id', difficulty: 5, sourceType: 'course', syllabusCode: 'another-code', subject: 'Otra materia', judge: { qualityScore: 1 } },
      { ...question, id: question.id, text: '¿Selecciona el resultado de sumar 2 + 3?' }
    ];
    return Promise.all(variants.map(value => memory.fingerprint(value)));
  }, memoryQuestions[0]);
  expect(hashes[0]).toMatch(/^qm1:sha256:[0-9a-f]{64}$/);
  expect(hashes[1]).toBe(hashes[0]);
  expect(hashes[2]).toBe(hashes[0]);
  expect(hashes[3]).not.toBe(hashes[0]);
});

test('memoria distingue instrucciones relevantes y cambios de clave en los cuatro formatos', async ({ page }) => {
  const result = await page.evaluate(async questions => {
    const modified = structuredClone(questions);
    modified[0].correct = 1;
    modified[1].elements[0].correctTargetId = 'odd'; modified[1].correctResponse.two = 'odd';
    modified[2].blanks[0].correct = 1;
    modified[3].correctOrder.reverse();
    const hashes = await Promise.all(questions.map(question => NOA_QUESTION_MEMORY_V25_2.fingerprint(question)));
    return { hashes, changed: await Promise.all(modified.map(question => NOA_QUESTION_MEMORY_V25_2.fingerprint(question))),
      instruction: await NOA_QUESTION_MEMORY_V25_2.fingerprint({ ...questions[0], instruction: 'Selecciona la opción incorrecta.' }) };
  }, memoryQuestions);
  for (let index = 0; index < 4; index++) { expect(result.changed[index]).not.toBeNull(); expect(result.changed[index]).not.toBe(result.hashes[index]); }
  expect(result.instruction).not.toBe(result.hashes[0]);
});

test('memoria conserva símbolos científicos, signos, cargas, exponentes y mayúsculas significativas', async ({ page }, testInfo) => {
  const pairs = [
    ['ΔH < 0', 'ΔG < 0'], ['ΔH < 0', 'ΔH > 0'], ['H+', 'H−'], ['H+', 'H'],
    ['CO₂', 'CO'], ['x²', 'x2'], ['x²', 'x³'], ['α = 2', 'β = 2'],
    ['1.5 mol', '15 mol'], ['3:1', '31'], ['n!', 'n'], ['CO', 'Co'],
    ['P = 2', 'p = 2'], ['10 M', '10 m'], ['x - 1 = 0', 'x + 1 = 0'],
    ['Aa', 'aa'], ['Δ = 2', 'δ = 2'], ['α', 'a'], ['1,5 mol', '15 mol'], ['P', 'p']
  ];
  const results = await page.evaluate(async ({ pairs, question }) => Promise.all(pairs.map(async ([left, right]) => ({
    left, right,
    a: await NOA_QUESTION_MEMORY_V25_2.fingerprint({ ...question, text: 'Interpreta la expresión científica: ' + left }),
    b: await NOA_QUESTION_MEMORY_V25_2.fingerprint({ ...question, text: 'Interpreta la expresión científica: ' + right })
  }))), { pairs, question: memoryQuestions[0] });
  for (const result of results) { expect(result.a, result.left).not.toBeNull(); expect(result.b, result.right).not.toBeNull(); expect(result.a, `${result.left} / ${result.right}`).not.toBe(result.b); }
  const caseSensitiveOptions = await page.evaluate(async question => NOA_QUESTION_MEMORY_V25_2.fingerprint({ ...question, options: ['P', 'p'], correct: 0 }), memoryQuestions[0]);
  expect(caseSensitiveOptions).not.toBeNull();
  await testInfo.attach('contraejemplos-cientificos-de-huellas', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
});

test('memoria valida estructuras y rechaza un lote inválido de forma atómica', async ({ page }) => {
  await page.evaluate(async question => NOA_QUESTION_MEMORY_V25_2.recordExam([question], 'initial-valid'), memoryQuestions[0]);
  const before = await storedMemory(page);
  const output = await page.evaluate(async questions => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    const malformed = [null, {}, { ...questions[0], interactionType: 'numeric_input' },
      { ...questions[0], options: [] }, { ...questions[1], targets: [] },
      { ...questions[2], blanks: [] }, { ...questions[3], correctOrder: ['missing'] }];
    const fingerprints = await Promise.all(malformed.map(question => memory.fingerprint(question)));
    const invalid = await memory.recordExam([questions[1], malformed[3]], 'must-not-partially-commit');
    const empty = await memory.recordExam([], 'empty');
    const sparse = await memory.recordExam(Array(1), 'sparse');
    return { fingerprints, invalid, empty, sparse };
  }, memoryQuestions);
  expect(output.fingerprints).toEqual(Array(7).fill(null));
  expect(output.invalid.ok).toBe(false);
  expect(output.empty.ok).toBe(false);
  expect(output.sparse.ok).toBe(false);
  expect(await storedMemory(page)).toBe(before);
});

test('memoria es idempotente incluso al repetir A después de B y al reordenar el mismo lote', async ({ page }) => {
  const result = await page.evaluate(async ({ questions, times }) => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    const a = await memory.recordExam([...questions, questions[0]], 'session-A', { seenAt: times[0] });
    const b = await memory.recordExam(questions, 'session-B', { seenAt: times[1] });
    const before = localStorage.getItem(memory.storageKey);
    const repeated = await memory.recordExam([...questions].reverse(), 'session-A', { seenAt: times[2] });
    return { a, b, repeated, before, after: localStorage.getItem(memory.storageKey), stats: memory.stats(), entries: memory.recent(questions[0].subject) };
  }, { questions: memoryQuestions, times: at });
  expect(result.a).toMatchObject({ ok: true, added: 4 });
  expect(result.b).toMatchObject({ ok: true, added: 0, updated: 4 });
  expect(result.repeated).toMatchObject({ ok: true, added: 0, updated: 0, unchanged: 4 });
  expect(result.after).toBe(result.before);
  expect(result.stats).toMatchObject({ uniqueQuestions: 4, totalSeen: 8, sessions: 2 });
  for (const entry of result.entries) expect(entry).toMatchObject({ timesSeen: 2, firstSeenAt: at[0], lastSeenAt: at[1], sessionId: 'session-B' });
});

test('memoria rechaza reutilizar una sesión con contenido diferente sin sobrescribirla', async ({ page }) => {
  await page.evaluate(async questions => NOA_QUESTION_MEMORY_V25_2.recordExam(questions, 'fixed-session'), memoryQuestions);
  const before = await storedMemory(page);
  const result = await page.evaluate(async questions => NOA_QUESTION_MEMORY_V25_2.recordExam(questions.slice(0, 3), 'fixed-session'), memoryQuestions);
  expect(result).toMatchObject({ ok: false, error: 'session_conflict' });
  expect(await storedMemory(page)).toBe(before);
});

test('memoria conserva cronología y metadatos recientes al registrar una sesión anterior', async ({ page }) => {
  const result = await page.evaluate(async ({ question, times }) => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    await memory.recordExam([{ ...question, difficulty: 5, sourceType: 'course' }], 'latest-date', { seenAt: times[2] });
    const older = await memory.recordExam([{ ...question, difficulty: 2 }], 'backdated-history', { seenAt: times[0] });
    return { older, entry: memory.recent(question.subject)[0], stats: memory.stats(question.subject) };
  }, { question: memoryQuestions[0], times: at });
  expect(result.older).toMatchObject({ ok: true, added: 0, updated: 1 });
  expect(result.entry).toMatchObject({ firstSeenAt: at[0], lastSeenAt: at[2], timesSeen: 2,
    sessionId: 'latest-date', difficulty: 5, sourceType: 'course' });
  expect(result.stats).toMatchObject({ uniqueQuestions: 1, totalSeen: 2, sessions: 2 });
});

test('memoria captura contenido y materia antes de esperar el cálculo de huellas', async ({ page }) => {
  const result = await page.evaluate(async ({ question, otherSubject }) => {
    const memory = NOA_QUESTION_MEMORY_V25_2, changing = structuredClone(question);
    const digest = crypto.subtle.digest;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    crypto.subtle.digest = async function(...args) { await gate; return digest.apply(this, args); };
    let recorded;
    try {
      const pending = memory.recordExam([changing], 'immutable-input');
      changing.text = 'Contenido diferente durante la espera'; changing.subject = otherSubject; changing.difficulty = 5;
      release(); recorded = await pending;
    } finally { crypto.subtle.digest = digest; }
    return { recorded, original: await memory.contains(question), changed: await memory.contains(changing),
      entry: memory.recent(question.subject)[0], other: memory.stats(otherSubject) };
  }, { question: memoryQuestions[0], otherSubject: chemistry });
  expect(result.recorded).toMatchObject({ ok: true, added: 1 });
  expect(result.original).toBe(true); expect(result.changed).toBe(false);
  expect(result.entry).toMatchObject({ subject: biology, difficulty: 3 });
  expect(result.other.uniqueQuestions).toBe(0);
});

test('memoria mantiene materias independientes aunque el contenido tenga la misma huella', async ({ page }) => {
  const result = await page.evaluate(async ({ question, first, second }) => {
    const memory = NOA_QUESTION_MEMORY_V25_2, other = { ...question, subject: second };
    await memory.recordExam([question], 'biology-session');
    const initiallyOther = await memory.contains(other);
    await memory.recordExam([other], 'chemistry-session');
    return { initiallyOther, sameFingerprint: await memory.fingerprint(question) === await memory.fingerprint(other),
      contains: [await memory.contains(question), await memory.contains(other)],
      first: memory.stats(first), second: memory.stats(second), all: memory.stats() };
  }, { question: memoryQuestions[0], first: biology, second: chemistry });
  expect(result.initiallyOther).toBe(false);
  expect(result.sameFingerprint).toBe(true);
  expect(result.contains).toEqual([true, true]);
  expect(result.first).toMatchObject({ uniqueQuestions: 1, totalSeen: 1, sessions: 1 });
  expect(result.second).toMatchObject({ uniqueQuestions: 1, totalSeen: 1, sessions: 1 });
  expect(result.all).toMatchObject({ uniqueQuestions: 2, totalSeen: 2, sessions: 2 });
});

test('memoria resuelve materia de Blueprint y tema real sin inventar un ámbito ausente', async ({ page }) => {
  const result = await page.evaluate(async question => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    const blueprint = { ...question, subject: undefined, blueprintSlot: { subject: 'EXCOBA Medicina · Biología' } };
    const fromTopic = { ...question, subject: undefined, topicId: 'test-topic' };
    const unknown = { ...question, subject: undefined, topicId: 'nonexistent-topic' };
    const recorded = [await memory.recordExam([blueprint], 'blueprint-subject'), await memory.recordExam([fromTopic], 'topic-subject')];
    const before = localStorage.getItem(memory.storageKey);
    const rejected = await memory.recordExam([unknown], 'unknown-subject');
    return { recorded, rejected, unknownContains: await memory.contains(unknown), before, after: localStorage.getItem(memory.storageKey),
      realSubject: subjectBy(topicBy('test-topic').subjectId).name, topicEntries: memory.recent(subjectBy(topicBy('test-topic').subjectId).name) };
  }, memoryQuestions[0]);
  expect(result.recorded.every(value => value.ok)).toBe(true);
  expect(result.rejected.ok).toBe(false);
  expect(result.unknownContains).toBe(false);
  expect(result.after).toBe(result.before);
  expect(result.realSubject).toBe('EXCOBA Secundaria · Matemáticas');
  expect(result.topicEntries).toHaveLength(1);
});

test('memoria conserva datos tras recargar y permite repetir la sesión sin contarla otra vez', async ({ page }) => {
  await page.evaluate(async ({ questions, at }) => NOA_QUESTION_MEMORY_V25_2.recordExam(questions, 'persisted-session', { seenAt: at }), { questions: memoryQuestions, at: at[0] });
  const before = await storedMemory(page);
  await page.reload();
  await page.waitForFunction(() => !!window.NOA_QUESTION_MEMORY_V25_2);
  const result = await page.evaluate(async questions => ({
    stats: NOA_QUESTION_MEMORY_V25_2.stats(), contains: await Promise.all(questions.map(question => NOA_QUESTION_MEMORY_V25_2.contains(question))),
    repeated: await NOA_QUESTION_MEMORY_V25_2.recordExam(questions, 'persisted-session')
  }), memoryQuestions);
  expect(result.stats).toMatchObject({ ok: true, uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
  expect(result.contains).toEqual([true, true, true, true]);
  expect(result.repeated).toMatchObject({ ok: true, added: 0, updated: 0, unchanged: 4 });
  expect(await storedMemory(page)).toBe(before);
});

test('memoria ordena recent por fecha y devuelve copias que no permiten mutar el registro', async ({ page }) => {
  const result = await page.evaluate(async ({ questions, times, subject }) => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    await memory.recordExam([questions[0]], 'old', { seenAt: times[0] });
    await memory.recordExam([questions[1]], 'new', { seenAt: times[1] });
    const before = localStorage.getItem(memory.storageKey), recent = memory.recent(subject, 1), stats = memory.stats(subject);
    const selected = structuredClone(recent); recent[0].timesSeen = 999; stats.byFormat.single_select = 999;
    return { selected, entries: memory.recent(subject), stats: memory.stats(subject), before, after: localStorage.getItem(memory.storageKey) };
  }, { questions: memoryQuestions, times: at, subject: biology });
  expect(result.selected).toHaveLength(1);
  expect(result.selected[0].interactionType).toBe('drag_classify');
  expect(result.entries.every(entry => entry.timesSeen === 1)).toBe(true);
  expect(result.stats.byFormat.single_select).toBe(1);
  expect(result.after).toBe(result.before);
});

test('memoria almacena solo metadatos permitidos sin copiar textos, claves o respuestas crudas de IA', async ({ page }) => {
  const token = 'SYNTHETIC-TOKEN-DO-NOT-PERSIST';
  const result = await page.evaluate(async ({ question, token }) => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    await memory.recordExam([{ ...question, apiKey: token, token, rawResponse: token, source: { material: token }, judge: { comments: token } }], 'whitelisted');
    return { raw: localStorage.getItem(memory.storageKey), entry: memory.recent(question.subject)[0] };
  }, { question: memoryQuestions[0], token });
  expect(result.raw).not.toContain(token);
  expect(result.raw).not.toContain(memoryQuestions[0].text);
  expect(Object.keys(result.entry).sort()).toEqual(['fingerprint', 'subject', 'syllabusCode', 'interactionType', 'difficulty', 'sourceType', 'firstSeenAt', 'lastSeenAt', 'timesSeen', 'sessionId'].sort());
  expect(result.raw.length).toBeLessThan(3000);
});

test('memoria conserva intactos examen, revisión, borradores, historial y Calibrator al registrar', async ({ page }) => {
  await activeSession(page); await waitDraftCheckpoint(page);
  const before = await memoryState(page);
  const result = await page.evaluate(async questions => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    const written = await memory.recordExam(questions, 'safe-record');
    await memory.fingerprint(questions[0]); await memory.contains(questions[0]); memory.recent(questions[0].subject); memory.stats();
    return written;
  }, memoryQuestions);
  expect(result.ok).toBe(true);
  expect(await memoryState(page)).toEqual(before);
});

test('memoria registra solo después de guardar el intento final y no se duplica al recargar', async ({ page }) => {
  await start(page, memoryQuestions);
  expect(await storedMemory(page)).toBeNull();
  for (let index = 0; index < memoryQuestions.length; index++) { await navigate(page, index); await answer(page, memoryQuestions[index]); }
  expect(await storedMemory(page)).toBeNull();
  await page.locator('#noaShellFinish').click();
  await expect(page.locator('#examBox > h2')).toHaveText('Resultado: 4 / 4');
  await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.whenIdle());
  const beforeReload = await storedMemory(page);
  expect(beforeReload).not.toBeNull();
  expect(await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.stats())).toMatchObject({ uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
  await page.reload();
  await page.waitForFunction(() => !!window.NOA_QUESTION_MEMORY_V25_2);
  expect(await storedMemory(page)).toBe(beforeReload);
  expect(await page.evaluate(() => db.attempts.length)).toBe(1);
});

test('memoria recupera únicamente un historial con contenido completo e instrucción explícita', async ({ page }, testInfo) => {
  const result = await page.evaluate(async ({ questions, at }) => {
    const memory = NOA_QUESTION_MEMORY_V25_2;
    const attempt = { id: 'complete-historical', at, answers: structuredClone(questions) };
    const recovered = await memory.recoverHistory([attempt]);
    const before = localStorage.getItem(memory.storageKey), repeated = await memory.recoverHistory([attempt]);
    return { recovered, repeated, before, after: localStorage.getItem(memory.storageKey), entries: memory.recent(questions[0].subject), stats: memory.stats() };
  }, { questions: memoryQuestions, at: at[0] });
  expect(result.recovered.ok).toBe(true);
  expect(result.recovered.recovered).toBe(4);
  expect(result.recovered.skipped).toBe(0);
  expect(result.stats).toMatchObject({ uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
  expect(result.after).toBe(result.before);
  for (const entry of result.entries) expect(entry).toMatchObject({ firstSeenAt: at[0], lastSeenAt: at[0], timesSeen: 1, sessionId: 'history:complete-historical' });
  await testInfo.attach('recuperacion-historica-completa', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});

test('memoria identifica el historial actual incompleto como no reconstruible sin inventar contenido', async ({ page }, testInfo) => {
  await start(page, memoryQuestions);
  for (let index = 0; index < memoryQuestions.length; index++) { await navigate(page, index); await answer(page, memoryQuestions[index]); }
  await page.locator('#noaShellFinish').click();
  await page.evaluate(() => NOA_QUESTION_MEMORY_V25_2.whenIdle());
  const before = await memoryState(page);
  const memoryBefore = await storedMemory(page);
  const result = await page.evaluate(async () => {
    const recovered = await NOA_QUESTION_MEMORY_V25_2.recoverHistory();
    return { recovered, attempts: structuredClone(db.attempts), stats: NOA_QUESTION_MEMORY_V25_2.stats() };
  });
  expect(result.recovered.ok).toBe(true);
  expect(result.recovered.recovered).toBe(0);
  expect(result.recovered.skipped).toBe(4);
  expect(result.recovered.issues.length).toBeGreaterThan(0);
  expect(result.stats).toMatchObject({ uniqueQuestions: 4, totalSeen: 4, sessions: 1 });
  expect(await storedMemory(page)).toBe(memoryBefore);
  expect(await memoryState(page)).toEqual(before);
  await testInfo.attach('historial-real-no-reconstruible', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
});

for (const value of ['{broken json', JSON.stringify({ version: 999, entries: [], sessions: [] }), JSON.stringify({ version: 1, entries: [null], sessions: [] })]) {
  test(`memoria gestiona datos corruptos sin bloquear NOA ni sobrescribirlos: ${value.slice(0, 28)}`, async ({ page }) => {
    // v5 repairs the synthetic abbreviated syllabus on the first reload.
    // Stabilize that existing startup behavior before checking memory isolation.
    await page.reload();
    await page.waitForFunction(() => !!window.NOA_QUESTION_MEMORY_V25_2);
    await page.evaluate(value => localStorage.setItem(NOA_QUESTION_MEMORY_V25_2.storageKey, value), value);
    const before = await memoryState(page);
    await page.reload();
    await page.waitForFunction(() => !!window.NOA_QUESTION_MEMORY_V25_2);
    await expect(page.locator('#nav')).toBeVisible();
    const result = await page.evaluate(async question => ({
      stats: NOA_QUESTION_MEMORY_V25_2.stats(), recent: NOA_QUESTION_MEMORY_V25_2.recent(question.subject),
      contains: await NOA_QUESTION_MEMORY_V25_2.contains(question),
      write: await NOA_QUESTION_MEMORY_V25_2.recordExam([question], 'cannot-overwrite-corrupt'),
      raw: localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey)
    }), memoryQuestions[0]);
    expect(result.stats).toMatchObject({ ok: false, error: 'corrupt_storage' });
    expect(result.recent).toEqual([]);
    expect(result.contains).toBe(false);
    expect(result.write.ok).toBe(false);
    expect(result.raw).toBe(value);
    expect(await memoryState(page)).toEqual(before);
  });
}

test('memoria maneja almacenamiento denegado sin actualizar contadores ni perder registros anteriores', async ({ page }) => {
  await page.evaluate(async question => NOA_QUESTION_MEMORY_V25_2.recordExam([question], 'before-quota'), memoryQuestions[0]);
  const result = await page.evaluate(async question => {
    const memory = NOA_QUESTION_MEMORY_V25_2, key = memory.storageKey, before = localStorage.getItem(key);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('Cuota sintética', 'QuotaExceededError'); return original.call(this, name, value); };
    let failed;
    try { failed = await memory.recordExam([question], 'blocked-quota'); } finally { Storage.prototype.setItem = original; }
    return { failed, before, after: localStorage.getItem(key), stats: memory.stats() };
  }, memoryQuestions[0]);
  expect(result.failed).toMatchObject({ ok: false, error: 'storage_unavailable' });
  expect(result.after).toBe(result.before);
  expect(result.stats).toMatchObject({ uniqueQuestions: 1, totalSeen: 1, sessions: 1 });
});

test.describe('memoria con Service Worker real', () => {
  test.use({ serviceWorkers: 'allow' });
  test('memoria queda cacheada y conserva lectura y registro local después de recargar offline', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cached = await page.evaluate(async () => {
      const scope = (await navigator.serviceWorker.getRegistration()).scope;
      const name = (await caches.keys()).find(name => name.startsWith(`noa-mobile:${encodeURIComponent(scope)}:`));
      return { name, module: !!await (await caches.open(name)).match(new URL('excoba_patch_v25_question_memory.js', scope).href) };
    });
    expect(cached.name).toMatch(/:v6-76$/);
    expect(cached.module).toBe(true);
    await page.evaluate(async questions => NOA_QUESTION_MEMORY_V25_2.recordExam(questions, 'before-offline'), memoryQuestions);
    await context.setOffline(true); await page.reload();
    await page.waitForFunction(() => !!window.NOA_QUESTION_MEMORY_V25_2);
    const result = await page.evaluate(async questions => ({
      contains: await Promise.all(questions.map(question => NOA_QUESTION_MEMORY_V25_2.contains(question))),
      written: await NOA_QUESTION_MEMORY_V25_2.recordExam(questions, 'offline-session'), stats: NOA_QUESTION_MEMORY_V25_2.stats()
    }), memoryQuestions);
    expect(result.contains).toEqual([true, true, true, true]);
    expect(result.written).toMatchObject({ ok: true, updated: 4 });
    expect(result.stats).toMatchObject({ uniqueQuestions: 4, totalSeen: 8, sessions: 2 });
  });
});
