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
    // FIX: garantizar que el campo canónico "producto" exista antes de expandir.
    // El formulario legado puede haber guardado "tipoProducto" en lugar de "producto".
    if (!decisionEmpresa.producto && decisionEmpresa.tipoProducto) {
      decisionEmpresa = { ...decisionEmpresa, producto: decisionEmpresa.tipoProducto };
    }
    // Propagar también al array productos[0] si corresponde
    if (Array.isArray(decisionEmpresa.productos) && decisionEmpresa.productos[0]
        && !decisionEmpresa.productos[0].producto && decisionEmpresa.producto) {
      decisionEmpresa.productos[0] = {
        ...decisionEmpresa.productos[0],
        producto: decisionEmpresa.producto
      };
    }

    // Soporte tanto para formato nuevo (productos[]) como legado (campos planos)
    const productos =
      Array.isArray(decisionEmpresa.productos) && decisionEmpresa.productos.length
        ? decisionEmpresa.productos.filter((p, pidx) =>
            p.activo !== false &&
            (
              (p.produccion || 0) > 0 ||        // produjo algo
              (p.precioVenta || 0) > 0 ||       // fijó un precio
              pidx === 0                          // siempre incluir Producto 1
            )
          )
        : [decisionEmpresa];   // legado: la propia decisión actúa como un solo producto

    productos.forEach((producto, idx) => {
      const productoId     = producto.productoId || `prod_${idx + 1}`;
      const equipoOriginal = decisionEmpresa.equipo;
      const equipoProductoId = `${equipoOriginal}__${productoId}`;

      // Campos de empresa que NO deben ser sobreescritos por el producto
      const camposEmpresa = {
        contratarVendedores:  decisionEmpresa.contratarVendedores  || 0,
        despedirVendedores:   decisionEmpresa.despedirVendedores   || 0,
        vendedoresIniciales:  decisionEmpresa.vendedoresIniciales,
        operariosIniciales:   decisionEmpresa.operariosIniciales,
        contratarOperarios:   decisionEmpresa.contratarOperarios   || 0,
        despedirOperarios:    decisionEmpresa.despedirOperarios    || 0,
        brandEquityInicial:   decisionEmpresa.brandEquityInicial,
        inventarioInicial:    decisionEmpresa.inventarioInicial,
        tipoPrestamo:         decisionEmpresa.tipoPrestamo,
        montoPrestamo:        decisionEmpresa.montoPrestamo,
        plazoPrestamo:        decisionEmpresa.plazoPrestamo,
        amortizacion:         decisionEmpresa.amortizacion,
        cajaInicial:          decisionEmpresa.cajaInicial,
        cxcInicial:           decisionEmpresa.cxcInicial,
        deudaInicial:         decisionEmpresa.deudaInicial,
        activosFijosIniciales:decisionEmpresa.activosFijosIniciales,
        resultadoAcumuladoAnterior: decisionEmpresa.resultadoAcumuladoAnterior,
      };

      expandidas.push({
        // Campos de empresa como base
        ...decisionEmpresa,
        // Campos del producto sobreescriben (precio, producción, canal, etc.)
        ...producto,
        // Restaurar campos de empresa que no deben ser sobreescritos
        ...camposEmpresa,

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



// Demanda formal = demandaBase_T × (1 - pctContrabando)
// demandaBaseAnteriorMap: { [nombreSegmento]: demandaBase de ronda anterior }
// Si no existe (ronda 1), usa el valor estático del JSON.
function calcularMercadoSegmentos(params, segmentos, demandaBaseAnteriorMap = {}, shock = null) {
  return segmentos.map((seg, idx) => {
    // Etapa 2.2: aplicar crecimiento sobre la demanda de la ronda anterior
    const baseAnterior = demandaBaseAnteriorMap[seg.nombre] ?? seg.demandaBase;
    const tasa         = seg.tasaCrecimiento ?? 0;
    const demandaBaseT = Math.round(baseAnterior * (1 + tasa));
    const demandaFormalBase = Math.round(demandaBaseT * (1 - seg.pctContrabando));

    // Shock de mercado: multiplicador sobre demanda formal
    let factorShock = 1.0;
    if (shock && shock.tipo !== 'neutral') {
      const afectaTodos = shock.segmentosAfectados === 'todos';
      const afectaEste  = afectaTodos ||
        (Array.isArray(shock.segmentosAfectados) && shock.segmentosAfectados.includes(idx));
      if (afectaEste) factorShock = shock.factorDemanda ?? 1.0;
    }

    return {
      nombre:               seg.nombre,
      demandaBase:          demandaBaseT,
      demandaBaseOriginal:  seg.demandaBase,
      pctContrabando:       seg.pctContrabando,
      demandaFormal:        Math.round(demandaFormalBase * factorShock),
      demandaFormalSinShock: demandaFormalBase,
      factorShock,
      tendencia:            seg.tendencia,
      tasaCrecimiento:      tasa,
      descripcion:          seg.descripcion,
      indiceExterno:        seg.indiceExterno,
    };
  });
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

// ── Etapa 3.2: Operarios — capacidad efectiva de producción ───
function calcularOperarios(d, params) {
  const operariosIniciales = d.operariosIniciales ?? params.operariosIniciales ?? 4;
  const operariosFinales = Math.max(0,
    operariosIniciales + (d.contratarOperarios || 0) - (d.despedirOperarios || 0)
  );
  const productividadBase = params.productividadBase ?? 440;
  const factorCap = params.factorCapacitacion ?? 0.05;
  const monto     = d.montoCapacitacion ?? 0;
  // Capacidad efectiva = operarios × productividad × (1 + factor × monto/10000)
  const capacidadEfectiva = Math.round(
    operariosFinales * productividadBase * (1 + factorCap * monto / 10000)
  );
  const costoContratacion = (d.contratarOperarios || 0) * (params.costoContratacionOperario ?? 800);
  const costoDespido      = (d.despedirOperarios  || 0) * (params.costoDespidoOperario     ?? 1200);
  const costoOperarios    = roundBs(
    operariosFinales * (params.costoOperario ?? 3200) + costoContratacion + costoDespido + monto
  );
  return { operariosFinales, capacidadEfectiva, costoOperarios };
}

// ── Etapa 3.1: Procesar pedidos de MP con lead time ───────────
// Retorna { stockMPDisponible, pedidosPendientesResta, pagoMP }
function procesarPedidosMP(d, rondaNumero, params) {
  const pendientes   = Array.isArray(d.pedidosPendientes) ? d.pedidosPendientes : [];
  const stockInicial = d.stockMPInicial ?? 0;
  const costoMP      = 0;   // el costo ya fue pagado al hacer el pedido

  // Pedidos que llegan esta ronda (rondaEntrega <= rondaNumero)
  let stockRecibido = 0;
  const pendientesResta = [];
  for (const pedido of pendientes) {
    if ((pedido.rondaEntrega ?? 0) <= rondaNumero) {
      stockRecibido += pedido.cantidad;
    } else {
      pendientesResta.push(pedido);
    }
  }

  // Nuevo pedido de esta ronda
  const proveedor     = d.proveedorElegido || '';
  const cantidadPedida = d.cantidadMPpedida ?? 0;
  let pagoMP = 0;

  if (cantidadPedida > 0 && proveedor) {
    const provData    = (params._proveedores || []).find(p => p.id === proveedor || p.nombre === proveedor);
    const leadTime    = provData?.leadTime ?? 1;
    // Costo del pedido: costoMPbase × factorCosto × cantidad
    // costoMPbase = costoBase del producto × pctMateriaPrima
    // Aquí no tenemos el costoBase por producto directamente, usamos el costoUnitario
    // como aproximación del pagoMP (pago al momento del pedido)
    const pctMP_mp    = params.pctMateriaPrima ?? 0.40;
    const factorC     = provData?.factorCosto ?? 1.0;
    // costoUnitMP = costoBaseRef × pctMP × factorCosto
    // costoBaseRef: usamos el promedio de costoBase de los tipos de producto
    // o el valor de referencia si está disponible en params
    const costoBaseRef = params.costoBaseReferencia ?? 200;  // valor de referencia industria
    // FIX 2: pagoMP = 0 porque el costo MP ya está en el CU (componenteMP)
    // y sale de caja a través de pagoProduccion = produccion × costoUnitario
    // El módulo MP sigue restringiendo producción via stock (lead time activo)
    pagoMP = 0;
    if (leadTime === 0) {
      stockRecibido += cantidadPedida;
    } else {
      pendientesResta.push({ rondaEntrega: rondaNumero + leadTime, cantidad: cantidadPedida, costoMP: 0 });
    }
  }

  const stockMPDisponible = stockInicial + stockRecibido;
  return { stockMPDisponible, pedidosPendientesResta: pendientesResta, pagoMP };
}

// ── Paso 3: Costo unitario ─────────────────────────────────────
// CU = costoTransformacion + costoMP_ajustado + costoCalidad + costoCanal + efInnovacion
//
// Diseño de la MP:
//   pctMateriaPrima (ej 0.40) → porcentaje del costoBase que representa materiales
//   costoTransformacion = costoBase × (1 − pctMP)  → MOD + overhead, siempre igual
//   costoMPbase = costoBase × pctMP                → costo estándar de materiales
//   costoMP_ajustado = costoMPbase × factorCosto_proveedor
//     factorCosto = 1.00 → Nacional (precio estándar)
//     factorCosto = 0.65 → Importado (35% más barato, menor calidad, lead time 2)
//   Sin proveedor → factorCosto = 1.0 → CU = costoBase (sin cambio)
function calcularCostoUnitario(d, tiposProducto, canales, params, costoMPunitario = 0) {
  // FIX: recuperar producto del campo legado tipoProducto si el canónico está vacío
  if (!d.producto && d.tipoProducto) {
    d = { ...d, producto: d.tipoProducto };
  }
  // Intentar también desde productos[0] si está disponible
  if (!d.producto && Array.isArray(d.productos) && d.productos[0]?.producto) {
    d = { ...d, producto: d.productos[0].producto };
  }

  const tp = tiposProducto[d.producto];
  if (!tp) {
    console.error('[motor] calcularCostoUnitario — producto no encontrado', {
      equipo:           d.equipo,
      producto:         d.producto,
      tipoProducto:     d.tipoProducto,
      productosTipo:    typeof d.producto,
      productosCero:    d.productos?.[0]?.producto,
      tiposDisponibles: Object.keys(tiposProducto),
    });
    throw new Error(
      `Producto desconocido: "${d.producto}". ` +
      `Disponibles: ${Object.keys(tiposProducto).join(', ')}`
    );
  }

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

  // ── Materia Prima con factorCosto del proveedor ──────────────────
  // pctMP: porcentaje del costoBase que representa materiales (default 40%)
  // costoMPunitario viene calculado en ejecutarSimulador:
  //   costoMPunitario = costoBase × pctMP × factorCosto_proveedor
  //   Nacional  (1.00): costoMPunit = costoBase × 40% × 1.00 = 40% del base
  //   Importado (0.65): costoMPunit = costoBase × 40% × 0.65 = 26% del base
  //   Sin proveedor:    costoMPunit = costoBase × 40% × 1.00 (default)
  const pctMP       = params.pctMateriaPrima ?? 0.40;
  const tasaIVA_cu  = params.tasaIVA ?? 0.13;
  const costoTrans  = roundBs(costoBase * (1 - pctMP));  // transformación: MOD + overhead
  // componenteMP en el P&L = precio neto sin IVA = monto_factura × (1 − tasaIVA)
  // Ley 843: el costo contable es el precio neto; el IVA va como crédito fiscal
  const costoMPbruto = costoMPunitario > 0
    ? costoMPunitario
    : roundBs(costoBase * pctMP);
  const componenteMP = roundBs(costoMPbruto * (1 - tasaIVA_cu));  // precio neto en ER

  return roundBs(costoTrans + componenteMP + costoCalidad + costoCanal + efInnovacion);
}

// ── Brand Equity: cálculo acumulativo por ronda ───────────────
// BE crece con ventas y utilidad; decae si el equipo no vende.
// brandEquityAnterior: valor propagado de la ronda anterior (default 50)
// shareReal:           fracción de demanda capturada [0-1]
// utilidadNeta:        resultado del período (puede ser negativo)
// tasaDecaimiento:     parámetro del JSON (default 0.05)
function calcularBrandEquity(brandEquityAnterior, shareReal, utilidadNeta, tasaDecaimiento) {
  const bea = brandEquityAnterior ?? 50;
  const td  = tasaDecaimiento ?? 0.05;
  const vendio = shareReal > 0;
  const bonusUtilidad = utilidadNeta > 0 ? 5 : 0;
  const ganancia = shareReal * 100 + bonusUtilidad;
  const factorDecaimiento = vendio ? (1 - td) : (1 - td * 2);
  const nuevoBE = bea * factorDecaimiento + (vendio ? ganancia : 0);
  return Math.max(0, Math.round(nuevoBE * 100) / 100);
}

// ── Paso 5: Atractivo competitivo ─────────────────────────────
// A = afinidad + (0.8×calidad) + (0.0001×mktEfectivo) − (0.7×precio) + bonoCanal + impactoVendedores
function calcularAtractivo(d, segmento, afinidadMatrix, canales, vendedoresFinales, params = {}) {
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
    + (params.coefPrecio ?? -0.7) * (d.precioVenta || 0)  // calibrado por industria
    + bonoCanal
    + impactoVendedores
    + bonusInnovacionCanal
    + 0.05 * (d.brandEquityInicial ?? 50);
}

// ── Paso 5b: Participación de mercado ─────────────────────────
// Etapa 2.3: recibe params para leer factorCanibalizacion
function calcularParticipacion(decision, equiposEnSegmento, segmentoData, afinidadMatrix, canales, vendedoresPorEquipo, params = {}) {
  // Calcular atractivos brutos para cada equipo
  const atractivoPorEquipo = {};
  equiposEnSegmento.forEach(d => {
    atractivoPorEquipo[d.equipo] = calcularAtractivo(
      d, segmentoData, afinidadMatrix, canales, vendedoresPorEquipo[d.equipo], params
    );
  });

  // Etapa 2.3: canibalización — penalizar atractivo si la misma empresa
  // tiene N > 1 productos activos en este segmento.
  const factorCanib = params.factorCanibalizacion ?? 0;
  if (factorCanib > 0) {
    const empresasEnSeg = {};
    equiposEnSegmento.forEach(d => {
      const orig = d.equipoOriginal || d.equipo;
      empresasEnSeg[orig] = (empresasEnSeg[orig] || 0) + 1;
    });
    equiposEnSegmento.forEach(d => {
      const orig = d.equipoOriginal || d.equipo;
      const N = empresasEnSeg[orig] || 1;
      if (N > 1) {
        const penalizacion = Math.max(0, 1 - factorCanib * (N - 1));
        atractivoPorEquipo[d.equipo] = atractivoPorEquipo[d.equipo] * penalizacion;
      }
    });
  }

  const miAtractivoRaw = atractivoPorEquipo[decision.equipo] ?? 0;

  // Etapa 2.4: parámetro de escala λ del Logit multinomial.
  // λ = 1.0 → comportamiento neutro (igual al modelo anterior).
  // λ > 1.0 → más sensibilidad al precio/calidad (mercado más diferenciado).
  // λ < 1.0 → shares más uniformes (mercado más aleatorio).
  // Rango válido: 0.1 – 3.0. Editable por el admin en params.
  const lambda = Math.min(3.0, Math.max(0.1, params.lambdaLogit ?? 1.0));

  // Transformación exponencial escalada: exp(λ × atractivo)
  const expExterno = Math.exp(lambda * segmentoData.indiceExterno);
  let sumaExponencial = expExterno;

  for (const a of Object.values(atractivoPorEquipo)) {
    sumaExponencial += Math.exp(lambda * a);
  }

  const share = sumaExponencial > 0 ? Math.exp(lambda * miAtractivoRaw) / sumaExponencial : 0;

  return { miAtractivo: miAtractivoRaw, atractivoPorEquipo, share };
}

// ── Paso 6–7: Ventas, comisiones e inventario ─────────────────
// FASE 0-A: el precio que decide el equipo es el precio facturado al cliente (incluye IVA 13%)
// Se extrae el IVA para obtener el ingreso real de la empresa (ventasBrutas sin IVA)
function calcularVentas(d, share, demandaFormal, costoUnitario, params = {}) {
  const tasaIVA = params.tasaIVA ?? 0.13;

  const inventarioDisponible = (d.inventarioInicial || 0) + (d.produccion || 0);
  const demandaAsignada      = Math.round(demandaFormal * share);
  const ventasReales         = Math.min(demandaAsignada, inventarioDisponible);
  const inventarioFinal      = inventarioDisponible - ventasReales;

  // Precio facturado al cliente (incluye IVA) → extraer IVA para obtener ingreso real
  const totalFacturado  = roundBs(ventasReales * (d.precioVenta || 0));
  const ivaDebitoVentas = roundBs(totalFacturado * tasaIVA);   // IVA que la empresa cobra al cliente para el Estado
  const ventasBrutas    = roundBs(totalFacturado - ivaDebitoVentas);  // ingreso real de la empresa sin IVA

  // Comisión: promedio si hay canal secundario
  const canalesArr = [d.canalPrincipal];
  if (d.canalSecundario && d.canalSecundario !== 'Ninguno') canalesArr.push(d.canalSecundario);

  return { inventarioDisponible, demandaAsignada, ventasReales, inventarioFinal,
           ventasBrutas, totalFacturado, ivaDebitoVentas };
}

// ── Paso 3 continuado: P&L completo ──────────────────────────
function calcularResultadosFinancieros(d, ventas, costoUnitario, gastoTotalMarketing, params, canalesCfg) {
  const { ventasBrutas, ventasReales, inventarioFinal,
          totalFacturado, ivaDebitoVentas } = ventas;  // FASE 0-C: incluye datos del precio facturado

  // Comisión canal — S3/S11: comisión se paga en caja (Modelo B)
  const canalP = canalesCfg[d.canalPrincipal] || {};
  const canalS = d.canalSecundario && d.canalSecundario !== 'Ninguno' ? canalesCfg[d.canalSecundario] : null;
  const comisionPct = canalS ? avg(canalP.comisionPct ?? 0, canalS.comisionPct ?? 0) : (canalP.comisionPct ?? 0);
  const comisiones  = roundBs(ventasBrutas * comisionPct);
  // ventasNetas temporal — se recalcula abajo con comisionesNeto (S11)
  const ventasNetas = roundBs(ventasBrutas - comisiones);  // para compatibilidad

  // costoVentas y ventasNetasReal se calculan abajo (requieren netIVA)

  // Inventario final valorizado
  const invFinalValorizado = roundBs(inventarioFinal * costoUnitario);
  const costoAlmacenamiento = roundBs(inventarioFinal * params.costoAlmacenamientoUnidad);

  // Innovación (gasto operativo)
  const gastoInnovacion = d.innovacion ? (d.montoInnovacion || 0) : 0;

  // Investigación de mercado (gasto operativo — sale de caja y del P&L)
  const gastoInvestigacion_mkt = (() => {
    const tipo = d.tipoInvestigacion || 'No';
    if (tipo === 'Básica')      return params.costoInvestigacionBasica      || 5000;
    if (tipo === 'Premium')     return params.costoInvestigacionPremium     || 12000;
    if (tipo === 'Estratégico') return params.costoInvestigacionEstrategico || 20000;
    return 0;
  })();

  // Financiamiento
  const montoP = d.montoPrestamo || 0;
  const tipoP  = d.tipoPrestamo  || 'Ninguno';
  let interesesPrestamo = 0, comisionApertura = 0;
  if (tipoP !== 'Ninguno' && montoP > 0) {
    const tasa = tipoP === 'Operativo' ? params.tasaPrestamoOperativo : params.tasaPrestamoInversion;
    interesesPrestamo = roundBs(montoP * tasa);
    comisionApertura  = roundBs(montoP * params.comisionAperturaPrestamo);
  }

  // ── Gastos operativos en P&L ────────────────────────────────────────────
  const tasaIVA_op = params.tasaIVA ?? 0.13;
  const netIVA     = 1 - tasaIVA_op;  // 0.87

  // Costo de ventas — S7: costos REALES (netIVA ya disponible)
  // S11: comisión neta en ER (×87%)
  const comisionesNeto  = roundBs(comisiones * netIVA);
  const ventasNetasReal = roundBs(ventasBrutas - comisionesNeto);
  // MP: costo sobre unidades PRODUCIDAS (d.produccion ya es produccionReal)
  const produccionPL    = d.produccion || 0;
  const cvMP     = roundBs((d.costoMPunitario || 0) * netIVA * produccionPL);
  const cvOper   = roundBs(d.costoOperarios  || 0);   // fijo: paga igual
  const cvAdmin  = roundBs(params.gastoAdminFijo || 0);  // fijo
  const cvPlanta = roundBs(params.gastoFijoPlanta || 0); // fijo
  const cvCalid  = roundBs(0.20 * (d.calidad || 5) * produccionPL); // S10
  const costoVentas    = roundBs(cvMP + cvOper + cvAdmin + cvPlanta + cvCalid);
  const utilidadBruta  = roundBs(ventasNetasReal - costoVentas);

  // Gastos CON factura → precio neto en P&L
  const gastoPublicidad     = roundBs((d.publicidad         || 0) * netIVA);
  const gastoPromocion      = roundBs((d.promocion          || 0) * netIVA);
  const gastoEventos        = roundBs((d.eventos            || 0) * netIVA);
  const gastoMktRedes       = roundBs((d.marketingRedes     || 0) * netIVA);
  const gastoRRPP           = roundBs((d.relacionesPublicas || 0) * netIVA);
  const gastoInnovacionNeto = roundBs(gastoInnovacion            * netIVA);
  const gastoInvMktNeto     = roundBs(gastoInvestigacion_mkt     * netIVA);
  // comisiones: se descuentan de ventasBrutas para llegar a ventasNetas (ya aplicado)
  // Su precio neto ya está reflejado en ventasNetas

  // ── Fix caja: pagoProduccion usa precio BRUTO al proveedor ──────────────
  // En el P&L el CU usa MP neto (×87%) — correcto para la utilidad
  // En la CAJA se paga el precio bruto al proveedor (MP sin descontar IVA)
  // d.costoMPunitario = costoBase × pctMP × factorProveedor (precio bruto sin IVA descontado)
  // El IVA crédito de MP sale de caja con el pago al proveedor y se recupera via ivaAPagar
  const costoMPunitario_bruto = d.costoMPunitario || 0;  // d — no dEnriquecido
  const ivaCredMPunit = roundBs(costoMPunitario_bruto * (params.tasaIVA ?? 0.13));
  const cuBruto = roundBs(costoUnitario + ivaCredMPunit);  // CU bruto para caja

  // Gastos SIN factura → precio completo en P&L
  const gastoCostoVend  = d.costoVendedores || 0;   // sueldos: relación laboral
  const gastoOperarios  = d.costoOperarios  || 0;   // sueldos: relación laboral
  const gastoAdminFijo  = params.gastoAdminFijo;     // mixto: simplificado sin IVA
  const gastoPlantaFijo = params.gastoFijoPlanta;    // mixto: simplificado sin IVA
  const gastoDepre      = params.depreciacionTrimestral; // no es compra del período
  const gastoAlmacen    = costoAlmacenamiento;       // bodega (con factura, pero pequeño)

  let gastosOp = roundBs(
    gastoPublicidad  + gastoPromocion  + gastoEventos  +
    gastoMktRedes    + gastoRRPP       +
    gastoCostoVend   + gastoOperarios  +
    gastoAdminFijo   + gastoPlantaFijo + gastoDepre    +
    gastoAlmacen     +
    gastoInnovacionNeto + gastoInvMktNeto
    // NOTA: interesesPrestamo y comisionApertura van en gastoFinanciero (post-EBIT)
  );

  // Gasto financiero separado (intereses y comisiones de deuda)
  const gastoFinanciero = roundBs(interesesPrestamo + comisionApertura);

  // EBIT = Earnings Before Interest & Taxes (correcto: sin gastos financieros)
  let utilidadNeta_operat = roundBs(utilidadBruta - gastosOp - gastoFinanciero);
  // Los impuestos reducen la utilidad neta (IS correcto):
  // Se calculan más abajo (IVA, IT, IUE) y se descuentan aquí después
  let utilidadNeta = utilidadNeta_operat;  // se actualizará post-impuestos

  // Flujo de caja
  // ivaDebito necesario aquí — adelantar declaración
  const ivaDebito  = ivaDebitoVentas;  // totalFacturado × tasaIVA (Fase 0)
  const cxcCobroEsta  = roundBs((d.cxcInicial || 0) / Math.max(1, params.plazoCobro));
  const baseCobroReal = roundBs(ventasNetas + ivaDebito);
  const cobrosContado = roundBs(baseCobroReal * params.pctVentasContado + cxcCobroEsta);

  // Produccion: pago de costos de producción (solo MP y conversión, sin CxP por simplicidad)
  // S7: pagoProduccion ELIMINADO — los costos reales de producción
  // salen individualmente: pagoMP (bruto) + operarios + admin + planta
  // La variable se mantiene para compatibilidad con el return pero = 0
  const pagoProduccion = 0;  // S7: eliminado — no hay pago único de producción
  const pagoMPbruto    = roundBs((d.costoMPunitario || 0) * (d.produccion || 0)); // S4: MP bruto
  const pagoMktTotal   = gastoTotalMarketing; // ya incluye vendedores
  const pagoAdmin      = params.gastoAdminFijo;
  const pagoPlanta     = params.gastoFijoPlanta;
  // Nota: depreciación no es salida de caja
  const pagoInnovacion = gastoInnovacion;
  const pagoAlmacen    = costoAlmacenamiento;
  const pagoIntereses  = interesesPrestamo;
  const pagoApertura   = comisionApertura;

  // ── FASE 0-D + FASE 2: IVA Bolivia (Ley 843) — crédito fiscal completo ─────
  // ivaDebito: IVA cobrado al cliente sobre ventas (extraído del precio facturado)
  // ivaCredito: IVA pagado a proveedores en TODAS las compras con factura
  //   • Insumos materiales (costoBase + costoCanal) × produccion  → factura proveedor
  //   • Servicios externos de marketing                           → factura agencia
  //   • Investigación de mercado                                  → factura consultora
  //   • Innovación (servicio externo)                             → factura proveedor
  //   • Comisiones de canal                                       → factura distribuidor
  //   • Comisión apertura préstamo                                → factura banco
  //   • Almacenamiento externo                                    → factura bodega
  //   SIN IVA crédito: sueldos (relación laboral), depreciación,
  //                    gastos admin/planta fijos (mixtos — simplificado sin IVA),
  //                    intereses (exentos Ley 843 Art. 2)
  const tasaIVA    = params.tasaIVA ?? 0.13;

  // ── Base de insumos materiales: solo componentes con factura de proveedor ──
  // Post rediseño MP: el CU tiene nueva estructura
  //   costoTrans   = costoBase × (1 − pctMP)   → sin factura externa
  //   componenteMP = costoBase × pctMP × factorCosto → factura proveedor
  //   costoCalidad → sin factura externa (proceso interno)
  //   costoCanal   → CON factura (comisiones ya están en baseServicios)
  //   efInnovacion → con factura si es externo (ya en baseServicios)
  // Por tanto baseInsumos = solo componenteMP × pares producidos
  // FIX 3: costoBaseProducto viene en d (enriquecido en ejecutarSimulador)
  // Base insumos = costoMPunitario × (produccion + inventarioFinal)
  // costoMPunitario = costoBase × pctMP × factorCosto (calculado en ejecutarSimulador)
  const costoMPporPar = d.costoMPunitario || 0;
  const baseInsumos   = roundBs(costoMPporPar * ((d.produccion || 0) + inventarioFinal));

  // ── Servicios externos con factura — base IVA crédito ───────────────────
  // IVA crédito = monto_bruto × 13%   (monto bruto = lo que se pagó al proveedor)
  // El crédito se calcula sobre el precio BRUTO (con IVA incluido en el monto)
  // porque así funciona la factura boliviana: precio neto + 13% IVA
  const baseServicios = roundBs(
    (d.publicidad          || 0) +   // monto bruto pagado a agencia
    (d.promocion           || 0) +
    (d.eventos             || 0) +
    (d.marketingRedes      || 0) +
    (d.relacionesPublicas  || 0) +
    gastoInvestigacion_mkt       +   // monto bruto del reporte
    gastoInnovacion              +   // monto bruto I+D externo
    comisiones                   +   // monto bruto comisión distribuidor
    comisionApertura             +   // monto bruto comisión banco
    costoAlmacenamiento              // monto bruto almacenaje
  );

  // baseInsumos también usa el monto bruto (costoMPporPar = precio factura proveedor)

  const ivaCredito = roundBs((baseInsumos + baseServicios) * tasaIVA);
  const ivaAPagar  = Math.max(0, roundBs(ivaDebito - ivaCredito));
  const pagoIVA    = ivaAPagar;  // sale de CAJA (no del P&L)

  // IT (3% sobre totalFacturado = precio con IVA) — base correcta Ley 843: ingresos brutos
  const tasaIT      = params.tasaIT ?? 0.03;
  const impuestoIT  = roundBs((totalFacturado || ventasBrutas / (1 - tasaIVA / (1 + tasaIVA))) * tasaIT);

  // IUE (25% sobre utilidad gravable) — pago anual cada 4 trimestres
  // Base limpia post Fase 0: utilidad_operat − IT solamente
  // IVA ya NO está en el P&L → no se resta de la base del IUE
  const tasaIUE     = params.tasaIUE ?? 0.25;
  const periodosIUE = params.periodosIUE ?? 4;
  const rondaActual = d.rondaNumero ?? 0;
  const utilGravable = Math.max(0, roundBs(utilidadNeta_operat - impuestoIT));  // FASE 3+0: IT ya es el único impuesto en P&L
  const impuestoIUE  = (rondaActual > 0 && rondaActual % periodosIUE === 0)
    ? roundBs(utilGravable * tasaIUE)
    : 0;
  const provisionIUE = roundBs(utilGravable * tasaIUE / periodosIUE);

  // ── FASE 4: Compensación IUE → IT (DS 5563) ──────────────────────────────
  // El IUE efectivamente pagado genera un crédito que se compensa contra el IT
  // de los trimestres siguientes, hasta agotar el saldo disponible.
  // El IT sigue siendo GASTO del período (principio devengado) aunque no salga de caja.
  // Solo el PAGO efectivo de caja se reduce por la compensación.
  const saldoIUEant      = d.saldoIUEcompensable ?? 0;  // saldo del período anterior
  const compensacionIT   = roundBs(Math.min(impuestoIT, saldoIUEant));  // cuánto del IT se cubre con IUE
  const ITefectivoCaja   = roundBs(impuestoIT - compensacionIT);         // lo que sale de caja
  // El saldo se recarga cuando se paga IUE (en ronda múltiplo de periodosIUE)
  // y se reduce por la compensación usada este período
  const saldoIUEfinal    = roundBs(saldoIUEant - compensacionIT + impuestoIUE);

  const pagoIT  = ITefectivoCaja;   // CAJA: solo lo que no se pudo compensar
  const pagoIUE = impuestoIUE;      // CAJA: IUE se paga siempre que corresponde

  // P&L: IVA NO es gasto — solo IT e IUE son gastos del período (devengado)
  // Nota: IT es gasto completo aunque parte salga de compensación (devengado ≠ percibido)
  const totalImpuestos = roundBs(impuestoIT + impuestoIUE);  // FASE 0+4
  utilidadNeta = roundBs(utilidadNeta_operat - totalImpuestos);

  const pagoOperarios  = d.costoOperarios || 0;  // S6: operarios salen de caja
  const pagoCalidad    = roundBs(0.20 * (d.calidad || 5) * (d.produccion || 0)); // S10: calidad
  const pagoComisiones = comisiones;             // S3: comisión sale de caja
  const pagoMP         = pagoMPbruto;            // S4: MP bruto sale de caja

  const pagoInvestigacion = gastoInvestigacion_mkt;  // sale de caja este trimestre

  // OPCIÓN A — IVA pago diferido (realidad boliviana):
  //   El IVA del PERÍODO ACTUAL es un pasivo al cierre — se paga el trimestre siguiente
  //   El IVA del PERÍODO ANTERIOR (d.ivaAPagarAnterior) sale de caja este trimestre
  const pagoIVAPeriodoAnterior = roundBs(d.ivaAPagarAnterior ?? 0);  // pago del IVA anterior

  // Las comisiones del canal ya fueron retenidas por el canal al momento del cobro
  // La empresa NUNCA recibe ese dinero — el canal cobra al cliente y entrega el neto
  // Por tanto NO hay pagoComisiones en totalPagos
  // cobrosContado ya refleja el neto recibido: (ventasNetas + ivaDebito) × pctContado

  // S7: totalPagos con pagos REALES individuales (sin pagoProduccion)
  const totalPagos = roundBs(
    pagoMP           +  // S4: MP bruto al proveedor
    pagoComisiones   +  // S3: comisión al canal
    pagoMktTotal     +  // S5: mkt bruto + vendedores
    pagoAdmin        +  // S6: admin fijo
    pagoPlanta       +  // S6: planta fija
    pagoInnovacion   +  // S9: innovación bruto
    pagoCalidad      +  // S10: calidad
    pagoAlmacen      +
    pagoIntereses    +
    pagoApertura     +
    pagoIVAPeriodoAnterior +  // IVA trimestre anterior
    pagoIT + pagoIUE +
    pagoOperarios    +
    pagoInvestigacion);

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
    gastosOp         = roundBs(gastosOp + interesSobregiro);  // para P&L total
  }
  const cajaFinal = cajaPreliminar;

  // CxC final = CxC anterior no cobrado + nuevas ventas a crédito
  // Base = ventasNetas + ivaDebito (ingreso real sin comisiones del canal)
  const cxcNuevo     = roundBs(baseCobroReal * params.pctVentasCredito);
  const cxcNoCobrObj = roundBs((d.cxcInicial || 0) - cxcCobroEsta);
  const cxcFinal     = roundBs(Math.max(0, cxcNoCobrObj) + cxcNuevo);

  // Deuda final = préstamos + sobregiro (el interés del sobregiro va como pasivo separado)
  const amortizacion = d.amortizacion || 0;
  const deudaPrestamos = roundBs(Math.max(0, (d.deudaInicial || 0) + ingresoPrestamo - amortizacion));
  const deudaFinal     = roundBs(deudaPrestamos + sobregiro + interesSobregiro);

  // Activos fijos netos
  const afNetos = roundBs((d.activosFijosIniciales || params.activosFijosIniciales) - params.depreciacionTrimestral);

  // Balance General — OPCIÓN A: IVA pago diferido (realidad boliviana)
  //   Al cierre del trimestre el IVA neto es un PASIVO (obligación devengada, no pagada aún)
  //   El pago al Estado ocurre en el trimestre siguiente (pagoIVAPeriodoAnterior)
  //   ivaAPagar aparece en Pasivo Corriente del Balance
  //   NO incluir ivaCredito en totalActivos (ya compensado en el asiento de liquidación)
  const totalActivos    = roundBs(cajaFinal + cxcFinal + invFinalValorizado + afNetos);
  const capitalContable = roundBs(params.capitalContable || params.capitalInicial || (params.activosFijosIniciales + params.cajaInicial));
  const resultadoAcumulado = roundBs((d.resultadoAcumuladoAnterior || 0) + utilidadNeta);
  const patrimonio      = roundBs(capitalContable + resultadoAcumulado);
  // totalPasivos incluye ivaAPagar como pasivo corriente pendiente de pago
  const totalPasivos    = roundBs(deudaFinal + ivaAPagar);

  // Brand Equity acumulativo — Etapa 2.1
  const brandEquityFinal = calcularBrandEquity(
    d.brandEquityInicial,
    ventas.ventasReales > 0
      ? (ventas.ventasReales / Math.max(1, ventas.demandaAsignada || 1))
      : 0,
    utilidadNeta,
    params.tasaDecaimiento
  );

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
    interesesPrestamo, comisionApertura, interesSobregiro, gastoFinanciero,
    gastosOp, utilidadNeta,

    // KPIs calculados
    ebit:         roundBs(utilidadNeta_operat),  // EBIT = resultado antes de impuestos
    roiMarketing: pagoMktTotal > 0 ? roundBs(ventasNetas / pagoMktTotal) : 0,

    // Flujo de Efectivo
    cajaInicial, cobrosContado, ingresoPrestamo,
    pagoProduccion, pagoMPbruto, pagoCalidad, pagoComisiones,
    pagoMktTotal, pagoAdmin, pagoPlanta,
    pagoOperarios, pagoMP,
    pagoInnovacion, pagoAlmacen, pagoIntereses, pagoApertura,
    totalPagos, sobregiro, cajaFinal,

    // Balance
    cxcFinal, invFinalValorizado, afNetos,
    totalActivos, deudaFinal, totalPasivos,
    capitalContable, resultadoAcumulado, patrimonio,

    // Etapa 3.3: obligaciones fiscales IVA
    ivaDebito, ivaCredito, ivaAPagar, pagoIVA,

    // Etapa 3.4: IT e IUE + compensación IUE→IT (Fase 4)
    impuestoIT, impuestoIUE, provisionIUE, totalImpuestos, pagoIT, pagoIUE,
    // IVA pago diferido (Opción A)
    pagoIVAPeriodoAnterior,
    compensacionIT, ITefectivoCaja, saldoIUEfinal, saldoIUEant,

    // Etapa 3.1: materia prima (stockMPFinal se calcula en ejecutarSimulador)
    stockMPFinal:           d.stockMPFinal ?? null,
    pedidosPendientesResta: d.pedidosPendientesResta ?? [],

    // Etapa 3.2: operarios
    operariosFinales:  d.operariosFinales  ?? d.operariosIniciales  ?? 4,
    capacidadEfectiva: d.capacidadEfectiva ?? (params.productividadBase ?? 440) * (d.operariosIniciales ?? 4),
    costoOperarios:    d.costoOperarios    ?? 0,

    // Para propagación
    inventarioFinal, vendedoresFinales: d.vendedoresFinales || d.vendedoresIniciales,
    activosFijosNetos: afNetos,
    costoUnitario, comisionPct,
    brandEquityFinal,
  };
}

// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────
function ejecutarSimulador(decisiones, cfg) {
  const { params, tiposProducto, canales, segmentos, afinidadMatrix,
          demandaBaseAnteriorMap = {}, shock = null } = cfg;  // Etapa 2.2 + shocks
  decisiones = expandirDecisionesMultiproducto(decisiones);

  // Calcular demanda formal de cada segmento (con crecimiento acumulado + shock)
  const mercadoSegmentos = calcularMercadoSegmentos(params, segmentos, demandaBaseAnteriorMap, shock);
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
      d, equiposEnSeg, seg, afinidadMatrix, canales, vendedoresPorEquipo, params  // Etapa 2.3
    );
    atractivoEquipos[d.equipo] = miAtractivo;
    sharesPorEquipo[d.equipo]  = share;
    // Guardar todos los atractivos del segmento
    Object.assign(atractivoEquipos, atractivoPorEquipo);
  });

  // Etapa 3.1: pasar proveedores en params para procesarPedidosMP
  const paramsConProveedores = { ...params, _proveedores: cfg.proveedores || [] };

  // Calcular resultados financieros completos
  const resultados = decisiones.map(d => {
    // Producto vacío = equipo no decidió
    // Se cobran costos fijos pero no hay ventas
    if (!d.producto || !d.precioVenta || !d.segmentoObjetivo) {
      const vend     = Math.max(1, d.vendedoresIniciales||2);
      const oper     = Math.max(1, d.operariosIniciales||4);
      // Usar parámetros reales de la industria — sin fallbacks hardcodeados
      const dep      = params.depreciacionTrimestral || 0;
      const gAdmin   = params.gastoAdminFijo         || 0;
      const gPlanta  = params.gastoFijoPlanta         || 0;
      const gVend    = vend * (params.sueldoTrimestralVendedor || 0);
      const gOper    = oper * (params.costoOperario            || 0);
      const gFijo       = gAdmin + gPlanta + gVend + gOper + dep;
      // Intereses sobre deuda existente
      const tasaTrim    = (params.tasaInteresTrimestral||0.055);
      const intDeuda    = Math.round((d.deudaInicial||0) * tasaTrim);
      const totalGastos = gFijo + intDeuda;
      // CONTABILIDAD: depreciación es gasto NO desembolsable
      // Reduce utilidad y activos fijos pero NUNCA sale de caja
      // totalPagosEfectivo excluye depreciación
      const totalPagosEfectivo = (gAdmin + gPlanta + gVend + gOper + intDeuda);
      const cobrosAnterior = d.cxcInicial || 0;
      const cajaCalc = (d.cajaInicial||0) + cobrosAnterior - totalPagosEfectivo;
      // Sobregiro si caja negativa
      const sobregiro   = cajaCalc < 0 ? Math.abs(cajaCalc) : 0;
      const cajaFinal   = cajaCalc < 0 ? 0 : cajaCalc;
      const intSobregiro= Math.round(sobregiro * tasaTrim);
      const deudaFinal  = (d.deudaInicial||0) + sobregiro + intDeuda + intSobregiro;
      const afNetos     = Math.max(0, (d.activosFijosIniciales||80000) - dep);
      const totalActivos= cajaFinal + afNetos;
      const utilidadNeta= -(totalGastos + intSobregiro);
      const patrimonio  = (d.cajaInicial||0) + (d.activosFijosIniciales||80000)
                         + (d.resultadoAcumuladoAnterior||0) + utilidadNeta - (d.deudaInicial||0);
      return {
        // Identificadores
        equipo:          d.equipo,
        equipoOriginal:  d.equipoOriginal || d.equipo,
        equipoNombre:    d.equipoNombre,
        productoId:      d.productoId || 'prod_1',
        // Ventas — en cero
        ventasBrutas: 0, ventasNetas: 0, ventasReales: 0, costoVentas: 0,
        utilidadBruta: 0, comisiones: 0, precioVenta: 0, produccion: 0,
        // Estado de Resultados
        gastoAdminFijo:   gAdmin,
        gastoFijoPlanta:  gPlanta,
        costoVendedores:  gVend,
        pagoOperarios:    gOper,
        depreciacion:     dep,
        costoAlmacenamiento: 0,
        gastosOp:         gFijo,
        gastoFinanciero:  intDeuda + intSobregiro,
        interesesPrestamo: intDeuda,
        interesSobregiro:  intSobregiro,
        ebit:             -gFijo,
        totalImpuestos:   0, ivaAPagar: 0, impuestoIT: 0, impuestoIUE: 0,
        utilidadNeta,
        // Balance General
        cajaInicial:      d.cajaInicial || 0,
        cajaFinal,
        cxcInicial:       d.cxcInicial || 0,
        cxcFinal:         0,
        invFinalValorizado: 0, inventarioFinal: 0,
        activosFijosIniciales: d.activosFijosIniciales || 80000,
        afNetos,
        totalActivos,
        deudaInicial:     d.deudaInicial || 0,
        deudaFinal,
        resultadoAcumuladoAnterior: d.resultadoAcumuladoAnterior || 0,
        resultadoAcumulado: (d.resultadoAcumuladoAnterior||0) + utilidadNeta,
        patrimonio:       Math.max(0, patrimonio),
        // Flujo de Efectivo
        cobrosContado:    cobrosAnterior,
        ingresoPrestamo:  sobregiro,
        totalPagos:       totalPagosEfectivo,
        pagoProduccion:   0,
        pagoMktTotal:     0,
        pagoGastosAdmin:  gAdmin,
        pagoGastosPlanta: gPlanta,
        pagoVendedores:   gVend,
        pagoOperarios2:   gOper,
        pagoIntereses:    intDeuda + intSobregiro,
        pagoAlmacenamiento: 0,
        // RRHH
        vendedoresIniciales: d.vendedoresIniciales || vend,
        vendedoresFinales:   vend,
        operariosIniciales:  d.operariosIniciales || oper,
        operariosFinales:    oper,
        // Otros
        capitalContable:  680000,  // capital inicial fijo del simulador
        resultadoAcumuladoAnterior: d.resultadoAcumuladoAnterior || 0,
        resultadoAcumulado: (d.resultadoAcumuladoAnterior||0) + utilidadNeta,
        brandEquityInicial:  d.brandEquityInicial || 50,
        brandEquityFinal:    Math.max(0, (d.brandEquityInicial||50) - 2),
        costoUnitario:    0,
        shareReal:        0,
        sinDecision:      true,
        sobregiro,
      };
    }
    const seg        = segmentoPorNombre[d.segmentoObjetivo];
    const rondaNum   = cfg.rondaNumero || 1;   // Etapa 3.1: número de ronda actual

    // Etapa 3.1: procesar pedidos de MP y calcular stock disponible
    // Etapa 3.2: calcular capacidad efectiva de operarios
    const opData = calcularOperarios(d, paramsConProveedores);

    const mpData = procesarPedidosMP(d, rondaNum, paramsConProveedores);
    const unidMP = paramsConProveedores.unidadesMPporUnidad ?? 1;
    const produccionMaxMP = mpData.stockMPDisponible > 0
      ? Math.floor(mpData.stockMPDisponible / unidMP)
      : Infinity;   // si no hay MP configurada, sin restricción (retrocompat.)
    // Etapa 3.2: producción limitada por capacidad efectiva (operarios) y MP
    const produccionReal = Math.min(
      d.produccion || 0,
      opData.capacidadEfectiva,        // límite operarios
      produccionMaxMP,                 // límite MP
      paramsConProveedores.capacidadMaxProduccion || Infinity  // límite planta
    );
    d = {
      ...d,
      rondaNumero:            rondaNum,    // Etapa 3.4: para cálculo IUE
      produccion:             produccionReal,
      operariosFinales:       opData.operariosFinales,
      capacidadEfectiva:      opData.capacidadEfectiva,
      costoOperarios:         opData.costoOperarios,
      stockMPFinal:           Math.max(0, mpData.stockMPDisponible - produccionReal * unidMP),
      pedidosPendientesResta: mpData.pedidosPendientesResta,
      pagoMP:                 mpData.pagoMP,
    };

    // Costo MP ajustado por factorCosto del proveedor
    // costoMPbase = costoBase × pctMateriaPrima (costo estándar de materiales)
    // costoMPunit = costoMPbase × factorCosto_proveedor
    //   → se pasa a calcularCostoUnitario para reemplazar la porción MP del costoBase
    const provData_cu   = (paramsConProveedores._proveedores || []).find(
      p => p.id === d.proveedorElegido || p.nombre === d.proveedorElegido
    );
    const pctMP_cu      = paramsConProveedores.pctMateriaPrima ?? 0.40;
    const tp_cu         = tiposProducto[d.producto] || tiposProducto[d.tipoProducto];
    const costoBase_cu  = tp_cu?.costoBase ?? 0;
    const costoMPbase   = roundBs(costoBase_cu * pctMP_cu);
    const factorCosto   = provData_cu?.factorCosto ?? 1.0;
    const costoMPunit   = roundBs(costoMPbase * factorCosto);

    const cu         = calcularCostoUnitario(d, tiposProducto, canales, paramsConProveedores, costoMPunit);
    const share      = sharesPorEquipo[d.equipo] || 0;
    const demFormal  = seg?.demandaFormal || 0;
    const ventas     = calcularVentas(d, share, demFormal, cu, paramsConProveedores);  // FASE 0-B: params para extracción IVA
    // FIX: enriquecer d con campos que necesita calcularResultadosFinancieros
    const pctMP_enr  = paramsConProveedores.pctMateriaPrima ?? 0.40;
    const cbProd     = tiposProducto[d.producto]?.costoBase ?? 0;
    const dEnriquecido = {
      ...d,
      costoMPunitario:   costoMPunit,
      costoBaseProducto: cbProd,
      costoCalidadUnit:  roundBs(0.20 * (d.calidad || 5)),
    };
    const fin        = calcularResultadosFinancieros(dEnriquecido, ventas, cu, dEnriquecido.gastoTotalMarketing, paramsConProveedores, canales);

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
      // Desglose del costo unitario para KPIs y reportes
      costoMPunitario:     costoMPunit,
      costoBaseProducto:   dEnriquecido.costoBaseProducto,
      costoCalidadUnit:    dEnriquecido.costoCalidadUnit,
      proveedorElegido:    d.proveedorElegido || null,
      // Desglose visual correcto post-rediseño MP
      costoTransformacion: roundBs(cbProd * (1 - pctMP_enr)),
      // efInnovacion para el desglose
      efInnovacionUnit: (() => {
        if (!d.innovacion || !d.montoInnovacion || !d.produccion) return 0;
        const bf = d.montoInnovacion / d.produccion;
        if (d.tipoInnovacion === 'Producto') return roundBs(+bf * (paramsConProveedores.factorInnovacionProducto ?? 0.2));
        if (d.tipoInnovacion === 'Proceso')  return roundBs(-bf * (paramsConProveedores.factorInnovacionProceso ?? 0.2));
        return 0;
      })(),
      // costoCanal = CU − trans − MPneto − calidad − efInnovacion
      costoCanal_calc: (() => {
        const trans    = roundBs(cbProd * (1 - pctMP_enr));
        const mpNeto   = roundBs(costoMPunit * (1 - (paramsConProveedores.tasaIVA ?? 0.13)));
        const calidad  = roundBs(0.20 * (d.calidad || 5));
        const ef       = (() => {
          if (!d.innovacion || !d.montoInnovacion || !d.produccion) return 0;
          const bf = d.montoInnovacion / d.produccion;
          if (d.tipoInnovacion === 'Producto') return roundBs(+bf * (paramsConProveedores.factorInnovacionProducto ?? 0.2));
          if (d.tipoInnovacion === 'Proceso')  return roundBs(-bf * (paramsConProveedores.factorInnovacionProceso ?? 0.2));
          return 0;
        })();
        return Math.max(0, roundBs(cu - trans - mpNeto - calidad - ef));
      })(),
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
    // Producto vacío = equipo no decidió — retornar ceros sin error
    if (!d.producto || !d.precioVenta || !d.segmentoObjetivo) {
      return {
        equipo:          d.equipo,
        equipoOriginal:  d.equipoOriginal || d.equipo,
        equipoNombre:    d.equipoNombre,
        productoId:      d.productoId,
        producto:        d.producto || '',
        segmento:        d.segmentoObjetivo || '',
        demandaFormal:   0,
        shareEstimado:   0,
        demandaAsignada: 0,
        inventario:      0,
        ventasEstimadas: 0,
        costoUnitario:   0,
        confirmado:      false,
        sinDecision:     true,
      };
    }
    const seg = segmentoPorNombre[d.segmentoObjetivo];
    if (!seg) return { equipo: d.equipo, equipoNombre: d.equipoNombre, error: 'Segmento no encontrado' };

    const equiposEnSeg = equiposPorSegmento[d.segmentoObjetivo] || [];
    const { share, miAtractivo } = calcularParticipacion(
      d, equiposEnSeg, seg, afinidadMatrix, canales, vendedoresPorEquipo, params
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
      equipoOriginal:      d.equipoOriginal || d.equipo,   // ← agregar esta línea
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

/**
 * Pre‑simulación consolidada.
 * Filtra bots, expande decisiones, calcula y consolida por empresa.
 */
function calcularPreSimulacionConsolidada(decisiones, cfg) {
  // Filtrar solo equipos humanos
  const decisionesHumanos = (decisiones || []).filter(d => !d.isBot);
  if (decisionesHumanos.length === 0) {
    return { mercadoSegmentos: [], resultado: [] };
  }

  // Expandir productos (cada decisión de empresa se convierte en una por producto)
  const expandidas = expandirDecisionesMultiproducto(decisionesHumanos);

  // Calcular la pre‑simulación normal (con equipos expandidos)
  const preSim = calcularPreSimulacion(expandidas, cfg);

  // Consolidar por empresa original
  const consolidado = {};
  preSim.resultado.forEach(r => {
    const original = r.equipoOriginal || r.equipo;
    if (!consolidado[original]) {
      consolidado[original] = {
        equipo: original,
        equipoNombre: r.equipoNombre,
        segmento: r.segmento,
        producto: r.producto,
        shareEstimado: 0,
        atractivo: 0,
        demandaFormal: r.demandaFormal,
        demandaAsignada: 0,
        ventasEstimadas: 0,
        inventarioInicial: 0,
        produccion: 0,
        inventarioDisponible: 0,
        inventarioFinalEst: 0,
        costoUnitario: 0,
        confirmado: false,
      };
    }
    const c = consolidado[original];
    c.demandaAsignada += r.demandaAsignada || 0;
    c.ventasEstimadas += r.ventasEstimadas || 0;
    c.inventarioDisponible += r.inventarioDisponible || 0;
    c.inventarioFinalEst += r.inventarioFinalEst || 0;
    c.produccion += r.produccion || 0;
    c.inventarioInicial += r.inventarioInicial || 0;
    // share y atractivo: se promedian al final
    c.shareEstimado += r.shareEstimado || 0;
    c.atractivo += r.atractivo || 0;
    c.costoUnitario += r.costoUnitario || 0;
    c._count = (c._count || 0) + 1;
  });

  // Calcular promedios
  const resultado = Object.values(consolidado).map(c => {
    const count = c._count || 1;
    return {
      ...c,
      shareEstimado: c.shareEstimado / count,
      atractivo: c.atractivo / count,
      costoUnitario: c.costoUnitario / count,
    };
  });

  return {
    mercadoSegmentos: preSim.mercadoSegmentos,
    resultado,
  };
}

module.exports = {
  ejecutarSimulador,
  calcularMercadoSegmentos,
  calcularPreSimulacion,
  calcularPreSimulacionConsolidada,
  expandirDecisionesMultiproducto,
  consolidarPorEmpresa,
};
