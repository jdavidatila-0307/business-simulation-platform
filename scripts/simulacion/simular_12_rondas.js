/**
 * simular_12_rondas.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════
 * Simula 12 rondas completas con 6 equipos × 5 productos.
 * Cada equipo tiene estrategia diferente que evoluciona por fase.
 *
 * ESTRATEGIAS:
 *   B → Premium    (precio alto, volumen bajo, calidad máxima)
 *   E → Volumen    (precio bajo, volumen alto, distribución masiva)
 *   C → Equilibrado(precio medio, volumen medio, Venta Digital)
 *   A → Innovador  (invierte en innovación, alto margen)
 *   D → Especialista(3 productos foco, Convenios Institucionales)
 *   F → Conservador(crecimiento lento, riesgo mínimo)
 *
 * FASES:
 *   R01-R02 → Setup    (contratar operarios, establecer productos)
 *   R03-R06 → Crecimiento (aumentar producción, marketing)
 *   R07-R09 → Optimización (ajustar precios, focalizarse)
 *   R10-R12 → Madurez  (maximizar márgenes, consolidar)
 *
 * USO:
 *   node simular_12_rondas.js
 *   node simular_12_rondas.js --desde 5   (continuar desde ronda 5)
 *   node simular_12_rondas.js --solo 3    (simular solo ronda 3)
 * ══════════════════════════════════════════════════════════════
 */
'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) { console.error('❌ DATABASE_URL no definida'); process.exit(1); }

const pool    = new Pool({ connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized:false, ca:null, checkServerIdentity:()=>undefined }, connectionTimeoutMillis:15000 });
const engine  = require('./src/engine');
const storage = require('./src/storage');

const DESDE = parseInt(process.argv.find(a=>a.startsWith('--desde'))?.split(' ')[1]||
              process.argv[process.argv.indexOf('--desde')+1]) || 1;
const SOLO  = parseInt(process.argv.find(a=>a.startsWith('--solo'))?.split(' ')[1]||
              process.argv[process.argv.indexOf('--solo')+1]) || 0;

// ── Productos (5 de 6 disponibles en COM540) ──────────────────────────────
const PRODUCTOS = [
  { id:'prod_1', nombre:'Calzado Sensorial TEA',        costoBase:120,    segmento:'Personas con condición postural',         canal_base:'Tienda Propia' },
  { id:'prod_2', nombre:'Calzado Biomecánico Formal',   costoBase:153,    segmento:'Personas con fascitis y dolor plantar',   canal_base:'Tienda Propia' },
  { id:'prod_3', nombre:'Calzado Ortopédico Laboral',   costoBase:136,    segmento:'Comerciantes y trabajadores de mercado',  canal_base:'Distribuidores B2B' },
  { id:'prod_4', nombre:'Sandalia Infantil Ajustable',  costoBase:79,     segmento:'Padres y familias con niños (0-10 años)', canal_base:'Tienda Propia' },
  { id:'prod_5', nombre:'Calzado Médico Especializado', costoBase:226.57, segmento:'Personal de salud y bienestar',           canal_base:'Convenios Institucionales' },
];

// ── Estrategias por equipo ─────────────────────────────────────────────────
const ESTRATEGIAS = {
  'B': { nombre:'Premium',     margen:0.85, calidad:8, volBase:80,  canal:'Tienda Propia',            mktBase:12000, innovacion:false, credito:false },
  'E': { nombre:'Volumen',     margen:0.32, calidad:5, volBase:220, canal:'Distribuidores B2B',        mktBase:4000,  innovacion:false, credito:true  },
  'C': { nombre:'Equilibrado', margen:0.58, calidad:6, volBase:150, canal:'Venta Digital',             mktBase:8000,  innovacion:false, credito:false },
  'A': { nombre:'Innovador',   margen:0.70, calidad:7, volBase:120, canal:'Ferias y Eventos',          mktBase:7000,  innovacion:true,  credito:false },
  'D': { nombre:'Especialista',margen:0.78, calidad:8, volBase:100, canal:'Convenios Institucionales', mktBase:9000,  innovacion:false, credito:false },
  'F': { nombre:'Conservador', margen:0.45, calidad:6, volBase:130, canal:'Tienda Propia',             mktBase:5000,  innovacion:false, credito:false },
};

