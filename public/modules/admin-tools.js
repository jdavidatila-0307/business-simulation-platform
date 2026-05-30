/**
 * modules/admin-tools.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo independiente: herramientas administrativas
 * Fase 0 del plan de modularización — no modifica app.js
 *
 * Sobrescribe funciones problemáticas de app.js:
 *   - loadAdminRondas      → con fallback directo sin requireSimSelected
 *   - loadAdminResultados  → busca última ronda con datos reales
 *   - loadAdminRecalcular  → pantalla nueva (no existía en app.js)
 *
 * Reversión: comentar <script src="modules/admin-tools.js"> en index.html
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Utilidades internas ───────────────────────────────────────────────────────

/**
 * Espera a que api() esté disponible (definida en app.js)
 * Necesario porque los módulos se cargan después de app.js
 */
function _waitForApi(cb, attempts) {
  attempts = attempts || 0;
  if (typeof api === 'function') { cb(); return; }
  if (attempts > 20) { console.error('[admin-tools] api() no disponible'); return; }
  setTimeout(function() { _waitForApi(cb, attempts + 1); }, 100);
}

// ── loadAdminRondas — SOBRESCRIBE versión de app.js ──────────────────────────
/**
 * Muestra historial de rondas sin depender de state.currentSimId
 * Si requireSimSelected falla, intenta carga directa
 */
async function loadAdminRondas() {
  const el = document.getElementById('rondasContent');
  if (!el) return;

  // Intentar carga directa sin requireSimSelected
  try {
    el.innerHTML = '<p style="color:var(--text3);padding:20px">Cargando historial de rondas...</p>';

    const raw  = await api('GET', '/admin/historial');
    const hist = Array.isArray(raw) ? raw : (raw && raw.rondas ? raw.rondas : (raw && raw.historial ? raw.historial : []));

    if (!hist || !hist.length) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin rondas ejecutadas aún.</p>';
      return;
    }

    const rows = hist.map(function(h) {
      const estadoClass = (h.estado === 'calculada' || h.estado === 'simulated') ? 'badge-ok' : 'badge-warn';
      const fecha = h.ejecutadaAt ? new Date(h.ejecutadaAt).toLocaleString('es-BO') : '—';
      return '<tr>'
        + '<td style="text-align:center;font-weight:700;color:var(--accent3)">T' + h.ronda + '</td>'
        + '<td style="text-align:center"><span class="badge ' + estadoClass + '">' + h.estado + '</span></td>'
        + '<td style="text-align:center">' + (h.enviados || '—') + ' / ' + (h.total || '—') + '</td>'
        + '<td style="text-align:center;font-size:.78rem;color:var(--text3)">' + fecha + '</td>'
        + '</tr>';
    }).join('');

    el.innerHTML = '<div class="table-wrap">'
      + '<table>'
      + '<thead><tr>'
      + '<th style="text-align:center">Trimestre</th>'
      + '<th style="text-align:center">Estado</th>'
      + '<th style="text-align:center">Decisiones</th>'
      + '<th style="text-align:center">Ejecutada</th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table></div>'
      + '<div style="margin-top:20px;padding:12px 16px;background:var(--bg2);border-radius:var(--r);border:1px solid var(--border2)">'
      + '<div style="font-size:.75rem;color:var(--text3);margin-bottom:10px">🔧 Herramientas de mantenimiento</div>'
      + '<button class="btn btn-ghost" id="btnRecalcularBalance" onclick="doRecalcularBalance()">'
      + '🔄 Recalcular EF + Desglose CU — todas las rondas</button>'
      + '</div>';

  } catch(e) {
    el.innerHTML = '<p style="color:var(--accent4);padding:20px">Error al cargar rondas: ' + e.message + '</p>';
    console.error('[admin-tools] loadAdminRondas:', e);
  }
}

// ── loadAdminResultados — SOBRESCRIBE versión de app.js ──────────────────────
/**
 * Detecta automáticamente la última ronda con resultados reales
 * No asume que current-1 tiene datos
 */
async function loadAdminResultados(rondaVer) {
  const el = document.getElementById('adminResultadosContent');
  if (!el) return;

  try {
    el.innerHTML = '<p style="color:var(--text3);padding:20px">Cargando resultados...</p>';

    const ronda = await api('GET', '/admin/ronda');
    const current = (ronda && ronda.currentRound) ? ronda.currentRound : 0;

    if (!current) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin simulación activa.</p>';
      return;
    }

    // Buscar última ronda con resultados reales iterando hacia atrás
    let ultimaSimulada = 0;
    for (let i = current; i >= 1; i--) {
      try {
        const chk = await api('GET', '/admin/resultados/' + i);
        if (chk && chk.resultados && chk.resultados.length) {
          ultimaSimulada = i;
          break;
        }
      } catch(eIgnore) { /* ronda sin datos */ }
    }

    if (!ultimaSimulada) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin rondas ejecutadas aún.</p>';
      return;
    }

    const n = (rondaVer && rondaVer >= 1 && rondaVer <= current) ? rondaVer : ultimaSimulada;
    const rd = await api('GET', '/admin/resultados/' + n);

    if (!rd || !rd.resultados || !rd.resultados.length) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin resultados para Ronda ' + n + '.</p>';
      return;
    }

    // Selector de rondas
    const opciones = Array.from({length: current}, function(_, i) { return i + 1; })
      .map(function(r) {
        return '<option value="' + r + '"' + (r === n ? ' selected' : '') + '>Ronda ' + r + '</option>';
      }).join('');

    const selector = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">'
      + '<label style="font-size:.82rem;color:var(--text3)">Ver resultados de:</label>'
      + '<select class="form-input" style="width:auto;padding:4px 10px;font-size:.85rem"'
      + ' onchange="loadAdminResultados(+this.value)">' + opciones + '</select>'
      + '<span style="font-size:.78rem;color:var(--text3)">Última con datos: Ronda ' + ultimaSimulada + '</span>'
      + '</div>';

    el.innerHTML = selector + buildAdminResultsHTML(rd);
    if (typeof renderAdminCharts === 'function') setTimeout(renderAdminCharts, 200);

  } catch(e) {
    el.innerHTML = '<p style="color:var(--accent4);padding:20px">Error: ' + e.message + '</p>';
    console.error('[admin-tools] loadAdminResultados:', e);
  }
}

