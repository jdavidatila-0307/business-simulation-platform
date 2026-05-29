const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 30000,
});

async function main() {
  const client = await pool.connect();
  try {
    // Simular exactamente lo que hace el recalculador para R3 Raíz
    // Paso 1: getRonda R3
    const rondaRow = await client.query(
      `SELECT estado, resultados FROM sim_rondas
       WHERE simulacion_id=$1 AND numero=3`,
      ['sim_mpi8g7y5']
    );
    
    // Paso 2: decisiones con el fix
    const decRows = await client.query(
      `SELECT equipo_id, decisiones
       FROM sim_decisiones
       WHERE simulacion_id=$1 AND ronda_numero=3 AND producto_id='prod_1'
       ORDER BY enviada_at DESC`,
      ['sim_mpi8g7y5']
    );
    
    const decMap = {};
    for (const d of decRows.rows) {
      if (!decMap[d.equipo_id]) decMap[d.equipo_id] = d.decisiones;
    }
    
    const razDec = decMap['eq_mpi8g7y5_raz_mpibm6wt'];
    console.log('=== DECISIÓN RAZ R3 (lo que usará el recalculador) ===');
    console.log('equipo:', razDec?.equipo);
    console.log('productos:', razDec?.productos?.length);
    console.log('cajaInicial en decisión:', razDec?.cajaInicial);
    console.log('inventarioInicial en decisión:', razDec?.inventarioInicial);
    console.log('resultadoAcumuladoAnterior:', razDec?.resultadoAcumuladoAnterior);
    console.log('ivaAPagarAnterior:', razDec?.ivaAPagarAnterior);
    
    if (razDec?.productos) {
      razDec.productos.forEach((p,i) => {
        console.log(`  prod[${i}]: id=${p.productoId} invIni=${p.inventarioInicial} caja=${p.cajaInicial}`);
      });
    }
    
    // Paso 3: ver estadoEmpresa que vendría de R2
    const r2Res = rondaRow.rows[0]?.resultados?.resultados || {};
    const razR2Keys = Object.keys(r2Res).filter(k => k.includes('raz'));
    console.log('\n=== ESTADO R2 RAZ (para propagar a R3) ===');
    if (razR2Keys.length) {
      // Buscar en R2
      const r2Row = await client.query(
        `SELECT resultados FROM sim_rondas WHERE simulacion_id=$1 AND numero=2`,
        ['sim_mpi8g7y5']
      );
      const r2Obj = r2Row.rows[0]?.resultados?.resultados || {};
      const razR2 = r2Obj[Object.keys(r2Obj).find(k=>k.includes('raz'))];
      console.log('cajaFinal R2:', razR2?.cajaFinal);
      console.log('inventarioFinal R2:', razR2?.inventarioFinal);
      console.log('ivaAPagar R2:', razR2?.ivaAPagar);
      console.log('resultadoAcumulado R2:', razR2?.resultadoAcumulado);
    }
  } finally { client.release(); await pool.end(); }
}
main().catch(e => console.error('ERROR:', e.message));
