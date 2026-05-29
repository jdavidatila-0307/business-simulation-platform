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
    for (let i = 0; i < 3; i++) {
      try {
        const r = await client.query(
          `SELECT parametros->>'capitalContable' as cc FROM simulaciones WHERE id=$1`, [SIM_ID]
        );
        console.log('Capital actual:', r.rows[0].cc);
        await client.query(
          `UPDATE simulaciones SET parametros = parametros
           || '{"capitalContable":456000}'::jsonb
           || '{"capitalInicial":456000}'::jsonb
           WHERE id=$1`, [SIM_ID]
        );
        const v = await client.query(
          `SELECT parametros->>'capitalContable' as cc FROM simulaciones WHERE id=$1`, [SIM_ID]
        );
        console.log('✅ Capital actualizado:', v.rows[0].cc);
        console.log('⚠️  Ejecuta el recalculador desde el panel Admin');
        break;
      } catch(e) {
        if (i === 2) throw e;
        console.log('Reintentando...');
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
