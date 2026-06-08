'use strict';
// ─────────────────────────────────────────────────────────────
//  SIMULADOR MARKETING — FRONTEND UNIFICADO
//  Maneja: Login · Admin · Equipo
// ─────────────────────────────────────────────────────────────

const fmt = {
  bs:  v => `Bs ${(+v||0).toLocaleString('es-BO',{maximumFractionDigits:0})}`,
  num: v => (+v||0).toLocaleString('es-BO',{maximumFractionDigits:0}),
  pct: v => `${((+v||0)*100).toFixed(2)}%`,
  d:   (v,n=2) => (+v||0).toFixed(n),
  dt:  s => s ? new Date(s).toLocaleString('es-BO',{dateStyle:'short',timeStyle:'short'}) : '—',
};

let charts = {};
let state = { me: null, ref: null, decisiones: null, resultados: null };

// modificaciones en public/app.js (listener WebSocket + UI de bots + selector de industria)
// =============================================================================
// INSTRUCCIONES DE APLICACIÓN:
//
//   1. BLOQUE A: Añadir el módulo WS_CLIENT justo DESPUÉS de la declaración
//      de `let state = { ... }` (alrededor de la línea 16).
//
//   2. BLOQUE B: En la función `doLogin()`, añadir `wsClient.conectar()`
//      DESPUÉS de que el login es exitoso y antes de retornar.
//      Busca: `toast(\`Bienvenido...`
//
//   3. BLOQUE C: Añadir el selector de industria al formulario de nueva
//      simulación. Busca el div con id="newSimCopyFrom" y añade el campo
//      después.
//
//   4. BLOQUE D: En `crearSimulacion()`, añadir la lectura del campo industria
//      al construir el body del POST.
//
//   5. BLOQUE E: Añadir la sección de Bots al final de `loadAdminEquipos()`.
//      El bloque se añade después del innerHTML del equiposTableWrap.
//
//   6. BLOQUE F: Añadir las funciones de gestión de bots (window.*Bot*).
//      Añadir después de `window.cambiarPassword`.
// =============================================================================


// ══ BLOQUE A — módulo WebSocket del cliente (añadir tras `let state = ...`) ═══

// ── WebSocket client ─────────────────────────────────────────────────────────
// Gestiona la conexión en tiempo real con el servidor.
// Se conecta automáticamente al seleccionar una simulación.
const wsClient = (() => {
  let socket = null;
  let simIdActivo = null;
  let intentosReconexion = 0;
  const MAX_INTENTOS = 8;
  const DELAY_BASE_MS = 1500;

  function conectar(simId) {
    // Si ya hay conexión para esta sim, no reconectar
    if (socket && socket.readyState === WebSocket.OPEN && simIdActivo === simId) return;
    // Cerrar conexión anterior si existe
    if (socket) { socket.close(); socket = null; }

    simIdActivo  = simId || state.currentSimId;
    if (!simIdActivo) return;  // sin sim activa, no conectar

    const rol      = state.me?.rol || 'equipo';
    const equipoId = state.me?.id  || '';
    const proto    = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url      = `${proto}//${location.host}/ws?simId=${simIdActivo}&rol=${rol}&equipoId=${equipoId}`;

    try {
      socket = new WebSocket(url);
    } catch (e) {
      console.warn('[ws] No se pudo crear WebSocket:', e.message);
      return;
    }

    socket.onopen = () => {
      intentosReconexion = 0;
      console.log(`[ws] ✓ Conectado a sim "${simIdActivo}"`);
    };

    socket.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      manejarEventoWS(msg.evento, msg.datos);
    };

    socket.onclose = (evt) => {
      console.log(`[ws] Conexión cerrada (código ${evt.code})`);
      socket = null;
      // Reconexión exponencial (solo si fue un cierre inesperado)
      if (evt.code !== 1000 && intentosReconexion < MAX_INTENTOS) {
        const delay = DELAY_BASE_MS * Math.pow(1.5, intentosReconexion);
        intentosReconexion++;
        console.log(`[ws] Reconectando en ${Math.round(delay / 1000)}s... (intento ${intentosReconexion})`);
        setTimeout(() => conectar(simIdActivo), delay);
      }
    };

    socket.onerror = (err) => {
      console.warn('[ws] Error de conexión WebSocket');
    };
  }

  function desconectar() {
    if (socket) { socket.close(1000, 'logout'); socket = null; }
    simIdActivo = null;
    intentosReconexion = 0;
  }

  return { conectar, desconectar };
})();

/**
 * Maneja los eventos recibidos por WebSocket.
 * Añade nuevos eventos aquí sin tocar el resto de la aplicación.
 *
 * @param {string} evento  Nombre del evento (ej. 'ronda_calculada')
 * @param {Object} datos   Payload del evento
 */
function manejarEventoWS(evento, datos = {}) {
  switch (evento) {

    case 'conectado':
      // Confirmación de conexión — silencioso
      break;

    case 'pong':
      // Respuesta de heartbeat — silencioso
      break;

    case 'ronda_calculada': {
      // ── Notificación principal: el profesor ejecutó la ronda ──────────────
      const { ronda, lider, equiposSimulados, mensaje } = datos;

      // Toast persistente (5 segundos) con más visibilidad
      toastWS(
        `⚡ Ronda ${ronda} calculada — ${equiposSimulados} equipos` +
        (lider ? ` · Líder: ${lider.equipo}` : ''),
        'success',
        5000
      );

      // Si el usuario es un equipo, actualizar su dashboard automáticamente
      if (state.me?.rol === 'equipo') {
        // Pequeño delay para que el servidor termine de escribir en la BD
        setTimeout(() => {
          loadHojaDecision?.().catch(() => {});
          loadResultados?.().catch(() => {});
        }, 1200);
      }

      // Si el usuario es admin/profesor, refrescar el dashboard
      if (state.me?.rol === 'superadmin' || state.me?.rol === 'profesor') {
        setTimeout(() => loadAdminDashboard?.().catch(() => {}), 1200);
      }
      break;
    }

    case 'ronda_abierta': {
      const { ronda } = datos;
      toastWS(`🟢 Ronda ${ronda} abierta — ya puedes ingresar tus decisiones`, 'info', 5000);
      if (state.me?.rol === 'equipo') {
        setTimeout(() => loadHojaDecision?.().catch(() => {}), 800);
      }
      break;
    }

    case 'presim_disponible': {
      toastWS('📊 Pre-simulación disponible — revisa las proyecciones antes de confirmar', 'info', 6000);
      break;
    }

    default:
      console.log('[ws] Evento no manejado:', evento, datos);
  }
}

/**
 * Toast especial para eventos WebSocket: más grande, dura más y tiene botón de cierre.
 * A diferencia del toast() estándar, no usa el elemento #toast porque queremos
 * que coexistan con los toasts normales.
 */
function toastWS(msg, tipo = 'success', duracion = 5000) {
  // Reutilizar el sistema de toast existente si está disponible
  if (typeof toast === 'function') {
    toast(msg, tipo);
    return;
  }
  // Fallback: crear un div temporal
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
    'background:#1e293b;color:#f8fafc;padding:12px 20px;border-radius:8px;' +
    'font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);max-width:420px;text-align:center';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duracion);
}


// ── Utilidades globales de contraseña ──────────────────────
window.toggleInputPw = (inputId, btn) => {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const isHidden = inp.type === 'password';
  inp.type = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? '🔒' : '👁';
  btn.title = isHidden ? 'Ocultar' : 'Mostrar/ocultar';
};

// ── Toast ──────────────────────────────────────────────────

// ── API ────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers:{'Content-Type':'application/json'} };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Error de red');
  return data;
}

// ── Screens ────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.style.display = 'none';
    s.classList.add('hidden');
  });
  const s = document.getElementById(id);
  s.style.display = 'flex';
  s.classList.remove('hidden');
}

