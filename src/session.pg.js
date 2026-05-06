/**
 * src/session.pg.js
 * Sesiones persistentes en PostgreSQL.
 *
 * Reemplaza el Map en memoria para que las sesiones sobrevivan reinicios
 * y funcionen mejor en despliegues como Render/Supabase.
 */
const crypto = require('crypto');
const { Pool } = require('pg');

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 8);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let initialized = false;

async function init() {
  if (initialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sesiones (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      rol TEXT NOT NULL,
      simulacion_id TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sesiones_expires_at
    ON sesiones (expires_at)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sesiones_user_id
    ON sesiones (user_id)
  `);

  initialized = true;
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function createSession(userId, rol, simulacionId = null) {
  await init();

  const token = newToken();

  await pool.query(
    `INSERT INTO sesiones (token, user_id, rol, simulacion_id, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' hours')::INTERVAL)`,
    [token, String(userId), String(rol), simulacionId, SESSION_TTL_HOURS]
  );

  return token;
}

async function getSession(token) {
  await init();

  if (!token) return null;

  const res = await pool.query(
    `SELECT token, user_id, rol, simulacion_id, created_at, expires_at
     FROM sesiones
     WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );

  const row = res.rows[0];
  if (!row) return null;

  return {
    token: row.token,
    userId: row.user_id,
    rol: row.rol,
    simulacionId: row.simulacion_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  };
}

async function updateSessionSimulation(token, simulacionId) {
  await init();

  if (!token) return false;

  const res = await pool.query(
    `UPDATE sesiones
     SET simulacion_id = $2
     WHERE token = $1 AND expires_at > NOW()`,
    [token, simulacionId]
  );

  return res.rowCount > 0;
}

async function destroySession(token) {
  await init();

  if (!token) return false;

  const res = await pool.query(
    `DELETE FROM sesiones WHERE token = $1`,
    [token]
  );

  return res.rowCount > 0;
}

async function cleanupExpiredSessions() {
  await init();

  const res = await pool.query(
    `DELETE FROM sesiones WHERE expires_at <= NOW()`
  );

  return res.rowCount;
}

module.exports = {
  createSession,
  getSession,
  updateSessionSimulation,
  destroySession,
  cleanupExpiredSessions
};
