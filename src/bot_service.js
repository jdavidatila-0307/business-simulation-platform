// src/bot_service.js
// =============================================================================
// Servicio de bots con IA para SimNego.
// Genera decisiones de negocio usando la API de Anthropic (claude-haiku)
// para simular competidores artificiales con estrategias predefinidas.
//
// DEPENDENCIA: npm install @anthropic-ai/sdk
// ENV REQUERIDA: ANTHROPIC_API_KEY
//
// CAMBIOS v2.1:
//   - decisionFallback: precio calculado sobre costo total (base+canal+calidad),
//     no sobre costoBase solo. Hace la estrategia viable en cualquier industria.
//   - decisionFallback: selección de producto con mayor afinidad para el segmento.
//   - decisionFallback: producción como fracción directa (no /100), evita
//     produccion=0 en industrias con capacidad < 100 unidades.
//   - construirDecisionCompleta: busca resultado anterior con clave expandida
//     (bot_id__prod_1) ademas de clave directa (bot_id).
// =============================================================================

'use strict';

// ── Perfiles de bot ────────────────────────────────────────────────────────────
const PERFILES_BOT = {
  Agresivo: {
    descripcion: 'Maximizar volumen de ventas. Precio siempre el mas bajo del mercado. '
      + 'Alta produccion aunque genere inventario. Publicidad y promocion intensas. '
      + 'Contrata vendedores agresivamente. No invierte en innovacion todavia. '
      + 'Apunta al segmento de mayor demanda base. Usa el canal con mayor alcance.',
    emoji: 'X',
  },
  Premium: {
    descripcion: 'Diferenciacion por calidad y marca. Precio entre los mas altos del mercado. '
      + 'Produccion moderada para no depreciar la exclusividad. Calidad maxima (9-10). '
      + 'Alta inversion en relaciones publicas y eventos. Apunta a los segmentos mas rentables. '
      + 'Canal propio o de mayor imagen. Innovacion de producto cuando hay presupuesto.',
    emoji: 'D',
  },
  Equilibrado: {
    descripcion: 'Estrategia de precio-valor: precio competitivo en el rango medio del mercado. '
      + 'Produccion ajustada a la demanda estimada. Calidad moderada-alta (6-8). '
      + 'Distribucion equilibrada del presupuesto de marketing entre publicidad, promocion y redes. '
      + 'Segmento mas amplio disponible. Invierte en investigacion de mercado para ajustar.',
    emoji: 'E',
  },
  Innovador: {
    descripcion: 'Apuesta por la innovacion tecnologica o de proceso. Calidad alta (8-10). '
      + 'Precio premium justificado por la innovacion. Produccion inicial conservadora. '
      + 'Alta inversion en innovacion de producto o proceso cada 2-3 rondas. '
      + 'Segmentos nicho y de alto crecimiento. Fuerza de ventas especializada. '
      + 'Marketing digital y de relaciones publicas intenso.',
    emoji: 'R',
  },
};

