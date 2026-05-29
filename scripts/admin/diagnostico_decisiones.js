/**
 * diagnostico_decisiones.js — SimNego v3.2
 * Solo lectura. Muestra el estado real de las decisiones de cada equipo
 * en la ronda actual: qué hay en BD vs. lo que muestra el panel.
 *
 * Uso:
 *   node diagnostico_decisiones.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no definida'); process.exit(1); }
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 5000,
});

async function main() {
  // Simulación activa
  const sims = await pool.query(`SELECT id, nombre, config FROM simulaciones ORDER BY creada_at DESC LIMIT 1`);
  const sim = sims.rows[0];
  if (!sim) { console.log('❌ No hay simulaciones'); await pool.end(); return; }
  const rondaNum = sim.config?.currentRound || 1;
  console.log(`\n▶ Sim: ${sim.nombre} (${sim.id}) | Ronda actual: ${rondaNum}`);

  // Equipos
  const equipos = (sim.config?.users || []).filter ? [] : [];
  const simFull = await pool.query(`SELECT users FROM simulaciones WHERE id=$1`, [sim.id]);
  const users = simFull.rows[0]?.users || [];
  const eqs = Array.isArray(users) ? users.filter(u => u.rol === 'equipo') : [];

  // Decisiones en BD para esta ronda
  const decs = await pool.query(
    `SELECT equipo_id, producto_id, decisiones, enviada_at
       FROM sim_decisiones
      WHERE simulacion_id=$1 AND ronda_numero=$2
      ORDER BY equipo_id`,
    [sim.id, rondaNum]
  );

  // Ronda
  const ronda = await pool.query(
    `SELECT estado, resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2`,
    [sim.id, rondaNum]
  );
  const rondaEstado = ronda.rows[0]?.estado || 'no existe';

  console.log(`\n═══ RONDA ${rondaNum} — Estado: ${rondaEstado} ═══\n`);
  console.log(`Equipos registrados: ${eqs.length}`);
  console.log(`Decisiones en BD:    ${decs.rows.length}\n`);

  // Tabla por equipo
  for (const eq of eqs) {
    const dec = decs.rows.find(d => d.equipo_id === eq.id);
    const d = dec ? (typeof dec.decisiones === 'string' ? JSON.parse(dec.decisiones) : dec.decisiones) : null;
    const submitted   = d?.submitted || false;
    const submittedAt = dec?.enviada_at ? new Date(dec.enviada_at).toLocaleString('es-BO') : '—';
    const precio      = d?.precioVenta || d?.productos?.[0]?.precioVenta || 0;
    const produccion  = d?.produccion  || d?.productos?.[0]?.produccion  || 0;
    const segmento    = d?.segmentoObjetivo || d?.productos?.[0]?.segmentoObjetivo || '—';
    const cajaInicial = d?.cajaInicial ?? '—';

    console.log(`Equipo: ${eq.nombre}`);
    console.log(`  ID:          ${eq.id}`);
    console.log(`  En BD:       ${dec ? '✅ SÍ' : '❌ NO (sin registro)'}`);
    console.log(`  submitted:   ${submitted ? '✅ true' : '❌ false'}`);
    console.log(`  enviada_at:  ${submittedAt}`);
    console.log(`  precio:      ${precio} | produccion: ${produccion} | segmento: ${segmento}`);
    console.log(`  cajaInicial: ${cajaInicial}`);
    console.log('');
  }

  // ¿Hay decisiones en BD sin equipo en sim.users? (swap/huérfanas)
  const idsEquipos = new Set(eqs.map(e => e.id));
  const huerfanas = decs.rows.filter(d => !idsEquipos.has(d.equipo_id));
  if (huerfanas.length) {
    console.log('⚠ DECISIONES SIN EQUIPO COINCIDENTE (posible swap):');
    huerfanas.forEach(h => console.log(`  equipo_id: ${h.equipo_id}`));
  }

  await pool.end();
}
main().catch(async e => { console.error('❌', e.message); try { await pool.end(); } catch {} process.exit(1); });
