# Diccionario de Decisiones R1–R20 — SimNego v3.2

## 1. Propósito

Este documento define las referencias pedagógicas oficiales para la Hoja de Decisión R1–R20. Su función es mantener coherencia entre los textos visibles, el Manual del Estudiante, el Manual del Profesor y el comportamiento real del simulador.

No sustituye las reglas del motor: documenta cómo explicarlas de forma clara, breve y verificable.

## 2. Principios de redacción

- Toda referencia debe coincidir con el comportamiento real del motor.
- No se deben mencionar segmentos, productos o canales fijos cuando provengan de la industria configurada.
- No se deben prometer efectos no implementados.
- Las ayudas deben distinguir entre decisión del estudiante, parámetro docente, resultado calculado y regla económica.
- Las referencias deben servir para industrias actuales y futuras.
- El lenguaje debe ser claro para estudiantes, pero correcto técnicamente.
- El texto visible en UI debe ser corto; el manual puede contener la explicación ampliada.
- Una ayuda debe describir efectos posibles y condiciones, no garantizar resultados comerciales.

## 3. Variables de decisión inventariadas

| Categoría | Decisión visible | Campo técnico | Archivo/función | Visible | Condición | Estado actual de ayuda | Observación |
|---|---|---|---|---|---|---|---|
| Producto y mercado | Segmento objetivo | `segmentoObjetivo` | `equipo-hoja.js` / `hojaRenderRonda` | Sí | Por industria | Contradictoria | El texto “7 segmentos” no es dinámico. |
| Producto y mercado | Producto | `producto` | Igual | Sí | Por industria | Incompleta | El catálogo y costo base son dinámicos. |
| Producto y mercado | Canal principal/secundario | `canalPrincipal`, `canalSecundario` | Igual | Sí | Por industria | Incompleta | El secundario combina efectos según configuración. |
| Precio y calidad | Calidad | `calidad` | Igual | Sí | Siempre | Riesgosa | No debe usar un costo fijo por punto. |
| Precio y calidad | Precio | `precioVenta` | Igual | Sí | Siempre | OK | Afecta atractivo y facturación. |
| Marketing | Publicidad, promoción, eventos, redes, RRPP | campos homónimos | Igual | Sí | Por producto | Parcial | El motor suma los rubros como marketing efectivo. |
| Producción | Producción | `produccion` | Igual | Sí | Por módulo | Incompleta | La producción real puede ser limitada. |
| Producción | Operarios actuales | `operariosIniciales` | Igual | Sí | Sólo lectura | OK | Se propagan desde la ronda anterior. |
| Producción | Contratar/despedir/capacitar operarios | `contratarOperarios`, `despedirOperarios`, `montoCapacitacion` | Igual | Sí | Módulo; Producto 1 | Parcial | Afectan capacidad y costo laboral. |
| Materia prima | Proveedor y cantidad a pedir | `proveedorElegido`, `cantidadMPpedida` | Igual | Sí | Módulo e industria | OK | Dependen de proveedores configurados. |
| Materia prima | Stock MP | `stockMPInicial` | Igual | Sí | Sólo lectura | OK | Incluye heredado y pedidos recibidos. |
| Personal comercial | Vendedores actuales | `vendedoresIniciales` | Igual | Sí | Sólo lectura | Incompleta | Su efecto depende del canal. |
| Personal comercial | Contratar/despedir vendedores | `contratarVendedores`, `despedirVendedores` | Igual | Sí | Producto 1 | Parcial | Se aplica a toda la empresa. |
| Finanzas | Tipo, monto y plazo de préstamo | `tipoPrestamo`, `montoPrestamo`, `plazoPrestamo` | Igual | Sí | Producto 1 | Riesgosa | El plazo se captura, pero no modifica cálculos del motor. |
| Finanzas | Amortización | `amortizacion` | Igual | Sí | Producto 1 | Incompleta | Reduce deuda y consume caja. |
| Innovación | Activar, tipo y monto | `innovacion`, `tipoInnovacion`, `montoInnovacion` | Igual | Sí | Por producto | OK | El efecto depende del tipo. |
| Investigación | Tipo de reporte | `tipoInvestigacion` | Igual | Sí | Producto 1 | Parcial | Compra información; no genera ventas automáticamente. |
| Resultados | Caja, deuda, CxC, inventario y KPIs | resultados | `hojaKpiHTML` | Sí | Sólo lectura | No aplica | Son resultados calculados, no decisiones. |

