/**
 * modules/equipo-resultados.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo: KPIs y resultados del equipo
 * Fase 2 — Día 3 del plan de modularización
 *
 * Funciones incluidas:
 *   - loadEquipoResultados → KPIs, comparativa, gráficas
 *
 * Dependencias: api(), fmt (ui-components.js), state, toast
 * Reversión: comentar <script src="modules/equipo-resultados.js"> en index.html
 * ─────────────────────────────────────────────────────────────────────────────
 */

async function loadEquipoResultados() {
  const data = await api('GET','/api/resultados');
  const el = document.getElementById('equipoResultadosContent');
  if (!el) return;

  if (!data.historial?.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Aún no hay rondas simuladas.</p></div>`;
    return;
  }

  const latest = data.historial[data.historial.length - 1];
  const nav = data.historial.map(h=>`<button class="ronda-btn simulated" onclick="mostrarKpiRonda(${h.ronda})">Ronda ${h.ronda}</button>`).join('');
  el.innerHTML = `<div class="ronda-selector">${nav}</div><div id="kpiDetalle"></div>`;
  mostrarKpiRonda(latest.ronda, data.historial);
}

window.mostrarKpiRonda = (n, historial) => {
  document.querySelectorAll('#equipoResultadosContent .ronda-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace('Ronda ',''))===n);
  });
  if (!historial) { api('GET','/api/resultados').then(d=>mostrarKpiRonda(n,d.historial)); return; }
  const item = historial.find(h=>h.ronda===n);
  if (!item) return;
  const r = item.resultado;

  // ── Calculated KPIs ──
  const mgBruto   = r.ventasNetas>0 ? (r.utilidadBruta/r.ventasNetas*100).toFixed(2) : '—';
  const mgNeto    = r.ventasNetas>0 ? (r.utilidadNeta/r.ventasNetas*100).toFixed(2)  : '—';
  const endeud    = r.totalActivos>0 ? (r.deudaFinal/r.totalActivos*100).toFixed(2)  : '0.00';
  const invProd   = r.produccion>0 ? (r.inventarioFinal/r.produccion*100).toFixed(1) : '0.0';
  const vendFin   = r.vendedoresFinales || 0;
  const ventasPorVend = vendFin>0 ? fmt.num(Math.round(r.ventasReales/vendFin)) : '—';
  const ingrPorVend  = vendFin>0 ? fmt.bs(Math.round(r.ventasNetas/vendFin))   : '—';
  const utilPorUnid  = r.ventasReales>0 ? fmt.d((r.ventasNetas-r.costoVentas)/r.ventasReales,3) : '—';
  const liquidez  = r.deudaFinal>0 ? fmt.d((r.cajaFinal+r.cxcFinal+r.invFinalValorizado)/r.deudaFinal,2) : '∞';

  const kpiSection = (title) =>
    '<tr><td colspan="3" style="padding:6px 14px 2px;font-family:var(--font-mono);font-size:.63rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;border-top:1px solid var(--border)">' + title + '</td></tr>';

  const kpiRow = (label, value, color='', hint='') =>
    `<tr><td style="padding:8px 14px;color:var(--text2);font-size:.82rem">${label}</td>
         <td style="padding:8px 14px;font-family:var(--font-mono);font-size:.82rem;text-align:right;color:${color||'var(--text)'}">${value}</td></tr>`;

  document.getElementById('kpiDetalle').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-top:14px">

      <!-- ── Gerente de Marketing ────────────────────── -->
      <div class="result-round-card">
        <div class="result-round-header"><h3>📣 Gerente de Marketing</h3></div>
        <table style="width:100%;border-collapse:collapse">

          ${/* ─ Penetración y posicionamiento ─ */kpiSection('🎯 Penetración y Posicionamiento')}
          ${kpiRow('Market Share real',
              fmt.pct(r.shareReal),
              r.shareReal>0.35?'var(--accent5)':r.shareReal>0.15?'var(--accent3)':'var(--accent4)',
              r.shareReal>0.35?'Líder de mercado':r.shareReal>0.15?'Posición competitiva':'Posición débil')}
          ${kpiRow('Demanda formal del segmento',   fmt.num(r.demandaFormal||0),     'var(--text2)')}
          ${kpiRow('Demanda asignada a la empresa', fmt.num(r.demandaAsignada||0),   'var(--accent3)')}
          ${kpiRow('Unidades vendidas',             fmt.num(r.ventasReales||0),      r.ventasReales>0?'var(--accent5)':'var(--accent4)')}
          ${kpiRow('% Demanda capturada',
              r.demandaFormal>0 ? fmt.pct((r.ventasReales||0)/(r.demandaFormal)) : '—',
              'var(--text2)')}

          ${kpiSection('💰 Rentabilidad Comercial')}
          ${kpiRow('Ventas brutas (Bs)',            fmt.bs(r.ventasBrutas||0),       'var(--text2)')}
          ${kpiRow('Ventas netas (Bs)',             fmt.bs(r.ventasNetas||0),        'var(--accent3)')}
          ${kpiRow('Margen bruto (%)',
              r.ventasNetas>0 ? ((r.utilidadBruta||0)/r.ventasNetas*100).toFixed(1)+'%' : '—',
              (r.utilidadBruta||0)>=0?'var(--accent5)':'var(--accent4)',
              (r.utilidadBruta||0)>=0?'Margen positivo':'Margen negativo')}
          ${kpiRow('Precio de venta (Bs)',
              fmt.bs(r.precioVenta||0),
              'var(--text2)')}
          ${kpiRow('Costo unitario (Bs)',
              fmt.bs(r.costoUnitario||0),
              'var(--text2)')}
          ${kpiRow('Margen unitario (Bs)',
              fmt.bs((r.precioVenta||0)-(r.costoUnitario||0)),
              (r.precioVenta||0)>(r.costoUnitario||0)?'var(--accent5)':'var(--accent4)')}

          ${kpiSection('📢 Inversión y Eficiencia de Marketing')}
          ${kpiRow('Gasto publicidad (Bs)',         fmt.bs(r.publicidad||0),         'var(--text2)')}
          ${kpiRow('Gasto total marketing (Bs)',    fmt.bs(r.pagoMktTotal||0),       'var(--text2)')}
          ${kpiRow('ROI Marketing',
              fmt.d(r.roiMarketing??0,2)+'x',
              (r.roiMarketing??0)>=2?'var(--accent5)':(r.roiMarketing??0)>=1?'var(--accent3)':'var(--accent4)',
              (r.roiMarketing??0)>=2?'Excelente':(r.roiMarketing??0)>=1?'Aceptable':'Bajo')}
          ${kpiRow('Costo Mkt por unidad vendida (Bs)',
              r.ventasReales>0 ? fmt.bs((r.pagoMktTotal||0)/(r.ventasReales)) : '—',
              'var(--text2)')}
          ${kpiRow('Ingresos por Bs 1 de publicidad (x)',
              r.publicidad>0 ? fmt.d((r.ventasNetas||0)/(r.publicidad),1)+'x' : '—',
              (r.publicidad||0)>0&&(r.ventasNetas||0)/(r.publicidad)>3?'var(--accent5)':'var(--text2)')}

          ${kpiSection('⭐ Marca y Posicionamiento')}
          ${kpiRow('Brand Equity',
              (r.brandEquityFinal ?? 50).toFixed(1)+' pts',
              (r.brandEquityFinal||50)>70?'var(--accent5)':(r.brandEquityFinal||50)>50?'var(--accent3)':'var(--accent4)',
              (r.brandEquityFinal||50)>70?'Marca fuerte':(r.brandEquityFinal||50)>50?'En construcción':'Marca débil')}
          ${kpiRow('Atractivo competitivo',
              fmt.d(r.atractivo||0,2)+' pts',
              (r.atractivo||0)>10?'var(--accent5)':(r.atractivo||0)>5?'var(--accent3)':'var(--accent4)')}

        </table>
      </div>

      <!-- ── Gerente de Producción ───────────────────── -->
      <div class="result-round-card">
        <div class="result-round-header"><h3>🏭 Gerente de Producción</h3></div>
        <table style="width:100%;border-collapse:collapse">
          ${kpiRow('Producción (pares)',             fmt.num(r.produccion))}
          ${kpiRow('Inventario final (unidades)',   fmt.num(r.inventarioFinal))}
          ${kpiRow('Inventario / Producción',       invProd+'%', +invProd>20?'var(--accent4)':'var(--accent5)')}
          ${kpiRow('Capacidad efectiva (pares)',    fmt.num(r.capacidadEfectiva ?? '—'))}
          ${kpiRow('Stock MP disponible (unid)',    fmt.num(r.stockMPFinal ?? '—'))}
          <tr><td colspan="2" style="padding:4px 12px;font-family:var(--font-mono);font-size:.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;background:rgba(255,255,255,.03)">Desglose Costo Unitario</td></tr>
          ${kpiRow('Costo unitario TOTAL (Bs)',     fmt.d(r.costoUnitario,2))}
          ${kpiRow('  └ Transformación (MOD+OH, Bs)', (() => {
            if (r.costoTransformacion!=null) return fmt.d(r.costoTransformacion,2);
            if (r.costoBaseProducto)         return fmt.d(Math.round((r.costoBaseProducto||0)*0.60*100)/100,2);
            // fallback: CU - MPneto - calidad - canal_aprox
            const pct = 0.60;
            return fmt.d(Math.round((r.costoUnitario||0)*pct*100)/100,2);
          })())}
          ${kpiRow('  └ Factor calidad (Bs)',       r.costoCalidadUnit!=null?fmt.d(r.costoCalidadUnit,2):'—')}
          ${kpiRow('  └ Canal distribución (Bs)', (() => {
            if (r.costoCanal_calc!=null) return fmt.d(Math.max(0,r.costoCanal_calc),2);
            // fallback: CU − trans − calidad − MPneto − efInnovacion
            const trans  = r.costoTransformacion || Math.round((r.costoBaseProducto||0)*0.60*100)/100;
            const cal    = r.costoCalidadUnit    || Math.round(0.20*(r.calidad||5)*100)/100;
            const mpNeto = Math.round((r.costoMPunitario||0)*0.87*100)/100;
            const ef     = r.efInnovacionUnit    || 0;
            return fmt.d(Math.max(0, Math.round(((r.costoUnitario||0)-trans-cal-mpNeto-ef)*100)/100),2);
          })())}
          ${kpiRow('  └ MP proveedor — factura (Bs)', r.costoMPunitario>0?fmt.d(r.costoMPunitario,2):'—', r.costoMPunitario>0?'var(--accent3)':'')}
          ${kpiRow('  └   IVA crédito MP (13%)',    r.costoMPunitario>0?fmt.d(Math.round(r.costoMPunitario*0.13*100)/100,2):'—', 'var(--accent5)')}
          ${kpiRow('  └   Costo neto MP en ER',      r.costoMPunitario>0?fmt.d(Math.round((r.costoMPunitario-r.costoMPunitario*0.13)*100)/100,2):'—')}
          ${r.efInnovacionUnit?kpiRow('  └ Innovación/proceso (Bs)', fmt.d(r.efInnovacionUnit,2)):''}
          ${kpiRow('Proveedor activo',              r.proveedorElegido||'Sin proveedor')}
        </table>
      </div>

      <!-- ── Gerente de RRHH ─────────────────────────── -->
      <div class="result-round-card">
        <div class="result-round-header"><h3>👥 Gerente de RRHH</h3></div>
        <table style="width:100%;border-collapse:collapse">
          ${(() => {
            const prods = r.productos?.length > 1 ? r.productos : null;
            if (prods) {
              // Multiproducto: mostrar por producto
              return prods.map((p, i) => {
                const vf  = p.vendedoresFinales || 0;
                const vpu = vf>0 ? fmt.num(Math.round((p.ventasReales||0)/vf)) : '—';
                const ipu = vf>0 ? fmt.bs(Math.round((p.ventasNetas||0)/vf)) : '—';
                const of  = p.operariosFinales || 0;
                const co  = p.costoOperarios!=null ? fmt.bs(p.costoOperarios) : '—';
                const hdr = '<tr><td colspan="2" style="padding:4px 12px;font-family:var(--font-mono);'
                  + 'font-size:.6rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;'
                  + 'background:rgba(255,255,255,.03)">Producto ' + (i+1) + ': ' + (p.producto||'—') + '</td></tr>';
                return hdr
                  + kpiRow('Vendedores finales', fmt.num(vf))
                  + kpiRow('Ventas por vendedor (unid)', vpu)
                  + kpiRow('Ingresos netos por vendedor', ipu)
                  + kpiRow('Operarios finales', fmt.num(of))
                  + kpiRow('Costo operarios (Bs)', co);
              }).join('');
            }
            // Monoproducto: vista simple
            return kpiRow('Vendedores finales', vendFin)
              + kpiRow('Ventas por vendedor (unid)', ventasPorVend)
              + kpiRow('Ingresos netos por vendedor', ingrPorVend)
              + kpiRow('Operarios finales', fmt.num(r.operariosFinales ?? '—'))
              + kpiRow('Costo operarios (Bs)', r.costoOperarios!=null?fmt.bs(r.costoOperarios):'—');
          })()}
        </table>
      </div>

      <!-- ── Gerente Financiero ──────────────────────── -->
      <div class="result-round-card" style="grid-column:span 2">
        <div class="result-round-header"><h3>💰 Gerente Financiero</h3></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
          <table style="width:100%;border-collapse:collapse">
            ${kpiRow('Costo unitario (Bs)',           fmt.d(r.costoUnitario,3))}
            ${kpiRow('Margen bruto',                  mgBruto+'%',  +mgBruto<0?'var(--accent4)':'var(--accent5)')}
            ${kpiRow('Margen neto',                   mgNeto+'%',   +mgNeto<0?'var(--accent4)':'var(--accent5)')}
            ${kpiRow('Utilidad por unidad vendida',   utilPorUnid)}
            ${kpiRow('Utilidad neta (Bs)',             fmt.bs(r.utilidadNeta), r.utilidadNeta<0?'var(--accent4)':'var(--accent5)')}
            ${kpiRow('EBIT (Bs)',                      fmt.bs(r.ebit??0),      (r.ebit??0)<0?'var(--accent4)':'var(--accent5)')}
            ${kpiRow('Caja final (Bs)',                fmt.bs(r.cajaFinal),    r.cajaFinal<=0?'var(--accent4)':'var(--accent5)')}
            ${kpiRow('Sobregiro (Bs)',                 r.sobregiro>0?fmt.bs(r.sobregiro):'—', r.sobregiro>0?'var(--accent4)':'')}
          </table>
          <table style="width:100%;border-collapse:collapse">
            ${kpiRow('Deuda total (Bs)',               fmt.bs(r.deudaFinal))}
            ${kpiRow('Endeudamiento (Deuda/Activos)',  endeud+'%', +endeud>50?'var(--accent4)':+endeud>30?'var(--accent3)':'var(--accent5)')}
            ${kpiRow('Liquidez corriente',             liquidez)}
            ${kpiRow('IVA neto pagado (Bs)',           r.ivaAPagar!=null?fmt.bs(r.ivaAPagar):'—', 'var(--accent4)')}
            ${kpiRow('IT pagado (Bs)',                 r.impuestoIT!=null?fmt.bs(r.impuestoIT):'—', 'var(--accent4)')}
            ${kpiRow('IUE pagado (Bs)',                r.impuestoIUE>0?fmt.bs(r.impuestoIUE):'(pago anual)', r.impuestoIUE>0?'var(--accent4)':'')}
            ${kpiRow('Provisión IUE (Bs)',             r.provisionIUE!=null?fmt.bs(r.provisionIUE):'—', 'var(--accent3)')}
          </table>
        </div>

        <!-- ── Compensación IUE→IT (DS 5563) ── -->
        ${(r.compensacionIT>0 || r.saldoIUEfinal>0 || r.saldoIUEant>0) ? `
        <div style="margin:12px 0 0;padding:12px 16px;background:linear-gradient(135deg,rgba(16,185,129,.08),rgba(59,130,246,.08));border-radius:8px;border:1px solid rgba(16,185,129,.2)">
          <div style="font-family:var(--font-mono);font-size:.65rem;color:#10B981;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px">
            ⚖️ Compensación IUE → IT — Decreto Supremo 5563
          </div>
          <div style="font-size:.76rem;color:var(--text3);margin-bottom:10px;line-height:1.6">
            El IUE efectivamente pagado genera un saldo compensable que se descuenta del IT de los períodos siguientes, hasta agotarse.
          </div>
          <table style="width:100%;border-collapse:collapse">
            ${kpiRow('Saldo IUE disponible inicio', r.saldoIUEant>0?fmt.bs(r.saldoIUEant):'Bs 0', r.saldoIUEant>0?'var(--accent5)':'')}
            ${kpiRow('IT devengado (gasto ER)', fmt.bs(r.impuestoIT||0), 'var(--accent4)')}
            ${r.compensacionIT>0?kpiRow('IT compensado con saldo IUE', fmt.bs(r.compensacionIT), 'var(--accent5)'):''}
            ${kpiRow('IT efectivo pagado en caja', fmt.bs(r.ITefectivoCaja??r.impuestoIT??0), (r.ITefectivoCaja??r.impuestoIT??0)>0?'var(--accent4)':'var(--accent5)')}
            ${r.impuestoIUE>0?kpiRow('IUE pagado → recarga saldo', fmt.bs(r.impuestoIUE), 'var(--accent3)'):''}
            ${kpiRow('Saldo IUE para próximo trimestre', r.saldoIUEfinal>0?fmt.bs(r.saldoIUEfinal):'Bs 0 (agotado)', r.saldoIUEfinal>0?'var(--accent5)':'var(--text3)')}
          </table>
          ${r.compensacionIT>0?`<div style="margin-top:8px;padding:6px 10px;background:rgba(16,185,129,.1);border-radius:4px;font-size:.73rem;color:#10B981">
            ✅ Ahorro de caja este trimestre: ${fmt.bs(r.compensacionIT)} (IT compensado con IUE pagado en R${Math.floor(((r.rondaNumero||1)-1)/4)*4||4})
          </div>`:''}
        </div>` : ''}
      </div>

    </div>`;
};

// ─── Estados Financieros Completos ───────────────────────────

console.log('[equipo-resultados] ✅ Módulo cargado — KPIs activos');