// ── Nav (views inside a screen) ────────────────────────────
function setupNav(screenId) {
  const screen = document.getElementById(screenId);
  screen.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      screen.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      screen.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(btn.dataset.view)?.classList.add('active');
      const titles = {
        'admin-simulaciones':'Simulaciones', 'admin-dashboard':'Dashboard', 'admin-equipos':'Equipos',
        'admin-rondas':'Control de Rondas', 'admin-resultados':'Resultados',
        'admin-mercado':'Mercado', 'admin-parametros':'Parámetros',
        'admin-segmentos':'Segmentos',
        'eq-hoja':'Hoja de Decisión', 'eq-financiero':'Estados Financieros',
        'eq-resultados':'KPIs', 'eq-inventarios':'Mis Inventarios', 'eq-creditos':'Mis Créditos', 'eq-reportes':'Investigación y Ranking',
        'eq-noticias':'Noticias del Macroentorno',
        'admin-creditos':'Reporte de Créditos', 'admin-afinidad':'Matriz de Afinidad', 'admin-competencia':'Competencia Externa',
        'admin-shocks':'Shocks de Mercado',
      };
      const tt = document.getElementById(screenId === 'screen-admin' ? 'adminTopTitle' : 'equipoTopTitle');
      if (tt) tt.textContent = titles[btn.dataset.view] || '';
      if (btn.dataset.view === 'admin-simulaciones') loadAdminSimulaciones();
      if (btn.dataset.view === 'eq-hoja') loadHojaDecision();
      if (btn.dataset.view === 'eq-financiero') window.loadEquipoFinanciero?.();
      if (btn.dataset.view === 'eq-resultados') window.loadEquipoResultados?.();
      if (btn.dataset.view === 'eq-inventarios') loadEquipoInventarios();
      if (btn.dataset.view === 'eq-creditos') loadEquipoCreditos();
      if (btn.dataset.view === 'eq-reportes') window.loadEquipoReportes?.();
      if (btn.dataset.view === 'eq-noticias') window.loadEquipoNoticias?.();
      if (btn.dataset.view === 'eq-dashboard') loadEquipoDashboard();
      if (btn.dataset.view === 'admin-afinidad') window.loadAdminAfinidad?.();
      if (btn.dataset.view === 'admin-competencia') window.loadAdminCompetencia?.();
      if (btn.dataset.view === 'admin-creditos') window.loadAdminCreditos?.();
      if (btn.dataset.view === 'admin-dashboard') window.loadAdminDashboard?.();
      if (btn.dataset.view === 'admin-equipos') {
        if (typeof loadAdminEquipos === 'function') loadAdminEquipos();
        else loadAdminSimulaciones(); // fallback
      }
      if (btn.dataset.view === 'admin-inventarios') loadAdminInventarios();
      if (btn.dataset.view === 'admin-resultados') window.loadAdminResultados?.();
      if (btn.dataset.view === 'admin-mercado') window.loadAdminMercado?.();
      if (btn.dataset.view === 'admin-parametros') window.loadAdminParametros?.();
      if (btn.dataset.view === 'admin-segmentos') window.loadAdminSegmentos?.();
      if (btn.dataset.view === 'admin-shocks') window.loadAdminShocks?.();
      if (btn.dataset.view === 'admin-profesores') loadAdminProfesores();
      if (btn.dataset.view === 'eq-manual') { buildManual(); }
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════
function initLogin() {
  document.getElementById('loginId').addEventListener('keydown', e => e.key==='Enter' && doLogin());
  document.getElementById('loginPass').addEventListener('keydown', e => e.key==='Enter' && doLogin());
  document.getElementById('loginCodigo').addEventListener('keydown', e => e.key==='Enter' && doLogin());
  document.getElementById('btnLogin').addEventListener('click', doLogin);
  const btnManual = document.getElementById('btnVerManualLogin');
  if (btnManual) btnManual.addEventListener('click', buildManual);
  initRegistroUI();
}

async function doLogin() {
  const id     = document.getElementById('loginId').value.trim();
  const pass   = document.getElementById('loginPass').value;
  const codigo = (document.getElementById('loginCodigo')?.value || '').trim().toUpperCase();
  const errEl  = document.getElementById('loginError');
  const hintEl = document.getElementById('loginHint');
  errEl.textContent = '';
  if (hintEl) hintEl.style.display = 'none';
  const btn = document.getElementById('btnLogin');
  btn.textContent = 'Ingresando...'; btn.disabled = true;
  try {
    const data = await api('POST','/auth/login',{id,password:pass,codigoSimulacion:codigo});
    state.me = data;
    wsClient.conectar(data.simulacionId || state.currentSimId);  // ← NUEVA LÍNEA
    if (data.rol === 'admin' || data.rol === 'superadmin' || data.rol === 'profesor') await initAdmin();
    else await initEquipo();
  } catch(e) {
    errEl.textContent = e.message;
    // BUG #5 CORREGIDO: hint contextual si el identificador no parece email
    if (hintEl && !id.includes('@') && e.message.toLowerCase().includes('contraseña')) {
      hintEl.textContent = '💡 ¿Eres profesor? Intenta ingresar con tu correo electrónico.';
      hintEl.style.display = 'block';
    }
  } finally {
    btn.textContent = 'Ingresar →'; btn.disabled = false;
  }
}

// ── Registro ───────────────────────────────────────────────
let numMiembros = 0;

function buildMiembroRow(idx) {
  return `
    <div class="miembro-row" id="miembro_${idx}">
      <div class="miembro-header">
        <span class="miembro-num">Integrante ${idx + 1}</span>
        ${idx > 0 ? `<button class="btn btn-ghost btn-sm btn-remove-miembro" data-idx="${idx}">✕ Quitar</button>` : ''}
      </div>
      <div class="miembro-grid">
        <div class="form-group">
          <label class="form-label">Apellido Paterno <span class="req">*</span></label>
          <input class="form-input" data-miembro="${idx}" data-campo="apellidoPaterno" placeholder="Ej: García"/>
        </div>
        <div class="form-group">
          <label class="form-label">Apellido Materno <span class="req">*</span></label>
          <input class="form-input" data-miembro="${idx}" data-campo="apellidoMaterno" placeholder="Ej: López"/>
        </div>
        <div class="form-group" style="grid-column:span 2">
          <label class="form-label">Nombres <span class="req">*</span></label>
          <input class="form-input" data-miembro="${idx}" data-campo="nombres" placeholder="Ej: Juan Carlos"/>
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input class="form-input" data-miembro="${idx}" data-campo="telefono" placeholder="Ej: 70012345" type="tel"/>
        </div>
        <div class="form-group">
          <label class="form-label">Nro. de Registro <span class="req">*</span></label>
          <input class="form-input" data-miembro="${idx}" data-campo="nroRegistro" placeholder="Ej: 20210345"/>
        </div>
      </div>
    </div>`;
}

function addMiembroRow() {
  if (numMiembros >= 5) { toast('Máximo 5 integrantes por equipo', 'info'); return; }
  const container = document.getElementById('miembrosContainer');
  const div = document.createElement('div');
  div.innerHTML = buildMiembroRow(numMiembros);
  container.appendChild(div.firstElementChild);
  numMiembros++;
  // bind remove buttons
  container.querySelectorAll('.btn-remove-miembro').forEach(btn => {
    btn.onclick = () => {
      document.getElementById(`miembro_${btn.dataset.idx}`)?.remove();
    };
  });
}

function getMiembrosData() {
  const container = document.getElementById('miembrosContainer');
  const rows = container.querySelectorAll('.miembro-row');
  return Array.from(rows).map(row => {
    const get = campo => row.querySelector(`[data-campo="${campo}"]`)?.value?.trim() || '';
    return {
      apellidoPaterno: get('apellidoPaterno'),
      apellidoMaterno: get('apellidoMaterno'),
      nombres:         get('nombres'),
      telefono:        get('telefono'),
      nroRegistro:     get('nroRegistro'),
    };
  });
}

// Pantalla de confirmación de credenciales post-registro
function showCredencialesConfirmacion(nombre, loginNombre, passwordTexto, onContinue) {
  const card = document.getElementById('cardRegistro');
  card.innerHTML = `
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:48px;margin-bottom:8px">✅</div>
      <h2 style="font-size:1.1rem;font-weight:700;color:var(--accent5)">¡Equipo registrado!</h2>
      <p style="font-size:.84rem;color:var(--text2);margin-top:6px">${nombre}</p>
    </div>

    <div style="background:rgba(255,209,102,.08);border:2px solid rgba(255,209,102,.4);border-radius:var(--r-lg);padding:20px;margin-bottom:16px">
      <p style="font-family:var(--font-mono);font-size:.68rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px">⚠ GUARDA ESTOS DATOS — LOS NECESITAS PARA REINGRESAR</p>

      <div style="margin-bottom:12px">
        <label style="font-size:.74rem;color:var(--text3);display:block;margin-bottom:4px">Para ingresar usa:</label>
        <div style="display:flex;align-items:center;gap:8px">
          <input readonly style="flex:1;padding:8px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);color:var(--accent3);font-family:var(--font-mono);font-size:.9rem;font-weight:700" value="${loginNombre}" id="credNombre"/>
          <button class="btn btn-ghost btn-sm" onclick="copiarCred('credNombre','nombre')">📋</button>
        </div>
        <p style="font-size:.7rem;color:var(--text3);margin-top:4px">Puedes ingresar con el nombre de tu equipo</p>
      </div>

      <div>
        <label style="font-size:.74rem;color:var(--text3);display:block;margin-bottom:4px">Contraseña:</label>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="pw-input-wrap" style="flex:1">
            <input readonly id="credPass" type="password" style="width:100%;padding:8px 36px 8px 12px;background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);color:var(--text);font-family:var(--font-mono);font-size:.9rem" value="${passwordTexto}"/>
            <button type="button" class="btn-eye-input" onclick="toggleInputPw('credPass',this)">👁</button>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="copiarCred('credPass','contraseña')">📋</button>
        </div>
      </div>
    </div>

    <p style="font-size:.78rem;color:var(--text3);text-align:center;margin-bottom:16px">
      Anota o fotografía estos datos ahora.<br>El profesor también puede verlos en su panel de administración.
    </p>

    <button class="btn btn-success btn-full" id="btnEntrarSimulador">Entrar al Simulador →</button>
  `;

  document.getElementById('btnEntrarSimulador').addEventListener('click', () => {
    onContinue();
  });
}

window.copiarCred = (inputId, label) => {
  const el = document.getElementById(inputId);
  if (!el) return;
  const val = el.value;
  navigator.clipboard?.writeText(val).then(() => {
    toast(`✓ ${label} copiado al portapapeles`, 'success');
  }).catch(() => {
    // fallback para contextos sin clipboard API
    el.type = 'text';
    el.select();
    document.execCommand('copy');
    toast(`✓ ${label} copiado`, 'success');
  });
};
function initRegistroUI() {
  // Mostrar/ocultar cards
  document.getElementById('btnIrRegistro').addEventListener('click', () => {
    document.getElementById('cardLogin').style.display = 'none';
    document.getElementById('cardRegistro').style.display = 'block';
    if (numMiembros === 0) { addMiembroRow(); } // primer integrante
  });
  document.getElementById('btnVolverLogin').addEventListener('click', () => {
    document.getElementById('cardRegistro').style.display = 'none';
    document.getElementById('cardLogin').style.display = 'block';
  });
  document.getElementById('btnAgregarMiembro').addEventListener('click', addMiembroRow);
  document.getElementById('btnRegistrar').addEventListener('click', doRegistro);
  document.getElementById('regPassword').addEventListener('keydown', e => e.key==='Enter' && doRegistro());
}

// ── Validar código de simulación en tiempo real ─────────────
let _codigoTimer = null;
window.validarCodigo = (val) => {
  const el = document.getElementById('codigoStatus');
  if (!el) return;
  clearTimeout(_codigoTimer);
  if (val.length < 4) { el.textContent = ''; return; }
  _codigoTimer = setTimeout(async () => {
    try {
      const r = await api('POST','/auth/validar-codigo',{codigo:val});
      el.innerHTML = r.valido
        ? `<span style="color:var(--accent5)">✓ Simulación encontrada: <strong>${r.nombre}</strong></span>`
        : `<span style="color:var(--accent4)">✗ Código no válido o simulación archivada</span>`;
    } catch { el.textContent = ''; }
  }, 400);
};

async function doRegistro() {
  const errEl = document.getElementById('registroError');
  errEl.textContent = '';
  const nombreEquipo    = document.getElementById('regNombreEquipo').value.trim();
  const password        = document.getElementById('regPassword').value;
  const passwordConf    = document.getElementById('regPasswordConfirm').value;
  const codigoSimulacion= (document.getElementById('regCodigo')?.value||'').trim().toUpperCase();
  const miembros        = getMiembrosData();

  if (!nombreEquipo)             return errEl.textContent = 'El nombre del equipo es requerido.';
  if (!password)                 return errEl.textContent = 'La contraseña es requerida.';
  if (password.length < 4)       return errEl.textContent = 'La contraseña debe tener al menos 4 caracteres.';
  if (password !== passwordConf) return errEl.textContent = 'Las contraseñas no coinciden.';
  if (!codigoSimulacion)         return errEl.textContent = 'El código de simulación es requerido. Solicítalo a tu profesor.';

  const btn = document.getElementById('btnRegistrar');
  btn.textContent = 'Registrando...'; btn.disabled = true;
  try {
    const data = await api('POST', '/auth/registro', { nombreEquipo, miembros, password, codigoSimulacion });
    state.me = data;
    showCredencialesConfirmacion(data.nombre, data.nombre, data.passwordPlain || password, () => {
      initEquipo();
    });
  } catch(e) {
    errEl.textContent = e.message;
    btn.textContent = '✓ Registrar Equipo'; btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════
async function initAdmin() {
  showScreen('screen-admin');
  setupNav('screen-admin');
  document.getElementById('btnAdminLogout').addEventListener('click', doLogout);

  // Restaurar sim activa desde la sesión del servidor
  try {
    const me = await api('GET', '/auth/me');
    if (me?.simulacionId) {
      state.currentSimId    = me.simulacionId;
      state.currentSimNombre = me.simNombre || me.simulacionId;
      state.ref = await api('GET', '/admin/config');
      const badge = document.getElementById('simBadge');
      if (badge && state.currentSimNombre) badge.textContent = `📊 ${state.currentSimNombre}`;
    }
  } catch {}

  await loadAdminSimulaciones();
}

// ── Admin Simulaciones ─────────────────────────────────────

async function doRecalcularBalance() {
  if (!confirm(
  '⚠️ RE-SIMULACIÓN COMPLETA — todas las rondas\n\n' +
  'Esta operación re-ejecuta el motor de cálculo para R1 hasta la última ronda simulada.\n\n' +
  'Recalcula con los parámetros ACTUALES (incluyendo proveedores y costos de MP).\n\n' +
  '• Decisiones originales de cada equipo se conservan\n' +
  '• Financiero propagado (caja, deuda, inventario) se recalcula en cadena\n' +
  '• Shocks históricos se respetan\n' +
  '• Reportes de investigación se regeneran\n\n' +
  'Los resultados históricos cambiarán. ¿Confirmas?'
)) return;
  try {
    const btn = document.getElementById('btnRecalcularBalance');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Recalculando...'; }
    const r = await api('POST', '/admin/recalcular-balance');
    const msgToast = r.errores?.length
      ? `⚠️ Re-simulación: ${r.rondas} rondas OK · ${r.errores.length} error(es)`
      : `✅ Re-simulación completa: ${r.rondas} rondas · ${r.empresas} registros`;
    toast(msgToast, r.errores?.length ? 'warning' : 'success');
    if (r.errores?.length) console.warn('[recalc] Errores:', r.errores);
    await loadAdminRondas();
  } catch(e) {
    toast(e.message, 'error');
    const btn = document.getElementById('btnRecalcularBalance');
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Recalcular EF + Desglose CU — todas las rondas'; }
  }
}

async function loadAdminRondasDirect() {
  const el = document.getElementById('rondasContent');
  if (!el) return;
  try {
    el.innerHTML = '<p style="color:var(--text3);padding:20px">Cargando historial de rondas...</p>';
    const raw  = await api('GET', '/admin/historial');
    const hist = Array.isArray(raw) ? raw : (raw?.rondas || raw?.historial || []);
    if (!hist?.length) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin rondas ejecutadas aún.</p>';
      return;
    }
    const rows = hist.map(h => `
      <tr>
        <td style="text-align:center;font-weight:700;color:var(--accent3)">T${h.ronda}</td>
        <td style="text-align:center">
          <span class="badge ${h.estado==='calculada'||h.estado==='simulated'?'badge-ok':'badge-warn'}">${h.estado}</span>
        </td>
        <td style="text-align:center">${h.enviados||'—'} / ${h.total||'—'}</td>
        <td style="text-align:center;font-size:.78rem;color:var(--text3)">${h.ejecutadaAt ? new Date(h.ejecutadaAt).toLocaleString('es-BO') : '—'}</td>
      </tr>`).join('');
    el.innerHTML = '<div class="table-wrap"><table>'
      + '<thead><tr>'
      + '<th style="text-align:center">Trimestre</th>'
      + '<th style="text-align:center">Estado</th>'
      + '<th style="text-align:center">Decisiones enviadas</th>'
      + '<th style="text-align:center">Ejecutada</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    el.innerHTML += '<div style="margin-top:20px;padding:12px 16px;background:var(--bg2);border-radius:var(--r);border:1px solid var(--border2)">'
      + '<div style="font-size:.75rem;color:var(--text3);margin-bottom:10px">🔧 Herramientas de mantenimiento</div>'
      + '<button class="btn btn-ghost" id="btnRecalcularBalance" onclick="doRecalcularBalance()">🔄 Recalcular EF + Desglose CU — todas las rondas</button>'
      + '</div>';
  } catch(e) {
    el.innerHTML = '<p style="color:var(--accent4);padding:20px">Error: ' + e.message + '</p>';
  }
}

async function loadAdminRondas() {
  if (!requireSimSelected('rondasContent')) {
    // Intentar carga directa si hay sesión activa
    await loadAdminRondasDirect();
    return;
  }
  const el = document.getElementById('rondasContent');
  if (!el) return;
  try {
    el.innerHTML = '<p style="color:var(--text3);padding:20px">Cargando historial de rondas...</p>';
    const raw  = await api('GET', '/admin/historial');
    const hist = Array.isArray(raw) ? raw : (raw?.rondas || raw?.historial || []);
    if (!hist?.length) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin rondas ejecutadas aún. Las rondas aparecerán aquí una vez que el profesor ejecute la simulación.</p>';
      return;
    }
    const rows = hist.map(h => `
      <tr>
        <td style="text-align:center;font-weight:700;color:var(--accent3)">T${h.ronda}</td>
        <td style="text-align:center">
          <span class="badge ${h.estado==='calculada'||h.estado==='simulated'?'badge-ok':'badge-warn'}">${h.estado}</span>
        </td>
        <td style="text-align:center">${h.enviados||'—'} / ${h.total||'—'}</td>
        <td style="text-align:center;font-size:.78rem;color:var(--text3)">${h.ejecutadaAt ? new Date(h.ejecutadaAt).toLocaleString('es-BO') : '—'}</td>
      </tr>`).join('');
    el.innerHTML = '<div class="table-wrap"><table>'
      + '<thead><tr>'
      + '<th style="text-align:center">Trimestre</th>'
      + '<th style="text-align:center">Estado</th>'
      + '<th style="text-align:center">Decisiones enviadas</th>'
      + '<th style="text-align:center">Ejecutada</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    // Botón Recalcular Estados Financieros
    el.innerHTML += '<div style="margin-top:20px;padding:12px 16px;background:var(--bg2);border-radius:var(--r);border:1px solid var(--border2)">'
      + '<div style="font-size:.75rem;color:var(--text3);margin-bottom:10px">'
      + '🔧 Herramientas de mantenimiento de datos</div>'
      + '<button class="btn btn-ghost" id="btnRecalcularBalance" onclick="doRecalcularBalance()">'
      + '🔄 Recalcular EF + Desglose CU — todas las rondas</button>'
      + '<div style="font-size:.7rem;color:var(--text3);margin-top:6px;line-height:1.5">'
      + 'Re-ejecuta el motor para todas las rondas con los parámetros actuales. '
      + 'Conserva decisiones originales y shocks. '
      + 'Útil cuando cambias costos de MP, proveedores o parámetros de industria.</div>'
      + '</div>';
  } catch(e) {
    el.innerHTML = '<p style="color:var(--accent4);padding:20px">Error: ' + e.message + '</p>';
  }
}

async function loadAdminResultados(rondaVer) {
  if (!requireSimSelected('adminResultadosContent')) return;
  const el = document.getElementById('adminResultadosContent');
  if (!el) return;
  try {
    el.innerHTML = '<p style="color:var(--text3);padding:20px">Cargando resultados...</p>';
    const ronda = await api('GET', '/admin/ronda');
    let current = ronda?.currentRound || 0;

    // Buscar ultima ronda con resultados reales
    const current2 = ronda?.currentRound || 0;
    let ultimaSimulada = 0;
    for (let i = current2; i >= 1; i--) {
      try {
        const chk = await api('GET', '/admin/resultados/' + i);
        if (chk && chk.resultados && chk.resultados.length) { ultimaSimulada = i; break; }
      } catch(eignore) {}
    }

    if (!ultimaSimulada) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin rondas ejecutadas aún.</p>';
      return;
    }

    const n = (rondaVer && rondaVer >= 1 && rondaVer <= current2) ? rondaVer : ultimaSimulada;

    const rd = await api('GET', '/admin/resultados/' + n);
    if (!rd?.resultados?.length) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin resultados para el trimestre ' + n + '.</p>';
      return;
    }

    // Selector de rondas
    const opcionesRondas = Array.from({length: ultimaSimulada}, (_,i) => i+1)
      .map(r => `<option value="${r}" ${r===n?'selected':''}>Ronda ${r}</option>`)
      .join('');
    const selector = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <label style="font-size:.82rem;color:var(--text3)">Ver resultados de:</label>
      <select id="selectorRondaResultados" class="form-input" style="width:auto;padding:4px 10px;font-size:.85rem"
        onchange="loadAdminResultados(+this.value)">
        ${opcionesRondas}
      </select>
      <span style="font-size:.78rem;color:var(--text3)">Última simulada: Ronda ${ultimaSimulada}</span>
    </div>`;

    el.innerHTML = selector + buildAdminResultsHTML(rd);
    if (typeof renderAdminCharts === 'function') setTimeout(renderAdminCharts, 200);
  } catch(e) {
    el.innerHTML = '<p style="color:var(--accent4);padding:20px">Error: ' + e.message + '</p>';
    console.error('loadAdminResultados:', e);
  }
}

async function loadAdminSimulaciones() {

  let plantillasDisponibles = [];
  try {
    const data = await api('GET', '/admin/plantillas');
    plantillasDisponibles = data.plantillas || [];
  } catch {}
  const plantillasOpts = plantillasDisponibles
    .filter(p => p !== 'jaboncillos_v1')
    .map(p => {
      const lbl = p === 'Calzados_COM540_1_2026_V1'
        ? 'Calzados Especializados — COM540 2026 V1'
        : p.replace(/_v\d+$/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const sel = p === 'Calzados_COM540_1_2026_V1' ? ' selected' : '';
      return `<option value="${p}"${sel}>${lbl}</option>`;
    })
    .join('');

  const el = document.getElementById('adminSimulacionesContent');
  if (!el) return;
  el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>`;
  try {
    const sims = await api('GET','/admin/simulaciones');
    const activas   = sims.filter(s=>s.estado==='activa');
    const archivadas = sims.filter(s=>s.estado==='archivada');

    const simCard = (sim) => {
      const stateColors = {pending:'var(--text3)',open:'var(--accent5)',locked:'var(--accent3)','pre-sim':'var(--accent3)',simulated:'var(--accent2)'};
      const stateLabels = {pending:'⏸ Pendiente',open:'🟢 Abierta',locked:'🔒 Cerrada','pre-sim':'📊 Pre-sim','simulated':'✅ Simulada'};
      return `
        <div class="result-round-card" style="margin-bottom:14px">
          <div class="result-round-header" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div>
              <h3 style="margin:0">${sim.nombre}</h3>
              ${sim.descripcion?`<div style="font-size:.76rem;color:var(--text3);margin-top:2px">${sim.descripcion}</div>`:''}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="badge ${sim.estado==='activa'?'badge-ok':'badge-pending'}">${sim.estado==='activa'?'✅ Activa':'📦 Archivada'}</span>
              <span style="font-size:.74rem;font-family:var(--font-mono);color:${stateColors[sim.roundState]||'var(--text3)'}">${stateLabels[sim.roundState]||sim.roundState}</span>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
            <div style="padding:10px 16px;border-right:1px solid var(--border)"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Equipos</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;margin-top:3px">${sim.totalEquipos}</div></div>
            <div style="padding:10px 16px;border-right:1px solid var(--border)"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Ronda actual</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;margin-top:3px">${sim.currentRound}/${sim.totalRounds}</div></div>
            <div style="padding:10px 16px;border-right:1px solid var(--border)"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Código de acceso</div><div style="font-family:var(--font-mono);font-size:.9rem;font-weight:700;margin-top:3px;color:var(--accent3);letter-spacing:2px">${sim.codigoAcceso||'—'}</div></div>
            <div style="padding:10px 16px"><div style="font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Creada</div><div style="font-size:.78rem;margin-top:3px">${sim.creadaAt?new Date(sim.creadaAt).toLocaleDateString('es-BO'):'-'}</div></div>
          </div>
          <div style="padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap">
            ${sim.estado==='activa'
              ? `<button class="btn btn-success btn-sm" onclick="seleccionarSim('${sim.id}','${sim.nombre.replace(/'/g,"\\'")}')">▶ Acceder a esta simulación</button>
                 <button class="btn btn-ghost btn-sm" onclick="copiarCodigo('${sim.codigoAcceso||''}')">📋 Copiar código</button>
                 <button class="btn btn-ghost btn-sm" onclick="archivarSim('${sim.id}')">📦 Archivar</button>
                 <button class="btn btn-ghost btn-sm" onclick="doBackupSimulacion('${sim.id}')">💾 Backup</button>
                 <button class="btn btn-ghost btn-sm" onclick="doRestaurarSimulacion('${sim.id}')" style="color:#FFC107;border-color:rgba(255,193,7,0.4)">📂 Restaurar</button>
                 <button class="btn btn-ghost btn-sm" onclick="eliminarSim('${sim.id}','${sim.nombre.replace(/'/g,"\\'")}')" style="color:var(--accent4)">✕ Eliminar</button>`
              : `<button class="btn btn-ghost btn-sm" onclick="activarSim('${sim.id}')">♻ Reactivar</button>
                 <button class="btn btn-ghost btn-sm" onclick="eliminarSim('${sim.id}','${sim.nombre.replace(/'/g,"\\'")}')" style="color:var(--accent4)">✕ Eliminar</button>`}
          </div>
        </div>`;
    };

    el.innerHTML = `
      <div class="section-header">
        <h2>🎮 Gestión de Simulaciones</h2>
        <p>Cada simulación es un juego independiente con sus propios equipos, rondas y resultados.</p>
      </div>

      <div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap">
        <button class="btn btn-success" onclick="showCrearSimulacion()">+ Nueva Simulación</button>
        <button class="btn btn-ghost" onclick="loadAdminSimulaciones()">↺ Actualizar</button>
        <button class="btn btn-ghost" onclick="doBackupTodas()">💾 Backup de todas</button>
      </div>

      <div id="crearSimForm" style="display:none;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px;margin-bottom:24px">
        <h3 style="margin:0 0 16px">Nueva Simulación</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div>
            <label class="form-label">Nombre <span style="color:var(--accent4)">*</span></label>
            <input class="form-input" id="newSimNombre" placeholder="Ej: Sección A — Mañana">
          </div>
          <div>
            <label class="form-label">Rondas totales</label>
            <input class="form-input" id="newSimRondas" type="number" min="1" max="20" value="20">
          </div>
          <div style="grid-column:span 2">
            <label class="form-label">Descripción (opcional)</label>
            <input class="form-input" id="newSimDesc" placeholder="Ej: COM400A Trimestre I 2026 — Sección matutina">
          </div>
          <div style="grid-column:span 2">
            <label class="form-label">Copiar parámetros de (opcional)</label>
            <select class="form-input" id="newSimCopyFrom">
              <option value="">— Usar parámetros por defecto —</option>
              ${activas.map(s=>`<option value="${s.id}">${s.nombre}</option>`).join('')}
            </select>
          </div>

            <div>
              <label class="form-label">Industria / Plantilla</label>
              <select class="form-input" id="newSimIndustria">
                <option value="" disabled>— Seleccionar industria —</option>
                ${plantillasOpts}
              </select>
              <div style="font-size:.72rem;color:var(--text3);margin-top:4px">
                Define el tipo de producto, canales y segmentos del mercado.
                Solo aplica si no copias de otra simulación.
              </div>
            </div>

            </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-success" onclick="crearSimulacion()">✓ Crear Simulación</button>
          <button class="btn btn-ghost" onclick="document.getElementById('crearSimForm').style.display='none'">Cancelar</button>
        </div>
      </div>

      ${activas.length > 0 ? `
        <h3 style="margin-bottom:12px">Simulaciones activas (${activas.length})</h3>
        ${activas.map(simCard).join('')}
      ` : '<p style="color:var(--text3);font-size:.84rem">No hay simulaciones activas. Crea una nueva para comenzar.</p>'}

      ${archivadas.length > 0 ? `
        <details style="margin-top:24px">
          <summary style="cursor:pointer;font-weight:600;color:var(--text2);font-size:.9rem;padding:8px 0">
            📦 Simulaciones archivadas (${archivadas.length})
          </summary>
          <div style="margin-top:12px">
            ${archivadas.map(simCard).join('')}
          </div>
        </details>
      ` : ''}
    `;
  } catch(e) {
    el.innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
}

window.showCrearSimulacion = () => {
  document.getElementById('crearSimForm').style.display = 'block';
  document.getElementById('newSimNombre').focus();
};

window.crearSimulacion = async () => {
  const nombre     = document.getElementById('newSimNombre').value.trim();
  if (!nombre) return toast('El nombre es requerido', 'error');
  const desc        = document.getElementById('newSimDesc').value.trim();
  const totalRounds = parseInt(document.getElementById('newSimRondas').value) || 20;
  const copyFromSimId = document.getElementById('newSimCopyFrom').value || null;
  // NUEVO: leer industria seleccionada
  const industria   = document.getElementById('newSimIndustria')?.value || null;

  try {
    const r = await api('POST', '/admin/simulaciones', {
      nombre,
      descripcion:  desc,
      totalRounds,
      copyFromSimId,
      industria:    copyFromSimId ? null : industria,  // ignorar plantilla si se copia de otra sim
    });
    toast(`✓ Simulación creada — Código: ${r.codigoAcceso}${r.industria ? ` · Industria: ${r.industria}` : ''}`, 'success');
    document.getElementById('crearSimForm').style.display = 'none';
    await loadAdminSimulaciones();
  } catch(e) { toast(e.message, 'error'); }
};

window.seleccionarSim = async (simId, nombre) => {
  try {
    await api('POST','/admin/seleccionar-sim',{simId});
    state.currentSimId = simId;
    state.currentSimNombre = nombre;
    // Cargar config de la simulación seleccionada
    state.ref = await api('GET','/admin/config');
    toast(`📊 Simulación activa: ${nombre}`, 'success');
    wsClient.conectar(simId);
    // Actualizar badge en el header
    const badge = document.getElementById('simBadge');
    if (badge) badge.textContent = `📊 ${nombre}`;
    // Ir al dashboard
    document.querySelector('[data-view="admin-dashboard"]')?.click();
  } catch(e) { toast(e.message,'error'); }
};

window.archivarSim = async (simId) => {
  if (!confirm('¿Archivar esta simulación? Podrás reactivarla después.')) return;
  try {
    await api('POST',`/admin/simulaciones/${simId}/archivar`);
    toast('Simulación archivada','success');
    await loadAdminSimulaciones();
  } catch(e) { toast(e.message,'error'); }
};

window.activarSim = async (simId) => {
  try {
    await api('POST',`/admin/simulaciones/${simId}/activar`);
    toast('Simulación reactivada','success');
    await loadAdminSimulaciones();
  } catch(e) { toast(e.message,'error'); }
};

window.eliminarSim = async (simId, nombre) => {
  if (!confirm(`¿ELIMINAR PERMANENTEMENTE la simulación "${nombre}"?\n\nSe eliminarán todos los equipos, rondas y resultados. Esta acción NO se puede deshacer.`)) return;
  try {
    await api('DELETE',`/admin/simulaciones/${simId}`);
    toast('Simulación eliminada','success');
    await loadAdminSimulaciones();
  } catch(e) { toast(e.message,'error'); }
};

window.copiarCodigo = (codigo) => {
  navigator.clipboard?.writeText(codigo).then(() => toast(`✓ Código ${codigo} copiado`,'success'))
    .catch(() => toast(`Código: ${codigo}`,'success'));
};

// ── Admin Dashboard ────────────────────────────────────────
// Guard: check if a simulation is selected before loading admin views
function requireSimSelected(elId) {
  if (!state.currentSimId) {
    const el = document.getElementById(elId);
    if (el) el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎮</div>
        <p style="margin-bottom:16px">Debes seleccionar una simulación primero.</p>
        <button class="btn btn-primary" onclick="document.querySelector('[data-view=admin-simulaciones]')?.click()">
          Ir a Gestión de Simulaciones →
        </button>
      </div>`;
    return false;
  }
  return true;
}

// ── KPI Analysis Panel — buildAdminKPIHTML ────────────────────────────────
// 4 tabs por rol (mismos KPIs que ve el estudiante) en formato comparativo.
// Dependencias: eqs (array de resultados consolidados por empresa), tc() (colores)

window.adminKPITab = (n, pfx) => {
  // F7-FIX: pfx identifica la instancia correcta de los tabs KPI
  [1,2,3,4].forEach(i => {
    const p = document.getElementById(pfx ? pfx+'pane'+i : 'adminKPIPane'+i);
    const b = document.getElementById(pfx ? pfx+'btn'+i  : 'btnKPI'+i);
    if (p) p.style.display = i===n ? '' : 'none';
    if (b) b.className    = i===n ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  });
};


