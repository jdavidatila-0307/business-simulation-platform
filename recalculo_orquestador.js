/**
 * recalculo_orquestador.js — SimNego v3.2
 * Orquestador de recálculo de una SECUENCIA de rondas (desdeRonda..hastaRonda),
 * reutilizando recalcularUnaRonda (server.js, sin modificarlo) ronda por ronda,
 * encadenando el estado de salida de una ronda como entrada de la siguiente.
 *
 * DISEÑADO PARA DRY-RUN POR DEFECTO: no persiste nada a menos que se inyecte
 * explícitamente deps.persistir. Sin esa dependencia, cada ronda se recalcula
 * en memoria y se descarta; solo se acumula el reporte.
 *
 * USO:
 *   const { recalcularSecuencia } = require('./recalculo_orquestador');
 *   const reporte = await recalcularSecuencia(sim, { desdeRonda: 1, hastaRonda: 6 }, deps);
 *
 * `deps` (inyección de dependencias, todas requeridas salvo `persistir`):
 *   - equipos:  array de equipos de la simulación (misma forma que storage.getEquipos)
 *   - proveedores: array de proveedores (misma forma que sim.proveedores)
 *   - obtenerRonda(sim, n): devuelve la ronda n en la forma { decisiones, resultados, ... }
 *       (ya con decisiones YA CANONICALIZADAS por producto — mismo contrato que
 *       storage.getRonda). El orquestador NO valida ni corrige decisiones.
 *   - estadoFase0Map(sim): igual que server.js
 *   - estadoEmpresaInicialSeed(sim, equipos, fase0Map): igual que server.js
 *   - estadoEmpresaDesdeResultados(resultadosPrevios, estadoAnterior): igual que server.js
 *   - recalcularUnaRonda(args): igual que server.js — se le pasa tal cual
 *   - persistir(sim, n, payload): OPCIONAL. Si se omite, NO se persiste nada
 *       (dry-run real). Si se provee, se invoca con la misma forma de payload
 *       que server.js usa en storage.updateRonda (resultados, mercadoSegmentos,
 *       atractivoEquipos, dashboard, empresas, reportes, shock).
 *   - toleranciaDescuadre: number, default 1 (Bs) — mismo criterio que test_cuadre.js.
 *
 * El orquestador NUNCA importa ni requiere src/db.js, src/storage.js ni
 * server.js directamente — todo acceso a datos/persistencia se recibe vía
 * `deps`, así que puede ejecutarse íntegramente en memoria sin tocar BD.
 */
'use strict';

function verificarCuadreRonda(resultadosPorEquipo, toleranciaDescuadre) {
  const detalles = [];
  let maxDescuadre = 0;
  let ok = true;

  Object.entries(resultadosPorEquipo || {}).forEach(([key, r]) => {
    if (!r || typeof r !== 'object') return;
    const totalActivos = Number(r.totalActivos);
    const totalPasivos = Number(r.totalPasivos ?? r.deudaFinal ?? 0);
    const patrimonio = Number(r.patrimonio);
    if (!Number.isFinite(totalActivos) || !Number.isFinite(patrimonio)) return;

    const pasivoMasPatrimonio = (Number.isFinite(totalPasivos) ? totalPasivos : 0) + patrimonio;
    const descuadre = Math.abs(totalActivos - pasivoMasPatrimonio);
    maxDescuadre = Math.max(maxDescuadre, descuadre);
    if (descuadre > toleranciaDescuadre) ok = false;

    detalles.push({
      equipo: key,
      totalActivos,
      totalPasivos,
      patrimonio,
      descuadre: Number(descuadre.toFixed(4)),
    });
  });

  return { ok, maxDescuadre: Number(maxDescuadre.toFixed(4)), detalles };
}

