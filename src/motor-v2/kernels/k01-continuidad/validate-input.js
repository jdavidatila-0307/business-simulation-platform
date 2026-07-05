const { createHash } = require('node:crypto');
const { KernelError } = require('../../shared/errors');
const {
  esStringNoVacio,
  esNumeroFinito,
  esNumeroFinitoNoNegativo,
  esEnteroFinitoNoNegativo,
  esBooleano,
  esArray,
  esObjetoPlano,
  validarPedidosPendientes,
} = require('../../shared/validation');

const ACCIONES_VALIDAS = ['CONTINUAR', 'CREAR', 'DESCONTINUAR', 'REACTIVAR'];

const CAMPOS_EMPRESA_NO_NEGATIVOS = [
  'caja', 'cuentasPorCobrar', 'stockMP', 'cxpProveedoresMP',
  'anticiposProveedores', 'capacidadProductiva', 'operarios', 'vendedores',
  'activos', 'depreciacionAcumulada', 'deudaFinanciera', 'saldoSobregiro',
  'interesesPorPagar', 'capitalAportado', 'reservas', 'provisionIUEEnCurso',
  'iueDeterminadoPorPagar', 'creditoIUECompensable', 'ivaSaldoFavor', 'ivaPorPagar',
];

// resultadosAcumulados puede ser negativo (pérdida acumulada legítima) — se
// valida solo por finitud, nunca por no-negatividad.
const CAMPOS_EMPRESA_FINITOS_CON_SIGNO = ['resultadosAcumulados'];

const CAMPOS_ESTRATEGICOS = [
  'precio', 'segmento', 'canalPrincipal', 'canalSecundario',
  'produccionSolicitada', 'calidad', 'marketing', 'innovacion',
];

// Comparación ordinal por unidades de código UTF-16, independiente de locale
// (Corrección 6) — NUNCA usar localeCompare.
function compararOrdinal(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Corrección 3 (V2-2D): generación CENTRALIZADA y determinista del eventId,
// compartida por calculate.js (al construir eventos) y validate-output.js
// (al RECALCULAR el hash esperado y compararlo contra el recibido). Misma
// serialización canónica, mismos campos, mismo orden — SHA-256 hex.
function crearEventIdK01({ simulacionId, empresaId, productoId, rondaDestino, eventType, version }) {
  const material = JSON.stringify([simulacionId, empresaId, productoId, rondaDestino, eventType, version]);
  return createHash('sha256').update(material).digest('hex');
}

function validarContexto(contexto) {
  if (!esObjetoPlano(contexto)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'contexto ausente o inválido');
  }
  if (!esStringNoVacio(contexto.simulacionId)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'contexto.simulacionId debe ser un string no vacío');
  }
  if (!esStringNoVacio(contexto.empresaId)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'contexto.empresaId debe ser un string no vacío (identidad canónica explícita)');
  }
  if (!esEnteroFinitoNoNegativo(contexto.rondaAnterior)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'contexto.rondaAnterior debe ser un entero >= 0');
  }
  if (!Number.isInteger(contexto.rondaDestino) || contexto.rondaDestino !== contexto.rondaAnterior + 1) {
    throw new KernelError('ERROR_BLOQUEANTE_RONDA_DESTINO_INVALIDA', 'contexto.rondaDestino debe ser exactamente contexto.rondaAnterior + 1');
  }
  if (!esStringNoVacio(contexto.versionMotor)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'contexto.versionMotor debe ser un string no vacío');
  }
}

function validarEmpresaEstadoFinalAnterior(estado) {
  if (!esObjetoPlano(estado)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'empresaEstadoFinalAnterior ausente o inválido');
  }
  for (const campo of CAMPOS_EMPRESA_NO_NEGATIVOS) {
    if (!esNumeroFinitoNoNegativo(estado[campo])) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO',
        `empresaEstadoFinalAnterior.${campo} debe ser un número finito >= 0`,
        { campo, valor: estado[campo] }
      );
    }
  }
  for (const campo of CAMPOS_EMPRESA_FINITOS_CON_SIGNO) {
    if (!esNumeroFinito(estado[campo])) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO',
        `empresaEstadoFinalAnterior.${campo} debe ser un número finito`,
        { campo, valor: estado[campo] }
      );
    }
  }
  if (!esArray(estado.pedidosPendientes)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'empresaEstadoFinalAnterior.pedidosPendientes debe ser un array');
  }
  validarPedidosPendientes(estado.pedidosPendientes, 'empresaEstadoFinalAnterior.pedidosPendientes');
  // Corrección 4: produccionEnProcesoFinalAnterior — el campo es OPCIONAL
  // (puede estar ausente). Si está presente, debe ser number finito y
  // exactamente 0; nunca se propaga a la salida (ver calculate.js).
  if ('produccionEnProcesoFinalAnterior' in estado) {
    const v = estado.produccionEnProcesoFinalAnterior;
    if (!esNumeroFinito(v)) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO',
        'empresaEstadoFinalAnterior.produccionEnProcesoFinalAnterior, si existe, debe ser un número finito',
        { valor: v }
      );
    }
    if (v !== 0) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_PRODUCCION_INCOMPLETA',
        'produccionEnProcesoFinalAnterior debe ser 0 — no existe continuidad de producción en proceso entre rondas',
        { valor: v }
      );
    }
  }
}

