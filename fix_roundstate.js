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
      `SELECT config FROM simulaciones WHERE id=$1`, ['sim_mpi8g7y5']
    );
    const config = r.rows[0]?.config || {};
    console.log('Config actual:', JSON.stringify(config, null, 2));

    const nuevoConfig = {
      ...config,
      roundState: 'pending',
    };
    await client.query(
      `UPDATE simulaciones SET config=$1 WHERE id=$2`,
      [JSON.stringify(nuevoConfig), 'sim_mpi8g7y5']
    );
    console.log('✅ roundState = pending');
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
