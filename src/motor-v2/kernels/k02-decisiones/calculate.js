const { clonarProfundo } = require('../../shared/validation');
const { CODIGO, NOMBRE, VERSION } = require('./version');
const { compararOrdinal, crearEventIdK02 } = require('./validate-input');

function eventoDeterminista(eventType, contexto, productoId) {
  return {
    eventId: crearEventIdK02({
      simulacionId: contexto.simulacionId,
      empresaId: contexto.empresaId,
      ronda: contexto.ronda,
      productoId,
      eventType,
      version: VERSION,
    }),
    eventType,
    simulacionId: contexto.simulacionId,
    empresaId: contexto.empresaId,
    ronda: contexto.ronda,
    productoId,
    kernel: CODIGO,
    version: VERSION,
    impactoEconomico: false,
  };
}

function ordenarPorId(lista) {
  return [...lista].sort((a, b) => compararOrdinal(a.id, b.id));
}

function calcularInterno(entrada) {
  const productos = [...entrada.decisionesRonda.productos]
    .sort((a, b) => compararOrdinal(a.productoId, b.productoId))
    .map(p => clonarProfundo(p));

  const eventosProductos = productos.map(p => eventoDeterminista('K02_PRODUCTO_VALIDADO', entrada.contexto, p.productoId));
  const eventoGeneral = eventoDeterminista('K02_DECISIONES_PREPARADAS', entrada.contexto, null);
  const eventos = [...eventosProductos, eventoGeneral];

  return {
    kernel: { codigo: CODIGO, nombre: NOMBRE, version: VERSION },
    contexto: {
      simulacionId: entrada.contexto.simulacionId,
      empresaId: entrada.contexto.empresaId,
      ronda: entrada.contexto.ronda,
    },
    estadoInicial: clonarProfundo(entrada.estadoInicialK01),
    decisionesCanonicas: {
      empresa: clonarProfundo(entrada.decisionesRonda.empresa),
      productos,
    },
    eventos,
    advertencias: [],
  };
}

module.exports = { calcularInterno };
