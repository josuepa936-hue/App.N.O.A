const { test, expect } = require('@playwright/test');
const { openGenerator, activeSession } = require('./generator-fixtures.cjs');
const { fullExamState, waitDraftCheckpoint } = require('./exam-45-ui-fixtures.cjs');
const { answerAll, finish } = require('./question-memory-integration-fixtures.cjs');
const { review } = require('./judge-academic-fixtures.cjs');

const subject = 'EXCOBA Secundaria · Ciencias sociales';
const storageKey = 'NOA_COURSE_ONLY_ADDON_V1:/App.N.O.A/';
const history = '# Historia 1A\nPaleolítico: caza y recolección. Mesolítico: transición regional. Neolítico: agricultura y sedentarización. Evolución humana: cambios en poblaciones a lo largo del tiempo.';
const geography = '# Geografía 1\nLa latitud mide la distancia angular respecto al ecuador. Los paralelos permiten ubicar puntos en un mapa.';

async function installProvider(page) {
  await page.evaluate(({ reviews, history, geography }) => {
    window.courseCalls = [];
    window.callAI = async messages => {
      const system = messages[0].content, prompt = messages.at(-1).content;
      if (system.includes('Source Analyzer')) {
        const isHistory = prompt.includes(history);
        if (!isHistory && !prompt.includes(geography)) throw Error('Fuente inesperada en fixture');
        const code = isHistory ? '2.4.2.1' : '2.4.1.1';
        const label = isHistory ? 'Paleolítico' : 'Latitud';
        const classification = isHistory ? 'related' : 'core';
        courseCalls.push({ kind: 'analyzer', code, prompt });
        return JSON.stringify({ summary: label, overall_classification: classification,
          concepts: [{ name: label, classification, syllabus_codes: [code] }],
          syllabus_links: [{ code, confidence: 0.9 }],
          evaluable_objectives: [{ type: 'conceptual', objective: `Identificar ${label}` }] });
      }
      const scope = JSON.parse(prompt.match(/CATÁLOGO DEL SLOT \(JSON\):\n([^\n]+)\nFIN CATÁLOGO DEL SLOT/)[1]);
      const complementary = prompt.includes(history) && scope.topics.length === 0;
      const format = system.includes('Judge')
        ? Object.keys(reviews).find(key => system.includes('reactivos académicos ' + key))
        : system.includes('Inline Select Generator') ? 'inline_select'
          : system.includes('Drag Order Generator') ? 'drag_order'
            : system.includes('Drag Generator') ? 'drag_classify' : 'single_select';
      const content = complementary ? 'Prehistoria' : scope.topics[0]?.title;
      if (system.includes('Judge')) {
        courseCalls.push({ kind: 'judge', format, complementary, scope, prompt });
        return JSON.stringify({ ...reviews[format], source_alignment: {
          status: 'pass', syllabusCodes: scope.topics.map(topic => topic.code),
          assessedSkill: complementary ? 'Distinguir cambios en los modos de subsistencia.' : `Interpretar ${content}.`,
          requiresUnrelatedKnowledge: false,
          reason: complementary ? 'La respuesta se obtiene del material de Prehistoria del curso.' : 'Dictamen simulado para comprobar la trazabilidad del lote.'
        } });
      }
      courseCalls.push({ kind: 'generator', format, complementary, scope, prompt });
      const variants = {
        single_select: { question: complementary ? 'Según Historia 1A, ¿qué actividad caracteriza al Neolítico?' : `Ejercicio sintético: ${content}. ¿Qué concepto se evalúa?`,
          options: complementary ? ['Agricultura', 'Metalurgia industrial', 'Astronomía orbital', 'Navegación a vapor'] : [content, 'Opción B', 'Opción C', 'Opción D'],
          correct: 0, explanation: complementary ? 'El material asocia el Neolítico con la agricultura.' : 'Fixture de procedencia.',
          syllabus_code: complementary ? '2.4.2.1' : scope.topics[0]?.code },
        inline_select: { text: `${content}. En el Paleolítico se practicaba [[b1]] y en el Neolítico [[b2]].`,
          blanks: [{ id: 'b1', options: ['la caza', 'la agricultura'], correct: 0 }, { id: 'b2', options: ['la agricultura', 'la industria'], correct: 0 }], explanation: 'El material distingue la subsistencia en ambos periodos.' },
        drag_classify: { instruction: 'Clasifica las actividades por periodo.', stem: content,
          targets: [{ id: 'p', label: 'Paleolítico' }, { id: 'n', label: 'Neolítico' }],
          elements: [{ id: 'a', text: 'Caza', correctTargetId: 'p' }, { id: 'b', text: 'Recolección', correctTargetId: 'p' }, { id: 'c', text: 'Agricultura', correctTargetId: 'n' }, { id: 'd', text: 'Vida sedentaria', correctTargetId: 'n' }], explanation: 'El material indica la clasificación por subsistencia.' },
        drag_order: { instruction: 'Ordena los periodos según el relato.', stem: content,
          items: [{ id: 'one', text: 'Paleolítico' }, { id: 'two', text: 'Mesolítico' }, { id: 'three', text: 'Neolítico' }], correctOrder: ['one', 'two', 'three'], explanation: 'El orden sigue el marco cronológico del material.' }
      };
      const item = variants[format];
      const field = format === 'single_select' ? 'question' : format === 'inline_select' ? 'text' : 'stem';
      item[field] += ` Variante sintética ${courseCalls.filter(call => call.kind === 'generator').length}.`;
      return JSON.stringify(item);
    };
  }, { reviews: Object.fromEntries(['single_select', 'drag_classify', 'inline_select', 'drag_order'].map(format => [format, review(format)])), history, geography });
}

