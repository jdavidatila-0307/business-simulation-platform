/**
 * validar_params.js — SimNego v3.2
 * Módulo de validación de parámetros para simulaciones.
 *
 * DOS USOS:
 *   1. Módulo (importado por server.js al crear una sim):
 *      const { validarYCompletarParams } = require('./src/validar_params');
 *
 *   2. Script de diagnóstico standalone:
 *      cd C:\Win\SimuladorNegocios
 *      node src/validar_params.js                  ← valida todas las sims
 *      node src/validar_params.js sim_mpi8g7y5     ← valida una sim específica
 *
 * REGLAS APLICADAS:
 *   R1 — Completitud: claves que el motor necesita y no están → auto-completar + advertir
 *   R2 — Caja inicial > 0: previene sobregiro fantasma desde R1
 *   R3 — Consistencia cobros (S2): pctVentasContado + pctVentasCredito = 1.0
 */

'use strict';

// ── Claves requeridas por el motor con sus valores canónicos Calzados ────────
// Solo se usan como RESPALDO cuando no hay plantilla disponible.
// Siempre se prefiere la plantilla de la industria sobre estos defaults.
const DEFAULTS_CANON = {
  // Capital e inventario inicial
  activosFijosIniciales: 80000, cajaInicial: 600000,
  cxcInicial: 0, deudaInicial: 0, inventarioInicialUnid: 0,
  capacidadMaxProduccion: 1500,
  // Costos fijos
  gastoAdminFijo: 165000, gastoFijoPlanta: 45000, depreciacionTrimestral: 2500,
  costoAlmacenamientoUnidad: 5, costoAlmacenamientoMP: 0.05,
  // Operarios — fallbacks del engine INCORRECTOS para Calzados (riesgo alto)
  operariosIniciales: 4, productividadBase: 440,
  costoOperario: 9600, costoContratacionOperario: 2400, costoDespidoOperario: 3600,
  factorCapacitacion: 0.05,
  // Vendedores
  vendedoresIniciales: 2, sueldoTrimestralVendedor: 15000,
  costoContratacionVendedor: 6000, costoDespidoVendedor: 9000,
  // Financiamiento
  tasaSobregiro: 0.055, comisionAperturaPrestamo: 0.015,
  tasaPrestamoOperativo: 0.035, tasaPrestamoInversion: 0.025,
  plazoPrestamoOperativo: 2, plazoPrestamoInversion: 6, plazoCobro: 2,
  // Ventas
  pctVentasContado: 0.85, pctVentasCredito: 0.15,
  // Materia prima
  pctMateriaPrima: 0.40, unidadesMPporUnidad: 1.0,
  // Investigación e innovación
  costoInvestigacionBasica: 5000, costoInvestigacionPremium: 12000,
  costoInvestigacionEstrategico: 20000,
  factorInnovacionProducto: 0.333, factorInnovacionProceso: 0.333,
  // Impuestos
  tasaIVA: 0.13, tasaIT: 0.03, tasaIUE: 0.25, periodosIUE: 4,
  // Mercado
  lambdaLogit: 1.0, coefPrecio: -0.005,
  factorCanibalizacion: 0.15, tasaDecaimiento: 0.05,
  // Motor
  modeloCostos: 'mixto',
};

// Claves con fallbacks INCORRECTOS en el engine para Calzados
// Si faltan, el motor calcula resultados equivocados en silencio
const CLAVES_RIESGO_ALTO = [
  'costoOperario',           // engine ?? 3200 vs Calzados 9600 (3×)
  'costoContratacionOperario', // engine ?? 800  vs Calzados 2400 (3×)
  'costoDespidoOperario',    // engine ?? 1200 vs Calzados 3600 (3×)
];

/**
 * Valida y completa los parámetros de una simulación antes de crearla.
 *
 * @param {object} params - Los parámetros cargados (de plantilla, baseSim o constants)
 * @param {object} plantillaCanonica - Los params del archivo de industria (referencia preferida)
 * @returns {{ ok: boolean, errores: string[], advertencias: string[], params: object }}
 *   - ok: false si hay errores bloqueantes (R2 o R3)
 *   - errores: problemas que BLOQUEAN la creación
 *   - advertencias: claves completadas automáticamente (solo informativo)
 *   - params: objeto params completado y listo para guardar
 */
