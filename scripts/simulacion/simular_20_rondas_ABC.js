/**
 * simular_20_rondas_ABC.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════
 * Simula 20 rondas para la simulación ABC:
 *   10 equipos × 5 productos × 20 rondas = 1.000 decisiones
 *
 * ESTRATEGIAS (10 equipos):
 *   A → Innovador     (invierte en innovación, alto margen)
 *   B → Premium       (precio alto, calidad máxima, volumen bajo)
 *   C → Equilibrado   (precio medio, Venta Digital)
 *   D → Especialista  (foco en 2-3 productos, Convenios)
 *   E → Volumen       (precio bajo, alto volumen, B2B)
 *   F → Conservador   (crecimiento gradual, bajo riesgo)
 *   G → Disruptor     (precio agresivo, marketing intensivo)
 *   H → Premium Niche (precio muy alto, segmentos exclusivos)
 *   I → Digital First (Venta Digital + Redes, marketing digital)
 *   J → Diversificado (cada producto en canal diferente)
 *
 * FASES (20 rondas):
 *   R01-R03 → Setup         (contratar, establecer portafolio)
 *   R04-R08 → Crecimiento   (escalar producción y marketing)
 *   R09-R13 → Optimización  (ajustar precios y mix)
 *   R14-R17 → Madurez       (maximizar márgenes)
 *   R18-R20 → Consolidación (defender posición)
 *
 * USO:
 *   node simular_20_rondas_ABC.js
 *   node simular_20_rondas_ABC.js --desde 8   (continuar desde R8)
 *   node simular_20_rondas_ABC.js --solo 5    (solo ronda 5)
 *   node simular_20_rondas_ABC.js --validar   (solo valida, no guarda)
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

const DESDE   = parseInt(process.argv[process.argv.indexOf('--desde')+1]) || 1;
const SOLO    = parseInt(process.argv[process.argv.indexOf('--solo')+1])  || 0;
const VALIDAR = process.argv.includes('--validar');
const SIM_NOMBRE = 'ABC';

// ── 5 productos de Calzados ───────────────────────────────────────────────
const PRODUCTOS = [
  { id:'prod_1', nombre:'Calzado Sensorial TEA',        costoBase:120,    segmento:'Personas con condición postural',         canal:'Tienda Propia'             },
  { id:'prod_2', nombre:'Calzado Biomecánico Formal',   costoBase:153,    segmento:'Personas con fascitis y dolor plantar',   canal:'Tienda Propia'             },
  { id:'prod_3', nombre:'Calzado Ortopédico Laboral',   costoBase:136,    segmento:'Comerciantes y trabajadores de mercado',  canal:'Distribuidores B2B'        },
  { id:'prod_4', nombre:'Sandalia Infantil Ajustable',  costoBase:79,     segmento:'Padres y familias con niños (0-10 años)', canal:'Tienda Propia'             },
  { id:'prod_5', nombre:'Sneaker Cultural Premium',     costoBase:298,    segmento:'Jóvenes urbanos / lifestyle boliviano',   canal:'Venta Digital'             },
];

// ── Estrategias 10 equipos ─────────────────────────────────────────────────
const ESTRATEGIAS = {
  'A': { nombre:'Innovador',     margen:0.70, calidad:7, volBase:120, canal:'Ferias y Eventos',          mktBase:7000,  innovacion:true,  credito:false },
  'B': { nombre:'Premium',       margen:0.85, calidad:9, volBase:70,  canal:'Tienda Propia',             mktBase:12000, innovacion:false, credito:false },
  'C': { nombre:'Equilibrado',   margen:0.58, calidad:6, volBase:150, canal:'Venta Digital',             mktBase:8000,  innovacion:false, credito:false },
  'D': { nombre:'Especialista',  margen:0.78, calidad:8, volBase:100, canal:'Convenios Institucionales', mktBase:9000,  innovacion:false, credito:false },
  'E': { nombre:'Volumen',       margen:0.30, calidad:5, volBase:230, canal:'Distribuidores B2B',        mktBase:3500,  innovacion:false, credito:true  },
  'F': { nombre:'Conservador',   margen:0.45, calidad:6, volBase:130, canal:'Tienda Propia',             mktBase:5000,  innovacion:false, credito:false },
  'G': { nombre:'Disruptor',     margen:0.25, calidad:4, volBase:260, canal:'Distribuidores B2B',        mktBase:15000, innovacion:false, credito:true  },
  'H': { nombre:'PremiumNiche',  margen:1.20, calidad:10,volBase:40,  canal:'Convenios Institucionales', mktBase:18000, innovacion:true,  credito:false },
  'I': { nombre:'DigitalFirst',  margen:0.65, calidad:7, volBase:140, canal:'Venta Digital',             mktBase:20000, innovacion:false, credito:false },
  'J': { nombre:'Diversificado', margen:0.55, calidad:6, volBase:110, canal:'Tienda Propia',             mktBase:7500,  innovacion:false, credito:false },
};

// ── Canales alternativos por equipo para diversificación ──────────────────
const CANALES_PROD = {
  'J': ['Tienda Propia','Venta Digital','Distribuidores B2B','Convenios Institucionales','Ferias y Eventos'],
};

// ── Fases (20 rondas) ─────────────────────────────────────────────────────
function factorFase(ronda) {
  if (ronda <= 3)  return { fase:'SETUP',         vol:0.55, mkt:0.65, precio:0.93, ops:3 };
  if (ronda <= 8)  return { fase:'CRECIMIENTO',   vol:1.00, mkt:1.00, precio:1.00, ops:0 };
  if (ronda <= 13) return { fase:'OPTIMIZACIÓN',  vol:1.20, mkt:1.25, precio:1.06, ops:1 };
  if (ronda <= 17) return { fase:'MADUREZ',       vol:1.15, mkt:1.15, precio:1.12, ops:0 };
  return                   { fase:'CONSOLIDACIÓN',vol:1.05, mkt:1.00, precio:1.15, ops:0 };
}

// ── Construir producto de decisión ────────────────────────────────────────
function buildProducto(prod, est, ronda, estado, idx) {
  const f    = factorFase(ronda);
  const pnet = Math.round(prod.costoBase * (1 + est.margen) * f.precio);
  let   vol  = Math.round(est.volBase * f.vol);

  // Especialista: foco en prod_1 y prod_2, el resto mínimo
  if (est.nombre === 'Especialista' && idx >= 2) vol = Math.round(vol * 0.25);
  // Premium Niche: solo prod_1 y prod_5, resto simbólico
  if (est.nombre === 'PremiumNiche' && idx >= 2 && idx <= 3) vol = Math.round(vol * 0.2);
  // Conservador: crecimiento gradual
  if (est.nombre === 'Conservador') vol = Math.round(vol * (0.65 + ronda * 0.022));
  // Disruptor: volumen máximo en fases tempranas
  if (est.nombre === 'Disruptor' && ronda <= 8) vol = Math.round(vol * 1.3);

  // Canal por producto (Diversificado usa canal diferente por línea)
  const canalProd = CANALES_PROD[est.nombre === 'Diversificado' ? 'J' : '']?.[idx] || est.canal;

  return {
    productoId:       prod.id,
    activo:           true,
    producto:         prod.nombre,
    segmentoObjetivo: prod.segmento,
    canalPrincipal:   canalProd,
    canalSecundario:  'Ninguno',
    calidad:          Math.min(10, est.calidad),
    precioVenta:      pnet,
    produccion:       Math.max(10, Math.min(vol, 280)),
    publicidad:       Math.round(est.mktBase * f.mkt / 5),
    promocion:        ronda >= 6 ? 2000 : 0,
    eventos:          (est.nombre === 'Innovador' || est.nombre === 'PremiumNiche') ? 4000 : 0,
    marketingRedes:   (est.nombre === 'DigitalFirst') ? 8000 : est.nombre === 'Equilibrado' ? 3000 : 0,
    relacionesPublicas: (est.nombre === 'Premium' || est.nombre === 'PremiumNiche') ? 3000 : 0,
    contratarVendedores: (ronda === 1 && idx === 0) ? 1 : (ronda === 10 && idx === 0) ? 1 : 0,
    despedirVendedores:  0,
    contratarOperarios:  (ronda === 1 && idx === 0) ? f.ops :
                         (ronda === 9 && idx === 0)  ? 1 : 0,
    despedirOperarios:   0,
    montoCapacitacion:   (est.nombre === 'Innovador' || est.nombre === 'PremiumNiche') ? 3000 : 0,
    innovacion:          est.innovacion && idx === 0 && ronda % 4 === 0,
    montoInnovacion:     (est.innovacion && idx === 0 && ronda % 4 === 0) ? 18000 : 0,
    tipoInnovacion:      'Producto',
    tipoPrestamo:        (est.credito && ronda === 1 && idx === 0) ? 'Operativo' : 'Ninguno',
    montoPrestamo:       (est.credito && ronda === 1 && idx === 0) ? 90000 : 0,
    plazoPrestamo:       5,
    amortizacion:        (est.credito && ronda > 1 && idx === 0 && (estado.deudaFinal||0) > 0)
                           ? Math.round((estado.deudaFinal||0) / 4) : 0,
    tipoInvestigacion:   (ronda === 5 && idx === 0) ? 'Basica' : (ronda === 12 && idx === 0) ? 'Premium' : 'No',
    montoInvestigacion:  0,
    stockMPInicial:      estado.stockMPFinal || 0,
    proveedorElegido:    'prov_1',
    cantidadMPpedida:    0,
    pedidosPendientes:   estado.pedidosPendientesResta || [],
    inventarioInicial:   0,
    reputacionInicial:   50,
    brandEquityInicial:  estado.brandEquityFinal || 50,
  };
}

// ── Construir decisión completa del equipo ─────────────────────────────────
function buildDecision(equipo, ronda, estado, params) {
  const est = ESTRATEGIAS[equipo.nombre] || ESTRATEGIAS['F'];
  const productos = PRODUCTOS.map((prod, idx) =>
    buildProducto(prod, est, ronda, estado, idx)
  );
  const prod0 = productos[0];
  return {
    equipo: equipo.id, equipoOriginal: equipo.id, equipoNombre: equipo.nombre,
    productoId: 'prod_1', rondaNumero: ronda, submitted: true,
    submittedAt: new Date().toISOString(),
    cajaInicial:                Math.max(0, estado.cajaFinal   ?? (params.cajaInicial || 500000)),
    activosFijosIniciales:      Math.max(0, estado.afNetos     ?? (params.activosFijosIniciales || 80000)),
    cxcInicial:                 Math.max(0, estado.cxcFinal    ?? 0),
    deudaInicial:               Math.max(0, estado.deudaFinal  ?? 0),
    brandEquityInicial:         estado.brandEquityFinal ?? 50,
    vendedoresIniciales:        Math.max(0, estado.vendedoresFinales ?? (params.vendedoresIniciales ?? 0)),
    operariosIniciales:         Math.max(1, estado.operariosFinales  ?? (params.operariosIniciales  ?? 1)),
    inventarioInicial:          Math.max(0, estado.inventarioFinal ?? 0),
    stockMPInicial:             Math.max(0, estado.stockMPFinal ?? 0),
    pedidosPendientes:          estado.pedidosPendientesResta ?? [],
    resultadoAcumuladoAnterior: estado.resultadoAcumulado ?? 0,
    ivaAPagarAnterior:          Math.max(0, estado.ivaAPagar ?? 0),
    ivaSaldoAFavorAnterior:     Math.max(0, estado.ivaSaldoAFavor ?? 0),
    saldoIUEcompensable:        Math.max(0, estado.saldoIUEfinal ?? 0),
    ...prod0,
    productos,
  };
}

// ── Verificar cuadre contable ─────────────────────────────────────────────
function verificarCuadre(resultados, ronda) {
  let ok = 0, fail = 0;
  resultados.forEach(r => {
    const d = Math.abs((r.totalActivos||0)-((r.totalPasivos||0)+(r.patrimonio||0)));
    if (d < 2) ok++; else { fail++; console.log(`  ⚠ R${ronda} ${r.equipoNombre||r.equipo}: Δ=${d.toFixed(0)}`); }
  });
  return { ok, fail };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  SIMULACIÓN ABC — 10 Equipos × 5 Productos × 20 Rondas  ║');
  if (VALIDAR) console.log('║  MODO: Solo validar (no guarda en BD)                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── Cargar sim ABC ──────────────────────────────────────────────────────
  const simRow = await pool.query(
    `SELECT id FROM simulaciones WHERE nombre=$1 ORDER BY creada_at DESC LIMIT 1`,
    [SIM_NOMBRE]
  );
  if (!simRow.rows.length) {
    console.error(`❌ Simulación "${SIM_NOMBRE}" no encontrada. Corre crear_sim_ABC.js primero.`);
    await pool.end(); return;
  }
  const sim = await storage.getSimulacion(simRow.rows[0].id);
  const params   = sim.parametros || {};
  const equipos  = (sim.users||[]).filter(u=>u.rol==='equipo');
  const segmentos = Array.isArray(sim.segmentos) ? sim.segmentos : Object.values(sim.segmentos||{});

  console.log(`Sim: ${sim.nombre} (${sim.id})`);
  console.log(`Equipos: ${equipos.map(e=>e.nombre).join(', ')}`);
  console.log(`Params: caja=${params.cajaInicial?.toLocaleString('es-BO')} AF=${params.activosFijosIniciales?.toLocaleString('es-BO')}\n`);

  const simCfgBase = {
    params, tiposProducto: sim.tipos_producto || {},
    canales: sim.canales || {}, segmentos,
    afinidadMatrix: sim.afinidad_matrix || {},
    competenciaExterna: sim.competencia_externa || [],
    proveedores: sim.proveedores || [],
    shock: { tipo:'neutral', magnitud:0, descripcion:'sin shock' },
    equipos,
  };

  // ── Estado inicial ───────────────────────────────────────────────────────
  const estadoEmpresa = {};
  for (const eq of equipos) {
    estadoEmpresa[eq.id] = {
      cajaFinal: params.cajaInicial||500000, afNetos: params.activosFijosIniciales||80000,
      cxcFinal:0, deudaFinal:0, inventarioFinal:0, brandEquityFinal:50,
      vendedoresFinales:0, operariosFinales:1, resultadoAcumulado:0,
      ivaAPagar:0, ivaSaldoAFavor:0, saldoIUEfinal:0,
      stockMPFinal:0, pedidosPendientesResta:[],
    };
  }

  let demandaBaseAnteriorMap = {};
  const rondaInicio = SOLO > 0 ? SOLO : DESDE;
  const rondaFin    = SOLO > 0 ? SOLO : 20;

  // Cargar estado previo si continuamos desde una ronda > 1
  if (rondaInicio > 1) {
    const prevRonda = await storage.getRonda(sim.id, rondaInicio - 1);
    if (prevRonda?.resultados) {
      const prevRes = prevRonda.resultados.resultados || prevRonda.resultados;
      for (const eq of equipos) {
        const r = prevRes[eq.id] || prevRes[eq.id+'__prod_1'];
        if (r) estadoEmpresa[eq.id] = {
          cajaFinal:r.cajaFinal||0, afNetos:r.afNetos||0, cxcFinal:r.cxcFinal||0,
          deudaFinal:r.deudaFinal||0, inventarioFinal:r.inventarioFinal||0,
          brandEquityFinal:r.brandEquityFinal||50, vendedoresFinales:r.vendedoresFinales||0,
          operariosFinales:r.operariosFinales||1, resultadoAcumulado:r.resultadoAcumulado||0,
          ivaAPagar:r.ivaAPagar||0, ivaSaldoAFavor:r.ivaSaldoAFavor||0,
          saldoIUEfinal:r.saldoIUEfinal||0, stockMPFinal:r.stockMPFinal||0,
          pedidosPendientesResta:r.pedidosPendientesResta||[],
        };
      }
      if (prevRonda.resultados.mercadoSegmentos) {
        for (const seg of prevRonda.resultados.mercadoSegmentos)
          demandaBaseAnteriorMap[seg.nombre] = seg.demandaActual || seg.demandaBase;
      }
      console.log(`Estado cargado desde R${rondaInicio-1}\n`);
    }
  }

  // ── Simular rondas ──────────────────────────────────────────────────────
  const resumenFinal = [];

  for (let n = rondaInicio; n <= rondaFin; n++) {
    const { fase } = factorFase(n);
    console.log(`\n── R${String(n).padStart(2,'0')} [${fase}] ${'─'.repeat(40)}`);

    const decisiones = equipos.map(eq =>
      buildDecision(eq, n, estadoEmpresa[eq.id]||{}, params)
    );

    let resultado;
    try {
      resultado = engine.ejecutarSimulador(decisiones, { ...simCfgBase, rondaNumero:n, demandaBaseAnteriorMap });
    } catch(e) {
      console.error(`  ❌ Error motor R${n}: ${e.message}`);
      continue;
    }

    const { ok, fail } = verificarCuadre(resultado.resultados, n);
    const total = resultado.resultados.length;
    const nEqs  = equipos.length;
    console.log(`  ${fail===0?'✅':'⚠'} ${ok}/${total} cuadran | ${nEqs} equipos × 5 productos`);

    // Tabla resumen por equipo (consolidado)
    const porEquipoRes = {};
    resultado.resultados.forEach(r => {
      const eqId = r.equipoOriginal || r.equipo.split('__')[0];
      if (!porEquipoRes[eqId]) porEquipoRes[eqId] = { vN:0, uN:0, share:0, caja:0, prods:0 };
      porEquipoRes[eqId].vN    += r.ventasNetas||0;
      porEquipoRes[eqId].uN    += r.utilidadNeta||0;
      porEquipoRes[eqId].share += r.shareReal||0;
      porEquipoRes[eqId].caja   = r.cajaFinal||0;  // prod_1 tiene caja empresa
      porEquipoRes[eqId].prods++;
    });

    console.log(`  ${'Eq'.padEnd(4)} ${'Caja'.padStart(12)} ${'Ventas'.padStart(12)} ${'Util.Neta'.padStart(13)} ${'Share%'.padStart(8)}`);
    console.log(`  ${'─'.repeat(53)}`);
    for (const eq of equipos) {
      const d = porEquipoRes[eq.id];
      if (!d) continue;
      console.log(`  ${eq.nombre.padEnd(4)} ${(d.caja).toLocaleString('es-BO').padStart(12)} ${(d.vN).toLocaleString('es-BO').padStart(12)} ${(d.uN).toLocaleString('es-BO').padStart(13)} ${(d.share*100).toFixed(1).padStart(7)}%`);
    }

    // Actualizar estado
    const nuevoResObj = {};
    resultado.resultados.forEach(r => { nuevoResObj[r.equipo] = r; });
    const porEmpresa = {};
    resultado.resultados.forEach(r => {
      const eqId = r.equipoOriginal || r.equipo.split('__')[0];
      if (!porEmpresa[eqId]) porEmpresa[eqId] = [];
      porEmpresa[eqId].push(r);
    });
    for (const [eqId, prods] of Object.entries(porEmpresa)) {
      const p0 = prods[0];
      const utilNetaTotal = prods.reduce((s,p)=>s+(p.utilidadNeta||0),0);
      estadoEmpresa[eqId] = {
        cajaFinal:p0.cajaFinal||0, afNetos:p0.afNetos||0, cxcFinal:p0.cxcFinal||0,
        deudaFinal:p0.deudaFinal||0,
        inventarioFinal:prods.reduce((s,p)=>s+Math.max(0,p.inventarioFinal||0),0),
        brandEquityFinal:p0.brandEquityFinal||50, vendedoresFinales:p0.vendedoresFinales||0,
        operariosFinales:p0.operariosFinales||1,
        resultadoAcumulado:(estadoEmpresa[eqId]?.resultadoAcumulado||0)+utilNetaTotal,
        ivaAPagar:Math.max(0,p0.ivaAPagar||0), ivaSaldoAFavor:Math.max(0,p0.ivaSaldoAFavor||0),
        saldoIUEfinal:Math.max(0,p0.saldoIUEfinal||0), stockMPFinal:p0.stockMPFinal||0,
        pedidosPendientesResta:p0.pedidosPendientesResta||[],
      };
    }
    if (resultado.mercadoSegmentos) {
      demandaBaseAnteriorMap = {};
      for (const seg of resultado.mercadoSegmentos)
        demandaBaseAnteriorMap[seg.nombre] = seg.demandaActual||seg.demandaBase;
    }

    // Guardar en BD
    if (!VALIDAR) {
      try {
        await pool.query(
          `INSERT INTO sim_rondas (simulacion_id,numero,estado,resultados,calculada_at)
           VALUES ($1,$2,'calculada',$3::jsonb,NOW())
           ON CONFLICT (simulacion_id,numero)
           DO UPDATE SET estado='calculada',resultados=$3::jsonb,calculada_at=NOW()`,
          [sim.id, n, JSON.stringify({
            resultados: nuevoResObj,
            mercadoSegmentos: resultado.mercadoSegmentos,
            atractivoEquipos: resultado.atractivoEquipos,
            dashboard: resultado.dashboard,
            empresas: resultado.empresas,
            decisiones: Object.fromEntries(equipos.map(eq=>[eq.id, decisiones.find(d=>d.equipo===eq.id)])),
          })]
        );
        console.log(`  💾 R${n} guardada`);
      } catch(e) { console.error(`  ❌ Error guardando R${n}: ${e.message}`); }
    }

    resumenFinal.push({
      ronda:n, fase,
      cuadre: fail===0,
      ventasTotal: resultado.resultados.reduce((s,r)=>s+(r.ventasNetas||0),0),
      utilTotal:   resultado.resultados.reduce((s,r)=>s+(r.utilidadNeta||0),0),
    });
  }

  // ── Actualizar currentRound en sim ───────────────────────────────────────
  if (!VALIDAR) {
    try {
      await pool.query(
        `UPDATE simulaciones SET config=jsonb_set(config::jsonb,'{currentRound}',$1::jsonb) WHERE id=$2`,
        [JSON.stringify(rondaFin), sim.id]
      );
    } catch {}
  }

  // ── Resumen final ─────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  RESUMEN — ${resumenFinal.length} rondas simuladas${VALIDAR?' (sin guardar)':''}                ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  for (const r of resumenFinal) {
    const v = r.ventasTotal.toLocaleString('es-BO').padStart(14);
    const u = r.utilTotal.toLocaleString('es-BO').padStart(14);
    console.log(`║  R${String(r.ronda).padStart(2,'0')}  ${r.fase.padEnd(13)} ${v} ${u} ${r.cuadre?'✅':'❌'}   ║`);
  }
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Estado final de equipos:                               ║');
  for (const eq of equipos) {
    const est = estadoEmpresa[eq.id];
    const caja = (est?.cajaFinal||0).toLocaleString('es-BO').padStart(10);
    const util = (est?.resultadoAcumulado||0).toLocaleString('es-BO').padStart(12);
    console.log(`║  ${eq.nombre.padEnd(4)}: Caja=${caja}  ResAcum=${util}  ║`);
  }
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  await pool.end();
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
