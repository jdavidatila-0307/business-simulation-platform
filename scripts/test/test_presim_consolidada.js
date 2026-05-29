const { calcularPreSimulacionConsolidada } = require('./src/engine');
const cfg = require('./industrias/calzados_v1.json');

const decision = {
  equipo: 'eq_test',
  equipoOriginal: 'eq_test',
  isBot: false,
  submitted: true,
  productos: [{
    productoId: 'prod_1',
    activo: true,
    producto: 'Deportivas',
    segmentoObjetivo: 'Jóvenes urbanos',
    canalPrincipal: 'Tienda propia',
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
    tipoInvestigacion: 'No'
  }],
  // Campos planos para compatibilidad
  producto: 'Deportivas',
  segmentoObjetivo: 'Jóvenes urbanos',
  canalPrincipal: 'Tienda propia',
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
  resultadoAcumuladoAnterior: 0
};

const result = calcularPreSimulacionConsolidada([decision], cfg);
console.log('Resultados:', JSON.stringify(result.resultado, null, 2));
console.log('¿El primer resultado tiene equipo?', result.resultado[0]?.equipo);
console.log('¿Coincide con equipoOriginal?', result.resultado[0]?.equipo === 'eq_test');