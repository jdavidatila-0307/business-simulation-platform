/**
 * MOTOR DE CÁLCULO v2.0
 * Fórmulas basadas en el ejemplo integral del documento.
 * cfg = { params, tiposProducto, canales, segmentos, afinidadMatrix, competenciaExterna }
 */

// ── Helpers ────────────────────────────────────────────────────
function avg(a, b) { return (a + b) / 2; }
function roundBs(x) { return Math.round(x * 100) / 100; }

   // ══ BLOQUE A — va al ámbito del módulo, antes de calcularMercadoSegmentos() ══
// (Elimina la copia que estaba anidada dentro de ejecutarSimulador)

/**
 * Expande un array de decisiones de empresa en decisiones individuales
 * a nivel producto-equipo. Ej.: "EquipoA" con 3 productos → "EquipoA__prod_1",
 * "EquipoA__prod_2", "EquipoA__prod_3".
 *
 * Si la decisión no tiene el array `productos` (formato legado monoproducto),
 * la decisión se trata como si tuviera un único producto.
 *
 * @param {Array} decisiones  Array de decisiones de empresa
 * @returns {Array}           Array expandido de decisiones producto-equipo
 */
function expandirDecisionesMultiproducto(decisiones) {
  const expandidas = [];

  (decisiones || []).forEach(decisionEmpresa => {
    // Soporte tanto para formato nuevo (productos[]) como legado (campos planos)
    const productos =
      Array.isArray(decisionEmpresa.productos) && decisionEmpresa.productos.length
        ? decisionEmpresa.productos.filter(p => p.activo !== false)
        : [decisionEmpresa];   // legado: la propia decisión actúa como un solo producto

    productos.forEach((producto, idx) => {
      const productoId     = producto.productoId || `prod_${idx + 1}`;
      const equipoOriginal = decisionEmpresa.equipo;
      const equipoProductoId = `${equipoOriginal}__${productoId}`;

      expandidas.push({
        // Campos de empresa como base
        ...decisionEmpresa,
        // Campos del producto sobreescriben (precio, producción, canal, etc.)
        ...producto,

        // ID interno único para que el motor compita producto contra producto
        equipo: equipoProductoId,

        // Referencias a la empresa real (para consolidaciones posteriores)
        equipoOriginal,
        equipoProductoId,
        equipoNombre: decisionEmpresa.equipoNombre,
        productoId,

        // Decisión completa original (para consolidarPorEmpresa y reportes)
        empresaDecisionOriginal: decisionEmpresa,
      });
    });
  });

  return expandidas;
}



// Demanda formal = demandaBase × (1 - pctContrabando)
function calcularMercadoSegmentos(params, segmentos) {
  return segmentos.map(seg => ({
    nombre:          seg.nombre,
    demandaBase:     seg.demandaBase,
    pctContrabando:  seg.pctContrabando,
    demandaFormal:   Math.round(seg.demandaBase * (1 - seg.pctContrabando)),
    tendencia:       seg.tendencia,
    descripcion:     seg.descripcion,
    indiceExterno:   seg.indiceExterno,
  }));
}

// ── Paso 1: Fuerza de ventas ───────────────────────────────────
function calcularVendedores(d, params) {
  const vendedoresFinales = Math.max(0,
    (d.vendedoresIniciales || params.vendedoresIniciales) +
    (d.contratarVendedores || 0) -
    (d.despedirVendedores  || 0)
  );
  const costoVendedores =
    vendedoresFinales * params.sueldoTrimestralVendedor +
    (d.contratarVendedores || 0) * params.costoContratacionVendedor +
    (d.despedirVendedores  || 0) * params.costoDespidoVendedor;
  return { vendedoresFinales, costoVendedores };
}

// ── Paso 2: Gasto total de marketing ──────────────────────────
// Marketing efectivo (para atractivo) = publicidad + promocion + eventos + redes + rrpp
// Gasto total = lo anterior + costoVendedores
function calcularMarketing(d, costoVendedores) {
  const mktEfectivo =
    (d.publicidad        || 0) +
    (d.promocion         || 0) +
    (d.eventos           || 0) +
    (d.marketingRedes    || 0) +
    (d.relacionesPublicas|| 0);
  const gastoTotalMarketing = mktEfectivo + costoVendedores;
  return { mktEfectivo, gastoTotalMarketing };
}

