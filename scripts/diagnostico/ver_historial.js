process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sims = await pool.query('SELECT id, nombre, config FROM simulaciones');
  sims.rows.forEach(s => {
    console.log('\nSimulación:', s.nombre);
    console.log('  config:', JSON.stringify(s.config));
  });

  const rondas = await pool.query('SELECT simulacion_id, numero, estado FROM sim_rondas');
  console.log('\nRondas en BD:');
  rondas.rows.forEach(r =>
    console.log(`  sim=${r.simulacion_id.slice(0,8)} | ronda=${r.numero} | estado=${r.estado}`)
  );
  await pool.end();
}
main().catch(e => console.error(e.message));
