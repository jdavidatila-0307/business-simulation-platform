/**
 * src/repositories/users.repo.js — SimNego v3.2
 * ─────────────────────────────────────────────────────────────────────────────
 * Repositorio: usuarios y autenticación
 * Fase 4 del plan de modularización
 *
 * Exports: findUserById, findUserByEmailOrId, findEquipoByNombre, createUser, listUsers, deleteUser
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
 * findUserById, findUserByEmailOrId, findEquipoByNombre, createUser, listUsers, deleteUser
 *
 * Para migrar:
 * 1. Copiar las funciones de storage.js a este archivo
 * 2. Agregar require('../db') para el pool
 * 3. Actualizar storage.js para importar desde aquí:
 *    const { findUserById, ... } = require('./repositories/users.repo');
 * 4. Ejecutar test_cuadre.js + verificar_endpoints.js antes del push
 */

// Placeholder — exporta referencia a storage.js durante la transición
const storage = require('../storage');
module.exports = storage;
