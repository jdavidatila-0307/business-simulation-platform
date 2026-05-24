/**
 * storage.js — va en la carpeta src/
 * CORRECCIONES:
 *   - findUserByEmailOrId usa ILIKE (búsqueda de email sin distinguir mayúsculas)
 *   - createUser maneja graciosamente la columna password_plain si no existe en BD
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── Mapa de estados: JSONB legado → columna sim_rondas.estado ─────────────────


const ESTADO_LEGACY_A_NUEVO = {
  'open':      'abierta',
  'locked':    'cerrada',
  'pre-sim':   'pre-sim',
  'simulated': 'calculada',
  'pending':   'abierta',
};
const ESTADO_NUEVO_A_LEGACY = {
  'abierta':   'open',
  'cerrada':   'locked',
  'pre-sim':   'pre-sim',
  'calculada': 'simulated',
};




// ============================================================
//  FUNCIONES DE USUARIOS
// ============================================================
async function findUserById(id) {
  const res = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function findUserByEmailOrId(identifier) {
  // ILIKE hace la búsqueda de email insensible a mayúsculas/minúsculas
  const res = await pool.query(
    'SELECT * FROM usuarios WHERE id = $1 OR email ILIKE $1',
    [identifier]
  );
  return res.rows[0] || null;
}

// Busca un equipo por nombre de equipo en TODAS las simulaciones.
// Permite que los equipos vuelvan a ingresar después de que Render reinicia
// (ya que las sesiones en memoria se pierden con cada reinicio del servidor).
async function findEquipoByNombre(nombre) {
  const nombreLower = nombre.toLowerCase().trim();
  const sims = await listSimulaciones();
  for (const sim of sims) {
    const users = sim.users || [];
    const equipo = users.find(u => u.nombre && u.nombre.toLowerCase() === nombreLower);
    if (equipo) {
      return { equipo, simulacionId: sim.id };
    }
  }
  return null;
}

async function createUser(id, nombre, email, passwordHash, passwordPlain, rol) {
  // Intentar con password_plain. Si la columna no existe en BD,
  // reintentar sin ella para no bloquear la creación del profesor.
  try {
    await pool.query(
      `INSERT INTO usuarios (id, nombre, email, password_hash, password_plain, rol)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, nombre, email, passwordHash, passwordPlain, rol]
    );
  } catch (e) {
    if (e.message && e.message.includes('password_plain')) {
      console.warn('[storage] columna password_plain inexistente — insertando sin ella');
      await pool.query(
        `INSERT INTO usuarios (id, nombre, email, password_hash, rol)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, nombre, email, passwordHash, rol]
      );
    } else {
      throw e;
    }
  }
}

async function listUsers(rol = null) {
  const query  = rol ? 'SELECT * FROM usuarios WHERE rol = $1' : 'SELECT * FROM usuarios';
  const params = rol ? [rol] : [];
  const res = await pool.query(query, params);
  return res.rows;
}

async function deleteUser(id) {
  await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
}

// ============================================================
//  FUNCIONES DE SIMULACIONES
// ============================================================
async function createSimulacion(ownerId, simData) {
  const {
    id, nombre, descripcion, codigoAcceso, estado, creadaAt,
    config, parametros, tiposProducto, canales, segmentos,
    afinidadMatrix, competenciaExterna, rondas, users
  } = simData;
  await pool.query(
    `INSERT INTO simulaciones (
      id, owner_id, nombre, descripcion, codigo_acceso, estado, creada_at,
      config, parametros, tipos_producto, canales, segmentos,
      afinidad_matrix, competencia_externa, rondas, users
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id, 
      ownerId, 
      nombre, 
      descripcion, 
      codigoAcceso, 
      estado, 
      creadaAt,
      JSON.stringify(config),                // ← JSONB
      JSON.stringify(parametros),            // ← JSONB
      JSON.stringify(tiposProducto),         // ← JSONB
      JSON.stringify(canales),               // ← JSONB
      JSON.stringify(segmentos),             // ← JSONB
      JSON.stringify(afinidadMatrix),        // ← JSONB
      JSON.stringify(competenciaExterna),    // ← JSONB
      JSON.stringify(rondas || {}),          // ← JSONB (por si viene null/undefined)
      JSON.stringify(users || [])            // ← JSONB
    ]
  );
}

async function getSimulacion(id, ownerId = null) {
  let query = 'SELECT * FROM simulaciones WHERE id = $1';
  const params = [id];
  if (ownerId) { query += ' AND owner_id = $2'; params.push(ownerId); }
  const res = await pool.query(query, params);
  return res.rows[0] || null;
}

async function listSimulaciones(ownerId = null) {
  let query = 'SELECT * FROM simulaciones';
  const params = [];
  if (ownerId) { query += ' WHERE owner_id = $1'; params.push(ownerId); }
  query += ' ORDER BY creada_at DESC';
  const res = await pool.query(query, params);
  return res.rows;
}

async function updateSimulacion(id, updates, ownerId = null) {
  const allowedFields = [
    'nombre', 'descripcion', 'estado', 'codigo_acceso', 'config',
    'parametros', 'tipos_producto', 'canales', 'segmentos',
    'afinidad_matrix', 'competencia_externa', 'rondas', 'users'
  ];
  // Campos que se almacenan como JSONB en PostgreSQL
  const jsonbFields = [
    'config', 'parametros', 'tipos_producto', 'canales', 'segmentos',
    'afinidad_matrix', 'competencia_externa', 'rondas', 'users'
  ];
  const setClauses = [];
  const values = [];
  let idx = 1;
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = $${idx}`);
      // Para campos JSONB, convertimos a string JSON; para los demás, pasamos el valor tal cual
      if (jsonbFields.includes(field)) {
        values.push(JSON.stringify(updates[field]));
      } else {
        values.push(updates[field]);
      }
      idx++;
    }
  }
  if (setClauses.length === 0) return;
  values.push(id);
  if (ownerId) {
    values.push(ownerId);
    await pool.query(
      `UPDATE simulaciones SET ${setClauses.join(', ')} WHERE id = $${idx} AND owner_id = $${idx+1}`,
      values
    );
  } else {
    await pool.query(
      `UPDATE simulaciones SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );
  }
}

async function deleteSimulacion(id, ownerId = null) {
  let query = 'DELETE FROM simulaciones WHERE id = $1';
  const params = [id];
  if (ownerId) { query += ' AND owner_id = $2'; params.push(ownerId); }
  await pool.query(query, params);
}

// ============================================================
//  EQUIPOS (dentro de una simulación)
// ============================================================
async function getEquipos(simulacionId, ownerId = null) {
  const sim = await getSimulacion(simulacionId, ownerId);
  if (!sim) return [];
  return sim.users || [];
}

async function addEquipo(simulacionId, equipo, ownerId = null) {
  const sim = await getSimulacion(simulacionId, ownerId);
  if (!sim) throw new Error('Simulación no encontrada');
  const users = sim.users || [];
  users.push(equipo);
  await updateSimulacion(simulacionId, { users }, ownerId);
}

async function findUserInSimulacion(simulacionId, userId, ownerId = null) {
  const equipos = await getEquipos(simulacionId, ownerId);
  return equipos.find(e => e.id === userId);
}

// ============================================================
//  RONDAS
// ============================================================

// =============================================================================
// getRonda con lectura prioritaria de tablas normalizadas
// =============================================================================
async function getRonda(simulacionId, n, ownerId = null) {
  try {
    const rondaRow = await pool.query(
      `SELECT estado, creada_at, calculada_at, resultados
       FROM   sim_rondas
       WHERE  simulacion_id = $1 AND numero = $2`,
      [simulacionId, n]
    );

    if (rondaRow.rows.length > 0) {
      const row        = rondaRow.rows[0];
      const resultados = row.resultados || {};

      const decisionesRows = await pool.query(
        `SELECT equipo_id, decisiones
         FROM   sim_decisiones
         WHERE  simulacion_id = $1
           AND  ronda_numero  = $2
           AND  producto_id   = 'prod_1'
         ORDER BY enviada_at ASC`,
        [simulacionId, n]
      );

      const decisionesMap = {};
      for (const d of decisionesRows.rows) {
        decisionesMap[d.equipo_id] = d.decisiones;
      }

      const estadoLegado = ESTADO_NUEVO_A_LEGACY[row.estado] || row.estado;

      return {
        estado:            estadoLegado,
        abiertaAt:         row.creada_at   ? row.creada_at.toISOString()   : null,
        ejecutadaAt:       row.calculada_at ? row.calculada_at.toISOString() : null,
        decisiones:        decisionesMap,
        resultados:        resultados.resultados        || {},
        mercadoSegmentos:  resultados.mercadoSegmentos  || [],
        atractivoEquipos:  resultados.atractivoEquipos  || {},
        dashboard:         resultados.dashboard          || {},
        empresas:          resultados.empresas           || {},
        reportes:          resultados.reportes           || {},
        preSimulacion:     resultados.preSimulacion      || {},
        preSimMercado:     resultados.preSimMercado      || [],
        _source: 'normalized',
      };
    }
  } catch (errNuevo) {
    console.error(
      `[storage.getRonda] Error leyendo tablas normalizadas, usando JSONB legado:`,
      errNuevo.message
    );
  }

  // Fallback legacy
  const sim = await getSimulacion(simulacionId, ownerId);
  if (!sim) return null;
  const rondas = sim.rondas || {};
  const rondaLegacy = rondas[String(n)];
  if (rondaLegacy) {
    rondaLegacy._source = 'legacy_jsonb';
  }
  return rondaLegacy;
}

// =============================================================================
// updateRonda con dual-write
// =============================================================================
async function updateRonda(simulacionId, n, data, ownerId = null) {
  const sim = await getSimulacion(simulacionId, ownerId);
  if (!sim) throw new Error('Simulación no encontrada');
  const rondas = sim.rondas || {};
  rondas[String(n)] = { ...rondas[String(n)], ...data };
  await updateSimulacion(simulacionId, { rondas }, ownerId);

console.log('[DUAL-WRITE] insertando en sim_rondas para sim:', simulacionId, 'ronda:', n);

  try {
    const estadoNuevo  = data.estado     ? (ESTADO_LEGACY_A_NUEVO[data.estado] || data.estado) : null;
    const calculadaAt  = data.ejecutadaAt || null;

    const camposResultados = {};
    const CAMPOS_RESULTADOS = [
      'mercadoSegmentos', 'atractivoEquipos', 'dashboard',
      'empresas', 'resultados', 'reportes',
      'preSimulacion', 'preSimMercado',
    ];
    let hayResultados = false;
    for (const campo of CAMPOS_RESULTADOS) {
      if (data[campo] !== undefined) {
        camposResultados[campo] = data[campo];
        hayResultados = true;
      }
    }

    await pool.query(
      `INSERT INTO sim_rondas (simulacion_id, numero, estado, calculada_at, resultados)
       VALUES ($1, $2, COALESCE($3, 'abierta'), $4::TIMESTAMPTZ, $5::jsonb)
       ON CONFLICT (simulacion_id, numero) DO UPDATE SET
         estado       = COALESCE($3, sim_rondas.estado),
         calculada_at = COALESCE($4::TIMESTAMPTZ, sim_rondas.calculada_at),
         resultados   = CASE
                          WHEN $5::jsonb = '{}'::jsonb
                          THEN COALESCE(sim_rondas.resultados, '{}'::jsonb)
                          ELSE COALESCE(sim_rondas.resultados, '{}'::jsonb) || $5::jsonb
                        END`,
      [simulacionId, n, estadoNuevo, calculadaAt, JSON.stringify(hayResultados ? camposResultados : {})]
    );

    if (data.decisiones && typeof data.decisiones === 'object') {
      for (const [equipoId, decisionObj] of Object.entries(data.decisiones)) {
        if (!decisionObj) continue;

        const productos = Array.isArray(decisionObj.productos) && decisionObj.productos.length
          ? decisionObj.productos.filter(p => p.activo !== false)
          : null;

        if (productos) {
          for (const prod of productos) {
            const productoId = prod.productoId || 'prod_1';
            await pool.query(
              `INSERT INTO sim_decisiones
                 (simulacion_id, ronda_numero, equipo_id, producto_id, decisiones, enviada_at)
               VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
               ON CONFLICT (simulacion_id, ronda_numero, equipo_id, producto_id)
               DO UPDATE SET decisiones = EXCLUDED.decisiones, enviada_at = NOW()`,
              [simulacionId, n, equipoId, productoId, JSON.stringify(prod)]
            );
          }
        }

        await pool.query(
          `INSERT INTO sim_decisiones
             (simulacion_id, ronda_numero, equipo_id, producto_id, decisiones, enviada_at)
           VALUES ($1, $2, $3, 'prod_1', $4::jsonb, NOW())
           ON CONFLICT (simulacion_id, ronda_numero, equipo_id, producto_id)
           DO UPDATE SET decisiones = EXCLUDED.decisiones, enviada_at = NOW()`,
          [simulacionId, n, equipoId, JSON.stringify(decisionObj)]
        );
      }
    }
  } catch (errNuevo) {
    console.error(
      `[storage.updateRonda] Error en dual-write:`,
      errNuevo.message
    );
  }
}

// =============================================================================
// saveDecision (NUEVA)
// =============================================================================
async function saveDecision(simulacionId, rondaNumero, equipoId, productoId, decisionData) {
  try {
    await pool.query(
      `INSERT INTO sim_decisiones
         (simulacion_id, ronda_numero, equipo_id, producto_id, decisiones, enviada_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (simulacion_id, ronda_numero, equipo_id, producto_id)
       DO UPDATE SET decisiones = EXCLUDED.decisiones, enviada_at = NOW()`,
      [simulacionId, rondaNumero, equipoId, productoId || 'prod_1', JSON.stringify(decisionData)]
    );
  } catch (errNuevo) {
    console.error(`[storage.saveDecision] Error en sim_decisiones:`, errNuevo.message);
  }

  try {
    await pool.query(
      `UPDATE simulaciones
       SET rondas = jsonb_set(
                     jsonb_set(
                       COALESCE(rondas, '{}'::jsonb),
                       ARRAY[$2, 'decisiones'],
                       COALESCE((rondas -> $2 -> 'decisiones'), '{}'::jsonb),
                       true
                     ),
                     ARRAY[$2, 'decisiones', $3],
                     $4::jsonb,
                     true
                   )
       WHERE id = $1`,
      [simulacionId, String(rondaNumero), equipoId, JSON.stringify(decisionData)]
    );
  } catch (errLegacy) {
    console.error(`[storage.saveDecision] Error en JSONB legado:`, errLegacy.message);
    throw errLegacy;
  }
}





function defaultDecision(equipoId, equipoNombre, params) {
  const p = params || {};

   const productoBase = {
    productoId: 'prod_1',
    activo: true,

    // Decisión comercial por producto
    producto: '',
    segmentoObjetivo: '',
    canalPrincipal: '',
    canalSecundario: 'Ninguno',

    // Decisión operativa por producto
    calidad: 5,
    precioVenta: 0,
    produccion: 0,

    // Marketing por producto
    publicidad: 0,
    promocion: 0,
    eventos: 0,
    marketingRedes: 0,
    relacionesPublicas: 0,

    // Innovación por producto
    innovacion: false,
    tipoInnovacion: 'Producto',
    montoInnovacion: 0,

    // Variables acumulables
    brandEquityInicial: 50,
    reputacionInicial: 50,
    inventarioInicial: p.inventarioInicialUnid || 0,

    // Etapa 3.1: Materia prima
    stockMPInicial:    0,
    proveedorElegido:  '',
    cantidadMPpedida:  0,
    pedidosPendientes: [],   // [{rondaEntrega, cantidad, costoMP}]

    // Vendedores (nuevo)
    vendedoresIniciales: 2,
    contratarVendedores: 0,
    despedirVendedores: 0,

    // Etapa 3.2: Operarios
    operariosIniciales:  p.operariosIniciales || 4,
    contratarOperarios:  0,
    despedirOperarios:   0,
    montoCapacitacion:   0,
  };

  return {
    equipo: equipoId,
    equipoNombre,

    // NUEVO MODELO EMPRESARIAL
    productos: [productoBase],

    // COMPATIBILIDAD TEMPORAL CON EL MOTOR ACTUAL
    producto: productoBase.producto,
    segmentoObjetivo: productoBase.segmentoObjetivo,
    canalPrincipal: productoBase.canalPrincipal,
    canalSecundario: productoBase.canalSecundario,
    calidad: productoBase.calidad,
    precioVenta: productoBase.precioVenta,
    produccion: productoBase.produccion,
    publicidad: productoBase.publicidad,
    promocion: productoBase.promocion,
    eventos: productoBase.eventos,
    marketingRedes: productoBase.marketingRedes,
    relacionesPublicas: productoBase.relacionesPublicas,
    innovacion: productoBase.innovacion,
    tipoInnovacion: productoBase.tipoInnovacion,
    montoInnovacion: productoBase.montoInnovacion,
    vendedoresIniciales: productoBase.vendedoresIniciales,
    contratarVendedores: productoBase.contratarVendedores,
    despedirVendedores: productoBase.despedirVendedores,

    // RRHH empresarial
    rrhh: {
      contratarVendedores: 0,
      despedirVendedores: 0,
      contratarOperarios: 0,
      despedirOperarios: 0,
      capacitacion: 0,
      productividadInicial: 1
    },

    // COMPATIBILIDAD TEMPORAL RRHH
    contratarVendedores: 0,
    despedirVendedores: 0,

    // Finanzas
    finanzas: {
      tipoPrestamo: 'Ninguno',
      montoPrestamo: 0,
      plazoPrestamo: 2,
      amortizacion: 0
    },

    // COMPATIBILIDAD TEMPORAL FINANZAS
    tipoPrestamo: 'Ninguno',
    montoPrestamo: 0,
    plazoPrestamo: 2,
    amortizacion: 0,

    // Investigación
    investigacion: {
      tipoInvestigacion: 'No'
    },

    // COMPATIBILIDAD TEMPORAL INVESTIGACIÓN
    tipoInvestigacion: 'No',

    // Estado inicial financiero
    vendedoresIniciales: p.vendedoresIniciales || 2,
    cajaInicial: p.cajaInicial || 50000,
    activosFijosIniciales: p.activosFijosIniciales || 80000,
    cxcInicial: p.cxcInicial || 0,
    deudaInicial: p.deudaInicial || 0,
    inventarioInicial: p.inventarioInicialUnid || 0,
    resultadoAcumuladoAnterior: 0,

    // Estado de entrega
    submitted: false,
    submittedAt: null
  };
}

// hasta aqui//




async function ensureRonda(simulacionId, n, ownerId = null) {
  let ronda = await getRonda(simulacionId, n, ownerId);
  if (!ronda) {
    const sim = await getSimulacion(simulacionId, ownerId);
    if (!sim) throw new Error('Simulación no encontrada');
    const equipos = await getEquipos(simulacionId, ownerId);
    const rondaBase = {
      estado: 'open', abiertaAt: new Date().toISOString(),
      ejecutadaAt: null, decisiones: {}, resultados: {},
      mercadoSegmentos: [], atractivoEquipos: {}, dashboard: {}
    };
    if (n > 1) {
      const prevRonda = await getRonda(simulacionId, n-1, ownerId);
      if (prevRonda) {
        for (const eq of equipos) {
          // POLÍTICA: hoja de decisión siempre en blanco al inicio de cada ronda
          // Solo se propagan campos financieros de continuidad (estado real de la empresa)
          // Campos comerciales siempre en cero: producto, precio, producción,
          // canal, publicidad, calidad, vendedores, operarios, préstamo, investigación
          const decNueva = defaultDecision(eq.id, eq.nombre, sim.parametros);

          // Buscar resultado de la ronda anterior para campos financieros
          // NOTA: resultados puede estar en prevRonda.resultados.resultados (estructura del motor)
          const resObj = prevRonda.resultados?.resultados || prevRonda.resultados || {};
          const resObjValues = Object.values(resObj).filter(v => v && typeof v === 'object' && v.equipoNombre);
          console.log(`[storage] ensureRonda: eq=${eq.nombre} resObj keys=${Object.keys(resObj).length} validResults=${resObjValues.length}`);
          const resPrev = resObjValues.find(r =>
            r.equipoOriginal === eq.id || r.equipo === eq.id || (r.equipo||'').startsWith(eq.id)
          );
          if (resPrev) console.log(`[storage] encontrado: caja=${resPrev.cajaFinal} vend=${resPrev.vendedoresFinales}`);
          else console.log(`[storage] NO encontrado para ${eq.id}`);

          if (resPrev) {
            // Propagar SOLO el estado financiero acumulado de la empresa
            decNueva.cajaInicial                = Math.max(0, resPrev.cajaFinal ?? 0);
            decNueva.cxcInicial                 = Math.max(0, resPrev.cxcFinal ?? 0);
            decNueva.deudaInicial               = Math.max(0, resPrev.deudaFinal ?? 0);
            decNueva.activosFijosIniciales      = Math.max(0, resPrev.activosFijosNetos || resPrev.afNetos || 78000);
            decNueva.resultadoAcumuladoAnterior = resPrev.resultadoAcumulado ?? 0;
            decNueva.brandEquityInicial         = resPrev.brandEquityFinal ?? 50;
            decNueva.stockMPInicial             = Math.max(0, resPrev.stockMPFinal ?? 0);
            decNueva.pedidosPendientes          = resPrev.pedidosPendientesResta ?? [];
            // Propagar dotación de personal (estado real de la empresa, no decisión)
            decNueva.vendedoresIniciales        = Math.max(1, resPrev.vendedoresFinales ?? 2);
            decNueva.operariosIniciales         = Math.max(1, resPrev.operariosFinales ?? 4);
            // Inventario: sumar todos los productos de la empresa
            const todosRes = Object.values(resObj).filter(r =>
              r.equipoOriginal === eq.id || (r.equipo||'').startsWith(eq.id)
            );
            decNueva.inventarioInicial = todosRes.reduce((s,r) => s + Math.max(0, r.inventarioFinal||0), 0);
          }

          rondaBase.decisiones[eq.id] = decNueva;
        }
      } else {
        for (const eq of equipos)
          rondaBase.decisiones[eq.id] = defaultDecision(eq.id, eq.nombre, sim.parametros);
      }
    } else {
      for (const eq of equipos)
        rondaBase.decisiones[eq.id] = defaultDecision(eq.id, eq.nombre, sim.parametros);
    }
    await updateRonda(simulacionId, n, rondaBase, ownerId);
    ronda = rondaBase;
  }
  return ronda;
}

// ============================================================
//  CONFIGURACIÓN
// ============================================================
async function getSimConfig(simulacionId, ownerId = null) {
  const sim = await getSimulacion(simulacionId, ownerId);
  if (!sim) return null;
  return {
    params: sim.parametros, tiposProducto: sim.tipos_producto,
    canales: sim.canales, segmentos: sim.segmentos,
    afinidadMatrix: sim.afinidad_matrix, competenciaExterna: sim.competencia_externa
  };
}

async function updateSimConfig(simulacionId, config, ownerId = null) {
  const updates = {};
  if (config.parametros       !== undefined) updates.parametros        = config.parametros;
  if (config.tiposProducto    !== undefined) updates.tipos_producto     = config.tiposProducto;
  if (config.canales          !== undefined) updates.canales            = config.canales;
  if (config.segmentos        !== undefined) updates.segmentos          = config.segmentos;
  if (config.afinidadMatrix   !== undefined) updates.afinidad_matrix    = config.afinidadMatrix;
  if (config.competenciaExterna !== undefined) updates.competencia_externa = config.competenciaExterna;
  await updateSimulacion(simulacionId, updates, ownerId);
}

// Generadores
function genSimId()  { return 'sim_' + Date.now().toString(36); }
function genCodigo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'MKT-' + Array.from({length:4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = {
  findUserById, findUserByEmailOrId, findEquipoByNombre,
  createUser, listUsers, deleteUser,
  createSimulacion, getSimulacion, listSimulaciones, updateSimulacion, deleteSimulacion,
  getEquipos, addEquipo, findUserInSimulacion,
  getRonda, updateRonda, ensureRonda, defaultDecision,
  saveDecision,
  getSimConfig, updateSimConfig,
  genSimId, genCodigo
};
