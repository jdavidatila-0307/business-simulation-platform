/**
 * VERIFICADOR DE REGRESIONES — SimNego
 * Ejecutar antes de cada git push:
 *   node verificar_app.js
 */
const fs = require('fs');
const { execSync } = require('child_process');

const app = fs.readFileSync('public/app.js', 'utf8');
let errores = 0;
let ok = 0;

function check(desc, condition) {
  if (condition) { console.log('  ✅ ' + desc); ok++; }
  else           { console.log('  ❌ ' + desc); errores++; }
}

console.log('\n══════════════════════════════════════════');
console.log('  VERIFICADOR SimNego — app.js');
console.log('══════════════════════════════════════════\n');

// Sintaxis
try {
  execSync('node --check public/app.js', { stdio: 'pipe' });
  check('Sintaxis JavaScript válida', true);
} catch(e) {
  check('Sintaxis JavaScript válida', false);
  console.log('    ' + e.stderr?.toString().slice(0,100));
}

console.log('\n── Funciones críticas definidas ──');
const fns = [
  'async function loadAdminDashboard',
  'async function loadAdminSimulaciones',
  'async function loadAdminEquipos',
  'async function loadAdminRondas',
  'async function loadAdminResultados',
  'async function loadAdminMercado',
  'async function loadAdminParametros',
  'async function loadAdminCreditos',
  'async function loadAdminCompetencia',
  'function buildAdminResultsHTML',
  'function buildAdminKPIHTML',
  'async function loadEquipoReportes',
  'async function loadEquipoFinanciero',
  'async function loadEquipoResultados',
  'async function loadEquipoCreditos',
  'async function loadHojaDecision',
  'function printPanel',
  'function printHoja',
  'window.mostrarReporteRonda',
  'window.seleccionarSim',
  'window.adminEFTab',
  'window.adminKPITab',
];
fns.forEach(fn => check(fn, app.includes(fn)));

console.log('\n── Funciones referenciadas pero que deben existir ──');
const refs = [
  ['doActivarRonda', 'async function doActivarRonda'],
  ['loadAdminEquipos', 'async function loadAdminEquipos'],
  ['loadAdminRondas', 'async function loadAdminRondas'],
  ['loadAdminResultados', 'async function loadAdminResultados'],
  ['renderAdminCharts', 'function renderAdminCharts'],
  ['buildAdminKPIHTML', 'function buildAdminKPIHTML'],
];
refs.forEach(([ref, def]) => {
  const usado = app.includes("'" + ref + "'") || app.includes(ref + '(') || app.includes(ref + ';');
  const definido = app.includes(def);
  if (usado && !definido) { check(ref + ' usada Y definida', false); }
  else if (definido)      { check(ref + ' definida', true); }
});

console.log('\n── URLs de API correctas ──');
check('/admin/ronda/activar (NO siguiente-ronda)',    !app.includes('/admin/siguiente-ronda'));
check('/admin/ronda/siguiente (NO abrir-ronda)',      !app.includes('/admin/abrir-ronda'));
check('No usa /api/reportes con URL vieja (Bs 4000)', !app.includes('Bs 4,000'));
check('No usa Bs 7,500 (costo viejo Premium)',        !app.includes('Bs 7,500'));

console.log('\n── Fixes críticos presentes ──');
check('FIX-14a camposEmpresa',          app.includes('camposEmpresa'));
// pagoOperarios y gastoFinanciero están en engine.js, no en app.js
const eng = fs.existsSync('src/engine.js') ? fs.readFileSync('src/engine.js','utf8') : '';
check('FIX Balance: pagoOperarios (engine.js)',  eng.includes('pagoOperarios'));
check('FIX EBIT: gastoFinanciero (engine.js)',   eng.includes('gastoFinanciero'));
check('Cache busting v3.x en index.html', fs.readFileSync('public/index.html','utf8').includes('app.js?v='));
check('printPanelActivo definida',      app.includes('function printPanelActivo'));
check('adminEFTab maneja 6 tabs',       app.includes('[1,2,3,4,5,6]'));
check('Reporte Estratégico en opciones',app.includes("'Estratégico'"));
check('inv protegido con ||',           app.includes('(inv.mercado||[])'));

console.log('\n══════════════════════════════════════════');
console.log('  Resultado: ' + ok + ' OK · ' + errores + ' ERRORES');
if (errores > 0) {
  console.log('  ⚠  Corrige los errores antes de hacer push');
  process.exit(1);
} else {
  console.log('  ✅ Todo correcto — listo para push');
}
console.log('══════════════════════════════════════════\n');
