// bot_service.js — SimNego v3.2
// ══════════════════════════════════════════════════════════════════════════════
// Bot IA dinámico: genera un competidor por cada segmento sin equipo humano.
// Usa Claude API para decidir estrategia libre, espejando al humano del segmento.
// Los bots son efímeros: se crean en presim, compiten en simulación final,
// NO se registran como usuarios permanentes.
//
// FLUJO:
//   1. detectarSegmentosSinEquipo(decisiones, segmentos) → segmentos vacíos
//   2. generarBotsParaSegmentos(segmentosSinEquipo, cfg, decisiones)
//      → llama Claude API por cada segmento vacío
//      → devuelve array de decisiones-bot listas para el motor
//
// ENV REQUERIDA: ANTHROPIC_API_KEY
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const DEFAULTS_HOMOGENEOS_BOT = Object.freeze({
  cajaInicial: 500000,
  activosFijosIniciales: 80000,
  deudaInicial: 0,
  operariosIniciales: 1,
  vendedoresIniciales: 0,
  productividadBase: 500,
  capacidadMaxProduccion: 1500
});

// ── Nombres de empresas bolivianas para disfrazar los bots ───────────────────
const NOMBRES_EMPRESAS = [
  'Calzados Andinos S.R.L.',
  'Piel Boliviana Ltda.',
  'ZapaBolivia Comercial',
  'Industrias Foot & Style',
  'Calzatec Bolivia',
  'OrthoPies S.A.',
  'StepBol Manufacturas',
  'AltoPie Diseños',
  'Calzado Bolivariano',
  'Pasos del Oriente S.R.L.',
];

// Contador para asignar nombres únicos
let _nombreIdx = 0;
function siguienteNombreEmpresa() {
  const nombre = NOMBRES_EMPRESAS[_nombreIdx % NOMBRES_EMPRESAS.length];
  _nombreIdx++;
  return nombre;
}

// ── Detectar segmentos sin equipo humano ──────────────────────────────────────
function detectarSegmentosSinEquipo(decisiones, segmentos) {
  // Segmentos que tienen al menos un equipo humano activo
  const segmentosConEquipo = new Set(
    decisiones
      .filter(d => !d.isBot && d.segmentoObjetivo && d.producto && d.precioVenta)
      .map(d => d.segmentoObjetivo)
  );

  // Retornar segmentos sin ningún equipo humano
  return segmentos.filter(s => !segmentosConEquipo.has(s.nombre));
}