// ── Paso 3: Costo unitario ─────────────────────────────────────
// CU = costoBase + (0.20 × calidad) + costoCanal_prom + efecto_innovacion
function calcularCostoUnitario(d, tiposProducto, canales, params) {
  const tp = tiposProducto[d.producto];
  if (!tp) throw new Error(`Producto desconocido: ${d.producto}`);

  const costoBase    = tp.costoBase;
  const costoCalidad = 0.20 * (d.calidad || 5);

  // Costo canal: promedio si hay canal secundario
  const cp = canales[d.canalPrincipal]?.costoAdicionalUnitario ?? 0;
  const cs = d.canalSecundario && d.canalSecundario !== 'Ninguno'
    ? canales[d.canalSecundario]?.costoAdicionalUnitario ?? 0
    : null;
  const costoCanal = cs !== null ? avg(cp, cs) : cp;

  // Innovación
  let efInnovacion = 0;
  if (d.innovacion && d.montoInnovacion > 0 && d.produccion > 0) {
    const baseFactor = d.montoInnovacion / d.produccion;
    if (d.tipoInnovacion === 'Producto') efInnovacion = +baseFactor * params.factorInnovacionProducto;
    if (d.tipoInnovacion === 'Proceso')  efInnovacion = -baseFactor * params.factorInnovacionProceso;
    // Canal: mejora atractivo, no afecta CU directamente
  }

  return roundBs(costoBase + costoCalidad + costoCanal + efInnovacion);
}

// ── Paso 5: Atractivo competitivo ─────────────────────────────
// A = afinidad + (0.8×calidad) + (0.0001×mktEfectivo) − (0.7×precio) + bonoCanal + impactoVendedores
function calcularAtractivo(d, segmento, afinidadMatrix, canales, vendedoresFinales) {
  const afinidad = (afinidadMatrix[d.producto]?.[segmento.idx] ?? 0);

  // Canal: promedio de bonos y factores si hay canal secundario
  const canalP = canales[d.canalPrincipal] || {};
  const canalS = d.canalSecundario && d.canalSecundario !== 'Ninguno'
    ? canales[d.canalSecundario] : null;

  const bonoCanal = canalS
    ? avg(canalP.bonoAtractivo ?? 2, canalS.bonoAtractivo ?? 2)
    : (canalP.bonoAtractivo ?? 2);

  const factorVend = canalS
    ? avg(canalP.factorImpactoVendedores ?? 0.5, canalS.factorImpactoVendedores ?? 0.5)
    : (canalP.factorImpactoVendedores ?? 0.5);

  const impactoVendedores = vendedoresFinales * factorVend;

  // Si el equipo invirtió en innovación Canal, añadir bonus
  const bonusInnovacionCanal = (d.innovacion && d.tipoInnovacion === 'Canal')
    ? (d.montoInnovacion || 0) * 0.00005
    : 0;

  return afinidad
    + 0.8 * (d.calidad || 5)
    + 0.0001 * (d.gastoTotalMarketing || d.mktEfectivo || 0)  // usa gasto total incl. vendedores
    - 0.7 * (d.precioVenta || 0)
    + bonoCanal
    + impactoVendedores
    + bonusInnovacionCanal;
}

// ── Paso 5b: Participación de mercado ─────────────────────────
function calcularParticipacion(decision, equiposEnSegmento, segmentoData, afinidadMatrix, canales, vendedoresPorEquipo) {
  // Calcular atractivo de todos los equipos en este segmento
  const atractivoPorEquipo = {};
  let totalAtractivo = segmentoData.indiceExterno; // competencia externa

  equiposEnSegmento.forEach(d => {
    const a = calcularAtractivo(d, segmentoData, afinidadMatrix, canales, vendedoresPorEquipo[d.equipo]);
    atractivoPorEquipo[d.equipo] = a;
    totalAtractivo += a;
  });

  const miAtractivo = atractivoPorEquipo[decision.equipo] ?? 0;
  const share = totalAtractivo > 0 ? miAtractivo / totalAtractivo : 0;

  return { miAtractivo, atractivoPorEquipo, share };
}

