const metrics = {
  single_select: ['source_fidelity', 'difficulty_match', 'distractor_quality', 'reasoning_quality', 'clarity', 'single_correct'],
  drag_classify: ['source_fidelity', 'difficulty_match', 'classification_quality', 'element_quality', 'ambiguity_control', 'reasoning_quality', 'clarity'],
  inline_select: ['source_fidelity', 'difficulty_match', 'blank_quality', 'option_quality', 'ambiguity_control', 'context_quality', 'reasoning_quality', 'clarity'],
  drag_order: ['source_fidelity', 'difficulty_match', 'sequence_validity', 'order_uniqueness', 'semantic_distinctness', 'item_quality', 'reasoning_quality', 'ambiguity_control', 'clarity']
};
const criteria = ['scientific_accuracy', 'internal_consistency', 'answer_validity', 'conceptual_unambiguity', 'non_overlap'];
const formats = Object.keys(metrics);
const subjects = {
  biology: 'EXCOBA Medicina · Biología', chemistry: 'EXCOBA Medicina · Química'
};

function review(format, score = 9.2) {
  return {
    ...Object.fromEntries(metrics[format].map(key => [key, score])),
    academic_review: Object.fromEntries(criteria.map(key => [key, {
      status: key === 'non_overlap' && ['single_select', 'inline_select'].includes(format) ? 'not_applicable' : 'pass',
      reason: 'Evaluación sintética explícita del criterio; no validación independiente.'
    }])),
    critical_issues: [], comments: 'Fixture de Judge simulado; no demuestra la capacidad real de la IA.'
  };
}

