# FIXES.md — SimNego v3.2
# Registro acumulativo de fixes aplicados
# Formato por entrada:
#   ## FIX-NNN — [Título]
#   Fecha: YYYY-MM-DD
#   Archivos: lista de archivos modificados
#   Verificación: grep exacto que confirma presencia del fix
#   Descripción: qué se cambió y por qué
#   Líneas clave: los strings únicos que identifican el fix en el código

---

## FIX-001 — Selector de industria: opciones sin guiones y capitalizadas

**Fecha:** 2026-05
**Archivos:** `public/app.js`
**Verificación:**
```bash
grep -c "Seleccionar industria" /mnt/user-data/outputs/app.js   # debe ser ≥ 1
grep -c "jaboncillos_v1" /mnt/user-data/outputs/app.js          # debe ser ≥ 1
grep -c "charAt(0).toUpperCase" /mnt/user-data/outputs/app.js   # debe ser ≥ 1
```
**Descripción:** El selector "Nueva Simulación → Industria" mostraba
"– Jaboncillos por defecto –" con guiones largos y "calzados" en minúscula.
Se corrigió para mostrar:
- Opción 0 (disabled): "— Seleccionar industria —"
- Opción 1: "Jaboncillos" (hardcoded como value="jaboncillos_v1")
- Opción N: capitalize automático para industrias dinámicas
**Líneas clave en app.js:**
```
<option value="" disabled selected>— Seleccionar industria —</option>
<option value="jaboncillos_v1">Jaboncillos</option>
.map(p => { const lbl = p.replace(/_v\d+$/, '').replace(/_/g, ' '); const cap = lbl.charAt(0).toUpperCase()
```

---

## FIX-002 — Opciones de select invisibles (texto blanco sobre fondo blanco)

**Fecha:** 2026-05
**Archivos:** `public/styles.css`
**Verificación:**
```bash
grep -c "select option" /mnt/user-data/outputs/styles.css       # debe ser ≥ 1
grep -c "1a2a3a !important" /mnt/user-data/outputs/styles.css   # debe ser ≥ 1
```
**Descripción:** Las `<option>` dentro de `<select>` no heredan `color` en
Chrome/Edge/Firefox cuando la app usa variables CSS. El texto aparecía
blanco sobre blanco. Solución: regla CSS explícita con `!important`.
**Líneas clave en styles.css:**
```css
.form-input option,
.form-select option,
.hoja-select option,
select option {
  color: #1a2a3a !important;
  background: #ffffff !important;
}
```

---

## FIX-003 — Brand Equity acumulativo (Etapa 2.1)

**Fecha:** 2026-05
**Archivos:** `src/engine.js`, `src/storage.js`,
             `jaboncillos_v1.json`, `calzados_v1.json`, `public/app.js`
**Verificación:**
```bash
grep -c "calcularBrandEquity"   /mnt/user-data/outputs/engine.js    # ≥ 1
grep -c "brandEquityFinal,"     /mnt/user-data/outputs/engine.js    # ≥ 1
grep -c "brandEquityInicial"    /mnt/user-data/outputs/storage.js   # ≥ 1
grep -c "brandEquityInicial.*50" /mnt/user-data/outputs/storage.js  # ≥ 1
grep -c "tasaDecaimiento"       /mnt/user-data/outputs/jaboncillos_v1.json  # ≥ 1
grep -c "tasaDecaimiento"       /mnt/user-data/outputs/calzados_v1.json     # ≥ 1
grep -c "Brand Equity"          /mnt/user-data/outputs/app.js               # ≥ 1
```
**Descripción:** Implementación del Brand Equity como variable acumulativa
entre rondas. El BE crece con ventas y utilidad, decae si el equipo no vende.
Afecta el atractivo competitivo en el Logit con coeficiente 0.05.
**Cambios por archivo:**

`engine.js`:
- Nueva función `calcularBrandEquity(brandEquityAnterior, shareReal, utilidadNeta, tasaDecaimiento)`
- `calcularAtractivo()`: nuevo término `+ 0.05 * (d.brandEquityInicial ?? 50)`
- `calcularResultadosFinancieros()`: calcula y retorna `brandEquityFinal`

