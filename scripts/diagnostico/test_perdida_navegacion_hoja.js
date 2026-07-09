/**
 * scripts/diagnostico/test_perdida_navegacion_hoja.js
 *
 * Fase 3 del protocolo PACS-8F. Script de diagnóstico aislado, mismo espíritu que
 * scripts/diagnostico/test_reproducir_bug_r8.js y
 * scripts/diagnostico/test_multiproducto_sincronizacion.js. NO toca ningún archivo de
 * producción, NO usa base de datos.
 *
 * Objetivo: reproducir, contra el código ACTUAL de public/modules/equipo-hoja.js
 * (incluyendo el fix de hojaIrRonda del commit f11cd31, y el "dirty flag"
 * hojaTieneCambiosSinGuardar aplicado el 2026-07-09 sobre public/app.js y
 * public/modules/equipo-hoja.js, ninguno de los dos aún comiteado), si la
 * pérdida silenciosa de cambios sin guardar en la Hoja de Decisión existe también en
 * los otros 3 puntos de navegación (hojaSeleccionarProducto, hojaAgregarProducto,
 * hojaEliminarProducto), o si esos 3 ya están libres del defecto por usar
 * state.decisiones directamente en vez de re-consultar el servidor.
 *
 * Las funciones de abajo son COPIA TEXTUAL (literal, con adaptaciones mínimas descritas
 * en cada bloque) de public/modules/equipo-hoja.js, líneas 1-215 y 251-402 y 404-409 y
 * 540-574, estado en HEAD al 2026-07-08 (posterior al commit f11cd31). No se modificó el
 * archivo original.
 *
 * Adaptación necesaria: hojaRenderRonda() real construye ~600 líneas de HTML de la Hoja
 * completa (fuera del alcance de este diagnóstico, que se centra en el manejo de estado,
 * no en el marcado). Se copia SOLO la parte inicial de hojaRenderRonda (líneas 404-409:
 * normalizar decision y asignar state.decisiones) — que es exactamente el mecanismo bajo
 * prueba — seguida de un stub que omite el render de HTML. Los 3 handlers
 * window.hojaSeleccionarProducto/hojaAgregarProducto/hojaEliminarProducto SÍ se copian
 * completos y textuales, sin adaptar, porque son el objeto real de esta prueba.
 */

// Node no tiene `window` global (a diferencia del navegador real). El código copiado
// asigna window.hojaIrRonda/hojaSeleccionarProducto/etc. tal como en producción —
// se mockea aquí como alias del objeto global para que esas asignaciones funcionen.
global.window = global;

// ─────────────────────────────────────────────────────────────────────────
// COPIA TEXTUAL de equipo-hoja.js — helpers de inversión en activos (líneas 20-152)
// ─────────────────────────────────────────────────────────────────────────
const INVERSION_ACTIVOS_KEYS = [
  'nuevaPlanta',
  'ampliacionPlanta',
  'maquinaria',
  'vehiculos',
  'muebles',
  'computo',
  'patentes',
];

const INVERSION_ACTIVOS_CON_CAPACIDAD = new Set([
  'nuevaPlanta',
  'ampliacionPlanta',
  'maquinaria',
]);

