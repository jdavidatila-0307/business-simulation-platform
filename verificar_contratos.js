#!/usr/bin/env node
/**
 * verificar_contratos.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════════════════════
 * Verifica contratos implícitos del sistema que NO detecta control_calidad.js:
 *
 *   Contrato 1 — Campos del motor (engine.js debe retornar estos campos)
 *   Contrato 2 — Propagación entre rondas (campos que se arrastran)
 *   Contrato 3 — Hardcodes prohibidos (valores fijos que deben venir de params)
 *   Contrato 4 — Archivos críticos que deben existir
 *   Contrato 5 — Campos de hoja de decisiones (frontend debe manejarlos)
 *   Contrato 6 — Reglas IVA/patrimonio (invariantes contables en el motor)
 *
 * USO: node verificar_contratos.js
 * ══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const C = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

let errores   = 0;
let warnings  = 0;
let pasaron   = 0;

function ok(msg)   { console.log('  ' + C.green(`✅ ${msg}`)); pasaron++; }
function fail(msg) { console.log('  ' + C.red(`❌ ${msg}`)); errores++; }
function warn(msg) { console.log('  ' + C.yellow(`⚠  ${msg}`)); warnings++; }
function sec(msg)  { console.log('\n' + C.bold(C.cyan(`── ${msg} ──`))); }

// ── Leer archivos ─────────────────────────────────────────────────────────────
function leer(ruta) {
  try { return fs.readFileSync(path.resolve(ruta), 'utf8'); }
  catch { return null; }
}

const engine  = leer('src/engine.js');
const server  = leer('server.js');
const appJs   = leer('public/app.js');
const storage = leer('src/storage.js');

console.log(C.bold('\n══════════════════════════════════════════════════'));
console.log(C.bold('  VERIFICADOR DE CONTRATOS — SimNego v3.2'));
console.log(C.bold('══════════════════════════════════════════════════\n'));

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRATO 1 — Campos que el motor DEBE retornar (display depende de ellos)
// ═══════════════════════════════════════════════════════════════════════════════
sec('Contrato 1 · Campos del motor (engine.js)');

const CAMPOS_MOTOR_REQUERIDOS = [
  // Ventas
  { campo: 'ventasBrutas',      desc: 'Base del ER — ventas sin IVA' },
  { campo: 'totalFacturado',    desc: 'Ventas brutas + IVA para IT y flujo' },
  { campo: 'ventasNetas',       desc: 'Después de comisiones canal' },
  { campo: 'ventasNetasReal',   desc: 'Alias más preciso de ventasNetas' },
  { campo: 'costoVentas',       desc: 'Costo variable de ventas' },
  { campo: 'utilidadBruta',     desc: 'Ventas netas - costoVentas' },
  { campo: 'utilidadNeta',      desc: 'Resultado final después de impuestos' },
  // Caja y balance
  { campo: 'cajaFinal',         desc: 'Caja al cierre — propagada a R+1' },
  { campo: 'totalActivos',      desc: 'Invariante A=P+Pat' },
  { campo: 'patrimonioTotal',   desc: 'Derivado A-P — nunca editable' },
  // Costos fijos NIC2
  { campo: 'pagoOperarios',     desc: 'MOD en CdV (NIC2)' },
  { campo: 'gastoFijoPlanta',   desc: 'Overhead en CdV (NIC2)' },
  { campo: 'depreciacion',      desc: 'Depreciación en CdV (NIC2)' },
  // IVA
  { campo: 'ivaDebito',         desc: 'IVA cobrado al cliente' },
  { campo: 'ivaCredito',        desc: 'IVA pagado en compras — activo' },
  { campo: 'ivaAPagar',         desc: 'Neto IVA al Estado' },
  // Impuestos
  { campo: 'impuestoIT',        desc: 'IT 3% sobre ventas facturadas' },
];

if (!engine) {
  fail('src/engine.js no encontrado');
} else {
  CAMPOS_MOTOR_REQUERIDOS.forEach(({ campo, desc }) => {
    if (engine.includes(campo)) {
      ok(`engine.js retorna '${campo}' — ${desc}`);
    } else {
      fail(`engine.js NO retorna '${campo}' — ${desc}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRATO 2 — Propagación entre rondas
// ═══════════════════════════════════════════════════════════════════════════════
sec('Contrato 2 · Propagación entre rondas (engine.js)');

const CAMPOS_PROPAGACION = [
  { campo: 'cajaFinal',          prop: 'cajaInicial',          desc: 'Caja final → inicial R+1' },
  { campo: 'operariosFinales',   prop: 'operariosIniciales',   desc: 'Operarios final → inicial R+1' },
  { campo: 'vendedoresFinales',  prop: 'vendedoresIniciales',  desc: 'Vendedores final → inicial R+1' },
  { campo: 'inventarioFinal',    prop: 'inventarioInicial',    desc: 'Inventario final → inicial R+1' },
  { campo: 'brandEquityFinal',   prop: 'brandEquityInicial',   desc: 'Brand equity final → inicial R+1' },
  { campo: 'cxcFinal',           prop: 'cxcInicial',           desc: 'CxC final → inicial R+1' },
  { campo: 'deudaFinal',         prop: 'deudaInicial',         desc: 'Deuda final → inicial R+1' },
  { campo: 'stockMPFinal',       prop: 'stockMPInicial',       desc: 'Stock MP final → inicial R+1' },
];

if (!engine) {
  warn('src/engine.js no disponible para verificar propagación');
} else {
  CAMPOS_PROPAGACION.forEach(({ campo, prop, desc }) => {
    const tieneOrigen  = engine.includes(campo);
    const tieneDestino = engine.includes(prop);
    if (tieneOrigen && tieneDestino) {
      ok(`Propagación: ${campo} → ${prop} — ${desc}`);
    } else if (!tieneOrigen) {
      warn(`Campo origen '${campo}' no encontrado — ${desc}`);
    } else {
      fail(`Campo destino '${prop}' no encontrado — ${desc}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRATO 3 — Hardcodes PROHIBIDOS
// ═══════════════════════════════════════════════════════════════════════════════
sec('Contrato 3 · Hardcodes prohibidos');

const HARDCODES_PROHIBIDOS = [
  // Engine
  { archivo: 'src/engine.js',   patron: /operariosIniciales\s*\?\?\s*4\b/, desc: 'engine.js: operariosIniciales ?? 4 hardcodeado' },
  { archivo: 'src/engine.js',   patron: /vendedoresIniciales\s*\?\?\s*2\b/, desc: 'engine.js: vendedoresIniciales ?? 2 hardcodeado' },
  { archivo: 'src/engine.js',   patron: /productividadBase\s*\?\?\s*440\b/, desc: 'engine.js: productividadBase ?? 440 (debe ser 500)' },
  // Server
  { archivo: 'server.js',       patron: /operariosIniciales\s*\?\?\s*4\b/, desc: 'server.js: operariosIniciales ?? 4 en recalculator' },
  { archivo: 'server.js',       patron: /vendedoresIniciales\s*\?\?\s*2\b/, desc: 'server.js: vendedoresIniciales ?? 2 en recalculator' },
  { archivo: 'server.js',       patron: /capitalContable\s*=\s*680000\b/,  desc: 'server.js: capitalContable = 680000 hardcodeado' },
  // App.js
  { archivo: 'public/app.js',   patron: /operariosIniciales\s*\?\?\s*4\b/, desc: 'app.js: operariosIniciales ?? 4 hardcodeado' },
  { archivo: 'public/app.js',   patron: /max="8"\s*step="1".*plazo/,       desc: 'app.js: plazoPrestamo max="8" hardcodeado' },
];

HARDCODES_PROHIBIDOS.forEach(({ archivo, patron, desc }) => {
  const contenido = leer(archivo);
  if (!contenido) {
    warn(`${archivo} no disponible`);
    return;
  }
  if (patron.test(contenido)) {
    fail(`HARDCODE DETECTADO: ${desc}`);
  } else {
    ok(`Sin hardcode: ${desc.replace(/:.*/,'')}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRATO 4 — Archivos críticos que deben existir
