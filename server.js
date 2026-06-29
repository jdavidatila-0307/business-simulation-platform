/**
 * SIMULADOR DE MARKETING v3.0 — Multi-Simulación
 * Con persistencia PostgreSQL y soporte para múltiples profesores.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// FORZAR ACEPTACIÓN DE CERTIFICADOS SSL AUTOFIRMADOS (solo para este entorno)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { hashPassword, verifyPassword } = require('./src/auth');

const { cargarPlantilla, listarPlantillas, inicializarPlantillaDefault } = require('./src/plantillas');
const { generarDecisionBot, generarBotsParaSegmentos, PERFILES_BOT } = require('./src/bot_service');
const { initWebSocket, broadcast, clientesConectados } = require('./src/ws_service');

inicializarPlantillaDefault();


const storage  = require('./src/storage');
const { ejecutarSimulador, propagarEstado, calcularMercadoSegmentos, calcularPreSimulacion } = require('./src/engine');
const { generarReportes } = require('./src/reports');
const { leerModoInicio, hidratarEstadoInicialR1 } = require('./src/initializer');   // lectura centralizada de inicio Fase 0

// Mínimo operativo por nivel de planta en Fase 0. La validación se replica en
// servidor para impedir que una petición directa persista o envíe un valor inválido.
const FASE0_MIN_OPERARIOS_POR_NIVEL = Object.freeze({ 1: 2, 2: 3, 3: 3, 4: 5, 5: 6, 6: 7 });
function validarOperariosMinimosFase0(nivel, operarios) {
  const minimo = FASE0_MIN_OPERARIOS_POR_NIVEL[Number(nivel)];
  if (!minimo) return null;
  if (!Number.isFinite(Number(operarios)) || Number(operarios) < minimo) {
    return 'El nivel de planta seleccionado requiere al menos ' + minimo
      + ' operarios iniciales. Ajuste el número de operarios antes de enviar Fase 0.';
  }
  return null;
}

function obtenerEstadoFase0(config) {
  if (config?.fase0Estado) return config.fase0Estado;
  return config?.fase0Activa === true ? 'activa' : 'no_activada';
}

function decisionDeEquipo(decisiones, equipoId) {
  const mapa = decisiones || {};
  return mapa[equipoId] || mapa[Object.keys(mapa).find(k => k.startsWith(equipoId + '__'))] || null;
}

function equiposPendientesDecision(equipos, decisiones) {
  return equipos.filter(eq => eq.rol === 'equipo' && !eq.isBot)
    .filter(eq => !decisionDeEquipo(decisiones, eq.id)?.submitted);
}

// FASE 1A — gastos fijos de Fase 0 obligatorios por equipo.
// Devuelve los NOMBRES de equipos a los que les falta alguno de los 3 campos.
// Un 0 EXPLÍCITO es válido; solo NULL/undefined/ausente bloquea.
function faltanGastosFijosFase0(humanos, regPorEquipo) {
  return humanos.filter(eq => {
    const r = regPorEquipo[eq.id];
    return !r
      || r.gasto_admin_fijo_fase0 == null
      || r.gasto_fijo_planta_fase0 == null
      || r.sueldos_administrativos_fijos_fase0 == null;
  }).map(eq => eq.nombre);
}

function validarDecisionEstudiante(decision) {
  const productos = Array.isArray(decision?.productos) && decision.productos.length
    ? decision.productos.filter(p => p.activo !== false)
    : [decision || {}];
  if (!productos.length) return 'Debes incluir al menos un producto activo';
  const operarios = Number(decision?.operariosIniciales ?? productos[0]?.operariosIniciales);
  if (!Number.isFinite(operarios) || operarios <= 0) return 'Operarios iniciales debe ser mayor a 0';
  for (let i = 0; i < productos.length; i++) {
    const p = productos[i];
    const prefijo = productos.length > 1 ? 'Producto ' + (i + 1) + ': ' : '';
    if (!String(p.producto || '').trim()) return prefijo + 'debes seleccionar un producto';
    if (!String(p.segmentoObjetivo || '').trim()) return prefijo + 'debes seleccionar un segmento objetivo';
    if (!String(p.canalPrincipal || '').trim()) return prefijo + 'debes seleccionar un canal principal';
    if (!(Number(p.precioVenta) > 0)) return prefijo + 'precio de venta debe ser mayor a 0';
    if (!(Number(p.produccion) > 0)) return prefijo + 'producción debe ser mayor a 0';
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
//  SHOCKS ALEATORIOS DE MERCADO
//  Catálogo de eventos externos que afectan la demanda por ronda.
//  probabilidadShock configurable en parametros admin (default 0.35)
// ════════════════════════════════════════════════════════════════
const SHOCKS_CATALOGO = [
  // ── Booms (mercado favorable) ────────────────────────────────
  { id:'boom_macro',   tipo:'boom',   icono:'📈', color:'#10B981',
    descripcion:'Crecimiento económico regional impulsa el consumo familiar',
    factorDemanda: 1.18, segmentosAfectados:'todos' },
  { id:'boom_feria',   tipo:'boom',   icono:'🏪', color:'#10B981',
    descripcion:'Feria comercial internacional amplía la demanda del mercado',
    factorDemanda: 1.12, segmentosAfectados:'todos' },
  { id:'boom_tend',    tipo:'boom',   icono:'🚀', color:'#10B981',
    descripcion:'Tendencia viral en redes sociales impulsa demanda en segmentos jóvenes',
    factorDemanda: 1.25, segmentosAfectados:'todos' },
  { id:'boom_export',  tipo:'boom',   icono:'🌍', color:'#10B981',
    descripcion:'Acuerdo comercial regional abre nuevos canales de distribución',
    factorDemanda: 1.15, segmentosAfectados:'todos' },
  // ── Crisis (mercado adverso) ─────────────────────────────────
  { id:'crisis_rec',   tipo:'crisis', icono:'📉', color:'#EF4444',
    descripcion:'Recesión económica contrae el gasto de los hogares',
    factorDemanda: 0.82, segmentosAfectados:'todos' },
  { id:'crisis_imp',   tipo:'crisis', icono:'⚠️',  color:'#EF4444',
    descripcion:'Incremento de importaciones ilegales desplaza demanda formal',
    factorDemanda: 0.87, segmentosAfectados:'todos' },
  { id:'crisis_reg',   tipo:'crisis', icono:'🏛️', color:'#EF4444',
    descripcion:'Nueva regulación sectorial restringe el volumen de compras',
    factorDemanda: 0.88, segmentosAfectados:'todos' },
  { id:'crisis_inf',   tipo:'crisis', icono:'💸', color:'#EF4444',
    descripcion:'Inflación aguda contrae el poder adquisitivo en segmentos premium',
    factorDemanda: 0.80, segmentosAfectados:'todos' },
];

/**
 * Genera un shock determinista para la ronda indicada.
 * Usa LCG seeded con simId+ronda → mismo resultado si se re-simula.
 * @param {string} simId
 * @param {number} rondaNumero
 * @param {number} probabilidad  0-1, default 0.35
 * @returns {Object} shock
 */

// ════════════════════════════════════════════════════════════════
//  CATÁLOGO DE NOTICIAS DEL MACROENTORNO
//  Cada shock tiene: senales[] (antes de decidir) y noticia (después)
//  Las señales son AMBIGUAS — no revelan magnitud ni certeza del evento
// ════════════════════════════════════════════════════════════════
const NOTICIAS_CATALOGO = {
  boom_macro: {
    senales: [
      { icono:'📊', fuente:'Banco Central de Bolivia', fecha:'hace 3 días',
        titulo:'Indicadores económicos superan expectativas del trimestre',
        cuerpo:'El Banco Central registra crecimiento del PIB por encima de lo proyectado. Analistas señalan que la expansión podría trasladarse al consumo de bienes no esenciales en los próximos meses. El impacto sectorial aún no es uniforme.' },
      { icono:'🏠', fuente:'INE Bolivia', fecha:'hace 5 días',
        titulo:'Índice de confianza del consumidor alcanza nivel más alto en seis trimestres',
        cuerpo:'La encuesta de hogares muestra mayor disposición al gasto en familias bolivianas. El ingreso disponible per cápita creció en la región oriental, aunque los especialistas advierten que no todos los sectores se beneficiarán por igual.' }
    ],
    noticia: { icono:'📈', fuente:'Cámara de Industria — Santa Cruz', fecha:'Trimestre actual',
      titulo:'Expansión económica confirmó aumento del 18% en demanda del sector calzado',
      cuerpo:'El crecimiento del PIB regional se tradujo en un incremento significativo de la demanda formal en todos los segmentos. Las empresas con inventario suficiente capitalizaron plenamente la expansión. La demanda aumentó un 18% respecto a las proyecciones base.' }
  },
  boom_feria: {
    senales: [
      { icono:'🏪', fuente:'Fexpocruz', fecha:'hace 1 semana',
        titulo:'Feria internacional anuncia participación récord de compradores regionales',
        cuerpo:'La organización reporta un incremento del 30% en compradores registrados. El sector calzado figura entre los rubros con mayor número de expositores y reuniones de negocios programadas. Los volúmenes finales dependerán de la capacidad de entrega de cada empresa.' },
      { icono:'🤝', fuente:'Cámara de Comercio Bolivia', fecha:'hace 4 días',
        titulo:'Distribuidores regionales anticipan dinamismo comercial para el período',
        cuerpo:'Representantes del sector se reunieron con importadores de Argentina, Perú y Chile. Los acuerdos preliminares sugieren un incremento en pedidos, aunque los empresarios esperan confirmaciones formales antes de ajustar sus proyecciones de producción.' }
    ],
    noticia: { icono:'🏪', fuente:'Informe de Mercado SimNego', fecha:'Trimestre actual',
      titulo:'Feria comercial amplió la demanda un 12% en todos los segmentos del sector',
      cuerpo:'El evento internacional dinamizó los canales de distribución. Los distribuidores regionales incrementaron sus pedidos de manera uniforme en todos los segmentos. Las empresas con red de vendedores consolidada capitalizaron mejor los nuevos contactos comerciales generados.' }
  },
  boom_tend: {
    senales: [
      { icono:'📱', fuente:'Agencia Digital Bolivia', fecha:'hace 2 días',
        titulo:'Tendencia de calzado urbano se viraliza en plataformas de redes sociales',
        cuerpo:'Influencers con alta audiencia comenzaron a compartir contenido sobre calzado urbano y deportivo. Las búsquedas en plataformas de e-commerce aumentaron significativamente. Aún es pronto para dimensionar el alcance del fenómeno en el mercado.' },
      { icono:'🚀', fuente:'Observatorio de Consumo Joven', fecha:'hace 3 días',
        titulo:'Consumo de calzado de moda muestra aceleración en zonas urbanas',
        cuerpo:'Encuestas rápidas en centros comerciales de Santa Cruz revelan mayor frecuencia de compra entre los consumidores. La influencia digital aparece como principal detonante, aunque su alcance final sobre el mercado todavía es incierto.' }
    ],
    noticia: { icono:'🚀', fuente:'Informe de Mercado SimNego', fecha:'Trimestre actual',
      titulo:'Tendencia viral disparó la demanda un 25% en todos los segmentos',
      cuerpo:'El fenómeno en redes sociales se materializó en demanda extraordinaria en todos los segmentos del mercado de calzado. Empresas con fuerte presencia en jóvenes urbanos lograron capturas superiores al promedio, pero el impulso se extendió a toda la industria.' }
  },
  boom_export: {
    senales: [
      { icono:'🌍', fuente:'Ministerio de Desarrollo Productivo', fecha:'hace 1 semana',
        titulo:'Bolivia avanza en acuerdo de complementación comercial con países de la región',
        cuerpo:'Las negociaciones con contrapartes regionales entraron en fase final. De concretarse, el acuerdo reduciría barreras para manufactureros nacionales. Se espera un anuncio formal próximamente, aunque el impacto sectorial dependerá de los términos definitivos.' },
      { icono:'📦', fuente:'Cámara de Exportadores de Santa Cruz', fecha:'hace 5 días',
        titulo:'Distribuidores del cono sur amplían búsqueda de proveedores nacionales de calzado',
        cuerpo:'Importadores de Argentina y Chile contactaron empresas manufactureras bolivianas. El interés coincide con tensiones de abastecimiento en sus mercados locales, abriendo oportunidad para empresas con capacidad de producción disponible este trimestre.' }
    ],
    noticia: { icono:'🌍', fuente:'Informe de Mercado SimNego', fecha:'Trimestre actual',
      titulo:'Acuerdo comercial regional expandió canales: demanda sube un 15% en todos los segmentos',
      cuerpo:'La firma del acuerdo abrió nuevos circuitos de distribución formal, incrementando la demanda accesible en todos los segmentos. Los beneficios se distribuyeron de manera uniforme. Las empresas con mayor capacidad de entrega capturaron proporcionalmente mayor cuota de mercado.' }
  },
  crisis_rec: {
    senales: [
      { icono:'📉', fuente:'CEPAL Bolivia', fecha:'hace 4 días',
        titulo:'Organismos internacionales revisan a la baja el crecimiento económico regional',
        cuerpo:'El FMI y la CEPAL ajustaron sus proyecciones para la región andina. Los analistas advierten que la desaceleración podría afectar el consumo de bienes no esenciales. El impacto sectorial dependerá del segmento y nivel de precio de cada empresa.' },
      { icono:'🏠', fuente:'INE Bolivia', fecha:'hace 1 semana',
        titulo:'Hogares reducen gasto discrecional ante perspectivas de incertidumbre económica',
        cuerpo:'La encuesta de presupuestos familiares muestra postergación de compras de calzado y vestimenta. El efecto es más pronunciado en familias de ingreso medio. Los analistas no coinciden sobre la duración ni la profundidad del ajuste esperado.' }
    ],
    noticia: { icono:'📉', fuente:'Informe de Mercado SimNego', fecha:'Trimestre actual',
      titulo:'Recesión económica contrajo la demanda un 18% en todos los segmentos del mercado',
      cuerpo:'La desaceleración se tradujo en caída uniforme de la demanda formal en todos los segmentos. Las empresas con menor estructura de costos fijos absorbieron mejor el impacto. Los equipos que habían sobreproducido enfrentan acumulación de inventario y presión sobre la caja disponible.' }
  },
  crisis_imp: {
    senales: [
      { icono:'⚠️', fuente:'Aduana Nacional Bolivia', fecha:'hace 3 días',
        titulo:'Aduana reporta incremento de decomisos de calzado en fronteras norte y oeste',
        cuerpo:'Las autoridades registraron aumento en el ingreso no arancelado de calzado proveniente de Perú y China. Los fabricantes expresan preocupación por competencia desleal. El fenómeno afecta principalmente puntos de venta minoristas compartidos con productos sin arancel.' },
      { icono:'🏭', fuente:'FEDECOBOL', fecha:'hace 5 días',
        titulo:'Asociación de fabricantes alerta sobre presión de importaciones informales en el mercado',
        cuerpo:'La Federación de Empresas de Cuero y Calzado emitió un comunicado señalando que el contrabando desplaza parte de la demanda formal. El impacto varía por segmento: los productos diferenciados resisten mejor la presión del mercado informal.' }
    ],
    noticia: { icono:'⚠️', fuente:'Informe de Mercado SimNego', fecha:'Trimestre actual',
      titulo:'Contrabando desplazó demanda formal: caída del 13% en todos los segmentos',
      cuerpo:'El incremento de importaciones ilegales comprimió el mercado formal de manera uniforme. Distribuidores reportaron mayor presión de precio en puntos de venta compartidos con productos informales. Las empresas con canales exclusivos o especializados resistieron mejor la competencia desleal.' }
  },
  crisis_reg: {
    senales: [
      { icono:'🏛️', fuente:'Gaceta Oficial Bolivia', fecha:'hace 1 semana',
        titulo:'Gobierno anuncia revisión de normativas de comercialización para el sector manufacturero',
        cuerpo:'El Ministerio de Producción informó que se encuentra en revisión el reglamento de comercialización de bienes de consumo no alimentario. Las nuevas disposiciones incluirían requisitos de certificación. La fecha de vigencia y el alcance exacto aún no han sido confirmados oficialmente.' },
      { icono:'📋', fuente:'Cámara de Industria', fecha:'hace 4 días',
        titulo:'Empresas del sector en reuniones de emergencia por posibles cambios regulatorios',
        cuerpo:'Directivos se reunieron con representantes del ministerio para evaluar el impacto de las nuevas normativas. Los empresarios piden un período de transición adecuado. La incertidumbre genera cautela en los pedidos de distribuidores para el período actual.' }
    ],
    noticia: { icono:'🏛️', fuente:'Informe de Mercado SimNego', fecha:'Trimestre actual',
      titulo:'Nueva regulación restringió operaciones comerciales: demanda formal cae un 12%',
      cuerpo:'La implementación de nuevos requisitos de comercialización generó fricciones en canales de distribución y postergó decisiones de compra. El impacto fue uniforme en todos los segmentos. Las empresas con documentación y certificaciones actualizadas tuvieron menor disrupción operativa.' }
  },
  crisis_inf: {
    senales: [
      { icono:'💸', fuente:'INE Bolivia', fecha:'hace 3 días',
        titulo:'Inflación acumulada presiona el poder adquisitivo de los hogares',
        cuerpo:'El IPC acumulado supera las proyecciones iniciales del BCB. El efecto se percibe en el consumo de bienes no esenciales. Analistas advierten que los hogares están postergando compras de calzado en distintos rangos de precio.' },
      { icono:'📊', fuente:'Consultora Datum Bolivia', fecha:'hace 1 semana',
        titulo:'Ventas de calzado caen por tercer mes consecutivo en zonas urbanas',
        cuerpo:'Un estudio en puntos comerciales de Santa Cruz y La Paz muestra caídas de volumen en el sector calzado. El entorno inflacionario presiona la rotación en los distintos puntos de venta.' }
    ],
    noticia: { icono:'💸', fuente:'Informe de Mercado SimNego', fecha:'Trimestre actual',
      titulo:'Inflación erosionó el mercado: caída del 20% en todos los segmentos',
      cuerpo:'La presión inflacionaria afectó la capacidad de compra en todos los segmentos. Los segmentos especializados y de mayor valor sufrieron mayor impacto relativo. Las empresas debieron absorber la contracción con mayor inventario y menor rotación de caja.' }
  },
  neutral: {
    senales: [
      { icono:'⚖️', fuente:'Cámara de Comercio Bolivia', fecha:'hace 2 días',
        titulo:'Mercado de calzado muestra estabilidad en indicadores del período',
        cuerpo:'Los índices de actividad comercial del sector se mantienen dentro de los rangos esperados. No se registran disrupciones significativas en cadenas de abastecimiento ni variaciones extraordinarias en la demanda de los principales segmentos del mercado nacional.' },
      { icono:'📋', fuente:'INE Bolivia', fecha:'hace 4 días',
        titulo:'Confianza empresarial en niveles moderados: sin señales de aceleración ni contracción',
        cuerpo:'La encuesta de clima empresarial no muestra señales pronunciadas en ninguna dirección. Los empresarios del sector manufacturero reportan condiciones operativas normales y expectativas de demanda alineadas con el promedio histórico del sector.' }
    ],
    noticia: { icono:'⚖️', fuente:'Informe de Mercado SimNego', fecha:'Trimestre actual',
      titulo:'Mercado estable: demanda dentro de proyecciones base, sin eventos externos este trimestre',
      cuerpo:'El período transcurrió sin eventos macroeconómicos disruptivos. La demanda formal se comportó conforme a las proyecciones de crecimiento de cada segmento. Los resultados diferenciales entre empresas responden exclusivamente a decisiones estratégicas y calidad de ejecución operativa.' }
  }
};

