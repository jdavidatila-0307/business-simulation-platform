/**
 * Generador de Reportes de Investigación de Mercado v3.0
 * Básico    (Bs 5.000):  tamaño de mercado, precios, alertas
 * Premium   (Bs 12.000): básico + participación, sensibilidad, empresas anónimas
 * Estratégico (Bs 20.000): premium + empresas con nombre, elasticidad, simulador precios, PE dinámico
 */

function generarReporteBasico(mercadoSegmentos, resultadosRonda, segmentosConfig) {
  const resultados = Object.values(resultadosRonda || {});

  // Consolidar por equipoOriginal (multiproducto)
  const porEmpresa = {};
  resultados.forEach(r => {
    const eqId = r.equipoOriginal || r.equipo;
    if (!porEmpresa[eqId]) porEmpresa[eqId] = [];
    porEmpresa[eqId].push(r);
  });

  // Precios observados por segmento
  const preciosPorSegmento = {};
  resultados.forEach(r => {
    const seg = r.segmento || r.segmentoObjetivo;
    if (!seg) return;
    if (!preciosPorSegmento[seg]) preciosPorSegmento[seg] = [];
    if (r.precioVenta) preciosPorSegmento[seg].push(r.precioVenta);
  });

  const precios = mercadoSegmentos.map(seg => {
    const ps = preciosPorSegmento[seg.nombre] || [];
    return {
      segmento:   seg.nombre,
      precioMin:  ps.length ? Math.min(...ps) : null,
      precioMax:  ps.length ? Math.max(...ps) : null,
      precioProm: ps.length ? Math.round(ps.reduce((a,b)=>a+b,0)/ps.length) : null,
    };
  });

  // Alertas dinámicas basadas en datos reales (sin contrabando — industria calzados)
  const alertas = [];
  const nCompetidores = Object.keys(porEmpresa).length;
  alertas.push(`${nCompetidores} empresa(s) activas en el mercado este trimestre.`);

  const segConMasDemanda = [...mercadoSegmentos].sort((a,b) => b.demandaFormal - a.demandaFormal)[0];
  if (segConMasDemanda) alertas.push(`Segmento con mayor demanda formal: ${segConMasDemanda.nombre} (${Math.round(segConMasDemanda.demandaFormal).toLocaleString()} unid).`);

  const segCrecimiento = mercadoSegmentos.filter(s => s.tendencia === 'Alto crecimiento');
  if (segCrecimiento.length) alertas.push(`Segmentos en alto crecimiento: ${segCrecimiento.map(s=>s.nombre).join(', ')}.`);

  const equiposSobregiro = resultados.filter(r => (r.sobregiro||0) > 0).length;
  if (equiposSobregiro > 0) alertas.push(`${equiposSobregiro} empresa(s) operan con sobregiro este trimestre — señal de presión financiera en el sector.`);

  return {
    tipo:   'Básico',
    titulo: 'Reporte de Inteligencia de Mercado — Básico',
    mercado: mercadoSegmentos.map(s => ({
      segmento:      s.nombre,
      demandaBase:   s.demandaBase,
      mercadoFormal: s.demandaFormal,
      tendencia:     s.tendencia || 'Estable',
    })),
    precios,
    alertas,
  };
}

function generarReportePremium(mercadoSegmentos, resultadosRonda, segmentosConfig, equiposConfig) {
  const basico = generarReporteBasico(mercadoSegmentos, resultadosRonda, segmentosConfig);
  const resultados = Object.values(resultadosRonda || {});

  // Consolidar por empresa
  const porEmpresa = {};
  resultados.forEach(r => {
    const eqId = r.equipoOriginal || r.equipo;
    if (!porEmpresa[eqId]) porEmpresa[eqId] = { nombre: r.equipoNombre, productos: [] };
    porEmpresa[eqId].productos.push(r);
  });

  // Participación por segmento
  const partPorSegmento = {};
  resultados.forEach(r => {
    const seg = r.segmento || r.segmentoObjetivo;
    if (!seg) return;
    if (!partPorSegmento[seg]) partPorSegmento[seg] = [];
    partPorSegmento[seg].push({ share: r.shareReal||0, ventas: r.ventasReales||0 });
  });

  const participacion = Object.entries(partPorSegmento).map(([seg, items]) => ({
    segmento:          seg,
    equiposCompitiendo: items.length,
    shareMaximo:        Math.max(...items.map(e=>e.share)),
    sharePromedio:      items.reduce((s,e)=>s+e.share,0)/items.length,
  }));

  // Sensibilidad por segmento (basada en tendencia)
  const sensibilidad = mercadoSegmentos.map(s => ({
    segmento: s.nombre,
    precio:   s.demandaFormal < 3000 ? 'Baja'  : s.demandaFormal < 5000 ? 'Media' : 'Alta',
    calidad:  s.tendencia === 'Alto crecimiento' ? 'Muy alta' : s.tendencia === 'Creciente' ? 'Alta' : 'Media',
    publicidad: ['Jóvenes urbanos','Comerciantes'].some(x => s.nombre.includes(x)) ? 'Alta' : 'Media',
    canal:    s.tendencia === 'Alto crecimiento' ? 'Alta' : 'Media',
  }));

  // SECCIÓN 1 — Empresas y productos ANÓNIMOS (Premium)
  const empresasAnonimas = Object.entries(porEmpresa).map(([eqId, emp], idx) => ({
    etiqueta:  `Empresa ${String.fromCharCode(65+idx)}`,
    nProductos: emp.productos.length,
    segmentos:  [...new Set(emp.productos.map(p => p.segmento||p.segmentoObjetivo||'—'))],
    precioMin:  Math.min(...emp.productos.map(p=>p.precioVenta||0)),
    precioMax:  Math.max(...emp.productos.map(p=>p.precioVenta||0)),
    shareTotal: emp.productos.reduce((s,p)=>s+(p.shareReal||0),0),
    ventasTotales: emp.productos.reduce((s,p)=>s+(p.ventasReales||0),0),
    eqId,
  }));

  return {
    ...basico,
    tipo:              'Premium',
    titulo:            'Reporte de Inteligencia de Mercado — Premium',
    participacion,
    sensibilidad,
    empresasAnonimas,
  };
}

