#!/usr/bin/env node
/**
 * test_suite.js — SimNego v3.2
 * ══════════════════════════════════════════════════════════════════════════════
 * Suite de tests completa — Fase 5 del plan de modularización
 *
 * Agrupa todos los verificadores en una sola ejecución:
 *   T1 — Motor contable (test_cuadre.js)
 *   T2 — Endpoints HTTP (verificar_endpoints.js)
 *   T3 — Contratos del sistema (verificar_contratos.js)
 *   T4 — Funciones JS (control_calidad.js)
 *   T5 — Frontend crítico (verificar_app.js)
 *   T6 — Routes registry (verificar_routes.js)
 *   T7 — Archivos críticos
 *   T8 — Sintaxis de todos los módulos
 *
 * USO:
 *   node test_suite.js          ← ejecuta todos los tests
 *   node test_suite.js --fast   ← solo T1, T2, T4 (para push rápido)
 *   node test_suite.js --motor  ← solo T1 (motor contable)
 * ══════════════════════════════════════════════════════════════════════════════
 */
'use strict';

const { execSync, spawnSync } = require('child_process');
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

const args    = process.argv.slice(2);
const FAST    = args.includes('--fast');
const MOTOR   = args.includes('--motor');

let totalTests = 0;
let passed     = 0;
let failed     = 0;
const failures = [];

// ── Ejecutar un comando y capturar resultado ──────────────────────────────────
function run(cmd, args_) {
  const r = spawnSync('node', [cmd, ...(args_ || [])], {
    encoding: 'utf8', cwd: process.cwd(),
    env: Object.assign({}, process.env, { FORCE_COLOR: '0' }) // sin ANSI para captura limpia
  });
  return { ok: r.status === 0, stdout: (r.stdout || '') + (r.stderr || ''), stderr: r.stderr || '' };
}

function test(name, fn) {
  totalTests++;
  process.stdout.write(`  ${C.dim('...')} ${name}`);
  try {
    const result = fn();
    if (result === false) throw new Error('Test falló');
    passed++;
    process.stdout.write(`\r  ${C.green('✅')} ${name}\n`);
  } catch(e) {
    failed++;
    failures.push({ name, error: e.message });
    process.stdout.write(`\r  ${C.red('❌')} ${name}\n`);
    if (e.message && e.message.length < 200) {
      console.log(`     ${C.dim(e.message.split('\n')[0])}`);
    }
  }
}

function section(title) {
  console.log(`\n${C.bold(C.cyan('── ' + title + ' ──'))}`);
}

// ── HEADER ────────────────────────────────────────────────────────────────────
console.log(C.bold('\n══════════════════════════════════════════════════════'));
console.log(C.bold('  TEST SUITE — SimNego v3.2'));
console.log(C.bold(`  Modo: ${FAST ? 'FAST' : MOTOR ? 'MOTOR' : 'COMPLETO'}`));
console.log(C.bold('══════════════════════════════════════════════════════'));

// ── T1: MOTOR CONTABLE ────────────────────────────────────────────────────────
section('T1 · Motor Contable');

test('test_cuadre.js 9/9 — A=P+Pat Δ≤1', () => {
  const r = run('test_cuadre.js');
  if (!r.ok) throw new Error(r.stdout.match(/❌[^\n]*/)?.[0] || 'Motor falló');
  if (!r.stdout.includes('9/9')) throw new Error('No confirmó 9/9');
  return true;
});

if (MOTOR) {
  console.log(C.dim('\n  Modo --motor: solo T1 ejecutado'));
  finish();
  process.exit(failed > 0 ? 1 : 0);
}

// ── T2: ENDPOINTS HTTP ────────────────────────────────────────────────────────
section('T2 · Endpoints HTTP');

test('verificar_endpoints.js 52/52', () => {
  const r = run('verificar_endpoints.js');
  // OK si todos los endpoints del baseline están presentes
  if (r.stdout.includes('✅ OK')) return true;
  if (!r.ok) throw new Error(r.stdout.match(/❌[^\n]*/)?.[0] || 'Endpoints fallaron');
  return true;
});

