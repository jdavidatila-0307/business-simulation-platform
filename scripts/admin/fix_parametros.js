/**
 * fix_parametros.js
 * Corrige parámetros faltantes o incorrectos en la BD
 * Ejecutar: node fix_parametros.js
 */
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});

const SIM_ID = 'sim_mpi8g7y5';

const FIXES = {
  costoInvestigacionEstrategico: 20000,  // faltaba
  capacidadMaxProduccion:        1760,   // era 1500, correcto 4×440=1760
};

async function main() {
  const client = await pool.connect();
  try {
    // Ver valores actuales
    const check = await client.query(
      `SELECT parametros->>'costoInvestigacionEstrategico' as est,
              parametros->>'capacidadMaxProduccion' as cap,
              parametros->>'activosFijosIniciales' as af
       FROM simulaciones WHERE id=$1`, [SIM_ID]
    );
    console.log('Valores actuales:');
    console.log('  costoInvestigacionEstrategico:', check.rows[0].est ?? 'NO EXISTE');
    console.log('  capacidadMaxProduccion:', check.rows[0].cap);
    console.log('  activosFijosIniciales:', check.rows[0].af);

    // Aplicar fixes
    let query = `UPDATE simulaciones SET parametros = parametros`;
    for (const [k, v] of Object.entries(FIXES)) {
      query += ` || '{"${k}": ${v}}'::jsonb`;
    }
    query += ` WHERE id = $1`;

    await client.query(query, [SIM_ID]);

    // Verificar
    const verify = await client.query(
      `SELECT parametros->>'costoInvestigacionEstrategico' as est,
              parametros->>'capacidadMaxProduccion' as cap
       FROM simulaciones WHERE id=$1`, [SIM_ID]
    );
    console.log('\n✅ Valores actualizados:');
    console.log('  costoInvestigacionEstrategico:', verify.rows[0].est);
    console.log('  capacidadMaxProduccion:', verify.rows[0].cap);
    console.log('\n✅ LISTO');

  } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
