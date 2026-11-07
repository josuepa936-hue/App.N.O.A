/* NOA v27 phase 1: pure projections, never scoring or persistence. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.NOA_RESULTS_NORMALIZATION_V27 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  const VERSION = '27.1';
  const own = (value, key) => value != null && Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const date = value => text(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  const types = ['single_select','drag_classify','inline_select','drag_order'];
  const sectionLabels = {primary:'Primaria',secondary:'Secundaria',medicine:'Especialidad Medicina'};
  const field = (value = null, state = 'absent', sources = []) => ({value,state,sources});
  const read = (value, key, path, valid = text) => !own(value,key) ? field()
    : value[key] == null ? field(null,'unknown',[path])
      : valid(value[key]) ? field(typeof value[key] === 'string' ? value[key].trim() : value[key],'known',[path])
        : field(null,'invalid',[path]);
  function combine(fields){
    const present = fields.filter(item => item.state !== 'absent');
    const known = present.filter(item => item.state === 'known');
    const sources = present.flatMap(item => item.sources);
    if(new Set(known.map(item => item.value)).size > 1) return field(null,'conflict',sources);
    if(present.some(item => item.state === 'invalid' || item.state === 'conflict')) return field(null,'invalid',sources);
    return known.length ? field(known[0].value,'known',sources)
      : present.length ? field(null,'unknown',sources) : field();
  }
  function academic(answer, catalog){
    const subjects = Array.isArray(catalog?.subjects) ? catalog.subjects : [];
    const items = Array.isArray(catalog?.items) ? catalog.items : [];
    const definitions = new Map();
    for(const entry of subjects){
      if(text(entry?.value)){
        const existing = definitions.get(entry.value);
        definitions.set(entry.value, existing === undefined ? entry : null);
      }
    }
    const codes = new Map();
    for(const item of items){
      if(text(item?.code)){
        const existing = codes.get(item.code);
        codes.set(item.code, existing === undefined ? item : null);
      }
    }
    const slot = object(answer.blueprintSlot) ? answer.blueprintSlot : {};
    const blueprint = object(answer.blueprint) ? answer.blueprint : {};
    const candidates = new Set(), codeSources = [], issues = [];
    let invalidCodes = false, codePresence = 'absent';
    function addCodes(source,key,path,array){
      if(!own(source,key)) return;
      codeSources.push(path); codePresence = 'unknown';
      if(source[key] == null || source[key] === '') return;
      const values = array ? source[key] : [source[key]];
      if(!Array.isArray(values)){invalidCodes = true; return;}
      for(const code of values){
        if(!text(code)){invalidCodes = true;continue;}
        candidates.add(code.trim().replace(/\.$/,''));
      }
    }
    addCodes(answer,'syllabusCode','answer.syllabusCode',false);
    addCodes(answer,'syllabusCodes','answer.syllabusCodes',true);
    addCodes(slot,'syllabusCodes','answer.blueprintSlot.syllabusCodes',true);
    addCodes(blueprint,'syllabusCodes','answer.blueprint.syllabusCodes',true);
    const validCodes = [...candidates].filter(code => codes.get(code) && definitions.get(codes.get(code).subject)).sort();
    if(validCodes.length !== candidates.size) invalidCodes = true;
    if(invalidCodes) issues.push('invalid_or_unverifiable_syllabus_code');
    const stated = [read(answer,'subject','answer.subject'),read(slot,'subject','answer.blueprintSlot.subject')];
    const catalogued = stated.map(item => item.state === 'known' && !definitions.get(item.value)
      ? field(null,'invalid',item.sources) : item);
    const inferred = validCodes.map(code => field(codes.get(code).subject,'known',codeSources));
    let subject = combine([...catalogued,...inferred]);
    const definition = subject.state === 'known' ? definitions.get(subject.value) : null;
    let section = field();
    if(definition){
      const sections = new Set((definition.prefixes || []).map(prefix => ({1:'primary',2:'secondary',3:'medicine'})[String(prefix).split('.')[0]]).filter(Boolean));
      if(sections.size === 1) section = field([...sections][0],'known',['catalog.subjects.prefixes']);
    }
    const statedSection = read(answer,'groupId','answer.groupId',value => own(sectionLabels,value));
    if(statedSection.state === 'invalid' || statedSection.state === 'known' && section.state === 'known' && statedSection.value !== section.value){
      issues.push('section_conflict');
      section = field(null,'conflict',statedSection.sources.concat(section.sources));
    }
    if(section.state === 'absent' && statedSection.state === 'known') section = statedSection;
    // A section alone is not sufficient evidence for a subject or subtopic.
    const subtopic = !candidates.size && !invalidCodes ? field(null,codePresence,codeSources)
      : invalidCodes ? field(null,'invalid',codeSources)
        : validCodes.length !== 1 ? field(null,'unknown',codeSources)
          : subject.state !== 'known' ? field(null,'conflict',codeSources)
            : field(validCodes[0],'known',codeSources);
    if(candidates.size > 1) issues.push('multiple_subtopics_no_credit_allocation');
    if(subject.state === 'conflict' || subject.state === 'invalid') issues.push('unclassified_subject');
    return {section,subject,subtopic,subtopicCandidates:validCodes,
      labels:{section:sectionLabels[section.value] || 'Sin clasificar',
        subject:subject.value || 'Sin clasificar',subtopic:subtopic.value ? (text(codes.get(subtopic.value).title) ? codes.get(subtopic.value).title : subtopic.value) : 'Sin clasificar'},issues};
  }
  function record(answer, attempt, index, options){
    const issues = [], a = object(answer) ? answer : {};
    if(!object(answer)) issues.push('invalid_answer');
    const attemptId = read(attempt,'id','attempt.id');
    const questionId = read(a,'questionId','answer.questionId');
    const planSlotId = read(a,'planSlotId','answer.planSlotId');
    const format = read(a,'interactionType','answer.interactionType',value => types.includes(value));
    const omitted = read(a,'omitted','answer.omitted',value => typeof value === 'boolean');
    let credit = read(a,'scoreFraction','answer.scoreFraction',value => number(value) && value >= 0 && value <= 1);
    const ok = read(a,'ok','answer.ok',value => typeof value === 'boolean');
    if(omitted.value === true){
      if(credit.state === 'known' && credit.value !== 0 || ok.value === true) issues.push('omission_overrides_conflicting_credit');
      credit = field(0,'known',['answer.omitted']);
    }else if(credit.state === 'absent' && ok.state === 'known'){
      credit = field(ok.value ? 1 : 0,'known',['answer.ok']);
    }
    if(omitted.state === 'invalid') credit = field(null,'invalid',['answer.omitted']);
    const status = omitted.value === true ? 'omitted' : credit.state !== 'known' || omitted.state === 'unknown' ? 'unknown'
      : credit.value === 1 ? 'correct' : credit.value === 0 ? 'incorrect' : 'partial';
    if(omitted.value !== true && credit.state === 'known' && ok.state === 'known' && ok.value !== (credit.value === 1)) issues.push('credit_ok_disagreement');
    const classification = academic(a,options.catalog);
    const technical = options.evidenceKind === 'technical_test' || attempt.evidenceKind === 'technical_test' ||
      a.evidenceKind === 'technical_test' || attempt.technicalTest === true || a.technicalTest === true;
    const evidenceKind = technical ? 'technical_test' : options.evidenceKind === 'student' ? 'student' : 'unknown';
    const validReason = value => ['manual','timeout'].includes(value);
    const finishReason = combine([read(attempt,'finishReason','attempt.finishReason',validReason),read(attempt.timing,'finishReason','attempt.timing.finishReason',validReason)]);
    const presented = read(a,'presented','answer.presented',value => typeof value === 'boolean');
    const identity = questionId.value || planSlotId.value;
    return {contractVersion:VERSION,attemptId,questionId,planSlotId,topicId:read(a,'topicId','answer.topicId'),sourceIndexes:[index],
      key:attemptId.state === 'known' && identity ? JSON.stringify([attemptId.value,questionId.value ? 'question' : 'slot',identity]) : null,
      at:read(attempt,'at','attempt.at',date),
      classification,format,status,credit,maxCredit:field(1,'known',['contract.NOA_unit_credit']),
      finishReason,omissionReason:read(a,'omissionReason','answer.omissionReason'),omitted,
      exposure:{countsAsExposure:status === 'unknown' ? null : true,presented},
      evidenceKind,domainEligible:evidenceKind === 'student' && ['correct','partial','incorrect'].includes(status),
      knowledgeError:evidenceKind === 'student' && status !== 'unknown' ? status === 'incorrect' : null,
      allocations:classification.subtopic.state === 'known' ? [{subtopicId:classification.subtopic.value,share:1}] : [],
      quality:{classification:[classification.subject,classification.subtopic,classification.section].every(item => item.state === 'known') ? 'verified'
        : classification.subject.state === 'known' || classification.section.state === 'known' ? 'partial' : 'unclassified',
        issues:issues.concat(classification.issues),deduplication:identity ? 'identified' : 'unverifiable'}};
  }
  function signature(value){
    if(Array.isArray(value)) return '[' + value.map(signature).join(',') + ']';
    if(object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key)+':'+signature(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  function normalizeAttempt(input, options = {}){
    const attempt = object(input) ? input : {};
    const settings = object(options) ? options : {};
    const raw = Array.isArray(attempt.answers) ? attempt.answers : [];
    const records = [], byIdentity = new Map(), parents = raw.map((_,index) => index);
    const find = index => {
      while(parents[index] !== index){parents[index] = parents[parents[index]]; index = parents[index];}
      return index;
    };
    // Question and plan-slot IDs are aliases within this attempt. Resolve all
    // connected aliases before projecting, including a late bridge between two.
    raw.forEach((answer,index) => {
      for(const key of ['questionId','planSlotId']){
        if(!text(answer?.[key])) continue;
        const alias = JSON.stringify([key,answer[key].trim()]);
        if(byIdentity.has(alias)) parents[find(index)] = find(byIdentity.get(alias));
        else byIdentity.set(alias,index);
      }
    });
    const groups = new Map();
    raw.forEach((_,index) => {
      const root = find(index);
      if(!groups.has(root)) groups.set(root,[]);
      groups.get(root).push(index);
    });
    let duplicates = 0;
    for(const indexes of groups.values()){
      const first = indexes[0], next = record(raw[first],attempt,first,settings);
      next.sourceIndexes = indexes;
      records.push(next);
      if(indexes.length < 2) continue;
      duplicates += indexes.length - 1;
      next.quality.deduplication = 'duplicate';
      if(indexes.some(index => signature(raw[index]) !== signature(raw[first]))){
        next.key = null;
        for(const key of ['questionId','planSlotId']){
          const values = [...new Set(indexes.map(index => raw[index]?.[key]).filter(text).map(value => value.trim()))];
          next[key] = values.length > 1 ? field(null,'conflict',['duplicate_answers.'+key])
            : values.length === 1 ? field(values[0],'known',['duplicate_answers.'+key]) : next[key];
        }
        next.status = 'unknown'; next.credit = field(null,'conflict',['duplicate_answers']);
        next.omitted = field(null,'conflict',['duplicate_answers']);
        next.domainEligible = false; next.knowledgeError = null;
        next.exposure.countsAsExposure = null;
        next.exposure.presented = field(null,'conflict',['duplicate_answers']);
        for(const key of ['section','subject','subtopic']) next.classification[key] = field(null,'conflict',['duplicate_answers']);
        next.classification.labels = {section:'Sin clasificar',subject:'Sin clasificar',subtopic:'Sin clasificar'};
        next.classification.subtopicCandidates = [];
        next.quality.classification = 'unclassified';
        next.allocations = [];
        next.quality.issues.push('conflicting_duplicate');
      }
    }
    const declaredTotal = read(attempt,'total','attempt.total',value => Number.isInteger(value) && value >= 0);
    const issues = [];
    if(!object(input)) issues.push('invalid_attempt');
    if(!Array.isArray(attempt.answers)) issues.push('missing_or_invalid_answers');
    if(duplicates) issues.push('duplicate_answers');
    if(declaredTotal.state === 'known' && declaredTotal.value !== records.length) issues.push('answer_count_mismatch');
    if(records.some(item => item.status === 'unknown')) issues.push('unknown_outcomes');
    if(records.some(item => item.quality.deduplication === 'unverifiable')) issues.push('missing_question_identity');
    return {contractVersion:VERSION,attemptId:read(attempt,'id','attempt.id'),
      at:read(attempt,'at','attempt.at',date),
      declaredTotal,reportedScore:read(attempt,'score','attempt.score',value => number(value) && value >= 0),
      records,duplicatesRemoved:duplicates,
      completeness:!issues.length && declaredTotal.state === 'known' ? 'complete' : 'incomplete',issues};
  }
  function normalizeHistory(attempts, options = {}){
    const normalized = [], seen = new Map(), issues = [];
    if(!Array.isArray(attempts)) return {contractVersion:VERSION,attempts:[],issues:['invalid_history']};
    attempts.forEach((attempt,index) => {
      const id = text(attempt?.id) ? attempt.id.trim() : null;
      if(id && seen.has(id)){
        const existing = seen.get(id);
        if(existing.signature !== signature(attempt)){
          existing.value.records = [];
          existing.value.completeness = 'incomplete';
          if(!existing.value.issues.includes('conflicting_attempt_id')) existing.value.issues.push('conflicting_attempt_id');
        }
        issues.push({code:'duplicate_attempt_id',index,attemptId:id}); return;
      }
      const value = normalizeAttempt(attempt,options);
      normalized.push(value); if(id) seen.set(id,{signature:signature(attempt),value});
      else issues.push({code:'missing_attempt_id',index});
    });
    return {contractVersion:VERSION,attempts:normalized,issues};
  }
  return Object.freeze({version:VERSION,normalizeAttempt,normalizeHistory});
});
