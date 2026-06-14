/**
 * modules/admin-fase0.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo: panel de Fase 0 — asignación de capital inicial por equipo
 *
 * Funciones incluidas:
 *   - loadAdminFase0           → tabla de Fase 0 por equipo
 *   - window.doAsignarCapital  → asignar/editar capital docente + inversión
 *   - window.doHabilitarFase0  → habilitar Fase 0 (crea borrador)
 *
 * Dependencias: api(), fmt (ui-components.js), toast()
 * Reversión: comentar <script src="modules/admin-fase0.js"> en index.html
 * ─────────────────────────────────────────────────────────────────────────────
 */

var FASE0_ESTADOS = {
  sin_datos: { label: 'Sin datos', bg: 'var(--text3)', fg: '#fff' },
  borrador:  { label: 'Borrador',  bg: '#f59e0b',      fg: '#1a1a1a' },
  enviado:   { label: 'Enviado',   bg: '#3b82f6',      fg: '#fff' },
  aprobado:  { label: 'Aprobado',  bg: '#22c55e',      fg: '#0a2a12' },
  cerrado:   { label: 'Cerrado',   bg: '#111827',      fg: '#fff' }
};

function fase0Badge(estado) {
  var cfg = FASE0_ESTADOS[estado] || FASE0_ESTADOS.sin_datos;
  return '<span class="badge" style="background:' + cfg.bg + ';color:' + cfg.fg + '">' + cfg.label + '</span>';
}

