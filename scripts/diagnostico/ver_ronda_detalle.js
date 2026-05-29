const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
const RONDA = parseInt(process.argv[2]) || 3;
const EQUIPO = process.argv[3] || 'raz';

async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2`,
      ['sim_mpi8g7y5', RONDA]
    );
    const res = r.rows[0]?.resultados;
    const resObj = res?.resultados || {};
    const keys = Object.keys(resObj).filter(k => k.includes(EQUIPO));
    const p = resObj[keys[0]];

    console.log('=== COSTOS Y PRODUCCION ===');
    ['costoMPunitario','costoMPporPar','cuVar','cuVarMP','cuVarCalid',
     'costoUnitario','produccion','ventasReales','inventarioInicial',
     'inventarioFinal','invFinalValorizado','costoVentas',
     'pagoMPbruto','pagoCalidad','pagoOperarios'].forEach(k => {
      if (p[k] !== undefined) console.log(k+':', p[k]);
    });

    console.log('\n=== PROPAGACION ===');
    ['cajaInicial','cxcInicial','inventarioInicial',
     'resultadoAcumuladoAnterior','ivaAPagarAnterior',
     'activosFijosIniciales'].forEach(k => {
      console.log(k+':', p[k]);
    });

    console.log('\n=== BALANCE ===');
    console.log('totalActivos:', p.totalActivos);
    console.log('totalPasivos:', p.totalPasivos);
    console.log('patrimonio:', p.patrimonio);
    console.log('DESCUADRE:', (p.totalActivos||0)-(p.totalPasivos||0)-(p.patrimonio||0));

    // Verificar: inv + caja + cxc + af = totalActivos?
    const sumA = (p.cajaFinal||0)+(p.cxcFinal||0)+(p.invFinalValorizado||0)+(p.afNetos||0);
    console.log('suma manual activos:', sumA, '=? totalActivos:', p.totalActivos);
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
