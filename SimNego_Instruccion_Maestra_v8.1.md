# Instrucción Maestra — SimNego v3.2

**Versión 8.1 — 22/06/2026**

**Estado de sesión:** Referencias/Ayudas de Fase 0 A–G completadas, validadas y pusheadas. Se agregan pendientes formales para revisión de Hoja de Decisión R1–R20, actualización del Manual del Estudiante y preparación del Manual del Profesor.

## Alcance y control

SimNego v3.2 es el simulador de negocios usado para UAGRM Ingeniería Comercial COM540.

La simulación real activa/intocable es `sim_mqmb4bvo`. No debe tocarse sin autorización expresa.

## Referencias/Ayudas Fase 0 — Estado v8.1

**Estado: COMPLETO.**

Último commit del bloque: `f87a93f`.

Push: `fd07a00..f87a93f main -> main`.

Cache-busting final: `equipo-fase0.js?v=2.3`.

### Validaciones

- `verificar_app.js` → 41 OK · 0 ERRORES.
- `verificar_endpoints.js` → 65 endpoints presentes.

### Alcance

Las ayudas de Fase 0 fueron completadas para orientar al estudiante antes de iniciar R1, sin modificar motor, BD ni simulación real.

### Bloque A — Estrategia inicial

- Se eliminó el aviso falso “Se bloquea durante R1–R4”.
- Se agregaron ayudas para Segmento objetivo y Producto inicial.
- No se implementó bloqueo real.
- Commit: `228f4c8`.

### Bloque B — Nivel de planta

- Se hicieron visibles los operarios mínimos por nivel de planta.
- Se aclaró la relación entre capacidad técnica y personal contratado.
- Operarios mínimos: Micro 2; Pequeña 3; Estándar 3; Mediana 5; Grande 6; Expansiva 7.
- Commit: `491c799`.

### Bloque C — Costos fijos y personal administrativo

- Se aclaró el costo fijo propio del equipo.
- Se mostró el mínimo docente.
- Se expuso `sueldosAdministrativosFijos` en Fase 0 como referencia read-only.
- No se expusieron todos los parámetros globales.
- Commit: `a02a083`.

### Bloque D — Activos complementarios

- Se aclaró que los activos complementarios no generan beneficio general automático.
- Vehículos 0–3 se explican como niveles de inversión, no como cantidad física.
- Vehículos se asocian a canales logísticos; muebles a Tienda Propia; equipos de cómputo a Venta Digital; y patentes a innovación de Proceso.
- Commit: `00a5127`.

### Bloque E — Personal productivo y comercial

- Se diferenció personal productivo y personal comercial.
- Se cambió el texto visible a “Sueldo por operario”.
- El campo técnico `costo_operario` permanece intacto.
- Se explicaron operarios iniciales, sueldo por operario, vendedores iniciales y sueldo por vendedor.
- Commit: `e01346d`.

### Bloque F — Financiamiento Pre-R1

- Se aclaró la diferencia entre capital/aportes, crédito, deuda, caja e intereses.
- Se explicó que el capital fortalece caja y patrimonio sin deuda; el préstamo aumenta caja y deuda; y el interés es costo financiero.
- No se crearon campos nuevos.
- Commit: `8664fb8`.

### Bloque G — Lead time y capacidad operativa

- Se explicó la instalación de maquinaria.
- Se aclaró que R1 puede quedar bloqueada por lead time en modo Fase 0.
- Se explicó que la capacidad no se pierde y queda disponible para rondas posteriores.
- Se explicó que la producción efectiva depende de operarios suficientes y el concepto de capacidad ociosa.
- Commit: `f87a93f`.

> Las ayudas A–G son pedagógicas y no cambian reglas del motor. No se tocó `engine.js`, BD ni simulación real.

## Pendientes priorizados

### 🔴 INMEDIATO — Riesgos técnicos pendientes

1. **H-01 — Parámetros globales mutables durante simulación activa.** Severidad: crítica. Requiere bloquear, versionar o advertir cambios de parámetros por ronda/simulación.
2. **H-03 — Costo fijo declarado capturado/persistido, pero sin confirmación económica completa en `engine.js`.** Severidad: alta. No extender promesas pedagógicas sobre efecto económico hasta confirmar conexión real con el motor.
3. **H-04 — `intDeuda` duplicado en `sinDecision`.** Severidad: alta. Requiere prueba pura de caja/deuda antes de tocar motor.
4. **H-09 — Árbol Git sucio.** Severidad: alta operativa. Clasificar borrados, backups, binarios y archivos no rastreados antes de cambios financieros.

