/**
 * scripts/diagnostico/test_totalp_balance_cuadre.js
 *
 * Script de diagnóstico aislado, mismo espíritu que los demás en scripts/diagnostico/.
 * NO toca ningún archivo de producción, NO usa base de datos.
 *
 * Objetivo: reproducir, con datos representativos de ORTHO STEP (Rondas 2 y 3), los 2
 * defectos confirmados en los 5 puntos de "totalP" que alimentan el mensaje visible
 * "✓ Balance cuadra" / "⚠ Verificar balance":
 *
 *   Patrón A (public/app.js:1088, admin-dashboard.js:785):
 *     totalP = deudaFinal + sobregiro         (excluye ivaAPagar, pasivo real pendiente)
 *
 *   Patrón B-con-sobregiro (public/app.js:3150, equipo-hoja.js:1958):
 *     totalP = deudaFinal + ivaAPagar + sobregiro   (incluye un pasivo que el motor NUNCA
 *                                                     usó para derivar r.patrimonio)
 *
 * Fórmula correcta, consistente con el motor (confirmada en engine.js: patrimonio =
 * totalActivos - totalPasivos, donde totalPasivos = deudaFinal + ivaAPagar, SIN sobregiro
 * — sobregiro es una alerta operativa de caja negativa, no un pasivo formal del balance):
 *
 *   totalP = deudaFinal + ivaAPagar
 *
 * r.patrimonio ya viene calculado por el motor con esta fórmula exacta — por eso
 * totalA debe igualar totalP + r.patrimonio SOLO cuando totalP excluye sobregiro.
 */

function log(msg) { console.log(msg); }
function sep(titulo) {
  console.log('\n' + '='.repeat(78));
  console.log(titulo);
  console.log('='.repeat(78));
}

// ─────────────────────────────────────────────────────────────────────────
// Datos representativos de ORTHO STEP — Ronda 2 y Ronda 3.
// r.patrimonio es el valor YA CALCULADO por el motor (totalActivos - totalPasivos,
// con totalPasivos = deudaFinal + ivaAPagar, SIN sobregiro — confirmado en engine.js
// líneas 1057-1094, auditoría de hoy).
// sobregiro > 0 en ambas rondas: exactamente el escenario que dispara el falso
// "Verificar balance" en los patrones defectuosos.
// ─────────────────────────────────────────────────────────────────────────
const r_ronda2 = {
  cajaFinal: 0,           // en sobregiro, cajaFinal queda en 0 (el déficit se registra aparte)
  cxcFinal: 42000,
  invFinalValorizado: 68500,
  afNetos: 312000,
  totalActivos: 422500,
  deudaFinal: 150000,
  ivaAPagar: 8200,
  sobregiro: 15300,       // déficit de caja cubierto automáticamente por el motor
  capitalContable: 260000,
  resultadoAcumulado: 4300,
  utilidadNeta: 4300,
  patrimonio: 264300,     // YA calculado por el motor = totalActivos - (deudaFinal + ivaAPagar) = 422500 - 158200
};

const r_ronda3 = {
  cajaFinal: 0,
  cxcFinal: 51000,
  invFinalValorizado: 74200,
  afNetos: 305000,
  totalActivos: 430200,
  deudaFinal: 140000,
  ivaAPagar: 9100,
  sobregiro: 22750,
  capitalContable: 260000,
  resultadoAcumulado: 21100,
  utilidadNeta: 16800,
  patrimonio: 281100,     // = 430200 - (140000 + 9100)
};

function evaluarCuadre(nombreCaso, r, formulaTotalP) {
  const totalA = r.totalActivos || (r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0)+(r.afNetos||0);
  const totalP = formulaTotalP(r);
  const patrim = Number(r.patrimonio ?? (totalA - totalP));
  const totalPP = totalP + patrim;
  const cuadra = Math.abs(totalA - totalPP) < 2;
  log(`  [${nombreCaso}] totalA=${totalA} | totalP=${totalP} | patrimonio=${patrim} | totalPP=${totalPP} | Δ=${(totalA-totalPP).toFixed(2)} | cuadra=${cuadra}`);
  return cuadra;
}

