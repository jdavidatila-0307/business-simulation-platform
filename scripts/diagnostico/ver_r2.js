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
    const raizKey = Object.keys(resObj).find(k => k.includes('raz'));
    if (!raizKey) { console.log('No encontró Raíz. Claves:', Object.keys(resObj)); return; }
    const r2 = resObj[raizKey];
    console.log('=== RAÍZ R2 ===');
    console.log('cajaInicial:', r2.cajaInicial);
    console.log('cajaFinal:', r2.cajaFinal);
    console.log('cxcFinal:', r2.cxcFinal);
    console.log('invFinalValorizado:', r2.invFinalValorizado);
    console.log('afNetos:', r2.afNetos);
    console.log('totalActivos:', r2.totalActivos);
    console.log('ivaAPagar:', r2.ivaAPagar);
    console.log('ivaAPagarAnterior:', r2.ivaAPagarAnterior);
    console.log('pagoIVAPeriodoAnterior:', r2.pagoIVAPeriodoAnterior);
    console.log('deudaFinal:', r2.deudaFinal);
    console.log('totalPasivos:', r2.totalPasivos);
    console.log('capitalContable:', r2.capitalContable);
    console.log('resultadoAcumulado:', r2.resultadoAcumulado);
    console.log('utilidadNeta:', r2.utilidadNeta);
    console.log('patrimonio:', r2.patrimonio);
    console.log('ventasReales:', r2.ventasReales);
    console.log('produccion:', r2.produccion);
    console.log('costoVentas:', r2.costoVentas);
    console.log('gastosOp:', r2.gastosOp);
    console.log('ebit:', r2.ebit);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
