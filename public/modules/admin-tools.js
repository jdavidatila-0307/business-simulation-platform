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
    + '<button class="btn btn-primary" id="btnRecalcAction" onclick="doRecalcularBalance()">'
    + '🔄 Ejecutar Recálculo de Todas las Rondas</button>'
    + '<div id="recalcularReporte" style="margin-top:24px"></div>'
    + '</div>';

  // Ejecutar automáticamente al entrar al panel
  doRecalcularBalance();
}

/**
 * Ejecuta el recálculo y muestra el reporte
 * Separado de loadAdminRecalcular para poder reusar
 */
window.doRecalcularBalance = async function() {
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
    console.error('[admin-tools] doRecalcularBalance:', e);
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

  
// ── doBackupSimulacion ────────────────────────────────────────────────────────
window.doBackupSimulacion = async function(simIdParam) {
  var btn = event && event.target ? event.target : document.querySelector('[onclick*="doBackupSimulacion"]');
  try {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando...'; }
    var resp = await fetch('/admin/backup', { headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') } });
    if (!resp.ok) { var e = await resp.json().catch(function(){return{};}); throw new Error(e.error || resp.statusText); }
    var disposition = resp.headers.get('Content-Disposition') || '';
    var match = disposition.match(/filename="([^"]+)"/);
    var filename = match ? match[1] : 'backup_simnego_' + new Date().toISOString().slice(0,10) + '.json';
    var blob = await resp.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    if (btn) { btn.disabled = false; btn.textContent = '✅ Descargado'; }
    setTimeout(function() { if (btn) btn.textContent = '💾 Backup'; }, 3000);
  } catch(e) {
    alert('Error en backup: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Backup'; }
  }
};


// ── doRestaurarSimulacion ─────────────────────────────────────────────────────
window.doRestaurarSimulacion = function(simIdParam) {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = function(e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var backup = JSON.parse(ev.target.result);
        _mostrarModalRestaurar(backup, file.name);
      } catch(err) { alert('❌ Archivo inválido'); }
    };
    reader.readAsText(file);
  };
  input.click();
};

function _mostrarModalRestaurar(backup, filename) {
  if (!backup._meta || !backup.simulacion) { alert('❌ Backup inválido'); return; }
  var meta    = backup._meta;
  var equipos = (backup.equipos    || []).length;
  var rondas  = (backup.rondas     || []).length;
  var decs    = (backup.decisiones || []).length;

  var contenedor = document.getElementById('restaurarModal') || document.createElement('div');
  if (!contenedor.id) {
    contenedor.id = 'restaurarModal';
    document.body.appendChild(contenedor);
  }
  contenedor.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1000;background:var(--bg2);border:1px solid rgba(255,193,7,0.3);border-radius:10px;padding:20px;min-width:400px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.5)';

  contenedor.innerHTML =
    '<div style="font-size:.85rem;font-weight:700;color:#FFC107;margin-bottom:12px">📂 Restaurar backup</div>'
    + '<div style="font-size:.78rem;color:var(--text3);margin-bottom:14px;line-height:1.6">'
    + '<strong style="color:var(--white)">Archivo:</strong> ' + filename + '<br>'
    + '<strong style="color:var(--white)">Simulación:</strong> ' + meta.simulacion + '<br>'
    + '<strong style="color:var(--white)">Fecha:</strong> ' + new Date(meta.fecha).toLocaleString('es-BO') + '<br>'
    + 'Ronda T' + meta.ronda_actual + ' &nbsp;·&nbsp; ' + equipos + ' equipos &nbsp;·&nbsp; ' + rondas + ' rondas &nbsp;·&nbsp; ' + decs + ' decisiones'
    + '</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
    + '<button class="btn btn-ghost" id="btnRestNueva" style="border-color:rgba(158,216,48,0.4);color:#9ED830">🆕 Nueva simulación</button>'
    + '<button class="btn btn-ghost" id="btnRestSobrescribir" style="border-color:rgba(239,83,80,0.4);color:#EF5350">⚠️ Sobrescribir activa</button>'
    + '<button class="btn btn-ghost" id="btnRestCancelar">✕ Cancelar</button>'
    + '</div>'
    + '<div id="confirmSobrescribir" style="display:none;padding:10px;background:rgba(239,83,80,0.08);border:1px solid rgba(239,83,80,0.3);border-radius:6px;font-size:.78rem;color:#EF5350;margin-bottom:8px">'
    + '⚠️ <strong>Eliminará TODAS las rondas y decisiones actuales.</strong><br>'
    + '<button class="btn btn-ghost" id="btnConfirmarSobrescribir" style="margin-top:8px;border-color:rgba(239,83,80,0.5);color:#EF5350">Sí, sobrescribir</button>'
    + '</div>'
    + '<div id="restaurarReporte"></div>';

  contenedor._backup = backup;

  // Event listeners — sin comillas problemáticas en onclick
  document.getElementById('btnRestNueva').onclick        = function() { window._ejecutarRestaurar('nueva'); };
  document.getElementById('btnRestSobrescribir').onclick = function() { window._pedirConfirmacionSobrescribir(); };
  document.getElementById('btnRestCancelar').onclick     = function() { contenedor.remove(); };
  var btnConf = document.getElementById('btnConfirmarSobrescribir');
  if (btnConf) btnConf.onclick = function() { window._ejecutarRestaurar('sobrescribir'); };
}

window._pedirConfirmacionSobrescribir = function() {
  var c = document.getElementById('confirmSobrescribir'); if (c) c.style.display = 'block';
};

window._ejecutarRestaurar = async function(modo) {
  var modal = document.getElementById('restaurarModal');
  var reporte = document.getElementById('restaurarReporte');
  var backup = modal && modal._backup;
  if (!backup) { alert('Error: backup no encontrado'); return; }
  if (reporte) reporte.innerHTML = '<span style="color:var(--text3)">⏳ Restaurando...</span>';
  modal.querySelectorAll('button').forEach(function(b){b.disabled=true;});
  try {
    var resp = await fetch('/admin/restaurar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('token')||'') },
      body: JSON.stringify({ backup: backup, modo: modo, confirmar: true })
    });
    var data = await resp.json();
    if (!resp.ok) throw new Error(data.error || resp.statusText);
    var r = data.reporte || {};
    if (reporte) reporte.innerHTML = '<div style="padding:10px;background:rgba(158,216,48,0.08);border:1px solid rgba(158,216,48,0.2);border-radius:6px;font-size:.78rem">'
      + '✅ <strong style="color:#9ED830">Restauración completada</strong><br>'
      + 'Modo: ' + (modo==='nueva'?'🆕 Nueva':'⚠️ Sobrescrita') + ' · Nombre: ' + data.nombre + '<br>'
      + 'Equipos: ' + r.equipos + ' · Rondas: ' + r.rondas + ' · Decisiones: ' + r.decisiones + '</div>';
    // Cerrar modal y refrescar tras 1.5s
    setTimeout(function() {
      var modal = document.getElementById('restaurarModal');
      if (modal) modal.remove();
      if (typeof loadAdminSimulaciones === 'function') loadAdminSimulaciones();
    }, 1500);
  } catch(e) {
    if (reporte) reporte.innerHTML = '<span style="color:#EF5350">❌ ' + e.message + '</span>';
    modal.querySelectorAll('button').forEach(function(b){b.disabled=false;});
  }
};

console.log('[admin-tools] ✅ Módulo cargado — Recalcular, Rondas, Resultados activos');
});


