const { execSync } = require('child_process');
const code = execSync('git show 902e39a:public/app.js', { maxBuffer: 20*1024*1024 }).toString();
const lines = code.split('\n');
lines.forEach((line, i) => {
  if (line.includes('doActivarRonda') || line.includes('ronda/activar') || line.includes('Activar Hoja')) {
    console.log(`L${i+1}: ${line.trim()}`);
  }
});
