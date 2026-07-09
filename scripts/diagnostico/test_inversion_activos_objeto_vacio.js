/**
 * scripts/diagnostico/test_inversion_activos_objeto_vacio.js
 *
 * Script de diagnóstico aislado, mismo espíritu que los demás scripts en
 * scripts/diagnostico/. NO toca ningún archivo de producción, NO usa base de datos.
 *
 * Objetivo: reproducir el defecto confirmado con evidencia real (payload capturado del
 * navegador de TEAcompaña) en la línea ~3025 de server.js, dentro de
 * reconstruirDecisionPermitida():
 *
 *   const cliInversion = p?.inversionActivos || d.inversionActivos || {};
 *
 * Cuando productos[idx].inversionActivos existe como objeto NO vacío en el sentido de
 * JS (tiene sub-campos, aunque estén en '' — sigue siendo un objeto truthy), el operador
 * || nunca cae al fallback d.inversionActivos (la raíz, donde
 * sincronizarInversionActivosDesdeDOM realmente escribe los datos reales, según el
 * Diseño 2 ya aplicado hoy para materia prima). Esto descarta silenciosamente los datos
 * reales del estudiante.
 *
 * Este script reproduce ambas versiones de la línea (ANTES y DESPUÉS del fix propuesto)
 * como funciones puras aisladas, con el MISMO payload de entrada en ambos casos, para
 * comparar resultado antes/después sin depender de si server.js ya fue modificado o no.
 */

function log(msg) { console.log(msg); }
function sep(titulo) {
  console.log('\n' + '='.repeat(78));
  console.log(titulo);
  console.log('='.repeat(78));
}

// ─────────────────────────────────────────────────────────────────────────
// Payload de entrada — reconstruido a partir de la evidencia real confirmada:
// d.inversionActivos (raíz de la decisión, escrito por
// sincronizarInversionActivosDesdeDOM) tiene los datos reales del estudiante.
// p.inversionActivos (dentro de productos[0]) existe como objeto con sub-campos
// vacíos — nunca fue eliminado ni es undefined, solo normalizado con strings vacíos
// (patrón de normalizarInversionActivosDecision en equipo-hoja.js, ya auditado hoy).
// ─────────────────────────────────────────────────────────────────────────
const d = {
  equipo: 'eq_teacompana',
  submitted: true,
  inversionActivos: {
    nuevaPlanta: { tipoPlanta: '2', monto: 50000, incrementoCapacidad: 600 },
    ampliacionPlanta: { paquete: 'menor', incrementoCapacidad: 150, monto: 12000 },
    maquinaria: { paquete: '', incrementoCapacidad: 0, monto: 0 },
    vehiculos: { paquete: '', monto: 0 },
    muebles: { paquete: '', monto: 0 },
    computo: { paquete: '', monto: 0 },
    patentes: { paquete: '', monto: 0 },
  },
};

const p = {
  productoId: 'prod_1',
  producto: 'Producto X',
  // p.inversionActivos existe como objeto — TRUTHY — pero con sub-campos vacíos.
  // Este es exactamente el objeto que confirmaste en el payload real capturado.
  inversionActivos: {
    nuevaPlanta: { tipoPlanta: '', monto: 0, incrementoCapacidad: 0 },
    ampliacionPlanta: { paquete: '', incrementoCapacidad: 0, monto: 0 },
    maquinaria: { paquete: '', incrementoCapacidad: 0, monto: 0 },
    vehiculos: { paquete: '', monto: 0 },
    muebles: { paquete: '', monto: 0 },
    computo: { paquete: '', monto: 0 },
    patentes: { paquete: '', monto: 0 },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// CASO 1 — línea ANTES del fix (código real hasta este turno, commit d5c8cc0)
// ─────────────────────────────────────────────────────────────────────────
sep('CASO 1 — ANTES del fix: cliInversion = p?.inversionActivos || d.inversionActivos || {}');

const cliInversion_antes = p?.inversionActivos || d.inversionActivos || {};

log('  p.inversionActivos es un objeto truthy (tiene sub-campos, aunque vacíos)');
log(`  ¿p?.inversionActivos es truthy? => ${!!(p?.inversionActivos)}`);
log(`  cliInversion_antes.nuevaPlanta.tipoPlanta => "${cliInversion_antes.nuevaPlanta.tipoPlanta}"`);
log(`  cliInversion_antes.ampliacionPlanta.paquete => "${cliInversion_antes.ampliacionPlanta.paquete}"`);

const bugReproducido =
  cliInversion_antes.nuevaPlanta.tipoPlanta === '' &&
  cliInversion_antes.ampliacionPlanta.paquete === '';

log(`\n  ¿Se reprodujo el bug (datos reales descartados, resultado vacío)? => ${bugReproducido}`);

// ─────────────────────────────────────────────────────────────────────────
// CASO 2 — línea DESPUÉS del fix propuesto: cliInversion = d.inversionActivos || {}
// ─────────────────────────────────────────────────────────────────────────
sep('CASO 2 — DESPUÉS del fix: cliInversion = d.inversionActivos || {}');

const cliInversion_despues = d.inversionActivos || {};

log(`  cliInversion_despues.nuevaPlanta.tipoPlanta => "${cliInversion_despues.nuevaPlanta.tipoPlanta}"`);
log(`  cliInversion_despues.ampliacionPlanta.paquete => "${cliInversion_despues.ampliacionPlanta.paquete}"`);

const fixFunciona =
  cliInversion_despues.nuevaPlanta.tipoPlanta === '2' &&
  cliInversion_despues.ampliacionPlanta.paquete === 'menor';

log(`\n  ¿El fix preserva los datos reales del estudiante? => ${fixFunciona}`);

// ─────────────────────────────────────────────────────────────────────────
// RESUMEN FINAL
// ─────────────────────────────────────────────────────────────────────────
sep('RESUMEN FINAL');
log(`  - CASO 1 (código actual, antes del fix): bug reproducido => ${bugReproducido}`);
log(`  - CASO 2 (con el fix propuesto):         fix funciona     => ${fixFunciona}`);

log('\nConclusión: p?.inversionActivos (dentro de productos[idx]) es un objeto truthy');
log('incluso cuando todos sus sub-campos están vacíos (\'\'), porque un objeto {} nunca es');
log('falsy en JavaScript. El operador || evalúa solo la referencia, no su contenido —');
log('por lo que nunca cae al fallback d.inversionActivos (la raíz, fuente real de estos');
log('datos desde el Diseño 2). Eliminar la lectura desde p por completo (usar siempre');
log('d.inversionActivos) es la corrección correcta y mínima, consistente con el mismo');
log('principio ya aplicado a materia prima (cantidadMPpedida/proveedorElegido).');
