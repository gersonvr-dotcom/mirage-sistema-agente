import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esOpAnulada } from '../src/services/syncComercial.js';
import { pool } from '../src/db/pool.js';
import { after } from 'node:test';

after(() => pool.end());

test('esOpAnulada detecta ANULADO/ANULADA como fragmento completo, sin distinguir mayúsculas', () => {
  assert.equal(esOpAnulada('ANULADO'), true);
  assert.equal(esOpAnulada('anulada'), true);
  assert.equal(esOpAnulada('ENTREGA PARCIAL | ANULADO'), true);
  assert.equal(esOpAnulada(' ANULADO | otra nota'), true);
});

test('esOpAnulada no marca notas que solo contienen la palabra ni valores vacíos', () => {
  assert.equal(esOpAnulada('NO ANULADO TODAVIA'), false);
  assert.equal(esOpAnulada('Se pidió anular el pedido'), false);
  assert.equal(esOpAnulada(''), false);
  assert.equal(esOpAnulada(null), false);
  assert.equal(esOpAnulada(undefined), false);
});
