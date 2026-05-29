/**
 * fix_pct_materia_prima.js
 * Agrega pctMateriaPrima=0.40 a la columna parametros de la simulación
 * Ejecutar: node fix_pct_materia_prima.js
 */
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});

const SIM_ID = 'sim_mpi8g7y5';

async function main() {
  const client = await pool.connect();
  try {
    // Verificar simulación
    const check = await client.query(
      "SELECT nombre, parametros FROM simulaciones WHERE id=$1", [SIM_ID]
    );
    if (!check.rows.length) { console.error('Simulación no encontrada'); process.exit(1); }
    console.log('✅ Simulación:', check.rows[0].nombre);

    const paramsActuales = check.rows[0].parametros || {};
    console.log('pctMateriaPrima actual:', paramsActuales.pctMateriaPrima ?? 'no definido');

    // Agregar pctMateriaPrima a la columna parametros
    await client.query(
      `UPDATE simulaciones
       SET parametros = jsonb_set(
         COALESCE(parametros, '{}'),
         '{pctMateriaPrima}',
         '0.40'::jsonb,
         true
       )
       WHERE id = $1`,
      [SIM_ID]
    );

    // Verificar
    const verify = await client.query(
      "SELECT parametros->>'pctMateriaPrima' as pct FROM simulaciones WHERE id=$1",
      [SIM_ID]
    );
    console.log('✅ pctMateriaPrima actualizado:', verify.rows[0].pct);
    console.log('\n✅ LISTO — ahora ejecuta el recalculador desde el panel Admin');

  } finally { client.release(); await pool.end(); }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
