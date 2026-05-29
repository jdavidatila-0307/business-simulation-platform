process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function bs(v) {
  if (v===null||v===undefined) return 'N/A';
  return 'Bs ' + Math.round(Math.abs(v)).toLocaleString() + (v<0?' (NEG)':'');
}

async function main() {
  const r = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE numero=2 ORDER BY creada_at DESC LIMIT 1"
  );
  if (!r.rows[0]) { console.log('Sin ronda 2'); return; }
  const res = r.rows[0].resultados?.resultados || {};
  const equipos = Object.values(res);

  if (!equipos.length) { console.log('Ronda 2 sin resultados por equipo'); return; }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  VALIDACIÓN ESTADOS FINANCIEROS — RONDA 2');
  console.log('══════════════════════════════════════════════════════════════\n');

  for (const eq of equipos) {
    const nom = eq.equipoNombre || eq.equipo;
    console.log(`\n╔══════════════════════════════════════════════════════════╗`);
    console.log(`  ${nom} — ${eq.producto||'(multiproducto)'}`);
    console.log(`╚══════════════════════════════════════════════════════════╝`);

    // ── ESTADO DE RESULTADOS ────────────────────────────────
    console.log('\n  📋 ESTADO DE RESULTADOS');
    const vB    = eq.ventasBrutas   || 0;
    const com   = eq.comisiones     || 0;
    const vN    = eq.ventasNetas    || 0;
    const cv    = eq.costoVentas    || 0;
    const uB    = eq.utilidadBruta  || 0;
    const gasOp = eq.gastosOp       || 0;
    const ebit  = eq.ebit           || 0;
    const gFin  = (eq.interesesPrestamo||0)+(eq.interesSobregiro||0)+(eq.comisionApertura||0);
    const imp   = (eq.ivaAPagar||0)+(eq.impuestoIT||0)+(eq.impuestoIUE||0);
    const uN    = eq.utilidadNeta   || 0;

    const uB_calc  = Math.round(vN - cv);
    const ebit_calc= Math.round(uB - gasOp);
    const uN_calc  = Math.round(ebit - gFin - imp);

    console.log(`    Ventas brutas:        ${bs(vB)}`);
    console.log(`    (−) Comisiones:       ${bs(com)}`);
    console.log(`    = Ventas netas:       ${bs(vN)}`);
    console.log(`    (−) Costo ventas:     ${bs(cv)}`);
    console.log(`    = Utilidad bruta:     ${bs(uB)}  | calculado: ${bs(uB_calc)}  ${Math.abs(uB-uB_calc)<2?'✅':'❌ DIF: '+Math.round(uB-uB_calc)}`);
    console.log(`    (−) Gastos op.:       ${bs(gasOp)}`);
    console.log(`    = EBIT:               ${bs(ebit)}  | calculado: ${bs(ebit_calc)}  ${Math.abs(ebit-ebit_calc)<2?'✅':'❌ DIF: '+Math.round(ebit-ebit_calc)}`);
    console.log(`    (−) Gasto financiero: ${bs(gFin)}`);
    console.log(`    (−) Impuestos:        ${bs(imp)}`);
    console.log(`    = Utilidad neta:      ${bs(uN)}  | calculado: ${bs(uN_calc)}  ${Math.abs(uN-uN_calc)<2?'✅':'❌ DIF: '+Math.round(uN-uN_calc)}`);

    // ── BALANCE GENERAL ──────────────────────────────────────
    console.log('\n  🏦 BALANCE GENERAL');
    const caja   = eq.cajaFinal          || 0;
    const cxc    = eq.cxcFinal           || 0;
    const inv    = eq.invFinalValorizado  || 0;
    const afN    = eq.afNetos            || 0;
    const totA   = eq.totalActivos       || 0;
    const deuda  = eq.deudaFinal         || 0;
    const patrim = eq.patrimonio         || 0;
    const totPP  = Math.round(deuda + patrim);
    const totA_c = Math.round(caja + cxc + inv + afN);

    console.log(`    Activos:`);
    console.log(`      Caja:              ${bs(caja)}`);
    console.log(`      CxC:               ${bs(cxc)}`);
    console.log(`      Inventarios:       ${bs(inv)}`);
    console.log(`      Activos fijos neto:${bs(afN)}`);
    console.log(`    = TOTAL ACTIVOS:     ${bs(totA)}  | suma: ${bs(totA_c)}  ${Math.abs(totA-totA_c)<2?'✅':'❌ DIF: '+Math.round(totA-totA_c)}`);
    console.log(`    Pasivos:`);
    console.log(`      Deuda total:       ${bs(deuda)}`);
    console.log(`    Patrimonio:          ${bs(patrim)}`);
    console.log(`    = PASIVOS+PATRIMONIO:${bs(totPP)}`);
    const cuadra = Math.abs(totA - totPP) < 2;
    console.log(`    ECUACIÓN CONTABLE:   Activos ${bs(totA)} = P+P ${bs(totPP)}  ${cuadra?'✅ CUADRA':'❌ NO CUADRA — DIF: '+Math.round(totA-totPP)}`);

    // ── FLUJO DE EFECTIVO ────────────────────────────────────
    console.log('\n  💧 FLUJO DE EFECTIVO');
    const cajaIni  = eq.cajaInicial     || 0;
    const cobros   = eq.cobrosContado   || 0;
    const prestamo = eq.ingresoPrestamo || 0;
    const pagos    = eq.totalPagos      || 0;
    const cajaF    = eq.cajaFinal       || 0;
    const sob      = eq.sobregiro       || 0;
    const cajaF_calc = Math.round(cajaIni + cobros + prestamo - pagos);

    console.log(`    Caja inicial:        ${bs(cajaIni)}`);
    console.log(`    (+) Cobros contado:  ${bs(cobros)}`);
    console.log(`    (+) Préstamos:       ${bs(prestamo)}`);
    console.log(`    (−) Total pagos:     ${bs(pagos)}`);
    console.log(`    = Caja calculada:    ${bs(cajaF_calc)}`);
    console.log(`    = Caja motor:        ${bs(cajaF)}`);
    if (sob > 0) console.log(`    ⚠  Sobregiro:        ${bs(sob)}`);
    const cajaCuadra = Math.abs(cajaF_calc - cajaF) < 2 || (cajaF===0 && sob>0);
    console.log(`    VALIDACIÓN CAJA:     ${cajaCuadra?'✅ CUADRA':'❌ NO CUADRA — DIF: '+Math.round(cajaF_calc-cajaF)}`);

    console.log('\n  ─────────────────────────────────────────');
  }

  console.log('\n✅ Validación completada\n');
  await pool.end();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
