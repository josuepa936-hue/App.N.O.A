/* =========================================================
   NOA EXCOBA BATCH ORCHESTRATOR v10

   Primer orquestador de múltiples slots.

   - Construye un blueprint completo
   - Detecta formatos actualmente soportados
   - Genera varios slots
   - Conserva slotId / dificultad / fuente / formato
   - Usa Generator + Judge v9
   - Detecta duplicados

   CHECKPOINT:
   single_select solamente.
   ========================================================= */

(() => {

  const VERSION = '10.0';
  const isQuotaError=error=>window.NOA_AI_BRIDGE_V2?.isQuotaError(error)||error?.status===429;

  const SUPPORTED_TYPES = [
    'single_select'
  ];


  // =====================================
  // UTILIDADES
  // =====================================

  function norm(value){

    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g,' ')
      .trim();

  }

   function questionKey(
  question,
  fallback=''
){

  if(!question){
    return String(fallback);
  }


  const parts = [

    question.interactionType || '',

    question.text || '',

    question.stem || '',

    question.instruction || '',


    ...(
      Array.isArray(
        question.options
      )
        ? question.options
        : []
    ),


    ...(
      Array.isArray(
        question.elements
      )
        ? question.elements.map(
            element =>
              element?.text || ''
          )
        : []
    ),


    ...(
      Array.isArray(
    question.targets
  )
    ? question.targets.map(
        target =>
          target?.label || ''
      )
    : []
),


...(
  Array.isArray(
    question.items
  )
    ? question.items.map(
        item =>
          item?.text || ''
      )
    : []
)

  ];


  const key =
    norm(
      parts
        .filter(Boolean)
        .join(' | ')
    );


  return (
    key ||
    String(fallback)
  );

}


  function clamp(value,min,max){

    return Math.max(
      min,
      Math.min(
        max,
        Number(value) || min
      )
    );

  }


  function isSupported(slot){

    return SUPPORTED_TYPES.includes(
      slot?.interactionType
    );

  }


  // =====================================
  // MAP CON CONCURRENCIA LIMITADA
  // =====================================

  async function mapLimit(
    items,
    limit,
    worker
  ){

    const results =
      new Array(items.length);


    let cursor = 0;
    let quotaFailure = null;


    async function runner(){

      while(true){
        if(quotaFailure)return;

        const index =
          cursor++;


        if(
          index >=
          items.length
        ){
          return;
        }


        try{

          results[index] = {
            status:'fulfilled',
            value:
              await worker(
                items[index],
                index
              )
          };

        }catch(error){
          if(isQuotaError(error))quotaFailure=error;

          results[index] = {
            status:'rejected',
            reason:error
          };

        }

      }

    }


    const workers =
      Array.from(
        {
          length:
            Math.min(
              limit,
              items.length
            )
        },
        () => runner()
      );


    await Promise.all(
      workers
    );


    if(quotaFailure)throw quotaFailure;

    return results;

  }


  // =====================================
  // VALIDACIÓN DE RESULTADO
  // =====================================

  function validateResult(
    generated,
    expectedSlot
  ){

    const question =
      generated?.question;


    const slot =
      generated?.slot;


    if(
      !question ||
      !slot
    ){

      throw new Error(
        'Resultado incompleto'
      );

    }


    if(
      question.accepted !== true
    ){

      throw new Error(
        'El Judge no aprobó el reactivo'
      );

    }


    if(
      question.slotId !==
      expectedSlot.slotId
    ){

      throw new Error(
        'El reactivo perdió su slotId'
      );

    }


    if(
      slot.slotId !==
      expectedSlot.slotId
    ){

      throw new Error(
        'El slot generado no coincide con el original'
      );

    }


    if(
      slot.interactionType !==
      expectedSlot.interactionType
    ){

      throw new Error(
        'Cambió el formato del slot'
      );

    }


    if(
      slot.difficulty?.level !==
      expectedSlot.difficulty?.level
    ){

      throw new Error(
        'Cambió la dificultad del slot'
      );

    }


    return generated;

  }



  // The opt-in checker only observes memory after Generator and Judge approval.
  // No fingerprints or memory entries escape this closure into diagnostics.
  function createHistoryChecker(){
    const history = {enabled:true,status:'not_checked',checked:0,skipped:0,duplicates:0,complete:false,issues:[]};
    const snapshot = () => JSON.parse(JSON.stringify(history));
    function inspect(){
      const memory = window.NOA_QUESTION_MEMORY_V25_2;
      try{
        if(typeof memory?.stats !== 'function' || typeof memory?.contains !== 'function'){
          return {memory,status:'unavailable',error:'api_unavailable'};
        }
        const stats = memory.stats();
        if(stats?.ok !== true){
          const error = stats?.error || 'invalid_memory_stats';
          return {memory,status:error === 'corrupt_storage' ? 'corrupt' : 'unavailable',error};
        }
        if(!Number.isSafeInteger(stats.uniqueQuestions) || stats.uniqueQuestions < 0 ||
          !Number.isSafeInteger(stats.totalSeen) || stats.totalSeen < stats.uniqueQuestions){
          return {memory,status:'unavailable',error:'invalid_memory_stats'};
        }
        return {memory,status:stats.uniqueQuestions ? 'ready' : 'empty'};
      }catch{ return {memory,status:'unavailable',error:'memory_exception'}; }
    }
    function issue(state,context,skipped){
      history.status = state.status;
      if(skipped) history.skipped++;
      history.issues.push({...context,reason:state.error || 'memory_check_failed'});
      history.complete = false;
    }
    async function check(question,context,canonicalKey = false){
      const before = inspect();
      let key = null, keyError = null;
      if(canonicalKey){
        try{
          if(!globalThis.crypto?.subtle) keyError = 'crypto_unavailable';
          else if(typeof before.memory?.fingerprint !== 'function') keyError = 'api_unavailable';
          else{
            const hash = await before.memory.fingerprint(question);
            if(typeof hash === 'string' && /^qm1:sha256:[a-f0-9]{64}$/.test(hash)) key = hash;
            else keyError = 'fingerprint_unavailable';
          }
        }catch{ keyError = 'fingerprint_unavailable'; }
      }
      if(before.error || keyError){
        issue(before.error ? before : {status:'unavailable',error:keyError},context,true);
        return {duplicate:false,key};
      }
      try{
        const result = await before.memory.contains(question,{details:true});
        if(!result || result.ok !== true || typeof result.contains !== 'boolean'){
          const error = result?.ok === false && typeof result.error === 'string' ? result.error : 'invalid_memory_result';
          issue({status:error === 'corrupt_storage' ? 'corrupt' : 'unavailable',error},context,true);
          return {duplicate:false,key};
        }
        history.checked++;
        if(result.contains) history.duplicates++;
        const after = inspect();
        if(after.memory !== before.memory || after.error){
          issue(after.error ? after : {status:'unavailable',error:'memory_changed'},context,false);
        }else{
          history.status = after.status;
          history.complete = history.checked > 0 && history.skipped === 0 && history.issues.length === 0;
        }
        return {duplicate:result.contains,key};
      }catch{
        issue({status:'unavailable',error:'memory_check_failed'},context,true);
        return {duplicate:false,key};
      }
    }
    return {check,snapshot};
  }



  const protectedJson = value => JSON.stringify(value,(_,item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
  const scientificNorm = value => String(value || '').normalize('NFC').replace(/\s+/gu,' ').trim();
  function diversityContentKey(question){
    const list = values => values.map(scientificNorm).sort();
    const content = {format:question.interactionType,instruction:scientificNorm(question.instruction),
      text:scientificNorm(question.text),stem:scientificNorm(question.stem)};
    if(question.interactionType === 'single_select'){
      delete content.instruction;
      content.options = list(question.options);
    }
    if(question.interactionType === 'drag_classify'){
      content.elements = list(question.elements.map(item => item.text));
      content.targets = list(question.targets.map(item => item.label));
    }
    if(question.interactionType === 'inline_select'){
      delete content.instruction;
      const blanks = new Map(question.blanks.map(blank => [blank.id,blank]));
      const ordered = [];
      content.text = scientificNorm(question.text.replace(/\[\[([^\]]+)\]\]/g,(_,id) => {
        ordered.push(list(blanks.get(id).options));
        return ' espacio ';
      }));
      content.blanks = ordered;
    }
    if(question.interactionType === 'drag_order') content.items = list(question.items.map(item => item.text));
    return JSON.stringify(content);
  }
  function validateProtectedSlot(slot,original){
    for(const field of ['subject','index','slotId','difficulty','calibratorDifficulty','interactionType','requestedSourceType','locked']){
      if(protectedJson(slot?.[field]) !== protectedJson(original[field])){
        throw new Error(`La reposición cambió el campo bloqueado ${field}.`);
      }
    }
    if(!slot.source || !slot.sourceType || !Array.isArray(slot.syllabusCodes)){
      throw new Error('La reposición perdió su fuente.');
    }
  }

  async function generateWithHistory(blueprint,eligible,selected,wanted,parallel,maxAttempts){
    const checker = createHistoryChecker();
    const attempts = Math.ceil(Math.max(1,Math.min(3,Number(maxAttempts) || 2)));
    const duplicates = [], historicalDuplicates = [], replacements = [], attemptHistory = [];
    const seen = new Set(), contents = new Set(), ids = new Set();
    let generationErrors = 0;
    const settled = await mapLimit(selected,parallel,async original => {
      let current = original, lastError = null, lastReason = null;
      const history = [];
      for(let attempt = 1; attempt <= attempts; attempt++){
        let reason = 'generation_error';
        try{
          if(attempt > 1){
            const next = window.NOA_SOURCE_BLUEPRINT.replaceSlot(JSON.parse(JSON.stringify(original)),attempt-1);
            validateProtectedSlot(next,original);
            replacements.push({slotId:original.slotId,attempt,reason:lastReason,
              fromSlot:JSON.parse(JSON.stringify(current)),toSlot:JSON.parse(JSON.stringify(next))});
            current = next;
          }
          const result = validateResult(await window.NOA_BLUEPRINT_GENERATOR.generateSlot(
            JSON.parse(JSON.stringify(current)),{maxAttempts:1}),current);
          validateProtectedSlot(result.slot,current);
          if(protectedJson(result.slot) !== protectedJson(current)){
            throw new Error('Generator cambió el Blueprint del slot.');
          }
          const question = result.question;
          if(protectedJson(question.blueprintSlot) !== protectedJson(current) ||
            ['interactionType','sourceType','requestedSourceType'].some(field => question[field] !== current[field]) ||
            question.difficulty !== current.difficulty.level ||
            question.blueprint !== undefined && question.blueprint?.difficulty !== current.difficulty.level ||
            question.syllabusCode !== undefined && question.syllabusCode !== '' && !current.syllabusCodes.includes(question.syllabusCode) ||
            question.syllabusCodes !== undefined && protectedJson(question.syllabusCodes) !== protectedJson(current.syllabusCodes) ||
            question.sourceTrace !== undefined && protectedJson(question.sourceTrace) !== protectedJson(current.source)){
            throw new Error('El reactivo cambió su formato, dificultad o trazabilidad.');
          }
          if(question.subject !== undefined && question.subject !== current.subject ||
            question.blueprintSlot?.subject !== undefined && question.blueprintSlot.subject !== current.subject){
            throw new Error('El reactivo cambió de materia.');
          }
          const check = await checker.check(question,{slotId:original.slotId,attempt},true);
          if(check.duplicate){
            reason = 'historical_duplicate';
            historicalDuplicates.push({slotId:original.slotId,attempt,reason});
            throw new Error(reason);
          }
          const key = check.key || questionKey(question,`slot:${original.slotId}`);
          const contentKey = diversityContentKey(question);
          // Both the check and reservations happen together after asynchronous memory work.
          if(seen.has(key) || contents.has(contentKey) || question.id && ids.has(question.id)){
            reason = 'internal_duplicate';
            duplicates.push({slotId:original.slotId,attempt,reason,kind:seen.has(key) || contents.has(contentKey) ? 'content' : 'id'});
            throw new Error(reason);
          }
          seen.add(key);
          contents.add(contentKey);
          if(question.id) ids.add(question.id);
          return {...result,attempts:attempt,duplicate:false};
        }catch(error){
          if(isQuotaError(error))throw error;
          lastError = error?.message || String(error);
          lastReason = reason;
          if(reason === 'generation_error') generationErrors++;
          const event = {slotId:original.slotId,attempt,reason,error:lastError};
          history.push(event);
          attemptHistory.push(event);
        }
      }
      return {failed:true,slotId:original.slotId,interactionType:original.interactionType,
        difficulty:original.difficulty?.level,attempts:history.length,error:lastError,history};
    });
    const generated = [], failures = [];
    settled.forEach((result,index) => {
      if(result.status === 'rejected'){
        generationErrors++;
        failures.push({slotId:selected[index].slotId,error:result.reason?.message || String(result.reason)});
      }else if(result.value.failed) failures.push(result.value);
      else generated.push(result.value);
    });
    const scores = generated.map(item => item.question?.judge?.qualityScore).filter(Number.isFinite);
    const history = checker.snapshot();
    const diagnostics = {accepted:generated.length,internalDuplicates:duplicates.length,
      historicalDuplicates:historicalDuplicates.length,replacements:replacements.length,generationErrors,history};
    const complete = generated.length === wanted && failures.length === 0;
    return {blueprint,eligibleSlots:eligible,selectedSlots:selected,generated,failures,duplicates,historicalDuplicates,
      replacements,attemptHistory,diagnostics,complete,
      summary:{blueprintSlots:blueprint.slots.length,eligibleSlots:eligible.length,requested:wanted,
        generated:generated.length,accepted:generated.length,duplicates:duplicates.length,failures:failures.length,
        averageJudge:scores.length ? Math.round(scores.reduce((sum,value)=>sum+value,0)/scores.length*10)/10 : null,
        internalDuplicates:duplicates.length,historicalDuplicates:historicalDuplicates.length,
        replacements:replacements.length,generationErrors,history,complete}};
  }

  // =====================================
  // GENERAR LOTE
  // =====================================

  async function generate({

    subject,

    blueprintCount = 10,

    limit = 3,

    concurrency = 2,

    maxAttempts = 2,

    diversifyTopics = false,

    avoidHistoryDuplicates = false

  } = {}){

    if(typeof diversifyTopics !== 'boolean' || typeof avoidHistoryDuplicates !== 'boolean'){
      throw new Error('Las opciones de diversidad deben ser booleanas.');
    }


    if(
      !window
        .NOA_SOURCE_BLUEPRINT
    ){

      throw new Error(
        'Source Blueprint v8 no está cargado'
      );

    }


    if(
      !window
        .NOA_BLUEPRINT_GENERATOR
    ){

      throw new Error(
        'Generator Bridge v9 no está cargado'
      );

    }


    const target =
      String(
        subject || ''
      ).trim();


    if(!target){

      throw new Error(
        'Falta la materia'
      );

    }


    const total =
      clamp(
        blueprintCount,
        1,
        180
      );


    const wanted =
      clamp(
        limit,
        1,
        10
      );


    const parallel =
      clamp(
        concurrency,
        1,
        3
      );


    // =================================
    // BLUEPRINT COMPLETO
    // =================================

    const blueprint =
      window
        .NOA_SOURCE_BLUEPRINT
        .build({

          subject:
            target,

          count:
            total,

          ...(diversifyTopics ? {diversifyTopics:true,supportedInteractionTypes:SUPPORTED_TYPES} : {})

        });


    const eligible =
      blueprint
        .slots
        .filter(
          isSupported
        );


    if(!eligible.length){

      throw new Error(
        'Este blueprint no contiene todavía ' +
        'formatos soportados por v9'
      );

    }


    const selected =
      eligible.slice(
        0,
        wanted
      );


    console.log(
      'NOA v10 generará:',
      selected.map(
        slot => ({

          slot:
            slot.slotId,

          source:
            slot.sourceType,

          difficulty:
            slot.difficulty?.level,

          format:
            slot.interactionType,

          codes:
            slot.syllabusCodes

        })
      )
    );


    if(avoidHistoryDuplicates){
      return generateWithHistory(blueprint,eligible,selected,wanted,parallel,maxAttempts);
    }

    // =================================
    // GENERAR
    // =================================

    const settled =
      await mapLimit(

        selected,

        parallel,

        async slot => {

          const result =
            await window
              .NOA_BLUEPRINT_GENERATOR
              .generateSlot(

                slot,

                {
                  maxAttempts
                }

              );


          return validateResult(
            result,
            slot
          );

        }

      );


    // =================================
    // ORGANIZAR RESULTADOS
    // =================================

    const generated = [];

    const failures = [];

    const seen =
      new Set();


    settled.forEach(
      (
        result,
        index
      ) => {

        const slot =
          selected[index];


        if(
          result.status ===
          'rejected'
        ){

          failures.push({

            slotId:
              slot.slotId,

            interactionType:
              slot.interactionType,

            difficulty:
              slot.difficulty?.level,

            error:
              result.reason?.message ||
              String(
                result.reason
              )

          });


          return;
        }


        const item =
          result.value;


        const key =
  questionKey(
    item.question,
    `slot:${slot.slotId}`
  );


        const duplicate =
          seen.has(key);


        if(!duplicate){

          seen.add(key);

        }


        generated.push({

          ...item,

          duplicate

        });

      }
    );


    // =================================
    // RESUMEN
    // =================================

    const summary = {

      blueprintSlots:
        blueprint.slots.length,

      eligibleSlots:
        eligible.length,

      requested:
        selected.length,

      generated:
        generated.length,

      accepted:
        generated.filter(
          x =>
            x.question
              ?.accepted === true
        ).length,

      duplicates:
        generated.filter(
          x =>
            x.duplicate
        ).length,

      failures:
        failures.length,

      averageJudge:
        (() => {

          const scores =
            generated
              .map(
                x =>
                  x.question
                    ?.judge
                    ?.qualityScore
              )
              .filter(
                Number.isFinite
              );


          if(!scores.length){
            return null;
          }


          return Math.round(
            (
              scores.reduce(
                (a,b) =>
                  a + b,
                0
              ) /
              scores.length
            ) * 10
          ) / 10;

        })()

    };


    return {

      blueprint,

      eligibleSlots:
        eligible,

      selectedSlots:
        selected,

      generated,

      failures,

      summary

    };

  }


  // =====================================
  // TABLA DE INSPECCIÓN
  // =====================================

  function table(
    result
  ){

    const rows =
      (
        result?.generated ||
        []
      ).map(
        item => ({

          slot:
            item.slot.slotId,

          source:
            item.slot.sourceType,

          difficulty:
            item.slot
              .difficulty
              ?.level,

          format:
            item.slot
              .interactionType,

          attempts:
            item.attempts,

          judge:
            item.question
              ?.judge
              ?.qualityScore,

          accepted:
            item.question
              ?.accepted,

          duplicate:
            item.duplicate,

          code:
            item.question
              ?.syllabusCode

        })
      );


    console.table(
      rows
    );


    return rows;

  }


  // =====================================
  // API GLOBAL
  // =====================================

  window.NOA_BATCH_ORCHESTRATOR = {

    version:
      VERSION,

    supportedTypes:
      SUPPORTED_TYPES,

    generate,

    table

  };


  console.log(
    'NOA EXCOBA Batch Orchestrator v10 ✓'
  );

})();