function generarShock(simId, rondaNumero, probabilidad = 0.35, params = null) {
  // Semilla determinista: simId hash + número de ronda
  let seed = simId.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0x7fffffff, 1)
             + rondaNumero * 97;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  rand(); rand(); // warm-up

  const pctBoom   = params?.shockPctBoom   ?? null;
  const pctCrisis = params?.shockPctCrisis ?? null;

  if (pctBoom !== null && pctCrisis !== null) {
    const pctNeutral = Math.max(0, 1 - pctBoom - pctCrisis);
    const r = rand();
    if (r < pctNeutral) {
      return { id:'neutral', tipo:'neutral', icono:'⚖️', color:'#6B7280',
               descripcion:'Mercado estable — sin eventos externos esta ronda',
               factorDemanda:1.00, segmentosAfectados:'todos' };
    }
    const booms  = SHOCKS_CATALOGO.filter(s => s.tipo === 'boom');
    const crisis = SHOCKS_CATALOGO.filter(s => s.tipo === 'crisis');
    let shockBase;
    if (r < pctNeutral + pctBoom) {
      shockBase = booms[Math.floor(rand() * booms.length)];
    } else {
      shockBase = crisis[Math.floor(rand() * crisis.length)];
    }
    const factorOverride = params?.shockFactores?.[shockBase.id];
    return factorOverride !== undefined
      ? { ...shockBase, factorDemanda: factorOverride }
      : shockBase;
  }

  if (rand() > probabilidad) {
    return { id:'neutral', tipo:'neutral', icono:'⚖️', color:'#6B7280',
             descripcion:'Mercado estable — sin eventos externos esta ronda',
             factorDemanda:1.00, segmentosAfectados:'todos' };
  }
  const shocks = SHOCKS_CATALOGO;
  return shocks[Math.floor(rand() * shocks.length)];
}

const PORT = process.env.PORT || 3000;
console.log('[server] DATABASE_URL definida?', process.env.DATABASE_URL ? 'Sí' : 'No');
const PUB_DIR = path.join(__dirname, 'public');

// ── Static MIME ───────────────────────────────────────────────
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.png':'image/png', '.ico':'image/x-icon',
};

// ── Session store PostgreSQL ──────────────────────────────────
const {
  createSession,
  getSession: getSessionFromDB,
  destroySession,
  cleanupExpiredSessions,
  updateSessionSimulation
} = require('./src/session.pg');

setInterval(() => {
  cleanupExpiredSessions().catch(err =>
    console.error('[sessions] cleanup error:', err.message)
  );
}, 60 * 60 * 1000);

// ── Helpers ───────────────────────────────────────────────────
function readBody(req) {
  return new Promise((res,rej) => {
    let b = '';
    let size = 0;
    const MAX = 5 * 1024 * 1024; // 5MB — suficiente para 5 productos con justificaciones
    req.on('data', c => {
      size += c.length;
      if (size > MAX) {
        req.destroy();
        return rej(new Error('Payload demasiado grande (máx 5MB)'));
      }
      b += c;
    });
    req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch { res({}); } });
    req.on('error', rej);
  });
}

function send(res, status, data) {
  if (res.headersSent) {
    console.error(`⚠️ Intento de enviar respuesta ${status} después de que ya se enviaron los headers. Petición ignorada. URL: ${res.req?.url}`);
    return;
  }
  res.writeHead(status, { 'Content-Type':'application/json' });
  res.end(JSON.stringify(data));
}

// ── Middleware de sesión ─────────────────────────────────────
async function getSession(req) {
  const raw = req.headers.cookie || '';
  const sid = raw.split(';').map(c => c.trim()).find(c => c.startsWith('sid='));
  const token = sid ? sid.split('=')[1] : null;
  return token ? await getSessionFromDB(token) : null;
}

function getSessionToken(req) {
  const raw = req.headers.cookie || '';
  const sid = raw.split(';').map(c => c.trim()).find(c => c.startsWith('sid='));
  return sid ? sid.split('=')[1] : null;
}

// P2 FIX: resolución robusta de nombre de equipo considerando IDs expandidos
function resolveNombre(r, eqMap) {
  return eqMap[r.equipoOriginal] ?? eqMap[r.equipo]
      ?? r.equipoNombre ?? r.equipoOriginal ?? r.equipo ?? '—';
}

// ── Función auxiliar para obtener la simulación actual ────────
async function getCurrentSimulation(session) {
  if (!session || !session.simulacionId) return null;

  // Los EQUIPOS no están en la tabla 'usuarios' — están en simulaciones.users JSONB.
  // Para equipos: obtener la simulación directamente por ID (ya tienen simulacionId en sesión).
  if (session.rol === 'equipo') {
    const sim = await storage.getSimulacion(session.simulacionId);
    return sim || null;
  }

  // Para admin / superadmin / profesor: verificar usuario + permisos de ownership
  const user = await storage.findUserById(session.userId);
  if (!user) return null;
  const ownerId = (user.rol === 'superadmin') ? null : session.userId;
  const sim = await storage.getSimulacion(session.simulacionId, ownerId);
  if (!sim) { session.simulacionId = null; return null; }
  return sim;
}

// ── Ruta principal ─────────────────────────────────────────────
async function route(req, res, body) {
  const url    = req.url.split('?')[0];
  const method = req.method;
  const session = await getSession(req);
  const s = session || null;

  const isAdmin = () => s?.rol === 'superadmin' || s?.rol === 'profesor';
  const isSuperAdmin = () => s?.rol === 'superadmin';
  const isEquipo = () => s?.rol === 'equipo';
  const needAdmin = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    if (!isAdmin()) { send(res, 403, { error: 'Acceso denegado' }); return true; }
    return false;
  };
  const needSuperAdmin = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    if (!isSuperAdmin()) { send(res, 403, { error: 'Acceso solo para superadmin' }); return true; }
    return false;
  };
  const needEquipo = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    if (!isEquipo()) { send(res, 403, { error: 'Solo para equipos' }); return true; }
    return false;
  };
  const needAuth = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    return false;
  };

  // ═══ AUTH ════════════════════════════════════════════════════
  if (url === '/auth/login' && method === 'POST') {
    const { id, password, codigoSimulacion } = body;
    if (!id || !password) return send(res, 400, { error: 'Credenciales requeridas' });
    const identifier = id.trim();
    console.log(`[LOGIN] intento | identifier: "${identifier}"`);

    // ── 1. Buscar en tabla 'usuarios' (superadmin, profesor) ──────
    let user = await storage.findUserByEmailOrId(identifier);
    let sessionSimulacionId = null;

    // ── 2. Si no encontrado, buscar equipo por nombre en simulaciones ──
    if (!user) {
      const found = await storage.findEquipoByNombre(identifier);
      if (found) {
        // ── Opción A: validar código del simulador para equipos ──
        const codigoRequerido = found.sim?.codigo_acceso;
        if (codigoRequerido) {
          const codigoIngresado = (codigoSimulacion || '').trim().toUpperCase();
          if (!codigoIngresado) {
            return send(res, 401, { error: 'Se requiere el código del simulador para ingresar como equipo' });
          }
          if (codigoIngresado !== codigoRequerido.trim().toUpperCase()) {
            console.log(`[LOGIN] código incorrecto | equipo: ${identifier} | ingresado: ${codigoIngresado} | requerido: ${codigoRequerido}`);
            return send(res, 401, { error: 'Código del simulador incorrecto' });
          }
        }
        user = {
          id:            found.equipo.id,
          nombre:        found.equipo.nombre,
          rol:           'equipo',
          password_hash: found.equipo.password || found.equipo.password_hash,
        };
        sessionSimulacionId = found.simulacionId;
        console.log(`[LOGIN] equipo encontrado | id: ${user.id} | sim: ${sessionSimulacionId}`);
      }
    }

    if (!user) {
      console.log(`[LOGIN] 401 — no encontrado: "${identifier}"`);
      return send(res, 401, { error: 'Usuario o contraseña incorrectos' });
    }

    console.log(`[LOGIN] usuario encontrado | id: ${user.id} | rol: ${user.rol}`);

    if (!user.password_hash) {
      console.error(`[LOGIN] ERROR — password_hash NULL para ${user.id}`);
      return send(res, 500, { error: 'Error de configuración de cuenta. Contacta al administrador.' });
    }

    let ok = false;
    try {
      ok = verifyPassword(password, user.password_hash);
    } catch(e) {
      console.error(`[LOGIN] ERROR en verifyPassword | ${user.id} | ${e.message}`);
      return send(res, 500, { error: 'Error interno de verificación. Contacta al administrador.' });
    }

    if (!ok) {
      console.log(`[LOGIN] 401 — contraseña incorrecta | ${user.id}`);
      return send(res, 401, { error: 'Usuario o contraseña incorrectos' });
    }

    const token = await createSession(user.id, user.rol, sessionSimulacionId);
    
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax`);
    console.log(`[LOGIN] éxito | id: ${user.id} | rol: ${user.rol}`);
    return send(res, 200, { ok: true, rol: user.rol, id: user.id, nombre: user.nombre });
  }

  if (url === '/auth/logout' && method === 'POST') {
    const token = getSessionToken(req);
    if (token) await destroySession(token);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  if (url === '/auth/registro' && method === 'POST') {
    const { nombreEquipo, miembros, password, codigoSimulacion } = body;
    if (!nombreEquipo?.trim()) return send(res, 400, { error: 'Nombre del equipo requerido' });
    if (!password || password.length < 4) return send(res, 400, { error: 'Contraseña de al menos 4 caracteres' });
    if (!Array.isArray(miembros) || !miembros.length) return send(res, 400, { error: 'Al menos un integrante' });
    if (!codigoSimulacion?.trim()) return send(res, 400, { error: 'Código de simulación requerido' });
    const codigo = codigoSimulacion.trim().toUpperCase();
    const sims = await storage.listSimulaciones();
    const sim = sims.find(s => s.codigo_acceso === codigo && s.estado === 'activa');
    if (!sim) return send(res, 404, { error: `Código "${codigo}" no válido o simulación inactiva` });
    const simId = sim.id;
    for (let i = 0; i < miembros.length; i++) {
      const m = miembros[i];
      if (!m.apellidoPaterno?.trim()) return send(res, 400, { error: `Integrante ${i+1}: falta Apellido Paterno` });
      if (!m.apellidoMaterno?.trim()) return send(res, 400, { error: `Integrante ${i+1}: falta Apellido Materno` });
      if (!m.nombres?.trim())         return send(res, 400, { error: `Integrante ${i+1}: faltan Nombres` });
      if (!m.nroRegistro?.trim())     return send(res, 400, { error: `Integrante ${i+1}: falta Nro. Registro` });
    }
    const nombreLower = nombreEquipo.trim().toLowerCase();
    const equipos = await storage.getEquipos(simId);
    if (equipos.some(eq => eq.nombre.toLowerCase() === nombreLower))
      return send(res, 409, { error: `Ya existe el equipo "${nombreEquipo.trim()}" en esta simulación` });
    const base = nombreLower.replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const id   = `eq_${simId.slice(4)}_${base}_${Date.now().toString(36)}`;
    const equipo = {
      id, nombre: nombreEquipo.trim(), simulacionId: simId,
      password: hashPassword(password), passwordPlain: password,
      rol: 'equipo', registradoAt: new Date().toISOString(),
      miembros: miembros.map(m => ({
        apellidoPaterno: m.apellidoPaterno.trim(), apellidoMaterno: m.apellidoMaterno.trim(),
        nombres: m.nombres.trim(), telefono: (m.telefono||'').trim(), nroRegistro: m.nroRegistro.trim()
      }))
    };
    await storage.addEquipo(simId, equipo);
    const token = await createSession(id, 'equipo', simId);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax`);
    return send(res, 200, { ok: true, id, nombre: equipo.nombre, rol: 'equipo', passwordPlain: password,
      simulacionNombre: sim.nombre, codigoSimulacion: codigo });
  }

  if (url === '/auth/me' && method === 'GET') {
    console.log('[AUTH/ME] Petición recibida, sesión:', s ? 'activa' : 'no');
    if (needAuth()) return;
    console.log('[AUTH/ME] Usuario autenticado, rol:', s.rol);
    if (s.rol === 'equipo') {
      const sim = await storage.getSimulacion(s.simulacionId);
      const equipo = sim?.users?.find(u => u.id === s.userId);
      if (!equipo) return send(res, 401, { error: 'Sesión inválida' });
      return send(res, 200, { id: equipo.id, nombre: equipo.nombre, rol: equipo.rol, miembros: equipo.miembros||[],
        simulacionId: s.simulacionId });
    } else {
      const user = await storage.findUserById(s.userId);
      if (!user) return send(res, 401, { error: 'Sesión inválida' });
      // Incluir simulacionId activa en la sesión del admin/profesor
      let simNombre = null;
      if (s.simulacionId) {
        const simActiva = await storage.getSimulacion(s.simulacionId);
        simNombre = simActiva?.nombre || null;
      }
      return send(res, 200, {
        id: user.id, nombre: user.nombre, rol: user.rol, miembros: [],
        simulacionId: s.simulacionId || null,
        simNombre,
      });
    }
  }

  if (url === '/auth/validar-codigo' && method === 'POST') {
    const { codigo } = body;
    if (!codigo) return send(res, 400, { error: 'Código requerido' });
    const sims = await storage.listSimulaciones();
    const sim = sims.find(s => s.codigo_acceso?.toUpperCase() === codigo.trim().toUpperCase() && s.estado === 'activa');
    if (!sim) return send(res, 200, { valido: false });
    return send(res, 200, { valido: true, nombre: sim.nombre, simId: sim.id });
  }

  // ═══ ADMIN — Gestión de Simulaciones ═════════════════════════
  if (url === '/admin/simulaciones' && method === 'GET') {
    if (needAdmin()) return;
    const user = await storage.findUserById(s.userId);
    let simulaciones;
    if (user.rol === 'superadmin') {
      simulaciones = await storage.listSimulaciones();
    } else {
      simulaciones = await storage.listSimulaciones(s.userId);
    }
    const out = await Promise.all(simulaciones.map(async sim => {
      const equipos = await storage.getEquipos(sim.id);
      return {
        id: sim.id, nombre: sim.nombre, descripcion: sim.descripcion||'',
        estado: sim.estado, creadaAt: sim.creada_at,
        codigoAcceso: sim.codigo_acceso,
        currentRound: sim.config?.currentRound || 1,
        totalRounds: sim.config?.totalRounds || 20,
        roundState: sim.config?.roundState || 'pending',
        totalEquipos: equipos.length,
      };
    }));
    return send(res, 200, out);
  }

  // ══ BLOQUE B — reemplaza la ruta POST /admin/simulaciones ════════════════════
  // BUSCA: if (url === '/admin/simulaciones' && method === 'POST') { ... }
  // REEMPLAZA todo el bloque if hasta su cierre con esto:
  
    if (url === '/admin/simulaciones' && method === 'POST') {
      if (needAdmin()) return;
      const { nombre, descripcion, totalRounds, copyFromSimId, industria, modoInicio } = body;
      if (!nombre?.trim()) return send(res, 400, { error: 'Nombre de simulación requerido' });
  
      const user = await storage.findUserById(s.userId);
      if (!user) return send(res, 401, { error: 'Sesión inválida. Vuelve a iniciar sesión.' });
      const ownerId      = user.id;
      const simId        = storage.genSimId();
      const codigoAcceso = storage.genCodigo();
  
      // ── Cargar parámetros base ─────────────────────────────────────────────
      let baseSim = null;
      if (copyFromSimId) {
        baseSim = await storage.getSimulacion(copyFromSimId, user.rol !== 'superadmin' ? ownerId : null);
        if (!baseSim && user.rol === 'superadmin') baseSim = await storage.getSimulacion(copyFromSimId);
      }
  
      // ── Cargar plantilla de industria ──────────────────────────────────────
      // Orden de prioridad: 1) copyFrom, 2) plantilla por nombre, 3) jaboncillos
      let plantillaCfg = null;
      let industriaNombre = industria?.trim() || null;
  
      if (!baseSim && industriaNombre) {
        try {
          plantillaCfg = cargarPlantilla(industriaNombre);
        } catch (errPlantilla) {
          return send(res, 400, { error: errPlantilla.message });
        }
      }
  
      const simData = {
        id:          simId,
        nombre:      nombre.trim(),
        descripcion: (descripcion || '').trim(),
        codigoAcceso,
        estado:      'activa',
        creadaAt:    new Date().toISOString(),
        config: {
          currentRound: 1,
          totalRounds:  totalRounds || 20,
          roundState:   'pending',
          industria:    industriaNombre || 'Calzados_COM540_1_2026_V1',  // metadata para el frontend
        },
        metadata: { modoInicio: modoInicio || 'fase0' },
        // Prioridad: baseSim > plantilla > constants.js (jaboncillos)
        parametros:       baseSim?.parametros        || plantillaCfg?.params             || require('./src/constants').PARAMS,
        tiposProducto:    baseSim?.tipos_producto     || plantillaCfg?.tiposProducto      || require('./src/constants').TIPOS_PRODUCTO,
        canales:          baseSim?.canales            || plantillaCfg?.canales            || require('./src/constants').CANALES,
        segmentos:        baseSim?.segmentos          || plantillaCfg?.segmentos          || require('./src/constants').SEGMENTOS,
        afinidadMatrix:   baseSim?.afinidad_matrix    || plantillaCfg?.afinidadMatrix     || require('./src/constants').AFINIDAD_MATRIX,
        competenciaExterna: baseSim?.competencia_externa || plantillaCfg?.competenciaExterna || require('./src/constants').COMPETENCIA_EXTERNA,
        // Etapa 3.1: catálogo de proveedores de la plantilla
        proveedores: baseSim?.proveedores || plantillaCfg?.proveedores || [],
        rondas: {},
        users:  [],
      };
  
      await storage.createSimulacion(ownerId, simData);
      console.log(`[server] Simulación creada | id: ${simId} | industria: ${simData.config.industria}`);
      return send(res, 200, { ok: true, simId, codigoAcceso, industria: simData.config.industria });
    }
  

  if (url.match(/^\/admin\/simulaciones\/[^/]+$/) && method === 'PUT') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    const updates = {};
    if (body.nombre !== undefined) updates.nombre = body.nombre.trim();
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion;
    if (body.estado !== undefined) updates.estado = body.estado;
    if (body.codigoAcceso !== undefined) updates.codigo_acceso = body.codigoAcceso.trim().toUpperCase();
    await storage.updateSimulacion(simId, updates, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+\/archivar$/) && method === 'POST') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    await storage.updateSimulacion(simId, { estado: 'archivada' }, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+\/activar$/) && method === 'POST') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    await storage.updateSimulacion(simId, { estado: 'activa' }, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+$/) && method === 'DELETE') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    await storage.deleteSimulacion(simId, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/seleccionar-sim' && method === 'POST') {
    if (needAdmin()) return;
    const { simId } = body;
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    const token = getSessionToken(req);
    if (token) await updateSessionSimulation(token, simId);
    return send(res, 200, { ok: true, simId, nombre: sim.nombre });
  }

  // ═══ ADMIN — Gestión de profesores (solo superadmin) ════════
  if (url === '/admin/usuarios' && method === 'GET') {
    if (needSuperAdmin()) return;
    const profesores = await storage.listUsers('profesor');
    return send(res, 200, profesores);
  }

  if (url === '/admin/usuarios' && method === 'POST') {
    if (needSuperAdmin()) return;
    const { nombre, email, password } = body;
    if (!nombre || !email || !password) return send(res, 400, { error: 'Faltan datos' });
    const id = `prof_${Date.now().toString(36)}`;
    const hash = hashPassword(password);
    try {
      await storage.createUser(id, nombre, email, hash, password, 'profesor');
      console.log(`[PROFESOR] creado | id: ${id} | email: ${email}`);
    } catch(e) {
      console.error(`[PROFESOR] ERROR al crear | ${e.message}`);
      return send(res, 500, { error: `Error al guardar profesor: ${e.message}` });
    }
    // Devolver password_plain para que el panel lo muestre al superadmin
    return send(res, 200, { id, nombre, email, password_plain: password });
  }

  if (url.match(/^\/admin\/usuarios\/[^/]+$/) && method === 'DELETE') {
    if (needSuperAdmin()) return;
    const profId = url.split('/')[3];
    await storage.deleteUser(profId);
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/plantillas' && method === 'GET') {
    if (needAdmin()) return;
    try {
      const plantillas = listarPlantillas();
      return send(res, 200, { plantillas });
    } catch (err) {
      console.error('[server] Error listando plantillas:', err.message);
      return send(res, 500, { error: 'No se pudieron cargar las plantillas.' });
    }
  }

  if (url.match(/^\/admin\/plantillas\/[^/]+$/) && method === 'GET') {
    if (needAdmin()) return;
    try {
      const nombre = decodeURIComponent(url.split('/')[3]);
      const plantilla = cargarPlantilla(nombre);
      return send(res, 200, plantilla);
    } catch (err) {
      return send(res, 404, { error: `Plantilla "${url.split('/')[3]}" no encontrada.` });
    }
  }


  // ═══ Todas las rutas siguientes requieren contexto de simulación ═══
  const sim = await getCurrentSimulation(s);
  if (!sim && (s?.rol === 'superadmin' || s?.rol === 'profesor' || s?.rol === 'equipo')) {
    if (url.startsWith('/admin/') || url.startsWith('/api/')) {
      return send(res, 400, { error: 'Selecciona una simulación primero' });
    }
  }

  // ─── ADMIN — Equipos ─────────────────────────────────────────
  if (url === '/admin/equipos' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    const equipos = await storage.getEquipos(sim.id);
    // FIX multiproducto: buscar submitted en ronda.decisiones con IDs expandidos
    const out = equipos.map(eq => {
      // Primero buscar por ID exacto
      let dec = ronda?.decisiones?.[eq.id];
      // Si no encontrado, buscar por prefijo (multiproducto: eq_xxx__prod_1)
      if (!dec && ronda?.decisiones) {
        const key = Object.keys(ronda.decisiones).find(k => k.startsWith(eq.id + '__'));
        if (key) dec = ronda.decisiones[key];
      }
      const submitted    = dec?.submitted || false;
      const hasDecision  = !!dec;
      const submittedAt  = dec?.submittedAt || null;
      return { id:eq.id, nombre:eq.nombre, miembros:eq.miembros||[],
        submitted, hasDecision, submittedAt, forcedByAdmin: !!dec?.forcedByAdmin,
        forcedReason: dec?.forcedReason || null, capitalInicial: eq.capitalInicial || null,
        registradoAt:eq.registradoAt||null, passwordPlain:eq.passwordPlain||null };
    });
    return send(res, 200, out);
  }

  if (url === '/admin/equipos' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const { nombre, miembros, password } = body;
    if (!nombre || !password) return send(res, 400, { error: 'Nombre y contraseña requeridos' });
    const base = nombre.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const id = `eq_${Date.now().toString(36)}_${base}`;
    await storage.addEquipo(sim.id, { id, nombre, password:hashPassword(password), passwordPlain:password,
      rol:'equipo', miembros: Array.isArray(miembros)?miembros:[] });
    return send(res, 200, { ok: true, id, nombre });
  }