// ── Vista estudiante por equipo (para toggle Opción B) ───────────────────────
// Reutiliza exactamente el mismo HTML que ve el estudiante en loadEquipoFinanciero
function buildVistaEstudiantePorEquipo(rd, tab) {
  if (!rd.resultados?.length) return '<p style="color:var(--text3);padding:20px">Sin resultados</p>';
  const eqs = rd.resultados;
  const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899'];
  const fmt = { bs: v => 'Bs ' + Math.round(Math.abs(v||0)).toLocaleString('es'),
                num: v => Math.round(v||0).toLocaleString('es'),
                pct: v => ((v||0)*100).toFixed(1)+'%' };

  return eqs.map((r, idx) => {
    const color  = COLORS[idx % COLORS.length];
    const nombre = r.equipoNombre || r.equipo || 'Equipo '+(idx+1);

    // Encabezado del equipo
    let html = '<div style="background:var(--bg2);border:0.5px solid var(--border);'
      + 'border-left:4px solid '+color+';border-radius:var(--r);padding:16px 20px;margin-bottom:16px">'
      + '<div style="font-weight:700;font-size:.9rem;color:'+color+';margin-bottom:14px;letter-spacing:.3px">'+nombre+'</div>';

    if (tab === 'pl') {
      // ── ER por producto (multiproducto) ──
      if (r.productos && r.productos.length > 1) {
        const PROD_COLORS2 = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899'];
        const fR2 = (lbl,v,neg,tipo) => {
          const val=neg?-(v||0):(v||0);
          const col=tipo==='pos'?'var(--accent2)':tipo==='neg'?'var(--accent4)':'var(--text1)';
          return '<tr><td style="padding:3px 8px;font-size:.74rem;color:var(--text2)">'+lbl+'</td>'
            +'<td style="padding:3px 8px;text-align:right;font-family:var(--font-mono);font-size:.74rem;color:'+col+'">'
            +(val<0?'(':'')+'Bs '+Math.round(Math.abs(val)).toLocaleString('es')+(val<0?')':'')+'</td></tr>';
        };
        const fRS2 = (lbl,v) => {
          const col=(v||0)>=0?'var(--accent2)':'var(--accent4)';
          return '<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px;font-size:.74rem;font-weight:700">'+lbl+'</td>'
            +'<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);font-size:.74rem;font-weight:700;color:'+col+'">'
            +'Bs '+Math.round(v||0).toLocaleString('es')+'</td></tr>';
        };
        const cards2 = r.productos.map((p,i) => {
          const col = PROD_COLORS2[i % PROD_COLORS2.length];
          const utilColor = (p.utilidadNeta||0)>=0?'var(--accent2)':'var(--accent4)';
          const ebit = p.ebit??((p.utilidadBruta||0)-(p.gastosOp||0));
          const ub2       = p.utilidadBruta||0;
          const mbColor2  = ub2>=0?'var(--accent2)':'var(--accent4)';
          const mbPct2    = (p.ventasNetas||0)>0?(ub2/(p.ventasNetas)*100).toFixed(1)+'%':'—';
          const mnPct2    = (p.ventasNetas||0)>0?((p.utilidadNeta||0)/(p.ventasNetas)*100).toFixed(1)+'%':'—';
          return '<div style="background:var(--bg3);border:0.5px solid var(--border);border-top:3px solid '+col
            +';border-radius:var(--r);padding:10px 12px;min-width:180px;flex:1">'
            +'<div style="font-weight:700;font-size:.75rem;color:'+col+';margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(p.producto||'Prod '+(i+1))+'</div>'
            +'<table style="width:100%;border-collapse:collapse">'
            +fR2('Ventas netas',p.ventasNetas||0,false,'neutral')
            +fR2('(−) Costo ventas',p.costoVentas||0,true,'neg')
            +fRS2('= Util. bruta',ub2)
            +'<tr><td style="padding:2px 8px;font-size:.7rem;color:var(--text3)">Margen bruto</td>'
            +'<td style="padding:2px 8px;text-align:right;font-family:var(--font-mono);font-size:.7rem;color:'+mbColor2+'">'+mbPct2+'</td></tr>'
            +fR2('(−) Gastos op.',p.gastosOp||0,true,'neg')
            +fRS2('= EBIT',ebit)
            +fR2('(−) IT',p.impuestoIT||0,true,'neg')
            +'<tr style="border-top:2px solid var(--border2)">'
            +'<td style="padding:4px 8px;font-size:.74rem;font-weight:700">= Util. neta</td>'
            +'<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);font-size:.74rem;font-weight:700;color:'+utilColor+'">'
            +'Bs '+Math.round(p.utilidadNeta||0).toLocaleString('es')+'</td></tr>'
            +'<tr><td style="padding:2px 8px;font-size:.7rem;color:var(--text3)">Margen neto</td>'
            +'<td style="padding:2px 8px;text-align:right;font-family:var(--font-mono);font-size:.7rem;color:'+utilColor+'">'+mnPct2+'</td></tr>'
            +'</table></div>';
        }).join('');
        html += '<div style="font-family:var(--font-mono);font-size:.6rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:4px 0 8px;border-bottom:1px solid var(--border);margin-bottom:8px">📦 ER por Producto</div>'
          +'<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;margin-bottom:12px">'+cards2+'</div>'
          +'<div style="font-family:var(--font-mono);font-size:.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-bottom:6px">📋 ER Consolidado</div>';
      }
      // ── ER consolidado ──
      const sec = lbl => '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-top:4px">'+lbl+'</div>';
      html += finRow('Precio facturado al cliente (con IVA)', r.totalFacturado||(r.ivaDebito ? Math.round(r.ivaDebito/0.13) : 0), false,'neutral') /*fix_pf_prof_v1*/
        + finRow('(−) IVA débito fiscal (13%)', -(r.ivaDebito||0), false,'neg')
        + finRowSub('= Ventas brutas (sin IVA)', r.ventasBrutas||0, true)
        + finRow('(−) Comisiones canal (neto)', -(r.comisionesNeto||Math.round((r.comisiones||0)*0.87)), false,'neg')
        + finRowSub('= Ventas netas', r.ventasNetasReal||r.ventasNetas||0, true)
        + finRow('(−) Costo de ventas', -(r.costoVentas||0), false,'neg')
        + finRow('    MOD — Operarios producción', -(r.pagoOperarios||r.costoOperarios||0), false,'neg')
        + finRow('    Overhead — Gasto fijo planta', -(r.gastoFijoPlanta||0), false,'neg')
        + finRow('    Depreciación planta', -(r.depreciacion||0), false,'neg')
        + finRowSub('= Utilidad bruta', r.utilidadBruta||0, true)
        + sec('(-) Gastos Comerciales')
        + finRow('Publicidad',              -(r.gastoPublicidad||Math.round((r.publicidad||0)*0.87)),         false,'neg')
        + finRow('Promoción',               -(r.gastoPromocion||Math.round((r.promocion||0)*0.87)),          false,'neg')
        + finRow('Eventos',                 -(r.gastoEventos||Math.round((r.eventos||0)*0.87)),            false,'neg')
        + finRow('Marketing en redes',      -(r.gastoMktRedes||Math.round((r.marketingRedes||0)*0.87)),     false,'neg')
        + finRow('Relaciones públicas',     -(r.gastoRRPP||Math.round((r.relacionesPublicas||0)*0.87)), false,'neg')
        + finRow('Fuerza de ventas',        -(r.costoVendedores||0),    false,'neg')
        + sec('(-) Gastos Administrativos')
        + finRow('Gastos administrativos fijos', -(r.gastoAdminFijo||0), false,'neg')
        + sec('(-) Gastos Operativos')
        + finRow('Almacenamiento',          -(r.costoAlmacenamiento||0),false,'neg')
        + ((r.gastoInnovacion||0)>0 ? finRow('Innovación / desarrollo',-(r.gastoInnovacionNeto||Math.round((r.gastoInnovacion||0)*0.87)),false,'neg') : '')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= EBITDA', (r.ebit??0)+(r.depreciacion??0), true)
        + finRow('(-) Depreciación', -(r.depreciacion||0), false,'neg')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= EBIT / Utilidad Operativa', r.ebit??0, true)
        + sec('(-) Gastos Financieros')
        + finRow('Intereses préstamo', -(r.interesesPrestamo||0), false,'neg')
        + ((r.comisionApertura||0)>0 ? finRow('Comisión apertura', -(r.comisionApertura||0), false,'neg') : '')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= Utilidad antes de impuestos', (r.ebit??0)-(r.gastoFinanciero??0), true)
        + sec('(-) Impuestos')
        + finRow('IT (3% precio facturado)', -(r.impuestoIT||0), false,'neg')
        + ((r.impuestoIUE||0)>0 ? finRow('IUE (25% utilidad gravable)', -(r.impuestoIUE||0), false,'neg') : '')
        + '<div style="margin:8px 0;padding:8px 10px;background:rgba(59,130,246,.07);border-radius:6px;border-left:3px solid #3B82F6;font-size:.73rem;color:var(--text3);line-height:1.6">'
        + '<strong style="color:#3B82F6">ⓘ IVA — tributo neutro (Ley 843)</strong><br>'
        + 'Débito: '+fmt.bs(r.ivaDebito||0)+' · Crédito: '+fmt.bs(r.ivaCredito||0)+' · <strong>Neto a pagar: '+fmt.bs(r.ivaAPagar||0)+'</strong></div>'
        + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
        + finRowSub('= Utilidad neta', r.utilidadNeta, true);

    } else if (tab === 'bg') {
      const sec = lbl => '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-top:6px">'+lbl+'</div>';
      const totalA  = (r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0)+(r.afNetos||0);  // ivaCredito ya compensado
      const totalP  = (r.deudaFinal||0)+(r.sobregiro||0);  // ivaAPagar ya pagado
      const capital = r.capitalContable||680000;
      const utilidad = r.utilidadNeta||0;
      const acumAnt = totalA - totalP - capital - utilidad;
      const cuadra  = Math.abs(totalA - totalP - (capital+acumAnt+utilidad)) < 2;
      html += sec('Activo Corriente')
        + finRow('Caja y bancos',              r.cajaFinal,           false,'pos')
        + finRow('Cuentas por cobrar (CxC)',   r.cxcFinal,            false,'neutral')
        + finRow('Inventarios',                r.invFinalValorizado,  false,'neutral')
        + finRowSub('= Total Activo Corriente', (r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0), false)
        + sec('Activo No Corriente')
        + finRow('Activos fijos netos', r.afNetos||0, false,'neutral')
        + finRowSub('= Total Activo No Corriente', r.afNetos||0, false)
        + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
        + finRowSub('= TOTAL ACTIVOS', r.totalActivos||(r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0)+(r.afNetos||0), true)
        + sec('Pasivo Corriente')
        + ((r.ivaAPagar||0)>0 ? finRow('IVA por pagar (saldo trimestre)', r.ivaAPagar, false,'neg') : '')
        + ((r.sobregiro||0)>0 ? finRow('Sobregiro bancario', r.sobregiro, false,'neg') : '')
        + finRow('Préstamos y deuda total', r.deudaFinal, false,'neg')
        + finRowSub('= Total Pasivo Corriente', totalP, false)
        + sec('Pasivo No Corriente')
        + finRow('Deuda largo plazo', 0, false,'neutral')
        + finRowSub('= Total Pasivo No Corriente', 0, false)
        + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
        + finRowSub('= TOTAL PASIVOS', totalP, true)
        + sec('Patrimonio')
        + finRow('Capital contable / social', capital, false,'neutral')
        + finRow('Resultados acumulados', acumAnt, false, acumAnt>=0?'pos':'neg')
        + finRow('Utilidad / pérdida del período', utilidad, false, utilidad>=0?'pos':'neg')
        + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
        + finRowSub('= TOTAL PATRIMONIO', totalA-totalP, true)
        + finRowSub('TOTAL PASIVOS + PATRIMONIO', totalA, true)
        + '<div style="margin-top:8px;padding:8px 12px;background:'+(cuadra?'rgba(6,255,165,.08)':'rgba(255,107,107,.08)')
        + ';border-radius:var(--r);font-size:.78rem;font-family:var(--font-mono)">'
        + (cuadra?'✓ Balance cuadra':'⚠ Verificar balance')
        + ' (Activos = '+fmt.bs(totalA)+' | P+P = '+fmt.bs(totalA)+')</div>';

    } else if (tab === 'fe') {
      const sec  = lbl => '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:6px 0;border-bottom:2px solid var(--border2);margin-bottom:4px">'+lbl+'</div>';
      const secS = lbl => '<div style="font-family:var(--font-mono);font-size:.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0">'+lbl+'</div>';
      const entOp = (r.cobrosContado||0);
      const salOp = (r.pagoProduccion||0)+(r.pagoOperarios2||r.pagoOperarios||r.costoOperarios||0)
        +(r.costoVendedores||0)+(r.pagoMktTotal||0)+(r.pagoInnovacion||0)
        +(r.pagoGastosAdmin||r.gastoAdminFijo||0)+(r.pagoGastosPlanta||r.gastoFijoPlanta||0)
        +(r.pagoAlmacenamiento||0)+(r.pagoIVA||0)+(r.pagoIT??r.impuestoIT??0)+(r.pagoIUE||0);
      const entFin = (r.ingresoPrestamo||0)+(r.sobregiro||0);
      const salFin = (r.pagoCapitalPrestamo||0)+(r.pagoIntereses||r.interesesPrestamo||0)
        +(r.interesSobregiro||0)+(r.comisionApertura||0);
      html += finRow('Caja inicial', r.cajaInicial, false,'neutral')
        + '<div style="height:12px"></div>'
        + sec('Flujo de Efectivo por Actividades de Operación')
        + secS('Entradas Operativas')
        + finRow('Cobros por ventas al contado', r.cobrosContado||0, false,'pos')
        + '<div style="height:4px"></div>'
        + secS('Salidas Operativas')
        + ((r.pagoProduccion||0)>0    ? finRow('Pago de producción',          -(r.pagoProduccion||0),  false,'neg') : '')
        + ((r.pagoOperarios2||r.pagoOperarios||r.costoOperarios||0)>0 ? finRow('Pago de operarios', -(r.pagoOperarios2||r.pagoOperarios||r.costoOperarios||0), false,'neg') : '')
        + ((r.costoVendedores||0)>0   ? finRow('Pago fuerza de ventas',       -(r.costoVendedores||0), false,'neg') : '')
        + ((r.pagoMktTotal||0)>0      ? finRow('Pago de marketing total',     -(r.pagoMktTotal||0),    false,'neg') : '')
        + ((r.pagoInnovacion||0)>0    ? finRow('Pago de innovación',          -(r.pagoInnovacion||0),  false,'neg') : '')
        + ((r.pagoGastosAdmin||r.gastoAdminFijo||0)>0  ? finRow('Pago gastos administrativos', -(r.pagoGastosAdmin||r.gastoAdminFijo||0), false,'neg') : '')
        + ((r.pagoGastosPlanta||r.gastoFijoPlanta||0)>0 ? finRow('Pago gastos de planta',     -(r.pagoGastosPlanta||r.gastoFijoPlanta||0), false,'neg') : '')
        + ((r.pagoIVA||0)>0  ? finRow('Pago IVA neto al Estado',   -(r.pagoIVA||0),  false,'neg') : '')
        + finRow('IT devengado período', -(r.impuestoIT||0), false,'neg')
        + ((r.compensacionIT||0)>0 ? finRow('(+) Compensado con saldo IUE (DS 5563)', +(r.compensacionIT||0), false,'pos') : '')
        + finRow('Pago IT efectivo en caja', -(r.pagoIT??r.impuestoIT??0), false, (r.pagoIT??r.impuestoIT??0)===0?'neutral':'neg')
        + ((r.pagoIUE||0)>0  ? finRow('Pago IUE',           -(r.pagoIUE||0),   false,'neg') : '')
        + ((r.saldoIUEfinal||0)>0 ? finRow('Saldo IUE compensable próx. trim.', r.saldoIUEfinal||0, false,'neutral') : '')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= Flujo Neto de Actividades de Operación', entOp-salOp, false)
        + '<div style="height:12px"></div>'
        + sec('Flujo de Efectivo por Actividades de Inversión')
        + secS('Entradas de Inversión')
        + finRow('Venta de activos fijos', r.ventaActivosFijos||0, false,'pos')
        + '<div style="height:4px"></div>'
        + secS('Salidas de Inversión')
        + finRow('Compra de activos fijos / maquinaria', -(r.compraActivosFijos||0), false,'neg')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= Flujo Neto de Actividades de Inversión', (r.ventaActivosFijos||0)-(r.compraActivosFijos||0), false)
        + '<div style="height:12px"></div>'
        + sec('Flujo de Efectivo por Actividades de Financiamiento')
        + secS('Entradas de Financiamiento')
        + ((r.ingresoPrestamo||0)>0 ? finRow('Ingreso por préstamo', r.ingresoPrestamo||0, false,'pos') : '')
        + '<div style="height:4px"></div>'
        + secS('Salidas de Financiamiento')
        + ((r.pagoIntereses||r.interesesPrestamo||0)>0 ? finRow('Pago intereses préstamo', -(r.pagoIntereses||r.interesesPrestamo||0), false,'neg') : '')
        + ((r.comisionApertura||0)>0 ? finRow('Pago comisión apertura', -(r.comisionApertura||0), false,'neg') : '')
        + '<div style="height:4px;border-top:1px dashed var(--border)"></div>'
        + finRowSub('= Flujo Neto de Actividades de Financiamiento', entFin-salFin, false)
        + '<div style="height:12px"></div>'
        + '<div style="height:4px;border-top:2px solid var(--border2)"></div>'
        + finRowSub('Aumento / Disminución Neta de Caja', (entOp-salOp)+(r.ventaActivosFijos||0)-(r.compraActivosFijos||0)+(entFin-salFin), false)
        + '<div style="height:4px"></div>'
        + finRowSub('= CAJA FINAL', r.cajaFinal, true);
    }

    html += '</div>';
    return html;
  }).join('');
}

// helper: wrap vista comparativa + vista estudiante con toggle
function withToggle(pfxId, tabKey, comparativaHTML, rd) {
  const btnId  = pfxId + '_togBtn_' + tabKey;
  const compId = pfxId + '_comp_'   + tabKey;
  const studId = pfxId + '_stud_'   + tabKey;
  return '<div>'
    + '<div style="display:flex;justify-content:flex-end;margin-bottom:10px">'
    + '<div style="display:inline-flex;border:0.5px solid var(--border);border-radius:var(--r);overflow:hidden;font-size:.75rem">'
    + '<button id="' + btnId + '_c" onclick="toggleVistaAdmin(\'' + compId + '\',\'' + studId + '\',\'' + btnId + '\')" '
    + 'style="padding:5px 12px;background:var(--accent);color:#fff;border:none;cursor:pointer">Vista comparativa</button>'
    + '<button id="' + btnId + '_s" onclick="toggleVistaAdmin(\'' + studId + '\',\'' + compId + '\',\'' + btnId + '\')" '
    + 'style="padding:5px 12px;background:transparent;border:none;cursor:pointer;color:var(--text2)">Vista por equipo</button>'
    + '</div></div>'
    + '<div id="' + compId + '">' + comparativaHTML + '</div>'
    + '<div id="' + studId + '" style="display:none">' + buildVistaEstudiantePorEquipo(rd, tabKey) + '</div>'
    + '</div>';
}

window.toggleVistaAdmin = (showId, hideId, btnId) => {
  const show = document.getElementById(showId);
  const hide = document.getElementById(hideId);
  if (show) show.style.display = '';
  if (hide) hide.style.display = 'none';
  // Actualizar estilos de botones
  const bComp = document.getElementById(btnId + '_c');
  const bStud = document.getElementById(btnId + '_s');
  if (bComp && bStud) {
    const showIsComp = showId.includes('_comp_');
    bComp.style.background = showIsComp ? 'var(--accent)' : 'transparent';
    bComp.style.color       = showIsComp ? '#fff' : 'var(--text2)';
    bStud.style.background  = showIsComp ? 'transparent' : 'var(--accent)';
    bStud.style.color       = showIsComp ? 'var(--text2)' : '#fff';
  }
};

window.adminEFTab = (n, pfx) => {
  // F7-FIX: pfx identifica la instancia correcta de los tabs
  // Soporte legado: si no hay pfx busca IDs antiguos
  [1,2,3,4,5,6].forEach(i => {
    const pane = document.getElementById(pfx ? pfx+'pane'+i : 'adminEFPane'+i);
    const btn  = document.getElementById(pfx ? pfx+'btn'+i  : 'btnEFT'+i);
    if (pane) pane.style.display = i===n ? '' : 'none';
    if (btn)  btn.className = i===n ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  });
};


// ── Admin Mercado ──────────────────────────────────────────

