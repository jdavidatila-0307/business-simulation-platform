const { execSync } = require('child_process');
const code = execSync('git show 902e39a:public/app.js', {
  maxBuffer: 20 * 1024 * 1024,
  cwd: 'C:\\Win\\SimuladorNegocios'
}).toString();

require('fs').writeFileSync('app_stable_export.js', code, 'utf8');

// Analizar
const lines = code.split('\n');
console.log(`Total líneas: ${lines.length}`);

// Buscar cómo se cargan equipos/rondas/resultados
let found = 0;
lines.forEach((line, i) => {
  if (['requireSimSelected','adminDashboard','equipos','Equipos','rondas','Rondas',
       'resultados admin','adminResultados'].some(x => line.toLowerCase().includes(x.toLowerCase()))
    && !line.includes('//')) {
    if (found < 30) console.log(`L${i+1}: ${line.trim()}`);
    found++;
  }
});
console.log(`Total matches: ${found}`);
