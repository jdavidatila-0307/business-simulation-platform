const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});
async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT decisiones FROM sim_decisiones 
       WHERE simulacion_id=$1 AND ronda_numero=$2
       AND equipo_id LIKE '%raz%'`,
      ['sim_mpi8g7y5', 2]
    );
    console.log('Decisiones de Raíz en R2:', r.rows.length);
    r.rows.forEach((row, i) => {
      const d = row.decisiones;
      console.log('\nDecisión', i+1);
      console.log('  equipo:', d.equipo);
      console.log('  producto:', d.producto);
      console.log('  produccion:', d.produccion);
      console.log('  precioVenta:', d.precioVenta);
      console.log('  productos (array):', d.productos?.length);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
