const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
async function main() {
  const client = await pool.connect();
  try {
    // Leer del JSONB legacy en tabla simulaciones
    const r = await client.query(
      `SELECT rondas->'3'->'resultados'->'resultados' as res
       FROM simulaciones WHERE id=$1`,
      ['sim_mpi8g7y5']
    );
    const resObj = r.rows[0]?.res || {};
    const razKey = Object.keys(resObj).find(k => k.includes('raz'));
    if (!razKey) { console.log('No encontrado en legacy'); return; }
    const p = resObj[razKey];
    console.log('=== LEGACY R3 RAZ ===');
    console.log('inventarioFinal:', p.inventarioFinal);
    console.log('invFinalValorizado:', p.invFinalValorizado);
    console.log('totalActivos:', p.totalActivos);
    console.log('DESCUADRE:', (p.totalActivos||0)-(p.totalPasivos||0)-(p.patrimonio||0));
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