function validarYCompletarParams(params, plantillaCanonica = {}) {
  const errores     = [];
  const advertencias = [];
  const p = { ...params };

  // ── R1: Completitud ──────────────────────────────────────────────────────
  // Referencia = plantilla de industria + defaults canónicos como respaldo
  const referencia = { ...DEFAULTS_CANON, ...plantillaCanonica };
  for (const [clave, valorRef] of Object.entries(referencia)) {
    if (p[clave] === undefined || p[clave] === null) {
      p[clave] = valorRef;
      const esRiesgo = CLAVES_RIESGO_ALTO.includes(clave);
      if (esRiesgo) {
        advertencias.push(
          `⚠ [RIESGO ALTO] Clave faltante: "${clave}" → completada con ${valorRef}. ` +
          `El fallback del motor es incorrecto para Calzados. Verifica en el panel ⚙ Parámetros.`
        );
      } else {
        advertencias.push(`ℹ Clave faltante: "${clave}" → completada con valor de referencia ${valorRef}`);
      }
    }
  }

  // ── R2: Balance apertura — caja inicial > 0 ──────────────────────────────
  //   capitalContable se deriva automáticamente: cajaInicial + AF − deuda
  //   Si cajaInicial = 0, el motor genera sobregiro fantasma desde R1
  const caja = Number(p.cajaInicial ?? 0);
  const af   = Number(p.activosFijosIniciales ?? 0);
  if (caja <= 0) {
    errores.push(
      `❌ [R2] cajaInicial debe ser mayor a 0.\n` +
      `   Valor actual: ${caja}\n` +
      `   Con caja = 0, todos los equipos arrancan con sobregiro desde R1.\n` +
      `   El capital contable inicial = cajaInicial + activosFijosIniciales (${af}) = ${caja + af}.\n` +
      `   Corrige cajaInicial antes de crear la simulación.`
    );
  }

  // ── R3: Consistencia cobros (supuesto S2) ────────────────────────────────
  //   pctVentasContado + pctVentasCredito debe = 1.0 exacto
  const contado = Number(p.pctVentasContado ?? 0);
  const credito = Number(p.pctVentasCredito ?? 0);
  const suma    = Math.round((contado + credito) * 10000) / 10000;
  if (Math.abs(suma - 1.0) > 0.001) {
    errores.push(
      `❌ [R3] Cobros inconsistentes (supuesto S2):\n` +
      `   pctVentasContado (${contado}) + pctVentasCredito (${credito}) = ${suma} ≠ 1.0\n` +
      `   Los cobros del flujo de caja serán incorrectos.`
    );
  }

  return { ok: errores.length === 0, errores, advertencias, params: p };
}

module.exports = { validarYCompletarParams, DEFAULTS_CANON, CLAVES_RIESGO_ALTO };

// ── Modo standalone ──────────────────────────────────────────────────────────
if (require.main === module) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const { Pool } = require('pg');
  if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no definida.'); process.exit(1); }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
    connectionTimeoutMillis: 5000,
  });

  async function main() {
    const simIdFiltro = process.argv[2] || null;
    const query = simIdFiltro
      ? `SELECT id, nombre, parametros FROM simulaciones WHERE id = $1`
      : `SELECT id, nombre, parametros FROM simulaciones ORDER BY creada_at`;
    const params = simIdFiltro ? [simIdFiltro] : [];
    const sims = (await pool.query(query, params)).rows;
    if (!sims.length) { console.log('No se encontraron simulaciones.'); await pool.end(); return; }

    console.log('\n══════════════════════════════════════════');
    console.log('  VALIDACIÓN DE PARÁMETROS — SimNego v3.2');
    console.log('══════════════════════════════════════════\n');

    for (const s of sims) {
      const p = typeof s.parametros === 'string' ? JSON.parse(s.parametros) : (s.parametros || {});
      const resultado = validarYCompletarParams(p, {});
      console.log(`▶ ${s.nombre} (${s.id})`);
      if (resultado.ok && resultado.advertencias.length === 0) {
        console.log('  ✅ Sin problemas.\n');
      } else {
        resultado.errores.forEach(e => console.log('  ' + e));
        resultado.advertencias.slice(0, 5).forEach(a => console.log('  ' + a));
        if (resultado.advertencias.length > 5)
          console.log(`  ... y ${resultado.advertencias.length - 5} advertencias más.`);
        console.log(resultado.ok ? '  ⚠ Solo advertencias (no bloquea).\n' : '  ❌ Errores bloqueantes detectados.\n');
      }
    }
    await pool.end();
  }
  main().catch(async e => { console.error('❌', e.message); try { await pool.end(); } catch {} process.exit(1); });
}
