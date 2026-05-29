process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query('SELECT equipo_id, decisiones FROM sim_decisiones WHERE ronda_numero=1 ORDER BY equipo_id');
  r.rows.forEach(row => {
    const d = row.decisiones;
    console.log(`\nEquipo: ${row.equipo_id.slice(-8)}`);
    console.log(`  contratarVendedores: ${JSON.stringify(d.contratarVendedores)} (tipo: ${typeof d.contratarVendedores})`);
    console.log(`  contratarOperarios:  ${JSON.stringify(d.contratarOperarios)} (tipo: ${typeof d.contratarOperarios})`);
    console.log(`  vendedoresIniciales: ${JSON.stringify(d.vendedoresIniciales)} (tipo: ${typeof d.vendedoresIniciales})`);
    console.log(`  montoPrestamo:       ${JSON.stringify(d.montoPrestamo)} (tipo: ${typeof d.montoPrestamo})`);
    console.log(`  montoInnovacion:     ${JSON.stringify(d.montoInnovacion)} (tipo: ${typeof d.montoInnovacion})`);
  });
  await pool.end();
}
main().catch(e => console.error(e.message));
