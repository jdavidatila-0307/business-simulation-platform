/**
 * modules/ui-components.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo: componentes de UI reutilizables
 * Fase 1 — Día 1 del plan de modularización
 *
 * Funciones incluidas (copiadas de app.js — NO eliminadas aún):
 *   - fmt        → formateadores de números/fechas
 *   - finRow     → fila de estado financiero
 *   - finRowSub  → fila subtotal de estado financiero
 *   - escapeHtml → sanitización HTML
 *   - toast      → notificaciones UI
 *
 * NOTA: estas funciones también existen en app.js durante el período de
 * transición. Una vez verificado el módulo 24h en producción, se comentarán
 * en app.js. No hay conflicto — las definiciones son idénticas.
 *
 * Reversión: comentar <script src="modules/ui-components.js"> en index.html
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Formateadores ─────────────────────────────────────────────────────────────
/**
 * Objeto de utilidades de formato
 * Sobrescribe el fmt de app.js si ya existe (son idénticos)
 */
if (typeof window !== 'undefined') {
  window.fmt = window.fmt || {
    bs:  function(v) { return 'Bs ' + ((+v||0).toLocaleString('es-BO', {maximumFractionDigits:0})); },
    num: function(v) { return (+v||0).toLocaleString('es-BO', {maximumFractionDigits:0}); },
    pct: function(v) { return (((+v||0)*100).toFixed(2)) + '%'; },
    d:   function(v, n) { n = n !== undefined ? n : 2; return (+v||0).toFixed(n); },
    dt:  function(s) { return s ? new Date(s).toLocaleString('es-BO', {dateStyle:'short', timeStyle:'short'}) : '—'; },
  };
}

// ── Filas de estados financieros ──────────────────────────────────────────────
/**
 * Genera una fila de estado financiero
 * @param {string} label  - Etiqueta de la fila
 * @param {number} value  - Valor monetario
 * @param {boolean} bold  - Si la fila va en negrita
 * @param {string} type   - 'pos' | 'neg' | 'neutral'
 * @returns {string} HTML de la fila
 */
function finRow(label, value, bold, type) {
  bold = bold || false;
  type = type || 'neutral';
  var col = type === 'pos' ? 'var(--accent5)' : type === 'neg' ? 'var(--accent4)' : 'var(--text)';
  var w = bold ? 'font-weight:700' : '';
  return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:.83rem;' + w + '">'
    + '<span style="color:var(--text2)">' + label + '</span>'
    + '<span style="font-family:var(--font-mono);font-size:.8rem;color:' + col + '">' + fmt.bs(value) + '</span>'
    + '</div>';
}

/**
 * Genera una fila de subtotal de estado financiero
 * @param {string} label  - Etiqueta del subtotal
 * @param {number} value  - Valor monetario
 * @param {boolean} bold  - Si va en negrita (default true)
 * @returns {string} HTML de la fila subtotal
 */
function finRowSub(label, value, bold) {
  bold = bold !== undefined ? bold : true;
  var col = value >= 0 ? 'var(--accent5)' : 'var(--accent4)';
  return '<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:.85rem;font-weight:700;margin-top:2px">'
    + '<span>' + label + '</span>'
    + '<span style="font-family:var(--font-mono);color:' + col + '">' + fmt.bs(value) + '</span>'
    + '</div>';
}

// ── Sanitización HTML ─────────────────────────────────────────────────────────
/**
 * Escapa caracteres especiales HTML para prevenir XSS
 * @param {string} str - String a escapar
 * @returns {string} String escapado
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ── Notificaciones toast ──────────────────────────────────────────────────────
/**
 * Muestra una notificación toast temporal
 * @param {string} msg    - Mensaje a mostrar
 * @param {string} type   - 'success' | 'error' | 'warning'
 */
function toast(msg, type) {
  type = type || 'success';
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(function() { el.className = 'toast'; }, 3000);
}

// ── Sección de estado financiero ──────────────────────────────────────────────
/**
 * Genera un encabezado de sección para estados financieros
 * @param {string} label - Título de la sección
 * @returns {string} HTML del encabezado
 */
function finSection(label) {
  return '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;'
    + 'letter-spacing:.08em;color:var(--text3);padding:10px 0 4px;margin-top:6px;'
    + 'border-top:1px solid var(--border2)">' + label + '</div>';
}

console.log('[ui-components] ✅ Módulo cargado — fmt, finRow, finRowSub, escapeHtml, toast, finSection');