function generarReporteEstrategico(mercadoSegmentos, resultadosRonda, segmentosConfig, equiposConfig, resultadosAnteriores) {
  const premium = generarReportePremium(mercadoSegmentos, resultadosRonda, segmentosConfig, equiposConfig);
  const resultados     = Object.values(resultadosRonda   || {});
  const resultadosAnt  = Object.values(resultadosAnteriores || {});

  // SECCIÓN 1 — Empresas y productos CON NOMBRE (Estratégico)
  const porEmpresa = {};
  resultados.forEach(r => {
    const eqId = r.equipoOriginal || r.equipo;
    if (!porEmpresa[eqId]) porEmpresa[eqId] = { nombre: r.equipoNombre, productos: [] };
    porEmpresa[eqId].productos.push(r);
  });

  const empresasConNombre = Object.values(porEmpresa).map(emp => ({
    empresa:   emp.nombre,
    productos: emp.productos.map(p => ({
      producto:   p.producto,
      segmento:   p.segmento || p.segmentoObjetivo,
      precio:     p.precioVenta,
      calidad:    p.calidad,
      share:      p.shareReal,
      ventas:     p.ventasReales,
      cu:         p.costoUnitario,
    })),
    shareTotal:    emp.productos.reduce((s,p)=>s+(p.shareReal||0),0),
    ventasTotales: emp.productos.reduce((s,p)=>s+(p.ventasReales||0),0),
    utilidadNeta:  emp.productos[0]?.utilidadNeta,
  }));

  // SECCIÓN 2 — Elasticidad precio empírica por empresa/producto
  const elasticidades = [];
  resultados.forEach(r => {
    if (!resultadosAnteriores) return;
    // Buscar el mismo producto en la ronda anterior
    const ant = resultadosAnt.find(a =>
      (a.equipoOriginal || a.equipo) === (r.equipoOriginal || r.equipo)
      && a.producto === r.producto
    );
    if (!ant || !ant.precioVenta || ant.precioVenta === r.precioVenta) return;
    const dQ = (r.ventasReales   - ant.ventasReales)   / Math.max(ant.ventasReales, 1);
    const dP = (r.precioVenta    - ant.precioVenta)     / ant.precioVenta;
    if (Math.abs(dP) < 0.01) return; // cambio de precio insignificante
    const eps = dQ / dP;
    let interpretacion, color;
    if (Math.abs(eps) > 3)      { interpretacion = 'Muy elástica';   color = 'roja'; }
    else if (Math.abs(eps) > 1) { interpretacion = 'Elástica';       color = 'ambar'; }
    else                         { interpretacion = 'Inelástica';     color = 'verde'; }
    elasticidades.push({
      empresa:         r.equipoNombre,
      producto:        r.producto,
      segmento:        r.segmento,
      precioAnt:       ant.precioVenta,
      precioAct:       r.precioVenta,
      ventasAnt:       ant.ventasReales,
      ventasAct:       r.ventasReales,
      elasticidad:     Math.round(eps * 100) / 100,
      interpretacion,
      color,
    });
  });

  return {
    ...premium,
    tipo:               'Estratégico',
    titulo:             'Reporte de Inteligencia de Mercado — Estratégico',
    empresasConNombre,
    elasticidades,
  };
}

function generarReportes(decision, mercadoSegmentos, atractivoEquipos, resultadosRonda, simCfg, resultadosAnteriores) {
  const reportes = {};
  const { params, segmentos } = simCfg;
  const tipo = decision.tipoInvestigacion;

  if (tipo === 'Básica') {
    reportes.investigacion = generarReporteBasico(mercadoSegmentos, resultadosRonda, segmentos);
  }
  if (tipo === 'Premium') {
    reportes.investigacion = generarReportePremium(mercadoSegmentos, resultadosRonda, segmentos, simCfg.equipos||[]);
  }
  if (tipo === 'Estratégico') {
    reportes.investigacion = generarReporteEstrategico(
      mercadoSegmentos, resultadosRonda, segmentos,
      simCfg.equipos||[], resultadosAnteriores||{}
    );
  }
  return reportes;
}

module.exports = { generarReportes, generarReporteBasico, generarReportePremium, generarReporteEstrategico };
 
