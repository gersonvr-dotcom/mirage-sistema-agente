import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugerirTipo, generarCsvClientes, parsearCsv, filasConTipo, generarSqlTipos } from '../src/services/tiposCliente.js';

test('sugerirTipo: palabras inequívocas dan confianza alta, pistas débiles media, nombres de persona nada', () => {
  const t = (n) => sugerirTipo(n)?.tipo ?? null;
  assert.equal(t('CONSTRUCTORA BUCKNOR CONSULTORES S.A'), 'constructora');
  assert.equal(t('NANKU BUILDERS'), 'constructora');
  assert.equal(t('V2 INGENIERIA'), 'constructora');
  assert.equal(t('CONSTRUTICA DISEÑO Y CONSTRUCION  LTDA'), 'constructora'); // gana la regla de constructora
  assert.equal(t('STUDIO OCTAVA'), 'arquitecto');
  assert.equal(t('WR ARQUITECTURA'), 'arquitecto');
  assert.equal(t('ZURCHER INTERIORS'), 'arquitecto');
  assert.equal(sugerirTipo('INMOBILIARIA  ALDEBARAN').confianza, 'media');
  assert.equal(t('MIRAGE'), 'interno');
  assert.equal(t('MIRAGE COSTA RICA'), null);
  assert.equal(t('JORGE OLLER'), null);
  assert.equal(t('EVCO'), null);
});

test('CSV: se genera, se vuelve a leer y solo las filas con tipo válido pasan', () => {
  const csv = generarCsvClientes([
    { id: 1, nombre: 'NANKU BUILDERS', ops: 1, m2: 50, tipo: null },
    { id: 2, nombre: 'INMOBILIARIA ALDEBARAN', ops: 1, m2: 218, tipo: null },
    { id: 3, nombre: 'EVCO; "grande"', ops: 3, m2: 22291, tipo: null },
    { id: 4, nombre: 'MIRAGE', ops: 7, m2: 15, tipo: 'interno' },
  ]);
  assert.ok(csv.startsWith('﻿id;nombre'));
  const filas = parsearCsv(csv);
  assert.equal(filas.length, 4);
  assert.equal(filas[0].tipo, 'constructora'); // alta: prellenado
  assert.equal(filas[1].tipo, ''); // media: solo sugerido
  assert.equal(filas[1].sugerido, 'desarrollador');
  assert.equal(filas[2].nombre, 'EVCO; "grande"'); // comillas y ; sobreviven
  filas[1].tipo = 'Desarrollador';
  filas[2].tipo = 'cliente-raro';
  const { validas, errores } = filasConTipo(filas);
  assert.deepEqual(validas.map((v) => v.tipo), ['constructora', 'desarrollador', 'interno']);
  assert.equal(errores.length, 1);
  assert.match(errores[0], /no válido/);
});

test('parsearCsv acepta coma como separador y saltos de línea Windows', () => {
  const f = parsearCsv('nombre,tipo\r\nACME,constructora\r\n"B, S.A.",arquitecto\r\n');
  assert.deepEqual(f, [{ nombre: 'ACME', tipo: 'constructora' }, { nombre: 'B, S.A.', tipo: 'arquitecto' }]);
});

test('generarSqlTipos: UPDATE por nombre solo donde tipo IS NULL y con comillas escapadas', () => {
  const sql = generarSqlTipos([{ nombre: "O'BRIEN & CO", tipo: 'constructora' }], { fecha: '2026-10-29' });
  assert.match(sql, /UPDATE clientes SET tipo = 'constructora' WHERE nombre = 'O''BRIEN & CO' AND tipo IS NULL;/);
  assert.match(sql, /SET NAMES utf8mb4;/);
});
