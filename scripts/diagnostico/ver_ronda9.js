process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id, nombre, config, users FROM simulaciones WHERE estado='activa' LIMIT 1");
  const s = sim.rows[0];
  console.log(`\nSimulación: ${s.nombre}`);
  console.log(`currentRound: ${s.config.currentRound}`);
  console.log(`roundState:   ${s.config.roundState}`);

  const equipos = s.users || [];
  console.log(`\nEquipos: ${equipos.length}`);

  // Ver decisiones de ronda 9
  const ronda = await pool.query(
    "SELECT numero, estado, resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2",
    [s.id, s.config.currentRound]
  );

  if (!ronda.rows[0]) {
    console.log(`\n⚠ Ronda ${s.config.currentRound} NO existe en sim_rondas`);
  } else {
    const r = ronda.rows[0];
    console.log(`\nRonda ${r.numero} | estado: ${r.estado}`);
    const decs = r.resultados?.decisiones || {};
    console.log(`Decisiones guardadas: ${Object.keys(decs).length}`);
    Object.entries(decs).forEach(([k, d]) => {
      const eq = equipos.find(e => e.id === k);
      console.log(`  ${eq?.nombre||k.slice(-15)}: submitted=${d.submitted} enviada=${d.submittedAt?'SÍ':'NO'}`);
    });
  }

  // Ver decisiones en sim_decisiones
  const sdecs = await pool.query(
    "SELECT equipo_id, decisiones FROM sim_decisiones WHERE simulacion_id=$1 AND ronda_numero=$2",
    [s.id, s.config.currentRound]
  );
  console.log(`\nsim_decisiones para ronda ${s.config.currentRound}: ${sdecs.rows.length} registros`);
  sdecs.rows.forEach(d => {
    const eq = equipos.find(e => e.id === d.equipo_id);
    console.log(`  ${eq?.nombre||d.equipo_id.slice(-15)}: submitted=${d.decisiones?.submitted}`);
  });

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
