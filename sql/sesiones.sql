-- Tabla para sesiones persistentes en PostgreSQL
-- Este script es opcional: session.pg.js crea la tabla automáticamente.
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  rol TEXT NOT NULL,
  simulacion_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sesiones_expires_at ON sesiones (expires_at);
CREATE INDEX IF NOT EXISTS idx_sesiones_user_id ON sesiones (user_id);
