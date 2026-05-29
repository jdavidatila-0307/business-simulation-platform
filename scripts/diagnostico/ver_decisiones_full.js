process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT equipo_id, decisiones FROM sim_decisiones WHERE ronda_numero=1 ORDER BY equipo_id');
  r.rows.forEach(row => {
    const d = row.decisiones;
    console.log(`\nEquipo: ${row.equipo_id.slice(-8)}`);
    console.log(`  formato: ${Array.isArray(d.productos) && d.productos.length ? 'multiproducto' : 'legado'}`);
    console.log(`  contratarVendedores (raíz): ${d.contratarVendedores} (${typeof d.contratarVendedores})`);
    if (Array.isArray(d.productos) && d.productos[0]) {
      console.log(`  contratarVendedores (prod[0]): ${d.productos[0].contratarVendedores}`);
      console.log(`  contratarOperarios (prod[0]):  ${d.productos[0].contratarOperarios}`);
    }
    console.log(`  vendedoresIniciales: ${d.vendedoresIniciales}`);
    console.log(`  contratarOperarios:  ${d.contratarOperarios}`);
  });
  await pool.end();
}
main().catch(e => console.error(e.message));
