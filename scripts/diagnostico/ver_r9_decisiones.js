process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id, users FROM simulaciones WHERE estado='activa' LIMIT 1");
  const { id: simId, users: equipos } = sim.rows[0];

  const ronda = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [simId]
  );
  const r = ronda.rows[0]?.resultados || {};
  const decs = r.decisiones || {};
  const keys = Object.keys(decs);

  console.log(`\nsim_rondas.decisiones R9: ${keys.length} entradas`);
  keys.forEach(k => {
    const d = decs[k];
    const eq = equipos.find(e => k === e.id || k.startsWith(e.id));
    console.log(`\n  ${eq?.nombre || k.slice(-20)}`);
    console.log(`    producto:    "${d.producto}"`);
    console.log(`    precio:      ${d.precioVenta}`);
    console.log(`    cajaInicial: ${d.cajaInicial}`);
    console.log(`    submitted:   ${d.submitted}`);
  });

  // Ver R8 resultados para comparar caja
  const r8 = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=8", [simId]
  );
  const res8 = r8.rows[0]?.resultados?.resultados || {};
  console.log(`\nCaja final R8 por empresa:`);
  const porEmpresa = {};
  Object.values(res8).forEach(r => {
    const eqId = r.equipoOriginal || r.equipo;
    if (!porEmpresa[eqId]) porEmpresa[eqId] = { nombre: r.equipoNombre, caja: r.cajaFinal };
  });
  Object.values(porEmpresa).forEach(e => {
    console.log(`  ${e.nombre}: Bs ${Math.round(e.caja||0).toLocaleString()}`);
  });

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
