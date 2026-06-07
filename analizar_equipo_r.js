const { Pool } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const sim = 'sim_mpuc7jpq';
  
  // Buscar ID del equipo r
  const simRow = await pool.query(`SELECT users FROM simulaciones WHERE id = $1`, [sim]);
  const users = simRow.rows[0]?.users || [];
  const eqR = users.find(u => u.nombre === 'r');
  if (!eqR) { console.log('❌ Equipo r no encontrado'); await pool.end(); return; }
  console.log(`Equipo: ${eqR.nombre} | ID: ${eqR.id}\n`);

  for (const n of [1, 2, 3]) {
    console.log(`${'='.repeat(55)}`);
    console.log(`TRIMESTRE ${n}`);
    console.log('='.repeat(55));

    // Decisiones
    const dec = await pool.query(`SELECT decisiones FROM sim_decisiones 
      WHERE simulacion_id=$1 AND ronda_numero=$2 AND equipo_id=$3 AND producto_id='prod_1'`,
      [sim, n, eqR.id]);
    
    if (!dec.rowCount) {
      console.log('❌ Sin decisiones guardadas\n');
    } else {
      const d = dec.rows[0].decisiones || {};
      const prod = (d.productos || [])[0] || d;
      console.log('DECISIONES:');
      console.log(`  Segmento:      ${prod.segmentoObjetivo || d.segmento || '—'}`);
      console.log(`  Producto:      ${prod.producto || d.producto || '—'}`);
      console.log(`  Precio:        Bs ${prod.precioVenta || d.precioVenta || '—'}`);
      console.log(`  Calidad:       ${prod.calidad || d.calidad || '—'}`);
      console.log(`  Producción:    ${prod.produccion || d.produccion || '—'} unid`);
      console.log(`  Proveedor:     ${prod.proveedorElegido || d.proveedorElegido || '—'}`);
      console.log(`  MP pedida:     ${prod.cantidadMPpedida || d.cantidadMPpedida || '—'}`);
      console.log(`  Publicidad:    Bs ${prod.publicidad || d.publicidad || 0}`);
      console.log(`  Operarios ini: ${prod.operariosIniciales ?? d.operariosIniciales ?? '—'}`);
      console.log(`  Contratar op:  ${prod.contratarOperarios || d.rrhh?.contratarOperarios || 0}`);
    }

    // Resultados
    const r = await pool.query(`SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2`, [sim, n]);
    const res = r.rows[0]?.resultados?.resultados || {};
    const eqRes = Object.entries(res).find(([k]) => k.includes(eqR.id.slice(-8)));
    
    if (!eqRes) {
      console.log('\nRESULTADOS: ❌ No encontrados');
    } else {
      const p = eqRes[1].prod_1 || eqRes[1];
      console.log('\nRESULTADOS:');
      console.log(`  stockMP ini:   ${p.stockMPInicial ?? '—'}`);
      console.log(`  stockMP fin:   ${p.stockMPFinal ?? '—'}`);
      console.log(`  producción:    ${p.produccion || 0} unid`);
      console.log(`  cap.efectiva:  ${p.capacidadEfectiva || '—'}`);
      console.log(`  inventario:    ${p.inventarioFinal || 0} unid`);
      console.log(`  demandaAsig:   ${p.demandaAsignada || 0} unid`);
      console.log(`  ventasReales:  ${p.ventasReales || 0} unid`);
      console.log(`  ventasBrutas:  Bs ${p.ventasBrutas || 0}`);
      console.log(`  share:         ${p.shareReal ? (p.shareReal*100).toFixed(2)+'%' : '—'}`);
      console.log(`  utilidadNeta:  Bs ${p.utilidadNeta || 0}`);
      console.log(`  cajaFinal:     Bs ${p.cajaFinal || 0}`);
      console.log(`  pedidosPend:   ${p.pedidosPendientesResta?.length || 0}`);
      console.log(`  operariosFin:  ${p.operariosFinales || '—'}`);
    }
    console.log('');
  }

  await pool.end();
}
run().catch(e => { console.error('ERROR:', e.message); pool.end(); });
