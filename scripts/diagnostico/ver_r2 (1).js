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
    const resObj = res?.resultados || res || {};
    
    // Contar productos de Raíz
    const raizKeys = Object.keys(resObj).filter(k => k.includes('raz'));
    console.log('Productos de Raíz en R2:', raizKeys.length);
    raizKeys.forEach(k => {
      const r = resObj[k];
      console.log(' ', k);
      console.log('   cxcFinal:', r.cxcFinal);
      console.log('   invFinalValorizado:', r.invFinalValorizado);
      console.log('   ventasReales:', r.ventasReales);
      console.log('   cajaFinal:', r.cajaFinal);
    });
    
    // Suma de cxcFinal de todos los productos de Raíz
    const sumaCxc = raizKeys.reduce((s,k) => s+(resObj[k].cxcFinal||0), 0);
    const sumaInv = raizKeys.reduce((s,k) => s+(resObj[k].invFinalValorizado||0), 0);
    console.log('\nSuma cxcFinal todos productos Raíz:', sumaCxc);
    console.log('Suma invFinal todos productos Raíz:', sumaInv);
    console.log('Pantalla muestra CxC:', 303971, '| diff:', 303971-sumaCxc);
    console.log('Pantalla muestra inv:', 227811, '| diff:', 227811-sumaInv);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
