const { KernelError } = require('./errors');
const { isDeepStrictEqual } = require('node:util');

// Motor SimNego V2 — helpers de validación estricta, sin coerción silenciosa.
// Ningún helper aplica `|| valorPorDefecto` sobre un valor numérico: 0 es un
// valor válido y debe preservarse tal cual llega, nunca reemplazado.

function esStringNoVacio(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function esNumeroFinito(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function esNumeroFinitoNoNegativo(v) {
  return esNumeroFinito(v) && v >= 0;
}

function esEnteroFinitoNoNegativo(v) {
  return esNumeroFinito(v) && Number.isInteger(v) && v >= 0;
}

function esBooleano(v) {
  return typeof v === 'boolean';
}

function esArray(v) {
  return Array.isArray(v);
}

function esObjetoPlano(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function sonEstructuralmenteIguales(a, b) {
  return isDeepStrictEqual(a, b);
}

// Corrección 4 (V2-2D): valida recursivamente que `valor` esté compuesto
// EXCLUSIVAMENTE por tipos clonables de forma inequívoca: null, boolean,
// string, number finito, arrays y objetos planos (Object.prototype o null).
// Rechaza explícitamente: undefined, NaN, Infinity, BigInt, Symbol, Function,
// Date, Map, Set, instancias de clase y referencias circulares. NUNCA usa
// JSON.parse(JSON.stringify(...)) como mecanismo de validación (eso permite
// que Date/undefined pasen silenciosamente transformados en vez de rechazados).
function validarEstructuraClonable(valor, ruta = '$', vistos = new WeakSet()) {
  if (valor === null) return;
  const tipo = typeof valor;

  if (tipo === 'boolean' || tipo === 'string') return;

  if (tipo === 'number') {
    if (!Number.isFinite(valor)) {
      throw new KernelError('ERROR_BLOQUEANTE_ESTRUCTURA_NO_CLONABLE', `${ruta}: number no finito (NaN/Infinity) no es clonable`, { ruta, valor });
    }
    return;
  }

  if (tipo === 'undefined') {
    throw new KernelError('ERROR_BLOQUEANTE_ESTRUCTURA_NO_CLONABLE', `${ruta}: undefined no es clonable`, { ruta });
  }
  if (tipo === 'bigint') {
    throw new KernelError('ERROR_BLOQUEANTE_ESTRUCTURA_NO_CLONABLE', `${ruta}: BigInt no es clonable`, { ruta });
  }
  if (tipo === 'symbol') {
    throw new KernelError('ERROR_BLOQUEANTE_ESTRUCTURA_NO_CLONABLE', `${ruta}: Symbol no es clonable`, { ruta });
  }
  if (tipo === 'function') {
    throw new KernelError('ERROR_BLOQUEANTE_ESTRUCTURA_NO_CLONABLE', `${ruta}: Function no es clonable`, { ruta });
  }

  // tipo === 'object' a partir de aquí (ya se descartó null arriba).
  if (vistos.has(valor)) {
    throw new KernelError('ERROR_BLOQUEANTE_ESTRUCTURA_NO_CLONABLE', `${ruta}: referencia circular detectada`, { ruta });
  }
  vistos.add(valor);

  if (Array.isArray(valor)) {
    valor.forEach((item, idx) => validarEstructuraClonable(item, `${ruta}[${idx}]`, vistos));
    return;
  }

  if (!esObjetoPlano(valor)) {
    const nombreTipo = valor?.constructor?.name || Object.prototype.toString.call(valor);
    throw new KernelError('ERROR_BLOQUEANTE_ESTRUCTURA_NO_CLONABLE', `${ruta}: ${nombreTipo} no es un objeto plano clonable (Date/Map/Set/instancia de clase rechazados)`, { ruta, tipo: nombreTipo });
  }

  for (const [clave, sub] of Object.entries(valor)) {
    validarEstructuraClonable(sub, `${ruta}.${clave}`, vistos);
  }
}

// Clon profundo: valida primero con validarEstructuraClonable (rechazando
// explícitamente lo no permitido) y clona con structuredClone — nunca con
// JSON.parse(JSON.stringify(...)), que transformaría silenciosamente en vez
// de rechazar (Corrección 4, V2-2D).
function clonarProfundo(valor) {
  validarEstructuraClonable(valor);
  return structuredClone(valor);
}

function validarPedidosPendientes(pedidosPendientes, ruta = 'pedidosPendientes', codigoError = 'ERROR_BLOQUEANTE_PEDIDO_PENDIENTE_INVALIDO') {
  if (!esArray(pedidosPendientes)) {
    throw new KernelError(codigoError, `${ruta} debe ser un array`, { ruta });
  }

  pedidosPendientes.forEach((pedido, idx) => {
    const rutaPedido = `${ruta}[${idx}]`;
    if (!esObjetoPlano(pedido)) {
      throw new KernelError(codigoError, `${rutaPedido} debe ser un objeto plano clonable`, { ruta: rutaPedido });
    }
    try {
      validarEstructuraClonable(pedido, rutaPedido);
    } catch (e) {
      if (e instanceof KernelError) {
        throw new KernelError(codigoError, `${rutaPedido} contiene una estructura no clonable`, { ruta: rutaPedido, causa: e.code });
      }
      throw e;
    }
  });
}

module.exports = {
  esStringNoVacio,
  esNumeroFinito,
  esNumeroFinitoNoNegativo,
  esEnteroFinitoNoNegativo,
  esBooleano,
  esArray,
  esObjetoPlano,
  sonEstructuralmenteIguales,
  clonarProfundo,
  validarEstructuraClonable,
  validarPedidosPendientes,
};
