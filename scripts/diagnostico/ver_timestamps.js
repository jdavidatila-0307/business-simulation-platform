const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});
async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT numero, estado, calculada_at 
       FROM sim_rondas WHERE simulacion_id=$1 
       ORDER BY numero`, ['sim_mpi8g7y5']
    );
    console.log('Ronda | Estado    | Calculada at');
    r.rows.forEach(row => {
      console.log(`  R${row.numero}  | ${row.estado.padEnd(9)} | ${row.calculada_at}`);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
