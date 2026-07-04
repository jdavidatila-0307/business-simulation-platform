const assert = require('assert');
const {
  calcularPreSimulacion,
  canonicalizarDecisionesMultiproducto,
} = require('../../src/engine');

const industria = require('../../industrias/Calzados_COM540_1_2026_V2.json');

const cfg = {
  params: industria.params,
  tiposProducto: industria.tiposProducto,
  canales: industria.canales,
  segmentos: industria.segmentos,
  afinidadMatrix: industria.afinidadMatrix,
  competenciaExterna: industria.competenciaExterna,
};

function cfgConDemandasFormales(demandas) {
  return {
    ...cfg,
    params: { ...cfg.params, sueldoTrimestralVendedor: 1 },
    segmentos: cfg.segmentos.map(s => demandas[s.nombre]
      ? { ...s, demandaBase: demandas[s.nombre], pctContrabando: 0, tasaCrecimiento: 0 }
      : s),
  };
}

function porProducto(resultado) {
  return Object.fromEntries(resultado.map(r => [String(r.equipo).split('__').pop(), r]));
}

function assertKeysUnicas(resultado, esperado) {
  const keys = resultado.map(r => r.equipo).sort();
  assert.deepStrictEqual(keys, esperado.sort());
  for (const key of esperado) {
    assert.strictEqual(keys.filter(k => k === key).length, 1, `clave duplicada: ${key}`);
  }
}

const raizProd1 = {
  equipo: 'eq_raiz',
  equipoNombre: 'RAIZ',
  producto: 'Sneaker Cultural Premium',
  segmentoObjetivo: 'Jóvenes urbanos / lifestyle boliviano',
  canalPrincipal: 'Venta Digital',
  canalSecundario: 'Ferias y Eventos',
  calidad: 9,
  precioVenta: 810,
  publicidad: 10000,
  promocion: 0,
  eventos: 5000,
  marketingRedes: 5500,
  relacionesPublicas: 3500,
  vendedoresIniciales: 1,
  contratarVendedores: 0,
  despedirVendedores: 0,
  operariosIniciales: 6,
  contratarOperarios: 4,
  despedirOperarios: 0,
  produccion: 2540,
  inventarioInicial: 0,
  montoCapacitacion: 20000,
  proveedorElegido: 'prov_1',
  cantidadMPpedida: 3623,
  innovacion: true,
  tipoInnovacion: 'Proceso',
  montoInnovacion: 25400,
  brandEquityInicial: 203.06,
  productos: [
    {
      productoId: 'prod_1',
      producto: 'Sneaker Cultural Premium',
      segmentoObjetivo: 'Jóvenes urbanos / lifestyle boliviano',
      canalPrincipal: 'Venta Digital',
      canalSecundario: 'Ferias y Eventos',
      calidad: 9,
      precioVenta: 810,
      publicidad: 10000,
      promocion: 0,
      eventos: 5000,
      marketingRedes: 5500,
      relacionesPublicas: 3500,
      vendedoresIniciales: 1,
      contratarVendedores: 0,
      despedirVendedores: 0,
      operariosIniciales: 6,
      contratarOperarios: 4,
      despedirOperarios: 0,
      produccion: 2540,
      inventarioInicial: 0,
      montoCapacitacion: 20000,
      proveedorElegido: 'prov_1',
      cantidadMPpedida: 3623,
      innovacion: true,
      tipoInnovacion: 'Proceso',
      montoInnovacion: 25400,
      brandEquityInicial: 50,
      activo: true,
    },
    {
      productoId: 'prod_2',
      producto: 'Producto stale',
      segmentoObjetivo: 'Personal de salud y bienestar',
      canalPrincipal: 'Convenios Institucionales',
      canalSecundario: 'Ferias y Eventos',
      calidad: 10,
      precioVenta: 620,
      publicidad: 750,
      promocion: 0,
      eventos: 1200,
      marketingRedes: 600,
      relacionesPublicas: 450,
      vendedoresIniciales: 1,
      contratarVendedores: 0,
      despedirVendedores: 0,
      operariosIniciales: 6,
      contratarOperarios: 4,
      despedirOperarios: 0,
      produccion: 358,
      montoCapacitacion: 20000,
      proveedorElegido: 'prov_1',
      cantidadMPpedida: 3623,
      innovacion: true,
      tipoInnovacion: 'Canal',
      montoInnovacion: 5000,
      activo: true,
    },
  ],
};