// ══ BLOQUE C — nueva ruta POST /admin/bots (añadir TRAS POST /admin/equipos) ═
// BUSCA: if (url.match(/^\/admin\/equipos\/[^/]+\/reset-envio$/) && method === 'POST') {
// AÑADE este bloque JUSTO ANTES de esa línea:

  if (url === '/admin/bots' && method === 'GET') {
    // Lista los perfiles disponibles y los bots ya registrados en la simulación
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipos   = await storage.getEquipos(sim.id);
    const botsActuales = equipos.filter(eq => eq.isBot);
    return send(res, 200, {
      perfiles:     Object.entries(PERFILES_BOT).map(([k, v]) => ({ id: k, ...v })),
      plantillas:   listarPlantillas(),
      bots:         botsActuales,
    });
  }

  if (url === '/admin/bots' && method === 'POST') {
    // Agrega un bot a la simulación actual
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });

    const { perfil, nombre } = body;
    if (!perfil || !PERFILES_BOT[perfil]) {
      return send(res, 400, {
        error: `Perfil inválido. Disponibles: ${Object.keys(PERFILES_BOT).join(', ')}`,
      });
    }

    const nombreBot    = (nombre || `Bot ${perfil}`).trim().slice(0, 40);
    const baseNombre   = nombreBot.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const botId        = `bot_${Date.now().toString(36)}_${baseNombre}`;

    const botEquipo = {
      id:           botId,
      nombre:       nombreBot,
      rol:          'equipo',
      isBot:        true,
      perfil,
      password:     hashPassword(botId),   // password = propio ID (los bots no inician sesión)
      passwordPlain: '—',
      miembros:     [],
      registradoAt: new Date().toISOString(),
    };

    await storage.addEquipo(sim.id, botEquipo);
    console.log(`[server] Bot agregado | id: ${botId} | perfil: ${perfil} | sim: ${sim.id}`);
    return send(res, 200, { ok: true, id: botId, nombre: nombreBot, perfil });
  }

  if (url.match(/^\/admin\/bots\/[^/]+$/) && method === 'DELETE') {
    // Elimina un bot de la simulación
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const botId  = url.split('/')[3];
    const equipos = await storage.getEquipos(sim.id);
    const bot     = equipos.find(eq => eq.id === botId && eq.isBot);
    if (!bot) return send(res, 404, { error: 'Bot no encontrado' });
    const restantes = equipos.filter(eq => eq.id !== botId);
    await storage.updateSimulacion(sim.id, { users: restantes });
    return send(res, 200, { ok: true });
  }


  if (url.match(/^\/admin\/equipos\/[^/]+\/reset-envio$/) && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (sim.config.roundState === 'simulated') return send(res, 400, { error: 'Ya simulada' });
    const dec = ronda.decisiones[eqId];
    if (!dec) return send(res, 404, { error: 'Sin decisiones' });
    dec.submitted = false; dec.submittedAt = null;
    await storage.updateRonda(sim.id, sim.config.currentRound, { decisiones: ronda.decisiones });
    return send(res, 200, { ok: true });
  }

  // PUT /admin/equipos/:id/nombre — renombrar equipo
  if (url.match(/^\/admin\/equipos\/[^/]+\/nombre$/) && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    const equipos = await storage.getEquipos(sim.id);
    const eq = equipos.find(e => e.id === eqId);
    if (!eq) return send(res, 404, { error: 'No encontrado' });
    if (!body.nombre?.trim()) return send(res, 400, { error: 'Nombre requerido' });
    eq.nombre = body.nombre.trim();
    await storage.updateSimulacion(sim.id, { users: equipos });
    console.log(`[equipos] Renombrado ${eqId} → ${eq.nombre}`);
    return send(res, 200, { ok: true, nombre: eq.nombre });
  }

  // PUT /admin/equipos/:id/editar — actualizar nombre y/o contraseña juntos
  if (url.match(/^\/admin\/equipos\/[^/]+\/editar$/) && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    const equipos = await storage.getEquipos(sim.id);
    const eq = equipos.find(e => e.id === eqId);
    if (!eq) return send(res, 404, { error: 'No encontrado' });
    if (body.nombre?.trim())    eq.nombre        = body.nombre.trim();
    if (body.password?.trim()) {
      eq.password      = hashPassword(body.password.trim());
      eq.passwordPlain = body.password.trim();
    }
    await storage.updateSimulacion(sim.id, { users: equipos });
    console.log(`[equipos] Editado ${eqId} — nombre=${eq.nombre}`);
    return send(res, 200, { ok: true, nombre: eq.nombre });
  }

  if (url.match(/^\/admin\/equipos\/[^/]+\/password$/) && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    const equipos = await storage.getEquipos(sim.id);
    const eq = equipos.find(e => e.id === eqId);
    if (!eq) return send(res, 404, { error: 'No encontrado' });
    eq.password = hashPassword(body.password);
    eq.passwordPlain = body.password;
    await storage.updateSimulacion(sim.id, { users: equipos });
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/equipos\/[^/]+$/) && method === 'DELETE') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    let equipos = await storage.getEquipos(sim.id);
    const idx = equipos.findIndex(e => e.id === eqId);
    if (idx === -1) return send(res, 404, { error: 'No encontrado' });
    equipos.splice(idx, 1);
    await storage.updateSimulacion(sim.id, { users: equipos });
    await storage.deleteEquipoDecisiones(sim.id, eqId);
    return send(res, 200, { ok: true });
  }

  // PUT /admin/equipos/:id/capital — asignar capital inicial específico a un equipo
  if (url.match(/^\/admin\/equipos\/[^/]+\/capital$/) && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    const { capitalInicial } = body;
    const equipos = await storage.getEquipos(sim.id);
    const eq = equipos.find(e => e.id === eqId);
    if (!eq) return send(res, 404, { error: 'Equipo no encontrado' });
    if (capitalInicial !== null && capitalInicial !== undefined) {
      if (typeof capitalInicial !== 'number' || capitalInicial <= 0)
        return send(res, 400, { error: 'capitalInicial debe ser un número positivo o null' });
      eq.capitalInicial = capitalInicial;
    } else {
      delete eq.capitalInicial;  // null = volver al global
    }
    await storage.updateSimulacion(sim.id, { users: equipos });
    return send(res, 200, { ok: true, capitalInicial: eq.capitalInicial || null });
  }

  // ─── ADMIN — Fase 0 ───────────────────────────────────────────
  if (url === '/admin/fase0' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const equipos = await storage.getEquipos(sim.id);
    const registros = await storage.getFase0(sim.id);
    const out = equipos.map(eq => ({
      equipo: eq,
      fase0: registros.find(r => r.equipo_id === eq.id) || null
    }));
    const fase0Estado = obtenerEstadoFase0(sim.config);
    return send(res, 200, {
      registros: out,
      fase0Activa: sim.config?.fase0Activa ?? false,
      fase0Estado,
      fase0Cerrada: fase0Estado === 'cerrada'
    });
  }

  if (url === '/admin/fase0/capital' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const { equipoId, cajaInicialDocente, capitalInversion } = body;
    const cajaDoc = Number(cajaInicialDocente);
    const capInv  = Number(capitalInversion);
    if (!Number.isFinite(cajaDoc) || cajaDoc <= 0)
      return send(res, 400, { error: 'cajaInicialDocente debe ser un número positivo' });
    if (!Number.isFinite(capInv) || capInv < 0)
      return send(res, 400, { error: 'capitalInversion debe ser un número no negativo' });
    const equipos = await storage.getEquipos(sim.id);
    if (!equipos.find(e => e.id === equipoId)) return send(res, 404, { error: 'Equipo no encontrado' });
    const capitalTotalOtorgado = cajaDoc + capInv;
    const data = await storage.upsertFase0(sim.id, equipoId, {
      caja_inicial_docente: cajaDoc,
      capital_inversion: capInv,
      capital_total_otorgado: capitalTotalOtorgado
    });
    return send(res, 200, { ok: true, data });
  }

  if (url === '/admin/fase0/costo-fijo' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const { equipoId, costoFijoMinimo } = body;
    const minimo = Number(costoFijoMinimo);
    if (!Number.isFinite(minimo) || minimo < 0)
      return send(res, 400, { error: 'costoFijoMinimo debe ser un número no negativo' });
    const equipos = await storage.getEquipos(sim.id);
    if (!equipos.find(e => e.id === equipoId)) return send(res, 404, { error: 'Equipo no encontrado' });
    const data = await storage.upsertFase0(sim.id, equipoId, {
      costo_fijo_minimo: minimo
    });
    return send(res, 200, { ok: true, data });
  }

  // FASE 1A — captura admin de gastos fijos de Fase 0 por equipo.
  // Valida Number.isFinite(x) && x >= 0; acepta 0 explícito; rechaza null/undefined/''/NaN/negativo.
  if (url === '/admin/fase0/gastos-fijos' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const { equipoId, gastoAdminFijo, gastoFijoPlanta, sueldosAdministrativosFijos } = body;
    const campos = {
      gasto_admin_fijo_fase0:              gastoAdminFijo,
      gasto_fijo_planta_fase0:             gastoFijoPlanta,
      sueldos_administrativos_fijos_fase0: sueldosAdministrativosFijos,
    };
    for (const k of Object.keys(campos)) {
      const v = campos[k];
      if (v === null || v === undefined || v === '') return send(res, 400, { error: `Falta el valor de ${k}` });
      const num = Number(v);
      if (!Number.isFinite(num) || num < 0) return send(res, 400, { error: `${k} debe ser un número >= 0 (0 explícito permitido)` });
      campos[k] = num;
    }
    const equipos = await storage.getEquipos(sim.id);
    if (!equipos.find(e => e.id === equipoId)) return send(res, 404, { error: 'Equipo no encontrado' });
    const data = await storage.upsertFase0(sim.id, equipoId, campos);
    return send(res, 200, { ok: true, data });
  }

  if (url === '/admin/fase0/habilitar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const { equipoId } = body;
    const equipos = await storage.getEquipos(sim.id);
    if (!equipos.find(e => e.id === equipoId)) return send(res, 404, { error: 'Equipo no encontrado' });
    let registro = await storage.getFase0Equipo(sim.id, equipoId);
    if (!registro) {
      registro = await storage.upsertFase0(sim.id, equipoId, { estado: 'borrador' });
    } else if (registro.estado === 'cerrado') {
      return send(res, 400, { error: 'Fase 0 cerrada para este equipo' });
    }
    if (!registro) return send(res, 500, { error: 'Error al crear registro Fase 0' });
    return send(res, 200, { ok: true, estado: registro.estado });
  }

  if (url === '/admin/fase0/credito' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const { equipoId, creditoOperativo, creditoInversion } = body;
    const credOp  = Number(creditoOperativo);
    const credInv = Number(creditoInversion);
    if (!Number.isFinite(credOp) || credOp < 0)
      return send(res, 400, { error: 'creditoOperativo debe ser un número no negativo' });
    if (!Number.isFinite(credInv) || credInv < 0)
      return send(res, 400, { error: 'creditoInversion debe ser un número no negativo' });
    const equipos = await storage.getEquipos(sim.id);
    if (!equipos.find(e => e.id === equipoId)) return send(res, 404, { error: 'Equipo no encontrado' });
    const data = await storage.upsertFase0(sim.id, equipoId, {
      credito_operativo_pre_r1: credOp,
      credito_inversion_pre_r1: credInv
    });
    return send(res, 200, { ok: true, data });
  }

  if (url === '/admin/fase0/activar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    if (obtenerEstadoFase0(sim.config) === 'cerrada') {
      return send(res, 400, { error: 'La Fase 0 ya está cerrada y lista para abrir R1' });
    }
    sim.config.fase0Activa = true;
    sim.config.fase0Estado = 'activa';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    return send(res, 200, { ok: true, fase0Activa: true, fase0Estado: 'activa' });
  }

  if (url === '/admin/fase0/cerrar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    // Validar que todos los equipos humanos hayan enviado/cerrado su Fase 0
    const equipos = await storage.getEquipos(sim.id);
    const humanos = equipos.filter(eq => eq.rol === 'equipo' && !eq.isBot);
    const registros = await storage.getFase0(sim.id);
    const regPorEquipo = {};
    for (const r of registros) regPorEquipo[r.equipo_id] = r;
    const pendientes = humanos.filter(eq => {
      const reg = regPorEquipo[eq.id];
      return !reg || (reg.estado !== 'enviado' && reg.estado !== 'cerrado');
    });
    if (pendientes.length > 0) {
      return send(res, 400, {
        error: 'Hay equipos que aún no han enviado su Fase 0: ' + pendientes.map(eq => eq.nombre).join(', '),
        pendientes: pendientes.map(eq => ({ id: eq.id, nombre: eq.nombre }))
      });
    }
    // FASE 1A — bloqueo: los 3 gastos fijos de Fase 0 son obligatorios para cerrar.
    const faltanGF = faltanGastosFijosFase0(humanos, regPorEquipo);
    if (faltanGF.length) {
      return send(res, 400, {
        error: 'Faltan gastos fijos de Fase 0 para el equipo: ' + faltanGF.join(', ')
      });
    }
    sim.config.fase0Activa = false;
    sim.config.fase0Estado = 'cerrada';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    return send(res, 200, { ok: true, fase0Activa: false, fase0Estado: 'cerrada' });
  }

  // ─── ADMIN — Rondas ───────────────────────────────────────────
  if (url === '/admin/ronda' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const cfg = sim.config;
    const ronda = await storage.getRonda(sim.id, cfg.currentRound);
    const equipos = await storage.getEquipos(sim.id);
    // Contar enviados: primero ronda.decisiones, luego sim_decisiones como fallback
    let enviados = ronda ? equipos.filter(eq => (ronda.decisiones||{})[eq.id]?.submitted).length : 0;
    if (enviados === 0 && ronda) {
      // Multiproducto: buscar en claves expandidas eq_xxx__prod_N
      const envSet = new Set();
      Object.entries(ronda.decisiones||{}).forEach(([k,d]) => {
        if (d?.submitted) {
          const eq = equipos.find(e => k === e.id || k.startsWith(e.id + '__'));
          if (eq) envSet.add(eq.id);
        }
      });
      if (envSet.size > 0) enviados = envSet.size;
    }
    return send(res, 200, { currentRound:cfg.currentRound, totalRounds:cfg.totalRounds,
      roundState:cfg.roundState, total:equipos.length, enviados,
      abiertaAt:ronda?.abiertaAt, ejecutadaAt:ronda?.ejecutadaAt });
  }

  if (url === '/admin/ronda/activar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    if (sim.config.roundState !== 'pending') return send(res, 400, { error: 'No está pendiente' });
    const modoInicioActivar = leerModoInicio(sim);
    if (modoInicioActivar === 'fase0' && sim.config.fase0Activa === true) {
      return send(res, 400, { error: 'No se puede activar la ronda: Fase 0 sigue abierta. Cierra Fase 0 primero (Admin → Fase 0 → Cerrar Fase 0).' });
    }
    sim.config.roundState = 'open';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    const n = sim.config.currentRound;
    let ronda = await storage.getRonda(sim.id, n);

    // Si la ronda no existe o no tiene decisiones → propagar desde ronda anterior
    // Verificar sim_decisiones directamente (no el JSONB legado)
    const nSimDecs = await storage.countDecisiones(sim.id, n);
    console.log(`[server] activar R${n}: ronda=${!!ronda} sim_decisiones=${nSimDecs}`);
    if (!ronda || nSimDecs === 0) {
      console.log(`[server] Ronda ${n} sin decisiones — propagando desde R${n-1}`);
      const equipos = await storage.getEquipos(sim.id);
      const prevRonda = n > 1 ? await storage.getRonda(sim.id, n-1) : null;
      const resObj = prevRonda?.resultados?.resultados || prevRonda?.resultados || {};

      const modoInicio = leerModoInicio(sim);
      let fase0PorEquipo = {};
      if (modoInicio === 'fase0') {
        const registrosFase0 = await storage.getFase0(sim.id);
        registrosFase0.forEach(r => { fase0PorEquipo[r.equipo_id] = r; });
      }
      const decisiones = {};
      for (const eq of equipos.filter(e => !e.isBot)) {
        let dec = storage.defaultDecision(eq.id, eq.nombre, sim.parametros);
        const resPrev = Object.values(resObj)
          .filter(v => v && typeof v === 'object' && v.equipoNombre)
          .find(r => r.equipoOriginal === eq.id || r.equipo === eq.id || (r.equipo||'').startsWith(eq.id));

        if (resPrev) {
          dec = propagarEstado(dec, resPrev, sim.parametros);
          console.log(`[server] ${eq.nombre}: caja=${dec.cajaInicial} vend=${dec.vendedoresIniciales} oper=${dec.operariosIniciales} saldoIUE=${dec.saldoIUEcompensable}`);
        } else {
          if (modoInicio === 'fase0' && n === 1) {
            dec = hidratarEstadoInicialR1(dec, sim.parametros, fase0PorEquipo[eq.id] || null, modoInicio, n);
            console.log(`[server] ${eq.nombre}: estado inicial R1 hidratado desde Fase 0`);
          } else {
            console.log(`[server] ${eq.nombre}: sin resultado previo — usando defaults`);
          }
        }
        // Activos complementarios Fase 0 (inmutables) — re-leídos de BD cada ronda
        if (modoInicio === 'fase0' && fase0PorEquipo[eq.id]) {
          const f0 = fase0PorEquipo[eq.id];
          dec.vehiculo_nivel           = Number(f0.vehiculo_nivel || 0);
          dec.muebles_comprado         = !!f0.muebles_comprado;
          dec.equipos_computo_comprado = !!f0.equipos_computo_comprado;
          dec.patentes_comprado        = !!f0.patentes_comprado;
        }
        decisiones[eq.id] = dec;
      }

      // Guardar decisiones + estado en una sola llamada
      await storage.updateRonda(sim.id, n, {
        estado: 'open',
        decisiones,
        resultados: {}, mercadoSegmentos: [], atractivoEquipos: {}, dashboard: {}
      });
      console.log(`[server] Ronda ${n} poblada con ${Object.keys(decisiones).length} decisiones`);
    } else {
      // R1 puede tener borradores creados antes de activarse. Rehidratar sólo
      // los no enviados/no forzados para no perder el Balance Inicial Fase 0.
      const modoInicio = leerModoInicio(sim);
      if (modoInicio === 'fase0' && n === 1) {
        const fase0PorEquipo = {};
        (await storage.getFase0(sim.id)).forEach(r => { fase0PorEquipo[r.equipo_id] = r; });
        const equipos = await storage.getEquipos(sim.id);
        const decisiones = { ...(ronda.decisiones || {}) };
        let hidratada = false;
        for (const eq of equipos.filter(e => !e.isBot)) {
          const key = decisiones[eq.id]
            ? eq.id
            : Object.keys(decisiones).find(k => k.startsWith(eq.id + '__'));
          if (!key) continue;
          const dec = hidratarEstadoInicialR1(decisiones[key], sim.parametros, fase0PorEquipo[eq.id] || null, modoInicio, n);
          if (dec !== decisiones[key]) {
            decisiones[key] = dec;
            hidratada = true;
          }
        }
        await storage.updateRonda(sim.id, n, hidratada ? { estado: 'open', decisiones } : { estado: 'open' });
      } else {
        await storage.updateRonda(sim.id, n, { estado: 'open' });
      }
    }
    return send(res, 200, { ok: true, currentRound: n });
  }

  if (url === '/admin/ronda/cerrar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || ronda.ejecutadaAt || ['simulated', 'calculada'].includes(ronda.estado)) {
      return send(res, 400, { error: 'La ronda no está disponible para cerrar envíos' });
    }
    if (ronda.estado !== 'open') return send(res, 400, { error: 'La ronda no está abierta' });
    const equipos = await storage.getEquipos(sim.id);
    const pendientes = equiposPendientesDecision(equipos, ronda.decisiones);
    if (pendientes.length) return send(res, 400, {
      error: 'No se pueden cerrar envíos. Hay equipos pendientes. Envíe o fuerce la decisión antes de cerrar: ' + pendientes.map(eq => eq.nombre).join(', '),
      pendientes: pendientes.map(eq => ({ id: eq.id, nombre: eq.nombre }))
    });
    sim.config.roundState = 'locked';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/ronda/forzar-decision' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    if (sim.config.roundState !== 'open') return send(res, 400, { error: 'La ronda debe estar abierta para forzar una decisión' });
    const equipoId = body.equipoId;
    const motivo = String(body.motivo || '').trim();
    if (!equipoId || !motivo) return send(res, 400, { error: 'equipoId y motivo son obligatorios' });
    const equipos = await storage.getEquipos(sim.id);
    const equipo = equipos.find(eq => eq.id === equipoId && eq.rol === 'equipo' && !eq.isBot);
    if (!equipo) return send(res, 404, { error: 'Equipo no encontrado' });
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || ['simulated', 'calculada'].includes(ronda.estado)) return send(res, 400, { error: 'Ronda no disponible' });
    if (!ronda.decisiones) ronda.decisiones = {};
    const actual = decisionDeEquipo(ronda.decisiones, equipoId);
    if (actual?.submitted && !actual.forcedByAdmin) return send(res, 400, { error: 'El equipo ya envió una decisión normal' });
    let baseDecision = actual || storage.defaultDecision(equipo.id, equipo.nombre, sim.parametros, equipo);
    const modoInicio = leerModoInicio(sim);
    if (!actual && modoInicio === 'fase0' && Number(n) === 1) {
      const fase0 = await storage.getFase0Equipo(sim.id, equipoId);
      baseDecision = hidratarEstadoInicialR1(baseDecision, sim.parametros, fase0, modoInicio, n);
    } else if (!actual && Number(n) >= 2) {
      const prevRonda = await storage.getRonda(sim.id, n - 1);
      const resObj = prevRonda?.resultados?.resultados || prevRonda?.resultados || {};
      const resPrev = Object.values(resObj)
        .filter(v => v && typeof v === 'object' && v.equipoNombre)
        .find(r => r.equipoOriginal === equipoId || r.equipo === equipoId || (r.equipo || '').startsWith(equipoId));
      if (resPrev) baseDecision = propagarEstado(baseDecision, resPrev, sim.parametros);
    }
    const ahora = new Date().toISOString();
    ronda.decisiones[equipoId] = {
      ...baseDecision,
      equipo: equipoId, submitted: true, submittedAt: ahora,
      forcedByAdmin: true, forcedReason: motivo, forcedAt: ahora
    };
    await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });
    return send(res, 200, { ok: true, equipoId, forcedByAdmin: true });
  }

  if (url === '/admin/ronda/pre-simular' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (!['open','locked'].includes(sim.config.roundState)) return send(res, 400, { error: 'Estado incorrecto' });
    if (['simulated','calculada'].includes(ronda.estado)) return send(res, 400, { error: 'Ya simulada' });
    const equipos = await storage.getEquipos(sim.id);
    const pendientes = equiposPendientesDecision(equipos, ronda.decisiones);
    if (pendientes.length) return send(res, 400, {
      error: 'Faltan decisiones enviadas o forzadas: ' + pendientes.map(eq => eq.nombre).join(', '),
      pendientes: pendientes.map(eq => ({ id: eq.id, nombre: eq.nombre }))
    });
    // Si no hay decisiones en ronda.decisiones, usar defaultDecision para todos
    const decisionesRonda = ronda.decisiones || {};
    let decisiones = equipos.filter(eq => decisionesRonda[eq.id]).map(eq => ({...decisionesRonda[eq.id]}));
    if (!decisiones.length) {
      // Generar defaultDecision con datos financieros de ronda anterior
      const prevRonda = await storage.getRonda(sim.id, n-1);
      const resObj = prevRonda?.resultados?.resultados || prevRonda?.resultados || {};
      decisiones = equipos.filter(eq => !eq.isBot).map(eq => {
        let dec = storage.defaultDecision(eq.id, eq.nombre, sim.parametros);
        const resPrev = Object.values(resObj).find(r =>
          r.equipoOriginal === eq.id || r.equipo === eq.id || (r.equipo||'').startsWith(eq.id)
        );
        if (resPrev) dec = propagarEstado(dec, resPrev, sim.parametros);
        return dec;
      });
    }
    if (!decisiones.length) return send(res, 400, { error: 'Sin equipos registrados' });
    try {
      const simCfg = {
        params: sim.parametros,
        tiposProducto: sim.tipos_producto,
        canales: sim.canales,
        segmentos: sim.segmentos,
        afinidadMatrix: sim.afinidad_matrix,
        competenciaExterna: sim.competencia_externa
      };
      const preResult = calcularPreSimulacion(decisiones, simCfg);
      const preSimulacion = {};
      preResult.resultado.forEach(r => { preSimulacion[r.equipo] = { ...r, confirmado: false }; });
      await storage.updateRonda(sim.id, n, { preSimulacion, preSimMercado: preResult.mercadoSegmentos });
      sim.config.roundState = 'pre-sim';
      await storage.updateSimulacion(sim.id, { config: sim.config });
      return send(res, 200, { ok: true, equiposCalculados: preResult.resultado.length, detalle: preResult.resultado });
    } catch(e) { return send(res, 500, { error: e.message }); }
  }

  if (url === '/api/presim' && method === 'GET') {
    if (needAuth()) return;
    if (!sim) return send(res, 404, { error: 'Sin simulación' });
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda?.preSimulacion) return send(res, 404, { error: 'Sin datos de pre-simulación' });
    if (s.rol === 'superadmin' || s.rol === 'profesor') {
      const equipos = await storage.getEquipos(sim.id);
      const eqMap = {};
      equipos.forEach(eq => { eqMap[eq.id] = eq.nombre; });
      // Consolidar por empresa (equipoOriginal) para multiproducto
      const rawDetalle = Object.values(ronda.preSimulacion).map(r => ({...r, equipoNombre: resolveNombre(r, eqMap)}));
      const porEmpresa = {};
      rawDetalle.forEach(r => {
        const eqId = r.equipoOriginal || r.equipo;
        if (!porEmpresa[eqId]) {
          porEmpresa[eqId] = {
            equipo: eqId,
            equipoNombre: r.equipoNombre,
            confirmado: r.confirmado,
            productos: []
          };
        }
        // Si algún producto está confirmado, la empresa está confirmada
        if (r.confirmado) porEmpresa[eqId].confirmado = true;
        porEmpresa[eqId].productos.push({
          producto:        r.producto,
          segmento:        r.segmento || r.segmentoObjetivo,
          demandaFormal:   r.demandaFormal,
          shareEstimado:   r.shareEstimado,
          demandaAsignada: r.demandaAsignada,
          inventario:      r.inventario,
          ventasEstimadas: r.ventasEstimadas,
        });
      });
      const detalle = Object.values(porEmpresa);
      return send(res, 200, { roundState: sim.config.roundState, total: detalle.length,
        confirmados: detalle.filter(r=>r.confirmado).length, detalle, mercadoSegmentos: ronda.preSimMercado||[] });
    } else {
      // Buscar TODOS los productos del equipo (puede tener hasta 5)
      const misDatos = Object.values(ronda.preSimulacion || {}).filter(
        p => p.equipoOriginal === s.userId
          || p.equipo === s.userId
          || p.equipo?.startsWith(s.userId)
      );
      if (!misDatos.length) return send(res, 404, { error: 'Sin datos para tu equipo' });
      // Compatibilidad: si tiene 1 solo producto retornar presim como objeto
      // Si tiene múltiples retornar presim como array
      const presim = misDatos.length === 1 ? misDatos[0] : misDatos;
      return send(res, 200, { roundState: sim.config.roundState, presim, mercadoSegmentos: ronda.preSimMercado||[] });
    }
  }

  if (url === '/api/presim/confirmar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda?.preSimulacion) return send(res, 400, { error: 'Sin pre-simulación activa' });
    if (sim.config.roundState !== 'pre-sim') return send(res, 400, { error: 'No hay pre-simulación activa' });
    // Buscar la clave correcta (puede ser ID expandido eq_xxx__prod_1)
    // Confirmar TODOS los productos del equipo
    const psKeys = Object.keys(ronda.preSimulacion).filter(
      k => k === s.userId
        || ronda.preSimulacion[k].equipoOriginal === s.userId
        || k.startsWith(s.userId)
    );
    if (!psKeys.length) return send(res, 404, { error: 'Sin datos para tu equipo' });
    psKeys.forEach(k => {
      ronda.preSimulacion[k].confirmado = true;
      ronda.preSimulacion[k].confirmadoAt = new Date().toISOString();
    });
    await storage.updateRonda(sim.id, sim.config.currentRound, { preSimulacion: ronda.preSimulacion });
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/presim\/forzar\/[^/]+$/) && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[4];
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda?.preSimulacion?.[eqId]) return send(res, 404, { error: 'Equipo no encontrado' });
    ronda.preSimulacion[eqId].confirmado = true;
    ronda.preSimulacion[eqId].forzadoPor = 'admin';
    ronda.preSimulacion[eqId].confirmadoAt = new Date().toISOString();
    await storage.updateRonda(sim.id, sim.config.currentRound, { preSimulacion: ronda.preSimulacion });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/presim/forzar-todos' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda?.preSimulacion) return send(res, 400, { error: 'Sin pre-simulación activa' });
    for (const r of Object.values(ronda.preSimulacion)) {
      if (!r.confirmado) { r.confirmado = true; r.forzadoPor = 'admin'; r.confirmadoAt = new Date().toISOString(); }
    }
    await storage.updateRonda(sim.id, sim.config.currentRound, { preSimulacion: ronda.preSimulacion });
    return send(res, 200, { ok: true });
  }

