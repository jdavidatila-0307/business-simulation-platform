/**
 * actualizar_proveedores_v2.js
 * Reemplaza costoMP absoluto por factorCosto relativo
 * Ejecutar: node actualizar_proveedores_v2.js
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
    ca: null,
    checkServerIdentity: () => undefined
  },
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis:       30000,
  max:                     3,
});

pool.on('error', (err) => {
  console.error('[pool error]', err.message);
});

const SIM_ID = 'sim_mpi8g7y5';

const PROVEEDORES_V2 = [
  {
    id:          'prov_1',
    nombre:      'Proveedor Nacional (Santa Cruz)',
    factorCosto: 1.00,
    calidad:     7,
    leadTime:    1,
    loteMin:     100,
    loteMax:     2000,
    descripcion: 'Materiales locales: suela EVA/goma, tela, velcro, plantillas estándar. Precio estándar de la industria. Entrega garantizada este trimestre.'
  },
  {
    id:          'prov_2',
    nombre:      'Proveedor Importado (Brasil / China)',
    factorCosto: 0.65,
    calidad:     5,
    leadTime:    2,
    loteMin:     200,
    loteMax:     4000,
    descripcion: 'Materiales importados: cuero sintético PU, TPU, espumas especiales. 35% más barato pero llega 2 trimestres después. Requiere planificación anticipada.'
  }
];

async function main() {
  console.log('Conectando a la base de datos...');
  
  // Retry con hasta 3 intentos
  let client;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      client = await pool.connect();
      console.log(`✅ Conexión establecida (intento ${intento})`);
      break;
    } catch(e) {
      console.log(`Intento ${intento} fallido: ${e.message}`);
      if (intento === 3) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  try {
    // 1. Verificar simulación
    const check = await client.query(
      "SELECT nombre FROM simulaciones WHERE id = $1",
      [SIM_ID]
    );
    if (!check.rows.length) {
      console.error('ERROR: simulación no encontrada:', SIM_ID);
      process.exit(1);
    }
    console.log('✅ Simulación:', check.rows[0].nombre);

    // 2. Actualizar proveedores Y pctMateriaPrima en config.params
    await client.query(
      `UPDATE simulaciones
       SET config = jsonb_set(
         jsonb_set(
           COALESCE(config, '{}'),
           '{proveedores}',
           $1::jsonb,
           true
         ),
         '{params,pctMateriaPrima}',
         '0.40'::jsonb,
         true
       )
       WHERE id = $2`,
      [JSON.stringify(PROVEEDORES_V2), SIM_ID]
    );
    console.log('✅ Proveedores y pctMateriaPrima actualizados');

    // 3. Verificar
    const verify = await client.query(
      `SELECT 
         config->'proveedores' as proveedores,
         config->'params'->'pctMateriaPrima' as pct
       FROM simulaciones WHERE id = $1`,
      [SIM_ID]
    );
    const prov = verify.rows[0].proveedores || [];
    console.log('\n✅ Proveedores verificados:', prov.length);
    prov.forEach(p => {
      console.log(`  ${p.id}: ${p.nombre}`);
      console.log(`    factorCosto=${p.factorCosto} | calidad=${p.calidad}/10 | leadTime=${p.leadTime} trim`);
    });
    console.log('\n✅ pctMateriaPrima:', verify.rows[0].pct);
    console.log('\n⚠️  Ejecuta el recalculador desde el panel Admin');
    console.log('   Panel profesor → Rondas → 🔄 Recalcular EF + Desglose CU');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
