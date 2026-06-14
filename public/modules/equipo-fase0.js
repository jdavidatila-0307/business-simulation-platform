/**
 * modules/equipo-fase0.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo: Fase 0 del equipo — configuración inicial antes de la R1
 *
 * Funciones incluidas:
 *   - loadEquipoFase0           → carga y renderiza la vista (activa / solo-lectura / formulario)
 *   - window.loadEquipoFase0    → expuesta para setupNav
 *
 * Dependencias: api(), fmt (ui-components.js), state, toast
 * Reversión: comentar <script src="modules/equipo-fase0.js"> en index.html
 *
 * NOTA: los niveles AF (fase0_af_N_*) NO viajan hoy en state.ref.parametros
 *       (el referencia de /api/decisiones expone un subconjunto). Se leen de
 *       state.ref.parametros si existen; si no, se usan defaults del admin.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Helpers de formato/lectura ──────────────────────────────────────────────
function f0bs(n)            { return (typeof fmt !== 'undefined' && fmt.bs) ? fmt.bs(n) : ('Bs ' + (Number(n) || 0)); }
function f0val(id)          { var e = document.getElementById(id); return e ? e.value : ''; }
function f0setText(id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; }

// Niveles de activos fijos — desde parámetros si están, si no defaults del admin
function f0Niveles(p) {
  p = p || {};
  var defaults = [
    { n: 1, nombre: 'Taller',   monto: 40000  },
    { n: 2, nombre: 'Pequeña',  monto: 60000  },
    { n: 3, nombre: 'Estándar', monto: 80000  },
    { n: 4, nombre: 'Mediana',  monto: 120000 },
    { n: 5, nombre: 'Grande',   monto: 160000 }
  ];
  var factor = (p.fase0_factor_capacidad != null) ? Number(p.fase0_factor_capacidad) : 0.01875;
  return defaults.map(function(d) {
    var nombre = (p['fase0_af_' + d.n + '_nombre'] != null) ? p['fase0_af_' + d.n + '_nombre'] : d.nombre;
    var monto  = (p['fase0_af_' + d.n + '_monto']  != null) ? Number(p['fase0_af_' + d.n + '_monto']) : d.monto;
    return { n: d.n, nombre: nombre, monto: monto || 0, capacidad: Math.round((monto || 0) * factor) };
  });
}

// ── Carga principal ─────────────────────────────────────────────────────────
async function loadEquipoFase0() {
  var el = document.getElementById('eqFase0Content');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>';

  try {
    var resp = await api('GET', '/api/fase0');
    var fase0Activa = resp.fase0Activa;
    var registro = resp.registro || null;
    var fase0Params = resp.fase0Params || {};

    if (!fase0Activa) {
      el.innerHTML = f0MensajeBox('⏸', 'Fase 0 no está activa aún',
        'Espera instrucciones del profesor.');
      return;
    }

    if (registro && (registro.estado === 'enviado' || registro.estado === 'cerrado')) {
      el.innerHTML = f0RenderReadOnly(registro);
      return;
    }

    var ref = state.ref;
    if (!ref) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div>'
        + '<p>Datos de referencia no cargados. '
        + '<button class="btn btn-ghost btn-sm" onclick="location.reload()">Recargar</button></p></div>';
      return;
    }

    el.innerHTML = f0RenderForm(registro || {}, ref, fase0Params);
    f0WireForm(registro || {});

  } catch (e) {
    el.innerHTML = '<p style="color:var(--accent4);padding:16px">' + e.message + '</p>';
    console.error('[equipo-fase0] loadEquipoFase0:', e);
  }
}

function f0MensajeBox(icono, titulo, texto) {
  return '<div class="empty-state" style="padding:48px 20px;text-align:center">'
    + '<div style="font-size:2.6rem;margin-bottom:12px">' + icono + '</div>'
    + '<h3 style="margin-bottom:8px">' + titulo + '</h3>'
    + '<p style="color:var(--text3);font-size:.9rem">' + texto + '</p></div>';
}

// ── Vista de solo lectura (estado enviado / cerrado) ────────────────────────
function f0RenderReadOnly(r) {
  var fila = function(label, val) {
    return '<div class="param-row"><span class="param-label">' + label + '</span>'
      + '<strong>' + (val !== null && val !== undefined && val !== '' ? val : '—') + '</strong></div>';
  };
  return '<div class="param-card" style="max-width:560px">'
    + '<div class="param-card-title">🔒 Fase 0 enviada — solo lectura</div>'
    + '<p style="font-size:.82rem;color:var(--text3);margin:0 0 12px">'
    + 'Tu configuración inicial ya fue enviada al profesor y no puede modificarse.</p>'
    + fila('Segmento objetivo', r.segmento_1)
    + fila('Producto', r.producto_1)
    + fila('Nivel de planta', r.nivel_af)
    + fila('Activos fijos comprados', f0bs(r.activos_fijos_comprados))
    + fila('Capacidad de producción', r.capacidad_produccion_base)
    + fila('Operarios iniciales', r.operarios_iniciales)
    + fila('Costo / operario', f0bs(r.costo_operario))
    + fila('Sueldo / vendedor', f0bs(r.sueldo_vendedor))
    + fila('Crédito operativo', f0bs(r.credito_operativo_pre_r1))
    + fila('Crédito inversión', f0bs(r.credito_inversion_pre_r1))
    + fila('Capital total otorgado', f0bs(r.capital_total_otorgado))
    + '</div>';
}

// ── Formulario completo ─────────────────────────────────────────────────────
function f0RenderForm(reg, ref, p) {
  var niveles = f0Niveles(p);

  var segOpts = '<option value="">-- Seleccionar segmento --</option>'
    + ref.segmentos.map(function (s) {
        return '<option ' + (s.nombre === reg.segmento_1 ? 'selected' : '') + '>' + s.nombre + '</option>';
      }).join('');

  var prodOpts = '<option value="">-- Seleccionar producto --</option>'
    + ref.tiposProducto.map(function (t) {
        return '<option ' + (t.nombre === reg.producto_1 ? 'selected' : '') + '>' + t.nombre + ' (Bs ' + t.costoBase + ')</option>';
      }).join('');

  var nivelRadios = niveles.map(function (nv) {
    var checked = (Number(reg.nivel_af) === nv.n) ? 'checked' : '';
    return '<label class="param-row" style="cursor:pointer;gap:10px;align-items:center">'
      + '<input type="radio" name="f0_nivel" value="' + nv.n + '" data-monto="' + nv.monto + '" data-cap="' + nv.capacidad + '" ' + checked + '/>'
      + '<strong style="min-width:90px">' + nv.nombre + '</strong>'
      + '<span style="font-family:var(--font-mono)">' + f0bs(nv.monto) + '</span>'
      + '<span style="color:var(--text3);font-size:.8rem">Cap: ' + nv.capacidad + ' u</span>'
      + '</label>';
  }).join('');

  var numInput = function (id, value, min) {
    return '<input class="param-input" type="number" step="any" id="' + id + '"'
      + (min != null ? ' min="' + min + '"' : '') + ' value="' + (value != null ? value : '') + '"/>';
  };

  return ''
    // ── SECCIÓN 1 — Estrategia ──
    + '<div class="param-card">'
    +   '<div class="param-card-title">🎯 Estrategia <span style="font-size:.72rem;color:#f59e0b;font-weight:400">🔒 Se bloquea durante R1–R4</span></div>'
    +   '<div class="param-row"><label class="param-label" for="f0_segmento_1">Segmento objetivo</label>'
    +     '<select class="param-input" id="f0_segmento_1">' + segOpts + '</select></div>'
    +   '<div class="param-row"><label class="param-label" for="f0_producto_1">Producto</label>'
    +     '<select class="param-input" id="f0_producto_1">' + prodOpts + '</select></div>'
    + '</div>'
    // ── SECCIÓN 2 — Tamaño de operación ──
    + '<div class="param-card">'
    +   '<div class="param-card-title">🏗️ Tamaño de operación</div>'
    +   '<p style="font-size:.8rem;color:var(--text3);margin:0 0 10px">Elige el nivel de planta (activos fijos). Determina tu capacidad de producción.</p>'
    +   nivelRadios
    + '</div>'
    // ── SECCIÓN 3 — Personal ──
    + '<div class="param-card">'
    +   '<div class="param-card-title">👷 Personal</div>'
    +   '<p style="font-size:.8rem;color:#f59e0b;margin:0 0 10px">⚠ Estos valores NUNCA pueden bajar en rondas posteriores.</p>'
    +   '<div class="param-row"><label class="param-label" for="f0_operarios_iniciales">Operarios iniciales</label>'
    +     numInput('f0_operarios_iniciales', reg.operarios_iniciales, 1) + '</div>'
    +   '<div class="param-row"><label class="param-label" for="f0_costo_operario">Costo / operario (Bs/trim)</label>'
    +     numInput('f0_costo_operario', reg.costo_operario, 0) + '</div>'
    +   '<div class="param-row"><label class="param-label" for="f0_sueldo_vendedor">Sueldo / vendedor (Bs/trim)</label>'
    +     numInput('f0_sueldo_vendedor', reg.sueldo_vendedor, 0) + '</div>'
    + '</div>'
    // ── SECCIÓN 4 — Financiamiento ──
    + '<div class="param-card">'
    +   '<div class="param-card-title">🏦 Financiamiento pre-R1</div>'
    +   '<div class="param-row"><label class="param-label" for="f0_credito_operativo">Crédito operativo (Bs)</label>'
    +     numInput('f0_credito_operativo', reg.credito_operativo_pre_r1, 0) + '</div>'
    +   '<div class="param-row"><label class="param-label" for="f0_credito_inversion">Crédito inversión (Bs)</label>'
    +     numInput('f0_credito_inversion', reg.credito_inversion_pre_r1, 0) + '</div>'
    + '</div>'
    // ── CALCULADORA ──
    + '<div class="param-card" style="background:var(--bg2)">'
    +   '<div class="param-card-title">🧮 Calculadora de caja R1</div>'
    +   '<div class="param-row"><span class="param-label">Capital de trabajo (docente)</span><strong id="f0_calc_trabajo">Bs 0</strong></div>'
    +   '<div class="param-row"><span class="param-label">Inversión disponible (docente)</span><strong id="f0_calc_inversion">Bs 0</strong></div>'
    +   '<div class="param-row"><span class="param-label">(−) Planta elegida</span><strong id="f0_calc_planta">Bs 0</strong></div>'
    +   '<div class="param-row" style="border-top:1px solid var(--border2);padding-top:8px">'
    +     '<span class="param-label">= Caja disponible R1</span>'
    +     '<strong><span id="f0_calc_semaforo">🟢</span> <span id="f0_calc_caja" style="font-family:var(--font-mono)">Bs 0</span></strong></div>'
    +   '<div class="param-row"><span class="param-label">Costos fijos estimados R1</span><strong id="f0_calc_fijos">Bs 0</strong></div>'
    +   '<div class="param-card-title" style="margin-top:14px;font-size:.9rem">📊 Balance inicial proyectado</div>'
    +   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'
    +     '<div>'
    +       '<div style="font-size:.78rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Activos</div>'
    +       '<div class="param-row"><span class="param-label">Caja</span><strong id="f0_bal_caja">Bs 0</strong></div>'
    +       '<div class="param-row"><span class="param-label">Activos Fijos</span><strong id="f0_bal_af">Bs 0</strong></div>'
    +       '<div class="param-row" style="border-top:1px solid var(--border2);padding-top:6px"><span class="param-label">Total Activos</span><strong id="f0_bal_total_activos">Bs 0</strong></div>'
    +     '</div>'
    +     '<div>'
    +       '<div style="font-size:.78rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Pasivos + Patrimonio</div>'
    +       '<div class="param-row"><span class="param-label">Préstamo operativo</span><strong id="f0_bal_deuda_op">Bs 0</strong></div>'
    +       '<div class="param-row"><span class="param-label">Préstamo inversión</span><strong id="f0_bal_deuda_inv">Bs 0</strong></div>'
    +       '<div class="param-row"><span class="param-label">Total Pasivos</span><strong id="f0_bal_total_pasivos">Bs 0</strong></div>'
    +       '<div class="param-row" style="border-top:1px solid var(--border2);padding-top:6px"><span class="param-label">Capital / Patrimonio</span><strong id="f0_bal_capital">Bs 0</strong></div>'
    +     '</div>'
    +   '</div>'
    +   '<div class="param-row" style="margin-top:8px"><span class="param-label">Verificación A = P + Pat</span><strong id="f0_bal_cuadre">—</strong></div>'
    + '</div>'
    // ── BOTONES ──
    + '<div class="param-actions">'
    +   '<button class="btn btn-ghost" id="f0BtnGuardar">💾 Guardar borrador</button>'
    +   '<button class="btn btn-success" id="f0BtnEnviar">✅ Enviar</button>'
    + '</div>';
}

// ── Cableado de listeners + calculadora en tiempo real ──────────────────────
function f0WireForm(reg) {
  var cajaDoc = Number(reg.caja_inicial_docente) || 0;
  var invDoc  = Number(reg.capital_inversion)   || 0;

  function recalc() {
    var sel = document.querySelector('input[name="f0_nivel"]:checked');
    var planta  = sel ? (Number(sel.dataset.monto) || 0) : 0;
    var oper    = Number(f0val('f0_operarios_iniciales')) || 0;
    var costoOp = Number(f0val('f0_costo_operario'))      || 0;
    var sueldoV = Number(f0val('f0_sueldo_vendedor'))     || 0;

    var cajaR1 = cajaDoc + (invDoc - planta);
    var fijos  = oper * costoOp + sueldoV;

    f0setText('f0_calc_trabajo',   f0bs(cajaDoc));
    f0setText('f0_calc_inversion', f0bs(invDoc));
    f0setText('f0_calc_planta',    f0bs(planta));
    f0setText('f0_calc_caja',      f0bs(cajaR1));
    f0setText('f0_calc_fijos',     f0bs(fijos));
    f0setText('f0_calc_semaforo',  cajaR1 < 0 ? '🔴' : (cajaR1 < fijos ? '🟡' : '🟢'));

    // ── Balance inicial proyectado ──
    var credOp  = Number(f0val('f0_credito_operativo')) || 0;
    var credInv = Number(f0val('f0_credito_inversion')) || 0;
    var caja          = cajaDoc + invDoc - planta + credOp + credInv;
    var af            = planta;
    var totalActivos  = caja + af;
    var totalPasivos  = credOp + credInv;
    var capital       = cajaDoc + invDoc;
    var totalPP       = totalPasivos + capital;
    var cuadra        = Math.abs(totalActivos - totalPP) <= 1;

    f0setText('f0_bal_caja',           f0bs(caja));
    f0setText('f0_bal_af',             f0bs(af));
    f0setText('f0_bal_total_activos',  f0bs(totalActivos));
    f0setText('f0_bal_deuda_op',       f0bs(credOp));
    f0setText('f0_bal_deuda_inv',      f0bs(credInv));
    f0setText('f0_bal_total_pasivos',  f0bs(totalPasivos));
    f0setText('f0_bal_capital',        f0bs(capital));
    f0setText('f0_bal_cuadre',         cuadra ? '✅ Cuadra' : '⚠️ No cuadra (Δ ' + f0bs(totalActivos - totalPP) + ')');
  }

  document.querySelectorAll('#eqFase0Content input, #eqFase0Content select').forEach(function (elx) {
    elx.addEventListener('input', recalc);
    elx.addEventListener('change', recalc);
  });
  document.getElementById('f0BtnGuardar').addEventListener('click', function () { f0Guardar(); });
  document.getElementById('f0BtnEnviar').addEventListener('click', function () { f0Enviar(); });
  recalc();
}

function f0Collect() {
  var sel = document.querySelector('input[name="f0_nivel"]:checked');
  var data = {
    segmento_1: f0val('f0_segmento_1'),
    producto_1: f0val('f0_producto_1'),
    operarios_iniciales: Number(f0val('f0_operarios_iniciales')) || 0,
    costo_operario: Number(f0val('f0_costo_operario')) || 0,
    sueldo_vendedor: Number(f0val('f0_sueldo_vendedor')) || 0,
    credito_operativo_pre_r1: Number(f0val('f0_credito_operativo')) || 0,
    credito_inversion_pre_r1: Number(f0val('f0_credito_inversion')) || 0
  };
  if (sel) {
    data.nivel_af = Number(sel.value);
    data.activos_fijos_comprados = Number(sel.dataset.monto) || 0;
    data.capacidad_produccion_base = Number(sel.dataset.cap) || 0;
  }
  return data;
}

async function f0Guardar() {
  try {
    await api('POST', '/api/fase0/guardar', f0Collect());
    toast('✓ Borrador guardado', 'success');
    await loadEquipoFase0();
  } catch (e) { toast(e.message, 'error'); }
}

async function f0Enviar() {
  if (!confirm('¿Enviar tu Fase 0? Una vez enviada no podrás modificarla.')) return;
  try {
    // Persistir lo escrito antes de validar el envío en el server.
    await api('POST', '/api/fase0/guardar', f0Collect());
    await api('POST', '/api/fase0/enviar', {});
    toast('✓ Fase 0 enviada', 'success');
    await loadEquipoFase0();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Exponer como window.* para setupNav ──────────────────
window.loadEquipoFase0 = loadEquipoFase0;
console.log('[equipo-fase0] ✅ Módulo cargado — loadEquipoFase0 activo');