## 4. Diccionario oficial de referencias

| Categoría | Decisión visible | Qué decide el estudiante | Qué afecta | Qué NO debe prometer | Referencia corta recomendada para UI | Referencia ampliada para manual | Riesgo si se explica mal | Prioridad |
|---|---|---|---|---|---|---|---|---|
| Mercado | Segmento objetivo | Mercado objetivo | Afinidad y competencia del segmento | Cantidad fija de segmentos | Grupo de clientes al que orientarás tu estrategia. Los segmentos disponibles dependen de la industria configurada por el profesor. | El segmento debe ser consistente con producto, precio, canal y propuesta de valor. | Elegir con información falsa. | Crítica |
| Mercado | Producto | Producto con que compite | Costo base, afinidad y oferta | Que todos tienen el mismo costo o demanda | Producto con el que competirás en el mercado. Debe ser coherente con el segmento objetivo, precio, canal y propuesta de valor. | Las opciones dependen de la industria activa. | Estrategia incoherente. | Alta |
| Mercado | Canal principal | Canal prioritario | Costos, comisiones, atractivo y vendedores según industria | Resultados garantizados | Canal más importante para llegar al cliente. Puede afectar costos, comisiones, atractivo y necesidad de vendedores según la industria. | Los efectos exactos dependen de la configuración del canal. | Subestimar costos/comisiones. | Alta |
| Mercado | Canal secundario | Canal complementario | Combina efectos con canal principal | Que duplica ventas | Canal complementario. Sus efectos se combinan con el canal principal según la configuración del simulador. | El motor promedia efectos configurados cuando se usan ambos canales. | Sobreestimar cobertura. | Media |
| Precio | Precio | Valor facturado al cliente | Atractivo, facturación, IVA y margen | Que mayor precio siempre mejora utilidad | Valor de venta al cliente. Un precio mayor puede mejorar margen, pero reducir atractivo si el mercado percibe alternativas más convenientes. | El resultado también depende de calidad, marketing, canales y competencia. | Decisiones de precio aisladas. | Alta |
| Calidad | Calidad | Nivel de desempeño percibido | Atractivo y costo unitario | Un incremento fijo de Bs 0,20 por punto | Nivel percibido de desempeño del producto. Mejorar calidad puede aumentar atractivo, pero también puede elevar el costo unitario según el producto y los parámetros de la industria. | El costo depende del costo base y parámetros configurados; no es universal. | Error financiero directo. | Crítica |
| Marketing | Publicidad | Inversión de visibilidad | Esfuerzo total de marketing | Ventas garantizadas | Inversión para aumentar visibilidad del producto dentro del esfuerzo total de marketing. | Su efecto se combina con los otros rubros de marketing. | Sobrepromesa. | Alta |
| Marketing | Promoción | Incentivo comercial | Esfuerzo total de marketing | Que es más eficaz que publicidad | Incentivo comercial para estimular la compra. Forma parte del esfuerzo total de marketing. | No afirmar eficacia diferencial sin una regla específica. | Decisión basada en regla inexistente. | Crítica |
| Marketing | Eventos | Contacto comercial | Esfuerzo total de marketing | Que aumenta ventas directamente | Acción comercial de contacto directo con clientes. Contribuye al esfuerzo total de marketing. | No existe un multiplicador individual de ventas confirmado. | Sobrepromesa. | Alta |
| Marketing | Redes | Comunicación digital | Esfuerzo total de marketing | Segmentos específicos no configurados | Comunicación digital para reforzar visibilidad, interacción y recordación. Debe adaptarse a la industria activa. | Evitar nombres fijos de segmentos. | Texto incompatible con otra industria. | Crítica |
| Marketing | RRPP | Gestión de confianza | Esfuerzo total de marketing | Reputación acumulada no modelada | Acción para fortalecer reputación y confianza del mercado. Forma parte del esfuerzo total de marketing. | No afirmar una acumulación de reputación si no existe regla confirmada. | Atribuir efecto inexistente. | Alta |
| Producción | Producción planificada | Unidades a fabricar | Inventario, costos y ventas posibles | Que se fabricará siempre lo ingresado | Cantidad que deseas fabricar. La producción real puede ser menor si faltan capacidad de planta, operarios o materia prima. | El motor limita producción por la menor de las capacidades aplicables. | Inventario y caja mal planificados. | Crítica |
| Producción | Operarios | Dotación productiva | Capacidad efectiva y costo laboral | Que la planta sola permite producir | Personal productivo que permite utilizar la capacidad de planta. | La capacidad efectiva depende de operarios, productividad y capacitación. | Capacidad ociosa. | Alta |
| Producción | Contratar operarios | Nueva dotación | Capacidad y costo laboral | Efecto sin costo | Aumenta la capacidad productiva efectiva, pero incrementa costos laborales. | Tiene costo de contratación y salario trimestral. | Falta de caja. | Alta |
| Producción | Despedir operarios | Reducir dotación | Capacidad y costo de despido | Ahorro inmediato sin efecto operativo | Reduce costos laborales futuros, pero puede limitar la producción efectiva. | Existe costo de despido y la capacidad queda limitada por dotación final. | Falta de capacidad. | Alta |
| Producción | Capacitación | Inversión en personal | Productividad según parámetro | Beneficio universal fijo | Inversión para mejorar productividad o desempeño del personal según la regla configurada. | El efecto se define por parámetros de la industria. | Promesa cuantitativa incorrecta. | Media |
| Producción | Capacidad de planta | Límite técnico informado | Máximo técnico por equipo | Que es la única restricción | Límite técnico de producción configurado para tu equipo. | Debe leerse junto con operarios y MP disponibles. | Producción imposible. | Alta |
| Producción | Bloqueo R1 Fase 0 | No es decisión | Producción final R1 | Que aplica a toda simulación | Si la simulación inició con Fase 0, la maquinaria puede requerir instalación y R1 puede quedar sin producción. | Es una regla condicionada por modo de inicio, no una pérdida de capacidad. | Planificación R1 errónea. | Alta |
| Materia prima | Proveedor | Fuente de insumos | Factor de costo y tiempo de entrega | Entrega inmediata salvo lead time 0 | Fuente de materia prima. Puede variar en costo, calidad, lote mínimo, lote máximo y tiempo de entrega. | Cada opción depende de la industria configurada. | Quiebre de stock. | Alta |
| Materia prima | Cantidad pedida | Pedido de insumos | Stock futuro y almacenamiento | Llegada inmediata | Insumos solicitados para producir. Deben planificarse considerando inventario, producción esperada y lead time. | Un pedido puede quedar en tránsito. | Producción no realizable. | Alta |
| Personal comercial | Vendedores | Dotación comercial | Atractivo según canal y costo | Mismo impacto en cualquier canal | Personal comercial que ayuda a ejecutar la estrategia de ventas. Su impacto depende del canal utilizado. | El factor de impacto proviene de la configuración del canal. | Gasto comercial ineficiente. | Alta |
| Finanzas | Préstamo | Tipo y monto de crédito | Caja, deuda, intereses y comisión | Financiamiento gratuito | Financiamiento que aumenta caja, pero genera deuda, intereses y posible comisión. | Diferenciar préstamo operativo e inversión sin prometer resultados. | Endeudamiento mal entendido. | Alta |
| Finanzas | Plazo de préstamo | Dato referencial | Actualmente no altera interés/deuda calculados | Que modifica intereses | Campo referencial de la condición del préstamo. No debe presentarse como una variable que modifica intereses si el motor no lo calcula. | Hallazgo funcional: definir e implementar regla antes de prometer efecto. | Regla inexistente. | Crítica |
| Finanzas | Amortización | Pago de principal | Deuda y caja | Que sólo es gasto | Pago parcial de deuda. Reduce obligaciones, pero consume caja. | El interés y el principal deben explicarse por separado. | Falta de liquidez. | Alta |
| Finanzas | Sobregiro | No es decisión directa | Caja, deuda e interés | Que el estudiante lo solicita manualmente | Financiamiento automático de emergencia cuando la caja queda negativa. No es una decisión directa del estudiante. | Debe presentarse como alerta de liquidez. | Confusión de control. | Media |
| Innovación | Innovación y monto | Inversión estratégica | Costo o atractivo según tipo | Que toda innovación aumenta ventas | Inversión estratégica para mejorar producto, proceso o canal. Su efecto depende del tipo elegido. | Se desembolsa en el período y no garantiza ventas. | Sobreinversión. | Alta |
| Innovación | Producto / proceso / canal | Tipo de innovación | CU o atractivo | Efecto idéntico | Producto puede elevar CU; proceso puede reducirlo; canal puede mejorar atractivo comercial. | El detalle depende de monto, producción y parámetros. | Elección incorrecta de tipo. | Alta |
| Investigación | Básica / Premium / Estratégica | Nivel de información | Reporte disponible y costo | Que aumenta ventas | Compra de información para decidir mejor. No genera ventas automáticamente. | Cada nivel amplía el reporte posterior según su definición. | Confundir información con demanda. | Crítica |

