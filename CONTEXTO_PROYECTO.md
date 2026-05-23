# CONTEXTO DEL PROYECTO SimNego v3.2
# Archivo de memoria persistente entre sesiones de Claude
# Última actualización: Mayo 2026
# Curso: COM540 Juego de Negocios — UAGRM Ing. Comercial
# Profesor: Jhonny David Atila Lijerón

---

## 1. IDENTIDAD DEL PROYECTO

**Nombre:** SimNego v3.2 — Simulador de Negocios Educativo
**Stack:** Node.js + Express + PostgreSQL/Supabase + SPA vanilla
**Propósito:** Simulador de decisiones empresariales para el curso COM540
  de Ingeniería Comercial en la UAGRM (Santa Cruz de la Sierra, Bolivia).
**Industria activa:** Calzados Especializados — COM540 · 2026
  Archivo: `industrias/Calzados_COM540_1_2026.json`

---

## 2. ESTRUCTURA REAL DEL PROYECTO EN DISCO

```
C:\Win\SimuladorNegocios\
├── server.js                    ← servidor Express principal
├── session.js                   ← sesiones en memoria (CORREGIDO: guarda rol + simulacionId)
├── auth.js                      ← hashPassword / verifyPassword (crypto nativo)
├── plantillas.js                ← carga JSONs de industria desde industrias/
├── constants.js
├── db.js
├── reports.js
├── bot_service.js
├── ws_service.js
├── session_pg.js
├── package.json
├── manual.html                  ← manual del estudiante (actualizado COM540)
├── manual_profesor.html         ← manual del profesor (generado Mayo 2026)
├── industrias/
│   ├── Calzados_COM540_1_2026.json  ← industria personalizada COM540 (costos CORREGIDOS)
│   └── jaboncillos_v1.json
├── public/
│   ├── app.js                   ← SPA frontend (4.092 líneas)
│   ├── index.html               ← "SimNeg UAGRM" en sidebar y login
│   └── styles.css               ← tema azul oscuro (styles_v11)
└── src/
    ├── engine.js                ← motor de cálculo (953 líneas)
    ├── storage.js               ← capa de datos PostgreSQL (658 líneas)
    └── plantillas.js            ← copia de plantillas.js en raíz
```

---

## 3. CREDENCIALES Y CONEXIÓN

### Supabase (base de datos en la nube)
```cmd
set "DATABASE_URL=postgresql://postgres.eioeclzairvwwsskktxf:SimNego2026Pass@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
node server.js
```
**IMPORTANTE:** El host es `aws-1-us-east-1` (con el número 1, no 0).

### Credenciales de acceso al simulador
| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin | admin123 | superadmin |
| 1 | 1234 | equipo |
| 2 | 1234 | equipo |
| 3 | 1234 | equipo |

### Tablas en Supabase
- `usuarios` — solo el admin (los equipos están en `simulaciones.users` como JSONB)
- `simulaciones` — columnas: id, owner_id, nombre, estado, config, parametros, tipos_producto, canales, segmentos, afinidad_matrix, competencia_externa, rondas, users
- `sim_rondas` — rondas ejecutadas
- `sim_decisiones` — decisiones por equipo
- `sesiones` — sesiones activas

---

## 4. BUGS CRÍTICOS RESUELTOS EN ESTA SESIÓN

### BUG-CRÍTICO-1: session.js no guardaba rol ni simulacionId
**Archivo:** `session.js` (raíz del proyecto)
**Síntoma:** Admin ingresaba pero no veía simulaciones ("No hay simulaciones activas")
**Causa:** `createSession(userId)` ignoraba `rol` y `simulacionId`
**Fix aplicado:**
```js
// ANTES (incorrecto)
function createSession(userId) {
  sessions.set(token, { userId, createdAt: Date.now() });
}
// DESPUÉS (correcto)
function createSession(userId, rol = null, simulacionId = null) {
  sessions.set(token, { userId, rol, simulacionId, createdAt: Date.now() });
}
```

### BUG-CRÍTICO-2: costoBase incluía costoMP (doble conteo)
**Archivo:** `industrias/Calzados_COM540_1_2026.json`
**Síntoma:** CU calculado = costoBase (ya incluía MP) + costoMP = MP contada 2 veces
**Causa:** Al generar el JSON, se pusieron los costos totales del Excel como costoBase
  sin descontar el costoMP del proveedor (Bs 12 nacional)
**Fix:** costoBase = costoExcel − costoMP(Bs 12)

