const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
async function main() {
  const client = await pool.connect();
  try {
    // Ver todas las decisiones de R3
    const r = await client.query(
      `SELECT equipo_id, decisiones FROM sim_decisiones 
       WHERE simulacion_id=$1 AND ronda_numero=3`,
      ['sim_mpi8g7y5']
    );
    console.log('Total decisiones R3:', r.rows.length);
    r.rows.forEach(row => {
      const d = row.decisiones;
      console.log('\nequipo_id:', row.equipo_id);
      console.log('  equipo:', d?.equipo);
      console.log('  keys:', Object.keys(d||{}).slice(0,8));
      console.log('  productos:', d?.productos?.length);
      console.log('  produccion:', d?.produccion);
      console.log('  precioVenta:', d?.precioVenta);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
