import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { extraerOP } from '../src/services/opFolders.js';

// Hojas sintéticas (sin datos de clientes) con la disposición del OP-XXXX.xlsx: encabezado con rótulos, tabla que
// arranca en la fila "LINEA" y termina en "TOTALES"; columnas C línea, F código, G acabado, H formato, J cajas,
// K m²/caja, L total, M unidad, N notas.
function hoja(filas) {
  const ws = new ExcelJS.Workbook().addWorksheet('OP');
  for (const [coord, valor] of Object.entries(filas)) ws.getCell(coord).value = valor;
  return ws;
}
const ENC = { C: 'LINEA', F: 'CODIGO', G: 'ACABADO', H: 'FORMATO', J: 'CAJAS', K: 'M2 X CAJA', L: 'TOTAL', M: 'U. MEDIDA', N: 'NOTAS' };
const linea = (n, c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [`${k}${n}`, v]));

test('extrae cotización, fábrica y líneas hasta TOTALES', () => {
  const ws = hoja({
    B3: 'Cotización:', D3: '2099-001-XX',
    B4: 'Fábrica:', D4: 'MIRAGE',
    ...linea(8, ENC),
    ...linea(9, { C: 'SERIEX', F: 'SX01', G: 'NAT', H: '60X120X9', J: 3, K: 1.44, L: 4.32, M: 'M2', N: 'STOCK' }),
    ...linea(10, { C: 'SERIEX', F: 'SX02', G: 'SP', H: '80X80X9', J: 10, K: 1.28, L: 12.8, M: 'M2' }),
    ...linea(11, { C: 'TOTALES', L: 17.12 }),
    ...linea(12, { C: 'NO DEBE LEERSE', L: 99, M: 'M2' }),
  });
  const op = extraerOP(ws);
  assert.equal(op.numeroCotizacion, '2099-001-XX');
  assert.equal(op.fabrica, 'MIRAGE');
  assert.equal(op.lineas.length, 2);
  assert.deepEqual(op.lineas[0], { lineaCatalogo: 'SERIEX', codColor: 'SX01', acabado: 'NAT', formato: '60X120X9', cajas: 3, m2xCaja: 1.44, total: 4.32, unidadMedida: 'M2', notas: 'STOCK' });
  assert.equal(op.lineas[1].notas, null);
});

test('fábrica con rótulo combinado repetido, sin tilde y sin valor', () => {
  const combinado = extraerOP(hoja({ B4: 'Fábrica:', C4: 'Fábrica:', D4: 'HARMONY', ...linea(8, ENC) }));
  assert.equal(combinado.fabrica, 'HARMONY');
  assert.equal(extraerOP(hoja({ B4: 'FABRICA', C4: 'VITACER', ...linea(8, ENC) })).fabrica, 'VITACER');
  assert.equal(extraerOP(hoja({ B4: 'Fábrica:', ...linea(8, ENC) })).fabrica, null);
  assert.equal(extraerOP(hoja({ B4: 'Cliente:', C4: 'X', ...linea(8, ENC) })).fabrica, null);
});

test('sin fila LINEA no hay líneas; se saltan filas sin línea o sin total y se corta en la primera fila vacía', () => {
  assert.deepEqual(extraerOP(hoja({ B3: 'Cotización', D3: '2099-002' })).lineas, []);
  const ws = hoja({
    ...linea(8, ENC),
    ...linea(9, { C: 'SERIEX', F: 'SX01', H: '60X60', L: 5, M: 'M2' }),
    ...linea(10, { F: 'SX02', L: 7 }), // sin línea de catálogo: se salta
    ...linea(11, { C: 'SERIEX', F: 'SX03', H: '60X60' }), // sin total: se salta
    ...linea(12, { C: 'SERIEX', F: 'SX04', L: '12.5', M: 'ML' }), // total guardado como texto
    ...linea(14, { C: 'DESPUES DE UN HUECO', L: 1 }),
  });
  const op = extraerOP(ws);
  assert.deepEqual(op.lineas.map((l) => l.codColor), ['SX01', 'SX04']);
  assert.equal(op.lineas[1].total, 12.5);
});
