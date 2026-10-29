import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararPiConOp, esPiComplementaria, claveColor, claveFormato, claveAcabado, mismoProveedor } from '../src/services/validarPi.js';

const op = (codigo, acabado, formato, cajas, m2, proveedor = 'MIRAGE', unidad = 'M2') => ({ codigo, acabado, formato, cajas, cantidad: m2, unidad, proveedor });
const lPI = (descripcion, formato, cajas, m2, extra = {}) => ({ codigo: 'X', descripcion, acabado: null, formato, unidad: 'M2', cantidad: m2, cajas, m2, precio_unitario: 10, importe: 10, es_cargo: false, ...extra });
const pi = (documento, lineas, extra = {}) => ({
  documento,
  extraccion: { tipo_documento: 'proforma_invoice', proveedor: 'MIRAGE GRANITO CERAMICO S.p.A.', moneda: 'EUR', lineas, totales: {} },
  validacion: { estado: 'verificada', avisos: [] },
  ...extra,
});

// OP 2026-006 (datos reales): la PI suma líneas de la OP y hay una segunda PI parcial con material que la OP no tiene.
const OP_006 = [
  op('ELYSIAN-EY 02', 'NAT', '60X120X9', 194, 279.36),
  op('OUDH-OU 03', 'SP', '20X120X9', 118, 169.92),
  op('MOTLEY-MT 03', 'ST', '60X60X20MM', 229, 164.88),
  op('MOTLEY-MT 03', 'ST', '60X120X20MM', 229, 164.88),
  op('ELYSIAN-EY 02', 'ST', '60X120X9', 118, 169.92),
  op('MOTLEY-MT 03', 'ST', '60X120X20MM', 28, 20.16),
  op('ELYSIAN-EY 02', 'NAT', '60X120X9', 31, 44.64),
];
const PI_PRINCIPAL = () =>
  pi('PI 34577 OP 2026-006.PDF', [
    lPI('EY 02 NAT SQ 60X120 60X120X9', '60X120', 225, 324),
    lPI('OU 03 SP SQ 20X120 20X120X9', '20X120', 118, 169.92),
    lPI('MT 03 ST SQ 60 20MM 60X60X20', '60X60X20', 229, 164.88),
    lPI('MT 03 ST SQ 120 2CM 60X120X20', '60X120X20', 257, 185.04),
    lPI('EY 02 ST SQ 60X120 60X120X9', '60X120', 118, 169.92),
  ]);
const PI_A = () => pi('PI 72018 OP 2026-006-A.PDF', [lPI('EY 02 SP SQ 120', '120X120X9', 10, 28.8)]);

const grupo = (r, color, formato, acabado) => r.grupos.find((g) => g.color === color && g.formato === formato && (acabado === undefined || g.acabado === acabado));

test('claves: color, formato y acabado se normalizan', () => {
  assert.equal(claveColor('EY 02 NAT SQ 60X120'), 'EY02');
  assert.equal(claveColor('SOLARIS CONCH EY 01 NAT SQ'), 'EY01');
  assert.equal(claveColor('MAND-MD 03 DAWN'), 'MD03');
  assert.equal(claveColor('JEWELS 2.0-JW 03'), 'JW03');
  assert.equal(claveColor('CHARGE PACKAGING CASSA 160X320'), null);
  assert.equal(claveFormato('60X120X9'), '60X120');
  assert.equal(claveFormato('120X60'), '60X120');
  assert.equal(claveFormato('60X60X20MM'), '60X60');
  assert.equal(claveFormato('60X60 (ESPESOR QUE INDIQUE FABRICA)'), '60X60');
  assert.equal(claveFormato('MALLA 36T 30X30'), '30X30');
  assert.equal(claveFormato('60X119.7'), '60X120');
  assert.equal(claveAcabado('NAT SQ'), 'NAT');
  assert.equal(claveAcabado('NAT (R10)'), 'NAT');
  assert.equal(claveAcabado('GP'), 'GRIP');
  assert.equal(claveAcabado('SLK'), 'SILK');
  assert.equal(claveAcabado(null), null);
  assert.ok(mismoProveedor('MIRAGE', 'MIRAGE GRANITO CERAMICO S.p.A.'));
  assert.ok(!mismoProveedor('HARMONY', 'MIRAGE GRANITO CERAMICO S.p.A.'));
  assert.ok(!mismoProveedor(null, 'MIRAGE'));
});

