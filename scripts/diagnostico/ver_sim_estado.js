const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT id, nombre, estado, config->>'currentRound' as ronda,
              config->>'roundState' as roundState
       FROM simulaciones WHERE estado='activa' ORDER BY creada_at DESC LIMIT 5`
    );
    console.log('=== SIMULACIONES ACTIVAS ===');
    r.rows.forEach(s => {
      console.log(`\n${s.nombre} (${s.id})`);
      console.log(`  estado:     ${s.estado}`);
      console.log(`  ronda:      ${s.ronda}`);
      console.log(`  roundState: ${s.roundState}`);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
