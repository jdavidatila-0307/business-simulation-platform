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
      `SELECT numero, estado, calculada_at,
              resultados IS NOT NULL as tiene_resultados
       FROM sim_rondas 
       WHERE simulacion_id=$1 
       ORDER BY numero`,
      ['sim_mpi8g7y5']
    );
    console.log('=== ESTADO RONDAS COM540D12026 ===');
    r.rows.forEach(row => {
      console.log(`R${row.numero}: estado=${row.estado} | calculada=${row.calculada_at?'sí':'no'} | resultados=${row.tiene_resultados}`);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