function validarProductosEstadoFinalAnterior(productos) {
  if (!esArray(productos)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'productosEstadoFinalAnterior debe ser un array');
  }
  const vistos = new Set();
  productos.forEach((p, idx) => {
    if (!esObjetoPlano(p)) {
      throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', `productosEstadoFinalAnterior[${idx}] inválido`);
    }
    if (!esStringNoVacio(p.productoId)) {
      throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', `productosEstadoFinalAnterior[${idx}].productoId debe ser un string no vacío`);
    }
    if (vistos.has(p.productoId)) {
      throw new KernelError('ERROR_BLOQUEANTE_PRODUCTO_ID_DUPLICADO', `productoId duplicado en productosEstadoFinalAnterior: ${p.productoId}`, { productoId: p.productoId });
    }
    vistos.add(p.productoId);
    if (!esBooleano(p.activo)) {
      throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', `productosEstadoFinalAnterior[${idx}].activo debe ser boolean`);
    }
    if (!esEnteroFinitoNoNegativo(p.inventarioFinal)) {
      throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', `productosEstadoFinalAnterior[${idx}].inventarioFinal debe ser un entero >= 0`);
    }
    if (!esNumeroFinitoNoNegativo(p.costoUnitarioInventario)) {
      throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', `productosEstadoFinalAnterior[${idx}].costoUnitarioInventario debe ser un número >= 0`);
    }
    if (!esObjetoPlano(p.historialContable)) {
      throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', `productosEstadoFinalAnterior[${idx}].historialContable debe ser un objeto`);
    }
  });
}

// Corrección 3: validación estricta por campo, con tipo/rango exactos.
// codigoError distingue REACTIVAR (ERROR_BLOQUEANTE_CAMPOS_ESTRATEGICOS_REACTIVACION_AUSENTES)
// de CREAR (ERROR_BLOQUEANTE_ESTRATEGIA_PRODUCTO_NUEVO_INVALIDA).
function validarEstrategiaEstricta(estrategia, contextoMsg, codigoError) {
  if (!esObjetoPlano(estrategia)) {
    throw new KernelError(codigoError, `${contextoMsg}: estrategia ausente o inválida`);
  }
  for (const campo of CAMPOS_ESTRATEGICOS) {
    if (!(campo in estrategia) || estrategia[campo] === null || estrategia[campo] === undefined) {
      throw new KernelError(codigoError, `${contextoMsg}: falta el campo estratégico "${campo}"`, { campo });
    }
  }
  const { precio, segmento, canalPrincipal, canalSecundario, produccionSolicitada, calidad, marketing, innovacion } = estrategia;

  if (!esNumeroFinitoNoNegativo(precio)) {
    throw new KernelError(codigoError, `${contextoMsg}: precio debe ser un número finito >= 0`, { campo: 'precio', valor: precio });
  }
  if (!esStringNoVacio(segmento)) {
    throw new KernelError(codigoError, `${contextoMsg}: segmento debe ser un string no vacío (tras trim)`, { campo: 'segmento', valor: segmento });
  }
  if (!esStringNoVacio(canalPrincipal)) {
    throw new KernelError(codigoError, `${contextoMsg}: canalPrincipal debe ser un string no vacío (tras trim)`, { campo: 'canalPrincipal', valor: canalPrincipal });
  }
  if (!esStringNoVacio(canalSecundario)) {
    throw new KernelError(codigoError, `${contextoMsg}: canalSecundario debe ser un string no vacío (tras trim)`, { campo: 'canalSecundario', valor: canalSecundario });
  }
  if (!esEnteroFinitoNoNegativo(produccionSolicitada)) {
    throw new KernelError(codigoError, `${contextoMsg}: produccionSolicitada debe ser un entero finito >= 0`, { campo: 'produccionSolicitada', valor: produccionSolicitada });
  }
  if (!esNumeroFinitoNoNegativo(calidad)) {
    throw new KernelError(codigoError, `${contextoMsg}: calidad debe ser un número finito >= 0`, { campo: 'calidad', valor: calidad });
  }
  if (!esNumeroFinitoNoNegativo(marketing)) {
    throw new KernelError(codigoError, `${contextoMsg}: marketing debe ser un número finito >= 0`, { campo: 'marketing', valor: marketing });
  }
  if (!esBooleano(innovacion)) {
    throw new KernelError(codigoError, `${contextoMsg}: innovacion debe ser boolean`, { campo: 'innovacion', valor: innovacion });
  }
}

