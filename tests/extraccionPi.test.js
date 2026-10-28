import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarNumero, normalizarExtraccion, validarExtraccion } from '../src/services/extraccionPi.js';

const linea = (o) => ({ codigo: 'EY 02', descripcion: 'X', unidad: 'M2', cantidad: 100, cajas: 70, m2: 100, precio_unitario: 10, importe: 1000, es_cargo: false, ...o });
const pi = (lineas, totales) =>
  normalizarExtraccion({ tipo_documento: 'proforma_invoice', moneda: 'eur', lineas, totales: { cajas: null, m2: null, importe: null, ...totales } });

test('normalizarNumero maneja formato europeo y estadounidense', () => {
  assert.equal(normalizarNumero('4,320'), 4.32);
  assert.equal(normalizarNumero('19.796,94'), 19796.94);
  assert.equal(normalizarNumero('19,796.94'), 19796.94);
  assert.equal(normalizarNumero(12.5), 12.5);
  assert.equal(normalizarNumero(''), null);
  assert.equal(normalizarNumero(null), null);
  assert.equal(normalizarNumero('abc'), null);
});

test('una PI que cuadra con sus totales queda verificada', () => {
  const v = validarExtraccion(pi([linea({}), linea({ cantidad: 50, cajas: 35, m2: 50, importe: 500 })], { cajas: 105, m2: 150, importe: 1500 }));
  assert.equal(v.estado, 'verificada');
  assert.equal(v.controles.filter((c) => c.nombre.endsWith('_total')).length, 3);
});

test('un total que no cuadra pide revisión', () => {
  const v = validarExtraccion(pi([linea({})], { cajas: 70, m2: 100, importe: 1100 }));
  assert.equal(v.estado, 'requiere_revision');
  assert.ok(v.avisos.some((a) => a.startsWith('importe_total')));
});

test('los cargos suman al importe pero no a cajas ni m²', () => {
  const cargo = linea({ codigo: 'PACKAGING', unidad: 'EA', cantidad: 1, cajas: null, m2: null, precio_unitario: 50, importe: 50, es_cargo: true });
  const v = validarExtraccion(pi([linea({}), cargo], { cajas: 70, m2: 100, importe: 1050 }));
  assert.equal(v.estado, 'verificada');
});

test('línea con aritmética rota pide revisión aunque los totales cuadren', () => {
  const v = validarExtraccion(pi([linea({ precio_unitario: 12 })], { importe: 1000 }));
  assert.equal(v.estado, 'requiere_revision');
});

test('sin totales en el documento queda sin_control', () => {
  const v = validarExtraccion(pi([linea({})], {}));
  assert.equal(v.estado, 'sin_control');
});

test('perfiles en ML/EA: compara importe y omite cajas y m²', () => {
  const l = linea({ unidad: 'ML', cantidad: 30, cajas: null, m2: null, precio_unitario: 5, importe: 150 });
  assert.equal(validarExtraccion(pi([l], { importe: 150 })).estado, 'verificada');
});

test('documento que no es proforma o sin líneas pide revisión', () => {
  const recibo = normalizarExtraccion({ tipo_documento: 'recibo_o_pago', moneda: 'USD', lineas: [linea({})], totales: {} });
  assert.equal(validarExtraccion(recibo).estado, 'requiere_revision');
  assert.equal(validarExtraccion(pi([], {})).estado, 'requiere_revision');
});

test('normalizarExtraccion convierte textos numéricos y mayúsculas', () => {
  const e = normalizarExtraccion({ moneda: ' eur ', lineas: [{ codigo: ' A ', unidad: 'm2', cantidad: '4,320', importe: '10.5', es_cargo: false }], totales: { importe: '1.000,50' } });
  assert.equal(e.moneda, 'EUR');
  assert.equal(e.lineas[0].unidad, 'M2');
  assert.equal(e.lineas[0].cantidad, 4.32);
  assert.equal(e.totales.importe, 1000.5);
  assert.equal(e.tipo_documento, 'otro');
});

test('normalizarExtraccion unifica sinónimos de unidad (MQ, SQM → M2)', () => {
  const e = normalizarExtraccion({ lineas: [{ unidad: 'MQ' }, { unidad: 'sqm' }, { unidad: 'M²' }, { unidad: 'ML' }, { unidad: 'EA' }], totales: {} });
  assert.deepEqual(e.lineas.map((l) => l.unidad), ['M2', 'M2', 'M2', 'ML', 'EA']);
});