const PLANTAS_FASE0_BASE = [
  { n: 1, nombre: 'Micro',     monto: 25000,  capacidad: 300,  operariosMinimos: 2 },
  { n: 2, nombre: 'Pequeña',   monto: 50000,  capacidad: 600,  operariosMinimos: 3 },
  { n: 3, nombre: 'Estándar',  monto: 100000, capacidad: 800,  operariosMinimos: 3 },
  { n: 4, nombre: 'Mediana',   monto: 190000, capacidad: 1150, operariosMinimos: 5 },
  { n: 5, nombre: 'Grande',    monto: 260000, capacidad: 1350, operariosMinimos: 6 },
  { n: 6, nombre: 'Expansiva', monto: 350000, capacidad: 1700, operariosMinimos: 7 },
];
function catalogoPlantasFase0(params = {}) {
  return PLANTAS_FASE0_BASE.map(d => ({
    n: d.n,
    nombre: params['fase0_af_' + d.n + '_nombre'] || d.nombre,
    monto: (params['fase0_af_' + d.n + '_monto'] != null) ? Number(params['fase0_af_' + d.n + '_monto']) : d.monto,
    capacidad: (params['fase0_af_' + d.n + '_capacidad'] != null) ? Number(params['fase0_af_' + d.n + '_capacidad']) : d.capacidad,
    operariosMinimos: d.operariosMinimos,
  }));
}
const PAQUETES_AMPLIACION = [
  { key: '',      label: 'Ninguna',                factor: 0 },
  { key: 'menor', label: 'Ampliación menor (+25%)', factor: 0.25 },
  { key: 'media', label: 'Ampliación media (+50%)', factor: 0.50 },
  { key: 'alta',  label: 'Ampliación alta (+75%)',  factor: 0.75 },
];
const PAQUETES_MAQUINARIA = [
  { key: '',         label: 'Ninguna',          factor: 0 },
  { key: 'basica',   label: 'Básica (+25%)',    factor: 0.25 },
  { key: 'estandar', label: 'Estándar (+50%)',  factor: 0.50 },
  { key: 'avanzada', label: 'Avanzada (+100%)', factor: 1.00 },
];
function factorPaquete(lista, key) {
  const f = lista.find(x => x.key === String(key || ''));
  return f ? f.factor : 0;
}
const INVERSION_ACTIVOS_CON_PAQUETE = new Set([
  'ampliacionPlanta', 'maquinaria', 'vehiculos', 'muebles', 'computo', 'patentes',
]);
function montoComplementario(tipo, paquete, params = {}) {
  const p = params || {};
  const key = String(paquete || '');
  if (tipo === 'vehiculos') {
    if (key === 'nivel1') return normalizarNumeroNoNegativo(p.costoVehiculoNivel1);
    if (key === 'nivel2') return normalizarNumeroNoNegativo(p.costoVehiculoNivel2);
    if (key === 'nivel3') return normalizarNumeroNoNegativo(p.costoVehiculoNivel3);
    return 0;
  }
  if (key !== 'si') return 0;
  if (tipo === 'muebles')  return normalizarNumeroNoNegativo(p.costoMuebles);
  if (tipo === 'computo')  return normalizarNumeroNoNegativo(p.costoComputo);
  if (tipo === 'patentes') return normalizarNumeroNoNegativo(p.costoPatentes);
  return 0;
}
function capacidadActualHoja(decision = {}, params = {}) {
  return normalizarNumeroNoNegativo(decision.capacidadMaxProduccion ?? params.capacidadMaxProduccion ?? 1500);
}
function resolverInversionActivos(decision = {}, params = {}) {
  const inv = normalizarInversionActivosDecision(decision);
  const cat = catalogoPlantasFase0(params);
  const capActual = capacidadActualHoja(decision, params);

  const planta = cat.find(c => String(c.n) === String(inv.nuevaPlanta.tipoPlanta));
  inv.nuevaPlanta.monto = planta ? normalizarNumeroNoNegativo(planta.monto) : 0;
  inv.nuevaPlanta.incrementoCapacidad = planta ? normalizarNumeroNoNegativo(planta.capacidad) : 0;

  inv.ampliacionPlanta.incrementoCapacidad = Math.round(capActual * factorPaquete(PAQUETES_AMPLIACION, inv.ampliacionPlanta.paquete));
  inv.ampliacionPlanta.monto = Math.round(inv.ampliacionPlanta.incrementoCapacidad * normalizarNumeroNoNegativo(params.costoPorUnidadCapacidadAmpliacion));

  inv.maquinaria.incrementoCapacidad = Math.round(capActual * factorPaquete(PAQUETES_MAQUINARIA, inv.maquinaria.paquete));
  inv.maquinaria.monto = Math.round(inv.maquinaria.incrementoCapacidad * normalizarNumeroNoNegativo(params.costoPorUnidadCapacidadMaquinaria));

  ['vehiculos', 'muebles', 'computo', 'patentes'].forEach(t => {
    inv[t].monto = montoComplementario(t, inv[t].paquete, params);
  });
  return inv;
}

