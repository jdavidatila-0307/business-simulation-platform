/**
 * limpiar_huerfanos.js — SimNego v3.2
 * Elimina rondas y decisiones huérfanas (sin simulación padre) y desvincula
 * (SET NULL) los punteros de `sesiones` que apuntan a simulaciones inexistentes.
 * NO borra sesiones ni toca `usuarios`.
 *
 * SEGURIDAD: dry-run por defecto. Para ejecutar de verdad: --confirmar
 *
 * Uso:
 *   node limpiar_huerfanos.js              (simulacro)
 *   node limpiar_huerfanos.js --confirmar  (aplica)
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');

const CONFIRMAR = process.argv.includes('--confirmar');
if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no está definida.'); process.exit(1); }
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 5000,
});

const Q_RONDAS = `simulacion_id NOT IN (SELECT id FROM simulaciones)`;
const Q_DECS   = `simulacion_id NOT IN (SELECT id FROM simulaciones)`;
const Q_SES    = `simulacion_id IS NOT NULL AND simulacion_id NOT IN (SELECT id FROM simulaciones)`;

async function main() {
  const r = (await pool.query(`SELECT COUNT(*)::int n FROM sim_rondas     WHERE ${Q_RONDAS}`)).rows[0].n;
  const d = (await pool.query(`SELECT COUNT(*)::int n FROM sim_decisiones WHERE ${Q_DECS}`)).rows[0].n;
  const sQ = await pool.query(`SELECT COUNT(*)::int n FROM sesiones WHERE ${Q_SES}`).catch(() => ({ rows: [{ n: 0 }] }));
  const sCount = sQ.rows[0].n;

  console.log('\n══════════════════════════════════════════');
  console.log('  LIMPIEZA DE HUÉRFANOS — SimNego');
  console.log('══════════════════════════════════════════');
  console.log(`  Rondas huérfanas:        ${r}`);
  console.log(`  Decisiones huérfanas:    ${d}`);
  console.log(`  Sesiones a desvincular:  ${sCount} (SET NULL, no se borran)\n`);

  if (r === 0 && d === 0 && sCount === 0) {
    console.log('  ✅ No hay nada que limpiar.\n');
    await pool.end(); return;
  }

  if (!CONFIRMAR) {
    console.log('  ⚠ MODO SIMULACRO. No se cambió nada.');
    console.log('  Para aplicar: node limpiar_huerfanos.js --confirmar\n');
    await pool.end(); return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dd = await client.query(`DELETE FROM sim_decisiones WHERE ${Q_DECS}`);
    const dr = await client.query(`DELETE FROM sim_rondas     WHERE ${Q_RONDAS}`);
    let ds = { rowCount: 0 };
    try { ds = await client.query(`UPDATE sesiones SET simulacion_id = NULL WHERE ${Q_SES}`); } catch {}
    await client.query('COMMIT');
    console.log('  🧹 LIMPIEZA APLICADA:');
    console.log(`     decisiones eliminadas:   ${dd.rowCount}`);
    console.log(`     rondas eliminadas:       ${dr.rowCount}`);
    console.log(`     sesiones desvinculadas:  ${ds.rowCount}`);
    console.log('\n  Verifica con: node verificar_vacio.js\n');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error — ROLLBACK, no se cambió nada:', e.message, '\n');
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (e) => { console.error('❌', e.message); try { await pool.end(); } catch {} process.exit(1); });
