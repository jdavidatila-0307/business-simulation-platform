const { Pool } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const sim = 'sim_mpuc7jpq';
  
  const simRow = await pool.query(`SELECT users, parametros, config FROM simulaciones WHERE id = $1`, [sim]);
  const users = simRow.rows[0]?.users || [];
  const params = simRow.rows[0]?.parametros || {};
  const proveedores = simRow.rows[0]?.config?.proveedores || [];
  const eqR = users.find(u => u.nombre === 'r');
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`DIAGNÓSTICO COMPLETO — Equipo r (${eqR.id})`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\nPARÁMETROS CLAVE:`);
  console.log(`  cajaInicial:          Bs ${params.cajaInicial}`);
  console.log(`  operariosIniciales:   ${params.operariosIniciales}`);
  console.log(`  productividadBase:    ${params.productividadBase}`);
  console.log(`  unidadesMPporUnidad:  ${params.unidadesMPporUnidad}`);
  console.log(`  pctMateriaPrima:      ${params.pctMateriaPrima}`);

  console.log(`\nPROVEEDORES:`);
  proveedores.forEach(p => console.log(`  ${p.id}: ${p.nombre} | LT=${p.leadTime} | factor=${p.factorCosto}`));

  for (const n of [1, 2, 3]) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`TRIMESTRE ${n}`);
    console.log('─'.repeat(60));

    // Decisiones completas
    const dec = await pool.query(`SELECT decisiones FROM sim_decisiones 
      WHERE simulacion_id=$1 AND ronda_numero=$2 AND equipo_id=$3 AND producto_id='prod_1'`,
      [sim, n, eqR.id]);
    
    if (dec.rowCount) {
      const d = dec.rows[0].decisiones || {};
      const prod = (d.productos || [])[0] || d;
      console.log('\nDECISIÓN GUARDADA:');
      console.log(`  precio:            Bs ${prod.precioVenta || d.precioVenta}`);
      console.log(`  calidad:           ${prod.calidad || d.calidad}`);
      console.log(`  produccion:        ${prod.produccion || d.produccion}`);
      console.log(`  proveedor:         ${prod.proveedorElegido || d.proveedorElegido}`);
      console.log(`  cantidadMP:        ${prod.cantidadMPpedida || d.cantidadMPpedida}`);
      console.log(`  operariosIni:      ${prod.operariosIniciales ?? d.operariosIniciales}`);
      console.log(`  contratarOp:       ${prod.contratarOperarios || d.rrhh?.contratarOperarios || 0}`);
      console.log(`  stockMPInicial:    ${prod.stockMPInicial ?? d.stockMPInicial ?? '—'}`);
      console.log(`  cajaInicial:       Bs ${prod.cajaInicial ?? d.cajaInicial ?? '—'}`);
      console.log(`  pedidosPendientes: ${JSON.stringify(prod.pedidosPendientes || d.pedidosPendientes || [])}`);
      console.log(`  inventarioInicial: ${prod.inventarioInicial ?? d.inventarioInicial ?? '—'}`);
    }

    // Resultados completos
    const r = await pool.query(`SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2`, [sim, n]);
    const res = r.rows[0]?.resultados?.resultados || {};
    const eqRes = Object.entries(res).find(([k]) => k.includes(eqR.id.slice(-8)));
    
    if (eqRes) {
      const p = eqRes[1].prod_1 || eqRes[1];
      console.log('\nRESULTADO MOTOR:');
      console.log(`  stockMPInicial:    ${p.stockMPInicial ?? '—'}`);
      console.log(`  stockMPFinal:      ${p.stockMPFinal ?? '—'}`);
      console.log(`  pedidosPendResta:  ${JSON.stringify(p.pedidosPendientesResta || [])}`);
      console.log(`  produccion real:   ${p.produccion || 0} unid`);
      console.log(`  capEfectiva:       ${p.capacidadEfectiva || '—'}`);
      console.log(`  operariosIni:      ${p.operariosIniciales ?? '—'}`);
      console.log(`  operariosFin:      ${p.operariosFinales ?? '—'}`);
      console.log(`  inventarioFinal:   ${p.inventarioFinal || 0}`);
      console.log(`  demandaFormal:     ${p.demandaFormal || '—'}`);
      console.log(`  demandaAsignada:   ${p.demandaAsignada || 0}`);
      console.log(`  share:             ${p.shareReal ? (p.shareReal*100).toFixed(2)+'%' : '—'}`);
      console.log(`  atractivo:         ${p.atractivo ?? '—'}`);
      console.log(`  ventasReales:      ${p.ventasReales || 0}`);
      console.log(`  ventasBrutas:      Bs ${p.ventasBrutas || 0}`);
      console.log(`  costoVentas:       Bs ${p.costoVentas || 0}`);
      console.log(`  gastosOp:          Bs ${p.gastosOp || 0}`);
      console.log(`  utilidadNeta:      Bs ${p.utilidadNeta || 0}`);
      console.log(`  cajaFinal:         Bs ${p.cajaFinal || 0}`);
      console.log(`  totalActivos:      Bs ${p.totalActivos || 0}`);
      console.log(`  totalPasivos:      Bs ${(p.totalPasivos ?? p.deudaFinal ?? 0)}`);
      console.log(`  patrimonio:        Bs ${p.patrimonio || 0}`);
      const activos = p.totalActivos || 0;
      const pasivos = p.totalPasivos !== undefined ? p.totalPasivos : (p.deudaFinal || 0);
      const pat = p.patrimonio || 0;
      const desc = Math.round(Math.abs(activos - pasivos - pat));
      console.log(`  A=P+Pat:           ${desc <= 1 ? '✅' : '❌ DESCUADRE Bs '+desc}`);
    } else {
      console.log('\nRESULTADO: ❌ No encontrado');
    }
  }

  await pool.end();
}
run().catch(e => { console.error('ERROR:', e.message); pool.end(); });
