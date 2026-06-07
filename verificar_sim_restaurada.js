const { Pool } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // Buscar la sim restaurada más reciente
  const sims = await pool.query(`SELECT id, nombre, estado, config, users, codigo_acceso
    FROM simulaciones WHERE nombre ILIKE '%restaurado%' ORDER BY creada_at DESC LIMIT 1`);
  
  if (!sims.rowCount) { console.log('❌ No hay simulación restaurada'); await pool.end(); return; }
  const sim = sims.rows[0];
  console.log(`\n✅ Simulación: [${sim.id}] ${sim.nombre}`);
  console.log(`   Estado: ${sim.estado} | Código: ${sim.codigo_acceso}`);
  console.log(`   Config: ronda=${sim.config?.currentRound} | roundState=${sim.config?.roundState}`);

  // 1. Verificar equipos en sim.users
  const users = sim.users || [];
  console.log(`\n=== EQUIPOS (${users.length}) ===`);
  users.forEach(u => {
    console.log(`  [${u.id}]`);
    console.log(`    nombre:   ${u.nombre}`);
    console.log(`    password: ${u.password ? '✅' : '❌ VACÍO'}`);
    console.log(`    clave:    ${u.clave || u.passwordPlain || '—'}`);
  });

  // 2. Verificar rondas
  const rondas = await pool.query(`SELECT numero, estado FROM sim_rondas 
    WHERE simulacion_id = $1 ORDER BY numero`, [sim.id]);
  console.log(`\n=== RONDAS (${rondas.rowCount}) ===`);
  rondas.rows.forEach(r => console.log(`  T${r.numero}: ${r.estado}`));

  // 3. Verificar decisiones
  const decs = await pool.query(`SELECT COUNT(*) as total FROM sim_decisiones 
    WHERE simulacion_id = $1`, [sim.id]);
  console.log(`\n=== DECISIONES: ${decs.rows[0].total} registros ===`);

  // 4. Verificar que findEquipoByNombre encontrará estos equipos
  console.log('\n=== VERIFICACIÓN LOGIN ===');
  users.forEach(u => {
    const ok = u.password && u.nombre;
    console.log(`  ${ok ? '✅' : '❌'} ${u.nombre} — puede iniciar sesión: ${ok ? 'SÍ' : 'NO (falta password o nombre)'}`);
  });

  await pool.end();
}
run().catch(e => { console.error('ERROR:', e.message); pool.end(); });
