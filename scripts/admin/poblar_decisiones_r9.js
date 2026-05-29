/**
 * Poblar decisiones R9 con estado financiero de R8
 * Los campos comerciales quedan en cero (blanco para el equipo)
 * Solo se propagan: caja, deuda, activos, vendedores, operarios, brandEquity
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const sim = await pool.query("SELECT id, users, parametros FROM simulaciones WHERE estado='activa' LIMIT 1");
  const { id: simId, users: equipos, parametros: params } = sim.rows[0];

  // Obtener resultados R8
  const r8 = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=8", [simId]
  );
  const res8raw = r8.rows[0]?.resultados || {};
  const res8 = res8raw.resultados || res8raw;

  // Obtener ronda 9
  const r9q = await pool.query(
    "SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=9", [simId]
  );
  const r9 = r9q.rows[0]?.resultados || {};

  const decisiones = { ...r9.decisiones };
  let poblados = 0;

  for (const eq of equipos.filter(e => !e.isBot)) {
    // Buscar resultado R8 del equipo
    const resPrev = Object.values(res8).find(r =>
      r.equipoOriginal === eq.id || r.equipo === eq.id || (r.equipo||'').startsWith(eq.id)
    );

    // Decisión en blanco (campos comerciales = 0)
    const dec = {
      equipo:          eq.id,
      equipoNombre:    eq.nombre,
      submitted:       false,
      submittedAt:     null,
      producto:        '',
      segmentoObjetivo:'',
      precioVenta:     0,
      produccion:      0,
      calidad:         5,
      canalPrincipal:  '',
      publicidad:      0,
      promocion:       0,
      eventos:         0,
      marketingRedes:  0,
      relacionesPublicas: 0,
      contratarVendedores: 0,
      despedirVendedores:  0,
      contratarOperarios:  0,
      despedirOperarios:   0,
      montoCapacitacion:   0,
      montoPrestamo:   0,
      tipoPrestamo:    'Ninguno',
      amortizacion:    0,
      tipoInvestigacion: 'No',
      // Campos financieros de continuidad
      cajaInicial:           Math.max(0, resPrev?.cajaFinal     ?? params.cajaInicial   ?? 600000),
      cxcInicial:            Math.max(0, resPrev?.cxcFinal      ?? 0),
      deudaInicial:          Math.max(0, resPrev?.deudaFinal    ?? 0),
      activosFijosIniciales: Math.max(0, resPrev?.afNetos ?? resPrev?.activosFijosNetos ?? 80000),
      brandEquityInicial:    resPrev?.brandEquityFinal ?? 50,
      vendedoresIniciales:   Math.max(1, resPrev?.vendedoresFinales ?? 2),
      operariosIniciales:    Math.max(1, resPrev?.operariosFinales  ?? 4),
      inventarioInicial:     0,
      resultadoAcumuladoAnterior: resPrev?.resultadoAcumulado ?? 0,
      capitalContable: 680000,
    };

    decisiones[eq.id] = dec;
    poblados++;

    console.log(`  ✅ ${eq.nombre}`);
    console.log(`     caja:       Bs ${Math.round(dec.cajaInicial).toLocaleString()}`);
    console.log(`     deuda:      Bs ${Math.round(dec.deudaInicial).toLocaleString()}`);
    console.log(`     activos:    Bs ${Math.round(dec.activosFijosIniciales).toLocaleString()}`);
    console.log(`     vendedores: ${dec.vendedoresIniciales}`);
    console.log(`     operarios:  ${dec.operariosIniciales}`);
  }

  // Guardar en sim_rondas
  const nuevosResultados = { ...r9, decisiones };
  await pool.query(
    "UPDATE sim_rondas SET resultados=$1 WHERE simulacion_id=$2 AND numero=9",
    [JSON.stringify(nuevosResultados), simId]
  );

  console.log(`\n✅ ${poblados} decisiones pobladas en Ronda 9`);
  console.log('Los equipos pueden llenar la hoja — los datos financieros están listos');
  await pool.end();
}
main().catch(e => console.error('ERROR:', e.message));
