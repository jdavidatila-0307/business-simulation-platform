/**
 * VALIDACIÓN COMPLETA R1-R8 — SimNego COM540
 * Verifica: Balance cuadra, Flujo de caja, EBIT, Utilidad Neta
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = n => n == null ? '—' : (Math.round(Math.abs(n))).toLocaleString('es-BO').replace(/,/g,'.');
const ok  = (a, b, tol=2) => Math.abs((a||0)-(b||0)) <= tol;

async function main() {
  const sim = await pool.query("SELECT id, nombre FROM simulaciones WHERE estado='activa' LIMIT 1");
  const s = sim.rows[0];
  const rondas = await pool.query(
    "SELECT numero, resultados FROM sim_rondas WHERE simulacion_id=$1 ORDER BY numero", [s.id]
  );

  let totalOK = 0, totalErr = 0;
  const errores = [];

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  VALIDACIÓN R1-R8 — ${s.nombre}`);
  console.log('═'.repeat(65));

  for (const ronda of rondas.rows) {
    const n = ronda.numero;
    const resultados = Object.values(ronda.resultados?.resultados || {});
    if (!resultados.length) { console.log(`\nR${n}: Sin resultados`); continue; }

    // Consolidar por empresa
    const porEmpresa = {};
    resultados.forEach(r => {
      const eqId = r.equipoOriginal || r.equipo;
      if (!porEmpresa[eqId]) porEmpresa[eqId] = { nombre: r.equipoNombre, prods: [] };
      porEmpresa[eqId].prods.push(r);
    });

    let rOK = 0, rErr = 0;
    console.log(`\n── Ronda ${n} ── ${Object.keys(porEmpresa).length} empresas`);

    for (const [eqId, emp] of Object.entries(porEmpresa)) {
      const prods = emp.prods;
      // Tomar campos de empresa del primer producto
      const e0 = prods[0];

      // Sumar campos variables
      const vN  = prods.reduce((s,p) => s+(p.ventasNetas||0), 0);
      const vB  = prods.reduce((s,p) => s+(p.ventasBrutas||0), 0);
      const cv  = prods.reduce((s,p) => s+(p.costoVentas||0), 0);
      const uB  = prods.reduce((s,p) => s+(p.utilidadBruta||0), 0);
      const gOp = prods.reduce((s,p) => s+(p.gastosOp||0), 0);
      const ebit= prods.reduce((s,p) => s+(p.ebit||0), 0);
      const gFin= prods.reduce((s,p) => s+(p.gastoFinanciero||0), 0);
      const imp = prods.reduce((s,p) => s+(p.totalImpuestos||0), 0);
      const uN  = prods.reduce((s,p) => s+(p.utilidadNeta||0), 0);
      const cobros = prods.reduce((s,p) => s+(p.cobrosContado||0), 0);
      const pagos  = prods.reduce((s,p) => s+(p.totalPagos||0), 0);
      const ingPrest = e0.ingresoPrestamo || 0;

      // Campos de empresa (únicos)
      const caja   = e0.cajaFinal ?? 0;
      const cajaI  = e0.cajaInicial ?? 0;
      const cxcF   = e0.cxcFinal ?? 0;
      const invF   = e0.invFinalValorizado ?? 0;
      const afN    = e0.afNetos ?? e0.activosFijosNetos ?? 0;
      const deuda  = e0.deudaFinal ?? 0;
      const pat    = e0.patrimonio ?? 0;
      const totA   = e0.totalActivos ?? 0;
      const cxcI   = e0.cxcInicial ?? 0;

      const checks = [];

      // 1. Utilidad Bruta = Ventas Netas - Costo Ventas
      const ubCalc = vN - cv;
      if (!ok(uB, ubCalc)) checks.push(`UB: ${fmt(uB)} ≠ ${fmt(ubCalc)}`);

      // 2. EBIT = UB - GastosOp
      const ebitCalc = uB - gOp;
      if (!ok(ebit, ebitCalc, 5)) checks.push(`EBIT: ${fmt(ebit)} ≠ ${fmt(ebitCalc)}`);

      // 3. Utilidad Neta = EBIT - GastoFinanciero - Impuestos
      const uNCalc = ebit - gFin - imp;
      if (!ok(uN, uNCalc, 5)) checks.push(`UN: ${fmt(uN)} ≠ ${fmt(uNCalc)}`);

      // 4. Balance: Activos = Pasivos + Patrimonio
      const activos = caja + cxcF + invF + afN;
      const pasivos = deuda + pat;
      if (!ok(totA, activos, 100)) checks.push(`Activos: ${fmt(totA)} ≠ ${fmt(activos)}`);
      if (!ok(totA, pasivos, 100)) checks.push(`Balance: Activos ${fmt(totA)} ≠ P+P ${fmt(pasivos)}`);

      // 5. Flujo de Caja: CajaI + Cobros + Préstamos - Pagos = CajaF
      const cajaCalc = cajaI + cobros + ingPrest - pagos;
      const diferencia = Math.abs(cajaCalc - caja);
      if (diferencia > 500 && caja >= 0) checks.push(`Caja: ${fmt(cajaI)}+${fmt(cobros)}-${fmt(pagos)}=${fmt(cajaCalc)} ≠ ${fmt(caja)}`);

      if (checks.length === 0) {
        console.log(`  ✅ ${emp.nombre} (${prods.length} prod)`);
        rOK++;
      } else {
        console.log(`  ❌ ${emp.nombre}: ${checks.join(' | ')}`);
        rErr++;
        errores.push({ ronda: n, empresa: emp.nombre, checks });
      }
    }

    totalOK += rOK;
    totalErr += rErr;
    console.log(`     → R${n}: ${rOK} OK · ${rErr} errores`);
  }

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  RESULTADO TOTAL: ${totalOK} OK · ${totalErr} ERRORES`);
  if (totalErr > 0) {
    console.log(`\n  ERRORES DETALLADOS:`);
    errores.forEach(e => {
      console.log(`  R${e.ronda} ${e.empresa}: ${e.checks.join(' | ')}`);
    });
  } else {
    console.log(`  ✅ Todos los cálculos son correctos`);
  }
  console.log('═'.repeat(65));

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
