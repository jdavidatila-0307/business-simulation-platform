const { execSync } = require('child_process');
const code = execSync('git show 902e39a:public/app.js', { maxBuffer: 10*1024*1024 }).toString();
const lines = code.split('\n');
lines.forEach((line, i) => {
  if (['admin-equipos','admin-rondas','admin-resultados',
       'equiposTable','rondasContent','adminResultados',
       "data-view === 'admin", 'setupNav', 'btn.dataset.view'].some(x => line.includes(x))) {
    console.log(`L${i+1}: ${line}`);
  }
});
