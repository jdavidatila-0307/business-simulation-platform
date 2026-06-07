const { Pool } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // Obtener ambas simulaciones
  const sims = await pool.query(`SELECT id, nombre, codigo_acceso, owner_id, 
    config->>'currentRound' as ronda, config->>'roundState' as estado
    FROM simulaciones WHERE nombre ILIKE '%COM540D 1 2026 Final%' ORDER BY creada_at ASC`);
  
  console.log('\n=== SIMULACIONES ===');
  sims.rows.forEach(s => console.log(`  [${s.id}] ${s.nombre} | código: ${s.codigo_acceso} | ronda: ${s.ronda} | estado: ${s.estado}`));

  const original  = sims.rows.find(s => !s.nombre.includes('restaurado'));
  const restaurada = sims.rows.find(s =>  s.nombre.includes('restaurado'));
  if (!original || !restaurada) { console.log('❌ No se encontraron ambas'); await pool.end(); return; }

  // 1. IDs diferentes
  console.log(`\n=== INDEPENDENCIA DE IDs ===`);
  console.log(`  IDs diferentes:        ${original.id !== restaurada.id ? '✅' : '❌ MISMO ID'}`);
  console.log(`  Códigos diferentes:    ${original.codigo_acceso !== restaurada.codigo_acceso ? '✅' : '❌ MISMO CÓDIGO'}`);

  // 2. Equipos — IDs en común
  const simOrig = await pool.query(`SELECT users FROM simulaciones WHERE id = $1`, [original.id]);
  const simRest = await pool.query(`SELECT users FROM simulaciones WHERE id = $1`, [restaurada.id]);
  const usersOrig = (simOrig.rows[0]?.users || []).map(u => u.id);
  const usersRest = (simRest.rows[0]?.users || []).map(u => u.id);
  const idsComunes = usersOrig.filter(id => usersRest.includes(id));
  console.log(`\n=== EQUIPOS ===`);
  console.log(`  IDs equipos en común:  ${idsComunes.length > 0 ? '⚠️ ' + idsComunes.length + ' IDs compartidos' : '✅ Ninguno'}`);
  if (idsComunes.length) {
    console.log('  IDs compartidos:');
    idsComunes.forEach(id => console.log(`    ${id}`));
  }

  // 3. Rondas — sim_rondas
  const rondasOrig = await pool.query(`SELECT numero FROM sim_rondas WHERE simulacion_id = $1`, [original.id]);
  const rondasRest = await pool.query(`SELECT numero FROM sim_rondas WHERE simulacion_id = $1`, [restaurada.id]);
  console.log(`\n=== RONDAS ===`);
  console.log(`  Original:   ${rondasOrig.rows.map(r => 'T'+r.numero).join(', ')}`);
  console.log(`  Restaurada: ${rondasRest.rows.map(r => 'T'+r.numero).join(', ')}`);

  // 4. Decisiones — sim_decisiones
  const decsOrig = await pool.query(`SELECT COUNT(*) as total FROM sim_decisiones WHERE simulacion_id = $1`, [original.id]);
  const decsRest = await pool.query(`SELECT COUNT(*) as total FROM sim_decisiones WHERE simulacion_id = $1`, [restaurada.id]);
  console.log(`\n=== DECISIONES ===`);
  console.log(`  Original:   ${decsOrig.rows[0].total} registros`);
  console.log(`  Restaurada: ${decsRest.rows[0].total} registros`);

  // 5. Sesiones activas
  const sesOrig = await pool.query(`SELECT COUNT(*) as total FROM sesiones WHERE simulacion_id = $1 AND expires_at > NOW()`, [original.id]);
  const sesRest = await pool.query(`SELECT COUNT(*) as total FROM sesiones WHERE simulacion_id = $1 AND expires_at > NOW()`, [restaurada.id]);
  console.log(`\n=== SESIONES ACTIVAS ===`);
  console.log(`  Original:   ${sesOrig.rows[0].total}`);
  console.log(`  Restaurada: ${sesRest.rows[0].total}`);

  // Veredicto
  console.log('\n=== VEREDICTO ===');
  if (idsComunes.length > 0) {
    console.log('⚠️  PROBLEMA: Los equipos comparten IDs entre simulaciones.');
    console.log('   Riesgo: findEquipoByNombre puede apuntar a la sim incorrecta.');
  } else {
    console.log('✅ Las simulaciones son independientes en IDs y datos.');
  }

  await pool.end();
}
run().catch(e => { console.error('ERROR:', e.message); pool.end(); });
