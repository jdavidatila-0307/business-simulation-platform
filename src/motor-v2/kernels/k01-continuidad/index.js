const { validarInput, CAMPOS_EMPRESA_NO_NEGATIVOS, CAMPOS_EMPRESA_FINITOS_CON_SIGNO } = require('./validate-input');
const { calcularInterno } = require('./calculate');
const { validarOutput } = require('./validate-output');
const { clonarProfundo, esObjetoPlano, sonEstructuralmenteIguales } = require('../../shared/validation');
const { KernelError } = require('../../shared/errors');
const { CODIGO, NOMBRE, VERSION } = require('./version');

const CAMPOS_CONTINUIDAD_LITERAL = [...CAMPOS_EMPRESA_NO_NEGATIVOS, ...CAMPOS_EMPRESA_FINITOS_CON_SIGNO];

// Corrección 1 (V2-2C): verificación EN TIEMPO DE EJECUCIÓN de que
// empresaEstadoInicial es una copia literal de empresaEstadoFinalAnterior
// para cada campo continuable — recibe la ENTRADA REAL (no solo valida
// tipos/formas de la salida en aislamiento, como hace validate-output.js).
function validarContinuidadLiteral(empresaEstadoFinalAnterior, empresaEstadoInicial) {
  for (const campo of CAMPOS_CONTINUIDAD_LITERAL) {
    if (empresaEstadoInicial[campo] !== empresaEstadoFinalAnterior[campo]) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_CONTINUIDAD_EMPRESARIAL_VIOLADA',
        `empresaEstadoInicial.${campo} no coincide literalmente con empresaEstadoFinalAnterior.${campo}`,
        { campo, esperado: empresaEstadoFinalAnterior[campo], obtenido: empresaEstadoInicial[campo] }
      );
    }
  }
  if (!sonEstructuralmenteIguales(empresaEstadoInicial.pedidosPendientes, empresaEstadoFinalAnterior.pedidosPendientes)) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_CONTINUIDAD_EMPRESARIAL_VIOLADA',
      'empresaEstadoInicial.pedidosPendientes no coincide estructuralmente con empresaEstadoFinalAnterior.pedidosPendientes',
      { campo: 'pedidosPendientes' }
    );
  }
  if (empresaEstadoInicial.pedidosPendientes === empresaEstadoFinalAnterior.pedidosPendientes) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_CONTINUIDAD_EMPRESARIAL_VIOLADA',
      'empresaEstadoInicial.pedidosPendientes debe ser una referencia distinta a la de la entrada (clon, no alias)',
      { campo: 'pedidosPendientes' }
    );
  }
}

// Corrección 1 (V2-2D): igualdad estricta de contexto entrada/salida.
function validarContinuidadContexto(contextoEntrada, contextoSalida) {
  const campos = ['simulacionId', 'empresaId', 'rondaAnterior', 'rondaDestino'];
  for (const campo of campos) {
    if (contextoSalida[campo] !== contextoEntrada[campo]) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_CONTEXTO_K01_ALTERADO',
        `contexto.${campo} de la salida (${contextoSalida[campo]}) no coincide con el de la entrada (${contextoEntrada[campo]})`,
        { campo, esperado: contextoEntrada[campo], obtenido: contextoSalida[campo] }
      );
    }
  }
}

