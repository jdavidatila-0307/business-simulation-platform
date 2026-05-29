const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
async function main() {
  const client = await pool.connect();
  try {
    // Verificar si R11 existe
    const r = await client.query(
      `SELECT numero, estado FROM sim_rondas 
       WHERE simulacion_id='sim_mpi8g7y5' AND numero=11`
    );
    if (r.rows.length) {
      console.log('R11 ya existe:', r.rows[0]);
      return;
    }

    // Crear R11 con estado abierta
    await client.query(
      `INSERT INTO sim_rondas (simulacion_id, numero, estado, creada_at)
       VALUES ('sim_mpi8g7y5', 11, 'abierta', NOW())`
    );
    console.log('✅ R11 creada con estado: abierta');

    // Verificar
    const r2 = await client.query(
      `SELECT numero, estado FROM sim_rondas 
       WHERE simulacion_id='sim_mpi8g7y5' ORDER BY numero`
    );
    console.log('\nRondas en BD:');
    r2.rows.forEach(row => console.log(`  R${row.numero}: ${row.estado}`));
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