`storage.js` — bloque `if (resPrev)` de `ensureRonda()`:
```js
nuevaDec.brandEquityInicial = resPrev.brandEquityFinal ?? 50;
```

`jaboncillos_v1.json` y `calzados_v1.json` — en `params`:
```json
"tasaDecaimiento": 0.05
```

`app.js` — card nueva en vista KPIs del equipo:
```js
<div class="kpi-row"><span class="kpi-label">Brand Equity</span>
<span class="kpi-value" style="color:var(--accent3)">
${(r.brandEquityFinal ?? 50).toFixed(1)} <span ...>pts</span></span></div>
```

---

## FIX-004 — Bug "Producto desconocido" — campo tipoProducto vs producto

**Fecha:** 2026-05
**Archivos:** `public/app.js`, `src/engine.js`, `server.js`
**Verificación:**
```bash
grep -c "FIX: el formulario legado"     /mnt/user-data/outputs/app.js     # ≥ 1
grep -c "FIX: garantizar que el campo" /mnt/user-data/outputs/engine.js   # ≥ 1
grep -c "tiposDisponibles"             /mnt/user-data/outputs/engine.js   # ≥ 1
grep -c "FIX: normalizar tipoProducto" /mnt/user-data/outputs/server.js   # ≥ 2
```
**Causa raíz:** El formulario antiguo usaba `data-field="tipoProducto"` pero
el motor requiere `d.producto`. El campo `producto` nunca se escribía en
`state.decisiones` cuando el equipo usaba ese formulario.
**Defensa en profundidad — 6 puntos:**

`app.js` — change handler del formulario antiguo:
```js
// FIX: escribir también el campo canónico "producto" que usa el motor
state.decisiones['producto'] = val;
if (state.decisiones.productos?.[0]) {
  state.decisiones.productos[0].producto = val;
}
```

`app.js` — `normalizarDecisionMultiproducto()`:
```js
// FIX: el formulario legado usa data-field="tipoProducto"; mapear a "producto"
if (!decision.producto && decision.tipoProducto) {
  decision.producto = decision.tipoProducto;
}
// Y en productoBase:
producto: decision.producto || decision.tipoProducto || '',
```

`engine.js` — `expandirDecisionesMultiproducto()`:
```js
// FIX: garantizar que el campo canónico "producto" exista antes de expandir.
if (!decisionEmpresa.producto && decisionEmpresa.tipoProducto) {
  decisionEmpresa = { ...decisionEmpresa, producto: decisionEmpresa.tipoProducto };
}
```

`engine.js` — `calcularCostoUnitario()`:
```js
// FIX: recuperar producto del campo legado tipoProducto si el canónico está vacío
if (!d.producto && d.tipoProducto) { d = { ...d, producto: d.tipoProducto }; }
if (!d.producto && Array.isArray(d.productos) && d.productos[0]?.producto) {
  d = { ...d, producto: d.productos[0].producto };
}
// Guardia con log estructurado:
console.error('[motor] calcularCostoUnitario — producto no encontrado', {
  equipo, producto: d.producto, tipoProducto: d.tipoProducto,
  tiposDisponibles: Object.keys(tiposProducto),
});
```

`server.js` — `POST /api/decisiones/guardar` y `POST /api/decisiones/enviar`:
```js
// FIX: normalizar tipoProducto -> producto en el servidor (defensa en profundidad)
if (body.decision && !body.decision.producto && body.decision.tipoProducto) {
  body.decision.producto = body.decision.tipoProducto;
}
```

---

## TABLA RESUMEN DE ESTADO ACTUAL

| Fix    | Archivo                  | Grep de verificación                          | Líneas diff |
|--------|--------------------------|-----------------------------------------------|-------------|
| FIX-001 | app.js                  | `"Seleccionar industria"`                     | +2 líneas   |
| FIX-002 | styles.css              | `"1a2a3a !important"`                         | +8 líneas   |
| FIX-003 | engine.js               | `"calcularBrandEquity"`                       | +40 líneas  |
| FIX-003 | storage.js              | `"brandEquityInicial.*50"`                    | +1 línea    |
| FIX-003 | jaboncillos_v1.json     | `"tasaDecaimiento"`                           | +1 línea    |
| FIX-003 | calzados_v1.json        | `"tasaDecaimiento"`                           | +1 línea    |
| FIX-003 | app.js                  | `"Brand Equity"`                              | +2 líneas   |
| FIX-004 | app.js                  | `"FIX: el formulario legado"`                 | +8 líneas   |
| FIX-004 | engine.js               | `"tiposDisponibles"`                          | +30 líneas  |
| FIX-004 | server.js               | `"FIX: normalizar tipoProducto"` (×2)         | +16 líneas  |

