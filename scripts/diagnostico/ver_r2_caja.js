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
    const p1 = resObj[raizKeys[0]];

    console.log('=== PROD_1 — FLUJO DE CAJA ===');
    console.log('cajaInicial:', p1.cajaInicial);
    console.log('cobrosContado:', p1.cobrosContado);
    console.log('totalPagos:', p1.totalPagos);
    console.log('pagoIVAPeriodoAnterior:', p1.pagoIVAPeriodoAnterior);
    console.log('pagoMP:', p1.pagoMPbruto);
    console.log('pagoComisiones:', p1.pagoComisiones);
    console.log('pagoMktTotal:', p1.pagoMktTotal);
    console.log('pagoOperarios:', p1.pagoOperarios);
    console.log('pagoCalidad:', p1.pagoCalidad);
    console.log('pagoIT:', p1.pagoIT);
    console.log('cajaFinal:', p1.cajaFinal);
    console.log('');
    console.log('=== VERIFICACIÓN PARTIDA DOBLE ===');
    const cajaCalc = (p1.cajaInicial||0) + (p1.cobrosContado||0) - (p1.totalPagos||0);
    console.log('cajaInicial + cobros - pagos:', cajaCalc);
    console.log('cajaFinal engine:', p1.cajaFinal);
    console.log('Diferencia:', cajaCalc - p1.cajaFinal);
    console.log('');
    console.log('=== BALANCE ===');
    console.log('totalActivos:', p1.totalActivos);
    console.log('totalPasivos:', p1.totalPasivos);
    console.log('patrimonio:', p1.patrimonio);
    console.log('DESCUADRE:', p1.totalActivos - p1.totalPasivos - p1.patrimonio);
    console.log('');
    console.log('=== IVA ===');
    console.log('ivaDebito:', p1.ivaDebito);
    console.log('ivaCredito:', p1.ivaCredito);
    console.log('ivaAPagar:', p1.ivaAPagar);
    console.log('resultadoAcumuladoAnterior (en dec):', p1.resultadoAcumuladoAnterior);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
