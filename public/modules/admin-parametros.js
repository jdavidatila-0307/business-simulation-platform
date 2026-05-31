/**
 * modules/admin-parametros.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo: parámetros, segmentos, afinidad y competencia
 * Fase 1 — Día 4 del plan de modularización
 *
 * Funciones incluidas:
 *   - loadAdminParametros, saveParametros, cambiarCodigoAcceso
 *   - loadAdminSegmentos, renderSegmentosEditor, saveSegmentos
 *   - loadAdminAfinidad, renderAfinidadEditor
 *   - loadAdminCompetencia, renderCompetenciaEditor
 *   - window.eliminarCompetidor
 *
 * Dependencias: api(), fmt (ui-components.js), state, toast
 * Reversión: comentar <script src="modules/admin-parametros.js"> en index.html
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Parámetros ────────────────────────────────────────────────────────────────
async function loadAdminParametros() {
  if (typeof requireSimSelected === 'function' && !requireSimSelected('adminParametrosContent')) return;
  var data = await api('GET', '/admin/config');
  var p  = data.parametros;
  var tp = data.tiposProducto;
  var can = data.canales;

  var pf = function(label, key, hint, step) {
    hint = hint || '';
    step = step || 'any';
    return '<div class="param-row">'
      + '<label class="param-label">' + label + '</label>'
      + '<input class="param-input" type="number" step="' + step + '" data-pkey="' + key + '" value="' + (p[key] != null ? p[key] : '') + '"/>'
      + (hint ? '<span class="param-hint">' + hint + '</span>' : '')
      + '</div>';
  };

  var modulosHTML = [
    { id:'modMateriaPrima',   label:'🏭 Materia Prima',         desc:'Compra de MP, proveedores, lead time, restricción de producción', etapa:'3.1' },
    { id:'modOperarios',      label:'👷 Operarios',             desc:'Contratación, despido, capacitación y capacidad efectiva',        etapa:'3.2' },
    { id:'modIVA',            label:'🧾 IVA (13%)',             desc:'Débito, crédito fiscal y pago neto de IVA en el P&L',            etapa:'3.3' },
    { id:'modImpuestos',      label:'📊 IT + IUE',             desc:'Impuesto a las Transacciones (3%) e IUE (25%) anual',           etapa:'3.4' },
    { id:'modBrandEquity',    label:'⭐ Brand Equity',          desc:'Acumulación de reputación de marca entre rondas',               etapa:'2.1' },
    { id:'modCanibalizacion', label:'🔀 Canibalización',        desc:'Penalización al atractivo cuando la empresa compite en N segmentos', etapa:'2.3' },
    { id:'modDemandaDin',     label:'📈 Demanda Dinámica',      desc:'Crecimiento/decrecimiento de mercado por tendencia de segmento', etapa:'2.2' },
    { id:'modInnovacion',     label:'💡 Innovación',            desc:'Inversión en producto, proceso o canal para mejorar posición',  etapa:'base' },
    { id:'modInvestigacion',  label:'🔍 Investigación Mercado', desc:'Compra de reportes básicos y premium de inteligencia',         etapa:'base' },
  ].map(function(mod) {
    var checked = p['modulos_' + mod.id] !== 0 ? 'checked' : '';
    return '<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--bg2);border-radius:var(--r);border:1px solid var(--border2);cursor:pointer">'
      + '<input type="checkbox" data-modulo="' + mod.id + '" ' + checked + ' style="width:16px;height:16px;margin-top:2px;accent-color:var(--accent);flex-shrink:0"/>'
      + '<div><div style="font-weight:600;font-size:.85rem;color:var(--text1)">' + mod.label
      + '<span style="font-size:.7rem;color:var(--text3);font-weight:400;margin-left:4px">Etapa ' + mod.etapa + '</span></div>'
      + '<div style="font-size:.75rem;color:var(--text3);margin-top:2px">' + mod.desc + '</div></div>'
      + '</label>';
  }).join('');

  var canalesRows = Object.entries(can).map(function(entry) {
    var n = entry[0]; var v = entry[1];
    return '<tr><td><strong>' + n + '</strong></td>'
      + '<td><input class="param-input" type="number" step="0.01" data-canal="' + n + '" data-canal-field="costoAdicionalUnitario" value="' + v.costoAdicionalUnitario + '" style="width:90px"/></td>'
      + '<td><input class="param-input" type="number" step="0.01" data-canal="' + n + '" data-canal-field="comisionPct" value="' + v.comisionPct + '" style="width:90px"/></td>'
      + '<td><input class="param-input" type="number" step="0.01" data-canal="' + n + '" data-canal-field="factorImpactoVendedores" value="' + v.factorImpactoVendedores + '" style="width:90px"/></td>'
      + '<td><input class="param-input" type="number" step="0.1"  data-canal="' + n + '" data-canal-field="bonoAtractivo" value="' + v.bonoAtractivo + '" style="width:90px"/></td>'
      + '</tr>';
  }).join('');

  var productosRows = Object.entries(tp).map(function(entry) {
    var n = entry[0]; var v = entry[1];
    return '<div class="param-row"><label class="param-label">' + n + '</label>'
      + '<input class="param-input" type="number" step="0.01" data-tp="' + n + '" value="' + v.costoBase + '"/></div>';
  }).join('');

  document.getElementById('adminParametrosContent').innerHTML =
    '<div class="param-grid">'
    + '<div class="param-card"><div class="param-card-title">💼 Capital Inicial por Equipo</div>'
    + pf('Capital inicial (Bs)','capitalInicial') + pf('Caja inicial (Bs)','cajaInicial')
    + pf('Activos fijos iniciales (Bs)','activosFijosIniciales') + pf('Inventario inicial (unid)','inventarioInicialUnid','0 = sin stock')
    + pf('CxC inicial (Bs)','cxcInicial') + pf('Deuda inicial (Bs)','deudaInicial')
    + pf('Capacidad máx producción (unid)','capacidadMaxProduccion') + '</div>'

    + '<div class="param-card"><div class="param-card-title">🏭 Costos Fijos Operativos</div>'
    + pf('Gasto administrativo fijo (Bs)','gastoAdminFijo','Por trimestre') + pf('Gasto fijo de planta (Bs)','gastoFijoPlanta','Por trimestre')
    + pf('Depreciación trimestral (Bs)','depreciacionTrimestral') + pf('Costo almacenamiento / unid (Bs)','costoAlmacenamientoUnidad','Bs/unid final') + '</div>'

    + '<div class="param-card"><div class="param-card-title">💳 Ventas y Cobranzas</div>'
    + pf('% Ventas al contado','pctVentasContado','0.70 = 70%') + pf('% Ventas a crédito','pctVentasCredito','0.30 = 30%')
    + pf('Plazo cobro (trimestres)','plazoCobro','1 = siguiente trimestre','1') + '</div>'

    + '<div class="param-card"><div class="param-card-title">🏦 Financiamiento</div>'
    + pf('Tasa préstamo operativo (trim.)','tasaPrestamoOperativo','0.04 = 4%') + pf('Tasa préstamo inversión (trim.)','tasaPrestamoInversion','0.03 = 3%')
    + pf('Tasa sobregiro (trim.)','tasaSobregiro','0.06 = 6%') + pf('Comisión apertura préstamo','comisionAperturaPrestamo','0.01 = 1%')
    + pf('Plazo préstamo operativo (trim.)','plazoPrestamoOperativo','','1') + pf('Plazo préstamo inversión (trim.)','plazoPrestamoInversion','','1') + '</div>'

    + '<div class="param-card"><div class="param-card-title">👥 Fuerza de Ventas</div>'
    + pf('Vendedores iniciales por equipo','vendedoresIniciales','','1') + pf('Sueldo trimestral / vendedor (Bs)','sueldoTrimestralVendedor')
    + pf('Costo contratación / vendedor (Bs)','costoContratacionVendedor') + pf('Costo despido / vendedor (Bs)','costoDespidoVendedor') + '</div>'

    + '<div class="param-card"><div class="param-card-title">🔍 Investigación de Mercado</div>'
    + pf('Reporte Básico (Bs)','costoInvestigacionBasica') + pf('Reporte Premium (Bs)','costoInvestigacionPremium')
    + pf('Reporte Estratégico (Bs)','costoInvestigacionEstrategico') + pf('% Materia Prima del costoBase (ej. 0.40 = 40%)','pctMateriaPrima') + '</div>'

    + '<div class="param-card"><div class="param-card-title">💡 Innovación</div>'
    + pf('Factor innovación Producto','factorInnovacionProducto','0.333 = 1/3 del monto/unid') + pf('Factor innovación Proceso','factorInnovacionProceso','0.333 = reducción de CU') + '</div>'

    + '<div class="param-card"><div class="param-card-title">🧾 Sistema Tributario Bolivia</div>'
    + pf('IVA (tasa)','tasaIVA','0.13 = 13%') + pf('IT — Impuesto a las Transacciones (tasa)','tasaIT','0.03 = 3% sobre ventas brutas')
    + pf('IUE — Impuesto s/Utilidades (tasa)','tasaIUE','0.25 = 25% sobre utilidad gravable') + pf('Períodos para pago IUE (trimestres)','periodosIUE','4 = pago anual')
    + pf('λ Logit — Sensibilidad competitiva','lambdaLogit','1.0 = neutro') + pf('Coef. Precio (sensibilidad al precio en Logit)','coefPrecio','-0.005 = calzados') + '</div>'

    + '<div class="param-card"><div class="param-card-title">🧪 Costo Base por Producto (Bs/unid)</div>' + productosRows + '</div>'

    + '<div class="param-card" style="grid-column:span 2"><div class="param-card-title">⚙️ Módulos Activos</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">' + modulosHTML + '</div></div>'

    + '<div class="param-card" style="grid-column:span 2"><div class="param-card-title">📦 Canales</div>'
    + '<div class="table-wrap"><table><thead><tr><th>Canal</th><th>Costo adicional/unid</th><th>Comisión</th><th>Factor vendedores</th><th>Bono atractivo</th></tr></thead>'
    + '<tbody>' + canalesRows + '</tbody></table></div></div>'
    + '</div>'
    + '<div class="param-actions"><button class="btn btn-primary" id="btnSaveParams">💾 Guardar Parámetros</button>'
    + '<span class="param-warning">⚠ Los cambios aplican desde la próxima simulación</span></div>'
    + '<div class="param-card" style="margin-top:16px;max-width:480px"><div class="param-card-title">🔑 Código de Acceso</div>'
    + '<div style="display:flex;gap:10px;align-items:center">'
    + '<input id="inputCodigoAcceso" class="param-input" type="text" style="flex:1;font-family:var(--font-mono);letter-spacing:2px;font-size:1rem;text-transform:uppercase" placeholder="Ej: TIGRES2026" value="' + (data.codigoAcceso || '') + '"/>'
    + '<button class="btn btn-primary btn-sm" onclick="cambiarCodigoAcceso()">🔄 Cambiar</button></div>'
    + '<div id="codigoAccesoStatus" style="font-size:.75rem;margin-top:8px;color:var(--text3)">Código actual: <span style="font-family:var(--font-mono);color:var(--accent3);font-weight:700">' + (data.codigoAcceso || '—') + '</span></div></div>';

  document.getElementById('btnSaveParams').addEventListener('click', saveParametros);
}

async function cambiarCodigoAcceso() {
  var input = document.getElementById('inputCodigoAcceso');
  var nuevo = (input && input.value ? input.value : '').trim().toUpperCase();
  if (!nuevo || nuevo.length < 3) { toast('El código debe tener al menos 3 caracteres', 'error'); return; }
  try {
    var simId = state.ref && state.ref.simId ? state.ref.simId : state.simId;
    if (!simId) { toast('Sin simulación activa', 'error'); return; }
    await api('PUT', '/admin/simulaciones/' + simId, { codigoAcceso: nuevo });
    var st = document.getElementById('codigoAccesoStatus');
    if (st) st.innerHTML = 'Código actualizado: <span style="font-family:var(--font-mono);color:var(--accent2);font-weight:700">' + nuevo + '</span> ✅';
    if (input) input.value = nuevo;
    toast('✅ Código de acceso actualizado: ' + nuevo, 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function saveParametros() {
  var parametros = {};
  document.querySelectorAll('[data-pkey]').forEach(function(el) { parametros[el.dataset.pkey] = +el.value; });
  document.querySelectorAll('[data-modulo]').forEach(function(el) { parametros['modulos_' + el.dataset.modulo] = el.checked ? 1 : 0; });
  var tiposProducto = {};
  document.querySelectorAll('[data-tp]').forEach(function(el) { tiposProducto[el.dataset.tp] = { costoBase: +el.value }; });
  var canales = {};
  document.querySelectorAll('[data-canal]').forEach(function(el) {
    if (!canales[el.dataset.canal]) canales[el.dataset.canal] = {};
    canales[el.dataset.canal][el.dataset.canalField] = +el.value;
  });
  try {
    await api('PUT', '/admin/parametros', { parametros });
    await api('PUT', '/admin/tiposproducto', { tiposProducto });
    await api('PUT', '/admin/canales', { canales });
    toast('✓ Parámetros guardados', 'success');
    state.ref = await api('GET', '/admin/config');
  } catch(e) { toast(e.message, 'error'); }
}

// ── Segmentos ─────────────────────────────────────────────────────────────────
var segmentosLocal = [];

async function loadAdminSegmentos() {
  if (typeof requireSimSelected === 'function' && !requireSimSelected('adminSegmentosContent')) return;
  segmentosLocal = await api('GET', '/admin/segmentos');
  renderSegmentosEditor();
}

function renderSegmentosEditor() {
  var tendOpts = ['Estable', 'Creciente', 'Alto crecimiento', 'Decreciente'];
  var tabs = segmentosLocal.map(function(s, i) {
    return '<button class="seg-tab ' + (i === 0 ? 'active' : '') + '" data-seg="' + i + '">' + s.nombre + '</button>';
  }).join('');

  var panels = segmentosLocal.map(function(s, i) {
    return '<div class="seg-panel ' + (i === 0 ? 'active' : '') + '" id="segPanel_' + i + '">'
      + '<div class="seg-rename-row"><label class="param-label" style="color:var(--accent3);font-weight:700">✏️ Nombre del segmento</label>'
      + '<input class="param-input seg-nombre-input" style="font-weight:700;font-size:.95rem;max-width:340px" data-seg-idx="' + i + '" data-seg-field="nombre" value="' + s.nombre + '"/></div>'
      + '<div class="seg-fields-grid"><div class="param-card"><div class="param-card-title">📊 Mercado</div>'
      + '<div class="param-row"><label class="param-label">Demanda base (unidades)</label><input class="param-input" type="number" step="1000" data-seg-idx="' + i + '" data-seg-field="demandaBase" value="' + s.demandaBase + '"/></div>'
      + '<div class="param-row"><label class="param-label">% Contrabando (0–1)</label><input class="param-input" type="number" step="0.01" min="0" max="1" data-seg-idx="' + i + '" data-seg-field="pctContrabando" value="' + s.pctContrabando + '"/><span class="param-hint">Demanda formal = Demanda base × (1 − %)</span></div>'
      + '<div class="param-row"><label class="param-label">Índice externo</label><input class="param-input" type="number" step="0.1" data-seg-idx="' + i + '" data-seg-field="indiceExterno" value="' + s.indiceExterno + '"/></div>'
      + '<div class="param-row"><label class="param-label">Tendencia</label><select class="param-input" data-seg-idx="' + i + '" data-seg-field="tendencia">'
      + tendOpts.map(function(t) { return '<option ' + (t === s.tendencia ? 'selected' : '') + '>' + t + '</option>'; }).join('')
      + '</select></div></div></div>'
      + '<div style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:var(--r);font-family:var(--font-mono);font-size:.78rem;color:var(--accent2)">Demanda formal = <strong id="demFormal_' + i + '">' + Math.round(s.demandaBase * (1 - s.pctContrabando)).toLocaleString('es-BO') + '</strong> unidades</div></div>';
  }).join('');

  document.getElementById('adminSegmentosContent').innerHTML =
    '<div class="seg-tabs-bar">' + tabs + '</div><div class="seg-panels">' + panels + '</div>'
    + '<div class="param-actions"><button class="btn btn-primary" id="btnSaveSegs">💾 Guardar Segmentos</button><button class="btn btn-ghost" id="btnResetSegs">↺ Recargar</button></div>';

  document.querySelectorAll('.seg-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.seg-tab').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.seg-panel').forEach(function(p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var el = document.getElementById('segPanel_' + btn.dataset.seg);
      if (el) el.classList.add('active');
    });
  });

  document.querySelectorAll('[data-seg-idx][data-seg-field]').forEach(function(el) {
    el.addEventListener('input', function() {
      var idx = +el.dataset.segIdx;
      var field = el.dataset.segField;
      var val = el.tagName === 'SELECT' ? el.value : (el.type === 'number' ? +el.value : el.value);
      segmentosLocal[idx][field] = val;
      if (field === 'nombre') { var tab = document.querySelectorAll('.seg-tab')[idx]; if (tab) tab.textContent = val || ('Seg ' + (idx + 1)); }
      if (field === 'demandaBase' || field === 'pctContrabando') {
        var seg = segmentosLocal[idx];
        var df = Math.round(seg.demandaBase * (1 - seg.pctContrabando));
        var el2 = document.getElementById('demFormal_' + idx);
        if (el2) el2.textContent = df.toLocaleString('es-BO');
      }
    });
  });

  document.getElementById('btnSaveSegs').addEventListener('click', saveSegmentos);
  document.getElementById('btnResetSegs').addEventListener('click', loadAdminSegmentos);
}

async function saveSegmentos() {
  try {
    for (var i = 0; i < segmentosLocal.length; i++) {
      if (!segmentosLocal[i].nombre || !segmentosLocal[i].nombre.trim()) { toast('Todos los segmentos deben tener nombre', 'error'); return; }
    }
    await api('PUT', '/admin/segmentos', { segmentos: segmentosLocal });
    toast('✓ Segmentos guardados', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

// ── Matriz Afinidad ───────────────────────────────────────────────────────────
var afinidadLocal = null;
var segmentosForAfinidad = [];

async function loadAdminAfinidad() {
  if (typeof requireSimSelected === 'function' && !requireSimSelected('adminAfinidadContent')) return;
  var results = await Promise.all([api('GET', '/admin/afinidad'), api('GET', '/admin/segmentos')]);
  afinidadLocal = results[0];
  segmentosForAfinidad = results[1];
  renderAfinidadEditor();
}

function renderAfinidadEditor() {
  var productos = Object.keys(afinidadLocal);
  var segNombres = segmentosForAfinidad.map(function(s) { return s.nombre; });

  var colorCell = function(v) {
    if (v >= 3)  return 'background:rgba(6,255,165,.15);color:var(--accent5)';
    if (v >= 1)  return 'background:rgba(78,205,196,.1);color:var(--accent2)';
    if (v === 0) return 'background:var(--bg3);color:var(--text3)';
    return 'background:rgba(255,107,107,.12);color:var(--accent4)';
  };

  var headerCols = segNombres.map(function(n) {
    return '<th style="padding:8px 6px;font-size:.68rem;text-align:center;white-space:nowrap;max-width:90px;overflow:hidden">' + n + '</th>';
  }).join('');

  var rows = productos.map(function(prod) {
    var vals = afinidadLocal[prod] || [];
    var cells = segNombres.map(function(_, j) {
      var v = vals[j] != null ? vals[j] : 0;
      return '<td style="padding:4px;text-align:center"><input type="number" min="-3" max="3" step="1" data-af-prod="' + prod + '" data-af-seg="' + j + '" value="' + v + '" style="width:52px;text-align:center;padding:4px;border-radius:4px;border:1px solid var(--border2);' + colorCell(v) + ';font-family:var(--font-mono);font-size:.82rem;outline:none"/></td>';
    }).join('');
    return '<tr><td style="padding:8px 12px;font-weight:600;white-space:nowrap">' + prod + '</td>' + cells + '</tr>';
  }).join('');

  document.getElementById('adminAfinidadContent').innerHTML =
    '<div class="table-wrap"><table style="border-collapse:collapse;width:100%"><thead><tr><th style="padding:8px 12px;text-align:left;background:var(--bg3)">Producto \\ Segmento</th>' + headerCols + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<div style="margin-top:12px;font-size:.78rem;color:var(--text3);display:flex;gap:16px;flex-wrap:wrap"><span style="color:var(--accent5)">■ +3 Ajuste perfecto</span><span style="color:var(--accent2)">■ +1 Aceptable</span><span style="color:var(--text3)">■ 0 Neutro</span><span style="color:var(--accent4)">■ -2 Mal ajuste</span></div>'
    + '<div class="param-actions"><button class="btn btn-primary" id="btnSaveAfinidad">💾 Guardar Matriz</button><button class="btn btn-ghost" id="btnResetAfinidad">↺ Recargar</button></div>';

  document.querySelectorAll('[data-af-prod]').forEach(function(inp) {
    inp.addEventListener('input', function() {
      var prod = inp.dataset.afProd; var j = +inp.dataset.afSeg; var v = +inp.value;
      if (afinidadLocal[prod]) afinidadLocal[prod][j] = v;
      inp.style.cssText = 'width:52px;text-align:center;padding:4px;border-radius:4px;border:1px solid var(--border2);' + colorCell(v) + ';font-family:var(--font-mono);font-size:.82rem;outline:none';
    });
  });

  document.getElementById('btnSaveAfinidad').addEventListener('click', async function() {
    try { await api('PUT', '/admin/afinidad', { afinidadMatrix: afinidadLocal }); toast('✓ Matriz guardada', 'success'); } catch(e) { toast(e.message, 'error'); }
  });
  document.getElementById('btnResetAfinidad').addEventListener('click', loadAdminAfinidad);
}

// ── Competencia Externa ───────────────────────────────────────────────────────
var competenciaLocal = [];

async function loadAdminCompetencia() {
  if (typeof requireSimSelected === 'function' && !requireSimSelected('adminCompetenciaContent')) return;
  competenciaLocal = await api('GET', '/admin/competencia');
  try {
    var cfg = (typeof state !== 'undefined' && state.ref) ? state.ref : await api('GET', '/admin/config');
    if (typeof state !== 'undefined') { state.ref = cfg; state.segNombresIndustria = (cfg.mercadoSegmentos || []).map(function(s) { return s.nombre; }); }
  } catch(e) { if (typeof state !== 'undefined') state.segNombresIndustria = []; }
  renderCompetenciaEditor();
}

function renderCompetenciaEditor() {
  var segNombres = (typeof state !== 'undefined' && state.segNombresIndustria && state.segNombresIndustria.length)
    ? state.segNombresIndustria
    : ['Masivo popular', 'Masivo aspiracional', 'Funcional familiar', 'Cosmético', 'Dermatológico', 'Natural', 'Institucional'];

  var rows = competenciaLocal.map(function(c, i) {
    return '<tr><td><select class="param-input" data-comp="' + i + '" data-comp-field="segmento" style="min-width:160px">'
      + segNombres.map(function(s) { return '<option ' + (s === c.segmento ? 'selected' : '') + '>' + s + '</option>'; }).join('')
      + '</select></td>'
      + '<td><input class="param-input" type="text"   data-comp="' + i + '" data-comp-field="nombre"           value="' + c.nombre + '"           style="min-width:160px"/></td>'
      + '<td><input class="param-input" type="number" data-comp="' + i + '" data-comp-field="precio"           value="' + c.precio + '"           step="0.1" style="width:80px"/></td>'
      + '<td><input class="param-input" type="number" data-comp="' + i + '" data-comp-field="calidad"          value="' + c.calidad + '"          step="0.5" min="1" max="10" style="width:70px"/></td>'
      + '<td><input class="param-input" type="number" data-comp="' + i + '" data-comp-field="marketing"        value="' + c.marketing + '"        step="500" style="width:90px"/></td>'
      + '<td><input class="param-input" type="number" data-comp="' + i + '" data-comp-field="participacionRef" value="' + c.participacionRef + '" step="0.01" min="0" max="1" style="width:80px"/></td>'
      + '<td><button class="btn btn-danger btn-sm" onclick="eliminarCompetidor(' + i + ')">✕</button></td></tr>';
  }).join('');

  document.getElementById('adminCompetenciaContent').innerHTML =
    '<div class="table-wrap"><table><thead><tr><th>Segmento</th><th>Nombre</th><th>Precio (Bs)</th><th>Calidad</th><th>Marketing (Bs)</th><th>Part. ref.</th><th></th></tr></thead><tbody id="compRows">' + rows + '</tbody></table></div>'
    + '<div class="param-actions"><button class="btn btn-ghost" id="btnAddComp">+ Agregar competidor</button><button class="btn btn-primary" id="btnSaveComp">💾 Guardar</button></div>'
    + '<p class="param-hint" style="margin-top:8px">Estos actores externos influyen en el índice externo de cada segmento.</p>';

  document.querySelectorAll('[data-comp][data-comp-field]').forEach(function(el) {
    el.addEventListener('input', function() {
      var i = +el.dataset.comp; var f = el.dataset.compField;
      competenciaLocal[i][f] = el.type === 'number' ? +el.value : el.value;
    });
  });

  document.getElementById('btnAddComp').addEventListener('click', function() {
    var segDefault = (typeof state !== 'undefined' && state.segNombresIndustria && state.segNombresIndustria[0]) || 'Masivo popular';
    competenciaLocal.push({ segmento: segDefault, nombre: 'Nuevo competidor', precio: 150, calidad: 5, marketing: 0, participacionRef: 0.10 });
    renderCompetenciaEditor();
  });

  document.getElementById('btnSaveComp').addEventListener('click', async function() {
    try { await api('PUT', '/admin/competencia', { competencia: competenciaLocal }); toast('✓ Competencia guardada', 'success'); } catch(e) { toast(e.message, 'error'); }
  });
}

window.eliminarCompetidor = function(i) {
  competenciaLocal.splice(i, 1);
  renderCompetenciaEditor();
};


// ── Exponer como window.* para setupNav ──────────────────
window.loadAdminParametros = loadAdminParametros;
window.loadAdminSegmentos = loadAdminSegmentos;
window.loadAdminAfinidad = loadAdminAfinidad;
window.loadAdminCompetencia = loadAdminCompetencia;
window.cambiarCodigoAcceso = cambiarCodigoAcceso;
window.saveParametros = saveParametros;
console.log('[admin-parametros] ✅ Módulo cargado — Parámetros, Segmentos, Afinidad, Competencia activos');
