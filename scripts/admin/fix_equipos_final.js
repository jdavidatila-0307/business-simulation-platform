const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

const SIM_NUEVO = 'sim_x3behohy';
const SIM_ORIGEN = 'sim_mpi8g7y5';

async function main() {
  const client = await pool.connect();
  try {
    // Leer equipos origen con todos sus datos
    const { rows } = await client.query(
      `SELECT users FROM simulaciones WHERE id=$1`, [SIM_ORIGEN]
    );
    const usersOrigen = rows[0]?.users || {};

    // Leer nueva simulación
    const { rows: rows2 } = await client.query(
      `SELECT users FROM simulaciones WHERE id=$1`, [SIM_NUEVO]
    );
    const usersNuevo = rows2[0]?.users || {};

    // Mapear por nombre: asignar password y miembros del origen al nuevo
    const nuevosEquipos = Object.entries(usersNuevo);
    const origenEquipos = Object.entries(usersOrigen).filter(([,u]) => u.rol === 'equipo');

    const usersActualizado = { ...usersNuevo };

    nuevosEquipos.forEach(([newId, newUser]) => {
      if (newUser.rol !== 'equipo') return;
      // Buscar el equipo origen por nombre
      const match = origenEquipos.find(([,u]) => u.nombre === newUser.nombre);
      if (!match) { console.log('⚠ Sin match:', newUser.nombre); return; }
      const [, origUser] = match;
      usersActualizado[newId] = {
        ...newUser,
        password:      origUser.password,
        passwordPlain: origUser.passwordPlain,
        miembros:      origUser.miembros || [],
      };
      console.log(`✅ ${newUser.nombre}: password=${origUser.passwordPlain} miembros=${origUser.miembros?.length || 0}`);
    });

    // Guardar en BD
    await client.query(
      `UPDATE simulaciones SET users=$1 WHERE id=$2`,
      [JSON.stringify(usersActualizado), SIM_NUEVO]
    );
    console.log('\n✅ Simulación actualizada con contraseñas y miembros reales');
    console.log('\n=== RESUMEN CREDENCIALES ===');
    Object.values(usersActualizado).filter(u=>u.rol==='equipo').forEach(u => {
      console.log(`${u.nombre}: ${u.passwordPlain}`);
    });
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
