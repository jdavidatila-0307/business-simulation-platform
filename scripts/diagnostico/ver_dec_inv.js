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
      `SELECT decisiones FROM sim_decisiones 
       WHERE simulacion_id=$1 AND ronda_numero=2 AND equipo_id LIKE '%raz%'
       LIMIT 1`, ['sim_mpi8g7y5']
    );
    const d = r.rows[0]?.decisiones;
    console.log('tipoInvestigacion:', d.tipoInvestigacion);
    console.log('innovacion:', d.innovacion);
    console.log('montoInnovacion:', d.montoInnovacion);
    console.log('publicidad:', d.publicidad);
    console.log('promocion:', d.promocion);
    console.log('eventos:', d.eventos);
    console.log('marketingRedes:', d.marketingRedes);
    console.log('relacionesPublicas:', d.relacionesPublicas);
    // Suma bruto mkt
    const mktBruto = (d.publicidad||0)+(d.promocion||0)+(d.eventos||0)+(d.marketingRedes||0)+(d.relacionesPublicas||0);
    console.log('mktBruto suma:', mktBruto);
    console.log('vendedores:', d.vendedoresIniciales, 'contratar:', d.contratarVendedores, 'despedir:', d.despedirVendedores);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
