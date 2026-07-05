const { createHash } = require('node:crypto');
const { KernelError } = require('../../shared/errors');
const {
  esNumeroFinito,
  esNumeroFinitoNoNegativo,
  esEnteroFinitoNoNegativo,
  esBooleano,
  esArray,
  esObjetoPlano,
  validarEstructuraClonable,
} = require('../../shared/validation');
const { CODIGO, VERSION } = require('./version');

const ACCIONES = ['CONTINUAR', 'CREAR', 'DESCONTINUAR', 'REACTIVAR'];
const ORIGEN_A_ACCION = {
  CONTINUO: 'CONTINUAR',
  NUEVO: 'CREAR',
  DESCONTINUADO: 'DESCONTINUAR',
  REACTIVADO: 'REACTIVAR',
};
const ORIGENES = Object.keys(ORIGEN_A_ACCION);
const TIPOS_PRESTAMO = ['NINGUNO', 'OPERATIVO', 'INVERSION'];
const TIPOS_INVESTIGACION = ['NO', 'BASICA', 'PREMIUM', 'ESTRATEGICA'];
const TIPOS_INNOVACION = ['PRODUCTO', 'PROCESO', 'CANAL'];
const MODALIDADES_PAGO = ['CONTADO', 'CREDITO', 'ANTICIPO', 'CONTRA_ENTREGA'];
const TIPOS_ACTIVO = [
  'NUEVA_PLANTA',
  'AMPLIACION_PLANTA',
  'MAQUINARIA',
  'VEHICULOS',
  'MUEBLES',
  'COMPUTO',
  'PATENTES',
];
const CAMPOS_ACTIVOS = {
  nuevaPlantaOpcionId: 'NUEVA_PLANTA',
  ampliacionPlantaOpcionId: 'AMPLIACION_PLANTA',
  maquinariaOpcionId: 'MAQUINARIA',
  vehiculosOpcionId: 'VEHICULOS',
  mueblesOpcionId: 'MUEBLES',
  computoOpcionId: 'COMPUTO',
  patentesOpcionId: 'PATENTES',
};
const CAMPOS_LEGACY_ACTIVO = ['paquete', 'monto', 'incrementoCapacidad', 'tipoPlanta'];

const RUTAS_LIMITE_AUTORIZADAS = [
  'decisionesRonda.empresa.rrhh.contratarOperarios',
  'decisionesRonda.empresa.rrhh.despedirOperarios',
  'decisionesRonda.empresa.rrhh.montoCapacitacion',
  'decisionesRonda.empresa.rrhh.contratarVendedores',
  'decisionesRonda.empresa.rrhh.despedirVendedores',
  'decisionesRonda.empresa.financiamiento.montoPrestamo',
  'decisionesRonda.empresa.financiamiento.plazoPrestamo',
  'decisionesRonda.empresa.financiamiento.amortizacion',
  'decisionesRonda.productos[].estrategia.calidad',
  'decisionesRonda.productos[].estrategia.precioVenta',
  'decisionesRonda.productos[].estrategia.publicidad',
  'decisionesRonda.productos[].estrategia.promocion',
  'decisionesRonda.productos[].estrategia.eventos',
  'decisionesRonda.productos[].estrategia.marketingRedes',
  'decisionesRonda.productos[].estrategia.relacionesPublicas',
  'decisionesRonda.productos[].estrategia.montoInnovacion',
  'decisionesRonda.productos[].abastecimiento.cantidadMPPedida',
  'decisionesRonda.productos[].abastecimiento.plazoCreditoRondas',
  'decisionesRonda.productos[].abastecimiento.costoFinancieroCredito',
  'decisionesRonda.productos[].produccion.produccionSolicitada',
];

