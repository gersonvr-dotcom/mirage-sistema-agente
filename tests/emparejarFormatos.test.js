import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emparejarFormatos } from '../src/services/syncProductos.js';

const xlsx = (lineaCatalogo, codColor, acabado, formato, total) => ({ lineaCatalogo, codColor, acabado, formato, total });
const bd = (id, codigo, acabado, cantidad) => ({ id, codigo, acabado, cantidad });

test('por posición: mismo orden y mismos códigos asigna el formato de cada línea (aunque el código se repita)', () => {
  const r = emparejarFormatos(
    [bd(1, 'GLOCAL-GC 07', 'NAT', '10.24'), bd(2, 'GLOCAL-GC 07', 'NAT', '5.40'), bd(3, 'LEMMY-LY 09', 'NAT', '2')],
    [xlsx('GLOCAL', 'GC 07', 'NAT', '80X80X9', 10.24), xlsx('GLOCAL', 'GC 07', 'NAT', '60X60X9', 5.4), xlsx('LEMMY', 'LY 09', 'NAT', '30X60X9', 2)]
  );
  assert.deepEqual(r, [{ id: 1, formato: '80X80X9' }, { id: 2, formato: '60X60X9' }, { id: 3, formato: '30X60X9' }]);
});

test('si el orden o la cantidad de líneas no coincide, empareja por código + acabado + cantidad', () => {
  const r = emparejarFormatos(
    [bd(1, 'GLOCAL-GC 07', 'NAT', '5.40'), bd(2, 'GLOCAL-GC 07', 'NAT', '10.24')],
    [xlsx('GLOCAL', 'GC 07', 'NAT', '80X80X9', 10.24), xlsx('GLOCAL', 'GC 07', 'NAT', '60X60X9', 5.4), xlsx('OTRA', 'X', 'NAT', '1X1', 1)]
  );
  assert.deepEqual(r, [{ id: 1, formato: '60X60X9' }, { id: 2, formato: '80X80X9' }]);
});

test('no adivina: dos líneas idénticas con formatos distintos quedan sin tocar', () => {
  const r = emparejarFormatos(
    [bd(1, 'A-1', 'NAT', '4'), bd(9, 'B-2', 'NAT', '3')],
    [xlsx('A', '1', 'NAT', '60X60X9', 4), xlsx('A', '1', 'NAT', '30X60X9', 4)]
  );
  assert.deepEqual(r, []);
});

test('líneas sin formato en el Excel no generan asignación', () => {
  assert.deepEqual(emparejarFormatos([bd(1, 'A-1', 'NAT', '4')], [xlsx('A', '1', 'NAT', null, 4)]), []);
});
