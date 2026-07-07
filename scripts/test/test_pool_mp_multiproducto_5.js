/**
 * test_pool_mp_multiproducto_5.js — prueba aislada, no persistente.
 * Verifica el consumo secuencial del pool de MP consolidado por empresa
 * (fix aplicado en src/engine.js, commit f96448f) con 5 productos de la
 * MISMA empresa y un pool de MP insuficiente para todos.
 *
 * Ejecutar: node scripts/test/test_pool_mp_multiproducto_5.js
 */
'use strict';

const engine = require('../../src/engine');

// ── Parámetros canónicos COM540 (misma estructura que test_cuadre.js) ──────
const PARAMS_BASE = {
  cajaInicial:              600000,
  activosFijosIniciales:     80000,
  depreciacionTrimestral:     2500,
  gastoAdminFijo:            55000,
  gastoFijoPlanta:           15000,
  sueldosAdministrativosFijos: 61425,
  costoOperario:              9600,
  operariosIniciales:            4,
  productividadBase:           440,
  vendedoresIniciales:           2,
  sueldoTrimestralVendedor:  15000,
  costoContratacionOperario:  2400,
  costoDespidoOperario:       3600,
  costoContratacionVendedor:  6000,
  costoDespidoVendedor:       9000,
  factorCapacitacion:         0.05,
  pctVentasContado:           0.85,
  pctVentasCredito:           0.15,
  plazoCobro:                    2,
  tasaIVA:                    0.13,
  tasaIT:                     0.03,
  tasaIUE:                    0.25,
  periodosIUE:                   4,
  tasaSobregiro:             0.055,
  tasaPrestamoOperativo:     0.035,
  tasaPrestamoInversion:     0.025,
  comisionAperturaPrestamo:  0.015,
  plazoPrestamoOperativo:        2,
  plazoPrestamoInversion:        6,
  capacidadMaxProduccion:     1500,
  costoAlmacenamientoUnidad:     5,
  pctMateriaPrima:            0.40,
  unidadesMPporUnidad:         1.0,
  lambdaLogit:                 1.0,
  coefPrecio:               -0.005,
  factorCanibalizacion:       0.15,
  tasaDecaimiento:            0.05,
  costoInvestigacionBasica:   5000,
  costoInvestigacionPremium: 12000,
  costoInvestigacionEstrategico: 20000,
  factorInnovacionProducto:  0.333,
  factorInnovacionProceso:   0.333,
  modeloCostos:             'mixto',
  probabilidadShock:          0.00,
};

const TIPOS_PRODUCTO = {
  'Calzado Deportivo':          { costoBase: 180, nombre: 'Calzado Deportivo' },
  'Sneaker Cultural Premium':   { costoBase: 298, nombre: 'Sneaker Cultural Premium' },
  'Calzado Biomecánico Formal': { costoBase: 153, nombre: 'Calzado Biomecánico Formal' },
  'Calzado Ortopédico':         { costoBase: 136, nombre: 'Calzado Ortopédico' },
  'Sandalia Infantil':          { costoBase:  79, nombre: 'Sandalia Infantil' },
};

const CANALES = {
  'Tienda Propia': { costoAdicionalUnitario: 10, comisionPct: 0.00, factorImpactoVendedores: 1.2, bonoAtractivo: 1.0 },
};

const SEGMENTOS = [
  { nombre: 'Segmento A', demandaBase: 5000, pctContrabando: 0.05, tasaCrecimiento: 0.02, descripcion: 'Test A', tendencia: 'Estable', indiceExterno: 1.0 },
];

const PROVEEDORES = [
  { id: 'prov_1', nombre: 'Proveedor Test', factorCosto: 1.0, leadTime: 1 },
];

const nombresProductos = Object.keys(TIPOS_PRODUCTO); // 5 tipos disponibles