### 🔴 SIGUIENTE — Revisión pedagógica de Hoja de Decisión R1–R20

**Objetivo:** Auditar y mejorar las referencias/ayudas de la Hoja de Decisión desde R1 hasta R20, asegurando que cada variable tenga una explicación clara, útil y fiel al comportamiento real del simulador.

**Alcance mínimo:** precio, producción, calidad, publicidad, promoción, branding, comunicación, marketing digital, canales, innovación, tipo de innovación, personal, operarios, vendedores, contrataciones, despidos, inventarios, compras, materia prima, producto terminado, crédito a clientes, financiamiento, préstamo operativo, préstamo de inversión, sobregiro, investigación de mercado, capacidad productiva, costos, liquidez y endeudamiento.

**Reglas:**

- Primero debe hacerse auditoría read-only.
- No modificar UI sin diagnóstico previo.
- No prometer reglas que no existan en el motor.
- No tocar `engine.js`, backend, BD ni simulación real durante la auditoría pedagógica.
- Toda ayuda debe distinguir entre decisión del estudiante, parámetro docente, resultado calculado, regla económica real y referencia pedagógica.

**Resultado esperado:** una Hoja de Decisión R1–R20 con ayudas claras, consistentes y sin contradicciones con el motor.

### 🟡 DOCUMENTACIÓN — Actualizar Manual del Estudiante

**Objetivo:** actualizar el Manual del Estudiante para reflejar el funcionamiento real y actualizado de SimNego v3.2, sin prometer funciones no implementadas.

Debe cubrir acceso, ingreso, selección de equipo, Fase 0, estrategia inicial, segmento objetivo, producto inicial, nivel de planta, operarios mínimos, costos fijos, personal administrativo fijo, activos complementarios, personal productivo y comercial, financiamiento Pre-R1, lead time, capacidad productiva, Hoja de Decisión R1–R20, envío de decisiones, resultados, estados financieros, indicadores, errores frecuentes y glosario básico. Debe incorporar las ayudas Fase 0 A–G y, tras su auditoría, las referencias de la Hoja de Decisión R1–R20.

### 🟡 DOCUMENTACIÓN — Preparar Manual del Profesor

**Objetivo:** crear un Manual del Profesor para administrar correctamente una simulación completa en SimNego v3.2.

Debe explicar acceso como administrador/profesor, creación de simulación, selección de industria, configuración general y de Fase 0, parámetros globales y por equipo, asignación de equipos, revisión de decisiones, apertura/cierre de rondas R1–R20, resultados, estados financieros, ranking, investigación de mercado, backups y restauración segura, criterios de evaluación y flujos recomendados para clase y examen. Debe incluir checklist antes de iniciar una simulación, cerrar una ronda y publicar resultados.

Debe advertir que no deben cambiarse parámetros globales durante simulaciones activas sin respaldo; que no se tocan simulaciones reales en curso sin autorización; que se debe diferenciar una simulación nueva de una iniciada; que los parámetros globales pueden afectar resultados; y que toda restauración exige respaldo previo.

También debe incorporar el procedimiento Profesor/Estudiante: crear simulación, configurar y completar Fase 0, abrir R1, enviar decisiones, cerrar ronda, revisar resultados y avanzar R2–R20; además de diferenciar parámetros globales, parámetros por equipo, decisiones del estudiante y resultados calculados.

### 🟢 MEJORAS POSTERIORES

1. Secuencia guiada para profesor.
2. Exponer `sueldosAdministrativosFijos` en Admin → Parámetros.
3. UI admin para editar bonos de activos no productivos.
4. Eliminar funciones duplicadas de `app.js`.
5. Revisar stock MP disponible en hoja de decisión.
6. Limpiar CSS huérfano.
7. Mejorar trazabilidad entre decisiones y resultados.
8. Uniformizar visualmente los manuales y preparar glosario operativo y financiero.

## Nota de control v8.1

La Fase 0 queda cerrada a nivel de referencias pedagógicas. El siguiente frente pedagógico es la Hoja de Decisión R1–R20. El siguiente frente documental es actualizar el Manual del Estudiante y preparar el Manual del Profesor. No se debe tocar `engine.js` hasta contar con pruebas puras para riesgos financieros como H-04.
