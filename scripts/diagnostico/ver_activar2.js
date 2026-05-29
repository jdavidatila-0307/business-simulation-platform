const { execSync } = require('child_process');
const code = execSync('git show 902e39a:public/app.js', { maxBuffer: 20*1024*1024 }).toString();
// Buscar contexto alrededor de btnActivarDash
const lines = code.split('\n');
lines.forEach((line, i) => {
  if (line.includes('btnActivarDash') || line.includes('activar') || line.includes('ronda/activar') || line.includes('/admin/ronda')) {
    console.log(`L${i+1}: ${line.trim()}`);
  }
});
