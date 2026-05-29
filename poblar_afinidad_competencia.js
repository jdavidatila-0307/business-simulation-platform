/**
 * poblar_afinidad_competencia.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════
 * Pobla la matriz de afinidad producto×segmento y la competencia
 * externa completa (6 competidores, uno por segmento) para la
 * simulación ABC, basado en los datos canónicos de COM540.
 *
 * USO: node poblar_afinidad_competencia.js
 * ══════════════════════════════════════════════════════════════
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

// ── Segmentos (orden exacto en la BD de ABC) ──────────────────────────────
// [0] Padres/niños, [1] Postural, [2] Fascitis, [3] Comerciantes,
// [4] Jóvenes urbanos, [5] Personal de salud
const SEGMENTOS = [
  'Padres y familias con niños (0-10 años)',
  'Personas con condición postural',
  'Personas con fascitis y dolor plantar',
  'Comerciantes y trabajadores de mercado',
  'Jóvenes urbanos / lifestyle boliviano',
  'Personal de salud y bienestar',
];

// ── Matriz de afinidad canónica COM540 ────────────────────────────────────
// Valores: +3 ajuste perfecto, +1 aceptable, 0 neutro, -1 mal ajuste, -2 muy mal
// Fuente: Calzados_COM540_1_2026.json (validada con datos reales R1-R11)
const AFINIDAD_MATRIX = {
  'Calzado Sensorial TEA':        [  3, -1, -1, -2, -2,  0],
  'Sneaker Cultural Premium':     [ -1, -2, -2, -1,  4, -1],
  'Calzado Biomecánico Formal':   [ -2,  4,  2,  0, -1,  2],
  'Calzado Ortopédico Laboral':   [ -1,  1,  2,  3, -1,  2],
  'Sandalia Infantil Ajustable':  [  4, -2, -2, -1, -1,  0],
};

// ── Competencia externa — 6 competidores, uno por segmento ───────────────
// Diseñados para generar presión competitiva realista sin eliminar a los equipos.
// Criterio: precio = rango medio del segmento, calidad competitiva pero superable,
// participación 15-30% (deja espacio para 10 equipos).
const COMPETENCIA_EXTERNA = [
  {
    segmento:        'Padres y familias con niños (0-10 años)',
    nombre:          'Calzado infantil importado (Bata Kids / genérico chino)',
    precio:          55,
    calidad:         3,
    marketing:       2000,
    participacionRef: 0.20,
    descripcion:     'Calzado infantil de bajo costo, amplia distribución en tiendas de barrio. Compite por precio pero sin soporte ortopédico. Superable con calidad ≥ 6.',
  },
  {
    segmento:        'Personas con condición postural',
    nombre:          'Marcas ortopédicas importadas (Scholl / Dr. Scholl)',
    precio:          280,
    calidad:         7,
    marketing:       15000,
    participacionRef: 0.20,
    descripcion:     'Marca internacional con presencia en farmacias. Reconocimiento alto, precio elevado. Vulnerable a propuestas locales con atención personalizada.',
  },
  {
    segmento:        'Personas con fascitis y dolor plantar',
    nombre:          'Plantillas y calzado genérico de farmacia (Farmacorp/Chávez)',
    precio:          120,
    calidad:         4,
    marketing:       1000,
    participacionRef: 0.18,
    descripcion:     'Solución básica vendida en farmacias. Baja especialización, sin diseño biomecánico. Superable con calidad ≥ 6 y precio competitivo.',
  },
  {
    segmento:        'Comerciantes y trabajadores de mercado',
    nombre:          'Calzado boliviano de mercado (Ramadas / Los Pozos)',
    precio:          65,
    calidad:         2,
    marketing:       0,
    participacionRef: 0.25,
    descripcion:     'Calzado local no especializado, altamente accesible. Domina el segmento informal. Difícil competir en precio pero superable en calidad y comodidad.',
  },
  {
    segmento:        'Jóvenes urbanos / lifestyle boliviano',
    nombre:          'Importaciones informales (contrabando China / Brasil)',
    precio:          80,
    calidad:         3,
    marketing:       0,
    participacionRef: 0.30,
    descripcion:     'Mayor competidor del segmento. Precio muy accesible, sin garantía. Equipos con identidad cultural boliviana y calidad ≥ 7 pueden diferenciarse fuertemente.',
  },
  {
    segmento:        'Personal de salud y bienestar',
    nombre:          'Calzado profesional importado (Crocs Pro / Skechers Work)',
    precio:          350,
    calidad:         8,
    marketing:       8000,
    participacionRef: 0.15,
    descripcion:     'Marcas internacionales en el nicho de salud. Alto precio, buena reputación. Convenios institucionales con hospitales privados. Superable con propuesta nacional especializada.',
  },
];

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  POBLAR AFINIDAD + COMPETENCIA — Simulación ABC         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Cargar sim ABC ──────────────────────────────────────────────────────
  const simRow = await pool.query(
    `SELECT id, nombre, segmentos, afinidad_matrix, competencia_externa, tipos_producto
     FROM simulaciones WHERE nombre = 'ABC' ORDER BY creada_at DESC LIMIT 1`
  );
  if (!simRow.rows.length) {
    console.error('❌ Simulación ABC no encontrada. Corre crear_sim_ABC.js primero.');
    await pool.end(); return;
  }
  const sim = simRow.rows[0];
  console.log(`Sim: ${sim.nombre} (${sim.id})\n`);

  // ── Verificar que los productos existen ─────────────────────────────────
  const tiposProducto = sim.tipos_producto || {};
  console.log('── Productos en la sim:');
  Object.keys(tiposProducto).forEach(p => console.log(`  ${p}`));

  // Verificar que los productos de la matriz existen en la sim
  const productosMatrix = Object.keys(AFINIDAD_MATRIX);
  const productosFaltantes = productosMatrix.filter(p => !tiposProducto[p]);
  if (productosFaltantes.length) {
    console.log(`\n⚠ Productos en la matriz no encontrados en la sim (se agregarán igual):`);
    productosFaltantes.forEach(p => console.log(`  ✗ ${p}`));
  }

  // ── Verificar orden de segmentos ─────────────────────────────────────────
  const segsBD = (sim.segmentos || []).map(s => s.nombre);
  console.log('\n── Segmentos en BD (orden):');
  segsBD.forEach((s, i) => {
    const match = s === SEGMENTOS[i];
    console.log(`  [${i}] ${match ? '✅' : '⚠'} ${s}`);
  });

  // Verificar que el orden coincide
  const ordenCorrecto = SEGMENTOS.every((s, i) => segsBD[i] === s);
  if (!ordenCorrecto) {
    console.log('\n⚠ El orden de segmentos en BD no coincide exactamente.');
    console.log('  Se usará el orden de la BD para mapear la matriz.');
    // Reordenar la matriz según el orden real de la BD
  }

  // ── Insertar afinidad matrix ─────────────────────────────────────────────
  console.log('\n── Guardando matriz de afinidad...');

  // Si el orden de segmentos difiere, reordenar los valores
  let matrizFinal = {};
  for (const [prod, vals] of Object.entries(AFINIDAD_MATRIX)) {
    if (ordenCorrecto) {
      matrizFinal[prod] = vals;
    } else {
      // Reordenar según el orden real de la BD
      matrizFinal[prod] = segsBD.map(segNombre => {
        const idxCanon = SEGMENTOS.indexOf(segNombre);
        return idxCanon >= 0 ? vals[idxCanon] : 0;
      });
    }
  }

  await pool.query(
    `UPDATE simulaciones SET afinidad_matrix = $1::jsonb WHERE id = $2`,
    [JSON.stringify(matrizFinal), sim.id]
  );

  // Verificar
  Object.entries(matrizFinal).forEach(([prod, vals]) => {
    console.log(`  ✅ ${prod}: [${vals.join(', ')}]`);
  });

  // ── Insertar competencia externa ─────────────────────────────────────────
  console.log('\n── Guardando competencia externa (6 competidores)...');
  await pool.query(
    `UPDATE simulaciones SET competencia_externa = $1::jsonb WHERE id = $2`,
    [JSON.stringify(COMPETENCIA_EXTERNA), sim.id]
  );

  COMPETENCIA_EXTERNA.forEach(c => {
    console.log(`  ✅ ${c.nombre.slice(0,45)}`);
    console.log(`     Segmento: ${c.segmento} | Precio: Bs ${c.precio} | Calidad: ${c.calidad}/10 | Part.: ${(c.participacionRef*100).toFixed(0)}%`);
  });

  // ── Resumen final ────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Configuración completada — ABC lista para R1        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Afinidad:    5 productos × 6 segmentos                 ║');
  console.log('║  Competencia: 6 actores, uno por segmento               ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Siguiente paso:                                         ║');
  console.log('║  Panel → 🔄 Rondas → → Siguiente ronda → ▶ Activar hoja ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await pool.end();
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