// ── Constructor de decision bot fallback v2.1 ──────────────────────────────────
function decisionFallback(bot, historialBot, cfg) {
  const perfil    = bot.perfil || 'Equilibrado';
  const segmentos = cfg.segmentos || [];
  const canales   = Object.keys(cfg.canales || {});
  const tipos     = Object.keys(cfg.tiposProducto || {});
  const params    = cfg.params || {};
  const afinidad  = cfg.afinidadMatrix || {};

  const ultimoResultado  = historialBot?.resultados?.slice(-1)[0];
  const cajaActual       = ultimoResultado?.cajaFinal        ?? params.cajaInicial        ?? 50000;

  // ── 1. Parametros estrategicos por perfil ─────────────────────────────────
  //  margen: porcentaje sobre costo total (no sobre costoBase solo)
  //  produccionPct: fraccion directa de capacidad maxima (0.0–1.0)
  const ESTRATEGIA = {
    Agresivo:    { margen: 0.10, calidad: 5, produccionPct: 0.90, canalIdx: 0 },
    Premium:     { margen: 0.65, calidad: 9, produccionPct: 0.40, canalIdx: 0 },
    Equilibrado: { margen: 0.28, calidad: 7, produccionPct: 0.60, canalIdx: Math.min(1, canales.length - 1) },
    Innovador:   { margen: 0.55, calidad: 9, produccionPct: 0.45, canalIdx: 0 },
  };
  const est = ESTRATEGIA[perfil] || ESTRATEGIA.Equilibrado;

  // ── 2. Seleccion de segmento ──────────────────────────────────────────────
  let segIdx;
  if (perfil === 'Agresivo' || perfil === 'Equilibrado') {
    // Mayor demanda base
    segIdx = segmentos.reduce(
      (best, s, i) => (s.demandaBase > (segmentos[best]?.demandaBase || 0) ? i : best), 0
    );
  } else if (perfil === 'Premium') {
    // Menor porcentaje de contrabando (mayor disposicion a pagar precio premium)
    segIdx = segmentos.reduce(
      (best, s, i) => ((s.pctContrabando ?? 1) < (segmentos[best]?.pctContrabando ?? 1) ? i : best), 0
    );
  } else {
    // Innovador: segmento de mayor tendencia de crecimiento
    const crec = segmentos.findIndex(s =>
      (s.tendencia || '').toLowerCase().includes('crec') ||
      (s.tendencia || '').toLowerCase().includes('alto')
    );
    segIdx = crec !== -1 ? crec : Math.min(1, segmentos.length - 1);
  }
  segIdx = Math.min(segIdx, segmentos.length - 1);
  const segmento = segmentos[segIdx] || segmentos[0];

  // ── 3. Seleccion de producto con MAYOR AFINIDAD para el segmento ──────────
  // FIX: evita que el bot compita con afinidad -2 cuando existe un producto +3
  let mejorTipo      = tipos[0];
  let mejorScore     = -Infinity;

  tipos.forEach(tipo => {
    const af   = afinidad[tipo]?.[segIdx] ?? 0;
    const cost = cfg.tiposProducto[tipo]?.costoBase ?? 0;
    // Premium/Innovador prefieren producto de mayor valor con buena afinidad
    const score = (perfil === 'Premium' || perfil === 'Innovador')
      ? af * 2 + cost * 0.01
      : af;
    if (score > mejorScore) {
      mejorScore = score;
      mejorTipo  = tipo;
    }
  });

  // ── 4. Precio sobre costo TOTAL (FIX principal) ───────────────────────────
  // Antes: precioVenta = costoBase * (1 + margen%)
  //   → Jaboncillos: 2.1 * 1.85 = 3.89 Bs (OK)
  //   → Calzados:   65  * 1.85 = 120 Bs  (demasiado caro para "Agresivo")
  //
  // Ahora: precioVenta = (costoBase + costoCanal + costoCalidad) * (1 + margen%)
  //   → Calzados Agresivo: (65 + 15 + 1) * 1.10 = 89 Bs (competitivo vs humano en ~85 Bs)
  //   → Jaboncillos Agresivo: (2.1 + 0.2 + 1) * 1.10 = 3.63 Bs (competitivo)
  const canalKey   = canales[est.canalIdx] || canales[0];
  const tipoCfg    = cfg.tiposProducto[mejorTipo] || {};
  const costoBase  = tipoCfg.costoBase ?? 2.10;
  const costoCanal = cfg.canales[canalKey]?.costoAdicionalUnitario ?? 0;
  const costoTotal = costoBase + costoCanal + 0.20 * est.calidad;
  const precioVenta = Math.round(costoTotal * (1 + est.margen) * 100) / 100;

  // ── 5. Produccion (FIX: fraccion directa, sin /100 adicional) ────────────
  // Antes: Math.round(capacidad * factor / 100) * 100
  //   Si capacidad < 111, el /100 podria dar 0 unidades.
  // Ahora: Math.round(capacidad * factor) — escala directamente.
  const capacidad  = params.capacidadMaxProduccion || 500;
  const produccion = Math.min(
    capacidad,
    Math.max(1, Math.round(capacidad * est.produccionPct))
  );

  // ── 6. Presupuesto de marketing ───────────────────────────────────────────
  const mktBudget = Math.min(cajaActual * 0.25, 30000);
  const DIST_MKT = {
    Agresivo:    { pub: 0.40, prom: 0.30, ev: 0.08, redes: 0.15, rrpp: 0.07 },
    Premium:     { pub: 0.15, prom: 0.08, ev: 0.30, redes: 0.12, rrpp: 0.35 },
    Equilibrado: { pub: 0.28, prom: 0.22, ev: 0.15, redes: 0.22, rrpp: 0.13 },
    Innovador:   { pub: 0.12, prom: 0.08, ev: 0.22, redes: 0.38, rrpp: 0.20 },
  }[perfil];

  return {
    producto:           mejorTipo,
    segmentoObjetivo:   segmento.nombre,
    canalPrincipal:     canalKey,
    canalSecundario:    'Ninguno',
    calidad:            est.calidad,
    precioVenta,
    produccion,
    publicidad:         Math.round(mktBudget * DIST_MKT.pub),
    promocion:          Math.round(mktBudget * DIST_MKT.prom),
    eventos:            Math.round(mktBudget * DIST_MKT.ev),
    marketingRedes:     Math.round(mktBudget * DIST_MKT.redes),
    relacionesPublicas: Math.round(mktBudget * DIST_MKT.rrpp),
    innovacion:         perfil === 'Innovador' && (historialBot?.rondaActual || 1) % 3 === 0,
    tipoInnovacion:     'Producto',
    montoInnovacion:    perfil === 'Innovador' ? Math.round(cajaActual * 0.08) : 0,
    contratarVendedores: perfil === 'Agresivo' ? 1 : 0,
    despedirVendedores:  0,
    tipoPrestamo:       cajaActual < (params.cajaInicial ?? 50000) * 0.3 ? 'Operativo' : 'Ninguno',
    montoPrestamo:      cajaActual < (params.cajaInicial ?? 50000) * 0.3
                          ? Math.round((params.cajaInicial ?? 50000) * 0.5) : 0,
    tipoInvestigacion:  perfil === 'Equilibrado' ? 'Basica' : 'No',
    _fallback:          true,
    _razonamiento:      `Fallback ${perfil}: ${mejorTipo} @ Bs${precioVenta} en "${segmento.nombre}" (af=${mejorScore.toFixed(1)})`,
  };
}

