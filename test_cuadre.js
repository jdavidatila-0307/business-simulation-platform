/**
 * test_cuadre.js — SimNego v3.2
 * Suite de pruebas canónicas del motor de cálculo.
 *
 * Verifica la invariante contable A = P + Patrimonio para 5 escenarios
 * que cubren todos los casos del simulador.
 *
 * USO:
 *   node test_cuadre.js
 *
 * INTEGRACIÓN (pre-commit):
 *   node test_cuadre.js && git commit -m "..."
 *
 * Si falla: el motor tiene un bug algebraico. NO hacer push.
 */

'use strict';

// test_cuadre.js no necesita BD — prueba el motor directamente (sin dotenv)
const engine = require('./src/engine');

// ── Parámetros canónicos COM540 ────────────────────────────────────────────
const PARAMS_BASE = {
  cajaInicial:              600000,
  activosFijosIniciales:     80000,
  depreciacionTrimestral:     2500,
  gastoAdminFijo:            55000,
  gastoFijoPlanta:           15000,
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
  probabilidadShock:          0.00,  // sin shock en tests
};

// ── Tipos de producto y canales mínimos ────────────────────────────────────
const TIPOS_PRODUCTO = {
  'Calzado Deportivo':        { costoBase: 180, nombre: 'Calzado Deportivo' },
  'Sneaker Cultural Premium': { costoBase: 298, nombre: 'Sneaker Cultural Premium' },
};
const CANALES = {
  'Tienda Propia':      { costoAdicionalUnitario: 10, comisionPct: 0.00, factorImpactoVendedores: 1.2, bonoAtractivo: 1.0 },
  'Distribuidores B2B': { costoAdicionalUnitario:  5, comisionPct: 0.08, factorImpactoVendedores: 0.8, bonoAtractivo: 0.9 },
};
// segmentos DEBE ser un array (engine usa segmentos.map)
const SEGMENTOS = [
  { nombre: 'Segmento A', demandaBase: 5000, pctContrabando: 0.05, tasaCrecimiento: 0.02, descripcion: 'Test A', tendencia: 'Estable', indiceExterno: 1.0 },
  { nombre: 'Segmento B', demandaBase: 3000, pctContrabando: 0.03, tasaCrecimiento: 0.01, descripcion: 'Test B', tendencia: 'Creciente', indiceExterno: 1.0 },
];

// ── Decisión base de un equipo ─────────────────────────────────────────────
function decBase(overrides = {}) {
  return {
    equipo:              'eq_test_01',
    equipoOriginal:      'eq_test_01',
    equipoNombre:        'Equipo Test',
    productoId:          'prod_1',
    producto:            'Calzado Deportivo',
    segmentoObjetivo:    'Segmento A',
    canalPrincipal:      'Tienda Propia',
    canalSecundario:     'Ninguno',
    calidad:             5,
    precioVenta:         200,
    produccion:          500,
    publicidad:          0,
    promocion:           0,
    eventos:             0,
    marketingRedes:      0,
    relacionesPublicas:  0,
    contratarVendedores: 0,
    despedirVendedores:  0,
    contratarOperarios:  0,
    despedirOperarios:   0,
    montoCapacitacion:   0,
    innovacion:          false,
    montoInnovacion:     0,
    tipoInnovacion:      'Producto',
    tipoPrestamo:        'Ninguno',
    montoPrestamo:       0,
    plazoPrestamo:       2,
    amortizacion:        0,
    tipoInvestigacion:   'No',
    montoInvestigacion:  0,
    stockMPInicial:      0,
    proveedorElegido:    '',
    cantidadMPpedida:    0,
    pedidosPendientes:   [],
    inventarioInicial:   0,
    // Continuidad financiera R1
    cajaInicial:         PARAMS_BASE.cajaInicial,
    activosFijosIniciales: PARAMS_BASE.activosFijosIniciales,
    cxcInicial:          0,
    deudaInicial:        0,
    vendedoresIniciales: PARAMS_BASE.vendedoresIniciales,
    operariosIniciales:  PARAMS_BASE.operariosIniciales,
    brandEquityInicial:  50,
    resultadoAcumuladoAnterior: 0,
    ivaAPagarAnterior:   0,
    ivaSaldoAFavorAnterior: 0,
    saldoIUEcompensable: 0,
    rondaNumero:         1,
    ...overrides,
  };
}

