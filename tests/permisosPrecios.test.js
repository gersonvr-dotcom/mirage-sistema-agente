import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import { ejecutarTool, puedeVerPrecios, sinCamposDePrecio } from '../src/agent/tools.js';

after(() => pool.end());

test('solo el administrador puede ver precios', () => {
  assert.equal(puedeVerPrecios({ rol: 'administrador' }), true);
  assert.equal(puedeVerPrecios({ rol: 'operador' }), false);
  assert.equal(puedeVerPrecios({}), false);
  assert.equal(puedeVerPrecios(undefined), false);
});

test('las tools de precios responden sin_permiso al operador y a quien no trae contexto', async () => {
  for (const ctx of [{ rol: 'operador' }, {}, undefined]) {
    for (const [tool, input] of [
      ['consultar_precios_cotizacion', { numero_cotizacion: '2026-001-XX' }],
      ['historial_precios_producto', { producto: 'PALMIRA' }],
    ]) {
      const r = await ejecutarTool(tool, input, ctx);
      assert.equal(r.error, 'sin_permiso', `${tool} con ${JSON.stringify(ctx)}`);
    }
  }
});

test('sinCamposDePrecio quita precios, moneda, descuento e importe y conserva el resto', () => {
  const [fila] = sinCamposDePrecio([
    { numero_op: 'OP-1', codigo: 'X', cantidad: 5, precio_unitario: 10, moneda: 'USD', descuento_pct: 5, importe_total: 47.5, costo_unitario: 6, costo_moneda: 'USD' },
  ]);
  assert.deepEqual(fila, { numero_op: 'OP-1', codigo: 'X', cantidad: 5 });
});

test('opSegunRol: el administrador recibe la OP intacta y los demás sin precios en las líneas', async () => {
  const { opSegunRol } = await import('../src/services/permisosPrecios.js');
  const op = { numero_op: 'OP-1', items: [{ id: 1, cantidad: 5, precio_unitario: 10, moneda: 'USD', importe_total: 50 }] };
  assert.equal(opSegunRol(op, 'administrador'), op);
  assert.deepEqual(opSegunRol(op, 'operador'), { numero_op: 'OP-1', items: [{ id: 1, cantidad: 5 }] });
  assert.deepEqual(opSegunRol(op, undefined).items, [{ id: 1, cantidad: 5 }]);
  assert.equal(opSegunRol(null, 'operador'), null);
  assert.ok('precio_unitario' in op.items[0], 'no debe mutar el original');
});
