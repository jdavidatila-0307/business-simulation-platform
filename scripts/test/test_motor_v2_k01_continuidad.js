// Pruebas aisladas de K01 — Continuidad (Motor SimNego V2), FASE V2-2B.
// Sin servidor, sin BD, sin engine.js. Ejecutar con: node scripts/test/test_motor_v2_k01_continuidad.js
const assert = require('assert');
const k01 = require('../../src/motor-v2/kernels/k01-continuidad');
const { KernelError } = require('../../src/motor-v2/shared/errors');
const { esStringNoVacio, esObjetoPlano, sonEstructuralmenteIguales } = require('../../src/motor-v2/shared/validation');
const { crearEventIdK01 } = require('../../src/motor-v2/kernels/k01-continuidad/validate-input');

function estadoEmpresaBase(overrides = {}) {
  return {
    caja: 100000, cuentasPorCobrar: 0, stockMP: 500, cxpProveedoresMP: 0,
    anticiposProveedores: 0, capacidadProductiva: 3000, operarios: 10,
    vendedores: 2, activos: 80000, depreciacionAcumulada: 0, deudaFinanciera: 0,
    saldoSobregiro: 0, interesesPorPagar: 0, capitalAportado: 96000, reservas: 0,
    resultadosAcumulados: 0, provisionIUEEnCurso: 0, iueDeterminadoPorPagar: 0,
    creditoIUECompensable: 0, ivaSaldoFavor: 0, ivaPorPagar: 0,
    pedidosPendientes: [],
    ...overrides,
  };
}

function contexto(overrides = {}) {
  return {
    simulacionId: 'sim_test', empresaId: 'empresa_test',
    rondaAnterior: 5, rondaDestino: 6, versionMotor: '2.0.0',
    ...overrides,
  };
}

function estrategiaCompleta(overrides = {}) {
  return {
    precio: 700, segmento: 'Jovenes', canalPrincipal: 'Digital',
    canalSecundario: 'Ninguno', produccionSolicitada: 1000, calidad: 7,
    marketing: 3000, innovacion: false,
    ...overrides,
  };
}

function entradaBase(overrides = {}) {
  return {
    contexto: contexto(),
    empresaEstadoFinalAnterior: estadoEmpresaBase(),
    productosEstadoFinalAnterior: [],
    productosDecisionDestino: [],
    ...overrides,
  };
}

function assertAborta(fn, codigoEsperado, mensaje) {
  try {
    fn();
    assert.fail(`Se esperaba que abortara con ${codigoEsperado}: ${mensaje}`);
  } catch (e) {
    assert.ok(e instanceof KernelError, `${mensaje}: se esperaba KernelError, se obtuvo ${e.constructor.name}: ${e.message}`);
    assert.strictEqual(e.code, codigoEsperado, `${mensaje}: código esperado ${codigoEsperado}, obtenido ${e.code} (${e.message})`);
  }
}

let numeroDeEjecucionesDeK01Calcular = 0;
const calcularOriginal = k01.calcular;
function calcularContado(entrada) {
  numeroDeEjecucionesDeK01Calcular++;
  return calcularOriginal(entrada);
}

// ============================================================================
// 1. Continuidad empresarial conserva todos los saldos
// ============================================================================
{
  const entrada = entradaBase();
  const salida = calcularContado(entrada);
  for (const campo of Object.keys(estadoEmpresaBase())) {
    if (campo === 'pedidosPendientes') continue;
    assert.strictEqual(salida.empresaEstadoInicial[campo], entrada.empresaEstadoFinalAnterior[campo], `campo ${campo} debe conservarse`);
  }
  console.log('1. Continuidad empresarial conserva todos los saldos: OK');
}

// ============================================================================
// 2. Cero válido permanece cero
// ============================================================================
{
  const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ caja: 0, cuentasPorCobrar: 0 }) });
  const salida = calcularContado(entrada);
  assert.strictEqual(salida.empresaEstadoInicial.caja, 0);
  assert.strictEqual(salida.empresaEstadoInicial.cuentasPorCobrar, 0);
  console.log('2. Cero válido permanece cero: OK');
}

// ============================================================================
// 3. La entrada no se modifica
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 50, costoUnitarioInventario: 10, historialContable: {} }],
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() }],
  });
  const antes = JSON.stringify(entrada);
  calcularContado(entrada);
  assert.strictEqual(JSON.stringify(entrada), antes, 'la entrada no debe mutarse');
  console.log('3. La entrada no se modifica: OK');
}

// ============================================================================
// 4. Producto continuo conserva inventario propio
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 358, costoUnitarioInventario: 42.5, historialContable: { ronda5: 'x' } }],
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() }],
  });
  const salida = calcularContado(entrada);
  const p = salida.productosEstadoInicial[0];
  assert.strictEqual(p.origen, 'CONTINUO');
  assert.strictEqual(p.inventarioInicial, 358);
  assert.strictEqual(p.costoUnitarioInventario, 42.5);
  assert.deepStrictEqual(p.historialContable, { ronda5: 'x' });
  console.log('4. Producto continuo conserva inventario propio: OK');
}

// ============================================================================
// 5. Producto nuevo inicia inventario en cero
// ============================================================================
{
  const entrada = entradaBase({
    productosDecisionDestino: [{ productoId: 'prod_2', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() }],
  });
  const salida = calcularContado(entrada);
  const p = salida.productosEstadoInicial[0];
  assert.strictEqual(p.origen, 'NUEVO');
  assert.strictEqual(p.inventarioInicial, 0);
  assert.strictEqual(p.costoUnitarioInventario, 0);
  console.log('5. Producto nuevo inicia inventario en cero: OK');
}

// ============================================================================
// 6. Producto nuevo no hereda datos de otro producto
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 2898, costoUnitarioInventario: 99, historialContable: { a: 1 } }],
    productosDecisionDestino: [
      { productoId: 'prod_1', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
      { productoId: 'prod_2', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() },
    ],
  });
  const salida = calcularContado(entrada);
  const nuevo = salida.productosEstadoInicial.find(p => p.productoId === 'prod_2');
  assert.strictEqual(nuevo.inventarioInicial, 0);
  assert.strictEqual(nuevo.costoUnitarioInventario, 0);
  assert.deepStrictEqual(nuevo.historialContable, {});
  console.log('6. Producto nuevo no hereda datos de otro producto: OK');
}

// ============================================================================
// 7. Producto descontinuado conserva inventario para liquidación posterior
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 120, costoUnitarioInventario: 15, historialContable: {} }],
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'DESCONTINUAR', activo: false, estrategia: null }],
  });
  const salida = calcularContado(entrada);
  const p = salida.productosEstadoInicial[0];
  assert.strictEqual(p.origen, 'DESCONTINUADO');
  assert.strictEqual(p.activo, false);
  assert.strictEqual(p.inventarioInicial, 120, 'el inventario no debe eliminarse, K05 liquidará después');
  console.log('7. Producto descontinuado conserva inventario para liquidación posterior: OK');
}

// ============================================================================
// 8. Producto descontinuado no admite producción nueva (estrategiaDestino null)
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 10, costoUnitarioInventario: 5, historialContable: {} }],
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'DESCONTINUAR', activo: false, estrategia: null }],
  });
  const salida = calcularContado(entrada);
  assert.strictEqual(salida.productosEstadoInicial[0].estrategiaDestino, null);
  console.log('8. Producto descontinuado no admite producción nueva: OK');
}

// ============================================================================
// 9. Producto reactivado conserva su propio historial
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: false, inventarioFinal: 30, costoUnitarioInventario: 8, historialContable: { rondaBaja: 4 } }],
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'REACTIVAR', activo: true, estrategia: estrategiaCompleta({ precio: 999 }) }],
  });
  const salida = calcularContado(entrada);
  const p = salida.productosEstadoInicial[0];
  assert.strictEqual(p.origen, 'REACTIVADO');
  assert.strictEqual(p.inventarioInicial, 30);
  assert.deepStrictEqual(p.historialContable, { rondaBaja: 4 });
  console.log('9. Producto reactivado conserva su propio historial: OK');
}

// ============================================================================
// 10. Producto reactivado no hereda estrategia antigua
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: false, inventarioFinal: 0, costoUnitarioInventario: 0, historialContable: {} }],
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'REACTIVAR', activo: true, estrategia: estrategiaCompleta({ precio: 555, segmento: 'Nuevo segmento' }) }],
  });
  const salida = calcularContado(entrada);
  assert.strictEqual(salida.productosEstadoInicial[0].estrategiaDestino.precio, 555);
  assert.strictEqual(salida.productosEstadoInicial[0].estrategiaDestino.segmento, 'Nuevo segmento');
  console.log('10. Producto reactivado no hereda estrategia antigua (usa la declarada ahora): OK');
}

