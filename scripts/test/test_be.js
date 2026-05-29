// test_be.js — verificación aislada de calcularBrandEquity

function calcularBrandEquity(brandEquityAnterior, shareReal, utilidadNeta, tasaDecaimiento) {
  const bea = brandEquityAnterior ?? 50;
  const td  = tasaDecaimiento ?? 0.05;
  const vendio = shareReal > 0;
  const bonusUtilidad = utilidadNeta > 0 ? 5 : 0;
  const ganancia = shareReal * 100 + bonusUtilidad;
  const factorDecaimiento = vendio ? (1 - td) : (1 - td * 2);
  const nuevoBE = bea * factorDecaimiento + (vendio ? ganancia : 0);
  return Math.max(0, Math.round(nuevoBE * 100) / 100);
}

// Caso del plan de pruebas
const resultado = calcularBrandEquity(50, 0.4, 5000, 0.05);
console.log('brandEquityFinal calculado:', resultado);
console.log('brandEquityFinal esperado: 92.5');
console.log(resultado === 92.5 ? '✅ CORRECTO' : '❌ INCORRECTO');

// Caso de equipo que NO vende
const sinVentas = calcularBrandEquity(50, 0, -1000, 0.05);
console.log('\nEquipo sin ventas:', sinVentas);
console.log('Esperado: max(0, 50 × (1 - 0.10)) = 45');
console.log(sinVentas === 45 ? '✅ CORRECTO' : '❌ INCORRECTO');

// Caso real de la Ronda 1 de TEST-BE-2.1
console.log('\n--- Caso real Ronda 1 ---');
const shareRealR1 = 0.9405;
const utilidadNetaR1 = -22680;
const beInicialR1 = 50;
const tasaDecR1 = 0.05;
const resultadoR1 = calcularBrandEquity(beInicialR1, shareRealR1, utilidadNetaR1, tasaDecR1);
console.log('shareReal:', shareRealR1);
console.log('utilidadNeta:', utilidadNetaR1);
console.log('brandEquityFinal calculado:', resultadoR1);
console.log('brandEquityFinal reportado por el motor: 85.48');
console.log(resultadoR1 === 85.48 ? '✅ COINCIDE CON EL MOTOR' : '❌ NO COINCIDE (diferencia: ' + (resultadoR1 - 85.48).toFixed(2) + ')');