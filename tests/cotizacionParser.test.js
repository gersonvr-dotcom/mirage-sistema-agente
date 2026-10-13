import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { extraerCotizacion } from '../src/services/cotizacionFolders.js';

// Hojas sintéticas (sin datos de clientes) que reproducen las variantes observadas en cotizaciones reales.
function hoja(filas) {
  const ws = new ExcelJS.Workbook().addWorksheet('Hoja1');
  for (const [coord, valor] of Object.entries(filas)) ws.getCell(coord).value = valor;
  return ws;
}

const ENC_ESTANDAR = {
  B: 'ÁREA', C: 'FÁBRICA', D: 'LINEA/COLECCIÓN', E: 'CÓDIGO ', F: 'ACABADO', G: 'FORMATO ', H: 'CANTIDAD',
  I: 'DESPERDICIO 5%', J: 'TOTAL CON DESPEDICIO ', K: 'U. MEDIDA', L: 'M2 POR CAJA/PZ', M: 'REDONDEO',
  N: 'TOTAL DE CAJAS  / PZ', O: 'M2/PZ FINALES', P: 'PRECIO MATERIAL ', Q: 'TOTAL',
};
const fila = (n, cols) => Object.fromEntries(Object.entries(cols).map(([c, v]) => [`${c}${n}`, v]));

test('plantilla estándar: líneas, precios, pie completo, moneda, anticipo, fecha y número', () => {
  const ws = hoja({
    ...fila(12, { A: 'COTIZACIÓN N°', E: 'FECHA' }),
    ...fila(13, { A: '2099-001-XX', E: new Date('2099-01-15T00:00:00Z') }),
    ...fila(18, ENC_ESTANDAR),
    ...fila(19, { A: 1, C: 'MIRAGE', D: 'SERIEX', E: 'SX01', F: 'NAT', G: '60X120X9', H: 3, K: 'M2', O: 4.32, P: 46, Q: 198.72 }),
    ...fila(20, { A: 2, C: 'MIRAGE', D: 'SERIEX', E: 'SX02', F: 'NAT', G: '80X80X9', H: 10, K: 'M2', O: 10.24, P: 50, Q: 512 }),
    ...fila(21, { A: 'FORMA DE PAGO', P: 'GRAN TOTAL', Q: 710.72 }),
    ...fila(22, { D: ' MONEDA', E: 'ANTICIPO' }),
    ...fila(23, { D: 'DOLARES', E: 0.5, P: 'DESCUENTO', Q: 49.7504 }),
    ...fila(24, { P: 'SUBTOTAL', Q: 660.9696 }),
    ...fila(25, { P: 'I.V.A 13%', Q: 85.9260 }),
    ...fila(26, { P: 'VALOR TOTAL', Q: 746.8956 }),
  });
  const c = extraerCotizacion(ws, '2099-001-XX-CLIENTE-OBRA.xlsx');
  assert.equal(c.numeroCotizacion, '2099-001-XX');
  assert.equal(c.fecha, '2099-01-15');
  assert.equal(c.moneda, 'USD');
  assert.equal(c.anticipoPct, 50);
  assert.equal(c.lineas.length, 2);
  assert.deepEqual(
    { l: c.lineas[0].lineaCatalogo, cod: c.lineas[0].codColor, ac: c.lineas[0].acabado, f: c.lineas[0].formato, p: c.lineas[0].precioUnitario, i: c.lineas[0].importe, cf: c.lineas[0].cantidadFinal, u: c.lineas[0].unidad, fab: c.lineas[0].fabrica },
    { l: 'SERIEX', cod: 'SX01', ac: 'NAT', f: '60X120X9', p: 46, i: 198.72, cf: 4.32, u: 'M2', fab: 'MIRAGE' }
  );
  assert.deepEqual(c.pie, { granTotal: 710.72, descuento: 49.7504, subtotal: 660.9696, iva: 85.926, transporte: null, valorTotal: 746.8956 });
  assert.deepEqual(c.advertencias, []);
});

