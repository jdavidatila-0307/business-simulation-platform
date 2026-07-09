/**
 * test_validacion_formula_cuadre_iva.js — SOLO VALIDACIÓN EN MEMORIA.
 * No conecta a Supabase. Reimplementa la fórmula propuesta para detectar
 * si patrimonioReal (motor) diverge de una composición basada en
 * capitalContable + resultadoAcumulado + ajuste por IVA a favor consumido,
 * usando valores reales ya confirmados en esta sesión como constantes.
 *
 * NO modifica engine.js ni ningún archivo de producción.
 */
'use strict';

function ivaDebitoNetoCalc(ivaDebito, ivaSaldoAFavorAnterior) {
  return Math.max(0, ivaDebito - ivaSaldoAFavorAnterior);
}

function evaluarCuadre({ capitalContable, resultadoAcumulado, ivaDebito, ivaSaldoAFavorAnterior, patrimonioReal }) {
  const ivaDebitoNeto = ivaDebitoNetoCalc(ivaDebito, ivaSaldoAFavorAnterior);
  const patrimonioER = capitalContable + resultadoAcumulado + (ivaDebito - ivaDebitoNeto);
  const divergencia = Math.abs(patrimonioReal - patrimonioER);
  const alertaCuadre = divergencia > 500 ? { divergencia, patrimonioReal, patrimonioER } : null;
  return { ivaDebitoNeto, patrimonioER, divergencia, alertaCuadre };
}

const CASOS = [
  {
    nombre: 'GrowStep Kids R7',
    input: { capitalContable: 247167, resultadoAcumulado: -165729.35, ivaDebito: 28080, ivaSaldoAFavorAnterior: 663, patrimonioReal: 82100.65 },
    esperadoAlertaNula: true,
  },
  {
    nombre: 'ORTHO STEP R7',
    input: { capitalContable: 322071, resultadoAcumulado: 92736.01, ivaDebito: 46683, ivaSaldoAFavorAnterior: 1222, patrimonioReal: 416029.01 },
    esperadoAlertaNula: true,
  },
  {
    nombre: 'Teacompaña R7',
    input: { capitalContable: 189186, resultadoAcumulado: 339434.29, ivaDebito: 91520, ivaSaldoAFavorAnterior: 2873, patrimonioReal: 531493.29 },
    esperadoAlertaNula: true,
  },
  {
    nombre: 'LEVITA R5 (compensacionIT, ivaSaldoAFavorAnterior=0)',
    input: { capitalContable: 478597, resultadoAcumulado: -92733.44, ivaDebito: 0, ivaSaldoAFavorAnterior: 0, patrimonioReal: 478597 + (-92733.44) },
    esperadoAlertaNula: true,
  },
  {
    nombre: 'ORTHO STEP R5 (compensacionIT, ivaSaldoAFavorAnterior=0)',
    input: { capitalContable: 322071, resultadoAcumulado: -102610.48, ivaDebito: 0, ivaSaldoAFavorAnterior: 0, patrimonioReal: 322071 + (-102610.48) },
    esperadoAlertaNula: true,
  },
  {
    nombre: 'Teacompaña R5 (compensacionIT, ivaSaldoAFavorAnterior=0)',
    input: { capitalContable: 189186, resultadoAcumulado: -51336.73, ivaDebito: 0, ivaSaldoAFavorAnterior: 0, patrimonioReal: 189186 + (-51336.73) },
    esperadoAlertaNula: true,
  },
  {
    nombre: 'ORTHO STEP R6 (compensacionIT, ivaSaldoAFavorAnterior=0)',
    input: { capitalContable: 322071, resultadoAcumulado: -27288.48, ivaDebito: 0, ivaSaldoAFavorAnterior: 0, patrimonioReal: 322071 + (-27288.48) },
    esperadoAlertaNula: true,
  },
  {
    nombre: 'CASO SINTÉTICO — divergencia real (no relacionada con IVA)',
    input: { capitalContable: 100000, resultadoAcumulado: 50000, ivaDebito: 0, ivaSaldoAFavorAnterior: 0, patrimonioReal: 160000 },
    esperadoAlertaNula: false,
    divergenciaEsperada: 10000,
  },
];

let fallos = 0;

CASOS.forEach(caso => {
  const r = evaluarCuadre(caso.input);
  const alertaEsNula = r.alertaCuadre === null;
  let pasa = alertaEsNula === caso.esperadoAlertaNula;
  if (pasa && caso.divergenciaEsperada != null) {
    pasa = Math.abs(r.divergencia - caso.divergenciaEsperada) < 0.01;
  }

  console.log(`\n=== ${caso.nombre} ===`);
  console.log('Input:', JSON.stringify(caso.input));
  console.log(`ivaDebitoNeto=${r.ivaDebitoNeto} | patrimonioER=${r.patrimonioER.toFixed(2)} | divergencia=${r.divergencia.toFixed(2)}`);
  console.log('alertaCuadre:', JSON.stringify(r.alertaCuadre));
  console.log(pasa ? 'PASA' : 'FALLA');
  if (!pasa) fallos++;
});

console.log(`\n=== RESUMEN: ${CASOS.length - fallos}/${CASOS.length} casos correctos ===`);
if (fallos > 0) {
  console.log(`⚠ ${fallos} caso(s) NO coinciden con lo esperado — la fórmula propuesta NO es válida tal cual para esos casos.`);
}
process.exitCode = fallos === 0 ? 0 : 1;
