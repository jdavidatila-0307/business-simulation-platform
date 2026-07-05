const { KernelError } = require('../../shared/errors');
const { esStringNoVacio, esNumeroFinito, esNumeroFinitoNoNegativo, esEnteroFinitoNoNegativo, esBooleano, esArray, esObjetoPlano, validarPedidosPendientes } = require('../../shared/validation');
const { CAMPOS_EMPRESA_NO_NEGATIVOS, CAMPOS_EMPRESA_FINITOS_CON_SIGNO, CAMPOS_ESTRATEGICOS, compararOrdinal, crearEventIdK01 } = require('./validate-input');
const { CODIGO, NOMBRE, VERSION } = require('./version');

const ORIGENES_VALIDOS = ['CONTINUO', 'NUEVO', 'REACTIVADO', 'DESCONTINUADO'];
const EVENT_TYPES_VALIDOS = ['PRODUCTO_CREADO', 'PRODUCTO_CONTINUADO', 'PRODUCTO_DESCONTINUADO', 'PRODUCTO_REACTIVADO'];

// Corrección 3 (V2-2C): correspondencia obligatoria origen -> eventType.
const EVENT_TYPE_ESPERADO_POR_ORIGEN = {
  CONTINUO: 'PRODUCTO_CONTINUADO',
  NUEVO: 'PRODUCTO_CREADO',
  DESCONTINUADO: 'PRODUCTO_DESCONTINUADO',
  REACTIVADO: 'PRODUCTO_REACTIVADO',
};

function validarKernel(kernel) {
  if (!esObjetoPlano(kernel)) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'kernel ausente o inválido en la salida');
  }
  if (kernel.codigo !== CODIGO) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `kernel.codigo debe ser "${CODIGO}"`, { valor: kernel.codigo });
  }
  if (!esStringNoVacio(kernel.nombre) || kernel.nombre !== NOMBRE) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `kernel.nombre debe ser "${NOMBRE}"`, { valor: kernel.nombre });
  }
  if (!esStringNoVacio(kernel.version) || kernel.version !== VERSION) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `kernel.version debe ser "${VERSION}"`, { valor: kernel.version });
  }
}

function validarContextoSalida(contexto) {
  if (!esObjetoPlano(contexto)) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'contexto ausente o inválido en la salida');
  }
  if (!esStringNoVacio(contexto.simulacionId)) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'contexto.simulacionId inválido en la salida');
  }
  if (!esStringNoVacio(contexto.empresaId)) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'contexto.empresaId inválido en la salida');
  }
  if (!Number.isInteger(contexto.rondaAnterior) || contexto.rondaAnterior < 0) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'contexto.rondaAnterior inválido en la salida');
  }
  if (!Number.isInteger(contexto.rondaDestino) || contexto.rondaDestino !== contexto.rondaAnterior + 1) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'contexto.rondaDestino debe ser exactamente rondaAnterior + 1 en la salida');
  }
  return contexto;
}

function validarEmpresaEstadoInicial(empresaEstadoInicial) {
  if (!esObjetoPlano(empresaEstadoInicial)) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'empresaEstadoInicial ausente o inválido en la salida');
  }
  for (const campo of CAMPOS_EMPRESA_NO_NEGATIVOS) {
    if (!esNumeroFinitoNoNegativo(empresaEstadoInicial[campo])) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `empresaEstadoInicial.${campo} inválido en la salida`, { campo });
    }
  }
  for (const campo of CAMPOS_EMPRESA_FINITOS_CON_SIGNO) {
    if (!esNumeroFinito(empresaEstadoInicial[campo])) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `empresaEstadoInicial.${campo} inválido en la salida`, { campo });
    }
  }
  if (!esArray(empresaEstadoInicial.pedidosPendientes)) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'empresaEstadoInicial.pedidosPendientes debe ser un array en la salida');
  }
  validarPedidosPendientes(empresaEstadoInicial.pedidosPendientes, 'empresaEstadoInicial.pedidosPendientes', 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA');
  // produccionEnProcesoFinalAnterior NUNCA debe propagarse (Corrección 4, V2-2B).
  if ('produccionEnProcesoFinalAnterior' in empresaEstadoInicial) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'empresaEstadoInicial no debe contener produccionEnProcesoFinalAnterior');
  }
}

function esEstrategiaValida(estrategia) {
  if (!esObjetoPlano(estrategia)) return false;
  for (const campo of CAMPOS_ESTRATEGICOS) {
    if (!(campo in estrategia) || estrategia[campo] === null || estrategia[campo] === undefined) return false;
  }
  const { precio, segmento, canalPrincipal, canalSecundario, produccionSolicitada, calidad, marketing, innovacion } = estrategia;
  if (!esNumeroFinitoNoNegativo(precio)) return false;
  if (!esStringNoVacio(segmento)) return false;
  if (!esStringNoVacio(canalPrincipal)) return false;
  if (!esStringNoVacio(canalSecundario)) return false;
  if (!esEnteroFinitoNoNegativo(produccionSolicitada)) return false;
  if (!esNumeroFinitoNoNegativo(calidad)) return false;
  if (!esNumeroFinitoNoNegativo(marketing)) return false;
  if (!esBooleano(innovacion)) return false;
  return true;
}

