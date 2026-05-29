/**
 * qa_suite.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════
 * Suite de pruebas automáticas completa para presentación.
 * Cubre: motor de cálculo, BD, API endpoints, display, flujo completo.
 *
 * USO:
 *   node qa_suite.js              → todas las pruebas
 *   node qa_suite.js --rapido     → solo pruebas sin BD (offline)
 *   node qa_suite.js --api        → incluye pruebas HTTP contra producción
 *
 * CRITERIO DE ÉXITO PARA PRESENTACIÓN:
 *   ✅ Nivel 1 (Motor)       — obligatorio, sin BD
 *   ✅ Nivel 2 (BD)          — obligatorio, requiere DATABASE_URL
 *   ✅ Nivel 3 (API)         — recomendado, requiere servidor activo
 *   ✅ Nivel 4 (Archivos)    — integridad de archivos y funciones
 *   ✅ Nivel 5 (Parámetros)  — contratos de parámetros pedagógicos
 * ══════════════════════════════════════════════════════════════
 */
'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https   = require('https');
const http    = require('http');

const MODO_RAPIDO = process.argv.includes('--rapido');
const MODO_API    = process.argv.includes('--api');
const BASE_URL    = process.env.SIM_URL || 'https://simnego.onrender.com';

let passed = 0, failed = 0, skipped = 0;
const errores = [];