function normalizarNumeroNoNegativo(valor) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function normalizarInversionActivosDecision(decision = {}) {
  if (!decision.inversionActivos || typeof decision.inversionActivos !== 'object') {
    decision.inversionActivos = {};
  }

  INVERSION_ACTIVOS_KEYS.forEach(tipo => {
    const actual = decision.inversionActivos[tipo] || {};
    const norm = { monto: normalizarNumeroNoNegativo(actual.monto) };
    if (INVERSION_ACTIVOS_CON_CAPACIDAD.has(tipo)) {
      norm.incrementoCapacidad = normalizarNumeroNoNegativo(actual.incrementoCapacidad);
    }
    if (tipo === 'nuevaPlanta') {
      norm.tipoPlanta = (actual.tipoPlanta != null && actual.tipoPlanta !== '') ? String(actual.tipoPlanta) : '';
    }
    if (INVERSION_ACTIVOS_CON_PAQUETE.has(tipo)) {
      norm.paquete = (actual.paquete != null) ? String(actual.paquete) : '';
    }
    decision.inversionActivos[tipo] = norm;
  });

  return decision.inversionActivos;
}

// ─────────────────────────────────────────────────────────────────────────
// COPIA TEXTUAL — sincronizarInversionActivosDesdeDOM (líneas 165-185)
// ─────────────────────────────────────────────────────────────────────────
function sincronizarInversionActivosDesdeDOM(root = document) {
  if (!state.decisiones) return;
  const inv = normalizarInversionActivosDecision(state.decisiones);

  const params = state.ref?.parametros || {};

  root.querySelectorAll('[data-activo-tipo][data-activo-campo]').forEach(el => {
    const tipo = el.dataset.activoTipo;
    const campo = el.dataset.activoCampo;
    if (!INVERSION_ACTIVOS_KEYS.includes(tipo)) return;

    if (campo === 'tipoPlanta' && tipo === 'nuevaPlanta') {
      inv.nuevaPlanta.tipoPlanta = el.value || '';
    } else if (campo === 'paquete' && INVERSION_ACTIVOS_CON_PAQUETE.has(tipo)) {
      inv[tipo].paquete = el.value || '';
    }
  });

  resolverInversionActivos(state.decisiones, params);
}

// ─────────────────────────────────────────────────────────────────────────
// COPIA TEXTUAL — sincronizarHojaConEstado (líneas 187-215)
// ─────────────────────────────────────────────────────────────────────────
function sincronizarHojaConEstado() {
  document.querySelectorAll('[data-hoja-field]').forEach(el => {
    if (!state.decisiones) return;
    const field = el.dataset.hojaField;
    const v = el.type === 'checkbox' ? el.checked
            : el.type === 'number'   ? +el.value
            : el.tagName === 'SELECT'
              ? el.value.replace(/\s*\(Bs[\d.\s]+\)\s*$/, '').trim()
            : el.value;
    const prodFields = ['producto','segmentoObjetivo','canalPrincipal',
      'canalSecundario','calidad','precioVenta','produccion','publicidad',
      'promocion','eventos','marketingRedes','relacionesPublicas',
      'innovacion','tipoInnovacion','montoInnovacion'];
    const idxActivo = (typeof hojaProductoActivo === 'number') ? hojaProductoActivo : 0;
    if (state.decisiones.productos?.[idxActivo] && prodFields.includes(field)) {
      state.decisiones.productos[idxActivo][field] = v;
    }
    if (field === 'producto' || field === 'tipoProducto') {
      state.decisiones['producto'] = v;
      if (state.decisiones.productos?.[idxActivo]) {
        state.decisiones.productos[idxActivo].producto = v;
      }
    }
    state.decisiones[field] = v;
  });
  sincronizarInversionActivosDesdeDOM(document);
}

