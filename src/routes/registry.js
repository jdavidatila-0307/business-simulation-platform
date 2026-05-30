/**
 * src/routes/registry.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Registro de rutas HTTP — Fase 3 del plan de modularización
 *
 * Este archivo documenta todas las rutas de server.js organizadas por dominio.
 * En Fase 3 completa, cada grupo se migrará a su propio archivo de rutas.
 *
 * Uso actual: importado por server.js para validar que todas las rutas
 * están registradas (complementa verificar_endpoints.js)
 *
 * Arquitectura objetivo:
 *   server.js → router principal (~100 líneas)
 *   src/routes/auth.routes.js    → /auth/*
 *   src/routes/admin.routes.js   → /admin/* (simulaciones, equipos, config)
 *   src/routes/sim.routes.js     → /admin/ronda/*, /admin/simular
 *   src/routes/tools.routes.js   → /admin/historial, /admin/rondas, /admin/resultados
 *   src/routes/equipo.routes.js  → /api/*
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const ROUTES = {

  // ── AUTH ────────────────────────────────────────────────────────────────────
  auth: [
    { method: 'POST', path: '/auth/login',          desc: 'Login admin/equipo' },
    { method: 'POST', path: '/auth/logout',         desc: 'Cerrar sesión' },
    { method: 'POST', path: '/auth/registro',       desc: 'Registro de equipo' },
    { method: 'GET',  path: '/auth/me',             desc: 'Datos sesión activa' },
    { method: 'POST', path: '/auth/validar-codigo', desc: 'Validar código de acceso' },
  ],

  // ── ADMIN — Simulaciones ────────────────────────────────────────────────────
  adminSim: [
    { method: 'GET',    path: '/admin/simulaciones',           desc: 'Listar simulaciones' },
    { method: 'POST',   path: '/admin/simulaciones',           desc: 'Crear simulación' },
    { method: 'PUT',    path: '/admin/simulaciones/:id',       desc: 'Actualizar simulación' },
    { method: 'DELETE', path: '/admin/simulaciones/:id',       desc: 'Eliminar simulación' },
    { method: 'POST',   path: '/admin/simulaciones/:id/activar',  desc: 'Activar simulación' },
    { method: 'POST',   path: '/admin/simulaciones/:id/archivar', desc: 'Archivar simulación' },
    { method: 'POST',   path: '/admin/seleccionar-sim',        desc: 'Seleccionar simulación activa' },
  ],

  // ── ADMIN — Equipos ─────────────────────────────────────────────────────────
  adminEquipos: [
    { method: 'GET',    path: '/admin/equipos',               desc: 'Listar equipos' },
    { method: 'POST',   path: '/admin/equipos',               desc: 'Crear equipo' },
    { method: 'PUT',    path: '/admin/equipos/:id',           desc: 'Actualizar equipo' },
    { method: 'DELETE', path: '/admin/equipos/:id',           desc: 'Eliminar equipo' },
    { method: 'POST',   path: '/admin/equipos/:id/reset-envio', desc: 'Resetear envío' },
    { method: 'PUT',    path: '/admin/equipos/:id/password',  desc: 'Cambiar contraseña' },
  ],

  // ── ADMIN — Bots ────────────────────────────────────────────────────────────
  adminBots: [
    { method: 'GET',    path: '/admin/bots',    desc: 'Listar bots' },
    { method: 'POST',   path: '/admin/bots',    desc: 'Crear bot' },
    { method: 'DELETE', path: '/admin/bots/:id', desc: 'Eliminar bot' },
  ],

  // ── ADMIN — Rondas y Simulación ─────────────────────────────────────────────
  adminRondas: [
    { method: 'GET',  path: '/admin/ronda',              desc: 'Estado ronda actual' },
    { method: 'POST', path: '/admin/ronda/siguiente',    desc: 'Crear siguiente ronda' },
    { method: 'POST', path: '/admin/ronda/activar',      desc: 'Activar hoja de decisiones' },
    { method: 'POST', path: '/admin/ronda/pre-simular',  desc: 'Pre-simulación (demanda)' },
    { method: 'POST', path: '/admin/simular',            desc: 'Ejecutar simulación' },
    { method: 'POST', path: '/admin/ronda/cerrar',       desc: 'Cerrar ronda' },
    { method: 'POST', path: '/admin/presim/forzar-todos', desc: 'Forzar confirmación presim' },
  ],

  // ── ADMIN — Configuración ───────────────────────────────────────────────────
  adminConfig: [
    { method: 'GET', path: '/admin/config',         desc: 'Config completa de simulación' },
    { method: 'GET', path: '/admin/plantillas',     desc: 'Listar plantillas de industria' },
    { method: 'PUT', path: '/admin/parametros',     desc: 'Guardar parámetros' },
    { method: 'PUT', path: '/admin/tiposproducto',  desc: 'Guardar tipos de producto' },
    { method: 'PUT', path: '/admin/canales',        desc: 'Guardar canales' },
    { method: 'GET', path: '/admin/segmentos',      desc: 'Obtener segmentos' },
    { method: 'PUT', path: '/admin/segmentos',      desc: 'Guardar segmentos' },
    { method: 'GET', path: '/admin/afinidad',       desc: 'Obtener matriz afinidad' },
    { method: 'PUT', path: '/admin/afinidad',       desc: 'Guardar matriz afinidad' },
    { method: 'GET', path: '/admin/competencia',    desc: 'Obtener competencia externa' },
    { method: 'PUT', path: '/admin/competencia',    desc: 'Guardar competencia externa' },
  ],

  // ── ADMIN — Herramientas ────────────────────────────────────────────────────
  adminTools: [
    { method: 'GET',  path: '/admin/historial',        desc: 'Historial de rondas' },
    { method: 'GET',  path: '/admin/rondas',           desc: 'Rondas con resultados' },
    { method: 'GET',  path: '/admin/resultados/:n',    desc: 'Resultados de ronda N' },
    { method: 'POST', path: '/admin/recalcular-balance', desc: 'Recalcular EF todas las rondas' },
  ],

  // ── EQUIPO — Decisiones y resultados ───────────────────────────────────────
  equipo: [
    { method: 'GET',  path: '/api/decisiones',         desc: 'Obtener decisiones equipo' },
    { method: 'POST', path: '/api/decisiones/guardar', desc: 'Guardar borrador' },
    { method: 'POST', path: '/api/decisiones/enviar',  desc: 'Enviar decisiones' },
    { method: 'GET',  path: '/api/presim',             desc: 'Pre-simulación del equipo' },
    { method: 'POST', path: '/api/presim/confirmar',   desc: 'Confirmar recepción presim' },
    { method: 'GET',  path: '/api/resultados',         desc: 'Resultados del equipo' },
    { method: 'GET',  path: '/api/reportes/:n',        desc: 'Reporte de mercado ronda N' },
    { method: 'GET',  path: '/api/noticias',           desc: 'Noticias del macroentorno' },
    { method: 'GET',  path: '/api/dashboard/:n',       desc: 'Dashboard ronda N' },
  ],
};

/**
 * Verifica que todas las rutas del registro están implementadas en server.js
 * Útil para detectar rutas faltantes antes del deploy
 */
function verificarRegistro(serverContent) {
  const faltantes = [];
  const todas = Object.values(ROUTES).flat();

  todas.forEach(function(ruta) {
    // Convertir path a patron de busqueda
    // /admin/simulaciones/:id → busca url.match o url === con esa ruta base
    const base = ruta.path.replace(/\/:[\w]+.*/g, ''); // /admin/simulaciones
    const tieneDinamica = ruta.path.includes(':');

    let encontrado = false;
    if (tieneDinamica) {
      // Buscar url.match con la ruta base
      const escapado = base.replace(/\//g, '\\/');
      encontrado = new RegExp(escapado).test(serverContent);
    } else {
      // Buscar coincidencia exacta
      const escapado = ruta.path.replace(/\//g, '\\/');
      encontrado = new RegExp("url\\s*===\\s*['\"]" + escapado + "['\"]").test(serverContent);
    }

    if (!encontrado) {
      faltantes.push(ruta.method + ' ' + ruta.path);
    }
  });

  return faltantes;
}

module.exports = { ROUTES, verificarRegistro };