// ── Paso 6–7: Ventas, comisiones e inventario ─────────────────
function calcularVentas(d, share, demandaFormal, costoUnitario) {
  const inventarioDisponible = (d.inventarioInicial || 0) + (d.produccion || 0);
  const demandaAsignada      = Math.round(demandaFormal * share);
  const ventasReales         = Math.min(demandaAsignada, inventarioDisponible);
  const inventarioFinal      = inventarioDisponible - ventasReales;

  const ventasBrutas = roundBs(ventasReales * (d.precioVenta || 0));

  // Comisión: promedio si hay canal secundario
  const canalesArr = [d.canalPrincipal];
  if (d.canalSecundario && d.canalSecundario !== 'Ninguno') canalesArr.push(d.canalSecundario);

  return { inventarioDisponible, demandaAsignada, ventasReales, inventarioFinal, ventasBrutas };
}

// ── Paso 3 continuado: P&L completo ──────────────────────────
function calcularResultadosFinancieros(d, ventas, costoUnitario, gastoTotalMarketing, params, canalesCfg) {
  const { ventasBrutas, ventasReales, inventarioFinal } = ventas;

  // Comisión canal
  const canalP = canalesCfg[d.canalPrincipal] || {};
  const canalS = d.canalSecundario && d.canalSecundario !== 'Ninguno' ? canalesCfg[d.canalSecundario] : null;
  const comisionPct = canalS ? avg(canalP.comisionPct ?? 0, canalS.comisionPct ?? 0) : (canalP.comisionPct ?? 0);
  const comisiones  = roundBs(ventasBrutas * comisionPct);
  const ventasNetas = roundBs(ventasBrutas - comisiones);

  // Costo de ventas
  const costoVentas    = roundBs(ventasReales * costoUnitario);
  const utilidadBruta  = roundBs(ventasNetas - costoVentas);

  // Inventario final valorizado
  const invFinalValorizado = roundBs(inventarioFinal * costoUnitario);
  const costoAlmacenamiento = roundBs(inventarioFinal * params.costoAlmacenamientoUnidad);

  // Innovación (gasto operativo)
  const gastoInnovacion = d.innovacion ? (d.montoInnovacion || 0) : 0;

  // Financiamiento
  const montoP = d.montoPrestamo || 0;
  const tipoP  = d.tipoPrestamo  || 'Ninguno';
  let interesesPrestamo = 0, comisionApertura = 0;
  if (tipoP !== 'Ninguno' && montoP > 0) {
    const tasa = tipoP === 'Operativo' ? params.tasaPrestamoOperativo : params.tasaPrestamoInversion;
    interesesPrestamo = roundBs(montoP * tasa);
    comisionApertura  = roundBs(montoP * params.comisionAperturaPrestamo);
  }

  // Gastos operativos totales
  let gastosOp = roundBs(
    (d.publicidad         || 0) +
    (d.promocion          || 0) +
    (d.eventos            || 0) +
    (d.marketingRedes     || 0) +
    (d.relacionesPublicas || 0) +
    (d.costoVendedores    || 0) +
    params.gastoAdminFijo      +
    params.gastoFijoPlanta     +
    params.depreciacionTrimestral +
    costoAlmacenamiento        +
    gastoInnovacion            +
    interesesPrestamo          +
    comisionApertura
  );

  let utilidadNeta = roundBs(utilidadBruta - gastosOp);

  // Flujo de caja
  const cxcCobroEsta = roundBs((d.cxcInicial || 0) / Math.max(1, params.plazoCobro)); // cobro cuota del CxC anterior
  const cobrosContado = roundBs(ventasNetas * params.pctVentasContado + cxcCobroEsta);

  // Produccion: pago de costos de producción (solo MP y conversión, sin CxP por simplicidad)
  const pagoProduccion = roundBs((d.produccion || 0) * costoUnitario);
  const pagoMktTotal   = gastoTotalMarketing; // ya incluye vendedores
  const pagoAdmin      = params.gastoAdminFijo;
  const pagoPlanta     = params.gastoFijoPlanta;
  // Nota: depreciación no es salida de caja
  const pagoInnovacion = gastoInnovacion;
  const pagoAlmacen    = costoAlmacenamiento;
  const pagoIntereses  = interesesPrestamo;
  const pagoApertura   = comisionApertura;

  const totalPagos = roundBs(pagoProduccion + pagoMktTotal + pagoAdmin + pagoPlanta +
    pagoInnovacion + pagoAlmacen + pagoIntereses + pagoApertura);

  const cajaInicial   = d.cajaInicial || 0;
  const ingresoPrestamo = tipoP !== 'Ninguno' ? montoP : 0;

  let cajaPreliminar = roundBs(cajaInicial + cobrosContado + ingresoPrestamo - totalPagos);

  // Sobregiro automático si caja < 0
  let sobregiro = 0, interesSobregiro = 0;
  if (cajaPreliminar < 0) {
    sobregiro        = roundBs(-cajaPreliminar);
    interesSobregiro = roundBs(sobregiro * params.tasaSobregiro);
    cajaPreliminar   = 0;
    utilidadNeta     = roundBs(utilidadNeta - interesSobregiro);
    gastosOp         = roundBs(gastosOp + interesSobregiro);
  }
  const cajaFinal = cajaPreliminar;

  // CxC final = CxC anterior no cobrado + nuevas ventas a crédito
  const cxcNuevo     = roundBs(ventasNetas * params.pctVentasCredito);
  const cxcNoCobrObj = roundBs((d.cxcInicial || 0) - cxcCobroEsta);
  const cxcFinal     = roundBs(Math.max(0, cxcNoCobrObj) + cxcNuevo);

  // Deuda final = préstamos + sobregiro (el interés del sobregiro va como pasivo separado)
  const amortizacion = d.amortizacion || 0;
  const deudaPrestamos = roundBs(Math.max(0, (d.deudaInicial || 0) + ingresoPrestamo - amortizacion));
  const deudaFinal     = roundBs(deudaPrestamos + sobregiro + interesSobregiro);

  // Activos fijos netos
  const afNetos = roundBs((d.activosFijosIniciales || params.activosFijosIniciales) - params.depreciacionTrimestral);

  // Balance General — debe cuadrar: Activos = Pasivos + Patrimonio
  // Pasivos = deudaFinal (préstamos + sobregiro + interés sobregiro)
  // Patrimonio = Capital + ResultadoAcumulado (resultado ya incluye la pérdida del interesSobregiro)
  const totalActivos    = roundBs(cajaFinal + cxcFinal + invFinalValorizado + afNetos);
  // capitalContable es el capital ORIGINAL que pusieron los socios — no cambia con la depreciación
  const capitalContable = roundBs(params.activosFijosIniciales + params.cajaInicial);
  const resultadoAcumulado = roundBs((d.resultadoAcumuladoAnterior || 0) + utilidadNeta);
  const patrimonio      = roundBs(capitalContable + resultadoAcumulado);
  // totalPasivos = totalActivos - patrimonio (by definition, ensures balance)
  const totalPasivos    = deudaFinal;

  return {
    // Estado de Resultados
    ventasBrutas, comisiones, ventasNetas,
    costoVentas, utilidadBruta,
    publicidad:         d.publicidad         || 0,
    promocion:          d.promocion          || 0,
    eventos:            d.eventos            || 0,
    marketingRedes:     d.marketingRedes     || 0,
    relacionesPublicas: d.relacionesPublicas || 0,
    costoVendedores:    d.costoVendedores    || 0,
    gastoAdminFijo:     params.gastoAdminFijo,
    gastoFijoPlanta:    params.gastoFijoPlanta,
    depreciacion:       params.depreciacionTrimestral,
    costoAlmacenamiento, gastoInnovacion,
    interesesPrestamo, comisionApertura, interesSobregiro,
    gastosOp, utilidadNeta,

    // Flujo de Efectivo
    cajaInicial, cobrosContado, ingresoPrestamo,
    pagoProduccion, pagoMktTotal, pagoAdmin, pagoPlanta,
    pagoInnovacion, pagoAlmacen, pagoIntereses, pagoApertura,
    totalPagos, sobregiro, cajaFinal,

    // Balance
    cxcFinal, invFinalValorizado, afNetos,
    totalActivos, deudaFinal, totalPasivos,
    capitalContable, resultadoAcumulado, patrimonio,

    // Para propagación
    inventarioFinal, vendedoresFinales: d.vendedoresFinales || d.vendedoresIniciales,
    activosFijosNetos: afNetos,
    costoUnitario, comisionPct,
  };
}

// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────
function ejecutarSimulador(decisiones, cfg) {
  const { params, tiposProducto, canales, segmentos, afinidadMatrix } = cfg;
    decisiones = expandirDecisionesMultiproducto(decisiones);
   

  // Calcular demanda formal de cada segmento
  const mercadoSegmentos = calcularMercadoSegmentos(params, segmentos);
  const segmentoPorNombre = {};
  mercadoSegmentos.forEach((s, i) => { segmentoPorNombre[s.nombre] = { ...s, idx: i }; });

  // Agrupar decisiones por segmento
  const equiposPorSegmento = {};
  decisiones.forEach(d => {
    if (!equiposPorSegmento[d.segmentoObjetivo]) equiposPorSegmento[d.segmentoObjetivo] = [];
    equiposPorSegmento[d.segmentoObjetivo].push(d);
  });

  // Pre-calcular vendedores y marketing por equipo (necesarios para atractivo)
 const vendedoresPorEquipo = {};
  const mktEfectivoPorEquipo = {};
  const costoVendedoresPorEquipo = {};

  decisiones.forEach(d => {
    const { vendedoresFinales, costoVendedores } = calcularVendedores(d, params);
    vendedoresPorEquipo[d.equipo]       = vendedoresFinales;
    costoVendedoresPorEquipo[d.equipo]  = costoVendedores;
    const { mktEfectivo, gastoTotalMarketing } = calcularMarketing(d, costoVendedores);
    mktEfectivoPorEquipo[d.equipo] = mktEfectivo;
    // Inyectar en decisión para que calcularAtractivo lo use
    d.mktEfectivo         = mktEfectivo;
    d.costoVendedores     = costoVendedores;
    d.gastoTotalMarketing = gastoTotalMarketing;
    d.vendedoresFinales   = vendedoresFinales;
  });

  // Calcular atractivo y shares
  const atractivoEquipos = {};
  const sharesPorEquipo  = {};

  decisiones.forEach(d => {
    const seg = segmentoPorNombre[d.segmentoObjetivo];
    if (!seg) return;
    const equiposEnSeg = equiposPorSegmento[d.segmentoObjetivo] || [];
    const { share, miAtractivo, atractivoPorEquipo } = calcularParticipacion(
      d, equiposEnSeg, seg, afinidadMatrix, canales, vendedoresPorEquipo
    );
    atractivoEquipos[d.equipo] = miAtractivo;
    sharesPorEquipo[d.equipo]  = share;
    // Guardar todos los atractivos del segmento
    Object.assign(atractivoEquipos, atractivoPorEquipo);
  });

  // Calcular resultados financieros completos
  const resultados = decisiones.map(d => {
    const seg        = segmentoPorNombre[d.segmentoObjetivo];
    const cu         = calcularCostoUnitario(d, tiposProducto, canales, params);
    const share      = sharesPorEquipo[d.equipo] || 0;
    const demFormal  = seg?.demandaFormal || 0;
    const ventas     = calcularVentas(d, share, demFormal, cu);
    const fin        = calcularResultadosFinancieros(d, ventas, cu, d.gastoTotalMarketing, params, canales);

    return {
      equipo:          d.equipo,
      equipoOriginal:   d.equipoOriginal || d.equipo,
      equipoProductoId: d.equipoProductoId || d.equipo,
      productoId:       d.productoId || 'prod_1',
      equipoNombre:    d.equipoNombre,
      segmento:        d.segmentoObjetivo,
      producto:        d.producto,
      calidad:         d.calidad,
      precioVenta:     d.precioVenta,
      produccion:      d.produccion,
      demandaFormal:   demFormal,
      demandaAsignada: ventas.demandaAsignada,
      ventasReales:    ventas.ventasReales,
      shareReal:       share,
      atractivo:       atractivoEquipos[d.equipo] || 0,
      ...fin,
      alertaCaja:      fin.cajaFinal < 500 ? 'ALERTA' : 'OK',
    };
  });

  // Dashboard agregado
  const totalVentas   = resultados.reduce((s,r) => s + r.ventasReales, 0);
  const totalIngresos = resultados.reduce((s,r) => s + r.ventasNetas,  0);
  const totalUtilidad = resultados.reduce((s,r) => s + r.utilidadNeta, 0);
  const totalCaja     = resultados.reduce((s,r) => s + r.cajaFinal,    0);

// ══ BLOQUE C — reemplaza el `return { ... }` al final de ejecutarSimulador ════
//
// BUSCA este bloque en ejecutarSimulador:
//
//   return { mercadoSegmentos, atractivoEquipos, sharesPorEquipo, resultados,
//     dashboard: { totalVentas, totalIngresos, totalUtilidad, totalCaja } };
//
// Y REEMPLÁZALO con el siguiente:

  return {
    mercadoSegmentos,
    atractivoEquipos,
    sharesPorEquipo,
    resultados,                              // por producto expandido (sin cambios)
    empresas: consolidarPorEmpresa(resultados), // ← NUEVO: consolidado por empresa
    dashboard: { totalVentas, totalIngresos, totalUtilidad, totalCaja },
  };

}

