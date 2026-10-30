/* NOA v25, etapa 1: planificación únicamente; no genera ni inicia exámenes. */
(() => {
  const GROUPS = [
    {id:'primary', label:'Primaria', prefixes:['1.1.', '1.2.']},
    {id:'secondary', label:'Secundaria', prefixes:['2.1.', '2.2.', '2.3.', '2.4.']},
    {id:'medicine', label:'Especialidad Medicina', prefixes:['3.1.', '3.4.', '3.6.']}
  ];
  const PER_SUBJECT = 5;
  const TOTAL = 45;
  const COMPATIBLE_INTERACTIONS = ['single_select', 'drag_classify', 'inline_select', 'drag_order'];

  function build(){
    const syllabus = window.NOA_EXCOBA_V4;
    const blueprintEngine = window.NOA_SOURCE_BLUEPRINT;
    const supported = window.NOA_BATCH_ORCHESTRATOR?.supportedTypes;
    const errors = [];
    const subjects = [];
    const slots = [];
    const unsupportedSlots = [];
    const subjectIds = new Set();
    const slotIds = new Set();
    const groups = GROUPS.map(group => ({
      id:group.id, label:group.label,
      requiredCount:group.prefixes.length * PER_SUBJECT, subjectIds:[]
    }));
    const fail = (code, message, context = {}) => errors.push({code, message, ...context});
    const enginesReady = Array.isArray(syllabus?.subjects) &&
      typeof syllabus.itemsFor === 'function' && typeof blueprintEngine?.build === 'function';
    if(!enginesReady){
      fail('missing_engine', 'Se necesitan el Temario Maestro v4 y el motor Blueprint v8.');
    }
    const supportedInteractionTypes = [...new Set(Array.isArray(supported)
      ? supported.filter(type => COMPATIBLE_INTERACTIONS.includes(type)) : [])];
    if(!supportedInteractionTypes.length){
      fail('missing_engine', 'No está disponible el catálogo de formatos admitidos por Batch.');
    }
    let profile = null;
    let calibration = null;

    if(enginesReady){
      for(const [groupIndex, definition] of GROUPS.entries()){
        const group = groups[groupIndex];
        for(const prefix of definition.prefixes){
          const matches = syllabus.subjects.filter(subject => subject.prefixes?.includes(prefix));
          if(matches.length !== 1 || !matches[0].value){
            fail('missing_subject', `Se requiere una materia única del Temario para ${prefix}`, {groupId:group.id, prefix});
            continue;
          }
          const subject = matches[0];
          if(subjectIds.has(subject.value)){
            fail('duplicate_subject', 'Una materia ocupa más de un grupo del plan.', {subject:subject.value});
            continue;
          }
          subjectIds.add(subject.value);
          group.subjectIds.push(subject.value);
          const planned = {
            id:subject.value, label:subject.label, groupId:group.id,
            requiredCount:PER_SUBJECT, blueprint:null
          };
          subjects.push(planned);
          try{
            if(!syllabus.itemsFor(subject.value)?.length){
              fail('missing_syllabus', 'Faltan puntos del Temario Maestro para esta materia.', {subject:subject.value});
              continue;
            }
            const blueprint = blueprintEngine.build({subject:subject.value, count:PER_SUBJECT, supportedInteractionTypes});
            // Se conserva el Blueprint completo, incluido su createdAt informativo.
            // La distribución, las identidades y los slots son deterministas para
            // el mismo Temario, perfil, Calibrator y fuentes disponibles.
            planned.blueprint = blueprint;
            if(!blueprint || blueprint.subject !== subject.value || blueprint.count !== PER_SUBJECT ||
              !Array.isArray(blueprint.slots) || blueprint.slots.length !== PER_SUBJECT ||
              !blueprint.profile || !blueprint.calibration){
              fail('invalid_blueprint', 'El Blueprint debe contener cinco slots y sus metadatos.', {subject:subject.value});
              continue;
            }
            if(profile === null){
              profile = blueprint.profile;
              calibration = blueprint.calibration;
            }else{
              if(JSON.stringify(profile) !== JSON.stringify(blueprint.profile)){
                fail('profile_mismatch', 'El perfil cambió entre materias.', {subject:subject.value});
              }
              if(JSON.stringify(calibration) !== JSON.stringify(blueprint.calibration)){
                fail('calibration_mismatch', 'El ciclo del Calibrator cambió entre materias.', {subject:subject.value});
              }
            }
            for(const slot of blueprint.slots){
              if(!slot || typeof slot.slotId !== 'string' || !slot.slotId.trim() ||
                slot.subject !== subject.value || !Number.isInteger(slot.difficulty?.level) ||
                slot.difficulty.level < 1 || slot.difficulty.level > 5 ||
                !Number.isInteger(slot.calibratorDifficulty) ||
                slot.calibratorDifficulty < 1 || slot.calibratorDifficulty > 5 ||
                !slot.source || !slot.sourceType || !slot.requestedSourceType){
                fail('invalid_slot', 'El slot no conserva identidad, dificultad o fuente válidas.', {subject:subject.value});
                continue;
              }
              // El ID compuesto es externo: nunca reescribe slotId ni dificultad.
              const id = `v25:${encodeURIComponent(subject.value)}:${encodeURIComponent(slot.slotId)}`;
              if(slotIds.has(id)){
                fail('duplicate_slot_id', 'Hay identidades de slot repetidas.', {id, subject:subject.value});
              }
              slotIds.add(id);
              slots.push({id, groupId:group.id, subject:subject.value, slotId:slot.slotId, blueprintSlot:slot});
              if(!supportedInteractionTypes.includes(slot.interactionType)){
                const incompatible = {id, subject:subject.value, interactionType:slot.interactionType};
                unsupportedSlots.push(incompatible);
                fail('unsupported_interaction', `Formato no soportado: ${slot.interactionType}`, incompatible);
              }
            }
          }catch(error){
            fail('blueprint_error', error?.message || 'No se pudo planificar la materia.', {subject:subject.value});
          }
        }
      }
    }
    if(subjects.length !== 9 || slots.length !== TOTAL){
      fail('invalid_total', 'El plan requiere nueve materias y exactamente 45 slots.');
    }
    for(const group of groups){
      if(slots.filter(slot => slot.groupId === group.id).length !== group.requiredCount){
        fail('invalid_group_total', `La distribución de ${group.label} está incompleta.`, {groupId:group.id});
      }
    }
    return {
      version:'25.0', requestedTotal:TOTAL, total:slots.length,
      distributionNote:'Adaptación proporcional de los 180 reactivos de EXCOBA Medicina; no representa frecuencias exactas de formatos del examen oficial.',
      groups, subjects, profile, calibration, slots,
      interactionPolicy:{
        restricted:true, supportedInteractionTypes:[...supportedInteractionTypes], selection:'subject_intersection',
        note:'Selección restringida de formatos compatibles con NOA; no representa todas las interacciones ni las frecuencias oficiales del EXCOBA.'
      },
      interactionTypes:[...new Set(slots.map(slot => slot.blueprintSlot.interactionType))],
      supportedInteractionTypes, unsupportedSlots,
      structureValid:!errors.some(error => error.code !== 'unsupported_interaction'),
      valid:errors.length === 0,
      errors
    };
  }

  window.NOA_EXAM_PLAN_V25 = {version:'25.0', build};
})();
