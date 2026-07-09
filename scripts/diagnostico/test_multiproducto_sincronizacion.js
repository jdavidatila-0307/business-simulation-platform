/**
 * scripts/diagnostico/test_multiproducto_sincronizacion.js
 *
 * Script de diagnóstico aislado, en el mismo espíritu que
 * scripts/diagnostico/test_reproducir_bug_r8.js. NO toca ningún archivo de
 * producción, NO importa server.js ni equipo-hoja.js, NO usa base de datos.
 *
 * La función de abajo es COPIA TEXTUAL (literal) de
 * public/modules/equipo-hoja.js, líneas 187-214, tomada el 2026-07-08, para
 * poder ejecutarla de forma aislada con un DOM simulado. No se modificó el
 * archivo original.
 *
 * Objetivo: confirmar si sincronizarHojaConEstado() escribe los valores del
 * formulario en el producto correcto (según hojaProductoActivo) o siempre
 * en productos[0], independientemente de qué producto tenga abierto el
 * estudiante en pantalla.
 */

// ─────────────────────────────────────────────────────────────────────────
// COPIA TEXTUAL de public/modules/equipo-hoja.js (líneas 187-214) — INICIO
// Fuente: public/modules/equipo-hoja.js, estado en HEAD al 2026-07-08.
// Se referencian `document` y `state` como variables globales, tal como en
// el archivo original (ambas se inyectan como mocks más abajo en este script).
// ─────────────────────────────────────────────────────────────────────────
function sincronizarHojaConEstado() {
  // P4 FIX: sincroniza el DOM de la hoja con state.decisiones antes de
  // guardar o enviar, capturando cambios no procesados por el change handler.
  document.querySelectorAll('[data-hoja-field]').forEach(el => {
    if (!state.decisiones) return;
    const field = el.dataset.hojaField;
    const v = el.type === 'checkbox' ? el.checked
            : el.type === 'number'   ? +el.value
            : el.tagName === 'SELECT'
              ? el.value.replace(/\s*\(Bs[\d.\s]+\)\s*$/, '').trim()
            : el.value;
    const prodFields = ['producto','segmentoObjetivo','canalPrincipal',
      'canalSecundario','calidad','precioVenta','produccion','publicidad',
      'promocion','eventos','marketingRedes','relacionesPublicas',
      'innovacion','tipoInnovacion','montoInnovacion'];
    if (state.decisiones.productos?.[0] && prodFields.includes(field)) {
      state.decisiones.productos[0][field] = v;
    }
    if (field === 'producto' || field === 'tipoProducto') {
      state.decisiones['producto'] = v;
      if (state.decisiones.productos?.[0]) {
        state.decisiones.productos[0].producto = v;
      }
    }
    state.decisiones[field] = v;
  });
  sincronizarInversionActivosDesdeDOM(document);
}
// ─────────────────────────────────────────────────────────────────────────
// COPIA TEXTUAL — FIN
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// VERSIÓN CON FIX PROPUESTO — sincronizarHojaConEstado_CON_FIX()
// Idéntica a la original excepto por el uso de `idxActivo` (derivado de
// hojaProductoActivo) en vez de un índice fijo [0]. NO reemplaza ni modifica
// la función original de arriba — se conserva para comparación directa.
// hojaProductoActivo se recibe como parámetro (en vez de global implícito)
// por ser la forma más limpia, según lo indicado.
// ─────────────────────────────────────────────────────────────────────────
function sincronizarHojaConEstado_CON_FIX(hojaProductoActivo) {
  document.querySelectorAll('[data-hoja-field]').forEach(el => {
    if (!state.decisiones) return;
    const field = el.dataset.hojaField;
    const v = el.type === 'checkbox' ? el.checked
            : el.type === 'number'   ? +el.value
            : el.tagName === 'SELECT'
              ? el.value.replace(/\s*\(Bs[\d.\s]+\)\s*$/, '').trim()
            : el.value;
    const prodFields = ['producto','segmentoObjetivo','canalPrincipal',
      'canalSecundario','calidad','precioVenta','produccion','publicidad',
      'promocion','eventos','marketingRedes','relacionesPublicas',
      'innovacion','tipoInnovacion','montoInnovacion'];
    const idxActivo = (typeof hojaProductoActivo === 'number') ? hojaProductoActivo : 0;
    if (state.decisiones.productos?.[idxActivo] && prodFields.includes(field)) {
      state.decisiones.productos[idxActivo][field] = v;
    }
    if (field === 'producto' || field === 'tipoProducto') {
      state.decisiones['producto'] = v;
      if (state.decisiones.productos?.[idxActivo]) {
        state.decisiones.productos[idxActivo].producto = v;
      }
    }
    state.decisiones[field] = v;
  });
  sincronizarInversionActivosDesdeDOM(document);
}

