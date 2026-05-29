const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});
async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query('SELECT parametros FROM simulaciones WHERE id=$1', ['sim_mpi8g7y5']);
    const p = r.rows[0]?.parametros;
    console.log('costoAlmacenamientoUnidad:', p?.costoAlmacenamientoUnidad);
    console.log('pctVentasContado:', p?.pctVentasContado);
    console.log('pctVentasCredito:', p?.pctVentasCredito);
    console.log('plazoCobro:', p?.plazoCobro);
    console.log('gastoAdminFijo:', p?.gastoAdminFijo);
    console.log('gastoFijoPlanta:', p?.gastoFijoPlanta);
    console.log('depreciacionTrimestral:', p?.depreciacionTrimestral);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
