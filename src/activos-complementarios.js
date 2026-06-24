/** Valores contables autoritativos de activos complementarios de Fase 0. */
'use strict';

const VALORES_ACTIVOS_COMPLEMENTARIOS = Object.freeze({
  vehiculoPorNivel: Object.freeze({ 0: 0, 1: 35000, 2: 243000, 3: 313000 }),
  muebles: 16000,
  equiposComputo: 43650,
  patentes: 1400
});

function calcularActivosComplementarios(fase0 = {}) {
  const nivelVehiculo = Number(fase0.vehiculo_nivel ?? 0);
  const valorVehiculoInicial = VALORES_ACTIVOS_COMPLEMENTARIOS.vehiculoPorNivel[nivelVehiculo] ?? 0;
  const valorMueblesInicial = fase0.muebles_comprado ? VALORES_ACTIVOS_COMPLEMENTARIOS.muebles : 0;
  const valorComputoInicial = fase0.equipos_computo_comprado ? VALORES_ACTIVOS_COMPLEMENTARIOS.equiposComputo : 0;
  const valorPatentesInicial = fase0.patentes_comprado ? VALORES_ACTIVOS_COMPLEMENTARIOS.patentes : 0;
  const totalTangiblesComplementarios = valorVehiculoInicial + valorMueblesInicial + valorComputoInicial;
  const totalIntangiblesComplementarios = valorPatentesInicial;
  return {
    valorVehiculoInicial, valorMueblesInicial, valorComputoInicial, valorPatentesInicial,
    totalTangiblesComplementarios,
    totalIntangiblesComplementarios,
    inversionComplementaria: totalTangiblesComplementarios + totalIntangiblesComplementarios
  };
}

function calcularBalanceInicialFase0(fase0 = {}) {
  const activos = calcularActivosComplementarios(fase0);
  const inversionPlanta = Number(fase0.activos_fijos_comprados ?? 0);
  const activosFijosIniciales = inversionPlanta + activos.totalTangiblesComplementarios;
  const intangiblesIniciales = activos.totalIntangiblesComplementarios;
  const cajaInicialBruta = Number(fase0.caja_inicial_docente ?? 0)
    + Number(fase0.capital_inversion ?? 0)
    + Number(fase0.credito_operativo_pre_r1 ?? 0)
    + Number(fase0.credito_inversion_pre_r1 ?? 0)
    - inversionPlanta - activos.inversionComplementaria;
  const deudaInicial = Number(fase0.credito_operativo_pre_r1 ?? 0)
    + Number(fase0.credito_inversion_pre_r1 ?? 0);
  const capitalInicial = Number(fase0.capital_total_otorgado ?? 0);
  const activosIniciales = cajaInicialBruta + activosFijosIniciales + intangiblesIniciales;
  const patrimonioInicialCalculado = activosIniciales - deudaInicial;
  return {
    ...activos, inversionPlanta, cajaInicialBruta, deudaInicial, capitalInicial,
    activosFijosIniciales, intangiblesIniciales,
    baseDepreciable: activosFijosIniciales,
    baseAmortizable: intangiblesIniciales,
    activosIniciales, patrimonioInicialCalculado,
    deltaCuadreInicial: capitalInicial - patrimonioInicialCalculado
  };
}

module.exports = { VALORES_ACTIVOS_COMPLEMENTARIOS, calcularActivosComplementarios, calcularBalanceInicialFase0 };
