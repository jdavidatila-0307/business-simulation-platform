const assert = require('node:assert/strict');
const k02 = require('../../src/motor-v2/kernels/k02-decisiones');
const { KernelError } = require('../../src/motor-v2/shared/errors');
const { clonarProfundo, sonEstructuralmenteIguales } = require('../../src/motor-v2/shared/validation');

let bloques = 0;
let subcasos = 0;
const historial = [];

function test(nombre, fn) {
  bloques += 1;
  try {
    fn();
    historial.push(`OK ${nombre}`);
  } catch (e) {
    historial.push(`FALLO ${nombre}: ${e.code || e.name || 'Error'} ${e.message}`);
    throw e;
  }
}

function ok(nombre, fn) {
  test(nombre, () => {
    subcasos += 1;
    const salida = fn();
    assert.equal(salida.kernel.codigo, 'K02');
    assert.equal(salida.kernel.nombre, 'Preparación y validación canónica de decisiones');
    assert.equal(salida.kernel.version, '1.0.0');
    assert.equal(salida.advertencias.length, 0);
    assert.ok(Object.isFrozen(salida));
    return salida;
  });
}

function falla(nombre, code, fn) {
  test(nombre, () => {
    subcasos += 1;
    assert.throws(fn, e => e instanceof KernelError && e.code === code);
  });
}

function estrategia(overrides = {}) {
  return {
    producto: 'producto_a',
    segmentoObjetivo: 'segmento_a',
    canalPrincipal: 'canal_a',
    canalSecundario: 'NINGUNO',
    calidad: 7,
    precioVenta: 100,
    publicidad: 0,
    promocion: 0,
    eventos: 0,
    marketingRedes: 0,
    relacionesPublicas: 0,
    innovacion: false,
    tipoInnovacion: null,
    montoInnovacion: 0,
    ...overrides,
  };
}

function abastecimiento(overrides = {}) {
  return {
    cantidadMPPedida: 0,
    proveedorId: null,
    modalidadPago: null,
    plazoCreditoRondas: 0,
    costoFinancieroCredito: 0,
    ...overrides,
  };
}

function produccion(overrides = {}) {
  return { produccionSolicitada: 10, ...overrides };
}

function productoDecision(productoId, accion = 'CONTINUAR', overrides = {}) {
  const activo = accion !== 'DESCONTINUAR';
  const base = {
    productoId,
    accion,
    activo,
    estrategia: activo ? estrategia() : null,
    abastecimiento: activo ? abastecimiento() : null,
    produccion: activo ? produccion() : null,
  };
  return { ...base, ...overrides };
}

function productoK01(productoId, origen = 'CONTINUO', overrides = {}) {
  return {
    productoId,
    origen,
    activo: origen !== 'DESCONTINUADO',
    inventarioInicial: 0,
    costoUnitarioInventario: 0,
    historialContable: {},
    estrategiaDestino: origen === 'DESCONTINUADO' ? null : {},
    ...overrides,
  };
}

function empresa(overrides = {}) {
  return {
    rrhh: {
      contratarOperarios: 0,
      despedirOperarios: 0,
      montoCapacitacion: 0,
      contratarVendedores: 0,
      despedirVendedores: 0,
    },
    financiamiento: {
      tipoPrestamo: 'NINGUNO',
      montoPrestamo: 0,
      plazoPrestamo: 0,
      amortizacion: 0,
    },
    investigacion: { tipoInvestigacion: 'NO' },
    inversionActivos: {
      nuevaPlantaOpcionId: null,
      ampliacionPlantaOpcionId: null,
      maquinariaOpcionId: null,
      vehiculosOpcionId: null,
      mueblesOpcionId: null,
      computoOpcionId: null,
      patentesOpcionId: null,
    },
    ...overrides,
  };
}

