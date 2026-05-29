process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT resultados FROM sim_rondas ORDER BY creada_at DESC LIMIT 1');
  const res = r.rows[0]?.resultados?.resultados || {};

  console.log('\n══════════════════════════════════════════');
  console.log('  BALANCE GENERAL — VERIFICACIÓN');
  console.log('══════════════════════════════════════════');

  Object.values(res).forEach(eq => {
    const nombre = eq.equipoNombre || eq.equipo;

    // Activos
    const caja    = eq.cajaFinal         || 0;
    const cxc     = eq.cxcFinal          || 0;
    const inv     = eq.invFinalValorizado || 0;
    const af      = eq.afNetos           || 0;
    const totalA  = eq.totalActivos      || 0;
    const sumaA   = Math.round((caja + cxc + inv + af) * 100) / 100;

    // Pasivos
    const deuda   = eq.deudaFinal        || 0;

    // Patrimonio
    const capital = eq.capitalContable   || 0;
    const resAcum = eq.resultadoAcumulado|| 0;
    const patrim  = eq.patrimonio        || 0;
    const sumaP   = Math.round((deuda + patrim) * 100) / 100;

    const cuadra  = Math.abs(totalA - sumaP) < 1;

    console.log(`\n── Equipo ${nombre} ─────────────────────────`);
    console.log(`  ACTIVOS`);
    console.log(`    Caja:                Bs ${caja.toLocaleString()}`);
    console.log(`    CxC:                 Bs ${cxc.toLocaleString()}`);
    console.log(`    Inventarios:         Bs ${inv.toLocaleString()}`);
    console.log(`    Activos fijos netos: Bs ${af.toLocaleString()}`);
    console.log(`    SUMA calculada:      Bs ${sumaA.toLocaleString()}`);
    console.log(`    totalActivos motor:  Bs ${totalA.toLocaleString()}`);
    console.log(`    ¿Coinciden?          ${Math.abs(sumaA - totalA) < 1 ? '✅' : '⚠ DIFERENCIA: Bs '+(sumaA-totalA).toFixed(2)}`);

    console.log(`  PASIVOS + PATRIMONIO`);
    console.log(`    Deuda total:         Bs ${deuda.toLocaleString()}`);
    console.log(`    Capital contable:    Bs ${capital.toLocaleString()}`);
    console.log(`    Resultado acumulado: Bs ${resAcum.toLocaleString()}`);
    console.log(`    Patrimonio motor:    Bs ${patrim.toLocaleString()}`);
    console.log(`    Suma P+P:            Bs ${sumaP.toLocaleString()}`);

    console.log(`\n  ECUACIÓN CONTABLE: Activos = Pasivos + Patrimonio`);
    console.log(`    ${totalA.toLocaleString()} = ${deuda.toLocaleString()} + ${patrim.toLocaleString()} = ${sumaP.toLocaleString()}`);
    console.log(`    ${cuadra ? '✅ CUADRA' : '❌ NO CUADRA — diferencia: Bs ' + (totalA - sumaP).toFixed(2)}`);

    // Verificación contable manual
    console.log(`\n  VERIFICACIÓN MANUAL`);
    console.log(`    Capital inicial esperado: Bs ${(360000 + 96000).toLocaleString()} (activos fijos + caja)`);
    console.log(`    Utilidad neta:            Bs ${(eq.utilidadNeta||0).toLocaleString()}`);
    console.log(`    Patrimonio esperado:      Bs ${(capital + resAcum).toLocaleString()}`);
    console.log(`    Patrimonio motor:         Bs ${patrim.toLocaleString()}`);
    console.log(`    ¿Coincide?                ${Math.abs(patrim - (capital + resAcum)) < 1 ? '✅' : '❌ DIFERENCIA: Bs '+(patrim-(capital+resAcum)).toFixed(2)}`);
  });

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
