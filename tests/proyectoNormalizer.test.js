import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarProyecto, basesSimilares, claveTexto } from '../src/services/proyectoNormalizer.js';

const n = normalizarProyecto;

test('separa sufijos de adicional/perfiles de la obra (casos reales ALESTE 137)', () => {
  assert.deepEqual(
    ['ALESTE 137', 'ALESTE 137 ADICIONAL', 'ALESTE 137 PERFIL', 'ALESTE 137 PERFILES'].map((x) => n(x).baseKey),
    ['ALESTE 137', 'ALESTE 137', 'ALESTE 137', 'ALESTE 137']
  );
  assert.equal(n('ALESTE 137').tipoPedido, 'principal');
  assert.equal(n('ALESTE 137 ADICIONAL').tipoPedido, 'adicional');
  assert.equal(n('ALESTE 137 PERFILES').tipoPedido, 'perfiles');
});

test('tolera el typo ADICIOANAL', () => {
  const r = n('CASA 14E ADICIOANAL');
  assert.equal(r.nombreBase, 'CASA 14E');
  assert.equal(r.tipoPedido, 'adicional');
});

test('DPS CAFETERIA no se confunde con DPS (CAFETERIA no es sufijo)', () => {
  assert.equal(n('DPS CAFETERIA ADICIONAL').baseKey, 'DPS CAFETERIA');
  assert.equal(n('DPS CAFETERIA').baseKey, 'DPS CAFETERIA');
  assert.equal(n('DPS ADICIONAL').baseKey, 'DPS');
  assert.notEqual(n('DPS CAFETERIA').baseKey, n('DPS').baseKey);
});

test('sufijos "otro": enchapes, stock, actualización, sobres', () => {
  assert.equal(n('C85 ENCHAPES').baseKey, 'C85');
  assert.equal(n('C85 ENCHAPES').tipoPedido, 'otro');
  assert.equal(n('CASA INARA SOBRES').baseKey, 'CASA INARA');
});

test('adicional gana sobre otros sufijos cuando hay varios', () => {
  assert.equal(n('C85 ENCHAPES ADICIONAL').tipoPedido, 'adicional');
  assert.equal(n('C85 ENCHAPES ADICIONAL').baseKey, 'C85');
});

test('nombres hechos solo de sufijos no quedan vacíos', () => {
  assert.equal(n('STOCK ADICIONAL').baseKey, 'STOCK');
  assert.equal(n('STOCK ADICIONAL').tipoPedido, 'adicional');
  assert.equal(n('ADICIONAL').baseKey, 'ADICIONAL');
  assert.equal(n('ADICIONAL').tipoPedido, 'principal');
});

test('guiones y espacios no separan una misma obra', () => {
  assert.equal(n('CASA VOLIO- FEDERSPIEL').baseKey, n('CASA VOLIO FEDERSPIEL ADICIONAL').baseKey);
});

test('conserva las tildes en el nombre a mostrar pero no en la clave', () => {
  const r = n('ENRIQUE MUÑOZ ADICIONAL');
  assert.equal(r.nombreBase, 'ENRIQUE MUÑOZ');
  assert.equal(r.baseKey, 'ENRIQUE MUNOZ');
});

test('PAREDES no se separa: puede ser una fase distinta', () => {
  assert.notEqual(
    n('RESIDENCIA LOS REYES LOTE 8 PAREDES').baseKey,
    n('RESIDENCIA LOS REYES LOTE 8 ACTUALIZACION').baseKey
  );
});

test('aliasKey es la clave del nombre completo', () => {
  assert.equal(n('ALESTE 137 PERFIL').aliasKey, claveTexto('ALESTE 137 PERFIL'));
});

test('basesSimilares: typos sí, números distintos no', () => {
  assert.equal(basesSimilares('RESIDENCIA RIGHETTI', 'RESIDENCIA RIGUETTI'), true);
  assert.equal(basesSimilares('CASA 14E', 'CASA 14F'), false);
  assert.equal(basesSimilares('ALESTE 137', 'ALESTE 138'), false);
  assert.equal(basesSimilares('SOLARIS 402', 'SOLARIS 403'), false);
  assert.equal(basesSimilares('MARIANA VALVERDE', 'MARIANA VALVERDE ORTUNO'), false);
  assert.equal(basesSimilares('ABC', 'ABD'), false);
});
