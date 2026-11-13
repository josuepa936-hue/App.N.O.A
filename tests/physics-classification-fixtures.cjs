// Casos construidos para comprobar contratos de software. No son salidas
// reales del proveedor ni certificación de que un modelo detectará el defecto.
const mechanical = {
  instruction: 'Clasifica la forma de energía mecánica descrita.',
  stem: 'Mecánica clásica: usa el marco del suelo, g constante y altura medida desde el suelo. Se describe una contribución concreta, no toda la energía del objeto.',
  targets: [
    { id: 'kinetic', label: 'Energía cinética: asociada a la rapidez en el marco indicado' },
    { id: 'potential', label: 'Energía potencial gravitatoria: asociada a la altura de referencia' }
  ],
  elements: [
    { id: 'k1', text: 'Contribución calculada como m v² / 2', correctTargetId: 'kinetic' },
    { id: 'g1', text: 'Contribución calculada como m g h', correctTargetId: 'potential' },
    { id: 'k2', text: 'A masa fija, contribución que se cuadruplica al duplicar la rapidez', correctTargetId: 'kinetic' },
    { id: 'g2', text: 'A masa y g fijas, contribución que aumenta al elevar el cuerpo', correctTargetId: 'potential' }
  ],
  explanation: 'k1 y k2 corresponden a m v² / 2. g1 y g2 corresponden a m g h con la referencia indicada. Un objeto puede tener ambas energías, pero cada descripción identifica una contribución.'
};

const transfers = {
  instruction: 'Clasifica el mecanismo de transferencia descrito.',
  stem: 'Sistemas cerrados: en cada descripción se aísla solo el mecanismo indicado, sin transferencia de masa. No se clasifica energía almacenada ni potencia.',
  targets: [
    { id: 'heat', label: 'Calor: transferencia debida a una diferencia de temperatura' },
    { id: 'work', label: 'Trabajo mecánico: transferencia por fuerza y desplazamiento de la frontera' }
  ],
  elements: [
    { id: 'h1', text: 'Transferencia por conducción a través de una pared inmóvil con temperaturas distintas', correctTargetId: 'heat' },
    { id: 'w1', text: 'Transferencia al comprimir un gas con pistón adiabático mediante una fuerza externa', correctTargetId: 'work' },
    { id: 'h2', text: 'Transferencia térmica a un recipiente rígido por contacto con un baño más caliente', correctTargetId: 'heat' },
    { id: 'w2', text: 'Transferencia al expandirse un gas contra un pistón adiabático con carga', correctTargetId: 'work' }
  ],
  explanation: 'h1 y h2 describen intercambio por diferencia de temperatura sin movimiento de frontera. w1 y w2 describen trabajo de frontera adiabático. Calor y trabajo son mecanismos de transferencia, no formas de energía almacenada.'
};

const ambiguous = {
  ...structuredClone(mechanical),
  // Reconstrucción sintética del defecto informado, no el reactivo original.
  targets: [
    { id: 'kinetic', label: 'Energía de movimiento o transferencia' },
    { id: 'potential', label: 'Energía potencial' }
  ],
  elements: [
    ...structuredClone(mechanical.elements.slice(0, 3)),
    { id: 'power', text: 'Potencia: rapidez de transferencia de energía', correctTargetId: 'kinetic' }
  ]
};

const overlapping = {
  ...structuredClone(mechanical),
  targets: [
    { id: 'kinetic', label: 'Energía cinética' },
    { id: 'potential', label: 'Energía mecánica: cinética más potencial' }
  ]
};

module.exports = { mechanical, transfers, ambiguous, overlapping };
