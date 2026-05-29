process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const simId = sim.rows[0].id;

  const ronda = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [simId]
  );
  if (!ronda.rows[0]) { console.log('Ronda 9 no existe'); return; }

  const res = ronda.rows[0].resultados?.resultados || {};
  const entries = Object.entries(res);
  
  console.log(`\nRonda 9 — ${entries.length} resultados\n`);
  
  entries.forEach(([k, r]) => {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  ${r.equipoNombre} — ${r.producto || '(sin producto)'}`);
    console.log(`  equipo: ${k.slice(-25)}`);
    console.log(`  sinDecision: ${r.sinDecision}`);
    console.log(`  ventasBrutas:   Bs ${Math.round(r.ventasBrutas||0).toLocaleString()}`);
    console.log(`  costoVentas:    Bs ${Math.round(r.costoVentas||0).toLocaleString()}`);
    console.log(`  utilidadBruta:  Bs ${Math.round(r.utilidadBruta||0).toLocaleString()}`);
    console.log(`  gastosOp:       Bs ${Math.round(r.gastosOp||0).toLocaleString()}`);
    console.log(`  ebit:           Bs ${Math.round(r.ebit||0).toLocaleString()}`);
    console.log(`  utilidadNeta:   Bs ${Math.round(r.utilidadNeta||0).toLocaleString()}`);
    console.log(`  cajaFinal:      Bs ${Math.round(r.cajaFinal||0).toLocaleString()}`);
    console.log(`  deudaFinal:     Bs ${Math.round(r.deudaFinal||0).toLocaleString()}`);
    console.log(`  totalActivos:   Bs ${Math.round(r.totalActivos||0).toLocaleString()}`);
    console.log(`  patrimonio:     Bs ${Math.round(r.patrimonio||0).toLocaleString()}`);
  });

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
