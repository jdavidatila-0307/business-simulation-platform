const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

const SIM_ORIGEN  = 'sim_mpi8g7y5';
const NUEVO_NOMBRE = 'COM540D_1_2026_Final';

function genId(prefix='sim') {
  return prefix + '_' + Math.random().toString(36).substr(2, 8);
}

async function main() {
  const client = await pool.connect();
  try {
    // 1. Leer simulación origen
    const { rows } = await client.query(
      `SELECT * FROM simulaciones WHERE id=$1`, [SIM_ORIGEN]
    );
    if (!rows.length) { console.error('Origen no encontrado'); return; }
    const orig = rows[0];
    console.log('Origen:', orig.nombre, '| owner:', orig.owner_id);

    // 2. Ver equipos en users JSONB
    const users = orig.users || {};
    const equipos = Object.entries(users).filter(([id,u]) => u.rol === 'equipo');
    console.log('Equipos encontrados:', equipos.length);
    equipos.forEach(([id,u]) => console.log(' -', u.nombre || id));

    // 3. Crear nuevos IDs para equipos
    const nuevosUsers = {};
    const mapEquipos = {};
    equipos.forEach(([oldId, u]) => {
      const nuevoId = genId('eq');
      mapEquipos[oldId] = nuevoId;
      nuevosUsers[nuevoId] = {
        ...u,
        id: nuevoId,
      };
    });

    // 4. Copiar admin si existe
    const admins = Object.entries(users).filter(([id,u]) => u.rol === 'admin');
    admins.forEach(([oldId, u]) => {
      const nuevoId = genId('adm');
      nuevosUsers[nuevoId] = { ...u, id: nuevoId };
    });

    // 5. Crear nueva simulación
    const nuevoSimId = genId('sim');
    const nuevoConfig = {
      ...(orig.config || {}),
      currentRound: 1,
      roundState: 'pending',
      totalRounds: orig.config?.totalRounds || 12,
    };

    await client.query(
      `INSERT INTO simulaciones
         (id, owner_id, nombre, descripcion, codigo_acceso, estado,
          config, parametros, tipos_producto, canales, segmentos,
          afinidad_matrix, competencia_externa, rondas, users, creada_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())`,
      [
        nuevoSimId,
        orig.owner_id,
        NUEVO_NOMBRE,
        orig.descripcion || '',
        orig.codigo_acceso || '1234',
        'activa',
        JSON.stringify(nuevoConfig),
        JSON.stringify(orig.parametros || {}),
        JSON.stringify(orig.tipos_producto || []),
        JSON.stringify(orig.canales || []),
        JSON.stringify(orig.segmentos || []),
        JSON.stringify(orig.afinidad_matrix || {}),
        JSON.stringify(orig.competencia_externa || {}),
        JSON.stringify({}),  // rondas vacías
        JSON.stringify(nuevosUsers),
      ]
    );

    console.log('\n✅ Nueva simulación creada:', nuevoSimId);
    console.log('Nombre:', NUEVO_NOMBRE);
    console.log('Equipos copiados:', equipos.length);
    console.log('Admins copiados:', admins.length);
    console.log('\n=== NUEVOS IDs DE EQUIPOS ===');
    equipos.forEach(([oldId, u]) => {
      console.log(`  ${u.nombre}: ${mapEquipos[oldId]}`);
    });
    console.log('\nCredencial equipos: 1234 (misma)');
    console.log('Panel Admin → Simulaciones → seleccionar', NUEVO_NOMBRE);

  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
