/**
 * BACKUP COMPLETO — SimNego COM540
 * Exporta todos los datos de la simulación activa a un archivo JSON
 *
 * Ejecutar:
 *   set "DATABASE_URL=postgresql://..."
 *   node backup_sim.js
 *
 * Genera: backup_COM540_YYYY-MM-DD.json
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const fs       = require('fs');
const pool     = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const ahora = new Date();
  const fecha = ahora.toISOString().slice(0,10);
  const hora  = ahora.toISOString().slice(11,19).replace(/:/g,'-');

  console.log('\n══════════════════════════════════════════');
  console.log('  BACKUP SimNego — COM540');
  console.log('  ' + ahora.toLocaleString('es-BO', { timeZone: 'America/La_Paz' }));
  console.log('══════════════════════════════════════════\n');

  await pool.query('SELECT 1');
  console.log('✅ Conexión OK\n');

  // 1. Simulaciones
  const sims = await pool.query('SELECT * FROM simulaciones');
  console.log(`  simulaciones:   ${sims.rows.length}`);

  // 2. Rondas con resultados completos
  const rondas = await pool.query('SELECT * FROM sim_rondas ORDER BY simulacion_id, numero');
  console.log(`  sim_rondas:     ${rondas.rows.length}`);

  // 3. Decisiones
  const decs = await pool.query('SELECT * FROM sim_decisiones ORDER BY simulacion_id, ronda_numero, equipo_id');
  console.log(`  sim_decisiones: ${decs.rows.length}`);

  // 4. Usuarios (sin contraseñas en claro)
  const users = await pool.query('SELECT id, nombre, rol FROM usuarios');
  console.log(`  usuarios:       ${users.rows.length}`);

  // 5. Sesiones activas
  let sesiones = [];
  try {
    const s = await pool.query('SELECT COUNT(*) as n FROM sesiones');
    console.log(`  sesiones:       ${s.rows[0].n} (no incluidas en backup)`);
  } catch(e) {}

  // ── Resumen por simulación ────────────────────────────────
  console.log('\n── Detalle por simulación ───────────────');
  for (const sim of sims.rows) {
    const equipos = sim.users || [];
    const rondasSim = rondas.rows.filter(r => r.simulacion_id === sim.id);
    const decsSim   = decs.rows.filter(d => d.simulacion_id === sim.id);

    console.log(`\n  📊 ${sim.nombre} [${sim.estado}]`);
    console.log(`     ID: ${sim.id}`);
    console.log(`     Industria: ${sim.config?.industria || '—'}`);
    console.log(`     Ronda actual: ${sim.config?.currentRound || 0} / ${sim.config?.totalRounds || 0}`);
    console.log(`     Equipos: ${equipos.length} (${equipos.map(e=>e.nombre).join(', ')})`);
    console.log(`     Rondas guardadas: ${rondasSim.length}`);
    console.log(`     Decisiones guardadas: ${decsSim.length}`);

    rondasSim.forEach(r => {
      const nRes = Object.keys(r.resultados?.resultados || {}).length;
      const nDec = decsSim.filter(d => d.ronda_numero === r.numero).length;
      console.log(`       Ronda ${r.numero}: ${r.estado} | resultados: ${nRes} | decisiones: ${nDec}`);
    });
  }

  // ── Construir backup JSON ─────────────────────────────────
  const backup = {
    meta: {
      generado:   ahora.toISOString(),
      fecha,
      hora,
      version:    'SimNego v3.2',
      curso:      'COM540 — Juego de Negocios — UAGRM',
      totalRondas: rondas.rows.length,
      totalDecisiones: decs.rows.length,
    },
    simulaciones: sims.rows,
    rondas:        rondas.rows,
    decisiones:    decs.rows,
    usuarios:      users.rows,
  };

  const filename = `backup_COM540_${fecha}_${hora}.json`;
  fs.writeFileSync(filename, JSON.stringify(backup, null, 2), 'utf8');
  const sizeMB = (fs.statSync(filename).size / 1024 / 1024).toFixed(2);

  console.log(`\n══════════════════════════════════════════`);
  console.log(`✅ Backup guardado: ${filename}`);
  console.log(`   Tamaño: ${sizeMB} MB`);
  console.log(`   Registros: ${sims.rows.length} sims + ${rondas.rows.length} rondas + ${decs.rows.length} decisiones`);
  console.log(`══════════════════════════════════════════\n`);

  await pool.end();
}

main().catch(e => {
  console.error('\n❌ ERROR:', e.message);
  process.exit(1);
});
