process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const simId = sim.rows[0].id;

  // Ver sim_decisiones directamente
  const decs = await pool.query(
    "SELECT equipo_id, producto_id, decisiones FROM sim_decisiones WHERE simulacion_id=$1 AND ronda_numero=9",
    [simId]
  );
  console.log(`\nsim_decisiones R9: ${decs.rows.length} registros`);
  decs.rows.forEach(d => {
    console.log(`  equipo: ${d.equipo_id.slice(-20)} prod: ${d.producto_id}`);
    console.log(`    cajaInicial: ${d.decisiones?.cajaInicial}`);
    console.log(`    vendedores:  ${d.decisiones?.vendedoresIniciales}`);
    console.log(`    operarios:   ${d.decisiones?.operariosIniciales}`);
  });

  // Ver sim_rondas directamente
  const r9 = await pool.query(
    "SELECT estado, resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [simId]
  );
  console.log(`\nsim_rondas R9: ${r9.rows.length} registros`);
  if (r9.rows[0]) {
    console.log(`  estado: ${r9.rows[0].estado}`);
    console.log(`  resultados keys: ${Object.keys(r9.rows[0].resultados || {}).join(', ')}`);
  }

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
