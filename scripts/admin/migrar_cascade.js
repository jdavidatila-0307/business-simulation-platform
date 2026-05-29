/**
 * migrar_cascade.js — SimNego v3.2
 * Hace que sim_rondas.simulacion_id y sim_decisiones.simulacion_id referencien
 * simulaciones(id) con ON DELETE CASCADE. Introspecta las FK existentes y las
 * reemplaza; si no existen, las crea. Idempotente.
 *
 * REQUISITO: 0 huérfanos antes de correr (la FK no se valida si hay filas
 * que la violan). El script lo verifica y aborta si encuentra huérfanos.
 *
 * SEGURIDAD: dry-run por defecto. Para aplicar: --aplicar
 *
 * Uso:
 *   node migrar_cascade.js            (muestra qué haría)
 *   node migrar_cascade.js --aplicar  (aplica los ALTER TABLE)
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');

const APLICAR = process.argv.includes('--aplicar');
if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no está definida.'); process.exit(1); }
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 5000,
});

const OBJETIVOS = [
  { tabla: 'sim_rondas',     col: 'simulacion_id', fk: 'sim_rondas_simulacion_id_fkey' },
  { tabla: 'sim_decisiones', col: 'simulacion_id', fk: 'sim_decisiones_simulacion_id_fkey' },
];

async function fkExistentes(tabla) {
  // FKs de `tabla` que apuntan a `simulaciones`, con su acción ON DELETE
  const res = await pool.query(
    `SELECT con.conname, con.confdeltype
       FROM pg_constraint con
       JOIN pg_class rel  ON rel.oid  = con.conrelid
       JOIN pg_class frel ON frel.oid = con.confrelid
      WHERE con.contype='f' AND rel.relname=$1 AND frel.relname='simulaciones'`,
    [tabla]
  );
  // confdeltype: 'a'=no action, 'r'=restrict, 'c'=cascade, 'n'=set null, 'd'=set default
  return res.rows;
}

async function huerfanos() {
  const r = (await pool.query(`SELECT COUNT(*)::int n FROM sim_rondas     WHERE simulacion_id NOT IN (SELECT id FROM simulaciones)`)).rows[0].n;
  const d = (await pool.query(`SELECT COUNT(*)::int n FROM sim_decisiones WHERE simulacion_id NOT IN (SELECT id FROM simulaciones)`)).rows[0].n;
  return { r, d };
}

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  MIGRACIÓN: ON DELETE CASCADE — SimNego');
  console.log('══════════════════════════════════════════\n');

  const { r, d } = await huerfanos();
  if (r > 0 || d > 0) {
    console.error(`  ❌ Hay huérfanos (${r} rondas, ${d} decisiones). Corre primero:`);
    console.error('     node limpiar_huerfanos.js --confirmar\n');
    await pool.end(); process.exit(1);
  }
  console.log('  ✅ Sin huérfanos. Estado apto para crear las FK.\n');

  const plan = [];
  for (const o of OBJETIVOS) {
    const existentes = await fkExistentes(o.tabla);
    const yaCascade = existentes.some(e => e.confdeltype === 'c');
    console.log(`  ${o.tabla}.${o.col}: FK existentes = [${existentes.map(e => e.conname + '(' + e.confdeltype + ')').join(', ') || 'ninguna'}]`);
    if (yaCascade) { console.log(`     ↳ ya tiene ON DELETE CASCADE, se omite.\n`); continue; }
    for (const e of existentes) plan.push(`ALTER TABLE ${o.tabla} DROP CONSTRAINT "${e.conname}";`);
    plan.push(`ALTER TABLE ${o.tabla} ADD CONSTRAINT "${o.fk}" FOREIGN KEY (${o.col}) REFERENCES simulaciones(id) ON DELETE CASCADE;`);
    console.log('');
  }

  if (plan.length === 0) { console.log('  ✅ Nada que migrar; ya está todo en cascada.\n'); await pool.end(); return; }

  console.log('  Sentencias a ejecutar:');
  plan.forEach(s => console.log('    ' + s));
  console.log('');

  if (!APLICAR) {
    console.log('  ⚠ MODO SIMULACRO. No se aplicó nada. Para aplicar: node migrar_cascade.js --aplicar\n');
    await pool.end(); return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const s of plan) await client.query(s);
    await client.query('COMMIT');
    console.log('  ✅ Cascada aplicada (transacción confirmada).');
    console.log('     A partir de ahora, borrar una simulación elimina sus rondas y decisiones automáticamente.\n');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error — ROLLBACK, no se aplicó nada:', e.message, '\n');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (e) => { console.error('❌', e.message); try { await pool.end(); } catch {} process.exit(1); });
