process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  DIAGNÓSTICO COMPLETO DE BASE DE DATOS');
  console.log('══════════════════════════════════════════\n');

  // 1. Tablas y conteos
  console.log('── TABLAS ──────────────────────────────');
  for (const t of ['usuarios','simulaciones','sim_rondas','sim_decisiones','sesiones']) {
    try {
      const r = await pool.query(`SELECT COUNT(*) as n FROM ${t}`);
      console.log(`  ${t.padEnd(20)}: ${r.rows[0].n} registros`);
    } catch(e) { console.log(`  ${t.padEnd(20)}: ❌ ${e.message}`); }
  }

  // 2. Usuarios
  console.log('\n── USUARIOS ────────────────────────────');
  const users = await pool.query('SELECT id, nombre, rol FROM usuarios');
  users.rows.forEach(u => console.log(`  ${u.rol.padEnd(12)} | ${u.id.padEnd(20)} | ${u.nombre}`));

  // 3. Simulaciones
  console.log('\n── SIMULACIONES ────────────────────────');
  const sims = await pool.query('SELECT id, nombre, estado, config FROM simulaciones');
  sims.rows.forEach(s => {
    console.log(`  ${s.nombre} [${s.estado}]`);
    console.log(`    ID:           ${s.id}`);
    console.log(`    currentRound: ${s.config?.currentRound}`);
    console.log(`    roundState:   ${s.config?.roundState}`);
    console.log(`    totalRounds:  ${s.config?.totalRounds}`);
    console.log(`    industria:    ${s.config?.industria}`);
  });

  // 4. Equipos (en simulaciones.users)
  console.log('\n── EQUIPOS ─────────────────────────────');
  const eqSims = await pool.query('SELECT nombre, users FROM simulaciones');
  eqSims.rows.forEach(s => {
    const users = s.users || [];
    console.log(`  Simulación: ${s.nombre} (${users.length} equipos)`);
    users.forEach(u => console.log(`    [${u.nombre}] id=${u.id?.slice(0,20)} | pass=${u.passwordPlain || '(hash)'}`));
  });

  // 5. Rondas
  console.log('\n── RONDAS ──────────────────────────────');
  const rondas = await pool.query(
    'SELECT simulacion_id, numero, estado, creada_at, calculada_at FROM sim_rondas ORDER BY numero'
  );
  rondas.rows.forEach(r => {
    console.log(`  Ronda ${r.numero} | estado=${r.estado}`);
    console.log(`    creada:    ${r.creada_at?.toISOString().slice(0,19)}`);
    console.log(`    calculada: ${r.calculada_at?.toISOString().slice(0,19) || '(pendiente)'}`);
  });

  // 6. Decisiones
  console.log('\n── DECISIONES ──────────────────────────');
  const decs = await pool.query(
    'SELECT equipo_id, ronda_numero, enviada_at FROM sim_decisiones ORDER BY ronda_numero, equipo_id'
  );
  if (!decs.rows.length) {
    console.log('  (sin decisiones guardadas)');
  } else {
    decs.rows.forEach(d =>
      console.log(`  Ronda ${d.ronda_numero} | Equipo: ${d.equipo_id?.slice(0,25)} | enviada: ${d.enviada_at?.toISOString().slice(0,19)}`)
    );
  }

  // 7. Sesiones activas
  console.log('\n── SESIONES ACTIVAS ────────────────────');
  try {
    const ses = await pool.query('SELECT user_id, created_at FROM sesiones ORDER BY created_at DESC LIMIT 5');
    if (!ses.rows.length) console.log('  (ninguna)');
    ses.rows.forEach(s => console.log(`  ${s.user_id?.slice(0,25)} | ${s.created_at?.toISOString().slice(0,19)}`));
  } catch(e) { console.log('  tabla sesiones:', e.message); }

  // 8. Integridad: ¿hay decisiones huérfanas?
  console.log('\n── INTEGRIDAD ──────────────────────────');
  const huerfanas = await pool.query(`
    SELECT d.id FROM sim_decisiones d
    LEFT JOIN sim_rondas r ON r.simulacion_id = d.simulacion_id AND r.numero = d.ronda_numero
    WHERE r.id IS NULL
  `);
  console.log(`  Decisiones huérfanas (sin ronda): ${huerfanas.rows.length}`);

  const rondasSinSim = await pool.query(`
    SELECT r.id FROM sim_rondas r
    LEFT JOIN simulaciones s ON s.id = r.simulacion_id
    WHERE s.id IS NULL
  `);
  console.log(`  Rondas huérfanas (sin simulación): ${rondasSinSim.rows.length}`);

  console.log('\n══════════════════════════════════════════');
  console.log('✅ Diagnóstico completado');
  console.log('══════════════════════════════════════════\n');

  await pool.end();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
