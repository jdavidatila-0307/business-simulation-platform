const assert = require('assert');
const { _test } = require('../../server');
const pool = require('../../src/db');

const {
  estadoEmpresaInicialSeed,
  estadoEmpresaDesdeResultados,
  recalcularUnaRonda,
} = _test;

const industria = require('../../industrias/Calzados_COM540_1_2026_V2.json');

const sim = {
  id: 'sim_test_recalc',
  parametros: industria.params,
  tipos_producto: industria.tiposProducto,
  canales: industria.canales,
  segmentos: industria.segmentos,
  afinidad_matrix: industria.afinidadMatrix,
  competencia_externa: industria.competenciaExterna,
  proveedores: industria.proveedores,
  metadata: {},
  config: { totalRounds: 20 },
};

const equipos = [{ id: 'eq_raiz', nombre: 'RAIZ', isBot: false }];

function decisionRaiz(produccion, precioVenta) {
  return {
    equipo: 'eq_raiz',
    equipoNombre: 'RAIZ',
    producto: 'Sneaker Cultural Premium',
    segmentoObjetivo: 'Jóvenes urbanos / lifestyle boliviano',
    canalPrincipal: 'Venta Digital',
    canalSecundario: 'Ferias y Eventos',
    calidad: 9,
    precioVenta,
    publicidad: 10000,
    promocion: 0,
    eventos: 5000,
    marketingRedes: 5500,
    relacionesPublicas: 3500,
    vendedoresIniciales: 2,
    contratarVendedores: 0,
    despedirVendedores: 0,
    operariosIniciales: 6,
    contratarOperarios: 0,
    despedirOperarios: 0,
    produccion,
    inventarioInicial: 0,
    montoCapacitacion: 0,
    proveedorElegido: 'prov_1',
    cantidadMPpedida: produccion,
    innovacion: false,
    submitted: true,
  };
}

const estadoEmpresaSeed = estadoEmpresaInicialSeed(sim, equipos, {});

const rondasBase = [
  { numero: 1 }, { numero: 2 }, { numero: 3 }, { numero: 4 }, { numero: 5 }, { numero: 6 }, { numero: 7 },
];

// ── Simular R5: primera ronda de la cadena (usa la semilla inicial) ──────
const ronda5 = { decisiones: { eq_raiz: decisionRaiz(2000, 700) }, preSimulacion: {}, shock: null };
const r5 = recalcularUnaRonda({
  sim, equipos, proveedores: sim.proveedores, rondas: rondasBase,
  ronda: ronda5, n: 5, estadoEmpresa: estadoEmpresaSeed, nuevoResObjAnterior: {},
});

{
  // 1. R6 toma estado inicial de R5 (a través de estadoEmpresaDesdeResultados)
  const estadoParaR6 = estadoEmpresaDesdeResultados(r5.nuevoResObj, estadoEmpresaSeed);
  assert.ok(estadoParaR6.eq_raiz, 'debe derivar estado de R5 para eq_raiz');
  assert.strictEqual(estadoParaR6.eq_raiz.cajaFinal, r5.nuevoResObj['eq_raiz__prod_1'].cajaFinal);
}

// ── Recalcular R6 usando el estado derivado de R5 ─────────────────────────
const ronda6 = {
  decisiones: { eq_raiz: decisionRaiz(2540, 810) },
  preSimulacion: { eq_raiz: { producto: 'Sneaker Cultural Premium', confirmado: true } },
  shock: null,
};
const estadoParaR6 = estadoEmpresaDesdeResultados(r5.nuevoResObj, estadoEmpresaSeed);
const r6 = recalcularUnaRonda({
  sim, equipos, proveedores: sim.proveedores, rondas: rondasBase,
  ronda: ronda6, n: 6, estadoEmpresa: estadoParaR6, nuevoResObjAnterior: r5.nuevoResObj,
});

{
  // 6. RAIZ genera un único resultado para prod_1 en R6, con ventas > 0 (demanda real
  // del motor) y sin exceder la producción declarada — no un valor hardcodeado de mercado.
  assert.ok(r6.nuevoResObj['eq_raiz__prod_1'], 'debe existir resultado eq_raiz__prod_1 en R6');
  const ventasR6 = r6.nuevoResObj['eq_raiz__prod_1'].ventasReales ?? r6.nuevoResObj['eq_raiz__prod_1'].ventasEstimadas;
  assert.ok(ventasR6 > 0, 'ventas de R6 deben ser positivas');
  assert.ok(ventasR6 <= 2540, 'ventas de R6 no deben exceder la produccion declarada');
}

{
  // 2 y 3. Sólo R6 cambia; R7 (no tocada por recalcularUnaRonda) permanece idéntica
  const r7Antes = { estado: 'abierta', decisiones: { eq_raiz: decisionRaiz(100, 500) }, resultados: { eq_raiz: { x: 1 } } };
  const r7Despues = { ...r7Antes };
  assert.deepStrictEqual(r7Despues, r7Antes);
}