// ══════════════════════════════════════════════════════════
// ADMIN — PARÁMETROS
// ══════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════
// ADMIN — SEGMENTOS
// ══════════════════════════════════════════════════════════
let segmentosLocal = [];

// ══════════════════════════════════════════════════════════
// ADMIN — MATRIZ AFINIDAD
// ══════════════════════════════════════════════════════════
let afinidadLocal = null;
let segmentosForAfinidad = [];

// ══════════════════════════════════════════════════════════
// ADMIN — COMPETENCIA EXTERNA
// ══════════════════════════════════════════════════════════
let competenciaLocal = [];


// ═══════════════════════════════════════════════════════════
//  EQUIPO
// ═══════════════════════════════════════════════════════════
// ── Imprimir panel activo del equipo ─────────────────────────
function printPanelActivo() {
  const nombre = (state.me && state.me.nombre) || '';
  const ronda  = hojaRondaActual || 1;
  const sub    = 'Trimestre ' + ronda + ' / 20';

  // Detectar la VIEW activa por clase CSS 'active'
  const activeView = document.querySelector('#screen-equipo .view.active');
  if (!activeView) { toast('Navega a un panel primero', 'info'); return; }

  const viewId = activeView.id;

  if (viewId === 'eq-financiero') {
    printFinancieroCompleto(nombre, ronda);
    return;
  }
  if (viewId === 'eq-resultados') {
    printPanel('equipoResultadosContent', 'KPIs y Resultados — ' + nombre, sub);
    return;
  }
  if (viewId === 'eq-creditos') {
    printPanel('eq-creditos-content', 'Créditos y Financiamiento — ' + nombre, sub);
    return;
  }
  if (viewId === 'eq-reportes') {
    printPanel('reportesContent', 'Investigación de Mercado — ' + nombre, sub);
    return;
  }
  if (viewId === 'eq-hoja') {
    printHoja();
    return;
  }
  toast('Este panel no tiene versión imprimible', 'info');
}

// ── Imprimir Estados Financieros completos (P&L + BG + FC) ────
function printFinancieroCompleto(nombre, ronda) {
  const plEl = document.getElementById('finPL');
  const bgEl = document.getElementById('finBG');
  const fcEl = document.getElementById('finFC');

  // Mostrar todos temporalmente para capturar el HTML
  const prevPL = plEl ? plEl.style.display : '';
  const prevBG = bgEl ? bgEl.style.display : '';
  const prevFC = fcEl ? fcEl.style.display : '';
  if (bgEl) bgEl.style.display = '';
  if (fcEl) fcEl.style.display = '';

  const html = (plEl ? plEl.innerHTML : '')
             + (bgEl ? bgEl.innerHTML : '')
             + (fcEl ? fcEl.innerHTML : '');

  // Restaurar estado de display
  if (bgEl) bgEl.style.display = prevBG;
  if (fcEl) fcEl.style.display = prevFC;

  const css = '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:Segoe UI,sans-serif;font-size:11px;color:#111;background:#fff;padding:16px}'
    + 'h1{font-size:14px;margin-bottom:4px;color:#2a2f45}'
    + '.sub{font-size:9px;color:#666;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #2a2f45}'
    + 'table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10px}'
    + 'th{background:#2a2f45;color:#fff;padding:5px 8px;text-align:left;font-size:8.5px;text-transform:uppercase}'
    + 'td{padding:4px 8px;border:1px solid #ddd;vertical-align:top}'
    + 'tr:nth-child(even) td{background:#f8f9ff}'
    + '.result-round-card{border:1px solid #ddd;border-radius:5px;margin-bottom:12px;overflow:hidden;break-inside:avoid}'
    + '.result-round-header{background:#2a2f45;color:#fff;padding:6px 12px;font-size:9.5px;font-weight:700;text-transform:uppercase}'
    + '.fin-row{display:flex;justify-content:space-between;padding:3px 12px;border-bottom:1px solid #f0f0f0;font-size:10px}'
    + '.fin-row.sub{background:#f0f4ff;font-weight:700}'
    + '.pos,.up{color:#27ae60}.neg,.down{color:#e74c3c}'
    + '.num{text-align:right}'
    + 'button,.no-print{display:none!important}'
    + '@media print{@page{margin:1cm;size:A4}body{padding:8px}}';

  const win = window.open('', '_blank', 'width=1100,height=900');
  const parts = [
    '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>',
    '<title>Estados Financieros — ' + nombre + ' — Ronda ' + ronda + '</title>',
    '<style>' + css + '</style></head><body>',
    '<h1>Estados Financieros — ' + nombre + '</h1>',
    '<div class="sub">Trimestre ' + ronda + ' / 20 | SimNego COM540 UAGRM</div>',
    '<h2 style="font-size:11px;margin:8px 0 4px;color:#2a2f45;text-transform:uppercase">Estado de Resultados</h2>',
    (plEl ? plEl.innerHTML : ''),
    '<div style="margin-top:14px"></div>',
    '<h2 style="font-size:11px;margin:8px 0 4px;color:#2a2f45;text-transform:uppercase">Balance General</h2>',
    (bgEl ? bgEl.innerHTML : ''),
    '<div style="margin-top:14px"></div>',
    '<h2 style="font-size:11px;margin:8px 0 4px;color:#2a2f45;text-transform:uppercase">Flujo de Efectivo</h2>',
    (fcEl ? fcEl.innerHTML : ''),
    '</body></html>'
  ];
  win.document.open();
  win.document.write(parts.join(''));
  win.document.close();
  setTimeout(function(){ try{ win.print(); }catch(e){} }, 600);
}

async function initEquipo() {
  showScreen('screen-equipo');
  setupNav('screen-equipo');
  document.getElementById('equipoNombreSidebar').textContent = state.me.nombre;
  document.getElementById('btnEquipoLogout').addEventListener('click', doLogout);
  document.getElementById('btnPrintHoja').addEventListener('click', printHoja);
  // P1 FIX: conectar botones del encabezado a sus funciones
  document.getElementById('btnGuardar')?.addEventListener('click', guardarDecision);
  document.getElementById('btnEnviar')?.addEventListener('click', enviarDecision);

  // Show/hide print button only on hoja view
  document.querySelectorAll('#screen-equipo .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('btnPrintHoja').style.display = btn.dataset.view === 'eq-hoja' ? '' : 'none';
    });
  });

  // ── BUG CORREGIDO: /api/decisiones lanzaba 400 si la sesión perdió
  //    simulacionId (ej: relogin después de expiración de cookie).
  //    Ahora muestra mensaje claro en lugar de romper toda la inicialización.
  try {
    const decData = await api('GET', '/api/decisiones');
    state.ref = decData.referencia || null;
    state.decisiones = decData.decision;
    await loadHojaDecision();
  } catch(e) {
    const wrap = document.getElementById('decisionFormWrap');
    if (wrap) {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:40px 20px;text-align:center">
          <div style="font-size:48px;margin-bottom:12px">⚠️</div>
          <h3 style="margin-bottom:8px">Sesión sin simulación activa</h3>
          <p style="color:var(--text3);font-size:.88rem;margin-bottom:20px">
            Tu sesión expiró o fue iniciada sin un código de simulación.<br>
            Cierra sesión y vuelve a ingresar con tu nombre de equipo y contraseña,<br>
            o solicita al profesor que reactive tu acceso.
          </p>
          <button class="btn btn-primary" onclick="doLogout()">Cerrar sesión →</button>
        </div>`;
    }
  }
}

// ── Decision Form ──────────────────────────────────────────
async function loadDecisionForm() {
  const data = await api('GET','/api/decisiones');
  state.decisiones = data.decision;
  const n = data.ronda;
  const isSimulated = data.roundState === 'simulated';
  const isPending   = data.roundState === 'pending';
  const isLocked    = data.roundState === 'locked';
  const submitted   = data.decision.submitted;
  const isEditable  = !isSimulated && !isPending && !isLocked && !submitted;

  document.getElementById('decRondaNum').textContent = n;
  document.getElementById('equipoRoundBadge').textContent = `Ronda ${n}/20`;
  document.getElementById('equipoStateBadge').textContent =
    isSimulated ? '🔒 Simulada'
    : isPending  ? '⏸ Pendiente'
    : isLocked   ? '🔒 Cerrada'
    : submitted  ? '✓ Enviada'
    : '🟢 Abierta';

  const msg = isSimulated
    ? '🔒 Esta ronda ya fue simulada. Los resultados están en "Mis Resultados".'
    : isPending
    ? '⏸ El profesor aún no ha habilitado las decisiones para este trimestre. Espera su indicación.'
    : isLocked
    ? '🔒 El profesor cerró el envío de decisiones. Ya no puedes modificar.'
    : submitted
    ? '✅ Decisiones enviadas. Esperando que el profesor ejecute la simulación.'
    : '🟢 Ingresa tus decisiones y presiona Enviar cuando estés listo.';

  const bannerClass = isSimulated ? 'simulated'
    : isPending  ? 'pending'
    : isLocked   ? 'simulated'
    : submitted  ? 'submitted'
    : 'open';
  document.getElementById('decEstadoMsg').innerHTML = msg;

  const d = state.decisiones;
  const ref = state.ref;
  const disabled = isEditable ? '' : 'disabled';

  const segOpts = '<option value="">-- Seleccionar segmento --</option>' +
  ref.segmentos.map(s => `<option ${s.nombre === d.segmentoObjetivo ? 'selected' : ''}>${s.nombre}</option>`).join('');
  
  const canalOpts = ref.canales.map(c => `<option ${c.nombre===d.canal?'selected':''}>${c.nombre}</option>`).join('');

  const inp = (field, val, extra='') => `<input class="form-input editable" data-field="${field}" ${disabled} ${extra} value="${val ?? ''}"/>`;
  const sel = (field, opts) => `<select class="form-select editable" data-field="${field}" ${disabled}>${opts}</select>`;
  const chk = (field, val, label, cost) => `
    <label class="check-label">
      <input type="checkbox" data-field="${field}" ${val?'checked':''} ${disabled}/>
      ${label}<span class="check-cost">${cost}</span>
    </label>`;

  document.getElementById('decisionFormWrap').innerHTML = `
    <div class="status-banner ${bannerClass}">${msg}</div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">1 · Producto y Segmento</span></div>
      <div class="decision-card-body">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">🎯 Segmento objetivo</label>${sel('segmentoObjetivo',segOpts)}</div>
          <div class="form-group"><label class="form-label">🧪 Tipo de producto</label>${sel('tipoProducto',prodOpts)}</div>
          <div class="form-group"><label class="form-label">⭐ Calidad (1–10)</label>${inp('calidad',d.calidad,'type="number" min="1" max="10" step="1"')}<span class="form-hint">5 = estándar · Cada punto extra sube costo unitario +0.20 Bs y mejora atractivo</span></div>
          <div class="form-group"><label class="form-label">💡 Diferenciación (1–10)</label>${inp('diferenciacion',d.diferenciacion,'type="number" min="1" max="10" step="1"')}<span class="form-hint">+3% costo/punto sobre 5</span></div>
        </div>
      </div>
    </div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">2 · Precios y Canal</span></div>
      <div class="decision-card-body">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">💰 Precio consumidor (Bs)</label>${inp('precioConsumidor',d.precioConsumidor,'type="number" min="1" step="0.5"')}</div>
          <div class="form-group"><label class="form-label">🏪 Precio canal (Bs)</label>${inp('precioCanal',d.precioCanal,'type="number" min="1" step="0.5"')}<span class="form-hint">Debe ser menor al precio consumidor</span></div>
          <div class="form-group"><label class="form-label">📦 Canal de distribución</label>${sel('canal',canalOpts)}</div>
        </div>
      </div>
    </div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">3 · Marketing y Fuerza de Ventas</span></div>
      <div class="decision-card-body">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">📢 Marketing (Bs)</label>${inp('marketing',d.marketing,'type="number" min="0" step="500"')}<span class="form-hint">Rendimientos decrecientes (ln)</span></div>
          <div class="form-group"><label class="form-label">👥 Vendedores actuales</label><input class="form-input" value="${d.vendedoresIniciales}" readonly/></div>
          <div class="form-group"><label class="form-label">➕ Contratar</label>${inp('contratarVendedores',d.contratarVendedores,'type="number" min="0" step="1"')}<span class="form-hint">Bs 500/vendedor</span></div>
          <div class="form-group"><label class="form-label">➖ Despedir</label>${inp('despedirVendedores',d.despedirVendedores,'type="number" min="0" step="1"')}<span class="form-hint">Bs 700/vendedor</span></div>
          <div class="form-group"><label class="form-label">💵 Comisión (%)</label>${inp('comision',d.comision,'type="number" min="0" max="0.5" step="0.005"')}<span class="form-hint">Ej: 0.03 = 3%</span></div>
        </div>
      </div>
    </div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">4 · Producción</span></div>
      <div class="decision-card-body">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">🏭 Producción (unidades)</label>${inp('produccion',d.produccion,'type="number" min="0" step="500"')}<span class="form-hint">1,500 unid/operario · Descuento escala hasta 18%</span></div>
          <div class="form-group"><label class="form-label">📦 Inventario inicial (unid)</label><input class="form-input" value="${fmt.num(d.inventarioInicial)}" readonly/><span class="form-hint">Propagado automáticamente</span></div>
        </div>
      </div>
    </div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">5 · Finanzas</span></div>
      <div class="decision-card-body">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">💵 Caja inicial</label><input class="form-input" value="${fmt.bs(d.cajaInicial)}" readonly/></div>
          <div class="form-group"><label class="form-label">📈 Préstamo nuevo (Bs)</label>${inp('prestamoNuevo',d.prestamoNuevo,'type="number" min="0" step="1000"')}</div>
          <div class="form-group"><label class="form-label">📉 Amortización (Bs)</label>${inp('amortizacion',d.amortizacion,'type="number" min="0" step="1000"')}</div>
          <div class="form-group"><label class="form-label">% Ventas a crédito</label>${inp('pctVentasCredito',d.pctVentasCredito,'type="number" min="0" max="1" step="0.05"')}</div>
          <div class="form-group"><label class="form-label">% Compras a crédito</label>${inp('pctComprasCredito',d.pctComprasCredito,'type="number" min="0" max="1" step="0.05"')}</div>
        </div>
      </div>
    </div>

    <div class="decision-card">
      <div class="decision-card-header"><span class="section-tag">6 · Investigación de Mercado</span></div>
      <div class="decision-card-body">
        <div class="check-grid">
          ${chk('compraSegmentacion',d.compraSegmentacion,'📊 Segmentación','Bs 1,000')}
          ${chk('compraPrecios',d.compraPrecios,'💲 Precios','Bs 1,200')}
          ${chk('compraCompetencia',d.compraCompetencia,'🔍 Competencia','Bs 1,500')}
          ${chk('compraCanales',d.compraCanales,'📦 Canales','Bs 800')}
        </div>
        <p class="form-hint" style="margin-top:10px">Los reportes comprados se mostrarán en la pestaña "Reportes" después de la simulación.</p>
      </div>
    </div>
  `;

  // Bind inputs
  document.querySelectorAll('#decisionFormWrap [data-field]').forEach(el => {
    const ev = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      let val = el.type === 'checkbox' ? el.checked
              : el.type === 'number'   ? +el.value
              : el.tagName === 'SELECT' ? el.value.replace(/\s*\(Bs[\d.]+\)\s*$/, '')
              : el.value;
      if (el.tagName === 'SELECT' && el.dataset.field === 'tipoProducto') {
        val = el.value.replace(/\s*\(Bs[\d.\s]+\)\s*$/, '').trim();
        // FIX: escribir también el campo canónico "producto" que usa el motor
        state.decisiones['producto'] = val;
        if (state.decisiones.productos?.[0]) {
          state.decisiones.productos[0].producto = val;
        }
      }
      state.decisiones[el.dataset.field] = val;
    });
  });

  // Toggle buttons visibility
  document.getElementById('btnGuardar').style.display = isEditable ? '' : 'none';
  document.getElementById('btnEnviar').style.display  = isEditable ? '' : 'none';
}

function sincronizarHojaConEstado() {
  // P4 FIX: sincroniza el DOM de la hoja con state.decisiones antes de
  // guardar o enviar, capturando cambios no procesados por el change handler.
  document.querySelectorAll('[data-hoja-field]').forEach(el => {
    if (!state.decisiones) return;
    const field = el.dataset.hojaField;
    const v = el.type === 'checkbox' ? el.checked
            : el.type === 'number'   ? +el.value
            : el.tagName === 'SELECT'
              ? el.value.replace(/\s*\(Bs[\d.\s]+\)\s*$/, '').trim()
            : el.value;
    const prodFields = ['producto','segmentoObjetivo','canalPrincipal',
      'canalSecundario','calidad','precioVenta','produccion','publicidad',
      'promocion','eventos','marketingRedes','relacionesPublicas',
      'innovacion','tipoInnovacion','montoInnovacion'];
    if (state.decisiones.productos?.[0] && prodFields.includes(field)) {
      state.decisiones.productos[0][field] = v;
    }
    if (field === 'producto' || field === 'tipoProducto') {
      state.decisiones['producto'] = v;
      if (state.decisiones.productos?.[0]) {
        state.decisiones.productos[0].producto = v;
      }
    }
    state.decisiones[field] = v;
  });
}

async function guardarDecision() {
  try {
    await api('POST','/api/decisiones/guardar',{ decision: state.decisiones });
    toast('💾 Decisiones guardadas','success');
  } catch(e) { toast(e.message,'error'); }
}

async function enviarDecision() {
  // Validar rangos críticos antes de enviar
  const _dec = state.decisiones || {};
  const contratar = Number(_dec.contratarOperarios ?? 0);
  const despedir  = Number(_dec.despedirOperarios  ?? 0);
  if (contratar > 50) return toast('❌ "Contratar operarios" no puede exceder 50 por ronda. Valor ingresado: ' + contratar, 'error');
  if (despedir  > 50) return toast('❌ "Despedir operarios" no puede exceder 50 por ronda. Valor ingresado: ' + despedir,  'error');
  if (!confirm('¿Enviar decisiones al simulador?\n\nPodrás ver tus resultados cuando el profesor ejecute la simulación.')) return;
  try {
    const _d1 = JSON.parse(JSON.stringify(state.decisiones, (k,v) => v===undefined?null:v));
    await api('POST','/api/decisiones/enviar',{ decision: _d1 });
    toast('✅ Decisiones enviadas correctamente','success');
    await loadDecisionForm();
  } catch(e) { toast(e.message,'error'); }
}

// ── Hoja de Decisión ──────────────────────────────────────
// Estado local de la hoja (se comparte con el formulario principal)
// ══════════════════════════════════════════════════════════
// HOJA DE DECISIÓN — 20 rondas
// Estado local: no se usa hojaRondaActiva dentro de plantillas
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// HOJA DE DECISIÓN — diseño simple y directo, sin caché
// Carga siempre fresco desde el servidor al abrir la vista
// ══════════════════════════════════════════════════════════

let hojaRondaActual = 1;   // ronda que está mostrando el selector

let hojaProductoActivo = 0;

function normalizarDecisionMultiproducto(decision) {
  decision = decision || {};

  // FIX: el formulario legado usa data-field="tipoProducto"; mapear a "producto"
  // para garantizar que el motor siempre recibe el campo correcto.
  if (!decision.producto && decision.tipoProducto) {
    decision.producto = decision.tipoProducto;
  }

  if (!Array.isArray(decision.productos) || decision.productos.length === 0) {
    decision.productos = [{
      productoId: 'prod_1',
      activo: true,
      producto: decision.producto || decision.tipoProducto || '',
      segmentoObjetivo: decision.segmentoObjetivo || '',
      canalPrincipal: decision.canalPrincipal || '',
      canalSecundario: decision.canalSecundario || 'Ninguno',
      calidad: decision.calidad ?? 5,
      precioVenta: decision.precioVenta ?? 3.6,
      produccion: decision.produccion ?? 18000,
      publicidad: decision.publicidad ?? 3000,
      promocion: decision.promocion ?? 2000,
      eventos: decision.eventos ?? 1000,
      marketingRedes: decision.marketingRedes ?? 1000,
      relacionesPublicas: decision.relacionesPublicas ?? 1000,
      innovacion: decision.innovacion ?? false,
      tipoInnovacion: decision.tipoInnovacion || '',
      montoInnovacion: decision.montoInnovacion ?? 0
    }];
  }

  // Compatibilidad temporal: el primer producto sigue alimentando los campos antiguos
  const p = decision.productos[0] || {};
  decision.producto = p.producto;
  decision.segmentoObjetivo = p.segmentoObjetivo;
  decision.canalPrincipal = p.canalPrincipal;
  decision.canalSecundario = p.canalSecundario;
  decision.calidad = p.calidad;
  decision.precioVenta = p.precioVenta;
  decision.produccion = p.produccion;
  decision.publicidad = p.publicidad;
  decision.promocion = p.promocion;
  decision.eventos = p.eventos;
  decision.marketingRedes = p.marketingRedes;
  decision.relacionesPublicas = p.relacionesPublicas;
  decision.innovacion = p.innovacion;
  decision.tipoInnovacion = p.tipoInnovacion;
  decision.montoInnovacion = p.montoInnovacion;

  return decision;
}

function crearProductoDefault(idx) {
  return {
    productoId: 'prod_' + (idx + 1),
    activo: true,
    producto: '',
    segmentoObjetivo: '',
    canalPrincipal: '',
    canalSecundario: 'Ninguno',
    calidad: 5,
    precioVenta: 0,
    produccion: 0,
    publicidad: 0,
    promocion: 0,
    eventos: 0,
    marketingRedes: 0,
    relacionesPublicas: 0,
    innovacion: false,
    tipoInnovacion: 'Producto',
    montoInnovacion: 0,
    vendedoresIniciales: state?.ref?.parametros?.vendedoresIniciales ?? 0,
    contratarVendedores: 0,
    despedirVendedores: 0,
    // Etapa 3.2: Operarios
    contratarOperarios:  0,
    despedirOperarios:   0,
    montoCapacitacion:   0,
    // Etapa 3.1: Materia Prima
    proveedorElegido:    '',
    cantidadMPpedida:    0,
    // Campos legado (para no romper motor con decisiones monoproducto viejas)
    tipoPrestamo: 'Ninguno',
    montoPrestamo: 0,
    amortizacion: 0,
  };
}

async function loadHojaDecision() {
  const cont = document.getElementById('hojaContent');
  const sel  = document.getElementById('hojaRondaSelector');
  if (!cont) { console.error('hojaContent no encontrado'); return; }

  cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Cargando hoja de decisión…</div>';

  let decData, resData;
  try {
    [decData, resData] = await Promise.all([
      api('GET', '/api/decisiones'),
      api('GET', '/api/resultados'),
    ]);
  } catch(e) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p style="color:var(--accent4)">Error de conexión: ${e.message}</p></div>`;
    return;
  }

  hojaRondaActual = decData.ronda;

  // Construir navegación de rondas
  const simuladas = new Set((resData.historial || []).map(h => h.ronda));
  let navHTML = '';
  for (let i = 1; i <= 20; i++) {
    const isCurrent = i === decData.ronda;
    const isSim     = simuladas.has(i);
    const isFuture  = i > decData.ronda;
    const cls = isCurrent ? 'active' : isSim ? 'done' : '';
    navHTML += `<button class="hoja-round-btn ${cls}" ${isFuture?'disabled':''} onclick="hojaIrRonda(${i})">T${i}</button>`;
  }
  if (sel) sel.innerHTML = navHTML;

  // Renderizar ronda actual
  await hojaRenderRonda(decData.ronda, decData.decision, decData.roundState, null);
}

