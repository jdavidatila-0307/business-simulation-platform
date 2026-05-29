const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
async function main() {
  const client = await pool.connect();
  try {
    // Ver todas las decisiones de Raíz R3 con timestamps
    const r = await client.query(
      `SELECT equipo_id, producto_id, enviada_at,
              decisiones->>'equipo' as eq_campo,
              jsonb_array_length(CASE WHEN decisiones ? 'productos' THEN decisiones->'productos' ELSE '[]'::jsonb END) as num_prods
       FROM sim_decisiones 
       WHERE simulacion_id=$1 AND ronda_numero=3 AND equipo_id LIKE '%raz%'
       ORDER BY enviada_at DESC`,
      ['sim_mpi8g7y5']
    );
    console.log('Decisiones Raíz R3:', r.rows.length);
    r.rows.forEach(row => {
      console.log(`  equipo_id=${row.equipo_id} prod_id=${row.producto_id} num_prods=${row.num_prods} eq_campo=${row.eq_campo} at=${row.enviada_at}`);
    });

    // Ver qué devuelve getRonda
    const r2 = await client.query(
      `SELECT equipo_id, decisiones->>'equipo' as eq_campo,
              jsonb_array_length(CASE WHEN decisiones ? 'productos' THEN decisiones->'productos' ELSE '[]'::jsonb END) as num_prods,
              enviada_at
       FROM sim_decisiones
       WHERE simulacion_id=$1 AND ronda_numero=3 AND producto_id='prod_1' AND equipo_id LIKE '%raz%'
       ORDER BY enviada_at DESC
       LIMIT 1`,
      ['sim_mpi8g7y5']
    );
    console.log('\nDECISION QUE USA getRonda:');
    r2.rows.forEach(row => {
      console.log(`  equipo_id=${row.equipo_id} eq_campo=${row.eq_campo} num_prods=${row.num_prods} at=${row.enviada_at}`);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
