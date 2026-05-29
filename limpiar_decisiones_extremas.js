/**
 * limpiar_decisiones_extremas.js — SimNego v3.2
 * ─────────────────────────────────────────────
 * Detecta y reemplaza decisiones extremas (contratarOperarios > 50,
 * produccion > capacidad, etc.) con decisiones canónicas válidas.
 * Luego guarda los resultados calculados en la BD.
 *
 * Uso: node limpiar_decisiones_extremas.js
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
const engine  = require('./src/engine');
const storage = require('./src/storage');

// ── Límites razonables ────────────────────────────────────────────────────
const LIMITES = {
  contratarOperarios:  50,
  despedirOperarios:   50,
  produccion:          1500,  // capacidadMaxProduccion
  precioVenta_min:     50,    // precio mínimo razonable
};

// ── Decisión canónica de reemplazo ────────────────────────────────────────
function decisionCanonica(p) {
  return {
    producto:         'Calzado Biomecánico Formal',
    segmentoObjetivo: 'Personas con condición postural',
    canalPrincipal:   'Tienda Propia',
    canalSecundario:  'Ninguno',
    calidad:          6,
    precioVenta:      200,
    produccion:       300,
    publicidad:       5000,
    promocion:        0, eventos: 0, marketingRedes: 0, relacionesPublicas: 0,
    contratarVendedores: 0, despedirVendedores: 0,
    contratarOperarios: 0, despedirOperarios: 0, montoCapacitacion: 0,
    innovacion: false, montoInnovacion: 0, tipoInnovacion: 'Producto',
    tipoPrestamo: 'Ninguno', montoPrestamo: 0, plazoPrestamo: 2, amortizacion: 0,
    tipoInvestigacion: 'No', montoInvestigacion: 0,
    stockMPInicial: 0, proveedorElegido: '', cantidadMPpedida: 0,
    pedidosPendientes: [], inventarioInicial: 0, submitted: true,
  };
}

function esExtrema(d) {
  if ((d.contratarOperarios || 0) > LIMITES.contratarOperarios) return `contratarOperarios=${d.contratarOperarios}`;
  if ((d.despedirOperarios  || 0) > LIMITES.despedirOperarios)  return `despedirOperarios=${d.despedirOperarios}`;
  if ((d.produccion         || 0) > LIMITES.produccion)         return `produccion=${d.produccion}`;
  if ((d.precioVenta        || 0) > 0 && (d.precioVenta||0) < LIMITES.precioVenta_min) return `precioVenta=${d.precioVenta}`;
  return null;
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  LIMPIEZA DE DECISIONES EXTREMAS — SimNego v3.2');
  console.log('══════════════════════════════════════════════════════════\n');

  const sim = await storage.getSimulacion(
    (await pool.query(`SELECT id FROM simulaciones ORDER BY creada_at DESC LIMIT 1`)).rows[0]?.id
  );
  if (!sim) { console.error('❌ Sin simulaciones'); await pool.end(); return; }
  const p = sim.parametros || {};
  const equipos = (sim.users||[]).filter(u=>u.rol==='equipo');
  console.log(`Sim: ${sim.nombre} (${sim.id}) | ${equipos.length} equipos\n`);

  // ── Revisar decisiones en BD ─────────────────────────────────────────
  const rondaActual = sim.config?.currentRound || 1;
  const decs = await pool.query(
    `SELECT equipo_id, decisiones FROM sim_decisiones WHERE simulacion_id=$1 AND ronda_numero=$2`,
    [sim.id, rondaActual]
  );

  let reemplazadas = 0;
  for (const row of decs.rows) {
    const d = typeof row.decisiones === 'string' ? JSON.parse(row.decisiones) : row.decisiones;
    const razon = esExtrema(d);
    const equipo = equipos.find(e => e.id === row.equipo_id);
    const nombre = equipo?.nombre || row.equipo_id;

    if (razon) {
      const nueva = {
        ...d,
        equipo: row.equipo_id,
        equipoOriginal: row.equipo_id,
        equipoNombre: nombre,
        ...decisionCanonica(p),
        // Mantener apertura financiera
        cajaInicial:           d.cajaInicial || p.cajaInicial || 500000,
        activosFijosIniciales: d.activosFijosIniciales || p.activosFijosIniciales || 80000,
        cxcInicial: d.cxcInicial || 0,
        deudaInicial: d.deudaInicial || 0,
        vendedoresIniciales: p.vendedoresIniciales ?? 0,
        operariosIniciales:  p.operariosIniciales  ?? 1,
        resultadoAcumuladoAnterior: d.resultadoAcumuladoAnterior || 0,
        ivaAPagarAnterior: d.ivaAPagarAnterior || 0,
        ivaSaldoAFavorAnterior: d.ivaSaldoAFavorAnterior || 0,
        saldoIUEcompensable: d.saldoIUEcompensable || 0,
        rondaNumero: rondaActual,
        productos: [{
          productoId: 'prod_1', activo: true, ...decisionCanonica(p),
          cajaInicial:           d.cajaInicial || p.cajaInicial || 500000,
          activosFijosIniciales: d.activosFijosIniciales || p.activosFijosIniciales || 80000,
        }],
      };

      await pool.query(
        `UPDATE sim_decisiones SET decisiones=$1::jsonb WHERE simulacion_id=$2 AND ronda_numero=$3 AND equipo_id=$4`,
        [JSON.stringify(nueva), sim.id, rondaActual, row.equipo_id]
      );
      console.log(`  ✅ ${nombre}: decisión extrema corregida (${razon})`);
      reemplazadas++;
    } else {
      console.log(`  ✓  ${nombre}: decisión OK`);
    }
  }

  if (reemplazadas === 0) {
    console.log('\n  Sin decisiones extremas. Recalcula normalmente desde el panel.');
    await pool.end(); return;
  }

  console.log(`\n  ${reemplazadas} decisiones corregidas.`);
  console.log('\n  Ahora puedes usar ⚡ Recalcular desde el panel del profesor.');
  console.log('══════════════════════════════════════════════════════════\n');
  await pool.end();
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