---

## ARCHIVOS CANÓNICOS (outputs más recientes con todos los fixes)

```
/mnt/user-data/outputs/app.js              ← FIX-001 + FIX-003 + FIX-004
/mnt/user-data/outputs/engine.js           ← FIX-003 + FIX-004
/mnt/user-data/outputs/server.js           ← FIX-004
/mnt/user-data/outputs/storage.js          ← FIX-003
/mnt/user-data/outputs/jaboncillos_v1.json ← FIX-003
/mnt/user-data/outputs/calzados_v1.json    ← FIX-003
/mnt/user-data/outputs/styles.css          ← FIX-002 (verificar si existe)
```

NOTA: FIX-002 (styles.css) debe verificarse por separado.
Si styles.css no está en outputs, aplicar la regla CSS manualmente.

---

## ETAPA 2.2 — Demanda dinámica por tendencia

**Fecha:** 2026-05
**Archivos:** `src/engine.js`, `server.js`, `jaboncillos_v1.json`, `calzados_v1.json`
**Verificación:**
```bash
grep -c "tasaCrecimiento"        /mnt/user-data/outputs/jaboncillos_v1.json  # ≥7
grep -c "demandaBaseAnteriorMap" /mnt/user-data/outputs/engine.js            # ≥5
grep -c "demandaBaseAnteriorMap" /mnt/user-data/outputs/server.js            # ≥3
```
**Cambios:**
- Segmentos JSON: `tasaCrecimiento` por tendencia (0.00/0.03/0.06/-0.03)
- `calcularMercadoSegmentos(params, segmentos, demandaBaseAnteriorMap={})`: nueva firma
- `ejecutarSimulador`: extrae `demandaBaseAnteriorMap` de cfg
- `server.js /admin/simular`: construye el mapa desde `mercadoSegmentos` de ronda anterior

---

## ETAPA 2.3 — Canibalización multiproducto

**Fecha:** 2026-05
**Archivos:** `src/engine.js`, `jaboncillos_v1.json`, `calzados_v1.json`
**Verificación:**
```bash
grep -c "factorCanibalizacion"   /mnt/user-data/outputs/jaboncillos_v1.json  # ≥1
grep -c "canibaliz"              /mnt/user-data/outputs/engine.js            # ≥3
```
**Cambios:**
- Params JSON: `factorCanibalizacion: 0.15`
- `calcularParticipacion`: nuevo parámetro `params`, penaliza atractivo si empresa
  tiene N>1 productos en mismo segmento: `atractivo × max(0, 1 − factor × (N−1))`
- `ejecutarSimulador`: pasa `params` a `calcularParticipacion`

---

## ETAPA 3.3 — IVA Bolivia (13%)

**Fecha:** 2026-05
**Archivos:** `src/engine.js`, `jaboncillos_v1.json`, `calzados_v1.json`
**Verificación:**
```bash
grep -c "tasaIVA"    /mnt/user-data/outputs/jaboncillos_v1.json  # ≥1
grep -c "ivaAPagar"  /mnt/user-data/outputs/engine.js            # ≥3
grep -c "pagoIVA"    /mnt/user-data/outputs/engine.js            # ≥3
```
**Cambios:**
- Params JSON: `tasaIVA: 0.13`
- `calcularResultadosFinancieros`: `ivaDebito = ventasNetas × tasaIVA`,
  `ivaCredito = pagoProduccion × tasaIVA`, `ivaAPagar = max(0, débito−crédito)`
- `pagoIVA` incluido en `totalPagos` (afecta `cajaFinal`)
- `return`: `ivaDebito`, `ivaCredito`, `ivaAPagar`, `pagoIVA`

---

