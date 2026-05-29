/**
 * validar_sim_realista.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────
 * Script de validación end-to-end con decisiones CANÓNICAS predefinidas.
 *
 * Objetivo: verificar que el motor cuadra A = P + Patrimonio para todos
 * los equipos usando datos realistas (no extremos como 6868 operarios).
 *
 * Uso:
 *   node validar_sim_realista.js           → solo valida (no guarda)
 *   node validar_sim_realista.js --guardar → valida Y guarda en BD
 *
 * DECISIONES CANÓNICAS (por equipo):
 *   Precio = costoBase × 1.5 (margen 50% s/costo)
 *   Producción ≤ capacidad (1 operario × 440 = 440 unidades)
 *   Sin préstamos, sin innovación, sin contrataciones
 * ─────────────────────────────────────────────────────────────
 */
'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no definida'); process.exit(1); }

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 10000,
});

const engine = require('./src/engine');
const storage = require('./src/storage');

const GUARDAR = process.argv.includes('--guardar');

// ── Decisión canónica por equipo ───────────────────────────────────────────
// Precio neto de IVA = costoBase × factor_margen (el cliente paga con IVA)
// Producción conservadora: 60-80% de la capacidad (1 operario × 440 = 440)
function decCanonica(overrides) {
  return {
    productoId:          'prod_1',
    activo:              true,
    segmentoObjetivo:    '',
    canalPrincipal:      'Tienda Propia',
    canalSecundario:     'Ninguno',
    calidad:             6,
    precioVenta:         200,
    produccion:          300,
    publicidad:          5000,
    promocion:           0,
    eventos:             0,
    marketingRedes:      0,
    relacionesPublicas:  0,
    contratarVendedores: 0,
    despedirVendedores:  0,
    contratarOperarios:  0,
    despedirOperarios:   0,
    montoCapacitacion:   0,
    innovacion:          false,
    montoInnovacion:     0,
    tipoInnovacion:      'Producto',
    tipoPrestamo:        'Ninguno',
    montoPrestamo:       0,
    plazoPrestamo:       2,
    amortizacion:        0,
    tipoInvestigacion:   'No',
    montoInvestigacion:  0,
    stockMPInicial:      0,
    proveedorElegido:    '',
    cantidadMPpedida:    0,
    pedidosPendientes:   [],
    inventarioInicial:   0,
    ...overrides,
  };
}

// ── Decisiones canónicas para COM540 Calzados ─────────────────────────────
// costoBase: TEA=120, Premium=298, Biomecánico=153, Ortopédico=?, Sandalia=?, Médico=?
// Precio sugerido ≈ costoBase × 1.5 (50% margen s/costo bruto)
const DECISIONES_CANONICAS = {
  'B': decCanonica({
    producto:         'Calzado Biomecánico Formal',
    segmentoObjetivo: 'Padres y familias con niños (0-10 años)',
    canalPrincipal:   'Tienda Propia',
    precioVenta:      220,   // costoBase=153 → precio neto 220 → margen ~44%
    produccion:       350,
    calidad:          6,
    publicidad:       8000,
  }),
  'E': decCanonica({
    producto:         'Calzado Sensorial TEA',
    segmentoObjetivo: 'Personas con condición postural',
    canalPrincipal:   'Venta Digital',
    precioVenta:      175,   // costoBase=120 → margen ~46%
    produccion:       300,
    calidad:          7,
    publicidad:       6000,
  }),
  'C': decCanonica({
    producto:         'Calzado Biomecánico Formal',
    segmentoObjetivo: 'Personas con fascitis y dolor plantar',
    canalPrincipal:   'Distribuidores B2B',
    precioVenta:      210,
    produccion:       280,
    calidad:          5,
    publicidad:       4000,
  }),
  'A': decCanonica({
    producto:         'Calzado Sensorial TEA',
    segmentoObjetivo: 'Personas con condición postural',
    canalPrincipal:   'Convenios Institucionales',
    precioVenta:      185,
    produccion:       320,
    calidad:          8,
    publicidad:       10000,
  }),
  'D': decCanonica({
    producto:         'Calzado Biomecánico Formal',
    segmentoObjetivo: 'Padres y familias con niños (0-10 años)',
    canalPrincipal:   'Ferias y Eventos',
    precioVenta:      195,
    produccion:       260,
    calidad:          6,
    publicidad:       5000,
  }),
  'F': decCanonica({
    producto:         'Calzado Sensorial TEA',
    segmentoObjetivo: 'Personas con fascitis y dolor plantar',
    canalPrincipal:   'Tienda Propia',
    precioVenta:      170,
    produccion:       280,
    calidad:          6,
    publicidad:       5000,
  }),
};

