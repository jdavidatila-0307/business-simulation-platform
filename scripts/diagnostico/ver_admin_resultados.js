process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const r = await pool.query("SELECT resultados FROM sim_rondas WHERE numero=2 ORDER BY creada_at DESC LIMIT 1");
  if (!r.rows[0]) { console.log('Sin ronda 2'); return; }
  const res = r.rows[0].resultados?.resultados || {};
  const keys = Object.keys(res);
  console.log(`\nTotal entradas en resultados: ${keys.length}`);
  keys.slice(0,5).forEach(k => {
    const v = res[k];
    console.log(`\n  clave: ${k}`);
    console.log(`    equipoOriginal: ${v.equipoOriginal}`);
    console.log(`    equipo:         ${v.equipo}`);
    console.log(`    equipoNombre:   ${v.equipoNombre}`);
  });
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