// ============================================================================
// 11. Reactivación sin uno de los ocho campos estratégicos aborta
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: false, inventarioFinal: 0, costoUnitarioInventario: 0, historialContable: {} }],
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'REACTIVAR', activo: true, estrategia: (() => { const e = estrategiaCompleta(); delete e.canalSecundario; return e; })() }],
  });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_CAMPOS_ESTRATEGICOS_REACTIVACION_AUSENTES', 'reactivación sin canalSecundario');
  console.log('11. Reactivación sin uno de los ocho campos estratégicos aborta: OK');
}

// ============================================================================
// 12. ProductoId duplicado aborta
// ============================================================================
{
  const entrada = entradaBase({
    productosDecisionDestino: [
      { productoId: 'prod_1', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() },
      { productoId: 'prod_1', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() },
    ],
  });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_PRODUCTO_ID_DUPLICADO', 'productoId duplicado');
  console.log('12. ProductoId duplicado aborta: OK');
}

// ============================================================================
// 13. empresaId ausente aborta
// ============================================================================
{
  const entrada = entradaBase({ contexto: contexto({ empresaId: '' }) });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'empresaId vacío');
  console.log('13. empresaId ausente aborta: OK');
}

// ============================================================================
// 14. rondaDestino inválida aborta
// ============================================================================
{
  const entrada = entradaBase({ contexto: contexto({ rondaAnterior: 5, rondaDestino: 8 }) });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_RONDA_DESTINO_INVALIDA', 'rondaDestino != rondaAnterior+1');
  console.log('14. rondaDestino inválida aborta: OK');
}

// ============================================================================
// 15. NaN aborta
// ============================================================================
{
  const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ caja: NaN }) });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'caja NaN');
  console.log('15. NaN aborta: OK');
}

// ============================================================================
// 16. Infinity aborta
// ============================================================================
{
  const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ stockMP: Infinity }) });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'stockMP Infinity');
  console.log('16. Infinity aborta: OK');
}

// ============================================================================
// 17. Cantidad física negativa aborta
// ============================================================================
{
  const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ stockMP: -5 }) });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', 'stockMP negativo');
  console.log('17. Cantidad física negativa aborta: OK');
}

// ============================================================================
// 18. Producción en proceso heredada distinta de cero aborta
// ============================================================================
{
  const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ produccionEnProcesoFinalAnterior: 40 }) });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_PRODUCCION_INCOMPLETA', 'produccion en proceso != 0');
  console.log('18. Producción en proceso heredada distinta de cero aborta: OK');
}

// ============================================================================
// 19. Acción CREAR sobre producto existente aborta
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 0, costoUnitarioInventario: 0, historialContable: {} }],
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() }],
  });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_PRODUCTO_NUEVO_YA_EXISTENTE', 'CREAR sobre producto existente');
  console.log('19. Acción CREAR sobre producto existente aborta: OK');
}

// ============================================================================
// 20. Acción CONTINUAR sobre producto inexistente aborta
// ============================================================================
{
  const entrada = entradaBase({
    productosDecisionDestino: [{ productoId: 'prod_nunca_existio', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() }],
  });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_PRODUCTO_DESTINO_SIN_ANTECEDENTE', 'CONTINUAR sobre producto inexistente');
  console.log('20. Acción CONTINUAR sobre producto inexistente aborta: OK');
}

// ============================================================================
// 21. Orden diferente de productos produce salida canónica determinista
//     (incluye mayúsculas, minúsculas, números, guion y Unicode — Corrección 6)
// ============================================================================
{
  const productosAnteriores = [
    { productoId: 'prod-2', activo: true, inventarioFinal: 20, costoUnitarioInventario: 2, historialContable: {} },
    { productoId: 'Prod_1', activo: true, inventarioFinal: 10, costoUnitarioInventario: 1, historialContable: {} },
    { productoId: 'ñprod', activo: true, inventarioFinal: 5, costoUnitarioInventario: 1, historialContable: {} },
  ];
  const decisionesOrdenA = [
    { productoId: 'Prod_1', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
    { productoId: 'prod-2', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
    { productoId: 'ñprod', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
  ];
  const decisionesOrdenB = [
    { productoId: 'ñprod', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
    { productoId: 'prod-2', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
    { productoId: 'Prod_1', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
  ];
  const salidaA = calcularContado(entradaBase({ productosEstadoFinalAnterior: productosAnteriores, productosDecisionDestino: decisionesOrdenA }));
  const salidaB = calcularContado(entradaBase({ productosEstadoFinalAnterior: productosAnteriores, productosDecisionDestino: decisionesOrdenB }));
  const idsA = salidaA.productosEstadoInicial.map(p => p.productoId);
  const idsB = salidaB.productosEstadoInicial.map(p => p.productoId);
  assert.deepStrictEqual(idsA, idsB, 'el orden de salida debe ser canónico, independiente del orden de entrada');
  // Orden ordinal esperado por unidades de código UTF-16: 'Prod_1' (P=0x50) <
  // 'prod-2' (p=0x70) < 'ñprod' (ñ=0xF1).
  assert.deepStrictEqual(idsA, ['Prod_1', 'prod-2', 'ñprod'], 'el orden debe ser ordinal (unidades de código), no por idioma/locale');
  console.log('21. Orden diferente de productos produce salida canónica determinista (ordinal, con Unicode): OK');
}

// ============================================================================
// 22. Mismo input produce mismos eventId
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 10, costoUnitarioInventario: 1, historialContable: {} }],
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() }],
  });
  const salida1 = calcularContado(entrada);
  const salida2 = calcularContado(entrada);
  assert.deepStrictEqual(salida1.eventos.map(e => e.eventId), salida2.eventos.map(e => e.eventId));
  console.log('22. Mismo input produce mismos eventId: OK');
}