async function loadAdminFase0() {
  var el = document.getElementById('adminFase0Content');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>';

  try {
    var registros = await api('GET', '/admin/fase0');
    var cfg = await api('GET', '/admin/config');
    var fase0Activa = cfg.fase0Activa ?? false;

    var toolbar = '<div class="param-actions" style="margin-bottom:14px">'
      + '<button class="btn ' + (fase0Activa ? 'btn-ghost' : 'btn-success') + '" onclick="doActivarFase0()"' + (fase0Activa ? ' disabled' : '') + '>🚀 Activar Fase 0</button>'
      + '<button class="btn ' + (fase0Activa ? 'btn-danger' : 'btn-ghost') + '" onclick="doCerrarFase0()"' + (fase0Activa ? '' : ' disabled') + '>🔒 Cerrar Fase 0</button>'
      + '<span style="margin-left:10px;font-size:.82rem;color:var(--text3)">Estado: ' + (fase0Activa ? '🟢 Activa' : '⚪ Inactiva') + '</span>'
      + '</div>';

    if (!registros || !registros.length) {
      el.innerHTML = toolbar + '<div class="empty-state"><div class="empty-icon">🏗️</div><p>Sin equipos en esta simulación.</p></div>';
      return;
    }

    var rows = registros.map(function(item) {
      var eq = item.equipo;
      var f  = item.fase0;
      var estado = (f && f.estado) ? f.estado : 'sin_datos';
      var caja  = f ? (f.caja_inicial_docente   || 0) : 0;
      var inv   = f ? (f.capital_inversion       || 0) : 0;
      var total = f ? (f.capital_total_otorgado  || 0) : 0;
      var tieneCapital = total > 0 || caja > 0;

      var nombreEsc = (eq.nombre || '').replace(/'/g, "\\'");

      var btnCapital = '<button class="btn btn-sm btn-primary" onclick="doAsignarCapital(\'' + eq.id + '\',\'' + nombreEsc + '\')">'
        + (tieneCapital ? '✏️ Editar' : '💰 Asignar capital') + '</button>';

      var btnHabilitar = (estado === 'sin_datos' || estado === 'borrador')
        ? ' <button class="btn btn-sm btn-ghost" onclick="doHabilitarFase0(\'' + eq.id + '\')">🔓 Habilitar</button>'
        : '';

      return '<tr>'
        + '<td><strong>' + (eq.nombre || eq.id) + '</strong></td>'
        + '<td>' + fase0Badge(estado) + '</td>'
        + '<td class="num">' + (f ? fmt.bs(caja)  : '—') + '</td>'
        + '<td class="num">' + (f ? fmt.bs(inv)   : '—') + '</td>'
        + '<td class="num">' + (f ? fmt.bs(total) : '—') + '</td>'
        + '<td>' + btnCapital + btnHabilitar + '</td>'
        + '</tr>';
    }).join('');

    el.innerHTML = toolbar + '<div class="table-wrap"><table>'
      + '<thead><tr><th>Equipo</th><th>Estado</th><th>Caja Trabajo (Bs)</th>'
      + '<th>Inversión (Bs)</th><th>Total (Bs)</th><th>Acciones</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>';

  } catch(e) {
    el.innerHTML = '<p style="color:var(--accent4);padding:16px">' + e.message + '</p>';
    console.error('[admin-fase0] loadAdminFase0:', e);
  }
}

window.doAsignarCapital = function(equipoId, nombreEquipo) {
  var nombre = (nombreEquipo || equipoId || '');
  var nombreHtml = nombre.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Eliminar modal previo si existiera
  var prev = document.getElementById('fase0CapitalModal');
  if (prev) prev.remove();

  var overlay = document.createElement('div');
  overlay.id = 'fase0CapitalModal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
      '<div class="modal-card">'
    +   '<div class="modal-title">💰 Asignar capital — ' + nombreHtml + '</div>'
    +   '<div class="param-row">'
    +     '<label class="param-label" for="fase0CajaDoc">Capital de trabajo (Bs)</label>'
    +     '<input class="param-input" type="number" step="any" id="fase0CajaDoc" placeholder="0"/>'
    +   '</div>'
    +   '<div class="param-row">'
    +     '<label class="param-label" for="fase0CapInv">Inversión fija + diferida (Bs)</label>'
    +     '<input class="param-input" type="number" step="any" id="fase0CapInv" placeholder="0"/>'
    +   '</div>'
    +   '<div class="param-row" style="justify-content:space-between;align-items:center;margin-top:8px">'
    +     '<span class="param-label">Total capital otorgado</span>'
    +     '<strong id="fase0TotalCalc" style="font-family:var(--font-mono);font-size:1.05rem;color:var(--accent3)">Bs 0</strong>'
    +   '</div>'
    +   '<div class="modal-actions">'
    +     '<button class="btn btn-ghost" id="fase0CancelBtn">Cancelar</button>'
    +     '<button class="btn btn-primary" id="fase0SaveBtn">💾 Guardar</button>'
    +   '</div>'
    + '</div>';
  document.body.appendChild(overlay);

  var cajaEl  = document.getElementById('fase0CajaDoc');
  var invEl   = document.getElementById('fase0CapInv');
  var totalEl = document.getElementById('fase0TotalCalc');

  function recalc() {
    var caja = parseFloat(cajaEl.value) || 0;
    var inv  = parseFloat(invEl.value) || 0;
    var total = caja + inv;
    totalEl.textContent = (typeof fmt !== 'undefined' && fmt.bs) ? fmt.bs(total) : ('Bs ' + total);
  }
  cajaEl.addEventListener('input', recalc);
  invEl.addEventListener('input', recalc);
  recalc();

  function cerrar() {
    var m = document.getElementById('fase0CapitalModal');
    if (m) m.remove();
  }

  document.getElementById('fase0CancelBtn').addEventListener('click', cerrar);
  // Cerrar al hacer click fuera de la tarjeta
  overlay.addEventListener('click', function(ev) { if (ev.target === overlay) cerrar(); });

  document.getElementById('fase0SaveBtn').addEventListener('click', async function() {
    var cajaInicialDocente = Number(cajaEl.value);
    var capitalInversion   = Number(invEl.value);
    if (!Number.isFinite(cajaInicialDocente) || cajaInicialDocente <= 0) {
      toast('La caja de trabajo debe ser un número positivo', 'error');
      return;
    }
    if (!Number.isFinite(capitalInversion) || capitalInversion < 0) {
      toast('El capital de inversión debe ser un número no negativo', 'error');
      return;
    }
    try {
      await api('POST', '/admin/fase0/capital', {
        equipoId: equipoId,
        cajaInicialDocente: cajaInicialDocente,
        capitalInversion: capitalInversion
      });
      cerrar();
      toast('✓ Capital asignado', 'success');
      await loadAdminFase0();
    } catch(e) {
      toast(e.message, 'error');
    }
  });
};

window.doHabilitarFase0 = async function(equipoId) {
  try {
    var resp = await api('POST', '/admin/fase0/habilitar', { equipoId: equipoId });
    toast('✓ Fase 0 habilitada (' + (resp && resp.estado ? resp.estado : 'borrador') + ')', 'success');
    await loadAdminFase0();
  } catch(e) {
    toast(e.message, 'error');
  }
};

window.doActivarFase0 = async function() {
  await api('POST', '/admin/fase0/activar');
  toast('Fase 0 activada');
  loadAdminFase0();
};
window.doCerrarFase0 = async function() {
  if (!confirm('¿Cerrar Fase 0? Los equipos ya no podrán editar.')) return;
  await api('POST', '/admin/fase0/cerrar');
  toast('Fase 0 cerrada');
  loadAdminFase0();
};

// ── Exponer como window.* para setupNav ──────────────────
window.loadAdminFase0 = loadAdminFase0;
console.log('[admin-fase0] ✅ Módulo cargado — loadAdminFase0 activo');
