const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});
const SIM_ID = 'sim_mpi8g7y5';

async function main() {
  const client = await pool.connect();
  try {
    const simR = await client.query(`SELECT * FROM simulaciones WHERE id=$1`, [SIM_ID]);
    const sim  = simR.rows[0];
    const equipos = sim.users || [];
    console.log('Equipos:', equipos.length, equipos.map(e=>e.nombre||e.id).join(', '));

    const engine = require('./src/engine.js');

    for (const n of [1, 2]) {
      console.log(`\n--- Ronda ${n} ---`);
      try {
        const decR = await client.query(
          `SELECT decisiones FROM sim_decisiones
           WHERE simulacion_id=$1 AND ronda_numero=$2`, [SIM_ID, n]
        );
        const decisiones = decR.rows.map(r => r.decisiones);
        console.log('  decisiones:', decisiones.length);

        const simCfg = {
          params:             sim.parametros,
          tiposProducto:      sim.tipos_producto,
          canales:            sim.canales,
          segmentos:          sim.segmentos,
          afinidadMatrix:     sim.afinidad_matrix,
          competenciaExterna: sim.competencia_externa,
          demandaBaseAnteriorMap: {},
          rondaNumero:        n,
          proveedores:        sim.config?.proveedores || [],
          shock:              null,
          equipos,
        };

        const result = engine.ejecutarSimulador(decisiones, simCfg);
        const r0 = result.resultados?.[0];
        console.log(`  ✅ OK — ${result.resultados?.length} equipos`);
        if (r0) console.log(`  ${r0.equipoNombre}: caja=${r0.cajaFinal} util=${r0.utilidadNeta}`);
      } catch(e) {
        console.error(`  ❌ ERROR:`, e.message);
        console.error('  ', e.stack?.split('\n').slice(0,5).join('\n  '));
        break;
      }
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('FATAL:', e.message));
