// diag_shock_params.js — SOLO LECTURA (Protocolo 4)
// Imprime los campos de shock en sim.parametros de sim_mpsbffzs.
// NO modifica nada en la BD (solo SELECT).
'use strict';
const { Pool } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SIM_ID = process.argv[2] || 'sim_mpsbffzs';
const CLAVES_SHOCK = ['shockPctBoom', 'shockPctCrisis', 'shockFactores', 'probabilidadShock'];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL no está definida. Ejecuta con la URL en el entorno.');
    process.exit(1);
  }
  try {
    // SELECT de solo lectura
    const { rows } = await pool.query(
      'SELECT id, nombre, parametros, segmentos FROM simulaciones WHERE id = $1',
      [SIM_ID]
    );
    if (!rows.length) {
      console.error(`❌ No existe simulación con id ${SIM_ID}`);
      process.exit(1);
    }
    const sim = rows[0];
    // parametros puede venir como objeto (JSONB) o string
    const p = typeof sim.parametros === 'string' ? JSON.parse(sim.parametros) : (sim.parametros || {});

    console.log(`\n📋 Simulación: ${sim.nombre} (${sim.id})`);
    console.log(`   Total de claves en parametros: ${Object.keys(p).length}\n`);

    console.log('🎲 Campos de shock buscados:');
    CLAVES_SHOCK.forEach(k => {
      const existe = Object.prototype.hasOwnProperty.call(p, k);
      const val = existe ? JSON.stringify(p[k]) : '(ausente)';
      console.log(`   ${existe ? '✅' : '❌'} ${k} = ${val}`);
    });

    // Cualquier otra clave que contenga 'shock' (case-insensitive)
    const otras = Object.keys(p).filter(k => /shock/i.test(k) && !CLAVES_SHOCK.includes(k));
    console.log('\n🔎 Otras claves con "shock":');
    if (otras.length) otras.forEach(k => console.log(`   • ${k} = ${JSON.stringify(p[k])}`));
    else console.log('   (ninguna)');

    // ── sim.segmentos[0] — verificar propagación del fix SEG0 (commit a180fd4) ──
    const segs = typeof sim.segmentos === 'string' ? JSON.parse(sim.segmentos) : (sim.segmentos || []);
    console.log('\n📦 sim.segmentos[0] en BD (¿se propagó el fix SEG0?):');
    if (!segs.length) {
      console.log('   ⚠ sim.segmentos está vacío o ausente.');
    } else {
      const s0 = segs[0];
      console.log(`   nombre:        ${s0.nombre}`);
      console.log(`   demandaBase:   ${s0.demandaBase}   ${s0.demandaBase === 30000 ? '✅ propagado (30k)' : '❌ NO propagado (esperado 30000 tras a180fd4)'}`);
      console.log(`   indiceExterno: ${s0.indiceExterno}   ${s0.indiceExterno === 14.28 ? '✅ propagado (14.28)' : '❌ NO propagado (esperado 14.28 tras a180fd4)'}`);
    }

    console.log('\n✅ Diagnóstico de solo lectura completado. BD no modificada.');
  } catch (e) {
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
