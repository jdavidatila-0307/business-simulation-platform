/**
 * src/repositories/sim.repo.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Repositorio: simulaciones y configuración
 * Fase 4 del plan de modularización
 *
 * Exports: createSimulacion, getSimulacion, listSimulaciones, updateSimulacion, deleteSimulacion, genSimId, genCodigo, getSimConfig, updateSimConfig
 *
 * Estado: PREPARADO — funciones documentadas aquí, implementadas en storage.js
 * Migración completa: Semana 4
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

// Pool compartido — se importará desde src/db.js en migración completa
// const { pool } = require('../db');

/*
 * FUNCIONES DE ESTE REPOSITORIO (actualmente en storage.js):
 * createSimulacion, getSimulacion, listSimulaciones, updateSimulacion, deleteSimulacion, genSimId, genCodigo, getSimConfig, updateSimConfig
 *
 * Para migrar:
 * 1. Copiar las funciones de storage.js a este archivo
 * 2. Agregar require('../db') para el pool
 * 3. Actualizar storage.js para importar desde aquí:
 *    const { createSimulacion, ... } = require('./repositories/sim.repo');
 * 4. Ejecutar test_cuadre.js + verificar_endpoints.js antes del push
 */

// Placeholder — exporta referencia a storage.js durante la transición
const storage = require('../storage');
module.exports = storage;
