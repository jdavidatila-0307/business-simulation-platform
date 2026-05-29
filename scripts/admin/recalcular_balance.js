/**
 * RECALCULAR BALANCE GENERAL — SimNego v3.2
 * Corrige para todas las rondas y todos los equipos:
 *   - capitalContable (Bs 680.000 fijo)
 *   - resultadoAcumuladoAnterior (suma correcta de rondas anteriores)
 *   - resultadoAcumulado (acumulado + utilidadNeta)
 *   - totalActivos (caja + cxc + inv + afNetos)
 *   - patrimonio (capital + acumulado + utilidad)
 *
 * Uso: node recalcular_balance.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const CAPITAL_CONTABLE = 680000;

async function main() {
  const sim = await pool.query(
    "SELECT id, nombre, users FROM simulaciones WHERE estado='activa' LIMIT 1"
  );
  const s = sim.rows[0];
  const equipos = (s.users || []).filter(e => !e.isBot);

  console.log(`\nSimulación: ${s.nombre}`);
  console.log(`Equipos: ${equipos.length}`);

  // Obtener todas las rondas ordenadas
  const rondas = await pool.query(
    "SELECT numero, resultados FROM sim_rondas WHERE simulacion_id=$1 ORDER BY numero",
    [s.id]
  );

  console.log(`Rondas: ${rondas.rows.length}\n`);

  // Acumulado por empresa — se va sumando ronda a ronda
  const acumuladoPorEmpresa = {};
  equipos.forEach(eq => { acumuladoPorEmpresa[eq.id] = 0; });

  let totalCorregidos = 0;

  for (const ronda of rondas.rows) {
    const n = ronda.numero;
    const resObj = ronda.resultados?.resultados || {};
    if (!Object.keys(resObj).length) { console.log(`R${n}: sin resultados`); continue; }

    // Agrupar por empresa
    const porEmpresa = {};
    Object.entries(resObj).forEach(([k, r]) => {
      const eqId = r.equipoOriginal || r.equipo;
      if (!porEmpresa[eqId]) porEmpresa[eqId] = [];
      porEmpresa[eqId].push({ k, r });
    });

    let corregidos = 0;
    for (const [eqId, prods] of Object.entries(porEmpresa)) {
      const p0 = prods[0].r; // campos de empresa del primer producto

      // Valores correctos
      const utilidadNeta     = prods.reduce((s,p) => s+(p.r.utilidadNeta||0), 0);
      const cajaFinal        = p0.cajaFinal        ?? 0;
      const cxcFinal         = p0.cxcFinal         ?? 0;
      const invFinal         = prods.reduce((s,p) => s+(p.r.invFinalValorizado||0), 0);
      const afNetos          = p0.afNetos           ?? 0;
      const deudaFinal       = p0.deudaFinal        ?? 0;

      const resAcumAnterior  = acumuladoPorEmpresa[eqId] ?? 0;
      const resAcum          = resAcumAnterior + utilidadNeta;
      const totalActivos     = cajaFinal + cxcFinal + invFinal + afNetos;
      const patrimonio       = CAPITAL_CONTABLE + resAcumAnterior + utilidadNeta;

      // Actualizar cada producto con los campos corregidos
      prods.forEach(({ k }) => {
        resObj[k].capitalContable               = CAPITAL_CONTABLE;
        resObj[k].resultadoAcumuladoAnterior    = resAcumAnterior;
        resObj[k].resultadoAcumulado            = resAcum;
        resObj[k].totalActivos                  = totalActivos;
        resObj[k].patrimonio                    = patrimonio;
      });

      // Actualizar acumulado para siguiente ronda
      acumuladoPorEmpresa[eqId] = resAcum;
      corregidos++;
    }

    // Guardar ronda corregida
    const nuevosResultados = { ...ronda.resultados, resultados: resObj };
    await pool.query(
      "UPDATE sim_rondas SET resultados=$1 WHERE simulacion_id=$2 AND numero=$3",
      [JSON.stringify(nuevosResultados), s.id, n]
    );

    totalCorregidos += corregidos;
    console.log(`R${n}: ${corregidos} empresas corregidas`);
  }

  console.log(`\n✅ Total corregidos: ${totalCorregidos} registros`);
  console.log('Balance General recalculado correctamente para todas las rondas');

  await pool.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
