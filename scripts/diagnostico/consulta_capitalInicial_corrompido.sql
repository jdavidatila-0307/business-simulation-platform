-- consulta_capitalInicial_corrompido.sql — SOLO LECTURA.
-- Para sim_mqsqu44b (D12026), 6 equipos, rondas 2-7:
-- compara sim_decisiones.decisiones->>'capitalInicial' contra el
-- capital_total_otorgado real de sim_fase0 para ese equipo.
-- Marca como corrompido: capitalInicial IS NULL, = '2', o distinto del
-- capital_total_otorgado real (más allá de una tolerancia de 1 Bs).
--
-- Ejecutar en el SQL Editor de Supabase (proyecto D12026). No modifica nada.

SELECT
  d.equipo_id,
  d.numero AS ronda,
  (d.decisiones ->> 'capitalInicial')::numeric AS capital_inicial_decision,
  (d.decisiones ->> 'capitalContable')::numeric AS capital_contable_decision,
  f.capital_total_otorgado AS capital_real_fase0,
  CASE
    WHEN (d.decisiones ->> 'capitalInicial') IS NULL THEN 'NULL'
    WHEN (d.decisiones ->> 'capitalInicial')::numeric = 2 THEN 'VALOR=2'
    WHEN ABS((d.decisiones ->> 'capitalInicial')::numeric - f.capital_total_otorgado) > 1 THEN 'DISTINTO_DE_FASE0'
    ELSE 'OK'
  END AS estado_capital_inicial
FROM sim_decisiones d
JOIN sim_fase0 f
  ON f.simulacion_id = d.simulacion_id
 AND f.equipo_id = d.equipo_id
WHERE d.simulacion_id = 'sim_mqsqu44b'
  AND d.numero BETWEEN 2 AND 7
  AND d.equipo_id IN (
    'eq_mqsqu44b_ortho_step_mqsreju3',
    'eq_mqsqu44b_raiz_mqsrj8en',
    'eq_mqsqu44b_levita_mqsrf0k2',
    'eq_mqsqu44b_growstep_kids_mqsrf302',
    'eq_mqsqu44b_biopaso_mqsrga5h',
    'eq_mqsqu44b_teacompaa_mqsrkhba'
  )
ORDER BY d.equipo_id, d.numero;
