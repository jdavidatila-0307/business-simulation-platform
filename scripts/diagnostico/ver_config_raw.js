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
      `SELECT id, nombre, estado, 
              config,
              parametros->>'currentRound' as p_round,
              parametros->>'roundState' as p_state
       FROM simulaciones WHERE id='sim_mpi8g7y5'`
    );
    const row = r.rows[0];
    console.log('config:', JSON.stringify(row.config));
    console.log('p_round:', row.p_round);
    console.log('p_state:', row.p_state);
    
    // Ver todas las columnas
    const r2 = await client.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name='simulaciones'`
    );
    console.log('\nColumnas:', r2.rows.map(c=>c.column_name).join(', '));
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