// ── loadAdminRecalcular — NUEVA función ──────────────────────────────────────
/**
 * Pantalla dedicada para recalcular estados financieros de todas las rondas
 * Invoca /admin/recalcular-balance y muestra reporte de resultados
 */
async function loadAdminRecalcular() {
  const el = document.getElementById('recalcularContent');
  if (!el) return;

  el.innerHTML = '<div style="padding:24px;max-width:600px">'
    + '<h2 style="font-size:1.1rem;font-weight:700;margin-bottom:8px;color:var(--accent3)">'
    + '⚡ Recalcular Estados Financieros</h2>'
    + '<p style="font-size:.84rem;color:var(--text3);margin-bottom:8px;line-height:1.6">'
    + 'Re-ejecuta el motor contable para <strong>todas las rondas ejecutadas</strong> '
    + 'usando los parámetros actuales de la industria.</p>'
    + '<p style="font-size:.82rem;color:var(--text3);margin-bottom:20px;line-height:1.6">'
    + '✅ Conserva las decisiones originales de los equipos.<br>'
    + '✅ Corrige descuadres causados por cambios en parámetros.<br>'
    + '✅ Actualiza: ER, Balance, Flujo de Caja en todas las rondas.</p>'
    + '<button class="btn btn-primary" id="btnRecalcAction" onclick="doRecalcularEjecutar()">'
    + '🔄 Ejecutar Recálculo de Todas las Rondas</button>'
    + '<div id="recalcularReporte" style="margin-top:24px"></div>'
    + '</div>';
}

/**
 * Ejecuta el recálculo y muestra el reporte
 * Separado de loadAdminRecalcular para poder reusar
 */
window.doRecalcularEjecutar = async function() {
  const btn = document.getElementById('btnRecalcAction');
  const rep = document.getElementById('recalcularReporte');

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Recalculando todas las rondas...'; }
  if (rep) rep.innerHTML = '<p style="color:var(--text3);font-size:.84rem">Procesando...</p>';

  try {
    const r = await api('POST', '/admin/recalcular-balance');

    const rondasOK    = r.rondas || r.actualizadas || r.ok || 0;
    const errores     = r.errores || [];
    const detalles    = r.detalles || r.detalle || [];

    let html = '<div style="background:rgba(158,216,48,0.08);border:1px solid rgba(158,216,48,0.3);'
      + 'border-radius:var(--r);padding:16px 20px">'
      + '<div style="font-weight:700;color:var(--accent3);margin-bottom:12px;font-size:.95rem">'
      + '✅ Recálculo completado exitosamente</div>'
      + '<div style="font-size:.84rem;color:var(--text2);margin-bottom:8px">'
      + 'Rondas actualizadas: <strong>' + rondasOK + '</strong></div>';

    if (detalles.length) {
      html += '<div style="font-size:.78rem;color:var(--text3);margin-top:8px">';
      detalles.forEach(function(d) {
        html += '• Ronda ' + d.ronda + ': ' + (d.equipos || 0) + ' equipos actualizados<br>';
      });
      html += '</div>';
    }

    if (errores.length) {
      html += '<div style="color:var(--accent4);font-size:.8rem;margin-top:8px">'
        + 'Errores: ' + errores.join(', ') + '</div>';
    }

    html += '<div style="font-size:.78rem;color:var(--text3);margin-top:12px;border-top:1px solid var(--border);padding-top:10px">'
      + '→ Ve a <strong>Resultados</strong> para verificar los estados financieros actualizados.</div>'
      + '</div>';

    if (rep) rep.innerHTML = html;

  } catch(e) {
    if (rep) rep.innerHTML = '<div style="color:var(--accent4);padding:12px;background:rgba(255,59,48,0.08);'
      + 'border-radius:var(--r)">Error: ' + e.message + '</div>';
    console.error('[admin-tools] doRecalcularEjecutar:', e);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 Ejecutar Recálculo de Todas las Rondas';
    }
  }
};

// ── Registrar en el router de navegación ─────────────────────────────────────
/**
 * Espera a que setupNav haya registrado los handlers base
 * y agrega el handler para admin-recalcular
 */
_waitForApi(function() {
  // Interceptar clics en el nav para admin-recalcular
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    if (btn.dataset.view === 'admin-recalcular') {
      e.stopImmediatePropagation();
      loadAdminRecalcular();
    }
    if (btn.dataset.view === 'admin-rondas') {
      // No stopPropagation — dejamos que app.js también maneje
      // pero sobreescribimos el resultado
      setTimeout(loadAdminRondas, 50);
    }
    if (btn.dataset.view === 'admin-resultados') {
      setTimeout(function() { loadAdminResultados(); }, 50);
    }
  }, true); // useCapture=true para interceptar antes que app.js

  console.log('[admin-tools] ✅ Módulo cargado — Recalcular, Rondas, Resultados activos');
});
