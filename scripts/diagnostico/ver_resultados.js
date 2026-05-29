process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT * FROM sim_rondas ORDER BY creada_at DESC LIMIT 1');
  const ronda = r.rows[0];
  if (!ronda) { console.log('No hay rondas'); return; }

  console.log(`\n══════════════════════════════════════════`);
  console.log(`RONDA ${ronda.numero} | Estado: ${ronda.estado}`);
  console.log(`══════════════════════════════════════════`);

  const res = ronda.resultados;

  // ── Segmentos de mercado ──────────────────────────────────
  console.log('\n── MERCADO SEGMENTOS ───────────────────');
  const segs = res.mercadoSegmentos || [];
  segs.forEach(s => {
    console.log(`  ${s.nombre}`);
    console.log(`    demandaBase: ${s.demandaBase} | formal: ${s.demandaFormal} | contrabando: ${(s.pctContrabando*100).toFixed(0)}%`);
  });

  // ── Resultados por equipo ─────────────────────────────────
  console.log('\n── RESULTADOS POR EQUIPO ───────────────');
  const resultados = Object.values(res.resultados || {});
  resultados.forEach(eq => {
    console.log(`\n  Equipo: ${eq.equipoNombre || eq.equipo}`);
    console.log(`  Producto:        ${eq.producto}`);
    console.log(`  Segmento:        ${eq.segmento || eq.segmentoObjetivo}`);
    console.log(`  Precio:          Bs ${eq.precioVenta}`);
    console.log(`  CU:              Bs ${eq.costoUnitario}`);
    console.log(`  Margen unit.:    Bs ${(eq.precioVenta - eq.costoUnitario).toFixed(2)}`);
    console.log(`  Producción:      ${eq.produccion}`);
    console.log(`  Share real:      ${(eq.shareReal*100).toFixed(2)}%`);
    console.log(`  Demanda formal:  ${eq.demandaFormal}`);
    console.log(`  Ventas:          ${eq.ventasReales}`);
    console.log(`  Inv. final:      ${eq.inventarioFinal}`);
    console.log(`  Ventas brutas:   Bs ${eq.ventasBrutas}`);
    console.log(`  Ventas netas:    Bs ${eq.ventasNetas}`);
    console.log(`  Utilidad bruta:  Bs ${eq.utilidadBruta}`);
    console.log(`  Utilidad neta:   Bs ${eq.utilidadNeta}`);
    console.log(`  EBIT:            Bs ${eq.ebit}`);
    console.log(`  Caja final:      Bs ${eq.cajaFinal}`);
    console.log(`  Brand Equity:    ${eq.brandEquityFinal?.toFixed(1)} pts`);
    console.log(`  IVA pagado:      Bs ${eq.ivaAPagar ?? 'N/A'}`);
    console.log(`  IT pagado:       Bs ${eq.impuestoIT ?? 'N/A'}`);
    console.log(`  IUE pagado:      Bs ${eq.impuestoIUE ?? 'N/A'}`);
    console.log(`  Operarios:       ${eq.operariosFinales ?? 'N/A'}`);
    console.log(`  Cap. efectiva:   ${eq.capacidadEfectiva ?? 'N/A'}`);
    console.log(`  Stock MP final:  ${eq.stockMPFinal ?? 'N/A'}`);
  });

  // ── Dashboard fiscal ──────────────────────────────────────
  console.log('\n── DASHBOARD FISCAL ────────────────────');
  const df = res.dashboard || {};
  console.log(`  Total IT:          Bs ${df.totalIT ?? 'N/A'}`);
  console.log(`  Total IVA:         Bs ${df.totalIVA ?? 'N/A'}`);
  console.log(`  Total IUE:         Bs ${df.totalIUE ?? 'N/A'}`);
  console.log(`  Total impuestos:   Bs ${df.totalImpuestos ?? 'N/A'}`);
  console.log(`  Presión fiscal:    ${df.presionFiscalPct ?? 'N/A'}%`);

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