// ── Verificación de cuadre ─────────────────────────────────────────────────
function verificar(r, nombre) {
  const A   = r.totalActivos   || 0;
  const P   = r.totalPasivos   || (r.deudaFinal||0) + (r.ivaAPagar||0);
  const Pat = r.patrimonio     || 0;
  const desc = Math.abs(A - (P + Pat));
  const ok   = desc < 1;
  const linea = `  ${ok?'✅':'❌'} ${nombre}: A=${A.toLocaleString('es-BO')} | P+Pat=${(P+Pat).toLocaleString('es-BO')} | Δ=${desc.toFixed(2)} Bs`;
  console.log(linea);
  if (!ok) {
    console.log(`     caja=${(r.cajaFinal||0).toLocaleString('es-BO')} inv=${(r.invFinalValorizado||0).toLocaleString('es-BO')} af=${(r.afNetos||0).toLocaleString('es-BO')} ivaSAF=${(r.ivaSaldoAFavor||0).toLocaleString('es-BO')}`);
    console.log(`     deuda=${(r.deudaFinal||0).toLocaleString('es-BO')} ivaAPagar=${(r.ivaAPagar||0).toLocaleString('es-BO')}`);
    console.log(`     capCont=${(r.capitalContable||0).toLocaleString('es-BO')} resAcum=${(r.resultadoAcumulado||0).toLocaleString('es-BO')}`);
  }
  return ok;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  VALIDACIÓN CANÓNICA — SimNego v3.2');
  console.log('  Decisiones realistas · Invariante A = P + Patrimonio');
  if (GUARDAR) console.log('  MODO: Guardar resultados en BD');
  else         console.log('  MODO: Solo validar (pasar --guardar para guardar)');
  console.log('══════════════════════════════════════════════════════════\n');

  // ── Obtener sim activa ──────────────────────────────────────────────────
  const sims = await pool.query(`SELECT id, nombre FROM simulaciones ORDER BY creada_at DESC LIMIT 1`);
  if (!sims.rows.length) { console.error('❌ No hay simulaciones'); await pool.end(); return; }
  const simId   = sims.rows[0].id;
  const simNombre = sims.rows[0].nombre;

  // Usar storage.getSimulacion para obtener la estructura completa incluyendo proveedores
  const sim = await storage.getSimulacion(simId);
  if (!sim) { console.error('❌ No se pudo cargar la simulación'); await pool.end(); return; }
  const p   = sim.parametros || {};
  console.log(`Simulación: ${sim.nombre || simNombre} (${simId})`);
  console.log(`Params: cajaInicial=${p.cajaInicial?.toLocaleString('es-BO')} AF=${p.activosFijosIniciales?.toLocaleString('es-BO')} operariosIni=${p.operariosIniciales}\n`);

  // ── Obtener equipos ─────────────────────────────────────────────────────
  const equipos = (sim.users || []).filter(u => u.rol === 'equipo');
  console.log(`Equipos: ${equipos.map(e=>e.nombre).join(', ')}\n`);

  // ── Construir decisiones para el motor ─────────────────────────────────
  const decisiones = equipos.map(eq => {
    const decPred = DECISIONES_CANONICAS[eq.nombre] || DECISIONES_CANONICAS['B'];
    const productos = [{ productoId: 'prod_1', activo: true, ...decPred }];
    return {
      equipo:          eq.id,
      equipoOriginal:  eq.id,
      equipoNombre:    eq.nombre,
      productoId:      'prod_1',
      productos,
      // Compatibilidad flat
      ...decPred,
      // Apertura financiera R1
      cajaInicial:             p.cajaInicial         || 500000,
      activosFijosIniciales:   p.activosFijosIniciales || 80000,
      cxcInicial:              0,
      deudaInicial:            0,
      vendedoresIniciales:     p.vendedoresIniciales  ?? 0,
      operariosIniciales:      p.operariosIniciales   ?? 1,
      inventarioInicial:       0,
      brandEquityInicial:      50,
      resultadoAcumuladoAnterior: 0,
      ivaAPagarAnterior:       0,
      ivaSaldoAFavorAnterior:  0,
      saldoIUEcompensable:     0,
      stockMPInicial:          0,
      pedidosPendientes:       [],
      rondaNumero:             1,
      submitted:               true,
    };
  });

  // ── Configuración del simulador ─────────────────────────────────────────
  const segmentos = Array.isArray(sim.segmentos)
    ? sim.segmentos
    : Object.values(sim.segmentos || {});

  const simCfg = {
    params:             p,
    tiposProducto:      sim.tipos_producto || {},
    canales:            sim.canales        || {},
    segmentos,
    afinidadMatrix:     sim.afinidad_matrix || {},
    competenciaExterna: sim.competencia_externa || [],
    demandaBaseAnteriorMap: {},
    rondaNumero:        1,
    proveedores:        sim.proveedores || [],
    shock:              { tipo: 'neutral', magnitud: 0, descripcion: 'sin shock' },
    equipos,
  };

  // ── Ejecutar motor ──────────────────────────────────────────────────────
  console.log('Ejecutando motor...');
  let resultado;
  try {
    resultado = engine.ejecutarSimulador(decisiones, simCfg);
  } catch(e) {
    console.error(`❌ Error en el motor: ${e.message}`);
    await pool.end();
    process.exit(1);
  }

  // ── Validar balance ─────────────────────────────────────────────────────
  console.log('\n── Validación A = P + Patrimonio ───────────────────────');
  let ok = 0, fail = 0;
  const resObj = {};
  for (const r of resultado.resultados) {
    const nombre = equipos.find(e => e.id === (r.equipoOriginal||r.equipo))?.nombre || r.equipo;
    resObj[r.equipo] = r;
    if (verificar(r, nombre)) ok++; else fail++;
  }

  // ── Resumen financiero ──────────────────────────────────────────────────
  console.log('\n── Resumen Financiero ──────────────────────────────────');
  console.log(`Equipo   ${'Ventas'.padStart(10)} ${'Util.Neta'.padStart(12)} ${'Activos'.padStart(10)} ${'Patrim.'.padStart(12)}`);
  console.log('─'.repeat(55));
  for (const r of resultado.resultados) {
    const nombre = equipos.find(e => e.id === (r.equipoOriginal||r.equipo))?.nombre || '?';
    const v = String((r.ventasNetas||0).toLocaleString('es-BO')).padStart(10);
    const u = String((r.utilidadNeta||0).toLocaleString('es-BO')).padStart(12);
    const a = String((r.totalActivos||0).toLocaleString('es-BO')).padStart(10);
    const pt= String((r.patrimonio||0).toLocaleString('es-BO')).padStart(12);
    console.log(`${nombre.padEnd(8)} ${v} ${u} ${a} ${pt}`);
  }

  // ── Resultado final ─────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  if (fail === 0) {
    console.log(`  ✅ TODOS LOS EQUIPOS CUADRAN (${ok}/${ok+fail}) — Δ = 0.00 Bs`);
    console.log('  Motor validado con datos canónicos.');
  } else {
    console.log(`  ❌ ${fail} EQUIPOS DESCUADRADOS — revisar motor`);
  }

  // ── Guardar en BD (opcional) ────────────────────────────────────────────
  if (GUARDAR && fail === 0) {
    console.log('\n  Guardando resultados en BD...');
    try {
      // Encontrar o crear ronda 1
      let ronda = await storage.getRonda(sim.id, 1);
      if (!ronda) {
        // Crear ronda básica
        await pool.query(
          `INSERT INTO sim_rondas (simulacion_id, numero, estado, resultados, creada_at)
           VALUES ($1, 1, 'calculada', $2::jsonb, NOW())
           ON CONFLICT (simulacion_id, numero) DO UPDATE
           SET estado='calculada', resultados=$2::jsonb`,
          [sim.id, JSON.stringify({ resultados: resObj, mercadoSegmentos: resultado.mercadoSegmentos })]
        );
      } else {
        await storage.updateRonda(sim.id, 1, {
          resultados:       resObj,
          mercadoSegmentos: resultado.mercadoSegmentos,
          atractivoEquipos: resultado.atractivoEquipos,
          dashboard:        resultado.dashboard,
          empresas:         resultado.empresas,
        });
      }
      console.log('  ✅ Resultados guardados. Recarga el panel del profesor.');
    } catch(e) {
      console.error(`  ❌ Error guardando: ${e.message}`);
    }
  } else if (GUARDAR && fail > 0) {
    console.log('\n  ⚠️  No se guardan resultados con descuadres.');
  }

  console.log('══════════════════════════════════════════════════════════\n');
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
