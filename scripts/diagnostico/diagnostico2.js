const storage = require('./src/storage');

(async () => {
  // Usá el ID de la simulación que está activa ahora
  const simId = process.argv[2] || 'sim_mp69es52';
  
  const ronda = await storage.getRonda(simId, 1);
  
  console.log('Simulación ID:', simId);
  console.log('Estado de la ronda 1:', ronda?.estado || 'no encontrada');
  
  if (ronda?.resultados) {
    const equipos = Object.keys(ronda.resultados);
    console.log('Resultados guardados:', equipos.length + ' equipos');
    console.log('Equipos:', equipos.join(', '));
  } else {
    console.log('Resultados: vacío o no existe');
  }
  
  console.log('Dashboard:', ronda?.dashboard ? 'Sí' : 'No');
  
  process.exit(0);
})();