test('encabezado en otra fila y sin tildes; el corte es GRAN TOTAL aunque la fila de pago traiga números', () => {
  const ws = hoja({
    ...fila(14, { B: 'AREA', C: 'FABRICA', D: 'LINEA/COLECCIÓN', E: 'CODIGO', F: 'ACABADO', G: 'FORMATO', H: 'CANTIDAD', K: 'U. MEDIDA', O: 'M2/PZ FINALES', P: 'PRECIO MATERIAL', Q: 'TOTAL' }),
    ...fila(15, { A: 1, B: 'SNACK BAR', C: 'MIRAGE', D: 'PALMIRA', E: 'PB 04', G: '120X120X9', H: 138, K: 'M2', O: 161.28, P: 39, Q: 6289.92 }),
    ...fila(16, { A: 2, B: 'YOGA DECK', C: 'HARMONY', D: 'SAMIRA', E: 'GREEN Q45', G: '6X24', H: 12.5, K: 'M2', O: 14.5, P: 55, Q: 797.5 }),
    // fila de pago con valores numéricos (50%) en lugar del texto "FORMA DE PAGO"
    ...fila(17, { A: 0.5, B: 0.5, C: 0.5, D: 0.5, E: 0.5, G: 0.5, P: 'GRAN TOTAL', Q: 7087.42 }),
  });
  const c = extraerCotizacion(ws, '2099-002-AA-X.xlsx');
  assert.equal(c.lineas.length, 2);
  assert.equal(c.lineas[1].fabrica, 'HARMONY');
  assert.equal(c.pie.granTotal, 7087.42);
  assert.equal(c.sumaLineas, 7087.42);
  assert.equal(c.numeroCotizacion, '2099-002-AA', 'sin celda de número usa el prefijo del nombre del archivo');
  assert.ok(!c.advertencias.some((a) => a.includes('GRAN TOTAL')));
});

test('variante PRECIO MO: salta filas de sección y de plantilla vacía; ítems a medida van como descripción', () => {
  const merged = (n, texto) => Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'G', 'H', 'K', 'O', 'P', 'Q'].map((c) => [`${c}${n}`, texto]));
  const ws = hoja({
    ...fila(18, { B: 'AREA', C: 'FABRICA', D: 'MODELO', E: 'CODIGO', G: 'FORMATO (CM)', H: '*CANTIDAD', K: 'UNIDAD', O: 'M2/PZ FINALES', P: 'PRECIO MO', Q: 'TOTAL' }),
    ...merged(19, 'PISOS'),
    ...fila(20, { A: 1, C: 'MIRAGE', D: 'SOBRE BAÑO 3', E: 'SOBRE BAÑO 3', G: 'SOBRE BAÑO 3', H: 1, K: 'UNIDAD', O: 1, P: 1036, Q: 1036 }),
    ...fila(21, { A: 9, C: 'MIRAGE', K: 'M2' }),
    ...merged(22, 'RODAPIE'),
    ...fila(23, { A: 2, C: 'MIRAGE', D: 'MUEBLE BAÑO VI', E: 'MUEBLE BAÑO VI', G: 'MUEBLE BAÑO VI', H: 1, K: 'UNIDAD', O: 1, P: 1236, Q: 1236 }),
    ...fila(24, { P: 'GRAN TOTAL', Q: 2272 }),
  });
  const c = extraerCotizacion(ws, '2099-003-AN-X.xlsx');
  assert.equal(c.lineas.length, 2);
  assert.equal(c.lineas[0].descripcion, 'SOBRE BAÑO 3');
  assert.equal(c.lineas[0].lineaCatalogo, null);
  assert.equal(c.lineas[0].codColor, null);
  assert.equal(c.lineas[0].formato, null);
  assert.equal(c.lineas[0].conceptoPrecio, 'mano_obra');
  assert.equal(c.lineas[0].unidad, 'UNIDAD');
  assert.equal(c.pie.granTotal, 2272);
});

