/**
 * test_compatibilidad_inversion_activos_raiz_r6.js — prueba de compatibilidad,
 * en memoria, con los datos REALES ya confirmados de RAIZ R6 (D12026):
 * capacidadMaxProduccion=2898, costoPorUnidadCapacidadAmpliacion=75,
 * paquete='menor' para ampliacionPlanta. Esperado: monto=54375,
 * incrementoCapacidad=725 (ya persistido en sim_decisiones/sim_rondas).
 */
'use strict';

const { reconstruirInversionActivosPermitida } = require('./_disenio_reconstruir_decision_permitida');

const decisionBase = { capacidadMaxProduccion: 2898 };
const params = { costoPorUnidadCapacidadAmpliacion: 75 };

const invCliente = {
  ampliacionPlanta: { paquete: 'menor' },
};

const resultado = reconstruirInversionActivosPermitida({}, invCliente, decisionBase, params);

console.log('=== ampliacionPlanta calculado ===');
console.log(JSON.stringify(resultado.ampliacionPlanta, null, 2));

const ESPERADO_MONTO = 54375;
const ESPERADO_INCREMENTO = 725;

let fallos = 0;
function check(cond, msg) {
  if (cond) { console.log('OK   -', msg); }
  else { console.log('FALLO -', msg); fallos++; }
}

check(resultado.ampliacionPlanta.incrementoCapacidad === ESPERADO_INCREMENTO,
  `incrementoCapacidad = ${resultado.ampliacionPlanta.incrementoCapacidad} (esperado ${ESPERADO_INCREMENTO})`);
check(resultado.ampliacionPlanta.monto === ESPERADO_MONTO,
  `monto = ${resultado.ampliacionPlanta.monto} (esperado ${ESPERADO_MONTO})`);

console.log(`\n=== ${fallos === 0 ? 'COMPATIBILIDAD CONFIRMADA' : fallos + ' CHECK(S) FALLARON'} ===`);
process.exitCode = fallos === 0 ? 0 : 1;