## ETAPA 3.1 — Materia prima: estructura y decisión de compra

**Fecha:** 2026-05
**Archivos:** `src/engine.js`, `src/storage.js`, `server.js`,
             `jaboncillos_v1.json`, `calzados_v1.json`
**Verificación:**
```bash
grep -c "proveedores"         /mnt/user-data/outputs/jaboncillos_v1.json  # ≥1
grep -c "procesarPedidosMP"   /mnt/user-data/outputs/engine.js            # ≥3
grep -c "stockMPInicial"      /mnt/user-data/outputs/storage.js           # ≥2
grep -c "rondaNumero"         /mnt/user-data/outputs/server.js            # ≥1
```
**Cambios:**
- JSONs: sección `proveedores[]` + params `unidadesMPporUnidad`, `costoAlmacenamientoMP`
- `storage.defaultDecision`: `stockMPInicial`, `proveedorElegido`, `cantidadMPpedida`, `pedidosPendientes`
- `storage.ensureRonda`: propaga `stockMPFinal` y `pedidosPendientesResta`
- `engine.procesarPedidosMP(d, rondaNumero, params)`: procesa lead time y retorna stock disponible
- `ejecutarSimulador`: llama a `procesarPedidosMP`, restringe `produccion` por stock MP
- `server.js simCfg`: agrega `rondaNumero` y `proveedores`

---

## ETAPA 2.4 — Calibración λ (parámetro de escala Logit)

**Fecha:** 2026-05
**Archivos:** `src/engine.js`, `jaboncillos_v1.json`, `calzados_v1.json`
**Verificación:**
```bash
grep -c "lambdaLogit"      /mnt/user-data/outputs/engine.js           # ≥1
grep -c "lambdaLogit"      /mnt/user-data/outputs/jaboncillos_v1.json # ≥1
grep -n "lambda \* " /mnt/user-data/outputs/engine.js | wc -l         # ≥3
```
**Cambios:**
- Params JSON: `lambdaLogit: 1.0` (rango válido: 0.1–3.0)
- `calcularParticipacion()`: `lambda = clamp(params.lambdaLogit ?? 1.0, 0.1, 3.0)`
  Escala los atractivos: `exp(λ × atractivo)` en lugar de `exp(atractivo)`
  λ=1.0 → sin cambio; λ>1 → más diferenciado; λ<1 → shares más uniformes

---

## ETAPA 3.4 — IT + IUE (impuestos Bolivia)

**Fecha:** 2026-05
**Archivos:** `src/engine.js`, `jaboncillos_v1.json`, `calzados_v1.json`
**Verificación:**
```bash
grep -c "impuestoIT"   /mnt/user-data/outputs/engine.js           # ≥5
grep -c "impuestoIUE"  /mnt/user-data/outputs/engine.js           # ≥4
grep -c "tasaIT"       /mnt/user-data/outputs/jaboncillos_v1.json # ≥1
```
**Cambios:**
- Params JSON: `tasaIT: 0.03`, `tasaIUE: 0.25`, `periodosIUE: 4`
- `calcularResultadosFinancieros()`:
  - `impuestoIT = ventasBrutas × tasaIT` (pago trimestral)
  - `impuestoIUE = utilGravable × tasaIUE` solo si `ronda % 4 === 0`
  - `provisionIUE = utilGravable × tasaIUE / 4` (acumulado contable)
  - Ambos incluidos en `totalPagos`
- `rondaNumero` inyectado en `d` desde `ejecutarSimulador`
- Return: `impuestoIT`, `impuestoIUE`, `provisionIUE`, `totalImpuestos`, `pagoIT`, `pagoIUE`

---

## ETAPA 3.2 — Operarios (capacidad efectiva de producción)

**Fecha:** 2026-05
**Archivos:** `src/engine.js`, `src/storage.js`, `jaboncillos_v1.json`, `calzados_v1.json`
**Verificación:**
```bash
grep -c "calcularOperarios"    /mnt/user-data/outputs/engine.js           # ≥2
grep -c "capacidadEfectiva"    /mnt/user-data/outputs/engine.js           # ≥3
grep -c "operariosIniciales"   /mnt/user-data/outputs/storage.js          # ≥2
grep -c "productividadBase"    /mnt/user-data/outputs/jaboncillos_v1.json # ≥1
```
**Cambios:**
- Params JSON: `productividadBase: 440`, `operariosIniciales: 4`, `costoOperario: 3200`,
  `costoContratacionOperario: 800`, `costoDespidoOperario: 1200`, `factorCapacitacion: 0.05`
