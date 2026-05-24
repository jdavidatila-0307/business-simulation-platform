/**
 * SIMULADOR DE MARKETING v3.0 — Multi-Simulación
 * Con persistencia PostgreSQL y soporte para múltiples profesores.
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// FORZAR ACEPTACIÓN DE CERTIFICADOS SSL AUTOFIRMADOS (solo para este entorno)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { hashPassword, verifyPassword } = require('./src/auth');

const { cargarPlantilla, listarPlantillas, inicializarPlantillaDefault } = require('./src/plantillas');
const { generarDecisionBot, PERFILES_BOT } = require('./src/bot_service');
const { initWebSocket, broadcast, clientesConectados } = require('./src/ws_service');

inicializarPlantillaDefault();


const storage  = require('./src/storage');
const { ejecutarSimulador, calcularMercadoSegmentos, calcularPreSimulacion } = require('./src/engine');
const { generarReportes } = require('./src/reports');

const PORT = process.env.PORT || 3000;
console.log('[server] DATABASE_URL definida?', process.env.DATABASE_URL ? 'Sí' : 'No');
const PUB_DIR = path.join(__dirname, 'public');

// ── Static MIME ───────────────────────────────────────────────
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.png':'image/png', '.ico':'image/x-icon',
};

// ── Session store PostgreSQL ──────────────────────────────────
const {
  createSession,
  getSession: getSessionFromDB,
  destroySession,
  cleanupExpiredSessions,
  updateSessionSimulation
} = require('./src/session.pg');

setInterval(() => {
  cleanupExpiredSessions().catch(err =>
    console.error('[sessions] cleanup error:', err.message)
  );
}, 60 * 60 * 1000);

// ── Helpers ───────────────────────────────────────────────────
function readBody(req) {
  return new Promise((res,rej) => {
    let b = '';
    let size = 0;
    const MAX = 5 * 1024 * 1024; // 5MB — suficiente para 5 productos con justificaciones
    req.on('data', c => {
      size += c.length;
      if (size > MAX) {
        req.destroy();
        return rej(new Error('Payload demasiado grande (máx 5MB)'));
      }
      b += c;
    });
    req.on('end', () => { try { res(b ? JSON.parse(b) : {}); } catch { res({}); } });
    req.on('error', rej);
  });
}

function send(res, status, data) {
  if (res.headersSent) {
    console.error(`⚠️ Intento de enviar respuesta ${status} después de que ya se enviaron los headers. Petición ignorada. URL: ${res.req?.url}`);
    return;
  }
  res.writeHead(status, { 'Content-Type':'application/json' });
  res.end(JSON.stringify(data));
}

// ── Middleware de sesión ─────────────────────────────────────
async function getSession(req) {
  const raw = req.headers.cookie || '';
  const sid = raw.split(';').map(c => c.trim()).find(c => c.startsWith('sid='));
  const token = sid ? sid.split('=')[1] : null;
  return token ? await getSessionFromDB(token) : null;
}

function getSessionToken(req) {
  const raw = req.headers.cookie || '';
  const sid = raw.split(';').map(c => c.trim()).find(c => c.startsWith('sid='));
  return sid ? sid.split('=')[1] : null;
}

// P2 FIX: resolución robusta de nombre de equipo considerando IDs expandidos
function resolveNombre(r, eqMap) {
  return eqMap[r.equipoOriginal] ?? eqMap[r.equipo]
      ?? r.equipoOriginal ?? r.equipo ?? '—';
}

// ── Función auxiliar para obtener la simulación actual ────────
async function getCurrentSimulation(session) {
  if (!session || !session.simulacionId) return null;

  // Los EQUIPOS no están en la tabla 'usuarios' — están en simulaciones.users JSONB.
  // Para equipos: obtener la simulación directamente por ID (ya tienen simulacionId en sesión).
  if (session.rol === 'equipo') {
    const sim = await storage.getSimulacion(session.simulacionId);
    return sim || null;
  }

  // Para admin / superadmin / profesor: verificar usuario + permisos de ownership
  const user = await storage.findUserById(session.userId);
  if (!user) return null;
  const ownerId = (user.rol === 'superadmin') ? null : session.userId;
  const sim = await storage.getSimulacion(session.simulacionId, ownerId);
  if (!sim) { session.simulacionId = null; return null; }
  return sim;
}

// ── Ruta principal ─────────────────────────────────────────────
async function route(req, res, body) {
  const url    = req.url.split('?')[0];
  const method = req.method;
  const session = await getSession(req);
  const s = session || null;

  const isAdmin = () => s?.rol === 'superadmin' || s?.rol === 'profesor';
  const isSuperAdmin = () => s?.rol === 'superadmin';
  const isEquipo = () => s?.rol === 'equipo';
  const needAdmin = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    if (!isAdmin()) { send(res, 403, { error: 'Acceso denegado' }); return true; }
    return false;
  };
  const needSuperAdmin = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    if (!isSuperAdmin()) { send(res, 403, { error: 'Acceso solo para superadmin' }); return true; }
    return false;
  };
  const needEquipo = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    if (!isEquipo()) { send(res, 403, { error: 'Solo para equipos' }); return true; }
    return false;
  };
  const needAuth = () => {
    if (!s) { send(res, 401, { error: 'No autenticado' }); return true; }
    return false;
  };

  // ═══ AUTH ════════════════════════════════════════════════════
  if (url === '/auth/login' && method === 'POST') {
    const { id, password } = body;
    if (!id || !password) return send(res, 400, { error: 'Credenciales requeridas' });
    const identifier = id.trim();
    console.log(`[LOGIN] intento | identifier: "${identifier}"`);

    // ── 1. Buscar en tabla 'usuarios' (superadmin, profesor) ──────
    let user = await storage.findUserByEmailOrId(identifier);
    let sessionSimulacionId = null;

    // ── 2. Si no encontrado, buscar equipo por nombre en simulaciones ──
    //    Necesario porque los equipos NO están en 'usuarios' y Render
    //    reinicia el servidor (perdiendo sesiones en memoria).
    if (!user) {
      const found = await storage.findEquipoByNombre(identifier);
      if (found) {
        user = {
          id:            found.equipo.id,
          nombre:        found.equipo.nombre,
          rol:           'equipo',
          password_hash: found.equipo.password,
        };
        sessionSimulacionId = found.simulacionId;
        console.log(`[LOGIN] equipo encontrado | id: ${user.id} | sim: ${sessionSimulacionId}`);
      }
    }

    if (!user) {
      console.log(`[LOGIN] 401 — no encontrado: "${identifier}"`);
      return send(res, 401, { error: 'Usuario o contraseña incorrectos' });
    }

    console.log(`[LOGIN] usuario encontrado | id: ${user.id} | rol: ${user.rol}`);

    if (!user.password_hash) {
      console.error(`[LOGIN] ERROR — password_hash NULL para ${user.id}`);
      return send(res, 500, { error: 'Error de configuración de cuenta. Contacta al administrador.' });
    }

    let ok = false;
    try {
      ok = verifyPassword(password, user.password_hash);
    } catch(e) {
      console.error(`[LOGIN] ERROR en verifyPassword | ${user.id} | ${e.message}`);
      return send(res, 500, { error: 'Error interno de verificación. Contacta al administrador.' });
    }

    if (!ok) {
      console.log(`[LOGIN] 401 — contraseña incorrecta | ${user.id}`);
      return send(res, 401, { error: 'Usuario o contraseña incorrectos' });
    }

    const token = await createSession(user.id, user.rol, sessionSimulacionId);
    
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax`);
    console.log(`[LOGIN] éxito | id: ${user.id} | rol: ${user.rol}`);
    return send(res, 200, { ok: true, rol: user.rol, id: user.id, nombre: user.nombre });
  }

  if (url === '/auth/logout' && method === 'POST') {
    const token = getSessionToken(req);
    if (token) await destroySession(token);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  if (url === '/auth/registro' && method === 'POST') {
    const { nombreEquipo, miembros, password, codigoSimulacion } = body;
    if (!nombreEquipo?.trim()) return send(res, 400, { error: 'Nombre del equipo requerido' });
    if (!password || password.length < 4) return send(res, 400, { error: 'Contraseña de al menos 4 caracteres' });
    if (!Array.isArray(miembros) || !miembros.length) return send(res, 400, { error: 'Al menos un integrante' });
    if (!codigoSimulacion?.trim()) return send(res, 400, { error: 'Código de simulación requerido' });
    const codigo = codigoSimulacion.trim().toUpperCase();
    const sims = await storage.listSimulaciones();
    const sim = sims.find(s => s.codigo_acceso === codigo && s.estado === 'activa');
    if (!sim) return send(res, 404, { error: `Código "${codigo}" no válido o simulación inactiva` });
    const simId = sim.id;
    for (let i = 0; i < miembros.length; i++) {
      const m = miembros[i];
      if (!m.apellidoPaterno?.trim()) return send(res, 400, { error: `Integrante ${i+1}: falta Apellido Paterno` });
      if (!m.apellidoMaterno?.trim()) return send(res, 400, { error: `Integrante ${i+1}: falta Apellido Materno` });
      if (!m.nombres?.trim())         return send(res, 400, { error: `Integrante ${i+1}: faltan Nombres` });
      if (!m.nroRegistro?.trim())     return send(res, 400, { error: `Integrante ${i+1}: falta Nro. Registro` });
    }
    const nombreLower = nombreEquipo.trim().toLowerCase();
    const equipos = await storage.getEquipos(simId);
    if (equipos.some(eq => eq.nombre.toLowerCase() === nombreLower))
      return send(res, 409, { error: `Ya existe el equipo "${nombreEquipo.trim()}" en esta simulación` });
    const base = nombreLower.replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const id   = `eq_${simId.slice(4)}_${base}_${Date.now().toString(36)}`;
    const equipo = {
      id, nombre: nombreEquipo.trim(), simulacionId: simId,
      password: hashPassword(password), passwordPlain: password,
      rol: 'equipo', registradoAt: new Date().toISOString(),
      miembros: miembros.map(m => ({
        apellidoPaterno: m.apellidoPaterno.trim(), apellidoMaterno: m.apellidoMaterno.trim(),
        nombres: m.nombres.trim(), telefono: (m.telefono||'').trim(), nroRegistro: m.nroRegistro.trim()
      }))
    };
    await storage.addEquipo(simId, equipo);
    const token = await createSession(id, 'equipo', simId);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax`);
    return send(res, 200, { ok: true, id, nombre: equipo.nombre, rol: 'equipo', passwordPlain: password,
      simulacionNombre: sim.nombre, codigoSimulacion: codigo });
  }

  if (url === '/auth/me' && method === 'GET') {
    console.log('[AUTH/ME] Petición recibida, sesión:', s ? 'activa' : 'no');
    if (needAuth()) return;
    console.log('[AUTH/ME] Usuario autenticado, rol:', s.rol);
    if (s.rol === 'equipo') {
      const sim = await storage.getSimulacion(s.simulacionId);
      const equipo = sim?.users?.find(u => u.id === s.userId);
      if (!equipo) return send(res, 401, { error: 'Sesión inválida' });
      return send(res, 200, { id: equipo.id, nombre: equipo.nombre, rol: equipo.rol, miembros: equipo.miembros||[],
        simulacionId: s.simulacionId });
    } else {
      const user = await storage.findUserById(s.userId);
      if (!user) return send(res, 401, { error: 'Sesión inválida' });
      return send(res, 200, { id: user.id, nombre: user.nombre, rol: user.rol, miembros: [] });
    }
  }

  if (url === '/auth/validar-codigo' && method === 'POST') {
    const { codigo } = body;
    if (!codigo) return send(res, 400, { error: 'Código requerido' });
    const sims = await storage.listSimulaciones();
    const sim = sims.find(s => s.codigo_acceso?.toUpperCase() === codigo.trim().toUpperCase() && s.estado === 'activa');
    if (!sim) return send(res, 200, { valido: false });
    return send(res, 200, { valido: true, nombre: sim.nombre, simId: sim.id });
  }

  // ═══ ADMIN — Gestión de Simulaciones ═════════════════════════
  if (url === '/admin/simulaciones' && method === 'GET') {
    if (needAdmin()) return;
    const user = await storage.findUserById(s.userId);
    let simulaciones;
    if (user.rol === 'superadmin') {
      simulaciones = await storage.listSimulaciones();
    } else {
      simulaciones = await storage.listSimulaciones(s.userId);
    }
    const out = await Promise.all(simulaciones.map(async sim => {
      const equipos = await storage.getEquipos(sim.id);
      return {
        id: sim.id, nombre: sim.nombre, descripcion: sim.descripcion||'',
        estado: sim.estado, creadaAt: sim.creada_at,
        codigoAcceso: sim.codigo_acceso,
        currentRound: sim.config?.currentRound || 1,
        totalRounds: sim.config?.totalRounds || 20,
        roundState: sim.config?.roundState || 'pending',
        totalEquipos: equipos.length,
      };
    }));
    return send(res, 200, out);
  }

  // ══ BLOQUE B — reemplaza la ruta POST /admin/simulaciones ════════════════════
  // BUSCA: if (url === '/admin/simulaciones' && method === 'POST') { ... }
  // REEMPLAZA todo el bloque if hasta su cierre con esto:
  
    if (url === '/admin/simulaciones' && method === 'POST') {
      if (needAdmin()) return;
      const { nombre, descripcion, totalRounds, copyFromSimId, industria } = body;
      if (!nombre?.trim()) return send(res, 400, { error: 'Nombre de simulación requerido' });
  
      const user = await storage.findUserById(s.userId);
      if (!user) return send(res, 401, { error: 'Sesión inválida. Vuelve a iniciar sesión.' });
      const ownerId      = user.id;
      const simId        = storage.genSimId();
      const codigoAcceso = storage.genCodigo();
  
      // ── Cargar parámetros base ─────────────────────────────────────────────
      let baseSim = null;
      if (copyFromSimId) {
        baseSim = await storage.getSimulacion(copyFromSimId, user.rol !== 'superadmin' ? ownerId : null);
        if (!baseSim && user.rol === 'superadmin') baseSim = await storage.getSimulacion(copyFromSimId);
      }
  
      // ── Cargar plantilla de industria ──────────────────────────────────────
      // Orden de prioridad: 1) copyFrom, 2) plantilla por nombre, 3) jaboncillos
      let plantillaCfg = null;
      let industriaNombre = industria?.trim() || null;
  
      if (!baseSim && industriaNombre) {
        try {
          plantillaCfg = cargarPlantilla(industriaNombre);
        } catch (errPlantilla) {
          return send(res, 400, { error: errPlantilla.message });
        }
      }
  
      const simData = {
        id:          simId,
        nombre:      nombre.trim(),
        descripcion: (descripcion || '').trim(),
        codigoAcceso,
        estado:      'activa',
        creadaAt:    new Date().toISOString(),
        config: {
          currentRound: 1,
          totalRounds:  totalRounds || 20,
          roundState:   'pending',
          industria:    industriaNombre || 'jaboncillos_v1',  // metadata para el frontend
        },
        // Prioridad: baseSim > plantilla > constants.js (jaboncillos)
        parametros:       baseSim?.parametros        || plantillaCfg?.params             || require('./src/constants').PARAMS,
        tiposProducto:    baseSim?.tipos_producto     || plantillaCfg?.tiposProducto      || require('./src/constants').TIPOS_PRODUCTO,
        canales:          baseSim?.canales            || plantillaCfg?.canales            || require('./src/constants').CANALES,
        segmentos:        baseSim?.segmentos          || plantillaCfg?.segmentos          || require('./src/constants').SEGMENTOS,
        afinidadMatrix:   baseSim?.afinidad_matrix    || plantillaCfg?.afinidadMatrix     || require('./src/constants').AFINIDAD_MATRIX,
        competenciaExterna: baseSim?.competencia_externa || plantillaCfg?.competenciaExterna || require('./src/constants').COMPETENCIA_EXTERNA,
        // Etapa 3.1: catálogo de proveedores de la plantilla
        proveedores: baseSim?.proveedores || plantillaCfg?.proveedores || [],
        rondas: {},
        users:  [],
      };
  
      await storage.createSimulacion(ownerId, simData);
      console.log(`[server] Simulación creada | id: ${simId} | industria: ${simData.config.industria}`);
      return send(res, 200, { ok: true, simId, codigoAcceso, industria: simData.config.industria });
    }
  

  if (url.match(/^\/admin\/simulaciones\/[^/]+$/) && method === 'PUT') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    const updates = {};
    if (body.nombre !== undefined) updates.nombre = body.nombre.trim();
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion;
    if (body.estado !== undefined) updates.estado = body.estado;
    if (body.codigoAcceso !== undefined) updates.codigo_acceso = body.codigoAcceso.trim().toUpperCase();
    await storage.updateSimulacion(simId, updates, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+\/archivar$/) && method === 'POST') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    await storage.updateSimulacion(simId, { estado: 'archivada' }, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+\/activar$/) && method === 'POST') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    await storage.updateSimulacion(simId, { estado: 'activa' }, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/simulaciones\/[^/]+$/) && method === 'DELETE') {
    if (needAdmin()) return;
    const simId = url.split('/')[3];
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    await storage.deleteSimulacion(simId, ownerId);
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/seleccionar-sim' && method === 'POST') {
    if (needAdmin()) return;
    const { simId } = body;
    const user = await storage.findUserById(s.userId);
    const ownerId = user.rol !== 'superadmin' ? user.id : null;
    const sim = await storage.getSimulacion(simId, ownerId);
    if (!sim) return send(res, 404, { error: 'Simulación no encontrada o no autorizada' });
    const token = getSessionToken(req);
    if (token) await updateSessionSimulation(token, simId);
    return send(res, 200, { ok: true, simId, nombre: sim.nombre });
  }

  // ═══ ADMIN — Gestión de profesores (solo superadmin) ════════
  if (url === '/admin/usuarios' && method === 'GET') {
    if (needSuperAdmin()) return;
    const profesores = await storage.listUsers('profesor');
    return send(res, 200, profesores);
  }

  if (url === '/admin/usuarios' && method === 'POST') {
    if (needSuperAdmin()) return;
    const { nombre, email, password } = body;
    if (!nombre || !email || !password) return send(res, 400, { error: 'Faltan datos' });
    const id = `prof_${Date.now().toString(36)}`;
    const hash = hashPassword(password);
    try {
      await storage.createUser(id, nombre, email, hash, password, 'profesor');
      console.log(`[PROFESOR] creado | id: ${id} | email: ${email}`);
    } catch(e) {
      console.error(`[PROFESOR] ERROR al crear | ${e.message}`);
      return send(res, 500, { error: `Error al guardar profesor: ${e.message}` });
    }
    // Devolver password_plain para que el panel lo muestre al superadmin
    return send(res, 200, { id, nombre, email, password_plain: password });
  }

  if (url.match(/^\/admin\/usuarios\/[^/]+$/) && method === 'DELETE') {
    if (needSuperAdmin()) return;
    const profId = url.split('/')[3];
    await storage.deleteUser(profId);
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/plantillas' && method === 'GET') {
    if (needAdmin()) return;
    try {
      const plantillas = listarPlantillas();
      return send(res, 200, { plantillas });
    } catch (err) {
      console.error('[server] Error listando plantillas:', err.message);
      return send(res, 500, { error: 'No se pudieron cargar las plantillas.' });
    }
  }


  // ═══ Todas las rutas siguientes requieren contexto de simulación ═══
  const sim = await getCurrentSimulation(s);
  if (!sim && (s?.rol === 'superadmin' || s?.rol === 'profesor' || s?.rol === 'equipo')) {
    if (url.startsWith('/admin/') || url.startsWith('/api/')) {
      return send(res, 400, { error: 'Selecciona una simulación primero' });
    }
  }

  // ─── ADMIN — Equipos ─────────────────────────────────────────
  if (url === '/admin/equipos' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    const equipos = await storage.getEquipos(sim.id);
    // FIX multiproducto: buscar submitted en ronda.decisiones con IDs expandidos
    const out = equipos.map(eq => {
      // Primero buscar por ID exacto
      let dec = ronda?.decisiones?.[eq.id];
      // Si no encontrado, buscar por prefijo (multiproducto: eq_xxx__prod_1)
      if (!dec && ronda?.decisiones) {
        const key = Object.keys(ronda.decisiones).find(k => k.startsWith(eq.id + '__'));
        if (key) dec = ronda.decisiones[key];
      }
      const submitted    = dec?.submitted || false;
      const submittedAt  = dec?.submittedAt || null;
      return { id:eq.id, nombre:eq.nombre, miembros:eq.miembros||[],
        submitted, submittedAt,
        registradoAt:eq.registradoAt||null, passwordPlain:eq.passwordPlain||null };
    });
    return send(res, 200, out);
  }

  if (url === '/admin/equipos' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const { nombre, miembros, password } = body;
    if (!nombre || !password) return send(res, 400, { error: 'Nombre y contraseña requeridos' });
    const base = nombre.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    const id = `eq_${Date.now().toString(36)}_${base}`;
    await storage.addEquipo(sim.id, { id, nombre, password:hashPassword(password), passwordPlain:password,
      rol:'equipo', miembros: Array.isArray(miembros)?miembros:[] });
    return send(res, 200, { ok: true, id, nombre });
  }

// ══ BLOQUE C — nueva ruta POST /admin/bots (añadir TRAS POST /admin/equipos) ═
// BUSCA: if (url.match(/^\/admin\/equipos\/[^/]+\/reset-envio$/) && method === 'POST') {
// AÑADE este bloque JUSTO ANTES de esa línea:

  if (url === '/admin/bots' && method === 'GET') {
    // Lista los perfiles disponibles y los bots ya registrados en la simulación
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipos   = await storage.getEquipos(sim.id);
    const botsActuales = equipos.filter(eq => eq.isBot);
    return send(res, 200, {
      perfiles:     Object.entries(PERFILES_BOT).map(([k, v]) => ({ id: k, ...v })),
      plantillas:   listarPlantillas(),
      bots:         botsActuales,
    });
  }

  if (url === '/admin/bots' && method === 'POST') {
    // Agrega un bot a la simulación actual
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });

    const { perfil, nombre } = body;
    if (!perfil || !PERFILES_BOT[perfil]) {
      return send(res, 400, {
        error: `Perfil inválido. Disponibles: ${Object.keys(PERFILES_BOT).join(', ')}`,
      });
    }

    const nombreBot    = (nombre || `Bot ${perfil}`).trim().slice(0, 40);
    const baseNombre   = nombreBot.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const botId        = `bot_${Date.now().toString(36)}_${baseNombre}`;

    const botEquipo = {
      id:           botId,
      nombre:       nombreBot,
      rol:          'equipo',
      isBot:        true,
      perfil,
      password:     hashPassword(botId),   // password = propio ID (los bots no inician sesión)
      passwordPlain: '—',
      miembros:     [],
      registradoAt: new Date().toISOString(),
    };

    await storage.addEquipo(sim.id, botEquipo);
    console.log(`[server] Bot agregado | id: ${botId} | perfil: ${perfil} | sim: ${sim.id}`);
    return send(res, 200, { ok: true, id: botId, nombre: nombreBot, perfil });
  }

  if (url.match(/^\/admin\/bots\/[^/]+$/) && method === 'DELETE') {
    // Elimina un bot de la simulación
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const botId  = url.split('/')[3];
    const equipos = await storage.getEquipos(sim.id);
    const bot     = equipos.find(eq => eq.id === botId && eq.isBot);
    if (!bot) return send(res, 404, { error: 'Bot no encontrado' });
    const restantes = equipos.filter(eq => eq.id !== botId);
    await storage.updateSimulacion(sim.id, { users: restantes });
    return send(res, 200, { ok: true });
  }


  if (url.match(/^\/admin\/equipos\/[^/]+\/reset-envio$/) && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (sim.config.roundState === 'simulated') return send(res, 400, { error: 'Ya simulada' });
    const dec = ronda.decisiones[eqId];
    if (!dec) return send(res, 404, { error: 'Sin decisiones' });
    dec.submitted = false; dec.submittedAt = null;
    await storage.updateRonda(sim.id, sim.config.currentRound, { decisiones: ronda.decisiones });
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/equipos\/[^/]+\/password$/) && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    const equipos = await storage.getEquipos(sim.id);
    const eq = equipos.find(e => e.id === eqId);
    if (!eq) return send(res, 404, { error: 'No encontrado' });
    eq.password = hashPassword(body.password);
    eq.passwordPlain = body.password;
    await storage.updateSimulacion(sim.id, { users: equipos });
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/equipos\/[^/]+$/) && method === 'DELETE') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[3];
    let equipos = await storage.getEquipos(sim.id);
    const idx = equipos.findIndex(e => e.id === eqId);
    if (idx === -1) return send(res, 404, { error: 'No encontrado' });
    equipos.splice(idx, 1);
    await storage.updateSimulacion(sim.id, { users: equipos });
    return send(res, 200, { ok: true });
  }

  // ─── ADMIN — Rondas ───────────────────────────────────────────
  if (url === '/admin/ronda' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Selecciona una simulación primero' });
    const cfg = sim.config;
    const ronda = await storage.getRonda(sim.id, cfg.currentRound);
    const equipos = await storage.getEquipos(sim.id);
    // Contar enviados: primero ronda.decisiones, luego sim_decisiones como fallback
    let enviados = ronda ? equipos.filter(eq => ronda.decisiones[eq.id]?.submitted).length : 0;
    if (enviados === 0 && ronda) {
      // Multiproducto: buscar en claves expandidas eq_xxx__prod_N
      const envSet = new Set();
      Object.entries(ronda.decisiones||{}).forEach(([k,d]) => {
        if (d?.submitted) {
          const eq = equipos.find(e => k === e.id || k.startsWith(e.id + '__'));
          if (eq) envSet.add(eq.id);
        }
      });
      if (envSet.size > 0) enviados = envSet.size;
    }
    return send(res, 200, { currentRound:cfg.currentRound, totalRounds:cfg.totalRounds,
      roundState:cfg.roundState, total:equipos.length, enviados,
      abiertaAt:ronda?.abiertaAt, ejecutadaAt:ronda?.ejecutadaAt });
  }

  if (url === '/admin/ronda/activar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    if (sim.config.roundState !== 'pending') return send(res, 400, { error: 'No está pendiente' });
    sim.config.roundState = 'open';
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (ronda) ronda.estado = 'open';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    await storage.updateRonda(sim.id, sim.config.currentRound, { estado: 'open' });
    return send(res, 200, { ok: true, currentRound: sim.config.currentRound });
  }

  if (url === '/admin/ronda/cerrar' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    if (sim.config.roundState !== 'open') return send(res, 400, { error: 'No está abierta' });
    sim.config.roundState = 'locked';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/ronda/pre-simular' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (!['open','locked'].includes(sim.config.roundState)) return send(res, 400, { error: 'Estado incorrecto' });
    if (['simulated','calculada'].includes(ronda.estado)) return send(res, 400, { error: 'Ya simulada' });
    const equipos = await storage.getEquipos(sim.id);
    // Si no hay decisiones en ronda.decisiones, usar defaultDecision para todos
    let decisiones = equipos.filter(eq => ronda.decisiones[eq.id]).map(eq => ({...ronda.decisiones[eq.id]}));
    if (!decisiones.length) {
      // Generar defaultDecision con datos financieros de ronda anterior
      const prevRonda = await storage.getRonda(sim.id, n-1);
      const resObj = prevRonda?.resultados?.resultados || prevRonda?.resultados || {};
      decisiones = equipos.filter(eq => !eq.isBot).map(eq => {
        const dec = storage.defaultDecision(eq.id, eq.nombre, sim.parametros);
        const resPrev = Object.values(resObj).find(r =>
          r.equipoOriginal === eq.id || r.equipo === eq.id || (r.equipo||'').startsWith(eq.id)
        );
        if (resPrev) {
          dec.cajaInicial           = Math.max(0, resPrev.cajaFinal ?? 0);
          dec.cxcInicial            = Math.max(0, resPrev.cxcFinal ?? 0);
          dec.deudaInicial          = Math.max(0, resPrev.deudaFinal ?? 0);
          dec.activosFijosIniciales = Math.max(0, resPrev.afNetos ?? resPrev.activosFijosNetos ?? 80000);
          dec.brandEquityInicial    = resPrev.brandEquityFinal ?? 50;
          dec.vendedoresIniciales   = Math.max(1, resPrev.vendedoresFinales ?? 2);
          dec.operariosIniciales    = Math.max(1, resPrev.operariosFinales ?? 4);
          dec.resultadoAcumuladoAnterior = resPrev.resultadoAcumulado ?? 0;
        }
        return dec;
      });
    }
    if (!decisiones.length) return send(res, 400, { error: 'Sin equipos registrados' });
    try {
      const simCfg = {
        params: sim.parametros,
        tiposProducto: sim.tipos_producto,
        canales: sim.canales,
        segmentos: sim.segmentos,
        afinidadMatrix: sim.afinidad_matrix,
        competenciaExterna: sim.competencia_externa
      };
      const preResult = calcularPreSimulacion(decisiones, simCfg);
      const preSimulacion = {};
      preResult.resultado.forEach(r => { preSimulacion[r.equipo] = { ...r, confirmado: false }; });
      await storage.updateRonda(sim.id, n, { preSimulacion, preSimMercado: preResult.mercadoSegmentos });
      sim.config.roundState = 'pre-sim';
      await storage.updateSimulacion(sim.id, { config: sim.config });
      return send(res, 200, { ok: true, equiposCalculados: preResult.resultado.length, detalle: preResult.resultado });
    } catch(e) { return send(res, 500, { error: e.message }); }
  }

  if (url === '/api/presim' && method === 'GET') {
    if (needAuth()) return;
    if (!sim) return send(res, 404, { error: 'Sin simulación' });
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda?.preSimulacion) return send(res, 404, { error: 'Sin datos de pre-simulación' });
    if (s.rol === 'superadmin' || s.rol === 'profesor') {
      const equipos = await storage.getEquipos(sim.id);
      const eqMap = {};
      equipos.forEach(eq => { eqMap[eq.id] = eq.nombre; });
      // Consolidar por empresa (equipoOriginal) para multiproducto
      const rawDetalle = Object.values(ronda.preSimulacion).map(r => ({...r, equipoNombre: resolveNombre(r, eqMap)}));
      const porEmpresa = {};
      rawDetalle.forEach(r => {
        const eqId = r.equipoOriginal || r.equipo;
        if (!porEmpresa[eqId]) {
          porEmpresa[eqId] = {
            equipo: eqId,
            equipoNombre: r.equipoNombre,
            confirmado: r.confirmado,
            productos: []
          };
        }
        // Si algún producto está confirmado, la empresa está confirmada
        if (r.confirmado) porEmpresa[eqId].confirmado = true;
        porEmpresa[eqId].productos.push({
          producto:        r.producto,
          segmento:        r.segmento || r.segmentoObjetivo,
          demandaFormal:   r.demandaFormal,
          shareEstimado:   r.shareEstimado,
          demandaAsignada: r.demandaAsignada,
          inventario:      r.inventario,
          ventasEstimadas: r.ventasEstimadas,
        });
      });
      const detalle = Object.values(porEmpresa);
      return send(res, 200, { roundState: sim.config.roundState, total: detalle.length,
        confirmados: detalle.filter(r=>r.confirmado).length, detalle, mercadoSegmentos: ronda.preSimMercado||[] });
    } else {
      // Buscar TODOS los productos del equipo (puede tener hasta 5)
      const misDatos = Object.values(ronda.preSimulacion || {}).filter(
        p => p.equipoOriginal === s.userId
          || p.equipo === s.userId
          || p.equipo?.startsWith(s.userId)
      );
      if (!misDatos.length) return send(res, 404, { error: 'Sin datos para tu equipo' });
      // Compatibilidad: si tiene 1 solo producto retornar presim como objeto
      // Si tiene múltiples retornar presim como array
      const presim = misDatos.length === 1 ? misDatos[0] : misDatos;
      return send(res, 200, { roundState: sim.config.roundState, presim, mercadoSegmentos: ronda.preSimMercado||[] });
    }
  }

  if (url === '/api/presim/confirmar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda?.preSimulacion) return send(res, 400, { error: 'Sin pre-simulación activa' });
    if (sim.config.roundState !== 'pre-sim') return send(res, 400, { error: 'No hay pre-simulación activa' });
    // Buscar la clave correcta (puede ser ID expandido eq_xxx__prod_1)
    // Confirmar TODOS los productos del equipo
    const psKeys = Object.keys(ronda.preSimulacion).filter(
      k => k === s.userId
        || ronda.preSimulacion[k].equipoOriginal === s.userId
        || k.startsWith(s.userId)
    );
    if (!psKeys.length) return send(res, 404, { error: 'Sin datos para tu equipo' });
    psKeys.forEach(k => {
      ronda.preSimulacion[k].confirmado = true;
      ronda.preSimulacion[k].confirmadoAt = new Date().toISOString();
    });
    await storage.updateRonda(sim.id, sim.config.currentRound, { preSimulacion: ronda.preSimulacion });
    return send(res, 200, { ok: true });
  }

  if (url.match(/^\/admin\/presim\/forzar\/[^/]+$/) && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const eqId = url.split('/')[4];
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda?.preSimulacion?.[eqId]) return send(res, 404, { error: 'Equipo no encontrado' });
    ronda.preSimulacion[eqId].confirmado = true;
    ronda.preSimulacion[eqId].forzadoPor = 'admin';
    ronda.preSimulacion[eqId].confirmadoAt = new Date().toISOString();
    await storage.updateRonda(sim.id, sim.config.currentRound, { preSimulacion: ronda.preSimulacion });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/presim/forzar-todos' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const ronda = await storage.getRonda(sim.id, sim.config.currentRound);
    if (!ronda?.preSimulacion) return send(res, 400, { error: 'Sin pre-simulación activa' });
    for (const r of Object.values(ronda.preSimulacion)) {
      if (!r.confirmado) { r.confirmado = true; r.forzadoPor = 'admin'; r.confirmadoAt = new Date().toISOString(); }
    }
    await storage.updateRonda(sim.id, sim.config.currentRound, { preSimulacion: ronda.preSimulacion });
    return send(res, 200, { ok: true });
  }

// ══ BLOQUE D — reemplaza la ruta POST /admin/simular ════════════════════════
// v2 — auto-forzar confirmaciones + defaultDecision sin decisiones
// BUSCA: if (url === '/admin/simular' && method === 'POST') { ... }
// REEMPLAZA todo el bloque if con esto:

  if (url === '/admin/simular' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });

    const n     = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda)                       return send(res, 400, { error: 'Sin ronda' });
    if (['simulated','calculada'].includes(ronda.estado)) return send(res, 400, { error: 'Ya simulada' });
    if (!['open', 'locked', 'pre-sim'].includes(sim.config.roundState))
      return send(res, 400, { error: 'Estado incorrecto' });
    if (sim.config.roundState === 'pre-sim') {
      // Auto-forzar confirmaciones pendientes antes de ejecutar
      const preSimulacion = ronda.preSimulacion || {};
      let forzados = 0;
      Object.values(preSimulacion).forEach(r => {
        if (!r.confirmado) {
          r.confirmado = true;
          r.forzadoPor = 'auto-simular';
          r.confirmadoAt = new Date().toISOString();
          forzados++;
        }
      });
      if (forzados > 0) {
        await storage.updateRonda(sim.id, n, { preSimulacion });
        console.log(`[server] Auto-forzadas ${forzados} confirmaciones antes de simular`);
      }
    }

    const equipos = await storage.getEquipos(sim.id);
    if (!equipos.length) return send(res, 400, { error: 'Sin equipos' });

    // Etapa 2.2: construir mapa de demandaBase de la ronda anterior
    const demandaBaseAnteriorMap = {};
    if (n > 1) {
      const rondaPrevia = await storage.getRonda(sim.id, n - 1);
      if (rondaPrevia?.mercadoSegmentos?.length) {
        rondaPrevia.mercadoSegmentos.forEach(seg => {
          demandaBaseAnteriorMap[seg.nombre] = seg.demandaBase;
        });
      }
    }

    const simCfg = {
      meta:                  sim.config.industria ? { nombre: sim.config.industria } : {},
      params:                sim.parametros,
      tiposProducto:         sim.tipos_producto,
      canales:               sim.canales,
      segmentos:             sim.segmentos,
      afinidadMatrix:        sim.afinidad_matrix,
      competenciaExterna:    sim.competencia_externa,
      demandaBaseAnteriorMap,  // Etapa 2.2: demanda dinámica
      rondaNumero:    n,         // Etapa 3.1: número de ronda para lead time
      proveedores:    sim.proveedores || [],  // Etapa 3.1: catálogo de proveedores
    };

    // ── Generar decisiones de bots ─────────────────────────────────────────
    const botsDeEstaSimulacion = equipos.filter(eq => eq.isBot);
    if (botsDeEstaSimulacion.length > 0) {
      console.log(`[server] Generando decisiones para ${botsDeEstaSimulacion.length} bot(s)...`);

      // Construir historial de las últimas 2 rondas para contexto de los bots
      const historialRondas = [];
      for (let i = Math.max(1, n - 2); i < n; i++) {
        const rondaHist = await storage.getRonda(sim.id, i);
        if (rondaHist) historialRondas.push({ numero: i, ...rondaHist });
      }

      // Generar decisiones de todos los bots en paralelo
      await Promise.allSettled(
        botsDeEstaSimulacion.map(async (bot) => {
          try {
            const historialBot = {
              rondaActual:    n,
              ultimas2Rondas: historialRondas,
              resultados:     historialRondas.map(r => r.resultados?.[bot.id]).filter(Boolean),
            };
            const decisionBot = await generarDecisionBot(bot, historialBot, simCfg);

            // Guardar la decisión del bot en la ronda (dual-write)
            ronda.decisiones[bot.id] = decisionBot;
            await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });

            console.log(`[server] ✓ Decisión generada para bot "${bot.nombre}" (${bot.perfil})`);
          } catch (errBot) {
            console.error(`[server] ✗ Error generando decisión para bot "${bot.nombre}": ${errBot.message}`);
          }
        })
      );
    }

    // ── Ejecutar el motor con todas las decisiones (humanos + bots) ────────
    // Recargar la ronda para incluir las decisiones de bots recién guardadas
    const rondaActualizada = await storage.getRonda(sim.id, n);
    // Combinar decisiones de ronda original + rondaActualizada (bots pueden estar en cualquiera)
    const decsCombinadas = { ...ronda.decisiones, ...(rondaActualizada.decisiones||{}) };
    let decisiones = equipos
      .filter(eq => decsCombinadas[eq.id])
      .map(eq => ({ ...decsCombinadas[eq.id] }));

    // Si aún no hay decisiones, generar defaultDecision para todos
    if (!decisiones.length) {
      const prevRonda2 = await storage.getRonda(sim.id, n-1);
      const resObj2 = prevRonda2?.resultados?.resultados || prevRonda2?.resultados || {};
      decisiones = equipos.filter(eq => !eq.isBot).map(eq => {
        const dec = storage.defaultDecision(eq.id, eq.nombre, sim.parametros);
        const resPrev2 = Object.values(resObj2).find(r =>
          r.equipoOriginal === eq.id || r.equipo === eq.id || (r.equipo||'').startsWith(eq.id)
        );
        if (resPrev2) {
          dec.cajaInicial           = Math.max(0, resPrev2.cajaFinal ?? 0);
          dec.cxcInicial            = Math.max(0, resPrev2.cxcFinal ?? 0);
          dec.deudaInicial          = Math.max(0, resPrev2.deudaFinal ?? 0);
          dec.activosFijosIniciales = Math.max(0, resPrev2.afNetos ?? resPrev2.activosFijosNetos ?? 80000);
          dec.brandEquityInicial    = resPrev2.brandEquityFinal ?? 50;
          dec.vendedoresIniciales   = Math.max(1, resPrev2.vendedoresFinales ?? 2);
          dec.operariosIniciales    = Math.max(1, resPrev2.operariosFinales ?? 4);
        }
        return dec;
      });
    }

    if (!decisiones.length) return send(res, 400, { error: 'Sin equipos registrados' });
    console.log(`[server] Ejecutando simulación R${n} con ${decisiones.length} equipos`);

    try {
      const result = ejecutarSimulador(decisiones, simCfg);

      rondaActualizada.estado      = 'simulated';
      rondaActualizada.ejecutadaAt = new Date().toISOString();
      rondaActualizada.mercadoSegmentos = result.mercadoSegmentos;
      rondaActualizada.atractivoEquipos = result.atractivoEquipos;
      rondaActualizada.dashboard        = result.dashboard;
      rondaActualizada.empresas         = result.empresas;

      result.resultados.forEach(r => { rondaActualizada.resultados[r.equipo] = r; });

      const reportes = {};
      for (const d of decisiones) {
        reportes[d.equipo] = generarReportes(
          d, result.mercadoSegmentos, result.atractivoEquipos, rondaActualizada.resultados, simCfg
        );
      }
      rondaActualizada.reportes = reportes;

      sim.config.roundState = 'simulated';
      await storage.updateSimulacion(sim.id, { config: sim.config });
      await storage.updateRonda(sim.id, n, {
        estado:           rondaActualizada.estado,
        ejecutadaAt:      rondaActualizada.ejecutadaAt,
        mercadoSegmentos: rondaActualizada.mercadoSegmentos,
        atractivoEquipos: rondaActualizada.atractivoEquipos,
        dashboard:        rondaActualizada.dashboard,
        empresas:         rondaActualizada.empresas,
        resultados:       rondaActualizada.resultados,
        reportes:         rondaActualizada.reportes,
      });

      // ── Notificación WebSocket a todos los clientes de esta simulación ──
      const nHumanos = decisiones.filter(d => !d.isBot).length;
      const nBots    = decisiones.filter(d =>  d.isBot).length;
      const topEquipo = [...result.resultados]
        .sort((a, b) => b.utilidadNeta - a.utilidadNeta)[0];

      broadcast(sim.id, 'ronda_calculada', {
        ronda:           n,
        equiposSimulados: decisiones.length,
        equiposHumanos:   nHumanos,
        equiposBots:      nBots,
        dashboard:        result.dashboard,
        lider: topEquipo ? {
          equipo:       topEquipo.equipoNombre || topEquipo.equipo,
          utilidadNeta: topEquipo.utilidadNeta,
          shareReal:    topEquipo.shareReal,
        } : null,
        mensaje: `✅ Ronda ${n} calculada — ${nHumanos} equipo(s) compitieron.`,
      });

      console.log(`[server] Ronda ${n} simulada | sim: ${sim.id} | equipos: ${decisiones.length} (${nBots} bots)`);
      return send(res, 200, {
        ok: true,
        ronda: n,
        equiposSimulados: decisiones.length,
        equiposHumanos:   nHumanos,
        equiposBots:      nBots,
      });
    } catch (e) {
      console.error('[server] Error en motor de simulación:', e.message, e.stack);
      return send(res, 500, { error: e.message });
    }
  }



  if (url === '/admin/ronda/siguiente' && method === 'POST') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    if (sim.config.roundState !== 'simulated') return send(res, 400, { error: 'Simula primero' });
    const next = sim.config.currentRound + 1;
    if (next > sim.config.totalRounds) return send(res, 400, { error: 'Todas las rondas completadas' });
    sim.config.currentRound = next;
    sim.config.roundState = 'pending';
    await storage.updateSimulacion(sim.id, { config: sim.config });
    await storage.ensureRonda(sim.id, next);
    return send(res, 200, { ok: true, currentRound: next });
  }

  if (url.match(/^\/admin\/resultados\/\d+$/) && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || !['simulated','calculada'].includes(ronda.estado)) return send(res, 404, { error: 'Sin resultados' });
    const equipos = await storage.getEquipos(sim.id);
    const eqMap = {};
    equipos.forEach(eq => { eqMap[eq.id] = eq.nombre; });
    // Consolidar por empresa (equipoOriginal) — multiproducto puede tener N resultados por equipo
    const rawResultados = Object.values(ronda.resultados);
    const porEmpresa = {};
    rawResultados.forEach(r => {
      const eqId = r.equipoOriginal || r.equipo;
      if (!porEmpresa[eqId]) {
        // Primera vez: inicializar con los datos de empresa
        porEmpresa[eqId] = { ...r, productos: [r] };
      } else {
        // Acumular campos variables (ventas, costos, márgenes)
        const sumar = ['ventasBrutas','ventasNetas','ventasReales','costoVentas',
          'utilidadBruta','gastosOp','utilidadNeta','ebit',
          'ivaAPagar','impuestoIT','impuestoIUE','totalImpuestos',
          'pagoProduccion','pagoMktTotal','totalPagos','cobrosContado',
          'cxcFinal','invFinalValorizado','inventarioFinal','ingresoPrestamo',
          'publicidad','comisiones','roiMarketing','demandaAsignada','demandaFormal'];
        sumar.forEach(k => {
          porEmpresa[eqId][k] = (porEmpresa[eqId][k] || 0) + (r[k] || 0);
        });
        // Campos de empresa: tomar del primer producto (son únicos por empresa)
        // cajaFinal, deudaFinal, patrimonio, totalActivos ya están en el primero
        porEmpresa[eqId].productos.push(r);
      }
    });

    // Calcular shareReal total por empresa (suma de shares de todos sus productos)
    Object.values(porEmpresa).forEach(e => {
      if (e.productos.length > 1) {
        e.shareReal = e.productos.reduce((s,p) => s + (p.shareReal||0), 0);
        e.producto  = 'Multiproducto (' + e.productos.length + ')';
        e.segmento  = [...new Set(e.productos.map(p => p.segmento||'—'))].join(', ');
      }
    });

    const resultados = Object.values(porEmpresa).map(r => ({
      ...r,
      equipoNombre: resolveNombre(r, eqMap),
      alertaCaja:   (r.cajaFinal ?? 0) < 0 ? 'ALERTA' : 'OK',
      segmento:     r.segmento || r.segmentoObjetivo || '—',
    }));

    // Etapa 3.5: resumen fiscal agregado del período
    const dashboardFiscal = {
      totalIT:          resultados.reduce((s, r) => s + (r.impuestoIT  ?? 0), 0),
      totalIVA:         resultados.reduce((s, r) => s + (r.ivaAPagar   ?? 0), 0),
      totalIUE:         resultados.reduce((s, r) => s + (r.impuestoIUE ?? 0), 0),
      totalImpuestos:   resultados.reduce((s, r) => s + (r.totalImpuestos ?? (r.ivaAPagar ?? 0) + (r.impuestoIT ?? 0) + (r.impuestoIUE ?? 0)), 0),
      utilidadBrutaTotal: resultados.reduce((s, r) => s + (r.utilidadBruta ?? 0), 0),
      presionFiscalPct: (() => {
        const ub = resultados.reduce((s, r) => s + (r.utilidadBruta ?? 0), 0);
        const ti = resultados.reduce((s, r) => s + (r.totalImpuestos ?? 0), 0);
        return ub > 0 ? Math.round(ti / ub * 10000) / 100 : 0;
      })(),
      porEquipo: resultados.map(r => ({
        equipoNombre:   r.equipoNombre,
        impuestoIT:     r.impuestoIT     ?? 0,
        ivaAPagar:      r.ivaAPagar      ?? 0,
        impuestoIUE:    r.impuestoIUE    ?? 0,
        totalImpuestos: r.totalImpuestos ?? ((r.ivaAPagar??0)+(r.impuestoIT??0)+(r.impuestoIUE??0)),
        nProductos:     r.productos?.length ?? 1,
      })),
    };

    return send(res, 200, { ronda: n, estado: ronda.estado, ejecutadaAt: ronda.ejecutadaAt,
      resultados, mercadoSegmentos: ronda.mercadoSegmentos, dashboard: ronda.dashboard,
      dashboardFiscal });  // Etapa 3.5
  }

  if (url === '/admin/historial' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const hist = [];
    for (let i = 1; i <= sim.config.currentRound; i++) {
      const r = await storage.getRonda(sim.id, i);
      if (!r) continue;
      const equipos = await storage.getEquipos(sim.id);
      hist.push({ ronda:i, estado:r.estado, ejecutadaAt:r.ejecutadaAt,
        enviados: (() => {
              const ids = new Set();
              Object.keys(r.decisiones||{}).forEach(k => {
                if (r.decisiones[k]?.submitted) {
                  const eq = equipos.find(e => k.startsWith(e.id) || k===e.id);
                  if (eq) ids.add(eq.id);
                }
              });
              return ids.size;
            })(), total: equipos.length });
    }
    return send(res, 200, hist);
  }

  // ─── ADMIN — Config ───────────────────────────────────────────
  if (url === '/admin/config' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, {
      parametros: sim.parametros,
      tiposProducto: sim.tipos_producto,
      canales: sim.canales,
      segmentos: sim.segmentos,
      afinidadMatrix: sim.afinidad_matrix,
      competenciaExterna: sim.competencia_externa,
      mercadoSegmentos: calcularMercadoSegmentos(sim.parametros, sim.segmentos),
    });
  }

  if (url === '/admin/parametros' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { parametros } = body;
    if (!parametros) return send(res, 400, { error: 'Datos requeridos' });
    const newParams = { ...sim.parametros, ...parametros };
    await storage.updateSimulacion(sim.id, { parametros: newParams });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/tiposproducto' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { tiposProducto } = body;
    if (!tiposProducto) return send(res, 400, { error: 'Datos requeridos' });
    const newTipos = { ...sim.tipos_producto };
    for (const k of Object.keys(newTipos)) {
      if (tiposProducto[k]?.costoBase !== undefined) newTipos[k].costoBase = +tiposProducto[k].costoBase;
    }
    await storage.updateSimulacion(sim.id, { tipos_producto: newTipos });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/canales' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { canales } = body;
    if (!canales) return send(res, 400, { error: 'Datos requeridos' });
    const newCanales = { ...sim.canales };
    for (const k of Object.keys(newCanales)) {
      if (!canales[k]) continue;
      for (const f of ['costoAdicionalUnitario','comisionPct','factorImpactoVendedores','bonoAtractivo']) {
        if (canales[k][f] !== undefined) newCanales[k][f] = +canales[k][f];
      }
    }
    await storage.updateSimulacion(sim.id, { canales: newCanales });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/segmentos' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, sim.segmentos);
  }
  if (url === '/admin/segmentos' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { segmentos } = body;
    if (!Array.isArray(segmentos)) return send(res, 400, { error: 'Array requerido' });
    const newSegmentos = segmentos.map(s => ({
      nombre: String(s.nombre||'').trim(),
      demandaBase: +s.demandaBase,
      pctContrabando: +s.pctContrabando,
      indiceExterno: +s.indiceExterno,
      tendencia: String(s.tendencia||''),
      descripcion: String(s.descripcion||''),
    }));
    await storage.updateSimulacion(sim.id, { segmentos: newSegmentos });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/afinidad' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, sim.afinidad_matrix);
  }
  if (url === '/admin/afinidad' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { afinidadMatrix } = body;
    if (!afinidadMatrix) return send(res, 400, { error: 'Datos requeridos' });
    const newAfinidad = { ...sim.afinidad_matrix };
    for (const prod of Object.keys(newAfinidad)) {
      if (Array.isArray(afinidadMatrix[prod])) newAfinidad[prod] = afinidadMatrix[prod].map(v => +v);
    }
    await storage.updateSimulacion(sim.id, { afinidad_matrix: newAfinidad });
    return send(res, 200, { ok: true });
  }

  if (url === '/admin/competencia' && method === 'GET') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    return send(res, 200, sim.competencia_externa);
  }
  if (url === '/admin/competencia' && method === 'PUT') {
    if (needAdmin()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const { competencia } = body;
    if (!Array.isArray(competencia)) return send(res, 400, { error: 'Array requerido' });
    const newCompetencia = competencia.map(c => ({
      segmento: String(c.segmento||''),
      nombre: String(c.nombre||''),
      precio: +c.precio,
      calidad: +c.calidad,
      marketing: +c.marketing,
      participacionRef: +c.participacionRef,
    }));
    await storage.updateSimulacion(sim.id, { competencia_externa: newCompetencia });
    return send(res, 200, { ok: true });
  }

  // ─── EQUIPO — Decisiones ──────────────────────────────────────
  if (url === '/api/decisiones' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const n = sim.config.currentRound;
    let ronda = await storage.getRonda(sim.id, n);
    if (!ronda) {
      ronda = await storage.ensureRonda(sim.id, n);
    }
    if (!ronda.decisiones[equipoId]) {
      const equipos = await storage.getEquipos(sim.id);
      const eq = equipos.find(e => e.id === equipoId);
      ronda.decisiones[equipoId] = storage.defaultDecision(equipoId, eq?.nombre||equipoId, sim.parametros);
      await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });
    }
    const cfg = {
      params: sim.parametros,
      tiposProducto: sim.tipos_producto,
      canales: sim.canales,
      segmentos: sim.segmentos,
      afinidadMatrix: sim.afinidad_matrix,
      competenciaExterna: sim.competencia_externa
    };
    return send(res, 200, {
      ronda: n,
      roundState: sim.config.roundState,
      decision: ronda.decisiones[equipoId],
      referencia: {
        segmentos: cfg.segmentos,
        tiposProducto: Object.keys(cfg.tiposProducto).map(k => ({ nombre:k, costoBase: cfg.tiposProducto[k].costoBase })),
        canales: Object.keys(cfg.canales).map(k => ({ nombre:k, ...cfg.canales[k] })),
        parametros: {
          costoInvestigacionBasica: cfg.params.costoInvestigacionBasica,
          costoInvestigacionPremium: cfg.params.costoInvestigacionPremium,
          costoContratacionVendedor: cfg.params.costoContratacionVendedor,
          costoDespidoVendedor: cfg.params.costoDespidoVendedor,
          sueldoTrimestralVendedor: cfg.params.sueldoTrimestralVendedor,
          gastoAdminFijo: cfg.params.gastoAdminFijo,
          gastoFijoPlanta: cfg.params.gastoFijoPlanta,
          capacidadMaxProduccion: cfg.params.capacidadMaxProduccion,
          tasaPrestamoOperativo: cfg.params.tasaPrestamoOperativo,
          tasaPrestamoInversion: cfg.params.tasaPrestamoInversion,
          plazoPrestamoOperativo: cfg.params.plazoPrestamoOperativo,
          plazoPrestamoInversion: cfg.params.plazoPrestamoInversion,
          comisionAperturaPrestamo: cfg.params.comisionAperturaPrestamo,
          // Etapa 3.1: params de materia prima
          unidadesMPporUnidad:         cfg.params.unidadesMPporUnidad    ?? 1,
          costoAlmacenamientoMP:       cfg.params.costoAlmacenamientoMP  ?? 0.05,
          // Etapa 3.2: params de operarios
          operariosIniciales:          cfg.params.operariosIniciales          ?? 4,
          productividadBase:           cfg.params.productividadBase           ?? 440,
          costoOperario:               cfg.params.costoOperario               ?? 3200,
          costoContratacionOperario:   cfg.params.costoContratacionOperario   ?? 800,
          costoDespidoOperario:        cfg.params.costoDespidoOperario        ?? 1200,
          factorCapacitacion:          cfg.params.factorCapacitacion          ?? 0.05,
        },
        // Etapa 3.1: catálogo de proveedores para la hoja de decisión
        // Fallback: si la sim se creó antes de la Etapa 3.1, leer de la plantilla
        proveedores: (() => {
          // Etapa 3.1: prioridad → sim.proveedores → JSON de industria → []
          if (sim.proveedores?.length) return sim.proveedores;
          try {
            // Buscar el JSON de industria directamente (sin depender de plantillas.js)
            const industria = (sim.config?.industria || 'jaboncillos_v1')
              .replace(/[^a-zA-Z0-9_-]/g, '');
            // Buscar en industrias/ relativo al directorio de server.js
            const posibles = [
              path.join(__dirname, 'industrias', `${industria}.json`),
              path.join(__dirname, '..', 'industrias', `${industria}.json`),
              path.join(__dirname, `${industria}.json`),
            ];
            for (const ruta of posibles) {
              if (fs.existsSync(ruta)) {
                const raw = JSON.parse(fs.readFileSync(ruta, 'utf8'));
                if (raw.proveedores?.length) return raw.proveedores;
              }
            }
            return [];
          } catch { return []; }
        })(),
      },
    });
  }

  if (url === '/api/decisiones/guardar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    // FIX: normalizar tipoProducto -> producto en el servidor (defensa en profundidad)
    // El formulario legado envía tipoProducto; garantizar que producto siempre exista.
    if (body.decision && !body.decision.producto && body.decision.tipoProducto) {
      body.decision.producto = body.decision.tipoProducto;
    }
    if (body.decision?.productos?.[0] && !body.decision.productos[0].producto) {
      body.decision.productos[0].producto =
        body.decision.producto || body.decision.tipoProducto || '';
    }
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (['simulated','calculada'].includes(ronda.estado)) return send(res, 400, { error: 'Ronda simulada' });
    if (sim.config.roundState === 'pending') return send(res, 400, { error: 'Ronda no habilitada' });
    const cur = ronda.decisiones[equipoId] || {};
    ronda.decisiones[equipoId] = { ...cur, ...body.decision, equipo: equipoId, submitted: cur.submitted||false };
    await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });
    return send(res, 200, { ok: true });
  }

  if (url === '/api/decisiones/enviar' && method === 'POST') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    // FIX: normalizar tipoProducto -> producto (defensa en profundidad)
    if (body.decision && !body.decision.producto && body.decision.tipoProducto) {
      body.decision.producto = body.decision.tipoProducto;
    }
    if (body.decision?.productos?.[0] && !body.decision.productos[0].producto) {
      body.decision.productos[0].producto =
        body.decision.producto || body.decision.tipoProducto || '';
    }
    const n = sim.config.currentRound;
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda) return send(res, 400, { error: 'Sin ronda' });
    if (['simulated','calculada'].includes(ronda.estado)) return send(res, 400, { error: 'Ronda simulada' });
    if (sim.config.roundState === 'pending') return send(res, 400, { error: 'Ronda no habilitada' });
    const cur = ronda.decisiones[equipoId] || {};
    ronda.decisiones[equipoId] = { ...cur, ...body.decision, equipo: equipoId, submitted: true, submittedAt: new Date().toISOString() };
    await storage.updateRonda(sim.id, n, { decisiones: ronda.decisiones });
    return send(res, 200, { ok: true });
  }

  if (url === '/api/resultados' && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const equipoId = s.userId;
    const historial = [];
    for (let i = 1; i <= sim.config.currentRound; i++) {
      const r = await storage.getRonda(sim.id, i);
      if (!r || !['simulated','calculada'].includes(r.estado)) continue;
      // FIX multiproducto: retornar TODOS los productos del equipo
      const todosProductos = Object.values(r.resultados).filter(res =>
        res.equipoOriginal === equipoId
        || res.equipo === equipoId
        || (res.equipo || '').startsWith(equipoId)
      );
      if (!todosProductos.length) continue;

      // Si hay 1 producto: compatibilidad legado (resultado = objeto)
      // Si hay N productos: resultado = array + consolidado
      let resultado;
      if (todosProductos.length === 1) {
        resultado = todosProductos[0];
      } else {
        // Construir consolidado sumando campos numéricos de todos los productos
        const consolidado = { ...todosProductos[0] };
        const sumar = ['ventasBrutas','ventasNetas','ventasReales','costoVentas',
          'utilidadBruta','gastosOp','utilidadNeta','ebit',
          'ivaAPagar','impuestoIT','impuestoIUE','totalImpuestos',
          'pagoProduccion','pagoMktTotal','totalPagos',
          'cobrosContado','cxcFinal','invFinalValorizado','inventarioFinal',
          'ingresoPrestamo','publicidad','comisiones','roiMarketing'];
        sumar.forEach(k => {
          consolidado[k] = todosProductos.reduce((s,p) => s + (p[k]||0), 0);
        });
        // Campos de empresa (tomar del primer producto)
        consolidado.cajaFinal      = todosProductos[0].cajaFinal;
        consolidado.deudaFinal     = todosProductos[0].deudaFinal;
        consolidado.patrimonio     = todosProductos[0].patrimonio;
        consolidado.totalActivos   = todosProductos[0].totalActivos;
        consolidado.capitalContable= todosProductos[0].capitalContable;
        consolidado.afNetos        = todosProductos[0].afNetos;
        consolidado.brandEquityFinal = todosProductos[0].brandEquityFinal;
        consolidado.sobregiro      = todosProductos[0].sobregiro;
        consolidado.producto       = 'Multiproducto (' + todosProductos.length + ')';
        consolidado.productos      = todosProductos; // array completo para el desglose
        resultado = consolidado;
      }
      historial.push({ ronda:i, ejecutadaAt:r.ejecutadaAt, resultado,
        decision: r.decisiones?.[equipoId]||null, reportes: r.reportes?.[equipoId]||{} });
    }
    return send(res, 200, { currentRound: sim.config.currentRound, roundState: sim.config.roundState, historial });
  }

  if (url.match(/^\/api\/reportes\/\d+$/) && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || !['simulated','calculada'].includes(ronda.estado)) return send(res, 404, { error: 'Sin resultados' });
    return send(res, 200, { ronda: n, reportes: ronda.reportes?.[s.userId]||{} });
  }

  if (url.match(/^\/api\/dashboard\/\d+$/) && method === 'GET') {
    if (needEquipo()) return;
    if (!sim) return send(res, 400, { error: 'Sin simulación' });
    const n = parseInt(url.split('/')[3]);
    const ronda = await storage.getRonda(sim.id, n);
    if (!ronda || !['simulated','calculada'].includes(ronda.estado)) return send(res, 404, { error: 'Sin resultados' });
    const resultados = Object.values(ronda.resultados);
    const sorted = resultados.sort((a,b) => b.utilidadNeta - a.utilidadNeta);
    const ranking = sorted.map(r => ({ esYo: r.equipo===s.userId, utilidadNeta:r.utilidadNeta, ventas:r.ventasReales, share:r.shareReal, caja:r.cajaFinal }));
    const ebits = resultados.map(r => r.utilidadNeta);
    return send(res, 200, { ronda: n, ranking, stats: { ebitPromedio: ebits.reduce((a,b)=>a+b,0)/ebits.length, totalEquipos: ebits.length } });
  }

  return null;
}

// ── Servidor HTTP ─────────────────────────────────────────────
// ══ BLOQUE E — reemplaza el bloque final del servidor HTTP ═══════════════════
// BUSCA: const server = http.createServer(...)  hasta server.listen(...)
// REEMPLAZA con esto:

const server = http.createServer(async (req, res) => {
  const token = getSessionToken(req);
  req.session = token ? await getSessionFromDB(token) : null;
  req._sessionToken = token;

  const url = req.url.split('?')[0];

  // Archivos estáticos
  if (req.method === 'GET' && !url.startsWith('/auth') && !url.startsWith('/admin') && !url.startsWith('/api')) {
    let filePath = url === '/' ? path.join(PUB_DIR, 'index.html') : path.join(PUB_DIR, url);
    if (!filePath.startsWith(PUB_DIR)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    return fs.createReadStream(path.join(PUB_DIR, 'index.html')).pipe(res);
  }

  let body = {};
  try { body = await readBody(req); } catch {}

  try {
    const handled = await route(req, res, body);
    if (handled === null) send(res, 404, { error: 'Ruta no encontrada' });
  } catch(e) {
    console.error('Error en ruta:', e.message);
    send(res, 500, { error: 'Error interno del servidor' });
  }
});

// ── Adjuntar WebSocket al mismo servidor HTTP (mismo puerto, ruta /ws) ────────
initWebSocket(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  🚀  SimNego v3.2 — Fase 2: Bots · WS · Plantillas       ║`);
  console.log(`║  → http://localhost:${PORT}  (admin / admin123)                ║`);
  console.log(`║  → WebSocket: ws://localhost:${PORT}/ws?simId=<id>             ║`);
  console.log(`║  → Industrias: ${listarPlantillas().join(', ')}    ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
});