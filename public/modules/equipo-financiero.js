/**
 * modules/equipo-financiero.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo: estados financieros del equipo
 * Fase 2 — Día 2 del plan de modularización
 *
 * Funciones incluidas:
 *   - loadEquipoFinanciero  → ER, Balance, Flujo, Tributario
 *   - buildEvoChart         → gráfica evolución
 *   - renderEvoCharts       → render gráficas
 *
 * Dependencias: api(), fmt (ui-components.js), finRow, finRowSub, state, toast
 * Reversión: comentar <script src="modules/equipo-financiero.js"> en index.html
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function loadEquipoFinanciero() {
  const el = document.getElementById('eq-financiero-content');
  const nav = document.getElementById('eq-financiero-nav');
  if (!el) return;

  const data = await api('GET','/api/resultados');
  if (!data.historial?.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Sin rondas simuladas aún.</p></div>`;
    return;
  }

  const latest = data.historial[data.historial.length-1].ronda;
  if (nav) {
    nav.innerHTML = data.historial.map(h =>
      `<button class="ronda-btn simulated" onclick="mostrarFinanciero(${h.ronda})">${h.ronda===latest?'<strong>':''}Ronda ${h.ronda}${h.ronda===latest?'</strong>':''}</button>`
    ).join('');
  }

  // Store historial globally for tab switching
  window._finHistorial = data.historial;
  mostrarFinanciero(latest);
}

window.mostrarFinanciero = (n) => {
  document.querySelectorAll('#eq-financiero-nav .ronda-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace(/\D+/g,''))===n);
  });
  const item = (window._finHistorial||[]).find(h=>h.ronda===n);
  const el = document.getElementById('eq-financiero-content');
  if (!item || !el) return;
  const r = item.resultado;
  if (!r || typeof r !== 'object') { el.innerHTML = '<p style="padding:20px;color:var(--text3)">Sin datos para esta ronda.</p>'; return; }

  el.innerHTML = `
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <button class="btn btn-ghost" id="tabPL" onclick="showFinTab('pl')" style="background:var(--accent);color:#fff">📋 Estado de Resultados</button>
    <button class="btn btn-ghost" id="tabBG" onclick="showFinTab('bg')">🏦 Balance General</button>
    <button class="btn btn-ghost" id="tabFC" onclick="showFinTab('fc')">💧 Flujo de Efectivo</button>
    <button class="btn btn-ghost" id="tabTR" onclick="showFinTab('tr')">📊 Reporte Tributario</button>
  </div>

  <!-- Estado de Resultados -->
  <div id="finPL">
    <div class="result-round-card">
      <div class="result-round-header" style="display:flex;align-items:center;justify-content:space-between">
        <h3>Estado de Resultados — Ronda ${n}</h3>
        <button class="btn btn-ghost btn-sm no-print" style="font-size:.72rem;padding:3px 10px" onclick="printFinancieroCompleto((state.me&&state.me.nombre)||'',${n})">🖨️ Imprimir completo</button>
      </div>
      <div style="padding:16px 20px">

        ${/* ER desglosado por producto — multiproducto */
          (r.productos && r.productos.length > 1) ? (() => {
            const PROD_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899'];
            const fR = (lbl, v, neg, tipo) => {
              const val = neg ? -(v||0) : (v||0);
              const color = tipo==='pos'?'var(--accent2)':tipo==='neg'?'var(--accent4)':'var(--text1)';
              return '<tr><td style="padding:3px 8px;font-size:.75rem;color:var(--text2)">' + lbl + '</td>'
                + '<td style="padding:3px 8px;text-align:right;font-family:var(--font-mono);font-size:.75rem;color:'+color+'">'
                + (val<0?'(':'') + 'Bs ' + Math.round(Math.abs(val)).toLocaleString('es') + (val<0?')':'') + '</td></tr>';
            };
            const fRS = (lbl, v) => {
              const color = (v||0)>=0?'var(--accent2)':'var(--accent4)';
              return '<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px;font-size:.75rem;font-weight:700">' + lbl + '</td>'
                + '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);font-size:.75rem;font-weight:700;color:'+color+'">'
                + 'Bs ' + Math.round(v||0).toLocaleString('es') + '</td></tr>';
            };
            const secR = lbl => '<tr><td colspan="2" style="padding:4px 8px 2px;font-family:var(--font-mono);font-size:.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--border)">' + lbl + '</td></tr>';

            const cards = r.productos.map((p,i) => {
              const col = PROD_COLORS[i % PROD_COLORS.length];
              const utilColor = (p.utilidadNeta||0)>=0?'var(--accent2)':'var(--accent4)';
              const gastosOp = p.gastosOp || 0;
              const ebit     = p.ebit ?? ((p.utilidadBruta||0) - gastosOp);
              const utilNeta = p.utilidadNeta || 0;
              const utilBruta  = p.utilidadBruta || 0;
              const margenBrutoPct = (p.ventasNetas||0)>0 ? ((utilBruta/(p.ventasNetas))*100).toFixed(1)+'%' : '—';
              const margenNetoPct  = (p.ventasNetas||0)>0 ? ((utilNeta/(p.ventasNetas))*100).toFixed(1)+'%' : '—';
              const mbColor = utilBruta>=0?'var(--accent2)':'var(--accent4)';
              return '<div style="background:var(--bg2);border:0.5px solid var(--border);border-top:3px solid '+col
                + ';border-radius:var(--r);padding:12px 14px;min-width:200px;flex:1">'
                + '<div style="font-weight:700;font-size:.78rem;color:'+col+';margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'
                + (p.producto||'Producto '+(i+1)) + '</div>'
                + '<table style="width:100%;border-collapse:collapse">'
                + fR('Ventas netas', p.ventasNetas||0, false, 'neutral')
                + fR('(−) Costo ventas', p.costoVentas||0, true, 'neg')
                + fRS('= Utilidad bruta', utilBruta)
                + '<tr><td style="padding:2px 8px;font-size:.72rem;color:var(--text3)">Margen bruto</td>'
                + '<td style="padding:2px 8px;text-align:right;font-family:var(--font-mono);font-size:.72rem;color:'+mbColor+'">' + margenBrutoPct + '</td></tr>'
                + fR('(−) Gastos operativos', gastosOp, true, 'neg')
                + fRS('= EBIT', ebit)
                + fR('(−) Impuesto IT', p.impuestoIT||0, true, 'neg')
                + '<tr style="border-top:2px solid var(--border2);background:rgba(255,255,255,.03)">'
                + '<td style="padding:5px 8px;font-size:.76rem;font-weight:700">= Utilidad neta</td>'
                + '<td style="padding:5px 8px;text-align:right;font-family:var(--font-mono);font-size:.78rem;font-weight:700;color:'+utilColor+'">'
                + 'Bs ' + Math.round(utilNeta).toLocaleString('es') + '</td></tr>'
                + '<tr><td style="padding:3px 8px;font-size:.72rem;color:var(--text3)">Margen neto</td>'
                + '<td style="padding:3px 8px;text-align:right;font-family:var(--font-mono);font-size:.72rem;color:'+utilColor+'">' + margenNetoPct + '</td></tr>'
                + '<tr><td style="padding:3px 8px;font-size:.72rem;color:var(--text3)">Unidades vendidas</td>'
                + '<td style="padding:3px 8px;text-align:right;font-family:var(--font-mono);font-size:.72rem">' + Math.round(p.ventasReales||0).toLocaleString('es') + '</td></tr>'
                + '</table></div>';
            }).join('');

            // Totales empresa — usar ventasNetasReal (S11: comisiones netas)
            const totVN   = r.ventasNetasReal||r.ventasNetas||0;
            const totCV   = r.costoVentas||0;
            const totUB   = r.utilidadBruta||0;
            const totGO   = r.gastosOp||0;
            const totEBIT = r.ebit||0;
            const totIT   = r.impuestoIT||0;
            const totUN   = r.utilidadNeta||0;
            const totMgn  = totVN>0 ? (totUN/totVN*100).toFixed(1)+'%' : '—';
            const totColor= totUN>=0?'var(--accent2)':'var(--accent4)';

            return '<div style="font-family:var(--font-mono);font-size:.63rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:4px 0 8px 0;border-bottom:1px solid var(--border);margin-bottom:10px">📦 ER por Producto</div>'
              + '<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;margin-bottom:12px">' + cards + '</div>'
              + '<div style="background:var(--bg2);border:0.5px solid var(--border2);border-radius:var(--r);padding:10px 14px;margin-bottom:14px">'
              + '<div style="font-family:var(--font-mono);font-size:.63rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">📊 Consolidado empresa</div>'
              + '<table style="width:100%;border-collapse:collapse">'
              + fR('Ventas netas', totVN, false, 'neutral')
              + fR('(−) Costo ventas', totCV, true, 'neg')
              + fRS('= Utilidad bruta', totUB)
              + fR('(−) Gastos operativos', totGO, true, 'neg')
              + fRS('= EBIT', totEBIT)
              + fR('(−) Impuesto IT', totIT, true, 'neg')
              + '<tr style="border-top:2px solid var(--border2);background:rgba(255,255,255,.03)">'
              + '<td style="padding:5px 8px;font-size:.76rem;font-weight:700">= Utilidad neta empresa</td>'
              + '<td style="padding:5px 8px;text-align:right;font-family:var(--font-mono);font-size:.78rem;font-weight:700;color:'+totColor+'">'
              + 'Bs ' + Math.round(totUN).toLocaleString('es') + '</td></tr>'
              + '<tr><td style="padding:3px 8px;font-size:.72rem;color:var(--text3)">Margen neto empresa</td>'
              + '<td style="padding:3px 8px;text-align:right;font-family:var(--font-mono);font-size:.72rem;color:'+totColor+'">' + totMgn + '</td></tr>'
              + '</table></div>'
              + '<div style="font-family:var(--font-mono);font-size:.63rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-bottom:4px">📋 Estado de Resultados Detallado</div>';
          })() : ''
        }

        ${(() => {
          // Opción 1: consolidar gastos de todos los productos para multiproducto
          const prods = r.productos?.length > 1 ? r.productos : null;
          const sumP  = (fn) => prods ? prods.reduce((s,p) => s + (fn(p)||0), 0) : null;

          // Gastos comerciales — suma todos los productos
          const gPub  = prods ? sumP(p=>p.gastoPublicidad||Math.round((p.publicidad||0)*0.87))
                               : (r.gastoPublicidad||Math.round((r.publicidad||0)*0.87));
          const gProm = prods ? sumP(p=>p.gastoPromocion||Math.round((p.promocion||0)*0.87))
                               : (r.gastoPromocion||Math.round((r.promocion||0)*0.87));
          const gEv   = prods ? sumP(p=>p.gastoEventos||Math.round((p.eventos||0)*0.87))
                               : (r.gastoEventos||Math.round((r.eventos||0)*0.87));
          const gRed  = prods ? sumP(p=>p.gastoMktRedes||Math.round((p.marketingRedes||0)*0.87))
                               : (r.gastoMktRedes||Math.round((r.marketingRedes||0)*0.87));
          const gRRPP = prods ? sumP(p=>p.gastoRRPP||Math.round((p.relacionesPublicas||0)*0.87))
                               : (r.gastoRRPP||Math.round((r.relacionesPublicas||0)*0.87));
          // Fuerza de ventas y operarios — específicos por producto
          const gVend = prods ? sumP(p=>p.costoVendedores||p.gastoCostoVend||0)
                               : (r.costoVendedores||0);
          const gOper = prods ? sumP(p=>p.pagoOperarios||p.costoOperarios||0)
                               : (r.pagoOperarios||r.costoOperarios||0);
          // Costos fijos comunes — solo prod_1 (Alternativa 3)
          const gAdmin  = r.gastoAdminFijo || 0;
          const gPlanta = r.gastoFijoPlanta || 0;
          const gAlmac  = prods ? sumP(p=>p.costoAlmacenamiento||0) : (r.costoAlmacenamiento||0);
          const gInnov  = prods ? sumP(p=>p.gastoInnovacionNeto||Math.round((p.gastoInnovacion||0)*0.87))
                                 : (r.gastoInnovacionNeto||Math.round((r.gastoInnovacion||0)*0.87));
          const tieneInnov = prods ? prods.some(p=>p.gastoInnovacion>0) : r.gastoInnovacion>0;

          // Consolidados de ventas
          const totVentasBrutas = prods ? sumP(p=>p.ventasBrutas||0) : (r.ventasBrutas||0);
          const totIvaDebito    = prods ? sumP(p=>p.ivaDebito||0)    : (r.ivaDebito||0);
          const totTotalFact    = prods ? sumP(p=>p.totalFacturado||((p.ventasBrutas||0)+(p.ivaDebito||0))) : (r.totalFacturado||0);
          const totComisNeto    = prods ? sumP(p=>p.comisionesNeto||Math.round((p.comisiones||0)*0.87)) : (r.comisionesNeto||Math.round((r.comisiones||0)*0.87));
          const totVentasNetas  = prods ? sumP(p=>p.ventasNetasReal||p.ventasNetas||0) : (r.ventasNetasReal||r.ventasNetas||0);
          // Costo de ventas detalle
          const totCVmp    = prods ? sumP(p=>p.cvMP||(p.costoVentas-(p.pagoCalidad||0))||0) : (r.cvMP||(r.costoVentas-(r.pagoCalidad||0))||0);
          const totCVcalid = prods ? sumP(p=>p.pagoCalidad||0) : (r.pagoCalidad||0);
          // Gastos operativos adicionales
          const gCostoVend = prods ? sumP(p=>p.gastoCostoVend||p.costoVendedores||0) : (r.gastoCostoVend||r.costoVendedores||0);
          // gastoInvMkt es decisión de empresa (no por producto) — usar consolidado r
          const gInvMkt    = r.gastoInvMktNeto || 0;
          const tieneInvMkt= gInvMkt > 0;

          const multiLabel = prods ? ' <span style="font-size:.58rem;color:var(--accent3)">(suma todos los productos)</span>' : '';
          const secER = lbl => '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-top:4px">'+lbl+multiLabel+'</div>';

          return ''
            // ── VENTAS ──────────────────────────────────────────
            + secER('Ingresos')
            + finRow('Precio facturado al cliente (con IVA)', totTotalFact, false, 'neutral')
            + finRow('(−) IVA débito fiscal (13%)', -totIvaDebito, false, 'neg')
            + finRowSub('= Ventas brutas (sin IVA)', totVentasBrutas, true)
            + finRow('(−) Comisiones canal (neto)', -totComisNeto, false, 'neg')
            + finRowSub('= Ventas netas', totVentasNetas, true)
            + '<div style="height:4px"></div>'
            // ── COSTO DE VENTAS ─────────────────────────────────
            + secER('Costo de Ventas')
            + finRow('Costo materia prima neto', -totCVmp, false, 'neg')
            + finRow('Costo calidad / control', -totCVcalid, false, 'neg')
            + finRow('Mano de obra directa (operarios)', -gOper, false, 'neg')
            + finRowSub('= Total costo de ventas', -(r.costoVentas||0)-gOper, true)
            + finRowSub('= Utilidad bruta', (r.utilidadBruta||0)-gOper, true)
            + '<div style="height:4px"></div>'
            // ── GASTOS COMERCIALES ──────────────────────────────
            + secER('(-) Gastos Comerciales')
            + finRow('Publicidad', -gPub, false, 'neg')
            + finRow('Promoción y descuentos', -gProm, false, 'neg')
            + finRow('Eventos y activaciones', -gEv, false, 'neg')
            + finRow('Marketing en redes', -gRed, false, 'neg')
            + finRow('Relaciones públicas', -gRRPP, false, 'neg')
            + finRow('Fuerza de ventas (sueldos)', -gCostoVend, false, 'neg')
            + (tieneInvMkt ? finRow('Investigación de mercado', -gInvMkt, false, 'neg') : '')
            // ── GASTOS ADMINISTRATIVOS ──────────────────────────
            + secER('(-) Gastos Administrativos')
            + finRow('Gastos administrativos fijos', -gAdmin, false, 'neg')
            // ── GASTOS PLANTA ───────────────────────────────────
            + secER('(-) Gastos Operativos de Planta')
            + finRow('Gasto fijo de planta', -gPlanta, false, 'neg')
            + finRow('Almacenamiento de inventario', -gAlmac, false, 'neg')
            + (tieneInnov ? finRow('Innovación y desarrollo', -gInnov, false, 'neg') : '');
        })()}

        <!-- EBITDA -->
        <div style="height:4px;border-top:1px dashed var(--border)"></div>
        ${finRowSub('= EBITDA', (r.ebit??0)+(r.depreciacion??0), true, 'var(--accent3)')}

        <!-- DEPRECIACIÓN -->
        <div style="height:2px"></div>
        ${finRow('(-) Depreciación',           -r.depreciacion,        false,'neg')}

        <!-- EBIT -->
        <div style="height:4px;border-top:1px dashed var(--border)"></div>
        ${finRowSub('= EBIT / Utilidad Operativa', r.ebit??0, true)}
        <div style="height:6px"></div>

        <!-- GASTOS FINANCIEROS -->
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border)">(-) Gastos Financieros</div>
        ${finRow('Intereses préstamo',         -r.interesesPrestamo,   false,'neg')}
        ${r.interesSobregiro>0 ? finRow('Intereses sobregiro',-(r.interesSobregiro), false,'neg') : ''}
        ${(r.comisionApertura||0)>0 ? finRow('Comisión apertura devengada',-(r.comisionApertura), false,'neg') : ''}
        <div style="height:4px;border-top:1px dashed var(--border)"></div>
        ${finRowSub('= Utilidad antes de impuestos', (r.ebit??0)-(r.gastoFinanciero??0), true)}
        <div style="height:6px"></div>

        <!-- IMPUESTOS -->
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border)">(-) Impuestos</div>
        ${finRow('IT (3% precio facturado)',     -r.impuestoIT,          false,'neg')}
        ${r.impuestoIUE>0 ? finRow('IUE (25% utilidad gravable)', -(r.impuestoIUE), false,'neg') : ''}
        <div style="margin-top:10px;padding:8px 10px;background:rgba(59,130,246,.07);border-radius:6px;border-left:3px solid #3B82F6;font-size:.73rem;color:var(--text3);line-height:1.6">
          <strong style="color:#3B82F6">ⓘ IVA — tributo neutro para la empresa (Ley 843)</strong><br>
          Débito fiscal (ventas): ${fmt.bs(r.ivaDebito||0)}&nbsp;&nbsp;·&nbsp;&nbsp;
          Crédito fiscal (compras + servicios con factura): ${fmt.bs(r.ivaCredito||0)}<br>
          <strong>IVA neto a pagar al Estado: ${fmt.bs(r.ivaAPagar||0)}</strong><br>
          El IVA no es gasto — la empresa lo cobra al cliente y entrega el neto al Estado.
        </div>
        <div style="height:4px;border-top:2px solid var(--border2)"></div>
        ${finRowSub('= Utilidad neta',         r.utilidadNeta,         true)}
      </div>
    </div>
  </div>

  <!-- Balance General -->
  <div id="finBG" style="display:none">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

      <!-- ACTIVOS -->
      <div>
        <div class="result-round-card" style="margin-bottom:12px">
          <div class="result-round-header"><h3>Activos</h3></div>
          <div style="padding:16px 20px">

            <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border)">Activo Corriente</div>
            ${finRow('Caja y bancos',              r.cajaFinal,           false,'pos')}
            ${finRow('Cuentas por cobrar (CxC)',   r.cxcFinal,            false,'neutral')}
            ${finRow('Inventarios',                r.invFinalValorizado,  false,'neutral')}
            <div style="height:4px;border-top:1px dashed var(--border)"></div>
            ${finRowSub('= Total Activo Corriente', (r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0), false)}

            <div style="height:8px"></div>
            <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border)">Activo No Corriente</div>
            ${(r.activosFijosIniciales||0)>0 ? finRow('Activos fijos (valor inicial)', r.activosFijosIniciales, false,'neutral') : ''}
            ${(r.activosFijosIniciales||0)>0 ? finRow('(-) Depreciación acumulada', -(r.depreciacionAcumulada||r.depreciacion||0), false,'neg') : ''}
            ${finRow('Activos fijos netos', r.afNetos||0, false,'neutral')}
            <div style="height:4px;border-top:1px dashed var(--border)"></div>
            ${finRowSub('= Total Activo No Corriente', r.afNetos||0, false)}

            <div style="height:8px"></div>
            <div style="height:4px;border-top:2px solid var(--border2)"></div>
            ${finRowSub('= TOTAL ACTIVOS', r.totalActivos||(r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0)+(r.afNetos||0), true)}
          </div>
        </div>
      </div>

      <!-- PASIVOS + PATRIMONIO -->
      <div>
        <div class="result-round-card" style="margin-bottom:12px">
          <div class="result-round-header"><h3>Pasivos</h3></div>
          <div style="padding:16px 20px">

            <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border)">Pasivo Corriente</div>
            ${(r.ivaAPagar||0)>0 ? finRow('IVA por pagar (saldo trimestre)', r.ivaAPagar, false,'neg') : ''}
            ${(r.sobregiro||0)>0 ? finRow('Sobregiro bancario',        r.sobregiro, false,'neg') : ''}
            ${finRow('Préstamos y deuda total',    r.deudaFinal,        false,'neg')}
            <div style="height:4px;border-top:1px dashed var(--border)"></div>
            ${finRowSub('= Total Pasivo Corriente', (r.deudaFinal||0)+(r.ivaAPagar||0)+(r.sobregiro||0), false)}

            <div style="height:8px"></div>
            <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border)">Pasivo No Corriente</div>
            ${finRow('Deuda largo plazo',           0,                   false,'neutral')}
            <div style="height:4px;border-top:1px dashed var(--border)"></div>
            ${finRowSub('= Total Pasivo No Corriente', 0,               false)}

            <div style="height:8px"></div>
            <div style="height:4px;border-top:2px solid var(--border2)"></div>
            ${finRowSub('= TOTAL PASIVOS', (r.deudaFinal||0)+(r.ivaAPagar||0)+(r.sobregiro||0), true)}
          </div>
        </div>

        <div class="result-round-card" style="margin-bottom:12px">
          <div class="result-round-header"><h3>Patrimonio</h3></div>
          <div style="padding:16px 20px">
            ${(() => {
              // Usar valores del engine directamente — no recalcular
              const capital  = r.capitalContable || 680000;
              const utilidad = r.utilidadNeta    || 0;
              const acumAnt  = r.resultadoAcumulado != null
                ? (r.resultadoAcumulado - utilidad)   // acumulado ANTES de esta ronda
                : 0;
              const patrimonio = capital + acumAnt + utilidad;
              return finRow('Capital contable / social', capital,  false, 'neutral')
                + finRow('Resultados acumulados', acumAnt, false, acumAnt>=0?'pos':'neg')
                + finRow('Utilidad / pérdida del período', utilidad, false, utilidad>=0?'pos':'neg')
                + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
                + finRowSub('= TOTAL PATRIMONIO', patrimonio, true);
            })()}
          </div>
        </div>

        <div class="result-round-card">
          <div style="padding:12px 16px">
            ${(() => {
              const totalA   = r.totalActivos||(r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0)+(r.afNetos||0);
              const totalP   = (r.deudaFinal||0)+(r.ivaAPagar||0)+(r.sobregiro||0);
              const patrim   = r.patrimonio || (totalA - totalP);
              const totalPP  = totalP + patrim;
              const cuadra   = Math.abs(totalA - totalPP) < 2;
              return finRowSub('TOTAL PASIVOS + PATRIMONIO', totalPP, true)
                + '<div style="margin-top:8px;padding:8px 12px;background:'
                + (cuadra?'rgba(6,255,165,.08)':'rgba(255,107,107,.08)')
                + ';border-radius:var(--r);font-size:.78rem;font-family:var(--font-mono)">'
                + (cuadra ? '✓ Balance cuadra' : '⚠ Verificar balance')
                + ' (Activos = ' + fmt.bs(totalA) + ' | P+P = ' + fmt.bs(totalPP) + ')</div>';
            })()}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Flujo de Efectivo -->
  <div id="finFC" style="display:none">
    <div class="result-round-card">
      <div class="result-round-header"><h3>Estado de Flujo de Efectivo — Ronda ${n}</h3></div>
      <div style="padding:16px 20px">

        ${finRow('Caja inicial', r.cajaInicial, false, 'neutral')}
        <div style="height:12px"></div>

        <!-- ── ACTIVIDADES DE OPERACIÓN ── -->
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:6px 0;border-bottom:2px solid var(--border2);margin-bottom:4px">
          Flujo de Efectivo por Actividades de Operación
        </div>

        <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--accent2);text-transform:uppercase;letter-spacing:1px;padding:4px 0">Entradas Operativas</div>
        ${finRow('Cobros por ventas al contado',      r.cobrosContado||0,                        false,'pos')}
        <div style="height:4px"></div>
        <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--accent4);text-transform:uppercase;letter-spacing:1px;padding:4px 0">Salidas Operativas</div>
        ${(r.pagoMPbruto||0)>0       ? finRow('Pago materia prima (bruto)',    -(r.pagoMPbruto||0),          false,'neg') : ''}
        ${(r.pagoComisiones||0)>0    ? finRow('Pago comisión canal',           -(r.pagoComisiones||0),       false,'neg') : ''}
        ${(r.pagoOperarios2||r.pagoOperarios||0)>0 ? finRow('Pago de operarios', -(r.pagoOperarios2||r.pagoOperarios||0), false,'neg') : ''}
        ${(r.costoVendedores||0)>0   ? finRow('Pago fuerza de ventas',         -(r.costoVendedores||0),      false,'neg') : ''}
        ${(r.pagoMktTotal||0)>0      ? finRow('Pago de marketing total',        -(r.pagoMktTotal||0),         false,'neg') : ''}
        ${(r.pagoInnovacion||0)>0    ? finRow('Pago de innovación operativa',   -(r.pagoInnovacion||0),       false,'neg') : ''}
        ${(r.pagoCalidad||0)>0       ? finRow('Pago de calidad',                -(r.pagoCalidad||0),          false,'neg') : ''}
        ${(r.pagoGastosAdmin||r.pagoAdmin||r.gastoAdminFijo||0)>0   ? finRow('Pago de gastos administrativos', -(r.pagoGastosAdmin||r.pagoAdmin||r.gastoAdminFijo||0), false,'neg') : ''}
        ${(r.pagoGastosPlanta||r.pagoPlanta||r.gastoFijoPlanta||0)>0 ? finRow('Pago de gastos de planta',     -(r.pagoGastosPlanta||r.pagoPlanta||r.gastoFijoPlanta||0), false,'neg') : ''}
        ${(r.pagoAlmacenamiento||r.pagoAlmacen||0)>0 ? finRow('Pago de almacenamiento', -(r.pagoAlmacenamiento||r.pagoAlmacen||0), false,'neg') : ''}
        ${(r.pagoIVAPeriodoAnterior||0)>0 ? finRow('Pago IVA trimestre anterior al Estado', -(r.pagoIVAPeriodoAnterior||0), false,'neg') : ''}
        ${(r.ivaAPagar||0)>0 ? '<div style="font-size:.72rem;color:var(--text3);padding:3px 0 3px 12px;border-bottom:0.5px solid var(--border)">IVA generado este trimestre: Bs '+Math.round(r.ivaAPagar||0).toLocaleString()+' (se pagará en el siguiente trimestre)</div>' : ''}
        ${(r.compensacionIT||0)>0
          ? finRow('IT devengado período', -(r.impuestoIT||0), false,'neg') +
            finRow('(+) Compensado con saldo IUE', +(r.compensacionIT||0), false,'pos') +
            finRow('Pago IT efectivo en caja', -(r.pagoIT||0), false,'neutral')
          : finRow('Pago IT (efectivo)', -(r.pagoIT??r.impuestoIT??0), false,'neg')}

        ${(r.pagoIUE||0)>0 ? finRow('Pago IUE',              -(r.pagoIUE||0), false,'neg') : ''}
        ${(r.saldoIUEfinal||0)>0 ? finRow('Saldo IUE compensable próx. trimestre', r.saldoIUEfinal||0, false,'neutral') : ''}
        <div style="height:4px;border-top:1px dashed var(--border)"></div>
        ${(() => {
          const entOp = (r.cobrosContado||0);
          const salOp = (r.pagoMPbruto||0)+(r.pagoComisiones||0)
                       +(r.pagoOperarios2||r.pagoOperarios||0)+(r.costoVendedores||0)
                       +(r.pagoMktTotal||0)+(r.pagoInnovacion||0)+(r.pagoCalidad||0)
                       +(r.pagoGastosAdmin||r.pagoAdmin||r.gastoAdminFijo||0)
                       +(r.pagoGastosPlanta||r.pagoPlanta||r.gastoFijoPlanta||0)
                       +(r.pagoAlmacenamiento||r.pagoAlmacen||0)
                       +(r.pagoIVAPeriodoAnterior||0)+(r.pagoIT??r.impuestoIT??0)+(r.pagoIUE||0);
          return finRowSub('= Flujo Neto de Actividades de Operación', entOp - salOp, false);
        })()}
        <div style="height:12px"></div>

        <!-- ── ACTIVIDADES DE INVERSIÓN ── -->
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:6px 0;border-bottom:2px solid var(--border2);margin-bottom:4px">
          Flujo de Efectivo por Actividades de Inversión
        </div>
        <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--accent2);text-transform:uppercase;letter-spacing:1px;padding:4px 0">Entradas de Inversión</div>
        ${finRow('Venta de activos fijos', r.ventaActivosFijos||0, false,'pos')}
        <div style="height:4px"></div>
        <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--accent4);text-transform:uppercase;letter-spacing:1px;padding:4px 0">Salidas de Inversión</div>
        ${finRow('Compra de activos fijos / maquinaria', -(r.compraActivosFijos||0), false,'neg')}
        ${(r.pagoInnovacionCapital||0)>0 ? finRow('Innovación capitalizable', -(r.pagoInnovacionCapital||0), false,'neg') : ''}
        <div style="height:4px;border-top:1px dashed var(--border)"></div>
        ${finRowSub('= Flujo Neto de Actividades de Inversión', (r.ventaActivosFijos||0)-(r.compraActivosFijos||0)-(r.pagoInnovacionCapital||0), false)}
        <div style="height:12px"></div>

        <!-- ── ACTIVIDADES DE FINANCIAMIENTO ── -->
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:6px 0;border-bottom:2px solid var(--border2);margin-bottom:4px">
          Flujo de Efectivo por Actividades de Financiamiento
        </div>
        <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--accent2);text-transform:uppercase;letter-spacing:1px;padding:4px 0">Entradas de Financiamiento</div>
        ${(r.ingresoPrestamo||0)>0 ? finRow('Ingreso por préstamo',   r.ingresoPrestamo||0, false,'pos') : ''}
        ${(r.sobregiro||0)>0       ? finRow('Sobregiro tomado',        r.sobregiro||0,       false,'pos') : ''}
        <div style="height:4px"></div>
        <div style="font-family:var(--font-mono);font-size:.6rem;color:var(--accent4);text-transform:uppercase;letter-spacing:1px;padding:4px 0">Salidas de Financiamiento</div>
        ${(r.pagoCapitalPrestamo||0)>0    ? finRow('Pago de capital préstamo',      -(r.pagoCapitalPrestamo||0),   false,'neg') : ''}
        ${(r.pagoIntereses||r.interesesPrestamo||0)>0 ? finRow('Pago de intereses préstamo', -(r.pagoIntereses||r.interesesPrestamo||0), false,'neg') : ''}
        ${(r.interesSobregiro||0)>0       ? finRow('Pago de intereses sobregiro',  -(r.interesSobregiro||0),      false,'neg') : ''}
        ${(r.comisionApertura||0)>0       ? finRow('Pago de comisión de apertura', -(r.comisionApertura||0),      false,'neg') : ''}
        <div style="height:4px;border-top:1px dashed var(--border)"></div>
        ${(() => {
          const entFin = (r.ingresoPrestamo||0)+(r.sobregiro||0);
          const salFin = (r.pagoCapitalPrestamo||0)+(r.pagoIntereses||r.interesesPrestamo||0)+(r.interesSobregiro||0)+(r.comisionApertura||0);
          return finRowSub('= Flujo Neto de Actividades de Financiamiento', entFin - salFin, false);
        })()}
        <div style="height:12px"></div>

        <!-- ── RESUMEN ── -->
        <div style="height:4px;border-top:2px solid var(--border2)"></div>
        ${(() => {
          const entOp = (r.cobrosContado||0);
          const salOp = (r.pagoMPbruto||0)+(r.pagoComisiones||0)
                       +(r.pagoOperarios2||r.pagoOperarios||0)+(r.costoVendedores||0)
                       +(r.pagoMktTotal||0)+(r.pagoInnovacion||0)+(r.pagoCalidad||0)
                       +(r.pagoGastosAdmin||r.pagoAdmin||r.gastoAdminFijo||0)
                       +(r.pagoGastosPlanta||r.pagoPlanta||r.gastoFijoPlanta||0)
                       +(r.pagoAlmacenamiento||r.pagoAlmacen||0)
                       +(r.pagoIVAPeriodoAnterior||0)+(r.pagoIT??r.impuestoIT??0)+(r.pagoIUE||0);
          const entFin = (r.ingresoPrestamo||0)+(r.sobregiro||0);
          const salFin = (r.pagoCapitalPrestamo||0)+(r.pagoIntereses||r.interesesPrestamo||0)+(r.interesSobregiro||0)+(r.comisionApertura||0);
          const entInv = (r.ventaActivosFijos||0);
          const salInv = (r.compraActivosFijos||0)+(r.pagoInnovacionCapital||0);
          const varNeta = (entOp - salOp) + (entInv - salInv) + (entFin - salFin);
          return finRowSub('Aumento / Disminución Neta de Caja', varNeta, false);
        })()}
        <div style="height:4px"></div>
        ${finRowSub('= CAJA FINAL', r.cajaFinal, true)}
        ${(r.sobregiro||0)>0 ? '<div style="padding:6px 0;font-size:.76rem;color:var(--accent4)">⚠ Sobregiro activado: Bs ' + fmt.num(r.sobregiro) + ' · Interés: Bs ' + fmt.num(r.interesSobregiro||0) + '</div>' : ''}
      </div>
    </div>
  </div>

  <!-- Reporte Tributario -->
  <div id="finTR" style="display:none">
    <div class="result-round-card">
      <div class="result-round-header">
        <h3>📊 Reporte Gerencial Tributario — Ronda ${n}</h3>
      </div>
      <div style="padding:16px 20px;max-width:640px">
        ${(() => {
          const sec = (num, titulo) =>
            '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:6px 0 4px;border-bottom:2px solid var(--border2);margin:16px 0 8px">'
            + num + '. ' + titulo + '</div>';
          const rowT = (lbl, v, neg) => {
            const val = neg ? -(v||0) : (v||0);
            const col = val < 0 ? 'var(--accent4)' : 'var(--text1)';
            return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:.82rem">'
              + '<span style="color:var(--text2)">' + lbl + '</span>'
              + '<span style="font-family:var(--font-mono);color:' + col + '">'
              + (val<0?'(':'' ) + 'Bs ' + Math.abs(Math.round(val)).toLocaleString('es') + (val<0?')':'')
              + '</span></div>';
          };
          const rowSubT = (lbl, v, color) => {
            const c = color || ((v||0)>=0?'var(--accent2)':'var(--accent4)');
            return '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:.84rem;font-weight:700;border-top:1px solid var(--border2);margin-top:2px">'
              + '<span>' + lbl + '</span>'
              + '<span style="font-family:var(--font-mono);color:'+c+'">Bs ' + Math.round(v||0).toLocaleString('es') + '</span></div>';
          };
          const badgeT = (lbl, v, tipo) => {
            const c = tipo==='pos'?'var(--accent2)':tipo==='neg'?'var(--accent4)':'var(--accent3)';
            return '<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:4px;background:rgba(255,255,255,.05);margin:4px 4px 4px 0;font-size:.78rem">'
              + '<span style="color:var(--text3)">' + lbl + ':</span>'
              + '<span style="font-family:var(--font-mono);font-weight:700;color:'+c+'">Bs ' + Math.round(v||0).toLocaleString('es') + '</span></div>';
          };

          const ivaDebito  = r.ivaDebito  || 0;
          const ivaCredito = r.ivaCredito || 0;
          const ivaAPagar  = r.ivaAPagar  || 0;
          const ivaFavor   = ivaCredito > ivaDebito ? ivaCredito - ivaDebito : 0;
          const itDet      = r.impuestoIT  || 0;
          // totalFacturado: usar directo, o calcular desde IT (IT = totalFact × 3%)
          const totalFact  = r.totalFacturado
            || (itDet > 0 ? Math.round(itDet / 0.03) : 0)
            || ((r.ventasBrutas||0) + ivaDebito);
          const itComp     = r.compensacionIUE || 0;
          const itPagar    = Math.max(0, itDet - itComp);
          const utilAntesIT= (r.ebit||0) - (r.gastoFinanciero||0);
          const iueDet     = r.impuestoIUE || 0;
          const saldoIUE   = r.saldoIUEfinal || 0;
          const pagoIVAAnt = r.pagoIVAPeriodoAnterior || 0;

          return sec('1','IVA — Impuesto al Valor Agregado')
            + rowT('IVA Débito Fiscal por ventas', ivaDebito)
            + rowT('(−) IVA Crédito Fiscal por compras y gastos', ivaCredito, true)
            + rowSubT('= IVA neto del período', ivaDebito - ivaCredito)
            + '<div style="margin-top:6px">'
            + (ivaAPagar > 0 ? badgeT('IVA por pagar', ivaAPagar, 'neg') : badgeT('IVA a favor', ivaFavor, 'pos'))
            + '</div>'

            + sec('2','IT — Impuesto a las Transacciones')
            + rowT('Ventas facturadas del período (con IVA)', totalFact)
            + rowT('× Alícuota IT (3%)', Math.round(totalFact * 0.03))
            + rowSubT('= IT determinado', itDet)
            + rowT('(−) Compensación con IUE pagado disponible', itComp, true)
            + rowSubT('= IT por pagar en efectivo', itPagar)

            + sec('3','IUE — Impuesto a las Utilidades de las Empresas')
            + rowT('Utilidad antes de impuestos', utilAntesIT)
            + rowT('(+/−) Ajustes tributarios', 0)
            + rowSubT('= Utilidad imponible', utilAntesIT)
            + rowT('× Alícuota IUE (25%)', utilAntesIT > 0 ? Math.round(utilAntesIT * 0.25) : 0)
            + rowSubT('= IUE determinado (acumulado)', utilAntesIT > 0 ? Math.round(utilAntesIT * 0.25) : 0)
            + '<div style="padding:4px 0 6px;font-size:.74rem;color:var(--accent3);font-style:italic">'
            + 'ⓘ El IUE se liquida al cierre del año fiscal (R4 / R8 / R12). '
            + 'El monto acumulado queda disponible para compensar IT en trimestres siguientes.'
            + '</div>'
            + rowT('IUE efectivamente pagado este período', iueDet)
            + rowT('(−) Pagos a cuenta', 0, true)
            + rowSubT('= IUE por pagar en efectivo este trimestre', Math.max(0, iueDet))

            + sec('4','Saldo de IUE Compensable')
            + rowT('IUE pagado en la gestión', iueDet)
            + rowT('(−) IT compensado con IUE', itComp, true)
            + rowSubT('= Saldo IUE disponible para compensar IT futuro', saldoIUE, 'var(--accent3)')

            + sec('5','Resumen de Caja Tributaria')
            + rowT('IVA período anterior pagado en efectivo', pagoIVAAnt)
            + rowT('IT pagado en efectivo', itPagar)
            + rowT('IUE pagado en efectivo', Math.max(0, iueDet))
            + rowSubT('= Salida total de caja por impuestos', pagoIVAAnt + itPagar + Math.max(0, iueDet))

            + sec('6','Situación Tributaria Final')
            + '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">'
            + badgeT('IVA ' + (ivaAPagar>0?'por pagar':'a favor'), ivaAPagar>0?ivaAPagar:ivaFavor, ivaAPagar>0?'neg':'pos')
            + badgeT('IT por pagar', itPagar, itPagar>0?'neg':'pos')
            + badgeT('IUE por pagar', Math.max(0,iueDet), iueDet>0?'neg':'pos')
            + badgeT('Saldo IUE compensable', saldoIUE, 'pos')
            + '</div>';
        })()}
      </div>
    </div>
  </div>`;
};

function finRow(label, value, bold=false, type='neutral') {
  const col = type==='pos' ? 'var(--accent5)' : type==='neg' ? 'var(--accent4)' : 'var(--text)';
  const w = bold ? 'font-weight:700' : '';
  return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:.83rem;${w}">
    <span style="color:var(--text2)">${label}</span>
    <span style="font-family:var(--font-mono);font-size:.8rem;color:${col}">${fmt.bs(value)}</span>
  </div>`;
}

