/**
 * test_ataque_allowlist_decision.js — PRUEBA DE ATAQUE, en memoria, sin BD.
 * Simula body.decision con campos server-owned inyectados en raíz Y en
 * productos[0], y confirma que reconstruirDecisionPermitida +
 * protegerContinuidadServerOwned los ignoran siempre, en ambos niveles.
 */
'use strict';

const { reconstruirDecisionPermitida } = require('./_disenio_reconstruir_decision_permitida');

// Réplica exacta de server.js:2847-2883 (listas + protegerContinuidadServerOwned)
// para probar el mecanismo combinado tal como se usaría en los endpoints reales.
const CAMPOS_CONTINUIDAD_SERVER_OWNED = [
  'cajaInicial', 'cxcInicial', 'deudaInicial', 'activosFijosIniciales',
  'resultadoAcumuladoAnterior', 'stockMPInicial', 'pedidosPendientes',
  'vendedoresIniciales', 'operariosIniciales', 'saldoIUEcompensable',
  'ivaAPagarAnterior', 'ivaSaldoAFavorAnterior',
  'capitalInicial', 'capitalContable',
  'capacidadMaxProduccion',
];
const CAMPOS_CONTINUIDAD_PROHIBIDOS_EN_PRODUCTO = [
  'stockMPInicial', 'pedidosPendientes', 'saldoIUEcompensable',
  'ivaAPagarAnterior', 'ivaSaldoAFavorAnterior',
  'capitalInicial', 'capitalContable',
  'capacidadMaxProduccion',
];
function protegerContinuidadServerOwned(decisionFusionada, cur) {
  for (const campo of CAMPOS_CONTINUIDAD_SERVER_OWNED) {
    if (campo in cur) decisionFusionada[campo] = cur[campo];
  }
  if (Array.isArray(decisionFusionada.productos)) {
    decisionFusionada.productos.forEach(producto => {
      if (!producto || typeof producto !== 'object') return;
      CAMPOS_CONTINUIDAD_PROHIBIDOS_EN_PRODUCTO.forEach(campo => {
        if (campo in producto) delete producto[campo];
      });
    });
  }
  return decisionFusionada;
}

// Estado real del servidor (cur) antes del ataque — valores legítimos.
const cur = {
  equipo: 'eq_ataque_test',
  capitalInicial: 210942,
  capitalContable: 210942,
  capacidadMaxProduccion: 600,
  stockMPInicial: 500,
  cajaInicial: 100000,
  productos: [
    { productoId: 'prod_1', producto: 'Sneaker Cultural Premium', capitalInicial: 210942, capacidadMaxProduccion: 600, stockMPInicial: 500 },
  ],
};

// Payload de ataque: cliente intenta sobrescribir campos server-owned,
// en la raíz Y anidados dentro de productos[0].
const bodyDecisionAtaque = {
  capitalInicial: 999999999,       // ataque raíz
  capacidadMaxProduccion: 999999,  // ataque raíz
  stockMPInicial: 888888,          // ataque raíz
  precioVenta: 700,                // campo legítimo permitido
  productos: [
    {
      productoId: 'prod_1',
      producto: 'Sneaker Cultural Premium',
      precioVenta: 700,             // legítimo
      capitalInicial: 999999999,    // ataque anidado
      capacidadMaxProduccion: 999999, // ataque anidado
      stockMPInicial: 888888,       // ataque anidado
    },
  ],
};

const params = { capacidadMaxProduccion: 1500 };

const decisionAllowlist = reconstruirDecisionPermitida(cur, bodyDecisionAtaque, params);
const decisionFinal = protegerContinuidadServerOwned(
  { ...decisionAllowlist, equipo: cur.equipo, submitted: false },
  cur
);

console.log('=== Resultado tras allowlist + protegerContinuidadServerOwned ===');
console.log(JSON.stringify(decisionFinal, null, 2));

let fallos = 0;
function check(cond, msg) {
  if (cond) { console.log('OK   -', msg); }
  else { console.log('FALLO -', msg); fallos++; }
}

check(decisionFinal.capitalInicial === cur.capitalInicial, 'raíz.capitalInicial preservado de cur (no sobrescrito por ataque)');
check(decisionFinal.capacidadMaxProduccion === cur.capacidadMaxProduccion, 'raíz.capacidadMaxProduccion preservado de cur');
check(decisionFinal.stockMPInicial === cur.stockMPInicial, 'raíz.stockMPInicial preservado de cur');
check(decisionFinal.precioVenta === undefined || true, '(precioVenta no es campo de empresa, solo de producto — no aplica en raíz)');

const prod = decisionFinal.productos[0];
check(!('capitalInicial' in prod), 'productos[0].capitalInicial ELIMINADO (prohibido en producto)');
check(!('capacidadMaxProduccion' in prod), 'productos[0].capacidadMaxProduccion ELIMINADO (prohibido en producto)');
check(!('stockMPInicial' in prod), 'productos[0].stockMPInicial ELIMINADO (prohibido en producto)');
check(prod.precioVenta === 700, 'productos[0].precioVenta ACEPTADO (campo legítimo permitido)');

console.log(`\n=== ${fallos === 0 ? 'TODOS LOS CHECKS PASARON' : fallos + ' CHECK(S) FALLARON'} ===`);
process.exitCode = fallos === 0 ? 0 : 1;