// Navegar a otra ronda desde el selector
window.hojaIrRonda = async (n) => {
  hojaRondaActual = n;
  document.querySelectorAll('.hoja-round-btn').forEach((b, i) => b.classList.toggle('active', i+1===n));

  const cont = document.getElementById('hojaContent');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Cargando…</div>';

  try {
    // Ronda actual: cargar decisión editable
    const decData = await api('GET', '/api/decisiones');
    if (n === decData.ronda) {
      await hojaRenderRonda(n, decData.decision, decData.roundState, null);
      return;
    }
    // Ronda pasada: cargar resultado + decisión del historial
    const resData = await api('GET', '/api/resultados');
    const item = resData.historial?.find(h => h.ronda === n);
    if (item) {
      await hojaRenderRonda(n, item.decision || {}, 'simulated', item.resultado);
    } else {
      cont.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>Sin datos para la ronda ${n}</p></div>`;
    }
  } catch(e) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p style="color:var(--accent4)">${e.message}</p></div>`;
  }
};

// Renderiza la hoja para una ronda específica
async function hojaRenderRonda(n, decision, roundState, resultado) {
  const cont = document.getElementById('hojaContent');
  if (!cont) return;
  decision = decision || {};
  decision = normalizarDecisionMultiproducto(decision);
  state.decisiones = decision;

  if (roundState === 'pending') {
    cont.innerHTML = `
      <div class="round-pending-banner">
        <div style="font-size:2.5rem;margin-bottom:14px">⏸</div>
        <h3 style="font-size:1rem;font-weight:700;color:var(--accent3);margin-bottom:8px">Ronda ${n} — Aún no habilitada</h3>
        <p style="color:var(--text2);font-size:.88rem;line-height:1.7;max-width:400px;margin:0 auto">
          El profesor no ha activado la hoja de decisiones para este trimestre.<br>
          <strong>Regresa cuando el profesor indique que está disponible.</strong>
        </p>
        <button class="btn btn-ghost" style="margin-top:20px" onclick="loadHojaDecision()">↺ Verificar estado</button>
      </div>`;
    return;
  }

  // ── ESTADO PRE-SIM: el profesor calculó la demanda, el equipo debe confirmar ──
  if (roundState === 'pre-sim') {
    try {
      const psData = await api('GET', '/api/presim');
      // presim puede ser un objeto (1 producto) o array (múltiples productos)
      const psRaw = psData.presim;
      const psList = Array.isArray(psRaw) ? psRaw : [psRaw];
      const yaConfirmado = psList.every(p => p.confirmado);

      // Construir filas de tabla para cada producto
      const filas = psList.map((ps, idx) => `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:10px 14px;font-weight:700;color:var(--accent3)">
            Producto ${idx+1}
          </td>
          <td style="padding:10px 14px;font-size:.82rem">${ps.producto||'—'}</td>
          <td style="padding:10px 14px;font-size:.82rem">${ps.segmento||'—'}</td>
          <td style="padding:10px 14px;text-align:right;font-family:var(--font-mono)">${fmt.num(ps.demandaFormal)}</td>
          <td style="padding:10px 14px;text-align:right;font-family:var(--font-mono);color:var(--accent3)">${fmt.pct(ps.shareEstimado)}</td>
          <td style="padding:10px 14px;text-align:right;font-family:var(--font-mono);color:var(--accent5);font-weight:700">${fmt.num(ps.demandaAsignada)}</td>
          <td style="padding:10px 14px;text-align:right;font-family:var(--font-mono)">${fmt.num(ps.produccion)}</td>
          <td style="padding:10px 14px;text-align:right;font-family:var(--font-mono);color:var(--accent5);font-weight:700">${fmt.num(ps.ventasEstimadas)}</td>
          <td style="padding:10px 14px;text-align:right;font-family:var(--font-mono);color:${(ps.inventarioFinalEst||0)>0?'var(--accent4)':'var(--text)'}">${fmt.num(ps.inventarioFinalEst)}</td>
        </tr>
      `).join('');

      const totalVentas     = psList.reduce((s,p) => s + (p.ventasEstimadas||0), 0);
      const totalDemanda    = psList.reduce((s,p) => s + (p.demandaAsignada||0), 0);
      const totalProduccion = psList.reduce((s,p) => s + (p.produccion||0), 0);

      cont.innerHTML = `
        <div style="max-width:860px;margin:0 auto;padding:20px">
          <div style="text-align:center;margin-bottom:20px">
            <div style="font-size:2rem;margin-bottom:8px">📊</div>
            <h3 style="font-size:1.05rem;font-weight:700;color:var(--accent3)">Ronda ${n} — Demanda Estimada por Producto</h3>
            <p style="color:var(--text2);font-size:.84rem;margin-top:4px">
              El profesor ejecutó el cálculo de demanda para tus ${psList.length} producto(s). Revisa y confirma.
            </p>
          </div>

        <div style="background:rgba(158,216,48,0.06);border:1px solid rgba(158,216,48,0.2);border-radius:var(--r);padding:12px 16px;margin-bottom:14px;font-size:.8rem;color:var(--text2)">
          <strong style="color:var(--accent3)">📌 Cómo leer esta tabla:</strong><br>
          <span style="color:var(--text3)">Demanda total segmento</span> = todos los compradores potenciales del segmento este trimestre (incluye competidores externos como contrabando).<br>
          <span style="color:var(--text3)">Tu market share</span> = la fracción que tu empresa captura frente a <strong>todos</strong> los competidores (otros equipos + competidor externo).<br>
          <strong style="color:var(--accent5)">Tu demanda asignada</strong> = unidades que puedes vender = Demanda total × Tu share. <strong>Este es el número importante.</strong><br>
          <span style="color:var(--text3)">El admin ve directamente tu demanda asignada — por eso el número que ves y el que ve el profesor son distintos pero correctos.</span>
        </div>
            <div style="background:var(--bg3);padding:8px 16px;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:.62rem;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px">
              Resultados del cálculo de mercado
            </div>
            <div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;font-size:.82rem">
                <thead>
                  <tr style="background:rgba(255,255,255,.04)">
                    <th style="padding:8px 14px;text-align:left;font-size:.68rem;color:var(--text3);text-transform:uppercase">#</th>
                    <th style="padding:8px 14px;text-align:left;font-size:.68rem;color:var(--text3);text-transform:uppercase">Producto</th>
                    <th style="padding:8px 14px;text-align:left;font-size:.68rem;color:var(--text3);text-transform:uppercase">Segmento</th>
                    <th style="padding:8px 14px;text-align:right;font-size:.68rem;color:var(--text3);text-transform:uppercase" title="Total de compradores potenciales en el segmento este trimestre">Demanda total segmento</th>
                    <th style="padding:8px 14px;text-align:right;font-size:.68rem;color:var(--text3);text-transform:uppercase" title="Fracción del mercado que tu empresa capta frente a todos los competidores">Tu market share</th>
                    <th style="padding:8px 14px;text-align:right;font-size:.68rem;color:var(--accent5);text-transform:uppercase" title="Unidades que puedes vender = Demanda total × Tu share">Tu demanda asignada</th>
                    <th style="padding:8px 14px;text-align:right;font-size:.68rem;color:var(--text3);text-transform:uppercase">Producción</th>
                    <th style="padding:8px 14px;text-align:right;font-size:.68rem;color:var(--accent5);text-transform:uppercase">Ventas estimadas</th>
                    <th style="padding:8px 14px;text-align:right;font-size:.68rem;color:var(--text3);text-transform:uppercase">Inv. final est.</th>
                  </tr>
                </thead>
                <tbody>${filas}</tbody>
                <tfoot>
                  <tr style="background:rgba(6,255,165,.06);border-top:2px solid var(--border2)">
                    <td colspan="5" style="padding:8px 14px;font-weight:700;font-size:.82rem">TOTAL EMPRESA</td>
                    <td style="padding:8px 14px;text-align:right;font-family:var(--font-mono);font-weight:700;color:var(--accent5)">${fmt.num(totalDemanda)}</td>
                    <td style="padding:8px 14px;text-align:right;font-family:var(--font-mono);font-weight:700">${fmt.num(totalProduccion)}</td>
                    <td style="padding:8px 14px;text-align:right;font-family:var(--font-mono);font-weight:700;color:var(--accent5)">${fmt.num(totalVentas)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div style="background:rgba(255,209,102,.08);border:1px solid rgba(255,209,102,.3);border-radius:var(--r);padding:10px 14px;margin-bottom:16px;font-size:.81rem;color:var(--text2)">
            <strong style="color:var(--accent3)">ℹ️ ¿Qué significa esto?</strong> —
            Valores que el simulador usará en la simulación final. Reflejan tu atractivo competitivo frente a todos los equipos.
            <strong>No puedes modificarlos</strong> — son resultado de tus decisiones enviadas.
          </div>

          ${yaConfirmado
            ? '<div style="text-align:center;padding:14px;background:rgba(6,255,165,.08);border:1px solid rgba(6,255,165,.3);border-radius:var(--r)"><span style="font-size:1.4rem">✅</span><p style="color:var(--accent5);font-weight:700;margin-top:4px">Ya confirmaste la recepción de estos datos</p><p style="color:var(--text2);font-size:.82rem;margin-top:4px">Espera a que el profesor ejecute la simulación final.</p></div>'
            : '<button class="btn btn-success btn-full" style="padding:12px;font-size:.95rem" id="btnConfirmarPresim">✓ Confirmar — Recibí mi demanda estimada</button><p style="text-align:center;font-size:.74rem;color:var(--text3);margin-top:6px">Al confirmar le indicas al profesor que viste estos datos.</p>'
          }
        </div>`;

      if (!yaConfirmado) {
        document.getElementById('btnConfirmarPresim')?.addEventListener('click', async () => {
          try {
            await api('POST', '/api/presim/confirmar');
            toast('✅ Confirmado correctamente', 'success');
            await hojaRenderRonda(n, decision, roundState, resultado);
          } catch(e) { toast(e.message, 'error'); }
        });
      }
    } catch(e) {
      cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p style="color:var(--accent4)">${e.message}</p></div>`;
    }
    return;
  }

  const ref = state.ref;
  if (!ref) {
    cont.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Error: datos de referencia no cargados. <button class="btn btn-ghost btn-sm" onclick="location.reload()">Recargar</button></p></div>`;
    return;
  }

  const j = decision.justificaciones || {};
   const productos = decision.productos || [];

      if (hojaProductoActivo >= productos.length) {
        hojaProductoActivo = 0;
      }

      const productoActivo = productos[hojaProductoActivo] || productos[0] || crearProductoDefault(0);

    window.hojaSeleccionarProducto = (idx) => {
      hojaProductoActivo = idx;
      hojaRenderRonda(n, state.decisiones, roundState, resultado);
    };

    window.hojaAgregarProducto = () => {
      if (!Array.isArray(state.decisiones.productos)) {
        state.decisiones.productos = [];
      }

      if (state.decisiones.productos.length >= 5) {
        toast('Máximo 5 productos por empresa', 'info');
        return;
      }

      state.decisiones.productos.push(
        crearProductoDefault(state.decisiones.productos.length)
      );

      hojaProductoActivo = state.decisiones.productos.length - 1;

      hojaRenderRonda(n, state.decisiones, roundState, resultado);
    };

    window.hojaEliminarProducto = (idx) => {
      if (!Array.isArray(state.decisiones.productos) || state.decisiones.productos.length <= 1) {
        toast('No se puede eliminar el único producto', 'info');
        return;
      }
      state.decisiones.productos.splice(idx, 1);
      // Ajustar índice activo si es necesario
      if (hojaProductoActivo >= state.decisiones.productos.length) {
        hojaProductoActivo = state.decisiones.productos.length - 1;
      }
      hojaRenderRonda(n, state.decisiones, roundState, resultado);
    };

  const isEditable = roundState === 'open' && !decision.submitted;
  const isLocked   = roundState === 'locked';

  const inp = (field, val, type='number', extra='') =>
    isEditable
      ? `<input class="hoja-input editable" data-hoja-field="${field}" type="${type}" value="${val??''}" ${extra}/>`
      : `<span class="hoja-value-ro">${val??'—'}</span>`;

  const sel = (field, opts) =>
    isEditable
      ? `<select class="hoja-select editable" data-hoja-field="${field}">${opts}</select>`
      : `<span class="hoja-value-ro">${decision[field]||'—'}</span>`;

  const ta = (jfield, ph) =>
    isEditable
      ? `<textarea class="hoja-textarea editable" data-hoja-just="${jfield}" placeholder="${ph}">${j[jfield]||''}</textarea>`
      : `<span style="color:var(--text3);font-size:.76rem;font-style:italic">${j[jfield]||'—'}</span>`;

  const chk = (field, label) =>
    isEditable
      ? `<input type="checkbox" data-hoja-field="${field}" ${decision[field]?'checked':''} style="width:16px;height:16px;accent-color:var(--accent)"/> ${label}`
      : `<span class="hoja-value-ro">${decision[field]?'✓ Sí':'✗ No'}</span> ${label}`;

    const segOpts = '<option value="">-- Seleccionar segmento --</option>' +
    ref.segmentos.map(s => `<option ${s.nombre === productoActivo.segmentoObjetivo ? 'selected' : ''}>${s.nombre}</option>`).join('');
     const prodOpts = '<option value="">-- Seleccionar producto --</option>' +
    ref.tiposProducto.map(t => `<option ${t.nombre === productoActivo.producto ? 'selected' : ''}>${t.nombre} (Bs ${t.costoBase})</option>`).join('');
  
      // canales puede ser array [{nombre,...}] o objeto {nombre:{...}}
  const _canalNames = Array.isArray(ref.canales)
    ? ref.canales.map(c => c.nombre)
    : Object.keys(ref.canales || {});
  const canalOpts  = ['Ninguno', ..._canalNames].map(c => `<option ${c===productoActivo.canalPrincipal?'selected':''}>${c}</option>`).join('');
  const canal2Opts = ['Ninguno', ..._canalNames].map(c => `<option ${c===productoActivo.canalSecundario?'selected':''}>${c}</option>`).join('');
  const tipoPresOpts = ['Ninguno','Operativo','Inversión'].map(t=>`<option ${t===decision.tipoPrestamo?'selected':''}>${t}</option>`).join('');
  const tipoInnOpts = ['Producto','Proceso','Canal'].map(t=>`<option ${t===productoActivo.tipoInnovacion?'selected':''}>${t}</option>`).join('');
  const tipoInvOpts  = ['No','Básica','Premium','Estratégico'].map(t=>`<option ${t===decision.tipoInvestigacion?'selected':''}>${t}</option>`).join('');

  const p = ref.parametros || {};
  const estadoBadge = roundState==='simulated' ? '<span class="badge badge-simulated">🔒 Simulada</span>'
    : isLocked ? '<span class="badge badge-alert">🔒 Cerrada</span>'
    : decision.submitted ? '<span class="badge badge-sent">✓ Enviada</span>'
    : '<span class="badge badge-open">🟢 Abierta</span>';

  cont.innerHTML = `
  <div class="hoja-wrap">
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
  ${productos.map((p, idx) => `
    <button
      type="button"
      class="btn ${idx === hojaProductoActivo ? 'btn-success' : 'btn-ghost'} btn-sm"
      onclick="hojaSeleccionarProducto(${idx})"
      style="padding-right: ${isEditable && idx > 0 ? '4px' : ''}"
    >
      📦 Producto ${idx + 1}
      ${isEditable && idx > 0 ? `<span
        onclick="event.stopPropagation(); hojaEliminarProducto(${idx})"
        style="margin-left:6px;color:#e74c3c;font-weight:bold;font-size:.85rem;cursor:pointer"
        title="Eliminar Producto ${idx + 1}"
      >✕</span>` : ''}
    </button>
  `).join('')}

  ${isEditable ? `
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      onclick="hojaAgregarProducto()"
    >
      ➕ Agregar Producto
    </button>
  ` : ''}
</div>

    <div class="hoja-team-header">
      <span class="hoja-team-nombre">📋 ${state.me?.nombre||''}</span>
      <span class="hoja-team-ronda">Trimestre ${n} / 20</span>
      <span class="hoja-team-estado">${estadoBadge}</span>
    </div>

    <!-- S1: PRODUCTO Y SEGMENTO -->
    <div class="hoja-section">
      <div class="hoja-section-title">1 · Producto y Segmento Objetivo</div>
      <table class="hoja-table">
        <thead><tr><th>Decisión</th><th>Tu elección</th><th>Referencia</th><th>Justificación</th></tr></thead>
        <tbody>
          <tr><td class="hoja-label">🎯 Segmento objetivo</td>
              <td>${sel('segmentoObjetivo',segOpts)}</td>
              <td class="hoja-ref">7 segmentos disponibles</td>
              <td>${ta('segmentoProducto','¿Por qué este segmento?')}</td></tr>
          <tr><td class="hoja-label">🧪 Tipo de producto</td>
              <td>${sel('producto',prodOpts)}</td>
              <td class="hoja-ref">Costo base varía por tipo</td>
              <td></td></tr>
          <tr><td class="hoja-label">📦 Canal principal</td>
              <td>${sel('canalPrincipal',canalOpts)}</td>
              <td class="hoja-ref">Define costo, comisión e impacto vendedores</td>
              <td>${ta('canal','¿Por qué este canal?')}</td></tr>
          <tr><td class="hoja-label">📦 Canal secundario</td>
              <td>${sel('canalSecundario',canal2Opts)}</td>
              <td class="hoja-ref">Opcional — promedia con canal principal</td>
              <td></td></tr>
          <tr><td class="hoja-label">⭐ Calidad (1–10)</td>
              <td>${inp('calidad',productoActivo.calidad,'number','min="1" max="10" step="1"')}</td>
              <td class="hoja-ref">5 = estándar de mercado. Cada punto sobre/bajo 5 sube/baja el costo unitario un ${((p.pctCostoCalidad??0.08)*100).toFixed(0)}% del costo base. Máx 10.</td>
              <td></td></tr>
          <tr><td class="hoja-label">💰 Precio de venta (Bs)</td>
              <td>${inp('precioVenta',productoActivo.precioVenta,'number','min="0.1" step="0.1"')}</td>
              <td class="hoja-ref">Precio al consumidor final. Afecta atractivo competitivo.</td>
              <td>${ta('precios','¿Estrategia de precio?')}</td></tr>
        </tbody>
      </table>
    </div>

        <!-- S2: MARKETING DESAGREGADO -->
    <div class="hoja-section">
      <div class="hoja-section-title">2 · Marketing y Fuerza de Ventas</div>
      <table class="hoja-table">
        <thead><tr><th>Rubro</th><th>Monto (Bs)</th><th>Referencia</th><th>Justificación</th></tr></thead>
        <tbody>
          <tr><td class="hoja-label">📣 Publicidad</td>
              <td>${inp('publicidad',productoActivo.publicidad,'number','min="0" step="500"')}</td>
              <td class="hoja-ref">Impacto en atractivo competitivo</td>
              <td>${ta('marketing','¿Cómo distribuiste el presupuesto?')}</td></tr>
          <tr><td class="hoja-label">🎁 Promoción</td>
              <td>${inp('promocion',productoActivo.promocion,'number','min="0" step="500"')}</td>
              <td class="hoja-ref">Alta eficacia en segmentos masivos</td><td></td></tr>
          <tr><td class="hoja-label">🎪 Eventos</td>
              <td>${inp('eventos',productoActivo.eventos,'number','min="0" step="500"')}</td>
              <td class="hoja-ref">Eficacia media; fortalece posicionamiento</td><td></td></tr>
          <tr><td class="hoja-label">📱 Marketing en redes</td>
              <td>${inp('marketingRedes',productoActivo.marketingRedes,'number','min="0" step="500"')}</td>
              <td class="hoja-ref">Alta eficacia en segmentos Natural y Cosmético</td><td></td></tr>
          <tr><td class="hoja-label">📰 Relaciones públicas</td>
              <td>${inp('relacionesPublicas',productoActivo.relacionesPublicas,'number','min="0" step="500"')}</td>
              <td class="hoja-ref">Alta eficacia en segmentos diferenciados</td><td></td></tr>
          <tr style="border-top:2px solid var(--border2)">
            <td class="hoja-label">👥 Vendedores actuales</td>
            <td><span class="hoja-value-ro">${decision.vendedoresIniciales||0}</span></td>
            <td class="hoja-ref">Propagado de ronda anterior</td><td></td></tr>
          ${hojaProductoActivo === 0 ? `
          <tr><td class="hoja-label">➕ Contratar vendedores</td>
              <td>${inp('contratarVendedores',decision.contratarVendedores??0,'number','min="0" max="10" step="1"')}</td>
              <td class="hoja-ref">Bs ${fmt.num(p.costoContratacionVendedor||500)} c/u · Sueldo Bs ${fmt.num(p.sueldoTrimestralVendedor||2400)}/trim.</td><td></td></tr>
          <tr><td class="hoja-label">➖ Despedir vendedores</td>
              <td>${inp('despedirVendedores',decision.despedirVendedores??0,'number','min="0" step="1"')}</td>
              <td class="hoja-ref">Bs ${fmt.num(p.costoDespidoVendedor||800)} c/u</td><td></td></tr>
          ` : `
          <tr><td colspan="4" style="padding:6px 14px;font-size:.76rem;color:var(--text3);font-style:italic">
            ℹ️ Contratar/despedir vendedores se gestiona en <strong>Producto 1</strong> · Aplica a toda la empresa.
            Valor actual: ➕ ${decision.contratarVendedores??0} · ➖ ${decision.despedirVendedores??0}
          </td></tr>
          `}
        </tbody>
      </table>
    </div>

        <!-- S2.5: OPERARIOS — Etapa 3.2 -->
    ${(p.costoOperario !== undefined && p.modulos_modOperarios !== 0) ? `
    <div class="hoja-section">
      <div class="hoja-section-title">2.5 · RRHH — Operarios de Producción</div>
      <table class="hoja-table">
        <thead><tr><th>Decisión</th><th>Tu elección</th><th>Referencia</th><th>Nota</th></tr></thead>
        <tbody>
          <tr>
            <td class="hoja-label">🏭 Operarios actuales</td>
            <td><span class="hoja-value-ro">${decision.operariosIniciales ?? p.operariosIniciales ?? 1}</span></td>
            <td class="hoja-ref">Propagado de ronda anterior</td>
            <td style="font-size:.78rem;color:var(--text3)">Cap. efectiva: ${fmt.num((decision.operariosIniciales ?? p.operariosIniciales ?? 1) * (p.productividadBase ?? 440))} unid/trim</td>
          </tr>
          ${hojaProductoActivo === 0 ? `
          <tr>
            <td class="hoja-label">➕ Contratar operarios</td>
            <td>${inp('contratarOperarios', decision.contratarOperarios ?? 0, 'number', 'min="0" max="20" step="1"')}</td>
            <td class="hoja-ref">Costo contratación: Bs ${fmt.num(p.costoContratacionOperario ?? 800)} c/u</td>
            <td style="font-size:.78rem;color:var(--text3)">Sueldo: Bs ${fmt.num(p.costoOperario ?? 3200)}/trim/operario</td>
          </tr>
          <tr>
            <td class="hoja-label">➖ Despedir operarios</td>
            <td>${inp('despedirOperarios', decision.despedirOperarios ?? 0, 'number', 'min="0" step="1"')}</td>
            <td class="hoja-ref">Costo despido: Bs ${fmt.num(p.costoDespidoOperario ?? 1200)} c/u</td>
            <td style="font-size:.78rem;color:var(--text3)">Mínimo final: 0 operarios</td>
          </tr>
          <tr>
            <td class="hoja-label">🎓 Inversión en capacitación (Bs)</td>
            <td>${inp('montoCapacitacion', decision.montoCapacitacion ?? 0, 'number', 'min="0" step="1000"')}</td>
            <td class="hoja-ref">+${fmt.pct(p.factorCapacitacion ?? 0.05)} productividad por cada Bs 10.000</td>
            <td style="font-size:.78rem;color:var(--text3)">Cap. = operarios × ${p.productividadBase ?? 440} × (1 + factor)</td>
          </tr>
          ` : `
          <tr><td colspan="4" style="padding:6px 14px;font-size:.76rem;color:var(--text3);font-style:italic">
            ℹ️ Contratar/despedir operarios y capacitación se gestionan en <strong>Producto 1</strong> · Aplica a toda la empresa.
            Valor actual: ➕ ${decision.contratarOperarios??0} operarios · ➖ ${decision.despedirOperarios??0} · Capacitación Bs ${fmt.num(decision.montoCapacitacion??0)}
          </td></tr>
          `}
          <tr><td class="hoja-label">🏭 Producción (unidades)</td>
              <td>${inp('produccion',productoActivo.produccion,'number',`min="0" max="${p.capacidadMaxProduccion||1500}" step="100"`)}</td>
              <td class="hoja-ref">
                Máx planta: ${fmt.num(p.capacidadMaxProduccion||1500)} u
                ${(() => {
                  const opIni      = decision.operariosIniciales ?? p.operariosIniciales ?? 0;
                  const opContratar = decision.contratarOperarios || 0;
                  const opFinales   = Math.max(0, opIni + opContratar - (decision.despedirOperarios||0));
                  const capEf       = opFinales * (p.productividadBase||500);
                  if (opFinales === 0) return `<br><span style="color:var(--accent4);font-size:.75rem">⚠ Sin operarios. Contrata operarios primero.</span>`;
                  return `<br><span style="color:var(--accent3);font-size:.75rem">Cap. efectiva: ${opFinales} op × ${fmt.num(p.productividadBase||500)} = <strong>${fmt.num(capEf)}</strong> u</span>`;
                })()}
              </td>
              <td>${ta('produccion','¿Cómo estimaste la demanda?')}</td></tr>
        </tbody>
      </table>
    </div>
    ` : ''}

        <!-- S2.6: MATERIA PRIMA — Etapa 3.1 -->
    ${(ref.proveedores && ref.proveedores.length > 0 && p.modulos_modMateriaPrima !== 0) ? `
    <div class="hoja-section">
      <div class="hoja-section-title">2.6 · Materia Prima — Compra de insumos</div>
      <table class="hoja-table">
        <thead><tr><th>Decisión</th><th>Tu elección</th><th>Referencia</th><th>Nota</th></tr></thead>
        <tbody>
          <tr>
            <td class="hoja-label">📦 Stock MP disponible</td>
            <td><span class="hoja-value-ro">${fmt.num(decision.stockMPInicial ?? 0)} unid</span></td>
            <td class="hoja-ref">Heredado + pedidos recibidos esta ronda</td>
            <td style="font-size:.78rem;color:var(--text3)">
              Producibles: ${fmt.num(Math.floor((decision.stockMPInicial ?? 0) / (p.unidadesMPporUnidad ?? 1)))} unid
              ${decision.pedidosPendientes?.length > 0
                ? ' · <strong style="color:var(--accent3)">Pedidos en tránsito: ' + decision.pedidosPendientes.length + '</strong>'
                : ''}
            </td>
          </tr>
          <tr>
            <td class="hoja-label">🏢 Proveedor a elegir</td>
            <td>${isEditable
              ? `<select class="hoja-select editable" data-hoja-field="proveedorElegido">
                  <option value="">— Sin pedido este trimestre —</option>
                  ${ref.proveedores.map(pv =>
                    `<option value="${pv.id}" ${decision.proveedorElegido===pv.id?'selected':''}>
                      ${pv.nombre} · Bs ${pv.costoMP}/unid · Lead time: ${pv.leadTime} trim.
                    </option>`
                  ).join('')}
                </select>`
              : `<span class="hoja-value-ro">${decision.proveedorElegido || '—'}</span>`
            }</td>
            <td class="hoja-ref">El stock llega en la ronda indicada por el lead time</td>
            <td style="font-size:.78rem;color:var(--accent4)">⚠ Pedir con anticipación</td>
          </tr>
          <tr>
            <td class="hoja-label">🛒 Cantidad a pedir (unid MP)</td>
            <td>${inp('cantidadMPpedida', decision.cantidadMPpedida ?? 0, 'number', 'min="0" step="100"')}</td>
            <td class="hoja-ref">Almacenamiento MP sobrante: Bs ${p.costoAlmacenamientoMP ?? 0.05}/unid/trim</td>
            <td style="font-size:.78rem;color:var(--text3)">0 si no vas a pedir. 1 unid MP → ${p.unidadesMPporUnidad ?? 1} unid producidas</td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}

        ${hojaProductoActivo === 0 ? `
    <!-- S3: FINANCIAMIENTO -->
    <div class="hoja-section">
      <div class="hoja-section-title">3 · Financiamiento</div>
      <table class="hoja-table">
        <thead><tr><th>Decisión</th><th>Tu elección</th><th>Referencia</th><th>Justificación</th></tr></thead>
        <tbody>
          <tr><td class="hoja-label">🏦 Tipo de préstamo</td>
              <td>${sel('tipoPrestamo',tipoPresOpts)}</td>
              <td class="hoja-ref">Operativo: ${fmt.pct(p.tasaPrestamoOperativo||0.04)} trim. · Inversión: ${fmt.pct(p.tasaPrestamoInversion||0.03)} trim.</td>
              <td>${ta('finanzas','¿Necesitas financiamiento? ¿Por qué?')}</td></tr>
          <tr><td class="hoja-label">💵 Monto (Bs)</td>
              <td>${inp('montoPrestamo',decision.montoPrestamo,'number','min="0" step="1000"')}</td>
              <td class="hoja-ref">Escribe el monto en Bs que necesitas. Comisión apertura ${fmt.pct(p.comisionAperturaPrestamo||0.01)} se descuenta automáticamente.</td><td></td></tr>
          <tr><td class="hoja-label">⏳ Plazo (trimestres)</td>
              <td>${inp('plazoPrestamo',decision.plazoPrestamo,'number',`min="1" max="${
                decision.tipoPrestamo === 'Operativo' ? (p.plazoPrestamoOperativo||20) :
                decision.tipoPrestamo === 'Inversión' ? (p.plazoPrestamoInversion||40) :
                Math.max(p.plazoPrestamoOperativo||20, p.plazoPrestamoInversion||40)
              }" step="1"`)}</td>
              <td class="hoja-ref">Op: ${p.plazoPrestamoOperativo||20} trim. · Inv: ${p.plazoPrestamoInversion||40} trim. <span style="color:var(--accent3);font-size:.75rem">⚠ cambia según tipo</span></td><td></td></tr>
          <tr><td class="hoja-label">📉 Amortización (Bs)</td>
              <td>${inp('amortizacion',decision.amortizacion,'number','min="0" step="1000"')}</td>
              <td class="hoja-ref">Pago de deuda existente. No exceder deuda total.</td><td></td></tr>
        </tbody>
      </table>
      <div style="padding:8px 14px;background:var(--bg3);font-size:.78rem;color:var(--text2)">
        <strong>Situación financiera actual:</strong>
        Caja Bs ${fmt.bs(decision.cajaInicial)} · CxC Bs ${fmt.bs(decision.cxcInicial)} · Deuda Bs ${fmt.bs(decision.deudaInicial)} · Inventario ${fmt.num(decision.inventarioInicial)} unid
      </div>
    </div>
    ` : ''}

      <!-- S4: INNOVACIÓN -->
    <div class="hoja-section">
      <div class="hoja-section-title">4 · Innovación</div>
      <table class="hoja-table">
        <thead><tr><th>Decisión</th><th>Tu elección</th><th>Referencia</th><th>Justificación</th></tr></thead>
        <tbody>
          <tr><td class="hoja-label">💡 ¿Innovar este trimestre?</td>
              <td><label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" data-hoja-field="innovacion" ${productoActivo.innovacion ? 'checked' : ''} ${isEditable ? '' : 'disabled'}/>
                Sí, innovar
              </label></td>
              <td class="hoja-ref">Afecta costo unitario o atractivo según tipo</td>
              <td>${ta('innovacion','¿Por qué innovar y en qué?')}</td></tr>
          <tr><td class="hoja-label">🔧 Tipo de innovación</td>
              <td>${sel('tipoInnovacion',tipoInnOpts)}</td>
              <td class="hoja-ref">Producto: +CU · Proceso: −CU · Canal: +atractivo</td><td></td></tr>
          <tr><td class="hoja-label">💰 Inversión en innovación (Bs)</td>
              <td>${inp('montoInnovacion',productoActivo.montoInnovacion,'number','min="0" step="1000"')}</td>
              <td class="hoja-ref">Se desembolsa este trimestre (gasto operativo)</td><td></td></tr>
        </tbody>
      </table>
    </div>

      ${hojaProductoActivo === 0 ? `
    <!-- S5: INVESTIGACIÓN DE MERCADO -->
    <div class="hoja-section">
      <div class="hoja-section-title">5 · Investigación de Mercado</div>
      <table class="hoja-table">
        <thead><tr><th>Decisión</th><th>Tu elección</th><th>Qué incluye</th><th>Justificación</th></tr></thead>
        <tbody>
          <tr><td class="hoja-label">🔍 Tipo de reporte</td>
              <td>${sel('tipoInvestigacion',tipoInvOpts)}</td>
              <td class="hoja-ref">
                <strong>Básico Bs ${fmt.num(p.costoInvestigacionBasica||5000)}:</strong> tamaño de mercado, precios, alertas del sector<br>
                <strong>Premium Bs ${fmt.num(p.costoInvestigacionPremium||12000)}:</strong> + participación, sensibilidad, empresas anónimas<br>
                <strong>Estratégico Bs ${fmt.num(p.costoInvestigacionEstrategico||20000)}:</strong> + nombres reales, elasticidad, punto de equilibrio dinámico
              </td>
              <td>${ta('investigacion','¿Por qué comprar este reporte?')}</td></tr>
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- S6: RESUMEN DE VALORES -->
    <div class="hoja-section">
      <div class="hoja-section-title">6 · Resumen de Valores</div>
      <div class="hoja-resumen-grid" id="hojaResumen">${hojaResumenV2(decision)}</div>
    </div>

    ${resultado ? hojaKpiHTML(resultado) : ''}

    <div class="hoja-actions">
      ${isEditable
        ? `<button class="btn btn-ghost" id="btnHojaGuardar">💾 Guardar borrador</button>
           <button class="btn btn-success" id="btnHojaEnviar">✓ Enviar decisiones</button>`
        : `<span style="color:var(--text3);font-size:.82rem">
             ${roundState==='simulated' ? '🔒 Simulada — ver Estados Financieros en el menú 📊'
               : roundState==='pending' ? '⏸ Esperando activación del profesor.'
               : isLocked ? '🔒 Envío cerrado.'
               : '✅ Enviada — esperando simulación.'}
           </span>`}
    </div>
  </div>`;

if (isEditable) {
  cont.querySelectorAll('[data-hoja-field]').forEach(el => {

    el.addEventListener(
      (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input',
      () => {

        const field = el.dataset.hojaField;   // ← DECLARAR PRIMERO

        const v_raw =
          el.type === 'checkbox' ? el.checked
          : el.type === 'number' ? +el.value
          : el.tagName === 'SELECT'
            ? el.value.replace(/\s*\(Bs[\s\d.]+\)\s*$/, '').trim()
            : el.value;

        // ── Validación de rangos (Meyer, Design by Contract) ──────────────
        // Los límites HTML max/min son evadibles — se aplica clamp en JS también

        // Plazo máximo dinámico según tipo de préstamo
        const tipoPrestamoActual = cont.querySelector('[data-hoja-field="tipoPrestamo"]')?.value || 'Ninguno';
        const plazoMaxDinamico = tipoPrestamoActual === 'Operativo'
          ? (p?.plazoPrestamoOperativo || 20)
          : tipoPrestamoActual === 'Inversión'
            ? (p?.plazoPrestamoInversion || 40)
            : Math.max(p?.plazoPrestamoOperativo||20, p?.plazoPrestamoInversion||40);

        const LIMITES_CAMPO = {
          calidad:             { min:1,  max:10  },
          contratarOperarios:  { min:0,  max:50  },
          despedirOperarios:   { min:0,  max:50  },
          contratarVendedores: { min:0,  max:10  },
          despedirVendedores:  { min:0,  max:10  },
          plazoPrestamo:       { min:1,  max: plazoMaxDinamico },
          precioVenta:         { min:0,  max:9999 },
          produccion:          { min:0,  max:p?.capacidadMaxProduccion||1500 },
          montoCapacitacion:   { min:0,  max:50000 },
          publicidad:          { min:0,  max:200000 },
          promocion:           { min:0,  max:100000 },
          eventos:             { min:0,  max:100000 },
          marketingRedes:      { min:0,  max:100000 },
          relacionesPublicas:  { min:0,  max:100000 },
        };

        // Actualizar max del input de plazo cuando cambia el tipo de préstamo
        if (field === 'tipoPrestamo') {
          const plazoInput = cont.querySelector('[data-hoja-field="plazoPrestamo"]');
          if (plazoInput) {
            const nuevoMax = v_raw === 'Operativo'
              ? (p?.plazoPrestamoOperativo || 20)
              : v_raw === 'Inversión'
                ? (p?.plazoPrestamoInversion || 40)
                : Math.max(p?.plazoPrestamoOperativo||20, p?.plazoPrestamoInversion||40);
            plazoInput.max = nuevoMax;
            // Mostrar aviso con el límite correcto
            const refCell = plazoInput.closest('tr')?.querySelector('.hoja-ref');
            if (refCell) {
              const esOp = v_raw === 'Operativo';
              const esInv = v_raw === 'Inversión';
              refCell.innerHTML = esOp
                ? `<span style="color:var(--accent3)">⚠ Máx. ${p?.plazoPrestamoOperativo||20} trim. (operativo)</span>`
                : esInv
                  ? `<span style="color:var(--accent3)">⚠ Máx. ${p?.plazoPrestamoInversion||40} trim. (inversión)</span>`
                  : `Op: ${p?.plazoPrestamoOperativo||20} trim. · Inv: ${p?.plazoPrestamoInversion||40} trim.`;
            }
          }
        }

        // Aviso de capacidad de producción cuando ingresa producción
        if (field === 'produccion') {
          const opIni       = decision.operariosIniciales ?? p?.operariosIniciales ?? 0;
          const opContratar = +(cont.querySelector('[data-hoja-field="contratarOperarios"]')?.value || 0);
          const opDespedir  = +(cont.querySelector('[data-hoja-field="despedirOperarios"]')?.value || 0);
          const opFinales   = Math.max(0, opIni + opContratar - opDespedir);
          const capEf       = opFinales * (p?.productividadBase ?? 500);
          const refCell     = el.closest('tr')?.querySelector('.hoja-ref');
          if (refCell) {
            if (opFinales === 0) {
              refCell.innerHTML = `<span style="color:var(--accent4)">⚠ Sin operarios — debes contratar al menos 1 antes de producir. Cap. efectiva = 0 u.</span>`;
            } else if (v_raw > capEf) {
              refCell.innerHTML = `<span style="color:var(--accent4)">⚠ Supera cap. efectiva (${opFinales} op. × ${p?.productividadBase||500} = ${capEf} u). El motor ajustará automáticamente.</span>`;
            } else {
              const pct = Math.round(v_raw / capEf * 100);
              refCell.innerHTML = `<span style="color:var(--accent5)">✓ ${pct}% de la cap. efectiva (${capEf} u con ${opFinales} operarios)</span>`;
            }
          }
        }

        // Aviso cuando contrata operarios
        if (field === 'contratarOperarios' && v_raw > 0) {
          const refCell = el.closest('tr')?.querySelector('.hoja-ref');
          if (refCell) {
            const opActuales = productoActivo?.operariosIniciales ?? p?.operariosIniciales ?? 1;
            const nuevaCap   = (opActuales + v_raw) * (p?.productividadBase ?? 500);
            refCell.innerHTML = `<span style="color:var(--accent5)">→ Nueva cap. efectiva: ${nuevaCap} u/trim</span>`;
          }
        }
        let v = v_raw;
        if (el.type === 'number' && LIMITES_CAMPO[field]) {
          const lim = LIMITES_CAMPO[field];
          const clamped = Math.min(lim.max, Math.max(lim.min, v));
          if (clamped !== v) {
            el.value = clamped;
            v = clamped;
          }
        }

        const productFields = [
          'producto',
          'segmentoObjetivo',
          'canalPrincipal',
          'canalSecundario',
          'calidad',
          'precioVenta',
          'produccion',
          'publicidad',
          'promocion',
          'eventos',
          'marketingRedes',
          'relacionesPublicas',
          'innovacion',
          'tipoInnovacion',
          'montoInnovacion',
          // Etapa 3.2: Operarios
          'contratarOperarios',
          'despedirOperarios',
          'montoCapacitacion',
          // Etapa 3.1: Materia Prima
          'cantidadMPpedida',
          'proveedorElegido',
        ];

        if (productFields.includes(field)) {

          if (!state.decisiones.productos) {
            state.decisiones.productos = [];
          }

          if (!state.decisiones.productos[hojaProductoActivo]) {
            state.decisiones.productos[hojaProductoActivo] =
              crearProductoDefault(hojaProductoActivo);
          }

          // Campos de EMPRESA: se guardan en state.decisiones raíz (no en el producto)
          const camposEmpresa = [
            'contratarVendedores','despedirVendedores',
            'contratarOperarios','despedirOperarios','montoCapacitacion',
            'tipoPrestamo','montoPrestamo','plazoPrestamo','amortizacion',
            'tipoInvestigacion',
          ];

          if (camposEmpresa.includes(field)) {
            // Campo de empresa: guardar en raíz y sincronizar en todos los productos
            state.decisiones[field] = v;
            if (Array.isArray(state.decisiones.productos)) {
              state.decisiones.productos.forEach(p => { p[field] = v; });
            }
          } else {
            // Campo de producto: guardar solo en el producto activo
            const prod = state.decisiones.productos[hojaProductoActivo];
            if (prod) prod[field] = v;
            if (productoActivo) productoActivo[field] = v;
            // Compatibilidad con producto 1
            if (hojaProductoActivo === 0) state.decisiones[field] = v;
          }

          decision = state.decisiones;

        } else {

          decision[field] = v;

          if (state.decisiones) {
            state.decisiones[field] = v;
          }
        }

        const r = document.getElementById('hojaResumen');

        if (r) {
          r.innerHTML = hojaResumenV2(decision);
        }
      }
    );
  });
}

  



    cont.querySelectorAll('[data-hoja-just]').forEach(el => {
      el.addEventListener('input', () => {
        if (!decision.justificaciones) decision.justificaciones = {};
        decision.justificaciones[el.dataset.hojaJust] = el.value;
        if (state.decisiones?.justificaciones) state.decisiones.justificaciones[el.dataset.hojaJust] = el.value;
      });
    });
    document.getElementById('btnHojaGuardar')?.addEventListener('click', async () => {
      try {
        // Sincronizar state.decisiones con la variable local decision
        state.decisiones = decision;
        const _d = JSON.parse(JSON.stringify(decision, (k,v) => v===undefined?null:v));
        await api('POST','/api/decisiones/guardar',{decision: _d});
        toast('💾 Guardado','success');
      }
      catch(e) { toast(e.message,'error'); }
    });
    document.getElementById('btnHojaEnviar')?.addEventListener('click', async () => {
      if (!confirm('¿Enviar decisiones?\n\nEl profesor ejecutará la simulación cuando todos los equipos hayan enviado.')) return;
      try {
        const _d3 = JSON.parse(JSON.stringify(decision, (k,v) => v===undefined?null:v));
        await api('POST','/api/decisiones/enviar',{decision: _d3});
        toast('✅ Enviado','success');
        await loadHojaDecision();
      } catch(e) { toast(e.message,'error'); }
    });
  }


function hojaResumenV2(d) {
  if (!d) return '';
  const rows = [
    ['Producto',        d.producto],
    ['Segmento',        d.segmentoObjetivo],
    ['Canal principal', d.canalPrincipal],
    ['Canal secundario',d.canalSecundario||'Ninguno'],
    ['Calidad',         d.calidad],
    ['Precio venta',    `Bs ${d.precioVenta??0}`],
    ['Producción',      fmt.num(d.produccion??0)+' unid'],
    ['Publicidad',      fmt.bs(d.publicidad??0)],
    ['Promoción',       fmt.bs(d.promocion??0)],
    ['Eventos',         fmt.bs(d.eventos??0)],
    ['Mkt redes',       fmt.bs(d.marketingRedes??0)],
    ['RRPP',            fmt.bs(d.relacionesPublicas??0)],
    ['Contratar vend.', d.contratarVendedores??0],
    ['Despedir vend.',  d.despedirVendedores??0],
    ['Préstamo tipo',   d.tipoPrestamo||'Ninguno'],
    ['Monto préstamo',  fmt.bs(d.montoPrestamo??0)],
    ['Amortización',    fmt.bs(d.amortizacion??0)],
    ['Innovación',      d.innovacion?`Sí — ${d.tipoInnovacion}`:'No'],
    ['Monto innovación',fmt.bs(d.montoInnovacion??0)],
    ['Investigación',   d.tipoInvestigacion||'No'],
  ];
  return rows.map(([l,v])=>`
    <div class="hoja-resumen-row">
      <span class="hoja-resumen-label">${l}</span>
      <span class="hoja-resumen-val">${v??'—'}</span>
    </div>`).join('');
}

// KPI rápido al final de la hoja (cuando la ronda está simulada)
function hojaKpiHTML(r) {
  if (!r) return '';
  return `
  <div class="hoja-section">
    <div class="hoja-section-title" style="color:var(--accent5)">📊 Resultados del Trimestre (resumen)</div>
    <div class="hoja-resumen-grid">
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Ventas reales</span><span class="hoja-resumen-val">${fmt.num(r.ventasReales)} unid</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Market share</span><span class="hoja-resumen-val">${fmt.pct(r.shareReal)}</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Ventas netas</span><span class="hoja-resumen-val">${fmt.bs(r.ventasNetas)}</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Utilidad bruta</span><span class="hoja-resumen-val" style="color:${r.utilidadBruta>=0?'var(--accent2)':'var(--accent4)'}">${fmt.bs(r.utilidadBruta)}</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Utilidad neta</span><span class="hoja-resumen-val" style="color:${r.utilidadNeta>=0?'var(--accent5)':'var(--accent4)'}">${fmt.bs(r.utilidadNeta)}</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Caja final</span><span class="hoja-resumen-val" style="color:${r.cajaFinal>=0?'var(--accent2)':'var(--accent4)'}">${fmt.bs(r.cajaFinal)} <span class="badge ${r.alertaCaja==='ALERTA'?'badge-alert':'badge-ok'}">${r.alertaCaja}</span></span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Costo unitario</span><span class="hoja-resumen-val">Bs ${fmt.d(r.costoUnitario,3)}</span></div>
      <div class="hoja-resumen-row"><span class="hoja-resumen-label">Inventario final</span><span class="hoja-resumen-val">${fmt.num(r.inventarioFinal)} unid</span></div>
    </div>
    <p style="padding:8px 14px;font-size:.78rem;color:var(--text2)">Ver <strong>📊 Estados Financieros</strong> para P&L completo, Balance General y Flujo de Efectivo.</p>
  </div>`;
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
          const totTotalFact = /*fix_totalfact_v3*/ r.totalFacturado || (r.ivaDebito ? Math.round(r.ivaDebito / 0.13) : 0);
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
            + finRow('    MOD — Operarios producción', -gOper, false, 'neg')
            + finRow('    Overhead — Gasto fijo planta', -gPlanta, false, 'neg')
            + finRow('    Depreciación planta', -(r.depreciacion||0), false, 'neg')
            + finRowSub('= Total costo de ventas', -r.costoVentas, true)
            + finRowSub('= Utilidad bruta', r.utilidadBruta, true)
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
            // ── GASTOS OPERATIVOS ───────────────────────────────
            + secER('(-) Gastos Operativos')
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
  document.querySelectorAll('#reportesContent .ronda-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace('Ronda ',''))===n);
  });
  const det = document.getElementById('reporteDetalle');
  if (!det) return;
  try {
    const [repData, resData] = await Promise.all([
      api('GET', `/api/reportes/${n}`),
      api('GET', '/api/resultados'),
    ]);
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
    document.getElementById('reporteDetalle').innerHTML = html;
  } catch(e) {
    document.getElementById('reporteDetalle').innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
};

// ── Créditos del Equipo ────────────────────────────────────
// ─── Mis Inventarios ─────────────────────────────────────────
async function loadEquipoInventarios() {
  const el = document.getElementById('eq-inventarios-content');
  if (!el) return;
  el.innerHTML = '<p style="padding:20px;color:var(--text3)">Cargando inventarios...</p>';

  const data = await api('GET','/api/resultados');
  if (!data.historial?.length) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Sin rondas simuladas aún.</p></div>';
    return;
  }

  // Construir kardex por producto a partir del historial
  const historial = data.historial;
  const productoMap = {}; // productoId → { nombre, rondas[] }

  historial.forEach(h => {
    const r = h.resultado;
    if (!r) return;
    const prods = r.productos?.length > 1 ? r.productos : [r];
    prods.forEach((p, idx) => {
      const pid  = p.productoId || 'prod_1';
      const pnom = p.producto   || 'Producto Principal';
      if (!productoMap[pid]) productoMap[pid] = { nombre: pnom, rondas: [] };
      productoMap[pid].rondas.push({
        ronda:       h.ronda,
        invInicial:  p.inventarioInicial ?? 0,
        produccion:  p.produccion        ?? 0,
        ventas:      p.ventasReales       ?? 0,
        invFinal:    p.inventarioFinal    ?? 0,
        cuVar:       p.cuVar || p.costoUnitario || 0,
        invValor:    p.invFinalValorizado  ?? 0,
        costoAlmac:  p.costoAlmacenamiento ?? 0,
      });
    });
  });

  const ALERTAS = (cobertura) => {
    if (cobertura <= 0)   return { color: 'var(--accent2)', txt: '✅ Sin stock' };
    if (cobertura <= 1)   return { color: 'var(--accent2)', txt: '✅ Óptimo' };
    if (cobertura <= 3)   return { color: 'var(--ambar,#F59E0B)', txt: '⚠ Stock alto' };
    return { color: 'var(--accent4)', txt: '🔴 Crítico — riesgo obsolescencia' };
  };

  const secH = (titulo) =>
    '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent3);text-transform:uppercase;' +
    'letter-spacing:1px;padding:6px 0 4px;border-bottom:2px solid var(--border2);margin:16px 0 8px">' + titulo + '</div>';

  let html = '<div style="padding:16px 20px">';

  // ── Kardex Productos Terminados ──────────────────────────────
  html += secH('🏭 Kardex — Inventario de Productos Terminados');

  Object.entries(productoMap).forEach(([pid, prod]) => {
    const ultRonda = prod.rondas[prod.rondas.length - 1];
    const invFinalUlt = ultRonda?.invFinal ?? 0;
    const ventasUlt   = ultRonda?.ventas  ?? 1;
    const cobertura   = ventasUlt > 0 ? (invFinalUlt / ventasUlt).toFixed(1) : '—';
    const alerta      = ALERTAS(parseFloat(cobertura) || 0);
    const rotacion    = invFinalUlt > 0 ? (ventasUlt / ((invFinalUlt + (ultRonda?.invInicial??0)) / 2)).toFixed(2) : '—';
    const diasInv     = rotacion !== '—' ? Math.round(90 / rotacion) : '—';

    html += '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:var(--r);' +
      'padding:12px 16px;margin-bottom:12px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<span style="font-weight:700;font-size:.82rem">' + prod.nombre + '</span>' +
      '<span style="font-size:.75rem;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,.06);color:' +
      alerta.color + '">' + alerta.txt + '</span></div>';

    // Tabla kardex
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.78rem">';
    html += '<thead><tr style="background:rgba(255,255,255,.04)">' +
      ['Ronda','Inv.Inicial','Producción','Ventas','Inv.Final','Valor (Bs)','Almac.(Bs)'].map(h =>
        '<th style="padding:5px 8px;text-align:right;font-size:.62rem;color:var(--text3);text-transform:uppercase">' + h + '</th>'
      ).join('') + '</tr></thead><tbody>';

    let invAcum = 0;
    prod.rondas.forEach(rr => {
      const color = rr.invFinal > rr.ventas * 2 ? 'var(--accent4)' : 'var(--text1)';
      html += '<tr style="border-bottom:1px solid var(--border)">' +
        '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--accent3)">R' + rr.ronda + '</td>' +
        '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">' + rr.invInicial.toLocaleString('es') + '</td>' +
        '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--accent2)">' + rr.produccion.toLocaleString('es') + '</td>' +
        '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">' + rr.ventas.toLocaleString('es') + '</td>' +
        '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:' + color + '">' + rr.invFinal.toLocaleString('es') + '</td>' +
        '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">' + Math.round(rr.invValor).toLocaleString('es') + '</td>' +
        '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--accent4)">' + Math.round(rr.costoAlmac).toLocaleString('es') + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';

    // KPIs de inventario
    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;font-size:.75rem">' +
      '<span style="color:var(--text3)">Rotación: <b>' + rotacion + '</b></span>' +
      '<span style="color:var(--text3)">Días inv.: <b>' + diasInv + '</b></span>' +
      '<span style="color:var(--text3)">Cobertura: <b>' + cobertura + ' rondas</b></span>' +
      '<span style="color:var(--text3)">Stock actual: <b>' + invFinalUlt.toLocaleString('es') + ' u.</b></span>' +
      '<span style="color:var(--text3)">Valor: <b>Bs ' + Math.round(ultRonda?.invValor??0).toLocaleString('es') + '</b></span>' +
      '</div>';
    html += '</div>';
  });

  // ── Kardex Materia Prima ─────────────────────────────────────
  html += secH('🧱 Kardex — Materia Prima');
  html += '<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:var(--r);padding:12px 16px">';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.78rem">';
  html += '<thead><tr style="background:rgba(255,255,255,.04)">' +
    ['Ronda','Stock Ini (u)','Compras (u)','Consumo (u)','Stock Final (u)','Costo MP (Bs)'].map(h =>
      '<th style="padding:5px 8px;text-align:right;font-size:.62rem;color:var(--text3);text-transform:uppercase">' + h + '</th>'
    ).join('') + '</tr></thead><tbody>';

  historial.forEach(h => {
    const r = h.resultado;
    if (!r) return;
    const prods = r.productos?.length > 1 ? r.productos : [r];
    // Sumar MP de todos los productos
    const compras   = prods.reduce((s,p) => s+(p.pagoMPbruto||0), 0);
    const consumo   = prods.reduce((s,p) => s+((p.costoMPunitario||0)*(p.produccion||0)), 0);
    const costoMP   = prods.reduce((s,p) => s+(p.pagoMPbruto||0), 0);
    html += '<tr style="border-bottom:1px solid var(--border)">' +
      '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--accent3)">R' + h.ronda + '</td>' +
      '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">0</td>' +
      '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--accent2)">' + Math.round(compras/119.2).toLocaleString('es') + '</td>' +
      '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">' + Math.round(consumo/119.2).toLocaleString('es') + '</td>' +
      '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">0</td>' +
      '<td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">Bs ' + Math.round(costoMP).toLocaleString('es') + '</td>' +
      '</tr>';
  });

  html += '</tbody></table></div>';
  html += '<div style="margin-top:8px;font-size:.74rem;color:var(--text3);font-style:italic">' +
    'ⓘ Modelo Justo a Tiempo: la MP se compra y consume en el mismo período. Sin stock de MP entre rondas.</div>';
  html += '</div>';

  html += '</div>';
  el.innerHTML = html;
}

async function loadEquipoCreditos() {
  const el = document.getElementById('eq-creditos-content');
  if (!el) return;
  el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>`;
  try {
    const data = await api('GET', '/api/resultados');
    renderCreditosEquipo(el, data.historial || [], data.currentRound, data.roundState);
  } catch(e) {
    el.innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
}

function renderCreditosEquipo(el, historial, currentRound, roundState) {
  if (!historial.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div><p>Sin rondas simuladas aún.</p></div>`;
    return;
  }

  // Build loan ledger from historial
  const prestamos = [];
  let deudaAcum = 0;

  historial.forEach(item => {
    const d = item.decision;
    const r = item.resultado;
    if (!d || !r) return;

    if (d.tipoPrestamo && d.tipoPrestamo !== 'Ninguno' && d.montoPrestamo > 0) {
      const tasa = d.tipoPrestamo === 'Operativo' ? 0.04 : 0.03;
      const plazo = d.plazoPrestamo || (d.tipoPrestamo === 'Operativo' ? 2 : 4);
      const cuota = Math.round(d.montoPrestamo / plazo * 100) / 100;
      prestamos.push({
        rondaOrigen: item.ronda,
        tipo: d.tipoPrestamo,
        monto: d.montoPrestamo,
        tasa,
        plazo,
        cuota,
        comision: Math.round(d.montoPrestamo * 0.01 * 100) / 100,
      });
    }

    // Track sobregiro
    if (r.sobregiro > 0) {
      prestamos.push({
        rondaOrigen: item.ronda,
        tipo: 'Sobregiro',
        monto: r.sobregiro,
        tasa: 0.06,
        plazo: 1,
        cuota: r.sobregiro,
        comision: 0,
        interes: r.interesSobregiro,
      });
    }
  });

  if (!prestamos.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>Sin préstamos ni sobregiros registrados.</p></div>`;
    return;
  }

  const cards = prestamos.map(p => {
    const intTotal = Math.round(p.monto * p.tasa * p.plazo * 100) / 100;
    const totalAPagar = Math.round((p.monto + intTotal + p.comision) * 100) / 100;
    const rows = Array.from({length: p.plazo}, (_,i) => {
      const ronda = p.rondaOrigen + i + 1;
      const pagado = ronda <= currentRound;
      return `<tr style="${pagado?'color:var(--text3)':''}">
        <td style="text-align:center;font-family:var(--font-mono)">${ronda}</td>
        <td class="num">${fmt.bs(p.cuota)}</td>
        <td class="num">${fmt.bs(Math.round(p.monto * p.tasa * 100)/100)}</td>
        <td class="num">${fmt.bs(Math.round((p.cuota + p.monto * p.tasa)*100)/100)}</td>
        <td style="text-align:center">${pagado ? '<span class="badge badge-ok">✓ Pagado</span>' : '<span class="badge badge-pending">⏳ Pendiente</span>'}</td>
      </tr>`;
    }).join('');

    const colorTipo = p.tipo === 'Sobregiro' ? 'var(--accent4)' : p.tipo === 'Operativo' ? 'var(--accent2)' : 'var(--accent3)';
    return `
      <div class="result-round-card" style="margin-bottom:16px">
        <div class="result-round-header">
          <h3>💳 Préstamo ${p.tipo} — Ronda ${p.rondaOrigen}</h3>
          <span class="badge" style="background:rgba(108,99,255,.1);color:${colorTipo}">${p.tipo}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:0;border-bottom:1px solid var(--border)">
          <div style="padding:12px 16px;border-right:1px solid var(--border)"><div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Monto</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;margin-top:4px">${fmt.bs(p.monto)}</div></div>
          <div style="padding:12px 16px;border-right:1px solid var(--border)"><div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Tasa trimestral</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;margin-top:4px;color:var(--accent3)">${fmt.pct(p.tasa)}</div></div>
          <div style="padding:12px 16px;border-right:1px solid var(--border)"><div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Plazo</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;margin-top:4px">${p.plazo} trim.</div></div>
          <div style="padding:12px 16px;border-right:1px solid var(--border)"><div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Comisión apertura</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;margin-top:4px;color:var(--accent4)">${fmt.bs(p.comision)}</div></div>
          <div style="padding:12px 16px"><div style="font-size:.68rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Total a pagar</div><div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;margin-top:4px;color:var(--accent4)">${fmt.bs(totalAPagar)}</div></div>
        </div>
        <div class="table-wrap" style="border-radius:0">
          <table>
            <thead><tr><th>Ronda</th><th>Amortización</th><th>Interés</th><th>Cuota total</th><th>Estado</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  // Summary
  const deudaTotal = historial[historial.length-1]?.resultado?.deudaFinal || 0;
  el.innerHTML = `
    <div class="stat-grid" style="margin-bottom:20px">
      <div class="stat-card"><div class="stat-label">Préstamos registrados</div><div class="stat-value" style="color:var(--accent2)">${prestamos.length}</div></div>
      <div class="stat-card"><div class="stat-label">Deuda total actual</div><div class="stat-value" style="color:${deudaTotal>0?'var(--accent4)':'var(--accent5)'}">${fmt.bs(deudaTotal)}</div></div>
    </div>
    ${cards}`;
}

// ── Créditos Admin ─────────────────────────────────────────
// ── Inventarios (vista profesor — igual que estudiante pero para todos los equipos) ──
async function loadAdminInventarios() {
  const el = document.getElementById('adminInventariosContent');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;color:var(--text3)">Cargando inventarios…</div>';
  try {
    const [rondasData, simData] = await Promise.all([
      api('GET', '/admin/rondas'),
      api('GET', '/admin/config'),
    ]);
    const equipos = (simData?.users || []).filter(u => u.rol === 'equipo');
    const rondas  = (rondasData?.rondas || rondasData || [])
      .filter(r => r.resultados)
      .sort((a,b) => a.numero - b.numero);

    if (!rondas.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>Sin rondas simuladas aún.</p></div>';
      return;
    }

    // Selector de equipo
    const eqOpts = equipos.map(e =>
      `<option value="${e.id}">${e.nombre}</option>`
    ).join('');

    el.innerHTML = `
      <div style="padding:16px 20px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <label style="font-size:.82rem;color:var(--text2)">Ver inventario de:</label>
          <select id="invEqSelector" class="form-input" style="width:200px">${eqOpts}</select>
        </div>
        <div id="invEqContent"></div>
      </div>`;

    const renderInvEquipo = (eqId) => {
      const eqNombre = equipos.find(e => e.id === eqId)?.nombre || eqId;
      const productoMap = {};
      rondas.forEach(ronda => {
        const resObj = ronda.resultados?.resultados || ronda.resultados || {};
        // buscar resultados de este equipo (puede ser eq__prod_1, etc.)
        const keys = Object.keys(resObj).filter(k => k.startsWith(eqId));
        if (!keys.length) return;
        keys.forEach(key => {
          const r   = resObj[key];
          const pid = r.productoId || 'prod_1';
          const pnom= r.producto   || 'Producto Principal';
          if (!productoMap[pid]) productoMap[pid] = { nombre: pnom, rondas: [] };
          productoMap[pid].rondas.push({
            ronda:      ronda.numero,
            invInicial: r.inventarioInicial ?? 0,
            produccion: r.produccion        ?? 0,
            ventas:     r.ventasReales      ?? 0,
            invFinal:   r.inventarioFinal   ?? 0,
            invValor:   r.invFinalValorizado ?? 0,
            costoAlmac: r.costoAlmacenamiento ?? 0,
          });
        });
      });

      const secH = t => `<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:6px 0 4px;border-bottom:2px solid var(--border2);margin:16px 0 8px">${t}</div>`;
      let html = `<div style="font-weight:700;font-size:.9rem;margin-bottom:12px;color:var(--accent3)">📦 ${eqNombre}</div>`;

      if (!Object.keys(productoMap).length) {
        html += '<p style="color:var(--text3);font-size:.8rem">Sin datos de inventario para este equipo.</p>';
        document.getElementById('invEqContent').innerHTML = html;
        return;
      }

      html += secH('Kardex — Inventario de Productos Terminados');
      Object.entries(productoMap).forEach(([pid, prod]) => {
        const ult = prod.rondas[prod.rondas.length - 1];
        const cob = (ult?.ventas||0) > 0 ? (ult.invFinal / ult.ventas).toFixed(1) : '—';
        const rot = (ult?.invFinal||0) > 0 ? ((ult.ventas || 0) / (((ult.invFinal||0) + (ult.invInicial||0)) / 2)).toFixed(2) : '—';
        const alerta = parseFloat(cob) > 3 ? '🔴 Crítico' : parseFloat(cob) > 1 ? '⚠ Alto' : '✅ Óptimo';
        html += `<div style="background:var(--bg2);border:0.5px solid var(--border);border-radius:var(--r);padding:12px 16px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="font-weight:700;font-size:.82rem">${prod.nombre}</span>
            <span style="font-size:.74rem;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,.06)">${alerta}</span>
          </div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.78rem">
          <thead><tr style="background:rgba(255,255,255,.04)">${
            ['Ronda','Inv.Ini','Prod.','Ventas','Inv.Final','Valor Bs','Almac. Bs'].map(h =>
              `<th style="padding:5px 8px;text-align:right;font-size:.62rem;color:var(--text3);text-transform:uppercase">${h}</th>`
            ).join('')
          }</tr></thead><tbody>${
            prod.rondas.map(rr => {
              const col = rr.invFinal > rr.ventas * 2 ? 'var(--accent4)' : 'var(--text1)';
              return `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--accent3)">R${rr.ronda}</td>
                <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">${rr.invInicial.toLocaleString('es')}</td>
                <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--accent2)">${rr.produccion.toLocaleString('es')}</td>
                <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">${rr.ventas.toLocaleString('es')}</td>
                <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:${col}">${rr.invFinal.toLocaleString('es')}</td>
                <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">${Math.round(rr.invValor).toLocaleString('es')}</td>
                <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono);color:var(--accent4)">${Math.round(rr.costoAlmac).toLocaleString('es')}</td>
              </tr>`;
            }).join('')
          }</tbody></table></div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:.75rem">
            <span style="color:var(--text3)">Rotación: <b>${rot}</b></span>
            <span style="color:var(--text3)">Cobertura: <b>${cob} rondas</b></span>
            <span style="color:var(--text3)">Stock actual: <b>${(ult?.invFinal||0).toLocaleString('es')} u.</b></span>
            <span style="color:var(--text3)">Valor: <b>Bs ${Math.round(ult?.invValor||0).toLocaleString('es')}</b></span>
          </div></div>`;
      });
      document.getElementById('invEqContent').innerHTML = html;
    };

    // Render primero equipo
    if (equipos.length) renderInvEquipo(equipos[0].id);
    document.getElementById('invEqSelector')?.addEventListener('change', e => renderInvEquipo(e.target.value));

  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p style="color:var(--accent4)">${e.message}</p></div>`;
  }
}


// ── Dashboard Anónimo del Equipo ───────────────────────────
async function loadEquipoDashboard() {
  const el = document.getElementById('eq-dashboard-content');
  if (!el) return;

  const data = await api('GET', '/api/resultados');
  const last = data.historial?.[data.historial.length - 1];

  if (!last) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Aún no hay rondas simuladas.</p></div>`;
    return;
  }

  // Get anonymous comparison from server
  try {
    const cmp = await api('GET', `/api/dashboard/${last.ronda}`);
    renderEquipoDashboard(el, cmp, last.resultado, data.historial);
  } catch {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Dashboard disponible tras la primera simulación.</p></div>`;
  }
}

function renderEquipoDashboard(el, cmp, miResultado, historial) {
  const miPos = cmp.ranking.findIndex(r => r.esYo) + 1;
  const totalEq = cmp.ranking.length;

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Tu posición (EBIT)</div>
        <div class="stat-value" style="color:var(--accent3)">${miPos}°<span style="font-size:.9rem;color:var(--text3)">/${totalEq}</span></div>
        <div class="stat-sub">en ronda ${cmp.ronda}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tu EBIT</div>
        <div class="stat-value" style="color:${miResultado.ebit>=0?'var(--accent5)':'var(--accent4)'}">${fmt.bs(miResultado.ebit)}</div>
        <div class="stat-sub">EBIT mercado: ${fmt.bs(cmp.stats.ebitPromedio)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tu Market Share</div>
        <div class="stat-value" style="color:var(--accent2)">${fmt.pct(miResultado.shareReal)}</div>
        <div class="stat-sub">en tu segmento</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tu Caja Final</div>
        <div class="stat-value" style="color:${miResultado.cajaFinal>=0?'var(--accent2)':'var(--accent4)'}">${fmt.bs(miResultado.cajaFinal)}</div>
        <div class="stat-sub"><span class="badge ${miResultado.alertaCaja==='ALERTA'?'badge-alert':'badge-ok'}">${miResultado.alertaCaja}</span></div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <h4>EBIT Comparativo — Anónimo (Ronda ${cmp.ronda})</h4>
        <div class="chart-wrap"><canvas id="chartCmpEBIT"></canvas></div>
      </div>
      <div class="chart-card">
        <h4>Tu Evolución EBIT (todas las rondas)</h4>
        <div class="chart-wrap"><canvas id="chartMiEBIT"></canvas></div>
      </div>
    </div>

    <div class="table-wrap" style="margin-top:20px">
      <table>
        <thead><tr><th>#</th><th>Empresa</th><th>EBIT</th><th>Ventas (unid)</th><th>Market Share</th><th>Caja</th></tr></thead>
        <tbody>
          ${cmp.ranking.map((r,i) => `
            <tr style="${r.esYo?'background:rgba(108,99,255,.07);':''}">
              <td class="num"><strong>${i+1}</strong></td>
              <td><strong>${r.esYo ? '★ Tu empresa' : `Empresa ${String.fromCharCode(65+i)}`}</strong></td>
              <td class="num ${r.ebit>=0?'pos':'neg'}">${fmt.bs(r.ebit)}</td>
              <td class="num">${fmt.num(r.ventas)}</td>
              <td class="num">
                <div class="share-bar-wrap">
                  <div class="share-bar-bg"><div class="share-bar-fill" style="width:${Math.min(100,r.share*100)}%;background:${r.esYo?'var(--accent)':'var(--border2)'}"></div></div>
                  <span class="share-val">${fmt.pct(r.share)}</span>
                </div>
              </td>
              <td class="num ${r.caja>=0?'pos':'neg'}">${fmt.bs(r.caja)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  // Charts
  const defOpts = { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{ticks:{color:'#9BA3C4',font:{family:'Space Mono',size:9}},grid:{color:'#2A2F45'}},y:{ticks:{color:'#9BA3C4',font:{family:'Space Mono',size:9}},grid:{color:'#2A2F45'}}} };

  new Chart(document.getElementById('chartCmpEBIT'), {
    type:'bar',
    data:{ labels: cmp.ranking.map((_,i) => i===miPos-1?'★ Yo':`E${String.fromCharCode(65+i)}`),
      datasets:[{ data: cmp.ranking.map(r=>r.ebit),
        backgroundColor: cmp.ranking.map(r => r.esYo ? '#6C63FF' : (r.ebit>=0?'rgba(6,255,165,.4)':'rgba(255,107,107,.4)')),
        borderRadius:4 }]},
    options: defOpts,
  });

  if (historial.length > 1) {
    new Chart(document.getElementById('chartMiEBIT'), {
      type:'line',
      data:{ labels: historial.map(h=>`R${h.ronda}`),
        datasets:[{ data: historial.map(h=>h.resultado.ebit),
          borderColor:'#6C63FF', backgroundColor:'rgba(108,99,255,.1)', fill:true, tension:.3, pointRadius:4 }]},
      options: defOpts,
    });
  }
}
function buildManual() {
  window.open('/manual.html', '_blank');
}


