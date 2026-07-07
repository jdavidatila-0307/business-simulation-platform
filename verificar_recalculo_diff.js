// verificar_recalculo_diff.js — SOLO LECTURA. Compara sim_rondas.resultados
// (estado actual, post-recálculo) contra <tablaBackupRondas>.resultados
// (estado pre-recálculo, respaldado antes de persistir cualquier cambio),
// para una simulación y ronda dadas.
//
// Patrón de conexión: pg.Pool directo (mismo patrón ya usado en
// scripts/diagnostico/*.js — storage.js NO expone el pool ni una función
// genérica de lectura de tabla arbitraria, así que no se reutiliza storage.js
// aquí; se replica el patrón existente en el proyecto, confirmado por lectura
// directa de scripts/diagnostico/ver_r11_estado.js).
'use strict';

const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

// Nombres de tabla NUNCA se interpolan directamente en SQL con valores de
// usuario arbitrarios sin control — aquí tablaBackupRondas viene siempre de un
// parámetro explícito del llamador (nunca de input HTTP), pero igual se
// restringe a un patrón seguro de identificador SQL antes de interpolar,
// como defensa en profundidad contra inyección por nombre de tabla.
function validarIdentificadorTabla(nombre) {
  if (typeof nombre !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nombre)) {
    throw new Error(`tablaBackupRondas inválida (no es un identificador SQL seguro): "${nombre}"`);
  }
  return nombre;
}

function extraerResultadosPorKey(resultadosColumnaJSON) {
  // resultados puede venir como { resultados: {...} } (estructura del motor)
  // o directamente como el mapa de resultados por key — se soportan ambas
  // formas, igual que el resto del código del proyecto (ver server.js:
  // `ronda.resultados?.resultados || ronda.resultados || {}`).
  if (!resultadosColumnaJSON || typeof resultadosColumnaJSON !== 'object') return {};
  return resultadosColumnaJSON.resultados || resultadosColumnaJSON || {};
}

function compararObjetosPorCampo(antes, despues) {
  const camposDistintos = [];
  const clavesCampos = new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})]);
  for (const campo of clavesCampos) {
    const valorAntes = antes ? antes[campo] : undefined;
    const valorDespues = despues ? despues[campo] : undefined;
    // Comparación estructural simple (JSON.stringify) — suficiente para
    // campos escalares, arrays y objetos anidados; no requiere deep-equal
    // de terceros para esta verificación de solo lectura.
    if (JSON.stringify(valorAntes) !== JSON.stringify(valorDespues)) {
      camposDistintos.push({ campo, antes: valorAntes, despues: valorDespues });
    }
  }
  return camposDistintos;
}

async function verificarRecalculoDiff({ simulacionId, numeroRonda, tablaBackupRondas }) {
  if (!simulacionId || typeof simulacionId !== 'string') {
    throw new Error('simulacionId es obligatorio y debe ser string');
  }
  if (!Number.isInteger(numeroRonda)) {
    throw new Error('numeroRonda es obligatorio y debe ser entero');
  }
  const tablaSegura = validarIdentificadorTabla(tablaBackupRondas);

  const client = await pool.connect();
  try {
    // SELECT únicamente — sin ningún INSERT/UPDATE/DELETE en todo el módulo.
    const actualRes = await client.query(
      `SELECT resultados FROM sim_rondas WHERE simulacion_id = $1 AND numero = $2`,
      [simulacionId, numeroRonda]
    );
    const backupRes = await client.query(
      `SELECT resultados FROM ${tablaSegura} WHERE simulacion_id = $1 AND numero = $2`,
      [simulacionId, numeroRonda]
    );

    const resultadosDespues = extraerResultadosPorKey(actualRes.rows[0]?.resultados);
    const resultadosAntes = extraerResultadosPorKey(backupRes.rows[0]?.resultados);

    const todasLasKeys = new Set([...Object.keys(resultadosAntes), ...Object.keys(resultadosDespues)]);

    const identicos = [];
    const conDiferencias = [];
    const soloEnAntes = [];
    const soloEnDespues = [];

    for (const key of todasLasKeys) {
      const enAntes = key in resultadosAntes;
      const enDespues = key in resultadosDespues;

      if (enAntes && !enDespues) { soloEnAntes.push(key); continue; }
      if (!enAntes && enDespues) { soloEnDespues.push(key); continue; }

      const campos = compararObjetosPorCampo(resultadosAntes[key], resultadosDespues[key]);
      if (campos.length === 0) {
        identicos.push(key);
      } else {
        conDiferencias.push({ key, campos });
      }
    }

    return { identicos, conDiferencias, soloEnAntes, soloEnDespues };
  } finally {
    client.release();
  }
}

module.exports = { verificarRecalculoDiff };

// Ejecución directa (node verificar_recalculo_diff.js) = prueba de solo
// lectura contra el caso ya conocido (RAIZ R6). No modifica ningún dato.
if (require.main === module) {
  (async () => {
    try {
      const reporte = await verificarRecalculoDiff({
        simulacionId: 'sim_mqsqu44b',
        numeroRonda: 6,
        tablaBackupRondas: 'backup_sim_rondas_pre_recalculo',
      });
      console.log('=== VERIFICAR RECALCULO DIFF — sim_mqsqu44b R6 ===\n');
      console.log('Idénticos:', JSON.stringify(reporte.identicos, null, 2));
      console.log('\nCon diferencias:', JSON.stringify(reporte.conDiferencias, null, 2));
      console.log('\nSolo en backup (antes):', JSON.stringify(reporte.soloEnAntes, null, 2));
      console.log('\nSolo en actual (después):', JSON.stringify(reporte.soloEnDespues, null, 2));
    } finally {
      await pool.end();
    }
  })().catch(e => { console.error('ERROR:', e.message); process.exitCode = 1; });
}
