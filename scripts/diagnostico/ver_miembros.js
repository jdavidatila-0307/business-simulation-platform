process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query("SELECT users FROM simulaciones LIMIT 1");
  const users = r.rows[0]?.users || [];
  console.log('\n=== Estructura de equipos ===');
  users.slice(0,2).forEach(eq => {
    console.log(`\nEquipo: ${eq.nombre}`);
    console.log('Miembros:', JSON.stringify(eq.miembros?.slice(0,2) || [], null, 2));
  });
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
