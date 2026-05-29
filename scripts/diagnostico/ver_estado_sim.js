process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query(
    "SELECT id, nombre, config FROM simulaciones WHERE estado='activa' LIMIT 1"
  );
  const s = sim.rows[0];
  console.log(`\nSimulación: ${s.nombre}`);
  console.log(`currentRound: ${s.config.currentRound}`);
  console.log(`roundState:   ${s.config.roundState}`);

  // Ver qué rondas existen en sim_rondas
  const rondas = await pool.query(
    "SELECT numero, estado FROM sim_rondas WHERE simulacion_id=$1 ORDER BY numero",
    [s.id]
  );
  console.log(`\nRondas en sim_rondas: ${rondas.rows.length}`);
  rondas.rows.forEach(r => console.log(`  Ronda ${r.numero}: ${r.estado}`));

  // Verificar específicamente 9, 10, 11
  for (const n of [9, 10, 11]) {
    const r1 = await pool.query(
      "SELECT COUNT(*) FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2", [s.id, n]
    );
    const r2 = await pool.query(
      "SELECT COUNT(*) FROM sim_decisiones WHERE simulacion_id=$1 AND ronda_numero=$2", [s.id, n]
    );
    const enRondas = parseInt(r1.rows[0].count);
    const enDecs   = parseInt(r2.rows[0].count);
    const ok = enRondas === 0 && enDecs === 0;
    console.log(`  R${n}: sim_rondas=${enRondas} sim_decisiones=${enDecs} ${ok ? '✅ BORRADA' : '❌ AÚN EXISTE'}`);
  }

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
