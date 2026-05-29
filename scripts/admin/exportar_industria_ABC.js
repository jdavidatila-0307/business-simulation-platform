/**
 * exportar_industria_ABC.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════
 * Lee la configuración actual de la simulación ABC desde BD
 * (con todos los fixes aplicados: pctCostoCalidad, indiceExterno
 * calibrado, afinidad canónica, competencia completa) y la guarda
 * como plantilla de industria reutilizable.
 *
 * Output: industrias/Calzados_COM540_1_2026_V1.json
 *
 * USO: node exportar_industria_ABC.js
 * ══════════════════════════════════════════════════════════════
 */
'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no definida'); process.exit(1); }

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  EXPORTAR INDUSTRIA — Calzados_COM540_1_2026_V1         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Cargar sim ABC actual ────────────────────────────────────────────────
  const simRow = await pool.query(
    `SELECT id, nombre, parametros, tipos_producto, canales, segmentos,
            afinidad_matrix, competencia_externa, config
     FROM simulaciones WHERE nombre = 'ABC' ORDER BY creada_at DESC LIMIT 1`
  );
  if (!simRow.rows.length) {
    console.error('❌ Simulación ABC no encontrada.');
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

  // ── Construir plantilla de industria ─────────────────────────────────────
  const industria = {
    _meta: {
      nombre:      'Calzados_COM540_1_2026_V1',
      version:     '1.0',
      curso:       'COM540 — Ingeniería Comercial UAGRM',
      descripcion: 'Industria de calzado especializado boliviano. 5 líneas de producto diferenciadas, ' +
                   '6 segmentos de mercado, competencia calibrada para 10 equipos × 20 rondas. ' +
                   'Incluye matriz de afinidad canónica e índices externos calibrados con modelo Logit.',
      creada:      new Date().toISOString().split('T')[0],
      autor:       'SimNego v3.2 — UAGRM',
      notas: [
        'pctCostoCalidad=0.08: cada punto sobre/bajo 5 sube/baja CU un 8% del costoBase',
        'indiceExterno calibrado para n=10 equipos, lambda=1.0, avgAtractivo=11.5',
        'coefPrecio=-0.005: calibrado para rango de precios Bs 90–400',
        'Afinidad: [Niños, Postural, Fascitis, Comerciantes, Jóvenes, Salud]',
      ],
    },

    // ── Parámetros completos ─────────────────────────────────────────────
    parametros: {
      // Apertura financiera
      moneda:                    p.moneda                    ?? 'Bs',
      cajaInicial:               p.cajaInicial               ?? 500000,
      activosFijosIniciales:     p.activosFijosIniciales     ?? 80000,
      cxcInicial:                p.cxcInicial                ?? 0,
      deudaInicial:              p.deudaInicial              ?? 0,
      inventarioInicialUnid:     p.inventarioInicialUnid     ?? 0,

      // Costos fijos operativos
      gastoAdminFijo:            p.gastoAdminFijo            ?? 55000,
      gastoFijoPlanta:           p.gastoFijoPlanta           ?? 45000,
      depreciacionTrimestral:    p.depreciacionTrimestral    ?? 2500,
      costoAlmacenamientoUnidad: p.costoAlmacenamientoUnidad ?? 5,

      // Ventas y cobranzas
      pctVentasContado:          p.pctVentasContado          ?? 0.80,
      pctVentasCredito:          p.pctVentasCredito          ?? 0.20,
      plazoCobro:                p.plazoCobro                ?? 2,

      // Financiamiento
      tasaPrestamoOperativo:     p.tasaPrestamoOperativo     ?? 0.035,
      tasaPrestamoInversion:     p.tasaPrestamoInversion     ?? 0.025,
      tasaSobregiro:             p.tasaSobregiro             ?? 0.055,
      comisionAperturaPrestamo:  p.comisionAperturaPrestamo  ?? 0.015,
      plazoPrestamoOperativo:    p.plazoPrestamoOperativo    ?? 20,
      plazoPrestamoInversion:    p.plazoPrestamoInversion    ?? 40,

      // Fuerza de ventas
      vendedoresIniciales:       p.vendedoresIniciales       ?? 0,
      sueldoTrimestralVendedor:  p.sueldoTrimestralVendedor  ?? 15000,
      costoContratacionVendedor: p.costoContratacionVendedor ?? 6000,
      costoDespidoVendedor:      p.costoDespidoVendedor      ?? 9000,

      // Operarios y producción
      operariosIniciales:        p.operariosIniciales        ?? 1,
      productividadBase:         p.productividadBase         ?? 500,
      costoOperario:             p.costoOperario             ?? 9600,
      costoContratacionOperario: p.costoContratacionOperario ?? 3000,
      costoDespidoOperario:      p.costoDespidoOperario      ?? 5000,
      capacidadMaxProduccion:    p.capacidadMaxProduccion    ?? 1500,
      factorCapacitacion:        p.factorCapacitacion        ?? 0.05,

      // Costos variables
      pctMateriaPrima:           p.pctMateriaPrima           ?? 0.40,
      unidadesMPporUnidad:       p.unidadesMPporUnidad       ?? 1,
      costoAlmacenamientoMP:     p.costoAlmacenamientoMP     ?? 0.05,
      pctCostoCalidad:           p.pctCostoCalidad           ?? 0.08,

      // Investigación de mercado
      costoInvestigacionBasica:     p.costoInvestigacionBasica     ?? 5000,
      costoInvestigacionPremium:    p.costoInvestigacionPremium    ?? 10000,
      costoInvestigacionEstrategico:p.costoInvestigacionEstrategico ?? 15000,

      // Innovación
      factorInnovacionProducto:  p.factorInnovacionProducto  ?? 0.25,
      factorInnovacionProceso:   p.factorInnovacionProceso   ?? 0.25,

      // Sistema tributario Bolivia
      tasaIVA:          p.tasaIVA          ?? 0.13,
      tasaIT:           p.tasaIT           ?? 0.03,
      tasaIUE:          p.tasaIUE          ?? 0.25,
      periodosIUE:      p.periodosIUE      ?? 4,

      // Modelo de demanda
      lambdaLogit:             p.lambdaLogit             ?? 1.0,
      coefPrecio:              p.coefPrecio              ?? -0.005,
      factorCanibalizacion:    p.factorCanibalizacion    ?? 0.15,
      tasaDecaimiento:         p.tasaDecaimiento         ?? 0.05,
      modeloCostos:            p.modeloCostos            ?? 'mixto',
      trimestresPorAnio:       p.trimestresPorAnio       ?? 4,

      // Módulos activos
      modulos_modIVA:            p.modulos_modIVA            ?? 1,
      modulos_modImpuestos:      p.modulos_modImpuestos      ?? 1,
      modulos_modMateriaPrima:   p.modulos_modMateriaPrima   ?? 1,
      modulos_modOperarios:      p.modulos_modOperarios      ?? 1,
      modulos_modBrandEquity:    p.modulos_modBrandEquity    ?? 1,
      modulos_modCanibalizacion: p.modulos_modCanibalizacion ?? 1,
      modulos_modDemandaDin:     p.modulos_modDemandaDin     ?? 1,
      modulos_modInnovacion:     p.modulos_modInnovacion     ?? 1,
      modulos_modInvestigacion:  p.modulos_modInvestigacion  ?? 1,
    },

    // ── Tipos de producto ─────────────────────────────────────────────────
    tiposProducto: tp,

    // ── Canales de distribución ──────────────────────────────────────────
    canales: can,

    // ── Segmentos de mercado (con indiceExterno calibrado) ───────────────
    segmentos: seg,

    // ── Matriz de afinidad canónica ──────────────────────────────────────
    afinidadMatrix: af,

    // ── Competencia externa (6 actores, uno por segmento) ────────────────
    competenciaExterna: ce,

    // ── Proveedores de materia prima ─────────────────────────────────────
    proveedores: [
      {
        id:       'prov_1',
        nombre:   'Cueros Bolivia S.A.',
        costoMP:  18.0,
        calidad:  8,
        leadTime: 1,
        loteMin:  50,
        loteMax:  2000,
        descripcion: 'Proveedor nacional de cueros y materiales naturales. Alta calidad, precio moderado.',
      },
      {
        id:       'prov_2',
        nombre:   'Importado Asia (vía Oruro)',
        costoMP:  10.0,
        calidad:  5,
        leadTime: 2,
        loteMin:  100,
        loteMax:  3000,
        descripcion: 'Materiales sintéticos importados. Menor costo pero calidad inferior y lead time de 2 trimestres.',
      },
      {
        id:       'prov_3',
        nombre:   'Insumos Locales (Cochabamba)',
        costoMP:  14.0,
        calidad:  6,
        leadTime: 1,
        loteMin:  30,
        loteMax:  1500,
        descripcion: 'Proveedor regional de insumos mixtos. Precio y calidad intermedios, entrega rápida.',
      },
    ],
  };

  // ── Guardar como JSON ─────────────────────────────────────────────────
  const outputPath = path.join('industrias', 'Calzados_COM540_1_2026_V1.json');

  // Crear carpeta si no existe
  if (!fs.existsSync('industrias')) {
    fs.mkdirSync('industrias');
  }

  fs.writeFileSync(outputPath, JSON.stringify(industria, null, 2), 'utf8');
  const sizeKB = (fs.statSync(outputPath).size / 1024).toFixed(1);

  // ── Resumen ───────────────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✅ Plantilla guardada exitosamente                     ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Archivo: ${outputPath.padEnd(47)}║`);
  console.log(`║  Tamaño:  ${(sizeKB + ' KB').padEnd(47)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Parámetros:   ${String(Object.keys(industria.parametros).length).padEnd(3)} campos                                ║`);
  console.log(`║  Productos:    ${String(Object.keys(industria.tiposProducto).length).padEnd(3)} tipos                               ║`);
  console.log(`║  Canales:      ${String(Object.keys(industria.canales).length).padEnd(3)} canales                             ║`);
  console.log(`║  Segmentos:    ${String(industria.segmentos.length).padEnd(3)} segmentos (con indiceExterno)      ║`);
  console.log(`║  Afinidad:     ${String(Object.keys(industria.afinidadMatrix).length).padEnd(3)} productos × ${industria.segmentos.length} segmentos             ║`);
  console.log(`║  Competencia:  ${String(industria.competenciaExterna.length).padEnd(3)} actores externos                    ║`);
  console.log(`║  Proveedores:  ${String(industria.proveedores.length).padEnd(3)} proveedores MP                      ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Para usar en nueva simulación:                         ║');
  console.log('║  Panel → Nueva Simulación → Seleccionar industria       ║');
  console.log('║  → Calzados_COM540_1_2026_V1                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await pool.end();
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