- `storage.defaultDecision`: `operariosIniciales`, `contratarOperarios`, `despedirOperarios`, `montoCapacitacion`
- `storage.ensureRonda`: propaga `operariosFinales`
- `engine.calcularOperarios(d, params)`: retorna `operariosFinales`, `capacidadEfectiva`, `costoOperarios`
  `capacidadEfectiva = operarios × productividadBase × (1 + factor × monto/10000)`
- `ejecutarSimulador`: `produccionReal = min(produccionDecidida, capacidadEfectiva, stockMP, capacidadMaxPlanta)`
- `calcularResultadosFinancieros`: `costoOperarios` incluido en `gastosOp`
- Return: `operariosFinales`, `capacidadEfectiva`, `costoOperarios`

---

## ETAPA 3.5 — Dashboard fiscal del admin

**Fecha:** 2026-05
**Archivos:** `server.js`, `public/app.js`
**Verificación:**
```bash
grep -c "dashboardFiscal"    /mnt/user-data/outputs/server.js  # ≥2
grep -c "presionFiscalPct"   /mnt/user-data/outputs/app.js     # ≥1
grep -c "Dashboard Fiscal"   /mnt/user-data/outputs/app.js     # ≥1
```
**Cambios:**

`server.js` — `GET /admin/resultados/:n`:
- Agrega `dashboardFiscal` al response con: `totalIT`, `totalIVA`, `totalIUE`,
  `totalImpuestos`, `presionFiscalPct` (% sobre utilidad bruta), `porEquipo[]`

`app.js` — `buildAdminResultsHTML(rd)`:
- Si `rd.dashboardFiscal` existe: renderiza 5 KPI cards (IT, IVA, IUE, Total,
  Presión fiscal) + tabla por equipo con desglose de los 3 impuestos
- Retrocompatible: si no hay `dashboardFiscal` (rondas sin Etapa 3.4),
  la tabla fiscal simplemente no aparece

`app.js` — `loadAdminParametros()`:
- Nueva card "🧾 Sistema Tributario Bolivia" con campos editables:
  `tasaIVA`, `tasaIT`, `tasaIUE`, `periodosIUE`, `lambdaLogit`

---

## FIX-005 — Materia Prima y Proveedores no aparecían en hoja de decisión

**Fecha:** 2026-05
**Archivos:** `server.js`, `src/plantillas.js`, `industrias/jaboncillos_v1.json`, `industrias/calzados_v1.json`
**Verificación:**
```bash
grep -c "posibles.*industrias" server.js           # ≥1
grep -c "proveedores.*raw.proveedores" src/plantillas.js  # ≥1
```

**Causa raíz (3 niveles en cadena):**
1. `src/plantillas.js` → `cargarPlantilla()` no incluía `proveedores` en su `return {}`
2. `server.js` fallback en `/api/decisiones` usaba `require('./src/plantillas')` que fallaba silenciosamente → devolvía `[]`
3. `ref.proveedores.length > 0` siempre era `false` → sección MP nunca se renderizaba

**Fix aplicado:**
- `plantillas.js`: agregar `proveedores: raw.proveedores || []` en el `return`
- `server.js`: reemplazar el fallback frágil por lectura directa del JSON buscando en 3 rutas posibles (`__dirname/industrias/`, `__dirname/../industrias/`, `__dirname/`) sin depender de `require('./src/plantillas')`
- `industrias/jaboncillos_v1.json` y `industrias/calzados_v1.json`: deben existir en la carpeta `industrias/` en la raíz del proyecto con el campo `proveedores[]`

**Nota:** funciona para simulaciones existentes (sin recrear) porque el fallback actúa en tiempo real al abrir la hoja de decisión.

---

## FIX-006 — Fallo de login después de migración a Supabase

**Fecha:** 2026-05
**Archivos:** ninguno de código — problema de datos en BD

