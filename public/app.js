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
function toast(msg, type='success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 3000);
}

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
        'eq-resultados':'KPIs', 'eq-creditos':'Mis Créditos', 'eq-reportes':'Investigación y Ranking',
        'eq-noticias':'Noticias del Macroentorno',
        'admin-creditos':'Reporte de Créditos', 'admin-afinidad':'Matriz de Afinidad', 'admin-competencia':'Competencia Externa',
      };
      const tt = document.getElementById(screenId === 'screen-admin' ? 'adminTopTitle' : 'equipoTopTitle');
      if (tt) tt.textContent = titles[btn.dataset.view] || '';
      if (btn.dataset.view === 'admin-simulaciones') loadAdminSimulaciones();
      if (btn.dataset.view === 'eq-hoja') loadHojaDecision();
      if (btn.dataset.view === 'eq-financiero') loadEquipoFinanciero();
      if (btn.dataset.view === 'eq-resultados') loadEquipoResultados();
      if (btn.dataset.view === 'eq-creditos') loadEquipoCreditos();
      if (btn.dataset.view === 'eq-reportes') loadEquipoReportes();
      if (btn.dataset.view === 'eq-noticias') loadEquipoNoticias();
      if (btn.dataset.view === 'eq-dashboard') loadEquipoDashboard();
      if (btn.dataset.view === 'admin-afinidad') loadAdminAfinidad();
      if (btn.dataset.view === 'admin-competencia') loadAdminCompetencia();
      if (btn.dataset.view === 'admin-creditos') loadAdminCreditos();
      if (btn.dataset.view === 'admin-dashboard') loadAdminDashboard();
      if (btn.dataset.view === 'admin-equipos') {
        if (typeof loadAdminEquipos === 'function') loadAdminEquipos();
        else loadAdminSimulaciones(); // fallback
      }
      if (btn.dataset.view === 'admin-rondas') loadAdminRondas();
      if (btn.dataset.view === 'admin-resultados') loadAdminResultados();
      if (btn.dataset.view === 'admin-mercado') loadAdminMercado();
      if (btn.dataset.view === 'admin-parametros') loadAdminParametros();
      if (btn.dataset.view === 'admin-segmentos') loadAdminSegmentos();
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
  document.getElementById('btnLogin').addEventListener('click', doLogin);
  const btnManual = document.getElementById('btnVerManualLogin');
  if (btnManual) btnManual.addEventListener('click', buildManual);
  initRegistroUI();
}

