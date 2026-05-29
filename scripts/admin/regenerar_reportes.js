/**
 * REGENERAR REPORTES DE INVESTIGACIÓN — SimNego COM540
 * Recalcula los reportes de todas las rondas usando reports.js actualizado
 *
 * Ejecutar:
 *   set "DATABASE_URL=postgresql://..."
 *   node regenerar_reportes.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool }   = require('pg');
const fs         = require('fs');
const path       = require('path');
const pool       = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Cargar reports.js y engine utils
const { generarReporteBasico, generarReportePremium, generarReporteEstrategico } = require('./src/reports');

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  REGENERAR REPORTES — SimNego COM540');
  console.log('══════════════════════════════════════════\n');

  // 1. Cargar simulación activa
  const sims = await pool.query("SELECT * FROM simulaciones WHERE estado='activa' LIMIT 1");
  if (!sims.rows.length) { console.log('Sin simulación activa'); return; }
  const sim = sims.rows[0];
  console.log(`Simulación: ${sim.nombre} (${sim.id})`);

  // 2. Cargar industria/params
  const industriaNombre = sim.config?.industria;
  const industriaPath   = path.join(__dirname, 'industrias', industriaNombre + '.json');
  if (!fs.existsSync(industriaPath)) {
    console.error(`❌ Industria no encontrada: ${industriaPath}`);
    return;
  }
  const simCfg = JSON.parse(fs.readFileSync(industriaPath, 'utf8'));
  console.log(`Industria: ${industriaNombre}`);

  // 3. Procesar cada ronda
  const rondas = await pool.query(
    "SELECT * FROM sim_rondas WHERE simulacion_id=$1 ORDER BY numero",
    [sim.id]
  );
  console.log(`\nRondas a procesar: ${rondas.rows.length}\n`);

  for (const ronda of rondas.rows) {
    console.log(`── Ronda ${ronda.numero} ──────────────────────────`);
    const res = ronda.resultados || {};
    const reportes = res.reportes || {};
    const decisiones = res.decisiones || {};
    const resultadosRonda = res.resultados || {};

    // Cargar ronda anterior para elasticidad
    const nAnt = ronda.numero - 1;
    const resAnt = nAnt > 0
      ? await pool.query("SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=$2", [sim.id, nAnt])
      : null;
    const resultadosAnt = resAnt?.rows[0]?.resultados?.resultados || {};

    // Calcular mercadoSegmentos (simplificado — usar datos guardados si existen)
    const mercadoSegmentos = res.mercadoSegmentos || simCfg.segmentos.map(s => ({
      nombre:        s.nombre,
      demandaBase:   s.demandaBase,
      demandaFormal: Math.round(s.demandaBase * (1 - (s.pctContrabando||0))),
      tendencia:     s.tendencia || 'Estable',
      pctContrabando: s.pctContrabando || 0,
    }));

    let regenerados = 0;
    let sinInvestigacion = 0;

    // Procesar cada equipo
    for (const [eqId, rep] of Object.entries(reportes)) {
      const tipoAnterior = rep.investigacion?.tipo;
      if (!tipoAnterior) { sinInvestigacion++; continue; }

      // Buscar decisión del equipo para saber qué tipo compró
      const dec = decisiones[eqId] || {};
      const tipoInv = dec.tipoInvestigacion || tipoAnterior;

      // Regenerar con reports.js actualizado
      let nuevoReporte;
      if (tipoInv === 'Básica' || tipoAnterior === 'Básico') {
        nuevoReporte = generarReporteBasico(mercadoSegmentos, resultadosRonda, simCfg.segmentos);
      } else if (tipoInv === 'Premium' || tipoAnterior === 'Premium') {
        nuevoReporte = generarReportePremium(mercadoSegmentos, resultadosRonda, simCfg.segmentos, []);
      } else if (tipoInv === 'Estratégico' || tipoAnterior === 'Estratégico') {
        nuevoReporte = generarReporteEstrategico(mercadoSegmentos, resultadosRonda, simCfg.segmentos, [], resultadosAnt);
      }

      if (nuevoReporte) {
        reportes[eqId] = { ...rep, investigacion: nuevoReporte };
        regenerados++;
        console.log(`  ✅ ${eqId.slice(-20)}: ${tipoAnterior} → regenerado`);
      }
    }

    if (sinInvestigacion > 0) {
      console.log(`  ℹ  ${sinInvestigacion} equipo(s) sin investigación — sin cambios`);
    }

    if (regenerados > 0) {
      // Guardar de vuelta en la BD
      const nuevosResultados = { ...res, reportes };
      await pool.query(
        "UPDATE sim_rondas SET resultados=$1 WHERE simulacion_id=$2 AND numero=$3",
        [JSON.stringify(nuevosResultados), sim.id, ronda.numero]
      );
      console.log(`  💾 Ronda ${ronda.numero} guardada — ${regenerados} reporte(s) regenerado(s)`);
    } else {
      console.log(`  ⏭  Ronda ${ronda.numero} sin cambios`);
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log('✅ Regeneración completada');
  console.log('══════════════════════════════════════════\n');
  await pool.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