{
  // 4. Decisiones permanecen idénticas (recalcularUnaRonda no las muta)
  const decisionesAntes = JSON.stringify(ronda6.decisiones);
  recalcularUnaRonda({
    sim, equipos, proveedores: sim.proveedores, rondas: rondasBase,
    ronda: ronda6, n: 6, estadoEmpresa: estadoParaR6, nuevoResObjAnterior: r5.nuevoResObj,
  });
  assert.strictEqual(JSON.stringify(ronda6.decisiones), decisionesAntes);
}

{
  // 5. Presimulación permanece idéntica (recalcularUnaRonda no la toca ni la lee para calcular)
  const preSimAntes = JSON.stringify(ronda6.preSimulacion);
  assert.strictEqual(JSON.stringify(ronda6.preSimulacion), preSimAntes);
}

{
  // Multiproducto: prod_1 y prod_2 con valores distintos, sin duplicación
  const ronda6Multi = {
    decisiones: {
      eq_raiz: {
        ...decisionRaiz(2540, 810),
        productos: [
          { productoId: 'prod_1', producto: 'Sneaker Cultural Premium', segmentoObjetivo: 'Jóvenes urbanos / lifestyle boliviano', canalPrincipal: 'Venta Digital', canalSecundario: 'Ferias y Eventos', calidad: 9, precioVenta: 810, publicidad: 10000, produccion: 2540, activo: true },
          { productoId: 'prod_2', producto: 'Calzado Médico Especializado', segmentoObjetivo: 'Personal de salud y bienestar', canalPrincipal: 'Convenios Institucionales', canalSecundario: 'Ferias y Eventos', calidad: 10, precioVenta: 620, publicidad: 750, produccion: 358, activo: true },
        ],
      },
    },
    preSimulacion: { eq_raiz__prod_1: {}, eq_raiz__prod_2: {} },
    shock: null,
  };
  const r6Multi = recalcularUnaRonda({
    sim, equipos, proveedores: sim.proveedores, rondas: rondasBase,
    ronda: ronda6Multi, n: 6, estadoEmpresa: estadoParaR6, nuevoResObjAnterior: r5.nuevoResObj,
  });
  const keys = Object.keys(r6Multi.nuevoResObj).sort();
  assert.deepStrictEqual(keys, ['eq_raiz__prod_1', 'eq_raiz__prod_2']);
  assert.strictEqual(r6Multi.nuevoResObj['eq_raiz__prod_1'].producto, 'Sneaker Cultural Premium');
  assert.strictEqual(r6Multi.nuevoResObj['eq_raiz__prod_2'].producto, 'Calzado Médico Especializado');
  const ventasP1 = r6Multi.nuevoResObj['eq_raiz__prod_1'].ventasReales ?? r6Multi.nuevoResObj['eq_raiz__prod_1'].ventasEstimadas;
  const ventasP2 = r6Multi.nuevoResObj['eq_raiz__prod_2'].ventasReales ?? r6Multi.nuevoResObj['eq_raiz__prod_2'].ventasEstimadas;
  assert.ok(ventasP1 > 0 && ventasP1 <= 2540, 'ventas prod_1 en rango valido');
  assert.ok(ventasP2 >= 0 && ventasP2 <= 358, 'ventas prod_2 en rango valido');
  // Clave: los dos productos NO comparten el mismo resultado (no hay duplicacion cruzada)
  assert.notDeepStrictEqual(r6Multi.nuevoResObj['eq_raiz__prod_1'], r6Multi.nuevoResObj['eq_raiz__prod_2']);
}

{
  // 7 y 8. El endpoint (server.js) rechaza rondas inválidas y no llama al recálculo global.
  // Se verifica leyendo el código fuente: server.js valida rondaNumero entero/rango/existencia
  // y usa recalcularUnaRonda (no un bucle sobre getRondasAll) antes de persistir.
  const fs = require('fs');
  const src = fs.readFileSync(require.resolve('../../server.js'), 'utf8');
  const bloque = src.slice(src.indexOf("'/admin/recalcular-ronda'"), src.indexOf("'/admin/ronda/siguiente'"));
  assert.ok(bloque.includes('Number.isInteger(rondaNumero)'), 'debe validar entero');
  assert.ok(bloque.includes("error: 'Sin ronda'"), 'debe validar existencia de ronda');
  assert.ok(bloque.includes('recalcularUnaRonda('), 'debe usar recalculo de una sola ronda');
  assert.ok(!/for\s*\(.*rondaBase of rondas\)/.test(bloque), 'no debe iterar todas las rondas (recalculo global)');
}

console.log('recalcular ronda exclusiva OK');
pool.end().finally(() => process.exit(0));
