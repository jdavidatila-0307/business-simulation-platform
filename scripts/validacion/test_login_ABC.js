/**
 * test_login_ABC.js — replica exactamente el flujo de /auth/login
 * para equipos de la sim ABC
 */
'use strict';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const crypto   = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized:false, ca:null, checkServerIdentity:()=>undefined } });

// ── Misma función que src/auth.js ──────────────────────────────────────────
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string')
    throw new Error(`password_hash ausente o inválido: "${stored}"`);
  const parts = stored.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1])
    throw new Error(`Formato de hash inválido (partes: ${parts.length}) valor: "${stored?.slice(0,40)}"`);
  const [salt, hash] = parts;
  const attempt = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  const hashBuf = Buffer.from(hash,    'hex');
  const attBuf  = Buffer.from(attempt, 'hex');
  if (hashBuf.length !== attBuf.length)
    throw new Error(`Buffer mismatch: stored=${hashBuf.length}B computed=${attBuf.length}B`);
  return crypto.timingSafeEqual(hashBuf, attBuf);
}

// ── Replica storage.findEquipoByNombre ────────────────────────────────────
async function findEquipoByNombre(nombre) {
  const nombreLower = nombre.toLowerCase().trim();
  const sims = await pool.query('SELECT * FROM simulaciones ORDER BY creada_at DESC');
  for (const sim of sims.rows) {
    const users = sim.users || [];
    const equipo = users.find(u => u.nombre && u.nombre.toLowerCase() === nombreLower);
    if (equipo) return { equipo, simulacionId: sim.id, sim };
  }
  return null;
}

async function main() {
  const EQUIPO_TEST   = 'A';
  const PASSWORD_TEST = '1234';
  const CODIGO_TEST   = 'ABC-2026';

  console.log('\n── TEST LOGIN EQUIPO ABC ─────────────────────────────────');
  console.log(`  Equipo: ${EQUIPO_TEST} | Pwd: ${PASSWORD_TEST} | Código: ${CODIGO_TEST}\n`);

  // PASO 1: findEquipoByNombre
  console.log('PASO 1: findEquipoByNombre...');
  let found;
  try {
    found = await findEquipoByNombre(EQUIPO_TEST);
  } catch(e) {
    console.error(`  ❌ ERROR en findEquipoByNombre: ${e.message}`);
    await pool.end(); return;
  }

  if (!found) {
    console.error(`  ❌ Equipo "${EQUIPO_TEST}" no encontrado en ninguna sim`);
    await pool.end(); return;
  }
  console.log(`  ✅ Encontrado en sim: ${found.sim.nombre} (${found.simulacionId})`);
  console.log(`     equipo.id: ${found.equipo.id}`);
  console.log(`     equipo.nombre: ${found.equipo.nombre}`);
  console.log(`     equipo.rol: ${found.equipo.rol}`);
  const pwdField = found.equipo.password || found.equipo.password_hash;
  console.log(`     password field: "${pwdField?.slice(0,40)}..." (${pwdField?.length} chars)`);

  // PASO 2: código acceso
  console.log('\nPASO 2: Validar código acceso...');
  const codigoRequerido = found.sim?.codigo_acceso;
  console.log(`  Requerido: "${codigoRequerido}" | Ingresado: "${CODIGO_TEST}"`);
  if (codigoRequerido && CODIGO_TEST.toUpperCase() !== codigoRequerido.trim().toUpperCase()) {
    console.error('  ❌ Código incorrecto'); await pool.end(); return;
  }
  console.log('  ✅ Código correcto');

  // PASO 3: construir user object (igual que server.js)
  const user = {
    id:            found.equipo.id,
    nombre:        found.equipo.nombre,
    rol:           'equipo',
    password_hash: found.equipo.password,  // server.js lee .password
  };
  console.log(`\nPASO 3: user.password_hash = "${user.password_hash?.slice(0,40)}..."`);

  if (!user.password_hash) {
    console.error('  ❌ password_hash es NULL → causa del 500');
    await pool.end(); return;
  }

  // PASO 4: verifyPassword
  console.log('\nPASO 4: verifyPassword...');
  try {
    const ok = verifyPassword(PASSWORD_TEST, user.password_hash);
    console.log(`  ${ok ? '✅ Contraseña correcta' : '❌ Contraseña incorrecta'}`);
  } catch(e) {
    console.error(`  ❌ EXCEPCIÓN en verifyPassword → causa del 500:`);
    console.error(`     ${e.message}`);
  }

  // PASO 5: verificar sesiones table
  console.log('\nPASO 5: Tabla sesiones accesible...');
  try {
    await pool.query('SELECT 1 FROM sesiones LIMIT 1');
    console.log('  ✅ Tabla sesiones OK');
  } catch(e) {
    console.error(`  ❌ Error en tabla sesiones: ${e.message}`);
  }

  console.log('\n─────────────────────────────────────────────────────────\n');
  await pool.end();
}

main().catch(async e => {
  console.error('Error fatal:', e.message);
  try { await pool.end(); } catch {}
});
