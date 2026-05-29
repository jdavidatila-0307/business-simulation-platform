/**
 * agregar_producto6.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════
 * Agrega "Calzado Médico Especializado" a la sim ABC y actualiza
 * la industria Calzados_COM540_1_2026_V1.json
 *
 * USO: node scripts\admin\agregar_producto6.js
 * ══════════════════════════════════════════════════════════════
 */
'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no definida'); process.exit(1); }

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});

// ── Producto 6 canónico ───────────────────────────────────────────────────
const PRODUCTO6 = {
  nombre:     'Calzado Médico Especializado',
  costoBase:  226.57,
  descripcion:'Calzado de alta precisión biomecánica para uso clínico. Diseñado para fascitis, ' +
              'deformidades podológicas y uso hospitalario prolongado. Nicho de alto valor agregado.',
  margenBase: 0.55,
};

// Afinidad canónica COM540: [Niños, Postural, Fascitis, Comerciantes, Jóvenes, Salud]
const AFINIDAD_PROD6 = [-2, 2, 4, -1, -2, 3];

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AGREGAR PRODUCTO 6 — Calzado Médico Especializado      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Cargar sim ABC ──────────────────────────────────────────────────────
  const simRow = await pool.query(
    `SELECT id, nombre, tipos_producto, afinidad_matrix
     FROM simulaciones WHERE nombre = 'ABC' ORDER BY creada_at DESC LIMIT 1`
  );
  if (!simRow.rows.length) {
    console.error('❌ Simulación ABC no encontrada.');
    await pool.end(); return;
  }
  const sim = simRow.rows[0];
  console.log(`Sim: ${sim.nombre} (${sim.id})\n`);

  // ── Verificar que no existe ya ───────────────────────────────────────────
  const tipos = sim.tipos_producto || {};
  if (tipos[PRODUCTO6.nombre]) {
    console.log(`✅ "${PRODUCTO6.nombre}" ya existe en la sim — no se modifica.`);
  } else {
    // Agregar producto
    tipos[PRODUCTO6.nombre] = {
      costoBase:   PRODUCTO6.costoBase,
      descripcion: PRODUCTO6.descripcion,
      margenBase:  PRODUCTO6.margenBase,
    };
    await pool.query(
      `UPDATE simulaciones SET tipos_producto = $1::jsonb WHERE id = $2`,
      [JSON.stringify(tipos), sim.id]
    );
    console.log(`✅ Producto agregado: ${PRODUCTO6.nombre} (costoBase=Bs ${PRODUCTO6.costoBase})`);
  }

  // ── Actualizar afinidad matrix ────────────────────────────────────────────
  const afinidad = sim.afinidad_matrix || {};
  if (afinidad[PRODUCTO6.nombre]) {
    console.log(`✅ Afinidad de "${PRODUCTO6.nombre}" ya existe — no se modifica.`);
  } else {
    afinidad[PRODUCTO6.nombre] = AFINIDAD_PROD6;
    await pool.query(
      `UPDATE simulaciones SET afinidad_matrix = $1::jsonb WHERE id = $2`,
      [JSON.stringify(afinidad), sim.id]
    );
    console.log(`✅ Afinidad agregada: [${AFINIDAD_PROD6.join(', ')}]`);
    console.log('   [Niños, Postural, Fascitis, Comerciantes, Jóvenes, Salud]');
  }

  // ── Actualizar industrias/Calzados_COM540_1_2026_V1.json ────────────────
  const v1Path = path.join('industrias', 'Calzados_COM540_1_2026_V1.json');
  if (fs.existsSync(v1Path)) {
    const v1 = JSON.parse(fs.readFileSync(v1Path, 'utf8'));

    // Agregar al tiposProducto
    if (!v1.tiposProducto[PRODUCTO6.nombre]) {
      v1.tiposProducto[PRODUCTO6.nombre] = {
        costoBase:   PRODUCTO6.costoBase,
        descripcion: PRODUCTO6.descripcion,
        margenBase:  PRODUCTO6.margenBase,
      };
    }

    // Agregar a afinidadMatrix
    if (!v1.afinidadMatrix[PRODUCTO6.nombre]) {
      v1.afinidadMatrix[PRODUCTO6.nombre] = AFINIDAD_PROD6;
    }

    // Actualizar meta
    v1.meta.actualizada = new Date().toISOString().split('T')[0];

    fs.writeFileSync(v1Path, JSON.stringify(v1, null, 2), 'utf8');
    console.log(`\n✅ industrias/Calzados_COM540_1_2026_V1.json actualizado`);
    console.log(`   Productos: ${Object.keys(v1.tiposProducto).length}`);
    console.log(`   Afinidad:  ${Object.keys(v1.afinidadMatrix).length} × ${v1.segmentos.length}`);
  } else {
    console.warn('⚠ No se encontró Calzados_COM540_1_2026_V1.json — solo se actualizó la BD');
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Completado                                           ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Sim ABC: 6 productos, 6 segmentos, 6×6 afinidad        ║');
  console.log('║  V1 JSON: 6 productos, 6 segmentos                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await pool.end();
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