// ============================================================================
// 23. Caso combinado con cinco productos: CONTINUAR, CREAR, DESCONTINUAR, REACTIVAR
// ============================================================================
{
  const productosAnteriores = [
    { productoId: 'prod_continua', activo: true, inventarioFinal: 100, costoUnitarioInventario: 10, historialContable: {} },
    { productoId: 'prod_descontinua', activo: true, inventarioFinal: 50, costoUnitarioInventario: 20, historialContable: {} },
    { productoId: 'prod_reactiva', activo: false, inventarioFinal: 5, costoUnitarioInventario: 3, historialContable: { bajaEn: 4 } },
    { productoId: 'prod_continua_2', activo: true, inventarioFinal: 0, costoUnitarioInventario: 0, historialContable: {} },
  ];
  const decisiones = [
    { productoId: 'prod_continua', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
    { productoId: 'prod_descontinua', accion: 'DESCONTINUAR', activo: false, estrategia: null },
    { productoId: 'prod_reactiva', accion: 'REACTIVAR', activo: true, estrategia: estrategiaCompleta({ precio: 123 }) },
    { productoId: 'prod_continua_2', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
    { productoId: 'prod_nueva', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() },
  ];
  const salida = calcularContado(entradaBase({ productosEstadoFinalAnterior: productosAnteriores, productosDecisionDestino: decisiones }));
  const porId = Object.fromEntries(salida.productosEstadoInicial.map(p => [p.productoId, p]));
  assert.strictEqual(porId.prod_continua.origen, 'CONTINUO');
  assert.strictEqual(porId.prod_descontinua.origen, 'DESCONTINUADO');
  assert.strictEqual(porId.prod_reactiva.origen, 'REACTIVADO');
  assert.strictEqual(porId.prod_continua_2.origen, 'CONTINUO');
  assert.strictEqual(porId.prod_nueva.origen, 'NUEVO');
  assert.strictEqual(salida.eventos.length, 5);
  console.log('23. Caso combinado con cinco productos (CONTINUAR/CREAR/DESCONTINUAR/REACTIVAR): OK');
}

// ============================================================================
// 24. Validación REAL de salida (reemplaza la prueba de congelamiento de la
//     fase anterior — Object.freeze no equivale a validar contrato).
//     Se construyen manualmente salidas inválidas usando la vía explícita de
//     prueba interna (_internalsParaPruebas.validarOutput).
// ============================================================================
{
  const { validarOutput } = k01._internalsParaPruebas;

  function salidaValidaBase() {
    return calcularContado(entradaBase({
      productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() }],
    }));
  }

  // 24a. kernel incorrecto
  {
    const s = JSON.parse(JSON.stringify(salidaValidaBase()));
    s.kernel.codigo = 'K99';
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', '24a. kernel.codigo incorrecto');
  }
  // 24b. saldo empresarial faltante
  {
    const s = JSON.parse(JSON.stringify(salidaValidaBase()));
    delete s.empresaEstadoInicial.caja;
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', '24b. saldo empresarial faltante (caja)');
  }
  // 24c. producto duplicado
  {
    const s = JSON.parse(JSON.stringify(salidaValidaBase()));
    s.productosEstadoInicial.push(JSON.parse(JSON.stringify(s.productosEstadoInicial[0])));
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_PRODUCTO_ID_DUPLICADO', '24c. producto duplicado en salida');
  }
  // 24d. estrategia inválida (NUEVO con estrategiaDestino incompleta)
  {
    const s = JSON.parse(JSON.stringify(salidaValidaBase()));
    delete s.productosEstadoInicial[0].estrategiaDestino.precio;
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', '24d. estrategiaDestino inválida en producto NUEVO');
  }
  // 24e. evento duplicado
  {
    const s = JSON.parse(JSON.stringify(salidaValidaBase()));
    s.eventos.push(JSON.parse(JSON.stringify(s.eventos[0])));
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_EVENTO_DUPLICADO', '24e. eventId duplicado');
  }
  // 24f. eventType inválido
  {
    const s = JSON.parse(JSON.stringify(salidaValidaBase()));
    s.eventos[0].eventType = 'EVENTO_INEXISTENTE';
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_EVENTO_TIPO_INVALIDO', '24f. eventType inválido');
  }
  // 24g. contexto incoherente (rondaDestino != rondaAnterior + 1)
  {
    const s = JSON.parse(JSON.stringify(salidaValidaBase()));
    s.contexto.rondaDestino = s.contexto.rondaAnterior + 5;
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', '24g. contexto.rondaDestino incoherente');
  }
  // 24h. orden no canónico
  {
    const productosAnteriores = [
      { productoId: 'prod_a', activo: true, inventarioFinal: 1, costoUnitarioInventario: 1, historialContable: {} },
      { productoId: 'prod_b', activo: true, inventarioFinal: 1, costoUnitarioInventario: 1, historialContable: {} },
    ];
    const decisiones = [
      { productoId: 'prod_a', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
      { productoId: 'prod_b', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
    ];
    const s = JSON.parse(JSON.stringify(calcularContado(entradaBase({ productosEstadoFinalAnterior: productosAnteriores, productosDecisionDestino: decisiones }))));
    s.productosEstadoInicial.reverse(); // rompe el orden canónico ascendente
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', '24h. orden no canónico en productosEstadoInicial');
  }

  console.log('24. Validación real de salida detecta rupturas del contrato (8 subcasos): OK');
}

// ============================================================================
// 25. Producto anterior omitido en decisiones aborta (Corrección 1)
// ============================================================================
{
  const entrada = entradaBase({
    productosEstadoFinalAnterior: [
      { productoId: 'prod_1', activo: true, inventarioFinal: 10, costoUnitarioInventario: 1, historialContable: {} },
      { productoId: 'prod_2', activo: true, inventarioFinal: 20, costoUnitarioInventario: 2, historialContable: {} },
    ],
    productosDecisionDestino: [
      { productoId: 'prod_1', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
      // prod_2 omitido deliberadamente
    ],
  });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_PRODUCTO_SIN_DECISION_DESTINO', '25. producto anterior omitido en decisiones');
  console.log('25. Producto anterior omitido en decisiones aborta (ningún inventario desaparece silenciosamente): OK');
}

// ============================================================================
// 26. Coherencia acción/activo (Corrección 2)
// ============================================================================
{
  // CONTINUAR con activo=false debe abortar.
  {
    const entrada = entradaBase({
      productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 1, costoUnitarioInventario: 1, historialContable: {} }],
      productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CONTINUAR', activo: false, estrategia: estrategiaCompleta() }],
    });
    assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_ACCION_ACTIVO_INCONSISTENTE', '26a. CONTINUAR con activo=false');
  }
  // DESCONTINUAR con activo=true debe abortar.
  {
    const entrada = entradaBase({
      productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 1, costoUnitarioInventario: 1, historialContable: {} }],
      productosDecisionDestino: [{ productoId: 'prod_1', accion: 'DESCONTINUAR', activo: true, estrategia: null }],
    });
    assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_ACCION_ACTIVO_INCONSISTENTE', '26b. DESCONTINUAR con activo=true');
  }
  // DESCONTINUAR sobre producto anterior ya inactivo debe abortar (exige antecedente activo=true).
  {
    const entrada = entradaBase({
      productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: false, inventarioFinal: 1, costoUnitarioInventario: 1, historialContable: {} }],
      productosDecisionDestino: [{ productoId: 'prod_1', accion: 'DESCONTINUAR', activo: false, estrategia: null }],
    });
    assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_DESCONTINUAR_PRODUCTO_INACTIVO', '26c. DESCONTINUAR sobre producto ya inactivo');
  }
  // REACTIVAR sobre producto anterior activo=true debe abortar (exige antecedente activo=false) — ya cubierto por procesarReactivar, se reconfirma aquí.
  {
    const entrada = entradaBase({
      productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 1, costoUnitarioInventario: 1, historialContable: {} }],
      productosDecisionDestino: [{ productoId: 'prod_1', accion: 'REACTIVAR', activo: true, estrategia: estrategiaCompleta() }],
    });
    assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_REACTIVAR_PRODUCTO_NO_DESCONTINUADO', '26d. REACTIVAR sobre producto ya activo');
  }
  console.log('26. Coherencia acción/activo exigida en las cuatro acciones: OK');
}

// ============================================================================
// 27. Validación estratégica estricta (Corrección 3) — CREAR
// ============================================================================
{
  const casos = [
    ['precio', NaN, 'NaN'],
    ['precio', Infinity, 'Infinity'],
    ['precio', -1, 'negativo'],
    ['precio', '700', 'tipo incorrecto (string)'],
    ['segmento', '', 'string vacío'],
    ['segmento', '   ', 'string solo espacios'],
    ['segmento', 123, 'tipo incorrecto (number)'],
    ['canalPrincipal', '', 'string vacío'],
    ['canalSecundario', '   ', 'string solo espacios'],
    ['produccionSolicitada', 1.5, 'no entero'],
    ['produccionSolicitada', -1, 'negativo'],
    ['produccionSolicitada', NaN, 'NaN'],
    ['calidad', Infinity, 'Infinity'],
    ['calidad', -5, 'negativo'],
    ['marketing', NaN, 'NaN'],
    ['marketing', -100, 'negativo'],
    ['innovacion', 'false', 'tipo incorrecto (string)'],
    ['innovacion', 1, 'tipo incorrecto (number)'],
  ];
  casos.forEach(([campo, valor, descripcion]) => {
    const entrada = entradaBase({
      productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta({ [campo]: valor }) }],
    });
    assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_ESTRATEGIA_PRODUCTO_NUEVO_INVALIDA', `27. CREAR con ${campo}=${descripcion}`);
  });
  console.log('27. Validación estratégica estricta en CREAR (18 subcasos: tipos, NaN, Infinity, negativos, strings vacíos): OK');
}

// ============================================================================
// 28. Validación estratégica estricta (Corrección 3) — REACTIVAR
// ============================================================================
{
  const casos = [
    ['precio', NaN, 'NaN'],
    ['precio', -1, 'negativo'],
    ['segmento', '', 'string vacío'],
    ['segmento', '   ', 'string solo espacios'],
    ['canalPrincipal', 123, 'tipo incorrecto'],
    ['produccionSolicitada', 1.5, 'no entero'],
    ['calidad', Infinity, 'Infinity'],
    ['marketing', -1, 'negativo'],
    ['innovacion', 'no', 'tipo incorrecto'],
  ];
  casos.forEach(([campo, valor, descripcion]) => {
    const entrada = entradaBase({
      productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: false, inventarioFinal: 0, costoUnitarioInventario: 0, historialContable: {} }],
      productosDecisionDestino: [{ productoId: 'prod_1', accion: 'REACTIVAR', activo: true, estrategia: estrategiaCompleta({ [campo]: valor }) }],
    });
    assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_CAMPOS_ESTRATEGICOS_REACTIVACION_AUSENTES', `28. REACTIVAR con ${campo}=${descripcion}`);
  });
  console.log('28. Validación estratégica estricta en REACTIVAR (9 subcasos): OK');
}

