/**
 * CONTROL DE CALIDAD — SimNego v3.2
 * Genera y verifica firmas de funciones críticas en archivos del simulador
 * 
 * Uso:
 *   node control_calidad.js generar   → guarda firmas actuales como baseline
 *   node control_calidad.js verificar → compara contra baseline
 *   node control_calidad.js           → verifica (modo default)
 */
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const ARCHIVOS = {
  'public/app.js':    extractFunctionsJS,
  'server.js':        extractFunctionsJS,
  'src/engine.js':    extractFunctionsJS,
  'src/storage.js':   extractFunctionsJS,
  'src/reports.js':   extractFunctionsJS,
};

// Archivos que se monitorean por hash completo (HTML/CSS)
const ARCHIVOS_COMPLETOS = [
  'public/index.html',
  'public/styles.css',
  'public/manual.html',
];

// Secciones críticas dentro de app.js — identificadas por marcador de inicio
const SECCIONES_CRITICAS = [
  { nombre: 'buildAdminResultsHTML',    inicio: 'function buildAdminResultsHTML(rd) {' },
  { nombre: 'buildAdminKPIHTML',        inicio: 'function buildAdminKPIHTML(eqs' },
  { nombre: 'buildAdminChartsHTML',     inicio: 'function buildAdminChartsHTML(' },
  { nombre: 'loadHojaDecision',         inicio: 'async function loadHojaDecision()' },
  { nombre: 'loadEquipoFinanciero',     inicio: 'async function loadEquipoFinanciero()' },
  { nombre: 'loadEquipoResultados',     inicio: 'async function loadEquipoResultados()' },
  { nombre: 'loadEquipoReportes',       inicio: 'async function loadEquipoReportes()' },
  { nombre: 'loadAdminDashboard',       inicio: 'async function loadAdminDashboard()' },
  { nombre: 'presim_tabla_HTML',        inicio: 'psData.detalle.map(r =>' },
  { nombre: 'reporte_detalle_HTML',     inicio: '// ── INVESTIGACIÓN COMPRADA' },
  { nombre: 'adminEFTab',               inicio: 'window.adminEFTab = (n) =>' },
  { nombre: 'adminKPITab',              inicio: 'window.adminKPITab = (n) =>' },
];

const BASELINE_FILE = '.cq_baseline.json';

// Extraer funciones nombradas con su hash
function extractFunctionsJS(code) {
  const fns = {};
  // Capturar funciones: function X(...) { ... } y async function X(...)
  const fnRegex = /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = fnRegex.exec(code)) !== null) {
    const name = m[1];
    const start = m.index;
    // Encontrar el cierre de la función
    let depth = 0, pos = start;
    let inStr = false, strChar = null;
    for (let i = start; i < code.length; i++) {
      const ch = code[i];
      if (!inStr && (ch === '"' || ch === "'" || ch === '`')) { inStr = true; strChar = ch; }
      else if (inStr && ch === strChar && code[i-1] !== '\\') { inStr = false; }
      else if (!inStr) {
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { pos = i; break; } }
      }
    }
    const body = code.slice(start, pos+1);
    fns[name] = crypto.createHash('md5').update(body).digest('hex').slice(0,8);
  }
  // Capturar window.X = async (...) => { ... }
  const winRegex = /window\.(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g;
  while ((m = winRegex.exec(code)) !== null) {
    const name = 'window.' + m[1];
    fns[name] = crypto.createHash('md5').update(code.slice(m.index, m.index+200)).digest('hex').slice(0,8);
  }
  return fns;
}

// Extraer hash de una sección específica de código
function extractSection(code, inicio, chars=3000) {
  const idx = code.indexOf(inicio);
  if (idx < 0) return null;
  return crypto.createHash('md5').update(code.slice(idx, idx+chars)).digest('hex').slice(0,8);
}

// Hash completo de un archivo
function hashFile(filepath) {
  if (!fs.existsSync(filepath)) return null;
  return crypto.createHash('md5').update(fs.readFileSync(filepath)).digest('hex').slice(0,8);
}

function generateBaseline() {
  const baseline = {};
  let total = 0;
  for (const [file, extractor] of Object.entries(ARCHIVOS)) {
    if (!fs.existsSync(file)) { console.log(`  ⚠  ${file} no encontrado`); continue; }
    const code = fs.readFileSync(file, 'utf8');
    baseline[file] = extractor(code);
    total += Object.keys(baseline[file]).length;
    console.log(`  📄 ${file}: ${Object.keys(baseline[file]).length} funciones`);
  }
  // Archivos completos (HTML/CSS)
  baseline['__archivos_completos__'] = {};
  for (const f of ARCHIVOS_COMPLETOS) {
    const h = hashFile(f);
    if (h) {
      baseline['__archivos_completos__'][f] = h;
      console.log(`  🎨 ${f}: ${h}`);
      total++;
    } else {
      console.log(`  ⚠  ${f} no encontrado`);
    }
  }

  // Secciones críticas de app.js
  if (fs.existsSync('public/app.js')) {
    const appCode = fs.readFileSync('public/app.js', 'utf8');
    baseline['__secciones__'] = {};
    for (const sec of SECCIONES_CRITICAS) {
      const h = extractSection(appCode, sec.inicio);
      if (h) {
        baseline['__secciones__'][sec.nombre] = h;
        console.log(`  📋 sección: ${sec.nombre}: ${h}`);
        total++;
      }
    }
  }

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  console.log(`\n✅ Baseline guardado — ${total} elementos en ${BASELINE_FILE}`);
}

function verifyBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.log('❌ No existe baseline. Ejecuta: node control_calidad.js generar');
    process.exit(1);
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  let totalOK = 0, totalCambiadas = 0, totalNuevas = 0, totalEliminadas = 0;

  for (const [file, extractor] of Object.entries(ARCHIVOS)) {
    if (!fs.existsSync(file)) { console.log(`  ⚠  ${file} no encontrado`); continue; }
    const code    = fs.readFileSync(file, 'utf8');
    const current = extractor(code);
    const prev    = baseline[file] || {};

    const cambiadas  = [];
    const nuevas     = [];
    const eliminadas = [];

    // Verificar funciones existentes
    for (const [name, hash] of Object.entries(current)) {
      if (!prev[name])            nuevas.push(name);
      else if (prev[name] !== hash) cambiadas.push(name);
      else                          totalOK++;
    }
    for (const name of Object.keys(prev)) {
      if (!current[name]) eliminadas.push(name);
    }

    const hasChanges = cambiadas.length || nuevas.length || eliminadas.length;
    console.log(`\n📄 ${file}:`);

    if (!hasChanges) {
      console.log(`  ✅ Sin cambios (${Object.keys(current).length} funciones)`);
    } else {
      if (cambiadas.length)  { console.log(`  🔶 MODIFICADAS (${cambiadas.length}):`);  cambiadas.forEach(f  => console.log(`     ~ ${f}`)); }
      if (nuevas.length)     { console.log(`  🟢 NUEVAS (${nuevas.length}):`);          nuevas.forEach(f    => console.log(`     + ${f}`)); }
      if (eliminadas.length) { console.log(`  🔴 ELIMINADAS (${eliminadas.length}):`);  eliminadas.forEach(f => console.log(`     - ${f}`)); }
    }

    totalCambiadas  += cambiadas.length;
    totalNuevas     += nuevas.length;
    totalEliminadas += eliminadas.length;
  }

  // Verificar archivos completos (HTML/CSS)
  const prevCompletos = baseline['__archivos_completos__'] || {};
  console.log('\n🎨 Archivos HTML/CSS:');
  let archCambiados = 0;
  for (const f of ARCHIVOS_COMPLETOS) {
    const h = hashFile(f);
    if (!h) { console.log(`  ⚠  ${f} no encontrado`); continue; }
    if (!prevCompletos[f]) { console.log(`  🟢 NUEVO: ${f}`); totalNuevas++; }
    else if (prevCompletos[f] !== h) {
      console.log(`  🔶 MODIFICADO: ${f}`);
      archCambiados++; totalCambiadas++;
    } else {
      console.log(`  ✅ ${f}`); totalOK++;
    }
  }

  // Verificar secciones críticas de app.js
  const prevSec = baseline['__secciones__'] || {};
  console.log('\n📋 Secciones críticas app.js:');
  let secCambiadas = 0;
  if (fs.existsSync('public/app.js')) {
    const appCode = fs.readFileSync('public/app.js', 'utf8');
    for (const sec of SECCIONES_CRITICAS) {
      const h = extractSection(appCode, sec.inicio);
      if (!h) { console.log(`  ⚠  ${sec.nombre}: no encontrada`); continue; }
      if (!prevSec[sec.nombre]) { console.log(`  🟢 NUEVA: ${sec.nombre}`); totalNuevas++; }
      else if (prevSec[sec.nombre] !== h) {
        console.log(`  🔶 MODIFICADA: ${sec.nombre}`);
        secCambiadas++; totalCambiadas++;
      } else {
        console.log(`  ✅ ${sec.nombre}`); totalOK++;
      }
    }
  }

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  RESUMEN: ${totalOK} sin cambios · ${totalCambiadas} modificadas · ${totalNuevas} nuevas · ${totalEliminadas} eliminadas`);
  if (totalCambiadas > 0 || totalEliminadas > 0) {
    console.log(`  ⚠️  Revisa los elementos modificados/eliminados antes del push`);
    if (secCambiadas > 0) console.log(`  🔶 ${secCambiadas} sección(es) de pantalla/reporte cambiaron`);
    if (archCambiados > 0) console.log(`  🔶 ${archCambiados} archivo(s) HTML/CSS cambiaron`);
  } else {
    console.log(`  ✅ Sin cambios no intencionados — seguro para push`);
  }
  console.log('═'.repeat(55));
}

const cmd = process.argv[2];
if (cmd === 'generar') {
  console.log('\n📸 Generando baseline...\n');
  generateBaseline();
} else {
  console.log('\n🔍 Verificando cambios...\n');
  verifyBaseline();
}
