process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id, config FROM simulaciones WHERE estado='activa' LIMIT 1");
  const s = sim.rows[0];
  const n = s.config.currentRound;

  const ronda = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2", [s.id, n]
  );
  const r = ronda.rows[0]?.resultados || {};
  const presim = r.preSimulacion || {};
  const keys = Object.keys(presim);

  console.log(`\nRonda ${n} — preSimulacion: ${keys.length} entradas`);
  keys.forEach(k => {
    const p = presim[k];
    console.log(`\n  ${k.slice(-25)}`);
    console.log(`    equipoNombre:    ${p.equipoNombre}`);
    console.log(`    equipoOriginal:  ${p.equipoOriginal}`);
    console.log(`    producto:        ${p.producto}`);
    console.log(`    demandaAsignada: ${p.demandaAsignada}`);
    console.log(`    confirmado:      ${p.confirmado}`);
  });

  // También ver decisiones en sim_decisiones
  const decs = await pool.query(
    "SELECT equipo_id, decisiones FROM sim_decisiones WHERE simulacion_id=$1 AND ronda_numero=$2 ORDER BY equipo_id",
    [s.id, n]
  );
  console.log(`\nsim_decisiones ronda ${n}: ${decs.rows.length} registros`);
  decs.rows.forEach(d => {
    console.log(`  ${d.equipo_id.slice(-20)}: prod="${d.decisiones?.producto}" submitted=${d.decisiones?.submitted}`);
  });

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