// ============================================================================
// 29. Producción en proceso: campo inexistente es aceptado (Corrección 4)
// ============================================================================
{
  const estado = estadoEmpresaBase();
  assert.ok(!('produccionEnProcesoFinalAnterior' in estado), 'precondición: el campo no debe existir en el fixture base');
  const entrada = entradaBase({ empresaEstadoFinalAnterior: estado });
  const salida = calcularContado(entrada);
  assert.ok(!('produccionEnProcesoFinalAnterior' in salida.empresaEstadoInicial), 'el campo nunca debe propagarse a la salida');
  console.log('29. Producción en proceso: campo inexistente aceptado y nunca propagado a la salida: OK');
}

// ============================================================================
// 30. Producción en proceso: presente pero no numérico finito aborta con
//     ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO (Corrección 4)
// ============================================================================
{
  const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ produccionEnProcesoFinalAnterior: 'no-numero' }) });
  assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_ESTADO_EMPRESARIAL_INCOMPLETO', '30. produccionEnProcesoFinalAnterior no numérico');
  console.log('30. Producción en proceso presente y no numérica aborta con código correcto: OK');
}

// ============================================================================
// 31. eventId determinista vía SHA-256: mismo input mismo hash, distinto
//     input distinto hash (Corrección 5)
// ============================================================================
{
  function salidaCon(over) {
    return calcularContado(entradaBase({
      contexto: contexto(over.contexto || {}),
      productosEstadoFinalAnterior: [{ productoId: over.productoId || 'prod_1', activo: true, inventarioFinal: 1, costoUnitarioInventario: 1, historialContable: {} }],
      productosDecisionDestino: [{ productoId: over.productoId || 'prod_1', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() }],
    }));
  }

  const base = salidaCon({});
  const eventIdBase = base.eventos[0].eventId;

  assert.ok(/^[0-9a-f]{64}$/.test(eventIdBase), 'eventId debe ser un hash SHA-256 hexadecimal de 64 caracteres');

  const mismaEntradaOtraVez = salidaCon({});
  assert.strictEqual(mismaEntradaOtraVez.eventos[0].eventId, eventIdBase, '31a. misma entrada -> mismo eventId');

  const distintaSim = salidaCon({ contexto: { simulacionId: 'sim_otra' } });
  assert.notStrictEqual(distintaSim.eventos[0].eventId, eventIdBase, '31b. distinta simulacionId -> distinto eventId');

  const distintoProducto = salidaCon({ productoId: 'prod_2' });
  assert.notStrictEqual(distintoProducto.eventos[0].eventId, eventIdBase, '31c. distinto productoId -> distinto eventId');

  // 31d. distinto eventType -> distinto eventId: comparar el evento de
  // PRODUCTO_CONTINUADO (base) contra un PRODUCTO_CREADO en la misma ronda.
  const otroEventType = calcularContado(entradaBase({
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() }],
  }));
  assert.notStrictEqual(otroEventType.eventos[0].eventId, eventIdBase, '31d. distinto eventType -> distinto eventId');

  console.log('31. eventId determinista SHA-256: mismo input mismo hash, variaciones producen hashes distintos: OK');
}

// ============================================================================
// 32. Continuidad literal verificable: alterar un saldo en una salida de
//     prueba demuestra que la comparación estricta lo detecta (Corrección 8)
// ============================================================================
{
  const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ caja: 12345 }) });
  const salida = calcularContado(entrada);

  // Verificación de continuidad literal campo a campo contra la entrada real.
  for (const campo of Object.keys(estadoEmpresaBase())) {
    if (campo === 'pedidosPendientes') continue;
    assert.strictEqual(salida.empresaEstadoInicial[campo], entrada.empresaEstadoFinalAnterior[campo], `32. continuidad literal de ${campo}`);
  }
  // pedidosPendientes: contenido igual, referencia distinta.
  assert.deepStrictEqual(salida.empresaEstadoInicial.pedidosPendientes, entrada.empresaEstadoFinalAnterior.pedidosPendientes);
  assert.notStrictEqual(salida.empresaEstadoInicial.pedidosPendientes, entrada.empresaEstadoFinalAnterior.pedidosPendientes, 'pedidosPendientes no debe compartir referencia');

  // Ahora se construye DELIBERADAMENTE una salida alterada (simulando un bug
  // hipotético) y se demuestra que la comparación de continuidad lo detecta.
  const salidaAlterada = JSON.parse(JSON.stringify(salida));
  salidaAlterada.empresaEstadoInicial.caja = 999999; // valor deliberadamente distinto al de la entrada
  assert.throws(
    () => assert.strictEqual(salidaAlterada.empresaEstadoInicial.caja, entrada.empresaEstadoFinalAnterior.caja),
    assert.AssertionError,
    '32. la comprobación de continuidad debe detectar una alteración deliberada del saldo'
  );
  console.log('32. Continuidad literal verificable: comparación campo a campo detecta alteraciones, pedidosPendientes es clon independiente: OK');
}

// ============================================================================
// 33. esStringNoVacio y esObjetoPlano corregidos (Corrección 9)
// ============================================================================
{
  assert.strictEqual(esStringNoVacio('   '), false, '33a. string solo espacios debe ser rechazado');
  assert.strictEqual(esStringNoVacio(''), false, '33b. string vacío debe ser rechazado');
  assert.strictEqual(esStringNoVacio('x'), true, '33c. string con contenido debe aceptarse');
  assert.strictEqual(esStringNoVacio(' x '), true, '33d. string con espacios y contenido debe aceptarse');

  assert.strictEqual(esObjetoPlano({}), true, '33e. objeto literal debe aceptarse');
  assert.strictEqual(esObjetoPlano(Object.create(null)), true, '33f. objeto con prototipo null debe aceptarse');
  assert.strictEqual(esObjetoPlano(new Date()), false, '33g. Date debe rechazarse');
  assert.strictEqual(esObjetoPlano(new Map()), false, '33h. Map debe rechazarse');
  assert.strictEqual(esObjetoPlano(new Set()), false, '33i. Set debe rechazarse');
  class Foo {}
  assert.strictEqual(esObjetoPlano(new Foo()), false, '33j. instancia de clase debe rechazarse');
  assert.strictEqual(esObjetoPlano([]), false, '33k. array debe rechazarse');
  assert.strictEqual(esObjetoPlano(null), false, '33l. null debe rechazarse');

  console.log('33. esStringNoVacio y esObjetoPlano corregidos, con pruebas: OK');
}