// ── Factor de fase por ronda ───────────────────────────────────────────────
function factorFase(ronda) {
  if (ronda <= 2)  return { vol:0.6, mkt:0.7,  precio:0.95, ops:3 };  // Setup
  if (ronda <= 6)  return { vol:1.0, mkt:1.0,  precio:1.00, ops:0 };  // Crecimiento
  if (ronda <= 9)  return { vol:1.2, mkt:1.3,  precio:1.05, ops:1 };  // Optimización
  return           { vol:1.1, mkt:1.1,  precio:1.10, ops:0 };           // Madurez
}

// ── Construir decisión de un producto ─────────────────────────────────────
function buildProducto(prod, estrategia, ronda, estado, idx) {
  const f    = factorFase(ronda);
  const pnet = Math.round(prod.costoBase * (1 + estrategia.margen) * f.precio);
  const vol  = Math.round(estrategia.volBase * f.vol);
  // Especialista: P1 y P2 con doble volumen, el resto mínimo
  const volFinal = (estrategia.nombre === 'Especialista' && idx >= 3) ? Math.round(vol * 0.3) : vol;
  // Conservador crece gradualmente
  const volConservador = estrategia.nombre === 'Conservador' ? Math.round(volFinal * (0.7 + ronda * 0.025)) : volFinal;

  return {
    productoId:       prod.id,
    activo:           true,
    producto:         prod.nombre,
    segmentoObjetivo: prod.segmento,
    canalPrincipal:   estrategia.canal,
    canalSecundario:  'Ninguno',
    calidad:          estrategia.calidad,
    precioVenta:      pnet,
    produccion:       Math.min(volConservador, 280),
    publicidad:       Math.round(estrategia.mktBase * f.mkt / 5),
    promocion:        ronda >= 5 ? 2000 : 0,
    eventos:          estrategia.nombre === 'Innovador' ? 3000 : 0,
    marketingRedes:   estrategia.nombre === 'Equilibrado' ? 4000 : 0,
    relacionesPublicas: estrategia.nombre === 'Premium' ? 2000 : 0,
    contratarVendedores: (ronda === 1 && idx === 0) ? 1 : 0,
    despedirVendedores:  0,
    contratarOperarios:  (ronda === 1 && idx === 0) ? f.ops : (ronda === 7 && idx === 0) ? 1 : 0,
    despedirOperarios:   0,
    montoCapacitacion:   estrategia.nombre === 'Innovador' ? 2000 : 0,
    innovacion:          estrategia.innovacion && idx === 0 && ronda % 3 === 0,
    montoInnovacion:     (estrategia.innovacion && idx === 0 && ronda % 3 === 0) ? 15000 : 0,
    tipoInnovacion:      'Producto',
    tipoPrestamo:        (estrategia.credito && ronda === 1 && idx === 0) ? 'Operativo' : 'Ninguno',
    montoPrestamo:       (estrategia.credito && ronda === 1 && idx === 0) ? 80000 : 0,
    plazoPrestamo:       4,
    amortizacion:        (estrategia.credito && ronda > 1 && idx === 0 && estado.deudaFinal > 0)
                           ? Math.round(estado.deudaFinal / 3) : 0,
    tipoInvestigacion:   ronda === 4 && idx === 0 ? 'Basica' : 'No',
    montoInvestigacion:  0,
    stockMPInicial:      estado.stockMPFinal || 0,
    proveedorElegido:    'prov_1',
    cantidadMPpedida:    0,
    pedidosPendientes:   estado.pedidosPendientesResta || [],
    inventarioInicial:   0,  // se propagará por el recálculo
    reputacionInicial:   50,
    brandEquityInicial:  estado.brandEquityFinal || 50,
  };
}

