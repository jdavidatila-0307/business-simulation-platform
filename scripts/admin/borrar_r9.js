process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const simId = sim.rows[0].id;

  const r1 = await pool.query(
    "DELETE FROM sim_decisiones WHERE simulacion_id=$1 AND ronda_numero=9", [simId]
  );
  const r2 = await pool.query(
    "DELETE FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [simId]
  );
  await pool.query(
    "UPDATE simulaciones SET config = jsonb_set(jsonb_set(config, '{currentRound}', '8'), '{roundState}', '\"simulated\"') WHERE id=$1",
    [simId]
  );
  console.log(`sim_decisiones R9: ${r1.rowCount} eliminados`);
  console.log(`sim_rondas R9:     ${r2.rowCount} eliminados`);
  console.log(`✅ Reseteado a Ronda 8 | simulated`);
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
