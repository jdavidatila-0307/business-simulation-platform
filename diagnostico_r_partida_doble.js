const { Pool } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function fmt(n) { return (n||0).toLocaleString('es-BO', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function fmtBs(n) { return 'Bs ' + fmt(n); }

async function run() {
  const sim = 'sim_mpuc7jpq';
  const simRow = await pool.query(`SELECT users, parametros FROM simulaciones WHERE id = $1`, [sim]);
  const users = simRow.rows[0]?.users || [];
  const eqR = users.find(u => u.nombre === 'r');

  for (const n of [1, 2, 3]) {
    const r = await pool.query(`SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2`, [sim, n]);
    const res = r.rows[0]?.resultados?.resultados || {};
    const eqEntry = Object.entries(res).find(([k]) => k.includes(eqR.id.slice(-8)));
    if (!eqEntry) { console.log(`T${n}: Sin resultados`); continue; }
    const p = eqEntry[1].prod_1 || eqEntry[1];

    console.log(`\n${'═'.repeat(65)}`);
    console.log(`TRIMESTRE ${n} — Equipo r`);
    console.log('═'.repeat(65));

    // ── ESTADO DE RESULTADOS ──────────────────────────────────────
    console.log('\n📊 ESTADO DE RESULTADOS');
    console.log('─'.repeat(65));
    const ventasBrutas   = p.ventasBrutas   || 0;
    const ivaDebito      = p.ivaDebito      || 0;
    const ventasNetas    = p.ventasNetas    || 0;
    const comisionesNeto = p.comisionesNeto || 0;
    const costoVentas    = p.costoVentas    || 0;
    const utilBruta      = p.utilidadBruta  || (ventasNetas - comisionesNeto - costoVentas);
    const gastosOp       = p.gastosOp       || 0;
    const ebitda         = utilBruta - gastosOp;
    const depreciacion   = p.depreciacion   || 0;
    const ebit           = ebitda - depreciacion;
    const gastoFin       = p.gastoFinanciero || p.interesesPrestamo || 0;
    const uai            = ebit - gastoFin;
    const impuestos      = p.totalImpuestos || 0;
    const utilidadNeta   = p.utilidadNeta   || 0;

    console.log(`  Ventas brutas (con IVA):         ${fmtBs(ventasBrutas + ivaDebito)}`);
    console.log(`  (−) IVA débito (13%):            ${fmtBs(ivaDebito)}`);
    console.log(`  = Ventas netas:                  ${fmtBs(ventasNetas)}`);
    console.log(`  (−) Comisiones canal:            ${fmtBs(comisionesNeto)}`);
    console.log(`  (−) Costo de ventas:             ${fmtBs(costoVentas)}`);
    console.log(`  = Utilidad bruta:                ${fmtBs(utilBruta)}`);
    console.log(`  (−) Gastos operativos:           ${fmtBs(gastosOp)}`);
    console.log(`  = EBITDA:                        ${fmtBs(ebitda)}`);
    console.log(`  (−) Depreciación:                ${fmtBs(depreciacion)}`);
    console.log(`  = EBIT:                          ${fmtBs(ebit)}`);
    console.log(`  (−) Gastos financieros:          ${fmtBs(gastoFin)}`);
    console.log(`  = UAI:                           ${fmtBs(uai)}`);
    console.log(`  (−) Impuestos:                   ${fmtBs(impuestos)}`);
    console.log(`  = UTILIDAD NETA:                 ${fmtBs(utilidadNeta)}`);
    const erCuadra = Math.abs(uai - impuestos - utilidadNeta) <= 1;
    console.log(`  ER Cuadre:                       ${erCuadra ? '✅' : '❌ DESCUADRE Bs '+Math.abs(uai-impuestos-utilidadNeta).toFixed(2)}`);

    // ── BALANCE GENERAL ───────────────────────────────────────────
    console.log('\n📋 BALANCE GENERAL');
    console.log('─'.repeat(65));
    const caja       = p.cajaFinal       || 0;
    const cxc        = p.cxcFinal        || 0;
    const inventario = p.invFinalValorizado || (p.inventarioFinal * (p.costoUnitario||0)) || 0;
    const stockMPval = p.stockMPFinal    * (p.costoMPunitario||0) || 0;
    const actCorriente = caja + cxc + inventario + stockMPval;
    const afBrutos   = p.activosFijosNetos ? (p.activosFijosNetos + (p.depreciacion||0)) : 0;
    const depAcum    = p.depreciacion    || 0;
    const afNetos    = p.afNetos || p.activosFijosNetos || 0;
    const actNoCorriente = afNetos;
    const totalActivos = p.totalActivos  || 0;

    console.log(`  ACTIVOS`);
    console.log(`    Corriente:`);
    console.log(`      Caja y bancos:               ${fmtBs(caja)}`);
    console.log(`      CxC:                         ${fmtBs(cxc)}`);
    console.log(`      Inventario:                  ${fmtBs(inventario)}`);
    console.log(`      Stock MP:                    ${fmtBs(stockMPval)}`);
    console.log(`    = Total Activo Corriente:      ${fmtBs(actCorriente)}`);
    console.log(`    No Corriente:`);
    console.log(`      Activos fijos netos:         ${fmtBs(afNetos)}`);
    console.log(`    = Total Activo No Corriente:   ${fmtBs(actNoCorriente)}`);
    console.log(`    TOTAL ACTIVOS:                 ${fmtBs(totalActivos)}`);

    const deuda      = p.deudaFinal      || p.totalPasivos || 0;
    const ivaAPagar  = p.ivaAPagar       || 0;
    const totalPasivos = deuda + ivaAPagar;

    console.log(`\n  PASIVOS`);
    console.log(`      Deuda financiera:            ${fmtBs(deuda)}`);
    console.log(`      IVA a pagar:                 ${fmtBs(ivaAPagar)}`);
    console.log(`    TOTAL PASIVOS:                 ${fmtBs(totalPasivos)}`);

    const capitalContable = p.capitalContable || 0;
    const resAcum         = p.resultadoAcumulado || 0;
    const patrimonio      = p.patrimonio || 0;

    console.log(`\n  PATRIMONIO`);
    console.log(`      Capital contable:            ${fmtBs(capitalContable)}`);
    console.log(`      Resultado acumulado:         ${fmtBs(resAcum)}`);
    console.log(`      Utilidad del período:        ${fmtBs(utilidadNeta)}`);
    console.log(`    TOTAL PATRIMONIO:              ${fmtBs(patrimonio)}`);

    console.log(`\n  TOTAL PASIVOS + PATRIMONIO:      ${fmtBs(totalPasivos + patrimonio)}`);
    const descuadre = Math.round(Math.abs(totalActivos - totalPasivos - patrimonio));
    console.log(`  A = P + Pat:                     ${descuadre <= 1 ? '✅ CUADRADO' : '❌ DESCUADRE Bs '+descuadre}`);

    // ── FLUJO DE EFECTIVO ─────────────────────────────────────────
    console.log('\n💰 FLUJO DE EFECTIVO');
    console.log('─'.repeat(65));
    const cajaIni    = p.cajaInicial     || 0;
    const cobros     = p.cobrosContado   || 0;
    const pagoOp     = p.pagoOperarios   || 0;
    const pagoAdmin  = p.pagoAdmin       || 0;
    const pagoPlanta = p.pagoPlanta      || 0;
    const pagoVend   = p.costoVendedores || 0;
    const pagoMP     = p.pagoMPbruto     || 0;
    const pagoMkt    = p.pagoMktTotal    || 0;
    const pagoImp    = p.pagoIVAPeriodoAnterior + (p.pagoIT||0) + (p.pagoIUE||0) || 0;
    const pagoInt    = p.pagoIntereses   || 0;
    const pagoAmort  = p.pagoAmortizacion|| 0;
    const flujoCaja  = p.cajaFinal - p.cajaInicial || 0;

    console.log(`  Caja inicial:                    ${fmtBs(cajaIni)}`);
    console.log(`  (+) Cobros contado:              ${fmtBs(cobros)}`);
    console.log(`  (−) Pago operarios:              ${fmtBs(pagoOp)}`);
    console.log(`  (−) Pago admin fijo:             ${fmtBs(pagoAdmin)}`);
    console.log(`  (−) Pago planta fija:            ${fmtBs(pagoPlanta)}`);
    console.log(`  (−) Pago vendedores:             ${fmtBs(pagoVend)}`);
    console.log(`  (−) Pago MP:                     ${fmtBs(pagoMP)}`);
    console.log(`  (−) Pago marketing:              ${fmtBs(pagoMkt)}`);
    console.log(`  (−) Pago impuestos:              ${fmtBs(pagoImp)}`);
    console.log(`  (−) Pago intereses:              ${fmtBs(pagoInt)}`);
    console.log(`  (−) Pago amortización:           ${fmtBs(pagoAmort)}`);
    console.log(`  = Variación neta de caja:        ${fmtBs(flujoCaja)}`);
    console.log(`  = CAJA FINAL:                    ${fmtBs(p.cajaFinal||0)}`);

    // ── PARTIDA DOBLE — VERIFICACIÓN ─────────────────────────────
    console.log('\n⚖️  VERIFICACIÓN PARTIDA DOBLE');
    console.log('─'.repeat(65));
    console.log(`  Δ Patrimonio = Utilidad Neta:    ${fmtBs(utilidadNeta)}`);
    const patAnterior = n === 1 ? 580000 : null;
    if (patAnterior !== null) {
      console.log(`  Pat T0 (capital inicial):        ${fmtBs(patAnterior)}`);
      console.log(`  Pat T1 esperado:                 ${fmtBs(patAnterior + utilidadNeta)}`);
      console.log(`  Pat T1 real:                     ${fmtBs(patrimonio)}`);
      const diffPat = Math.abs((patAnterior + utilidadNeta) - patrimonio);
      console.log(`  Δ Patrimonio cuadra:             ${diffPat <= 1 ? '✅' : '❌ Bs '+diffPat.toFixed(2)}`);
    }
    console.log(`\n  DEBE = HABER:`);
    console.log(`    Total Activos:                 ${fmtBs(totalActivos)}`);
    console.log(`    Total Pasivos + Patrimonio:    ${fmtBs(totalPasivos + patrimonio)}`);
    console.log(`    Diferencia:                    ${fmtBs(totalActivos - totalPasivos - patrimonio)}`);
  }

  await pool.end();
}
run().catch(e => { console.error('ERROR:', e.message); pool.end(); });