// ── Función genérica de impresión / PDF ─────────────────────
function printPanel(contentId, titulo, subtitulo) {
  const content = document.getElementById(contentId);
  if (!content) { toast('Sin contenido para imprimir', 'info'); return; }
  const css = [
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:Segoe UI,sans-serif;font-size:11px;color:#111;background:#fff;padding:20px}',
    'h1{font-size:15px;margin-bottom:4px;color:#2a2f45}',
    '.sub{font-size:10px;color:#666;margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid #2a2f45}',
    'table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px}',
    'th{background:#2a2f45;color:#fff;padding:6px 10px;text-align:left;font-size:9px;text-transform:uppercase}',
    'td{padding:5px 10px;border:1px solid #ddd;vertical-align:top}',
    'tr:nth-child(even) td{background:#f8f9ff}',
    '.result-round-card{border:1px solid #ddd;border-radius:6px;margin-bottom:14px;overflow:hidden}',
    '.result-round-header{background:#2a2f45;color:#fff;padding:8px 14px;font-size:10px;font-weight:700;text-transform:uppercase}',
    '.fin-row{display:flex;justify-content:space-between;padding:4px 14px;border-bottom:1px solid #f0f0f0;font-size:10.5px}',
    '.fin-row.sub{background:#f0f4ff;font-weight:700}',
    '.pos,.up{color:#27ae60}.neg,.down{color:#e74c3c}',
    '.num{text-align:right}',
    'button,canvas,.no-print{display:none!important}',
    '@media print{body{padding:8px}@page{margin:1cm;size:A4}}'
  ].join('');
  const win = window.open('', '_blank', 'width=1100,height=900');
  const parts = [
    '<!DOCTYPE html><html lang="es"><head>',
    '<meta charset="UTF-8"/>',
    '<title>' + titulo + '</title>',
    '<style>' + css + '</style>',
    '</head><body>',
    '<h1>' + titulo + '</h1>',
    '<div class="sub">' + (subtitulo||'') + ' | SimNego COM540 UAGRM</div>',
    content.innerHTML,
    '</body></html>'
  ];
  win.document.open();
  win.document.write(parts.join(''));
  win.document.close();
  setTimeout(function(){ try{ win.print(); }catch(e){} }, 600);
}

