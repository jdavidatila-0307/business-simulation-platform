/**
 * contar_simulaciones.js — SimNego v3.2
 * Diagnóstico (solo lectura): cuenta y lista TODAS las simulaciones
 * registradas en producción (Supabase/PostgreSQL).
 *
 * Uso (PowerShell / cmd, desde la raíz del proyecto):
 *   set DATABASE_URL=postgresql://...   (si no está ya en el entorno)
 *   node contar_simulaciones.js
 *
 * No modifica nada. No respeta ni altera rondas cerradas: solo SELECT.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está definida en el entorno.');
  console.error('   Define la variable y vuelve a ejecutar:');
  console.error('   set DATABASE_URL=postgresql://postgres.<...>@<host>:5432/postgres');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 5000,
});

function pad(s, n) { s = String(s == null ? '' : s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

async function main() {
  // 1) Todas las simulaciones (orden cronológico de creación)
  const sims = await pool.query(
    `SELECT id, nombre, codigo_acceso, estado, creada_at, users
       FROM simulaciones
      ORDER BY creada_at ASC`
  );

  // 2) Conteo de rondas por simulación (totales y calculadas)
  const rondas = await pool.query(
    `SELECT simulacion_id,
            COUNT(*)                                          AS rondas_total,
            COUNT(calculada_at)                               AS rondas_calculadas,
            MAX(numero) FILTER (WHERE calculada_at IS NOT NULL) AS ultima_calculada,
            MAX(numero)                                        AS ultima_creada
       FROM sim_rondas
      GROUP BY simulacion_id`
  );
  const rmap = {};
  for (const r of rondas.rows) rmap[r.simulacion_id] = r;

  console.log('\n=== SIMULACIONES REGISTRADAS EN PRODUCCIÓN ===\n');
  console.log(
    pad('#', 3), pad('ID', 18), pad('NOMBRE', 18), pad('CÓDIGO', 10),
    pad('ESTADO', 9), pad('EQUIPOS', 8), pad('R.CALC', 7), pad('R.TOT', 6), 'CREADA'
  );
  console.log('-'.repeat(110));

  let totalSims = 0, totalEquipos = 0;
  for (const s of sims.rows) {
    totalSims++;
    let users = s.users;
    if (typeof users === 'string') { try { users = JSON.parse(users); } catch { users = []; } }
    const equipos = Array.isArray(users) ? users.filter(u => u && u.rol === 'equipo') : [];
    totalEquipos += equipos.length;

    const rr = rmap[s.id] || {};
    const creada = s.creada_at ? new Date(s.creada_at).toISOString().slice(0, 10) : '—';

    console.log(
      pad(totalSims, 3),
      pad(s.id, 18),
      pad(s.nombre, 18),
      pad(s.codigo_acceso, 10),
      pad(s.estado, 9),
      pad(equipos.length, 8),
      pad(rr.ultima_calculada != null ? rr.ultima_calculada : 0, 7),
      pad(rr.rondas_total != null ? rr.rondas_total : 0, 6),
      creada
    );
  }

  console.log('-'.repeat(110));
  console.log(`\n✅ TOTAL: ${totalSims} simulación(es) registrada(s) · ${totalEquipos} equipo(s) en total.\n`);

  // 3) Detalle de equipos por simulación
  for (const s of sims.rows) {
    let users = s.users;
    if (typeof users === 'string') { try { users = JSON.parse(users); } catch { users = []; } }
    const equipos = Array.isArray(users) ? users.filter(u => u && u.rol === 'equipo') : [];
    if (equipos.length === 0) continue;
    console.log(`• ${s.nombre} (${s.id}) — ${equipos.length} equipos:`);
    equipos.forEach((e, i) => {
      const nMiembros = Array.isArray(e.miembros) ? e.miembros.length : 0;
      console.log(`    Equipo ${i + 1}: ${pad(e.nombre, 18)} id=${e.id}  (${nMiembros} miembros)`);
    });
    console.log('');
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error('\n❌ Error:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