// ── Construir decisión completa del equipo ─────────────────────────────────
function buildDecision(equipo, ronda, estado, p0) {
  const est = ESTRATEGIAS[equipo.nombre] || ESTRATEGIAS['F'];
  const productos = PRODUCTOS.map((prod, idx) =>
    buildProducto(prod, est, ronda, estado, idx)
  );
  const prod0 = productos[0];

  return {
    equipo:          equipo.id,
    equipoOriginal:  equipo.id,
    equipoNombre:    equipo.nombre,
    productoId:      'prod_1',
    rondaNumero:     ronda,
    submitted:       true,
    submittedAt:     new Date().toISOString(),
    // Apertura financiera
    cajaInicial:                Math.max(0, estado.cajaFinal ?? (p0.cajaInicial || 500000)),
    activosFijosIniciales:      Math.max(0, estado.afNetos ?? (p0.activosFijosIniciales || 80000)),
    cxcInicial:                 Math.max(0, estado.cxcFinal ?? 0),
    deudaInicial:               Math.max(0, estado.deudaFinal ?? 0),
    brandEquityInicial:         estado.brandEquityFinal ?? 50,
    vendedoresIniciales:        Math.max(0, estado.vendedoresFinales ?? 0),
    operariosIniciales:         Math.max(1, estado.operariosFinales ?? 1),
    inventarioInicial:          Math.max(0, estado.inventarioFinal ?? 0),
    stockMPInicial:             Math.max(0, estado.stockMPFinal ?? 0),
    pedidosPendientes:          estado.pedidosPendientesResta ?? [],
    resultadoAcumuladoAnterior: estado.resultadoAcumulado ?? 0,
    ivaAPagarAnterior:          Math.max(0, estado.ivaAPagar ?? 0),
    ivaSaldoAFavorAnterior:     Math.max(0, estado.ivaSaldoAFavor ?? 0),
    saldoIUEcompensable:        Math.max(0, estado.saldoIUEfinal ?? 0),
    // Campos planos (primer producto por compatibilidad)
    ...prod0,
    productos,
  };
}

