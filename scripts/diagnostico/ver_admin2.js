process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  // Buscar la ronda más reciente con resultados
  const r = await pool.query(
    "SELECT numero, estado, resultados FROM sim_rondas ORDER BY numero DESC LIMIT 3"
  );
  console.log(`\nRondas encontradas: ${r.rows.length}`);

  for (const row of r.rows) {
    const res = row.resultados || {};
    const resSub = res.resultados || res;
    const keys = Object.keys(resSub);
    console.log(`\nRonda ${row.numero} | ${row.estado} | ${keys.length} entradas`);
    keys.slice(0,3).forEach(k => {
      const v = resSub[k];
      if (typeof v === 'object' && v) {
        console.log(`  clave="${k}"`);
        console.log(`    equipo         = ${v.equipo}`);
        console.log(`    equipoOriginal = ${v.equipoOriginal}`);
        console.log(`    equipoNombre   = ${v.equipoNombre}`);
        console.log(`    productoId     = ${v.productoId}`);
      }
    });
  }
  await pool.end();
}
main().catch(e => {
  console.error('ERROR DETALLE:', e.message);
  console.error(e.stack);
  process.exit(1);
});
