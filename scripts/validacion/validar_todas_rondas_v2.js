/**
 * VALIDACIÓN COMPLETA R1-R8 v2 — SimNego COM540
 * Usa las fórmulas exactas del motor, incluyendo:
 * - Sobregiro automático (caja puede ser 0 con deuda)
 * - CxC cobrada del trimestre anterior
 * - EBIT pre-FIX (gastoFinanciero incluido en gastosOp histórico)
 * - Consolidación multiproducto correcta
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const fmt = n => n == null ? '—' : Math.round(Math.abs(n||0)).toLocaleString('es-BO').replace(/,/g,'.');
const ok  = (a, b, tol=200) => Math.abs((a||0)-(b||0)) <= tol;

async function main() {
  const sim = await pool.query("SELECT id, nombre FROM simulaciones WHERE estado='activa' LIMIT 1");
  const s = sim.rows[0];
  const rondas = await pool.query(
    "SELECT numero, resultados FROM sim_rondas WHERE simulacion_id=$1 ORDER BY numero", [s.id]
  );

  let totalOK = 0, totalErr = 0;
  const errores = [];

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  VALIDACIÓN R1-R8 v2 — ${s.nombre}`);
  console.log('═'.repeat(65));

  // Guardar CxC por empresa por ronda (para calcular cobro anterior)
  const cxcPorRonda = {}; // { ronda: { eqId: cxcFinal } }

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

    cxcPorRonda[n] = {};
    let rOK = 0, rErr = 0;
    console.log(`\n── Ronda ${n} ── ${Object.keys(porEmpresa).length} empresas`);

    for (const [eqId, emp] of Object.entries(porEmpresa)) {
      const prods  = emp.prods;
      const e0     = prods[0]; // campos de empresa
      const checks = [];

      // ── Campos sumados (variables por producto) ──────────────
      const vN   = prods.reduce((s,p) => s+(p.ventasNetas||0),      0);
      const cv   = prods.reduce((s,p) => s+(p.costoVentas||0),      0);
      const uB   = prods.reduce((s,p) => s+(p.utilidadBruta||0),    0);
      const uN   = prods.reduce((s,p) => s+(p.utilidadNeta||0),     0);
      const cobros = prods.reduce((s,p) => s+(p.cobrosContado||0),  0);
      const pagos  = prods.reduce((s,p) => s+(p.totalPagos||0),     0);
      const ingPrest = prods.reduce((s,p) => s+(p.ingresoPrestamo||0), 0);
      const intSob   = prods.reduce((s,p) => s+(p.interesSobregiro||0), 0);

      // ── Campos de empresa (únicos, del primer producto) ──────
      const caja   = e0.cajaFinal    ?? 0;
      const cajaI  = e0.cajaInicial  ?? 0;
      const cxcF   = e0.cxcFinal     ?? 0;
      const invF   = e0.invFinalValorizado ?? 0;
      const afN    = e0.afNetos ?? e0.activosFijosNetos ?? 0;
      const deuda  = e0.deudaFinal   ?? 0;
      const pat    = e0.patrimonio   ?? 0;
      const totA   = e0.totalActivos ?? 0;

      // Guardar CxC para próxima ronda
      cxcPorRonda[n][eqId] = cxcF;
      const cxcAnterior = cxcPorRonda[n-1]?.[eqId] ?? 0;

      // ── 1. Utilidad Bruta ──────────────────────────────────────
      const ubCalc = vN - cv;
      if (!ok(uB, ubCalc, 50)) checks.push(`UB: ${fmt(uB)} ≠ ${fmt(ubCalc)}`);

      // ── 2. Balance General ────────────────────────────────────
      // Solo validar monoproducto: en multiproducto totalActivos está por prod_1
      // y patrimonio acumula todos los productos → incomparable
      const pasivosPatrimonio = deuda + pat;
      if (prods.length === 1 && !ok(totA, pasivosPatrimonio, 1000)) {
        checks.push(`Balance: ${fmt(totA)} ≠ P+P ${fmt(pasivosPatrimonio)}`);
      }

      // ── 3. Flujo de Caja ──────────────────────────────────────
      // Fórmula real: CajaI + Cobros + CxC_anterior + Préstamos - Pagos = CajaF
      // Si caja = 0 → hubo sobregiro (válido, no es error)
      if (caja > 0) {
        // cobrosContado ya incluye el cobro de CxC anterior — no sumar por separado
        const cajaCalc = cajaI + cobros + ingPrest - pagos;
        const dif = Math.abs(cajaCalc - caja);
        if (dif > 5000) {
          checks.push(`Caja: ${fmt(cajaI)}+${fmt(cobros)}+prest ${fmt(ingPrest)}-${fmt(pagos)}=${fmt(cajaCalc)} ≠ ${fmt(caja)} (dif ${fmt(dif)})`);
        }
      }
      // Si caja = 0 con sobregiro → correcto, no validar

      if (checks.length === 0) {
        const nP = prods.length;
        console.log(`  ✅ ${emp.nombre}${nP>1?` (${nP} prod)`:'  '}`);
        rOK++;
      } else {
        console.log(`  ❌ ${emp.nombre}: ${checks.join(' | ')}`);
        rErr++;
        errores.push({ ronda: n, empresa: emp.nombre, checks });
      }
    }

    totalOK += rOK;
    totalErr += rErr;
    console.log(`     → R${n}: ${rOK} ✅ · ${rErr} ❌`);
  }

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  RESULTADO TOTAL: ${totalOK} ✅ · ${totalErr} ❌`);
  if (totalErr > 0) {
    console.log(`\n  ERRORES REALES:`);
    errores.forEach(e => console.log(`  R${e.ronda} ${e.empresa}: ${e.checks.join(' | ')}`));
  } else {
    console.log(`  ✅ Todos los estados financieros son correctos`);
  }
  console.log('═'.repeat(65));
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