function compararOrdinal(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function crearEventIdK02({ simulacionId, empresaId, ronda, productoId, eventType, version = VERSION }) {
  const material = JSON.stringify([simulacionId, empresaId, ronda, productoId || '', eventType, CODIGO, version]);
  return createHash('sha256').update(material).digest('hex');
}

function fallar(code, message, details = {}) {
  throw new KernelError(code, message, details);
}

function validarCerrado(obj, permitidas, ruta) {
  if (!esObjetoPlano(obj)) {
    fallar('ERROR_BLOQUEANTE_PARAMETROS_K02_INVALIDOS', `${ruta} debe ser objeto plano`, { ruta });
  }
  const set = new Set(permitidas);
  Object.keys(obj).forEach(k => {
    if (!set.has(k)) {
      fallar('ERROR_BLOQUEANTE_PROPIEDAD_K02_DESCONOCIDA', `${ruta}.${k} no esta permitido`, { ruta: `${ruta}.${k}` });
    }
  });
  permitidas.forEach(k => {
    if (!(k in obj)) {
      fallar('ERROR_BLOQUEANTE_PARAMETROS_K02_INVALIDOS', `${ruta}.${k} es obligatorio`, { ruta: `${ruta}.${k}` });
    }
  });
}

function validarStringCanonico(v, ruta, code = 'ERROR_BLOQUEANTE_VALOR_NO_CANONICO_K02') {
  if (typeof v !== 'string' || v.length === 0 || v !== v.trim()) {
    fallar(code, `${ruta} debe ser string canonico no vacio y sin espacios exteriores`, { ruta, valor: v });
  }
}

function validarEnum(v, permitidos, ruta) {
  validarStringCanonico(v, ruta);
  if (!permitidos.includes(v)) {
    fallar('ERROR_BLOQUEANTE_VALOR_NO_CANONICO_K02', `${ruta} no es un valor canonico permitido`, { ruta, valor: v, permitidos });
  }
}

function validarNumeroNoNeg(v, ruta, code) {
  if (!esNumeroFinitoNoNegativo(v)) fallar(code, `${ruta} debe ser numero finito >= 0`, { ruta, valor: v });
}

function validarEnteroNoNeg(v, ruta, code) {
  if (!esEnteroFinitoNoNegativo(v)) fallar(code, `${ruta} debe ser entero finito >= 0`, { ruta, valor: v });
}

function validarCatalogo(lista, nombre, propsPermitidas = ['id', 'activo']) {
  if (!esArray(lista)) fallar('ERROR_BLOQUEANTE_PARAMETROS_K02_INVALIDOS', `catalogos.${nombre} debe ser array`, { catalogo: nombre });
  const vistos = new Set();
  lista.forEach((item, idx) => {
    validarCerrado(item, propsPermitidas, `parametrosPermitidos.catalogos.${nombre}[${idx}]`);
    validarStringCanonico(item.id, `parametrosPermitidos.catalogos.${nombre}[${idx}].id`, 'ERROR_BLOQUEANTE_PARAMETROS_K02_INVALIDOS');
    if (!esBooleano(item.activo)) fallar('ERROR_BLOQUEANTE_PARAMETROS_K02_INVALIDOS', `${nombre}[${idx}].activo debe ser boolean`, { catalogo: nombre, idx });
    if (vistos.has(item.id)) fallar('ERROR_BLOQUEANTE_CATALOGO_K02_DUPLICADO', `id duplicado en catalogo ${nombre}: ${item.id}`, { catalogo: nombre, id: item.id });
    vistos.add(item.id);
  });
}

function validarParametros(parametros) {
  validarCerrado(parametros, ['version', 'catalogos', 'limites'], 'parametrosPermitidos');
  validarStringCanonico(parametros.version, 'parametrosPermitidos.version', 'ERROR_BLOQUEANTE_PARAMETROS_K02_INVALIDOS');
  validarCerrado(parametros.catalogos, ['productos', 'segmentos', 'canales', 'proveedores', 'opcionesActivos'], 'parametrosPermitidos.catalogos');
  validarCatalogo(parametros.catalogos.productos, 'productos');
  validarCatalogo(parametros.catalogos.segmentos, 'segmentos');
  validarCatalogo(parametros.catalogos.canales, 'canales');
  validarCatalogo(parametros.catalogos.proveedores, 'proveedores');
  validarCatalogo(parametros.catalogos.opcionesActivos, 'opcionesActivos', ['id', 'tipoActivo', 'activo']);
  parametros.catalogos.opcionesActivos.forEach((op, idx) => validarEnum(op.tipoActivo, TIPOS_ACTIVO, `parametrosPermitidos.catalogos.opcionesActivos[${idx}].tipoActivo`));

  if (!esArray(parametros.limites)) fallar('ERROR_BLOQUEANTE_PARAMETROS_K02_INVALIDOS', 'parametrosPermitidos.limites debe ser array');
  const vistos = new Set();
  parametros.limites.forEach((lim, idx) => {
    validarCerrado(lim, ['campo', 'minimo', 'maximo', 'unidad', 'version', 'fuente'], `parametrosPermitidos.limites[${idx}]`);
    validarStringCanonico(lim.campo, `parametrosPermitidos.limites[${idx}].campo`, 'ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO');
    if (!RUTAS_LIMITE_AUTORIZADAS.includes(lim.campo)) fallar('ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO', `ruta de limite no reconocida: ${lim.campo}`, { campo: lim.campo });
    if (vistos.has(lim.campo)) fallar('ERROR_BLOQUEANTE_LIMITE_K02_AMBIGUO', `limite duplicado para ${lim.campo}`, { campo: lim.campo });
    vistos.add(lim.campo);
    if (lim.minimo !== null && !esNumeroFinito(lim.minimo)) fallar('ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO', 'minimo debe ser finito o null', { campo: lim.campo });
    if (lim.maximo !== null && !esNumeroFinito(lim.maximo)) fallar('ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO', 'maximo debe ser finito o null', { campo: lim.campo });
    if (lim.minimo !== null && lim.maximo !== null && lim.minimo > lim.maximo) fallar('ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO', 'minimo no puede superar maximo', { campo: lim.campo });
    validarStringCanonico(lim.unidad, `parametrosPermitidos.limites[${idx}].unidad`, 'ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO');
    validarStringCanonico(lim.version, `parametrosPermitidos.limites[${idx}].version`, 'ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO');
    validarStringCanonico(lim.fuente, `parametrosPermitidos.limites[${idx}].fuente`, 'ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO');
  });
}

function mapaCatalogoActivo(lista) {
  return new Map(lista.filter(x => x.activo).map(x => [x.id, x]));
}

function existeActivo(catalogo, id) {
  return catalogo.has(id);
}

function validarContexto(contexto) {
  validarCerrado(contexto, ['simulacionId', 'empresaId', 'ronda', 'versionMotor'], 'contexto');
  validarStringCanonico(contexto.simulacionId, 'contexto.simulacionId', 'ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE');
  validarStringCanonico(contexto.empresaId, 'contexto.empresaId', 'ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE');
  if (!Number.isInteger(contexto.ronda) || contexto.ronda < 1) fallar('ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE', 'contexto.ronda debe ser entero >= 1');
  validarStringCanonico(contexto.versionMotor, 'contexto.versionMotor', 'ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE');
}

function validarEstadoInicialK01(estado, contexto) {
  validarCerrado(estado, ['kernel', 'contexto', 'empresaEstadoInicial', 'productosEstadoInicial', 'eventos', 'advertencias'], 'estadoInicialK01');
  validarCerrado(estado.kernel, ['codigo', 'nombre', 'version'], 'estadoInicialK01.kernel');
  if (estado.kernel.codigo !== 'K01') fallar('ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE', 'estadoInicialK01.kernel.codigo debe ser K01');
  validarStringCanonico(estado.kernel.nombre, 'estadoInicialK01.kernel.nombre', 'ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE');
  validarStringCanonico(estado.kernel.version, 'estadoInicialK01.kernel.version', 'ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE');
  validarCerrado(estado.contexto, ['simulacionId', 'empresaId', 'rondaAnterior', 'rondaDestino'], 'estadoInicialK01.contexto');
  if (estado.contexto.simulacionId !== contexto.simulacionId || estado.contexto.empresaId !== contexto.empresaId || estado.contexto.rondaDestino !== contexto.ronda) {
    fallar('ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE', 'contexto K02 no coincide con estadoInicialK01', { contexto, contextoK01: estado.contexto });
  }
  if (!esEnteroFinitoNoNegativo(estado.contexto.rondaAnterior) || !Number.isInteger(estado.contexto.rondaDestino) || estado.contexto.rondaDestino < 1) {
    fallar('ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE', 'rondas de estadoInicialK01 invalidas');
  }
  if (!esObjetoPlano(estado.empresaEstadoInicial)) fallar('ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE', 'empresaEstadoInicial debe ser objeto plano');
  validarEstructuraClonable(estado.empresaEstadoInicial, 'estadoInicialK01.empresaEstadoInicial');
  if (!esArray(estado.productosEstadoInicial)) fallar('ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE', 'productosEstadoInicial debe ser array');
  const vistos = new Set();
  estado.productosEstadoInicial.forEach((p, idx) => {
    validarCerrado(p, ['productoId', 'origen', 'activo', 'inventarioInicial', 'costoUnitarioInventario', 'historialContable', 'estrategiaDestino'], `estadoInicialK01.productosEstadoInicial[${idx}]`);
    validarStringCanonico(p.productoId, `estadoInicialK01.productosEstadoInicial[${idx}].productoId`, 'ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE');
    if (vistos.has(p.productoId)) fallar('ERROR_BLOQUEANTE_DECISION_DUPLICADA', `productoId duplicado en K01: ${p.productoId}`, { productoId: p.productoId });
    vistos.add(p.productoId);
    validarEnum(p.origen, ORIGENES, `estadoInicialK01.productosEstadoInicial[${idx}].origen`);
    if (!esBooleano(p.activo)) fallar('ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE', 'activo K01 debe ser boolean');
    validarNumeroNoNeg(p.inventarioInicial, `estadoInicialK01.productosEstadoInicial[${idx}].inventarioInicial`, 'ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE');
    validarNumeroNoNeg(p.costoUnitarioInventario, `estadoInicialK01.productosEstadoInicial[${idx}].costoUnitarioInventario`, 'ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE');
    if (!esObjetoPlano(p.historialContable)) fallar('ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE', 'historialContable debe ser objeto plano');
    if (p.estrategiaDestino !== null && !esObjetoPlano(p.estrategiaDestino)) fallar('ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE', 'estrategiaDestino debe ser objeto plano o null');
  });
  if (!esArray(estado.eventos) || !esArray(estado.advertencias)) fallar('ERROR_BLOQUEANTE_CONTEXTO_K02_INCONSISTENTE', 'eventos y advertencias K01 deben ser arrays');
  validarEstructuraClonable(estado.eventos, 'estadoInicialK01.eventos');
  validarEstructuraClonable(estado.advertencias, 'estadoInicialK01.advertencias');
}

function validarCatalogoReferencia(catalogosActivos, nombre, id, ruta) {
  validarStringCanonico(id, ruta);
  if (!existeActivo(catalogosActivos[nombre], id)) {
    fallar('ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', `${ruta} no referencia un ${nombre} activo`, { ruta, id, catalogo: nombre });
  }
}

function validarEmpresa(empresa, estadoInicial, parametros) {
  validarCerrado(empresa, ['rrhh', 'financiamiento', 'investigacion', 'inversionActivos'], 'decisionesRonda.empresa');
  validarCerrado(empresa.rrhh, ['contratarOperarios', 'despedirOperarios', 'montoCapacitacion', 'contratarVendedores', 'despedirVendedores'], 'decisionesRonda.empresa.rrhh');
  ['contratarOperarios', 'despedirOperarios', 'contratarVendedores', 'despedirVendedores'].forEach(c => validarEnteroNoNeg(empresa.rrhh[c], `decisionesRonda.empresa.rrhh.${c}`, 'ERROR_BLOQUEANTE_RRHH_K02_INVALIDO'));
  validarNumeroNoNeg(empresa.rrhh.montoCapacitacion, 'decisionesRonda.empresa.rrhh.montoCapacitacion', 'ERROR_BLOQUEANTE_RRHH_K02_INVALIDO');

  validarCerrado(empresa.financiamiento, ['tipoPrestamo', 'montoPrestamo', 'plazoPrestamo', 'amortizacion'], 'decisionesRonda.empresa.financiamiento');
  const f = empresa.financiamiento;
  validarEnum(f.tipoPrestamo, TIPOS_PRESTAMO, 'decisionesRonda.empresa.financiamiento.tipoPrestamo');
  if (!esNumeroFinito(f.montoPrestamo)) fallar('ERROR_BLOQUEANTE_FINANCIAMIENTO_K02_INVALIDO', 'montoPrestamo debe ser numero finito');
  if (!Number.isInteger(f.plazoPrestamo) || !Number.isFinite(f.plazoPrestamo)) fallar('ERROR_BLOQUEANTE_FINANCIAMIENTO_K02_INVALIDO', 'plazoPrestamo debe ser entero finito');
  validarNumeroNoNeg(f.amortizacion, 'decisionesRonda.empresa.financiamiento.amortizacion', 'ERROR_BLOQUEANTE_AMORTIZACION_INVALIDA');
  if (f.tipoPrestamo === 'NINGUNO' && (f.montoPrestamo !== 0 || f.plazoPrestamo !== 0)) {
    fallar('ERROR_BLOQUEANTE_PRESTAMO_NINGUNO_INCONSISTENTE', 'NINGUNO exige montoPrestamo=0 y plazoPrestamo=0');
  }
  if ((f.tipoPrestamo === 'OPERATIVO' || f.tipoPrestamo === 'INVERSION') && (!(f.montoPrestamo > 0) || !(f.plazoPrestamo > 0))) {
    fallar('ERROR_BLOQUEANTE_PRESTAMO_INCOMPLETO', `${f.tipoPrestamo} exige montoPrestamo > 0 y plazoPrestamo > 0`);
  }
  const deuda = estadoInicial.empresaEstadoInicial.deudaFinanciera;
  const sobregiro = estadoInicial.empresaEstadoInicial.saldoSobregiro;
  if (!esNumeroFinitoNoNegativo(deuda) || !esNumeroFinitoNoNegativo(sobregiro)) {
    fallar('ERROR_BLOQUEANTE_AMORTIZACION_INVALIDA', 'estado inicial debe exponer deudaFinanciera y saldoSobregiro finitos >= 0');
  }
  if (f.amortizacion > deuda + sobregiro) {
    fallar('ERROR_BLOQUEANTE_AMORTIZACION_SUPERA_SALDOS_INICIALES', 'amortizacion supera deudaFinanciera + saldoSobregiro inicial', { amortizacion: f.amortizacion, deuda, sobregiro });
  }

  validarCerrado(empresa.investigacion, ['tipoInvestigacion'], 'decisionesRonda.empresa.investigacion');
  validarEnum(empresa.investigacion.tipoInvestigacion, TIPOS_INVESTIGACION, 'decisionesRonda.empresa.investigacion.tipoInvestigacion');

  validarCerrado(empresa.inversionActivos, Object.keys(CAMPOS_ACTIVOS), 'decisionesRonda.empresa.inversionActivos');
  const opciones = new Map(parametros.catalogos.opcionesActivos.map(op => [op.id, op]));
  Object.entries(CAMPOS_ACTIVOS).forEach(([campo, tipoEsperado]) => {
    const valor = empresa.inversionActivos[campo];
    const ruta = `decisionesRonda.empresa.inversionActivos.${campo}`;
    if (valor === null) return;
    if (esObjetoPlano(valor) && CAMPOS_LEGACY_ACTIVO.some(c => c in valor)) {
      fallar('ERROR_BLOQUEANTE_CONTRATO_ACTIVO_LEGACY', `${ruta} contiene contrato legacy`, { ruta });
    }
    if (typeof valor !== 'string' || valor.length === 0 || valor !== valor.trim()) {
      fallar('ERROR_BLOQUEANTE_OPCION_ACTIVO_INVALIDA', `${ruta} debe ser null o string canonico no vacio`, { ruta, valor });
    }
    const opcion = opciones.get(valor);
    if (!opcion) fallar('ERROR_BLOQUEANTE_OPCION_ACTIVO_INVALIDA', `${ruta} referencia opcion inexistente`, { ruta, valor });
    if (opcion.tipoActivo !== tipoEsperado) fallar('ERROR_BLOQUEANTE_OPCION_ACTIVO_INVALIDA', `${ruta} referencia tipoActivo incompatible`, { ruta, valor, tipoEsperado, tipoRecibido: opcion.tipoActivo });
    if (opcion.activo !== true) fallar('ERROR_BLOQUEANTE_REFERENCIA_ACTIVO_INACTIVA', `${ruta} referencia opcion inactiva`, { ruta, valor });
  });
}

function validarEstrategia(estrategia, ruta, catalogosActivos) {
  validarCerrado(estrategia, ['producto', 'segmentoObjetivo', 'canalPrincipal', 'canalSecundario', 'calidad', 'precioVenta', 'publicidad', 'promocion', 'eventos', 'marketingRedes', 'relacionesPublicas', 'innovacion', 'tipoInnovacion', 'montoInnovacion'], ruta);
  validarCatalogoReferencia(catalogosActivos, 'productos', estrategia.producto, `${ruta}.producto`);
  validarCatalogoReferencia(catalogosActivos, 'segmentos', estrategia.segmentoObjetivo, `${ruta}.segmentoObjetivo`);
  if (estrategia.canalPrincipal === 'NINGUNO') {
    fallar('ERROR_BLOQUEANTE_VALOR_NO_CANONICO_K02', `${ruta}.canalPrincipal no puede ser NINGUNO`);
  }
  validarCatalogoReferencia(catalogosActivos, 'canales', estrategia.canalPrincipal, `${ruta}.canalPrincipal`);
  if (estrategia.canalSecundario !== 'NINGUNO') validarCatalogoReferencia(catalogosActivos, 'canales', estrategia.canalSecundario, `${ruta}.canalSecundario`);
  if (!esNumeroFinito(estrategia.calidad) || estrategia.calidad < 1 || estrategia.calidad > 10) fallar('ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', `${ruta}.calidad debe estar entre 1 y 10`);
  if (!esNumeroFinito(estrategia.precioVenta) || estrategia.precioVenta <= 0) fallar('ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', `${ruta}.precioVenta debe ser > 0`);
  ['publicidad', 'promocion', 'eventos', 'marketingRedes', 'relacionesPublicas', 'montoInnovacion'].forEach(c => validarNumeroNoNeg(estrategia[c], `${ruta}.${c}`, c === 'montoInnovacion' ? 'ERROR_BLOQUEANTE_MONTO_INNOVACION_INVALIDO' : 'ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA'));
  if (!esBooleano(estrategia.innovacion)) fallar('ERROR_BLOQUEANTE_INNOVACION_INCONSISTENTE', `${ruta}.innovacion debe ser boolean`);
  if (estrategia.innovacion === false) {
    if (estrategia.tipoInnovacion !== null || estrategia.montoInnovacion !== 0) fallar('ERROR_BLOQUEANTE_INNOVACION_INCONSISTENTE', 'innovacion=false exige tipoInnovacion=null y montoInnovacion=0');
  } else {
    if (estrategia.tipoInnovacion === null) fallar('ERROR_BLOQUEANTE_TIPO_INNOVACION_INVALIDO', 'innovacion=true exige tipoInnovacion');
    validarEnum(estrategia.tipoInnovacion, TIPOS_INNOVACION, `${ruta}.tipoInnovacion`);
    if (!(estrategia.montoInnovacion > 0)) fallar('ERROR_BLOQUEANTE_MONTO_INNOVACION_INVALIDO', 'innovacion=true exige montoInnovacion > 0');
  }
}

function validarAbastecimiento(ab, ruta, catalogosActivos) {
  validarCerrado(ab, ['cantidadMPPedida', 'proveedorId', 'modalidadPago', 'plazoCreditoRondas', 'costoFinancieroCredito'], ruta);
  validarEnteroNoNeg(ab.cantidadMPPedida, `${ruta}.cantidadMPPedida`, 'ERROR_BLOQUEANTE_ABASTECIMIENTO_INCONSISTENTE');
  if (ab.cantidadMPPedida === 0) {
    if (ab.proveedorId !== null || ab.modalidadPago !== null || ![0, null].includes(ab.plazoCreditoRondas) || ![0, null].includes(ab.costoFinancieroCredito)) {
      fallar('ERROR_BLOQUEANTE_ABASTECIMIENTO_INCONSISTENTE', 'cantidadMPPedida=0 exige proveedor/modalidad null y credito 0/null');
    }
    return;
  }
  validarCatalogoReferencia(catalogosActivos, 'proveedores', ab.proveedorId, `${ruta}.proveedorId`);
  if (ab.modalidadPago === null) fallar('ERROR_BLOQUEANTE_MODALIDAD_PAGO_INVALIDA', 'modalidadPago obligatoria con cantidad > 0');
  validarEnum(ab.modalidadPago, MODALIDADES_PAGO, `${ruta}.modalidadPago`);
  if (ab.modalidadPago === 'CREDITO') {
    if (!Number.isInteger(ab.plazoCreditoRondas) || ab.plazoCreditoRondas <= 0) fallar('ERROR_BLOQUEANTE_CREDITO_PROVEEDOR_INCOMPLETO', 'CREDITO exige plazoCreditoRondas entero > 0');
    validarNumeroNoNeg(ab.costoFinancieroCredito, `${ruta}.costoFinancieroCredito`, 'ERROR_BLOQUEANTE_CREDITO_PROVEEDOR_INCOMPLETO');
  } else if (![0, null].includes(ab.plazoCreditoRondas) || ![0, null].includes(ab.costoFinancieroCredito)) {
    fallar('ERROR_BLOQUEANTE_ABASTECIMIENTO_INCONSISTENTE', 'modalidad no credito exige plazo/costo 0 o null');
  }
}

function validarProduccion(produccion, ruta) {
  validarCerrado(produccion, ['produccionSolicitada'], ruta);
  if (!Number.isInteger(produccion.produccionSolicitada) || !Number.isFinite(produccion.produccionSolicitada) || produccion.produccionSolicitada <= 0) {
    fallar('ERROR_BLOQUEANTE_PRODUCCION_SOLICITADA_INVALIDA', `${ruta}.produccionSolicitada debe ser entero finito > 0`);
  }
}

function validarProductos(productosK01, decisiones, parametros) {
  if (!esArray(decisiones)) fallar('ERROR_BLOQUEANTE_PRODUCTO_SIN_DECISION', 'decisionesRonda.productos debe ser array');
  const catalogosActivos = {
    productos: mapaCatalogoActivo(parametros.catalogos.productos),
    segmentos: mapaCatalogoActivo(parametros.catalogos.segmentos),
    canales: mapaCatalogoActivo(parametros.catalogos.canales),
    proveedores: mapaCatalogoActivo(parametros.catalogos.proveedores),
  };
  const k01PorId = new Map(productosK01.map(p => [p.productoId, p]));
  const decisionesPorId = new Map();
  decisiones.forEach((d, idx) => {
    validarCerrado(d, ['productoId', 'accion', 'activo', 'estrategia', 'abastecimiento', 'produccion'], `decisionesRonda.productos[${idx}]`);
    validarStringCanonico(d.productoId, `decisionesRonda.productos[${idx}].productoId`, 'ERROR_BLOQUEANTE_DECISION_PRODUCTO_INEXISTENTE');
    if (decisionesPorId.has(d.productoId)) fallar('ERROR_BLOQUEANTE_DECISION_DUPLICADA', `decision duplicada para ${d.productoId}`, { productoId: d.productoId });
    decisionesPorId.set(d.productoId, d);
    const origen = k01PorId.get(d.productoId);
    if (!origen) fallar('ERROR_BLOQUEANTE_DECISION_PRODUCTO_INEXISTENTE', `decision para producto ausente en K01: ${d.productoId}`, { productoId: d.productoId });
    validarEnum(d.accion, ACCIONES, `decisionesRonda.productos[${idx}].accion`);
    if (ORIGEN_A_ACCION[origen.origen] !== d.accion) fallar('ERROR_BLOQUEANTE_ACCION_ORIGEN_INCONSISTENTE', 'accion no corresponde al origen K01', { productoId: d.productoId, origen: origen.origen, accion: d.accion });
    if (!esBooleano(d.activo)) fallar('ERROR_BLOQUEANTE_ACCION_ORIGEN_INCONSISTENTE', 'activo debe ser boolean', { productoId: d.productoId });
    const activoEsperado = d.accion !== 'DESCONTINUAR';
    if (d.activo !== activoEsperado) fallar('ERROR_BLOQUEANTE_ACCION_ORIGEN_INCONSISTENTE', 'activo incompatible con accion', { productoId: d.productoId, accion: d.accion, activo: d.activo });
    if (d.accion === 'DESCONTINUAR') {
      if (d.estrategia !== null || d.abastecimiento !== null || d.produccion !== null) {
        fallar('ERROR_BLOQUEANTE_PRODUCTO_DESCONTINUADO_CON_DECISIONES', 'DESCONTINUAR exige estrategia/abastecimiento/produccion null', { productoId: d.productoId });
      }
      return;
    }
    if (!esObjetoPlano(d.estrategia)) fallar('ERROR_BLOQUEANTE_REFERENCIA_CATALOGO_INVALIDA', 'producto activo exige estrategia');
    if (!esObjetoPlano(d.abastecimiento)) fallar('ERROR_BLOQUEANTE_ABASTECIMIENTO_INCONSISTENTE', 'producto activo exige abastecimiento');
    if (!esObjetoPlano(d.produccion)) fallar('ERROR_BLOQUEANTE_PRODUCCION_SOLICITADA_INVALIDA', 'producto activo exige produccion');
    validarEstrategia(d.estrategia, `decisionesRonda.productos[${idx}].estrategia`, catalogosActivos);
    validarAbastecimiento(d.abastecimiento, `decisionesRonda.productos[${idx}].abastecimiento`, catalogosActivos);
    validarProduccion(d.produccion, `decisionesRonda.productos[${idx}].produccion`);
  });
  for (const p of productosK01) {
    if (!decisionesPorId.has(p.productoId)) fallar('ERROR_BLOQUEANTE_PRODUCTO_SIN_DECISION', `producto K01 sin decision: ${p.productoId}`, { productoId: p.productoId });
  }
}

function valorPorRuta(entrada, ruta, producto) {
  if (ruta.startsWith('decisionesRonda.productos[].')) {
    const sub = ruta.slice('decisionesRonda.productos[].'.length).split('.');
    return sub.reduce((acc, k) => (acc == null ? undefined : acc[k]), producto);
  }
  return ruta.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), entrada);
}