test('OP 2026-006: la PI principal suma las líneas de la OP y coincide', () => {
  const r = compararPiConOp({ itemsOP: OP_006, pis: [PI_PRINCIPAL()] });
  assert.equal(r.estado, 'coincide');
  assert.equal(r.resumen.ok, 5);
  const g = grupo(r, 'EY02', '60X120', 'NAT');
  assert.deepEqual([g.op.cajas, g.pi.cajas, g.op.lineas], [225, 225, 2]);
});

test('OP 2026-006 con la PI -A: es complementaria, no se suma y se avisa', () => {
  const r = compararPiConOp({ itemsOP: OP_006, pis: [PI_PRINCIPAL(), PI_A()] });
  assert.equal(r.estado, 'coincide');
  assert.equal(r.resumen.pis_utilizadas, 1);
  assert.deepEqual(r.pis_complementarias, ['PI 72018 OP 2026-006-A.PDF']);
  assert.ok(r.advertencias.some((a) => a.includes('complementarias')));
  // si el material de la PI principal no alcanza, la complementaria no lo tapa
  const corta = compararPiConOp({ itemsOP: OP_006.map((i, k) => (k === 6 ? { ...i, cajas: 60 } : i)), pis: [PI_PRINCIPAL(), PI_A()] });
  assert.notEqual(corta.estado, 'coincide');
});

test('PIs complementarias: reposición, reserva, adicional y sufijo de letra', () => {
  for (const nombre of ['PI 76413 REPOSICION OP 2026-048.PDF', 'PI 56577 RESERVA FEDE.PDF', 'PI 60257 OP 2026-065-E.PDF', 'PI 86648 OP 2026-065-A.PDF', 'PI 53870 2026-065 REPO ANDRE.PDF']) {
    assert.ok(esPiComplementaria({ documento: nombre, extraccion: {} }), nombre);
  }
  for (const nombre of ['PI 34577 OP 2026-006.PDF', 'PI 15458 OP 2026-187 (2).PDF', 'PI 71563 2026-106-V2 (1).PDF']) {
    assert.ok(!esPiComplementaria({ documento: nombre, extraccion: {} }), nombre);
  }
  // si todas lo parecen se comparan todas, con aviso
  const r = compararPiConOp({ itemsOP: OP_006, pis: [pi('PI 1 OP 2026-006-A.PDF', PI_PRINCIPAL().extraccion.lineas)] });
  assert.equal(r.estado, 'coincide');
  assert.ok(r.advertencias.some((a) => a.includes('Todas las PIs parecen complementarias')));
});

test('la misma PI dos veces en la carpeta se cuenta una vez; si difieren no hay coincidencia', () => {
  const base = PI_PRINCIPAL();
  const conNumero = (doc, lineas, num = '34577') => ({ ...pi(doc, lineas), extraccion: { ...pi(doc, lineas).extraccion, numero_documento: num } });
  const copia = compararPiConOp({ itemsOP: OP_006, pis: [base, { ...PI_PRINCIPAL(), documento: 'PI 34577 OP 2026-006 (1).PDF' }] });
  assert.equal(copia.estado, 'coincide');
  assert.equal(copia.resumen.pis_utilizadas, 1);
  assert.ok(copia.advertencias.some((a) => a.includes('copia')));
  // una copia mal leída (no cuadra con sus totales) no impide la coincidencia: es el mismo documento
  const mala = { ...PI_PRINCIPAL(), documento: 'PI 34577 OP 2026-006 (3).PDF', validacion: { estado: 'requiere_revision', avisos: [] } };
  assert.equal(compararPiConOp({ itemsOP: OP_006, pis: [base, mala] }).estado, 'coincide');
  // mismo número de documento y cantidades distintas: se excluye la segunda
  const a = conNumero('PI 78493 OP 2026-107.PDF', PI_PRINCIPAL().extraccion.lineas);
  const b = conNumero('PI 78493 otra.PDF', PI_PRINCIPAL().extraccion.lineas.map((l, i) => (i === 0 ? { ...l, cajas: 200 } : l)), '34577');
  a.extraccion.numero_documento = '34577';
  a.extraccion.totales = { cajas: 947 };
  b.extraccion.totales = { cajas: 922 };
  const r = compararPiConOp({ itemsOP: OP_006, pis: [a, b] });
  assert.notEqual(r.estado, 'coincide');
  assert.equal(r.pis_excluidas.length, 1);
});