function finRowSub(label, value, bold=false) {
  const col = value>=0 ? 'var(--accent5)' : 'var(--accent4)';
  return `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:.85rem;font-weight:700;margin-top:2px">
    <span>${label}</span>
    <span style="font-family:var(--font-mono);color:${col}">${fmt.bs(value)}</span>
  </div>`;
}

window.showFinTab = (tab) => {
  ['pl','bg','fc','tr'].forEach(t => {
    const el = document.getElementById(`fin${t.toUpperCase()}`);
    if (el) el.style.display = t===tab ? '' : 'none';
  });
  const labels = {pl:'tabPL',bg:'tabBG',fc:'tabFC',tr:'tabTR'};
  Object.entries(labels).forEach(([t,id]) => {
    const btn = document.getElementById(id);
    if (btn) { btn.style.background = t===tab?'var(--accent)':''; btn.style.color = t===tab?'#fff':''; }
  });
};

window.mostrarRondaResultado = async (n, historial) => {
  // Update active btn
  document.querySelectorAll('#equipoResultadosContent .ronda-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace('Ronda ','')) === n);
  });

  if (!historial) {
    const data = await api('GET','/api/resultados');
    historial = data.historial;
  }
  const item = historial.find(h => h.ronda === n);
  if (!item) return;
  const r = item.resultado;

  document.getElementById('resultadoRondaDetalle').innerHTML = `
    <div class="result-round-card">
      <div class="result-round-header">
        <h3>Ronda ${n} — ${r.segmento} · ${r.tipoProducto}</h3>
        <span style="font-size:.74rem;color:var(--text3)">${fmt.dt(item.ejecutadaAt)}</span>
      </div>
      <div class="kpi-grid">
        <div>
          <div class="kpi-row"><span class="kpi-label">Demanda estimada</span><span class="kpi-value">${fmt.num(r.demandaEstimada)} unid</span></div>
          <div class="kpi-row"><span class="kpi-label">Ventas reales</span><span class="kpi-value warn">${fmt.num(r.ventasReales)} unid</span></div>
          <div class="kpi-row"><span class="kpi-label">Inventario final</span><span class="kpi-value">${fmt.num(r.inventarioFinal)} unid</span></div>
          <div class="kpi-row"><span class="kpi-label">Ingresos</span><span class="kpi-value">${fmt.bs(r.ingresos)}</span></div>
          <div class="kpi-row"><span class="kpi-label">Costo de ventas</span><span class="kpi-value">${fmt.bs(r.costoVentas)}</span></div>
          <div class="kpi-row"><span class="kpi-label">EBIT</span><span class="kpi-value ${r.ebit>=0?'up':'down'}">${fmt.bs(r.ebit)}</span></div>
          <div class="kpi-row"><span class="kpi-label">Utilidad neta</span><span class="kpi-value ${r.utilidadNeta>=0?'up':'down'}">${fmt.bs(r.utilidadNeta)}</span></div>
        </div>
        <div>
          <div class="kpi-row"><span class="kpi-label">Caja final</span><span class="kpi-value ${r.cajaFinal>=0?'up':'down'}">${fmt.bs(r.cajaFinal)} <span class="badge ${r.alertaCaja==='ALERTA'?'badge-alert':'badge-ok'}">${r.alertaCaja}</span></span></div>
          <div class="kpi-row"><span class="kpi-label">CxC final</span><span class="kpi-value">${fmt.bs(r.cxcFinal)}</span></div>
          <div class="kpi-row"><span class="kpi-label">Deuda final</span><span class="kpi-value">${fmt.bs(r.deudaFinal)}</span></div>
          <div class="kpi-row"><span class="kpi-label">Market share seg.</span>
            <div class="share-bar-wrap">
              <div class="share-bar-bg"><div class="share-bar-fill" style="width:${Math.min(100,r.shareReal*100)}%"></div></div>
              <span class="share-val">${fmt.pct(r.shareReal)}</span>
            </div>
          </div>
          <div class="kpi-row"><span class="kpi-label">Costo unitario</span><span class="kpi-value">Bs ${fmt.d(r.costoUnitario,3)}</span></div>
          <div class="kpi-row"><span class="kpi-label">ROI Marketing</span><span class="kpi-value ${r.roiMarketing>=1?'up':'down'}">${fmt.d(r.roiMarketing,2)}x</span></div>
          <div class="kpi-row"><span class="kpi-label">Brand Equity</span><span class="kpi-value" style="color:var(--accent3)">${(r.brandEquityFinal ?? 50).toFixed(1)} <span style="font-size:.7rem;color:var(--text3)">pts</span></span></div>
          <div class="kpi-row"><span class="kpi-label">Dotación (Op/Adm/Vend)</span><span class="kpi-value">${r.operarios}/${r.admins}/${r.vendedoresFinales}</span></div>
        </div>
      </div>
    </div>
    ${buildEvoChart(historial)}
  `;
  renderEvoCharts(historial);
};

