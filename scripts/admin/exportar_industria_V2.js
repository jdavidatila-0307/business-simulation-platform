/**
 * exportar_industria_V2.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════
 * Lee la simulación vigente (código 1234) desde BD y exporta
 * todos sus parámetros como industria Calzados_COM540_1_2026_V2
 *
 * Incluye: params, tiposProducto, canales, segmentos (con
 * indiceExterno), afinidadMatrix, competenciaExterna, proveedores
 *
 * USO: node scripts\admin\exportar_industria_V2.js
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

// Proveedores con factorCosto (Opción B)
const PROVEEDORES_V2 = [
  {
    id: 'prov_1', nombre: 'Cueros Bolivia S.A.',
    factorCosto: 1.10, calidad: 8, leadTime: 1, loteMin: 50, loteMax: 2000,
    descripcion: 'Cuero nacional de alta calidad. 10% más caro que el estándar. Entrega inmediata.',
  },
  {
    id: 'prov_2', nombre: 'Importado Asia (vía Oruro)',
    factorCosto: 0.75, calidad: 5, leadTime: 2, loteMin: 100, loteMax: 3000,
    descripcion: 'Materiales sintéticos importados. 25% más barato. Lead time 2 trimestres — pide con anticipación.',
  },
  {
    id: 'prov_3', nombre: 'Insumos Locales (Cochabamba)',
    factorCosto: 0.90, calidad: 6, leadTime: 1, loteMin: 30, loteMax: 1500,
    descripcion: 'Materiales regionales. 10% más barato. Calidad aceptable. Entrega inmediata.',
  },
];

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  EXPORTAR INDUSTRIA V2 — desde sim vigente (código 1234) ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Buscar simulación vigente ────────────────────────────────────────────
  const simRow = await pool.query(
    `SELECT id, nombre, parametros, tipos_producto, canales, segmentos,
            afinidad_matrix, competencia_externa, proveedores, config
     FROM simulaciones
     WHERE estado = 'activa'
     ORDER BY creada_at DESC LIMIT 1`
  );

  if (!simRow.rows.length) {
    console.error('❌ No hay simulación activa en BD.');
    await pool.end(); return;
  }

  const sim = simRow.rows[0];
  console.log(`Fuente: ${sim.nombre} (${sim.id})\n`);

  const p   = sim.parametros        || {};
  const tp  = sim.tipos_producto    || {};
  const can = sim.canales           || {};
  const seg = sim.segmentos         || [];
  const af  = sim.afinidad_matrix   || {};
  const ce  = sim.competencia_externa || [];
  const provBD = sim.proveedores    || [];

  // Usar proveedores de BD si existen y tienen factorCosto, si no usar los canónicos
  const proveedores = (provBD.length && provBD[0].factorCosto !== undefined)
    ? provBD
    : PROVEEDORES_V2;

  // ── Verificación pre-export ───────────────────────────────────────────────
  console.log('── Verificando datos a exportar...');
  console.log(`  Parámetros:  ${Object.keys(p).length} campos`);
  console.log(`  Productos:   ${Object.keys(tp).length}`);
  console.log(`  Canales:     ${Object.keys(can).length}`);
  console.log(`  Segmentos:   ${seg.length}`);
  console.log(`  Afinidad:    ${Object.keys(af).length} productos`);
  console.log(`  Competencia: ${ce.length} actores`);
  console.log(`  Proveedores: ${proveedores.length}`);

  // Validar afinidad
  const nSeg = seg.length;
  let afOk = true;
  Object.entries(af).forEach(([prod, fila]) => {
    if (!Array.isArray(fila) || fila.length !== nSeg) {
      console.log(`  ⚠ Afinidad "${prod}": ${fila?.length} vals (esperado ${nSeg})`);
      afOk = false;
    }
  });
  if (afOk) console.log(`  Afinidad:    ✅ ${Object.keys(af).length} × ${nSeg} válida`);

  // ── Construir V2 ──────────────────────────────────────────────────────────
  const v2 = {
    meta: {
      id:          'Calzados_COM540_1_2026_V2',
      nombre:      'Calzados COM540 1 2026 V2',
      version:     '2.0',
      moneda:      'Bs',
      curso:       'COM540 — Ingeniería Comercial UAGRM',
      descripcion: 'Industria de calzado especializado boliviano v2. Proveedores con factorCosto (Opción B). ' +
                   '6 productos × 6 segmentos × 6 competidores. Índices externos calibrados para n=10 equipos.',
      creada:      new Date().toISOString().split('T')[0],
      basada_en:   `${sim.nombre} (${sim.id})`,
      autor:       'SimNego v3.2 — UAGRM',
      notas: [
        'pctCostoCalidad=0.08: 8% del costoBase por punto sobre/bajo 5',
        'indiceExterno calibrado para n=10 equipos, lambda=1.0, avgAtractivo=11.5',
        'coefPrecio=-0.005: calibrado para Bs 90-400',
        'Proveedores: factorCosto multiplica costoBase × pctMateriaPrima',
        'Cueros Bolivia ×1.10 | Importado Asia ×0.75 | Insumos Locales ×0.90',
        'Afinidad: [Niños, Postural, Fascitis, Comerciantes, Jóvenes, Salud]',
      ],
    },
    params:             p,
    tiposProducto:      tp,
    canales:            can,
    segmentos:          seg,
    afinidadMatrix:     af,
    competenciaExterna: ce,
    proveedores:        proveedores,
  };

  // ── Validar schema ────────────────────────────────────────────────────────
  const CAMPOS = ['params','tiposProducto','canales','segmentos','afinidadMatrix','competenciaExterna'];
  const faltantes = CAMPOS.filter(c => !v2[c] || (typeof v2[c] === 'object' && !Object.keys(v2[c]).length && !Array.isArray(v2[c])));
  if (faltantes.length) {
    console.error(`\n❌ Campos vacíos: ${faltantes.join(', ')}`);
    console.error('   Completa los parámetros en el panel antes de exportar.');
    await pool.end(); return;
  }

  // ── Guardar JSON ──────────────────────────────────────────────────────────
  if (!fs.existsSync('industrias')) fs.mkdirSync('industrias');
  const outputPath = path.join('industrias', 'Calzados_COM540_1_2026_V2.json');
  fs.writeFileSync(outputPath, JSON.stringify(v2, null, 2), 'utf8');
  const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(1);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Industria V2 guardada exitosamente                  ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Archivo: ${outputPath.padEnd(47)}║`);
  console.log(`║  Tamaño:  ${(sizeKB + ' KB').padEnd(47)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Parámetros:   ${String(Object.keys(v2.params).length).padEnd(3)} campos                                ║`);
  console.log(`║  Productos:    ${String(Object.keys(v2.tiposProducto).length).padEnd(3)} tipos                               ║`);
  console.log(`║  Canales:      ${String(Object.keys(v2.canales).length).padEnd(3)} canales                             ║`);
  console.log(`║  Segmentos:    ${String(v2.segmentos.length).padEnd(3)} (con indiceExterno calibrado)      ║`);
  console.log(`║  Afinidad:     ${String(Object.keys(v2.afinidadMatrix).length).padEnd(3)} × ${v2.segmentos.length} productos × segmentos         ║`);
  console.log(`║  Competencia:  ${String(v2.competenciaExterna.length).padEnd(3)} actores externos                    ║`);
  console.log(`║  Proveedores:  ${String(v2.proveedores.length).padEnd(3)} (con factorCosto Opción B)          ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Siguiente paso:                                         ║');
  console.log('║  git add industrias\\Calzados_COM540_1_2026_V2.json      ║');
  console.log('║  git commit -m "feat: industria V2 con factorCosto"      ║');
  console.log('║  git push origin main                                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await pool.end();
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
