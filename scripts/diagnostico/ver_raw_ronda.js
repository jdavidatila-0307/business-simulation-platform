process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT numero, estado, resultados FROM sim_rondas');
  r.rows.forEach(row => {
    console.log(`Ronda ${row.numero} | estado DB: ${row.estado}`);
    const res = row.resultados || {};
    console.log(`Keys en resultados JSONB: [${Object.keys(res).join(', ')}]`);
    // Mostrar primeros 300 chars del JSON
    console.log(`Raw: ${JSON.stringify(res).slice(0, 300)}`);
  });
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
