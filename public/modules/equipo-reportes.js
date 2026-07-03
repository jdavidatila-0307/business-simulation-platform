/**
 * modules/equipo-reportes.js — SimNego v3.2
 * Fase 2 Día 4 — reportes e investigación de mercado
 * Dependencias: api(), fmt, state, toast
 */

// Contador de secuencia para descartar respuestas de red obsoletas cuando el usuario
// navega rápido entre rondas (R4→R5): la respuesta más lenta de una ronda vieja no debe
// sobrescribir el reporte de la ronda seleccionada más recientemente.
let reporteRequestSeq = 0;

// equipo-noticias incluido aquí por dependencia
async function loadEquipoNoticias() {
  const el = document.getElementById('noticiasContent');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--text3);padding:20px">Cargando noticias...</p>';
  try {
    const data = await api('GET', '/api/noticias');

    if (data.fase === 'espera') {
      el.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📰</div>
        <p>Las noticias del macroentorno estarán disponibles cuando el profesor active la primera ronda.</p>
      </div>`;
      return;
    }

    const esPre  = data.fase === 'pre';
    const esPost = data.fase === 'post';

    // ── Badge de impacto (solo en post con shock real) ────────
    let impactBadge = '';
    if (esPost && data.shock && data.shock.tipo !== 'neutral') {
      const colores = { boom:'#10B981', crisis:'#EF4444' };
      const color   = data.shock.color || colores[data.shock.tipo] || '#6B7280';
      const factor  = Math.round((data.shock.factorDemanda - 1) * 100);
      const signo   = factor >= 0 ? '+' : '';
      const segs    = data.shock.segmentosAfectados === 'todos'
        ? 'Todos los segmentos' : 'Segmentos específicos';
      impactBadge = `<div style="display:inline-flex;align-items:center;gap:10px;margin-top:14px;
        padding:10px 18px;border-radius:24px;background:${color}15;border:1px solid ${color}40">
        <span style="font-size:1.4rem">${data.shock.icono || '⚡'}</span>
        <div>
          <div style="font-size:.7rem;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:1.5px">
            ${(data.shock.tipo||'').toUpperCase()} · Impacto confirmado</div>
          <div style="font-size:.88rem;color:var(--text1);margin-top:2px;font-weight:600">
            ${signo}${factor}% en demanda formal &nbsp;·&nbsp; ${segs}</div>
        </div>
      </div>`;
    }

    // ── Cards de noticias ──────────────────────────────────────
    const cards = (data.noticias || []).map(n => `
      <div style="padding:20px 24px;border:1px solid var(--border);border-radius:var(--r);
        margin-bottom:14px;background:var(--bg2);transition:box-shadow .2s"
        onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,.15)'"
        onmouseleave="this.style.boxShadow=''">
        <div style="display:flex;align-items:flex-start;gap:14px">
          <span style="font-size:1.6rem;margin-top:2px;flex-shrink:0">${n.icono || '📰'}</span>
          <div style="flex:1">
            <div style="font-weight:700;font-size:.95rem;color:var(--text1);line-height:1.35;margin-bottom:8px">
              ${n.titulo}</div>
            <div style="font-size:.83rem;color:var(--text2);line-height:1.65;margin-bottom:12px">
              ${n.cuerpo}</div>
            <div style="display:flex;gap:18px;font-size:.72rem;color:var(--text3);flex-wrap:wrap">
              <span>📌 ${n.fuente}</span>
              <span>🕐 ${n.fecha}</span>
            </div>
          </div>
        </div>
      </div>`).join('');

    // ── Aviso de fase ──────────────────────────────────────────
    const avisoColor = esPre ? 'var(--accent3)' : 'var(--accent5)';
    const avisoIcono = esPre ? '⚡' : '✅';
    const avisoTexto = esPre
      ? '<strong style="color:var(--accent3)">Señales previas</strong> — Esta información está disponible ANTES de que el profesor ejecute la simulación. Considera estas señales al preparar tus decisiones de producción, precio y marketing.'
      : '<strong style="color:var(--accent5)">Informe confirmado</strong> — El evento ya ocurrió este trimestre. Analiza cómo afectó tu demanda asignada y compara con tus resultados financieros.';

    const titulo = esPre
      ? `Señales del Macroentorno · Trimestre ${data.ronda}`
      : `Informe Confirmado del Macroentorno · Trimestre ${data.ronda}`;

    el.innerHTML = `
      <div style="max-width:780px">

        <!-- Encabezado -->
        <div style="margin-bottom:20px;padding-bottom:18px;border-bottom:2px solid var(--border)">
          <div style="font-family:var(--font-mono);font-size:.62rem;color:var(--text3);
            text-transform:uppercase;letter-spacing:2.5px;margin-bottom:5px">
            📰 Noticias del Macroentorno · SimNego UAGRM</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--text1);margin-bottom:4px">
            ${titulo}</div>
          <div style="font-size:.82rem;color:var(--text3)">
            ${esPre
              ? 'Analiza estas señales del entorno económico antes de tomar tus decisiones del trimestre.'
              : 'Informe del evento macroeconómico que impactó el mercado durante este período.'}</div>
          ${impactBadge}
        </div>

        <!-- Aviso de fase -->
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;margin-bottom:18px;
          background:var(--bg2);border-radius:var(--r);border-left:3px solid ${avisoColor};
          font-size:.78rem;color:var(--text2);line-height:1.5">
          <span style="font-size:1rem;flex-shrink:0;margin-top:1px">${avisoIcono}</span>
          <span>${avisoTexto}</span>
        </div>

        <!-- Noticias -->
        ${cards}

        ${esPre ? `<div style="margin-top:18px;padding:12px 16px;background:var(--bg2);
          border-radius:var(--r);font-size:.76rem;color:var(--text3);text-align:center">
          🔒 El impacto real del entorno se revelará cuando el profesor ejecute la simulación.
          Usa estas señales para anticiparte — pero recuerda que el mercado puede sorprenderte.
          </div>` : ''}
      </div>`;

  } catch(e) {
    el.innerHTML = `<p style="color:var(--accent4);padding:20px">Error: ${e.message}</p>`;
  }
}


async function loadEquipoReportes() {
  const data = await api('GET','/api/resultados');
  const el = document.getElementById('reportesContent');
  if (!el) return;

  if (!data.historial?.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>Aún no hay rondas simuladas.</p></div>`;
    return;
  }

  const rondas = data.historial;
  const sel = `<div class="ronda-selector">${rondas.map(h=>`<button class="ronda-btn simulated" onclick="mostrarReporteRonda(${h.ronda})">Ronda ${h.ronda}</button>`).join('')}</div>`;
  el.innerHTML = sel + `<div id="reporteDetalle"></div>`;
  mostrarReporteRonda(rondas[rondas.length-1].ronda, data.historial);
}

