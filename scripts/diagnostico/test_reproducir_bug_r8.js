/**
 * test_reproducir_bug_r8.js
 *
 * Script de reproducción CONTROLADA y AISLADA del mecanismo de pérdida de
 * datos observado en la Ronda 8. NO toca la base de datos, NO llama a
 * ningún endpoint en vivo, NO importa ni modifica server.js.
 *
 * Las funciones de abajo son COPIA TEXTUAL (literal) de server.js, tomadas
 * el 2026-07-08, para poder ejecutarlas de forma aislada en este script de
 * diagnóstico. No se modificó ni se modificará el original.
 *
 * Fuente exacta copiada (server.js, estado actual en HEAD):
 *   - CAMPOS_CONTINUIDAD_SERVER_OWNED         (líneas ~2877-2884)
 *   - CAMPOS_CONTINUIDAD_PROHIBIDOS_EN_PRODUCTO (líneas ~2896-2901)
 *   - CAMPOS_PRODUCTO_PERMITIDOS              (líneas ~2903-2908)
 *   - CAMPOS_EMPRESA_PERMITIDOS               (líneas ~2910-2916)
 *   - reconstruirDecisionPermitida            (líneas ~3002-3034)
 *   - protegerContinuidadServerOwned          (líneas ~3036-3049)
 *   - validarDecisionEstudiante                (líneas ~418-435)
 *
 * Nota: reconstruirInversionActivosPermitida (usada dentro de
 * reconstruirDecisionPermitida) también se copia porque es una dependencia
 * directa; no es parte del mecanismo bajo prueba pero es necesaria para que
 * el código copiado ejecute sin lanzar excepciones.
 */

// ─────────────────────────────────────────────────────────────────────────
// COPIA TEXTUAL DE server.js — INICIO
// ─────────────────────────────────────────────────────────────────────────

const CAMPOS_CONTINUIDAD_SERVER_OWNED = [
  'cajaInicial', 'cxcInicial', 'deudaInicial', 'activosFijosIniciales',
  'resultadoAcumuladoAnterior', 'stockMPInicial', 'pedidosPendientes',
  'vendedoresIniciales', 'operariosIniciales', 'saldoIUEcompensable',
  'ivaAPagarAnterior', 'ivaSaldoAFavorAnterior',
  'capitalInicial', 'capitalContable',
  'capacidadMaxProduccion',
];

const CAMPOS_CONTINUIDAD_PROHIBIDOS_EN_PRODUCTO = [
  'stockMPInicial', 'pedidosPendientes', 'saldoIUEcompensable',
  'ivaAPagarAnterior', 'ivaSaldoAFavorAnterior',
  'capitalInicial', 'capitalContable',
  'capacidadMaxProduccion',
];

const CAMPOS_PRODUCTO_PERMITIDOS = [
  'producto', 'segmentoObjetivo', 'canalPrincipal', 'canalSecundario',
  'calidad', 'precioVenta', 'produccion',
  'publicidad', 'promocion', 'eventos', 'marketingRedes', 'relacionesPublicas',
  'innovacion', 'tipoInnovacion', 'montoInnovacion',
];

const CAMPOS_EMPRESA_PERMITIDOS = [
  'contratarVendedores', 'despedirVendedores',
  'contratarOperarios', 'despedirOperarios', 'montoCapacitacion',
  'tipoPrestamo', 'montoPrestamo', 'plazoPrestamo', 'amortizacion',
  'tipoInvestigacion',
  'proveedorElegido', 'cantidadMPpedida',
];

