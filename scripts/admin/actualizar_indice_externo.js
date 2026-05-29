/**
 * actualizar_indice_externo.js — SimNego v3.2
 * Calcula y actualiza el indiceExterno de cada segmento en la sim ABC
 * para que los competidores externos capturen su participación de referencia.
 *
 * Fórmula: indiceExterno = ln(n × X × exp(λ × avgAtractivo) / (1-X)) / λ
 *   donde X = participacionRef del competidor del segmento
 *         n = número de equipos (10)
 *         avgAtractivo = atractivo promedio de un equipo R1 estándar (~11.5)
 */
'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no definida'); process.exit(1); }

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});

// ── Parámetros del modelo ─────────────────────────────────────────────────
const LAMBDA         = 1.0;    // lambdaLogit de ABC
const N_EQUIPOS      = 10;     // equipos en ABC
const AVG_ATRACTIVO  = 11.5;   // atractivo promedio equipo R1 estándar calzados

// Función: convierte participaciónRef → indiceExterno
function calcIndiceExterno(participacionRef) {
  const X        = participacionRef;
  const expEquipo = Math.exp(LAMBDA * AVG_ATRACTIVO);
  const expExt   = (N_EQUIPOS * X * expEquipo) / (1 - X);
  return parseFloat((Math.log(expExt) / LAMBDA).toFixed(2));
}

// ── Índices calculados por segmento ─────────────────────────────────────
// Fuente: participacionRef de competencia_externa de ABC
const INDICES = {
  'Padres y familias con niños (0-10 años)': calcIndiceExterno(0.20),  // Bata/China 20%
  'Personas con condición postural':          calcIndiceExterno(0.20),  // Scholl 20%
  'Personas con fascitis y dolor plantar':    calcIndiceExterno(0.18),  // Farmacia 18%
  'Comerciantes y trabajadores de mercado':   calcIndiceExterno(0.25),  // Ramadas 25%
  'Jóvenes urbanos / lifestyle boliviano':    calcIndiceExterno(0.30),  // Contrabando 30%
  'Personal de salud y bienestar':            calcIndiceExterno(0.15),  // Crocs/Skechers 15%
};

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ACTUALIZAR ÍNDICE EXTERNO — Simulación ABC             ║');
  console.log(`║  λ=${LAMBDA} · n=${N_EQUIPOS} equipos · avgAtractivo=${AVG_ATRACTIVO}          ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const simRow = await pool.query(
    `SELECT id, nombre, segmentos FROM simulaciones WHERE nombre = 'ABC' ORDER BY creada_at DESC LIMIT 1`
  );
  if (!simRow.rows.length) {
    console.error('❌ Simulación ABC no encontrada.');
    await pool.end(); return;
  }
  const sim     = simRow.rows[0];
  const segs    = sim.segmentos || [];
  console.log(`Sim: ${sim.nombre} (${sim.id})\n`);

  // Actualizar indiceExterno en cada segmento
  const segsActualizados = segs.map(s => {
    const indice = INDICES[s.nombre];
    if (indice !== undefined) {
      const antes = s.indiceExterno ?? 0;
      console.log(`  ${s.nombre.slice(0,45)}`);
      console.log(`    Antes: ${antes} → Ahora: ${indice} (partRef=${(Object.entries(INDICES).find(([k])=>k===s.nombre))})`);

      // Verificar el share resultante
      const expExt    = Math.exp(LAMBDA * indice);
      const expEquipo = Math.exp(LAMBDA * AVG_ATRACTIVO);
      const share     = expExt / (expExt + N_EQUIPOS * expEquipo);
      console.log(`    Share competidor: ${(share*100).toFixed(1)}% | Share promedio equipo: ${((1-share)/N_EQUIPOS*100).toFixed(1)}%`);
      return { ...s, indiceExterno: indice };
    }
    return s;
  });

  await pool.query(
    `UPDATE simulaciones SET segmentos = $1::jsonb WHERE id = $2`,
    [JSON.stringify(segsActualizados), sim.id]
  );

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Índices actualizados correctamente                  ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Segmento                    | indiceExterno | Share ext  ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  Object.entries(INDICES).forEach(([seg, ie]) => {
    const expExt    = Math.exp(LAMBDA * ie);
    const expEquipo = Math.exp(LAMBDA * AVG_ATRACTIVO);
    const share     = expExt / (expExt + N_EQUIPOS * expEquipo);
    const segCorto  = seg.slice(0, 28).padEnd(28);
    const ieStr     = ie.toString().padStart(7);
    const shareStr  = (share*100).toFixed(0).padStart(7) + '%';
    console.log(`║  ${segCorto} | ${ieStr}     | ${shareStr}    ║`);
  });
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  ABC lista para activar R1                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await pool.end();
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