// ============================================================================
// 34. Corrección 1 (V2-2C): continuidad literal en tiempo de ejecución,
//     detectada por la función productiva validarContinuidadLiteral (no por
//     un assert externo que replique la regla).
// ============================================================================
{
  const { validarContinuidadLiteral } = k01._internalsParaPruebas;

  // 34a. caja alterada
  {
    const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ caja: 5000 }) });
    const salida = calcularContado(entrada);
    const salidaCorrupta = JSON.parse(JSON.stringify(salida));
    salidaCorrupta.empresaEstadoInicial.caja = 999999;
    assertAborta(
      () => validarContinuidadLiteral(entrada.empresaEstadoFinalAnterior, salidaCorrupta.empresaEstadoInicial),
      'ERROR_BLOQUEANTE_CONTINUIDAD_EMPRESARIAL_VIOLADA',
      '34a. caja alterada debe ser detectada por validarContinuidadLiteral'
    );
  }
  // 34b. deudaFinanciera alterada
  {
    const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ deudaFinanciera: 3000 }) });
    const salida = calcularContado(entrada);
    const salidaCorrupta = JSON.parse(JSON.stringify(salida));
    salidaCorrupta.empresaEstadoInicial.deudaFinanciera = 0;
    assertAborta(
      () => validarContinuidadLiteral(entrada.empresaEstadoFinalAnterior, salidaCorrupta.empresaEstadoInicial),
      'ERROR_BLOQUEANTE_CONTINUIDAD_EMPRESARIAL_VIOLADA',
      '34b. deudaFinanciera alterada debe ser detectada'
    );
  }
  // 34c. resultadosAcumulados alterado (campo con signo)
  {
    const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ resultadosAcumulados: -2000 }) });
    const salida = calcularContado(entrada);
    const salidaCorrupta = JSON.parse(JSON.stringify(salida));
    salidaCorrupta.empresaEstadoInicial.resultadosAcumulados = -1;
    assertAborta(
      () => validarContinuidadLiteral(entrada.empresaEstadoFinalAnterior, salidaCorrupta.empresaEstadoInicial),
      'ERROR_BLOQUEANTE_CONTINUIDAD_EMPRESARIAL_VIOLADA',
      '34c. resultadosAcumulados alterado debe ser detectado'
    );
  }
  // 34d. pedidosPendientes con contenido distinto
  {
    const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ pedidosPendientes: [{ rondaEntrega: 6, cantidad: 100 }] }) });
    const salida = calcularContado(entrada);
    const salidaCorrupta = JSON.parse(JSON.stringify(salida));
    salidaCorrupta.empresaEstadoInicial.pedidosPendientes = [{ rondaEntrega: 6, cantidad: 999 }];
    assertAborta(
      () => validarContinuidadLiteral(entrada.empresaEstadoFinalAnterior, salidaCorrupta.empresaEstadoInicial),
      'ERROR_BLOQUEANTE_CONTINUIDAD_EMPRESARIAL_VIOLADA',
      '34d. pedidosPendientes con contenido alterado debe ser detectado'
    );
  }
  // 34e. caso válido: la función productiva NO debe abortar sobre una salida real sin alterar.
  {
    const entrada = entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ caja: 7777, pedidosPendientes: [{ rondaEntrega: 7, cantidad: 50 }] }) });
    const salida = calcularContado(entrada);
    validarContinuidadLiteral(entrada.empresaEstadoFinalAnterior, salida.empresaEstadoInicial); // no debe lanzar
  }
  console.log('34. Continuidad literal en tiempo de ejecución: validarContinuidadLiteral detecta caja/deuda/resultados/pedidosPendientes alterados: OK');
}

// ============================================================================
// 35. Corrección 2 (V2-2C): estrategia estricta también en CONTINUAR
// ============================================================================
{
  const casos = [
    ['precio', NaN, 'precio NaN'],
    ['produccionSolicitada', -1, 'producción negativa'],
    ['segmento', '', 'segmento vacío'],
    ['marketing', Infinity, 'marketing Infinity'],
    ['innovacion', 'si', 'innovación con tipo incorrecto'],
  ];
  casos.forEach(([campo, valor, descripcion]) => {
    const entrada = entradaBase({
      productosEstadoFinalAnterior: [{ productoId: 'prod_1', activo: true, inventarioFinal: 10, costoUnitarioInventario: 1, historialContable: {} }],
      productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta({ [campo]: valor }) }],
    });
    assertAborta(() => calcularContado(entrada), 'ERROR_BLOQUEANTE_ESTRATEGIA_PRODUCTO_CONTINUO_INVALIDA', `35. CONTINUAR con ${descripcion}`);
  });
  console.log('35. Estrategia estricta exigida también en CONTINUAR (5 subcasos): OK');
}

// ============================================================================
// 36. Corrección 3 (V2-2C): integridad producto-evento
// ============================================================================
{
  const { validarOutput } = k01._internalsParaPruebas;

  function salidaValidaDosProductos() {
    return calcularContado(entradaBase({
      productosEstadoFinalAnterior: [
        { productoId: 'prod_a', activo: true, inventarioFinal: 1, costoUnitarioInventario: 1, historialContable: {} },
      ],
      productosDecisionDestino: [
        { productoId: 'prod_a', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() },
        { productoId: 'prod_b', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() },
      ],
    }));
  }

  // 36a. producto sin evento
  {
    const s = JSON.parse(JSON.stringify(salidaValidaDosProductos()));
    s.eventos.pop();
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA', '36a. producto sin evento asociado');
  }
  // 36b. evento adicional (más eventos que productos) — se agrega un evento
  // con hash CRIPTOGRÁFICAMENTE VÁLIDO (recalculado con crearEventIdK01, con
  // eventType distinto para que el eventId también sea distinto y no choque
  // con ERROR_BLOQUEANTE_EVENTO_DUPLICADO) referido a un productoId que YA
  // tiene su propio evento — así la causa de rechazo es específicamente la
  // integridad producto-evento (longitud/duplicidad), no la verificación
  // criptográfica del eventId (Corrección 3, que se prueba aparte en el bloque 38).
  {
    const s = JSON.parse(JSON.stringify(salidaValidaDosProductos()));
    const eventoExtra = JSON.parse(JSON.stringify(s.eventos[0]));
    eventoExtra.eventType = 'PRODUCTO_DESCONTINUADO'; // distinto al original, para producir un hash distinto
    eventoExtra.eventId = crearEventIdK01({
      simulacionId: s.contexto.simulacionId,
      empresaId: s.contexto.empresaId,
      productoId: eventoExtra.productoId,
      rondaDestino: s.contexto.rondaDestino,
      eventType: eventoExtra.eventType,
      version: eventoExtra.version,
    });
    s.eventos.push(eventoExtra);
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA', '36b. evento adicional sin producto correspondiente');
  }
  // Helper: recalcula el eventId real tras mutar campos de un evento, para
  // que la causa de rechazo esperada sea la de trazabilidad (no un eventId
  // criptográficamente inválido, que ahora se detecta antes — Corrección 3).
  function recalcularEventId(contexto, evento) {
    evento.eventId = crearEventIdK01({
      simulacionId: contexto.simulacionId,
      empresaId: contexto.empresaId,
      productoId: evento.productoId,
      rondaDestino: contexto.rondaDestino,
      eventType: evento.eventType,
      version: evento.version,
    });
    return evento;
  }

  // 36c. evento con productoId inexistente (hash recalculado para ese
  // productoId ficticio, de modo que la verificación criptográfica pase y la
  // causa de rechazo sea específicamente la ausencia de correspondencia).
  {
    const s = JSON.parse(JSON.stringify(salidaValidaDosProductos()));
    s.eventos[0].productoId = 'producto_que_no_existe';
    recalcularEventId(s.contexto, s.eventos[0]);
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA', '36c. evento con productoId inexistente');
  }
  // 36d. eventType incompatible con origen (hash recalculado tras cambiar eventType).
  {
    const s = JSON.parse(JSON.stringify(salidaValidaDosProductos()));
    const eventoDeContinuo = s.eventos.find(e => e.productoId === 'prod_a');
    eventoDeContinuo.eventType = 'PRODUCTO_CREADO'; // prod_a es CONTINUO, no NUEVO
    recalcularEventId(s.contexto, eventoDeContinuo);
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA', '36d. eventType incompatible con origen');
  }
  // 36e. dos eventos distintos para el mismo producto (el segundo evento tiene
  // hash válido para SUS propios campos declarados — mismo productoId que el
  // primero, eventType distinto para que el hash también sea distinto).
  {
    const s = JSON.parse(JSON.stringify(salidaValidaDosProductos()));
    const duplicado = JSON.parse(JSON.stringify(s.eventos[0]));
    duplicado.eventType = 'PRODUCTO_DESCONTINUADO';
    recalcularEventId(s.contexto, duplicado);
    s.eventos[1] = duplicado; // sobreescribe el evento de prod_b con uno de prod_a
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_TRAZABILIDAD_PRODUCTO_EVENTO_INVALIDA', '36e. dos eventos para el mismo producto');
  }

  console.log('36. Integridad producto-evento detecta las 5 corrupciones exigidas: OK');
}

