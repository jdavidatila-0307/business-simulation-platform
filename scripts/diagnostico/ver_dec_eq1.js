process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  // Decisiones en sim_decisiones
  const decs = await pool.query(
    'SELECT equipo_id, ronda_numero, decisiones FROM sim_decisiones ORDER BY ronda_numero, equipo_id'
  );
  console.log(`\n=== sim_decisiones: ${decs.rows.length} registros ===`);
  decs.rows.forEach(d => {
    const dec = d.decisiones || {};
    console.log(`  Ronda ${d.ronda_numero} | ${d.equipo_id.slice(-8)} | producto: ${dec.producto||'(vacío)'} | precio: ${dec.precioVenta||'?'}`);
  });

  // Decisiones en el JSONB de la ronda
  const ronda = await pool.query('SELECT numero, resultados FROM sim_rondas WHERE numero=1');
  if (ronda.rows[0]) {
    const dec = ronda.rows[0].resultados?.decisiones || {};
    console.log(`\n=== Decisiones en ronda.resultados.decisiones: ${Object.keys(dec).length} ===`);
    Object.entries(dec).forEach(([k,v]) =>
      console.log(`  ${k.slice(-8)}: ${v?.producto || '(vacío)'}`)
    );

    // Ver resultados por equipo
    const res = ronda.rows[0].resultados?.resultados || {};
    console.log(`\n=== Resultados por equipo: ${Object.keys(res).length} ===`);
    Object.values(res).forEach(r =>
      console.log(`  Eq ${r.equipoNombre}: ventas=${r.ventasReales} | utilidad=${r.utilidadNeta}`)
    );
  }

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
