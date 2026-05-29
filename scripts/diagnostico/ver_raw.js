process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT * FROM sim_rondas ORDER BY creada_at DESC LIMIT 1');
  const ronda = r.rows[0];
  console.log('\n=== RONDA RAW ===');
  console.log('numero:', ronda.numero);
  console.log('estado:', ronda.estado);
  console.log('simulacion_id:', ronda.simulacion_id);

  console.log('\n=== RESULTADOS (estructura real) ===');
  const res = ronda.resultados;
  if (!res) { console.log('resultados: NULL'); }
  else {
    console.log('tipo:', typeof res);
    console.log('keys:', Object.keys(res));
    // Mostrar primer elemento
    const primerKey = Object.keys(res)[0];
    if (primerKey) {
      console.log('\nPrimer elemento (key:', primerKey, '):');
      console.log(JSON.stringify(res[primerKey], null, 2).slice(0, 800));
    }
  }

  // Ver también columnas disponibles
  console.log('\n=== COLUMNAS DE sim_rondas ===');
  console.log(Object.keys(ronda).join(', '));

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
