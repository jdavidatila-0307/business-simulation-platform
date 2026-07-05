const { KernelError } = require('../../shared/errors');
const { clonarProfundo } = require('../../shared/validation');
const { CAMPOS_EMPRESA_NO_NEGATIVOS, CAMPOS_EMPRESA_FINITOS_CON_SIGNO, compararOrdinal, crearEventIdK01 } = require('./validate-input');
const { CODIGO, VERSION } = require('./version');

const CAMPOS_EMPRESA_CONTINUABLES = [...CAMPOS_EMPRESA_NO_NEGATIVOS, ...CAMPOS_EMPRESA_FINITOS_CON_SIGNO];

// Continuidad empresarial: copia literal, sin recalcular/sumar/maximizar/normalizar.
function continuarEstadoEmpresa(estadoFinalAnterior) {
  const estadoInicial = {};
  for (const campo of CAMPOS_EMPRESA_CONTINUABLES) {
    estadoInicial[campo] = estadoFinalAnterior[campo];
  }
  estadoInicial.pedidosPendientes = clonarProfundo(estadoFinalAnterior.pedidosPendientes);
  return estadoInicial;
}

function eventoDeterminista(eventType, contexto, productoId, metadatos) {
  // Corrección 3 (V2-2D): generación de eventId centralizada en
  // crearEventIdK01 (validate-input.js), la MISMA función que validate-output.js
  // usa para recalcular y verificar el hash — nunca dos implementaciones
  // paralelas que puedan divergir.
  const eventId = crearEventIdK01({
    simulacionId: contexto.simulacionId,
    empresaId: contexto.empresaId,
    productoId,
    rondaDestino: contexto.rondaDestino,
    eventType,
    version: VERSION,
  });
  return {
    eventId,
    empresaId: contexto.empresaId,
    productoId,
    ronda: contexto.rondaDestino,
    eventType,
    kernel: CODIGO,
    version: VERSION,
    metadatos,
  };
}

function indexarPorProductoId(lista) {
  const mapa = new Map();
  lista.forEach(item => mapa.set(item.productoId, item));
  return mapa;
}

function procesarContinuar(decision, productoAnteriorMap, contexto, eventos) {
  const anterior = productoAnteriorMap.get(decision.productoId);
  if (!anterior) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_CONTINUAR_PRODUCTO_INEXISTENTE',
      `CONTINUAR requiere que el producto ya existiera en la ronda anterior: ${decision.productoId}`,
      { productoId: decision.productoId }
    );
  }
  if (anterior.activo !== true) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_CONTINUAR_PRODUCTO_INACTIVO',
      `CONTINUAR requiere que el producto estuviera activo en la ronda anterior: ${decision.productoId}`,
      { productoId: decision.productoId }
    );
  }
  eventos.push(eventoDeterminista('PRODUCTO_CONTINUADO', contexto, decision.productoId, {}));
  return {
    productoId: decision.productoId,
    origen: 'CONTINUO',
    activo: true,
    inventarioInicial: anterior.inventarioFinal,
    costoUnitarioInventario: anterior.costoUnitarioInventario,
    historialContable: clonarProfundo(anterior.historialContable),
    estrategiaDestino: clonarProfundo(decision.estrategia),
  };
}

function procesarCrear(decision, productoAnteriorMap, contexto, eventos) {
  if (productoAnteriorMap.has(decision.productoId)) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_PRODUCTO_NUEVO_YA_EXISTENTE',
      `CREAR requiere un productoId que no exista previamente: ${decision.productoId}`,
      { productoId: decision.productoId }
    );
  }
  eventos.push(eventoDeterminista('PRODUCTO_CREADO', contexto, decision.productoId, {}));
  return {
    productoId: decision.productoId,
    origen: 'NUEVO',
    activo: true,
    inventarioInicial: 0,
    costoUnitarioInventario: 0,
    historialContable: {},
    estrategiaDestino: clonarProfundo(decision.estrategia),
  };
}

