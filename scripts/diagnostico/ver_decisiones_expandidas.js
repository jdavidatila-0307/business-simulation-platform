const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});
async function main() {
  const client = await pool.connect();
  try {
    const simR = await client.query(`SELECT * FROM simulaciones WHERE id=$1`, ['sim_mpi8g7y5']);
    const sim  = simR.rows[0];
    const decR = await client.query(
      `SELECT decisiones FROM sim_decisiones 
       WHERE simulacion_id=$1 AND ronda_numero=2 AND equipo_id LIKE '%raz%'
       LIMIT 1`, ['sim_mpi8g7y5']
    );
    const dec = decR.rows[0]?.decisiones;
    console.log('equipo:', dec.equipo);
    console.log('productos array length:', dec.productos?.length);
    if (dec.productos) {
      dec.productos.forEach((p,i) => {
        console.log(`  prod[${i}]: productoId=${p.productoId} producto=${p.producto} produccion=${p.produccion}`);
      });
    }

    // Simular expandirDecisionesMultiproducto
    const engine = require('./src/engine.js');
    // No podemos llamar directamente pero verificamos los campos
    console.log('\nproductoId en decisión principal:', dec.productoId);
    console.log('resultadoAcumuladoAnterior:', dec.resultadoAcumuladoAnterior);
    console.log('ivaAPagarAnterior:', dec.ivaAPagarAnterior);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
