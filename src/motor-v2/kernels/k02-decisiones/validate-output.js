const { KernelError } = require('../../shared/errors');
const {
  esStringNoVacio,
  esBooleano,
  esArray,
  esObjetoPlano,
  sonEstructuralmenteIguales,
  validarEstructuraClonable,
} = require('../../shared/validation');
const { CODIGO, NOMBRE, VERSION } = require('./version');
const { compararOrdinal, crearEventIdK02 } = require('./validate-input');

function fallar(message, details = {}) {
  throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K02_INVALIDA', message, details);
}

function validarCerrado(obj, permitidas, ruta) {
  if (!esObjetoPlano(obj)) fallar(`${ruta} debe ser objeto plano`, { ruta });
  const set = new Set(permitidas);
  Object.keys(obj).forEach(k => {
    if (!set.has(k)) {
      throw new KernelError('ERROR_BLOQUEANTE_PROPIEDAD_K02_DESCONOCIDA', `${ruta}.${k} no esta permitido`, { ruta: `${ruta}.${k}` });
    }
  });
  permitidas.forEach(k => {
    if (!(k in obj)) fallar(`${ruta}.${k} es obligatorio`, { ruta: `${ruta}.${k}` });
  });
}

function validarOrdenProductos(productos) {
  for (let i = 1; i < productos.length; i++) {
    if (compararOrdinal(productos[i - 1].productoId, productos[i].productoId) >= 0) {
      fallar('productos canonicos fuera de orden', { anterior: productos[i - 1].productoId, actual: productos[i].productoId });
    }
  }
}

function validarEventos(eventos, contexto, productos) {
  if (!esArray(eventos)) fallar('eventos debe ser array');
  if (eventos.length !== productos.length + 1) fallar('eventos debe tener uno por producto y uno general');
  const ids = new Set();
  const productoIds = new Set(productos.map(p => p.productoId));
  eventos.forEach((e, idx) => {
    validarCerrado(e, ['eventId', 'eventType', 'simulacionId', 'empresaId', 'ronda', 'productoId', 'kernel', 'version', 'impactoEconomico'], `eventos[${idx}]`);
    if (!esStringNoVacio(e.eventId)) fallar('eventId invalido');
    if (ids.has(e.eventId)) throw new KernelError('ERROR_BLOQUEANTE_EVENTO_DUPLICADO', `eventId duplicado: ${e.eventId}`, { eventId: e.eventId });
    ids.add(e.eventId);
    if (!['K02_PRODUCTO_VALIDADO', 'K02_DECISIONES_PREPARADAS'].includes(e.eventType)) fallar('eventType invalido', { eventType: e.eventType });
    if (e.simulacionId !== contexto.simulacionId || e.empresaId !== contexto.empresaId || e.ronda !== contexto.ronda) fallar('evento no coincide con contexto');
    if (e.kernel !== CODIGO || e.version !== VERSION) fallar('evento tiene identidad K02 invalida');
    if (e.impactoEconomico !== false) fallar('evento K02 no puede tener impacto economico');
    if (e.eventType === 'K02_PRODUCTO_VALIDADO' && !productoIds.has(e.productoId)) throw new KernelError('ERROR_BLOQUEANTE_EVENTO_HUERFANO', 'evento de producto sin producto canonico', { productoId: e.productoId });
    if (e.eventType === 'K02_DECISIONES_PREPARADAS' && e.productoId !== null) fallar('evento general debe tener productoId null');
    const esperado = crearEventIdK02({
      simulacionId: e.simulacionId,
      empresaId: e.empresaId,
      ronda: e.ronda,
      productoId: e.productoId,
      eventType: e.eventType,
      version: e.version,
    });
    if (e.eventId !== esperado) throw new KernelError('ERROR_BLOQUEANTE_EVENT_ID_K02_INVALIDO', 'eventId K02 no coincide con hash esperado', { recibido: e.eventId, esperado });
  });
  productos.forEach((p, idx) => {
    const e = eventos[idx];
    if (!e || e.eventType !== 'K02_PRODUCTO_VALIDADO' || e.productoId !== p.productoId) fallar('eventos de producto fuera de orden canonico', { idx, productoId: p.productoId });
  });
  const ultimo = eventos[eventos.length - 1];
  if (!ultimo || ultimo.eventType !== 'K02_DECISIONES_PREPARADAS') fallar('evento general debe ser el ultimo evento');
}

function validarOutput(salida, entrada = null) {
  validarEstructuraClonable(salida, 'salida');
  validarCerrado(salida, ['kernel', 'contexto', 'estadoInicial', 'decisionesCanonicas', 'eventos', 'advertencias'], 'salida');
  validarCerrado(salida.kernel, ['codigo', 'nombre', 'version'], 'salida.kernel');
  if (salida.kernel.codigo !== CODIGO || salida.kernel.nombre !== NOMBRE || salida.kernel.version !== VERSION) fallar('identidad K02 invalida');
  validarCerrado(salida.contexto, ['simulacionId', 'empresaId', 'ronda'], 'salida.contexto');
  if (!esStringNoVacio(salida.contexto.simulacionId) || !esStringNoVacio(salida.contexto.empresaId) || !Number.isInteger(salida.contexto.ronda)) fallar('contexto de salida invalido');
  validarCerrado(salida.decisionesCanonicas, ['empresa', 'productos'], 'salida.decisionesCanonicas');
  if (!esObjetoPlano(salida.decisionesCanonicas.empresa)) fallar('empresa canonica invalida');
  if (!esArray(salida.decisionesCanonicas.productos)) fallar('productos canonicos debe ser array');
  validarOrdenProductos(salida.decisionesCanonicas.productos);
  validarEventos(salida.eventos, salida.contexto, salida.decisionesCanonicas.productos);
  if (!esArray(salida.advertencias) || salida.advertencias.length !== 0) fallar('advertencias debe ser array vacio');
  if (entrada) {
    if (!sonEstructuralmenteIguales(salida.estadoInicial, entrada.estadoInicialK01)) fallar('estadoInicial no preserva literalmente K01');
    if (!sonEstructuralmenteIguales(salida.decisionesCanonicas.empresa, entrada.decisionesRonda.empresa)) fallar('empresa canonica no coincide con entrada');
    const esperados = [...entrada.decisionesRonda.productos].sort((a, b) => compararOrdinal(a.productoId, b.productoId));
    if (!sonEstructuralmenteIguales(salida.decisionesCanonicas.productos, esperados)) fallar('productos canonicos no coinciden con entrada ordenada');
  }
}

module.exports = { validarOutput };