// ─────────────────────────────────────────────────────────────────────────
// PATRÓN A — totalP = deudaFinal + sobregiro (excluye ivaAPagar)
// ─────────────────────────────────────────────────────────────────────────
sep('PATRÓN A (app.js:1088, admin-dashboard.js:785) — deudaFinal + sobregiro, SIN ivaAPagar');
const formulaA = r => (r.deudaFinal||0)+(r.sobregiro||0);
const cuadraA_r2 = evaluarCuadre('Ronda 2', r_ronda2, formulaA);
const cuadraA_r3 = evaluarCuadre('Ronda 3', r_ronda3, formulaA);
log(`\n  ¿Se reprodujo el falso descuadre en Ronda 2? => ${!cuadraA_r2}`);
log(`  ¿Se reprodujo el falso descuadre en Ronda 3? => ${!cuadraA_r3}`);

// ─────────────────────────────────────────────────────────────────────────
// PATRÓN B-con-sobregiro — totalP = deudaFinal + ivaAPagar + sobregiro
// ─────────────────────────────────────────────────────────────────────────
sep('PATRÓN B-con-sobregiro (app.js:3150, equipo-hoja.js:1958) — incluye sobregiro de más');
const formulaB = r => (r.deudaFinal||0)+(r.ivaAPagar||0)+(r.sobregiro||0);
const cuadraB_r2 = evaluarCuadre('Ronda 2', r_ronda2, formulaB);
const cuadraB_r3 = evaluarCuadre('Ronda 3', r_ronda3, formulaB);
log(`\n  ¿Se reprodujo el falso descuadre en Ronda 2? => ${!cuadraB_r2}`);
log(`  ¿Se reprodujo el falso descuadre en Ronda 3? => ${!cuadraB_r3}`);

// ─────────────────────────────────────────────────────────────────────────
// FÓRMULA CORREGIDA — totalP = deudaFinal + ivaAPagar (sin sobregiro)
// ─────────────────────────────────────────────────────────────────────────
sep('FÓRMULA CORREGIDA — deudaFinal + ivaAPagar (consistente con el motor)');
const formulaCorregida = r => (r.deudaFinal||0)+(r.ivaAPagar||0);
const cuadraCorregida_r2 = evaluarCuadre('Ronda 2', r_ronda2, formulaCorregida);
const cuadraCorregida_r3 = evaluarCuadre('Ronda 3', r_ronda3, formulaCorregida);
log(`\n  ¿"cuadra" = true con la fórmula corregida en Ronda 2? => ${cuadraCorregida_r2}`);
log(`  ¿"cuadra" = true con la fórmula corregida en Ronda 3? => ${cuadraCorregida_r3}`);

// ─────────────────────────────────────────────────────────────────────────
// equipo-financiero.js:369 — YA usa la fórmula correcta hoy (no se toca)
// ─────────────────────────────────────────────────────────────────────────
sep('equipo-financiero.js:369 (ya correcto hoy, NO se modifica) — deudaFinal + ivaAPagar');
const cuadraYaCorrecto_r2 = evaluarCuadre('Ronda 2', r_ronda2, formulaCorregida);
const cuadraYaCorrecto_r3 = evaluarCuadre('Ronda 3', r_ronda3, formulaCorregida);

// ─────────────────────────────────────────────────────────────────────────
// RESUMEN FINAL
// ─────────────────────────────────────────────────────────────────────────
sep('RESUMEN FINAL');
log(`  Patrón A         — Ronda 2: cuadra=${cuadraA_r2} (esperado false) | Ronda 3: cuadra=${cuadraA_r3} (esperado false)`);
log(`  Patrón B+sobregiro — Ronda 2: cuadra=${cuadraB_r2} (esperado false) | Ronda 3: cuadra=${cuadraB_r3} (esperado false)`);
log(`  Fórmula corregida — Ronda 2: cuadra=${cuadraCorregida_r2} (esperado true) | Ronda 3: cuadra=${cuadraCorregida_r3} (esperado true)`);

const todoConfirmado = !cuadraA_r2 && !cuadraA_r3 && !cuadraB_r2 && !cuadraB_r3 && cuadraCorregida_r2 && cuadraCorregida_r3;
log(`\n¿Ambos defectos reproducidos Y la fórmula corregida resuelve ambos casos? => ${todoConfirmado}`);

log('\nConclusión: tanto excluir ivaAPagar (Patrón A) como incluir sobregiro de más');
log('(Patrón B+sobregiro) producen un falso "Verificar balance", porque r.patrimonio ya');
log('viene calculado por el motor usando exactamente totalPasivos = deudaFinal + ivaAPagar.');
log('Cualquier fórmula de totalP en el frontend que no coincida con esa exacta genera un');
log('descuadre artificial de Δ = ±sobregiro o ∓ivaAPagar, según el patrón. La fórmula');
log('corregida (deudaFinal + ivaAPagar, sin sobregiro) es la única consistente con el');
log('motor en los 5 puntos.');
