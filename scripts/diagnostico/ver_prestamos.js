process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  console.log('\n══════════════════════════════════════════');
  console.log('  DIAGNÓSTICO PRÉSTAMOS Y CRÉDITOS');
  console.log('══════════════════════════════════════════\n');

  // 1. Decisiones — ver campo préstamo
  console.log('── DECISIONES (campo préstamo) ─────────');
  const decs = await pool.query(
    'SELECT equipo_id, ronda_numero, decisiones FROM sim_decisiones ORDER BY ronda_numero, equipo_id'
  );
  decs.rows.forEach(d => {
    const dec = d.decisiones || {};
    const prestamo = dec.tipoPrestamo || dec.montoPrestamo || dec.prestamo || dec.financiamiento;
    console.log(`\n  Equipo: ${d.equipo_id?.slice(0,25)} | Ronda ${d.ronda_numero}`);
    console.log(`    tipoPrestamo:   ${dec.tipoPrestamo  ?? '(vacío)'}`);
    console.log(`    montoPrestamo:  ${dec.montoPrestamo ?? '(vacío)'}`);
    console.log(`    prestamo:       ${dec.prestamo      ?? '(vacío)'}`);
    console.log(`    financiamiento: ${dec.financiamiento?? '(vacío)'}`);
    console.log(`    DECISION COMPLETA:`);
    // Mostrar todas las claves de la decisión
    Object.entries(dec).forEach(([k,v]) => {
      if (typeof v !== 'object') console.log(`      ${k}: ${v}`);
    });
  });

  // 2. Resultados — ver ingresoPrestamo y deudaFinal
  console.log('\n── RESULTADOS (préstamos y deuda) ──────');
  const ronda = await pool.query(
    'SELECT resultados FROM sim_rondas ORDER BY creada_at DESC LIMIT 1'
  );
  const res = ronda.rows[0]?.resultados?.resultados || {};
  Object.values(res).forEach(eq => {
    console.log(`\n  Equipo: ${eq.equipoNombre || eq.equipo}`);
    console.log(`    ingresoPrestamo:    Bs ${eq.ingresoPrestamo    ?? 'N/A'}`);
    console.log(`    deudaFinal:         Bs ${eq.deudaFinal         ?? 'N/A'}`);
    console.log(`    sobregiro:          Bs ${eq.sobregiro           ?? 'N/A'}`);
    console.log(`    interesesPrestamo:  Bs ${eq.interesesPrestamo  ?? 'N/A'}`);
    console.log(`    comisionApertura:   Bs ${eq.comisionApertura   ?? 'N/A'}`);
    console.log(`    cajaFinal:          Bs ${eq.cajaFinal          ?? 'N/A'}`);
  });

  await pool.end();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