async function recalcularSecuencia(sim, { desdeRonda, hastaRonda }, deps) {
  const {
    equipos,
    proveedores,
    obtenerRonda,
    estadoFase0Map,
    estadoEmpresaInicialSeed,
    estadoEmpresaDesdeResultados,
    recalcularUnaRonda,
    persistir = null, // dry-run por defecto: sin persistir, no se conecta nada real
    toleranciaDescuadre = 1,
  } = deps || {};

  if (!Number.isInteger(desdeRonda) || desdeRonda < 1) {
    throw new Error('desdeRonda debe ser un entero >= 1');
  }
  if (!Number.isInteger(hastaRonda) || hastaRonda < desdeRonda) {
    throw new Error('hastaRonda debe ser un entero >= desdeRonda');
  }
  for (const fn of ['obtenerRonda', 'estadoFase0Map', 'estadoEmpresaInicialSeed', 'estadoEmpresaDesdeResultados', 'recalcularUnaRonda']) {
    if (typeof deps?.[fn] !== 'function') {
      throw new Error(`deps.${fn} es obligatorio y debe ser una función`);
    }
  }

  const modoDryRun = typeof persistir !== 'function';

  const rondas = [];
  for (let n = desdeRonda; n <= hastaRonda; n++) {
    rondas.push(await obtenerRonda(sim, n));
  }
  const rondasConNumero = rondas.map((ronda, idx) => ({ ronda, numero: desdeRonda + idx }));

  const fase0Map = await estadoFase0Map(sim);
  let estadoEmpresa = estadoEmpresaInicialSeed(sim, equipos, fase0Map);
  let nuevoResObjAnterior = {};

  // Si desdeRonda > 1, el estado inicial debe derivarse de la ronda anterior
  // YA PERSISTIDA (fuera del rango recalculado) — se lee vía obtenerRonda(n-1)
  // y se usa su resultado tal cual (read-only, no se recalcula esa ronda).
  if (desdeRonda > 1) {
    const rondaPrevia = await obtenerRonda(sim, desdeRonda - 1);
    const resPrev = rondaPrevia?.resultados?.resultados || rondaPrevia?.resultados || {};
    if (Object.keys(resPrev).length) {
      estadoEmpresa = estadoEmpresaDesdeResultados(resPrev, estadoEmpresa);
      nuevoResObjAnterior = resPrev;
    }
  }

  const reportePorRonda = [];
  let todoOk = true;

  for (const { ronda, numero } of rondasConNumero) {
    if (!ronda) {
      reportePorRonda.push({ ronda: numero, ok: false, error: 'Ronda inexistente (obtenerRonda devolvió null/undefined)' });
      todoOk = false;
      continue;
    }
    if (!ronda.decisiones || !Object.keys(ronda.decisiones).length) {
      reportePorRonda.push({ ronda: numero, ok: false, error: 'Ronda sin decisiones' });
      todoOk = false;
      continue;
    }

    try {
      const { nuevoResObj, reportes, shockRonda, resultado } = recalcularUnaRonda({
        sim, equipos, proveedores, rondas: rondasConNumero.map(r => r.ronda),
        ronda, n: numero,
        estadoEmpresa,
        nuevoResObjAnterior,
      });

      const cuadre = verificarCuadreRonda(nuevoResObj, toleranciaDescuadre);

      reportePorRonda.push({
        ronda: numero,
        ok: cuadre.ok,
        maxDescuadre: cuadre.maxDescuadre,
        equiposCalculados: Object.keys(nuevoResObj).length,
        detalleCuadre: cuadre.detalles,
        persistido: false, // se corrige abajo si se llamó a persistir()
      });
      if (!cuadre.ok) todoOk = false;

      if (typeof persistir === 'function') {
        await persistir(sim, numero, {
          resultados:       nuevoResObj,
          mercadoSegmentos: resultado.mercadoSegmentos,
          atractivoEquipos: resultado.atractivoEquipos,
          dashboard:        resultado.dashboard,
          empresas:         resultado.empresas,
          reportes,
          shock:            shockRonda,
        });
        reportePorRonda[reportePorRonda.length - 1].persistido = true;
      }

      // Encadenar hacia la ronda siguiente DENTRO de esta misma corrida,
      // sin volver a leer de obtenerRonda (esto es lo que permite dry-run:
      // el estado fluye en memoria, nunca se relee de storage).
      estadoEmpresa = resultado.estadoEmpresaActualizado;
      nuevoResObjAnterior = nuevoResObj;
    } catch (e) {
      reportePorRonda.push({ ronda: numero, ok: false, error: e.message });
      todoOk = false;
    }
  }

  return {
    simId: sim?.id,
    desdeRonda,
    hastaRonda,
    modoDryRun,
    ok: todoOk,
    toleranciaDescuadre,
    rondas: reportePorRonda,
  };
}

module.exports = { recalcularSecuencia, verificarCuadreRonda };