const PAQUETES_AMPLIACION_SERVER = [
  { key: '',      factor: 0 },
  { key: 'menor', factor: 0.25 },
  { key: 'media', factor: 0.50 },
  { key: 'alta',  factor: 0.75 },
];
const PAQUETES_MAQUINARIA_SERVER = [
  { key: '',         factor: 0 },
  { key: 'basica',   factor: 0.25 },
  { key: 'estandar', factor: 0.50 },
  { key: 'avanzada', factor: 1.00 },
];
function factorPaqueteServer(lista, key) {
  const f = lista.find(x => x.key === String(key || ''));
  return f ? f.factor : 0;
}
function numNoNegativo(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function montoComplementarioServer(tipo, paquete, params) {
  const p = params || {};
  const key = String(paquete || '');
  if (tipo === 'vehiculos') {
    if (key === 'nivel1') return numNoNegativo(p.costoVehiculoNivel1);
    if (key === 'nivel2') return numNoNegativo(p.costoVehiculoNivel2);
    if (key === 'nivel3') return numNoNegativo(p.costoVehiculoNivel3);
    return 0;
  }
  if (key !== 'si') return 0;
  if (tipo === 'muebles')  return numNoNegativo(p.costoMuebles);
  if (tipo === 'computo')  return numNoNegativo(p.costoComputo);
  if (tipo === 'patentes') return numNoNegativo(p.costoPatentes);
  return 0;
}
// NOTA: catalogoPlantasFase0Server real depende de NIVELES_PLANTA_FASE0
// (importado de ./src/constants en server.js). Para este script aislado,
// usamos un catálogo mínimo suficiente para no lanzar excepciones; no
// afecta el mecanismo bajo prueba (reconstruirDecisionPermitida /
// CAMPOS_PRODUCTO_PERMITIDOS), que es completamente independiente de
// inversionActivos.
function catalogoPlantasFase0Server(params) {
  const p = params || {};
  const NIVELES_PLANTA_FASE0_STUB = [
    { n: 1, nombre: 'Micro', monto: 25000, capacidad: 300 },
  ];
  return NIVELES_PLANTA_FASE0_STUB.map(d => ({
    n: d.n,
    nombre: p['fase0_af_' + d.n + '_nombre'] || d.nombre,
    monto: (p['fase0_af_' + d.n + '_monto'] != null) ? Number(p['fase0_af_' + d.n + '_monto']) : d.monto,
    capacidad: (p['fase0_af_' + d.n + '_capacidad'] != null) ? Number(p['fase0_af_' + d.n + '_capacidad']) : d.capacidad,
  }));
}

function reconstruirInversionActivosPermitida(invCur, invCliente, decisionBase, params) {
  const cli = invCliente || {};
  const p = params || {};
  const capActual = numNoNegativo(decisionBase?.capacidadMaxProduccion ?? p.capacidadMaxProduccion ?? 1500);

  const out = {};

  const tipoPlanta = String(cli.nuevaPlanta?.tipoPlanta ?? '');
  const planta = catalogoPlantasFase0Server(p).find(c => String(c.n) === tipoPlanta);
  out.nuevaPlanta = {
    tipoPlanta,
    monto: planta ? numNoNegativo(planta.monto) : 0,
    incrementoCapacidad: planta ? numNoNegativo(planta.capacidad) : 0,
  };

  const paqueteAmpl = String(cli.ampliacionPlanta?.paquete ?? '');
  const capAmpl = Math.round(capActual * factorPaqueteServer(PAQUETES_AMPLIACION_SERVER, paqueteAmpl));
  out.ampliacionPlanta = {
    paquete: paqueteAmpl,
    incrementoCapacidad: capAmpl,
    monto: Math.round(capAmpl * numNoNegativo(p.costoPorUnidadCapacidadAmpliacion)),
  };

  const paqueteMaq = String(cli.maquinaria?.paquete ?? '');
  const capMaq = Math.round(capActual * factorPaqueteServer(PAQUETES_MAQUINARIA_SERVER, paqueteMaq));
  out.maquinaria = {
    paquete: paqueteMaq,
    incrementoCapacidad: capMaq,
    monto: Math.round(capMaq * numNoNegativo(p.costoPorUnidadCapacidadMaquinaria)),
  };

  ['vehiculos', 'muebles', 'computo', 'patentes'].forEach(tipo => {
    const paquete = String(cli[tipo]?.paquete ?? '');
    out[tipo] = { paquete, monto: montoComplementarioServer(tipo, paquete, p) };
  });

  return out;
}

function reconstruirDecisionPermitida(cur, decisionCliente, params) {
  const d = decisionCliente || {};
  const base = { ...cur };

  CAMPOS_EMPRESA_PERMITIDOS.forEach(campo => {
    if (campo in d) base[campo] = d[campo];
  });

  if ('justificaciones' in d) {
    base.justificaciones = (d.justificaciones && typeof d.justificaciones === 'object' && !Array.isArray(d.justificaciones))
      ? { ...d.justificaciones }
      : (cur.justificaciones || {});
  }

  if (Array.isArray(d.productos)) {
    base.productos = d.productos.map((p, idx) => {
      const curProducto = (Array.isArray(cur.productos) && cur.productos[idx]) || {};
      const prodBase = { ...curProducto };
      CAMPOS_PRODUCTO_PERMITIDOS.forEach(campo => {
        if (campo in (p || {})) prodBase[campo] = p[campo];
      });
      if (curProducto.productoId != null) prodBase.productoId = curProducto.productoId;
      const curInversion = curProducto.inversionActivos || {};
      const cliInversion = p?.inversionActivos || {};
      prodBase.inversionActivos = reconstruirInversionActivosPermitida(
        curInversion, cliInversion, base, params
      );
      return prodBase;
    });
  }

  return base;
}

function protegerContinuidadServerOwned(decisionFusionada, cur) {
  for (const campo of CAMPOS_CONTINUIDAD_SERVER_OWNED) {
    if (campo in cur) decisionFusionada[campo] = cur[campo];
  }
  if (Array.isArray(decisionFusionada.productos)) {
    decisionFusionada.productos.forEach(producto => {
      if (!producto || typeof producto !== 'object') return;
      CAMPOS_CONTINUIDAD_PROHIBIDOS_EN_PRODUCTO.forEach(campo => {
        if (campo in producto) delete producto[campo];
      });
    });
  }
  return decisionFusionada;
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

// ─────────────────────────────────────────────────────────────────────────
// COPIA TEXTUAL DE server.js — FIN
// ─────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────
// UTILIDADES DE PRUEBA
// ─────────────────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); }
function sep(titulo) {
  console.log('\n' + '='.repeat(78));
  console.log(titulo);
  console.log('='.repeat(78));
}

const PARAMS_EJEMPLO = {
  cajaInicial: 500000,
  capitalInicial: 580000,
  activosFijosIniciales: 80000,
  vendedoresIniciales: 3,
  operariosIniciales: 5,
};

// `cur`: estado guardado en servidor al activar Ronda 8 — producto en
// valores por defecto/cero, tal como lo construye storage.defaultDecision().
function construirCurR8() {
  return {
    equipo: 'eq_demo',
    submitted: false,
    cajaInicial: 412300,
    cxcInicial: 0,
    deudaInicial: 0,
    activosFijosIniciales: 80000,
    resultadoAcumuladoAnterior: 15200,
    stockMPInicial: 1200,
    pedidosPendientes: 0,
    vendedoresIniciales: 3,
    operariosIniciales: 5,
    saldoIUEcompensable: 0,
    ivaAPagarAnterior: 0,
    ivaSaldoAFavorAnterior: 0,
    capitalInicial: 580000,
    capitalContable: 592300,
    capacidadMaxProduccion: 2200,
    contratarVendedores: 0,
    despedirVendedores: 0,
    contratarOperarios: 0,
    despedirOperarios: 0,
    montoCapacitacion: 0,
    tipoPrestamo: '',
    montoPrestamo: 0,
    plazoPrestamo: 0,
    amortizacion: 0,
    tipoInvestigacion: '',
    proveedorElegido: '',
    cantidadMPpedida: 0,
    justificaciones: {},
    productos: [
      {
        productoId: 'prod_1',
        activo: true,
        producto: '',
        segmentoObjetivo: '',
        canalPrincipal: '',
        canalSecundario: 'Ninguno',
        calidad: 5,
        precioVenta: 3.6,
        produccion: 18000,
        publicidad: 3000,
        promocion: 2000,
        eventos: 1000,
        marketingRedes: 1000,
        relacionesPublicas: 1000,
        innovacion: false,
        tipoInnovacion: '',
        montoInnovacion: 0,
        inversionActivos: {},
      },
    ],
  };
}

// `body.decision`: forma real construida por sincronizarHojaConEstado() +
// normalizarDecisionMultiproducto() al hacer clic en "Enviar", con valores
// válidos que pasan validarDecisionEstudiante.
function construirDecisionClienteValida() {
  return {
    producto: 'Producto X',
    segmentoObjetivo: 'Segmento Y',
    canalPrincipal: 'Canal Z',
    operariosIniciales: 5,
    contratarVendedores: 1,
    despedirVendedores: 0,
    contratarOperarios: 0,
    despedirOperarios: 0,
    montoCapacitacion: 0,
    tipoPrestamo: 'Ninguno',
    montoPrestamo: 0,
    plazoPrestamo: 0,
    amortizacion: 0,
    tipoInvestigacion: 'Ninguno',
    proveedorElegido: '',
    cantidadMPpedida: 0,
    justificaciones: { produccion: 'Estimado según demanda previa' },
    productos: [
      {
        productoId: 'prod_1',
        activo: true,
        producto: 'Producto X',
        segmentoObjetivo: 'Segmento Y',
        canalPrincipal: 'Canal Z',
        canalSecundario: 'Ninguno',
        calidad: 7,
        precioVenta: 50,
        produccion: 1000,
        publicidad: 4000,
        promocion: 2500,
        eventos: 1200,
        marketingRedes: 1500,
        relacionesPublicas: 900,
        innovacion: false,
        tipoInnovacion: '',
        montoInnovacion: 0,
      },
    ],
  };
}

function compararProductoResultante(nombreCaso, productoEsperado, productoResultante) {
  log(`\n--- Comparación campo a campo (${nombreCaso}) ---`);
  let huboPerdida = false;
  CAMPOS_PRODUCTO_PERMITIDOS.forEach(campo => {
    const enviado = productoEsperado ? productoEsperado[campo] : undefined;
    const persistido = productoResultante ? productoResultante[campo] : undefined;
    const perdido = JSON.stringify(enviado) !== JSON.stringify(persistido);
    if (perdido) huboPerdida = true;
    log(
      `  campo="${campo}" | enviado=${JSON.stringify(enviado)} | persistido=${JSON.stringify(persistido)}`
      + (perdido ? '   <<< DIFERENTE (posible pérdida)' : '')
    );
  });
  return huboPerdida;
}

function imprimirCampoInDetalle(p) {
  log('  Detalle de "campo in p" por cada campo de CAMPOS_PRODUCTO_PERMITIDOS:');
  CAMPOS_PRODUCTO_PERMITIDOS.forEach(campo => {
    log(`    "${campo}" in p  => ${campo in (p || {})}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// CASO BASE (construcción "normal")
// ─────────────────────────────────────────────────────────────────────────
sep('CASO BASE — envío normal, un solo producto, forma real del cliente');

const curBase = construirCurR8();
const decisionBase = construirDecisionClienteValida();

const errorValidacionBase = validarDecisionEstudiante(decisionBase);
log(`validarDecisionEstudiante(decisionBase) => ${JSON.stringify(errorValidacionBase)}`);

let huboPerdidaBase = 'N/A (no pasó validación)';
if (errorValidacionBase !== null) {
  log('ABORTADO: la decisión de ejemplo no pasó la validación (revisar construcción del caso base).');
} else {
  imprimirCampoInDetalle(decisionBase.productos[0]);
  const resultadoBase = reconstruirDecisionPermitida(curBase, decisionBase, PARAMS_EJEMPLO);
  huboPerdidaBase = compararProductoResultante('CASO BASE', decisionBase.productos[0], resultadoBase.productos[0]);
  log(`\n¿Hubo pérdida de datos en el CASO BASE? => ${huboPerdidaBase}`);
}

// ─────────────────────────────────────────────────────────────────────────
// VARIACIÓN (a) — cur.productos vacío []
// ─────────────────────────────────────────────────────────────────────────
sep('VARIACIÓN (a) — cur.productos = [] (longitud distinta: 0 vs 1)');

const curA = construirCurR8();
curA.productos = [];
const decisionA = construirDecisionClienteValida();

const errA = validarDecisionEstudiante(decisionA);
log(`validarDecisionEstudiante(decisionA) => ${JSON.stringify(errA)}`);
const resultadoA = reconstruirDecisionPermitida(curA, decisionA, PARAMS_EJEMPLO);
const huboPerdidaA = compararProductoResultante('VARIACIÓN (a)', decisionA.productos[0], resultadoA.productos[0]);
log(`\n¿Hubo pérdida de datos en (a)? => ${huboPerdidaA}`);

// ─────────────────────────────────────────────────────────────────────────
// VARIACIÓN (a2) — cur.productos con MÁS elementos que decisionCliente.productos
// ─────────────────────────────────────────────────────────────────────────
sep('VARIACIÓN (a2) — cur.productos con 2 elementos, decisionCliente.productos con 1 (multiproducto -> se eliminó un producto)');

const curA2 = construirCurR8();
curA2.productos.push({
  productoId: 'prod_2',
  activo: true,
  producto: 'Producto Viejo 2',
  segmentoObjetivo: 'Segmento Viejo',
  canalPrincipal: 'Canal Viejo',
  canalSecundario: 'Ninguno',
  calidad: 5,
  precioVenta: 10,
  produccion: 500,
  publicidad: 0, promocion: 0, eventos: 0, marketingRedes: 0, relacionesPublicas: 0,
  innovacion: false, tipoInnovacion: '', montoInnovacion: 0,
  inversionActivos: {},
});
const decisionA2 = construirDecisionClienteValida(); // solo 1 producto en el array
const errA2 = validarDecisionEstudiante(decisionA2);
log(`validarDecisionEstudiante(decisionA2) => ${JSON.stringify(errA2)}`);
const resultadoA2 = reconstruirDecisionPermitida(curA2, decisionA2, PARAMS_EJEMPLO);
log(`  cur.productos.length=${curA2.productos.length}, decisionCliente.productos.length=${decisionA2.productos.length}, resultado.productos.length=${resultadoA2.productos.length}`);
const huboPerdidaA2 = compararProductoResultante('VARIACIÓN (a2)', decisionA2.productos[0], resultadoA2.productos[0]);
log(`\n¿Hubo pérdida de datos en (a2) para producto[0]? => ${huboPerdidaA2}`);
log(`¿El producto 2 (prod_2) sobrevive en el resultado aunque el cliente ya no lo envió? => ${resultadoA2.productos.length > 1 ? 'SÍ, sigue en el resultado' : 'NO, fue eliminado'}`);

// ─────────────────────────────────────────────────────────────────────────
// VARIACIÓN (b) — propiedad en null en vez de ausente
// ─────────────────────────────────────────────────────────────────────────
sep('VARIACIÓN (b) — productos[0].precioVenta = null (presente pero null, no ausente)');

const curB = construirCurR8();
const decisionB = construirDecisionClienteValida();
decisionB.productos[0].precioVenta = null;

// Nota: con precioVenta=null, validarDecisionEstudiante debería RECHAZAR
// este envío (Number(null) === 0, no > 0). Lo ejecutamos igual para
// observar el comportamiento de reconstruirDecisionPermitida de forma
// aislada, tal como pide el punto 6(b), y dejamos constancia del resultado
// de la validación.
const errB = validarDecisionEstudiante(decisionB);
log(`validarDecisionEstudiante(decisionB) => ${JSON.stringify(errB)}  (se espera que NO sea null, porque precioVenta=null falla Number(p.precioVenta)>0)`);
imprimirCampoInDetalle(decisionB.productos[0]);
const resultadoB = reconstruirDecisionPermitida(curB, decisionB, PARAMS_EJEMPLO);
const huboPerdidaB = compararProductoResultante('VARIACIÓN (b)', decisionB.productos[0], resultadoB.productos[0]);
log(`\n¿Hubo pérdida de datos en (b)? => ${huboPerdidaB}`);
log(`  Valor final de precioVenta en el resultado: ${JSON.stringify(resultadoB.productos[0].precioVenta)} (¿coincide con null enviado? => ${resultadoB.productos[0].precioVenta === null})`);

// ─────────────────────────────────────────────────────────────────────────
// VARIACIÓN (c) — cur sin la propiedad productos en absoluto
// ─────────────────────────────────────────────────────────────────────────
sep('VARIACIÓN (c) — cur.productos === undefined (cur no tiene la propiedad productos)');

const curC = construirCurR8();
delete curC.productos;
const decisionC = construirDecisionClienteValida();
const errC = validarDecisionEstudiante(decisionC);
log(`validarDecisionEstudiante(decisionC) => ${JSON.stringify(errC)}`);
const resultadoC = reconstruirDecisionPermitida(curC, decisionC, PARAMS_EJEMPLO);
const huboPerdidaC = compararProductoResultante('VARIACIÓN (c)', decisionC.productos[0], resultadoC.productos[0]);
log(`\n¿Hubo pérdida de datos en (c)? => ${huboPerdidaC}`);

// ─────────────────────────────────────────────────────────────────────────
// VARIACIÓN (d1) — dos llamadas "simultáneas" reconstruidas ambas sobre el
// mismo `cur` (simulación del doble-clic: dos requests leen `cur` ANTES de
// que cualquiera de las dos escriba, y ambas llaman a
// reconstruirDecisionPermitida con el mismo `cur` de partida).
// ─────────────────────────────────────────────────────────────────────────
sep('VARIACIÓN (d1) — doble envío concurrente: dos llamadas a reconstruirDecisionPermitida parten del MISMO cur (simula doble clic sin bloqueo de reenvío)');

const curD1 = construirCurR8();

// Request 1: el estudiante hace clic, el navegador arma el payload con los
// valores actuales del formulario.
const decisionD1_req1 = construirDecisionClienteValida();

// Request 2: disparada milisegundos después por un segundo clic, ANTES de
// que la respuesta de la request 1 llegue. Como sincronizarHojaConEstado()
// vuelve a leer el DOM (que aún no cambió), el payload es prácticamente
// idéntico, pero simulamos que el estudiante alcanzó a modificar un campo
// entre los dos clics (ej. produccion) para que sea representativo de un
// doble clic con edición en curso.
const decisionD1_req2 = construirDecisionClienteValida();
decisionD1_req2.productos[0].produccion = 1500;

const errD1_1 = validarDecisionEstudiante(decisionD1_req1);
const errD1_2 = validarDecisionEstudiante(decisionD1_req2);
log(`validarDecisionEstudiante(req1) => ${JSON.stringify(errD1_1)}`);
log(`validarDecisionEstudiante(req2) => ${JSON.stringify(errD1_2)}`);

// Ambas requests leen `cur` ANTES de que ninguna haya escrito (race real:
// no hay bloqueo de reenvío en el backend, confirmado en auditoría previa).
const resultadoD1_req1 = reconstruirDecisionPermitida(curD1, decisionD1_req1, PARAMS_EJEMPLO);
const resultadoD1_req2 = reconstruirDecisionPermitida(curD1, decisionD1_req2, PARAMS_EJEMPLO);

log(`\n  Resultado de req1 (produccion): ${resultadoD1_req1.productos[0].produccion}`);
log(`  Resultado de req2 (produccion): ${resultadoD1_req2.productos[0].produccion}`);
log('  En el escenario real, storage.updateRonda() se llama primero con el resultado de req1 y');
log('  luego con el resultado de req2 (o en cualquier orden, según cuál I/O de Postgres termine');
log('  antes) — la ÚLTIMA escritura en llegar es la que persiste en sim_decisiones.producto_id=\'prod_1\'.');
log('  reconstruirDecisionPermitida en sí NO pierde datos en ninguna de las dos llamadas aisladas:');
const huboPerdidaD1_1 = compararProductoResultante('VARIACIÓN (d1) req1', decisionD1_req1.productos[0], resultadoD1_req1.productos[0]);
const huboPerdidaD1_2 = compararProductoResultante('VARIACIÓN (d1) req2', decisionD1_req2.productos[0], resultadoD1_req2.productos[0]);
log(`\n¿Hubo pérdida de datos en la reconstrucción de req1? => ${huboPerdidaD1_1}`);
log(`¿Hubo pérdida de datos en la reconstrucción de req2? => ${huboPerdidaD1_2}`);
log('  (La pérdida real de R8, si ocurre por esta vía, sería a nivel de ÚLTIMA ESCRITURA GANA');
log('  en storage.js/Postgres — no dentro de reconstruirDecisionPermitida — ver CAMBIO C ya propuesto.)');

// ─────────────────────────────────────────────────────────────────────────
// VARIACIÓN (e) — decisionCliente.productos[0] sin productoId (undefined)
// ─────────────────────────────────────────────────────────────────────────
sep('VARIACIÓN (e) — decisionCliente.productos[0].productoId ausente (undefined), como podría llegar de un formulario legado sin normalizar');

const curE = construirCurR8();
const decisionE = construirDecisionClienteValida();
delete decisionE.productos[0].productoId;
const errE = validarDecisionEstudiante(decisionE);
log(`validarDecisionEstudiante(decisionE) => ${JSON.stringify(errE)}`);
const resultadoE = reconstruirDecisionPermitida(curE, decisionE, PARAMS_EJEMPLO);
const huboPerdidaE = compararProductoResultante('VARIACIÓN (e)', decisionE.productos[0], resultadoE.productos[0]);
log(`\n¿Hubo pérdida de datos en (e)? => ${huboPerdidaE}`);
log(`  productoId final: ${JSON.stringify(resultadoE.productos[0].productoId)} (se preserva desde curProducto.productoId, línea 3023 de server.js)`);

// ─────────────────────────────────────────────────────────────────────────
// RESUMEN FINAL
// ─────────────────────────────────────────────────────────────────────────
sep('RESUMEN FINAL');

const resumen = [
  { caso: 'CASO BASE (envío normal, 1 producto)', perdida: errorValidacionBase === null ? huboPerdidaBase : 'N/A (no pasó validación)' },
  { caso: '(a) cur.productos = [] (longitud 0 vs 1)', perdida: huboPerdidaA },
  { caso: '(a2) cur.productos con 2, decisionCliente con 1 (producto eliminado)', perdida: `producto[0]=${huboPerdidaA2}; prod_2 sobrevive=${resultadoA2.productos.length > 1}` },
  { caso: '(b) precioVenta=null (presente pero null)', perdida: `${huboPerdidaB} (nota: validación real lo rechazaría: err=${JSON.stringify(errB)})` },
  { caso: '(c) cur.productos undefined', perdida: huboPerdidaC },
  { caso: '(d1) doble clic / doble request concurrente sobre mismo cur', perdida: `reconstrucción aislada NO pierde datos (req1=${huboPerdidaD1_1}, req2=${huboPerdidaD1_2}); la pérdida ocurriría en la escritura a Postgres (ver storage.js), no aquí` },
  { caso: '(e) productoId ausente en decisionCliente', perdida: huboPerdidaE },
];

resumen.forEach(r => log(`  - ${r.caso}: pérdida=${JSON.stringify(r.perdida)}`));

log('\nConclusión de este script: reconstruirDecisionPermitida(), tal como está implementada hoy');
log('(la condición "if (campo in (p || {}))"), NO pierde datos por sí sola en ninguno de los');
log('escenarios anteriores cuando se la invoca de forma aislada y síncrona. El campo llega');
log('correctamente si está presente en el objeto enviado (con cualquier valor, incluido null).');
log('La pérdida documentada de la Ronda 8 requiere, además de esta función, la escritura');
log('doble/incondicional a producto_id=\'prod_1\' en storage.js (Cambio C) combinada con dos');
log('peticiones POST casi simultáneas sin bloqueo de reenvío (Cambio A + Cambio B/D) — el orden');
log('de llegada de esas dos escrituras a Postgres decide cuál de las dos decisiones "gana",');
log('independientemente de que cada una, vista aisladamente, esté bien formada.');
