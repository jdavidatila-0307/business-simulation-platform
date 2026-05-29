const { Pool } = require('pg');

// Intentar con diferentes configuraciones de conexión
const configs = [
  {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 10000,
  }
];

const RONDA = parseInt(process.argv[2]) || 3;
const EQUIPO = process.argv[3] || 'raz';

async function tryConnect(config) {
  const pool = new Pool(config);
  try {
    const client = await pool.connect();
    console.log('Conectado OK');
    const r = await client.query(
      `SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2`,
      ['sim_mpi8g7y5', RONDA]
    );
    const res = r.rows[0]?.resultados;
    const resObj = res?.resultados || {};
    const keys = Object.keys(resObj).filter(k => k.includes(EQUIPO));
    if (!keys.length) { console.log('No encontrado. Claves:', Object.keys(resObj).slice(0,5)); client.release(); await pool.end(); return; }
    const p = resObj[keys[0]];
    console.log('=== R' + RONDA + ' ' + EQUIPO.toUpperCase() + ' ===');
    ['cajaInicial','cajaFinal','cxcFinal','invFinalValorizado','afNetos',
     'totalActivos','ivaAPagar','ivaAPagarAnterior','pagoIVAPeriodoAnterior',
     'totalPasivos','capitalContable','resultadoAcumulado','resultadoAcumuladoAnterior',
     'utilidadNeta','patrimonio','ventasReales','produccion','costoVentas',
     'gastosOp','ebit','ivaDebito','ivaCredito'].forEach(k => {
      if (p[k] !== undefined) console.log(k + ':', p[k]);
    });
    console.log('DESCUADRE:', (p.totalActivos||0) - (p.totalPasivos||0) - (p.patrimonio||0));
    client.release();
    await pool.end();
  } catch(e) {
    await pool.end().catch(()=>{});
    throw e;
  }
}

tryConnect(configs[0]).catch(async e => {
  console.error('ERROR config 1:', e.message);
  // Intentar con URL alternativa (transaction pooler puerto 6543)
  const altUrl = (process.env.DATABASE_URL||'').replace(':5432/', ':6543/');
  console.log('Intentando puerto 6543...');
  const pool2 = new Pool({
    connectionString: altUrl + '?pgbouncer=true',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
  });
  try {
    const client = await pool2.connect();
    console.log('Conectado con puerto 6543 OK');
    const r = await client.query(`SELECT 1 as test`);
    console.log('Query OK:', r.rows[0]);
    client.release();
    await pool2.end();
  } catch(e2) {
    console.error('ERROR config 2:', e2.message);
    await pool2.end().catch(()=>{});
  }
});
