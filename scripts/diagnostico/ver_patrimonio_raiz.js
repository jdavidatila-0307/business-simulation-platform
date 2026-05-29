process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id FROM simulaciones WHERE estado='activa' LIMIT 1");
  const simId = sim.rows[0].id;

  console.log('\n=== RESULTADOS ACUMULADOS RAÍZ R1-R11 ===\n');

  for (let n = 1; n <= 11; n++) {
    const r = await pool.query(
      "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2", [simId, n]
    );
    if (!r.rows[0]) { console.log(`R${n}: no existe`); continue; }

    const res = r.rows[0].resultados?.resultados || {};
    const raiz = Object.values(res).find(r =>
      (r.equipoOriginal || r.equipo || '').includes('raz') && r.productoId === 'prod_1'
    );

    if (!raiz) { console.log(`R${n}: sin resultado Raíz`); continue; }

    console.log(`R${n}: utilidadNeta=${Math.round(raiz.utilidadNeta||0).toLocaleString()} | resultadoAcumulado=${Math.round(raiz.resultadoAcumulado||0).toLocaleString()} | resultadoAcumuladoAnterior=${Math.round(raiz.resultadoAcumuladoAnterior||0).toLocaleString()} | capitalContable=${Math.round(raiz.capitalContable||0).toLocaleString()}`);
  }

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
