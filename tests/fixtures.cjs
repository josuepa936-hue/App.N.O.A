const common = {
  topicId: 'test-topic',
  blueprint: { difficulty: 3 },
  explain: 'Explicación aritmética determinista.',
  accepted: true
};

const questions = [
  { ...common, id: 'test-single', interactionType: 'single_select',
    text: '2 + 2 = ?', options: ['4', '5', '6', '7'], correct: 0 },
  { ...common, id: 'test-classify', interactionType: 'drag_classify',
    instruction: 'Clasifica por paridad.', stem: 'Cuatro números',
    targets: [{ id: 'even', label: 'Par' }, { id: 'odd', label: 'Impar' }],
    elements: [
      { id: 'two', text: '2', correctTargetId: 'even' },
      { id: 'four', text: '4', correctTargetId: 'even' },
      { id: 'one', text: '1', correctTargetId: 'odd' },
      { id: 'three', text: '3', correctTargetId: 'odd' }
    ] },
  { ...common, id: 'test-inline', interactionType: 'inline_select',
    instruction: 'Completa las sumas.', text: '1+1=[[b1]]; 2+2=[[b2]].',
    blanks: [
      { id: 'b1', options: ['2', '3'], correct: 0 },
      { id: 'b2', options: ['4', '5'], correct: 0 }
    ] },
  { ...common, id: 'test-order', interactionType: 'drag_order',
    instruction: 'Ordena de menor a mayor.', stem: 'Tres números',
    items: [{ id: 'one', text: '1' }, { id: 'two', text: '2' }, { id: 'three', text: '3' }],
    correctOrder: ['one', 'two', 'three'] }
];

async function openApp(page) {
  await page.addInitScript(() => {
    let seed = 123456;
    Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  });
  await page.goto('./');
  await page.waitForFunction(() => window.NOA_RESULTS_ENGINE && window.NOA_EXAM_RECOVERY);
}

async function start(page, queue = questions) {
  await page.evaluate(q => {
    db = blank();
    db.subjects = [{ id: 'test-subject', name: 'Materia sintética' }];
    db.topics = [{ id: 'test-topic', subjectId: 'test-subject', name: 'Aritmética', attempts: 0, correct: 0 }];
    db.questions = q;
    save();
    NOA_MIXED_EXAM.start(q, 'Regresión determinista');
  }, queue);
}

async function snapshot(page) {
  return page.evaluate(() => ({
    index: examIndex,
    score: examScore,
    answers: examAnswers,
    attempts: db.attempts,
    topic: db.topics[0],
    revision: NOA_ANSWER_REVISION.capture(),
    nav: NOA_EXAM_NAVIGATION.state(),
    clock: NOA_EXAM_SHELL.state(),
    drag: NOA_DRAG_RENDERER.getState(),
    inline: NOA_INLINE_RENDERER.getState(),
    order: NOA_DRAG_ORDER_RENDERER.getState(),
    calibration: NOA_CALIBRATOR.get()
  }));
}

async function navigate(page, index) {
  await page.evaluate(i => NOA_EXAM_NAVIGATION.navigateTo(i), index);
  await page.waitForTimeout(160);
}

async function assign(page, id, target) {
  await page.locator(`[data-noa-drag-item="${id}"]`).click();
  await page.locator(`[data-noa-target="${target}"]`).click({ position: { x: 5, y: 5 } });
}

async function orderTo(page, ids) {
  for (let desired = 0; desired < ids.length; desired++) {
    for (let tries = 0; tries < ids.length; tries++) {
      const current = await page.evaluate(() => NOA_DRAG_ORDER_RENDERER.getState().order);
      if (current.indexOf(ids[desired]) === desired) break;
      await page.locator(`[data-order-up="${ids[desired]}"]`).click();
    }
  }
}

async function answer(page, question, mode = 'full', double = false) {
  const submit = async selector => {
    const button = page.locator(selector);
    if (double) await button.evaluate(el => { el.click(); el.click(); });
    else await button.click();
  };
  if (question.interactionType === 'single_select') {
    await submit(`#examBox button[onclick="answerExam(${mode === 'zero' ? 1 : 0})"]`);
  } else if (question.interactionType === 'drag_classify') {
    for (let i = 0; i < question.elements.length; i++) {
      const element = question.elements[i];
      let target = element.correctTargetId;
      if (mode === 'zero' || mode === 'partial' && i >= 2) target = target === 'even' ? 'odd' : 'even';
      await assign(page, element.id, target);
    }
    await submit('#noaDragSubmit');
  } else if (question.interactionType === 'inline_select') {
    for (let i = 0; i < question.blanks.length; i++) {
      await page.locator(`[data-noa-inline="${question.blanks[i].id}"]`)
        .selectOption(mode === 'zero' || mode === 'partial' && i > 0 ? '1' : '0');
    }
    await submit('#noaInlineSubmit');
  } else {
    const order = mode === 'full' ? ['one', 'two', 'three'] :
      mode === 'partial' ? ['three', 'one', 'two'] : ['three', 'two', 'one'];
    await orderTo(page, order);
    await submit('#noaOrderSubmit');
  }
}

module.exports = { questions, openApp, start, snapshot, navigate, assign, orderTo, answer };
