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
    
    console.log('Total claves en resultados:', Object.keys(resObj).length);
    
    // Productos de Raíz
    const raizKeys = Object.keys(resObj).filter(k => k.includes('raz'));
    console.log('\nProductos de Raíz:', raizKeys.length);
    raizKeys.forEach(k => {
      const eq = resObj[k];
      console.log('\n  Clave:', k);
      console.log('  cxcFinal:', eq.cxcFinal);
      console.log('  invFinalValorizado:', eq.invFinalValorizado);
      console.log('  totalActivos:', eq.totalActivos);
      console.log('  cajaFinal:', eq.cajaFinal);
      console.log('  ventasReales:', eq.ventasReales);
    });

    const sumaCxc = raizKeys.reduce((s,k) => s+(resObj[k].cxcFinal||0), 0);
    const sumaInv = raizKeys.reduce((s,k) => s+(resObj[k].invFinalValorizado||0), 0);
    console.log('\nSUMA cxcFinal Raíz:', sumaCxc, '← pantalla:', 303971);
    console.log('SUMA invFinal Raíz:', sumaInv, '← pantalla:', 227811);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
