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


  // =====================================
  // RESOLVER FUENTE DEL SLOT
  // =====================================

  function resolveOfficialSource(
    subject,
    slotIndex,
    variant = 0
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
    variant = 0
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
    variant = 0
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
          variant
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
    variant = 0
  ){

    if(
      requestedType ===
      'course'
    ){

      return resolveCourseSource(
        subject,
        slotIndex,
        variant
      );

    }


    if(
      requestedType ===
      'extended'
    ){

      return resolveExtendedSource(
        subject,
        slotIndex,
        variant
      );

    }


    return resolveOfficialSource(
      subject,
      slotIndex,
      variant
    );

  }


  // =====================================
  // INTERACCIÓN EXCOBA
  // =====================================

  function chooseInteractionType(
    subject,
    slotIndex,
    difficulty
  ){

    const realism =
      realismEngine();


    const allowed =
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

    fixedCalibratorDifficulty = null

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
        finalDifficulty
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


    const resolved =
      resolveSource(

        requestedSourceType,

        subject,

        index,

        variant

      );


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


      variant

    };

  }


  // =====================================
  // CONSTRUIR BLUEPRINT COMPLETO
  // =====================================

  function build({

    subject,

    count = 10

  } = {}){


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
              calibration.cycle

          })

      );


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
            .calibratorDifficulty

      });


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