// Stub de sincronizarInversionActivosDesdeDOM: no es el mecanismo bajo
// prueba (inversión en activos no está en juego en este caso), así que se
// deja como no-op para que sincronizarHojaConEstado() ejecute sin lanzar
// excepciones.
function sincronizarInversionActivosDesdeDOM(root) {
  // no-op deliberado — fuera del alcance de este diagnóstico
}

// ─────────────────────────────────────────────────────────────────────────
// UTILIDADES DE PRUEBA
// ─────────────────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); }
function sep(titulo) {
  console.log('\n' + '='.repeat(78));
  console.log(titulo);
  console.log('='.repeat(78));
}

// Construye un elemento de DOM simulado mínimo, con las propiedades que
// sincronizarHojaConEstado() efectivamente usa: dataset.hojaField, type,
// value, checked, tagName.
function mockEl({ field, type = 'number', value, checked, tagName = 'INPUT' }) {
  return {
    dataset: { hojaField: field },
    type,
    value,
    checked,
    tagName,
  };
}

// Construye un state.decisiones de ejemplo con dos productos, como en RAIZ
// (equipos multiproducto reales).
function construirStateDosProductos() {
  return {
    decisiones: {
      producto: 'Producto Original 1',
      productos: [
        {
          productoId: 'prod_1',
          activo: true,
          producto: 'Producto Original 1',
          segmentoObjetivo: 'Segmento A',
          canalPrincipal: 'Canal A',
          canalSecundario: 'Ninguno',
          calidad: 5,
          precioVenta: 10,
          produccion: 500,
          publicidad: 0, promocion: 0, eventos: 0, marketingRedes: 0, relacionesPublicas: 0,
          innovacion: false, tipoInnovacion: '', montoInnovacion: 0,
        },
        {
          productoId: 'prod_2',
          activo: true,
          producto: 'Producto Original 2',
          segmentoObjetivo: 'Segmento B',
          canalPrincipal: 'Canal B',
          canalSecundario: 'Ninguno',
          calidad: 6,
          precioVenta: 20,
          produccion: 800,
          publicidad: 0, promocion: 0, eventos: 0, marketingRedes: 0, relacionesPublicas: 0,
          innovacion: false, tipoInnovacion: '', montoInnovacion: 0,
        },
      ],
    },
  };
}

// DOM simulado: representa lo que el estudiante ve y edita EN PANTALLA en
// el instante del clic — valores nuevos para precioVenta y produccion,
// tal como los escribiría en los inputs de la pestaña de producto que
// tiene abierta (Producto 2 en el caso principal).
function construirDomFalsoConEdicion() {
  return [
    mockEl({ field: 'precioVenta', type: 'number', value: '999' }),
    mockEl({ field: 'produccion',  type: 'number', value: '5000' }),
  ];
}

function ejecutarCaso(nombreCaso, hojaProductoActivoSimulado, funcionAEjecutar = sincronizarHojaConEstado) {
  sep(`${nombreCaso} — hojaProductoActivo = ${hojaProductoActivoSimulado}`);

  const stateLocal = construirStateDosProductos();
  const domFalso = construirDomFalsoConEdicion();

  // Inyección de globals que ambas funciones esperan encontrar:
  // `document` (con querySelectorAll simulado) y `state` (state.decisiones).
  // Nota: sincronizarHojaConEstado() (original) NO usa hojaProductoActivo en
  // absoluto — se registra aquí solo para dejar constancia explícita de qué
  // pestaña tendría abierta el estudiante en la UI real en este instante, y
  // comparar contra dónde escribe realmente la función. La versión CON_FIX
  // sí recibe hojaProductoActivo, pero como parámetro directo de la función,
  // no como global.
  global.document = {
    querySelectorAll: (selector) => {
      if (selector === '[data-hoja-field]') return domFalso;
      return [];
    },
  };
  global.state = stateLocal;

  log(`  (Informativo) El estudiante tiene abierta la pestaña "Producto ${hojaProductoActivoSimulado + 1}" en la UI real.`);
  log(`  Valores ANTES de sincronizar:`);
  log(`    productos[0].precioVenta=${stateLocal.decisiones.productos[0].precioVenta} | productos[0].produccion=${stateLocal.decisiones.productos[0].produccion}`);
  log(`    productos[1].precioVenta=${stateLocal.decisiones.productos[1].precioVenta} | productos[1].produccion=${stateLocal.decisiones.productos[1].produccion}`);

  funcionAEjecutar(hojaProductoActivoSimulado);

  log(`\n  Valores DESPUÉS de sincronizar:`);
  log(`    productos[0].precioVenta=${stateLocal.decisiones.productos[0].precioVenta} | productos[0].produccion=${stateLocal.decisiones.productos[0].produccion}`);
  log(`    productos[1].precioVenta=${stateLocal.decisiones.productos[1].precioVenta} | productos[1].produccion=${stateLocal.decisiones.productos[1].produccion}`);

  const escribioEnProducto0 = stateLocal.decisiones.productos[0].precioVenta === 999 && stateLocal.decisiones.productos[0].produccion === 5000;
  const escribioEnProducto1 = stateLocal.decisiones.productos[1].precioVenta === 999 && stateLocal.decisiones.productos[1].produccion === 5000;

  log(`\n  ¿Los valores 999/5000 terminaron en productos[0] (Producto 1)? => ${escribioEnProducto0}`);
  log(`  ¿Los valores 999/5000 terminaron en productos[1] (Producto 2)? => ${escribioEnProducto1}`);

  const esperabaProducto1 = hojaProductoActivoSimulado === 1;
  const resultadoCorrecto = esperabaProducto1 ? escribioEnProducto1 && !escribioEnProducto0 : escribioEnProducto0 && !escribioEnProducto1;
  const huboPerdidaOMezcla = !resultadoCorrecto;

  log(`  ¿El resultado coincide con la pestaña que el estudiante tenía abierta (producto[${hojaProductoActivoSimulado}])? => ${resultadoCorrecto}`);
  log(`\n¿Hubo pérdida/mezcla de datos en "${nombreCaso}"? => ${huboPerdidaOMezcla}`);

  delete global.document;
  delete global.state;

  return { nombreCaso, hojaProductoActivoSimulado, escribioEnProducto0, escribioEnProducto1, huboPerdidaOMezcla };
}