## 5. Referencias por bloque de decisión

### 5.1 Producto y mercado

Aplicar las referencias de Segmento, Producto, Canal principal y Canal secundario de la tabla oficial. Productos, segmentos y canales son datos de industria; la UI no debe contener nombres específicos.

### 5.2 Precio y calidad

El precio afecta atractivo competitivo y facturación. La calidad afecta atractivo y costo unitario de manera dependiente del producto y de parámetros docentes; no usar equivalencias monetarias fijas.

### 5.3 Marketing

Publicidad, promoción, eventos, redes y RRPP integran el esfuerzo total de marketing. Hasta que el motor implemente multiplicadores individuales, ninguna ayuda debe afirmar eficacia relativa, impacto directo en ventas o efecto exclusivo por segmento.

### 5.4 Producción y capacidad

La producción real está limitada por producción planificada, capacidad efectiva de operarios, materia prima disponible y capacidad máxima de planta. En inicio por Fase 0, R1 puede quedar bloqueada por instalación de maquinaria, sin perder la capacidad adquirida.

### 5.5 Materia prima y proveedores

Proveedor, cantidad de MP, stock y lead time dependen del catálogo de proveedores de la industria. Lote mínimo/máximo sólo debe mostrarse si el motor o la validación realmente lo aplica; actualmente son atributos informativos del proveedor.

