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
function calcularMercadoSegmentos(params, segmentos, demandaBaseAnteriorMap = {}) {
  return segmentos.map(seg => {
    // Etapa 2.2: aplicar crecimiento sobre la demanda de la ronda anterior
    const baseAnterior = demandaBaseAnteriorMap[seg.nombre] ?? seg.demandaBase;
    const tasa         = seg.tasaCrecimiento ?? 0;
    const demandaBaseT = Math.round(baseAnterior * (1 + tasa));
    return {
      nombre:              seg.nombre,
      demandaBase:         demandaBaseT,          // actualizada con crecimiento
      demandaBaseOriginal: seg.demandaBase,        // valor estático del JSON
      pctContrabando:      seg.pctContrabando,
      demandaFormal:       Math.round(demandaBaseT * (1 - seg.pctContrabando)),
      tendencia:           seg.tendencia,
      tasaCrecimiento:     tasa,
      descripcion:         seg.descripcion,
      indiceExterno:       seg.indiceExterno,
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
    const provData = (params._proveedores || []).find(p => p.id === proveedor || p.nombre === proveedor);
    const costoUnitMP = provData?.costoMP ?? 0;
    const leadTime    = provData?.leadTime ?? 1;
    pagoMP = roundBs(cantidadPedida * costoUnitMP);
    if (leadTime === 0) {
      stockRecibido += cantidadPedida;   // entrega inmediata
    } else {
      pendientesResta.push({ rondaEntrega: rondaNumero + leadTime, cantidad: cantidadPedida, costoMP: costoUnitMP });
    }
  }

  const stockMPDisponible = stockInicial + stockRecibido;
  return { stockMPDisponible, pedidosPendientesResta: pendientesResta, pagoMP };
}

// ── Paso 3: Costo unitario ─────────────────────────────────────
// CU = costoBase + (0.20 × calidad) + costoCanal_prom + efecto_innovacion
function calcularCostoUnitario(d, tiposProducto, canales, params) {
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

  return roundBs(costoBase + costoCalidad + costoCanal + efInnovacion);
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
  // Gastos operativos SIN gastos financieros (para calcular EBIT correcto)
  let gastosOp = roundBs(
    (d.publicidad         || 0) +
    (d.promocion          || 0) +
    (d.eventos            || 0) +
    (d.marketingRedes     || 0) +
    (d.relacionesPublicas || 0) +
    (d.costoVendedores    || 0) +
    (d.costoOperarios     || 0) +   // Etapa 3.2: costo de operarios
    params.gastoAdminFijo      +
    params.gastoFijoPlanta     +
    params.depreciacionTrimestral +
    costoAlmacenamiento        +
    gastoInnovacion
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

  // Etapa 3.3: IVA Bolivia (13%)
  const tasaIVA   = params.tasaIVA ?? 0.13;
  const ivaDebito  = roundBs(ventasNetas * tasaIVA);
  const ivaCredito = roundBs(roundBs((d.produccion || 0) * costoUnitario) * tasaIVA);
  const ivaAPagar  = Math.max(0, roundBs(ivaDebito - ivaCredito));
  const pagoIVA    = ivaAPagar;

  // Etapa 3.4: IT (3% sobre ventas brutas) — pago trimestral
  const tasaIT      = params.tasaIT ?? 0.03;
  const impuestoIT  = roundBs(ventasBrutas * tasaIT);

  // Etapa 3.4: IUE (25% sobre utilidad gravable) — pago anual (cada 4 trim.)
  // Se provisiona trimestralmente; el pago real ocurre en el trimestre múltiplo de 4.
  const tasaIUE       = params.tasaIUE ?? 0.25;
  const periodosIUE   = params.periodosIUE ?? 4;
  const rondaActual   = d.rondaNumero ?? 0;
  const utilGravable  = Math.max(0, roundBs(utilidadNeta - ivaAPagar - impuestoIT));
  const impuestoIUE   = (rondaActual > 0 && rondaActual % periodosIUE === 0)
    ? roundBs(utilGravable * tasaIUE)
    : 0;
  const provisionIUE  = roundBs(utilGravable * tasaIUE / periodosIUE); // provisión trimestral
  const pagoIT        = impuestoIT;
  const pagoIUE       = impuestoIUE;

  // Obligación fiscal total del trimestre (sale de caja Y del P&L)
  const totalImpuestos = roundBs(ivaAPagar + impuestoIT + impuestoIUE);
  // FIX balance: impuestos reducen utilidadNeta (correcto para P&L y Balance)
  utilidadNeta = roundBs(utilidadNeta_operat - totalImpuestos);

  const pagoOperarios  = d.costoOperarios || 0;  // FIX balance: costo operarios sale de caja
  const pagoMP         = d.pagoMP         || 0;  // FIX balance: pago MP sale de caja

  const totalPagos = roundBs(pagoProduccion + pagoMktTotal + pagoAdmin + pagoPlanta +
    pagoInnovacion + pagoAlmacen + pagoIntereses + pagoApertura
    + pagoIVA + pagoIT + pagoIUE
    + pagoOperarios + pagoMP);  // +operarios (3.2) +MP (3.1) +IVA (3.3) +IT+IUE (3.4)

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
    pagoProduccion, pagoMktTotal, pagoAdmin, pagoPlanta,
    pagoOperarios, pagoMP,
    pagoInnovacion, pagoAlmacen, pagoIntereses, pagoApertura,
    totalPagos, sobregiro, cajaFinal,

    // Balance
    cxcFinal, invFinalValorizado, afNetos,
    totalActivos, deudaFinal, totalPasivos,
    capitalContable, resultadoAcumulado, patrimonio,

    // Etapa 3.3: obligaciones fiscales IVA
    ivaDebito, ivaCredito, ivaAPagar, pagoIVA,

    // Etapa 3.4: IT e IUE
    impuestoIT, impuestoIUE, provisionIUE, totalImpuestos, pagoIT, pagoIUE,

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
          demandaBaseAnteriorMap = {} } = cfg;           // Etapa 2.2
  decisiones = expandirDecisionesMultiproducto(decisiones);

  // Calcular demanda formal de cada segmento (con crecimiento acumulado)
  const mercadoSegmentos = calcularMercadoSegmentos(params, segmentos, demandaBaseAnteriorMap);
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
      const dep      = params.depreciacionTrimestral || 2500;
      const gFijo    = (params.gastoAdminFijo||165000)
                     + (params.gastoFijoPlanta||45000)
                     + (vend * (params.sueldoTrimestralVendedor||15000))
                     + (oper * (params.costoOperario||9600))
                     + dep;
      // Intereses sobre deuda existente
      const tasaTrim   = (params.tasaInteresTrimestral||0.055);
      const intDeuda   = Math.round((d.deudaInicial||0) * tasaTrim);
      const totalGastos = gFijo + intDeuda;
      // Caja: inicial + CxC anterior - gastos fijos
      const cobrosAnterior = d.cxcInicial || 0;
      const cajaCalc = (d.cajaInicial||0) + cobrosAnterior - totalGastos;
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
        gastoAdminFijo:   params.gastoAdminFijo || 165000,
        gastoFijoPlanta:  params.gastoFijoPlanta || 45000,
        costoVendedores:  vend * (params.sueldoTrimestralVendedor || 15000),
        pagoOperarios:    oper * (params.costoOperario || 9600),
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
        totalPagos:       totalGastos,
        pagoProduccion:   0,
        pagoMktTotal:     0,
        // RRHH
        vendedoresIniciales: d.vendedoresIniciales || vend,
        vendedoresFinales:   vend,
        operariosIniciales:  d.operariosIniciales || oper,
        operariosFinales:    oper,
        // Otros
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

    const cu         = calcularCostoUnitario(d, tiposProducto, canales, paramsConProveedores);
    const share      = sharesPorEquipo[d.equipo] || 0;
    const demFormal  = seg?.demandaFormal || 0;
    const ventas     = calcularVentas(d, share, demFormal, cu);
    const fin        = calcularResultadosFinancieros(d, ventas, cu, d.gastoTotalMarketing, paramsConProveedores, canales);

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
