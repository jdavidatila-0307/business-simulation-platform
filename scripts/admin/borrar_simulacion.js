/**
 * Script de borrado selectivo — SimNego
 * Elimina la simulación COM540D12026 y todos sus datos asociados.
 * Conserva: usuario admin y cualquier otra simulación.
 *
 * Windows cmd:
 *   set "DATABASE_URL=postgresql://..."
 *   node borrar_simulacion.js
 *
 * Para borrar por nombre específico:
 *   node borrar_simulacion.js "NombreDeLaSim"
 *
 * Columnas verificadas en producción:
 *   sim_rondas:     id, simulacion_id, numero, estado, resultados
 *   sim_decisiones: id, simulacion_id, ronda_numero, equipo_id, decisiones
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const nombreSim = process.argv[2] || 'COM540D12026';

  console.log('\n══════════════════════════════════════════');
  console.log('  BORRADO SELECTIVO — SimNego');
  console.log(`  Simulación objetivo: "${nombreSim}"`);
  console.log('══════════════════════════════════════════\n');

  await pool.query('SELECT 1');
  console.log('✅ Conexión a Supabase OK\n');

  // 1. Buscar simulación
  const simRes = await pool.query(
    'SELECT id, nombre, estado FROM simulaciones WHERE nombre = $1',
    [nombreSim]
  );

  if (simRes.rows.length === 0) {
    console.log(`❌ No se encontró simulación con nombre "${nombreSim}"`);
    const todas = await pool.query('SELECT nombre, estado FROM simulaciones');
    if (todas.rows.length > 0) {
      console.log('\nSimulaciones disponibles:');
      todas.rows.forEach(s => console.log(`  - "${s.nombre}" [${s.estado}]`));
    }
    await pool.end();
    return;
  }

  const sim = simRes.rows[0];
  console.log('── Simulación encontrada ───────────────');
  console.log(`  ID:     ${sim.id}`);
  console.log(`  Nombre: ${sim.nombre}`);
  console.log(`  Estado: ${sim.estado}`);

  // 2. Contar datos asociados
  const decRes = await pool.query(
    'SELECT COUNT(*) as n FROM sim_decisiones WHERE simulacion_id = $1',
    [sim.id]
  );
  const ronRes = await pool.query(
    'SELECT COUNT(*) as n FROM sim_rondas WHERE simulacion_id = $1',
    [sim.id]
  );
  const equData = await pool.query(
    'SELECT users FROM simulaciones WHERE id = $1', [sim.id]
  );
  const equipos = equData.rows[0]?.users || [];

  console.log('\n── Lo que se va a BORRAR ────────────────');
  console.log(`  sim_decisiones: ${decRes.rows[0].n} registros`);
  console.log(`  sim_rondas:     ${ronRes.rows[0].n} registros`);
  console.log(`  Equipos:        ${equipos.length} (${equipos.map(e=>e.nombre).join(', ')})`);
  console.log(`  Simulación:     "${sim.nombre}"`);

  console.log('\n── Lo que se CONSERVA ───────────────────');
  const usuRes = await pool.query('SELECT nombre, rol FROM usuarios');
  usuRes.rows.forEach(u => console.log(`  Usuario: ${u.nombre} [${u.rol}]`));
  const otras = await pool.query(
    'SELECT nombre FROM simulaciones WHERE id != $1', [sim.id]
  );
  if (otras.rows.length > 0) {
    otras.rows.forEach(s => console.log(`  Simulación: "${s.nombre}" (intacta)`));
  }

  // 3. Borrado en orden correcto (respetar claves foráneas)
  console.log('\n── Ejecutando borrado ───────────────────');

  const delDec = await pool.query(
    'DELETE FROM sim_decisiones WHERE simulacion_id = $1', [sim.id]
  );
  console.log(`  ✅ sim_decisiones eliminadas: ${delDec.rowCount}`);

  const delRon = await pool.query(
    'DELETE FROM sim_rondas WHERE simulacion_id = $1', [sim.id]
  );
  console.log(`  ✅ sim_rondas eliminadas:     ${delRon.rowCount}`);

  const delSim = await pool.query(
    'DELETE FROM simulaciones WHERE id = $1', [sim.id]
  );
  console.log(`  ✅ Simulación eliminada:       ${delSim.rowCount}`);

  // 4. Estado final
  console.log('\n── Estado final de la BD ────────────────');
  for (const tabla of ['simulaciones', 'sim_rondas', 'sim_decisiones', 'usuarios']) {
    try {
      const r = await pool.query(`SELECT COUNT(*) as n FROM ${tabla}`);
      console.log(`  ${tabla.padEnd(20)}: ${r.rows[0].n} registros`);
    } catch(e) {
      console.log(`  ${tabla.padEnd(20)}: error — ${e.message}`);
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log('✅ Borrado completado. Base de datos limpia.');
  console.log('\n── PRÓXIMOS PASOS ───────────────────────');
  console.log('1. Reiniciar servidor:  node server.js');
  console.log('2. Ingresar como admin (admin / admin123)');
  console.log('3. Panel Admin → "Nueva Simulación"');
  console.log('4. Nombre: COM540 Juego de Negocios 2026');
  console.log('5. Industria: Calzados_COM540_1_2026');
  console.log('6. Rondas máximas: 12');
  console.log('7. Guardar → crear 6 equipos (uno por empresa)');
  console.log('8. Activar hoja de decisiones Ronda 1');
  console.log('══════════════════════════════════════════\n');

  await pool.end();
}

main().catch(e => {
  console.error('\n❌ ERROR FATAL:', e.message);
  process.exit(1);
});