/**
 * PRE-SIMULACIÓN: calcula demanda asignada y market share por equipo
 * sin procesar estados financieros. Usado para notificar a los equipos
 * antes de que el profesor ejecute la simulación completa.
 */
  function calcularPreSimulacion(decisiones, cfg) {
  const { params, tiposProducto, canales, segmentos, afinidadMatrix } = cfg;
  
  decisiones = expandirDecisionesMultiproducto(decisiones);

  const mercadoSegmentos = calcularMercadoSegmentos(params, segmentos);
  const segmentoPorNombre = {};
  mercadoSegmentos.forEach((s, i) => { segmentoPorNombre[s.nombre] = { ...s, idx: i }; });

  const equiposPorSegmento = {};
  decisiones.forEach(d => {
    if (!equiposPorSegmento[d.segmentoObjetivo]) equiposPorSegmento[d.segmentoObjetivo] = [];
    equiposPorSegmento[d.segmentoObjetivo].push(d);
  });

  // Pre-calcular vendedores y marketing (necesarios para atractivo)
  const vendedoresPorEquipo = {};
  decisiones.forEach(d => {
    const vf = Math.max(0,
      (d.vendedoresIniciales || params.vendedoresIniciales) +
      (d.contratarVendedores || 0) - (d.despedirVendedores || 0)
    );
    vendedoresPorEquipo[d.equipo] = vf;
    const costoVend = vf * params.sueldoTrimestralVendedor +
      (d.contratarVendedores || 0) * params.costoContratacionVendedor +
      (d.despedirVendedores  || 0) * params.costoDespidoVendedor;
    d.costoVendedores     = costoVend;
    d.mktEfectivo         = (d.publicidad||0)+(d.promocion||0)+(d.eventos||0)+(d.marketingRedes||0)+(d.relacionesPublicas||0);
    d.gastoTotalMarketing = d.mktEfectivo + costoVend;
    d.vendedoresFinales   = vf;
  });

  const resultado = decisiones.map(d => {
    const seg = segmentoPorNombre[d.segmentoObjetivo];
    if (!seg) return { equipo: d.equipo, equipoNombre: d.equipoNombre, error: 'Segmento no encontrado' };

    const equiposEnSeg = equiposPorSegmento[d.segmentoObjetivo] || [];
    const { share, miAtractivo } = calcularParticipacion(
      d, equiposEnSeg, seg, afinidadMatrix, canales, vendedoresPorEquipo
    );

    const inventarioDisponible = (d.inventarioInicial || 0) + (d.produccion || 0);
    const demandaAsignada      = Math.round(seg.demandaFormal * share);
    const ventasEstimadas      = Math.min(demandaAsignada, inventarioDisponible);
    const inventarioFinalEst   = inventarioDisponible - ventasEstimadas;

    const cu = calcularCostoUnitario(d, tiposProducto, canales, params);

    return {
      equipo:              d.equipo,
      equipoNombre:        d.equipoNombre,
      segmento:            d.segmentoObjetivo,
      producto:            d.producto,
      precioVenta:         d.precioVenta,
      shareEstimado:       share,
      atractivo:           miAtractivo,
      demandaFormal:       seg.demandaFormal,
      demandaAsignada,
      ventasEstimadas,
      inventarioInicial:   d.inventarioInicial || 0,
      produccion:          d.produccion || 0,
      inventarioDisponible,
      inventarioFinalEst,
      costoUnitario:       cu,
      confirmado:          false,   // el equipo debe confirmar que vio este dato
    };
  });

  return { mercadoSegmentos, resultado };
}