// ============================================================================
// 37. Corrección 4 (V2-2C): validación defensiva de elementos antes de leer
//     propiedades — nunca debe escapar un TypeError genérico.
// ============================================================================
{
  const { validarOutput } = k01._internalsParaPruebas;

  function salidaValidaUnProducto() {
    return calcularContado(entradaBase({
      productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() }],
    }));
  }

  // 37a. producto null
  {
    const s = JSON.parse(JSON.stringify(salidaValidaUnProducto()));
    s.productosEstadoInicial[0] = null;
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', '37a. producto null en productosEstadoInicial');
  }
  // 37b. producto array
  {
    const s = JSON.parse(JSON.stringify(salidaValidaUnProducto()));
    s.productosEstadoInicial[0] = ['no', 'es', 'un', 'producto'];
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', '37b. producto array en productosEstadoInicial');
  }
  // 37c. evento null
  {
    const s = JSON.parse(JSON.stringify(salidaValidaUnProducto()));
    s.eventos[0] = null;
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', '37c. evento null');
  }
  // 37d. historialContable como Date — no serializable de forma útil vía
  // JSON.parse(JSON.stringify(...)), así que se construye directamente en
  // memoria (sin pasar por serialización) para preservar el tipo Date real.
  {
    const s = salidaValidaUnProducto();
    const sMutable = { ...s, productosEstadoInicial: s.productosEstadoInicial.map(p => ({ ...p })) };
    sMutable.productosEstadoInicial[0].historialContable = new Date();
    assertAborta(() => validarOutput(sMutable), 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', '37d. historialContable como instancia de Date');
  }
  // 37e. estrategiaDestino como instancia de clase
  {
    class EstrategiaFalsa {
      constructor() {
        this.precio = 700; this.segmento = 'x'; this.canalPrincipal = 'y';
        this.canalSecundario = 'z'; this.produccionSolicitada = 1; this.calidad = 1;
        this.marketing = 1; this.innovacion = false;
      }
    }
    const s = salidaValidaUnProducto();
    const sMutable = { ...s, productosEstadoInicial: s.productosEstadoInicial.map(p => ({ ...p })) };
    sMutable.productosEstadoInicial[0].estrategiaDestino = new EstrategiaFalsa();
    assertAborta(() => validarOutput(sMutable), 'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA', '37e. estrategiaDestino como instancia de clase');
  }

  console.log('37. Validación defensiva de elementos: producto null/array, evento null, historialContable Date, estrategiaDestino instancia de clase — todos KernelError controlado: OK');
}

// ============================================================================
// 38. Corrección 1 (V2-2D): conciliación de contexto entrada-salida.
//     Se invoca la función PRODUCTIVA validarContinuidadContexto (la MISMA
//     que index.js ejecuta dentro de calcular), no un assert externo.
// ============================================================================
{
  const { validarContinuidadContexto } = k01._internalsParaPruebas;
  const contextoOriginal = contexto();

  // 38a. simulacionId alterado
  assertAborta(
    () => validarContinuidadContexto(contextoOriginal, { ...contextoOriginal, simulacionId: 'otra_sim' }),
    'ERROR_BLOQUEANTE_CONTEXTO_K01_ALTERADO',
    '38a. simulacionId alterado'
  );
  // 38b. empresaId alterado
  assertAborta(
    () => validarContinuidadContexto(contextoOriginal, { ...contextoOriginal, empresaId: 'otra_empresa' }),
    'ERROR_BLOQUEANTE_CONTEXTO_K01_ALTERADO',
    '38b. empresaId alterado'
  );
  // 38c. rondaAnterior alterada
  assertAborta(
    () => validarContinuidadContexto(contextoOriginal, { ...contextoOriginal, rondaAnterior: 999 }),
    'ERROR_BLOQUEANTE_CONTEXTO_K01_ALTERADO',
    '38c. rondaAnterior alterada'
  );
  // 38d. rondaDestino alterada
  assertAborta(
    () => validarContinuidadContexto(contextoOriginal, { ...contextoOriginal, rondaDestino: 999 }),
    'ERROR_BLOQUEANTE_CONTEXTO_K01_ALTERADO',
    '38d. rondaDestino alterada'
  );
  // 38e. caso válido: contexto idéntico no debe abortar.
  validarContinuidadContexto(contextoOriginal, { ...contextoOriginal });

  // 38f. confirmar que calcular() real invoca esta verificación end-to-end
  // (no solo la función aislada) — una ejecución normal debe completarse sin
  // que se dispare ERROR_BLOQUEANTE_CONTEXTO_K01_ALTERADO.
  const entrada = entradaBase({
    productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() }],
  });
  const salida = calcularContado(entrada);
  assert.strictEqual(salida.contexto.simulacionId, entrada.contexto.simulacionId);
  assert.strictEqual(salida.contexto.empresaId, entrada.contexto.empresaId);
  assert.strictEqual(salida.contexto.rondaAnterior, entrada.contexto.rondaAnterior);
  assert.strictEqual(salida.contexto.rondaDestino, entrada.contexto.rondaDestino);

  console.log('38. Conciliación de contexto entrada-salida: simulacionId/empresaId/rondaAnterior/rondaDestino verificados por la función productiva: OK');
}

// ============================================================================
// 39. Corrección 2 (V2-2D): conciliación completa por producto.
//     Se invoca la función PRODUCTIVA validarContinuidadProductos.
// ============================================================================
{
  const { validarContinuidadProductos } = k01._internalsParaPruebas;

  function escenarioBase() {
    const productosEstadoFinalAnterior = [
      { productoId: 'prod_continua', activo: true, inventarioFinal: 100, costoUnitarioInventario: 10, historialContable: { a: 1 } },
      { productoId: 'prod_descontinua', activo: true, inventarioFinal: 50, costoUnitarioInventario: 20, historialContable: { b: 2 } },
      { productoId: 'prod_reactiva', activo: false, inventarioFinal: 5, costoUnitarioInventario: 3, historialContable: { c: 3 } },
    ];
    const productosDecisionDestino = [
      { productoId: 'prod_continua', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta({ precio: 111 }) },
      { productoId: 'prod_descontinua', accion: 'DESCONTINUAR', activo: false, estrategia: null },
      { productoId: 'prod_reactiva', accion: 'REACTIVAR', activo: true, estrategia: estrategiaCompleta({ precio: 222 }) },
      { productoId: 'prod_nueva', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta({ precio: 333 }) },
    ];
    const salida = calcularContado(entradaBase({ productosEstadoFinalAnterior, productosDecisionDestino }));
    return { productosEstadoFinalAnterior, productosDecisionDestino, productosEstadoInicial: JSON.parse(JSON.stringify(salida.productosEstadoInicial)) };
  }

  // 39a. caso válido: no debe abortar.
  {
    const e = escenarioBase();
    validarContinuidadProductos(e.productosEstadoFinalAnterior, e.productosDecisionDestino, e.productosEstadoInicial);
  }
  // 39b. inventario de producto continuo alterado
  {
    const e = escenarioBase();
    const p = e.productosEstadoInicial.find(x => x.productoId === 'prod_continua');
    p.inventarioInicial = 999;
    assertAborta(() => validarContinuidadProductos(e.productosEstadoFinalAnterior, e.productosDecisionDestino, e.productosEstadoInicial), 'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA', '39b. inventario de producto continuo alterado');
  }
  // 39c. costo de producto descontinuado alterado
  {
    const e = escenarioBase();
    const p = e.productosEstadoInicial.find(x => x.productoId === 'prod_descontinua');
    p.costoUnitarioInventario = 999;
    assertAborta(() => validarContinuidadProductos(e.productosEstadoFinalAnterior, e.productosDecisionDestino, e.productosEstadoInicial), 'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA', '39c. costo de producto descontinuado alterado');
  }
  // 39d. historial de producto reactivado alterado
  {
    const e = escenarioBase();
    const p = e.productosEstadoInicial.find(x => x.productoId === 'prod_reactiva');
    p.historialContable = { c: 999 };
    assertAborta(() => validarContinuidadProductos(e.productosEstadoFinalAnterior, e.productosDecisionDestino, e.productosEstadoInicial), 'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA', '39d. historial de producto reactivado alterado');
  }
  // 39e. estrategia de producto continuo alterada (no coincide con la decisión real)
  {
    const e = escenarioBase();
    const p = e.productosEstadoInicial.find(x => x.productoId === 'prod_continua');
    p.estrategiaDestino = estrategiaCompleta({ precio: 55555 });
    assertAborta(() => validarContinuidadProductos(e.productosEstadoFinalAnterior, e.productosDecisionDestino, e.productosEstadoInicial), 'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA', '39e. estrategia de producto continuo alterada');
  }
  // 39f. inventario de producto nuevo alterado (debe ser 0)
  {
    const e = escenarioBase();
    const p = e.productosEstadoInicial.find(x => x.productoId === 'prod_nueva');
    p.inventarioInicial = 7;
    assertAborta(() => validarContinuidadProductos(e.productosEstadoFinalAnterior, e.productosDecisionDestino, e.productosEstadoInicial), 'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA', '39f. inventario de producto nuevo alterado');
  }
  // 39g. origen alterado
  {
    const e = escenarioBase();
    const p = e.productosEstadoInicial.find(x => x.productoId === 'prod_continua');
    p.origen = 'NUEVO';
    assertAborta(() => validarContinuidadProductos(e.productosEstadoFinalAnterior, e.productosDecisionDestino, e.productosEstadoInicial), 'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA', '39g. origen alterado');
  }
  // 39h. producto extra (no corresponde a ninguna decisión)
  {
    const e = escenarioBase();
    e.productosEstadoInicial.push({ productoId: 'prod_fantasma', origen: 'NUEVO', activo: true, inventarioInicial: 0, costoUnitarioInventario: 0, historialContable: {}, estrategiaDestino: estrategiaCompleta() });
    assertAborta(() => validarContinuidadProductos(e.productosEstadoFinalAnterior, e.productosDecisionDestino, e.productosEstadoInicial), 'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA', '39h. producto extra');
  }
  // 39i. producto ausente (falta uno de los esperados)
  {
    const e = escenarioBase();
    e.productosEstadoInicial = e.productosEstadoInicial.filter(x => x.productoId !== 'prod_nueva');
    assertAborta(() => validarContinuidadProductos(e.productosEstadoFinalAnterior, e.productosDecisionDestino, e.productosEstadoInicial), 'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA', '39i. producto ausente');
  }
  // 39j. intercambio de inventarios entre dos productos (prod_continua <-> prod_descontinua)
  {
    const e = escenarioBase();
    const pc = e.productosEstadoInicial.find(x => x.productoId === 'prod_continua');
    const pd = e.productosEstadoInicial.find(x => x.productoId === 'prod_descontinua');
    const tmp = pc.inventarioInicial;
    pc.inventarioInicial = pd.inventarioInicial;
    pd.inventarioInicial = tmp;
    assertAborta(() => validarContinuidadProductos(e.productosEstadoFinalAnterior, e.productosDecisionDestino, e.productosEstadoInicial), 'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA', '39j. intercambio de inventarios entre dos productos');
  }

  console.log('39. Conciliación completa por producto: 10 subcasos (1 válido + 9 corrupciones) detectados por la función productiva: OK');
}

