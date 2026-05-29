/**
 * crear_sim_ABC.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════
 * Crea la simulación "ABC" con:
 *   - 10 equipos: A, B, C, D, E, F, G, H, I, J
 *   - Industria: Calzados_COM540_1_2026
 *   - 5 productos por equipo
 *   - 20 rondas
 *   - Contraseña equipos: 1234
 *   - Código de acceso: ABC-2026
 *
 * USO:
 *   node crear_sim_ABC.js              → crea la simulación
 *   node crear_sim_ABC.js --borrar-test → borra sim TEST primero
 * ══════════════════════════════════════════════════════════════
 */
'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const crypto   = require('crypto');

if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no definida'); process.exit(1); }

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});

const BORRAR_TEST = process.argv.includes('--borrar-test');

// ── Helpers ────────────────────────────────────────────────────────────────
const uid  = (pfx = '') => pfx + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// PBKDF2 — misma implementación que src/auth.js
const hash = (pwd) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const h    = crypto.pbkdf2Sync(pwd, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${h}`;
};

// ── Configuración de la simulación ABC ────────────────────────────────────
const SIM_ID       = uid('sim');
const NOMBRE       = 'ABC';
const DESCRIPCION  = 'Simulación ABC — 10 Equipos × 5 Productos × 20 Rondas';
const CODIGO_ACC   = 'ABC-2026';
const PWD_EQUIPOS  = '1234';
const TOTAL_RONDAS = 20;

const NOMBRES_EQUIPOS = ['A','B','C','D','E','F','G','H','I','J'];

// ── Parámetros industria Calzados_COM540_1_2026 ───────────────────────────
const PARAMETROS = {
  moneda: 'Bs', tasaIT: 0.03, tasaIUE: 0.25, tasaIVA: 0.13,
  coefPrecio: -0.005, cxcInicial: 0, plazoCobro: 2,
  cajaInicial: 500000, lambdaLogit: 1, periodosIUE: 4,
  deudaInicial: 0, modeloCostos: 'mixto',
  costoOperario: 9600, tasaSobregiro: 0.055,
  gastoAdminFijo: 55000, modulos_modIVA: 1,
  gastoFijoPlanta: 45000, pctMateriaPrima: 0.4,
  tasaDecaimiento: 0.05, pctVentasContado: 0.8, pctVentasCredito: 0.2,
  productividadBase: 500, trimestresPorAnio: 4,
  factorCapacitacion: 0.05, operariosIniciales: 1,
  unidadesMPporUnidad: 1, vendedoresIniciales: 0,
  costoDespidoOperario: 5000, costoDespidoVendedor: 9000,
  factorCanibalizacion: 0.15, modulos_modImpuestos: 1,
  modulos_modOperarios: 1, activosFijosIniciales: 80000,
  costoAlmacenamientoMP: 0.05, inventarioInicialUnid: 0,
  modulos_modDemandaDin: 1, modulos_modInnovacion: 1,
  tasaPrestamoInversion: 0.025, tasaPrestamoOperativo: 0.035,
  capacidadMaxProduccion: 1500, depreciacionTrimestral: 2500,
  modulos_modBrandEquity: 1, plazoPrestamoInversion: 40,
  plazoPrestamoOperativo: 20, factorInnovacionProceso: 0.25,
  modulos_modMateriaPrima: 1, comisionAperturaPrestamo: 0.015,
  costoInvestigacionBasica: 5000, factorInnovacionProducto: 0.25,
  modulos_modInvestigacion: 1, sueldoTrimestralVendedor: 15000,
  costoAlmacenamientoUnidad: 5, costoContratacionOperario: 3000,
  costoContratacionVendedor: 6000, costoInvestigacionPremium: 10000,
  modulos_modCanibalizacion: 1, costoInvestigacionEstrategico: 15000,
};

// ── 5 Tipos de producto (uno por "línea" de decisión) ─────────────────────
const TIPOS_PRODUCTO = {
  'Calzado Sensorial TEA':      { costoBase: 120,   nombre: 'Calzado Sensorial TEA',      margenBase: 0.45, descripcion: 'Calzado especializado para personas con TEA' },
  'Sneaker Cultural Premium':   { costoBase: 298,   nombre: 'Sneaker Cultural Premium',   margenBase: 0.55, descripcion: 'Calzado cultural de alta gama' },
  'Calzado Biomecánico Formal': { costoBase: 153,   nombre: 'Calzado Biomecánico Formal', margenBase: 0.50, descripcion: 'Calzado ortopédico formal' },
  'Calzado Ortopédico Laboral': { costoBase: 136,   nombre: 'Calzado Ortopédico Laboral', margenBase: 0.48, descripcion: 'Calzado de seguridad ortopédico' },
  'Sandalia Infantil Ajustable':{ costoBase:  79,   nombre: 'Sandalia Infantil Ajustable',margenBase: 0.42, descripcion: 'Sandalia ergonómica para niños' },
};

// ── Canales de distribución ───────────────────────────────────────────────
const CANALES = {
  'Tienda Propia':             { costoAdicionalUnitario: 8,  comisionPct: 0.00, factorImpactoVendedores: 1.3, bonoAtractivo: 1.0 },
  'Venta Digital':             { costoAdicionalUnitario: 5,  comisionPct: 0.03, factorImpactoVendedores: 0.7, bonoAtractivo: 1.1 },
  'Ferias y Eventos':          { costoAdicionalUnitario: 12, comisionPct: 0.00, factorImpactoVendedores: 1.0, bonoAtractivo: 0.9 },
  'Distribuidores B2B':        { costoAdicionalUnitario: 4,  comisionPct: 0.08, factorImpactoVendedores: 0.8, bonoAtractivo: 0.85 },
  'Convenios Institucionales': { costoAdicionalUnitario: 3,  comisionPct: 0.05, factorImpactoVendedores: 0.6, bonoAtractivo: 1.2 },
};

// ── Segmentos de mercado ──────────────────────────────────────────────────
const SEGMENTOS = [
  { nombre: 'Padres y familias con niños (0-10 años)',   demandaBase: 7000, sensibilidadPrecio: 0.5, tasaCrecimiento: 0.03, pctContrabando: 0.08, tendencia: 'Creciente', descripcion: 'Familias con hijos pequeños que buscan calzado funcional y seguro.' },
  { nombre: 'Personas con condición postural',            demandaBase: 5500, sensibilidadPrecio: 0.3, tasaCrecimiento: 0.04, pctContrabando: 0.05, tendencia: 'Creciente', descripcion: 'Personas con problemas posturales que requieren soporte especializado.' },
  { nombre: 'Personas con fascitis y dolor plantar',      demandaBase: 3000, sensibilidadPrecio: 0.3, tasaCrecimiento: 0.05, pctContrabando: 0.04, tendencia: 'Creciente', descripcion: 'Pacientes con dolor plantar crónico que buscan alivio.' },
  { nombre: 'Comerciantes y trabajadores de mercado',     demandaBase: 8000, sensibilidadPrecio: 0.7, tasaCrecimiento: 0.02, pctContrabando: 0.15, tendencia: 'Estable',   descripcion: 'Trabajadores de pie muchas horas que necesitan durabilidad.' },
  { nombre: 'Jóvenes urbanos / lifestyle boliviano',      demandaBase: 4500, sensibilidadPrecio: 0.6, tasaCrecimiento: 0.06, pctContrabando: 0.12, tendencia: 'Creciente', descripcion: 'Jóvenes urbanos que buscan tendencia y confort.' },
  { nombre: 'Personal de salud y bienestar',              demandaBase: 5000, sensibilidadPrecio: 0.2, tasaCrecimiento: 0.04, pctContrabando: 0.03, tendencia: 'Creciente', descripcion: 'Profesionales de salud que usan calzado especializado en jornadas largas.' },
];

// ── Competencia externa ───────────────────────────────────────────────────
const COMPETENCIA_EXTERNA = [
  { nombre: 'Importados China',    precioRef: 85,  calidad: 3, share: 0.12, canal: 'Distribuidores B2B' },
  { nombre: 'Marca Nacional X',    precioRef: 150, calidad: 5, share: 0.08, canal: 'Tienda Propia' },
  { nombre: 'Contrabando Frontera',precioRef: 60,  calidad: 2, share: 0.10, canal: 'Distribuidores B2B' },
];

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  CREAR SIMULACIÓN ABC — SimNego v3.2                    ║');
  console.log(`║  ${NOMBRE} · ${TOTAL_RONDAS} rondas · ${NOMBRES_EQUIPOS.length} equipos · 5 productos      ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Opcional: borrar sim TEST ──────────────────────────────────────────
  if (BORRAR_TEST) {
    const tests = await pool.query(`SELECT id,nombre FROM simulaciones WHERE nombre='TEST'`);
    for (const t of tests.rows) {
      await pool.query(`DELETE FROM sim_rondas    WHERE simulacion_id=$1`, [t.id]);
      await pool.query(`DELETE FROM sim_decisiones WHERE simulacion_id=$1`, [t.id]);
      await pool.query(`DELETE FROM simulaciones   WHERE id=$1`, [t.id]);
      console.log(`  🗑 Simulación TEST (${t.id}) eliminada`);
    }
  }

  // ── Borrar ABC existente si se pide recrear ────────────────────────────
  const RECREAR = process.argv.includes('--recrear') || BORRAR_TEST;
  if (RECREAR) {
    const viejas = await pool.query(`SELECT id FROM simulaciones WHERE nombre=$1`, [NOMBRE]);
    for (const v of viejas.rows) {
      await pool.query(`DELETE FROM sim_rondas     WHERE simulacion_id=$1`, [v.id]);
      await pool.query(`DELETE FROM sim_decisiones WHERE simulacion_id=$1`, [v.id]);
      await pool.query(`DELETE FROM simulaciones    WHERE id=$1`, [v.id]);
      console.log(`  🗑 Simulación ${NOMBRE} anterior (${v.id}) eliminada`);
    }
  }

  // ── Verificar que ABC no exista ────────────────────────────────────────
  const existe = await pool.query(`SELECT id FROM simulaciones WHERE nombre=$1`, [NOMBRE]);
  if (existe.rows.length) {
    console.log(`  ⚠️  Ya existe una simulación llamada "${NOMBRE}" (${existe.rows[0].id})`);
    console.log('  Si deseas reemplazarla, bórrala desde el panel o corre:');
    console.log(`  node crear_sim_ABC.js --borrar-test  (o bórrala manualmente)\n`);
    await pool.end(); return;
  }

  // ── Obtener owner (primer admin/profesor) ──────────────────────────────
  const admins = await pool.query(`SELECT id FROM usuarios WHERE rol IN ('admin','profesor') LIMIT 1`);
  if (!admins.rows.length) { console.error('❌ No hay usuarios admin/profesor'); await pool.end(); return; }
  const ownerId = admins.rows[0].id;

  // ── Construir 10 equipos ───────────────────────────────────────────────
  const equipos = NOMBRES_EQUIPOS.map(nombre => ({
    id:             uid(`eq_${NOMBRE.toLowerCase()}_${nombre.toLowerCase()}`),
    nombre,
    rol:            'equipo',
    password_plain: PWD_EQUIPOS,
    password:       hash(PWD_EQUIPOS),    // campo que lee server.js: found.equipo.password
    password_hash:  hash(PWD_EQUIPOS),    // campo alternativo para compatibilidad
    codigoAcceso:   CODIGO_ACC,
    integrantes:    [],
    capitalInicial: PARAMETROS.cajaInicial + PARAMETROS.activosFijosIniciales,
  }));

  // ── Crear simulación ───────────────────────────────────────────────────
  await pool.query(
    `INSERT INTO simulaciones (
       id, owner_id, nombre, descripcion, codigo_acceso, estado, creada_at,
       config, parametros, tipos_producto, canales, segmentos,
       afinidad_matrix, competencia_externa, rondas, users
     ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      SIM_ID, ownerId, NOMBRE, DESCRIPCION, CODIGO_ACC, 'activa',
      JSON.stringify({
        industria:    'Calzados_COM540_1_2026',
        roundState:   'pending',
        totalRounds:  TOTAL_RONDAS,
        currentRound: 1,
        multiproducto: true,
        productosMaxPorEquipo: 5,
      }),
      JSON.stringify(PARAMETROS),
      JSON.stringify(TIPOS_PRODUCTO),
      JSON.stringify(CANALES),
      JSON.stringify(SEGMENTOS),
      JSON.stringify({}),                    // afinidad_matrix
      JSON.stringify(COMPETENCIA_EXTERNA),
      JSON.stringify({}),                    // rondas legacy
      JSON.stringify(equipos),               // users
    ]
  );
  console.log(`  ✅ Simulación creada: ${NOMBRE} (${SIM_ID})`);

  // ── Verificar ──────────────────────────────────────────────────────────
  console.log(`\n  Código de acceso: ${CODIGO_ACC}`);
  console.log(`  Contraseña equipos: ${PWD_EQUIPOS}`);
  console.log(`  Rondas: ${TOTAL_RONDAS}`);
  console.log(`  Productos por equipo: 5`);
  console.log('\n  Equipos creados:');
  equipos.forEach(e => console.log(`    ${e.nombre.padEnd(3)} → ID: ${e.id}`));

  console.log('\n  Próximos pasos:');
  console.log('  1. Panel profesor → 🎮 Simulaciones → seleccionar ABC');
  console.log('  2. Panel → 🔄 Rondas → ▶ Activar hoja R1');
  console.log('  3. Equipos ingresan con código: ' + CODIGO_ACC + ' · contraseña: ' + PWD_EQUIPOS);
  console.log('\n  Para poblar y simular las 20 rondas automáticamente:');
  console.log('  node simular_12_rondas.js   (ajustar totalRondas a 20)\n');

  await pool.end();
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
