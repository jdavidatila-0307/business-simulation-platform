/**
 * fix_capital_contable.js
 * Corrige capitalContable de Bs 480.000 a Bs 680.000 en la simulación activa
 * Ejecutar: node fix_capital_contable.js
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
    // Ver valores actuales
    const check = await client.query(
      "SELECT nombre, parametros->>'capitalInicial' as ci, parametros->>'capitalContable' as cc FROM simulaciones WHERE id=$1",
      [SIM_ID]
    );
    console.log('Simulación:', check.rows[0].nombre);
    console.log('capitalInicial actual:', check.rows[0].ci);
    console.log('capitalContable actual:', check.rows[0].cc);

    // Actualizar ambos campos a 680.000
    await client.query(
      `UPDATE simulaciones
       SET parametros = parametros
         || '{"capitalContable": 680000}'::jsonb
         || '{"capitalInicial": 680000}'::jsonb
       WHERE id = $1`,
      [SIM_ID]
    );

    // Verificar
    const verify = await client.query(
      "SELECT parametros->>'capitalInicial' as ci, parametros->>'capitalContable' as cc FROM simulaciones WHERE id=$1",
      [SIM_ID]
    );
    console.log('\n✅ capitalInicial actualizado:', verify.rows[0].ci);
    console.log('✅ capitalContable actualizado:', verify.rows[0].cc);
    console.log('\n⚠️  Ejecuta el recalculador desde el panel Admin');

  } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
