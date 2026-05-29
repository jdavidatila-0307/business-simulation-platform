process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  // Estado de simulación
  const sims = await pool.query('SELECT nombre, config FROM simulaciones');
  sims.rows.forEach(s => {
    console.log(`Sim: ${s.nombre}`);
    console.log(`  currentRound: ${s.config?.currentRound}`);
    console.log(`  roundState:   ${s.config?.roundState}`);
  });

  // Rondas y resultados
  const rondas = await pool.query('SELECT numero, estado, resultados FROM sim_rondas ORDER BY numero');
  console.log(`\nRondas en BD: ${rondas.rows.length}`);
  rondas.rows.forEach(r => {
    const res = r.resultados?.resultados || {};
    const nEq = Object.keys(res).length;
    console.log(`  Ronda ${r.numero} | ${r.estado} | equipos con resultado: ${nEq}`);
    // Mostrar utilidadNeta y balance de cada equipo
    Object.values(res).forEach(eq => {
      console.log(`    Eq ${eq.equipoNombre}: utilNeta=${eq.utilidadNeta} | activos=${eq.totalActivos} | deuda+pat=${(eq.deudaFinal||0)+(eq.patrimonio||0)}`);
    });
  });
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