// ── Generar decisión bot via Claude API ───────────────────────────────────────
async function generarDecisionBotIA(segmento, equiposHumanosSim, cfg, rondaNum, perfil = 'medio') {
  const params   = cfg.params   || {};
  const tipos    = Object.keys(cfg.tiposProducto || {});
  const canales  = Object.keys(cfg.canales       || {});
  const afinidad = cfg.afinidadMatrix            || {};

  // Encontrar el mejor producto para este segmento según afinidad
  const segIdx = (cfg.segmentos || []).findIndex(s => s.nombre === segmento.nombre);
  let mejorProducto = tipos[0];
  let mejorAfinidad = -Infinity;
  tipos.forEach(tipo => {
    const af = afinidad[tipo]?.[segIdx] ?? 0;
    if (af > mejorAfinidad) { mejorAfinidad = af; mejorProducto = tipo; }
  });

  // Contexto de los competidores humanos en la simulación (todos los segmentos)
  const resumenHumanos = equiposHumanosSim
    .filter(d => d.producto && d.precioVenta)
    .map(d => `- ${d.equipoNombre||d.equipo}: ${d.producto} en "${d.segmentoObjetivo}", ` +
              `precio=Bs ${d.precioVenta}, calidad=${d.calidad||5}, ` +
              `pub=Bs ${(d.publicidad||0)+(d.promocion||0)+(d.eventos||0)}`)
    .join('\n');

  // Contexto del segmento
  const demFormal = segmento.demandaFormal || segmento.demandaBase || 0;
  const compExt   = cfg.competenciaExterna?.find(c => c.segmento === segmento.nombre);

  // Parámetros financieros del bot (igual que humanos)
  const cajaBot        = params.cajaInicial ?? DEFAULTS_HOMOGENEOS_BOT.cajaInicial;
  const opIniciales    = params.operariosIniciales ?? DEFAULTS_HOMOGENEOS_BOT.operariosIniciales;
  const prodBase       = params.productividadBase ?? DEFAULTS_HOMOGENEOS_BOT.productividadBase;
  const capMax         = params.capacidadMaxProduccion ?? DEFAULTS_HOMOGENEOS_BOT.capacidadMaxProduccion;
  const capEfectiva    = opIniciales * prodBase;

  const prompt = `Eres el director estratégico de una empresa de calzado boliviano compitiendo en el mercado de "${segmento.nombre}".

CONTEXTO DEL SEGMENTO:
- Demanda formal: ${Math.round(demFormal)} pares/trimestre
- Competidor externo: ${compExt ? `${compExt.nombre} (precio Bs ${compExt.precio}, calidad ${compExt.calidad}/10, participación ref ${(compExt.participacionRef*100).toFixed(0)}%)` : 'Ninguno conocido'}
- Ronda actual: ${rondaNum}

COMPETIDORES HUMANOS EN LA SIMULACIÓN (otros segmentos):
${resumenHumanos || '(Eres el único equipo por ahora)'}

PRODUCTOS DISPONIBLES: ${tipos.join(', ')}
Mejor producto para este segmento por afinidad: ${mejorProducto} (afinidad +${mejorAfinidad})

CANALES DISPONIBLES: ${canales.join(', ')}

PARÁMETROS DE COSTOS:
${tipos.map(t => `- ${t}: costoBase=Bs ${cfg.tiposProducto[t]?.costoBase || 0}`).join('\n')}
- pctMateriaPrima: ${((params.pctMateriaPrima||0.40)*100).toFixed(0)}%
- pctCostoCalidad: ${((params.pctCostoCalidad||0.08)*100).toFixed(0)}% del costoBase por punto sobre/bajo calidad 5

RESTRICCIONES FINANCIERAS:
- Caja disponible: Bs ${cajaBot.toLocaleString('es-BO')}
- Operarios iniciales: ${opIniciales} → Capacidad efectiva: ${capEfectiva} u/trim
- Capacidad máx planta: ${capMax} u/trim

PROVEEDORES MP:
- Cueros Bolivia S.A.: factorCosto=×1.10, calidad 8/10, leadTime 1 trim
- Insumos Locales Cochabamba: factorCosto=×0.90, calidad 6/10, leadTime 1 trim  
- Importado Asia vía Oruro: factorCosto=×0.75, calidad 5/10, leadTime 2 trim ⚠

NIVEL DE COMPETENCIA: ${perfil === 'bajo'
  ? 'BÁSICO — prioriza precio bajo (Bs 80-150), calidad 3-5, publicidad mínima (Bs 0-2.000). Estrategia de supervivencia.'
  : perfil === 'alto'
    ? 'PREMIUM — prioriza diferenciación: calidad 7-9, precio alto (Bs 300-600), publicidad alta (Bs 8.000-20.000). Estrategia agresiva.'
    : 'ESTÁNDAR — precio y calidad equilibrados (calidad 5-7, precio Bs 150-350, publicidad Bs 2.000-8.000). Espeja el mercado.'
}

INSTRUCCIÓN:
Adopta UNA estrategia competitiva de Porter (1980): liderazgo en costos, diferenciación o enfoque de nicho.
Elige el producto con mayor afinidad para el segmento.
El precio debe cubrir el costo unitario real (incluye transformación + MP + calidad + canal).
La producción NO puede superar la capacidad efectiva (${capEfectiva} u/trim).
Si necesitas más capacidad, contrata operarios (costo Bs ${params.costoContratacionOperario||3000}/op + sueldo Bs ${params.costoOperario||9600}/trim).

Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown:
{
  "producto": "<uno de los tipos disponibles>",
  "segmentoObjetivo": "${segmento.nombre}",
  "canalPrincipal": "<uno de los canales disponibles>",
  "canalSecundario": "Ninguno",
  "calidad": <entero 1-10>,
  "precioVenta": <número - mayor que costo unitario total>,
  "publicidad": <entero Bs>,
  "promocion": <entero Bs>,
  "eventos": <entero Bs>,
  "marketingRedes": <entero Bs>,
  "relacionesPublicas": <entero Bs>,
  "contratarOperarios": <entero 0-5>,
  "despedirOperarios": 0,
  "montoCapacitacion": 0,
  "produccion": <entero - máx ${capEfectiva + (5 * prodBase)} si contrata>,
  "cantidadMPpedida": <entero - igual o mayor a produccion>,
  "proveedorElegido": "<nombre exacto del proveedor>",
  "tipoPrestamo": "Ninguno",
  "montoPrestamo": 0,
  "plazoPrestamo": 0,
  "amortizacion": 0,
  "tipoInvestigacion": "No",
  "innovacion": false,
  "tipoInnovacion": "",
  "montoInnovacion": 0,
  "estrategia": "<costos|diferenciacion|nicho>",
  "razonamiento": "<1-2 oraciones explicando la decisión estratégica>"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic API ${response.status}`);
    const data  = await response.json();
    const texto = data.content?.[0]?.text || '';

    // Extraer JSON de la respuesta
    const match = texto.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Respuesta sin JSON');

    const dec = JSON.parse(match[0]);

    // Validaciones y clamp
    if (!tipos.includes(dec.producto))  dec.producto       = mejorProducto;
    if (!canales.includes(dec.canalPrincipal)) dec.canalPrincipal = canales[0];
    dec.segmentoObjetivo  = segmento.nombre;
    dec.calidad           = Math.min(10, Math.max(1, parseInt(dec.calidad) || 5));
    dec.contratarOperarios = Math.min(10, Math.max(0, parseInt(dec.contratarOperarios) || 0));
    const opFinales        = opIniciales + dec.contratarOperarios;
    const capEfFinal       = opFinales * prodBase;
    dec.produccion        = Math.min(capEfFinal, Math.min(capMax, Math.max(1, parseInt(dec.produccion) || Math.round(capEfFinal * 0.7))));
    dec.cantidadMPpedida  = Math.max(dec.produccion, parseInt(dec.cantidadMPpedida) || dec.produccion);

    // Validar proveedor
    const proveedoresValidos = (cfg.proveedores || []).map(p => p.nombre);
    if (proveedoresValidos.length && !proveedoresValidos.includes(dec.proveedorElegido)) {
      dec.proveedorElegido = proveedoresValidos[1] || proveedoresValidos[0]; // default Insumos Locales
    }

    // Validar precio > costo unitario mínimo
    const costoBase = cfg.tiposProducto[dec.producto]?.costoBase || 100;
    const precioMin = costoBase * 1.15;
    if (!dec.precioVenta || dec.precioVenta < precioMin) {
      dec.precioVenta = Math.round(costoBase * 1.4);
    }

    console.log(`[bot_service] ✅ IA generó bot para "${segmento.nombre}": ${dec.estrategia} | ${dec.producto} | Bs ${dec.precioVenta} | cal=${dec.calidad}`);
    console.log(`[bot_service]    Razonamiento: ${dec.razonamiento}`);
    return dec;

  } catch (err) {
    console.error(`[bot_service] ⚠ Error IA para "${segmento.nombre}": ${err.message}. Usando fallback.`);
    return decisionFallbackPorSegmento(segmento, cfg, opIniciales, prodBase, capMax, mejorProducto);
  }
}

