/* NOA Course-Only Addon v1
 * Optional source-scope overlay. Does NOT alter db.courseSources, the analyzer,
 * the official syllabus, or the question bank.
 * Activate explicitly on individual analyzed course sources.
 */
(() => {
  'use strict';
  if (window.NOA_COURSE_ONLY_ADDON_V1) return;
  const engine = window.NOA_SOURCE_ENGINE;
  if (!engine || typeof engine.getCourseSources !== 'function') return;

  const originalGetSources = engine.getCourseSources.bind(engine);
  const key = 'NOA_COURSE_ONLY_ADDON_V1:' + new URL('./', document.baseURI).pathname;

  function read() {
    try {
      const ids = JSON.parse(localStorage.getItem(key) || '[]');
      return new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && id.length) : []);
    } catch { return new Set(); }
  }
  let marked = read();

  function sourceExists(id) {
    return originalGetSources('').some(s => s && s.id === id);
  }
  function isMarked(id) { return typeof id === 'string' && marked.has(id); }
  function setMarked(id, enabled) {
    if (typeof id !== 'string' || !id || typeof enabled !== 'boolean' || !sourceExists(id)) {
      return {ok:false, error:'invalid_source'};
    }
    const next = new Set(marked);
    if (enabled) next.add(id);
    else next.delete(id);
    try { localStorage.setItem(key, JSON.stringify([...next])); }
    catch { return {ok:false, error:'storage_unavailable'}; }
    marked = next;
    scheduleSync();
    return {ok:true, enabled:isMarked(id)};
  }
  function effectiveSource(source) {
    if (!source || !isMarked(source.id) || source.analysisStatus !== 'ready' || !source.analysis) return source;
    const analysis = source.analysis;
    // An immutable copy is consumed by Source Blueprint v8. Original analysis is preserved.
    return {
      ...source,
      analysis: {
        ...analysis,
        overall_classification: 'course_only',
        syllabus_links: [],
        concepts: Array.isArray(analysis.concepts)
          ? analysis.concepts.map(concept => ({...concept, classification:'course_only', syllabus_codes:[]}))
          : []
      }
    };
  }
  // Blueprint uses this API. The original analyzer and its saved result stay unchanged.
  engine.getCourseSources = function(subject) {
    return originalGetSources(subject).map(effectiveSource);
  };

  function updateLine(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }
  function sync() {
    const list = document.getElementById('noaCourseSourcesList');
    if (!list) return;
    for (const trigger of list.querySelectorAll('[data-analyze-course]')) {
      const id = trigger.getAttribute('data-analyze-course');
      const source = originalGetSources('').find(s => s && s.id === id);
      const card = trigger.closest('.item');
      if (!source || !card) continue;
      let controls = card.querySelector('[data-noa-course-only-addon]');
      if (!controls) {
        controls = document.createElement('div');
        controls.setAttribute('data-noa-course-only-addon', '');
        controls.style.marginTop = '10px';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn';
        button.setAttribute('data-noa-course-only-toggle', id);
        const note = document.createElement('div');
        note.className = 'small';
        note.style.marginTop = '6px';
        note.setAttribute('data-noa-course-only-note', '');
        controls.append(button, note);
        card.appendChild(controls);
      }
      const button = controls.querySelector('[data-noa-course-only-toggle]');
      const note = controls.querySelector('[data-noa-course-only-note]');
      const active = isMarked(id);
      updateLine(button, active ? 'Quitar protección complementaria' : 'Usar solo como material complementario');
      updateLine(note, active
        ? 'Alcance efectivo para generar: course_only, sin códigos oficiales. El análisis original y sus datos no se modifican.'
        : 'Opcional: excluye enlaces curriculares no verificados al generar con el perfil Curso + EXCOBA.');
      button.disabled = source.analysisStatus !== 'ready' || !source.analysis;
    }
  }
  let scheduled = false;
  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(() => { scheduled = false; sync(); });
  }
  function installUI() {
    const list = document.getElementById('noaCourseSourcesList');
    if (!list) return;
    list.addEventListener('click', event => {
      const button = event.target.closest('[data-noa-course-only-toggle]');
      if (!button || !list.contains(button)) return;
      const id = button.getAttribute('data-noa-course-only-toggle');
      const result = setMarked(id, !isMarked(id));
      if (!result.ok && typeof window.toast === 'function') window.toast('No se pudo guardar la protección complementaria.');
    });
    new MutationObserver(scheduleSync).observe(list, {childList:true, subtree:true});
    scheduleSync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installUI, {once:true});
  else installUI();

  window.NOA_COURSE_ONLY_ADDON_V1 = Object.freeze({version:'1.0.0', isMarked, setMarked,
    preview(subject) { return engine.getCourseSources(subject).map(source => ({
      id: source.id, title: source.title, effectiveClassification:source.analysis?.overall_classification || null,
      syllabusCodes:[...(source.analysis?.syllabus_links || []).map(link => link.code)],
      protected: isMarked(source.id)
    })); }
  });
})();
