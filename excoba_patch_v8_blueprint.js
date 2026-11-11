/* =========================================================
   NOA EXCOBA SOURCE BLUEPRINT v8

   Decide ANTES de generar cada reactivo:

   - dificultad fija
   - tipo de fuente
   - punto oficial / fuente de curso
   - formato de interacción
   - trazabilidad

   No genera preguntas todavía.
   ========================================================= */

(() => {

  const VERSION = '8.0';


  // =====================================
  // CICLO BASE
  // =====================================

  const BASE_DIFFICULTY_CYCLE = [
    1,
    2, 2,
    3, 3, 3,
    4, 4, 4,
    5
  ];


  const SOURCE_TYPES = [
    'official',
    'extended',
    'course'
  ];


  // =====================================
  // UTILIDADES
  // =====================================

  function clampDifficulty(value){

    const n = Number(value);

    if(!Number.isFinite(n)){
      return 3;
    }

    return Math.max(
      1,
      Math.min(5, Math.round(n))
    );

  }


  function unique(values){

    return [
      ...new Set(
        values
          .filter(Boolean)
          .map(v =>
            String(v)
              .trim()
              .replace(/\.$/,'')
          )
      )
    ];

  }


  // =====================================
  // MOTORES EXISTENTES
  // =====================================

  function realismEngine(){

    return (
      window.NOA_EXCOBA_REALISM ||
      null
    );

  }


  function sourceEngine(){

    return (
      window.NOA_SOURCE_ENGINE ||
      null
    );

  }


  function officialEngine(){

    return (
      window.NOA_EXCOBA_V4 ||
      null
    );

  }


  // =====================================
  // PERFIL DE ENTRENAMIENTO
  // =====================================

  function currentProfile(){

    const source =
      sourceEngine();

    const profile =
      source?.getProfile?.();


    if(profile){

      return {
        key:
          profile.key ||
          'official',

        label:
          profile.label ||
          'Simulacro oficial',

        official:
          Number(profile.official) || 0,

        extended:
          Number(profile.extended) || 0,

        course:
          Number(profile.course) || 0,

        challenge:
          !!profile.challenge
      };

    }


    return {

      key:'official',

      label:'Simulacro oficial',

      official:1,

      extended:0,

      course:0,

      challenge:false

    };

  }


  function normalizedWeights(profile){

    const weights = {

      official:
        Math.max(
          0,
          Number(profile.official) || 0
        ),

      extended:
        Math.max(
          0,
          Number(profile.extended) || 0
        ),

      course:
        Math.max(
          0,
          Number(profile.course) || 0
        )

    };


    const total =
      weights.official +
      weights.extended +
      weights.course;


    if(total <= 0){

      return {
        official:1,
        extended:0,
        course:0
      };

    }


    return {

      official:
        weights.official / total,

      extended:
        weights.extended / total,

      course:
        weights.course / total

    };

  }


  // =====================================
  // DISTRIBUCIÓN EXACTA DE FUENTES
  // =====================================

  function allocateSourceCounts(
    count,
    profile
  ){

    const weights =
      normalizedWeights(profile);


    const rows =
      SOURCE_TYPES.map(
        (type,index) => {

          const raw =
            weights[type] * count;

          const base =
            Math.floor(raw);

          return {

            type,

            index,

            raw,

            count:base,

            fraction:
              raw - base

          };

        }
      );


    let remaining =
      count -
      rows.reduce(
        (sum,row) =>
          sum + row.count,
        0
      );


    const priority =
      [...rows]
        .sort(
          (a,b) =>
            b.fraction -
              a.fraction ||

            a.index -
              b.index
        );


    let cursor = 0;


    while(remaining > 0){

      priority[
        cursor %
        priority.length
      ].count++;

      remaining--;

      cursor++;

    }


    return Object.fromEntries(
      rows.map(row => [
        row.type,
        row.count
      ])
    );

  }


  // =====================================
  // INTERCALAR LAS FUENTES
  // =====================================

  function spreadSourceTypes(
    counts,
    total
  ){

    const marks = [];


    SOURCE_TYPES.forEach(
      (type,typeIndex) => {

        const amount =
          counts[type] || 0;


        if(!amount){
          return;
        }


        for(
          let i=0;
          i<amount;
          i++
        ){

          marks.push({

            type,

            typeIndex,

            position:
              (
                i + 0.5
              ) *
              total /
              amount

          });

        }

      }
    );


    marks.sort(
      (a,b) =>
        a.position -
          b.position ||

        a.typeIndex -
          b.typeIndex
    );


    return marks.map(
      x => x.type
    );

  }


  // =====================================
  // CALIBRATOR
  // =====================================

  function calibrationState(){

    let calibration = null;


    try{

      calibration =
        window
          .NOA_CALIBRATOR
          ?.get?.() ||
        null;

    }catch(err){

      console.warn(
        'NOA Blueprint: ' +
        'Calibrator no disponible',
        err
      );

    }


    const adaptive =
      Boolean(

        calibration &&

        Number(
          calibration.sample
        ) >= 5 &&

        Array.isArray(
          calibration.cycle
        ) &&

        calibration
          .cycle
          .length

      );


    const cycle =
      adaptive

        ? calibration
            .cycle
            .map(
              clampDifficulty
            )

        : [
            ...BASE_DIFFICULTY_CYCLE
          ];


    return {

      adaptive,

      calibration,

      cycle

    };

  }


  // =====================================
  // TEMARIO OFICIAL
  // =====================================

  function officialItems(subject){

    try{

      return (
        officialEngine()
          ?.itemsFor?.(subject) ||
        []
      );

    }catch{

      return [];

    }

  }


  function findOfficialByCode(
    items,
    code
  ){

    const target =
      String(code || '')
        .trim()
        .replace(/\.$/,'');


    if(!target){
      return null;
    }


    return (
      items.find(
        item =>
          String(
            item.code || ''
          )
            .trim()
            .replace(/\.$/,'') ===
          target
      ) ||
      null
    );

  }


  // =====================================
  // FUENTES DEL CURSO
  // =====================================

  function readyCourseSources(
    subject
  ){

    try{

      return (
        sourceEngine()
          ?.getCourseSources?.(
            subject
          ) ||
        []
      ).filter(
        source =>
          source &&
          source.analysisStatus ===
            'ready' &&
          source.analysis
      );

    }catch{

      return [];

    }

  }


  function codesFromCourseSource(
    source
  ){

    const analysis =
      source?.analysis;


    if(!analysis){
      return [];
    }


    const linkCodes =
      (
        analysis
          .syllabus_links ||
        []
      ).map(
        link =>
          link.code
      );


    const conceptCodes =
      (
        analysis
          .concepts ||
        []
      ).flatMap(
        concept =>
          concept
            .syllabus_codes ||
          []
      );


    return unique([
      ...linkCodes,
      ...conceptCodes
    ]);

  }


  // Topic diversity is an explicit source preference, separate from slot index,
  // format, calibration and source allocation. It never writes question memory.
  const topicCode = value => value == null ? null : String(value).trim().replace(/\.$/,'') || null;
  const topicRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const topicClone = value => JSON.parse(JSON.stringify(value));

  function diversityCandidates(subject){
    const seen = new Set();
    return officialItems(subject).flatMap((item,index) => {
      const code = topicCode(item?.code);
      if(!code || seen.has(code)) return [];
      seen.add(code);
      return [{code, index, item}];
    });
  }

  function topicMemorySnapshot(subject,candidates){
    const result = {memoryStatus:'unavailable', frequencies:new Map(), unmappedRecords:0};
    const memory = window.NOA_QUESTION_MEMORY_V25_2;
    if(typeof memory?.stats !== 'function' || typeof memory?.recent !== 'function') return result;
    try{
      const stats = memory.stats(subject);
      if(!topicRecord(stats) || stats.ok !== true){
        result.memoryStatus = stats?.error === 'corrupt_storage' || stats?.error === 'rollback_failed' ? 'invalid' : 'unavailable';
        return result;
      }
      const records = memory.recent(subject,Number.MAX_SAFE_INTEGER);
      if(!Array.isArray(records) || !Number.isSafeInteger(stats.uniqueQuestions) || stats.uniqueQuestions < 0 ||
        !Number.isSafeInteger(stats.totalSeen) || stats.totalSeen < 0 || stats.uniqueQuestions !== records.length){
        result.memoryStatus = 'invalid'; return result;
      }
      const known = new Set(candidates.map(candidate => candidate.code));
      const frequencies = new Map();
      let total = 0, unmapped = 0;
      for(const entry of records){
        if(!topicRecord(entry) || entry.subject !== subject || !Number.isSafeInteger(entry.timesSeen) || entry.timesSeen < 1 ||
          typeof entry.lastSeenAt !== 'string' || !Number.isFinite(Date.parse(entry.lastSeenAt)) ||
          !(entry.syllabusCode === null || typeof entry.syllabusCode === 'string' && entry.syllabusCode.trim())){
          result.memoryStatus = 'invalid'; return result;
        }
        total += entry.timesSeen;
        if(!Number.isSafeInteger(total)){ result.memoryStatus = 'invalid'; return result; }
        const code = topicCode(entry.syllabusCode);
        if(!code || !known.has(code)){ unmapped++; continue; }
        const at = new Date(entry.lastSeenAt).toISOString();
        const prior = frequencies.get(code) || {timesSeen:0,lastSeenAt:null};
        prior.timesSeen += entry.timesSeen;
        if(!Number.isSafeInteger(prior.timesSeen)){ result.memoryStatus = 'invalid'; return result; }
        if(prior.lastSeenAt === null || Date.parse(at) > Date.parse(prior.lastSeenAt)) prior.lastSeenAt = at;
        frequencies.set(code,prior);
      }
      if(total !== stats.totalSeen){ result.memoryStatus = 'invalid'; return result; }
      return {memoryStatus:records.length ? 'ready' : 'empty',frequencies,unmappedRecords:unmapped};
    }catch{ return result; }
  }

  function createDiversityContext(subject,usage = null,replacement = null){
    const candidates = diversityCandidates(subject);
    const memory = topicMemorySnapshot(subject,candidates);
    const uses = new Map(candidates.map(candidate => [candidate.code,0]));
    let validUsage = true;
    if(usage !== null){
      if(!topicRecord(usage)) validUsage = false;
      else for(const [code,value] of Object.entries(usage)){
        if(!Number.isSafeInteger(value) || value < 0){ validUsage = false; break; }
        if(uses.has(code)) uses.set(code,value);
      }
    }
    if(!validUsage) for(const code of uses.keys()) uses.set(code,0);
    if(replacement?.originalCode && uses.has(replacement.originalCode)){
      uses.set(replacement.originalCode,Math.max(0,uses.get(replacement.originalCode)-1));
    }
    return {...memory,subject,candidates,uses,replacement,validUsage};
  }

  function diversityUsage(context){
    return Object.fromEntries(context.candidates.filter(candidate => context.uses.get(candidate.code) > 0)
      .map(candidate => [candidate.code,context.uses.get(candidate.code)]));
  }

  function reserveCourseTopics(context,sourceSequence){
    context.courseReservations = new Map();
    sourceSequence.forEach((requested,index) => {
      if(requested !== 'course') return;
      const resolved = resolveCourseSource(context.subject,index,0);
      const codes = unique(resolved.syllabusCodes || []);
      const code = codes.length === 1 ? topicCode(codes[0]) : null;
      if(resolved.actualType !== 'course' || !context.uses.has(code)) return;
      context.courseReservations.set(index,code);
      context.uses.set(code,context.uses.get(code)+1);
    });
  }

  function consumeCourseReservation(context,index){
    if(!context.courseReservations?.has(index)) return;
    const code = context.courseReservations.get(index);
    context.uses.set(code,Math.max(0,context.uses.get(code)-1));
    context.courseReservations.delete(index);
  }

  // Replacements may run independently from JSON-cloned slots. Give each slot
  // disjoint spare topics so concurrent retries cannot claim the same free code.
  function reserveReplacementTopics(context,slots){
    const occupied = new Map();
    for(const slot of slots){
      for(const code of new Set((slot.syllabusCodes || []).map(topicCode).filter(Boolean))){
        occupied.set(code,(occupied.get(code) || 0)+1);
      }
    }
    const eligible = slots.filter(slot => slot.sourceType !== 'course');
    for(const slot of eligible){
      const codes = unique(slot.syllabusCodes || []).map(topicCode).filter(Boolean);
      const own = codes.length === 1 && occupied.get(codes[0]) === 1 && context.uses.has(codes[0]) ? [codes[0]] : [];
      slot.topicDiversity.replacementCodes = own;
    }
    if(!eligible.length) return;
    const free = rankTopicCandidates(context,context.candidates).filter(candidate => !occupied.has(candidate.code));
    free.forEach((candidate,index) => eligible[index % eligible.length].topicDiversity.replacementCodes.push(candidate.code));
  }

  function replacementTopicCodes(slot){
    const codes = slot.topicDiversity.replacementCodes;
    if(codes === undefined) return [];
    if(!Array.isArray(codes) || codes.some(code => typeof code !== 'string' || !topicCode(code))){
      throw new Error('Las reservas de temas de la reposición no son válidas.');
    }
    const normalized = codes.map(topicCode);
    if(new Set(normalized).size !== normalized.length){
      throw new Error('Las reservas de temas de la reposición contienen códigos duplicados.');
    }
    return normalized;
  }

  function rankTopicCandidates(context,candidates){
    return [...candidates].sort((left,right) => {
      const a = context.frequencies.get(left.code), b = context.frequencies.get(right.code);
      return (context.uses.get(left.code) || 0) - (context.uses.get(right.code) || 0) ||
        (a?.timesSeen || 0) - (b?.timesSeen || 0) ||
        (a?.lastSeenAt ? Date.parse(a.lastSeenAt) : 0) - (b?.lastSeenAt ? Date.parse(b.lastSeenAt) : 0) || left.index - right.index;
    });
  }

  function chooseDiverseCode(context){
    const replacement = context.replacement;
    if(!context.candidates.length){
      if(replacement) throw new Error('No hay temas oficiales válidos para reponer el slot.');
      return null;
    }
    let ranked = rankTopicCandidates(context,context.candidates);
    if(replacement){
      const original = context.candidates.find(candidate => candidate.code === replacement.originalCode);
      const pool = new Set(replacement.replacementCodes);
      if(original) pool.add(original.code);
      const alternatives = context.validUsage
        ? ranked.filter(candidate => pool.has(candidate.code) && candidate.code !== original?.code &&
          context.uses.get(candidate.code) <= (original ? context.uses.get(original.code) : 0)) : [];
      if(!alternatives.length){
        if(original) return original.code;
        throw new Error('No hay una reserva de tema válida para reponer el slot sin duplicar otros temas.');
      }
      const best = alternatives[0], frequency = context.frequencies.get(best.code);
      const ties = alternatives.filter(candidate =>
        context.uses.get(candidate.code) === context.uses.get(best.code) &&
        (context.frequencies.get(candidate.code)?.timesSeen || 0) === (frequency?.timesSeen || 0) &&
        (context.frequencies.get(candidate.code)?.lastSeenAt || null) === (frequency?.lastSeenAt || null));
      return ties[(replacement.attempt - 1) % ties.length].code;
    }
    return ranked[0].code;
  }

  function diversifyResolvedSource(context,resolved,requestedType,index,variant){
    const coursePreserved = resolved.actualType === 'course';
    let code;
    if(coursePreserved){
      consumeCourseReservation(context,index);
      const codes = unique(resolved.syllabusCodes || []);
      code = codes.length === 1 ? topicCode(codes[0]) : null;
    }else{
      code = chooseDiverseCode(context);
      if(code) resolved = resolveSource(requestedType,context.subject,index,variant,code);
      code = topicCode(resolved.syllabusCodes?.[0]);
    }
    const mapped = code !== null && context.uses.has(code);
    const withinBlueprintUses = mapped ? context.uses.get(code) : null;
    const prior = mapped ? context.frequencies.get(code) : null;
    const hasHistory = ['ready','empty'].includes(context.memoryStatus);
    const mode = coursePreserved ? 'course_preserved' : hasHistory ? 'memory_priority' : 'coverage_fallback';
    let reason = coursePreserved ? 'course_mapping_unavailable' : !hasHistory ? 'coverage_without_history'
      : withinBlueprintUses > 0 ? 'controlled_reuse' : !prior ? 'unseen' : 'least_frequent_then_oldest';
    const replacement = context.replacement;
    const trace = {enabled:true,mode,memoryStatus:context.memoryStatus,selectedCode:code,
      priorFrequency:mapped && hasHistory ? prior?.timesSeen || 0 : null,
      lastSeenAt:mapped && hasHistory ? prior?.lastSeenAt || null : null,
      reason,withinBlueprintUses};
    if(replacement){
      trace.originalCode = replacement.originalCode;
      trace.originalCodes = [...replacement.originalCodes];
      trace.selectedCodes = unique(resolved.syllabusCodes || []);
      trace.codeChanged = JSON.stringify([...trace.selectedCodes].sort()) !== JSON.stringify([...trace.originalCodes].sort());
      trace.reason = trace.codeChanged && !coursePreserved ? 'replacement_alternative' : 'replacement_preserved';
      if(coursePreserved) trace.sourceResolution = 'legacy_course_mapping_unavailable';
    }
    if(mapped) context.uses.set(code,withinBlueprintUses+1);
    return {resolved,trace};
  }

  function topicDiversitySummary(context,slots){
    const selected = slots.map(slot => slot.topicDiversity.selectedCode).filter(Boolean);
    return {enabled:true,mode:['ready','empty'].includes(context.memoryStatus) ? 'memory_priority' : 'coverage_fallback',
      memoryStatus:context.memoryStatus,policy:'coverage_frequency_recency',candidateCount:context.candidates.length,
      uniqueSelectedCodes:new Set(selected).size,reusedSlots:selected.length-new Set(selected).size,
      unmappedRecords:context.unmappedRecords,coursePreservedSlots:slots.filter(slot => slot.sourceType === 'course').length};
  }


  // =====================================
  // RESOLVER FUENTE DEL SLOT
  // =====================================

  function resolveOfficialSource(
    subject,
    slotIndex,
    variant = 0,

    preferredCode = null
  ){

    const items =
      officialItems(subject);


    if(!items.length){

      throw new Error(
        'No encontré puntos oficiales ' +
        'para ' + subject
      );

    }


    const item =
      (preferredCode === null ? null : items.find(candidate => topicCode(candidate.code) === preferredCode)) ||
      items[
        (
          slotIndex +
          variant
        ) %
        items.length
      ];


    return {

      actualType:
        'official',

      fallbackFrom:
        null,

      syllabusCodes:[
        String(item.code)
      ],

      source:{

        kind:'official',

        code:
          item.code,

        title:
          item.title || '',

        focus:
          item.focus || '',

        page:
          item.page || null

      }

    };

  }


  function resolveExtendedSource(
    subject,
    slotIndex,
    variant = 0,

    preferredCode = null
  ){

    const items =
      officialItems(subject);


    if(!items.length){

      throw new Error(
        'No hay punto oficial que ' +
        'pueda servir como ancla'
      );

    }


    const item =
      (preferredCode === null ? null : items.find(candidate => topicCode(candidate.code) === preferredCode)) ||
      items[
        (
          slotIndex * 3 +
          variant
        ) %
        items.length
      ];


    return {

      actualType:
        'extended',

      fallbackFrom:
        null,

      syllabusCodes:[
        String(item.code)
      ],

      source:{

        kind:
          'extended',

        anchorCode:
          item.code,

        anchorTitle:
          item.title || '',

        anchorFocus:
          item.focus || '',

        rule:
          'natural_extension',

        note:
          'El reactivo puede ampliar ' +
          'el concepto, pero debe ' +
          'permanecer trazable al ' +
          'punto oficial indicado.'

      }

    };

  }


  function resolveCourseSource(
    subject,
    slotIndex,
    variant = 0,

    preferredCode = null
  ){

    const sources =
      readyCourseSources(
        subject
      );


    // Si no hay material analizado,
    // NO fingimos que usamos el curso.

    if(!sources.length){

      const fallback =
        resolveOfficialSource(
          subject,
          slotIndex,
          variant,
          preferredCode
        );


      return {

        ...fallback,

        fallbackFrom:
          'course',

        fallbackReason:
          'no_ready_course_source'

      };

    }


    const source =
      sources[
        (
          slotIndex +
          variant
        ) %
        sources.length
      ];


    const analysis =
      source.analysis || {};


    const objectives =
      analysis
        .evaluable_objectives ||
      [];


    const objective =
      objectives.length

        ? objectives[
            (
              slotIndex +
              variant
            ) %
            objectives.length
          ]

        : null;


    const codes =
      codesFromCourseSource(
        source
      );


    const items =
      officialItems(
        subject
      );


    const officialAnchor =
      codes
        .map(
          code =>
            findOfficialByCode(
              items,
              code
            )
        )
        .find(Boolean) ||
      null;


    return {

      actualType:
        'course',

      fallbackFrom:
        null,

      syllabusCodes:
        codes,

      source:{

        kind:
          'course',

        courseSourceId:
          source.id,

        title:
          source.title || '',

        material:
          String(
            source.content || ''
          )
            .slice(
              0,
              6000
            ),

        classification:
          analysis
            .overall_classification ||
          'course_only',

        depth:
          analysis
            .estimated_depth ||
          'intermediate',

        objective:
          objective
            ? {
                type:
                  objective.type,

                text:
                  objective.objective,

                suggestedDifficulty:
                  objective
                    .suggested_difficulty
              }
            : null,

        officialAnchor:
          officialAnchor
            ? {
                code:
                  officialAnchor.code,

                title:
                  officialAnchor.title,

                focus:
                  officialAnchor.focus
              }
            : null

      }

    };

  }


  function resolveSource(
    requestedType,
    subject,
    slotIndex,
    variant = 0,

    preferredCode = null
  ){

    if(
      requestedType ===
      'course'
    ){

      return resolveCourseSource(
        subject,
        slotIndex,
        variant,
        preferredCode
      );

    }


    if(
      requestedType ===
      'extended'
    ){

      return resolveExtendedSource(
        subject,
        slotIndex,
        variant,
        preferredCode
      );

    }


    return resolveOfficialSource(
      subject,
      slotIndex,
      variant,
      preferredCode
    );

  }


  // =====================================
  // INTERACCIÓN EXCOBA
  // =====================================

  function chooseInteractionType(
    subject,
    slotIndex,
    difficulty,
    allowedInteractionTypes = null
  ){

    const realism =
      realismEngine();


    const allowed =
      allowedInteractionTypes ||
      realism
        ?.formatsForSubject?.(
          subject
        ) ||
      ['single_select'];


    if(!allowed.length){

      return 'single_select';

    }


    // Determinista.
    // Todavía NO asumimos frecuencias
    // oficiales que las capturas
    // no hayan demostrado.

    return allowed[
      (
        slotIndex +
        difficulty -
        1
      ) %
      allowed.length
    ];

  }


  // =====================================
  // CREAR SLOT
  // =====================================

  function makeSlot({

    subject,

    index,

    requestedSourceType,

    variant = 0,

    profile,

    cycle,

    fixedDifficulty = null,

    fixedInteractionType = null,

    fixedCalibratorDifficulty = null,

    allowedInteractionTypes = null,

    topicContext = null

  }){


    const baseDifficulty =
      fixedCalibratorDifficulty ??
      clampDifficulty(
        cycle[
          index %
          cycle.length
        ]
      );


    const finalDifficulty =
      fixedDifficulty ??

      (
        profile.challenge

          ? Math.min(
              5,
              baseDifficulty + 1
            )

          : baseDifficulty
      );


    const interactionType =
      fixedInteractionType ||

      chooseInteractionType(
        subject,
        index,
        finalDifficulty,
        allowedInteractionTypes
      );


    const realism =
      realismEngine()
        ?.makeBlueprint?.({

          subject,

          difficulty:
            finalDifficulty,

          sourceType:
            requestedSourceType,

          interactionType

        });


    if(
      allowedInteractionTypes &&
      realism?.interactionType !== interactionType
    ){
      throw new Error(
        'Realism no conservó el formato compatible elegido: ' +
        interactionType
      );
    }


    let resolved =
      resolveSource(

        requestedSourceType,

        subject,

        index,

        variant

      );


    let topicDiversity = null;
    if(topicContext){
      const selected = diversifyResolvedSource(topicContext,resolved,requestedSourceType,index,variant);
      resolved = selected.resolved;
      topicDiversity = selected.trace;
    }
    resolved=window.NOA_EXCOBA_PREPARATION?.decorateSource(subject,resolved)||resolved;

    return {

      slotId:
        `noa-slot-${index + 1}`,

      index,

      subject,


      // Fuente solicitada por el perfil
      requestedSourceType,


      // Fuente que realmente podrá usarse
      sourceType:
        resolved.actualType,


      fallbackFrom:
        resolved.fallbackFrom ||
        null,

      fallbackReason:
        resolved.fallbackReason ||
        null,


      syllabusCodes:
        resolved.syllabusCodes ||
        [],


      source:
        resolved.source,


      // Dificultad original del calibrador
      calibratorDifficulty:
        baseDifficulty,


      // Dificultad final del slot
      difficulty:
        realism?.difficulty || {

          level:
            finalDifficulty

        },


      interactionType:
        realism
          ?.interactionType ||
        interactionType,


      responseFamily:
        realism
          ?.responseFamily ||
        'selection',


      // Elegibilidad.
      // El Scoring Engine decidirá
      // posteriormente si corresponde
      // crédito parcial en ESE reactivo.
      partialCreditEligible:
        !!realism
          ?.partialCredit,


      scoringMode:
        'item_defined',


      realismRules:
        realism
          ?.realismRules ||
        {},


      locked:{

        difficulty:true,

        interactionType:true,

        requestedSourceType:true

      },


      ...(topicDiversity ? {topicDiversity} : {}),

      variant

    };

  }


  // =====================================
  // CONSTRUIR BLUEPRINT COMPLETO
  // =====================================

  function build({

    subject,

    count = 10,

    supportedInteractionTypes,

    diversifyTopics = false

  } = {}){

    if(typeof diversifyTopics !== 'boolean') throw new Error('diversifyTopics debe ser booleano.');


    const target =
      String(
        subject || ''
      ).trim();


    if(!target){

      throw new Error(
        'Falta la materia del Blueprint'
      );

    }


    const total =
      Math.max(
        1,
        Math.min(
          180,
          Number(count) || 10
        )
      );


    if(!realismEngine()){

      throw new Error(
        'Realism Engine v7 no está cargado'
      );

    }


    if(!sourceEngine()){

      throw new Error(
        'Source Engine v6 no está cargado'
      );

    }


    // La restricción se resuelve antes de construir y bloquear los slots.
    // Sin este parámetro se conserva la selección y estructura anteriores.
    let allowedInteractionTypes = null;
    let interactionPolicy = null;
    if(supportedInteractionTypes !== undefined){
      if(
        !Array.isArray(supportedInteractionTypes) ||
        !supportedInteractionTypes.length ||
        supportedInteractionTypes.some(type =>
          typeof type !== 'string' || !type.trim()
        )
      ){
        throw new Error('supportedInteractionTypes debe ser una lista no vacía de formatos.');
      }
      const supported = [...new Set(supportedInteractionTypes)];
      const appropriate = realismEngine().formatsForSubject?.(target);
      allowedInteractionTypes = Array.isArray(appropriate)
        ? [...new Set(appropriate)].filter(type => supported.includes(type))
        : [];
      if(!allowedInteractionTypes.length){
        throw new Error('No hay formatos compatibles para la materia: ' + target);
      }
      interactionPolicy = {
        restricted:true,
        supportedInteractionTypes:supported,
        allowedInteractionTypes:[...allowedInteractionTypes],
        note:'Selección restringida por compatibilidad; no representa todas las interacciones ni las frecuencias oficiales del EXCOBA.'
      };
    }


    const profile =
      currentProfile();


    const calibration =
      calibrationState();


    const counts =
      allocateSourceCounts(
        total,
        profile
      );


    const sourceSequence =
      spreadSourceTypes(
        counts,
        total
      );


    const topicContext = diversifyTopics ? createDiversityContext(target) : null;
    if(topicContext) reserveCourseTopics(topicContext,sourceSequence);

    const slots =
      sourceSequence.map(
        (
          requestedSourceType,
          index
        ) =>

          makeSlot({

            subject:
              target,

            index,

            requestedSourceType,

            profile,

            cycle:
              calibration.cycle,

            allowedInteractionTypes,

            topicContext

          })

      );


    if(topicContext){
      reserveReplacementTopics(topicContext,slots);
      const usage = diversityUsage(topicContext);
      for(const slot of slots) slot.topicDiversity.blueprintUsage = {...usage};
    }

    return {

      engine:
        'NOA Source Blueprint',

      version:
        VERSION,

      createdAt:
        new Date()
          .toISOString(),

      subject:
        target,

      count:
        total,

      profile,

      calibration:{

        adaptive:
          calibration.adaptive,

        sample:
          Number(
            calibration
              .calibration
              ?.sample
          ) || 0,

        cycle:
          [
            ...calibration.cycle
          ]

      },

      requestedSourceCounts:
        counts,

      ...(interactionPolicy ? {interactionPolicy} : {}),

      ...(topicContext ? {topicDiversity:topicDiversitySummary(topicContext,slots)} : {}),

      slots

    };

  }


  // =====================================
  // REEMPLAZO DE SLOT
  // =====================================

  function replaceSlot(
    slot,
    attempt = 1
  ){

    if(!slot){

      throw new Error(
        'Falta el slot a reemplazar'
      );

    }


    const profile =
      currentProfile();


    const calibration =
      calibrationState();


    const replacementAttempt = Math.max(1, Number(attempt) || 1);
    const originalCodes = unique(slot.syllabusCodes || []);
    const originalCode = originalCodes.length === 1 ? topicCode(originalCodes[0]) : null;
    const topicEnabled = slot.topicDiversity?.enabled === true;
    const replacementCodes = topicEnabled ? replacementTopicCodes(slot) : null;
    const topicContext = topicEnabled
      ? createDiversityContext(slot.subject,slot.topicDiversity.blueprintUsage,{originalCode,originalCodes,replacementCodes,attempt:replacementAttempt}) : null;

    const next =
      makeSlot({

        subject:
          slot.subject,

        index:
          slot.index,

        requestedSourceType:
          slot.requestedSourceType,

        variant:
          Math.max(
            1,
            Number(attempt) || 1
          ),

        profile,

        cycle:
          calibration.cycle,

        // ESTO ES LO IMPORTANTE:
        // el reemplazo mantiene
        // exactamente la dificultad
        // y el formato originales.

        fixedDifficulty:
          slot.difficulty?.level ||
          3,

        fixedInteractionType:
          slot.interactionType,

        fixedCalibratorDifficulty:
          slot
            .calibratorDifficulty,

        topicContext

      });


    if(topicContext){
      if(next.interactionType !== slot.interactionType) throw new Error('Realism no conservó el formato bloqueado de la reposición.');
      next.difficulty = topicClone(slot.difficulty);
      next.calibratorDifficulty = slot.calibratorDifficulty;
      next.locked = topicClone(slot.locked);
      next.topicDiversity.blueprintUsage = diversityUsage(topicContext);
      if(slot.sourceType !== 'course') next.topicDiversity.replacementCodes = [...replacementCodes];
    }

    return {

      ...next,

      slotId:
        slot.slotId,

      replacementAttempt:
        Math.max(
          1,
          Number(attempt) || 1
        )

    };

  }


  // =====================================
  // RESUMEN PARA DEPURACIÓN
  // =====================================

  function summary(blueprint){

    const slots =
      blueprint?.slots || [];


    const countBy =
      key =>

        slots.reduce(
          (acc,slot) => {

            const value =
              typeof key ===
              'function'

                ? key(slot)

                : slot[key];


            const k =
              String(
                value ?? 'unknown'
              );


            acc[k] =
              (acc[k] || 0) + 1;


            return acc;

          },
          {}
        );


    return {

      subject:
        blueprint?.subject,

      total:
        slots.length,

      requestedSources:
        countBy(
          'requestedSourceType'
        ),

      actualSources:
        countBy(
          'sourceType'
        ),

      difficulty:
        countBy(
          slot =>
            slot
              .difficulty
              ?.level
        ),

      interactions:
        countBy(
          'interactionType'
        ),

      fallbacks:
        slots.filter(
          slot =>
            slot.fallbackFrom
        ).length

    };

  }


  // =====================================
  // API GLOBAL
  // =====================================

  window.NOA_SOURCE_BLUEPRINT = {

    version:
      VERSION,

    build,

    replaceSlot,

    summary,

    currentProfile,

    calibrationState,

    allocateSourceCounts

  };


  console.log(
    'NOA EXCOBA Source Blueprint v8 ✓'
  );

})();