// ── Decisión de empresa con 5 productos, mismo proveedor, MP insuficiente ──
function campoBaseProducto(overrides = {}) {
  return {
    equipo: 'eq_test_5prod', equipoOriginal: 'eq_test_5prod', equipoNombre: 'EMPRESA 5 PROD',
    canalPrincipal: 'Tienda Propia', canalSecundario: 'Ninguno',
    segmentoObjetivo: 'Segmento A',
    calidad: 6, precioVenta: 200,
    publicidad: 0, promocion: 0, eventos: 0, marketingRedes: 0, relacionesPublicas: 0,
    contratarVendedores: 0, despedirVendedores: 0, contratarOperarios: 0, despedirOperarios: 0,
    montoCapacitacion: 0, innovacion: false, montoInnovacion: 0, tipoInnovacion: 'Producto',
    tipoPrestamo: 'Ninguno', montoPrestamo: 0, plazoPrestamo: 2, amortizacion: 0,
    tipoInvestigacion: 'No', montoInvestigacion: 0,
    inventarioInicial: 0,
    cajaInicial: PARAMS_BASE.cajaInicial,
    activosFijosIniciales: PARAMS_BASE.activosFijosIniciales,
    cxcInicial: 0, deudaInicial: 0,
    vendedoresIniciales: PARAMS_BASE.vendedoresIniciales,
    operariosIniciales: 20, // alto a propósito: el límite debe ser MP, no operarios
    brandEquityInicial: 50,
    resultadoAcumuladoAnterior: 0, ivaAPagarAnterior: 0, ivaSaldoAFavorAnterior: 0,
    saldoIUEcompensable: 0,
    rondaNumero: 1,
    proveedorElegido: 'prov_1',
    cantidadMPpedida: 0, // sin pedido nuevo esta ronda — solo el stock inicial de empresa
    ...overrides,
  };
}

const productos = [1, 2, 3, 4, 5].map(i => campoBaseProducto({
  productoId: `prod_${i}`,
  activo: true,
  producto: nombresProductos[i - 1],
  produccion: 300,
}));

const decisionEmpresa = {
  ...campoBaseProducto({ productoId: 'prod_1', producto: nombresProductos[0], produccion: 300 }),
  // Materia prima a nivel EMPRESA: pool deliberadamente insuficiente.
  stockMPInicial: 1000,
  pedidosPendientes: [],
  productos,
};

const cfg = {
  params: PARAMS_BASE,
  tiposProducto: TIPOS_PRODUCTO,
  canales: CANALES,
  segmentos: SEGMENTOS,
  afinidadMatrix: {},
  competenciaExterna: [],
  demandaBaseAnteriorMap: {},
  rondaNumero: 1,
  proveedores: PROVEEDORES,
  shock: { tipo: 'neutral', magnitud: 0, descripcion: 'sin shock' },
  equipos: [{ id: 'eq_test_5prod', nombre: 'EMPRESA 5 PROD' }],
};

const salida = engine.ejecutarSimulador([decisionEmpresa], cfg);

const porProd = {};
['prod_1', 'prod_2', 'prod_3', 'prod_4', 'prod_5'].forEach(pid => {
  porProd[pid] = salida.resultados.find(r => r.productoId === pid);
});

console.log('=== VERIFICACIÓN POOL MP MULTIPRODUCTO — 5 PRODUCTOS, MISMA EMPRESA ===\n');
console.log('Pool de empresa (stockMPInicial): 1000 | Producción declarada por producto: 300 (total 1500)\n');

['prod_1', 'prod_2', 'prod_3', 'prod_4', 'prod_5'].forEach(pid => {
  const r = porProd[pid];
  if (!r) {
    console.log(`${pid}: NO ENCONTRADO en resultados`);
    return;
  }
  console.log(`${pid}: produccion=${r.produccion}  stockMPFinal=${r.stockMPFinal}`);
});

const sumaProduccion = ['prod_1', 'prod_2', 'prod_3', 'prod_4', 'prod_5']
  .reduce((s, pid) => s + (porProd[pid]?.produccion ?? 0), 0);

const stockMPFinales = ['prod_1', 'prod_2', 'prod_3', 'prod_4', 'prod_5'].map(pid => porProd[pid]?.stockMPFinal);
const stockMPFinalConsistente = stockMPFinales.every(v => v === stockMPFinales[0]);

console.log('\n--- Verificaciones (reportadas, no forzadas) ---');
console.log(`1. Suma de producción final = ${sumaProduccion}  (<= 1000: ${sumaProduccion <= 1000})`);
console.log(`2. Orden de servicio secuencial:`);
console.log(`   prod_1=${porProd.prod_1?.produccion} (esperado 300: ${porProd.prod_1?.produccion === 300})`);
console.log(`   prod_2=${porProd.prod_2?.produccion} (esperado 300: ${porProd.prod_2?.produccion === 300})`);
console.log(`   prod_3=${porProd.prod_3?.produccion} (esperado 400 [remanente]: ${porProd.prod_3?.produccion === 400})`);
console.log(`   prod_4=${porProd.prod_4?.produccion} (esperado 0: ${porProd.prod_4?.produccion === 0})`);
console.log(`   prod_5=${porProd.prod_5?.produccion} (esperado 0: ${porProd.prod_5?.produccion === 0})`);
console.log(`3. stockMPFinal idéntico en los 5 productos: ${stockMPFinalConsistente}  (valores: ${JSON.stringify(stockMPFinales)})`);
