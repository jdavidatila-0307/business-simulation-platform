const assert = require('assert');
const { calcularPreSimulacionConsolidada } = require('../../src/engine');
const industria = require('../../industrias/Calzados_COM540_1_2026_V2.json');

const cfg = {
  params: industria.params,
  tiposProducto: industria.tiposProducto,
  canales: industria.canales,
  segmentos: industria.segmentos,
  afinidadMatrix: industria.afinidadMatrix,
  competenciaExterna: industria.competenciaExterna,
};

const decision = {
  equipo: 'eq_test',
  equipoOriginal: 'eq_test',
  isBot: false,
  submitted: true,
  productos: [{
    productoId: 'prod_1',
    activo: true,
    producto: 'Sneaker Cultural Premium',
    segmentoObjetivo: 'Jóvenes urbanos / lifestyle boliviano',
    canalPrincipal: 'Venta Digital',
    canalSecundario: 'Ninguno',
    calidad: 5,
    precioVenta: 85,
    produccion: 500,
    publicidad: 3000,
    promocion: 0,
    eventos: 0,
    marketingRedes: 0,
    relacionesPublicas: 0,
    vendedoresIniciales: 2,
    contratarVendedores: 0,
    despedirVendedores: 0,
    tipoPrestamo: 'Ninguno',
    montoPrestamo: 0,
    tipoInvestigacion: 'No',
  }],
  producto: 'Sneaker Cultural Premium',
  segmentoObjetivo: 'Jóvenes urbanos / lifestyle boliviano',
  canalPrincipal: 'Venta Digital',
  canalSecundario: 'Ninguno',
  calidad: 5,
  precioVenta: 85,
  produccion: 500,
  publicidad: 3000,
  promocion: 0,
  eventos: 0,
  marketingRedes: 0,
  relacionesPublicas: 0,
  innovacion: false,
  tipoInnovacion: 'Producto',
  montoInnovacion: 0,
  vendedoresIniciales: 2,
  contratarVendedores: 0,
  despedirVendedores: 0,
  tipoPrestamo: 'Ninguno',
  montoPrestamo: 0,
  amortizacion: 0,
  tipoInvestigacion: 'No',
  cajaInicial: 50000,
  activosFijosIniciales: 80000,
  cxcInicial: 0,
  deudaInicial: 0,
  inventarioInicial: 0,
  resultadoAcumuladoAnterior: 0,
};

const result = calcularPreSimulacionConsolidada([decision], cfg);
assert.strictEqual(result.resultado.length, 1);
assert.strictEqual(result.resultado[0]?.equipo, 'eq_test');
assert.strictEqual(result.resultado[0]?.producto, 'Sneaker Cultural Premium');

console.log('presim consolidada OK');
