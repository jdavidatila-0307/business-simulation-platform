process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query(
    "SELECT id, parametros, users FROM simulaciones WHERE estado='activa' LIMIT 1"
  );
  const s = sim.rows[0];

  // Parámetros del simulador
  console.log('\n=== PARÁMETROS INDUSTRIA ===');
  const p = s.parametros;
  console.log(`  gastoAdminFijo:            Bs ${p.gastoAdminFijo}`);
  console.log(`  gastoFijoPlanta:           Bs ${p.gastoFijoPlanta}`);
  console.log(`  sueldoTrimestralVendedor:  Bs ${p.sueldoTrimestralVendedor}`);
  console.log(`  costoOperario:             Bs ${p.costoOperario}`);
  console.log(`  depreciacionTrimestral:    Bs ${p.depreciacionTrimestral}`);
  console.log(`  cajaInicial:               Bs ${p.cajaInicial}`);

  // Decisión de Raíz en R9
  const r9 = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [s.id]
  );
  const decs = r9.rows[0]?.resultados?.decisiones || {};
  const raizKey = Object.keys(decs).find(k => k.includes('raz'));
  const raiz = decs[raizKey];

  console.log('\n=== DECISIÓN RAÍZ R9 ===');
  if (raiz) {
    ['cajaInicial','deudaInicial','activosFijosIniciales','vendedoresIniciales',
     'operariosIniciales','brandEquityInicial','cxcInicial',
     'resultadoAcumuladoAnterior'].forEach(c =>
      console.log(`  ${c}: ${raiz[c]}`)
    );
  }

  // Resultado R8 de Raíz para comparar
  const r8 = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=8", [s.id]
  );
  const res8 = r8.rows[0]?.resultados?.resultados || {};
  const raizR8 = Object.values(res8).find(r =>
    (r.equipoOriginal || r.equipo || '').includes('raz') && r.productoId === 'prod_1'
  );

  console.log('\n=== RESULTADO RAÍZ R8 (prod_1) ===');
  if (raizR8) {
    ['cajaFinal','deudaFinal','afNetos','cxcFinal','vendedoresFinales',
     'operariosFinales','brandEquityFinal','resultadoAcumulado'].forEach(c =>
      console.log(`  ${c}: ${raizR8[c]}`)
    );
  }

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
