/**
 * verificar_vacio.js — SimNego v3.2
 * Solo lectura. Verifica si la BD quedó sin simulaciones y sin datos huérfanos.
 *
 * Uso:
 *   cd C:\Win\SimuladorNegocios
 *   node verificar_vacio.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no está definida.'); process.exit(1); }
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 5000,
});

async function main() {
  const sims  = await pool.query('SELECT id, nombre, codigo_acceso, estado FROM simulaciones ORDER BY creada_at');
  const rond  = await pool.query('SELECT COUNT(*)::int n FROM sim_rondas');
  const decs  = await pool.query('SELECT COUNT(*)::int n FROM sim_decisiones');
  const users = await pool.query('SELECT id, nombre, rol FROM usuarios ORDER BY id');

  const nSims = sims.rows.length;
  const nRond = rond.rows[0].n;
  const nDecs = decs.rows[0].n;

  console.log('\n══════════════════════════════════════════');
  console.log('  ESTADO DE LA BASE DE DATOS');
  console.log('══════════════════════════════════════════');
  console.log(`  simulaciones:   ${nSims}`);
  console.log(`  sim_rondas:     ${nRond}`);
  console.log(`  sim_decisiones: ${nDecs}`);
  console.log(`  usuarios:       ${users.rows.length} (login, no se borran)`);

  if (nSims > 0) {
    console.log('\n  ⚠ Aún quedan simulaciones:');
    sims.rows.forEach(s => console.log(`     • ${s.nombre} [${s.codigo_acceso}] ${s.estado} (${s.id})`));
  }
  if (nRond > 0 || nDecs > 0) {
    console.log(`\n  ⚠ Hay datos huérfanos: ${nRond} ronda(s), ${nDecs} decision(es) sin simulación padre.`);
    console.log('     (El borrado desde el simulador puede no haber limpiado en cascada.)');
  }

  console.log('\n  Cuentas de login conservadas:');
  users.rows.forEach(u => console.log(`     • ${u.nombre} [${u.rol}] (${u.id})`));

  console.log('\n──────────────────────────────────────────');
  if (nSims === 0 && nRond === 0 && nDecs === 0) {
    console.log('  ✅ BD VACÍA de simulaciones, rondas y decisiones. Limpieza completa.');
  } else if (nSims === 0 && (nRond > 0 || nDecs > 0)) {
    console.log('  ⚠ Sin simulaciones, pero quedan rondas/decisiones huérfanas — conviene limpiarlas.');
  } else {
    console.log('  ❌ Todavía NO está vacía.');
  }
  console.log('──────────────────────────────────────────\n');

  await pool.end();
}

main().catch(async (e) => { console.error('❌', e.message); try { await pool.end(); } catch {} process.exit(1); });
