/**
 * BORRAR RONDAS 9, 10 y 11 — SimNego COM540
 * Elimina decisiones, presimulacion y resultados de las rondas indicadas
 * Resetea currentRound a 8 y roundState a 'simulated'
 *
 * Ejecutar:
 *   node borrar_rondas.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const RONDAS_A_BORRAR = [9, 10, 11, 12];

async function main() {
  const sim = await pool.query(
    "SELECT id, nombre, config FROM simulaciones WHERE estado='activa' LIMIT 1"
  );
  const s = sim.rows[0];
  if (!s) { console.log('Sin simulación activa'); return; }

  console.log(`\nSimulación: ${s.nombre} (${s.id})`);
  console.log(`Estado actual: Ronda ${s.config.currentRound} | ${s.config.roundState}`);
  console.log(`\nRondas a borrar: ${RONDAS_A_BORRAR.join(', ')}`);
  console.log('\n¿Confirmar? Presiona Ctrl+C para cancelar o espera 5 segundos...\n');

  await new Promise(r => setTimeout(r, 5000));

  // 1. Borrar de sim_decisiones
  for (const n of RONDAS_A_BORRAR) {
    const r1 = await pool.query(
      "DELETE FROM sim_decisiones WHERE simulacion_id=$1 AND ronda_numero=$2",
      [s.id, n]
    );
    console.log(`  sim_decisiones R${n}: ${r1.rowCount} registros eliminados`);
  }

  // 2. Borrar de sim_rondas
  for (const n of RONDAS_A_BORRAR) {
    const r2 = await pool.query(
      "DELETE FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2",
      [s.id, n]
    );
    console.log(`  sim_rondas R${n}: ${r2.rowCount} registros eliminados`);
  }

  // 3. Resetear config a Ronda 8 simulada
  const configNueva = {
    ...s.config,
    currentRound: 8,
    roundState:   'simulated',
  };
  await pool.query(
    "UPDATE simulaciones SET config=$1 WHERE id=$2",
    [JSON.stringify(configNueva), s.id]
  );
  console.log(`\n✅ Simulación reseteada → Ronda 8 | Estado: simulated`);
  console.log('✅ Listo — puedes abrir la Ronda 9 desde el Dashboard del profesor');

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
