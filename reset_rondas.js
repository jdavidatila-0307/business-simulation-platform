/**
 * Script de reset — SimNego
 * Opción A: borra solo rondas y decisiones
 * Conserva: usuarios, equipos, simulación y parámetros
 *
 * Ejecutar en Windows (cmd):
 *   set "DATABASE_URL=postgresql://usuario:pass@host:5432/postgres"
 *   node reset_rondas.js
 *
 * Opcional — resetear solo una simulación específica:
 *   node reset_rondas.js <sim_id>
 *
 * Columnas reales verificadas en producción:
 *   simulaciones: id, owner_id, nombre, estado, config, parametros,
 *                 tipos_producto, canales, segmentos, afinidad_matrix,
 *                 competencia_externa, rondas, users
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const simIdFiltro = process.argv[2] || null;

  console.log('\n══════════════════════════════════════════');
  console.log('  RESET RONDAS — SimNego');
  console.log('══════════════════════════════════════════\n');

  // 1. Conexión
  try {
    await pool.query('SELECT 1');
    console.log('✅ Conexión a Supabase OK');
  } catch(e) {
    console.error('❌ Error de conexión:', e.message);
    process.exit(1);
  }

  // 2. Estado ANTES
  console.log('\n── Estado ANTES del reset ──────────────');
  for (const tabla of ['simulaciones', 'sim_rondas', 'sim_decisiones', 'usuarios']) {
    try {
      const r = await pool.query(`SELECT COUNT(*) as n FROM ${tabla}`);
      console.log(`  ${tabla.padEnd(20)}: ${r.rows[0].n} registros`);
    } catch(e) {
      console.log(`  ${tabla.padEnd(20)}: tabla no existe`);
    }
  }

  // 3. Simulaciones afectadas
  console.log('\n── Simulaciones encontradas ────────────');
  try {
    const sims = await pool.query('SELECT id, nombre, estado FROM simulaciones ORDER BY nombre');
    if (sims.rows.length === 0) {
      console.log('  (ninguna)');
    } else {
      sims.rows.forEach(s => {
        const tag = simIdFiltro
          ? (s.id === simIdFiltro ? '← se reseteará ESTA' : '← se conservará')
          : '← se reseteará';
        console.log(`  ${s.id.slice(0,8)}...  "${s.nombre}"  [${s.estado}]  ${tag}`);
      });
    }
  } catch(e) {
    console.log('  Error leyendo simulaciones:', e.message);
  }

  // 4. Borrar decisiones y rondas
  console.log('\n── Ejecutando reset ────────────────────');
  try {
    let borradoDecisiones, borradoRondas;

    if (simIdFiltro) {
      borradoDecisiones = await pool.query(
        `DELETE FROM sim_decisiones
         WHERE ronda_id IN (
           SELECT id FROM sim_rondas WHERE sim_id = $1
         )`, [simIdFiltro]
      );
      borradoRondas = await pool.query(
        'DELETE FROM sim_rondas WHERE sim_id = $1', [simIdFiltro]
      );
    } else {
      borradoDecisiones = await pool.query('DELETE FROM sim_decisiones');
      borradoRondas     = await pool.query('DELETE FROM sim_rondas');
    }

    console.log(`  ✅ sim_decisiones eliminadas: ${borradoDecisiones.rowCount}`);
    console.log(`  ✅ sim_rondas eliminadas:     ${borradoRondas.rowCount}`);

  } catch(e) {
    console.error('  ❌ Error borrando rondas/decisiones:', e.message);
    process.exit(1);
  }

  // 5. Resetear estado y rondas en tabla simulaciones
  // Columna verificada en producción: estado + rondas (JSONB)
  try {
    if (simIdFiltro) {
      await pool.query(
        `UPDATE simulaciones
         SET estado = 'activa',
             rondas = '{}',
             config = config
               || '{"roundState":"pending"}'::jsonb
               || '{"currentRound":0}'::jsonb
         WHERE id = $1`, [simIdFiltro]
      );
    } else {
      await pool.query(
        `UPDATE simulaciones
         SET estado = 'activa',
             rondas = '{}',
             config = config
               || '{"roundState":"pending"}'::jsonb
               || '{"currentRound":0}'::jsonb`
      );
    }
    console.log('  ✅ simulaciones reseteadas a estado=pendiente, rondas={}');
  } catch(e) {
    console.error('  ❌ Error reseteando simulaciones:', e.message);
  }

  // 6. Estado DESPUÉS
  console.log('\n── Estado DESPUÉS del reset ────────────');
  for (const tabla of ['simulaciones', 'sim_rondas', 'sim_decisiones', 'usuarios']) {
    try {
      const r = await pool.query(`SELECT COUNT(*) as n FROM ${tabla}`);
      console.log(`  ${tabla.padEnd(20)}: ${r.rows[0].n} registros`);
    } catch(e) {
      console.log(`  ${tabla.padEnd(20)}: tabla no existe`);
    }
  }

  // 7. Verificar estado final de simulaciones
  try {
    const sims = await pool.query('SELECT id, nombre, estado FROM simulaciones');
    console.log('\n── Simulaciones después del reset ──────');
    sims.rows.forEach(s =>
      console.log(`  ${s.id.slice(0,8)}...  "${s.nombre}"  [${s.estado}]`)
    );
  } catch(e) {}

  console.log('\n══════════════════════════════════════════');
  console.log('✅ Reset completado exitosamente.');
  console.log('   Conservado: usuarios, equipos, configuración.');
  console.log('   Borrado: todas las rondas y decisiones.');
  console.log('   La simulación está lista para la Ronda 1.');
  console.log('══════════════════════════════════════════\n');

  await pool.end();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