// ── Funcion principal: generarDecisionBot ──────────────────────────────────────
async function generarDecisionBot(bot, historial, cfg) {
  const perfil    = bot.perfil || 'Equilibrado';
  const perfilCfg = PERFILES_BOT[perfil] || PERFILES_BOT.Equilibrado;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(`[bot_service] ANTHROPIC_API_KEY no configurada — usando fallback para bot "${bot.nombre}"`);
    return construirDecisionCompleta(bot, historial, cfg, decisionFallback(bot, historial, cfg));
  }

  const segmentos   = (cfg.segmentos || []).map(s => s.nombre);
  const canales     = Object.keys(cfg.canales || {});
  const tipos       = Object.keys(cfg.tiposProducto || {});
  const params      = cfg.params || {};
  const ultimaRonda = historial?.ultimas2Rondas?.slice(-1)[0];
  const miResultado = ultimaRonda?.resultados?.[bot.id];

  const contextoMercado = historial?.ultimas2Rondas?.length
    ? JSON.stringify(
        historial.ultimas2Rondas.map(r => ({
          ronda: r.numero,
          mercado: (r.mercadoSegmentos || []).map(s => ({
            segmento: s.nombre, demanda: s.demandaTotal, lider: s.lider,
          })),
          miResultado: r.resultados?.[bot.id]
            ? {
                ventasReales: r.resultados[bot.id].ventasReales,
                utilidadNeta: r.resultados[bot.id].utilidadNeta,
                shareReal:    r.resultados[bot.id].shareReal,
                cajaFinal:    r.resultados[bot.id].cajaFinal,
              }
            : null,
        })),
        null, 2
      )
    : 'Primera ronda, sin historial previo.';

  const prompt = `
Eres el equipo competidor "${bot.nombre}" en una simulacion de negocios educativa.
Tu estrategia es: ${perfilCfg.descripcion}

INDUSTRIA: ${cfg.meta?.nombre || 'Negocios'}
RONDA ACTUAL: ${historial?.rondaActual || 1}
TU CAJA DISPONIBLE: Bs ${miResultado?.cajaFinal ?? params.cajaInicial ?? 50000}
TUS VENDEDORES: ${miResultado?.vendedoresFinales ?? params.vendedoresIniciales ?? 2}

TIPOS DE PRODUCTO disponibles: ${tipos.join(', ')}
SEGMENTOS de mercado: ${segmentos.join(', ')}
CANALES de distribucion: ${canales.join(', ')}
PRECIO MINIMO SUGERIDO (costo base mas bajo): Bs ${Math.min(...Object.values(cfg.tiposProducto || {}).map(t => t.costoBase || 0)) || 2}
PRODUCCION MAXIMA: ${params.capacidadMaxProduccion || 500} unidades

CONTEXTO DE MERCADO (ultimas 2 rondas):
${contextoMercado}

INSTRUCCION: Devuelve UNICAMENTE un objeto JSON valido, sin texto adicional, sin markdown, sin backticks.
El JSON debe tener exactamente estas claves y tipos:
{
  "producto":            "<string - uno de los tipos disponibles>",
  "segmentoObjetivo":    "<string - uno de los segmentos disponibles>",
  "canalPrincipal":      "<string - uno de los canales disponibles>",
  "canalSecundario":     "Ninguno",
  "calidad":             <numero entero 1-10>,
  "precioVenta":         <numero - mayor que el costoBase del tipo elegido>,
  "produccion":          <numero entero - entre 50 y ${params.capacidadMaxProduccion || 500}>,
  "publicidad":          <numero entero - monto en Bs>,
  "promocion":           <numero entero - monto en Bs>,
  "eventos":             <numero entero - monto en Bs>,
  "marketingRedes":      <numero entero - monto en Bs>,
  "relacionesPublicas":  <numero entero - monto en Bs>,
  "innovacion":          <boolean>,
  "tipoInnovacion":      "<Producto|Proceso|Canal>",
  "montoInnovacion":     <numero entero - 0 si innovacion es false>,
  "contratarVendedores": <numero entero 0-3>,
  "despedirVendedores":  <numero entero 0-2>,
  "tipoPrestamo":        "<Ninguno|Operativo|Inversion>",
  "montoPrestamo":       <numero entero - 0 si tipoPrestamo es Ninguno>,
  "tipoInvestigacion":   "<No|Basica|Premium>",
  "razonamiento":        "<string breve - 1-2 oraciones explicando la decision>"
}
`.trim();

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client    = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens:  600,
      messages: [{ role: 'user', content: prompt }],
    });

    const texto = response.content[0]?.text || '';
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('La respuesta no contiene JSON valido');

    const decision = JSON.parse(match[0]);

    if (!tipos.includes(decision.producto))             decision.producto         = tipos[0];
    if (!segmentos.includes(decision.segmentoObjetivo)) decision.segmentoObjetivo = segmentos[0];
    if (!canales.includes(decision.canalPrincipal))     decision.canalPrincipal   = canales[0];

    decision.calidad             = Math.min(10, Math.max(1, parseInt(decision.calidad) || 5));
    decision.produccion          = Math.min(params.capacidadMaxProduccion || 500, Math.max(50, parseInt(decision.produccion) || 200));
    decision.contratarVendedores = Math.min(5, Math.max(0, parseInt(decision.contratarVendedores) || 0));
    decision.despedirVendedores  = Math.min(5, Math.max(0, parseInt(decision.despedirVendedores)  || 0));
    decision.montoPrestamo       = decision.tipoPrestamo === 'Ninguno' ? 0 : (parseInt(decision.montoPrestamo) || 0);
    decision.montoInnovacion     = decision.innovacion ? (parseInt(decision.montoInnovacion) || 0) : 0;

    console.log(`[bot_service] Decision IA para "${bot.nombre}" (${perfil}): ${decision.razonamiento || 'OK'}`);
    return construirDecisionCompleta(bot, historial, cfg, decision);

  } catch (err) {
    console.error(`[bot_service] Error en API Anthropic para "${bot.nombre}": ${err.message}. Usando fallback.`);
    return construirDecisionCompleta(bot, historial, cfg, decisionFallback(bot, historial, cfg));
  }
}

