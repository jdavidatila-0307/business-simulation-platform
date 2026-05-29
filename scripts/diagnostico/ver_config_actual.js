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
      `SELECT config->>'roundState' as roundState,
              config->>'currentRound' as currentRound
       FROM simulaciones WHERE id=$1`, ['sim_mpi8g7y5']
    );
    console.log('roundState:', r.rows[0]?.roundState);
    console.log('currentRound:', r.rows[0]?.currentRound);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