async function openBank(page) {
  await page.locator('#nav button[data-page="notes"]').click();
  await page.locator('#excobaStudySubject').selectOption(subject);
}

async function addAnalyzed(page, content) {
  await page.locator('#noaCourseSourceInput').fill(content);
  await page.locator('#noaSaveCourseSource').click();
  await expect.poll(() => page.evaluate(text => db.courseSources.find(source => source.content === text)?.analysisStatus, content)).toBe('ready');
  return page.evaluate(text => db.courseSources.find(source => source.content === text).id, content);
}

const toggle = (page, id) => page.locator(`[data-noa-course-only-toggle="${id}"]`);

test.describe('Integración del complemento con motores reales de NOA', () => {
  test.beforeEach(async ({ page }) => {
    page.courseErrors = [];
    page.courseExternal = [];
    page.on('pageerror', error => page.courseErrors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') page.courseErrors.push(msg.text()); });
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', route => {
      if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
      page.courseExternal.push(route.request().url());
      return route.abort();
    });
    await openGenerator(page);
    await page.evaluate(() => {
      db.masterSyllabus = { id: 'uaq-excoba-2026-2-medicina', items: NOA_EXCOBA_FIX_V5.items.map(item => ({ ...item })) };
      save();
    });
    await installProvider(page);
    await openBank(page);
  });

  test.afterEach(async ({ page }) => {
    expect(page.courseErrors).toEqual([]);
    expect(page.courseExternal).toEqual([]);
  });

  test('analizador, catálogo, protección, perfil oficial y recarga conservan datos', async ({ page }) => {
    const hist = await addAnalyzed(page, history), geo = await addAnalyzed(page, geography);
    const read = () => page.evaluate(subject => ({ sources: db.courseSources,
      effective: NOA_COURSE_ONLY_ADDON_V1.preview(subject),
      other: NOA_COURSE_ONLY_ADDON_V1.preview('EXCOBA Secundaria · Español'),
      persisted: localStorage.getItem(KEY) }), subject);
    const before = await read();
    expect(before.effective).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: hist, effectiveClassification: 'related', syllabusCodes: ['2.4.2.1'] }),
      expect.objectContaining({ id: geo, effectiveClassification: 'core', syllabusCodes: ['2.4.1.1'] })
    ]));
    const official = () => page.evaluate(subject => {
      const { createdAt, ...plan } = NOA_SOURCE_BLUEPRINT.build({ subject, count: 5 });
      return plan;
    }, subject);
    const officialBefore = await official();
    expect(officialBefore.slots.every(slot => slot.sourceType === 'official' && !slot.source.courseSourceId)).toBe(true);
    await toggle(page, hist).click();
    await expect(toggle(page, hist)).toHaveText('Quitar protección complementaria');
    expect(await official()).toEqual(officialBefore);
    const after = await read();
    expect(after.sources).toEqual(before.sources);
    expect(after.persisted).toBe(before.persisted);
    expect(after.other).toEqual([]);
    expect(after.effective.find(item => item.id === geo)).toEqual(before.effective.find(item => item.id === geo));
    expect(after.effective.find(item => item.id === hist)).toMatchObject({ effectiveClassification: 'course_only', syllabusCodes: [] });
    await page.locator('#excobaTrainingProfile').selectOption('course');
    const course = await official();
    expect(course.slots).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'course', syllabusCodes: [], source: expect.objectContaining({ courseSourceId: hist, classification: 'course_only', officialAnchor: null }) }),
      expect.objectContaining({ sourceType: 'course', syllabusCodes: ['2.4.1.1'], source: expect.objectContaining({ courseSourceId: geo, classification: 'core' }) })
    ]));
    const geographyQuestion = await page.evaluate(async ({ subject, geo, verdict }) => {
      const plan = NOA_SOURCE_BLUEPRINT.build({ subject, count: 5, supportedInteractionTypes: ['single_select'] });
      const slot = plan.slots.find(item => item.source.courseSourceId === geo);
      window.callAI = async messages => JSON.stringify(messages[0].content.includes('Judge') ? verdict : {
        question: '¿Qué coordenada indica la distancia angular de un punto respecto al ecuador?',
        options: ['Latitud', 'Longitud', 'Altitud', 'Escala'], correct: 0,
        explanation: 'La latitud se mide a partir del ecuador.', syllabus_code: '2.4.1.1'
      });
      return (await NOA_BLUEPRINT_GENERATOR.generateSlot(slot, { maxAttempts: 1 })).question;
    }, { subject, geo, verdict: { ...review('single_select'), source_alignment: { status: 'pass', syllabusCodes: ['2.4.1.1'],
      assessedSkill: 'Distinguir la latitud como coordenada geográfica.', requiresUnrelatedKnowledge: false,
      reason: 'La coordenada está definida en la fuente y pertenece a la ubicación en mapas.' } } });
    expect(geographyQuestion).toMatchObject({ accepted: true, syllabusCode: '2.4.1.1', sourceTrace: { classification: 'core' } });
    await page.reload();
    await openBank(page);
    await expect(toggle(page, hist)).toHaveText('Quitar protección complementaria');
    await expect(page.locator('[data-noa-course-only-addon]')).toHaveCount(2);
    await toggle(page, hist).click();
    const restored = await read();
    expect(restored.sources).toEqual(before.sources);
    expect(restored.effective).toEqual(before.effective);
  });

  test('Generar con IA produce un reactivo nuevo de Prehistoria sin código hasta cierre y memoria', async ({ page }) => {
    const id = await addAnalyzed(page, history);
    await toggle(page, id).click();
    await page.locator('#excobaTrainingProfile').selectOption('course');
    await page.locator('#nav button[data-page="exam"]').click();
    await page.locator('#noaGeneratorSubject').selectOption(subject);
    await page.locator('#noaGeneratorGenerate').click();
    await expect.poll(async () => {
      const phase = await page.locator('#noaGeneratorPhase').textContent();
      return phase === 'Generación completada' ? phase : `${phase} · ${await page.locator('#noaGeneratorDetails').textContent()}`;
    }).toBe('Generación completada');
    const emitted = await page.evaluate(() => ({ queue: examQueue, calls: courseCalls }));
    expect(emitted.queue).toHaveLength(5);
    const course = emitted.queue.filter(q => q.blueprintSlot.source.courseSourceId === id);
    expect(course.length).toBeGreaterThan(0);
    for (const question of course) {
      expect(question.accepted).toBe(true);
      expect(question.sourceType).toBe('course');
      expect(question.blueprintSlot.source.classification).toBe('course_only');
      expect(question.blueprintSlot.syllabusCodes).toEqual([]);
      expect(question.syllabusCode || '').toBe('');
      expect(question.syllabusCodes || []).toEqual([]);
      expect(question.topicId).toBe('');
      expect(question.judge.source_alignment.syllabusCodes).toEqual([]);
    }
    const complementary = emitted.calls.filter(call => call.complementary);
    expect(complementary.map(call => call.kind)).toEqual(expect.arrayContaining(['generator', 'judge']));
    expect(complementary.every(call => call.scope.topics.length === 0 && call.prompt.includes('Paleolítico'))).toBe(true);
    expect(emitted.calls.filter(call => call.kind !== 'analyzer' && call.scope.sourceType === 'official')
      .every(call => !call.prompt.includes(history))).toBe(true);
    expect(emitted.calls.filter(call => call.kind === 'judge')).toHaveLength(5);
    await answerAll(page, emitted.queue);
    await finish(page);
    await expect.poll(() => page.evaluate(() => db.attempts.length)).toBe(1);
    const record = await page.evaluate(async ({ subject, questionId }) => {
      const attempt = db.attempts[0], catalog = NOA_ACADEMIC_RESULTS_V27.catalog();
      const normalized = NOA_RESULTS_NORMALIZATION_V27.normalizeAttempt(attempt, { catalog });
      return { attempt, memory: await NOA_QUESTION_MEMORY_V25_2.recent(subject, 20),
        normalized: normalized.records.find(item => item.questionId.value === questionId) };
    }, { subject, questionId: course[0].id });
    expect(record.attempt.score).toBe(5);
    expect(record.attempt.answers.find(item => item.questionId === course[0].id)).toMatchObject({ syllabusCode: '', topicId: '' });
    expect(record.memory.some(entry => entry.sourceType === 'course' && entry.syllabusCode === null)).toBe(true);
    expect(record.normalized.classification.subtopic.value).toBeNull();
    expect(record.normalized.allocations).toEqual([]);
  });

  test('error de almacenamiento se comunica y conserva la sesión, las notas y la clasificación', async ({ page }) => {
    const id = await addAnalyzed(page, history);
    await page.locator('#nav button[data-page="exam"]').click();
    await activeSession(page);
    await waitDraftCheckpoint(page);
    await page.evaluate(key => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new DOMException('Almacenamiento denegado', 'QuotaExceededError');
        return write.call(this, name, value);
      };
    }, storageKey);
    const before = await fullExamState(page);
    const failure = await page.evaluate(id => NOA_COURSE_ONLY_ADDON_V1.setMarked(id, true), id);
    expect(failure).toEqual({ ok: false, error: 'storage_unavailable' });
    expect(await fullExamState(page)).toEqual(before);
    await page.evaluate(id => document.querySelector(`[data-noa-course-only-toggle="${id}"]`).click(), id);
    await expect(page.locator('#toast')).toHaveText('No se pudo guardar la protección complementaria.');
    expect(await fullExamState(page)).toEqual(before);
  });

  test('otras materias ignoran marcas antiguas y conservan su alcance y controles', async ({ page }) => {
    const entries = await page.evaluate(({ target, key }) => {
      const catalog = NOA_ACADEMIC_RESULTS_V27.catalog();
      const entries = catalog.subjects.filter(item => item.value !== target).map(item => {
        const code = catalog.items.find(topic => topic.subject === item.value).code;
        const source = NOA_SOURCE_ENGINE.addCourseSource(item.value, 'Contenido sintético de curso.', item.label);
        source.analysisStatus = 'ready';
        source.analysis = { overall_classification: 'core', syllabus_links: [{ code }],
          concepts: [{ name: 'Concepto sintético', classification: 'core', syllabus_codes: [code] }] };
        return { id: source.id, subject: source.subject, code };
      });
      save();
      localStorage.setItem(key, JSON.stringify(entries.map(source => source.id)));
      return entries;
    }, { target: subject, key: storageKey });
    expect(entries).toHaveLength(9);
    await page.reload();
    const result = await page.evaluate(({ entries, key }) => {
      const snapshot = JSON.stringify(db.courseSources);
      const stored = localStorage.getItem(key);
      const materials = entries.map(({ id, subject }) => {
        const source = NOA_SOURCE_ENGINE.getCourseSources(subject).find(item => item.id === id);
        return { source, marked: NOA_COURSE_ONLY_ADDON_V1.isMarked(id),
          preview: NOA_COURSE_ONLY_ADDON_V1.preview(subject).find(item => item.id === id),
          toggle: NOA_COURSE_ONLY_ADDON_V1.setMarked(id, true) };
      });
      return { materials, sameSources: JSON.stringify(db.courseSources) === snapshot, sameMarks: localStorage.getItem(key) === stored };
    }, { entries, key: storageKey });
    expect(result.sameSources).toBe(true);
    expect(result.sameMarks).toBe(true);
    for (const [index, entry] of entries.entries()) {
      expect(result.materials[index]).toMatchObject({
        source: { id: entry.id, subject: entry.subject,
          analysis: { overall_classification: 'core', syllabus_links: [{ code: entry.code }],
            concepts: [{ classification: 'core', syllabus_codes: [entry.code] }] } },
        marked: false, preview: { protected: false, syllabusCodes: [entry.code] },
        toggle: { ok: false, error: 'unsupported_subject' }
      });
    }
    await page.locator('#nav button[data-page="notes"]').click();
    const bankSubjects = await page.locator('#excobaStudySubject').evaluate(select => Array.from(select.options, option => option.value));
    const visibleEntries = entries.filter(entry => bankSubjects.includes(entry.subject));
    expect(visibleEntries).toHaveLength(8);
    for (const entry of visibleEntries) {
      await page.locator('#excobaStudySubject').selectOption(entry.subject);
      await expect(page.locator(`[data-analyze-course="${entry.id}"]`)).toBeVisible();
      await expect(toggle(page, entry.id)).toHaveCount(0);
    }
  });

  test('Física conserva su código y puede iniciar una práctica con el contrato existente', async ({ page }) => {
    const fixture = await page.evaluate(() => {
      const subject = NOA_EXCOBA_PREPARATION.physics().value;
      const source = NOA_SOURCE_ENGINE.addCourseSource(subject, 'La rapidez expresa la distancia recorrida por unidad de tiempo.', 'Práctica de Física');
      source.analysisStatus = 'ready';
      source.analysis = { overall_classification: 'core', syllabus_links: [{ code: '3.3.1.1' }] };
      const activation = NOA_COURSE_ONLY_ADDON_V1.setMarked(source.id, true);
      document.getElementById('excobaTrainingProfile').value = 'course';
      const blueprint = NOA_SOURCE_BLUEPRINT.build({ subject, count: 5, supportedInteractionTypes: ['single_select'] });
      return { activation, slot: blueprint.slots.find(slot => slot.source.courseSourceId === source.id) };
    });
    expect(fixture.activation).toEqual({ ok: false, error: 'unsupported_subject' });
    expect(fixture.slot).toMatchObject({ sourceType: 'course', syllabusCodes: ['3.3.1.1'], source: { classification: 'core' } });
    const result = await page.evaluate(async ({ slot, verdict }) => {
      window.callAI = async messages => JSON.stringify(messages[0].content.includes('Judge') ? verdict : {
        question: 'Según la práctica del curso, ¿qué indica la rapidez?',
        options: ['Distancia por unidad de tiempo', 'Masa por unidad de volumen', 'Fuerza por unidad de área', 'Energía por unidad de tiempo'],
        correct: 0, explanation: 'El material describe la distancia recorrida por unidad de tiempo.', syllabus_code: '3.3.1.1'
      });
      const { question } = await NOA_BLUEPRINT_GENERATOR.generateSlot(slot, { maxAttempts: 1 });
      NOA_MIXED_EXAM.start([question], 'Práctica de Física');
      return { accepted: question.accepted, code: examQueue[0].syllabusCode, count: examQueue.length };
    }, { slot: fixture.slot, verdict: { ...review('single_select'), source_alignment: { status: 'pass', syllabusCodes: ['3.3.1.1'],
      assessedSkill: 'Interpretar una magnitud física.', requiresUnrelatedKnowledge: false,
      reason: 'La definición está en el material del curso y en el alcance de magnitudes físicas.' } } });
    expect(result).toEqual({ accepted: true, code: '3.3.1.1', count: 1 });
  });
});
