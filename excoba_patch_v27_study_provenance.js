/* v27.3B phase 1: explicit session provenance, never inferred from content. */
(() => {
  'use strict';
  const sessions = new WeakMap();
  const kinds = ['student','technical_test','unknown'];
  const own = (value,key) => value != null && Object.prototype.hasOwnProperty.call(value,key);
  const technical = value => value?.technicalTest === true || value?.evidenceKind === 'technical_test';

  function kind(value){
    if(technical(value) || [value?.answers,value?.queue].some(items =>
      Array.isArray(items) && items.some(technical))) return 'technical_test';
    return value?.evidenceKind === 'student' ? 'student' : 'unknown';
  }

  function capture(answers,queue){
    const previous = sessions.get(answers) || 'unknown';
    const resolved = kind({evidenceKind:previous,answers,queue});
    // A technical veto is monotonic for this answers array, including retries.
    sessions.set(answers,resolved);
    return {evidenceKind:resolved,...(resolved === 'technical_test' ? {technicalTest:true} : {})};
  }

  function begin(answers,queue){
    if(sessions.has(answers)) return capture(answers,queue);
    const recovering = window.NOA_EXAM_RECOVERY?.state?.().recovering;
    const input = document.getElementById('noaExamEvidenceKind');
    const declared = !recovering && kinds.includes(input?.value) ? input.value : 'unknown';
    sessions.set(answers,declared);
    // The declaration applies once, after the new queue has been accepted.
    if(!recovering && input) input.value = 'unknown';
    return capture(answers,queue);
  }

  function restore(answers,snapshot,queue){
    if(!window.NOA_EXAM_RECOVERY?.state?.().recovering) return capture(answers,queue);
    const previous = capture(answers,queue);
    sessions.set(answers,previous.evidenceKind === 'technical_test' ? 'technical_test' : kind(snapshot));
    return capture(answers,queue);
  }

  function valid(value){
    return (!own(value,'evidenceKind') || kinds.includes(value.evidenceKind)) &&
      (!own(value,'technicalTest') || typeof value.technicalTest === 'boolean');
  }

  window.NOA_STUDY_PROVENANCE_V27 = Object.freeze({version:'1',kind,begin,capture,restore,valid});
})();