function validarProductosDecisionDestino(decisiones) {
  if (!esArray(decisiones)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'productosDecisionDestino debe ser un array');
  }
  const vistos = new Set();
  decisiones.forEach((d, idx) => {
    if (!esObjetoPlano(d)) {
      throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', `productosDecisionDestino[${idx}] inválido`);
    }
    if (!esStringNoVacio(d.productoId)) {
      throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', `productosDecisionDestino[${idx}].productoId debe ser un string no vacío`);
    }
    if (vistos.has(d.productoId)) {
      throw new KernelError('ERROR_BLOQUEANTE_PRODUCTO_ID_DUPLICADO', `productoId duplicado en productosDecisionDestino: ${d.productoId}`, { productoId: d.productoId });
    }
    vistos.add(d.productoId);
    if (!ACCIONES_VALIDAS.includes(d.accion)) {
      throw new KernelError('ERROR_BLOQUEANTE_ACCION_PRODUCTO_INVALIDA', `productosDecisionDestino[${idx}].accion debe ser una de ${ACCIONES_VALIDAS.join(', ')}`, { accion: d.accion });
    }
    if (!esBooleano(d.activo)) {
      throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', `productosDecisionDestino[${idx}].activo debe ser boolean`);
    }
    // Corrección 2: coherencia acción/activo, sin corrección silenciosa.
    const activoEsperado = d.accion !== 'DESCONTINUAR';
    if (d.activo !== activoEsperado) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_ACCION_ACTIVO_INCONSISTENTE',
        `productosDecisionDestino[${idx}]: accion=${d.accion} exige activo=${activoEsperado}, se recibió activo=${d.activo}`,
        { productoId: d.productoId, accion: d.accion, activoRecibido: d.activo }
      );
    }
    if (d.accion === 'CREAR') {
      validarEstrategiaEstricta(d.estrategia, `productosDecisionDestino[${idx}] (CREAR)`, 'ERROR_BLOQUEANTE_ESTRATEGIA_PRODUCTO_NUEVO_INVALIDA');
    }
    if (d.accion === 'REACTIVAR') {
      validarEstrategiaEstricta(d.estrategia, `productosDecisionDestino[${idx}] (REACTIVAR)`, 'ERROR_BLOQUEANTE_CAMPOS_ESTRATEGICOS_REACTIVACION_AUSENTES');
    }
    // Corrección 2 (V2-2C): CONTINUAR también exige estrategia completa y
    // válida — no debe dejarse pasar hasta validate-output como error genérico.
    if (d.accion === 'CONTINUAR') {
      validarEstrategiaEstricta(d.estrategia, `productosDecisionDestino[${idx}] (CONTINUAR)`, 'ERROR_BLOQUEANTE_ESTRATEGIA_PRODUCTO_CONTINUO_INVALIDA');
    }
    if (d.accion === 'DESCONTINUAR' && d.estrategia != null) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_ESTRATEGIA_EN_DESCONTINUACION',
        `productosDecisionDestino[${idx}]: DESCONTINUAR no admite campos estratégicos nuevos`,
        { productoId: d.productoId }
      );
    }
  });
}

// Corrección 1: cobertura total — cada producto anterior debe tener EXACTAMENTE
// una decisión destino, y ninguna decisión CONTINUAR/DESCONTINUAR/REACTIVAR
// puede referirse a un producto que no existía. CREAR es la única acción
// válida para un productoId inexistente.
function validarCoberturaYCorrespondencia(productosAnteriores, decisiones) {
  const idsAnteriores = new Set(productosAnteriores.map(p => p.productoId));
  const idsDecisiones = new Set(decisiones.map(d => d.productoId));

  for (const id of idsAnteriores) {
    if (!idsDecisiones.has(id)) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_PRODUCTO_SIN_DECISION_DESTINO',
        `El producto "${id}" existe en productosEstadoFinalAnterior pero no tiene ninguna decisión en productosDecisionDestino — ningún inventario o historial puede desaparecer por omisión`,
        { productoId: id }
      );
    }
  }

  for (const d of decisiones) {
    const existiaAntes = idsAnteriores.has(d.productoId);
    if (d.accion === 'CREAR' && existiaAntes) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_PRODUCTO_NUEVO_YA_EXISTENTE',
        `CREAR requiere un productoId que no exista previamente: ${d.productoId}`,
        { productoId: d.productoId }
      );
    }
    if (d.accion !== 'CREAR' && !existiaAntes) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_PRODUCTO_DESTINO_SIN_ANTECEDENTE',
        `La acción ${d.accion} requiere que el productoId "${d.productoId}" ya existiera en productosEstadoFinalAnterior`,
        { productoId: d.productoId, accion: d.accion }
      );
    }
  }
}

function validarInput(entrada) {
  if (!esObjetoPlano(entrada)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'entrada de K01 ausente o inválida');
  }
  validarContexto(entrada.contexto);
  validarEmpresaEstadoFinalAnterior(entrada.empresaEstadoFinalAnterior);
  validarProductosEstadoFinalAnterior(entrada.productosEstadoFinalAnterior);
  validarProductosDecisionDestino(entrada.productosDecisionDestino);
  validarCoberturaYCorrespondencia(entrada.productosEstadoFinalAnterior, entrada.productosDecisionDestino);
}

module.exports = {
  validarInput,
  ACCIONES_VALIDAS,
  CAMPOS_EMPRESA_NO_NEGATIVOS,
  CAMPOS_EMPRESA_FINITOS_CON_SIGNO,
  CAMPOS_ESTRATEGICOS,
  compararOrdinal,
  crearEventIdK01,
};
