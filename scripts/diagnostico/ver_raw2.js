process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT * FROM sim_rondas ORDER BY creada_at DESC LIMIT 1');
  const ronda = r.rows[0];
  const res = ronda.resultados;

  console.log('\n=== TODAS LAS KEYS Y SU CONTENIDO ===');
  for (const [key, val] of Object.entries(res)) {
    const tipo = typeof val;
    const esVacio = val === null || val === undefined ||
      (tipo === 'object' && Object.keys(val).length === 0) ||
      (Array.isArray(val) && val.length === 0);
    console.log(`\n[${key}] tipo=${tipo} vacío=${esVacio}`);
    if (!esVacio) {
      const str = JSON.stringify(val, null, 2);
      console.log(str.slice(0, 1200));
    }
  }

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
