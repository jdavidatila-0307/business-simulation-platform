process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const simId = sim.rows[0].id;

  // Ver R8 Raíz — ronda con decisión real enviada
  const r8 = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=8", [simId]
  );
  const res8 = r8.rows[0].resultados?.resultados || {};
  const raizR8 = Object.values(res8).find(r =>
    (r.equipoOriginal||r.equipo||'').includes('raz') && r.productoId === 'prod_1'
  );

  console.log('\n=== CAMPOS BALANCE RAÍZ R8 ===');
  const camposBalance = [
    'cajaInicial','cajaFinal',
    'cxcInicial','cxcFinal',
    'invFinalValorizado','inventarioFinal',
    'activosFijosIniciales','afNetos',
    'totalActivos',
    'deudaInicial','deudaFinal',
    'ivaAPagar','sobregiro',
    'capitalContable',
    'resultadoAcumuladoAnterior','resultadoAcumulado',
    'utilidadNeta',
    'patrimonio',
    'depreciacion',
  ];
  camposBalance.forEach(c => {
    const v = raizR8?.[c];
    console.log(`  ${c.padEnd(30)}: ${v !== undefined ? Math.round(v||0).toLocaleString() : 'undefined'}`);
  });

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