function parametros(overrides = {}) {
  return {
    version: 'v1',
    catalogos: {
      productos: [{ id: 'producto_a', activo: true }, { id: 'producto_b', activo: true }, { id: 'producto_inactivo', activo: false }],
      segmentos: [{ id: 'segmento_a', activo: true }, { id: 'segmento_inactivo', activo: false }],
      canales: [{ id: 'canal_a', activo: true }, { id: 'canal_b', activo: true }, { id: 'canal_inactivo', activo: false }],
      proveedores: [{ id: 'proveedor_a', activo: true }, { id: 'proveedor_inactivo', activo: false }],
      opcionesActivos: [
        { id: 'planta_1', tipoActivo: 'NUEVA_PLANTA', activo: true },
        { id: 'ampl_1', tipoActivo: 'AMPLIACION_PLANTA', activo: true },
        { id: 'maq_1', tipoActivo: 'MAQUINARIA', activo: true },
        { id: 'veh_1', tipoActivo: 'VEHICULOS', activo: true },
        { id: 'mue_1', tipoActivo: 'MUEBLES', activo: true },
        { id: 'comp_1', tipoActivo: 'COMPUTO', activo: true },
        { id: 'pat_1', tipoActivo: 'PATENTES', activo: true },
        { id: 'planta_inactiva', tipoActivo: 'NUEVA_PLANTA', activo: false },
      ],
    },
    limites: [],
    ...overrides,
  };
}

function baseInput(productos = [productoK01('prod_1')], decisiones = [productoDecision('prod_1')]) {
  return {
    contexto: {
      simulacionId: 'sim_1',
      empresaId: 'empresa_1',
      ronda: 2,
      versionMotor: 'v2',
    },
    estadoInicialK01: {
      kernel: { codigo: 'K01', nombre: 'Continuidad', version: '1.0.0' },
      contexto: { simulacionId: 'sim_1', empresaId: 'empresa_1', rondaAnterior: 1, rondaDestino: 2 },
      empresaEstadoInicial: {
        caja: 1000,
        deudaFinanciera: 100,
        saldoSobregiro: 50,
        inventario: 10,
      },
      productosEstadoInicial: productos,
      eventos: [],
      advertencias: [],
    },
    decisionesRonda: {
      empresa: empresa(),
      productos: decisiones,
    },
    parametrosPermitidos: parametros(),
  };
}

function mod(mutador) {
  const entrada = baseInput();
  mutador(entrada);
  return entrada;
}

function calcular(entrada = baseInput()) {
  return k02.calcular(entrada);
}

function assertCongeladoProfundo(valor, ruta = '$') {
  if (valor && typeof valor === 'object') {
    assert.ok(Object.isFrozen(valor), `${ruta} no esta congelado`);
    Object.entries(valor).forEach(([k, v]) => assertCongeladoProfundo(v, `${ruta}.${k}`));
  }
}

function entradaFronteraProfunda() {
  const e = baseInput();
  e.estadoInicialK01.empresaEstadoInicial = {
    caja: 12345,
    deudaFinanciera: 111,
    saldoSobregiro: 22,
    inventario: 333,
    compras: { historicas: 444, detalle: [{ proveedorId: 'proveedor_a', monto: 55 }] },
    capacidad: { instalada: 666, notas: ['no recalcular'] },
    produccionReal: { anterior: 777 },
    ventas: { acumuladas: 888, canales: { canal_a: 99 } },
    impuestos: { iva: 10, iue: 11 },
    asientos: [{ cuenta: 'Caja', debe: 1, haber: 0 }],
    anidado: { nivel1: { nivel2: { marcador: 'preservar' } } },
  };
  e.estadoInicialK01.productosEstadoInicial[0].inventarioInicial = 44;
  e.estadoInicialK01.productosEstadoInicial[0].historialContable = {
    compras: [{ lote: 'L1', cantidad: 12 }],
    ventas: { r1: 5 },
    asientos: [{ cuenta: 'Inventario', debe: 12, haber: 0 }],
  };
  e.estadoInicialK01.eventos = [{ eventId: 'k01_evt_1', metadatos: { compras: 1, ventas: 2 } }];
  e.estadoInicialK01.advertencias = [{ codigo: 'K01_WARN', detalle: { capacidad: 'sin cambio' } }];
  return e;
}