const correctCell = {
  interactionType: 'single_select', instruction: 'Selecciona la opción correcta.',
  text: '¿Qué estructura distingue a una célula eucariota de una procariota?',
  options: ['Núcleo delimitado por membrana', 'Membrana plasmática', 'ADN', 'Ribosomas'], correct: 0,
  explain: 'La célula eucariota tiene núcleo delimitado por membrana; la procariota carece de él.'
};
const cases = [
  {
    id: 'A', label: 'tejido de organismo unicelular', format: 'single_select', subject: subjects.biology,
    criterion: 'scientific_accuracy', status: 'fail',
    issue: 'Un organismo unicelular no tiene tejidos: el enunciado contiene una contradicción conceptual.',
    question: { ...correctCell, text: 'Una muestra de tejido de un organismo unicelular se observa al microscopio. ¿Qué estructura permite identificar su tipo celular?' },
    corrected: { ...correctCell, text: 'Una muestra de tejido de un organismo multicelular se observa al microscopio. ¿Qué estructura identifica células eucariotas?' }
  },
  {
    id: 'B', label: 'traducción y formación polipeptídica solapadas', format: 'drag_order', subject: subjects.biology,
    criterion: 'non_overlap', status: 'fail', issue: 'La traducción incluye la formación de la cadena polipeptídica; no son etapas independientes.',
    question: {
      interactionType: 'drag_order', instruction: 'Ordena estas etapas completamente independientes de la expresión génica.', stem: 'Expresión génica eucariota.',
      items: [{ id: 'one', text: 'Transcripción' }, { id: 'two', text: 'Traducción' }, { id: 'three', text: 'Formación de cadena polipeptídica' }],
      correctOrder: ['one', 'two', 'three'], explanation: 'La traducción y la formación polipeptídica se presentan como procesos separados.'
    },
    corrected: {
      interactionType: 'drag_order', instruction: 'Ordena los eventos de expresión de un gen nuclear eucariota.', stem: 'La traducción incluye la formación del polipéptido.',
      items: [{ id: 'one', text: 'Transcripción a pre-ARNm' }, { id: 'two', text: 'Maduración del ARNm' }, { id: 'three', text: 'Traducción del ARNm para formar el polipéptido' }],
      correctOrder: ['one', 'two', 'three'], explanation: 'El transcrito se procesa antes de traducirse; formar el polipéptido es parte de la traducción.'
    }
  },
  {
    id: 'C', label: 'numeración ambigua de Mendel', format: 'inline_select', subject: subjects.biology,
    criterion: 'conceptual_unambiguity', status: 'uncertain', issue: 'La numeración de las leyes de Mendel depende de la fuente; se requiere terminología inequívoca.',
    question: {
      interactionType: 'inline_select', instruction: 'Completa la afirmación.', text: 'En Aa × Aa con dominancia completa, la proporción fenotípica es [[b1]] y se asocia a [[b2]].',
      blanks: [{ id: 'b1', options: ['3:1', '1:1'], correct: 0 }, { id: 'b2', options: ['la primera ley de Mendel', 'la herencia ligada al sexo'], correct: 0 }],
      explanation: 'La proporción es 3:1 por segregación, pero llamar a esto primera ley sin definir la convención es ambiguo.'
    },
    corrected: {
      interactionType: 'inline_select', instruction: 'Completa la afirmación con terminología inequívoca.', text: 'En Aa × Aa con dominancia completa, la proporción fenotípica es [[b1]] y la separación de los alelos corresponde a [[b2]].',
      blanks: [{ id: 'b1', options: ['3:1', '1:1'], correct: 0 }, { id: 'b2', options: ['la ley de segregación', 'la herencia ligada al sexo'], correct: 0 }],
      explanation: 'La ley de segregación describe la separación de alelos; no se necesita numerar las leyes.'
    }
  },
  {
    id: 'D', label: 'exotérmico y exergónico como sinónimos', format: 'drag_classify', subject: subjects.chemistry,
    criterion: 'scientific_accuracy', status: 'fail', issue: 'Exotérmico depende de ΔH y exergónico de ΔG; no son sinónimos.',
    question: {
      interactionType: 'drag_classify', instruction: 'Clasifica suponiendo que exotérmico y exergónico son sinónimos.', stem: 'Cambios termodinámicos.',
      targets: [{ id: 'even', label: 'Exotérmico o exergónico (sinónimos)' }, { id: 'odd', label: 'Endotérmico o endergónico (sinónimos)' }],
      elements: [{ id: 'two', text: 'ΔH < 0', correctTargetId: 'even' }, { id: 'four', text: 'ΔG < 0', correctTargetId: 'even' }, { id: 'one', text: 'ΔH > 0', correctTargetId: 'odd' }, { id: 'three', text: 'ΔG > 0', correctTargetId: 'odd' }],
      explanation: 'La premisa incorrecta equipara entalpía y energía libre de Gibbs.'
    },
    corrected: {
      interactionType: 'drag_classify', instruction: 'Clasifica el criterio termodinámico al que se refiere cada descripción; exotérmico y exergónico no son sinónimos.', stem: 'Un mismo proceso puede cumplir ambos criterios sin que sean equivalentes.',
      targets: [{ id: 'even', label: 'Exotérmico: ΔH < 0' }, { id: 'odd', label: 'Exergónico: ΔG < 0' }],
      elements: [{ id: 'two', text: 'Disminuye la entalpía', correctTargetId: 'even' }, { id: 'four', text: 'Libera calor a presión constante', correctTargetId: 'even' }, { id: 'one', text: 'Disminuye la energía libre de Gibbs', correctTargetId: 'odd' }, { id: 'three', text: 'Se caracteriza por ΔG negativo', correctTargetId: 'odd' }],
      explanation: 'ΔH corresponde a entalpía y ΔG a energía libre; se distinguen los dos conceptos.'
    }
  },
  { id: 'E', label: 'núcleo delimitado por membrana', format: 'single_select', subject: subjects.biology, question: correctCell }
];

async function installJudgeFixture(page) {
  await page.evaluate(({ metrics, criteria, cases }) => {
    const state = window.__judgeFixture = { metrics, criteria, cases, calls: [], forbidden: 0, reply: null };
    window.callAI = async (messages, options) => {
      state.calls.push({ messages: structuredClone(messages), options: structuredClone(options) });
      return typeof state.reply === 'string' ? state.reply : JSON.stringify(state.reply);
    };
    window.fetch = () => { state.forbidden++; throw new Error('La suite Judge no permite solicitudes de red.'); };
    state.slot = (format, subject = 'EXCOBA Medicina · Biología') => NOA_SOURCE_BLUEPRINT.build({
      subject, count: 5, supportedInteractionTypes: [format]
    }).slots[0];
    state.judge = (format, question, slot) => ({
      single_select: NOA_BLUEPRINT_GENERATOR.judgeItem,
      drag_classify: NOA_DRAG_CLASSIFY.judge,
      inline_select: NOA_INLINE_SELECT.judge,
      drag_order: NOA_DRAG_ORDER.judge
    })[format](question, slot);
  }, { metrics, criteria, cases });
}

