const { Pool } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // Buscar sim restaurada más reciente
  const sims = await pool.query(`SELECT id, nombre FROM simulaciones WHERE nombre ILIKE '%restaurado%' ORDER BY creada_at DESC LIMIT 1`);
  const sim = sims.rows[0];
  console.log(`\nSimulación: [${sim.id}] ${sim.nombre}\n`);

  const simRow = await pool.query(`SELECT users FROM simulaciones WHERE id = $1`, [sim.id]);
  const users = simRow.rows[0]?.users || [];
  const equipoMap = {};
  users.forEach(u => equipoMap[u.id] = u.nombre);

  const r2 = await pool.query(`SELECT resultados FROM sim_rondas WHERE simulacion_id = $1 AND numero = 2`, [sim.id]);
  const res = r2.rows[0]?.resultados || {};
  const resEquipos = res.resultados || {};

  console.log(`=== ESTADOS FINANCIEROS R2 — ${Object.keys(resEquipos).length} equipos ===\n`);

  let descuadreTotal = 0;
  Object.entries(resEquipos).forEach(([eqId, data]) => {
    const idLimpio = eqId.replace('__prod_1','');
    const nombre = equipoMap[idLimpio] || eqId;
    const p = data.prod_1 || data;

    const activos    = p.totalActivos    || 0;
    const pasivos = p.totalPasivos !== undefined ? p.totalPasivos : ((p.deudaFinal||0)+(p.ivaAPagar||0));
    const patrimonio = p.patrimonio      || p.capitalContable || 0;
    const descuadre  = Math.round(Math.abs(activos - pasivos - patrimonio));
    descuadreTotal  += descuadre;

    console.log(`[${nombre}]`);
    console.log(`  ER:`);
    console.log(`    Ventas brutas:     Bs ${(p.ventasBrutas||0).toLocaleString('es-BO')}`);
    console.log(`    IVA débito:        Bs ${(p.ivaDebito||0).toLocaleString('es-BO')}`);
    console.log(`    Ventas netas:      Bs ${(p.ventasNetas||0).toLocaleString('es-BO')}`);
    console.log(`    Costo ventas:      Bs ${(p.costoVentas||0).toLocaleString('es-BO')}`);
    console.log(`    Gastos op:         Bs ${(p.gastosOp||0).toLocaleString('es-BO')}`);
    console.log(`    Utilidad neta:     Bs ${(p.utilidadNeta||0).toLocaleString('es-BO')}`);
    console.log(`  Balance:`);
    console.log(`    Caja final:        Bs ${(p.cajaFinal||0).toLocaleString('es-BO')}`);
    console.log(`    Total activos:     Bs ${activos.toLocaleString('es-BO')}`);
    console.log(`    Total pasivos:     Bs ${pasivos.toLocaleString('es-BO')}`);
    console.log(`    Patrimonio:        Bs ${patrimonio.toLocaleString('es-BO')}`);
    console.log(`    A=P+Pat:           ${descuadre <= 1 ? '✅' : '❌ DESCUADRE Bs '+descuadre}`);
    console.log(`  KPIs:`);
    console.log(`    Unidades vendidas: ${p.unidadesVendidas||0}`);
    console.log(`    Stock final:       ${p.stockFinal||0} unid`);
    console.log(`    Proveedor:         ${p.proveedorElegido||'—'}`);
    console.log('');
  });

  console.log(`RESUMEN: ${descuadreTotal <= 6 ? '✅ Cuadrado' : '❌ Descuadre Bs '+descuadreTotal}`);
  await pool.end();
}
run().catch(e => { console.error('ERROR:', e.message); pool.end(); });

