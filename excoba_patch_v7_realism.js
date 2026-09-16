/* =========================================================
   NOA EXCOBA REALISM ENGINE v7
   Define la gramática de reactivos del EXCOBA.
   ========================================================= */

(() => {

  const ITEM_TYPES = {

    inline_select: {
      label: 'Selección en espacios',
      family: 'selection',
      partialCredit: true
    },

    drag_classify: {
      label: 'Clasificación por arrastre',
      family: 'drag',
      partialCredit: true
    },

    drag_order: {
      label: 'Ordenamiento',
      family: 'drag',
      partialCredit: true
    },

    number_line: {
      label: 'Ubicación en recta numérica',
      family: 'drag',
      partialCredit: true
    },

    numeric_input: {
      label: 'Escritura numérica',
      family: 'input',
      partialCredit: false
    },

    algebraic_input: {
      label: 'Escritura algebraica',
      family: 'input',
      partialCredit: false
    },

    single_select: {
      label: 'Selección única',
      family: 'selection',
      partialCredit: false
    }

  };


  // =====================================
  // FORMATOS COHERENTES POR MATERIA
  // =====================================

  function formatsForSubject(subject){

    const s =
      String(subject || '')
        .toLowerCase();


    if(s.includes('español')){

      return [
        'inline_select',
        'drag_classify',
        'drag_order',
        'single_select'
      ];

    }


    if(
      s.includes('matemática') ||
      s.includes('estadística')
    ){

      return [
        'number_line',
        'numeric_input',
        'algebraic_input',
        'drag_classify',
        'single_select'
      ];

    }


    if(s.includes('social')){

      return [
        'drag_classify',
        'drag_order',
        'inline_select',
        'single_select'
      ];

    }


    if(
      s.includes('biología') ||
      s.includes('natural')
    ){

      return [
        'inline_select',
        'drag_classify',
        'drag_order',
        'single_select'
      ];

    }


    if(s.includes('química')){

      return [
        'numeric_input',
        'drag_classify',
        'inline_select',
        'single_select'
      ];

    }


    return [
      'single_select',
      'inline_select',
      'drag_classify'
    ];

  }


  // =====================================
  // DIFICULTAD COGNITIVA
  // =====================================

  function difficultySpec(level){

    const n =
      Math.max(
        1,
        Math.min(5,Number(level)||3)
      );


    const specs = {

      1: {
        cognitive: 'recognition',
        reasoningSteps: 1,
        conceptsIntegrated: 1,
        elementCount: [2,3],
        representationShift: false,
        distractorSimilarity: 'low'
      },

      2: {
        cognitive: 'comprehension',
        reasoningSteps: 1,
        conceptsIntegrated: 1,
        elementCount: [3,4],
        representationShift: false,
        distractorSimilarity: 'medium'
      },

      3: {
        cognitive: 'application',
        reasoningSteps: 2,
        conceptsIntegrated: 1,
        elementCount: [3,5],
        representationShift: true,
        distractorSimilarity: 'medium'
      },

      4: {
        cognitive: 'integration',
        reasoningSteps: 2,
        conceptsIntegrated: 2,
        elementCount: [4,6],
        representationShift: true,
        distractorSimilarity: 'high'
      },

      5: {
        cognitive: 'multi_step',
        reasoningSteps: 3,
        conceptsIntegrated: 3,
        elementCount: [5,8],
        representationShift: true,
        distractorSimilarity: 'very_high'
      }

    };


    return {
      level:n,
      ...specs[n]
    };

  }


  // =====================================
  // BLUEPRINT DE REALISMO
  // =====================================

  function makeRealismBlueprint({

    subject,
    difficulty = 3,
    sourceType = 'official',
    interactionType = null

  } = {}){

    const allowed =
      formatsForSubject(subject);


    let type =
      interactionType;


    if(
      !type ||
      !allowed.includes(type)
    ){

      type =
        allowed[
          Math.floor(
            Math.random() *
            allowed.length
          )
        ];

    }


    const difficultyData =
      difficultySpec(difficulty);


    return {

      subject,

      sourceType,

      interactionType:type,

      responseFamily:
        ITEM_TYPES[type]?.family ||
        'selection',

      partialCredit:
        !!ITEM_TYPES[type]
          ?.partialCredit,

      difficulty:
        difficultyData,

      realismRules: {

        conciseInstruction:true,

        interactionFirst:true,

        avoidTriviaAtHighLevels:
          difficultyData.level >= 3,

        requirePlausibleAlternatives:
          difficultyData.level >= 3,

        requireIntegration:
          difficultyData.level >= 4,

        requireMultiStep:
          difficultyData.level >= 5

      }

    };

  }


  window.NOA_EXCOBA_REALISM = {

    itemTypes:
      ITEM_TYPES,

    formatsForSubject,

    difficultySpec,

    makeBlueprint:
      makeRealismBlueprint

  };


  console.log(
    'NOA EXCOBA Realism Engine v7 ✓'
  );

})();