// ═══════════════════════════════════════════════════════════════════════════════
sec('Contrato 4 · Archivos críticos');

const ARCHIVOS_CRITICOS = [
  { ruta: 'server.js',                                    desc: 'Servidor principal' },
  { ruta: 'src/engine.js',                               desc: 'Motor de cálculo' },
  { ruta: 'src/storage.js',                              desc: 'Acceso BD' },
  { ruta: 'src/reports.js',                              desc: 'Reportes de mercado' },
  { ruta: 'src/bot_service.js',                          desc: 'Bot IA dinámico' },
  { ruta: 'src/plantillas.js',                           desc: 'Cargador de industrias' },
  { ruta: 'public/app.js',                               desc: 'Frontend SPA' },
  { ruta: 'public/index.html',                           desc: 'Shell HTML' },
  { ruta: 'public/styles.css',                           desc: 'Estilos' },
  { ruta: 'public/manual.html',                          desc: 'Manual estudiante' },
  { ruta: 'industrias/Calzados_COM540_1_2026_V2.json',  desc: 'Industria V2 activa' },
  { ruta: 'test_cuadre.js',                              desc: 'Tests invariante A=P+Pat' },
  { ruta: 'qa_suite.js',                                 desc: 'Suite QA pre-clase' },
  { ruta: 'control_calidad.js',                          desc: 'Control de calidad' },
  { ruta: 'verificar_app.js',                            desc: 'Verificador frontend' },
  { ruta: 'verificar_endpoints.js',                      desc: 'Verificador endpoints' },
  { ruta: '.endpoints_baseline.json',                    desc: 'Baseline de endpoints' },
  { ruta: '.cq_baseline.json',                           desc: 'Baseline de funciones' },
];