// ══ BLOQUE D — reemplaza la ruta POST /admin/simular ════════════════════════
// v2 — auto-forzar confirmaciones + defaultDecision sin decisiones
// BUSCA: if (url === '/admin/simular' && method === 'POST') { ... }
// REEMPLAZA todo el bloque if con esto:

  if (url === '/admin/simular' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });

    const n     = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda)                       return send(res, 400, { error: 'Sin ronda' });
    if (['simulated','calculada'].includes(ronda.estado)) return send(res, 400, { error: 'Ya simulada' });
    if (!['open', 'locked', 'pre-sim'].includes(sim.config.roundState))
      return send(res, 400, { error: 'Estado incorrecto' });
    if (sim.config.roundState === 'pre-sim') {
      // Auto-forzar confirmaciones pendientes antes de ejecutar
      const preSimulacion = ronda.preSimulacion || {};
      let forzados = 0;
      Object.values(preSimulacion).forEach(r => {
        if (!r.confirmado) {
          r.confirmado = true;
          r.forzadoPor = 'auto-simular';
          r.confirmadoAt = new Date().toISOString();
          forzados++;
        }
      });
      if (forzados > 0) {
        await storage.updateRonda(sim.id, n, { preSimulacion });
        console.log(`[server] Auto-forzadas ${forzados} confirmaciones antes de simular`);
      }
    }

    const equipos = await storage.getEquipos(sim.id);
    if (!equipos.length) return send(res, 400, { error: 'Sin equipos' });
    const pendientes = equiposPendientesDecision(equipos, ronda.decisiones);
    if (pendientes.length) return send(res, 400, {
      error: 'No se puede simular: faltan decisiones enviadas o forzadas de ' + pendientes.map(eq => eq.nombre).join(', '),
      pendientes: pendientes.map(eq => ({ id: eq.id, nombre: eq.nombre }))
    });

    // FASE 1A — bloqueo: en modo fase0, R1 no se calcula sin los 3 gastos fijos de Fase 0.
    if (leerModoInicio(sim) === 'fase0' && n === 1) {
      const humanosFG = equipos.filter(eq => eq.rol === 'equipo' && !eq.isBot);
      const regFG = {};
      (await storage.getFase0(sim.id)).forEach(r => { regFG[r.equipo_id] = r; });
      const faltanFG = faltanGastosFijosFase0(humanosFG, regFG);
      if (faltanFG.length) {
        return send(res, 400, {
          error: 'Faltan gastos fijos de Fase 0 para el equipo: ' + faltanFG.join(', ')
        });
      }
    }

    // Etapa 2.2: construir mapa de demandaBase de la ronda anterior
    const demandaBaseAnteriorMap = {};
    if (n > 1) {
      const rondaPrevia = await storage.getRonda(sim.id, n - 1);
      if (rondaPrevia?.mercadoSegmentos?.length) {
        rondaPrevia.mercadoSegmentos.forEach(seg => {
          demandaBaseAnteriorMap[seg.nombre] = seg.demandaBase;
        });
      }
    }

    // Generar shock de mercado — aleatorio o elegido por el profesor
    const probabilidadShock = sim.parametros.probabilidadShock ?? 0.35;
    let shock;
    if (body.shockOverride && body.shockOverride !== 'aleatorio') {
      // El profesor eligió un shock específico del catálogo
      const shockElegido = SHOCKS_CATALOGO.find(s => s.id === body.shockOverride);
      if (shockElegido) {
        shock = { ...shockElegido, forzadoPor: 'profesor' };
        console.log(`[server] Shock R${n} FORZADO por profesor: [${shock.tipo}] ${shock.descripcion}`);
      } else if (body.shockOverride === 'neutral') {
        shock = { id:'neutral', tipo:'neutral', icono:'⚖️', color:'#6B7280',
                  descripcion:'Mercado estable — sin eventos externos esta ronda',
                  factorDemanda:1.00, segmentosAfectados:'todos', forzadoPor:'profesor' };
        console.log(`[server] Shock R${n} FORZADO neutral por profesor`);
      } else {
        shock = generarShock(sim.id, n, probabilidadShock, sim.parametros);
        console.log(`[server] Shock R${n} (aleatorio): [${shock.tipo}] ${shock.descripcion}`);
      }
    } else {
      shock = generarShock(sim.id, n, probabilidadShock, sim.parametros);
      console.log(`[server] Shock R${n} (aleatorio): [${shock.tipo}] ${shock.descripcion} (factor=${shock.factorDemanda})`);
    }

    const simCfg = {
      meta:                  sim.config.industria ? { nombre: sim.config.industria } : {},
      params:                sim.parametros,
      tiposProducto:         sim.tipos_producto,
      canales:               sim.canales,
      segmentos:             sim.segmentos,
      afinidadMatrix:        sim.afinidad_matrix,
      competenciaExterna:    sim.competencia_externa,
      demandaBaseAnteriorMap,  // Etapa 2.2: demanda dinámica
      rondaNumero:    n,         // Etapa 3.1: número de ronda para lead time
      bloquearProduccionR1: (sim.metadata?.modoInicio === 'fase0'),  // lead time maquinaria: R1 sin producción en modo Fase 0
      proveedores:    sim.proveedores || [],  // Etapa 3.1: catálogo de proveedores
      shock,                   // Shock de mercado: afecta demandaFormal de segmentos
      equipos,                 // Lista de equipos (para reportes Premium/Estratégico)
    };

    // ── Generar decisiones de bots ─────────────────────────────────────────
    const botsDeEstaSimulacion = equipos.filter(eq => eq.isBot);
    if (botsDeEstaSimulacion.length > 0) {
      console.log(`[server] Generando decisiones para ${botsDeEstaSimulacion.length} bot(s)...`);

      // Construir historial de las últimas 2 rondas para contexto de los bots
      const historialRondas = [];
      for (let i = Math.max(1, n - 2); i < n; i++) {
        const rondaHist = await storage.getRonda(sim.id, i);
        if (rondaHist) historialRondas.push({ numero: i, ...rondaHist });
      }

      // Generar decisiones de todos los bots en paralelo
      await Promise.allSettled(
        botsDeEstaSimulacion.map(async (bot) => {
          try {
            const historialBot = {
              rondaActual:    n,
              ultimas2Rondas: historialRondas,
              resultados:     historialRondas.map(r => r.resultados?.[bot.id]).filter(Boolean),
            };
            const decisionBot = await generarDecisionBot(bot, historialBot, simCfg);

            // Guardar la decisión del bot en la ronda (dual-write)
            if (!ronda.decisiones) ronda.decisiones = {};
            ronda.decisiones[bot.id] = decisionBot;
            await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });

            console.log(`[server] ✓ Decisión generada para bot "${bot.nombre}" (${bot.perfil})`);
          } catch (errBot) {
            console.error(`[server] ✗ Error generando decisión para bot "${bot.nombre}": ${errBot.message}`);
          }
        })
      );
    }

    // ── Ejecutar el motor con todas las decisiones (humanos + bots) ────────
    // Recargar la ronda para incluir las decisiones de bots recién guardadas
    const rondaActualizada = await storage.getRonda(sim.id, n);
    // Combinar decisiones de ronda original + rondaActualizada (bots pueden estar en cualquiera)
    const decsCombinadas = { ...(ronda.decisiones||{}), ...(rondaActualizada.decisiones||{}) };
    const prevRondaReal = n > 1 ? await storage.getRonda(sim.id, n-1) : null;
    const resObjReal = prevRondaReal?.resultados?.resultados || prevRondaReal?.resultados || {};
    let decisiones = equipos
      .filter(eq => decsCombinadas[eq.id])
      .map(eq => { const dec={...decsCombinadas[eq.id]}; const rp=Object.values(resObjReal).find(r=>r.equipoOriginal===eq.id||r.equipo===eq.id||(r.equipo||String()).startsWith(eq.id)); return rp?propagarEstado(dec,rp,sim.parametros):dec; });

    // Si aún no hay decisiones, generar defaultDecision para todos
    if (!decisiones.length) {
      const prevRonda2 = await storage.getRonda(sim.id, n-1);
      const resObj2 = prevRonda2?.resultados?.resultados || prevRonda2?.resultados || {};
      decisiones = equipos.filter(eq => !eq.isBot).map(eq => {
        let dec = storage.defaultDecision(eq.id, eq.nombre, sim.parametros);
        const resPrev2 = Object.values(resObj2).find(r =>
          r.equipoOriginal === eq.id || r.equipo === eq.id || (r.equipo||'').startsWith(eq.id)
        );
        if (resPrev2) dec = propagarEstado(dec, resPrev2, sim.parametros);
        return dec;
      });
    }

    if (!decisiones.length) return send(res, 400, { error: 'Sin equipos registrados' });
    // ── Bots IA dinámicos — se agregan a decisiones[] ya construido ─────
    const nivelIA2 = sim.config?.nivelCompetidoresIA;
    if (nivelIA2 && nivelIA2 !== 'ninguno') {
      try {
        const botsIA = await generarBotsParaSegmentos(decisiones, { ...simCfg, nivelCompetidoresIA: nivelIA2 }, n);
        botsIA.forEach(b => decisiones.push(b));
        await Promise.all(botsIA.map(b => storage.saveDecision(sim.id, n, b.equipo, 'prod_1', b)));
        console.log('[server] bots IA persistidos en sim_decisiones');
        console.log('[server] ' + botsIA.length + ' bot(s) IA agregados R' + n + ' nivel:' + nivelIA2);
      } catch(e) { console.error('[server] Error bots IA:', e.message); }
    }
    console.log(`[server] Ejecutando simulación R${n} con ${decisiones.length} equipos`);

    try {
      const result = ejecutarSimulador(decisiones, simCfg);

      rondaActualizada.estado      = 'simulated';
      rondaActualizada.ejecutadaAt = new Date().toISOString();
      rondaActualizada.mercadoSegmentos = result.mercadoSegmentos;
      rondaActualizada.atractivoEquipos = result.atractivoEquipos;
      rondaActualizada.dashboard        = result.dashboard;
      rondaActualizada.empresas         = result.empresas;
      rondaActualizada.shock            = shock;

      if (!rondaActualizada.resultados) rondaActualizada.resultados = {};
      result.resultados.forEach(r => { rondaActualizada.resultados[r.equipo] = r; });

      // Resultados de la ronda anterior (para Estratégico: elasticidad y comparativa)
      const rondaPreviaData = n > 1 ? await storage.getRonda(sim.id, n - 1) : null;
      const resultadosAnteriores = rondaPreviaData?.resultados || {};

      const reportes = {};
      for (const d of decisiones) {
        reportes[d.equipo] = generarReportes(
          d, result.mercadoSegmentos, result.atractivoEquipos,
          rondaActualizada.resultados, simCfg, resultadosAnteriores
        );
      }
      rondaActualizada.reportes = reportes;

      sim.config.roundState = 'simulated';
      await storage.updateSimulacion(sim.id, { config: sim.config });
      await storage.updateRonda(sim.id, n, {
        estado:           rondaActualizada.estado,
        ejecutadaAt:      rondaActualizada.ejecutadaAt,
        mercadoSegmentos: rondaActualizada.mercadoSegmentos,
        atractivoEquipos: rondaActualizada.atractivoEquipos,
        dashboard:        rondaActualizada.dashboard,
        empresas:         rondaActualizada.empresas,
        resultados:       rondaActualizada.resultados,
        reportes:         rondaActualizada.reportes,
        shock:            rondaActualizada.shock,
      });

      // ── Notificación WebSocket a todos los clientes de esta simulación ──
      const nHumanos = decisiones.filter(d => !d.isBot).length;
      const nBots    = decisiones.filter(d =>  d.isBot).length;
      const topEquipo = [...result.resultados]
        .sort((a, b) => b.utilidadNeta - a.utilidadNeta)[0];

      broadcast(sim.id, 'ronda_calculada', {
        ronda:           n,
        equiposSimulados: decisiones.length,
        equiposHumanos:   nHumanos,
        equiposBots:      nBots,
        dashboard:        result.dashboard,
        lider: topEquipo ? {
          equipo:       topEquipo.equipoNombre || topEquipo.equipo,
          utilidadNeta: topEquipo.utilidadNeta,
          shareReal:    topEquipo.shareReal,
        } : null,
        mensaje: `✅ Ronda ${n} calculada — ${nHumanos} equipo(s) compitieron.`,
      });

      console.log(`[server] Ronda ${n} simulada | sim: ${sim.id} | equipos: ${decisiones.length} (${nBots} bots)`);
      return send(res, 200, {
        ok: true,
        ronda: n,
        equiposSimulados: decisiones.length,
        equiposHumanos:   nHumanos,
        equiposBots:      nBots,
      });
    } catch (e) {
      console.error('[server] Error en motor de simulación:', e.message, e.stack);
      return send(res, 500, { error: e.message });
    }
  }



  if (url === '/admin/recalcular-balance' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });

    const CAPITAL_CONTABLE = sim.parametros?.capitalContable
      ?? sim.parametros?.capitalInicial
      ?? 680000;
    const equipos          = await storage.getEquipos(sim.id);
    const rondas           = await storage.getRondasAll(sim.id);
    const proveedores      = sim.proveedores || [];
    const unidMP           = sim.parametros?.unidadesMPporUnidad ?? 1;

    // FASE 6D-4 — en modo fase0 la apertura R1 sale de Fase 0, NO de params placeholder.
    // El seed antiguo (params.cajaInicial=1, activosFijosIniciales=1) clobbeaba la caja real
    // y disparaba sobregiro/pérdida espurios + capitalContable=2. Homogéneo conserva el seed legacy.
    const _modoRecalc = leerModoInicio(sim);
    const _fase0Map = {};
    if (_modoRecalc === 'fase0') {
      (await storage.getFase0(sim.id)).forEach(r => { _fase0Map[r.equipo_id] = r; });
    }

    // Estado acumulado por empresa — se propaga ronda a ronda
    const estadoEmpresa = {};
    equipos.forEach(eq => {
      const _f0   = _fase0Map[eq.id];
      const _esF0 = _modoRecalc === 'fase0' && _f0;
      estadoEmpresa[eq.id] = {
        resultadoAcumulado:    0,
        // Capital permanente (invariante R1→Rn) — fase0: aporte real de socios; homogéneo: params.
        capitalPermanente:     _esF0 ? Number(_f0.capital_total_otorgado)
                                     : (sim.parametros?.capitalContable ?? sim.parametros?.capitalInicial ?? null),
        // Campos de continuidad financiera para re-simulación
        cajaFinal:             _esF0 ? Number(_f0.caja_inicial)            : (sim.parametros?.cajaInicial ?? 96000),
        cxcFinal:              0,
        deudaFinal:            _esF0 ? Number(_f0.deuda_inicial || 0)      : 0,
        afNetos:               _esF0 ? Number(_f0.activos_fijos_comprados) : (sim.parametros?.activosFijosIniciales ?? 360000),
        activosFijosBrutos:    _esF0 ? Number(_f0.activos_fijos_comprados) : undefined,
        baseDepreciable:       _esF0 ? Number(_f0.activos_fijos_comprados) : undefined,
        baseDepreciableMaquinaria: _esF0 ? Number(_f0.activos_fijos_comprados) : undefined,
        baseDepreciableVehiculos: 0,
        baseDepreciableMuebles: 0,
        baseDepreciableComputo: 0,
        depreciacionAcumulada: 0,
        intangiblesBrutos:     0,
        amortizacionAcumulada: 0,
        brandEquityFinal:      50,
        vendedoresFinales:     sim.parametros?.vendedoresIniciales ?? 2,
        operariosFinales:      sim.parametros?.operariosIniciales ?? 4,
        inventarioFinal:       0,
        stockMPFinal:          0,
        pedidosPendientesResta:[],
      };
    });

    let totalRondas = 0;
    let totalEmpresas = 0;
    const errores = [];
    let nuevoResObjAnterior = {};  // resultados recalculados de la ronda anterior

    // ── Procesar cada ronda en orden cronológico ──────────────────────────
    // IMPORTANTE: usar getRonda() individual (no getRondasAll) porque incluye
    // las decisiones completas (multiproducto + campos propagados)
    for (const rondaBase of rondas) {
      const n = rondaBase.numero;

      // Siempre usar getRonda() para obtener las decisiones más recientes
      // (evita usar decisiones antiguas del JSONB cuando hay duplicados)
      const ronda = await storage.getRonda(sim.id, n);
      if (!ronda) {
        console.log(`[recalc] R${n}: no encontrada — omitida`);
        continue;
      }

      const resObj = ronda.resultados?.resultados || ronda.resultados || {};
      if (!Object.keys(resObj).length) {
        console.log(`[recalc] R${n}: sin resultados — omitida`);
        continue;
      }

      // ── Sanitizar decisiones extremas ──────────────────────────────────
      // Evita que una decisión extrema (ej: 6868 operarios) falle todo el recálculo.
      // Los límites son pedagógicamente imposibles de alcanzar en condiciones normales.
      const _capMax = sim.parametros?.capacidadMaxProduccion || 1500;
      function sanitizarDecision(d) {
        if (!d) return d;
        const s = { ...d };
        if ((s.contratarOperarios || 0) > 100)  { console.warn(`[recalc] sanitize equipo=${d.equipoNombre}: contratarOperarios ${s.contratarOperarios}→100`); s.contratarOperarios = 100; }
        if ((s.despedirOperarios  || 0) > 100)  { s.despedirOperarios  = 100; }
        if ((s.produccion         || 0) > _capMax) { s.produccion = _capMax; }
        if ((s.precioVenta || 0) > 0 && (s.precioVenta || 0) < 10) { s.precioVenta = 10; }
        if (Array.isArray(s.productos)) {
          s.productos = s.productos.map(p => ({
            ...p,
            contratarOperarios: Math.min(p.contratarOperarios || 0, 100),
            despedirOperarios:  Math.min(p.despedirOperarios  || 0, 100),
            produccion:         Math.min(p.produccion         || 0, _capMax),
          }));
        }
        return s;
      }

      // Construir decisiones re-propagadas: tomar las decisiones originales
      // y reemplazar solo los campos financieros de continuidad con el estado real
      const decisionesOriginales = ronda.decisiones || {};
      const decisiones = [];

      for (const eq of equipos) {
        const decOrigRaw = decisionesOriginales[eq.id];
        if (!decOrigRaw) continue;
        const decOrig = sanitizarDecision(decOrigRaw);

        const estado = estadoEmpresa[eq.id] || {};

        // Campos de decisión originales (precio, producción, marketing, etc.) se conservan
        // Solo se reemplazan los campos de continuidad financiera
        const decRepropagada = {
          ...decOrig,
          // FASE 6D-4 — capital PERMANENTE del equipo (no es continuidad financiera; es invariante).
          // Se inyecta para que el motor lo lea como capitalContable; fallback a la decisión original.
          ...(((estado.capitalPermanente ?? decOrig.capitalInicial) != null)
            ? { capitalInicial: Number(estado.capitalPermanente ?? decOrig.capitalInicial) } : {}),
          // ── Continuidad financiera desde resultados reales ──
          cajaInicial:                Math.max(0, estado.cajaFinal ?? 0),
          cxcInicial:                 Math.max(0, estado.cxcFinal ?? 0),
          deudaInicial:               Math.max(0, estado.deudaFinal ?? 0),
          activosFijosIniciales:      Math.max(0, estado.afNetos ?? 78000),
          brandEquityInicial:         estado.brandEquityFinal ?? 50,
          vendedoresIniciales:        Math.max(0, estado.vendedoresFinales ?? 0),
          operariosIniciales:         Math.max(0, estado.operariosFinales ?? 0),
          capacidadMaxProduccion:     estado.capacidadMaxProduccion ?? decOrig.capacidadMaxProduccion ?? sim.parametros?.capacidadMaxProduccion,
          inventarioInicial:          Math.max(0, estado.inventarioFinal ?? 0),
          stockMPInicial:             Math.max(0, estado.stockMPFinal ?? 0),
          pedidosPendientes:          estado.pedidosPendientesResta ?? [],
          resultadoAcumuladoAnterior: estado.resultadoAcumulado ?? 0,
          saldoIUEcompensable:        Math.max(0, estado.saldoIUEfinal ?? 0),  // FASE 4
          ivaAPagarAnterior:          Math.max(0, estado.ivaAPagar         ?? 0),  // IVA diferido
          ivaSaldoAFavorAnterior:     Math.max(0, estado.ivaSaldoAFavor    ?? 0),  // crédito fiscal acumulado
          // FASE 6C — PP&E (fase0): arrastrar bruto/base/acumulada SIN zeroar con estado.afNetos.
          // R1 toma de decOrig (backfill); R2+ del estado acumulado. Homogéneo: ambos undefined → spread vacío.
          ...(((estado.activosFijosBrutos ?? decOrig.activosFijosBrutos) != null) ? {
            activosFijosBrutos:        estado.activosFijosBrutos ?? decOrig.activosFijosBrutos,
            baseDepreciable:           estado.baseDepreciable ?? decOrig.baseDepreciable ?? estado.activosFijosBrutos ?? decOrig.activosFijosBrutos,
            baseDepreciableMaquinaria: estado.baseDepreciableMaquinaria ?? decOrig.baseDepreciableMaquinaria ?? estado.baseDepreciable ?? decOrig.baseDepreciable ?? estado.activosFijosBrutos ?? decOrig.activosFijosBrutos,
            baseDepreciableVehiculos:  estado.baseDepreciableVehiculos ?? decOrig.baseDepreciableVehiculos ?? 0,
            baseDepreciableMuebles:    estado.baseDepreciableMuebles ?? decOrig.baseDepreciableMuebles ?? 0,
            baseDepreciableComputo:    estado.baseDepreciableComputo ?? decOrig.baseDepreciableComputo ?? 0,
            depreciacionAcumulada:     estado.depreciacionAcumulada ?? decOrig.depreciacionAcumulada ?? 0,
          } : {}),
          ...(((estado.intangiblesBrutos ?? decOrig.intangiblesBrutos) != null) ? {
            intangiblesBrutos:         estado.intangiblesBrutos ?? decOrig.intangiblesBrutos,
            amortizacionAcumulada:     estado.amortizacionAcumulada ?? decOrig.amortizacionAcumulada ?? 0,
          } : {}),
          incrementoCapacidadPendiente: 0,
        };

        // Multiproducto: propagar campos financieros a cada producto[]
        // ivaAPagarAnterior y saldoIUE solo en prod_1 (controla la caja)
        // inventarioInicial: cada producto recibe su propio inventario de la ronda anterior
        if (Array.isArray(decRepropagada.productos)) {
          decRepropagada.productos = decRepropagada.productos.map((p, idx) => {
            // Buscar el resultado previo específico de este producto
            // SOLO usar nuevoResObjAnterior (resultados recalculados de R(n-1)).
            // NO usar resObj como fallback: resObj es la ronda ACTUAL, no la anterior.
            // Para R1: nuevoResObjAnterior está vacío → invInicialProd = 0 (correcto).
            const prodId      = p.productoId || ('prod_' + (idx + 1));
            const keyPrevProd = eq.id + '__' + prodId;
            const resPrevProd = nuevoResObjAnterior[keyPrevProd] || null;
            // inventario específico por producto (no el total consolidado)
            const invInicialProd = Math.max(0, resPrevProd?.inventarioFinal ?? 0);

            return {
              ...p,
              cajaInicial:                idx === 0 ? decRepropagada.cajaInicial : 0,
              cxcInicial:                 idx === 0 ? decRepropagada.cxcInicial : 0,
              deudaInicial:               idx === 0 ? decRepropagada.deudaInicial : 0,
              activosFijosIniciales:      idx === 0 ? decRepropagada.activosFijosIniciales : 0,
              activosFijosBrutos:         idx === 0 ? decRepropagada.activosFijosBrutos : undefined,
              baseDepreciable:            idx === 0 ? decRepropagada.baseDepreciable : undefined,
              baseDepreciableMaquinaria:  idx === 0 ? decRepropagada.baseDepreciableMaquinaria : undefined,
              baseDepreciableVehiculos:   idx === 0 ? decRepropagada.baseDepreciableVehiculos : undefined,
              baseDepreciableMuebles:     idx === 0 ? decRepropagada.baseDepreciableMuebles : undefined,
              baseDepreciableComputo:     idx === 0 ? decRepropagada.baseDepreciableComputo : undefined,
              depreciacionAcumulada:      idx === 0 ? decRepropagada.depreciacionAcumulada : undefined,
              intangiblesBrutos:          idx === 0 ? decRepropagada.intangiblesBrutos : undefined,
              amortizacionAcumulada:      idx === 0 ? decRepropagada.amortizacionAcumulada : undefined,
              brandEquityInicial:         decRepropagada.brandEquityInicial,
              vendedoresIniciales:        decRepropagada.vendedoresIniciales,
              operariosIniciales:         decRepropagada.operariosIniciales,
              inventarioInicial:          invInicialProd,  // específico por producto ✅
              stockMPInicial:             idx === 0 ? decRepropagada.stockMPInicial : 0,
              pedidosPendientes:          idx === 0 ? decRepropagada.pedidosPendientes : [],
              resultadoAcumuladoAnterior: decRepropagada.resultadoAcumuladoAnterior,
              ivaAPagarAnterior:          idx === 0 ? (decRepropagada.ivaAPagarAnterior ?? 0) : 0,
              saldoIUEcompensable:        decRepropagada.saldoIUEcompensable ?? 0,
            };
          });
        }

        decisiones.push(decRepropagada);
      }
      // ── Agregar bots IA dinámicos desde ronda.decisiones ─────────────
      for (const [botId, botDec] of Object.entries(decisionesOriginales)) {
        if (botId.startsWith('bot_') && botDec) {
          decisiones.push(sanitizarDecision({ ...botDec }));
        }
      }

      if (!decisiones.length) continue;

      // Construir demandaBaseAnteriorMap desde la ronda anterior
      const demandaBaseAnteriorMap = {};
      if (n > 1) {
        const rondaPrevia = rondas.find(r => r.numero === n - 1);
        (rondaPrevia?.mercadoSegmentos || []).forEach(seg => {
          demandaBaseAnteriorMap[seg.nombre] = seg.demandaBase;
        });
      }

      // Usar el shock ya guardado en la ronda (no regenerar)
      const shockRonda = ronda.shock || generarShock(sim.id, n, sim.parametros?.probabilidadShock ?? 0.35, sim.parametros);

      const simCfg = {
        params:             sim.parametros,
        tiposProducto:      sim.tipos_producto,
        canales:            sim.canales,
        segmentos:          sim.segmentos,
        afinidadMatrix:     sim.afinidad_matrix,
        competenciaExterna: sim.competencia_externa,
        demandaBaseAnteriorMap,
        rondaNumero:        n,
        bloquearProduccionR1: (sim.metadata?.modoInicio === 'fase0'),  // lead time maquinaria: R1 sin producción en modo Fase 0
        proveedores:        proveedores,
        shock:              shockRonda,
        equipos,
      };

      try {
        // Re-ejecutar el motor con las decisiones re-propagadas
        const result = ejecutarSimulador(decisiones, simCfg);

        // Construir nuevo resObj con los resultados recalculados
        const nuevoResObj = {};
        result.resultados.forEach(r => { nuevoResObj[r.equipo] = r; });

        // Regenerar reportes de investigación de mercado
        // Para resultadosAnteriores usamos nuevoResObj de la ronda anterior
        // que ya fue guardado en el loop. Si es R1, no hay anteriores.
        const rondaPrevBase = n > 1 ? rondas.find(r => r.numero === n-1) : null;
        const resultadosAnteriores = rondaPrevBase
          ? (rondaPrevBase.resultados?.resultados || rondaPrevBase.resultados || {})
          : {};
        const reportes = {};
        for (const d of decisiones) {
          reportes[d.equipo] = generarReportes(
            d, result.mercadoSegmentos, result.atractivoEquipos,
            nuevoResObj, simCfg, resultadosAnteriores
          );
        }

        // Actualizar estado propagado para la siguiente ronda
        const porEmpresaRes = {};
        Object.values(nuevoResObj).forEach(r => {
          const eqId = r.equipoOriginal || r.equipo;
          if (!porEmpresaRes[eqId]) porEmpresaRes[eqId] = [];
          porEmpresaRes[eqId].push(r);
        });

        for (const [eqId, prods] of Object.entries(porEmpresaRes)) {
          const p0           = prods[0];
          const utilNeta     = prods.reduce((s,p) => s+(p.utilidadNeta||0), 0);
          const invFinalTotal = prods.reduce((s,p) => s+Math.max(0,p.inventarioFinal||0), 0);
          // Usar resultadoAcumulado del engine (incluye resultadoAcumuladoAnterior correctamente)
          // Esto garantiza que el balance de apertura de la siguiente ronda cuadre
          const resAcumuladoNuevo = p0.resultadoAcumulado ?? ((estadoEmpresa[eqId]?.resultadoAcumulado ?? 0) + utilNeta);

          estadoEmpresa[eqId] = {
            resultadoAcumulado:    resAcumuladoNuevo,
            // FASE 6D-4 — capital permanente es invariante: se preserva a través de la reasignación.
            capitalPermanente:     estadoEmpresa[eqId]?.capitalPermanente ?? null,
            cajaFinal:             p0.cajaFinal    ?? 0,
            cxcFinal:              p0.cxcFinal     ?? 0,
            deudaFinal:            p0.deudaFinal   ?? 0,
            afNetos:               p0.afNetos      ?? 0,
            activosFijosBrutos:    p0.activosFijosBrutos,        // FASE 6C (undefined en homogéneo)
            baseDepreciable:       p0.baseDepreciable,
            baseDepreciableMaquinaria: p0.baseDepreciableMaquinaria,
            baseDepreciableVehiculos:  p0.baseDepreciableVehiculos,
            baseDepreciableMuebles:    p0.baseDepreciableMuebles,
            baseDepreciableComputo:    p0.baseDepreciableComputo,
            depreciacionAcumulada: p0.depreciacionAcumulada,
            intangiblesBrutos:     p0.intangiblesBrutos,
            amortizacionAcumulada: p0.amortizacionAcumulada,
            brandEquityFinal:      p0.brandEquityFinal ?? 50,
            vendedoresFinales:     p0.vendedoresFinales ?? 2,
            operariosFinales:      p0.operariosFinales ?? 4,
            capacidadMaxProduccion: p0.capacidadMaxProduccion,
            inventarioFinal:       invFinalTotal,
            stockMPFinal:          p0.stockMPFinal ?? 0,
            pedidosPendientesResta: p0.pedidosPendientesResta ?? [],
            saldoIUEfinal:         Math.max(0, p0.saldoIUEfinal ?? 0),  // FASE 4
            ivaAPagar:            Math.max(0, p0.ivaAPagar       ?? 0),  // IVA diferido
            ivaSaldoAFavor:       Math.max(0, p0.ivaSaldoAFavor  ?? 0),  // crédito fiscal acumulado
          };
          totalEmpresas++;
        }

        // Guardar referencia a resultados de esta ronda para la siguiente
        nuevoResObjAnterior = nuevoResObj;

        // Guardar resultados recalculados
        await storage.updateRonda(sim.id, n, {
          resultados:       nuevoResObj,
          mercadoSegmentos: result.mercadoSegmentos,
          atractivoEquipos: result.atractivoEquipos,
          dashboard:        result.dashboard,
          empresas:         result.empresas,
          reportes,
          shock:            shockRonda,
        });

        console.log(`[recalc] R${n}: OK — ${Object.keys(nuevoResObj).length} resultados actualizados`);
        totalRondas++;

      } catch (errRonda) {
        console.error(`[recalc] R${n}: ERROR — ${errRonda.message}`);
        errores.push({ ronda: n, error: errRonda.message });
      }
    }

    const msg = `Recálculo completo: ${totalRondas} rondas · ${totalEmpresas} registros`;
    console.log(`[server] ${msg}${errores.length ? ' · ' + errores.length + ' errores' : ''}`);
    return send(res, 200, {
      ok:      errores.length === 0,
      rondas:  totalRondas,
      empresas: totalEmpresas,
      errores,
    });
  }

  if (url === '/admin/ronda/siguiente' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    if (sim.config.roundState !== 'simulated') return send(res, 400, { error: 'Simula primero' });
    const next = sim.config.currentRound + 1;
    if (next > sim.config.totalRounds) return send(res, 400, { error: 'Todas las rondas completadas' });
    sim.config.currentRound = next;
    sim.config.roundState = 'pending';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    await storage.ensureRonda(sim.id, next);
    return send(res, 200, { ok: true, currentRound: next });
  }

  if (url.match(/^\/admin\/resultados\/\d+$/) && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || !['simulated','calculada'].includes(ronda.estado)) return send(res, 404, { error: 'Sin resultados' });
    const equipos = await storage.getEquipos(sim.id);
    const eqMap = {};
    equipos.forEach(eq => { eqMap[eq.id] = eq.nombre; });
    // Consolidar por empresa (equipoOriginal) — multiproducto puede tener N resultados por equipo
    // La BD puede guardar resultados en ronda.resultados o ronda.resultados.resultados
    const resDataObj = ronda.resultados?.resultados || ronda.resultados || {};
    const rawResultados = Object.values(resDataObj).filter(r => r && typeof r === 'object' && r.equipo);
    const porEmpresa = {};
    rawResultados.forEach(r => {
      const eqId = r.equipoOriginal || r.equipo;
      if (!porEmpresa[eqId]) {
        // Primera vez: inicializar con los datos de empresa
        porEmpresa[eqId] = { ...r, productos: [r] };
      } else {
        // Acumular campos variables (ventas, costos, márgenes)
        // Campos ACUMULABLES por producto (variables — se suman)
        // cxcFinal e invFinalValorizado son campos DE EMPRESA — NO sumar
        // (representan saldo al cierre, no acumulables por producto)
        const sumar = [
          // Ventas
          'totalFacturado',       // CRÍTICO: precio facturado consolidado
          'ventasBrutas','ventasNetas','ventasNetasReal','ventasReales',
          'comisiones','comisionesNeto',
          // Costos y márgenes
          'costoVentas','utilidadBruta',
          // Gastos comerciales (líneas del ER)
          'gastoPublicidad','gastoPromocion','gastoEventos','gastoMktRedes','gastoRRPP',
          'gastoCostoVend','costoVendedores',
          // Gastos administrativos y planta (0 en prod_2-5 con modelo mixto → suma = prod_1)
          'gastoAdminFijo','gastoFijoPlanta','depreciacion',
          'costoAlmacenamiento','gastoInnovacionNeto','gastoInvMktNeto',
          // Operarios y producción
          'costoOperarios','gastoOperarios','pagoOperarios',
          'produccion',
          // Totales P&L
          'gastosOp','utilidadNeta','ebit',
          'impuestoIT','impuestoIUE','totalImpuestos',
          // Caja
          'pagoProduccion','pagoMP','pagoMktTotal','totalPagos','cobrosContado',
          'ingresoPrestamo','publicidad',
          // IVA
          'ivaDebito','ivaCredito',
          // Inventarios y otros
          'inventarioFinal','invFinalValorizado',
          'roiMarketing','demandaAsignada','demandaFormal',
        ];
        // cxcFinal e invFinalValorizado: usar del primer producto (ya en ...r inicial)
        sumar.forEach(k => {
          porEmpresa[eqId][k] = (porEmpresa[eqId][k] || 0) + (r[k] || 0);
        });
        // ivaAPagar: valor de empresa — viene de prod_1 (no sumar)
        porEmpresa[eqId].ivaAPagar           = porEmpresa[eqId].ivaAPagar;
        porEmpresa[eqId].totalPasivos        = porEmpresa[eqId].totalPasivos;
        porEmpresa[eqId].resultadoAcumulado  = porEmpresa[eqId].resultadoAcumulado;
        porEmpresa[eqId].pagoIVAPeriodoAnterior = porEmpresa[eqId].pagoIVAPeriodoAnterior;
        porEmpresa[eqId].compensacionIT      = porEmpresa[eqId].compensacionIT;
        porEmpresa[eqId].ITefectivoCaja      = porEmpresa[eqId].ITefectivoCaja;
        porEmpresa[eqId].saldoIUEfinal       = porEmpresa[eqId].saldoIUEfinal;
        // totalFacturado = ventasBrutas + ivaDebito (siempre consistente tras sumar)
        porEmpresa[eqId].totalFacturado      = (porEmpresa[eqId].ventasBrutas||0) + (porEmpresa[eqId].ivaDebito||0);
        porEmpresa[eqId].productos.push(r);
      }
    });

    // Calcular shareReal total por empresa (suma de shares de todos sus productos)
    Object.values(porEmpresa).forEach(e => {
      if (e.productos.length > 1) {
        e.shareReal = e.productos.reduce((s,p) => s + (p.shareReal||0), 0);
        e.producto  = 'Multiproducto (' + e.productos.length + ')';
        e.segmento  = [...new Set(e.productos.map(p => p.segmento||'—'))].join(', ');
      }
    });

    const resultados = Object.values(porEmpresa).map(r => ({
      ...r,
      equipoNombre: resolveNombre(r, eqMap),
      alertaCaja:   (r.cajaFinal ?? 0) < 0 ? 'ALERTA' : 'OK',
      segmento:     r.segmento || r.segmentoObjetivo || '—',
    }));

    // Etapa 3.5: resumen fiscal agregado del período
    const dashboardFiscal = {
      totalIT:          resultados.reduce((s, r) => s + (r.impuestoIT  ?? 0), 0),
      totalIVA:         resultados.reduce((s, r) => s + (r.ivaAPagar   ?? 0), 0),
      totalIUE:         resultados.reduce((s, r) => s + (r.impuestoIUE ?? 0), 0),
      totalImpuestos:   resultados.reduce((s, r) => s + (r.totalImpuestos ?? (r.ivaAPagar ?? 0) + (r.impuestoIT ?? 0) + (r.impuestoIUE ?? 0)), 0),
      utilidadBrutaTotal: resultados.reduce((s, r) => s + (r.utilidadBruta ?? 0), 0),
      presionFiscalPct: (() => {
        const ub = resultados.reduce((s, r) => s + (r.utilidadBruta ?? 0), 0);
        const ti = resultados.reduce((s, r) => s + (r.totalImpuestos ?? 0), 0);
        return ub > 0 ? Math.round(ti / ub * 10000) / 100 : 0;
      })(),
      porEquipo: resultados.map(r => ({
        equipoNombre:   r.equipoNombre,
        impuestoIT:     r.impuestoIT     ?? 0,
        ivaAPagar:      r.ivaAPagar      ?? 0,
        impuestoIUE:    r.impuestoIUE    ?? 0,
        totalImpuestos: r.totalImpuestos ?? ((r.ivaAPagar??0)+(r.impuestoIT??0)+(r.impuestoIUE??0)),
        nProductos:     r.productos?.length ?? 1,
      })),
    };

    // Si la ronda es histórica (sin shock guardado), calcularlo determinísticamente
    const probShockAdmin = sim.parametros.probabilidadShock ?? 0.35;
    const shockFinal = ronda.shock || generarShock(sim.id, n, probShockAdmin, sim.parametros);
    return send(res, 200, { ronda: n, estado: ronda.estado, ejecutadaAt: ronda.ejecutadaAt,
      resultados, mercadoSegmentos: ronda.mercadoSegmentos, dashboard: ronda.dashboard,
      dashboardFiscal, shock: shockFinal });  // Etapa 3.5
  }

  if (url === '/admin/historial' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const hist = [];
    for (let i = 1; i <= sim.config.currentRound; i++) {
      const r = await storage.getRonda(sim.id, i);
      if (!r) continue;
      const equipos = await storage.getEquipos(sim.id);
      hist.push({ ronda:i, estado:r.estado, ejecutadaAt:r.ejecutadaAt,
        enviados: (() => {
              const ids = new Set();
              Object.keys(r.decisiones||{}).forEach(k => {
                if (r.decisiones[k]?.submitted) {
                  const eq = equipos.find(e => k.startsWith(e.id) || k===e.id);
                  if (eq) ids.add(eq.id);
                }
              });
              return ids.size;
            })(), total: equipos.length });
    }
      return send(res, 200, hist);

  // /admin/rondas — formato extendido para inventarios
  if (url === '/admin/rondas' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulacion' });
    const rondas = [];
    for (let i = 1; i <= sim.config.currentRound; i++) {
      const r = await storage.getRonda(sim.id, i);
      if (!r) continue;
      rondas.push({
        numero:      i,
        estado:      r.estado,
        ejecutadaAt: r.ejecutadaAt,
        resultados:  r.resultados ? true : false,
      });
    }
    return send(res, 200, { rondas });
  }
  }

  // ─── ADMIN — Backup ───────────────────────────────────────────
  if ((url === '/admin/backup' && method === 'GET') ||
      (url.startsWith('/admin/backup/') && method === 'GET')) {
    if (needAdmin()) return;
    const simIdParam = url.startsWith('/admin/backup/') ? url.slice('/admin/backup/'.length) : null;
    const targetSim = simIdParam ? await storage.getSimulacion(simIdParam) : sim;
    if (!targetSim) return send(res, 404, { error: 'Simulación no encontrada' });
    try {
      const equipos  = await storage.getEquipos(targetSim.id);
      const usuarios = await storage.listUsers();
      const rondas = [], decisiones = [], resultados = [];
      for (let i = 1; i <= (targetSim.config?.currentRound ?? 1); i++) {
        const r = await storage.getRonda(targetSim.id, i);
        if (!r) continue;
        rondas.push({ numero: i, estado: r.estado, ejecutadaAt: r.ejecutadaAt });
        if (r.decisiones) Object.entries(r.decisiones).forEach(([key, dec]) => {
          decisiones.push({ ronda_numero: i, equipo_key: key, decisiones: dec });
        });
        if (r.resultados) Object.entries(r.resultados).forEach(([equipoId, res]) => {
          resultados.push({ ronda_numero: i, equipo_id: equipoId, resultados: res });
        });
      }
      const backup = {
        _meta: {
          version: 'SimNego v3.2', simulacion: targetSim.nombre || targetSim.id,
          sim_id: targetSim.id, fecha: new Date().toISOString(),
          ronda_actual: targetSim.config?.currentRound ?? 1, equipos_count: equipos.length,
        },
        simulacion: {
          id: targetSim.id, nombre: targetSim.nombre, descripcion: targetSim.descripcion || '',
          codigoAcceso: targetSim.codigo_acceso || '', estado: targetSim.estado || 'active',
          creadaAt: targetSim.creada_at || new Date().toISOString(),
          config: targetSim.config || {}, parametros: targetSim.parametros || {},
          tiposProducto: targetSim.tipos_producto || {}, canales: targetSim.canales || {},
          segmentos: targetSim.segmentos || [], afinidadMatrix: targetSim.afinidad_matrix || {},
          competenciaExterna: targetSim.competencia_externa || [],
        },
        equipos, rondas, decisiones, resultados,
        usuarios: usuarios.map(u => ({ id: u.id, username: u.username, role: u.role, sim_id: u.sim_id })),
      };
      const json = JSON.stringify(backup, null, 2);
      const filename = `backup_simnego_${new Date().toISOString().slice(0,10)}_R${targetSim.config?.currentRound ?? 1}.json`;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': Buffer.byteLength(json),
      });
      res.end(json);
      console.log(`[backup] ${filename} — ${(json.length/1024).toFixed(1)} KB`);
    } catch(e) {
      console.error('[backup] ERROR:', e.message);
      return send(res, 500, { error: 'Error generando backup: ' + e.message });
    }
  }

  // ─── ADMIN — Restaurar backup ─────────────────────────────────
  if (url === '/admin/restaurar' && method === 'POST') {
    if (needAdmin()) return;
    try {
      const { backup, modo, confirmar } = body;
      if (!backup?._meta || !backup?.simulacion) return send(res, 400, { error: 'Backup inválido' });
      if (!backup._meta.version?.includes('SimNego')) return send(res, 400, { error: 'Versión no reconocida' });
      if (!['nueva', 'sobrescribir'].includes(modo)) return send(res, 400, { error: 'Modo inválido' });
      if (modo === 'sobrescribir' && !confirmar) return send(res, 400, { error: 'Requiere confirmar: true' });
      const ownerId = session.userId;
      let simId;
      let reporte = { equipos: 0, rondas: 0, decisiones: 0, resultados: 0 };
      const bsim = backup.simulacion;
      const buildSimData = (id, nombre) => ({
        id, nombre,
        descripcion:        bsim.descripcion        || '',
        codigoAcceso:       storage.genCodigo(),
        estado:             bsim.estado             || 'active',
        creadaAt:           new Date().toISOString(),
        config:             bsim.config             || {},
        parametros:         bsim.parametros         || {},
        tiposProducto:      bsim.tiposProducto      || bsim.tipos_producto      || {},
        canales:            bsim.canales            || {},
        segmentos:          bsim.segmentos          || [],
        afinidadMatrix:     bsim.afinidadMatrix     || bsim.afinidad_matrix     || {},
        competenciaExterna: bsim.competenciaExterna || bsim.competencia_externa || [],
        rondas: {}, users: [],
      });
      if (modo === 'nueva') {
        simId = storage.genSimId();
        await storage.createSimulacion(ownerId, buildSimData(simId, bsim.nombre.replace(/\s*\(restaurado[^)]*\)/g, '').trim() + ' (restaurado ' + new Date().toLocaleDateString('es-BO') + ')'));
      } else {
        simId = bsim.id;
        const existing = await storage.getSimulacion(simId, ownerId);
        if (!existing) {
          await storage.createSimulacion(ownerId, buildSimData(simId, bsim.nombre));
        } else {
          await storage.updateSimulacion(simId, { nombre: bsim.nombre, config: bsim.config, parametros: bsim.parametros, users: [] }, ownerId);
        }
        await pool.query('DELETE FROM sim_rondas     WHERE simulacion_id = $1', [simId]);
        await pool.query('DELETE FROM sim_decisiones WHERE simulacion_id = $1', [simId]);
      }
      if (Array.isArray(backup.equipos)) {
        for (const eq of backup.equipos) {
          try {
            const equipo = { ...eq, id: modo === 'nueva' ? eq.id.replace(bsim.id, simId) : eq.id };
            await storage.addEquipo(simId, equipo, ownerId); reporte.equipos++;
          } catch(e) { console.warn(`[restaurar] Equipo ${eq.nombre}: ${e.message}`); }
        }
      }
      if (Array.isArray(backup.rondas)) {
        for (const r of backup.rondas) {
          try {
            await storage.ensureRonda(simId, r.numero, ownerId);
            const resultadosRonda = {};
            (backup.resultados || []).filter(res => res.ronda_numero === r.numero).forEach(res => {
              const eqId = modo === 'nueva' ? res.equipo_id.replace(bsim.id, simId) : res.equipo_id;
              resultadosRonda[eqId] = res.resultados;
            });
            await storage.updateRonda(simId, r.numero, { estado: r.estado, ejecutadaAt: r.ejecutadaAt, resultados: resultadosRonda }, ownerId);
            reporte.rondas++;
          } catch(e) { console.warn(`[restaurar] Ronda ${r.numero}: ${e.message}`); }
        }
      }
      if (Array.isArray(backup.decisiones)) {
        for (const dec of backup.decisiones) {
          try {
            const equipoId = modo === 'nueva' ? dec.equipo_key.replace(bsim.id, simId) : dec.equipo_key;
            await storage.saveDecision(simId, dec.ronda_numero, equipoId, 'prod_1', dec.decisiones);
            reporte.decisiones++;
          } catch(e) { console.warn(`[restaurar] Decision ${dec.equipo_key}: ${e.message}`); }
        }
      }
      console.log(`[restaurar] ✅ modo=${modo} sim=${simId}`, reporte);
      return send(res, 200, {
        ok: true, modo, simId,
        nombre: modo === 'nueva' ? bsim.nombre.replace(/\s*\(restaurado[^)]*\)/g, '').trim() + ' (restaurado ' + new Date().toLocaleDateString('es-BO') + ')' : bsim.nombre,
        reporte,
      });
    } catch(e) {
      console.error('[restaurar] ERROR:', e.message);
      return send(res, 500, { error: 'Error al restaurar: ' + e.message });
    }
  }

  // ─── ADMIN — Config ───────────────────────────────────────────
  // ── ADMIN — Nivel Competidores IA ──────────────────────────────────────
  if (url === '/admin/config/nivel-ia' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { nivelCompetidoresIA } = body;
    if (!['ninguno','bajo','medio','alto'].includes(nivelCompetidoresIA)) {
      return send(res, 400, { error: 'Nivel inválido' });
    }
    const config = { ...sim.config, nivelCompetidoresIA };
    await storage.updateSimulacion(sim.id, { config }, session.userId);
    console.log(`[admin] nivelCompetidoresIA=${nivelCompetidoresIA} sim=${sim.id}`);
    return send(res, 200, { ok: true, nivelCompetidoresIA });
  }
  if (url === '/admin/config' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const fase0Estado = obtenerEstadoFase0(sim.config);
    return send(res, 200, {
      parametros: sim.parametros,
      tiposProducto: sim.tipos_producto,
      canales: sim.canales,
      segmentos: sim.segmentos,
      afinidadMatrix: sim.afinidad_matrix,
      competenciaExterna: sim.competencia_externa,
      proveedores: sim.proveedores || [],
      mercadoSegmentos: calcularMercadoSegmentos(sim.parametros, sim.segmentos),
      codigoAcceso: sim.codigo_acceso,
      simId: sim.id,
      nivelCompetidoresIA: sim.config?.nivelCompetidoresIA || 'ninguno',
      fase0Activa: sim.config?.fase0Activa ?? false,
      fase0Estado,
      fase0Cerrada: fase0Estado === 'cerrada',
      modoInicio: leerModoInicio(sim),
    });
  }

  if (url === '/admin/parametros' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { parametros } = body;
    if (!parametros) return send(res, 400, { error: 'Datos requeridos' });
    if (parametros.cajaInicial !== undefined && Number(parametros.cajaInicial) <= 0) {
      return send(res, 400, { error: '[R2] cajaInicial debe ser mayor a 0. Con caja = 0, los equipos arrancan con sobregiro desde R1.' });
    }
    const newParams = { ...sim.parametros, ...parametros };
    await storage.updateSimulacion(sim.id, { parametros: newParams });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/tiposproducto' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { tiposProducto } = body;
    if (!tiposProducto) return send(res, 400, { error: 'Datos requeridos' });
    const newTipos = { ...sim.tipos_producto };
    for (const k of Object.keys(newTipos)) {
      if (tiposProducto[k]?.costoBase !== undefined) newTipos[k].costoBase = +tiposProducto[k].costoBase;
    }
    await storage.updateSimulacion(sim.id, { tipos_producto: newTipos });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/canales' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { canales } = body;
    if (!canales) return send(res, 400, { error: 'Datos requeridos' });
    const newCanales = { ...sim.canales };
    for (const k of Object.keys(newCanales)) {
      if (!canales[k]) continue;
      for (const f of ['costoAdicionalUnitario','comisionPct','factorImpactoVendedores','bonoAtractivo']) {
        if (canales[k][f] !== undefined) newCanales[k][f] = +canales[k][f];
      }
    }
    await storage.updateSimulacion(sim.id, { canales: newCanales });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/segmentos' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, sim.segmentos);
  }
  if (url === '/admin/segmentos' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { segmentos } = body;
    if (!Array.isArray(segmentos)) return send(res, 400, { error: 'Array requerido' });
    const newSegmentos = segmentos.map(s => ({
      nombre: String(s.nombre||'').trim(),
      demandaBase: +s.demandaBase,
      pctContrabando: +s.pctContrabando,
      indiceExterno: +s.indiceExterno,
      tendencia: String(s.tendencia||''),
      descripcion: String(s.descripcion||''),
    }));
    await storage.updateSimulacion(sim.id, { segmentos: newSegmentos });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/afinidad' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, sim.afinidad_matrix);
  }
  if (url === '/admin/afinidad' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { afinidadMatrix } = body;
    if (!afinidadMatrix) return send(res, 400, { error: 'Datos requeridos' });
    const newAfinidad = { ...sim.afinidad_matrix };
    for (const prod of Object.keys(newAfinidad)) {
      if (Array.isArray(afinidadMatrix[prod])) newAfinidad[prod] = afinidadMatrix[prod].map(v => +v);
    }
    await storage.updateSimulacion(sim.id, { afinidad_matrix: newAfinidad });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/competencia' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, sim.competencia_externa);
  }
  if (url === '/admin/competencia' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { competencia } = body;
    if (!Array.isArray(competencia)) return send(res, 400, { error: 'Array requerido' });
    const newCompetencia = competencia.map(c => ({
      segmento: String(c.segmento||''),
      nombre: String(c.nombre||''),
      precio: +c.precio,
      calidad: +c.calidad,
      marketing: +c.marketing,
      participacionRef: +c.participacionRef,
    }));
    await storage.updateSimulacion(sim.id, { competencia_externa: newCompetencia });
    return send(res, 200, { ok: true });
  }

  // ─── EQUIPO — Decisiones ──────────────────────────────────────
  if (url === '/api/decisiones' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const n = sim.config.currentRound;
    let ronda = await storage.getRonda(sim.id, n);
    if (!ronda) {
      ronda = await storage.ensureRonda(sim.id, n);
    }
    if (!ronda.decisiones) ronda.decisiones = {};
    let actualizarDecision = false;
    if (!ronda.decisiones[equipoId]) {
      const equipos = await storage.getEquipos(sim.id);
      const eq = equipos.find(e => e.id === equipoId);
      ronda.decisiones[equipoId] = storage.defaultDecision(equipoId, eq?.nombre||equipoId, sim.parametros);
      actualizarDecision = true;
    }
    const fase0 = await storage.getFase0Equipo(sim.id, equipoId);
    let decision = ronda.decisiones[equipoId];
    const decisionHidratada = hidratarEstadoInicialR1(
      decision, sim.parametros, fase0, leerModoInicio(sim), n
    );
    if (decisionHidratada !== decision) {
      decision = decisionHidratada;
      ronda.decisiones[equipoId] = decision;
      actualizarDecision = true;
    }
    if (actualizarDecision) {
      await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });
    }
    const cfg = {
      params: sim.parametros,
      tiposProducto: sim.tipos_producto,
      canales: sim.canales,
      segmentos: sim.segmentos,
      afinidadMatrix: sim.afinidad_matrix,
      competenciaExterna: sim.competencia_externa
    };
    return send(res, 200, {
      ronda: n,
      roundState: sim.config.roundState,
      decision,
      referencia: {
        segmentos: cfg.segmentos,
        tiposProducto: Object.keys(cfg.tiposProducto).map(k => ({ nombre:k, costoBase: cfg.tiposProducto[k].costoBase })),
        canales: Object.keys(cfg.canales).map(k => ({ nombre:k, ...cfg.canales[k] })),
        parametros: {
          costoInvestigacionBasica: cfg.params.costoInvestigacionBasica,
          costoInvestigacionPremium: cfg.params.costoInvestigacionPremium,
          costoInvestigacionEstrategico: cfg.params.costoInvestigacionEstrategico || 20000,
          costoContratacionVendedor: cfg.params.costoContratacionVendedor,
          costoDespidoVendedor: cfg.params.costoDespidoVendedor,
          sueldoTrimestralVendedor: cfg.params.sueldoTrimestralVendedor,
          gastoAdminFijo: cfg.params.gastoAdminFijo,
          gastoFijoPlanta: cfg.params.gastoFijoPlanta,
          capacidadMaxProduccion: cfg.params.capacidadMaxProduccion,
          tasaPrestamoOperativo: cfg.params.tasaPrestamoOperativo,
          tasaPrestamoInversion: cfg.params.tasaPrestamoInversion,
          plazoPrestamoOperativo: cfg.params.plazoPrestamoOperativo,
          plazoPrestamoInversion: cfg.params.plazoPrestamoInversion,
          comisionAperturaPrestamo: cfg.params.comisionAperturaPrestamo,
          // Etapa 3.1: params de materia prima
          unidadesMPporUnidad:         cfg.params.unidadesMPporUnidad    ?? 1,
          costoAlmacenamientoMP:       cfg.params.costoAlmacenamientoMP  ?? 0.05,
          // Etapa 3.2: params de operarios
          operariosIniciales:          cfg.params.operariosIniciales          ?? 4,
          productividadBase:           cfg.params.productividadBase           ?? 440,
          costoOperario:               cfg.params.costoOperario               ?? 3200,
          costoContratacionOperario:   cfg.params.costoContratacionOperario   ?? 800,
          costoDespidoOperario:        cfg.params.costoDespidoOperario        ?? 1200,
          factorCapacitacion:          cfg.params.factorCapacitacion          ?? 0.05,
          // FASE 6F-P2B3 — costos de inversión en activos por ronda (controlados por el profesor)
          costoPorUnidadCapacidadAmpliacion: cfg.params.costoPorUnidadCapacidadAmpliacion ?? 75,
          costoPorUnidadCapacidadMaquinaria: cfg.params.costoPorUnidadCapacidadMaquinaria ?? 125,
          costoVehiculoNivel1:         cfg.params.costoVehiculoNivel1          ?? 35000,
          costoVehiculoNivel2:         cfg.params.costoVehiculoNivel2          ?? 243000,
          costoVehiculoNivel3:         cfg.params.costoVehiculoNivel3          ?? 313000,
          costoMuebles:                cfg.params.costoMuebles                 ?? 16000,
          costoComputo:                cfg.params.costoComputo                 ?? 43650,
          costoPatentes:               cfg.params.costoPatentes                ?? 1400,
        },
        // Etapa 3.1: catálogo de proveedores para la hoja de decisión
        // Fallback: si la sim se creó antes de la Etapa 3.1, leer de la plantilla
        proveedores: (() => {
          // Etapa 3.1: prioridad → sim.proveedores → JSON de industria → []
          if (sim.proveedores?.length) return sim.proveedores;
          try {
            // Buscar el JSON de industria directamente (sin depender de plantillas.js)
            const industria = (sim.config?.industria || 'Calzados_COM540_1_2026_V1')
              .replace(/[^a-zA-Z0-9_-]/g, '');
            // Buscar en industrias/ relativo al directorio de server.js
            const posibles = [
              path.join(__dirname, 'industrias', `${industria}.json`),
              path.join(__dirname, '..', 'industrias', `${industria}.json`),
              path.join(__dirname, `${industria}.json`),
            ];
            for (const ruta of posibles) {
              if (fs.existsSync(ruta)) {
                const raw = JSON.parse(fs.readFileSync(ruta, 'utf8'));
                if (raw.proveedores?.length) return raw.proveedores;
              }
            }
            return [];
          } catch { return []; }
        })(),
      },
    });
  }

  if (url === '/api/decisiones/guardar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    // FIX: normalizar tipoProducto -> producto en el servidor (defensa en profundidad)
    // El formulario legado envía tipoProducto; garantizar que producto siempre exista.
    if (body.decision && !body.decision.producto && body.decision.tipoProducto) {
      body.decision.producto = body.decision.tipoProducto;
    }
    if (body.decision?.productos?.[0] && !body.decision.productos[0].producto) {
      body.decision.productos[0].producto =
        body.decision.producto || body.decision.tipoProducto || '';
    }
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (['simulated','calculada'].includes(ronda.estado)) return send(res, 400, { error: 'Ronda simulada' });
    if (sim.config.roundState === 'pending') return send(res, 400, { error: 'Ronda no habilitada' });
    if (!ronda.decisiones) ronda.decisiones = {};
    const cur = ronda.decisiones[equipoId] || {};
    ronda.decisiones[equipoId] = { ...cur, ...body.decision, equipo: equipoId, submitted: cur.submitted||false };
    await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });
    return send(res, 200, { ok: true });
  }

  if (url === '/api/decisiones/enviar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    // FIX: normalizar tipoProducto -> producto (defensa en profundidad)
    if (body.decision && !body.decision.producto && body.decision.tipoProducto) {
      body.decision.producto = body.decision.tipoProducto;
    }
    if (body.decision?.productos?.[0] && !body.decision.productos[0].producto) {
      body.decision.productos[0].producto =
        body.decision.producto || body.decision.tipoProducto || '';
    }
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (['simulated','calculada'].includes(ronda.estado)) return send(res, 400, { error: 'Ronda simulada' });
    if (sim.config.roundState === 'pending') return send(res, 400, { error: 'Ronda no habilitada' });
    const errorDecision = validarDecisionEstudiante(body.decision);
    if (errorDecision) return send(res, 400, { error: 'Decisión incompleta: ' + errorDecision });
    const cur = ronda.decisiones[equipoId] || {};
    ronda.decisiones[equipoId] = {
      ...cur, ...body.decision, equipo: equipoId, submitted: true,
      submittedAt: new Date().toISOString(), forcedByAdmin: false,
      forcedReason: null, forcedAt: null
    };
    await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });
    return send(res, 200, { ok: true });
  }

  // ── Noticias del Macroentorno (panel estudiante) ───────────────
  if (url === '/api/noticias' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });

    const n          = sim.config.currentRound;
    const roundState = sim.config.roundState;
    const probShock  = sim.parametros.probabilidadShock ?? 0.35;

    // Determinar fase y ronda de referencia
    let rondaRef, fase;
    if (roundState === 'simulated') {
      rondaRef = n; fase = 'post';
    } else if (roundState === 'pending' && n > 1) {
      rondaRef = n - 1; fase = 'post';
    } else if (['open','locked','pre-sim'].includes(roundState)) {
      rondaRef = n; fase = 'pre';
    } else {
      return send(res, 200, { fase:'espera', ronda:n, noticias:[], shock:null });
    }

    const shockGen  = generarShock(sim.id, rondaRef, probShock, sim.parametros);

    if (fase === 'post') {
      // Usar shock guardado en BD (más fiable que regenerar)
      const rondaData = await storage.getRonda(sim.id, rondaRef);
      const shockReal = rondaData?.shock || shockGen;
      const datos     = NOTICIAS_CATALOGO[shockReal.id] || NOTICIAS_CATALOGO['neutral'];
      return send(res, 200, { fase:'post', ronda:rondaRef,
        noticias:[datos.noticia], shock:shockReal });
    } else {
      // Pre-fase: solo señales, sin revelar el shock
      const datos = NOTICIAS_CATALOGO[shockGen.id] || NOTICIAS_CATALOGO['neutral'];
      return send(res, 200, { fase:'pre', ronda:rondaRef,
        noticias:datos.senales, shock:null });
    }
  }

  if (url === '/api/resultados' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const historial = [];
    for (let i = 1; i <= sim.config.currentRound; i++) {
      const r = await storage.getRonda(sim.id, i);
      if (!r || !['simulated','calculada'].includes(r.estado)) continue;
      // FIX multiproducto: retornar TODOS los productos del equipo
      const todosProductos = Object.values(r.resultados).filter(res =>
        res.equipoOriginal === equipoId
        || res.equipo === equipoId
        || (res.equipo || '').startsWith(equipoId)
      );
      if (!todosProductos.length) continue;

      // Si hay 1 producto: compatibilidad legado (resultado = objeto)
      // Si hay N productos: resultado = array + consolidado
      let resultado;
      if (todosProductos.length === 1) {
        resultado = todosProductos[0];
      } else {
        // Construir consolidado sumando campos numéricos de todos los productos
        const consolidado = { ...todosProductos[0] };
        const sumar = ['ventasBrutas','ventasNetas','ventasNetasReal','ventasReales','costoVentas',
          'utilidadBruta','gastosOp','utilidadNeta','ebit',
          'impuestoIT','impuestoIUE','totalImpuestos',
          'pagoProduccion','pagoMktTotal','totalPagos',
          'cobrosContado','inventarioFinal',
          'ingresoPrestamo','publicidad','comisiones','comisionesNeto',
          'gastoCostoVend','gastoOperarios',
          'ivaDebito','ivaCredito',
          'roiMarketing'];
        // cxcFinal e invFinalValorizado: campos de empresa — tomar del primer producto
        sumar.forEach(k => {
          consolidado[k] = todosProductos.reduce((s,p) => s + (p[k]||0), 0);
        });
        // Campos de empresa (tomar del primer producto — pasivos y balance únicos)
        consolidado.cajaFinal      = todosProductos[0].cajaFinal;
        consolidado.deudaFinal     = todosProductos[0].deudaFinal;
        consolidado.patrimonio     = todosProductos[0].patrimonio;
        consolidado.totalActivos   = todosProductos[0].totalActivos;
        consolidado.totalPasivos   = todosProductos[0].totalPasivos;
        consolidado.capitalContable= todosProductos[0].capitalContable;
        consolidado.afNetos        = todosProductos[0].afNetos;
        consolidado.brandEquityFinal = todosProductos[0].brandEquityFinal;
        consolidado.sobregiro      = todosProductos[0].sobregiro;
        // ivaAPagar es pasivo de empresa — NO se suma por producto
        consolidado.ivaAPagar      = todosProductos[0].ivaAPagar;
        consolidado.resultadoAcumulado = todosProductos[0].resultadoAcumulado;
        consolidado.producto       = 'Multiproducto (' + todosProductos.length + ')';
        consolidado.productos      = todosProductos; // array completo para el desglose
        resultado = consolidado;
      }
      historial.push({ ronda:i, ejecutadaAt:r.ejecutadaAt, resultado,
        decision: r.decisiones?.[equipoId]||null, reportes: r.reportes?.[equipoId]||{} });
    }
    return send(res, 200, { currentRound: sim.config.currentRound, roundState: sim.config.roundState, historial });
  }

  if (url.match(/^\/api\/reportes\/\d+$/) && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || !['simulated','calculada'].includes(ronda.estado)) return send(res, 404, { error: 'Sin resultados' });
    return send(res, 200, { ronda: n, reportes: ronda.reportes?.[s.userId]||{} });
  }

  if (url.match(/^\/api\/dashboard\/\d+$/) && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || !['simulated','calculada'].includes(ronda.estado)) return send(res, 404, { error: 'Sin resultados' });
    const resultados = Object.values(ronda.resultados);
    const sorted = resultados.sort((a,b) => b.utilidadNeta - a.utilidadNeta);
    const ranking = sorted.map(r => ({ esYo: r.equipo===s.userId, utilidadNeta:r.utilidadNeta, ventas:r.ventasReales, share:r.shareReal, caja:r.cajaFinal }));
    const ebits = resultados.map(r => r.utilidadNeta);
    return send(res, 200, { ronda: n, ranking, stats: { ebitPromedio: ebits.reduce((a,b)=>a+b,0)/ebits.length, totalEquipos: ebits.length } });
  }

  // ─── EQUIPO — Fase 0 ───
  if (url === '/api/fase0' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const registro = await storage.getFase0Equipo(sim.id, equipoId);
    const fase0Activa = sim.config.fase0Activa ?? false;
    const fase0Params = Object.fromEntries(
      Object.entries(sim.parametros || {})
        .filter(([k]) => k.startsWith('fase0_'))
    );
    fase0Params.sueldosAdministrativosFijos = sim.parametros?.sueldosAdministrativosFijos ?? 0;
    return send(res, 200, { fase0Activa, registro, equipoId, fase0Params,
      modoInicio: leerModoInicio(sim) });
  }

  if (url === '/api/fase0/guardar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const permitidos = ['segmento_1', 'producto_1', 'nivel_af', 'activos_fijos_comprados',
      'capacidad_produccion_base', 'operarios_iniciales', 'costo_operario', 'sueldo_vendedor',
      'credito_operativo_pre_r1', 'plazo_operativo_pre_r1', 'credito_inversion_pre_r1', 'plazo_inversion_pre_r1',
      'costo_fijo_declarado',
      'vehiculo_nivel', 'muebles_comprado', 'equipos_computo_comprado', 'patentes_comprado'];
    const data = {};
    permitidos.forEach(k => { if (body[k] !== undefined) data[k] = body[k]; });
    const actual = await storage.getFase0Equipo(sim.id, equipoId);
    if (actual && (actual.estado === 'enviado' || actual.estado === 'cerrado'))
      return send(res, 400, { error: 'Tu Fase 0 ya fue enviada y no puede modificarse' });
    const errorOperarios = validarOperariosMinimosFase0(
      data.nivel_af ?? actual?.nivel_af,
      data.operarios_iniciales ?? actual?.operarios_iniciales
    );
    if (errorOperarios) return send(res, 400, { error: errorOperarios });
    if (data.costo_fijo_declarado != null) {
      const minimo = Number(actual?.costo_fijo_minimo) || 0;
      if (Number(data.costo_fijo_declarado) < minimo) {
        return send(res, 400, { error: 'El costo fijo declarado (Bs ' + data.costo_fijo_declarado + ') no puede ser menor al mínimo asignado por el docente (Bs ' + minimo + ')' });
      }
    }
    let registro;
    try {
      registro = await storage.upsertFase0(sim.id, equipoId, data);
    } catch (e) {
      return send(res, 500, { ok: false, error: e.message });   // FIX 1: nunca 200 con registro null
    }
    return send(res, 200, { ok: true, registro });
  }

  if (url === '/api/fase0/enviar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const registro = await storage.getFase0Equipo(sim.id, equipoId);
    if (!registro) return send(res, 400, { error: 'Completa tu Fase 0 antes de enviar' });
    if (registro.estado === 'enviado' || registro.estado === 'cerrado')
      return send(res, 400, { error: 'Tu Fase 0 ya fue enviada' });
    const errorOperarios = validarOperariosMinimosFase0(registro.nivel_af, registro.operarios_iniciales);
    if (errorOperarios) return send(res, 400, { error: errorOperarios });
    const requeridos = ['segmento_1', 'producto_1', 'nivel_af', 'operarios_iniciales', 'costo_operario'];
    const faltantes = requeridos.filter(k => registro[k] === null || registro[k] === undefined || registro[k] === '');
    if (faltantes.length)
      return send(res, 400, { error: 'Faltan campos requeridos: ' + faltantes.join(', ') });
    const cajaInicial = Math.max(0,
      Number(registro.caja_inicial_docente || 0)
      + Number(registro.capital_inversion || 0)
      - Number(registro.activos_fijos_comprados || 0)
      + Number(registro.credito_operativo_pre_r1 || 0)
      + Number(registro.credito_inversion_pre_r1 || 0));
    const deudaInicial = Number(registro.credito_operativo_pre_r1 || 0)
      + Number(registro.credito_inversion_pre_r1 || 0);
    await storage.upsertFase0(sim.id, equipoId, {
      estado: 'enviado',
      enviado_at: new Date().toISOString(),
      caja_inicial: cajaInicial,
      deuda_inicial: deudaInicial
    });
    return send(res, 200, { ok: true, estado: 'enviado' });
  }

  return null;
}