async function doLogin() {
  const id   = document.getElementById('loginId').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errEl  = document.getElementById('loginError');
  const hintEl = document.getElementById('loginHint');
  errEl.textContent = '';
  if (hintEl) hintEl.style.display = 'none';
  const btn = document.getElementById('btnLogin');
  btn.textContent = 'Ingresando...'; btn.disabled = true;
  try {
    const data = await api('POST','/auth/login',{id,password:pass});
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
  // Mostrar gestión de simulaciones como pantalla de inicio
  await loadAdminSimulaciones();
}

// ── Admin Simulaciones ─────────────────────────────────────
async function loadAdminEquipos() {
  if (!requireSimSelected('equiposTableWrap')) return;
  const el = document.getElementById('equiposTableWrap');
  if (!el) return;
  try {
    const equipos = await api('GET', '/admin/equipos');
    if (!equipos?.length) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin equipos registrados.</p>';
      return;
    }

    const rows = equipos.filter(eq => !eq.isBot).map((eq, i) => {
      const miembros = Array.isArray(eq.miembros) ? eq.miembros : [];
      const fecha    = eq.registradoAt ? new Date(eq.registradoAt).toLocaleString('es-BO',{dateStyle:'short',timeStyle:'short'}) : '—';
      const nMiemb   = miembros.length;

      const miembrosHTML = miembros.length
        ? miembros.map(m => {
            const ap = [m.apellidoPaterno, m.apellidoMaterno].filter(Boolean).join(' ');
            const nm = m.nombres || m.nombre || m.name || '—';
            const ci = m.nroRegistro || m.ci || '';
            const tel = m.telefono || m.phone || '';
            return `<div style="margin-bottom:6px">
              <strong>${ap ? ap + ', ' : ''}${nm}</strong>
              <div style="font-size:.75rem;color:var(--text3);margin-top:2px">
                ${ci  ? `<span style="margin-right:10px">🪪 ${ci}</span>` : ''}
                ${tel ? `<span>📞 ${tel}</span>` : ''}
              </div>
            </div>`;
          }).join('')
        : '<span style="color:var(--text3);font-size:.8rem">Sin integrantes</span>';

      const estadoBadge = eq.submitted
        ? '<span class="badge badge-ok">✓ Enviado</span>'
        : '<span class="badge badge-warn">Pendiente</span>';

      return `<tr style="vertical-align:top;border-bottom:1px solid var(--border)">
        <td style="padding:14px 16px;min-width:180px">
          <div style="font-weight:700;font-size:.92rem">${eq.nombre}</div>
          <div style="font-family:var(--font-mono);font-size:.68rem;color:var(--text3);margin-top:3px">${eq.id}</div>
        </td>
        <td style="padding:14px 16px">
          <span style="font-family:var(--font-mono);color:var(--accent3);font-size:.85rem">${eq.passwordPlain || '••••••'}</span>
          <button onclick="togglePassVis(this,'${eq.passwordPlain||''}')" style="background:none;border:none;cursor:pointer;color:var(--text3);margin-left:6px;font-size:.8rem">👁</button>
        </td>
        <td style="padding:14px 16px;min-width:220px">${miembrosHTML}</td>
        <td style="padding:14px 16px;text-align:center;font-family:var(--font-mono);font-size:.85rem">${nMiemb}</td>
        <td style="padding:14px 16px;text-align:center">${estadoBadge}</td>
        <td style="padding:14px 16px;font-size:.78rem;color:var(--text3)">${fecha}</td>
        <td style="padding:14px 16px;white-space:nowrap">
          <button class="btn btn-ghost btn-sm" onclick="cambiarClave('${eq.id}','${eq.nombre}')">🔑 Clave</button>
          <button class="btn btn-ghost btn-sm" style="margin-left:4px" onclick="resetearEnvio('${eq.id}','${eq.nombre}')">↺ Resetear</button>
          <button class="btn btn-sm" style="background:#EF4444;color:#fff;margin-left:4px" onclick="eliminarEquipo('${eq.id}','${eq.nombre}')">✕</button>
        </td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--bg2);font-family:var(--font-mono);font-size:.65rem;text-transform:uppercase;letter-spacing:1px;color:var(--text3)">
              <th style="padding:10px 16px;text-align:left">Equipo / ID de Acceso</th>
              <th style="padding:10px 16px;text-align:left">Contraseña</th>
              <th style="padding:10px 16px;text-align:left">Integrantes</th>
              <th style="padding:10px 16px;text-align:center">#</th>
              <th style="padding:10px 16px;text-align:center">Estado Ronda</th>
              <th style="padding:10px 16px;text-align:left">Registrado</th>
              <th style="padding:10px 16px;text-align:left">Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    // Helpers locales
    window.togglePassVis = (btn, pass) => {
      const sp = btn.previousElementSibling;
      sp.textContent = sp.textContent.includes('•') ? pass : '••••••';
    };
    window.cambiarClave = async (id, nombre) => {
      const nueva = prompt('Nueva contraseña para ' + nombre + ':');
      if (!nueva) return;
      try {
        await api('POST', '/admin/equipos/' + id + '/clave', { password: nueva });
        toast('✅ Contraseña actualizada', 'success');
        loadAdminEquipos();
      } catch(e) { toast(e.message, 'error'); }
    };
    window.resetearEnvio = async (id, nombre) => {
      if (!confirm('¿Resetear el envío de decisiones de ' + nombre + '? El equipo podrá editar y reenviar.')) return;
      try {
        await api('POST', '/admin/equipos/' + id + '/reset-envio');
        toast('✅ Envío reseteado — el equipo puede volver a enviar', 'success');
        loadAdminEquipos();
      } catch(e) { toast(e.message, 'error'); }
    };
    window.eliminarEquipo = async (id, nombre) => {
      if (!confirm('¿Eliminar el equipo "' + nombre + '"? Esta acción no se puede deshacer.')) return;
      try {
        await api('DELETE', '/admin/equipos/' + id);
        toast('✅ Equipo eliminado', 'success');
        loadAdminEquipos();
      } catch(e) { toast(e.message, 'error'); }
    };
  } catch(e) {
    const el2 = document.getElementById('equiposTableWrap');
    if (el2) el2.innerHTML = '<p style="color:var(--accent4);padding:20px">Error: ' + e.message + '</p>';
  }
}

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

async function loadAdminRondas() {
  if (!requireSimSelected('rondasContent')) return;
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

    // Si la ronda actual está pending, la última simulada es current-1
    const ultimaSimulada = (ronda?.roundState === 'pending') ? current - 1 : current;

    if (!ultimaSimulada || ultimaSimulada < 1) {
      el.innerHTML = '<p style="color:var(--text3);padding:20px">Sin rondas ejecutadas aún.</p>';
      return;
    }

    // Ronda a visualizar (por selector o la última por defecto)
    const n = (rondaVer && rondaVer >= 1 && rondaVer <= ultimaSimulada) ? rondaVer : ultimaSimulada;

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
    .map(p => { const lbl = p.replace(/_v\d+$/, '').replace(/_/g, ' '); const cap = lbl.charAt(0).toUpperCase() + lbl.slice(1); return `<option value="${p}">${cap}</option>`; })
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
                <option value="" disabled selected>— Seleccionar industria —</option>
                <option value="jaboncillos_v1">Jaboncillos</option>
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

async function loadAdminDashboard() {
  if (!requireSimSelected('adminDashboardContent')) return;
  // Actualizar badge de simulación en sidebar
  const badge = document.getElementById('simBadge');
  if (badge && state.currentSimNombre) badge.textContent = `📊 ${state.currentSimNombre}`;

  const ronda = await api('GET','/admin/ronda');
  document.getElementById('adminRoundBadge').textContent = `Ronda ${ronda.currentRound}/${ronda.totalRounds}`;

  const pct = ronda.total > 0 ? Math.round(ronda.enviados/ronda.total*100) : 0;
  const estadoBadge = ronda.roundState === 'simulated'
    ? '<span class="badge badge-simulated">Simulada</span>'
    : ronda.roundState === 'open'
    ? '<span class="badge badge-open">🟢 Abierta</span>'
    : ronda.roundState === 'locked'
    ? '<span class="badge badge-alert">🔒 Cerrada</span>'
    : ronda.roundState === 'pre-sim'
    ? '<span class="badge badge-presim">📊 Pre-simulación</span>'
    : '<span class="badge badge-pending">⏸ Pendiente</span>';

  // Build bottom section depending on state
  let bottomHTML = '';
  if (ronda.roundState === 'simulated') {
    try {
      const rd = await api('GET', `/admin/resultados/${ronda.currentRound}`);
      // Dashboard: solo mini-resumen (ranking + charts) sin IDs duplicados
      // El panel completo con tabs está en 📈 Resultados
      if (rd?.resultados?.length) {
        const PALETTE_D = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06FFA5','#84CC16','#F97316'];
        const tcD = i => PALETTE_D[i % PALETTE_D.length];
        const bsD = v => {
          if (!v && v!==0) return '—';
          const n = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
          return v < 0 ? '<span style="color:#EF4444">(Bs. '+n+')</span>' : '<span style="color:#10B981">Bs. '+n+'</span>';
        };
        const sorted = [...rd.resultados].sort((a,b)=>(b.utilidadNeta||0)-(a.utilidadNeta||0));
        const miniRows = sorted.map((r,rank) => {
          const i = rd.resultados.findIndex(e=>e.equipoNombre===r.equipoNombre);
          const sem = (r.utilidadNeta||0)>0?'🟢':(r.utilidadNeta||0)>-50000?'🟡':'🔴';
          return '<tr style="border-bottom:1px solid var(--border);'+(rank===0?'background:rgba(6,255,165,.05)':'')+'"><td style="padding:6px 10px;font-weight:700;color:'+tcD(i)+'">'+(rank+1)+'</td><td style="padding:6px 10px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+tcD(i)+';margin-right:5px;vertical-align:middle"></span>'+r.equipoNombre+'</td><td style="padding:6px 10px;text-align:right;font-family:var(--font-mono);font-size:.8rem">'+bsD(r.utilidadNeta||0)+'</td><td style="padding:6px 10px;text-align:right;font-family:var(--font-mono);font-size:.8rem">'+bsD(r.cajaFinal||0)+'</td><td style="padding:6px 10px;text-align:center">'+sem+'</td></tr>';
        }).join('');
        bottomHTML = '<div style="margin-top:14px">'
          + '<div style="font-family:var(--font-mono);font-size:.62rem;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Ranking · Ronda '+ronda.currentRound+'</div>'
          + '<div class="table-wrap"><table style="width:100%;border-collapse:collapse"><thead><tr>'
          + '<th style="padding:5px 10px;font-size:.7rem">#</th><th style="padding:5px 10px;font-size:.7rem">Empresa</th>'
          + '<th style="padding:5px 10px;font-size:.7rem;text-align:right">Utilidad Neta</th>'
          + '<th style="padding:5px 10px;font-size:.7rem;text-align:right">Caja Final</th>'
          + '<th style="padding:5px 10px;font-size:.7rem;text-align:center">Estado</th></tr></thead>'
          + '<tbody>'+miniRows+'</tbody></table></div>'
          + '<p style="font-size:.75rem;color:var(--text3);margin-top:8px;text-align:right">Ver análisis completo → <strong>📈 Resultados</strong></p>'
          + '</div>';
      }
    } catch {}
  } else if (ronda.roundState === 'pre-sim') {
    // Show pre-sim confirmation progress
    try {
      const psData = await api('GET', '/api/presim');
      const pctConf = psData.total > 0 ? Math.round(psData.confirmados/psData.total*100) : 0;
      bottomHTML = `
        <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">
          📊 Confirmaciones de Demanda Estimada — Ronda ${ronda.currentRound}
        </div>
        <div class="progress-wrap" style="margin-bottom:16px">
          <div class="progress-label">
            <span>Equipos que confirmaron su demanda</span>
            <strong>${psData.confirmados} de ${psData.total}</strong>
          </div>
          <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pctConf}%;background:var(--accent3)"></div></div>
        </div>
        <div class="table-wrap" style="margin-bottom:16px">
          <table>
            <thead><tr>
              <th>Equipo</th><th>Segmento</th><th>Producto</th>
              <th style="text-align:right">Demanda asignada</th>
              <th style="text-align:right">Ventas estimadas</th>
              <th style="text-align:right">Market share</th>
              <th style="text-align:center">Estado</th>
              <th style="text-align:center">Acción</th>
            </tr></thead>
            <tbody>
              ${psData.detalle.map(r => {
                  // Consolidado por empresa — campos por producto en r.productos[]
                  const p0 = r.productos?.[0] || r;
                  const segmento        = p0.segmento || r.segmento || '—';
                  const producto        = p0.producto  || r.producto  || '—';
                  const demandaAsignada = (r.productos||[]).reduce((s,p) => s+(p.demandaAsignada||0), 0) || r.demandaAsignada || 0;
                  const ventasEstimadas = (r.productos||[]).reduce((s,p) => s+(p.ventasEstimadas||0), 0) || r.ventasEstimadas || 0;
                  const shareEstimado   = (r.productos||[]).reduce((s,p) => s+(p.shareEstimado||0), 0)   || r.shareEstimado   || 0;
                  const nombre          = r.equipoNombre || r.nombre || r.equipo || '—';
                  const nProds          = r.productos?.length || 1;
                  return `<tr>
                  <td><strong>${nombre}</strong>${nProds>1?` <span style="font-size:.7rem;color:var(--text3)">(${nProds} prod.)</span>`:''}</td>
                  <td style="font-size:.78rem">${nProds>1?r.productos.map(p=>p.segmento||'—').join(', '):segmento}</td>
                  <td style="font-size:.78rem">${nProds>1?r.productos.map(p=>p.producto||'—').join('<br>'):producto}</td>
                  <td class="num">${fmt.num(demandaAsignada)}</td>
                  <td class="num">${fmt.num(ventasEstimadas)}</td>
                  <td class="num">${fmt.pct(shareEstimado)}</td>
                  <td style="text-align:center">
                    ${r.confirmado
                      ? `<span class="badge badge-ok">✓ ${r.forzadoPor==='admin'?'Forzado':'Confirmado'}</span>`
                      : '<span class="badge badge-pending">⏳ Pendiente</span>'}
                  </td>
                  <td style="text-align:center">
                    ${!r.confirmado
                      ? `<button class="btn btn-ghost btn-sm" onclick="forzarConfirmacion('${r.equipo}')">Forzar</button>`
                      : '—'}
                  </td>
                </tr>`; }).join('')}
            </tbody>
          </table>
        </div>`;
    } catch(e) { bottomHTML = `<p style="color:var(--accent4)">${e.message}</p>`; }
  } else {

        // Show team submission status
    const equipos = await api('GET','/admin/equipos');
    bottomHTML = `
      <div style="font-family:var(--font-mono);font-size:.7rem;color:var(--text3);margin-bottom:10px;text-transform:uppercase;letter-spacing:1px">Estado de Entregas — Ronda ${ronda.currentRound}</div>
      <div class="team-status-grid">
        ${equipos.length === 0
          ? '<p style="color:var(--text3);font-size:.84rem">Sin equipos registrados. Ve a <strong>Equipos</strong> para crear equipos.</p>'
          : equipos.filter(eq => !eq.isBot).map(eq => `
              <div class="team-status-card">
                <div class="team-status-dot" style="background:${eq.submitted ? 'var(--success)' : 'var(--warning)'}"></div>
                <div>
                  <div style="font-weight:600;font-size:.82rem">${eq.nombre}</div>
                  <div style="font-size:.7rem;color:var(--text3)">${eq.submitted ? '✓ ' + fmt.dt(eq.submittedAt) : '⏳ Pendiente'}</div>
                </div>
              </div>`).join('')}
      </div>`;
  }

  document.getElementById('adminDashboardContent').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">Ronda Actual</div>
        <div class="stat-value">${ronda.currentRound}<span style="font-size:.9rem;color:var(--text3)">/${ronda.totalRounds}</span></div>
        <div class="stat-sub">${estadoBadge}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Equipos Registrados</div>
        <div class="stat-value">${ronda.total}</div>
        <div class="stat-sub">hasta 30 equipos</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Entregas Recibidas</div>
        <div class="stat-value">${ronda.enviados}<span style="font-size:.9rem;color:var(--text3)">/${ronda.total}</span></div>
        <div class="stat-sub">${pct}% listos</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Progreso Simulador</div>
        <div class="stat-value">${Math.round((ronda.currentRound-1)/ronda.totalRounds*100)}%</div>
        <div class="stat-sub">${ronda.currentRound-1} de ${ronda.totalRounds} rondas</div>
      </div>
    </div>

    <div class="progress-wrap">
      <div class="progress-label">
        <span>Entregas esta ronda</span>
        <strong>${ronda.enviados} de ${ronda.total} equipos</strong>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
    </div>

    <!-- Selector de Shock — solo visible cuando hay botón de simulación -->
    ${['locked','pre-sim'].includes(ronda.roundState) ? `
    <div style="margin-bottom:16px;padding:14px 18px;background:var(--bg2);border-radius:var(--r);border:1px solid var(--border2)">
      <div style="font-family:var(--font-mono);font-size:.62rem;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:10px">
        ⚡ Shock de Mercado — Ronda ${ronda.currentRound}
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <label style="font-size:.82rem;color:var(--text2);white-space:nowrap">Evento a aplicar:</label>
        <select id="shockOverrideSelect" class="form-input" style="width:auto;min-width:280px;font-size:.83rem;padding:6px 10px">
          <option value="aleatorio">🎲 Aleatorio (sistema decide)</option>
          <optgroup label="── Boom (mercado favorable) ──">
            <option value="boom_macro">📈 Crecimiento económico regional (+18% todos)</option>
            <option value="boom_feria">🏪 Feria comercial internacional (+12% todos)</option>
            <option value="boom_tend">🚀 Tendencia viral en redes (+25% seg. jóvenes)</option>
            <option value="boom_export">🌍 Acuerdo comercial regional (+15% todos)</option>
          </optgroup>
          <optgroup label="── Crisis (mercado adverso) ──">
            <option value="crisis_rec">📉 Recesión económica (−18% todos)</option>
            <option value="crisis_imp">⚠️ Importaciones ilegales (−13% todos)</option>
            <option value="crisis_reg">🏛️ Nueva regulación sectorial (−12% todos)</option>
            <option value="crisis_inf">💸 Inflación segmento premium (−20% seg. 2-3)</option>
          </optgroup>
          <optgroup label="── Sin evento ──">
            <option value="neutral">⚖️ Mercado estable (sin impacto)</option>
          </optgroup>
        </select>
        <span style="font-size:.74rem;color:var(--text3);font-style:italic">
          El aleatorio usa semilla determinista — siempre da el mismo resultado para esta ronda.
        </span>
      </div>
    </div>` : ''}

    <div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap">
      ${ronda.roundState === 'pending'
        ? `<button class="btn btn-success" id="btnActivarDash">▶ Activar Hoja de Decisiones — Ronda ${ronda.currentRound}</button>`
        : ronda.roundState === 'open'
        ? `<button class="btn btn-warning" id="btnPreSimDash">📊 Pre-simular (notificar demanda)</button>
           <button class="btn btn-ghost"   id="btnCerrarDash">🔒 Cerrar envíos</button>`
        : ronda.roundState === 'locked'
        ? `<button class="btn btn-warning" id="btnPreSimDash">📊 Pre-simular (notificar demanda)</button>
           <button class="btn btn-primary" id="btnSimularDash">⚡ Ejecutar Simulación (sin pre-sim)</button>`
        : ronda.roundState === 'pre-sim'
        ? `<button class="btn btn-primary" id="btnSimularDash">⚡ Ejecutar Simulación Final — Ronda ${ronda.currentRound}</button>
           <button class="btn btn-ghost"   id="btnForzarTodosDash">⏩ Forzar confirmaciones pendientes</button>`
        : ronda.currentRound < ronda.totalRounds
        ? `<button class="btn btn-success" id="btnSiguienteDash">→ Abrir Ronda ${ronda.currentRound + 1}</button>`
        : `<span class="badge badge-simulated" style="padding:8px 16px">🏆 Simulación completada — 20 rondas</span>`}
      <button class="btn btn-ghost" id="btnRefreshDash">↺ Actualizar</button>
    </div>

    ${bottomHTML}
  `;

  async function doActivarRonda() {
    if (!confirm('¿Activar la hoja de decisiones para la Ronda ' + ronda.currentRound + '?\n\nLos equipos podrán ingresar y enviar sus decisiones.')) return;
    try {
      await api('POST', '/admin/ronda/activar');
      toast('✅ Hoja de decisiones activada — Ronda ' + ronda.currentRound, 'success');
      await loadAdminDashboard();
    } catch(e) { toast(e.message, 'error'); }
  }

  document.getElementById('btnActivarDash')?.addEventListener('click', doActivarRonda);
  async function doPreSimular() {
    if (!confirm('¿Ejecutar pre-simulación para la Ronda ' + ronda.currentRound + '?\n\nSe calculará la demanda estimada y los equipos podrán confirmar.')) return;
    try {
      await api('POST', '/admin/ronda/pre-simular');
      toast('✅ Pre-simulación ejecutada', 'success');
      await loadAdminDashboard();
    } catch(e) { toast(e.message, 'error'); }
  }

  document.getElementById('btnPreSimDash')?.addEventListener('click', doPreSimular);
  async function doSimular(n) {
    const estado = ronda.roundState;
    // Leer shock elegido por el profesor (o 'aleatorio' si no tocó el selector)
    const shockOverride = document.getElementById('shockOverrideSelect')?.value || 'aleatorio';
    const shockLabel = document.getElementById('shockOverrideSelect')?.options[
      document.getElementById('shockOverrideSelect')?.selectedIndex]?.text || 'Aleatorio';

    const shockInfo = shockOverride !== 'aleatorio'
      ? '\n\n⚡ Shock seleccionado: ' + shockLabel
      : '\n\n🎲 Shock: aleatorio (el sistema decide)';

    const msg = estado === 'pre-sim'
      ? '¿Ejecutar Simulación FINAL de la Ronda ' + n + '?' + shockInfo + '\n\nTodos los resultados serán calculados.'
      : '¿Ejecutar Simulación de la Ronda ' + n + ' sin pre-simulación?' + shockInfo + '\n\nEsta acción no se puede deshacer.';
    if (!confirm(msg)) return;
    try {
      const btn = document.getElementById('btnSimularDash');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Ejecutando...'; }
      await api('POST', '/admin/simular', { ronda: n, shockOverride });
      toast('✅ Simulación completada — Ronda ' + n, 'success');
      await loadAdminDashboard();
    } catch(e) {
      toast(e.message, 'error');
      const btn = document.getElementById('btnSimularDash');
      if (btn) { btn.disabled = false; btn.textContent = '⚡ Ejecutar Simulación Final'; }
    }
  }

  document.getElementById('btnSimularDash')?.addEventListener('click', () => doSimular(ronda.currentRound));
  async function doCerrarRonda() {
    if (!confirm('¿Cerrar envíos de la Ronda ' + ronda.currentRound + '?\n\nLos equipos ya no podrán modificar ni enviar decisiones.')) return;
    try {
      await api('POST', '/admin/ronda/cerrar');
      toast('✅ Envíos cerrados — Ronda ' + ronda.currentRound, 'success');
      await loadAdminDashboard();
    } catch(e) { toast(e.message, 'error'); }
  }

  async function doForzarTodos() {
    if (!confirm('¿Forzar confirmación de pre-simulación para todos los equipos pendientes?\n\nLos equipos que no confirmaron serán marcados como confirmados.')) return;
    try {
      await api('POST', '/admin/presim/forzar-todos');
      toast('✅ Todas las confirmaciones forzadas', 'success');
      // Esperar que BD persista y recargar
      await new Promise(r => setTimeout(r, 1000));
      await loadAdminDashboard();
    } catch(e) { toast(e.message, 'error'); }
  }

  document.getElementById('btnCerrarDash')?.addEventListener('click',  doCerrarRonda);
  document.getElementById('btnForzarTodosDash')?.addEventListener('click', doForzarTodos);
  document.getElementById('btnSiguienteDash')?.addEventListener('click', async () => {
    try {
      await api('POST', '/admin/ronda/siguiente');
      toast('✅ Ronda siguiente abierta', 'success');
      await loadAdminDashboard();
    } catch(e) { toast(e.message, 'error'); }
  });
  document.getElementById('btnRefreshDash')?.addEventListener('click', loadAdminDashboard);

  if (ronda.roundState === 'simulated') renderAdminCharts();
}

// ── KPI Analysis Panel — buildAdminKPIHTML ────────────────────────────────
// 4 tabs por rol (mismos KPIs que ve el estudiante) en formato comparativo.
// Dependencias: eqs (array de resultados consolidados por empresa), tc() (colores)

function buildAdminKPIHTML(eqs, tc, pfx='kpi_') {

  // ── Helpers ──────────────────────────────────────────────────────────────
  const safe = (v) => (isNaN(v) || !isFinite(v) || v === null) ? null : v;
  const pct  = (v) => v != null ? (v*100).toFixed(1)+'%' : '—';
  const x2   = (v) => v != null ? v.toFixed(2)+'x' : '—';
  const bs   = (v) => {
    if (v === null || v === undefined) return '—';
    const n = Math.abs(Math.round(v)).toLocaleString('es-BO').replace(/,/g,'.');
    return v < 0 ? '(Bs. '+n+')' : 'Bs. '+n;
  };
  const num  = (v) => v != null ? Math.round(v).toLocaleString('es-BO').replace(/,/g,'.') : '—';
  const d2   = (v) => v != null ? (+v).toFixed(2) : '—';
  const d1   = (v) => v != null ? (+v).toFixed(1) : '—';

  const S = { verde:'#10B981', ambar:'#F59E0B', rojo:'#EF4444', gris:'#6B7280' };

  const semaforo = (v, ths) => {
    if (v === null || v === undefined || isNaN(v)) return S.gris;
    for (const t of ths) { if (v >= t.val) return t.color; }
    return ths[ths.length-1].color;
  };

  // Cabecera de columnas (equipos)
  const cols = eqs.length;
  const hdr = '<tr><th style="text-align:left;padding:7px 12px;font-size:.72rem;'
    +'min-width:210px;position:sticky;left:0;background:var(--bg2);z-index:2">Indicador</th>'
    + eqs.map((r,i) => '<th style="text-align:center;padding:7px 10px;font-size:.72rem;min-width:120px">'
        + '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+tc(i)+';margin-right:4px;vertical-align:middle"></span>'
        + r.equipoNombre + '</th>').join('') + '</tr>';

  const secRow = (label) => '<tr style="background:rgba(255,255,255,.04)">'
    + '<td colspan="' + (cols+1) + '" style="padding:5px 12px;font-family:var(--font-mono);font-size:.62rem;'
    + 'color:var(--text3);text-transform:uppercase;letter-spacing:1.2px">' + label + '</td></tr>';

  const kpiRow = (label, vals, fmtFn, ths, hint='') => {
    const cells = vals.map(v => {
      const color = semaforo(v, ths);
      const disp  = fmtFn(v);
      return '<td style="text-align:center;padding:6px 8px">'
        + '<div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px">'
        + '<span style="font-family:var(--font-mono);font-size:.82rem;font-weight:700;color:'+color+'">' + disp + '</span>'
        + '<span style="width:7px;height:7px;border-radius:50%;background:'+color+';display:inline-block"></span>'
        + '</div></td>';
    }).join('');
    const hintHtml = hint ? ' <span style="font-size:.68rem;color:var(--text3);cursor:help" title="'+hint+'">ⓘ</span>' : '';
    return '<tr style="border-bottom:1px solid rgba(255,255,255,.04)">'
      + '<td style="padding:6px 12px;font-size:.79rem;color:var(--text2);position:sticky;left:0;background:var(--bg);z-index:1">'
      + label + hintHtml + '</td>' + cells + '</tr>';
  };

  const tableWrap = (body) =>
    '<div class="table-wrap" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    + '<thead>' + hdr + '</thead><tbody>' + body + '</tbody></table></div>';

  // ── Cálculos por empresa ──────────────────────────────────────────────────
  const v = eqs.map(r => {
    const vN    = r.ventasNetas   || 0;
    const vB    = r.ventasBrutas  || 0;
    const uN    = r.utilidadNeta  || 0;
    const uB    = r.utilidadBruta || 0;
    const dep   = r.depreciacion  || 0;
    const ebit  = r.ebit          || 0;
    const deuda = r.deudaFinal    || 0;
    const pat   = r.patrimonio    || 1;
    const totA  = r.totalActivos  || 1;
    const caja  = r.cajaFinal     || 0;
    const cxc   = r.cxcFinal      || 0;
    const inv   = r.invFinalValorizado || 0;
    const actCor = caja + cxc + inv;
    const vend  = r.vendedoresFinales || 0;
    const prod  = r.produccion    || 0;
    const invU  = r.inventarioFinal || 0;
    const mktT  = r.pagoMktTotal  || 0;
    const pub   = r.publicidad    || 0;
    const demF  = r.demandaFormal || 0;
    const demA  = r.demandaAsignada || 0;
    const ventU = r.ventasReales  || 0;

    return {
      // ── TAB 1 MARKETING ───────────────────────────────────
      shareReal:    r.shareReal ?? null,
      demandaFormal: demF,
      demandaAsign:  demA,
      ventasReales:  ventU,
      pctCapturada: demF > 0 ? safe(ventU / demF) : null,
      ventasBrutas: vB,
      ventasNetas:  vN,
      mBruto:       vN > 0 ? safe(uB / vN) : null,
      precioVenta:  r.precioVenta || 0,
      costoUnit:    r.costoUnitario || 0,
      margenUnit:   (r.precioVenta||0) - (r.costoUnitario||0),
      pubGasto:     pub,
      mktTotal:     mktT,
      roiMkt:       r.roiMarketing ?? null,
      costoMktUnd:  ventU > 0 ? safe(mktT / ventU) : null,
      ingPorPub:    pub > 0 ? safe(vN / pub) : null,
      brandEquity:  r.brandEquityFinal ?? 50,
      atractivo:    r.atractivo ?? null,

      // ── TAB 2 PRODUCCIÓN ──────────────────────────────────
      produccion:   prod,
      invInicial:   r.inventarioInicial || 0,
      invFinalU:    invU,
      invPct:       prod > 0 ? safe(invU / prod * 100) : null,
      capEfectiva:  r.capacidadEfectiva ?? null,
      costoUnitP:       r.costoUnitario || 0,
      costoBase_p:      r.costoTransformacion || Math.round((r.costoBaseProducto||0) * 0.60 * 100)/100,
      costoCalidad_p:   r.costoCalidadUnit  || 0,
      costoCanal_p:     Math.max(0, r.costoCanal_calc ?? Math.round(((r.costoUnitario||0) - (r.costoTransformacion||0) - (r.costoCalidadUnit||0) - Math.round((r.costoMPunitario||0)*0.87*100)/100)*100)/100),
      costoMP_p:        r.costoMPunitario || 0,  // precio factura proveedor
      proveedor_p:      r.proveedorElegido  || '—',
      stockMP:          r.stockMPFinal      ?? null,

      // ── TAB 3 RRHH ────────────────────────────────────────
      vendFin:      vend,
      ventasPorVend: vend > 0 ? safe(ventU / vend) : null,
      ingPorVend:   vend > 0 ? safe(vN / vend) : null,
      operarios:    r.operariosFinales ?? null,
      costoOper:    r.costoOperarios ?? null,

      // ── TAB 4 FINANCIERO ──────────────────────────────────
      costoUnitF:   r.costoUnitario || 0,
      utilPorUnd:   ventU > 0 ? safe((vN - (r.costoVentas||0)) / ventU) : null,
      mNeto:        vN > 0 ? safe(uN / vN) : null,
      utilNeta:     uN,
      ebitVal:      ebit,
      cajaFin:      caja,
      sobregiro:    r.sobregiro || 0,
      deudaTot:     deuda,
      endeud:       totA > 0 ? safe(deuda / totA) : null,
      liquidez:     deuda > 0 ? safe(actCor / deuda) : null,
      roa:          safe(uN / totA),
      roe:          safe(uN / pat),
      ivaAPagar:    r.ivaAPagar ?? null,
      impIT:        r.impuestoIT ?? null,
      impIUE:       r.impuestoIUE ?? null,
      provIUE:      r.provisionIUE ?? null,
    };
  });

  // ── TAB 1 — Marketing ────────────────────────────────────────────────────
  const tab1 = tableWrap(
    secRow('🎯 Penetración y Posicionamiento')
    + kpiRow('Market Share real', v.map(e=>e.shareReal), pct,
        [{val:.30,color:S.verde},{val:.15,color:S.ambar},{val:0,color:S.rojo}],
        '% del mercado capturado. >30% líder · 15-30% competitivo · <15% débil')
    + kpiRow('Demanda formal del segmento (unid)', v.map(e=>e.demandaFormal), num,
        [{val:0,color:S.gris}], 'Demanda total disponible en el segmento (incluye efecto shock)')
    + kpiRow('Demanda asignada a la empresa (unid)', v.map(e=>e.demandaAsign), num,
        [{val:0,color:S.ambar}], 'Demanda captada según atractivo competitivo')
    + kpiRow('Unidades vendidas', v.map(e=>e.ventasReales), num,
        [{val:0,color:S.ambar}], 'min(demanda asignada, inventario disponible)')
    + kpiRow('% Demanda capturada', v.map(e=>e.pctCapturada), pct,
        [{val:.80,color:S.verde},{val:.50,color:S.ambar},{val:0,color:S.rojo}],
        'Ventas/Demanda formal. >80% excelente · <50% baja cobertura')
    + secRow('💰 Rentabilidad Comercial')
    + kpiRow('Ventas brutas (Bs)', v.map(e=>e.ventasBrutas), bs,
        [{val:0,color:S.ambar}])
    + kpiRow('Ventas netas (Bs)', v.map(e=>e.ventasNetas), bs,
        [{val:0,color:S.ambar}])
    + kpiRow('Margen bruto (%)', v.map(e=>e.mBruto), pct,
        [{val:.40,color:S.verde},{val:.20,color:S.ambar},{val:0,color:S.rojo}],
        'Utilidad Bruta/Ventas Netas. >40% excelente · <20% bajo')
    + kpiRow('Precio de venta (Bs)', v.map(e=>e.precioVenta), bs,
        [{val:0,color:S.gris}])
    + kpiRow('Costo unitario (Bs)', v.map(e=>e.costoUnit), bs,
        [{val:0,color:S.gris}])
    + kpiRow('Margen unitario (Bs)', v.map(e=>e.margenUnit), bs,
        [{val:20,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}],
        'Precio − Costo unitario. Debe ser positivo para cubrir gastos fijos')
    + secRow('📢 Marketing e Inversión')
    + kpiRow('Gasto publicidad (Bs)', v.map(e=>e.pubGasto), bs,
        [{val:0,color:S.gris}])
    + kpiRow('Gasto total marketing (Bs)', v.map(e=>e.mktTotal), bs,
        [{val:0,color:S.gris}])
    + kpiRow('ROI Marketing (x)', v.map(e=>e.roiMkt), x2,
        [{val:2,color:S.verde},{val:1,color:S.ambar},{val:0,color:S.rojo}],
        'Retorno por Bs invertido en marketing. >2x excelente · <1x ineficiente')
    + kpiRow('Costo Mkt por unidad vendida (Bs)', v.map(e=>e.costoMktUnd), bs,
        [{val:0,color:S.gris}], 'Gasto total marketing / unidades vendidas')
    + kpiRow('Ingresos por Bs 1 de publicidad (x)', v.map(e=>e.ingPorPub), x2,
        [{val:3,color:S.verde},{val:1,color:S.ambar},{val:0,color:S.rojo}],
        'Ventas netas / gasto en publicidad. >3x eficiente · <1x ineficiente')
    + secRow('⭐ Marca y Posicionamiento')
    + kpiRow('Brand Equity (pts)', v.map(e=>e.brandEquity), d1,
        [{val:70,color:S.verde},{val:50,color:S.ambar},{val:0,color:S.rojo}],
        'Valor acumulado de marca. >70 fuerte · 50-70 en construcción · <50 débil')
    + kpiRow('Atractivo competitivo (pts)', v.map(e=>e.atractivo), d2,
        [{val:10,color:S.verde},{val:5,color:S.ambar},{val:0,color:S.rojo}],
        'Score logit de atractivo. Determina el market share')
  );

  // ── TAB 2 — Producción ───────────────────────────────────────────────────
  const tab2 = tableWrap(
    secRow('🏭 Volumen y Capacidad')
    + kpiRow('Producción (pares)', v.map(e=>e.produccion), num,
        [{val:0,color:S.ambar}])
    + kpiRow('Inventario inicial (pares)', v.map(e=>e.invInicial), num,
        [{val:0,color:S.gris}])
    + kpiRow('Inventario final (pares)', v.map(e=>e.invFinalU), num,
        [{val:0,color:S.verde},{val:100,color:S.ambar},{val:500,color:S.rojo}].reverse(),
        'Inventario alto = sobreproducción o baja demanda')
    + kpiRow('Inventario / Producción (%)', v.map(e=>e.invPct), d1,
        [{val:0,color:S.verde},{val:20,color:S.ambar},{val:40,color:S.rojo}].reverse(),
        '% no vendido. <20% eficiente · >40% sobreproducción preocupante')
    + kpiRow('Capacidad efectiva (pares)', v.map(e=>e.capEfectiva), num,
        [{val:0,color:S.gris}], 'Operarios × Productividad × Factor capacitación')
    + secRow('💰 Costos de Producción')
    + kpiRow('Costo unitario TOTAL (Bs)', v.map(e=>e.costoUnitP), bs,
        [{val:0,color:S.gris}], 'CostoBase + Calidad + Canal ± Innovación + MP proveedor')
    + kpiRow('  └ Transformación (MOD+overhead, Bs)', v.map(e=>e.costoBase_p), bs,
        [{val:0,color:S.gris}], 'Costo base fijo definido por la industria para este producto')
    + kpiRow('  └ Factor calidad (Bs)', v.map(e=>e.costoCalidad_p), bs,
        [{val:0,color:S.gris}], '0.20 × nivel de calidad elegido')
    + kpiRow('  └ Costo canal distribución (Bs)', v.map(e=>Math.max(0,e.costoCanal_p)), bs,
        [{val:0,color:S.gris}], 'Costo adicional por unidad según canal principal y secundario')
    + kpiRow('  └ MP proveedor — factura (Bs)', v.map(e=>e.costoMP_p), bs,
        [{val:0,color:S.verde}], 'costoMP × unidadesMPporUnidad — 0 si no hay proveedor configurado')
    + kpiRow('Stock MP disponible (unid)', v.map(e=>e.stockMP), num,
        [{val:0,color:S.gris}], 'Inventario de materia prima al cierre del trimestre')
  );

  // ── TAB 3 — RRHH ─────────────────────────────────────────────────────────
  const tab3 = tableWrap(
    secRow('👥 Fuerza de Ventas')
    + kpiRow('Vendedores finales (por producto)', v.map(e=>e.vendFin), num,
        [{val:3,color:S.verde},{val:1,color:S.ambar},{val:0,color:S.rojo}])
    + kpiRow('Ventas por vendedor (unid / producto)', v.map(e=>e.ventasPorVend), num,
        [{val:200,color:S.verde},{val:100,color:S.ambar},{val:0,color:S.rojo}],
        'Productividad comercial: unidades vendidas / vendedores por producto')
    + kpiRow('Ingresos netos por vendedor (Bs / producto)', v.map(e=>e.ingPorVend), bs,
        [{val:50000,color:S.verde},{val:20000,color:S.ambar},{val:0,color:S.rojo}],
        'Ventas netas / vendedores por producto. Mide eficiencia de la fuerza de ventas')
    + secRow('🏭 Personal de Planta')
    + kpiRow('Operarios finales (por producto)', v.map(e=>e.operarios), num,
        [{val:0,color:S.gris}])
    + kpiRow('Costo operarios (Bs / producto)', v.map(e=>e.costoOper), bs,
        [{val:0,color:S.gris}], 'Sueldos operarios por línea de producto (específico)')
  );

  // ── TAB 4 — Financiero ───────────────────────────────────────────────────
  const tab4 = tableWrap(
    secRow('📊 Rentabilidad')
    + kpiRow('Costo unitario (Bs)', v.map(e=>e.costoUnitF), bs,
        [{val:0,color:S.gris}], 'CostoBase + CalidadFactor + CostoCanal ± Innovación')
    + kpiRow('Utilidad por unidad vendida (Bs)', v.map(e=>e.utilPorUnd), bs,
        [{val:20,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}],
        '(Ventas Netas − Costo de Ventas) / Unidades vendidas')
    + kpiRow('Margen bruto (%)', v.map(e=>e.mBruto), pct,
        [{val:.40,color:S.verde},{val:.20,color:S.ambar},{val:0,color:S.rojo}])
    + kpiRow('Margen neto (%)', v.map(e=>e.mNeto), pct,
        [{val:.10,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}])
    + kpiRow('Utilidad neta (Bs)', v.map(e=>e.utilNeta), bs,
        [{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}])
    + kpiRow('EBIT (Bs)', v.map(e=>e.ebitVal), bs,
        [{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}],
        'Resultado operativo antes de intereses e impuestos')
    + kpiRow('ROA (%)', v.map(e=>e.roa), pct,
        [{val:.10,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}],
        'Utilidad Neta / Activos Totales. >10% excelente')
    + kpiRow('ROE (%)', v.map(e=>e.roe), pct,
        [{val:.15,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}],
        'Utilidad Neta / Patrimonio. >15% excelente')
    + secRow('💧 Posición de Caja y Deuda')
    + kpiRow('Caja final (Bs)', v.map(e=>e.cajaFin), bs,
        [{val:50000,color:S.verde},{val:0,color:S.ambar},{val:-Infinity,color:S.rojo}])
    + kpiRow('Sobregiro (Bs)', v.map(e=>e.sobregiro), bs,
        [{val:0,color:S.verde},{val:0,color:S.ambar}],
        'Caja negativa → sobregiro automático con tasa de penalidad')
    + kpiRow('Deuda total (Bs)', v.map(e=>e.deudaTot), bs,
        [{val:0,color:S.verde},{val:50000,color:S.ambar},{val:200000,color:S.rojo}].reverse())
    + kpiRow('Endeudamiento (Deuda/Activos)', v.map(e=>e.endeud), pct,
        [{val:0,color:S.verde},{val:.30,color:S.ambar},{val:.50,color:S.rojo}].reverse(),
        '<30% bajo · 30-50% moderado · >50% alto')
    + kpiRow('Liquidez corriente (x)', v.map(e=>e.liquidez), x2,
        [{val:1.5,color:S.verde},{val:1.0,color:S.ambar},{val:0,color:S.rojo}],
        'Activo Corriente / Deuda. >1.5 sólida · <1.0 riesgo')
    + secRow('🧾 Impuestos')
    + kpiRow('IVA neto pagado (Bs)', v.map(e=>e.ivaAPagar), bs,
        [{val:0,color:S.gris}])
    + kpiRow('IT pagado (Bs)', v.map(e=>e.impIT), bs,
        [{val:0,color:S.gris}])
    + kpiRow('IUE pagado (Bs)', v.map(e=>e.impIUE), bs,
        [{val:0,color:S.gris}], 'Pago anual — aparece cada 4 trimestres')
    + kpiRow('Provisión IUE (Bs)', v.map(e=>e.provIUE), bs,
        [{val:0,color:S.gris}], 'Acumulación trimestral del IUE estimado')
  );

  // ── Ensamblado con 4 tabs ─────────────────────────────────────────────────
  const tabBar = '<div id="' + pfx + 'TabBar" style="display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:10px;flex-wrap:wrap">'
    + '<button class="btn btn-primary btn-sm" id="' + pfx + 'btn1" onclick="adminKPITab(1,\''+pfx+'\')">📣 Marketing</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn2" onclick="adminKPITab(2,\''+pfx+'\')">🏭 Producción</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn3" onclick="adminKPITab(3,\''+pfx+'\')">👥 RRHH</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn4" onclick="adminKPITab(4,\''+pfx+'\')">💰 Financiero</button>'
    + '<div style="flex:1"></div>'
    + '<button class="btn btn-ghost btn-sm" onclick="printPanel(\'' + pfx + 'Content\',\'Análisis KPI Financiero\',\'Ronda actual\')">🖨️ Imprimir</button>'
    + '</div>';

  const leyenda = '<div style="display:flex;gap:16px;margin-bottom:10px;font-size:.74rem;color:var(--text3)">'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:4px"></span>Óptimo</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#F59E0B;margin-right:4px"></span>Precaución</span>'
    + '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#EF4444;margin-right:4px"></span>Riesgo</span>'
    + '<span style="margin-left:auto;font-style:italic">Hover en ⓘ para ver definición del indicador</span>'
    + '</div>';

  return '<div id="' + pfx + 'Content">' + leyenda + tabBar
    + '<div id="' + pfx + 'pane1">' + tab1 + '</div>'
    + '<div id="' + pfx + 'pane2" style="display:none">' + tab2 + '</div>'
    + '<div id="' + pfx + 'pane3" style="display:none">' + tab3 + '</div>'
    + '<div id="' + pfx + 'pane4" style="display:none">' + tab4 + '</div>'
    + '</div>';
}

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
      // ── ER idéntico al panel estudiante ──
      const sec = lbl => '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-top:4px">'+lbl+'</div>';
      html += finRow('Precio facturado al cliente', r.totalFacturado||0, false,'neutral')
        + finRow('(−) IVA débito fiscal (13%)', -(r.ivaDebito||0), false,'neg')
        + finRowSub('= Ventas brutas (sin IVA)', r.ventasBrutas||0, true)
        + finRow('(−) Comisiones canal (neto)', -(r.comisionesNeto||Math.round((r.comisiones||0)*0.87)), false,'neg')
        + finRowSub('= Ventas netas', r.ventasNetasReal||r.ventasNetas||0, true)
        + finRow('(−) Costo de ventas', -(r.costoVentas||0), false,'neg')
        + finRowSub('= Utilidad bruta', r.utilidadBruta||0, true)
        + sec('(-) Gastos Comerciales')
        + finRow('Publicidad',              -(r.gastoPublicidad||Math.round((r.publicidad||0)*0.87)),         false,'neg')
        + finRow('Promoción',               -(r.gastoPromocion||Math.round((r.promocion||0)*0.87)),          false,'neg')
        + finRow('Eventos',                 -(r.gastoEventos||Math.round((r.eventos||0)*0.87)),            false,'neg')
        + finRow('Marketing en redes',      -(r.gastoMktRedes||Math.round((r.marketingRedes||0)*0.87)),     false,'neg')
        + finRow('Relaciones públicas',     -(r.gastoRRPP||Math.round((r.relacionesPublicas||0)*0.87)), false,'neg')
        + finRow('Fuerza de ventas',        -(r.costoVendedores||0),    false,'neg')
        + sec('(-) Gastos Administrativos')
        + finRow('Sueldos administrativos (operarios)', -(r.pagoOperarios||r.costoOperarios||0), false,'neg')
        + finRow('Gastos administrativos fijos',        -(r.gastoAdminFijo||0), false,'neg')
        + sec('(-) Gastos Operativos de Planta')
        + finRow('Gasto fijo de planta',    -(r.gastoFijoPlanta||0),    false,'neg')
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

function buildAdminResultsHTML(rd) {
  if (!rd.resultados?.length) return '';

  // F7-FIX: pfx definido al inicio para que withToggle pueda usarlo
  const pfx = 'ef_r' + (rd.ronda || 'x') + '_';

  // ── Paleta de colores por empresa ─────────────────────────
  const PALETTE = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6',
                   '#EC4899','#06FFA5','#84CC16','#F97316'];
  const tc = i => PALETTE[i % PALETTE.length];

  // ── Formato boliviano ─────────────────────────────────────
  // Positivo: Bs. 1.234.567   Negativo: (Bs. 1.234.567)   Cero: Bs. 0
  const bsBO = v => {
    if (v === null || v === undefined || isNaN(v)) return '<span style="color:var(--text3)">—</span>';
    const n = Math.round(Math.abs(v));
    const s = n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (v < 0)  return '<span style="color:#EF4444">(Bs. ' + s + ')</span>';
    if (v === 0) return '<span style="color:var(--text3)">Bs. 0</span>';
    return '<span style="color:#10B981">Bs. ' + s + '</span>';
  };
  const numBO = v => {
    if (!v && v !== 0) return '—';
    return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  const pctBO = v => v != null ? (v*100).toFixed(1)+'%' : '—';

  // Equipos ordenados por utilidad neta desc (para Dashboard ranking)
  const equipos = [...rd.resultados].sort((a,b) => (b.utilidadNeta||0)-(a.utilidadNeta||0));
  // Mantener orden original para columnas de tabla
  const eqs = rd.resultados;
  const N   = eqs.length;

  // ── Helpers de filas de tabla ─────────────────────────────
  const thStyle = (i) =>
    'padding:8px 12px;text-align:right;font-size:.72rem;white-space:nowrap;'
    +'border-bottom:2px solid var(--border2);background:var(--bg2);';
  const thFirst =
    'padding:8px 14px;text-align:left;font-size:.72rem;position:sticky;left:0;'
    +'background:var(--bg2);z-index:2;min-width:220px;border-bottom:2px solid var(--border2);';

  const hdr = () => {
    const cols = eqs.map((r,i) =>
      '<th style="'+thStyle(i)+'"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+tc(i)+';margin-right:5px;vertical-align:middle"></span>'
      + r.equipoNombre + '</th>'
    ).join('');
    return '<tr><th style="'+thFirst+'">Partida</th>'+cols+'</tr>';
  };

  // Tipo 1: sección
  const sec = (label) =>
    '<tr style="background:rgba(255,255,255,.04)">'
    +'<td style="padding:5px 14px;position:sticky;left:0;background:rgba(255,255,255,.04);z-index:1;font-family:var(--font-mono);font-size:.62rem;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px" colspan="'+(N+1)+'">'+label+'</td>'
    +'</tr>';

  // Tipo 2: partida normal
  const row = (label, fn, indent=false) => {
    const vals = eqs.map(r => '<td style="padding:5px 12px;text-align:right;font-family:var(--font-mono);font-size:.8rem;border-bottom:1px solid rgba(255,255,255,.04)">'+bsBO(fn(r))+'</td>').join('');
    const lStyle = 'padding:5px 14px;font-size:.78rem;color:var(--text2);border-bottom:1px solid rgba(255,255,255,.04);position:sticky;left:0;background:var(--bg);z-index:1;'+(indent?'padding-left:26px;':'');
    return '<tr><td style="'+lStyle+'">'+(indent?'<span style="color:var(--text3);margin-right:4px">(−)</span>':'')+label+'</td>'+vals+'</tr>';
  };

  // Tipo 3: subtotal / total
  const tot = (label, fn, highlight=false) => {
    const bg = highlight ? 'rgba(6,255,165,.07)' : 'rgba(255,255,255,.04)';
    const border = highlight ? '2px solid rgba(6,255,165,.3)' : '1px solid var(--border2)';
    const vals = eqs.map(r => {
      const v = fn(r);
      return '<td style="padding:6px 12px;text-align:right;font-family:var(--font-mono);font-size:.82rem;font-weight:700;border-top:'+border+';background:'+bg+'">'+bsBO(v)+'</td>';
    }).join('');
    return '<tr><td style="padding:6px 14px;font-weight:700;font-size:.79rem;border-top:'+border+';background:'+bg+';position:sticky;left:0;z-index:1">'+label+'</td>'+vals+'</tr>';
  };

  // ── PESTAÑA 1: DASHBOARD ──────────────────────────────────
  const semaforo = r => {
    const u = r.utilidadNeta||0;
    if (u > 0)         return '🟢';
    if (u > -50000)    return '🟡';
    return '🔴';
  };

  const dashRows = equipos.map((r,rank) => {
    const origIdx = eqs.findIndex(e => e.equipoNombre === r.equipoNombre);
    const hl = rank === 0 ? 'background:rgba(6,255,165,.07);font-weight:700;' : '';
    return '<tr style="'+hl+'border-bottom:1px solid var(--border)">'
      + '<td style="padding:7px 12px;text-align:center;font-weight:700;color:'+tc(origIdx)+'">'+( rank+1)+'</td>'
      + '<td style="padding:7px 12px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+tc(origIdx)+';margin-right:6px;vertical-align:middle"></span>'+r.equipoNombre+'</td>'
      + '<td style="padding:7px 12px;text-align:right;font-family:var(--font-mono)">'+numBO(r.ventasReales)+'</td>'
      + '<td style="padding:7px 12px;text-align:right;font-family:var(--font-mono)">'+bsBO(r.ebit||0)+'</td>'
      + '<td style="padding:7px 12px;text-align:right;font-family:var(--font-mono)"><strong>'+bsBO(r.utilidadNeta||0)+'</strong></td>'
      + '<td style="padding:7px 12px;text-align:right;font-family:var(--font-mono)">'+bsBO(r.cajaFinal||0)+'</td>'
      + '<td style="padding:7px 12px;text-align:right;font-family:var(--font-mono)">'+(r.roiMarketing!=null?Math.round(r.roiMarketing*100)/100+'x':'—')+'</td>'
      + '<td style="padding:7px 12px;text-align:center;font-size:1rem">'+semaforo(r)+'</td>'
      + '</tr>';
  }).join('');

  const dashHTML = '<div class="table-wrap">'
    + '<table><thead><tr>'
    + '<th style="padding:7px 12px;text-align:center">#</th>'
    + '<th style="padding:7px 12px">Empresa</th>'
    + '<th style="padding:7px 12px;text-align:right">Ventas<br>unid.</th>'
    + '<th style="padding:7px 12px;text-align:right">EBIT</th>'
    + '<th style="padding:7px 12px;text-align:right">Utilidad<br>Neta</th>'
    + '<th style="padding:7px 12px;text-align:right">Caja<br>Final</th>'
    + '<th style="padding:7px 12px;text-align:right">ROI<br>Mkt</th>'
    + '<th style="padding:7px 12px;text-align:center">Estado</th>'
    + '</tr></thead><tbody>'+dashRows+'</tbody></table>'
    + '</div>'
    + '<div class="charts-row" style="margin-top:14px">'
    + '<div class="chart-card" style="flex:2"><h4>EBIT vs Utilidad Neta por Empresa</h4><div class="chart-wrap" style="height:220px"><canvas id="chartAdminDash_'+( rd.ronda||0)+'"></canvas></div></div>'
    + '<div class="chart-card"><h4>Market Share (%)</h4><div class="chart-wrap" style="height:220px"><canvas id="chartAdminShare_'+( rd.ronda||0)+'"></canvas></div></div>'
    + '</div>';

  // ── PESTAÑA 2: ESTADO DE RESULTADOS ──────────────────────
  const plHTMLcomp = '<div class="table-wrap" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    + hdr()
    + sec('Ingresos')
    + row('(+) Ingresos por ventas',      r => r.ventasBrutas||0)
    + row('Costo de ventas',              r => r.costoVentas||0, true)
    + tot('Utilidad bruta',               r => r.utilidadBruta||0)
    + row('Gasto de marketing',           r => r.pagoMktTotal||0, true)
    + row('Gasto administrativo',         r => (r.gastoAdminFijo||0)+(r.gastoFijoPlanta||0)+(r.costoVendedores||0)+(r.costoOperarios||0)+(r.costoAlmacenamiento||0)+(r.gastoInnovacion||0), true)
    + row('Depreciación',                 r => r.depreciacion||0, true)
    + tot('EBIT',                         r => r.ebit||0, true)
    + row('Gasto financiero',             r => (r.interesesPrestamo||0)+(r.interesSobregiro||0)+(r.comisionApertura||0), true)
    + row('Impuestos (IVA+IT+IUE)',       r => (r.ivaAPagar||0)+(r.impuestoIT||0)+(r.impuestoIUE||0), true)
    + tot('UTILIDAD NETA',                r => r.utilidadNeta||0, true)
    + '</table></div>';
  const plHTML = withToggle(pfx+'pl', 'pl', plHTMLcomp, rd);

  // ── PESTAÑA 3: BALANCE GENERAL ────────────────────────────
  const bgHTMLcomp = '<div class="table-wrap" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    + hdr()
    + sec('A · Activo Corriente')
    + row('Caja y equivalentes',          r => r.cajaFinal||0)
    + row('Cuentas por cobrar (CxC)',     r => r.cxcFinal||0)
    + row('Inventarios (valorizado)',     r => r.invFinalValorizado||0)
    + tot('Total activo corriente',       r => (r.cajaFinal||0)+(r.cxcFinal||0)+(r.invFinalValorizado||0))
    + sec('A · Activo No Corriente')
    + row('Activos fijos brutos',         r => (r.afNetos||0)+(r.depreciacion||0))
    + row('Depreciación acumulada',       r => r.depreciacion||0, true)
    + tot('Activos fijos netos',          r => r.afNetos||0)
    + tot('TOTAL ACTIVO',                 r => r.totalActivos||0, true)
    + sec('B · Pasivo')
    + row('IVA por pagar',                r => r.ivaAPagar||0)
    + row('Deuda total (préstamos)',      r => r.deudaFinal||0)
    + tot('TOTAL PASIVO',                 r => (r.deudaFinal||0)+(r.ivaAPagar||0), true)
    + sec('C · Patrimonio')
    + row('Capital contable',             r => r.capitalContable||0)
    + row('Resultado acumulado',          r => r.resultadoAcumulado||0)
    + tot('TOTAL PATRIMONIO',             r => r.patrimonio||0)
    + (() => {
        const checks = eqs.map(r => {
          const pp = (r.deudaFinal||0)+(r.patrimonio||0);
          const ta = r.totalActivos||0;
          const ok = Math.abs(pp-ta) < 2;
          return '<td style="padding:6px 12px;text-align:right;font-family:var(--font-mono);font-size:.82rem;font-weight:700;background:'+(ok?'rgba(6,255,165,.07)':'rgba(239,68,68,.15)')+';color:'+(ok?'var(--accent5)':'var(--accent4)')+'">'+bsBO(pp)+(ok?'':' ⚠')+'</td>';
        }).join('');
        return '<tr><td style="padding:6px 14px;font-weight:700;font-size:.79rem;position:sticky;left:0;background:rgba(255,255,255,.04);z-index:1">TOTAL PASIVO + PATRIMONIO</td>'+checks+'</tr>';
      })()
    + '</table></div>';
  const bgHTML = withToggle(pfx+'bg', 'bg', bgHTMLcomp, rd);

  // ── PESTAÑA 4: FLUJO DE EFECTIVO ──────────────────────────
  const feHTMLcomp = '<div class="table-wrap" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    + hdr()
    + sec('A · Actividades Operativas')
    + row('Utilidad neta',                r => r.utilidadNeta||0)
    + row('(+) Depreciación',             r => r.depreciacion||0)
    + row('(+/−) Variación CxC',          r => -(r.cxcFinal||0)+(r.cxcInicial||0))
    + row('(+/−) Variación inventarios',  r => -(r.invFinalValorizado||0)+(r.inventarioInicial||0)*(r.costoUnitario||0))
    + tot('Flujo operacional neto',       r => {
        const dep  = r.depreciacion||0;
        const dCxC = -(r.cxcFinal||0)+(r.cxcInicial||0);
        const dInv = -(r.invFinalValorizado||0)+(r.inventarioInicial||0)*(r.costoUnitario||0);
        return (r.utilidadNeta||0)+dep+dCxC+dInv;
      }, true)
    + sec('B · Actividades de Inversión')
    + row('(−) Adquisición activos fijos', r => 0)
    + tot('Flujo de inversión',            r => 0)
    + sec('C · Actividades de Financiamiento')
    + row('(+) Nuevos préstamos',          r => r.ingresoPrestamo||0)
    + tot('Flujo de financiamiento',       r => r.ingresoPrestamo||0)
    + sec('D · Posición de Caja')
    + row('Saldo inicial de caja',         r => r.cajaInicial||0)
    + (() => {
        const checks = eqs.map(r => {
          const cf = r.cajaFinal||0;
          const ok = cf >= 0;
          return '<td style="padding:6px 12px;text-align:right;font-family:var(--font-mono);font-size:.82rem;font-weight:700;background:'+(ok?'rgba(6,255,165,.07)':'rgba(239,68,68,.15)')+';color:'+(ok?'var(--accent5)':'var(--accent4)')+'">'+bsBO(cf)+(cf<0?' ⚠':'')+'</td>';
        }).join('');
        return '<tr><td style="padding:6px 14px;font-weight:700;font-size:.79rem;position:sticky;left:0;background:rgba(255,255,255,.04);z-index:1">Saldo final de caja</td>'+checks+'</tr>';
      })()
    + '</table></div>';
  const feHTML = withToggle(pfx+'fe', 'fe', feHTMLcomp, rd);

  // ── Encabezado y tabs ─────────────────────────────────────
  const encabezado = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">'
    + '<div>'
    + '<div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px">SimNego · UAGRM &nbsp;·&nbsp; Ronda '+(rd.ronda||'N')+'</div>'
    + '<div style="font-size:.75rem;color:var(--text3);margin-top:2px">Cifras en Bs. bolivianos &nbsp;·&nbsp; Negativos en (paréntesis)</div>'
    + '</div>'
    + '<div style="display:flex;gap:6px">'
    + '<button class="btn btn-ghost btn-sm" onclick="printPanel(\'adminEFContent\',\'Estados Financieros · Ronda '+(rd.ronda||'N')+' · UAGRM\',\'Cifras en Bs. · Negativos en paréntesis\')">🖨️ Imprimir</button>'
    + '</div>'
    + '</div>';

  // F7-FIX: pfx ya definido al inicio de la función
  const tabs = '<div id="' + pfx + 'Tabs" style="display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid var(--border);padding-bottom:10px;flex-wrap:wrap">'
    + '<button class="btn btn-primary btn-sm" id="' + pfx + 'btn1" onclick="adminEFTab(1,\'' + pfx + '\')">📊 Dashboard</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn2" onclick="adminEFTab(2,\'' + pfx + '\')">📋 Estado de Resultados</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn3" onclick="adminEFTab(3,\'' + pfx + '\')">🏦 Balance General</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn4" onclick="adminEFTab(4,\'' + pfx + '\')">💧 Flujo de Efectivo</button>'
    + '<button class="btn btn-ghost btn-sm"   id="' + pfx + 'btn5" onclick="adminEFTab(5,\'' + pfx + '\')">📐 Análisis KPI</button>'
    + '</div>';

  // Construir KPI panel (3 tabs de ratios financieros)
  const kpiHTML = buildAdminKPIHTML(eqs, tc, pfx+'kpi_');

  // ── Banner de Shock de Mercado ────────────────────────────
  const shockBanner = (() => {
    const sh = rd.shock;
    if (!sh) return '';
    const colores = { boom:'#10B981', crisis:'#EF4444', neutral:'#6B7280', sectorial:'#F59E0B' };
    const fondos  = { boom:'rgba(16,185,129,.10)', crisis:'rgba(239,68,68,.10)', neutral:'rgba(107,114,128,.08)', sectorial:'rgba(245,158,11,.10)' };
    const color   = sh.color || colores[sh.tipo] || '#6B7280';
    const fondo   = fondos[sh.tipo] || 'rgba(107,114,128,.08)';
    const factor  = sh.factorDemanda !== 1.0
      ? ' · Demanda ' + (sh.factorDemanda > 1 ? '+' : '') + Math.round((sh.factorDemanda - 1) * 100) + '%'
      : '';
    const segs = sh.segmentosAfectados === 'todos' ? 'Todos los segmentos' : 'Segmentos específicos';
    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:16px;'
      + 'background:' + fondo + ';border:1px solid ' + color + '33;border-radius:var(--r);border-left:4px solid ' + color + '">'
      + '<span style="font-size:1.4rem">' + (sh.icono || '⚡') + '</span>'
      + '<div style="flex:1">'
      + '<div style="font-weight:700;font-size:.82rem;color:' + color + ';text-transform:uppercase;letter-spacing:1px">'
      + 'SHOCK DE MERCADO · Ronda ' + (rd.ronda || '') + ' · ' + (sh.tipo?.toUpperCase() || 'EVENTO') + '</div>'
      + '<div style="font-size:.85rem;color:var(--text1);margin-top:2px">' + sh.descripcion + '</div>'
      + '<div style="font-size:.75rem;color:var(--text3);margin-top:3px">' + segs + factor
      + (sh.forzadoPor === 'profesor' ? ' &nbsp;·&nbsp; <span style="color:var(--accent3);font-weight:600">📌 Elegido por el profesor</span>' : '') + '</div>'
      + '</div></div>';
  })();

  return '<div id="' + pfx + 'Content">'
    + shockBanner + encabezado + tabs
    + '<div id="' + pfx + 'pane1">' + dashHTML + '</div>'
    + '<div id="' + pfx + 'pane2" style="display:none">' + plHTML + '</div>'
    + '<div id="' + pfx + 'pane3" style="display:none">' + bgHTML + '</div>'
    + '<div id="' + pfx + 'pane4" style="display:none">' + feHTML + '</div>'
    + '<div id="' + pfx + 'pane5" style="display:none">' + kpiHTML + '</div>'
    + '</div>';
}

window.adminEFTab = (n, pfx) => {
  // F7-FIX: pfx identifica la instancia correcta de los tabs
  // Soporte legado: si no hay pfx busca IDs antiguos
  [1,2,3,4,5].forEach(i => {
    const pane = document.getElementById(pfx ? pfx+'pane'+i : 'adminEFPane'+i);
    const btn  = document.getElementById(pfx ? pfx+'btn'+i  : 'btnEFT'+i);
    if (pane) pane.style.display = i===n ? '' : 'none';
    if (btn)  btn.className = i===n ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
  });
};

function buildAdminChartsHTML(rd, n) {
  return '';  // Gráficos ahora dentro del Dashboard del buildAdminResultsHTML
}

function renderAdminCharts() {
  document.querySelectorAll('[id^="chartAdminDash_"]').forEach(canvas => {
    const n = parseInt(canvas.id.split('_')[1]);
    if (!n) return;
    api('GET',`/admin/resultados/${n}`).then(rd => {
      if (!rd.resultados?.length) return;
      const labels = rd.resultados.map(r => r.equipoNombre);
      const palette = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06FFA5','#84CC16','#F97316'];
      const defOpts = { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:'#9BA3C4', font:{ family:'Space Mono', size:9 } } } },
        scales:{ x:{ ticks:{ color:'#9BA3C4', font:{ family:'Space Mono', size:9 } }, grid:{ color:'#2A2F45' } },
                 y:{ ticks:{ color:'#9BA3C4', font:{ family:'Space Mono', size:9 } }, grid:{ color:'#2A2F45' } } } };
      new Chart(canvas, { type:'bar', data:{
        labels,
        datasets:[
          { label:'EBIT',          data: rd.resultados.map(r=>r.ebit||0),          backgroundColor: labels.map((_,i)=>palette[i%palette.length]+'CC'), borderRadius:3 },
          { label:'Utilidad Neta', data: rd.resultados.map(r=>r.utilidadNeta||0),  backgroundColor: labels.map((_,i)=>palette[i%palette.length]+'66'), borderRadius:3, borderWidth:1, borderColor: labels.map((_,i)=>palette[i%palette.length]) },
        ]
      }, options:{ ...defOpts } });
    }).catch(()=>{});
  });
  document.querySelectorAll('[id^="chartAdminShare_"]').forEach(canvas => {
    const n = parseInt(canvas.id.split('_')[1]);
    if (!n) return;
    api('GET',`/admin/resultados/${n}`).then(rd => {
      if (!rd.resultados?.length) return;
      const labels = rd.resultados.map(r => r.equipoNombre);
      const palette = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06FFA5','#84CC16','#F97316'];
      const defOpts = { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{ x:{ ticks:{ color:'#9BA3C4', font:{ family:'Space Mono', size:9 } }, grid:{ color:'#2A2F45' } },
                 y:{ ticks:{ color:'#9BA3C4', font:{ family:'Space Mono', size:9 }, callback: v => v+'%' }, grid:{ color:'#2A2F45' }, max:100 } } };
      new Chart(canvas, { type:'bar', data:{
        labels,
        datasets:[{ data: rd.resultados.map(r=>+(r.shareReal*100).toFixed(2)), backgroundColor: labels.map((_,i)=>palette[i%palette.length]), borderRadius:4 }]
      }, options:{ ...defOpts } });
    }).catch(()=>{});
  });
}