test('un recibo o anticipo en la carpeta no es una PI y no impide la coincidencia; otro tipo de documento sí', () => {
  const recibo = pi('PROFORMA 2607_ADELANTO.pdf', [], { extraccion: { tipo_documento: 'recibo_o_pago', proveedor: 'KALA', lineas: [], totales: {} } });
  const r = compararPiConOp({ itemsOP: OP_006, pis: [PI_PRINCIPAL(), recibo] });
  assert.equal(r.estado, 'coincide');
  assert.ok(r.advertencias.some((a) => a.includes('recibo')));
  const otro = pi('algo.pdf', [], { extraccion: { tipo_documento: 'otro', proveedor: 'X', lineas: [], totales: {} } });
  assert.notEqual(compararPiConOp({ itemsOP: OP_006, pis: [PI_PRINCIPAL(), otro] }).estado, 'coincide');
});

test('formato 60X119.7 de la PI se empareja con 60X120 de la OP', () => {
  const r = compararPiConOp({
    itemsOP: [op('RO 03', 'SP', '60X120', 8, 11.52)],
    pis: [pi('PI 29982 OP 2026-020.PDF', [lPI('RO 03 SP SQ 60X119.7', '60X119.7', 8, 11.491)])],
  });
  assert.equal(r.estado, 'coincide');
});

test('cantidad alterada en la OP: nunca sale "coincide"', () => {
  for (const cajas of [32, 40, 20]) {
    const items = OP_006.map((i, k) => (k === 6 ? { ...i, cajas } : i));
    const r = compararPiConOp({ itemsOP: items, pis: [PI_PRINCIPAL()] });
    assert.notEqual(r.estado, 'coincide', `cajas=${cajas}`);
  }
  // OP pide 1 caja más que la PI: diferencia menor; 9 más: la PI cubre solo una parte
  const menor = compararPiConOp({ itemsOP: OP_006.map((i, k) => (k === 6 ? { ...i, cajas: 32 } : i)), pis: [PI_PRINCIPAL()] });
  assert.equal(grupo(menor, 'EY02', '60X120', 'NAT').estado, 'diferencia_menor');
  const parcial = compararPiConOp({ itemsOP: OP_006.map((i, k) => (k === 6 ? { ...i, cajas: 40 } : i)), pis: [PI_PRINCIPAL()] });
  assert.equal(grupo(parcial, 'EY02', '60X120', 'NAT').estado, 'parcial');
  assert.equal(parcial.estado, 'parcial');
  // OP pide MENOS que la PI: la PI excede la OP, nunca es "parcial"
  const exceso = compararPiConOp({ itemsOP: OP_006.map((i, k) => (k === 6 ? { ...i, cajas: 20 } : i)), pis: [PI_PRINCIPAL()] });
  assert.equal(grupo(exceso, 'EY02', '60X120', 'NAT').estado, 'diferencia');
  assert.equal(exceso.estado, 'con_diferencias');
});

test('cantidad alterada en la PI: se detecta', () => {
  const alterada = PI_PRINCIPAL();
  alterada.extraccion.lineas[1].cajas = 130; // OU 03: 118 en la OP
  const r = compararPiConOp({ itemsOP: OP_006, pis: [alterada] });
  assert.equal(r.estado, 'con_diferencias');
  assert.equal(grupo(r, 'OU03', '20X120').estado, 'diferencia');
  assert.equal(grupo(r, 'OU03', '20X120').delta_cajas, 12);
});

test('la tolerancia de cajas es configurable', () => {
  const items = [op('ELYSIAN-EY 02', 'NAT', '60X120X9', 10, 14.4)];
  const piMas1 = [pi('PI.PDF', [lPI('EY 02 NAT SQ 60X120', '60X120', 11, 15.84)])];
  assert.equal(grupo(compararPiConOp({ itemsOP: items, pis: piMas1 }), 'EY02', '60X120').estado, 'diferencia_menor');
  assert.equal(grupo(compararPiConOp({ itemsOP: items, pis: piMas1, toleranciaCajas: 0 }), 'EY02', '60X120').estado, 'diferencia');
  assert.equal(grupo(compararPiConOp({ itemsOP: items, pis: piMas1, toleranciaCajas: 2 }), 'EY02', '60X120').estado, 'diferencia_menor');
});

test('acabado distinto con mismo color y formato: se empareja y se marca para revisar', () => {
  const items = [op('JEWELS-JW14', 'NAT', '60X120X9', 58, 83.52)];
  const r = compararPiConOp({ itemsOP: items, pis: [pi('PI.PDF', [lPI('JW 14 SP SQ 60X120', '60X120', 58, 83.52)])] });
  const g = grupo(r, 'JW14', '60X120');
  assert.equal(g.revisar_acabado, true);
  assert.equal(g.acabado_pi, 'SP');
  assert.equal(g.estado, 'ok');
  assert.equal(r.estado, 'con_diferencias');
});

