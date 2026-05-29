const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT users FROM simulaciones WHERE id=$1`, ['sim_mpi8g7y5']
    );
    const users = rows[0]?.users || {};
    const equipos = Object.entries(users).filter(([id,u]) => u.rol === 'equipo');
    console.log('=== EQUIPOS COM540D12026 ===');
    equipos.forEach(([id, u]) => {
      console.log(`\nEquipo: ${u.nombre}`);
      console.log(`  ID: ${id}`);
      console.log(`  password_hash: ${u.password_hash}`);
      console.log(`  password_plain: ${u.password_plain}`);
      console.log(`  integrantes: ${JSON.stringify(u.integrantes || u.members || u.estudiantes || '—')}`);
      // Mostrar todas las keys disponibles
      console.log(`  keys: ${Object.keys(u).join(', ')}`);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
