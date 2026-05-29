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
    console.log('=== EQUIPOS ===');
    equipos.forEach(([id, u]) => {
      console.log(`\n${u.nombre}:`);
      console.log(`  password:      ${u.password}`);
      console.log(`  passwordPlain: ${u.passwordPlain}`);
      console.log(`  miembros:      ${JSON.stringify(u.miembros)}`);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