// ── Verificar cuadre ───────────────────────────────────────────────────────
function verificarCuadre(resultados, ronda) {
  let ok = 0, fail = 0;
  for (const r of resultados) {
    const A   = r.totalActivos  || 0;
    const P   = r.totalPasivos  || (r.deudaFinal||0)+(r.ivaAPagar||0);
    const Pat = r.patrimonio    || 0;
    const d   = Math.abs(A-(P+Pat));
    if (d < 2) ok++; else { fail++; console.log(`  ⚠ R${ronda} ${r.equipoNombre}: Δ=${d.toFixed(0)}`); }
  }
  return { ok, fail };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SIMULACIÓN COMPLETA — 6 Equipos × 5 Productos × 12R    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Cargar sim ──────────────────────────────────────────────────────────
  const simRow = await pool.query(`SELECT id FROM simulaciones ORDER BY creada_at DESC LIMIT 1`);
  if (!simRow.rows.length) { console.error('❌ Sin simulaciones'); await pool.end(); return; }
  const sim = await storage.getSimulacion(simRow.rows[0].id);
  if (!sim) { console.error('❌ No se pudo cargar sim'); await pool.end(); return; }

  const params   = sim.parametros || {};
  const equipos  = (sim.users||[]).filter(u=>u.rol==='equipo');
  const segmentos = Array.isArray(sim.segmentos) ? sim.segmentos : Object.values(sim.segmentos||{});

  console.log(`Sim: ${sim.nombre} (${sim.id})`);
  console.log(`Equipos: ${equipos.map(e=>e.nombre).join(', ')}`);
  console.log(`Params: cajaInicial=${params.cajaInicial?.toLocaleString('es-BO')} AF=${params.activosFijosIniciales?.toLocaleString('es-BO')}\n`);

  const simCfgBase = {
    params, tiposProducto: sim.tipos_producto || {}, canales: sim.canales || {},
    segmentos, afinidadMatrix: sim.afinidad_matrix || {},
    competenciaExterna: sim.competencia_externa || [],
    proveedores: sim.proveedores || [],
    shock: { tipo:'neutral', magnitud:0, descripcion:'sin shock' },
    equipos,
  };

  // ── Estado inicial de cada equipo ───────────────────────────────────────
  const estadoEmpresa = {};
  for (const eq of equipos) {
    estadoEmpresa[eq.id] = {
      cajaFinal:          params.cajaInicial || 500000,
      afNetos:            params.activosFijosIniciales || 80000,
      cxcFinal:           0, deudaFinal: 0, inventarioFinal: 0,
      brandEquityFinal:   50, vendedoresFinales: 0, operariosFinales: 1,
      resultadoAcumulado: 0, ivaAPagar: 0, ivaSaldoAFavor: 0,
      saldoIUEfinal: 0, stockMPFinal: 0, pedidosPendientesResta: [],
    };
  }

  let demandaBaseAnteriorMap = {};
  const rondaInicio = SOLO > 0 ? SOLO : DESDE;
  const rondaFin    = SOLO > 0 ? SOLO : 12;

  // Si continuamos desde una ronda > 1, cargar estado anterior
  if (rondaInicio > 1) {
    const prevRonda = await storage.getRonda(sim.id, rondaInicio - 1);
    if (prevRonda?.resultados) {
      const prevRes = prevRonda.resultados.resultados || prevRonda.resultados;
      for (const eq of equipos) {
        const r = prevRes[eq.id] || prevRes[eq.id + '__prod_1'];
        if (r) {
          estadoEmpresa[eq.id] = {
            cajaFinal: r.cajaFinal||0, afNetos: r.afNetos||0,
            cxcFinal: r.cxcFinal||0, deudaFinal: r.deudaFinal||0,
            inventarioFinal: r.inventarioFinal||0, brandEquityFinal: r.brandEquityFinal||50,
            vendedoresFinales: r.vendedoresFinales||0, operariosFinales: r.operariosFinales||1,
            resultadoAcumulado: r.resultadoAcumulado||0, ivaAPagar: r.ivaAPagar||0,
            ivaSaldoAFavor: r.ivaSaldoAFavor||0, saldoIUEfinal: r.saldoIUEfinal||0,
            stockMPFinal: r.stockMPFinal||0, pedidosPendientesResta: r.pedidosPendientesResta||[],
          };
        }
      }
      if (prevRonda.resultados.mercadoSegmentos) {
        for (const seg of prevRonda.resultados.mercadoSegmentos) {
          demandaBaseAnteriorMap[seg.nombre] = seg.demandaActual || seg.demandaBase;
        }
      }
    }
    console.log(`Estado cargado desde R${rondaInicio-1}\n`);
  }

  // ── Simular rondas ──────────────────────────────────────────────────────
  const resumenFinal = [];

  for (let n = rondaInicio; n <= rondaFin; n++) {
    const fase = n<=2 ? 'SETUP' : n<=6 ? 'CRECIMIENTO' : n<=9 ? 'OPTIMIZACIÓN' : 'MADUREZ';
    console.log(`\n── R${String(n).padStart(2,'0')} [${fase}] ${'─'.repeat(40)}`);

    // Construir decisiones
    const decisiones = equipos.map(eq =>
      buildDecision(eq, n, estadoEmpresa[eq.id] || {}, { cajaInicial: params.cajaInicial, activosFijosIniciales: params.activosFijosIniciales })
    );

    // Ejecutar motor
    let resultado;
    try {
      resultado = engine.ejecutarSimulador(decisiones, {
        ...simCfgBase, rondaNumero: n, demandaBaseAnteriorMap,
      });
    } catch(e) {
      console.error(`  ❌ Error motor R${n}: ${e.message}`);
      continue;
    }

    // Verificar cuadre
    const { ok, fail } = verificarCuadre(resultado.resultados, n);
    const cuadreStr = fail === 0 ? `✅ ${ok}/${ok} cuadran` : `⚠ ${fail} descuadres`;

    // Resumen financiero de la ronda
    console.log(`  ${cuadreStr} | Mercado: ${resultado.mercadoSegmentos?.length||0} segmentos`);
    console.log(`  ${'Equipo'.padEnd(8)} ${'Caja'.padStart(10)} ${'Ventas'.padStart(10)} ${'Util.Neta'.padStart(12)} ${'Share%'.padStart(8)}`);
    console.log(`  ${'─'.repeat(50)}`);

    const nuevoResObj = {};
    resultado.resultados.forEach(r => {
      nuevoResObj[r.equipo] = r;
      const eqId  = r.equipoOriginal || r.equipo.split('__')[0];
      const nombre = equipos.find(e=>e.id===eqId)?.nombre || '?';
      const share = ((r.shareReal||0)*100).toFixed(1);
      console.log(`  ${nombre.padEnd(8)} ${(r.cajaFinal||0).toLocaleString('es-BO').padStart(10)} ${(r.ventasNetas||0).toLocaleString('es-BO').padStart(10)} ${(r.utilidadNeta||0).toLocaleString('es-BO').padStart(12)} ${share.padStart(7)}%`);
    });

    // Actualizar estado para siguiente ronda
    const porEmpresa = {};
    resultado.resultados.forEach(r => {
      const eqId = r.equipoOriginal || r.equipo.split('__')[0];
      if (!porEmpresa[eqId]) porEmpresa[eqId] = [];
      porEmpresa[eqId].push(r);
    });
    for (const [eqId, prods] of Object.entries(porEmpresa)) {
      const p0 = prods[0];
      // resultadoAcumulado = previo + SUMA de utilidades de TODOS los productos
      // (contrato correcto para multiproducto — Meyer, Design by Contract)
      const utilNetaTotal   = prods.reduce((s,p) => s+(p.utilidadNeta||0), 0);
      const resAcumAnterior = estadoEmpresa[eqId]?.resultadoAcumulado ?? 0;
      estadoEmpresa[eqId] = {
        cajaFinal:         p0.cajaFinal||0,      afNetos:           p0.afNetos||0,
        cxcFinal:          p0.cxcFinal||0,       deudaFinal:        p0.deudaFinal||0,
        inventarioFinal:   prods.reduce((s,p)=>s+Math.max(0,p.inventarioFinal||0),0),
        brandEquityFinal:  p0.brandEquityFinal||50, vendedoresFinales: p0.vendedoresFinales||0,
        operariosFinales:  p0.operariosFinales||1,
        resultadoAcumulado: resAcumAnterior + utilNetaTotal,
        ivaAPagar:         Math.max(0,p0.ivaAPagar||0),
        ivaSaldoAFavor:    Math.max(0,p0.ivaSaldoAFavor||0),
        saldoIUEfinal:     Math.max(0,p0.saldoIUEfinal||0),
        stockMPFinal:      p0.stockMPFinal||0,
        pedidosPendientesResta: p0.pedidosPendientesResta||[],
      };
    }

    // Actualizar demanda base
    if (resultado.mercadoSegmentos) {
      demandaBaseAnteriorMap = {};
      for (const seg of resultado.mercadoSegmentos) {
        demandaBaseAnteriorMap[seg.nombre] = seg.demandaActual || seg.demandaBase;
      }
    }

    // Guardar en BD
    try {
      await pool.query(
        `INSERT INTO sim_rondas (simulacion_id, numero, estado, resultados, calculada_at)
         VALUES ($1, $2, 'calculada', $3::jsonb, NOW())
         ON CONFLICT (simulacion_id, numero)
         DO UPDATE SET estado='calculada', resultados=$3::jsonb, calculada_at=NOW()`,
        [sim.id, n, JSON.stringify({
          resultados:       nuevoResObj,
          mercadoSegmentos: resultado.mercadoSegmentos,
          atractivoEquipos: resultado.atractivoEquipos,
          dashboard:        resultado.dashboard,
          empresas:         resultado.empresas,
          decisiones:       Object.fromEntries(equipos.map(eq=>[eq.id, decisiones.find(d=>d.equipo===eq.id)])),
        })]
      );
      console.log(`  💾 R${n} guardada en BD`);
    } catch(e) {
      console.error(`  ❌ Error guardando R${n}: ${e.message}`);
    }

    // Para resumen final
    resumenFinal.push({
      ronda: n, fase, cuadre: fail===0,
      totales: {
        ventasTotal:  resultado.resultados.reduce((s,r)=>s+(r.ventasNetas||0),0),
        utilTotal:    resultado.resultados.reduce((s,r)=>s+(r.utilidadNeta||0),0),
      }
    });
  }

  // Actualizar currentRound en sim config
  try {
    await pool.query(
      `UPDATE simulaciones SET config = jsonb_set(config::jsonb, '{currentRound}', $1::jsonb) WHERE id=$2`,
      [JSON.stringify(rondaFin), sim.id]
    );
  } catch(e) { /* no crítico */ }

  // ── Resumen final ───────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  RESUMEN FINAL — ${rondaFin - rondaInicio + 1} rondas simuladas                      ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  ${'Ronda'.padEnd(6)} ${'Fase'.padEnd(12)} ${'Ventas Total'.padStart(14)} ${'Util. Total'.padStart(14)} ${'Cuadre'.padEnd(8)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  for (const r of resumenFinal) {
    const v = r.totales.ventasTotal.toLocaleString('es-BO').padStart(14);
    const u = r.totales.utilTotal.toLocaleString('es-BO').padStart(14);
    const c = r.cuadre ? '✅' : '❌';
    console.log(`║  R${String(r.ronda).padStart(2,'0')}    ${r.fase.padEnd(12)} ${v} ${u} ${c}       ║`);
  }
  console.log('╠══════════════════════════════════════════════════════════╣');

  // Estado final por equipo
  console.log('║  Estado final de equipos:                               ║');
  for (const eq of equipos) {
    const est = estadoEmpresa[eq.id];
    const caja = (est?.cajaFinal||0).toLocaleString('es-BO').padStart(10);
    const util = (est?.resultadoAcumulado||0).toLocaleString('es-BO').padStart(12);
    console.log(`║  ${eq.nombre.padEnd(8)}: Caja=${caja}  ResAcum=${util}   ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await pool.end();
  process.exit(0);
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
