process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT numero, estado, calculada_at FROM sim_rondas ORDER BY numero');
  console.log('Rondas en BD:', r.rows.length);
  r.rows.forEach(row =>
    console.log(`  Ronda ${row.numero} | estado=${row.estado} | calculada=${row.calculada_at?.toISOString().slice(0,19)||'pendiente'}`));

  if (!r.rows.length) {
    console.log('  ⚠ Sin rondas — el reset borró todo. El admin debe ejecutar la simulación primero.');
  }
  await pool.end();
}
main().catch(e => console.error(e.message));