| Producto | costoBase antes | costoBase correcto |
|----------|----------------|-------------------|
| Sandalia Infantil Ajustable | Bs 95 | Bs 79 |
| Calzado Sensorial TEA | Bs 132 | Bs 120 |
| Calzado Ortopédico Laboral | Bs 148 | Bs 136 |
| Calzado Biomecánico Formal | Bs 165 | Bs 153 |
| Calzado Médico Especializado | Bs 238 | Bs 226.57 |
| Sneaker Cultural Premium | Bs 310 | Bs 298 |

**Fórmula correcta del motor:**
```
CU = costoBase + (0.20 × calidad) + costoMP_proveedor + costoAdicionalCanal
```
Con Proveedor Nacional (+Bs12): CU total = costoBase + 12 = costo original del equipo ✅

### BUG-CRÍTICO-3: proveedores no aparecían en hoja de decisión
**Archivos:** `server.js`, `src/plantillas.js`, `industrias/`
**Causa raíz:** `plantillas.js` usaba `path.resolve(__dirname, '..', 'industrias')`
  que resolvía fuera del proyecto. Además `cargarPlantilla()` no retornaba `proveedores`.
**Fix:** Fallback en server.js lee el JSON directamente buscando en 3 rutas:
```js
const posibles = [
  path.join(__dirname, 'industrias', industria+'.json'),
  path.join(__dirname, '..', 'industrias', industria+'.json'),
  path.join(__dirname, industria+'.json'),
];
```

### BUG-CRÍTICO-4: select options invisibles (texto blanco)
**Archivo:** `public/styles.css`
**Fix aplicado al final del CSS:**
```css
.form-input option, .form-select option, .hoja-select option, select option {
  color: #1a2a3a !important;
  background: #ffffff !important;
}
```

---

## 5. ESTADO DEL ROADMAP DE ETAPAS

### ✅ Completadas — F2 + F3 al 100%
| Etapa | Verificación |
|-------|-------------|
| 2.1 Brand Equity | `grep -c "calcularBrandEquity" src/engine.js` ≥ 2 |
| 2.2 Demanda dinámica | `grep -c "demandaBaseAnteriorMap" src/engine.js` ≥ 5 |
| 2.3 Canibalización | `grep -c "factorCanibalizacion" src/engine.js` ≥ 2 |
| 2.4 Calibración λ | `grep -c "lambdaLogit" src/engine.js` ≥ 1 |
| 3.1 Materia Prima | `grep -c "procesarPedidosMP" src/engine.js` ≥ 3 |
| 3.2 Operarios | `grep -c "calcularOperarios" src/engine.js` ≥ 2 |
| 3.3 IVA | `grep -c "ivaAPagar" src/engine.js` ≥ 3 |
| 3.4 IT + IUE | `grep -c "impuestoIT" src/engine.js` ≥ 5 |
| 3.5 Dashboard fiscal | `grep -c "dashboardFiscal" server.js` ≥ 2 |

### 🔴 Pendientes — F4 (requieren rondas simuladas)
| Etapa | Prerequisito |
|-------|-------------|
| 4.1 Elasticidad empírica | F3 completa + ≥ 4 rondas |
| 4.2 Reportes estratégicos | 4.1 completa |
| 4.3 Calibración y shocks | F3 completa + ≥ 8 rondas |

---

## 6. INDUSTRIA Calzados_COM540_1_2026

### Equipos del curso y sus productos
| Equipo | Empresa | Producto | Segmento natural |
|--------|---------|---------|-----------------|
| Eq. 2 | TE Acompaña Kids | Calzado Sensorial TEA | Padres/niños |
| Eq. 3 | BIOPASO | Calzado Médico Especializado | Fascitis plantar |
| Eq. 4 | GrowStep Kids | Sandalia Infantil Ajustable | Padres/niños |
| Eq. 5 | ORTHO STEP | Calzado Ortopédico Laboral | Comerciantes/salud |
| Eq. 7 | LEVITA | Calzado Biomecánico Formal | Cond. postural |
| G. 1 | Raíz | Sneaker Cultural Premium | Jóvenes urbanos |

### Proveedores MP
| Proveedor | costoMP | Lead time |
|-----------|---------|----------|
| Nacional (Santa Cruz) | Bs 12/unid | 1 trimestre |
| Importado (Brasil/China) | Bs 7/unid | 2 trimestres |

### Parámetros clave
- Capital inicial: Bs 480.000
- Capacidad máx. producción: 1.500 pares/trim
- Operarios iniciales: 4 (productividad: 440 pares/trim/operario)
- IVA: 13% | IT: 3% | IUE: 25% (anual, cada 4 trim.)
- λ Logit: 1.0 | Factor canibalización: 15%

---

