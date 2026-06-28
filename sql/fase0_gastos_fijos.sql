-- ============================================================================
-- Migración PROPUESTA — FASE 1A (NO EJECUTADA / NO APLICAR todavía)
-- Gastos fijos explícitos por equipo en modo Fase 0.
--
-- Decisiones aprobadas:
--   * En modoInicio='fase0' los gastos fijos NO vienen de sim.parametros.
--   * 3 campos por equipo, capturados por admin.
--   * Los 3 son OBLIGATORIOS para cerrar/calcular Fase 0 (validado en aplicación).
--   * Valor 0 explícito es válido; NULL/ausente bloquea (en aplicación).
--
-- Notas de esta migración:
--   * Sin DEFAULT (ni 1 ni 0): evita valores implícitos.
--   * NULL permitido a nivel de columna por COMPATIBILIDAD con filas existentes.
--   * La obligatoriedad se valida en el backend (no como NOT NULL/CHECK todavía).
--     Una migración posterior podrá endurecer a NOT NULL una vez backfilleados
--     los registros históricos.
--   * sim_fase0 es una tabla COLUMNAR (ver src/storage.js FASE0_COLS / upsertFase0).
-- ============================================================================

ALTER TABLE sim_fase0
  ADD COLUMN IF NOT EXISTS gasto_admin_fijo_fase0 numeric NULL;

ALTER TABLE sim_fase0
  ADD COLUMN IF NOT EXISTS gasto_fijo_planta_fase0 numeric NULL;

ALTER TABLE sim_fase0
  ADD COLUMN IF NOT EXISTS sueldos_administrativos_fijos_fase0 numeric NULL;

-- Rollback (si se requiere revertir):
-- ALTER TABLE sim_fase0 DROP COLUMN IF EXISTS gasto_admin_fijo_fase0;
-- ALTER TABLE sim_fase0 DROP COLUMN IF EXISTS gasto_fijo_planta_fase0;
-- ALTER TABLE sim_fase0 DROP COLUMN IF EXISTS sueldos_administrativos_fijos_fase0;
