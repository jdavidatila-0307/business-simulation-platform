const storage = require('./src/storage');
(async () => {
  const ronda = await storage.getRonda('sim_mp69es52', 1);
  const decisiones = ronda?.decisiones || {};
  for (const [id, dec] of Object.entries(decisiones)) {
    console.log('Equipo:', id, '| isBot:', dec.isBot, '| producto:', dec.producto, '| productos[0]:', dec.productos?.[0]?.producto);
  }
  process.exit(0);
})();