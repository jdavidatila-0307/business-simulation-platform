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
      `SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=3`,
      ['sim_mpi8g7y5']
    );
    const res = r.rows[0]?.resultados;
    const resObj = res?.resultados || {};
    const raizKeys = Object.keys(resObj).filter(k => k.includes('raz'));
    console.log('Productos Raíz R3:', raizKeys.length);
    let sumaInvFinal = 0;
    raizKeys.forEach((k,i) => {
      const p = resObj[k];
      console.log(`prod_${i+1}: invInicial=${p.inventarioInicial} invFinal=${p.inventarioFinal} produccion=${p.produccion} ventas=${p.ventasReales} invValor=${p.invFinalValorizado}`);
      sumaInvFinal += (p.inventarioFinal||0);
    });
    console.log('SUMA invFinal todos productos:', sumaInvFinal);
    console.log('invFinalValorizado prod_1:', resObj[raizKeys[0]]?.invFinalValorizado);
    console.log('totalActivos prod_1:', resObj[raizKeys[0]]?.totalActivos);
    console.log('DESCUADRE prod_1:', (resObj[raizKeys[0]]?.totalActivos||0)-(resObj[raizKeys[0]]?.totalPasivos||0)-(resObj[raizKeys[0]]?.patrimonio||0));
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
