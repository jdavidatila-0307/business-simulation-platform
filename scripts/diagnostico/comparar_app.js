const fs = require('fs');
const path = require('path');

// Rutas de los archivos
const archivoAnterior = path.join(__dirname, 'Trabajo', 'App', 'appanterior.js');
const archivoActual   = path.join(__dirname, 'Trabajo', 'App', 'app.js');

// Cargar ambos archivos
const anterior = fs.readFileSync(archivoAnterior, 'utf8').split('\n');
const actual   = fs.readFileSync(archivoActual, 'utf8').split('\n');

const maxLen = Math.max(anterior.length, actual.length);
const cambios = [];

let bloque = null;

for (let i = 0; i < maxLen; i++) {
  const antLine = anterior[i] || '';
  const actLine = actual[i]   || '';

  if (antLine !== actLine) {
    if (!bloque) {
      bloque = {
        inicio: i + 1,
        lineasAnterior: [],
        lineasActual: [],
      };
    }
    bloque.lineasAnterior.push(antLine);
    bloque.lineasActual.push(actLine);
  } else {
    if (bloque) {
      bloque.fin = i;
      cambios.push(bloque);
      bloque = null;
    }
  }
}

if (bloque) {
  bloque.fin = maxLen;
  cambios.push(bloque);
}

// Mostrar resultados
if (cambios.length === 0) {
  console.log('✅ Los archivos son idénticos. No hay cambios.');
} else {
  console.log(`🔍 Se encontraron ${cambios.length} bloques de cambios:\n`);

  cambios.forEach((b, idx) => {
    console.log(`── Bloque ${idx + 1} ───────────────────────────────`);
    console.log(`  Líneas ${b.inicio}–${b.fin} del archivo ACTUAL:\n`);

    const ctxAntes = Math.max(0, b.inicio - 4);
    if (ctxAntes < b.inicio - 1) {
      console.log('  ... (contexto anterior) ...');
      for (let j = ctxAntes; j < b.inicio - 1; j++) {
        console.log(`  [${j + 1}] ${actual[j]}`);
      }
    }

    console.log(`  >>> LÍNEAS NUEVAS (${b.lineasActual.length} líneas):`);
    b.lineasActual.forEach((linea, k) => {
      console.log(`  [${b.inicio + k}] ${linea}`);
    });

    const ctxDespues = Math.min(actual.length, b.fin + 3);
    if (ctxDespues > b.fin) {
      console.log(`  ... (contexto posterior) ...`);
      for (let j = b.fin; j < ctxDespues; j++) {
        console.log(`  [${j + 1}] ${actual[j]}`);
      }
    }

    console.log('');
  });

  const totalLineasCambiadas = cambios.reduce((s, b) => s + b.lineasActual.length, 0);
  console.log(`📊 Total: ${cambios.length} bloques, ${totalLineasCambiadas} líneas modificadas.`);
}