// ── Admin Mercado ──────────────────────────────────────────
async function loadAdminMercado() {
  if (!requireSimSelected('mercadoContent')) return;
  const ref = state.ref || await api('GET','/admin/config');
  const segs = ref.mercadoSegmentos || [];
  if (!segs.length) {
    document.getElementById('adminMercadoContent').innerHTML =
      '<div class="empty-state"><div class="empty-icon">📊</div><p>Sin datos de mercado.</p></div>';
    return;
  }
  const tend = t => t==='Alto crecimiento'?'badge-high':t==='Creciente'?'badge-grow':'badge-stable';
  const rows = segs.map(s => `
    <tr>
      <td><strong>${s.nombre}</strong></td>
      <td class="num">${fmt.num(s.demandaBase)}</td>
      <td class="num">${fmt.pct(s.pctContrabando)}</td>
      <td class="num val-gold">${fmt.num(s.demandaFormal)}</td>
      <td class="num">${fmt.pct(s.tasaCrecimiento ?? 0)}</td>
      <td><span class="badge ${tend(s.tendencia)}">${s.tendencia}</span></td>
    </tr>`).join('');
  document.getElementById('adminMercadoContent').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Segmento</th>
          <th>Demanda base</th>
          <th>% Contrabando</th>
          <th>Demanda formal (unid)</th>
          <th>Tasa crecimiento</th>
          <th>Tendencia</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ══════════════════════════════════════════════════════════
// ADMIN — PARÁMETROS
// ══════════════════════════════════════════════════════════
async function loadAdminParametros() {
  if (!requireSimSelected('adminParametrosContent')) return;
  const data = await api('GET', '/admin/config');
  const p  = data.parametros;
  const tp = data.tiposProducto;
  const can = data.canales;

  const pf = (label, key, hint='', step='any') => `
    <div class="param-row">
      <label class="param-label">${label}</label>
      <input class="param-input" type="number" step="${step}" data-pkey="${key}" value="${p[key]??''}"/>
      ${hint?`<span class="param-hint">${hint}</span>`:''}
    </div>`;

  document.getElementById('adminParametrosContent').innerHTML = `
    <div class="param-grid">

      <div class="param-card">
        <div class="param-card-title">💼 Capital Inicial por Equipo</div>
        ${pf('Capital inicial (Bs)','capitalInicial')}
        ${pf('Caja inicial (Bs)','cajaInicial')}
        ${pf('Activos fijos iniciales (Bs)','activosFijosIniciales')}
        ${pf('Inventario inicial (unid)','inventarioInicialUnid','0 = sin stock')}
        ${pf('CxC inicial (Bs)','cxcInicial')}
        ${pf('Deuda inicial (Bs)','deudaInicial')}
        ${pf('Capacidad máx producción (unid)','capacidadMaxProduccion')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🏭 Costos Fijos Operativos</div>
        ${pf('Gasto administrativo fijo (Bs)','gastoAdminFijo','Por trimestre')}
        ${pf('Gasto fijo de planta (Bs)','gastoFijoPlanta','Por trimestre')}
        ${pf('Depreciación trimestral (Bs)','depreciacionTrimestral')}
        ${pf('Costo almacenamiento / unid (Bs)','costoAlmacenamientoUnidad','Bs/unid final')}
      </div>

      <div class="param-card">
        <div class="param-card-title">💳 Ventas y Cobranzas</div>
        ${pf('% Ventas al contado','pctVentasContado','0.70 = 70%')}
        ${pf('% Ventas a crédito','pctVentasCredito','0.30 = 30%')}
        ${pf('Plazo cobro (trimestres)','plazoCobro','1 = siguiente trimestre','1')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🏦 Financiamiento</div>
        ${pf('Tasa préstamo operativo (trim.)','tasaPrestamoOperativo','0.04 = 4%')}
        ${pf('Tasa préstamo inversión (trim.)','tasaPrestamoInversion','0.03 = 3%')}
        ${pf('Tasa sobregiro (trim.)','tasaSobregiro','0.06 = 6%')}
        ${pf('Comisión apertura préstamo','comisionAperturaPrestamo','0.01 = 1%')}
        ${pf('Plazo préstamo operativo (trim.)','plazoPrestamoOperativo','','1')}
        ${pf('Plazo préstamo inversión (trim.)','plazoPrestamoInversion','','1')}
      </div>

      <div class="param-card">
        <div class="param-card-title">👥 Fuerza de Ventas</div>
        ${pf('Vendedores iniciales por equipo','vendedoresIniciales','','1')}
        ${pf('Sueldo trimestral / vendedor (Bs)','sueldoTrimestralVendedor')}
        ${pf('Costo contratación / vendedor (Bs)','costoContratacionVendedor')}
        ${pf('Costo despido / vendedor (Bs)','costoDespidoVendedor')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🔍 Investigación de Mercado</div>
        ${pf('Reporte Básico (Bs)','costoInvestigacionBasica')}
        ${pf('Reporte Premium (Bs)','costoInvestigacionPremium')}
        ${pf('Reporte Estratégico (Bs)','costoInvestigacionEstrategico')}
        ${pf('% Materia Prima del costoBase (ej. 0.40 = 40%)','pctMateriaPrima')}
      </div>

      <div class="param-card">
        <div class="param-card-title">💡 Innovación</div>
        ${pf('Factor innovación Producto','factorInnovacionProducto','0.333 = 1/3 del monto/unid')}
        ${pf('Factor innovación Proceso','factorInnovacionProceso','0.333 = reducción de CU')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🧾 Sistema Tributario Bolivia — Etapa 3.5</div>
        ${pf('IVA (tasa)','tasaIVA','0.13 = 13%')}
        ${pf('IT — Impuesto a las Transacciones (tasa)','tasaIT','0.03 = 3% sobre ventas brutas')}
        ${pf('IUE — Impuesto s/Utilidades (tasa)','tasaIUE','0.25 = 25% sobre utilidad gravable')}
        ${pf('Períodos para pago IUE (trimestres)','periodosIUE','4 = pago anual')}
        ${pf('λ Logit — Sensibilidad competitiva','lambdaLogit','1.0 = neutro · >1 más diferenciado · <1 más aleatorio')}
        ${pf('Coef. Precio (sensibilidad al precio en Logit)','coefPrecio','-0.7 = jaboncillos (Bs 2-10) · -0.005 = calzados (Bs 90-310) · valor negativo')}
      </div>

      <div class="param-card">
        <div class="param-card-title">🧪 Costo Base por Producto (Bs/unid)</div>
        ${Object.entries(tp).map(([n,v])=>`
          <div class="param-row">
            <label class="param-label">${n}</label>
            <input class="param-input" type="number" step="0.01" data-tp="${n}" value="${v.costoBase}"/>
          </div>`).join('')}
      </div>

      <div class="param-card" style="grid-column:span 2">
        <div class="param-card-title">⚙️ Módulos Activos — Control de Funcionalidades</div>
        <div style="font-size:.78rem;color:var(--text3);margin-bottom:12px">
          Activa o desactiva módulos para adaptar la complejidad del simulador a tu curso.
          Los módulos desactivados no aparecen en la hoja de decisión de los equipos.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
          ${[
            { id:'modMateriaPrima',  label:'🏭 Materia Prima',          desc:'Compra de MP, proveedores, lead time, restricción de producción',  etapa:'3.1' },
            { id:'modOperarios',     label:'👷 Operarios',              desc:'Contratación, despido, capacitación y capacidad efectiva',          etapa:'3.2' },
            { id:'modIVA',           label:'🧾 IVA (13%)',              desc:'Débito, crédito fiscal y pago neto de IVA en el P&L',              etapa:'3.3' },
            { id:'modImpuestos',     label:'📊 IT + IUE',              desc:'Impuesto a las Transacciones (3%) e IUE (25%) anual',             etapa:'3.4' },
            { id:'modBrandEquity',   label:'⭐ Brand Equity',           desc:'Acumulación de reputación de marca entre rondas',                  etapa:'2.1' },
            { id:'modCanibalizacion',label:'🔀 Canibalización',         desc:'Penalización al atractivo cuando la empresa compite en N segmentos',etapa:'2.3' },
            { id:'modDemandaDin',    label:'📈 Demanda Dinámica',       desc:'Crecimiento/decrecimiento de mercado por tendencia de segmento',   etapa:'2.2' },
            { id:'modInnovacion',    label:'💡 Innovación',             desc:'Inversión en producto, proceso o canal para mejorar posición',     etapa:'base' },
            { id:'modInvestigacion', label:'🔍 Investigación Mercado',  desc:'Compra de reportes básicos y premium de inteligencia',            etapa:'base' },
          ].map(mod => `
            <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:var(--bg2);border-radius:var(--r);border:1px solid var(--border2);cursor:pointer">
              <input type="checkbox" data-modulo="${mod.id}"
                ${(p['modulos_'+mod.id] !== 0) ? 'checked' : ''}
                style="width:16px;height:16px;margin-top:2px;accent-color:var(--accent);flex-shrink:0"/>
              <div>
                <div style="font-weight:600;font-size:.85rem;color:var(--text1)">${mod.label}
                  <span style="font-size:.7rem;color:var(--text3);font-weight:400;margin-left:4px">Etapa ${mod.etapa}</span>
                </div>
                <div style="font-size:.75rem;color:var(--text3);margin-top:2px">${mod.desc}</div>
              </div>
            </label>`).join('')}
        </div>
      </div>

      <div class="param-card" style="grid-column:span 2">
        <div class="param-card-title">📦 Canales — Costos y Comisiones</div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Canal</th>
              <th>Costo adicional/unid (Bs)</th>
              <th>Comisión sobre ventas</th>
              <th>Factor impacto vendedores</th>
              <th>Bono atractivo</th>
            </tr></thead>
            <tbody>
              ${Object.entries(can).map(([n,v])=>`
                <tr>
                  <td><strong>${n}</strong></td>
                  <td><input class="param-input" type="number" step="0.01" data-canal="${n}" data-canal-field="costoAdicionalUnitario" value="${v.costoAdicionalUnitario}" style="width:90px"/></td>
                  <td><input class="param-input" type="number" step="0.01" data-canal="${n}" data-canal-field="comisionPct" value="${v.comisionPct}" style="width:90px"/></td>
                  <td><input class="param-input" type="number" step="0.01" data-canal="${n}" data-canal-field="factorImpactoVendedores" value="${v.factorImpactoVendedores}" style="width:90px"/></td>
                  <td><input class="param-input" type="number" step="0.1"  data-canal="${n}" data-canal-field="bonoAtractivo" value="${v.bonoAtractivo}" style="width:90px"/></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

    </div>
    <div class="param-actions">
      <button class="btn btn-primary" id="btnSaveParams">💾 Guardar Parámetros</button>
      <span class="param-warning">⚠ Los cambios aplican desde la próxima simulación</span>
    </div>`;

  document.getElementById('btnSaveParams').addEventListener('click', saveParametros);
}

async function saveParametros() {
  const parametros = {};
  document.querySelectorAll('[data-pkey]').forEach(el => { parametros[el.dataset.pkey] = +el.value; });

  // Guardar estado de módulos como params booleanos (1=activo, 0=inactivo)
  document.querySelectorAll('[data-modulo]').forEach(el => {
    parametros['modulos_' + el.dataset.modulo] = el.checked ? 1 : 0;
  });

  const tiposProducto = {};
  document.querySelectorAll('[data-tp]').forEach(el => { tiposProducto[el.dataset.tp] = { costoBase: +el.value }; });

  const canales = {};
  document.querySelectorAll('[data-canal]').forEach(el => {
    if (!canales[el.dataset.canal]) canales[el.dataset.canal] = {};
    canales[el.dataset.canal][el.dataset.canalField] = +el.value;
  });

  try {
    await api('PUT','/admin/parametros',    { parametros });
    await api('PUT','/admin/tiposproducto', { tiposProducto });
    await api('PUT','/admin/canales',       { canales });
    toast('✓ Parámetros guardados','success');
    state.ref = await api('GET','/admin/config');
  } catch(e) { toast(e.message,'error'); }
}


// ══════════════════════════════════════════════════════════
// ADMIN — SEGMENTOS
// ══════════════════════════════════════════════════════════
let segmentosLocal = [];

async function loadAdminSegmentos() {
  if (!requireSimSelected('segmentosContent')) return;
  segmentosLocal = await api('GET', '/admin/segmentos');
  renderSegmentosEditor();
}

function renderSegmentosEditor() {
  const tendOpts = ['Estable','Creciente','Alto crecimiento','Decreciente'];
  const tabs = segmentosLocal.map((s,i) => `<button class="seg-tab ${i===0?'active':''}" data-seg="${i}">${s.nombre}</button>`).join('');

  const panels = segmentosLocal.map((s,i) => `
    <div class="seg-panel ${i===0?'active':''}" id="segPanel_${i}">
      <div class="seg-rename-row">
        <label class="param-label" style="color:var(--accent3);font-weight:700">✏️ Nombre del segmento</label>
        <input class="param-input seg-nombre-input" style="font-weight:700;font-size:.95rem;max-width:340px"
          data-seg-idx="${i}" data-seg-field="nombre" value="${s.nombre}"/>
      </div>
      <div class="seg-fields-grid">
        <div class="param-card">
          <div class="param-card-title">📊 Mercado</div>
          <div class="param-row"><label class="param-label">Demanda base (unidades)</label>
            <input class="param-input" type="number" step="1000" data-seg-idx="${i}" data-seg-field="demandaBase" value="${s.demandaBase}"/></div>
          <div class="param-row"><label class="param-label">% Contrabando (0–1)</label>
            <input class="param-input" type="number" step="0.01" min="0" max="1" data-seg-idx="${i}" data-seg-field="pctContrabando" value="${s.pctContrabando}"/>
            <span class="param-hint">Demanda formal = Demanda base × (1 − %)</span></div>
          <div class="param-row"><label class="param-label">Índice externo (competidores)</label>
            <input class="param-input" type="number" step="0.1" data-seg-idx="${i}" data-seg-field="indiceExterno" value="${s.indiceExterno}"/>
            <span class="param-hint">Atractivo agregado de competidores externos</span></div>
          <div class="param-row"><label class="param-label">Tendencia</label>
            <select class="param-input" data-seg-idx="${i}" data-seg-field="tendencia">
              ${tendOpts.map(t=>`<option ${t===s.tendencia?'selected':''}>${t}</option>`).join('')}
            </select></div>
          <div class="param-row"><label class="param-label">Descripción</label>
            <input class="param-input" type="text" data-seg-idx="${i}" data-seg-field="descripcion" value="${s.descripcion||''}"/></div>
        </div>
      </div>
      <div style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:var(--r);font-family:var(--font-mono);font-size:.78rem;color:var(--accent2)">
        Demanda formal = <strong id="demFormal_${i}">${Math.round(s.demandaBase*(1-s.pctContrabando)).toLocaleString('es-BO')}</strong> unidades
      </div>
    </div>`).join('');

  document.getElementById('adminSegmentosContent').innerHTML = `
    <div class="seg-tabs-bar">${tabs}</div>
    <div class="seg-panels">${panels}</div>
    <div class="param-actions">
      <button class="btn btn-primary" id="btnSaveSegs">💾 Guardar Segmentos</button>
      <button class="btn btn-ghost"   id="btnResetSegs">↺ Recargar</button>
    </div>`;

  document.querySelectorAll('.seg-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.seg-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`segPanel_${btn.dataset.seg}`)?.classList.add('active');
    });
  });

  document.querySelectorAll('[data-seg-idx][data-seg-field]').forEach(el => {
    el.addEventListener('input', () => {
      const idx = +el.dataset.segIdx;
      const field = el.dataset.segField;
      const val = el.tagName==='SELECT' ? el.value : (el.type==='number' ? +el.value : el.value);
      segmentosLocal[idx][field] = val;
      if (field==='nombre') document.querySelectorAll('.seg-tab')[idx].textContent = val||`Seg ${idx+1}`;
      if (field==='demandaBase' || field==='pctContrabando') {
        const seg = segmentosLocal[idx];
        const df = Math.round(seg.demandaBase*(1-seg.pctContrabando));
        const el2 = document.getElementById(`demFormal_${idx}`);
        if (el2) el2.textContent = df.toLocaleString('es-BO');
      }
    });
  });

  document.getElementById('btnSaveSegs').addEventListener('click', saveSegmentos);
  document.getElementById('btnResetSegs').addEventListener('click', loadAdminSegmentos);
}

async function saveSegmentos() {
  try {
    for (const s of segmentosLocal) {
      if (!s.nombre?.trim()) return toast('Todos los segmentos deben tener nombre','error');
    }
    await api('PUT','/admin/segmentos',{ segmentos: segmentosLocal });
    toast('✓ Segmentos guardados','success');
  } catch(e) { toast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════
// ADMIN — MATRIZ AFINIDAD
// ══════════════════════════════════════════════════════════
let afinidadLocal = null;
let segmentosForAfinidad = [];

async function loadAdminAfinidad() {
  if (!requireSimSelected('afinidadContent')) return;
  const [afData, segData] = await Promise.all([
    api('GET','/admin/afinidad'),
    api('GET','/admin/segmentos'),
  ]);
  afinidadLocal = afData;
  segmentosForAfinidad = segData;
  renderAfinidadEditor();
}

function renderAfinidadEditor() {
  const productos = Object.keys(afinidadLocal);
  const segNombres = segmentosForAfinidad.map(s => s.nombre);

  const colorCell = v => {
    if (v >= 3)  return 'background:rgba(6,255,165,.15);color:var(--accent5)';
    if (v >= 1)  return 'background:rgba(78,205,196,.1);color:var(--accent2)';
    if (v === 0) return 'background:var(--bg3);color:var(--text3)';
    return 'background:rgba(255,107,107,.12);color:var(--accent4)';
  };

  const headerCols = segNombres.map(n=>`<th style="padding:8px 6px;font-size:.68rem;text-align:center;white-space:nowrap;max-width:90px;overflow:hidden">${n}</th>`).join('');

  const rows = productos.map(prod => {
    const vals = afinidadLocal[prod] || [];
    const cells = segNombres.map((_, j) => {
      const v = vals[j] ?? 0;
      return `<td style="padding:4px;text-align:center">
        <input type="number" min="-3" max="3" step="1"
          data-af-prod="${prod}" data-af-seg="${j}"
          value="${v}"
          style="width:52px;text-align:center;padding:4px;border-radius:4px;border:1px solid var(--border2);${colorCell(v)};font-family:var(--font-mono);font-size:.82rem;outline:none"/>
      </td>`;
    }).join('');
    return `<tr><td style="padding:8px 12px;font-weight:600;white-space:nowrap">${prod}</td>${cells}</tr>`;
  }).join('');

  document.getElementById('adminAfinidadContent').innerHTML = `
    <div class="table-wrap">
      <table style="border-collapse:collapse;width:100%">
        <thead>
          <tr>
            <th style="padding:8px 12px;text-align:left;background:var(--bg3)">Producto \\ Segmento</th>
            ${headerCols}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;font-size:.78rem;color:var(--text3);display:flex;gap:16px;flex-wrap:wrap">
      <span style="color:var(--accent5)">■ +3 Ajuste perfecto</span>
      <span style="color:var(--accent2)">■ +1 Aceptable</span>
      <span style="color:var(--text3)">■ 0 Neutro</span>
      <span style="color:var(--accent4)">■ -2 Mal ajuste</span>
    </div>
    <div class="param-actions">
      <button class="btn btn-primary" id="btnSaveAfinidad">💾 Guardar Matriz</button>
      <button class="btn btn-ghost"   id="btnResetAfinidad">↺ Recargar</button>
    </div>`;

  // Bind: update color on change
  document.querySelectorAll('[data-af-prod]').forEach(inp => {
    inp.addEventListener('input', () => {
      const prod = inp.dataset.afProd;
      const j    = +inp.dataset.afSeg;
      const v    = +inp.value;
      if (afinidadLocal[prod]) afinidadLocal[prod][j] = v;
      inp.style.cssText = `width:52px;text-align:center;padding:4px;border-radius:4px;border:1px solid var(--border2);${colorCell(v)};font-family:var(--font-mono);font-size:.82rem;outline:none`;
    });
  });

  document.getElementById('btnSaveAfinidad').addEventListener('click', async () => {
    try {
      await api('PUT','/admin/afinidad',{ afinidadMatrix: afinidadLocal });
      toast('✓ Matriz guardada','success');
    } catch(e) { toast(e.message,'error'); }
  });
  document.getElementById('btnResetAfinidad').addEventListener('click', loadAdminAfinidad);
}

// ══════════════════════════════════════════════════════════
// ADMIN — COMPETENCIA EXTERNA
// ══════════════════════════════════════════════════════════
let competenciaLocal = [];

async function loadAdminCompetencia() {
  if (!requireSimSelected('competenciaContent')) return;
  competenciaLocal = await api('GET','/admin/competencia');
  // Leer segmentos reales de la industria activa
  try {
    const cfg = state.ref || await api('GET','/admin/config');
    state.ref = cfg;
    state.segNombresIndustria = (cfg.mercadoSegmentos || []).map(s => s.nombre);
  } catch { state.segNombresIndustria = []; }
  renderCompetenciaEditor();
}

function renderCompetenciaEditor() {
  // Usar segmentos reales de la industria; fallback a jaboncillos si no hay
  const segNombres = (state.segNombresIndustria && state.segNombresIndustria.length)
    ? state.segNombresIndustria
    : ['Masivo popular','Masivo aspiracional','Funcional familiar','Cosmético','Dermatológico','Natural','Institucional'];

  const rows = competenciaLocal.map((c,i) => `
    <tr>
      <td>
        <select class="param-input" data-comp="${i}" data-comp-field="segmento" style="min-width:160px">
          ${segNombres.map(s=>`<option ${s===c.segmento?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input class="param-input" type="text"   data-comp="${i}" data-comp-field="nombre"           value="${c.nombre}"           style="min-width:160px"/></td>
      <td><input class="param-input" type="number" data-comp="${i}" data-comp-field="precio"           value="${c.precio}"           step="0.1" style="width:80px"/></td>
      <td><input class="param-input" type="number" data-comp="${i}" data-comp-field="calidad"          value="${c.calidad}"          step="0.5" min="1" max="10" style="width:70px"/></td>
      <td><input class="param-input" type="number" data-comp="${i}" data-comp-field="marketing"        value="${c.marketing}"        step="500"  style="width:90px"/></td>
      <td><input class="param-input" type="number" data-comp="${i}" data-comp-field="participacionRef" value="${c.participacionRef}" step="0.01" min="0" max="1" style="width:80px"/></td>
      <td><button class="btn btn-danger btn-sm" onclick="eliminarCompetidor(${i})">✕</button></td>
    </tr>`).join('');

  document.getElementById('adminCompetenciaContent').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Segmento dominante</th><th>Nombre del competidor</th>
          <th>Precio (Bs)</th><th>Calidad (1-10)</th>
          <th>Marketing (Bs)</th><th>Participación ref.</th><th></th>
        </tr></thead>
        <tbody id="compRows">${rows}</tbody>
      </table>
    </div>
    <div class="param-actions">
      <button class="btn btn-ghost" id="btnAddComp">+ Agregar competidor</button>
      <button class="btn btn-primary" id="btnSaveComp">💾 Guardar</button>
    </div>
    <p class="param-hint" style="margin-top:8px">
      Estos actores externos influyen en el índice externo de cada segmento y aparecen en reportes de investigación de mercado.
    </p>`;

  document.querySelectorAll('[data-comp][data-comp-field]').forEach(el => {
    el.addEventListener('input', () => {
      const i = +el.dataset.comp;
      const f = el.dataset.compField;
      competenciaLocal[i][f] = el.type==='number' ? +el.value : el.value;
    });
  });

  document.getElementById('btnAddComp').addEventListener('click', () => {
    const segDefault = (state.segNombresIndustria && state.segNombresIndustria[0]) || 'Masivo popular';
    competenciaLocal.push({ segmento: segDefault, nombre:'Nuevo competidor', precio: 150, calidad:5, marketing:0, participacionRef:0.10 });
    renderCompetenciaEditor();
  });

  document.getElementById('btnSaveComp').addEventListener('click', async () => {
    try {
      await api('PUT','/admin/competencia',{ competencia: competenciaLocal });
      toast('✓ Competencia guardada','success');
    } catch(e) { toast(e.message,'error'); }
  });
}

window.eliminarCompetidor = (i) => {
  competenciaLocal.splice(i,1);
  renderCompetenciaEditor();
};


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
          <div class="form-group"><label class="form-label">⭐ Calidad (1–10)</label>${inp('calidad',d.calidad,'type="number" min="1" max="10" step="1"')}<span class="form-hint">+4% costo/punto sobre 5</span></div>
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
    vendedoresIniciales: 2,
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

          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;margin-bottom:14px">
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
                    <th style="padding:8px 14px;text-align:right;font-size:.68rem;color:var(--text3);text-transform:uppercase">Demanda formal</th>
                    <th style="padding:8px 14px;text-align:right;font-size:.68rem;color:var(--text3);text-transform:uppercase">Market share</th>
                    <th style="padding:8px 14px;text-align:right;font-size:.68rem;color:var(--accent5);text-transform:uppercase">Demanda asignada</th>
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
              <td class="hoja-ref">+0.20 Bs/unid de CU por punto · Afecta atractivo</td>
              <td></td></tr>
          <tr><td class="hoja-label">💰 Precio de venta (Bs)</td>
              <td>${inp('precioVenta',productoActivo.precioVenta,'number','min="0.1" step="0.1"')}</td>
              <td class="hoja-ref">Precio al consumidor final. Afecta atractivo competitivo.</td>
              <td>${ta('precios','¿Estrategia de precio?')}</td></tr>
          <tr><td class="hoja-label">🏭 Producción (unidades)</td>
              <td>${inp('produccion',productoActivo.produccion,'number',`min="0" max="${p.capacidadMaxProduccion||20000}" step="100"`)}</td>
              <td class="hoja-ref">Máx: ${fmt.num(p.capacidadMaxProduccion||20000)} unid</td>
              <td>${ta('produccion','¿Cómo estimaste la demanda?')}</td></tr>
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
            <td><span class="hoja-value-ro">${decision.operariosIniciales ?? p.operariosIniciales ?? 4}</span></td>
            <td class="hoja-ref">Propagado de ronda anterior</td>
            <td style="font-size:.78rem;color:var(--text3)">Cap. efectiva: ${fmt.num((decision.operariosIniciales ?? p.operariosIniciales ?? 4) * (p.productividadBase ?? 440))} unid/trim</td>
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
              <td class="hoja-ref">Comisión apertura: ${fmt.pct(p.comisionAperturaPrestamo||0.01)}</td><td></td></tr>
          <tr><td class="hoja-label">⏳ Plazo (trimestres)</td>
              <td>${inp('plazoPrestamo',decision.plazoPrestamo,'number','min="1" max="8" step="1"')}</td>
              <td class="hoja-ref">Op: ${p.plazoPrestamoOperativo||2} trim. · Inv: ${p.plazoPrestamoInversion||4} trim.</td><td></td></tr>
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
      el.type === 'checkbox' ? 'change' : 'input',
      () => {

        const v =
          el.type === 'checkbox' ? el.checked
          : el.type === 'number' ? +el.value
          : el.tagName === 'SELECT'
            ? el.value.replace(/\s*\(Bs[\s\d.]+\)\s*$/, '').trim()
            : el.value;

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

        const field = el.dataset.hojaField;

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
      try { await api('POST','/api/decisiones/guardar',{decision}); toast('💾 Guardado','success'); }
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
async function loadEquipoFinanciero() {
  const el = document.getElementById('eq-financiero-content');
  const nav = document.getElementById('eq-financiero-nav');
  if (!el) return;

  const data = await api('GET','/api/resultados');
  if (!data.historial?.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>Sin rondas simuladas aún.</p></div>`;
    return;
  }

  const latest = data.historial[data.historial.length-1].ronda;
  if (nav) {
    nav.innerHTML = data.historial.map(h =>
      `<button class="ronda-btn simulated" onclick="mostrarFinanciero(${h.ronda})">${h.ronda===latest?'<strong>':''}Ronda ${h.ronda}${h.ronda===latest?'</strong>':''}</button>`
    ).join('');
  }

  // Store historial globally for tab switching
  window._finHistorial = data.historial;
  mostrarFinanciero(latest);
}

window.mostrarFinanciero = (n) => {
  document.querySelectorAll('#eq-financiero-nav .ronda-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace(/\D+/g,''))===n);
  });
  const item = (window._finHistorial||[]).find(h=>h.ronda===n);
  const el = document.getElementById('eq-financiero-content');
  if (!item || !el) return;
  const r = item.resultado;

  el.innerHTML = `
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <button class="btn btn-ghost" id="tabPL" onclick="showFinTab('pl')" style="background:var(--accent);color:#fff">📋 Estado de Resultados</button>
    <button class="btn btn-ghost" id="tabBG" onclick="showFinTab('bg')">🏦 Balance General</button>
    <button class="btn btn-ghost" id="tabFC" onclick="showFinTab('fc')">💧 Flujo de Efectivo</button>
  </div>

  <!-- Estado de Resultados -->
  <div id="finPL">
    <div class="result-round-card">
      <div class="result-round-header" style="display:flex;align-items:center;justify-content:space-between">
        <h3>Estado de Resultados — Ronda ${n}</h3>
        <button class="btn btn-ghost btn-sm no-print" style="font-size:.72rem;padding:3px 10px" onclick="printFinancieroCompleto((state.me&&state.me.nombre)||'',${n})">🖨️ Imprimir completo</button>
      </div>
      <div style="padding:16px 20px">

        ${/* Tabla desglose por producto */
          (r.productos && r.productos.length > 1) ? (() => {
            const filas = r.productos.map((p,i) => {
              const mb     = p.utilidadBruta || 0;
              const mbPct  = (p.ventasNetas||0) > 0 ? (mb/(p.ventasNetas)*100).toFixed(1) + '%' : '—';
              const color  = mb >= 0 ? 'var(--accent2)' : 'var(--accent4)';
              return '<tr style="border-bottom:1px solid var(--border)">'
                + '<td style="padding:5px 10px;font-weight:600;white-space:nowrap">' + (p.producto||'—') + '</td>'
                + '<td style="padding:5px 10px;font-size:.74rem;color:var(--text3)">' + (p.segmento||'—').substring(0,22) + '</td>'
                + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono)">' + fmt.num(p.ventasReales||0) + '</td>'
                + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono)">' + fmt.bs(p.precioVenta||0) + '</td>'
                + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono)">' + fmt.bs(p.costoUnitario||0) + '</td>'
                + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono)">' + fmt.bs(p.ventasNetas||0) + '</td>'
                + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono)">' + fmt.bs(p.costoVentas||0) + '</td>'
                + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono);font-weight:700;color:'+color+'">' + fmt.bs(mb) + '</td>'
                + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono);color:'+color+'">' + mbPct + '</td>'
                + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono)">' + fmt.pct(p.shareReal||0) + '</td>'
                + '</tr>';
            }).join('');
            const colorTot = r.utilidadBruta>=0?'var(--accent2)':'var(--accent4)';
            const mbPctTot = (r.ventasNetas||0)>0 ? (r.utilidadBruta/r.ventasNetas*100).toFixed(1)+'%' : '—';
            return '<div style="font-family:var(--font-mono);font-size:.63rem;color:var(--accent3);text-transform:uppercase;letter-spacing:1px;padding:4px 0 6px 0;border-bottom:1px solid var(--border);margin-bottom:8px">📦 Desglose por Producto</div>'
              + '<div style="overflow-x:auto;margin-bottom:14px"><table style="width:100%;border-collapse:collapse;font-size:.79rem">'
              + '<thead><tr style="background:rgba(255,255,255,.04)">'
              + '<th style="padding:5px 10px;text-align:left;font-size:.63rem;color:var(--text3);text-transform:uppercase">Producto</th>'
              + '<th style="padding:5px 10px;text-align:left;font-size:.63rem;color:var(--text3);text-transform:uppercase">Segmento</th>'
              + '<th style="padding:5px 10px;text-align:right;font-size:.63rem;color:var(--text3);text-transform:uppercase">Ventas<br>unid</th>'
              + '<th style="padding:5px 10px;text-align:right;font-size:.63rem;color:var(--text3);text-transform:uppercase">Precio<br>venta</th>'
              + '<th style="padding:5px 10px;text-align:right;font-size:.63rem;color:var(--text3);text-transform:uppercase">Costo<br>unitario</th>'
              + '<th style="padding:5px 10px;text-align:right;font-size:.63rem;color:var(--text3);text-transform:uppercase">Ventas<br>netas</th>'
              + '<th style="padding:5px 10px;text-align:right;font-size:.63rem;color:var(--text3);text-transform:uppercase">Costo<br>ventas</th>'
              + '<th style="padding:5px 10px;text-align:right;font-size:.63rem;color:var(--accent2);text-transform:uppercase">Margen<br>bruto</th>'
              + '<th style="padding:5px 10px;text-align:right;font-size:.63rem;color:var(--text3);text-transform:uppercase">Margen<br>%</th>'
              + '<th style="padding:5px 10px;text-align:right;font-size:.63rem;color:var(--text3);text-transform:uppercase">Market<br>share</th>'
              + '</tr></thead>'
              + '<tbody>' + filas + '</tbody>'
              + '<tfoot><tr style="background:rgba(6,255,165,.06);border-top:2px solid var(--border2)">'
              + '<td colspan="2" style="padding:5px 10px;font-weight:700;font-size:.78rem">TOTAL EMPRESA</td>'
              + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono);font-weight:700">' + fmt.num(r.ventasReales||0) + '</td>'
              + '<td></td><td></td>'
              + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono);font-weight:700">' + fmt.bs(r.ventasNetas||0) + '</td>'
              + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono);font-weight:700">' + fmt.bs(r.costoVentas||0) + '</td>'
              + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono);font-weight:700;color:'+colorTot+'">' + fmt.bs(r.utilidadBruta||0) + '</td>'
              + '<td style="padding:5px 10px;text-align:right;font-family:var(--font-mono);font-weight:700;color:'+colorTot+'">' + mbPctTot + '</td>'
              + '<td></td></tr></tfoot>'
              + '</table></div>'
              + '<div style="font-family:var(--font-mono);font-size:.63rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-bottom:4px">📊 Estado de Resultados Consolidado</div>';
          })() : ''
        }

        ${finRow('Ventas brutas',              r.ventasBrutas,         false, 'neutral')}
        ${finRow('(−) Comisiones canal (neto)', -(r.comisionesNeto||Math.round((r.comisiones||0)*0.87)), false, 'neg')}
        ${finRowSub('= Ventas netas',          r.ventasNetasReal||r.ventasNetas, true)}
        ${finRow('(−) Costo de ventas',        -r.costoVentas,         false, 'neg')}
        ${finRowSub('= Utilidad bruta',        r.utilidadBruta,        true)}
        <div style="height:6px"></div>
        <!-- GASTOS COMERCIALES -->
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border)">(-) Gastos Comerciales</div>
        ${finRow('Publicidad',                 -(r.gastoPublicidad||Math.round((r.publicidad||0)*0.87)),   false,'neg')}
        ${finRow('Promoción',                  -(r.gastoPromocion||Math.round((r.promocion||0)*0.87)),     false,'neg')}
        ${finRow('Eventos',                    -(r.gastoEventos||Math.round((r.eventos||0)*0.87)),         false,'neg')}
        ${finRow('Marketing en redes',         -(r.gastoMktRedes||Math.round((r.marketingRedes||0)*0.87)), false,'neg')}
        ${finRow('Relaciones públicas',        -(r.gastoRRPP||Math.round((r.relacionesPublicas||0)*0.87)), false,'neg')}
        ${finRow('Fuerza de ventas',           -r.costoVendedores,     false,'neg')}

        <!-- GASTOS ADMINISTRATIVOS -->
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-top:4px">(-) Gastos Administrativos</div>
        ${finRow('Sueldos administrativos (operarios)', -(r.pagoOperarios||r.costoOperarios||0), false,'neg')}
        ${finRow('Gastos administrativos fijos',        -r.gastoAdminFijo,      false,'neg')}

        <!-- GASTOS OPERATIVOS DE PLANTA -->
        <div style="font-family:var(--font-mono);font-size:.65rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:4px 0;border-bottom:1px solid var(--border);margin-top:4px">(-) Gastos Operativos de Planta</div>
        ${finRow('Gasto fijo de planta',       -r.gastoFijoPlanta,     false,'neg')}
        ${finRow('Almacenamiento inventario',  -r.costoAlmacenamiento, false,'neg')}
        ${r.gastoInnovacion>0 ? finRow('Innovación / desarrollo',-(r.gastoInnovacionNeto||Math.round((r.gastoInnovacion||0)*0.87)), false,'neg') : ''}

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
  </div>`;
};