// ── Utilidades ─────────────────────────────────────────────────────────────
function ok(nombre)  { passed++;  console.log(`  ✅ ${nombre}`); }
function fail(nombre, detalle) {
  failed++;
  errores.push({ nombre, detalle });
  console.log(`  ❌ ${nombre}`);
  if (detalle) console.log(`     → ${detalle}`);
}
function skip(nombre, razon) { skipped++; console.log(`  ⏭  ${nombre} (${razon})`); }
function sec(titulo) { console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0,50-titulo.length))}`); }

function assert(cond, nombre, detalle) {
  if (cond) ok(nombre); else fail(nombre, detalle);
}

// ── HTTP helper ────────────────────────────────────────────────────────────
function get(url, headers = {}) {
  return new Promise((res, rej) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { res({ status: r.statusCode, body: JSON.parse(d) }); }
        catch { res({ status: r.statusCode, body: d }); }
      });
    });
    req.on('error', rej);
    req.setTimeout(15000, () => { req.destroy(); rej(new Error('timeout')); });
  });
}

function post(url, data, headers = {}) {
  return new Promise((res, rej) => {
    const body  = JSON.stringify(data);
    const urlObj = new URL(url);
    const mod   = url.startsWith('https') ? https : http;
    const opts  = {
      hostname: urlObj.hostname, port: urlObj.port || (url.startsWith('https')?443:80),
      path: urlObj.pathname + urlObj.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
    };
    const req = mod.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try { res({ status: r.statusCode, body: JSON.parse(d) }); }
        catch { res({ status: r.statusCode, body: d }); }
      });
    });
    req.on('error', rej);
    req.setTimeout(30000, () => { req.destroy(); rej(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════════════════
// NIVEL 1 — MOTOR DE CÁLCULO (sin BD, siempre corre)
// ══════════════════════════════════════════════════════════════════════════
async function nivel1_motor() {
  sec('NIVEL 1 · Motor de Cálculo (offline)');

  let engine;
  try {
    engine = require('./src/engine');
    ok('engine.js carga sin errores');
  } catch(e) {
    fail('engine.js carga sin errores', e.message);
    return;
  }

  assert(typeof engine.ejecutarSimulador === 'function',   'ejecutarSimulador exportado');
  assert(typeof engine.propagarEstado    === 'function',   'propagarEstado exportado');
  assert(typeof engine.calcularPreSimulacion === 'function', 'calcularPreSimulacion exportado');

  // Parámetros canónicos
  const P = {
    cajaInicial: 500000, activosFijosIniciales: 80000, depreciacionTrimestral: 2500,
    gastoAdminFijo: 55000, gastoFijoPlanta: 15000, costoOperario: 9600,
    operariosIniciales: 1, vendedoresIniciales: 0, pctMateriaPrima: 0.40,
    pctVentasContado: 0.70, pctVentasCredito: 0.30, tasaSobregiro: 0.055,
    tasaIVA: 0.13, tasaIT: 0.03, tasaIUE: 0.25, capacidadMaxProduccion: 1500,
    costoAlmacenamientoUnidad: 5, costoContratacionOperario: 2400, costoContratacionVendedor: 15000,
    costoDespidoOperario: 3600, costoDespidoVendedor: 15000, productividadBase: 440,
    capitalContable: 580000,
  };
  const TIPOS = { 'Calzado Test': { costoBase: 153, margenBase: 0.40 } };
  const CANALES = { 'Tienda Propia': { alcance: 0.8, costoFijo: 0 } };
  const SEGS = [{ id: 's1', nombre: 'Seg 1', demandaBase: 1000, sensibilidadPrecio: 0.5,
    factorCanal: { 'Tienda Propia': 1 }, factorCalidad: 1, demandaFormal: 900,
    tasaCrecimiento: 0.02, pctContrabando: 0.1 }];

  function dec(overrides = {}) {
    return {
      equipo: 'eq_t1', equipoOriginal: 'eq_t1', equipoNombre: 'TEST',
      productoId: 'prod_1', rondaNumero: 1, submitted: true,
      cajaInicial: 500000, activosFijosIniciales: 80000,
      cxcInicial: 0, deudaInicial: 0, inventarioInicial: 0,
      vendedoresIniciales: 0, operariosIniciales: 1,
      brandEquityInicial: 50, resultadoAcumuladoAnterior: 0,
      ivaAPagarAnterior: 0, ivaSaldoAFavorAnterior: 0, saldoIUEcompensable: 0,
      stockMPInicial: 0, pedidosPendientes: [],
      producto: 'Calzado Test', segmentoObjetivo: 'Seg 1', canalPrincipal: 'Tienda Propia',
      calidad: 6, precioVenta: 200, produccion: 300, publicidad: 5000,
      promocion: 0, eventos: 0, marketingRedes: 0, relacionesPublicas: 0,
      contratarVendedores: 0, despedirVendedores: 0,
      contratarOperarios: 0, despedirOperarios: 0, montoCapacitacion: 0,
      innovacion: false, montoInnovacion: 0, tipoInnovacion: 'Producto',
      tipoPrestamo: 'Ninguno', montoPrestamo: 0, plazoPrestamo: 2, amortizacion: 0,
      tipoInvestigacion: 'No', montoInvestigacion: 0,
      proveedorElegido: '', cantidadMPpedida: 0,
      productos: [{
        productoId:'prod_1', activo:true, producto:'Calzado Test',
        segmentoObjetivo:'Seg 1', canalPrincipal:'Tienda Propia',
        calidad:6, precioVenta:200, produccion:300, publicidad:5000,
        cajaInicial:500000, activosFijosIniciales:80000,
        operariosIniciales:1, vendedoresIniciales:0, inventarioInicial:0,
        resultadoAcumuladoAnterior:0, ivaAPagarAnterior:0, ivaSaldoAFavorAnterior:0,
        contratarOperarios:0, despedirOperarios:0,
      }],
      ...overrides,
    };
  }

  const cfg = {
    params: P, tiposProducto: TIPOS, canales: CANALES, segmentos: SEGS,
    afinidadMatrix: {}, competenciaExterna: [], demandaBaseAnteriorMap: {},
    rondaNumero: 1, proveedores: [],
    shock: { tipo: 'neutral', magnitud: 0, descripcion: 'sin shock' },
    equipos: [{ id: 'eq_t1', nombre: 'TEST' }],
  };

  // T1: Cuadre contable básico
  try {
    const r = engine.ejecutarSimulador([dec()], cfg);
    const res = r.resultados[0];
    const A   = res.totalActivos  || 0;
    const P2  = res.totalPasivos  || 0;
    const Pat = res.patrimonio    || 0;
    const delta = Math.abs(A - (P2 + Pat));
    assert(delta < 1, `T1 · Cuadre A=P+Pat (Δ=${delta.toFixed(2)} Bs)`);
    assert(A >= 0 && typeof A === 'number', `T1 · totalActivos es número válido (${A})`);
    assert(typeof res.cajaFinal === 'number', 'T1 · cajaFinal es número');
    assert(typeof res.utilidadNeta === 'number', 'T1 · utilidadNeta es número');
  } catch(e) { fail('T1 · Ejecución motor básico', e.message); }

  // T2: Cero ventas (precio alto) → inventario acumulado
  try {
    const r = engine.ejecutarSimulador([dec({ precioVenta: 9999, produccion: 200 })], cfg);
    const res = r.resultados[0];
    const delta = Math.abs((res.totalActivos||0) - ((res.totalPasivos||0)+(res.patrimonio||0)));
    assert(delta < 1, `T2 · Cuadre con cero ventas (Δ=${delta.toFixed(2)} Bs)`);
    assert((res.invFinalValorizado||0) > 0, 'T2 · Inventario acumulado cuando no hay ventas');
  } catch(e) { fail('T2 · Cero ventas', e.message); }

  // T3: Sobregiro → caja negativa, deuda generada
  try {
    const r = engine.ejecutarSimulador([dec({ cajaInicial: 50000, contratarOperarios: 5, produccion: 300 })], cfg);
    const res = r.resultados[0];
    const delta = Math.abs((res.totalActivos||0) - ((res.totalPasivos||0)+(res.patrimonio||0)));
    assert(delta < 1, `T3 · Cuadre con sobregiro (Δ=${delta.toFixed(2)} Bs)`);
    assert((res.cajaFinal||0) >= 0, 'T3 · Caja final ≥ 0 (sobregiro crea deuda, no caja negativa)');
  } catch(e) { fail('T3 · Sobregiro', e.message); }

  // T4: 6 equipos simultáneos (escenario real COM540)
  try {
    const equipos6 = ['A','B','C','D','E','F'].map((n,i) => ({ id:`eq_${n}`, nombre:n }));
    const decs6 = equipos6.map((e,i) => dec({
      equipo: e.id, equipoOriginal: e.id, equipoNombre: e.nombre,
      precioVenta: 170 + i*10, produccion: 250 + i*20,
      productos: [{ productoId:'prod_1', activo:true, producto:'Calzado Test',
        segmentoObjetivo:'Seg 1', canalPrincipal:'Tienda Propia',
        calidad:6, precioVenta:170+i*10, produccion:250+i*20, publicidad:5000,
        cajaInicial:500000, activosFijosIniciales:80000,
        operariosIniciales:1, vendedoresIniciales:0, inventarioInicial:0,
        resultadoAcumuladoAnterior:0, ivaAPagarAnterior:0, ivaSaldoAFavorAnterior:0,
        contratarOperarios:0, despedirOperarios:0 }],
    }));
    const cfg6 = { ...cfg, equipos: equipos6 };
    const r = engine.ejecutarSimulador(decs6, cfg6);
    assert(r.resultados.length === 6, `T4 · 6 equipos procesados (${r.resultados.length})`);
    let cuadran = 0;
    r.resultados.forEach(res => {
      const d = Math.abs((res.totalActivos||0)-((res.totalPasivos||0)+(res.patrimonio||0)));
      if (d < 1) cuadran++;
    });
    assert(cuadran === 6, `T4 · 6/6 equipos cuadran (cuadraron: ${cuadran})`);
  } catch(e) { fail('T4 · 6 equipos simultáneos', e.message); }

  // T5: R2 — continuidad financiera
  try {
    const r1 = engine.ejecutarSimulador([dec()], cfg).resultados[0];
    const decR2 = dec({
      rondaNumero: 2,
      cajaInicial: r1.cajaFinal || 0,
      cxcInicial: r1.cxcFinal || 0,
      deudaInicial: r1.deudaFinal || 0,
      activosFijosIniciales: r1.afNetos || 0,
      inventarioInicial: r1.inventarioFinal || 0,
      resultadoAcumuladoAnterior: r1.resultadoAcumulado || 0,
      ivaAPagarAnterior: r1.ivaAPagar || 0,
      ivaSaldoAFavorAnterior: r1.ivaSaldoAFavor || 0,
    });
    const r2 = engine.ejecutarSimulador([decR2], { ...cfg, rondaNumero: 2 }).resultados[0];
    const delta = Math.abs((r2.totalActivos||0)-((r2.totalPasivos||0)+(r2.patrimonio||0)));
    assert(delta < 1, `T5 · Cuadre R2 con continuidad financiera (Δ=${delta.toFixed(2)} Bs)`);
  } catch(e) { fail('T5 · R2 continuidad financiera', e.message); }
}

// ══════════════════════════════════════════════════════════════════════════
// NIVEL 2 — BASE DE DATOS (requiere DATABASE_URL)
// ══════════════════════════════════════════════════════════════════════════
async function nivel2_bd() {
  sec('NIVEL 2 · Base de Datos');

  if (!process.env.DATABASE_URL) { skip('Nivel 2 completo', 'DATABASE_URL no definida'); return; }

  let pool, storage;
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
      connectionTimeoutMillis: 10000,
    });
    storage = require('./src/storage');
    ok('Conexión BD inicializada');
  } catch(e) { fail('Conexión BD', e.message); return; }

  try {
    // B1: Conexión real
    const r = await pool.query('SELECT 1 AS ping');
    assert(r.rows[0]?.ping === 1, 'B1 · Ping a PostgreSQL');

    // B2: Tabla simulaciones existe
    const sims = await pool.query(`SELECT COUNT(*) AS n FROM simulaciones`);
    const nSims = parseInt(sims.rows[0]?.n || 0);
    assert(nSims > 0, `B2 · Simulaciones en BD (${nSims} encontradas)`);

    // B3: Tabla sim_rondas existe
    const rondas = await pool.query(`SELECT COUNT(*) AS n FROM sim_rondas`);
    const nRondas = parseInt(rondas.rows[0]?.n || 0);
    assert(nRondas >= 0, `B3 · Tabla sim_rondas accesible (${nRondas} rondas)`);

    // B4: Tabla sim_decisiones existe
    const decs = await pool.query(`SELECT COUNT(*) AS n FROM sim_decisiones`);
    assert(parseInt(decs.rows[0]?.n || 0) >= 0, 'B4 · Tabla sim_decisiones accesible');

    // B5: storage.getSimulacion funciona
    const simRow = await pool.query(`SELECT id FROM simulaciones ORDER BY creada_at DESC LIMIT 1`);
    if (simRow.rows.length > 0) {
      const sim = await storage.getSimulacion(simRow.rows[0].id);
      assert(!!sim, 'B5 · storage.getSimulacion retorna datos');
      assert(!!sim?.parametros, 'B6 · Sim tiene parámetros');
      assert(Array.isArray(sim?.users) || typeof sim?.users === 'object', 'B7 · Sim tiene users');
    }

    // B8: Cuadre en BD — verificar resultados guardados
    const rondasConRes = await pool.query(
      `SELECT numero, resultados FROM sim_rondas WHERE resultados IS NOT NULL ORDER BY numero LIMIT 3`
    );
    let cuadresBD = 0, totalBD = 0;
    for (const row of rondasConRes.rows) {
      const resObj = row.resultados?.resultados || row.resultados || {};
      for (const r of Object.values(resObj)) {
        const A   = r.totalActivos  || 0;
        const P2  = r.totalPasivos  || (r.deudaFinal||0)+(r.ivaAPagar||0);
        const Pat = r.patrimonio    || 0;
        if (Math.abs(A-(P2+Pat)) < 2) cuadresBD++; else totalBD++;
        totalBD++;
      }
    }
    if (totalBD > 0) {
      assert(cuadresBD === totalBD, `B8 · Cuadre en BD: ${cuadresBD}/${totalBD} registros A=P+Pat`);
    } else {
      skip('B8 · Cuadre en BD', 'sin resultados guardados aún');
    }

  } catch(e) {
    fail('Nivel 2 BD', e.message);
  } finally {
    try { await pool.end(); } catch {}
  }
}

// ══════════════════════════════════════════════════════════════════════════
// NIVEL 3 — API HTTP (requiere --api y servidor activo)
// ══════════════════════════════════════════════════════════════════════════
async function nivel3_api() {
  sec('NIVEL 3 · API HTTP');

  if (!MODO_API) { skip('Nivel 3 completo', 'pasar --api para activar'); return; }

  // A1: Servidor responde
  try {
    const r = await get(`${BASE_URL}/health`);
    assert(r.status === 200 || r.status === 404, `A1 · Servidor responde en ${BASE_URL} (status=${r.status})`);
  } catch(e) { fail('A1 · Servidor accesible', e.message); return; }

  // A2: Login admin
  let cookie = '';
  try {
    const r = await post(`${BASE_URL}/auth/login`, { username:'admin', password:'admin123' });
    assert(r.status === 200, `A2 · Login admin (status=${r.status})`);
    if (r.status === 200) ok('A2b · Credenciales admin válidas');
    else fail('A2b · Credenciales admin válidas', JSON.stringify(r.body));
  } catch(e) { fail('A2 · Login admin', e.message); }

  // A3: GET simulaciones
  try {
    const r = await get(`${BASE_URL}/admin/simulaciones`, cookie ? { Cookie: cookie } : {});
    assert(r.status === 200 || r.status === 401, `A3 · GET /admin/simulaciones (status=${r.status})`);
  } catch(e) { fail('A3 · GET simulaciones', e.message); }
}

// ══════════════════════════════════════════════════════════════════════════
// NIVEL 4 — INTEGRIDAD DE ARCHIVOS
// ══════════════════════════════════════════════════════════════════════════
async function nivel4_archivos() {
  sec('NIVEL 4 · Integridad de archivos');

  const fs = require('fs');
  const archivos = [
    ['server.js',              'Servidor principal'],
    ['src/engine.js',          'Motor de cálculo'],
    ['src/storage.js',         'Acceso BD'],
    ['src/reports.js',         'Reportes de mercado'],
    ['public/app.js',          'Frontend SPA'],
    ['public/index.html',      'Shell HTML'],
    ['public/styles.css',      'Estilos'],
    ['test_cuadre.js',         'Suite test motor'],
    ['scripts/validacion/validar_sim_realista.js','Validación canónica'],
  ];

  for (const [archivo, desc] of archivos) {
    const existe = fs.existsSync(archivo);
    assert(existe, `F · ${desc} (${archivo})`);
    if (existe) {
      const size = fs.statSync(archivo).size;
      assert(size > 100, `F · ${archivo} no está vacío (${(size/1024).toFixed(1)} KB)`);
    }
  }

  // Verificar que engine.js tiene las funciones clave
  if (fs.existsSync('src/engine.js')) {
    const contenido = fs.readFileSync('src/engine.js', 'utf8');
    assert(contenido.includes('ejecutarSimulador'),     'F · engine.js tiene ejecutarSimulador');
    assert(contenido.includes('patrimonio'),            'F · engine.js tiene patrimonio derivado');
    assert(contenido.includes('totalActivos'),          'F · engine.js calcula totalActivos');
    assert(!contenido.includes('resObj[keyPrevProd]'),  'F · engine.js sin bug duplicación inventario');
  }

  // Verificar que server.js tiene sanitizarDecision
  if (fs.existsSync('server.js')) {
    const contenido = fs.readFileSync('server.js', 'utf8');
    assert(contenido.includes('sanitizarDecision'), 'F · server.js tiene sanitizarDecision');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// NIVEL 5 — CONTRATOS DE PARÁMETROS
// Verifica que parámetros críticos existen en panel, motor y engine.
// Cada parámetro tiene un "contrato" que debe cumplirse en 3 lugares:
//   (a) definido en app.js panel de parámetros
//   (b) consumido en engine.js
//   (c) sin hardcodes prohibidos
// ══════════════════════════════════════════════════════════════════════════
async function nivel5_contratos() {
  sec('NIVEL 5 · Contratos de Parámetros');
  const fs = require('fs');

  if (!fs.existsSync('public/app.js') || !fs.existsSync('src/engine.js') || !fs.existsSync('server.js')) {
    skip('Nivel 5 completo', 'archivos no encontrados'); return;
  }

  const app    = fs.readFileSync('public/app.js',   'utf8');
  const engine = fs.readFileSync('src/engine.js',   'utf8');
  const server = fs.readFileSync('server.js',        'utf8');

  // ── P1-P6: Parámetros pedagógicos críticos ────────────────────────────────
  // Cada parámetro debe estar en el panel (app.js) Y consumido en el motor (engine.js)

  const parametros = [
    {
      id: 'P1', nombre: 'pctCostoCalidad en panel Operarios y Producción',
      checks: [
        { archivo: 'app.js',    contiene: 'pctCostoCalidad',              descripcion: 'campo en panel' },
        { archivo: 'app.js',    contiene: 'Operarios y Producción',        descripcion: 'sección correcta' },
        { archivo: 'engine.js', contiene: 'pctCostoCalidad',              descripcion: 'consumido en motor' },
      ]
    },
    {
      id: 'P2', nombre: 'pctMateriaPrima en panel y motor',
      checks: [
        { archivo: 'app.js',    contiene: 'pctMateriaPrima',              descripcion: 'campo en panel' },
        { archivo: 'engine.js', contiene: 'pctMateriaPrima',              descripcion: 'consumido en motor' },
      ]
    },
    {
      id: 'P3', nombre: 'vendedoresIniciales lee params (no hardcode 2)',
      checks: [
        { archivo: 'engine.js', contiene: 'vendedoresIniciales ?? params',      descripcion: 'lee params' },
        { archivo: 'engine.js', noContiene: 'vendedoresIniciales||2',            descripcion: 'sin hardcode vendedores||2' },
        { archivo: 'engine.js', noContiene: 'vendedoresIniciales || 2',          descripcion: 'sin hardcode vendedores || 2' },
      ]
    },
    {
      id: 'P4', nombre: 'operariosIniciales lee params (no hardcode 4)',
      checks: [
        { archivo: 'engine.js', contiene: 'operariosIniciales  ?? params',  descripcion: 'lee params' },
        { archivo: 'engine.js', noContiene: '|| 4',                         descripcion: 'sin hardcode ||4' },
      ]
    },
    {
      id: 'P5', nombre: 'capitalContable no editable en panel',
      checks: [
        { archivo: 'app.js', noContiene: "pf('Capital contable",            descripcion: 'no editable' },
        { archivo: 'app.js', noContiene: "pf('capitalContable",             descripcion: 'no editable (camelCase)' },
      ]
    },
    {
      id: 'P6', nombre: 'sanitizarDecision activo en recálculo',
      checks: [
        { archivo: 'server.js', contiene: 'sanitizarDecision',              descripcion: 'función definida' },
        { archivo: 'server.js', contiene: 'sanitizarDecision(decOrigRaw)',   descripcion: 'llamada en recálculo' },
      ]
    },
    {
      id: 'P7', nombre: 'ebit = TRUE EBIT (antes gastos financieros)',
      checks: [
        { archivo: 'engine.js', contiene: 'ebit:         roundBs(utilidadBruta - gastosOp)', descripcion: 'TRUE EBIT' },
        { archivo: 'engine.js', noContiene: 'ebit:         roundBs(utilidadNeta_operat)',    descripcion: 'sin EBT como EBIT' },
      ]
    },
    {
      id: 'P8', nombre: 'totalFacturado = ventasBrutas + ivaDebito (consistente)',
      checks: [
        { archivo: 'server.js', contiene: 'ventasBrutas||0) + (porEmpresa[eqId].ivaDebito||0)', descripcion: 'recalculado en consolidación' },
        { archivo: 'app.js',    contiene: '(r.ventasBrutas||0)+(r.ivaDebito||0)',               descripcion: 'display ER admin' },
      ]
    },
    {
      id: 'P9', nombre: 'patrimonio derivado (A − P) en motor',
      checks: [
        { archivo: 'engine.js', contiene: 'totalActivos - totalPasivos',    descripcion: 'patrimonio derivado' },
        { archivo: 'engine.js', noContiene: 'patrimonio = capitalContable', descripcion: 'no usa capitalContable directo' },
      ]
    },
    {
      id: 'P10', nombre: 'calidad con clamp JS en hoja decisiones',
      checks: [
        { archivo: 'app.js', contiene: 'LIMITES_CAMPO',                    descripcion: 'tabla de límites' },
        { archivo: 'app.js', contiene: "calidad:             { min:1,  max:10  }", descripcion: 'calidad max 10' },
      ]
    },
  ];

  const contenidos = { 'app.js': app, 'engine.js': engine, 'server.js': server };

  for (const param of parametros) {
    let todosOk = true;
    const fallos = [];
    for (const check of param.checks) {
      const contenido = contenidos[check.archivo];
      if (check.contiene) {
        if (!contenido.includes(check.contiene)) {
          todosOk = false;
          fallos.push(`${check.archivo}: falta "${check.contiene.slice(0,50)}" (${check.descripcion})`);
        }
      }
      if (check.noContiene) {
        if (contenido.includes(check.noContiene)) {
          todosOk = false;
          fallos.push(`${check.archivo}: tiene hardcode prohibido "${check.noContiene}" (${check.descripcion})`);
        }
      }
    }
    if (todosOk) {
      ok(`${param.id} · ${param.nombre}`);
    } else {
      fail(`${param.id} · ${param.nombre}`, fallos.join(' | '));
    }
  }
}


async function main() {
  const inicio = Date.now();
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  QA SUITE — SimNego v3.2 — Pre-Presentación             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (MODO_RAPIDO) console.log('  MODO: Rápido (sin BD)');
  if (MODO_API)    console.log('  MODO: Con pruebas HTTP');
  console.log(`  URL: ${BASE_URL}`);

  await nivel4_archivos();
  await nivel5_contratos();
  await nivel1_motor();
  if (!MODO_RAPIDO) await nivel2_bd();
  if (MODO_API)     await nivel3_api();

  const duracion = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  const total = passed + failed + skipped;
  if (failed === 0) {
    console.log(`║  ✅ LISTO PARA PRESENTACIÓN                              ║`);
  } else {
    console.log(`║  ❌ ATENCIÓN — ${failed} PRUEBA(S) FALLARON                       ║`);
  }
  console.log(`║  ${passed} pasaron · ${failed} fallaron · ${skipped} omitidas · ${duracion}s          ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (errores.length > 0) {
    console.log('\n── Detalle de fallos ──────────────────────────────────────');
    errores.forEach(e => console.log(`  ❌ ${e.nombre}\n     ${e.detalle}`));
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Error fatal:', e.message); process.exit(1); });
