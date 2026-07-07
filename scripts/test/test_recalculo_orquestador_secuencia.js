/**
 * test_recalculo_orquestador_secuencia.js — prueba aislada, no persistente,
 * SIN base de datos ni server.js real. Construye una simulación de prueba
 * en memoria (Fase 0, 1 equipo con 3 productos, proveedor real) y ejecuta
 * recalculo_orquestador.recalcularSecuencia() en modo DRY-RUN (sin
 * conectar persistir real) para 1..6 y luego 1..20.
 *
 * NO toca D12026 ni ninguna simulación real — todo vive en memoria.
 * Ejecutar: node scripts/test/test_recalculo_orquestador_secuencia.js
 */
'use strict';

const { _test } = require('../../server');
const { recalcularSecuencia } = require('../../recalculo_orquestador');

const { estadoEmpresaInicialSeed, estadoEmpresaDesdeResultados, recalcularUnaRonda } = _test;

// ── Simulación de prueba: Fase 0, NO D12026 ─────────────────────────────────
const industria = require('../../industrias/Calzados_COM540_1_2026_V2.json');

const sim = {
  id: 'sim_test_orquestador_fase0', // simulación de PRUEBA, nunca D12026
  parametros: industria.params,
  tipos_producto: industria.tiposProducto,
  canales: industria.canales,
  segmentos: industria.segmentos,
  afinidad_matrix: industria.afinidadMatrix,
  competencia_externa: industria.competenciaExterna,
  proveedores: industria.proveedores,
  metadata: { modoInicio: 'fase0' }, // modo Fase 0 explícito
  config: { totalRounds: 20 },
};

const equipos = [{ id: 'eq_test_orq', nombre: 'EMPRESA ORQUESTADOR TEST', isBot: false }];

// Fase 0: un equipo con capital/caja/AF reales otorgados (simulados en memoria,
// sin leer de storage.getFase0 — se inyecta directo vía deps.estadoFase0Map).
const fase0RegistroTest = {
  equipo_id: 'eq_test_orq',
  capital_total_otorgado: 500000,
  caja_inicial: 420000,
  deuda_inicial: 0,
  activos_fijos_comprados: 80000,
};

function decisionEquipo(rondaNumero, { p1, p2, p3 } = {}) {
  const prodBase = (productoId, producto, segmentoObjetivo, precioVenta, produccion) => ({
    productoId, activo: true, producto, segmentoObjetivo,
    canalPrincipal: 'Venta Digital', canalSecundario: 'Ninguno',
    calidad: 7, precioVenta, produccion,
    publicidad: 2000, promocion: 0, eventos: 0, marketingRedes: 0, relacionesPublicas: 0,
    contratarOperarios: 0, despedirOperarios: 0, contratarVendedores: 0, despedirVendedores: 0,
    inventarioInicial: 0, montoCapacitacion: 0, montoInnovacion: 0, innovacion: false,
    tipoInnovacion: 'Producto', tipoPrestamo: 'Ninguno', montoPrestamo: 0, amortizacion: 0,
    tipoInvestigacion: 'No', montoInvestigacion: 0,
    proveedorElegido: 'prov_1', cantidadMPpedida: produccion,
  });

  return {
    equipo: 'eq_test_orq', equipoNombre: 'EMPRESA ORQUESTADOR TEST',
    producto: 'Sneaker Cultural Premium',
    segmentoObjetivo: 'Jóvenes urbanos / lifestyle boliviano',
    canalPrincipal: 'Venta Digital', canalSecundario: 'Ninguno',
    calidad: 7, precioVenta: 700, produccion: (p1?.produccion ?? 500),
    publicidad: 2000, promocion: 0, eventos: 0, marketingRedes: 0, relacionesPublicas: 0,
    vendedoresIniciales: 2, contratarVendedores: 0, despedirVendedores: 0,
    operariosIniciales: 10, contratarOperarios: 0, despedirOperarios: 0,
    inventarioInicial: 0, montoCapacitacion: 0, montoInnovacion: 0, innovacion: false,
    tipoInnovacion: 'Producto', tipoPrestamo: 'Ninguno', montoPrestamo: 0, amortizacion: 0,
    tipoInvestigacion: 'No', montoInvestigacion: 0,
    proveedorElegido: 'prov_1', cantidadMPpedida: (p1?.produccion ?? 500),
    submitted: true,
    productos: [
      prodBase('prod_1', 'Sneaker Cultural Premium', 'Jóvenes urbanos / lifestyle boliviano', 700, p1?.produccion ?? 500),
      prodBase('prod_2', 'Calzado Médico Especializado', 'Personal de salud y bienestar', 620, p2?.produccion ?? 200),
      prodBase('prod_3', 'Calzado Ortopédico Laboral', 'Personal de salud y bienestar', 550, p3?.produccion ?? 150),
    ],
  };
}

