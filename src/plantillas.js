// src/plantillas.js
// =============================================================================
// Sistema de plantillas de industria para SimNego.
// Lee archivos JSON desde /industrias/ y devuelve la configuración completa.
// Si la plantilla no existe, lanza un error descriptivo con las disponibles.
// =============================================================================

'use strict';

const fs   = require('fs');
const path = require('path');

// Carpeta donde viven los archivos .json de industria
const DIR_INDUSTRIAS = path.resolve(__dirname, '..', 'industrias');  // industrias/ en la raíz del proyecto

// Plantilla por defecto cuando no se especifica industria
const PLANTILLA_DEFAULT = 'Calzados_COM540_1_2026_V1';

/**
 * Lista los nombres de plantillas disponibles en /industrias/.
 * Útil para validación y para mostrar opciones en el admin.
 *
 * @returns {string[]}  Nombres sin extensión, ej. ['jaboncillos_v1', 'automoviles_v1']
 */
function listarPlantillas() {
  try {
    return fs
      .readdirSync(DIR_INDUSTRIAS)
      .filter(f => f.endsWith('.json'))
      .map(f => path.basename(f, '.json'));
  } catch {
    return [];
  }
}

/**
 * Carga una plantilla de industria desde /industrias/{nombre}.json y devuelve
 * el objeto de configuración que el motor y el servidor esperan.
 *
 * La función valida que todos los campos obligatorios existan en el JSON para
 * detectar plantillas mal formadas antes de que lleguen al motor.
 *
 * @param {string} [nombre=PLANTILLA_DEFAULT]  Nombre del archivo sin extensión
 * @returns {{
 *   meta: object,
 *   params: object,
 *   tiposProducto: object,
 *   canales: object,
 *   segmentos: Array,
 *   afinidadMatrix: object,
 *   competenciaExterna: Array
 * }}
 * @throws {Error} Si el archivo no existe o le faltan campos obligatorios
 */
function cargarPlantilla(nombre = PLANTILLA_DEFAULT) {
  const nombreLimpio = String(nombre).replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(DIR_INDUSTRIAS, `${nombreLimpio}.json`);

  if (!fs.existsSync(filePath)) {
    const disponibles = listarPlantillas();
    throw new Error(
      `Plantilla de industria "${nombreLimpio}" no encontrada. ` +
      `Disponibles: ${disponibles.length ? disponibles.join(', ') : '(ninguna)'}`
    );
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new Error(`Error al parsear la plantilla "${nombreLimpio}": ${e.message}`);
  }

  // ── Validación de campos obligatorios ──────────────────────────────────────
  const CAMPOS_REQUERIDOS = [
    'params', 'tiposProducto', 'canales', 'segmentos',
    'afinidadMatrix', 'competenciaExterna',
  ];
  const faltantes = CAMPOS_REQUERIDOS.filter(c => raw[c] === undefined);
  if (faltantes.length) {
    throw new Error(
      `Plantilla "${nombreLimpio}" incompleta. Faltan: ${faltantes.join(', ')}`
    );
  }

  // Validar coherencia afinidadMatrix × segmentos
  const nSegmentos = raw.segmentos.length;
  for (const [prod, fila] of Object.entries(raw.afinidadMatrix)) {
    if (!Array.isArray(fila) || fila.length !== nSegmentos) {
      throw new Error(
        `afinidadMatrix["${prod}"] tiene ${fila?.length} valores pero hay ${nSegmentos} segmentos.`
      );
    }
  }

  return {
    meta:               raw.meta               || {},
    params:             raw.params,
    tiposProducto:      raw.tiposProducto,
    canales:            raw.canales,
    segmentos:          raw.segmentos,
    afinidadMatrix:     raw.afinidadMatrix,
    competenciaExterna: raw.competenciaExterna,
    proveedores:        raw.proveedores        || [],  // Etapa 3.1
  };
}

/**
 * Asegura que la carpeta /industrias/ existe.
 * La plantilla por defecto es Calzados_COM540_1_2026_V1 (incluida en el repo).
 * Llama a esta función UNA sola vez, durante el arranque del servidor.
 */
function inicializarPlantillaDefault() {
  if (!fs.existsSync(DIR_INDUSTRIAS)) {
    fs.mkdirSync(DIR_INDUSTRIAS, { recursive: true });
    console.log(`[plantillas] Carpeta industrias/ creada en: ${DIR_INDUSTRIAS}`);
  }
  const disponibles = listarPlantillas();
  if (disponibles.length === 0) {
    console.warn('[plantillas] ⚠ No hay plantillas en industrias/ — crea al menos una.');
  } else {
    console.log(`[plantillas] Plantillas disponibles: ${disponibles.join(', ')}`);
  }
}

module.exports = { cargarPlantilla, listarPlantillas, inicializarPlantillaDefault, PLANTILLA_DEFAULT };
