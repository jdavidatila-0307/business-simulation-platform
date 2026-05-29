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
      `SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=2`,
      ['sim_mpi8g7y5']
    );
    const resObj = r.rows[0]?.resultados?.resultados || {};
    const razKeys = Object.keys(resObj).filter(k => k.includes('raz'));
    console.log('Claves Raíz R2:', razKeys);
    razKeys.forEach(k => {
      console.log(k, '→ invFinal:', resObj[k].inventarioFinal);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