window.forzarConfirmacion = async (equipoId) => {
  if (!confirm('¿Forzar confirmación de pre-simulación para este equipo?')) return;
  try {
    await api('POST', '/admin/presim/forzar', { equipoId });
    toast('✅ Confirmación forzada', 'success');
    await loadAdminDashboard();
  } catch(e) { toast(e.message, 'error'); }
};

window.switchMapTab = (idx, total) => {
  for (let i = 0; i < total; i++) {
    const btn  = document.getElementById('tabMapSeg_' + i);
    const pane = document.getElementById('paneMapSeg_' + i);
    if (btn)  btn.className  = i === idx ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    if (pane) pane.style.display = i === idx ? '' : 'none';
  }
};

window.mostrarReporteRonda = async (n, historialCache) => {
  const requestId = ++reporteRequestSeq;
  document.querySelectorAll('#reportesContent .ronda-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace('Ronda ',''))===n);
  });
  const det = document.getElementById('reporteDetalle');
  if (!det) return;
  det.innerHTML = '<p>Cargando reporte...</p>';
  try {
    const [repData, resData] = await Promise.all([
      api('GET', `/api/reportes/${n}`),
      api('GET', '/api/resultados'),
    ]);
    if (requestId !== reporteRequestSeq) return;  // respuesta obsoleta — el usuario ya cambió de ronda
    const rep = repData.reportes;
    const historial = historialCache || resData.historial;
    const item = historial?.find(h=>h.ronda===n);
    const miResult = item?.resultado;

    let html = '';

    // ── RANKING ANÓNIMO (siempre visible) ──────────────────
    if (miResult) {
      const allRes = await api('GET', `/api/dashboard/${n}`);
      const posicion = allRes.ranking.findIndex(r=>r.esYo) + 1;
      const total = allRes.ranking.length;
      const rows = allRes.ranking.map((r,i) => `
        <tr style="${r.esYo?'background:rgba(108,99,255,.08);font-weight:700':''}">
          <td style="text-align:center;font-family:var(--font-mono)">${i+1}</td>
          <td>${r.esYo?'⭐ <strong>Mi equipo</strong>':'Equipo '+(i+1)}</td>
          <td class="num ${r.utilidadNeta>=0?'pos':'neg'}">${fmt.bs(r.utilidadNeta)}</td>
          <td class="num">${fmt.num(r.ventas)}</td>
          <td class="num">${fmt.pct(r.share)}</td>
          <td class="num ${r.caja<=0?'neg':'pos'}">${fmt.bs(r.caja)}</td>
        </tr>`).join('');
      html += `
        <div class="result-round-card" style="margin-bottom:16px">
          <div class="result-round-header">
            <h3>🏆 Ranking — Ronda ${n}</h3>
            <span class="badge ${posicion===1?'badge-ok':'badge-pending'}">Tu posición: ${posicion}/${total}</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Equipo</th><th>Utilidad neta</th><th>Ventas (unid)</th><th>Market share</th><th>Caja final</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <p style="padding:8px 16px;font-size:.74rem;color:var(--text3)">Los demás equipos aparecen anónimos. Para ver participación detallada, compra el reporte Premium.</p>
        </div>`;
    }

    // ── INVESTIGACIÓN COMPRADA ─────────────────────────
    if (!rep.investigacion) {
      html += '<div class="result-round-card">'
        + '<div class="result-round-header"><h3>📊 Investigación de Mercado — Ronda ' + n + '</h3></div>'
        + '<div style="padding:24px;text-align:center;color:var(--text3)">'
        + '<div style="font-size:2rem;margin-bottom:10px">📭</div>'
        + '<p style="margin-bottom:10px">No compraste reporte de investigación en la ronda ' + n + '.</p>'
        + '<p style="font-size:.78rem">Puedes comprar <strong>Básico (Bs 5,000)</strong>, '
        + '<strong>Premium (Bs 12,000)</strong> o <strong>Estratégico (Bs 20,000)</strong> en tu próxima hoja de decisión.</p>'
        + '</div></div>';
    } else {
      const inv = rep.investigacion;

      // Tabla de mercado
      const mktRows = (inv.mercado||[]).map(s =>
        '<tr>'
        + '<td><strong>' + s.segmento + '</strong></td>'
        + '<td class="num">' + fmt.num(s.demandaBase||0) + '</td>'
        + '<td class="num pos">' + fmt.num(s.mercadoFormal||s.demandaFormal||0) + '</td>'
        + '<td><span class="badge ' + (s.tendencia==='Alto crecimiento'?'badge-high':s.tendencia==='Creciente'?'badge-grow':'badge-stable') + '">'
        + (s.tendencia||'Estable') + '</span></td>'
        + '</tr>'
      ).join('');

      const precRows = (inv.precios||[]).map(s =>
        '<tr>'
        + '<td><strong>' + s.segmento + '</strong></td>'
        + '<td class="num">' + (s.precioMin!=null?'Bs '+s.precioMin:'—') + '</td>'
        + '<td class="num">' + (s.precioProm!=null?'Bs '+s.precioProm:'—') + '</td>'
        + '<td class="num">' + (s.precioMax!=null?'Bs '+s.precioMax:'—') + '</td>'
        + '</tr>'
      ).join('');

      const alertasHTML = (inv.alertas||[]).map(a =>
        '<li style="padding:5px 0;border-bottom:1px solid var(--border);font-size:.82rem;color:var(--accent3)">⚠ ' + a + '</li>'
      ).join('');

      html += '<div class="result-round-card" style="margin-bottom:16px">'
        + '<div class="result-round-header"><h3>📊 ' + (inv.titulo||'Reporte') + ' — Ronda ' + n + '</h3></div>'
        + '<div style="padding:16px 20px">'
        + '<p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">Tamaño de Mercado</p>'
        + '<div class="table-wrap" style="margin-bottom:16px"><table>'
        + '<thead><tr><th>Segmento</th><th>Demanda base</th><th>Mercado formal</th><th>Tendencia</th></tr></thead>'
        + '<tbody>' + mktRows + '</tbody></table></div>'
        + '<p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:10px">Precios Observados</p>'
        + '<div class="table-wrap" style="margin-bottom:16px"><table>'
        + '<thead><tr><th>Segmento</th><th>Precio mínimo</th><th>Precio promedio</th><th>Precio máximo</th></tr></thead>'
        + '<tbody>' + precRows + '</tbody></table></div>'
        + '<p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:8px">Alertas</p>'
        + '<ul style="list-style:none;padding:0">' + alertasHTML + '</ul>'
        + '</div></div>';

      // PREMIUM — participación y sensibilidad
      if (inv.tipo === 'Premium' || inv.tipo === 'Estratégico') {
        const partRows = (inv.participacion||[]).map(p =>
          '<tr>'
          + '<td><strong>' + p.segmento + '</strong></td>'
          + '<td class="num">' + p.equiposCompitiendo + '</td>'
          + '<td class="num">' + fmt.pct(p.shareMaximo) + '</td>'
          + '<td class="num">' + fmt.pct(p.sharePromedio) + '</td>'
          + '</tr>'
        ).join('');
        const sensRows = (inv.sensibilidad||[]).map(s =>
          '<tr>'
          + '<td><strong>' + s.segmento + '</strong></td>'
          + '<td>' + s.precio + '</td><td>' + s.calidad + '</td>'
          + '<td>' + s.publicidad + '</td><td>' + s.canal + '</td>'
          + '</tr>'
        ).join('');
        html += '<div class="result-round-card" style="margin-bottom:16px">'
          + '<div class="result-round-header"><h3>📊 Premium — Participación y Sensibilidad</h3></div>'
          + '<div style="padding:14px 18px">'
          + '<p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;color:var(--accent);margin-bottom:8px">Participación de Mercado</p>'
          + '<div class="table-wrap" style="margin-bottom:14px"><table>'
          + '<thead><tr><th>Segmento</th><th>Equipos</th><th>Share máx.</th><th>Share prom.</th></tr></thead>'
          + '<tbody>' + partRows + '</tbody></table></div>'
          + '<p style="font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;color:var(--accent);margin-bottom:8px">Sensibilidad del Consumidor</p>'
          + '<div class="table-wrap"><table>'
          + '<thead><tr><th>Segmento</th><th>Precio</th><th>Calidad</th><th>Publicidad</th><th>Canal</th></tr></thead>'
          + '<tbody>' + sensRows + '</tbody></table></div>'
          + '</div></div>';
      }

      // PREMIUM — Sección 1: empresas anónimas
      if ((inv.tipo === 'Premium' || inv.tipo === 'Estratégico') && (inv.empresasAnonimas||[]).length) {
        const empAnonRows = (inv.empresasAnonimas||[]).map(e =>
          '<tr>'
          + '<td><strong>' + e.etiqueta + '</strong></td>'
          + '<td style="text-align:center">' + e.nProductos + '</td>'
          + '<td style="font-size:.8rem">' + (e.segmentos||[]).join('<br>') + '</td>'
          + '<td class="num">Bs ' + (e.precioMin||0) + ' – Bs ' + (e.precioMax||0) + '</td>'
          + '<td class="num pos">' + fmt.pct(e.shareTotal||0) + '</td>'
          + '<td class="num">' + fmt.num(e.ventasTotales||0) + '</td>'
          + '</tr>'
        ).join('');
        html += '<div class="result-round-card" style="margin-bottom:16px">'
          + '<div class="result-round-header"><h3>🏢 Sección 1 · Empresas en el Mercado (Anónimas)</h3></div>'
          + '<div style="padding:14px 18px">'
          + '<p style="font-size:.78rem;color:var(--text3);margin-bottom:10px">Los nombres se revelan en el Reporte Estratégico.</p>'
          + '<div class="table-wrap"><table>'
          + '<thead><tr><th>Empresa</th><th>Productos</th><th>Segmentos</th><th>Rango precio</th><th>Share total</th><th>Ventas</th></tr></thead>'
          + '<tbody>' + empAnonRows + '</tbody></table></div>'
          + '</div></div>';
      }

      // ESTRATÉGICO — Sección 1: empresas con nombre
      if (inv.tipo === 'Estratégico' && (inv.empresasConNombre||[]).length) {
        const empNomRows = (inv.empresasConNombre||[]).map(e => {
          const prods = (e.productos||[]).map(p =>
            '<div style="margin-bottom:5px"><strong>' + (p.producto||'—') + '</strong>'
            + ' <span style="color:var(--text3);font-size:.74rem">· ' + (p.segmento||'—') + '</span>'
            + '<div style="font-size:.73rem;color:var(--text3)">Bs ' + (p.precio||0)
            + ' · Cal ' + (p.calidad||0)
            + ' · ' + fmt.pct(p.share||0) + ' share'
            + ' · ' + fmt.num(p.ventas||0) + ' unid</div></div>'
          ).join('');
          return '<tr>'
            + '<td><strong>' + (e.empresa||'—') + '</strong></td>'
            + '<td>' + prods + '</td>'
            + '<td class="num pos">' + fmt.pct(e.shareTotal||0) + '</td>'
            + '<td class="num">' + fmt.num(e.ventasTotales||0) + '</td>'
            + '<td class="num ' + ((e.utilidadNeta||0)>=0?'pos':'neg') + '">' + fmt.bs(e.utilidadNeta||0) + '</td>'
            + '</tr>';
        }).join('');
        html += '<div class="result-round-card" style="margin-bottom:16px">'
          + '<div class="result-round-header" style="background:linear-gradient(135deg,#2a1f6e,#4a2080)">'
          + '<h3>🔍 Estratégico · Sección 1 — Empresas y Productos con Nombre</h3></div>'
          + '<div style="padding:14px 18px"><div class="table-wrap"><table>'
          + '<thead><tr><th>Empresa</th><th>Productos</th><th>Share total</th><th>Ventas</th><th>Utilidad neta</th></tr></thead>'
          + '<tbody>' + empNomRows + '</tbody></table></div></div></div>';
      }

      // ESTRATÉGICO — Sección 3: Mapas de posicionamiento por segmento
      if (inv.tipo === 'Estratégico') {
        const mapas = inv.mapasPorSegmento || {};
        const segNames = Object.keys(mapas).filter(s => (mapas[s].puntos||[]).length > 0);

        if (segNames.length > 0) {
          const PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06FFA5','#84CC16','#F97316'];

          // Función SVG para un segmento
          const renderMapaSeg = (segNombre, datos) => {
            const puntos  = datos.puntos  || [];
            const externos = datos.externos || [];
            if (!puntos.length) return '';

            const W = 500; const H = 320;
            const PAD = { top:36, right:24, bot:52, left:64 };
            const cW = W - PAD.left - PAD.right;
            const cH = H - PAD.top  - PAD.bot;

            const allPrecios  = [...puntos.map(p=>p.precio),  ...externos.map(e=>e.precio)].filter(v=>v>0);
            const allCalidad  = [...puntos.map(p=>p.calidad), ...externos.map(e=>e.calidad)].filter(v=>v>0);
            const maxPrecio   = allPrecios.length  ? Math.max(...allPrecios)  * 1.1 : 500;
            const minPrecio   = allPrecios.length  ? Math.max(0, Math.min(...allPrecios) * 0.85) : 0;
            const rangoPrecio = Math.max(maxPrecio - minPrecio, 1);

            const cx = p => PAD.left + ((p - minPrecio) / rangoPrecio) * cW;
            const cy = q => PAD.top  + (1 - q / 10) * cH;
            const cr = s => 7 + Math.min(s * 80, 28);

            const midX = PAD.left + cW / 2;
            const midY = PAD.top  + cH / 2;

            // Precio promedio del segmento (línea de referencia)
            const precioMed = allPrecios.length ? allPrecios.reduce((a,b)=>a+b,0)/allPrecios.length : 0;
            const xMed = cx(precioMed);

            // Círculos de empresas
            const circles = puntos.map(p => {
              const r   = cr(p.share);
              const x   = Math.round(cx(p.precio));
              const y   = Math.round(cy(p.calidad));
              const tip = p.empresa + ' · ' + p.producto + ' · Share: ' + (p.share*100).toFixed(1) + '%';
              return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+p.color+'" fill-opacity="0.75" stroke="'+p.color+'" stroke-width="2"><title>'+tip+'</title></circle>'
                + '<text x="'+x+'" y="'+(y-r-4)+'" text-anchor="middle" font-size="8.5" fill="#E2E8F0" font-weight="600">'+p.empresa.substring(0,9)+'</text>'
                + '<text x="'+x+'" y="'+(y+r+11)+'" text-anchor="middle" font-size="7.5" fill="#94A3B8">'+p.producto.substring(0,12)+'</text>';
            }).join('');

            // Diamantes de competencia externa
            const diamonds = externos.map(e => {
              const x = Math.round(cx(e.precio));
              const y = Math.round(cy(e.calidad));
              const s = 9;
              const tip = e.nombre + ' (externo) · Part.ref: '+(e.share*100).toFixed(0)+'%';
              return '<polygon points="'+x+','+(y-s)+' '+(x+s)+','+y+' '+x+','+(y+s)+' '+(x-s)+','+y+'" fill="#F97316" fill-opacity="0.8" stroke="#FB923C" stroke-width="1.5"><title>'+tip+'</title></polygon>'
                + '<text x="'+x+'" y="'+(y-s-4)+'" text-anchor="middle" font-size="8" fill="#FB923C">'+e.nombre.substring(0,16)+'</text>';
            }).join('');

            // Ticks eje X (precio)
            const nTicksX = 5;
            const xTicks = Array.from({length:nTicksX+1},(_,i)=>i/nTicksX).map(pct => {
              const val = Math.round(minPrecio + pct * rangoPrecio);
              const xp  = PAD.left + pct * cW;
              return '<line x1="'+xp+'" y1="'+(PAD.top+cH)+'" x2="'+xp+'" y2="'+(PAD.top+cH+5)+'" stroke="#475569" stroke-width="1"/>'
                + '<text x="'+xp+'" y="'+(PAD.top+cH+16)+'" text-anchor="middle" font-size="8.5" fill="#94A3B8">'+val+'</text>';
            }).join('');

            // Ticks eje Y (calidad)
            const yTicks = [0,2,4,6,8,10].map(q => {
              const yp = PAD.top + (1-q/10)*cH;
              return '<line x1="'+(PAD.left-5)+'" y1="'+yp+'" x2="'+PAD.left+'" y2="'+yp+'" stroke="#475569" stroke-width="1"/>'
                + '<text x="'+(PAD.left-8)+'" y="'+(yp+3)+'" text-anchor="end" font-size="8.5" fill="#94A3B8">'+q+'</text>';
            }).join('');

            // Línea de precio promedio
            const lineaMed = xMed > PAD.left && xMed < PAD.left+cW
              ? '<line x1="'+xMed+'" y1="'+PAD.top+'" x2="'+xMed+'" y2="'+(PAD.top+cH)+'" stroke="#F59E0B" stroke-width="1" stroke-dasharray="5,3" opacity="0.6"/>'
                + '<text x="'+xMed+'" y="'+(PAD.top-6)+'" text-anchor="middle" font-size="7.5" fill="#F59E0B">precio prom.</text>'
              : '';

            const tendColor = datos.tendencia==='Alto crecimiento'?'#10B981':datos.tendencia==='Creciente'?'#3B82F6':'#94A3B8';
            const demStr   = datos.demandaFormal ? ' · Demanda formal: '+Math.round(datos.demandaFormal).toLocaleString('es-BO')+' pares' : '';

            return '<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:'+W+'px;background:#0F172A;border-radius:8px;display:block">'
              // Fondos de cuadrante
              + '<rect x="'+PAD.left+'" y="'+PAD.top+'" width="'+(cW/2)+'" height="'+(cH/2)+'" fill="rgba(16,185,129,.04)"/>'
              + '<rect x="'+(PAD.left+cW/2)+'" y="'+PAD.top+'" width="'+(cW/2)+'" height="'+(cH/2)+'" fill="rgba(59,130,246,.04)"/>'
              + '<rect x="'+PAD.left+'" y="'+(PAD.top+cH/2)+'" width="'+(cW/2)+'" height="'+(cH/2)+'" fill="rgba(239,68,68,.04)"/>'
              + '<rect x="'+(PAD.left+cW/2)+'" y="'+(PAD.top+cH/2)+'" width="'+(cW/2)+'" height="'+(cH/2)+'" fill="rgba(251,191,36,.04)"/>'
              // Líneas de cuadrante
              + '<line x1="'+midX+'" y1="'+PAD.top+'" x2="'+midX+'" y2="'+(PAD.top+cH)+'" stroke="#334155" stroke-width="1" stroke-dasharray="4,3"/>'
              + '<line x1="'+PAD.left+'" y1="'+midY+'" x2="'+(PAD.left+cW)+'" y2="'+midY+'" stroke="#334155" stroke-width="1" stroke-dasharray="4,3"/>'
              // Línea precio promedio
              + lineaMed
              // Ejes
              + '<line x1="'+PAD.left+'" y1="'+PAD.top+'" x2="'+PAD.left+'" y2="'+(PAD.top+cH)+'" stroke="#475569" stroke-width="1.5"/>'
              + '<line x1="'+PAD.left+'" y1="'+(PAD.top+cH)+'" x2="'+(PAD.left+cW)+'" y2="'+(PAD.top+cH)+'" stroke="#475569" stroke-width="1.5"/>'
              + xTicks + yTicks
              // Etiquetas ejes
              + '<text x="'+(PAD.left+cW/2)+'" y="'+(H-4)+'" text-anchor="middle" font-size="9.5" fill="#94A3B8">Precio de venta (Bs)</text>'
              + '<text x="13" y="'+(PAD.top+cH/2)+'" text-anchor="middle" font-size="9.5" fill="#94A3B8" transform="rotate(-90,13,'+(PAD.top+cH/2)+')">Calidad (0–10)</text>'
              // Etiquetas cuadrantes
              + '<text x="'+(PAD.left+8)+'" y="'+(PAD.top+13)+'" font-size="7.5" fill="#475569" font-style="italic">Alta calidad / Bajo precio</text>'
              + '<text x="'+(PAD.left+cW/2+6)+'" y="'+(PAD.top+13)+'" font-size="7.5" fill="#475569" font-style="italic">Alta calidad / Alto precio</text>'
              + '<text x="'+(PAD.left+8)+'" y="'+(PAD.top+cH-5)+'" font-size="7.5" fill="#475569" font-style="italic">Baja calidad / Bajo precio</text>'
              + '<text x="'+(PAD.left+cW/2+6)+'" y="'+(PAD.top+cH-5)+'" font-size="7.5" fill="#475569" font-style="italic">Baja calidad / Alto precio</text>'
              // Datos
              + circles + diamonds
              + '</svg>'
              + '<div style="margin-top:8px;font-size:.74rem;color:var(--text3)">'
              + '<span style="color:'+tendColor+'">● '+datos.tendencia+'</span>'
              + demStr
              + (externos.length ? ' &nbsp;·&nbsp; <span style="color:#FB923C">◆ Competencia externa</span>' : '')
              + ' &nbsp;·&nbsp; Tamaño del círculo = market share'
              + '</div>';
          };

          // Leyenda global de empresas
          const legendaEmpresas = (inv.empresasConNombre||[]).map((e,ei) =>
            '<span style="display:inline-flex;align-items:center;gap:5px;margin:2px 12px 2px 0;font-size:.77rem">'
            + '<span style="width:9px;height:9px;border-radius:50%;background:'+PALETTE[ei%9]+';display:inline-block"></span>'
            + e.empresa+'</span>'
          ).join('') + '<span style="display:inline-flex;align-items:center;gap:5px;margin:2px 12px 2px 0;font-size:.77rem">'
            + '<span style="display:inline-block;width:9px;height:9px;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);background:#F97316"></span>'
            + 'Competencia externa</span>';

          // Tabs de segmentos
          const tabsBar = '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:8px">'
            + segNames.map((s,i) =>
                '<button class="btn '+(i===0?'btn-primary':'btn-ghost')+' btn-sm" id="tabMapSeg_'+i+'" onclick="switchMapTab('+i+','+segNames.length+')">'
                + s + '</button>'
              ).join('')
            + '</div>';

          // Paneles SVG por segmento
          const panesHTML = segNames.map((s,i) =>
            '<div id="paneMapSeg_'+i+'" '+(i>0?'style="display:none"':'')+'>'
            + renderMapaSeg(s, mapas[s])
            + '</div>'
          ).join('');

          html += '<div class="result-round-card" style="margin-bottom:16px">'
            + '<div class="result-round-header" style="background:linear-gradient(135deg,#1a3a6b,#2a5599)">'
            + '<h3>📍 Estratégico · Sección 3 — Mapa de Posicionamiento por Segmento</h3></div>'
            + '<div style="padding:14px 18px">'
            + '<p style="font-size:.78rem;color:var(--text3);margin-bottom:12px">'
            + 'Precio vs Calidad para cada segmento. Muestra solo los competidores activos en ese mercado. '
            + 'La línea amarilla es el precio promedio del segmento.</p>'
            + '<div style="margin-bottom:12px;flex-wrap:wrap;display:flex">' + legendaEmpresas + '</div>'
            + tabsBar + panesHTML
            + '</div></div>';
        }
      }

            // ESTRATÉGICO — Sección 2: elasticidad precio
      if (inv.tipo === 'Estratégico') {
        const colores = { verde:'var(--accent5)', ambar:'var(--accent3)', roja:'var(--accent4)' };
        let elHTML = '';
        if ((inv.elasticidades||[]).length) {
          const elRows = (inv.elasticidades||[]).map(e =>
            '<tr>'
            + '<td><strong>' + e.empresa + '</strong></td>'
            + '<td>' + e.producto + '</td>'
            + '<td style="font-size:.75rem">' + e.segmento + '</td>'
            + '<td class="num">Bs ' + e.precioAnt + ' → ' + e.precioAct + '</td>'
            + '<td class="num">' + fmt.num(e.ventasAnt) + ' → ' + fmt.num(e.ventasAct) + '</td>'
            + '<td class="num" style="font-weight:700;color:' + (colores[e.color]||'var(--text)') + '">' + e.elasticidad + '</td>'
            + '<td style="color:' + (colores[e.color]||'var(--text)') + ';font-size:.78rem">' + e.interpretacion + '</td>'
            + '</tr>'
          ).join('');
          elHTML = '<div class="table-wrap"><table>'
            + '<thead><tr><th>Empresa</th><th>Producto</th><th>Segmento</th><th>Precio</th><th>Ventas</th><th>ε</th><th>Interpretación</th></tr></thead>'
            + '<tbody>' + elRows + '</tbody></table></div>';
        } else {
          elHTML = '<p style="color:var(--text3);font-size:.8rem;padding:10px 0">Elasticidad no disponible — requiere al menos 2 rondas con cambio de precio.</p>';
        }
        html += '<div class="result-round-card" style="margin-bottom:16px">'
          + '<div class="result-round-header" style="background:linear-gradient(135deg,#2a1f6e,#4a2080)">'
          + '<h3>📐 Estratégico · Sección 2 — Elasticidad Precio Empírica</h3></div>'
          + '<div style="padding:14px 18px">' + elHTML + '</div></div>';
      }
    } // cierra else investigacion comprada
    if (requestId !== reporteRequestSeq) return;  // respuesta obsoleta — el usuario ya cambió de ronda
    if (det) det.innerHTML = html;
  } catch(e) {
    if (requestId !== reporteRequestSeq) return;  // respuesta obsoleta — no mostrar error de una petición vieja
    if (det) det.innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
};

// ── Créditos del Equipo ────────────────────────────────────
// ─── Mis Inventarios ─────────────────────────────────────────


// ── Exponer como window.* para setupNav ──────────────────
window.loadEquipoNoticias = loadEquipoNoticias;
window.loadEquipoReportes = loadEquipoReportes;
console.log('[equipo-reportes] ✅ Módulo cargado — Noticias + Reportes activos');
