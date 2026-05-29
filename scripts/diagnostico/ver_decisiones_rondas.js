const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
async function main() {
  const client = await pool.connect();
  try {
    // Para cada ronda 3-11, ver cuántas decisiones hay por tipo
    for (let n = 3; n <= 11; n++) {
      const r = await client.query(
        `SELECT equipo_id,
                decisiones->>'equipo' as eq_campo,
                producto_id,
                jsonb_array_length(CASE WHEN decisiones ? 'productos' 
                  THEN decisiones->'productos' ELSE '[]'::jsonb END) as num_prods,
                enviada_at
         FROM sim_decisiones
         WHERE simulacion_id=$1 AND ronda_numero=$2 AND producto_id='prod_1'
         ORDER BY equipo_id, enviada_at DESC`,
        ['sim_mpi8g7y5', n]
      );
      
      const porEquipo = {};
      r.rows.forEach(row => {
        if (!porEquipo[row.equipo_id]) {
          porEquipo[row.equipo_id] = row; // toma el más reciente
        }
      });
      
      const equipos = Object.values(porEquipo);
      const conFormato = equipos.filter(e => e.eq_campo).length;
      const sinFormato = equipos.filter(e => !e.eq_campo).length;
      
      console.log(`R${n}: ${equipos.length} equipos | con formato nuevo: ${conFormato} | sin formato: ${sinFormato}`);
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