**Síntoma:** "Error intento del servidor" al intentar ingresar.
El servidor arranca sin errores, la pantalla de login aparece,
pero cualquier credencial devuelve error 500.

**Causa raíz:** La tabla `usuarios` en PostgreSQL/Supabase estaba
vacía. El superadmin existe en `db.json` (legado) pero nunca
fue migrado a la BD de Supabase cuando se cambió el motor de
persistencia de JSON a PostgreSQL.

**Credenciales que funcionan:**
- Usuario: `admin`
- Contraseña: `admin123`

**Verificación rápida si vuelve a ocurrir:**
```bash
# Ejecutar con DATABASE_URL configurada
node diagnostico_completo.js
# Si la tabla usuarios aparece vacía → ese es el problema
```

**Script de recuperación disponible:**
`/mnt/user-data/outputs/diagnostico_completo.js`

---

## FIX-007 — coefPrecio: atractivo extremadamente negativo → ventas cero

**Fecha:** 2026-05
**Archivos:** `src/engine.js`, `industrias/Calzados_COM540_1_2026.json`, `public/app.js`
**Verificación:**
```bash
grep -c "coefPrecio" src/engine.js              # ≥1
grep "coefPrecio" industrias/Calzados_COM540_1_2026.json  # -0.005
grep -c "coefPrecio" public/app.js              # ≥1 (campo editable admin)
```
**Causa:** coeficiente de precio fijo `-0.7` calibrado para Jaboncillos (Bs 2-10).
Con calzados (Bs 91-310): `-0.7 × 160 = -112` → atractivo -97 → share ~0 → ventas 0.
**Fix:** `(params.coefPrecio ?? -0.7) * precio`. JSON: `"coefPrecio": -0.005`.
Campo editable en Admin → Parámetros → Coef. Precio.

---

## FIX-008 — pagoIT used before initialization

**Fecha:** 2026-05
**Archivo:** `src/engine.js`
**Verificación:**
```bash
python3 -c "
eng=open('src/engine.js').read()
print('✅ OK' if eng.find('const pagoIT') < eng.find('const totalPagos') else '❌')
"
```
**Causa:** bloque IT+IUE (pagoIT, pagoIUE) declarado DESPUÉS de totalPagos que los usa.
**Fix:** mover bloque Etapa 3.4 ANTES del cálculo de totalPagos.

---

## FIX-009 — params not defined en calcularAtractivo

**Fecha:** 2026-05
**Archivo:** `src/engine.js`
**Verificación:**
```bash
grep "calcularAtractivo.*params" src/engine.js  # ≥1
```
**Causa:** `calcularAtractivo(d, seg, afinidad, canales, vendedores)` no tenía `params`
en su firma pero usaba `params.coefPrecio`.
**Fix:** agregar `params = {}` a la firma y pasar `params` en todas las llamadas
(calcularParticipacion → calcularAtractivo, calcularPreSimulacion → calcularParticipacion).

---

## FIX-010 — EBIT y roiMarketing undefined en resultados

**Fecha:** 2026-05
**Archivo:** `src/engine.js`
**Verificación:**
```bash
grep -c "ebit:" src/engine.js          # ≥1
grep -c "roiMarketing:" src/engine.js  # ≥1
```
**Fix:** agregar al return de calcularResultadosFinancieros:
```js
ebit:         roundBs(utilidadNeta + ivaAPagar + impuestoIT + impuestoIUE),
roiMarketing: pagoMktTotal > 0 ? roundBs(ventasNetas / pagoMktTotal) : 0,
```

---

## FIX-011 — Panel admin resultados/créditos/historial vacíos (estado 'calculada' vs 'simulated')

**Fecha:** 2026-05
**Archivos:** `server.js`, `public/app.js`
**Verificación:**
```bash
grep -c "calculada.*includes\|includes.*calculada" server.js   # ≥8
grep -c "calculada.*includes\|includes.*calculada" public/app.js # ≥4
```
**Causa:** `storage.js` traduce `'simulated'` → `'calculada'` al leer de la BD.
Pero 7+ verificaciones en `server.js` y 4 en `app.js` comparaban contra `'simulated'`
directamente → 404 en resultados, vacío en créditos e historial.
**Fix:** reemplazar todas las comparaciones por `['simulated','calculada'].includes(...)`.