function assertFronteraPreservada(e, salida) {
  assert.ok(sonEstructuralmenteIguales(salida.estadoInicial, e.estadoInicialK01));
  k02._internalsParaPruebas.validarIndependenciaReferencias(e, salida);
}

// A. Casos validos
ok('01 Empresa con un producto CONTINUAR', () => calcular());
ok('02 Empresa con cinco productos', () => {
  const productos = ['prod_5', 'prod_1', 'prod_3', 'prod_2', 'prod_4'].map(id => productoK01(id));
  const decisiones = ['prod_5', 'prod_1', 'prod_3', 'prod_2', 'prod_4'].map(id => productoDecision(id));
  const salida = calcular(baseInput(productos, decisiones));
  assert.deepEqual(salida.decisionesCanonicas.productos.map(p => p.productoId), ['prod_1', 'prod_2', 'prod_3', 'prod_4', 'prod_5']);
  return salida;
});
ok('03 CREAR valido', () => calcular(baseInput([productoK01('prod_n', 'NUEVO')], [productoDecision('prod_n', 'CREAR')])));
ok('04 REACTIVAR valido', () => calcular(baseInput([productoK01('prod_r', 'REACTIVADO')], [productoDecision('prod_r', 'REACTIVAR')])));
ok('05 DESCONTINUAR valido', () => calcular(baseInput([productoK01('prod_d', 'DESCONTINUADO')], [productoDecision('prod_d', 'DESCONTINUAR')])));
ok('06 Abastecimiento cantidad cero', () => calcular());
ok('07 Abastecimiento CONTADO', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento = abastecimiento({ cantidadMPPedida: 1, proveedorId: 'proveedor_a', modalidadPago: 'CONTADO' }); })));
ok('08 Abastecimiento CREDITO', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento = abastecimiento({ cantidadMPPedida: 1, proveedorId: 'proveedor_a', modalidadPago: 'CREDITO', plazoCreditoRondas: 2, costoFinancieroCredito: 0 }); })));
ok('09 Abastecimiento ANTICIPO', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento = abastecimiento({ cantidadMPPedida: 1, proveedorId: 'proveedor_a', modalidadPago: 'ANTICIPO' }); })));
ok('10 Abastecimiento CONTRA_ENTREGA', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento = abastecimiento({ cantidadMPPedida: 1, proveedorId: 'proveedor_a', modalidadPago: 'CONTRA_ENTREGA' }); })));
ok('11 Innovacion false', () => calcular());
ok('12 Innovacion true', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia = estrategia({ innovacion: true, tipoInnovacion: 'PRODUCTO', montoInnovacion: 100 }); })));
ok('13 NINGUNO con monto plazo cero', () => calcular());
ok('14 OPERATIVO valido', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento = { tipoPrestamo: 'OPERATIVO', montoPrestamo: 10, plazoPrestamo: 1, amortizacion: 0 }; })));
ok('15 INVERSION valido', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento = { tipoPrestamo: 'INVERSION', montoPrestamo: 10, plazoPrestamo: 1, amortizacion: 0 }; })));
ok('16 Amortizacion con NINGUNO', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento.amortizacion = 50; })));
ok('17 Amortizacion simultanea con prestamo', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento = { tipoPrestamo: 'OPERATIVO', montoPrestamo: 10, plazoPrestamo: 1, amortizacion: 50 }; })));
ok('18 Compra valida de cada tipo de activo', () => calcular(mod(e => { e.decisionesRonda.empresa.inversionActivos = { nuevaPlantaOpcionId: 'planta_1', ampliacionPlantaOpcionId: 'ampl_1', maquinariaOpcionId: 'maq_1', vehiculosOpcionId: 'veh_1', mueblesOpcionId: 'mue_1', computoOpcionId: 'comp_1', patentesOpcionId: 'pat_1' }; })));
ok('19 Todos los activos null', () => calcular());
ok('20 Cero valido en todos los campos permitidos', () => calcular());
ok('21 Limites validos', () => calcular(mod(e => { e.parametrosPermitidos.limites = [{ campo: 'decisionesRonda.productos[].estrategia.precioVenta', minimo: 1, maximo: 200, unidad: 'Bs', version: 'v1', fuente: 'profesor' }]; })));
ok('22 Dos ordenes distintos producen salida identica', () => {
  const p1 = ['prod_b', 'prod_a'].map(id => productoK01(id));
  const d1 = ['prod_b', 'prod_a'].map(id => productoDecision(id));
  const p2 = ['prod_a', 'prod_b'].map(id => productoK01(id));
  const d2 = ['prod_a', 'prod_b'].map(id => productoDecision(id));
  const s1 = calcular(baseInput(p1, d1));
  const s2 = calcular(baseInput(p2, d2));
  assert.deepEqual(s1.decisionesCanonicas.productos, s2.decisionesCanonicas.productos);
  return s1;
});
ok('23 Mismo input produce mismos eventId', () => {
  const e = baseInput();
  const a = calcular(e);
  const b = calcular(e);
  assert.deepEqual(a.eventos.map(x => x.eventId), b.eventos.map(x => x.eventId));
  return a;
});
ok('24 Entrada no se modifica', () => {
  const e = baseInput();
  const snap = clonarProfundo(e);
  const s = calcular(e);
  assert.ok(sonEstructuralmenteIguales(e, snap));
  return s;
});
ok('25 Salida profundamente congelada', () => {
  const s = calcular();
  assertCongeladoProfundo(s);
  return s;
});
ok('26 Sin referencias compartidas', () => {
  const e = baseInput();
  const s = calcular(e);
  k02._internalsParaPruebas.validarIndependenciaReferencias(e, s);
  return s;
});
ok('26b Salida no contiene parametrosPermitidosCanonicos', () => {
  const s = calcular();
  assert.equal(Object.prototype.hasOwnProperty.call(s, 'parametrosPermitidosCanonicos'), false);
  return s;
});

