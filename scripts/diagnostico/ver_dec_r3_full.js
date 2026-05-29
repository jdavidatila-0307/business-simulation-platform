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
       WHERE simulacion_id=$1 AND ronda_numero=3 
       AND equipo_id='eq_mpi8g7y5_raz_mpibm6wt'
       AND producto_id='prod_1'
       ORDER BY enviada_at DESC LIMIT 1`,
      ['sim_mpi8g7y5']
    );
    const d = r.rows[0]?.decisiones;
    console.log('=== DECISION RAZ R3 COMPLETA ===');
    console.log('equipo:', d?.equipo);
    console.log('cajaInicial:', d?.cajaInicial);
    console.log('inventarioInicial:', d?.inventarioInicial);
    console.log('productos count:', d?.productos?.length);
    if (d?.productos) {
      d.productos.forEach((p,i) => {
        console.log(`  prod[${i}]: id=${p.productoId} prod=${p.produccion} precio=${p.precioVenta} invIni=${p.inventarioInicial} caja=${p.cajaInicial}`);
      });
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