### 5.6 Personal comercial

Los vendedores, contrataciones y despidos son decisiones de empresa administradas desde Producto 1. El impacto comercial está condicionado por el canal; costos de contratación, despido y sueldo son parámetros docentes.

### 5.7 Finanzas

Tipo y monto de préstamo afectan caja, deuda, interés y comisión. Amortización reduce principal y consume caja. El sobregiro es automático cuando la caja preliminar es negativa. El plazo es un hallazgo funcional: no debe declararse como determinante de interés mientras el motor no lo use.

### 5.8 Innovación

Activar innovación y escoger tipo/monto es una decisión por producto. Producto incrementa el componente de costo; proceso lo reduce; canal agrega atractivo. Patentes de Fase 0 sólo potencian Proceso cuando aplica la regla configurada.

### 5.9 Investigación de mercado

La investigación Básica, Premium y Estratégica compra reportes progresivamente más completos. Es información para decidir en rondas posteriores; no modifica por sí misma la demanda, producción ni ventas.

## 6. Textos que deben evitarse

- “7 segmentos disponibles”, salvo que el número se calcule dinámicamente y sea real.
- “Natural y Cosmético”, salvo que la industria activa tenga exactamente esos segmentos.
- “+0,20 Bs/unid por punto de calidad”.
- “Promoción es más efectiva que publicidad”, si el motor no diferencia eficacia.
- “Eventos aumentan ventas directamente”, si el motor sólo suma marketing.
- “RRPP genera reputación acumulada”, si no existe regla confirmada.
- “El plazo modifica intereses”, si el motor no usa plazo.
- “La investigación aumenta ventas”, porque sólo entrega información/reportes.
- Referencias a productos, canales o segmentos de una industria específica dentro de una ayuda universal.

