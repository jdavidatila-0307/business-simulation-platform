process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id, config, users FROM simulaciones WHERE estado='activa' LIMIT 1");
  const s = sim.rows[0];
  const equipos = s.users || [];

  for (const rondaNum of [9, 10]) {
    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  RONDA ${rondaNum}`);
    console.log('═'.repeat(55));

    // Decisiones en sim_decisiones
    const decs = await pool.query(
      `SELECT DISTINCT ON (equipo_id) equipo_id, decisiones
       FROM sim_decisiones 
       WHERE simulacion_id=$1 AND ronda_numero=$2
       ORDER BY equipo_id, id DESC`,
      [s.id, rondaNum]
    );

    // Agrupar por equipoOriginal
    const porEquipo = {};
    decs.rows.forEach(d => {
      const eq = equipos.find(e => d.equipo_id === e.id || d.equipo_id.startsWith(e.id));
      const nombre = eq?.nombre || d.equipo_id.slice(-15);
      if (!porEquipo[nombre]) porEquipo[nombre] = { submitted: false, productos: [] };
      if (d.decisiones?.submitted) porEquipo[nombre].submitted = true;
      porEquipo[nombre].productos.push({
        prod:       d.decisiones?.producto || '(sin producto)',
        precio:     d.decisiones?.precioVenta || 0,
        produccion: d.decisiones?.produccion || 0,
        submitted:  d.decisiones?.submitted,
      });
    });

    Object.entries(porEquipo).forEach(([nombre, data]) => {
      const estado = data.submitted ? '✅ ENVIADO' : '❌ NO enviado';
      console.log(`\n  ${nombre} — ${estado}`);
      data.productos.forEach(p => {
        console.log(`    ${p.prod} | precio Bs ${p.precio} | prod ${p.produccion} unid | submitted=${p.submitted}`);
      });
    });

    // Equipos sin ninguna decisión
    const conDec = new Set(decs.rows.map(d => {
      const eq = equipos.find(e => d.equipo_id === e.id || d.equipo_id.startsWith(e.id));
      return eq?.nombre;
    }));
    equipos.filter(e => !e.isBot).forEach(eq => {
      if (!conDec.has(eq.nombre)) {
        console.log(`\n  ${eq.nombre} — ⚠️  SIN DECISIÓN (defaultDecision)`);
      }
    });
  }

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