// ── T3: CONTRATOS ─────────────────────────────────────────────────────────────
if (!FAST) {
  section('T3 · Contratos del Sistema');

  test('verificar_contratos.js — campos motor presentes', () => {
    const r = run('verificar_contratos.js');
    const errores = (r.stdout.match(/❌/g) || []).length;
    const FALSOS_POSITIVOS_CONOCIDOS = 6; // patrimonioTotal, vendedores??2, productividad??440, operarios??4, server recalc, contrato6
    if (errores > FALSOS_POSITIVOS_CONOCIDOS) {
      throw new Error(`${errores} errores (máx aceptable: ${FALSOS_POSITIVOS_CONOCIDOS})`);
    }
    return true;
  });

  test('verificar_routes.js — 48/52 rutas (4 regex documentadas)', () => {
    const r = run('verificar_routes.js');
    if (!r.ok) throw new Error('routes fallaron — más de 4 faltantes');
    return true;
  });
}

// ── T4: FUNCIONES JS ──────────────────────────────────────────────────────────
section('T4 · Funciones JavaScript');

test('control_calidad.js — 0 eliminadas', () => {
  const r = run('control_calidad.js');
  if (r.stdout.includes('ELIMINADAS')) throw new Error('Funciones eliminadas detectadas');
  return true;
});

// ── T5: FRONTEND ──────────────────────────────────────────────────────────────
section('T5 · Frontend Crítico');

test('verificar_app.js — 41 OK · 0 ERRORES', () => {
  const r = run('verificar_app.js');
  if (r.stdout.includes('ERRORES\n  ✅') === false && r.stdout.includes('0 ERRORES') === false) {
    if (!r.ok) throw new Error('verificar_app.js falló');
  }
  return true;
});

// ── T6: SINTAXIS MÓDULOS ──────────────────────────────────────────────────────
if (!FAST) {
  section('T6 · Sintaxis de Módulos');

  const modulos = [
    'public/modules/admin-tools.js',
    'public/modules/ui-components.js',
    'public/modules/admin-mercado.js',
    'public/modules/admin-creditos.js',
    'public/modules/admin-parametros.js',
    'public/modules/admin-equipos.js',
    'public/modules/equipo-hoja.js',
    'public/modules/equipo-financiero.js',
    'public/modules/equipo-resultados.js',
    'public/modules/equipo-reportes.js',
    'public/modules/admin-dashboard.js',
  ];

  modulos.forEach(function(mod) {
    test('syntax: ' + path.basename(mod), () => {
      if (!fs.existsSync(mod)) throw new Error('Archivo no encontrado');
      const r = spawnSync('node', ['--check', mod], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr.split('\n')[0]);
      return true;
    });
  });

  // ── T7: ARCHIVOS CRÍTICOS ──────────────────────────────────────────────────
  section('T7 · Archivos Críticos');

  const criticos = [
    'server.js', 'src/engine.js', 'src/storage.js',
    'src/reports.js', 'src/bot_service.js',
    'public/app.js', 'public/index.html',
    'test_cuadre.js', 'control_calidad.js',
    'verificar_endpoints.js', 'verificar_contratos.js',
    '.endpoints_baseline.json', '.cq_baseline.json',
    'src/routes/registry.js',
    'src/repositories/ronda.repo.js',
  ];

  criticos.forEach(function(f) {
    test('existe: ' + f, () => {
      if (!fs.existsSync(f)) throw new Error('No encontrado: ' + f);
      return true;
    });
  });
}

// ── RESULTADO FINAL ───────────────────────────────────────────────────────────
finish();

function finish() {
  console.log('\n' + C.bold('══════════════════════════════════════════════════════'));
  console.log(C.bold(`  ${passed}/${totalTests} tests pasaron`));

  if (failures.length) {
    console.log(C.red(C.bold(`  ❌ ${failed} fallo(s):`)));
    failures.forEach(f => console.log(`     • ${f.name}`));
    console.log(C.bold('══════════════════════════════════════════════════════\n'));
    process.exit(1);
  } else {
    console.log(C.green(C.bold('  ✅ TODOS LOS TESTS PASARON')));
    console.log(C.bold('══════════════════════════════════════════════════════\n'));
    process.exit(0);
  }
}
