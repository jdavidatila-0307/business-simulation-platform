process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sims = await pool.query('SELECT nombre, config FROM simulaciones');
  sims.rows.forEach(s => {
    console.log(`Sim: ${s.nombre}`);
    console.log(`  currentRound: ${s.config?.currentRound}`);
    console.log(`  roundState:   ${s.config?.roundState}`);
  });

  const rondas = await pool.query('SELECT numero, estado, calculada_at, resultados FROM sim_rondas ORDER BY numero');
  console.log(`\nRondas: ${rondas.rows.length}`);
  rondas.rows.forEach(r => {
    const res = r.resultados || {};
    const nResultados = Object.keys(res.resultados || {}).length;
    console.log(`  Ronda ${r.numero} | ${r.estado} | calculada: ${r.calculada_at ? 'SÍ' : 'NO'} | equipos: ${nResultados}`);
  });
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
