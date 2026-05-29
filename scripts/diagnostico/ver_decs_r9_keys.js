process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id, users FROM simulaciones WHERE estado='activa' LIMIT 1");
  const { id: simId, users: equipos } = sim.rows[0];

  const r9 = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [simId]
  );
  const decs = r9.rows[0]?.resultados?.decisiones || {};
  
  console.log(`\nClaves en decisiones R9: ${Object.keys(decs).length}`);
  Object.keys(decs).forEach(k => {
    const d = decs[k];
    console.log(`  "${k}" → caja=${d.cajaInicial} vend=${d.vendedoresIniciales}`);
  });

  console.log('\nIDs de equipos:');
  equipos.filter(e => !e.isBot).forEach(e => console.log(`  "${e.id}" → ${e.nombre}`));
  
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
