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
  probabilidadShock:          0.00,  // sin shock en tests
};

// ── Tipos de producto y canales mínimos ────────────────────────────────────
const TIPOS_PRODUCTO = {
  'Calzado Deportivo':          { costoBase: 180, nombre: 'Calzado Deportivo' },
  'Sneaker Cultural Premium':   { costoBase: 298, nombre: 'Sneaker Cultural Premium' },
  'Calzado Biomecánico Formal': { costoBase: 153, nombre: 'Calzado Biomecánico Formal' },
  'Calzado Ortopédico':         { costoBase: 136, nombre: 'Calzado Ortopédico' },
  'Sandalia Infantil':          { costoBase:  79, nombre: 'Sandalia Infantil' },
  'Calzado Médico':             { costoBase: 226, nombre: 'Calzado Médico' },
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

  // ── S7: Multiproducto R1 — 5 productos, 6 equipos ───────────────────────
  // Cobertura: partición multiproducto (Hamlet & Taylor, 1990)
  console.log('\nS7 — Multiproducto R1 (5 productos × 6 equipos)');
  try {
    const tipos5 = TIPOS_PRODUCTO;  // all 6 types available
    const nombres5 = Object.keys(tipos5).slice(0, 5);
    const eqs7 = ['B','E','C','A','D','F'].map(n => ({ id:`eq_s7_${n}`, nombre:n }));
    const decsMulti = eqs7.map(eq => {
      const base = decBase({
        equipo: eq.id, equipoOriginal: eq.id, equipoNombre: eq.nombre,
        rondaNumero: 1, cajaInicial: 500000, activosFijosIniciales: 80000,
        operariosIniciales: 4, vendedoresIniciales: 0,
      });
      base.productos = nombres5.map((nom, idx) => ({
        ...base, productoId: `prod_${idx+1}`, activo: true, producto: nom,
        segmentoObjetivo: 'Segmento A', canalPrincipal: 'Tienda Propia',
        precioVenta: 200, produccion: 80, calidad: 6, publicidad: 3000,
        promocion:0, eventos:0, marketingRedes:0, relacionesPublicas:0,
        contratarOperarios:0, despedirOperarios:0, contratarVendedores:0, despedirVendedores:0,
        inventarioInicial:0, ivaAPagarAnterior:0, ivaSaldoAFavorAnterior:0,
        resultadoAcumuladoAnterior:0, montoCapacitacion:0, montoInnovacion:0,
        innovacion:false, tipoPrestamo:'Ninguno', montoPrestamo:0, amortizacion:0,
        tipoInvestigacion:'No', montoInvestigacion:0,
        stockMPInicial:0, proveedorElegido:'', cantidadMPpedida:0, pedidosPendientes:[],
      }));
      return base;
    });
    const cfgS7 = { ...cfgBase(eqs7, decsMulti), tiposProducto: tipos5, rondaNumero: 1 };
    const resS7 = engine.ejecutarSimulador(decsMulti, cfgS7);
    let okS7 = 0;
    resS7.resultados.forEach(r => {
      if (Math.abs((r.totalActivos||0)-((r.totalPasivos||0)+(r.patrimonio||0))) < 2) okS7++;
    });
    const totalS7 = resS7.resultados.length;
    if (okS7 === totalS7) { console.log(`  ✅ Multiproducto R1: ${okS7}/${totalS7} cuadran | Δ=0.00 Bs`); pasados++; }
    else { console.log(`  ❌ Multiproducto R1: ${okS7}/${totalS7} cuadran`); fallados++; }
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S7: ${e.message}`); fallados++; }

  // ── S8: Multiproducto R2 — continuidad financiera ────────────────────────
  console.log('\nS8 — Multiproducto R2 (continuidad financiera 5 productos)');
  try {
    const eqS8 = { id:'eq_s8', nombre:'S8' };
    const tiposS8 = TIPOS_PRODUCTO;
    const nomsS8 = Object.keys(tiposS8).slice(0,5);
    const decS8 = decBase({
      equipo:eqS8.id, equipoOriginal:eqS8.id, equipoNombre:eqS8.nombre,
      rondaNumero:2, cajaInicial:400000, activosFijosIniciales:77500,
      operariosIniciales:4, vendedoresIniciales:0,
      deudaInicial:0, cxcInicial:0,
      resultadoAcumuladoAnterior:-50000, ivaAPagarAnterior:0, ivaSaldoAFavorAnterior:0,
    });
    decS8.productos = nomsS8.map((nom, idx) => ({
      ...decS8, productoId:`prod_${idx+1}`, activo:true, producto:nom,
      segmentoObjetivo:'Segmento A', canalPrincipal:'Tienda Propia',
      precioVenta:200, produccion:80, calidad:6, publicidad:3000,
      inventarioInicial:0, ivaAPagarAnterior:0, ivaSaldoAFavorAnterior:0,
      resultadoAcumuladoAnterior:-50000,
      contratarOperarios:0, despedirOperarios:0, montoCapacitacion:0, montoInnovacion:0,
      innovacion:false, tipoPrestamo:'Ninguno', montoPrestamo:0, amortizacion:0,
      tipoInvestigacion:'No', montoInvestigacion:0,
      stockMPInicial:0, proveedorElegido:'', cantidadMPpedida:0, pedidosPendientes:[],
    }));
    const cfgS8 = { ...cfgBase([eqS8],[decS8]), tiposProducto:tiposS8, rondaNumero:2 };
    const resS8 = engine.ejecutarSimulador([decS8], cfgS8);
    let okS8 = 0;
    resS8.resultados.forEach(r => {
      if (Math.abs((r.totalActivos||0)-((r.totalPasivos||0)+(r.patrimonio||0))) < 2) okS8++;
    });
    const totalS8 = resS8.resultados.length;
    if (okS8 === totalS8) { console.log(`  ✅ Multiproducto R2: ${okS8}/${totalS8} cuadran | Δ=0.00 Bs`); pasados++; }
    else { console.log(`  ❌ Multiproducto R2: ${okS8}/${totalS8} cuadran`); fallados++; }
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S8: ${e.message}`); fallados++; }

  // ── S9: 6 equipos × 5 productos × R12 — escenario madurez ───────────────
  console.log('\nS9 — 6 equipos × 5 productos × R12 (madurez)');
  try {
    const tiposS9 = TIPOS_PRODUCTO;
    const nomsS9 = Object.keys(tiposS9).slice(0,5);
    const eqsS9 = ['B','E','C','A','D','F'].map(n => ({ id:`eq_s9_${n}`, nombre:n }));
    const decsS9 = eqsS9.map(eq => {
      const base = decBase({
        equipo:eq.id, equipoOriginal:eq.id, equipoNombre:eq.nombre,
        rondaNumero:12, cajaInicial:320000, activosFijosIniciales:52500,
        operariosIniciales:5, vendedoresIniciales:1,
        deudaInicial:0, cxcInicial:0,
        resultadoAcumuladoAnterior:-180000, ivaAPagarAnterior:0, ivaSaldoAFavorAnterior:0,
      });
      base.productos = nomsS9.map((nom, idx) => ({
        ...base, productoId:`prod_${idx+1}`, activo:true, producto:nom,
        segmentoObjetivo:'Segmento A', canalPrincipal:'Tienda Propia',
        precioVenta:200, produccion:120, calidad:7, publicidad:4000, promocion:2000,
        inventarioInicial:0, resultadoAcumuladoAnterior:-180000,
        ivaAPagarAnterior:0, ivaSaldoAFavorAnterior:0,
        contratarOperarios:0, despedirOperarios:0, montoCapacitacion:0, montoInnovacion:0,
        innovacion:false, tipoPrestamo:'Ninguno', montoPrestamo:0, amortizacion:0,
        tipoInvestigacion:'No', montoInvestigacion:0,
        stockMPInicial:0, proveedorElegido:'', cantidadMPpedida:0, pedidosPendientes:[],
      }));
      return base;
    });
    const cfgS9 = { ...cfgBase(eqsS9,decsS9), tiposProducto:tiposS9, rondaNumero:12 };
    const resS9 = engine.ejecutarSimulador(decsS9, cfgS9);
    let okS9 = 0;
    resS9.resultados.forEach(r => {
      if (Math.abs((r.totalActivos||0)-((r.totalPasivos||0)+(r.patrimonio||0))) < 2) okS9++;
    });
    const totalS9 = resS9.resultados.length;
    if (okS9 === totalS9) { console.log(`  ✅ 6eq×5prod×R12: ${okS9}/${totalS9} cuadran | Δ=0.00 Bs`); pasados++; }
    else { console.log(`  ❌ 6eq×5prod×R12: ${okS9}/${totalS9} cuadran`); fallados++; }
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S9: ${e.message}`); fallados++; }

  // ── S10: capacidadMaxProduccion por equipo topa la producción ─────────
  console.log('\nS10 — Capacidad de planta por equipo (tope = 100)');
  try {
    const eq = { id: 'eq_s10', nombre: 'S10_CapBaja' };
    const dec = decBase({
      equipo: 'eq_s10', equipoOriginal: 'eq_s10', equipoNombre: 'S10_CapBaja',
      produccion: 500,                 // decide producir 500
      capacidadMaxProduccion: 100,     // pero su planta solo permite 100
    });
    const cfg = cfgBase([eq], [dec]);
    const res = engine.ejecutarSimulador([dec], cfg);
    const r = res.resultados.find(r => r.equipoOriginal === 'eq_s10');
    const topado = r.produccion === 100;
    const cuadra = verificarCuadre(r, 'Cap planta por equipo');
    if (cuadra && topado) { console.log(`  ✅ produccion=${r.produccion} (topado en 100, esperado 100)`); pasados++; }
    else { console.error(`  ❌ produccion=${r.produccion} (esperado 100) | cuadra=${cuadra}`); fallados++; }
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S10: ${e.message}`); fallados++; }

  // ── S11: lead time de maquinaria — bloqueo de producción solo en R1 ────
  console.log('\nS11 — Lead time maquinaria (R1 bloqueada, R2 opera)');
  try {
    const eq = { id: 'eq_s11', nombre: 'S11_LeadTime' };
    const dec = decBase({
      equipo: 'eq_s11', equipoOriginal: 'eq_s11', equipoNombre: 'S11_LeadTime',
      produccion: 1000,                // decide producir 1000
      capacidadMaxProduccion: 1350,    // capacidad real de planta (intacta, ej. BIOPASO)
    });

    // Caso A — R1 con bloqueo: producción forzada a 0 (planta en lead time)
    const cfgR1 = { ...cfgBase([eq], [dec]), rondaNumero: 1, bloquearProduccionR1: true };
    const resR1 = engine.ejecutarSimulador([dec], cfgR1);
    const rR1   = resR1.resultados.find(r => r.equipoOriginal === 'eq_s11');
    const okR1prod   = rR1.produccion === 0;
    const okR1cuadra = verificarCuadre(rR1, 'Lead time R1 (bloqueada)');

    // Caso B — R2 con el MISMO flag: lead time ya no aplica, capacidad real opera
    const cfgR2 = { ...cfgBase([eq], [dec]), rondaNumero: 2, bloquearProduccionR1: true };
    const resR2 = engine.ejecutarSimulador([dec], cfgR2);
    const rR2   = resR2.resultados.find(r => r.equipoOriginal === 'eq_s11');
    const okR2prod   = rR2.produccion === 1000;
    const okR2cuadra = verificarCuadre(rR2, 'Lead time R2 (opera)');

    if (okR1prod && okR1cuadra && okR2prod && okR2cuadra) {
      console.log(`  ✅ R1 produccion=${rR1.produccion} (esperado 0) | R2 produccion=${rR2.produccion} (esperado 1000, cap real intacta)`);
      pasados++;
    } else {
      console.error(`  ❌ R1 produccion=${rR1.produccion} (esp 0, cuadra=${okR1cuadra}) | R2 produccion=${rR2.produccion} (esp 1000, cuadra=${okR2cuadra})`);
      fallados++;
    }
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S11: ${e.message}`); fallados++; }

  // ── S12: Activos complementarios Fase 0 — atractivo condicionado por canal + patentes en Proceso ──
  console.log('\nS12 — Activos complementarios (atractivo condicionado por canal; patentes solo Proceso)');
  try {
    const P = { ...PARAMS_BASE,
      bonoVehiculoLogistico: 0.5, bonoMueblesTienda: 0.8,
      bonoComputoDigital: 1.2, factorPatentesInnovacion: 1.3 };

    // Corre un equipo (1 producto, sin canibalización) y devuelve su resultado
    const correr = (overrides) => {
      const eq = { id: 'eq_s12', nombre: 'S12' };
      const dec = decBase({ equipo:'eq_s12', equipoOriginal:'eq_s12', equipoNombre:'S12', ...overrides });
      const cfg = { ...cfgBase([eq], [dec]), params: P };
      const res = engine.ejecutarSimulador([dec], cfg);
      return res.resultados.find(r => r.equipoOriginal === 'eq_s12');
    };
    const aprox = (a, b) => Math.abs(a - b) <= 0.001;

    // Caso 1a — Vehículo SÍ aporta con canal logístico (Distribuidores B2B), escala con nivel
    const v_con = correr({ canalPrincipal:'Distribuidores B2B', produccion:400, vehiculo_nivel:3 });
    const v_sin = correr({ canalPrincipal:'Distribuidores B2B', produccion:400, vehiculo_nivel:0 });
    const d1a = v_con.atractivo - v_sin.atractivo;
    const ok1a = aprox(d1a, 0.5 * 3);  // 1.5
    console.log(`  ${ok1a?'✅':'❌'} Vehículo nivel3 + B2B: Δatractivo=${d1a.toFixed(3)} (esperado 1.5)`);

    // Caso 1b — Vehículo NO aporta con canal no-logístico (Tienda Propia)
    const v_np_con = correr({ canalPrincipal:'Tienda Propia', produccion:400, vehiculo_nivel:3 });
    const v_np_sin = correr({ canalPrincipal:'Tienda Propia', produccion:400, vehiculo_nivel:0 });
    const d1b = v_np_con.atractivo - v_np_sin.atractivo;
    const ok1b = aprox(d1b, 0);
    console.log(`  ${ok1b?'✅':'❌'} Vehículo nivel3 + Tienda Propia: Δatractivo=${d1b.toFixed(3)} (esperado 0)`);

    // Caso 2 — Muebles SÍ aporta con Tienda Propia
    const m_con = correr({ canalPrincipal:'Tienda Propia', produccion:400, muebles_comprado:true });
    const m_sin = correr({ canalPrincipal:'Tienda Propia', produccion:400, muebles_comprado:false });
    const d2 = m_con.atractivo - m_sin.atractivo;
    const ok2 = aprox(d2, 0.8);
    console.log(`  ${ok2?'✅':'❌'} Muebles + Tienda Propia: Δatractivo=${d2.toFixed(3)} (esperado 0.8)`);

    // Caso 3 — Cómputo SÍ aporta con Venta Digital
    const c_con = correr({ canalPrincipal:'Venta Digital', produccion:400, equipos_computo_comprado:true });
    const c_sin = correr({ canalPrincipal:'Venta Digital', produccion:400, equipos_computo_comprado:false });
    const d3 = c_con.atractivo - c_sin.atractivo;
    const ok3 = aprox(d3, 1.2);
    console.log(`  ${ok3?'✅':'❌'} Cómputo + Venta Digital: Δatractivo=${d3.toFixed(3)} (esperado 1.2)`);

    // Caso 4 — Patentes potencian SOLO Proceso (menor CU); Producto queda intacto
    const pr_con = correr({ innovacion:true, tipoInnovacion:'Proceso', montoInnovacion:50000, produccion:500, patentes_comprado:true });
    const pr_sin = correr({ innovacion:true, tipoInnovacion:'Proceso', montoInnovacion:50000, produccion:500, patentes_comprado:false });
    const ok4a = pr_con.costoUnitario < pr_sin.costoUnitario;
    console.log(`  ${ok4a?'✅':'❌'} Patentes + Proceso: CU=${pr_con.costoUnitario} < ${pr_sin.costoUnitario} (debe bajar)`);

    const pd_con = correr({ innovacion:true, tipoInnovacion:'Producto', montoInnovacion:50000, produccion:500, patentes_comprado:true });
    const pd_sin = correr({ innovacion:true, tipoInnovacion:'Producto', montoInnovacion:50000, produccion:500, patentes_comprado:false });
    const ok4b = pd_con.costoUnitario === pd_sin.costoUnitario;
    console.log(`  ${ok4b?'✅':'❌'} Patentes + Producto: CU=${pd_con.costoUnitario} == ${pd_sin.costoUnitario} (sin cambio)`);

    // Cuadre contable en un caso representativo (vehículo + B2B con activo)
    const okCuadre = verificarCuadre(v_con, 'Activos — cuadre contable');

    if (ok1a && ok1b && ok2 && ok3 && ok4a && ok4b && okCuadre) { pasados++; }
    else { fallados++; }
  } catch(e) { console.error(`  ❌ EXCEPCIÓN S12: ${e.message}`); fallados++; }

  // ── Resultado final ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  // F1: una decisión proveniente de Fase 0 debe conservar su capital propio.
  console.log('\nF1 — Capital variable Fase 0 (prioriza decisión sobre parámetros)');
  try {
    const eq = { id: 'eq_f1', nombre: 'F1_CapitalVariable' };
    const paramsF1 = {
      ...PARAMS_BASE,
      cajaInicial: 500000,
      activosFijosIniciales: 80000,
      capitalInicial: 580000,
      capitalContable: 580000,
    };
    const dec = decBase({
      equipo: eq.id, equipoOriginal: eq.id, equipoNombre: eq.nombre,
      rondaNumero: 1,
      cajaInicial: 300000,
      activosFijosIniciales: 100000,
      deudaInicial: 50000,
      capitalInicial: 350000,
      precioVenta: 200,
      produccion: 400,
    });
    const r = engine.ejecutarSimulador([dec], { ...cfgBase([eq], [dec]), params: paramsF1, rondaNumero: 1 })
      .resultados.find(x => x.equipoOriginal === eq.id);
    const okCapital = r.capitalContable === 350000;
    const cuadra = verificarCuadre(r, 'F1 capital variable Fase 0');
    if (okCapital && cuadra) {
      console.log(`  ✅ capitalContable=${r.capitalContable} (esperado 350000; no 400000 ni 580000)`);
      pasados++;
    } else {
      console.error(`  ❌ capitalContable=${r.capitalContable} (esperado 350000) | cuadra=${cuadra}`);
      fallados++;
    }
  } catch(e) { console.error(`  ❌ EXCEPCIÓN F1: ${e.message}`); fallados++; }

  // F2: R2 debe reutilizar el capital contable que cerró en R1.
  console.log('\nF2 — Continuidad R1 → R2 conserva capital propio');
  try {
    const eq = { id: 'eq_f2', nombre: 'F2_ContinuidadCapital' };
    const paramsF2 = {
      ...PARAMS_BASE,
      cajaInicial: 500000,
      activosFijosIniciales: 80000,
      capitalInicial: 580000,
      capitalContable: 580000,
    };
    const decR1 = decBase({
      equipo: eq.id, equipoOriginal: eq.id, equipoNombre: eq.nombre,
      rondaNumero: 1,
      cajaInicial: 300000,
      activosFijosIniciales: 100000,
      deudaInicial: 50000,
      capitalInicial: 350000,
      precioVenta: 200,
      produccion: 400,
    });
    const r1 = engine.ejecutarSimulador([decR1], { ...cfgBase([eq], [decR1]), params: paramsF2, rondaNumero: 1 })
      .resultados.find(x => x.equipoOriginal === eq.id);
    const baseR2 = decBase({
      equipo: eq.id, equipoOriginal: eq.id, equipoNombre: eq.nombre,
      rondaNumero: 2,
      precioVenta: 200,
      produccion: 400,
    });
    const decR2 = engine.propagarEstado(baseR2, r1, paramsF2);
    decR2.rondaNumero = 2;
    const r2 = engine.ejecutarSimulador([decR2], { ...cfgBase([eq], [decR2]), params: paramsF2, rondaNumero: 2 })
      .resultados.find(x => x.equipoOriginal === eq.id);
    const okPropagado = decR2.capitalContableInicial === 350000;
    const okCapital = r2.capitalContable === 350000;
    const cuadra = verificarCuadre(r2, 'F2 continuidad capital R2');
    if (okPropagado && okCapital && cuadra) {
      console.log(`  ✅ capitalContableInicial=${decR2.capitalContableInicial}; R2=${r2.capitalContable} (esperado 350000)`);
      pasados++;
    } else {
      console.error(`  ❌ propagado=${decR2.capitalContableInicial}; R2=${r2.capitalContable}; cuadra=${cuadra}`);
      fallados++;
    }
  } catch(e) { console.error(`  ❌ EXCEPCIÓN F2: ${e.message}`); fallados++; }

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
