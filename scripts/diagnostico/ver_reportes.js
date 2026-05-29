process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const rondas = await pool.query(
    "SELECT numero, resultados FROM sim_rondas ORDER BY numero"
  );

  console.log(`\nRondas encontradas: ${rondas.rows.length}`);

  for (const r of rondas.rows) {
    const res = r.resultados || {};
    const reportes = res.reportes || {};
    const nReportes = Object.keys(reportes).length;
    console.log(`\n── Ronda ${r.numero} ─────────────────────────`);
    console.log(`  Equipos con reportes: ${nReportes}`);

    Object.entries(reportes).forEach(([eqId, rep]) => {
      const inv = rep.investigacion;
      if (!inv) {
        console.log(`  ${eqId.slice(-15)}: Sin investigación`);
      } else {
        console.log(`  ${eqId.slice(-15)}: ${inv.tipo} — ${inv.titulo?.slice(0,30)}`);
      }
    });
  }

  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
