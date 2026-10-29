/* NOA v24, etapa 1: interfaz visual. La generación aún no está habilitada. */
(() => {
  const preparation = 'Integración en preparación. La generación con IA aún no está disponible.';
  const element = id => document.getElementById(id);

  function refresh(){
    const card = element('noaGeneratorCard');
    if(!card) return;
    const select = element('noaGeneratorSubject');
    try{
      const syllabus = window.NOA_EXCOBA_V4;
      const available = (syllabus?.subjects || [])
        .filter(subject => syllabus.itemsFor(subject.value).length > 0);
      const signature = JSON.stringify(available.map(subject => [subject.value, subject.label]));
      if(select.dataset.subjects !== signature){
        const previous = select.value;
        const options = available.length
          ? available.map(subject => new Option(subject.label, subject.value))
          : [new Option('Sin materias del Temario Maestro disponibles', '')];
        select.replaceChildren(...options);
        if(available.some(subject => subject.value === previous)) select.value = previous;
        select.dataset.subjects = signature;
      }
      select.disabled = !available.length;
      const profile = window.NOA_SOURCE_ENGINE?.getProfile?.();
      element('noaGeneratorProfile').textContent = profile
        ? `Perfil activo: ${profile.label}.`
        : 'Perfil de entrenamiento no disponible.';
      const calibration = window.NOA_SOURCE_BLUEPRINT?.calibrationState?.();
      element('noaGeneratorCalibration').textContent = calibration
        ? calibration.adaptive
          ? `Calibrator adaptativo · ${calibration.calibration.sample} respuestas de referencia.`
          : 'Calibrator: ciclo inicial de dificultad.'
        : 'Estado del Calibrator no disponible.';
      element('noaGeneratorStatus').textContent = preparation + (available.length
        ? '' : ' Carga el Temario Maestro EXCOBA en Biblioteca para ver sus materias.');
    }catch(error){
      element('noaGeneratorStatus').textContent = `${preparation} No se pudieron actualizar los datos: ${error?.message || 'motor no disponible'}.`;
    }finally{
      element('noaGeneratorGenerate').disabled = true;
    }
  }

  function init(){
    const exam = element('exam');
    if(!exam || element('noaGeneratorCard')) return;
    const style = document.createElement('style');
    style.textContent = `
      #noaGeneratorCard{margin-bottom:16px;min-width:0}
      #noaGeneratorCard .noa-generator-fields{display:flex;flex-wrap:wrap;gap:12px}
      #noaGeneratorCard .field{min-width:0;flex:1 1 240px}
      #noaGeneratorCard select{width:100%;min-width:0;max-width:100%}
      #noaGeneratorCard .btn:disabled{cursor:not-allowed;opacity:.6}
      #noaGeneratorStatus{overflow-wrap:anywhere}
    `;
    document.head.appendChild(style);
    const card = document.createElement('div');
    card.id = 'noaGeneratorCard';
    card.className = 'card';
    card.setAttribute('aria-labelledby', 'noaGeneratorTitle');
    card.innerHTML = `
      <h2 id="noaGeneratorTitle">Generador inteligente NOA</h2>
      <div class="noa-generator-fields">
        <div class="field">
          <label for="noaGeneratorSubject">Materia del Temario Maestro EXCOBA</label>
          <select id="noaGeneratorSubject"></select>
        </div>
        <div class="field">
          <label for="noaGeneratorCount">Cantidad de preguntas</label>
          <select id="noaGeneratorCount"><option value="5">5</option><option value="10">10</option></select>
        </div>
      </div>
      <p class="small" id="noaGeneratorProfile"></p>
      <p class="small" id="noaGeneratorCalibration"></p>
      <p class="small" id="noaGeneratorStatus" role="status" aria-live="polite"></p>
      <button class="btn primary" id="noaGeneratorGenerate" type="button" disabled aria-describedby="noaGeneratorStatus">Generar con IA</button>
    `;
    exam.prepend(card);

    const previousRenderAll = window.renderAll;
    window.renderAll = function(...args){
      const result = previousRenderAll.apply(this, args);
      refresh();
      return result;
    };
    document.addEventListener('change', event => {
      if(event.target.id === 'excobaTrainingProfile') refresh();
    });
    document.addEventListener('click', event => {
      if(event.target.closest('#nav button[data-page="exam"]')) refresh();
    });
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.NOA_GENERATOR_UI = {version:'24.1-ui', refresh};
    refresh();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  }else{
    init();
  }
})();
