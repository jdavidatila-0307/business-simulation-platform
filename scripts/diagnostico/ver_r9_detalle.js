process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const simId = sim.rows[0].id;
  const ronda = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [simId]
  );
  const res = ronda.rows[0]?.resultados?.resultados || {};
  
  // Mostrar Raíz completo
  const raiz = Object.values(res).find(r => r.equipoNombre === 'Raíz');
  if (raiz) {
    console.log('\n=== Raíz — todos los campos ===');
    Object.entries(raiz).forEach(([k,v]) => {
      if (v !== undefined && v !== null && v !== 0 && v !== '') 
        console.log(`  ${k}: ${JSON.stringify(v)}`);
    });
  }

  // Mostrar GrowStep completo  
  const gs = Object.values(res).find(r => r.equipoNombre === 'GrowStep Kids');
  if (gs) {
    console.log('\n=== GrowStep Kids — campos financieros ===');
    const campos = ['cajaInicial','cajaFinal','cxcInicial','cxcFinal',
      'deudaInicial','deudaFinal','activosFijosIniciales','afNetos',
      'totalActivos','patrimonio','resultadoAcumulado','resultadoAcumuladoAnterior',
      'gastosOp','gastoAdminFijo','gastoFijoPlanta','costoVendedores','costoOperarios',
      'depreciacion','totalPagos','cobrosContado','ingresoPrestamo',
      'vendedoresIniciales','vendedoresFinales','operariosIniciales','operariosFinales'];
    campos.forEach(c => console.log(`  ${c}: ${gs[c]}`));
  }
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