async function judgeQuestion(page, format, question, response, subject) {
  return page.evaluate(async ({ format, question, response, subject }) => {
    const slot = __judgeFixture.slot(format, subject);
    __judgeFixture.reply = response;
    return __judgeFixture.judge(format, { ...question, slotId: slot.slotId, blueprintSlot: slot }, slot);
  }, { format, question, response, subject });
}

async function installPipelineAI(page) {
  await page.evaluate(({ metrics, criteria, correctCell }) => {
    const clone = value => structuredClone(value);
    const state = window.__pipelineAI = { calls: [], forbidden: 0, generated: 0, judged: 0 };
    const math = {
      single_select: { question: '¿Cuánto es 2 + 2?', options: ['4', '5', '6', '7'], correct: 0, explanation: 'Sumar dos y dos da cuatro.' },
      drag_classify: { instruction: 'Clasifica por paridad.', stem: 'Números enteros.', targets: [{ id: 'even', label: 'Par' }, { id: 'odd', label: 'Impar' }], elements: [{ id: 'two', text: '2', correctTargetId: 'even' }, { id: 'four', text: '4', correctTargetId: 'even' }, { id: 'one', text: '1', correctTargetId: 'odd' }, { id: 'three', text: '3', correctTargetId: 'odd' }], explanation: 'Los pares son divisibles entre dos.' },
      inline_select: { instruction: 'Completa las sumas.', text: '1 + 1 = [[b1]]; 2 + 2 = [[b2]].', blanks: [{ id: 'b1', options: ['2', '3'], correct: 0 }, { id: 'b2', options: ['4', '5'], correct: 0 }], explanation: 'Las sumas dan dos y cuatro.' },
      drag_order: { instruction: 'Ordena de menor a mayor.', stem: 'Números enteros distintos.', items: [{ id: 'one', text: '1' }, { id: 'two', text: '2' }, { id: 'three', text: '3' }], correctOrder: ['one', 'two', 'three'], explanation: 'Uno es menor que dos y dos menor que tres.' }
    };
    const biology = {
      single_select: { question: correctCell.text, options: correctCell.options, correct: 0, explanation: correctCell.explain },
      drag_classify: { instruction: 'Clasifica según el tipo celular habitual de cada ejemplo.', stem: 'Tipos de células.', targets: [{ id: 'even', label: 'Procariota' }, { id: 'odd', label: 'Eucariota' }], elements: [{ id: 'two', text: 'Bacteria Escherichia coli', correctTargetId: 'even' }, { id: 'four', text: 'Arquea metanógena', correctTargetId: 'even' }, { id: 'one', text: 'Célula de una raíz vegetal', correctTargetId: 'odd' }, { id: 'three', text: 'Neurona de mamífero', correctTargetId: 'odd' }], explanation: 'Bacterias y arqueas son procariotas; las células vegetal y animal citadas son eucariotas.' },
      inline_select: { instruction: 'Completa las funciones de estructuras celulares.', text: 'El núcleo eucariota está delimitado por [[b1]]; los ribosomas participan en [[b2]].', blanks: [{ id: 'b1', options: ['membrana', 'pared de peptidoglucano'], correct: 0 }, { id: 'b2', options: ['síntesis de proteínas', 'síntesis de ADN'], correct: 0 }], explanation: 'La envoltura nuclear es membranosa y los ribosomas realizan la traducción.' },
      drag_order: { instruction: 'Ordena estos eventos de expresión de un gen nuclear eucariota.', stem: 'La formación del polipéptido está incluida en traducción.', items: [{ id: 'one', text: 'Transcripción a pre-ARNm' }, { id: 'two', text: 'Maduración del ARNm' }, { id: 'three', text: 'Traducción del ARNm y formación del polipéptido' }], correctOrder: ['one', 'two', 'three'], explanation: 'El transcrito nuclear se procesa antes de traducirse.' }
    };
    const spanish = {
      single_select: { question: 'En «La célula crece», ¿cuál es el núcleo del sujeto?', options: ['célula', 'crece', 'la', 'La célula crece'], correct: 0, explanation: 'El sustantivo célula es el núcleo del sujeto.' },
      drag_classify: { instruction: 'Clasifica cada palabra aislada según su categoría en los ejemplos propuestos.', stem: 'Sustantivos y verbos.', targets: [{ id: 'even', label: 'Sustantivo' }, { id: 'odd', label: 'Verbo' }], elements: [{ id: 'two', text: 'célula', correctTargetId: 'even' }, { id: 'four', text: 'tejido', correctTargetId: 'even' }, { id: 'one', text: 'observa', correctTargetId: 'odd' }, { id: 'three', text: 'crece', correctTargetId: 'odd' }], explanation: 'Célula y tejido nombran entidades; observa y crece expresan acciones o procesos.' },
      inline_select: { instruction: 'Completa el análisis de «La célula crece».', text: 'El núcleo del sujeto es [[b1]] y «crece» es un [[b2]].', blanks: [{ id: 'b1', options: ['célula', 'crece'], correct: 0 }, { id: 'b2', options: ['verbo', 'sustantivo'], correct: 0 }], explanation: 'Célula es el sustantivo del sujeto y crece es el verbo.' },
      drag_order: { instruction: 'Ordena para formar una oración declarativa con artículo, sujeto y verbo.', stem: 'Orden solicitado: artículo → sustantivo → verbo.', items: [{ id: 'one', text: 'El' }, { id: 'two', text: 'estudiante' }, { id: 'three', text: 'lee' }], correctOrder: ['one', 'two', 'three'], explanation: 'El estudiante lee sigue el orden indicado.' }
    };
    const social = {
      single_select: { question: '¿En qué año se promulgó la Constitución mexicana actualmente vigente?', options: ['1917', '1810', '1857', '1921'], correct: 0, explanation: 'La Constitución Política de los Estados Unidos Mexicanos fue promulgada en 1917.' },
      drag_classify: { instruction: 'Clasifica las funciones generales de los poderes federales mexicanos.', stem: 'División de poderes.', targets: [{ id: 'even', label: 'Legislativo' }, { id: 'odd', label: 'Ejecutivo' }], elements: [{ id: 'two', text: 'Discutir proyectos de ley en el Congreso', correctTargetId: 'even' }, { id: 'four', text: 'Aprobar leyes en el Congreso', correctTargetId: 'even' }, { id: 'one', text: 'Promulgar las leyes aprobadas', correctTargetId: 'odd' }, { id: 'three', text: 'Ejecutar políticas públicas federales', correctTargetId: 'odd' }], explanation: 'Legislar corresponde al Congreso; promulgar y ejecutar corresponde al Ejecutivo.' },
      inline_select: { instruction: 'Completa datos del constitucionalismo mexicano.', text: 'La Constitución vigente se promulgó en [[b1]]; los poderes federales se dividen en [[b2]].', blanks: [{ id: 'b1', options: ['1917', '1921'], correct: 0 }, { id: 'b2', options: ['Ejecutivo, Legislativo y Judicial', 'Municipal y Electoral solamente'], correct: 0 }], explanation: 'La Constitución de 1917 establece la división tripartita del poder federal.' },
      drag_order: { instruction: 'Ordena cronológicamente los acontecimientos de México.', stem: 'Historia del siglo XX.', items: [{ id: 'one', text: 'Inicio de la Revolución mexicana' }, { id: 'two', text: 'Promulgación de la Constitución de 1917' }, { id: 'three', text: 'Creación de la Secretaría de Educación Pública en 1921' }], correctOrder: ['one', 'two', 'three'], explanation: 'Los acontecimientos corresponden a 1910, 1917 y 1921.' }
    };
    const chemistry = {
      single_select: { question: 'Si un proceso tiene ΔH < 0, ¿qué conclusión se justifica solo con ese dato?', options: ['Es exotérmico; no basta para determinar el signo de ΔG', 'Es siempre exergónico', 'ΔG es necesariamente cero', 'La entropía siempre aumenta'], correct: 0, explanation: 'Exotérmico alude a ΔH; ΔG también depende de la entropía y la temperatura.' },
      drag_classify: { instruction: 'Clasifica la magnitud termodinámica mencionada, sin equiparar exotérmico y exergónico.', stem: 'ΔH y ΔG son magnitudes distintas.', targets: [{ id: 'even', label: 'Entalpía: ΔH' }, { id: 'odd', label: 'Energía libre de Gibbs: ΔG' }], elements: [{ id: 'two', text: 'Su signo negativo caracteriza un proceso exotérmico', correctTargetId: 'even' }, { id: 'four', text: 'Cambio de calor a presión constante', correctTargetId: 'even' }, { id: 'one', text: 'Su signo negativo caracteriza un proceso exergónico', correctTargetId: 'odd' }, { id: 'three', text: 'Se calcula como ΔH − TΔS a temperatura constante', correctTargetId: 'odd' }], explanation: 'El signo de ΔH indica el carácter térmico; el de ΔG, el carácter exergónico o endergónico.' },
      inline_select: { instruction: 'Distingue criterios termodinámicos.', text: 'Exotérmico se asocia con [[b1]], mientras que exergónico se asocia con [[b2]].', blanks: [{ id: 'b1', options: ['ΔH < 0', 'ΔG < 0'], correct: 0 }, { id: 'b2', options: ['ΔG < 0', 'ΔH < 0'], correct: 0 }], explanation: 'Los conceptos no son sinónimos, aunque pueden coincidir en un proceso.' },
      drag_order: { instruction: 'Ordena los elementos por número atómico creciente.', stem: 'Primeros elementos químicos.', items: [{ id: 'one', text: 'Hidrógeno' }, { id: 'two', text: 'Helio' }, { id: 'three', text: 'Litio' }], correctOrder: ['one', 'two', 'three'], explanation: 'Sus números atómicos son 1, 2 y 3.' }
    };
    const stats = clone(math);
    stats.single_select = { question: '¿Cuál es la media aritmética de 2, 4 y 6?', options: ['4', '6', '12', '2'], correct: 0, explanation: '(2 + 4 + 6) / 3 = 4.' };
    window.callAI = async (messages, options) => {
      const system = messages[0].content, prompt = messages[1].content;
      const isJudge = system.includes('Judge');
      const format = isJudge ? (prompt.includes('"sequence_validity"') ? 'drag_order' : prompt.includes('"blank_quality"') ? 'inline_select' : prompt.includes('"classification_quality"') ? 'drag_classify' : 'single_select')
        : system.includes('Drag Order Generator') ? 'drag_order' : system.includes('Inline Select Generator') ? 'inline_select' : system.includes('Drag Generator') ? 'drag_classify' : 'single_select';
      state.calls.push({ kind: isJudge ? 'judge' : 'generator', format, messages: clone(messages), options: clone(options) });
      if (isJudge) {
        state.judged++;
        return JSON.stringify({ ...Object.fromEntries(metrics[format].map(key => [key, 9.2])), academic_review: Object.fromEntries(criteria.map(key => [key, { status: key === 'non_overlap' && ['single_select', 'inline_select'].includes(format) ? 'not_applicable' : 'pass', reason: 'Revisión sintética positiva para comprobar el contrato del software.' }])), critical_issues: [], comments: 'Modelo simulado: no certifica calidad científica real.' });
      }
      const subject = prompt.match(/MATERIA:\s*([^\n]+)/)?.[1] || '';
      const catalogue = subject.includes('Español') ? spanish : subject.includes('sociales') ? social : subject.includes('Química') ? chemistry : subject.includes('estadística') ? stats : subject.includes('Matemáticas') ? math : biology;
      const question = clone(catalogue[format]);
      const variant = ` Caso sintético ${++state.generated}.`;
      for (const key of ['question', 'text', 'stem', 'instruction']) if (question[key]) question[key] += variant;
      question.syllabus_code = '';
      return JSON.stringify(question);
    };
    window.fetch = () => { state.forbidden++; throw new Error('No se permiten solicitudes de IA reales.'); };
  }, { metrics, criteria, correctCell });
}

module.exports = { metrics, criteria, formats, cases, correctCell, review, installJudgeFixture, judgeQuestion, installPipelineAI };