test('formato distinto: línea solo en la PI y línea solo en la OP', () => {
  const r = compararPiConOp({ itemsOP: [op('ELYSIAN-EY 02', 'NAT', '60X120X9', 10, 14.4)], pis: [pi('PI.PDF', [lPI('EY 02 NAT SQ 30X60', '30X60', 10, 1.8)])] });
  assert.equal(r.grupos.map((g) => g.estado).sort().join(), 'solo_en_op,solo_en_pi');
  assert.equal(r.estado, 'con_diferencias');
});

test('línea de la OP sin PI (PIs parciales aún por llegar) deja el estado en parcial', () => {
  const r = compararPiConOp({ itemsOP: OP_006, pis: [pi('PI.PDF', [PI_PRINCIPAL().extraccion.lineas[0]])] });
  assert.equal(r.estado, 'parcial');
  assert.equal(r.resumen.solo_en_op, 4);
  assert.equal(r.resumen.ok, 1);
});

test('los cargos de la PI (embalaje, flete) no cuentan como material', () => {
  const cargo = lPI('CHARGE PACKAGING CASSA 160X320', '160X320', null, null, { unidad: 'PZ', cantidad: 1, es_cargo: true });
  const r = compararPiConOp({ itemsOP: OP_006, pis: [{ ...PI_PRINCIPAL(), extraccion: { ...PI_PRINCIPAL().extraccion, lineas: [...PI_PRINCIPAL().extraccion.lineas, cargo] } }] });
  assert.equal(r.estado, 'coincide');
  assert.equal(r.sin_clave.length, 0);
});

test('solo se comparan las líneas de OP del proveedor de la PI', () => {
  const items = [...OP_006, op('PALMIRA-PB 04', 'NAT', '60X60', 20, 7.2, 'HARMONY')];
  const r = compararPiConOp({ itemsOP: items, pis: [PI_PRINCIPAL()] });
  assert.equal(r.estado, 'coincide');
  assert.ok(r.advertencias.some((a) => a.includes('7 de 8')));
});

test('PI sin cajas en una línea: compara por m² y no inventa una falta de cajas', () => {
  const items = [op('RECONCRETE-RO 04', 'SP', '60X60 (ESPESOR QUE INDIQUE FABRICA)', 148, 106.56), op('RECONCRETE-RO 04', 'SP', '60X60X8', 10, 14.4)];
  const r = compararPiConOp({ itemsOP: items, pis: [pi('PI.PDF', [lPI('RO 04 SP SQ 60 60X60X8', '60X60X8', 10, 14.4), lPI('RO 04 SP SOLFATO 60X60', '60X60', null, 106.56)])] });
  const g = grupo(r, 'RO04', '60X60');
  assert.equal(g.comparado_en, 'm2');
  assert.equal(g.estado, 'ok');
  assert.ok(!('cajas' in g.pi));
});

test('PI que no es proforma, con lectura dudosa o de otro formato: se excluye y el resultado no es "coincide"', () => {
  const recibo = pi('RECIBO.pdf', [lPI('ADELANTO', null, null, null)]);
  recibo.extraccion.tipo_documento = 'recibo_o_pago';
  const r1 = compararPiConOp({ itemsOP: OP_006, pis: [recibo] });
  assert.equal(r1.estado, 'no_concluyente');

  const dudosa = { ...PI_PRINCIPAL(), validacion: { estado: 'requiere_revision', avisos: ['x'] } };
  assert.equal(compararPiConOp({ itemsOP: OP_006, pis: [dudosa] }).estado, 'no_concluyente');

  const otroFormato = pi('PERONDA.pdf', [lPI('GLINT WHITE/5X15', '5X15', 65, 27.3)]);
  assert.equal(compararPiConOp({ itemsOP: OP_006, pis: [otroFormato] }).estado, 'no_concluyente');

  // Una PI dudosa o de otro formato junto a una válida impide declarar "coincide"
  const mezcla = compararPiConOp({ itemsOP: OP_006, pis: [PI_PRINCIPAL(), otroFormato] });
  assert.equal(mezcla.estado, 'no_concluyente', 'una PI excluida impide declarar "coincide"');
});

test('OP sin líneas o sin PIs: no concluyente', () => {
  assert.equal(compararPiConOp({ itemsOP: [], pis: [PI_PRINCIPAL()] }).estado, 'no_concluyente');
  assert.equal(compararPiConOp({ itemsOP: OP_006, pis: [] }).estado, 'no_concluyente');
});
