process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id, config FROM simulaciones WHERE estado='activa' LIMIT 1");
  const s = sim.rows[0];
  console.log(`\nroundState: ${s.config.roundState}`);
  console.log(`currentRound: ${s.config.currentRound}`);

  const r9 = await pool.query(
    "SELECT estado, resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [s.id]
  );
  if (!r9.rows[0]) { console.log('Ronda 9 no existe'); return; }
  
  const decs = r9.rows[0].resultados?.decisiones || {};
  const keys = Object.keys(decs);
  console.log(`\nEstado ronda 9: ${r9.rows[0].estado}`);
  console.log(`Decisiones en ronda.decisiones: ${keys.length}`);
  keys.forEach(k => {
    const d = decs[k];
    console.log(`  ${k.slice(-20)}: submitted=${d.submitted} producto="${d.producto}" caja=${d.cajaInicial}`);
  });

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
