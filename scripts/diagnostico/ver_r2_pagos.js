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
      `SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=2`,
      ['sim_mpi8g7y5']
    );
    const res = r.rows[0]?.resultados;
    const resObj = res?.resultados || {};
    const raizKeys = Object.keys(resObj).filter(k => k.includes('raz'));
    const p = resObj[raizKeys[0]];

    console.log('=== TODOS LOS PAGOS PROD_1 ===');
    const campos = ['pagoMP','pagoMPbruto','pagoComisiones','pagoMktTotal',
      'pagoOperarios','pagoCalidad','pagoIT','pagoIUE','pagoIVAPeriodoAnterior',
      'pagoAdmin','pagoPlanta','pagoInnovacion','pagoAlmacen',
      'pagoIntereses','pagoApertura','sobregiro','ingresoPrestamo','totalPagos'];
    let suma = 0;
    campos.forEach(c => {
      if (p[c] !== undefined && p[c] !== null) {
        console.log(c + ':', p[c]);
        if (c !== 'totalPagos' && c !== 'ingresoPrestamo') suma += p[c]||0;
      }
    });
    console.log('SUMA manual:', suma);
    console.log('totalPagos:', p.totalPagos);
    console.log('diff:', p.totalPagos - suma);
    console.log('');
    console.log('=== P&L PROD_1 ===');
    ['ventasBrutas','comisionesNeto','ventasNetas','costoVentas',
     'gastoPublicidad','gastoPromocion','gastoEventos','gastoMktRedes',
     'gastoRRPP','gastoCostoVend','gastoOperarios','gastoAdminFijo',
     'gastoPlantaFijo','gastoDepre','gastoAlmacen','gastoInnovacionNeto',
     'gastosOp','ebit','impuestoIT','utilidadNeta'].forEach(c => {
      if (p[c] !== undefined) console.log(c+':', p[c]);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
