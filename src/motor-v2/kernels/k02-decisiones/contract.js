// K02 - Preparacion y validacion canonica de decisiones.
//
// ENTRADA
// {
//   contexto: { simulacionId, empresaId, ronda, versionMotor },
//   estadoInicialK01: salida valida de K01,
//   decisionesRonda: {
//     empresa: { rrhh, financiamiento, investigacion, inversionActivos },
//     productos: [{ productoId, accion, activo, estrategia, abastecimiento, produccion }]
//   },
//   parametrosPermitidos: { version, catalogos, limites }
// }
//
// SALIDA
// {
//   kernel: { codigo: 'K02', nombre, version },
//   contexto: { simulacionId, empresaId, ronda },
//   estadoInicial: copia profunda literal de estadoInicialK01,
//   decisionesCanonicas: {
//     empresa: copia profunda de decisionesRonda.empresa,
//     productos: decisionesRonda.productos ordenadas por productoId
//   },
//   eventos: un K02_PRODUCTO_VALIDADO por producto y un K02_DECISIONES_PREPARADAS,
//   advertencias: []
// }
//
// K02 no acepta legacy, no aplica defaults, no corrige valores, no calcula
// efectos economicos, fisicos, contables, financieros ni tributarios.
module.exports = {};
