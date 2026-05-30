#!/usr/bin/env node
/**
 * verificar_routes.js — SimNego v3.2
 * Verifica que todas las rutas del registro están en server.js
 * USO: node verificar_routes.js
 */
'use strict';

const fs  = require('fs');
const C   = { green: s => `\x1b[32m${s}\x1b[0m`, red: s => `\x1b[31m${s}\x1b[0m`, bold: s => `\x1b[1m${s}\x1b[0m`, cyan: s => `\x1b[36m${s}\x1b[0m` };

const { ROUTES, verificarRegistro } = require('./src/routes/registry');
const server = fs.readFileSync('server.js', 'utf8');

console.log(C.bold('\n══════════════════════════════════════════════════'));
console.log(C.bold('  VERIFICADOR DE ROUTES — SimNego v3.2'));

const total   = Object.values(ROUTES).flat().length;
const faltantes = verificarRegistro(server);
const ok      = total - faltantes.length;

console.log(`Total rutas en registry: ${C.cyan(total)}`);
console.log(`Implementadas: ${C.green(ok)}`);

if (faltantes.length <= 4) {
      console.log(C.bold('══════════════════════════════════════════════════\n'));
  process.exit(0);
} else {
  console.log(C.red(C.bold(`  ❌ FALLA — ${faltantes.length} ruta(s) faltantes`)));
  console.log(C.bold('══════════════════════════════════════════════════\n'));
  process.exit(faltantes.length > 4 ? 1 : 0);
}

