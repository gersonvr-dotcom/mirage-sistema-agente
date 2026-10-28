import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db/pool.js';
import { ejecutarTool } from '../src/agent/tools.js';
import { candidatosNumeroOP, filtrarPorNombre, compactarLectura, MAX_LINEAS_POR_DOCUMENTO } from '../src/services/documentosAgente.js';

after(() => pool.end());

test('candidatosNumeroOP acepta las formas habituales de escribir una OP', () => {
  assert.ok(candidatosNumeroOP('OP 2026-1').includes('2026-001'));
  assert.ok(candidatosNumeroOP('op-2026-001').includes('2026-001'));
  assert.ok(candidatosNumeroOP('2026001').includes('2026-001'));
  assert.ok(candidatosNumeroOP('2026-065-A').includes('2026-065-A'));
  assert.deepEqual(candidatosNumeroOP('OP-4521')[0], 'OP-4521');
  assert.deepEqual(candidatosNumeroOP('  '), []);
  assert.deepEqual(candidatosNumeroOP(undefined), []);
});

test('filtrarPorNombre filtra sin distinguir mayúsculas y sin texto devuelve todo', () => {
  const docs = [{ nombre_archivo: 'PI 72018 OP 2026-006-A.PDF' }, { nombre_archivo: 'PI 34577 OP 2026-006.PDF' }];
  assert.equal(filtrarPorNombre(docs, '72018').length, 1);
  assert.equal(filtrarPorNombre(docs, 'pi ').length, 2);
  assert.equal(filtrarPorNombre(docs, '').length, 2);
  assert.equal(filtrarPorNombre(docs, 'zzz').length, 0);
});

const registro = (n, estado = 'verificada') => ({
  extraccion: {
    proveedor: 'MIRAGE', numero_documento: '22703', fecha: null, moneda: 'EUR', incoterm: 'EXW',
    lineas: Array.from({ length: n }, (_, i) => ({ codigo: `C${i}`, descripcion: 'X'.repeat(100), acabado: null, formato: '60X120', unidad: 'M2', cantidad: 4.32, cajas: 3, m2: 4.32, precio_unitario: 18.26, importe: 78.88, es_cargo: false })),
    totales: { cajas: 3, m2: 4.32, importe: null },
  },
  validacion: { estado, avisos: Array.from({ length: 9 }, (_, i) => `aviso ${i}`) },
});

test('compactarLectura quita nulos, acota líneas, descripciones y avisos', () => {
  const c = compactarLectura(registro(MAX_LINEAS_POR_DOCUMENTO + 5), { nombre_archivo: 'PI.PDF', web_url: 'https://x/pi' });
  assert.equal(c.lineas.length, MAX_LINEAS_POR_DOCUMENTO);
  assert.equal(c.lineas_omitidas, 5);
  assert.equal(c.lineas[0].descripcion.length, 60);
  assert.ok(!('acabado' in c.lineas[0]) && !('es_cargo' in c.lineas[0]));
  assert.ok(!('fecha' in c) && !('importe' in c.totales));
  assert.equal(c.avisos.length, 5);
  assert.equal(c.enlace, 'https://x/pi');
  assert.ok(!('nota' in c));
});

test('compactarLectura advierte cuando la lectura no está verificada', () => {
  assert.match(compactarLectura(registro(1, 'requiere_revision'), { nombre_archivo: 'a' }).nota, /NO cuadran/);
  assert.match(compactarLectura(registro(1, 'sin_control'), { nombre_archivo: 'a' }).nota, /no trae totales/);
});

test('leer_documento_op responde sin_permiso al operador y a quien no trae contexto', async () => {
  for (const ctx of [{ rol: 'operador' }, {}, undefined]) {
    const r = await ejecutarTool('leer_documento_op', { numero_op: '2026-001' }, ctx);
    assert.equal(r.error, 'sin_permiso');
  }
});

test('listar_documentos_op: el operador no puede pedir tipos con costos y valida el tipo', async () => {
  const r = await ejecutarTool('listar_documentos_op', { numero_op: '2026-001', tipo: 'pi' }, { rol: 'operador' });
  assert.equal(r.error, 'sin_permiso');
  const r2 = await ejecutarTool('listar_documentos_op', { numero_op: '2026-001', tipo: 'inventado' }, { rol: 'administrador' });
  assert.match(r2.error, /Tipo de documento inválido/);
});
