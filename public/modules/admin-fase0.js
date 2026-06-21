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

// Sección de configuración de niveles AF (solo docente). locked=true cuando Fase 0 está activa.
function buildFase0ConfigHTML(p, locked) {
  var dis = locked ? ' disabled' : '';
  var defaults = [
    { n: 1, nombre: 'Micro',     monto: 25000,  capacidad: 300  },
    { n: 2, nombre: 'Pequeña',   monto: 50000,  capacidad: 600  },
    { n: 3, nombre: 'Estándar',  monto: 100000, capacidad: 800  },
    { n: 4, nombre: 'Mediana',   monto: 190000, capacidad: 1150 },
    { n: 5, nombre: 'Grande',    monto: 260000, capacidad: 1350 },
    { n: 6, nombre: 'Expansiva', monto: 350000, capacidad: 1700 }
  ];
  var filas = defaults.map(function(d) {
    var nombre = (p['fase0_af_' + d.n + '_nombre'] != null) ? p['fase0_af_' + d.n + '_nombre'] : d.nombre;
    var monto  = (p['fase0_af_' + d.n + '_monto']  != null) ? Number(p['fase0_af_' + d.n + '_monto']) : d.monto;
    var capacidad = (p['fase0_af_' + d.n + '_capacidad'] != null) ? Number(p['fase0_af_' + d.n + '_capacidad']) : d.capacidad;
    return '<div class="param-row">'
      + '<label class="param-label">Nivel ' + d.n + '</label>'
      + '<input class="param-input" type="text" data-pkey-str="fase0_af_' + d.n + '_nombre" value="' + nombre + '" style="width:130px"' + dis + '/>'
      + '<input class="param-input" type="number" step="any" data-pkey="fase0_af_' + d.n + '_monto" value="' + monto + '" style="width:120px"' + dis + '/>'
      + '<input class="param-input" type="number" step="any" data-pkey="fase0_af_' + d.n + '_capacidad" value="' + capacidad + '" style="width:100px"' + dis + '/>'
      + '<span class="param-hint">Capacidad</span>'
      + '</div>';
  }).join('');

  return '<div class="section-header" style="margin-bottom:16px">'
    + '<h3>🏗️ Configuración de Niveles de Activos Fijos</h3>'
    + '<p>Define los niveles disponibles antes de activar la Fase 0. Una vez activa, quedan bloqueados.</p>'
    + '</div>'
    + '<div class="param-card" style="margin-bottom:24px">'
    + filas
    + '<div class="param-row"><label class="param-label">Plazos crédito operativo</label>'
    +   '<input class="param-input" type="text" data-pkey-str="fase0_plazos_credito_op" value="' + (p.fase0_plazos_credito_op != null ? p.fase0_plazos_credito_op : '10,20') + '"' + dis + '/>'
    +   '<span class="param-hint">Separados por coma</span></div>'
    + '<div class="param-row"><label class="param-label">Plazos crédito inversión</label>'
    +   '<input class="param-input" type="text" data-pkey-str="fase0_plazos_credito_inv" value="' + (p.fase0_plazos_credito_inv != null ? p.fase0_plazos_credito_inv : '20,40') + '"' + dis + '/>'
    +   '<span class="param-hint">Separados por coma</span></div>'
    + '<div class="param-actions">'
    +   '<button class="btn btn-primary" id="btnGuardarNivelesAF" onclick="doGuardarNivelesAF()"' + dis + '>'
    +     (locked ? '🔒 Bloqueado (Fase 0 activa)' : '💾 Guardar configuración niveles AF') + '</button>'
    + '</div>'
    + '</div>';
}

// Wiring de inputs Fase 0 — capacidad es valor manual independiente por nivel, scoped a #adminFase0Content.
function f0WireNivelesConfig() {
  // Capacidad ya no se deriva de monto×factor — es un valor
  // editable independiente por nivel (fase0_af_N_capacidad).
  // Esta función queda sin recálculo automático.
  document.querySelectorAll('#adminFase0Content [data-pkey^="fase0_af_"]').forEach(function(el) {
    el.addEventListener('input', function() {});
  });
}

