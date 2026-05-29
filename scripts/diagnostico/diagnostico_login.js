/**
 * diagnostico_login.js — verificar y reparar passwords de equipos ABC
 */
'use strict';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const crypto   = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized:false, ca:null, checkServerIdentity:()=>undefined } });

function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h    = crypto.pbkdf2Sync(pwd, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${h}`;
}
function verifyPassword(pwd, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.pbkdf2Sync(pwd, salt, 100000, 64, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash,'hex'), Buffer.from(attempt,'hex'));
}

async function main() {
  const sim = await pool.query(
    `SELECT id, nombre, users FROM simulaciones WHERE nombre='ABC' ORDER BY creada_at DESC LIMIT 1`
  );
  if (!sim.rows.length) { console.error('❌ Sin simulación ABC'); await pool.end(); return; }

  const { id: simId, nombre, users } = sim.rows[0];
  const equipos = (users||[]).filter(u=>u.rol==='equipo');
  console.log(`\nSim: ${nombre} (${simId}) — ${equipos.length} equipos\n`);

  console.log(`${'Equipo'.padEnd(6)} ${'password'.padEnd(12)} ${'formato'.padEnd(22)} ${'verifica 1234'}`);
  console.log('─'.repeat(60));

  let necesitaReparar = false;
  for (const eq of equipos) {
    const pwd   = eq.password || eq.password_hash || '';
    const partes = pwd.split(':');
    const formato = partes.length === 2 ? `✅ salt:hash (${pwd.length}c)` : `❌ inválido: "${pwd.slice(0,30)}"`;
    let verifica = '—';
    if (partes.length === 2) {
      try { verifica = verifyPassword('1234', pwd) ? '✅' : '❌'; }
      catch(e) { verifica = `❌ ${e.message.slice(0,30)}`; }
    } else {
      necesitaReparar = true;
    }
    console.log(`${eq.nombre.padEnd(6)} ${'password'.padEnd(12)} ${formato.padEnd(20)} ${verifica}`);
  }

  if (necesitaReparar) {
    console.log('\n⚠️  Passwords con formato inválido — reparando...');
    const nuevosEquipos = equipos.map(eq => {
      const pwd = eq.password || eq.password_hash || '';
      const necesita = pwd.split(':').length !== 2;
      return { ...eq, password: necesita ? hashPassword('1234') : pwd };
    });
    const todosUsers = (users||[]).map(u =>
      u.rol === 'equipo' ? (nuevosEquipos.find(e=>e.id===u.id) || u) : u
    );
    await pool.query(
      `UPDATE simulaciones SET users=$1::jsonb WHERE id=$2`,
      [JSON.stringify(todosUsers), simId]
    );
    console.log('✅ Passwords reparados — intenta login nuevamente con contraseña: 1234\n');
  } else {
    console.log('\n✅ Todos los passwords tienen formato correcto.\n');
    console.log('Si el login falla, verifica:');
    console.log('  - Nombre de equipo exacto (A, B, C...)');
    console.log('  - Código simulador: ABC-2026');
    console.log('  - Contraseña: 1234');
  }

  await pool.end();
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
