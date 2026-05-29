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

    let sumaGastosOp=0, sumaAdmin=0, sumaPlanta=0, sumaDepre=0;
    raizKeys.forEach((k,i) => {
      const p = resObj[k];
      console.log(`prod_${i+1}: gastosOp=${p.gastosOp} admin=${p.gastoAdminFijo} planta=${p.gastoFijoPlanta} depre=${p.gastoDepreciacion??p.depreciacion??'?'}`);
      sumaGastosOp += p.gastosOp||0;
      sumaAdmin    += p.gastoAdminFijo||0;
      sumaPlanta   += p.gastoFijoPlanta||0;
    });
    console.log('\nSUMA gastosOp:', sumaGastosOp);
    console.log('SUMA admin:', sumaAdmin, '← debería ser 55.000');
    console.log('SUMA planta:', sumaPlanta, '← debería ser 15.000');
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
