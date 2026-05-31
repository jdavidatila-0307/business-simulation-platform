/**
 * modules/admin-creditos.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo: panel de créditos administrativo
 * Fase 1 — Día 3 del plan de modularización
 *
 * Funciones incluidas:
 *   - loadAdminCreditos          → tabla de créditos por equipo
 *   - window.showAdminCreditoEquipo → switch de tabs por equipo
 *
 * Dependencias: api(), fmt (ui-components.js), state
 * Reversión: comentar <script src="modules/admin-creditos.js"> en index.html
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function loadAdminCreditos() {
  var el = document.getElementById('adminCreditosContent');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>';

  try {
    var equipos = await api('GET', '/admin/equipos');
    var historialResp = await api('GET', '/admin/historial');
    var hist = Array.isArray(historialResp) ? historialResp : (historialResp.rondas || historialResp.historial || []);

    if (!hist.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🏦</div><p>Sin rondas simuladas aún.</p></div>';
      return;
    }

    // Cargar rondas simuladas
    var rondaData = {};
    var rondas = hist.filter(function(h) { return h.estado === 'simulated' || h.estado === 'calculada'; });
    for (var i = 0; i < rondas.length; i++) {
      try {
        var rd = await api('GET', '/admin/resultados/' + rondas[i].ronda);
        rondaData[rondas[i].ronda] = rd;
      } catch(eIgnore) {}
    }

    // Tabs por equipo
    var tabs = equipos.map(function(eq, i) {
      return '<button class="seg-tab ' + (i === 0 ? 'active' : '') + '" data-eq="' + eq.id + '"'
        + ' onclick="showAdminCreditoEquipo(\'' + eq.id + '\')">' + eq.nombre + '</button>';
    }).join('');

    var panels = equipos.map(function(eq, idx) {
      var historialEquipo = Object.entries(rondaData).map(function(entry) {
        var ronda = entry[0];
        var rd = entry[1];
        var res = rd.resultados && rd.resultados.find(function(r) {
          return r.equipoOriginal === eq.id || r.equipo === eq.id || (r.equipo && r.equipo.startsWith(eq.id));
        });
        return res ? { ronda: parseInt(ronda), resultado: res } : null;
      }).filter(Boolean).sort(function(a, b) { return a.ronda - b.ronda; });

      var prestamos = [];
      historialEquipo.forEach(function(item) {
        var ronda = item.ronda;
        var r = item.resultado;
        if (r.ingresoPrestamo > 0) {
          var esSobregiro = r.sobregiro > 0 && r.ingresoPrestamo === r.sobregiro;
          if (!esSobregiro) {
            var plazo = r.plazoPrestamo || 2;
            var tasa = r.interesesPrestamo && r.ingresoPrestamo ? r.interesesPrestamo / r.ingresoPrestamo : 0.04;
            prestamos.push({ rondaOrigen: ronda, tipo: 'Préstamo', monto: r.ingresoPrestamo, tasa: tasa, plazo: plazo, comision: r.comisionApertura || 0 });
          }
        }
        if (r.sobregiro > 0) {
          prestamos.push({ rondaOrigen: ronda, tipo: 'Sobregiro', monto: r.sobregiro, tasa: 0.06, plazo: 1, comision: 0, interes: r.interesSobregiro });
        }
      });

      if (!prestamos.length) {
        return '<div class="seg-panel ' + (idx === 0 ? 'active' : '') + '" id="eqCredit_' + eq.id + '">'
          + '<div class="empty-state"><div class="empty-icon">✅</div><p>Sin préstamos para ' + eq.nombre + '.</p></div>'
          + '</div>';
      }

      var currentR = Math.max.apply(null, Object.keys(rondaData).map(Number));

      var cards = prestamos.map(function(p) {
        var intTotal = Math.round(p.monto * (p.tasa || 0) * p.plazo * 100) / 100;
        var totalPagar = Math.round((p.monto + intTotal + p.comision) * 100) / 100;
        var rows = Array.from({length: p.plazo}, function(_, j) {
          var rondaPago = p.rondaOrigen + j + 1;
          var pagado = rondaPago <= currentR;
          return '<tr style="' + (pagado ? 'color:var(--text3)' : '') + '">'
            + '<td style="text-align:center;font-family:var(--font-mono)">' + rondaPago + '</td>'
            + '<td class="num">' + fmt.bs(Math.round(p.monto / p.plazo * 100) / 100) + '</td>'
            + '<td class="num">' + fmt.bs(Math.round(p.monto * (p.tasa || 0) * 100) / 100) + '</td>'
            + '<td class="num">' + fmt.bs(Math.round((p.monto / p.plazo + p.monto * (p.tasa || 0)) * 100) / 100) + '</td>'
            + '<td style="text-align:center">' + (pagado ? '<span class="badge badge-ok">✓</span>' : '<span class="badge badge-pending">⏳</span>') + '</td>'
            + '</tr>';
        }).join('');

        return '<div class="result-round-card" style="margin-bottom:12px">'
          + '<div class="result-round-header"><h3>' + p.tipo + ' — Ronda ' + p.rondaOrigen + '</h3>'
          + '<span style="font-family:var(--font-mono);font-size:.72rem;color:var(--text3)">' + fmt.bs(p.monto) + ' · ' + fmt.pct(p.tasa || 0) + ' trim.</span></div>'
          + '<div class="table-wrap" style="border-radius:0"><table>'
          + '<thead><tr><th>Ronda pago</th><th>Capital</th><th>Interés</th><th>Cuota total</th><th>Estado</th></tr></thead>'
          + '<tbody>' + rows + '</tbody></table></div>'
          + '<div style="padding:8px 14px;font-size:.78rem;color:var(--text3)">Total a pagar: <strong>' + fmt.bs(totalPagar) + '</strong> | Comisión: <strong>' + fmt.bs(p.comision) + '</strong></div>'
          + '</div>';
      }).join('');

      var ultimaDeuda = historialEquipo.length ? (historialEquipo[historialEquipo.length - 1].resultado.deudaFinal || 0) : 0;

      return '<div class="seg-panel ' + (idx === 0 ? 'active' : '') + '" id="eqCredit_' + eq.id + '">'
        + '<div class="stat-grid" style="margin-bottom:16px">'
        + '<div class="stat-card"><div class="stat-label">Préstamos / Sobregiros</div>'
        + '<div class="stat-value" style="color:var(--accent2)">' + prestamos.length + '</div></div>'
        + '<div class="stat-card"><div class="stat-label">Deuda final última ronda</div>'
        + '<div class="stat-value" style="color:' + (ultimaDeuda > 0 ? 'var(--accent4)' : 'var(--accent5)') + '">' + fmt.bs(ultimaDeuda) + '</div></div>'
        + '</div>' + cards + '</div>';
    }).join('');

    el.innerHTML = '<div class="seg-tabs-bar">' + tabs + '</div><div class="seg-panels">' + panels + '</div>';

  } catch(e) {
    el.innerHTML = '<p style="color:var(--accent4);padding:16px">' + e.message + '</p>';
    console.error('[admin-creditos] loadAdminCreditos:', e);
  }
}

window.showAdminCreditoEquipo = function(id) {
  document.querySelectorAll('#adminCreditosContent .seg-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.eq === id);
  });
  document.querySelectorAll('#adminCreditosContent .seg-panel').forEach(function(p) {
    p.classList.toggle('active', p.id === 'eqCredit_' + id);
  });
};


// ── Exponer como window.* para setupNav ──────────────────
window.loadAdminCreditos = loadAdminCreditos;
console.log('[admin-creditos] ✅ Módulo cargado — loadAdminCreditos activo');