// ─────────────────────────────────────────────────────────────────────────
// CASO PRINCIPAL — hojaProductoActivo = 1 (Producto 2 abierto en pantalla)
// ─────────────────────────────────────────────────────────────────────────
const resultadoCasoPrincipal = ejecutarCaso('CASO PRINCIPAL (Producto 2 activo en UI)', 1);

// ─────────────────────────────────────────────────────────────────────────
// CASO BASE DE COMPARACIÓN — hojaProductoActivo = 0 (Producto 1 abierto)
// ─────────────────────────────────────────────────────────────────────────
const resultadoCasoBase = ejecutarCaso('CASO BASE (Producto 1 activo en UI)', 0);

// ─────────────────────────────────────────────────────────────────────────
// TERCERA RONDA — misma prueba, pero con sincronizarHojaConEstado_CON_FIX()
// ─────────────────────────────────────────────────────────────────────────
const resultadoCasoPrincipalConFix = ejecutarCaso(
  'CASO PRINCIPAL CON FIX (Producto 2 activo en UI)', 1, sincronizarHojaConEstado_CON_FIX
);
const resultadoCasoBaseConFix = ejecutarCaso(
  'CASO BASE CON FIX (Producto 1 activo en UI)', 0, sincronizarHojaConEstado_CON_FIX
);

// ─────────────────────────────────────────────────────────────────────────
// RESUMEN FINAL
// ─────────────────────────────────────────────────────────────────────────
sep('RESUMEN FINAL');
log('  Tabla comparativa (4 casos): sin fix vs con fix');
log('  ' + '-'.repeat(74));
[resultadoCasoPrincipal, resultadoCasoBase, resultadoCasoPrincipalConFix, resultadoCasoBaseConFix].forEach(r => {
  log(`  - ${r.nombreCaso} (hojaProductoActivo=${r.hojaProductoActivoSimulado}): escribioEnProducto0=${r.escribioEnProducto0}, escribioEnProducto1=${r.escribioEnProducto1}, huboPerdidaOMezcla=${r.huboPerdidaOMezcla}`);
});

log('\nConclusión de este script: sincronizarHojaConEstado(), tal como está implementada hoy');
log('en public/modules/equipo-hoja.js (líneas 187-214), NO consulta la variable');
log('hojaProductoActivo en ningún punto de su cuerpo. Escribe SIEMPRE en');
log('state.decisiones.productos[0], sin importar qué pestaña de producto tenga abierta el');
log('estudiante en la UI real. Cuando el estudiante edita el Producto 2 (o cualquier producto');
log('distinto del primero) y hace clic en Guardar/Enviar, sincronizarHojaConEstado() sobrescribe');
log('los campos de productos[0] con los valores visibles en pantalla para el producto activo —');
log('mezclando datos entre productos y dejando intactos (sin actualizar) los valores reales del');
log('producto que el estudiante sí modificó. Este es un defecto INDEPENDIENTE del mecanismo de');
log('pérdida de datos de la Ronda 8 (Cambios A/B/C/D ya aplicados) y no fue corregido por ninguno');
log('de esos 4 commits.');
log('\nLa versión propuesta sincronizarHojaConEstado_CON_FIX(), que sustituye el índice fijo [0]');
log('por idxActivo (derivado de hojaProductoActivo), corrige el defecto: escribe en el producto');
log('que el estudiante realmente tiene abierto en pantalla, y preserva el comportamiento correcto');
log('para hojaProductoActivo=0 (caso más común, un solo producto o Producto 1 activo).');
