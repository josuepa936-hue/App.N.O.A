/* =========================================================
   NOA EXCOBA RESULTS ENGINE v23

   Presentación del crédito sin alterar la puntuación interna.
   La ruta existente finaliza y guarda una vez por examAnswers.
   Los siguientes renders reutilizan el resultado presentado.
   ========================================================= */

(() => {
  const VERSION = '23.0';
  const completedExams = new WeakMap();

  if(!window.NOA_ANSWER_REVISION || !window.NOA_MIXED_EXAM){
    throw new Error('v23 necesita Answer Revision v22 y Mixed Exam');
  }

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[char]));
  }

  function formatScore(value){
    const number = Number(value);
    return Number.isFinite(number)
      ? String(Number(number.toFixed(2)))
      : '0';
  }

  function creditFor(answer){
    return typeof answer.scoreFraction === 'number' && Number.isFinite(answer.scoreFraction)
      ? answer.scoreFraction
      : answer.ok ? 1 : 0;
  }

  function percent(credit, total = 1){
    return total ? Math.round(credit / total * 100) : 0;
  }

  function statusFor(answer){
    const credit = creditFor(answer);
    if(credit === 1) return '✓ Correcta';
    if(credit > 0 && credit < 1) return '◐ Parcial';
    return '✕ Incorrecta';
  }

  function difficultyCredits(answers){
    const levels = new Map();
    for(const answer of answers){
      const level = String(answer.blueprint?.difficulty ?? 'sin_nivel');
      if(!levels.has(level)){
        levels.set(level, {correct:0, credit:0, total:0});
      }
      const stats = levels.get(level);
      const credit = creditFor(answer);
      stats.credit += credit;
      stats.total++;
      if(credit === 1) stats.correct++;
    }
    return levels;
  }

  function optionText(answer, index, fallback){
    if(!Number.isInteger(index) || !Array.isArray(answer.options) ||
      index < 0 || index >= answer.options.length){
      return fallback;
    }
    return `${String.fromCharCode(65 + index)}) ${answer.options[index]}`;
  }

  function answerDetail(answer, type){
    if(type === 'single_select'){
      return `Tu respuesta: <b>${esc(optionText(
        answer, answer.selected, 'Sin respuesta registrada'
      ))}</b><br>Respuesta correcta: <b>${esc(optionText(
        answer, answer.correctIndex, 'No registrada'
      ))}</b>`;
    }

    const labels = {
      drag_classify:'componentes',
      inline_select:'espacios',
      drag_order:'relaciones correctas'
    };
    const hasComponents = Number.isFinite(answer.correctComponents) &&
      Number.isFinite(answer.totalComponents) && answer.totalComponents > 0;
    const components = hasComponents && labels[type]
      ? `${formatScore(answer.correctComponents)}/${formatScore(answer.totalComponents)} ${labels[type]} · `
      : '';
    const exact = type === 'drag_order' && answer.exact === true
      ? '<br>Orden completamente correcto.'
      : '';
    return `Crédito: ${components}${percent(creditFor(answer))}%${exact}`;
  }

  function presentResults(box){
    const heading = box.querySelector(':scope > h2');
    const percentage = box.querySelector(':scope > .stat .n');
    if(heading){
      heading.textContent = `Resultado: ${formatScore(examScore)} / ${examQueue.length}`;
    }
    if(percentage){
      percentage.textContent = `${percent(examScore, examQueue.length)}%`;
    }

    // Conservar las tarjetas existentes: Blueprint, Judge y explicación.
    const lists = box.querySelectorAll(':scope > .list');
    if(lists[0]){
      lists[0].innerHTML = [...difficultyCredits(examAnswers)]
        .sort((a,b) => Number(a[0]) - Number(b[0]))
        .map(([level, stats]) => `
          <div class="item">
            <b>Nivel ${esc(level)}</b>
            <div>${formatScore(stats.credit)} / ${stats.total} créditos · ${percent(stats.credit, stats.total)}%</div>
          </div>
        `).join('') || '<div class="muted">Sin datos de dificultad.</div>';
    }

    const questions = new Map(examQueue.map(question => [String(question.id), question]));
    const cards = lists[1]?.querySelectorAll(':scope > .item') || [];
    cards.forEach((card, index) => {
      const answer = examAnswers[index];
      if(!answer) return;
      const question = questions.get(String(answer.questionId));
      const type = answer.interactionType || question?.interactionType || 'single_select';
      const badge = card.querySelector('.badge');
      const detail = card.querySelector('.small');
      if(badge) badge.textContent = statusFor(answer);
      if(detail) detail.innerHTML = answerDetail(answer, type);
      if(type === 'inline_select'){
        const stem = card.querySelector(':scope > p');
        if(stem) stem.textContent = String(answer.question || '').replace(/\[\[[^\]]+\]\]/g, '_____');
      }
      card.dataset.noaResultType = type;
    });
    box.dataset.noaResultsEngine = VERSION;
  }

  const previousRenderExam = window.renderExam;
  window.renderExam = function(...args){
    const box = document.getElementById('examBox');
    if(!box || !examQueue.length || examIndex < examQueue.length){
      return previousRenderExam.apply(this, args);
    }

    const completed = completedExams.get(examAnswers);
    if(completed){
      box.innerHTML = completed.html;
      box.dataset.noaResultsEngine = VERSION;
      return;
    }

    // v13 termina el modo mixto; el núcleo guarda el intento.
    // Guardar el HTML por identidad de sesión evita repetir esa ruta.
    const sessionAnswers = examAnswers;
    const result = previousRenderExam.apply(this, args);
    const completedResult = {html:box.innerHTML};
    completedExams.set(sessionAnswers, completedResult);
    presentResults(box);
    completedResult.html = box.innerHTML;
    return result;
  };

  const previousRenderExamStats = window.renderExamStats;
  window.renderExamStats = function(...args){
    const result = previousRenderExamStats.apply(this, args);
    const history = document.getElementById('examStats');
    if(!history) return result;
    const attempts = db.attempts.slice(-5).reverse();
    const cards = [...history.children];
    attempts.forEach((attempt, index) => {
      const card = cards[index];
      if(!card) return;
      const date = card.querySelector('.small');
      card.innerHTML = `<b>${esc(attempt.pct)}%</b> · ${formatScore(attempt.score)}/${esc(attempt.total)}`;
      if(date) card.appendChild(date);
    });
    return result;
  };

  window.NOA_RESULTS_ENGINE = {
    version:VERSION,
    formatScore,
    creditFor,
    difficultyCredits
  };

  window.renderExamStats();
  console.log('NOA EXCOBA Results Engine v23 ✓');
})();