function validarLimitesAplicados(entrada) {
  for (const lim of entrada.parametrosPermitidos.limites) {
    const valores = lim.campo.startsWith('decisionesRonda.productos[].')
      ? entrada.decisionesRonda.productos.filter(p => p.accion !== 'DESCONTINUAR').map(p => valorPorRuta(entrada, lim.campo, p))
      : [valorPorRuta(entrada, lim.campo)];
    valores.forEach(valor => {
      if (valor === null || valor === undefined) return;
      if (!esNumeroFinito(valor)) fallar('ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO', `valor no numerico para limite ${lim.campo}`, { campo: lim.campo, valor });
      if (lim.minimo !== null && valor < lim.minimo) fallar('ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO', `valor bajo minimo en ${lim.campo}`, { campo: lim.campo, valor, minimo: lim.minimo });
      if (lim.maximo !== null && valor > lim.maximo) fallar('ERROR_BLOQUEANTE_LIMITE_K02_INVALIDO', `valor sobre maximo en ${lim.campo}`, { campo: lim.campo, valor, maximo: lim.maximo });
    });
  }
}

function validarInput(entrada) {
  validarEstructuraClonable(entrada, 'entrada');
  validarCerrado(entrada, ['contexto', 'estadoInicialK01', 'decisionesRonda', 'parametrosPermitidos'], 'entrada');
  validarContexto(entrada.contexto);
  validarEstadoInicialK01(entrada.estadoInicialK01, entrada.contexto);
  validarParametros(entrada.parametrosPermitidos);
  validarCerrado(entrada.decisionesRonda, ['empresa', 'productos'], 'decisionesRonda');
  validarEmpresa(entrada.decisionesRonda.empresa, entrada.estadoInicialK01, entrada.parametrosPermitidos);
  validarProductos(entrada.estadoInicialK01.productosEstadoInicial, entrada.decisionesRonda.productos, entrada.parametrosPermitidos);
  validarLimitesAplicados(entrada);
}

module.exports = {
  validarInput,
  compararOrdinal,
  crearEventIdK02,
  ACCIONES,
  ORIGEN_A_ACCION,
  TIPOS_PRESTAMO,
  TIPOS_INVESTIGACION,
  TIPOS_INNOVACION,
  MODALIDADES_PAGO,
  TIPOS_ACTIVO,
  CAMPOS_ACTIVOS,
  RUTAS_LIMITE_AUTORIZADAS,
};
