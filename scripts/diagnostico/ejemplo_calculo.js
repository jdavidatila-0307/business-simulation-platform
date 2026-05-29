process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const simId = sim.rows[0].id;

  // Tomar GrowStep Kids Ronda 8 (mejor empresa, 1 producto en esa ronda)
  const ronda = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=8", [simId]
  );
  const res = ronda.rows[0].resultados;

  // Buscar GrowStep con 1 producto
  const resultados = Object.values(res.resultados || {});
  const growstep = resultados.find(r =>
    r.equipoNombre === 'GrowStep Kids' && r.productoId === 'prod_1'
  );
  const dec = res.decisiones?.[growstep?.equipo] ||
    Object.values(res.decisiones || {}).find(d =>
      (d.equipoNombre === 'GrowStep Kids' || d.equipo?.includes('growstep'))
      && d.productoId === 'prod_1'
    );

  console.log("\n=== DECISIÓN GrowStep Kids R8 ===");
  if (dec) {
    const campos = ['producto','segmentoObjetivo','precioVenta','produccion',
      'calidad','canalPrincipal','publicidad','promocion','eventos',
      'marketingRedes','relacionesPublicas','contratarVendedores',
      'vendedoresIniciales','operariosIniciales','montoPrestamo',
      'cajaInicial','deudaInicial','activosFijosIniciales',
      'inventarioInicial','brandEquityInicial','cxcInicial'];
    campos.forEach(c => { if (dec[c] !== undefined) console.log(`  ${c}: ${dec[c]}`); });
  }

  console.log("\n=== RESULTADO GrowStep Kids R8 ===");
  if (growstep) {
    const campos = ['ventasBrutas','ventasNetas','ventasReales','costoVentas',
      'utilidadBruta','gastosOp','gastoFinanciero','ebit',
      'ivaAPagar','impuestoIT','impuestoIUE','totalImpuestos','utilidadNeta',
      'cajaFinal','cxcFinal','invFinalValorizado','afNetos',
      'deudaFinal','patrimonio','totalActivos',
      'cobrosContado','totalPagos','ingresoPrestamo',
      'shareReal','brandEquityFinal','costoUnitario',
      'vendedoresFinales','operariosFinales'];
    campos.forEach(c => { if (growstep[c] !== undefined) console.log(`  ${c}: ${growstep[c]}`); });
  }

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
