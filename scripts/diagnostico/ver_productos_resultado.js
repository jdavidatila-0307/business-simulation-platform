process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT resultados FROM sim_rondas ORDER BY creada_at DESC LIMIT 1');
  const res = r.rows[0]?.resultados?.resultados || {};
  const eq1 = Object.values(res)[0];
  if (!eq1) { console.log('Sin resultados'); return; }

  console.log('\n=== ESTRUCTURA DE UN RESULTADO DE EQUIPO ===');
  console.log('Equipo:', eq1.equipoNombre);
  console.log('\nCampos disponibles:');
  Object.entries(eq1).forEach(([k, v]) => {
    if (typeof v !== 'object') console.log(`  ${k}: ${v}`);
  });

  console.log('\n=== ¿Tiene productos[]? ===');
  if (eq1.productos) {
    console.log('Sí, cantidad:', eq1.productos.length);
    console.log('Primer producto keys:', Object.keys(eq1.productos[0] || {}));
  } else {
    console.log('No tiene array productos');
  }

  console.log('\n=== ¿Tiene consolidado? ===');
  if (eq1.consolidado) {
    console.log('Sí:', JSON.stringify(eq1.consolidado).slice(0,200));
  } else {
    console.log('No');
  }

  await pool.end();
}
main().catch(e => console.error(e.message));