// Corrección 2 (V2-2D): conciliación producto por producto contra la entrada
// real (productosEstadoFinalAnterior + productosDecisionDestino), verificando
// exactamente las reglas de cada acción — nunca permite que un producto
// reciba inventario/costo/historial de otro producto de la misma empresa.
function validarContinuidadProductos(productosEstadoFinalAnterior, productosDecisionDestino, productosEstadoInicial) {
  if (productosEstadoInicial.length !== productosDecisionDestino.length) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA',
      `productosEstadoInicial.length (${productosEstadoInicial.length}) debe ser igual a productosDecisionDestino.length (${productosDecisionDestino.length}) — ningún producto extra o ausente`,
      { salidaLength: productosEstadoInicial.length, decisionesLength: productosDecisionDestino.length }
    );
  }

  const anterioresPorId = new Map(productosEstadoFinalAnterior.map(p => [p.productoId, p]));
  const decisionesPorId = new Map(productosDecisionDestino.map(d => [d.productoId, d]));
  const salidaPorId = new Map(productosEstadoInicial.map(p => [p.productoId, p]));

  for (const d of productosDecisionDestino) {
    const salida = salidaPorId.get(d.productoId);
    if (!salida) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA',
        `no existe producto de salida para la decisión con productoId "${d.productoId}" — ningún producto puede quedar ausente`,
        { productoId: d.productoId }
      );
    }
    const anterior = anterioresPorId.get(d.productoId);

    const falla = (motivo, detalles) => {
      throw new KernelError(
        'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA',
        `producto "${d.productoId}" (accion=${d.accion}): ${motivo}`,
        { productoId: d.productoId, accion: d.accion, ...detalles }
      );
    };

    if (d.accion === 'CONTINUAR') {
      if (salida.origen !== 'CONTINUO') falla('salida.origen debe ser CONTINUO', { origen: salida.origen });
      if (salida.activo !== true) falla('salida.activo debe ser true', { activo: salida.activo });
      if (salida.inventarioInicial !== anterior.inventarioFinal) falla('inventarioInicial debe ser exactamente el inventarioFinal anterior', { esperado: anterior.inventarioFinal, obtenido: salida.inventarioInicial });
      if (salida.costoUnitarioInventario !== anterior.costoUnitarioInventario) falla('costoUnitarioInventario debe ser exactamente el costo anterior', { esperado: anterior.costoUnitarioInventario, obtenido: salida.costoUnitarioInventario });
      if (!sonEstructuralmenteIguales(salida.historialContable, anterior.historialContable)) falla('historialContable debe ser estructuralmente igual al historial anterior', {});
      if (salida.historialContable === anterior.historialContable) falla('historialContable no debe compartir referencia con el historial anterior', {});
      if (!sonEstructuralmenteIguales(salida.estrategiaDestino, d.estrategia)) falla('estrategiaDestino debe ser estructuralmente igual a la estrategia de la decisión', {});
      if (salida.estrategiaDestino === d.estrategia) falla('estrategiaDestino no debe compartir referencia con la estrategia de la decisión', {});
    } else if (d.accion === 'CREAR') {
      if (salida.origen !== 'NUEVO') falla('salida.origen debe ser NUEVO', { origen: salida.origen });
      if (salida.activo !== true) falla('salida.activo debe ser true', { activo: salida.activo });
      if (salida.inventarioInicial !== 0) falla('inventarioInicial debe ser 0', { obtenido: salida.inventarioInicial });
      if (salida.costoUnitarioInventario !== 0) falla('costoUnitarioInventario debe ser 0', { obtenido: salida.costoUnitarioInventario });
      if (!esObjetoPlano(salida.historialContable) || Object.keys(salida.historialContable).length !== 0) falla('historialContable debe ser un objeto vacío', {});
      if (!sonEstructuralmenteIguales(salida.estrategiaDestino, d.estrategia)) falla('estrategiaDestino debe ser igual a la decisión actual', {});
    } else if (d.accion === 'DESCONTINUAR') {
      if (salida.origen !== 'DESCONTINUADO') falla('salida.origen debe ser DESCONTINUADO', { origen: salida.origen });
      if (salida.activo !== false) falla('salida.activo debe ser false', { activo: salida.activo });
      if (salida.inventarioInicial !== anterior.inventarioFinal) falla('inventarioInicial debe ser exactamente el inventarioFinal anterior', { esperado: anterior.inventarioFinal, obtenido: salida.inventarioInicial });
      if (salida.costoUnitarioInventario !== anterior.costoUnitarioInventario) falla('costoUnitarioInventario debe ser exactamente el costo anterior', { esperado: anterior.costoUnitarioInventario, obtenido: salida.costoUnitarioInventario });
      if (!sonEstructuralmenteIguales(salida.historialContable, anterior.historialContable)) falla('historialContable debe ser igual al historial anterior', {});
      if (salida.estrategiaDestino !== null) falla('estrategiaDestino debe ser null', { obtenido: salida.estrategiaDestino });
    } else if (d.accion === 'REACTIVAR') {
      if (salida.origen !== 'REACTIVADO') falla('salida.origen debe ser REACTIVADO', { origen: salida.origen });
      if (salida.activo !== true) falla('salida.activo debe ser true', { activo: salida.activo });
      if (salida.inventarioInicial !== anterior.inventarioFinal) falla('inventarioInicial debe ser exactamente el inventarioFinal propio anterior', { esperado: anterior.inventarioFinal, obtenido: salida.inventarioInicial });
      if (salida.costoUnitarioInventario !== anterior.costoUnitarioInventario) falla('costoUnitarioInventario debe ser exactamente el costo propio anterior', { esperado: anterior.costoUnitarioInventario, obtenido: salida.costoUnitarioInventario });
      if (!sonEstructuralmenteIguales(salida.historialContable, anterior.historialContable)) falla('historialContable debe ser igual al historial propio anterior', {});
      if (!sonEstructuralmenteIguales(salida.estrategiaDestino, d.estrategia)) falla('estrategiaDestino debe ser igual exclusivamente a la decisión actual', {});
    }
  }

  // Ningún producto de salida puede corresponder a un productoId ajeno a las
  // decisiones (ya cubierto por la igualdad de longitudes + el bucle anterior,
  // pero se verifica explícitamente para blindar contra un productoId de
  // salida que no aparezca en absoluto entre las decisiones).
  for (const p of productosEstadoInicial) {
    if (!decisionesPorId.has(p.productoId)) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA',
        `producto de salida "${p.productoId}" no corresponde a ninguna decisión en productosDecisionDestino`,
        { productoId: p.productoId }
      );
    }
  }
}