// ── Imprimir Hoja de Decisión ──────────────────────────────
function printHoja() {
  const content = document.getElementById('hojaContent');
  if (!content) return;
  const win = window.open('', '_blank', 'width=1100,height=800');
  const css = '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:Segoe UI,sans-serif;font-size:11px;color:#111;background:#fff;padding:16px}'
    + 'h1{font-size:15px;margin-bottom:4px}.sub{font-size:10px;color:#666;margin-bottom:14px}'
    + 'table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:10.5px}'
    + 'th{background:#2a2f45;color:#fff;padding:5px 8px;text-align:left;font-size:9px;text-transform:uppercase}'
    + 'td{padding:5px 8px;border:1px solid #ddd;vertical-align:top}'
    + 'tr:nth-child(even) td{background:#f9f9ff}'
    + '.sec-title{background:#4a4080;color:#fff;padding:5px 10px;font-size:9px;font-weight:700;text-transform:uppercase;margin:10px 0 0}'
    + '.readonly{color:#666;font-style:italic}'
    + 'textarea,select,input{border:none;background:transparent;font-family:inherit;font-size:inherit;width:100%;padding:0}'
    + '@media print{body{padding:0}button{display:none!important}}';
  const nombre = (state.me && state.me.nombre) || '';
  const ronda  = hojaRondaActual || 1;
  const parts  = [
    '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>',
    '<title>Hoja de Decisión — ' + nombre + ' — Ronda ' + ronda + '</title>',
    '<style>' + css + '</style></head><body>',
    '<h1>Hoja de Decisión — ' + nombre + '</h1>',
    '<div class="sub">Trimestre ' + ronda + ' / 20 | Simulador de Negocios | Juego de Negocios</div>',
    content.innerHTML,
    '</body></html>'
  ];
  win.document.open();
  win.document.write(parts.join(''));
  win.document.close();
  setTimeout(function(){ try{ win.print(); }catch(e){} }, 500);
}