function buildEvoChart(historial) {
  if (historial.length < 2) return '';
  return `<div class="charts-row" style="margin-top:16px">
    <div class="chart-card"><h4>Evolución EBIT (Bs)</h4><div class="chart-wrap"><canvas id="chartEvo"></canvas></div></div>
    <div class="chart-card"><h4>Evolución Caja (Bs)</h4><div class="chart-wrap"><canvas id="chartCajaEvo"></canvas></div></div>
  </div>`;
}

function renderEvoCharts(historial) {
  ['chartEvo','chartCajaEvo'].forEach(id => {
    const c = document.getElementById(id);
    if (!c) return;
    const labels = historial.map(h => `R${h.ronda}`);
    const defOpts = { responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}, scales:{x:{ticks:{color:'#9BA3C4',font:{family:'Space Mono',size:9}},grid:{color:'#2A2F45'}},y:{ticks:{color:'#9BA3C4',font:{family:'Space Mono',size:9}},grid:{color:'#2A2F45'}}} };
    const isEBIT = id === 'chartEvo';
    const values = historial.map(h => isEBIT ? h.resultado.ebit : h.resultado.cajaFinal);
    new Chart(c, { type:'line', data:{ labels, datasets:[{data:values, borderColor:isEBIT?'#6C63FF':'#4ECDC4', backgroundColor:isEBIT?'rgba(108,99,255,.1)':'rgba(78,205,196,.1)', fill:true, tension:.3, pointRadius:4}]}, options:defOpts });
  });
}

// ── Equipo Reportes ────────────────────────────────────────

console.log('[equipo-financiero] ✅ Módulo cargado — Estados Financieros activos');
