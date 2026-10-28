import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarFabrica, fabricaUnica } from '../src/services/proveedores.js';
import { valorDeRotulo, esRotuloFabrica } from '../src/services/opFolders.js';

test('normalizarFabrica deja mayúsculas y espacios normalizados y descarta marcadores vacíos', () => {
  assert.equal(normalizarFabrica('  Mirage '), 'MIRAGE');
  assert.equal(normalizarFabrica('progress   profile'), 'PROGRESS PROFILE');
  for (const v of [null, undefined, '', '  ', 'N/A', 'n/a', '-', '.', 'PENDIENTE', 'Por definir']) {
    assert.equal(normalizarFabrica(v), null, JSON.stringify(v));
  }
});

test('normalizarFabrica unifica los alias de una misma fábrica (PROGRESS = PROGRESS PROFILE)', () => {
  assert.equal(normalizarFabrica('PROGRESS'), 'PROGRESS PROFILE');
  assert.equal(normalizarFabrica(' progress profile '), 'PROGRESS PROFILE');
  assert.equal(normalizarFabrica('Progress Profiles'), 'PROGRESS PROFILE');
  assert.equal(normalizarFabrica('MIRAGE'), 'MIRAGE');
});

test('fabricaUnica rechaza varias fábricas juntas porque no se sabe a qué línea corresponde cada una', () => {
  assert.equal(fabricaUnica('MIRAGE'), 'MIRAGE');
  assert.equal(fabricaUnica('MIRAGE / PROGRESS'), null);
  assert.equal(fabricaUnica('MIRAGE, HARMONY'), null);
  assert.equal(fabricaUnica('MIRAGE Y PROGRESS'), null);
  assert.equal(fabricaUnica('MIRAGE + VITACER'), null);
  assert.equal(fabricaUnica('N/A'), null);
});

test('valorDeRotulo toma la primera celda con valor a la derecha del rótulo (las combinadas se repiten)', () => {
  const filas = [
    [undefined, null, null],
    // índice 0 vacío (ExcelJS cuenta desde 1)
    [undefined, null, 'Fábrica:', 'Fábrica:', 'MIRAGE', null, 'Ubic. Proyecto', 'GUANACASTE'],
    [undefined, null, 'Moneda:', 'Moneda:', 'EUR'],
  ];
  assert.equal(valorDeRotulo(filas, esRotuloFabrica), 'MIRAGE');
  assert.equal(valorDeRotulo(filas, (t) => t.startsWith('MONEDA')), 'EUR');
  assert.equal(valorDeRotulo(filas, (t) => t.startsWith('COTIZACI')), null);
});

test('valorDeRotulo: rótulo sin valor devuelve null y reconoce Fabrica sin tilde', () => {
  assert.equal(valorDeRotulo([[undefined, null, 'FABRICA', null, null]], esRotuloFabrica), null);
  assert.equal(valorDeRotulo([[undefined, null, 'Fabrica:', null, 'HARMONY']], esRotuloFabrica), 'HARMONY');
});