ARCHIVOS_CRITICOS.forEach(({ ruta, desc }) => {
  if (fs.existsSync(path.resolve(ruta))) {
    const size = (fs.statSync(path.resolve(ruta)).size / 1024).toFixed(1);
    ok(`${ruta} (${size} KB) — ${desc}`);
  } else {
    fail(`FALTA: ${ruta} — ${desc}`);
  }
});

// V2 debe permanecer publicada como plantilla oficial; V1 es histórica y opcional.
function leerJSON(ruta) {
  try { return JSON.parse(fs.readFileSync(path.resolve(ruta), 'utf8')); }
  catch { return null; }
}

const plantillaV2 = leerJSON('industrias/Calzados_COM540_1_2026_V2.json');
if (!plantillaV2) {
  fail('Plantilla V2 no se puede leer');
} else if (plantillaV2.estado?.visible !== true || plantillaV2.estado?.oficial !== true || plantillaV2.estado?.deprecated === true) {
  fail('Plantilla V2 debe estar visible, oficial y no deprecated');
} else {
  ok('Plantilla V2 marcada como visible y oficial');
}

const plantillaV1 = leerJSON('industrias/Calzados_COM540_1_2026_V1.json');
if (plantillaV1) {
  if (plantillaV1.estado?.historica === true && plantillaV1.estado?.deprecated === true && plantillaV1.estado?.visible === false) {
    ok('Plantilla V1 conservada como histórica y oculta');
  } else {
    warn('Plantilla V1 existe, pero no está marcada como histórica/deprecated');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRATO 5 — Campos de hoja de decisiones (app.js debe manejarlos)
// ═══════════════════════════════════════════════════════════════════════════════
sec('Contrato 5 · Campos de hoja de decisiones (app.js)');

const CAMPOS_HOJA = [
  'calidad',
  'precioVenta',
  'produccion',
  'publicidad',
  'promocion',
  'contratarOperarios',
  'despedirOperarios',
  'proveedorElegido',
  'tipoPrestamo',
  'montoPrestamo',
  'plazoPrestamo',
  'cantidadMPpedida',
  'segmentoObjetivo',
  'canalPrincipal',
];

if (!appJs) {
  fail('public/app.js no encontrado');
} else {
  CAMPOS_HOJA.forEach(campo => {
    if (appJs.includes(`'${campo}'`) || appJs.includes(`"${campo}"`)) {
      ok(`Hoja maneja campo '${campo}'`);
    } else {
      fail(`Hoja NO maneja campo '${campo}'`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRATO 6 — Invariantes contables (reglas NIC2 y partida doble)
// ═══════════════════════════════════════════════════════════════════════════════
sec('Contrato 6 · Invariantes contables (engine.js)');

const INVARIANTES = [
  { patron: /patrimonioTotal\s*=.*totalActivos.*totalPasivos|A\s*-\s*P/,
    desc: 'Patrimonio derivado = Activos - Pasivos (nunca hardcodeado)' },
  { patron: /capitalContable\s*=\s*(?:params|sim|cfg)/,
    desc: 'capitalContable se lee desde params (no hardcodeado)' },
  { patron: /ivaCreditoAcumulado|ivaFavorAcumulado|ivaCredito.*acum/i,
    desc: 'IVA crédito se arrastra como activo corriente' },
  { patron: /depreciacion.*costoVentas|costoVentas.*depreciacion|NIC.?2/i,
    desc: 'Depreciación incluida en Costo de Ventas (NIC2)' },
  { patron: /pagoOperarios.*costoVentas|costoVentas.*pagoOperarios|MOD/,
    desc: 'MOD incluido en Costo de Ventas (NIC2)' },
  { patron: /sinDecision|sin_decision/i,
    desc: 'sinDecision implementado para equipos inactivos' },
];

if (!engine) {
  fail('src/engine.js no disponible');
} else {
  INVARIANTES.forEach(({ patron, desc }) => {
    if (patron.test(engine)) {
      ok(desc);
    } else {
      warn(`No verificado: ${desc}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTADO FINAL
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + C.bold('══════════════════════════════════════════════════'));
console.log(C.bold(`  ${pasaron} pasaron · ${errores} errores · ${warnings} warnings`));

if (errores > 0) {
  console.log(C.red(C.bold(`  ❌ FALLA — corrige los ${errores} error(es) antes del push`)));
  console.log(C.bold('══════════════════════════════════════════════════\n'));
  process.exit(1);
} else if (warnings > 0) {
  console.log(C.yellow(C.bold('  ⚠  OK con advertencias — revisa los warnings')));
  console.log(C.bold('══════════════════════════════════════════════════\n'));
  process.exit(0);
} else {
  console.log(C.green(C.bold('  ✅ TODOS LOS CONTRATOS VERIFICADOS')));
  console.log(C.bold('══════════════════════════════════════════════════\n'));
  process.exit(0);
}
