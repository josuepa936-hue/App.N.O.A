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


    async function runner(){

      while(true){

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


  // =====================================
  // GENERAR LOTE
  // =====================================

  async function generate({

    subject,

    blueprintCount = 10,

    limit = 3,

    concurrency = 2,

    maxAttempts = 2

  } = {}){


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
            total

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
