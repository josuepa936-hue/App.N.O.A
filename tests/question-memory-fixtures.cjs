const { questions } = require('./fixtures.cjs');

const biology = 'EXCOBA Medicina · Biología';
const chemistry = 'EXCOBA Medicina · Química';
const at = ['2026-01-01T12:00:00.000Z', '2026-01-02T12:00:00.000Z', '2026-01-03T12:00:00.000Z'];
const memoryQuestions = structuredClone(questions).map((question, index) => ({
  ...question,
  id: `memory-${index}`,
  subject: biology,
  syllabusCode: '3.2.1',
  difficulty: 3,
  sourceType: 'official'
}));
memoryQuestions[0].text = '¿Selecciona el resultado de sumar 2 + 2?';
memoryQuestions[0].instruction = 'Selecciona la opción correcta.';
memoryQuestions[1].correctResponse = Object.fromEntries(memoryQuestions[1].elements.map(item => [item.id, item.correctTargetId]));

function visualVariants() {
  const variants = structuredClone(memoryQuestions);
  variants[0].id = 'different-visual-id';
  variants[0].text = '  ¿Selecciona el RESULTADO de sumar  2 + 2?  ';
  variants[0].instruction = '  SELECCIONA la opción correcta.  ';
  variants[0].options = ['6', '4', '7', '5'];
  variants[0].correct = 1;

  const targets = { even: 'category-z', odd: 'category-a' };
  variants[1].targets = variants[1].targets.reverse().map(item => ({ ...item, id: targets[item.id] }));
  variants[1].elements = variants[1].elements.reverse().map((item, index) => ({
    ...item, id: 'renamed-element-' + index, correctTargetId: targets[item.correctTargetId]
  }));
  variants[1].correctResponse = Object.fromEntries(variants[1].elements.map(item => [item.id, item.correctTargetId]));

  const blanks = { b1: 'space-left', b2: 'space-right' };
  variants[2].text = variants[2].text.replace('[[b1]]', '[[space-left]]').replace('[[b2]]', '[[space-right]]');
  variants[2].blanks = variants[2].blanks.reverse().map(item => ({
    ...item, id: blanks[item.id], options: [...item.options].reverse(), correct: item.options.length - 1 - item.correct
  }));

  const order = { one: 'event-c', two: 'event-b', three: 'event-a' };
  variants[3].items = variants[3].items.reverse().map(item => ({ ...item, id: order[item.id] }));
  variants[3].correctOrder = variants[3].correctOrder.map(id => order[id]);
  return variants;
}

async function memoryState(page) {
  return page.evaluate(() => {
    const key = NOA_QUESTION_MEMORY_V25_2.storageKey;
    return {
      db: structuredClone(db), queue: structuredClone(examQueue), index: examIndex,
      score: examScore, answers: structuredClone(examAnswers),
      drafts: structuredClone([...NOA_EXAM_NAVIGATION.drafts.entries()]),
      revision: NOA_ANSWER_REVISION.capture(), calibration: NOA_CALIBRATOR.get(),
      storage: Object.fromEntries(Object.keys(localStorage).filter(name => name !== key).sort().map(name => [name, localStorage.getItem(name)]))
    };
  });
}

async function storedMemory(page) {
  return page.evaluate(() => localStorage.getItem(NOA_QUESTION_MEMORY_V25_2.storageKey));
}

module.exports = { biology, chemistry, at, memoryQuestions, visualVariants, memoryState, storedMemory };