// B. Casos invalidos
falla('27 Alias legacy', 'ERROR_BLOQUEANTE_VALOR_NO_CANONICO_K02', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento.tipoPrestamo = 'Operativo'; })));
falla('28 Enumeracion en minusculas', 'ERROR_BLOQUEANTE_VALOR_NO_CANONICO_K02', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento.tipoPrestamo = 'operativo'; })));
falla('29 Valor con espacios exteriores', 'ERROR_BLOQUEANTE_VALOR_NO_CANONICO_K02', () => calcular(mod(e => { e.decisionesRonda.empresa.investigacion.tipoInvestigacion = ' NO'; })));
falla('30 Propiedad desconocida', 'ERROR_BLOQUEANTE_PROPIEDAD_K02_DESCONOCIDA', () => calcular(mod(e => { e.decisionesRonda.empresa.rrhh.extra = 1; })));
falla('31 Producto sin decision', 'ERROR_BLOQUEANTE_PRODUCTO_SIN_DECISION', () => calcular(baseInput([productoK01('prod_1'), productoK01('prod_2')], [productoDecision('prod_1')])));
falla('32 Decision duplicada', 'ERROR_BLOQUEANTE_DECISION_DUPLICADA', () => calcular(baseInput([productoK01('prod_1')], [productoDecision('prod_1'), productoDecision('prod_1')])));
falla('33 Decision para producto inexistente', 'ERROR_BLOQUEANTE_DECISION_PRODUCTO_INEXISTENTE', () => calcular(baseInput([productoK01('prod_1')], [productoDecision('prod_1'), productoDecision('prod_2')])));
falla('34 Accion incompatible con origen', 'ERROR_BLOQUEANTE_ACCION_ORIGEN_INCONSISTENTE', () => calcular(baseInput([productoK01('prod_1', 'CONTINUO')], [productoDecision('prod_1', 'CREAR')])));
falla('35 activo incompatible', 'ERROR_BLOQUEANTE_ACCION_ORIGEN_INCONSISTENTE', () => calcular(baseInput([productoK01('prod_1')], [productoDecision('prod_1', 'CONTINUAR', { activo: false })])));
falla('36 DESCONTINUAR con estrategia', 'ERROR_BLOQUEANTE_PRODUCTO_DESCONTINUADO_CON_DECISIONES', () => calcular(baseInput([productoK01('prod_1', 'DESCONTINUADO')], [productoDecision('prod_1', 'DESCONTINUAR', { estrategia: estrategia() })])));
falla('37 DESCONTINUAR con abastecimiento', 'ERROR_BLOQUEANTE_PRODUCTO_DESCONTINUADO_CON_DECISIONES', () => calcular(baseInput([productoK01('prod_1', 'DESCONTINUADO')], [productoDecision('prod_1', 'DESCONTINUAR', { abastecimiento: abastecimiento() })])));
falla('38 DESCONTINUAR con produccion', 'ERROR_BLOQUEANTE_PRODUCTO_DESCONTINUADO_CON_DECISIONES', () => calcular(baseInput([productoK01('prod_1', 'DESCONTINUADO')], [productoDecision('prod_1', 'DESCONTINUAR', { produccion: produccion() })])));
falla('39 Estrategia incompleta', 'ERROR_BLOQUEANTE_PARAMETROS_K02_INVALIDOS', () => calcular(mod(e => { delete e.decisionesRonda.productos[0].estrategia.producto; })));
falla('40 Precio cero', 'ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.precioVenta = 0; })));
falla('41 Calidad fuera de 1-10', 'ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.calidad = 11; })));
falla('42 Innovacion false con tipo', 'ERROR_BLOQUEANTE_INNOVACION_INCONSISTENTE', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.tipoInnovacion = 'PRODUCTO'; })));
falla('43 Innovacion false con monto', 'ERROR_BLOQUEANTE_INNOVACION_INCONSISTENTE', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.montoInnovacion = 1; })));
falla('44 Innovacion true sin tipo', 'ERROR_BLOQUEANTE_TIPO_INNOVACION_INVALIDO', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.innovacion = true; })));
falla('45 Innovacion true con monto cero', 'ERROR_BLOQUEANTE_MONTO_INNOVACION_INVALIDO', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.innovacion = true; e.decisionesRonda.productos[0].estrategia.tipoInnovacion = 'PRODUCTO'; })));
falla('46 CantidadMPPedida cero con proveedor', 'ERROR_BLOQUEANTE_ABASTECIMIENTO_INCONSISTENTE', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento.proveedorId = 'proveedor_a'; })));
falla('47 Cantidad positiva sin proveedor', 'ERROR_BLOQUEANTE_VALOR_NO_CANONICO_K02', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento.cantidadMPPedida = 1; e.decisionesRonda.productos[0].abastecimiento.modalidadPago = 'CONTADO'; })));
falla('48 Modalidad invalida', 'ERROR_BLOQUEANTE_VALOR_NO_CANONICO_K02', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento = abastecimiento({ cantidadMPPedida: 1, proveedorId: 'proveedor_a', modalidadPago: 'EFECTIVO' }); })));
falla('49 CREDITO sin plazo', 'ERROR_BLOQUEANTE_CREDITO_PROVEEDOR_INCOMPLETO', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento = abastecimiento({ cantidadMPPedida: 1, proveedorId: 'proveedor_a', modalidadPago: 'CREDITO', plazoCreditoRondas: null }); })));
falla('50 CREDITO con plazo cero', 'ERROR_BLOQUEANTE_CREDITO_PROVEEDOR_INCOMPLETO', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento = abastecimiento({ cantidadMPPedida: 1, proveedorId: 'proveedor_a', modalidadPago: 'CREDITO', plazoCreditoRondas: 0 }); })));
falla('51 Modalidad no credito con plazo positivo', 'ERROR_BLOQUEANTE_ABASTECIMIENTO_INCONSISTENTE', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento = abastecimiento({ cantidadMPPedida: 1, proveedorId: 'proveedor_a', modalidadPago: 'CONTADO', plazoCreditoRondas: 1 }); })));
falla('52 Produccion cero', 'ERROR_BLOQUEANTE_PRODUCCION_SOLICITADA_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.productos[0].produccion.produccionSolicitada = 0; })));
falla('53 NaN', 'ERROR_BLOQUEANTE_ESTRUCTURA_NO_CLONABLE', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.precioVenta = NaN; })));
falla('54 Infinity', 'ERROR_BLOQUEANTE_ESTRUCTURA_NO_CLONABLE', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.precioVenta = Infinity; })));
falla('55 Entero requerido con decimal', 'ERROR_BLOQUEANTE_PRODUCCION_SOLICITADA_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.productos[0].produccion.produccionSolicitada = 1.5; })));
falla('56 NINGUNO con monto positivo', 'ERROR_BLOQUEANTE_PRESTAMO_NINGUNO_INCONSISTENTE', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento.montoPrestamo = 1; })));
falla('57 NINGUNO con plazo positivo', 'ERROR_BLOQUEANTE_PRESTAMO_NINGUNO_INCONSISTENTE', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento.plazoPrestamo = 1; })));
falla('58 OPERATIVO con monto cero', 'ERROR_BLOQUEANTE_PRESTAMO_INCOMPLETO', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento.tipoPrestamo = 'OPERATIVO'; e.decisionesRonda.empresa.financiamiento.plazoPrestamo = 1; })));
falla('59 INVERSION con plazo cero', 'ERROR_BLOQUEANTE_PRESTAMO_INCOMPLETO', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento.tipoPrestamo = 'INVERSION'; e.decisionesRonda.empresa.financiamiento.montoPrestamo = 1; })));
falla('60 Amortizacion negativa', 'ERROR_BLOQUEANTE_AMORTIZACION_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento.amortizacion = -1; })));
falla('61 Amortizacion mayor a deuda mas sobregiro', 'ERROR_BLOQUEANTE_AMORTIZACION_SUPERA_SALDOS_INICIALES', () => calcular(mod(e => { e.decisionesRonda.empresa.financiamiento.amortizacion = 151; })));
falla('62 String vacio en activo', 'ERROR_BLOQUEANTE_OPCION_ACTIVO_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.empresa.inversionActivos.nuevaPlantaOpcionId = ''; })));
falla('63 Opcion inexistente', 'ERROR_BLOQUEANTE_OPCION_ACTIVO_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.empresa.inversionActivos.nuevaPlantaOpcionId = 'no_existe'; })));
falla('64 Opcion inactiva', 'ERROR_BLOQUEANTE_REFERENCIA_ACTIVO_INACTIVA', () => calcular(mod(e => { e.decisionesRonda.empresa.inversionActivos.nuevaPlantaOpcionId = 'planta_inactiva'; })));
falla('65 Opcion de tipo incompatible', 'ERROR_BLOQUEANTE_OPCION_ACTIVO_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.empresa.inversionActivos.nuevaPlantaOpcionId = 'maq_1'; })));
falla('66 Contrato legacy de activo', 'ERROR_BLOQUEANTE_CONTRATO_ACTIVO_LEGACY', () => calcular(mod(e => { e.decisionesRonda.empresa.inversionActivos.nuevaPlantaOpcionId = { tipoPlanta: '1' }; })));
falla('67 Catalogo duplicado', 'ERROR_BLOQUEANTE_CATALOGO_K02_DUPLICADO', () => calcular(mod(e => { e.parametrosPermitidos.catalogos.productos.push({ id: 'producto_a', activo: true }); })));
falla('68 Limite con ruta desconocida', 'ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO', () => calcular(mod(e => { e.parametrosPermitidos.limites = [{ campo: 'x', minimo: 0, maximo: 1, unidad: 'u', version: 'v1', fuente: 'profesor' }]; })));
falla('69 Limite duplicado', 'ERROR_BLOQUEANTE_LIMITE_K02_AMBIGUO', () => calcular(mod(e => { e.parametrosPermitidos.limites = [{ campo: 'decisionesRonda.productos[].estrategia.precioVenta', minimo: 0, maximo: 200, unidad: 'u', version: 'v1', fuente: 'profesor' }, { campo: 'decisionesRonda.productos[].estrategia.precioVenta', minimo: 0, maximo: 300, unidad: 'u', version: 'v1', fuente: 'profesor' }]; })));
falla('70 Minimo mayor que maximo', 'ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO', () => calcular(mod(e => { e.parametrosPermitidos.limites = [{ campo: 'decisionesRonda.productos[].estrategia.precioVenta', minimo: 2, maximo: 1, unidad: 'u', version: 'v1', fuente: 'profesor' }]; })));
falla('71 Referencia a producto inactivo', 'ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.producto = 'producto_inactivo'; })));
falla('72 Segmento inactivo', 'ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.segmentoObjetivo = 'segmento_inactivo'; })));
falla('73 Canal inactivo', 'ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.canalPrincipal = 'canal_inactivo'; })));
falla('74 Proveedor inactivo', 'ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.productos[0].abastecimiento = abastecimiento({ cantidadMPPedida: 1, proveedorId: 'proveedor_inactivo', modalidadPago: 'CONTADO' }); })));
falla('74b canalPrincipal NINGUNO sin catalogo', 'ERROR_BLOQUEANTE_VALOR_NO_CANONICO_K02', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.canalPrincipal = 'NINGUNO'; })));
falla('74c canalPrincipal NINGUNO aunque exista activo', 'ERROR_BLOQUEANTE_VALOR_NO_CANONICO_K02', () => calcular(mod(e => { e.parametrosPermitidos.catalogos.canales.push({ id: 'NINGUNO', activo: true }); e.decisionesRonda.productos[0].estrategia.canalPrincipal = 'NINGUNO'; })));
ok('74d canalSecundario NINGUNO sin catalogo acepta', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.canalSecundario = 'NINGUNO'; })));
ok('74e canalSecundario canal activo acepta', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.canalSecundario = 'canal_b'; })));
falla('74f canalSecundario canal inactivo rechaza', 'ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', () => calcular(mod(e => { e.decisionesRonda.productos[0].estrategia.canalSecundario = 'canal_inactivo'; })));
falla('75 Mutacion de entrada detectada', 'ERROR_BLOQUEANTE_MUTACION_ENTRADA_K02', () => {
  const e = baseInput();
  const snapshot = clonarProfundo(e);
  e.decisionesRonda.empresa.rrhh.contratarOperarios = 1;
  k02._internalsParaPruebas.validarEntradaNoMutada(e, snapshot);
});
falla('76 Referencia compartida detectada', 'ERROR_BLOQUEANTE_REFERENCIA_COMPARTIDA_K02', () => {
  const e = baseInput();
  k02._internalsParaPruebas.validarIndependenciaReferencias(e, { compartida: e.decisionesRonda.empresa });
});
falla('77 eventId alterado', 'ERROR_BLOQUEANTE_EVENT_ID_K02_INVALIDO', () => {
  const e = baseInput();
  const s = k02._internalsParaPruebas.calcularInterno(e);
  s.eventos[0].eventId = 'x';
  k02._internalsParaPruebas.validarOutput(s, e);
});
falla('78 Evento huerfano', 'ERROR_BLOQUEANTE_EVENTO_HUERFANO', () => {
  const e = baseInput();
  const s = k02._internalsParaPruebas.calcularInterno(e);
  s.eventos[0].productoId = 'prod_x';
  s.eventos[0].eventId = require('../../src/motor-v2/kernels/k02-decisiones/validate-input').crearEventIdK02({ simulacionId: 'sim_1', empresaId: 'empresa_1', ronda: 2, productoId: 'prod_x', eventType: 'K02_PRODUCTO_VALIDADO' });
  k02._internalsParaPruebas.validarOutput(s, e);
});
falla('79 Evento duplicado', 'ERROR_BLOQUEANTE_EVENTO_DUPLICADO', () => {
  const e = baseInput([productoK01('prod_1'), productoK01('prod_2')], [productoDecision('prod_1'), productoDecision('prod_2')]);
  const s = k02._internalsParaPruebas.calcularInterno(e);
  s.eventos[1] = clonarProfundo(s.eventos[0]);
  k02._internalsParaPruebas.validarOutput(s, e);
});
falla('80 Salida fuera de orden', 'ERROR_BLOQUEANTE_SALIDA_K02_INVALIDA', () => {
  const e = baseInput([productoK01('prod_b'), productoK01('prod_a')], [productoDecision('prod_b'), productoDecision('prod_a')]);
  const s = k02._internalsParaPruebas.calcularInterno(e);
  s.decisionesCanonicas.productos.reverse();
  k02._internalsParaPruebas.validarOutput(s, e);
});
falla('80b Salida adulterada con parametrosPermitidosCanonicos', 'ERROR_BLOQUEANTE_PROPIEDAD_K02_DESCONOCIDA', () => {
  const e = baseInput();
  const s = k02._internalsParaPruebas.calcularInterno(e);
  s.parametrosPermitidosCanonicos = clonarProfundo(e.parametrosPermitidos);
  k02._internalsParaPruebas.validarOutput(s, e);
});

