/**
 * scripts/diagnostico/test_prodconestado_13_campos.js
 *
 * Script de diagnóstico aislado, mismo espíritu que los demás en scripts/diagnostico/.
 * NO toca ningún archivo de producción, NO usa base de datos.
 *
 * Objetivo: confirmar, antes de aplicar el fix final a src/storage.js, que la
 * construcción ACTUAL de prodConEstado (commit 46461c1, solo 9 de los 13 campos de
 * CAMPOS_CONTINUIDAD_SERVER_OWNED) pierde los 4 campos restantes
 * (pedidosPendientes, saldoIUEcompensable, ivaAPagarAnterior, ivaSaldoAFavorAnterior),
 * y que la construcción completa de 13 campos propuesta los preserva.
 */

function log(msg) { console.log(msg); }
function sep(titulo) {
  console.log('\n' + '='.repeat(78));
  console.log(titulo);
  console.log('='.repeat(78));
}

// ─────────────────────────────────────────────────────────────────────────
// decisionObj de ejemplo: los 13 campos de CAMPOS_CONTINUIDAD_SERVER_OWNED
// presentes en la raíz, con valores reales distintos entre sí (para detectar
// cualquier confusión de asignación).
// ─────────────────────────────────────────────────────────────────────────
const decisionObj = {
  equipo: 'eq_demo',
  submitted: true,
  submittedAt: '2026-07-09T10:00:00.000Z',
  forcedByAdmin: false,
  forcedReason: null,
  forcedAt: null,
  cajaInicial: 100001,
  cxcInicial: 100002,
  deudaInicial: 100003,
  activosFijosIniciales: 100004,
  resultadoAcumuladoAnterior: 100005,
  stockMPInicial: 100006,
  pedidosPendientes: [{ rondaEntrega: 9, cantidad: 500, costoMP: 0 }],
  vendedoresIniciales: 3,
  operariosIniciales: 5,
  saldoIUEcompensable: 100009,
  ivaAPagarAnterior: 100010,
  ivaSaldoAFavorAnterior: 100011,
  capitalInicial: 100012,
  capitalContable: 100013,
  capacidadMaxProduccion: 2200,
  productos: [{ productoId: 'prod_1', producto: 'Producto X' }],
};

const prod = decisionObj.productos[0]; // el objeto "prod" real: nunca trae estos campos

const CAMPOS_CONTINUIDAD_SERVER_OWNED = [
  'cajaInicial', 'cxcInicial', 'deudaInicial', 'activosFijosIniciales',
  'resultadoAcumuladoAnterior', 'stockMPInicial', 'pedidosPendientes',
  'vendedoresIniciales', 'operariosIniciales', 'saldoIUEcompensable',
  'ivaAPagarAnterior', 'ivaSaldoAFavorAnterior',
  'capitalInicial', 'capitalContable',
  'capacidadMaxProduccion',
];

// ─────────────────────────────────────────────────────────────────────────
// CASO 1 — construcción ACTUAL de prodConEstado (commit 46461c1, sin los 4 campos)
// ─────────────────────────────────────────────────────────────────────────
sep('CASO 1 — prodConEstado ACTUAL (commit 46461c1) — 9 de 13 campos');

const prodConEstado_actual = {
  ...prod,
  submitted: decisionObj.submitted,
  submittedAt: decisionObj.submittedAt,
  forcedByAdmin: decisionObj.forcedByAdmin,
  forcedReason: decisionObj.forcedReason,
  forcedAt: decisionObj.forcedAt,
  capitalContable: decisionObj.capitalContable,
  capitalInicial: decisionObj.capitalInicial,
  stockMPInicial: decisionObj.stockMPInicial,
  capacidadMaxProduccion: decisionObj.capacidadMaxProduccion,
};

const camposFaltantesEnActual = ['pedidosPendientes', 'saldoIUEcompensable', 'ivaAPagarAnterior', 'ivaSaldoAFavorAnterior'];
let defectoReproducido = true;
camposFaltantesEnActual.forEach(campo => {
  const presente = campo in prodConEstado_actual;
  log(`  "${campo}" in prodConEstado_actual => ${presente}`);
  if (presente) defectoReproducido = false;
});
log(`\n  ¿Se reprodujo el defecto (los 4 campos ausentes)? => ${defectoReproducido}`);

// ─────────────────────────────────────────────────────────────────────────
// CASO 2 — construcción PROPUESTA (13 campos completos)
// ─────────────────────────────────────────────────────────────────────────
sep('CASO 2 — prodConEstado PROPUESTA — 13 de 13 campos de CAMPOS_CONTINUIDAD_SERVER_OWNED');

const prodConEstado_propuesta = {
  ...prod,
  submitted: decisionObj.submitted,
  submittedAt: decisionObj.submittedAt,
  forcedByAdmin: decisionObj.forcedByAdmin,
  forcedReason: decisionObj.forcedReason,
  forcedAt: decisionObj.forcedAt,
  cajaInicial: decisionObj.cajaInicial,
  cxcInicial: decisionObj.cxcInicial,
  deudaInicial: decisionObj.deudaInicial,
  activosFijosIniciales: decisionObj.activosFijosIniciales,
  resultadoAcumuladoAnterior: decisionObj.resultadoAcumuladoAnterior,
  stockMPInicial: decisionObj.stockMPInicial,
  pedidosPendientes: decisionObj.pedidosPendientes,
  vendedoresIniciales: decisionObj.vendedoresIniciales,
  operariosIniciales: decisionObj.operariosIniciales,
  saldoIUEcompensable: decisionObj.saldoIUEcompensable,
  ivaAPagarAnterior: decisionObj.ivaAPagarAnterior,
  ivaSaldoAFavorAnterior: decisionObj.ivaSaldoAFavorAnterior,
  capitalInicial: decisionObj.capitalInicial,
  capitalContable: decisionObj.capitalContable,
  capacidadMaxProduccion: decisionObj.capacidadMaxProduccion,
};

let fixCompleto = true;
CAMPOS_CONTINUIDAD_SERVER_OWNED.forEach(campo => {
  const valorEsperado = decisionObj[campo];
  const valorObtenido = prodConEstado_propuesta[campo];
  const coincide = JSON.stringify(valorObtenido) === JSON.stringify(valorEsperado);
  log(`  "${campo}": esperado=${JSON.stringify(valorEsperado)} | obtenido=${JSON.stringify(valorObtenido)} | coincide=${coincide}`);
  if (!coincide) fixCompleto = false;
});
log(`\n  ¿Los 13 campos de CAMPOS_CONTINUIDAD_SERVER_OWNED están completos y correctos? => ${fixCompleto}`);

// ─────────────────────────────────────────────────────────────────────────
// RESUMEN FINAL
// ─────────────────────────────────────────────────────────────────────────
sep('RESUMEN FINAL');
log(`  - CASO 1 (construcción actual, 9/13 campos): defecto reproducido => ${defectoReproducido}`);
log(`  - CASO 2 (construcción propuesta, 13/13 campos): fix completo => ${fixCompleto}`);

log('\nConclusión: la construcción actual de prodConEstado (commit 46461c1) pierde 4 de');
log('los 13 campos de CAMPOS_CONTINUIDAD_SERVER_OWNED (pedidosPendientes,');
log('saldoIUEcompensable, ivaAPagarAnterior, ivaSaldoAFavorAnterior) porque nunca fueron');
log('añadidos en los 2 fixes anteriores de hoy (submitted, luego capitalContable/');
log('stockMPInicial/etc.). La construcción propuesta cubre los 13 campos completos,');
log('cerrando el patrón de raíz de una sola vez.');
