const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});
async function main() {
  const client = await pool.connect();
  try {
    // Simular exactamente lo que hace getRonda para R3
    const r = await client.query(
      `SELECT equipo_id, decisiones
       FROM sim_decisiones
       WHERE simulacion_id=$1 AND ronda_numero=3 AND producto_id='prod_1'
       ORDER BY enviada_at DESC`,
      ['sim_mpi8g7y5']
    );
    console.log('Total registros prod_1 R3:', r.rows.length);
    
    // Simular el loop con if (!decisionesMap[equipo_id])
    const decisionesMap = {};
    for (const d of r.rows) {
      if (!decisionesMap[d.equipo_id]) {
        decisionesMap[d.equipo_id] = d.decisiones;
      }
    }
    
    console.log('\nDecisiones por equipo (primera = más reciente):');
    Object.entries(decisionesMap).forEach(([eqId, dec]) => {
      console.log(`  ${eqId}:`);
      console.log(`    equipo: ${dec?.equipo}`);
      console.log(`    productos: ${dec?.productos?.length}`);
      console.log(`    cajaInicial: ${dec?.cajaInicial}`);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
