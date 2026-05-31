/**
 * modules/admin-mercado.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo: panel de mercado administrativo
 * Fase 1 — Día 2 del plan de modularización
 *
 * Funciones incluidas:
 *   - loadAdminMercado → tabla de segmentos de mercado
 *
 * Dependencias: api(), fmt (ui-components.js), state
 * Reversión: comentar <script src="modules/admin-mercado.js"> en index.html
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function loadAdminMercado() {
  var el = document.getElementById('adminMercadoContent') || document.getElementById('mercadoContent');
  if (!el) return;

  try {
    el.innerHTML = '<p style="color:var(--text3);padding:20px">Cargando datos de mercado...</p>';

    var ref = (typeof state !== 'undefined' && state.ref) ? state.ref : await api('GET', '/admin/config');
    var segs = ref.mercadoSegmentos || [];

    if (!segs.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>Sin datos de mercado.</p></div>';
      return;
    }

    var tend = function(t) {
      return t === 'Alto crecimiento' ? 'badge-high' : t === 'Creciente' ? 'badge-grow' : 'badge-stable';
    };

    var rows = segs.map(function(s) {
      return '<tr>'
        + '<td><strong>' + s.nombre + '</strong></td>'
        + '<td class="num">' + fmt.num(s.demandaBase) + '</td>'
        + '<td class="num">' + fmt.pct(s.pctContrabando) + '</td>'
        + '<td class="num val-gold">' + fmt.num(s.demandaFormal) + '</td>'
        + '<td class="num">' + fmt.pct(s.tasaCrecimiento != null ? s.tasaCrecimiento : 0) + '</td>'
        + '<td><span class="badge ' + tend(s.tendencia) + '">' + s.tendencia + '</span></td>'
        + '</tr>';
    }).join('');

    el.innerHTML = '<div class="table-wrap">'
      + '<table>'
      + '<thead><tr>'
      + '<th>Segmento</th>'
      + '<th>Demanda base</th>'
      + '<th>% Contrabando</th>'
      + '<th>Demanda formal (unid)</th>'
      + '<th>Tasa crecimiento</th>'
      + '<th>Tendencia</th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table>'
      + '</div>';

  } catch(e) {
    el.innerHTML = '<p style="color:var(--accent4);padding:20px">Error: ' + e.message + '</p>';
    console.error('[admin-mercado] loadAdminMercado:', e);
  }
}


// ── Exponer como window.* para setupNav ──────────────────
window.loadAdminMercado = loadAdminMercado;
console.log('[admin-mercado] ✅ Módulo cargado — loadAdminMercado activo');