// Congela profundamente un valor (objetos y arrays anidados) para proteger la
// salida contra mutación accidental por parte del llamador.
function congelarProfundo(valor) {
  if (Array.isArray(valor)) {
    valor.forEach(congelarProfundo);
    return Object.freeze(valor);
  }
  if (valor !== null && typeof valor === 'object') {
    Object.values(valor).forEach(congelarProfundo);
    return Object.freeze(valor);
  }
  return valor;
}

function registrarReferencias(valor, referencias, visitados = new WeakSet()) {
  if (valor === null || typeof valor !== 'object' || visitados.has(valor)) return;
  visitados.add(valor);
  referencias.add(valor);
  if (Array.isArray(valor)) {
    valor.forEach(item => registrarReferencias(item, referencias, visitados));
    return;
  }
  Object.values(valor).forEach(item => registrarReferencias(item, referencias, visitados));
}

function validarIndependenciaReferencias(entrada, salida) {
  const referenciasEntrada = new WeakSet();
  registrarReferencias(entrada, referenciasEntrada);

  const recorrerSalida = (valor, ruta = '$', visitados = new WeakSet()) => {
    if (valor === null || typeof valor !== 'object' || visitados.has(valor)) return;
    if (referenciasEntrada.has(valor)) {
      throw new KernelError(
        'ERROR_BLOQUEANTE_REFERENCIA_COMPARTIDA_ENTRADA_SALIDA',
        `la salida comparte referencia mutable con la entrada en ${ruta}`,
        { ruta }
      );
    }
    visitados.add(valor);
    if (Array.isArray(valor)) {
      valor.forEach((item, idx) => recorrerSalida(item, `${ruta}[${idx}]`, visitados));
      return;
    }
    Object.entries(valor).forEach(([clave, item]) => recorrerSalida(item, `${ruta}.${clave}`, visitados));
  };

  recorrerSalida(salida);
}

function calcular(entrada) {
  validarInput(entrada);

  // Snapshot de la entrada ANTES de calcular, para detectar si calculate.js
  // mutó accidentalmente la entrada (no debe hacerlo nunca).
  const snapshotEntrada = clonarProfundo(entrada);

  const salida = calcularInterno(entrada);

  if (!sonEstructuralmenteIguales(entrada, snapshotEntrada)) {
    throw new KernelError(
      'ERROR_BLOQUEANTE_MUTACION_DE_ENTRADA',
      'K01 mutó su propia entrada durante el cálculo — esto viola el contrato de pureza del núcleo'
    );
  }

  validarOutput(salida);

  // Corrección 1 (V2-2C): continuidad literal de saldos empresariales.
  validarContinuidadLiteral(entrada.empresaEstadoFinalAnterior, salida.empresaEstadoInicial);

  // Corrección 1 (V2-2D): igualdad estricta de contexto entrada/salida.
  validarContinuidadContexto(entrada.contexto, salida.contexto);

  // Corrección 2 (V2-2D): conciliación completa producto por producto contra
  // la entrada real.
  validarContinuidadProductos(entrada.productosEstadoFinalAnterior, entrada.productosDecisionDestino, salida.productosEstadoInicial);

  validarIndependenciaReferencias(entrada, salida);

  return congelarProfundo(salida);
}

module.exports = {
  codigo: CODIGO,
  nombre: NOMBRE,
  version: VERSION,
  calcular,
  // Vía explícita de prueba interna: permite a las pruebas construir entradas
  // y salidas manualmente inválidas y verificar que las funciones productivas
  // (las MISMAS que invoca calcular) las rechazan.
  _internalsParaPruebas: {
    validarOutput,
    validarContinuidadLiteral,
    validarContinuidadContexto,
    validarContinuidadProductos,
    validarIndependenciaReferencias,
  },
};
