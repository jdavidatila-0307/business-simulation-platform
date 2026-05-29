const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
async function main() {
  const client = await pool.connect();
  try {
    // Ver columnas de usuarios
    const r = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name='usuarios' ORDER BY ordinal_position`
    );
    console.log('=== TABLA usuarios ===');
    r.rows.forEach(c => console.log(' ', c.column_name, ':', c.data_type));

    // Ver columnas de simulaciones
    const r2 = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name='simulaciones' ORDER BY ordinal_position`
    );
    console.log('\n=== TABLA simulaciones ===');
    r2.rows.forEach(c => console.log(' ', c.column_name, ':', c.data_type));

    // Ver un usuario de muestra
    const r3 = await client.query(`SELECT * FROM usuarios LIMIT 1`);
    console.log('\n=== MUESTRA usuario ===');
    console.log(Object.keys(r3.rows[0] || {}));
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
