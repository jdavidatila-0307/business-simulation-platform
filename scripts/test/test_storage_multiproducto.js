const assert = require('assert');
const storage = require('../../src/storage');

const { construirDecisionesCanonicas } = storage._test;

function row(equipoId, productoId, decisiones) {
  return {
    equipo_id: equipoId,
    producto_id: productoId,
    decisiones,
    enviada_at: '2026-07-04T17:29:30.104Z',
  };
}

function decision(rows, equipoId = 'eq_x') {
  return construirDecisionesCanonicas(rows)[equipoId];
}

{
  const d = decision([
    row('eq_x', 'prod_1', { equipo: 'eq_x', productoId: 'prod_1', producto: 'Producto unico' }),
  ]);
  assert.strictEqual(d.productos.length, 1);
  assert.strictEqual(d.productos[0].productoId, 'prod_1');
  assert.strictEqual(d.productos[0].producto, 'Producto unico');
}

{
  const d = decision([
    row('eq_x', 'prod_1', {
      equipo: 'eq_x',
      producto: 'Sneaker Cultural Premium',
      productos: [
        { productoId: 'prod_1', producto: 'Sneaker Cultural Premium' },
        { productoId: 'prod_2', producto: 'Calzado Medico Especializado' },
      ],
    }),
    row('eq_x', 'prod_2', { productoId: 'prod_2', producto: 'Calzado Medico Especializado' }),
  ]);
  assert.strictEqual(d.productos.length, 2);
  assert.deepStrictEqual(d.productos.map(p => p.productoId), ['prod_1', 'prod_2']);
  assert.deepStrictEqual(d.productos.map(p => p.producto), ['Sneaker Cultural Premium', 'Calzado Medico Especializado']);
}

{
  const d = decision([
    row('eq_x', 'prod_1', {
      equipo: 'eq_x',
      producto: 'Sneaker Cultural Premium',
      productos: [
        { productoId: 'prod_1', producto: 'Sneaker Cultural Premium' },
        { productoId: 'prod_2', producto: 'Producto stale' },
      ],
    }),
    row('eq_x', 'prod_2', { productoId: 'prod_2', producto: 'Calzado Medico Especializado' }),
  ]);
  assert.strictEqual(d.productos[1].producto, 'Calzado Medico Especializado');
}

{
  const d = decision([
    row('eq_x', 'prod_1', { equipo: 'eq_x', productoId: 'prod_1', producto: 'Mismo nombre' }),
    row('eq_x', 'prod_2', { productoId: 'prod_2', producto: 'Mismo nombre' }),
  ]);
  assert.strictEqual(d.productos.length, 2);
  assert.deepStrictEqual(d.productos.map(p => p.productoId), ['prod_1', 'prod_2']);
}

{
  const d = decision([
    row('eq_x', 'prod_2', { productoId: 'prod_2', producto: 'Segundo sin principal' }),
  ]);
  assert.strictEqual(d.productos.length, 1);
  assert.strictEqual(d.productos[0].productoId, 'prod_2');
  assert.strictEqual(d.productoId, 'prod_2');
}

{
  const d = decision([
    row('eq_mqsqu44b_raiz_mqsrj8en', 'prod_1', {
      equipo: 'eq_mqsqu44b_raiz_mqsrj8en',
      producto: 'Sneaker Cultural Premium',
      productos: [
        { productoId: 'prod_1', producto: 'Sneaker Cultural Premium' },
        { productoId: 'prod_2', producto: 'Producto stale' },
      ],
    }),
    row('eq_mqsqu44b_raiz_mqsrj8en', 'prod_2', {
      productoId: 'prod_2',
      producto: 'Calzado Medico Especializado',
    }),
  ], 'eq_mqsqu44b_raiz_mqsrj8en');
  assert.strictEqual(d.productos.length, 2);
  assert.strictEqual(d.productos[0].producto, 'Sneaker Cultural Premium');
  assert.strictEqual(d.productos[1].producto, 'Calzado Medico Especializado');
}

console.log('storage multiproducto OK');