window.doGuardarNivelesAF = async function() {
  var parametros = {};
  document.querySelectorAll('#adminFase0Content [data-pkey]').forEach(function(el) { parametros[el.dataset.pkey] = +el.value; });
  document.querySelectorAll('#adminFase0Content [data-pkey-str]').forEach(function(el) { parametros[el.dataset.pkeyStr] = el.value; });
  try {
    await api('PUT', '/admin/parametros', { parametros: parametros });
    toast('✓ Configuración de niveles AF guardada', 'success');
    loadAdminFase0();
  } catch(e) {
    toast(e.message, 'error');
  }
};

async function loadAdminFase0() {
  var el = document.getElementById('adminFase0Content');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>';

  try {
    var registros = await api('GET', '/admin/fase0');
    var cfg = await api('GET', '/admin/config');
    var fase0Activa = cfg.fase0Activa ?? false;
    var modoInicio = cfg.modoInicio || 'fase0';

    if (modoInicio === 'homogeneo') {
      el.innerHTML = '<div class="section-header">'
        + '<h3>⚙️ Modo Homogéneo</h3>'
        + '<p>Esta simulación usa condiciones iguales para todos los equipos. '
        + 'La Fase 0 no está disponible.</p>'
        + '</div>'
        + '<div class="param-card" style="margin-top:16px">'
        + '<div class="param-row"><span class="param-label">Modo de inicio</span>'
        + '<strong>Homogéneo — todos los equipos arrancan con los mismos parámetros</strong></div>'
        + '<div class="param-row"><span class="param-label">Fase 0</span>'
        + '<strong style="color:var(--text3)">No disponible en este modo</strong></div>'
        + '</div>';
      return;
    }

    var configNiveles = buildFase0ConfigHTML(cfg.parametros || {}, fase0Activa === true);

    var toolbar = '<div class="param-actions" style="margin-bottom:14px">'
      + '<button class="btn ' + (fase0Activa ? 'btn-ghost' : 'btn-success') + '" onclick="doActivarFase0()"' + (fase0Activa ? ' disabled' : '') + '>🚀 Activar Fase 0</button>'
      + '<button class="btn ' + (fase0Activa ? 'btn-danger' : 'btn-ghost') + '" onclick="doCerrarFase0()"' + (fase0Activa ? '' : ' disabled') + '>🔒 Cerrar Fase 0</button>'
      + '<span style="margin-left:10px;font-size:.82rem;color:var(--text3)">Estado: ' + (fase0Activa ? '🟢 Activa' : '⚪ Inactiva') + '</span>'
      + '</div>';

    if (!registros || !registros.length) {
      el.innerHTML = toolbar + configNiveles + '<div class="empty-state"><div class="empty-icon">🏗️</div><p>Sin equipos en esta simulación.</p></div>';
      f0WireNivelesConfig();
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
      var credOp  = f ? (f.credito_operativo_pre_r1  || 0) : 0;
      var credInv = f ? (f.credito_inversion_pre_r1  || 0) : 0;
      var tieneCredito = credOp > 0 || credInv > 0;
      var costoFijoMin = f ? (f.costo_fijo_minimo || 0) : 0;

      var nombreEsc = (eq.nombre || '').replace(/'/g, "\\'");

      var btnCapital = '<button class="btn btn-sm btn-primary" onclick="doAsignarCapital(\'' + eq.id + '\',\'' + nombreEsc + '\')">'
        + (tieneCapital ? '✏️ Editar' : '💰 Asignar capital') + '</button>';

      var btnHabilitar = (estado === 'sin_datos' || estado === 'borrador')
        ? ' <button class="btn btn-sm btn-ghost" onclick="doHabilitarFase0(\'' + eq.id + '\')">🔓 Habilitar</button>'
        : '';

      var btnCredito = tieneCredito
        ? ' <button class="btn btn-sm btn-success" onclick="doAprobarCredito(\''
          + eq.id + '\',\'' + nombreEsc + '\',' + credOp + ',' + credInv + ')">✅ Crédito</button>'
        : '';

      var btnCostoFijo = ' <button class="btn btn-sm btn-ghost" onclick="doAsignarCostoFijo(\'' + eq.id + '\',\'' + nombreEsc + '\')">'
        + (costoFijoMin > 0 ? '✏️ Editar mín.' : '💰 Costo fijo') + '</button>';

      return '<tr>'
        + '<td><strong>' + (eq.nombre || eq.id) + '</strong></td>'
        + '<td>' + fase0Badge(estado) + '</td>'
        + '<td class="num">' + (f ? fmt.bs(caja)  : '—') + '</td>'
        + '<td class="num">' + (f ? fmt.bs(inv)   : '—') + '</td>'
        + '<td class="num">' + (f ? fmt.bs(total) : '—') + '</td>'
        + '<td class="num">' + (credOp  > 0 ? fmt.bs(credOp)  : '—') + '</td>'
        + '<td class="num">' + (credInv > 0 ? fmt.bs(credInv) : '—') + '</td>'
        + '<td class="num">' + (costoFijoMin > 0 ? fmt.bs(costoFijoMin) : '—') + '</td>'
        + '<td>' + btnCapital + btnHabilitar + btnCredito + btnCostoFijo + '</td>'
        + '</tr>';
    }).join('');

    el.innerHTML = toolbar + configNiveles
      + '<div class="section-header" style="margin-bottom:16px;margin-top:24px">'
      + '<h3>🏢 Estado de Fase 0 por Equipo</h3>'
      + '<p>Asigna capital a cada equipo y habilita su acceso a la hoja de Fase 0.</p>'
      + '</div>'
      + '<div class="param-card" style="margin-bottom:24px"><div class="table-wrap"><table>'
      + '<thead><tr><th>Equipo</th><th>Estado</th><th>Caja Trabajo (Bs)</th>'
      + '<th>Inversión (Bs)</th><th>Total (Bs)</th>'
      + '<th>Créd. Op<br>(Bs)</th><th>Créd. Inv<br>(Bs)</th>'
      + '<th>Costo Fijo<br>Mín. (Bs)</th>'
      + '<th>Acciones</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div></div>';
    f0WireNivelesConfig();

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

window.doAsignarCostoFijo = function(equipoId, nombreEquipo) {
  var nombreEsc = String(nombreEquipo || '').replace(/</g, '&lt;');
  var existente = document.getElementById('fase0CostoFijoModal');
  if (existente) existente.remove();

  var modal = document.createElement('div');
  modal.id = 'fase0CostoFijoModal';
  modal.className = 'modal-overlay';
  modal.innerHTML =
    '<div class="modal-card" style="max-width:420px">'
    + '<h3>💰 Costo Fijo Mínimo — ' + nombreEsc + '</h3>'
    + '<p class="param-hint" style="margin-bottom:16px">Monto mínimo (Bs/trimestre) que el equipo debe declarar para alquiler, servicios básicos y mantenimiento — basado en su plan de negocio real.</p>'
    + '<div class="param-row"><label class="param-label">Costo Fijo Mínimo (Bs)</label>'
    + '<input class="param-input" type="number" step="any" id="fase0CostoFijoMin" placeholder="0" style="width:140px"/></div>'
    + '<div class="modal-actions" style="margin-top:20px">'
    + '<button class="btn-secondary" id="fase0CostoFijoCancelBtn">Cancelar</button>'
    + '<button class="btn-primary" id="fase0CostoFijoSaveBtn">Guardar</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);

  var minEl = document.getElementById('fase0CostoFijoMin');

  function cerrar() { modal.remove(); }
  document.getElementById('fase0CostoFijoCancelBtn').addEventListener('click', cerrar);
  modal.addEventListener('click', function(e) { if (e.target === modal) cerrar(); });

  document.getElementById('fase0CostoFijoSaveBtn').addEventListener('click', async function() {
    var costoFijoMinimo = Number(minEl.value);
    if (!Number.isFinite(costoFijoMinimo) || costoFijoMinimo < 0) {
      toast('El costo fijo mínimo debe ser un número no negativo', 'error');
      return;
    }
    try {
      await api('POST', '/admin/fase0/costo-fijo', {
        equipoId: equipoId,
        costoFijoMinimo: costoFijoMinimo
      });
      cerrar();
      toast('✓ Costo fijo mínimo asignado', 'success');
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
  try {
    await api('POST', '/admin/fase0/cerrar');
    toast('Fase 0 cerrada', 'success');
    loadAdminFase0();
  } catch(e) {
    toast(e.message || 'Error al cerrar Fase 0', 'error');
  }
};

window.doAprobarCredito = function(equipoId, nombreEquipo, credOpSolicitado, credInvSolicitado) {
  var nombre = (nombreEquipo || equipoId || '');
  var nombreHtml = nombre.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  var prev = document.getElementById('fase0CreditoModal');
  if (prev) prev.remove();

  var overlay = document.createElement('div');
  overlay.id = 'fase0CreditoModal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
      '<div class="modal-card">'
    +   '<div class="modal-title">✅ Aprobar crédito — ' + nombreHtml + '</div>'
    +   '<p style="font-size:.8rem;color:var(--text3);margin:0 0 12px">Montos solicitados por el equipo. Ajústalos si es necesario antes de aprobar.</p>'
    +   '<div class="param-row">'
    +     '<label class="param-label" for="fase0CredOp">Crédito operativo (Bs)</label>'
    +     '<input class="param-input" type="number" step="any" id="fase0CredOp" value="' + (Number(credOpSolicitado) || 0) + '"/>'
    +   '</div>'
    +   '<div class="param-row">'
    +     '<label class="param-label" for="fase0CredInv">Crédito inversión (Bs)</label>'
    +     '<input class="param-input" type="number" step="any" id="fase0CredInv" value="' + (Number(credInvSolicitado) || 0) + '"/>'
    +   '</div>'
    +   '<div class="modal-actions">'
    +     '<button class="btn btn-ghost" id="fase0CredCancelBtn">Cancelar</button>'
    +     '<button class="btn btn-success" id="fase0CredSaveBtn">✅ Aprobar</button>'
    +   '</div>'
    + '</div>';
  document.body.appendChild(overlay);

  function cerrar() {
    var m = document.getElementById('fase0CreditoModal');
    if (m) m.remove();
  }
  document.getElementById('fase0CredCancelBtn').addEventListener('click', cerrar);
  overlay.addEventListener('click', function(ev) { if (ev.target === overlay) cerrar(); });

  document.getElementById('fase0CredSaveBtn').addEventListener('click', async function() {
    var credOp  = Number(document.getElementById('fase0CredOp').value);
    var credInv = Number(document.getElementById('fase0CredInv').value);
    if (!Number.isFinite(credOp) || credOp < 0) { toast('El crédito operativo debe ser un número no negativo', 'error'); return; }
    if (!Number.isFinite(credInv) || credInv < 0) { toast('El crédito inversión debe ser un número no negativo', 'error'); return; }
    try {
      await api('POST', '/admin/fase0/credito', {
        equipoId: equipoId,
        creditoOperativo: credOp,
        creditoInversion: credInv
      });
      cerrar();
      toast('✓ Crédito aprobado', 'success');
      loadAdminFase0();
    } catch(e) {
      toast(e.message, 'error');
    }
  });
};

// ── Exponer como window.* para setupNav ──────────────────
window.loadAdminFase0 = loadAdminFase0;
console.log('[admin-fase0] ✅ Módulo cargado — loadAdminFase0 activo');
