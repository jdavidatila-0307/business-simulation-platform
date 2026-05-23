// src/ws_service.js
// =============================================================================
// Servicio WebSocket para SimNego.
// Gestiona conexiones en tiempo real agrupadas por simulación,
// para notificar a los equipos cuando el profesor ejecuta una ronda.
//
// DEPENDENCIA: npm install ws
// INTEGRACIÓN: adjuntarse al mismo servidor HTTP del proyecto (mismo puerto).
// =============================================================================

'use strict';

const { WebSocketServer } = require('ws');

// Mapa de clientes conectados por simulación: simId → Set<WebSocket>
// Se limpia automáticamente cuando los clientes se desconectan.
const clients = new Map();

// Contador de conexiones (para logging y diagnóstico)
let totalConexiones = 0;

/**
 * Inicializa el servidor WebSocket adjunto al servidor HTTP existente.
 * Comparte el mismo puerto que el servidor HTTP (no abre un puerto nuevo).
 *
 * Protocolo de conexión desde el cliente:
 *   new WebSocket(`ws://host/?simId=sim_xxx&rol=equipo`)
 *
 * @param {http.Server} server  Instancia del servidor HTTP de Node.js
 */
function initWebSocket(server) {
  const wss = new WebSocketServer({
    server,                // reutiliza el puerto del servidor HTTP
    path: '/ws',           // solo escucha en la ruta /ws (no interfiere con REST)
    clientTracking: true,
  });

  wss.on('connection', (ws, req) => {
    // Extraer parámetros de la URL de conexión
    let simId, rol, equipoId;
    try {
      const url    = new URL(req.url, `http://${req.headers.host}`);
      simId    = url.searchParams.get('simId')    || null;
      rol      = url.searchParams.get('rol')      || 'equipo';
      equipoId = url.searchParams.get('equipoId') || null;
    } catch {
      // URL malformada → cerrar conexión
      ws.close(1008, 'URL inválida');
      return;
    }

    if (!simId) {
      ws.close(1008, 'simId requerido');
      return;
    }

    // Registrar el cliente en el mapa de su simulación
    if (!clients.has(simId)) clients.set(simId, new Set());
    clients.get(simId).add(ws);
    totalConexiones++;

    // Metadata en el socket para logging
    ws._simId    = simId;
    ws._rol      = rol;
    ws._equipoId = equipoId;
    ws._connAt   = Date.now();

    console.log(
      `[ws] ✓ Conexión [${rol}${equipoId ? '/' + equipoId : ''}] → sim "${simId}" ` +
      `| Total en esta sim: ${clients.get(simId).size}`
    );

    // Enviar confirmación de conexión al cliente
    enviarA(ws, 'conectado', {
      simId,
      mensaje: 'Conexión en tiempo real establecida.',
      serverTime: new Date().toISOString(),
    });

    // ── Eventos del cliente ─────────────────────────────────────────────────
    ws.on('message', (data) => {
      // El servidor no necesita mensajes del cliente por ahora.
      // Aquí se puede implementar un ping/heartbeat o suscripción a eventos.
      try {
        const msg = JSON.parse(data.toString());
        if (msg.tipo === 'ping') {
          enviarA(ws, 'pong', { ts: Date.now() });
        }
      } catch {
        // Mensaje no JSON → ignorar
      }
    });

    ws.on('close', (code, reason) => {
      clients.get(simId)?.delete(ws);
      // Limpiar el Set si quedó vacío
      if (clients.get(simId)?.size === 0) clients.delete(simId);
      console.log(
        `[ws] ✗ Desconexión [${rol}${equipoId ? '/' + equipoId : ''}] ` +
        `→ sim "${simId}" | código: ${code}`
      );
    });

    ws.on('error', (err) => {
      console.error(`[ws] Error en conexión (sim="${simId}"): ${err.message}`);
    });
  });

  wss.on('error', (err) => {
  console.error('[ws] Error en WebSocketServer:', err.message);
  if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
    console.error('[ws] Error fatal de red — terminando proceso.');
    process.exit(1);
  }
});

  console.log('[ws] WebSocket service inicializado en /ws');
  return wss;
}

/**
 * Envía un mensaje a todos los clientes conectados a una simulación específica.
 * Los clientes desconectados se limpian automáticamente.
 *
 * @param {string} simId    ID de la simulación
 * @param {string} evento   Nombre del evento, ej. 'ronda_calculada', 'ronda_abierta'
 * @param {Object} datos    Payload del evento (se serializa a JSON)
 */
function broadcast(simId, evento, datos = {}) {
  const simClients = clients.get(simId);
  if (!simClients || simClients.size === 0) {
    // Nadie conectado a esta sim — no es un error
    return;
  }

  const mensaje = JSON.stringify({
    evento,
    datos,
    ts: Date.now(),
    simId,
  });

  let enviados = 0;
  let eliminados = 0;

  for (const ws of simClients) {
    if (ws.readyState === 1) {  // OPEN
      try {
        ws.send(mensaje);
        enviados++;
      } catch (err) {
        console.error(`[ws] Error enviando a cliente (sim="${simId}"): ${err.message}`);
        simClients.delete(ws);
        eliminados++;
      }
    } else {
      // Socket en estado CLOSING o CLOSED: limpiar
      simClients.delete(ws);
      eliminados++;
    }
  }

  if (enviados > 0) {
    console.log(`[ws] broadcast "${evento}" → sim "${simId}" | ${enviados} clientes notificados`);
  }
  if (eliminados > 0) {
    console.log(`[ws] ${eliminados} conexiones obsoletas eliminadas de sim "${simId}"`);
  }
}

/**
 * Envía un mensaje a un WebSocket individual (para confirmación de conexión, etc.)
 *
 * @param {WebSocket} ws
 * @param {string}    evento
 * @param {Object}    datos
 */
function enviarA(ws, evento, datos = {}) {
  if (ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify({ evento, datos, ts: Date.now() }));
  } catch (err) {
    console.error(`[ws] Error en enviarA: ${err.message}`);
  }
}

/**
 * Devuelve el número de clientes conectados a una simulación.
 * Útil para debugging y para endpoints de diagnóstico.
 *
 * @param {string} [simId]  Si se omite, devuelve el total global.
 * @returns {number}
 */
function clientesConectados(simId) {
  if (simId) return clients.get(simId)?.size || 0;
  let total = 0;
  for (const set of clients.values()) total += set.size;
  return total;
}

module.exports = { initWebSocket, broadcast, clientesConectados };
