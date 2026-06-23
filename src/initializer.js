/**
 * SimNego v3.2 — Inicializador de estado por equipo
 * Determina cajaInicial, AF, deuda y personal
 * según modoInicio de la simulación.
 *
 * Principio: Single Source of Truth para apertura financiera.
 * Compatible con modo homogéneo (backwards) y Fase 0.
 */

'use strict';

/**
 * Construye el estado inicial de apertura para un equipo.
 * @param {Object} params - sim.parametros (valores globales)
 * @param {Object|null} fase0 - registro sim_fase0 del equipo (o null)
 * @param {string} modoInicio - 'fase0' | 'homogeneo'
 * @returns {Object} estadoInicial con campos financieros
 */
function getEstadoInicial(params, fase0, modoInicio) {
  const p = params || {};
  const usarFase0 = modoInicio === 'fase0'
    && fase0
    && (fase0.estado === 'enviado' || fase0.estado === 'cerrado')
    && fase0.caja_inicial != null;

  if (usarFase0) {
    return {
      cajaInicial:            Math.max(0, Number(fase0.caja_inicial)),
      activosFijosIniciales:  Number(fase0.activos_fijos_comprados ?? 0),
      deudaInicial:           Number(fase0.deuda_inicial ?? 0),
      capitalInicial:         Number(fase0.capital_total_otorgado ?? 0),
      operariosIniciales:     Number(fase0.operarios_iniciales ?? 1),
      capacidadMaxProduccion: Number(fase0.capacidad_produccion_base ?? 0),
      costoOperario:          Number(fase0.costo_operario ?? p.costoOperario ?? 0),
      sueldoVendedor:         Number(fase0.sueldo_vendedor ?? p.sueldoTrimestralVendedor ?? 0),
      vendedoresIniciales:    Number(p.vendedoresIniciales ?? 0),
      inventarioInicial:      Number(p.inventarioInicialUnid ?? 0),
      stockMPInicial:         0,
      resultadoAcumuladoAnterior: 0,
      baseDepreciable:        Number(fase0.activos_fijos_comprados ?? 0),
      vehiculo_nivel:         Number(fase0.vehiculo_nivel ?? 0),
      muebles_comprado:       !!fase0.muebles_comprado,
      equipos_computo_comprado: !!fase0.equipos_computo_comprado,
      patentes_comprado:      !!fase0.patentes_comprado,
      _origen: 'fase0'
    };
  }

  // Modo homogéneo o sin Fase 0 — comportamiento original
  const af = p.activosFijosIniciales ?? 80000;
  return {
    cajaInicial:            p.cajaInicial ?? 500000,
    activosFijosIniciales:  af,
    deudaInicial:           p.deudaInicial ?? 0,
    capitalInicial:         p.capitalInicial ?? (af + (p.cajaInicial ?? 500000)),
    operariosIniciales:     p.operariosIniciales ?? 1,
    capacidadMaxProduccion: p.capacidadMaxProduccion ?? 1500,
    costoOperario:          p.costoOperario ?? 0,
    sueldoVendedor:         p.sueldoTrimestralVendedor ?? 0,
    vendedoresIniciales:    p.vendedoresIniciales ?? 0,
    inventarioInicial:      p.inventarioInicialUnid ?? 0,
    stockMPInicial:         0,
    resultadoAcumuladoAnterior: 0,
    baseDepreciable:        af,
    _origen: 'homogeneo'
  };
}

// Hidrata un borrador de R1 desde el cierre de Fase 0. La decisión enviada o
// forzada es inmutable; R2+ se nutre exclusivamente del resultado de R(n-1).
function hidratarEstadoInicialR1(decision, params, fase0, modoInicio, rondaNumero) {
  if (!decision || Number(rondaNumero) !== 1 || decision.submitted === true || decision.forcedByAdmin === true) {
    return decision;
  }
  const estado = getEstadoInicial(params, fase0, modoInicio);
  if (estado._origen !== 'fase0') return decision;

  const comunes = {
    cajaInicial: estado.cajaInicial,
    activosFijosIniciales: estado.activosFijosIniciales,
    baseDepreciable: estado.baseDepreciable,
    deudaInicial: estado.deudaInicial,
    capitalInicial: estado.capitalInicial,
    resultadoAcumuladoAnterior: estado.resultadoAcumuladoAnterior,
    inventarioInicial: estado.inventarioInicial,
    stockMPInicial: estado.stockMPInicial,
    operariosIniciales: estado.operariosIniciales,
    capacidadMaxProduccion: estado.capacidadMaxProduccion,
    costoOperario: estado.costoOperario,
    sueldoVendedor: estado.sueldoVendedor,
    vendedoresIniciales: estado.vendedoresIniciales,
    vehiculo_nivel: estado.vehiculo_nivel,
    muebles_comprado: estado.muebles_comprado,
    equipos_computo_comprado: estado.equipos_computo_comprado,
    patentes_comprado: estado.patentes_comprado
  };
  const productos = Array.isArray(decision.productos)
    ? decision.productos.map((producto, indice) => ({
      ...producto,
      operariosIniciales: estado.operariosIniciales,
      capacidadMaxProduccion: estado.capacidadMaxProduccion,
      costoOperario: estado.costoOperario,
      sueldoVendedor: estado.sueldoVendedor,
      vendedoresIniciales: estado.vendedoresIniciales,
      ...(indice === 0 ? comunes : {})
    }))
    : decision.productos;

  return {
    ...decision,
    ...comunes,
    productos,
    finanzas: { ...decision.finanzas, deudaInicial: estado.deudaInicial, capitalInicial: estado.capitalInicial },
    rrhh: { ...decision.rrhh, operariosIniciales: estado.operariosIniciales, vendedoresIniciales: estado.vendedoresIniciales,
      costoOperario: estado.costoOperario, sueldoVendedor: estado.sueldoVendedor }
  };
}

// FIX 2: lectura centralizada del modo de inicio (default único, sin divergencias).
const MODO_INICIO_DEFAULT = 'homogeneo';
function leerModoInicio(sim) {
  const modo = sim?.metadata?.modoInicio;
  if (modo === 'fase0') return 'fase0';
  if (modo === 'homogeneo') return 'homogeneo';
  if (modo === undefined || modo === null || modo === '') return MODO_INICIO_DEFAULT;
  throw new Error(`modoInicio inválido: ${modo}`);
}

module.exports = { getEstadoInicial, hidratarEstadoInicialR1, leerModoInicio, MODO_INICIO_DEFAULT };
