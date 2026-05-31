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
  if (!requireSimSelected('adminParametrosContent')) return;
  const data = await api('GET', '/admin/config');
  let p   = data.parametros  || {};
  const tp  = data.tiposProducto || {};
  const can = data.canales      || {};
  const ref = data;

  // Si la sim no tiene parámetros ni proveedores, cargar defaults desde V1
  let proveedoresDefault = data.proveedores || [];
  if (!Object.keys(p).length || !proveedoresDefault.length) {
    try {
      const v1 = await api('GET', '/admin/plantillas/Calzados_COM540_1_2026_V1');
      if (v1?.params && !Object.keys(p).length) p = v1.params;
      if (v1?.proveedores?.length && !proveedoresDefault.length) proveedoresDefault = v1.proveedores;
    } catch {}
  }
  ref.proveedores = proveedoresDefault;

  const pf = (label, key, hint='', step='any') => `
    <div class="param-row">
      <label class="param-label">${label}</label>
      <input class="param-input" type="number" step="${step}" data-pkey="${key}" value="${p[key]??''}"/>
      ${hint?`<span class="param-hint">${hint}</span>`:''}
    </div>`;

  document.getElementById('adminParametrosContent').innerHTML = `
    <div class="param-grid">

      <div class="param-card">
        <div class="param-card-title">💼 Apertura Financiera por Equipo</div>
        <div class="param-row">
          <span class="param-hint" style="color:var(--accent3);font-size:.8rem">
            ℹ Capital contable = Caja inicial + Activos fijos − Deuda inicial (calculado automáticamente)
          </span>
        </div>
        ${pf('Caja inicial (Bs)','cajaInicial','Efectivo en cuenta al arrancar')}
        ${pf('Activos fijos iniciales (Bs)','activosFijosIniciales','Maquinaria y equipos')}
        ${pf('Inventario inicial (unid)','inventarioInicialUnid','0 = sin stock')}
        ${pf('CxC inicial (Bs)','cxcInicial')}
        ${pf('Deuda inicial (Bs)','deudaInicial')}
        ${pf('Capacidad máx producción (unid)','capacidadMaxProduccion')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🏭 Costos Fijos Operativos</div>
        ${pf('Gasto administrativo fijo (Bs)','gastoAdminFijo','Por trimestre')}
        ${pf('Gasto fijo de planta (Bs)','gastoFijoPlanta','Por trimestre')}
        ${pf('Depreciación trimestral (Bs)','depreciacionTrimestral')}
        ${pf('Costo almacenamiento / unid (Bs)','costoAlmacenamientoUnidad','Bs/unid final')}
      </div>

      <div class="param-card">
        <div class="param-card-title">💳 Ventas y Cobranzas</div>
        ${pf('% Ventas al contado','pctVentasContado','0.70 = 70%')}
        ${pf('% Ventas a crédito','pctVentasCredito','0.30 = 30%')}
        ${pf('Plazo cobro (trimestres)','plazoCobro','1 = siguiente trimestre','1')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🏦 Financiamiento</div>
        ${pf('Tasa préstamo operativo (trim.)','tasaPrestamoOperativo','0.04 = 4%')}
        ${pf('Tasa préstamo inversión (trim.)','tasaPrestamoInversion','0.03 = 3%')}
        ${pf('Tasa sobregiro (trim.)','tasaSobregiro','0.06 = 6%')}
        ${pf('Comisión apertura préstamo','comisionAperturaPrestamo','0.01 = 1%')}
        ${pf('Plazo préstamo operativo (trim.)','plazoPrestamoOperativo','','1')}
        ${pf('Plazo préstamo inversión (trim.)','plazoPrestamoInversion','','1')}
      </div>

      <div class="param-card">
        <div class="param-card-title">👥 Fuerza de Ventas</div>
        ${pf('Vendedores iniciales por equipo','vendedoresIniciales','','1')}
        ${pf('Sueldo trimestral / vendedor (Bs)','sueldoTrimestralVendedor')}
        ${pf('Costo contratación / vendedor (Bs)','costoContratacionVendedor')}
        ${pf('Costo despido / vendedor (Bs)','costoDespidoVendedor')}
      </div>

      <div class="param-card">
        <div class="param-card-title">👷 Operarios y Producción</div>
        ${pf('Operarios iniciales por equipo','operariosIniciales','Aplica desde la próxima ronda','1')}
        ${pf('Productividad base (unid/operario)','productividadBase','Unidades por operario por trimestre')}
        ${pf('Costo trimestral / operario (Bs)','costoOperario')}
        ${pf('Costo contratación / operario (Bs)','costoContratacionOperario')}
        ${pf('Costo despido / operario (Bs)','costoDespidoOperario')}
        ${pf('Factor capacitación','factorCapacitacion','0.05 = +5% productividad por inversión en capacitación')}
        ${pf('% Costo por punto de calidad sobre/bajo 5 (ej. 0.08 = 8% del costoBase)','pctCostoCalidad','0.08')}
        ${pf('% Materia Prima del costoBase (ej. 0.40 = 40% del costo base es MP)','pctMateriaPrima','0.40')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🔍 Investigación de Mercado</div>
        ${pf('Reporte Básico (Bs)','costoInvestigacionBasica')}
        ${pf('Reporte Premium (Bs)','costoInvestigacionPremium')}
        ${pf('Reporte Estratégico (Bs)','costoInvestigacionEstrategico')}
      </div>

      <div class="param-card">
        <div class="param-card-title">💡 Innovación</div>
        ${pf('Factor innovación Producto','factorInnovacionProducto','0.333 = 1/3 del monto/unid')}
        ${pf('Factor innovación Proceso','factorInnovacionProceso','0.333 = reducción de CU')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🧾 Sistema Tributario Bolivia — Etapa 3.5</div>
        ${pf('IVA (tasa)','tasaIVA','0.13 = 13%')}
        ${pf('IT — Impuesto a las Transacciones (tasa)','tasaIT','0.03 = 3% sobre ventas brutas')}
        ${pf('IUE — Impuesto s/Utilidades (tasa)','tasaIUE','0.25 = 25% sobre utilidad gravable')}
        ${pf('Períodos para pago IUE (trimestres)','periodosIUE','4 = pago anual')}
        ${pf('λ Logit — Sensibilidad competitiva','lambdaLogit','1.0 = neutro · >1 más diferenciado · <1 más aleatorio')}
        ${pf('Coef. Precio (sensibilidad al precio en Logit)','coefPrecio','-0.7 = jaboncillos (Bs 2-10) · -0.005 = calzados (Bs 90-310) · valor negativo')}
      </div>

      <div class="param-card">
        <div class="param-card-title">📈 Demanda y Marca</div>
        ${pf('Factor canibalización','factorCanibalizacion','0.15 = penaliza 15% el atractivo al competir en varios segmentos · 0 = sin penalización')}
        ${pf('Tasa de decaimiento de marca','tasaDecaimiento','0.05 = Brand Equity cae 5% por ronda sin ventas · 0 = sin decaimiento')}
      </div>

      <div class="param-card">
        <div class="param-card-title">⚙ Modelo de Costos</div>
        <div class="param-row">
          <label class="param-label">Asignación de costos fijos</label>
          <select class="param-input" data-pkey-str="modeloCostos" style="height:2.2rem;padding:0 8px">
            <option value="mixto"     ${p.modeloCostos==='mixto'     ||!p.modeloCostos?'selected':''}>Mixto — fijos solo en prod_1 (recomendado COM540)</option>
            <option value="absorcion" ${p.modeloCostos==='absorcion'?'selected':''}>Absorción — cada producto paga fijos completos</option>
            <option value="directo"   ${p.modeloCostos==='directo'  ?'selected':''}>Directo — solo costos variables</option>
          </select>
          <span class="param-hint" style="color:#f59e0b">⚠ Cambiar afecta la asignación de costos fijos en rondas siguientes</span>
        </div>
      </div>

      <div class="param-card">
        <div class="param-card-title">🧪 Costo Base por Producto (Bs/unid)</div>
        ${Object.entries(tp).map(([n,v])=>`
          <div class="param-row">
            <label class="param-label">${n}</label>
            <input class="param-input" type="number" step="0.01" data-tp="${n}" value="${v.costoBase}"/>
          </div>`).join('')}
      </div>

      <div class="param-card" style="grid-column:span 2">
        <div class="param-card-title">⚙️ Módulos Activos — Control de Funcionalidades</div>
        <div style="font-size:.78rem;color:var(--text3);margin-bottom:12px">
          Activa o desactiva módulos para adaptar la complejidad del simulador a tu curso.
          Los módulos desactivados no aparecen en la hoja de decisión de los equipos.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
          ${[
            { id:'modMateriaPrima',  label:'🏭 Materia Prima',          desc:'Compra de MP, proveedores, lead time, restricción de producción',  etapa:'3.1' },
            { id:'modOperarios',     label:'👷 Operarios',              desc:'Contratación, despido, capacitación y capacidad efectiva',          etapa:'3.2' },
            { id:'modIVA',           label:'🧾 IVA (13%)',              desc:'Débito, crédito fiscal y pago neto de IVA en el P&L',              etapa:'3.3' },
            { id:'modImpuestos',     label:'📊 IT + IUE',              desc:'Impuesto a las Transacciones (3%) e IUE (25%) anual',             etapa:'3.4' },
            { id:'modBrandEquity',   label:'⭐ Brand Equity',           desc:'Acumulación de reputación de marca entre rondas',                  etapa:'2.1' },
            { id:'modCanibalizacion',label:'🔀 Canibalización',         desc:'Penalización al atractivo cuando la empresa compite en N segmentos',etapa:'2.3' },
            { id:'modDemandaDin',    label:'📈 Demanda Dinámica',       desc:'Crecimiento/decrecimiento de mercado por tendencia de segmento',   etapa:'2.2' },
            { id:'modInnovacion',    label:'💡 Innovación',             desc:'Inversión en producto, proceso o canal para mejorar posición',     etapa:'base' },
            { id:'modInvestigacion', label:'🔍 Investigación Mercado',  desc:'Compra de reportes básicos y premium de inteligencia',            etapa:'base' },
          ].map(mod => `
            <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--bg2);border-radius:var(--r);border:1px solid var(--border2);cursor:pointer">
              <input type="checkbox" data-modulo="${mod.id}"
                ${(p['modulos_'+mod.id] !== 0) ? 'checked' : ''}
                style="width:16px;height:16px;margin-top:2px;accent-color:var(--accent);flex-shrink:0"/>
              <div>
                <div style="font-weight:600;font-size:.85rem;color:var(--text1)">${mod.label}
                  <span style="font-size:.7rem;color:var(--text3);font-weight:400;margin-left:4px">Etapa ${mod.etapa}</span>
                </div>
                <div style="font-size:.75rem;color:var(--text3);margin-top:2px">${mod.desc}</div>
              </div>
            </label>`).join('')}
        </div>
      </div>

      <div class="param-card" style="grid-column:span 2">
        <div class="param-card-title">📦 Canales — Costos y Comisiones</div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Canal</th>
              <th>Costo adicional/unid (Bs)</th>
              <th>Comisión sobre ventas</th>
              <th>Factor impacto vendedores</th>
              <th>Bono atractivo</th>
            </tr></thead>
            <tbody>
              ${Object.entries(can).map(([n,v])=>`
                <tr>
                  <td><strong>${n}</strong></td>
                  <td><input class="param-input" type="number" step="0.01" data-canal="${n}" data-canal-field="costoAdicionalUnitario" value="${v.costoAdicionalUnitario}" style="width:90px"/></td>
                  <td><input class="param-input" type="number" step="0.01" data-canal="${n}" data-canal-field="comisionPct" value="${v.comisionPct}" style="width:90px"/></td>
                  <td><input class="param-input" type="number" step="0.01" data-canal="${n}" data-canal-field="factorImpactoVendedores" value="${v.factorImpactoVendedores}" style="width:90px"/></td>
                  <td><input class="param-input" type="number" step="0.1"  data-canal="${n}" data-canal-field="bonoAtractivo" value="${v.bonoAtractivo}" style="width:90px"/></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="param-card" style="grid-column:span 2">
        <div class="param-card-title">🏭 Proveedores de Materia Prima</div>
        <p style="font-size:.78rem;color:var(--text3);margin:0 0 12px">
          Factor = multiplicador sobre el costo estándar de MP (costoBase × pctMateriaPrima).
          Factor 1.10 = 10% más caro · Factor 0.75 = 25% más barato.
        </p>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Proveedor</th>
              <th>Factor costo</th>
              <th>Calidad (1-10)</th>
              <th>Lead time (trim.)</th>
            </tr></thead>
            <tbody>
              ${(ref.proveedores || []).map((pv,i) => `
                <tr>
                  <td><strong>${pv.nombre}</strong></td>
                  <td><input class="param-input" type="number" step="0.01" min="0.1" max="3"
                    data-prov-idx="${i}" data-prov-field="factorCosto"
                    value="${pv.factorCosto ?? 1.0}" style="width:90px"/>
                    <span style="font-size:.7rem;color:var(--text3)"> (1.0 = estándar)</span>
                  </td>
                  <td><input class="param-input" type="number" step="1" min="1" max="10"
                    data-prov-idx="${i}" data-prov-field="calidad"
                    value="${pv.calidad ?? 5}" style="width:70px"/></td>
                  <td><input class="param-input" type="number" step="1" min="1" max="4"
                    data-prov-idx="${i}" data-prov-field="leadTime"
                    value="${pv.leadTime ?? 1}" style="width:70px"/></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
    <div class="param-actions">
      <button class="btn btn-primary" id="btnSaveParams">💾 Guardar Parámetros</button>
      <span class="param-warning">⚠ Los cambios aplican desde la próxima simulación</span>
    </div>

    <div class="param-card" style="margin-top:16px;max-width:480px">
      <div class="param-card-title">🔑 Código de Acceso al Simulador</div>
      <div style="font-size:.8rem;color:var(--text3);margin-bottom:12px">
        Los estudiantes usan este código para ingresar. Cámbialo cuando necesites.
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <input id="inputCodigoAcceso" class="param-input" type="text"
          style="flex:1;font-family:var(--font-mono);letter-spacing:2px;font-size:1rem;text-transform:uppercase"
          placeholder="Ej: TIGRES2026"
          value="${data.codigoAcceso || ''}"/>
        <button class="btn btn-primary btn-sm" onclick="cambiarCodigoAcceso()">🔄 Cambiar</button>
      </div>
    <div class="param-card" style="margin-top:16px">
      <div class="param-card-title">Competidores IA por segmento</div>
      <div id="adminNivelIAContent">Cargando...</div>
    </div>
      <div id="codigoAccesoStatus" style="font-size:.75rem;margin-top:8px;color:var(--text3)">
        Código actual: <span style="font-family:var(--font-mono);color:var(--accent3);font-weight:700">${data.codigoAcceso || '—'}</span>
      </div>
    </div>`;

  document.getElementById('btnSaveParams').addEventListener('click', saveParametros);
  loadAdminNivelIA(data);
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
// segmentosLocal declarada en app.js

async function loadAdminSegmentos() {
  if (!requireSimSelected('adminSegmentosContent')) return;
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
// afinidadLocal declarada en app.js
// segmentosForAfinidad declarada en app.js

async function loadAdminAfinidad() {
  if (!requireSimSelected('adminAfinidadContent')) return;
  const [afData, segData] = await Promise.all([
    api('GET','/admin/afinidad'),
    api('GET','/admin/segmentos'),
  ]);
  afinidadLocal = afData;
  segmentosForAfinidad = segData;
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
// competenciaLocal declarada en app.js

async function loadAdminCompetencia() {
  if (!requireSimSelected('adminCompetenciaContent')) return;
  competenciaLocal = await api('GET','/admin/competencia');
  // Leer segmentos reales de la industria activa
  try {
    const cfg = state.ref || await api('GET','/admin/config');
    state.ref = cfg;
    state.segNombresIndustria = (cfg.mercadoSegmentos || []).map(s => s.nombre);
  } catch { state.segNombresIndustria = []; }
  const nivelCfg = state.ref || {};
  renderCompetenciaEditor();
  loadAdminNivelIA(nivelCfg);
}

// ── Nivel Competidores IA ───────────────────────────────────────────────────
async function loadAdminNivelIA(data) {
  const nivel = data?.nivelCompetidoresIA || 'ninguno';
  const cont = document.getElementById('adminNivelIAContent');
  if (!cont) return;
  cont.innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      ${['ninguno','bajo','medio','alto'].map(n => `
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:.88rem">
          <input type="radio" name="nivelIA" value="${n}" ${nivel===n?'checked':''}>
          ${n==='ninguno'?'❌ Ninguno':n==='bajo'?'🟢 Bajo — precio agresivo':n==='medio'?'🟡 Medio — espejo mercado':'🔴 Alto — premium diferenciado'}
        </label>`).join('')}
    </div>
    <p style="font-size:.75rem;color:var(--text3);margin-bottom:10px">Los competidores IA compiten en todos los segmentos junto a los equipos humanos y son visibles en investigación de mercados.</p>
    <button class="btn btn-primary btn-sm" onclick="saveNivelIA()">💾 Guardar nivel IA</button>`;
}

window.saveNivelIA = async () => {
  const nivel = document.querySelector('input[name="nivelIA"]:checked')?.value || 'ninguno';
  try {
    await api('POST', '/admin/config/nivel-ia', { nivelCompetidoresIA: nivel });
    toast('✅ Nivel IA guardado: ' + nivel, 'ok');
  } catch(e) { toast(e.message, 'error'); }
};

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
    '<div id="adminNivelIAContent"></div>' +
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
