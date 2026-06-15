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
      activosFijosIniciales:  Number(fase0.activos_fijos_comprados || 0),
      deudaInicial:           Number(fase0.deuda_inicial || 0),
      capitalInicial:         Number(fase0.capital_total_otorgado || 0),
      operariosIniciales:     Number(fase0.operarios_iniciales || 1),
      capacidadMaxProduccion: Number(fase0.capacidad_produccion_base || 0),
      _origen: 'fase0'
    };
  }

  // Modo homogéneo o sin Fase 0 — comportamiento original
  const af = p.activosFijosIniciales || 80000;
  return {
    cajaInicial:            p.cajaInicial || 500000,
    activosFijosIniciales:  af,
    deudaInicial:           p.deudaInicial || 0,
    capitalInicial:         p.capitalInicial || (af + (p.cajaInicial || 500000)),
    operariosIniciales:     p.operariosIniciales ?? 1,
    capacidadMaxProduccion: p.capacidadMaxProduccion || 1500,
    _origen: 'homogeneo'
  };
}

module.exports = { getEstadoInicial };
