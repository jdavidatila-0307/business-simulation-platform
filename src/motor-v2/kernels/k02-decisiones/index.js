const { validarInput } = require('./validate-input');
const { calcularInterno } = require('./calculate');
const { validarOutput } = require('./validate-output');
const { clonarProfundo, sonEstructuralmenteIguales } = require('../../shared/validation');
const { KernelError } = require('../../shared/errors');
const { CODIGO, NOMBRE, VERSION } = require('./version');

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
  const refsEntrada = new WeakSet();
  registrarReferencias(entrada, refsEntrada);
  const recorrer = (valor, ruta = '$', visitados = new WeakSet()) => {
    if (valor === null || typeof valor !== 'object' || visitados.has(valor)) return;
    if (refsEntrada.has(valor)) {
      throw new KernelError('ERROR_BLOQUEANTE_REFERENCIA_COMPARTIDA_K02', `salida comparte referencia con entrada en ${ruta}`, { ruta });
    }
    visitados.add(valor);
    if (Array.isArray(valor)) {
      valor.forEach((item, idx) => recorrer(item, `${ruta}[${idx}]`, visitados));
      return;
    }
    Object.entries(valor).forEach(([k, item]) => recorrer(item, `${ruta}.${k}`, visitados));
  };
  recorrer(salida);
}

function validarEntradaNoMutada(entrada, snapshot) {
  if (!sonEstructuralmenteIguales(entrada, snapshot)) {
    throw new KernelError('ERROR_BLOQUEANTE_MUTACION_ENTRADA_K02', 'K02 muto su entrada durante el calculo');
  }
}

function calcular(entrada) {
  validarInput(entrada);
  const snapshot = clonarProfundo(entrada);
  const salida = calcularInterno(entrada);

  validarEntradaNoMutada(entrada, snapshot);

  validarOutput(salida, entrada);
  validarEntradaNoMutada(entrada, snapshot);
  validarIndependenciaReferencias(entrada, salida);
  return congelarProfundo(salida);
}

module.exports = {
  codigo: CODIGO,
  nombre: NOMBRE,
  version: VERSION,
  calcular,
  _internalsParaPruebas: {
    validarInput,
    calcularInterno,
    validarOutput,
    validarIndependenciaReferencias,
    validarEntradaNoMutada,
    congelarProfundo,
  },
};
