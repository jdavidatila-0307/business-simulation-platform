process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  console.log('\n── Estado ANTES ─────────────────────────');
  const antes = await pool.query('SELECT nombre, config FROM simulaciones');
  antes.rows.forEach(s => console.log(`  ${s.nombre} | currentRound: ${s.config?.currentRound} | roundState: ${s.config?.roundState}`));
  const rondasAntes = await pool.query('SELECT numero, estado FROM sim_rondas ORDER BY numero');
  rondasAntes.rows.forEach(r => console.log(`  Ronda ${r.numero} | ${r.estado}`));

  // FIX 1: Mover resultados de Ronda 0 a Ronda 1 (si existen)
  const ronda0 = await pool.query("SELECT id, resultados FROM sim_rondas WHERE numero=0");
  if (ronda0.rows.length > 0 && Object.keys(ronda0.rows[0].resultados?.resultados||{}).length > 0) {
    console.log('\n── Moviendo resultados de Ronda 0 → Ronda 1 ──');
    const datos = ronda0.rows[0].resultados;
    // Upsert en Ronda 1 con los datos de Ronda 0
    await pool.query(`
      INSERT INTO sim_rondas (simulacion_id, numero, estado, calculada_at, resultados)
      SELECT simulacion_id, 1, 'calculada', NOW(), $1::jsonb
      FROM sim_rondas WHERE numero=0
      ON CONFLICT (simulacion_id, numero) DO UPDATE
        SET estado='calculada', calculada_at=NOW(), resultados=$1::jsonb
    `, [JSON.stringify(datos)]);
    // Borrar Ronda 0
    await pool.query("DELETE FROM sim_rondas WHERE numero=0");
    console.log('  ✅ Resultados movidos a Ronda 1');
  } else {
    // Solo borrar Ronda 0 vacía si existe
    await pool.query("DELETE FROM sim_rondas WHERE numero=0");
    console.log('\n── Ronda 0 vacía eliminada ──');
  }

  // FIX 2: Actualizar currentRound=1 y roundState=simulated en config
  await pool.query(`
    UPDATE simulaciones
    SET config = config
      || '{"currentRound":1}'::jsonb
      || '{"roundState":"simulated"}'::jsonb
  `);
  console.log('  ✅ currentRound=1, roundState=simulated');

  console.log('\n── Estado DESPUÉS ───────────────────────');
  const despues = await pool.query('SELECT nombre, config FROM simulaciones');
  despues.rows.forEach(s => console.log(`  ${s.nombre} | currentRound: ${s.config?.currentRound} | roundState: ${s.config?.roundState}`));
  const rondasDespues = await pool.query('SELECT numero, estado FROM sim_rondas ORDER BY numero');
  rondasDespues.rows.forEach(r => console.log(`  Ronda ${r.numero} | ${r.estado}`));

  await pool.end();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