// ============================
// ADMIN - Gestión de Profesores
// ============================

async function loadAdminProfesores() {
  const container = document.getElementById('profesoresContent');
  if (!container) return;
  container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>';
  try {
    const profesores = await api('GET', '/admin/usuarios');
    renderProfesores(container, profesores);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

function renderProfesores(container, profesores) {
  // El botón "Crear profesor" usa onclick="crearProfesor()" (función global window.crearProfesor).
  // No se usa addEventListener para evitar problemas de timing al reconstruir el DOM.

  if (!profesores.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👨‍🏫</div>
        <p>No hay profesores registrados. Crea el primero abajo.</p>
      </div>
      ${formAgregarProfesor()}
    `;
    return;
  }

  // BUG #4 CORREGIDO: muestra password_plain con toggle + botón copiar credenciales
  const rows = profesores.map(prof => {
    const pwId = `pw_${prof.id}`;
    const pw   = prof.password_plain || '(ver con superadmin)';
    return `
      <tr>
        <td>
          <strong>${escapeHtml(prof.nombre)}</strong><br>
          <span style="font-size:.7rem;color:var(--text3)">${prof.id}</span>
        </td>
        <td>${escapeHtml(prof.email || '—')}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <input id="${pwId}" type="password" value="${escapeHtml(pw)}" readonly
              style="border:none;background:var(--bg2);padding:3px 8px;border-radius:6px;
                     font-family:monospace;font-size:.8rem;width:110px;color:var(--text1)">
            <button class="btn btn-ghost btn-sm"
              onclick="toggleInputPw('${pwId}',this)" title="Mostrar/ocultar">👁</button>
            <button class="btn btn-ghost btn-sm" title="Copiar credenciales"
              onclick="navigator.clipboard.writeText('Email: ${escapeHtml(prof.email)} | Contraseña: ${escapeHtml(pw)}').then(()=>toast('Credenciales copiadas','success'))">📋</button>
          </div>
        </td>
        <td style="font-size:.78rem">${fmt.dt(prof.creado_at)}</td>
        <td style="text-align:center">
          <button class="btn btn-danger btn-sm"
            onclick="eliminarProfesor('${prof.id}','${escapeHtml(prof.nombre)}')">✕ Eliminar</button>
        </td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrap" style="margin-bottom:24px">
      <table style="width:100%">
        <thead>
          <tr>
            <th>Nombre / ID</th>
            <th>Email (usar para login)</th>
            <th>Contraseña</th>
            <th>Registrado</th>
            <th style="width:100px">Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${formAgregarProfesor()}
  `;
}

// ── FIX: función global para crear profesor (evita depender de addEventListener) ──
window.crearProfesor = async () => {
  const nombre   = (document.getElementById('profNombre')?.value || '').trim();
  const email    = (document.getElementById('profEmail')?.value || '').trim();
  const password = document.getElementById('profPassword')?.value || '';
  const btn      = document.getElementById('btnCrearProfesor');

  if (!nombre || !email || !password) {
    toast('Complete todos los campos', 'error');
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }
  try {
    const resultado = await api('POST', '/admin/usuarios', { nombre, email, password });
    const pw = resultado.password_plain || password;
    toast(`✓ Profesor "${nombre}" creado  |  Email: ${email}  |  Contraseña: ${pw}`, 'success');
    // Copiar automáticamente al portapapeles
    navigator.clipboard?.writeText(`Email: ${email} | Contraseña: ${pw}`).catch(() => {});
    loadAdminProfesores();
  } catch (err) {
    toast(`Error al crear profesor: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Crear profesor'; }
  }
};

function formAgregarProfesor() {
  return `
    <div class="param-card" style="margin-top:16px">
      <div class="param-card-title">➕ Agregar nuevo profesor</div>
      <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end">
        <div style="flex:2; min-width:150px">
          <label class="form-label">Nombre completo</label>
          <input type="text" id="profNombre" class="form-input" placeholder="Ej: Prof. Juan Pérez">
        </div>
        <div style="flex:2; min-width:150px">
          <label class="form-label">Correo electrónico</label>
          <input type="email" id="profEmail" class="form-input" placeholder="juan@ejemplo.com">
        </div>
        <div style="flex:1; min-width:120px">
          <label class="form-label">Contraseña</label>
          <div class="pw-input-wrap">
            <input type="password" id="profPassword" class="form-input" placeholder="******">
            <button type="button" class="btn-eye-input" onclick="toggleInputPw('profPassword',this)">👁</button>
          </div>
        </div>
        <div>
          <button type="button" id="btnCrearProfesor" class="btn btn-primary"
            onclick="crearProfesor()">✓ Crear profesor</button>
        </div>
      </div>
      <p style="font-size:.72rem;color:var(--text3);margin-top:8px">
        ℹ️ El profesor ingresará con su correo electrónico y la contraseña que definas aquí.
      </p>
    </div>
  `;
}

window.eliminarProfesor = async (id, nombre) => {
  if (!confirm(`¿Eliminar profesor "${nombre}"? Se eliminarán también sus simulaciones. Esta acción no se puede deshacer.`)) return;
  try {
    await api('DELETE', `/admin/usuarios/${id}`);
    toast(`Profesor "${nombre}" eliminado`, 'success');
    loadAdminProfesores();
  } catch (err) {
    toast(err.message, 'error');
  }
};

// ── Logout ─────────────────────────────────────────────────
async function doLogout() {
  wsClient.desconectar();
  await api('POST','/auth/logout');
  state = { me:null, ref:null, decisiones:null, resultados:null };
  showScreen('screen-login');
  document.getElementById('loginId').value = '';
  document.getElementById('loginPass').value = '';
}

// ═══════════════════════════════════════════════════════════
//  INIT — check existing session
// ═══════════════════════════════════════════════════════════
async function init() {
  initLogin();
  try {
    const me = await api('GET', '/auth/me');
    state.me = me;
    if (me.rol === 'admin' || me.rol === 'superadmin' || me.rol === 'profesor') {
      await initAdmin();
    } else {
      await initEquipo();
    }
  } catch {
    showScreen('screen-login');
  }
}

document.addEventListener('DOMContentLoaded', init);
 