function finRow(label, value, bold=false, type='neutral') {
  const col = type==='pos' ? 'var(--accent5)' : type==='neg' ? 'var(--accent4)' : 'var(--text)';
  const w = bold ? 'font-weight:700' : '';
  return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:.83rem;${w}">
    <span style="color:var(--text2)">${label}</span>
    <span style="font-family:var(--font-mono);font-size:.8rem;color:${col}">${fmt.bs(value)}</span>
  </div>`;
}

function finRowSub(label, value, bold=false) {
  const col = value>=0 ? 'var(--accent5)' : 'var(--accent4)';
  return `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:.85rem;font-weight:700;margin-top:2px">
    <span>${label}</span>
    <span style="font-family:var(--font-mono);color:${col}">${fmt.bs(value)}</span>
  </div>`;
}

window.showFinTab = (tab) => {
  ['pl','bg','fc'].forEach(t => {
    const el = document.getElementById(`fin${t.toUpperCase()}`);
    if (el) el.style.display = t===tab ? '' : 'none';
  });
  const labels = {pl:'tabPL',bg:'tabBG',fc:'tabFC'};
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
async function loadAdminCreditos() {
  if (!requireSimSelected('adminCreditosContent')) return;
  const el = document.getElementById('adminCreditosContent');
  if (!el) return;
  el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3)">Cargando...</div>`;

  try {
    const [equipos, historialResp] = await Promise.all([
      api('GET', '/admin/equipos'),
      api('GET', '/admin/historial'),
    ]);

    if (!historialResp.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div><p>Sin rondas simuladas aún.</p></div>`;
      return;
    }

    // Load all simulated rounds
    const rondaData = {};
    for (const h of historialResp.filter(h=>['simulated','calculada'].includes(h.estado))) {
      try {
        const r = await api('GET', `/admin/resultados/${h.ronda}`);
        rondaData[h.ronda] = r;
      } catch {}
    }

    // Build per-equipo credit summary
    const tabs = equipos.map((eq,i) => `<button class="seg-tab ${i===0?'active':''}" data-eq="${eq.id}" onclick="showAdminCreditoEquipo('${eq.id}')">${eq.nombre}</button>`).join('');

    const panels = equipos.map((eq,i) => {
      const historialEquipo = Object.entries(rondaData).map(([ronda, rd]) => {
        const res = rd.resultados?.find(r => r.equipoOriginal === eq.id || r.equipo === eq.id || r.equipo?.startsWith(eq.id));
        return res ? { ronda: parseInt(ronda), resultado: res } : null;
      }).filter(Boolean).sort((a,b)=>a.ronda-b.ronda);

      // Reconstruct decisions from rounds (resultados have key fields)
      const prestamos = [];
      historialEquipo.forEach(({ronda, resultado: r}) => {
        if (r.ingresoPrestamo > 0) {
          const esSobregiro = r.sobregiro > 0 && r.ingresoPrestamo === r.sobregiro;
          if (!esSobregiro) {
            const plazo = r.plazoPrestamo || 2;
            prestamos.push({ rondaOrigen:ronda, tipo:'Préstamo', monto:r.ingresoPrestamo, tasa: r.interesesPrestamo/r.ingresoPrestamo||0.04, plazo, comision:r.comisionApertura||0 });
          }
        }
        if (r.sobregiro > 0) {
          prestamos.push({ rondaOrigen:ronda, tipo:'Sobregiro', monto:r.sobregiro, tasa:0.06, plazo:1, comision:0, interes:r.interesSobregiro });
        }
      });

      if (!prestamos.length) {
        return `<div class="seg-panel ${i===0?'active':''}" id="eqCredit_${eq.id}">
          <div class="empty-state"><div class="empty-icon">✅</div><p>Sin préstamos para ${eq.nombre}.</p></div>
        </div>`;
      }

      const cards = prestamos.map(p => {
        const currentR = Math.max(...Object.keys(rondaData).map(Number));
        const intTotal = Math.round(p.monto * (p.tasa||0) * p.plazo * 100)/100;
        const totalPagar = Math.round((p.monto + intTotal + p.comision)*100)/100;
        const rows = Array.from({length:p.plazo},(_,j)=>{
          const ronda = p.rondaOrigen + j + 1;
          const pagado = ronda <= currentR;
          return `<tr style="${pagado?'color:var(--text3)':''}">
            <td style="text-align:center;font-family:var(--font-mono)">${ronda}</td>
            <td class="num">${fmt.bs(Math.round(p.monto/p.plazo*100)/100)}</td>
            <td class="num">${fmt.bs(Math.round(p.monto*(p.tasa||0)*100)/100)}</td>
            <td class="num">${fmt.bs(Math.round((p.monto/p.plazo + p.monto*(p.tasa||0))*100)/100)}</td>
            <td style="text-align:center">${pagado?'<span class="badge badge-ok">✓</span>':'<span class="badge badge-pending">⏳</span>'}</td>
          </tr>`;
        }).join('');
        return `<div class="result-round-card" style="margin-bottom:12px">
          <div class="result-round-header"><h3>${p.tipo} — Ronda ${p.rondaOrigen}</h3>
            <span style="font-family:var(--font-mono);font-size:.72rem;color:var(--text3)">${fmt.bs(p.monto)} · ${fmt.pct(p.tasa||0)} trim.</span></div>
          <div class="table-wrap" style="border-radius:0">
            <table><thead><tr><th>Ronda pago</th><th>Capital</th><th>Interés</th><th>Cuota total</th><th>Estado</th></tr></thead>
            <tbody>${rows}</tbody></table>
          </div>
          <div style="padding:8px 14px;font-size:.78rem;color:var(--text3)">Total a pagar: <strong>${fmt.bs(totalPagar)}</strong> | Comisión apertura: <strong>${fmt.bs(p.comision)}</strong></div>
        </div>`;
      }).join('');

      const ultimaDeuda = historialEquipo[historialEquipo.length-1]?.resultado?.deudaFinal || 0;
      return `<div class="seg-panel ${i===0?'active':''}" id="eqCredit_${eq.id}">
        <div class="stat-grid" style="margin-bottom:16px">
          <div class="stat-card"><div class="stat-label">Préstamos / Sobregiros</div><div class="stat-value" style="color:var(--accent2)">${prestamos.length}</div></div>
          <div class="stat-card"><div class="stat-label">Deuda final última ronda</div><div class="stat-value" style="color:${ultimaDeuda>0?'var(--accent4)':'var(--accent5)'}">${fmt.bs(ultimaDeuda)}</div></div>
        </div>
        ${cards}
      </div>`;
    }).join('');

    el.innerHTML = `<div class="seg-tabs-bar">${tabs}</div><div class="seg-panels">${panels}</div>`;
  } catch(e) {
    el.innerHTML = `<p style="color:var(--accent4);padding:16px">${e.message}</p>`;
  }
}

window.showAdminCreditoEquipo = (id) => {
  document.querySelectorAll('#adminCreditosContent .seg-tab').forEach(b => b.classList.toggle('active', b.dataset.eq===id));
  document.querySelectorAll('#adminCreditosContent .seg-panel').forEach(p => p.classList.toggle('active', p.id==='eqCredit_'+id));
};


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

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
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
 
