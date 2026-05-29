/**
 * Script de diagnóstico de conexión — SimNego
 * Prueba múltiples variantes del host de Supabase
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');

const BASE = process.env.DATABASE_URL;
if (!BASE) { console.error('DATABASE_URL no está definida'); process.exit(1); }

// Extraer componentes de la URL
const match = BASE.match(/postgresql:\/\/([^:]+):([^@]+)@([^:\/]+):(\d+)\/(.+)/);
if (!match) { console.error('Formato de URL no reconocido:', BASE); process.exit(1); }

const [, user, pass, host, port, db] = match;
console.log('\n=== Componentes de la URL ===');
console.log('  Usuario:', user);
console.log('  Host:   ', host);
console.log('  Puerto: ', port);
console.log('  Base:   ', db);

// Variantes a probar
const variantes = [
  { desc: 'URL original',             url: BASE },
  { desc: 'Puerto 6543 (transaction)',url: `postgresql://${user}:${pass}@${host}:6543/${db}` },
  { desc: 'Sin SSL verify',           url: `${BASE}?sslmode=no-verify` },
  { desc: 'Host sin .pooler',         url: `postgresql://${user}:${pass}@${host.replace('.pooler','').replace('aws-0-','db.')}:5432/${db}` },
];

async function probar(desc, url) {
  const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 5000 });
  try {
    await p.query('SELECT 1');
    console.log(`\n✅ FUNCIONA: ${desc}`);
    console.log(`   URL: ${url}`);
    await p.end();
    return true;
  } catch(e) {
    console.log(`❌ Falla: ${desc} — ${e.message}`);
    await p.end().catch(()=>{});
    return false;
  }
}

async function main() {
  console.log('\n=== Probando variantes de conexión ===');
  for (const v of variantes) {
    const ok = await probar(v.desc, v.url);
    if (ok) { process.exit(0); }
  }
  console.log('\n❌ Ninguna variante funcionó.');
  console.log('   Verifica la URL en: Supabase → Settings → Database → Connection string');
}

main().catch(e => { console.error(e.message); process.exit(1); });
