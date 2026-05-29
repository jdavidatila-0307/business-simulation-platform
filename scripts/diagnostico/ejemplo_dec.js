process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const simId = sim.rows[0].id;

  // Buscar en sim_decisiones
  const decs = await pool.query(
    `SELECT equipo_id, decisiones FROM sim_decisiones 
     WHERE simulacion_id=$1 AND ronda_numero=8 
     AND equipo_id LIKE '%growstep%'`, [simId]
  );
  
  console.log(`\nDecisiones GrowStep R8: ${decs.rows.length}`);
  decs.rows.forEach(d => {
    const dec = d.decisiones;
    console.log(`\n  equipo_id: ${d.equipo_id}`);
    const campos = ['producto','segmentoObjetivo','precioVenta','produccion',
      'calidad','canalPrincipal','publicidad','promocion','eventos',
      'marketingRedes','relacionesPublicas','contratarVendedores','despedirVendedores',
      'vendedoresIniciales','contratarOperarios','operariosIniciales',
      'montoPrestamo','tipoPrestamo',
      'cajaInicial','deudaInicial','activosFijosIniciales',
      'inventarioInicial','brandEquityInicial','cxcInicial',
      'submitted'];
    campos.forEach(c => { if (dec[c] !== undefined) console.log(`    ${c}: ${dec[c]}`); });
  });

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
