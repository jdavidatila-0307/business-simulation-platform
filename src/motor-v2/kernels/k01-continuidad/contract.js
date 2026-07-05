// K01 — Continuidad — Contrato formal de entrada/salida (documentación, sin lógica).
// Ver especificación V2-1 a V2-1G para el fundamento completo de cada regla.
//
// ENTRADA
// {
//   contexto: {
//     simulacionId: string no vacío,
//     empresaId: string no vacío (identidad canónica, nunca derivada de equipoId),
//     rondaAnterior: entero >= 0,
//     rondaDestino: entero == rondaAnterior + 1,
//     versionMotor: string no vacío,
//   },
//   empresaEstadoFinalAnterior: {
//     caja, cuentasPorCobrar, stockMP, cxpProveedoresMP, anticiposProveedores,
//     capacidadProductiva, operarios, vendedores, activos, depreciacionAcumulada,
//     deudaFinanciera, saldoSobregiro, interesesPorPagar, capitalAportado,
//     reservas, resultadosAcumulados, provisionIUEEnCurso, iueDeterminadoPorPagar,
//     creditoIUECompensable, ivaSaldoFavor, ivaPorPagar: todos number finito >= 0,
//     pedidosPendientes: array (posiblemente vacío) de pedidos pendientes,
//     produccionEnProcesoFinalAnterior: OPCIONAL — si está presente, debe ser
//       number finito y exactamente 0 (Invariante 9d); nunca se propaga a la
//       salida (Corrección 4, V2-2B),
//   },
//   productosEstadoFinalAnterior: [
//     { productoId: string no vacío, activo: boolean, inventarioFinal: entero >= 0,
//       costoUnitarioInventario: number >= 0, historialContable: objeto plano }
//   ],
//   productosDecisionDestino: [
//     { productoId: string no vacío,
//       accion: 'CONTINUAR' | 'CREAR' | 'DESCONTINUAR' | 'REACTIVAR',
//       activo: boolean (CONTINUAR/CREAR/REACTIVAR exigen true; DESCONTINUAR exige false),
//       estrategia: { precio: number>=0, segmento/canalPrincipal/canalSecundario:
//                     string no vacío tras trim, produccionSolicitada: entero>=0,
//                     calidad/marketing: number>=0, innovacion: boolean } | null }
//   ],
//   Cobertura obligatoria (Corrección 1, V2-2B): todo productoId presente en
//   productosEstadoFinalAnterior debe tener EXACTAMENTE una decisión en
//   productosDecisionDestino; CREAR exige productoId inexistente; las demás
//   acciones exigen productoId preexistente.
// }
//
// SALIDA
// {
//   kernel: { codigo: 'K01', nombre: 'Continuidad', version },
//   contexto: { simulacionId, empresaId, rondaAnterior, rondaDestino },
//   empresaEstadoInicial: { ...mismos campos continuables, copiados sin reinterpretar... },
//   productosEstadoInicial: [
//     { productoId, origen: 'CONTINUO'|'NUEVO'|'REACTIVADO'|'DESCONTINUADO',
//       activo, inventarioInicial, costoUnitarioInventario, historialContable,
//       estrategiaDestino }
//   ],
//   eventos: [ { eventId: SHA-256 hex determinista (Corrección 5, V2-2B),
//                empresaId, productoId, ronda, eventType, kernel: 'K01',
//                version, metadatos } ],
//   advertencias: [],
// }
//
// K01 NO calcula, suma, maximiza ni corrige económicamente ningún saldo
// empresarial: solo copia estadoFinalAnterior -> estadoInicial (Invariante 10).
// K01 NO resuelve ambigüedades por heurística: aborta con ESTADO_EMPRESARIAL_AMBIGUO.
// K01 NO accede a PostgreSQL/Supabase/server.js/storage.js/engine.js.
// El orden de productosEstadoInicial es canónico por comparación ordinal
// (unidades de código UTF-16, NUNCA localeCompare) — Corrección 6, V2-2B.
module.exports = {};