// ── Fallback sin IA (si falla la API) ────────────────────────────────────────
function decisionFallbackPorSegmento(segmento, cfg, opIniciales, prodBase, capMax, mejorProducto) {
  const params     = cfg.params || {};
  const canales    = Object.keys(cfg.canales || {});
  const costoBase  = cfg.tiposProducto[mejorProducto]?.costoBase || 100;
  const capEf      = opIniciales * prodBase;
  const produccion = Math.min(capEf, Math.round(capEf * 0.7));

  // Estrategia equilibrada por defecto
  const precio = Math.round(costoBase * 1.45);
  const caja   = params.cajaInicial ?? DEFAULTS_HOMOGENEOS_BOT.cajaInicial;
  const mkt    = Math.round(caja * 0.10);

  return {
    producto:           mejorProducto,
    segmentoObjetivo:   segmento.nombre,
    canalPrincipal:     canales[0] || 'Tienda Propia',
    canalSecundario:    'Ninguno',
    calidad:            6,
    precioVenta:        precio,
    publicidad:         Math.round(mkt * 0.4),
    promocion:          Math.round(mkt * 0.3),
    eventos:            Math.round(mkt * 0.15),
    marketingRedes:     Math.round(mkt * 0.1),
    relacionesPublicas: Math.round(mkt * 0.05),
    contratarOperarios: 0,
    despedirOperarios:  0,
    montoCapacitacion:  0,
    produccion,
    cantidadMPpedida:   produccion,
    proveedorElegido:   cfg.proveedores?.[1]?.nombre || cfg.proveedores?.[0]?.nombre || '',
    tipoPrestamo:       'Ninguno',
    montoPrestamo:      0,
    plazoPrestamo:      0,
    amortizacion:       0,
    tipoInvestigacion:  'No',
    innovacion:         false,
    tipoInnovacion:     '',
    montoInnovacion:    0,
    estrategia:         'diferenciacion',
    razonamiento:       `Estrategia equilibrada por defecto en el segmento ${segmento.nombre}.`,
    _fallback:          true,
  };
}

