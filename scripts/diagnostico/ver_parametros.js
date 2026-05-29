/**
 * ver_parametros.js
 * Lee todos los parámetros actuales de la BD
 * Ejecutar: node ver_parametros.js
 */
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 15000,
});

const SIM_ID = 'sim_mpi8g7y5';

async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT 
         parametros,
         config->'proveedores'    as proveedores,
         config->'params'         as config_params,
         tipos_producto,
         canales,
         segmentos,
         competencia_externa
       FROM simulaciones WHERE id=$1`,
      [SIM_ID]
    );
    const row = r.rows[0];

    console.log('\n📋 PARÁMETROS (columna parametros):');
    const params = row.parametros || {};
    Object.keys(params).sort().forEach(k => {
      console.log(`  ${k.padEnd(45)} ${params[k]}`);
    });

    console.log('\n⚙️ CONFIG proveedores:');
    const provs = row.proveedores || [];
    if (provs.length) {
      provs.forEach(p => {
        console.log(`  ${p.id}: factorCosto=${p.factorCosto} calidad=${p.calidad} leadTime=${p.leadTime} loteMin=${p.loteMin} loteMax=${p.loteMax}`);
      });
    } else console.log('  (vacío)');

    console.log('\n👟 TIPOS DE PRODUCTO:');
    const tipos = row.tipos_producto || {};
    Object.entries(tipos).forEach(([k,v]) => {
      console.log(`  ${k.padEnd(45)} costoBase=${v.costoBase}`);
    });

    console.log('\n🎯 SEGMENTOS:');
    const segs = row.segmentos || [];
    segs.forEach(s => {
      console.log(`  ${(s.nombre||'').padEnd(48)} demandaBase=${s.demandaBase} pctContrabando=${s.pctContrabando}`);
    });

    console.log('\n📦 CANALES:');
    const canales = row.canales || {};
    Object.entries(canales).forEach(([k,v]) => {
      console.log(`  ${k.padEnd(35)} costoAdicional=${v.costoAdicionalUnitario} comision=${v.comisionPct}`);
    });

    console.log('\n🤝 COMPETENCIA EXTERNA:');
    const comp = row.competencia_externa || [];
    comp.forEach(c => {
      console.log(`  ${(c.nombre||'').substring(0,42).padEnd(44)} precio=${c.precio} calidad=${c.calidad}`);
    });

  } finally { client.release(); await pool.end(); }
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
