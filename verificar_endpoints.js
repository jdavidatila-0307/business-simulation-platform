#!/usr/bin/env node
/**
 * verificar_endpoints.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════════════════════
 * Verifica que server.js contiene TODOS los endpoints HTTP requeridos.
 * Úsalo ANTES de hacer git push cuando modifiques server.js.
 * 
 * USO:
 *   node verificar_endpoints.js              ← verifica server.js actual
 *   node verificar_endpoints.js generar      ← regenera el baseline de endpoints
 *   node verificar_endpoints.js comparar <archivo>  ← compara archivo vs baseline
 * 
 * PROPÓSITO:
 *   Evitar que commits de server.js eliminen endpoints existentes.
 *   El error más común: entregar server.js completo nuevo sin incluir
 *   endpoints agregados en sesiones anteriores.
 * ══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const SERVER_FILE    = path.resolve('server.js');
const BASELINE_FILE  = path.resolve('.endpoints_baseline.json');

// ── Colores ANSI ──────────────────────────────────────────────────────────────
const C = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

// ── Extraer endpoints de un archivo server.js ─────────────────────────────────
function extraerEndpoints(contenido) {
  const endpoints = new Set();

  // Rutas estáticas: url === '/ruta' && method === 'VERB'
  const regexEstatica = /url\s*===\s*'([^']+)'\s*&&\s*method\s*===\s*'(GET|POST|PUT|DELETE|PATCH)'/g;
  let m;
  while ((m = regexEstatica.exec(contenido)) !== null) {
    endpoints.add(`${m[2]} ${m[1]}`);
  }

  // Rutas dinámicas: url.match(/^\/ruta\/[^/]+$/) && method === 'VERB'
  const regexDinamica = /url\.match\(\/\^\\\/([^/]+(?:\/[^/\\]+)*)[^)]*\/\)\s*&&\s*method\s*===\s*'(GET|POST|PUT|DELETE|PATCH)'/g;
  while ((m = regexDinamica.exec(contenido)) !== null) {
    // Limpiar la ruta del regex para hacerla legible
    const ruta = '/' + m[1]
      .replace(/\\\//g, '/')
      .replace(/\[^\/\]\+/g, ':id')
      .replace(/\[^\/\]\*/g, ':id?')
      .replace(/\$/g, '')
      .replace(/\\\./g, '.');
    endpoints.add(`${m[2]} ${ruta}`);
  }

  return [...endpoints].sort();
}

// ── Comparar dos listas de endpoints ─────────────────────────────────────────
function comparar(baseline, actual) {
  const baseSet   = new Set(baseline);
  const actualSet = new Set(actual);

  const eliminados = baseline.filter(e => !actualSet.has(e));
  const nuevos     = actual.filter(e => !baseSet.has(e));
  const comunes    = baseline.filter(e => actualSet.has(e));

  return { eliminados, nuevos, comunes };
}

// ── Generar baseline ──────────────────────────────────────────────────────────
function generarBaseline() {
  if (!fs.existsSync(SERVER_FILE)) {
    console.error(C.red('❌ server.js no encontrado'));
    process.exit(1);
  }

  const contenido  = fs.readFileSync(SERVER_FILE, 'utf8');
  const endpoints  = extraerEndpoints(contenido);
  const baseline   = {
    generadoEn: new Date().toISOString(),
    total:      endpoints.length,
    endpoints,
  };

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2), 'utf8');

  console.log(C.bold('\n📸 Baseline de endpoints generado'));
  console.log(`   Archivo: ${BASELINE_FILE}`);
  console.log(`   Total:   ${C.cyan(endpoints.length)} endpoints`);
  console.log('\n' + C.dim('Endpoints registrados:'));
  endpoints.forEach(e => console.log('  ' + C.dim(e)));
  console.log();
}

// ── Verificar ────────────────────────────────────────────────────────────────
function verificar(archivoAVerificar) {
  const archivo = archivoAVerificar || SERVER_FILE;

  console.log(C.bold('\n══════════════════════════════════════════════════'));
  console.log(C.bold('  VERIFICADOR DE ENDPOINTS — SimNego v3.2'));
  console.log(C.bold('══════════════════════════════════════════════════'));
  console.log(C.dim(`  Archivo: ${path.basename(archivo)}`));
  console.log(C.dim(`  Baseline: ${BASELINE_FILE}`));
  console.log();

  // Verificar que existen los archivos necesarios
  if (!fs.existsSync(archivo)) {
    console.error(C.red(`❌ Archivo no encontrado: ${archivo}`));
    process.exit(1);
  }
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(C.yellow('⚠  No existe baseline. Ejecuta: node verificar_endpoints.js generar'));
    process.exit(1);
  }

  const baseline  = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const contenido = fs.readFileSync(archivo, 'utf8');
  const actual    = extraerEndpoints(contenido);

  console.log(`Baseline generado: ${C.dim(new Date(baseline.generadoEn).toLocaleString('es-BO'))}`);
  console.log(`Endpoints en baseline: ${C.cyan(baseline.endpoints.length)}`);
  console.log(`Endpoints en archivo:  ${C.cyan(actual.length)}`);
  console.log();

  const { eliminados, nuevos, comunes } = comparar(baseline.endpoints, actual);

  // ── Reporte ──────────────────────────────────────────────────────────────
  let errores = 0;

  if (eliminados.length > 0) {
    errores += eliminados.length;
    console.log(C.red(`🔴 ELIMINADOS (${eliminados.length}) — CRÍTICO, NO HACER PUSH:`));
    eliminados.forEach(e => console.log('   ' + C.red(`✗ ${e}`)));
    console.log();
  }

  if (nuevos.length > 0) {
    console.log(C.cyan(`🆕 NUEVOS (${nuevos.length}) — agregados desde el último baseline:`));
    nuevos.forEach(e => console.log('   ' + C.cyan(`+ ${e}`)));
    console.log();
  }

  if (comunes.length > 0 && eliminados.length === 0) {
    console.log(C.green(`✅ COMUNES (${comunes.length}) — todos los endpoints del baseline presentes`));
    console.log();
  }

  // ── Resultado final ───────────────────────────────────────────────────────
  console.log(C.bold('══════════════════════════════════════════════════'));
  if (errores > 0) {
    console.log(C.red(C.bold(`  ❌ FALLA: ${errores} endpoint(s) eliminado(s)`)));
    console.log(C.red('  NO hagas push — restaura los endpoints faltantes'));
    console.log(C.bold('══════════════════════════════════════════════════\n'));
    process.exit(1);
  } else {
    console.log(C.green(C.bold('  ✅ OK — todos los endpoints del baseline presentes')));
    if (nuevos.length > 0) {
      console.log(C.yellow(`  ⚠  Hay ${nuevos.length} endpoint(s) nuevo(s) — ejecuta 'generar' para actualizar baseline`));
    }
    console.log(C.bold('══════════════════════════════════════════════════\n'));
    process.exit(0);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const cmd = process.argv[2];
const arg = process.argv[3];

if (cmd === 'generar') {
  generarBaseline();
} else if (cmd === 'comparar' && arg) {
  verificar(path.resolve(arg));
} else {
  verificar();
}