// ── Construir decisión completa compatible con el motor ───────────────────────
function construirDecisionBot(botId, botNombre, decIA, params) {
  const cajaInicial = params.cajaInicial ?? DEFAULTS_HOMOGENEOS_BOT.cajaInicial;
  const activosFijosIniciales = params.activosFijosIniciales ?? DEFAULTS_HOMOGENEOS_BOT.activosFijosIniciales;
  const deudaInicial = params.deudaInicial ?? DEFAULTS_HOMOGENEOS_BOT.deudaInicial;
  const capitalInicial = params.capitalInicial ?? params.capitalContable ?? (activosFijosIniciales + cajaInicial - deudaInicial);
  const opIniciales = params.operariosIniciales ?? DEFAULTS_HOMOGENEOS_BOT.operariosIniciales;
  return {
    // Identificación
    equipo:             botId,
    equipoOriginal:     botId,
    equipoNombre:       botNombre,
    isBot:              true,
    esBot:              true,
    _botRazonamiento:   decIA.razonamiento || '',
    _botEstrategia:     decIA.estrategia   || 'diferenciacion',
    _botFallback:       !!decIA._fallback,

    // Producto (compatible con motor multiproducto)
    productos: [{
      productoId:         'prod_1',
      activo:             true,
      producto:           decIA.producto,
      segmentoObjetivo:   decIA.segmentoObjetivo,
      canalPrincipal:     decIA.canalPrincipal,
      canalSecundario:    decIA.canalSecundario || 'Ninguno',
      calidad:            decIA.calidad,
      precioVenta:        decIA.precioVenta,
      produccion:         decIA.produccion,
      publicidad:         decIA.publicidad         || 0,
      promocion:          decIA.promocion           || 0,
      eventos:            decIA.eventos             || 0,
      marketingRedes:     decIA.marketingRedes      || 0,
      relacionesPublicas: decIA.relacionesPublicas  || 0,
      innovacion:         false,
      tipoInnovacion:     '',
      montoInnovacion:    0,
      cantidadMPpedida:   decIA.cantidadMPpedida    || decIA.produccion || 0,
      proveedorElegido:   decIA.proveedorElegido     || '',
    }],

    // Campos raíz (compatibilidad con motor monoproducto)
    producto:           decIA.producto,
    segmentoObjetivo:   decIA.segmentoObjetivo,
    canalPrincipal:     decIA.canalPrincipal,
    canalSecundario:    decIA.canalSecundario || 'Ninguno',
    calidad:            decIA.calidad,
    precioVenta:        decIA.precioVenta,
    produccion:         decIA.produccion,
    publicidad:         decIA.publicidad         || 0,
    promocion:          decIA.promocion           || 0,
    eventos:            decIA.eventos             || 0,
    marketingRedes:     decIA.marketingRedes      || 0,
    relacionesPublicas: decIA.relacionesPublicas  || 0,
    cantidadMPpedida:   decIA.cantidadMPpedida    || decIA.produccion || 0,
    proveedorElegido:   decIA.proveedorElegido     || '',

    // RRHH
    vendedoresIniciales:  params.vendedoresIniciales  ?? DEFAULTS_HOMOGENEOS_BOT.vendedoresIniciales,
    contratarVendedores:  0,
    despedirVendedores:   0,
    operariosIniciales:   opIniciales,
    contratarOperarios:   decIA.contratarOperarios || 0,
    despedirOperarios:    0,
    montoCapacitacion:    0,

    // Financiamiento
    tipoPrestamo:   'Ninguno',
    montoPrestamo:  0,
    plazoPrestamo:  0,
    amortizacion:   0,

    // Investigación
    tipoInvestigacion: 'No',
    innovacion:         false,
    tipoInnovacion:     '',
    montoInnovacion:    0,

    // Estado financiero inicial (mismos que humanos R1)
    cajaInicial,
    capitalInicial,
    activosFijosIniciales,
    activosFijosBrutos:         params.activosFijosBrutos,
    cxcInicial:                 params.cxcInicial               ?? 0,
    deudaInicial,
    inventarioInicial:          params.inventarioInicialUnid    ?? 0,
    capacidadMaxProduccion:     params.capacidadMaxProduccion   ?? DEFAULTS_HOMOGENEOS_BOT.capacidadMaxProduccion,
    resultadoAcumuladoAnterior: 0,
    brandEquityInicial:         50,

    submitted:    true,
    submittedAt:  new Date().toISOString(),
  };
}

