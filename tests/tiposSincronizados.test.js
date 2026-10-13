import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPOS_PEDIDO } from '../src/db/pedidoTipos.js';
import { TIPOS_CLIENTE } from '../src/db/clienteTipos.js';

// El cliente (Vite) no puede importar de src/, así que duplica las listas: este test avisa si se desincronizan.
const valoresDelCliente = (archivo) =>
  [...readFileSync(new URL(`../client/src/${archivo}`, import.meta.url), 'utf8').matchAll(/valor: '([^']+)'/g)].map((m) => m[1]);

test('los tipos de pedido del cliente coinciden con los del servidor', () => {
  assert.deepEqual(valoresDelCliente('pedidoTipos.js'), TIPOS_PEDIDO);
});

test('los tipos de cliente del cliente coinciden con los del servidor', () => {
  assert.deepEqual(valoresDelCliente('clienteTipos.js'), TIPOS_CLIENTE);
});
