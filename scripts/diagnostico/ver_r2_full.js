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

    console.log('=== PROD_1 BALANCE COMPLETO ===');
    console.log('caja:', p1.cajaFinal);
    console.log('cxcFinal:', p1.cxcFinal);
    console.log('cxcNuevo:', p1.cxcNuevo);
    console.log('cxcInicial:', p1.cxcInicial);
    console.log('cxcCobroEsta:', p1.cxcCobroEsta);
    console.log('invFinalValorizado:', p1.invFinalValorizado);
    console.log('afNetos:', p1.afNetos);
    console.log('totalActivos engine:', p1.totalActivos);
    console.log('suma manual:', p1.cajaFinal+p1.cxcFinal+p1.invFinalValorizado+p1.afNetos);
    console.log('');
    console.log('=== PATRIMONIO ===');
    console.log('capitalContable:', p1.capitalContable);
    console.log('resultadoAcumulado:', p1.resultadoAcumulado);
    console.log('utilidadNeta:', p1.utilidadNeta);
    console.log('resultadoAcumuladoAnterior:', p1.resultadoAcumuladoAnterior);
    console.log('patrimonio engine:', p1.patrimonio);
    console.log('patrimonio manual:', p1.capitalContable + p1.resultadoAcumulado);
    console.log('');
    console.log('=== DESCUADRE DETALLADO ===');
    console.log('totalActivos:', p1.totalActivos);
    console.log('ivaAPagar:', p1.ivaAPagar);
    console.log('patrimonio:', p1.patrimonio);
    console.log('DESCUADRE:', p1.totalActivos - p1.ivaAPagar - p1.patrimonio);
    console.log('');
    console.log('=== ¿QUÉ FALTA EN PASIVOS? ===');
    const faltante = p1.totalActivos - p1.ivaAPagar - p1.patrimonio;
    console.log('Pasivo faltante:', faltante);
    console.log('ivaCredito:', p1.ivaCredito);
    console.log('ivaDebito:', p1.ivaDebito);
    console.log('saldoIUEfinal:', p1.saldoIUEfinal);
    console.log('sobregiro:', p1.sobregiro);
    console.log('deudaFinal:', p1.deudaFinal);
    console.log('totalPagos:', p1.totalPagos);
    console.log('cobrosContado:', p1.cobrosContado);
    console.log('ventasBrutas:', p1.ventasBrutas);
    console.log('ventasNetas:', p1.ventasNetas);
    console.log('costoVentas:', p1.costoVentas);
    console.log('gastosOp:', p1.gastosOp);
    console.log('ebit:', p1.ebit);
    console.log('impuestoIT:', p1.impuestoIT);
    console.log('totalFacturado:', p1.totalFacturado);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