// ============================================================================
// 40. Corrección 3 (V2-2D): verificación criptográfica del eventId.
// ============================================================================
{
  const { validarOutput } = k01._internalsParaPruebas;

  function salidaValidaUnProducto() {
    return calcularContado(entradaBase({
      productosDecisionDestino: [{ productoId: 'prod_1', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta() }],
    }));
  }

  // 40a. eventId sustituido por string arbitrario
  {
    const s = JSON.parse(JSON.stringify(salidaValidaUnProducto()));
    s.eventos[0].eventId = 'string_arbitrario_no_es_un_hash';
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_EVENT_ID_K01_INVALIDO', '40a. eventId sustituido por string arbitrario');
  }
  // 40b. un carácter del hash modificado
  {
    const s = JSON.parse(JSON.stringify(salidaValidaUnProducto()));
    const original = s.eventos[0].eventId;
    const primerCaracter = original[0];
    const caracterDistinto = primerCaracter === '0' ? '1' : '0';
    s.eventos[0].eventId = caracterDistinto + original.slice(1);
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_EVENT_ID_K01_INVALIDO', '40b. un carácter del hash modificado');
  }
  // 40c. eventType modificado sin recalcular hash (PRODUCTO_CREADO -> PRODUCTO_CONTINUADO,
  // ambos en EVENT_TYPES_VALIDOS, así que pasa esa validación y llega a la del hash)
  {
    const s = JSON.parse(JSON.stringify(salidaValidaUnProducto()));
    s.eventos[0].eventType = 'PRODUCTO_CONTINUADO';
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_EVENT_ID_K01_INVALIDO', '40c. eventType modificado sin recalcular hash');
  }
  // 40d. productoId modificado sin recalcular hash
  {
    const s = JSON.parse(JSON.stringify(salidaValidaUnProducto()));
    s.eventos[0].productoId = 'prod_1_modificado';
    // También hay que mantener correspondencia con productosEstadoInicial para
    // aislar la causa de rechazo al hash y no a la trazabilidad — se modifica
    // el productoId del PRODUCTO también, de modo que la integridad
    // producto-evento seguiría siendo consistente si el hash no se verificara.
    s.productosEstadoInicial[0].productoId = 'prod_1_modificado';
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_EVENT_ID_K01_INVALIDO', '40d. productoId modificado sin recalcular hash');
  }
  // 40e. simulacionId de contexto modificado (el hash fue calculado con el
  // simulacionId ORIGINAL, así que cambiar el contexto invalida la verificación).
  {
    const s = JSON.parse(JSON.stringify(salidaValidaUnProducto()));
    s.contexto.simulacionId = 'sim_modificada';
    assertAborta(() => validarOutput(s), 'ERROR_BLOQUEANTE_EVENT_ID_K01_INVALIDO', '40e. simulacionId de contexto modificado');
  }
  // 40f. hash correcto aceptado (caso válido, no debe abortar)
  {
    const s = salidaValidaUnProducto();
    validarOutput(JSON.parse(JSON.stringify(s)));
  }

  console.log('40. Verificación criptográfica del eventId: 6 subcasos (5 corrupciones + 1 hash correcto aceptado): OK');
}

// ============================================================================
// 41. Corrección 4 (V2-2D): contrato de estructuras clonables —
//     validarEstructuraClonable rechaza explícitamente lo no permitido.
// ============================================================================
{
  const { validarEstructuraClonable } = require('../../src/motor-v2/shared/validation');

  function assertRechazaClonable(valor, descripcion) {
    assertAborta(() => validarEstructuraClonable(valor), 'ERROR_BLOQUEANTE_ESTRUCTURA_NO_CLONABLE', `41. ${descripcion}`);
  }

  // Date anidado
  assertRechazaClonable({ a: { b: new Date() } }, 'Date anidado');
  // Map anidado
  assertRechazaClonable({ a: [1, 2, new Map([['x', 1]])] }, 'Map anidado');
  // undefined anidado
  assertRechazaClonable({ a: { b: undefined } }, 'undefined anidado');
  // función anidada
  assertRechazaClonable({ a: () => 1 }, 'función anidada');
  // BigInt anidado
  assertRechazaClonable({ a: [10n] }, 'BigInt anidado');
  // NaN anidado
  assertRechazaClonable({ a: { b: NaN } }, 'NaN anidado');
  // referencia circular
  {
    const circular = { a: 1 };
    circular.self = circular;
    assertRechazaClonable(circular, 'referencia circular');
  }
  // Set anidado
  assertRechazaClonable({ a: new Set([1, 2]) }, 'Set anidado');
  // Symbol anidado
  assertRechazaClonable({ a: Symbol('x') }, 'Symbol anidado');
  // instancia de clase anidada
  {
    class Foo { constructor() { this.x = 1; } }
    assertRechazaClonable({ a: new Foo() }, 'instancia de clase anidada');
  }
  // Infinity anidado
  assertRechazaClonable({ a: [1, Infinity] }, 'Infinity anidado');

  // Casos válidos: no deben abortar.
  validarEstructuraClonable(null);
  validarEstructuraClonable(true);
  validarEstructuraClonable('texto');
  validarEstructuraClonable(42);
  validarEstructuraClonable([1, 'a', null, { b: 2 }]);
  validarEstructuraClonable({ pedidosPendientes: [{ rondaEntrega: 6, cantidad: 100, costoMP: 0 }] });
  validarEstructuraClonable({ historialContable: { ronda5: 'x' } });
  validarEstructuraClonable({ estrategia: estrategiaCompleta() });
  validarEstructuraClonable({ metadatos: {} });

  console.log('41. Contrato de estructuras clonables: 10 rechazos (Date/Map/undefined/función/BigInt/NaN/circular/Set/Symbol/instancia de clase) + 9 casos válidos aceptados: OK');
}

