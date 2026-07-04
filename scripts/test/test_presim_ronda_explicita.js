const assert = require('assert');
const { _test } = require('../../server');
const pool = require('../../src/db');

const {
  resolverRondaPreSimulacion,
  validarRondaPreSimulacion,
  soloCambiaPreSimulacion,
} = _test;

const sim = {
  id: 'sim_test',
  config: {
    currentRound: 7,
    totalRounds: 20,
    roundState: 'open',
  },
};

const ronda6 = {
  estado: 'calculada',
  decisiones: { eq_raiz: { submitted: true, producto: 'Sneaker Cultural Premium' } },
  resultados: { eq_raiz: { ventasReales: 100 } },
  reportes: { eq_raiz: { ok: true } },
  preSimulacion: { viejo: { producto: 'Duplicado' } },
};

{
  const r = resolverRondaPreSimulacion({}, sim);
  assert.deepStrictEqual(r, { ok: true, rondaNumero: 7, explicita: false });
  assert.strictEqual(validarRondaPreSimulacion(r, sim, { estado: 'open' }).ok, true);
}

{
  const r = resolverRondaPreSimulacion({ rondaNumero: 6 }, sim);
  assert.deepStrictEqual(r, { ok: true, rondaNumero: 6, explicita: true });
  assert.strictEqual(validarRondaPreSimulacion(r, sim, ronda6).ok, true);
}

for (const rondaNumero of [0, -1, 6.5, '6', 'texto']) {
  const r = resolverRondaPreSimulacion({ rondaNumero }, sim);
  assert.strictEqual(r.ok, false, `debe rechazar ${rondaNumero}`);
  assert.strictEqual(r.status, 400);
}

{
  const r = resolverRondaPreSimulacion({ rondaNumero: 21 }, sim);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.status, 400);
}

{
  const r = resolverRondaPreSimulacion({ rondaNumero: 6 }, sim);
  const validacion = validarRondaPreSimulacion(r, sim, null);
  assert.strictEqual(validacion.ok, false);
  assert.strictEqual(validacion.status, 400);
  assert.strictEqual(validacion.error, 'Sin ronda');
}

{
  const nuevaPreSim = {
    eq_raiz__prod_1: { producto: 'Sneaker Cultural Premium' },
    eq_raiz__prod_2: { producto: 'Calzado Médico Especializado' },
  };
  const propuesta = { ...ronda6, preSimulacion: nuevaPreSim };
  assert.strictEqual(soloCambiaPreSimulacion(ronda6, propuesta), true);
  assert.deepStrictEqual(propuesta.decisiones, ronda6.decisiones);
  assert.deepStrictEqual(propuesta.resultados, ronda6.resultados);
  assert.deepStrictEqual(propuesta.reportes, ronda6.reportes);
}

{
  const propuesta = {
    ...ronda6,
    preSimulacion: {},
    resultados: { eq_raiz: { ventasReales: 999 } },
  };
  assert.strictEqual(soloCambiaPreSimulacion(ronda6, propuesta), false);
}

{
  const rondas = {
    6: ronda6,
    7: { estado: 'open', preSimulacion: { intacta: true } },
  };
  const nuevaPreSim = {
    eq_raiz__prod_1: { producto: 'Sneaker Cultural Premium' },
    eq_raiz__prod_2: { producto: 'Calzado Médico Especializado' },
  };
  const actualizadas = { ...rondas, 6: { ...rondas[6], preSimulacion: nuevaPreSim } };
  assert.deepStrictEqual(actualizadas[7], rondas[7]);
  assert.deepStrictEqual(actualizadas[6].decisiones, rondas[6].decisiones);
  assert.deepStrictEqual(actualizadas[6].resultados, rondas[6].resultados);
}

console.log('presim ronda explicita OK');
pool.end().finally(() => process.exit(0));
