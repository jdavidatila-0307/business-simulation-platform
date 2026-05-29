// ═══════════════════════════════════════════════════════════════════
// INSTRUCCIÓN DE INSTALACIÓN
// ═══════════════════════════════════════════════════════════════════
// En server.js, busca la línea que dice exactamente:
//
//   return null;
// }
//
// (es la última línea de la función route(), cerca de la línea 473)
// Pega TODO el bloque de abajo JUSTO ANTES de ese "return null;"
// ═══════════════════════════════════════════════════════════════════

  // ── GET /admin/tributario — Reporte Gerencial Tributario R1-R10 ──
  if (url === '/admin/tributario' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });

    const equipos = await storage.getEquipos(sim.id);
    const eqMap = {};
    equipos.forEach(e => { eqMap[e.id] = e.nombre || e.id; });

    const rondas = [];

    for (let i = 1; i <= (sim.config.currentRound || 10); i++) {
      const r = await storage.getRonda(sim.id, i);
      if (!r || !['simulated', 'calculada'].includes(r.estado)) continue;

      // Usar dashboardFiscal guardado si existe (calculado en la ejecución)
      // Si no, reconstruirlo desde r.resultados
      let df = r.dashboardFiscal;

      if (!df) {
        const resultados = Object.values(r.resultados || {});

        // Agrupar por empresa (igual lógica que el motor principal)
        const porEmpresa = {};
        resultados.forEach(res => {
          const eqId = res.equipoOriginal || res.equipo || 'desconocido';
          if (!porEmpresa[eqId]) {
            porEmpresa[eqId] = { ...res };
          } else {
            ['impuestoIT','impuestoIUE','ivaAPagar','ivaDebito','ivaCredito',
             'totalImpuestos','ventasBrutas','ventasNetas','utilidadBruta',
             'totalFacturado'].forEach(k => {
              porEmpresa[eqId][k] = (porEmpresa[eqId][k] || 0) + (res[k] || 0);
            });
          }
        });

        const eq = Object.values(porEmpresa);
        const ubTotal = eq.reduce((s, r) => s + (r.utilidadBruta ?? 0), 0);
        const tiTotal = eq.reduce((s, r) => s + (r.totalImpuestos ?? 0), 0);

        df = {
          totalIT:            eq.reduce((s, r) => s + (r.impuestoIT  ?? 0), 0),
          totalIVA:           eq.reduce((s, r) => s + (r.ivaAPagar   ?? 0), 0),
          totalIUE:           eq.reduce((s, r) => s + (r.impuestoIUE ?? 0), 0),
          totalImpuestos:     tiTotal,
          utilidadBrutaTotal: ubTotal,
          presionFiscalPct:   ubTotal > 0 ? Math.round(tiTotal / ubTotal * 10000) / 100 : 0,
          porEquipo: eq.map(r => ({
            equipoId:       r.equipoOriginal || r.equipo,
            equipoNombre:   eqMap[r.equipoOriginal || r.equipo] || r.equipo || '—',
            ventasBrutas:   r.ventasBrutas   ?? 0,
            totalFacturado: r.totalFacturado ?? Math.round((r.impuestoIT || 0) / 0.03),
            ivaDebito:      r.ivaDebito      ?? 0,
            ivaCredito:     r.ivaCredito     ?? 0,
            ivaAPagar:      r.ivaAPagar      ?? 0,
            impuestoIT:     r.impuestoIT     ?? 0,
            compensacionIT: r.compensacionIT ?? 0,
            ITefectivoCaja: r.ITefectivoCaja ?? (r.impuestoIT ?? 0),
            impuestoIUE:    r.impuestoIUE    ?? 0,
            saldoIUEfinal:  r.saldoIUEfinal  ?? 0,
            totalImpuestos: r.totalImpuestos ?? ((r.ivaAPagar??0)+(r.impuestoIT??0)+(r.impuestoIUE??0)),
            utilidadBruta:  r.utilidadBruta  ?? 0,
          })),
        };
      }

      rondas.push({
        ronda:       i,
        ejecutadaAt: r.ejecutadaAt,
        dashboardFiscal: df,
      });
    }

    // Consolidado acumulado R1-R10
    const consolidado = {
      totalIT:        rondas.reduce((s, r) => s + r.dashboardFiscal.totalIT,        0),
      totalIVA:       rondas.reduce((s, r) => s + r.dashboardFiscal.totalIVA,       0),
      totalIUE:       rondas.reduce((s, r) => s + r.dashboardFiscal.totalIUE,       0),
      totalImpuestos: rondas.reduce((s, r) => s + r.dashboardFiscal.totalImpuestos, 0),
      utilidadBrutaTotal: rondas.reduce((s, r) => s + r.dashboardFiscal.utilidadBrutaTotal, 0),
    };
    consolidado.presionFiscalPct = consolidado.utilidadBrutaTotal > 0
      ? Math.round(consolidado.totalImpuestos / consolidado.utilidadBrutaTotal * 10000) / 100
      : 0;

    return send(res, 200, {
      totalRondas:  rondas.length,
      rondas,
      consolidado,
      equipos:      equipos.map(e => ({ id: e.id, nombre: e.nombre || e.id })),
    });
  }

// ═══════════════════════════════════════════════════════════════════
// FIN DEL PARCHE — a continuación debe seguir el "return null;" original
// ═══════════════════════════════════════════════════════════════════