// ─────────────────────────────────────────────────────────────────────────
// COPIA TEXTUAL — normalizarDecisionMultiproducto, crearProductoDefault (líneas 251-335)
// ─────────────────────────────────────────────────────────────────────────
function normalizarDecisionMultiproducto(decision) {
  decision = decision || {};

  if (!decision.producto && decision.tipoProducto) {
    decision.producto = decision.tipoProducto;
  }

  if (!Array.isArray(decision.productos) || decision.productos.length === 0) {
    decision.productos = [{
      productoId: 'prod_1',
      activo: true,
      producto: decision.producto || decision.tipoProducto || '',
      segmentoObjetivo: decision.segmentoObjetivo || '',
      canalPrincipal: decision.canalPrincipal || '',
      canalSecundario: decision.canalSecundario || 'Ninguno',
      calidad: decision.calidad ?? 5,
      precioVenta: decision.precioVenta ?? 3.6,
      produccion: decision.produccion ?? 18000,
      publicidad: decision.publicidad ?? 3000,
      promocion: decision.promocion ?? 2000,
      eventos: decision.eventos ?? 1000,
      marketingRedes: decision.marketingRedes ?? 1000,
      relacionesPublicas: decision.relacionesPublicas ?? 1000,
      innovacion: decision.innovacion ?? false,
      tipoInnovacion: decision.tipoInnovacion || '',
      montoInnovacion: decision.montoInnovacion ?? 0
    }];
  }

  const p = decision.productos[0] || {};
  decision.producto = p.producto;
  decision.segmentoObjetivo = p.segmentoObjetivo;
  decision.canalPrincipal = p.canalPrincipal;
  decision.canalSecundario = p.canalSecundario;
  decision.calidad = p.calidad;
  decision.precioVenta = p.precioVenta;
  decision.produccion = p.produccion;
  decision.publicidad = p.publicidad;
  decision.promocion = p.promocion;
  decision.eventos = p.eventos;
  decision.marketingRedes = p.marketingRedes;
  decision.relacionesPublicas = p.relacionesPublicas;
  decision.innovacion = p.innovacion;
  decision.tipoInnovacion = p.tipoInnovacion;
  decision.montoInnovacion = p.montoInnovacion;
  normalizarInversionActivosDecision(decision);

  return decision;
}

