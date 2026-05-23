process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  console.log('\n── Corrigiendo decisiones Ronda 0 → Ronda 1 ────');

  // 1. Borrar las decisiones vacías de Ronda 1
  const del = await pool.query(
    "DELETE FROM sim_decisiones WHERE ronda_numero = 1"
  );
  console.log(`  ✅ Decisiones vacías de Ronda 1 eliminadas: ${del.rowCount}`);

  // 2. Mover decisiones de Ronda 0 → Ronda 1
  const upd = await pool.query(
    "UPDATE sim_decisiones SET ronda_numero = 1 WHERE ronda_numero = 0"
  );
  console.log(`  ✅ Decisiones movidas de Ronda 0 a Ronda 1: ${upd.rowCount}`);

  // 3. Verificar estado final
  console.log('\n── Estado final ──────────────────────────────');
  const decs = await pool.query(
    'SELECT equipo_id, ronda_numero, decisiones FROM sim_decisiones ORDER BY ronda_numero, equipo_id'
  );
  decs.rows.forEach(d => {
    const dec = d.decisiones || {};
    console.log(`  Ronda ${d.ronda_numero} | ${d.equipo_id.slice(-8)} | producto: ${dec.producto || '(vacío)'} | precio: ${dec.precioVenta || '?'}`);
  });

  await pool.end();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