// ── Config mínima del simulador ────────────────────────────────────────────
function cfgBase(equipos, decisiones) {
  return {
    params:          PARAMS_BASE,
    tiposProducto:   TIPOS_PRODUCTO,
    canales:         CANALES,
    segmentos:       SEGMENTOS,
    afinidadMatrix:  {},
    competenciaExterna: [],
    demandaBaseAnteriorMap: {},
    rondaNumero:     1,
    proveedores:     [],
    shock:           { tipo: 'neutral', magnitud: 0, descripcion: 'sin shock' },
    equipos,
  };
}

// ── Verificación de cuadre ─────────────────────────────────────────────────
function verificarCuadre(resultado, nombreEscenario) {
  const r = resultado;
  const activos  = r.totalActivos   || 0;
  const pasivos  = r.totalPasivos   || (r.deudaFinal || 0) + (r.ivaAPagar || 0);
  const patrim   = r.patrimonio     || 0;
  const pPat     = pasivos + patrim;
  const descuadre = Math.abs(activos - pPat);

  if (descuadre > 1) {
    console.error(`  ❌ FALLA: ${nombreEscenario}`);
    console.error(`     Activos=${activos.toLocaleString('es-BO')} | Pasivos+Pat=${pPat.toLocaleString('es-BO')} | Δ=${descuadre.toFixed(2)} Bs`);
    return false;
  }
  console.log(`  ✅ ${nombreEscenario}: A=${activos.toLocaleString('es-BO')} | P+Pat=${pPat.toLocaleString('es-BO')} | Δ=${descuadre.toFixed(2)} Bs`);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// ESCENARIOS
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  TEST CUADRE — SimNego v3.2 — Motor de Cálculo');
  console.log('  Invariante: A = P + Patrimonio (Δ ≤ 1 Bs)');
  console.log('══════════════════════════════════════════════════════\n');

  let pasados = 0;
  let fallados = 0;

  // ── S1: Equipo con ventas normales (caso base COM540) ─────────────────
  console.log('S1 — Ventas normales (precio razonable, producción < capacidad)');
  try {
    const eq = { id: 'eq_s1', nombre: 'S1_Normal' };
    const dec = decBase({ equipo: 'eq_s1', equipoOriginal: 'eq_s1', equipoNombre: 'S1_Normal', precioVenta: 200, produccion: 400 });
    const cfg = cfgBase([eq], [dec]);
    const res = engine.ejecutarSimulador([dec], cfg);
    const r = res.resultados.find(r => r.equipoOriginal === 'eq_s1');
    if (verificarCuadre(r, 'Ventas normales')) pasados++; else fallados++;
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S1: ${e.message}`); fallados++; }

  // ── S2: Equipo con 0 ventas (precio prohibitivo, inventario acumulado) ─
  console.log('\nS2 — Cero ventas (precio muy alto, inventario acumulado)');
  try {
    const eq = { id: 'eq_s2', nombre: 'S2_SinVentas' };
    const dec = decBase({ equipo: 'eq_s2', equipoOriginal: 'eq_s2', equipoNombre: 'S2_SinVentas', precioVenta: 9999, produccion: 440 });
    const cfg = cfgBase([eq], [dec]);
    const res = engine.ejecutarSimulador([dec], cfg);
    const r = res.resultados.find(r => r.equipoOriginal === 'eq_s2');
    if (verificarCuadre(r, 'Cero ventas (inventario acumulado)')) pasados++; else fallados++;
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S2: ${e.message}`); fallados++; }

  // ── S3: sinDecision (equipo no cargó decisiones) ──────────────────────
  console.log('\nS3 — sinDecision (equipo pasivo, solo gastos fijos)');
  try {
    const eq = { id: 'eq_s3', nombre: 'S3_SinDec' };
    const dec = decBase({ equipo: 'eq_s3', equipoOriginal: 'eq_s3', equipoNombre: 'S3_SinDec', precioVenta: 0, produccion: 0, segmentoObjetivo: '', producto: '' });
    const cfg = cfgBase([eq], [dec]);
    const res = engine.ejecutarSimulador([dec], cfg);
    const r = res.resultados.find(r => r.equipoOriginal === 'eq_s3');
    if (verificarCuadre(r, 'sinDecision')) pasados++; else fallados++;
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S3: ${e.message}`); fallados++; }

  // ── S4: Equipo con préstamo activo ────────────────────────────────────
  console.log('\nS4 — Con préstamo operativo activo');
  try {
    const eq = { id: 'eq_s4', nombre: 'S4_Prestamo' };
    const dec = decBase({
      equipo: 'eq_s4', equipoOriginal: 'eq_s4', equipoNombre: 'S4_Prestamo',
      precioVenta: 190, produccion: 500,
      tipoPrestamo: 'Operativo', montoPrestamo: 50000, plazoPrestamo: 2, amortizacion: 25000,
    });
    const cfg = cfgBase([eq], [dec]);
    const res = engine.ejecutarSimulador([dec], cfg);
    const r = res.resultados.find(r => r.equipoOriginal === 'eq_s4');
    if (verificarCuadre(r, 'Con préstamo operativo')) pasados++; else fallados++;
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S4: ${e.message}`); fallados++; }

  // ── S5: Equipo con sobregiro (caja insuficiente para cubrir costos) ───
  console.log('\nS5 — Sobregiro (producción masiva sin ingresos suficientes)');
  try {
    const eq = { id: 'eq_s5', nombre: 'S5_Sobregiro' };
    const dec = decBase({
      equipo: 'eq_s5', equipoOriginal: 'eq_s5', equipoNombre: 'S5_Sobregiro',
      cajaInicial: 50000,  // caja baja
      precioVenta: 9999, produccion: 440,  // sin ventas + producción
      contratarOperarios: 5,  // contrata más operarios
    });
    const cfg = cfgBase([eq], [dec]);
    const res = engine.ejecutarSimulador([dec], cfg);
    const r = res.resultados.find(r => r.equipoOriginal === 'eq_s5');
    if (verificarCuadre(r, 'Sobregiro automático')) pasados++; else fallados++;
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S5: ${e.message}`); fallados++; }

  // ── S6: R2 con continuidad financiera — estado CONSISTENTE ───────────────
  // A₀ - P₀ = capitalContable + resAcumAnt
  // capitalContable = params.cajaInicial + params.AF = 600.000 + 80.000 = 680.000
  // cajaInicial(530.000) + AF(77.500) = 607.500 = 680.000 + resAcumAnt(-72.500) ✓
  console.log('\nS6 — R2 con continuidad financiera (estado consistente)');
  try {
    const eq = { id: 'eq_s6', nombre: 'S6_R2' };
    const dec = decBase({
      equipo: 'eq_s6', equipoOriginal: 'eq_s6', equipoNombre: 'S6_R2',
      rondaNumero:         2,
      cajaInicial:         530000,   // prev_cajaFinal consistente
      cxcInicial:          0,
      deudaInicial:        0,
      activosFijosIniciales: 77500,  // AF netos R1 (80.000 - 2.500 dep)
      // Apertura consistente: capitalContable(680.000) + resAcumAnt = opening_equity
      // opening_equity = cajaInicial(530.000) + AF(77.500) - ivaAPagarAnterior(5.000) = 602.500
      // resAcumAnt = 602.500 - 680.000 = -77.500
      resultadoAcumuladoAnterior: -77500,
      ivaAPagarAnterior:   5000,     // IVA pendiente de R1 (equity-neutral al pagar)
      ivaSaldoAFavorAnterior: 0,
      precioVenta:         195,
      produccion:          450,
    });
    const cfg = { ...cfgBase([eq], [dec]), rondaNumero: 2 };
    const res = engine.ejecutarSimulador([dec], cfg);
    const r = res.resultados.find(r => r.equipoOriginal === 'eq_s6');
    if (verificarCuadre(r, 'R2 con continuidad financiera')) pasados++; else fallados++;
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S6: ${e.message}`); fallados++; }

  // ── Resultado final ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  if (fallados === 0) {
    console.log(`  ✅ TODOS LOS ESCENARIOS CUADRAN (${pasados}/${pasados+fallados})`);
    console.log('  Motor listo para producción. Descuadre ≤ 1 Bs en todos los casos.');
  } else {
    console.log(`  ❌ FALLARON ${fallados} ESCENARIOS — NO HACER PUSH`);
    console.log(`  Corregir el motor antes de continuar.`);
    process.exit(1);
  }
  console.log('══════════════════════════════════════════════════════\n');
}

main().catch(e => { console.error('Error fatal:', e.message); process.exit(1); });
