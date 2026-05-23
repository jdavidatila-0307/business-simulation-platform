process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  // Resetear roundState y currentRound en todas las simulaciones
  await pool.query(`
    UPDATE simulaciones
    SET config = config
      || '{"roundState":"pending"}'::jsonb
      || '{"currentRound":0}'::jsonb
  `);
  
  const r = await pool.query('SELECT nombre, config FROM simulaciones');
  r.rows.forEach(s => {
    console.log(`✅ ${s.nombre} | roundState: ${s.config.roundState} | currentRound: ${s.config.currentRound}`);
  });
  
  await pool.end();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