const raizProd2Normalizado = {
  equipo: 'eq_raiz',
  productoId: 'prod_2',
  producto: 'Calzado Médico Especializado',
  segmentoObjetivo: 'Personal de salud y bienestar',
  canalPrincipal: 'Convenios Institucionales',
  canalSecundario: 'Ferias y Eventos',
  calidad: 10,
  precioVenta: 620,
  publicidad: 750,
  promocion: 0,
  eventos: 1200,
  marketingRedes: 600,
  relacionesPublicas: 450,
  vendedoresIniciales: 1,
  contratarVendedores: 0,
  despedirVendedores: 0,
  operariosIniciales: 6,
  contratarOperarios: 4,
  despedirOperarios: 0,
  produccion: 358,
  montoCapacitacion: 20000,
  proveedorElegido: 'prov_1',
  cantidadMPpedida: 3623,
  innovacion: true,
  tipoInnovacion: 'Canal',
  montoInnovacion: 5000,
  activo: true,
};

{
  const canonicas = canonicalizarDecisionesMultiproducto([raizProd1, raizProd2Normalizado]);
  assert.strictEqual(canonicas.length, 2);
  assert.deepStrictEqual(canonicas.map(d => d.productoId), ['prod_1', 'prod_2']);
  assert.strictEqual(canonicas[0].producto, 'Sneaker Cultural Premium');
  assert.strictEqual(canonicas[1].producto, 'Calzado Médico Especializado');
  assert.strictEqual(canonicas[1].eventos, 1200);
  assert.strictEqual(canonicas[1].productos, undefined);

  const result = calcularPreSimulacion([raizProd1, raizProd2Normalizado], cfgConDemandasFormales({
    'Jóvenes urbanos / lifestyle boliviano': 2218,
    'Personal de salud y bienestar': 4150,
  })).resultado;
  assert.strictEqual(result.length, 2);
  assertKeysUnicas(result, ['eq_raiz__prod_1', 'eq_raiz__prod_2']);

  const p = porProducto(result);
  assert.strictEqual(p.prod_1.producto, 'Sneaker Cultural Premium');
  assert.strictEqual(p.prod_1.demandaFormal, 2218);
  assert.strictEqual(p.prod_1.demandaAsignada, 2218);
  assert.strictEqual(p.prod_1.ventasEstimadas, 2218);
  assert.strictEqual(p.prod_2.producto, 'Calzado Médico Especializado');
  assert.strictEqual(p.prod_2.demandaFormal, 4150);
  assert.strictEqual(p.prod_2.demandaAsignada, 3929);
  assert.strictEqual(p.prod_2.ventasEstimadas, 358);
}

{
  const legado = JSON.parse(JSON.stringify(raizProd1));
  legado.productos[1].producto = 'Calzado Médico Especializado';
  const result = calcularPreSimulacion([legado], cfg).resultado;
  assert.strictEqual(result.length, 2);
  assertKeysUnicas(result, ['eq_raiz__prod_1', 'eq_raiz__prod_2']);
}

{
  const prod1Plano = { ...raizProd1 };
  delete prod1Plano.productos;
  prod1Plano.productoId = 'prod_1';
  const result = calcularPreSimulacion([prod1Plano, raizProd2Normalizado], cfg).resultado;
  assert.strictEqual(result.length, 2);
  assertKeysUnicas(result, ['eq_raiz__prod_1', 'eq_raiz__prod_2']);
  const p = porProducto(result);
  assert.strictEqual(p.prod_1.producto, 'Sneaker Cultural Premium');
  assert.strictEqual(p.prod_2.producto, 'Calzado Médico Especializado');
}

{
  const mono = {
    equipo: 'eq_mono',
    producto: 'Sneaker Cultural Premium',
    segmentoObjetivo: 'Jóvenes urbanos / lifestyle boliviano',
    canalPrincipal: 'Venta Digital',
    canalSecundario: 'Ninguno',
    calidad: 8,
    precioVenta: 700,
    produccion: 100,
    publicidad: 1000,
  };
  const result = calcularPreSimulacion([mono], cfg).resultado;
  assert.strictEqual(result.length, 1);
  assertKeysUnicas(result, ['eq_mono__prod_1']);
  assert.strictEqual(result[0].producto, 'Sneaker Cultural Premium');
}

console.log('presim multiproducto canonico OK');
