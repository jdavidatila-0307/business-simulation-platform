process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT resultados FROM sim_rondas ORDER BY creada_at DESC LIMIT 1');
  const res = r.rows[0]?.resultados;
  const pre = res?.preSimulacion || {};
  console.log('\n=== PRESIMULACION — entradas ===');
  console.log('Total entradas:', Object.keys(pre).length);
  Object.entries(pre).forEach(([k,v]) => {
    console.log(`\n  Key: ${k}`);
    console.log(`  equipo:         ${v.equipo}`);
    console.log(`  equipoOriginal: ${v.equipoOriginal}`);
    console.log(`  equipoNombre:   ${v.equipoNombre || '(vacío)'}`);
    console.log(`  producto:       ${v.producto}`);
    console.log(`  ventasEstimadas:${v.ventasEstimadas}`);
    console.log(`  shareEstimado:  ${v.shareEstimado}`);
  });
  await pool.end();
}
main().catch(e => console.error(e.message));