// ── Servidor HTTP ─────────────────────────────────────────────
// ══ BLOQUE E — reemplaza el bloque final del servidor HTTP ═══════════════════
// BUSCA: const server = http.createServer(...)  hasta server.listen(...)
// REEMPLAZA con esto:

const server = http.createServer(async (req, res) => {
  const token = getSessionToken(req);
  req.session = token ? await getSessionFromDB(token) : null;
  req._sessionToken = token;

  const url = req.url.split('?')[0];

  // Archivos estáticos
  if (req.method === 'GET' && !url.startsWith('/auth') && !url.startsWith('/admin') && !url.startsWith('/api')) {
    let filePath = url === '/' ? path.join(PUB_DIR, 'index.html') : path.join(PUB_DIR, url);
    if (!filePath.startsWith(PUB_DIR)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    return fs.createReadStream(path.join(PUB_DIR, 'index.html')).pipe(res);
  }

  let body = {};
  try { body = await readBody(req); } catch {}

  try {
    const handled = await route(req, res, body);
    if (handled === null) send(res, 404, { error: 'Ruta no encontrada' });
  } catch(e) {
    console.error('Error en ruta:', e.message);
    send(res, 500, { error: 'Error interno del servidor' });
  }
});

// ── Adjuntar WebSocket al mismo servidor HTTP (mismo puerto, ruta /ws) ────────
initWebSocket(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  🚀  SimNego v3.2 — Fase 2: Bots · WS · Plantillas       ║`);
  console.log(`║  → http://localhost:${PORT}  (admin / admin123)                ║`);
  console.log(`║  → WebSocket: ws://localhost:${PORT}/ws?simId=<id>             ║`);
  console.log(`║  → Industrias: ${listarPlantillas().join(', ')}    ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
});
