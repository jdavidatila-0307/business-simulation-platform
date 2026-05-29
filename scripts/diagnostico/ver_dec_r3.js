const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT decisiones FROM sim_decisiones 
       WHERE simulacion_id=$1 AND ronda_numero=3 AND equipo_id LIKE '%raz%'
       LIMIT 1`, ['sim_mpi8g7y5']
    );
    const d = r.rows[0]?.decisiones;
    if (!d) { console.log('Sin decisiones R3 Raíz'); return; }
    console.log('equipo:', d.equipo);
    console.log('productos array:', d.productos?.length);
    console.log('inventarioInicial:', d.inventarioInicial);
    console.log('cajaInicial:', d.cajaInicial);
    if (d.productos) {
      d.productos.forEach((p,i) => {
        console.log(`prod[${i}]: id=${p.productoId} nom=${p.producto} prod=${p.produccion} precio=${p.precioVenta} invIni=${p.inventarioInicial}`);
      });
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