## 7. Recomendaciones para implementación UI

### Bloque R1 — Textos críticos

Segmento objetivo, calidad, marketing en redes, promoción/eventos/RRPP, producción, plazo de préstamo e investigación.

### Bloque R2 — Producción y personal

Producción efectiva, operarios, planta, MP, lead time y vendedores por canal.

### Bloque R3 — Finanzas

Préstamos, deuda, caja, intereses, amortización y sobregiro.

### Bloque R4 — Manuales

Incorporar el diccionario al Manual del Estudiante y al Manual del Profesor, sin ampliar promesas más allá de las reglas verificadas.

## 8. Recomendaciones para nueva industria alimentaria

- Usar “segmentos configurados por la industria”, “productos disponibles” y “canales configurados”.
- No mencionar calzado ni segmentos de otra industria.
- Calidad puede representar inocuidad, sabor, valor nutricional, empaque o funcionalidad según la industria.
- Los proveedores pueden representar ingredientes, empaques, insumos naturales o importados.
- Explicar marketing como esfuerzo comercial total.
- Explicar investigación como compra de información para decidir mejor.

## 9. Matriz de prioridad

| Variable | Problema actual | Severidad | Acción recomendada | ¿Motor? | ¿BD? | ¿Sólo UI? |
|---|---|---|---|---|---|---|
| Segmento | Número fijo incorrecto | Crítica | Texto dinámico/universal | No | No | Sí |
| Calidad | Costo fijo falso | Crítica | Sustituir por efecto condicionado | No | No | Sí |
| Redes | Segmentos fijos inexistentes | Crítica | Texto universal | No | No | Sí |
| Promoción/eventos/RRPP | Eficacia no modelada | Alta | Eliminar comparativos/promesas | No | No | Sí |
| Producción | Restricciones incompletas | Alta | Explicar límites y R1 condicionado | No | No | Sí |
| Vendedores | Falta condición por canal | Alta | Añadir referencia condicionada | No | No | Sí |
| Préstamo | Explicación financiera parcial | Alta | Aclarar caja/deuda/interés/comisión | No | No | Sí |
| Plazo | Campo sin efecto económico | Crítica | Documentar y decidir corrección funcional | Sí, si se quiere efecto | No | Sí, sólo para no prometer efecto |
| Investigación | Puede confundirse con demanda | Alta | Explicar que compra información | No | No | Sí |

## 10. Veredicto

Corregir primero Segmento, Calidad, Redes, Promoción/Eventos/RRPP, Producción, Plazo de préstamo e Investigación. Precio, Canal secundario, Proveedor, Innovación y los niveles de investigación son aceptables con ajustes menores de contexto.

El principal hallazgo funcional es `plazoPrestamo`: el formulario lo captura, pero el motor no lo usa para calcular intereses ni deuda. No debe modificarse el motor sin una prueba pura y una definición económica aprobada.

Las correcciones de texto, clasificación y referencias pueden realizarse sólo en UI en una fase posterior. No se requiere BD ni tocar la simulación real para esas mejoras.