function validarProductosEstadoInicial(productos) {
  if (!esArray(productos)) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'productosEstadoInicial debe ser un array');
  }
  const vistos = new Set();
  productos.forEach((p, idx) => {
    // Corrección 4 (V2-2C): validar esObjetoPlano ANTES de leer cualquier
    // propiedad — un elemento null, array, Date, Map, Set o instancia de
    // clase debe producir KernelError controlado, nunca TypeError genérico.
    if (!esObjetoPlano(p)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `productosEstadoInicial[${idx}] debe ser un objeto plano`);
    }
    if (!esStringNoVacio(p.productoId)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `productosEstadoInicial[${idx}].productoId inválido`);
    }
    if (vistos.has(p.productoId)) {
      throw new KernelError('ERROR_BLOQUEANTE_PRODUCTO_ID_DUPLICADO', `productoId duplicado en la salida: ${p.productoId}`, { productoId: p.productoId });
    }
    vistos.add(p.productoId);
    if (!ORIGENES_VALIDOS.includes(p.origen)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `productosEstadoInicial[${idx}].origen inválido: ${p.origen}`);
    }
    if (!esBooleano(p.activo)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `productosEstadoInicial[${idx}].activo debe ser boolean`);
    }
    if (!esEnteroFinitoNoNegativo(p.inventarioInicial)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `productosEstadoInicial[${idx}].inventarioInicial inválido`);
    }
    if (!esNumeroFinitoNoNegativo(p.costoUnitarioInventario)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `productosEstadoInicial[${idx}].costoUnitarioInventario inválido`);
    }
    if (!esObjetoPlano(p.historialContable)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `productosEstadoInicial[${idx}].historialContable inválido`);
    }
    // Coherencia origen <-> activo.
    if (p.origen === 'DESCONTINUADO' && p.activo !== false) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `producto DESCONTINUADO debe tener activo=false: ${p.productoId}`);
    }
    if ((p.origen === 'CONTINUO' || p.origen === 'NUEVO' || p.origen === 'REACTIVADO') && p.activo !== true) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `producto ${p.origen} debe tener activo=true: ${p.productoId}`);
    }
    // Coherencia origen <-> estrategiaDestino: null SOLO en DESCONTINUADO;
    // válida (con los 8 campos y tipos correctos) en CONTINUO, NUEVO y
    // REACTIVADO. esEstrategiaValida ya valida esObjetoPlano internamente,
    // por lo que un estrategiaDestino instancia de clase/Date/Map/etc. es
    // rechazado sin leer sus propiedades de forma insegura.
    if (p.origen === 'DESCONTINUADO') {
      if (p.estrategiaDestino !== null) {
        throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `producto DESCONTINUADO debe tener estrategiaDestino=null: ${p.productoId}`);
      }
    } else if (!esEstrategiaValida(p.estrategiaDestino)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `producto ${p.origen} debe tener estrategiaDestino válida: ${p.productoId}`);
    }
  });

  // Orden canónico: productoId estrictamente ascendente por comparación
  // ordinal (Corrección 6, V2-2B).
  for (let i = 1; i < productos.length; i++) {
    if (compararOrdinal(productos[i - 1].productoId, productos[i].productoId) >= 0) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA',
        `productosEstadoInicial no está en orden canónico ascendente en la posición ${i}`,
        { anterior: productos[i - 1].productoId, actual: productos[i].productoId }
      );
    }
  }
}

