/**
 * modules/admin-dashboard.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo: dashboard administrativo
 * Fase 2 — Día 5 del plan de modularización
 *
 * Funciones incluidas:
 *   - loadAdminDashboard   → panel principal con KPIs y acciones
 *   - renderAdminCharts    → gráficas del dashboard
 *
 * Dependencias: api(), fmt (ui-components.js), state, toast
 * Reversión: comentar <script src="modules/admin-dashboard.js"> en index.html
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function loadAdminDashboard() {
  if (!requireSimSelected('adminDashboardContent')) return;
  // Actualizar badge de simulación en sidebar
  const badge = document.getElementById('simBadge');
  if (badge && state.currentSimNombre) badge.textContent = `📊 ${state.currentSimNombre}`;

  const ronda = await api('GET','/admin/ronda');
  document.getElementById('adminRoundBadge').textContent = `Ronda ${ronda.currentRound}/${ronda.totalRounds}`;

  const pct = ronda.total > 0 ? Math.round(ronda.enviados/ronda.total*100) : 0;
  const estadoBadge = ronda.roundState === 'simulated'
    ? '<span class="badge badge-simulated">Simulada</span>'
    : ronda.roundState === 'open'
    ? '<span class="badge badge-open">🟢 Abierta</span>'
    : ronda.roundState === 'locked'
    ? '<span class="badge badge-alert">🔒 Cerrada</span>'
    : ronda.roundState === 'pre-sim'
    ? '<span class="badge badge-presim">📊 Pre-simulación</span>'
    : '<span class="badge badge-pending">⏸ Pendiente</span>';

  // Build bottom section depending on state
  let bottomHTML = '';
  if (ronda.roundState === 'simulated') {
    try {
      const rd = await api('GET', `/admin/resultados/${ronda.currentRound}`);
      // Banner de Shock de Mercado — visible en Dashboard post-ejecución (incluye neutral)
      const shockBannerDash = (() => {
        const sh = rd?.shock;
        if (!sh) return '';
        const colores = { boom:'#10B981', crisis:'#EF4444', neutral:'#6B7280', sectorial:'#F59E0B' };
        const fondos  = { boom:'rgba(16,185,129,.10)', crisis:'rgba(239,68,68,.10)', neutral:'rgba(107,114,128,.08)', sectorial:'rgba(245,158,11,.10)' };
        const color   = sh.color || colores[sh.tipo] || '#6B7280';
        const fondo   = fondos[sh.tipo] || 'rgba(107,114,128,.08)';
        const factor  = sh.factorDemanda !== 1.0
          ? ' · Demanda ' + (sh.factorDemanda > 1 ? '+' : '') + Math.round((sh.factorDemanda - 1) * 100) + '%'
          : '';
        const segs = sh.segmentosAfectados === 'todos' ? 'Todos los segmentos' : 'Segmentos específicos';
        return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:16px;'
          + 'background:' + fondo + ';border:1px solid ' + color + '33;border-radius:var(--r);border-left:4px solid ' + color + '">'
          + '<span style="font-size:1.4rem">' + (sh.icono || '⚡') + '</span>'
          + '<div style="flex:1">'
          + '<div style="font-weight:700;font-size:.82rem;color:' + color + ';text-transform:uppercase;letter-spacing:1px">'
          + 'SHOCK DE MERCADO · Ronda ' + (rd.ronda || ronda.currentRound || '') + ' · ' + (sh.tipo?.toUpperCase() || 'EVENTO') + '</div>'
          + '<div style="font-size:.85rem;color:var(--text1);margin-top:2px">' + sh.descripcion + '</div>'
          + '<div style="font-size:.75rem;color:var(--text3);margin-top:3px">' + segs + factor
          + (sh.forzadoPor === 'profesor' ? ' &nbsp;·&nbsp; <span style="color:var(--accent3);font-weight:600">📌 Elegido por el profesor</span>' : '') + '</div>'
          + '</div></div>';
      })();
      // Dashboard: solo mini-resumen (ranking + charts) sin IDs duplicados
      // El panel completo con tabs está en 📈 Resultados
      if (rd?.resultados?.length) {
        const PALETTE_D = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06FFA5','#84CC16','#F97316'];
        const tcD = i => PALETTE_D[i % PALETTE_D.length];
        const bsD = v => {
          if (!v && v!==0) return '—';
          const n = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
          return v < 0 ? '<span style="color:#EF4444">(Bs. '+n+')</span>' : '<span style="color:#10B981">Bs. '+n+'</span>';
        };
        const sorted = [...rd.resultados].sort((a,b)=>(b.utilidadNeta||0)-(a.utilidadNeta||0));
        const miniRows = sorted.map((r,rank) => {
          const i = rd.resultados.findIndex(e=>e.equipoNombre===r.equipoNombre);
          const sem = (r.utilidadNeta||0)>0?'🟢':(r.utilidadNeta||0)>-50000?'🟡':'🔴';
          return '<tr style="border-bottom:1px solid var(--border);'+(rank===0?'background:rgba(6,255,165,.05)':'')+'"><td style="padding:6px 10px;font-weight:700;color:'+tcD(i)+'">'+(rank+1)+'</td><td style="padding:6px 10px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+tcD(i)+';margin-right:5px;vertical-align:middle"></span>'+r.equipoNombre+'</td><td style="padding:6px 10px;text-align:right;font-family:var(--font-mono);font-size:.8rem">'+bsD(r.utilidadNeta||0)+'</td><td style="padding:6px 10px;text-align:right;font-family:var(--font-mono);font-size:.8rem">'+bsD(r.cajaFinal||0)+'</td><td style="padding:6px 10px;text-align:center">'+sem+'</td></tr>';
        }).join('');
        bottomHTML = '<div style="margin-top:14px">'
          + '<div style="font-family:var(--font-mono);font-size:.62rem;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Ranking · Ronda '+ronda.currentRound+'</div>'
          + '<div class="table-wrap"><table style="width:100%;border-collapse:collapse"><thead><tr>'
          + '<th style="padding:5px 10px;font-size:.7rem">#</th><th style="padding:5px 10px;font-size:.7rem">Empresa</th>'
          + '<th style="padding:5px 10px;font-size:.7rem;text-align:right">Utilidad Neta</th>'
          + '<th style="padding:5px 10px;font-size:.7rem;text-align:right">Caja Final</th>'
          + '<th style="padding:5px 10px;font-size:.7rem;text-align:center">Estado</th></tr></thead>'
          + '<tbody>'+miniRows+'</tbody></table></div>'
          + '<p style="font-size:.75rem;color:var(--text3);margin-top:8px;text-align:right">Ver análisis completo → <strong>📈 Resultados</strong></p>'
          + '</div>';
      }
      bottomHTML = shockBannerDash + bottomHTML;
    } catch {}
  } else if (ronda.roundState === 'pre-sim') {
    // Show pre-sim confirmation progress
    try {
      const psData = await api('GET', '/api/presim');
      const pctConf = psData.total > 0 ? Math.round(psData.confirmados/psData.total*100) : 0;
      bottomHTML = `
        <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">
          📊 Confirmaciones de Demanda Estimada — Ronda ${ronda.currentRound}
        </div>
        <div class="progress-wrap" style="margin-bottom:16px">
          <div class="progress-label">
            <span>Equipos que confirmaron su demanda</span>
            <strong>${psData.confirmados} de ${psData.total}</strong>
          </div>
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pctConf}%;background:var(--accent3)"></div></div>
        </div>
        <div class="table-wrap" style="margin-bottom:16px">
          <table>
            <thead><tr>
              <th>Equipo</th><th>Segmento</th><th>Producto</th>
              <th style="text-align:right">Demanda asignada</th>
              <th style="text-align:right">Ventas estimadas</th>
              <th style="text-align:right">Market share</th>
              <th style="text-align:center">Estado</th>
              <th style="text-align:center">Acción</th>
            </tr></thead>
            <tbody>
              ${psData.detalle.map(r => {
                  // Consolidado por empresa — campos por producto en r.productos[]
                  const p0 = r.productos?.[0] || r;
                  const segmento        = p0.segmento || r.segmento || '—';
                  const producto        = p0.producto  || r.producto  || '—';
                  const demandaAsignada = (r.productos||[]).reduce((s,p) => s+(p.demandaAsignada||0), 0) || r.demandaAsignada || 0;
                  const ventasEstimadas = (r.productos||[]).reduce((s,p) => s+(p.ventasEstimadas||0), 0) || r.ventasEstimadas || 0;
                  const shareEstimado   = (r.productos||[]).reduce((s,p) => s+(p.shareEstimado||0), 0)   || r.shareEstimado   || 0;
                  const nombre          = r.equipoNombre || r.nombre || r.equipo || '—';
                  const nProds          = r.productos?.length || 1;
                  return `<tr>
                  <td><strong>${nombre}</strong>${nProds>1?` <span style="font-size:.7rem;color:var(--text3)">(${nProds} prod.)</span>`:''}</td>
                  <td style="font-size:.78rem">${nProds>1?r.productos.map(p=>p.segmento||'—').join(', '):segmento}</td>
                  <td style="font-size:.78rem">${nProds>1?r.productos.map(p=>p.producto||'—').join('<br>'):producto}</td>
                  <td class="num">${fmt.num(demandaAsignada)}</td>
                  <td class="num">${fmt.num(ventasEstimadas)}</td>
                  <td class="num">${fmt.pct(shareEstimado)}</td>
                  <td style="text-align:center">
                    ${r.confirmado
                      ? `<span class="badge badge-ok">✓ ${r.forzadoPor==='admin'?'Forzado':'Confirmado'}</span>`
                      : '<span class="badge badge-pending">⏳ Pendiente</span>'}
                  </td>
                  <td style="text-align:center">
                    ${!r.confirmado
                      ? `<button class="btn btn-ghost btn-sm" onclick="forzarConfirmacion('${r.equipo}')">Forzar</button>`
                      : '—'}
                  </td>
                </tr>`; }).join('')}
            </tbody>
          </table>
        </div>`;
    } catch(e) { bottomHTML = `<p style="color:var(--accent4)">${e.message}</p>`; }
  } else {

        // Show team submission status
    const equipos = await api('GET','/admin/equipos');
    bottomHTML = `
      <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Estado de Entregas — Ronda ${ronda.currentRound}</div>
      <div class="team-status-grid">
        ${equipos.length === 0
          ? '<p style="color:var(--text3);font-size:.84rem">Sin equipos registrados. Ve a <strong>Equipos</strong> para crear equipos.</p>'
          : equipos.filter(eq => !eq.isBot).map(eq => `
              <div class="team-status-card">
                <div class="team-status-dot" style="background:${eq.submitted ? 'var(--success)' : 'var(--warning)'}"></div>
                <div>
                  <div style="font-weight:600;font-size:.82rem">${eq.nombre}</div>
                  <div style="font-size:.7rem;color:var(--text3)">${eq.submitted ? (eq.forcedByAdmin ? '⚠ Forzada por profesor' : '✓ ' + fmt.dt(eq.submittedAt)) : (eq.hasDecision ? '📝 Borrador' : '⏳ Pendiente')}</div>
                </div>
                ${!eq.submitted ? `<button class="btn btn-ghost btn-sm" onclick="forzarDecisionAdmin('${eq.id}')">Forzar</button>` : ''}
              </div>`).join('')}
      </div>`;
  }

  document.getElementById('adminDashboardContent').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Ronda Actual</div>
        <div class="stat-value">${ronda.currentRound}<span style="font-size:.9rem;color:var(--text3)">/${ronda.totalRounds}</span></div>
        <div class="stat-sub">${estadoBadge}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Equipos Registrados</div>
        <div class="stat-value">${ronda.total}</div>
        <div class="stat-sub">hasta 30 equipos</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Entregas Recibidas</div>
        <div class="stat-value">${ronda.enviados}<span style="font-size:.9rem;color:var(--text3)">/${ronda.total}</span></div>
        <div class="stat-sub">${pct}% listos</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Progreso Simulador</div>
        <div class="stat-value">${Math.round((ronda.currentRound-1)/ronda.totalRounds*100)}%</div>
        <div class="stat-sub">${ronda.currentRound-1} de ${ronda.totalRounds} rondas</div>
      </div>
    </div>

    <div class="progress-wrap">
      <div class="progress-label">
        <span>Entregas esta ronda</span>
        <strong>${ronda.enviados} de ${ronda.total} equipos</strong>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
    </div>

    <!-- Selector de Shock — solo visible cuando hay botón de simulación -->
    ${['locked','pre-sim'].includes(ronda.roundState) ? `
    <div style="margin-bottom:16px;padding:14px 18px;background:var(--bg2);border-radius:var(--r);border:1px solid var(--border2)">
      <div style="font-family:var(--font-mono);font-size:.62rem;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px">
        ⚡ Shock de Mercado — Ronda ${ronda.currentRound}
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label style="font-size:.82rem;color:var(--text2);white-space:nowrap">Evento a aplicar:</label>
        <select id="shockOverrideSelect" class="form-input" style="width:auto;min-width:280px;font-size:.83rem;padding:6px 10px">
          <option value="aleatorio">🎲 Aleatorio (sistema decide)</option>
          <optgroup label="── Boom (mercado favorable) ──">
            <option value="boom_macro">📈 Crecimiento económico regional (+18% todos)</option>
            <option value="boom_feria">🏪 Feria comercial internacional (+12% todos)</option>
            <option value="boom_tend">🚀 Tendencia viral en redes (+25% todos)</option>
            <option value="boom_export">🌍 Acuerdo comercial regional (+15% todos)</option>
          </optgroup>
          <optgroup label="── Crisis (mercado adverso) ──">
            <option value="crisis_rec">📉 Recesión económica (−18% todos)</option>
            <option value="crisis_imp">⚠️ Importaciones ilegales (−13% todos)</option>
            <option value="crisis_reg">🏛️ Nueva regulación sectorial (−12% todos)</option>
            <option value="crisis_inf">💸 Inflación segmento premium (−20% todos)</option>
          </optgroup>
          <optgroup label="── Sin evento ──">
            <option value="neutral">⚖️ Mercado estable (sin impacto)</option>
          </optgroup>
        </select>
        <span style="font-size:.74rem;color:var(--text3);font-style:italic">
          El aleatorio usa semilla determinista — siempre da el mismo resultado para esta ronda.
        </span>
      </div>
    </div>` : ''}

    <div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap">
      ${ronda.roundState === 'pending'
        ? `<button class="btn btn-success" id="btnActivarDash">▶ Activar Hoja de Decisiones — Ronda ${ronda.currentRound}</button>`
        : ronda.roundState === 'open'
        ? `<button class="btn btn-warning" id="btnPreSimDash">📊 Pre-simular (notificar demanda)</button>
           <button class="btn btn-ghost"   id="btnCerrarDash">🔒 Cerrar envíos</button>`
        : ronda.roundState === 'locked'
        ? `<button class="btn btn-warning" id="btnPreSimDash">📊 Pre-simular (notificar demanda)</button>
           <button class="btn btn-primary" id="btnSimularDash">⚡ Ejecutar Simulación (sin pre-sim)</button>`
        : ronda.roundState === 'pre-sim'
        ? `<button class="btn btn-primary" id="btnSimularDash">⚡ Ejecutar Simulación Final — Ronda ${ronda.currentRound}</button>
           <button class="btn btn-ghost"   id="btnForzarTodosDash">⏩ Forzar confirmaciones pendientes</button>`
        : ronda.currentRound < ronda.totalRounds
        ? `<button class="btn btn-success" id="btnSiguienteDash">→ Abrir Ronda ${ronda.currentRound + 1}</button>`
        : `<span class="badge badge-simulated" style="padding:8px 16px">🏆 Simulación completada — 20 rondas</span>`}
      <button class="btn btn-ghost" id="btnRefreshDash">↺ Actualizar</button>
    </div>

    ${bottomHTML}
  `;

  async function doActivarRonda() {
    if (!confirm('¿Activar la hoja de decisiones para la Ronda ' + ronda.currentRound + '?\n\nLos equipos podrán ingresar y enviar sus decisiones.')) return;
    try {
      await api('POST', '/admin/ronda/activar');
      toast('✅ Hoja de decisiones activada — Ronda ' + ronda.currentRound, 'success');
      await loadAdminDashboard();
    } catch(e) { toast(e.message, 'error'); }
  }

  document.getElementById('btnActivarDash')?.addEventListener('click', doActivarRonda);
  async function doPreSimular() {
    if (!confirm('¿Ejecutar pre-simulación para la Ronda ' + ronda.currentRound + '?\n\nSe calculará la demanda estimada y los equipos podrán confirmar.')) return;
    try {
      await api('POST', '/admin/ronda/pre-simular');
      toast('✅ Pre-simulación ejecutada', 'success');
      await loadAdminDashboard();
    } catch(e) { toast(e.message, 'error'); }
  }

  document.getElementById('btnPreSimDash')?.addEventListener('click', doPreSimular);
  async function doSimular(n) {
    const estado = ronda.roundState;
    // Leer shock elegido por el profesor (o 'aleatorio' si no tocó el selector)
    const shockOverride = document.getElementById('shockOverrideSelect')?.value || 'aleatorio';
    const shockLabel = document.getElementById('shockOverrideSelect')?.options[
      document.getElementById('shockOverrideSelect')?.selectedIndex]?.text || 'Aleatorio';

    const shockInfo = shockOverride !== 'aleatorio'
      ? '\n\n⚡ Shock seleccionado: ' + shockLabel
      : '\n\n🎲 Shock: aleatorio (el sistema decide)';

    const msg = estado === 'pre-sim'
      ? '¿Ejecutar Simulación FINAL de la Ronda ' + n + '?' + shockInfo + '\n\nTodos los resultados serán calculados.'
      : '¿Ejecutar Simulación de la Ronda ' + n + ' sin pre-simulación?' + shockInfo + '\n\nEsta acción no se puede deshacer.';
    if (!confirm(msg)) return;
    try {
      const btn = document.getElementById('btnSimularDash');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Ejecutando...'; }
      await api('POST', '/admin/simular', { ronda: n, shockOverride });
      toast('✅ Simulación completada — Ronda ' + n, 'success');
      await loadAdminDashboard();
    } catch(e) {
      toast(e.message, 'error');
      const btn = document.getElementById('btnSimularDash');
      if (btn) { btn.disabled = false; btn.textContent = '⚡ Ejecutar Simulación Final'; }
    }
  }

  document.getElementById('btnSimularDash')?.addEventListener('click', () => doSimular(ronda.currentRound));
  async function doCerrarRonda() {
    if (!confirm('¿Cerrar envíos de la Ronda ' + ronda.currentRound + '?\n\nLos equipos ya no podrán modificar ni enviar decisiones.')) return;
    try {
      await api('POST', '/admin/ronda/cerrar');
      toast('✅ Envíos cerrados — Ronda ' + ronda.currentRound, 'success');
      await loadAdminDashboard();
    } catch(e) { toast(e.message, 'error'); }
  }

  async function doForzarTodos() {
    if (!confirm('¿Forzar confirmación de pre-simulación para todos los equipos pendientes?\n\nLos equipos que no confirmaron serán marcados como confirmados.')) return;
    try {
      await api('POST', '/admin/presim/forzar-todos');
      toast('✅ Todas las confirmaciones forzadas', 'success');
      // Esperar que BD persista y recargar
      await new Promise(r => setTimeout(r, 1000));
      await loadAdminDashboard();
    } catch(e) { toast(e.message, 'error'); }
  }

  document.getElementById('btnCerrarDash')?.addEventListener('click',  doCerrarRonda);
  document.getElementById('btnForzarTodosDash')?.addEventListener('click', doForzarTodos);
  document.getElementById('btnSiguienteDash')?.addEventListener('click', async () => {
    try {
      await api('POST', '/admin/ronda/siguiente');
      toast('✅ Ronda siguiente abierta', 'success');
      await loadAdminDashboard();
    } catch(e) { toast(e.message, 'error'); }
  });
  document.getElementById('btnRefreshDash')?.addEventListener('click', loadAdminDashboard);

  if (ronda.roundState === 'simulated') renderAdminCharts();
}

// ── KPI Analysis Panel — buildAdminKPIHTML ────────────────────────────────
// 4 tabs por rol (mismos KPIs que ve el estudiante) en formato comparativo.
// Dependencias: eqs (array de resultados consolidados por empresa), tc() (colores)

function buildAdminKPIHTML(eqs, tc, pfx='kpi_') {

  // ── Helpers ──────────────────────────────────────────────────────────────
  const safe = (v) => (isNaN(v) || !isFinite(v) || v === null) ? null : v;
  const pct  = (v) => v != null ? (v*100).toFixed(1)+'%' : '—';
  const x2   = (v) => v != null ? v.toFixed(2)+'x' : '—';
  const bs   = (v) => {
    if (v === null || v === undefined) return '—';
    const n = Math.abs(Math.round(v)).toLocaleString('es-BO').replace(/,/g,'.');
    return v < 0 ? '(Bs. '+n+')' : 'Bs. '+n;
  };
  const num  = (v) => v != null ? Math.round(v).toLocaleString('es-BO').replace(/,/g,'.') : '—';
  const d2   = (v) => v != null ? (+v).toFixed(2) : '—';
  const d1   = (v) => v != null ? (+v).toFixed(1) : '—';

  const S = { verde:'#10B981', ambar:'#F59E0B', rojo:'#EF4444', gris:'#6B7280' };

  const semaforo = (v, ths) => {
    if (v === null || v === undefined || isNaN(v)) return S.gris;
    for (const t of ths) { if (v >= t.val) return t.color; }
    return ths[ths.length-1].color;
  };

  // Cabecera de columnas (equipos)
  const cols = eqs.length;
  const hdr = '<tr><th style="text-align:left;padding:7px 12px;font-size:.72rem;'
    +'min-width:210px;position:sticky;left:0;background:var(--bg2);z-index:2">Indicador</th>'
    + eqs.map((r,i) => '<th style="text-align:center;padding:7px 10px;font-size:.72rem;min-width:120px">'
        + '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+tc(i)+';margin-right:4px;vertical-align:middle"></span>'
        + r.equipoNombre + '</th>').join('') + '</tr>';

  const secRow = (label) => '<tr style="background:rgba(255,255,255,.04)">'
    + '<td colspan="' + (cols+1) + '" style="padding:5px 12px;font-family:var(--font-mono);font-size:.62rem;'
    + 'color:var(--text3);text-transform:uppercase;letter-spacing:1.2px">' + label + '</td></tr>';

  const kpiRow = (label, vals, fmtFn, ths, hint='') => {
    const cells = vals.map(v => {
      const color = semaforo(v, ths);
      const disp  = fmtFn(v);
      return '<td style="text-align:center;padding:6px 8px">'
        + '<div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px">'
        + '<span style="font-family:var(--font-mono);font-size:.82rem;font-weight:700;color:'+color+'">' + disp + '</span>'
        + '<span style="width:7px;height:7px;border-radius:50%;background:'+color+';display:inline-block"></span>'
        + '</div></td>';
    }).join('');
    const hintHtml = hint ? ' <span style="font-size:.68rem;color:var(--text3);cursor:help" title="'+hint+'">ⓘ</span>' : '';
    return '<tr style="border-bottom:1px solid rgba(255,255,255,.04)">'
      + '<td style="padding:6px 12px;font-size:.79rem;color:var(--text2);position:sticky;left:0;background:var(--bg);z-index:1">'
      + label + hintHtml + '</td>' + cells + '</tr>';
  };

  const tableWrap = (body) =>
    '<div class="table-wrap" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    + '<thead>' + hdr + '</thead><tbody>' + body + '</tbody></table></div>';

  // ── Cálculos por empresa ──────────────────────────────────────────────────
  const v = eqs.map(r => {
    const vN    = r.ventasNetas   || 0;
    const vB    = r.ventasBrutas  || 0;
    const uN    = r.utilidadNeta  || 0;
    const uB    = r.utilidadBruta || 0;
    const dep   = r.depreciacion  || 0;
    const ebit  = r.ebit          || 0;
    const deuda = r.deudaFinal    || 0;
    const pat   = r.patrimonio    || 1;
    const totA  = r.totalActivos  || 1;
    const caja  = r.cajaFinal     || 0;
    const cxc   = r.cxcFinal      || 0;
    const inv   = r.invFinalValorizado || 0;
    const actCor = caja + cxc + inv;
    const vend  = r.vendedoresFinales || 0;
    const prod  = r.produccion    || 0;
    const invU  = r.inventarioFinal || 0;
    const mktT  = r.pagoMktTotal  || 0;
    const pub   = r.publicidad    || 0;
    const demF  = r.demandaFormal || 0;
    const demA  = r.demandaAsignada || 0;
    const ventU = r.ventasReales  || 0;

    return {
      // ── TAB 1 MARKETING ───────────────────────────────────
      shareReal:    r.shareReal ?? null,
      demandaFormal: demF,
      demandaAsign:  demA,
      ventasReales:  ventU,
      pctCapturada: demF > 0 ? safe(ventU / demF) : null,
      ventasBrutas: vB,
      ventasNetas:  vN,
      mBruto:       vN > 0 ? safe(uB / vN) : null,
      precioVenta:  r.precioVenta || 0,
      costoUnit:    r.costoUnitario || 0,
      margenUnit:   (r.precioVenta||0) - (r.costoUnitario||0),
      pubGasto:     pub,
      mktTotal:     mktT,
      roiMkt:       r.roiMarketing ?? null,
      costoMktUnd:  ventU > 0 ? safe(mktT / ventU) : null,
      ingPorPub:    pub > 0 ? safe(vN / pub) : null,
      brandEquity:  r.brandEquityFinal ?? 50,
      atractivo:    r.atractivo ?? null,

      // ── TAB 2 PRODUCCIÓN ──────────────────────────────────
      produccion:   prod,
      invInicial:   r.inventarioInicial || 0,
      invFinalU:    invU,
      invPct:       prod > 0 ? safe(invU / prod * 100) : null,
      capEfectiva:  r.capacidadEfectiva ?? null,
      costoUnitP:       r.costoUnitario || 0,
      costoBase_p:      r.costoTransformacion || Math.round((r.costoBaseProducto||0) * 0.60 * 100)/100,
      costoCalidad_p:   r.costoCalidadUnit  || 0,
      costoCanal_p:     Math.max(0, r.costoCanal_calc ?? Math.round(((r.costoUnitario||0) - (r.costoTransformacion||0) - (r.costoCalidadUnit||0) - Math.round((r.costoMPunitario||0)*0.87*100)/100)*100)/100),
      costoMP_p:        r.costoMPunitario || 0,  // precio factura proveedor
      proveedor_p:      r.proveedorElegido  || '—',
      stockMP:          r.stockMPFinal      ?? null,

      // ── TAB 3 RRHH ────────────────────────────────────────
      vendFin:      vend,
      ventasPorVend: vend > 0 ? safe(ventU / vend) : null,
      ingPorVend:   vend > 0 ? safe(vN / vend) : null,
      operarios:    r.operariosFinales ?? null,
      costoOper:    r.costoOperarios ?? null,

      // ── TAB 4 FINANCIERO ──────────────────────────────────
      costoUnitF:   r.costoUnitario || 0,
      utilPorUnd:   ventU > 0 ? safe((vN - (r.costoVentas||0)) / ventU) : null,
      mNeto:        vN > 0 ? safe(uN / vN) : null,
      utilNeta:     uN,
      ebitVal:      ebit,
      cajaFin:      caja,
      sobregiro:    r.sobregiro || 0,
      deudaTot:     deuda,
      endeud:       totA > 0 ? safe(deuda / totA) : null,
      liquidez:     deuda > 0 ? safe(actCor / deuda) : null,
      roa:          safe(uN / totA),
      roe:          safe(uN / pat),
      ivaAPagar:    r.ivaAPagar ?? null,
      impIT:        r.impuestoIT ?? null,
      impIUE:       r.impuestoIUE ?? null,
      provIUE:      r.provisionIUE ?? null,
    };
  });

  // ── TAB 1 — Marketing ────────────────────────────────────────────────────
  const tab1 = tableWrap(
    secRow('🎯 Penetración y Posicionamiento')
    + kpiRow('Market Share real', v.map(e=>e.shareReal), pct,
        [{val:.30,color:S.verde},{val:.15,color:S.ambar},{val:0,color:S.rojo}],
        '% del mercado capturado. >30% líder · 15-30% competitivo · <15% débil')
    + kpiRow('Demanda formal del segmento (unid)', v.map(e=>e.demandaFormal), num,
        [{val:0,color:S.gris}], 'Demanda total disponible en el segmento (incluye efecto shock)')
    + kpiRow('Demanda asignada a la empresa (unid)', v.map(e=>e.demandaAsign), num,
        [{val:0,color:S.ambar}], 'Demanda captada según atractivo competitivo')
    + kpiRow('Unidades vendidas', v.map(e=>e.ventasReales), num,
        [{val:0,color:S.ambar}], 'min(demanda asignada, inventario disponible)')
    + kpiRow('% Demanda capturada', v.map(e=>e.pctCapturada), pct,
        [{val:.80,color:S.verde},{val:.50,color:S.ambar},{val:0,color:S.rojo}],
        'Ventas/Demanda formal. >80% excelente · <50% baja cobertura')
    + secRow('💰 Rentabilidad Comercial')
    + kpiRow('Ventas brutas (Bs)', v.map(e=>e.ventasBrutas), bs,
        [{val:0,color:S.ambar}])
    + kpiRow('Ventas netas (Bs)', v.map(e=>e.ventasNetas), bs,
        [{val:0,color:S.ambar}])
    + kpiRow('Margen bruto (%)', v.map(e=>e.mBruto), pct,
        [{val:.40,color:S.verde},{val:.20,color:S.ambar},{val:0,color:S.rojo}],
        'Utilidad Bruta/Ventas Netas. >40% excelente · <20% bajo')
    + kpiRow('Precio de venta (Bs)', v.map(e=>e.precioVenta), bs,
        [{val:0,color:S.gris}])
    + kpiRow('Costo unitario (Bs)', v.map(e=>e.costoUnit), bs,
        [{val:0,color:S.gris}])
    + kpiRow('Margen unitario (Bs)', v.map(e=>e.margenUnit), bs,
        [{val:20,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}],
        'Precio − Costo unitario. Debe ser positivo para cubrir gastos fijos')
    + secRow('📢 Marketing e Inversión')
    + kpiRow('Gasto publicidad (Bs)', v.map(e=>e.pubGasto), bs,
        [{val:0,color:S.gris}])
    + kpiRow('Gasto total marketing (Bs)', v.map(e=>e.mktTotal), bs,
        [{val:0,color:S.gris}])
    + kpiRow('ROI Marketing (x)', v.map(e=>e.roiMkt), x2,
        [{val:2,color:S.verde},{val:1,color:S.ambar},{val:0,color:S.rojo}],
        'Retorno por Bs invertido en marketing. >2x excelente · <1x ineficiente')
    + kpiRow('Costo Mkt por unidad vendida (Bs)', v.map(e=>e.costoMktUnd), bs,
        [{val:0,color:S.gris}], 'Gasto total marketing / unidades vendidas')
    + kpiRow('Ingresos por Bs 1 de publicidad (x)', v.map(e=>e.ingPorPub), x2,
        [{val:3,color:S.verde},{val:1,color:S.ambar},{val:0,color:S.rojo}],
        'Ventas netas / gasto en publicidad. >3x eficiente · <1x ineficiente')
    + secRow('⭐ Marca y Posicionamiento')
    + kpiRow('Brand Equity (pts)', v.map(e=>e.brandEquity), d1,
        [{val:70,color:S.verde},{val:50,color:S.ambar},{val:0,color:S.rojo}],
        'Valor acumulado de marca. >70 fuerte · 50-70 en construcción · <50 débil')
    + kpiRow('Atractivo competitivo (pts)', v.map(e=>e.atractivo), d2,
        [{val:10,color:S.verde},{val:5,color:S.ambar},{val:0,color:S.rojo}],
        'Score logit de atractivo. Determina el market share')
  );

  // ── TAB 2 — Producción ───────────────────────────────────────────────────
  const tab2 = tableWrap(
    secRow('🏭 Volumen y Capacidad')
    + kpiRow('Producción (pares)', v.map(e=>e.produccion), num,
        [{val:0,color:S.ambar}])
    + kpiRow('Inventario inicial (pares)', v.map(e=>e.invInicial), num,
        [{val:0,color:S.gris}])
    + kpiRow('Inventario final (pares)', v.map(e=>e.invFinalU), num,
        [{val:0,color:S.verde},{val:100,color:S.ambar},{val:500,color:S.rojo}].reverse(),
        'Inventario alto = sobreproducción o baja demanda')
    + kpiRow('Inventario / Producción (%)', v.map(e=>e.invPct), d1,
        [{val:0,color:S.verde},{val:20,color:S.ambar},{val:40,color:S.rojo}].reverse(),
        '% no vendido. <20% eficiente · >40% sobreproducción preocupante')
    + kpiRow('Capacidad efectiva (pares)', v.map(e=>e.capEfectiva), num,
        [{val:0,color:S.gris}], 'Operarios × Productividad × Factor capacitación')
    + secRow('💰 Costos de Producción')
    + kpiRow('Costo unitario TOTAL (Bs)', v.map(e=>e.costoUnitP), bs,
        [{val:0,color:S.gris}], 'CostoBase + Calidad + Canal ± Innovación + MP proveedor')
    + kpiRow('  └ Transformación (MOD+overhead, Bs)', v.map(e=>e.costoBase_p), bs,
        [{val:0,color:S.gris}], 'Costo base fijo definido por la industria para este producto')
    + kpiRow('  └ Factor calidad (Bs)', v.map(e=>e.costoCalidad_p), bs,
        [{val:0,color:S.gris}], '0.20 × nivel de calidad elegido')
    + kpiRow('  └ Costo canal distribución (Bs)', v.map(e=>Math.max(0,e.costoCanal_p)), bs,
        [{val:0,color:S.gris}], 'Costo adicional por unidad según canal principal y secundario')
    + kpiRow('  └ MP proveedor — factura (Bs)', v.map(e=>e.costoMP_p), bs,
        [{val:0,color:S.verde}], 'costoMP × unidadesMPporUnidad — 0 si no hay proveedor configurado')
    + kpiRow('Stock MP disponible (unid)', v.map(e=>e.stockMP), num,
        [{val:0,color:S.gris}], 'Inventario de materia prima al cierre del trimestre')
  );

  // ── TAB 3 — RRHH ─────────────────────────────────────────────────────────
  const tab3 = tableWrap(
    secRow('👥 Fuerza de Ventas')
    + kpiRow('Vendedores finales (por producto)', v.map(e=>e.vendFin), num,
        [{val:3,color:S.verde},{val:1,color:S.ambar},{val:0,color:S.rojo}])
    + kpiRow('Ventas por vendedor (unid / producto)', v.map(e=>e.ventasPorVend), num,
        [{val:200,color:S.verde},{val:100,color:S.ambar},{val:0,color:S.rojo}],
        'Productividad comercial: unidades vendidas / vendedores por producto')
    + kpiRow('Ingresos netos por vendedor (Bs / producto)', v.map(e=>e.ingPorVend), bs,
        [{val:50000,color:S.verde},{val:20000,color:S.ambar},{val:0,color:S.rojo}],
        'Ventas netas / vendedores por producto. Mide eficiencia de la fuerza de ventas')
    + secRow('🏭 Personal de Planta')
    + kpiRow('Operarios finales (por producto)', v.map(e=>e.operarios), num,
        [{val:0,color:S.gris}])
    + kpiRow('Costo operarios (Bs / producto)', v.map(e=>e.costoOper), bs,
        [{val:0,color:S.gris}], 'Sueldos operarios por línea de producto (específico)')
  );

  // ── TAB 4 — Financiero ───────────────────────────────────────────────────
  const tab4 = tableWrap(
    secRow('📊 Rentabilidad')
    + kpiRow('Costo unitario (Bs)', v.map(e=>e.costoUnitF), bs,
        [{val:0,color:S.gris}], 'CostoBase + CalidadFactor + CostoCanal ± Innovación')
    + kpiRow('Utilidad por unidad vendida (Bs)', v.map(e=>e.utilPorUnd), bs,
        [{val:20,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}],
        '(Ventas Netas − Costo de Ventas) / Unidades vendidas')
    + kpiRow('Margen bruto (%)', v.map(e=>e.mBruto), pct,
        [{val:.40,color:S.verde},{val:.20,color:S.ambar},{val:0,color:S.rojo}])
    + kpiRow('Margen neto (%)', v.map(e=>e.mNeto), pct,
        [{val:.10,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}])
    + kpiRow('Utilidad neta (Bs)', v.map(e=>e.utilNeta), bs,
        [{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}])
    + kpiRow('EBIT (Bs)', v.map(e=>e.ebitVal), bs,
        [{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}],
        'Resultado operativo antes de intereses e impuestos')
    + kpiRow('ROA (%)', v.map(e=>e.roa), pct,
        [{val:.10,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}],
        'Utilidad Neta / Activos Totales. >10% excelente')
    + kpiRow('ROE (%)', v.map(e=>e.roe), pct,
        [{val:.15,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}],
        'Utilidad Neta / Patrimonio. >15% excelente')
    + secRow('💧 Posición de Caja y Deuda')
    + kpiRow('Caja final (Bs)', v.map(e=>e.cajaFin), bs,
        [{val:50000,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}])
    + kpiRow('Sobregiro (Bs)', v.map(e=>e.sobregiro), bs,
        [{val:0,color:S.verde},{val:0,color:S.ambar}],
        'Caja negativa → sobregiro automático con tasa de penalidad')
    + kpiRow('Deuda total (Bs)', v.map(e=>e.deudaTot), bs,
        [{val:0,color:S.verde},{val:50000,color:S.ambar},{val:200000,color:S.rojo}].reverse())
    + kpiRow('Endeudamiento (Deuda/Activos)', v.map(e=>e.endeud), pct,
        [{val:0,color:S.verde},{val:.30,color:S.ambar},{val:.50,color:S.rojo}].reverse(),
        '<30% bajo · 30-50% moderado · >50% alto')
    + kpiRow('Liquidez corriente (x)', v.map(e=>e.liquidez), x2,
        [{val:1.5,color:S.verde},{val:1.0,color:S.ambar},{val:0,color:S.rojo}],
        'Activo Corriente / Deuda. >1.5 sólida · <1.0 riesgo')
    + secRow('🧾 Impuestos')
    + kpiRow('IVA neto pagado (Bs)', v.map(e=>e.ivaAPagar), bs,
        [{val:0,color:S.gris}])
    + kpiRow('IT pagado (Bs)', v.map(e=>e.impIT), bs,
        [{val:0,color:S.gris}])
    + kpiRow('IUE pagado (Bs)', v.map(e=>e.impIUE), bs,
        [{val:0,color:S.gris}], 'Pago anual — aparece cada 4 trimestres')
    + kpiRow('Provisión IUE (Bs)', v.map(e=>e.provIUE), bs,
        [{val:0,color:S.gris}], 'Acumulación trimestral del IUE estimado')
  );

  // ── Ensamblado con 4 tabs ─────────────────────────────────────────────────
  const tabBar = '<div id="' + pfx + 'TabBar" style="display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:10px;flex-wrap:wrap">'
    + '<button class="btn btn-primary btn-sm" id="' + pfx + 'btn1" onclick="adminKPITab(1,\''+pfx+'\')">📣 Marketing</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn2" onclick="adminKPITab(2,\''+pfx+'\')">🏭 Producción</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn3" onclick="adminKPITab(3,\''+pfx+'\')">👥 RRHH</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn4" onclick="adminKPITab(4,\''+pfx+'\')">💰 Financiero</button>'
    + '<div style="flex:1"></div>'
    + '<button class="btn btn-ghost btn-sm" onclick="printPanel(\'' + pfx + 'Content\',\'Análisis KPI Financiero\',\'Ronda actual\')">🖨️ Imprimir</button>'
    + '</div>';

  const leyenda = '<div style="display:flex;gap:16px;margin-bottom:10px;font-size:.74rem;color:var(--text3)">'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:4px"></span>Óptimo</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F59E0B;margin-right:4px"></span>Precaución</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF4444;margin-right:4px"></span>Riesgo</span>'
    + '<span style="margin-left:auto;font-style:italic">Hover en ⓘ para ver definición del indicador</span>'
    + '</div>';

  return '<div id="' + pfx + 'Content">' + leyenda + tabBar
    + '<div id="' + pfx + 'pane1">' + tab1 + '</div>'
    + '<div id="' + pfx + 'pane2" style="display:none">' + tab2 + '</div>'
    + '<div id="' + pfx + 'pane3" style="display:none">' + tab3 + '</div>'
    + '<div id="' + pfx + 'pane4" style="display:none">' + tab4 + '</div>'
    + '</div>';
}

window.adminKPITab = (n, pfx) => {
  // F7-FIX: pfx identifica la instancia correcta de los tabs KPI
  [1,2,3,4].forEach(i => {
    const p = document.getElementById(pfx ? pfx+'pane'+i : 'adminKPIPane'+i);
    const b = document.getElementById(pfx ? pfx+'btn'+i  : 'btnKPI'+i);
    if (p) p.style.display = i===n ? '' : 'none';
    if (b) b.className    = i===n ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  });
};


// ── Vista estudiante por equipo (para toggle Opción B) ───────────────────────
// Reutiliza exactamente el mismo HTML que ve el estudiante en loadEquipoFinanciero
function buildVistaEstudiantePorEquipo(rd, tab) {
  if (!rd.resultados?.length) return '<p style="color:var(--text3);padding:20px">Sin resultados</p>';
  const eqs = rd.resultados;
  const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899'];
  const fmt = { bs: v => 'Bs ' + Math.round(Math.abs(v||0)).toLocaleString('es'),
                num: v => Math.round(v||0).toLocaleString('es'),
                pct: v => ((v||0)*100).toFixed(1)+'%' };

  return eqs.map((r, idx) => {
    const color  = COLORS[idx % COLORS.length];
    const nombre = r.equipoNombre || r.equipo || 'Equipo '+(idx+1);

    // Encabezado del equipo
    let html = '<div style="background:var(--bg2);border:0.5px solid var(--border);'
      + 'border-left:4px solid '+color+';border-radius:var(--r);padding:16px 20px;margin-bottom:16px">'
      + '<div style="font-weight:700;font-size:.9rem;color:'+color+';margin-bottom:14px;letter-spacing:.3px">'+nombre+'</div>';

    if (tab === 'pl') {
      // ── ER por producto (multiproducto) ──
      if (r.productos && r.productos.length > 1) {
        const PROD_COLORS2 = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899'];
        const fR2 = (lbl,v,neg,tipo) => {
          const val=neg?-(v||0):(v||0);
          const col=tipo==='pos'?'var(--accent2)':tipo==='neg'?'var(--accent4)':'var(--text1)';
          return '<tr><td style="padding:3px 8px;font-size:.74rem;color:var(--text2)">'+lbl+'</td>'
            +'<td style="padding:3px 8px;text-align:right;font-family:var(--font-mono);font-size:.74rem;color:'+col+'">'
            +(val<0?'(':'')+'Bs '+Math.round(Math.abs(val)).toLocaleString('es')+(val<0?')':'')+'</td></tr>';
        };
        const fRS2 = (lbl,v) => {
          const col=(v||0)>=0?'var(--accent2)':'var(--accent4)';
          return '<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px;font-size:.74rem;font-weight:700">'+lbl+'</td>'
            +'<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);font-size:.74rem;font-weight:700;color:'+col+'">'
            +'Bs '+Math.round(v||0).toLocaleString('es')+'</td></tr>';
        };
        const cards2 = r.productos.map((p,i) => {
          const col = PROD_COLORS2[i % PROD_COLORS2.length];
          const utilColor = (p.utilidadNeta||0)>=0?'var(--accent2)':'var(--accent4)';
          const ebit = p.ebit??((p.utilidadBruta||0)-(p.gastosOp||0));
          const ub2       = p.utilidadBruta||0;
          const mbColor2  = ub2>=0?'var(--accent2)':'var(--accent4)';
          const mbPct2    = (p.ventasNetas||0)>0?(ub2/(p.ventasNetas)*100).toFixed(1)+'%':'—';
          const mnPct2    = (p.ventasNetas||0)>0?((p.utilidadNeta||0)/(p.ventasNetas)*100).toFixed(1)+'%':'—';
          return '<div style="background:var(--bg3);border:0.5px solid var(--border);border-top:3px solid '+col
            +';border-radius:var(--r);padding:10px 12px;min-width:180px;flex:1">'
            +'<div style="font-weight:700;font-size:.75rem;color:'+col+';margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(p.producto||'Prod '+(i+1))+'</div>'
            +'<table style="width:100%;border-collapse:collapse">'
            +fR2('Ventas netas',p.ventasNetas||0,false,'neutral')
            +fR2('(−) Costo ventas',p.costoVentas||0,true,'neg')
            +fRS2('= Util. bruta',ub2)
            +'<tr><td style="padding:2px 8px;font-size:.7rem;color:var(--text3)">Margen bruto</td>'
            +'<td style="padding:2px 8px;text-align:right;font-family:var(--font-mono);font-size:.7rem;color:'+mbColor2+'">'+mbPct2+'</td></tr>'
            +fR2('(−) Gastos op.',p.gastosOp||0,true,'neg')
            +fRS2('= EBIT',ebit)
            +fR2('(−) IT',p.impuestoIT||0,true,'neg')
            +'<tr style="border-top:2px solid var(--border2)">'
            +'<td style="padding:4px 8px;font-size:.74rem;font-weight:700">= Util. neta</td>'
            +'<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);font-size:.74rem;font-weight:700;color:'+utilColor+'">'
            +'Bs '+Math.round(p.utilidadNeta||0).toLocaleString('es')+'</td></tr>'
            +'<tr><td style="padding:2px 8px;font-size:.7rem;color:var(--text3)">Margen neto</td>'
            +'<td style="padding:2px 8px;text-align:right;font-family:var(--font-mono);font-size:.7rem;color:'+utilColor+'">'+mnPct2+'</td></tr>'
            +'</table></div>';
        }).join('');
        html += '<div style="font-family:var(--font-mono);font-size:.6rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:4px 0 8px;border-bottom:1px solid var(--border);margin-bottom:8px">📦 ER por Producto</div>'
          +'<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:12px">'+cards2+'</div>'
          +'<div style="font-family:var(--font-mono);font-size:.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-bottom:6px">📋 ER Consolidado</div>';
      }
      // ── ER consolidado ──
      const sec = lbl => '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-top:4px">'+lbl+'</div>';
      html += finRow('Precio facturado al cliente', r.totalFacturado||0, false,'neutral')
        + finRow('(−) IVA débito fiscal (13%)', -(r.ivaDebito||0), false,'neg')
        + finRowSub('= Ventas brutas (sin IVA)', r.ventasBrutas||0, true)
        + finRow('(−) Comisiones canal (neto)', -(r.comisionesNeto||Math.round((r.comisiones||0)*0.87)), false,'neg')
        + finRowSub('= Ventas netas', r.ventasNetasReal||r.ventasNetas||0, true)
        + finRow('(−) Costo de ventas', -(r.costoVentas||0), false,'neg')
        + finRowSub('= Utilidad bruta', r.utilidadBruta||0, true)
        + sec('(-) Gastos Comerciales')
        + finRow('Publicidad',              -(r.gastoPublicidad||Math.round((r.publicidad||0)*0.87)),         false,'neg')
        + finRow('Promoción',               -(r.gastoPromocion||Math.round((r.promocion||0)*0.87)),          false,'neg')
        + finRow('Eventos',                 -(r.gastoEventos||Math.round((r.eventos||0)*0.87)),            false,'neg')
        + finRow('Marketing en redes',      -(r.gastoMktRedes||Math.round((r.marketingRedes||0)*0.87)),     false,'neg')
        + finRow('Relaciones públicas',     -(r.gastoRRPP||Math.round((r.relacionesPublicas||0)*0.87)), false,'neg')
        + finRow('Fuerza de ventas',        -(r.costoVendedores||0),    false,'neg')
        + sec('(-) Gastos Administrativos')
        + finRow('Sueldos administrativos (operarios)', -(r.pagoOperarios||r.costoOperarios||0), false,'neg')
        + finRow('Gastos administrativos fijos',        -(r.gastoAdminFijo||0), false,'neg')
        + sec('(-) Gastos Operativos de Planta')
        + finRow('Gasto fijo de planta',    -(r.gastoFijoPlanta||0),    false,'neg')
        + finRow('Almacenamiento',          -(r.costoAlmacenamiento||0),false,'neg')
        + ((r.gastoInnovacion||0)>0 ? finRow('Innovación / desarrollo',-(r.gastoInnovacionNeto||Math.round((r.gastoInnovacion||0)*0.87)),false,'neg') : '')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= EBITDA', (r.ebit??0)+(r.depreciacion??0), true)
        + finRow('(-) Depreciación', -(r.depreciacion||0), false,'neg')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= EBIT / Utilidad Operativa', r.ebit??0, true)
        + sec('(-) Gastos Financieros')
        + finRow('Intereses préstamo', -(r.interesesPrestamo||0), false,'neg')
        + ((r.comisionApertura||0)>0 ? finRow('Comisión apertura', -(r.comisionApertura||0), false,'neg') : '')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= Utilidad antes de impuestos', (r.ebit??0)-(r.gastoFinanciero??0), true)
        + sec('(-) Impuestos')
        + finRow('IT (3% precio facturado)', -(r.impuestoIT||0), false,'neg')
        + ((r.impuestoIUE||0)>0 ? finRow('IUE (25% utilidad gravable)', -(r.impuestoIUE||0), false,'neg') : '')
        + '<div style="margin:8px 0;padding:8px 10px;background:rgba(59,130,246,.07);border-radius:6px;border-left:3px solid #3B82F6;font-size:.73rem;color:var(--text3);line-height:1.6">'
        + '<strong style="color:#3B82F6">ⓘ IVA — tributo neutro (Ley 843)</strong><br>'
        + 'Débito: '+fmt.bs(r.ivaDebito||0)+' · Crédito: '+fmt.bs(r.ivaCredito||0)+' · <strong>Neto a pagar: '+fmt.bs(r.ivaAPagar||0)+'</strong></div>'
        + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
        + finRowSub('= Utilidad neta', r.utilidadNeta, true);

    } else if (tab === 'bg') {
      const sec = lbl => '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-top:6px">'+lbl+'</div>';
      const totalA  = (r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0)+(r.afNetos||0);  // ivaCredito ya compensado
      const totalP  = (r.deudaFinal||0)+(r.ivaAPagar||0);
      const capital = r.capitalContable ?? 0;
      const utilidad = r.utilidadNeta||0;
      const acumAnt = totalA - totalP - capital - utilidad;
      const cuadra  = Math.abs(totalA - totalP - (capital+acumAnt+utilidad)) < 2;
      html += sec('Activo Corriente')
        + finRow('Caja y bancos',              r.cajaFinal,           false,'pos')
        + finRow('Cuentas por cobrar (CxC)',   r.cxcFinal,            false,'neutral')
        + finRow('Inventarios',                r.invFinalValorizado,  false,'neutral')
        + finRowSub('= Total Activo Corriente', (r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0), false)
        + sec('Activo No Corriente')
        + finRow('Activos fijos netos', r.afNetos||0, false,'neutral')
        + finRowSub('= Total Activo No Corriente', r.afNetos||0, false)
        + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
        + finRowSub('= TOTAL ACTIVOS', r.totalActivos||(r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0)+(r.afNetos||0), true)
        + sec('Pasivo Corriente')
        + ((r.ivaAPagar||0)>0 ? finRow('IVA por pagar (saldo trimestre)', r.ivaAPagar, false,'neg') : '')
        + ((r.sobregiro||0)>0 ? finRow('Sobregiro bancario', r.sobregiro, false,'neg') : '')
        + finRow('Préstamos y deuda total', r.deudaFinal, false,'neg')
        + finRowSub('= Total Pasivo Corriente', totalP, false)
        + sec('Pasivo No Corriente')
        + finRow('Deuda largo plazo', 0, false,'neutral')
        + finRowSub('= Total Pasivo No Corriente', 0, false)
        + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
        + finRowSub('= TOTAL PASIVOS', totalP, true)
        + sec('Patrimonio')
        + finRow('Capital contable / social', capital, false,'neutral')
        + finRow('Resultados acumulados', acumAnt, false, acumAnt>=0?'pos':'neg')
        + finRow('Utilidad / pérdida del período', utilidad, false, utilidad>=0?'pos':'neg')
        + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
        + finRowSub('= TOTAL PATRIMONIO', totalA-totalP, true)
        + finRowSub('TOTAL PASIVOS + PATRIMONIO', totalA, true)
        + '<div style="margin-top:8px;padding:8px 12px;background:'+(cuadra?'rgba(6,255,165,.08)':'rgba(255,107,107,.08)')
        + ';border-radius:var(--r);font-size:.78rem;font-family:var(--font-mono)">'
        + (cuadra?'✓ Balance cuadra':'⚠ Verificar balance')
        + ' (Activos = '+fmt.bs(totalA)+' | P+P = '+fmt.bs(totalA)+')</div>';

    } else if (tab === 'fe') {
      const sec  = lbl => '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:6px 0;border-bottom:2px solid var(--border2);margin-bottom:4px">'+lbl+'</div>';
      const secS = lbl => '<div style="font-family:var(--font-mono);font-size:.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0">'+lbl+'</div>';
      const entOp = (r.cobrosContado||0);
      const salOp = (r.pagoProduccion||0)+(r.pagoOperarios2||r.pagoOperarios||r.costoOperarios||0)
        +(r.costoVendedores||0)+(r.pagoMktTotal||0)+(r.pagoInnovacion||0)
        +(r.pagoGastosAdmin||r.gastoAdminFijo||0)+(r.pagoGastosPlanta||r.gastoFijoPlanta||0)
        +(r.pagoAlmacenamiento||0)+(r.pagoIVA||0)+(r.pagoIT??r.impuestoIT??0)+(r.pagoIUE||0);
      const entFin = (r.ingresoPrestamo||0)+(r.sobregiro||0);
      const salFin = (r.pagoCapitalPrestamo||0)+(r.pagoIntereses||r.interesesPrestamo||0)
        +(r.interesSobregiro||0)+(r.comisionApertura||0);
      html += finRow('Caja inicial', r.cajaInicial, false,'neutral')
        + '<div style="height:12px"></div>'
        + sec('Flujo de Efectivo por Actividades de Operación')
        + secS('Entradas Operativas')
        + finRow('Cobros por ventas al contado', r.cobrosContado||0, false,'pos')
        + '<div style="height:4px"></div>'
        + secS('Salidas Operativas')
        + ((r.pagoProduccion||0)>0    ? finRow('Pago de producción',          -(r.pagoProduccion||0),  false,'neg') : '')
        + ((r.pagoOperarios2||r.pagoOperarios||r.costoOperarios||0)>0 ? finRow('Pago de operarios', -(r.pagoOperarios2||r.pagoOperarios||r.costoOperarios||0), false,'neg') : '')
        + ((r.costoVendedores||0)>0   ? finRow('Pago fuerza de ventas',       -(r.costoVendedores||0), false,'neg') : '')
        + ((r.pagoMktTotal||0)>0      ? finRow('Pago de marketing total',     -(r.pagoMktTotal||0),    false,'neg') : '')
        + ((r.pagoInnovacion||0)>0    ? finRow('Pago de innovación',          -(r.pagoInnovacion||0),  false,'neg') : '')
        + ((r.pagoGastosAdmin||r.gastoAdminFijo||0)>0  ? finRow('Pago gastos administrativos', -(r.pagoGastosAdmin||r.gastoAdminFijo||0), false,'neg') : '')
        + ((r.pagoGastosPlanta||r.gastoFijoPlanta||0)>0 ? finRow('Pago gastos de planta',     -(r.pagoGastosPlanta||r.gastoFijoPlanta||0), false,'neg') : '')
        + ((r.pagoIVA||0)>0  ? finRow('Pago IVA neto al Estado',   -(r.pagoIVA||0),  false,'neg') : '')
        + finRow('IT devengado período', -(r.impuestoIT||0), false,'neg')
        + ((r.compensacionIT||0)>0 ? finRow('(+) Compensado con saldo IUE (DS 5563)', +(r.compensacionIT||0), false,'pos') : '')
        + finRow('Pago IT efectivo en caja', -(r.pagoIT??r.impuestoIT??0), false, (r.pagoIT??r.impuestoIT??0)===0?'neutral':'neg')
        + ((r.pagoIUE||0)>0  ? finRow('Pago IUE',           -(r.pagoIUE||0),   false,'neg') : '')
        + ((r.saldoIUEfinal||0)>0 ? finRow('Saldo IUE compensable próx. trim.', r.saldoIUEfinal||0, false,'neutral') : '')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= Flujo Neto de Actividades de Operación', entOp-salOp, false)
        + '<div style="height:12px"></div>'
        + sec('Flujo de Efectivo por Actividades de Inversión')
        + secS('Entradas de Inversión')
        + finRow('Venta de activos fijos', r.ventaActivosFijos||0, false,'pos')
        + '<div style="height:4px"></div>'
        + secS('Salidas de Inversión')
        + finRow('Compra de activos fijos / maquinaria', -(r.compraActivosFijos||0), false,'neg')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= Flujo Neto de Actividades de Inversión', (r.ventaActivosFijos||0)-(r.compraActivosFijos||0), false)
        + '<div style="height:12px"></div>'
        + sec('Flujo de Efectivo por Actividades de Financiamiento')
        + secS('Entradas de Financiamiento')
        + ((r.ingresoPrestamo||0)>0 ? finRow('Ingreso por préstamo', r.ingresoPrestamo||0, false,'pos') : '')
        + '<div style="height:4px"></div>'
        + secS('Salidas de Financiamiento')
        + ((r.pagoIntereses||r.interesesPrestamo||0)>0 ? finRow('Pago intereses préstamo', -(r.pagoIntereses||r.interesesPrestamo||0), false,'neg') : '')
        + ((r.comisionApertura||0)>0 ? finRow('Pago comisión apertura', -(r.comisionApertura||0), false,'neg') : '')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= Flujo Neto de Actividades de Financiamiento', entFin-salFin, false)
        + '<div style="height:12px"></div>'
        + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
        + finRowSub('Aumento / Disminución Neta de Caja', (entOp-salOp)+(r.ventaActivosFijos||0)-(r.compraActivosFijos||0)+(entFin-salFin), false)
        + '<div style="height:4px"></div>'
        + finRowSub('= CAJA FINAL', r.cajaFinal, true);
    }

    html += '</div>';
    return html;
  }).join('');
}

// helper: wrap vista comparativa + vista estudiante con toggle
function withToggle(pfxId, tabKey, comparativaHTML, rd) {
  const btnId  = pfxId + '_togBtn_' + tabKey;
  const compId = pfxId + '_comp_'   + tabKey;
  const studId = pfxId + '_stud_'   + tabKey;
  return '<div>'
    + '<div style="display:flex;justify-content:flex-end;margin-bottom:10px">'
    + '<div style="display:inline-flex;border:0.5px solid var(--border);border-radius:var(--r);overflow:hidden;font-size:.75rem">'
    + '<button id="' + btnId + '_c" onclick="toggleVistaAdmin(\'' + compId + '\',\'' + studId + '\',\'' + btnId + '\')" '
    + 'style="padding:5px 12px;background:var(--accent);color:#fff;border:none;cursor:pointer">Vista comparativa</button>'
    + '<button id="' + btnId + '_s" onclick="toggleVistaAdmin(\'' + studId + '\',\'' + compId + '\',\'' + btnId + '\')" '
    + 'style="padding:5px 12px;background:transparent;border:none;cursor:pointer;color:var(--text2)">Vista por equipo</button>'
    + '</div></div>'
    + '<div id="' + compId + '">' + comparativaHTML + '</div>'
    + '<div id="' + studId + '" style="display:none">' + buildVistaEstudiantePorEquipo(rd, tabKey) + '</div>'
    + '</div>';
}

window.toggleVistaAdmin = (showId, hideId, btnId) => {
  const show = document.getElementById(showId);
  const hide = document.getElementById(hideId);
  if (show) show.style.display = '';
  if (hide) hide.style.display = 'none';
  // Actualizar estilos de botones
  const bComp = document.getElementById(btnId + '_c');
  const bStud = document.getElementById(btnId + '_s');
  if (bComp && bStud) {
    const showIsComp = showId.includes('_comp_');
    bComp.style.background = showIsComp ? 'var(--accent)' : 'transparent';
    bComp.style.color       = showIsComp ? '#fff' : 'var(--text2)';
    bStud.style.background  = showIsComp ? 'transparent' : 'var(--accent)';
    bStud.style.color       = showIsComp ? 'var(--text2)' : '#fff';
  }
};

function buildAdminResultsHTML(rd) {
  if (!rd.resultados?.length) return '';

  // F7-FIX: pfx definido al inicio para que withToggle pueda usarlo
  const pfx = 'ef_r' + (rd.ronda || 'x') + '_';

  // ── Paleta de colores por empresa ─────────────────────────
  const PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6',
                   '#EC4899','#06FFA5','#84CC16','#F97316'];
  const tc = i => PALETTE[i % PALETTE.length];

  // ── Formato boliviano ─────────────────────────────────────
  // Positivo: Bs. 1.234.567   Negativo: (Bs. 1.234.567)   Cero: Bs. 0
  const bsBO = v => {
    if (v === null || v === undefined || isNaN(v)) return '<span style="color:var(--text3)">—</span>';
    const n = Math.round(Math.abs(v));
    const s = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (v < 0)  return '<span style="color:#EF4444">(Bs. ' + s + ')</span>';
    if (v === 0) return '<span style="color:var(--text3)">Bs. 0</span>';
    return '<span style="color:#10B981">Bs. ' + s + '</span>';
  };
  const numBO = v => {
    if (!v && v !== 0) return '—';
    return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  const pctBO = v => v != null ? (v*100).toFixed(1)+'%' : '—';

  // Equipos ordenados por utilidad neta desc (para Dashboard ranking)
  const equipos = [...rd.resultados].sort((a,b) => (b.utilidadNeta||0)-(a.utilidadNeta||0));
  // Mantener orden original para columnas de tabla
  const eqs = rd.resultados;
  const N   = eqs.length;

  // ── Helpers de filas de tabla ─────────────────────────────
  const thStyle = (i) =>
    'padding:8px 12px;text-align:right;font-size:.72rem;white-space:nowrap;'
    +'border-bottom:2px solid var(--border2);background:var(--bg2);';
  const thFirst =
    'padding:8px 14px;text-align:left;font-size:.72rem;position:sticky;left:0;'
    +'background:var(--bg2);z-index:2;min-width:220px;border-bottom:2px solid var(--border2);';

  const hdr = () => {
    const cols = eqs.map((r,i) =>
      '<th style="'+thStyle(i)+'"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+tc(i)+';margin-right:5px;vertical-align:middle"></span>'
      + r.equipoNombre + '</th>'
    ).join('');
    return '<tr><th style="'+thFirst+'">Partida</th>'+cols+'</tr>';
  };

  // Tipo 1: sección
  const sec = (label) =>
    '<tr style="background:rgba(255,255,255,.04)">'
    +'<td style="padding:5px 14px;position:sticky;left:0;background:rgba(255,255,255,.04);z-index:1;font-family:var(--font-mono);font-size:.62rem;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px" colspan="'+(N+1)+'">'+label+'</td>'
    +'</tr>';

  // Tipo 2: partida normal
  const row = (label, fn, indent=false) => {
    const vals = eqs.map(r => '<td style="padding:5px 12px;text-align:right;font-family:var(--font-mono);font-size:.8rem;border-bottom:1px solid rgba(255,255,255,.04)">'+bsBO(fn(r))+'</td>').join('');
    const lStyle = 'padding:5px 14px;font-size:.78rem;color:var(--text2);border-bottom:1px solid rgba(255,255,255,.04);position:sticky;left:0;background:var(--bg);z-index:1;'+(indent?'padding-left:26px;':'');
    return '<tr><td style="'+lStyle+'">'+(indent?'<span style="color:var(--text3);margin-right:4px">(−)</span>':'')+label+'</td>'+vals+'</tr>';
  };

  // Tipo 3: subtotal / total
  const tot = (label, fn, highlight=false) => {
    const bg = highlight ? 'rgba(6,255,165,.07)' : 'rgba(255,255,255,.04)';
    const border = highlight ? '2px solid rgba(6,255,165,.3)' : '1px solid var(--border2)';
    const vals = eqs.map(r => {
      const v = fn(r);
      return '<td style="padding:6px 12px;text-align:right;font-family:var(--font-mono);font-size:.82rem;font-weight:700;border-top:'+border+';background:'+bg+'">'+bsBO(v)+'</td>';
    }).join('');
    return '<tr><td style="padding:6px 14px;font-weight:700;font-size:.79rem;border-top:'+border+';background:'+bg+';position:sticky;left:0;z-index:1">'+label+'</td>'+vals+'</tr>';
  };

  // ── PESTAÑA 1: DASHBOARD ──────────────────────────────────
  const semaforo = r => {
    const u = r.utilidadNeta||0;
    if (u > 0)         return '🟢';
    if (u > -50000)    return '🟡';
    return '🔴';
  };

  const dashRows = equipos.map((r,rank) => {
    const origIdx = eqs.findIndex(e => e.equipoNombre === r.equipoNombre);
    const hl = rank === 0 ? 'background:rgba(6,255,165,.07);font-weight:700;' : '';
    const alertaCuadreHTML = r._alertaCuadre
      ? '<span class="badge badge-alert" title="Divergencia: '+r._alertaCuadre.divergencia+' Bs | Patrimonio real: '+r._alertaCuadre.patrimonioReal+' | Reconstruido: '+r._alertaCuadre.patrimonioReconstruido+'">⚠ CUADRE</span>'
      : '';
    return '<tr style="'+hl+'border-bottom:1px solid var(--border)">'
      + '<td style="padding:7px 12px;text-align:center;font-weight:700;color:'+tc(origIdx)+'">'+( rank+1)+'</td>'
      + '<td style="padding:7px 12px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+tc(origIdx)+';margin-right:6px;vertical-align:middle"></span>'+r.equipoNombre+'</td>'
      + '<td style="padding:7px 12px;text-align:right;font-family:var(--font-mono)">'+numBO(r.ventasReales)+'</td>'
      + '<td style="padding:7px 12px;text-align:right;font-family:var(--font-mono)">'+bsBO(r.ebit||0)+'</td>'
      + '<td style="padding:7px 12px;text-align:right;font-family:var(--font-mono)"><strong>'+bsBO(r.utilidadNeta||0)+'</strong></td>'
      + '<td style="padding:7px 12px;text-align:right;font-family:var(--font-mono)">'+bsBO(r.cajaFinal||0)+'</td>'
      + '<td style="padding:7px 12px;text-align:right;font-family:var(--font-mono)">'+(r.roiMarketing!=null?Math.round(r.roiMarketing*100)/100+'x':'—')+'</td>'
      + '<td style="padding:7px 12px;text-align:center;font-size:1rem">'+semaforo(r)+' '+alertaCuadreHTML+'</td>'
      + '</tr>';
  }).join('');

  const dashHTML = '<div class="table-wrap">'
    + '<table><thead><tr>'
    + '<th style="padding:7px 12px;text-align:center">#</th>'
    + '<th style="padding:7px 12px">Empresa</th>'
    + '<th style="padding:7px 12px;text-align:right">Ventas<br>unid.</th>'
    + '<th style="padding:7px 12px;text-align:right">EBIT</th>'
    + '<th style="padding:7px 12px;text-align:right">Utilidad<br>Neta</th>'
    + '<th style="padding:7px 12px;text-align:right">Caja<br>Final</th>'
    + '<th style="padding:7px 12px;text-align:right">ROI<br>Mkt</th>'
    + '<th style="padding:7px 12px;text-align:center">Estado</th>'
    + '</tr></thead><tbody>'+dashRows+'</tbody></table>'
    + '</div>'
    + '<div class="charts-row" style="margin-top:14px">'
    + '<div class="chart-card" style="flex:2"><h4>EBIT vs Utilidad Neta por Empresa</h4><div class="chart-wrap" style="height:220px"><canvas id="chartAdminDash_'+( rd.ronda||0)+'"></canvas></div></div>'
    + '<div class="chart-card"><h4>Market Share (%)</h4><div class="chart-wrap" style="height:220px"><canvas id="chartAdminShare_'+( rd.ronda||0)+'"></canvas></div></div>'
    + '</div>';

  // ── PESTAÑA 2: ESTADO DE RESULTADOS ──────────────────────
  const plHTMLcomp = '<div class="table-wrap" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    + hdr()
    + sec('Ingresos')
    + row('Precio facturado al cliente (con IVA)',  r => r.totalFacturado||((r.ventasBrutas||0)+(r.ivaDebito||0)))
    + row('(−) IVA débito fiscal (13%)',            r => r.ivaDebito||0, true)
    + tot('= Ventas brutas (sin IVA)',              r => r.ventasBrutas||0)
    + row('(−) Comisiones canal (neto)',            r => r.comisionesNeto||Math.round((r.comisiones||0)*0.87), true)
    + tot('= Ventas netas',                        r => r.ventasNetasReal||r.ventasNetas||0)
    + sec('Costo de Ventas (NIC 2)')
    + row('Costo materia prima neto',              r => r.cvMP||(r.costoVentas-(r.pagoCalidad||0))||0, true)
    + row('Costo calidad / control',               r => r.pagoCalidad||0, true)
    + row('Mano de obra directa (operarios)',      r => r.pagoOperarios||r.costoOperarios||0, true)
    + tot('= Total costo de ventas',               r => (r.costoVentas||0)+(r.pagoOperarios||r.costoOperarios||0), true)
    + tot('= Utilidad bruta',                      r => (r.utilidadBruta||0)-(r.pagoOperarios||r.costoOperarios||0))
    + sec('(-) Gastos Comerciales')
    + row('Publicidad',                            r => r.gastoPublicidad||Math.round((r.publicidad||0)*0.87), true)
    + row('Promoción y descuentos',                r => r.gastoPromocion||Math.round((r.promocion||0)*0.87), true)
    + row('Eventos y activaciones',                r => r.gastoEventos||Math.round((r.eventos||0)*0.87), true)
    + row('Marketing en redes',                    r => r.gastoMktRedes||Math.round((r.marketingRedes||0)*0.87), true)
    + row('Relaciones públicas',                   r => r.gastoRRPP||Math.round((r.relacionesPublicas||0)*0.87), true)
    + row('Fuerza de ventas (sueldos)',            r => r.costoVendedores||0, true)
    + row('Investigación de mercado',              r => r.gastoInvMktNeto||0, true)
    + sec('(-) Gastos Administrativos')
    + row('Gastos administrativos fijos',          r => r.gastoAdminFijo||0, true)
    + sec('(-) Gastos Operativos de Planta')
    + row('Gasto fijo de planta',                  r => r.gastoFijoPlanta||0, true)
    + row('Almacenamiento de inventario',          r => r.costoAlmacenamiento||0, true)
    + row('Innovación y desarrollo',               r => r.gastoInnovacionNeto||Math.round((r.gastoInnovacion||0)*0.87), true)
    + tot('= EBITDA',                              r => (r.ebit||0)+(r.depreciacion||0))
    + row('(-) Depreciación',                      r => r.depreciacion||0, true)
    + tot('= EBIT / Utilidad Operativa',           r => r.ebit||0, true)
    + sec('(-) Gastos Financieros')
    + row('Intereses préstamo',                    r => r.interesesPrestamo||0, true)
    + row('Intereses sobregiro',                   r => r.interesSobregiro||0, true)
    + row('Comisión apertura',                     r => r.comisionApertura||0, true)
    + tot('= Utilidad antes de impuestos',         r => (r.ebit||0)-(r.gastoFinanciero||0))
    + sec('(-) Impuestos')
    + row('IT (3% precio facturado)',              r => r.impuestoIT||0, true)
    + row('IUE (25% utilidad gravable)',           r => r.impuestoIUE||0, true)
    + tot('UTILIDAD NETA',                         r => r.utilidadNeta||0, true)
    + '</table></div>';
  const plHTML = withToggle(pfx+'pl', 'pl', plHTMLcomp, rd);

  // ── PESTAÑA 3: BALANCE GENERAL ────────────────────────────
  const bgHTMLcomp = '<div class="table-wrap" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    + hdr()
    + sec('A · Activo Corriente')
    + row('Caja y equivalentes',          r => r.cajaFinal||0)
    + row('Cuentas por cobrar (CxC)',     r => r.cxcFinal||0)
    + row('Inventarios (valorizado)',     r => r.invFinalValorizado||0)
    + tot('Total activo corriente',       r => (r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0))
    + sec('A · Activo No Corriente')
    + row('Activos fijos brutos',         r => (r.afNetos||0)+(r.depreciacion||0))
    + row('Depreciación acumulada',       r => r.depreciacion||0, true)
    + tot('Activos fijos netos',          r => r.afNetos||0)
    + tot('TOTAL ACTIVO',                 r => r.totalActivos||0, true)
    + sec('B · Pasivo')
    + row('IVA por pagar',                r => r.ivaAPagar||0)
    + row('Deuda total (préstamos)',      r => r.deudaFinal||0)
    + tot('TOTAL PASIVO',                 r => (r.deudaFinal||0)+(r.ivaAPagar||0), true)
    + sec('C · Patrimonio')
    + row('Capital contable',             r => r.capitalContable ?? 0)
    + row('Resultado acumulado',          r => r.resultadoAcumulado||0)
    + tot('TOTAL PATRIMONIO',             r => r.patrimonio||0)
    + (() => {
        const checks = eqs.map(r => {
          const pp = (r.deudaFinal||0)+(r.patrimonio||0);
          const ta = r.totalActivos||0;
          const ok = Math.abs(pp-ta) < 2;
          return '<td style="padding:6px 12px;text-align:right;font-family:var(--font-mono);font-size:.82rem;font-weight:700;background:'+(ok?'rgba(6,255,165,.07)':'rgba(239,68,68,.15)')+';color:'+(ok?'var(--accent5)':'var(--accent4)')+'">'+bsBO(pp)+(ok?'':' ⚠')+'</td>';
        }).join('');
        return '<tr><td style="padding:6px 14px;font-weight:700;font-size:.79rem;position:sticky;left:0;background:rgba(255,255,255,.04);z-index:1">TOTAL PASIVO + PATRIMONIO</td>'+checks+'</tr>';
      })()
    + '</table></div>';
  const bgHTML = withToggle(pfx+'bg', 'bg', bgHTMLcomp, rd);

  // ── PESTAÑA 4: FLUJO DE EFECTIVO ──────────────────────────
  const feHTMLcomp = '<div class="table-wrap" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    + hdr()
    + sec('A · Actividades Operativas')
    + row('Utilidad neta',                r => r.utilidadNeta||0)
    + row('(+) Depreciación',             r => r.depreciacion||0)
    + row('(+/−) Variación CxC',          r => -(r.cxcFinal||0)+(r.cxcInicial||0))
    + row('(+/−) Variación inventarios',  r => -(r.invFinalValorizado||0)+(r.inventarioInicial||0)*(r.costoUnitario||0))
    + tot('Flujo operacional neto',       r => {
        const dep  = r.depreciacion||0;
        const dCxC = -(r.cxcFinal||0)+(r.cxcInicial||0);
        const dInv = -(r.invFinalValorizado||0)+(r.inventarioInicial||0)*(r.costoUnitario||0);
        return (r.utilidadNeta||0)+dep+dCxC+dInv;
      }, true)
    + sec('B · Actividades de Inversión')
    + row('(−) Adquisición activos fijos', r => 0)
    + tot('Flujo de inversión',            r => 0)
    + sec('C · Actividades de Financiamiento')
    + row('(+) Nuevos préstamos',          r => r.ingresoPrestamo||0)
    + tot('Flujo de financiamiento',       r => r.ingresoPrestamo||0)
    + sec('D · Posición de Caja')
    + row('Saldo inicial de caja',         r => r.cajaInicial ?? 0)
    + (() => {
        const checks = eqs.map(r => {
          const cf = r.cajaFinal||0;
          const ok = cf >= 0;
          return '<td style="padding:6px 12px;text-align:right;font-family:var(--font-mono);font-size:.82rem;font-weight:700;background:'+(ok?'rgba(6,255,165,.07)':'rgba(239,68,68,.15)')+';color:'+(ok?'var(--accent5)':'var(--accent4)')+'">'+bsBO(cf)+(cf<0?' ⚠':'')+'</td>';
        }).join('');
        return '<tr><td style="padding:6px 14px;font-weight:700;font-size:.79rem;position:sticky;left:0;background:rgba(255,255,255,.04);z-index:1">Saldo final de caja</td>'+checks+'</tr>';
      })()
    + '</table></div>';
  const feHTML = withToggle(pfx+'fe', 'fe', feHTMLcomp, rd);

  // ── Encabezado y tabs ─────────────────────────────────────
  const encabezado = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">'
    + '<div>'
    + '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px">SimNego · UAGRM &nbsp;·&nbsp; Ronda '+(rd.ronda||'N')+'</div>'
    + '<div style="font-size:.75rem;color:var(--text3);margin-top:2px">Cifras en Bs. bolivianos &nbsp;·&nbsp; Negativos en (paréntesis)</div>'
    + '</div>'
    + '<div style="display:flex;gap:6px">'
    + '<button class="btn btn-ghost btn-sm" onclick="printPanel(\'adminEFContent\',\'Estados Financieros · Ronda '+(rd.ronda||'N')+' · UAGRM\',\'Cifras en Bs. · Negativos en paréntesis\')">🖨️ Imprimir</button>'
    + '</div>'
    + '</div>';

  // F7-FIX: pfx ya definido al inicio de la función
  const tabs = '<div id="' + pfx + 'Tabs" style="display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:10px;flex-wrap:wrap">'
    + '<button class="btn btn-primary btn-sm" id="' + pfx + 'btn1" onclick="adminEFTab(1,\'' + pfx + '\')">📊 Dashboard</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn2" onclick="adminEFTab(2,\'' + pfx + '\')">📋 Estado de Resultados</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn3" onclick="adminEFTab(3,\'' + pfx + '\')">🏦 Balance General</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn4" onclick="adminEFTab(4,\'' + pfx + '\')">💧 Flujo de Efectivo</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn5" onclick="adminEFTab(5,\'' + pfx + '\')">📐 Análisis KPI</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn6" onclick="adminEFTab(6,\'' + pfx + '\')">📊 Reporte Tributario</button>'
    + '</div>';

  // Construir KPI panel (3 tabs de ratios financieros)
  const kpiHTML = buildAdminKPIHTML(eqs, tc, pfx+'kpi_');

  // ── Banner de Shock de Mercado ────────────────────────────
  const shockBanner = (() => {
    const sh = rd.shock;
    if (!sh) return '';
    const colores = { boom:'#10B981', crisis:'#EF4444', neutral:'#6B7280', sectorial:'#F59E0B' };
    const fondos  = { boom:'rgba(16,185,129,.10)', crisis:'rgba(239,68,68,.10)', neutral:'rgba(107,114,128,.08)', sectorial:'rgba(245,158,11,.10)' };
    const color   = sh.color || colores[sh.tipo] || '#6B7280';
    const fondo   = fondos[sh.tipo] || 'rgba(107,114,128,.08)';
    const factor  = sh.factorDemanda !== 1.0
      ? ' · Demanda ' + (sh.factorDemanda > 1 ? '+' : '') + Math.round((sh.factorDemanda - 1) * 100) + '%'
      : '';
    const segs = sh.segmentosAfectados === 'todos' ? 'Todos los segmentos' : 'Segmentos específicos';
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:16px;'
      + 'background:' + fondo + ';border:1px solid ' + color + '33;border-radius:var(--r);border-left:4px solid ' + color + '">'
      + '<span style="font-size:1.4rem">' + (sh.icono || '⚡') + '</span>'
      + '<div style="flex:1">'
      + '<div style="font-weight:700;font-size:.82rem;color:' + color + ';text-transform:uppercase;letter-spacing:1px">'
      + 'SHOCK DE MERCADO · Ronda ' + (rd.ronda || '') + ' · ' + (sh.tipo?.toUpperCase() || 'EVENTO') + '</div>'
      + '<div style="font-size:.85rem;color:var(--text1);margin-top:2px">' + sh.descripcion + '</div>'
      + '<div style="font-size:.75rem;color:var(--text3);margin-top:3px">' + segs + factor
      + (sh.forzadoPor === 'profesor' ? ' &nbsp;·&nbsp; <span style="color:var(--accent3);font-weight:600">📌 Elegido por el profesor</span>' : '') + '</div>'
      + '</div></div>';
  })();

  // ── Reporte Tributario comparativo ───────────────────────
  const tributHTML = (() => {
    const secT = titulo =>
      '<tr style="background:rgba(255,255,255,.04)"><td colspan="'+(N+1)+'" style="padding:5px 14px;position:sticky;left:0;background:rgba(255,255,255,.04);z-index:1;font-family:var(--font-mono);font-size:.62rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1.2px">'+titulo+'</td></tr>';
    const rowT = (lbl, fn) => {
      const vals = eqs.map(r => '<td style="padding:5px 12px;text-align:right;font-family:var(--font-mono);font-size:.8rem;border-bottom:1px solid rgba(255,255,255,.04)">'+bsBO(fn(r))+'</td>').join('');
      return '<tr><td style="padding:5px 14px;font-size:.78rem;color:var(--text2);border-bottom:1px solid rgba(255,255,255,.04);position:sticky;left:0;background:var(--bg);z-index:1">'+lbl+'</td>'+vals+'</tr>';
    };
    const rowTS = (lbl, fn) => {
      const vals = eqs.map(r => { const v=fn(r); const c=(v||0)>=0?'#10B981':'#EF4444'; return '<td style="padding:6px 12px;text-align:right;font-family:var(--font-mono);font-size:.8rem;font-weight:700;border-bottom:2px solid var(--border2);color:'+c+'">'+bsBO(v)+'</td>'; }).join('');
      return '<tr style="background:rgba(255,255,255,.04)"><td style="padding:6px 14px;font-size:.78rem;font-weight:700;border-bottom:2px solid var(--border2);position:sticky;left:0;background:rgba(255,255,255,.04);z-index:1">'+lbl+'</td>'+vals+'</tr>';
    };
    return '<div style="padding:4px"><div class="table-wrap" style="overflow-x:auto">'
      + '<table style="width:100%;border-collapse:collapse"><thead>'+hdr()+'</thead><tbody>'
      + secT('1. IVA — Impuesto al Valor Agregado')
      + rowT('IVA Débito Fiscal (ventas)', r => r.ivaDebito||0)
      + rowT('(−) IVA Crédito Fiscal (compras)', r => -(r.ivaCredito||0))
      + rowTS('= IVA neto del período', r => (r.ivaDebito||0)-(r.ivaCredito||0))
      + rowT('IVA por pagar (pasivo)', r => r.ivaAPagar||0)
      + secT('2. IT — Impuesto a las Transacciones (3%)')
      + rowT('Ventas facturadas (con IVA)', r => r.totalFacturado||Math.round((r.impuestoIT||0)/0.03)||0)
      + rowTS('= IT determinado', r => r.impuestoIT||0)
      + rowT('(−) Compensación con IUE', r => -(r.compensacionIT||r.compensacionIUE||0))
      + rowT('= IT en efectivo', r => r.ITefectivoCaja!=null?r.ITefectivoCaja:(r.impuestoIT||0))
      + secT('3. IUE — Impuesto Utilidades (25%)')
      + rowT('Utilidad antes de impuestos', r => (r.ebit||0)-(r.gastoFinanciero||0))
      + rowT('IUE determinado (25%)', r => r.impuestoIUE||Math.max(0,((r.ebit||0)-(r.gastoFinanciero||0))*0.25))
      + rowTS('= IUE por pagar', r => r.impuestoIUE||0)
      + rowT('Saldo IUE compensable', r => r.saldoIUEfinal||0)
      + secT('4. Resumen Caja Tributaria')
      + rowT('IVA período anterior pagado', r => r.pagoIVAPeriodoAnterior||0)
      + rowT('IT pagado en efectivo', r => r.ITefectivoCaja!=null?r.ITefectivoCaja:(r.impuestoIT||0))
      + rowT('IUE pagado', r => r.impuestoIUE||0)
      + rowTS('= Salida total por impuestos', r => (r.pagoIVAPeriodoAnterior||0)+(r.ITefectivoCaja!=null?r.ITefectivoCaja:(r.impuestoIT||0))+(r.impuestoIUE||0))
      + '</tbody></table></div>'
      + '<div style="font-size:.72rem;color:var(--text3);padding:8px 4px;font-style:italic">'
      + 'ⓘ IVA neutro Ley 843. IT=3% ventas facturadas. IUE=25% utilidad anual — liquida en R4/R8/R12.</div></div>';
  })();

  return '<div id="' + pfx + 'Content">'
    + shockBanner + encabezado + tabs
    + '<div id="' + pfx + 'pane1">' + dashHTML + '</div>'
    + '<div id="' + pfx + 'pane2" style="display:none">' + plHTML + '</div>'
    + '<div id="' + pfx + 'pane3" style="display:none">' + bgHTML + '</div>'
    + '<div id="' + pfx + 'pane4" style="display:none">' + feHTML + '</div>'
    + '<div id="' + pfx + 'pane5" style="display:none">' + kpiHTML + '</div>'
    + '<div id="' + pfx + 'pane6" style="display:none">' + tributHTML + '</div>'
    + '</div>';
}

window.adminEFTab = (n, pfx) => {
  // F7-FIX: pfx identifica la instancia correcta de los tabs
  // Soporte legado: si no hay pfx busca IDs antiguos
  [1,2,3,4,5,6].forEach(i => {
    const pane = document.getElementById(pfx ? pfx+'pane'+i : 'adminEFPane'+i);
    const btn  = document.getElementById(pfx ? pfx+'btn'+i  : 'btnEFT'+i);
    if (pane) pane.style.display = i===n ? '' : 'none';
    if (btn)  btn.className = i===n ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  });
};

function buildAdminChartsHTML(rd, n) {
  return '';  // Gráficos ahora dentro del Dashboard del buildAdminResultsHTML
}

function renderAdminCharts() {
  document.querySelectorAll('[id^="chartAdminDash_"]').forEach(canvas => {
    const n = parseInt(canvas.id.split('_')[1]);
    if (!n) return;
    api('GET',`/admin/resultados/${n}`).then(rd => {
      if (!rd.resultados?.length) return;
      const labels = rd.resultados.map(r => r.equipoNombre);
      const palette = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06FFA5','#84CC16','#F97316'];
      const defOpts = { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:'#9BA3C4', font:{ family:'Space Mono', size:9 } } } },
        scales:{ x:{ ticks:{ color:'#9BA3C4', font:{ family:'Space Mono', size:9 } }, grid:{ color:'#2A2F45' } },
                 y:{ ticks:{ color:'#9BA3C4', font:{ family:'Space Mono', size:9 } }, grid:{ color:'#2A2F45' } } } };
      new Chart(canvas, { type:'bar', data:{
        labels,
        datasets:[
          { label:'EBIT',          data: rd.resultados.map(r=>r.ebit||0),          backgroundColor: labels.map((_,i)=>palette[i%palette.length]+'CC'), borderRadius:3 },
          { label:'Utilidad Neta', data: rd.resultados.map(r=>r.utilidadNeta||0),  backgroundColor: labels.map((_,i)=>palette[i%palette.length]+'66'), borderRadius:3, borderWidth:1, borderColor: labels.map((_,i)=>palette[i%palette.length]) },
        ]
      }, options:{ ...defOpts } });
    }).catch(()=>{});
  });
  document.querySelectorAll('[id^="chartAdminShare_"]').forEach(canvas => {
    const n = parseInt(canvas.id.split('_')[1]);
    if (!n) return;
    api('GET',`/admin/resultados/${n}`).then(rd => {
      if (!rd.resultados?.length) return;
      const labels = rd.resultados.map(r => r.equipoNombre);
      const palette = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06FFA5','#84CC16','#F97316'];
      const defOpts = { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{ x:{ ticks:{ color:'#9BA3C4', font:{ family:'Space Mono', size:9 } }, grid:{ color:'#2A2F45' } },
                 y:{ ticks:{ color:'#9BA3C4', font:{ family:'Space Mono', size:9 }, callback: v => v+'%' }, grid:{ color:'#2A2F45' }, max:100 } } };
      new Chart(canvas, { type:'bar', data:{
        labels,
        datasets:[{ data: rd.resultados.map(r=>+(r.shareReal*100).toFixed(2)), backgroundColor: labels.map((_,i)=>palette[i%palette.length]), borderRadius:4 }]
      }, options:{ ...defOpts } });
    }).catch(()=>{});
  });
}


// ── Admin Mercado ──────────────────────────────────────────


// ── Exponer como window.* para setupNav ──────────────────
window.loadAdminDashboard = loadAdminDashboard;
window.buildAdminKPIHTML = buildAdminKPIHTML;
window.buildAdminResultsHTML = buildAdminResultsHTML;
window.buildAdminChartsHTML = buildAdminChartsHTML;
window.renderAdminCharts = renderAdminCharts;
window.forzarDecisionAdmin = async function(equipoId) {
  const motivo = prompt('Motivo obligatorio para forzar la decisión:');
  if (!motivo || !motivo.trim()) return toast('Debes indicar un motivo', 'error');
  try {
    await api('POST', '/admin/ronda/forzar-decision', { equipoId, motivo: motivo.trim() });
    toast('Decisión forzada por profesor', 'success');
    await loadAdminDashboard();
  } catch(e) { toast(e.message, 'error'); }
};
console.log('[admin-dashboard] ✅ Módulo cargado — Dashboard activo');
