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
      `SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=1`,
      ['sim_mpi8g7y5']
    );
    const res = r.rows[0]?.resultados;

    // Buscar en res.empresas
    const empresas = res?.empresas;
    console.log('Tipo empresas:', typeof empresas, Array.isArray(empresas));

    if (Array.isArray(empresas)) {
      const eq = empresas[0];
      console.log('Equipo:', eq.equipoNombre || eq.equipo);
      console.log('gastoPublicidad:', eq.gastoPublicidad);
      console.log('publicidad:', eq.publicidad);
      console.log('comisionesNeto:', eq.comisionesNeto);
      console.log('cajaFinal:', eq.cajaFinal);
      console.log('utilidadNeta:', eq.utilidadNeta);
      console.log('Claves:', Object.keys(eq).join(', '));
    } else if (typeof empresas === 'object') {
      const eqKey = Object.keys(empresas)[0];
      const eq = empresas[eqKey];
      console.log('Equipo key:', eqKey);
      console.log('gastoPublicidad:', eq.gastoPublicidad);
      console.log('publicidad:', eq.publicidad);
      console.log('comisionesNeto:', eq.comisionesNeto);
      console.log('cajaFinal:', eq.cajaFinal);
      console.log('utilidadNeta:', eq.utilidadNeta);
      console.log('Claves:', Object.keys(eq).join(', '));
    }

    // También verificar res.resultados
    console.log('\n--- res.resultados ---');
    const resArr = res?.resultados;
    console.log('Tipo:', typeof resArr, Array.isArray(resArr));
    if (resArr) {
      const keys = typeof resArr === 'object' ? Object.keys(resArr) : [];
      console.log('Claves:', keys.slice(0,5));
      if (keys.length > 0) {
        const eq2 = resArr[keys[0]];
        console.log('gastoPublicidad:', eq2?.gastoPublicidad);
        console.log('cajaFinal:', eq2?.cajaFinal);
      }
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
