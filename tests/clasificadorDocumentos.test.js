import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasificarDocumento, extensionDe, TIPOS_DOCUMENTO } from '../src/services/clasificadorDocumentos.js';

const casos = [
  // [nombre, tipo esperado] — nombres sintéticos con los mismos patrones que las carpetas reales
  ['PI 22703 OP 2025-001.PDF', 'pi'],
  ['pi 21651 op 2026-004.pdf', 'pi'],
  ['PROFORMA 123.pdf', 'pi'],
  ['FAC 3075.pdf', 'factura'],
  ['FACTURA 3118 CLIENTE.pdf', 'factura'],
  ['NC 458.pdf', 'nota_credito'],
  ['NOTA DE CRÉDITO 12.pdf', 'nota_credito'],
  ['BOLETA DE ENTREGA 2026-001.xlsx', 'boleta'],
  ['BOLETA 2026-001.jpeg', 'boleta'],
  ['OP-2026-001-CLIENTE.pdf', 'op'],
  ['OP 2026-002 CLIENTE.xlsx', 'op'],
  ['2026-045-AN-CLIENTE-OBRA.xlsx', 'cotizacion'],
  ['2025-355-AA-CLIENTE ACTUALIZADA.pdf', 'cotizacion'],
  ['COTIZACION FIRMADA.pdf', 'cotizacion'],
  ['VALIDACIÓN DE CANCELACIÓN.pdf', 'pago'],
  ['VALIDACION DE ADELANTO #3.pdf', 'pago'],
  ['PAGO ADELANTO CLIENTE.pdf', 'pago'],
  ['COMPROBANTE DE PAGO.jpeg', 'pago'],
  ['REC 655-CLIENTE.pdf', 'pago'],
  ['OC 10573 PORCELANATOS ITALIANOS.pdf', 'orden_compra'],
  ['ORDENES DE COMPRA.pdf', 'orden_compra'],
  ['OC-2026-MIRAGE.pdf', 'orden_compra'],
  ['WhatsApp Image 2026-03-04 at 1.10.19 PM.jpeg', 'imagen'],
  ['RESPALDO DE ACABADO.jpg', 'imagen'],
  ['PHOTO-2026-03-04.jpg', 'imagen'],
  ['[Untitled].pdf', 'otro'],
  ['2896-CLIENTE.pdf', 'otro'],
  ['Contrato 123 - Mirage.pdf', 'otro'],
];

for (const [nombre, esperado] of casos) {
  test(`clasifica "${nombre}" como ${esperado}`, () => {
    assert.equal(clasificarDocumento(nombre), esperado);
  });
}

test('"PIEZAS" no se confunde con una PI, y "OPCIONES" no es una OP', () => {
  assert.notEqual(clasificarDocumento('PIEZAS ESPECIALES.pdf'), 'pi');
  assert.notEqual(clasificarDocumento('OPCIONES DE COLOR.pdf'), 'op');
});

test('un PDF dentro de una subcarpeta PROFORMA es una PI aunque su nombre no lo diga', () => {
  assert.equal(clasificarDocumento('2026-116.pdf', { subcarpeta: 'PROFORMA DEL 2026-116' }), 'pi');
  assert.equal(clasificarDocumento('2026-116.xlsx', { subcarpeta: 'PROFORMA DEL 2026-116' }), 'otro');
});

test('siempre devuelve uno de los tipos conocidos y extensionDe normaliza', () => {
  for (const [nombre] of casos) assert.ok(TIPOS_DOCUMENTO.includes(clasificarDocumento(nombre)));
  assert.equal(extensionDe('A.PDF'), 'pdf');
  assert.equal(extensionDe('sin_extension'), '');
});
