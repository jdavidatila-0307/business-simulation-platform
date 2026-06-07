/**
 * fix_seg0_demanda.js
 * SimNego v3.2 — Ajuste quirúrgico SEG0 Padres/niños
 *
 * CAMBIOS:
 *   segmentos[0].demandaBase   7.000 → 30.000
 *   segmentos[0].indiceExterno 12.42 → 14.28
 *   segmentos[0].descripcion   actualizada con justificación
 *
 * JUSTIFICACIÓN:
 *   costoBase Bs 79 → margen por unidad Bs 31,60
 *   PE = 3.547 unidades con costos fijos Bs 112.100/trim
 *   Con demandaBase 7.000 y share realista 15%:
 *     862 unidades << 3.547 PE → pérdida estructural
 *   Con demandaBase 30.000 y share 15%:
 *     3.690 unidades > 3.547 PE → viable ✅
 *   indiceExterno ajustado proporcionalmente (+15%)
 *   para mantener presión competitiva informal coherente.
 *
 * PROTOCOLO:
 *   1. Verificar archivo real antes de ejecutar
 *   2. Ejecutar este script
 *   3. node test_cuadre.js → 9/9
 *   4. node control_calidad.js → 142
 *   5. git add industrias/Calzados_COM540_1_2026_V2.json
 *   6. git commit -m "fix: ajustar SEG0 demandaBase 30k e indiceExterno 14.28"
 *   7. git push origin main
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Configuración ────────────────────────────────────────────────
const ARCHIVO = path.join(
  'C:\\Win\\SimuladorNegocios\\industrias',
  'Calzados_COM540_1_2026_V2.json'
);

const DESCRIPCION_NUEVA =
  'Padres y madres que buscan calzado cómodo, seguro y funcional ' +
  'para sus hijos. Compran en tiendas infantiles, online y ferias. ' +
  'Valoran durabilidad, seguridad y relación precio-calidad. ' +
  'Tamaño base calibrado sobre estimaciones del Eq.4 (5.000-20.000) ' +
  '— ajustado a 30.000 para viabilidad financiera con costoBase ' +
  'Bs 79 y costos fijos Bs 112.100/trim (PE = 3.547 u, share 15% ' +
  '→ 3.690 u > PE).';

// ── Paso 1: Leer archivo ─────────────────────────────────────────
console.log('📂 Leyendo archivo...');
if (!fs.existsSync(ARCHIVO)) {
  console.error(`❌ Archivo no encontrado: ${ARCHIVO}`);
  console.error('   Verifica la ruta con: Get-Content ' + ARCHIVO + ' | Select-Object -First 5');
  process.exit(1);
}

const contenido = fs.readFileSync(ARCHIVO, 'utf8');
const json = JSON.parse(contenido);

// ── Paso 2: Verificar estado actual ──────────────────────────────
const seg0 = json.segmentos[0];

console.log('\n📋 Estado ANTES del cambio:');
console.log(`   nombre:        ${seg0.nombre}`);
console.log(`   demandaBase:   ${seg0.demandaBase}`);
console.log(`   indiceExterno: ${seg0.indiceExterno}`);

if (seg0.nombre !== 'Padres y familias con niños (0-10 años)') {
  console.error('❌ BLOQUEADO: segmentos[0] no es el segmento esperado.');
  console.error(`   Encontrado: "${seg0.nombre}"`);
  console.error('   Verificar estructura del JSON antes de continuar.');
  process.exit(1);
}

if (seg0.demandaBase === 30000) {
  console.log('⚠  demandaBase ya es 30.000 — script ya fue aplicado anteriormente.');
  process.exit(0);
}

// ── Paso 3: Aplicar cambios ───────────────────────────────────────
console.log('\n✏️  Aplicando cambios quirúrgicos...');

json.segmentos[0].demandaBase   = 30000;
json.segmentos[0].indiceExterno = 14.28;
json.segmentos[0].descripcion   = DESCRIPCION_NUEVA;

// ── Paso 4: Verificar A=P+Pat no se ve afectado ───────────────────
// demandaBase y indiceExterno son parámetros de mercado (no contables)
// No afectan el invariante contable — solo el modelo Logit de demanda
console.log('✅ Invariante contable: no afectado (cambio solo en parámetros de mercado)');

// ── Paso 5: Escribir archivo ──────────────────────────────────────
const jsonFinal = JSON.stringify(json, null, 2);
fs.writeFileSync(ARCHIVO, jsonFinal, 'utf8');

// ── Paso 6: Verificar resultado ───────────────────────────────────
const verificacion = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
const seg0v = verificacion.segmentos[0];

console.log('\n📋 Estado DESPUÉS del cambio:');
console.log(`   nombre:        ${seg0v.nombre}`);
console.log(`   demandaBase:   ${seg0v.demandaBase}`);
console.log(`   indiceExterno: ${seg0v.indiceExterno}`);

// ── Paso 7: Verificación matemática ──────────────────────────────
const pctContrabando = seg0v.pctContrabando;
const demandaFormal  = seg0v.demandaBase * (1 - pctContrabando);
const share15        = demandaFormal * 0.15;
const pe             = 3547;

console.log('\n📊 Verificación de viabilidad:');
console.log(`   demandaBase nuevo:      ${seg0v.demandaBase.toLocaleString()} u/trim`);
console.log(`   demanda formal (82%):   ${Math.round(demandaFormal).toLocaleString()} u/trim`);
console.log(`   unidades con share 15%: ${Math.round(share15).toLocaleString()} u/trim`);
console.log(`   punto de equilibrio:    ${pe.toLocaleString()} u/trim`);
console.log(`   viable con share 15%:   ${share15 >= pe ? '✅ SÍ' : '❌ NO'}`);

console.log('\n✅ Script completado exitosamente.');
console.log('\n📋 Próximos pasos:');
console.log('   1. node test_cuadre.js');
console.log('   2. node control_calidad.js');
console.log('   3. git add industrias/Calzados_COM540_1_2026_V2.json');
console.log('   4. git commit -m "fix: ajustar SEG0 demandaBase 30k e indiceExterno 14.28"');
console.log('   5. git push origin main');
