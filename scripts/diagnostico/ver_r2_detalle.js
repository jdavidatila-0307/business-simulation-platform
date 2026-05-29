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

    console.log('=== RAÍZ R2 — TODOS LOS PRODUCTOS ===');
    let sumaUtil=0, sumaResultAcum=0, sumaIva=0;
    raizKeys.forEach((k,i) => {
      const p = resObj[k];
      console.log(`\nprod_${i+1}:`);
      console.log('  utilidadNeta:', p.utilidadNeta);
      console.log('  resultadoAcumulado:', p.resultadoAcumulado);
      console.log('  resultadoAcumuladoAnterior:', p.resultadoAcumuladoAnterior);
      console.log('  ivaAPagar:', p.ivaAPagar);
      console.log('  ivaAPagarAnterior:', p.ivaAPagarAnterior);
      console.log('  gastoAdminFijo:', p.gastoAdminFijo);
      console.log('  gastoFijoPlanta:', p.gastoFijoPlanta);
      console.log('  costoOperarios:', p.costoOperarios);
      sumaUtil += p.utilidadNeta||0;
      sumaResultAcum += p.resultadoAcumulado||0;
      sumaIva += p.ivaAPagar||0;
    });
    console.log('\n=== SUMAS ===');
    console.log('sumaUtilNeta:', sumaUtil);
    console.log('sumaResultAcum:', sumaResultAcum);
    console.log('sumaIvaAPagar:', sumaIva);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
