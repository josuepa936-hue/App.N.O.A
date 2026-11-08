/* NOA v25.2: memoria local y registro de intentos confirmados; no selecciona preguntas. */
(() => {
  const VERSION = 1;
  const FORMATS = ['single_select','drag_classify','inline_select','drag_order'];
  const storageKey = 'NOA_QUESTION_MEMORY_V25_2:' + new URL('./', document.baseURI).pathname;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const keyFor = (subject, fingerprint) => JSON.stringify([subject, fingerprint]);
  const emptyStore = () => ({version:VERSION, entries:[], sessions:[]});
  const iso = value => {
    if(typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
    return new Date(value).toISOString();
  };
  let pendingWrite = Promise.resolve();
  let operationEpoch = 0;
  const recordTasks = new Set(), diagnosticLog = [];

  function reportDiagnostic(detail){
    const entry = {operation:detail.operation, status:detail.status || 'error', at:new Date().toISOString()};
    for(const key of ['error','attemptId','rollbackFailed']) if(detail[key] !== undefined) entry[key] = detail[key];
    if(Array.isArray(detail.invalid)) entry.invalid = detail.invalid.filter(Number.isInteger);
    diagnosticLog.push(entry);
    if(diagnosticLog.length > 20) diagnosticLog.shift();
    if(entry.status === 'error') console.warn('NOA memoria', clone(entry));
    return clone(entry);
  }

  function trackRecord(task){
    const tracked = Promise.resolve(task).catch(() => ({ok:false, error:'memory_exception'}));
    recordTasks.add(tracked);
    tracked.then(() => recordTasks.delete(tracked));
    return tracked;
  }

  async function whenIdle(){
    while(recordTasks.size) await Promise.all([...recordTasks]);
    await pendingWrite;
  }

  // Canonical content only. Ambiguous scientific casing is preserved rather
  // than merging potentially different compounds, variables or allele pairs.
  const canonicalQuestion = (() => {
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const greek = /[\u0370-\u03ff\u1f00-\u1fff]/u;
    const operators = '=<>≤≥≠+\\-*/^×÷±∓→←↔⇌';
    const aroundOperator = new RegExp(`\\s*([${operators}:;,()\\[\\]{}])\\s*`, 'gu');
    const symbols = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' '));
    const genericInstructions = new Set([
      'selecciona la opción correcta',
      'selecciona la opción correcta en cada espacio',
      'completa los espacios seleccionando opciones'
    ]);

    function chemicalToken(token) {
      const parts = token.match(/[A-Z][a-z]?(?:[0-9₀-₉⁰-⁹]+)?/g);
      return !!parts && parts.join('') === token &&
        parts.every(part => symbols.has(part.replace(/[0-9₀-₉⁰-⁹]/g, '')));
    }

    function preserveCase(token, before, after) {
      if(greek.test(token) || /[0-9₀-₉⁰-⁹]/u.test(token)) return true;
      if(/^(?:([a-z])\1)+$/iu.test(token)) return true;
      if(token.length > 1 && chemicalToken(token)) return true;
      if(before.endsWith('\\') || greek.test(before.slice(-1)) || /[°ºµμ]/u.test(before.slice(-1))) return true;
      if(token.length <= 3 && /[0-9₀-₉⁰-⁹]\s*$/u.test(before)) return true;
      // An isolated Latin letter can be a case-sensitive variable or option.
      return token.length === 1;
    }

    function normalizeText(value, trim = true) {
      if(typeof value !== 'string') return null;
      let text = value.normalize('NFC').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
        .replace(/−/g, '-').replace(/\s+/gu, ' ');
      if(trim) text = text.trim();
      text = text.replace(/^[¿¡]+/u, '').replace(/\?+$/u, '');
      // A sentence period following prose is superficial. Decimal points,
      // punctuation within expressions, factorials and scientific symbols stay.
      text = text.replace(/(\p{L}{3,})\.$/u, '$1');
      text = text.replace(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9₀-₉⁰-⁹]*|[\u0370-\u03ff\u1f00-\u1fff]+/gu,
        (token, offset) => preserveCase(token, text.slice(0, offset), text.slice(offset + token.length))
          ? token : token.toLocaleLowerCase('es'));
      text = text.replace(aroundOperator, '$1');
      return trim ? text.trim() : text;
    }

    function instruction(question, format) {
      if(question.instruction == null) return ['single_select','inline_select'].includes(format) ? '' : null;
      if(typeof question.instruction !== 'string') return null;
      if(['single_select','inline_select'].includes(format)) {
        const generic = question.instruction.normalize('NFC').toLocaleLowerCase('es')
          .replace(/\s+/gu, ' ').trim().replace(/^[¿]+/u, '').replace(/[.?]+$/u, '').trim();
        if(genericInstructions.has(generic)) return '';
      }
      const result = normalizeText(question.instruction);
      return result || (['single_select','inline_select'].includes(format) ? '' : null);
    }

    const id = value => typeof value === 'string' && value.trim() && value.trim() === value ? value : null;
    const sorted = values => [...values].sort();
    const unique = values => new Set(values).size === values.length;
    const sortRows = rows => [...rows].sort((left, right) => {
      const a = JSON.stringify(left), b = JSON.stringify(right);
      return a < b ? -1 : a > b ? 1 : 0;
    });

    function options(raw, keyNames = ['correct']) {
      if(!record(raw) || !Array.isArray(raw.options) || raw.options.length < 2) return null;
      const values = raw.options.map(value => normalizeText(value));
      if(values.some(value => !value) || !unique(values)) return null;
      const keys = keyNames.filter(key => own(raw, key));
      if(!keys.length) return null;
      const indexes = keys.map(key => raw[key]);
      if(indexes.some(index => !Number.isInteger(index) || index < 0 || index >= values.length) || !indexes.every(index => index === indexes[0])) return null;
      return {options:sorted(values), correct:values[indexes[0]]};
    }

    function named(raw, field) {
      if(!Array.isArray(raw) || !raw.length || raw.some(item => !record(item) || !id(item.id))) return null;
      const values = raw.map(item => ({id:item.id, value:normalizeText(item[field])}));
      if(values.some(item => !item.value) || !unique(values.map(item => item.id)) || !unique(values.map(item => item.value))) return null;
      return values;
    }

    return function(question) {
      try {
        if(!record(question)) return null;
        const format = question.interactionType === undefined && Array.isArray(question.options)
          ? 'single_select' : question.interactionType;
        if(!['single_select','drag_classify','inline_select','drag_order'].includes(format)) return null;
        const instructions = instruction(question, format);
        if(instructions === null) return null;
        const result = {version:1, interactionType:format, instruction:instructions};

        if(format === 'single_select') {
          const text = normalizeText(question.text ?? question.question);
          const answer = options(question, ['correct','correctIndex']);
          if(!text || !answer) return null;
          return JSON.stringify({...result, text, ...answer});
        }

        if(format === 'inline_select') {
          if(typeof question.text !== 'string' || !question.text.trim() || !Array.isArray(question.blanks) || !question.blanks.length) return null;
          const blanks = new Map();
          for(const blank of question.blanks) {
            if(!record(blank) || !id(blank.id) || blanks.has(blank.id)) return null;
            const answer = options(blank);
            if(!answer) return null;
            blanks.set(blank.id, answer);
          }
          const segments = [], positions = [], seen = new Set();
          const text = question.text.normalize('NFC').replace(/\s+/gu, ' ').trim();
          let previous = 0;
          for(const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
            if(!blanks.has(match[1]) || seen.has(match[1])) return null;
            const segment = text.slice(previous, match.index);
            if(segment.includes('[[') || segment.includes(']]')) return null;
            segments.push(normalizeText(segment, false));
            positions.push(blanks.get(match[1]));
            seen.add(match[1]);
            previous = match.index + match[0].length;
          }
          const tail = text.slice(previous);
          if(seen.size !== blanks.size || tail.includes('[[') || tail.includes(']]')) return null;
          segments.push(normalizeText(tail, false));
          return JSON.stringify({...result, segments, blanks:positions});
        }

        const stem = normalizeText(question.stem ?? '');
        if(stem === null) return null;
        if(format === 'drag_classify') {
          const targets = named(question.targets, 'label'), elements = named(question.elements, 'text');
          if(!targets || !elements) return null;
          const labels = new Map(targets.map(target => [target.id, target.value]));
          if(own(question, 'correctResponse') && (!record(question.correctResponse) ||
            Object.keys(question.correctResponse).length !== elements.length ||
            Object.keys(question.correctResponse).some(key => !elements.some(item => item.id === key)))) return null;
          const rows = [];
          for(let index = 0; index < elements.length; index++) {
            const element = question.elements[index], target = id(element.correctTargetId);
            if(!target || !labels.has(target) || (own(question,'correctResponse') && question.correctResponse[element.id] !== target)) return null;
            rows.push([elements[index].value, labels.get(target)]);
          }
          return JSON.stringify({...result, stem, targets:sorted([...labels.values()]), elements:sortRows(rows)});
        }

        const items = named(question.items, 'text');
        if(!items || items.length < 2 || !Array.isArray(question.correctOrder) || question.correctOrder.length !== items.length ||
          question.correctOrder.some(value => !id(value)) || !unique(question.correctOrder)) return null;
        const labels = new Map(items.map(item => [item.id, item.value]));
        if(question.correctOrder.some(value => !labels.has(value))) return null;
        return JSON.stringify({...result, stem, items:sorted([...labels.values()]), correctOrder:question.correctOrder.map(value => labels.get(value))});
      } catch {
        return null;
      }
    };
  })();

  function subjectFor(question){
    const explicit = text(question?.subject) ? question.subject.trim().normalize('NFC') : null;
    const slot = text(question?.blueprintSlot?.subject) ? question.blueprintSlot.subject.trim().normalize('NFC') : null;
    if(explicit && slot && explicit !== slot) return null;
    if(explicit || slot) return explicit || slot;
    if(typeof db === 'undefined') return null;
    const topic = Array.isArray(db?.topics) && db.topics.find(item => item.id === question?.topicId);
    const subject = topic && Array.isArray(db?.subjects) && db.subjects.find(item => item.id === topic.subjectId);
    return text(subject?.name) ? subject.name.trim().normalize('NFC') : null;
  }

  function metadata(question, fingerprint){
    const difficulty = question.difficulty ?? question.blueprint?.difficulty ?? question.blueprintSlot?.difficulty?.level;
    const code = question.syllabusCode ?? question.blueprintSlot?.syllabusCodes?.[0];
    const source = question.sourceType ?? question.blueprintSlot?.sourceType;
    return {
      fingerprint, subject:subjectFor(question),
      syllabusCode:text(code) ? code.trim() : null,
      interactionType:question.interactionType || 'single_select',
      difficulty:Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : null,
      sourceType:text(source) ? source.trim() : null
    };
  }

  async function hashCanonical(canonical){
    try{
      if(!canonical || !globalThis.crypto?.subtle) return null;
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
      return 'qm1:sha256:' + [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,'0')).join('');
    }catch{ return null; }
  }

  async function fingerprint(question){ return hashCanonical(canonicalQuestion(question)); }

  function validStore(store){
    if(!object(store) || store.version !== VERSION || !Array.isArray(store.entries) || !Array.isArray(store.sessions) ||
      Object.keys(store).some(key => !['version','entries','sessions'].includes(key))) return false;
    const entries = new Map(), sessions = new Set(), observations = new Map();
    const fields = ['fingerprint','subject','syllabusCode','interactionType','difficulty','sourceType',
      'firstSeenAt','lastSeenAt','timesSeen','sessionId'];
    for(const entry of store.entries){
      if(!object(entry) || Object.keys(entry).length !== fields.length || fields.some(key => !own(entry,key)) ||
        !/^qm1:sha256:[0-9a-f]{64}$/.test(entry.fingerprint) || !text(entry.subject) ||
        !FORMATS.includes(entry.interactionType) || !text(entry.sessionId) ||
        !(entry.syllabusCode === null || text(entry.syllabusCode)) || !(entry.sourceType === null || text(entry.sourceType)) ||
        !(entry.difficulty === null || Number.isInteger(entry.difficulty) && entry.difficulty >= 1 && entry.difficulty <= 5) ||
        !text(entry.firstSeenAt) || !text(entry.lastSeenAt) || iso(entry.firstSeenAt) !== entry.firstSeenAt || iso(entry.lastSeenAt) !== entry.lastSeenAt ||
        entry.firstSeenAt > entry.lastSeenAt || !Number.isSafeInteger(entry.timesSeen) || entry.timesSeen < 1) return false;
      const key = keyFor(entry.subject,entry.fingerprint);
      if(entries.has(key)) return false;
      entries.set(key,entry); observations.set(key,[]);
    }
    for(const session of store.sessions){
      if(!object(session) || Object.keys(session).length !== 3 || !text(session.id) || sessions.has(session.id) ||
        !text(session.at) || iso(session.at) !== session.at || !Array.isArray(session.keys) || !session.keys.length) return false;
      sessions.add(session.id);
      const keys = new Set();
      for(const pair of session.keys){
        if(!Array.isArray(pair) || pair.length !== 2 || !text(pair[0]) || !text(pair[1])) return false;
        const key = keyFor(...pair);
        if(keys.has(key) || !entries.has(key)) return false;
        keys.add(key); observations.get(key).push({id:session.id, at:session.at});
      }
    }
    for(const [key, entry] of entries){
      const history = observations.get(key).sort((left,right) => left.at.localeCompare(right.at) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
      if(history.length !== entry.timesSeen || history[0]?.at !== entry.firstSeenAt || history.at(-1)?.at !== entry.lastSeenAt ||
        history.at(-1)?.id !== entry.sessionId) return false;
    }
    return true;
  }

  function readStore(){
    if(pendingBackupRollback) return {ok:false, error:'rollback_failed'};
    let raw;
    try{ raw = localStorage.getItem(storageKey); }
    catch{ return {ok:false, error:'storage_unavailable'}; }
    if(raw === null) return {ok:true, data:emptyStore()};
    try{
      const data = JSON.parse(raw);
      return validStore(data) ? {ok:true, data} : {ok:false, error:'corrupt_storage'};
    }catch{ return {ok:false, error:'corrupt_storage'}; }
  }

  function serializedWrite(callback){
    const run = () => globalThis.navigator?.locks?.request
      ? navigator.locks.request(storageKey, {mode:'exclusive'}, callback) : callback();
    const result = pendingWrite.then(run).catch(() => ({ok:false, error:'storage_unavailable'}));
    pendingWrite = result.then(() => undefined);
    return result;
  }

  async function contains(question, options){
    // Preserve the original boolean contract, including its error behavior.
    if(options?.details !== true){
      const subject = subjectFor(question), hash = await fingerprint(question), state = readStore();
      return !!(subject && hash && state.ok && state.data.entries.some(entry => entry.subject === subject && entry.fingerprint === hash));
    }
    // The opt-in result distinguishes an absent question from an unchecked one.
    // Only this read decides success; callers cannot infer it from a later stats().
    try{
      const subject = subjectFor(question);
      if(!subject) return {ok:false, contains:false, error:'invalid_subject'};
      const canonical = canonicalQuestion(question);
      if(!canonical) return {ok:false, contains:false, error:'invalid_question'};
      if(!globalThis.crypto?.subtle) return {ok:false, contains:false, error:'crypto_unavailable'};
      const hash = await hashCanonical(canonical);
      if(!hash) return {ok:false, contains:false, error:'fingerprint_unavailable'};
      const state = readStore();
      if(!state.ok) return {ok:false, contains:false, error:state.error};
      return {ok:true, contains:state.data.entries.some(entry => entry.subject === subject && entry.fingerprint === hash)};
    }catch{ return {ok:false, contains:false, error:'memory_exception'}; }
  }

  async function recordExamInternal(questions, sessionId, options, epoch){
    if(!Array.isArray(questions) || !questions.length || !text(sessionId) || sessionId.length > 256 || !object(options)){
      return {ok:false, error:'invalid_exam'};
    }
    if(!globalThis.crypto?.subtle) return {ok:false, error:'crypto_unavailable'};
    const at = own(options,'seenAt') ? iso(options.seenAt) : new Date().toISOString();
    if(!at) return {ok:false, error:'invalid_timestamp'};
    // Freeze canonical content and primitive metadata before the first await:
    // callers may change their queue while Web Crypto computes the digests.
    const snapshots = Array.from(questions, question => ({canonical:canonicalQuestion(question), item:metadata(question || {},null)}));
    const prepared = [], invalid = [];
    for(let index = 0; index < snapshots.length; index++){
      const {canonical, item} = snapshots[index];
      const hash = await hashCanonical(canonical);
      if(!hash || !item.subject) invalid.push(index);
      else prepared.push({...item,fingerprint:hash});
    }
    if(invalid.length) return {ok:false, error:'invalid_questions', invalid};
    const unique = new Map(prepared.map(item => [keyFor(item.subject,item.fingerprint), item]));
    const keys = [...unique.keys()].sort();
    return serializedWrite(() => {
      if(pendingBackupRollback && !repairBackupRollback()) return {ok:false, error:'rollback_failed'};
      if(epoch !== operationEpoch) return {ok:false, error:'operation_superseded'};
      const state = readStore();
      if(!state.ok) return state;
      const store = state.data;
      const existing = store.sessions.find(session => session.id === sessionId);
      if(existing){
        const prior = existing.keys.map(pair => keyFor(...pair)).sort();
        return JSON.stringify(prior) === JSON.stringify(keys)
          ? {ok:true, added:0, updated:0, unchanged:keys.length, sessionId}
          : {ok:false, error:'session_conflict'};
      }
      const entries = new Map(store.entries.map(entry => [keyFor(entry.subject,entry.fingerprint), entry]));
      let added = 0, updated = 0;
      for(const key of keys){
        const item = unique.get(key), prior = entries.get(key);
        if(prior){
          const latest = at > prior.lastSeenAt || at === prior.lastSeenAt && sessionId > prior.sessionId;
          entries.set(key, {...prior, ...(latest ? item : {}), firstSeenAt:at < prior.firstSeenAt ? at : prior.firstSeenAt,
            lastSeenAt:at > prior.lastSeenAt ? at : prior.lastSeenAt,
            timesSeen:prior.timesSeen + 1, sessionId:latest ? sessionId : prior.sessionId});
          updated++;
        }else{
          entries.set(key, {...item, firstSeenAt:at, lastSeenAt:at, timesSeen:1, sessionId});
          added++;
        }
      }
      store.entries = [...entries.values()];
      store.sessions.push({id:sessionId, at, keys:keys.map(key => JSON.parse(key))});
      if(!validStore(store)) return {ok:false, error:'invalid_memory'};
      try{ localStorage.setItem(storageKey, JSON.stringify(store)); }
      catch{ return {ok:false, error:'storage_unavailable'}; }
      return {ok:true, added, updated, unchanged:0, sessionId};
    });
  }

  function recordExam(questions, sessionId, options = {}){
    return trackRecord(recordExamInternal(questions, sessionId, options, operationEpoch));
  }

  // Timed attempts keep complete outcome records. Exposure is a separate
  // fact: an unanswered question which was never displayed was not presented.
  // The bank keeps its original compact schema and fingerprint contract.
  function validTimedAttempt(attempt){
    if(!own(attempt,'timing')) return true;
    const timing = attempt.timing;
    if(!object(timing) || timing.version !== 26 || timing.status !== 'closed' ||
      !text(timing.attemptId) || timing.attemptId !== attempt.id ||
      !['manual','timeout'].includes(timing.finishReason) ||
      own(attempt,'finishReason') && attempt.finishReason !== timing.finishReason ||
      !Number.isFinite(timing.startedAt) || !Number.isFinite(timing.durationMs) || timing.durationMs <= 0 ||
      !Number.isFinite(timing.deadlineAt) || timing.deadlineAt !== timing.startedAt + timing.durationMs ||
      !Number.isFinite(timing.closedAt) || timing.closedAt < timing.startedAt ||
      timing.finishReason === 'timeout' && timing.closedAt !== timing.deadlineAt ||
      timing.finishReason === 'manual' && timing.closedAt >= timing.deadlineAt ||
      !Array.isArray(timing.presentedQuestionIds) || timing.presentedQuestionIds.some(id => !text(id)) ||
      new Set(timing.presentedQuestionIds).size !== timing.presentedQuestionIds.length ||
      !Number.isInteger(attempt.total) || attempt.total < 1 || !Array.isArray(attempt.answers) ||
      attempt.answers.length !== attempt.total) return false;
    const ids = new Set(attempt.answers.map(answer => String(answer?.questionId ?? '')));
    if(ids.size !== attempt.total || ids.has('') || timing.presentedQuestionIds.some(id => !ids.has(id))) return false;
    const presented = new Set(timing.presentedQuestionIds);
    let credit = 0;
    for(const answer of attempt.answers){
      if(!object(answer) || typeof answer.presented !== 'boolean' ||
        answer.presented !== presented.has(String(answer.questionId))) return false;
      if(answer.omitted === true){
        if(timing.finishReason !== 'timeout' || answer.omissionReason !== 'timeout' ||
          answer.ok !== false || answer.scoreFraction !== 0 ||
          ['selected','assignments','selections','order','userAnswer'].some(key => own(answer,key))) return false;
      }else{
        if(answer.omitted !== undefined && answer.omitted !== false || answer.presented !== true) return false;
        const fraction = answer.scoreFraction === undefined ? (answer.ok ? 1 : 0) : answer.scoreFraction;
        if(typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) return false;
        credit += fraction;
      }
    }
    return Number.isFinite(attempt.score) && Math.abs(attempt.score - credit) < 0.000001;
  }

  async function registerSavedAttempt(attempt, questions){
    const attemptId = attempt?.id;
    let result, persistedConfirmed = false;
    try{
      const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
      const persisted = stored?.attempts?.find(item => item.id === attemptId);
      if(!text(attemptId) || !persisted || JSON.stringify(persisted) !== JSON.stringify(attempt)){
        result = {ok:false, error:'attempt_not_saved'};
      }else{
        persistedConfirmed = true;
        const ids = Array.isArray(questions) ? questions.map(question => String(question?.id ?? '')) : [];
        const answered = Array.isArray(persisted.answers) ? persisted.answers.map(answer => String(answer?.questionId ?? '')) : [];
        const complete = ids.length > 0 && ids.length === persisted.total && ids.length === answered.length &&
          new Set(ids).size === ids.length && new Set(answered).size === ids.length && ids.every(id => id && answered.includes(id));
        if(!complete) result = {ok:false, error:'incomplete_exam'};
        else if(!validTimedAttempt(persisted)) result = {ok:false, error:'invalid_timed_attempt'};
        else{
          const outcomes = new Map(persisted.answers.map(answer => [String(answer.questionId),answer]));
          const exposures = questions.filter(question => {
            const outcome = outcomes.get(String(question.id));
            return !(outcome.omitted === true && outcome.presented === false);
          });
          result = exposures.length
            ? await window.NOA_QUESTION_MEMORY_V25_2.recordExam(exposures, 'history:' + attemptId, {seenAt:attempt.at})
            : {ok:true, added:0, updated:0, unchanged:0, skipped:questions.length, reason:'no_exposure'};
        }
      }
    }catch{ result = {ok:false, error:'memory_exception'}; }
    if(!result || typeof result.ok !== 'boolean') result = {ok:false, error:'invalid_memory_result'};
    reportDiagnostic({operation:'record_exam', status:result.ok ? 'ok' : 'error', attemptId, error:result.error, invalid:result.invalid});
    if(!result.ok && typeof toast === 'function') toast(
      `${persistedConfirmed ? 'El resultado está guardado.' : 'No se verificó el guardado del resultado.'} Memoria del intento ${attemptId || 'desconocido'}: ${result.error}.`
    );
    return result;
  }

  function recordSavedAttempt(attempt, questions){ return trackRecord(registerSavedAttempt(attempt, questions)); }

  function recent(subject, limit = 20){
    const state = readStore();
    if(!state.ok) return [];
    const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 20;
    return clone(state.data.entries.filter(entry => subject === undefined || entry.subject === subject)
      .sort((left,right) => right.lastSeenAt.localeCompare(left.lastSeenAt) || keyFor(left.subject,left.fingerprint).localeCompare(keyFor(right.subject,right.fingerprint)))
      .slice(0,count));
  }

  function stats(subject){
    const state = readStore();
    if(!state.ok) return {ok:false, version:VERSION, uniqueQuestions:0, totalSeen:0, sessions:0, byFormat:{}, error:state.error};
    const entries = state.data.entries.filter(entry => subject === undefined || entry.subject === subject);
    const byFormat = Object.fromEntries(FORMATS.map(format => [format,entries.filter(entry => entry.interactionType === format).length]));
    return {ok:true, version:VERSION, uniqueQuestions:entries.length, totalSeen:entries.reduce((sum,entry) => sum + entry.timesSeen,0),
      sessions:state.data.sessions.filter(session => subject === undefined || session.keys.some(pair => pair[0] === subject)).length,
      byFormat, lastSeenAt:entries.map(entry => entry.lastSeenAt).sort().at(-1) || null};
  }

  function historicalQuestion(answer){
    // Answers actuales no guardan instrucciones ni toda la estructura. No se
    // completa contenido usando IDs, Blueprint, el banco actual ni la cola activa.
    if(!object(answer) || !own(answer,'instruction') || typeof answer.instruction !== 'string') return null;
    const type = answer.interactionType || 'single_select';
    const question = {...answer, interactionType:type};
    if(type === 'single_select'){
      question.text = answer.text ?? answer.question;
      question.correct = Number.isInteger(answer.correctIndex) ? answer.correctIndex : answer.correct;
    }else if(type === 'inline_select') question.text = answer.text ?? answer.question;
    else if(!own(answer,'stem') || typeof answer.stem !== 'string') return null;
    return canonicalQuestion(question) && subjectFor(question) ? question : null;
  }

  async function recoverHistory(attempts){
    const state = readStore();
    if(!state.ok) return {ok:false, recovered:0, skipped:0, issues:[], error:state.error};
    const history = attempts === undefined ? (typeof db !== 'undefined' ? db.attempts : null) : attempts;
    if(!Array.isArray(history)) return {ok:false, recovered:0, skipped:0, issues:[], error:'invalid_history'};
    let recovered = 0, skipped = 0;
    const issues = [];
    for(const attempt of history){
      const answers = Array.isArray(attempt?.answers) ? attempt.answers : [];
      if(!text(attempt?.id) || !iso(attempt?.at) || !answers.length){
        skipped += answers.length;
        issues.push({attemptId:attempt?.id ?? null, reason:'missing_session_date_or_answers'});
        continue;
      }
      if(!validTimedAttempt(attempt)){
        skipped += answers.length;
        issues.push({attemptId:attempt.id, reason:'invalid_timed_attempt'});
        continue;
      }
      const questions = [];
      answers.forEach((answer, answerIndex) => {
        if(answer.omitted === true && answer.presented === false){
          skipped++;
          issues.push({attemptId:attempt.id, answerIndex, reason:'not_presented'});
          return;
        }
        const question = historicalQuestion(answer);
        if(question) questions.push(question);
        else{ skipped++; issues.push({attemptId:attempt.id, answerIndex, reason:'insufficient_content'}); }
      });
      if(!questions.length) continue;
      const result = await recordExam(questions, 'history:' + attempt.id, {seenAt:attempt.at});
      if(!result.ok){
        skipped += questions.length;
        issues.push({attemptId:attempt.id, reason:result.error});
        if(['corrupt_storage','storage_unavailable','crypto_unavailable'].includes(result.error)){
          return {ok:false, recovered, skipped, issues, error:result.error};
        }
      }else recovered += result.added + result.updated;
    }
    return {ok:true, recovered, skipped, issues};
  }

  // Backup transactions share the memory lock; no call to save() is allowed here.
  // A browser can deny rollback too. Keep originals in RAM for the next operation
  // and report that failure instead of claiming restoration or erasure succeeded.
  let pendingBackupRollback = null;
  const backupCollections = ['subjects','topics','cards','notes','questions','attempts','sessions','activity','guides','courseSources'];
  const privateBackupKeys = new Set([
    'token','accesstoken','refreshtoken','bridgetoken','password','passwd','apikey','secret','clientsecret',
    'authorization','credentials','credential','connection','connections','connectionsettings',
    'sessionconnection','sessionconnections','bridgeurl','ollamaurl','baseurl','connectionurl',
    'serverurl','serviceurl','endpoint','messages','conversation','conversations','chathistory',
    'chatmessages','rawresponse','requestheaders','headers','proto','prototype','constructor'
  ]);

  function backupDiagnostic(operation, error, details = {}){
    reportDiagnostic({operation,status:'error',error,...details});
  }

  function cleanBackupValue(value){
    if(value === null || ['string','boolean'].includes(typeof value)) return value;
    if(typeof value === 'number'){
      if(!Number.isFinite(value)) throw new Error('invalid_database');
      return value;
    }
    if(Array.isArray(value)) return Array.from(value, cleanBackupValue);
    if(!object(value)) throw new Error('invalid_database');
    const result = {};
    for(const [key,item] of Object.entries(value)){
      const normalized = key.replace(/[^a-z0-9_]/gi,'').replace(/_/g,'').toLowerCase();
      if(privateBackupKeys.has(normalized) || /(?:token|password|passwd|apikey|secret|credential|connection|connections|connectionsettings|connectionurl|endpoint|endpointurl)$/.test(normalized)) continue;
      result[key] = cleanBackupValue(item);
    }
    return result;
  }

  function sanitizedAcademicDb(raw){
    if(!object(raw) || raw.version !== 6) throw new Error('invalid_database');
    if(['subjects','topics','cards','notes','questions','attempts','sessions'].some(key => !own(raw,key) || !Array.isArray(raw[key]))) throw new Error('invalid_database');
    // Match the existing JSON backup semantics for optional undefined fields.
    raw = clone(raw);
    const result = {version:6};
    for(const key of backupCollections){
      if(own(raw,key) && (!Array.isArray(raw[key]) || raw[key].some(item => !object(item)))) throw new Error('invalid_database');
      result[key] = cleanBackupValue(raw[key] || []);
    }
    if(own(raw,'settings') && !object(raw.settings)) throw new Error('invalid_database');
    result.settings = {};
    if(own(raw.settings || {},'noaTrainingProfile')){
      if(!['official','extended','course','extreme'].includes(raw.settings.noaTrainingProfile)) throw new Error('invalid_database');
      result.settings.noaTrainingProfile = raw.settings.noaTrainingProfile;
    }
    for(const item of result.subjects){
      if(!text(item.id) || !text(item.name)) throw new Error('invalid_database');
    }
    for(const item of result.topics){
      if(!text(item.id) || !text(item.name) || typeof item.subjectId !== 'string') throw new Error('invalid_database');
      for(const key of ['attempts','correct']) if(own(item,key) && (!Number.isFinite(item[key]) || item[key] < 0)) throw new Error('invalid_database');
    }
    for(const item of result.attempts){
      for(const key of ['score','total','pct']) if(own(item,key) && (!Number.isFinite(item[key]) || item[key] < 0)) throw new Error('invalid_database');
      if(own(item,'answers') && (!Array.isArray(item.answers) || item.answers.some(answer => !object(answer)))) throw new Error('invalid_database');
      if(own(item,'score') && own(item,'total') && item.score > item.total || own(item,'pct') && item.pct > 100) throw new Error('invalid_database');
      if(!validTimedAttempt(item)) throw new Error('invalid_database');
    }
    for(const key of backupCollections){
      for(const item of result[key]) if(own(item,'id') && !text(item.id)) throw new Error('invalid_database');
    }
    for(const [collection, fields] of [['cards',['front','back']], ['notes',['title','text']], ['guides',['title','markdown']], ['activity',['text']]]){
      for(const item of result[collection]){
        if(fields.some(field => typeof item[field] !== 'string')) throw new Error('invalid_database');
      }
    }
    for(const question of result.questions) if(!canonicalQuestion(question)) throw new Error('invalid_database');
    for(const session of result.sessions){
      if(!Number.isFinite(session.minutes) || session.minutes < 0) throw new Error('invalid_database');
    }
    for(const source of result.courseSources){
      if(!text(source.id) || !text(source.subject) || !text(source.title) || typeof source.content !== 'string') throw new Error('invalid_database');
      if(source.analysis != null){
        if(!object(source.analysis)) throw new Error('invalid_database');
        for(const field of ['concepts','syllabus_links','evaluable_objectives']){
          if(own(source.analysis,field) && (!Array.isArray(source.analysis[field]) || source.analysis[field].some(item => !object(item)))) throw new Error('invalid_database');
        }
        for(const [field, label] of [['concepts','name'],['syllabus_links','code']]){
          if((source.analysis[field] || []).some(item => own(item,label) && typeof item[label] !== 'string')) throw new Error('invalid_database');
        }
      }
    }
    // Voice commands can contain free-form Coach queries. They are transient
    // activity, not academic history that belongs in a backup.
    result.activity = result.activity.filter(item => !/^Comando:/i.test(item.text));
    if(own(raw,'masterSyllabus')){
      if(raw.masterSyllabus === null) result.masterSyllabus = null;
      else{
        if(!object(raw.masterSyllabus) || !Array.isArray(raw.masterSyllabus.items) || raw.masterSyllabus.items.some(item => !object(item))) throw new Error('invalid_database');
        result.masterSyllabus = cleanBackupValue(raw.masterSyllabus);
      }
    }
    if(own(raw,'activeExam')){
      if(raw.activeExam === null) result.activeExam = null;
      else{
        const active = cleanBackupValue(raw.activeExam);
        if(!window.NOA_EXAM_RECOVERY?.validate?.(active)) throw new Error('invalid_active_exam');
        if(!window.NOA_STUDY_PROVENANCE_V27.checkpointCompatible(active,result.attempts)) throw new Error('provenance_conflict');
        result.activeExam = active;
      }
    }
    // Unknown top-level fields are deliberately excluded (including chat data).
    return result;
  }

  function backupGenerationActive(){
    return !!(window.NOA_GENERATOR_UI?.state?.()?.busy || window.NOA_EXAM_UI_V25?.state?.()?.busy);
  }

  function restoreRawBackupValue(key, raw){
    if(raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key,raw);
  }

  function repairBackupRollback(){
    if(!pendingBackupRollback) return true;
    const previous = pendingBackupRollback;
    let complete = true;
    for(const [key,raw] of [[storageKey,previous.memory],[KEY,previous.main]]){
      try{ restoreRawBackupValue(key,raw); }
      catch{ complete = false; }
    }
    try{ complete = complete && localStorage.getItem(KEY) === previous.main && localStorage.getItem(storageKey) === previous.memory; }
    catch{ complete = false; }
    if(complete){
      pendingBackupRollback = null;
      operationEpoch = previous.epoch;
    }
    return complete;
  }

  function backupStorageTransaction(nextMain, nextMemory, replaceMemory){
    if(!repairBackupRollback()) return {ok:false,error:'rollback_failed',rollbackFailed:true};
    let before;
    try{
      before = {main:localStorage.getItem(KEY),memory:localStorage.getItem(storageKey),epoch:operationEpoch};
    }catch{ return {ok:false,error:'storage_unavailable'}; }
    operationEpoch++;
    try{
      if(replaceMemory) restoreRawBackupValue(storageKey,nextMemory);
      restoreRawBackupValue(KEY,nextMain);
      if(localStorage.getItem(KEY) !== nextMain || replaceMemory && localStorage.getItem(storageKey) !== nextMemory){
        throw new Error('storage_verification_failed');
      }
      return {ok:true};
    }catch{
      pendingBackupRollback = before;
      const recovered = repairBackupRollback();
      return recovered ? {ok:false,error:'storage_unavailable'} : {ok:false,error:'rollback_failed',rollbackFailed:true};
    }
  }

  function applyBackupRuntime(nextDb, restoreActive){
    db = nextDb;
    window.NOA_MIXED_EXAM?.stop?.();
    window.NOA_EXAM_SHELL?.deactivate?.();
    examQueue = []; examIndex = 0; examScore = 0; examAnswers = [];
    reviewQueue = []; reviewIndex = 0;
    window.NOA_EXAM_NAVIGATION?.drafts?.clear?.();
    if(typeof resetTimer === 'function') resetTimer();
    if(typeof renderAll === 'function') renderAll();
    if(typeof loadAISettingsUI === 'function') loadAISettingsUI();
    if(typeof renderAISettingsVisibility === 'function') renderAISettingsVisibility();
    if(restoreActive && db.activeExam){
      if(!window.NOA_EXAM_RECOVERY?.recover?.()) throw new Error('active_exam_recovery_failed');
    }else if(typeof renderExam === 'function') renderExam();
  }

  async function createBackup(){
    try{
      await whenIdle();
      const result = await serializedWrite(() => {
        if(!repairBackupRollback()) return {ok:false,error:'rollback_failed',rollbackFailed:true};
        const state = readStore();
        if(!state.ok) return state;
        let academic;
        try{ academic = sanitizedAcademicDb(db); }
        catch(error){ return {ok:false,error:['invalid_database','invalid_active_exam','provenance_conflict'].includes(error?.message) ? error.message : 'invalid_database'}; }
        const memory = clone(state.data);
        if(!validStore(memory)) return {ok:false,error:'invalid_memory'};
        return {ok:true,backup:{format:'noa-backup',version:1,db:academic,questionMemory:memory}};
      });
      if(!result.ok) backupDiagnostic('backup_export',result.error,{rollbackFailed:!!result.rollbackFailed});
      return result;
    }catch(error){
      const reason = ['invalid_database','invalid_active_exam','provenance_conflict'].includes(error?.message) ? error.message : 'backup_export_failed';
      backupDiagnostic('backup_export',reason);
      return {ok:false,error:reason};
    }
  }

  async function restoreBackup(payload){
    let academic, hasMemory = false, memoryRaw;
    try{
      const source = clone(payload);
      if(object(source) && source.format === 'noa-backup'){
        if(source.version !== 1 || !own(source,'db') || !own(source,'questionMemory') ||
          Object.keys(source).some(key => !['format','version','db','questionMemory'].includes(key)) || !validStore(source.questionMemory)){
          throw new Error('invalid_backup');
        }
        academic = sanitizedAcademicDb(source.db);
        memoryRaw = JSON.stringify(clone(source.questionMemory));
        hasMemory = true;
      }else{
        if(!object(source) || own(source,'format')) throw new Error('invalid_backup');
        academic = sanitizedAcademicDb(source);
      }
    }catch(error){
      const reason = ['invalid_database','invalid_active_exam','provenance_conflict'].includes(error?.message) ? error.message : 'invalid_backup';
      backupDiagnostic('backup_restore',reason);
      return {ok:false,error:reason};
    }
    if(backupGenerationActive()){
      backupDiagnostic('backup_restore','generation_in_progress');
      return {ok:false,error:'generation_in_progress'};
    }
    const nextDb = Object.assign(blank(),academic);
    nextDb.settings = Object.assign(blank().settings,academic.settings);
    const result = await serializedWrite(() => {
      if(backupGenerationActive()) return {ok:false,error:'generation_in_progress'};
      const committed = backupStorageTransaction(JSON.stringify(nextDb),memoryRaw,hasMemory);
      if(committed.ok) db = nextDb;
      return committed;
    });
    if(!result.ok){
      backupDiagnostic('backup_restore',result.error,{rollbackFailed:!!result.rollbackFailed});
      return result;
    }
    try{ applyBackupRuntime(nextDb,true); }
    catch(error){
      backupDiagnostic('backup_restore','runtime_refresh_failed',{committed:true,detail:String(error?.message || error)});
      return {ok:false,error:'runtime_refresh_failed',committed:true};
    }
    reportDiagnostic({operation:'backup_restore',status:'ok',memoryIncluded:hasMemory});
    return {ok:true,memoryIncluded:hasMemory};
  }

  async function resetData(){
    if(backupGenerationActive()){
      backupDiagnostic('reset','generation_in_progress');
      return {ok:false,error:'generation_in_progress'};
    }
    const nextDb = blank();
    const result = await serializedWrite(() => {
      if(backupGenerationActive()) return {ok:false,error:'generation_in_progress'};
      const committed = backupStorageTransaction(null,null,true);
      if(committed.ok) db = nextDb;
      return committed;
    });
    if(!result.ok){
      backupDiagnostic('reset',result.error,{rollbackFailed:!!result.rollbackFailed});
      return result;
    }
    try{ applyBackupRuntime(nextDb,false); }
    catch(error){
      backupDiagnostic('reset','runtime_refresh_failed',{committed:true,detail:String(error?.message || error)});
      return {ok:false,error:'runtime_refresh_failed',committed:true};
    }
    reportDiagnostic({operation:'reset',status:'ok'});
    return {ok:true};
  }

  window.NOA_QUESTION_MEMORY_V25_2 = {version:'25.2.2', storageKey, fingerprint, contains, recordExam, recent, stats, recoverHistory,
    recordSavedAttempt, reportDiagnostic, diagnostics:() => clone(diagnosticLog), whenIdle, createBackup, restoreBackup, resetData};
})();