// Genera las 20 rondas en memoria, cada una con presimulación "confirmada"
// (requisito de recalcularUnaRonda solo indirectamente vía server.js; el
// orquestador en sí no exige preSimulacion, solo decisiones).
const rondasEnMemoria = {};
for (let n = 1; n <= 20; n++) {
  rondasEnMemoria[n] = {
    numero: n,
    estado: 'abierta',
    decisiones: { eq_test_orq: decisionEquipo(n) },
    resultados: {},
    preSimulacion: { eq_test_orq: { confirmado: true } },
    shock: { tipo: 'neutral', magnitud: 0, descripcion: 'sin shock (test)' },
  };
}

// deps.obtenerRonda: lee de rondasEnMemoria, y si la ronda YA fue recalculada
// en una corrida anterior de este mismo script, refleja sus resultados
// persistidos EN MEMORIA (para que desdeRonda>1 pueda derivar estado real).
async function obtenerRonda(_sim, n) {
  return rondasEnMemoria[n] || null;
}

async function estadoFase0MapTest(_sim) {
  return { eq_test_orq: fase0RegistroTest };
}

// persistir: deliberadamente NO SE PASA a recalcularSecuencia (dry-run real).
// Se define aquí solo como referencia de lo que NO se conecta.
function persistirRealNoUsado() {
  throw new Error('persistir NO debe invocarse en este script — modo dry-run estricto');
}

const deps = {
  equipos,
  proveedores: sim.proveedores,
  obtenerRonda,
  estadoFase0Map: estadoFase0MapTest,
  estadoEmpresaInicialSeed,
  estadoEmpresaDesdeResultados,
  recalcularUnaRonda,
  // persistir: OMITIDO A PROPÓSITO — dry-run, no se conecta storage.updateRonda real.
  toleranciaDescuadre: 1,
};

function imprimirReporte(titulo, reporte) {
  console.log(`\n=== ${titulo} ===`);
  console.log(`simId: ${reporte.simId} | rango: R${reporte.desdeRonda}..R${reporte.hastaRonda} | modoDryRun: ${reporte.modoDryRun}`);
  reporte.rondas.forEach(r => {
    if (r.error) {
      console.log(`  R${r.ronda}: ERROR — ${r.error}`);
      return;
    }
    console.log(`  R${r.ronda}: ${r.ok ? 'OK' : 'DESCUADRE'} | maxDescuadre=${r.maxDescuadre} Bs | equipos=${r.equiposCalculados} | persistido=${r.persistido}`);
  });
  console.log(`--- Resultado global: ${reporte.ok ? 'OK (todas las rondas cuadran)' : 'FALLÓ (al menos una ronda no cuadra o tuvo error)'} ---`);
}

(async () => {
  // ── Corrida 1: R1..R6, dry-run ──────────────────────────────────────────
  const reporte1a6 = await recalcularSecuencia(sim, { desdeRonda: 1, hastaRonda: 6 }, deps);
  imprimirReporte('CORRIDA 1 — recalcularSecuencia(desdeRonda:1, hastaRonda:6) DRY-RUN', reporte1a6);

  if (!reporte1a6.ok) {
    console.log('\nCorrida 1..6 no cuadró completamente — se reporta igualmente la corrida 1..20 para diagnóstico completo, sin forzar el resultado.');
  }

  // ── Corrida 2: R1..R20, misma simulación de prueba, dry-run ─────────────
  const reporte1a20 = await recalcularSecuencia(sim, { desdeRonda: 1, hastaRonda: 20 }, deps);
  imprimirReporte('CORRIDA 2 — recalcularSecuencia(desdeRonda:1, hastaRonda:20) DRY-RUN', reporte1a20);

  console.log('\n=== RESUMEN FINAL (reportado, no forzado) ===');
  console.log(`Corrida 1..6:  ${reporte1a6.ok ? 'OK' : 'FALLÓ'}`);
  console.log(`Corrida 1..20: ${reporte1a20.ok ? 'OK' : 'FALLÓ'}`);
})().catch(e => {
  console.error('EXCEPCIÓN NO CONTROLADA:', e);
  process.exitCode = 1;
});
