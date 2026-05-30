/**
 * src/repositories/ronda.repo.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Repositorio: rondas, decisiones y resultados
 * Fase 4 del plan de modularización
 *
 * Exports: getRonda, updateRonda, ensureRonda, getRondasAll, defaultDecision, saveDecision, countDecisiones
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
 * getRonda, updateRonda, ensureRonda, getRondasAll, defaultDecision, saveDecision, countDecisiones
 *
 * Para migrar:
 * 1. Copiar las funciones de storage.js a este archivo
 * 2. Agregar require('../db') para el pool
 * 3. Actualizar storage.js para importar desde aquí:
 *    const { getRonda, ... } = require('./repositories/ronda.repo');
 * 4. Ejecutar test_cuadre.js + verificar_endpoints.js antes del push
 */

// Placeholder — exporta referencia a storage.js durante la transición
const storage = require('../storage');
module.exports = storage;
