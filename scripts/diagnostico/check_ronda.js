process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT numero, estado, creada_at, calculada_at, resultados FROM sim_rondas');
  r.rows.forEach(row => {
    console.log(`Ronda ${row.numero}`);
    console.log(`  estado DB:    ${row.estado}`);
    console.log(`  creada_at:    ${row.creada_at}`);
    console.log(`  calculada_at: ${row.calculada_at}`);
    const res = row.resultados || {};
    Object.keys(res).forEach(k => {
      const v = res[k];
      const size = typeof v === 'object' ? Object.keys(v||{}).length : (Array.isArray(v) ? v.length : v);
      console.log(`  ${k}: ${size}`);
    });
  });
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
