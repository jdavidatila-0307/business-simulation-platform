process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const simId = sim.rows[0].id;

  const ronda = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=10", [simId]
  );
  if (!ronda.rows[0]) { console.log('Ronda 10 no existe'); return; }

  const res = ronda.rows[0]?.resultados?.resultados || {};
  const entries = Object.entries(res);
  console.log(`\nRonda 10 — ${entries.length} resultados\n`);

  entries.forEach(([k, r]) => {
    console.log(`\n${'─'.repeat(55)}`);
    console.log(`  ${r.equipoNombre} — ${r.producto || '(sin producto)'}`);
    console.log(`  sinDecision: ${r.sinDecision}`);
    console.log(`\n  ESTADO DE RESULTADOS:`);
    console.log(`  ventasBrutas:     Bs ${Math.round(r.ventasBrutas||0).toLocaleString()}`);
    console.log(`  costoVentas:      Bs ${Math.round(r.costoVentas||0).toLocaleString()}`);
    console.log(`  gastosOp:         Bs ${Math.round(r.gastosOp||0).toLocaleString()}`);
    console.log(`  ebit:             Bs ${Math.round(r.ebit||0).toLocaleString()}`);
    console.log(`  gastoFinanciero:  Bs ${Math.round(r.gastoFinanciero||0).toLocaleString()}`);
    console.log(`  utilidadNeta:     Bs ${Math.round(r.utilidadNeta||0).toLocaleString()}`);
    console.log(`\n  FLUJO DE EFECTIVO:`);
    console.log(`  cajaInicial:      Bs ${Math.round(r.cajaInicial||0).toLocaleString()}`);
    console.log(`  cobrosContado:    Bs ${Math.round(r.cobrosContado||0).toLocaleString()}`);
    console.log(`  pagoProduccion:   Bs ${Math.round(r.pagoProduccion||0).toLocaleString()}`);
    console.log(`  pagoOperarios2:   Bs ${Math.round(r.pagoOperarios2||0).toLocaleString()}`);
    console.log(`  pagoMktTotal:     Bs ${Math.round(r.pagoMktTotal||0).toLocaleString()}`);
    console.log(`  pagoGastosAdmin:  Bs ${Math.round(r.pagoGastosAdmin||0).toLocaleString()}`);
    console.log(`  pagoGastosPlanta: Bs ${Math.round(r.pagoGastosPlanta||0).toLocaleString()}`);
    console.log(`  pagoIntereses:    Bs ${Math.round(r.pagoIntereses||0).toLocaleString()}`);
    console.log(`  ingresoPrestamo:  Bs ${Math.round(r.ingresoPrestamo||0).toLocaleString()}`);
    console.log(`  totalPagos:       Bs ${Math.round(r.totalPagos||0).toLocaleString()}`);
    console.log(`  cajaFinal:        Bs ${Math.round(r.cajaFinal||0).toLocaleString()}`);
    console.log(`\n  VERIFICACIÓN CAJA:`);
    const calcCaja = (r.cajaInicial||0) + (r.cobrosContado||0) + (r.ingresoPrestamo||0) - (r.totalPagos||0);
    console.log(`  cajaInicial + cobros + prestamo - pagos = Bs ${Math.round(calcCaja).toLocaleString()}`);
    console.log(`  cajaFinal real:   Bs ${Math.round(r.cajaFinal||0).toLocaleString()}`);
    console.log(`  diferencia:       Bs ${Math.round(calcCaja - (r.cajaFinal||0)).toLocaleString()}`);
  });

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
