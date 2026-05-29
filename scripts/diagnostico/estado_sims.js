/**
 * estado_sims.js — SimNego v3.2
 * Solo lectura. Muestra cada simulación con su nº de rondas y decisiones,
 * y el total de huérfanos. Sirve para documentar el "antes" y el "después"
 * de una prueba de borrado end-to-end.
 *
 * Uso:
 *   node estado_sims.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no está definida.'); process.exit(1); }
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 5000,
});

function pad(s, n) { s = String(s == null ? '' : s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

async function main() {
  const sims = await pool.query('SELECT id, nombre, codigo_acceso, estado FROM simulaciones ORDER BY creada_at');
  const rond = await pool.query('SELECT simulacion_id, COUNT(*)::int n FROM sim_rondas GROUP BY simulacion_id');
  const decs = await pool.query('SELECT simulacion_id, COUNT(*)::int n FROM sim_decisiones GROUP BY simulacion_id');
  const rmap = {}; rond.rows.forEach(r => rmap[r.simulacion_id] = r.n);
  const dmap = {}; decs.rows.forEach(r => dmap[r.simulacion_id] = r.n);

  const huerR = (await pool.query('SELECT COUNT(*)::int n FROM sim_rondas     WHERE simulacion_id NOT IN (SELECT id FROM simulaciones)')).rows[0].n;
  const huerD = (await pool.query('SELECT COUNT(*)::int n FROM sim_decisiones WHERE simulacion_id NOT IN (SELECT id FROM simulaciones)')).rows[0].n;

  console.log('\n══════════════════════════════════════════');
  console.log('  ESTADO DE SIMULACIONES');
  console.log('══════════════════════════════════════════');
  console.log(pad('ID', 18), pad('NOMBRE', 18), pad('CÓDIGO', 10), pad('RONDAS', 7), 'DECS');
  console.log('-'.repeat(64));
  for (const s of sims.rows) {
    console.log(pad(s.id, 18), pad(s.nombre, 18), pad(s.codigo_acceso, 10), pad(rmap[s.id] || 0, 7), dmap[s.id] || 0);
  }
  console.log('-'.repeat(64));
  console.log(`  Simulaciones: ${sims.rows.length}`);
  console.log(`  Huérfanos → rondas: ${huerR} · decisiones: ${huerD}` + ((huerR || huerD) ? '  ⚠' : '  ✅'));
  console.log('');

  await pool.end();
}

main().catch(async (e) => { console.error('❌', e.message); try { await pool.end(); } catch {} process.exit(1); });
