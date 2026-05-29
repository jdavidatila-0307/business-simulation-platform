/**
 * cargar_proveedores.js
 * Carga proveedores al JSONB de la simulación activa sim_mpi8g7y5
 * Ejecutar: node cargar_proveedores.js
 */
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, ca: null, checkServerIdentity: () => undefined },
  connectionTimeoutMillis: 10000,
});

const SIM_ID = 'sim_mpi8g7y5';

const PROVEEDORES = [
  {
    id: 'prov_1', nombre: 'Proveedor Nacional (Santa Cruz)',
    costoMP: 12.0, calidad: 7, leadTime: 1, loteMin: 100, loteMax: 2000,
    descripcion: 'Materiales locales: suela EVA/goma, tela, velcro, plantillas estándar. Entrega en el trimestre. Mayor costo pero sin riesgo de stockout.'
  },
  {
    id: 'prov_2', nombre: 'Proveedor Importado (Brasil / China)',
    costoMP: 7.0, calidad: 5, leadTime: 2, loteMin: 200, loteMax: 4000,
    descripcion: 'Materiales importados: cuero sintético PU, TPU, gel de silicona, espumas especiales. Llega al siguiente trimestre. Menor costo pero requiere planificación anticipada.'
  }
];

async function main() {
  const client = await pool.connect();
  try {
    // 1. Verificar que la simulación existe y ver su estructura
    const check = await client.query(
      "SELECT id, nombre, config FROM simulaciones WHERE id = $1",
      [SIM_ID]
    );
    if (!check.rows.length) {
      console.error('ERROR: simulación no encontrada:', SIM_ID);
      process.exit(1);
    }
    console.log('✅ Simulación encontrada:', check.rows[0].nombre);

    // 2. Actualizar el campo proveedores DENTRO del JSONB usando jsonb_set
    // Esto agrega/reemplaza el campo "proveedores" dentro del objeto config
    await client.query(
      `UPDATE simulaciones 
       SET config = jsonb_set(
         COALESCE(config, '{}'::jsonb),
         '{proveedores}',
         $1::jsonb,
         true
       )
       WHERE id = $2`,
      [JSON.stringify(PROVEEDORES), SIM_ID]
    );
    console.log('✅ Proveedores escritos en config.proveedores');

    // 3. Verificar resultado
    const verify = await client.query(
      "SELECT config->'proveedores' as proveedores FROM simulaciones WHERE id = $1",
      [SIM_ID]
    );
    const provNuevos = verify.rows[0].proveedores || [];
    console.log('\n✅ Proveedores verificados:', provNuevos.length);
    provNuevos.forEach(p => {
      console.log(`  ${p.id}: ${p.nombre}`);
      console.log(`    costoMP: Bs ${p.costoMP}/unid | calidad: ${p.calidad}/10 | leadTime: ${p.leadTime} trim`);
    });

    if (provNuevos.length === 2) {
      console.log('\n✅ LISTO — Ejecuta el recalculador desde el panel Admin');
      console.log('   Panel profesor → Rondas → 🔄 Recalcular EF + Desglose CU');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