function crearProductoDefault(idx) {
  return {
    productoId: 'prod_' + (idx + 1),
    activo: true,
    producto: '',
    segmentoObjetivo: '',
    canalPrincipal: '',
    canalSecundario: 'Ninguno',
    calidad: 5,
    precioVenta: 0,
    produccion: 0,
    publicidad: 0,
    promocion: 0,
    eventos: 0,
    marketingRedes: 0,
    relacionesPublicas: 0,
    innovacion: false,
    tipoInnovacion: 'Producto',
    montoInnovacion: 0,
    vendedoresIniciales: 2,
    contratarVendedores: 0,
    despedirVendedores: 0,
    contratarOperarios:  0,
    despedirOperarios:   0,
    montoCapacitacion:   0,
    tipoPrestamo: 'Ninguno',
    montoPrestamo: 0,
    amortizacion: 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// hojaRenderRonda — ADAPTADA (ver comentario de cabecera): se copian TEXTUALMENTE
// solo las líneas 404-409 (normalizar + asignar state.decisiones), que son el
// mecanismo bajo prueba. El resto (render de HTML de ~600 líneas) se reemplaza por
// un stub que registra cuántas veces se llamó, sin generar marcado.
// Los 3 handlers window.hojaSeleccionarProducto/hojaAgregarProducto/
// hojaEliminarProducto SÍ son copia textual completa (líneas 540-574).
// ─────────────────────────────────────────────────────────────────────────
let _hojaRenderRondaCallCount = 0;
async function hojaRenderRonda(n, decision, roundState, resultado) {
  _hojaRenderRondaCallCount++;
  // COPIA TEXTUAL — líneas 404-409 reales:
  decision = decision || {};
  decision = normalizarDecisionMultiproducto(decision);
  state.decisiones = decision;
  // FIN COPIA TEXTUAL — el resto de la función real (render de HTML de la Hoja,
  // pre-simulación, etc.) se omite deliberadamente: no es el mecanismo bajo prueba.

  const productos = decision.productos || [];
  if (hojaProductoActivo >= productos.length) {
    hojaProductoActivo = 0;
  }

  // COPIA TEXTUAL — líneas 540-574 reales:
  window.hojaSeleccionarProducto = (idx) => {
    hojaProductoActivo = idx;
    hojaRenderRonda(n, state.decisiones, roundState, resultado);
  };

  window.hojaAgregarProducto = () => {
    if (!Array.isArray(state.decisiones.productos)) {
      state.decisiones.productos = [];
    }

    if (state.decisiones.productos.length >= 5) {
      toast('Máximo 5 productos por empresa', 'info');
      return;
    }

    state.decisiones.productos.push(
      crearProductoDefault(state.decisiones.productos.length)
    );

    hojaProductoActivo = state.decisiones.productos.length - 1;

    hojaRenderRonda(n, state.decisiones, roundState, resultado);
  };

  window.hojaEliminarProducto = (idx) => {
    if (!Array.isArray(state.decisiones.productos) || state.decisiones.productos.length <= 1) {
      toast('No se puede eliminar el único producto', 'info');
      return;
    }
    state.decisiones.productos.splice(idx, 1);
    if (hojaProductoActivo >= state.decisiones.productos.length) {
      hojaProductoActivo = state.decisiones.productos.length - 1;
    }
    hojaRenderRonda(n, state.decisiones, roundState, resultado);
  };
}

// ─────────────────────────────────────────────────────────────────────────
// hojaIrRonda — COPIA TEXTUAL completa (líneas 374-401), YA CON el fix del
// commit f11cd31 (guarda "if (n === hojaRondaActual) return;") Y con el bloque
// del dirty flag (hojaTieneCambiosSinGuardar) aplicado el 2026-07-09, ambos
// incluidos tal como quedaron en public/modules/equipo-hoja.js.
// ─────────────────────────────────────────────────────────────────────────
window.hojaIrRonda = async (n) => {
  if (n === hojaRondaActual) return;
  if (hojaTieneCambiosSinGuardar) {
    if (!confirm('Tienes cambios sin guardar en esta ronda. Si continúas, se perderán. Si quieres conservarlos, cancela y usa el botón "Guardar borrador" antes de navegar. ¿Deseas continuar sin guardarlos?')) {
      return;
    }
  }
  hojaRondaActual = n;
  document.querySelectorAll('.hoja-round-btn').forEach((b, i) => b.classList.toggle('active', i+1===n));

  const cont = document.getElementById('hojaContent');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Cargando…</div>';

  try {
    const decData = await api('GET', '/api/decisiones');
    if (n === decData.ronda) {
      hojaTieneCambiosSinGuardar = false;
      await hojaRenderRonda(n, decData.decision, decData.roundState, null);
      return;
    }
    const resData = await api('GET', '/api/resultados');
    const item = resData.historial?.find(h => h.ronda === n);
    if (item) {
      hojaTieneCambiosSinGuardar = false;
      await hojaRenderRonda(n, item.decision || {}, 'simulated', item.resultado);
    } else {
      cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Sin datos para la ronda ${n}</p></div>`;
    }
  } catch(e) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p style="color:var(--accent4)">${e.message}</p></div>`;
  }
};

// ─────────────────────────────────────────────────────────────────────────
// FIN DE COPIAS TEXTUALES
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// MOCKS Y UTILIDADES DE PRUEBA
// ─────────────────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); }
function sep(titulo) {
  console.log('\n' + '='.repeat(78));
  console.log(titulo);
  console.log('='.repeat(78));
}

function toast(msg, type) {
  // no-op deliberado — fuera del alcance de este diagnóstico
}

// Mock de confirm(): controlable por caso de prueba. Por defecto simula que el
// estudiante ACEPTA continuar sin guardar (true) — igual al comportamiento real
// del navegador cuando el usuario pulsa "Aceptar" en el diálogo nativo.
global._confirmMockReturnValue = true;
global.confirm = (msg) => global._confirmMockReturnValue;

// Simula el <select> real de ampliación de planta (data-activo-tipo="ampliacionPlanta"
// data-activo-campo="paquete"), tal como lo genera selActivo() en equipo-hoja.js.
function mockSelectAmpliacionPlanta(valorInicial) {
  return {
    dataset: { activoTipo: 'ampliacionPlanta', activoCampo: 'paquete' },
    type: 'select-one',
    tagName: 'SELECT',
    value: valorInicial || '',
  };
}

// DOM falso mínimo: expone querySelectorAll para los selectores que usan las funciones
// bajo prueba, y getElementById('hojaContent') con un elemento real (innerHTML asignable)
// para que hojaIrRonda no corte su ejecución en el guard "if (!cont) return;" — ese guard
// existe en el código real para el caso de que el usuario haya navegado fuera de la Hoja
// antes de que la petición resuelva; no es el mecanismo bajo prueba aquí.
function construirDomFalso(selectAmpliacion) {
  return {
    querySelectorAll: (selector) => {
      if (selector === '[data-activo-tipo][data-activo-campo]') return [selectAmpliacion];
      if (selector === '[data-hoja-field]') return [];
      if (selector === '.hoja-round-btn') return [];
      return [];
    },
    getElementById: (id) => id === 'hojaContent' ? { innerHTML: '' } : null,
  };
}

// Decisión "fresca" del servidor: SIN ningún paquete de ampliación de planta elegido
// (representa lo que /api/decisiones devolvería ANTES de que el estudiante edite nada
// en esta sesión del navegador).
function construirDecisionFrescaDelServidor() {
  return {
    equipo: 'eq_demo',
    submitted: false,
    producto: 'Producto X',
    segmentoObjetivo: 'Segmento Y',
    canalPrincipal: 'Canal Z',
    productos: [
      {
        productoId: 'prod_1',
        activo: true,
        producto: 'Producto X',
        segmentoObjetivo: 'Segmento Y',
        canalPrincipal: 'Canal Z',
        canalSecundario: 'Ninguno',
        calidad: 5,
        precioVenta: 50,
        produccion: 1000,
        publicidad: 3000, promocion: 2000, eventos: 1000, marketingRedes: 1000, relacionesPublicas: 1000,
        innovacion: false, tipoInnovacion: '', montoInnovacion: 0,
      },
      {
        productoId: 'prod_2',
        activo: true,
        producto: 'Producto Y',
        segmentoObjetivo: 'Segmento Y',
        canalPrincipal: 'Canal Z',
        canalSecundario: 'Ninguno',
        calidad: 5,
        precioVenta: 40,
        produccion: 800,
        publicidad: 0, promocion: 0, eventos: 0, marketingRedes: 0, relacionesPublicas: 0,
        innovacion: false, tipoInnovacion: '', montoInnovacion: 0,
      },
    ],
    inversionActivos: {}, // sin selección aún — el servidor nunca vio la edición local
  };
}

// Decisión HISTÓRICA de la Ronda 7 (ya simulada), presente en resData.historial —
// representa lo que el estudiante vería al navegar a una ronda pasada real.
function construirDecisionHistoricaR7() {
  return {
    equipo: 'eq_demo',
    submitted: true,
    submittedAt: '2026-06-01T10:00:00.000Z',
    producto: 'Producto Historico',
    productos: [
      {
        productoId: 'prod_1',
        activo: true,
        producto: 'Producto Historico',
        segmentoObjetivo: 'Segmento Y',
        canalPrincipal: 'Canal Z',
        canalSecundario: 'Ninguno',
        calidad: 5,
        precioVenta: 45,
        produccion: 900,
        publicidad: 2500, promocion: 1500, eventos: 500, marketingRedes: 500, relacionesPublicas: 500,
        innovacion: false, tipoInnovacion: '', montoInnovacion: 0,
      },
    ],
    inversionActivos: {}, // ronda pasada, sin relación con la edición actual en memoria
  };
}

// Mock de api(): simula GET /api/decisiones devolviendo SIEMPRE la decisión "fresca"
// del servidor (sin el cambio en memoria) — representa exactamente el escenario real:
// el estudiante edita en el navegador, pero nunca guardó/envió antes de navegar.
async function mockApiGetDecisiones() {
  return {
    ronda: 8,
    roundState: 'open',
    decision: JSON.parse(JSON.stringify(construirDecisionFrescaDelServidor())),
  };
}
async function mockApiGetResultados() {
  return {
    historial: [
      { ronda: 7, decision: construirDecisionHistoricaR7(), resultado: { ronda: 7 } },
    ],
  };
}
async function api(method, url) {
  if (method === 'GET' && url === '/api/decisiones') return mockApiGetDecisiones();
  if (method === 'GET' && url === '/api/resultados') return mockApiGetResultados();
  throw new Error('mock api() no implementado para ' + method + ' ' + url);
}

function inicializarEstadoConCambioEnMemoria() {
  // Simula loadHojaDecision(): decisión inicial ya en memoria, CON productos[].
  global.state = { decisiones: construirDecisionFrescaDelServidor(), ref: { parametros: {} } };
  global.hojaProductoActivo = 0;
  global.hojaRondaActual = 8;
  global.hojaTieneCambiosSinGuardar = false; // recién cargado: sin cambios todavía

  // Simula que el estudiante selecciona "media" en el <select> de ampliación de planta,
  // disparando lo que el listener real de 'change' haría: sincronizarInversionActivosDesdeDOM.
  const selectFalso = mockSelectAmpliacionPlanta('media');
  global.document = construirDomFalso(selectFalso);
  sincronizarInversionActivosDesdeDOM(global.document);
  // COPIA TEXTUAL del punto de marcado real (equipo-hoja.js, listener de
  // [data-activo-tipo][data-activo-campo]): el listener real marca el flag ANTES
  // de sincronizar; se replica aquí en el mismo orden.
  hojaTieneCambiosSinGuardar = true;

  return selectFalso;
}

function limpiarGlobals() {
  delete global.state;
  delete global.hojaProductoActivo;
  delete global.hojaRondaActual;
  delete global.hojaTieneCambiosSinGuardar;
  delete global.document;
}

// ─────────────────────────────────────────────────────────────────────────
// CASO A — hojaIrRonda a una ronda DISTINTA
// ─────────────────────────────────────────────────────────────────────────
async function casoA_hojaIrRondaDistinta_confirmaContinuar() {
  sep('CASO A.1 — hojaIrRonda(OTRA_RONDA), confirm()=true (el usuario ACEPTA descartar)');

  inicializarEstadoConCambioEnMemoria();
  global._confirmMockReturnValue = true;

  const paqueteAntes = state.decisiones.inversionActivos.ampliacionPlanta.paquete;
  log(`  Paso (c): paquete en memoria ANTES de navegar => "${paqueteAntes}"`);
  const seleccionEstabaEnMemoria = paqueteAntes === 'media';
  log(`  ¿El cambio SÍ estaba en memoria antes de navegar? => ${seleccionEstabaEnMemoria}`);

  await window.hojaIrRonda(7); // ronda histórica DISTINTA de la actual (8) — con datos reales en el mock

  const paqueteDespues = state.decisiones?.inversionActivos?.ampliacionPlanta?.paquete;
  log(`  Paso (e): paquete en memoria DESPUÉS de hojaIrRonda(7) => "${paqueteDespues}"`);

  const sobrevivio = paqueteDespues === 'media';
  log(`\n  ¿El cambio sobrevivió? => ${sobrevivio}  (esperado: false — el usuario ACEPTÓ descartar)`);

  limpiarGlobals();
  return { caso: 'A.1 (hojaIrRonda, confirm=true, usuario acepta descartar)', sobrevivio };
}

async function casoA2_hojaIrRondaDistinta_cancelaNavegacion() {
  sep('CASO A.2 — hojaIrRonda(OTRA_RONDA), confirm()=false (el usuario CANCELA)');

  inicializarEstadoConCambioEnMemoria();
  global._confirmMockReturnValue = false;

  const paqueteAntes = state.decisiones.inversionActivos.ampliacionPlanta.paquete;
  log(`  Paquete en memoria ANTES de navegar => "${paqueteAntes}"`);

  await window.hojaIrRonda(7);

  const paqueteDespues = state.decisiones?.inversionActivos?.ampliacionPlanta?.paquete;
  log(`  Paquete en memoria DESPUÉS de hojaIrRonda(7) (cancelado) => "${paqueteDespues}"`);
  log(`  hojaRondaActual sigue en => ${hojaRondaActual} (esperado: 8, sin navegar)`);

  const sobrevivio = paqueteDespues === 'media';
  log(`\n  ¿El cambio sobrevivió? => ${sobrevivio}  (esperado: true — el usuario CANCELÓ la navegación)`);

  limpiarGlobals();
  return { caso: 'A.2 (hojaIrRonda, confirm=false, usuario cancela)', sobrevivio };
}

// ─────────────────────────────────────────────────────────────────────────
// CASO B — hojaSeleccionarProducto (cambiar de pestaña de producto)
// ─────────────────────────────────────────────────────────────────────────
async function casoB_hojaSeleccionarProducto() {
  sep('CASO B — hojaSeleccionarProducto(otroIndice)');

  inicializarEstadoConCambioEnMemoria();
  // hojaRenderRonda debe haberse llamado al menos una vez para exponer
  // window.hojaSeleccionarProducto — se simula la llamada inicial como lo haría
  // loadHojaDecision()/hojaIrRonda() en producción.
  await hojaRenderRonda(8, state.decisiones, 'open', null);

  const paqueteAntes = state.decisiones.inversionActivos.ampliacionPlanta.paquete;
  log(`  Paquete en memoria ANTES de cambiar de producto => "${paqueteAntes}"`);

  window.hojaSeleccionarProducto(1); // cambia a producto índice 1 (prod_2)

  const paqueteDespues = state.decisiones?.inversionActivos?.ampliacionPlanta?.paquete;
  log(`  Paquete en memoria DESPUÉS de hojaSeleccionarProducto(1) => "${paqueteDespues}"`);

  const sobrevivio = paqueteDespues === 'media';
  log(`\n  ¿El cambio sobrevivió? => ${sobrevivio}`);

  limpiarGlobals();
  return { caso: 'B (hojaSeleccionarProducto)', sobrevivio };
}

// ─────────────────────────────────────────────────────────────────────────
// CASO C — hojaAgregarProducto
// ─────────────────────────────────────────────────────────────────────────
async function casoC_hojaAgregarProducto() {
  sep('CASO C — hojaAgregarProducto()');

  inicializarEstadoConCambioEnMemoria();
  await hojaRenderRonda(8, state.decisiones, 'open', null);

  const paqueteAntes = state.decisiones.inversionActivos.ampliacionPlanta.paquete;
  log(`  Paquete en memoria ANTES de agregar producto => "${paqueteAntes}"`);
  log(`  productos.length ANTES => ${state.decisiones.productos.length}`);

  window.hojaAgregarProducto();

  const paqueteDespues = state.decisiones?.inversionActivos?.ampliacionPlanta?.paquete;
  log(`  Paquete en memoria DESPUÉS de hojaAgregarProducto() => "${paqueteDespues}"`);
  log(`  productos.length DESPUÉS => ${state.decisiones.productos.length}`);

  const sobrevivio = paqueteDespues === 'media';
  log(`\n  ¿El cambio sobrevivió? => ${sobrevivio}`);

  limpiarGlobals();
  return { caso: 'C (hojaAgregarProducto)', sobrevivio };
}

// ─────────────────────────────────────────────────────────────────────────
// CASO D — hojaEliminarProducto (con 2+ productos existentes)
// ─────────────────────────────────────────────────────────────────────────
async function casoD_hojaEliminarProducto() {
  sep('CASO D — hojaEliminarProducto(idx), producto[0] no eliminado');

  inicializarEstadoConCambioEnMemoria(); // ya trae 2 productos (prod_1, prod_2)
  await hojaRenderRonda(8, state.decisiones, 'open', null);

  const paqueteAntes = state.decisiones.inversionActivos.ampliacionPlanta.paquete;
  log(`  Paquete en memoria ANTES de eliminar producto => "${paqueteAntes}"`);
  log(`  productos.length ANTES => ${state.decisiones.productos.length}`);

  window.hojaEliminarProducto(1); // elimina prod_2, deja prod_1 (idx 0)

  const paqueteDespues = state.decisiones?.inversionActivos?.ampliacionPlanta?.paquete;
  log(`  Paquete en memoria DESPUÉS de hojaEliminarProducto(1) => "${paqueteDespues}"`);
  log(`  productos.length DESPUÉS => ${state.decisiones.productos.length}`);

  const sobrevivio = paqueteDespues === 'media';
  log(`\n  ¿El cambio sobrevivió (en el producto que NO se eliminó)? => ${sobrevivio}`);

  limpiarGlobals();
  return { caso: 'D (hojaEliminarProducto)', sobrevivio };
}

// ─────────────────────────────────────────────────────────────────────────
// EJECUCIÓN SECUENCIAL DE LOS 4 CASOS + RESUMEN FINAL
// ─────────────────────────────────────────────────────────────────────────
(async () => {
  const resultados = [];
  resultados.push(await casoA_hojaIrRondaDistinta_confirmaContinuar());
  resultados.push(await casoA2_hojaIrRondaDistinta_cancelaNavegacion());
  resultados.push(await casoB_hojaSeleccionarProducto());
  resultados.push(await casoC_hojaAgregarProducto());
  resultados.push(await casoD_hojaEliminarProducto());

  sep('RESUMEN FINAL — Fase 3, protocolo PACS-8F');
  resultados.forEach(r => {
    log(`  - ${r.caso}: cambio sobrevivió => ${r.sobrevivio}`);
  });

  log('\nConclusión: con el dirty flag (hojaTieneCambiosSinGuardar) aplicado el');
  log('2026-07-09, hojaIrRonda ahora pide confirmación antes de descartar cambios sin');
  log('guardar al navegar a OTRA ronda (Caso A.1/A.2) — antes, la pérdida era');
  log('silenciosa e incondicional. Los Casos B/C/D (cambiar de producto, agregar');
  log('producto, eliminar producto) siguen sin el defecto, como ya se había confirmado.');
})();