// C. Fronteras
ok('81 K02 no modifica caja', () => { const e = baseInput(); const s = calcular(e); assert.equal(s.estadoInicial.empresaEstadoInicial.caja, 1000); return s; });
ok('82 K02 no modifica deuda', () => { const e = baseInput(); const s = calcular(e); assert.equal(s.estadoInicial.empresaEstadoInicial.deudaFinanciera, 100); return s; });
ok('83 K02 no modifica sobregiro', () => { const e = baseInput(); const s = calcular(e); assert.equal(s.estadoInicial.empresaEstadoInicial.saldoSobregiro, 50); return s; });
ok('84 K02 no modifica inventario', () => { const e = baseInput(); const s = calcular(e); assert.equal(s.estadoInicial.empresaEstadoInicial.inventario, 10); return s; });
ok('85 K02 no calcula compras', () => { const e = entradaFronteraProfunda(); const s = calcular(e); assertFronteraPreservada(e, s); assert.deepEqual(s.estadoInicial.empresaEstadoInicial.compras, e.estadoInicialK01.empresaEstadoInicial.compras); return s; });
ok('86 K02 no calcula capacidad', () => { const e = entradaFronteraProfunda(); const s = calcular(e); assertFronteraPreservada(e, s); assert.deepEqual(s.estadoInicial.empresaEstadoInicial.capacidad, e.estadoInicialK01.empresaEstadoInicial.capacidad); return s; });
ok('87 K02 no calcula produccion real', () => { const e = entradaFronteraProfunda(); const s = calcular(e); assertFronteraPreservada(e, s); assert.deepEqual(s.estadoInicial.empresaEstadoInicial.produccionReal, e.estadoInicialK01.empresaEstadoInicial.produccionReal); return s; });
ok('88 K02 no calcula ventas', () => { const e = entradaFronteraProfunda(); const s = calcular(e); assertFronteraPreservada(e, s); assert.deepEqual(s.estadoInicial.empresaEstadoInicial.ventas, e.estadoInicialK01.empresaEstadoInicial.ventas); return s; });
ok('89 K02 no calcula impuestos', () => { const e = entradaFronteraProfunda(); const s = calcular(e); assertFronteraPreservada(e, s); assert.deepEqual(s.estadoInicial.empresaEstadoInicial.impuestos, e.estadoInicialK01.empresaEstadoInicial.impuestos); return s; });
ok('90 K02 no genera asientos', () => { const e = entradaFronteraProfunda(); const s = calcular(e); assertFronteraPreservada(e, s); assert.deepEqual(s.estadoInicial.empresaEstadoInicial.asientos, e.estadoInicialK01.empresaEstadoInicial.asientos); return s; });

console.log(`motor-v2 K02 decisiones (V2-4A): TODAS LAS PRUEBAS OK (${bloques} bloques de prueba, ${subcasos} subcasos)`);