// ══ BLOQUE B — nueva función: consolidarPorEmpresa ════════════════════════════
// Pégala antes del bloque `module.exports` al final de engine.js.

/**
 * Agrupa los resultados expandidos (nivel producto-equipo) por empresa original.
 *
 * Reglas de agregación:
 *  - Campos financieros sumables: ventasReales, ventasNetas, costoVentas,
 *    utilidadBruta, gastosOp, utilidadNeta.
 *  - Campos financieros compartidos (de balance/flujo de caja): cajaFinal,
 *    cxcFinal, totalActivos, deudaFinal, patrimonio.
 *    → Se toman del PRIMER producto encontrado para esa empresa
 *      (representan el estado de la empresa, no son por-producto).
 *  - sharePromedio: promedio aritmético de shareReal de los productos.
 *
 * @param {Array} resultadosExpandidos  Array de resultados devueltos por ejecutarSimulador
 * @returns {Array}                     Array de objetos empresa consolidados
 */
function consolidarPorEmpresa(resultadosExpandidos) {
  /** @type {Map<string, Object>} */
  const mapaEmpresas = new Map();

  for (const r of resultadosExpandidos) {
    const key = r.equipoOriginal || r.equipo; // fallback para formato legado

    if (!mapaEmpresas.has(key)) {
      // Primera vez que vemos esta empresa: inicializar con campos compartidos
      mapaEmpresas.set(key, {
        equipo:       key,
        equipoNombre: r.equipoNombre,
        productos: [],

        // ── Campos sumables (se irán acumulando) ──
        ventasReales:  0,
        ventasNetas:   0,
        costoVentas:   0,
        utilidadBruta: 0,
        gastosOp:      0,
        utilidadNeta:  0,

        // ── Campos compartidos de balance/caja (tomados del primer producto) ──
        cajaFinal:    r.cajaFinal,
        cxcFinal:     r.cxcFinal,
        totalActivos: r.totalActivos,
        deudaFinal:   r.deudaFinal,
        patrimonio:   r.patrimonio,

        // ── Derivados (se calculan al final) ──
        sharePromedio: 0,
        _sumShares:    0,
        _countProductos: 0,
      });
    }

    const empresa = mapaEmpresas.get(key);

    // Acumular campos sumables
    empresa.ventasReales  += r.ventasReales  || 0;
    empresa.ventasNetas   += r.ventasNetas   || 0;
    empresa.costoVentas   += r.costoVentas   || 0;
    empresa.utilidadBruta += r.utilidadBruta || 0;
    empresa.gastosOp      += r.gastosOp      || 0;
    empresa.utilidadNeta  += r.utilidadNeta  || 0;

    // Acumular para el promedio de share
    empresa._sumShares      += r.shareReal || 0;
    empresa._countProductos += 1;

    // Resumen por producto para drilldown en el frontend
    empresa.productos.push({
      productoId:  r.productoId,
      producto:    r.producto,
      segmento:    r.segmento,
      ventasReales: r.ventasReales,
      ventasNetas:  r.ventasNetas,
      utilidadNeta: r.utilidadNeta,
      shareReal:    r.shareReal,
      atractivo:    r.atractivo,
    });
  }

  // Calcular sharePromedio y limpiar campos auxiliares
  const resultado = [];
  for (const empresa of mapaEmpresas.values()) {
    empresa.sharePromedio = empresa._countProductos > 0
      ? roundBs(empresa._sumShares / empresa._countProductos)
      : 0;
    empresa.alertaCaja = empresa.cajaFinal < 500 ? 'ALERTA' : 'OK';
    delete empresa._sumShares;
    delete empresa._countProductos;
    resultado.push(empresa);
  }

  return resultado;
}


// ══ BLOQUE D — reemplaza module.exports al final del archivo ═════════════════

module.exports = {
  ejecutarSimulador,
  calcularMercadoSegmentos,
  calcularPreSimulacion,
  expandirDecisionesMultiproducto, // exportada para tests y uso externo
  consolidarPorEmpresa,            // exportada para uso en server.js/reports.js
};