## 7. SCRIPTS DE ADMINISTRACIÓN (Windows cmd)

### Arrancar el servidor
```cmd
set "DATABASE_URL=postgresql://postgres.eioeclzairvwwsskktxf:SimNego2026Pass@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
node server.js
```

### Reset de rondas (conserva equipos y configuración)
```cmd
set "DATABASE_URL=postgresql://postgres.eioeclzairvwwsskktxf:SimNego2026Pass@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
node reset_rondas.js
```

### Activar simulación si quedó en 'pendiente'
```cmd
node -e "process.env.NODE_TLS_REJECT_UNAUTHORIZED='0'; const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); p.query(\"UPDATE simulaciones SET estado='activa' WHERE estado='pendiente'\").then(r=>{console.log('✅',r.rowCount,'activadas'); p.end()})"
```

### Diagnóstico de conexión
```cmd
node diagnostico_completo.js
```

---

## 8. KPIs ORGANIZADOS POR GERENCIA (app.js — mostrarKpiRonda)

| Gerente | KPIs asignados |
|---------|---------------|
| 📣 Marketing | Market Share, Brand Equity, ROI Marketing, Ventas, Precio venta, Publicidad |
| 🏭 Producción | Producción, Inventario, Inv/Producción, Capacidad efectiva, Stock MP |
| 👥 RRHH | Vendedores, Ventas/vendedor, Ingresos/vendedor, Operarios, Costo operarios |
| 💰 Financiero | Costo unitario, Márgenes, Utilidad, EBIT, Caja, Deuda, Endeudamiento, Liquidez, IVA, IT, IUE |

---

## 9. PROTOCOLO ANTI-REGRESIÓN

### Archivos base (leer SIEMPRE estos, nunca el original)
- Motor: `/mnt/user-data/outputs/engine.js`
- Frontend: `/mnt/user-data/outputs/app.js`
- Servidor: `/mnt/user-data/outputs/server.js`
- Persistencia: `/mnt/user-data/outputs/storage.js`
- Industria: `/mnt/user-data/outputs/Calzados_COM540_1_2026.json`

### Script de verificación al inicio de sesión
```bash
echo "=== VERIFICACIÓN ANTI-REGRESIÓN ==="
grep -c "calcularBrandEquity"       /mnt/user-data/outputs/engine.js   # ≥2
grep -c "demandaBaseAnteriorMap"    /mnt/user-data/outputs/engine.js   # ≥5
grep -c "ivaAPagar"                 /mnt/user-data/outputs/engine.js   # ≥3
grep -c "impuestoIT"                /mnt/user-data/outputs/engine.js   # ≥5
grep -c "calcularOperarios"         /mnt/user-data/outputs/engine.js   # ≥2
grep -c "Módulos Activos"           /mnt/user-data/outputs/app.js      # ≥1
grep -c "Operarios de Producción"   /mnt/user-data/outputs/app.js      # ≥1
grep -c "proveedorElegido"          /mnt/user-data/outputs/app.js      # ≥1
grep -c "dashboardFiscal"           /mnt/user-data/outputs/server.js   # ≥2
grep -c "resolveNombre"             /mnt/user-data/outputs/server.js   # ≥3
grep -c "brandEquityInicial.*50"    /mnt/user-data/outputs/storage.js  # ≥2
```

---

## 10. DECISIONES PEDAGÓGICAS TOMADAS

1. **Ronda 1 declarada como prueba** — se reseteó la BD porque Equipos 1 y 2
   simularon con costos incorrectos (MP doble contada) y Equipo 3 con costos correctos.
   Todos reinician desde Ronda 1 con costos corregidos.

2. **costoBase = costoExcel − Bs 12** para todos los productos, usando el
   Proveedor Nacional como referencia base. Si un equipo elige el proveedor
   importado (Bs 7), su CU total será menor, lo que es una ventaja competitiva
   legítima que compensa el riesgo del lead time de 2 trimestres.

3. **Módulos activos desde Ronda 1:** Brand Equity, IVA+IT+IUE, Innovación,
   Investigación de Mercado, Demanda Dinámica.
   **Desde Ronda 3:** Operarios, Materia Prima.
   **Desde Ronda 5:** Canibalización (si algún equipo opera en múltiples segmentos).

4. **Manual del estudiante actualizado** con costos corregidos y nueva fórmula CU.
   **Manual del profesor generado** (manual_profesor.html) con guía pedagógica
   completa de las 12 rondas.

5. **Equipos de prueba COM540D12026:**
   - Equipo 1: password 1234
   - Equipo 2: password 1234
   - Equipo 3: password 1234
