process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const r9 = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [sim.rows[0].id]
  );
  const decs = r9.rows[0]?.resultados?.decisiones || {};
  console.log(`\nDecisiones R9: ${Object.keys(decs).length}`);
  Object.entries(decs).forEach(([k,d]) => {
    const eq = k.includes('raz') ? '← RAÍZ' : '';
    console.log(`\n  ${k.slice(-20)} ${eq}`);
    console.log(`    vendedoresIniciales: ${d.vendedoresIniciales}`);
    console.log(`    operariosIniciales:  ${d.operariosIniciales}`);
    console.log(`    cajaInicial:         ${d.cajaInicial}`);
    console.log(`    deudaInicial:        ${d.deudaInicial}`);
  });
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
