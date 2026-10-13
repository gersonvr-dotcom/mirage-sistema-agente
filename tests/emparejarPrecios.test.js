import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { emparejarPrecios, claveItem, buscarProveedorParecido } from '../src/services/syncCotizaciones.js';
import { pool } from '../src/db/pool.js';

after(() => pool.end());

const item = (id, codigo, cantidad, acabado = 'NAT') => ({ id, cantidad, clave: `${codigo}|${acabado}`, claveSinAcabado: `${codigo}|` });
const linea = (codigo, cantidadFinal, precioUnitario, acabado = 'NAT') => ({ clave: `${codigo}|${acabado}`, claveSinAcabado: `${codigo}|`, cantidadFinal, precioUnitario });

test('un mismo código en varios formatos con precios distintos se desambigua por cantidad', () => {
  const lineas = [linea('GLOCAL-GC 07', 10.24, 50), linea('GLOCAL-GC 07', 14.4, 50), linea('GLOCAL-GC 07', 5.4, 45), linea('GLOCAL-GC 07', 3.78, 32.46)];
  const items = [item(1, 'GLOCAL-GC 07', 3.78), item(2, 'GLOCAL-GC 07', 5.4), item(3, 'GLOCAL-GC 07', 10.24)];
  const { pares, ambiguos, sinCoincidencia } = emparejarPrecios(items, lineas);
  assert.deepEqual([...pares].map(([id, l]) => [id, l.precioUnitario]), [[1, 32.46], [2, 45], [3, 50]]);
  assert.deepEqual(ambiguos, []);
  assert.deepEqual(sinCoincidencia, []);
});

test('líneas repetidas con el mismo precio: si la cantidad no coincide, usa el precio único', () => {
  const lineas = [linea('GLOCAL-GC 07', 46.08, 40), linea('GLOCAL-GC 07', 41.76, 40)];
  const { pares, ambiguos } = emparejarPrecios([item(1, 'GLOCAL-GC 07', 30)], lineas);
  assert.equal(pares.get(1).precioUnitario, 40);
  assert.deepEqual(ambiguos, []);
});

test('varios precios posibles y ninguna cantidad coincide: queda ambiguo y no se asigna precio', () => {
  const lineas = [linea('X-1', 10, 20), linea('X-1', 12, 25)];
  const { pares, ambiguos } = emparejarPrecios([item(7, 'X-1', 99)], lineas);
  assert.equal(pares.size, 0);
  assert.deepEqual(ambiguos, [7]);
});

test('ítems sin línea equivalente en la cotización se reportan', () => {
  const { pares, sinCoincidencia } = emparejarPrecios([item(5, 'OTRO-9', 1)], [linea('X-1', 1, 10)]);
  assert.equal(pares.size, 0);
  assert.deepEqual(sinCoincidencia, [5]);
});

test('si la cotización no trae acabado, empareja solo por código', () => {
  const { pares } = emparejarPrecios([item(1, 'X-1', 4, 'NAT')], [linea('X-1', 4, 33, '')]);
  assert.equal(pares.get(1).precioUnitario, 33);
});

test('dos ítems con la misma cantidad usan líneas distintas, no la misma dos veces', () => {
  const lineas = [linea('X-1', 5, 30), linea('X-1', 5, 40)];
  const { pares } = emparejarPrecios([item(1, 'X-1', 5), item(2, 'X-1', 5)], lineas);
  assert.deepEqual([pares.get(1).precioUnitario, pares.get(2).precioUnitario], [30, 40]);
});

test('la clave ignora espacios, tildes y mayúsculas: "EY 01" de la OP = "EY01" de la cotización', () => {
  assert.equal(claveItem('ELYSIAN-EY 01', 'NAT'), claveItem('ELYSIAN-EY01', 'nat '));
  assert.equal(claveItem('Sobre Baño 3', null), claveItem('SOBRE BAÑO 3', ''));
  assert.notEqual(claveItem('ELYSIAN-EY 01', 'NAT'), claveItem('ELYSIAN-EY 02', 'NAT'));
});

test('proveedores: reutiliza el existente si el nombre es igual o casi igual, y no confunde distintos', () => {
  const lista = [{ id: 1, nombre: 'MIRAGE' }, { id: 2, nombre: 'HARMONY' }, { id: 3, nombre: 'PROGRESS PROFILE' }];
  assert.equal(buscarProveedorParecido('MIRGAE', lista).id, 1, 'letras cambiadas de lugar');
  assert.equal(buscarProveedorParecido('Mirage', lista).id, 1);
  assert.equal(buscarProveedorParecido('HARMONI', lista).id, 2, 'un typo');
  assert.equal(buscarProveedorParecido('VITACER', lista), null);
  assert.equal(buscarProveedorParecido('PROGRESS', lista), null, 'nombre abreviado: no se asume que es el mismo');
});