// ── Construir objeto de decision completo compatible con el motor ──────────────
function construirDecisionCompleta(bot, historial, cfg, decisionIA) {
  const params = cfg.params || {};

  // FIX v2.1: buscar resultado anterior del bot con clave directa, expandida o escaneo.
  // Antes solo se buscaba con bot.id, pero los resultados se guardan como bot.id__prod_1.
  const buscarResultadoBot = (resultadosObj) => {
    if (!resultadosObj || typeof resultadosObj !== 'object') return null;
    return resultadosObj[bot.id]
      || resultadosObj[`${bot.id}__prod_1`]
      || Object.values(resultadosObj).find(r => r && r.equipoOriginal === bot.id)
      || null;
  };

  // historial.resultados puede ser:
  //  a) Array de objetos resultado (del historialBot.resultados construido en server.js)
  //  b) Vacio si no se encontro historial
  let ultimoResultado = null;
  if (historial?.resultados?.length) {
    const ultimo = historial.resultados[historial.resultados.length - 1];
    // Si ya es un objeto resultado directo (tiene cajaFinal), usarlo
    ultimoResultado = (ultimo && ultimo.cajaFinal !== undefined)
      ? ultimo
      : buscarResultadoBot(ultimo);
  }
  // Fallback: buscar en ultimas2Rondas si todavia no encontramos
  if (!ultimoResultado && historial?.ultimas2Rondas?.length) {
    const ultimaRonda = historial.ultimas2Rondas[historial.ultimas2Rondas.length - 1];
    ultimoResultado = buscarResultadoBot(ultimaRonda?.resultados);
  }

  const productoBase = {
    productoId:         'prod_1',
    activo:             true,
    producto:           decisionIA.producto,
    segmentoObjetivo:   decisionIA.segmentoObjetivo,
    canalPrincipal:     decisionIA.canalPrincipal,
    canalSecundario:    decisionIA.canalSecundario || 'Ninguno',
    calidad:            decisionIA.calidad,
    precioVenta:        decisionIA.precioVenta,
    produccion:         decisionIA.produccion,
    publicidad:         decisionIA.publicidad         || 0,
    promocion:          decisionIA.promocion           || 0,
    eventos:            decisionIA.eventos             || 0,
    marketingRedes:     decisionIA.marketingRedes      || 0,
    relacionesPublicas: decisionIA.relacionesPublicas  || 0,
    innovacion:         !!decisionIA.innovacion,
    tipoInnovacion:     decisionIA.tipoInnovacion      || '',
    montoInnovacion:    decisionIA.montoInnovacion     || 0,
  };

  return {
    equipo:       bot.id,
    equipoNombre: bot.nombre,
    isBot:        true,
    botPerfil:    bot.perfil,

    productos: [productoBase],
    ...productoBase,

    rrhh: {
      contratarVendedores: decisionIA.contratarVendedores || 0,
      despedirVendedores:  decisionIA.despedirVendedores  || 0,
      contratarOperarios:  0,
      despedirOperarios:   0,
      capacitacion:        0,
      productividadInicial: 1,
    },
    contratarVendedores: decisionIA.contratarVendedores || 0,
    despedirVendedores:  decisionIA.despedirVendedores  || 0,

    finanzas: {
      tipoPrestamo:  decisionIA.tipoPrestamo  || 'Ninguno',
      montoPrestamo: decisionIA.montoPrestamo || 0,
      plazoPrestamo: 2,
      amortizacion:  0,
    },
    tipoPrestamo:  decisionIA.tipoPrestamo  || 'Ninguno',
    montoPrestamo: decisionIA.montoPrestamo || 0,
    plazoPrestamo: 2,
    amortizacion:  0,

    investigacion:     { tipoInvestigacion: decisionIA.tipoInvestigacion || 'No' },
    tipoInvestigacion: decisionIA.tipoInvestigacion || 'No',

    vendedoresIniciales:        ultimoResultado?.vendedoresFinales ?? params.vendedoresIniciales ?? 2,
    cajaInicial:                ultimoResultado?.cajaFinal         ?? params.cajaInicial          ?? 50000,
    activosFijosIniciales:      ultimoResultado?.activosFijosNetos ?? params.activosFijosIniciales ?? 80000,
    cxcInicial:                 ultimoResultado?.cxcFinal          ?? params.cxcInicial            ?? 0,
    deudaInicial:               ultimoResultado?.deudaFinal        ?? params.deudaInicial          ?? 0,
    inventarioInicial:          ultimoResultado?.inventarioFinal   ?? params.inventarioInicialUnid ?? 0,
    resultadoAcumuladoAnterior: ultimoResultado?.resultadoAcumulado ?? 0,

    submitted:   true,
    submittedAt: new Date().toISOString(),

    _botRazonamiento: decisionIA.razonamiento || decisionIA._razonamiento || '',
    _botFallback:     !!decisionIA._fallback,
  };
}

module.exports = { generarDecisionBot, PERFILES_BOT };