test('advierte si el GRAN TOTAL no coincide con la suma de las líneas o falta la moneda', () => {
  const ws = hoja({
    ...fila(16, ENC_ESTANDAR),
    ...fila(17, { A: 1, D: 'SERIEX', E: 'SX01', H: 1, K: 'M2', O: 1, P: 10, Q: 10 }),
    ...fila(18, { P: 'GRAN TOTAL', Q: 99 }),
  });
  const c = extraerCotizacion(ws, '2099-004-AA-X.xlsx');
  assert.ok(c.advertencias.some((a) => a.includes('GRAN TOTAL')));
  assert.ok(c.advertencias.some((a) => a.includes('moneda')));
  assert.equal(c.moneda, null);
});

test('sin encabezado de precios devuelve un error claro', () => {
  const c = extraerCotizacion(hoja({ A1: 'hola' }), 'x.xlsx');
  assert.match(c.error, /encabezado de precios/);
});

test('pie con TRANSPORTE e IVA exonerado: el VALOR TOTAL cuadra con subtotal + transporte', () => {
  const ws = hoja({
    ...fila(16, ENC_ESTANDAR),
    ...fila(17, { A: 1, D: 'SERIEX', E: 'SX01', H: 1, K: 'M2', O: 1, P: 100, Q: 100 }),
    ...fila(18, { P: 'GRAN TOTAL', Q: 100 }),
    ...fila(19, { P: 'DESCUENTO', Q: 5 }),
    ...fila(20, { P: 'SUBTOTAL', Q: 95 }),
    ...fila(21, { P: 'TRANSPORTE', Q: 1300 }),
    ...fila(22, { P: 'I.V.A 13%', Q: 'EXONERADO' }),
    ...fila(23, { P: 'VALOR TOTAL', Q: 1395 }),
  });
  const c = extraerCotizacion(ws, '2099-005-AA-X.xlsx');
  assert.equal(c.pie.transporte, 1300);
  assert.equal(c.pie.iva, 0);
  assert.equal(c.pie.valorTotal, 1395);
  assert.ok(!c.advertencias.some((a) => a.includes('VALOR TOTAL')));
});

test('advierte si el VALOR TOTAL no cuadra con subtotal + transporte + IVA', () => {
  const ws = hoja({
    ...fila(16, ENC_ESTANDAR),
    ...fila(17, { A: 1, D: 'SERIEX', E: 'SX01', H: 1, K: 'M2', O: 1, P: 100, Q: 100 }),
    ...fila(18, { P: 'GRAN TOTAL', Q: 100 }),
    ...fila(19, { P: 'SUBTOTAL', Q: 100 }),
    ...fila(20, { P: 'VALOR TOTAL', Q: 150 }),
  });
  assert.ok(extraerCotizacion(ws, 'x.xlsx').advertencias.some((a) => a.includes('VALOR TOTAL')));
});

test('SUBTOTAL después del TRANSPORTE (ya lo incluye) también cuadra: el total es gran total - descuento + transporte + IVA', () => {
  const ws = hoja({
    ...fila(16, ENC_ESTANDAR),
    ...fila(17, { A: 1, D: 'SERIEX', E: 'SX01', H: 1, K: 'M2', O: 1, P: 3787.48, Q: 3787.48 }),
    ...fila(18, { P: 'GRAN TOTAL', Q: 3787.48 }),
    ...fila(19, { P: 'TRANSPORTE', Q: 1280 }),
    ...fila(20, { P: 'SUBTOTAL', Q: 5067.48 }),
    ...fila(21, { P: 'I.V.A 13%', Q: 658.77 }),
    ...fila(22, { P: 'VALOR TOTAL', Q: 5726.25 }),
  });
  const c = extraerCotizacion(ws, '2099-006-AN-X.xlsx');
  assert.equal(c.pie.transporte, 1280);
  assert.equal(c.pie.valorTotal, 5726.25);
  assert.ok(!c.advertencias.some((a) => a.includes('VALOR TOTAL')));
});