function validarEventos(eventos, contexto) {
  if (!esArray(eventos)) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'eventos debe ser un array');
  }
  const idsVistos = new Set();
  eventos.forEach((e, idx) => {
    if (!esObjetoPlano(e)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `eventos[${idx}] debe ser un objeto plano`);
    }
    if (!esStringNoVacio(e.eventId)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `eventos[${idx}].eventId debe ser un string no vacío`);
    }
    if (idsVistos.has(e.eventId)) {
      throw new KernelError('ERROR_BLOQUEANTE_EVENTO_DUPLICADO', `eventId duplicado en la salida: ${e.eventId}`, { eventId: e.eventId });
    }
    idsVistos.add(e.eventId);
    if (e.empresaId !== contexto.empresaId) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `eventos[${idx}].empresaId no coincide con contexto.empresaId`);
    }
    if (!esStringNoVacio(e.productoId)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `eventos[${idx}].productoId debe ser un string no vacío`);
    }
    if (e.ronda !== contexto.rondaDestino) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `eventos[${idx}].ronda debe coincidir con contexto.rondaDestino`);
    }
    if (!EVENT_TYPES_VALIDOS.includes(e.eventType)) {
      throw new KernelError('ERROR_BLOQUEANTE_EVENTO_TIPO_INVALIDO', `eventos[${idx}].eventType inválido: ${e.eventType}`, { eventType: e.eventType });
    }
    if (e.kernel !== CODIGO) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `eventos[${idx}].kernel debe ser "${CODIGO}"`);
    }
    if (e.version !== VERSION) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `eventos[${idx}].version debe ser "${VERSION}"`);
    }
    if (!esObjetoPlano(e.metadatos)) {
      throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', `eventos[${idx}].metadatos debe ser un objeto`);
    }
    // Corrección 3 (V2-2D): verificación criptográfica del eventId — se
    // RECALCULA con la MISMA función (crearEventIdK01) usada por calculate.js
    // y se exige igualdad exacta. Cualquier eventId sustituido, truncado o
    // con un solo carácter alterado del hash es detectado aquí.
    const eventIdEsperado = crearEventIdK01({
      simulacionId: contexto.simulacionId,
      empresaId: contexto.empresaId,
      productoId: e.productoId,
      rondaDestino: contexto.rondaDestino,
      eventType: e.eventType,
      version: e.version,
    });
    if (e.eventId !== eventIdEsperado) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_EVENT_ID_K01_INVALIDO',
        `eventos[${idx}].eventId no coincide con el hash esperado (crearEventIdK01) para sus propios campos declarados`,
        { eventIdRecibido: e.eventId, eventIdEsperado }
      );
    }
  });
}

// Corrección 3 (V2-2C): integridad producto-evento. Se ejecuta DESPUÉS de que
// validarProductosEstadoInicial y validarEventos ya garantizaron formas
// individuales válidas (incluyendo unicidad de productoId/eventId).
function validarIntegridadProductoEvento(productos, eventos) {
  if (eventos.length !== productos.length) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA',
      `eventos.length (${eventos.length}) debe ser igual a productosEstadoInicial.length (${productos.length})`,
      { eventosLength: eventos.length, productosLength: productos.length }
    );
  }

  const productosPorId = new Map(productos.map(p => [p.productoId, p]));
  const eventosPorProducto = new Map();

  for (const e of eventos) {
    if (!productosPorId.has(e.productoId)) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA',
        `evento con productoId "${e.productoId}" no corresponde a ningún producto en productosEstadoInicial`,
        { productoId: e.productoId }
      );
    }
    if (eventosPorProducto.has(e.productoId)) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA',
        `más de un evento hace referencia al mismo productoId: ${e.productoId}`,
        { productoId: e.productoId }
      );
    }
    eventosPorProducto.set(e.productoId, e);
  }

  for (const p of productos) {
    const evento = eventosPorProducto.get(p.productoId);
    if (!evento) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA',
        `el producto "${p.productoId}" (origen ${p.origen}) no tiene ningún evento asociado`,
        { productoId: p.productoId }
      );
    }
    const eventTypeEsperado = EVENT_TYPE_ESPERADO_POR_ORIGEN[p.origen];
    if (evento.eventType !== eventTypeEsperado) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA',
        `producto "${p.productoId}" con origen ${p.origen} debe tener evento ${eventTypeEsperado}, se encontró ${evento.eventType}`,
        { productoId: p.productoId, origen: p.origen, eventTypeEsperado, eventTypeObtenido: evento.eventType }
      );
    }
  }

  // Orden canónico: los eventos deben aparecer en el mismo orden canónico
  // (por productoId, comparación ordinal) que productosEstadoInicial.
  for (let i = 0; i < productos.length; i++) {
    if (eventos[i].productoId !== productos[i].productoId) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA',
        `eventos[${i}].productoId ("${eventos[i].productoId}") no coincide con productosEstadoInicial[${i}].productoId ("${productos[i].productoId}") — deben estar en el mismo orden canónico`,
        { indice: i, eventoProductoId: eventos[i].productoId, productoEsperado: productos[i].productoId }
      );
    }
  }
}

function validarOutput(salida) {
  if (!esObjetoPlano(salida)) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'la salida de K01 debe ser un objeto');
  }
  validarKernel(salida.kernel);
  const contexto = validarContextoSalida(salida.contexto);
  validarEmpresaEstadoInicial(salida.empresaEstadoInicial);
  validarProductosEstadoInicial(salida.productosEstadoInicial);
  validarEventos(salida.eventos, contexto);
  validarIntegridadProductoEvento(salida.productosEstadoInicial, salida.eventos);
  if (!esArray(salida.advertencias)) {
    throw new KernelError('ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', 'advertencias debe ser un array');
  }
}

module.exports = { validarOutput };