// ============================================================================
// 42. Corrección V2-2E: igualdad estructural reemplaza comparaciones por JSON.
// ============================================================================
{
  const { validarContinuidadLiteral, validarContinuidadProductos } = k01._internalsParaPruebas;

  assert.strictEqual(sonEstructuralmenteIguales({ a: 1, b: [2] }, { b: [2], a: 1 }), true);
  assert.strictEqual(
    sonEstructuralmenteIguales({ fecha: new Date('2026-01-01T00:00:00.000Z') }, { fecha: '2026-01-01T00:00:00.000Z' }),
    false
  );

  {
    const anterior = estadoEmpresaBase({ pedidosPendientes: [{ fecha: '2026-01-01T00:00:00.000Z' }] });
    const inicial = estadoEmpresaBase({ pedidosPendientes: [{ fecha: new Date('2026-01-01T00:00:00.000Z') }] });
    assertAborta(
      () => validarContinuidadLiteral(anterior, inicial),
      'ERROR_BLOQUEANTE_CONTINUIDAD_EMPRESARIAL_VIOLADA',
      '42a. pedidosPendientes Date vs string no deben pasar por serialización JSON'
    );
  }

  {
    const anterior = [{ productoId: 'prod_1', activo: true, inventarioFinal: 1, costoUnitarioInventario: 1, historialContable: { fecha: '2026-01-01T00:00:00.000Z' } }];
    const decisiones = [{ productoId: 'prod_1', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta() }];
    const salida = [{ productoId: 'prod_1', origen: 'CONTINUO', activo: true, inventarioInicial: 1, costoUnitarioInventario: 1, historialContable: { fecha: new Date('2026-01-01T00:00:00.000Z') }, estrategiaDestino: estrategiaCompleta() }];
    assertAborta(
      () => validarContinuidadProductos(anterior, decisiones, salida),
      'ERROR_BLOQUEANTE_CONTINUIDAD_PRODUCTO_VIOLADA',
      '42b. historialContable Date vs string no deben pasar por serialización JSON'
    );
  }

  console.log('42. Igualdad estructural: Date vs string se detecta en pedidosPendientes e historialContable, sin JSON.stringify productivo: OK');
}

// ============================================================================
// 43. Corrección V2-2E: independencia recursiva de referencias entrada/salida.
// ============================================================================
{
  const { validarIndependenciaReferencias } = k01._internalsParaPruebas;

  {
    const entrada = entradaBase({
      empresaEstadoFinalAnterior: estadoEmpresaBase({ pedidosPendientes: [{ nested: { cantidad: 10 } }] }),
      productosEstadoFinalAnterior: [{ productoId: 'prod_cont', activo: true, inventarioFinal: 5, costoUnitarioInventario: 2, historialContable: { nested: { h: 1 } } }],
      productosDecisionDestino: [
        { productoId: 'prod_cont', accion: 'CONTINUAR', activo: true, estrategia: estrategiaCompleta({ segmento: 'Continuo' }) },
        { productoId: 'prod_crear', accion: 'CREAR', activo: true, estrategia: estrategiaCompleta({ segmento: 'Crear' }) },
        { productoId: 'prod_desc', accion: 'DESCONTINUAR', activo: false, estrategia: null },
        { productoId: 'prod_react', accion: 'REACTIVAR', activo: true, estrategia: estrategiaCompleta({ segmento: 'Reactivar' }) },
      ],
      productosEstadoFinalAnterior: [
        { productoId: 'prod_cont', activo: true, inventarioFinal: 5, costoUnitarioInventario: 2, historialContable: { nested: { h: 1 } } },
        { productoId: 'prod_desc', activo: true, inventarioFinal: 7, costoUnitarioInventario: 3, historialContable: { nested: { h: 2 } } },
        { productoId: 'prod_react', activo: false, inventarioFinal: 9, costoUnitarioInventario: 4, historialContable: { nested: { h: 3 } } },
      ],
    });
    const salida = calcularContado(entrada);
    validarIndependenciaReferencias(entrada, salida);
    assert.notStrictEqual(salida.empresaEstadoInicial.pedidosPendientes, entrada.empresaEstadoFinalAnterior.pedidosPendientes);
    assert.notStrictEqual(salida.empresaEstadoInicial.pedidosPendientes[0], entrada.empresaEstadoFinalAnterior.pedidosPendientes[0]);
    for (const productoSalida of salida.productosEstadoInicial) {
      const anterior = entrada.productosEstadoFinalAnterior.find(p => p.productoId === productoSalida.productoId);
      const decision = entrada.productosDecisionDestino.find(d => d.productoId === productoSalida.productoId);
      if (anterior) assert.notStrictEqual(productoSalida.historialContable, anterior.historialContable);
      if (decision?.estrategia) assert.notStrictEqual(productoSalida.estrategiaDestino, decision.estrategia);
    }
  }

  {
    const compartido = { nested: { cantidad: 10 } };
    assertAborta(
      () => validarIndependenciaReferencias({ a: { compartido } }, { b: [{ c: compartido }] }),
      'ERROR_BLOQUEANTE_REFERENCIA_COMPARTIDA_ENTRADA_SALIDA',
      '43a. referencia compartida anidada debe abortar'
    );
  }

  console.log('43. Independencia de referencias: salida real sin alias y alias anidado bloqueado por función productiva: OK');
}

// ============================================================================
// 44. Corrección V2-2E: pedidosPendientes es array de objetos planos clonables.
// ============================================================================
{
  function entradaConPedido(pedido) {
    return entradaBase({ empresaEstadoFinalAnterior: estadoEmpresaBase({ pedidosPendientes: [pedido] }) });
  }

  const invalidos = [
    ['null', null],
    ['number', 1],
    ['string', 'pedido'],
    ['array', []],
    ['Date', new Date()],
    ['Map', new Map()],
    ['Set', new Set()],
    ['function', () => 1],
    ['Symbol', Symbol('pedido')],
    ['BigInt', 1n],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['undefined', undefined],
  ];

  class PedidoFalso { constructor() { this.cantidad = 1; } }
  invalidos.push(['class instance', new PedidoFalso()]);

  for (const [nombre, pedido] of invalidos) {
    assertAborta(
      () => calcularContado(entradaConPedido(pedido)),
      'ERROR_BLOQUEANTE_PEDIDO_PENDIENTE_INVALIDO',
      `44. pedidosPendientes rechaza ${nombre}`
    );
  }

  {
    assertAborta(
      () => calcularContado(entradaConPedido({ fecha: new Date() })),
      'ERROR_BLOQUEANTE_PEDIDO_PENDIENTE_INVALIDO',
      '44. pedidosPendientes rechaza Date anidado'
    );
  }
  {
    const circular = {};
    circular.self = circular;
    assertAborta(
      () => calcularContado(entradaConPedido(circular)),
      'ERROR_BLOQUEANTE_PEDIDO_PENDIENTE_INVALIDO',
      '44. pedidosPendientes rechaza referencia circular'
    );
  }

  calcularContado(entradaConPedido({}));
  calcularContado(entradaConPedido({ proveedorId: 'prov_1', detalle: { cantidad: 10, entregas: [6, 7], nota: null } }));

  {
    const { validarOutput } = k01._internalsParaPruebas;
    const salida = structuredClone(calcularContado(entradaConPedido({ proveedorId: 'prov_1' })));
    salida.empresaEstadoInicial.pedidosPendientes[0] = new Date();
    assertAborta(
      () => validarOutput(salida),
      'ERROR_BLOQUEANTE_SALIDA_K01_INVALIDA',
      '44. salida rechaza pedido pendiente no plano'
    );
  }

  console.log('44. pedidosPendientes: 16 rechazos controlados + objeto vacío/nested JSON válidos + salida validada: OK');
}

// ============================================================================
// 45. Corrección V2-2E: detección estructural de mutación de entrada.
// ============================================================================
{
  const Module = require('module');
  const indexPath = require.resolve('../../src/motor-v2/kernels/k01-continuidad');
  const calculatePath = require.resolve('../../src/motor-v2/kernels/k01-continuidad/calculate');
  const calcularInternoReal = require('../../src/motor-v2/kernels/k01-continuidad/calculate').calcularInterno;
  const originalLoad = Module._load;
  delete require.cache[indexPath];
  Module._load = function loadConCalculateMutante(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved === calculatePath) {
      return {
        calcularInterno(entrada) {
          entrada.contexto.mutacionInvisibleParaJson = undefined;
          return calcularInternoReal(entrada);
        },
      };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const k01Mutante = require(indexPath);
    assertAborta(
      () => k01Mutante.calcular(entradaBase()),
      'ERROR_BLOQUEANTE_MUTACION_DE_ENTRADA',
      '45. mutación con propiedad undefined debe ser detectada aunque JSON.stringify la omita'
    );
  } finally {
    Module._load = originalLoad;
    delete require.cache[indexPath];
  }

  console.log('45. Mutación de entrada: cambio invisible para JSON.stringify detectado por comparación estructural: OK');
}

console.log(`\nmotor-v2 K01 continuidad (V2-2E): TODAS LAS PRUEBAS OK (45 bloques de prueba)`);
console.log(`Número real de invocaciones a k01.calcular() durante esta ejecución: ${numeroDeEjecucionesDeK01Calcular}`);
