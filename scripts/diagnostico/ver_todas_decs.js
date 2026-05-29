process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const r9 = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [sim.rows[0].id]
  );
  const r = r9.rows[0]?.resultados || {};
  const decs = r.decisiones || {};
  console.log(`\nClaves en decisiones: ${Object.keys(decs).length}`);
  Object.keys(decs).forEach(k => console.log(`  "${k}"`));
  console.log(`\nOtras claves en resultados:`);
  Object.keys(r).filter(k => k !== 'decisiones').forEach(k => 
    console.log(`  "${k}": ${typeof r[k]}`)
  );
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