---

## FIX-012 — Panel Mercado admin usaba campos inexistentes

**Fecha:** 2026-05
**Archivo:** `public/app.js`
**Causa:** `loadAdminMercado` usaba `s.participacion`, `s.mercadoFormal` (Bs),
`s.precioRetailProm`, `s.demandaFormalUnid`, `s.canalPreferido` — ninguno existe
en la respuesta de `calcularMercadoSegmentos`.
**Fix:** usar campos reales: `demandaBase`, `pctContrabando`, `demandaFormal`,
`tasaCrecimiento`, `tendencia`.

---

## FIX-013 — Panel Créditos no cruzaba equipos correctamente

**Fecha:** 2026-05
**Archivo:** `public/app.js`
**Verificación:**
```bash
grep -c "equipoOriginal.*eq\.id" public/app.js  # ≥1
```
**Causa:** `rd.resultados.find(r => r.equipo === eq.id)` comparaba ID expandido
(`eq_xxx__prod_1`) con ID base (`eq_xxx`) → nunca encontraba → panel vacío.
**Fix:** `r.equipoOriginal === eq.id || r.equipo === eq.id || r.equipo?.startsWith(eq.id)`.

---

## FIX-014 — Balance General no cuadraba (3 causas simultáneas)

**Fecha:** 2026-05
**Archivo:** `src/engine.js`
**Verificación:**
```bash
grep -c "camposEmpresa"      src/engine.js  # ≥2
grep -c "utilidadNeta_operat" src/engine.js # ≥4
grep -c "pagoOperarios"      src/engine.js  # ≥3
```

**Causa A — contratarVendedores reseteado a 0 por expansión multiproducto:**
`expandirDecisionesMultiproducto` hacía `{ ...empresa, ...producto }`.
`productos[0].contratarVendedores=0` sobrescribía el valor correcto de la raíz.
Fix: agregar `...camposEmpresa` al final del spread para restaurar campos de empresa.

**Causa B — costoOperarios en gastosOp pero NO en totalPagos:**
Cash inflado → Assets > L+E.
Fix: `const pagoOperarios = d.costoOperarios || 0` agregado a totalPagos.

**Causa C — IVA+IT en totalPagos pero NO en utilidadNeta:**
Impuestos reducían caja pero no el P&L → patrimonio inflado.
Fix:
```js
let utilidadNeta_operat = roundBs(utilidadBruta - gastosOp);
let utilidadNeta = utilidadNeta_operat;
// ... después de calcular impuestos:
utilidadNeta = roundBs(utilidadNeta_operat - totalImpuestos);
```

**Verificación matemática:** Activos = Pasivos + Patrimonio ✅ para los 3 equipos.

---

## FIX-015 — roundState no reseteado → currentRound=0 → simulación guardaba en Ronda 0

**Fecha:** 2026-05
**Archivos:** `reset_rondas.js`, `fix_roundstate.js`, `fix_ronda.js`

**Causa:** `reset_rondas.js` borraba `sim_rondas` y limpiaba `rondas={}` pero dejaba
`roundState='simulated'` y `currentRound` sin resetear en `config`.
Cuando el admin activaba la hoja nueva, el currentRound=0 hacía que la simulación
guardara resultados en Ronda 0 en lugar de Ronda 1. El endpoint `/api/resultados`
iteraba `for(i=1; i<=currentRound=0)` → no iteraba → historial vacío.

**Fix en reset_rondas.js:**
```sql
UPDATE simulaciones SET estado='activa', rondas='{}',
  config = config
    || '{"roundState":"pending"}'::jsonb
    || '{"currentRound":0}'::jsonb
```
Nota: currentRound se resetea a 0 correctamente porque el servidor lo incrementa
a 1 al abrir la Ronda 1. El bug era que roundState='simulated' bloqueaba la apertura.

**Scripts de corrección one-time:**
- `fix_roundstate.js` — resetea roundState=pending, currentRound=0
- `fix_ronda.js` — mueve resultados Y decisiones de Ronda 0 → Ronda 1
- `fix_decisiones.js` — mueve solo decisiones de Ronda 0 → Ronda 1