// ── Función principal exportada ───────────────────────────────────────────────
/**
 * Genera 1 bot por CADA segmento — con o sin equipo humano.
 * Segmentos con humano: bot compite directamente contra él.
 * Segmentos sin humano: bot ocupa el segmento solo.
 *
 * @param {Array}  decisionesHumanas - Decisiones de equipos humanos ya guardadas
 * @param {Object} cfg               - { params, tiposProducto, canales, segmentos, afinidadMatrix, competenciaExterna, proveedores }
 * @param {number} rondaNum          - Número de ronda actual
 * @returns {Array} Array de decisiones-bot listas para el motor
 */
async function generarBotsParaSegmentos(decisionesHumanas, cfg, rondaNum) {
  const segmentos = cfg.segmentos || [];

  if (!segmentos.length) {
    console.log('[bot_service] Sin segmentos definidos — no se generan bots.');
    return [];
  }

  // Aplanar decisiones de empresa a nivel producto — un equipo multiproducto
  // debe contar como "equipo humano" en CADA segmento donde tiene un producto
  // activo, no solo en el segmento reflejado en la raíz (compatibilidad prod_1).
  const decisionesAplanadas = (decisionesHumanas || []).flatMap(d => {
    if (Array.isArray(d.productos) && d.productos.length) {
      return d.productos
        .filter(p => p.activo !== false)
        .map(p => ({
          isBot: d.isBot,
          segmentoObjetivo: p.segmentoObjetivo,
          producto: p.producto,
          precioVenta: p.precioVenta,
        }));
    }
    return [d]; // formato legado monoproducto, ya plano
  });

  // Política de cobertura de bots (configurable por el profesor, sim.config):
  //   botsEnTodoSegmento=true  → un bot en CADA segmento (presión competitiva permanente,
  //                              incluso donde ya hay equipo humano)
  //   botsEnTodoSegmento=false → solo segmentos sin equipo humano (comportamiento 9a9ba64, default)
  const botsEnTodoSegmento = cfg.botsEnTodoSegmento === true;
  const segmentosACubir = botsEnTodoSegmento
    ? segmentos
    : detectarSegmentosSinEquipo(decisionesAplanadas, segmentos);

  if (!segmentosACubir.length) {
    console.log('[bot_service] Sin segmentos que cubrir — no se generan bots.');
    return [];
  }

  // Resetear contador de nombres para consistencia por ronda
  _nombreIdx = (rondaNum - 1) * segmentosACubir.length % NOMBRES_EMPRESAS.length;

  console.log(`[bot_service] Generando 1 bot para cada uno de los ${segmentosACubir.length} segmento(s) ${botsEnTodoSegmento ? '(cobertura TOTAL, incluye segmentos con equipo humano)' : 'sin cobertura humana'} (R${rondaNum})...`);

  // Generar 1 bot por segmento sin cobertura, en paralelo
  const bots = await Promise.all(
    segmentosACubir.map(async (segmento) => {
      const empresa = siguienteNombreEmpresa();
      // ID interno limpio — no expone nombre del segmento
      const botId   = `bot_${empresa.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20)}_r${rondaNum}`;

      const decIA = await generarDecisionBotIA(
        segmento,
        decisionesHumanas,
        cfg,
        rondaNum,
        cfg.nivelCompetidoresIA || 'medio'
      );

      return construirDecisionBot(botId, empresa, decIA, cfg.params || {});
    })
  );

  console.log(`[bot_service] ✅ ${bots.length} bot(s) generados para R${rondaNum}: ${bots.map(b => b.equipoNombre).join(', ')}`);
  return bots;
}

// ── Mantener compatibilidad con código legacy de server.js ───────────────────
// El server.js existente llama a generarDecisionBot(bot, historial, cfg)
// para bots pre-registrados. Mantenemos esa función pero también
// exportamos la nueva generarBotsParaSegmentos.
async function generarDecisionBot(bot, historial, cfg) {
  const segmentos    = cfg.segmentos || [];
  const segmento     = segmentos.find(s => s.nombre === bot.segmentoObjetivo)
                    || segmentos[0];
  const decIA = await generarDecisionBotIA(segmento, [], cfg, historial?.rondaActual || 1);
  return construirDecisionBot(bot.id, bot.nombre, decIA, cfg.params || {});
}

module.exports = {
  generarDecisionBot,          // compatibilidad legacy
  generarBotsParaSegmentos,    // nueva función principal
  detectarSegmentosSinEquipo,  // exportada para tests
  PERFILES_BOT: {
    bajo:  { nombre: 'Competidor Básico',   descripcion: 'Precio bajo, calidad mínima. Estrategia de supervivencia.' },
    medio: { nombre: 'Competidor Estándar', descripcion: 'Precio y calidad equilibrados. Espeja el mercado.' },
    alto:  { nombre: 'Competidor Premium',  descripcion: 'Alta calidad y precio premium. Estrategia agresiva.' },
  },
};