function procesarDescontinuar(decision, productoAnteriorMap, contexto, eventos) {
  const anterior = productoAnteriorMap.get(decision.productoId);
  if (!anterior) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_DESCONTINUAR_PRODUCTO_INEXISTENTE',
      `DESCONTINUAR requiere que el producto ya existiera: ${decision.productoId}`,
      { productoId: decision.productoId }
    );
  }
  // Corrección 2 (V2-2B): DESCONTINUAR exige que el producto anterior
  // estuviera activo=true — no se puede descontinuar lo que ya está inactivo.
  if (anterior.activo !== true) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_DESCONTINUAR_PRODUCTO_INACTIVO',
      `DESCONTINUAR requiere que el producto estuviera activo=true en la ronda anterior: ${decision.productoId}`,
      { productoId: decision.productoId }
    );
  }
  eventos.push(eventoDeterminista('PRODUCTO_DESCONTINUADO', contexto, decision.productoId, {}));
  return {
    productoId: decision.productoId,
    origen: 'DESCONTINUADO',
    activo: false,
    // K01 preserva inventario/costo/historial tal cual — K05 ejecutará
    // LIQUIDACION_INVENTARIO_DESCONTINUADO posteriormente; K01 no la genera.
    inventarioInicial: anterior.inventarioFinal,
    costoUnitarioInventario: anterior.costoUnitarioInventario,
    historialContable: clonarProfundo(anterior.historialContable),
    estrategiaDestino: null,
  };
}

function procesarReactivar(decision, productoAnteriorMap, contexto, eventos) {
  const anterior = productoAnteriorMap.get(decision.productoId);
  if (!anterior) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_REACTIVAR_PRODUCTO_INEXISTENTE',
      `REACTIVAR requiere que el producto ya existiera previamente: ${decision.productoId}`,
      { productoId: decision.productoId }
    );
  }
  if (anterior.activo !== false) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_REACTIVAR_PRODUCTO_NO_DESCONTINUADO',
      `REACTIVAR requiere que el último estado válido del producto fuera activo=false: ${decision.productoId}`,
      { productoId: decision.productoId }
    );
  }
  // La validación de completitud de los 8 campos estratégicos ya ocurrió en
  // validate-input.js (ERROR_BLOQUEANTE_CAMPOS_ESTRATEGICOS_REACTIVACION_AUSENTES
  // se emite ahí bajo el código ERROR_BLOQUEANTE_ESTRATEGIA_INCOMPLETA).
  eventos.push(eventoDeterminista('PRODUCTO_REACTIVADO', contexto, decision.productoId, {}));
  return {
    productoId: decision.productoId,
    origen: 'REACTIVADO',
    activo: true,
    // Conserva EXCLUSIVAMENTE su propio inventario/costo/historial — nunca
    // hereda estrategia antigua ni datos de otro producto.
    inventarioInicial: anterior.inventarioFinal,
    costoUnitarioInventario: anterior.costoUnitarioInventario,
    historialContable: clonarProfundo(anterior.historialContable),
    estrategiaDestino: clonarProfundo(decision.estrategia),
  };
}

function calcularInterno(entrada) {
  const { contexto, empresaEstadoFinalAnterior, productosEstadoFinalAnterior, productosDecisionDestino } = entrada;

  const productoAnteriorMap = indexarPorProductoId(productosEstadoFinalAnterior);
  const eventos = [];

  const empresaEstadoInicial = continuarEstadoEmpresa(empresaEstadoFinalAnterior);

  const procesadores = {
    CONTINUAR: procesarContinuar,
    CREAR: procesarCrear,
    DESCONTINUAR: procesarDescontinuar,
    REACTIVAR: procesarReactivar,
  };

  // Orden canónico determinista: comparación ordinal por unidades de código
  // UTF-16 (NUNCA localeCompare, que depende de locale/idioma) — independiente
  // del orden de llegada en productosDecisionDestino (Corrección 6).
  const decisionesOrdenadas = [...productosDecisionDestino].sort((a, b) => compararOrdinal(a.productoId, b.productoId));

  const productosEstadoInicial = decisionesOrdenadas.map(decision =>
    procesadores[decision.accion](decision, productoAnteriorMap, contexto, eventos)
  );

  return {
    kernel: { codigo: CODIGO, nombre: 'Continuidad', version: VERSION },
    contexto: {
      simulacionId: contexto.simulacionId,
      empresaId: contexto.empresaId,
      rondaAnterior: contexto.rondaAnterior,
      rondaDestino: contexto.rondaDestino,
    },
    empresaEstadoInicial,
    productosEstadoInicial,
    eventos,
    advertencias: [],
  };
}

module.exports = { calcularInterno };
